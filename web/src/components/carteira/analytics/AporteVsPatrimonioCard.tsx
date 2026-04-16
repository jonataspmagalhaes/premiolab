'use client';

import { useMemo, useState } from 'react';
import { useUser, usePatrimonioSnapshots, useAporteEvents } from '@/lib/queries';
import { useAppStore } from '@/store';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Line } from 'recharts';
import { buildAporteVsPatrimonioSeries } from '@/lib/portfolioMetrics';

type Range = '1M' | '3M' | '6M' | '1A' | 'MAX';
const RANGE_DAYS: Record<Range, number | null> = { '1M': 30, '3M': 90, '6M': 180, '1A': 365, MAX: null };

function fmtBR(v: number): string {
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(2).replace('.', ',') + 'M';
  if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString('pt-BR');
  return v.toFixed(2).replace('.', ',');
}

function ChartTip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string; color: string; name: string }>; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  // Calcula o gap (ganho de capital) no ponto
  const aporte = payload.find((p) => p.dataKey === 'aporte')?.value ?? 0;
  const patrimonio = payload.find((p) => p.dataKey === 'patrimonio')?.value ?? 0;
  const ganho = patrimonio - aporte;
  return (
    <div className="bg-[#0e1118] border border-white/[0.08] rounded-lg px-3 py-2 shadow-2xl min-w-[180px]">
      <p className="text-[10px] text-white/40 font-mono mb-1.5">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-[11px]">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-white/60">{p.name}</span>
          <span className="font-mono font-semibold text-white ml-auto">R$ {fmtBR(p.value)}</span>
        </div>
      ))}
      <div className="mt-1.5 pt-1.5 border-t border-white/[0.08] flex items-center justify-between text-[10px]">
        <span className="text-white/45">Ganho de capital</span>
        <span className={'font-mono font-bold ' + (ganho >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
          {ganho >= 0 ? '+' : ''}R$ {fmtBR(ganho)}
        </span>
      </div>
    </div>
  );
}

