'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useAppStore, type Position } from '@/store';
import { TickerLogo } from '@/components/TickerLogo';
import { ProventoActions } from '@/components/ProventoActions';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useUser, useOperacoesRaw, type OperacaoRaw } from '@/lib/queries';
import { AddProventoSheet } from '@/components/AddProventoSheet';
import { SyncProventosButton } from '@/components/SyncProventosButton';
import { RendaMensalChart } from '@/components/renda/RendaMensalChart';
import { ProximosPagamentosCard } from '@/components/renda/ProximosPagamentosCard';
import { OpcoesResumoCard } from '@/components/renda/OpcoesResumoCard';
import { PorFonteDonut } from '@/components/renda/PorFonteDonut';
import { OpcoesView } from '@/components/renda/OpcoesView';
import { ProventosInsights, calcularYoC, fmtYoC } from '@/components/renda/ProventosInsights';
import { tipoLabel, isIntTicker, valorLiquido } from '@/lib/proventosUtils';
import { fmtBRL, fmtK, fmtMonthYear, fmtDate } from '@/lib/fmt';
import { projetarMensal, proximos30dias, type ProjecaoMes } from '@/lib/rendaForecast';

// ─── Provento corretora inference ──────────────────────────
// Inferencia HISTORICA: retorna a corretora que detinha mais qty do ticker
// na data do pagamento, replayando operacoes ate aquela data.
// Fallback: corretora majoritaria atual (positions.por_corretora[0]).
// Resultado memoizado por (ticker, dataPagamento) num cache externo.

type TickerTimeline = Array<{ ts: number; corretora: string; delta: number }>;

function buildTimelinesByTicker(ops: OperacaoRaw[]): Record<string, TickerTimeline> {
  var out: Record<string, TickerTimeline> = {};
  for (var i = 0; i < ops.length; i++) {
    var op = ops[i];
    if (!op.ticker) continue;
    var corr = op.corretora || 'Sem corretora';
    var ts = new Date(op.data).getTime();
    if (Number.isNaN(ts)) continue;
    var delta = op.tipo === 'compra' ? op.quantidade : op.tipo === 'venda' ? -op.quantidade : 0;
    if (delta === 0) continue;
    if (!out[op.ticker]) out[op.ticker] = [];
    out[op.ticker].push({ ts: ts, corretora: corr, delta: delta });
  }
  // ja vem ordenado por data asc da query, mas garante
  for (var k in out) {
    out[k].sort(function (a, b) { return a.ts - b.ts; });
  }
  return out;
}

function inferCorretoraOnDate(timeline: TickerTimeline | undefined, ts: number): string | null {
  if (!timeline || timeline.length === 0) return null;
  var byCorr: Record<string, number> = {};
  for (var i = 0; i < timeline.length; i++) {
    var ev = timeline[i];
    if (ev.ts > ts) break;
    byCorr[ev.corretora] = (byCorr[ev.corretora] || 0) + ev.delta;
  }
  var best: string | null = null;
  var bestQty = 0;
  for (var c in byCorr) {
    if (byCorr[c] > bestQty) { best = c; bestQty = byCorr[c]; }
  }
  return best;
}

function fallbackCorretoraAtual(positions: Position[]): Record<string, string> {
  var map: Record<string, string> = {};
  for (var i = 0; i < positions.length; i++) {
    var p = positions[i];
    if (p.por_corretora && p.por_corretora.length > 0) {
      map[p.ticker] = p.por_corretora[0].corretora;
    }
  }
  return map;
}

// ─── Periodo helpers ───────────────────────────────────────

type PeriodoKey = 'mes' | 'anterior' | '3m' | '12m' | 'ano' | 'tudo';
var PERIODOS: { k: PeriodoKey; label: string }[] = [
  { k: 'mes', label: 'Mes atual' },
  { k: 'anterior', label: 'Anterior' },
  { k: '3m', label: '3m' },
  { k: '12m', label: '12m' },
  { k: 'ano', label: 'Ano' },
  { k: 'tudo', label: 'Tudo' },
];

