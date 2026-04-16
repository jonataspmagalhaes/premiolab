// Core logic do rebalanceamento — funcoes puras, sem React.
// Schema espelha a tabela rebalance_targets (JSONB flat, 100% por nivel).

import type { Position, RendaFixa, Fundo, Caixa } from '@/store';
import { resolveSector, resolveIntSubcategoria } from '@/lib/sectorOverrides';

// ───────────── Types ─────────────

export type ClassTargets = Record<string, number>;
export type SectorTargets = Record<string, number>;
export type TickerTargets = { _flat?: Record<string, number> } & Record<string, unknown>;

export interface RebalanceTargets {
  class_targets: ClassTargets;
  sector_targets: SectorTargets;
  ticker_targets: TickerTargets;
  updated_at?: string | null;
}

export type DriftStatus = 'ok' | 'under' | 'over' | 'nometa';

export interface DriftRow {
  key: string;
  label: string;
  atual: number;
  atualPct: number;
  metaPct: number;
  metaVal: number;
  gap: number;            // R$: meta - atual (>0 underweight, <0 overweight)
  gapPct: number;         // pp: metaPct - atualPct
  status: DriftStatus;
}

export interface AporteSuggestion {
  ticker: string;
  categoria: string;
  sector: string;
  cotas: number;
  preco: number;
  valor: number;
  motivo: 'class_deficit' | 'sector_deficit' | 'ticker_deficit';
  novo?: boolean; // ticker planejado sem posicao atual
}

// Ticker planejado: usuario definiu meta mas nao tem posicao.
// Preco vem de fetchPrices on-demand (nao persistido).
export interface PlannedTicker {
  ticker: string;
  categoria: string;
  preco: number;
}

// ───────────── Helpers ─────────────

export const CLASS_LABELS_PT: Record<string, string> = {
  acao: 'Ações',
  fii: 'FIIs',
  etf: 'ETFs BR',
  bdr: 'BDRs',
  stock_int: 'Stocks INT',
  adr: 'ADRs',
  reit: 'REITs',
  cripto: 'Cripto',
  rf: 'Renda Fixa',
  fundo: 'Fundos',
  caixa: 'Caixa',
};

export function labelForClass(key: string): string {
  return CLASS_LABELS_PT[key] ?? key;
}

export function classifyDrift(gapPct: number): DriftStatus {
  const abs = Math.abs(gapPct);
  if (abs < 1) return 'ok';
  return gapPct > 0 ? 'under' : 'over';
}

function roundPct(x: number): number {
  return Math.round(x * 10) / 10;
}

export function sumValues(obj: Record<string, number>): number {
  let s = 0;
  for (const k in obj) s += Number(obj[k]) || 0;
  return s;
}

// Redistribui proporcionalmente quando o usuario altera uma chave.
// Os demais pesos mantem a razao entre si e somam (100 - newVal).
export function redistribute(
  obj: Record<string, number>,
  changedKey: string,
  newVal: number,
): Record<string, number> {
  const clamped = Math.max(0, Math.min(100, newVal));
  const out: Record<string, number> = { ...obj, [changedKey]: clamped };
  const othersKeys = Object.keys(out).filter((k) => k !== changedKey);
  if (othersKeys.length === 0) return out;
  const othersSum = othersKeys.reduce((s, k) => s + (Number(out[k]) || 0), 0);
  const remaining = 100 - clamped;
  if (othersSum <= 0) {
    const each = remaining / othersKeys.length;
    for (const k of othersKeys) out[k] = roundPct(each);
  } else {
    for (const k of othersKeys) {
      const share = (Number(out[k]) || 0) / othersSum;
      out[k] = roundPct(share * remaining);
    }
  }
  // correcao de arredondamento (fecha em 100 na chave modificada nao, na maior outra)
  const final = sumValues(out);
  const diff = 100 - final;
  if (Math.abs(diff) > 0.01 && othersKeys.length > 0) {
    const biggest = othersKeys.reduce((a, b) => ((Number(out[a]) || 0) >= (Number(out[b]) || 0) ? a : b));
    out[biggest] = roundPct((Number(out[biggest]) || 0) + diff);
  }
  return out;
}

