/**
 * TechnicalChart.js
 * Gráfico SVG anotado com preço, SMAs, suportes, resistências, pivots, strike, spot
 * Indicadores toggleáveis: Bollinger Bands, RSI, Volume, Expected Move
 * Touch interativo com tooltip
 */

import React, { useState, useMemo } from 'react';
import { View, Text } from 'react-native';
import Svg, { Line, Path, Rect, Circle, Text as SvgText, G, Polygon } from 'react-native-svg';
import { C, F } from '../theme';

var PADDING_LEFT = 48;
var PADDING_RIGHT = 12;
var PADDING_TOP = 28;
var PADDING_BOTTOM = 18;

var RSI_HEIGHT = 60;
var RSI_PAD_TOP = 4;
var RSI_PAD_BOTTOM = 14;
var VOL_HEIGHT_RATIO = 0.18; // 18% of chart height for volume bars

function fmt(v) {
  if (v == null || isNaN(v)) return '—';
  return Number(v).toFixed(2);
}

function buildPath(points) {
  if (points.length < 2) return '';
  var d = 'M ' + points[0].x + ' ' + points[0].y;
  for (var i = 1; i < points.length; i++) {
    var prev = points[i - 1];
    var cur = points[i];
    var cpx = (prev.x + cur.x) / 2;
    d += ' C ' + cpx + ' ' + prev.y + ', ' + cpx + ' ' + cur.y + ', ' + cur.x + ' ' + cur.y;
  }
  return d;
}

function buildDashedSegments(points) {
  if (points.length < 2) return '';
  var d = '';
  for (var i = 0; i < points.length - 1; i++) {
    var x1 = points[i].x;
    var y1 = points[i].y;
    var x2 = points[i + 1].x;
    var y2 = points[i + 1].y;
    if (i === 0) {
      d += 'M ' + x1 + ' ' + y1;
    }
    d += ' L ' + x2 + ' ' + y2;
  }
  return d;
}

// Build area path for Bollinger Bands (upper → right, then lower ← left)
function buildBBAreaPath(upperPoints, lowerPoints) {
  if (upperPoints.length < 2 || lowerPoints.length < 2) return '';
  var d = 'M ' + upperPoints[0].x + ' ' + upperPoints[0].y;
  for (var i = 1; i < upperPoints.length; i++) {
    d += ' L ' + upperPoints[i].x + ' ' + upperPoints[i].y;
  }
  for (var j = lowerPoints.length - 1; j >= 0; j--) {
    d += ' L ' + lowerPoints[j].x + ' ' + lowerPoints[j].y;
  }
  d += ' Z';
  return d;
}

