'use client';

// TickerSearch — input com autocomplete online via /api/ticker-search.
// Debounced 300ms, dropdown com nome longo. Aceita digitacao livre tambem.

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';

export interface TickerHit {
  symbol: string;
  name: string;
  tipo?: string;
  mercado: 'BR' | 'INT';
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  mercado?: 'BR' | 'INT' | 'CRIPTO';
  filterTipo?: 'stock' | 'fii' | 'etf' | 'bdr' | 'stock_int' | 'adr' | 'reit' | 'cripto';
  placeholder?: string;
  autoFocus?: boolean;
  onPick?: (hit: TickerHit) => void;
}

export function TickerSearch({ value, onChange, mercado = 'BR', filterTipo, placeholder, autoFocus, onPick }: Props) {
  var _hits = useState<TickerHit[]>([]); var hits = _hits[0]; var setHits = _hits[1];
  var _loading = useState(false); var loading = _loading[0]; var setLoading = _loading[1];
  var _show = useState(false); var show = _show[0]; var setShow = _show[1];
  var timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  var abortRef = useRef<AbortController | null>(null);

  useEffect(function () {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();

    var q = value.trim();
    if (q.length < 1) { setHits([]); setLoading(false); return; }

    timerRef.current = setTimeout(function () {
      var ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      fetch('/api/ticker-search?q=' + encodeURIComponent(q) + '&mercado=' + mercado, { signal: ctrl.signal })
        .then(function (r) { return r.ok ? r.json() : { hits: [] }; })
        .then(function (body) {
          var raw = Array.isArray(body.hits) ? body.hits : [];
          var filtered = filterTipo ? raw.filter(function (h: TickerHit) { return h.tipo === filterTipo; }) : raw;
          setHits(filtered);
          setLoading(false);
        })
        .catch(function () { setLoading(false); });
    }, 300);

    return function () {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [value, mercado, filterTipo]);

  function pick(h: TickerHit) {
    onChange(h.symbol);
    if (onPick) onPick(h);
    setShow(false);
  }

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={function (e) { onChange(e.target.value.toUpperCase()); setShow(true); }}
        onFocus={function () { setShow(true); }}
        onBlur={function () { setTimeout(function () { setShow(false); }, 150); }}
        placeholder={placeholder || (mercado === 'INT' ? 'AAPL' : 'PETR4')}
        autoFocus={autoFocus}
      />
      {show && value.trim() ? (
        <div className="absolute top-full left-0 right-0 mt-1 bg-page border border-white/10 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-2 text-[11px] text-white/40 font-mono animate-pulse">Buscando…</div>
          ) : hits.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-white/40">
              Nenhum resultado. Você pode seguir com o ticker digitado.
            </div>
          ) : (
            hits.map(function (h) {
              return (
                <button
                  key={h.symbol}
                  type="button"
                  onMouseDown={function (e) { e.preventDefault(); pick(h); }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-white/[0.04] text-left transition"
                >
                  <div className="min-w-0">
                    <p className="text-[13px] text-white font-mono">{h.symbol}</p>
                    <p className="text-[10px] text-white/40 truncate">{h.name}</p>
                  </div>
                  {h.tipo ? (
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-mono bg-white/[0.04] text-white/50 shrink-0">
                      {h.tipo === 'fii' ? 'FII' :
                       h.tipo === 'etf' ? 'ETF' :
                       h.tipo === 'bdr' ? 'BDR' :
                       h.tipo === 'adr' ? 'ADR' :
                       h.tipo === 'reit' ? 'REIT' :
                       h.tipo === 'cripto' ? 'CRIPTO' :
                       h.tipo === 'stock_int' ? 'US' : 'AÇÃO'}
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
