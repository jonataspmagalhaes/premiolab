'use client';

// /app/ir/cripto — isencao R$35k/mes em vendas totais + 15% swing/22,5%
// daytrade. Tabela mensal com IsencaoIndicator por mes + CaixaContador.

import { useMemo } from 'react';
import { useIRYear } from '../_yearContext';
import { useAppStore } from '@/store';
import { useOperacoesRaw, useUser } from '@/lib/queries';
import { computeIROperacoes } from '@/lib/ir/operacoes';
import { IsencaoIndicator } from '@/components/ir/IsencaoIndicator';
import { IRMonthTable, IRMoneyCell, type IRMonthCol } from '@/components/ir/IRMonthTable';
import { CaixaContador } from '@/components/ir/CaixaContador';
import { LIMITES_ISENCAO, ALIQUOTAS } from '@/lib/ir/constants';
import { fmtBRL } from '@/lib/fmt';
import type { OperacaoRaw } from '@/lib/ir/types';

interface RowData {
  mes: string;
  vendas: number;
  ganho: number;
  isento: boolean;
  ir: number;
  [key: string]: unknown;
}

export default function CriptoIRPage() {
  var yCtx = useIRYear();
  var ano = yCtx.year;
  var user = useUser();
  var opsQuery = useOperacoesRaw(user.data?.id);

  // Ops filtradas so cripto
  var ops = useMemo<OperacaoRaw[]>(function () {
    var all = (opsQuery.data || []) as unknown as OperacaoRaw[];
    return all.filter(function (o) { return (o.categoria || '').toLowerCase() === 'cripto'; });
  }, [opsQuery.data]);

  // Tratamos todas cripto como "cripto_swing" pra efeito do computeIROperacoes
  // (identificacao daytrade por data_compra/venda precisaria logica propria;
  // assumimos swing aqui).
  // Hack: reassignamos a categoria pra 'cripto_swing' efetivo e reaproveitamos computeIROperacoes.
  // Como computeIROperacoes espera uma string de categoria, passamos uma ops clonadas.
  var opsCripto = useMemo<OperacaoRaw[]>(function () {
    return ops.map(function (o) {
      var clone: OperacaoRaw = Object.assign({}, o);
      clone.categoria = 'cripto_swing';
      return clone;
    });
  }, [ops]);

  var monthResults = useMemo(function () { return computeIROperacoes(opsCripto, ano); }, [opsCripto, ano]);

  var rows = useMemo<RowData[]>(function () {
    return monthResults.map(function (mr) {
      var vendas = mr.vendas.cripto_swing || 0;
      var ganho = mr.ganhos.cripto_swing || 0;
      var isento = vendas > 0 && vendas <= LIMITES_ISENCAO.cripto_vendas_mes;
      var ir = 0;
      if (!isento && ganho > 0) ir = ganho * ALIQUOTAS.cripto_swing;
      return { mes: mr.mes, vendas: vendas, ganho: ganho, isento: isento, ir: ir };
    });
  }, [monthResults]);

  var totais = useMemo(function () {
    var t = { vendas: 0, ganho: 0, ir: 0, mesesComIsencao: 0, mesesExcedidos: 0 };
    rows.forEach(function (r) {
      t.vendas += r.vendas;
      t.ganho += r.ganho;
      t.ir += r.ir;
      if (r.vendas > 0 && r.isento) t.mesesComIsencao += 1;
      if (r.vendas > LIMITES_ISENCAO.cripto_vendas_mes) t.mesesExcedidos += 1;
    });
    return t;
  }, [rows]);

  var cols: IRMonthCol<RowData>[] = [
    {
      key: 'vendas',
      label: 'Vendas',
      align: 'right',
      render: function (r) { return r.vendas === 0 ? <span className="font-mono text-white/30">—</span> : <span className="font-mono text-white/70">R$ {fmtBRL(r.vendas)}</span>; },
    },
    {
      key: 'isencao',
      label: '35k',
      render: function (r) {
        if (r.vendas === 0) return <span className="text-white/30 text-[10px]">—</span>;
        return <IsencaoIndicator atual={r.vendas} limite={LIMITES_ISENCAO.cripto_vendas_mes} compact />;
      },
    },
    {
      key: 'ganho',
      label: 'Ganho',
      align: 'right',
      render: function (r) { return <IRMoneyCell value={r.ganho} />; },
    },
    {
      key: 'ir',
      label: 'IR devido',
      align: 'right',
      render: function (r) {
        if (r.ir === 0) return <span className="font-mono text-white/30">—</span>;
        return <span className="font-mono text-red-300 font-semibold">R$ {fmtBRL(r.ir)}</span>;
      },
      footer: function () { return <span className="font-mono text-red-300 font-bold">R$ {fmtBRL(totais.ir)}</span>; },
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Criptoativos — {ano}</h1>
        <p className="text-xs text-white/40 mt-1">
          Isencao de R$ 35.000 em VENDAS por mes. DARF codigo 4600 acima do limite.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Vendas totais" value={totais.vendas} accent="text-white" />
        <Kpi label="Ganho liquido" value={totais.ganho} accent={totais.ganho >= 0 ? 'text-income' : 'text-red-400'} />
        <Kpi label="Meses com isencao" valueRaw={totais.mesesComIsencao} accent="text-emerald-300" />
        <Kpi label="IR devido no ano" value={totais.ir} accent="text-red-300" sub={totais.mesesExcedidos > 0 ? totais.mesesExcedidos + ' mes(es) > 35k' : undefined} />
      </div>

      <div className="linear-card rounded-xl p-5">
        <p className="text-xs uppercase tracking-wider text-white/40 font-mono mb-3">Mensal — vendas vs isencao</p>
        <IRMonthTable rows={rows} cols={cols} emptyMessage={'Sem operacoes de cripto em ' + ano + '.'} />
        <p className="text-[10px] text-white/40 italic mt-3">
          Troca cripto-para-cripto (BTC→ETH) tambem conta como venda para fins de IR.
          DIMP obrigatorio acima de R$ 30k/mes mesmo se isento.
        </p>
      </div>

      <CaixaContador secao="cripto_swing" defaultOpen={false} />
    </div>
  );
}

function Kpi(props: { label: string; value?: number; valueRaw?: number; accent: string; sub?: string }) {
  var display: string;
  if (props.valueRaw != null) {
    display = String(props.valueRaw);
  } else {
    display = 'R$ ' + fmtBRL(props.value || 0);
  }
  return (
    <div className="linear-card rounded-xl p-4">
      <p className="text-[10px] uppercase tracking-wider text-white/40 font-mono">{props.label}</p>
      <p className={'text-lg font-bold font-mono mt-1 ' + props.accent}>{display}</p>
      {props.sub ? <p className="text-[10px] text-white/30 mt-0.5">{props.sub}</p> : null}
    </div>
  );
}
