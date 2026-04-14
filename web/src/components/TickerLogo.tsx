'use client';

import { useState } from 'react';
import Image from 'next/image';
import { AssetClassIcon } from './AssetClassIcon';

// Cores por classe (espelha META do AssetClassIcon)
var CLASS_HEX: Record<string, string> = {
  acao: '#F97316',
  fii: '#22C55E',
  etf: '#F59E0B',
  stock_int: '#E879F9',
  rf: '#3B82F6',
  opcoes: '#6C5CE7',
};

function classRgb(classe: string): string {
  var hex = (CLASS_HEX[(classe || '').toLowerCase()] || CLASS_HEX.acao).replace('#', '');
  var r = parseInt(hex.slice(0, 2), 16);
  var g = parseInt(hex.slice(2, 4), 16);
  var b = parseInt(hex.slice(4, 6), 16);
  return r + ',' + g + ',' + b;
}

// ─── Util ──────────────────────────────────────────────────
// brapi.dev hospeda icons SVG por ticker (gratis, sem token).
// Funciona pra acoes BR, ETFs BR e tickers INT. FIIs caem no fallback.
// Ex: PETR4 -> https://icons.brapi.dev/icons/PETR4.svg
function brapiIconUrl(ticker: string): string {
  return 'https://icons.brapi.dev/icons/' + ticker.toUpperCase() + '.svg';
}

function pickIconSize(box: number): 'sm' | 'md' | 'lg' {
  if (box <= 26) return 'sm';
  if (box <= 36) return 'md';
  return 'lg';
}

// ─── Component ─────────────────────────────────────────────

interface Props {
  ticker: string;
  categoria: string;
  size?: number;
  className?: string;
}

export function TickerLogo({ ticker, categoria, size, className }: Props) {
  var s = size || 36;
  var _failed = useState(false);
  var failed = _failed[0];
  var setFailed = _failed[1];

  // Fallback: chip de classe (visualmente igual ao AssetClassIcon usado em legendas)
  if (failed || !ticker) {
    return <AssetClassIcon classe={categoria} size={pickIconSize(s)} className={className} />;
  }

  // Wrapper: fundo branco brilhante + ring colorido da classe + glow externo +
  // inner highlight pro logo SVG nao parecer chapado no dark theme.
  var rgb = classRgb(categoria);
  var wrapStyle: React.CSSProperties = {
    width: s,
    height: s,
    borderRadius: Math.round(s * 0.28),
    background: 'linear-gradient(160deg, #FFFFFF 0%, #F1F5FB 100%)',
    border: '1px solid rgba(' + rgb + ',0.55)',
    boxShadow:
      '0 0 0 1px rgba(' + rgb + ',0.18),' +
      '0 0 16px -2px rgba(' + rgb + ',0.50),' +
      'inset 0 1px 0 rgba(255,255,255,0.9),' +
      'inset 0 -1px 0 rgba(0,0,0,0.06)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  };

  var inner = Math.round(s * 0.74);

  return (
    <span style={wrapStyle} className={className}>
      <Image
        src={brapiIconUrl(ticker)}
        alt={ticker}
        width={inner}
        height={inner}
        className="object-contain"
        style={{ filter: 'contrast(1.05) saturate(1.1)' }}
        onError={function () { setFailed(true); }}
        unoptimized
      />
    </span>
  );
}

export default TickerLogo;
