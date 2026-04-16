'use client';

import { MetaInput } from './MetaInput';
import { GapChip } from './GapChip';
import { SumBanner } from './SumBanner';
import { AssetClassIcon } from '@/components/AssetClassIcon';
import { labelForClass, normalize100, sumValues, type ClassTargets, type DriftRow } from '@/lib/rebalance';

interface Props {
  targets: ClassTargets;
  classDrift: DriftRow[];
  onChange: (next: ClassTargets) => void;
}

// Universo de classes: as que ja tem valor + as que tem meta + algumas conhecidas
const KNOWN_CLASSES = ['acao', 'fii', 'etf', 'stock_int', 'bdr', 'adr', 'reit', 'cripto', 'rf', 'fundo', 'caixa'];

export function ClassTargetsEditor({ targets, classDrift, onChange }: Props) {
  // Universo de keys mostradas
  const driftMap = new Map(classDrift.map((r) => [r.key, r]));
  const presentKeys = new Set<string>([
    ...classDrift.filter((r) => r.atual > 0 || r.metaPct > 0).map((r) => r.key),
    ...Object.keys(targets),
  ]);
  // Inclui defaults principais pra primeira edicao
  KNOWN_CLASSES.slice(0, 4).forEach((k) => presentKeys.add(k));

  const orderedKeys = KNOWN_CLASSES.filter((k) => presentKeys.has(k))
    .concat(Array.from(presentKeys).filter((k) => !KNOWN_CLASSES.includes(k)));

  const sum = sumValues(targets);

  function handleSet(key: string, val: number) {
    const next: ClassTargets = { ...targets };
    if (val <= 0) {
      delete next[key];
    } else {
      next[key] = val;
    }
    onChange(next);
  }

  function handleNormalize() {
    onChange(normalize100(targets));
  }

  return (
    <div className="space-y-2">
      <SumBanner sum={sum} onNormalize={handleNormalize} label="Soma classes" />
      <div className="grid grid-cols-1 gap-1.5">
        {orderedKeys.map((k) => {
          const row = driftMap.get(k);
          const meta = Number(targets[k]) || 0;
          const atualPct = row?.atualPct ?? 0;
          return (
            <div key={k} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-white/[0.02] hover:bg-white/[0.035] transition">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <AssetClassIcon classe={k} size="sm" title={labelForClass(k)} />
                <span className="text-[12px] font-medium text-white/80 truncate">{labelForClass(k)}</span>
                <span className="text-[10px] text-white/35 font-mono shrink-0">{atualPct.toFixed(1).replace('.', ',')}%</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {row && <GapChip row={row} />}
                <MetaInput value={meta} onCommit={(v) => handleSet(k, v)} ariaLabel={'Meta ' + labelForClass(k)} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
