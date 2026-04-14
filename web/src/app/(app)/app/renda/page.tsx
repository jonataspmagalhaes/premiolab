'use client';

import { useMemo, useState } from 'react';
import { useAppStore, type Position } from '@/store';
import { TickerLogo } from '@/components/TickerLogo';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';

// ─── Utils ─────────────────────────────────────────────────

function fmtBRL(v: number): string {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtK(v: number): string {
  if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k';
  return Math.round(v).toString();
}
function fmtMonthYear(d: Date): string {
  var m = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return m[d.getMonth()] + '/' + String(d.getFullYear()).slice(-2);
}
function fmtDate(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// ─── Provento corretora inference ──────────────────────────
// Mapeia ticker -> corretora majoritaria (top bucket de por_corretora)
function buildCorretoraMap(positions: Position[]): Record<string, string> {
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
  var end = now.getTime();
  if (k === 'mes') {
    var s = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: s.getTime(), end: end };
  }
  if (k === 'anterior') {
    var s2 = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    var e2 = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: s2.getTime(), end: e2.getTime() };
  }
  if (k === '3m') return { start: end - 90 * 86400000, end: end };
  if (k === '12m') return { start: end - 365 * 86400000, end: end };
  if (k === 'ano') return { start: new Date(now.getFullYear(), 0, 1).getTime(), end: end };
  return { start: 0, end: end };
}

// ─── Tipo provento label ──────────────────────────────────

function tipoLabel(t: string): string {
  var x = (t || '').toLowerCase();
  if (x.indexOf('jcp') >= 0 || x.indexOf('juros') >= 0) return 'JCP';
  if (x.indexOf('rend') >= 0) return 'Rendimento';
  if (x.indexOf('bonif') >= 0) return 'Bonificacao';
  if (x.indexOf('amort') >= 0) return 'Amortizacao';
  return 'Dividendo';
}

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

  var _tab = useState<'resumo' | 'proventos'>('resumo');
  var subtab = _tab[0];
  var setSubtab = _tab[1];

  var corretoraByTicker = useMemo(function () { return buildCorretoraMap(positions); }, [positions]);

  // Enrich proventos com corretora inferida
  var enriched = useMemo(function () {
    return proventos.map(function (pv) {
      var corr = corretoraByTicker[(pv.ticker || '').toUpperCase()] || '—';
      var d = new Date(pv.data_pagamento);
      return {
        id: pv.id,
        ticker: (pv.ticker || '').toUpperCase(),
        tipo_provento: pv.tipo_provento,
        valor_total: pv.valor_total || 0,
        data_pagamento: pv.data_pagamento,
        date: d,
        ts: d.getTime(),
        corretora: corr,
      };
    }).sort(function (a, b) { return b.ts - a.ts; });
  }, [proventos, corretoraByTicker]);

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
        </div>
      </div>

      {subtab === 'resumo' ? (
        <ResumoView enriched={enriched} positions={positions} patrimonioTotal={patrimonio.total} />
      ) : (
        <ProventosView enriched={enriched} />
      )}
    </div>
  );
}

// ─── Resumo View ───────────────────────────────────────────

type Enriched = {
  id?: string;
  ticker: string;
  tipo_provento: string;
  valor_total: number;
  data_pagamento: string;
  date: Date;
  ts: number;
  corretora: string;
};

