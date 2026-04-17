'use client';

// Grafico Renda Mensal com stacked bar por top 5 tickers + "Outros".
// Tooltip customizado mostra breakdown por empresa.
// Click na barra abre Sheet com detalhamento completo do mes.

import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { TickerLogo } from '@/components/TickerLogo';
import { fmtBRL, fmtK, fmtMonthYear } from '@/lib/fmt';
import { valorLiquido, tipoLabel } from '@/lib/proventosUtils';

// ─── Types ─────────────────────────────────────────────────

interface EnrichedLite {
  ticker: string;
  tipo_provento: string;
  valor_total: number;
  date: Date;
  ts: number;
  corretora: string;
  categoria?: string;
}

interface Props {
  enriched: EnrichedLite[];
  mediaRef: number;
  heightPx?: number;
}

// Paleta orange progressiva para stacked top5
var PALETTE = ['#F97316', '#FB923C', '#FDBA74', '#FED7AA', '#FFE8D1'];
var OUTROS_COLOR = '#64748B';

// ─── Helpers ──────────────────────────────────────────────

function monthKey(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function buildDataset(enriched: EnrichedLite[]): {
  meses: Array<Record<string, number | string> & { _items: EnrichedLite[] }>;
  top5: string[];
} {
  var now = new Date();
  // 12 meses passados + atual
  var base: Array<{ key: string; label: string; date: Date; valor: number; porTicker: Record<string, number>; items: EnrichedLite[] }> = [];
  for (var i = 11; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    base.push({ key: monthKey(d), label: fmtMonthYear(d), date: d, valor: 0, porTicker: {}, items: [] });
  }
  var idx: Record<string, number> = {};
  base.forEach(function (m, i) { idx[m.key] = i; });

  // Total por ticker no periodo (para ranquear top 5)
  var totalPorTicker: Record<string, number> = {};

  enriched.forEach(function (pv) {
    if (Number.isNaN(pv.ts)) return;
    var k = monthKey(pv.date);
    if (idx[k] == null) return;
    // ignora futuros no grafico historico
    if (pv.ts > Date.now()) return;
    var liquido = valorLiquido(pv.valor_total || 0, pv.tipo_provento, pv.ticker);
    var m = base[idx[k]];
    m.valor += liquido;
    m.porTicker[pv.ticker] = (m.porTicker[pv.ticker] || 0) + liquido;
    m.items.push(pv);
    totalPorTicker[pv.ticker] = (totalPorTicker[pv.ticker] || 0) + liquido;
  });

  // Top 5 tickers do periodo por total
  var top5 = Object.keys(totalPorTicker)
    .sort(function (a, b) { return totalPorTicker[b] - totalPorTicker[a]; })
    .slice(0, 5);
  var top5Set: Record<string, boolean> = {};
  top5.forEach(function (t) { top5Set[t] = true; });

  // Monta dataset com 1 coluna por ticker top5 + "Outros"
  var meses = base.map(function (m) {
    // Usa unknown cast porque _items nao e serializavel via index signature
    var row = {
      label: m.label,
      _key: m.key,
      _total: m.valor,
      _items: m.items,
    } as unknown as Record<string, number | string> & { _items: EnrichedLite[] };
    var outros = 0;
    Object.keys(m.porTicker).forEach(function (tk) {
      if (top5Set[tk]) {
        row[tk] = m.porTicker[tk];
      } else {
        outros += m.porTicker[tk];
      }
    });
    // Preenche zeros pra stacked funcionar
    top5.forEach(function (tk) { if (row[tk] == null) row[tk] = 0; });
    row['Outros'] = outros;
    return row;
  });

  return { meses: meses, top5: top5 };
}

// ─── Custom Tooltip ───────────────────────────────────────

function CustomTooltip(props: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!props.active || !props.payload || props.payload.length === 0) return null;
  // Ordena desc por valor; filtra zeros
  var entries = props.payload
    .map(function (p) { return { name: p.name, value: Number(p.value) || 0, color: p.color }; })
    .filter(function (p) { return p.value > 0; })
    .sort(function (a, b) { return b.value - a.value; });
  var total = entries.reduce(function (acc, p) { return acc + p.value; }, 0);
  if (total === 0) return null;
  return (
    <div
      className="rounded-lg border border-white/[0.08] bg-[#0a0d14] px-3 py-2 shadow-xl"
      style={{ fontSize: 12, minWidth: 180 }}
    >
      <p className="text-[11px] text-white/50 mb-1.5">{props.label}</p>
      <div className="space-y-1">
        {entries.map(function (p) {
          return (
            <div key={p.name} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-sm" style={{ background: p.color }} />
                <span className="text-[11px] text-white/80">{p.name}</span>
              </span>
              <span className="font-mono text-[11px] text-white/90">R$ {fmtBRL(p.value)}</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-white/[0.06]">
        <span className="text-[10px] uppercase tracking-wider text-white/50">Total</span>
        <span className="font-mono text-[12px] text-income font-semibold">R$ {fmtBRL(total)}</span>
      </div>
      <p className="text-[9px] text-white/30 mt-1.5">Clique para detalhar</p>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────

export function RendaMensalChart(props: Props) {
  var built = useMemo(function () { return buildDataset(props.enriched); }, [props.enriched]);

  // Sheet state
  var _selected = useState<{ label: string; items: EnrichedLite[] } | null>(null);
  var selected = _selected[0];
  var setSelected = _selected[1];

  function handleBarClick(data: { payload?: { label?: string; _items?: EnrichedLite[] } }) {
    if (!data || !data.payload) return;
    var items = data.payload._items || [];
    if (items.length === 0) return;
    setSelected({ label: String(data.payload.label || ''), items: items });
  }

  return (
    <>
      <div style={{ width: '100%', height: props.heightPx || 220 }}>
        <ResponsiveContainer>
          <BarChart data={built.meses} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={function (v) { return 'R$ ' + fmtK(v); }}
            />
            <Tooltip
              cursor={{ fill: 'rgba(249,115,22,0.06)' }}
              content={<CustomTooltip />}
            />
            {props.mediaRef > 0 ? (
              <ReferenceLine y={props.mediaRef} stroke="rgba(34,197,94,0.5)" strokeDasharray="4 4" />
            ) : null}
            {built.top5.map(function (tk, i) {
              return (
                <Bar
                  key={tk}
                  dataKey={tk}
                  stackId="r"
                  fill={PALETTE[i] || PALETTE[PALETTE.length - 1]}
                  maxBarSize={36}
                  onClick={handleBarClick}
                  cursor="pointer"
                />
              );
            })}
            <Bar
              key="Outros"
              dataKey="Outros"
              stackId="r"
              fill={OUTROS_COLOR}
              radius={[4, 4, 0, 0]}
              maxBarSize={36}
              onClick={handleBarClick}
              cursor="pointer"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legenda compacta top5 */}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
        {built.top5.map(function (tk, i) {
          return (
            <span key={tk} className="flex items-center gap-1 text-white/60">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ background: PALETTE[i] || PALETTE[PALETTE.length - 1] }} />
              {tk}
            </span>
          );
        })}
        {built.top5.length > 0 ? (
          <span className="flex items-center gap-1 text-white/40">
            <span className="inline-block w-2 h-2 rounded-sm" style={{ background: OUTROS_COLOR }} />
            Outros
          </span>
        ) : null}
      </div>

      {/* Sheet de detalhamento do mes */}
      <Sheet open={selected != null} onOpenChange={function (o) { if (!o) setSelected(null); }}>
        <SheetContent side="right" className="w-full sm:w-[420px] bg-[#0a0d14] border-white/[0.08]">
          <SheetHeader>
            <SheetTitle>Proventos — {selected?.label || ''}</SheetTitle>
            <SheetDescription>
              {selected?.items.length || 0} pagamento{(selected?.items.length || 0) === 1 ? '' : 's'} no mes
            </SheetDescription>
          </SheetHeader>
          <DetailList items={selected?.items || []} />
        </SheetContent>
      </Sheet>
    </>
  );
}

function DetailList(props: { items: EnrichedLite[] }) {
  // Agrupa por ticker + totaliza
  var agregado = useMemo(function () {
    var byTk: Record<string, { ticker: string; categoria: string; total: number; count: number; tipos: Record<string, number>; corretoras: Record<string, boolean> }> = {};
    props.items.forEach(function (it) {
      var liq = valorLiquido(it.valor_total || 0, it.tipo_provento, it.ticker);
      if (!byTk[it.ticker]) byTk[it.ticker] = { ticker: it.ticker, categoria: it.categoria || 'acao', total: 0, count: 0, tipos: {}, corretoras: {} };
      byTk[it.ticker].total += liq;
      byTk[it.ticker].count += 1;
      var tl = tipoLabel(it.tipo_provento);
      byTk[it.ticker].tipos[tl] = (byTk[it.ticker].tipos[tl] || 0) + liq;
      if (it.corretora) byTk[it.ticker].corretoras[it.corretora] = true;
    });
    return Object.values(byTk).sort(function (a, b) { return b.total - a.total; });
  }, [props.items]);

  var totalMes = useMemo(function () {
    return agregado.reduce(function (a, x) { return a + x.total; }, 0);
  }, [agregado]);

  if (agregado.length === 0) {
    return <p className="text-[12px] text-white/40 italic mt-6">Sem proventos.</p>;
  }

  return (
    <div className="mt-5 px-4 space-y-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 160px)' }}>
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
        <span className="text-[11px] uppercase tracking-wider text-white/40">Total liquido</span>
        <span className="font-mono text-[15px] font-bold text-income">R$ {fmtBRL(totalMes)}</span>
      </div>
      {agregado.map(function (a) {
        var tipos = Object.keys(a.tipos);
        var corretoras = Object.keys(a.corretoras);
        return (
          <div key={a.ticker} className="flex items-start justify-between gap-3 py-2 border-b border-white/[0.04] last:border-0">
            <div className="flex items-center gap-2.5">
              <TickerLogo ticker={a.ticker} categoria={a.categoria} size={32} />
              <div>
                <p className="text-[13px] font-semibold leading-tight">{a.ticker}</p>
                <p className="text-[10px] text-white/40 leading-tight mt-0.5">
                  {a.count} pgto{a.count === 1 ? '' : 's'}
                  {tipos.length > 0 ? ' · ' + tipos.join(', ') : ''}
                  {corretoras.length > 0 ? ' · ' + corretoras.join(', ') : ''}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-mono text-[13px] font-semibold text-income">R$ {fmtBRL(a.total)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
