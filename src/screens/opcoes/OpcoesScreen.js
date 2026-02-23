import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, TextInput, Alert, Dimensions, Modal,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import Svg, { Line, Rect, Path, Text as SvgText } from 'react-native-svg';
import { useFocusEffect, useNavigation, useScrollToTop } from '@react-navigation/native';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getOpcoes, getPositions, getSaldos, addOperacao, getAlertasConfig, getIndicators, getProfile, addMovimentacaoComSaldo, addMovimentacao, getSavedAnalyses, addSavedAnalysis, deleteSavedAnalysis } from '../../services/database';
import { enrichPositionsWithPrices, clearPriceCache, fetchPrices } from '../../services/priceService';
import { runDailyCalculation, shouldCalculateToday } from '../../services/indicatorService';
import { supabase } from '../../config/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Glass, Badge, Pill, SectionLabel, Fab, InfoTip } from '../../components';
import { SkeletonOpcoes, EmptyState } from '../../components/States';
import { usePrivacyStyle } from '../../components/Sensitive';
import Sensitive from '../../components/Sensitive';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
var geminiService = require('../../services/geminiService');
var analyzeOption = geminiService.analyzeOption;

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function maskDate(text) {
  var clean = text.replace(/\D/g, '');
  if (clean.length <= 2) return clean;
  if (clean.length <= 4) return clean.slice(0, 2) + '/' + clean.slice(2);
  return clean.slice(0, 2) + '/' + clean.slice(2, 4) + '/' + clean.slice(4, 8);
}

function brToIso(brDate) {
  var parts = brDate.split('/');
  if (parts.length !== 3) return null;
  var day = parts[0]; var month = parts[1]; var year = parts[2];
  if (day.length !== 2 || month.length !== 2 || year.length !== 4) return null;
  return year + '-' + month + '-' + day;
}

function isValidDate(brDate) {
  var iso = brToIso(brDate);
  if (!iso) return false;
  var date = new Date(iso + 'T12:00:00');
  if (isNaN(date.getTime())) return false;
  var day = parseInt(brDate.split('/')[0]);
  var month = parseInt(brDate.split('/')[1]);
  return date.getDate() === day && (date.getMonth() + 1) === month;
}

function todayBr() {
  var d = new Date();
  var dd = String(d.getDate()).padStart(2, '0');
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var yyyy = d.getFullYear();
  return dd + '/' + mm + '/' + yyyy;
}

// ═══════════════════════════════════════
// BLACK-SCHOLES-MERTON MATH (com dividendos)
// ═══════════════════════════════════════
// Todas as funções aceitam q (dividend yield contínuo) como último param opcional (default 0)

// Standard normal CDF (Abramowitz & Stegun approximation)
function normCDF(x) {
  if (x > 10) return 1;
  if (x < -10) return 0;
  var a1 = 0.254829592;
  var a2 = -0.284496736;
  var a3 = 1.421413741;
  var a4 = -1.453152027;
  var a5 = 1.061405429;
  var p = 0.3275911;
  var sign = x < 0 ? -1 : 1;
  var absX = Math.abs(x);
  var t = 1.0 / (1.0 + p * absX);
  var y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);
  return 0.5 * (1.0 + sign * y);
}

// Standard normal PDF
function normPDF(x) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// BSM d1 and d2 (q = dividend yield contínuo, default 0)
function bsD1D2(s, k, t, r, sigma, q) {
  if (t <= 0 || sigma <= 0 || s <= 0 || k <= 0) return { d1: 0, d2: 0 };
  var qVal = q || 0;
  var d1 = (Math.log(s / k) + (r - qVal + sigma * sigma / 2) * t) / (sigma * Math.sqrt(t));
  var d2 = d1 - sigma * Math.sqrt(t);
  return { d1: d1, d2: d2 };
}

// BSM option price (q = dividend yield contínuo, default 0)
function bsPrice(s, k, t, r, sigma, tipo, q) {
  if (t <= 0) {
    if (tipo === 'call') return Math.max(0, s - k);
    return Math.max(0, k - s);
  }
  var qVal = q || 0;
  var dd = bsD1D2(s, k, t, r, sigma, qVal);
  if (tipo === 'call') {
    return s * Math.exp(-qVal * t) * normCDF(dd.d1) - k * Math.exp(-r * t) * normCDF(dd.d2);
  }
  return k * Math.exp(-r * t) * normCDF(-dd.d2) - s * Math.exp(-qVal * t) * normCDF(-dd.d1);
}

// BSM Greeks (q = dividend yield contínuo, default 0)
function bsGreeks(s, k, t, r, sigma, tipo, q) {
  if (s <= 0 || k <= 0 || t <= 0 || sigma <= 0) {
    return { delta: 0, gamma: 0, theta: 0, vega: 0 };
  }
  var qVal = q || 0;
  var dd = bsD1D2(s, k, t, r, sigma, qVal);
  var sqrtT = Math.sqrt(t);
  var expQT = Math.exp(-qVal * t);

  // Delta
  var delta;
  if (tipo === 'call') {
    delta = expQT * normCDF(dd.d1);
  } else {
    delta = expQT * (normCDF(dd.d1) - 1);
  }

  // Gamma (same for call and put)
  var gamma = expQT * normPDF(dd.d1) / (s * sigma * sqrtT);

  // Theta (per day)
  var thetaAnnual;
  if (tipo === 'call') {
    thetaAnnual = -(s * expQT * normPDF(dd.d1) * sigma) / (2 * sqrtT)
      + qVal * s * expQT * normCDF(dd.d1)
      - r * k * Math.exp(-r * t) * normCDF(dd.d2);
  } else {
    thetaAnnual = -(s * expQT * normPDF(dd.d1) * sigma) / (2 * sqrtT)
      - qVal * s * expQT * normCDF(-dd.d1)
      + r * k * Math.exp(-r * t) * normCDF(-dd.d2);
  }
  var theta = thetaAnnual / 365;

  // Vega (per 1% IV change)
  var vega = s * expQT * sqrtT * normPDF(dd.d1) / 100;

  return { delta: delta, gamma: gamma, theta: theta, vega: vega };
}

// Implied Volatility via Newton-Raphson (q = dividend yield, default 0)
function bsIV(s, k, t, r, marketPrice, tipo, q) {
  if (marketPrice <= 0 || s <= 0 || k <= 0 || t <= 0) return 0.35;
  var qVal = q || 0;
  var sigma = 0.30;
  for (var i = 0; i < 20; i++) {
    var price = bsPrice(s, k, t, r, sigma, tipo, qVal);
    var dd = bsD1D2(s, k, t, r, sigma, qVal);
    var vegaVal = s * Math.exp(-qVal * t) * Math.sqrt(t) * normPDF(dd.d1);
    if (vegaVal < 0.0001) break;
    var diff = price - marketPrice;
    sigma = sigma - diff / vegaVal;
    if (sigma < 0.01) { sigma = 0.01; break; }
    if (sigma > 5) { sigma = 5; break; }
    if (Math.abs(diff) < 0.001) break;
  }
  return Math.max(0.01, Math.min(5, sigma));
}

// ═══════════════════════════════════════
// AMERICAN OPTION PRICING (aproximação)
// ═══════════════════════════════════════

function bsPriceAmerican(s, k, t, r, sigma, tipo, q) {
  var qVal = q || 0;
  var euroPrice = bsPrice(s, k, t, r, sigma, tipo, qVal);
  if (t <= 0 || sigma <= 0 || s <= 0 || k <= 0) return euroPrice;

  // American call sem dividendos = europeia (sem prêmio de exercício antecipado)
  // Com dividendos: pequeno prêmio para ITM calls
  if (tipo === 'call') {
    if (qVal <= 0) return euroPrice;
    // Aproximação: blend entre europeia e intrínseco para deep ITM com dividendos
    var callIntrinsic = Math.max(0, s - k);
    if (callIntrinsic > 0 && s > k * 1.05) {
      var earlyPremium = callIntrinsic * qVal * t * 0.5;
      return Math.max(euroPrice, euroPrice + earlyPremium);
    }
    return euroPrice;
  }

  // Para puts: aproximação quadrática (early exercise premium)
  var intrinsic = Math.max(0, k - s);
  if (intrinsic <= euroPrice) return euroPrice;

  // Deep ITM put: blend em direção ao intrínseco
  var moneyness = k / s;
  var correction = 0;
  if (moneyness > 1.0) {
    correction = (intrinsic - euroPrice) * (1 - Math.exp(-r * t)) * Math.min(1, (moneyness - 1) * 5);
  }

  return Math.max(euroPrice, Math.max(intrinsic, euroPrice + correction));
}

// ═══════════════════════════════════════
// CADEIA: STRIKE STEP, IV SKEW, BID/ASK
// ═══════════════════════════════════════

// Blue chips BR com liquidez alta em opções (step R$0.50 mesmo acima de R$15)
var LIQUID_TICKERS = {
  'PETR4': true, 'VALE3': true, 'BBDC4': true, 'ITUB4': true,
  'BBAS3': true, 'B3SA3': true, 'ABEV3': true, 'WEGE3': true,
  'RENT3': true, 'SUZB3': true, 'PETR3': true, 'ITSA4': true,
  'GGBR4': true, 'CSNA3': true, 'BPAC11': true, 'MGLU3': true,
};

function getB3StrikeStep(spotVal, ticker) {
  // Blue chips mantêm step R$0.50 mesmo com spot > R$15
  var isLiquid = ticker && LIQUID_TICKERS[ticker.toUpperCase()];
  if (isLiquid) return 0.50;
  if (spotVal < 15) return 0.50;
  if (spotVal < 50) return 1.00;
  if (spotVal < 100) return 2.00;
  return 5.00;
}

// IV Skew/Smile: quadrática + left-skew (puts OTM mais caras)
function applyIVSkew(baseIV, strike, spot, skewStrength) {
  if (!skewStrength || skewStrength <= 0 || spot <= 0) return baseIV;
  var moneyness = (strike - spot) / spot;
  // Smile (ambas as pontas para cima)
  var smile = 0.8 * skewStrength * moneyness * moneyness;
  // Left-skew (puts OTM mais caras — padrão mercado de ações)
  var leftSkew = 0;
  if (moneyness < 0) {
    leftSkew = 0.3 * skewStrength * Math.abs(moneyness);
  }
  return baseIV * (1 + smile + leftSkew);
}

// Bid/Ask simulado com spread realista
function simulateBidAsk(theoPrice, spot, strike) {
  if (theoPrice <= 0) return { bid: 0, ask: 0, mid: 0, spread: 0 };
  // Spread base: 2% do teórico (mínimo R$0.01)
  var baseSpread = Math.max(0.01, theoPrice * 0.02);
  // Fator OTM: spread alarga para opções longe do spot
  var otmFactor = 1.0;
  var dist = spot > 0 ? Math.abs(spot - strike) / spot : 0;
  if (dist > 0.10) otmFactor = 1.5;
  if (dist > 0.20) otmFactor = 2.5;
  if (theoPrice < 0.10) otmFactor = Math.max(otmFactor, 3);
  var halfSpread = (baseSpread * otmFactor) / 2;
  var bid = Math.max(0.01, theoPrice - halfSpread); // piso B3: R$0.01
  var ask = theoPrice + halfSpread;
  return { bid: bid, ask: ask, mid: theoPrice, spread: ask - bid };
}

// ═══════════════════════════════════════
// CALC GREEKS FOR AN OPTION
// ═══════════════════════════════════════
function calcGreeks(op, spot, selicRate) {
  var s = spot || op.strike || 0;
  var k = op.strike || 0;
  var p = op.premio || 0;
  var daysLeft = Math.max(1, Math.ceil((new Date(op.vencimento) - new Date()) / (1000 * 60 * 60 * 24)));
  var t = daysLeft / 365;
  var r = (selicRate || 13.25) / 100;
  var tipo = (op.tipo || 'call').toLowerCase();

  if (s <= 0 || k <= 0) return { delta: 0, gamma: 0, theta: 0, vega: 0, iv: 0, daysLeft: daysLeft };

  // Compute IV from market premium
  var iv = bsIV(s, k, t, r, p, tipo);
  var greeks = bsGreeks(s, k, t, r, iv, tipo);

  return {
    delta: greeks.delta,
    gamma: greeks.gamma,
    theta: greeks.theta,
    vega: greeks.vega,
    iv: iv * 100,
    daysLeft: daysLeft,
  };
}

// ═══════════════════════════════════════
// MONEYNESS HELPER
// ═══════════════════════════════════════
function getMoneyness(tipo, direcao, strike, spot) {
  if (!spot || spot <= 0 || !strike || strike <= 0) return null;
  var diff = ((spot - strike) / strike) * 100;
  var absDiff = Math.abs(diff);
  var distText = absDiff.toFixed(1) + '% ' + (spot > strike ? 'acima' : 'abaixo');

  if (absDiff < 1) {
    return { label: 'ATM', color: C.yellow, text: 'Strike R$ ' + fmt(strike) + ' . ' + distText };
  }

  var isCall = (tipo || 'call').toLowerCase() === 'call';
  var itm;
  if (isCall) {
    itm = spot > strike;
  } else {
    itm = spot < strike;
  }

  // Para venda/lancamento: vendedor quer OTM (verde), ITM eh ruim (vermelho)
  // Para compra: comprador quer ITM (verde), OTM eh ruim (vermelho)
  var isLanc = direcao === 'lancamento' || direcao === 'venda';
  var label;
  var color;
  if (itm) {
    label = 'ITM';
    color = isLanc ? C.red : C.green;
  } else {
    label = 'OTM';
    color = isLanc ? C.green : C.red;
  }

  return { label: label, color: color, text: 'Strike R$ ' + fmt(strike) + ' . ' + distText };
}

// ═══════════════════════════════════════
// PAYOFF CHART
// ═══════════════════════════════════════
var CHART_H = 200;