// Normaliza um dict para somar 100 preservando as razoes atuais.
export function normalize100(obj: Record<string, number>): Record<string, number> {
  const total = sumValues(obj);
  if (total <= 0) return { ...obj };
  const out: Record<string, number> = {};
  const keys = Object.keys(obj);
  for (const k of keys) out[k] = roundPct((Number(obj[k]) || 0) * 100 / total);
  const diff = 100 - sumValues(out);
  if (Math.abs(diff) > 0.01 && keys.length > 0) {
    const biggest = keys.reduce((a, b) => (out[a] >= out[b] ? a : b));
    out[biggest] = roundPct(out[biggest] + diff);
  }
  return out;
}

// ───────────── Value extractors ─────────────

// Valor de mercado de uma position (usa preco_atual, fallback pm).
export function positionValue(p: Position): number {
  if (p.valor_mercado != null) return p.valor_mercado;
  const preco = p.preco_atual ?? p.pm;
  return preco * (p.quantidade || 0);
}

// Classe efetiva da posicao — mantem simples: usa p.categoria direto.
// INT nao sub-divide aqui (fica granular demais pra nivel classe).
export function classKeyOf(p: Position): string {
  return p.categoria || 'acao';
}

// Agrega valores por classe considerando positions + rf + fundos + caixa.
// Retorna dict com as 11 chaves conhecidas (zeradas se vazias).
export function aggregateByClass(
  positions: Position[],
  rf: RendaFixa[],
  fundos: Fundo[],
  caixa: Caixa[],
  usdBrl: number,
): Record<string, number> {
  const map: Record<string, number> = {
    acao: 0, fii: 0, etf: 0, bdr: 0, stock_int: 0, adr: 0, reit: 0, cripto: 0,
    rf: 0, fundo: 0, caixa: 0,
  };
  for (const p of positions) {
    if ((p.quantidade || 0) <= 0) continue;
    const k = classKeyOf(p);
    map[k] = (map[k] || 0) + positionValue(p);
  }
  for (const r of rf) {
    map.rf += (r.valor_mtm != null ? r.valor_mtm : r.valor_aplicado) || 0;
  }
  for (const f of fundos) {
    map.fundo += (f.valor_mtm != null ? f.valor_mtm : f.valor_aplicado) || 0;
  }
  for (const c of caixa) {
    const v = Number(c.valor) || 0;
    if (c.moeda === 'USD') map.caixa += usdBrl > 0 ? v * usdBrl : 0;
    else map.caixa += v;
  }
  return map;
}

// Agrega por setor usando resolveSector. RF/fundo/caixa nao entram (setor nao se aplica).
export function aggregateBySector(positions: Position[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const p of positions) {
    if ((p.quantidade || 0) <= 0) continue;
    const sec = resolveSector({ ticker: p.ticker, categoria: p.categoria, sector: p.sector, industry: p.industry }) || 'Outros';
    map[sec] = (map[sec] || 0) + positionValue(p);
  }
  return map;
}

// Agrega por ticker.
export function aggregateByTicker(positions: Position[]): Record<string, { valor: number; categoria: string; sector: string }> {
  const map: Record<string, { valor: number; categoria: string; sector: string }> = {};
  for (const p of positions) {
    if ((p.quantidade || 0) <= 0) continue;
    const key = (p.ticker || '').toUpperCase();
    if (!map[key]) {
      const sec = resolveSector({ ticker: p.ticker, categoria: p.categoria, sector: p.sector, industry: p.industry }) || 'Outros';
      map[key] = { valor: 0, categoria: p.categoria || 'acao', sector: sec };
    }
    map[key].valor += positionValue(p);
  }
  return map;
}

// ───────────── Drift computation ─────────────

