'use client';

import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store';

function ChevronIcon() {
  return (
    <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function labelFor(sel: string | null, portfolios: { id: string; nome: string }[]): string {
  if (sel === null) return 'Todos';
  if (sel === '__null__') return 'Padrao';
  var match = portfolios.find(function (p) { return p.id === sel; });
  return match ? match.nome : 'Portfolio';
}

function colorDot(color?: string) {
  var c = color || '#6C5CE7';
  return (
    <span
      className="w-2 h-2 rounded-full shrink-0"
      style={{ backgroundColor: c }}
    />
  );
}

export function PortfolioSwitcher() {
  var selectedPortfolio = useAppStore(function (s) { return s.selectedPortfolio; });
  var setSelectedPortfolio = useAppStore(function (s) { return s.setSelectedPortfolio; });
  var portfolios = useAppStore(function (s) { return s.portfolios; });

  var _open = useState(false);
  var open = _open[0];
  var setOpen = _open[1];

  var ref = useRef<HTMLDivElement>(null);

  useEffect(function () {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return function () {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(val: string | null) {
    setSelectedPortfolio(val);
    setOpen(false);
  }

  var label = labelFor(selectedPortfolio, portfolios);
  var activeColor =
    selectedPortfolio === null
      ? '#8888aa'
      : selectedPortfolio === '__null__'
      ? '#6C5CE7'
      : (portfolios.find(function (p) { return p.id === selectedPortfolio; })?.cor || '#6C5CE7');

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={function () { setOpen(function (v) { return !v; }); }}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition text-[12px]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {colorDot(activeColor)}
        <span className="text-white/70 font-medium">{label}</span>
        <ChevronIcon />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full mt-1.5 min-w-[200px] rounded-xl bg-[#0e1118] border border-white/[0.08] shadow-2xl overflow-hidden z-50"
        >
          <OptionRow
            active={selectedPortfolio === null}
            color="#8888aa"
            label="Todos"
            sub="Agrega todos os portfolios"
            onPick={function () { pick(null); }}
          />
          <OptionRow
            active={selectedPortfolio === '__null__'}
            color="#6C5CE7"
            label="Padrao"
            sub="Ativos sem portfolio definido"
            onPick={function () { pick('__null__'); }}
          />
          {portfolios.length > 0 && <div className="h-px bg-white/[0.06]" />}
          {portfolios.map(function (p) {
            return (
              <OptionRow
                key={p.id}
                active={selectedPortfolio === p.id}
                color={p.cor || '#6C5CE7'}
                label={p.nome}
                onPick={function () { pick(p.id); }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function OptionRow({
  active,
  color,
  label,
  sub,
  onPick,
}: {
  active: boolean;
  color: string;
  label: string;
  sub?: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={
        'w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/[0.04] transition ' +
        (active ? 'bg-white/[0.03]' : '')
      }
      role="option"
      aria-selected={active}
    >
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-white/90 truncate">{label}</p>
        {sub && <p className="text-[10px] text-white/40 truncate">{sub}</p>}
      </div>
      {active && <CheckIcon />}
    </button>
  );
}
