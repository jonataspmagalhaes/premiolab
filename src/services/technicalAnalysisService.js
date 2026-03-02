/**
 * technicalAnalysisService.js
 * Análise técnica determinística: SMAs, pivots, suportes/resistências, tendência
 * Usado pelo TechnicalChart e pelo prompt da IA
 *
 * v2 — Melhorias de acurácia:
 * - Volume-weighted pivots (pivots em candles de alto volume valem mais)
 * - ATR-based adaptive clustering tolerance (ajusta à volatilidade)
 * - Recency decay (pivots recentes pesam mais que antigos)
 * - Composite strength score (toques + volume + recência + bounce)
 * - Volume Profile zones (POC — Point of Control como S/R adicional)
 * - Psychological round numbers como S/R menores
 * - Smart filtering: prioriza níveis próximos ao spot, até 5 níveis
 * - Mínimo 20 candles (funciona com período 1M)
 */

// ══════════ SMA SERIES ══════════

function calcSMASeries(closes, period) {
  if (!closes || closes.length < period) return [];
  var result = [];
  for (var i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      var sum = 0;
      for (var j = i - period + 1; j <= i; j++) {
        sum += closes[j];
      }
      result.push(sum / period);
    }
  }
  return result;
}

// ══════════ ATR (Average True Range) ══════════

function calcATR(highs, lows, closes, period) {
  if (!highs || highs.length < period + 1) return 0;
  var trSum = 0;
  var count = 0;
  for (var i = 1; i < highs.length; i++) {
    var tr1 = highs[i] - lows[i];
    var tr2 = Math.abs(highs[i] - closes[i - 1]);
    var tr3 = Math.abs(lows[i] - closes[i - 1]);
    var tr = Math.max(tr1, tr2, tr3);
    if (i >= highs.length - period) {
      trSum += tr;
      count++;
    }
  }
  return count > 0 ? trSum / count : 0;
}

// ══════════ AVERAGE VOLUME ══════════

function calcAvgVolume(volumes) {
  if (!volumes || volumes.length === 0) return 1;
  var sum = 0;
  for (var i = 0; i < volumes.length; i++) {
    sum += (volumes[i] || 0);
  }
  return sum / volumes.length || 1;
}

// ══════════ PIVOT POINTS (FRACTAL + VOLUME) ══════════

