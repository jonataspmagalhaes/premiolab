'use client';

// Insights visuais no topo da aba Proventos:
// - Card grande de Total + YoY (comparativo com mesmo periodo ano passado)
// - Sparkline mensal ao lado do total
// - Mini donut por tipo (Div/JCP/Rend/INT)

import { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, PieChart, Pie, Cell, CartesianGrid } from 'recharts';
import { valorLiquido, tipoLabel, isIntTicker } from '@/lib/proventosUtils';
import { fmtBRL, fmtK, fmtMonthYear } from '@/lib/fmt';

interface EnrichedLite {
  ticker: string;
  tipo_provento: string;
  valor_total: number;
  date: Date;
  ts: number;
}

interface Props {
  filtered: EnrichedLite[];     // ja filtrado pelo periodo atual
  allEnriched: EnrichedLite[];  // dataset completo (pra calcular YoY)
  periodoStart: number;
  periodoEnd: number;
  onSelecionarMes?: (mesStart: Date, mesEnd: Date) => void;
}

function sumLiquido(rows: EnrichedLite[]): number {
  var t = 0;
  for (var i = 0; i < rows.length; i++) {
    t += valorLiquido(rows[i].valor_total, rows[i].tipo_provento, rows[i].ticker);
  }
  return t;
}