function PayoffChart(props) {
  var ps = usePrivacyStyle();
  var spotPrice = props.spotPrice || 0;
  var chartWidth = props.chartWidth || (Dimensions.get('window').width - 72);

  var _touchX = useState(null); var touchX = _touchX[0]; var setTouchX = _touchX[1];

  // Build legs array — backward-compat: if no legs prop, build from single-leg props
  var legsArr = props.legs || null;
  if (!legsArr) {
    legsArr = [{
      tipo: (props.tipo || 'call').toLowerCase(),
      direcao: props.direcao || 'venda',
      strike: props.strike || 0,
      premio: props.premio || 0,
      qty: props.quantidade || 1,
    }];
  }

  // Compute range from all strikes
  var allStrikes = [];
  for (var si = 0; si < legsArr.length; si++) {
    var sk = parseFloat(legsArr[si].strike) || 0;
    if (sk > 0) allStrikes.push(sk);
  }
  if (allStrikes.length === 0) allStrikes.push(spotPrice || 30);
  var minStrike = allStrikes[0];
  var maxStrike = allStrikes[0];
  for (var ski = 1; ski < allStrikes.length; ski++) {
    if (allStrikes[ski] < minStrike) minStrike = allStrikes[ski];
    if (allStrikes[ski] > maxStrike) maxStrike = allStrikes[ski];
  }
  var rangeCenter = (minStrike + maxStrike) / 2;
  var rangeSpan = Math.max(maxStrike - minStrike, rangeCenter * 0.3);
  var rangeMin = rangeCenter - rangeSpan * 1.2;
  var rangeMax = rangeCenter + rangeSpan * 1.2;
  if (rangeMin < 0) rangeMin = 0;
  var numPoints = 80;
  var step = (rangeMax - rangeMin) / numPoints;

  // Aggregated P&L: sum across all legs
  function calcPL(price) {
    var totalPL = 0;
    for (var li = 0; li < legsArr.length; li++) {
      var leg = legsArr[li];
      var tipoL = (leg.tipo || 'call').toLowerCase();
      var strikeL = parseFloat(leg.strike) || 0;
      var premioL = parseFloat(leg.premio) || 0;
      var qtyL = parseFloat(leg.qty || leg.quantidade) || 1;
      var isVendaL = leg.direcao === 'venda' || leg.direcao === 'lancamento';
      var intrinsic;
      if (tipoL === 'call') {
        intrinsic = Math.max(0, price - strikeL);
      } else {
        intrinsic = Math.max(0, strikeL - price);
      }
      if (isVendaL) {
        totalPL = totalPL + (premioL - intrinsic) * qtyL;
      } else {
        totalPL = totalPL + (intrinsic - premioL) * qtyL;
      }
    }
    return totalPL;
  }

  // Build data points
  var points = [];
  var minPL = Infinity;
  var maxPL = -Infinity;
  for (var i = 0; i <= numPoints; i++) {
    var px = rangeMin + step * i;
    var pl = calcPL(px);
    points.push({ x: px, y: pl });
    if (pl < minPL) minPL = pl;
    if (pl > maxPL) maxPL = pl;
  }

  // Find breakeven points (zero-crossings)
  var breakevenPoints = [];
  for (var bi = 1; bi < points.length; bi++) {
    var prev = points[bi - 1];
    var curr = points[bi];
    if ((prev.y >= 0 && curr.y < 0) || (prev.y < 0 && curr.y >= 0)) {
      var fraction = Math.abs(prev.y) / (Math.abs(prev.y) + Math.abs(curr.y));
      var bePrice = prev.x + fraction * (curr.x - prev.x);
      breakevenPoints.push(bePrice);
    }
  }

  // Padding for Y axis
  var yPad = Math.max(Math.abs(maxPL), Math.abs(minPL)) * 0.15 || 10;
  var yMin = minPL - yPad;
  var yMax = maxPL + yPad;
  if (yMin === yMax) { yMin = yMin - 10; yMax = yMax + 10; }

  // Chart area
  var padL = 50;
  var padR = 10;
  var padT = 20;
  var padB = 30;
  var w = chartWidth - padL - padR;
  var h = CHART_H - padT - padB;

  function toX(price) { return padL + (price - rangeMin) / (rangeMax - rangeMin) * w; }
  function toY(val) { return padT + (1 - (val - yMin) / (yMax - yMin)) * h; }

  // Build path with split fill
  var zeroY = toY(0);
  var clampedZeroY = Math.max(padT, Math.min(padT + h, zeroY));

  // Line path
  var linePath = '';
  for (var li2 = 0; li2 < points.length; li2++) {
    var lx = toX(points[li2].x);
    var ly = toY(points[li2].y);
    if (li2 === 0) {
      linePath = linePath + 'M' + lx.toFixed(1) + ',' + ly.toFixed(1);
    } else {
      linePath = linePath + ' L' + lx.toFixed(1) + ',' + ly.toFixed(1);
    }
  }

  // Green fill (above zero) and Red fill (below zero)
  var greenPath = '';
  var redPath = '';
  for (var fi = 0; fi < points.length; fi++) {
    var fx = toX(points[fi].x);
    var fy = toY(points[fi].y);
    var clampedGreen = Math.min(fy, clampedZeroY);
    var clampedRed = Math.max(fy, clampedZeroY);
    if (fi === 0) {
      greenPath = 'M' + fx.toFixed(1) + ',' + clampedZeroY.toFixed(1);
      redPath = 'M' + fx.toFixed(1) + ',' + clampedZeroY.toFixed(1);
    }
    greenPath = greenPath + ' L' + fx.toFixed(1) + ',' + clampedGreen.toFixed(1);
    redPath = redPath + ' L' + fx.toFixed(1) + ',' + clampedRed.toFixed(1);
  }
  var lastFx = toX(points[points.length - 1].x);
  greenPath = greenPath + ' L' + lastFx.toFixed(1) + ',' + clampedZeroY.toFixed(1) + ' Z';
  redPath = redPath + ' L' + lastFx.toFixed(1) + ',' + clampedZeroY.toFixed(1) + ' Z';

  var spotX = toX(spotPrice);

  // Touch handling
  function handleTouch(evt) {
    var touch = evt.nativeEvent;
    var tx = touch.locationX;
    if (tx >= padL && tx <= padL + w) {
      setTouchX(tx);
    }
  }

  var touchInfo = null;
  if (touchX !== null) {
    var tPrice = rangeMin + (touchX - padL) / w * (rangeMax - rangeMin);
    var tPL = calcPL(tPrice);
    touchInfo = { price: tPrice, pl: tPL, x: touchX, y: toY(tPL) };
  }

  // Y axis labels
  var yLabels = [];
  var ySteps = 4;
  for (var yi = 0; yi <= ySteps; yi++) {
    var yVal = yMin + (yMax - yMin) * (yi / ySteps);
    yLabels.push({ val: yVal, y: toY(yVal) });
  }

  // X axis labels
  var xLabels = [];
  var xSteps = 4;
  for (var xi = 0; xi <= xSteps; xi++) {
    var xVal = rangeMin + (rangeMax - rangeMin) * (xi / xSteps);
    xLabels.push({ val: xVal, x: toX(xVal) });
  }

  // Max profit/loss from actual data points
  var maxProfitLabel = maxPL > 0 ? 'Max +R$' + fmt(maxPL) : '+R$0';
  var maxLossLabel = minPL < 0 ? 'Max -R$' + fmt(Math.abs(minPL)) : '-R$0';

  return (
    <View style={styles.payoffContainer}>
      <Sensitive>
      <View
        onTouchStart={handleTouch}
        onTouchMove={handleTouch}
        onTouchEnd={function() { setTouchX(null); }}
      >
        <Svg width={chartWidth} height={CHART_H}>
          <Path d={greenPath} fill="rgba(34,197,94,0.12)" />
          <Path d={redPath} fill="rgba(239,68,68,0.12)" />
          <Line x1={padL} y1={clampedZeroY} x2={padL + w} y2={clampedZeroY}
            stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
          <Path d={linePath} fill="none" stroke={C.opcoes} strokeWidth={2} />

          {/* Breakeven lines (all zero-crossings) */}
          {breakevenPoints.map(function(bep, beIdx) {
            var bx = toX(bep);
            if (bep < rangeMin || bep > rangeMax) return null;
            return (
              <React.Fragment key={'be' + beIdx}>
                <Line x1={bx} y1={padT} x2={bx} y2={padT + h}
                  stroke={C.yellow} strokeWidth={1} strokeDasharray="4,3" />
                <SvgText x={bx} y={padT - 4} fill={C.yellow}
                  fontSize={8} fontFamily={F.mono} textAnchor="middle">
                  {'BE ' + fmt(bep)}
                </SvgText>
              </React.Fragment>
            );
          })}

          {/* Spot line */}
          {spotPrice >= rangeMin && spotPrice <= rangeMax ? (
            <React.Fragment>
              <Line x1={spotX} y1={padT} x2={spotX} y2={padT + h}
                stroke={C.accent} strokeWidth={1} strokeDasharray="2,3" />
              <SvgText x={spotX} y={padT + h + 12} fill={C.accent}
                fontSize={8} fontFamily={F.mono} textAnchor="middle">
                {'Spot ' + fmt(spotPrice)}
              </SvgText>
            </React.Fragment>
          ) : null}

          {yLabels.map(function(yl, yi2) {
            return (
              <SvgText key={'y' + yi2} x={padL - 4} y={yl.y + 3} fill={C.dim}
                fontSize={8} fontFamily={F.mono} textAnchor="end">
                {(yl.val >= 0 ? '+' : '') + fmt(Math.round(yl.val))}
              </SvgText>
            );
          })}

          {xLabels.map(function(xl, xi2) {
            return (
              <SvgText key={'x' + xi2} x={xl.x} y={padT + h + 12} fill={C.dim}
                fontSize={8} fontFamily={F.mono} textAnchor="middle">
                {fmt(xl.val)}
              </SvgText>
            );
          })}

          {touchInfo ? (
            <React.Fragment>
              <Line x1={touchInfo.x} y1={padT} x2={touchInfo.x} y2={padT + h}
                stroke="rgba(255,255,255,0.3)" strokeWidth={1} />
              <Rect x={touchInfo.x - 1.5} y={touchInfo.y - 1.5} width={5} height={5}
                rx={2.5} fill={C.text} />
            </React.Fragment>
          ) : null}
        </Svg>

        {touchInfo ? (
          <View style={[styles.payoffTooltip, {
            left: Math.min(touchInfo.x, chartWidth - 100),
            top: 4,
          }]}>
            <Text maxFontSizeMultiplier={1.5} style={[{ fontSize: 11, color: C.sub, fontFamily: F.mono }, ps]}>
              {'Ativo R$ ' + fmt(touchInfo.price)}
            </Text>
            <Text maxFontSizeMultiplier={1.5} style={[{ fontSize: 12, fontWeight: '700', fontFamily: F.mono,
              color: touchInfo.pl >= 0 ? C.green : C.red }, ps]}>
              {'P&L ' + (touchInfo.pl >= 0 ? '+' : '') + 'R$ ' + fmt(touchInfo.pl)}
            </Text>
          </View>
        ) : null}
      </View>
      </Sensitive>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        <Text style={[{ fontSize: 11, color: C.green, fontFamily: F.mono }, ps]}>
          {maxProfitLabel}
        </Text>
        <Text style={[{ fontSize: 11, color: C.red, fontFamily: F.mono }, ps]}>
          {maxLossLabel}
        </Text>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════
// OPTION CARD
// ═══════════════════════════════════════
var OpCard = React.memo(function OpCard(props) {
  var ps = usePrivacyStyle();
  var op = props.op;
  var positions = props.positions || [];
  var saldos = props.saldos || [];
  var indicatorsMap = props.indicators || {};
  var cardSelicRate = props.selicRate || 13.25;
  var setInfoModal = props.setInfoModal;
  var onEdit = props.onEdit;
  var onDelete = props.onDelete;
  var onClose = props.onClose;

  var _showClose = useState(false); var showClose = _showClose[0]; var setShowClose = _showClose[1];
  var _premRecompra = useState(''); var premRecompra = _premRecompra[0]; var setPremRecompra = _premRecompra[1];
  var _dataFechamento = useState(todayBr()); var dataFechamento = _dataFechamento[0]; var setDataFechamento = _dataFechamento[1];
  var _qtyFechamento = useState(String(op.quantidade || 0)); var qtyFechamento = _qtyFechamento[0]; var setQtyFechamento = _qtyFechamento[1];
  var _showPayoff = useState(false); var showPayoff = _showPayoff[0]; var setShowPayoff = _showPayoff[1];
  var dataFechamentoValid = dataFechamento.length === 10 && isValidDate(dataFechamento);
  var qtyFechamentoVal = parseInt(qtyFechamento) || 0;
  var qtyFechamentoValid = qtyFechamentoVal > 0 && qtyFechamentoVal <= (op.quantidade || 0);

  var tipoLabel = (op.tipo || 'call').toUpperCase();
  var isVenda = op.direcao === 'lancamento' || op.direcao === 'venda';
  var premTotal = (op.premio || 0) * (op.quantidade || 0);
  var daysLeft = Math.max(0, Math.ceil((new Date(op.vencimento) - new Date()) / (1000 * 60 * 60 * 24)));

  // Cobertura: CALL = acoes na mesma corretora, PUT = saldo na mesma corretora
  var cobertura = '';
  var coberturaColor = C.green;
  var coberturaDetail = '';

  if (tipoLabel === 'CALL' && isVenda) {
    // CALL vendida: checar acoes por corretora via por_corretora
    var posForAsset = null;
    for (var ci = 0; ci < positions.length; ci++) {
      if (positions[ci].ticker === op.ativo_base) {
        posForAsset = positions[ci];
        break;
      }
    }

    var qtyCorretora = 0;
    var qtyTotal = 0;
    if (posForAsset) {
      qtyTotal = posForAsset.quantidade || 0;
      if (posForAsset.por_corretora && op.corretora) {
        qtyCorretora = posForAsset.por_corretora[op.corretora] || 0;
      }
    }

    if (qtyCorretora >= (op.quantidade || 0)) {
      cobertura = 'COBERTA';
      coberturaColor = C.green;
      coberturaDetail = qtyCorretora + ' ações ' + op.corretora;
    } else if (qtyCorretora > 0) {
      cobertura = 'PARCIAL';
      coberturaColor = C.yellow;
      coberturaDetail = 'Tem ' + qtyCorretora + '/' + (op.quantidade || 0) + ' ' + op.corretora;
    } else if (qtyTotal >= (op.quantidade || 0)) {
      cobertura = 'COBERTA*';
      coberturaColor = C.yellow;
      coberturaDetail = qtyTotal + ' ações outra corretora';
    } else {
      cobertura = 'DESCOBERTA';
      coberturaColor = C.red;
      coberturaDetail = 'Sem ' + op.ativo_base + ' ' + (op.corretora || 'nenhuma corretora');
    }
  } else if (tipoLabel === 'PUT' && isVenda) {
    // PUT vendida (CSP): precisa ter saldo >= strike * qty na mesma corretora
    var custoExercicio = (op.strike || 0) * (op.quantidade || 0);
    var saldoMatch = null;
    for (var si = 0; si < saldos.length; si++) {
      if (saldos[si].corretora === op.corretora) {
        saldoMatch = saldos[si];
        break;
      }
    }
    var saldoVal = saldoMatch ? (saldoMatch.saldo || 0) : 0;

    if (saldoMatch && saldoVal >= custoExercicio) {
      cobertura = 'CSP';
      coberturaColor = C.green;
      coberturaDetail = 'Saldo R$ ' + fmt(saldoVal) + ' ' + op.corretora + ' (precisa R$ ' + fmt(custoExercicio) + ')';
    } else if (saldoMatch) {
      cobertura = 'CSP PARCIAL';
      coberturaColor = C.yellow;
      coberturaDetail = 'Saldo R$ ' + fmt(saldoVal) + '/' + fmt(custoExercicio) + ' ' + op.corretora;
    } else {
      cobertura = 'DESCOBERTA';
      coberturaColor = C.red;
      coberturaDetail = 'Sem saldo ' + (op.corretora || 'nenhuma corretora') + ' (precisa R$ ' + fmt(custoExercicio) + ')';
    }
  } else if (isVenda) {
    cobertura = 'VENDA';
    coberturaColor = C.opcoes;
  } else {
    cobertura = 'COMPRA';
    coberturaColor = C.accent;
  }

  // Gregas + spot
  var spotPrice = 0;
  var matchPos = positions.find(function(p) { return p.ticker === op.ativo_base; });
  if (matchPos) spotPrice = matchPos.preco_atual || matchPos.pm || 0;
  var greeks = calcGreeks(op, spotPrice, cardSelicRate);

  // Moneyness
  var moneyness = getMoneyness(op.tipo, op.direcao, op.strike, spotPrice);

  // Encerramento P&L
  var recompraVal = parseFloat(premRecompra) || 0;
  var closePL = 0;
  if (recompraVal > 0 && qtyFechamentoVal > 0) {
    if (op.direcao === 'lancamento' || op.direcao === 'venda') {
      closePL = ((op.premio || 0) - recompraVal) * qtyFechamentoVal;
    } else {
      closePL = (recompraVal - (op.premio || 0)) * qtyFechamentoVal;
    }
  }

  // Day urgency
  var dayColor = daysLeft <= 7 ? C.red : daysLeft <= 21 ? C.etfs : C.opcoes;

  return (
    <Glass padding={14} style={{
      backgroundColor: coberturaColor + '04',
      borderColor: coberturaColor + '12',
      borderWidth: 1,
    }}>
      {/* Header: ticker + type + cobertura + moneyness + qty + premium */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <Text style={styles.opTicker}>{op.ativo_base}</Text>
          <Badge text={tipoLabel} color={tipoLabel === 'CALL' ? C.green : C.red} />
          <Badge text={isVenda ? 'VENDA' : 'COMPRA'} color={isVenda ? C.etfs : C.rf} />
          <Badge text={cobertura} color={coberturaColor} />
          {moneyness ? <Badge text={moneyness.label} color={moneyness.color} /> : null}
          <Badge text={daysLeft + 'd'} color={dayColor} />
          <Badge text={(op.quantidade || 0) + 'x'} color={C.accent} />
        </View>
      </View>
      {/* Corretora */}
      {op.corretora ? (
        <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.body, marginBottom: 4 }}>{op.corretora}</Text>
      ) : null}
      {/* Premio: unitario + total */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>PREMIO</Text>
        <Text style={[{ fontSize: 11, color: C.sub, fontFamily: F.mono }, ps]}>
          {'R$ ' + fmt(op.premio || 0) + ' x ' + (op.quantidade || 0)}
        </Text>
        <Text style={[{ fontSize: 13, fontWeight: '800', color: C.green, fontFamily: F.display }, ps]}>
          {'= R$ ' + fmt(premTotal)}
        </Text>
      </View>

      {/* Option code + moneyness text + cobertura detail */}
      {op.ticker_opcao ? (
        <Text style={styles.opCode}>{op.ticker_opcao}</Text>
      ) : null}
      {moneyness ? (
        <Text style={[{ fontSize: 11, color: moneyness.color, fontFamily: F.mono, marginBottom: 2 }, ps]}>{moneyness.text}</Text>
      ) : null}
      {coberturaDetail ? (
        <Text style={[{ fontSize: 11, color: coberturaColor, fontFamily: F.mono, marginBottom: 4 }, ps]}>{coberturaDetail}</Text>
      ) : null}

      {/* Greeks row */}
      <View style={styles.greeksRow}>
        {[
          { l: 'Spot', v: spotPrice > 0 ? 'R$ ' + fmt(spotPrice) : '–' },
          { l: 'Delta', v: greeks.delta.toFixed(2) },
          { l: 'Theta', v: (greeks.theta * (op.quantidade || 1) >= 0 ? '+' : '') + 'R$ ' + fmt(greeks.theta * (op.quantidade || 1)) + '/d' },
          { l: 'VI', v: greeks.iv.toFixed(0) + '%' },
        ].map(function(g, i) {
          return (
            <View key={i} style={{ alignItems: 'center', flex: 1 }}>
              <Text style={styles.greekLabel}>{g.l}</Text>
              <Text style={[styles.greekValue, ps]}>{g.v}</Text>
            </View>
          );
        })}
      </View>

      {/* HV vs IV line */}
      {(function() {
        var ind = indicatorsMap[op.ativo_base];
        var hv = ind && ind.hv_20 != null ? ind.hv_20 : null;
        if (hv == null) return null;
        var iv = greeks.iv;
        var ratio = iv > 0 && hv > 0 ? iv / hv : null;
        var ivLabel = null;
        var ivColor = C.dim;
        var ivGlow = false;
        if (ratio != null && ratio >= 1.3) {
          ivLabel = 'VI ALTA';
          ivColor = C.red;
          ivGlow = true;
        } else if (ratio != null && ratio <= 0.7) {
          ivLabel = 'VI BAIXA';
          ivColor = C.green;
          ivGlow = true;
        }
        return (
          <View style={[
            { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 6 },
            ivGlow && { backgroundColor: ivColor + '0A', borderWidth: 1, borderColor: ivColor + '18' },
          ]}>
            <Text style={[{ fontSize: 11, color: C.sub, fontFamily: F.mono }, ps]}>
              {'HV: ' + hv.toFixed(0) + '%'}
            </Text>
            <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.mono }}>|</Text>
            <Text style={[
              { fontSize: 11, fontFamily: F.mono },
              ivGlow ? { color: ivColor, fontWeight: '700' } : { color: C.sub },
              ps,
            ]}>
              {'VI: ' + iv.toFixed(0) + '%'}
            </Text>
            {ivLabel ? <Badge text={ivLabel} color={ivColor} /> : null}
            <TouchableOpacity onPress={function() { setInfoModal({ title: 'HV / VI', text: 'HV = volatilidade histórica 20d. VI = volatilidade implícita. VI > 130% HV = prêmio caro (venda favorecida). VI < 70% HV = prêmio barato (compra favorecida).' }); }}>
              <Text style={{ fontSize: 13, color: C.accent }}>ⓘ</Text>
            </TouchableOpacity>
          </View>
        );
      })()}

      {/* Bottom: actions */}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 8 }}>
        <View style={{ flexDirection: 'row', gap: 14 }}>
          <TouchableOpacity onPress={function() { setShowPayoff(!showPayoff); }}>
            <Text style={[styles.actionLink, { color: C.opcoes }]}>Payoff</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={function() { setShowClose(!showClose); }}>
            <Text style={[styles.actionLink, { color: C.yellow }]}>Encerrar</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onEdit}>
            <Text style={styles.actionLink}>Editar</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete}>
            <Text style={[styles.actionLink, { color: C.red }]}>Excluir</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Payoff chart */}
      {showPayoff ? (
        <PayoffChart
          tipo={op.tipo}
          direcao={op.direcao}
          strike={op.strike}
          premio={op.premio}
          quantidade={op.quantidade}
          spotPrice={spotPrice}
        />
      ) : null}

      {/* Encerramento panel */}
      {showClose ? (
        <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
          {op.ticker_opcao ? (
            <Text style={{ fontSize: 12, color: C.opcoes, fontFamily: F.mono, marginBottom: 6 }}>{op.ticker_opcao}</Text>
          ) : null}
          <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginBottom: 4 }}>PRÊMIO RECOMPRA (R$)</Text>
          <TextInput
            value={premRecompra}
            onChangeText={setPremRecompra}
            placeholder="0.00"
            placeholderTextColor={C.dim}
            keyboardType="decimal-pad"
            style={{
              backgroundColor: C.cardSolid, borderWidth: 1, borderColor: C.border,
              borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
              fontSize: 15, color: C.text, fontFamily: F.body,
            }}
          />
          <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginBottom: 4, marginTop: 10 }}>QUANTIDADE</Text>
          <TextInput
            value={qtyFechamento}
            onChangeText={function(t) { setQtyFechamento(t.replace(/\D/g, '')); }}
            placeholder={String(op.quantidade || 0)}
            placeholderTextColor={C.dim}
            keyboardType="number-pad"
            style={[
              {
                backgroundColor: C.cardSolid, borderWidth: 1, borderColor: C.border,
                borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
                fontSize: 15, color: C.text, fontFamily: F.body,
              },
              qtyFechamentoValid && { borderColor: C.green },
              qtyFechamento.length > 0 && !qtyFechamentoValid && { borderColor: C.red },
            ]}
          />
          {qtyFechamento.length > 0 && !qtyFechamentoValid ? (
            <Text style={{ fontSize: 11, color: C.red, fontFamily: F.body, marginTop: 2 }}>
              {qtyFechamentoVal > (op.quantidade || 0) ? 'Máximo: ' + (op.quantidade || 0) : 'Quantidade inválida'}
            </Text>
          ) : null}
          <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginBottom: 4, marginTop: 10 }}>DATA DO ENCERRAMENTO</Text>
          <TextInput
            value={dataFechamento}
            onChangeText={function(t) { setDataFechamento(maskDate(t)); }}
            placeholder="DD/MM/AAAA"
            placeholderTextColor={C.dim}
            keyboardType="number-pad"
            maxLength={10}
            style={[
              {
                backgroundColor: C.cardSolid, borderWidth: 1, borderColor: C.border,
                borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
                fontSize: 15, color: C.text, fontFamily: F.body,
              },
              dataFechamento.length === 10 && dataFechamentoValid && { borderColor: C.green },
              dataFechamento.length === 10 && !dataFechamentoValid && { borderColor: C.red },
            ]}
          />
          {dataFechamento.length === 10 && !dataFechamentoValid ? (
            <Text style={{ fontSize: 11, color: C.red, fontFamily: F.body, marginTop: 2 }}>Data inválida</Text>
          ) : null}
          {recompraVal > 0 && qtyFechamentoValid ? (function() {
            var recompraTotal = recompraVal * qtyFechamentoVal;
            var premTotalClose = (op.premio || 0) * qtyFechamentoVal;
            var closePLPct = premTotalClose > 0 ? (closePL / premTotalClose) * 100 : 0;
            return (
              <View style={{ marginTop: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>RECOMPRA TOTAL</Text>
                  <Text style={[{ fontSize: 13, fontWeight: '700', color: C.red, fontFamily: F.mono }, ps]}>
                    {'R$ ' + fmt(recompraTotal)}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>P&L DO ENCERRAMENTO</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[{ fontSize: 16, fontWeight: '800', color: closePL >= 0 ? C.green : C.red, fontFamily: F.display }, ps]}>
                      {(closePL >= 0 ? '+' : '') + 'R$ ' + fmt(closePL)}
                    </Text>
                    <Text style={[{ fontSize: 12, fontWeight: '600', color: closePL >= 0 ? C.green : C.red, fontFamily: F.mono }, ps]}>
                      {'(' + (closePLPct >= 0 ? '+' : '') + closePLPct.toFixed(1) + '%)'}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })() : null}
          <TouchableOpacity
            onPress={function() {
              if (recompraVal <= 0 || !dataFechamentoValid || !qtyFechamentoValid) return;
              if (onClose) onClose(op.id, recompraVal, closePL, brToIso(dataFechamento), qtyFechamentoVal);
            }}
            disabled={recompraVal <= 0 || !dataFechamentoValid || !qtyFechamentoValid}
            style={{
              backgroundColor: recompraVal > 0 && dataFechamentoValid && qtyFechamentoValid ? C.yellow : C.dim,
              borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 8,
              opacity: recompraVal > 0 && dataFechamentoValid && qtyFechamentoValid ? 1 : 0.4,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#000', fontFamily: F.display }}>Confirmar encerramento</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </Glass>
  );
});

// ═══════════════════════════════════════
// SIMULADOR BLACK-SCHOLES
// ═══════════════════════════════════════
var TUTORIAL_STEPS = [
  {
    title: 'O que são Opções?',
    icon: 'bulb-outline',
    text: 'Opções são contratos que dão o direito (mas não a obrigação) de comprar ou vender um ativo a um preço fixo até uma data.\n\nQuem VENDE a opção recebe um prêmio e assume a obrigação. Quem COMPRA paga o prêmio e tem o direito.\n\nNa B3, cada contrato equivale a 100 opções. Ex: 200 opções = 2 contratos.',
  },
  {
    title: 'CALL vs PUT',
    icon: 'swap-vertical-outline',
    text: 'CALL (opção de compra):\nDá o direito de COMPRAR o ativo ao preço do strike. Ganha valor quando o ativo SOBE.\n\nPUT (opção de venda):\nDá o direito de VENDER o ativo ao preço do strike. Ganha valor quando o ativo CAI.\n\nVENDA (lançamento):\nVocê recebe o prêmio agora e assume obrigação. Estratégia de renda — você quer que a opção vire pó.\n\nCOMPRA:\nVocê paga o prêmio para ter proteção ou apostar na direção.',
  },
  {
    title: 'Parâmetros do Simulador',
    icon: 'settings-outline',
    text: 'Spot: preço atual do ativo no mercado.\n\nStrike: preço de exercício da opção. Quanto mais distante do spot, mais barata (OTM).\n\nPrêmio: valor da opção por unidade. Se você vende 100 opções a R$1,20, recebe R$120.\n\nVI (Volatilidade Implícita): expectativa do mercado sobre oscilação futura. VI alta = prêmios maiores = bom para vender.\n\nDTE: dias até o vencimento. Mais DTE = mais prêmio, mas mais risco de movimento.\n\nQtd: número total de opções (não contratos).',
  },
  {
    title: 'As Gregas',
    icon: 'analytics-outline',
    text: 'Delta (Δ): sensibilidade ao preço do ativo.\n• Delta 0.30: opção sobe R$0,30 se ativo subir R$1\n• Vendedor quer delta baixo (longe do strike)\n• PUT tem delta negativo\n\nGamma (Γ): velocidade de mudança do delta.\n• Gamma alto perto do strike e do vencimento\n• Risco para vendedores: delta muda rápido\n\nTheta (Θ): perda de valor por dia.\n• Favorece VENDEDORES (time decay a seu favor)\n• Acelera nos últimos 30 dias\n\nVega (ν): sensibilidade à volatilidade.\n• VI subindo = opção mais cara\n• Vendedor quer VI caindo após a venda',
  },
  {
    title: 'Gráfico de Payoff',
    icon: 'bar-chart-outline',
    text: 'O gráfico mostra seu resultado no vencimento para cada preço possível do ativo:\n\n• Área VERDE: faixa de lucro\n• Área VERMELHA: faixa de prejuízo\n• Linha tracejada: breakeven (equilíbrio)\n• Linha pontilhada: spot atual\n• Toque e arraste para ver P&L exato\n\nVenda de CALL coberta:\nLucro máximo = prêmio. Risco = ser exercido acima do strike (vende as ações).\n\nVenda de PUT (CSP):\nLucro = prêmio. Risco = comprar o ativo se cair abaixo do strike.\n\nCompra:\nPrejuízo limitado ao prêmio pago.',
  },
  {
    title: 'Cenários What-If',
    icon: 'git-branch-outline',
    text: 'Simula o resultado se o ativo se mover +5%, -5%, +10% ou -10%, usando Black-Scholes com 5 dias a menos de DTE.\n\nValor verde = lucro estimado\nValor vermelho = prejuízo estimado\n\nExemplo prático:\nVocê vendeu PUT de PETR4, strike R$34, prêmio R$1,20.\nSe PETR4 subir 5%, a PUT desvaloriza e você lucra.\nSe cair 10%, a PUT valoriza e você perde.\n\nUse para definir se o risco/retorno compensa antes de operar.',
  },
  {
    title: 'Calculadora de Opções',
    icon: 'calculator-outline',
    text: 'Digite um strike (pode ser quebrado, ex: 32.68) para ver o preço justo calculado pelo Black-Scholes.\n\n• CALL e PUT: preço teórico, delta, gamma, theta, vega\n• Bid/Ask simulado com spread realista\n\nPREÇOS DO MERCADO:\nCopie o bid/ask da sua corretora para comparar com o preço justo. O app calcula se está CARO, JUSTO ou BARATO e sugere operações.\n\nTABELA DE STRIKES:\nMostra strikes vizinhos com preços e gregas. Toque para analisar.\n\nUse "+ Outro" para analisar tickers fora da sua carteira.',
  },
  {
    title: 'Indicadores Técnicos',
    icon: 'pulse-outline',
    text: 'HV 20d (Volatilidade Histórica):\nOscilação real do ativo nos últimos 20 dias. Compare com VI: se VI > HV, prêmios estão caros (bom para vender).\n\nRSI 14:\n• > 70: sobrecomprado (possível queda)\n• < 30: sobrevendido (possível alta)\n• 30-70: neutro\n\nBeta:\n• > 1.2: mais volátil que o mercado\n• < 0.8: mais defensivo\n• = 1: acompanha o mercado\n\nMax Drawdown:\nMaior queda do pico ao vale. Indica risco histórico máximo.\n\nSMA/EMA: médias móveis — suporte e resistência dinâmicos.\nATR: amplitude média diária — útil para definir stops.\nBB Width: largura das Bandas de Bollinger — baixa = baixa volatilidade (breakout próximo).',
  },
  {
    title: 'Estratégias Práticas',
    icon: 'rocket-outline',
    text: 'Venda Coberta (Covered Call):\nVocê TEM as ações e vende CALL OTM. Recebe prêmio como renda extra. Se exercido, vende as ações com lucro.\n\nCSP (Cash-Secured Put):\nVocê QUER comprar o ativo mais barato. Vende PUT OTM. Se exercido, compra com desconto (strike - prêmio).\n\nWheel Strategy:\n1. Vende PUT → se exercido, compra ações\n2. Com as ações, vende CALL → se exercido, vende\n3. Repete o ciclo recebendo prêmios\n\nDicas:\n• VI alta = prêmios maiores (melhor para vender)\n• DTE 21-45 dias: melhor relação theta/risco\n• Strikes OTM 5-10%: equilíbrio prêmio/segurança\n• Sempre cheque cobertura antes de vender',
  },
];

// ═══════════════════════════════════════
// AI ANALYSIS MODAL
// ═══════════════════════════════════════
function AiAnalysisModal(props) {
  var analysis = props.analysis;
  var onClose = props.onClose;
  var onSave = props.onSave;
  var _saved = useState(false); var saved = _saved[0]; var setSaved = _saved[1];

  // Reset saved state when analysis changes (new analysis generated)
  useEffect(function() { setSaved(false); }, [analysis]);

  if (!analysis) return null;

  var secs = [
    { key: 'risco', label: 'AVALIAÇÃO DE RISCO', icon: 'shield-checkmark-outline', color: C.red },
    { key: 'estrategias', label: 'SUGESTÕES DE ESTRATÉGIA', icon: 'bulb-outline', color: C.accent },
    { key: 'cenarios', label: 'CENÁRIOS DE MERCADO', icon: 'git-branch-outline', color: C.etfs },
    { key: 'educacional', label: 'RESUMO EDUCACIONAL', icon: 'school-outline', color: C.green },
  ];

  // If only risco has content (fallback), show as single block
  var hasAnySec = false;
  for (var si = 0; si < secs.length; si++) {
    if (analysis[secs[si].key]) hasAnySec = true;
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SIZE.padding, paddingTop: 54, paddingBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="sparkles" size={20} color={C.accent} />
          <Text style={{ fontSize: 17, fontWeight: '800', color: C.text, fontFamily: F.display }}>Análise IA</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {onSave ? (
            <TouchableOpacity disabled={saved}
              onPress={function() { onSave(); setSaved(true); }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button" accessibilityLabel={saved ? 'Análise salva' : 'Salvar análise'}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6,
                backgroundColor: saved ? C.green + '18' : C.accent + '18', borderWidth: 1, borderColor: saved ? C.green + '40' : C.accent + '40' }}>
              <Ionicons name={saved ? 'checkmark-circle' : 'bookmark-outline'} size={14} color={saved ? C.green : C.accent} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: saved ? C.green : C.accent, fontFamily: F.body }}>{saved ? 'Salvo' : 'Salvar'}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button" accessibilityLabel="Fechar análise">
            <Ionicons name="close-circle-outline" size={28} color={C.sub} />
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: SIZE.padding, gap: SIZE.gap, paddingBottom: 50 }}>
        {secs.map(function(sec) {
          var content = analysis[sec.key];
          if (!content) return null;

          // Format markdown-like bold (**text**) to just text with emphasis
          var lines = content.split('\n');
          var formattedLines = [];
          for (var li = 0; li < lines.length; li++) {
            var line = lines[li].replace(/\*\*/g, '');
            if (line.trim()) formattedLines.push(line);
            else formattedLines.push('');
          }
          var formatted = formattedLines.join('\n');

          return (
            <Glass key={sec.key} glow={sec.color} padding={16}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <Ionicons name={sec.icon} size={16} color={sec.color} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: sec.color, fontFamily: F.mono, letterSpacing: 0.8 }}>{sec.label}</Text>
              </View>
              <Text style={{ fontSize: 13, color: C.text, fontFamily: F.body, lineHeight: 22 }}>{formatted}</Text>
            </Glass>
          );
        })}

        {!hasAnySec ? (
          <Glass padding={16}>
            <Text style={{ fontSize: 13, color: C.sub, fontFamily: F.body, lineHeight: 22, textAlign: 'center' }}>
              Análise não disponível. Tente novamente.
            </Text>
          </Glass>
        ) : null}

        <View style={{ padding: 12, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: C.border }}>
          <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono, textAlign: 'center', lineHeight: 17 }}>
            Análise gerada por IA. Não constitui recomendação de investimento. Use como ferramenta educacional complementar à sua própria análise.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ═══════════════════════════════════════
