'use client';

// MoneyInput — formata valor monetario automaticamente no blur.
// Aceita "43000", "43000,50", "43.000,50", "43.000.50" etc.
// Exibe "43.000,00" (BRL) ou "43,000.00" (USD) apos blur.
// Internamente guarda string formatada; use `parseMoneyValue` no submit.

import { useState } from 'react';
import { Input } from '@/components/ui/input';

export function parseMoneyValue(s: string): number | null {
  if (!s) return null;
  var clean = s.replace(/\s/g, '');
  // Detecta locale: se tem virgula E ponto, o ultimo separador define decimal
  // Ex: "1.234,56" (BR) ou "1,234.56" (US)
  var lastComma = clean.lastIndexOf(',');
  var lastDot = clean.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      // BR: pontos sao milhar, virgula decimal
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else {
      // US: virgulas sao milhar, ponto decimal
      clean = clean.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    // So virgula: assume decimal BR
    clean = clean.replace(/\./g, '').replace(',', '.');
  }
  // Se so tem pontos: ambiguo. Se so um ponto e 1-2 digits apos = decimal, senao milhar.
  var n = parseFloat(clean);
  if (isNaN(n)) return null;
  return n;
}

export type MoneyMoeda = 'BRL' | 'USD' | 'EUR';

export function formatMoneyValue(n: number, moeda: MoneyMoeda = 'BRL'): string {
  var locale = moeda === 'BRL' ? 'pt-BR' : 'en-US';
  return n.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  moeda?: MoneyMoeda;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

export function MoneyInput({ value, onChange, moeda = 'BRL', placeholder, autoFocus, className }: Props) {
  var _focused = useState(false); var focused = _focused[0]; var setFocused = _focused[1];

  function handleBlur() {
    setFocused(false);
    var n = parseMoneyValue(value);
    if (n === null) return;
    onChange(formatMoneyValue(n, moeda));
  }

  return (
    <Input
      value={value}
      onChange={function (e) { onChange(e.target.value); }}
      onFocus={function () { setFocused(true); }}
      onBlur={handleBlur}
      onKeyDown={function (e) {
        if (e.key === 'Enter') {
          // Dispara formatacao sem mover foco
          var n = parseMoneyValue(value);
          if (n !== null) onChange(formatMoneyValue(n, moeda));
        }
      }}
      placeholder={placeholder || (moeda === 'BRL' ? '0,00' : '0.00')}
      inputMode="decimal"
      autoFocus={autoFocus}
      className={className}
    />
  );
}