function findPivotPoints(highs, lows, volumes, avgVol, totalLen, lookbackMajor, lookbackMinor) {
  if (!highs || !lows) return { pivotHighs: [], pivotLows: [] };
  var lbMajor = lookbackMajor || 5;
  var lbMinor = lookbackMinor || 3;
  var pivotHighs = [];
  var pivotLows = [];
  var len = highs.length;

  // Adaptively reduce lookback for short data sets
  if (len < lbMajor * 2 + 1) {
    lbMajor = Math.max(2, Math.floor((len - 1) / 2));
  }
  if (len < lbMinor * 2 + 1) {
    lbMinor = Math.max(1, Math.floor((len - 1) / 2));
  }

  // Major pivots (lookback = lbMajor) — allow >= for broader detection
  for (var i = lbMajor; i < len - lbMajor; i++) {
    var isHigh = true;
    var strictCount = 0;
    for (var j = 1; j <= lbMajor; j++) {
      if (highs[i] < highs[i - j] || highs[i] < highs[i + j]) {
        isHigh = false;
        break;
      }
      // Count how many are strictly less (not just equal)
      if (highs[i] > highs[i - j]) strictCount++;
      if (highs[i] > highs[i + j]) strictCount++;
    }
    // At least half must be strictly less (avoids flat regions)
    if (isHigh && strictCount >= lbMajor) {
      var volRatio = (volumes && volumes[i] && avgVol > 0) ? volumes[i] / avgVol : 1;
      pivotHighs.push({
        index: i,
        price: highs[i],
        strength: 2,
        volRatio: Math.min(volRatio, 3), // cap at 3x
        recency: i / (totalLen || len), // 0..1, higher = more recent
      });
    }
  }

  // Minor pivots (lookback = lbMinor) — only add if not already a major
  for (var i2 = lbMinor; i2 < len - lbMinor; i2++) {
    var isHigh2 = true;
    var strictCount2 = 0;
    for (var j2 = 1; j2 <= lbMinor; j2++) {
      if (highs[i2] < highs[i2 - j2] || highs[i2] < highs[i2 + j2]) {
        isHigh2 = false;
        break;
      }
      if (highs[i2] > highs[i2 - j2]) strictCount2++;
      if (highs[i2] > highs[i2 + j2]) strictCount2++;
    }
    if (isHigh2 && strictCount2 >= lbMinor) {
      var dup = false;
      for (var d = 0; d < pivotHighs.length; d++) {
        if (pivotHighs[d].index === i2) { dup = true; break; }
      }
      if (!dup) {
        var volRatio2 = (volumes && volumes[i2] && avgVol > 0) ? volumes[i2] / avgVol : 1;
        pivotHighs.push({
          index: i2,
          price: highs[i2],
          strength: 1,
          volRatio: Math.min(volRatio2, 3),
          recency: i2 / (totalLen || len),
        });
      }
    }
  }

  // Major lows
  for (var i3 = lbMajor; i3 < len - lbMajor; i3++) {
    var isLow = true;
    var strictCount3 = 0;
    for (var j3 = 1; j3 <= lbMajor; j3++) {
      if (lows[i3] > lows[i3 - j3] || lows[i3] > lows[i3 + j3]) {
        isLow = false;
        break;
      }
      if (lows[i3] < lows[i3 - j3]) strictCount3++;
      if (lows[i3] < lows[i3 + j3]) strictCount3++;
    }
    if (isLow && strictCount3 >= lbMajor) {
      var volRatio3 = (volumes && volumes[i3] && avgVol > 0) ? volumes[i3] / avgVol : 1;
      pivotLows.push({
        index: i3,
        price: lows[i3],
        strength: 2,
        volRatio: Math.min(volRatio3, 3),
        recency: i3 / (totalLen || len),
      });
    }
  }

  // Minor lows
  for (var i4 = lbMinor; i4 < len - lbMinor; i4++) {
    var isLow2 = true;
    var strictCount4 = 0;
    for (var j4 = 1; j4 <= lbMinor; j4++) {
      if (lows[i4] > lows[i4 - j4] || lows[i4] > lows[i4 + j4]) {
        isLow2 = false;
        break;
      }
      if (lows[i4] < lows[i4 - j4]) strictCount4++;
      if (lows[i4] < lows[i4 + j4]) strictCount4++;
    }
    if (isLow2 && strictCount4 >= lbMinor) {
      var dup2 = false;
      for (var d2 = 0; d2 < pivotLows.length; d2++) {
        if (pivotLows[d2].index === i4) { dup2 = true; break; }
      }
      if (!dup2) {
        var volRatio4 = (volumes && volumes[i4] && avgVol > 0) ? volumes[i4] / avgVol : 1;
        pivotLows.push({
          index: i4,
          price: lows[i4],
          strength: 1,
          volRatio: Math.min(volRatio4, 3),
          recency: i4 / (totalLen || len),
        });
      }
    }
  }

  return { pivotHighs: pivotHighs, pivotLows: pivotLows };
}

// ══════════ VOLUME PROFILE — HIGH VOLUME NODES ══════════

function findVolumeNodes(highs, lows, closes, volumes, numBins) {
  if (!volumes || volumes.length < 10) return [];
  var bins = numBins || 30;

  // Price range
  var priceMin = closes[0];
  var priceMax = closes[0];
  for (var i = 0; i < closes.length; i++) {
    if (lows[i] < priceMin) priceMin = lows[i];
    if (highs[i] > priceMax) priceMax = highs[i];
  }
  var range = priceMax - priceMin;
  if (range <= 0) return [];
  var binSize = range / bins;

  // Accumulate volume per price bin
  var binVol = [];
  for (var b = 0; b < bins; b++) binVol.push(0);

  for (var k = 0; k < closes.length; k++) {
    var midPrice = (highs[k] + lows[k]) / 2;
    var binIdx = Math.floor((midPrice - priceMin) / binSize);
    if (binIdx >= bins) binIdx = bins - 1;
    if (binIdx < 0) binIdx = 0;
    binVol[binIdx] += (volumes[k] || 0);
  }

  // Find total volume for normalization
  var totalVol = 0;
  for (var tv = 0; tv < binVol.length; tv++) totalVol += binVol[tv];
  if (totalVol <= 0) return [];

  // Find bins with significantly above-average volume (>1.5x avg)
  var avgBinVol = totalVol / bins;
  var nodes = [];
  for (var n = 0; n < bins; n++) {
    if (binVol[n] > avgBinVol * 1.5) {
      var nodePrice = priceMin + (n + 0.5) * binSize;
      nodes.push({
        price: nodePrice,
        volumePct: binVol[n] / totalVol,
        strength: 0, // will be set in clustering
        volRatio: binVol[n] / avgBinVol,
        recency: 0.5, // volume profile spans entire period
        isVolumeNode: true,
      });
    }
  }

  return nodes;
}

