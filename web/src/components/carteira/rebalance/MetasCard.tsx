'use client';

import { useMemo } from 'react';
import { useDrift } from '@/hooks/useDrift';
import { useAppStore } from '@/store';
import { GapChip } from './GapChip';
import type { DriftRow } from '@/lib/rebalance';

interface Props {
  userId: string | undefined;
  onEdit: () => void;
}

// Card compacto no right column, abaixo de POR CLASSE.
// Estado vazio: CTA pra abrir drawer e definir metas.
// Estado ativo: aderencia + top 3 drifts + botao editar.

export function MetasCard({ userId, onEdit }: Props) {
  const drift = useDrift(userId);
  const selectedPortfolio = useAppStore((s) => s.selectedPortfolio);

  const top3 = useMemo<DriftRow[]>(() => {
    const all = [...drift.classDrift, ...drift.sectorDrift, ...drift.tickerDrift]
      .filter((r) => r.status !== 'nometa' && r.status !== 'ok');
    all.sort((a, b) => Math.abs(b.gapPct) - Math.abs(a.gapPct));
    return all.slice(0, 3);
  }, [drift.classDrift, drift.sectorDrift, drift.tickerDrift]);

  return (
    <div className="linear-card rounded-xl p-5 anim-up">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-orange-500/10">
          <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V3m0 18v-3m6-6h3M3 12h3m12.728 6.728l-2.121-2.121M7.393 7.393L5.272 5.272m13.456 0l-2.121 2.121M7.393 16.607l-2.121 2.121M9 12a3 3 0 116 0 3 3 0 01-6 0z" />
          </svg>
        </div>
        <span className="text-xs font-medium text-white/50 uppercase tracking-wider flex-1">Metas</span>
        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 font-semibold">novo</span>
      </div>

      {!drift.hasTargets ? (
        <div className="space-y-3">
          <p className="text-[12px] text-white/55 leading-relaxed">
            Defina pesos-alvo por <strong className="text-white/75">classe</strong>, <strong className="text-white/75">setor</strong> ou <strong className="text-white/75">ticker</strong> e o sistema mostra o que falta pra equilibrar.
          </p>
          <button
            type="button"
            onClick={onEdit}
            className="w-full px-3 py-2.5 rounded-lg bg-orange-500/15 border border-orange-500/25 text-orange-300 text-[12px] font-semibold hover:bg-orange-500/25 transition flex items-center justify-center gap-1.5"
          >
            Comecar
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <AccuracyMeter value={drift.accuracy} />

          {top3.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-white/[0.05]">
              <p className="text-[9px] uppercase tracking-wider text-white/35 font-semibold mb-1">Maiores desvios</p>
              {top3.map((r) => (
                <div key={r.key} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-white/[0.02]">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-white/85 truncate">{r.label}</p>
                    <p className="text-[9px] text-white/40 font-mono">
                      {r.atualPct.toFixed(1).replace('.', ',')}% / {r.metaPct.toFixed(1).replace('.', ',')}%
                    </p>
                  </div>
                  <GapChip row={r} />
                </div>
              ))}
            </div>
          )}

          {top3.length === 0 && (
            <div className="px-2 py-3 rounded-md bg-emerald-500/5 border border-emerald-500/15">
              <p className="text-[11px] text-emerald-300 font-medium">Carteira alinhada com as metas.</p>
            </div>
          )}

          {selectedPortfolio !== null && (
            <p className="text-[10px] text-white/35 leading-snug px-1">
              Drift calculado sobre o portfolio ativo. Metas sao globais.
            </p>
          )}

          <button
            type="button"
            onClick={onEdit}
            className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/75 text-[12px] font-medium hover:bg-white/[0.08] hover:text-white/90 transition flex items-center justify-center gap-1.5"
          >
            Editar metas
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

function AccuracyMeter({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-rose-500';
  const colorText = pct >= 80 ? 'text-emerald-300' : pct >= 60 ? 'text-amber-300' : 'text-rose-300';
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-white/40">Aderencia</span>
        <span className={'text-[14px] font-mono font-bold ' + colorText}>{pct}<span className="text-[10px] opacity-60">/100</span></span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div className={'h-full transition-all duration-500 ' + color} style={{ width: pct + '%' }} />
      </div>
    </div>
  );
}
