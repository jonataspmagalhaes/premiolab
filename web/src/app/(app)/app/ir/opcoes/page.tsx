'use client';

// /app/ir/opcoes — separa swing (15%) de daytrade (20%) em colunas
// paralelas. IR anual + tabela de operacoes + CaixaContador.

import { useMemo } from 'react';
import { useIRYear } from '../_yearContext';
import { useAppStore } from '@/store';
import {
  extrairOpcoesIR, agregarOpcoesMensal, totaisOpcoesAno, type OpcaoIR,
} from '@/lib/ir/opcoes';
import { IRMonthTable, IRMoneyCell, type IRMonthCol } from '@/components/ir/IRMonthTable';
import { CaixaContador } from '@/components/ir/CaixaContador';
import { fmtBRL } from '@/lib/fmt';
import type { OpcoesMonthIR } from '@/lib/ir/types';

interface RowData {
  mes: string;
  swingGanho: number;
  swingPerda: number;
  daytradeGanho: number;
  daytradePerda: number;
  swingLiq: number;
  dayLiq: number;
  [key: string]: unknown;
}

export default function OpcoesIRPage() {
  var yCtx = useIRYear();
  var ano = yCtx.year;
  var opcoes = useAppStore(function (s) { return s.opcoes; });

  var opIRs = useMemo<OpcaoIR[]>(function () { return extrairOpcoesIR(opcoes, ano); }, [opcoes, ano]);
  var mensal = useMemo<OpcoesMonthIR[]>(function () { return agregarOpcoesMensal(opIRs, ano); }, [opIRs, ano]);
  var totais = useMemo(function () { return totaisOpcoesAno(opIRs); }, [opIRs]);

  var rows = useMemo<RowData[]>(function () {
    return mensal.map(function (m) {
      return {
        mes: m.mes,
        swingGanho: m.swingGanho,
        swingPerda: m.swingPerda,
        daytradeGanho: m.daytradeGanho,
        daytradePerda: m.daytradePerda,
        swingLiq: m.swingGanho - m.swingPerda,
        dayLiq: m.daytradeGanho - m.daytradePerda,
      };
    });
  }, [mensal]);

  var cols: IRMonthCol<RowData>[] = [
    {
      key: 'swingLiq',
      label: 'Swing (15%)',
      align: 'right',
      render: function (r) { return <IRMoneyCell value={r.swingLiq} />; },
      footer: function () { return <IRMoneyCell value={totais.swing.liquido} />; },
    },
    {
      key: 'dayLiq',
      label: 'Daytrade (20%)',
      align: 'right',
      render: function (r) { return <IRMoneyCell value={r.dayLiq} />; },
      footer: function () { return <IRMoneyCell value={totais.daytrade.liquido} />; },
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Opcoes — {ano}</h1>
          <p className="text-xs text-white/40 mt-1">
            Swing 15% e daytrade 20% em silos separados. Exercicio NAO conta como daytrade.
          </p>
        </div>
      </div>

      {/* 2 colunas: swing / daytrade */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="linear-card rounded-xl p-5 border border-orange-500/15">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-orange-300 font-semibold">Swing Trade</p>
              <p className="text-[10px] text-white/40 mt-0.5">Aliquota 15%</p>
            </div>
            <span className="text-[10px] text-white/40 font-mono">{totais.operacoesSwing} op</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MiniKpi label="Ganho" value={totais.swing.ganho} color="text-emerald-300" />
            <MiniKpi label="Perda" value={-totais.swing.perda} color="text-red-300" />
            <MiniKpi label="Liquido" value={totais.swing.liquido} color={totais.swing.liquido >= 0 ? 'text-income' : 'text-red-400'} />
            <MiniKpi label="IR devido" value={totais.swing.ir} color="text-red-400" />
          </div>
        </div>

        <div className="linear-card rounded-xl p-5 border border-purple-500/15">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-purple-300 font-semibold">Daytrade</p>
              <p className="text-[10px] text-white/40 mt-0.5">Aliquota 20%</p>
            </div>
            <span className="text-[10px] text-white/40 font-mono">{totais.operacoesDay} op</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MiniKpi label="Ganho" value={totais.daytrade.ganho} color="text-emerald-300" />
            <MiniKpi label="Perda" value={-totais.daytrade.perda} color="text-red-300" />
            <MiniKpi label="Liquido" value={totais.daytrade.liquido} color={totais.daytrade.liquido >= 0 ? 'text-income' : 'text-red-400'} />
            <MiniKpi label="IR devido" value={totais.daytrade.ir} color="text-red-400" />
          </div>
        </div>
      </div>

      {/* Tabela mensal combinada */}
      <div className="linear-card rounded-xl p-5">
        <p className="text-xs uppercase tracking-wider text-white/40 font-mono mb-3">Resultado mensal ({ano})</p>
        <IRMonthTable rows={rows} cols={cols} emptyMessage={'Sem operacoes de opcoes em ' + ano + '.'} />
      </div>

      {/* Lista de operacoes */}
      <div className="linear-card rounded-xl p-5">
        <p className="text-xs uppercase tracking-wider text-white/40 font-mono mb-3">Operacoes realizadas ({opIRs.length})</p>
        {opIRs.length === 0 ? (
          <p className="text-[12px] text-white/30 italic py-4">Nenhuma operacao realizada em {ano}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-white/40 border-b border-white/[0.06]">
                  <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px]">Fechamento</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px]">Subjacente</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px]">Serie</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px]">Direcao</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px]">Modalidade</th>
                  <th className="py-2 pr-3 font-medium uppercase tracking-wider text-[9px]">Status</th>
                  <th className="py-2 font-medium uppercase tracking-wider text-[9px] text-right">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {opIRs.slice(0, 500).map(function (o, i) {
                  return (
                    <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition">
                      <td className="py-1.5 pr-3 font-mono text-white/60">{(o.data_fechamento || '').substring(0, 10)}</td>
                      <td className="py-1.5 pr-3 font-semibold">{o.ativo_base}</td>
                      <td className="py-1.5 pr-3 font-mono text-[10px] text-white/60">{o.ticker_opcao}</td>
                      <td className="py-1.5 pr-3 text-white/70 capitalize">{o.direcao}</td>
                      <td className="py-1.5 pr-3">
                        <span className={
                          'text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ' +
                          (o.modalidade === 'swing' ? 'bg-orange-500/15 text-orange-300 border border-orange-500/25' : 'bg-purple-500/15 text-purple-300 border border-purple-500/25')
                        }>
                          {o.modalidade}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 text-[10px] text-white/60 capitalize">{o.status}</td>
                      <td className="py-1.5 text-right"><IRMoneyCell value={o.resultado} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CaixaContador secao="opcoes_swing" defaultOpen={false} />
    </div>
  );
}

function MiniKpi(props: { label: string; value: number; color: string }) {
  var v = props.value;
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wider text-white/40 font-mono">{props.label}</p>
      <p className={'text-[14px] font-bold font-mono mt-0.5 ' + props.color}>
        {v === 0 ? 'R$ 0,00' : (v > 0 ? 'R$ ' : '-R$ ') + fmtBRL(Math.abs(v))}
      </p>
    </div>
  );
}
