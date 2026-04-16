'use client';

interface Props {
  sum: number;
  onNormalize?: () => void;
  label?: string;
}

export function SumBanner({ sum, onNormalize, label }: Props) {
  const diff = 100 - sum;
  const isOk = Math.abs(diff) < 0.5;
  const isOver = diff < 0;
  const colorBg = isOk
    ? 'bg-emerald-500/5 border-emerald-500/15 text-emerald-300'
    : isOver
      ? 'bg-rose-500/5 border-rose-500/15 text-rose-300'
      : 'bg-amber-500/5 border-amber-500/15 text-amber-300';
  return (
    <div className={'flex items-center justify-between gap-2 px-3 py-1.5 rounded-md border text-[11px] ' + colorBg}>
      <span className="font-medium">
        {label || 'Soma'}: <span className="font-mono font-semibold">{sum.toFixed(1).replace('.', ',')}%</span>
        {!isOk && (
          <span className="ml-2 opacity-80">
            {isOver
              ? `(excede ${Math.abs(diff).toFixed(1).replace('.', ',')}pp)`
              : `(falta ${diff.toFixed(1).replace('.', ',')}pp)`}
          </span>
        )}
      </span>
      {!isOk && onNormalize && sum > 0 && (
        <button
          type="button"
          onClick={onNormalize}
          className="px-2 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-white/70 text-[10px] font-medium transition"
        >
          Normalizar 100%
        </button>
      )}
    </div>
  );
}
