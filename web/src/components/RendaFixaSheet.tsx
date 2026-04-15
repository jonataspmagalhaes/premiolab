'use client';

// RendaFixaSheet — cadastra/edita renda fixa.
// Dois modos: Tesouro Direto (lista viva do /api/td-catalog) e RF Privada (CDB/LCI/LCA/CRI/CRA/Debênture).

import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { MoneyInput, parseMoneyValue } from '@/components/MoneyInput';
import { Button } from '@/components/ui/button';
import { getSupabaseBrowser } from '@/lib/supabase';
import { useAppStore } from '@/store';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { projetarRF } from '@/lib/rendaFixaCalc';
import { useMacroIndices } from '@/lib/useMacroIndices';
import { EmissorSearch } from '@/components/EmissorSearch';
import { canonicalEmissor } from '@/lib/emissoresRF';

var supabase = getSupabaseBrowser();

// tipo enum do schema: 'cdb', 'lci_lca', 'tesouro_ipca', 'tesouro_selic', 'tesouro_pre', 'debenture'
type TipoRF =
  | 'cdb' | 'lc'
  | 'lci_lca' | 'lci' | 'lca' | 'lig'
  | 'cri' | 'cra'
  | 'tesouro_ipca' | 'tesouro_selic' | 'tesouro_pre'
  | 'debenture' | 'debenture_incentivada'
  | 'poupanca';
type Indexador = 'pre' | 'cdi' | 'ipca' | 'selic';

interface TdTitulo {
  nome: string;
  tipo: 'tesouro_selic' | 'tesouro_ipca' | 'tesouro_pre';
  vencimento: string;
  ano: number;
  taxaCompra: number;
}

export interface RendaFixaInitial {
  id: string;
  tipo: TipoRF;
  emissor: string | null;
  taxa: number | null;
  indexador: Indexador | null;
  valor_aplicado: number;
  vencimento: string | null;
  corretora: string | null;
  portfolio_id: string | null;
}

