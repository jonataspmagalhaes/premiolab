'use client';

// Barra de progresso pra mostrar quanto da isencao mensal foi usado.
// Acoes BR: 20k. Cripto swing: 35k.

import { fmtBRL } from '@/lib/fmt';

interface Props {
  atual: number;
  limite: number;
  label?: string;
  compact?: boolean;
}

export function IsencaoIndicator(props: Props) {
  var pct = props.limite > 0 ? (props.atual / props.limite) * 100 : 0;
  var capPct = Math.min(100, pct);
  var excedeu = pct > 100;

  var color: string;
  var bgColor: string;
  if (excedeu) {
    color = 'text-red-300';
    bgColor = 'bg-red-500';
  } else if (pct > 80) {
    color = 'text-amber-300';
    bgColor = 'bg-amber-500';
  } else {
    color = 'text-emerald-300';
    bgColor = 'bg-emerald-500';
  }

  if (props.compact) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden min-w-[60px]">
          <div className={'h-full transition-all ' + bgColor} style={{ width: capPct + '%' }} />
        </div>
        <span className={'text-[10px] font-mono font-semibold shrink-0 ' + color}>{pct.toFixed(0)}%</span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {props.label ? (
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-white/60">{props.label}</span>
          <span className={'text-[10px] font-mono font-semibold ' + color}>{pct.toFixed(0)}%</span>
        </div>
      ) : null}
      <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
        <div className={'h-full transition-all ' + bgColor} style={{ width: capPct + '%' }} />
      </div>
      <div className="flex items-center justify-between text-[10px] text-white/50 font-mono">
        <span>R$ {fmtBRL(props.atual)}</span>
        <span>limite R$ {fmtBRL(props.limite)}</span>
      </div>
      {excedeu ? (
        <p className={'text-[10px] ' + color}>
          Limite ultrapassado — isencao nao aplicada neste mes.
        </p>
      ) : null}
    </div>
  );
}
