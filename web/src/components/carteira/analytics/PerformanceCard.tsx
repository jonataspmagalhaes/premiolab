'use client';

import { useMemo } from 'react';
import { useUser, usePatrimonioSnapshots } from '@/lib/queries';
import { useAppStore } from '@/store';
import { useMacroIndices } from '@/lib/useMacroIndices';
import { computePerformance, buildPerformanceSeries } from '@/lib/portfolioMetrics';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';

// Performance: rentabilidade vs CDI vs IPCA + chart de evolucao acumulada.
// Aviso: nao desconta aportes (sem aporte tracking nos snapshots).

export function PerformanceCard() {
  const userQ = useUser();
  const snapsQ = usePatrimonioSnapshots(userQ.data?.id);
  const total = useAppStore((s) => s.patrimonio.total);
  const macro = useMacroIndices();
  const cdi = macro.data?.cdi ?? 14.65;
  const ipca = macro.data?.ipca_12m ?? 4.14;

  const m = useMemo(
    () => computePerformance(snapsQ.data || [], total, cdi, ipca),
    [snapsQ.data, total, cdi, ipca],
  );

  const series = useMemo(
    () => buildPerformanceSeries(snapsQ.data || [], total, cdi, ipca, null),
    [snapsQ.data, total, cdi, ipca],
  );

  const enough = (snapsQ.data?.length || 0) > 0 && total > 0;

  return (
    <div className="linear-card rounded-xl p-5 anim-up h-full flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-orange-500/10">
          <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.518l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
          </svg>
        </div>
        <span className="text-xs font-medium text-white/50 uppercase tracking-wider flex-1">Performance</span>
        <div className="flex items-center gap-2 text-[9px] text-white/40 font-mono">
          <span>CDI {cdi.toFixed(2).replace('.', ',')}%</span>
          <span className="text-white/20">·</span>
          <span>IPCA {ipca.toFixed(2).replace('.', ',')}%</span>
        </div>
      </div>

      {!enough ? (
        <div className="py-6 text-center flex-1 flex items-center justify-center flex-col">
          <p className="text-[11px] text-white/40">Sem historico de patrimonio ainda.</p>
          <p className="text-[10px] text-white/25 italic mt-1">Snapshots gerados toda semana.</p>
        </div>
      ) : (
        <div className="space-y-2.5 flex-1 flex flex-col">
          <PerfRow label="Mes (30d)" carteira={m.retornoPctMes} cdi={m.cdiAcumPctMes} ipca={m.ipcaAcumPctMes} />
          <PerfRow label="Ano (YTD)" carteira={m.retornoPctAno} cdi={m.cdiAcumPctAno} ipca={m.ipcaAcumPctAno} />
          <PerfRow
            label="Total"
            carteira={m.retornoPctTotal}
            cdi={m.cdiAcumPctTotal}
            ipca={m.ipcaAcumPctTotal}
            hint={m.diasHistorico > 0 ? m.diasHistorico + 'd' : undefined}
          />

          {/* Mini chart: 3 linhas acumuladas */}
          {series.length >= 2 && (
            <div className="pt-2 mt-1 border-t border-white/[0.05]">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase tracking-wider text-white/40">Acumulado no periodo</span>
                <div className="flex items-center gap-2 text-[9px] font-mono">
                  <Legend color="#F97316" label="Carteira" />
                  <Legend color="#22C55E" label="CDI" />
                  <Legend color="#EF4444" label="IPCA" />
                </div>
              </div>
              <div className="h-[120px] -mx-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }} axisLine={false} tickLine={false} minTickGap={20} />
                    <YAxis
                      tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => v.toFixed(0) + '%'}
                      width={36}
                    />
                    <Tooltip content={<PerfTip />} cursor={{ stroke: 'rgba(255,255,255,0.15)', strokeWidth: 1, strokeDasharray: '3 3' }} />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="2 2" />
                    <Line type="monotone" dataKey="ipca" name="IPCA" stroke="#EF4444" strokeWidth={1.5} strokeDasharray="3 3" dot={false} />
                    <Line type="monotone" dataKey="cdi" name="CDI" stroke="#22C55E" strokeWidth={1.5} dot={false} />
                    <Line type="monotone" dataKey="carteira" name="Carteira" stroke="#F97316" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#F97316', stroke: '#0e1118', strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <p className="text-[9px] text-white/30 italic leading-snug pt-1 mt-auto">
            Inclui efeito de aportes — nao e' retorno puro. Comparacao IPCA mostra preservacao do poder de compra.
          </p>
        </div>
      )}
    </div>
  );
}

function PerfRow({ label, carteira, cdi, ipca, hint }: { label: string; carteira: number | null; cdi: number | null; ipca: number | null; hint?: string }) {
  const cartColor = carteira == null ? 'text-white/30' : carteira >= 0 ? 'text-emerald-300' : 'text-rose-300';
  const cdiColor = cdi == null ? 'text-white/30' : 'text-emerald-300/65';
  const ipcaColor = ipca == null ? 'text-white/30' : 'text-rose-300/65';
  const beatCdi = carteira != null && cdi != null && carteira > cdi;
  const beatIpca = carteira != null && ipca != null && carteira > ipca;
  return (
    <div className="px-2 py-2 rounded-md bg-white/[0.02]">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-wider text-white/45">
          {label}{hint && <span className="text-white/25 ml-1">· {hint}</span>}
        </span>
        <div className="flex gap-1">
          {beatCdi && <span className="text-[8px] uppercase tracking-wider px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-bold">&gt; CDI</span>}
          {beatIpca && <span className="text-[8px] uppercase tracking-wider px-1 py-0.5 rounded bg-blue-500/15 text-blue-300 font-bold">real +</span>}
          {!beatIpca && carteira != null && ipca != null && (
            <span className="text-[8px] uppercase tracking-wider px-1 py-0.5 rounded bg-rose-500/15 text-rose-300 font-bold" title="Carteira nao bateu inflacao — perdeu poder de compra">real −</span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <div>
          <p className="text-[8px] uppercase tracking-wider text-white/35">Carteira</p>
          <p className={'text-[12px] font-mono font-bold ' + cartColor}>
            {carteira == null ? '—' : (carteira >= 0 ? '+' : '') + carteira.toFixed(2).replace('.', ',') + '%'}
          </p>
        </div>
        <div>
          <p className="text-[8px] uppercase tracking-wider text-white/35">CDI</p>
          <p className={'text-[12px] font-mono ' + cdiColor}>
            {cdi == null ? '—' : '+' + cdi.toFixed(2).replace('.', ',') + '%'}
          </p>
        </div>
        <div>
          <p className="text-[8px] uppercase tracking-wider text-white/35">IPCA</p>
          <p className={'text-[12px] font-mono ' + ipcaColor}>
            {ipca == null ? '—' : '+' + ipca.toFixed(2).replace('.', ',') + '%'}
          </p>
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-2 h-0.5 rounded-full" style={{ background: color }} />
      <span className="text-white/55">{label}</span>
    </span>
  );
}

function PerfTip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string; color: string; name: string }>; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-[#0e1118] border border-white/[0.08] rounded-lg px-3 py-2 shadow-2xl">
      <p className="text-[10px] text-white/40 font-mono mb-1.5">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-[11px]">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-white/60">{p.name}</span>
          <span className={'font-mono font-semibold ml-auto ' + (p.value >= 0 ? 'text-white' : 'text-rose-300')}>
            {p.value >= 0 ? '+' : ''}{p.value.toFixed(2).replace('.', ',')}%
          </span>
        </div>
      ))}
    </div>
  );
}