interface Props {
  userId: string | undefined;
  initial?: RendaFixaInitial;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function RendaFixaSheet({ userId, initial, open: openProp, onOpenChange }: Props) {
  var saldos = useAppStore(function (s) { return s.saldos; });
  var qc = useQueryClient();
  var macro = useMacroIndices();
  var idx = { cdi: macro.data ? macro.data.cdi : 14.65, ipca: macro.data ? macro.data.ipca_12m : 4.14 };

  var contasBRL = saldos.filter(function (s) { return (s.moeda || 'BRL') === 'BRL'; });

  var isEdit = !!initial;
  var _openUncontrolled = useState(false);
  var open = openProp !== undefined ? openProp : _openUncontrolled[0];
  var setOpen = onOpenChange || _openUncontrolled[1];

  // Modo: TD pre-seleciona se initial tipo comeca com tesouro_*
  var inferModoFromInitial: 'td' | 'privada' = initial && (initial.tipo === 'tesouro_ipca' || initial.tipo === 'tesouro_selic' || initial.tipo === 'tesouro_pre') ? 'td' : 'privada';
  var _modo = useState<'td' | 'privada'>(isEdit ? inferModoFromInitial : 'td'); var modo = _modo[0]; var setModo = _modo[1];

  var _tdNome = useState<string>(initial ? (initial.emissor || '') : ''); var tdNome = _tdNome[0]; var setTdNome = _tdNome[1];
  var _tipoPriv = useState<TipoRF>(initial && initial.tipo !== 'tesouro_ipca' && initial.tipo !== 'tesouro_selic' && initial.tipo !== 'tesouro_pre' ? initial.tipo : 'cdb');
  var tipoPriv = _tipoPriv[0]; var setTipoPriv = _tipoPriv[1];
  var _indexadorPriv = useState<Indexador>(initial && initial.indexador ? initial.indexador : 'pre');
  var indexadorPriv = _indexadorPriv[0]; var setIndexadorPriv = _indexadorPriv[1];
  var _emissor = useState(initial ? (initial.emissor || '') : ''); var emissor = _emissor[0]; var setEmissor = _emissor[1];
  var _taxa = useState(initial && initial.taxa != null ? String(initial.taxa).replace('.', ',') : '');
  var taxa = _taxa[0]; var setTaxa = _taxa[1];
  var _valor = useState(initial ? String(initial.valor_aplicado).replace('.', ',') : '');
  var valor = _valor[0]; var setValor = _valor[1];
  var _vencimento = useState(initial && initial.vencimento ? initial.vencimento.substring(0, 10) : '');
  var vencimento = _vencimento[0]; var setVencimento = _vencimento[1];
  var _corretora = useState(initial && initial.corretora ? initial.corretora : '');
  var corretora = _corretora[0]; var setCorretora = _corretora[1];
  var _submitting = useState(false); var submitting = _submitting[0]; var setSubmitting = _submitting[1];
  var _err = useState<string | null>(null); var err = _err[0]; var setErr = _err[1];

  // Carrega catalogo TD (cache 6h server-side)
  var catalogQuery = useQuery<TdTitulo[]>({
    queryKey: ['td-catalog'],
    queryFn: async function () {
      var res = await fetch('/api/td-catalog');
      if (!res.ok) return [];
      var body = await res.json();
      return Array.isArray(body.titulos) ? body.titulos : [];
    },
    staleTime: 6 * 60 * 60 * 1000,
    enabled: open && modo === 'td',
  });

  // Se o TD nome selecionado mudar, preenche taxa e vencimento
  useEffect(function () {
    if (!tdNome || !catalogQuery.data) return;
    var t = catalogQuery.data.filter(function (x) { return x.nome === tdNome; })[0];
    if (!t) return;
    if (!taxa) setTaxa(String(t.taxaCompra).replace('.', ','));
    if (!vencimento) setVencimento(t.vencimento);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tdNome, catalogQuery.data]);

  function currentTipoForDb(): TipoRF {
    if (modo === 'td') {
      var t = (catalogQuery.data || []).filter(function (x) { return x.nome === tdNome; })[0];
      return t ? t.tipo : 'tesouro_selic';
    }
    return tipoPriv;
  }

  function currentIndexador(): Indexador {
    if (modo === 'td') {
      var t = currentTipoForDb();
      if (t === 'tesouro_selic') return 'selic';
      if (t === 'tesouro_ipca') return 'ipca';
      return 'pre';
    }
    return indexadorPriv;
  }

  function currentEmissor(): string {
    if (modo === 'td') return tdNome || 'Tesouro Nacional';
    return canonicalEmissor(emissor);
  }

  async function submit() {
    if (!userId) { setErr('Sessão inválida'); return; }
    if (modo === 'td' && !tdNome) { setErr('Selecione um título do Tesouro'); return; }
    if (modo === 'privada' && !emissor.trim()) { setErr('Emissor obrigatório'); return; }
    if (!corretora) { setErr('Selecione a corretora'); return; }

    var valorN = parseMoneyValue(valor);
    if (valorN === null || valorN <= 0) { setErr('Valor aplicado inválido'); return; }
    var taxaN = taxa ? parseFloat(taxa.replace(',', '.')) : null;
    if (taxa && (taxaN === null || isNaN(taxaN))) { setErr('Taxa inválida'); return; }
    if (!vencimento) { setErr('Vencimento obrigatório'); return; }

    setSubmitting(true); setErr(null);
    try {
      var payload: Record<string, unknown> = {
        user_id: userId,
        tipo: currentTipoForDb(),
        emissor: currentEmissor(),
        taxa: taxaN,
        indexador: currentIndexador(),
        valor_aplicado: valorN,
        vencimento: vencimento,
        corretora: corretora,
      };

      var result;
      if (isEdit && initial) {
        result = await supabase.from('renda_fixa').update(payload).eq('id', initial.id).eq('user_id', userId);
      } else {
        result = await supabase.from('renda_fixa').insert(payload);
      }

      if (result.error) {
        setErr(result.error.message);
        setSubmitting(false);
        return;
      }

      await qc.invalidateQueries({ queryKey: ['renda_fixa'] });
      await qc.invalidateQueries({ queryKey: ['transacoes'] });
      await qc.invalidateQueries({ queryKey: ['positions'] });
      await qc.invalidateQueries({ queryKey: ['saldos'] });
      setOpen(false);
    } catch (e: any) {
      setErr((e && e.message) || 'Erro ao salvar');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!isEdit || !initial || !userId) return;
    if (!confirm('Remover esta renda fixa? Ação irreversível.')) return;
    setSubmitting(true); setErr(null);
    try {
      var result = await supabase.from('renda_fixa').delete().eq('id', initial.id).eq('user_id', userId);
      if (result.error) { setErr(result.error.message); setSubmitting(false); return; }
      await qc.invalidateQueries({ queryKey: ['renda_fixa'] });
      await qc.invalidateQueries({ queryKey: ['transacoes'] });
      await qc.invalidateQueries({ queryKey: ['positions'] });
      await qc.invalidateQueries({ queryKey: ['saldos'] });
      setOpen(false);
    } catch (e: any) {
      setErr((e && e.message) || 'Erro ao remover');
    } finally {
      setSubmitting(false);
    }
  }

  var titulos = catalogQuery.data || [];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {!isEdit ? (
        <SheetTrigger
          render={
            <Button
              size="sm"
              className="bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/40"
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Nova RF
            </Button>
          }
        />
      ) : null}
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto bg-page border-l border-white/10">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Editar renda fixa' : 'Nova aplicação'}</SheetTitle>
          <p className="text-[11px] text-white/40 mt-1">
            Tesouro Direto ou RF privada (CDB, LCI/LCA, CRI/CRA, debênture).
          </p>
        </SheetHeader>

        <div className="px-4 py-5 space-y-4">
          <Field label="Modo">
            <div className="flex gap-1.5">
              {([
                { v: 'td', l: 'Tesouro Direto' },
                { v: 'privada', l: 'RF Privada' },
              ] as Array<{ v: 'td' | 'privada'; l: string }>).map(function (m) {
                var active = modo === m.v;
                return (
                  <button
                    key={m.v}
                    type="button"
                    onClick={function () { setModo(m.v); }}
                    className={'flex-1 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition ' +
                      (active ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40' : 'bg-white/[0.03] text-white/50 border border-white/[0.06] hover:bg-white/[0.06]')}
                  >
                    {m.l}
                  </button>
                );
              })}
            </div>
          </Field>

          {modo === 'td' ? (
            <Field label="Título">
              {catalogQuery.isLoading ? (
                <div className="text-[11px] text-white/40 font-mono animate-pulse">Carregando catálogo…</div>
              ) : titulos.length === 0 ? (
                <div className="rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-[11px] text-red-300">
                  Falha ao carregar catálogo. Use modo RF Privada.
                </div>
              ) : (
                <select
                  value={tdNome}
                  onChange={function (e) { setTdNome(e.target.value); setTaxa(''); setVencimento(''); }}
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:border-orange-500/40"
                >
                  <option value="">— selecione —</option>
                  {titulos.map(function (t) {
                    return <option key={t.nome + t.vencimento} value={t.nome}>{t.nome} · {t.taxaCompra.toFixed(2).replace('.', ',')}%</option>;
                  })}
                </select>
              )}
            </Field>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tipo">
                  <select
                    value={tipoPriv}
                    onChange={function (e) { setTipoPriv(e.target.value as TipoRF); }}
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:border-orange-500/40"
                  >
                    <optgroup label="Bancário">
                      <option value="cdb">CDB</option>
                      <option value="lc">LC (Letra de Câmbio)</option>
                      <option value="poupanca">Poupança</option>
                    </optgroup>
                    <optgroup label="Isentos (LCI/LCA/LIG)">
                      <option value="lci">LCI</option>
                      <option value="lca">LCA</option>
                      <option value="lig">LIG</option>
                    </optgroup>
                    <optgroup label="Crédito Privado">
                      <option value="cri">CRI</option>
                      <option value="cra">CRA</option>
                      <option value="debenture">Debênture</option>
                      <option value="debenture_incentivada">Debênture Incentivada</option>
                    </optgroup>
                  </select>
                </Field>
                <Field label="Indexador">
                  <select
                    value={indexadorPriv}
                    onChange={function (e) { setIndexadorPriv(e.target.value as Indexador); }}
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:border-orange-500/40"
                  >
                    <option value="pre">Pré-fixado</option>
                    <option value="cdi">% do CDI</option>
                    <option value="ipca">IPCA + juros</option>
                  </select>
                </Field>
              </div>
              <Field label="Emissor">
                <EmissorSearch
                  value={emissor}
                  onChange={setEmissor}
                  placeholder="Ex: Banco Inter, Vale, Petrobras"
                />
              </Field>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label={
              currentIndexador() === 'cdi' ? 'Taxa (% do CDI)' :
              currentIndexador() === 'ipca' ? 'Juros real (% acima do IPCA)' :
              currentIndexador() === 'selic' ? 'Spread sobre Selic (% a.a.)' :
              'Taxa (% a.a.)'
            }>
              <Input
                value={taxa}
                onChange={function (e) { setTaxa(e.target.value); }}
                placeholder={
                  currentIndexador() === 'cdi' ? '110' :
                  currentIndexador() === 'ipca' ? '6,50' :
                  currentIndexador() === 'selic' ? '0,05' :
                  '13,75'
                }
                inputMode="decimal"
              />
            </Field>
            <Field label="Vencimento">
              <Input
                type="date"
                value={vencimento}
                onChange={function (e) { setVencimento(e.target.value); }}
              />
            </Field>
          </div>

          <Field label="Valor aplicado (R$)">
            <MoneyInput value={valor} onChange={setValor} moeda="BRL" />
          </Field>

          <Field label="Corretora">
            {contasBRL.length === 0 ? (
              <div className="rounded-md bg-orange-500/10 border border-orange-500/30 px-3 py-2 text-[11px] text-orange-300">
                Nenhuma conta BRL. Cadastre em Caixa primeiro.
              </div>
            ) : (
              <select
                value={corretora}
                onChange={function (e) { setCorretora(e.target.value); }}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:border-orange-500/40"
              >
                <option value="">— selecione —</option>
                {contasBRL.map(function (s) {
                  return <option key={s.id || s.name} value={s.name}>{s.name}</option>;
                })}
              </select>
            )}
          </Field>

          {/* Projeção */}
          {(function () {
            var valorN = parseMoneyValue(valor);
            var taxaN = taxa ? parseFloat(taxa.replace(',', '.')) : NaN;
            if (!valorN || !taxaN || isNaN(taxaN) || !vencimento) return null;
            var hoje = new Date().toISOString().substring(0, 10);
            var proj = projetarRF({
              tipo: currentTipoForDb(),
              taxaDigitada: taxaN,
              valorAplicado: valorN,
              dataAplicacaoISO: hoje,
              vencimentoISO: vencimento,
              idx: idx,
              indexador: currentIndexador(),
            });
            if (!proj) return null;
            function fmt(n: number) { return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
            function fmtPct(n: number) { return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'; }
            var temIndexador = currentTipoForDb() === 'tesouro_ipca' || currentTipoForDb() === 'tesouro_selic';
            return (
              <div className="rounded-md border border-income/20 bg-income/5 p-3 space-y-1.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase tracking-wider text-white/40 font-mono">Projeção no vencimento</span>
                  <span className="text-[9px] text-white/30 font-mono">{proj.anos.toFixed(1)} anos · {proj.dias}d</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-white/50">Taxa efetiva estimada</span>
                  <span className="text-[11px] font-mono text-white/70">{fmtPct(proj.taxaEfetivaAA)} a.a.</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-white/50">Valor bruto</span>
                  <span className="text-[11px] font-mono text-white/70">R$ {fmt(proj.valorBrutoVencimento)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-white/50">Rentab. bruta</span>
                  <span className="text-[11px] font-mono text-income">+{fmtPct(proj.rentabTotalPct)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-white/50">IR {proj.isento ? '(isento)' : '(' + proj.aliquotaIRpct + '%)'}</span>
                  <span className="text-[11px] font-mono text-white/70">{proj.isento ? '—' : '-R$ ' + fmt(proj.ir)}</span>
                </div>
                <div className="flex items-center justify-between pt-1.5 border-t border-white/[0.06]">
                  <span className="text-[11px] font-medium text-white/70">Líquido estimado</span>
                  <div className="text-right">
                    <p className="text-sm font-mono font-semibold text-income">R$ {fmt(proj.valorLiquidoVencimento)}</p>
                    <p className="text-[9px] font-mono text-income/70">+{fmtPct(proj.rentabLiquidaPct)} total</p>
                  </div>
                </div>
                {temIndexador ? (
                  <p className="text-[9px] text-white/25 mt-1">
                    Usa CDI {idx.cdi.toFixed(2).replace('.', ',')}% e IPCA {idx.ipca.toFixed(2).replace('.', ',')}% atuais (BCB). Rentab. real depende dos indexadores no resgate.
                  </p>
                ) : null}
              </div>
            );
          })()}

          {err ? (
            <div className="rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-[12px] text-red-300">
              {err}
            </div>
          ) : null}

          <div className="flex gap-2 pt-2">
            {isEdit ? (
              <Button
                type="button"
                variant="ghost"
                className="text-red-400 hover:bg-red-500/10"
                onClick={handleDelete}
                disabled={submitting}
              >
                Remover
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              className="flex-1"
              onClick={function () { setOpen(false); }}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-black font-semibold"
              onClick={submit}
              disabled={submitting}
            >
              {submitting ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-white/40 font-mono mb-1.5">{label}</span>
      {children}
    </label>
  );
}