// ══════════ PSYCHOLOGICAL ROUND NUMBERS ══════════

function findRoundLevels(spot, priceMin, priceMax) {
  if (!spot || spot <= 0) return [];
  var levels = [];

  // Determine step based on price magnitude
  var step;
  if (spot < 10) step = 1;
  else if (spot < 30) step = 2;
  else if (spot < 100) step = 5;
  else if (spot < 500) step = 10;
  else step = 50;

  // Generate round levels within visible range ±10%
  var lo = priceMin * 0.95;
  var hi = priceMax * 1.05;
  var start = Math.floor(lo / step) * step;

  for (var p = start; p <= hi; p += step) {
    if (p <= lo || p >= hi) continue;
    // Skip if too close to spot (within 0.5%) — these aren't interesting
    var distPct = Math.abs(p - spot) / spot;
    if (distPct < 0.005) continue;
    levels.push({
      price: p,
      strength: 0,
      volRatio: 0.5, // lower weight than real pivots
      recency: 0.3,
      isRound: true,
    });
  }

  return levels;
}

// ══════════ CLUSTER LEVELS (ADAPTIVE) ══════════

function clusterLevels(pivots, atr, spotPrice, type, totalCandles) {
  if (!pivots || pivots.length === 0) return [];

  // Adaptive tolerance: 1 ATR as percentage of spot, clamped 0.8%–3.5%
  var atrPct = (atr && spotPrice > 0) ? (atr / spotPrice) : 0.02;
  var tol = Math.max(0.008, Math.min(0.035, atrPct));

  // Sort by price
  var sorted = pivots.slice().sort(function(a, b) { return a.price - b.price; });

  var clusters = [];
  var used = [];
  for (var u = 0; u < sorted.length; u++) used.push(false);

  for (var i = 0; i < sorted.length; i++) {
    if (used[i]) continue;
    var group = [sorted[i]];
    used[i] = true;

    // Cluster center starts at first pivot's price
    var clusterCenter = sorted[i].price;
    for (var j = i + 1; j < sorted.length; j++) {
      if (used[j]) continue;
      var diff = Math.abs(sorted[j].price - clusterCenter) / clusterCenter;
      if (diff <= tol) {
        group.push(sorted[j]);
        used[j] = true;
        // Update cluster center to weighted mean for next comparison
        var tempSum = 0;
        var tempW = 0;
        for (var t = 0; t < group.length; t++) {
          tempSum += group[t].price;
          tempW++;
        }
        clusterCenter = tempSum / tempW;
      }
    }

    // Composite score calculation
    var sumPrice = 0;
    var sumWeight = 0;
    var touchCount = group.length;
    var maxVolRatio = 0;
    var maxRecency = 0;
    var hasVolumeNode = false;
    var hasRound = false;

    for (var g = 0; g < group.length; g++) {
      var p = group[g];
      // Weight: major pivot(2) > minor pivot(1), boosted by volume and recency
      var recencyBoost = 0.5 + (p.recency || 0) * 0.5; // 0.5..1.0
      var volBoost = Math.max(0.5, Math.min(2, p.volRatio || 1)); // 0.5..2.0
      var w = (p.strength || 1) * recencyBoost * volBoost;
      sumPrice += p.price * w;
      sumWeight += w;
      if ((p.volRatio || 0) > maxVolRatio) maxVolRatio = p.volRatio;
      if ((p.recency || 0) > maxRecency) maxRecency = p.recency;
      if (p.isVolumeNode) hasVolumeNode = true;
      if (p.isRound) hasRound = true;
    }

    var avgPrice = sumPrice / sumWeight;

    // Composite strength score (0-100)
    // Factors: touches (40%), volume (25%), recency (20%), confirmation sources (15%)
    var touchScore = Math.min(40, touchCount * 10); // 1 touch = 10, 4+ touches = 40
    var volScore = Math.min(25, maxVolRatio * 8); // 3x vol = 24
    var recencyScore = maxRecency * 20; // recent = up to 20
    var confirmScore = 0;
    if (hasVolumeNode) confirmScore += 8; // volume profile confirms
    if (hasRound) confirmScore += 4; // round number confirms
    if (touchCount >= 2 && maxVolRatio > 1.2) confirmScore += 3; // multi-touch + high vol

    var compositeScore = Math.round(touchScore + volScore + recencyScore + confirmScore);

    clusters.push({
      price: Math.round(avgPrice * 100) / 100, // round to centavos
      strength: touchCount,
      compositeScore: compositeScore,
      type: type || 'support',
      hasVolumeNode: hasVolumeNode,
      hasRound: hasRound,
      maxVolRatio: maxVolRatio,
    });
  }

  // Sort by composite score DESC
  clusters.sort(function(a, b) { return b.compositeScore - a.compositeScore; });

  // Keep top 5 (was 4) — filter out levels with only 1 weak touch and no confirmation
  var filtered = [];
  for (var f = 0; f < clusters.length; f++) {
    if (filtered.length >= 5) break;
    var c = clusters[f];
    // Skip single-touch round numbers without volume confirmation
    if (c.strength === 0 && c.hasRound && !c.hasVolumeNode) continue;
    // Skip very weak single-touch levels far from spot
    if (c.strength <= 1 && c.compositeScore < 15 && spotPrice > 0) {
      var dist = Math.abs(c.price - spotPrice) / spotPrice;
      if (dist > 0.15) continue; // >15% away and weak = skip
    }
    filtered.push(c);
  }

  return filtered;
}

