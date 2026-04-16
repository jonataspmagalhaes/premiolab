'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { MoneyInput, parseMoneyValue } from '@/components/MoneyInput';
import { TickerSearch } from '@/components/TickerSearch';
import { Button } from '@/components/ui/button';
import { getSupabaseBrowser } from '@/lib/supabase';

const supabase = getSupabaseBrowser();
import { useAppStore } from '@/store';
import { InstituicaoPicker } from '@/components/InstituicaoPicker';
import { ChipGroup } from '@/components/ChipGroup';
import { canonicalName, isKnownInstituicao } from '@/lib/instituicoes';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';

type Tipo = 'dividendo' | 'jcp' | 'rendimento';

export interface ProventoInitial {
  id: string;
  ticker: string;
  tipo: Tipo;
  valor_por_cota: number;
  quantidade: number;
  data_pagamento: string;
  corretora: string | null;
  portfolio_id: string | null;
}

interface Props {
  userId: string | undefined;
  initial?: ProventoInitial;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AddProventoSheet({ userId, initial, open: openProp, onOpenChange }: Props) {
  var portfolios = useAppStore(function (s) { return s.portfolios; });
  var selectedPortfolio = useAppStore(function (s) { return s.selectedPortfolio; });
  var qc = useQueryClient();

  var isEdit = !!initial;
  var _openUncontrolled = useState(false);
  var open = openProp !== undefined ? openProp : _openUncontrolled[0];
  var setOpen = onOpenChange || _openUncontrolled[1];
  var today = new Date().toISOString().substring(0, 10);

  var _ticker = useState(initial ? initial.ticker : ''); var ticker = _ticker[0]; var setTicker = _ticker[1];
  var _tipo = useState<Tipo>(initial ? initial.tipo : 'dividendo'); var tipo = _tipo[0]; var setTipo = _tipo[1];
  var _valor = useState(initial ? String(initial.valor_por_cota).replace('.', ',') : ''); var valor = _valor[0]; var setValor = _valor[1];
  var _qty = useState(initial ? String(initial.quantidade) : ''); var qty = _qty[0]; var setQty = _qty[1];
  var _data = useState(initial ? (initial.data_pagamento || today).substring(0, 10) : today); var data = _data[0]; var setData = _data[1];
  var _corretora = useState(initial && initial.corretora ? initial.corretora : ''); var corretora = _corretora[0]; var setCorretora = _corretora[1];
  var _pf = useState<string>(initial ? (initial.portfolio_id || '__null__') : (selectedPortfolio || '__null__')); var pf = _pf[0]; var setPf = _pf[1];
  var _submitting = useState(false); var submitting = _submitting[0]; var setSubmitting = _submitting[1];
  var _err = useState<string | null>(null); var err = _err[0]; var setErr = _err[1];

  function reset() {
    setTicker(''); setTipo('dividendo'); setValor(''); setQty(''); setCorretora('');
    setData(today); setPf(selectedPortfolio || '__null__'); setErr(null);
  }

  async function submit() {
    if (!userId) { setErr('Sessao invalida'); return; }
    var tk = ticker.trim().toUpperCase();
    var vParsed = parseMoneyValue(valor);
    var v = vParsed === null ? NaN : vParsed;
    var q = parseFloat(qty.replace(',', '.'));
    if (!tk) { setErr('Ticker obrigatorio'); return; }
    if (!/^[A-Z0-9.\-]{3,10}$/.test(tk)) { setErr('Ticker invalido (use formato tipo PETR4, VGIP11)'); return; }
    if (!v || v <= 0) { setErr('Valor por cota invalido'); return; }
    if (v > 1000) { setErr('Valor por cota suspeitosamente alto (> R$1000). Confira.'); return; }
    if (!q || q <= 0) { setErr('Quantidade invalida'); return; }
    if (q > 1000000) { setErr('Quantidade suspeitosamente alta (> 1M). Confira.'); return; }
    if (!data) { setErr('Data obrigatoria'); return; }
    var dataDate = new Date(data);
    var hoje = new Date();
    var umAnoFuturo = new Date(hoje.getFullYear() + 1, hoje.getMonth(), hoje.getDate());
    var cincoAnosPassado = new Date(hoje.getFullYear() - 5, hoje.getMonth(), hoje.getDate());
    if (dataDate > umAnoFuturo) { setErr('Data muito no futuro (> 1 ano). Confira.'); return; }
    if (dataDate < cincoAnosPassado) { setErr('Data muito antiga (> 5 anos). Confira.'); return; }

    var corrCanon = corretora ? canonicalName(corretora) : '';
    if (corrCanon && !isKnownInstituicao(corrCanon)) {
      setErr('Corretora não reconhecida. Selecione da lista ou fale com o suporte pra incluir.');
      return;
    }

    setSubmitting(true); setErr(null);
    try {
      var payload: Record<string, unknown> = {
        user_id: userId,
        ticker: tk,
        tipo: tipo,
        valor_por_cota: v,
        quantidade: q,
        data_pagamento: data,
        data_com: data,
        corretora: corrCanon || null,
        portfolio_id: pf === '__null__' ? null : pf,
        fonte: 'manual',
      };
      var result;
      if (isEdit && initial) {
        result = await supabase.from('proventos').update(payload).eq('id', initial.id).eq('user_id', userId);
      } else {
        result = await supabase
          .from('proventos')
          .upsert(payload, { onConflict: 'user_id,ticker,corretora,data_com,tipo,portfolio_id' });
      }

      if (result.error) {
        setErr(result.error.message);
        setSubmitting(false);
        return;
      }
      await qc.invalidateQueries({ queryKey: ['proventos'] });
      await qc.invalidateQueries({ queryKey: ['transacoes'] });
      await qc.invalidateQueries({ queryKey: ['saldos'] });
      if (!isEdit) reset();
      setOpen(false);
    } catch (e: any) {
      setErr((e && e.message) || 'Erro ao salvar');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!isEdit || !initial || !userId) return;
    if (!confirm('Remover este provento? Ação irreversível.')) return;
    setSubmitting(true); setErr(null);
    try {
      var result = await supabase.from('proventos').delete().eq('id', initial.id).eq('user_id', userId);
      if (result.error) { setErr(result.error.message); setSubmitting(false); return; }
      await qc.invalidateQueries({ queryKey: ['proventos'] });
      await qc.invalidateQueries({ queryKey: ['transacoes'] });
      await qc.invalidateQueries({ queryKey: ['saldos'] });
      setOpen(false);
    } catch (e: any) {
      setErr((e && e.message) || 'Erro ao remover');
    } finally {
      setSubmitting(false);
    }
  }

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
              Adicionar provento
            </Button>
          }
        />
      ) : null}
      <SheetContent side="right" className="w-full sm:max-w-md bg-page border-l border-white/10">
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Editar provento' : 'Adicionar provento manual'}</SheetTitle>
          <p className="text-[11px] text-white/40 mt-1">
            Use quando o sync automatico nao detectar. Fica marcado como <span className="font-mono text-orange-300">fonte=manual</span>.
          </p>
        </SheetHeader>

        <div className="px-4 py-5 space-y-4">
          <Field label="Ticker">
            <TickerSearch
              value={ticker}
              onChange={setTicker}
              mercado="BR"
              placeholder="VGIP11"
              autoFocus
            />
          </Field>

          <Field label="Tipo">
            <ChipGroup<Tipo>
              value={tipo}
              onChange={setTipo}
              options={[
                { value: 'dividendo', label: 'Dividendo', color: 'green' },
                { value: 'jcp', label: 'JCP', color: 'cyan' },
                { value: 'rendimento', label: 'Rendimento', color: 'orange' },
              ]}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor por cota (R$)">
              <MoneyInput
                value={valor}
                onChange={setValor}
                moeda="BRL"
                placeholder="0,10"
              />
            </Field>
            <Field label="Quantidade">
              <Input
                value={qty}
                onChange={function (e) { setQty(e.target.value); }}
                placeholder="100"
                inputMode="decimal"
              />
            </Field>
          </div>

          {/* Preview do total */}
          {(function () {
            var vp = parseMoneyValue(valor);
            var qp = parseFloat(qty.replace(',', '.'));
            if (vp === null || isNaN(qp) || vp <= 0 || qp <= 0) return null;
            var total = vp * qp;
            return (
              <div className="rounded-md bg-income/5 border border-income/20 px-3 py-2.5 flex items-center justify-between">
                <span className="text-[11px] text-white/50">Total a receber</span>
                <span className="text-sm font-mono font-semibold text-income">
                  R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            );
          })()}

          <Field label="Data de pagamento">
            <Input
              type="date"
              value={data}
              onChange={function (e) { setData(e.target.value); }}
            />
          </Field>

          <Field label="Corretora (opcional)">
            <InstituicaoPicker
              value={corretora}
              onChange={setCorretora}
              placeholder="Busque a corretora…"
              filterTipo={['corretora', 'banco']}
            />
          </Field>

          {portfolios.length > 0 ? (
            <Field label="Carteira">
              <select
                value={pf}
                onChange={function (e) { setPf(e.target.value); }}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-[6px] px-3 py-2 text-[13px] text-white focus:outline-none focus:border-orange-500/40"
              >
                <option value="__null__">Padrao</option>
                {portfolios.map(function (p) {
                  return <option key={p.id} value={p.id}>{p.nome}</option>;
                })}
              </select>
            </Field>
          ) : null}

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
