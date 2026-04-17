// Calculo IR para operacoes com opcoes.
// Separa swing trade (15%) de daytrade (20%) pela data_abertura vs
// data_fechamento (mesmo dia = day).

import type { Opcao } from '@/store';
import type { CategoriaIR, OpcoesMonthIR } from './types';
import { ALIQUOTAS } from './constants';

export interface OpcaoIR {
  ticker_opcao: string;
  ativo_base: string;
  tipo: string;
  direcao: string;
  qty: number;
  data_abertura: string;
  data_fechamento: string;
  resultado: number;
  modalidade: 'swing' | 'daytrade';
  status: string;
}

function isRealizada(s: string | undefined): boolean {
  var x = (s || '').toLowerCase();
  return x === 'exercida' || x === 'expirada' || x === 'fechada' || x === 'expirou_po';
}

function isVenda(d: string | undefined): boolean {
  var x = (d || 'venda').toLowerCase();
  return x === 'venda' || x === 'lancamento';
}

export function resultadoOperacaoIR(o: Opcao): number {
  if (!isRealizada(o.status)) return 0;
  var qty = o.qty || 0;
  var pa = (o.premio || 0) * qty;
  var pf = (o.premio_fechamento || 0) * qty;
  return isVenda(o.direcao) ? pa - pf : pf - pa;
}

export function modalidadeOperacao(o: Opcao): 'swing' | 'daytrade' {
  if (o.data_abertura && o.data_fechamento) {
    // Daytrade se mesma data (formato YYYY-MM-DD)
    var a = o.data_abertura.substring(0, 10);
    var f = o.data_fechamento.substring(0, 10);
    if (a === f) return 'daytrade';
  }
  return 'swing';
}

// Extrai operacoes realizadas no ano com resultado + modalidade
export function extrairOpcoesIR(opcoes: Opcao[], year: number): OpcaoIR[] {
  var out: OpcaoIR[] = [];
  opcoes.forEach(function (o) {
    if (!isRealizada(o.status)) return;
    var dataRef = o.data_fechamento || o.vencimento || o.data_abertura;
    if (!dataRef) return;
    var y = new Date(dataRef).getFullYear();
    if (y !== year) return;
    var res = resultadoOperacaoIR(o);
    out.push({
      ticker_opcao: o.ticker_opcao,
      ativo_base: o.ativo_base,
      tipo: o.tipo,
      direcao: o.direcao,
      qty: o.qty,
      data_abertura: o.data_abertura || '',
      data_fechamento: o.data_fechamento || dataRef || '',
      resultado: res,
      modalidade: modalidadeOperacao(o),
      status: o.status,
    });
  });
  return out.sort(function (a, b) { return (b.data_fechamento || '').localeCompare(a.data_fechamento || ''); });
}

// Agrega resultados por mes separando swing e daytrade
export function agregarOpcoesMensal(opIRs: OpcaoIR[], year: number): OpcoesMonthIR[] {
  var mesesMap: Record<string, OpcoesMonthIR> = {};
  for (var m = 1; m <= 12; m++) {
    var k = year + '-' + String(m).padStart(2, '0');
    mesesMap[k] = { mes: k, swingGanho: 0, swingPerda: 0, daytradeGanho: 0, daytradePerda: 0 };
  }

  opIRs.forEach(function (o) {
    if (!o.data_fechamento) return;
    var mKey = o.data_fechamento.substring(0, 7) + '-01';
    // mesesMap usa formato YYYY-MM nao YYYY-MM-01; corrige
    var mesKey = o.data_fechamento.substring(0, 7);
    var mes = mesesMap[mesKey];
    if (!mes) return;
    if (o.modalidade === 'swing') {
      if (o.resultado >= 0) mes.swingGanho += o.resultado;
      else mes.swingPerda += Math.abs(o.resultado);
    } else {
      if (o.resultado >= 0) mes.daytradeGanho += o.resultado;
      else mes.daytradePerda += Math.abs(o.resultado);
    }
    // supresso de warning mKey unused
    void mKey;
  });

  return Object.keys(mesesMap).sort().map(function (k) { return mesesMap[k]; });
}

export interface OpcoesTotaisAno {
  swing: { ganho: number; perda: number; liquido: number; ir: number };
  daytrade: { ganho: number; perda: number; liquido: number; ir: number };
  operacoesSwing: number;
  operacoesDay: number;
}

// Calcula totais anuais com aliquotas aplicadas
export function totaisOpcoesAno(opIRs: OpcaoIR[]): OpcoesTotaisAno {
  var swingGanho = 0;
  var swingPerda = 0;
  var dayGanho = 0;
  var dayPerda = 0;
  var opsSwing = 0;
  var opsDay = 0;
  opIRs.forEach(function (o) {
    if (o.modalidade === 'swing') {
      opsSwing += 1;
      if (o.resultado >= 0) swingGanho += o.resultado;
      else swingPerda += Math.abs(o.resultado);
    } else {
      opsDay += 1;
      if (o.resultado >= 0) dayGanho += o.resultado;
      else dayPerda += Math.abs(o.resultado);
    }
  });

  var swingLiq = swingGanho - swingPerda;
  var dayLiq = dayGanho - dayPerda;

  return {
    swing: {
      ganho: swingGanho,
      perda: swingPerda,
      liquido: swingLiq,
      ir: swingLiq > 0 ? swingLiq * ALIQUOTAS.opcoes_swing : 0,
    },
    daytrade: {
      ganho: dayGanho,
      perda: dayPerda,
      liquido: dayLiq,
      ir: dayLiq > 0 ? dayLiq * ALIQUOTAS.opcoes_day : 0,
    },
    operacoesSwing: opsSwing,
    operacoesDay: opsDay,
  };
}

// Silos de compensacao sao SEPARADOS entre swing e daytrade
export var OPCOES_SILO_CATEGORIA: Record<'swing' | 'daytrade', CategoriaIR> = {
  swing: 'opcoes_swing',
  daytrade: 'opcoes_day',
};
