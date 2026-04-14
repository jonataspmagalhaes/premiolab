'use client';

import { useMemo, useState } from 'react';
import { useAppStore } from '@/store';
import { resolveSector, resolveIntSubcategoria } from '@/lib/sectorOverrides';
import { AssetClassIcon } from '@/components/AssetClassIcon';
import { TickerLogo } from '@/components/TickerLogo';

// ═══════ SVG Icon ═══════

function Ico({ d, className }: { d: string; className?: string }) {
  return (
    <svg className={className || 'w-4 h-4'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

// ═══════ Sub-tab Navigation ═══════

var TABS = [
  { key: 'ativos', label: 'Ativos', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { key: 'caixa', label: 'Caixa', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' },
  { key: 'financas', label: 'Financas', icon: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z' },
];

// ═══════ Card wrapper ═══════

function Card({ title, icon, children, className, iconColor }: { title: string; icon: string; children: React.ReactNode; className?: string; iconColor?: string }) {
  var color = iconColor || 'text-orange-400';
  var bg = iconColor === 'text-income' ? 'bg-income/10' : iconColor === 'text-info' ? 'bg-info/10' : iconColor === 'text-stock-int' ? 'bg-stock-int/10' : 'bg-orange-500/10';
  return (
    <div className={'linear-card rounded-xl p-5 anim-up ' + (className || '')}>
      <div className="flex items-center gap-2 mb-4">
        <div className={'w-7 h-7 rounded-lg flex items-center justify-center ' + bg}>
          <Ico d={icon} className={'w-4 h-4 ' + color} />
        </div>
        <span className="text-xs font-medium text-white/50 uppercase tracking-wider">{title}</span>
      </div>
      {children}
    </div>
  );
}

// ═══════ TAB: Ativos ═══════
// Layout: row1 [treemap 8 | filtros+resumo 4], row2 [tabela 12]
// Portfolio selector vive no AppTopNav (global) — nao duplicar aqui

var CLASS_LABELS: Record<string, string> = {
  acao: 'Acoes',
  fii: 'FIIs',
  etf: 'ETFs',
  stock_int: 'INT',
  rf: 'RF',
  bdr: 'BDRs',
};

var CLASS_COLORS: Record<string, string> = {
  acao: 'bg-orange-500/15 text-orange-300',
  fii: 'bg-income/15 text-income',
  etf: 'bg-warning/15 text-warning',
  stock_int: 'bg-stock-int/15 text-stock-int',
  'INT Stock': 'bg-stock-int/15 text-stock-int',
  'INT ETF': 'bg-yellow-500/15 text-yellow-300',
  'INT REIT': 'bg-blue-500/15 text-blue-300',
  'INT ADR': 'bg-violet-500/15 text-violet-300',
  'INT Cripto': 'bg-pink-500/15 text-pink-300',
  bdr: 'bg-pink-600/15 text-pink-400',
  rf: 'bg-info/15 text-info',
};

var CLASS_BG_TREEMAP: Record<string, string> = {
  acao: 'bg-orange-500/30',
  fii: 'bg-income/30',
  etf: 'bg-warning/30',
  stock_int: 'bg-stock-int/30',
  rf: 'bg-info/30',
};

var FILTER_TABS: { key: string; label: string; cat?: string; mercadoInt?: boolean }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'acao', label: 'Acoes', cat: 'acao' },
  { key: 'fii', label: 'FIIs', cat: 'fii' },
  { key: 'etf', label: 'ETFs', cat: 'etf' },
  { key: 'int', label: 'INT', mercadoInt: true },
];

var SORT_OPTIONS: { key: string; label: string }[] = [
  { key: 'valor', label: 'Valor' },
  { key: 'az', label: 'A-Z' },
  { key: 'var', label: 'Variacao' },
  { key: 'pl', label: 'P&L %' },
  { key: 'dy', label: 'DY' },
  { key: 'divAno', label: 'Div Ano' },
  { key: 'div', label: 'Div Total' },
];

function fmtMoney(v: number): string {
  if (!Number.isFinite(v)) return '-';
  if (Math.abs(v) >= 1_000) return Math.round(v).toLocaleString('pt-BR');
  return v.toFixed(2).replace('.', ',');
}

// ═══════ Heatmap helpers ═══════

type HeatGroup = 'ticker' | 'classe' | 'setor';
type HeatMetric = 'geral' | 'var' | 'pl' | 'div';
type HeatPeriod = 'dia' | 'semana' | 'mes' | 'ano' | 'tudo';

// Retornos histórico das métricas — Semana/Mês/Ano precisam Fase B (histórico brapi).
// Dia/Tudo funcionam com dados que já temos.
function isPeriodAvailableForMetric(metric: HeatMetric, period: HeatPeriod): boolean {
  if (metric === 'geral') return true; // irrelevante
  if (metric === 'div') {
    return period === 'semana' || period === 'mes' || period === 'ano' || period === 'tudo';
  }
  // var or pl
  return period === 'dia' || period === 'tudo';
}

// Retorna intervalo [start, end] em ms para o período (end = agora)
function periodRange(period: HeatPeriod): { start: number; end: number } {
  const end = Date.now();
  if (period === 'semana') return { start: end - 7 * 86400000, end };
  if (period === 'mes') {
    const n = new Date();
    return { start: new Date(n.getFullYear(), n.getMonth(), 1).getTime(), end };
  }
  if (period === 'ano') {
    const n = new Date();
    return { start: new Date(n.getFullYear(), 0, 1).getTime(), end };
  }
  if (period === 'dia') return { start: end - 86400000, end };
  return { start: 0, end };
}

// Hash simples para gerar hue estavel por nome do setor
function sectorHue(sector: string): number {
  var h = 0;
  for (var i = 0; i < sector.length; i++) {
    h = (h * 31 + sector.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 360;
}

function sectorColorFor(sector: string | undefined): string {
  if (!sector) return 'rgba(255,255,255,0.04)';
  var hue = sectorHue(sector);
  return 'hsla(' + hue + ', 65%, 55%, 0.30)';
}

function heatColorForPct(pct: number | undefined): { bg: string; text: string } {
  if (pct == null || !Number.isFinite(pct)) {
    return { bg: 'rgba(255,255,255,0.04)', text: 'rgba(255,255,255,0.3)' };
  }
  // Saturation cap at ±10%
  var mag = Math.min(1, Math.abs(pct) / 10);
  var alpha = 0.12 + mag * 0.38; // 0.12 → 0.5
  if (pct >= 0) return { bg: 'rgba(34,197,94,' + alpha.toFixed(2) + ')', text: '#4ADE80' };
  return { bg: 'rgba(239,68,68,' + alpha.toFixed(2) + ')', text: '#F87171' };
}

// Retorna percentual (para Var) do ticker/grupo no periodo.
// Semana/Mes/Ano ainda nao disponiveis — retorna undefined.
function tickerVarPct(pos: { day_change_pct?: number; pl_pct?: number }, period: HeatPeriod): number | undefined {
  if (period === 'dia') return pos.day_change_pct;
  if (period === 'tudo') return pos.pl_pct;
  return undefined;
}

// Retorna P&L em valor (R$) do ticker no periodo.
function tickerPlValor(
  pos: { day_change_pct?: number; pl?: number; valor_mercado?: number },
  period: HeatPeriod,
): number | undefined {
  if (period === 'dia') {
    // P&L do dia: valor_mercado × (day_change_pct/100) ≈ variação em R$ do dia
    if (pos.valor_mercado != null && pos.day_change_pct != null) {
      return (pos.valor_mercado * pos.day_change_pct) / 100;
    }
    return undefined;
  }
  if (period === 'tudo') return pos.pl;
  return undefined;
}

// Dividendos recebidos por ticker no periodo
function dividendosPorTicker(
  proventos: Array<{ ticker: string; valor_total: number; data_pagamento: string }>,
  period: HeatPeriod,
): Record<string, number> {
  const { start, end } = periodRange(period);
  const out: Record<string, number> = {};
  for (const p of proventos) {
    const t = new Date(p.data_pagamento).getTime();
    if (Number.isNaN(t)) continue;
    if (t < start || t > end) continue;
    const tk = (p.ticker || '').toUpperCase().trim();
    if (!tk) continue;
    out[tk] = (out[tk] || 0) + (p.valor_total || 0);
  }
  return out;
}

// Gradiente verde por magnitude (para dividendos)
function greenIntensityBg(magnitude: number, max: number): string {
  if (max <= 0) return 'rgba(34,197,94,0.12)';
  const ratio = Math.min(1, magnitude / max);
  const alpha = 0.15 + ratio * 0.45;
  return 'rgba(34,197,94,' + alpha.toFixed(2) + ')';
}

function fmtPct(v: number): string {
  if (!Number.isFinite(v)) return '-';
  var s = v >= 0 ? '+' : '';
  return s + v.toFixed(1) + '%';
}

// ═══════ TreemapHeatmap — size by value, color by mode/period ═══════

interface TreemapItem {
  ticker: string;
  categoria: string;
  valor: number;
  pct: number; // % of total
  pl?: number; // P&L absoluto (R$)
  day_change_pct?: number;
  pl_pct?: number;
  portfolio_id?: string | null;
  sector?: string;
}

// Group label tile (classe ou setor agregado)
interface GroupTile {
  key: string;
  label: string;
  valor: number;
  pct: number;
  day_change_pct: number; // weighted avg
  pl_pct: number; // weighted avg
  count: number; // numero de ativos no grupo
  bgColor: string; // css color
}

function aggregateGroups(
  items: TreemapItem[],
  total: number,
  keyFn: (t: TreemapItem) => string,
  labelFn: (key: string, first: TreemapItem) => string,
  colorFn: (key: string, first: TreemapItem) => string,
): GroupTile[] {
  const buckets: Record<string, { items: TreemapItem[]; valor: number; varSum: number; plSum: number }> = {};
  for (const it of items) {
    const k = keyFn(it);
    if (!buckets[k]) buckets[k] = { items: [], valor: 0, varSum: 0, plSum: 0 };
    buckets[k].items.push(it);
    buckets[k].valor += it.valor;
    if (it.day_change_pct != null) buckets[k].varSum += it.day_change_pct * it.valor;
    if (it.pl_pct != null) buckets[k].plSum += it.pl_pct * it.valor;
  }
  const groups: GroupTile[] = [];
  for (const k in buckets) {
    const b = buckets[k];
    const first = b.items[0];
    groups.push({
      key: k,
      label: labelFn(k, first),
      valor: b.valor,
      pct: total > 0 ? (b.valor / total) * 100 : 0,
      day_change_pct: b.valor > 0 ? b.varSum / b.valor : 0,
      pl_pct: b.valor > 0 ? b.plSum / b.valor : 0,
      count: b.items.length,
      bgColor: colorFn(k, first),
    });
  }
  groups.sort((a, b) => b.valor - a.valor);
  return groups;
}

interface HeatProvento {
  ticker: string;
  valor_total: number;
  data_pagamento: string;
}

function TreemapHeatmap({
  items,
  proventos,
  total,
  group, setGroup,
  metric, setMetric,
  period, setPeriod,
  fullscreen, onToggleFullscreen,
  onTileClick,
}: {
  items: TreemapItem[];
  proventos: HeatProvento[];
  total: number;
  group: HeatGroup;
  setGroup: (g: HeatGroup) => void;
  metric: HeatMetric;
  setMetric: (m: HeatMetric) => void;
  period: HeatPeriod;
  setPeriod: (p: HeatPeriod) => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onTileClick?: (key: string) => void;
}) {
  const nodes = buildTreemapData(items, proventos, total, group, metric, period);

  const GROUPS: { key: HeatGroup; label: string }[] = [
    { key: 'ticker', label: 'Ticker' },
    { key: 'classe', label: 'Classe' },
    { key: 'setor', label: 'Setor' },
  ];
  const METRICS: { key: HeatMetric; label: string }[] = [
    { key: 'geral', label: 'Geral' },
    { key: 'var', label: 'Variacao' },
    { key: 'pl', label: 'P&L' },
    { key: 'div', label: 'Dividendos' },
  ];
  const PERIODS: { key: HeatPeriod; label: string }[] = [
    { key: 'dia', label: 'Dia' },
    { key: 'semana', label: 'Semana' },
    { key: 'mes', label: 'Mes' },
    { key: 'ano', label: 'Ano' },
    { key: 'tudo', label: 'Tudo' },
  ];

  return (
    <div className={'flex flex-col ' + (fullscreen ? 'h-full' : '')}>
      {/* Header controls */}
      <div className="flex items-start gap-2 mb-3 flex-wrap">
        {/* Row 1: Agrupamento */}
        <div className="flex gap-0.5 bg-white/[0.03] rounded-lg p-0.5">
          {GROUPS.map(function (g) {
            var active = group === g.key;
            return (
              <button
                key={g.key}
                type="button"
                onClick={function () { setGroup(g.key); }}
                className={'px-2.5 py-1 rounded-md text-[11px] font-medium transition ' + (active ? 'bg-orange-500/20 text-orange-300' : 'text-white/40 hover:text-white/70')}
              >
                {g.label}
              </button>
            );
          })}
        </div>

        {/* Row 1: Metrica */}
        <div className="flex gap-0.5 bg-white/[0.03] rounded-lg p-0.5">
          {METRICS.map(function (m) {
            var active = metric === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={function () { setMetric(m.key); }}
                className={'px-2.5 py-1 rounded-md text-[11px] font-medium transition ' + (active ? 'bg-white/[0.08] text-white' : 'text-white/40 hover:text-white/70')}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onToggleFullscreen}
          className="ml-auto w-7 h-7 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] flex items-center justify-center transition shrink-0"
          title={fullscreen ? 'Sair de tela cheia' : 'Expandir'}
        >
          <svg className="w-3.5 h-3.5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            {fullscreen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 9L4 4m0 0v5m0-5h5M15 9l5-5m0 0v5m0-5h-5M9 15l-5 5m0 0v-5m0 5h5M15 15l5 5m0 0v-5m0 5h-5" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5M20 8V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5M20 16v4m0 0h-4m4 0l-5-5" />
            )}
          </svg>
        </button>

        {/* Row 2: Periodo — visivel quando metrica != geral */}
        {metric !== 'geral' && (
          <div className="basis-full flex gap-0.5 bg-white/[0.03] rounded-lg p-0.5 w-fit">
            {PERIODS.map(function (p) {
              var active = period === p.key;
              var available = isPeriodAvailableForMetric(metric, p.key);
              return (
                <button
                  key={p.key}
                  type="button"
                  disabled={!available}
                  onClick={function () { if (available) setPeriod(p.key); }}
                  title={available ? undefined : 'Precisa historico (em breve)'}
                  className={'px-2.5 py-1 rounded-md text-[11px] font-medium transition ' + (active && available ? 'bg-white/[0.08] text-white' : (available ? 'text-white/40 hover:text-white/70' : 'text-white/15 cursor-not-allowed'))}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Tiles */}
      <div className={'flex flex-wrap gap-1 content-start ' + (fullscreen ? 'flex-1 overflow-y-auto' : 'max-h-[480px] sm:max-h-[420px] overflow-y-auto pr-1')}>
        {nodes.length === 0 && (
          <div className="w-full h-full flex items-center justify-center text-white/30 text-sm italic">
            {metric === 'div' ? 'Nenhum dividendo no periodo selecionado' : 'Sem dados para exibir'}
          </div>
        )}
        {nodes.map(function (n, idx) {
          // Mobile: pisos menores, mais tiles por linha
          var floor = fullscreen ? 7 : 12;
          var ceil = fullscreen ? 55 : 48;
          var basisPct = Math.min(ceil, Math.max(floor, n.sizePct * (fullscreen ? 0.55 : 0.45)));
          return (
            <button
              key={n.key + '|' + idx}
              type="button"
              onClick={function () { onTileClick && onTileClick(n.key); }}
              className="rounded-lg flex flex-col justify-end p-1.5 sm:p-2 overflow-hidden leading-tight text-left hover:ring-1 hover:ring-white/30 active:ring-2 active:ring-white/40 transition cursor-pointer"
              style={{
                flexBasis: 'calc(' + basisPct.toFixed(2) + '% - 4px)',
                flexGrow: 0,
                flexShrink: 0,
                minHeight: fullscreen ? 80 : 56,
                backgroundColor: n.fill,
              }}
              title={n.tooltip}
            >
              <p className={'font-bold truncate ' + (fullscreen ? 'text-[15px]' : 'text-[11px]')}>{n.name}</p>
              <p className={'text-white/55 font-mono truncate ' + (fullscreen ? 'text-[11px]' : 'text-[9px]')}>{n.subLine}</p>
              {n.badge && (
                <p
                  className={'font-mono font-semibold truncate ' + (fullscreen ? 'text-[13px]' : 'text-[10px]')}
                  style={{ color: n.badgeColor || 'inherit' }}
                >
                  {n.badge}{n.subBadge ? ' · ' + n.subBadge : ''}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ═══════ Treemap data ═══════

interface HeatNode {
  key: string;
  name: string;
  fill: string;
  sizePct: number; // base para flex-grow (0–100)
  subLine: string; // R$ X · Y%
  badge?: string; // +2.1% ou +R$ 500
  badgeColor?: string;
  subBadge?: string; // "3 ativos"
  tooltip: string;
}

// Chave de agrupamento
function groupKeyForItem(t: TreemapItem, group: HeatGroup): string {
  if (group === 'ticker') return t.ticker;
  if (group === 'classe') {
    // Subdividir INT em Stock/ETF/ADR/REIT/Cripto
    if (t.categoria === 'stock_int') return resolveIntSubcategoria(t.ticker);
    return t.categoria || 'acao';
  }
  return resolveSector({ ticker: t.ticker, categoria: t.categoria, sector: t.sector });
}

function groupDisplayName(key: string, group: HeatGroup): string {
  if (group === 'ticker') return key;
  if (group === 'classe') {
    // INT subclasses já vêm formatadas (ex: "INT ETF")
    if (key.startsWith('INT ')) return key;
    return CLASS_LABELS[key] || key;
  }
  return key;
}

const CLASS_COLOR_MAP: Record<string, string> = {
  acao: 'rgba(249,115,22,0.35)',
  fii: 'rgba(34,197,94,0.35)',
  etf: 'rgba(245,158,11,0.35)',
  stock_int: 'rgba(232,121,249,0.35)',
  'INT Stock': 'rgba(232,121,249,0.35)', // roxo
  'INT ETF': 'rgba(250,204,21,0.35)',    // amarelo
  'INT REIT': 'rgba(59,130,246,0.35)',   // azul
  'INT ADR': 'rgba(168,85,247,0.35)',    // violeta
  'INT Cripto': 'rgba(244,114,182,0.35)', // rosa
  bdr: 'rgba(236,72,153,0.35)',
  rf: 'rgba(6,182,212,0.35)',
};

function groupBaseColor(key: string, group: HeatGroup, firstItem?: TreemapItem): string {
  if (group === 'classe') return CLASS_COLOR_MAP[key] || CLASS_COLOR_MAP.acao;
  if (group === 'setor') return sectorColorFor(key);
  // ticker → colore pela classe (ou subclasse de INT)
  if (firstItem) {
    if (firstItem.categoria === 'stock_int') {
      const sub = resolveIntSubcategoria(firstItem.ticker);
      return CLASS_COLOR_MAP[sub] || CLASS_COLOR_MAP.stock_int;
    }
    const cat = firstItem.categoria || 'acao';
    return CLASS_COLOR_MAP[cat] || CLASS_COLOR_MAP.acao;
  }
  return CLASS_COLOR_MAP.acao;
}

function buildTreemapData(
  items: TreemapItem[],
  proventos: HeatProvento[],
  totalCarteira: number,
  group: HeatGroup,
  metric: HeatMetric,
  period: HeatPeriod,
): HeatNode[] {
  // Dividendos por ticker no periodo
  const divMap = metric === 'div' ? dividendosPorTicker(proventos, period) : {};

  // Agrupa items pela chave escolhida
  type Bucket = {
    key: string;
    tickers: TreemapItem[];
    valor: number; // soma valor_mercado
    plValor: number; // soma P&L (R$)
    varValor: number; // soma variacao dia em R$
    divValor: number; // soma dividendos no periodo
    categoriaPrimaria: string;
  };
  const buckets: Record<string, Bucket> = {};
  for (const t of items) {
    const k = groupKeyForItem(t, group);
    if (!buckets[k]) {
      buckets[k] = { key: k, tickers: [], valor: 0, plValor: 0, varValor: 0, divValor: 0, categoriaPrimaria: t.categoria || 'acao' };
    }
    const b = buckets[k];
    b.tickers.push(t);
    b.valor += t.valor;
    if (t.pl != null) b.plValor += t.pl;
    // Var em R$ do dia: valor × day_change / 100 (quando disponivel)
    if (t.day_change_pct != null) b.varValor += (t.valor * t.day_change_pct) / 100;
    // Dividendos por ticker (usado em qualquer agrupamento)
    b.divValor += divMap[t.ticker] || 0;
  }

  const bucketList = Object.values(buckets);

  // Decide size + fill + badge por métrica
  // Tamanho SEMPRE proporcional ao peso na carteira (% de totalCarteira).
  // Normalizado ao maior bucket = 100 (pra render escalar uniformemente).
  const maxValor = Math.max(1, ...bucketList.map((x) => x.valor));
  const sizePctOf = (valor: number) => (valor / maxValor) * 100;
  const pesoCarteiraOf = (valor: number) => (totalCarteira > 0 ? (valor / totalCarteira) * 100 : 0);
  const subBadgeFor = (b: Bucket) => (group !== 'ticker' ? (b.tickers.length + (b.tickers.length === 1 ? ' ativo' : ' ativos')) : undefined);

  if (metric === 'geral') {
    bucketList.sort((a, b) => b.valor - a.valor);
    return bucketList.map((b) => {
      const peso = pesoCarteiraOf(b.valor);
      return {
        key: b.key,
        name: groupDisplayName(b.key, group),
        fill: groupBaseColor(b.key, group, b.tickers[0]),
        sizePct: sizePctOf(b.valor),
        subLine: 'R$ ' + fmtMoney(b.valor) + ' · ' + peso.toFixed(1) + '%',
        subBadge: subBadgeFor(b),
        tooltip: groupDisplayName(b.key, group) + '  R$ ' + fmtMoney(b.valor) + '  ' + peso.toFixed(1) + '% da carteira',
      };
    });
  }

  if (metric === 'var') {
    // Tamanho = magnitude da variação % (normalizada ao maior do conjunto filtrado).
    // Cor = verde/vermelho por sinal.
    const withPct = bucketList
      .map((b) => ({ b, pct: b.valor > 0 ? (b.varValor / b.valor) * 100 : 0 }))
      .filter((x) => Number.isFinite(x.pct) && x.pct !== 0);
    const maxPct = Math.max(1e-6, ...withPct.map((x) => Math.abs(x.pct)));
    // Remove variações insignificantes (< 3% do maior) para nao poluir
    const significant = withPct.filter((x) => Math.abs(x.pct) >= maxPct * 0.03);
    significant.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
    return significant.map(({ b, pct }) => {
      const peso = pesoCarteiraOf(b.valor);
      const color = heatColorForPct(pct);
      return {
        key: b.key,
        name: groupDisplayName(b.key, group),
        fill: color.bg,
        sizePct: (Math.abs(pct) / maxPct) * 100,
        subLine: 'R$ ' + fmtMoney(b.valor) + ' · ' + peso.toFixed(1) + '%',
        badge: fmtPct(pct),
        badgeColor: color.text,
        subBadge: subBadgeFor(b),
        tooltip: groupDisplayName(b.key, group) + '  ' + fmtPct(pct) + '  (' + (b.varValor >= 0 ? '+' : '') + 'R$ ' + fmtMoney(b.varValor) + ')',
      };
    });
  }

  if (metric === 'pl') {
    // Tamanho = magnitude do P&L em R$ (normalizada).
    const maxAbs = Math.max(1, ...bucketList.map((x) => Math.abs(x.plValor)));
    const significant = bucketList.filter((b) => b.plValor !== 0 && Math.abs(b.plValor) >= maxAbs * 0.03);
    significant.sort((a, b) => Math.abs(b.plValor) - Math.abs(a.plValor));
    return significant.map((b) => {
      const peso = pesoCarteiraOf(b.valor);
      const plPct = b.valor > 0 ? (b.plValor / b.valor) * 100 : 0;
      const color = heatColorForPct(plPct);
      return {
        key: b.key,
        name: groupDisplayName(b.key, group),
        fill: color.bg,
        sizePct: (Math.abs(b.plValor) / maxAbs) * 100,
        subLine: 'R$ ' + fmtMoney(b.valor) + ' · ' + peso.toFixed(1) + '%',
        badge: (b.plValor >= 0 ? '+' : '') + 'R$ ' + fmtMoney(b.plValor),
        badgeColor: color.text,
        subBadge: subBadgeFor(b),
        tooltip: groupDisplayName(b.key, group) + '  P&L R$ ' + fmtMoney(b.plValor) + '  (' + fmtPct(plPct) + ')',
      };
    });
  }

  // metric === 'div' — tamanho = magnitude do dividendo recebido
  const maxDiv = Math.max(1, ...bucketList.map((x) => x.divValor));
  const withDiv = bucketList.filter((b) => b.divValor > 0 && b.divValor >= maxDiv * 0.03);
  withDiv.sort((a, b) => b.divValor - a.divValor);
  return withDiv.map((b) => {
    const peso = pesoCarteiraOf(b.valor);
    return {
      key: b.key,
      name: groupDisplayName(b.key, group),
      fill: greenIntensityBg(b.divValor, maxDiv),
      sizePct: (b.divValor / maxDiv) * 100,
      subLine: 'R$ ' + fmtMoney(b.valor) + ' · ' + peso.toFixed(1) + '%',
      badge: 'R$ ' + fmtMoney(b.divValor),
      badgeColor: '#4ADE80',
      subBadge: subBadgeFor(b),
      tooltip: groupDisplayName(b.key, group) + '  Dividendos: R$ ' + fmtMoney(b.divValor) + '  (peso ' + peso.toFixed(1) + '%)',
    };
  });
}


// ═══════ TileDetailModal — abre ao clicar num tile do heatmap ═══════

interface DivSummaryType {
  total12m: number;
  totalAno: number;
  totalAll: number;
  allByTicker: Record<string, number>;
  anoByTicker: Record<string, number>;
}

function TileDetailModal({
  selectedKey, group, items, totalCarteira, dyByTicker, divSummary, onClose,
}: {
  selectedKey: string;
  group: HeatGroup;
  items: TreemapItem[];
  totalCarteira: number;
  dyByTicker: Record<string, number>;
  divSummary: DivSummaryType;
  onClose: () => void;
}) {
  // Encontra os items que pertencem a esse tile
  var matching: TreemapItem[] = [];
  if (group === 'ticker') {
    matching = items.filter(function (t) { return t.ticker === selectedKey; });
  } else if (group === 'classe') {
    matching = items.filter(function (t) {
      var k = t.categoria === 'stock_int' ? resolveIntSubcategoria(t.ticker) : (t.categoria || 'acao');
      return k === selectedKey;
    });
  } else {
    matching = items.filter(function (t) {
      return resolveSector({ ticker: t.ticker, categoria: t.categoria, sector: t.sector }) === selectedKey;
    });
  }

  if (matching.length === 0) return null;

  var totalValor = matching.reduce(function (a, t) { return a + t.valor; }, 0);
  var pesoCarteira = totalCarteira > 0 ? (totalValor / totalCarteira) * 100 : 0;
  var totalDivAno = matching.reduce(function (a, t) { return a + (divSummary.anoByTicker[t.ticker] || 0); }, 0);
  var totalDivAll = matching.reduce(function (a, t) { return a + (divSummary.allByTicker[t.ticker] || 0); }, 0);
  var dyAvg = totalValor > 0
    ? matching.reduce(function (a, t) { return a + (dyByTicker[t.ticker] || 0) * t.valor; }, 0) / totalValor
    : 0;
  var varAvg = totalValor > 0
    ? matching.reduce(function (a, t) { return a + (t.day_change_pct != null ? t.day_change_pct * t.valor : 0); }, 0) / totalValor
    : 0;
  var plTotal = matching.reduce(function (a, t) { return a + (t.pl || 0); }, 0);
  var plAvg = totalValor > 0 ? (plTotal / totalValor) * 100 : 0;

  var sortedTickers = matching.slice().sort(function (a, b) { return b.valor - a.valor; });

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-[#0e1118] border border-white/[0.08] rounded-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-2xl"
        onClick={function (e) { e.stopPropagation(); }}
      >
        {/* Header */}
        <div className="p-5 border-b border-white/[0.06] flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/40 font-mono mb-1">
              {group === 'ticker' ? 'Ticker' : group === 'classe' ? 'Classe' : 'Setor'}
            </p>
            <h3 className="text-xl font-bold tracking-tight">{selectedKey}</h3>
            <p className="text-[11px] text-white/50 font-mono mt-1">
              R$ {fmtMoney(totalValor)} · {pesoCarteira.toFixed(2)}% da carteira · {matching.length} {matching.length === 1 ? 'ativo' : 'ativos'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center text-white/60 transition shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Stats grid */}
        <div className="p-5 grid grid-cols-2 gap-3">
          <div className="bg-white/[0.03] rounded-lg p-3">
            <p className="text-[9px] uppercase tracking-wider text-white/40 mb-1">Variacao Dia</p>
            <p className="text-base font-mono font-bold" style={{ color: heatColorForPct(varAvg).text }}>{fmtPct(varAvg)}</p>
          </div>
          <div className="bg-white/[0.03] rounded-lg p-3">
            <p className="text-[9px] uppercase tracking-wider text-white/40 mb-1">P&amp;L Total</p>
            <p className="text-base font-mono font-bold" style={{ color: heatColorForPct(plAvg).text }}>
              {plTotal >= 0 ? '+' : ''}R$ {fmtMoney(plTotal)} ({fmtPct(plAvg)})
            </p>
          </div>
          <div className="bg-white/[0.03] rounded-lg p-3">
            <p className="text-[9px] uppercase tracking-wider text-white/40 mb-1">DY 12m</p>
            <p className="text-base font-mono font-bold text-income">{dyAvg.toFixed(2)}%</p>
          </div>
          <div className="bg-white/[0.03] rounded-lg p-3">
            <p className="text-[9px] uppercase tracking-wider text-white/40 mb-1">Dividendos Ano</p>
            <p className="text-base font-mono font-bold text-income">R$ {fmtMoney(totalDivAno)}</p>
          </div>
          <div className="bg-white/[0.03] rounded-lg p-3 col-span-2">
            <p className="text-[9px] uppercase tracking-wider text-white/40 mb-1">Dividendos Total (todos os tempos)</p>
            <p className="text-base font-mono font-bold text-income">R$ {fmtMoney(totalDivAll)}</p>
          </div>
        </div>

        {/* Lista de tickers (somente se grupo) */}
        {group !== 'ticker' && (
          <div className="px-5 pb-5">
            <p className="text-[10px] uppercase tracking-widest text-white/40 mb-2 font-mono">Ativos</p>
            <div className="space-y-1.5">
              {sortedTickers.map(function (t) {
                var tDy = dyByTicker[t.ticker] || 0;
                var tPct = totalValor > 0 ? (t.valor / totalValor) * 100 : 0;
                return (
                  <div key={t.ticker} className="flex items-center justify-between bg-white/[0.02] rounded-lg px-3 py-2">
                    <div>
                      <p className="text-[12px] font-semibold">{t.ticker}</p>
                      <p className="text-[10px] text-white/40 font-mono">R$ {fmtMoney(t.valor)} · {tPct.toFixed(1)}%</p>
                    </div>
                    <div className="text-right">
                      {t.day_change_pct != null && (
                        <p className="text-[11px] font-mono font-semibold" style={{ color: heatColorForPct(t.day_change_pct).text }}>
                          {fmtPct(t.day_change_pct)}
                        </p>
                      )}
                      {tDy > 0 && <p className="text-[10px] font-mono text-income/70">DY {tDy.toFixed(2)}%</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AtivosTab() {
  var positions = useAppStore(function (s) { return s.positions; });
  var proventos = useAppStore(function (s) { return s.proventos; });

  var _filter = useState('todos');
  var filter = _filter[0];
  var setFilter = _filter[1];

  var _sort = useState('valor');
  var sort = _sort[0];
  var setSort = _sort[1];

  var _search = useState('');
  var search = _search[0];
  var setSearch = _search[1];

  var _agrup = useState<'lista' | 'corretora' | 'classe'>('lista');
  var agrupamento = _agrup[0];
  var setAgrupamento = _agrup[1];

  var _collapsed = useState<Record<string, boolean>>({});
  var collapsed = _collapsed[0];
  var setCollapsed = _collapsed[1];

  function toggleGroup(k: string) {
    setCollapsed(function (prev) {
      var next: Record<string, boolean> = {};
      Object.keys(prev).forEach(function (kk) { next[kk] = prev[kk]; });
      next[k] = !prev[k];
      return next;
    });
  }
  function setAllCollapsed(keys: string[], value: boolean) {
    var next: Record<string, boolean> = {};
    keys.forEach(function (k) { next[k] = value; });
    setCollapsed(next);
  }

  var totalMercado = useMemo(function () {
    var t = 0;
    for (var i = 0; i < positions.length; i++) {
      var p = positions[i];
      t += (p.valor_mercado != null ? p.valor_mercado : p.pm * p.quantidade);
    }
    return t;
  }, [positions]);

  // DY 12m por ticker: soma dos dividendos dos ultimos 365 dias dividido pelo valor de mercado
  var dyByTicker = useMemo(function () {
    var cutoff = Date.now() - 365 * 86400000;
    var sumByTicker: Record<string, number> = {};
    for (var i = 0; i < proventos.length; i++) {
      var pv = proventos[i];
      var t = new Date(pv.data_pagamento).getTime();
      if (Number.isNaN(t) || t < cutoff) continue;
      var tk = (pv.ticker || '').toUpperCase().trim();
      if (!tk) continue;
      sumByTicker[tk] = (sumByTicker[tk] || 0) + (pv.valor_total || 0);
    }
    var out: Record<string, number> = {};
    for (var j = 0; j < positions.length; j++) {
      var p2 = positions[j];
      var vm = p2.valor_mercado != null ? p2.valor_mercado : p2.pm * p2.quantidade;
      var sumDiv = sumByTicker[p2.ticker] || 0;
      out[p2.ticker] = vm > 0 ? (sumDiv / vm) * 100 : 0;
    }
    return out;
  }, [positions, proventos]);

  // DY da carteira (media ponderada)
  // Resumos de dividendos: 12m, ano corrente, total e por ticker (todos os tempos)
  var divSummary = useMemo(function () {
    var cutoff12m = Date.now() - 365 * 86400000;
    var anoAtual = new Date().getFullYear();
    var total12m = 0;
    var totalAno = 0;
    var totalAll = 0;
    var allByTicker: Record<string, number> = {};
    var anoByTicker: Record<string, number> = {};
    for (var i = 0; i < proventos.length; i++) {
      var pv = proventos[i];
      var d = new Date(pv.data_pagamento);
      var t = d.getTime();
      var v = pv.valor_total || 0;
      if (Number.isNaN(t)) continue;
      totalAll += v;
      var tk = (pv.ticker || '').toUpperCase().trim();
      if (tk) allByTicker[tk] = (allByTicker[tk] || 0) + v;
      if (t >= cutoff12m) total12m += v;
      if (d.getFullYear() === anoAtual) {
        totalAno += v;
        if (tk) anoByTicker[tk] = (anoByTicker[tk] || 0) + v;
      }
    }
    return { total12m: total12m, totalAno: totalAno, totalAll: totalAll, allByTicker: allByTicker, anoByTicker: anoByTicker };
  }, [proventos]);

  var dyCarteira = totalMercado > 0 ? (divSummary.total12m / totalMercado) * 100 : 0;

  var filtered = useMemo(function () {
    var out = positions.slice();

    // filter by tab
    if (filter !== 'todos') {
      out = out.filter(function (p) {
        var tab = FILTER_TABS.find(function (t) { return t.key === filter; });
        if (!tab) return true;
        if (tab.mercadoInt) return p.mercado === 'INT';
        if (tab.cat) return p.categoria === tab.cat;
        return true;
      });
    }

    // filter by search
    var q = search.trim().toUpperCase();
    if (q.length > 0) {
      out = out.filter(function (p) { return p.ticker.indexOf(q) !== -1; });
    }

    // sort
    out.sort(function (a, b) {
      if (sort === 'az') return a.ticker.localeCompare(b.ticker);
      if (sort === 'var') return (b.day_change_pct || 0) - (a.day_change_pct || 0);
      if (sort === 'pl') return (b.pl_pct || 0) - (a.pl_pct || 0);
      if (sort === 'dy') return (dyByTicker[b.ticker] || 0) - (dyByTicker[a.ticker] || 0);
      if (sort === 'divAno') return (divSummary.anoByTicker[b.ticker] || 0) - (divSummary.anoByTicker[a.ticker] || 0);
      if (sort === 'div') return (divSummary.allByTicker[b.ticker] || 0) - (divSummary.allByTicker[a.ticker] || 0);
      // default: valor
      var va = a.valor_mercado != null ? a.valor_mercado : a.pm * a.quantidade;
      var vb = b.valor_mercado != null ? b.valor_mercado : b.pm * b.quantidade;
      return vb - va;
    });

    return out;
  }, [positions, filter, sort, search, dyByTicker, divSummary]);

  // Heatmap data — all positions, sorted desc por valor
  var heatmapItems: TreemapItem[] = useMemo(function () {
    var sorted = positions.slice().sort(function (a, b) {
      var va = a.valor_mercado != null ? a.valor_mercado : a.pm * a.quantidade;
      var vb = b.valor_mercado != null ? b.valor_mercado : b.pm * b.quantidade;
      return vb - va;
    });
    return sorted.map(function (p) {
      var v = p.valor_mercado != null ? p.valor_mercado : p.pm * p.quantidade;
      var pct = totalMercado > 0 ? (v / totalMercado) * 100 : 0;
      return {
        ticker: p.ticker,
        categoria: p.categoria || 'acao',
        valor: v,
        pct: pct,
        day_change_pct: p.day_change_pct,
        pl_pct: p.pl_pct,
        portfolio_id: p.portfolio_id,
        sector: p.sector,
      };
    });
  }, [positions, totalMercado]);

  var _heatGroup = useState<HeatGroup>('ticker');
  var heatGroup = _heatGroup[0];
  var setHeatGroup = _heatGroup[1];

  var _heatMetric = useState<HeatMetric>('geral');
  var heatMetric = _heatMetric[0];
  var setHeatMetric = _heatMetric[1];

  var _heatPeriod = useState<HeatPeriod>('dia');
  var heatPeriod = _heatPeriod[0];
  var setHeatPeriod = _heatPeriod[1];

  var _selectedTile = useState<string | null>(null);
  var selectedTile = _selectedTile[0];
  var setSelectedTile = _selectedTile[1];

  var _fullscreen = useState(false);
  var fullscreen = _fullscreen[0];
  var setFullscreen = _fullscreen[1];

  // Resumo por classe — subdivide INT em Stock/ETF/REIT/ADR/Cripto
  var classSummary = useMemo(function () {
    var map: Record<string, { valor: number; count: number }> = {};
    for (var i = 0; i < positions.length; i++) {
      var p = positions[i];
      var cat = p.categoria || 'acao';
      if (cat === 'stock_int') {
        cat = resolveIntSubcategoria(p.ticker); // ex: 'INT Stock', 'INT ETF', 'INT Cripto'
      }
      if (!map[cat]) map[cat] = { valor: 0, count: 0 };
      map[cat].valor += p.valor_mercado != null ? p.valor_mercado : p.pm * p.quantidade;
      map[cat].count += 1;
    }
    return Object.entries(map)
      .map(function (e) { return { cat: e[0], valor: e[1].valor, count: e[1].count }; })
      .sort(function (a, b) { return b.valor - a.valor; });
  }, [positions]);

  if (positions.length === 0) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-12 text-center">
        <p className="text-lg font-semibold text-white/80 mb-2">Nenhuma posicao</p>
        <p className="text-sm text-white/40 mb-5">Importe suas operacoes para ver sua carteira aqui.</p>
        <button className="px-4 py-2 rounded-lg bg-orange-500/15 border border-orange-500/25 text-orange-400 text-sm font-semibold hover:bg-orange-500/20 transition">
          Importar CSV (em breve)
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-4 items-stretch">
      {/* Tile detail modal */}
      {selectedTile && (
        <TileDetailModal
          selectedKey={selectedTile}
          group={heatGroup}
          items={heatmapItems}
          totalCarteira={totalMercado}
          dyByTicker={dyByTicker}
          divSummary={divSummary}
          onClose={function () { setSelectedTile(null); }}
        />
      )}

      {/* Fullscreen overlay */}
      {fullscreen && (
        <div className="fixed inset-0 z-50 bg-page/95 backdrop-blur-xl flex flex-col p-6 animate-fade-in">
          <div className="flex items-center gap-2 mb-4 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <Ico d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" className="w-4 h-4 text-orange-400" />
            </div>
            <span className="text-sm font-medium text-white/70 uppercase tracking-wider">Heatmap — {heatmapItems.length} ativos</span>
          </div>
          <div className="flex-1 min-h-0">
            <TreemapHeatmap
              items={heatmapItems}
              proventos={proventos}
              total={totalMercado}
              group={heatGroup}
              setGroup={setHeatGroup}
              metric={heatMetric}
              setMetric={setHeatMetric}
              period={heatPeriod}
              setPeriod={setHeatPeriod}
              fullscreen={true}
              onToggleFullscreen={function () { setFullscreen(false); }}
              onTileClick={setSelectedTile}
            />
          </div>
        </div>
      )}

      {/* Treemap 8 cols */}
      <div className="col-span-12 lg:col-span-8">
        <Card title="Heatmap" icon="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" className="d1 h-full">
          <TreemapHeatmap
            items={heatmapItems}
            proventos={proventos}
            total={totalMercado}
            group={heatGroup}
            setGroup={setHeatGroup}
            metric={heatMetric}
            setMetric={setHeatMetric}
            period={heatPeriod}
            setPeriod={setHeatPeriod}
            fullscreen={false}
            onToggleFullscreen={function () { setFullscreen(true); }}
            onTileClick={setSelectedTile}
          />
        </Card>
      </div>

      {/* Filtros + Resumo por classe 4 cols — em mobile inverte ordem (Por Classe primeiro) */}
      <div className="col-span-12 lg:col-span-4 flex flex-col-reverse lg:flex-col gap-4">
        <Card title="Filtros" icon="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" className="d2">
          <input
            type="text"
            placeholder="Buscar ticker..."
            value={search}
            onChange={function (e) { setSearch(e.target.value); }}
            className="w-full mb-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[12px] text-white/80 placeholder:text-white/25 focus:outline-none focus:border-orange-500/30 transition"
          />
          <div className="flex gap-1.5 flex-wrap mb-3">
            {FILTER_TABS.map(function (f) {
              var active = filter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={function () { setFilter(f.key); }}
                  className={'px-3 py-1.5 rounded-lg text-[11px] font-medium transition ' +
                    (active ? 'bg-orange-500/15 text-orange-400 border border-orange-500/20' : 'bg-white/[0.03] text-white/40 hover:text-white/60')}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
          <div className="h-px bg-white/[0.04] mb-3" />
          <div className="flex gap-1.5 flex-wrap">
            {SORT_OPTIONS.map(function (s) {
              var active = sort === s.key;
              return (
                <button
                  key={s.key}
                  onClick={function () { setSort(s.key); }}
                  className={'px-3 py-1.5 rounded-lg text-[11px] font-medium transition ' +
                    (active ? 'bg-orange-500/15 text-orange-400 border border-orange-500/20' : 'bg-white/[0.03] text-white/40 hover:text-white/60')}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </Card>

        <Card title="Por Classe" icon="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75" className="d3 flex-1">
          <div className="space-y-2">
            {classSummary.map(function (c) {
              var label = CLASS_LABELS[c.cat] || c.cat;
              var pct = totalMercado > 0 ? (c.valor / totalMercado) * 100 : 0;
              return (
                <div key={c.cat} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-white/[0.02]">
                  <div className="flex items-center gap-2.5">
                    <AssetClassIcon classe={c.cat} size="sm" title={label} />
                    <span className="text-[11px] font-semibold text-white/80">{label}</span>
                    <span className="text-[10px] text-white/30 font-mono">{c.count}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-semibold font-mono">R$ {fmtMoney(c.valor)}</p>
                    <p className="text-[9px] text-white/30 font-mono">{pct.toFixed(1)}%</p>
                  </div>
                </div>
              );
            })}
            {classSummary.length === 0 && (
              <p className="text-[11px] text-white/30 italic">Sem dados</p>
            )}
          </div>
        </Card>
      </div>

      {/* Tabela full width */}
      <div className="col-span-12">
        <Card title={'Posicoes (' + filtered.length + ') · DY ' + dyCarteira.toFixed(2) + '% · Div ano R$ ' + fmtMoney(divSummary.totalAno) + ' · Total R$ ' + fmtMoney(divSummary.totalAll)} icon="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" className="d4">
          <p className="lg:hidden text-[10px] text-white/40 mb-2 italic flex items-center gap-1.5">
            <svg className="w-3 h-3 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12c0-1.66 1.34-3 3-3h12c1.66 0 3 1.34 3 3M21 12v6c0 1.66-1.34 3-3 3H6c-1.66 0-3-1.34-3-3v-6m9-9v3m-3-3h6" />
            </svg>
            Gire o aparelho ou arraste a tabela pra ver mais colunas
          </p>
          {/* Toggle agrupamento */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-[10px] uppercase tracking-wider text-white/30 font-mono">Agrupar por</span>
            {([
              { k: 'lista' as const, label: 'Lista' },
              { k: 'corretora' as const, label: 'Por Corretora' },
              { k: 'classe' as const, label: 'Por Classe' },
            ]).map(function (opt) {
              var active = agrupamento === opt.k;
              return (
                <button
                  key={opt.k}
                  type="button"
                  onClick={function () { setAgrupamento(opt.k); }}
                  className={'px-2.5 py-1 rounded-md text-[11px] font-medium transition ' + (active ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40' : 'bg-white/[0.03] text-white/50 border border-white/[0.06] hover:bg-white/[0.06]')}
                >
                  {opt.label}
                </button>
              );
            })}
            {agrupamento !== 'lista' && (
              <div className="flex items-center gap-1 ml-auto">
                <button
                  type="button"
                  onClick={function () {
                    var keys: string[] = [];
                    if (agrupamento === 'corretora') {
                      filtered.forEach(function (p) {
                        var b = (p.por_corretora && p.por_corretora.length > 0) ? p.por_corretora : [{ corretora: 'Sem corretora' }];
                        b.forEach(function (x) { if (keys.indexOf(x.corretora) === -1) keys.push(x.corretora); });
                      });
                    } else {
                      filtered.forEach(function (p) {
                        var k = p.categoria || 'acao';
                        if (keys.indexOf(k) === -1) keys.push(k);
                      });
                    }
                    setAllCollapsed(keys, true);
                  }}
                  className="px-2 py-1 rounded-md text-[10px] font-medium text-white/50 hover:text-white/80 hover:bg-white/[0.05] transition"
                >
                  Recolher tudo
                </button>
                <button
                  type="button"
                  onClick={function () { setCollapsed({}); }}
                  className="px-2 py-1 rounded-md text-[10px] font-medium text-white/50 hover:text-white/80 hover:bg-white/[0.05] transition"
                >
                  Expandir tudo
                </button>
              </div>
            )}
          </div>

          <div className="overflow-x-auto -mx-2">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="text-[10px] text-white/30 uppercase tracking-wider font-mono">
                  <th className="text-left py-2 px-3 font-normal">Ativo</th>
                  <th className="text-right py-2 px-3 font-normal">Qtd</th>
                  <th className="text-right py-2 px-3 font-normal">PM</th>
                  <th className="text-right py-2 px-3 font-normal">Atual</th>
                  <th className="text-right py-2 px-3 font-normal">Valor</th>
                  <th className="text-right py-2 px-3 font-normal">P&L</th>
                  <th className="text-right py-2 px-3 font-normal">DY 12m</th>
                  <th className="text-right py-2 px-3 font-normal">Div Ano</th>
                  <th className="text-right py-2 px-3 font-normal">Div Total</th>
                  <th className="text-right py-2 px-3 font-normal">Peso</th>
                </tr>
              </thead>
              <tbody>
                {(function () {
                  // Helper: render uma linha de ativo (qty/pm/valor podem vir de bucket)
                  function row(p: typeof filtered[number], key: string, override?: { quantidade: number; pm: number; valor_mercado?: number; pl_pct?: number }) {
                    var qty = override ? override.quantidade : p.quantidade;
                    var pm = override ? override.pm : p.pm;
                    var val = override
                      ? (override.valor_mercado != null ? override.valor_mercado : pm * qty)
                      : (p.valor_mercado != null ? p.valor_mercado : p.pm * p.quantidade);
                    var peso = totalMercado > 0 ? (val / totalMercado) * 100 : 0;
                    var plPct = override ? override.pl_pct : p.pl_pct;
                    var plColor = plPct == null ? 'text-white/40' : plPct >= 0 ? 'text-income' : 'text-danger';
                    var moeda = p.mercado === 'INT' ? 'US$' : 'R$';
                    var plCell = plPct != null ? fmtPct(plPct) : '-';
                    var dy = dyByTicker[p.ticker] || 0;
                    return (
                      <tr key={key} className="border-t border-white/[0.04] hover:bg-white/[0.02] transition">
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-3">
                            <TickerLogo ticker={p.ticker} categoria={p.categoria} size={32} />
                            <div>
                              <p className="text-[13px] font-semibold leading-tight">{p.ticker}</p>
                              <p className="text-[10px] text-white/30 leading-tight">{CLASS_LABELS[p.categoria] || p.categoria}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right text-[13px] font-mono text-white/60">{fmtMoney(qty)}</td>
                        <td className="py-3 px-3 text-right text-[13px] font-mono text-white/40">{moeda} {fmtMoney(pm)}</td>
                        <td className="py-3 px-3 text-right text-[13px] font-mono text-white/60">
                          {p.preco_atual != null ? moeda + ' ' + fmtMoney(p.preco_atual) : <span className="text-white/20">-</span>}
                        </td>
                        <td className="py-3 px-3 text-right text-[13px] font-mono font-medium">{moeda} {fmtMoney(val)}</td>
                        <td className={'py-3 px-3 text-right text-[13px] font-mono font-semibold ' + plColor}>{plCell}</td>
                        <td className="py-3 px-3 text-right text-[13px] font-mono font-medium">
                          {dy > 0 ? <span className="text-income">{dy.toFixed(2)}%</span> : <span className="text-white/20">-</span>}
                        </td>
                        <td className="py-3 px-3 text-right text-[13px] font-mono font-medium">
                          {(divSummary.anoByTicker[p.ticker] || 0) > 0
                            ? <span className="text-income/80">R$ {fmtMoney(divSummary.anoByTicker[p.ticker] || 0)}</span>
                            : <span className="text-white/20">-</span>}
                        </td>
                        <td className="py-3 px-3 text-right text-[13px] font-mono font-medium">
                          {(divSummary.allByTicker[p.ticker] || 0) > 0
                            ? <span className="text-income/80">R$ {fmtMoney(divSummary.allByTicker[p.ticker] || 0)}</span>
                            : <span className="text-white/20">-</span>}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <div className="w-10 h-1 bg-white/[0.04] rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-orange-500" style={{ width: Math.min(100, Math.max(0, peso)) + '%' }} />
                            </div>
                            <span className="text-[10px] font-mono text-white/40">{peso.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  if (filtered.length === 0) {
                    return (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-[12px] text-white/30 italic">
                          Nenhum ativo corresponde ao filtro.
                        </td>
                      </tr>
                    );
                  }

                  if (agrupamento === 'lista') {
                    return filtered.map(function (p, idx) {
                      return row(p, p.ticker + '|' + (p.portfolio_id || '') + '|' + idx);
                    });
                  }

                  // Agrupado: monta { groupKey -> rows }
                  type Grp = { key: string; label: string; rows: Array<{ p: typeof filtered[number]; bucket?: { quantidade: number; pm: number; valor_mercado?: number; pl_pct?: number }; rowKey: string }>; valor: number };
                  var groups: Record<string, Grp> = {};

                  if (agrupamento === 'corretora') {
                    filtered.forEach(function (p, idx) {
                      var buckets = (p.por_corretora && p.por_corretora.length > 0)
                        ? p.por_corretora
                        : [{ corretora: 'Sem corretora', quantidade: p.quantidade, pm: p.pm, valor_mercado: p.valor_mercado, pl_pct: p.pl_pct }];
                      buckets.forEach(function (b) {
                        var k = b.corretora || 'Sem corretora';
                        if (!groups[k]) groups[k] = { key: k, label: k, rows: [], valor: 0 };
                        var bv = b.valor_mercado != null ? b.valor_mercado : b.pm * b.quantidade;
                        groups[k].rows.push({ p: p, bucket: b, rowKey: p.ticker + '|' + k + '|' + idx });
                        groups[k].valor += bv;
                      });
                    });
                  } else {
                    // 'classe'
                    filtered.forEach(function (p, idx) {
                      var k = p.categoria || 'acao';
                      if (!groups[k]) groups[k] = { key: k, label: CLASS_LABELS[k] || k, rows: [], valor: 0 };
                      var pv = p.valor_mercado != null ? p.valor_mercado : p.pm * p.quantidade;
                      groups[k].rows.push({ p: p, rowKey: p.ticker + '|' + k + '|' + idx });
                      groups[k].valor += pv;
                    });
                  }

                  var ordered = Object.values(groups).sort(function (a, b) { return b.valor - a.valor; });

                  var out: React.ReactNode[] = [];
                  ordered.forEach(function (g) {
                    var gPct = totalMercado > 0 ? (g.valor / totalMercado) * 100 : 0;
                    var isClosed = !!collapsed[g.key];
                    out.push(
                      <tr
                        key={'h-' + g.key}
                        className="bg-white/[0.03] hover:bg-white/[0.05] cursor-pointer transition"
                        onClick={function () { toggleGroup(g.key); }}
                      >
                        <td colSpan={4} className="py-2 px-3 select-none">
                          <div className="flex items-center gap-2">
                            <svg
                              className={'w-3 h-3 text-white/50 transition-transform ' + (isClosed ? '-rotate-90' : '')}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2.5}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                            {agrupamento === 'classe' && <AssetClassIcon classe={g.key} size="sm" />}
                            <span className="text-[12px] font-bold text-white/85 tracking-tight">{g.label}</span>
                            <span className="text-[10px] text-white/30 font-mono">{g.rows.length} {g.rows.length === 1 ? 'ativo' : 'ativos'}</span>
                          </div>
                        </td>
                        <td colSpan={5} className="py-2 px-3 text-right text-[12px] font-mono font-semibold text-white/85">
                          R$ {fmtMoney(g.valor)}
                        </td>
                        <td className="py-2 px-3 text-right text-[10px] text-white/40 font-mono">{gPct.toFixed(1)}%</td>
                      </tr>
                    );
                    if (!isClosed) {
                      g.rows.forEach(function (r) {
                        out.push(row(r.p, r.rowKey, r.bucket));
                      });
                    }
                  });
                  return out;
                })()}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ═══════ TAB: Caixa ═══════
// Layout: row1 [saldos 5 | movimentacoes 7], row2 [botao 12]
// Saldos + movimentacoes mesma altura via items-stretch

function CaixaTab() {
  return (
    <div className="grid grid-cols-12 gap-4 items-stretch">
      {/* Saldos 5 cols */}
      <div className="col-span-12 lg:col-span-5">
        <Card title="Saldos por Corretora" icon="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21" iconColor="text-income" className="d1 h-full flex flex-col">
          <div className="space-y-2.5 flex-1">
            {[
              { nome: 'Clear', saldo: 'R$ 12.450,00', moeda: 'BRL' },
              { nome: 'Inter', saldo: 'R$ 8.320,00', moeda: 'BRL' },
              { nome: 'Avenue', saldo: 'US$ 2.150,00', moeda: 'USD' },
              { nome: 'Nubank', saldo: 'R$ 3.800,00', moeda: 'BRL' },
            ].map(function (c, i) {
              return (
                <div key={i} className="flex items-center justify-between bg-white/[0.02] rounded-lg px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center text-[10px] font-bold text-orange-400">
                      {c.nome.charAt(0)}
                    </div>
                    <div>
                      <p className="text-xs font-semibold">{c.nome}</p>
                      <p className="text-[10px] text-white/25 font-mono">{c.moeda}</p>
                    </div>
                  </div>
                  <span className="text-sm font-mono font-semibold">{c.saldo}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-white/[0.04] flex justify-between">
            <span className="text-xs text-white/40">Total caixa</span>
            <span className="text-sm font-mono font-bold text-income">R$ 24.570,00</span>
          </div>
        </Card>
      </div>

      {/* Movimentacoes 7 cols */}
      <div className="col-span-12 lg:col-span-7">
        <Card title="Movimentacoes Recentes" icon="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" className="d2 h-full flex flex-col">
          <div className="space-y-1 flex-1">
            {[
              { tipo: 'entrada', desc: 'Deposito Clear', valor: '+R$ 5.000', data: '12/04', cor: 'text-income' },
              { tipo: 'saida', desc: 'Compra PETR4 x200', valor: '-R$ 7.684', data: '11/04', cor: 'text-danger' },
              { tipo: 'entrada', desc: 'Dividendos BBAS3', valor: '+R$ 342', data: '10/04', cor: 'text-income' },
              { tipo: 'transferencia', desc: 'Inter → Clear', valor: 'R$ 2.000', data: '08/04', cor: 'text-info' },
              { tipo: 'saida', desc: 'Compra MXRF11 x500', valor: '-R$ 5.060', data: '05/04', cor: 'text-danger' },
              { tipo: 'entrada', desc: 'Rendimento RF', valor: '+R$ 180', data: '03/04', cor: 'text-income' },
              { tipo: 'saida', desc: 'Taxa custodia', valor: '-R$ 12', data: '01/04', cor: 'text-danger' },
            ].map(function (m, i) {
              return (
                <div key={i} className="flex items-center justify-between py-2 border-b border-white/[0.03] last:border-0">
                  <div className="flex items-center gap-2.5">
                    <div className={'w-6 h-6 rounded-md flex items-center justify-center ' +
                      (m.tipo === 'entrada' ? 'bg-income/10' : m.tipo === 'saida' ? 'bg-danger/10' : 'bg-info/10')}>
                      <Ico d={m.tipo === 'entrada' ? 'M12 4.5v15m0 0l6.75-6.75M12 19.5l-6.75-6.75' : m.tipo === 'saida' ? 'M12 19.5v-15m0 0l-6.75 6.75M12 4.5l6.75 6.75' : 'M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5'}
                        className={'w-3 h-3 ' + (m.tipo === 'entrada' ? 'text-income' : m.tipo === 'saida' ? 'text-danger' : 'text-info')} />
                    </div>
                    <div>
                      <span className="text-[11px] text-white/60">{m.desc}</span>
                      <p className="text-[9px] text-white/20 font-mono">{m.data}</p>
                    </div>
                  </div>
                  <span className={'text-[12px] font-mono font-medium ' + m.cor}>{m.valor}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Botao add */}
      <div className="col-span-12">
        <button className="shine-button w-full py-3 rounded-xl bg-gradient-to-r from-orange-500/10 to-orange-600/10 border border-orange-500/20 text-orange-400 text-sm font-semibold hover:from-orange-500/15 hover:to-orange-600/15 transition-all">
          + Adicionar Movimentacao
        </button>
      </div>
    </div>
  );
}

// ═══════ TAB: Financas ═══════
// Layout: row1 [resumo 4 | orcamento 8], row2 [recorrentes 6 | cartoes 6]
// Todas as linhas com items-stretch

function FinancasTab() {
  return (
    <div className="grid grid-cols-12 gap-4 items-stretch">
      {/* Resumo 4 cols */}
      <div className="col-span-12 lg:col-span-4">
        <Card title="Resumo do Mes" icon="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" iconColor="text-income" className="d1 h-full">
          <div className="bg-white/[0.02] rounded-lg p-3 mb-4">
            <div className="flex justify-between mb-1.5">
              <span className="text-[10px] text-white/40">Entradas</span>
              <span className="text-xs font-mono text-income font-semibold">+R$ 8.500</span>
            </div>
            <div className="flex justify-between mb-2">
              <span className="text-[10px] text-white/40">Saidas</span>
              <span className="text-xs font-mono text-danger font-semibold">-R$ 6.200</span>
            </div>
            <div className="h-px bg-white/[0.04]" />
            <div className="flex justify-between mt-2">
              <span className="text-[10px] text-white/50 font-medium">Saldo</span>
              <span className="text-sm font-mono font-bold text-income">+R$ 2.300</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/[0.02] rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-white/30 mb-0.5">Investido</p>
              <p className="text-xs font-bold font-mono">R$ 7.684</p>
            </div>
            <div className="bg-white/[0.02] rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-white/30 mb-0.5">Recebido</p>
              <p className="text-xs font-bold font-mono text-income">R$ 522</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Orcamento 8 cols */}
      <div className="col-span-12 lg:col-span-8">
        <Card title="Orcamento" icon="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" className="d2 h-full">
          <div className="space-y-3">
            {[
              { grupo: 'Moradia', gasto: 2800, limite: 3000, cor: '#F97316' },
              { grupo: 'Alimentacao', gasto: 1200, limite: 1500, cor: '#22C55E' },
              { grupo: 'Transporte', gasto: 850, limite: 800, cor: '#EF4444' },
              { grupo: 'Lazer', gasto: 400, limite: 600, cor: '#3B82F6' },
              { grupo: 'Saude', gasto: 350, limite: 500, cor: '#06B6D4' },
              { grupo: 'Educacao', gasto: 200, limite: 300, cor: '#E879F9' },
            ].map(function (o, i) {
              var pct = (o.gasto / o.limite) * 100;
              var over = pct > 100;
              return (
                <div key={i}>
                  <div className="flex justify-between mb-1">
                    <span className="text-[11px] text-white/60">{o.grupo}</span>
                    <span className={'text-[11px] font-mono ' + (over ? 'text-danger font-semibold' : 'text-white/40')}>
                      R$ {o.gasto.toLocaleString('pt-BR')} / {o.limite.toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: Math.min(100, pct) + '%', backgroundColor: over ? '#EF4444' : o.cor }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Recorrentes 6 cols */}
      <div className="col-span-12 lg:col-span-6">
        <Card title="Recorrentes" icon="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" className="d3 h-full">
          <div className="space-y-2">
            {[
              { nome: 'Aluguel', valor: 'R$ 2.200', dia: '5', status: 'pago' },
              { nome: 'Internet', valor: 'R$ 120', dia: '10', status: 'pago' },
              { nome: 'Streaming', valor: 'R$ 55', dia: '15', status: 'pendente' },
              { nome: 'Academia', valor: 'R$ 89', dia: '20', status: 'pendente' },
              { nome: 'Seguro auto', valor: 'R$ 180', dia: '25', status: 'pendente' },
            ].map(function (r, i) {
              return (
                <div key={i} className="flex items-center justify-between bg-white/[0.02] rounded-lg px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className={'w-1.5 h-1.5 rounded-full ' + (r.status === 'pago' ? 'bg-income' : 'bg-warning')} />
                    <div>
                      <p className="text-[11px] font-medium text-white/60">{r.nome}</p>
                      <p className="text-[9px] text-white/25 font-mono">Dia {r.dia}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-mono font-semibold">{r.valor}</p>
                    <p className={'text-[9px] font-mono ' + (r.status === 'pago' ? 'text-income' : 'text-warning')}>{r.status}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Cartoes 6 cols */}
      <div className="col-span-12 lg:col-span-6">
        <Card title="Cartoes de Credito" icon="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" iconColor="text-stock-int" className="d4 h-full">
          <div className="space-y-3">
            {[
              { nome: 'Nubank', bandeira: 'Mastercard', limite: 15000, usado: 4200, fecha: '15', vence: '22' },
              { nome: 'Inter', bandeira: 'Visa', limite: 8000, usado: 1850, fecha: '20', vence: '27' },
              { nome: 'C6', bandeira: 'Mastercard', limite: 5000, usado: 3200, fecha: '10', vence: '17' },
            ].map(function (c, i) {
              var pct = (c.usado / c.limite) * 100;
              return (
                <div key={i} className="bg-white/[0.02] rounded-lg p-3">
                  <div className="flex justify-between mb-2">
                    <div>
                      <p className="text-xs font-semibold">{c.nome}</p>
                      <p className="text-[9px] text-white/25">{c.bandeira} · Fecha dia {c.fecha} · Vence dia {c.vence}</p>
                    </div>
                    <p className="text-xs font-mono font-semibold text-danger">R$ {c.usado.toLocaleString('pt-BR')}</p>
                  </div>
                  <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: pct + '%', background: pct > 80 ? 'linear-gradient(90deg, #F97316, #EF4444)' : 'linear-gradient(90deg, #F97316, #FB923C)' }} />
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <p className="text-[9px] text-white/25 font-mono">Limite R$ {c.limite.toLocaleString('pt-BR')}</p>
                    <p className="text-[9px] text-white/25 font-mono">{pct.toFixed(0)}% usado</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ═══════ Main Page ═══════

export default function CarteiraPage() {
  var _tab = useState('ativos');
  var activeTab = _tab[0];
  var setActiveTab = _tab[1];

  return (
    <div className="relative z-10">
      {/* Tab navigation */}
      <div className="flex items-center gap-1 bg-white/[0.03] rounded-xl p-1 mb-6 w-fit anim-up">
        {TABS.map(function (tab) {
          var isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={function () { setActiveTab(tab.key); }}
              className={'flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition ' +
                (isActive ? 'bg-orange-500/15 text-orange-400 shadow-[0_0_10px_rgba(249,115,22,0.1)]' : 'text-white/40 hover:text-white/60 hover:bg-white/[0.03]')}
            >
              <Ico d={tab.icon} className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'ativos' && <AtivosTab />}
      {activeTab === 'caixa' && <CaixaTab />}
      {activeTab === 'financas' && <FinancasTab />}
    </div>
  );
}
