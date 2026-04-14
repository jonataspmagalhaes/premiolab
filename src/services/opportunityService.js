// opportunityService.js — Radar de Oportunidades em Opcoes
// Escaneia tickers B3 para detectar oportunidades automaticamente
// Usa infraestrutura existente: OpLab chains, analise tecnica, indicadores, precos

var oplabModule = require('./oplabService');
var fetchOptionsChain = oplabModule.fetchOptionsChain;

var priceServiceModule = require('./priceService');
var fetchPrices = priceServiceModule.fetchPrices;
var fetchPriceHistoryLong = priceServiceModule.fetchPriceHistoryLong;

var indicatorModule = require('./indicatorService');
var calcRSI = indicatorModule.calcRSI;
var calcBollingerBands = indicatorModule.calcBollingerBands;
var calcHV = indicatorModule.calcHV;
var calcIVRank = indicatorModule.calcIVRank;

var technicalModule = require('./technicalAnalysisService');
var analyzeTechnicals = technicalModule.analyzeTechnicals;

// ══════════ TICKERS PADRAO ══════════
// ~30 mais liquidos em opcoes na B3
var RADAR_TICKERS = [
  'PETR4', 'VALE3', 'BBDC4', 'ITUB4', 'BBAS3', 'B3SA3', 'ABEV3', 'WEGE3',
  'RENT3', 'SUZB3', 'PETR3', 'ITSA4', 'GGBR4', 'CSNA3', 'BPAC11', 'MGLU3',
  'ELET3', 'CMIG4', 'HAPV3', 'JBSS3', 'CYRE3', 'PRIO3', 'EMBR3', 'AZUL4',
  'GOLL4', 'COGN3', 'CIEL3', 'MRFG3', 'VIVT3', 'BOVA11'
];

var MAX_TICKERS = 40;
var BATCH_SIZE = 5;

// ══════════ METADADOS POR TIPO ══════════

var OPPORTUNITY_META = {
  iv_rank_alto: { label: 'IV Rank Alto', icon: 'trending-up-outline', color: '#EF4444', short: 'Venda de vol', defaultAction: { type: 'venda', instrument: 'CALL/PUT', label: 'Venda CALL/PUT', color: '#EF4444' } },
  iv_rank_baixo: { label: 'IV Rank Baixo', icon: 'trending-down-outline', color: '#22C55E', short: 'Compra de vol', defaultAction: { type: 'compra', instrument: 'CALL/PUT', label: 'Compra CALL/PUT', color: '#22C55E' } },
  near_support: { label: 'Perto do Suporte', icon: 'arrow-down-circle-outline', color: '#3B82F6', short: 'Suporte próximo', defaultAction: { type: 'venda', instrument: 'PUT', label: 'Venda PUT', color: '#EF4444' } },
  near_resistance: { label: 'Perto da Resistência', icon: 'arrow-up-circle-outline', color: '#F59E0B', short: 'Resistência próxima', defaultAction: { type: 'venda', instrument: 'CALL', label: 'Venda CALL', color: '#EF4444' } },
  premio_barato: { label: 'Prêmio Barato', icon: 'pricetag-outline', color: '#10B981', short: 'Abaixo do BS', defaultAction: { type: 'compra', instrument: 'CALL/PUT', label: 'Compra', color: '#22C55E' } },
  volume_incomum: { label: 'Volume Incomum', icon: 'bar-chart-outline', color: '#8B5CF6', short: 'Volume 3x+', defaultAction: { type: 'neutro', instrument: '', label: 'Fluxo', color: '#8B5CF6' } },
  theta_harvest: { label: 'Theta Harvest', icon: 'time-outline', color: '#06B6D4', short: 'Theta alto', defaultAction: { type: 'venda', instrument: 'ATM', label: 'Venda', color: '#EF4444' } },
  bb_squeeze: { label: 'BB Squeeze', icon: 'contract-outline', color: '#E879F9', short: 'Bollinger apertado', defaultAction: { type: 'compra', instrument: 'CALL/PUT', label: 'Compra Straddle', color: '#22C55E' } },
  rsi_extremo: { label: 'RSI Extremo', icon: 'pulse-outline', color: '#F97316', short: 'RSI extremo', defaultAction: { type: 'compra', instrument: 'CALL', label: 'Reversão', color: '#F97316' } },
  skew_favoravel: { label: 'Skew Favorável', icon: 'swap-horizontal-outline', color: '#14B8A6', short: 'Skew P/C', defaultAction: { type: 'venda', instrument: 'PUT', label: 'Venda vol cara', color: '#EF4444' } },
};

