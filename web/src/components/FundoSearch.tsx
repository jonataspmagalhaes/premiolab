'use client';

// Autocomplete de fundos via /api/dm-funds (DM /v1/funds).
// Aceita texto livre se nada bater.

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';

export interface FundoHit {
  cnpj: string;
  nome: string;
  classe: string | null;
  taxa_admin: number | null;
  taxa_perf: number | null;
  patrimonio: number | null;
  cotistas: number | null;
  type: string | null;
  slug: string;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  onPick?: (hit: FundoHit) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

function fmtPatrimonio(n: number | null): string {
  if (n == null) return '';
  if (n >= 1e9) return 'PL R$ ' + (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return 'PL R$ ' + (n / 1e6).toFixed(1) + 'M';
  return 'PL R$ ' + Math.round(n).toLocaleString('pt-BR');
}

export function FundoSearch({ value, onChange, onPick, placeholder, autoFocus }: Props) {
  var _show = useState(false); var show = _show[0]; var setShow = _show[1];
  var _hits = useState<FundoHit[]>([]); var hits = _hits[0]; var setHits = _hits[1];
  var _loading = useState(false); var loading = _loading[0]; var setLoading = _loading[1];
  var timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  var abortRef = useRef<AbortController | null>(null);

  useEffect(function () {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();

    var q = value.trim();
    if (q.length < 3) { setHits([]); setLoading(false); return; }

    timerRef.current = setTimeout(function () {
      var ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      fetch('/api/dm-funds?q=' + encodeURIComponent(q) + '&limit=12', { signal: ctrl.signal })
        .then(function (r) { return r.ok ? r.json() : { hits: [] }; })
        .then(function (body) {
          setHits(Array.isArray(body.hits) ? body.hits : []);
          setLoading(false);
        })
        .catch(function () { setLoading(false); });
    }, 350);

    return function () {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [value]);

  function pick(h: FundoHit) {
    onChange(h.nome);
    if (onPick) onPick(h);
    setShow(false);
  }

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={function (e) { onChange(e.target.value); setShow(true); }}
        onFocus={function () { setShow(true); }}
        onBlur={function () { setTimeout(function () { setShow(false); }, 150); }}
        placeholder={placeholder || 'Nome ou CNPJ do fundo'}
        autoFocus={autoFocus}
      />
      {show && value.trim().length >= 3 ? (
        <div className="absolute top-full left-0 right-0 mt-1 bg-page border border-white/10 rounded-lg shadow-xl z-50 max-h-72 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-2 text-[11px] text-white/40 font-mono animate-pulse">Buscando…</div>
          ) : hits.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-white/40">
              Nenhum fundo encontrado. Você pode seguir com o nome digitado.
            </div>
          ) : (
            hits.map(function (h) {
              return (
                <button
                  key={h.cnpj}
                  type="button"
                  onMouseDown={function (e) { e.preventDefault(); pick(h); }}
                  className="w-full flex items-start gap-2 px-3 py-2 hover:bg-white/[0.04] text-left transition"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-white truncate font-medium">{h.nome}</p>
                    <p className="text-[10px] text-white/40 font-mono truncate">
                      {h.cnpj}
                      {h.taxa_admin != null ? ' · adm ' + h.taxa_admin.toFixed(2).replace('.', ',') + '%' : ''}
                      {h.patrimonio != null ? ' · ' + fmtPatrimonio(h.patrimonio) : ''}
                    </p>
                  </div>
                  {h.classe ? (
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-mono bg-white/[0.04] text-white/50 shrink-0">
                      {h.classe}
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
