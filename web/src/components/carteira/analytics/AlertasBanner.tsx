'use client';

import { useMemo, useState } from 'react';
import { useUser } from '@/lib/queries';
import { useAppStore } from '@/store';
import { useDrift } from '@/hooks/useDrift';
import { computeConcentracao, buildCarteiraAlertas, type CarteiraAlerta } from '@/lib/portfolioMetrics';

interface Props {
  onOpenMetas: () => void;
}

// Banner inteligente no topo da Carteira.
// Computa: drift, concentracao, caixa ocioso, proximos dividendos, aderencia.
// Permite dispensar individualmente (state local — volatil, volta no proximo refresh).

export function AlertasBanner({ onOpenMetas }: Props) {
  const userQ = useUser();
  const positions = useAppStore((s) => s.positions);
  const total = useAppStore((s) => s.patrimonio.total);
  const caixa = useAppStore((s) => s.patrimonio.porClasse.caixa);
  const proventos = useAppStore((s) => s.proventos);
  const drift = useDrift(userQ.data?.id);

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const alertas = useMemo<CarteiraAlerta[]>(() => {
    const c = computeConcentracao(positions, total);

    // Maior drift absoluto entre todas as dimensoes
    const allDrift = [...drift.classDrift, ...drift.sectorDrift, ...drift.tickerDrift]
      .filter((r) => r.status !== 'nometa');
    let maxAbs = 0;
    let maxLabel: string | undefined;
    for (const r of allDrift) {
      const abs = Math.abs(r.gapPct);
      if (abs > maxAbs) {
        maxAbs = abs;
        maxLabel = r.label;
      }
    }

    // Proximo dividendo: pega ultimo provento como proxy do "proximo" (recencia ja informativa)
    // Sem futuro real — projecao baseada em historico recente
    let proxDias: number | null = null;
    let proxTicker: string | null = null;
    let proxValor: number | undefined;
    const now = Date.now();
    const sortedProv = [...proventos].sort((a, b) => b.data_pagamento.localeCompare(a.data_pagamento));
    for (const p of sortedProv) {
      const d = new Date(p.data_pagamento).getTime();
      if (Number.isNaN(d)) continue;
      // Olha so dividendos pagos nos ultimos 35d (provavel recorrencia mensal)
      const diasAtras = Math.floor((now - d) / 86400000);
      if (diasAtras >= 0 && diasAtras <= 35) {
        // Projeta proximo pagamento ~30d depois do ultimo
        const proxData = d + 30 * 86400000;
        const dias = Math.floor((proxData - now) / 86400000);
        if (dias >= 0 && dias <= 14) {
          proxDias = dias;
          proxTicker = p.ticker;
          proxValor = p.valor_total;
          break;
        }
      }
    }

    return buildCarteiraAlertas({
      totalCarteira: total,
      caixaTotal: caixa,
      numAtivos: c.numAtivos,
      hhiNormalized: c.hhiNormalized,
      top1Pct: c.top1Pct,
      top1Ticker: c.numAtivos > 0 ? topTicker(positions) : undefined,
      driftMaxAbsPp: maxAbs,
      driftMaxLabel: maxLabel,
      aderencia: drift.accuracy,
      hasTargets: drift.hasTargets,
      proximoDividendoDias: proxDias,
      proximoDividendoTicker: proxTicker,
      proximoDividendoValor: proxValor,
    });
  }, [positions, total, caixa, proventos, drift]);

  const visiveis = alertas.filter((a) => !dismissed.has(a.id));

  if (visiveis.length === 0) return null;

  return (
    <div className="space-y-1.5 mb-4">
      {visiveis.map((a) => (
        <AlertaRow key={a.id} alerta={a} onDismiss={() => setDismissed((p) => new Set(p).add(a.id))} onAction={onOpenMetas} />
      ))}
    </div>
  );
}

function topTicker(positions: { ticker: string; quantidade: number; pm: number; valor_mercado?: number }[]): string | undefined {
  let topT: string | undefined;
  let topV = 0;
  const map: Record<string, number> = {};
  for (const p of positions) {
    if ((p.quantidade || 0) <= 0) continue;
    const v = p.valor_mercado != null ? p.valor_mercado : p.pm * p.quantidade;
    map[p.ticker] = (map[p.ticker] || 0) + v;
  }
  for (const t in map) {
    if (map[t] > topV) { topV = map[t]; topT = t; }
  }
  return topT;
}

function AlertaRow({ alerta, onDismiss, onAction }: { alerta: CarteiraAlerta; onDismiss: () => void; onAction: () => void }) {
  const styles = severityStyles(alerta.severity);
  return (
    <div className={'flex items-start gap-3 px-4 py-2.5 rounded-lg border ' + styles.bg + ' ' + styles.border}>
      <div className={'shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 ' + styles.iconBg}>
        <svg className={'w-3 h-3 ' + styles.iconText} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          {alerta.severity === 'attention' ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-3l-6.93-12a2 2 0 00-3.48 0L3.34 16a2 2 0 001.73 3z" />
          ) : alerta.severity === 'warn' ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M3 12a9 9 0 1118 0 9 9 0 01-18 0z" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M3 12a9 9 0 1118 0 9 9 0 01-18 0z" />
          )}
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className={'text-[12px] font-semibold ' + styles.title}>{alerta.title}</p>
        <p className="text-[11px] text-white/55 leading-snug">{alerta.description}</p>
      </div>
      {alerta.action && (
        <button
          type="button"
          onClick={onAction}
          className={'shrink-0 px-2.5 py-1 rounded-md text-[10px] font-semibold transition ' + styles.actionBtn}
        >
          {alerta.action}
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 w-5 h-5 rounded-md text-white/30 hover:text-white/70 hover:bg-white/[0.05] transition flex items-center justify-center"
        aria-label="Dispensar alerta"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function severityStyles(s: 'info' | 'warn' | 'attention') {
  if (s === 'attention') {
    return {
      bg: 'bg-rose-500/[0.06]',
      border: 'border-rose-500/20',
      iconBg: 'bg-rose-500/20',
      iconText: 'text-rose-300',
      title: 'text-rose-200',
      actionBtn: 'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25',
    };
  }
  if (s === 'warn') {
    return {
      bg: 'bg-amber-500/[0.05]',
      border: 'border-amber-500/20',
      iconBg: 'bg-amber-500/20',
      iconText: 'text-amber-300',
      title: 'text-amber-200',
      actionBtn: 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25',
    };
  }
  return {
    bg: 'bg-blue-500/[0.05]',
    border: 'border-blue-500/15',
    iconBg: 'bg-blue-500/20',
    iconText: 'text-blue-300',
    title: 'text-blue-200',
    actionBtn: 'bg-blue-500/15 text-blue-300 hover:bg-blue-500/25',
  };
}