export function computeClassDrift(
  atuaisMap: Record<string, number>,
  targets: ClassTargets,
  total: number,
): DriftRow[] {
  if (!total || total <= 0) return [];
  const keys = new Set<string>([...Object.keys(atuaisMap), ...Object.keys(targets)]);
  const rows: DriftRow[] = [];
  for (const k of keys) {
    const atual = Number(atuaisMap[k]) || 0;
    const atualPct = (atual / total) * 100;
    const hasMeta = targets[k] != null;
    const metaPct = hasMeta ? Number(targets[k]) || 0 : 0;
    const metaVal = (metaPct / 100) * total;
    const gap = metaVal - atual;
    const gapPct = metaPct - atualPct;
    rows.push({
      key: k,
      label: labelForClass(k),
      atual,
      atualPct,
      metaPct,
      metaVal,
      gap,
      gapPct,
      status: hasMeta ? classifyDrift(gapPct) : 'nometa',
    });
  }
  return rows.sort((a, b) => b.atual - a.atual);
}

export function computeSectorDrift(
  atuaisMap: Record<string, number>,
  targets: SectorTargets,
  total: number,
): DriftRow[] {
  if (!total || total <= 0) return [];
  const keys = new Set<string>([...Object.keys(atuaisMap), ...Object.keys(targets || {})]);
  const rows: DriftRow[] = [];
  for (const k of keys) {
    if (k.startsWith('_')) continue; // keys reservadas (_capGroup etc)
    const atual = Number(atuaisMap[k]) || 0;
    const atualPct = (atual / total) * 100;
    const hasMeta = targets[k] != null;
    const metaPct = hasMeta ? Number(targets[k]) || 0 : 0;
    const metaVal = (metaPct / 100) * total;
    const gap = metaVal - atual;
    const gapPct = metaPct - atualPct;
    rows.push({
      key: k,
      label: k,
      atual,
      atualPct,
      metaPct,
      metaVal,
      gap,
      gapPct,
      status: hasMeta ? classifyDrift(gapPct) : 'nometa',
    });
  }
  return rows.sort((a, b) => b.atual - a.atual);
}

export function computeTickerDrift(
  atuaisMap: Record<string, { valor: number; categoria: string; sector: string }>,
  targets: TickerTargets,
  total: number,
): DriftRow[] {
  if (!total || total <= 0) return [];
  const flat = targets._flat || {};
  const keys = new Set<string>([...Object.keys(atuaisMap), ...Object.keys(flat)]);
  const rows: DriftRow[] = [];
  for (const k of keys) {
    const cur = atuaisMap[k];
    const atual = cur?.valor ?? 0;
    const atualPct = (atual / total) * 100;
    const hasMeta = flat[k] != null;
    const metaPct = hasMeta ? Number(flat[k]) || 0 : 0;
    const metaVal = (metaPct / 100) * total;
    const gap = metaVal - atual;
    const gapPct = metaPct - atualPct;
    rows.push({
      key: k,
      label: k,
      atual,
      atualPct,
      metaPct,
      metaVal,
      gap,
      gapPct,
      status: hasMeta ? classifyDrift(gapPct) : 'nometa',
    });
  }
  return rows.sort((a, b) => b.atual - a.atual);
}

// Score 0-100 — quanto menor o drift medio ponderado, maior o score.
// Apenas rows com meta contam. Penalidade linear ate 20pp.
export function computeAccuracy(rows: DriftRow[]): number {
  const withMeta = rows.filter((r) => r.status !== 'nometa');
  if (withMeta.length === 0) return 0;
  let totalWeight = 0;
  let totalPenalty = 0;
  for (const r of withMeta) {
    const weight = Math.max(1, r.metaPct || 1);
    const penalty = Math.min(20, Math.abs(r.gapPct)) / 20; // 0..1
    totalWeight += weight;
    totalPenalty += weight * penalty;
  }
  const avgPenalty = totalPenalty / totalWeight;
  return Math.round((1 - avgPenalty) * 100);
}

// ───────────── Aporte simulator ─────────────