// ══════════ DETECT TREND ══════════

function detectTrend(closes, sma20Series, sma50Series) {
  var minLen = sma50Series ? 50 : 20;
  if (!closes || closes.length < minLen) {
    // Short period: use just SMA20 slope if available
    if (closes && closes.length >= 20 && sma20Series) {
      return detectTrendShort(closes, sma20Series);
    }
    return { direction: 'sideways', strength: 0, label: 'Lateral' };
  }
  var last = closes.length - 1;
  var close = closes[last];
  var sma20 = sma20Series[last];
  var sma50 = sma50Series[last];

  if (sma20 == null || sma50 == null) {
    if (sma20 != null) return detectTrendShort(closes, sma20Series);
    return { direction: 'sideways', strength: 0, label: 'Lateral' };
  }

  var smaSep = Math.abs(sma20 - sma50) / sma50 * 100;
  var priceVsSma20 = (close - sma20) / sma20 * 100;

  var direction = 'sideways';
  var label = 'Lateral';
  var strength = 0;

  if (sma20 > sma50 && close > sma20) {
    direction = 'up';
    label = 'Alta';
    strength = Math.min(100, Math.round(smaSep * 10 + Math.max(0, priceVsSma20) * 5));
  } else if (sma20 < sma50 && close < sma20) {
    direction = 'down';
    label = 'Baixa';
    strength = Math.min(100, Math.round(smaSep * 10 + Math.max(0, -priceVsSma20) * 5));
  } else {
    strength = Math.max(0, 50 - Math.round(smaSep * 10));
  }

  return { direction: direction, strength: strength, label: label };
}

