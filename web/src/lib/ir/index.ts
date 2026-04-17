// Agregador principal: computeIRAnual recebe o input agregado do ano e
// retorna o IRAnualResult com darfs mensais, rendimentos classificados,
// prejuizos finais, totais e alertas.

import { computeIROperacoes } from './operacoes';
import { computeTaxByMonth } from './tax';
import { classifyProventoIR } from './rendimentos';
import type { IRInput, IRAnualResult, PrejuizoAnterior } from './types';

export var DEFAULT_PREJUIZO: PrejuizoAnterior = {
  acao: 0, fii: 0, etf: 0, bdr: 0, adr: 0, reit: 0, stock_int: 0,
  opcoes_swing: 0, opcoes_day: 0, cripto_swing: 0, cripto_day: 0,
};

export function computeIRAnual(input: IRInput): IRAnualResult {
  var yearStr = String(input.year);

  // 1) Renda variavel (operacoes)
  var monthResults = computeIROperacoes(input.operacoes, input.year);
  var taxResult = computeTaxByMonth(monthResults, input.prejuizoAnterior);

  // 2) Rendimentos (proventos) do ano
  var proventosAno = input.proventos.filter(function (p) {
    return p.data_pagamento && p.data_pagamento.substring(0, 4) === yearStr;
  });
  var rendimentos = proventosAno.map(classifyProventoIR);

  // 3) Totais de rendimentos
  var rendimentosIsentos = 0;
  var rendimentosTributados = 0;
  var irRetidoTotal = 0;
  rendimentos.forEach(function (r) {
    if (r.irRetido > 0) {
      rendimentosTributados += r.bruto;
      irRetidoTotal += r.irRetido;
    } else {
      rendimentosIsentos += r.bruto;
    }
  });

  // 4) IR devido (DARFs) total
  var irDevidoTotal = 0;
  taxResult.darfs.forEach(function (d) { irDevidoTotal += d.valorTotal; });

  // 5) Alertas
  var alertas: string[] = [];
  monthResults.forEach(function (mr) {
    if (mr.vendas.acao > 20000) {
      alertas.push('Mes ' + mr.mes + ': vendas de acoes > R$ 20k — isencao nao aplicada');
    }
    if (mr.vendas.cripto_swing > 35000) {
      alertas.push('Mes ' + mr.mes + ': vendas cripto > R$ 35k — isencao nao aplicada');
    }
  });
  var prejKeys = Object.keys(taxResult.prejuizoFinal) as Array<keyof PrejuizoAnterior>;
  prejKeys.forEach(function (k) {
    var v = taxResult.prejuizoFinal[k] || 0;
    if (v > 0.01) {
      alertas.push('Prejuizo a compensar em ' + k + ': R$ ' + v.toFixed(2) + ' (acumulado, carrega indefinidamente)');
    }
  });

  return {
    year: input.year,
    darfs: taxResult.darfs,
    opcoesMensal: [],          // TODO: commit ir-opcoes
    criptoMensal: [],          // TODO: commit ir-cripto
    rendaFixa: { isentas: [], tributadas: [] },  // TODO: commit ir-rf
    rendimentos: rendimentos,
    bens: [],                  // TODO: commit ir-bens
    prejuizoFinal: taxResult.prejuizoFinal,
    totais: {
      irDevido: irDevidoTotal,
      irRetido: irRetidoTotal,
      rendimentosIsentos: rendimentosIsentos,
      rendimentosTributados: rendimentosTributados,
    },
    alertas: alertas,
  };
}

export * from './constants';
export * from './types';
export * from './cambio';
export * from './darf';
export * from './rendimentos';
