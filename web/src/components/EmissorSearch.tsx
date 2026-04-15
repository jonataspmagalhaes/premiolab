'use client';

// Input com autocomplete de emissores de RF.
// Combina:
// - DM /v1/companies (empresas listadas B3) via /api/dm-emissores — debounced
// - Catalogo estatico (bancos + governo) — match local instantaneo
// Aceita digitacao livre se nao bater.

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { searchEmissores, type Emissor } from '@/lib/emissoresRF';

interface DmHit {
  nome: string;
  setor: string | null;
  cnpj: string | null;
  ticker: string | null;
  fonte: 'dm';
}

interface MergedHit {
  nome: string;
  setor: string | null;
  ticker: string | null;
  badge: 'BANCO' | 'GOV' | 'EMPRESA';
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

function emissorToMerged(e: Emissor): MergedHit {
  return {
    nome: e.nome,
    setor: e.setor || null,
    ticker: null,
    badge: e.tipo === 'banco' ? 'BANCO' : e.tipo === 'governo' ? 'GOV' : 'EMPRESA',
  };
}

function dmToMerged(d: DmHit): MergedHit {
  return {
    nome: d.nome,
    setor: d.setor,
    ticker: d.ticker,
    badge: 'EMPRESA',
  };
}

export function EmissorSearch({ value, onChange, placeholder, autoFocus }: Props) {
  var _show = useState(false); var show = _show[0]; var setShow = _show[1];
  var _dmHits = useState<DmHit[]>([]); var dmHits = _dmHits[0]; var setDmHits = _dmHits[1];
  var _loading = useState(false); var loading = _loading[0]; var setLoading = _loading[1];
  var timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  var abortRef = useRef<AbortController | null>(null);

  // Debounce DM fetch
  useEffect(function () {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();

    var q = value.trim();
    if (q.length < 2) { setDmHits([]); setLoading(false); return; }

    timerRef.current = setTimeout(function () {
      var ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      fetch('/api/dm-emissores?q=' + encodeURIComponent(q) + '&limit=10', { signal: ctrl.signal })
        .then(function (r) { return r.ok ? r.json() : { hits: [] }; })
        .then(function (body) {
          setDmHits(Array.isArray(body.hits) ? body.hits : []);
          setLoading(false);
        })
        .catch(function () { setLoading(false); });
    }, 300);

    return function () {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [value]);

  // Merge: estaticos primeiro (instantaneo), depois DM, dedupe por nome
  var staticHits = show && value.trim() ? searchEmissores(value, 6).map(emissorToMerged) : [];
  var seen: Record<string, true> = {};
  var merged: MergedHit[] = [];
  for (var i = 0; i < staticHits.length; i++) {
    var s = staticHits[i];
    var k = s.nome.toLowerCase();
    if (seen[k]) continue;
    seen[k] = true;
    merged.push(s);
  }
  for (var j = 0; j < dmHits.length; j++) {
    var d = dmToMerged(dmHits[j]);
    var k2 = d.nome.toLowerCase();
    if (seen[k2]) continue;
    seen[k2] = true;
    merged.push(d);
  }

  function pick(m: MergedHit) {
    onChange(m.nome);
    setShow(false);
  }

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={function (ev) { onChange(ev.target.value); setShow(true); }}
        onFocus={function () { setShow(true); }}
        onBlur={function () { setTimeout(function () { setShow(false); }, 150); }}
        placeholder={placeholder || 'Ex: Banco Inter, Vale, Petrobras'}
        autoFocus={autoFocus}
      />
      {show && value.trim() ? (
        <div className="absolute top-full left-0 right-0 mt-1 bg-page border border-white/10 rounded-lg shadow-xl z-50 max-h-72 overflow-y-auto">
          {merged.length === 0 && loading ? (
            <div className="px-3 py-2 text-[11px] text-white/40 font-mono animate-pulse">Buscando…</div>
          ) : merged.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-white/40">
              Nenhum emissor encontrado. Você pode seguir com o nome digitado.
            </div>
          ) : (
            merged.map(function (m) {
              return (
                <button
                  key={m.nome}
                  type="button"
                  onMouseDown={function (ev) { ev.preventDefault(); pick(m); }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-white/[0.04] text-left transition"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-white truncate">{m.nome}</p>
                    <p className="text-[10px] text-white/40 truncate">
                      {m.setor || '—'}
                      {m.ticker ? <span className="text-white/30"> · {m.ticker}</span> : null}
                    </p>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-mono bg-white/[0.04] text-white/50 shrink-0">
                    {m.badge}
                  </span>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
