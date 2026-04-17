'use client';

// /app/ir/renda-fixa — aplicacoes ativas classificadas entre isentas
// (LCI/LCA/debenture incentivada/poupanca) e tributadas (CDB/LC/RDB/
// Tesouro/debenture comum/CRI/CRA com tabela regressiva).

import { useMemo } from 'react';
import { useIRYear } from '../_yearContext';
import { useAppStore } from '@/store';
import { classifyAllRF } from '@/lib/ir/rendaFixa';
import { CaixaContador } from '@/components/ir/CaixaContador';
import { fmtBRL } from '@/lib/fmt';

export default function RendaFixaIRPage() {
  var yCtx = useIRYear();
  var ano = yCtx.year;
  var rf = useAppStore(function (s) { return s.rf; });

  var classes = useMemo(function () { return classifyAllRF(rf); }, [rf]);

  var totais = useMemo(function () {
    var t = { aplicadoIsento: 0, atualIsento: 0, aplicadoTrib: 0, atualTrib: 0, irProjetado: 0 };
    classes.isentas.forEach(function (x) { t.aplicadoIsento += x.valorAplicado; t.atualIsento += x.valorAtual; });
    classes.tributadas.forEach(function (x) { t.aplicadoTrib += x.valorAplicado; t.atualTrib += x.valorAtual; t.irProjetado += x.irProjetado; });
    return t;
  }, [classes]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Renda Fixa — {ano}</h1>
        <p className="text-xs text-white/40 mt-1">
          Tabela regressiva para tributadas; LCI/LCA/debenture incentivada/poupanca isentas.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Isentas — aplicado" value={totais.aplicadoIsento} accent="text-emerald-300" sub={classes.isentas.length + ' titulos'} />
        <Kpi label="Isentas — valor atual" value={totais.atualIsento} accent="text-income" />
        <Kpi label="Tributadas — aplicado" value={totais.aplicadoTrib} accent="text-amber-300" sub={classes.tributadas.length + ' titulos'} />
        <Kpi label="IR projetado (resgate total)" value={totais.irProjetado} accent="text-red-300" sub="se resgatar hoje" />
      </div>

      {/* Isentas */}
      <div className="linear-card rounded-xl p-5 border border-emerald-500/15">
        <p className="text-[11px] uppercase tracking-wider text-emerald-300 font-semibold mb-3">Isentas — Ficha 09 (Rendimentos Isentos)</p>
        {classes.isentas.length === 0 ? (
          <p className="text-[12px] text-white/30 italic">Nenhuma aplicacao isenta ativa.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-white/40 border-b border-white/[0.06]">
                  <th className="py-2 pr-3 uppercase tracking-wider text-[9px]">Emissor</th>
                  <th className="py-2 pr-3 uppercase tracking-wider text-[9px]">Tipo</th>
                  <th className="py-2 pr-3 uppercase tracking-wider text-[9px] text-right">Aplicado</th>
                  <th className="py-2 pr-3 uppercase tracking-wider text-[9px] text-right">Valor atual</th>
                  <th className="py-2 uppercase tracking-wider text-[9px]">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {classes.isentas.map(function (it, i) {
                  return (
                    <tr key={i} className="border-b border-white/[0.03]">
                      <td className="py-1.5 pr-3 font-semibold">{it.emissor}</td>
                      <td className="py-1.5 pr-3 text-[10px] text-white/60 uppercase">{it.tipo}</td>
                      <td className="py-1.5 pr-3 font-mono text-right text-white/70">R$ {fmtBRL(it.valorAplicado)}</td>
                      <td className="py-1.5 pr-3 font-mono text-right text-income">R$ {fmtBRL(it.valorAtual)}</td>
                      <td className="py-1.5 text-[10px] text-emerald-300">{it.motivo}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tributadas */}
      <div className="linear-card rounded-xl p-5 border border-amber-500/15">
        <p className="text-[11px] uppercase tracking-wider text-amber-300 font-semibold mb-3">Tributadas — Ficha 10 (Tributacao Exclusiva)</p>
        {classes.tributadas.length === 0 ? (
          <p className="text-[12px] text-white/30 italic">Nenhuma aplicacao tributada ativa.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-white/40 border-b border-white/[0.06]">
                  <th className="py-2 pr-3 uppercase tracking-wider text-[9px]">Emissor</th>
                  <th className="py-2 pr-3 uppercase tracking-wider text-[9px]">Tipo</th>
                  <th className="py-2 pr-3 uppercase tracking-wider text-[9px] text-right">Dias corridos</th>
                  <th className="py-2 pr-3 uppercase tracking-wider text-[9px] text-right">Aliquota</th>
                  <th className="py-2 pr-3 uppercase tracking-wider text-[9px] text-right">Aplicado</th>
                  <th className="py-2 pr-3 uppercase tracking-wider text-[9px] text-right">Valor atual</th>
                  <th className="py-2 uppercase tracking-wider text-[9px] text-right">IR projetado</th>
                </tr>
              </thead>
              <tbody>
                {classes.tributadas.map(function (it, i) {
                  return (
                    <tr key={i} className="border-b border-white/[0.03]">
                      <td className="py-1.5 pr-3 font-semibold">{it.emissor}</td>
                      <td className="py-1.5 pr-3 text-[10px] text-white/60 uppercase">{it.tipo}</td>
                      <td className="py-1.5 pr-3 font-mono text-right text-white/60">{it.diasCorridos}</td>
                      <td className="py-1.5 pr-3 font-mono text-right text-amber-300">{(it.aliquotaProjetada * 100).toFixed(1)}%</td>
                      <td className="py-1.5 pr-3 font-mono text-right text-white/70">R$ {fmtBRL(it.valorAplicado)}</td>
                      <td className="py-1.5 pr-3 font-mono text-right text-income">R$ {fmtBRL(it.valorAtual)}</td>
                      <td className="py-1.5 font-mono text-right text-red-300">R$ {fmtBRL(it.irProjetado)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-[10px] text-white/40 italic mt-3">
              IR projetado assume resgate imediato com tabela regressiva. IR e retido na fonte no
              resgate real — voce nao precisa emitir DARF.
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <CaixaContador secao="rf_tributada" defaultOpen={false} />
        <CaixaContador secao="rf_isenta" defaultOpen={false} />
      </div>
    </div>
  );
}

function Kpi(props: { label: string; value: number; accent: string; sub?: string }) {
  return (
    <div className="linear-card rounded-xl p-4">
      <p className="text-[10px] uppercase tracking-wider text-white/40 font-mono">{props.label}</p>
      <p className={'text-lg font-bold font-mono mt-1 ' + props.accent}>R$ {fmtBRL(props.value || 0)}</p>
      {props.sub ? <p className="text-[10px] text-white/30 mt-0.5">{props.sub}</p> : null}
    </div>
  );
}
