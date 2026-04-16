'use client';

import { useMemo, useState } from 'react';
import { MetaInput } from './MetaInput';
import { GapChip } from './GapChip';
import { SumBanner } from './SumBanner';
import { classifySector, SECTOR_GROUPS, SUGGESTED_BY_GROUP, type SectorGroup } from './sectorGroups';
import { normalize100, sumValues, type SectorTargets, type DriftRow } from '@/lib/rebalance';

interface Props {
  targets: SectorTargets;
  sectorDrift: DriftRow[];
  onChange: (next: SectorTargets) => void;
}

interface GroupBucket {
  group: SectorGroup;
  rows: DriftRow[];
  metaSum: number;
  atualPctSum: number;
}

export function SectorTargetsEditor({ targets, sectorDrift, onChange }: Props) {
  // Filtra targets sem keys reservadas (mantem _capGroup/_segmento intactos no save)
  const cleanTargets = useMemo(() => {
    const out: Record<string, number> = {};
    for (const k in targets) {
      if (!k.startsWith('_')) out[k] = Number(targets[k]) || 0;
    }
    return out;
  }, [targets]);
  const sum = sumValues(cleanTargets);

  const driftMap = useMemo(() => new Map(sectorDrift.map((r) => [r.key, r])), [sectorDrift]);
  const allKeys = useMemo(() => {
    const s = new Set<string>();
    sectorDrift.forEach((r) => {
      if (r.atual > 0 || r.metaPct > 0) s.add(r.key);
    });
    Object.keys(cleanTargets).forEach((k) => s.add(k));
    return s;
  }, [sectorDrift, cleanTargets]);

  const buckets = useMemo<GroupBucket[]>(() => {
    const map = new Map<string, GroupBucket>();
    for (const g of Object.values(SECTOR_GROUPS)) {
      map.set(g.key, { group: g, rows: [], metaSum: 0, atualPctSum: 0 });
    }
    for (const k of allKeys) {
      const g = classifySector(k);
      const row = driftMap.get(k) ?? buildEmptyRow(k);
      const bucket = map.get(g.key)!;
      bucket.rows.push(row);
      bucket.metaSum += row.metaPct;
      bucket.atualPctSum += row.atualPct;
    }
    return Array.from(map.values())
      .filter((b) => b.rows.length > 0)
      .sort((a, b) => a.group.order - b.group.order)
      .map((b) => ({ ...b, rows: b.rows.sort((x, y) => y.atual - x.atual) }));
  }, [allKeys, driftMap]);

  // Inicializa abertos os grupos que tem meta ou posicao relevante
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (const b of buckets) {
      out[b.group.key] = b.metaSum > 0 || b.atualPctSum > 1;
    }
    return out;
  });

  function toggleGroup(key: string) {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleSet(key: string, val: number) {
    const next: SectorTargets = { ...targets };
    if (val <= 0) {
      delete next[key];
    } else {
      next[key] = val;
    }
    onChange(next);
  }

  function handleNormalize() {
    const normalized = normalize100(cleanTargets);
    const next: SectorTargets = { ...targets };
    for (const k in next) {
      if (!k.startsWith('_')) delete next[k];
    }
    Object.assign(next, normalized);
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <SumBanner sum={sum} onNormalize={handleNormalize} label="Soma setores" />
      {buckets.length === 0 && (
        <p className="text-[11px] text-white/40 italic px-2 py-3">
          Nenhum setor com peso ou posicao. Aplique um perfil ou adicione setores nos grupos abaixo.
        </p>
      )}
      <div className="space-y-2">
        {buckets.map((b) => (
          <GroupBlock
            key={b.group.key}
            bucket={b}
            isOpen={!!openGroups[b.group.key]}
            onToggle={() => toggleGroup(b.group.key)}
            onSet={handleSet}
            existingKeys={allKeys}
          />
        ))}
      </div>
      {/* Grupos completamente ausentes: dao acesso pra adicionar primeiro setor */}
      {Object.values(SECTOR_GROUPS)
        .filter((g) => !buckets.find((b) => b.group.key === g.key))
        .filter((g) => (SUGGESTED_BY_GROUP[g.key] || []).length > 0)
        .sort((a, b) => a.order - b.order)
        .map((g) => (
          <EmptyGroupAdder
            key={g.key}
            group={g}
            existingKeys={allKeys}
            onSet={handleSet}
          />
        ))}
    </div>
  );
}

