/**
 * yieldOnCostService.js
 * Calcula Yield on Cost real (renda 12m / custo investido) por ativo e carteira,
 * alem de crescimento da renda vs periodo anterior e comparativo inflacao.
 *
 * YoC = (dividendos recebidos nos ultimos 12m no ativo) / (custo investido atual) * 100
 *
 * Exports:
 *  - computeYoC(userId, opts) → {
 *      carteira: { yoc, renda12m, custoTotal, yocIr: opcional },
 *      growth: { renda12m, renda12mAnterior, growthPct, realPct (desc. inflacao) },
 *      topGrowers: [{ticker, yocAtual, yocAnterior, growth, renda12m}],
 *      byTicker: { [ticker]: {yoc, renda12m, custo} }
 *    }
 */

import { getProventos, getPositions } from './database';

// IPCA estimado 12m (fallback, podemos sobrescrever via profile.inflacao futuramente)
var IPCA_ANUAL_DEFAULT = 4.5;

function parseDateSafe(s) {
  if (!s) return null;
  var d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d;
}

export async function computeYoC(userId, opts) {
  if (!opts) opts = {};
  var ipca = opts.ipca != null ? opts.ipca : IPCA_ANUAL_DEFAULT;
  var portfolioId = opts.portfolioId || null;

  var results = await Promise.all([
    getProventos(userId, { limit: 3000, portfolioId: portfolioId || undefined }),
    getPositions(userId, portfolioId || undefined),
  ]);
  var proventos = (results[0] && results[0].data) || [];
  var positions = (results[1] && results[1].data) || [];

  var now = new Date();
  var cutoff12 = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  var cutoff24 = new Date(now.getFullYear() - 2, now.getMonth(), 1);

  // Proventos por ticker em dois periodos
  var rendaPorTicker12m = {};
  var rendaPorTicker12mAnt = {};
  for (var i = 0; i < proventos.length; i++) {
    var p = proventos[i];
    var pd = parseDateSafe(p.data_pagamento);
    if (!pd) continue;
    var val = p.valor_total || ((p.valor_por_cota || 0) * (p.quantidade || 0));
    if (val <= 0) continue;
    var tk = (p.ticker || '').toUpperCase();
    if (!tk) continue;
    if (pd >= cutoff12 && pd <= now) {
      if (!rendaPorTicker12m[tk]) rendaPorTicker12m[tk] = 0;
      rendaPorTicker12m[tk] += val;
    } else if (pd >= cutoff24 && pd < cutoff12) {
      if (!rendaPorTicker12mAnt[tk]) rendaPorTicker12mAnt[tk] = 0;
      rendaPorTicker12mAnt[tk] += val;
    }
  }

  // Custo por ticker = qty * pm
  var custoPorTicker = {};
  var custoTotal = 0;
  for (var j = 0; j < positions.length; j++) {
    var pos = positions[j];
    if (pos.categoria !== 'acao' && pos.categoria !== 'fii' && pos.categoria !== 'etf' && pos.categoria !== 'stock_int') continue;
    if ((pos.quantidade || 0) <= 0) continue;
    var tk2 = (pos.ticker || '').toUpperCase();
    var custo = (pos.quantidade || 0) * (pos.pm || 0);
    custoPorTicker[tk2] = custo;
    custoTotal += custo;
  }

  // byTicker e totais
  var byTicker = {};
  var renda12mTotal = 0;
  var topGrowers = [];
  var tickerKeys = Object.keys(custoPorTicker);
  for (var t = 0; t < tickerKeys.length; t++) {
    var tk3 = tickerKeys[t];
    var custo = custoPorTicker[tk3];
    var renda12 = rendaPorTicker12m[tk3] || 0;
    var renda12Ant = rendaPorTicker12mAnt[tk3] || 0;
    var yocAtual = custo > 0 ? (renda12 / custo) * 100 : 0;
    var yocAnt = custo > 0 ? (renda12Ant / custo) * 100 : 0;
    byTicker[tk3] = { yoc: yocAtual, renda12m: renda12, custo: custo };
    renda12mTotal += renda12;
    var growth = 0;
    if (renda12Ant > 0) {
      growth = ((renda12 - renda12Ant) / renda12Ant) * 100;
    }
    if (renda12 > 0) {
      topGrowers.push({
        ticker: tk3,
        yocAtual: yocAtual,
        yocAnterior: yocAnt,
        growth: growth,
        renda12m: renda12,
        renda12mAnt: renda12Ant,
      });
    }
  }
  topGrowers.sort(function(a, b) { return b.growth - a.growth; });

  var yocCarteira = custoTotal > 0 ? (renda12mTotal / custoTotal) * 100 : 0;

  // Growth carteira inteira
  var renda12mAntTotal = 0;
  var antKeys = Object.keys(rendaPorTicker12mAnt);
  for (var a = 0; a < antKeys.length; a++) renda12mAntTotal += rendaPorTicker12mAnt[antKeys[a]];
  var growthPct = renda12mAntTotal > 0 ? ((renda12mTotal - renda12mAntTotal) / renda12mAntTotal) * 100 : 0;
  var realPct = growthPct - ipca;

  return {
    carteira: {
      yoc: yocCarteira,
      renda12m: renda12mTotal,
      custoTotal: custoTotal,
    },
    growth: {
      renda12m: renda12mTotal,
      renda12mAnterior: renda12mAntTotal,
      growthPct: growthPct,
      realPct: realPct,
      ipca: ipca,
    },
    topGrowers: topGrowers.slice(0, 5),
    byTicker: byTicker,
  };
}
