'use client';

import { useState } from 'react';
import Image from 'next/image';
import { AssetClassIcon } from './AssetClassIcon';

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

  // Logo real (brapi icons). Wrapper branco suave pra contrastar com SVGs coloridos.
  var wrapStyle: React.CSSProperties = {
    width: s,
    height: s,
    borderRadius: Math.round(s * 0.28),
    background: '#FFFFFF',
    border: '1px solid rgba(255,255,255,0.08)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  };

  var inner = Math.round(s * 0.72);

  return (
    <span style={wrapStyle} className={className}>
      <Image
        src={brapiIconUrl(ticker)}
        alt={ticker}
        width={inner}
        height={inner}
        className="object-contain"
        onError={function () { setFailed(true); }}
        unoptimized
      />
    </span>
  );
}

export default TickerLogo;
