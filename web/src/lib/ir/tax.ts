// Aplicacao de aliquotas, isencao R$20k (acoes) e compensacao de
// prejuizos silo-separada.
//
// MIRROR: src/screens/relatorios/RelatoriosScreen.js#computeTaxByMonth.

import type { CategoriaIR, DarfPorCategoria, DarfRecord, MonthResult, PrejuizoAnterior } from './types';
import { ALIQUOTAS, LIMITES_ISENCAO } from './constants';
import { buildDarfRecord } from './darf';

// Categorias que tem silo proprio de compensacao. Prejuizo de uma NAO
// compensa ganho de outra (Instrucao Normativa RFB 1585/2015).
var SILOS: CategoriaIR[] = [
  'acao', 'fii', 'etf', 'bdr', 'adr', 'reit', 'stock_int',
  'opcoes_swing', 'opcoes_day', 'cripto_swing', 'cripto_day',
];

function aliquotaFor(cat: CategoriaIR): number {
  switch (cat) {
    case 'acao': return ALIQUOTAS.acoes;
    case 'fii': return ALIQUOTAS.fii;
    case 'etf': return ALIQUOTAS.etf;
    case 'bdr': return ALIQUOTAS.bdr;
    case 'adr': return ALIQUOTAS.adr;
    case 'reit': return ALIQUOTAS.reit;
    case 'stock_int': return ALIQUOTAS.stock_int;
    case 'opcoes_swing': return ALIQUOTAS.opcoes_swing;
    case 'opcoes_day': return ALIQUOTAS.opcoes_day;
    case 'cripto_swing': return ALIQUOTAS.cripto_swing;
    case 'cripto_day': return ALIQUOTAS.cripto_day;
    default: return 0.15;
  }
}

// Computa DARFs mensais com compensacao silo-separada de prejuizo.
// Retorna (records mensais + prejuizo final atualizado).
export function computeTaxByMonth(
  monthResults: MonthResult[],
  prejAnterior: PrejuizoAnterior,
): { darfs: DarfRecord[]; prejuizoFinal: PrejuizoAnterior } {
  // Clona prejuizo pra nao mutar o input; silos nao presentes em PrejuizoAnterior
  // (nao deveria ocorrer se tipos estiverem corretos) caem em 0.
  var prej: Record<CategoriaIR, number> = {
    acao: prejAnterior.acao || 0,
    fii: prejAnterior.fii || 0,
    etf: prejAnterior.etf || 0,
    bdr: prejAnterior.bdr || 0,
    adr: prejAnterior.adr || 0,
    reit: prejAnterior.reit || 0,
    stock_int: prejAnterior.stock_int || 0,
    opcoes_swing: prejAnterior.opcoes_swing || 0,
    opcoes_day: prejAnterior.opcoes_day || 0,
    cripto_swing: prejAnterior.cripto_swing || 0,
    cripto_day: prejAnterior.cripto_day || 0,
  };

  var darfs: DarfRecord[] = [];

  for (var i = 0; i < monthResults.length; i++) {
    var mr = monthResults[i];
    var cats: DarfPorCategoria[] = [];

    for (var j = 0; j < SILOS.length; j++) {
      var cat = SILOS[j];
      var ganho = mr.ganhos[cat] || 0;
      var venda = mr.vendas[cat] || 0;
      var aliq = aliquotaFor(cat);

      var dc: DarfPorCategoria = {
        categoria: cat,
        baseCalculo: 0,
        aliquota: aliq,
        prejuizoConsumido: 0,
        prejuizoRemanescente: prej[cat],
        imposto: 0,
        isento: false,
      };

      if (ganho === 0 && venda === 0) {
        cats.push(dc);
        continue;
      }

      // Isencao de acoes BR (swing): venda mensal <= R$20k
      if (cat === 'acao' && venda > 0 && venda <= LIMITES_ISENCAO.acoes_vendas_mes && ganho > 0) {
        dc.isento = true;
        dc.motivoIsencao = 'Vendas mensais ate R$ ' + LIMITES_ISENCAO.acoes_vendas_mes.toLocaleString('pt-BR');
        cats.push(dc);
        continue;
      }

      // Isencao cripto: venda mensal <= 35k (swing apenas — daytrade nao ganha isencao)
      if (cat === 'cripto_swing' && venda > 0 && venda <= LIMITES_ISENCAO.cripto_vendas_mes && ganho > 0) {
        dc.isento = true;
        dc.motivoIsencao = 'Vendas mensais ate R$ ' + LIMITES_ISENCAO.cripto_vendas_mes.toLocaleString('pt-BR');
        cats.push(dc);
        continue;
      }

      if (ganho > 0) {
        // Consome prejuizo anterior ate zerar ou ate o ganho
        var consumo = Math.min(prej[cat], ganho);
        var base = ganho - consumo;
        prej[cat] -= consumo;
        dc.prejuizoConsumido = consumo;
        dc.prejuizoRemanescente = prej[cat];
        dc.baseCalculo = base;
        dc.imposto = base * aliq;
      } else if (ganho < 0) {
        // Acumula prejuizo
        prej[cat] += Math.abs(ganho);
        dc.prejuizoRemanescente = prej[cat];
      }

      cats.push(dc);
    }

    // Cria DARF do mes com as categorias que tem imposto > 0 (ou que
    // precisam aparecer no historico; vamos manter todas com imposto > 0).
    var tributaveis = cats.filter(function (c) { return c.imposto > 0; });
    if (tributaveis.length > 0) {
      // Cripto tem codigo diferente (4600). Se uma das cats e cripto_*,
      // emitimos DARF separada (ou sinalizamos). Simplificacao inicial:
      // emite DARF 6015 pra tudo que nao e cripto, e 4600 pra cripto.
      var rvCats = tributaveis.filter(function (c) { return c.categoria !== 'cripto_swing' && c.categoria !== 'cripto_day'; });
      var criptoCats = tributaveis.filter(function (c) { return c.categoria === 'cripto_swing' || c.categoria === 'cripto_day'; });
      if (rvCats.length > 0) darfs.push(buildDarfRecord(mr.mes, rvCats, 'rv'));
      if (criptoCats.length > 0) darfs.push(buildDarfRecord(mr.mes, criptoCats, 'cripto'));
    }
  }

  return {
    darfs: darfs,
    prejuizoFinal: {
      acao: prej.acao,
      fii: prej.fii,
      etf: prej.etf,
      bdr: prej.bdr,
      adr: prej.adr,
      reit: prej.reit,
      stock_int: prej.stock_int,
      opcoes_swing: prej.opcoes_swing,
      opcoes_day: prej.opcoes_day,
      cripto_swing: prej.cripto_swing,
      cripto_day: prej.cripto_day,
    },
  };
}