function getOpportunityMeta(type) {
  return OPPORTUNITY_META[type] || { label: type, icon: 'help-outline', color: '#888', short: type };
}

// ══════════ BUILD TICKER LIST ══════════

function buildTickerList(userTickers, watchlist, includeDefaults, excludedTickers) {
  var seen = {};
  var excluded = excludedTickers || {};
  var result = [];

  // Adiciona tickers do usuario primeiro (carteira)
  if (userTickers) {
    for (var i = 0; i < userTickers.length; i++) {
      var t = (userTickers[i] || '').toUpperCase().trim();
      if (t && !seen[t]) {
        seen[t] = true;
        result.push(t);
      }
    }
  }

  // Adiciona watchlist
  if (watchlist) {
    for (var w = 0; w < watchlist.length; w++) {
      var wt = (watchlist[w] || '').toUpperCase().trim();
      if (wt && !seen[wt]) {
        seen[wt] = true;
        result.push(wt);
      }
    }
  }

  // Adiciona defaults (excluindo os desativados pelo usuario)
  if (includeDefaults !== false) {
    for (var d = 0; d < RADAR_TICKERS.length; d++) {
      if (result.length >= MAX_TICKERS) break;
      var dt = RADAR_TICKERS[d];
      if (!seen[dt] && !excluded[dt]) {
        seen[dt] = true;
        result.push(dt);
      }
    }
  }

  // Cap
  if (result.length > MAX_TICKERS) {
    result = result.slice(0, MAX_TICKERS);
  }

  return result;
}

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

// Calcula BB width em janelas rolantes para percentil
function calcBBWidthHistory(closes, period, mult) {
  if (!closes || closes.length < period) return [];
  var widths = [];
  for (var i = period - 1; i < closes.length; i++) {
    var slice = closes.slice(i - period + 1, i + 1);
    var sum = 0;
    for (var s = 0; s < slice.length; s++) sum += slice[s];
    var sma = sum / slice.length;
    var sumSqDiff = 0;
    for (var d = 0; d < slice.length; d++) {
      var diff = slice[d] - sma;
      sumSqDiff += diff * diff;
    }
    var stdDev = Math.sqrt(sumSqDiff / slice.length);
    var upper = sma + (mult || 2) * stdDev;
    var lower = sma - (mult || 2) * stdDev;
    var width = sma > 0 ? ((upper - lower) / sma) * 100 : 0;
    widths.push(width);
  }
  return widths;
}

function percentileOf(value, arr) {
  if (!arr || arr.length === 0) return 50;
  var below = 0;
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] < value) below++;
  }
  return (below / arr.length) * 100;
}

