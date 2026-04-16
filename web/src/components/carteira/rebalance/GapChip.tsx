'use client';

import type { DriftRow } from '@/lib/rebalance';

interface Props {
  row: DriftRow;
  showAtual?: boolean;
}

export function GapChip({ row, showAtual }: Props) {
  if (row.status === 'nometa') {
    return <span className="text-[10px] text-white/30 font-mono">sem meta</span>;
  }
  const abs = Math.abs(row.gapPct);
  const colorBg =
    row.status === 'ok' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
    : abs < 5 ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
    : 'bg-rose-500/10 text-rose-300 border-rose-500/20';
  const arrow = row.gapPct > 0 ? '↑' : row.gapPct < 0 ? '↓' : '·';
  const text = row.status === 'ok'
    ? 'ok'
    : (row.gapPct > 0 ? '+' : '') + row.gapPct.toFixed(1).replace('.', ',') + 'pp';
  return (
    <span className={'inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-mono font-semibold ' + colorBg}>
      {showAtual && <span className="opacity-70">{row.atualPct.toFixed(1).replace('.', ',')}%</span>}
      <span>{arrow}</span>
      <span>{text}</span>
    </span>
  );
}