// Short-period trend using SMA20 slope
function detectTrendShort(closes, sma20Series) {
  var last = closes.length - 1;
  var sma20Now = sma20Series[last];
  // Compare current SMA20 to 5 candles ago
  var lookback = Math.min(5, last);
  var sma20Prev = sma20Series[last - lookback];
  if (sma20Now == null || sma20Prev == null) {
    return { direction: 'sideways', strength: 0, label: 'Lateral' };
  }
  var slope = (sma20Now - sma20Prev) / sma20Prev * 100;
  var close = closes[last];
  var priceAbove = close > sma20Now;

  if (slope > 0.5 && priceAbove) {
    return { direction: 'up', strength: Math.min(100, Math.round(slope * 15)), label: 'Alta' };
  }
  if (slope < -0.5 && !priceAbove) {
    return { direction: 'down', strength: Math.min(100, Math.round(Math.abs(slope) * 15)), label: 'Baixa' };
  }
  return { direction: 'sideways', strength: Math.max(0, 50 - Math.round(Math.abs(slope) * 10)), label: 'Lateral' };
}

// ══════════ BREAKOUTS & PROXIMITY ALERTS ══════════

function detectBreakouts(closes, supports, resistances, spot) {
  if (!closes || closes.length < 5) return [];
  var alerts = [];
  var PROXIMITY_PCT = 0.02; // 2% — alerta preventivo
  var BREAKOUT_DAYS = 3; // confirmar com N dias abaixo/acima

  // Check recent closes (last 3 days) vs levels
  var recentCloses = [];
  for (var rc = Math.max(0, closes.length - BREAKOUT_DAYS); rc < closes.length; rc++) {
    recentCloses.push(closes[rc]);
  }
  // Previous reference: close 5-10 days ago for comparison
  var prevIdx = Math.max(0, closes.length - 8);
  var prevClose = closes[prevIdx];

  // Support breakouts and proximity
  for (var si = 0; si < supports.length; si++) {
    var sup = supports[si];
    var distPct = (spot - sup.price) / sup.price;

    // Breakout: was above, now below
    if (prevClose > sup.price && spot < sup.price) {
      // Confirm: majority of recent closes below
      var belowCount = 0;
      for (var b = 0; b < recentCloses.length; b++) {
        if (recentCloses[b] < sup.price) belowCount++;
      }
      if (belowCount >= 2) {
        alerts.push({
          type: 'breakout_support',
          level: sup.price,
          strength: sup.strength,
          severity: 'high',
          icon: 'arrow-down-circle-outline',
          color: 'red',
          title: 'Suporte rompido',
          message: 'R$ ' + sup.price.toFixed(2) + ' (' + sup.strength + 'x) foi rompido. Nível vira resistência. Pode acelerar queda.',
          actionHint: 'PUT vendida neste strike ficou mais arriscada. Considere fechar ou rolar para strike mais baixo.',
        });
      }
    }
    // Proximity to support (approaching from above)
    else if (distPct > 0 && distPct <= PROXIMITY_PCT && spot > sup.price) {
      alerts.push({
        type: 'near_support',
        level: sup.price,
        strength: sup.strength,
        severity: 'medium',
        icon: 'alert-circle-outline',
        color: 'yellow',
        title: 'Próximo ao suporte',
        message: 'Preço a ' + (distPct * 100).toFixed(1) + '% do suporte R$ ' + sup.price.toFixed(2) + ' (' + sup.strength + 'x). Região de possível reversão.',
        actionHint: 'Suporte forte pode segurar o preço. Bom momento para avaliar venda de PUT no suporte.',
      });
    }
    // Retest: broke below, came back to test from below
    else if (spot < sup.price && distPct > -PROXIMITY_PCT && distPct < 0) {
      alerts.push({
        type: 'retest_support',
        level: sup.price,
        strength: sup.strength,
        severity: 'medium',
        icon: 'swap-vertical-outline',
        color: 'yellow',
        title: 'Reteste de suporte',
        message: 'Preço retestando R$ ' + sup.price.toFixed(2) + ' por baixo (agora resistência). Se não romper de volta, confirma fraqueza.',
        actionHint: 'Nível virou resistência. Se preço não voltar acima, tendência de baixa se confirma.',
      });
    }
  }

  // Resistance breakouts and proximity
  for (var ri = 0; ri < resistances.length; ri++) {
    var res = resistances[ri];
    var distPctR = (res.price - spot) / res.price;

    // Breakout: was below, now above
    if (prevClose < res.price && spot > res.price) {
      var aboveCount = 0;
      for (var a = 0; a < recentCloses.length; a++) {
        if (recentCloses[a] > res.price) aboveCount++;
      }
      if (aboveCount >= 2) {
        alerts.push({
          type: 'breakout_resistance',
          level: res.price,
          strength: res.strength,
          severity: 'high',
          icon: 'arrow-up-circle-outline',
          color: 'green',
          title: 'Resistência rompida',
          message: 'R$ ' + res.price.toFixed(2) + ' (' + res.strength + 'x) foi rompida. Nível vira suporte. Pode acelerar alta (breakout).',
          actionHint: 'CALL vendida neste strike ficou mais arriscada. Considere fechar ou rolar para strike mais alto.',
        });
      }
    }
    // Proximity to resistance (approaching from below)
    else if (distPctR > 0 && distPctR <= PROXIMITY_PCT && spot < res.price) {
      alerts.push({
        type: 'near_resistance',
        level: res.price,
        strength: res.strength,
        severity: 'medium',
        icon: 'alert-circle-outline',
        color: 'yellow',
        title: 'Próximo à resistência',
        message: 'Preço a ' + (distPctR * 100).toFixed(1) + '% da resistência R$ ' + res.price.toFixed(2) + ' (' + res.strength + 'x). Região de possível rejeição.',
        actionHint: 'Resistência forte pode barrar a alta. Bom momento para avaliar venda de CALL na resistência.',
      });
    }
    // Retest: broke above, came back to test from above
    else if (spot > res.price && distPctR > -PROXIMITY_PCT && distPctR < 0) {
      alerts.push({
        type: 'retest_resistance',
        level: res.price,
        strength: res.strength,
        severity: 'medium',
        icon: 'swap-vertical-outline',
        color: 'green',
        title: 'Reteste de resistência',
        message: 'Preço retestando R$ ' + res.price.toFixed(2) + ' por cima (agora suporte). Se segurar, confirma breakout.',
        actionHint: 'Nível virou suporte. Se preço se mantiver acima, tendência de alta se confirma.',
      });
    }
  }

  // Sort by severity (high first)
  alerts.sort(function(a, b) {
    var sevOrder = { high: 0, medium: 1, low: 2 };
    return (sevOrder[a.severity] || 2) - (sevOrder[b.severity] || 2);
  });

  return alerts;
}