function periodoRange(k: PeriodoKey): { start: number; end: number } {
  var now = new Date();
  // 'end' estende pra incluir proventos futuros anunciados (data-com passada, pagamento futuro)
  var endFuture = now.getTime() + 90 * 86400000; // +90 dias
  if (k === 'mes') {
    var s = new Date(now.getFullYear(), now.getMonth(), 1);
    var endMes = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    return { start: s.getTime(), end: endMes };
  }
  if (k === 'anterior') {
    var s2 = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    var e2 = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: s2.getTime(), end: e2.getTime() };
  }
  if (k === '3m') return { start: now.getTime() - 90 * 86400000, end: endFuture };
  if (k === '12m') return { start: now.getTime() - 365 * 86400000, end: endFuture };
  if (k === 'ano') {
    var endAno = new Date(now.getFullYear() + 1, 0, 1).getTime();
    return { start: new Date(now.getFullYear(), 0, 1).getTime(), end: endAno };
  }
  return { start: 0, end: endFuture };
}

// ─── Tipo provento label ──────────────────────────────────
// Helpers compartilhados em @/lib/proventosUtils

function tipoColor(t: string): string {
  var lbl = tipoLabel(t);
  if (lbl === 'JCP') return 'text-info bg-info/15';
  if (lbl === 'Rendimento') return 'text-income bg-income/15';
  return 'text-orange-300 bg-orange-500/15';
}

// ─── Page ──────────────────────────────────────────────────