// CALCULADORA UNIVERSAL DE OPÇÕES
// ═══════════════════════════════════════
function CalculadoraOpcoes(props) {
  var ps = usePrivacyStyle();
  var positions = props.positions || [];
  var indicatorsMap = props.indicators || {};
  var chainSelicRate = props.selicRate || 13.25;

  // Unique tickers with spot prices
  var tickers = [];
  var tickerSpots = {};
  for (var ti = 0; ti < positions.length; ti++) {
    var pt = positions[ti];
    if (tickers.indexOf(pt.ticker) === -1) {
      tickers.push(pt.ticker);
      tickerSpots[pt.ticker] = pt.preco_atual || pt.pm || 0;
    }
  }

  var defaultTicker = tickers.length > 0 ? tickers[0] : null;

  var _chainTicker = useState(defaultTicker);
  var chainTicker = _chainTicker[0]; var setChainTicker = _chainTicker[1];
  var _chainIV = useState('');
  var chainIV = _chainIV[0]; var setChainIV = _chainIV[1];
  var _chainDTE = useState('');
  var chainDTE = _chainDTE[0]; var setChainDTE = _chainDTE[1];
  var _customTicker = useState(''); var customTicker = _customTicker[0]; var setCustomTicker = _customTicker[1];
  var _customSpot = useState(''); var customSpot = _customSpot[0]; var setCustomSpot = _customSpot[1];
  var _showCustom = useState(false); var showCustom = _showCustom[0]; var setShowCustom = _showCustom[1];
  var _fetchingSpot = useState(false); var fetchingSpot = _fetchingSpot[0]; var setFetchingSpot = _fetchingSpot[1];
  var _optionStyle = useState('europeia'); var optionStyle = _optionStyle[0]; var setOptionStyle = _optionStyle[1];
  var _skewSel = useState('auto'); var skewSel = _skewSel[0]; var setSkewSel = _skewSel[1];
  var _strikeInput = useState(''); var strikeInput = _strikeInput[0]; var setStrikeInput = _strikeInput[1];
  var _mktCallBid = useState(''); var mktCallBid = _mktCallBid[0]; var setMktCallBid = _mktCallBid[1];
  var _mktCallAsk = useState(''); var mktCallAsk = _mktCallAsk[0]; var setMktCallAsk = _mktCallAsk[1];
  var _mktPutBid = useState(''); var mktPutBid = _mktPutBid[0]; var setMktPutBid = _mktPutBid[1];
  var _mktPutAsk = useState(''); var mktPutAsk = _mktPutAsk[0]; var setMktPutAsk = _mktPutAsk[1];
  var _spotOverride = useState(''); var spotOverride = _spotOverride[0]; var setSpotOverride = _spotOverride[1];
  var _tableStep = useState('auto'); var tableStep = _tableStep[0]; var setTableStep = _tableStep[1];

  // Context indicators (manual inputs)
  var _hvInput = useState(''); var hvInput = _hvInput[0]; var setHvInput = _hvInput[1];
  var _vwapInput = useState(''); var vwapInput = _vwapInput[0]; var setVwapInput = _vwapInput[1];
  var _oiInput = useState(''); var oiInput = _oiInput[0]; var setOiInput = _oiInput[1];

  var handleTickerChange = function(tk) {
    setChainTicker(tk);
    setShowCustom(false);
    setSpotOverride('');
  };

  var handleCustomApply = function() {
    var tk = customTicker.toUpperCase().trim();
    if (!tk) return;
    var sp = parseFloat(customSpot);
    if (!sp || sp <= 0) return;
    tickerSpots[tk] = sp;
    if (tickers.indexOf(tk) === -1) tickers.push(tk);
    setChainTicker(tk);
    setShowCustom(false);
    setSpotOverride('');
  };

  var handleFetchCustomSpot = function() {
    var tk = customTicker.toUpperCase().trim();
    if (!tk || tk.length < 2) return;
    setFetchingSpot(true);
    fetchPrices([tk]).then(function(priceMap) {
      var p = priceMap && priceMap[tk];
      if (p && p.price) {
        setCustomSpot(String(p.price.toFixed(2)));
      }
      setFetchingSpot(false);
    }).catch(function() { setFetchingSpot(false); });
  };

  // Current ticker HV for badge
  var currentHV = (chainTicker && indicatorsMap[chainTicker] && indicatorsMap[chainTicker].hv_20)
    ? indicatorsMap[chainTicker].hv_20
    : null;

  var apiSpot = tickerSpots[chainTicker] || 0;
  var spot = (spotOverride !== '' && parseFloat(spotOverride) > 0) ? parseFloat(spotOverride) : apiSpot;
  var ivVal = (parseFloat(chainIV) || 0) / 100;
  var dteVal = parseInt(chainDTE) || 0;
  var tYears = dteVal / 365;
  var r = chainSelicRate / 100;

  // Pricing function based on option style
  var priceFn = (optionStyle === 'americana') ? bsPriceAmerican : bsPrice;

  // AI Analysis states
  var _aiAnalysis = useState(null); var aiAnalysis = _aiAnalysis[0]; var setAiAnalysis = _aiAnalysis[1];
  var _aiLoading = useState(false); var aiLoading = _aiLoading[0]; var setAiLoading = _aiLoading[1];
  var _aiError = useState(null); var aiError = _aiError[0]; var setAiError = _aiError[1];
  var _aiModalOpen = useState(false); var aiModalOpen = _aiModalOpen[0]; var setAiModalOpen = _aiModalOpen[1];
  var _aiObj = useState('renda'); var aiObjetivo = _aiObj[0]; var setAiObjetivo = _aiObj[1];
  var _aiCapital = useState(''); var aiCapital = _aiCapital[0]; var setAiCapital = _aiCapital[1];

  // Saved analyses states
  var authUser = useAuth().user;
  var _savedList = useState([]); var savedList = _savedList[0]; var setSavedList = _savedList[1];
  var _showSavedDD = useState(false); var showSavedDD = _showSavedDD[0]; var setShowSavedDD = _showSavedDD[1];
  var _savingAnalysis = useState(false); var savingAnalysis = _savingAnalysis[0]; var setSavingAnalysis = _savingAnalysis[1];

  // Load saved analyses on mount
  useFocusEffect(useCallback(function() {
    if (authUser && authUser.id) {
      getSavedAnalyses(authUser.id).then(function(res) {
        if (res.data) setSavedList(res.data);
      });
    }
  }, [authUser && authUser.id]));

  // Parse strike + market prices first (needed for auto-skew)
  var fk = parseFloat(strikeInput) || 0;
  var hasResult = fk > 0 && spot > 0 && ivVal > 0 && tYears > 0;
  var fDist = (spot > 0 && fk > 0) ? ((fk - spot) / spot * 100) : 0;

  var mcBid = parseFloat(mktCallBid) || 0;
  var mcAsk = parseFloat(mktCallAsk) || 0;
  var mpBid = parseFloat(mktPutBid) || 0;
  var mpAsk = parseFloat(mktPutAsk) || 0;
  var mcMid = (mcBid > 0 && mcAsk > 0) ? (mcBid + mcAsk) / 2 : (mcBid > 0 ? mcBid : mcAsk);
  var mpMid = (mpBid > 0 && mpAsk > 0) ? (mpBid + mpAsk) / 2 : (mpBid > 0 ? mpBid : mpAsk);
  var hasCallMkt = mcMid > 0;
  var hasPutMkt = mpMid > 0;

  // IV implícita do mercado (bsIV não depende de skew — Newton-Raphson puro)
  var callMktIV = (hasCallMkt && hasResult) ? bsIV(spot, fk, tYears, r, mcMid, 'call') : 0;
  var putMktIV = (hasPutMkt && hasResult) ? bsIV(spot, fk, tYears, r, mpMid, 'put') : 0;

  // Skew — auto-detect from market IVs or manual
  var skewStrength = 1;
  var skewAutoLabel = '';
  if (skewSel === 'auto') {
    if (callMktIV > 0 && putMktIV > 0) {
      var ivDiffPp = (putMktIV - callMktIV) * 100;
      if (ivDiffPp > 8) {
        skewStrength = 2; skewAutoLabel = 'Forte';
      } else if (ivDiffPp > 2) {
        skewStrength = 1; skewAutoLabel = 'Leve';
      } else {
        skewStrength = 0; skewAutoLabel = 'Flat';
      }
    } else if (callMktIV > 0 || putMktIV > 0) {
      var singleIV = callMktIV > 0 ? callMktIV : putMktIV;
      var ivRatio = singleIV / ivVal;
      if (ivRatio > 1.3) {
        skewStrength = 2; skewAutoLabel = 'Forte';
      } else if (ivRatio > 1.05) {
        skewStrength = 1; skewAutoLabel = 'Leve';
      } else {
        skewStrength = 0; skewAutoLabel = 'Flat';
      }
    } else {
      skewStrength = 1; skewAutoLabel = 'Leve';
    }
  } else {
    skewStrength = parseInt(skewSel) || 0;
  }

  // BS calculations for the strike (uses skewStrength)
  var fIV = hasResult ? applyIVSkew(ivVal, fk, spot, skewStrength) : 0;
  var fCallMid = hasResult ? priceFn(spot, fk, tYears, r, fIV, 'call') : 0;
  var fPutMid = hasResult ? priceFn(spot, fk, tYears, r, fIV, 'put') : 0;
  var fCallG = hasResult ? bsGreeks(spot, fk, tYears, r, fIV, 'call') : { delta: 0, gamma: 0, theta: 0, vega: 0 };
  var fPutG = hasResult ? bsGreeks(spot, fk, tYears, r, fIV, 'put') : { delta: 0, gamma: 0, theta: 0, vega: 0 };
  var fCallBA = hasResult ? simulateBidAsk(fCallMid, spot, fk) : { bid: 0, ask: 0 };
  var fPutBA = hasResult ? simulateBidAsk(fPutMid, spot, fk) : { bid: 0, ask: 0 };

  // Decision engine
  function analyzePrice(theoMid, mktMid, mktIV, theoIV, tipo) {
    if (!mktMid || mktMid <= 0 || !theoMid || theoMid <= 0) return null;
    var diff = mktMid - theoMid;
    var diffPct = (diff / theoMid) * 100;
    var ivDiff = mktIV > 0 ? (mktIV - theoIV) * 100 : 0;
    var verdict = '';
    var verdictColor = C.sub;
    var icon = 'remove-circle-outline';
    var suggestion = '';

    var pct = Math.abs(diffPct).toFixed(0);
    if (diffPct > 12) {
      verdict = 'CARO'; verdictColor = C.red; icon = 'arrow-up-circle';
      if (tipo === 'call') {
        suggestion = 'Call ' + pct + '% acima do justo. Bom para VENDER call (coberta ou trava de baixa) — você recebe prêmio inflado. Evite COMPRAR call agora.';
      } else {
        suggestion = 'Put ' + pct + '% acima do justo. Bom para VENDER put (CSP) — prêmio gordo a seu favor. Evite COMPRAR put como hedge agora, está caro.';
      }
    } else if (diffPct > 5) {
      verdict = 'ACIMA'; verdictColor = C.etfs; icon = 'arrow-up-circle-outline';
      if (tipo === 'call') {
        suggestion = 'Call ' + pct + '% acima do justo. Tendência favorável para VENDER call. Para COMPRAR call, aguarde preço mais baixo.';
      } else {
        suggestion = 'Put ' + pct + '% acima do justo. Tendência favorável para VENDER put. Para COMPRAR put (hedge), aguarde queda do prêmio.';
      }
    } else if (diffPct < -12) {
      verdict = 'BARATO'; verdictColor = C.green; icon = 'arrow-down-circle';
      if (tipo === 'call') {
        suggestion = 'Call ' + pct + '% abaixo do justo. Bom para COMPRAR call (aposta de alta ou trava de alta) — desconto real. Evite VENDER call, prêmio baixo.';
      } else {
        suggestion = 'Put ' + pct + '% abaixo do justo. Bom para COMPRAR put (hedge barato). Evite VENDER put (CSP) — prêmio muito baixo pelo risco.';
      }
    } else if (diffPct < -5) {
      verdict = 'ABAIXO'; verdictColor = C.rf; icon = 'arrow-down-circle-outline';
      if (tipo === 'call') {
        suggestion = 'Call ' + pct + '% abaixo do justo. Tendência favorável para COMPRAR call. Para VENDER call, o prêmio está magro.';
      } else {
        suggestion = 'Put ' + pct + '% abaixo do justo. Tendência favorável para COMPRAR put (hedge). Para VENDER put, o prêmio compensa pouco.';
      }
    } else {
      verdict = 'JUSTO'; verdictColor = C.yellow; icon = 'checkmark-circle-outline';
      if (tipo === 'call') {
        suggestion = 'Call no preço justo (±' + pct + '%). Sem distorção — tanto vender call coberta quanto comprar call são válidos conforme sua estratégia.';
      } else {
        suggestion = 'Put no preço justo (±' + pct + '%). Sem distorção — tanto vender put (CSP) quanto comprar put (hedge) são válidos conforme sua estratégia.';
      }
    }

    return {
      diff: diff, diffPct: diffPct, ivDiff: ivDiff,
      verdict: verdict, verdictColor: verdictColor, icon: icon,
      suggestion: suggestion, mktIV: mktIV,
    };
  }

  var callAnalysis = hasCallMkt ? analyzePrice(fCallMid, mcMid, callMktIV, fIV, 'call') : null;
  var putAnalysis = hasPutMkt ? analyzePrice(fPutMid, mpMid, putMktIV, fIV, 'put') : null;

  // Parser para valores abreviados: "27,96m" → 27960000, "1.200" → 1200, "500k" → 500000
  function parseAbrevNum(str) {
    if (!str || str === '') return NaN;
    var s = str.toLowerCase().trim().replace(/\s/g, '');
    // Detecta sufixo k/m/b
    var mult = 1;
    if (s.indexOf('b') !== -1) { mult = 1000000000; s = s.replace('b', ''); }
    else if (s.indexOf('m') !== -1) { mult = 1000000; s = s.replace('m', ''); }
    else if (s.indexOf('k') !== -1) { mult = 1000; s = s.replace('k', ''); }
    // Remove pontos de milhar e troca vírgula por ponto decimal
    s = s.replace(/\./g, '').replace(',', '.');
    var num = parseFloat(s);
    if (isNaN(num)) return NaN;
    return Math.round(num * mult);
  }

  // ═══ MOTOR DE DECISÃO — alertas baseados em indicadores de contexto ═══
  function generateContextAlerts() {
    var alerts = [];
    var viUsuario = parseFloat(chainIV) || 0;
    var vhVal = parseFloat(hvInput);
    var vwapVal = parseFloat(vwapInput.replace(',', '.'));
    var caVal = parseAbrevNum(oiInput);

    // Regra 1: VI vs VH (Termômetro de Preço)
    if (vhVal > 0 && viUsuario > 0) {
      if (viUsuario > vhVal) {
        var viVhDiff = (viUsuario - vhVal).toFixed(1);
        alerts.push({
          icon: 'flame-outline',
          color: C.etfs,
          title: 'Prêmio Inflado (VI > VH)',
          text: 'A Volatilidade Implícita (' + viUsuario.toFixed(1) + '%) está ' + viVhDiff + ' pontos acima da Volatilidade Histórica (' + vhVal.toFixed(1) + '%). '
            + 'O mercado está precificando mais volatilidade do que o ativo historicamente apresenta. '
            + 'Cenário favorável para VENDER opções (prêmio caro).',
          badge: 'VENDA',
          badgeColor: C.etfs,
        });
      } else {
        var vhViDiff = (vhVal - viUsuario).toFixed(1);
        alerts.push({
          icon: 'pricetag-outline',
          color: C.green,
          title: 'Prêmio Descontado (VI < VH)',
          text: 'A Volatilidade Implícita (' + viUsuario.toFixed(1) + '%) está ' + vhViDiff + ' pontos abaixo da Volatilidade Histórica (' + vhVal.toFixed(1) + '%). '
            + 'O mercado está subprecificando a volatilidade real do ativo. '
            + 'Cenário favorável para COMPRAR opções (prêmio barato).',
          badge: 'COMPRA',
          badgeColor: C.green,
        });
      }
    }

    // Regra 2: VWAP vs Spot (Tendência)
    if (vwapVal > 0 && spot > 0) {
      var vwapDiffPct = ((spot - vwapVal) / vwapVal * 100).toFixed(2);
      if (spot > vwapVal) {
        alerts.push({
          icon: 'trending-up-outline',
          color: C.green,
          title: 'Tendência Intradiária de ALTA',
          text: 'Spot (R$ ' + fmt(spot) + ') está ' + vwapDiffPct + '% acima do VWAP (R$ ' + fmt(vwapVal) + '). '
            + 'Pressão compradora no dia. Apoia estratégias com Calls ou venda de Puts (CSP).',
          badge: 'ALTA',
          badgeColor: C.green,
        });
      } else {
        var vwapDiffAbs = Math.abs(parseFloat(vwapDiffPct)).toFixed(2);
        alerts.push({
          icon: 'trending-down-outline',
          color: C.red,
          title: 'Tendência Intradiária de BAIXA',
          text: 'Spot (R$ ' + fmt(spot) + ') está ' + vwapDiffAbs + '% abaixo do VWAP (R$ ' + fmt(vwapVal) + '). '
            + 'Pressão vendedora no dia. Apoia estratégias com Puts ou venda de Calls.',
          badge: 'BAIXA',
          badgeColor: C.red,
        });
      }
    }

    // Regra 3: Liquidez (Contratos em Aberto)
    if (!isNaN(caVal) && caVal >= 0 && oiInput !== '') {
      var caFmt = caVal.toLocaleString('pt-BR');
      if (caVal < 100) {
        alerts.push({
          icon: 'warning-outline',
          color: C.yellow,
          title: 'Baixa Liquidez',
          text: 'Apenas ' + caFmt + ' contratos em aberto. Risco de não conseguir sair da operação ou sofrer com spread bid/ask alto. '
            + 'Prefira opções com mais de 500 contratos em aberto para maior liquidez.',
          badge: 'CUIDADO',
          badgeColor: C.yellow,
        });
      } else if (caVal >= 100 && caVal < 500) {
        alerts.push({
          icon: 'alert-circle-outline',
          color: C.etfs,
          title: 'Liquidez Moderada',
          text: caFmt + ' contratos em aberto. Liquidez aceitável, mas o spread pode ser amplo. '
            + 'Considere usar ordens limitadas para não pagar spread excessivo.',
          badge: 'ATENÇÃO',
          badgeColor: C.etfs,
        });
      } else {
        alerts.push({
          icon: 'checkmark-circle-outline',
          color: C.green,
          title: 'Boa Liquidez',
          text: caFmt + ' contratos em aberto. Liquidez adequada para entrar e sair da operação com facilidade.',
          badge: 'OK',
          badgeColor: C.green,
        });
      }
    }

    return alerts;
  }

  var contextAlerts = hasResult ? generateContextAlerts() : [];

  // What-If scenarios — retorna objeto com dados completos
  function calcScenario(pctMove, tipo) {
    if (!hasResult) return null;
    var newSpot = spot * (1 + pctMove);
    var newT = Math.max(0.001, (dteVal - 5) / 365);
    var newIV = applyIVSkew(ivVal, fk, newSpot, skewStrength);
    var newPrice = priceFn(newSpot, fk, newT, r, newIV, tipo);
    var theoNow = tipo === 'call' ? fCallMid : fPutMid;
    var mktPrice = tipo === 'call' ? mcMid : mpMid;
    var premioRef = mktPrice > 0 ? mktPrice : theoNow;
    // P&L por opção (unitário): venda = recebeu - recompra; compra = valor_novo - pagou
    var plVenda = premioRef - newPrice;
    var plCompra = newPrice - premioRef;
    return {
      newSpot: newSpot,
      newPrice: newPrice,
      premioRef: premioRef,
      plVenda: plVenda,
      plCompra: plCompra,
    };
  }

  // Generate mini-table strikes (memoized)
  var effectiveStep = tableStep === 'auto' ? getB3StrikeStep(spot, chainTicker) : parseFloat(tableStep);
  var miniTableData = useMemo(function() {
    if (!hasResult) return [];
    var miniStep = effectiveStep;
    var miniStrikes = [];
    for (var ms = -5; ms <= 5; ms++) {
      var msk = fk + ms * miniStep;
      if (msk > 0) miniStrikes.push(msk);
    }
    // Always include the exact user strike
    var hasExact = false;
    for (var chk = 0; chk < miniStrikes.length; chk++) {
      if (Math.abs(miniStrikes[chk] - fk) < 0.001) { hasExact = true; break; }
    }
    if (!hasExact) {
      miniStrikes.push(fk);
      miniStrikes.sort(function(a, b) { return a - b; });
    }
    // Compute all data
    var rows = [];
    for (var ri = 0; ri < miniStrikes.length; ri++) {
      var msk2 = miniStrikes[ri];
      var mIV = applyIVSkew(ivVal, msk2, spot, skewStrength);
      var mCallG = bsGreeks(spot, msk2, tYears, r, mIV, 'call');
      var mPutG = bsGreeks(spot, msk2, tYears, r, mIV, 'put');
      rows.push({
        sk: msk2,
        isUser: Math.abs(msk2 - fk) < 0.001,
        isAtm: Math.abs(msk2 - spot) / spot < 0.01,
        callP: priceFn(spot, msk2, tYears, r, mIV, 'call'),
        putP: priceFn(spot, msk2, tYears, r, mIV, 'put'),
        callDelta: mCallG.delta,
        putDelta: mPutG.delta,
        callTheta: mCallG.theta,
        putTheta: mPutG.theta,
        callGamma: mCallG.gamma,
        putGamma: mPutG.gamma,
        callVega: mCallG.vega,
        putVega: mPutG.vega,
        iv: mIV,
      });
    }
    return rows;
  }, [spot, fk, ivVal, tYears, r, skewStrength, optionStyle, chainTicker, effectiveStep]);

  // AI Analysis handler
  function handleAiAnalysis() {
    if (aiLoading) return;
    if (spot <= 0 || fk <= 0) return;

    var basePos = null;
    if (chainTicker) {
      for (var pi = 0; pi < positions.length; pi++) {
        if (positions[pi].ticker && positions[pi].ticker.toUpperCase() === chainTicker.toUpperCase()) {
          basePos = positions[pi]; break;
        }
      }
    }

    var tickerInd = null;
    if (basePos && basePos.ticker && indicatorsMap) {
      tickerInd = indicatorsMap[basePos.ticker.toUpperCase()] || null;
    }

    var portfolioSummary = [];
    var portfolioTotal = 0;
    for (var psi = 0; psi < positions.length; psi++) {
      var pos = positions[psi];
      var posVal = (pos.preco_atual || pos.pm || 0) * (pos.quantidade || 0);
      portfolioTotal += posVal;
      if (pos.ticker) {
        portfolioSummary.push({ ticker: pos.ticker, qty: pos.quantidade || 0, valor: Math.round(posVal) });
      }
    }

    var scenarioResults = [];
    var scMoves = [0.05, -0.05, 0.10, -0.10];
    for (var si = 0; si < scMoves.length; si++) {
      var lbl = (scMoves[si] > 0 ? '+' : '') + (scMoves[si] * 100).toFixed(0) + '%';
      var scn = calcScenario(scMoves[si], 'call');
      scenarioResults.push({ label: lbl, result: scn ? scn.plVenda * 100 : 0 });
    }

    // Build strikes from mini-table
    var availStrikes = [];
    for (var avi = 0; avi < miniTableData.length; avi++) {
      availStrikes.push(miniTableData[avi].sk);
    }

    var data = {
      tipo: 'CALL',
      direcao: 'venda',
      objetivo: aiObjetivo,
      spot: spot,
      strike: fk,
      premio: mcMid > 0 ? mcMid : fCallMid,
      iv: fIV * 100,
      dte: dteVal,
      qty: 100,
      greeks: {
        delta: fCallG.delta,
        gamma: fCallG.gamma,
        theta: fCallG.theta,
        vega: fCallG.vega,
      },
      premioTotal: (mcMid > 0 ? mcMid : fCallMid) * 100,
      bsTheoPrice: fCallMid,
      scenarios: scenarioResults,
      selicRate: chainSelicRate,
      indicators: tickerInd,
      position: basePos ? {
        ticker: basePos.ticker,
        quantidade: basePos.quantidade,
        pm: basePos.pm,
        preco_atual: basePos.preco_atual,
      } : null,
      capital: aiCapital ? parseFloat(aiCapital.replace(/\./g, '').replace(',', '.')) : null,
      portfolio: portfolioSummary.length > 0 ? { ativos: portfolioSummary, total: Math.round(portfolioTotal) } : null,
      availableStrikes: availStrikes.length > 0 ? availStrikes : null,
      hvManual: hvInput ? parseFloat(hvInput) : null,
      vwap: vwapInput ? parseFloat(vwapInput.replace(',', '.')) : null,
      openInterest: oiInput ? parseAbrevNum(oiInput) : null,
    };

    setAiLoading(true);
    setAiError(null);

    analyzeOption(data).then(function(result) {
      setAiLoading(false);
      if (result && result.error) {
        setAiError(result.error);
      } else if (result) {
        setAiAnalysis(result);
        setAiModalOpen(true);
      } else {
        setAiError('Resposta vazia da IA.');
      }
    }).catch(function(err) {
      setAiLoading(false);
      setAiError('Erro inesperado: ' + (err && err.message ? err.message : ''));
    });
  }

  // ═══ Save/Load Analysis Handlers ═══
  function buildSavePayload(includeAi) {
    var calcState = {
      strikeInput: strikeInput,
      chainIV: chainIV,
      chainDTE: chainDTE,
      mktCallBid: mktCallBid,
      mktCallAsk: mktCallAsk,
      mktPutBid: mktPutBid,
      mktPutAsk: mktPutAsk,
      spotOverride: spotOverride,
      tableStep: tableStep,
      optionStyle: optionStyle,
      skewSel: skewSel,
      aiObjetivo: aiObjetivo,
      aiCapital: aiCapital,
      customTicker: customTicker,
      customSpot: customSpot,
      hvInput: hvInput,
      vwapInput: vwapInput,
      oiInput: oiInput,
    };
    var payload = {
      ticker: (chainTicker || customTicker || '').toUpperCase().trim(),
      strike: fk || null,
      spot: spot || null,
      iv: parseFloat(chainIV) || null,
      dte: parseInt(chainDTE) || null,
      option_style: optionStyle,
      skew: skewSel,
      objetivo: aiObjetivo,
      capital: aiCapital ? parseFloat(aiCapital.replace(/\./g, '').replace(',', '.')) || null : null,
      calculator_state: calcState,
    };
    if (includeAi && aiAnalysis) {
      payload.ai_analysis = aiAnalysis;
    }
    return payload;
  }

  function handleSaveAnalysis(includeAi) {
    if (!authUser || !authUser.id) return;
    if (savingAnalysis) return;
    var tk = (chainTicker || customTicker || '').toUpperCase().trim();
    if (!tk) {
      Toast.show({ type: 'error', text1: 'Selecione um ativo primeiro' });
      return;
    }
    setSavingAnalysis(true);
    var payload = buildSavePayload(includeAi);
    addSavedAnalysis(authUser.id, payload).then(function(res) {
      setSavingAnalysis(false);
      if (res.error) {
        Toast.show({ type: 'error', text1: 'Erro ao salvar', text2: res.error.message || '' });
      } else {
        if (res.data) {
          var newList = [res.data];
          for (var i = 0; i < savedList.length; i++) { newList.push(savedList[i]); }
          setSavedList(newList);
        }
        Toast.show({ type: 'success', text1: 'Análise salva', text2: tk + (includeAi ? ' (com IA)' : '') });
      }
    }).catch(function() {
      setSavingAnalysis(false);
      Toast.show({ type: 'error', text1: 'Erro ao salvar análise' });
    });
  }

  function handleLoadAnalysis(item) {
    var cs = item.calculator_state || {};
    // Ticker
    var tk = (item.ticker || '').toUpperCase().trim();
    if (tk && tk !== (chainTicker || '').toUpperCase().trim()) {
      if (tickerSpots[tk]) {
        setChainTicker(tk);
      } else if (cs.customSpot) {
        setCustomTicker(tk);
        setCustomSpot(cs.customSpot);
        tickerSpots[tk] = parseFloat(cs.customSpot) || 0;
        if (tickers.indexOf(tk) === -1) tickers.push(tk);
        setChainTicker(tk);
      } else {
        setChainTicker(tk);
      }
    }
    // Restore calculator fields
    if (cs.strikeInput !== undefined) setStrikeInput(cs.strikeInput);
    if (cs.chainIV !== undefined) setChainIV(cs.chainIV);
    if (cs.chainDTE !== undefined) setChainDTE(cs.chainDTE);
    if (cs.optionStyle !== undefined) setOptionStyle(cs.optionStyle);
    if (cs.skewSel !== undefined) setSkewSel(cs.skewSel);
    if (cs.spotOverride !== undefined) setSpotOverride(cs.spotOverride);
    if (cs.tableStep !== undefined) setTableStep(cs.tableStep);
    if (cs.mktCallBid !== undefined) setMktCallBid(cs.mktCallBid);
    if (cs.mktCallAsk !== undefined) setMktCallAsk(cs.mktCallAsk);
    if (cs.mktPutBid !== undefined) setMktPutBid(cs.mktPutBid);
    if (cs.mktPutAsk !== undefined) setMktPutAsk(cs.mktPutAsk);
    if (cs.aiObjetivo !== undefined) setAiObjetivo(cs.aiObjetivo);
    if (cs.aiCapital !== undefined) setAiCapital(cs.aiCapital);
    if (cs.hvInput !== undefined) setHvInput(cs.hvInput);
    if (cs.vwapInput !== undefined) setVwapInput(cs.vwapInput);
    if (cs.oiInput !== undefined) setOiInput(cs.oiInput);
    // Restore AI analysis if present — open modal to show it
    if (item.ai_analysis) {
      setAiAnalysis(item.ai_analysis);
      setAiModalOpen(true);
    }
    setShowSavedDD(false);
    Toast.show({ type: 'success', text1: 'Análise carregada', text2: tk + (item.strike ? ' @ ' + Number(item.strike).toFixed(2) : '') });
  }

  function handleDeleteAnalysis(id) {
    Alert.alert('Excluir análise', 'Tem certeza que deseja excluir esta análise salva?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: function() {
        if (!authUser || !authUser.id) return;
        deleteSavedAnalysis(authUser.id, id).then(function(res) {
          if (res.error) {
            Toast.show({ type: 'error', text1: 'Erro ao excluir' });
          } else {
            var filtered = [];
            for (var i = 0; i < savedList.length; i++) {
              if (savedList[i].id !== id) filtered.push(savedList[i]);
            }
            setSavedList(filtered);
            Toast.show({ type: 'success', text1: 'Análise excluída' });
          }
        });
      }},
    ]);
  }

  function formatSavedDate(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr);
    var day = d.getDate(); if (day < 10) day = '0' + day;
    var month = d.getMonth() + 1; if (month < 10) month = '0' + month;
    var hrs = d.getHours(); if (hrs < 10) hrs = '0' + hrs;
    var mins = d.getMinutes(); if (mins < 10) mins = '0' + mins;
    return day + '/' + month + ' ' + hrs + ':' + mins;
  }

  // Render helpers
  function renderMktInput(label, val, setter, color) {
    return (
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, textAlign: 'center', marginBottom: 2 }}>{label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 6, borderWidth: 1, borderColor: color + '30', paddingHorizontal: 6, height: 34 }}>
          <TextInput value={val} onChangeText={setter} keyboardType="decimal-pad" placeholder="0.00"
            placeholderTextColor={C.dim}
            style={{ flex: 1, fontSize: 13, color: C.text, fontFamily: F.mono, padding: 0, textAlign: 'center' }} />
        </View>
      </View>
    );
  }

  function renderAnalysisBadge(analysis) {
    if (!analysis) return null;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6, backgroundColor: analysis.verdictColor + '18' }}>
        <Ionicons name={analysis.icon} size={14} color={analysis.verdictColor} />
        <Text style={{ fontSize: 12, fontWeight: '800', color: analysis.verdictColor, fontFamily: F.display }}>{analysis.verdict}</Text>
        <Text style={{ fontSize: 11, color: analysis.verdictColor + 'CC', fontFamily: F.mono }}>
          {(analysis.diffPct >= 0 ? '+' : '') + analysis.diffPct.toFixed(1) + '%'}
        </Text>
      </View>
    );
  }

  function renderOptionCard(tipo, theoMid, theoG, theoBA, mktMid, analysis, mktIV, color) {
    return (
      <View style={{ padding: 10, borderRadius: 10, backgroundColor: color + '06', borderWidth: 1, borderColor: color + '18', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Badge text={tipo} color={color} />
            <Text style={[{ fontSize: 13, fontWeight: '700', color: C.text, fontFamily: F.mono }, ps]}>{'BS R$ ' + fmt(theoMid)}</Text>
          </View>
          {analysis ? renderAnalysisBadge(analysis) : null}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 12, color: C.dim, fontFamily: F.mono }}>{'Δ ' + theoG.delta.toFixed(2)}</Text>
          <Text style={{ fontSize: 12, color: C.dim, fontFamily: F.mono }}>{'Γ ' + theoG.gamma.toFixed(4)}</Text>
          <Text style={{ fontSize: 12, color: C.dim, fontFamily: F.mono }}>{'Θ ' + theoG.theta.toFixed(4)}</Text>
          <Text style={{ fontSize: 12, color: C.dim, fontFamily: F.mono }}>{'ν ' + theoG.vega.toFixed(4)}</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.mono }}>{'Bid R$ ' + fmt(theoBA.bid)}</Text>
          <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.mono }}>{'Ask R$ ' + fmt(theoBA.ask)}</Text>
          <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.mono }}>{'Spread R$ ' + fmt(theoBA.ask - theoBA.bid)}</Text>
        </View>
        {analysis ? (
          <View style={{ gap: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: color + '12' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.mono }}>Mercado (mid)</Text>
              <Text style={[{ fontSize: 14, fontWeight: '700', color: analysis.verdictColor, fontFamily: F.mono }, ps]}>{'R$ ' + fmt(mktMid)}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.mono }}>Diferença</Text>
              <Text style={[{ fontSize: 12, fontWeight: '600', color: analysis.verdictColor, fontFamily: F.mono }, ps]}>
                {(analysis.diff >= 0 ? '+' : '') + 'R$ ' + fmt(Math.abs(analysis.diff)) + ' (' + (analysis.diffPct >= 0 ? '+' : '') + analysis.diffPct.toFixed(1) + '%)'}
              </Text>
            </View>
            {mktIV > 0 ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.mono }}>VI Mercado</Text>
                <Text style={[{ fontSize: 12, fontWeight: '600', color: C.opcoes, fontFamily: F.mono }, ps]}>
                  {(mktIV * 100).toFixed(1) + '% (modelo ' + (fIV * 100).toFixed(1) + '%)'}
                </Text>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 2, padding: 6, borderRadius: 6, backgroundColor: analysis.verdictColor + '08' }}>
              <Ionicons name="bulb-outline" size={13} color={analysis.verdictColor} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 12, color: analysis.verdictColor, fontFamily: F.body, lineHeight: 17 }}>
                {analysis.suggestion}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ gap: SIZE.gap }}>
      {/* Ticker selector + saved analyses button */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 12, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 }}>ATIVO</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}
          contentContainerStyle={{ gap: 5, paddingRight: 8 }}>
          {tickers.map(function(tk) {
            var isActive = chainTicker === tk && !showCustom;
            return (
              <TouchableOpacity key={tk} activeOpacity={0.7}
                onPress={function() { handleTickerChange(tk); }}
                style={{ paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6,
                  backgroundColor: isActive ? C.acoes + '25' : C.card,
                  borderWidth: 1, borderColor: isActive ? C.acoes : C.border }}>
                <Text style={{ fontSize: 12, fontWeight: isActive ? '700' : '500',
                  color: isActive ? C.acoes : C.sub, fontFamily: F.mono }}>{tk}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity activeOpacity={0.7}
            onPress={function() { setShowCustom(true); setChainTicker(null); }}
            style={{ paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6,
              backgroundColor: showCustom ? C.opcoes + '25' : C.card,
              borderWidth: 1, borderColor: showCustom ? C.opcoes : C.border }}>
            <Text style={{ fontSize: 12, fontWeight: showCustom ? '700' : '500',
              color: showCustom ? C.opcoes : C.sub, fontFamily: F.mono }}>+ Outro</Text>
          </TouchableOpacity>
        </ScrollView>
        {/* Saved analyses toggle */}
        <TouchableOpacity activeOpacity={0.7}
          onPress={function() { setShowSavedDD(!showSavedDD); }}
          accessibilityRole="button" accessibilityLabel="Análises salvas"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 6,
            backgroundColor: showSavedDD ? C.accent + '25' : C.card,
            borderWidth: 1, borderColor: showSavedDD ? C.accent : C.border }}>
          <Ionicons name={showSavedDD ? 'bookmark' : 'bookmark-outline'} size={14} color={showSavedDD ? C.accent : C.sub} />
          {savedList.length > 0 ? (
            <View style={{ backgroundColor: C.accent, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff', fontFamily: F.mono }}>{savedList.length}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      {/* Saved analyses dropdown */}
      {showSavedDD ? (
        <Glass padding={12}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Ionicons name="bookmark" size={14} color={C.accent} />
            <Text style={{ fontSize: 12, color: C.accent, fontFamily: F.mono, fontWeight: '600', letterSpacing: 0.5 }}>ANÁLISES SALVAS</Text>
          </View>
          {savedList.length === 0 ? (
            <Text style={{ fontSize: 12, color: C.dim, fontFamily: F.body, textAlign: 'center', paddingVertical: 12 }}>
              Nenhuma análise salva ainda
            </Text>
          ) : (
            <View style={{ gap: 6 }}>
              {savedList.map(function(item) {
                return (
                  <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                    padding: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: C.border }}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: C.text, fontFamily: F.mono }}>{item.ticker}</Text>
                        {item.strike ? (
                          <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.mono }}>{'@ ' + Number(item.strike).toFixed(2)}</Text>
                        ) : null}
                        {item.ai_analysis ? (
                          <View style={{ backgroundColor: C.accent + '25', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: C.accent, fontFamily: F.mono }}>IA</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono, marginTop: 2 }}>
                        {formatSavedDate(item.created_at) + (item.dte ? ' | DTE ' + item.dte + 'd' : '') + (item.option_style ? ' | ' + (item.option_style === 'americana' ? 'Amer.' : 'Eur.') : '')}
                      </Text>
                    </View>
                    <TouchableOpacity activeOpacity={0.7}
                      onPress={function() { handleLoadAnalysis(item); }}
                      accessibilityRole="button" accessibilityLabel={'Carregar análise de ' + item.ticker}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ padding: 6, borderRadius: 6, backgroundColor: C.accent + '15' }}>
                      <Ionicons name="download-outline" size={16} color={C.accent} />
                    </TouchableOpacity>
                    <TouchableOpacity activeOpacity={0.7}
                      onPress={function() { handleDeleteAnalysis(item.id); }}
                      accessibilityRole="button" accessibilityLabel={'Excluir análise de ' + item.ticker}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ padding: 6, borderRadius: 6, backgroundColor: C.red + '15' }}>
                      <Ionicons name="trash-outline" size={16} color={C.red} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}
        </Glass>
      ) : null}

      {/* Custom ticker input */}
      {showCustom ? (
        <Glass padding={14}>
          <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 1, marginBottom: 8 }}>TICKER PERSONALIZADO</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <View style={styles.simFieldInput}>
                <TextInput value={customTicker} onChangeText={setCustomTicker} placeholder="Ex: VALE3"
                  autoCapitalize="characters" style={styles.simFieldText} placeholderTextColor={C.dim} />
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.simFieldInput}>
                <TextInput value={customSpot} onChangeText={setCustomSpot} placeholder="Spot R$"
                  keyboardType="numeric" style={styles.simFieldText} placeholderTextColor={C.dim} />
                <Text style={styles.simFieldSuffix}>R$</Text>
              </View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <TouchableOpacity activeOpacity={0.7} onPress={handleFetchCustomSpot}
              style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: C.acoes + '15', borderWidth: 1, borderColor: C.acoes + '30', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
              {fetchingSpot ? (
                <ActivityIndicator size="small" color={C.acoes} />
              ) : (
                <Text style={{ fontSize: 12, fontWeight: '600', color: C.acoes, fontFamily: F.body }}>Buscar Preço</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7} onPress={handleCustomApply}
              style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: C.opcoes + '15', borderWidth: 1, borderColor: C.opcoes + '30', alignItems: 'center' }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: C.opcoes, fontFamily: F.body }}>Aplicar</Text>
            </TouchableOpacity>
          </View>
        </Glass>
      ) : null}

      {/* Spot editável + HV badge */}
      {apiSpot > 0 || spotOverride !== '' ? (
        <Glass padding={10}>
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 12, color: C.dim, fontFamily: F.mono }}>SPOT</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 8, borderWidth: 1, borderColor: spotOverride !== '' ? C.accent + '60' : C.border, paddingHorizontal: 8, height: 34 }}>
              <Text style={{ fontSize: 14, color: C.dim, fontFamily: F.mono, marginRight: 2 }}>R$</Text>
              <TextInput
                value={spotOverride !== '' ? spotOverride : fmt(apiSpot)}
                onChangeText={function(t) { setSpotOverride(t.replace(/[^0-9.,]/g, '')); }}
                onFocus={function() { if (spotOverride === '') setSpotOverride(fmt(apiSpot)); }}
                keyboardType="decimal-pad"
                style={{ fontSize: 18, fontWeight: '800', color: C.text, fontFamily: F.display, padding: 0, minWidth: 70, textAlign: 'center' }}
                maxFontSizeMultiplier={1.5}
              />
            </View>
            {spotOverride !== '' ? (
              <TouchableOpacity onPress={function() { setSpotOverride(''); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="refresh-outline" size={16} color={C.accent} />
              </TouchableOpacity>
            ) : null}
            {currentHV != null ? (
              <Badge text={'HV 20d: ' + currentHV.toFixed(0) + '%'} color={C.opcoes} />
            ) : null}
          </View>
        </Glass>
      ) : null}

      {spot <= 0 && !showCustom ? (
        <Glass padding={24}>
          <Text style={{ fontSize: 14, color: C.sub, fontFamily: F.body, textAlign: 'center' }}>
            Selecione um ativo ou toque em "+ Outro" para digitar um ticker.
          </Text>
        </Glass>
      ) : null}

      {/* ═══ STRIKE ═══ */}
      <Glass padding={14}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="calculator" size={16} color={C.accent} />
          <Text style={{ fontSize: 12, color: C.accent, fontFamily: F.mono, fontWeight: '700', letterSpacing: 0.8 }}>STRIKE</Text>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 8, borderWidth: 1.5, borderColor: C.accent + '50', paddingHorizontal: 10, height: 40 }}>
            <Text style={{ fontSize: 13, color: C.dim, fontFamily: F.mono, marginRight: 4 }}>R$</Text>
            <TextInput
              value={strikeInput}
              onChangeText={setStrikeInput}
              keyboardType="decimal-pad"
              placeholder="ex: 32.68"
              placeholderTextColor={C.dim}
              style={{ flex: 1, fontSize: 15, color: C.text, fontFamily: F.mono, padding: 0 }}
            />
          </View>
          {hasResult ? (
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>DIST</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: Math.abs(fDist) <= 2 ? C.yellow : C.sub, fontFamily: F.mono }}>
                {(fDist >= 0 ? '+' : '') + fDist.toFixed(1) + '%'}
              </Text>
            </View>
          ) : null}
        </View>
        {!hasResult ? (
          <Text style={{ fontSize: 12, color: C.dim, fontFamily: F.body, textAlign: 'center', marginTop: 10 }}>
            Digite o strike para calcular preço justo, gregas e comparar com o mercado
          </Text>
        ) : null}

        {/* Skew */}
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: C.dim, fontFamily: F.mono, letterSpacing: 0.6 }}>SKEW</Text>
          <Pill active={skewSel === 'auto'} color={C.accent} onPress={function() { setSkewSel('auto'); }}>
            {'Auto' + (skewSel === 'auto' && skewAutoLabel ? ' (' + skewAutoLabel + ')' : '')}
          </Pill>
          <Pill active={skewSel === '0'} color={C.dim} onPress={function() { setSkewSel('0'); }}>Flat</Pill>
          <Pill active={skewSel === '1'} color={C.opcoes} onPress={function() { setSkewSel('1'); }}>Leve</Pill>
          <Pill active={skewSel === '2'} color={C.yellow} onPress={function() { setSkewSel('2'); }}>Forte</Pill>
          <InfoTip text={"Auto: detecta o skew a partir dos preços de mercado (bid/ask) que você informar. Se put VI > call VI → skew. Sem dados de mercado, usa Leve.\n\nFlat: VI igual para todos os strikes.\nLeve: OTM levemente mais caras (padrão B3).\nForte: cenários de estresse."} />
        </View>

      </Glass>

      {/* ═══ INDICADORES ═══ */}
      <Glass padding={14}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <Ionicons name="analytics-outline" size={13} color={C.opcoes} />
          <Text style={{ fontSize: 12, color: C.opcoes, fontFamily: F.mono, fontWeight: '600', letterSpacing: 0.5 }}>INDICADORES</Text>
          <InfoTip text={"Preencha com dados da sua plataforma (ProfitChart, Tryd, etc.) para calcular o preço justo e ativar o Motor de Decisão com alertas automáticos."} size={12} />
        </View>
        {/* Linha 1: VI, DTE, Vol. Histórica */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Text style={styles.simFieldLabel}>VI (%)</Text>
              <InfoTip title="Volatilidade Implícita (VI)" text={"É a volatilidade que o mercado está \"embutindo\" no preço da opção. Quanto maior a VI, mais caro o prêmio.\n\nOnde encontrar: no ProfitChart, Tryd ou na sua corretora, busque por \"VI\" ou \"IV\" no book da opção.\n\nPara que serve aqui: é o principal input do modelo Black-Scholes para calcular o preço justo da opção. Também é comparada com a Vol. Histórica para saber se o prêmio está caro ou barato."} size={11} />
            </View>
            <View style={styles.simFieldInput}>
              <TextInput value={chainIV} onChangeText={setChainIV} keyboardType="decimal-pad"
                placeholder="ex: 35" placeholderTextColor={C.dim}
                style={styles.simFieldText} />
              <Text style={styles.simFieldSuffix}>%</Text>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Text style={styles.simFieldLabel}>DTE (dias)</Text>
              <InfoTip title="DTE (Days to Expiration)" text={"Dias até o vencimento da opção. Quanto menos dias, mais rápido a opção perde valor (efeito Theta).\n\nOnde encontrar: conte os dias corridos entre hoje e a data de vencimento da opção (incluindo o dia do vencimento).\n\nPara que serve aqui: é usado no cálculo Black-Scholes. Opções com DTE curto têm Theta acelerado, o que beneficia vendedores."} size={11} />
            </View>
            <View style={styles.simFieldInput}>
              <TextInput value={chainDTE} onChangeText={setChainDTE} keyboardType="numeric"
                placeholder="ex: 21" placeholderTextColor={C.dim}
                style={styles.simFieldText} />
              <Text style={styles.simFieldSuffix}>dias</Text>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Text style={styles.simFieldLabel}>Vol. Histórica</Text>
              <InfoTip title="Volatilidade Histórica (VH)" text={"Mede o quanto o preço do ativo oscilou no passado (geralmente últimos 20 ou 30 pregões), expressa em % anualizada.\n\nOnde encontrar: no ProfitChart, Tryd ou qualquer plataforma de análise técnica, busque por \"HV\" ou \"Vol. Histórica\" no painel do ativo base.\n\nPara que serve aqui: comparar com a VI (Volatilidade Implícita) para saber se o prêmio da opção está caro ou barato."} size={11} />
            </View>
            <View style={styles.simFieldInput}>
              <TextInput value={hvInput} onChangeText={setHvInput} keyboardType="decimal-pad"
                placeholder="ex: 28" placeholderTextColor={C.dim}
                style={styles.simFieldText} />
              <Text style={styles.simFieldSuffix}>%</Text>
            </View>
          </View>
        </View>
        {/* Linha 2: VWAP, Contratos em Aberto, Taxa */}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Text style={styles.simFieldLabel}>VWAP</Text>
              <InfoTip title="VWAP (Volume Weighted Average Price)" text={"Preço Médio Ponderado por Volume do dia. É o preço \"justo\" intradiário — quanto em média os participantes pagaram naquele dia, considerando o volume de cada negócio.\n\nOnde encontrar: no ProfitChart, Tryd ou Home Broker, ative o indicador VWAP no gráfico intradiário do ativo base.\n\nPara que serve aqui: se o Spot está acima do VWAP, há pressão compradora (tendência de alta). Se está abaixo, há pressão vendedora (tendência de baixa)."} size={11} />
            </View>
            <View style={styles.simFieldInput}>
              <Text style={{ fontSize: 12, color: C.dim, fontFamily: F.mono, marginRight: 2 }}>R$</Text>
              <TextInput value={vwapInput} onChangeText={setVwapInput} keyboardType="decimal-pad"
                placeholder="ex: 32.50" placeholderTextColor={C.dim}
                style={styles.simFieldText} />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Text style={styles.simFieldLabel}>Contr. Aberto</Text>
              <InfoTip title="Contratos em Aberto (Open Interest)" text={"Quantidade total de contratos de opções que ainda não foram encerrados (exercidos, expirados ou recomprados). Quanto maior, mais líquida é a opção.\n\nOnde encontrar: no book de ofertas da opção na sua corretora ou plataforma (ProfitChart, Tryd), geralmente aparece como \"OI\" ou \"Open Interest\".\n\nPara que serve aqui: opções com poucos contratos em aberto têm spread alto entre compra e venda — você pode ter dificuldade para entrar ou sair da operação a um preço justo.\n\nVocê pode digitar valores abreviados: 27,96m = 27.960.000 | 500k = 500.000"} size={11} />
            </View>
            <View style={styles.simFieldInput}>
              <TextInput value={oiInput} onChangeText={setOiInput} keyboardType="default"
                placeholder="ex: 27,96m" placeholderTextColor={C.dim}
                autoCapitalize="none"
                style={styles.simFieldText} />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Text style={styles.simFieldLabel}>Taxa</Text>
              <InfoTip title="Taxa Selic (livre de risco)" text={"Taxa básica de juros da economia brasileira, usada como taxa livre de risco no modelo Black-Scholes.\n\nEste valor é carregado automaticamente do seu perfil (configurado em Mais > Selic). Não precisa preencher manualmente.\n\nPara que serve aqui: quanto maior a taxa, maior o prêmio teórico das Calls e menor o das Puts."} size={11} />
            </View>
            <View style={[styles.simFieldInput, { backgroundColor: 'rgba(255,255,255,0.01)' }]}>
              <Text style={[styles.simFieldText, { color: C.dim }]}>{chainSelicRate.toFixed(2)}</Text>
              <Text style={styles.simFieldSuffix}>%</Text>
            </View>
          </View>
        </View>
        {chainIV === '' && chainDTE === '' && hvInput === '' && vwapInput === '' && oiInput === '' ? (
          <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.body, textAlign: 'center', marginTop: 6 }}>
            Preencha os indicadores da sua plataforma para calcular e gerar alertas
          </Text>
        ) : null}
      </Glass>

      {/* ═══ RESULTS (only when strike is valid) ═══ */}
      {hasResult ? (
        <View style={{ gap: SIZE.gap }}>

          {/* Context line */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12 }}>
            <Text style={{ fontSize: 12, color: C.opcoes, fontFamily: F.mono }}>
              {'VI: ' + (fIV * 100).toFixed(1) + '%' + (skewStrength > 0 ? ' (c/ skew)' : '')}
            </Text>
            <Text style={{ fontSize: 12, color: C.dim, fontFamily: F.mono }}>
              {'Black-Scholes | DTE ' + dteVal + 'd'}
            </Text>
          </View>

          {/* Market prices input */}
          <Glass padding={12}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Ionicons name="pricetags-outline" size={13} color={C.etfs} />
              <Text style={{ fontSize: 12, color: C.etfs, fontFamily: F.mono, fontWeight: '600', letterSpacing: 0.5 }}>PREÇOS DO MERCADO (opcional)</Text>
              <InfoTip text="Copie o bid e ask da sua corretora para comparar com o preço justo calculado pelo Black-Scholes. Isso revela se a opção está cara ou barata no mercado." size={12} />
            </View>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-end', marginBottom: 6 }}>
              <View style={{ width: 42, justifyContent: 'flex-end', paddingBottom: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: C.green, fontFamily: F.display, textAlign: 'center' }}>CALL</Text>
              </View>
              {renderMktInput('Bid', mktCallBid, setMktCallBid, C.green)}
              {renderMktInput('Ask', mktCallAsk, setMktCallAsk, C.green)}
            </View>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-end' }}>
              <View style={{ width: 42, justifyContent: 'flex-end', paddingBottom: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: C.red, fontFamily: F.display, textAlign: 'center' }}>PUT</Text>
              </View>
              {renderMktInput('Bid', mktPutBid, setMktPutBid, C.red)}
              {renderMktInput('Ask', mktPutAsk, setMktPutAsk, C.red)}
            </View>
            {!hasCallMkt && !hasPutMkt ? (
              <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.body, textAlign: 'center', marginTop: 4 }}>
                Copie o bid/ask da sua corretora para ver se está caro ou barato
              </Text>
            ) : null}
          </Glass>

          {/* CALL analysis card */}
          {renderOptionCard('CALL', fCallMid, fCallG, fCallBA, mcMid, callAnalysis, callMktIV, C.green)}

          {/* PUT analysis card */}
          {renderOptionCard('PUT', fPutMid, fPutG, fPutBA, mpMid, putAnalysis, putMktIV, C.red)}

          {/* Resumo rápido */}
          <Glass padding={12}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Ionicons name="document-text-outline" size={14} color={C.accent} />
              <Text style={{ fontSize: 12, color: C.accent, fontFamily: F.mono, fontWeight: '600', letterSpacing: 0.5 }}>RESUMO</Text>
            </View>
            <View style={{ gap: 4 }}>
              {[
                { l: 'CALL - Breakeven (venda)', v: 'R$ ' + fmt(fk + fCallMid), c: C.green },
                { l: 'PUT - Breakeven (venda)', v: 'R$ ' + fmt(fk - fPutMid), c: C.red },
                { l: 'Theta/dia CALL (100 opções)', v: 'R$ ' + fmt(fCallG.theta * 100), c: fCallG.theta > 0 ? C.green : C.red },
                { l: 'Theta/dia PUT (100 opções)', v: 'R$ ' + fmt(fPutG.theta * 100), c: fPutG.theta > 0 ? C.green : C.red },
                hasCallMkt ? { l: 'Prêmio mercado CALL (100)', v: 'R$ ' + fmt(mcMid * 100), c: C.text } : null,
                hasPutMkt ? { l: 'Prêmio mercado PUT (100)', v: 'R$ ' + fmt(mpMid * 100), c: C.text } : null,
              ].map(function(rr, i) {
                if (!rr) return null;
                return (
                  <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                    <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body }}>{rr.l}</Text>
                    <Text style={[{ fontSize: 13, fontWeight: '600', color: rr.c, fontFamily: F.mono }, ps]}>{rr.v}</Text>
                  </View>
                );
              })}
            </View>
          </Glass>

          {/* ═══ MOTOR DE DECISÃO — alertas de contexto ═══ */}
          {contextAlerts.length > 0 ? (
            <Glass padding={12} glow={C.opcoes}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Ionicons name="bulb-outline" size={14} color={C.opcoes} />
                <Text style={{ fontSize: 12, color: C.opcoes, fontFamily: F.mono, fontWeight: '600', letterSpacing: 0.5 }}>MOTOR DE DECISÃO</Text>
                <InfoTip text={"Alertas gerados cruzando a VI que você digitou com os indicadores de contexto (Vol. Histórica, VWAP, Contratos em Aberto). Quanto mais campos preencher, mais completa a análise."} size={12} />
              </View>
              <View style={{ gap: 8 }}>
                {contextAlerts.map(function(al, idx) {
                  return (
                    <View key={idx} style={{ padding: 10, borderRadius: 10, backgroundColor: al.color + '08', borderWidth: 1, borderColor: al.color + '18' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Ionicons name={al.icon} size={15} color={al.color} />
                        <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: al.color, fontFamily: F.display }}>{al.title}</Text>
                        <View style={{ backgroundColor: al.badgeColor + '25', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: al.badgeColor, fontFamily: F.mono }}>{al.badge}</Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body, lineHeight: 18 }}>{al.text}</Text>
                    </View>
                  );
                })}
              </View>
            </Glass>
          ) : null}

          {/* ═══ SALVAR ANÁLISE ═══ */}
          <TouchableOpacity activeOpacity={0.7} disabled={savingAnalysis}
            onPress={function() { handleSaveAnalysis(!!aiAnalysis); }}
            accessibilityRole="button" accessibilityLabel="Salvar análise atual"
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              gap: 6, paddingVertical: 10, borderRadius: SIZE.radius,
              backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
              opacity: savingAnalysis ? 0.5 : 1,
            }}>
            {savingAnalysis ? (
              <ActivityIndicator size="small" color={C.accent} />
            ) : (
              <Ionicons name="bookmark-outline" size={16} color={C.accent} />
            )}
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.accent, fontFamily: F.body }}>
              {savingAnalysis ? 'Salvando...' : 'Salvar análise'}
            </Text>
            {aiAnalysis ? (
              <View style={{ backgroundColor: C.accent + '25', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: C.accent, fontFamily: F.mono }}>+IA</Text>
              </View>
            ) : null}
          </TouchableOpacity>

          {/* ═══ TABELA DE STRIKES ═══ */}
          <Glass padding={12}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Ionicons name="grid-outline" size={13} color={C.accent} />
              <Text style={{ fontSize: 12, color: C.accent, fontFamily: F.mono, fontWeight: '600', letterSpacing: 0.5 }}>TABELA DE STRIKES</Text>
            </View>
            {/* Step filter */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}
              contentContainerStyle={{ gap: 4 }}>
              {['auto', '0.25', '0.50', '0.75', '1.00', '2.00', '5.00'].map(function(sv) {
                var isAct = tableStep === sv;
                var lbl = sv === 'auto' ? 'Auto (' + getB3StrikeStep(spot, chainTicker).toFixed(2) + ')' : 'R$ ' + sv;
                return (
                  <TouchableOpacity key={sv} activeOpacity={0.7}
                    onPress={function() { setTableStep(sv); }}
                    style={{ paddingVertical: 4, paddingHorizontal: 8, borderRadius: 5,
                      backgroundColor: isAct ? C.accent + '25' : C.card,
                      borderWidth: 1, borderColor: isAct ? C.accent : C.border }}>
                    <Text style={{ fontSize: 11, fontWeight: isAct ? '700' : '400',
                      color: isAct ? C.accent : C.sub, fontFamily: F.mono }}>{lbl}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {/* Header */}
            <View style={{ flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 2, borderBottomWidth: 1, borderBottomColor: C.border }}>
              <Text style={{ flex: 1.2, fontSize: 9, color: C.dim, fontFamily: F.mono, textAlign: 'center' }}>STRIKE</Text>
              <Text style={{ flex: 0.9, fontSize: 9, color: C.green + 'AA', fontFamily: F.mono, textAlign: 'center' }}>CALL</Text>
              <Text style={{ flex: 0.6, fontSize: 9, color: C.green + 'AA', fontFamily: F.mono, textAlign: 'center' }}>Delta</Text>
              <Text style={{ flex: 0.6, fontSize: 9, color: C.green + 'AA', fontFamily: F.mono, textAlign: 'center' }}>Theta</Text>
              <Text style={{ flex: 0.9, fontSize: 9, color: C.red + 'AA', fontFamily: F.mono, textAlign: 'center' }}>PUT</Text>
              <Text style={{ flex: 0.6, fontSize: 9, color: C.red + 'AA', fontFamily: F.mono, textAlign: 'center' }}>Delta</Text>
              <Text style={{ flex: 0.6, fontSize: 9, color: C.red + 'AA', fontFamily: F.mono, textAlign: 'center' }}>Theta</Text>
            </View>
            {/* Rows */}
            {miniTableData.map(function(row, mi) {
              var rowBgMini = row.isUser ? { backgroundColor: C.accent + '15' }
                : row.isAtm ? { backgroundColor: C.yellow + '08' }
                : (mi % 2 === 0) ? { backgroundColor: 'rgba(255,255,255,0.01)' } : null;
              var callIsOtm = spot <= row.sk;
              var putIsOtm = spot >= row.sk;
              return (
                <TouchableOpacity key={mi} activeOpacity={0.6}
                  onPress={function() { setStrikeInput(row.sk.toFixed(2)); }}
                  style={[{ flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 2, borderRadius: 4 }, rowBgMini]}>
                  <View style={{ flex: 1.2, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 2 }}>
                    {row.isUser ? <Ionicons name="chevron-forward" size={7} color={C.accent} /> : null}
                    <Text style={[{ fontSize: 11, fontFamily: F.mono, fontWeight: row.isUser ? '800' : '500', color: row.isUser ? C.accent : row.isAtm ? C.yellow : C.text }, ps]}>
                      {row.sk.toFixed(2)}
                    </Text>
                  </View>
                  <Text style={[{ flex: 0.9, fontSize: 10, fontFamily: F.mono, textAlign: 'center', color: callIsOtm ? C.sub : C.green, fontWeight: callIsOtm ? '400' : '600' }, ps]}>
                    {fmt(row.callP)}
                  </Text>
                  <Text style={[{ flex: 0.6, fontSize: 10, fontFamily: F.mono, textAlign: 'center', color: C.dim }, ps]}>
                    {row.callDelta.toFixed(2)}
                  </Text>
                  <Text style={[{ flex: 0.6, fontSize: 10, fontFamily: F.mono, textAlign: 'center', color: row.callTheta > 0 ? C.green + '80' : C.red + '80' }, ps]}>
                    {row.callTheta.toFixed(4)}
                  </Text>
                  <Text style={[{ flex: 0.9, fontSize: 10, fontFamily: F.mono, textAlign: 'center', color: putIsOtm ? C.sub : C.red, fontWeight: putIsOtm ? '400' : '600' }, ps]}>
                    {fmt(row.putP)}
                  </Text>
                  <Text style={[{ flex: 0.6, fontSize: 10, fontFamily: F.mono, textAlign: 'center', color: C.dim }, ps]}>
                    {row.putDelta.toFixed(2)}
                  </Text>
                  <Text style={[{ flex: 0.6, fontSize: 10, fontFamily: F.mono, textAlign: 'center', color: row.putTheta > 0 ? C.green + '80' : C.red + '80' }, ps]}>
                    {row.putTheta.toFixed(4)}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.body, textAlign: 'center', marginTop: 3 }}>
              Toque em um strike para analisar
            </Text>
          </Glass>

          {/* ═══ CENÁRIOS WHAT-IF ═══ */}
          <Glass glow={C.etfs} padding={12}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Ionicons name="git-branch-outline" size={14} color={C.etfs} />
              <Text style={{ fontSize: 12, color: C.etfs, fontFamily: F.mono, fontWeight: '600', letterSpacing: 0.5 }}>CENÁRIOS WHAT-IF</Text>
              <InfoTip text={"Se o ativo subir ou cair X%, qual será o novo preço da opção e o resultado (P&L) por unidade.\n\nVenda: lucro se opção fica mais barata.\nCompra: lucro se opção fica mais cara.\n\nConsidera DTE - 5 dias e VI ajustada."} size={12} />
            </View>
            <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body, marginBottom: 8 }}>
              {'Strike R$ ' + fmt(fk) + ' | Spot R$ ' + fmt(spot) + ' | DTE ' + dteVal + ' → ' + Math.max(1, dteVal - 5) + 'd'}
            </Text>
            {/* Header */}
            <View style={{ flexDirection: 'row', paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 4 }}>
              <Text style={{ width: 42, fontSize: 9, color: C.dim, fontFamily: F.mono }}>Ativo</Text>
              <Text style={{ width: 48, fontSize: 9, color: C.dim, fontFamily: F.mono, textAlign: 'center' }}>Spot</Text>
              <Text style={{ flex: 1, fontSize: 9, color: C.green + 'BB', fontFamily: F.mono, textAlign: 'center' }}>Call R$</Text>
              <Text style={{ flex: 1, fontSize: 9, color: C.green + 'BB', fontFamily: F.mono, textAlign: 'center' }}>P&L Vd</Text>
              <Text style={{ flex: 1, fontSize: 9, color: C.red + 'BB', fontFamily: F.mono, textAlign: 'center' }}>Put R$</Text>
              <Text style={{ flex: 1, fontSize: 9, color: C.red + 'BB', fontFamily: F.mono, textAlign: 'center' }}>P&L Vd</Text>
            </View>
            {/* Rows */}
            {[{ l: '+10%', m: 0.10 }, { l: '+5%', m: 0.05 }, { l: '-5%', m: -0.05 }, { l: '-10%', m: -0.10 }].map(function(sc, i) {
              var csc = calcScenario(sc.m, 'call');
              var psc = calcScenario(sc.m, 'put');
              if (!csc || !psc) return null;
              var cPL = csc.plVenda;
              var pPL = psc.plVenda;
              return (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: i < 3 ? 1 : 0, borderBottomColor: C.border + '30' }}>
                  <Text style={{ width: 42, fontSize: 12, fontWeight: '600', color: sc.m > 0 ? C.green : C.red, fontFamily: F.mono }}>{sc.l}</Text>
                  <Text style={[{ width: 48, fontSize: 11, color: C.sub, fontFamily: F.mono, textAlign: 'center' }, ps]}>
                    {fmt(csc.newSpot)}
                  </Text>
                  <Text style={[{ flex: 1, fontSize: 11, color: C.text, fontFamily: F.mono, textAlign: 'center' }, ps]}>
                    {fmt(csc.newPrice)}
                  </Text>
                  <Text style={[{ flex: 1, fontSize: 11, fontWeight: '600', color: cPL >= 0 ? C.green : C.red, fontFamily: F.mono, textAlign: 'center' }, ps]}>
                    {(cPL >= 0 ? '+' : '') + fmt(cPL)}
                  </Text>
                  <Text style={[{ flex: 1, fontSize: 11, color: C.text, fontFamily: F.mono, textAlign: 'center' }, ps]}>
                    {fmt(psc.newPrice)}
                  </Text>
                  <Text style={[{ flex: 1, fontSize: 11, fontWeight: '600', color: pPL >= 0 ? C.green : C.red, fontFamily: F.mono, textAlign: 'center' }, ps]}>
                    {(pPL >= 0 ? '+' : '') + fmt(pPL)}
                  </Text>
                </View>
              );
            })}
            <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body, marginTop: 6 }}>
              P&L Vd = resultado por opção se você vendeu. Positivo = lucro (opção desvalorizou). Negativo = prejuízo (opção valorizou).
            </Text>
          </Glass>

          {/* ═══ ANÁLISE IA ═══ */}
          <Glass padding={14}>
            <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.mono, letterSpacing: 0.8, fontWeight: '600', marginBottom: 8 }}>OBJETIVO DA ANÁLISE IA</Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {[
                { key: 'renda', label: 'Renda', icon: 'cash-outline' },
                { key: 'protecao', label: 'Proteção', icon: 'shield-outline' },
                { key: 'especulacao', label: 'Especulação', icon: 'trending-up-outline' },
              ].map(function(obj) {
                var sel = aiObjetivo === obj.key;
                return (
                  <TouchableOpacity key={obj.key} activeOpacity={0.7}
                    onPress={function() { setAiObjetivo(obj.key); }}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 5,
                      paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10,
                      backgroundColor: sel ? C.accent + '25' : 'transparent',
                      borderWidth: 1, borderColor: sel ? C.accent : C.border,
                    }}>
                    <Ionicons name={obj.icon} size={14} color={sel ? C.accent : C.dim} />
                    <Text style={{ fontSize: 12, fontWeight: sel ? '700' : '500', color: sel ? C.accent : C.sub, fontFamily: F.body }}>
                      {obj.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.mono, letterSpacing: 0.8, fontWeight: '600' }}>CAPITAL</Text>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 8, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, height: 36 }}>
                <Text style={{ fontSize: 13, color: C.dim, fontFamily: F.mono, marginRight: 4 }}>R$</Text>
                <TextInput value={aiCapital} keyboardType="numeric"
                  onChangeText={function(t) {
                    var nums = t.replace(/\D/g, '');
                    if (!nums) { setAiCapital(''); return; }
                    var n = parseInt(nums, 10);
                    setAiCapital(n.toLocaleString('pt-BR'));
                  }}
                  placeholder="10.000"
                  placeholderTextColor={C.dim}
                  style={{ flex: 1, fontSize: 13, color: C.text, fontFamily: F.mono, padding: 0 }} />
              </View>
              <InfoTip text={"Capital disponível para venda de put (CSP).\n\nSizing:\n• Venda Call: limitada pelas ações que você possui (coberta)\n• Venda Put: limitada pelo capital (margem = strike x 100)\n• Sugestão conservadora: 2-5% do capital por operação\n\nA IA usará esses dados para recomendar quantidade ideal."} size={13} />
            </View>
            {/* Sizing preview */}
            {aiCapital && parseFloat(aiCapital.replace(/\./g, '').replace(',', '.')) > 0 && hasResult ? (
              <View style={{ marginTop: 8, padding: 8, borderRadius: 8, backgroundColor: C.accent + '08', borderWidth: 1, borderColor: C.accent + '15' }}>
                {(function() {
                  var cap = parseFloat(aiCapital.replace(/\./g, '').replace(',', '.'));
                  var premCall = hasCallMkt ? mcMid : fCallMid;
                  var premPut = hasPutMkt ? mpMid : fPutMid;
                  var margemPut = fk * 100;

                  // Call coberta: baseada na qtd de ações que possui do ticker
                  var curPos = null;
                  for (var spi = 0; spi < positions.length; spi++) {
                    if (positions[spi].ticker && positions[spi].ticker.toUpperCase() === chainTicker.toUpperCase()) {
                      curPos = positions[spi]; break;
                    }
                  }
                  var sharesOwned = curPos ? (curPos.quantidade || 0) : 0;
                  var maxOpcoesCall = Math.floor(sharesOwned / 100) * 100;

                  // Put CSP: baseada no capital / margem (strike × 100)
                  var opcoesPut2 = margemPut > 0 ? Math.floor((cap * 0.02) / margemPut) * 100 : 0;
                  var opcoesPut5 = margemPut > 0 ? Math.floor((cap * 0.05) / margemPut) * 100 : 0;
                  var maxOpcoesPut = margemPut > 0 ? Math.floor(cap / margemPut) * 100 : 0;

                  return (
                    <View style={{ gap: 4 }}>
                      <Text style={{ fontSize: 11, color: C.accent, fontFamily: F.mono, fontWeight: '600', letterSpacing: 0.5 }}>SIZING ESTIMADO</Text>
                      {/* Call coberta — depende de ações em carteira */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.body }}>
                          {'Venda Call (coberta)'}
                        </Text>
                        {maxOpcoesCall > 0 ? (
                          <Text style={{ fontSize: 11, color: C.green, fontFamily: F.mono, fontWeight: '600' }}>
                            {maxOpcoesCall + ' opções (' + sharesOwned + ' ações)'}
                          </Text>
                        ) : (
                          <Text style={{ fontSize: 11, color: C.yellow, fontFamily: F.mono, fontWeight: '600' }}>
                            Sem ações em carteira
                          </Text>
                        )}
                      </View>
                      {/* Put CSP — depende do capital */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.body }}>
                          {'Venda Put (margem R$ ' + Math.round(margemPut).toLocaleString('pt-BR') + '/100 opções)'}
                        </Text>
                        <Text style={{ fontSize: 11, color: C.red, fontFamily: F.mono, fontWeight: '600' }}>
                          {opcoesPut2 + '-' + opcoesPut5 + ' opções'}
                        </Text>
                      </View>
                      {maxOpcoesCall > 0 ? (
                        <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body, marginTop: 2 }}>
                          {'Call: máx ' + maxOpcoesCall + ' opções cobertas. Put: 2-5% do capital (máx ' + maxOpcoesPut + ' opções).'}
                        </Text>
                      ) : (
                        <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body, marginTop: 2 }}>
                          {'Put: 2-5% do capital (máx ' + maxOpcoesPut + ' opções). Call descoberta requer margem.'}
                        </Text>
                      )}
                    </View>
                  );
                })()}
              </View>
            ) : null}
          </Glass>

          <TouchableOpacity activeOpacity={0.7} disabled={aiLoading || spot <= 0 || fk <= 0}
            onPress={handleAiAnalysis}
            accessibilityRole="button" accessibilityLabel="Analisar operação com inteligência artificial"
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              gap: 8, paddingVertical: 14, borderRadius: SIZE.radius,
              backgroundColor: C.accent + '18', borderWidth: 1, borderColor: C.accent + '40',
              opacity: (aiLoading || spot <= 0 || fk <= 0) ? 0.5 : 1,
            }}>
            {aiLoading ? (
              <ActivityIndicator size="small" color={C.accent} />
            ) : (
              <Ionicons name="sparkles-outline" size={18} color={C.accent} />
            )}
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.accent, fontFamily: F.display }}>
              {aiLoading ? 'Analisando...' : 'Analisar com IA'}
            </Text>
          </TouchableOpacity>

          {aiError ? (
            <View style={{ padding: 10, borderRadius: 10, backgroundColor: C.red + '10', borderWidth: 1, borderColor: C.red + '25' }}>
              <Text style={{ fontSize: 12, color: C.red, fontFamily: F.body, textAlign: 'center' }}>{aiError}</Text>
            </View>
          ) : null}

          {/* Button to re-open AI analysis if already generated */}
          {aiAnalysis && !aiLoading ? (
            <TouchableOpacity activeOpacity={0.7}
              onPress={function() { setAiModalOpen(true); }}
              accessibilityRole="button" accessibilityLabel="Ver análise da IA"
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 8, paddingVertical: 12, borderRadius: SIZE.radius,
                backgroundColor: C.accent + '10', borderWidth: 1, borderColor: C.accent + '30',
              }}>
              <Ionicons name="sparkles" size={16} color={C.accent} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.accent, fontFamily: F.display }}>
                Ver análise salva IA
              </Text>
            </TouchableOpacity>
          ) : null}

        </View>
      ) : null}

      {/* AI Analysis Modal */}
      <Modal visible={aiModalOpen} animationType="slide" transparent={false}
        onRequestClose={function() { setAiModalOpen(false); }}>
        <AiAnalysisModal analysis={aiAnalysis} onClose={function() { setAiModalOpen(false); }}
          onSave={function() { handleSaveAnalysis(true); }} />
      </Modal>
    </View>
  );
}

