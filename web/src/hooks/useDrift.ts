'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/store';
import { useRebalanceTargets } from '@/lib/queries';
import {
  aggregateByClass,
  aggregateBySector,
  aggregateByTicker,
  computeClassDrift,
  computeSectorDrift,
  computeTickerDrift,
  computeAccuracy,
  type DriftRow,
  type RebalanceTargets,
} from '@/lib/rebalance';

export interface UseDriftResult {
  targets: RebalanceTargets;
  hasTargets: boolean;
  total: number;
  classDrift: DriftRow[];
  sectorDrift: DriftRow[];
  tickerDrift: DriftRow[];
  accuracy: number;
  isLoading: boolean;
}

export function useDrift(userId: string | undefined): UseDriftResult {
  const positions = useAppStore((s) => s.positions);
  const rf = useAppStore((s) => s.rf);
  const fundos = useAppStore((s) => s.fundos);
  const caixa = useAppStore((s) => s.caixa);
  const usdBrl = useAppStore((s) => s.usdBrl);
  const total = useAppStore((s) => s.patrimonio.total);

  const { data: targets, isLoading } = useRebalanceTargets(userId);

  return useMemo(() => {
    const t: RebalanceTargets = targets || { class_targets: {}, sector_targets: {}, ticker_targets: {} };
    const hasTargets =
      Object.keys(t.class_targets || {}).length > 0 ||
      Object.keys(t.sector_targets || {}).length > 0 ||
      Object.keys(t.ticker_targets?._flat || {}).length > 0;

    if (!total || total <= 0) {
      return {
        targets: t,
        hasTargets,
        total,
        classDrift: [],
        sectorDrift: [],
        tickerDrift: [],
        accuracy: 0,
        isLoading,
      };
    }

    const atuaisClasse = aggregateByClass(positions, rf, fundos, caixa, usdBrl);
    const atuaisSetor = aggregateBySector(positions);
    const atuaisTicker = aggregateByTicker(positions);

    const classDrift = computeClassDrift(atuaisClasse, t.class_targets, total);
    const sectorDrift = computeSectorDrift(atuaisSetor, t.sector_targets, total);
    const tickerDrift = computeTickerDrift(atuaisTicker, t.ticker_targets, total);

    // Accuracy considera todos os niveis com meta ponderado
    const allWithMeta = [...classDrift, ...sectorDrift, ...tickerDrift];
    const accuracy = computeAccuracy(allWithMeta);

    return {
      targets: t,
      hasTargets,
      total,
      classDrift,
      sectorDrift,
      tickerDrift,
      accuracy,
      isLoading,
    };
  }, [targets, positions, rf, fundos, caixa, usdBrl, total, isLoading]);
}
