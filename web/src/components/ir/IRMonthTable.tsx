'use client';

// Tabela mensal generica pra seccoes de renda variavel, opcoes e cripto.
// Aceita config de colunas com render custom. 12 linhas (jan-dez).

import React from 'react';
import { fmtBRL } from '@/lib/fmt';
import { mesLabel } from '@/lib/ir/cambio';

export interface IRMonthRow {
  mes: string;           // YYYY-MM
  [key: string]: unknown;
}

export interface IRMonthCol<T extends IRMonthRow> {
  key: string;
  label: string;
  align?: 'left' | 'right';
  render: (row: T) => React.ReactNode;
  footer?: (rows: T[]) => React.ReactNode;
}

interface Props<T extends IRMonthRow> {
  rows: T[];
  cols: IRMonthCol<T>[];
  emptyMessage?: string;
}

export function IRMonthTable<T extends IRMonthRow>(props: Props<T>) {
  var hasFooter = props.cols.some(function (c) { return !!c.footer; });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-left text-white/40 border-b border-white/[0.06]">
            <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px]">Mes</th>
            {props.cols.map(function (c) {
              return (
                <th
                  key={c.key}
                  className={'py-2 pr-3 font-medium uppercase tracking-wider text-[9px] ' + (c.align === 'right' ? 'text-right' : '')}
                >
                  {c.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {props.rows.map(function (row) {
            return (
              <tr key={row.mes} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition">
                <td className="py-1.5 pr-3 font-mono text-white/70">{mesLabel(row.mes)}</td>
                {props.cols.map(function (c) {
                  return (
                    <td
                      key={c.key}
                      className={'py-1.5 pr-3 ' + (c.align === 'right' ? 'text-right' : '')}
                    >
                      {c.render(row)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        {hasFooter ? (
          <tfoot>
            <tr className="border-t border-white/[0.08]">
              <td className="py-2 pr-3 font-semibold text-[11px] text-white/80">Total</td>
              {props.cols.map(function (c) {
                return (
                  <td
                    key={c.key}
                    className={'py-2 pr-3 font-semibold ' + (c.align === 'right' ? 'text-right' : '')}
                  >
                    {c.footer ? c.footer(props.rows) : ''}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        ) : null}
      </table>
      {props.rows.length === 0 && props.emptyMessage ? (
        <p className="text-[12px] text-white/30 italic text-center py-4">{props.emptyMessage}</p>
      ) : null}
    </div>
  );
}

// Helper pra celula monetaria com cor condicional
export function IRMoneyCell(props: { value: number; positiveColor?: string; negativeColor?: string; zeroLabel?: string }) {
  var v = props.value || 0;
  if (v === 0) return <span className="font-mono text-white/30">{props.zeroLabel || '—'}</span>;
  var pos = props.positiveColor || 'text-income';
  var neg = props.negativeColor || 'text-red-300';
  return (
    <span className={'font-mono ' + (v > 0 ? pos : neg)}>
      {v > 0 ? 'R$ ' : '-R$ '}{fmtBRL(Math.abs(v))}
    </span>
  );
}
