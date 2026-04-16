'use client';

// Grupo de chips (botoes de toggle) padronizado pra sheets de cadastro.
// Altura, padding e tipografia consistentes em todas as telas.

import React from 'react';

export type ChipColor = 'orange' | 'green' | 'red' | 'blue' | 'purple' | 'pink' | 'yellow' | 'cyan';

interface ChipOption<T extends string> {
  value: T;
  label: string;
  color?: ChipColor;              // cor quando ativo; default 'orange'
}

interface Props<T extends string> {
  options: ChipOption<T>[];
  value: T;
  onChange: (v: T) => void;
  cols?: 2 | 3 | 4;               // grid columns; default: auto por count
  icon?: (opt: ChipOption<T>) => React.ReactNode;
}

var COLOR_CLASSES: Record<ChipColor, { bg: string; text: string; border: string }> = {
  orange: { bg: 'bg-orange-500/20', text: 'text-orange-300', border: 'border-orange-500/40' },
  green:  { bg: 'bg-emerald-500/20', text: 'text-emerald-300', border: 'border-emerald-500/40' },
  red:    { bg: 'bg-red-500/20', text: 'text-red-300', border: 'border-red-500/40' },
  blue:   { bg: 'bg-blue-500/20', text: 'text-blue-300', border: 'border-blue-500/40' },
  purple: { bg: 'bg-purple-500/20', text: 'text-purple-300', border: 'border-purple-500/40' },
  pink:   { bg: 'bg-pink-500/20', text: 'text-pink-300', border: 'border-pink-500/40' },
  yellow: { bg: 'bg-yellow-500/20', text: 'text-yellow-300', border: 'border-yellow-500/40' },
  cyan:   { bg: 'bg-cyan-500/20', text: 'text-cyan-300', border: 'border-cyan-500/40' },
};

function gridCols(cols?: number, count?: number): string {
  if (cols) {
    if (cols === 2) return 'grid-cols-2';
    if (cols === 3) return 'grid-cols-3';
    if (cols === 4) return 'grid-cols-4';
  }
  if (!count) return 'grid-cols-2';
  if (count <= 2) return 'grid-cols-2';
  if (count === 3) return 'grid-cols-3';
  return 'grid-cols-4';
}

export function ChipGroup<T extends string>(props: Props<T>) {
  var cls = gridCols(props.cols, props.options.length);
  return (
    <div className={'grid ' + cls + ' gap-1.5'}>
      {props.options.map(function (opt) {
        var active = opt.value === props.value;
        var c = COLOR_CLASSES[opt.color || 'orange'];
        var baseCls = 'h-9 px-2.5 rounded-[6px] text-[12px] font-medium transition inline-flex items-center justify-center gap-1.5 border ';
        var stateCls = active
          ? (c.bg + ' ' + c.text + ' ' + c.border)
          : 'bg-white/[0.03] text-white/50 border-white/[0.06] hover:bg-white/[0.06]';
        return (
          <button
            key={opt.value}
            type="button"
            onClick={function () { props.onChange(opt.value); }}
            className={baseCls + stateCls}
          >
            {props.icon ? props.icon(opt) : null}
            <span className="truncate">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