// Encontra ATM (strike mais proximo do spot) na primeira serie
function findATMStrikes(chain, spot) {
  if (!chain || !chain.series || chain.series.length === 0 || !spot) return null;
  var series = chain.series[0];
  if (!series.strikes || series.strikes.length === 0) return null;

  var bestIdx = 0;
  var bestDiff = Math.abs(series.strikes[0].strike - spot);
  for (var i = 1; i < series.strikes.length; i++) {
    var diff = Math.abs(series.strikes[i].strike - spot);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  return {
    strike: series.strikes[bestIdx].strike,
    call: series.strikes[bestIdx].call,
    put: series.strikes[bestIdx].put,
    days_to_maturity: series.days_to_maturity,
  };
}

// ══════════ DETECTORES ══════════

// 1. IV Rank Alto (>85)
function detectIVRankAlto(ticker, chain, ohlcv, spot) {
  if (!chain || !chain.iv_current || !ohlcv || ohlcv.length < 60) return null;
  var closes = extractCloses(ohlcv);
  // Usar HV historico como proxy para IV historico
  var hvHistory = [];
  for (var i = 20; i < closes.length; i++) {
    var hv = calcHV(closes.slice(0, i + 1), 20);
    if (hv != null) hvHistory.push(hv);
  }
  if (hvHistory.length < 10) return null;

  // OpLab iv_current ja vem em % (ex: 33.24 = 33.24%), calcHV tambem retorna em %
  var ivCurrent = chain.iv_current;
  var ivRank = calcIVRank(ivCurrent, hvHistory);
  if (ivRank == null || ivRank <= 85) return null;

  var score = Math.max(20, Math.min(95, Math.round(20 + (ivRank - 85) * 5.3)));
  return {
    ticker: ticker,
    type: 'iv_rank_alto',
    score: score,
    description: 'IV Rank em ' + Math.round(ivRank) + '% — volatilidade implícita historicamente elevada. Favorece venda de opções.',
    metrics: 'IV ' + chain.iv_current.toFixed(1) + '% | HV20 ' + (hvHistory[hvHistory.length - 1] || 0).toFixed(1) + '% | IV Rank ' + Math.round(ivRank),
    spot: spot,
    data: { ivRank: ivRank, iv: chain.iv_current, hv: hvHistory[hvHistory.length - 1] },
    action: { type: 'venda', instrument: 'CALL/PUT', label: 'Venda CALL/PUT', color: '#EF4444' },
  };
}

// 2. IV Rank Baixo (<15)
function detectIVRankBaixo(ticker, chain, ohlcv, spot) {
  if (!chain || !chain.iv_current || !ohlcv || ohlcv.length < 60) return null;
  var closes = extractCloses(ohlcv);
  var hvHistory = [];
  for (var i = 20; i < closes.length; i++) {
    var hv = calcHV(closes.slice(0, i + 1), 20);
    if (hv != null) hvHistory.push(hv);
  }
  if (hvHistory.length < 10) return null;

  // OpLab iv_current ja vem em % (ex: 33.24 = 33.24%), calcHV tambem retorna em %
  var ivCurrent = chain.iv_current;
  var ivRank = calcIVRank(ivCurrent, hvHistory);
  if (ivRank == null || ivRank >= 15) return null;

  var score = Math.max(20, Math.min(95, Math.round(20 + (15 - ivRank) * 5.3)));
  return {
    ticker: ticker,
    type: 'iv_rank_baixo',
    score: score,
    description: 'IV Rank em ' + Math.round(ivRank) + '% — volatilidade implícita historicamente baixa. Favorece compra de opções.',
    metrics: 'IV ' + chain.iv_current.toFixed(1) + '% | HV20 ' + (hvHistory[hvHistory.length - 1] || 0).toFixed(1) + '% | IV Rank ' + Math.round(ivRank),
    spot: spot,
    data: { ivRank: ivRank, iv: chain.iv_current, hv: hvHistory[hvHistory.length - 1] },
    action: { type: 'compra', instrument: 'CALL/PUT', label: 'Compra CALL/PUT', color: '#22C55E' },
  };
}

// 3. Perto do Suporte
function detectNearSupport(ticker, ohlcv, spot) {
  if (!ohlcv || ohlcv.length < 20 || !spot) return null;
  var analysis = analyzeTechnicals(ohlcv);
  if (!analysis || !analysis.supports || analysis.supports.length === 0) return null;

  var bestSupport = null;
  var bestDist = 999;
  for (var i = 0; i < analysis.supports.length; i++) {
    var sup = analysis.supports[i];
    var dist = (spot - sup.price) / spot;
    if (dist > 0 && dist <= 0.02 && dist < bestDist) {
      bestDist = dist;
      bestSupport = sup;
    }
  }
  if (!bestSupport) return null;

  // compositeScore range ~10-85, normalizar para 20-95
  var score = Math.max(20, Math.min(95, Math.round(20 + (bestSupport.compositeScore / 85) * 75)));
  return {
    ticker: ticker,
    type: 'near_support',
    score: score,
    description: 'Preço a ' + (bestDist * 100).toFixed(1) + '% do suporte R$ ' + bestSupport.price.toFixed(2) + ' (' + bestSupport.strength + ' toques). Região de possível reversão.',
    metrics: 'Spot R$ ' + spot.toFixed(2) + ' | Suporte R$ ' + bestSupport.price.toFixed(2) + ' | Dist ' + (bestDist * 100).toFixed(1) + '%',
    spot: spot,
    data: { support: bestSupport.price, distance: bestDist, compositeScore: bestSupport.compositeScore },
    action: { type: 'venda', instrument: 'PUT', label: 'Venda PUT', color: '#EF4444' },
  };
}

// 4. Perto da Resistencia
function detectNearResistance(ticker, ohlcv, spot) {
  if (!ohlcv || ohlcv.length < 20 || !spot) return null;
  var analysis = analyzeTechnicals(ohlcv);
  if (!analysis || !analysis.resistances || analysis.resistances.length === 0) return null;

  var bestResist = null;
  var bestDist = 999;
  for (var i = 0; i < analysis.resistances.length; i++) {
    var res = analysis.resistances[i];
    var dist = (res.price - spot) / spot;
    if (dist > 0 && dist <= 0.02 && dist < bestDist) {
      bestDist = dist;
      bestResist = res;
    }
  }
  if (!bestResist) return null;

  // compositeScore range ~10-85, normalizar para 20-95
  var score = Math.max(20, Math.min(95, Math.round(20 + (bestResist.compositeScore / 85) * 75)));
  return {
    ticker: ticker,
    type: 'near_resistance',
    score: score,
    description: 'Preço a ' + (bestDist * 100).toFixed(1) + '% da resistência R$ ' + bestResist.price.toFixed(2) + ' (' + bestResist.strength + ' toques). Possível rejeição.',
    metrics: 'Spot R$ ' + spot.toFixed(2) + ' | Resistência R$ ' + bestResist.price.toFixed(2) + ' | Dist ' + (bestDist * 100).toFixed(1) + '%',
    spot: spot,
    data: { resistance: bestResist.price, distance: bestDist, compositeScore: bestResist.compositeScore },
    action: { type: 'venda', instrument: 'CALL', label: 'Venda CALL', color: '#EF4444' },
  };
}

// 5. Premio Barato (mercado < 70% do BS teorico)
function detectPremioBarato(ticker, chain, spot) {
  if (!chain || !chain.series || chain.series.length === 0 || !spot) return null;

  var bestOpp = null;
  var bestRatio = 1;

  for (var si = 0; si < Math.min(chain.series.length, 2); si++) {
    var series = chain.series[si];
    for (var j = 0; j < series.strikes.length; j++) {
      var st = series.strikes[j];
      // Checar calls e puts
      var opts = [{ opt: st.call, tipo: 'CALL' }, { opt: st.put, tipo: 'PUT' }];
      for (var o = 0; o < opts.length; o++) {
        var opt = opts[o].opt;
        if (!opt || !opt.bs_price || opt.bs_price <= 0.05) continue;
        var mktPrice = opt.last || ((opt.bid + opt.ask) / 2);
        if (!mktPrice || mktPrice <= 0.05) continue;
        // Ignorar opcoes sem bid/ask (sem liquidez real)
        if (!opt.bid || opt.bid <= 0 || !opt.ask || opt.ask <= 0) continue;
        var ratio = mktPrice / opt.bs_price;
        if (ratio < 0.70 && ratio > 0.05 && ratio < bestRatio) {
          bestRatio = ratio;
          bestOpp = {
            tipo: opts[o].tipo,
            strike: st.strike,
            mktPrice: mktPrice,
            bsPrice: opt.bs_price,
            symbol: opt.symbol,
            series_label: series.label,
          };
        }
      }
    }
  }

  if (!bestOpp) return null;

  var score = Math.max(20, Math.min(95, Math.round(20 + (0.70 - bestRatio) / 0.70 * 75)));
  return {
    ticker: ticker,
    type: 'premio_barato',
    score: score,
    description: bestOpp.tipo + ' ' + bestOpp.symbol + ' (strike ' + bestOpp.strike.toFixed(2) + ') negociando AGORA a ' + (bestRatio * 100).toFixed(1) + '% do valor teórico BS. Prêmio subavaliado pelo mercado no momento.',
    metrics: 'Preço atual R$ ' + bestOpp.mktPrice.toFixed(2) + ' | BS teórico R$ ' + bestOpp.bsPrice.toFixed(2) + ' | ' + bestOpp.series_label,
    spot: spot,
    data: { ratio: bestRatio, strike: bestOpp.strike, tipo: bestOpp.tipo, symbol: bestOpp.symbol },
    action: { type: 'compra', instrument: bestOpp.tipo, label: 'Compra ' + bestOpp.tipo, color: '#22C55E' },
  };
}

// 6. Volume Incomum (>5x mediana da serie, excluindo o proprio strike)
function detectVolumeIncomum(ticker, chain, spot) {
  if (!chain || !chain.series || chain.series.length === 0) return null;

  var bestOpp = null;
  var bestRatio = 0;

  for (var si = 0; si < Math.min(chain.series.length, 2); si++) {
    var series = chain.series[si];
    // Coletar todos os volumes da serie
    var allVols = [];
    for (var j = 0; j < series.strikes.length; j++) {
      var st = series.strikes[j];
      if (st.call && st.call.volume > 0) allVols.push(st.call.volume);
      if (st.put && st.put.volume > 0) allVols.push(st.put.volume);
    }
    if (allVols.length < 5) continue; // Poucos strikes com volume

    // Encontrar strikes com volume incomum vs mediana (excluindo o proprio)
    for (var k = 0; k < series.strikes.length; k++) {
      var stk = series.strikes[k];
      var opts = [{ opt: stk.call, tipo: 'CALL' }, { opt: stk.put, tipo: 'PUT' }];
      for (var o = 0; o < opts.length; o++) {
        var opt = opts[o].opt;
        if (!opt || opt.volume <= 0) continue;
        // Mediana excluindo o proprio volume
        var others = [];
        for (var v = 0; v < allVols.length; v++) {
          if (allVols[v] !== opt.volume) others.push(allVols[v]);
        }
        if (others.length < 3) continue;
        others.sort(function(a, b) { return a - b; });
        var median = others.length % 2 === 0
          ? (others[others.length / 2 - 1] + others[others.length / 2]) / 2
          : others[Math.floor(others.length / 2)];
        if (median < 20) continue; // Sem liquidez real
        var ratio = opt.volume / median;
        if (ratio > 5 && ratio > bestRatio) {
          bestRatio = ratio;
          bestOpp = {
            tipo: opts[o].tipo,
            strike: stk.strike,
            volume: opt.volume,
            median: median,
            symbol: opt.symbol,
            series_label: series.label,
          };
        }
      }
    }
  }

  if (!bestOpp) return null;

  var score = Math.max(20, Math.min(95, Math.round(20 + (bestRatio - 5) * 7.5)));
  return {
    ticker: ticker,
    type: 'volume_incomum',
    score: score,
    description: bestOpp.tipo + ' ' + bestOpp.symbol + ' com volume ' + Math.round(bestRatio) + 'x acima da mediana da série. Possível fluxo institucional.',
    metrics: 'Vol ' + bestOpp.volume + ' | Mediana ' + Math.round(bestOpp.median) + ' | ' + Math.round(bestRatio) + 'x | ' + bestOpp.series_label,
    spot: spot,
    data: { ratio: bestRatio, strike: bestOpp.strike, tipo: bestOpp.tipo, volume: bestOpp.volume },
    action: { type: 'neutro', instrument: bestOpp.tipo, label: 'Fluxo ' + bestOpp.tipo, color: '#8B5CF6' },
  };
}

// 7. Theta Harvest (theta/premio > 2%/dia em ATM, DTE >= 10)
// DTE minimo evita flagrar opcoes prestes a expirar onde theta alto eh puramente matematico
function detectThetaHarvest(ticker, chain, spot) {
  var atm = findATMStrikes(chain, spot);
  if (!atm) return null;
  // Ignorar opcoes com DTE muito baixo — theta alto eh natural perto do vencimento
  if (!atm.days_to_maturity || atm.days_to_maturity < 10) return null;

  var bestOpp = null;
  var bestRatio = 0;

  var opts = [{ opt: atm.call, tipo: 'CALL' }, { opt: atm.put, tipo: 'PUT' }];
  for (var o = 0; o < opts.length; o++) {
    var opt = opts[o].opt;
    if (!opt || !opt.theta || opt.theta >= 0) continue; // theta eh negativo
    var premium = opt.last || ((opt.bid + opt.ask) / 2);
    if (!premium || premium <= 0.05) continue;
    // Exigir bid/ask validos (liquidez)
    if (!opt.bid || opt.bid <= 0 || !opt.ask || opt.ask <= 0) continue;
    var thetaAbs = Math.abs(opt.theta);
    var ratio = thetaAbs / premium; // % do premio que se perde por dia
    if (ratio > 0.02 && ratio > bestRatio) {
      bestRatio = ratio;
      bestOpp = {
        tipo: opts[o].tipo,
        strike: atm.strike,
        theta: opt.theta,
        premium: premium,
        symbol: opt.symbol,
        dte: atm.days_to_maturity,
      };
    }
  }

  if (!bestOpp) return null;

  var score = Math.max(20, Math.min(95, Math.round(20 + (bestRatio - 0.02) * 2500)));
  return {
    ticker: ticker,
    type: 'theta_harvest',
    score: score,
    description: bestOpp.tipo + ' ATM ' + bestOpp.symbol + ' perde ' + (bestRatio * 100).toFixed(1) + '% do prêmio/dia. ' + bestOpp.dte + ' DTE. Favorece venda.',
    metrics: 'Theta ' + bestOpp.theta.toFixed(3) + ' | Prêmio R$ ' + bestOpp.premium.toFixed(2) + ' | ' + bestOpp.dte + ' DTE',
    spot: spot,
    data: { ratio: bestRatio, theta: bestOpp.theta, premium: bestOpp.premium, dte: bestOpp.dte },
    action: { type: 'venda', instrument: bestOpp.tipo, label: 'Venda ' + bestOpp.tipo, color: '#EF4444' },
  };
}

// 8. BB Squeeze (Bollinger Bands apertadas - percentil < 20%)
function detectBBSqueeze(ticker, ohlcv, spot) {
  if (!ohlcv || ohlcv.length < 60) return null;
  var closes = extractCloses(ohlcv);
  var widthHistory = calcBBWidthHistory(closes, 20, 2);
  if (widthHistory.length < 20) return null;

  var currentWidth = widthHistory[widthHistory.length - 1];
  var percentil = percentileOf(currentWidth, widthHistory);

  if (percentil >= 20) return null;

  var score = Math.max(20, Math.min(95, Math.round(20 + (20 - percentil) * 3.75)));
  return {
    ticker: ticker,
    type: 'bb_squeeze',
    score: score,
    description: 'Bandas de Bollinger no percentil ' + Math.round(percentil) + '% (6 meses). Compressão de volatilidade precede movimentos fortes.',
    metrics: 'BB Width ' + currentWidth.toFixed(2) + '% | Percentil ' + Math.round(percentil) + '%',
    spot: spot,
    data: { width: currentWidth, percentil: percentil },
    action: { type: 'compra', instrument: 'CALL/PUT', label: 'Compra Straddle', color: '#22C55E' },
  };
}

// 9. RSI Extremo (RSI < 30 + suporte OU RSI > 70 + resistencia)
function detectRSIExtremo(ticker, ohlcv, spot) {
  if (!ohlcv || ohlcv.length < 20 || !spot) return null;
  var closes = extractCloses(ohlcv);
  var rsi = calcRSI(closes, 14);
  if (rsi == null) return null;

  var analysis = analyzeTechnicals(ohlcv);
  var hasSupportNear = false;
  var hasResistNear = false;

  if (analysis) {
    if (analysis.supports) {
      for (var s = 0; s < analysis.supports.length; s++) {
        var dist = Math.abs(spot - analysis.supports[s].price) / spot;
        if (dist < 0.03) { hasSupportNear = true; break; }
      }
    }
    if (analysis.resistances) {
      for (var r = 0; r < analysis.resistances.length; r++) {
        var distR = Math.abs(spot - analysis.resistances[r].price) / spot;
        if (distR < 0.03) { hasResistNear = true; break; }
      }
    }
  }

  var isOversold = rsi < 30;
  var isOverbought = rsi > 70;

  if (!isOversold && !isOverbought) return null;

  // RSI 30/70 (limiar) → score 20, RSI 10/90 (extremo) → score 75, com S/R bonus ate +20
  var deviation = isOversold ? (30 - rsi) : (rsi - 70); // 0 no limiar, 20 no extremo
  var baseScore = Math.min(55, deviation * 2.75);
  var bonus = 0;
  if (isOversold && hasSupportNear) bonus = 20;
  if (isOverbought && hasResistNear) bonus = 20;
  var score = Math.max(20, Math.min(95, Math.round(20 + baseScore + Math.min(20, bonus))));

  var direction = isOversold ? 'sobrevendido' : 'sobrecomprado';
  var srNote = '';
  if (isOversold && hasSupportNear) srNote = ' Suporte próximo reforça possível reversão de alta.';
  if (isOverbought && hasResistNear) srNote = ' Resistência próxima reforça possível reversão de baixa.';

  var rsiAction = isOversold
    ? { type: 'compra', instrument: 'CALL', label: 'Compra CALL', color: '#22C55E' }
    : { type: 'compra', instrument: 'PUT', label: 'Compra PUT', color: '#22C55E' };

  return {
    ticker: ticker,
    type: 'rsi_extremo',
    score: score,
    description: 'RSI ' + rsi.toFixed(1) + ' — ' + direction + '.' + srNote,
    metrics: 'RSI ' + rsi.toFixed(1) + (hasSupportNear ? ' | S/R próximo' : ''),
    spot: spot,
    data: { rsi: rsi, oversold: isOversold, supportNear: hasSupportNear, resistNear: hasResistNear },
    action: rsiAction,
  };
}

// 10. Skew Favoravel (diff IV put/call ATM > 25%)
// Threshold elevado de 15% para 25% — put IV > call IV eh estrutural no mercado BR
// Apenas skews realmente exagerados sao oportunidade de arbitragem
function detectSkewFavoravel(ticker, chain, spot) {
  var atm = findATMStrikes(chain, spot);
  if (!atm || !atm.call || !atm.put) return null;
  if (!atm.call.iv || !atm.put.iv) return null;

  var callIV = atm.call.iv;
  var putIV = atm.put.iv;
  if (callIV <= 0 || putIV <= 0) return null;

  var skewDiff = Math.abs(putIV - callIV) / ((putIV + callIV) / 2);
  if (skewDiff < 0.25) return null;

  var score = Math.max(20, Math.min(95, Math.round(20 + (skewDiff - 0.25) * 375)));
  var direction = putIV > callIV ? 'Put IV > Call IV' : 'Call IV > Put IV';
  var hint = putIV > callIV
    ? 'Mercado precifica mais risco de queda. Puts relativamente caras vs calls.'
    : 'Mercado precifica mais risco de alta. Calls relativamente caras vs puts.';

  var skewAction = putIV > callIV
    ? { type: 'venda', instrument: 'PUT', label: 'Venda PUT', color: '#EF4444' }
    : { type: 'venda', instrument: 'CALL', label: 'Venda CALL', color: '#EF4444' };

  return {
    ticker: ticker,
    type: 'skew_favoravel',
    score: score,
    description: direction + ' (' + (skewDiff * 100).toFixed(0) + '% diff). ' + hint,
    metrics: 'Call IV ' + callIV.toFixed(1) + '% | Put IV ' + putIV.toFixed(1) + '% | Skew ' + (skewDiff * 100).toFixed(0) + '%',
    spot: spot,
    data: { callIV: callIV, putIV: putIV, skewDiff: skewDiff },
    action: skewAction,
  };
}

// ══════════ SCAN TICKER ══════════

function scanTicker(ticker, selic, ohlcv, chain, spot) {
  var opportunities = [];

  // Detectores que usam chain
  if (chain && !chain.error) {
    var r1 = detectIVRankAlto(ticker, chain, ohlcv, spot);
    if (r1) opportunities.push(r1);

    var r2 = detectIVRankBaixo(ticker, chain, ohlcv, spot);
    if (r2) opportunities.push(r2);

    var r5 = detectPremioBarato(ticker, chain, spot);
    if (r5) opportunities.push(r5);

    var r6 = detectVolumeIncomum(ticker, chain, spot);
    if (r6) opportunities.push(r6);

    var r7 = detectThetaHarvest(ticker, chain, spot);
    if (r7) opportunities.push(r7);

    var r10 = detectSkewFavoravel(ticker, chain, spot);
    if (r10) opportunities.push(r10);
  }

  // Detectores que usam OHLCV
  if (ohlcv && ohlcv.length >= 20) {
    var r3 = detectNearSupport(ticker, ohlcv, spot);
    if (r3) opportunities.push(r3);

    var r4 = detectNearResistance(ticker, ohlcv, spot);
    if (r4) opportunities.push(r4);

    var r8 = detectBBSqueeze(ticker, ohlcv, spot);
    if (r8) opportunities.push(r8);

    var r9 = detectRSIExtremo(ticker, ohlcv, spot);
    if (r9) opportunities.push(r9);
  }

  return opportunities;
}

// ══════════ SCAN BATCH ══════════

var _aborted = false;

function scanBatch(tickers, selic, onProgress) {
  _aborted = false;

  return new Promise(function(resolve) {
    var allResults = [];
    var scannedCount = 0;
    var total = tickers.length;

    function processBatch(startIdx) {
      if (_aborted || startIdx >= total) {
        resolve({ results: allResults, scanned: scannedCount, total: total, aborted: _aborted });
        return;
      }

      var batch = tickers.slice(startIdx, startIdx + BATCH_SIZE);

      // 1. Fetch precos do batch inteiro
      fetchPrices(batch).then(function(pricesMap) {
        if (_aborted) { resolve({ results: allResults, scanned: scannedCount, total: total, aborted: true }); return; }

        // 2. Para cada ticker no batch, buscar historico + chain em paralelo
        var promises = [];
        for (var b = 0; b < batch.length; b++) {
          promises.push(fetchTickerData(batch[b], selic, pricesMap));
        }

        Promise.all(promises).then(function(dataArr) {
          if (_aborted) { resolve({ results: allResults, scanned: scannedCount, total: total, aborted: true }); return; }

          for (var d = 0; d < dataArr.length; d++) {
            var tickerData = dataArr[d];
            if (!tickerData) continue;

            var opps = scanTicker(
              tickerData.ticker,
              selic,
              tickerData.ohlcv,
              tickerData.chain,
              tickerData.spot
            );

            for (var oi = 0; oi < opps.length; oi++) {
              allResults.push(opps[oi]);
            }
            scannedCount++;
          }

          // Progresso
          if (onProgress) {
            // Copiar array para evitar mutacao
            var resultsCopy = allResults.slice();
            onProgress(resultsCopy, scannedCount, total);
          }

          // Proximo batch
          processBatch(startIdx + BATCH_SIZE);
        }).catch(function(err) {
          console.warn('scanBatch batch error:', err);
          scannedCount += batch.length;
          if (onProgress) onProgress(allResults.slice(), scannedCount, total);
          processBatch(startIdx + BATCH_SIZE);
        });
      }).catch(function(err) {
        console.warn('scanBatch prices error:', err);
        scannedCount += batch.length;
        if (onProgress) onProgress(allResults.slice(), scannedCount, total);
        processBatch(startIdx + BATCH_SIZE);
      });
    }

    processBatch(0);
  });
}

function fetchTickerData(ticker, selic, pricesMap) {
  return new Promise(function(resolve) {
    var spot = 0;
    if (pricesMap && pricesMap[ticker]) {
      spot = pricesMap[ticker].price || pricesMap[ticker].regularMarketPrice || 0;
    }

    // Buscar historico e chain em paralelo
    var ohlcvPromise = fetchPriceHistoryLong([ticker]).then(function(histMap) {
      return histMap && histMap[ticker] ? histMap[ticker] : null;
    }).catch(function() { return null; });

    var chainPromise = fetchOptionsChain(ticker, selic || 13.25).then(function(result) {
      return result;
    }).catch(function() { return null; });

    Promise.all([ohlcvPromise, chainPromise]).then(function(results) {
      var ohlcv = results[0];
      var chain = results[1];

      // Atualizar spot pelo chain se disponivel
      if (chain && chain.spot && chain.spot > 0) {
        spot = chain.spot;
      }

      resolve({
        ticker: ticker,
        spot: spot,
        ohlcv: ohlcv,
        chain: chain,
      });
    }).catch(function() {
      resolve(null);
    });
  });
}

function abortScan() {
  _aborted = true;
}

// ══════════ EXPORTS ══════════

module.exports = {
  RADAR_TICKERS: RADAR_TICKERS,
  buildTickerList: buildTickerList,
  scanTicker: scanTicker,
  scanBatch: scanBatch,
  abortScan: abortScan,
  getOpportunityMeta: getOpportunityMeta,
};
