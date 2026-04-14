'use client';

import { useState } from 'react';
import Image from 'next/image';
import { AssetClassIcon } from './AssetClassIcon';

// ─── Util ──────────────────────────────────────────────────
// StatusInvest hospeda logo da empresa por ticker base (sem digito).
// Ex: PETR4 -> petr, BBAS3 -> bbas, MXRF11 -> mxrf
function statusInvestLogoUrl(ticker: string): string {
  var base = ticker.replace(/\d+[BF]?$/, '').toLowerCase();
  return 'https://statusinvest.com.br/img/company/bottom/' + base + '.png';
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

  // Logo real (StatusInvest). Wrapper neutro pra contraste com o png.
  var wrapStyle: React.CSSProperties = {
    width: s,
    height: s,
    borderRadius: Math.round(s * 0.28),
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.06)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  };

  return (
    <span style={wrapStyle} className={className}>
      <Image
        src={statusInvestLogoUrl(ticker)}
        alt={ticker}
        width={s - 8}
        height={s - 8}
        className="rounded-md object-contain"
        onError={function () { setFailed(true); }}
        unoptimized
      />
    </span>
  );
}

export default TickerLogo;