// ══════════ MAIN ANALYSIS ══════════

function analyzeTechnicals(ohlcv, strikePrice) {
  if (!ohlcv || ohlcv.length < 20) return null;

  var closes = [];
  var highs = [];
  var lows = [];
  var volumes = [];
  for (var i = 0; i < ohlcv.length; i++) {
    closes.push(ohlcv[i].close);
    highs.push(ohlcv[i].high);
    lows.push(ohlcv[i].low);
    volumes.push(ohlcv[i].volume || 0);
  }

  var totalLen = closes.length;
  var currentSpot = closes[totalLen - 1];

  // ATR for adaptive tolerance
  var atr = calcATR(highs, lows, closes, 14);
  var avgVol = calcAvgVolume(volumes);

  // SMAs (adapt if not enough data)
  var sma20 = closes.length >= 20 ? calcSMASeries(closes, 20) : [];
  var sma50 = closes.length >= 50 ? calcSMASeries(closes, 50) : [];

  // Pivots with volume weighting
  var lbMajor = totalLen >= 60 ? 5 : (totalLen >= 30 ? 3 : 2);
  var lbMinor = totalLen >= 40 ? 3 : 2;
  var pivots = findPivotPoints(highs, lows, volumes, avgVol, totalLen, lbMajor, lbMinor);

  // Volume profile nodes
  var volNodes = findVolumeNodes(highs, lows, closes, volumes, 30);

  // Round number levels
  var priceMin = lows[0];
  var priceMax = highs[0];
  for (var pm = 1; pm < totalLen; pm++) {
    if (lows[pm] < priceMin) priceMin = lows[pm];
    if (highs[pm] > priceMax) priceMax = highs[pm];
  }
  var roundLevels = findRoundLevels(currentSpot, priceMin, priceMax);

  // Merge pivot lows + volume nodes below spot + round levels below spot → support candidates
  var supportCandidates = [];
  for (var sl = 0; sl < pivots.pivotLows.length; sl++) {
    supportCandidates.push(pivots.pivotLows[sl]);
  }
  for (var vn = 0; vn < volNodes.length; vn++) {
    if (volNodes[vn].price < currentSpot) {
      supportCandidates.push(volNodes[vn]);
    }
  }
  for (var rl = 0; rl < roundLevels.length; rl++) {
    if (roundLevels[rl].price < currentSpot) {
      supportCandidates.push(roundLevels[rl]);
    }
  }

  // Merge pivot highs + volume nodes above spot + round levels above spot → resistance candidates
  var resistanceCandidates = [];
  for (var rh = 0; rh < pivots.pivotHighs.length; rh++) {
    resistanceCandidates.push(pivots.pivotHighs[rh]);
  }
  for (var vn2 = 0; vn2 < volNodes.length; vn2++) {
    if (volNodes[vn2].price >= currentSpot) {
      resistanceCandidates.push(volNodes[vn2]);
    }
  }
  for (var rl2 = 0; rl2 < roundLevels.length; rl2++) {
    if (roundLevels[rl2].price >= currentSpot) {
      resistanceCandidates.push(roundLevels[rl2]);
    }
  }

  var supports = clusterLevels(supportCandidates, atr, currentSpot, 'support', totalLen);
  var resistances = clusterLevels(resistanceCandidates, atr, currentSpot, 'resistance', totalLen);

  var trend = detectTrend(closes, sma20, sma50);
  var alerts = detectBreakouts(closes, supports, resistances, currentSpot);

  return {
    sma20: sma20,
    sma50: sma50,
    pivotHighs: pivots.pivotHighs,
    pivotLows: pivots.pivotLows,
    supports: supports,
    resistances: resistances,
    trend: trend,
    alerts: alerts,
    strikePrice: strikePrice || null,
    spot: currentSpot,
  };
}