function GroupBlock({
  bucket,
  isOpen,
  onToggle,
  onSet,
  existingKeys,
}: {
  bucket: GroupBucket;
  isOpen: boolean;
  onToggle: () => void;
  onSet: (key: string, val: number) => void;
  existingKeys: Set<string>;
}) {
  const { group, rows, metaSum, atualPctSum } = bucket;
  const hasMeta = metaSum > 0;

  return (
    <div className="rounded-md border border-white/[0.05] overflow-hidden bg-white/[0.01]">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-white/[0.025] transition"
      >
        <div className="flex items-center gap-2">
          <svg
            className={'w-3.5 h-3.5 text-white/40 transition-transform ' + (isOpen ? 'rotate-90' : '')}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-[11px] uppercase tracking-wider text-white/70 font-semibold">{group.label}</span>
          <span className="text-[10px] text-white/35 font-mono">{rows.length}</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono">
          <span className="text-white/40">
            atual <span className="text-white/65">{atualPctSum.toFixed(1).replace('.', ',')}%</span>
          </span>
          <span className={hasMeta ? 'text-orange-300/90' : 'text-white/25'}>
            meta <span className="font-semibold">{metaSum.toFixed(1).replace('.', ',')}%</span>
          </span>
        </div>
      </button>

      {isOpen && (
        <div className="px-3 pb-3 pt-1 space-y-1.5 border-t border-white/[0.04]">
          {rows.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-white/[0.02] hover:bg-white/[0.035] transition">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-[12px] text-white/85 truncate">{stripGroupPrefix(row.key, group.key)}</span>
                <span className="text-[10px] text-white/35 font-mono shrink-0">{row.atualPct.toFixed(1).replace('.', ',')}%</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <GapChip row={row} />
                <MetaInput
                  value={row.metaPct}
                  onCommit={(v) => onSet(row.key, v)}
                  ariaLabel={'Meta ' + row.key}
                />
              </div>
            </div>
          ))}
          <SectorAdder group={group} existingKeys={existingKeys} onSet={onSet} />
        </div>
      )}
    </div>
  );
}

function SectorAdder({
  group,
  existingKeys,
  onSet,
}: {
  group: SectorGroup;
  existingKeys: Set<string>;
  onSet: (key: string, val: number) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const suggestions = (SUGGESTED_BY_GROUP[group.key] || []).filter((s) => !existingKeys.has(s));

  function commit(name: string) {
    const trimmed = name.trim();
    if (!trimmed || existingKeys.has(trimmed)) {
      setAdding(false);
      setText('');
      return;
    }
    onSet(trimmed, 5);
    setAdding(false);
    setText('');
  }

  if (!adding) {
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="w-full px-2 py-1.5 rounded-md border border-dashed border-white/10 text-[10px] text-white/35 hover:text-white/65 hover:border-white/20 transition"
      >
        + Adicionar setor em {group.label}
      </button>
    );
  }

  return (
    <div className="space-y-1.5 p-2 rounded-md bg-white/[0.04] border border-orange-500/20">
      <input
        autoFocus
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(text);
          if (e.key === 'Escape') { setAdding(false); setText(''); }
        }}
        placeholder="Nome do setor"
        className="w-full bg-transparent text-[12px] text-white/90 placeholder:text-white/30 focus:outline-none"
      />
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => commit(s)}
              className="px-1.5 py-0.5 rounded bg-white/[0.05] hover:bg-orange-500/15 text-[10px] text-white/60 hover:text-orange-300 transition"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => commit(text)}
          disabled={!text.trim()}
          className="px-2 py-0.5 rounded bg-orange-500/15 text-orange-300 text-[10px] font-semibold hover:bg-orange-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Adicionar
        </button>
        <button
          type="button"
          onClick={() => { setAdding(false); setText(''); }}
          className="px-2 py-0.5 rounded text-[10px] text-white/40 hover:text-white/70"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function EmptyGroupAdder({
  group,
  existingKeys,
  onSet,
}: {
  group: SectorGroup;
  existingKeys: Set<string>;
  onSet: (key: string, val: number) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full px-3 py-1.5 rounded-md border border-dashed border-white/[0.06] text-[10px] text-white/30 hover:text-white/60 hover:border-white/15 transition"
      >
        + Setor em {group.label}
      </button>
    );
  }
  return (
    <div className="rounded-md border border-white/[0.05] overflow-hidden bg-white/[0.01]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.04]">
        <span className="text-[11px] uppercase tracking-wider text-white/70 font-semibold">{group.label}</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[10px] text-white/40 hover:text-white/70"
        >
          fechar
        </button>
      </div>
      <div className="p-2">
        <SectorAdder group={group} existingKeys={existingKeys} onSet={onSet} />
      </div>
    </div>
  );
}

// "FII Papel" -> "Papel" dentro do grupo FIIs; "Tecnologia INT" -> "Tecnologia" dentro de Internacional
function stripGroupPrefix(name: string, groupKey: string): string {
  if (groupKey === 'fii' && name.startsWith('FII ')) return name.slice(4);
  if (groupKey === 'int' && name.endsWith(' INT')) return name.slice(0, -4);
  return name;
}

function buildEmptyRow(key: string): DriftRow {
  return {
    key,
    label: key,
    atual: 0,
    atualPct: 0,
    metaPct: 0,
    metaVal: 0,
    gap: 0,
    gapPct: 0,
    status: 'nometa',
  };
}