// ═══════════════════════════════════════
// MAIN OPCOES SCREEN
// ═══════════════════════════════════════
export default function OpcoesScreen() {
  var ps = usePrivacyStyle();
  var navigation = useNavigation();
  var user = useAuth().user;

  var scrollRef = useRef(null);
  useScrollToTop(scrollRef);

  var s1 = useState('ativas'); var sub = s1[0]; var setSub = s1[1];
  var s2 = useState([]); var opcoes = s2[0]; var setOpcoes = s2[1];
  var s3 = useState(true); var loading = s3[0]; var setLoading = s3[1];
  var s4 = useState(false); var refreshing = s4[0]; var setRefreshing = s4[1];
  var s5 = useState([]); var positions = s5[0]; var setPositions = s5[1];

  var s6 = useState(false); var pricesAvailable = s6[0]; var setPricesAvailable = s6[1];
  var s7 = useState([]); var expired = s7[0]; var setExpired = s7[1];
  var s8 = useState([]); var saldos = s8[0]; var setSaldos = s8[1];
  var s9 = useState(false); var exercicioAuto = s9[0]; var setExercicioAuto = s9[1];
  var s10 = useState({}); var indicators = s10[0]; var setIndicators = s10[1];
  var _selicSt = useState(13.25); var selicRate = _selicSt[0]; var setSelicRate = _selicSt[1];
  var _infoModal = useState(null); var infoModal = _infoModal[0]; var setInfoModal = _infoModal[1];
  var _loadError = useState(false); var loadError = _loadError[0]; var setLoadError = _loadError[1];
  var _tut = useState(-1); var tutStep = _tut[0]; var setTutStep = _tut[1];

  var load = async function() {
    if (!user) return;
    setLoadError(false);
    var results;
    try {
      results = await Promise.all([
        getOpcoes(user.id),
        getPositions(user.id),
        getSaldos(user.id),
        getIndicators(user.id),
        getProfile(user.id),
      ]);
    } catch (e) {
      console.warn('OpcoesScreen load failed:', e);
      setLoadError(true);
      setLoading(false);
      return;
    }

    var prof = results[4] && results[4].data ? results[4].data : null;
    if (prof && prof.selic) setSelicRate(prof.selic);

    // Build indicators map by ticker
    var indData = results[3].data || [];
    var indMap = {};
    for (var ii = 0; ii < indData.length; ii++) {
      indMap[indData[ii].ticker] = indData[ii];
    }
    setIndicators(indMap);

    // Trigger daily calculation if stale
    var lastCalc = indData.length > 0 ? indData[0].data_calculo : null;
    if (shouldCalculateToday(lastCalc)) {
      runDailyCalculation(user.id).then(function(calcResult) {
        if (calcResult.data && calcResult.data.length > 0) {
          var newMap = {};
          var mapKeys = Object.keys(indMap);
          for (var mk = 0; mk < mapKeys.length; mk++) {
            newMap[mapKeys[mk]] = indMap[mapKeys[mk]];
          }
          for (var ci = 0; ci < calcResult.data.length; ci++) {
            newMap[calcResult.data[ci].ticker] = calcResult.data[ci];
          }
          setIndicators(newMap);
        }
      }).catch(function(e) {
        console.warn('Indicator calc failed:', e);
      });
    }
    var allOpcoes = results[0].data || [];
    var rawPos = results[1].data || [];
    setSaldos(results[2].data || []);
    setPositions(rawPos);
    setLoading(false);

    // Detect expired options (ativa + vencimento D+1 <= hoje)
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var expiredList = [];
    var nonExpiredOpcoes = [];
    for (var ei = 0; ei < allOpcoes.length; ei++) {
      var o = allOpcoes[ei];
      var vencDate = new Date(o.vencimento);
      vencDate.setDate(vencDate.getDate() + 1);
      if (o.status === 'ativa' && vencDate <= today) {
        expiredList.push(o);
      } else {
        nonExpiredOpcoes.push(o);
      }
    }

    // Auto-exercise: resolve expired options automatically if enabled
    var alertasResult = await getAlertasConfig(user.id);
    var alertasConfig = alertasResult.data || {};
    setExercicioAuto(!!alertasConfig.exercicio_auto);
    if (alertasConfig.exercicio_auto && expiredList.length > 0) {
      // Fetch spot prices for expired option base tickers
      var autoTickers = [];
      for (var at = 0; at < expiredList.length; at++) {
        var atBase = expiredList[at].ativo_base;
        if (atBase && autoTickers.indexOf(atBase) === -1) {
          autoTickers.push(atBase);
        }
      }
      var autoSpots = {};
      if (autoTickers.length > 0) {
        try {
          var autoPrices = await fetchPrices(autoTickers);
          for (var ap = 0; ap < autoTickers.length; ap++) {
            var apTk = autoTickers[ap];
            if (autoPrices[apTk] && autoPrices[apTk].price) {
              autoSpots[apTk] = autoPrices[apTk].price;
            }
          }
        } catch (e) {
          console.warn('Auto-exercise price fetch failed:', e.message);
        }
      }

      var autoResolved = [];
      var autoSkipped = [];
      for (var ae = 0; ae < expiredList.length; ae++) {
        var autoOp = expiredList[ae];
        var autoTipo = (autoOp.tipo || 'call').toUpperCase();
        var autoStrike = autoOp.strike || 0;
        var autoSpot = autoSpots[autoOp.ativo_base] || 0;

        // Determinar se esta ITM: CALL spot >= strike, PUT spot <= strike
        var autoItm = false;
        if (autoSpot > 0) {
          if (autoTipo === 'CALL') {
            autoItm = autoSpot >= autoStrike;
          } else {
            autoItm = autoSpot <= autoStrike;
          }
        }

        if (autoItm) {
          // ITM: exercicio — criar operacao na carteira
          var autoIsVenda = autoOp.direcao === 'venda' || autoOp.direcao === 'lancamento';
          var autoOpTipo = '';
          if (autoTipo === 'CALL') {
            autoOpTipo = autoIsVenda ? 'venda' : 'compra';
          } else {
            autoOpTipo = autoIsVenda ? 'compra' : 'venda';
          }
          var autoResult = await supabase
            .from('opcoes')
            .update({ status: 'exercida' })
            .eq('id', autoOp.id);
          if (!autoResult.error) {
            await addOperacao(user.id, {
              ticker: autoOp.ativo_base,
              tipo: autoOpTipo,
              categoria: 'acao',
              quantidade: autoOp.quantidade,
              preco: autoOp.strike,
              corretora: autoOp.corretora || 'Clear',
              data: new Date().toISOString().split('T')[0],
            });
            // Log movimentacao no caixa
            var autoExValor = (autoOp.strike || 0) * (autoOp.quantidade || 0);
            if (autoExValor > 0 && autoOp.corretora) {
              addMovimentacaoComSaldo(user.id, {
                conta: autoOp.corretora,
                tipo: autoOpTipo === 'compra' ? 'saida' : 'entrada',
                categoria: 'exercicio_opcao',
                valor: autoExValor,
                descricao: 'Exercício auto ' + (autoOp.tipo || '').toUpperCase() + ' ' + (autoOp.ativo_base || ''),
                ticker: autoOp.ativo_base || null,
                referencia_tipo: 'opcao',
                data: new Date().toISOString().substring(0, 10),
              }).catch(function(e) { console.warn('Mov auto-exercicio failed:', e); });
            }
            var autoCopy = {};
            var autoKeys = Object.keys(autoOp);
            for (var ak = 0; ak < autoKeys.length; ak++) { autoCopy[autoKeys[ak]] = autoOp[autoKeys[ak]]; }
            autoCopy.status = 'exercida';
            autoResolved.push(autoCopy);
          }
        } else if (autoSpot > 0) {
          // OTM: expirou sem valor (PO)
          var poResult = await supabase
            .from('opcoes')
            .update({ status: 'expirou_po' })
            .eq('id', autoOp.id);
          if (!poResult.error) {
            var poCopy = {};
            var poKeys = Object.keys(autoOp);
            for (var pk = 0; pk < poKeys.length; pk++) { poCopy[poKeys[pk]] = autoOp[poKeys[pk]]; }
            poCopy.status = 'expirou_po';
            autoResolved.push(poCopy);
          }
        } else {
          // Sem preco disponivel — nao resolve, manda pra pendentes
          autoSkipped.push(autoOp);
        }
      }
      setExpired(autoSkipped);
      setOpcoes(nonExpiredOpcoes.concat(autoResolved));
      if (autoResolved.length > 0) {
        var exCount = autoResolved.filter(function(r) { return r.status === 'exercida'; }).length;
        var poCount = autoResolved.filter(function(r) { return r.status === 'expirou_po'; }).length;
        var msg = '';
        if (exCount > 0) msg = msg + exCount + ' exercida(s)';
        if (exCount > 0 && poCount > 0) msg = msg + ', ';
        if (poCount > 0) msg = msg + poCount + ' virou pó';
        Alert.alert('Exercício automático', msg);
      }
    } else {
      setExpired(expiredList);
      setOpcoes(nonExpiredOpcoes);
    }

    // Two-phase: enrich with real prices
    try {
      var enriched = await enrichPositionsWithPrices(rawPos);

      // Find option base tickers that are NOT in positions
      var posTickerSet = {};
      for (var pt = 0; pt < enriched.length; pt++) {
        posTickerSet[enriched[pt].ticker] = true;
      }
      var extraTickers = [];
      for (var xt = 0; xt < allOpcoes.length; xt++) {
        var ab = allOpcoes[xt].ativo_base;
        if (ab && !posTickerSet[ab] && extraTickers.indexOf(ab) === -1) {
          extraTickers.push(ab);
        }
      }

      // Fetch prices for extra tickers and add as synthetic positions
      if (extraTickers.length > 0) {
        var extraPrices = await fetchPrices(extraTickers);
        for (var ep = 0; ep < extraTickers.length; ep++) {
          var etk = extraTickers[ep];
          var eq = extraPrices[etk];
          enriched.push({
            ticker: etk,
            categoria: 'acao',
            quantidade: 0,
            pm: 0,
            preco_atual: eq ? eq.price : null,
            change_day: eq ? eq.changePercent : null,
          });
        }
      }

      setPositions(enriched);
      var hasAnyPrice = false;
      for (var i = 0; i < enriched.length; i++) {
        if (enriched[i].preco_atual != null) { hasAnyPrice = true; break; }
      }
      setPricesAvailable(hasAnyPrice);
    } catch (e) {
      console.warn('OpcoesScreen price enrichment failed:', e.message);
      setPricesAvailable(false);
    }
  };

  useFocusEffect(useCallback(function() { load(); }, [user]));

  var onRefresh = async function() {
    setRefreshing(true);
    clearPriceCache();
    await load();
    setRefreshing(false);
  };

  var handleDelete = function(id) {
    var op = null;
    for (var di = 0; di < opcoes.length; di++) { if (opcoes[di].id === id) { op = opcoes[di]; break; } }
    var detailMsg = op
      ? (op.tipo || '').toUpperCase() + ' ' + (op.ativo_base || '') + ' @ R$ ' + fmt(op.strike || 0) + '\n\nEssa ação não pode ser desfeita.'
      : 'Essa ação não pode ser desfeita.';
    Alert.alert('Excluir opção?', detailMsg, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir', style: 'destructive',
        onPress: async function() {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          var result = await supabase.from('opcoes').delete().eq('id', id);
          if (!result.error) {
            setOpcoes(opcoes.filter(function(o) { return o.id !== id; }));
          } else {
            Alert.alert('Erro', 'Falha ao excluir.');
          }
        },
      },
    ]);
  };

  var handleClose = async function(id, premFechamento, pl, dataFech, qtyClose) {
    // Find original option
    var original = null;
    for (var fi = 0; fi < opcoes.length; fi++) {
      if (opcoes[fi].id === id) { original = opcoes[fi]; break; }
    }
    if (!original) return;

    var isPartial = qtyClose < (original.quantidade || 0);

    if (isPartial) {
      // Partial close: reduce qty on original, insert new record as fechada
      var remainQty = (original.quantidade || 0) - qtyClose;
      var resUpdate = await supabase
        .from('opcoes')
        .update({ quantidade: remainQty })
        .eq('id', id);
      if (resUpdate.error) {
        console.warn('handleClose partial update error:', resUpdate.error);
        Alert.alert('Erro', 'Falha ao encerrar opção: ' + (resUpdate.error.message || ''));
        return;
      }
      var insertData = {
        user_id: original.user_id,
        ativo_base: original.ativo_base,
        ticker_opcao: original.ticker_opcao,
        tipo: original.tipo,
        direcao: original.direcao,
        strike: original.strike,
        premio: original.premio,
        quantidade: qtyClose,
        vencimento: original.vencimento,
        corretora: original.corretora,
        data_abertura: original.data_abertura || null,
        status: 'fechada',
        premio_fechamento: premFechamento,
        data_fechamento: dataFech || null,
      };
      var resInsert = await supabase
        .from('opcoes')
        .insert(insertData)
        .select();
      if (resInsert.error) {
        console.warn('handleClose partial insert error:', resInsert.error);
        // Retry without data_fechamento in case column doesn't exist
        delete insertData.data_fechamento;
        resInsert = await supabase.from('opcoes').insert(insertData).select();
        if (resInsert.error) {
          console.warn('handleClose partial insert retry error:', resInsert.error);
          Alert.alert('Erro', 'Falha ao registrar encerramento parcial: ' + (resInsert.error.message || ''));
          return;
        }
      }
      // Update local state
      var updated = [];
      for (var ci = 0; ci < opcoes.length; ci++) {
        if (opcoes[ci].id === id) {
          var copy = {};
          var keys = Object.keys(opcoes[ci]);
          for (var ck = 0; ck < keys.length; ck++) { copy[keys[ck]] = opcoes[ci][keys[ck]]; }
          copy.quantidade = remainQty;
          updated.push(copy);
        } else {
          updated.push(opcoes[ci]);
        }
      }
      if (resInsert.data && resInsert.data[0]) {
        updated.push(resInsert.data[0]);
      }
      setOpcoes(updated);
    } else {
      // Full close
      var updateData = { status: 'fechada', premio_fechamento: premFechamento, data_fechamento: dataFech || null };
      var result = await supabase
        .from('opcoes')
        .update(updateData)
        .eq('id', id);
      if (result.error) {
        console.warn('handleClose full update error:', result.error);
        // Retry without data_fechamento in case column doesn't exist
        delete updateData.data_fechamento;
        result = await supabase.from('opcoes').update(updateData).eq('id', id);
        if (result.error) {
          console.warn('handleClose full retry error:', result.error);
          Alert.alert('Erro', 'Falha ao encerrar opção: ' + (result.error.message || ''));
          return;
        }
      }
      var updated2 = [];
      for (var ci2 = 0; ci2 < opcoes.length; ci2++) {
        if (opcoes[ci2].id === id) {
          var copy2 = {};
          var keys2 = Object.keys(opcoes[ci2]);
          for (var ck2 = 0; ck2 < keys2.length; ck2++) { copy2[keys2[ck2]] = opcoes[ci2][keys2[ck2]]; }
          copy2.status = 'fechada';
          copy2.premio_fechamento = premFechamento;
          copy2.data_fechamento = dataFech || null;
          updated2.push(copy2);
        } else {
          updated2.push(opcoes[ci2]);
        }
      }
      setOpcoes(updated2);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    var plText = pl >= 0 ? '+R$ ' + fmt(pl) : '-R$ ' + fmt(Math.abs(pl));
    var partialText = isPartial ? ' (' + qtyClose + ' de ' + (original.quantidade || 0) + ')' : '';

    // Check if user has saldo for this corretora and offer to deduct recompra cost
    var recompraTotal = premFechamento * qtyClose;
    var corretora = original.corretora;
    var saldoMatch = null;
    if (corretora && recompraTotal > 0) {
      for (var si = 0; si < saldos.length; si++) {
        if ((saldos[si].corretora || saldos[si].name) === corretora) {
          saldoMatch = saldos[si];
          break;
        }
      }
    }

    if (saldoMatch) {
      var saldoAtual = saldoMatch.saldo || 0;
      Alert.alert(
        'Opção encerrada' + partialText,
        'P&L: ' + plText + '\n\nDescontar R$ ' + fmt(recompraTotal) + ' do saldo livre em ' + corretora + '?\n\nSaldo atual: R$ ' + fmt(saldoAtual),
        [
          { text: 'Não', style: 'cancel' },
          {
            text: 'Descontar',
            onPress: async function() {
              var saldoName = saldoMatch.corretora || saldoMatch.name;
              // Use addMovimentacaoComSaldo for atomic saldo update + log
              var resM = await addMovimentacaoComSaldo(user.id, {
                conta: saldoName,
                tipo: 'saida',
                categoria: 'recompra_opcao',
                valor: recompraTotal,
                descricao: 'Recompra ' + (original.tipo || '').toUpperCase() + ' ' + (original.ativo_base || ''),
                ticker: original.ativo_base || null,
                referencia_tipo: 'opcao',
                data: new Date().toISOString().substring(0, 10),
              });
              if (resM.error) {
                Alert.alert('Erro', 'Falha ao atualizar saldo: ' + (resM.error.message || ''));
              } else {
                var novoSaldo = saldoAtual - recompraTotal;
                // Update local saldos state
                var newSaldos = [];
                for (var sj = 0; sj < saldos.length; sj++) {
                  if (saldos[sj].id === saldoMatch.id) {
                    var sc = {};
                    var sk = Object.keys(saldos[sj]);
                    for (var skk = 0; skk < sk.length; skk++) { sc[sk[skk]] = saldos[sj][sk[skk]]; }
                    sc.saldo = novoSaldo;
                    newSaldos.push(sc);
                  } else {
                    newSaldos.push(saldos[sj]);
                  }
                }
                setSaldos(newSaldos);
                Alert.alert('Saldo atualizado', corretora + ': R$ ' + fmt(saldoAtual) + ' → R$ ' + fmt(novoSaldo));
              }
            },
          },
        ]
      );
    } else {
      Alert.alert('Opção encerrada' + partialText, 'P&L: ' + plText);
    }
  };

  var handleExpiredPo = async function(id) {
    var result = await supabase
      .from('opcoes')
      .update({ status: 'expirou_po' })
      .eq('id', id);
    if (result.error) {
      Alert.alert('Erro', 'Falha ao atualizar.');
      return;
    }
    setExpired(expired.filter(function(o) { return o.id !== id; }));
    // Move to opcoes list so it shows in historico
    var expOp = null;
    for (var fi = 0; fi < expired.length; fi++) {
      if (expired[fi].id === id) { expOp = expired[fi]; break; }
    }
    if (expOp) {
      var cp = {};
      var ks = Object.keys(expOp);
      for (var ki = 0; ki < ks.length; ki++) { cp[ks[ki]] = expOp[ks[ki]]; }
      cp.status = 'expirou_po';
      setOpcoes(opcoes.concat([cp]));
    }
    // Log movimentacao informativa (prêmio mantido)
    if (expOp) {
      var premTotal = (expOp.premio || 0) * (expOp.quantidade || 0);
      if (premTotal > 0 && expOp.corretora) {
        addMovimentacao(user.id, {
          conta: expOp.corretora,
          tipo: 'entrada',
          categoria: 'premio_opcao',
          valor: premTotal,
          descricao: 'Prêmio mantido - expirou PÓ ' + (expOp.ativo_base || ''),
          ticker: expOp.ativo_base || null,
          referencia_tipo: 'opcao',
          data: new Date().toISOString().substring(0, 10),
        }).catch(function(e) { console.warn('Mov expirou_po log failed:', e); });
      }
    }
    Alert.alert('Registrado', 'Opção virou pó. Prêmio mantido integralmente.');
  };

  var handleExercida = function(expOp) {
    var tipoUpper = (expOp.tipo || 'call').toUpperCase();
    var isLanc = expOp.direcao === 'lancamento' || expOp.direcao === 'venda';
    var opTipo = '';
    if (tipoUpper === 'CALL') {
      opTipo = isLanc ? 'venda' : 'compra';
    } else {
      opTipo = isLanc ? 'compra' : 'venda';
    }
    var qtyFmt = (expOp.quantidade || 0).toLocaleString('pt-BR');
    var descricao = 'Confirmar ' + opTipo + ' de ' + qtyFmt + ' ações de ' + expOp.ativo_base + ' a R$ ' + fmt(expOp.strike) + ' (' + (expOp.corretora || 'Clear') + ')';

    Alert.alert('Confirmar exercício', descricao, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Confirmar',
        onPress: async function() {
          var result = await supabase
            .from('opcoes')
            .update({ status: 'exercida' })
            .eq('id', expOp.id);
          if (result.error) {
            Alert.alert('Erro', 'Falha ao atualizar opção.');
            return;
          }
          // Criar operacao na carteira
          var opResult = await addOperacao(user.id, {
            ticker: expOp.ativo_base,
            tipo: opTipo,
            categoria: 'acao',
            quantidade: expOp.quantidade,
            preco: expOp.strike,
            corretora: expOp.corretora || 'Clear',
            data: new Date().toISOString().split('T')[0],
          });
          if (opResult.error) {
            Alert.alert('Aviso', 'Opção marcada como exercida, mas falha ao criar operação: ' + opResult.error.message);
          } else {
            // Log movimentacao do exercício
            var exValor = (expOp.strike || 0) * (expOp.quantidade || 0);
            if (exValor > 0 && expOp.corretora) {
              addMovimentacaoComSaldo(user.id, {
                conta: expOp.corretora,
                tipo: opTipo === 'compra' ? 'saida' : 'entrada',
                categoria: 'exercicio_opcao',
                valor: exValor,
                descricao: 'Exercício ' + (expOp.tipo || '').toUpperCase() + ' ' + (expOp.ativo_base || ''),
                ticker: expOp.ativo_base || null,
                referencia_tipo: 'opcao',
                data: new Date().toISOString().substring(0, 10),
              }).catch(function(e) { console.warn('Mov exercicio failed:', e); });
            }
            Alert.alert('Exercida!', 'Opção exercida e operação de ' + opTipo + ' registrada na carteira.');
          }
          setExpired(expired.filter(function(o) { return o.id !== expOp.id; }));
          // Move to opcoes for historico
          var cp2 = {};
          var ks2 = Object.keys(expOp);
          for (var ki2 = 0; ki2 < ks2.length; ki2++) { cp2[ks2[ki2]] = expOp[ks2[ki2]]; }
          cp2.status = 'exercida';
          setOpcoes(opcoes.concat([cp2]));
        },
      },
    ]);
  };

  var ativas = opcoes.filter(function(o) { return o.status === 'ativa'; });
  var historico = opcoes.filter(function(o) { return o.status !== 'ativa'; });

  // Totals - premio recebido no mes (D+1 da data_abertura)
  var now = new Date();
  var mesAtual = now.getMonth();
  var anoAtual = now.getFullYear();
  var premioMes = 0;
  for (var pmi = 0; pmi < ativas.length; pmi++) {
    var opPm = ativas[pmi];
    var dataRef = opPm.data_abertura || opPm.created_at || null;
    if (dataRef) {
      var dReceb = new Date(dataRef);
      dReceb.setDate(dReceb.getDate() + 1); // D+1
      if (dReceb.getMonth() === mesAtual && dReceb.getFullYear() === anoAtual) {
        premioMes += (opPm.premio || 0) * (opPm.quantidade || 0);
      }
    } else {
      // Sem data, considerar no mes atual como fallback
      premioMes += (opPm.premio || 0) * (opPm.quantidade || 0);
    }
  }

  // Theta/dia estimate
  var thetaDiaTotal = 0;
  ativas.forEach(function(op) {
    var spotPrice = 0;
    var matchPos = positions.find(function(p) { return p.ticker === op.ativo_base; });
    if (matchPos) spotPrice = matchPos.preco_atual || matchPos.pm || 0;
    var greeks = calcGreeks(op, spotPrice, selicRate);
    thetaDiaTotal += greeks.theta * (op.quantidade || 1);
  });

  // Vencimentos proximos (sorted)
  var vencimentos = ativas.slice().sort(function(a, b) {
    return new Date(a.vencimento) - new Date(b.vencimento);
  });

  // Stats para header da aba Ativas
  var totalPuts = 0;
  var totalCalls = 0;
  var totalATM = 0;
  var totalITM = 0;
  var totalVenc7d = 0;
  var nowMs = now.getTime();
  for (var si = 0; si < ativas.length; si++) {
    var sop = ativas[si];
    if ((sop.tipo || 'call').toLowerCase() === 'put') { totalPuts++; } else { totalCalls++; }
    var sSpot = 0;
    var sMatch = (positions || []).find(function(p) { return p.ticker === sop.ativo_base; });
    if (sMatch) sSpot = sMatch.preco_atual || sMatch.pm || 0;
    var sMon = getMoneyness(sop.tipo, sop.direcao, sop.strike, sSpot);
    if (sMon && sMon.label === 'ATM') totalATM++;
    if (sMon && sMon.label === 'ITM') totalITM++;
    var sDays = Math.ceil((new Date(sop.vencimento).getTime() - nowMs) / (1000 * 60 * 60 * 24));
    if (sDays >= 0 && sDays <= 7) totalVenc7d++;
  }

  if (loading) return <View style={styles.container}><SkeletonOpcoes /></View>;
  if (loadError) return (
    <View style={styles.container}>
      <EmptyState ionicon="alert-circle-outline" title="Erro ao carregar" description="Não foi possível carregar as opções. Verifique sua conexão e tente novamente." cta="Tentar novamente" onCta={function() { setLoading(true); load(); }} color={C.red} />
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1 }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />
      }
    >
      {/* SUB TABS — topo da página */}
      <View style={styles.subTabs}>
        {[
          { k: 'ativas', l: 'Ativas (' + ativas.length + ')', c: C.opcoes },
          { k: 'pendentes', l: 'Pend. (' + expired.length + ')', c: C.yellow },
          { k: 'sim', l: 'Calc.', c: C.opcoes },
          { k: 'hist', l: 'Hist. (' + historico.length + ')', c: C.opcoes },
        ].map(function(t) {
          return (
            <Pill key={t.k} active={sub === t.k} color={t.c} onPress={function() { setSub(t.k); }}>{t.l}</Pill>
          );
        })}
      </View>

      {/* PENDENTES TAB */}
      {sub === 'pendentes' && (
        <View style={{ gap: SIZE.gap }}>
          {exercicioAuto ? (
            <View style={{ padding: 10, borderRadius: 10, backgroundColor: C.opcoes + '10', borderWidth: 1, borderColor: C.opcoes + '25' }}>
              <Text style={{ fontSize: 12, color: C.opcoes, fontFamily: F.body, textAlign: 'center' }}>
                Exercício automático ativado — opções vencidas serão resolvidas automaticamente ao recarregar.
              </Text>
            </View>
          ) : null}
          {expired.length > 0 ? (
            <>
              <SectionLabel>OPÇÕES VENCIDAS</SectionLabel>
              {expired.map(function(expOp, ei) {
                var expTipo = (expOp.tipo || 'call').toUpperCase();
                var expPrem = (expOp.premio || 0) * (expOp.quantidade || 0);
                return (
                  <Glass key={expOp.id || ei} glow={C.red} padding={14} style={{
                    borderColor: C.red + '30', borderWidth: 1,
                  }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                        <Text style={styles.opTicker}>{expOp.ativo_base}</Text>
                        <Badge text={expTipo} color={expTipo === 'CALL' ? C.green : C.red} />
                        <Badge text={expOp.direcao === 'lancamento' || expOp.direcao === 'venda' ? 'VENDA' : 'COMPRA'} color={C.opcoes} />
                        <Badge text="VENCIDA" color={C.red} />
                      </View>
                      <Text style={[styles.opPremio, { color: C.green }, ps]}>+R$ {fmt(expPrem)}</Text>
                    </View>
                    {expOp.ticker_opcao ? (
                      <Text style={{ fontSize: 12, color: C.opcoes, fontFamily: F.mono, marginBottom: 4 }}>{expOp.ticker_opcao}</Text>
                    ) : null}
                    <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
                      <Text style={{ fontSize: 12, color: C.dim, fontFamily: F.mono }}>
                        Venc: {new Date(expOp.vencimento).toLocaleDateString('pt-BR')}
                      </Text>
                      <Text style={[{ fontSize: 12, color: C.dim, fontFamily: F.mono }, ps]}>
                        Strike: R$ {fmt(expOp.strike)}
                      </Text>
                      <Text style={{ fontSize: 12, color: C.dim, fontFamily: F.mono }}>
                        Qtd: {expOp.quantidade}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        onPress={function() { handleExpiredPo(expOp.id); }}
                        style={{ flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: C.green + '40', backgroundColor: C.green + '08', alignItems: 'center' }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '700', color: C.green, fontFamily: F.display }}>Virou Pó</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={function() { handleExercida(expOp); }}
                        style={{ flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: C.etfs + '40', backgroundColor: C.etfs + '08', alignItems: 'center' }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '700', color: C.etfs, fontFamily: F.display }}>Foi exercida</Text>
                      </TouchableOpacity>
                    </View>
                  </Glass>
                );
              })}
            </>
          ) : (
            <EmptyState
              ionicon="time-outline" title="Nenhuma opção pendente"
              description="Opções vencidas aparecerão aqui para resolução."
              color={C.yellow}
            />
          )}
        </View>
      )}

      {/* ATIVAS TAB */}
      {sub === 'ativas' && (
        <View style={{ gap: SIZE.gap }}>
          {ativas.length === 0 ? (
            <EmptyState
              ionicon="trending-up-outline" title="Nenhuma opção ativa"
              description="Lance opções para começar a receber prêmios."
              cta="Nova opção" onCta={function() { navigation.navigate('AddOpcao'); }}
              color={C.opcoes}
            />
          ) : (
            <>
              {/* Header stats */}
              <Glass glow={C.opcoes} padding={14}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                  {[
                    { l: 'PUTs', v: String(totalPuts), c: C.red },
                    { l: 'CALLs', v: String(totalCalls), c: C.green },
                    { l: 'ATM', v: String(totalATM), c: C.yellow },
                    { l: 'ITM', v: String(totalITM), c: C.red },
                    { l: 'VENC 7D', v: String(totalVenc7d), c: totalVenc7d > 0 ? C.red : C.dim },
                  ].map(function(m, i) {
                    return (
                      <View key={i} style={{ alignItems: 'center', flex: 1 }}>
                        <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 }}>{m.l}</Text>
                        <Text style={{ fontSize: 18, fontWeight: '800', color: m.c, fontFamily: F.display, marginTop: 2 }}>{m.v}</Text>
                      </View>
                    );
                  })}
                </View>
              </Glass>

              {/* BANNER: gregas usando PM */}
              {!pricesAvailable && positions.length > 0 ? (
                <View style={{ padding: 8, borderRadius: 8, backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.15)' }}>
                  <Text style={{ fontSize: 12, color: '#f59e0b', fontFamily: F.mono, textAlign: 'center' }}>
                    Gregas usando PM (cotações indisponíveis)
                  </Text>
                </View>
              ) : null}

              {/* Option cards */}
              {ativas.map(function(op, i) {
                return (
                  <OpCard key={op.id || i} op={op} positions={positions} saldos={saldos} indicators={indicators} selicRate={selicRate} setInfoModal={setInfoModal}
                    onEdit={function() { navigation.navigate('EditOpcao', { opcao: op }); }}
                    onDelete={function() { handleDelete(op.id); }}
                    onClose={handleClose}
                  />
                );
              })}

              {/* Vencimentos */}
              {vencimentos.length > 0 && (
                <View>
                  <SectionLabel>PRÓXIMOS VENCIMENTOS</SectionLabel>
                  {vencimentos.map(function(v, i) {
                    var daysLeft = Math.max(0, Math.ceil((new Date(v.vencimento) - new Date()) / (1000 * 60 * 60 * 24)));
                    var tipoLabel = (v.tipo || 'call').toUpperCase();
                    var dayColor = daysLeft <= 7 ? C.red : daysLeft <= 21 ? C.etfs : C.opcoes;

                    return (
                      <Glass key={v.id || i} padding={12} style={{ marginTop: i > 0 ? 6 : 0 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: dayColor }} />
                            <Text style={{ fontSize: 13, fontWeight: '600', color: C.text, fontFamily: F.display }}>
                              {v.ativo_base} {tipoLabel}
                            </Text>
                            {v.ticker_opcao ? (
                              <Text style={{ fontSize: 11, color: C.opcoes, fontFamily: F.mono }}>{v.ticker_opcao}</Text>
                            ) : null}
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.mono }}>
                              {new Date(v.vencimento).toLocaleDateString('pt-BR')}
                            </Text>
                            <Badge text={daysLeft + 'd'} color={dayColor} />
                          </View>
                        </View>
                      </Glass>
                    );
                  })}
                </View>
              )}

              {/* Add button */}
              <TouchableOpacity
                activeOpacity={0.8} style={styles.addBtn}
                onPress={function() { navigation.navigate('AddOpcao'); }}
              >
                <Text style={styles.addBtnText}>+ Nova Opcao</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* CALCULADORA TAB */}
      {sub === 'sim' && (
        <View style={{ gap: SIZE.gap }}>
          <SectionLabel>CALCULADORA DE OPÇÕES</SectionLabel>
          <CalculadoraOpcoes positions={positions} indicators={indicators} selicRate={selicRate} />
        </View>
      )}

      {/* HISTORICO TAB */}
      {sub === 'hist' && (
        <View style={{ gap: SIZE.gap }}>
          {historico.length === 0 ? (
            <Glass padding={24}>
              <Text style={{ fontSize: 14, color: C.sub, fontFamily: F.body, textAlign: 'center' }}>
                Nenhuma operação encerrada ainda.
              </Text>
            </Glass>
          ) : (
            <>
              {/* Summary */}
              <Glass padding={14}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                  {(function() {
                    var totalPL = 0;
                    for (var hi = 0; hi < historico.length; hi++) {
                      var h = historico[hi];
                      var hIsVenda = h.direcao === 'lancamento' || h.direcao === 'venda';
                      if (h.status === 'fechada' && h.premio_fechamento != null) {
                        if (hIsVenda) {
                          totalPL = totalPL + ((h.premio || 0) - (h.premio_fechamento || 0)) * (h.quantidade || 0);
                        } else {
                          totalPL = totalPL + ((h.premio_fechamento || 0) - (h.premio || 0)) * (h.quantidade || 0);
                        }
                      } else {
                        // Virou pó, expirada, exercida = full premium
                        totalPL = totalPL + (h.premio || 0) * (h.quantidade || 0);
                      }
                    }
                    var expiradas = historico.filter(function(o) { return o.status === 'expirou_po' || o.status === 'expirada'; }).length;
                    var exercidas = historico.filter(function(o) { return o.status === 'exercida'; }).length;
                    var fechadas = historico.filter(function(o) { return o.status === 'fechada'; }).length;
                    return [
                      { l: 'P&L TOTAL', v: (totalPL >= 0 ? '+' : '') + 'R$ ' + fmt(totalPL), c: totalPL >= 0 ? C.green : C.red },
                      { l: 'VIROU PÓ', v: String(expiradas), c: C.acoes },
                      { l: 'EXERCIDAS', v: String(exercidas), c: C.etfs },
                      { l: 'FECHADAS', v: String(fechadas), c: C.yellow },
                    ];
                  })().map(function(m, i) {
                    return (
                      <View key={i} style={{ alignItems: 'center', flex: 1 }}>
                        <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 }}>{m.l}</Text>
                        <Text style={[{ fontSize: 16, fontWeight: '800', color: m.c, fontFamily: F.display, marginTop: 2 }, m.l === 'P&L TOTAL' ? ps : null]}>{m.v}</Text>
                      </View>
                    );
                  })}
                </View>
              </Glass>

              {/* History list */}
              <Glass padding={0}>
                {historico.map(function(op, i) {
                  var tipoLabel = (op.tipo || 'call').toUpperCase();
                  var premTotal = (op.premio || 0) * (op.quantidade || 0);
                  var statusRaw = (op.status || 'encerrada').toUpperCase().replace('_', ' ');
                  var statusLabel = statusRaw === 'EXPIROU PO' ? 'VIROU PÓ' : statusRaw;
                  var statusMap = {
                    'VIROU PÓ': C.green,
                    'EXPIRADA': C.green,
                    'EXERCIDA': C.etfs,
                    'FECHADA': C.yellow,
                    'RECOMPRADA': C.opcoes,
                    'ENCERRADA': C.dim,
                    'ROLADA': C.accent,
                  };
                  var stColor = statusMap[statusLabel] || C.dim;

                  // P&L calculation
                  var isVendaHist = op.direcao === 'lancamento' || op.direcao === 'venda';
                  var isFechada = op.status === 'fechada';
                  var histPL = 0;
                  var histDisplayVal = '';
                  var histDisplayColor = C.green;
                  if (isFechada && op.premio_fechamento != null) {
                    if (isVendaHist) {
                      histPL = ((op.premio || 0) - (op.premio_fechamento || 0)) * (op.quantidade || 0);
                    } else {
                      histPL = ((op.premio_fechamento || 0) - (op.premio || 0)) * (op.quantidade || 0);
                    }
                    histDisplayColor = histPL >= 0 ? C.green : C.red;
                    histDisplayVal = (histPL >= 0 ? '+' : '') + 'R$ ' + fmt(histPL);
                  } else {
                    // Virou pó / expirada = full premium kept
                    histDisplayVal = '+R$ ' + fmt(premTotal);
                  }

                  return (
                    <View key={op.id || i}
                      style={[styles.histRow, i > 0 && { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)' }]}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[{ fontSize: 14, fontWeight: '700', color: C.text, fontFamily: F.display }, ps]}>
                            {op.ativo_base + ' ' + tipoLabel + ' ' + fmt(op.strike || 0)}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>
                            {new Date(op.vencimento).toLocaleDateString('pt-BR')}
                          </Text>
                          <Badge text={statusLabel} color={stColor} />
                          {op.corretora ? (
                            <Text style={{ fontSize: 12, color: C.dim, fontFamily: F.mono }}>{op.corretora}</Text>
                          ) : null}
                        </View>
                        {isFechada ? (
                          <View style={{ marginTop: 4, gap: 2 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Text style={[{ fontSize: 11, color: C.dim, fontFamily: F.mono }, ps]}>
                                {'Recompra: R$ ' + fmt(op.premio_fechamento || 0) + ' x ' + (op.quantidade || 0)}
                              </Text>
                              {op.data_fechamento ? (
                                <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>
                                  {'em ' + new Date(op.data_fechamento + 'T12:00:00').toLocaleDateString('pt-BR')}
                                </Text>
                              ) : null}
                            </View>
                            <View style={{ flexDirection: 'row', gap: 12, marginTop: 2 }}>
                              <Text style={[{ fontSize: 11, color: C.sub, fontFamily: F.mono }, ps]}>
                                {'Recebido: R$ ' + fmt(premTotal)}
                              </Text>
                              <Text style={[{ fontSize: 11, color: C.red, fontFamily: F.mono }, ps]}>
                                {'Recompra: R$ ' + fmt((op.premio_fechamento || 0) * (op.quantidade || 0))}
                              </Text>
                              <Text style={[{ fontSize: 11, fontWeight: '700', color: histPL >= 0 ? C.green : C.red, fontFamily: F.mono }, ps]}>
                                {'Resultado: ' + (histPL >= 0 ? '+' : '') + 'R$ ' + fmt(histPL)}
                              </Text>
                            </View>
                          </View>
                        ) : null}
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[{ fontSize: 15, fontWeight: '700', color: histDisplayColor, fontFamily: F.mono }, ps]}>
                          {histDisplayVal}
                        </Text>
                        {isFechada ? (
                          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, marginTop: 2 }}>P&L</Text>
                        ) : (
                          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, marginTop: 2 }}>Prêmio</Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </Glass>
            </>
          )}
        </View>
      )}

      <View style={{ height: SIZE.tabBarHeight + 20 }} />
    </ScrollView>

    <Modal visible={infoModal !== null} animationType="fade" transparent={true}
      onRequestClose={function() { setInfoModal(null); }}>
      <TouchableOpacity activeOpacity={1} onPress={function() { setInfoModal(null); }}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 30 }}>
        <TouchableOpacity activeOpacity={1}
          style={{ backgroundColor: C.card, borderRadius: 14, padding: 20, maxWidth: 340, width: '100%', borderWidth: 1, borderColor: C.border }}>
          <Text style={{ fontSize: 13, color: C.text, fontFamily: F.display, fontWeight: '700', marginBottom: 10 }}>
            {infoModal && infoModal.title || ''}
          </Text>
          <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body, lineHeight: 18 }}>
            {infoModal && infoModal.text || ''}
          </Text>
          <TouchableOpacity onPress={function() { setInfoModal(null); }}
            style={{ marginTop: 14, alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 8, borderRadius: 8, backgroundColor: C.accent }}>
            <Text style={{ fontSize: 12, color: C.text, fontFamily: F.mono, fontWeight: '600' }}>Fechar</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>

    {/* Tutorial Modal */}
    <Modal visible={tutStep >= 0} animationType="slide" transparent={true}
      onRequestClose={function() { setTutStep(-1); }}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%', borderWidth: 1, borderColor: C.opcoes + '25', borderBottomWidth: 0 }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="school" size={20} color={C.opcoes} />
              <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, fontFamily: F.display }}>Guia de Opções</Text>
            </View>
            <TouchableOpacity onPress={function() { setTutStep(-1); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button" accessibilityLabel="Fechar tutorial">
              <Ionicons name="close" size={22} color={C.sub} />
            </TouchableOpacity>
          </View>
          {/* Step indicator */}
          <View style={{ flexDirection: 'row', gap: 3, paddingHorizontal: 20, marginBottom: 4 }}>
            {TUTORIAL_STEPS.map(function(_, si) {
              return (
                <View key={si} style={{
                  flex: 1, height: 3, borderRadius: 2,
                  backgroundColor: si <= tutStep ? C.opcoes : 'rgba(255,255,255,0.08)',
                }} />
              );
            })}
          </View>
          <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono, textAlign: 'center', marginBottom: 8 }}>
            {(tutStep >= 0 ? tutStep + 1 : 1) + ' de ' + TUTORIAL_STEPS.length}
          </Text>
          {/* Content — scrollable */}
          <ScrollView style={{ paddingHorizontal: 20 }} contentContainerStyle={{ paddingBottom: 10 }} showsVerticalScrollIndicator={false}>
            {/* Icon + Title */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <View style={{
                width: 40, height: 40, borderRadius: 20,
                backgroundColor: C.opcoes + '18', borderWidth: 1, borderColor: C.opcoes + '30',
                justifyContent: 'center', alignItems: 'center',
              }}>
                <Ionicons
                  name={tutStep >= 0 && tutStep < TUTORIAL_STEPS.length ? TUTORIAL_STEPS[tutStep].icon : 'bulb-outline'}
                  size={20} color={C.opcoes} />
              </View>
              <Text style={{ fontSize: 17, fontWeight: '700', color: C.text, fontFamily: F.display, flex: 1 }}>
                {tutStep >= 0 && tutStep < TUTORIAL_STEPS.length ? TUTORIAL_STEPS[tutStep].title : ''}
              </Text>
            </View>
            {/* Text content */}
            <Text style={{ fontSize: 14, color: C.sub, fontFamily: F.body, lineHeight: 22 }}>
              {tutStep >= 0 && tutStep < TUTORIAL_STEPS.length ? TUTORIAL_STEPS[tutStep].text : ''}
            </Text>
          </ScrollView>
          {/* Navigation */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, gap: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
            {tutStep > 0 ? (
              <TouchableOpacity onPress={function() { setTutStep(tutStep - 1); }}
                accessibilityRole="button" accessibilityLabel="Passo anterior"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
                <Ionicons name="chevron-back" size={16} color={C.sub} />
                <Text style={{ fontSize: 13, color: C.sub, fontFamily: F.body, fontWeight: '600' }}>Anterior</Text>
              </TouchableOpacity>
            ) : <View />}
            {tutStep < TUTORIAL_STEPS.length - 1 ? (
              <TouchableOpacity onPress={function() { setTutStep(tutStep + 1); }}
                accessibilityRole="button" accessibilityLabel="Próximo passo"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: C.opcoes }}>
                <Text style={{ fontSize: 13, color: '#fff', fontFamily: F.display, fontWeight: '700' }}>Próximo</Text>
                <Ionicons name="chevron-forward" size={16} color="#fff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={function() { setTutStep(-1); }}
                accessibilityRole="button" accessibilityLabel="Fechar tutorial"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: C.green }}>
                <Ionicons name="checkmark-circle" size={16} color="#fff" />
                <Text style={{ fontSize: 13, color: '#fff', fontFamily: F.display, fontWeight: '700' }}>Entendi!</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>

    <Fab navigation={navigation} />
    </KeyboardAvoidingView>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 18, gap: SIZE.gap },
  subTabs: { flexDirection: 'row', gap: 6 },

  opTicker: { fontSize: 16, fontWeight: '700', color: C.text, fontFamily: F.display },
  opCode: { fontSize: 12, color: C.opcoes, fontFamily: F.mono, marginBottom: 6 },
  opPremio: { fontSize: 15, fontWeight: '700', fontFamily: F.mono },

  greeksRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 8, marginTop: 4,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)',
  },
  greekLabel: { fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 0.3 },
  greekValue: { fontSize: 12, color: C.sub, fontFamily: F.mono, fontWeight: '500', marginTop: 2 },

  actionLink: { fontSize: 12, color: C.accent, fontFamily: F.mono, fontWeight: '600' },

  addBtn: {
    backgroundColor: C.opcoes, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  addBtnText: { fontSize: 15, fontWeight: '700', color: 'white', fontFamily: F.display },

  histRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: 14,
  },

  simField: { width: '48%' },
  simFieldLabel: { fontSize: 12, color: C.dim, fontFamily: F.mono, marginBottom: 3 },
  simFieldInput: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1, borderColor: C.border, borderRadius: 10,
    paddingHorizontal: 10, height: 42,
  },
  simFieldText: { flex: 1, fontSize: 15, color: C.text, fontFamily: F.mono, padding: 0 },
  simFieldSuffix: { fontSize: 12, color: C.dim, fontFamily: F.mono, marginLeft: 4 },

  // Payoff chart
  payoffContainer: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  payoffTooltip: { position: 'absolute', backgroundColor: C.cardSolid, borderRadius: 6, padding: 6, borderWidth: 1, borderColor: C.border },

  // Cadeia
  chainRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  chainHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: C.border },
  chainCell: { flex: 1, alignItems: 'center' },
  chainStrike: { width: 60, alignItems: 'center' },
  chainPrice: { fontSize: 14, fontWeight: '700', color: C.text, fontFamily: F.mono },
  chainDelta: { fontSize: 12, color: C.dim, fontFamily: F.mono },
  chainItm: { backgroundColor: 'rgba(34,197,94,0.06)' },
  chainItmPut: { backgroundColor: 'rgba(239,68,68,0.06)' },
  chainAtm: { backgroundColor: 'rgba(245,158,11,0.06)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.15)' },

});
