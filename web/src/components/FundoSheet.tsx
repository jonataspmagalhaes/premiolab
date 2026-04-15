'use client';

// Sheet de cadastro/edit de fundo de investimento.

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { MoneyInput, parseMoneyValue } from '@/components/MoneyInput';
import { Button } from '@/components/ui/button';
import { FundoSearch, type FundoHit } from '@/components/FundoSearch';
import { getSupabaseBrowser } from '@/lib/supabase';
import { useAppStore } from '@/store';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';

var supabase = getSupabaseBrowser();

type ClasseFundo = 'renda_fixa' | 'multimercado' | 'acoes' | 'cambial' | 'previdencia' | 'imobiliario' | 'outros';

function inferClasseFromDM(s: string | null): ClasseFundo {
  if (!s) return 'outros';
  var lc = s.toLowerCase();
  if (lc.indexOf('renda fixa') >= 0 || lc.indexOf('rf') >= 0 || lc.indexOf('referenciado') >= 0 || lc.indexOf('curto prazo') >= 0) return 'renda_fixa';
  if (lc.indexOf('multimercado') >= 0 || lc.indexOf('multi') >= 0) return 'multimercado';
  if (lc.indexOf('acoes') >= 0 || lc.indexOf('ações') >= 0 || lc.indexOf('acao') >= 0) return 'acoes';
  if (lc.indexOf('cambial') >= 0) return 'cambial';
  if (lc.indexOf('previdencia') >= 0 || lc.indexOf('pgbl') >= 0 || lc.indexOf('vgbl') >= 0) return 'previdencia';
  if (lc.indexOf('imobili') >= 0) return 'imobiliario';
  return 'outros';
}

export interface FundoInitial {
  id: string;
  cnpj: string;
  nome: string;
  classe: ClasseFundo | null;
  valor_aplicado: number;
  qtde_cotas: number | null;
  valor_cota_compra: number | null;
  data_aplicacao: string;
  corretora: string | null;
  taxa_admin: number | null;
  taxa_perf: number | null;
  portfolio_id: string | null;
}

