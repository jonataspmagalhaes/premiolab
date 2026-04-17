'use client';

// /app/ir — Resumo Anual do IR.
// KPIs (devido, retido, pago, saldo) + grafico mensal + alertas + lista de
// DARFs + CaixaContador inicial (resumo sobre DARF).
//
// Ano-base e gerenciado pelo IRYearContext (layout pai).

import { useMemo } from 'react';
import { useIR } from '@/lib/ir/useIR';
import { CaixaContador } from '@/components/ir/CaixaContador';
import { fmtBRL } from '@/lib/fmt';
import { mesLabel } from '@/lib/ir/cambio';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { AlertTriangle, CheckCircle2, FileText } from 'lucide-react';
import Link from 'next/link';
import { useIRYear } from './_yearContext';

export default function IRResumoPage() {
  var yCtx = useIRYear();
  var ano = yCtx.year;
  var ir = useIR(ano);

  // Array mensal pra grafico (12 meses do ano, imposto devido por mes)
  var mensal = useMemo(function () {
    var nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    var arr: Array<{ label: string; mes: string; imposto: number }> = [];
    for (var m = 0; m < 12; m++) {
      var key = ano + '-' + String(m + 1).padStart(2, '0');
      arr.push({ label: nomes[m], mes: key, imposto: 0 });
    }
    if (ir.data) {
      ir.data.darfs.forEach(function (d) {
        var idx = arr.findIndex(function (x) { return x.mes === d.mes; });
        if (idx >= 0) arr[idx].imposto += d.valorTotal;
      });
    }
    return arr;
  }, [ir.data, ano]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Resumo Anual — {ano}</h1>
          <p className="text-xs text-white/40 mt-1">
            DARFs, rendimentos classificados e ficha de bens consolidados.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/app/ir/rendimentos"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-300 hover:bg-emerald-500/20 transition"
          >
            <FileText className="w-3.5 h-3.5" />
            Rendimentos detalhados
          </Link>
        </div>
      </div>

      {ir.isLoading ? (
        <div className="linear-card rounded-xl p-8 text-center">
          <p className="text-[13px] text-white/50">Calculando IR do ano {ano}...</p>
        </div>
      ) : null}

      {ir.data ? (
        <>
          {/* KPIs principais */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiIR
              label="IR devido"
              value={ir.data.totais.irDevido}
              accent="text-red-300"
              sub={ir.data.darfs.length + ' DARF' + (ir.data.darfs.length === 1 ? '' : 's')}
            />
            <KpiIR
              label="IR retido fonte"
              value={ir.data.totais.irRetido}
              accent="text-amber-300"
              sub="JCP + Dividendos EUA"
            />
            <KpiIR
              label="Rendimentos isentos"
              value={ir.data.totais.rendimentosIsentos}
              accent="text-income"
              sub="Dividendos BR + FII"
            />
            <KpiIR
              label="Rendimentos tributados"
              value={ir.data.totais.rendimentosTributados}
              accent="text-info"
              sub="JCP + EUA (bruto)"
            />
          </div>

          {/* Grafico mensal */}
          <div className="linear-card rounded-xl p-5">
            <p className="text-xs uppercase tracking-wider text-white/40 font-mono mb-3">IR devido por mes · {ano}</p>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={mensal} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }} axisLine={false} tickLine={false} tickFormatter={function (v) { return 'R$ ' + v; }} />
                  <Tooltip
                    cursor={{ fill: 'rgba(239,68,68,0.06)' }}
                    contentStyle={{ background: '#0a0d14', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
                    formatter={function (v: unknown) { return ['R$ ' + fmtBRL(Number(v) || 0), 'IR devido']; }}
                  />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                  <Bar dataKey="imposto" fill="#EF4444" fillOpacity={0.8} radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Alertas */}
          {ir.data.alertas.length > 0 ? (
            <div className="linear-card rounded-xl p-5 border border-amber-500/20 bg-amber-500/[0.03]">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <p className="text-[12px] font-semibold text-amber-300">
                  Atencao — {ir.data.alertas.length} alerta{ir.data.alertas.length === 1 ? '' : 's'}
                </p>
              </div>
              <ul className="space-y-1">
                {ir.data.alertas.slice(0, 10).map(function (a, i) {
                  return <li key={i} className="text-[11px] text-white/70 leading-relaxed">• {a}</li>;
                })}
              </ul>
              {ir.data.alertas.length > 10 ? (
                <p className="text-[10px] text-white/40 mt-2">+ {ir.data.alertas.length - 10} alertas</p>
              ) : null}
            </div>
          ) : (
            <div className="linear-card rounded-xl p-4 border border-emerald-500/20 bg-emerald-500/[0.03] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <p className="text-[12px] text-emerald-300">Sem alertas — tudo em ordem para o ano {ano}.</p>
            </div>
          )}

          {/* Lista de DARFs */}
          <div className="linear-card rounded-xl p-5">
            <p className="text-xs uppercase tracking-wider text-white/40 font-mono mb-3">
              DARFs do ano · {ir.data.darfs.length} emissoes
            </p>
            {ir.data.darfs.length === 0 ? (
              <p className="text-[12px] text-white/30 italic py-4">Nenhum imposto devido em {ano} (consideradas isencoes aplicadas).</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-left text-white/40 border-b border-white/[0.06]">
                      <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px]">Mes apuracao</th>
                      <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px]">Codigo</th>
                      <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px]">Vencimento</th>
                      <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px] text-right">Valor</th>
                      <th className="py-2 font-medium uppercase tracking-wider text-[9px]">Detalhe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ir.data.darfs.map(function (d, i) {
                      return (
                        <tr key={d.mes + '-' + d.codigo + '-' + i} className="border-b border-white/[0.03]">
                          <td className="py-2 pr-3 font-mono text-white/80">{mesLabel(d.mes)}</td>
                          <td className="py-2 pr-3 font-mono text-orange-300">{d.codigo}</td>
                          <td className="py-2 pr-3 font-mono text-white/60">{d.vencimento}</td>
                          <td className="py-2 pr-3 font-mono text-right font-semibold text-red-300">R$ {fmtBRL(d.valorTotal)}</td>
                          <td className="py-2 text-[10px] text-white/50">
                            {d.porCategoria
                              .filter(function (c) { return c.imposto > 0; })
                              .map(function (c) { return c.categoria + ' ' + 'R$' + c.imposto.toFixed(0); })
                              .join(', ')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* CaixaContador — educa sobre DARF */}
          <CaixaContador secao="darf" defaultOpen={ir.data.darfs.length > 0} />
        </>
      ) : null}
    </div>
  );
}

function KpiIR(props: { label: string; value: number; accent: string; sub?: string }) {
  return (
    <div className="linear-card rounded-xl p-4">
      <p className="text-[10px] uppercase tracking-wider text-white/40 font-mono">{props.label}</p>
      <p className={'text-xl font-bold font-mono mt-1 ' + props.accent}>R$ {fmtBRL(props.value || 0)}</p>
      {props.sub ? <p className="text-[10px] text-white/30 mt-0.5">{props.sub}</p> : null}
    </div>
  );
}
