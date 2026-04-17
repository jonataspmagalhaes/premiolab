'use client';

// Card "Renda de Opcoes · 12m" no Resumo da Renda.
// Mostra total liquido, media mensal, melhor mes + mini-spark das barras 12m.
// Botao "Detalhar" troca a sub-tab para 'opcoes'.

import { useMemo } from 'react';
import { useAppStore } from '@/store';
import { computeOpcoesMensal, resumoOpcoes12m } from '@/lib/opcoesUtils';
import { fmtBRL, fmtK } from '@/lib/fmt';
import { ResponsiveContainer, BarChart, Bar, YAxis, Tooltip } from 'recharts';
import { ArrowRight } from 'lucide-react';

interface Props {
  onDetalhar?: () => void;
}

export function OpcoesResumoCard(props: Props) {
  var opcoes = useAppStore(function (s) { return s.opcoes; });

  var mensal = useMemo(function () { return computeOpcoesMensal(opcoes, 12); }, [opcoes]);
  var resumo = useMemo(function () { return resumoOpcoes12m(opcoes); }, [opcoes]);

  var corTotal = resumo.total12m >= 0 ? 'text-income' : 'text-red-400';
  var sinalTotal = resumo.total12m >= 0 ? '' : '-';
  var abs = Math.abs(resumo.total12m);

  return (
    <div className="col-span-12 lg:col-span-6 linear-card rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-white/40 font-mono">Renda de opcoes · 12m</p>
          <p className={'text-2xl font-bold mt-1 font-mono ' + corTotal}>
            {sinalTotal}R$ {fmtBRL(abs)}
          </p>
          <p className="text-[11px] text-white/50 mt-0.5">
            Media mensal: <span className={'font-mono ' + corTotal}>R$ {fmtBRL(Math.abs(resumo.mediaMensal))}</span>
          </p>
        </div>
        {props.onDetalhar ? (
          <button
            type="button"
            onClick={props.onDetalhar}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[11px] text-white/70 transition"
          >
            Detalhar
            <ArrowRight className="w-3 h-3" />
          </button>
        ) : null}
      </div>

      {/* Mini sparkline */}
      <div style={{ width: '100%', height: 70 }}>
        <ResponsiveContainer>
          <BarChart data={mensal} margin={{ top: 4, right: 0, left: -24, bottom: 0 }}>
            <YAxis hide domain={['auto', 'auto']} />
            <Tooltip
              cursor={{ fill: 'rgba(108,92,231,0.08)' }}
              contentStyle={{ background: '#0a0d14', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 11 }}
              formatter={function (v: unknown) { return ['R$ ' + fmtBRL(Number(v) || 0), 'Liquido']; }}
              labelStyle={{ color: 'rgba(255,255,255,0.5)' }}
            />
            <Bar
              dataKey="liquido"
              radius={[2, 2, 0, 0]}
              maxBarSize={18}
              shape={function (p: unknown) {
                var anyP = p as { x?: number; y?: number; width?: number; height?: number; payload?: { liquido?: number } };
                var liquido = anyP.payload?.liquido ?? 0;
                var color = liquido >= 0 ? '#6C5CE7' : '#EF4444';
                var x = anyP.x ?? 0;
                var y = anyP.y ?? 0;
                var w = anyP.width ?? 0;
                var h = anyP.height ?? 0;
                return <rect x={x} y={y} width={w} height={h} fill={color} rx={2} ry={2} />;
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* KPIs secundarios */}
      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/[0.06]">
        <div>
          <p className="text-[9px] uppercase tracking-wider text-white/40 font-mono">Melhor mes</p>
          <p className="text-[12px] font-mono font-semibold text-income mt-0.5">
            {resumo.melhorMes ? 'R$ ' + fmtK(resumo.melhorMes.valor) : '—'}
          </p>
          <p className="text-[9px] text-white/40">{resumo.melhorMes?.label || ''}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider text-white/40 font-mono">Realizadas</p>
          <p className="text-[12px] font-mono font-semibold mt-0.5">{resumo.operacoes12m}</p>
          <p className="text-[9px] text-white/40">12m</p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider text-white/40 font-mono">Em aberto</p>
          <p className="text-[12px] font-mono font-semibold text-orange-300 mt-0.5">{resumo.operacoesAbertas}</p>
          <p className="text-[9px] text-white/40">hoje</p>
        </div>
      </div>
    </div>
  );
}