// Estrategia: pega deficits em ordem classe→setor→ticker, aloca proporcional.
// Para cada ticker sugerido, usa preco atual da position pra calcular cotas.
// plannedTickers: tickers com meta mas sem posicao — viram "synthetic positions"
// com qty epsilon e valor 0 pra entrar no algoritmo sem distorcer o atual.
export function computeAporteSuggestions(
  positions: Position[],
  targets: RebalanceTargets,
  aporteVal: number,
  total: number,
  plannedTickers?: PlannedTicker[],
): AporteSuggestion[] {
  if (aporteVal <= 0) return [];
  const newTotal = total + aporteVal;

  // Synthetic positions pros tickers planejados: qty min, valor 0
  // (positionValue respeita valor_mercado=0, entao nao soma a classe atual).
  const realTickers = new Set(positions.filter((p) => (p.quantidade || 0) > 0).map((p) => (p.ticker || '').toUpperCase()));
  const synthetic: Position[] = (plannedTickers || [])
    .filter((pt) => pt.preco > 0 && !realTickers.has(pt.ticker.toUpperCase()))
    .map((pt) => ({
      ticker: pt.ticker.toUpperCase(),
      categoria: pt.categoria || 'acao',
      quantidade: 0.0001,
      pm: pt.preco,
      preco_atual: pt.preco,
      valor_mercado: 0,
    }));
  const allPositions = synthetic.length > 0 ? [...positions, ...synthetic] : positions;

  // 1. identifica classes com deficit (meta - atual positivo)
  const atuaisClasse: Record<string, number> = {};
  for (const p of allPositions) {
    if ((p.quantidade || 0) <= 0) continue;
    const k = classKeyOf(p);
    atuaisClasse[k] = (atuaisClasse[k] || 0) + positionValue(p);
  }
  const classDeficits: Record<string, number> = {};
  let totalClassDeficit = 0;
  for (const k in targets.class_targets) {
    const metaPct = Number(targets.class_targets[k]) || 0;
    const metaVal = (metaPct / 100) * newTotal;
    const atual = atuaisClasse[k] || 0;
    const def = metaVal - atual;
    if (def > 0) {
      classDeficits[k] = def;
      totalClassDeficit += def;
    }
  }

  // Se nao tem classe com deficit, aloca tudo proporcional aos metas positivos.
  if (totalClassDeficit === 0) {
    let totalMeta = 0;
    for (const k in targets.class_targets) totalMeta += Number(targets.class_targets[k]) || 0;
    if (totalMeta > 0) {
      for (const k in targets.class_targets) {
        const share = (Number(targets.class_targets[k]) || 0) / totalMeta;
        classDeficits[k] = share * aporteVal;
        totalClassDeficit += classDeficits[k];
      }
    }
  }

  // 2. para cada classe com deficit, aloca parcela do aporte e escolhe tickers
  const suggestions: AporteSuggestion[] = [];
  const tickerTargets = targets.ticker_targets?._flat || {};

  // Agrupa positions por classe pra lookup rapido (inclui synthetic)
  const byClasse: Record<string, Position[]> = {};
  for (const p of allPositions) {
    if ((p.quantidade || 0) <= 0) continue;
    const k = classKeyOf(p);
    if (!byClasse[k]) byClasse[k] = [];
    byClasse[k].push(p);
  }

  for (const classKey in classDeficits) {
    if (totalClassDeficit <= 0) break;
    const shareFrac = classDeficits[classKey] / totalClassDeficit;
    const classAporte = Math.min(classDeficits[classKey], shareFrac * aporteVal);
    if (classAporte <= 0) continue;

    const classPositions = byClasse[classKey] || [];

    // Tickers desta classe que tem meta definida
    const withMeta = classPositions.filter((p) => tickerTargets[(p.ticker || '').toUpperCase()] != null);

    const candidates: Position[] = withMeta.length > 0 ? withMeta : classPositions;
    if (candidates.length === 0) continue;

    // Pra cada candidato, calcula deficit individual (se tem meta) ou split igual
    let per: { pos: Position; peso: number; motivo: AporteSuggestion['motivo'] }[];
    if (withMeta.length > 0) {
      // Peso = deficit do ticker
      per = withMeta.map((p) => {
        const T = (p.ticker || '').toUpperCase();
        const metaPct = Number(tickerTargets[T]) || 0;
        const metaVal = (metaPct / 100) * newTotal;
        const atual = positionValue(p);
        const def = Math.max(0, metaVal - atual);
        return { pos: p, peso: def, motivo: 'ticker_deficit' as const };
      }).filter((x) => x.peso > 0);
      if (per.length === 0) {
        per = withMeta.map((p) => ({ pos: p, peso: 1, motivo: 'class_deficit' as const }));
      }
    } else {
      per = candidates.map((p) => ({ pos: p, peso: 1, motivo: 'class_deficit' as const }));
    }

    const pesoTotal = per.reduce((s, x) => s + x.peso, 0);
    if (pesoTotal <= 0) continue;

    for (const row of per) {
      const share = row.peso / pesoTotal;
      const perTicker = share * classAporte;
      const preco = row.pos.preco_atual ?? row.pos.pm;
      if (!preco || preco <= 0) continue;
      const cotas = Math.floor(perTicker / preco);
      if (cotas <= 0) continue;
      const valor = cotas * preco;
      if (valor < 10) continue; // evita sugestoes triviais
      const sec = resolveSector({
        ticker: row.pos.ticker,
        categoria: row.pos.categoria,
        sector: row.pos.sector,
        industry: row.pos.industry,
      });
      const isNovo = row.pos.valor_mercado === 0 && row.pos.quantidade < 1;
      suggestions.push({
        ticker: row.pos.ticker.toUpperCase(),
        categoria: row.pos.categoria,
        sector: sec,
        novo: isNovo || undefined,
        cotas,
        preco,
        valor,
        motivo: row.motivo,
      });
    }
  }

  // Ordena por valor desc, limita top 10
  return suggestions.sort((a, b) => b.valor - a.valor).slice(0, 10);
}

