'use client';

// Insights visuais no topo da aba Proventos:
// - Card grande de Total + YoY (comparativo com mesmo periodo ano passado)
// - Sparkline mensal ao lado do total
// - Mini donut por tipo (Div/JCP/Rend/INT)

import { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, Tooltip as RTooltip, PieChart, Pie, Cell } from 'recharts';
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

  // Sparkline mensal (dentro do periodo)
  var mensal = useMemo(function () {
    if (props.filtered.length === 0) return [];
    var mapa: Record<string, { label: string; ts: number; valor: number }> = {};
    props.filtered.forEach(function (r) {
      var k = r.date.getFullYear() + '-' + r.date.getMonth();
      if (!mapa[k]) {
        mapa[k] = {
          label: fmtMonthYear(r.date),
          ts: new Date(r.date.getFullYear(), r.date.getMonth(), 1).getTime(),
          valor: 0,
        };
      }
      mapa[k].valor += valorLiquido(r.valor_total, r.tipo_provento, r.ticker);
    });
    return Object.values(mapa).sort(function (a, b) { return a.ts - b.ts; });
  }, [props.filtered]);

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
    return [
      { name: 'Dividendos BR', value: agg.Dividendo, color: '#F97316' },
      { name: 'JCP', value: agg.JCP, color: '#3B82F6' },
      { name: 'Rendimento FII', value: agg.Rendimento, color: '#22C55E' },
      { name: 'Dividendos EUA', value: agg.Exterior, color: '#E879F9' },
    ].filter(function (e) { return e.value > 0; });
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

      {/* Sparkline mensal */}
      <div className="col-span-12 sm:col-span-5">
        {mensal.length === 0 ? (
          <p className="text-[11px] text-white/30 italic">Sem dados pra grafico</p>
        ) : (
          <>
            <p className="text-[10px] uppercase tracking-wider text-white/40 font-mono mb-1">Mensal</p>
            <div style={{ width: '100%', height: 56 }}>
              <ResponsiveContainer>
                <BarChart data={mensal} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                  <RTooltip
                    cursor={{ fill: 'rgba(249,115,22,0.06)' }}
                    contentStyle={{ background: '#0a0d14', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 11 }}
                    formatter={function (v: unknown) { return ['R$ ' + fmtBRL(Number(v) || 0), 'Recebido']; }}
                    labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
                  />
                  <Bar dataKey="valor" fill="#F97316" radius={[2, 2, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-between text-[9px] font-mono text-white/40 mt-0.5">
              <span>{mensal[0]?.label}</span>
              {mensal.length > 1 ? <span>{mensal[mensal.length - 1].label}</span> : null}
            </div>
          </>
        )}
      </div>

      {/* Donut por tipo */}
      <div className="col-span-12 sm:col-span-3">
        {porTipo.length === 0 ? null : (
          <div className="flex items-center gap-3">
            <div style={{ width: 70, height: 70, position: 'relative' }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={porTipo}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={22}
                    outerRadius={33}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {porTipo.map(function (d, i) { return <Cell key={i} fill={d.color} />; })}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-0.5 flex-1 min-w-0">
              {porTipo.slice(0, 4).map(function (t) {
                var pct = (t.value / totalAtual) * 100;
                return (
                  <div key={t.name} className="flex items-center justify-between gap-2 text-[10px]">
                    <span className="flex items-center gap-1 min-w-0 truncate">
                      <span className="inline-block w-1.5 h-1.5 rounded-sm shrink-0" style={{ background: t.color }} />
                      <span className="text-white/60 truncate">{t.name}</span>
                    </span>
                    <span className="font-mono text-white/70 shrink-0">{pct.toFixed(0)}%</span>
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