// ══════════ SUMMARY FOR AI PROMPT ══════════

function buildTechnicalSummary(analysis, spot) {
  if (!analysis) return '';
  var parts = [];

  // Trend
  parts.push('Tendência: ' + analysis.trend.label);

  // Supports with composite info
  if (analysis.supports.length > 0) {
    var sups = [];
    for (var i = 0; i < analysis.supports.length; i++) {
      var s = analysis.supports[i];
      var label = 'R$' + s.price.toFixed(2) + ' (' + s.strength + 'x';
      if (s.hasVolumeNode) label += ',vol';
      label += ')';
      sups.push(label);
    }
    parts.push('Suportes: ' + sups.join(', '));
  }

  // Resistances with composite info
  if (analysis.resistances.length > 0) {
    var ress = [];
    for (var j = 0; j < analysis.resistances.length; j++) {
      var r = analysis.resistances[j];
      var label2 = 'R$' + r.price.toFixed(2) + ' (' + r.strength + 'x';
      if (r.hasVolumeNode) label2 += ',vol';
      label2 += ')';
      ress.push(label2);
    }
    parts.push('Resistências: ' + ress.join(', '));
  }

  // SMAs
  var len = analysis.sma20.length;
  var sma20val = len > 0 ? analysis.sma20[len - 1] : null;
  var sma50len = analysis.sma50.length;
  var sma50val = sma50len > 0 ? analysis.sma50[sma50len - 1] : null;
  if (sma20val != null && sma50val != null) {
    var cmp = sma20val > sma50val ? '>' : '<';
    parts.push('SMA20 R$' + sma20val.toFixed(2) + ' ' + cmp + ' SMA50 R$' + sma50val.toFixed(2));
  } else if (sma20val != null) {
    parts.push('SMA20 R$' + sma20val.toFixed(2));
  }

  // Alerts (breakouts, proximity, retests)
  var alertsArr = analysis.alerts || [];
  if (alertsArr.length > 0) {
    var alertTexts = [];
    for (var ai = 0; ai < Math.min(alertsArr.length, 3); ai++) {
      alertTexts.push(alertsArr[ai].title + ': ' + alertsArr[ai].message);
    }
    parts.push('ALERTAS: ' + alertTexts.join(' | '));
  }

  return parts.join('. ') + '.';
}

// ══════════ EXPORTS ══════════

export {
  calcSMASeries,
  findPivotPoints,
  clusterLevels,
  detectTrend,
  detectBreakouts,
  analyzeTechnicals,
  buildTechnicalSummary,
};
