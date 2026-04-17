'use client';

// Donut "Renda por Fonte" — 12m liquido quebrado em FII / Acao / ETF /
// Stocks INT / Opcoes / RF. Alimentado por store.renda.porFonte.
// Click em uma fatia filtra a aba Proventos por essa categoria (futuro).

import { useMemo } from 'react';
import { useAppStore } from '@/store';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { fmtBRL } from '@/lib/fmt';

interface Fonte {
  key: string;
  label: string;
  valor: number;
  color: string;
}

// Cores alinhadas ao tema do app (produtos)
var PALETTE: Record<string, { label: string; color: string }> = {
  acao:      { label: 'Acoes',      color: '#3B82F6' },  // azul
  fii:       { label: 'FIIs',       color: '#10B981' },  // verde
  etf:       { label: 'ETFs',       color: '#F59E0B' },  // ambar
  stock_int: { label: 'Stocks INT', color: '#E879F9' },  // roxo-rosa
  opcao:     { label: 'Opcoes',     color: '#8B5CF6' },  // roxo
  rf:        { label: 'Renda Fixa', color: '#06B6D4' },  // ciano
};

export function PorFonteDonut() {
  var porFonte = useAppStore(function (s) { return s.renda.porFonte; });
  var rendaOpcoes = useAppStore(function (s) { return s.renda.rendaOpcoes12m; });

  var data: Fonte[] = useMemo(function () {
    var base: Array<[string, number]> = [
      ['fii', porFonte.fii],
      ['acao', porFonte.acao],
      ['etf', porFonte.etf],
      ['stock_int', porFonte.stock_int],
      ['opcao', rendaOpcoes > 0 ? rendaOpcoes : 0],   // so positivo no donut
      ['rf', porFonte.rf],
    ];
    return base
      .filter(function (e) { return e[1] > 0; })
      .sort(function (a, b) { return b[1] - a[1]; })
      .map(function (e) {
        var meta = PALETTE[e[0]] || { label: e[0], color: '#64748B' };
        return { key: e[0], label: meta.label, valor: e[1], color: meta.color };
      });
  }, [porFonte, rendaOpcoes]);

  var total = useMemo(function () {
    return data.reduce(function (a, d) { return a + d.valor; }, 0);
  }, [data]);

  if (total === 0 || data.length === 0) {
    return (
      <div className="col-span-12 lg:col-span-6 linear-card rounded-xl p-5">
        <p className="text-xs uppercase tracking-wider text-white/40 font-mono mb-3">Renda por fonte · 12m</p>
        <div className="flex items-center justify-center h-[180px]">
          <p className="text-[12px] text-white/30 italic">Sem dados suficientes nos ultimos 12 meses.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="col-span-12 lg:col-span-6 linear-card rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs uppercase tracking-wider text-white/40 font-mono">Renda por fonte · 12m</p>
        <p className="text-[11px] text-white/50 font-mono">Total: <span className="text-income font-semibold">R$ {fmtBRL(total)}</span></p>
      </div>
      <div className="flex items-center gap-4">
        <div style={{ width: 160, height: 160, position: 'relative' }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={data}
                dataKey="valor"
                nameKey="label"
                innerRadius={50}
                outerRadius={75}
                paddingAngle={2}
                strokeWidth={0}
              >
                {data.map(function (d, i) {
                  return <Cell key={i} fill={d.color} />;
                })}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#0a0d14', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 11 }}
                formatter={function (v: unknown) { return ['R$ ' + fmtBRL(Number(v) || 0), '']; }}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Centro do donut: maior fatia */}
          <div
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}
          >
            <div className="text-center">
              <p className="text-[9px] uppercase tracking-wider text-white/40">Maior</p>
              <p className="text-[13px] font-semibold" style={{ color: data[0].color }}>
                {((data[0].valor / total) * 100).toFixed(0)}%
              </p>
              <p className="text-[9px] text-white/50">{data[0].label}</p>
            </div>
          </div>
        </div>
        <div className="flex-1 space-y-1.5">
          {data.map(function (d) {
            var pct = (d.valor / total) * 100;
            return (
              <div key={d.key} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ background: d.color }} />
                  <span className="text-white/70 truncate">{d.label}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-white/90">R$ {fmtBRL(d.valor)}</span>
                  <span className="font-mono text-white/40 w-9 text-right">{pct.toFixed(0)}%</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