function ResumoView({ enriched, positions, patrimonioTotal }: { enriched: Enriched[]; positions: Position[]; patrimonioTotal: number }) {
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
      if (idx[k] != null) months[idx[k]].valor += pv.valor_total;
    });
    return months;
  }, [enriched]);

  var totals = useMemo(function () {
    var total12m = 0;
    for (var i = 0; i < mensal.length; i++) total12m += mensal[i].valor;
    var media = total12m / 12;
    var dyMedio = patrimonioTotal > 0 ? (total12m / patrimonioTotal) * 100 : 0;
    // Proximos 30d: estima usando media historica por ticker × posicao atual / 12
    var proximos30 = 0;
    var posByTicker: Record<string, number> = {};
    positions.forEach(function (p) { posByTicker[p.ticker] = p.quantidade; });
    var sumByTicker: Record<string, { v: number; n: number }> = {};
    enriched.forEach(function (pv) {
      if (Number.isNaN(pv.ts) || pv.ts < Date.now() - 365 * 86400000) return;
      var s = sumByTicker[pv.ticker] || { v: 0, n: 0 };
      s.v += pv.valor_total;
      s.n += 1;
      sumByTicker[pv.ticker] = s;
    });
    Object.keys(sumByTicker).forEach(function (tk) {
      if (posByTicker[tk] > 0) {
        proximos30 += sumByTicker[tk].v / 12; // media mensal
      }
    });
    return { total12m: total12m, media: media, dyMedio: dyMedio, proximos30: proximos30 };
  }, [mensal, enriched, positions, patrimonioTotal]);

  // Top 5 estimados proximos pagamentos: tickers que pagaram este mes em algum ano
  var proximos = useMemo(function () {
    var thisMonth = new Date().getMonth();
    var byTicker: Record<string, { ticker: string; valorMedio: number; ultimaData?: Date; categoria: string }> = {};
    enriched.forEach(function (pv) {
      if (pv.date.getMonth() !== thisMonth) return;
      if (!byTicker[pv.ticker]) {
        var pos = positions.find(function (p) { return p.ticker === pv.ticker; });
        byTicker[pv.ticker] = { ticker: pv.ticker, valorMedio: 0, categoria: pos ? pos.categoria : 'acao' };
      }
      byTicker[pv.ticker].valorMedio += pv.valor_total;
    });
    return Object.values(byTicker)
      .filter(function (x) { return positions.some(function (p) { return p.ticker === x.ticker && p.quantidade > 0; }); })
      .sort(function (a, b) { return b.valorMedio - a.valorMedio; })
      .slice(0, 5);
  }, [enriched, positions]);

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
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={mensal} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} axisLine={false} tickLine={false} tickFormatter={function (v) { return 'R$ ' + fmtK(v); }} />
              <Tooltip
                cursor={{ fill: 'rgba(249,115,22,0.06)' }}
                contentStyle={{ background: '#0a0d14', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
                formatter={function (v: unknown) { return ['R$ ' + fmtBRL(Number(v) || 0), 'Recebido']; }}
              />
              <ReferenceLine y={totals.media} stroke="rgba(34,197,94,0.5)" strokeDasharray="4 4" />
              <Bar dataKey="valor" fill="#F97316" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* KPI vertical */}
      <div className="col-span-12 lg:col-span-4 grid grid-cols-2 lg:grid-cols-1 gap-3">
        <Kpi label="Total 12m" value={'R$ ' + fmtBRL(totals.total12m)} accent="text-income" />
        <Kpi label="Media mensal" value={'R$ ' + fmtBRL(totals.media)} accent="text-orange-300" />
        <Kpi label="Proximos 30d" value={'R$ ' + fmtBRL(totals.proximos30)} accent="text-info" sub="Estimado" />
        <Kpi label="DY medio carteira" value={totals.dyMedio > 0 ? totals.dyMedio.toFixed(2) + '% a.a.' : '—'} accent="text-warning" />
      </div>

      {/* Proximos pagamentos */}
      <div className="col-span-12 lg:col-span-6 linear-card rounded-xl p-5">
        <p className="text-xs uppercase tracking-wider text-white/40 font-mono mb-3">Proximos pagamentos · {proximos.length} ativos</p>
        {proximos.length === 0 ? (
          <p className="text-[12px] text-white/30 italic">Sem historico no mes.</p>
        ) : (
          <div className="space-y-2">
            {proximos.map(function (x) {
              return (
                <div key={x.ticker} className="flex items-center justify-between py-1.5 border-b border-white/[0.03] last:border-0">
                  <div className="flex items-center gap-2.5">
                    <TickerLogo ticker={x.ticker} categoria={x.categoria} size={28} />
                    <div>
                      <p className="text-[12px] font-semibold leading-tight">{x.ticker}</p>
                      <p className="text-[10px] text-white/40 leading-tight">Estimado</p>
                    </div>
                  </div>
                  <p className="text-[12px] font-mono font-semibold text-income">R$ {fmtBRL(x.valorMedio)}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Projecao 12m */}
      <div className="col-span-12 lg:col-span-6 linear-card rounded-xl p-5">
        <p className="text-xs uppercase tracking-wider text-white/40 font-mono mb-3">Projecao 12m</p>
        <p className="text-[12px] text-white/50 mb-3">
          Baseado na media historica × posicao atual.
        </p>
        <div style={{ width: '100%', height: 160 }}>
          <ResponsiveContainer>
            <BarChart
              data={(function () {
                var now = new Date();
                var arr: { label: string; valor: number }[] = [];
                for (var i = 1; i <= 12; i++) {
                  var d = new Date(now.getFullYear(), now.getMonth() + i, 1);
                  arr.push({ label: fmtMonthYear(d), valor: totals.proximos30 });
                }
                return arr;
              })()}
              margin={{ top: 6, right: 4, left: -12, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }} axisLine={false} tickLine={false} tickFormatter={function (v) { return 'R$ ' + fmtK(v); }} />
              <Tooltip
                cursor={{ fill: 'rgba(249,115,22,0.06)' }}
                contentStyle={{ background: '#0a0d14', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
                formatter={function (v: unknown) { return ['R$ ' + fmtBRL(Number(v) || 0), 'Estimativa']; }}
              />
              <Bar dataKey="valor" fill="#F97316" fillOpacity={0.35} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
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

function ProventosView({ enriched }: { enriched: Enriched[] }) {
  var _per = useState<PeriodoKey>('mes');
  var periodo = _per[0];
  var setPeriodo = _per[1];

  var _grp = useState<'data' | 'ticker' | 'corretora'>('data');
  var grp = _grp[0];
  var setGrp = _grp[1];

  var rng = useMemo(function () { return periodoRange(periodo); }, [periodo]);

  var filtered = useMemo(function () {
    return enriched.filter(function (pv) {
      return pv.ts >= rng.start && pv.ts < rng.end;
    });
  }, [enriched, rng]);

  var total = useMemo(function () {
    var t = 0;
    for (var i = 0; i < filtered.length; i++) t += filtered[i].valor_total;
    return t;
  }, [filtered]);

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
      </div>

      {/* Total */}
      <div className="linear-card rounded-xl p-5 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-white/40 font-mono">Total no periodo</p>
          <p className="text-2xl font-bold font-mono mt-1 text-income">R$ {fmtBRL(total)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-white/40 font-mono">Proventos</p>
          <p className="text-2xl font-bold font-mono mt-1">{filtered.length}</p>
        </div>
      </div>

      {/* Toggle agrupamento */}
      <div className="flex items-center gap-2">
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
      </div>

      {/* Lista */}
      <div className="linear-card rounded-xl p-5">
        {filtered.length === 0 ? (
          <p className="text-[12px] text-white/40 italic text-center py-8">Sem proventos no periodo.</p>
        ) : (
          <ProventosList rows={filtered} grupo={grp} />
        )}
      </div>
    </div>
  );
}

function ProventosList({ rows, grupo }: { rows: Enriched[]; grupo: 'data' | 'ticker' | 'corretora' }) {
  var grouped = useMemo(function () {
    if (grupo === 'data') {
      // Agrupa por mes
      var byMonth: Record<string, { label: string; total: number; rows: Enriched[]; ts: number }> = {};
      rows.forEach(function (r) {
        var k = r.date.getFullYear() + '-' + r.date.getMonth();
        if (!byMonth[k]) byMonth[k] = { label: fmtMonthYear(r.date), total: 0, rows: [], ts: new Date(r.date.getFullYear(), r.date.getMonth(), 1).getTime() };
        byMonth[k].rows.push(r);
        byMonth[k].total += r.valor_total;
      });
      return Object.values(byMonth).sort(function (a, b) { return b.ts - a.ts; });
    }
    var by: Record<string, { label: string; total: number; rows: Enriched[]; ts: number }> = {};
    rows.forEach(function (r) {
      var k = grupo === 'ticker' ? r.ticker : r.corretora;
      if (!by[k]) by[k] = { label: k || '—', total: 0, rows: [], ts: 0 };
      by[k].rows.push(r);
      by[k].total += r.valor_total;
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
                {grupo === 'ticker' && g.rows[0] && <TickerLogo ticker={g.rows[0].ticker} categoria="acao" size={24} />}
                <span className="text-[12px] font-bold text-white/85">{g.label}</span>
                <span className="text-[10px] text-white/30 font-mono">{g.rows.length}</span>
              </div>
              <span className="text-[12px] font-mono font-semibold text-income">R$ {fmtBRL(g.total)}</span>
            </div>
            <div className="space-y-1">
              {g.rows.map(function (r, idx) {
                return (
                  <div key={(r.id || r.ticker) + '-' + idx} className="flex items-center justify-between py-1.5 hover:bg-white/[0.02] rounded px-2 transition">
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      {grupo !== 'ticker' && <TickerLogo ticker={r.ticker} categoria="acao" size={24} />}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-semibold">{r.ticker}</span>
                          <span className={'text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ' + tipoColor(r.tipo_provento)}>{tipoLabel(r.tipo_provento)}</span>
                        </div>
                        <p className="text-[10px] text-white/40 leading-tight truncate">{r.corretora} · {fmtDate(r.date)}</p>
                      </div>
                    </div>
                    <span className="text-[12px] font-mono font-semibold text-income shrink-0">R$ {fmtBRL(r.valor_total)}</span>
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