export function AporteVsPatrimonioCard() {
  const userQ = useUser();
  const snapsQ = usePatrimonioSnapshots(userQ.data?.id);
  const evQ = useAporteEvents(userQ.data?.id);
  const patrimonio = useAppStore((s) => s.patrimonio);
  const [range, setRange] = useState<Range>('MAX');

  const built = useMemo(
    () => buildAporteVsPatrimonioSeries(
      (evQ.data || []).map((e) => ({ date: e.date, valor: e.valor })),
      snapsQ.data || [],
      patrimonio.total,
      RANGE_DAYS[range],
    ),
    [evQ.data, snapsQ.data, patrimonio.total, range],
  );

  const isLoading = snapsQ.isLoading || evQ.isLoading;
  const enough = built.series.length >= 2;
  const ganhoColor = built.summary.ganhoCapital >= 0 ? 'text-emerald-300' : 'text-rose-300';

  return (
    <div className="linear-card rounded-xl p-5 anim-up">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-orange-500/10">
          <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
        </div>
        <span className="text-xs font-medium text-white/50 uppercase tracking-wider">Aporte vs Patrimonio</span>
        <HelpTooltip />
        <div className="flex gap-0.5 ml-auto">
          {(Object.keys(RANGE_DAYS) as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={'px-1.5 py-0.5 rounded text-[10px] font-semibold transition ' + (range === r ? 'bg-orange-500/15 text-orange-300' : 'text-white/40 hover:text-white/70')}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs no topo */}
      {enough && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="px-2 py-1.5 rounded-md bg-white/[0.02]">
            <p className="text-[9px] uppercase tracking-wider text-white/40">Aportado</p>
            <p className="text-[12px] font-mono font-bold text-emerald-300/85 mt-0.5">R$ {fmtBR(built.summary.aporteTotal)}</p>
          </div>
          <div className="px-2 py-1.5 rounded-md bg-white/[0.02]">
            <p className="text-[9px] uppercase tracking-wider text-white/40">Patrimonio</p>
            <p className="text-[12px] font-mono font-bold text-orange-300 mt-0.5">R$ {fmtBR(built.summary.patrimonioAtual)}</p>
          </div>
          <div className="px-2 py-1.5 rounded-md bg-white/[0.02]">
            <p className="text-[9px] uppercase tracking-wider text-white/40">Ganho de capital</p>
            <p className={'text-[12px] font-mono font-bold mt-0.5 ' + ganhoColor}>
              {built.summary.ganhoCapital >= 0 ? '+' : ''}R$ {fmtBR(Math.abs(built.summary.ganhoCapital))}
              <span className="text-[10px] opacity-70 ml-1">
                ({built.summary.ganhoCapitalPct >= 0 ? '+' : ''}{built.summary.ganhoCapitalPct.toFixed(1).replace('.', ',')}%)
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Chart */}
      {isLoading ? (
        <div className="h-[200px] rounded-lg bg-white/[0.02] animate-pulse" />
      ) : !enough ? (
        <div className="h-[200px] flex flex-col items-center justify-center text-white/30 text-[11px] gap-1">
          <p>Sem aportes ou snapshots no periodo</p>
          <p className="text-[10px] text-white/20 italic">Snapshots gerados pela Edge Function semanal</p>
        </div>
      ) : (
        <div className="h-[200px] -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={built.series} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradAporte" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22C55E" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="#22C55E" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradPat" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F97316" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#F97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }} axisLine={false} tickLine={false} minTickGap={20} />
              <YAxis
                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => 'R$ ' + fmtBR(v)}
                width={56}
              />
              <Tooltip content={<ChartTip />} cursor={{ stroke: 'rgba(255,255,255,0.15)', strokeWidth: 1, strokeDasharray: '3 3' }} />
              <Area
                type="monotone"
                dataKey="aporte"
                name="Aportado"
                stroke="#22C55E"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                fill="url(#gradAporte)"
                dot={false}
              />
              <Area
                type="monotone"
                dataKey="patrimonio"
                name="Patrimonio"
                stroke="#F97316"
                strokeWidth={2}
                fill="url(#gradPat)"
                dot={false}
                activeDot={{ r: 4, fill: '#F97316', stroke: '#0e1118', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="text-[9px] text-white/30 italic leading-snug pt-2 mt-1 border-t border-white/[0.04]">
        Aporte liquido: operacoes (compra − venda) + RF + Fundos + Caixa. Resgates de RF/Fundos nao sao rastreados — pode superestimar.
      </p>
    </div>
  );
}

// Tooltip "?" compacto explicando aporte vs patrimonio
function HelpTooltip() {
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label="Como funciona"
        className="w-4 h-4 rounded-full border border-white/15 text-white/40 hover:text-white/80 hover:border-white/40 transition flex items-center justify-center text-[9px] font-bold cursor-help"
      >
        ?
      </button>
      <div className="pointer-events-none absolute left-0 top-full mt-2 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-150 w-[280px]">
        <div className="bg-[#0a0d14] border border-white/[0.12] rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.8)] p-3 text-left">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60 mb-2">Como funciona</p>
          <p className="text-[10.5px] text-white/70 leading-relaxed mb-2">
            <strong className="text-orange-300">Aporte</strong> = dinheiro novo (compra/venda/deposito).
            <strong className="text-emerald-300"> Patrimonio</strong> = valor de mercado atual.
            Diferenca entre as linhas = <strong className="text-white/90">ganho de capital</strong>.
          </p>
          <div className="space-y-1 text-[10px] text-white/55">
            <p>• Compra/venda → muda aporte e patrimonio</p>
            <p>• Ativo sobe/cai → so muda patrimonio</p>
            <p>• Deposito em caixa → ambos sobem juntos</p>
            <p>• Transferencia entre corretoras → nao muda nada</p>
          </div>
          <div className="mt-2 pt-2 border-t border-white/[0.08]">
            <p className="text-[10px] text-amber-300/90">
              ⚠ Cadastre dividendos em <strong>Proventos</strong>, nao como caixa — senao conta como aporte.
            </p>
          </div>
        </div>
        <div className="w-2 h-2 bg-[#0a0d14] border-l border-t border-white/[0.12] rotate-45 ml-3 -mt-1" />
      </div>
    </div>
  );
}
