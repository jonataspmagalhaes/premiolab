'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/store';
import { computeConcentracao, type TopAtivo } from '@/lib/portfolioMetrics';

// Card compacto: top ativos, HHI, concentracao por setor.

export function ConcentracaoCard() {
  const positions = useAppStore((s) => s.positions);
  const total = useAppStore((s) => s.patrimonio.total);

  const m = useMemo(() => computeConcentracao(positions, total), [positions, total]);

  const statusColor = m.status === 'ok'
    ? 'text-emerald-300'
    : m.status === 'moderada' ? 'text-amber-300' : 'text-rose-300';
  const statusBgClass = m.status === 'ok'
    ? 'bg-emerald-500/10 border-emerald-500/20'
    : m.status === 'moderada' ? 'bg-amber-500/10 border-amber-500/20' : 'bg-rose-500/10 border-rose-500/20';
  const statusLabel = m.status === 'ok' ? 'Diversificada' : m.status === 'moderada' ? 'Moderada' : 'Concentrada';

  if (m.numAtivos === 0) {
    return null;
  }

  return (
    <div className="linear-card rounded-xl p-5 anim-up h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-orange-500/10">
          <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
        </div>
        <span className="text-xs font-medium text-white/50 uppercase tracking-wider flex-1">Concentracao</span>
        <span className={'text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ' + statusBgClass + ' ' + statusColor}>
          {statusLabel}
        </span>
      </div>

      <div className="space-y-3 flex-1 flex flex-col">
        {/* Top N grid — quanto da carteira esta nos N maiores ativos */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1.5">% nos maiores ativos</p>
          <div className="grid grid-cols-3 gap-2">
            <Tile label="1 maior" value={m.top1Pct} ativos={m.topAtivos.slice(0, 1)} />
            <Tile label="3 maiores" value={m.top3Pct} ativos={m.topAtivos.slice(0, 3)} />
            <Tile label="5 maiores" value={m.top5Pct} ativos={m.topAtivos.slice(0, 5)} />
          </div>
          <p className="text-[10px] text-white/35 italic mt-1.5 leading-snug">
            Passe o mouse sobre cada bloco pra ver os ativos.
          </p>
        </div>

        {/* HHI bar */}
        <div className="pt-2 border-t border-white/[0.05]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider text-white/40">Indice de concentracao</span>
            <span className={'text-[12px] font-mono font-bold ' + statusColor}>{m.hhiNormalized.toFixed(0)}<span className="text-[9px] opacity-60">/100</span></span>
          </div>
          <div className="relative h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className={
                'h-full transition-all duration-500 ' +
                (m.status === 'ok' ? 'bg-emerald-500' : m.status === 'moderada' ? 'bg-amber-500' : 'bg-rose-500')
              }
              style={{ width: Math.min(100, m.hhiNormalized) + '%' }}
            />
            {/* Marcadores de threshold */}
            <div className="absolute top-0 bottom-0 w-px bg-white/15" style={{ left: '15%' }} />
            <div className="absolute top-0 bottom-0 w-px bg-white/15" style={{ left: '25%' }} />
          </div>
          <div className="flex justify-between text-[8px] text-white/25 mt-1 font-mono">
            <span>diversa</span>
            <span>moderada</span>
            <span>alta</span>
          </div>
        </div>

        {/* Setor mais concentrado */}
        {m.top1Setor && (
          <div className="px-2 py-1.5 rounded-md bg-white/[0.02]">
            <p className="text-[10px] uppercase tracking-wider text-white/40 mb-0.5">Maior setor</p>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-white/85 truncate">{m.top1Setor.setor}</span>
              <span className="text-[11px] font-mono font-semibold text-orange-300">{m.top1Setor.pct.toFixed(1).replace('.', ',')}%</span>
            </div>
          </div>
        )}

        {/* Stats finais */}
        <div className="grid grid-cols-3 gap-1.5 text-center">
          <Stat label="Ativos" value={String(m.numAtivos)} />
          <Stat label="Relevantes" value={String(m.numAtivosRelevantes)} hint=">1%" />
          <Stat label="Dominantes" value={String(m.numAtivosDominantes)} hint=">5%" />
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, ativos }: { label: string; value: number; ativos?: TopAtivo[] }) {
  return (
    <div className="group relative px-2 py-1.5 rounded-md bg-white/[0.025] text-center cursor-help">
      <p className="text-[9px] uppercase tracking-wider text-white/40">{label}</p>
      <p className="text-[13px] font-mono font-bold text-white/90 mt-0.5">{value.toFixed(1).replace('.', ',')}%</p>
      {ativos && ativos.length > 0 && (
        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          <div className="bg-[#0e1118] border border-white/[0.1] rounded-lg shadow-2xl px-3 py-2 min-w-[140px]">
            <p className="text-[9px] uppercase tracking-wider text-white/40 mb-1.5">{label}</p>
            <div className="space-y-1">
              {ativos.map((a) => (
                <div key={a.ticker} className="flex items-center justify-between gap-3 text-[11px]">
                  <span className="font-mono font-semibold text-white/90">{a.ticker}</span>
                  <span className="font-mono text-orange-300">{a.pct.toFixed(1).replace('.', ',')}%</span>
                </div>
              ))}
            </div>
          </div>
          <div className="w-2 h-2 bg-[#0e1118] border-r border-b border-white/[0.1] rotate-45 mx-auto -mt-1" />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-[14px] font-mono font-bold text-white/85">{value}</p>
      <p className="text-[9px] uppercase tracking-wider text-white/40">
        {label}{hint && <span className="ml-0.5 text-white/25">{hint}</span>}
      </p>
    </div>
  );
}
