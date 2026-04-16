'use client';

import { useEffect, useState } from 'react';

// Input de % com debounce on-blur. Aceita virgula ou ponto.
// Reporta valor numerico (0-100) via onCommit so quando usuario sair do field
// ou apertar Enter, evitando flood de mutations.

interface Props {
  value: number;
  onCommit: (newVal: number) => void;
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function MetaInput({ value, onCommit, ariaLabel, placeholder, disabled, className }: Props) {
  const [text, setText] = useState<string>(value > 0 ? formatVal(value) : '');

  // Sincroniza quando value externo muda (ex: aplicar perfil)
  useEffect(() => {
    setText(value > 0 ? formatVal(value) : '');
  }, [value]);

  function commit() {
    const parsed = parseVal(text);
    const clamped = Math.max(0, Math.min(100, parsed));
    if (Math.abs(clamped - value) < 0.01) {
      // Sem mudanca real — re-formata so pra normalizar visual
      setText(clamped > 0 ? formatVal(clamped) : '');
      return;
    }
    setText(clamped > 0 ? formatVal(clamped) : '');
    onCommit(clamped);
  }

  return (
    <div className={'relative inline-flex items-center ' + (className || '')}>
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={text}
        placeholder={placeholder ?? '0'}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            setText(value > 0 ? formatVal(value) : '');
            e.currentTarget.blur();
          }
        }}
        className="w-16 px-2 py-1 pr-5 rounded-md bg-white/[0.04] border border-white/[0.08] text-[12px] text-white/90 font-mono text-right focus:outline-none focus:border-orange-500/40 focus:bg-white/[0.06] transition disabled:opacity-50"
      />
      <span className="absolute right-1.5 text-[10px] text-white/40 pointer-events-none">%</span>
    </div>
  );
}

function parseVal(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/[^0-9.,]/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function formatVal(n: number): string {
  if (n === 0) return '';
  // 1 casa decimal se necessario
  return Math.abs(n - Math.round(n)) < 0.05
    ? String(Math.round(n))
    : n.toFixed(1).replace('.', ',');
}
