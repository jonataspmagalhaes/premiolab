'use client';

// Sheet para transferir ativos entre corretoras (total ou parcial).
// Seleciona ticker, corretora origem, corretora destino, quantidade.

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getSupabaseBrowser } from '@/lib/supabase';
import { useAppStore } from '@/store';
import { InstituicaoPicker } from '@/components/InstituicaoPicker';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft } from 'lucide-react';

var supabase = getSupabaseBrowser();

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] text-white/40 mb-1 font-medium">{label}</label>
      {children}
    </div>
  );
}

interface Props {
  userId: string;
}

export function TransferSheet({ userId }: Props) {
  var _open = useState(false); var open = _open[0]; var setOpen = _open[1];
  var _ticker = useState(''); var ticker = _ticker[0]; var setTicker = _ticker[1];
  var _origem = useState(''); var origem = _origem[0]; var setOrigem = _origem[1];
  var _destino = useState(''); var destino = _destino[0]; var setDestino = _destino[1];
  var _qty = useState(''); var qty = _qty[0]; var setQty = _qty[1];
  var _data = useState(new Date().toISOString().substring(0, 10)); var data = _data[0]; var setData = _data[1];
  var _err = useState(''); var err = _err[0]; var setErr = _err[1];
  var _loading = useState(false); var loading = _loading[0]; var setLoading = _loading[1];
  var _submitted = useState(false); var submitted = _submitted[0]; var setSubmitted = _submitted[1];

  var positions = useAppStore(function (s) { return s.positions; });
  var selectedPortfolio = useAppStore(function (s) { return s.selectedPortfolio; });
  var qc = useQueryClient();

  // Tickers unicos com posicao e corretoras
  var tickerOptions: Array<{ ticker: string; categoria: string }> = [];
  var seen = new Set<string>();
  for (var i = 0; i < positions.length; i++) {
    var p = positions[i];
    if (p.quantidade > 0 && !seen.has(p.ticker)) {
      seen.add(p.ticker);
      tickerOptions.push({ ticker: p.ticker, categoria: p.categoria });
    }
  }
  tickerOptions.sort(function (a, b) { return a.ticker.localeCompare(b.ticker); });

  // Corretoras disponiveis para o ticker selecionado
  var corretoras: Array<{ nome: string; qty: number }> = [];
  if (ticker) {
    var pos = positions.find(function (p) { return p.ticker === ticker; });
    if (pos && pos.por_corretora) {
      for (var j = 0; j < pos.por_corretora.length; j++) {
        var pc = pos.por_corretora[j];
        if (pc.quantidade > 0) {
          corretoras.push({ nome: pc.corretora, qty: pc.quantidade });
        }
      }
    }
  }

  var maxQty = 0;
  var origemInfo = corretoras.find(function (c) { return c.nome === origem; });
  if (origemInfo) maxQty = origemInfo.qty;

  async function handleSubmit() {
    if (submitted) return;
    setErr('');

    var tk = ticker.trim().toUpperCase();
    if (!tk) { setErr('Selecione um ativo'); return; }
    if (!origem) { setErr('Selecione a corretora de origem'); return; }
    if (!destino) { setErr('Selecione a corretora de destino'); return; }
    if (origem === destino) { setErr('Origem e destino devem ser diferentes'); return; }

    var q = parseFloat(qty.replace(',', '.'));
    if (!q || q <= 0) { setErr('Quantidade invalida'); return; }
    if (q > maxQty) { setErr('Quantidade maior que disponivel (' + maxQty + ')'); return; }

    setLoading(true);
    setSubmitted(true);

    // Encontrar categoria e mercado do ativo
    var posInfo = positions.find(function (p) { return p.ticker === tk; });
    var categoria = posInfo ? posInfo.categoria : 'acao';
    var mercado = posInfo ? posInfo.mercado : 'BR';

    var portfolioId = selectedPortfolio === '__null__' ? null : selectedPortfolio;

    var { error } = await supabase.from('operacoes').insert({
      user_id: userId,
      ticker: tk,
      tipo: 'transferencia',
      categoria: categoria,
      quantidade: q,
      preco: 0,
      data: data,
      mercado: mercado,
      corretora: origem,
      corretora_destino: destino,
      portfolio_id: portfolioId,
      fonte: 'manual',
      observacao: 'Transferencia ' + origem + ' -> ' + destino,
    });

    setLoading(false);

    if (error) {
      setErr(error.message);
      setSubmitted(false);
      return;
    }

    await qc.invalidateQueries({ queryKey: ['positions'] });
    await qc.invalidateQueries({ queryKey: ['transacoes'] });

    // Reset
    setTicker('');
    setOrigem('');
    setDestino('');
    setQty('');
    setSubmitted(false);
    setOpen(false);
  }

  return (
    <Sheet open={open} onOpenChange={function (v) { setOpen(v); if (!v) { setErr(''); setSubmitted(false); } }}>
      <SheetTrigger
        render={
          <Button
            size="sm"
            className="bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 mr-1.5" />
            Transferir
          </Button>
        }
      />
      <SheetContent className="bg-page border-white/[0.06] w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-white">Transferir Ativo</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-6">
          {/* Ticker select */}
          <Field label="Ativo">
            <select
              value={ticker}
              onChange={function (e) { setTicker(e.target.value); setOrigem(''); setDestino(''); setQty(''); }}
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/40"
            >
              <option value="">Selecione...</option>
              {tickerOptions.map(function (t) {
                return <option key={t.ticker} value={t.ticker}>{t.ticker}</option>;
              })}
            </select>
          </Field>

          {/* Corretora origem */}
          {ticker && corretoras.length > 0 ? (
            <Field label="Corretora Origem">
              <select
                value={origem}
                onChange={function (e) { setOrigem(e.target.value); }}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/40"
              >
                <option value="">Selecione...</option>
                {corretoras.map(function (c) {
                  return <option key={c.nome} value={c.nome}>{c.nome} ({c.qty} un.)</option>;
                })}
              </select>
            </Field>
          ) : ticker ? (
            <p className="text-xs text-white/30">Nenhuma posicao encontrada com corretora</p>
          ) : null}

          {/* Corretora destino */}
          {origem ? (
            <Field label="Corretora Destino">
              <InstituicaoPicker
                value={destino}
                onChange={setDestino}
                placeholder="Selecione ou digite..."
              />
            </Field>
          ) : null}

          {/* Quantidade */}
          {origem && destino ? (
            <>
              <Field label={'Quantidade (max: ' + maxQty + ')'}>
                <div className="flex gap-2">
                  <Input
                    value={qty}
                    onChange={function (e) { setQty(e.target.value); }}
                    placeholder={String(maxQty)}
                    inputMode="decimal"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={function () { setQty(String(maxQty)); }}
                    className="shrink-0 text-xs"
                  >
                    Total
                  </Button>
                </div>
              </Field>

              <Field label="Data">
                <Input
                  type="date"
                  value={data}
                  onChange={function (e) { setData(e.target.value); }}
                />
              </Field>
            </>
          ) : null}

          {err ? <p className="text-xs text-red-400">{err}</p> : null}

          {origem && destino ? (
            <Button
              onClick={handleSubmit}
              disabled={loading || submitted}
              className="w-full bg-sky-600 hover:bg-sky-700 text-white"
            >
              {loading ? 'Transferindo...' : 'Confirmar Transferencia'}
            </Button>
          ) : null}

          {/* Preview */}
          {ticker && origem && destino && qty ? (
            <div className="bg-white/[0.02] rounded-lg p-3 text-xs text-white/50">
              <p className="font-medium text-white/70 mb-1">Resumo</p>
              <p>{qty} {ticker}</p>
              <p>{origem} → {destino}</p>
              <p className="text-white/30 mt-1">PM se mantem inalterado</p>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
