'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getSupabaseBrowser } from '@/lib/supabase';

const supabase = getSupabaseBrowser();
import { useAppStore } from '@/store';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';

type Tipo = 'dividendo' | 'jcp' | 'rendimento';

export function AddProventoSheet({ userId }: { userId: string | undefined }) {
  var portfolios = useAppStore(function (s) { return s.portfolios; });
  var selectedPortfolio = useAppStore(function (s) { return s.selectedPortfolio; });
  var qc = useQueryClient();

  var _open = useState(false); var open = _open[0]; var setOpen = _open[1];
  var _ticker = useState(''); var ticker = _ticker[0]; var setTicker = _ticker[1];
  var _tipo = useState<Tipo>('dividendo'); var tipo = _tipo[0]; var setTipo = _tipo[1];
  var _valor = useState(''); var valor = _valor[0]; var setValor = _valor[1];
  var _qty = useState(''); var qty = _qty[0]; var setQty = _qty[1];
  var today = new Date().toISOString().substring(0, 10);
  var _data = useState(today); var data = _data[0]; var setData = _data[1];
  var _pf = useState<string>(selectedPortfolio || '__null__'); var pf = _pf[0]; var setPf = _pf[1];
  var _submitting = useState(false); var submitting = _submitting[0]; var setSubmitting = _submitting[1];
  var _err = useState<string | null>(null); var err = _err[0]; var setErr = _err[1];

  function reset() {
    setTicker(''); setTipo('dividendo'); setValor(''); setQty('');
    setData(today); setPf(selectedPortfolio || '__null__'); setErr(null);
  }

  async function submit() {
    if (!userId) { setErr('Sessao invalida'); return; }
    var tk = ticker.trim().toUpperCase();
    var v = parseFloat(valor.replace(',', '.'));
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
        corretora: null,
        portfolio_id: pf === '__null__' ? null : pf,
        fonte: 'manual',
      };
      var result = await supabase
        .from('proventos')
        .upsert(payload, { onConflict: 'user_id,ticker,corretora,data_com,tipo,portfolio_id' });

      if (result.error) {
        setErr(result.error.message);
        setSubmitting(false);
        return;
      }
      await qc.invalidateQueries({ queryKey: ['proventos'] });
      reset();
      setOpen(false);
    } catch (e: any) {
      setErr((e && e.message) || 'Erro ao salvar');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
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
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Adicionar provento manual</SheetTitle>
          <p className="text-[11px] text-white/40 mt-1">
            Use quando o sync automatico nao detectar. Fica marcado como <span className="font-mono text-orange-300">fonte=manual</span>.
          </p>
        </SheetHeader>

        <div className="px-4 py-5 space-y-4">
          <Field label="Ticker">
            <Input
              value={ticker}
              onChange={function (e) { setTicker(e.target.value.toUpperCase()); }}
              placeholder="VGIP11"
              autoFocus
            />
          </Field>

          <Field label="Tipo">
            <div className="flex gap-1.5">
              {(['dividendo', 'jcp', 'rendimento'] as Tipo[]).map(function (t) {
                var active = tipo === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={function () { setTipo(t); }}
                    className={'flex-1 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition capitalize ' +
                      (active ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40' : 'bg-white/[0.03] text-white/50 border border-white/[0.06] hover:bg-white/[0.06]')}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor por cota (R$)">
              <Input
                value={valor}
                onChange={function (e) { setValor(e.target.value); }}
                placeholder="0,10"
                inputMode="decimal"
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

          <Field label="Data de pagamento">
            <Input
              type="date"
              value={data}
              onChange={function (e) { setData(e.target.value); }}
            />
          </Field>

          {portfolios.length > 0 ? (
            <Field label="Carteira">
              <select
                value={pf}
                onChange={function (e) { setPf(e.target.value); }}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:border-orange-500/40"
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
              {submitting ? 'Salvando...' : 'Salvar'}
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