export function ProventosInsights(props: Props) {
  // Total liquido do periodo
  var totalAtual = useMemo(function () { return sumLiquido(props.filtered); }, [props.filtered]);

  // YoY: mesmo periodo do ano passado
  var totalAnoPassado = useMemo(function () {
    var umAno = 365 * 86400000;
    var startPrev = props.periodoStart - umAno;
    var endPrev = props.periodoEnd - umAno;
    var linhas = props.allEnriched.filter(function (r) { return r.ts >= startPrev && r.ts < endPrev; });
    return sumLiquido(linhas);
  }, [props.allEnriched, props.periodoStart, props.periodoEnd]);

  var yoyPct = totalAnoPassado > 0 ? ((totalAtual / totalAnoPassado) - 1) * 100 : 0;
  var yoyAbs = totalAtual - totalAnoPassado;

  // Sparkline SEMPRE mostra os ultimos 12 meses corridos (independente do
  // filtro de periodo). Da contexto historico mesmo quando o user filtrou
  // so o mes atual. Usa allEnriched, nao filtered.
  var mensal = useMemo(function () {
    var now = new Date();
    var base: Array<{ label: string; ts: number; valor: number; dentroFiltro: boolean }> = [];
    for (var i = 11; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      base.push({
        label: fmtMonthYear(d),
        ts: d.getTime(),
        valor: 0,
        dentroFiltro: d.getTime() >= props.periodoStart && d.getTime() < props.periodoEnd,
      });
    }
    var idx: Record<string, number> = {};
    base.forEach(function (m, i) { idx[String(m.ts)] = i; });
    props.allEnriched.forEach(function (r) {
      var mStart = new Date(r.date.getFullYear(), r.date.getMonth(), 1).getTime();
      var i2 = idx[String(mStart)];
      if (i2 == null) return;
      if (r.ts > Date.now()) return; // so passado
      base[i2].valor += valorLiquido(r.valor_total, r.tipo_provento, r.ticker);
    });
    return base;
  }, [props.allEnriched, props.periodoStart, props.periodoEnd]);

  // Breakdown por tipo
  var porTipo = useMemo(function () {
    var agg = { Dividendo: 0, JCP: 0, Rendimento: 0, Exterior: 0 };
    props.filtered.forEach(function (r) {
      var liq = valorLiquido(r.valor_total, r.tipo_provento, r.ticker);
      var tl = tipoLabel(r.tipo_provento);
      if (isIntTicker(r.ticker) && tl === 'Dividendo') {
        agg.Exterior += liq;
      } else if (tl === 'JCP') {
        agg.JCP += liq;
      } else if (tl === 'Rendimento') {
        agg.Rendimento += liq;
      } else {
        agg.Dividendo += liq;
      }
    });
    var totalTmp = agg.Dividendo + agg.JCP + agg.Rendimento + agg.Exterior;
    var minValor = totalTmp * 0.01; // filtra fatias < 1% pra evitar "0%" visual feio
    return [
      { name: 'Dividendos BR', value: agg.Dividendo, color: '#F97316' },
      { name: 'JCP', value: agg.JCP, color: '#3B82F6' },
      { name: 'Rendimento FII', value: agg.Rendimento, color: '#22C55E' },
      { name: 'Dividendos EUA', value: agg.Exterior, color: '#E879F9' },
    ]
      .filter(function (e) { return e.value > minValor; })
      .sort(function (a, b) { return b.value - a.value; });
  }, [props.filtered]);

  var yoyDisponivel = totalAnoPassado > 0.01;

  return (
    <div className="linear-card rounded-xl p-5 grid grid-cols-12 gap-4 items-center">
      {/* Total + YoY */}
      <div className="col-span-12 sm:col-span-4">
        <p className="text-[10px] uppercase tracking-wider text-white/40 font-mono">Total liquido no periodo</p>
        <p className="text-2xl font-bold font-mono mt-1 text-income">R$ {fmtBRL(totalAtual)}</p>
        <div className="text-[11px] mt-1 flex items-center gap-2">
          <span className="text-white/40">
            {props.filtered.length} pagamento{props.filtered.length === 1 ? '' : 's'}
          </span>
          {yoyDisponivel ? (
            <>
              <span className="text-white/20">·</span>
              <span className={yoyPct >= 0 ? 'text-income' : 'text-red-300'}>
                {yoyPct >= 0 ? '↑' : '↓'} {Math.abs(yoyPct).toFixed(1)}% vs ano passado
              </span>
            </>
          ) : null}
        </div>
        {yoyDisponivel ? (
          <p className="text-[10px] text-white/30 mt-0.5 font-mono">
            {yoyAbs >= 0 ? '+' : ''}R$ {fmtBRL(Math.abs(yoyAbs))} em relacao a R$ {fmtBRL(totalAnoPassado)}
          </p>
        ) : null}
      </div>

      {/* BarChart mensal — 12m corridos com eixos e destaque do periodo filtrado */}
      <div className="col-span-12 sm:col-span-5">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] uppercase tracking-wider text-white/40 font-mono">Historico 12 meses</p>
          <p className="text-[9px] text-white/40">
            <span className="inline-block w-2 h-2 rounded-sm bg-orange-500 mr-1 align-middle" />
            periodo selecionado
          </p>
        </div>
        <div style={{ width: '100%', height: 120 }}>
          <ResponsiveContainer>
            <BarChart data={mensal} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }}
                axisLine={false}
                tickLine={false}
                interval={0}
              />
              <YAxis
                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9, fontFamily: 'JetBrains Mono, monospace' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={function (v) { return 'R$ ' + fmtK(v); }}
                width={48}
              />
              <RTooltip
                cursor={{ fill: 'rgba(249,115,22,0.06)' }}
                contentStyle={{ background: '#0a0d14', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 11 }}
                labelFormatter={function (label: unknown) { return String(label); }}
                formatter={function (v: unknown) { return ['R$ ' + fmtBRL(Number(v) || 0), 'Recebido']; }}
              />
              <Bar
                dataKey="valor"
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
                cursor={props.onSelecionarMes ? 'pointer' : undefined}
                onClick={function (data: { payload?: { ts?: number } }) {
                  if (!props.onSelecionarMes || !data || !data.payload || !data.payload.ts) return;
                  var ts = data.payload.ts;
                  var d = new Date(ts);
                  var inicio = new Date(d.getFullYear(), d.getMonth(), 1);
                  var fim = new Date(d.getFullYear(), d.getMonth() + 1, 0); // ultimo dia do mes
                  props.onSelecionarMes(inicio, fim);
                }}
                shape={function (p: unknown) {
                  var anyP = p as { x?: number; y?: number; width?: number; height?: number; payload?: { dentroFiltro?: boolean } };
                  var dentro = anyP.payload?.dentroFiltro;
                  var x = anyP.x ?? 0, y = anyP.y ?? 0, w = anyP.width ?? 0, h = anyP.height ?? 0;
                  return <rect x={x} y={y} width={w} height={h} fill={dentro ? '#F97316' : 'rgba(255,255,255,0.14)'} rx={3} ry={3} />;
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Donut por tipo — maior e mais legivel */}
      <div className="col-span-12 sm:col-span-3">
        {porTipo.length === 0 ? (
          <p className="text-[11px] text-white/30 italic">Sem dados</p>
        ) : (
          <div className="flex items-center gap-3">
            <div style={{ width: 96, height: 96, position: 'relative' }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={porTipo}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={32}
                    outerRadius={46}
                    paddingAngle={porTipo.length > 1 ? 2 : 0}
                    strokeWidth={0}
                  >
                    {porTipo.map(function (d, i) { return <Cell key={i} fill={d.color} />; })}
                  </Pie>
                  <RTooltip
                    contentStyle={{ background: '#0a0d14', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 11 }}
                    formatter={function (v: unknown) { return ['R$ ' + fmtBRL(Number(v) || 0), '']; }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Label no centro — maior categoria */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div className="text-center">
                  <p className="text-[13px] font-semibold font-mono" style={{ color: porTipo[0].color }}>
                    {totalAtual > 0 ? ((porTipo[0].value / totalAtual) * 100).toFixed(0) + '%' : '0%'}
                  </p>
                  <p className="text-[8px] text-white/40 leading-none mt-0.5">{porTipo[0].name.split(' ')[0]}</p>
                </div>
              </div>
            </div>
            <div className="space-y-1 flex-1 min-w-0">
              {porTipo.map(function (t) {
                var pct = totalAtual > 0 ? (t.value / totalAtual) * 100 : 0;
                if (pct < 0.5) return null; // filtra fatias irrisorias
                return (
                  <div key={t.name} className="flex items-center justify-between gap-2 text-[10px]">
                    <span className="flex items-center gap-1.5 min-w-0 truncate">
                      <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ background: t.color }} />
                      <span className="text-white/70 truncate">{t.name}</span>
                    </span>
                    <span className="font-mono font-semibold text-white/80 shrink-0">{pct.toFixed(0)}%</span>
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

// Yield on Cost helper — dado valor_por_cota e PM na data, calcula YoC%
export function calcularYoC(valorPorCota: number | undefined, pm: number | undefined): number | null {
  if (!valorPorCota || !pm || pm <= 0) return null;
  return (valorPorCota / pm) * 100;
}

// Formatar YoC
export function fmtYoC(yoc: number | null): string {
  if (yoc == null) return '—';
  return yoc.toFixed(2) + '%';
}

// Suprime unused warning
export function _unused() { return fmtK(0); }
