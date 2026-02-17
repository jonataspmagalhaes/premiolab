/**
 * indicatorService.js
 * Calcula indicadores tecnicos para ativos da carteira
 * HV, SMA, EMA, RSI, Beta, ATR, Bollinger, MaxDrawdown, IV Rank
 */

import { fetchPriceHistoryLong } from './priceService';
import { getPositions, getOpcoes, getIndicators, upsertIndicatorsBatch } from './database';

// ══════════ HELPERS ══════════

function extractCloses(ohlcv) {
  var closes = [];
  for (var i = 0; i < ohlcv.length; i++) {
    closes.push(ohlcv[i].close);
  }
  return closes;
}

function extractHighs(ohlcv) {
  var highs = [];
  for (var i = 0; i < ohlcv.length; i++) {
    highs.push(ohlcv[i].high);
  }
  return highs;
}

function extractLows(ohlcv) {
  var lows = [];
  for (var i = 0; i < ohlcv.length; i++) {
    lows.push(ohlcv[i].low);
  }
  return lows;
}

function extractVolumes(ohlcv) {
  var volumes = [];
  for (var i = 0; i < ohlcv.length; i++) {
    volumes.push(ohlcv[i].volume);
  }
  return volumes;
}

// ══════════ VOLATILIDADE HISTORICA ══════════

export function calcHV(closes, period) {
  if (!closes || closes.length < period + 1) return null;

  var logReturns = [];
  var start = closes.length - period - 1;
  if (start < 0) start = 0;

  for (var i = start + 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) {
      logReturns.push(Math.log(closes[i] / closes[i - 1]));
    }
  }

  if (logReturns.length < 2) return null;

  var mean = 0;
  for (var m = 0; m < logReturns.length; m++) {
    mean += logReturns[m];
  }
  mean = mean / logReturns.length;

  var sumSqDiff = 0;
  for (var s = 0; s < logReturns.length; s++) {
    var diff = logReturns[s] - mean;
    sumSqDiff += diff * diff;
  }

  var variance = sumSqDiff / (logReturns.length - 1);
  var stdDev = Math.sqrt(variance);

  // Anualizar: * sqrt(252) * 100 para percentual
  return stdDev * Math.sqrt(252) * 100;
}

// ══════════ SMA ══════════

export function calcSMA(closes, period) {
  if (!closes || closes.length < period) return null;

  var sum = 0;
  for (var i = closes.length - period; i < closes.length; i++) {
    sum += closes[i];
  }
  return sum / period;
}

// ══════════ EMA ══════════

export function calcEMA(closes, period) {
  if (!closes || closes.length < period) return null;

  var smoothing = 2 / (period + 1);

  // Inicializar com SMA dos primeiros 'period' valores
  var sum = 0;
  for (var i = 0; i < period; i++) {
    sum += closes[i];
  }
  var ema = sum / period;

  // Calcular EMA iterativamente
  for (var j = period; j < closes.length; j++) {
    ema = closes[j] * smoothing + ema * (1 - smoothing);
  }

  return ema;
}

// ══════════ RSI ══════════

