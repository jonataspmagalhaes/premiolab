/**
 * incomeScoreService.js
 * Score 0-100 de previsibilidade de renda por ativo e carteira.
 *
 * Metrica composta:
 *  - Regularidade (35%): meses com pagamento / 24
 *  - Consistencia (30%): 100 - coef. variacao dos pagamentos mensais (clampeado)
 *  - Tendencia (20%): crescimento dos ultimos 12m vs 12m anteriores
 *  - Cobertura (15%): qtde de dados (sem dados → score baixo)
 *
 * Exports:
 *  - computeTickerScore(proventos, ticker) → { score, regularidade, consistencia, tendencia, cobertura, mesesPagos, media, cv }
 *  - computePortfolioScore(userId, opts) → { score, byTicker:{...}, weighted, grade }
 *  - scoreToLabel(score) → { label, color, grade }
 */

import { getProventos, getPositions } from './database';

function parseDateSafe(s) {
  if (!s) return null;
  var d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d;
}

function monthKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// Coeficiente de variacao (desvio padrao / media)
function coefVariation(values) {
  if (!values || values.length === 0) return 0;
  var sum = 0;
  for (var i = 0; i < values.length; i++) sum += values[i];
  var mean = sum / values.length;
  if (mean === 0) return 0;
  var variance = 0;
  for (var j = 0; j < values.length; j++) variance += Math.pow(values[j] - mean, 2);
  variance /= values.length;
  var std = Math.sqrt(variance);
  return std / mean;
}

export function computeTickerScore(proventos, ticker) {
  var tk = (ticker || '').toUpperCase().trim();
  var now = new Date();
  var cutoff24 = new Date(now.getFullYear(), now.getMonth() - 23, 1);
  var cutoff12 = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  // Agregar por mes
  var monthly24 = {};
  var monthly12 = {};
  var monthly12Anterior = {};
  for (var i = 0; i < proventos.length; i++) {
    var p = proventos[i];
    if ((p.ticker || '').toUpperCase().trim() !== tk) continue;
    var pd = parseDateSafe(p.data_pagamento);
    if (!pd || pd < cutoff24 || pd > now) continue;
    var val = p.valor_total || ((p.valor_por_cota || 0) * (p.quantidade || 0));
    if (val <= 0) continue;
    var mk = monthKey(pd);
    if (!monthly24[mk]) monthly24[mk] = 0;
    monthly24[mk] += val;
    if (pd >= cutoff12) {
      if (!monthly12[mk]) monthly12[mk] = 0;
      monthly12[mk] += val;
    } else {
      if (!monthly12Anterior[mk]) monthly12Anterior[mk] = 0;
      monthly12Anterior[mk] += val;
    }
  }

  // Series mensais preenchidas (24 meses com zeros)
  var series24 = [];
  for (var m = 23; m >= 0; m--) {
    var md = new Date(now.getFullYear(), now.getMonth() - m, 1);
    var mk2 = monthKey(md);
    series24.push(monthly24[mk2] || 0);
  }
  var paidMonths = 0;
  var sum24 = 0;
  var paidValues = [];
  for (var j = 0; j < series24.length; j++) {
    if (series24[j] > 0) {
      paidMonths++;
      paidValues.push(series24[j]);
    }
    sum24 += series24[j];
  }
  var media = sum24 / 24;
  var cv = coefVariation(paidValues);

  // 1) Regularidade — % de meses pagos / 24
  var regularidade = (paidMonths / 24) * 100;

  // 2) Consistencia — 100 - CV*100 (clampeado 0..100)
  var consistencia = 100 - Math.min(100, cv * 100);
  if (paidValues.length < 3) consistencia = Math.min(consistencia, 40);

  // 3) Tendencia — crescimento ultimos 12 vs 12 anteriores
  var sum12 = 0; var sum12Ant = 0;
  var keys12 = Object.keys(monthly12);
  for (var k = 0; k < keys12.length; k++) sum12 += monthly12[keys12[k]];
  var keys12Ant = Object.keys(monthly12Anterior);
  for (var k2 = 0; k2 < keys12Ant.length; k2++) sum12Ant += monthly12Anterior[keys12Ant[k2]];
  var growth = 0;
  if (sum12Ant > 0) growth = ((sum12 - sum12Ant) / sum12Ant) * 100;
  // Mapeia para 0..100: -30% → 0, 0% → 50, +30% → 100
  var tendencia = 50 + Math.max(-50, Math.min(50, growth * (50 / 30)));

  // 4) Cobertura — tem pelo menos 12 meses de dados?
  var cobertura = 100;
  if (paidMonths < 12) cobertura = (paidMonths / 12) * 100;
  if (paidMonths === 0) cobertura = 0;

  var score = (regularidade * 0.35) + (consistencia * 0.30) + (tendencia * 0.20) + (cobertura * 0.15);
  score = Math.round(Math.max(0, Math.min(100, score)));

  return {
    score: score,
    regularidade: Math.round(regularidade),
    consistencia: Math.round(consistencia),
    tendencia: Math.round(tendencia),
    cobertura: Math.round(cobertura),
    mesesPagos: paidMonths,
    media: media,
    cv: cv,
    sum12m: sum12,
    sum12mAnterior: sum12Ant,
    growth12m: growth,
  };
}

export async function computePortfolioScore(userId, opts) {
  if (!opts) opts = {};
  var results = await Promise.all([
    getProventos(userId, { limit: 3000, portfolioId: opts.portfolioId || undefined }),
    getPositions(userId, opts.portfolioId || undefined),
  ]);
  var proventos = (results[0] && results[0].data) || [];
  var positions = (results[1] && results[1].data) || [];

  // Map positions para obter peso (valor atual aproximado = qty * pm)
  var posMap = {};
  var totalValor = 0;
  for (var i = 0; i < positions.length; i++) {
    var pos = positions[i];
    if ((pos.quantidade || 0) <= 0) continue;
    if (pos.categoria !== 'fii' && pos.categoria !== 'acao' && pos.categoria !== 'etf' && pos.categoria !== 'stock_int') continue;
    var tk = (pos.ticker || '').toUpperCase();
    var valor = (pos.quantidade || 0) * (pos.pm || 0);
    posMap[tk] = { valor: valor, categoria: pos.categoria };
    totalValor += valor;
  }

  var byTicker = {};
  var weightedSum = 0;
  var totalWeight = 0;
  var tickerKeys = Object.keys(posMap);
  for (var t = 0; t < tickerKeys.length; t++) {
    var tk2 = tickerKeys[t];
    var tScore = computeTickerScore(proventos, tk2);
    byTicker[tk2] = tScore;
    var weight = totalValor > 0 ? (posMap[tk2].valor / totalValor) : (1 / tickerKeys.length);
    weightedSum += tScore.score * weight;
    totalWeight += weight;
  }

  var portfolioScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
  portfolioScore = Math.round(portfolioScore);

  return {
    score: portfolioScore,
    byTicker: byTicker,
    weighted: true,
    grade: scoreToLabel(portfolioScore),
  };
}

export function scoreToLabel(score) {
  if (score >= 85) return { label: 'Excelente', color: '#22c55e', grade: 'A' };
  if (score >= 70) return { label: 'Bom', color: '#3B82F6', grade: 'B' };
  if (score >= 55) return { label: 'Regular', color: '#F59E0B', grade: 'C' };
  if (score >= 35) return { label: 'Fraco', color: '#F97316', grade: 'D' };
  return { label: 'Muito Fraco', color: '#EF4444', grade: 'E' };
}
