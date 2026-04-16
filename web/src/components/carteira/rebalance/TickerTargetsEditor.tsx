'use client';

import { useMemo, useState } from 'react';
import { MetaInput } from './MetaInput';
import { GapChip } from './GapChip';
import { SumBanner } from './SumBanner';
import { TickerLogo } from '@/components/TickerLogo';
import { TickerSearch, type TickerHit } from '@/components/TickerSearch';
import { useAppStore } from '@/store';
import { normalize100, sumValues, type TickerTargets, type DriftRow } from '@/lib/rebalance';

interface Props {
  targets: TickerTargets;
  tickerDrift: DriftRow[];
  onChange: (next: TickerTargets) => void;
}

export function TickerTargetsEditor({ targets, tickerDrift, onChange }: Props) {
  const positions = useAppStore((s) => s.positions);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [addText, setAddText] = useState('');
  const [addMercado, setAddMercado] = useState<'BR' | 'INT'>('BR');
  const flat = targets._flat || {};
  const sum = sumValues(flat);

  const categoriaByTicker = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of positions) {
      m[(p.ticker || '').toUpperCase()] = p.categoria || 'acao';
    }
    return m;
  }, [positions]);

  const driftMap = new Map(tickerDrift.map((r) => [r.key, r]));
  const allKeys = new Set<string>([
    ...tickerDrift.filter((r) => r.atual > 0 || r.metaPct > 0).map((r) => r.key),
    ...Object.keys(flat),
  ]);
  const filteredOrdered = useMemo(() => {
    const arr = Array.from(allKeys).filter((k) => !search || k.toLowerCase().includes(search.toLowerCase()));
    arr.sort((a, b) => {
      const va = driftMap.get(a)?.atual ?? 0;
      const vb = driftMap.get(b)?.atual ?? 0;
      return vb - va;
    });
    return arr;
  }, [allKeys, search, driftMap]);

  function handleSet(ticker: string, val: number) {
    const nextFlat: Record<string, number> = { ...flat };
    if (val <= 0) {
      delete nextFlat[ticker];
    } else {
      nextFlat[ticker] = val;
    }
    onChange({ ...targets, _flat: nextFlat });
  }

  function handleNormalize() {
    onChange({ ...targets, _flat: normalize100(flat) });
  }

  function commitNewTicker(symbol: string) {
    const T = symbol.trim().toUpperCase();
    if (!T) return;
    if (flat[T] != null) {
      // Ja tem meta — so foca, nao reseta
      setAdding(false);
      setAddText('');
      return;
    }
    // Cria com meta default 5%
    onChange({ ...targets, _flat: { ...flat, [T]: 5 } });
    setAdding(false);
    setAddText('');
  }

  function handlePick(hit: TickerHit) {
    setAddMercado(hit.mercado);
    commitNewTicker(hit.symbol);
  }

  return (
    <div className="space-y-2">
      <SumBanner sum={sum} onNormalize={handleNormalize} label="Soma tickers" />
      <input
        type="text"
        placeholder="Buscar ticker..."
        value={search}
        onChange={(e) => setSearch(e.target.value.toUpperCase())}
        className="w-full px-3 py-1.5 rounded-md bg-white/[0.03] border border-white/[0.06] text-[12px] text-white/80 placeholder:text-white/30 focus:outline-none focus:border-orange-500/30 transition"
      />
      <div className="grid grid-cols-1 gap-1.5 max-h-96 overflow-y-auto pr-1">
        {filteredOrdered.length === 0 && (
          <p className="text-[11px] text-white/40 italic px-2 py-3">
            {search ? 'Nenhum ticker encontrado.' : 'Nenhum ticker com posicao ou meta.'}
          </p>
        )}
        {filteredOrdered.map((t) => {
          const row = driftMap.get(t);
          const meta = Number(flat[t]) || 0;
          const atualPct = row?.atualPct ?? 0;
          const hasPosition = categoriaByTicker[t] != null;
          return (
            <div key={t} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-white/[0.02] hover:bg-white/[0.035] transition">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <TickerLogo ticker={t} categoria={categoriaByTicker[t] || 'acao'} size={20} />
                <span className="text-[12px] font-mono font-semibold text-white/85 truncate">{t}</span>
                {!hasPosition && (
                  <span className="px-1 py-px rounded bg-emerald-500/15 text-emerald-300 text-[8px] font-bold uppercase tracking-wider shrink-0">novo</span>
                )}
                <span className="text-[10px] text-white/35 font-mono shrink-0">{atualPct.toFixed(1).replace('.', ',')}%</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {row && <GapChip row={row} />}
                <MetaInput value={meta} onCommit={(v) => handleSet(t, v)} ariaLabel={'Meta ' + t} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Adicionar ticker novo (sem posicao) */}
      {adding ? (
        <div className="space-y-2 p-2.5 rounded-md bg-white/[0.04] border border-orange-500/20">
          <div className="flex items-center gap-2">
            <div className="flex gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setAddMercado('BR')}
                className={'px-2 py-0.5 rounded text-[10px] font-semibold transition ' + (addMercado === 'BR' ? 'bg-orange-500/20 text-orange-300' : 'bg-white/[0.05] text-white/45 hover:text-white/70')}
              >BR</button>
              <button
                type="button"
                onClick={() => setAddMercado('INT')}
                className={'px-2 py-0.5 rounded text-[10px] font-semibold transition ' + (addMercado === 'INT' ? 'bg-orange-500/20 text-orange-300' : 'bg-white/[0.05] text-white/45 hover:text-white/70')}
              >INT</button>
            </div>
            <div className="flex-1">
              <TickerSearch
                value={addText}
                onChange={setAddText}
                mercado={addMercado}
                placeholder="Buscar ticker (ex: VALE3, AAPL)"
                autoFocus
                onPick={handlePick}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => commitNewTicker(addText)}
              disabled={!addText.trim()}
              className="px-2 py-0.5 rounded bg-orange-500/15 text-orange-300 text-[10px] font-semibold hover:bg-orange-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Adicionar
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setAddText(''); }}
              className="px-2 py-0.5 rounded text-[10px] text-white/40 hover:text-white/70"
            >
              Cancelar
            </button>
            <p className="text-[10px] text-white/35 ml-auto italic">Preco buscado automaticamente no simulador</p>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full px-3 py-1.5 rounded-md border border-dashed border-white/10 text-[11px] text-white/40 hover:text-white/70 hover:border-white/20 transition"
        >
          + Adicionar ticker (mesmo sem posicao)
        </button>
      )}
    </div>
  );
}
