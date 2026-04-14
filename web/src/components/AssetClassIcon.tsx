'use client';

import { Building2, Warehouse, Layers, Globe2, Landmark, Sparkles } from 'lucide-react';

// ─── Mapping ───────────────────────────────────────────────
// Cores em hex (Tailwind nao aceita class names dinamicos como bg-${cor}/25,
// entao a tinta do chip vai via inline style). Tokens equivalentes:
// orange-500=#F97316, income=#22C55E, warning=#F59E0B,
// stock-int=#E879F9, info=#3B82F6, accent=#6C5CE7

type AssetClassMeta = {
  hex: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }>;
  label: string;
};

var META: Record<string, AssetClassMeta> = {
  acao:      { hex: '#F97316', Icon: Building2, label: 'Acao' },
  fii:       { hex: '#22C55E', Icon: Warehouse, label: 'FII' },
  etf:       { hex: '#F59E0B', Icon: Layers,    label: 'ETF' },
  stock_int: { hex: '#E879F9', Icon: Globe2,    label: 'Internacional' },
  rf:        { hex: '#3B82F6', Icon: Landmark,  label: 'Renda Fixa' },
  opcoes:    { hex: '#6C5CE7', Icon: Sparkles,  label: 'Opcao' },
};

// ─── Sizes ─────────────────────────────────────────────────

type Size = 'sm' | 'md' | 'lg';

var SIZE_PX: Record<Size, { box: number; icon: number; radius: number }> = {
  sm: { box: 24, icon: 14, radius: 7 },
  md: { box: 32, icon: 18, radius: 9 },
  lg: { box: 40, icon: 22, radius: 11 },
};

// ─── Util ──────────────────────────────────────────────────

function hexToRgb(hex: string): string {
  var h = hex.replace('#', '');
  var r = parseInt(h.slice(0, 2), 16);
  var g = parseInt(h.slice(2, 4), 16);
  var b = parseInt(h.slice(4, 6), 16);
  return r + ',' + g + ',' + b;
}

// ─── Component ─────────────────────────────────────────────

interface Props {
  classe: string;
  size?: Size;
  className?: string;
  title?: string;
}

export function AssetClassIcon({ classe, size, className, title }: Props) {
  var sz = size || 'md';
  var dims = SIZE_PX[sz];
  var key = (classe || '').toLowerCase();
  var meta = META[key] || META.acao;
  var rgb = hexToRgb(meta.hex);

  var style: React.CSSProperties = {
    width: dims.box,
    height: dims.box,
    borderRadius: dims.radius,
    background:
      'linear-gradient(135deg, rgba(' + rgb + ',0.55) 0%, rgba(' + rgb + ',0.18) 55%, rgba(' + rgb + ',0.10) 100%)',
    border: '1px solid rgba(' + rgb + ',0.65)',
    boxShadow:
      '0 0 0 1px rgba(' + rgb + ',0.18),' +
      '0 0 18px -2px rgba(' + rgb + ',0.55),' +
      'inset 0 1px 0 rgba(255,255,255,0.18),' +
      'inset 0 -1px 0 rgba(0,0,0,0.25)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  };

  var Icon = meta.Icon;

  // Glyph: branco com leve drop-shadow na cor da classe → contraste alto + brilho
  var iconStyle: React.CSSProperties = {
    color: '#FFFFFF',
    filter:
      'drop-shadow(0 0 4px rgba(' + rgb + ',0.85))' +
      ' drop-shadow(0 1px 1px rgba(0,0,0,0.35))',
  };

  return (
    <span
      role="img"
      aria-label={title || meta.label}
      title={title || meta.label}
      className={className}
      style={style}
    >
      <Icon size={dims.icon} strokeWidth={2.4} style={iconStyle} />
    </span>
  );
}

export default AssetClassIcon;