export default function RendaPage() {
  var proventos = useAppStore(function (s) { return s.proventos; });
  var positions = useAppStore(function (s) { return s.positions; });
  var patrimonio = useAppStore(function (s) { return s.patrimonio; });

  var user = useUser();
  var opsQuery = useOperacoesRaw(user.data?.id);
  var ops = opsQuery.data || [];

  var _tab = useState<'resumo' | 'proventos' | 'opcoes'>('resumo');
  var subtab = _tab[0];
  var setSubtab = _tab[1];

  var timelines = useMemo(function () { return buildTimelinesByTicker(ops); }, [ops]);
  var fallback = useMemo(function () { return fallbackCorretoraAtual(positions); }, [positions]);

  // Map ticker -> categoria pra enriquecer proventos (usado pelo RendaMensalChart)
  var catByTicker = useMemo(function () {
    var m: Record<string, string> = {};
    positions.forEach(function (p) { m[p.ticker] = p.categoria; });
    return m;
  }, [positions]);

  // Enrich proventos com corretora inferida historicamente
  var enriched = useMemo(function () {
    return proventos.map(function (pv) {
      var tk = (pv.ticker || '').toUpperCase();
      var d = new Date(pv.data_pagamento);
      var ts = d.getTime();
      var corr = inferCorretoraOnDate(timelines[tk], ts) || fallback[tk] || '—';
      return {
        id: pv.id,
        ticker: tk,
        tipo_provento: pv.tipo_provento,
        valor_total: pv.valor_total || 0,
        valor_por_cota: pv.valor_por_cota || 0,
        quantidade: pv.quantidade || 0,
        data_pagamento: pv.data_pagamento,
        fonte: pv.fonte || null,
        date: d,
        ts: ts,
        corretora: corr,
        categoria: catByTicker[tk] || (isIntTicker(tk) ? 'stock_int' : 'acao'),
      };
    }).sort(function (a, b) { return b.ts - a.ts; });
  }, [proventos, timelines, fallback, catByTicker]);

  return (
    <div className="space-y-5">
      {/* Header + sub-tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Renda</h1>
          <p className="text-xs text-white/40">Proventos recebidos e projecao</p>
        </div>
        <div className="flex items-center gap-2">
          {([
            { k: 'resumo' as const, label: 'Resumo' },
            { k: 'proventos' as const, label: 'Proventos' },
            { k: 'opcoes' as const, label: 'Opcoes' },
          ]).map(function (opt) {
            var active = subtab === opt.k;
            return (
              <button
                key={opt.k}
                type="button"
                onClick={function () { setSubtab(opt.k); }}
                className={'px-3 py-1.5 rounded-md text-[12px] font-medium transition ' + (active ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40' : 'bg-white/[0.03] text-white/50 border border-white/[0.06] hover:bg-white/[0.06]')}
              >
                {opt.label}
              </button>
            );
          })}
          <Link
            href="/app/ir"
            className="px-3 py-1.5 rounded-md text-[12px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 transition flex items-center gap-1.5"
          >
            📄 Relatório IR
          </Link>
        </div>
      </div>

      {subtab === 'resumo' ? (
        <ResumoView
          enriched={enriched}
          positions={positions}
          patrimonioTotal={patrimonio.total}
          onVerOpcoes={function () { setSubtab('opcoes'); }}
        />
      ) : subtab === 'proventos' ? (
        <ProventosView enriched={enriched} userId={user.data?.id} />
      ) : (
        <OpcoesView />
      )}
    </div>
  );
}

// ─── Resumo View ───────────────────────────────────────────

type Enriched = {
  id?: string | number;
  ticker: string;
  tipo_provento: string;
  valor_total: number;
  valor_por_cota?: number;
  quantidade?: number;
  data_pagamento: string;
  fonte?: string | null;
  date: Date;
  ts: number;
  corretora: string;
  categoria?: string;
};

type OrderKey = 'data-desc' | 'data-asc' | 'valor-desc' | 'valor-asc' | 'ticker-asc';
var ORDER_OPTIONS: { k: OrderKey; label: string }[] = [
  { k: 'data-desc', label: 'Data (+ recente)' },
  { k: 'data-asc', label: 'Data (+ antiga)' },
  { k: 'valor-desc', label: 'Valor (maior)' },
  { k: 'valor-asc', label: 'Valor (menor)' },
  { k: 'ticker-asc', label: 'Ticker A-Z' },
];

function ResumoView({ enriched, positions, patrimonioTotal, onVerOpcoes }: { enriched: Enriched[]; positions: Position[]; patrimonioTotal: number; onVerOpcoes?: () => void }) {
  // Renda mensal nos ultimos 12 meses
  var mensal = useMemo(function () {
    var now = new Date();
    var months: { key: string; label: string; valor: number; date: Date }[] = [];
    for (var i = 11; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: d.getFullYear() + '-' + d.getMonth(), label: fmtMonthYear(d), valor: 0, date: d });
    }
    var idx: Record<string, number> = {};
    months.forEach(function (m, i) { idx[m.key] = i; });
    enriched.forEach(function (pv) {
      if (Number.isNaN(pv.ts)) return;
      var k = pv.date.getFullYear() + '-' + pv.date.getMonth();
      if (idx[k] != null) months[idx[k]].valor += valorLiquido(pv.valor_total, pv.tipo_provento, pv.ticker);
    });
    return months;
  }, [enriched]);

  // Projecao mensal 12m com sazonalidade por ticker e overlay de confirmados
  var projecao = useMemo<ProjecaoMes[]>(function () {
    return projetarMensal(enriched, positions, 12, 24);
  }, [enriched, positions]);

  var totals = useMemo(function () {
    var total12m = 0;
    for (var i = 0; i < mensal.length; i++) total12m += mensal[i].valor;
    var media = total12m / 12;
    var dyMedio = patrimonioTotal > 0 ? (total12m / patrimonioTotal) * 100 : 0;
    // Proximos 30d: primeiro mes da projecao (ja considera sazonalidade + confirmados)
    var proximos30 = proximos30dias(projecao);
    return { total12m: total12m, media: media, dyMedio: dyMedio, proximos30: proximos30 };
  }, [mensal, projecao, patrimonioTotal]);

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Hero: barras 12m */}
      <div className="col-span-12 lg:col-span-8 linear-card rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-white/40 font-mono">Renda mensal · 12 meses</p>
            <p className="text-2xl font-bold mt-1 font-mono">R$ {fmtBRL(totals.total12m)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/40">Media</p>
            <p className="text-lg font-bold font-mono text-income">R$ {fmtBRL(totals.media)}</p>
          </div>
        </div>
        <RendaMensalChart enriched={enriched} mediaRef={totals.media} heightPx={220} />
      </div>

      {/* KPI vertical */}
      <div className="col-span-12 lg:col-span-4 grid grid-cols-2 lg:grid-cols-1 gap-3">
        <Kpi label="Total 12m" value={'R$ ' + fmtBRL(totals.total12m)} accent="text-income" />
        <Kpi label="Media mensal" value={'R$ ' + fmtBRL(totals.media)} accent="text-orange-300" />
        <Kpi label="Proximos 30d" value={'R$ ' + fmtBRL(totals.proximos30)} accent="text-info" sub="Estimado" />
        <Kpi label="DY medio carteira" value={totals.dyMedio > 0 ? totals.dyMedio.toFixed(2) + '% a.a.' : '—'} accent="text-warning" />
      </div>

      {/* Proximos pagamentos hibrido — confirmados (oficiais) + estimados (calendario) */}
      <ProximosPagamentosCard />

      {/* Projecao 12m com sazonalidade + overlay confirmados */}
      <div className="col-span-12 lg:col-span-6 linear-card rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs uppercase tracking-wider text-white/40 font-mono">Projecao 12m</p>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1 text-white/50">
              <span className="inline-block w-2 h-2 rounded-sm bg-orange-500/60" /> Estimado
            </span>
            <span className="flex items-center gap-1 text-emerald-300">
              <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500" /> Confirmado
            </span>
          </div>
        </div>
        <p className="text-[12px] text-white/50 mb-3">
          Sazonalidade historica por ativo × posicao atual. Proventos ja anunciados viram barra verde.
        </p>
        <div style={{ width: '100%', height: 180 }}>
          <ResponsiveContainer>
            <BarChart
              data={projecao}
              margin={{ top: 6, right: 4, left: -12, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }} axisLine={false} tickLine={false} tickFormatter={function (v) { return 'R$ ' + fmtK(v); }} />
              <Tooltip
                cursor={{ fill: 'rgba(249,115,22,0.06)' }}
                contentStyle={{ background: '#0a0d14', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
                formatter={function (v: unknown, name: unknown) {
                  var num = Number(v) || 0;
                  var label = String(name) === 'confirmado' ? 'Confirmado' : 'Estimado';
                  if (num === 0) return ['—', label];
                  return ['R$ ' + fmtBRL(num), label];
                }}
              />
              <Bar dataKey="estimado" stackId="p" fill="#F97316" fillOpacity={0.45} radius={[0, 0, 0, 0]} maxBarSize={28} />
              <Bar dataKey="confirmado" stackId="p" fill="#22C55E" fillOpacity={0.9} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[10px] text-white/30 mt-2">
          Total projetado 12m: <span className="font-mono text-white/50">R$ {fmtBRL(projecao.reduce(function (a, m) { return a + m.total; }, 0))}</span>
        </p>
      </div>

      {/* Renda de opcoes 12m — card + mini-spark */}
      <OpcoesResumoCard onDetalhar={onVerOpcoes} />

      {/* Donut de renda por fonte (12m liquido) */}
      <PorFonteDonut />
    </div>
  );
}

function Kpi({ label, value, accent, sub }: { label: string; value: string; accent?: string; sub?: string }) {
  return (
    <div className="linear-card rounded-xl p-4">
      <p className="text-[10px] uppercase tracking-wider text-white/40 font-mono">{label}</p>
      <p className={'text-base font-bold font-mono mt-1 ' + (accent || 'text-white')}>{value}</p>
      {sub && <p className="text-[10px] text-white/30 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Proventos View ────────────────────────────────────────

function ProventosView({ enriched, userId }: { enriched: Enriched[]; userId: string | undefined }) {
  var _per = useState<PeriodoKey>('mes');
  var periodo = _per[0];
  var setPeriodo = _per[1];

  var _grp = useState<'data' | 'ticker' | 'corretora'>('data');
  var grp = _grp[0];
  var setGrp = _grp[1];

  var _order = useState<OrderKey>('data-desc');
  var order = _order[0];
  var setOrder = _order[1];

  var _showFilters = useState(false);
  var showFilters = _showFilters[0];
  var setShowFilters = _showFilters[1];

  var _showYoC = useState(false);
  var showYoC = _showYoC[0];
  var setShowYoC = _showYoC[1];

  var _tipoFilter = useState<'all' | 'dividendo' | 'jcp' | 'rendimento'>('all');
  var tipoFilter = _tipoFilter[0];
  var setTipoFilter = _tipoFilter[1];

  var _fonteFilter = useState<'all' | 'manual' | 'sync'>('all');
  var fonteFilter = _fonteFilter[0];
  var setFonteFilter = _fonteFilter[1];

  var _consolidar = useState(false);
  var consolidar = _consolidar[0];
  var setConsolidar = _consolidar[1];

  var _search = useState('');
  var search = _search[0];
  var setSearch = _search[1];

  var rng = useMemo(function () { return periodoRange(periodo); }, [periodo]);

  var filteredRaw = useMemo(function () {
    var q = search.trim().toUpperCase();
    return enriched.filter(function (pv) {
      if (pv.ts < rng.start || pv.ts >= rng.end) return false;
      if (q.length > 0 && pv.ticker.indexOf(q) < 0) return false;
      if (fonteFilter === 'manual') {
        if (pv.fonte != null && pv.fonte !== 'manual') return false;
      } else if (fonteFilter === 'sync') {
        if (pv.fonte == null || pv.fonte === 'manual') return false;
      }
      if (tipoFilter === 'all') return true;
      var tl = tipoLabel(pv.tipo_provento).toLowerCase();
      if (tipoFilter === 'jcp') return tl === 'jcp';
      if (tipoFilter === 'rendimento') return tl === 'rendimento';
      if (tipoFilter === 'dividendo') return tl === 'dividendo' || tl === 'bonificacao' || tl === 'amortizacao';
      return true;
    });
  }, [enriched, rng, tipoFilter, fonteFilter, search]);

  // Se consolidar, agrupa irmaos (mesmo ticker+data_pagamento) somando valor
  var filteredConsolidated = useMemo(function () {
    if (!consolidar) return filteredRaw;
    var map: Record<string, Enriched> = {};
    filteredRaw.forEach(function (r) {
      var k = r.ticker + '|' + r.date.toISOString().substring(0, 10);
      if (!map[k]) {
        map[k] = Object.assign({}, r);
      } else {
        map[k].valor_total += r.valor_total;
      }
    });
    return Object.values(map);
  }, [filteredRaw, consolidar]);

  // Ordenacao unificada — aplicada depois da consolidacao
  var filtered = useMemo(function () {
    var arr = filteredConsolidated.slice();
    if (order === 'data-desc') {
      arr.sort(function (a, b) { return b.ts - a.ts; });
    } else if (order === 'data-asc') {
      arr.sort(function (a, b) { return a.ts - b.ts; });
    } else if (order === 'valor-desc') {
      arr.sort(function (a, b) {
        var va = valorLiquido(a.valor_total, a.tipo_provento, a.ticker);
        var vb = valorLiquido(b.valor_total, b.tipo_provento, b.ticker);
        return vb - va;
      });
    } else if (order === 'valor-asc') {
      arr.sort(function (a, b) {
        var va = valorLiquido(a.valor_total, a.tipo_provento, a.ticker);
        var vb = valorLiquido(b.valor_total, b.tipo_provento, b.ticker);
        return va - vb;
      });
    } else if (order === 'ticker-asc') {
      arr.sort(function (a, b) { return a.ticker.localeCompare(b.ticker); });
    }
    return arr;
  }, [filteredConsolidated, order]);

  var total = useMemo(function () {
    var t = 0;
    for (var i = 0; i < filtered.length; i++) {
      t += valorLiquido(filtered[i].valor_total, filtered[i].tipo_provento, filtered[i].ticker);
    }
    return t;
  }, [filtered]);

  function handleExportCsv() {
    var header = 'Data,Ticker,Tipo,Fonte,Corretora,Bruto,Liquido,IR\n';
    var rows = filtered.map(function (r) {
      var bruto = r.valor_total || 0;
      var liq = valorLiquido(bruto, r.tipo_provento, r.ticker);
      var ir = bruto - liq;
      return [
        r.data_pagamento,
        r.ticker,
        tipoLabel(r.tipo_provento),
        r.fonte || 'manual',
        (r.corretora || '—').replace(/,/g, ';'),
        bruto.toFixed(2),
        liq.toFixed(2),
        ir.toFixed(2),
      ].join(',');
    }).join('\n');
    var blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'proventos_' + periodo + '_' + new Date().toISOString().substring(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-white/30 font-mono">Periodo</span>
        {PERIODOS.map(function (opt) {
          var active = periodo === opt.k;
          return (
            <button
              key={opt.k}
              type="button"
              onClick={function () { setPeriodo(opt.k); }}
              className={'px-2.5 py-1 rounded-md text-[11px] font-medium transition ' + (active ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40' : 'bg-white/[0.03] text-white/50 border border-white/[0.06] hover:bg-white/[0.06]')}
            >
              {opt.label}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          <SyncProventosButton userId={userId} />
          <AddProventoSheet userId={userId} />
        </div>
      </div>

      {/* Search + YoC toggle + export */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={function (e) { setSearch(e.target.value); }}
          placeholder="Buscar ticker (ex: PETR4, HGLG)"
          className="flex-1 min-w-[200px] bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-1.5 text-[12px] text-white placeholder-white/30 focus:outline-none focus:border-orange-500/40"
        />
        <label
          className="flex items-center gap-1.5 cursor-pointer select-none px-2.5 py-1.5 rounded-md bg-white/[0.03] border border-white/[0.08]"
          title="Yield on Cost — rendimento por cota dividido pelo seu preco medio de compra. Indica a rentabilidade real daquela posicao."
        >
          <input
            type="checkbox"
            checked={showYoC}
            onChange={function (e) { setShowYoC(e.target.checked); }}
            className="accent-orange-500 w-3.5 h-3.5"
          />
          <span className="text-[11px] text-white/60">YoC</span>
        </label>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={filtered.length === 0}
          className="px-3 py-1.5 rounded-md text-[11px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          Exportar CSV ({filtered.length})
        </button>
      </div>

      {/* Insights: Total + YoY + sparkline + donut por tipo */}
      <ProventosInsights
        filtered={filtered}
        allEnriched={enriched}
        periodoStart={rng.start}
        periodoEnd={rng.end}
      />

      {/* Toggle "Mais filtros" em mobile. Desktop (sm+) sempre visivel. */}
      <div className="flex items-center justify-between sm:hidden">
        <button
          type="button"
          onClick={function () { setShowFilters(!showFilters); }}
          className="text-[11px] text-orange-300 flex items-center gap-1"
        >
          {showFilters ? '▲ Esconder filtros' : '▼ Mais filtros'}
        </button>
        <select
          value={order}
          onChange={function (e) { setOrder(e.target.value as OrderKey); }}
          className="bg-white/[0.03] border border-white/[0.08] rounded-md px-2 py-1 text-[11px] text-white focus:outline-none"
        >
          {ORDER_OPTIONS.map(function (o) { return <option key={o.k} value={o.k}>{o.label}</option>; })}
        </select>
      </div>

      <div className={(showFilters ? 'block ' : 'hidden sm:block ') + 'space-y-3'}>
        {/* Filtro tipo + fonte + ordenacao */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-white/30 font-mono">Tipo</span>
          {([
            { k: 'all' as const, label: 'Todos' },
            { k: 'dividendo' as const, label: 'Dividendos' },
            { k: 'jcp' as const, label: 'JCP' },
            { k: 'rendimento' as const, label: 'Rendimentos' },
          ]).map(function (opt) {
            var active = tipoFilter === opt.k;
            return (
              <button
                key={opt.k}
                type="button"
                onClick={function () { setTipoFilter(opt.k); }}
                className={'px-2.5 py-1 rounded-md text-[11px] font-medium transition ' + (active ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40' : 'bg-white/[0.03] text-white/50 border border-white/[0.06] hover:bg-white/[0.06]')}
              >
                {opt.label}
              </button>
            );
          })}
          <span className="text-[10px] uppercase tracking-wider text-white/30 font-mono ml-3">Fonte</span>
          {([
            { k: 'all' as const, label: 'Todas' },
            { k: 'manual' as const, label: 'Manual' },
            { k: 'sync' as const, label: 'Sincronizado' },
          ]).map(function (opt) {
            var active = fonteFilter === opt.k;
            return (
              <button
                key={opt.k}
                type="button"
                onClick={function () { setFonteFilter(opt.k); }}
                className={'px-2.5 py-1 rounded-md text-[11px] font-medium transition ' + (active ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40' : 'bg-white/[0.03] text-white/50 border border-white/[0.06] hover:bg-white/[0.06]')}
              >
                {opt.label}
              </button>
            );
          })}
          <label
            className="ml-auto flex items-center gap-1.5 cursor-pointer select-none"
            title="Alguns proventos aparecem em duas linhas quando a corretora separa IR retido do valor liquido. Marque pra somar automaticamente."
          >
            <input
              type="checkbox"
              checked={consolidar}
              onChange={function (e) { setConsolidar(e.target.checked); }}
              className="accent-orange-500 w-3.5 h-3.5"
            />
            <span className="text-[11px] text-white/60">Juntar pagamentos do mesmo dia</span>
          </label>
        </div>

        {/* Agrupamento + ordenacao */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-white/30 font-mono">Agrupar</span>
          {([
            { k: 'data' as const, label: 'Por data' },
            { k: 'ticker' as const, label: 'Por ticker' },
            { k: 'corretora' as const, label: 'Por corretora' },
          ]).map(function (opt) {
            var active = grp === opt.k;
            return (
              <button
                key={opt.k}
                type="button"
                onClick={function () { setGrp(opt.k); }}
                className={'px-2.5 py-1 rounded-md text-[11px] font-medium transition ' + (active ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40' : 'bg-white/[0.03] text-white/50 border border-white/[0.06] hover:bg-white/[0.06]')}
              >
                {opt.label}
              </button>
            );
          })}

          <span className="text-[10px] uppercase tracking-wider text-white/30 font-mono ml-3 hidden sm:inline">Ordenar</span>
          <select
            value={order}
            onChange={function (e) { setOrder(e.target.value as OrderKey); }}
            className="hidden sm:inline-block bg-white/[0.03] border border-white/[0.08] rounded-md px-2.5 py-1 text-[11px] text-white focus:outline-none focus:border-orange-500/40"
          >
            {ORDER_OPTIONS.map(function (o) { return <option key={o.k} value={o.k}>{o.label}</option>; })}
          </select>
        </div>
      </div>

      {/* Lista */}
      <div className="linear-card rounded-xl p-5">
        {filtered.length === 0 ? (
          <p className="text-[12px] text-white/40 italic text-center py-8">Sem proventos no periodo.</p>
        ) : (
          <ProventosList rows={filtered} grupo={grp} showYoC={showYoC} />
        )}
      </div>
    </div>
  );
}

function ProventosList({ rows, grupo, showYoC }: { rows: Enriched[]; grupo: 'data' | 'ticker' | 'corretora'; showYoC?: boolean }) {
  var positions = useAppStore(function (s) { return s.positions; });
  var pmByTicker = useMemo(function () {
    var m: Record<string, number> = {};
    positions.forEach(function (p) { m[p.ticker] = p.pm; });
    return m;
  }, [positions]);
  var grouped = useMemo(function () {
    if (grupo === 'data') {
      // Agrupa por mes
      var byMonth: Record<string, { label: string; total: number; rows: Enriched[]; ts: number }> = {};
      rows.forEach(function (r) {
        var k = r.date.getFullYear() + '-' + r.date.getMonth();
        if (!byMonth[k]) byMonth[k] = { label: fmtMonthYear(r.date), total: 0, rows: [], ts: new Date(r.date.getFullYear(), r.date.getMonth(), 1).getTime() };
        byMonth[k].rows.push(r);
        byMonth[k].total += valorLiquido(r.valor_total, r.tipo_provento, r.ticker);
      });
      return Object.values(byMonth).sort(function (a, b) { return b.ts - a.ts; });
    }
    var by: Record<string, { label: string; total: number; rows: Enriched[]; ts: number }> = {};
    rows.forEach(function (r) {
      var k = grupo === 'ticker' ? r.ticker : r.corretora;
      if (!by[k]) by[k] = { label: k || '—', total: 0, rows: [], ts: 0 };
      by[k].rows.push(r);
      by[k].total += valorLiquido(r.valor_total, r.tipo_provento, r.ticker);
    });
    return Object.values(by).sort(function (a, b) { return b.total - a.total; });
  }, [rows, grupo]);

  return (
    <div className="space-y-5">
      {grouped.map(function (g) {
        return (
          <div key={g.label}>
            <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                {grupo === 'ticker' && g.rows[0] && (
                  <TickerLogo
                    ticker={g.rows[0].ticker}
                    categoria={g.rows[0].categoria || (isIntTicker(g.rows[0].ticker) ? 'stock_int' : 'acao')}
                    size={24}
                  />
                )}
                <span className="text-[12px] font-bold text-white/85">{g.label}</span>
                <span className="text-[10px] text-white/30 font-mono">{g.rows.length}</span>
              </div>
              <span className="text-[12px] font-mono font-semibold text-income">R$ {fmtBRL(g.total)}</span>
            </div>
            <div className="space-y-1">
              {g.rows.map(function (r, idx) {
                return (
                  <div key={(r.id || r.ticker) + '-' + idx} className="group flex items-center justify-between py-1.5 hover:bg-white/[0.02] rounded px-2 transition">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      {grupo !== 'ticker' && (
                        <TickerLogo
                          ticker={r.ticker}
                          categoria={r.categoria || (isIntTicker(r.ticker) ? 'stock_int' : 'acao')}
                          size={24}
                        />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[12px] font-semibold">{r.ticker}</span>
                          <span className={'text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ' + tipoColor(r.tipo_provento)}>{tipoLabel(r.tipo_provento)}</span>
                          {r.ts > Date.now() ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">confirmado</span>
                          ) : null}
                        </div>
                        <p className="text-[10px] text-white/40 leading-tight truncate">
                          {r.corretora} · {fmtDate(r.date)}
                          {showYoC ? (function () {
                            var yoc = calcularYoC(r.valor_por_cota, pmByTicker[r.ticker]);
                            if (yoc == null) return null;
                            return (
                              <span className="ml-1 text-emerald-300/70 font-mono"> · YoC {fmtYoC(yoc)}</span>
                            );
                          })() : null}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {tipoLabel(r.tipo_provento) === 'JCP' ? (
                        <>
                          <div className="flex items-center gap-1.5 justify-end">
                            <span className="text-[9px] font-mono uppercase tracking-wider text-white/40">bruto</span>
                            <span className="text-[11px] font-mono text-white/60 line-through decoration-white/30">R$ {fmtBRL(r.valor_total)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 justify-end mt-0.5">
                            <span className="text-[9px] font-mono uppercase tracking-wider text-amber-400/80">líquido</span>
                            <span className="text-[13px] font-mono font-bold text-income">R$ {fmtBRL(r.valor_total * 0.85)}</span>
                          </div>
                          <div className="text-[9px] text-white/30 mt-0.5">-15% IR JCP</div>
                        </>
                      ) : isIntTicker(r.ticker) ? (
                        <>
                          <div className="flex items-center gap-1.5 justify-end">
                            <span className="text-[9px] font-mono uppercase tracking-wider text-white/40">bruto</span>
                            <span className="text-[11px] font-mono text-white/60 line-through decoration-white/30">R$ {fmtBRL(r.valor_total)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 justify-end mt-0.5">
                            <span className="text-[9px] font-mono uppercase tracking-wider text-amber-400/80">líquido</span>
                            <span className="text-[13px] font-mono font-bold text-income">R$ {fmtBRL(r.valor_total * 0.70)}</span>
                          </div>
                          <div className="text-[9px] text-white/30 mt-0.5">-30% IR EUA</div>
                        </>
                      ) : (
                        <span className="text-[13px] font-mono font-semibold text-income block">R$ {fmtBRL(r.valor_total)}</span>
                      )}
                      {r.fonte === 'manual' && r.id ? (
                        <div className="mt-1 flex justify-end">
                          <ProventoActions
                            proventoId={typeof r.id === 'number' ? r.id : parseInt(String(r.id), 10)}
                            ticker={r.ticker}
                            tipo={r.tipo_provento}
                            valorPorCota={r.valor_por_cota || 0}
                            quantidade={r.quantidade || 0}
                            dataPagamento={r.data_pagamento}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