interface Props {
  userId: string | undefined;
  initial?: FundoInitial;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function FundoSheet({ userId, initial, open: openProp, onOpenChange }: Props) {
  var saldos = useAppStore(function (s) { return s.saldos; });
  var portfolios = useAppStore(function (s) { return s.portfolios; });
  var selectedPortfolio = useAppStore(function (s) { return s.selectedPortfolio; });
  var qc = useQueryClient();
  var contasBRL = saldos.filter(function (s) { return (s.moeda || 'BRL') === 'BRL'; });

  var isEdit = !!initial;
  var _openUncontrolled = useState(false);
  var open = openProp !== undefined ? openProp : _openUncontrolled[0];
  var setOpen = onOpenChange || _openUncontrolled[1];
  var today = new Date().toISOString().substring(0, 10);

  var _nome = useState(initial ? initial.nome : ''); var nome = _nome[0]; var setNome = _nome[1];
  var _cnpj = useState(initial ? initial.cnpj : ''); var cnpj = _cnpj[0]; var setCnpj = _cnpj[1];
  var _classe = useState<ClasseFundo>(initial && initial.classe ? initial.classe : 'renda_fixa'); var classe = _classe[0]; var setClasse = _classe[1];
  var _valor = useState(initial ? String(initial.valor_aplicado).replace('.', ',') : ''); var valor = _valor[0]; var setValor = _valor[1];
  var _qtdCotas = useState(initial && initial.qtde_cotas != null ? String(initial.qtde_cotas).replace('.', ',') : ''); var qtdCotas = _qtdCotas[0]; var setQtdCotas = _qtdCotas[1];
  var _valorCota = useState(initial && initial.valor_cota_compra != null ? String(initial.valor_cota_compra).replace('.', ',') : ''); var valorCota = _valorCota[0]; var setValorCota = _valorCota[1];
  var _data = useState(initial ? initial.data_aplicacao.substring(0, 10) : today); var data = _data[0]; var setData = _data[1];
  var _corretora = useState(initial && initial.corretora ? initial.corretora : ''); var corretora = _corretora[0]; var setCorretora = _corretora[1];
  var _taxaAdm = useState(initial && initial.taxa_admin != null ? String(initial.taxa_admin).replace('.', ',') : ''); var taxaAdm = _taxaAdm[0]; var setTaxaAdm = _taxaAdm[1];
  var _pf = useState<string>(initial ? (initial.portfolio_id || '__null__') : (selectedPortfolio || '__null__')); var pf = _pf[0]; var setPf = _pf[1];
  var _submitting = useState(false); var submitting = _submitting[0]; var setSubmitting = _submitting[1];
  var _err = useState<string | null>(null); var err = _err[0]; var setErr = _err[1];

  function onPickFundo(h: FundoHit) {
    setNome(h.nome);
    setCnpj(h.cnpj);
    setClasse(inferClasseFromDM(h.classe));
    if (h.taxa_admin != null) setTaxaAdm(String(h.taxa_admin).replace('.', ','));
  }

  async function submit() {
    if (!userId) { setErr('Sessão inválida'); return; }
    if (!nome.trim()) { setErr('Nome obrigatório'); return; }
    if (!cnpj.trim()) { setErr('CNPJ obrigatório'); return; }
    var v = parseMoneyValue(valor);
    if (v == null || v <= 0) { setErr('Valor aplicado inválido'); return; }
    if (!data) { setErr('Data obrigatória'); return; }
    if (!corretora) { setErr('Selecione a corretora'); return; }

    var qC = qtdCotas ? parseFloat(qtdCotas.replace(',', '.')) : null;
    var vC = valorCota ? parseMoneyValue(valorCota) : null;
    var tAdm = taxaAdm ? parseFloat(taxaAdm.replace(',', '.')) : null;

    setSubmitting(true); setErr(null);
    try {
      var payload: Record<string, unknown> = {
        user_id: userId,
        cnpj: cnpj.trim(),
        nome: nome.trim(),
        classe: classe,
        valor_aplicado: v,
        qtde_cotas: qC,
        valor_cota_compra: vC,
        data_aplicacao: data,
        corretora: corretora,
        taxa_admin: tAdm,
        portfolio_id: pf === '__null__' ? null : pf,
      };

      var result;
      if (isEdit && initial) {
        result = await supabase.from('fundos').update(payload).eq('id', initial.id).eq('user_id', userId);
      } else {
        result = await supabase.from('fundos').insert(payload);
      }

      if (result.error) { setErr(result.error.message); setSubmitting(false); return; }

      await qc.invalidateQueries({ queryKey: ['fundos'] });
      await qc.invalidateQueries({ queryKey: ['transacoes'] });
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
    if (!confirm('Remover este fundo? Ação irreversível.')) return;
    setSubmitting(true);
    try {
      var result = await supabase.from('fundos').delete().eq('id', initial.id).eq('user_id', userId);
      if (result.error) { setErr(result.error.message); setSubmitting(false); return; }
      await qc.invalidateQueries({ queryKey: ['fundos'] });
      await qc.invalidateQueries({ queryKey: ['transacoes'] });
      await qc.invalidateQueries({ queryKey: ['saldos'] });
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {!isEdit ? (
        <SheetTrigger
          render={
            <Button size="sm" className="bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/40">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Novo Fundo
            </Button>
          }
        />
      ) : null}
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto bg-page border-l border-white/10">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Editar fundo' : 'Novo fundo'}</SheetTitle>
          <p className="text-[11px] text-white/40 mt-1">
            Renda Fixa, Multimercado, Ações, Cambial, Previdência ou outros.
          </p>
        </SheetHeader>

        <div className="px-4 py-5 space-y-4">
          <Field label="Nome ou CNPJ do fundo">
            <FundoSearch value={nome} onChange={setNome} onPick={onPickFundo} autoFocus />
          </Field>

          {cnpj ? (
            <p className="text-[10px] text-white/40 font-mono -mt-2">CNPJ: {cnpj}</p>
          ) : null}

          <Field label="Classe">
            <select
              value={classe}
              onChange={function (e) { setClasse(e.target.value as ClasseFundo); }}
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:border-orange-500/40"
            >
              <option value="renda_fixa">Renda Fixa</option>
              <option value="multimercado">Multimercado</option>
              <option value="acoes">Ações</option>
              <option value="cambial">Cambial</option>
              <option value="previdencia">Previdência (PGBL/VGBL)</option>
              <option value="imobiliario">Imobiliário</option>
              <option value="outros">Outros</option>
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor aplicado (R$)">
              <MoneyInput value={valor} onChange={setValor} moeda="BRL" />
            </Field>
            <Field label="Data aplicação">
              <Input type="date" value={data} onChange={function (e) { setData(e.target.value); }} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Qtde cotas (opcional)">
              <Input
                value={qtdCotas}
                onChange={function (e) { setQtdCotas(e.target.value); }}
                placeholder="0,00000000"
                inputMode="decimal"
              />
            </Field>
            <Field label="Cota compra (opcional)">
              <MoneyInput value={valorCota} onChange={setValorCota} moeda="BRL" />
            </Field>
          </div>

          <Field label="Taxa adm (% a.a., opcional)">
            <Input
              value={taxaAdm}
              onChange={function (e) { setTaxaAdm(e.target.value); }}
              placeholder="0,90"
              inputMode="decimal"
            />
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

          {portfolios.length > 0 ? (
            <Field label="Carteira">
              <select
                value={pf}
                onChange={function (e) { setPf(e.target.value); }}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:border-orange-500/40"
              >
                <option value="__null__">Padrão</option>
                {portfolios.map(function (p) {
                  return <option key={p.id} value={p.id}>{p.nome}</option>;
                })}
              </select>
            </Field>
          ) : null}

          {err ? (
            <div className="rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-[12px] text-red-300">{err}</div>
          ) : null}

          <div className="flex gap-2 pt-2">
            {isEdit ? (
              <Button type="button" variant="ghost" className="text-red-400 hover:bg-red-500/10" onClick={handleDelete} disabled={submitting}>
                Remover
              </Button>
            ) : null}
            <Button type="button" variant="ghost" className="flex-1" onClick={function () { setOpen(false); }} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="button" className="flex-1 bg-orange-500 hover:bg-orange-600 text-black font-semibold" onClick={submit} disabled={submitting}>
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