export default function TechnicalChart(props) {
  var ohlcv = props.ohlcv;
  var analysis = props.analysis;
  var spot = props.spot;
  var strikePrice = props.strikePrice;
  var height = props.height || 200;
  var color = props.color || C.opcoes;
  var compact = props.compact || false;
  var indicators = props.indicators; // { bb, rsi, volume, expectedMove }
  var dte = props.dte || 0;
  var hv = props.hv || 0;

  var _active = useState(null);
  var activeIndex = _active[0];
  var setActiveIndex = _active[1];
  var _touching = useState(false);
  var touching = _touching[0];
  var setTouching = _touching[1];

  var chartW = props.width || 320;

  // Determine if indicators panels are active
  var showBB = indicators && indicators.bb;
  var showRSI = indicators && indicators.rsi && !compact;
  var showVolume = indicators && indicators.volume;
  var showEM = indicators && indicators.expectedMove && dte > 0 && hv > 0;

  // Total SVG height: main chart + RSI panel if active
  var mainHeight = height;
  var totalHeight = showRSI ? mainHeight + RSI_HEIGHT : mainHeight;

  var computed = useMemo(function() {
    if (!ohlcv || ohlcv.length < 2 || !analysis) return null;

    var closes = [];
    var opens = [];
    var highsArr = [];
    var lowsArr = [];
    var volumesArr = [];
    for (var i = 0; i < ohlcv.length; i++) {
      closes.push(ohlcv[i].close);
      opens.push(ohlcv[i].open || ohlcv[i].close);
      highsArr.push(ohlcv[i].high || ohlcv[i].close);
      lowsArr.push(ohlcv[i].low || ohlcv[i].close);
      volumesArr.push(ohlcv[i].volume || 0);
    }

    // Find min/max across closes, supports, resistances, strike
    var minV = Infinity;
    var maxV = -Infinity;
    for (var c = 0; c < closes.length; c++) {
      if (lowsArr[c] < minV) minV = lowsArr[c];
      if (highsArr[c] > maxV) maxV = highsArr[c];
    }
    for (var si = 0; si < analysis.supports.length; si++) {
      var sp = analysis.supports[si].price;
      if (sp < minV) minV = sp;
      if (sp > maxV) maxV = sp;
    }
    for (var ri = 0; ri < analysis.resistances.length; ri++) {
      var rp = analysis.resistances[ri].price;
      if (rp < minV) minV = rp;
      if (rp > maxV) maxV = rp;
    }
    if (strikePrice && strikePrice > 0) {
      if (strikePrice < minV) minV = strikePrice;
      if (strikePrice > maxV) maxV = strikePrice;
    }

    // Bollinger Bands series
    var bbUpper = [];
    var bbLower = [];
    var bbMiddle = [];
    var BB_PERIOD = 20;
    var BB_MULT = 2;
    if (closes.length >= BB_PERIOD) {
      for (var bi = 0; bi < closes.length; bi++) {
        if (bi < BB_PERIOD - 1) {
          bbUpper.push(null);
          bbLower.push(null);
          bbMiddle.push(null);
        } else {
          var sumBB = 0;
          for (var bj = bi - BB_PERIOD + 1; bj <= bi; bj++) {
            sumBB += closes[bj];
          }
          var smaBB = sumBB / BB_PERIOD;
          var sumSqBB = 0;
          for (var bk = bi - BB_PERIOD + 1; bk <= bi; bk++) {
            var diffBB = closes[bk] - smaBB;
            sumSqBB += diffBB * diffBB;
          }
          var stdBB = Math.sqrt(sumSqBB / BB_PERIOD);
          var upper = smaBB + BB_MULT * stdBB;
          var lower = smaBB - BB_MULT * stdBB;
          bbUpper.push(upper);
          bbLower.push(lower);
          bbMiddle.push(smaBB);
          // Expand range if BB visible
          if (showBB) {
            if (upper > maxV) maxV = upper;
            if (lower < minV) minV = lower;
          }
        }
      }
    }

    // Expected Move range
    var emUpper = null;
    var emLower = null;
    if (showEM && spot > 0) {
      var hvDaily = (hv / 100) / Math.sqrt(252);
      var sigma1 = spot * hvDaily * Math.sqrt(dte);
      emUpper = spot + sigma1;
      emLower = spot - sigma1;
      if (emUpper > maxV) maxV = emUpper;
      if (emLower < minV) minV = emLower;
    }

    // Add padding
    var rangePad = (maxV - minV) * 0.08;
    minV = minV - rangePad;
    maxV = maxV + rangePad;
    var range = maxV - minV;
    if (range === 0) range = 1;

    var drawW = chartW - PADDING_LEFT - PADDING_RIGHT;
    var drawH = mainHeight - PADDING_TOP - PADDING_BOTTOM;

    function toX(idx) { return PADDING_LEFT + (idx / (closes.length - 1)) * drawW; }
    function toY(val) { return PADDING_TOP + (1 - (val - minV) / range) * drawH; }

    // Price points
    var pricePoints = [];
    for (var p = 0; p < closes.length; p++) {
      pricePoints.push({ x: toX(p), y: toY(closes[p]), value: closes[p], index: p });
    }

    // High-Low range points (for candle wick area)
    var highPoints = [];
    var lowPoints = [];
    for (var hl = 0; hl < closes.length; hl++) {
      highPoints.push({ x: toX(hl), y: toY(highsArr[hl]) });
      lowPoints.push({ x: toX(hl), y: toY(lowsArr[hl]) });
    }

    // SMA points (skip nulls)
    var sma20Points = [];
    for (var s2 = 0; s2 < analysis.sma20.length; s2++) {
      if (analysis.sma20[s2] != null) {
        sma20Points.push({ x: toX(s2), y: toY(analysis.sma20[s2]) });
      }
    }
    var sma50Points = [];
    for (var s5 = 0; s5 < analysis.sma50.length; s5++) {
      if (analysis.sma50[s5] != null) {
        sma50Points.push({ x: toX(s5), y: toY(analysis.sma50[s5]) });
      }
    }

    // BB points
    var bbUpperPoints = [];
    var bbLowerPoints = [];
    for (var bpi = 0; bpi < bbUpper.length; bpi++) {
      if (bbUpper[bpi] != null) {
        bbUpperPoints.push({ x: toX(bpi), y: toY(bbUpper[bpi]) });
        bbLowerPoints.push({ x: toX(bpi), y: toY(bbLower[bpi]) });
      }
    }

    // Volume data
    var maxVol = 0;
    for (var vi = 0; vi < volumesArr.length; vi++) {
      if (volumesArr[vi] > maxVol) maxVol = volumesArr[vi];
    }
    var volBarH = drawH * VOL_HEIGHT_RATIO;
    var volBaseY = PADDING_TOP + drawH;

    // RSI series (14 period)
    var rsiSeries = [];
    var RSI_PERIOD = 14;
    if (closes.length > RSI_PERIOD) {
      // Compute RSI for each point from RSI_PERIOD onwards
      var gains = [];
      var losses = [];
      for (var ri2 = 1; ri2 < closes.length; ri2++) {
        var chg = closes[ri2] - closes[ri2 - 1];
        gains.push(chg > 0 ? chg : 0);
        losses.push(chg < 0 ? Math.abs(chg) : 0);
      }
      // First RSI_PERIOD: SMA seed
      var avgGain = 0;
      var avgLoss = 0;
      for (var rk = 0; rk < RSI_PERIOD; rk++) {
        avgGain += gains[rk];
        avgLoss += losses[rk];
      }
      avgGain = avgGain / RSI_PERIOD;
      avgLoss = avgLoss / RSI_PERIOD;
      // Fill nulls for initial period
      for (var rn = 0; rn < RSI_PERIOD; rn++) {
        rsiSeries.push(null);
      }
      // First RSI value
      var rsiVal = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
      rsiSeries.push(rsiVal);
      // Wilder smoothing for rest
      for (var rw = RSI_PERIOD; rw < gains.length; rw++) {
        avgGain = (avgGain * (RSI_PERIOD - 1) + gains[rw]) / RSI_PERIOD;
        avgLoss = (avgLoss * (RSI_PERIOD - 1) + losses[rw]) / RSI_PERIOD;
        var rv = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
        rsiSeries.push(rv);
      }
    }

    // RSI panel coordinates
    var rsiPanelTop = mainHeight + RSI_PAD_TOP;
    var rsiPanelH = RSI_HEIGHT - RSI_PAD_TOP - RSI_PAD_BOTTOM;
    function toRsiY(val) { return rsiPanelTop + (1 - val / 100) * rsiPanelH; }
    var rsiPoints = [];
    for (var rp2 = 0; rp2 < rsiSeries.length; rp2++) {
      if (rsiSeries[rp2] != null) {
        rsiPoints.push({ x: toX(rp2), y: toRsiY(rsiSeries[rp2]), value: rsiSeries[rp2] });
      }
    }

    // Grid Y labels (4 levels)
    var yLabels = [];
    for (var gl = 0; gl <= 3; gl++) {
      var val = minV + (gl / 3) * range;
      yLabels.push({ y: toY(val), label: fmt(val) });
    }

    return {
      pricePoints: pricePoints,
      highPoints: highPoints,
      lowPoints: lowPoints,
      sma20Points: sma20Points,
      sma50Points: sma50Points,
      bbUpperPoints: bbUpperPoints,
      bbLowerPoints: bbLowerPoints,
      bbUpper: bbUpper,
      bbLower: bbLower,
      bbMiddle: bbMiddle,
      rsiSeries: rsiSeries,
      rsiPoints: rsiPoints,
      toRsiY: toRsiY,
      rsiPanelTop: rsiPanelTop,
      rsiPanelH: rsiPanelH,
      volumesArr: volumesArr,
      opensArr: opens,
      maxVol: maxVol,
      volBarH: volBarH,
      volBaseY: volBaseY,
      emUpper: emUpper,
      emLower: emLower,
      minV: minV,
      maxV: maxV,
      range: range,
      drawW: drawW,
      drawH: drawH,
      toX: toX,
      toY: toY,
      yLabels: yLabels,
      closes: closes,
    };
  }, [ohlcv, analysis, strikePrice, mainHeight, chartW, showBB, showEM, showVolume, showRSI, spot, hv, dte]);

  if (!computed) {
    return (
      <View style={{ height: height, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>Dados insuficientes</Text>
      </View>
    );
  }

  var pricePoints = computed.pricePoints;

  function findClosest(touchX) {
    if (pricePoints.length === 0) return null;
    var closest = 0;
    var minDist = Infinity;
    for (var i = 0; i < pricePoints.length; i++) {
      var dist = Math.abs(pricePoints[i].x - touchX);
      if (dist < minDist) {
        minDist = dist;
        closest = i;
      }
    }
    return closest;
  }

  function getX(evt) {
    return evt.nativeEvent.locationX;
  }

  var responderHandlers = {
    onStartShouldSetResponder: function() { return true; },
    onMoveShouldSetResponder: function() { return true; },
    onResponderTerminationRequest: function() { return false; },
    onResponderGrant: function(evt) {
      setTouching(true);
      setActiveIndex(findClosest(getX(evt)));
    },
    onResponderMove: function(evt) {
      setActiveIndex(findClosest(getX(evt)));
    },
    onResponderRelease: function() {
      setTouching(false);
      setTimeout(function() {
        setTouching(function(t) {
          if (!t) setActiveIndex(null);
          return t;
        });
      }, 2000);
    },
    onResponderTerminate: function() {
      setTouching(false);
      setActiveIndex(null);
    },
  };

  // Active point info
  var activePoint = activeIndex != null ? pricePoints[activeIndex] : null;
  var activeSma20 = activeIndex != null && analysis.sma20[activeIndex] != null ? analysis.sma20[activeIndex] : null;
  var activeSma50 = activeIndex != null && analysis.sma50[activeIndex] != null ? analysis.sma50[activeIndex] : null;
  var activeDate = activeIndex != null && ohlcv[activeIndex] ? ohlcv[activeIndex].date : null;
  var activeRSI = activeIndex != null && computed.rsiSeries[activeIndex] != null ? computed.rsiSeries[activeIndex] : null;
  var activeVol = activeIndex != null ? computed.volumesArr[activeIndex] : null;
  var activeBBU = activeIndex != null && computed.bbUpper[activeIndex] != null ? computed.bbUpper[activeIndex] : null;
  var activeBBL = activeIndex != null && computed.bbLower[activeIndex] != null ? computed.bbLower[activeIndex] : null;

  // Paths
  var pricePath = buildPath(pricePoints);
  var sma20Path = computed.sma20Points.length >= 2 ? buildDashedSegments(computed.sma20Points) : '';
  var sma50Path = computed.sma50Points.length >= 2 ? buildDashedSegments(computed.sma50Points) : '';
  var bbAreaPath = showBB ? buildBBAreaPath(computed.bbUpperPoints, computed.bbLowerPoints) : '';
  var rsiPath = showRSI && computed.rsiPoints.length >= 2 ? buildPath(computed.rsiPoints) : '';

  // Volume bar width
  var barW = computed.drawW / (ohlcv.length) * 0.7;
  if (barW < 1) barW = 1;
  if (barW > 8) barW = 8;

  // Format volume
  function fmtVol(v) {
    if (v == null) return '—';
    if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
    if (v >= 1000) return (v / 1000).toFixed(0) + 'K';
    return String(v);
  }

  return (
    <View>
      {/* Legend — tappable toggles handled by parent via onToggle */}
      {!compact ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, paddingLeft: 2, flexWrap: 'wrap' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <View style={{ width: 10, height: 3, backgroundColor: C.rf, borderRadius: 1 }} />
            <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>SMA 20</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <View style={{ width: 10, height: 3, backgroundColor: C.etfs + '80', borderRadius: 1 }} />
            <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>SMA 50</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.green }} />
            <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>Suporte</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.red }} />
            <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>Resistência</Text>
          </View>
          {showBB ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <View style={{ width: 8, height: 6, backgroundColor: C.accent + '35', borderRadius: 2, borderWidth: 1, borderColor: C.accent + '80' }} />
              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>BB</Text>
            </View>
          ) : null}
          {showEM ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <View style={{ width: 8, height: 6, backgroundColor: C.opcoes + '30', borderRadius: 2, borderWidth: 1, borderColor: C.opcoes + '50' }} />
              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>±1σ</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View {...responderHandlers} style={{ width: chartW, height: totalHeight }}>
        <Svg width={chartW} height={totalHeight}>
          {/* ══════ MAIN CHART ══════ */}

          {/* Grid lines + Y labels */}
          {computed.yLabels.map(function(yl, idx) {
            return (
              <G key={'grid-' + idx}>
                <Line x1={PADDING_LEFT} y1={yl.y} x2={chartW - PADDING_RIGHT} y2={yl.y}
                  stroke={C.border} strokeWidth={0.5} />
                <SvgText x={PADDING_LEFT - 4} y={yl.y + 3} fontSize={8} fill={C.dim}
                  fontFamily={F.mono} textAnchor="end">{yl.label}</SvgText>
              </G>
            );
          })}

          {/* Expected Move band (±1σ) */}
          {showEM && computed.emUpper != null ? (
            <Rect
              x={PADDING_LEFT}
              y={computed.toY(computed.emUpper)}
              width={computed.drawW}
              height={Math.abs(computed.toY(computed.emLower) - computed.toY(computed.emUpper))}
              fill={C.opcoes + '18'}
              stroke={C.opcoes + '50'}
              strokeWidth={1}
              strokeDasharray="5,3"
            />
          ) : null}
          {showEM && computed.emUpper != null ? (
            <G>
              <SvgText x={PADDING_LEFT + 2} y={computed.toY(computed.emUpper) + 10}
                fontSize={8} fill={C.opcoes} fontFamily={F.mono} textAnchor="start">
                {'+1σ ' + fmt(computed.emUpper)}
              </SvgText>
              <SvgText x={PADDING_LEFT + 2} y={computed.toY(computed.emLower) - 4}
                fontSize={8} fill={C.opcoes} fontFamily={F.mono} textAnchor="start">
                {'-1σ ' + fmt(computed.emLower)}
              </SvgText>
            </G>
          ) : null}

          {/* Bollinger Bands area */}
          {showBB && bbAreaPath ? (
            <Path d={bbAreaPath} fill={C.accent + '22'} stroke="none" />
          ) : null}
          {showBB && computed.bbUpperPoints.length >= 2 ? (
            <G>
              <Path d={buildDashedSegments(computed.bbUpperPoints)} stroke={C.accent + '80'} strokeWidth={1.3} fill="none" strokeDasharray="5,3" />
              <Path d={buildDashedSegments(computed.bbLowerPoints)} stroke={C.accent + '80'} strokeWidth={1.3} fill="none" strokeDasharray="5,3" />
            </G>
          ) : null}

          {/* Volume bars (behind price) */}
          {showVolume && computed.maxVol > 0 ? (
            <G>
              {ohlcv.map(function(candle, idx) {
                var vol = computed.volumesArr[idx] || 0;
                if (vol <= 0) return null;
                var h = (vol / computed.maxVol) * computed.volBarH;
                if (h < 1) h = 1;
                var x = computed.toX(idx) - barW / 2;
                var y = computed.volBaseY - h;
                var isUp = computed.closes[idx] >= computed.opensArr[idx];
                return (
                  <Rect key={'vol-' + idx} x={x} y={y} width={barW} height={h}
                    fill={isUp ? C.green + '40' : C.red + '40'} />
                );
              })}
            </G>
          ) : null}

          {/* SMA 50 (behind) */}
          {sma50Path ? (
            <Path d={sma50Path} stroke={C.etfs + '70'} strokeWidth={1.8} fill="none"
              strokeDasharray="6,4" />
          ) : null}

          {/* SMA 20 */}
          {sma20Path ? (
            <Path d={sma20Path} stroke={C.rf + '90'} strokeWidth={2} fill="none"
              strokeDasharray="6,4" />
          ) : null}

          {/* High-Low range area (candle wicks) — shows why S/R are where they are */}
          {computed.highPoints.length >= 2 ? (
            <Path d={buildBBAreaPath(computed.highPoints, computed.lowPoints)}
              fill={C.text + '08'} stroke="none" />
          ) : null}

          {/* Price line (closes) */}
          {pricePath ? (
            <Path d={pricePath} stroke={C.text} strokeWidth={1.5} fill="none" />
          ) : null}

          {/* Support lines */}
          {analysis.supports.map(function(sup, idx) {
            var y = computed.toY(sup.price);
            if (y < PADDING_TOP || y > mainHeight - PADDING_BOTTOM) return null;
            return (
              <G key={'sup-' + idx}>
                <Line x1={PADDING_LEFT} y1={y} x2={chartW - PADDING_RIGHT} y2={y}
                  stroke={C.green + '60'} strokeWidth={1} strokeDasharray="6,4" />
                <SvgText x={chartW - PADDING_RIGHT - 2} y={y - 3} fontSize={8}
                  fill={C.green + '90'} fontFamily={F.mono} textAnchor="end">
                  {'S ' + fmt(sup.price)}
                </SvgText>
              </G>
            );
          })}

          {/* Resistance lines */}
          {analysis.resistances.map(function(res, idx) {
            var y = computed.toY(res.price);
            if (y < PADDING_TOP || y > mainHeight - PADDING_BOTTOM) return null;
            return (
              <G key={'res-' + idx}>
                <Line x1={PADDING_LEFT} y1={y} x2={chartW - PADDING_RIGHT} y2={y}
                  stroke={C.red + '60'} strokeWidth={1} strokeDasharray="6,4" />
                <SvgText x={chartW - PADDING_RIGHT - 2} y={y - 3} fontSize={8}
                  fill={C.red + '90'} fontFamily={F.mono} textAnchor="end">
                  {'R ' + fmt(res.price)}
                </SvgText>
              </G>
            );
          })}

          {/* Strike + Spot lines */}
          {(function() {
            var hasStrike = strikePrice && strikePrice > 0;
            var hasSpot = spot && spot > 0;
            var strikeY = hasStrike ? computed.toY(strikePrice) : 0;
            var spotY = hasSpot ? computed.toY(spot) : 0;
            var tooClose = hasStrike && hasSpot && Math.abs(strikeY - spotY) < 14;

            var strikeLabelX = tooClose ? (chartW - PADDING_RIGHT - 2) : (PADDING_LEFT + 2);
            var strikeLabelAnchor = tooClose ? 'end' : 'start';
            var strikeLabelYOff = tooClose ? (strikeY >= spotY ? 10 : -3) : -3;
            var spotLabelX = PADDING_LEFT + 2;
            var spotLabelAnchor = 'start';
            var spotLabelYOff = tooClose ? (spotY >= strikeY ? 10 : -3) : -3;

            return (
              <G>
                {hasStrike ? (
                  <G>
                    <Line x1={PADDING_LEFT} y1={strikeY}
                      x2={chartW - PADDING_RIGHT} y2={strikeY}
                      stroke={C.opcoes + '80'} strokeWidth={1} strokeDasharray="3,3" />
                    <SvgText x={strikeLabelX} y={strikeY + strikeLabelYOff} fontSize={8}
                      fill={C.opcoes} fontFamily={F.mono} textAnchor={strikeLabelAnchor}>
                      {'Strike ' + fmt(strikePrice)}
                    </SvgText>
                  </G>
                ) : null}
                {hasSpot ? (
                  <G>
                    <Line x1={PADDING_LEFT} y1={spotY}
                      x2={chartW - PADDING_RIGHT} y2={spotY}
                      stroke={C.etfs + '60'} strokeWidth={0.8} />
                    <SvgText x={spotLabelX} y={spotY + spotLabelYOff} fontSize={8}
                      fill={C.etfs + '90'} fontFamily={F.mono} textAnchor={spotLabelAnchor}>
                      {'Spot ' + fmt(spot)}
                    </SvgText>
                  </G>
                ) : null}
              </G>
            );
          })()}

          {/* Pivot highs (▼ red triangles) */}
          {!compact ? analysis.pivotHighs.map(function(ph, idx) {
            var px = computed.toX(ph.index);
            var py = computed.toY(ph.price);
            if (py < PADDING_TOP + 4) return null;
            var sz = ph.strength >= 2 ? 5 : 3.5;
            var pts = px + ',' + (py - sz - 2) + ' ' + (px - sz) + ',' + (py - sz - 2 - sz * 1.4) + ' ' + (px + sz) + ',' + (py - sz - 2 - sz * 1.4);
            return (
              <Polygon key={'ph-' + idx} points={pts} fill={C.red + '80'} />
            );
          }) : null}

          {/* Pivot lows (▲ green triangles) */}
          {!compact ? analysis.pivotLows.map(function(pl, idx) {
            var px = computed.toX(pl.index);
            var py = computed.toY(pl.price);
            if (py > mainHeight - PADDING_BOTTOM - 4) return null;
            var sz = pl.strength >= 2 ? 5 : 3.5;
            var pts = px + ',' + (py + sz + 2) + ' ' + (px - sz) + ',' + (py + sz + 2 + sz * 1.4) + ' ' + (px + sz) + ',' + (py + sz + 2 + sz * 1.4);
            return (
              <Polygon key={'pl-' + idx} points={pts} fill={C.green + '80'} />
            );
          }) : null}

          {/* Active cursor (main chart) */}
          {activePoint ? (
            <G>
              <Line x1={activePoint.x} y1={PADDING_TOP} x2={activePoint.x} y2={mainHeight - PADDING_BOTTOM}
                stroke={C.accent + '50'} strokeWidth={1} />
              <Circle cx={activePoint.x} cy={activePoint.y} r={4} fill={C.accent} stroke={C.text} strokeWidth={1} />
              {showBB && activeBBU != null ? (
                <G>
                  <Circle cx={activePoint.x} cy={computed.toY(activeBBU)} r={2} fill={C.accent + '60'} />
                  <Circle cx={activePoint.x} cy={computed.toY(activeBBL)} r={2} fill={C.accent + '60'} />
                </G>
              ) : null}
            </G>
          ) : null}

          {/* ══════ RSI PANEL ══════ */}
          {showRSI ? (
            <G>
              {/* Separator line */}
              <Line x1={PADDING_LEFT} y1={mainHeight} x2={chartW - PADDING_RIGHT} y2={mainHeight}
                stroke={C.border} strokeWidth={0.5} />

              {/* RSI label */}
              <SvgText x={PADDING_LEFT - 4} y={computed.rsiPanelTop + 10} fontSize={8}
                fill={C.dim} fontFamily={F.mono} textAnchor="end">RSI</SvgText>

              {/* Grid: 30 and 70 lines */}
              <Line x1={PADDING_LEFT} y1={computed.toRsiY(70)} x2={chartW - PADDING_RIGHT} y2={computed.toRsiY(70)}
                stroke={C.red + '50'} strokeWidth={0.8} strokeDasharray="4,3" />
              <Line x1={PADDING_LEFT} y1={computed.toRsiY(30)} x2={chartW - PADDING_RIGHT} y2={computed.toRsiY(30)}
                stroke={C.green + '50'} strokeWidth={0.8} strokeDasharray="4,3" />
              <Line x1={PADDING_LEFT} y1={computed.toRsiY(50)} x2={chartW - PADDING_RIGHT} y2={computed.toRsiY(50)}
                stroke={C.border} strokeWidth={0.5} />

              {/* Y labels */}
              <SvgText x={PADDING_LEFT - 4} y={computed.toRsiY(70) + 3} fontSize={8}
                fill={C.red + '80'} fontFamily={F.mono} textAnchor="end">70</SvgText>
              <SvgText x={PADDING_LEFT - 4} y={computed.toRsiY(30) + 3} fontSize={8}
                fill={C.green + '80'} fontFamily={F.mono} textAnchor="end">30</SvgText>

              {/* Overbought zone fill */}
              <Rect x={PADDING_LEFT} y={computed.rsiPanelTop}
                width={computed.drawW} height={computed.toRsiY(70) - computed.rsiPanelTop}
                fill={C.red + '10'} />
              {/* Oversold zone fill */}
              <Rect x={PADDING_LEFT} y={computed.toRsiY(30)}
                width={computed.drawW} height={computed.rsiPanelTop + computed.rsiPanelH - computed.toRsiY(30)}
                fill={C.green + '10'} />

              {/* RSI line */}
              {rsiPath ? (
                <Path d={rsiPath} stroke={C.accent} strokeWidth={1.8} fill="none" />
              ) : null}

              {/* Active cursor on RSI */}
              {activePoint && activeRSI != null ? (
                <G>
                  <Line x1={activePoint.x} y1={computed.rsiPanelTop} x2={activePoint.x}
                    y2={computed.rsiPanelTop + computed.rsiPanelH}
                    stroke={C.accent + '30'} strokeWidth={0.5} />
                  <Circle cx={activePoint.x} cy={computed.toRsiY(activeRSI)} r={3}
                    fill={activeRSI > 70 ? C.red : activeRSI < 30 ? C.green : C.accent}
                    stroke={C.text} strokeWidth={0.5} />
                </G>
              ) : null}
            </G>
          ) : null}
        </Svg>

        {/* Tooltip */}
        {activePoint && activeIndex != null ? (
          <View style={{
            position: 'absolute',
            top: 2,
            left: activePoint.x > chartW / 2 ? PADDING_LEFT : chartW - PADDING_RIGHT - 130,
            backgroundColor: 'rgba(0,0,0,0.88)',
            borderRadius: 6,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderWidth: 1,
            borderColor: C.border,
            minWidth: 110,
          }}>
            {activeDate ? (
              <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono }}>
                {typeof activeDate === 'string' ? activeDate.substring(0, 10) : ''}
              </Text>
            ) : null}
            <Text style={{ fontSize: 10, color: C.text, fontFamily: F.mono, fontWeight: '600' }}>
              {'R$ ' + fmt(activePoint.value)}
            </Text>
            {activeSma20 != null ? (
              <Text style={{ fontSize: 8, color: C.rf, fontFamily: F.mono }}>
                {'SMA20 ' + fmt(activeSma20)}
              </Text>
            ) : null}
            {activeSma50 != null ? (
              <Text style={{ fontSize: 8, color: C.etfs, fontFamily: F.mono }}>
                {'SMA50 ' + fmt(activeSma50)}
              </Text>
            ) : null}
            {showBB && activeBBU != null ? (
              <Text style={{ fontSize: 8, color: C.accent, fontFamily: F.mono }}>
                {'BB ' + fmt(activeBBL) + ' – ' + fmt(activeBBU)}
              </Text>
            ) : null}
            {showRSI && activeRSI != null ? (
              <Text style={{ fontSize: 8, color: activeRSI > 70 ? C.red : activeRSI < 30 ? C.green : C.accent, fontFamily: F.mono }}>
                {'RSI ' + activeRSI.toFixed(1)}
              </Text>
            ) : null}
            {showVolume && activeVol != null ? (
              <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono }}>
                {'Vol ' + fmtVol(activeVol)}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}