// ───────────── Presets ─────────────

export interface ProfilePreset {
  label: string;
  descricao: string;
  class_targets: ClassTargets;
  sector_targets?: SectorTargets;
}

export const PROFILES: Record<'conservador' | 'moderado' | 'arrojado', ProfilePreset> = {
  conservador: {
    label: 'Conservador',
    descricao: 'Renda fixa alta, baixa exposicao a volatilidade',
    class_targets: { rf: 45, fii: 25, acao: 20, etf: 10 },
    sector_targets: {
      'FII Papel': 12, 'FII Tijolo': 10, 'FII Hibrido': 3,
      'Servicos Financeiros': 6, 'Energia': 4, 'Utilidade Publica': 4, 'Saude': 3, 'Consumo Nao Ciclico': 3,
      'ETFs': 10,
    },
  },
  moderado: {
    label: 'Moderado',
    descricao: 'Equilibrio entre renda e crescimento',
    class_targets: { acao: 40, fii: 25, etf: 20, rf: 15 },
    sector_targets: {
      'FII Tijolo': 12, 'FII Papel': 10, 'FII Hibrido': 3,
      'Servicos Financeiros': 10, 'Materiais Basicos': 6, 'Energia': 6, 'Utilidade Publica': 6, 'Consumo Ciclico': 5, 'Saude': 4, 'Tecnologia': 3,
      'ETFs': 10, 'Tecnologia INT': 10,
    },
  },
  arrojado: {
    label: 'Arrojado',
    descricao: 'Foco em crescimento, tolerancia a volatilidade',
    class_targets: { acao: 50, stock_int: 20, etf: 15, fii: 10, cripto: 5 },
    sector_targets: {
      'Tecnologia': 12, 'Servicos Financeiros': 10, 'Consumo Ciclico': 8, 'Materiais Basicos': 6, 'Saude': 6, 'Energia': 4, 'Utilidade Publica': 4,
      'Tecnologia INT': 12, 'Financeiro INT': 6, 'Consumo INT': 4,
      'FII Tijolo': 6, 'FII Papel': 4,
      'ETFs': 10, 'Cripto ETF': 5,
    },
  },
};