export function calcRSI(closes, period) {
  if (!closes || closes.length < period + 1) return null;

  var gains = [];
  var losses = [];

  for (var i = 1; i < closes.length; i++) {
    var change = closes[i] - closes[i - 1];
    if (change > 0) {
      gains.push(change);
      losses.push(0);
    } else {
      gains.push(0);
      losses.push(Math.abs(change));
    }
  }

  if (gains.length < period) return null;

  // Primeira media (SMA)
  var avgGain = 0;
  var avgLoss = 0;
  for (var a = 0; a < period; a++) {
    avgGain += gains[a];
    avgLoss += losses[a];
  }
  avgGain = avgGain / period;
  avgLoss = avgLoss / period;

  // Wilder smoothing
  for (var w = period; w < gains.length; w++) {
    avgGain = (avgGain * (period - 1) + gains[w]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[w]) / period;
  }

  if (avgLoss === 0) return 100;

  var rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// ══════════ BETA ══════════

export function calcBeta(tickerCloses, ibovCloses, period) {
  if (!tickerCloses || !ibovCloses) return null;

  // Alinhar tamanhos
  var minLen = tickerCloses.length < ibovCloses.length ? tickerCloses.length : ibovCloses.length;
  if (minLen < period + 1) return null;

  // Retornos dos ultimos 'period' dias
  var startIdx = minLen - period - 1;
  var tickerReturns = [];
  var ibovReturns = [];

  for (var i = startIdx + 1; i < minLen; i++) {
    if (tickerCloses[i - 1] > 0 && ibovCloses[i - 1] > 0) {
      tickerReturns.push(tickerCloses[i] / tickerCloses[i - 1] - 1);
      ibovReturns.push(ibovCloses[i] / ibovCloses[i - 1] - 1);
    }
  }

  if (tickerReturns.length < 2) return null;

  // Media dos retornos
  var meanT = 0;
  var meanM = 0;
  for (var m = 0; m < tickerReturns.length; m++) {
    meanT += tickerReturns[m];
    meanM += ibovReturns[m];
  }
  meanT = meanT / tickerReturns.length;
  meanM = meanM / ibovReturns.length;

  // Covariancia e variancia
  var cov = 0;
  var varM = 0;
  for (var c = 0; c < tickerReturns.length; c++) {
    var diffT = tickerReturns[c] - meanT;
    var diffM = ibovReturns[c] - meanM;
    cov += diffT * diffM;
    varM += diffM * diffM;
  }

  if (varM === 0) return null;

  return cov / varM;
}

// ══════════ ATR ══════════

export function calcATR(highs, lows, closes, period) {
  if (!highs || !lows || !closes) return null;
  if (highs.length < period + 1) return null;

  var trValues = [];

  for (var i = 1; i < highs.length; i++) {
    var highLow = highs[i] - lows[i];
    var highPrevClose = Math.abs(highs[i] - closes[i - 1]);
    var lowPrevClose = Math.abs(lows[i] - closes[i - 1]);
    var tr = highLow;
    if (highPrevClose > tr) tr = highPrevClose;
    if (lowPrevClose > tr) tr = lowPrevClose;
    trValues.push(tr);
  }

  if (trValues.length < period) return null;

  // Primeira ATR = SMA dos primeiros 'period' TR values
  var sum = 0;
  for (var s = 0; s < period; s++) {
    sum += trValues[s];
  }
  var atr = sum / period;

  // Wilder smoothing
  for (var w = period; w < trValues.length; w++) {
    atr = (atr * (period - 1) + trValues[w]) / period;
  }

  return atr;
}

// ══════════ BOLLINGER BANDS ══════════

export function calcBollingerBands(closes, period, mult) {
  if (!mult) mult = 2;
  if (!closes || closes.length < period) return null;

  var sma = calcSMA(closes, period);
  if (sma === null) return null;

  // Desvio padrao dos ultimos 'period' valores
  var start = closes.length - period;
  var sumSqDiff = 0;
  for (var i = start; i < closes.length; i++) {
    var diff = closes[i] - sma;
    sumSqDiff += diff * diff;
  }
  var stdDev = Math.sqrt(sumSqDiff / period);

  var upper = sma + mult * stdDev;
  var lower = sma - mult * stdDev;
  var width = sma > 0 ? ((upper - lower) / sma) * 100 : 0;

  return {
    upper: upper,
    lower: lower,
    width: width,
  };
}

// ══════════ MAX DRAWDOWN ══════════

export function calcMaxDrawdown(closes) {
  if (!closes || closes.length < 2) return null;

  var peak = closes[0];
  var maxDD = 0;

  for (var i = 1; i < closes.length; i++) {
    if (closes[i] > peak) {
      peak = closes[i];
    }
    var drawdown = peak > 0 ? ((peak - closes[i]) / peak) * 100 : 0;
    if (drawdown > maxDD) {
      maxDD = drawdown;
    }
  }

  return maxDD;
}

// ══════════ IV MEDIA (media ponderada IV opcoes ativas) ══════════

export function calcIVMedia(opcoes) {
  if (!opcoes || opcoes.length === 0) return null;

  var totalWeight = 0;
  var weightedSum = 0;

  for (var i = 0; i < opcoes.length; i++) {
    var op = opcoes[i];
    if (op.iv && op.iv > 0) {
      var weight = op.quantidade || 1;
      weightedSum += op.iv * weight;
      totalWeight += weight;
    }
  }

  if (totalWeight === 0) return null;
  return weightedSum / totalWeight;
}

// ══════════ IV RANK ══════════

export function calcIVRank(ivAtual, ivsHistoricas) {
  if (ivAtual == null || !ivsHistoricas || ivsHistoricas.length === 0) return null;

  var min = ivsHistoricas[0];
  var max = ivsHistoricas[0];

  for (var i = 1; i < ivsHistoricas.length; i++) {
    if (ivsHistoricas[i] < min) min = ivsHistoricas[i];
    if (ivsHistoricas[i] > max) max = ivsHistoricas[i];
  }

  if (max === min) return 50;

  return ((ivAtual - min) / (max - min)) * 100;
}

// ══════════ VOLUME MEDIO ══════════

function calcVolumeMedio(volumes, period) {
  if (!volumes || volumes.length < period) return null;

  var sum = 0;
  for (var i = volumes.length - period; i < volumes.length; i++) {
    sum += (volumes[i] || 0);
  }
  return sum / period;
}

// ══════════ SHOULD CALCULATE TODAY ══════════

export function shouldCalculateToday(lastCalcDate) {
  var now = new Date();

  // Verificar se e dia util (seg-sex)
  var dayOfWeek = now.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;

  // Verificar se hora >= 18 BRT (UTC-3 = 21 UTC)
  var utcHour = now.getUTCHours();
  var brtHour = utcHour - 3;
  if (brtHour < 0) brtHour += 24;
  if (brtHour < 18) return false;

  // Verificar se ja calculou hoje
  if (lastCalcDate) {
    var todayStr = now.toISOString().substring(0, 10);
    var lastStr = typeof lastCalcDate === 'string'
      ? lastCalcDate.substring(0, 10)
      : new Date(lastCalcDate).toISOString().substring(0, 10);
    if (lastStr === todayStr) return false;
  }

  return true;
}

// ══════════ ORQUESTRADOR PRINCIPAL ══════════

export async function runDailyCalculation(userId) {
  try {
    // 1. Buscar posicoes do usuario
    var posResult = await getPositions(userId);
    var positions = posResult.data || [];

    if (positions.length === 0) {
      return { data: [], error: null, message: 'Nenhuma posicao encontrada' };
    }

    // 2. Coletar tickers + IBOV
    var tickers = [];
    for (var p = 0; p < positions.length; p++) {
      tickers.push(positions[p].ticker);
    }

    var allTickers = tickers.slice();
    if (allTickers.indexOf('^BVSP') === -1) {
      allTickers.push('^BVSP');
    }

    // 3. Buscar historico longo (6 meses)
    var historyData = await fetchPriceHistoryLong(allTickers);

    // 4. Buscar opcoes do usuario (para IV media)
    var opcoesResult = await getOpcoes(userId);
    var todasOpcoes = opcoesResult.data || [];

    // Agrupar opcoes ativas por ativo_base
    var opcoesPorAtivo = {};
    for (var oi = 0; oi < todasOpcoes.length; oi++) {
      var op = todasOpcoes[oi];
      if (op.status !== 'ativa') continue;
      var base = (op.ativo_base || '').toUpperCase().trim();
      if (!opcoesPorAtivo[base]) opcoesPorAtivo[base] = [];
      opcoesPorAtivo[base].push(op);
    }

    // 5. Extrair closes do IBOV
    var ibovOhlcv = historyData['^BVSP'] || [];
    var ibovCloses = extractCloses(ibovOhlcv);

    // 6. Calcular indicadores para cada ticker
    var indicatorsList = [];

    for (var ti = 0; ti < tickers.length; ti++) {
      var ticker = tickers[ti];
      var ohlcv = historyData[ticker];

      if (!ohlcv || ohlcv.length < 21) {
        // Dados insuficientes, pular
        continue;
      }

      var closes = extractCloses(ohlcv);
      var highs = extractHighs(ohlcv);
      var lows = extractLows(ohlcv);
      var volumes = extractVolumes(ohlcv);

      var hv20 = calcHV(closes, 20);
      var hv60 = calcHV(closes, 60);
      var sma20 = calcSMA(closes, 20);
      var sma50 = calcSMA(closes, 50);
      var ema9 = calcEMA(closes, 9);
      var ema21 = calcEMA(closes, 21);
      var rsi14 = calcRSI(closes, 14);
      var beta = calcBeta(closes, ibovCloses, 60);
      var atr14 = calcATR(highs, lows, closes, 14);
      var bbands = calcBollingerBands(closes, 20, 2);
      var maxDD = calcMaxDrawdown(closes);
      var volMedio = calcVolumeMedio(volumes, 20);
      var precoFech = closes.length > 0 ? closes[closes.length - 1] : null;

      // IV media das opcoes desse ativo
      var opsAtivo = opcoesPorAtivo[ticker] || [];
      var ivMedia = calcIVMedia(opsAtivo);

      var indicator = {
        ticker: ticker,
        data_calculo: new Date().toISOString().substring(0, 10),
        hv_20: hv20 != null ? Math.round(hv20 * 100) / 100 : null,
        hv_60: hv60 != null ? Math.round(hv60 * 100) / 100 : null,
        sma_20: sma20 != null ? Math.round(sma20 * 100) / 100 : null,
        sma_50: sma50 != null ? Math.round(sma50 * 100) / 100 : null,
        ema_9: ema9 != null ? Math.round(ema9 * 100) / 100 : null,
        ema_21: ema21 != null ? Math.round(ema21 * 100) / 100 : null,
        rsi_14: rsi14 != null ? Math.round(rsi14 * 100) / 100 : null,
        beta: beta != null ? Math.round(beta * 100) / 100 : null,
        atr_14: atr14 != null ? Math.round(atr14 * 100) / 100 : null,
        max_drawdown: maxDD != null ? Math.round(maxDD * 100) / 100 : null,
        bb_upper: bbands ? Math.round(bbands.upper * 100) / 100 : null,
        bb_lower: bbands ? Math.round(bbands.lower * 100) / 100 : null,
        bb_width: bbands ? Math.round(bbands.width * 100) / 100 : null,
        iv_media: ivMedia != null ? Math.round(ivMedia * 100) / 100 : null,
        iv_rank: null, // Precisa de historico de IV para calcular
        preco_fechamento: precoFech,
        volume_medio_20: volMedio != null ? Math.round(volMedio) : null,
      };

      indicatorsList.push(indicator);
    }

    if (indicatorsList.length === 0) {
      return { data: [], error: null, message: 'Dados insuficientes para calculo' };
    }

    // 7. Salvar no banco (upsert batch)
    var saveResult = await upsertIndicatorsBatch(userId, indicatorsList);

    return {
      data: saveResult.data || indicatorsList,
      error: saveResult.error,
      message: 'Calculados ' + indicatorsList.length + ' indicadores',
    };
  } catch (err) {
    console.error('runDailyCalculation error:', err);
    return { data: [], error: err.message || 'Erro no calculo', message: null };
  }
}
