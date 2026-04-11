import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, TextInput, Alert, Dimensions, Modal,
  ActivityIndicator, KeyboardAvoidingView, Platform, AppState,
} from 'react-native';
import Svg, { Line, Rect, Path, Text as SvgText } from 'react-native-svg';
import { useFocusEffect, useNavigation, useScrollToTop } from '@react-navigation/native';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { useAppStore } from '../../contexts/AppStoreContext';
import { getOpcoes, getPositions, getSaldos, addOperacao, getAlertasConfig, getIndicators, getProfile, updateProfile, addMovimentacaoComSaldo, addMovimentacao, getSavedAnalyses, addSavedAnalysis, deleteSavedAnalysis, updateOpcaoAlertaPL, getAlertasOpcoes, addAlertaOpcao, deleteAlertaOpcao, markAlertaDisparado, getPortfolios } from '../../services/database';
var notifService = require('../../services/notificationService');
var fractional = require('../../utils/fractional');
var formatQty = fractional.formatQty;
import { enrichPositionsWithPrices, clearPriceCache, fetchPrices, fetchPriceHistoryRange } from '../../services/priceService';
import { analyzeTechnicals, buildTechnicalSummary } from '../../services/technicalAnalysisService';
var fundamentalServiceMod = require('../../services/fundamentalService');
var fetchFundamentals = fundamentalServiceMod.fetchFundamentals;
import TechnicalChart from '../../components/TechnicalChart';
import { runDailyCalculation, shouldCalculateToday } from '../../services/indicatorService';
import { supabase } from '../../config/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Glass, Badge, Pill, SectionLabel, Fab, InfoTip, TickerInput, UpgradePrompt, AiAnalysisModal as SharedAiModal, AiConfirmModal } from '../../components';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { searchTickers } from '../../services/tickerSearchService';
import { SkeletonOpcoes, EmptyState } from '../../components/States';
import { usePrivacyStyle } from '../../components/Sensitive';
import Sensitive from '../../components/Sensitive';
import * as Haptics from 'expo-haptics';
import * as ScreenOrientation from 'expo-screen-orientation';
import Toast from 'react-native-toast-message';
var a11yUtils = require('../../utils/a11y');
var animateLayout = a11yUtils.animateLayout;
var geminiService = require('../../services/geminiService');
var analyzeOption = geminiService.analyzeOption;
var analyzeOptionStream = geminiService.analyzeOptionStream;
var analyzeGeneral = geminiService.analyzeGeneral;
var aiUsageService = require('../../services/aiUsageService');
var rateLimiter = require('../../utils/rateLimiter');

// Module-level: persiste entre mounts para sobreviver a background/tab switch
var _pendingAi = null; // { data, ts, result, error, done }
import AsyncStorage from '@react-native-async-storage/async-storage';
var oplabModule = require('../../services/oplabService');
var fetchOptionsChain = oplabModule.fetchOptionsChain;
var clearOplabCache = oplabModule.clearOplabCache;
var getCachedChain = oplabModule.getCachedChain;
var getCachedOptionData = oplabModule.getCachedOptionData;
var marketStatusModule = require('../../services/marketStatusService');
var getB3Status = marketStatusModule.getB3Status;
var isB3Open = marketStatusModule.isB3Open;
var opportunityModule = require('../../services/opportunityService');
var scanBatch = opportunityModule.scanBatch;
var abortScan = opportunityModule.abortScan;
var buildTickerList = opportunityModule.buildTickerList;
var getOpportunityMeta = opportunityModule.getOpportunityMeta;
var RADAR_TICKERS = opportunityModule.RADAR_TICKERS;
var dateUtils = require('../../utils/dateUtils');
var parseLocalDate = dateUtils.parseLocalDate;
var formatDateBR = dateUtils.formatDateBR;

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

function nextThirdFriday(currentVencIso) {
  // Given an ISO date string (vencimento atual), returns the 3rd Friday of the next month as DD/MM/YYYY
  var parts = currentVencIso.split('-');
  var year = parseInt(parts[0]);
  var month = parseInt(parts[1]) - 1; // 0-indexed
  // Move to next month
  month += 1;
  if (month > 11) { month = 0; year += 1; }
  // Calculate 3rd Friday of that month
  var d = new Date(year, month, 1);
  var dayOfWeek = d.getDay();
  var daysToFri = (5 - dayOfWeek + 7) % 7;
  var firstFri = 1 + daysToFri;
  var thirdFri = firstFri + 14;
  var dd = String(thirdFri).padStart(2, '0');
  var mm = String(month + 1).padStart(2, '0');
  return dd + '/' + mm + '/' + year;
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
  var daysLeft = Math.max(1, Math.ceil((parseLocalDate(op.vencimento) - new Date()) / (1000 * 60 * 60 * 24)));
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
  var cachedOption = props.cachedOption || null;
  var cachedChain = props.cachedChain || null;
  var onEdit = props.onEdit;
  var onDelete = props.onDelete;
  var onClose = props.onClose;
  var onRoll = props.onRoll;
  var onAlertaPLSave = props.onAlertaPLSave;
  var hideActions = props.hideActions || false;
  var showGroupAlert = props.showGroupAlert || false;
  var cardStyle = props.cardStyle || null;

  var _showClose = useState(false); var showClose = _showClose[0]; var setShowClose = _showClose[1];
  var _showRoll = useState(false); var showRoll = _showRoll[0]; var setShowRoll = _showRoll[1];
  var _showAlertaEditor = useState(false); var showAlertaEditor = _showAlertaEditor[0]; var setShowAlertaEditor = _showAlertaEditor[1];
  var _alertaInput = useState(op.alerta_pl != null ? String(op.alerta_pl) : ''); var alertaInput = _alertaInput[0]; var setAlertaInput = _alertaInput[1];
  var _premRecompra = useState(''); var premRecompra = _premRecompra[0]; var setPremRecompra = _premRecompra[1];
  var _dataFechamento = useState(todayBr()); var dataFechamento = _dataFechamento[0]; var setDataFechamento = _dataFechamento[1];
  var _qtyFechamento = useState(String(op.quantidade || 0)); var qtyFechamento = _qtyFechamento[0]; var setQtyFechamento = _qtyFechamento[1];
  var _showPayoff = useState(false); var showPayoff = _showPayoff[0]; var setShowPayoff = _showPayoff[1];
  // Roll states
  var _rollStrike = useState(String(op.strike || '')); var rollStrike = _rollStrike[0]; var setRollStrike = _rollStrike[1];
  var defaultRollVenc = op.vencimento ? nextThirdFriday(op.vencimento) : '';
  var _rollVenc = useState(defaultRollVenc); var rollVenc = _rollVenc[0]; var setRollVenc = _rollVenc[1];
  var dataFechamentoValid = dataFechamento.length === 10 && isValidDate(dataFechamento);
  var qtyFechamentoVal = parseInt(qtyFechamento) || 0;
  var qtyFechamentoValid = qtyFechamentoVal > 0 && qtyFechamentoVal <= (op.quantidade || 0);

  var tipoLabel = (op.tipo || 'call').toUpperCase();
  var isVenda = op.direcao === 'lancamento' || op.direcao === 'venda';
  var premTotal = (op.premio || 0) * (op.quantidade || 0);
  var daysLeft = Math.max(0, Math.ceil((parseLocalDate(op.vencimento) - new Date()) / (1000 * 60 * 60 * 24)));

  // Cobertura: CALL = acoes na mesma corretora, PUT = saldo na mesma corretora
  var cobertura = '';
  var coberturaColor = C.green;
  var coberturaDetail = '';

  if (tipoLabel === 'CALL' && isVenda) {
    // CALL vendida: checar acoes por corretora via por_corretora
    var posForAsset = null;
    var ativoBaseUp = (op.ativo_base || '').toUpperCase().trim();
    for (var ci = 0; ci < positions.length; ci++) {
      var posTicker = (positions[ci].ticker || '').toUpperCase().trim();
      if (posTicker === ativoBaseUp) {
        posForAsset = positions[ci];
        break;
      }
    }

    var qtyCorretora = 0;
    var qtyTotal = 0;
    if (posForAsset) {
      qtyTotal = posForAsset.quantidade || 0;
      if (posForAsset.por_corretora && op.corretora) {
        var corrKey = op.corretora.toUpperCase().trim();
        // Buscar por chave normalizada, original, ou iterar chaves
        qtyCorretora = posForAsset.por_corretora[corrKey] || posForAsset.por_corretora[op.corretora] || 0;
        if (qtyCorretora === 0) {
          var pcKeys = Object.keys(posForAsset.por_corretora);
          for (var pck = 0; pck < pcKeys.length; pck++) {
            if (pcKeys[pck].toUpperCase().trim() === corrKey) {
              qtyCorretora = posForAsset.por_corretora[pcKeys[pck]] || 0;
              break;
            }
          }
        }
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
    // PUT vendida (CSP): saldo + valor de ativos na mesma corretora (com haircut)
    var custoExercicio = (op.strike || 0) * (op.quantidade || 0);
    var saldoMatch = null;
    var opCorrUpper = op.corretora ? op.corretora.toUpperCase().trim() : '';
    for (var si = 0; si < saldos.length; si++) {
      var saldoCorr = (saldos[si].corretora || '').toUpperCase().trim();
      if (saldoCorr === opCorrUpper) {
        saldoMatch = saldos[si];
        break;
      }
    }
    var saldoVal = saldoMatch ? (saldoMatch.saldo || 0) : 0;

    // Somar valor dos ativos na mesma corretora (com haircut por categoria)
    var HAIRCUT_MAP = { acao: 0.80, fii: 0.70, etf: 0.85, stock_int: 0.75, rf: 0.95 };
    var garantiaValor = 0;
    if (op.corretora && positions && positions.length > 0) {
      for (var gi = 0; gi < positions.length; gi++) {
        var gPos = positions[gi];
        var qtyGarantia = 0;
        if (gPos.por_corretora) {
          qtyGarantia = gPos.por_corretora[opCorrUpper] || gPos.por_corretora[op.corretora] || 0;
          if (qtyGarantia === 0) {
            var gpcKeys = Object.keys(gPos.por_corretora);
            for (var gpck = 0; gpck < gpcKeys.length; gpck++) {
              if (gpcKeys[gpck].toUpperCase().trim() === opCorrUpper) {
                qtyGarantia = gPos.por_corretora[gpcKeys[gpck]] || 0;
                break;
              }
            }
          }
        }
        if (qtyGarantia > 0 && gPos.preco_atual > 0) {
          var haircut = HAIRCUT_MAP[gPos.categoria] || 0.70;
          garantiaValor = garantiaValor + (qtyGarantia * gPos.preco_atual * haircut);
        }
      }
    }
    var coberturaTotal = saldoVal + garantiaValor;

    if (coberturaTotal >= custoExercicio) {
      if (garantiaValor > 0 && saldoVal < custoExercicio) {
        cobertura = 'GARANTIDA';
        coberturaColor = C.green;
        coberturaDetail = 'Caixa R$ ' + fmt(saldoVal) + ' + ativos R$ ' + fmt(garantiaValor) + ' cobrem R$ ' + fmt(custoExercicio);
      } else {
        cobertura = 'GARANTIDA';
        coberturaColor = C.green;
        coberturaDetail = 'Caixa R$ ' + fmt(saldoVal) + ' em ' + op.corretora + ' cobre R$ ' + fmt(custoExercicio);
      }
    } else if (coberturaTotal > 0) {
      var pctCob = Math.round(coberturaTotal / custoExercicio * 100);
      cobertura = 'PARCIAL ' + pctCob + '%';
      coberturaColor = C.yellow;
      if (garantiaValor > 0) {
        coberturaDetail = 'Caixa R$ ' + fmt(saldoVal) + ' + ativos R$ ' + fmt(garantiaValor) + ' de R$ ' + fmt(custoExercicio);
      } else {
        coberturaDetail = 'Caixa R$ ' + fmt(saldoVal) + ' de R$ ' + fmt(custoExercicio) + ' em ' + op.corretora;
      }
    } else {
      cobertura = 'DESCOBERTA';
      coberturaColor = C.red;
      coberturaDetail = 'Sem garantia em ' + (op.corretora || 'nenhuma corretora') + ' (precisa R$ ' + fmt(custoExercicio) + ')';
    }
  } else if (isVenda) {
    cobertura = 'VENDA';
    coberturaColor = C.opcoes;
  } else {
    cobertura = 'COMPRA';
    coberturaColor = C.accent;
  }

  // Gregas + spot (prioriza preco_atual, fallback pm, fallback strike)
  var spotPrice = 0;
  var spotSource = '';
  var ativoBase = (op.ativo_base || '').toUpperCase().trim();
  for (var spi = 0; spi < positions.length; spi++) {
    var spTk = (positions[spi].ticker || '').toUpperCase().trim();
    if (spTk === ativoBase) {
      if (positions[spi].preco_atual != null && positions[spi].preco_atual > 0) {
        spotPrice = positions[spi].preco_atual;
      } else if (positions[spi].pm != null && positions[spi].pm > 0) {
        spotPrice = positions[spi].pm;
        spotSource = ' (PM)';
      }
      break;
    }
  }
  // Fallback: usar strike como referencia para gregas minimas
  if (spotPrice <= 0 && op.strike > 0) {
    spotPrice = op.strike;
    spotSource = ' (Strike)';
  }
  var greeks = calcGreeks(op, spotPrice, cardSelicRate);

  // Override com dados reais do cache OpLab (via props do pai)
  // OpLab retorna iv ja em percentual (ex: 33.24 = 33.24%)
  if (cachedOption && cachedOption.iv != null) {
    greeks.iv = cachedOption.iv;
    if (cachedOption.delta != null) greeks.delta = cachedOption.delta;
    if (cachedOption.gamma != null) greeks.gamma = cachedOption.gamma;
    if (cachedOption.theta != null) greeks.theta = cachedOption.theta;
    if (cachedOption.vega != null) greeks.vega = cachedOption.vega;
  }

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
    <Glass padding={14} style={[{
      backgroundColor: coberturaColor + '04',
      borderColor: coberturaColor + '12',
      borderWidth: 1,
    }, cardStyle]}>
      {/* Header: ticker + type + cobertura + moneyness + qty + premium */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, flexWrap: 'wrap', rowGap: 4 }}>
          <Text style={styles.opTicker}>{op.ativo_base}</Text>
          <Badge text={tipoLabel} color={tipoLabel === 'CALL' ? C.green : C.red} />
          <Badge text={isVenda ? 'VENDA' : 'COMPRA'} color={isVenda ? C.etfs : C.rf} />
          <Badge text={cobertura} color={coberturaColor} />
          {moneyness ? <Badge text={moneyness.label} color={moneyness.color} /> : null}
          <Badge text={daysLeft + 'd'} color={dayColor} />
          <Badge text={(op.quantidade || 0) + 'x'} color={C.accent} />
          {op._isGrouped ? <Badge text={'PM ' + op._groupCount + ' ops'} color={C.opcoes} /> : null}
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

      {/* Mercado: preco atual + P&L */}
      {(function() {
        var bid = cachedOption && cachedOption.bid != null ? cachedOption.bid : null;
        var ask = cachedOption && cachedOption.ask != null ? cachedOption.ask : null;
        var last = cachedOption && cachedOption.last != null ? cachedOption.last : null;
        var close = cachedOption && cachedOption.close != null ? cachedOption.close : null;
        // Preço de mercado: quando B3 fechada, usa close/last (bid/ask ficam zerados/irreais)
        // Quando aberta: venda usa ask (custo de recompra), compra usa bid (preço de venda)
        var marketPrice = null;
        var marketLabel = '';
        var mercadoAberto = isB3Open();
        if (!mercadoAberto) {
          // Mercado fechado: priorizar close > last > bid/ask
          if (close != null && close > 0) { marketPrice = close; marketLabel = 'Fechamento'; }
          else if (last != null && last > 0) { marketPrice = last; marketLabel = 'Último'; }
          else if (isVenda) {
            if (ask != null && ask > 0) { marketPrice = ask; marketLabel = 'Ask'; }
            else if (bid != null && bid > 0) { marketPrice = bid; marketLabel = 'Bid'; }
          } else {
            if (bid != null && bid > 0) { marketPrice = bid; marketLabel = 'Bid'; }
            else if (ask != null && ask > 0) { marketPrice = ask; marketLabel = 'Ask'; }
          }
        } else if (isVenda) {
          if (ask != null && ask > 0) { marketPrice = ask; marketLabel = 'Ask'; }
          else if (bid != null && bid > 0) { marketPrice = bid; marketLabel = 'Bid'; }
          else if (last != null && last > 0) { marketPrice = last; marketLabel = 'Último'; }
          else if (close != null && close > 0) { marketPrice = close; marketLabel = 'Fechamento'; }
        } else {
          if (bid != null && bid > 0) { marketPrice = bid; marketLabel = 'Bid'; }
          else if (ask != null && ask > 0) { marketPrice = ask; marketLabel = 'Ask'; }
          else if (last != null && last > 0) { marketPrice = last; marketLabel = 'Último'; }
          else if (close != null && close > 0) { marketPrice = close; marketLabel = 'Fechamento'; }
        }
        if (marketPrice == null) {
          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>MERCADO</Text>
              <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono, fontStyle: 'italic' }}>Preço indisponível</Text>
            </View>
          );
        }
        var plUnit = isVenda ? ((op.premio || 0) - marketPrice) : (marketPrice - (op.premio || 0));
        var plTotal = plUnit * (op.quantidade || 0);
        var plPct = (op.premio || 0) > 0 ? (plUnit / (op.premio || 0)) * 100 : 0;
        var plColor = plTotal >= 0 ? C.green : C.red;
        var plSign = plTotal >= 0 ? '+' : '';
        var hasAlerta = op.alerta_pl != null;
        var alertaAtingido = hasAlerta && (
          (op.alerta_pl >= 0 && plPct >= op.alerta_pl) ||
          (op.alerta_pl < 0 && plPct <= op.alerta_pl)
        );

        return (
          <View style={{ marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>MERCADO</Text>
                <Text style={[{ fontSize: 12, color: C.text, fontFamily: F.mono, fontWeight: '700' }, ps]}>
                  {'R$ ' + fmt(marketPrice)}
                </Text>
                <Text style={[{ fontSize: 9, color: C.dim, fontFamily: F.mono }, ps]}>
                  {mercadoAberto && bid != null && ask != null ? 'Bid ' + fmt(bid) + ' / Ask ' + fmt(ask) : marketLabel}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={[{ fontSize: 12, fontWeight: '800', color: plColor, fontFamily: F.mono }, ps]}>
                  {plSign + 'R$ ' + fmt(Math.abs(plTotal))}
                </Text>
                <Text style={[{ fontSize: 10, color: plColor, fontFamily: F.mono }, ps]}>
                  {plSign + plPct.toFixed(1) + '%'}
                </Text>
                {(!hideActions || showGroupAlert) ? <TouchableOpacity
                  onPress={function() { setShowAlertaEditor(!showAlertaEditor); }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name={hasAlerta ? 'notifications' : 'notifications-outline'}
                    size={16}
                    color={alertaAtingido ? C.yellow : (hasAlerta ? C.accent : C.dim)}
                  />
                </TouchableOpacity> : null}
              </View>
            </View>
            {(!hideActions || showGroupAlert) && alertaAtingido ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                <Badge text="ALERTA P&L" color={C.yellow} />
                <Text style={{ fontSize: 10, color: C.yellow, fontFamily: F.mono }}>
                  {'Alvo ' + (op.alerta_pl >= 0 ? '+' : '') + op.alerta_pl.toFixed(0) + '% atingido (' + plSign + plPct.toFixed(1) + '%)'}
                </Text>
              </View>
            ) : null}
            {(!hideActions || showGroupAlert) && showAlertaEditor ? (
              <View style={{ marginTop: 6, padding: 10, borderRadius: 8, backgroundColor: C.cardSolid, borderWidth: 1, borderColor: C.border }}>
                <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginBottom: 4 }}>ALERTA P&L (%)</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput
                    value={alertaInput}
                    onChangeText={setAlertaInput}
                    placeholder="Ex: 50 ou -20"
                    placeholderTextColor={C.dim}
                    keyboardType="numeric"
                    style={{
                      flex: 1, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
                      borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
                      fontSize: 13, color: C.text, fontFamily: F.mono,
                    }}
                  />
                  <TouchableOpacity
                    onPress={function() {
                      var val = alertaInput.trim() === '' ? null : parseFloat(alertaInput.replace(',', '.'));
                      if (onAlertaPLSave) onAlertaPLSave(op.id, val);
                      setShowAlertaEditor(false);
                    }}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: C.accent + '20' }}
                  >
                    <Text style={{ fontSize: 12, color: C.accent, fontFamily: F.display, fontWeight: '700' }}>
                      {alertaInput.trim() === '' ? 'Remover' : 'Salvar'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.mono, marginTop: 4 }}>
                  {'P&L atual: ' + plSign + plPct.toFixed(1) + '%. Positivo = avisar no lucro, negativo = avisar no prejuízo.'}
                </Text>
              </View>
            ) : null}
          </View>
        );
      })()}

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
          { l: 'Spot' + spotSource, v: spotPrice > 0 ? 'R$ ' + fmt(spotPrice) : '–' },
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
        var hv = cachedChain && cachedChain.ewma_current != null ? cachedChain.ewma_current
          : (ind && ind.hv_20 != null ? ind.hv_20 : null);
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
              {'VH: ' + hv.toFixed(0) + '%'}
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
            <TouchableOpacity onPress={function() { setInfoModal({ title: 'VH / VI', text: 'VH = volatilidade histórica 20d. VI = volatilidade implícita. VI > 130% VH = prêmio caro (venda favorecida). VI < 70% VH = prêmio barato (compra favorecida).' }); }}>
              <Text style={{ fontSize: 13, color: C.accent }}>ⓘ</Text>
            </TouchableOpacity>
          </View>
        );
      })()}

      {/* Bottom: actions */}
      {!hideActions ? (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 8 }}>
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <TouchableOpacity onPress={function() { setShowPayoff(!showPayoff); }}>
              <Text style={[styles.actionLink, { color: C.opcoes }]}>Payoff</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={function() { setShowClose(!showClose); setShowRoll(false); }}>
              <Text style={[styles.actionLink, { color: C.yellow }]}>Encerrar</Text>
            </TouchableOpacity>
            {op.status === 'ativa' && onRoll ? (
              <TouchableOpacity onPress={function() { setShowRoll(!showRoll); setShowClose(false); }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Ionicons name="swap-horizontal-outline" size={13} color={C.rf} />
                  <Text style={[styles.actionLink, { color: C.rf }]}>Rolar</Text>
                </View>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={onEdit}>
              <Text style={styles.actionLink}>Editar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onDelete}>
              <Text style={[styles.actionLink, { color: C.red }]}>Excluir</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Payoff chart */}
      {!hideActions && showPayoff ? (
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
      {!hideActions && showClose ? (
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

      {/* Roll panel */}
      {!hideActions && showRoll ? (function() {
        var rollRecompraVal = recompraVal;
        var rollDataValid = dataFechamentoValid;
        var rollQtyValid = qtyFechamentoValid;
        var rollVencValid = rollVenc.length === 10 && isValidDate(rollVenc);
        var rollVencFuture = rollVenc.length === 10 && (function() {
          var iso = brToIso(rollVenc);
          if (!iso) return false;
          var d = new Date(iso + 'T12:00:00');
          if (isNaN(d.getTime())) return false;
          var today = new Date(); today.setHours(0, 0, 0, 0);
          return d >= today;
        })();
        var rollStrikeVal = parseFloat(rollStrike) || 0;
        var canRoll = rollRecompraVal > 0 && rollDataValid && rollQtyValid && rollVencValid && rollVencFuture && rollStrikeVal > 0;
        return (
          <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.rf + '30' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Ionicons name="swap-horizontal-outline" size={14} color={C.rf} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: C.rf, fontFamily: F.display }}>ROLAGEM DE OPÇÃO</Text>
            </View>
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
            <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                <Ionicons name="arrow-forward-outline" size={12} color={C.rf} />
                <Text style={{ fontSize: 11, fontWeight: '600', color: C.rf, fontFamily: F.mono }}>NOVA OPÇÃO</Text>
              </View>
              <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginBottom: 4 }}>NOVO STRIKE (R$)</Text>
              <TextInput
                value={rollStrike}
                onChangeText={setRollStrike}
                placeholder={String(op.strike || '')}
                placeholderTextColor={C.dim}
                keyboardType="decimal-pad"
                style={[
                  {
                    backgroundColor: C.cardSolid, borderWidth: 1, borderColor: C.border,
                    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
                    fontSize: 15, color: C.text, fontFamily: F.body,
                  },
                  rollStrikeVal > 0 && { borderColor: C.green },
                ]}
              />
              <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginBottom: 4, marginTop: 10 }}>NOVO VENCIMENTO</Text>
              <TextInput
                value={rollVenc}
                onChangeText={function(t) { setRollVenc(maskDate(t)); }}
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
                  rollVenc.length === 10 && rollVencValid && rollVencFuture && { borderColor: C.green },
                  rollVenc.length === 10 && (!rollVencValid || !rollVencFuture) && { borderColor: C.red },
                ]}
              />
              {rollVenc.length === 10 && !rollVencFuture ? (
                <Text style={{ fontSize: 11, color: C.red, fontFamily: F.body, marginTop: 2 }}>Vencimento deve ser futuro</Text>
              ) : null}
            </View>
            {rollRecompraVal > 0 && rollQtyValid ? (function() {
              var rollPremTotal = (op.premio || 0) * qtyFechamentoVal;
              var rollPL = isVenda ? ((op.premio || 0) - rollRecompraVal) * qtyFechamentoVal : (rollRecompraVal - (op.premio || 0)) * qtyFechamentoVal;
              var rollPLPct = rollPremTotal > 0 ? (rollPL / rollPremTotal) * 100 : 0;
              return (
                <View style={{ marginTop: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>P&L DO ENCERRAMENTO</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[{ fontSize: 14, fontWeight: '800', color: rollPL >= 0 ? C.green : C.red, fontFamily: F.display }, ps]}>
                        {(rollPL >= 0 ? '+' : '') + 'R$ ' + fmt(rollPL)}
                      </Text>
                      <Text style={[{ fontSize: 11, fontWeight: '600', color: rollPL >= 0 ? C.green : C.red, fontFamily: F.mono }, ps]}>
                        {'(' + (rollPLPct >= 0 ? '+' : '') + rollPLPct.toFixed(1) + '%)'}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })() : null}
            <TouchableOpacity
              onPress={function() {
                if (!canRoll) return;
                if (onRoll) onRoll(op, rollRecompraVal, brToIso(dataFechamento), qtyFechamentoVal, rollStrikeVal, brToIso(rollVenc));
              }}
              disabled={!canRoll}
              style={{
                backgroundColor: canRoll ? C.rf : C.dim,
                borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 8,
                opacity: canRoll ? 1 : 0.4,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="swap-horizontal-outline" size={15} color="#000" />
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#000', fontFamily: F.display }}>Confirmar rolagem</Text>
              </View>
            </TouchableOpacity>
          </View>
        );
      })() : null}
    </Glass>
  );
});

// ═══════════════════════════════════════
// GROUPED OPTION CARD (posicao combinada + sub-cards)
// ═══════════════════════════════════════
function GroupedOpCard(props) {
  var combined = props.combined;
  var subOps = props.subOps;
  var positions = props.positions;
  var saldos = props.saldos;
  var indicators = props.indicators;
  var selicRate = props.selicRate;
  var setInfoModal = props.setInfoModal;
  var cachedOption = props.cachedOption;
  var cachedChain = props.cachedChain;
  var navigation = props.navigation;
  var handleDeleteFn = props.handleDelete;
  var handleCloseFn = props.handleClose;
  var handleGroupCloseFn = props.handleGroupClose;
  var handleRollFn = props.handleRoll;
  var handleAlertaPLSaveFn = props.handleAlertaPLSave;

  var _expanded = useState(false); var expanded = _expanded[0]; var setExpanded = _expanded[1];

  // Salvar alerta em todas as sub-operacoes do grupo
  var handleGroupAlertaSave = async function(opcaoId, valor) {
    for (var gi = 0; gi < subOps.length; gi++) {
      await handleAlertaPLSaveFn(subOps[gi].id, valor);
    }
  };

  // Encerrar grupo: intercepta onClose do OpCard e chama handleGroupClose
  var handleGroupCloseFromCard = function(ignoredId, premFechamento, pl, dataFech, qtyClose) {
    if (handleGroupCloseFn) {
      handleGroupCloseFn(subOps, premFechamento, dataFech, qtyClose);
    }
  };

  // Excluir grupo: confirma e deleta todas sub-ops
  var handleGroupDelete = function() {
    Alert.alert(
      'Excluir ' + subOps.length + ' operações?',
      (combined.tipo || '').toUpperCase() + ' ' + (combined.ativo_base || '') + ' @ R$ ' + (combined.strike || 0).toFixed(2) + '\n\n' + subOps.length + ' operações combinadas serão excluídas. Essa ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir todas', style: 'destructive',
          onPress: function() {
            for (var di = 0; di < subOps.length; di++) {
              handleDeleteFn(subOps[di].id);
            }
          },
        },
      ]
    );
  };

  // Rolar grupo: rola a primeira sub-op com qty total combinada
  var handleGroupRoll = function(op, premRecompra, dataFech, qtyClose, newStrike, newVenc) {
    // Fecha todas sub-ops via group close, depois rola
    if (handleGroupCloseFn) {
      handleGroupCloseFn(subOps, premRecompra, dataFech, combined.quantidade || 0);
    }
    // Navegar para AddOpcao pre-filled com novo strike/vencimento
    if (handleRollFn) {
      handleRollFn(combined, premRecompra, dataFech, qtyClose, newStrike, newVenc);
    }
  };

  return (
    <View>
      {/* Card principal com posicao combinada — acoes habilitadas */}
      <OpCard op={combined} positions={positions} saldos={saldos} indicators={indicators} selicRate={selicRate} setInfoModal={setInfoModal}
        cachedOption={cachedOption} cachedChain={cachedChain}
        showGroupAlert={true}
        onAlertaPLSave={handleGroupAlertaSave}
        onClose={handleGroupCloseFromCard}
        onDelete={handleGroupDelete}
        onEdit={function() { animateLayout(); setExpanded(true); }}
        onRoll={handleRollFn ? handleGroupRoll : null}
        cardStyle={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginBottom: 0 }}
      />
      {/* Botao para expandir operacoes individuais */}
      <TouchableOpacity
        onPress={function() { animateLayout(); setExpanded(!expanded); }}
        activeOpacity={0.7}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          paddingVertical: 8, marginTop: -2,
          backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
          borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
          borderTopWidth: 0,
        }}
      >
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={C.accent} />
        <Text style={{ fontSize: 11, color: C.accent, fontFamily: F.body, marginLeft: 4 }}>
          {expanded ? 'Ocultar detalhes' : combined._groupCount + ' operações — ver detalhes'}
        </Text>
      </TouchableOpacity>
      {/* Sub-cards individuais */}
      {expanded ? (
        <View style={{ marginTop: 6, marginLeft: 12, borderLeftWidth: 2, borderLeftColor: C.accent + '30', paddingLeft: 10, gap: 8 }}>
          {subOps.map(function(subOp, si) {
            var subCachedOp = getCachedOptionData(subOp.ativo_base, subOp.strike, subOp.tipo, subOp.vencimento);
            var subCachedCh = getCachedChain(subOp.ativo_base);
            return (
              <View key={subOp.id || si}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent + '60', marginRight: 6 }} />
                  <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>
                    {'Operação ' + (si + 1) + ' de ' + subOps.length + (subOp.data_abertura ? ' — ' + formatDateBR(subOp.data_abertura) : '')}
                  </Text>
                </View>
                <OpCard op={subOp} positions={positions} saldos={saldos} indicators={indicators} selicRate={selicRate} setInfoModal={setInfoModal}
                  cachedOption={subCachedOp} cachedChain={subCachedCh}
                  onEdit={function() { navigation.navigate('EditOpcao', { opcao: subOp }); }}
                  onDelete={function() { handleDeleteFn(subOp.id); }}
                  onClose={handleCloseFn}
                  onRoll={handleRollFn}
                  onAlertaPLSave={handleAlertaPLSaveFn}
                />
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

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
    text: 'Spot: preço atual do ativo no mercado.\n\nStrike: preço de exercício da opção. Quanto mais distante do spot, mais barata (OTM).\n\nPrêmio: valor da opção por unidade. Se você vende 100 opções a R$1,20, recebe R$120 bruto.\n\nVI (Volatilidade Implícita): expectativa do mercado sobre oscilação futura. VI alta = prêmios maiores = bom para vender.\n\nDTE: dias até o vencimento. Mais DTE = mais prêmio, mas mais risco de movimento.\n\nQtd: número total de opções (não contratos).\n\n⚠ Valores de prêmios exibidos são brutos. O valor líquido creditado na conta pode ser menor devido a impostos (IR 15%), corretagem, emolumentos e outras taxas.',
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
    text: 'VH 20d (Volatilidade Histórica):\nOscilação real do ativo nos últimos 20 dias. Compare com VI: se VI > VH, prêmios estão caros (bom para vender).\n\nRSI 14:\n• > 70: sobrecomprado (possível queda)\n• < 30: sobrevendido (possível alta)\n• 30-70: neutro\n\nBeta:\n• > 1.2: mais volátil que o mercado\n• < 0.8: mais defensivo\n• = 1: acompanha o mercado\n\nMax Drawdown:\nMaior queda do pico ao vale. Indica risco histórico máximo.\n\nSMA/EMA: médias móveis — suporte e resistência dinâmicos.\nATR: amplitude média diária — útil para definir stops.\nBB Width: largura das Bandas de Bollinger — baixa = baixa volatilidade (breakout próximo).',
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
  var onRetry = props.onRetry;
  var aiTechOhlcv = props.techOhlcv;
  var aiTechAnalysis = props.techAnalysis;
  var aiSpot = props.spot;
  var aiStrikePrice = props.strikePrice;
  var _saved = useState(false); var saved = _saved[0]; var setSaved = _saved[1];

  // Reset saved state when analysis changes (new analysis generated)
  useEffect(function() { setSaved(false); }, [analysis]);

  if (!analysis) return null;

  var isTruncated = analysis._meta && analysis._meta.truncated;

  var isSmartAnalysis = !!(analysis.panorama || analysis.estrategia_1);
  var secs = isSmartAnalysis ? [
    { key: 'panorama', label: 'PANORAMA DO ATIVO', icon: 'eye-outline', color: C.rf },
    { key: 'estrategia_1', label: 'ESTRATÉGIA RECOMENDADA', icon: 'trophy-outline', color: C.accent },
    { key: 'estrategia_2', label: 'ESTRATÉGIA ALTERNATIVA', icon: 'swap-horizontal-outline', color: C.etfs },
    { key: 'riscos', label: 'RISCOS E CENÁRIOS', icon: 'shield-checkmark-outline', color: C.red },
    { key: 'educacional', label: 'POR QUE ESTAS ESTRATÉGIAS', icon: 'school-outline', color: C.green },
  ] : [
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
        {aiTechOhlcv && aiTechAnalysis ? (
          <Glass padding={10}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <Ionicons name="analytics-outline" size={11} color={C.opcoes} />
              <Text style={{ fontSize: 10, color: C.opcoes, fontFamily: F.mono, fontWeight: '600' }}>CONTEXTO TÉCNICO</Text>
              {aiTechAnalysis.trend ? (
                <View style={{
                  backgroundColor: (aiTechAnalysis.trend.direction === 'up' ? C.green : aiTechAnalysis.trend.direction === 'down' ? C.red : C.etfs) + '20',
                  paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3,
                }}>
                  <Text style={{
                    fontSize: 8, fontWeight: '700', fontFamily: F.mono,
                    color: aiTechAnalysis.trend.direction === 'up' ? C.green : aiTechAnalysis.trend.direction === 'down' ? C.red : C.etfs,
                  }}>
                    {aiTechAnalysis.trend.label.toUpperCase()}
                  </Text>
                </View>
              ) : null}
            </View>
            <TechnicalChart
              ohlcv={aiTechOhlcv}
              analysis={aiTechAnalysis}
              spot={aiSpot}
              strikePrice={aiStrikePrice > 0 ? aiStrikePrice : null}
              height={140}
              width={Dimensions.get('window').width - SIZE.padding * 2 - 20}
              color={C.opcoes}
              compact={true}
            />
          </Glass>
        ) : null}
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

        {isTruncated ? (
          <Glass glow={C.yellow} padding={14}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Ionicons name="warning-outline" size={16} color={C.yellow} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: C.yellow, fontFamily: F.display }}>Resposta parcial</Text>
            </View>
            <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body, lineHeight: 18, marginBottom: 10 }}>
              A análise foi truncada por limite de tokens. Algumas seções podem estar incompletas.
            </Text>
            {onRetry ? (
              <TouchableOpacity onPress={onRetry} style={{
                backgroundColor: C.yellow + '20', borderWidth: 1, borderColor: C.yellow + '40',
                borderRadius: 8, paddingVertical: 8, alignItems: 'center',
              }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: C.yellow, fontFamily: F.display }}>Tentar novamente</Text>
              </TouchableOpacity>
            ) : null}
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
  var navigation = useNavigation();
  var positions = props.positions || [];
  var indicatorsMap = props.indicators || {};
  var chainSelicRate = props.selicRate || 13.25;
  var ativas = props.ativas || [];
  var subCtx = props.subCtx;
  var pendingRadarTicker = props.pendingRadarTicker || null;
  var setPendingRadarTicker = props.setPendingRadarTicker || null;

  // Custom ticker entries (persisted across re-renders)
  var _customEntries = useState({}); var customEntries = _customEntries[0]; var setCustomEntries = _customEntries[1];

  var authUser = useAuth().user;

  // Watchlist + Favoritos — persistidos no Supabase (profiles JSONB)
  var _watchlist = useState([]); var watchlist = _watchlist[0]; var setWatchlist = _watchlist[1];
  var _showWatchlistInput = useState(false); var showWatchlistInput = _showWatchlistInput[0]; var setShowWatchlistInput = _showWatchlistInput[1];
  var _favorites = useState([]); var favorites = _favorites[0]; var setFavorites = _favorites[1];

  // Load watchlist + favorites from Supabase (with AsyncStorage migration)
  useEffect(function() {
    if (!authUser || !authUser.id) return;
    getProfile(authUser.id).then(function(res) {
      var profile = res.data;
      if (!profile) return;
      var dbWatchlist = profile.opcoes_watchlist || [];
      var dbFavorites = profile.opcoes_favorites || [];

      // Migrate from AsyncStorage if Supabase is empty
      var WATCHLIST_KEY = '@premiolab_opcoes_watchlist';
      var FAVORITES_KEY = '@premiolab_opcoes_favorites';
      var needsMigration = false;

      AsyncStorage.multiGet([WATCHLIST_KEY, FAVORITES_KEY]).then(function(stores) {
        var localWl = null;
        var localFav = null;
        try { if (stores[0][1]) localWl = JSON.parse(stores[0][1]); } catch(e) {}
        try { if (stores[1][1]) localFav = JSON.parse(stores[1][1]); } catch(e) {}

        // Merge: Supabase wins, AsyncStorage fills gaps
        var finalWl = dbWatchlist.length > 0 ? dbWatchlist : (localWl || []);
        var finalFav = dbFavorites.length > 0 ? dbFavorites : (localFav || []);

        setWatchlist(finalWl);
        setFavorites(finalFav);

        // If we migrated from local, persist to Supabase and clean local
        if (dbWatchlist.length === 0 && localWl && localWl.length > 0) needsMigration = true;
        if (dbFavorites.length === 0 && localFav && localFav.length > 0) needsMigration = true;

        if (needsMigration) {
          var updates = {};
          if (dbWatchlist.length === 0 && localWl && localWl.length > 0) updates.opcoes_watchlist = localWl;
          if (dbFavorites.length === 0 && localFav && localFav.length > 0) updates.opcoes_favorites = localFav;
          updateProfile(authUser.id, updates).then(function() {
            AsyncStorage.multiRemove([WATCHLIST_KEY, FAVORITES_KEY]).catch(function() {});
          });
        } else if (localWl || localFav) {
          // Supabase already has data, clean local
          AsyncStorage.multiRemove([WATCHLIST_KEY, FAVORITES_KEY]).catch(function() {});
        }
      });
    });
  }, [authUser && authUser.id]);

  function saveWatchlist(list) {
    setWatchlist(list);
    if (authUser && authUser.id) {
      updateProfile(authUser.id, { opcoes_watchlist: list }).catch(function() {});
    }
  }

  function saveFavorites(list) {
    setFavorites(list);
    if (authUser && authUser.id) {
      updateProfile(authUser.id, { opcoes_favorites: list }).catch(function() {});
    }
  }

  function addToWatchlist(tk) {
    var upper = tk.toUpperCase().trim();
    if (!upper || upper.length < 4) return;
    if (watchlist.indexOf(upper) !== -1) return;
    var next = watchlist.slice();
    next.push(upper);
    next.sort();
    saveWatchlist(next);
  }

  function removeFromWatchlist(tk) {
    var next = [];
    for (var wi = 0; wi < watchlist.length; wi++) {
      if (watchlist[wi] !== tk) next.push(watchlist[wi]);
    }
    saveWatchlist(next);
  }

  function toggleFavorite(tk) {
    var upper = tk.toUpperCase().trim();
    if (!upper) return;
    var idx = favorites.indexOf(upper);
    var next;
    if (idx !== -1) {
      // Remove
      next = [];
      for (var fi = 0; fi < favorites.length; fi++) {
        if (favorites[fi] !== upper) next.push(favorites[fi]);
      }
    } else {
      // Add
      next = favorites.slice();
      next.push(upper);
      next.sort();
    }
    saveFavorites(next);
  }

  function isFavorite(tk) {
    return favorites.indexOf(tk) !== -1;
  }

  // Unique tickers — only BR ações/FIIs (com opções na B3), sorted alphabetically
  var portfolioTickers = [];
  var tickerSpots = {};
  for (var ti = 0; ti < positions.length; ti++) {
    var pt = positions[ti];
    var cat = pt.categoria || '';
    var merc = pt.mercado || 'BR';
    if (merc !== 'BR') continue;
    if (cat === 'etf' || cat === 'rf') continue;
    if (portfolioTickers.indexOf(pt.ticker) === -1) {
      portfolioTickers.push(pt.ticker);
      tickerSpots[pt.ticker] = pt.preco_atual || pt.pm || 0;
    }
  }
  portfolioTickers.sort();

  // Watchlist-only: tickers added by user that are NOT in portfolio
  var watchlistOnly = [];
  for (var ws = 0; ws < watchlist.length; ws++) {
    if (portfolioTickers.indexOf(watchlist[ws]) === -1) {
      watchlistOnly.push(watchlist[ws]);
    }
  }
  watchlistOnly.sort();

  // Combined tickers for default selection
  var allTickers = [];
  for (var pt2 = 0; pt2 < portfolioTickers.length; pt2++) {
    if (allTickers.indexOf(portfolioTickers[pt2]) === -1) allTickers.push(portfolioTickers[pt2]);
  }
  for (var wo2 = 0; wo2 < watchlistOnly.length; wo2++) {
    if (allTickers.indexOf(watchlistOnly[wo2]) === -1) allTickers.push(watchlistOnly[wo2]);
  }
  var tickers = allTickers;

  // Merge custom entries (from "+ Outro")
  var ceKeys = Object.keys(customEntries);
  for (var ce = 0; ce < ceKeys.length; ce++) {
    var ceKey = ceKeys[ce];
    if (tickers.indexOf(ceKey) === -1) tickers.push(ceKey);
    tickerSpots[ceKey] = customEntries[ceKey];
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

  // Consumir ticker vindo do Radar
  useEffect(function() {
    if (!pendingRadarTicker) return;
    var tk = pendingRadarTicker.toUpperCase().trim();
    // Limpar cache do ticker para forcar dados frescos (Radar cacheia durante scan)
    clearOplabCache(tk);
    // Se o ticker ja esta selecionado, forcar refresh manual (useEffect [chainTicker] nao dispara)
    var sameTicker = chainTicker === tk;
    if (tickers.indexOf(tk) === -1) {
      setFetchingSpot(true);
      fetchPrices([tk]).then(function(priceMap) {
        var p = priceMap && priceMap[tk];
        if (p && p.price) {
          var next = {};
          var prevKeys = Object.keys(customEntries);
          for (var ci = 0; ci < prevKeys.length; ci++) {
            next[prevKeys[ci]] = customEntries[prevKeys[ci]];
          }
          next[tk] = p.price;
          setCustomEntries(next);
        }
        setChainTicker(tk);
        if (sameTicker) doFetchChain(false);
        setFetchingSpot(false);
      }).catch(function() { setChainTicker(tk); if (sameTicker) doFetchChain(false); setFetchingSpot(false); });
    } else {
      setChainTicker(tk);
      if (sameTicker) doFetchChain(false);
    }
    if (setPendingRadarTicker) setPendingRadarTicker(null);
  }, [pendingRadarTicker]);

  var handleTickerChange = function(tk) {
    setChainTicker(tk);
    setShowCustom(false);
    setShowWatchlistInput(false);
    setSpotOverride('');
    setStrikeInput('');
    setMktCallBid('');
    setMktCallAsk('');
    setMktPutBid('');
    setMktPutAsk('');
    // If ticker has no spot price yet (watchlist/favorites not in portfolio), fetch it
    if (tk && !tickerSpots[tk] && !customEntries[tk]) {
      setFetchingSpot(true);
      fetchPrices([tk]).then(function(priceMap) {
        var p = priceMap && priceMap[tk];
        if (p && p.price) {
          var next = {};
          var prevKeys = Object.keys(customEntries);
          for (var ci = 0; ci < prevKeys.length; ci++) {
            next[prevKeys[ci]] = customEntries[prevKeys[ci]];
          }
          next[tk] = p.price;
          setCustomEntries(next);
        }
        setFetchingSpot(false);
      }).catch(function() {
        setFetchingSpot(false);
      });
    }
  };

  var handleCustomSearch = function() {
    var tk = customTicker.toUpperCase().trim();
    if (!tk || tk.length < 2) return;
    setFetchingSpot(true);
    fetchPrices([tk]).then(function(priceMap) {
      var p = priceMap && priceMap[tk];
      if (p && p.price) {
        var next = {};
        var prevKeys = Object.keys(customEntries);
        for (var ci = 0; ci < prevKeys.length; ci++) {
          next[prevKeys[ci]] = customEntries[prevKeys[ci]];
        }
        next[tk] = p.price;
        setCustomEntries(next);
        setChainTicker(tk);
        setShowCustom(false);
        setShowWatchlistInput(false);
        setSpotOverride('');
        setCustomTicker('');
      } else {
        Alert.alert('Ticker não encontrado', 'Não foi possível buscar o preço de ' + tk + '. Verifique se o ticker está correto.');
      }
      setFetchingSpot(false);
    }).catch(function() {
      Alert.alert('Erro', 'Falha ao buscar preço. Tente novamente.');
      setFetchingSpot(false);
    });
  };

  var handleCustomAddToList = function() {
    var tk = customTicker.toUpperCase().trim();
    if (!tk || tk.length < 4) return;
    setFetchingSpot(true);
    fetchPrices([tk]).then(function(priceMap) {
      var p = priceMap && priceMap[tk];
      if (p && p.price) {
        addToWatchlist(tk);
        var next = {};
        var prevKeys = Object.keys(customEntries);
        for (var ci = 0; ci < prevKeys.length; ci++) {
          next[prevKeys[ci]] = customEntries[prevKeys[ci]];
        }
        next[tk] = p.price;
        setCustomEntries(next);
        setChainTicker(tk);
        setShowCustom(false);
        setShowWatchlistInput(false);
        setSpotOverride('');
        setCustomTicker('');
        Toast.show({ type: 'success', text1: tk + ' adicionado à lista de análise' });
      } else {
        Alert.alert('Ticker não encontrado', 'Não foi possível buscar o preço de ' + tk + '. Verifique se o ticker está correto.');
      }
      setFetchingSpot(false);
    }).catch(function() {
      Alert.alert('Erro', 'Falha ao buscar preço. Tente novamente.');
      setFetchingSpot(false);
    });
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
  var _aiConfirmVisible = useState(false); var aiConfirmVisible = _aiConfirmVisible[0]; var setAiConfirmVisible = _aiConfirmVisible[1];
  var _pendingAiType = useState(''); var pendingAiType = _pendingAiType[0]; var setPendingAiType = _pendingAiType[1];
  var _aiError = useState(null); var aiError = _aiError[0]; var setAiError = _aiError[1];
  var _aiModalOpen = useState(false); var aiModalOpen = _aiModalOpen[0]; var setAiModalOpen = _aiModalOpen[1];
  var _aiObj = useState('renda'); var aiObjetivo = _aiObj[0]; var setAiObjetivo = _aiObj[1];
  var _aiCapital = useState(''); var aiCapital = _aiCapital[0]; var setAiCapital = _aiCapital[1];
  var _aiUsage = useState(null); var aiUsage = _aiUsage[0]; var setAiUsage = _aiUsage[1];
  var _aiStreamText = useState(''); var aiStreamText = _aiStreamText[0]; var setAiStreamText = _aiStreamText[1];
  var _aiAbortRef = useRef(null);

  // Recuperar analise IA pendente ao voltar do background ou re-focus
  function recoverPendingAi() {
    if (!_pendingAi) return;
    if (_pendingAi.done && _pendingAi.result) {
      setAiAnalysis(_pendingAi.result);
      setAiLoading(false);
      setAiError(null);
      setAiModalOpen(true);
      _pendingAi = null;
    } else if (_pendingAi.done && _pendingAi.error) {
      setAiError(_pendingAi.error);
      setAiLoading(false);
      _pendingAi = null;
    } else if (!_pendingAi.done) {
      // Ainda pendente — se ja passou mais de 90s, considerar timeout
      var elapsed = Date.now() - _pendingAi.ts;
      if (elapsed > 90000) {
        setAiError('A análise demorou muito. Tente novamente.');
        setAiLoading(false);
        _pendingAi = null;
      } else {
        // Retry — se a Edge Function ja respondeu, o cache serve instantaneo
        setAiLoading(true);
        analyzeOption(_pendingAi.data).then(function(result) {
          _pendingAi = null;
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
          _pendingAi = null;
          setAiLoading(false);
          setAiError('Erro: ' + (err && err.message ? err.message : ''));
        });
      }
    }
  }

  useEffect(function() {
    var sub = AppState.addEventListener('change', function(nextState) {
      if (nextState === 'active' && _pendingAi && !_pendingAi.done) {
        recoverPendingAi();
      }
    });
    // Tambem recuperar no mount (caso componente foi desmontado e remontado)
    if (_pendingAi) recoverPendingAi();
    return function() { sub.remove(); };
  }, []);

  // Real options chain states
  var _chainData = useState(null); var chainData = _chainData[0]; var setChainData = _chainData[1];
  var _chainLoading = useState(false); var chainLoading = _chainLoading[0]; var setChainLoading = _chainLoading[1];
  var _chainError = useState(null); var chainError = _chainError[0]; var setChainError = _chainError[1];
  var chainFetchVersion = React.useRef(0);
  var _selectedSeries = useState(0); var selectedSeries = _selectedSeries[0]; var setSelectedSeries = _selectedSeries[1];
  var _chainLastUpdate = useState(null); var chainLastUpdate = _chainLastUpdate[0]; var setChainLastUpdate = _chainLastUpdate[1];
  var _gradeFull = useState(false); var gradeFullscreen = _gradeFull[0]; var setGradeFullscreen = _gradeFull[1];

  // Price alerts states — lifted from props (owned by OpcoesScreen)
  var priceAlerts = props.priceAlerts || [];
  var setPriceAlerts = props.setPriceAlerts || function() {};
  var priceAlertsFired = props.priceAlertsFired || {};
  var setPriceAlertsFired = props.setPriceAlertsFired || function() {};
  var _alertModal = useState(false); var alertModalVisible = _alertModal[0]; var setAlertModalVisible = _alertModal[1];
  var _alertStrike = useState(null); var alertStrike = _alertStrike[0]; var setAlertStrike = _alertStrike[1];
  var _alertTipo = useState('preco'); var alertTipo = _alertTipo[0]; var setAlertTipo = _alertTipo[1];
  var _alertValor = useState(''); var alertValor = _alertValor[0]; var setAlertValor = _alertValor[1];
  var _alertDirecao = useState('abaixo'); var alertDirecao = _alertDirecao[0]; var setAlertDirecao = _alertDirecao[1];
  var _alertTipoOpcao = useState('call'); var alertTipoOpcao = _alertTipoOpcao[0]; var setAlertTipoOpcao = _alertTipoOpcao[1];
  var _alertSaving = useState(false); var alertSaving = _alertSaving[0]; var setAlertSaving = _alertSaving[1];
  var _showMyStrikes = useState(true); var showMyStrikes = _showMyStrikes[0]; var setShowMyStrikes = _showMyStrikes[1];

  // Technical analysis states
  var _techAnalysis = useState(null); var techAnalysis = _techAnalysis[0]; var setTechAnalysis = _techAnalysis[1];
  var _techOhlcv = useState(null); var techOhlcv = _techOhlcv[0]; var setTechOhlcv = _techOhlcv[1];
  var _techLoading = useState(false); var techLoading = _techLoading[0]; var setTechLoading = _techLoading[1];
  var _techFullscreen = useState(false); var techFullscreen = _techFullscreen[0]; var setTechFullscreen = _techFullscreen[1];
  var _techPeriod = useState('6mo'); var techPeriod = _techPeriod[0]; var setTechPeriod = _techPeriod[1];
  var _techFsDims = useState({ w: Dimensions.get('window').width, h: Dimensions.get('window').height });
  var techFsDims = _techFsDims[0]; var setTechFsDims = _techFsDims[1];

  var _techIndicators = useState({ bb: false, rsi: false, volume: false, expectedMove: false });
  var techIndicators = _techIndicators[0]; var setTechIndicators = _techIndicators[1];

  function toggleIndicator(key) {
    var updated = {};
    updated.bb = techIndicators.bb;
    updated.rsi = techIndicators.rsi;
    updated.volume = techIndicators.volume;
    updated.expectedMove = techIndicators.expectedMove;
    updated[key] = !updated[key];
    setTechIndicators(updated);
  }

  var techPeriodLabel = techPeriod === '1mo' ? 'último mês' : techPeriod === '3mo' ? 'últimos 3 meses' : techPeriod === '1y' ? 'último ano' : 'últimos 6 meses';

  // Restore portrait orientation on unmount (safety net)
  useEffect(function() {
    return function() {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(function() {});
    };
  }, []);

  // Auto-fill chainIV from HV 20d when ticker changes (fallback if no OpLab IV)
  useEffect(function() {
    if (!chainTicker) return;
    if (chainIV !== '') return; // user already typed something
    var hv = indicatorsMap && indicatorsMap[chainTicker] && indicatorsMap[chainTicker].hv_20;
    if (hv && hv > 0) {
      setChainIV(hv.toFixed(0));
    }
  }, [chainTicker, indicatorsMap]);

  // Fetch real chain — called on ticker change + auto-refresh
  function doFetchChain(isRefresh) {
    if (!chainTicker) { setChainData(null); return; }
    if (!isRefresh) {
      setChainLoading(true);
      setChainError(null);
      setSelectedSeries(0);
    }
    // Limpar cache: refresh limpa tudo, troca de ticker limpa so o ticker
    if (isRefresh) { clearOplabCache(); } else { clearOplabCache(chainTicker); }
    chainFetchVersion.current = chainFetchVersion.current + 1;
    var myVersion = chainFetchVersion.current;
    fetchOptionsChain(chainTicker, chainSelicRate).then(function(result) {
      // Ignorar resposta se outro fetch ja foi disparado (previne dados stale de ticker anterior)
      if (myVersion !== chainFetchVersion.current) return;
      if (result && result.error) {
        if (!isRefresh) { setChainError(result.error); setChainData(null); }
      } else if (result && result.series && result.series.length > 0) {
        setChainData(result);
        if (result.iv_current) {
          setChainIV(result.iv_current.toFixed(0));
        }
        setChainLastUpdate(new Date());
        setChainError(null);
      } else {
        if (!isRefresh) { setChainData(null); }
      }
      setChainLoading(false);
    });
  }

  // Fetch on ticker change (skip if pendingRadarTicker is about to override chainTicker)
  useEffect(function() {
    if (pendingRadarTicker) return;
    doFetchChain(false);
  }, [chainTicker]);

  // B3 market status — check every 60s
  var _b3Status = useState(function() { return getB3Status(); }); var b3Status = _b3Status[0]; var setB3Status = _b3Status[1];
  useEffect(function() {
    var interval = setInterval(function() {
      setB3Status(getB3Status());
    }, 60000);
    return function() { clearInterval(interval); };
  }, []);

  // Auto-refresh every 2 minutes — only when market is open
  useEffect(function() {
    if (!chainTicker) return;
    var interval = setInterval(function() {
      var status = getB3Status();
      setB3Status(status);
      if (status.isOpen) {
        doFetchChain(true);
      }
    }, 120000); // 2 min
    return function() { clearInterval(interval); };
  }, [chainTicker, chainSelicRate]);

  // Auto-update DTE when selecting a different vencimento
  useEffect(function() {
    if (!chainData || !chainData.series || !chainData.series[selectedSeries]) return;
    var dtm = chainData.series[selectedSeries].days_to_maturity;
    if (dtm > 0) {
      setChainDTE(String(dtm));
    }
  }, [selectedSeries, chainData]);

  // Saved analyses states
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

  // Fetch OHLCV + run technical analysis when ticker/spot/period changes
  useEffect(function() {
    if (!chainTicker || spot <= 0) {
      setTechAnalysis(null);
      setTechOhlcv(null);
      return;
    }
    setTechLoading(true);
    fetchPriceHistoryRange([chainTicker], techPeriod).then(function(histMap) {
      var hist = histMap && histMap[chainTicker];
      if (hist && hist.length >= 20) {
        var result = analyzeTechnicals(hist, parseFloat(strikeInput) || 0);
        setTechOhlcv(hist);
        setTechAnalysis(result);
      } else {
        setTechOhlcv(null);
        setTechAnalysis(null);
      }
      setTechLoading(false);
    }).catch(function() {
      setTechLoading(false);
      setTechOhlcv(null);
      setTechAnalysis(null);
    });
  }, [chainTicker, spot, techPeriod]);

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

  // ═══ Smart AI Analysis (scan entire chain) ═══
  async function handleSmartAnalysis() {
    if (aiLoading) return;
    if (!chainData || !chainData.series || chainData.series.length === 0) return;
    if (spot <= 0) return;

    var AI_RATE_KEY = 'ai_analysis';
    var aiRemaining = rateLimiter.getRemainingCooldown(AI_RATE_KEY);
    if (aiRemaining > 0) {
      Alert.alert('Aguarde', 'Muitas análises em pouco tempo. Tente novamente em ' + rateLimiter.formatCooldown(aiRemaining) + '.');
      return;
    }

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

    // Build top 15 most liquid strikes per series
    var seriesInfo = [];
    var topStrikes = [];
    for (var si = 0; si < Math.min(chainData.series.length, 3); si++) {
      var serie = chainData.series[si];
      seriesInfo.push({ due_date: serie.due_date, days_to_maturity: serie.days_to_maturity, label: serie.label || serie.due_date });
      var strikes = serie.strikes || [];
      // Sort by total volume desc
      var sorted = [];
      for (var sti = 0; sti < strikes.length; sti++) {
        var st = strikes[sti];
        var cVol = (st.call && st.call.volume) || 0;
        var pVol = (st.put && st.put.volume) || 0;
        sorted.push({ idx: sti, totalVol: cVol + pVol });
      }
      sorted.sort(function(a, b) { return b.totalVol - a.totalVol; });
      var maxPick = Math.min(sorted.length, 15);
      for (var mi = 0; mi < maxPick; mi++) {
        var origSt = strikes[sorted[mi].idx];
        var c = origSt.call || {};
        var pu = origSt.put || {};
        topStrikes.push({
          strike: origSt.strike,
          serie_idx: si,
          call: { bid: c.bid || 0, ask: c.ask || 0, volume: c.volume || 0, delta: c.delta || 0, iv: c.iv || 0, symbol: c.symbol || '' },
          put: { bid: pu.bid || 0, ask: pu.ask || 0, volume: pu.volume || 0, delta: pu.delta || 0, iv: pu.iv || 0, symbol: pu.symbol || '' },
        });
      }
    }

    // Fetch fundamentals
    var fundamentalsData = null;
    try {
      var mercadoTicker = (basePos && basePos.mercado) || 'BR';
      var fundRes = await fetchFundamentals(chainTicker, mercadoTicker);
      if (fundRes && !fundRes.error) fundamentalsData = fundRes;
    } catch (e) {}

    // 1. Opcoes ja abertas no mesmo ativo
    var opcoesAbertas = [];
    var opcoesHistPL = [];
    var tickerUp = chainTicker ? chainTicker.toUpperCase() : '';
    for (var oai = 0; oai < ativas.length; oai++) {
      var oa = ativas[oai];
      if (oa.ativo_base && oa.ativo_base.toUpperCase() === tickerUp) {
        opcoesAbertas.push({
          ticker_opcao: oa.ticker_opcao || '',
          tipo: oa.tipo,
          direcao: oa.direcao || 'venda',
          strike: oa.strike,
          premio: oa.premio,
          quantidade: oa.quantidade,
          vencimento: oa.vencimento,
        });
      }
    }

    // 5. Historico P&L de opcoes fechadas/exercidas/expiradas neste ativo
    var allOps = props.allOpcoes || [];
    for (var ohi = 0; ohi < allOps.length; ohi++) {
      var oh = allOps[ohi];
      if (oh.ativo_base && oh.ativo_base.toUpperCase() === tickerUp && oh.status !== 'ativa') {
        var ohPL = null;
        if (oh.status === 'fechada' && oh.premio_fechamento != null) {
          ohPL = (oh.direcao === 'compra') ? (oh.premio_fechamento - oh.premio) : (oh.premio - oh.premio_fechamento);
        } else if (oh.status === 'expirou_po') {
          ohPL = (oh.direcao === 'compra') ? -oh.premio : oh.premio;
        }
        if (ohPL != null) {
          opcoesHistPL.push({ status: oh.status, tipo: oh.tipo, direcao: oh.direcao, strike: oh.strike, pl: Math.round(ohPL * (oh.quantidade || 100)) });
        }
      }
    }

    // 3. IV Rank do indicatorService
    var ivRank = null;
    if (tickerInd && tickerInd.iv_rank != null) ivRank = tickerInd.iv_rank;

    // 4. Contexto de mercado (IBOV + USD) — fire-and-forget
    var marketCtx = null;
    try {
      var mktPrices = await fetchPrices(['^BVSP', 'USDBRL']);
      if (mktPrices) {
        marketCtx = {};
        if (mktPrices['^BVSP']) {
          marketCtx.ibov = mktPrices['^BVSP'].price;
          marketCtx.ibov_var = mktPrices['^BVSP'].change;
        }
        if (mktPrices['USDBRL']) {
          marketCtx.usd = mktPrices['USDBRL'].price;
          marketCtx.usd_var = mktPrices['USDBRL'].change;
        }
      }
    } catch (e) {}

    // 2. Proximo dividendo via brapi
    var nextDividend = null;
    try {
      var divService = require('../../services/dividendService');
      var divs = await divService.fetchDividendsBrapi(chainTicker);
      if (divs && divs.length > 0) {
        var hoje = new Date().toISOString().slice(0, 10);
        for (var di = 0; di < divs.length; di++) {
          var dv = divs[di];
          if (dv.paymentDate && dv.paymentDate >= hoje) {
            nextDividend = { date: dv.paymentDate, rate: dv.rate, type: dv.label || 'DIVIDENDO' };
            break;
          }
        }
      }
    } catch (e) {}

    // 6. OI nos strikes (ja pode estar no chainData)
    for (var ois = 0; ois < topStrikes.length; ois++) {
      var origIdx = null;
      var sIdx = topStrikes[ois].serie_idx;
      if (chainData.series[sIdx]) {
        var allSt = chainData.series[sIdx].strikes || [];
        for (var fi = 0; fi < allSt.length; fi++) {
          if (allSt[fi].strike === topStrikes[ois].strike) {
            if (allSt[fi].call && allSt[fi].call.open_interest != null) topStrikes[ois].call.oi = allSt[fi].call.open_interest;
            if (allSt[fi].put && allSt[fi].put.open_interest != null) topStrikes[ois].put.oi = allSt[fi].put.open_interest;
            break;
          }
        }
      }
    }

    var data = {
      mode: 'smart_scan',
      ticker: chainTicker || '',
      objetivo: aiObjetivo,
      spot: spot,
      selicRate: chainSelicRate,
      series: seriesInfo,
      chainStrikes: topStrikes,
      indicators: tickerInd,
      fundamentals: fundamentalsData,
      opcoesAbertas: opcoesAbertas.length > 0 ? opcoesAbertas : null,
      opcoesHistPL: opcoesHistPL.length > 0 ? opcoesHistPL : null,
      ivRank: ivRank,
      marketContext: marketCtx,
      nextDividend: nextDividend,
      position: basePos ? {
        ticker: basePos.ticker,
        quantidade: basePos.quantidade,
        pm: basePos.pm,
        preco_atual: basePos.preco_atual,
      } : null,
      capital: aiCapital ? parseFloat(aiCapital.replace(/\./g, '').replace(',', '.')) : null,
      portfolio: portfolioSummary.length > 0 ? { ativos: portfolioSummary, total: Math.round(portfolioTotal) } : null,
      technicalSummary: techAnalysis ? buildTechnicalSummary(techAnalysis, spot) : null,
      technicalPeriod: techPeriodLabel,
      stream: true,
    };

    setAiLoading(true);
    setAiError(null);
    setAiStreamText('');

    _pendingAi = { data: data, ts: Date.now(), result: null, error: null, done: false };

    var streamAccum = '';
    var abort = analyzeOptionStream(
      data,
      function onChunk(chunk) {
        streamAccum += chunk;
        setAiStreamText(streamAccum);
      },
      function onDone(result) {
        if (_pendingAi) {
          _pendingAi.done = true;
          _pendingAi.result = (result && !result.error) ? result : null;
          _pendingAi.error = (result && result.error) ? result.error : null;
        }
        setAiLoading(false);
        setAiStreamText('');
        if (result && result.error) {
          rateLimiter.recordFailure(AI_RATE_KEY);
          setAiError(result.error);
        } else if (result) {
          rateLimiter.recordSuccess(AI_RATE_KEY);
          setAiAnalysis(result);
          setAiModalOpen(true);
          _pendingAi = null;
          if (result._usage) {
            setAiUsage(result._usage);
          }
        } else {
          rateLimiter.recordFailure(AI_RATE_KEY);
          setAiError('Resposta vazia da IA.');
        }
      },
      function onError(errMsg) {
        if (_pendingAi) {
          _pendingAi.done = true;
          _pendingAi.error = errMsg;
        }
        setAiLoading(false);
        setAiStreamText('');
        rateLimiter.recordFailure(AI_RATE_KEY);
        setAiError(errMsg);
      }
    );
    _aiAbortRef.current = abort;
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
        var nextCe = {};
        var ceK = Object.keys(customEntries);
        for (var ck = 0; ck < ceK.length; ck++) { nextCe[ceK[ck]] = customEntries[ceK[ck]]; }
        nextCe[tk] = parseFloat(cs.customSpot) || 0;
        setCustomEntries(nextCe);
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
    // Load saved analysis based on type
    if (item.type === 'estrategia' && item.result) {
      setStratResult(item.result);
      setStratLoading(false);
      setStratError(null);
      setStratModalVisible(true);
      setShowSavedDD(false);
      Toast.show({ type: 'success', text1: 'Análise carregada', text2: item.title || 'Estratégia' });
      return;
    }
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

  // ── renderGradeContent: reusable between inline and fullscreen modal ──
  function renderGradeContent(isFullscreen) {
    return (
      <View>
        {/* Info row: spot + IV + HV + beta */}
        {spot > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <Text style={[{ fontSize: 11, fontFamily: F.mono, color: C.text }, ps]}>
              {'Spot R$ ' + fmt(spot)}
            </Text>
            {(function() {
              var seriesIV = null;
              if (chainData && chainData.series && chainData.series.length > 0) {
                var sel = chainData.series[selectedSeries] || chainData.series[0];
                var cSpot = chainData.spot || spot;
                var ivVals = [];
                var sorted = [];
                for (var si = 0; si < (sel.strikes || []).length; si++) {
                  sorted.push({ idx: si, dist: Math.abs((sel.strikes[si].strike || 0) - cSpot) });
                }
                sorted.sort(function(a, b) { return a.dist - b.dist; });
                var maxN = Math.min(3, sorted.length);
                for (var ni = 0; ni < maxN; ni++) {
                  var stk = sel.strikes[sorted[ni].idx];
                  if (stk.call && stk.call.iv != null && stk.call.iv > 0) ivVals.push(stk.call.iv);
                  if (stk.put && stk.put.iv != null && stk.put.iv > 0) ivVals.push(stk.put.iv);
                }
                if (ivVals.length > 0) {
                  var ivTotal = 0;
                  for (var vi = 0; vi < ivVals.length; vi++) ivTotal += ivVals[vi];
                  seriesIV = ivTotal / ivVals.length;
                }
              }
              if (seriesIV != null) {
                return (
                  <Text style={{ fontSize: 10, fontFamily: F.mono, color: C.rf }}>
                    {'VI ' + seriesIV.toFixed(0) + '%'}
                  </Text>
                );
              }
              if (chainData && chainData.iv_current) {
                return (
                  <Text style={{ fontSize: 10, fontFamily: F.mono, color: C.rf }}>
                    {'VI ' + chainData.iv_current.toFixed(0) + '%'}
                  </Text>
                );
              }
              if (chainIV) {
                return (
                  <Text style={{ fontSize: 10, fontFamily: F.mono, color: C.rf }}>
                    {'VI ' + chainIV + '%'}
                  </Text>
                );
              }
              return null;
            })()}
            {(function() {
              var hvDisplay = chainData && chainData.ewma_current != null ? chainData.ewma_current : currentHV;
              if (!hvDisplay || hvDisplay <= 0) return null;
              return (
                <Text style={{ fontSize: 10, fontFamily: F.mono, color: C.sub }}>
                  {'VH ' + hvDisplay.toFixed(0) + '%'}
                </Text>
              );
            })()}
            {chainData && chainData.beta_ibov ? (
              <Text style={{ fontSize: 10, fontFamily: F.mono, color: C.sub }}>
                {'Beta ' + chainData.beta_ibov.toFixed(2)}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Vencimento pills — only when real data available */}
        {chainData && chainData.series && chainData.series.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}
            contentContainerStyle={{ gap: 4 }}>
            {chainData.series.map(function(serie, si) {
              var isActive = selectedSeries === si;
              return (
                <TouchableOpacity key={si} activeOpacity={0.7}
                  onPress={function() { setSelectedSeries(si); }}
                  style={{ paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6,
                    backgroundColor: isActive ? C.accent + '25' : C.card,
                    borderWidth: 1, borderColor: isActive ? C.accent : C.border }}>
                  <Text style={{ fontSize: 11, fontWeight: isActive ? '700' : '400',
                    color: isActive ? C.accent : C.sub, fontFamily: F.mono }}>
                    {serie.label + ' (' + serie.days_to_maturity + 'd)'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : (
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
        )}

        {chainError ? (
          <Text style={{ fontSize: 10, color: C.yellow, fontFamily: F.body, marginBottom: 6 }}>
            {chainError + ' — exibindo preços teóricos (BS)'}
          </Text>
        ) : null}

        {/* ── REAL DATA GRID (from API) ── */}
        {chainData && chainData.series && chainData.series.length > 0 ? (function() {
          var activeSerie = chainData.series[selectedSeries] || chainData.series[0];
          var allStrikes = activeSerie.strikes || [];
          var seriesDTE = activeSerie.days_to_maturity || dteVal;
          var seriesTYears = seriesDTE / 365;
          var chainSpot = chainData.spot || spot;

          // In fullscreen mode show ALL strikes; inline limits to 5+ATM+5
          var strikes;
          if (isFullscreen) {
            strikes = allStrikes;
          } else {
            var atmIdx = 0;
            var minDist = Infinity;
            for (var fi = 0; fi < allStrikes.length; fi++) {
              var dist = Math.abs(allStrikes[fi].strike - chainSpot);
              if (dist < minDist) { minDist = dist; atmIdx = fi; }
            }
            var startIdx = Math.max(0, atmIdx - 5);
            var endIdx = Math.min(allStrikes.length, atmIdx + 6);
            strikes = allStrikes.slice(startIdx, endIdx);
          }

          // Build map of user's active options at each strike for this ticker
          // Key: strike rounded to 2 decimals. Value: array of {tipo, direcao, qty}
          var myStrikesMap = {};
          var myStrikesCount = 0;
          for (var mi = 0; mi < ativas.length; mi++) {
            var mOp = ativas[mi];
            if (mOp.ativo_base && mOp.ativo_base.toUpperCase() === chainTicker.toUpperCase() && mOp.strike > 0) {
              var mKey = mOp.strike.toFixed(2);
              if (!myStrikesMap[mKey]) myStrikesMap[mKey] = [];
              var mDir = (mOp.direcao === 'compra') ? 'C' : 'V';
              var mTipo = (mOp.tipo === 'call') ? 'CALL' : 'PUT';
              myStrikesMap[mKey].push({ tipo: mTipo, direcao: mDir, qty: mOp.quantidade || 0 });
              myStrikesCount++;
            }
          }
          // When toggle is off, clear the map but keep count for the button
          if (!showMyStrikes) myStrikesMap = {};

          return (
            <View>
              {/* Expiry date line */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 6, paddingVertical: 4, backgroundColor: C.accent + '08', borderRadius: 6 }}>
                <Ionicons name="calendar-outline" size={12} color={C.accent} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: C.accent, fontFamily: F.mono }}>
                  {'Vencimento: ' + activeSerie.due_date.split('-').reverse().join('/') + ' (' + seriesDTE + ' dias)'}
                </Text>
              </View>
              {/* Toggle: show my strikes */}
              {myStrikesCount > 0 ? (
                <TouchableOpacity activeOpacity={0.7}
                  onPress={function() { setShowMyStrikes(!showMyStrikes); }}
                  style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 5, marginBottom: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: showMyStrikes ? C.accent + '20' : C.card, borderWidth: 1, borderColor: showMyStrikes ? C.accent + '60' : C.border }}>
                  <Ionicons name={showMyStrikes ? 'eye' : 'eye-off-outline'} size={13} color={showMyStrikes ? C.accent : C.dim} />
                  <Text style={{ fontSize: 10, fontWeight: '700', color: showMyStrikes ? C.accent : C.dim, fontFamily: F.body }}>
                    {'Minhas opções (' + myStrikesCount + ')'}
                  </Text>
                </TouchableOpacity>
              ) : null}
              {/* Side labels — CALL | STRIKE | PUT */}
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3, paddingHorizontal: 1, marginBottom: 2 }}>
                <View style={{ width: 148, alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 10, height: 3, borderRadius: 2, backgroundColor: C.green }} />
                    <Text style={{ fontSize: 11, fontWeight: '800', color: C.green, fontFamily: F.display, letterSpacing: 1 }}>CALL</Text>
                    <View style={{ width: 10, height: 3, borderRadius: 2, backgroundColor: C.green }} />
                  </View>
                </View>
                <View style={{ flex: 1 }} />
                <View style={{ width: 148, alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 10, height: 3, borderRadius: 2, backgroundColor: C.red }} />
                    <Text style={{ fontSize: 11, fontWeight: '800', color: C.red, fontFamily: F.display, letterSpacing: 1 }}>PUT</Text>
                    <View style={{ width: 10, height: 3, borderRadius: 2, backgroundColor: C.red }} />
                  </View>
                </View>
              </View>
              {/* Column headers */}
              <View style={{ flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 1, borderBottomWidth: 1, borderBottomColor: C.border }}>
                {/* CALL side */}
                <Text style={{ width: 40, fontSize: 9, color: C.green + 'BB', fontFamily: F.mono, textAlign: 'center' }}>Bid</Text>
                <Text style={{ width: 40, fontSize: 9, color: C.green + 'BB', fontFamily: F.mono, textAlign: 'center' }}>Ask</Text>
                <Text style={{ width: 38, fontSize: 9, color: C.green + '80', fontFamily: F.mono, textAlign: 'center' }}>Teór</Text>
                <Text style={{ width: 30, fontSize: 9, color: C.green + '80', fontFamily: F.mono, textAlign: 'center' }}>Δ</Text>
                {/* STRIKE center */}
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>STRIKE</Text>
                </View>
                {/* PUT side */}
                <Text style={{ width: 30, fontSize: 9, color: C.red + '80', fontFamily: F.mono, textAlign: 'center' }}>Δ</Text>
                <Text style={{ width: 38, fontSize: 9, color: C.red + '80', fontFamily: F.mono, textAlign: 'center' }}>Teór</Text>
                <Text style={{ width: 40, fontSize: 9, color: C.red + 'BB', fontFamily: F.mono, textAlign: 'center' }}>Bid</Text>
                <Text style={{ width: 40, fontSize: 9, color: C.red + 'BB', fontFamily: F.mono, textAlign: 'center' }}>Ask</Text>
              </View>

              {/* Rows */}
              {strikes.map(function(stRow, ri) {
                var sk = stRow.strike;
                var callOpt = stRow.call;
                var putOpt = stRow.put;
                var callMoney = callOpt && callOpt.moneyness ? callOpt.moneyness.toUpperCase() : null;
                var putMoney = putOpt && putOpt.moneyness ? putOpt.moneyness.toUpperCase() : null;
                var isAtm = (callMoney === 'ATM' || putMoney === 'ATM') ? true : (chainSpot > 0 && Math.abs(sk - chainSpot) / chainSpot < 0.01);
                var callItm = isAtm ? false : (callMoney === 'ITM' ? true : sk < chainSpot);
                var putItm = isAtm ? false : (putMoney === 'ITM' ? true : sk > chainSpot);

                var mLabel = isAtm ? 'ATM' : (callItm ? 'ITM' : 'OTM');
                var mColor = isAtm ? C.yellow : (callItm ? C.green : C.sub);

                var bsCallPrice = (callOpt && callOpt.bs_price != null && callOpt.bs_price > 0) ? callOpt.bs_price : 0;
                var bsPutPrice = (putOpt && putOpt.bs_price != null && putOpt.bs_price > 0) ? putOpt.bs_price : 0;
                if (bsCallPrice <= 0 || bsPutPrice <= 0) {
                  var bsIVLocal = ivVal > 0 ? applyIVSkew(ivVal, sk, chainSpot, skewStrength) : 0.35;
                  if (bsCallPrice <= 0 && seriesTYears > 0) bsCallPrice = priceFn(chainSpot, sk, seriesTYears, r, bsIVLocal, 'call');
                  if (bsPutPrice <= 0 && seriesTYears > 0) bsPutPrice = priceFn(chainSpot, sk, seriesTYears, r, bsIVLocal, 'put');
                }

                function priceColor(realBid, realAsk, bsVal, baseColor) {
                  if (!realBid && !realAsk) return baseColor;
                  if (bsVal <= 0) return baseColor;
                  var mid = (realBid > 0 && realAsk > 0) ? (realBid + realAsk) / 2 : (realBid || realAsk || 0);
                  if (mid <= 0) return baseColor;
                  var ratio = mid / bsVal;
                  if (ratio > 1.10) return C.yellow;
                  if (ratio < 0.90) return C.rf;
                  return baseColor;
                }

                var callBidColor = priceColor(callOpt && callOpt.bid, callOpt && callOpt.ask, bsCallPrice, C.text);
                var callAskColor = priceColor(callOpt && callOpt.bid, callOpt && callOpt.ask, bsCallPrice, C.text);
                var putBidColor = priceColor(putOpt && putOpt.bid, putOpt && putOpt.ask, bsPutPrice, C.text);
                var putAskColor = priceColor(putOpt && putOpt.bid, putOpt && putOpt.ask, bsPutPrice, C.text);

                // Check if user has active options at this strike
                var myOpsAtStrike = myStrikesMap[sk.toFixed(2)] || null;
                var isMine = myOpsAtStrike && myOpsAtStrike.length > 0;

                var isSelected = fk > 0 && Math.abs(sk - fk) < 0.005;

                var rowBg = isSelected ? C.opcoes + '25'
                  : isMine ? C.etfs + '15'
                  : isAtm ? C.yellow + '12'
                  : callItm ? C.green + '08'
                  : putItm ? C.red + '08'
                  : (ri % 2 === 0) ? 'rgba(255,255,255,0.02)' : 'transparent';

                var leftBorderColor = isSelected ? C.opcoes : isMine ? C.etfs : (callItm ? C.green + '40' : 'transparent');
                var rightBorderColor = isSelected ? C.opcoes : isMine ? C.etfs : (putItm ? C.red + '40' : 'transparent');

                var showSpotLine = false;
                if (ri > 0) {
                  var prevStrike = strikes[ri - 1].strike;
                  if (prevStrike < chainSpot && sk >= chainSpot) showSpotLine = true;
                }

                return (
                  <View key={ri}>
                    {showSpotLine ? (
                      <View style={{ height: 2, backgroundColor: C.yellow + '80', marginVertical: 1, borderRadius: 1 }} />
                    ) : null}
                    <TouchableOpacity activeOpacity={0.6}
                      onPress={function() {
                        if (isSelected) {
                          setStrikeInput('');
                          setMktCallBid(''); setMktCallAsk('');
                          setMktPutBid(''); setMktPutAsk('');
                          return;
                        }
                        setStrikeInput(sk.toFixed(2));
                        if (callOpt) {
                          setMktCallBid(callOpt.bid > 0 ? callOpt.bid.toFixed(2) : '');
                          setMktCallAsk(callOpt.ask > 0 ? callOpt.ask.toFixed(2) : '');
                        }
                        if (putOpt) {
                          setMktPutBid(putOpt.bid > 0 ? putOpt.bid.toFixed(2) : '');
                          setMktPutAsk(putOpt.ask > 0 ? putOpt.ask.toFixed(2) : '');
                        }
                        if (seriesDTE > 0) {
                          setChainDTE(String(seriesDTE));
                        }
                        var realIV = (callOpt && callOpt.iv) || (putOpt && putOpt.iv);
                        if (realIV && realIV > 0) {
                          setChainIV(realIV.toFixed(0));
                        }
                        if (isFullscreen) setGradeFullscreen(false);
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: 1, borderRadius: 3, backgroundColor: rowBg, borderLeftWidth: 3, borderRightWidth: 3, borderLeftColor: leftBorderColor, borderRightColor: rightBorderColor }}>
                      {/* CALL side */}
                      <Text style={[{ width: 40, fontSize: 11, fontFamily: F.mono, textAlign: 'center', color: callOpt && callOpt.bid > 0 ? callBidColor : C.dim, fontWeight: callItm ? '600' : '400' }, ps]}>
                        {callOpt ? callOpt.bid.toFixed(2) : '-'}
                      </Text>
                      <Text style={[{ width: 40, fontSize: 11, fontFamily: F.mono, textAlign: 'center', color: callOpt && callOpt.ask > 0 ? callAskColor : C.dim, fontWeight: callItm ? '600' : '400' }, ps]}>
                        {callOpt ? callOpt.ask.toFixed(2) : '-'}
                      </Text>
                      <Text style={[{ width: 38, fontSize: 10, fontFamily: F.mono, textAlign: 'center', color: C.sub }, ps]}>
                        {bsCallPrice > 0.005 ? bsCallPrice.toFixed(2) : '-'}
                      </Text>
                      <Text style={[{ width: 30, fontSize: 10, fontFamily: F.mono, textAlign: 'center', color: C.dim }, ps]}>
                        {callOpt && callOpt.delta != null ? callOpt.delta.toFixed(2) : '-'}
                      </Text>
                      {/* STRIKE center */}
                      <View style={{ flex: 1, alignItems: 'center', overflow: 'hidden', paddingHorizontal: 1 }}>
                        <Text numberOfLines={1} style={[{ fontSize: 11, fontFamily: F.mono, fontWeight: isAtm ? '800' : '600', color: isMine ? C.etfs : (isAtm ? C.yellow : C.text) }, ps]}>
                          {sk.toFixed(2)}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 1 }}>
                          <Text style={{ fontSize: 8, fontWeight: '700', color: (callOpt && callOpt.maturity_type && callOpt.maturity_type.toUpperCase() === 'EUROPEAN') ? C.rf : C.etfs, fontFamily: F.mono }}>
                            {callOpt ? ((callOpt.maturity_type && callOpt.maturity_type.toUpperCase() === 'EUROPEAN') ? 'E' : 'A') : ''}
                          </Text>
                          <View style={{ paddingHorizontal: 3, paddingVertical: 0, borderRadius: 3, backgroundColor: mColor + '30' }}>
                            <Text style={{ fontSize: 8, fontWeight: '800', color: mColor, fontFamily: F.mono, letterSpacing: 0.3 }}>
                              {mLabel}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 8, fontWeight: '700', color: (putOpt && putOpt.maturity_type && putOpt.maturity_type.toUpperCase() === 'EUROPEAN') ? C.rf : C.etfs, fontFamily: F.mono }}>
                            {putOpt ? ((putOpt.maturity_type && putOpt.maturity_type.toUpperCase() === 'EUROPEAN') ? 'E' : 'A') : ''}
                          </Text>
                        </View>
                        {isMine ? (
                          <View style={{ flexDirection: 'row', flexWrap: 'nowrap', justifyContent: 'center', gap: 2, marginTop: 1, maxWidth: '100%' }}>
                            {myOpsAtStrike.map(function(mEntry, mIdx) {
                              var mBg = mEntry.tipo === 'CALL' ? C.green : C.red;
                              var mDir = mEntry.direcao === 'VENDA' || mEntry.direcao === 'V' ? 'V' : 'C';
                              var mTipo = mEntry.tipo === 'CALL' ? 'C' : 'P';
                              return (
                                <View key={mIdx} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 2, paddingVertical: 0, borderRadius: 2, backgroundColor: mBg + '30' }}>
                                  <Text style={{ fontSize: 7, fontWeight: '800', color: mBg, fontFamily: F.mono }}>
                                    {mDir + mTipo + mEntry.qty}
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                        ) : null}
                        {/* Bell icon for price alert */}
                        {(function() {
                          var hasAlert = false;
                          for (var pa = 0; pa < priceAlerts.length; pa++) {
                            if (priceAlerts[pa].strike === sk && priceAlerts[pa].ativo_base === chainTicker && !priceAlerts[pa].disparado) {
                              hasAlert = true;
                              break;
                            }
                          }
                          return (
                            <TouchableOpacity
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                              onPress={function() {
                                setAlertStrike({ strike: sk, callOpt: callOpt, putOpt: putOpt, dueDate: activeSerie && activeSerie.due_date });
                                setAlertValor('');
                                setAlertTipo('preco');
                                setAlertDirecao('abaixo');
                                setAlertTipoOpcao('call');
                                setAlertModalVisible(true);
                              }}
                              style={{ marginTop: 1 }}>
                              <Ionicons name={hasAlert ? 'notifications' : 'notifications-outline'} size={10} color={hasAlert ? C.yellow : C.dim} />
                            </TouchableOpacity>
                          );
                        })()}
                      </View>
                      {/* PUT side */}
                      <Text style={[{ width: 30, fontSize: 10, fontFamily: F.mono, textAlign: 'center', color: C.dim }, ps]}>
                        {putOpt && putOpt.delta != null ? putOpt.delta.toFixed(2) : '-'}
                      </Text>
                      <Text style={[{ width: 38, fontSize: 10, fontFamily: F.mono, textAlign: 'center', color: C.sub }, ps]}>
                        {bsPutPrice > 0.005 ? bsPutPrice.toFixed(2) : '-'}
                      </Text>
                      <Text style={[{ width: 40, fontSize: 11, fontFamily: F.mono, textAlign: 'center', color: putOpt && putOpt.bid > 0 ? putBidColor : C.dim, fontWeight: putItm ? '600' : '400' }, ps]}>
                        {putOpt ? putOpt.bid.toFixed(2) : '-'}
                      </Text>
                      <Text style={[{ width: 40, fontSize: 11, fontFamily: F.mono, textAlign: 'center', color: putOpt && putOpt.ask > 0 ? putAskColor : C.dim, fontWeight: putItm ? '600' : '400' }, ps]}>
                        {putOpt ? putOpt.ask.toFixed(2) : '-'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}

              {/* Legend */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {myStrikesCount > 0 ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent }} />
                    <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.body }}>Minha</Text>
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <View style={{ paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, backgroundColor: C.yellow + '20' }}>
                    <Text style={{ fontSize: 8, fontWeight: '700', color: C.yellow, fontFamily: F.mono }}>ATM</Text>
                  </View>
                  <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.body }}>No dinheiro</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <View style={{ paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, backgroundColor: C.green + '20' }}>
                    <Text style={{ fontSize: 8, fontWeight: '700', color: C.green, fontFamily: F.mono }}>ITM</Text>
                  </View>
                  <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.body }}>Dentro</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <View style={{ paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, backgroundColor: C.sub + '20' }}>
                    <Text style={{ fontSize: 8, fontWeight: '700', color: C.sub, fontFamily: F.mono }}>OTM</Text>
                  </View>
                  <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.body }}>Fora</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Text style={{ fontSize: 8, fontWeight: '700', color: C.etfs, fontFamily: F.mono }}>A</Text>
                  <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.body }}>Americana</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Text style={{ fontSize: 8, fontWeight: '700', color: C.rf, fontFamily: F.mono }}>E</Text>
                  <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.body }}>Europeia</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.yellow }} />
                  <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.body }}>Caro (bom p/ vender)</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.rf }} />
                  <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.body }}>Barato (bom p/ comprar)</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.text }} />
                  <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.body }}>Justo</Text>
                </View>
                <InfoTip title="Preço Real vs Teórico (BS)" text={'As cores dos preços Bid/Ask comparam o preço real de mercado com o preço teórico calculado por Black-Scholes (coluna Teor).'
                  + '\n\n' + '● Amarelo — Prêmio caro (+10% acima do BS)'
                  + '\n' + '  CALL: bom para VENDER call coberta (recebe mais). Ruim para COMPRAR call (paga caro).'
                  + '\n' + '  PUT: bom para VENDER put / CSP (recebe mais). Ruim para COMPRAR put de hedge (paga caro).'
                  + '\n\n' + '● Ciano — Prêmio barato (-10% abaixo do BS)'
                  + '\n' + '  CALL: bom para COMPRAR call (aposta de alta barata). Ruim para VENDER call (recebe pouco).'
                  + '\n' + '  PUT: bom para COMPRAR put de hedge (proteção barata). Ruim para VENDER put / CSP (recebe pouco).'
                  + '\n\n' + '● Branco — Preço justo (±10% do BS). Sem distorção significativa.'
                  + '\n\n' + '⚠ O preço teórico BS é uma estimativa baseada em IV, DTE e taxa livre de risco. Diferenças podem indicar oportunidades, mas também refletem liquidez, oferta/demanda e expectativas do mercado.'} size={12} />
              </View>
              {!isFullscreen ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, paddingVertical: 8, backgroundColor: C.accent + '10', borderRadius: 8, borderWidth: 1, borderColor: C.accent + '20' }}>
                  <Ionicons name="hand-left-outline" size={14} color={C.accent} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: C.accent, fontFamily: F.body }}>
                    Toque num strike para simular
                  </Text>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, paddingVertical: 8, backgroundColor: C.accent + '10', borderRadius: 8, borderWidth: 1, borderColor: C.accent + '20' }}>
                  <Ionicons name="hand-left-outline" size={14} color={C.accent} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: C.accent, fontFamily: F.body }}>
                    Toque em um strike para preencher o simulador
                  </Text>
                </View>
              )}
            </View>
          );
        })() : (
          <View>
            {/* ── FALLBACK: Synthetic BS Grid ── */}
            {/* Side labels */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3, paddingHorizontal: 1, marginBottom: 2 }}>
              <View style={{ width: 108, alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 10, height: 3, borderRadius: 2, backgroundColor: C.green }} />
                  <Text style={{ fontSize: 11, fontWeight: '800', color: C.green, fontFamily: F.display, letterSpacing: 1 }}>CALL</Text>
                  <View style={{ width: 10, height: 3, borderRadius: 2, backgroundColor: C.green }} />
                </View>
              </View>
              <View style={{ flex: 1 }} />
              <View style={{ width: 108, alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 10, height: 3, borderRadius: 2, backgroundColor: C.red }} />
                  <Text style={{ fontSize: 11, fontWeight: '800', color: C.red, fontFamily: F.display, letterSpacing: 1 }}>PUT</Text>
                  <View style={{ width: 10, height: 3, borderRadius: 2, backgroundColor: C.red }} />
                </View>
              </View>
            </View>
            {/* Column headers */}
            <View style={{ flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 1, borderBottomWidth: 1, borderBottomColor: C.border }}>
              <Text style={{ width: 42, fontSize: 9, color: C.green + 'BB', fontFamily: F.mono, textAlign: 'center' }}>Preço</Text>
              <Text style={{ width: 30, fontSize: 9, color: C.green + '80', fontFamily: F.mono, textAlign: 'center' }}>Δ</Text>
              <Text style={{ width: 36, fontSize: 9, color: C.green + '80', fontFamily: F.mono, textAlign: 'center' }}>Θ</Text>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>STRIKE</Text>
              </View>
              <Text style={{ width: 36, fontSize: 9, color: C.red + '80', fontFamily: F.mono, textAlign: 'center' }}>Θ</Text>
              <Text style={{ width: 30, fontSize: 9, color: C.red + '80', fontFamily: F.mono, textAlign: 'center' }}>Δ</Text>
              <Text style={{ width: 42, fontSize: 9, color: C.red + 'BB', fontFamily: F.mono, textAlign: 'center' }}>Preço</Text>
            </View>
            {/* Rows */}
            {miniTableData.map(function(row, mi) {
              var callIsOtm = spot <= row.sk;
              var putIsOtm = spot >= row.sk;
              var isAtmBS = row.isAtm;
              var callItmBS = row.sk < spot;
              var putItmBS = row.sk > spot;

              var mLabelBS = isAtmBS ? 'ATM' : (callItmBS ? 'ITM' : 'OTM');
              var mColorBS = isAtmBS ? C.yellow : (callItmBS ? C.green : C.sub);

              var rowBgBS = row.isUser ? C.accent + '15'
                : isAtmBS ? C.yellow + '12'
                : callItmBS ? C.green + '08'
                : putItmBS ? C.red + '08'
                : (mi % 2 === 0) ? 'rgba(255,255,255,0.02)' : 'transparent';

              var leftBdBS = callItmBS ? C.green + '40' : 'transparent';
              var rightBdBS = putItmBS ? C.red + '40' : 'transparent';

              var showSpotBS = false;
              if (mi > 0) {
                var prevSk = miniTableData[mi - 1].sk;
                if (prevSk < spot && row.sk >= spot) showSpotBS = true;
              }

              return (
                <View key={mi}>
                  {showSpotBS ? (
                    <View style={{ height: 2, backgroundColor: C.yellow + '80', marginVertical: 1, borderRadius: 1 }} />
                  ) : null}
                  <TouchableOpacity activeOpacity={0.6}
                    onPress={function() {
                      setStrikeInput(row.sk.toFixed(2));
                      if (isFullscreen) setGradeFullscreen(false);
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: 1, borderRadius: 3, backgroundColor: rowBgBS, borderLeftWidth: 3, borderRightWidth: 3, borderLeftColor: leftBdBS, borderRightColor: rightBdBS }}>
                    {/* CALL price */}
                    <Text style={[{ width: 42, fontSize: 11, fontFamily: F.mono, textAlign: 'center', color: callIsOtm ? C.sub : C.green, fontWeight: callIsOtm ? '400' : '600' }, ps]}>
                      {fmt(row.callP)}
                    </Text>
                    <Text style={[{ width: 30, fontSize: 10, fontFamily: F.mono, textAlign: 'center', color: C.dim }, ps]}>
                      {row.callDelta.toFixed(2)}
                    </Text>
                    <Text style={[{ width: 36, fontSize: 10, fontFamily: F.mono, textAlign: 'center', color: row.callTheta > 0 ? C.green + '80' : C.red + '80' }, ps]}>
                      {row.callTheta.toFixed(4)}
                    </Text>
                    {/* STRIKE center + moneyness */}
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 2, alignItems: 'center' }}>
                        {row.isUser ? <Ionicons name="chevron-forward" size={7} color={C.accent} /> : null}
                        <Text style={[{ fontSize: 11, fontFamily: F.mono, fontWeight: row.isUser ? '800' : isAtmBS ? '700' : '600', color: row.isUser ? C.accent : isAtmBS ? C.yellow : C.text }, ps]}>
                          {row.sk.toFixed(2)}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 7, fontWeight: '700', color: mColorBS, fontFamily: F.mono, letterSpacing: 0.5 }}>
                        {mLabelBS}
                      </Text>
                    </View>
                    {/* PUT side */}
                    <Text style={[{ width: 36, fontSize: 10, fontFamily: F.mono, textAlign: 'center', color: row.putTheta > 0 ? C.green + '80' : C.red + '80' }, ps]}>
                      {row.putTheta.toFixed(4)}
                    </Text>
                    <Text style={[{ width: 30, fontSize: 10, fontFamily: F.mono, textAlign: 'center', color: C.dim }, ps]}>
                      {row.putDelta.toFixed(2)}
                    </Text>
                    <Text style={[{ width: 42, fontSize: 11, fontFamily: F.mono, textAlign: 'center', color: putIsOtm ? C.sub : C.red, fontWeight: putIsOtm ? '400' : '600' }, ps]}>
                      {fmt(row.putP)}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
            {/* Legend */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <View style={{ paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, backgroundColor: C.yellow + '20' }}>
                  <Text style={{ fontSize: 8, fontWeight: '700', color: C.yellow, fontFamily: F.mono }}>ATM</Text>
                </View>
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.body }}>No dinheiro</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <View style={{ paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, backgroundColor: C.green + '20' }}>
                  <Text style={{ fontSize: 8, fontWeight: '700', color: C.green, fontFamily: F.mono }}>ITM</Text>
                </View>
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.body }}>Dentro</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <View style={{ paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, backgroundColor: C.sub + '20' }}>
                  <Text style={{ fontSize: 8, fontWeight: '700', color: C.sub, fontFamily: F.mono }}>OTM</Text>
                </View>
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.body }}>Fora</Text>
              </View>
            </View>
            {!isFullscreen ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, paddingVertical: 8, backgroundColor: C.accent + '10', borderRadius: 8, borderWidth: 1, borderColor: C.accent + '20' }}>
                <Ionicons name="hand-left-outline" size={14} color={C.accent} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: C.accent, fontFamily: F.body }}>
                  Selecione um strike para análise
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, paddingVertical: 8, backgroundColor: C.accent + '10', borderRadius: 8, borderWidth: 1, borderColor: C.accent + '20' }}>
                <Ionicons name="hand-left-outline" size={14} color={C.accent} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: C.accent, fontFamily: F.body }}>
                  Toque em um strike para preencher o simulador
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Strike count indicator in fullscreen */}
        {isFullscreen && chainData && chainData.series && chainData.series.length > 0 ? (function() {
          var activeSerie = chainData.series[selectedSeries] || chainData.series[0];
          var total = (activeSerie.strikes || []).length;
          return (
            <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, textAlign: 'center', marginTop: 6 }}>
              {total + ' strikes disponíveis'}
            </Text>
          );
        })() : null}
      </View>
    );
  }

  return (
    <View style={{ gap: SIZE.gap }}>
      {/* Ticker selector + watchlist + saved analyses */}
      <View>
        {/* ★ FAVORITOS row */}
        {favorites.length > 0 ? (
          <View style={{ marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <Ionicons name="star" size={10} color={C.etfs} />
              <Text style={{ fontSize: 10, color: C.etfs, fontFamily: F.mono, fontWeight: '600' }}>FAVORITOS</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 5, paddingRight: 8 }}>
              {favorites.slice().sort().map(function(tk) {
                var isActive = chainTicker === tk && !showCustom;
                var isInWatchlist = watchlist.indexOf(tk) !== -1;
                var isInPortfolio = portfolioTickers.indexOf(tk) !== -1;
                return (
                  <TouchableOpacity key={tk} activeOpacity={0.7} delayPressIn={120}
                    onPress={function() { handleTickerChange(tk); }}
                    onLongPress={function() {
                      var opts = [
                        { text: 'Remover dos favoritos', onPress: function() { toggleFavorite(tk); } },
                      ];
                      if (isInWatchlist) {
                        opts.push({ text: 'Remover da lista', style: 'destructive', onPress: function() {
                          toggleFavorite(tk);
                          removeFromWatchlist(tk);
                          if (chainTicker === tk && portfolioTickers.indexOf(tk) === -1) {
                            setChainTicker(tickers.length > 1 ? tickers[0] : null);
                          }
                        }});
                      }
                      opts.push({ text: 'Cancelar', style: 'cancel' });
                      Alert.alert(tk, null, opts);
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6,
                      backgroundColor: isActive ? C.etfs + '25' : C.card,
                      borderWidth: 1, borderColor: isActive ? C.etfs : C.etfs + '30' }}>
                    <Ionicons name="star" size={10} color={C.etfs} />
                    <Text style={{ fontSize: 12, fontWeight: isActive ? '700' : '500',
                      color: isActive ? C.etfs : C.sub, fontFamily: F.mono }}>{tk}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {/* MEUS ATIVOS row — portfolio tickers */}
        {portfolioTickers.length > 0 ? (
          <View style={{ marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <Ionicons name="briefcase-outline" size={10} color={C.acoes} />
              <Text style={{ fontSize: 10, color: C.acoes, fontFamily: F.mono, fontWeight: '600' }}>MEUS ATIVOS</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 5, paddingRight: 8 }}>
              {portfolioTickers.map(function(tk) {
                var isActive = chainTicker === tk && !showCustom;
                var isFav = isFavorite(tk);
                return (
                  <TouchableOpacity key={tk} activeOpacity={0.7} delayPressIn={120}
                    onPress={function() { handleTickerChange(tk); }}
                    onLongPress={function() {
                      Alert.alert(tk, null, [
                        { text: isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos', onPress: function() { toggleFavorite(tk); } },
                        { text: 'Cancelar', style: 'cancel' },
                      ]);
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6,
                      backgroundColor: isActive ? C.acoes + '25' : C.card,
                      borderWidth: 1, borderColor: isActive ? C.acoes : C.border }}>
                    {isFav ? <Ionicons name="star" size={9} color={C.etfs} /> : null}
                    <Text style={{ fontSize: 12, fontWeight: isActive ? '700' : '500',
                      color: isActive ? C.acoes : C.sub, fontFamily: F.mono }}>{tk}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {/* EM ANÁLISE row — user-added tickers not in portfolio */}
        {watchlistOnly.length > 0 ? (
          <View style={{ marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <Ionicons name="eye-outline" size={10} color={C.opcoes} />
              <Text style={{ fontSize: 10, color: C.opcoes, fontFamily: F.mono, fontWeight: '600' }}>EM ANÁLISE</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 5, paddingRight: 8 }}>
              {watchlistOnly.map(function(tk) {
                var isActive = chainTicker === tk && !showCustom;
                var isFav = isFavorite(tk);
                return (
                  <View key={tk} style={{ flexDirection: 'row', alignItems: 'center', gap: 0 }}>
                    <TouchableOpacity activeOpacity={0.7} delayPressIn={120}
                      onPress={function() { handleTickerChange(tk); }}
                      onLongPress={function() {
                        Alert.alert(tk, null, [
                          { text: isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos', onPress: function() { toggleFavorite(tk); } },
                          { text: 'Remover da lista', style: 'destructive', onPress: function() {
                            removeFromWatchlist(tk);
                            if (isFav) toggleFavorite(tk);
                            if (chainTicker === tk) { setChainTicker(tickers.length > 1 ? tickers[0] : null); }
                          }},
                          { text: 'Cancelar', style: 'cancel' },
                        ]);
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 5, paddingLeft: 10, paddingRight: 4, borderRadius: 6, borderTopRightRadius: 0, borderBottomRightRadius: 0,
                        backgroundColor: isActive ? C.opcoes + '25' : C.card,
                        borderWidth: 1, borderRightWidth: 0, borderColor: isActive ? C.opcoes : C.border }}>
                      {isFav ? <Ionicons name="star" size={9} color={C.etfs} /> : null}
                      <Text style={{ fontSize: 12, fontWeight: isActive ? '700' : '500',
                        color: isActive ? C.opcoes : C.sub, fontFamily: F.mono }}>{tk}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity activeOpacity={0.6}
                      onPress={function() {
                        removeFromWatchlist(tk);
                        if (isFav) toggleFavorite(tk);
                        if (chainTicker === tk) { setChainTicker(tickers.length > 1 ? tickers[0] : null); }
                      }}
                      style={{ paddingVertical: 5, paddingHorizontal: 6, borderRadius: 6, borderTopLeftRadius: 0, borderBottomLeftRadius: 0,
                        backgroundColor: isActive ? C.opcoes + '25' : C.card,
                        borderWidth: 1, borderLeftWidth: 0, borderColor: isActive ? C.opcoes : C.border }}>
                      <Ionicons name="close" size={12} color={C.red + '90'} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {/* Actions row: + Outro | Saved */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TouchableOpacity activeOpacity={0.7}
            onPress={function() { var next = !showCustom; setShowCustom(next); setShowWatchlistInput(next); if (next) setChainTicker(null); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6,
              backgroundColor: showCustom ? C.opcoes + '25' : C.card,
              borderWidth: 1, borderColor: showCustom ? C.opcoes : C.border }}>
            <Ionicons name="search-outline" size={12} color={showCustom ? C.opcoes : C.sub} />
            <Text style={{ fontSize: 11, fontWeight: showCustom ? '700' : '500',
              color: showCustom ? C.opcoes : C.sub, fontFamily: F.mono }}>Outro</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          {/* Saved analyses toggle */}
          {subCtx.canAccess('SAVED_ANALYSES') ? (
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
          ) : null}
        </View>

        {/* Watchlist + Favorites panel */}
        {showWatchlistInput ? (
          <View style={{ marginTop: 6, padding: 10, borderRadius: 8, backgroundColor: C.card, borderWidth: 1, borderColor: C.opcoes + '30' }}>

            {/* Search + add to list */}
            <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 1, marginBottom: 8 }}>BUSCAR ATIVO</Text>
            <View style={{ zIndex: 20 }}>
              <TickerInput
                value={customTicker}
                onChangeText={function(t) { setCustomTicker(t); }}
                tickers={portfolioTickers}
                placeholder="Ex: VALE3"
                autoFocus
                returnKeyType="search"
                onSearch={function(query) { return searchTickers(query, 'BR'); }}
                style={styles.simFieldText}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <TouchableOpacity activeOpacity={0.7} onPress={handleCustomSearch}
                disabled={fetchingSpot || customTicker.trim().length < 2}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: C.acoes + '15', borderWidth: 1, borderColor: C.acoes + '30', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, opacity: fetchingSpot || customTicker.trim().length < 2 ? 0.5 : 1 }}>
                {fetchingSpot ? (
                  <ActivityIndicator size="small" color={C.acoes} />
                ) : (
                  <Ionicons name="search-outline" size={14} color={C.acoes} />
                )}
                <Text style={{ fontSize: 12, fontWeight: '600', color: C.acoes, fontFamily: F.body }}>Buscar</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.7} onPress={handleCustomAddToList}
                disabled={fetchingSpot || customTicker.trim().length < 4}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: C.opcoes + '15', borderWidth: 1, borderColor: C.opcoes + '30', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, opacity: fetchingSpot || customTicker.trim().length < 4 ? 0.5 : 1 }}>
                <Ionicons name="add-circle-outline" size={14} color={C.opcoes} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: C.opcoes, fontFamily: F.body }}>Adicionar à lista</Text>
              </TouchableOpacity>
            </View>

            {/* Favorites section */}
            {favorites.length > 0 ? (
              <View style={{ marginTop: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                  <Ionicons name="star" size={11} color={C.etfs} />
                  <Text style={{ fontSize: 10, color: C.etfs, fontFamily: F.mono, fontWeight: '600' }}>FAVORITOS ({favorites.length})</Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {favorites.slice().sort().map(function(fv) {
                    return (
                      <View key={fv} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 5, backgroundColor: C.etfs + '10', borderWidth: 1, borderColor: C.etfs + '25' }}>
                        <Ionicons name="star" size={10} color={C.etfs} />
                        <Text style={{ fontSize: 11, color: C.etfs, fontFamily: F.mono, fontWeight: '600' }}>{fv}</Text>
                        <TouchableOpacity activeOpacity={0.6}
                          onPress={function() { toggleFavorite(fv); }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="close-circle" size={14} color={C.red + '80'} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Watchlist section */}
            {watchlist.length > 0 ? (
              <View style={{ marginTop: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                  <Ionicons name="eye-outline" size={11} color={C.opcoes} />
                  <Text style={{ fontSize: 10, color: C.opcoes, fontFamily: F.mono, fontWeight: '600' }}>LISTA DE ANÁLISE ({watchlist.length})</Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {watchlist.slice().sort().map(function(wt) {
                    var wtFav = isFavorite(wt);
                    return (
                      <View key={wt} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 5, backgroundColor: C.opcoes + '10', borderWidth: 1, borderColor: C.opcoes + '25' }}>
                        <TouchableOpacity activeOpacity={0.6}
                          onPress={function() { toggleFavorite(wt); }}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                          <Ionicons name={wtFav ? 'star' : 'star-outline'} size={12} color={wtFav ? C.etfs : C.dim} />
                        </TouchableOpacity>
                        <Text style={{ fontSize: 11, color: C.opcoes, fontFamily: F.mono, fontWeight: '600' }}>{wt}</Text>
                        <TouchableOpacity activeOpacity={0.6}
                          onPress={function() { removeFromWatchlist(wt); }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="close-circle" size={14} color={C.red + '80'} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Hint */}
            <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body, marginTop: 8, textAlign: 'center' }}>
              Segure um ticker na lista acima para favoritar ou remover
            </Text>
          </View>
        ) : null}
      </View>

      {/* Saved analyses dropdown */}
      {showSavedDD && subCtx.canAccess('SAVED_ANALYSES') ? (
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
                        <Text style={{ fontSize: 13, fontWeight: '700', color: C.text, fontFamily: F.mono }}>{item.title || item.ticker || '?'}</Text>
                        {item.strike ? (
                          <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.mono }}>{'@ ' + Number(item.strike).toFixed(2)}</Text>
                        ) : null}
                        {item.ai_analysis || item.type === 'estrategia' || item.type === 'renda' || item.type === 'ativo' ? (
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

      {spot <= 0 && !showWatchlistInput ? (
        <Glass padding={24}>
          <Text style={{ fontSize: 14, color: C.sub, fontFamily: F.body, textAlign: 'center' }}>
            Selecione um ativo ou toque em "Outro" para buscar um ticker.
          </Text>
        </Glass>
      ) : null}

      {/* ═══ GRADE DE OPÇÕES ═══ */}
          <Glass padding={12}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Ionicons name="grid-outline" size={13} color={C.accent} />
              <Text style={{ fontSize: 12, color: C.accent, fontFamily: F.mono, fontWeight: '600', letterSpacing: 0.5 }}>GRADE DE OPÇÕES</Text>
              {chainTicker ? <Text style={{ fontSize: 13, color: C.text, fontFamily: F.display, fontWeight: '700' }}>{chainTicker}</Text> : null}
              <InfoTip title="Grade de Opções" text={"A grade mostra as opções disponíveis para o ativo selecionado, organizadas por strike (preço de exercício).\n\n• CALL (esquerda, verde): opções de compra. Quem vende CALL aposta que o ativo NÃO sobe acima do strike.\n\n• PUT (direita, vermelha): opções de venda. Quem vende PUT aposta que o ativo NÃO cai abaixo do strike.\n\n• Bid/Ask: preços reais de mercado (compra/venda).\n• Teór: preço justo calculado pelo modelo Black-Scholes.\n• Δ (Delta): sensibilidade ao preço do ativo. Delta 0.50 = a opção se move R$0.50 para cada R$1 do ativo.\n\n• ITM (In The Money): opção com valor intrínseco.\n• ATM (At The Money): strike próximo ao preço atual.\n• OTM (Out of The Money): opção sem valor intrínseco.\n\n• Preços em amarelo = opção cara vs teórico (+10%).\n• Preços em ciano = opção barata vs teórico (-10%).\n\nToque em qualquer strike para preencher o simulador abaixo."} size={12} />
              {chainData ? (
                <View style={{ backgroundColor: C.green + '20', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                  <Text style={{ fontSize: 8, fontWeight: '700', color: C.green, fontFamily: F.mono }}>REAL</Text>
                </View>
              ) : (
                <View style={{ backgroundColor: C.yellow + '20', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                  <Text style={{ fontSize: 8, fontWeight: '700', color: C.yellow, fontFamily: F.mono }}>BS</Text>
                </View>
              )}
              {chainLoading ? <ActivityIndicator size="small" color={C.accent} /> : null}
              <View style={{ flex: 1 }} />
              <TouchableOpacity activeOpacity={0.6} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                onPress={function() { setGradeFullscreen(true); }}
                accessibilityRole="button" accessibilityLabel="Expandir grade em tela cheia">
                <Ionicons name="expand-outline" size={16} color={C.accent} />
              </TouchableOpacity>
              {chainLastUpdate ? (
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>
                  {chainLastUpdate.getHours().toString().padStart(2, '0') + ':' + chainLastUpdate.getMinutes().toString().padStart(2, '0') + ':' + chainLastUpdate.getSeconds().toString().padStart(2, '0')}
                </Text>
              ) : null}
            </View>
            {chainData ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: b3Status.isOpen ? C.green : C.red }} />
                <Text style={{ fontSize: 9, color: b3Status.isOpen ? C.green : C.dim, fontFamily: F.mono }}>
                  {b3Status.reason + (b3Status.isOpen ? ' \u00B7 Atualização a cada 2 min' : '')}
                </Text>
              </View>
            ) : null}

            {renderGradeContent(false)}
          </Glass>

      {/* ═══ GRADE FULLSCREEN MODAL ═══ */}
      <Modal visible={gradeFullscreen} animationType="slide" transparent={false}
        onRequestClose={function() { setGradeFullscreen(false); }}>
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SIZE.padding, paddingTop: 54, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="grid-outline" size={18} color={C.accent} />
              <Text style={{ fontSize: 16, fontWeight: '800', color: C.text, fontFamily: F.display }}>Grade de Opções</Text>
              {chainTicker ? <Text style={{ fontSize: 16, color: C.accent, fontFamily: F.mono, fontWeight: '700' }}>{chainTicker}</Text> : null}
              {chainData ? (
                <View style={{ backgroundColor: C.green + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                  <Text style={{ fontSize: 9, fontWeight: '700', color: C.green, fontFamily: F.mono }}>REAL</Text>
                </View>
              ) : (
                <View style={{ backgroundColor: C.yellow + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                  <Text style={{ fontSize: 9, fontWeight: '700', color: C.yellow, fontFamily: F.mono }}>BS</Text>
                </View>
              )}
            </View>
            <TouchableOpacity activeOpacity={0.6} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={function() { setGradeFullscreen(false); }}
              accessibilityRole="button" accessibilityLabel="Fechar grade">
              <Ionicons name="close" size={24} color={C.text} />
            </TouchableOpacity>
          </View>
          {/* Body */}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: SIZE.padding, paddingBottom: 40 }}>
            {renderGradeContent(true)}
          </ScrollView>
        </View>
      </Modal>

      {/* ═══ PRICE ALERT MODAL ═══ */}
      <Modal visible={alertModalVisible} animationType="slide" transparent={true}
        onRequestClose={function() { setAlertModalVisible(false); }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: C.cardSolid || '#0d1017', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: SIZE.padding, paddingBottom: 40 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="notifications-outline" size={18} color={C.yellow} />
                <Text style={{ fontSize: 16, fontWeight: '800', color: C.text, fontFamily: F.display }}>Criar Alerta</Text>
              </View>
              <TouchableOpacity onPress={function() { setAlertModalVisible(false); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={22} color={C.text} />
              </TouchableOpacity>
            </View>

            {alertStrike ? (
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Text style={{ fontSize: 13, color: C.dim, fontFamily: F.body }}>Strike:</Text>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, fontFamily: F.mono }}>{'R$ ' + (alertStrike.strike || 0).toFixed(2)}</Text>
                  <Text style={{ fontSize: 12, color: C.dim, fontFamily: F.body }}>{chainTicker || ''}</Text>
                </View>

                {/* Tipo de alerta */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8 }}>TIPO DE ALERTA</Text>
                  <InfoTip size={13} color={C.dim} title="Tipos de Alerta" text={'Preço: avisa quando o prêmio da opção atinge um valor. Usa o preço mid (média entre bid e ask).\n\nDivergência BS: compara o preço mid de mercado com o preço teórico (Black-Scholes). Divergência alta indica que a opção pode estar cara ou barata.\n\nVolatilidade (IV): avisa quando a volatilidade implícita muda além do limite.\n\nVolume: avisa quando o volume de negociação ultrapassa um valor mínimo.\n\nTodos os alertas usam o preço mid = (bid + ask) / 2.'} />
                </View>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                  {[
                    { key: 'preco', label: 'Preço' },
                    { key: 'divergencia', label: 'Divergência BS' },
                    { key: 'iv', label: 'Volatilidade (IV)' },
                    { key: 'volume', label: 'Volume' },
                  ].map(function(t) {
                    return (
                      <Pill key={t.key} active={alertTipo === t.key}
                        onPress={function() { setAlertTipo(t.key); setAlertValor(''); }}
                        color={C.yellow}>{t.label}</Pill>
                    );
                  })}
                </View>

                {/* CALL/PUT */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8 }}>TIPO OPÇÃO</Text>
                  <InfoTip size={13} color={C.dim} title="CALL vs PUT" text={'CALL: opção de compra. Ganha valor quando o ativo sobe.\n\nPUT: opção de venda. Ganha valor quando o ativo cai.\n\nSelecione o tipo da opção que deseja monitorar neste strike.'} />
                </View>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
                  <Pill active={alertTipoOpcao === 'call'} onPress={function() { setAlertTipoOpcao('call'); }} color={C.green}>CALL</Pill>
                  <Pill active={alertTipoOpcao === 'put'} onPress={function() { setAlertTipoOpcao('put'); }} color={C.red}>PUT</Pill>
                </View>

                {/* Direção */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8 }}>
                    {alertTipo === 'preco' ? 'AVISAR QUANDO PREÇO' : alertTipo === 'iv' ? 'AVISAR QUANDO IV' : alertTipo === 'volume' ? 'AVISAR QUANDO VOLUME' : 'AVISAR QUANDO DIVERGÊNCIA'}
                  </Text>
                  <InfoTip size={13} color={C.dim} title="Direção do Alerta" text={'Define se o alerta dispara quando o valor sobe acima ou cai abaixo do alvo definido.\n\nO sistema verifica a cada 5 minutos durante o pregão (seg-sex 10h-18h) e envia push notification quando atingido.'} />
                </View>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
                  <Pill active={alertDirecao === 'abaixo'} onPress={function() { setAlertDirecao('abaixo'); }} color={C.yellow}>{alertTipo === 'volume' ? 'Acima de' : 'Cair abaixo de'}</Pill>
                  {alertTipo !== 'volume' ? (
                    <Pill active={alertDirecao === 'acima'} onPress={function() { setAlertDirecao('acima'); }} color={C.yellow}>Subir acima de</Pill>
                  ) : null}
                </View>

                {/* Valor alvo */}
                <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginBottom: 6 }}>
                  {alertTipo === 'preco' ? 'PREÇO ALVO (R$)' : alertTipo === 'iv' ? 'IV ALVO (%)' : alertTipo === 'volume' ? 'VOLUME MÍNIMO' : 'DIVERGÊNCIA MÍNIMA (%)'}
                </Text>
                <TextInput
                  style={{ backgroundColor: C.bg, borderRadius: 10, padding: 12, fontSize: 16, color: C.text, fontFamily: F.mono, borderWidth: 1, borderColor: C.yellow + '40', marginBottom: 16 }}
                  placeholder={alertTipo === 'preco' ? '0.00' : alertTipo === 'volume' ? '100' : '10'}
                  placeholderTextColor={C.dim}
                  keyboardType="decimal-pad"
                  value={alertValor}
                  onChangeText={setAlertValor}
                />

                {/* Current values preview */}
                {(function() {
                  var opt = alertTipoOpcao === 'put' ? alertStrike.putOpt : alertStrike.callOpt;
                  if (!opt) return null;
                  var mid = (opt.bid > 0 && opt.ask > 0) ? ((opt.bid + opt.ask) / 2).toFixed(2) : '-';
                  var ivStr = opt.iv != null ? (opt.iv * 100).toFixed(1) + '%' : '-';
                  var volStr = opt.volume != null ? String(opt.volume) : '-';
                  return (
                    <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                      <View>
                        <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>MID ATUAL</Text>
                        <Text style={{ fontSize: 13, color: C.text, fontFamily: F.mono }}>{'R$ ' + mid}</Text>
                      </View>
                      <View>
                        <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>IV</Text>
                        <Text style={{ fontSize: 13, color: C.text, fontFamily: F.mono }}>{ivStr}</Text>
                      </View>
                      <View>
                        <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>VOLUME</Text>
                        <Text style={{ fontSize: 13, color: C.text, fontFamily: F.mono }}>{volStr}</Text>
                      </View>
                    </View>
                  );
                })()}

                {/* Existing alerts for this strike */}
                {(function() {
                  var existing = [];
                  for (var ea = 0; ea < priceAlerts.length; ea++) {
                    var eAl = priceAlerts[ea];
                    if (eAl.strike === alertStrike.strike && eAl.ativo_base === chainTicker && !eAl.disparado) {
                      existing.push(eAl);
                    }
                  }
                  if (existing.length === 0) return null;
                  return (
                    <View style={{ marginBottom: 16 }}>
                      <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginBottom: 6 }}>ALERTAS ATIVOS NESTE STRIKE</Text>
                      {existing.map(function(eAl) {
                        var tLabel = eAl.tipo_alerta === 'preco' ? 'Preço' : eAl.tipo_alerta === 'iv' ? 'IV' : eAl.tipo_alerta === 'volume' ? 'Volume' : 'Divergência';
                        var dLabel = eAl.direcao === 'acima' ? '>' : '<';
                        return (
                          <View key={eAl.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.dim + '20' }}>
                            <Text style={{ fontSize: 12, color: C.text, fontFamily: F.mono }}>
                              {tLabel + ' ' + (eAl.tipo_opcao || '').toUpperCase() + ' ' + dLabel + ' ' + eAl.valor_alvo}
                            </Text>
                            <TouchableOpacity onPress={function() {
                              deleteAlertaOpcao(eAl.id).then(function() {
                                var updated = [];
                                for (var ui = 0; ui < priceAlerts.length; ui++) {
                                  if (priceAlerts[ui].id !== eAl.id) updated.push(priceAlerts[ui]);
                                }
                                setPriceAlerts(updated);
                                Toast.show({ type: 'success', text1: 'Alerta removido' });
                              });
                            }}>
                              <Ionicons name="trash-outline" size={16} color={C.red} />
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  );
                })()}

                {/* Save button */}
                <TouchableOpacity
                  disabled={alertSaving || !alertValor.trim()}
                  onPress={function() {
                    var val = parseFloat(alertValor.replace(',', '.'));
                    if (!val || val <= 0) {
                      Toast.show({ type: 'error', text1: 'Valor inválido' });
                      return;
                    }
                    setAlertSaving(true);
                    var callSym = alertStrike.callOpt && alertStrike.callOpt.symbol ? alertStrike.callOpt.symbol : '';
                    var putSym = alertStrike.putOpt && alertStrike.putOpt.symbol ? alertStrike.putOpt.symbol : '';
                    var tickerOpcao = alertTipoOpcao === 'put' ? putSym : callSym;
                    if (!tickerOpcao) tickerOpcao = (chainTicker || '') + '_' + alertStrike.strike.toFixed(0) + '_' + alertTipoOpcao.toUpperCase();
                    addAlertaOpcao(user.id, {
                      ticker_opcao: tickerOpcao,
                      ativo_base: chainTicker || '',
                      tipo_alerta: alertTipo,
                      valor_alvo: val,
                      direcao: alertTipo === 'volume' ? 'acima' : alertDirecao,
                      tipo_opcao: alertTipoOpcao,
                      strike: alertStrike.strike,
                      vencimento: alertStrike.dueDate || null,
                    }).then(function(result) {
                      setAlertSaving(false);
                      if (result.error) {
                        Toast.show({ type: 'error', text1: 'Erro ao criar alerta', text2: result.error.message || '' });
                        return;
                      }
                      if (result.data) {
                        var newAlerts = priceAlerts.slice();
                        newAlerts.unshift(result.data);
                        setPriceAlerts(newAlerts);
                      }
                      Toast.show({ type: 'success', text1: 'Alerta criado', text2: tickerOpcao + ' - ' + alertTipo });
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      setAlertModalVisible(false);
                    }).catch(function(e) {
                      setAlertSaving(false);
                      Toast.show({ type: 'error', text1: 'Erro', text2: e.message || '' });
                    });
                  }}
                  style={{ backgroundColor: alertSaving || !alertValor.trim() ? C.dim : C.yellow, borderRadius: 12, padding: 14, alignItems: 'center' }}>
                  {alertSaving ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#000', fontFamily: F.display }}>Criar Alerta</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* ═══ PREÇOS DO MERCADO ═══ */}
      <Glass padding={12}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <Ionicons name="pricetags-outline" size={13} color={C.etfs} />
          <Text style={{ fontSize: 12, color: C.etfs, fontFamily: F.mono, fontWeight: '600', letterSpacing: 0.5 }}>PREÇOS DO MERCADO</Text>
          <InfoTip text="Preenchido automaticamente ao tocar na grade. Edite manualmente se necessário." size={12} />
        </View>
        {hasResult ? (
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: C.opcoes + '12', borderWidth: 1, borderColor: C.opcoes + '30', alignSelf: 'center' }}>
              <Ionicons name="checkmark-circle" size={14} color={C.opcoes} />
              <Text style={{ fontSize: 12, color: C.opcoes, fontFamily: F.mono, fontWeight: '600' }}>
                {'Strike R$ ' + fmt(fk) + ' | VI ' + (fIV * 100).toFixed(0) + '%' + (skewStrength > 0 ? ' (skew)' : '') + ' | DTE ' + dteVal + 'd'}
              </Text>
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
                Toque na grade acima para preencher ou edite manualmente
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={{ alignItems: 'center', paddingVertical: 16 }}>
            <Ionicons name="hand-left-outline" size={28} color={C.dim} style={{ marginBottom: 8 }} />
            <Text style={{ fontSize: 13, color: C.sub, fontFamily: F.body, textAlign: 'center' }}>
              Selecione um strike na grade para ver detalhes
            </Text>
            <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.body, textAlign: 'center', marginTop: 4 }}>
              Preços, gregas e cenários serão calculados automaticamente
            </Text>
          </View>
        )}
      </Glass>

      {hasResult ? (
        <View style={{ gap: SIZE.gap }}>
          {/* CALL analysis card */}
          {renderOptionCard('CALL', fCallMid, fCallG, fCallBA, mcMid, callAnalysis, callMktIV, C.green)}

          {/* PUT analysis card */}
          {renderOptionCard('PUT', fPutMid, fPutG, fPutBA, mpMid, putAnalysis, putMktIV, C.red)}

          {/* Resumo rápido */}
          <Glass padding={12}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Ionicons name="document-text-outline" size={14} color={C.accent} />
              <Text style={{ fontSize: 12, color: C.accent, fontFamily: F.mono, fontWeight: '600', letterSpacing: 0.5 }}>RESUMO</Text>
              <InfoTip text={"Resumo dos valores-chave da simulação para o strike selecionado.\n\nBreakeven = preço em que a operação de venda de opção empata (sem lucro nem prejuízo).\n\nTheta/dia = quanto de prêmio a opção perde por dia pelo decaimento temporal (beneficia o vendedor).\n\nPreço Teórico BS = preço justo calculado pelo modelo Black-Scholes usando IV e outros parâmetros.\n\n⚠ Valores de prêmios são brutos. O líquido creditado na conta pode ser menor devido a impostos, corretagem e taxas B3."} size={12} />
            </View>
            <View style={{ gap: 4 }}>
              {[
                { l: 'CALL - Breakeven (venda)', v: 'R$ ' + fmt(fk + fCallMid), c: C.green, tip: 'Se você vendeu uma CALL neste strike, o ativo pode subir até este preço sem prejuízo. Acima deste valor, a opção gera perda.' },
                { l: 'PUT - Breakeven (venda)', v: 'R$ ' + fmt(fk - fPutMid), c: C.red, tip: 'Se você vendeu uma PUT neste strike, o ativo pode cair até este preço sem prejuízo. Abaixo deste valor, a opção gera perda.' },
                { l: 'Theta/dia CALL (100 opções)', v: 'R$ ' + fmt(fCallG.theta * 100), c: fCallG.theta > 0 ? C.green : C.red, tip: 'Quanto o prêmio da CALL perde de valor por dia. Para o vendedor, theta positivo é bom: o tempo trabalha a seu favor.' },
                { l: 'Theta/dia PUT (100 opções)', v: 'R$ ' + fmt(fPutG.theta * 100), c: fPutG.theta > 0 ? C.green : C.red, tip: 'Quanto o prêmio da PUT perde de valor por dia. Para o vendedor, theta positivo é bom: o tempo trabalha a seu favor.' },
                hasCallMkt ? { l: 'Prêmio mercado CALL (100)', v: 'R$ ' + fmt(mcMid * 100), c: C.text, tip: 'Valor total que você receberia vendendo 100 opções de CALL ao preço médio de mercado (média entre bid e ask).\n\n⚠ O valor líquido creditado na sua conta pode ser menor, pois não considera impostos (IR 15%), taxas de corretagem, emolumentos B3 e outras taxas operacionais.' } : null,
                hasPutMkt ? { l: 'Prêmio mercado PUT (100)', v: 'R$ ' + fmt(mpMid * 100), c: C.text, tip: 'Valor total que você receberia vendendo 100 opções de PUT ao preço médio de mercado (média entre bid e ask).\n\n⚠ O valor líquido creditado na sua conta pode ser menor, pois não considera impostos (IR 15%), taxas de corretagem, emolumentos B3 e outras taxas operacionais.' } : null,
              ].map(function(rr, i) {
                if (!rr) return null;
                return (
                  <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
                      <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body }}>{rr.l}</Text>
                      <InfoTip text={rr.tip} size={11} />
                    </View>
                    <Text style={[{ fontSize: 13, fontWeight: '600', color: rr.c, fontFamily: F.mono }, ps]}>{rr.v}</Text>
                  </View>
                );
              })}
            </View>
          </Glass>

          {/* Motor de decisão */}
          {contextAlerts.length > 0 ? (
            <Glass padding={12} glow={C.opcoes}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Ionicons name="bulb-outline" size={14} color={C.opcoes} />
                <Text style={{ fontSize: 12, color: C.opcoes, fontFamily: F.mono, fontWeight: '600', letterSpacing: 0.5 }}>MOTOR DE DECISÃO</Text>
                <InfoTip text={"Alertas gerados cruzando a VI com os indicadores de contexto."} size={12} />
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

          {/* Salvar análise */}
          {subCtx.canAccess('SAVED_ANALYSES') ? (
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
          ) : null}

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
            <View style={{ flexDirection: 'row', paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 4 }}>
              <Text style={{ width: 42, fontSize: 9, color: C.dim, fontFamily: F.mono }}>Ativo</Text>
              <Text style={{ width: 48, fontSize: 9, color: C.dim, fontFamily: F.mono, textAlign: 'center' }}>Spot</Text>
              <Text style={{ flex: 1, fontSize: 9, color: C.green + 'BB', fontFamily: F.mono, textAlign: 'center' }}>Call R$</Text>
              <Text style={{ flex: 1, fontSize: 9, color: C.green + 'BB', fontFamily: F.mono, textAlign: 'center' }}>P&L Vd</Text>
              <Text style={{ flex: 1, fontSize: 9, color: C.red + 'BB', fontFamily: F.mono, textAlign: 'center' }}>Put R$</Text>
              <Text style={{ flex: 1, fontSize: 9, color: C.red + 'BB', fontFamily: F.mono, textAlign: 'center' }}>P&L Vd</Text>
            </View>
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
              P&L Vd = resultado por opção se você vendeu.
            </Text>
          </Glass>

        </View>
      ) : null}


      {/* ═══ ANÁLISE TÉCNICA ═══ */}
      {chainTicker && spot > 0 ? (
        !subCtx.canAccess('TECHNICAL_CHART') ? (
          <Glass padding={12}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Ionicons name="analytics-outline" size={13} color={C.opcoes} />
              <Text style={{ fontSize: 12, color: C.opcoes, fontFamily: F.mono, fontWeight: '600', letterSpacing: 0.5 }}>ANÁLISE TÉCNICA</Text>
            </View>
            <UpgradePrompt feature="TECHNICAL_CHART" compact={true} />
          </Glass>
        ) : (
        <Glass padding={12}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Ionicons name="analytics-outline" size={13} color={C.opcoes} />
            <Text style={{ fontSize: 12, color: C.opcoes, fontFamily: F.mono, fontWeight: '600', letterSpacing: 0.5 }}>ANÁLISE TÉCNICA</Text>
            <InfoTip title="Análise Técnica" text={"Gráfico de preços dos " + techPeriodLabel + " com indicadores técnicos.\n\nFixos:\n• SMA 20 (ciano) e SMA 50 (amarelo)\n• Suportes (verde) e Resistências (vermelho)\n• Topos/fundos e linha de Strike\n\nToggle (toque nos botões):\n• Bollinger Bands — faixa de volatilidade, preço fora = oportunidade\n• RSI — sobrecomprado (>70) / sobrevendido (<30)\n• Volume — confirma rompimentos e suportes\n• ±1σ Esperado — faixa onde o mercado espera o preço no vencimento (usa HV e DTE do simulador)\n\nToque e arraste no gráfico para ver detalhes."} size={12} />
            {techLoading ? <ActivityIndicator size="small" color={C.opcoes} /> : null}
            {techAnalysis ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{
                  backgroundColor: (techAnalysis.trend.direction === 'up' ? C.green : techAnalysis.trend.direction === 'down' ? C.red : C.etfs) + '20',
                  paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
                }}>
                  <Text style={{
                    fontSize: 9, fontWeight: '700', fontFamily: F.mono,
                    color: techAnalysis.trend.direction === 'up' ? C.green : techAnalysis.trend.direction === 'down' ? C.red : C.etfs,
                  }}>
                    {techAnalysis.trend.label.toUpperCase()}
                  </Text>
                </View>
                <InfoTip title="Tendência" text={"Calculada automaticamente a partir das médias móveis:\n\n• ALTA: SMA 20 acima da SMA 50 e preço acima da SMA 20. Momento comprador.\n• BAIXA: SMA 20 abaixo da SMA 50 e preço abaixo da SMA 20. Momento vendedor.\n• LATERAL: Sem direção clara. SMAs próximas ou preço entre elas.\n\nA tendência ajuda a escolher a direção da operação (CALL para alta, PUT para baixa)."} size={11} />
              </View>
            ) : null}
            <View style={{ flex: 1 }} />
            {techAnalysis && techOhlcv ? (
              <TouchableOpacity activeOpacity={0.6} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                onPress={function() {
                  ScreenOrientation.unlockAsync().catch(function() {});
                  setTechFullscreen(true);
                }}
                accessibilityRole="button" accessibilityLabel="Expandir análise técnica em tela cheia">
                <Ionicons name="expand-outline" size={16} color={C.opcoes} />
              </TouchableOpacity>
            ) : null}
          </View>
          {/* Period filter pills */}
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
            {[
              { label: '1M', value: '1mo' },
              { label: '3M', value: '3mo' },
              { label: '6M', value: '6mo' },
              { label: '1A', value: '1y' },
            ].map(function(p) {
              var active = techPeriod === p.value;
              return (
                <TouchableOpacity key={p.value} activeOpacity={0.7}
                  onPress={function() { setTechPeriod(p.value); }}
                  style={{
                    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
                    backgroundColor: active ? C.opcoes + '25' : 'transparent',
                    borderWidth: 1, borderColor: active ? C.opcoes + '50' : C.border,
                  }}>
                  <Text style={{
                    fontSize: 10, fontWeight: active ? '700' : '500', fontFamily: F.mono,
                    color: active ? C.opcoes : C.dim,
                  }}>{p.label}</Text>
                </TouchableOpacity>
              );
            })}
            {techOhlcv ? (
              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, alignSelf: 'center', marginLeft: 4 }}>
                {techOhlcv.length + ' candles'}
              </Text>
            ) : null}
          </View>
          {/* Indicator toggle pills */}
          {techAnalysis && techOhlcv ? (
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {[
                { key: 'bb', label: 'Bollinger', tip: "Bandas de Bollinger (20 períodos, 2 desvios).\n\nFaixa sombreada que mostra a volatilidade do ativo. Quando o preço toca ou ultrapassa:\n• Banda superior → ativo sobrecomprado, bom para vender CALL\n• Banda inferior → ativo sobrevendido, bom para vender PUT\n\nBandas estreitas = baixa volatilidade, possível movimento forte em breve (squeeze).\nBandas largas = alta volatilidade, prêmios de opções mais caros." },
                { key: 'rsi', label: 'RSI', tip: "RSI — Índice de Força Relativa (14 períodos).\n\nMede a velocidade e magnitude das mudanças de preço (0-100).\n\n• Acima de 70: sobrecomprado — o ativo subiu rápido demais, pode corrigir. Bom momento para venda de CALL.\n• Abaixo de 30: sobrevendido — o ativo caiu rápido demais, pode reverter. Bom momento para venda de PUT (CSP).\n• Entre 30-70: zona neutra.\n\nCombine com suportes/resistências para sinais mais fortes." },
                { key: 'volume', label: 'Volume', tip: "Volume de negociação diário.\n\nBarras verdes = dia de alta (fechou acima da abertura).\nBarras vermelhas = dia de queda (fechou abaixo da abertura).\n\nPara opções:\n• Rompimento de suporte/resistência com volume alto = movimento real, maior risco.\n• Rompimento sem volume = possível falso sinal.\n• Volume crescente confirma a tendência atual." },
                { key: 'expectedMove', label: '±1σ Esperado', tip: "Faixa de Movimento Esperado (±1 desvio padrão).\n\nCalcula onde o mercado espera que o preço esteja no vencimento da opção, baseado na Volatilidade Histórica (HV) e no DTE (dias até o vencimento) do simulador.\n\n• 68% de probabilidade do preço ficar dentro da faixa.\n• Strike fora da faixa = menor chance de exercício.\n• Strike dentro da faixa = maior risco.\n\nRequer DTE e HV no simulador para funcionar." },
              ].map(function(ind) {
                var active = techIndicators[ind.key];
                var disabled = ind.key === 'expectedMove' && (dteVal <= 0 || currentHV <= 0);
                return (
                  <View key={ind.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <TouchableOpacity activeOpacity={0.7}
                      onPress={function() { if (!disabled) toggleIndicator(ind.key); }}
                      style={{
                        paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
                        backgroundColor: active ? C.accent + '20' : 'transparent',
                        borderWidth: 1,
                        borderColor: disabled ? C.border + '40' : (active ? C.accent + '50' : C.border),
                        opacity: disabled ? 0.4 : 1,
                      }}>
                      <Text style={{
                        fontSize: 9, fontWeight: active ? '700' : '500', fontFamily: F.mono,
                        color: active ? C.accent : C.dim,
                      }}>{ind.label}</Text>
                    </TouchableOpacity>
                    <InfoTip title={ind.label} text={ind.tip} size={10} />
                  </View>
                );
              })}
            </View>
          ) : null}
          {techAnalysis && techOhlcv ? (
            <View>
              <TechnicalChart
                ohlcv={techOhlcv}
                analysis={techAnalysis}
                spot={spot}
                strikePrice={fk > 0 ? fk : null}
                height={200}
                width={Dimensions.get('window').width - SIZE.padding * 2 - 24}
                color={C.opcoes}
                indicators={techIndicators}
                dte={dteVal}
                hv={currentHV || 0}
              />
              {/* Breakout / Proximity Alerts */}
              {techAnalysis.alerts && techAnalysis.alerts.length > 0 ? (
                <View style={{ marginTop: 8, gap: 6 }}>
                  {techAnalysis.alerts.map(function(alert, aidx) {
                    var alertColor = alert.color === 'red' ? C.red : alert.color === 'green' ? C.green : C.etfs;
                    return (
                      <View key={'ta-' + aidx} style={{
                        flexDirection: 'row', alignItems: 'flex-start', gap: 6,
                        backgroundColor: alertColor + '10', borderRadius: 8, padding: 8,
                        borderLeftWidth: 3, borderLeftColor: alertColor,
                      }}>
                        <Ionicons name={alert.icon} size={14} color={alertColor} style={{ marginTop: 1 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: alertColor, fontFamily: F.mono, marginBottom: 2 }}>
                            {alert.title.toUpperCase()}
                          </Text>
                          <Text style={{ fontSize: 10, color: C.text, fontFamily: F.body, lineHeight: 15 }}>
                            {alert.message}
                          </Text>
                          <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.body, lineHeight: 14, marginTop: 2, fontStyle: 'italic' }}>
                            {alert.actionHint}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null}
              {/* Supports / Resistances summary */}
              {(techAnalysis.supports.length > 0 || techAnalysis.resistances.length > 0) ? (
                <View style={{ marginTop: 8, gap: 8 }}>
                  {/* Key levels — nearest support below spot & nearest resistance above spot */}
                  {(function() {
                    var nearSup = null;
                    var nearRes = null;
                    for (var si = 0; si < techAnalysis.supports.length; si++) {
                      var sv = techAnalysis.supports[si];
                      if (sv.price < spot && (!nearSup || sv.price > nearSup.price)) nearSup = sv;
                    }
                    for (var ri2 = 0; ri2 < techAnalysis.resistances.length; ri2++) {
                      var rv = techAnalysis.resistances[ri2];
                      if (rv.price > spot && (!nearRes || rv.price < nearRes.price)) nearRes = rv;
                    }
                    if (!nearSup && !nearRes) return null;
                    var supDist = nearSup ? ((spot - nearSup.price) / spot * 100).toFixed(1) : null;
                    var resDist = nearRes ? ((nearRes.price - spot) / spot * 100).toFixed(1) : null;
                    return (
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {nearSup ? (
                          <View style={{ flex: 1, padding: 8, borderRadius: 8, backgroundColor: C.green + '10', borderWidth: 1, borderColor: C.green + '25' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                              <Ionicons name="shield-checkmark" size={12} color={C.green} />
                              <Text style={{ fontSize: 9, color: C.green, fontFamily: F.mono, fontWeight: '700' }}>SUPORTE CHAVE</Text>
                            </View>
                            <Text style={{ fontSize: 14, color: C.green, fontFamily: F.mono, fontWeight: '800' }}>
                              {'R$ ' + nearSup.price.toFixed(2)}
                            </Text>
                            <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.mono, marginTop: 2 }}>
                              {supDist + '% abaixo · ' + nearSup.strength + ' toques'}
                            </Text>
                            {nearSup.hasVolumeNode ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 }}>
                                <View style={{ backgroundColor: C.green + '25', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 }}>
                                  <Text style={{ fontSize: 7, color: C.green, fontFamily: F.mono, fontWeight: '700' }}>VOL</Text>
                                </View>
                                <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.body }}>Confirmado por volume</Text>
                              </View>
                            ) : null}
                            <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.body, marginTop: 4, lineHeight: 13 }}>
                              {'Se romper: queda pode acelerar até o próximo suporte. PUTs vendidas abaixo ficam em risco.'}
                            </Text>
                          </View>
                        ) : null}
                        {nearRes ? (
                          <View style={{ flex: 1, padding: 8, borderRadius: 8, backgroundColor: C.red + '10', borderWidth: 1, borderColor: C.red + '25' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                              <Ionicons name="flag" size={12} color={C.red} />
                              <Text style={{ fontSize: 9, color: C.red, fontFamily: F.mono, fontWeight: '700' }}>RESISTÊNCIA CHAVE</Text>
                            </View>
                            <Text style={{ fontSize: 14, color: C.red, fontFamily: F.mono, fontWeight: '800' }}>
                              {'R$ ' + nearRes.price.toFixed(2)}
                            </Text>
                            <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.mono, marginTop: 2 }}>
                              {resDist + '% acima · ' + nearRes.strength + ' toques'}
                            </Text>
                            {nearRes.hasVolumeNode ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 }}>
                                <View style={{ backgroundColor: C.red + '25', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 }}>
                                  <Text style={{ fontSize: 7, color: C.red, fontFamily: F.mono, fontWeight: '700' }}>VOL</Text>
                                </View>
                                <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.body }}>Confirmado por volume</Text>
                              </View>
                            ) : null}
                            <Text style={{ fontSize: 9, color: C.sub, fontFamily: F.body, marginTop: 4, lineHeight: 13 }}>
                              {'Se romper: alta pode acelerar (breakout). CALLs vendidas acima ficam em risco de exercício.'}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    );
                  })()}
                  {/* All levels list */}
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    {techAnalysis.supports.length > 0 ? (
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 3 }}>
                          <Text style={{ fontSize: 9, color: C.green, fontFamily: F.mono, fontWeight: '700' }}>SUPORTES</Text>
                          <InfoTip title="Suportes" text={"Regiões de preço onde o ativo historicamente parou de cair e voltou a subir.\n\nIdentificados por 3 fontes nos " + techPeriodLabel + ":\n• Pivots fractais (topos/fundos)\n• Perfil de volume (zonas de alto volume — badge VOL)\n• Números redondos psicológicos\n\nNx = toques na região. Quanto mais, mais forte.\n\nPara opções:\n• Venda de PUT com strike próximo a suporte forte tem menor risco de exercício.\n• Se preço romper suporte, pode acelerar queda."} size={10} />
                        </View>
                        {techAnalysis.supports.map(function(s, idx) {
                          return (
                            <View key={'ts-' + idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: C.green }} />
                              <Text style={{ fontSize: 10, color: C.text, fontFamily: F.mono }}>
                                {'R$ ' + s.price.toFixed(2)}
                              </Text>
                              <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono }}>
                                {'(' + s.strength + 'x)'}
                              </Text>
                              {s.hasVolumeNode ? (
                                <View style={{ backgroundColor: C.green + '25', paddingHorizontal: 3, paddingVertical: 1, borderRadius: 3 }}>
                                  <Text style={{ fontSize: 7, color: C.green, fontFamily: F.mono, fontWeight: '700' }}>VOL</Text>
                                </View>
                              ) : null}
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                    {techAnalysis.resistances.length > 0 ? (
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 3 }}>
                          <Text style={{ fontSize: 9, color: C.red, fontFamily: F.mono, fontWeight: '700' }}>RESISTÊNCIAS</Text>
                          <InfoTip title="Resistências" text={"Regiões de preço onde o ativo historicamente parou de subir e recuou.\n\nIdentificadas por 3 fontes nos " + techPeriodLabel + ":\n• Pivots fractais (topos/fundos)\n• Perfil de volume (zonas de alto volume — badge VOL)\n• Números redondos psicológicos\n\nNx = toques na região. Quanto mais, mais forte.\n\nPara opções:\n• Venda de CALL com strike próximo a resistência forte tem menor risco de exercício.\n• Se preço romper resistência, pode acelerar alta (breakout)."} size={10} />
                        </View>
                        {techAnalysis.resistances.map(function(r, idx) {
                          return (
                            <View key={'tr-' + idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: C.red }} />
                              <Text style={{ fontSize: 10, color: C.text, fontFamily: F.mono }}>
                                {'R$ ' + r.price.toFixed(2)}
                              </Text>
                              <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono }}>
                                {'(' + r.strength + 'x)'}
                              </Text>
                              {r.hasVolumeNode ? (
                                <View style={{ backgroundColor: C.red + '25', paddingHorizontal: 3, paddingVertical: 1, borderRadius: 3 }}>
                                  <Text style={{ fontSize: 7, color: C.red, fontFamily: F.mono, fontWeight: '700' }}>VOL</Text>
                                </View>
                              ) : null}
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <View style={{ backgroundColor: C.accent + '20', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 }}>
                      <Text style={{ fontSize: 7, color: C.accent, fontFamily: F.mono, fontWeight: '700' }}>VOL</Text>
                    </View>
                    <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.body }}>= nível confirmado por alto volume de negociação (mais confiável)</Text>
                    <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono }}>{'Nx = toques'}</Text>
                  </View>
                </View>
              ) : null}
            </View>
          ) : (!techLoading ? (
            <View style={{ height: 60, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>Dados insuficientes para análise técnica</Text>
            </View>
          ) : null)}
        </Glass>
        )
      ) : null}

      {/* ═══ ANÁLISE TÉCNICA FULLSCREEN ═══ */}
      <Modal visible={techFullscreen} animationType="fade" transparent={false} supportedOrientations={['portrait', 'landscape']}
        onRequestClose={function() {
          ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(function() {});
          setTechFullscreen(false);
        }}>
        <View style={{ flex: 1, backgroundColor: C.bg }} onLayout={function(e) {
          var layout = e.nativeEvent.layout;
          setTechFsDims({ w: layout.width, h: layout.height });
        }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: techFsDims.w > techFsDims.h ? 44 : SIZE.padding, paddingTop: techFsDims.w > techFsDims.h ? 10 : 54, paddingBottom: techFsDims.w > techFsDims.h ? 6 : 10, borderBottomWidth: 1, borderBottomColor: C.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="analytics-outline" size={18} color={C.opcoes} />
              <Text style={{ fontSize: techFsDims.w > techFsDims.h ? 14 : 16, fontWeight: '800', color: C.text, fontFamily: F.display }}>Análise Técnica</Text>
              {chainTicker ? (
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.accent, fontFamily: F.mono }}>{chainTicker}</Text>
              ) : null}
              {techAnalysis ? (
                <View style={{
                  backgroundColor: (techAnalysis.trend.direction === 'up' ? C.green : techAnalysis.trend.direction === 'down' ? C.red : C.etfs) + '20',
                  paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
                }}>
                  <Text style={{
                    fontSize: 10, fontWeight: '700', fontFamily: F.mono,
                    color: techAnalysis.trend.direction === 'up' ? C.green : techAnalysis.trend.direction === 'down' ? C.red : C.etfs,
                  }}>
                    {techAnalysis.trend.label.toUpperCase()}
                  </Text>
                </View>
              ) : null}
            </View>
            <TouchableOpacity activeOpacity={0.6} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={function() {
                ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(function() {});
                setTechFullscreen(false);
              }}
              accessibilityRole="button" accessibilityLabel="Fechar análise técnica">
              <Ionicons name="close" size={24} color={C.text} />
            </TouchableOpacity>
          </View>
          {/* Body — panoramic chart */}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: techFsDims.w > techFsDims.h ? 8 : SIZE.padding, paddingHorizontal: techFsDims.w > techFsDims.h ? 44 : SIZE.padding, paddingBottom: 40 }}>
            {techAnalysis && techOhlcv ? (
              <View>
                {/* Indicator toggles in fullscreen */}
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: techFsDims.w > techFsDims.h ? 4 : 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  {[
                    { key: 'bb', label: 'Bollinger Bands', tip: "Bandas de Bollinger (20 períodos, 2 desvios).\n\nFaixa sombreada que mostra a volatilidade do ativo.\n• Banda superior → sobrecomprado, bom para vender CALL\n• Banda inferior → sobrevendido, bom para vender PUT\n• Bandas estreitas (squeeze) = movimento forte em breve" },
                    { key: 'rsi', label: 'RSI (14)', tip: "RSI — Índice de Força Relativa (14 períodos).\n\nMede momentum do preço (0-100).\n• >70: sobrecomprado — favorável para venda de CALL\n• <30: sobrevendido — favorável para venda de PUT\n\nCombine com suportes/resistências para sinais mais fortes." },
                    { key: 'volume', label: 'Volume', tip: "Volume de negociação diário.\n\nVerde = dia de alta. Vermelho = dia de queda.\n\nRompimento com volume alto = movimento real.\nRompimento sem volume = possível falso sinal." },
                    { key: 'expectedMove', label: '±1σ Movimento Esperado', tip: "Faixa de Movimento Esperado (±1σ).\n\nBaseado na HV e DTE do simulador. 68% de probabilidade do preço ficar dentro da faixa no vencimento.\n\nStrike fora = menor risco de exercício.\nRequer DTE e HV no simulador." },
                  ].map(function(ind) {
                    var active = techIndicators[ind.key];
                    var disabled = ind.key === 'expectedMove' && (dteVal <= 0 || currentHV <= 0);
                    return (
                      <View key={'fs-' + ind.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <TouchableOpacity activeOpacity={0.7}
                          onPress={function() { if (!disabled) toggleIndicator(ind.key); }}
                          style={{
                            paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                            backgroundColor: active ? C.accent + '20' : 'transparent',
                            borderWidth: 1,
                            borderColor: disabled ? C.border + '40' : (active ? C.accent + '50' : C.border),
                            opacity: disabled ? 0.4 : 1,
                          }}>
                          <Text style={{
                            fontSize: 11, fontWeight: active ? '700' : '500', fontFamily: F.mono,
                            color: active ? C.accent : C.dim,
                          }}>{ind.label}</Text>
                        </TouchableOpacity>
                        <InfoTip title={ind.label} text={ind.tip} size={11} />
                      </View>
                    );
                  })}
                </View>
                <TechnicalChart
                  ohlcv={techOhlcv}
                  analysis={techAnalysis}
                  spot={spot}
                  strikePrice={fk > 0 ? fk : null}
                  height={techFsDims.w > techFsDims.h ? Math.max(techFsDims.h - 90, 200) : techFsDims.h - 260}
                  width={techFsDims.w - (techFsDims.w > techFsDims.h ? 88 : SIZE.padding * 2)}
                  color={C.opcoes}
                  indicators={techIndicators}
                  dte={dteVal}
                  hv={currentHV || 0}
                />
                {/* Breakout / Proximity Alerts (fullscreen) */}
                {techAnalysis.alerts && techAnalysis.alerts.length > 0 ? (
                  <View style={{ marginTop: 14, gap: 8 }}>
                    {techAnalysis.alerts.map(function(alert, aidx) {
                      var alertColor = alert.color === 'red' ? C.red : alert.color === 'green' ? C.green : C.etfs;
                      return (
                        <View key={'fta-' + aidx} style={{
                          flexDirection: 'row', alignItems: 'flex-start', gap: 10,
                          backgroundColor: alertColor + '10', borderRadius: 10, padding: 12,
                          borderLeftWidth: 3, borderLeftColor: alertColor,
                        }}>
                          <Ionicons name={alert.icon} size={18} color={alertColor} style={{ marginTop: 1 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 12, fontWeight: '700', color: alertColor, fontFamily: F.mono, marginBottom: 3 }}>
                              {alert.title.toUpperCase()}
                            </Text>
                            <Text style={{ fontSize: 12, color: C.text, fontFamily: F.body, lineHeight: 18 }}>
                              {alert.message}
                            </Text>
                            <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.body, lineHeight: 16, marginTop: 3, fontStyle: 'italic' }}>
                              {alert.actionHint}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
                {/* Supports / Resistances side by side */}
                {(techAnalysis.supports.length > 0 || techAnalysis.resistances.length > 0) ? (
                  <View style={{ flexDirection: 'row', marginTop: 14, gap: 20 }}>
                    {techAnalysis.supports.length > 0 ? (
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                          <Text style={{ fontSize: 11, color: C.green, fontFamily: F.mono, fontWeight: '700' }}>SUPORTES</Text>
                          <InfoTip title="Suportes" text={"Regiões de preço onde o ativo historicamente parou de cair e voltou a subir.\n\nIdentificados por pivots fractais, perfil de volume (badge VOL) e números redondos nos " + techPeriodLabel + ".\n\nQuanto mais toques e maior o volume, mais forte o nível.\n\nPara opções: venda de PUT com strike próximo a suporte forte tem menor risco de exercício."} size={11} />
                        </View>
                        {techAnalysis.supports.map(function(s, idx) {
                          return (
                            <View key={'fs-' + idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.green }} />
                              <Text style={{ fontSize: 13, color: C.text, fontFamily: F.mono }}>
                                {'R$ ' + s.price.toFixed(2)}
                              </Text>
                              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>
                                {'(' + s.strength + ' toques)'}
                              </Text>
                              {s.hasVolumeNode ? (
                                <View style={{ backgroundColor: C.green + '25', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 }}>
                                  <Text style={{ fontSize: 8, color: C.green, fontFamily: F.mono, fontWeight: '700' }}>VOL</Text>
                                </View>
                              ) : null}
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                    {techAnalysis.resistances.length > 0 ? (
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                          <Text style={{ fontSize: 11, color: C.red, fontFamily: F.mono, fontWeight: '700' }}>RESISTÊNCIAS</Text>
                          <InfoTip title="Resistências" text={"Regiões de preço onde o ativo historicamente parou de subir e recuou.\n\nIdentificadas por pivots fractais, perfil de volume (badge VOL) e números redondos nos " + techPeriodLabel + ".\n\nQuanto mais toques e maior o volume, mais forte o nível.\n\nPara opções: venda de CALL com strike próximo a resistência forte tem menor risco de exercício."} size={11} />
                        </View>
                        {techAnalysis.resistances.map(function(r, idx) {
                          return (
                            <View key={'fr-' + idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.red }} />
                              <Text style={{ fontSize: 13, color: C.text, fontFamily: F.mono }}>
                                {'R$ ' + r.price.toFixed(2)}
                              </Text>
                              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>
                                {'(' + r.strength + ' toques)'}
                              </Text>
                              {r.hasVolumeNode ? (
                                <View style={{ backgroundColor: C.red + '25', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 }}>
                                  <Text style={{ fontSize: 8, color: C.red, fontFamily: F.mono, fontWeight: '700' }}>VOL</Text>
                                </View>
                              ) : null}
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                ) : null}
                {/* SMA values + spot/strike info */}
                <View style={{ flexDirection: 'row', marginTop: 14, gap: 16, flexWrap: 'wrap' }}>
                  {spot > 0 ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 8, height: 2, backgroundColor: C.etfs, borderRadius: 1 }} />
                      <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>{'Spot R$ ' + spot.toFixed(2)}</Text>
                      <InfoTip title="Spot" text={"Preço atual do ativo no mercado à vista.\n\nÉ o valor de referência para calcular se uma opção está ITM (dentro do dinheiro), ATM (no dinheiro) ou OTM (fora do dinheiro)."} size={10} />
                    </View>
                  ) : null}
                  {fk > 0 ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 8, height: 2, backgroundColor: C.opcoes, borderRadius: 1 }} />
                      <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>{'Strike R$ ' + fk.toFixed(2)}</Text>
                      <InfoTip title="Strike" text={"Preço de exercício da opção selecionada no simulador.\n\nCompare o strike com suportes e resistências: um strike de CALL vendida próximo a uma resistência forte tem menor chance de ser exercido. Um strike de PUT vendida próximo a um suporte forte é mais seguro."} size={10} />
                    </View>
                  ) : null}
                  {techAnalysis.sma20[techAnalysis.sma20.length - 1] != null ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 8, height: 2, backgroundColor: C.rf, borderRadius: 1 }} />
                      <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>{'SMA 20: R$ ' + techAnalysis.sma20[techAnalysis.sma20.length - 1].toFixed(2)}</Text>
                      <InfoTip title="SMA 20" text={"Média Móvel Simples de 20 dias (curto prazo).\n\nCalcula a média dos preços de fechamento dos últimos 20 pregões. Funciona como suporte/resistência dinâmico.\n\n• Preço acima da SMA 20: tendência de curto prazo é de alta.\n• Preço abaixo da SMA 20: tendência de curto prazo é de baixa.\n• Cruzamento com SMA 50: sinal de mudança de tendência."} size={10} />
                    </View>
                  ) : null}
                  {techAnalysis.sma50[techAnalysis.sma50.length - 1] != null ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 8, height: 2, backgroundColor: C.etfs + '80', borderRadius: 1 }} />
                      <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>{'SMA 50: R$ ' + techAnalysis.sma50[techAnalysis.sma50.length - 1].toFixed(2)}</Text>
                      <InfoTip title="SMA 50" text={"Média Móvel Simples de 50 dias (médio prazo).\n\nCalcula a média dos preços de fechamento dos últimos 50 pregões. Indica a tendência de médio prazo.\n\n• SMA 20 > SMA 50 (golden cross): sinal altista.\n• SMA 20 < SMA 50 (death cross): sinal baixista.\n• Distância entre SMAs indica a força da tendência."} size={10} />
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
      {/* ═══ ANÁLISE IA ═══ */}
      {chainData && chainData.series && chainData.series.length > 0 ? (
        <View style={{ gap: SIZE.gap }}>
          <Glass padding={14}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Ionicons name="sparkles-outline" size={14} color={C.accent} />
              <Text style={{ fontSize: 12, color: C.accent, fontFamily: F.mono, fontWeight: '600', letterSpacing: 0.5 }}>ANÁLISE IA</Text>
            </View>
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
          </Glass>
          {subCtx.canAccess('AI_ANALYSIS') ? (
            <TouchableOpacity activeOpacity={0.7} disabled={aiLoading || spot <= 0}
              onPress={function() { setPendingAiType('Análise de opções'); setAiConfirmVisible(true); }}
              accessibilityRole="button" accessibilityLabel="Analisar cadeia de opções com inteligência artificial"
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 8, paddingVertical: 14, borderRadius: SIZE.radius,
                backgroundColor: C.accent + '18', borderWidth: 1, borderColor: C.accent + '40',
                opacity: (aiLoading || spot <= 0) ? 0.5 : 1,
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
          ) : (
            <UpgradePrompt feature="AI_ANALYSIS" compact={true} />
          )}
          {aiUsage ? (
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>
                {'Hoje: ' + aiUsage.today + '/' + aiUsage.daily_limit}
              </Text>
              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>
                {'Mês: ' + aiUsage.month + '/' + aiUsage.monthly_limit}
              </Text>
              {aiUsage.credits > 0 ? (
                <Text style={{ fontSize: 10, color: C.accent, fontFamily: F.mono, fontWeight: '600' }}>
                  {'+' + aiUsage.credits + ' extras'}
                </Text>
              ) : null}
            </View>
          ) : null}
          {aiLoading && aiStreamText ? (
            <View style={{ padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: C.accent + '25', maxHeight: 200 }}>
              <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled={true}>
                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontFamily: F.body, lineHeight: 18 }}>
                  {aiStreamText}<Text style={{ color: C.accent, fontWeight: '700', fontSize: 13 }}>|</Text>
                </Text>
              </ScrollView>
            </View>
          ) : null}
          {aiError ? (
            <View style={{ padding: 10, borderRadius: 10, backgroundColor: C.red + '10', borderWidth: 1, borderColor: C.red + '25' }}>
              <Text style={{ fontSize: 12, color: C.red, fontFamily: F.body, textAlign: 'center' }}>{aiError}</Text>
            </View>
          ) : null}
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
                Ver análise IA
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {/* AI Confirm Modal (options analysis) */}
      <AiConfirmModal
        visible={aiConfirmVisible}
        navigation={navigation}
        analysisType={pendingAiType}
        onCancel={function() { setAiConfirmVisible(false); setPendingAiType(''); }}
        onConfirm={function() {
          setAiConfirmVisible(false);
          setPendingAiType('');
          handleSmartAnalysis();
        }}
      />

      {/* AI Analysis Modal */}
      <Modal visible={aiModalOpen} animationType="slide" transparent={false}
        onRequestClose={function() { setAiModalOpen(false); }}>
        <AiAnalysisModal analysis={aiAnalysis} onClose={function() { setAiModalOpen(false); }}
          onSave={subCtx.canAccess('SAVED_ANALYSES') ? function() { handleSaveAnalysis(true); } : undefined}
          onRetry={function() { setAiModalOpen(false); handleSmartAnalysis(); }}
          techOhlcv={techOhlcv} techAnalysis={techAnalysis} spot={spot} strikePrice={fk} />
      </Modal>
    </View>
  );
}

// ═══════════════════════════════════════
// RADAR DE OPORTUNIDADES
// ═══════════════════════════════════════
function RadarView(props) {
  var positions = props.positions || [];
  var selicRate = props.selicRate || 13.25;
  var onNavigateToSim = props.onNavigateToSim; // function(ticker)
  var ps = usePrivacyStyle();

  // State persistido no OpcoesScreen (sobrevive troca de sub-tab)
  var radarResults = props.radarResults; var setRadarResults = props.setRadarResults;
  var radarScanning = props.radarScanning; var setRadarScanning = props.setRadarScanning;
  var radarScannedCount = props.radarScannedCount; var setRadarScannedCount = props.setRadarScannedCount;
  var radarTotalCount = props.radarTotalCount; var setRadarTotalCount = props.setRadarTotalCount;
  var radarLastScan = props.radarLastScan; var setRadarLastScan = props.setRadarLastScan;

  // State local (ok resetar ao trocar tab)
  var _radarFilter = useState('todos'); var radarFilter = _radarFilter[0]; var setRadarFilter = _radarFilter[1];
  var _radarActionFilter = useState('todos'); var radarActionFilter = _radarActionFilter[0]; var setRadarActionFilter = _radarActionFilter[1];
  var _radarShowConfig = useState(false); var radarShowConfig = _radarShowConfig[0]; var setRadarShowConfig = _radarShowConfig[1];
  var _radarExcludedTickers = useState({}); var radarExcludedTickers = _radarExcludedTickers[0]; var setRadarExcludedTickers = _radarExcludedTickers[1];
  var _radarCustomTickers = useState([]); var radarCustomTickers = _radarCustomTickers[0]; var setRadarCustomTickers = _radarCustomTickers[1];
  var _radarConfigChanged = useState(false); var radarConfigChanged = _radarConfigChanged[0]; var setRadarConfigChanged = _radarConfigChanged[1];
  var _radarTickerInput = useState(''); var radarTickerInput = _radarTickerInput[0]; var setRadarTickerInput = _radarTickerInput[1];
  // Draft state — edições pendentes até o usuario salvar
  var _draftExcluded = useState({}); var draftExcluded = _draftExcluded[0]; var setDraftExcluded = _draftExcluded[1];
  var _draftCustom = useState([]); var draftCustom = _draftCustom[0]; var setDraftCustom = _draftCustom[1];
  var _draftDirty = useState(false); var draftDirty = _draftDirty[0]; var setDraftDirty = _draftDirty[1];

  var userTickers = [];
  for (var p = 0; p < positions.length; p++) {
    var cat = (positions[p].categoria || '').toLowerCase();
    if (cat === 'acao' || cat === 'fii') {
      userTickers.push(positions[p].ticker);
    }
  }

  // Combinar user + custom tickers
  var allUserTickers = userTickers.slice();
  for (var ct = 0; ct < radarCustomTickers.length; ct++) {
    if (allUserTickers.indexOf(radarCustomTickers[ct]) === -1) {
      allUserTickers.push(radarCustomTickers[ct]);
    }
  }

  var tickerList = buildTickerList(allUserTickers, [], true, radarExcludedTickers);

  function handleStartScan() {
    setRadarScanning(true);
    setRadarResults([]);
    setRadarScannedCount(0);
    setRadarTotalCount(tickerList.length);
    setRadarFilter('todos');
    setRadarActionFilter('todos');
    setRadarConfigChanged(false);

    scanBatch(tickerList, selicRate, function(results, scanned, total) {
      setRadarResults(results);
      setRadarScannedCount(scanned);
      setRadarTotalCount(total);
    }).then(function(final) {
      setRadarResults(final.results);
      setRadarScannedCount(final.scanned);
      setRadarScanning(false);
      setRadarLastScan(new Date());
    });
  }

  function handleStopScan() {
    abortScan();
    setRadarScanning(false);
  }

  // Score do grupo: media ponderada + bonus por qtd sinais
  function calcGroupScore(opps) {
    if (!opps || opps.length === 0) return 0;
    var weightSum = 0;
    var valSum = 0;
    for (var gs = 0; gs < opps.length; gs++) {
      var w = opps[gs].score;
      weightSum += w;
      valSum += w * w; // peso = score (quadratico favorece altos)
    }
    var avg = weightSum > 0 ? Math.round(valSum / weightSum) : 0;
    var bonus = Math.min(10, (opps.length - 1) * 3);
    return Math.min(99, avg + bonus);
  }

  // Agrupar por ticker
  var tickerGroups = {};
  var tickerOrder = [];
  for (var gi = 0; gi < radarResults.length; gi++) {
    var opp = radarResults[gi];
    if (!tickerGroups[opp.ticker]) {
      tickerGroups[opp.ticker] = { ticker: opp.ticker, opps: [], bestScore: 0, spot: opp.spot || 0 };
      tickerOrder.push(opp.ticker);
    }
    tickerGroups[opp.ticker].opps.push(opp);
  }
  // Recalcular bestScore com media ponderada
  for (var gs2 = 0; gs2 < tickerOrder.length; gs2++) {
    var grpCalc = tickerGroups[tickerOrder[gs2]];
    grpCalc.bestScore = calcGroupScore(grpCalc.opps);
  }

  // Contar tipos e acoes para filter pills
  var typeCounts = {};
  var actionCounts = { compra: 0, venda: 0, neutro: 0 };
  for (var tc = 0; tc < radarResults.length; tc++) {
    var t = radarResults[tc].type;
    typeCounts[t] = (typeCounts[t] || 0) + 1;
    var actType = radarResults[tc].action ? radarResults[tc].action.type : 'neutro';
    actionCounts[actType] = (actionCounts[actType] || 0) + 1;
  }
  var typeKeys = Object.keys(typeCounts).sort(function(a, b) { return typeCounts[b] - typeCounts[a]; });

  // Filtrar por tipo e acao (dentro de cada grupo)
  var filteredGroups = [];
  for (var fg = 0; fg < tickerOrder.length; fg++) {
    var grp = tickerGroups[tickerOrder[fg]];
    var groupOpps = [];
    for (var fo = 0; fo < grp.opps.length; fo++) {
      var oppItem = grp.opps[fo];
      if (radarFilter !== 'todos' && oppItem.type !== radarFilter) continue;
      if (radarActionFilter !== 'todos') {
        var oppActType = oppItem.action ? oppItem.action.type : 'neutro';
        if (oppActType !== radarActionFilter) continue;
      }
      groupOpps.push(oppItem);
    }
    if (groupOpps.length > 0) {
      groupOpps = groupOpps.slice().sort(function(a, b) { return b.score - a.score; });
      var bestFiltered = calcGroupScore(groupOpps);
      filteredGroups.push({ ticker: grp.ticker, opps: groupOpps, bestScore: bestFiltered, spot: grp.spot });
    }
  }

  // Ordenar grupos: melhor score primeiro
  filteredGroups.sort(function(a, b) { return b.bestScore - a.bestScore; });

  var uniqueCount = tickerOrder.length;
  var totalOpps = radarResults.length;

  // Status do mercado
  var b3Status = getB3Status();
  var marketStatusBadge = React.createElement(View, {
    style: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: b3Status.isOpen ? C.green + '15' : C.red + '15', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: b3Status.isOpen ? C.green + '30' : C.red + '30' }
  },
    React.createElement(View, { style: { width: 6, height: 6, borderRadius: 3, backgroundColor: b3Status.isOpen ? C.green : C.red } }),
    React.createElement(Text, { style: { fontSize: 11, fontFamily: F.body, color: b3Status.isOpen ? C.green : C.red, fontWeight: '600' } },
      b3Status.isOpen ? 'B3 Aberta' : 'B3 Fechada'),
    React.createElement(Text, { style: { fontSize: 10, fontFamily: F.body, color: b3Status.isOpen ? C.green + 'AA' : C.red + 'AA' } },
      '— ' + b3Status.reason)
  );

  // Disclaimer
  var disclaimer = React.createElement(View, { style: { gap: 8 } },
    marketStatusBadge,
    React.createElement(Glass, { style: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12 } },
      React.createElement(Ionicons, { name: 'information-circle-outline', size: 16, color: C.textTertiary }),
      React.createElement(Text, {
        style: { flex: 1, fontSize: 11, fontFamily: F.body, color: C.textTertiary, lineHeight: 16 }
      }, 'As informações apresentadas são meramente informativas e não constituem recomendação de investimento. A responsabilidade por qualquer decisão de investimento é exclusivamente do usuário.' + (b3Status.isOpen ? ' Dados atualizados a cada 2 minutos.' : ' Bolsa fechada — dados do último pregão (cache estendido).'))
    )
  );

  // Estado inicial (sem resultados, sem scan)
  if (!radarLastScan && !radarScanning) {
    return React.createElement(View, { style: { gap: SIZE.gap } },
      React.createElement(SectionLabel, null, 'RADAR DE OPORTUNIDADES'),
      disclaimer,
      React.createElement(EmptyState, {
        ionicon: 'radio-outline',
        title: 'Radar de Oportunidades',
        description: 'Escaneia os principais ativos da B3 para identificar oportunidades em opções — IV extremo, suportes/resistências, prêmios baratos e mais.',
        cta: 'Iniciar Scan (' + tickerList.length + ' ativos)',
        onCta: handleStartScan,
        color: C.opcoes,
      }),
      React.createElement(TouchableOpacity, {
        style: { alignSelf: 'center', paddingVertical: 8 },
        onPress: function() { radarShowConfig ? handleCloseConfig() : handleOpenConfig(); }
      },
        React.createElement(Text, { style: { fontSize: 12, color: C.textSecondary, fontFamily: F.body } },
          radarShowConfig ? 'Ocultar configurações' : 'Configurar tickers')
      ),
      radarShowConfig ? renderConfig() : null
    );
  }

  // Ao abrir config, inicializar drafts com estado atual
  function handleOpenConfig() {
    var excCopy = {};
    var excKeys = Object.keys(radarExcludedTickers);
    for (var i = 0; i < excKeys.length; i++) excCopy[excKeys[i]] = true;
    setDraftExcluded(excCopy);
    setDraftCustom(radarCustomTickers.slice());
    setDraftDirty(false);
    setRadarShowConfig(true);
  }

  function handleCloseConfig() {
    setRadarShowConfig(false);
    setDraftDirty(false);
  }

  function handleSaveConfig() {
    setRadarExcludedTickers(draftExcluded);
    setRadarCustomTickers(draftCustom);
    setRadarConfigChanged(true);
    setDraftDirty(false);
    setRadarShowConfig(false);
    Toast.show({ type: 'success', text1: 'Configuração salva', text2: tickerList.length + ' ativos no próximo scan', visibilityTime: 2000 });
  }

  function handleAddCustomTicker(item) {
    var tk = (item.ticker || '').toUpperCase().trim();
    if (!tk) return;
    if (draftCustom.indexOf(tk) !== -1) return;
    if (userTickers.indexOf(tk) !== -1) return;
    var next = draftCustom.slice();
    next.push(tk);
    setDraftCustom(next);
    setRadarTickerInput('');
    setDraftDirty(true);
  }

  function handleRemoveCustomTicker(tk) {
    var next = [];
    for (var i = 0; i < draftCustom.length; i++) {
      if (draftCustom[i] !== tk) next.push(draftCustom[i]);
    }
    setDraftCustom(next);
    setDraftDirty(true);
  }

  function handleToggleDefaultTicker(tk) {
    var next = {};
    var keys = Object.keys(draftExcluded);
    for (var i = 0; i < keys.length; i++) {
      next[keys[i]] = true;
    }
    if (next[tk]) {
      delete next[tk];
    } else {
      next[tk] = true;
    }
    setDraftExcluded(next);
    setDraftDirty(true);
  }

  function handleToggleUserTicker(tk) {
    var next = {};
    var keys = Object.keys(draftExcluded);
    for (var i = 0; i < keys.length; i++) {
      next[keys[i]] = true;
    }
    if (next[tk]) {
      delete next[tk];
    } else {
      next[tk] = true;
    }
    setDraftExcluded(next);
    setDraftDirty(true);
  }

  function renderConfig() {
    // Contar com base no draft
    var activeDefaultCount = 0;
    for (var rd = 0; rd < RADAR_TICKERS.length; rd++) {
      if (!draftExcluded[RADAR_TICKERS[rd]]) activeDefaultCount++;
    }
    var activeUserCount = 0;
    for (var ru = 0; ru < userTickers.length; ru++) {
      if (!draftExcluded[userTickers[ru]]) activeUserCount++;
    }
    // Calcular total do draft
    var draftAllUser = userTickers.slice();
    for (var dc = 0; dc < draftCustom.length; dc++) {
      if (draftAllUser.indexOf(draftCustom[dc]) === -1) draftAllUser.push(draftCustom[dc]);
    }
    var draftTotal = buildTickerList(draftAllUser, [], true, draftExcluded).length;

    return React.createElement(Glass, { style: { padding: SIZE.padding, gap: 12 } },
      React.createElement(View, { style: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' } },
        React.createElement(Text, { style: { fontSize: 13, fontFamily: F.display, color: C.text, fontWeight: '700' } }, 'Configurações do Scan'),
        React.createElement(TouchableOpacity, { onPress: handleCloseConfig },
          React.createElement(Ionicons, { name: 'close', size: 18, color: C.textSecondary })
        )
      ),

      React.createElement(Text, { style: { fontSize: 11, fontFamily: F.body, color: C.textTertiary, lineHeight: 16 } },
        'Toque nos tickers para incluir ou excluir do scan. Tickers excluídos ficam riscados.'),

      // TickerInput para adicionar custom
      React.createElement(View, { style: { gap: 4 } },
        React.createElement(Text, { style: { fontSize: 11, fontFamily: F.body, color: C.textSecondary } }, 'Adicionar ticker'),
        React.createElement(TickerInput, {
          value: radarTickerInput,
          onChangeText: function(v) { setRadarTickerInput(v); },
          tickers: userTickers,
          placeholder: 'Ex: PETR4',
          onSearch: function(q) { return searchTickers(q, 'BR'); },
          onSuggestionSelect: handleAddCustomTicker,
        })
      ),

      // Tickers custom adicionados
      draftCustom.length > 0 ? React.createElement(View, { style: { gap: 4 } },
        React.createElement(Text, { style: { fontSize: 11, fontFamily: F.body, color: C.textSecondary } }, 'Adicionados (' + draftCustom.length + ')'),
        React.createElement(View, { style: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 } },
          draftCustom.map(function(tk) {
            return React.createElement(TouchableOpacity, {
              key: 'custom_' + tk,
              style: {
                flexDirection: 'row', alignItems: 'center', gap: 4,
                paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
                backgroundColor: '#22C55E20', borderWidth: 1, borderColor: '#22C55E40',
              },
              onPress: function() { handleRemoveCustomTicker(tk); }
            },
              React.createElement(Text, { style: { fontSize: 10, fontFamily: F.mono, color: '#22C55E' } }, tk),
              React.createElement(Ionicons, { name: 'close-circle', size: 12, color: '#22C55E' })
            );
          })
        )
      ) : null,

      // Carteira — agora clicavel para excluir/incluir
      userTickers.length > 0 ? React.createElement(View, { style: { gap: 4 } },
        React.createElement(View, { style: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' } },
          React.createElement(Text, { style: { fontSize: 11, fontFamily: F.body, color: C.textSecondary } }, 'Carteira (' + activeUserCount + '/' + userTickers.length + ')'),
          React.createElement(View, { style: { flexDirection: 'row', alignItems: 'center', gap: 8 } },
            React.createElement(TouchableOpacity, { onPress: function() {
              var next = {};
              var keys = Object.keys(draftExcluded);
              for (var i = 0; i < keys.length; i++) {
                if (userTickers.indexOf(keys[i]) === -1) next[keys[i]] = true;
              }
              setDraftExcluded(next); setDraftDirty(true);
            }},
              React.createElement(Text, { style: { fontSize: 10, fontFamily: F.body, color: C.opcoes } }, 'Todos')
            ),
            React.createElement(TouchableOpacity, { onPress: function() {
              var next = {};
              var keys = Object.keys(draftExcluded);
              for (var i = 0; i < keys.length; i++) next[keys[i]] = true;
              for (var u = 0; u < userTickers.length; u++) next[userTickers[u]] = true;
              setDraftExcluded(next); setDraftDirty(true);
            }},
              React.createElement(Text, { style: { fontSize: 10, fontFamily: F.body, color: C.dim } }, 'Nenhum')
            )
          )
        ),
        React.createElement(View, { style: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 } },
          userTickers.map(function(tk) {
            var isExcluded = !!draftExcluded[tk];
            return React.createElement(TouchableOpacity, {
              key: 'user_' + tk,
              style: {
                paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
                backgroundColor: isExcluded ? 'rgba(255,255,255,0.02)' : C.opcoes + '20',
                borderWidth: 1, borderColor: isExcluded ? 'rgba(255,255,255,0.03)' : C.opcoes + '40',
                opacity: isExcluded ? 0.4 : 1,
              },
              onPress: function() { handleToggleUserTicker(tk); }
            },
              React.createElement(Text, {
                style: {
                  fontSize: 10, fontFamily: F.mono,
                  color: isExcluded ? C.dim : C.opcoes,
                  textDecorationLine: isExcluded ? 'line-through' : 'none',
                }
              }, tk)
            );
          })
        )
      ) : null,

      // Mais liquidos B3 — cada um clicavel
      React.createElement(View, { style: { gap: 4 } },
        React.createElement(View, { style: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' } },
          React.createElement(Text, { style: { fontSize: 11, fontFamily: F.body, color: C.textSecondary } }, 'Mais líquidos B3 (' + activeDefaultCount + '/' + RADAR_TICKERS.length + ')'),
          React.createElement(View, { style: { flexDirection: 'row', alignItems: 'center', gap: 8 } },
            React.createElement(TouchableOpacity, { onPress: function() {
              var next = {};
              var keys = Object.keys(draftExcluded);
              for (var i = 0; i < keys.length; i++) {
                if (RADAR_TICKERS.indexOf(keys[i]) === -1 || userTickers.indexOf(keys[i]) !== -1) {
                  next[keys[i]] = true;
                }
              }
              setDraftExcluded(next); setDraftDirty(true);
            }},
              React.createElement(Text, { style: { fontSize: 10, fontFamily: F.body, color: C.opcoes } }, 'Todos')
            ),
            React.createElement(TouchableOpacity, { onPress: function() {
              var next = {};
              var keys = Object.keys(draftExcluded);
              for (var i = 0; i < keys.length; i++) next[keys[i]] = true;
              for (var d = 0; d < RADAR_TICKERS.length; d++) {
                if (userTickers.indexOf(RADAR_TICKERS[d]) === -1) next[RADAR_TICKERS[d]] = true;
              }
              setDraftExcluded(next); setDraftDirty(true);
            }},
              React.createElement(Text, { style: { fontSize: 10, fontFamily: F.body, color: C.dim } }, 'Nenhum')
            )
          )
        ),
        React.createElement(View, { style: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 } },
          RADAR_TICKERS.map(function(tk) {
            var isExcluded = !!draftExcluded[tk];
            var isInPortfolio = userTickers.indexOf(tk) !== -1;
            if (isInPortfolio) return null; // Ja aparece na secao Carteira
            return React.createElement(TouchableOpacity, {
              key: 'def_' + tk,
              style: {
                paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
                backgroundColor: isExcluded ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)',
                borderWidth: 1, borderColor: isExcluded ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
                opacity: isExcluded ? 0.4 : 1,
              },
              onPress: function() { handleToggleDefaultTicker(tk); }
            },
              React.createElement(Text, {
                style: {
                  fontSize: 10, fontFamily: F.mono,
                  color: isExcluded ? C.dim : C.textSecondary,
                  textDecorationLine: isExcluded ? 'line-through' : 'none',
                }
              }, tk)
            );
          })
        )
      ),

      // Total
      React.createElement(Text, { style: { fontSize: 12, fontFamily: F.body, color: C.textSecondary, marginTop: 2 } },
        'Total: ' + draftTotal + ' ativos'),

      // Botoes Salvar / Cancelar
      React.createElement(View, { style: { flexDirection: 'row', gap: 10, marginTop: 4 } },
        React.createElement(TouchableOpacity, {
          style: {
            flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8,
            backgroundColor: draftDirty ? C.opcoes : C.opcoes + '40',
          },
          onPress: handleSaveConfig,
        },
          React.createElement(Text, { style: { fontSize: 13, fontFamily: F.display, color: '#fff', fontWeight: '700' } },
            draftDirty ? 'Salvar' : 'OK')
        ),
        draftDirty ? React.createElement(TouchableOpacity, {
          style: {
            flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8,
            backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
          },
          onPress: handleCloseConfig,
        },
          React.createElement(Text, { style: { fontSize: 13, fontFamily: F.display, color: C.textSecondary, fontWeight: '600' } }, 'Cancelar')
        ) : null
      )
    );
  }

  // Escaneando ou com resultados
  return React.createElement(View, { style: { gap: SIZE.gap } },
    React.createElement(SectionLabel, null, 'RADAR DE OPORTUNIDADES'),
    disclaimer,

    // Progresso do scan
    radarScanning ? React.createElement(Glass, { style: { padding: SIZE.padding, gap: 10 } },
      React.createElement(View, { style: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' } },
        React.createElement(View, { style: { flexDirection: 'row', alignItems: 'center', gap: 8 } },
          React.createElement(ActivityIndicator, { size: 'small', color: C.opcoes }),
          React.createElement(Text, { style: { fontSize: 13, fontFamily: F.body, color: C.text } },
            'Escaneando... ' + radarScannedCount + '/' + radarTotalCount)
        ),
        React.createElement(TouchableOpacity, { onPress: handleStopScan },
          React.createElement(Text, { style: { fontSize: 12, fontFamily: F.body, color: C.red } }, 'Parar')
        )
      ),
      React.createElement(View, {
        style: { height: 3, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }
      },
        React.createElement(View, {
          style: {
            width: (radarTotalCount > 0 ? (radarScannedCount / radarTotalCount * 100) : 0) + '%',
            height: 3, backgroundColor: C.opcoes, borderRadius: 2,
          }
        })
      )
    ) : null,

    // Header resultados + config button
    totalOpps > 0 || radarLastScan ? React.createElement(View, { style: { gap: 8 } },
      React.createElement(View, { style: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' } },
        React.createElement(Text, { style: { fontSize: 13, fontFamily: F.body, color: C.textSecondary } },
          totalOpps > 0 ? totalOpps + ' oportunidade' + (totalOpps !== 1 ? 's' : '') + ' em ' + uniqueCount + ' ativo' + (uniqueCount !== 1 ? 's' : '') +
          (radarLastScan ? ' — ' + radarLastScan.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '') : ''),
        React.createElement(View, { style: { flexDirection: 'row', alignItems: 'center', gap: 10 } },
          React.createElement(TouchableOpacity, {
            style: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: radarShowConfig ? C.opcoes + '20' : 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: radarShowConfig ? C.opcoes + '40' : 'rgba(255,255,255,0.06)' },
            onPress: function() { radarShowConfig ? handleCloseConfig() : handleOpenConfig(); }
          },
            React.createElement(Ionicons, { name: 'settings-outline', size: 13, color: radarShowConfig ? C.opcoes : C.textSecondary }),
            React.createElement(Text, { style: { fontSize: 11, fontFamily: F.body, color: radarShowConfig ? C.opcoes : C.textSecondary } }, tickerList.length + ' ativos')
          ),
          !radarScanning ? React.createElement(TouchableOpacity, {
            style: { flexDirection: 'row', alignItems: 'center', gap: 4 },
            onPress: handleStartScan,
          },
            React.createElement(Ionicons, { name: 'refresh-outline', size: 14, color: C.opcoes }),
            React.createElement(Text, { style: { fontSize: 12, fontFamily: F.body, color: C.opcoes } }, 'Re-scan')
          ) : null
        )
      ),
      radarShowConfig ? renderConfig() : null
    ) : null,

    // Filter pills — tipo
    totalOpps > 0 ? React.createElement(ScrollView, {
      horizontal: true, showsHorizontalScrollIndicator: false,
      contentContainerStyle: { gap: 6, paddingBottom: 2 }
    },
      React.createElement(Pill, {
        active: radarFilter === 'todos', color: C.opcoes,
        onPress: function() { setRadarFilter('todos'); }
      }, 'Todos (' + totalOpps + ')'),
      typeKeys.map(function(typeKey) {
        var meta = getOpportunityMeta(typeKey);
        return React.createElement(Pill, {
          key: typeKey,
          active: radarFilter === typeKey, color: meta.color,
          onPress: function() { setRadarFilter(radarFilter === typeKey ? 'todos' : typeKey); }
        }, meta.short + ' (' + typeCounts[typeKey] + ')');
      })
    ) : null,

    // Filter pills — acao (compra/venda/neutro)
    totalOpps > 0 ? React.createElement(ScrollView, {
      horizontal: true, showsHorizontalScrollIndicator: false,
      contentContainerStyle: { gap: 6, paddingBottom: 2 }
    },
      React.createElement(Pill, {
        active: radarActionFilter === 'todos', color: C.textSecondary,
        onPress: function() { setRadarActionFilter('todos'); }
      }, 'Ação: Todos'),
      actionCounts.compra > 0 ? React.createElement(Pill, {
        key: 'act_compra',
        active: radarActionFilter === 'compra', color: C.green,
        onPress: function() { setRadarActionFilter(radarActionFilter === 'compra' ? 'todos' : 'compra'); }
      }, 'Compra (' + actionCounts.compra + ')') : null,
      actionCounts.venda > 0 ? React.createElement(Pill, {
        key: 'act_venda',
        active: radarActionFilter === 'venda', color: C.red,
        onPress: function() { setRadarActionFilter(radarActionFilter === 'venda' ? 'todos' : 'venda'); }
      }, 'Venda (' + actionCounts.venda + ')') : null,
      actionCounts.neutro > 0 ? React.createElement(Pill, {
        key: 'act_neutro',
        active: radarActionFilter === 'neutro', color: '#8B5CF6',
        onPress: function() { setRadarActionFilter(radarActionFilter === 'neutro' ? 'todos' : 'neutro'); }
      }, 'Neutro (' + actionCounts.neutro + ')') : null
    ) : null,

    // Cards agrupados por ativo
    filteredGroups.map(function(group) {
      var scoreColor = group.bestScore >= 65 ? C.green : group.bestScore >= 40 ? C.yellow : C.dim;
      return React.createElement(Glass, {
        key: 'grp_' + group.ticker,
        style: { padding: 0, overflow: 'hidden' }
      },
        // Header do ativo — destaque grande
        React.createElement(TouchableOpacity, {
          style: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SIZE.padding, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
          activeOpacity: 0.7,
          onPress: function() { if (onNavigateToSim) onNavigateToSim(group.ticker); },
        },
          React.createElement(View, { style: { flexDirection: 'row', alignItems: 'center', gap: 10 } },
            // Bolinha com score
            React.createElement(View, {
              style: { width: 40, height: 40, borderRadius: 20, backgroundColor: scoreColor + '18', borderWidth: 1.5, borderColor: scoreColor + '40', alignItems: 'center', justifyContent: 'center' }
            },
              React.createElement(Text, { style: { fontSize: 14, fontFamily: F.mono, color: scoreColor, fontWeight: '700' } }, String(group.bestScore))
            ),
            React.createElement(View, { style: { gap: 2 } },
              React.createElement(Text, { style: { fontSize: 17, fontFamily: F.display, color: C.text, fontWeight: '700' } }, group.ticker),
              React.createElement(Text, {
                style: [{ fontSize: 12, fontFamily: F.mono, color: C.textSecondary }, ps]
              }, group.spot > 0 ? 'R$ ' + fmt(group.spot) : ''),
              React.createElement(Text, { style: { fontSize: 11, fontFamily: F.body, color: C.dim } },
                group.opps.length + ' sinal' + (group.opps.length !== 1 ? 'is' : ''))
            )
          ),
          React.createElement(View, { style: { flexDirection: 'row', alignItems: 'center', gap: 4 } },
            React.createElement(Text, { style: { fontSize: 11, fontFamily: F.mono, color: C.opcoes } }, 'Simulador'),
            React.createElement(Ionicons, { name: 'chevron-forward', size: 14, color: C.opcoes })
          )
        ),

        // Lista de oportunidades dentro do ativo
        group.opps.map(function(opp, oi) {
          var meta = getOpportunityMeta(opp.type);
          var oppScoreColor = opp.score >= 65 ? C.green : opp.score >= 40 ? C.yellow : C.dim;
          var oppAction = opp.action || meta.defaultAction;
          var isLast = oi === group.opps.length - 1;
          return React.createElement(View, {
            key: opp.type + '_' + oi,
            style: { paddingHorizontal: SIZE.padding, paddingVertical: 10, borderBottomWidth: isLast ? 0 : 1, borderBottomColor: 'rgba(255,255,255,0.03)' }
          },
            // Tipo + action badge + score inline
            React.createElement(View, { style: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 } },
              React.createElement(View, {
                style: { flexDirection: 'row', alignItems: 'center', gap: 6 }
              },
                React.createElement(Ionicons, { name: meta.icon, size: 14, color: meta.color }),
                React.createElement(Text, { style: { fontSize: 12, fontFamily: F.body, color: meta.color, fontWeight: '600' } }, meta.label),
                oppAction ? React.createElement(View, {
                  style: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: oppAction.color + '20', borderWidth: 1, borderColor: oppAction.color + '40' }
                },
                  React.createElement(Text, { style: { fontSize: 9, fontFamily: F.mono, color: oppAction.color, fontWeight: '700' } }, oppAction.label)
                ) : null
              ),
              // Score mini bar
              React.createElement(View, { style: { flexDirection: 'row', alignItems: 'center', gap: 6, width: 80 } },
                React.createElement(View, {
                  style: { flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }
                },
                  React.createElement(View, {
                    style: { width: opp.score + '%', height: 3, backgroundColor: oppScoreColor, borderRadius: 2 }
                  })
                ),
                React.createElement(Text, { style: { fontSize: 10, fontFamily: F.mono, color: oppScoreColor, fontWeight: '700', minWidth: 20, textAlign: 'right' } }, String(opp.score))
              )
            ),
            // Descricao compacta
            React.createElement(Text, { style: { fontSize: 11, fontFamily: F.body, color: C.textSecondary, lineHeight: 16, marginBottom: 2 } }, opp.description),
            // Metricas
            React.createElement(Text, {
              style: [{ fontSize: 10, fontFamily: F.mono, color: C.dim, letterSpacing: 0.3 }, ps]
            }, opp.metrics)
          );
        })
      );
    }),

    // Sem resultados apos scan
    !radarScanning && radarLastScan && radarResults.length === 0 ? React.createElement(EmptyState, {
      ionicon: 'checkmark-circle-outline',
      title: 'Nenhuma oportunidade detectada',
      description: 'Nenhum dos ' + radarTotalCount + ' ativos apresentou sinais fortes neste momento. Tente novamente mais tarde.',
      cta: 'Re-scan',
      onCta: handleStartScan,
      color: C.opcoes,
    }) : null,

  );
}

// ═══════════════════════════════════════
// MAIN OPCOES SCREEN
// ═══════════════════════════════════════
export default function OpcoesScreen() {
  var ps = usePrivacyStyle();
  var navigation = useNavigation();
  var user = useAuth().user;
  var subCtx = useSubscription();

  var scrollRef = useRef(null);
  useScrollToTop(scrollRef);

  // Fase F: Calc como protagonista — default sub-tab e 'sim' (Simulador BS)
  var s1 = useState('sim'); var sub = s1[0]; var setSub = s1[1];
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
  var _chainsReady = useState(0); var chainsReady = _chainsReady[0]; var setChainsReady = _chainsReady[1];
  var _alertsFired = useState({}); var alertsFired = _alertsFired[0]; var setAlertsFired = _alertsFired[1];
  var _priceAlerts = useState([]); var priceAlerts = _priceAlerts[0]; var setPriceAlerts = _priceAlerts[1];
  var _priceAlertsFired = useState({}); var priceAlertsFired = _priceAlertsFired[0]; var setPriceAlertsFired = _priceAlertsFired[1];
  var _garantiasConfig = useState({}); var garantiasConfig = _garantiasConfig[0]; var setGarantiasConfig = _garantiasConfig[1];
  var _garantiasDropdown = useState(false); var garantiasDropdown = _garantiasDropdown[0]; var setGarantiasDropdown = _garantiasDropdown[1];
  var _garantiasOpen = useState({}); var garantiasOpen = _garantiasOpen[0]; var setGarantiasOpen = _garantiasOpen[1];

  // Historico filter states
  var _histFilterMode = useState('todos'); var histFilterMode = _histFilterMode[0]; var setHistFilterMode = _histFilterMode[1]; // 'todos','mes','ano','periodo'
  var _histFilterMonth = useState(new Date().getMonth()); var histFilterMonth = _histFilterMonth[0]; var setHistFilterMonth = _histFilterMonth[1];
  var _histFilterYear = useState(new Date().getFullYear()); var histFilterYear = _histFilterYear[0]; var setHistFilterYear = _histFilterYear[1];
  var _histDateDe = useState(''); var histDateDe = _histDateDe[0]; var setHistDateDe = _histDateDe[1];
  var _histDateAte = useState(''); var histDateAte = _histDateAte[0]; var setHistDateAte = _histDateAte[1];
  var _histStatusFilter = useState('todos'); var histStatusFilter = _histStatusFilter[0]; var setHistStatusFilter = _histStatusFilter[1]; // 'todos','fechada','exercida','vencida'
  var _histTipoFilter = useState('todos'); var histTipoFilter = _histTipoFilter[0]; var setHistTipoFilter = _histTipoFilter[1]; // 'todos','call','put'
  var _histShowAll = useState(false); var histShowAll = _histShowAll[0]; var setHistShowAll = _histShowAll[1];
  var HIST_PAGE_SIZE = 20;

  // Portfolio states — selectedPortfolio unificado via AppStoreContext
  var _portfolios = useState([]); var portfolios = _portfolios[0]; var setPortfolios = _portfolios[1];
  var appStore = useAppStore();
  var selPortfolio = appStore.selectedPortfolio;
  var setSelPortfolio = appStore.setSelectedPortfolio;
  var _showPortDD = useState(false); var showPortDD = _showPortDD[0]; var setShowPortDD = _showPortDD[1];

  // Radar -> Simulador bridge
  var _pendingRadarTicker = useState(null); var pendingRadarTicker = _pendingRadarTicker[0]; var setPendingRadarTicker = _pendingRadarTicker[1];

  // Radar state (mantido no nivel do OpcoesScreen para sobreviver troca de sub-tab)
  var _radarResults = useState([]); var radarResults = _radarResults[0]; var setRadarResults = _radarResults[1];
  var _radarScanning = useState(false); var radarScanning = _radarScanning[0]; var setRadarScanning = _radarScanning[1];
  var _radarScannedCount = useState(0); var radarScannedCount = _radarScannedCount[0]; var setRadarScannedCount = _radarScannedCount[1];
  var _radarTotalCount = useState(0); var radarTotalCount = _radarTotalCount[0]; var setRadarTotalCount = _radarTotalCount[1];
  var _radarLastScan = useState(null); var radarLastScan = _radarLastScan[0]; var setRadarLastScan = _radarLastScan[1];

  // Strategy AI states
  var _stratVis = useState(false); var stratModalVisible = _stratVis[0]; var setStratModalVisible = _stratVis[1];
  var _stratRes = useState(null); var stratResult = _stratRes[0]; var setStratResult = _stratRes[1];
  var _stratL = useState(false); var stratLoading = _stratL[0]; var setStratLoading = _stratL[1];
  var _stratE = useState(null); var stratError = _stratE[0]; var setStratError = _stratE[1];
  var _stratU = useState(null); var stratUsage = _stratU[0]; var setStratUsage = _stratU[1];
  var _stratSaving = useState(false); var stratSaving = _stratSaving[0]; var setStratSaving = _stratSaving[1];

  // AI Confirm states (strategy flow)
  var _aiConfirmVisible2 = useState(false); var aiConfirmVisible2 = _aiConfirmVisible2[0]; var setAiConfirmVisible2 = _aiConfirmVisible2[1];
  var _pendingAiType2 = useState(''); var pendingAiType2 = _pendingAiType2[0]; var setPendingAiType2 = _pendingAiType2[1];

  var handleAiEstrategia = function() {
    if (!subCtx.canAccess('AI_ANALYSIS')) { navigation.navigate('Paywall'); return; }
    setStratModalVisible(true);
    setStratLoading(true);
    setStratError(null);
    setStratResult(null);
    setStratUsage(null);

    var posPayload = [];
    for (var pi = 0; pi < positions.length; pi++) {
      var p = positions[pi];
      var plPct = null;
      if (p.preco_atual && p.preco_medio && p.preco_medio > 0) {
        plPct = ((p.preco_atual - p.preco_medio) / p.preco_medio) * 100;
      }
      posPayload.push({
        ticker: p.ticker,
        categoria: p.categoria,
        quantidade: p.quantidade,
        pm: p.preco_medio,
        preco_atual: p.preco_atual || null,
        pl_pct: plPct,
        mercado: p.mercado || 'BR',
      });
    }

    var ativasPayload = [];
    for (var ai = 0; ai < ativas.length; ai++) {
      var op = ativas[ai];
      ativasPayload.push({
        ativo_base: op.ativo_base,
        tipo: op.tipo,
        direcao: op.direcao,
        strike: op.strike,
        premio: op.premio,
        quantidade: op.quantidade,
        vencimento: op.vencimento,
        corretora: op.corretora,
      });
    }

    var indPayload = {};
    var indKeys = Object.keys(indicators);
    for (var ik = 0; ik < indKeys.length; ik++) {
      var tk = indKeys[ik];
      var ind = indicators[tk];
      if (ind) {
        indPayload[tk] = { hv: ind.hv || null, rsi: ind.rsi || null, beta: ind.beta || null };
      }
    }

    var indArr = [];
    var iaKeys = Object.keys(indPayload);
    for (var iaa = 0; iaa < iaKeys.length; iaa++) {
      var iaObj = indPayload[iaKeys[iaa]];
      iaObj.ticker = iaKeys[iaa];
      indArr.push(iaObj);
    }

    var payload = {
      type: 'estrategia',
      posicoes: posPayload,
      opcoesAtivas: ativasPayload,
      selic: selicRate,
      indicadores: indArr,
    };

    analyzeGeneral(payload).then(function(res) {
      if (res && res._usage) setStratUsage(res._usage);
      if (res && res.error) { setStratError(res.error); }
      else if (res) { setStratResult(res); }
      else { setStratError('Sem resposta da IA'); }
      setStratLoading(false);
    }).catch(function(e) {
      setStratError(e && e.message ? e.message : 'Erro ao analisar');
      setStratLoading(false);
    });
  };

  var handleSaveStrategy = function() {
    if (!stratResult || !user) return;
    setStratSaving(true);
    var payload = {
      type: 'estrategia',
      title: 'Sugestão de Estratégias',
      result: stratResult,
    };
    addSavedAnalysis(user.id, payload).then(function(res) {
      setStratSaving(false);
      if (res && res.error) {
        Toast.show({ type: 'error', text1: 'Erro ao salvar', text2: String(res.error) });
      } else {
        Toast.show({ type: 'success', text1: 'Análise salva!' });
      }
    }).catch(function() {
      setStratSaving(false);
      Toast.show({ type: 'error', text1: 'Erro ao salvar' });
    });
  };

  var load = async function() {
    if (!user) return;
    setLoadError(false);

    // Fetch portfolios (apenas pra popular o dropdown; o selecionado vem do store)
    try {
      var pfRes = await getPortfolios(user.id);
      setPortfolios(pfRes.data || []);
    } catch (e) {}

    // selPortfolio ja usa a convencao do DB: null = Todos, '__null__' = Padrao, UUID = custom
    var effectivePortfolioId = selPortfolio || null;

    var results;
    try {
      results = await Promise.all([
        getOpcoes(user.id, effectivePortfolioId),
        getPositions(user.id, effectivePortfolioId),
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
    // Only set from server on initial load (empty local state), don't overwrite user's pending changes
    if (Object.keys(garantiasConfig).length === 0 && prof && prof.garantias_config) {
      setGarantiasConfig(prof.garantias_config);
    }

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
      var vencDate = parseLocalDate(o.vencimento);
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
            // Log movimentacao no caixa — so se portfolio permite
            var autoExValor = (autoOp.strike || 0) * (autoOp.quantidade || 0);
            if (autoExValor > 0 && autoOp.corretora && canLogMov(autoOp)) {
              addMovimentacaoComSaldo(user.id, {
                conta: autoOp.corretora,
                moeda: 'BRL',
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

    // Prefetch OpLab chains for active options (fire-and-forget)
    var bases = [];
    var nonExp = allOpcoes.filter(function(o) { return o.status === 'ativa'; });
    for (var bi = 0; bi < nonExp.length; bi++) {
      var bOp = nonExp[bi];
      if (bOp.ativo_base && bases.indexOf(bOp.ativo_base) === -1) {
        bases.push(bOp.ativo_base);
      }
    }
    if (bases.length > 0) {
      var chainPromises = [];
      for (var bci = 0; bci < bases.length; bci++) {
        chainPromises.push(fetchOptionsChain(bases[bci], selicRate));
      }
      Promise.all(chainPromises).then(function() {
        setChainsReady(Date.now());
      }).catch(function() {});
    }

    // Fire-and-forget: load price alerts for options
    getAlertasOpcoes(user.id).then(function(alertResult) {
      setPriceAlerts(alertResult.data || []);
    }).catch(function() {});

    // Fire-and-forget: load AI usage summary for Premium users
    if (subCtx.canAccess('AI_ANALYSIS')) {
      aiUsageService.getAiUsageSummary(user.id).then(function(summary) {
        setAiUsage(summary);
      }).catch(function() {});
    }
  };

  useFocusEffect(useCallback(function() { load(); }, [user, selPortfolio]));

  // Check P&L alerts after chains load
  useEffect(function() {
    if (chainsReady === 0) return;
    var ativas = opcoes.filter(function(o) { return o.status === 'ativa'; });
    var newFired = {};
    var firedKeys = Object.keys(alertsFired);
    for (var fi = 0; fi < firedKeys.length; fi++) { newFired[firedKeys[fi]] = alertsFired[firedKeys[fi]]; }
    // Track grouped alerts to avoid duplicate toasts for same group
    var groupAlertShown = {};
    for (var ai = 0; ai < ativas.length; ai++) {
      var aOp = ativas[ai];
      if (aOp.alerta_pl == null || alertsFired[aOp.id]) continue;
      var co = getCachedOptionData(aOp.ativo_base, aOp.strike, aOp.tipo, aOp.vencimento);
      if (!co) continue;
      var bid = co.bid != null ? co.bid : null;
      var ask = co.ask != null ? co.ask : null;
      var last = co.last != null ? co.last : null;
      var close = co.close != null ? co.close : null;
      var isV = aOp.direcao === 'lancamento' || aOp.direcao === 'venda';
      var mkt = null;
      if (isV) {
        if (ask != null && ask > 0) mkt = ask;
        else if (bid != null && bid > 0) mkt = bid;
        else if (last != null && last > 0) mkt = last;
        else if (close != null && close > 0) mkt = close;
      } else {
        if (bid != null && bid > 0) mkt = bid;
        else if (ask != null && ask > 0) mkt = ask;
        else if (last != null && last > 0) mkt = last;
        else if (close != null && close > 0) mkt = close;
      }
      if (mkt == null) continue;
      var plU = isV ? ((aOp.premio || 0) - mkt) : (mkt - (aOp.premio || 0));
      var plPctAlert = (aOp.premio || 0) > 0 ? (plU / (aOp.premio || 0)) * 100 : 0;
      var triggered = (aOp.alerta_pl >= 0 && plPctAlert >= aOp.alerta_pl) || (aOp.alerta_pl < 0 && plPctAlert <= aOp.alerta_pl);
      if (triggered) {
        newFired[aOp.id] = true;
        // Avoid duplicate toasts for grouped ops (same base+strike+tipo+direcao+vencimento+corretora)
        var groupKey = (aOp.ativo_base || '') + '|' + (aOp.strike || 0) + '|' + (aOp.tipo || '') + '|' + (aOp.direcao || '') + '|' + (aOp.vencimento || '').substring(0, 10) + '|' + (aOp.corretora || '');
        if (!groupAlertShown[groupKey]) {
          groupAlertShown[groupKey] = true;
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          Toast.show({
            type: 'info',
            text1: 'Alerta P&L: ' + aOp.ativo_base + ' ' + (aOp.tipo || '').toUpperCase(),
            text2: 'P&L ' + (plPctAlert >= 0 ? '+' : '') + plPctAlert.toFixed(1) + '% atingiu alvo ' + (aOp.alerta_pl >= 0 ? '+' : '') + aOp.alerta_pl + '%',
            visibilityTime: 6000,
          });
        }
      }
    }
    setAlertsFired(newFired);
  }, [chainsReady]);

  // Check price alerts after chains load
  useEffect(function() {
    if (chainsReady === 0 || priceAlerts.length === 0) return;
    // Build chains cache map from OpLab cached data
    var chainsMap = {};
    for (var cai = 0; cai < priceAlerts.length; cai++) {
      var caBase = priceAlerts[cai].ativo_base;
      if (caBase && !chainsMap[caBase]) {
        var cachedCh = getCachedChain(caBase);
        if (cachedCh) chainsMap[caBase] = cachedCh;
      }
    }
    var triggered = notifService.checkPriceAlerts(user && user.id, priceAlerts, chainsMap);
    if (triggered && triggered.length > 0) {
      for (var ti = 0; ti < triggered.length; ti++) {
        var tAlert = triggered[ti];
        if (priceAlertsFired[tAlert.alerta_id]) continue;
        var newF = {};
        var fKeys = Object.keys(priceAlertsFired);
        for (var fk = 0; fk < fKeys.length; fk++) { newF[fKeys[fk]] = priceAlertsFired[fKeys[fk]]; }
        newF[tAlert.alerta_id] = true;
        setPriceAlertsFired(newF);
        // Send local notification
        notifService.sendLocalNotification(
          'Alerta de opção disparado',
          tAlert.descricao,
          { type: 'price_alert', alertId: tAlert.alerta_id }
        );
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Toast.show({ type: 'info', text1: 'Alerta disparado', text2: tAlert.descricao, visibilityTime: 5000 });
        // Mark as triggered in DB
        markAlertaDisparado(tAlert.alerta_id).catch(function() {});
      }
    }
  }, [chainsReady, priceAlerts]);

  var onRefresh = async function() {
    setRefreshing(true);
    clearPriceCache();
    clearOplabCache();
    await load();
    setRefreshing(false);
  };

  var handleToggleGarantia = function(corretora, ticker) {
    var newConfig = {};
    var keys = Object.keys(garantiasConfig);
    for (var k = 0; k < keys.length; k++) {
      if (keys[k] === '_visible') {
        newConfig._visible = garantiasConfig._visible.slice();
      } else {
        newConfig[keys[k]] = garantiasConfig[keys[k]].slice();
      }
    }
    if (!newConfig[corretora]) newConfig[corretora] = [];
    var idx = newConfig[corretora].indexOf(ticker);
    if (idx >= 0) {
      newConfig[corretora].splice(idx, 1);
    } else {
      newConfig[corretora].push(ticker);
    }
    setGarantiasConfig(newConfig);
    updateProfile(user.id, { garantias_config: newConfig }).catch(function(e) {
      console.warn('Save garantias config failed:', e);
    });
  };

  var handleToggleGarantiaCorretora = function(corretora, allCorretoras) {
    var newConfig = {};
    var keys = Object.keys(garantiasConfig);
    for (var k = 0; k < keys.length; k++) {
      if (keys[k] === '_visible') {
        newConfig._visible = garantiasConfig._visible.slice();
      } else {
        newConfig[keys[k]] = Array.isArray(garantiasConfig[keys[k]]) ? garantiasConfig[keys[k]].slice() : garantiasConfig[keys[k]];
      }
    }
    // First time: init with all corretoras, then toggle
    if (!Array.isArray(newConfig._visible)) {
      newConfig._visible = allCorretoras ? allCorretoras.slice() : [];
    }
    var idx = newConfig._visible.indexOf(corretora);
    if (idx >= 0) {
      newConfig._visible.splice(idx, 1);
    } else {
      newConfig._visible.push(corretora);
    }
    setGarantiasConfig(newConfig);
    updateProfile(user.id, { garantias_config: newConfig }).catch(function(e) {
      console.warn('Save garantias config failed:', e);
    });
  };

  var handleAlertaPLSave = async function(opcaoId, valor) {
    var result = await updateOpcaoAlertaPL(opcaoId, valor);
    if (result.error) {
      Alert.alert('Erro', 'Falha ao salvar alerta: ' + (result.error.message || ''));
      return;
    }
    // Update local state
    var updated = [];
    for (var ui = 0; ui < opcoes.length; ui++) {
      if (opcoes[ui].id === opcaoId) {
        var copy = {};
        var ks = Object.keys(opcoes[ui]);
        for (var ki = 0; ki < ks.length; ki++) { copy[ks[ki]] = opcoes[ui][ks[ki]]; }
        copy.alerta_pl = valor;
        updated.push(copy);
      } else {
        updated.push(opcoes[ui]);
      }
    }
    setOpcoes(updated);
    if (valor != null) {
      Toast.show({ type: 'success', text1: 'Alerta definido', text2: 'P&L alvo: ' + (valor >= 0 ? '+' : '') + valor + '%' });
    } else {
      Toast.show({ type: 'success', text1: 'Alerta removido' });
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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

  // Helper: checa se portfolio da opcao permite movimentacoes de caixa
  var canLogMov = function(opcao) {
    if (!opcao || !opcao.portfolio_id) return true; // Padrao: permite
    for (var pi = 0; pi < portfolios.length; pi++) {
      if (portfolios[pi].id === opcao.portfolio_id && portfolios[pi].operacoes_contas === false) {
        return false;
      }
    }
    return true;
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

    if (saldoMatch && canLogMov(original)) {
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
                moeda: saldoMatch.moeda || 'BRL',
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

  // Encerrar grupo combinado: fecha todas sub-ops com o mesmo prêmio de recompra
  var handleGroupClose = async function(subOps, premFechamento, dataFech, qtyClose) {
    // Distribuir qty a fechar entre sub-ops (mais antigas primeiro)
    var remaining = qtyClose;
    var closedIds = {};
    var partialId = null;
    var partialRemainQty = 0;
    var insertedRecords = [];
    var totalPL = 0;
    var firstCorretora = null;

    for (var gi = 0; gi < subOps.length && remaining > 0; gi++) {
      var subOp = subOps[gi];
      var subQty = Math.min(subOp.quantidade || 0, remaining);
      if (subQty <= 0) continue;
      if (!firstCorretora) firstCorretora = subOp.corretora;

      var isVenda = subOp.direcao === 'lancamento' || subOp.direcao === 'venda';
      var subPL = isVenda ? ((subOp.premio || 0) - premFechamento) * subQty : (premFechamento - (subOp.premio || 0)) * subQty;
      totalPL += subPL;

      var isPartial = subQty < (subOp.quantidade || 0);

      if (isPartial) {
        partialId = subOp.id;
        partialRemainQty = (subOp.quantidade || 0) - subQty;
        var resUp = await supabase.from('opcoes').update({ quantidade: partialRemainQty }).eq('id', subOp.id);
        if (resUp.error) {
          Alert.alert('Erro', 'Falha ao encerrar parcial: ' + (resUp.error.message || ''));
          return;
        }
        var insertData = {
          user_id: subOp.user_id, ativo_base: subOp.ativo_base,
          ticker_opcao: subOp.ticker_opcao, tipo: subOp.tipo, direcao: subOp.direcao,
          strike: subOp.strike, premio: subOp.premio, quantidade: subQty,
          vencimento: subOp.vencimento, corretora: subOp.corretora,
          data_abertura: subOp.data_abertura || null,
          status: 'fechada', premio_fechamento: premFechamento,
          data_fechamento: dataFech || null,
        };
        if (subOp.portfolio_id) insertData.portfolio_id = subOp.portfolio_id;
        var resIns = await supabase.from('opcoes').insert(insertData).select();
        if (resIns.error) {
          delete insertData.data_fechamento;
          resIns = await supabase.from('opcoes').insert(insertData).select();
        }
        if (resIns.data && resIns.data[0]) insertedRecords.push(resIns.data[0]);
      } else {
        closedIds[subOp.id] = true;
        var updateData = { status: 'fechada', premio_fechamento: premFechamento, data_fechamento: dataFech || null };
        var resClose = await supabase.from('opcoes').update(updateData).eq('id', subOp.id);
        if (resClose.error) {
          delete updateData.data_fechamento;
          await supabase.from('opcoes').update(updateData).eq('id', subOp.id);
        }
      }
      remaining -= subQty;
    }

    // Atualizar state local de uma vez
    var updated = [];
    for (var ui = 0; ui < opcoes.length; ui++) {
      var opc = opcoes[ui];
      if (closedIds[opc.id]) {
        var copy = {};
        var ks = Object.keys(opc);
        for (var ki = 0; ki < ks.length; ki++) { copy[ks[ki]] = opc[ks[ki]]; }
        copy.status = 'fechada';
        copy.premio_fechamento = premFechamento;
        copy.data_fechamento = dataFech || null;
        updated.push(copy);
      } else if (opc.id === partialId) {
        var copy2 = {};
        var ks2 = Object.keys(opc);
        for (var ki2 = 0; ki2 < ks2.length; ki2++) { copy2[ks2[ki2]] = opc[ks2[ki2]]; }
        copy2.quantidade = partialRemainQty;
        updated.push(copy2);
      } else {
        updated.push(opc);
      }
    }
    for (var ri = 0; ri < insertedRecords.length; ri++) {
      updated.push(insertedRecords[ri]);
    }
    setOpcoes(updated);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    var plText = totalPL >= 0 ? '+R$ ' + fmt(totalPL) : '-R$ ' + fmt(Math.abs(totalPL));
    var totalQty = qtyClose;

    // Oferecer descontar recompra do saldo
    var recompraTotal = premFechamento * totalQty;
    var saldoMatch = null;
    if (firstCorretora && recompraTotal > 0) {
      for (var si2 = 0; si2 < saldos.length; si2++) {
        if ((saldos[si2].corretora || saldos[si2].name) === firstCorretora) {
          saldoMatch = saldos[si2]; break;
        }
      }
    }
    var firstOp = subOps[0];
    if (saldoMatch && canLogMov(firstOp)) {
      var saldoAtual = saldoMatch.saldo || 0;
      Alert.alert(
        'Grupo encerrado (' + subOps.length + ' ops)',
        'P&L combinado: ' + plText + '\n\nDescontar R$ ' + fmt(recompraTotal) + ' do saldo em ' + firstCorretora + '?\n\nSaldo atual: R$ ' + fmt(saldoAtual),
        [
          { text: 'Não', style: 'cancel' },
          {
            text: 'Descontar',
            onPress: async function() {
              var saldoName = saldoMatch.corretora || saldoMatch.name;
              var resM = await addMovimentacaoComSaldo(user.id, {
                conta: saldoName,
                moeda: saldoMatch.moeda || 'BRL',
                tipo: 'saida',
                categoria: 'recompra_opcao',
                valor: recompraTotal,
                descricao: 'Recompra grupo ' + (firstOp.tipo || '').toUpperCase() + ' ' + (firstOp.ativo_base || ''),
                ticker: firstOp.ativo_base || null,
                referencia_tipo: 'opcao',
                data: new Date().toISOString().substring(0, 10),
              });
              if (resM.error) {
                Alert.alert('Erro', 'Falha ao atualizar saldo: ' + (resM.error.message || ''));
              } else {
                var novoSaldo = saldoAtual - recompraTotal;
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
                Alert.alert('Saldo atualizado', firstCorretora + ': R$ ' + fmt(saldoAtual) + ' → R$ ' + fmt(novoSaldo));
              }
            },
          },
        ]
      );
    } else {
      Alert.alert('Grupo encerrado (' + subOps.length + ' ops)', 'P&L combinado: ' + plText);
    }
  };

  var handleRoll = async function(op, premRecompra, dataFech, qtyClose, newStrike, newVenc) {
    // Step 1: close the current option (reuses handleClose logic inline)
    var isVenda = op.direcao === 'lancamento' || op.direcao === 'venda';
    var closePL = isVenda ? ((op.premio || 0) - premRecompra) * qtyClose : (premRecompra - (op.premio || 0)) * qtyClose;
    await handleClose(op.id, premRecompra, closePL, dataFech, qtyClose);

    // Step 2: navigate to AddOpcao pre-filled for the new leg
    // Convert newVenc ISO to BR format for the form
    var vencBr = '';
    if (newVenc) {
      var parts = newVenc.split('-');
      if (parts.length === 3) vencBr = parts[2] + '/' + parts[1] + '/' + parts[0];
    }
    navigation.navigate('AddOpcao', {
      ativo_base: op.ativo_base || '',
      tipo: op.tipo || 'call',
      direcao: op.direcao || 'venda',
      corretora: op.corretora || '',
      quantidade: String(qtyClose || ''),
      strike: String(newStrike || ''),
      vencimento: vencBr,
      fromRolagem: true,
      tickerAnterior: op.ticker_opcao || '',
      strikeAnterior: String(op.strike || ''),
      vencAnterior: op.vencimento || '',
      portfolio_id: op.portfolio_id || null,
    });
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
    // Log movimentacao informativa (prêmio mantido) — so se portfolio permite
    if (expOp && canLogMov(expOp)) {
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
    var qtyFmt = formatQty(expOp.quantidade || 0);
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
            // Log movimentacao do exercício — so se portfolio permite
            var exValor = (expOp.strike || 0) * (expOp.quantidade || 0);
            if (exValor > 0 && expOp.corretora && canLogMov(expOp)) {
              addMovimentacaoComSaldo(user.id, {
                conta: expOp.corretora,
                moeda: 'BRL',
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

  // Agrupar ativas por chave (ativo_base + strike + tipo + direcao + vencimento + corretora)
  var ativasGrouped = (function() {
    var groups = {};
    var order = [];
    for (var gi = 0; gi < ativas.length; gi++) {
      var op = ativas[gi];
      var key = (op.ativo_base || '').toUpperCase() + '|' + (op.strike || 0) + '|' + (op.tipo || '') + '|' + (op.direcao || '') + '|' + (op.vencimento || '').substring(0, 10) + '|' + (op.corretora || '');
      if (!groups[key]) {
        groups[key] = [];
        order.push(key);
      }
      groups[key].push(op);
    }
    var result = [];
    for (var oi = 0; oi < order.length; oi++) {
      var ops = groups[order[oi]];
      if (ops.length === 1) {
        result.push({ type: 'single', op: ops[0] });
      } else {
        // Calcular PM e totais
        var totalQty = 0;
        var totalPremio = 0;
        for (var pi = 0; pi < ops.length; pi++) {
          var q = ops[pi].quantidade || 0;
          totalQty = totalQty + q;
          totalPremio = totalPremio + ((ops[pi].premio || 0) * q);
        }
        var premioMedio = totalQty > 0 ? totalPremio / totalQty : 0;
        // Criar opcao virtual combinada (usa dados da primeira como base)
        var combined = {};
        var baseOp = ops[0];
        var baseKeys = Object.keys(baseOp);
        for (var bk = 0; bk < baseKeys.length; bk++) { combined[baseKeys[bk]] = baseOp[baseKeys[bk]]; }
        combined.quantidade = totalQty;
        combined.premio = Math.round(premioMedio * 100) / 100;
        combined._isGrouped = true;
        combined._groupOps = ops;
        combined._groupCount = ops.length;
        // Usar alerta_pl da primeira sub-op que tenha (todas devem ser iguais no grupo)
        var groupAlerta = null;
        for (var ga = 0; ga < ops.length; ga++) {
          if (ops[ga].alerta_pl != null) { groupAlerta = ops[ga].alerta_pl; break; }
        }
        combined.alerta_pl = groupAlerta;
        result.push({ type: 'group', combined: combined, ops: ops });
      }
    }
    return result;
  })();

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
    return parseLocalDate(a.vencimento) - parseLocalDate(b.vencimento);
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
    var sDays = Math.ceil((parseLocalDate(sop.vencimento).getTime() - nowMs) / (1000 * 60 * 60 * 24));
    if (sDays >= 0 && sDays <= 7) totalVenc7d++;
  }

  // P&L total das ativas com preco de mercado disponivel
  // Venda usa ask (custo de recompra), Compra usa bid (preço de venda)
  var plTotalAtivas = 0;
  var plTotalCount = 0;
  for (var pli = 0; pli < ativas.length; pli++) {
    var plOp = ativas[pli];
    var plCached = getCachedOptionData(plOp.ativo_base, plOp.strike, plOp.tipo, plOp.vencimento);
    if (!plCached) continue;
    var plBid = plCached.bid != null ? plCached.bid : null;
    var plAsk = plCached.ask != null ? plCached.ask : null;
    var plLast = plCached.last != null ? plCached.last : null;
    var plClose = plCached.close != null ? plCached.close : null;
    var plIsVenda = plOp.direcao === 'lancamento' || plOp.direcao === 'venda';
    var plMarket = null;
    if (plIsVenda) {
      if (plAsk != null && plAsk > 0) plMarket = plAsk;
      else if (plBid != null && plBid > 0) plMarket = plBid;
      else if (plLast != null && plLast > 0) plMarket = plLast;
      else if (plClose != null && plClose > 0) plMarket = plClose;
    } else {
      if (plBid != null && plBid > 0) plMarket = plBid;
      else if (plAsk != null && plAsk > 0) plMarket = plAsk;
      else if (plLast != null && plLast > 0) plMarket = plLast;
      else if (plClose != null && plClose > 0) plMarket = plClose;
    }
    if (plMarket == null) continue;
    var plUnit = plIsVenda ? ((plOp.premio || 0) - plMarket) : (plMarket - (plOp.premio || 0));
    plTotalAtivas += plUnit * (plOp.quantidade || 0);
    plTotalCount++;
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
      {/* SUB TABS — topo da página
          Fase F: ordem reorganizada com Calc (Simulador) como protagonista.
          Vencidas (pendentes) e Garantias mantidas no fim como acesso
          secundário. A extracao completa das views sera feita em
          sessao dedicada. */}
      <View style={styles.subTabs}>
        {[
          { k: 'sim', l: 'Calc', c: C.opcoes },
          { k: 'ativas', l: 'Posições (' + ativas.length + ')', c: C.opcoes },
          { k: 'radar', l: 'Radar', c: C.opcoes },
          { k: 'hist', l: 'Histórico (' + historico.length + ')', c: C.opcoes },
          { k: 'pendentes', l: 'Vencidas (' + expired.length + ')', c: C.yellow },
          { k: 'garantias', l: 'Garantias', c: C.acoes },
        ].map(function(t) {
          return (
            <Pill key={t.k} active={sub === t.k} color={t.c} onPress={function() { setSub(t.k); }}>{t.l}</Pill>
          );
        })}
      </View>

      {/* Portfolio selector */}
      {portfolios.length > 0 ? (
        <View style={{ paddingHorizontal: SIZE.padding, paddingBottom: 6, zIndex: 10 }}>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.card + '80', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: C.border, alignSelf: 'flex-start' }}
            onPress={function() { setShowPortDD(!showPortDD); }}
            activeOpacity={0.7}
          >
            {(function() {
              var pLabel = 'Todos';
              var pColor = C.accent;
              var pIcon = 'people-outline';
              if (selPortfolio === '__null__') {
                pLabel = 'Padrão';
                pIcon = 'briefcase-outline';
              } else if (selPortfolio) {
                for (var pi = 0; pi < portfolios.length; pi++) {
                  if (portfolios[pi].id === selPortfolio) {
                    pLabel = portfolios[pi].nome;
                    pColor = portfolios[pi].cor || C.accent;
                    pIcon = portfolios[pi].icone || null;
                    break;
                  }
                }
              }
              return (
                <>
                  {pIcon ? (
                    <Ionicons name={pIcon} size={14} color={pColor} />
                  ) : (
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: pColor }} />
                  )}
                  <Text style={{ fontSize: 12, fontFamily: F.body, color: C.text, maxWidth: 160 }} numberOfLines={1}>{pLabel}</Text>
                  <Ionicons name={showPortDD ? 'chevron-up' : 'chevron-down'} size={14} color={C.dim} />
                </>
              );
            })()}
          </TouchableOpacity>
          {showPortDD ? (
            <View style={{ backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: C.border, marginTop: 4, overflow: 'hidden' }}>
              <TouchableOpacity
                style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border }, !selPortfolio && { backgroundColor: C.accent + '11' }]}
                onPress={function() { setSelPortfolio(null); setShowPortDD(false); }}
              >
                <Ionicons name="people-outline" size={14} color={!selPortfolio ? C.accent : C.dim} />
                <Text style={{ fontSize: 13, fontFamily: F.body, color: !selPortfolio ? C.accent : C.text }}>Todos</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border }, selPortfolio === '__null__' && { backgroundColor: C.accent + '11' }]}
                onPress={function() { setSelPortfolio('__null__'); setShowPortDD(false); }}
              >
                <Ionicons name="briefcase-outline" size={14} color={selPortfolio === '__null__' ? C.accent : C.dim} />
                <Text style={{ fontSize: 13, fontFamily: F.body, color: selPortfolio === '__null__' ? C.accent : C.text }}>Padrão</Text>
              </TouchableOpacity>
              {portfolios.map(function(p) {
                var isActive = selPortfolio === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border }, isActive && { backgroundColor: C.accent + '11' }]}
                    onPress={function() { setSelPortfolio(p.id); setShowPortDD(false); }}
                  >
                    {p.icone ? (
                      <Ionicons name={p.icone} size={14} color={isActive ? (p.cor || C.accent) : C.dim} />
                    ) : (
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: p.cor || C.accent }} />
                    )}
                    <Text style={{ fontSize: 13, fontFamily: F.body, color: isActive ? (p.cor || C.accent) : C.text }}>{p.nome}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* GARANTIAS TAB */}
      {sub === 'garantias' && (
        <View style={{ gap: SIZE.gap }}>
          {(function() {
            var HM = { acao: 0.80, fii: 0.70, etf: 0.85, stock_int: 0.75, rf: 0.95 };
            var gm = {};
            // Somente corretoras (excluir bancos e outros)
            var corretoraNames = {};
            for (var gi2 = 0; gi2 < saldos.length; gi2++) {
              if (saldos[gi2].tipo && saldos[gi2].tipo !== 'corretora') continue;
              var sn2 = saldos[gi2].corretora || saldos[gi2].name;
              if (!sn2) continue;
              corretoraNames[sn2.toUpperCase().trim()] = true;
              if (!gm[sn2]) gm[sn2] = { caixa: 0, ativos: [], emUsoPut: 0, putsCount: 0, callMap: {} };
              gm[sn2].caixa += (saldos[gi2].saldo || 0);
            }
            // Excluir corretoras de portfolios com operacoes_contas: false
            // por_corretora nas positions consolidadas inclui TODAS corretoras de todos portfolios
            // Precisamos subtrair as quantidades de portfolios desabilitados
            var noOpPortfolioIds = {};
            for (var npi = 0; npi < portfolios.length; npi++) {
              if (portfolios[npi].operacoes_contas === false) noOpPortfolioIds[portfolios[npi].id] = true;
            }
            // Construir set de corretoras que pertencem APENAS a portfolios desabilitados
            // Checando via saldos: se a corretora tem conta cadastrada tipo=corretora, ela eh valida
            // Se nao tem conta mas aparece em por_corretora, eh de portfolio desabilitado
            for (var gp2 = 0; gp2 < positions.length; gp2++) {
              var p2 = positions[gp2];
              if (!p2.por_corretora) continue;
              var cks = Object.keys(p2.por_corretora);
              for (var ci3 = 0; ci3 < cks.length; ci3++) {
                var cn = cks[ci3]; var qq = p2.por_corretora[cn] || 0;
                if (qq <= 0) continue;
                // Incluir se eh corretora conhecida ou se nao temos info de tipo (assume corretora)
                if (!gm[cn] && !corretoraNames[cn.toUpperCase().trim()] && Object.keys(corretoraNames).length > 0) continue;
                if (!gm[cn]) gm[cn] = { caixa: 0, ativos: [], emUsoPut: 0, putsCount: 0, callMap: {} };
                var pr = p2.preco_atual || p2.pm || 0;
                var hc = HM[p2.categoria] || 0.70;
                if (qq * pr > 0) gm[cn].ativos.push({ ticker: p2.ticker, qty: qq, preco: pr, haircut: hc, valor: qq * pr * hc, cat: p2.categoria });
                if (!gm[cn].callMap[p2.ticker]) gm[cn].callMap[p2.ticker] = { totalAcoes: 0, callsVendidas: 0 };
                gm[cn].callMap[p2.ticker].totalAcoes += qq;
              }
            }
            for (var au = 0; au < ativas.length; au++) {
              var op = ativas[au];
              var isV = op.direcao === 'lancamento' || op.direcao === 'venda';
              if (!isV || !op.corretora) continue;
              if (!gm[op.corretora]) gm[op.corretora] = { caixa: 0, ativos: [], emUsoPut: 0, putsCount: 0, callMap: {} };
              if ((op.tipo || '').toLowerCase() === 'put') { gm[op.corretora].emUsoPut += (op.strike || 0) * (op.quantidade || 0); gm[op.corretora].putsCount++; }
              else if ((op.tipo || '').toLowerCase() === 'call') { var ab = (op.ativo_base || '').toUpperCase().trim(); if (ab) { if (!gm[op.corretora].callMap[ab]) gm[op.corretora].callMap[ab] = { totalAcoes: 0, callsVendidas: 0 }; gm[op.corretora].callMap[ab].callsVendidas += (op.quantidade || 0); } }
            }
            var ks = Object.keys(gm);
            if (ks.length === 0) return (<EmptyState ionicon="shield-checkmark-outline" title="Sem garantias" description="Cadastre contas e posicoes na aba Carteira." color={C.acoes} />);
            ks.sort(function(a, b) { var ta = gm[a].caixa; for (var i = 0; i < gm[a].ativos.length; i++) ta += gm[a].ativos[i].valor; var tb = gm[b].caixa; for (var j = 0; j < gm[b].ativos.length; j++) tb += gm[b].ativos[j].valor; return tb - ta; });
            // Totais globais
            var totGarantiaPut = 0; var totEmUsoPut = 0; var totCallAcoes = 0; var totCallVendidas = 0;
            for (var tk = 0; tk < ks.length; tk++) {
              totGarantiaPut += gm[ks[tk]].caixa; for (var ta2 = 0; ta2 < gm[ks[tk]].ativos.length; ta2++) totGarantiaPut += gm[ks[tk]].ativos[ta2].valor;
              totEmUsoPut += gm[ks[tk]].emUsoPut;
              var cmk = Object.keys(gm[ks[tk]].callMap);
              for (var cm2 = 0; cm2 < cmk.length; cm2++) { totCallAcoes += gm[ks[tk]].callMap[cmk[cm2]].totalAcoes; totCallVendidas += gm[ks[tk]].callMap[cmk[cm2]].callsVendidas; }
            }
            var totLivrePut = totGarantiaPut - totEmUsoPut;
            var totCallLivres = totCallAcoes - totCallVendidas;
            return (
              <View style={{ gap: SIZE.gap }}>
                {/* Resumo no topo */}
                <Glass glow={C.accent} padding={14}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <Ionicons name="shield-checkmark-outline" size={14} color={C.accent} />
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono, letterSpacing: 1.2, fontWeight: '600' }}>RESUMO DE GARANTIAS</Text>
                    <InfoTip text={"PUT (Cash-Secured Put): Caixa + ativos com haircut servem de garantia. Toque no escudo para marcar garantia principal (prioridade no calculo).\n\nCALL (Covered Call): Acoes em carteira cobrem calls vendidas. Cada 100 acoes = 1 lote = 1 contrato.\n\nHaircut: Desconto aplicado pela B3 no valor do ativo como garantia (ex: acoes 80%, FIIs 70%).\n\nSomente corretoras sao exibidas."} size={13} />
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 }}>PUT TOTAL</Text>
                      <Sensitive><Text style={{ fontSize: 16, fontWeight: '800', color: C.green, fontFamily: F.mono }}>{'R$ ' + fmt(totGarantiaPut)}</Text></Sensitive>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 }}>EM USO</Text>
                      <Sensitive><Text style={{ fontSize: 16, fontWeight: '800', color: totEmUsoPut > 0 ? C.yellow : C.dim, fontFamily: F.mono }}>{'R$ ' + fmt(totEmUsoPut)}</Text></Sensitive>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 }}>LIVRE</Text>
                      <Sensitive><Text style={{ fontSize: 16, fontWeight: '800', color: totLivrePut >= 0 ? C.green : C.red, fontFamily: F.mono }}>{'R$ ' + fmt(totLivrePut)}</Text></Sensitive>
                    </View>
                  </View>
                  <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 10 }} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 }}>CALL ACOES</Text>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: C.acoes, fontFamily: F.mono }}>{totCallAcoes}</Text>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 }}>VENDIDAS</Text>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: totCallVendidas > 0 ? C.yellow : C.dim, fontFamily: F.mono }}>{totCallVendidas}</Text>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 }}>LIVRES</Text>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: totCallLivres > 0 ? C.green : C.dim, fontFamily: F.mono }}>{totCallLivres}</Text>
                    </View>
                  </View>
                </Glass>

                {/* Por corretora */}
                {ks.map(function(cor) {
                  var d = gm[cor];
                  var cfg = garantiasConfig[cor] || [];
                  var isOp = !!garantiasOpen[cor];
                  var princ = []; var sec = [];
                  for (var ai = 0; ai < d.ativos.length; ai++) { if (cfg.indexOf(d.ativos[ai].ticker) >= 0) princ.push(d.ativos[ai]); else sec.push(d.ativos[ai]); }
                  var totP = d.caixa; for (var tp = 0; tp < princ.length; tp++) totP += princ[tp].valor;
                  var totS = 0; for (var ts = 0; ts < sec.length; ts++) totS += sec[ts].valor;
                  var tot = totP + totS;
                  var livre = tot - d.emUsoPut;
                  var callKs2 = Object.keys(d.callMap);
                  var calls = [];
                  for (var ck = 0; ck < callKs2.length; ck++) { var cd = d.callMap[callKs2[ck]]; if (cd.totalAcoes > 0) calls.push({ ticker: callKs2[ck], total: cd.totalAcoes, vendidas: cd.callsVendidas, livres: cd.totalAcoes - cd.callsVendidas }); }

                  return (
                    <Glass key={cor} padding={12}>
                      <TouchableOpacity onPress={function() { var n = {}; var ok = Object.keys(garantiasOpen); for (var oi = 0; oi < ok.length; oi++) n[ok[oi]] = garantiasOpen[ok[oi]]; n[cor] = !isOp; setGarantiasOpen(n); }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="business-outline" size={14} color={C.accent} />
                            <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, fontFamily: F.display }}>{cor}</Text>
                            {d.putsCount > 0 ? <View style={{ backgroundColor: C.yellow + '20', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}><Text style={{ fontSize: 9, color: C.yellow, fontFamily: F.mono, fontWeight: '600' }}>{d.putsCount + ' PUT'}</Text></View> : null}
                            {calls.length > 0 ? <View style={{ backgroundColor: C.acoes + '20', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}><Text style={{ fontSize: 9, color: C.acoes, fontFamily: F.mono, fontWeight: '600' }}>{calls.length + ' CALL'}</Text></View> : null}
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Sensitive><Text style={{ fontSize: 14, fontWeight: '700', color: C.green, fontFamily: F.mono }}>{'R$ ' + fmt(tot)}</Text></Sensitive>
                            <Ionicons name={isOp ? 'chevron-up' : 'chevron-down'} size={16} color={C.dim} />
                          </View>
                        </View>
                        {d.emUsoPut > 0 ? (
                          <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, marginTop: 8 }}>
                            <View style={{ height: 4, borderRadius: 2, backgroundColor: C.yellow, width: Math.min(d.emUsoPut / Math.max(tot, 1), 1) * 100 + '%' }} />
                          </View>
                        ) : null}
                      </TouchableOpacity>

                      {isOp ? (
                        <View style={{ marginTop: 10, gap: 8 }}>
                          {/* PUT Section */}
                          <View style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: 10 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                              <Text style={{ fontSize: 10, color: C.red, fontFamily: F.mono, letterSpacing: 1, fontWeight: '700' }}>GARANTIA PUT (CSP)</Text>
                              <InfoTip text={"Caixa + ativos com desconto (haircut) garantem PUTs vendidas.\n\nToque no escudo para marcar/desmarcar garantia principal. Principal eh consumida primeiro."} size={11} />
                            </View>
                            {d.caixa > 0 ? (
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <Ionicons name="wallet-outline" size={12} color={C.green} />
                                  <Text style={{ fontSize: 12, color: C.text, fontFamily: F.body }}>Caixa</Text>
                                </View>
                                <Sensitive><Text style={{ fontSize: 12, color: C.green, fontFamily: F.mono, fontWeight: '600' }}>{'R$ ' + fmt(d.caixa)}</Text></Sensitive>
                              </View>
                            ) : null}
                            {princ.length > 0 ? (
                              <View style={{ marginTop: 4 }}>
                                <Text style={{ fontSize: 9, color: C.accent, fontFamily: F.mono, letterSpacing: 0.8, marginBottom: 4 }}>PRINCIPAL</Text>
                                {princ.map(function(a) { var l = Math.floor(a.qty / 100); return (
                                  <View key={a.ticker} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                      <TouchableOpacity onPress={function() { handleToggleGarantia(cor, a.ticker); }}><Ionicons name="shield-checkmark" size={16} color={C.accent} /></TouchableOpacity>
                                      <Text style={{ fontSize: 12, color: C.text, fontFamily: F.mono, fontWeight: '600' }}>{a.ticker}</Text>
                                      <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>{a.qty + ' (' + l + 'L) ' + Math.round(a.haircut * 100) + '%'}</Text>
                                    </View>
                                    <Sensitive><Text style={{ fontSize: 12, color: C.text, fontFamily: F.mono }}>{'R$ ' + fmt(a.valor)}</Text></Sensitive>
                                  </View>
                                ); })}
                              </View>
                            ) : null}
                            {sec.length > 0 ? (
                              <View style={{ marginTop: 4 }}>
                                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginBottom: 4 }}>SECUNDARIA</Text>
                                {sec.map(function(a) { var l = Math.floor(a.qty / 100); return (
                                  <View key={a.ticker} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                      <TouchableOpacity onPress={function() { handleToggleGarantia(cor, a.ticker); }}><Ionicons name="shield-outline" size={16} color={C.dim} /></TouchableOpacity>
                                      <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.mono }}>{a.ticker}</Text>
                                      <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>{a.qty + ' (' + l + 'L) ' + Math.round(a.haircut * 100) + '%'}</Text>
                                    </View>
                                    <Sensitive><Text style={{ fontSize: 12, color: C.dim, fontFamily: F.mono }}>{'R$ ' + fmt(a.valor)}</Text></Sensitive>
                                  </View>
                                ); })}
                              </View>
                            ) : null}
                            {d.emUsoPut > 0 ? (
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
                                <Text style={{ fontSize: 12, color: C.yellow, fontFamily: F.mono }}>Em uso PUTs</Text>
                                <Sensitive><Text style={{ fontSize: 12, color: C.yellow, fontFamily: F.mono, fontWeight: '600' }}>{'- R$ ' + fmt(d.emUsoPut)}</Text></Sensitive>
                              </View>
                            ) : null}
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
                              <Text style={{ fontSize: 12, color: livre >= 0 ? C.green : C.red, fontFamily: F.mono, fontWeight: '700' }}>Livre para PUT</Text>
                              <Sensitive><Text style={{ fontSize: 12, color: livre >= 0 ? C.green : C.red, fontFamily: F.mono, fontWeight: '700' }}>{'R$ ' + fmt(livre)}</Text></Sensitive>
                            </View>
                          </View>

                          {/* CALL Section */}
                          {calls.length > 0 ? (
                            <View style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: 10 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                <Text style={{ fontSize: 10, color: C.acoes, fontFamily: F.mono, letterSpacing: 1, fontWeight: '700' }}>COBERTURA CALL</Text>
                                <InfoTip text={"Acoes em carteira que cobrem calls vendidas.\n\nCada 100 acoes = 1 lote = 1 contrato de opcao.\n\nLivres = acoes sem call vendida (disponiveis para novas operacoes)."} size={11} />
                              </View>
                              <View style={{ flexDirection: 'row', paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                                <Text style={{ flex: 2, fontSize: 9, color: C.dim, fontFamily: F.mono }}>ATIVO</Text>
                                <Text style={{ flex: 1, fontSize: 9, color: C.dim, fontFamily: F.mono, textAlign: 'right' }}>ACOES</Text>
                                <Text style={{ flex: 1, fontSize: 9, color: C.dim, fontFamily: F.mono, textAlign: 'right' }}>LOTES</Text>
                                <Text style={{ flex: 1, fontSize: 9, color: C.dim, fontFamily: F.mono, textAlign: 'right' }}>VENDIDAS</Text>
                                <Text style={{ flex: 1, fontSize: 9, color: C.dim, fontFamily: F.mono, textAlign: 'right' }}>LIVRES</Text>
                              </View>
                              {calls.map(function(cr) {
                                var lotes = Math.floor(cr.total / 100);
                                return (
                                  <View key={cr.ticker} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)' }}>
                                    <Text style={{ flex: 2, fontSize: 12, color: C.text, fontFamily: F.mono, fontWeight: '600' }}>{cr.ticker}</Text>
                                    <Text style={{ flex: 1, fontSize: 11, color: C.sub, fontFamily: F.mono, textAlign: 'right' }}>{cr.total}</Text>
                                    <Text style={{ flex: 1, fontSize: 11, color: C.sub, fontFamily: F.mono, textAlign: 'right' }}>{lotes}</Text>
                                    <Text style={{ flex: 1, fontSize: 11, color: cr.vendidas > 0 ? C.yellow : C.dim, fontFamily: F.mono, textAlign: 'right' }}>{cr.vendidas}</Text>
                                    <Text style={{ flex: 1, fontSize: 11, color: cr.livres > 0 ? C.green : C.dim, fontFamily: F.mono, textAlign: 'right', fontWeight: '700' }}>{cr.livres}</Text>
                                  </View>
                                );
                              })}
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                    </Glass>
                  );
                })}
              </View>
            );
          })()}
        </View>
      )}

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
                        Venc: {formatDateBR(expOp.vencimento)}
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
            <View style={{ gap: SIZE.gap }}>
              <EmptyState
                ionicon="trending-up-outline" title="Nenhuma opção ativa"
                description="Lance opções para começar a receber prêmios."
                cta={subCtx.isAtLimit('options', ativas.length) && !subCtx.canAccess('OPTIONS_UNLIMITED') ? undefined : 'Nova opção'}
                onCta={subCtx.isAtLimit('options', ativas.length) && !subCtx.canAccess('OPTIONS_UNLIMITED') ? undefined : function() { navigation.navigate('AddOpcao', { portfolio_id: selPortfolio && selPortfolio !== '__null__' ? selPortfolio : null }); }}
                color={C.opcoes}
              />
              {subCtx.isAtLimit('options', ativas.length) && !subCtx.canAccess('OPTIONS_UNLIMITED') ? (
                <UpgradePrompt feature="OPTIONS_UNLIMITED" compact={true} />
              ) : null}

              {/* Atalhos rapidos */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={function() { setSub('sim'); }} style={{ flex: 1, backgroundColor: C.opcoes + '15', borderRadius: 10, paddingVertical: 12, alignItems: 'center', gap: 4 }}>
                  <Ionicons name="calculator-outline" size={20} color={C.opcoes} />
                  <Text style={{ fontSize: 11, color: C.opcoes, fontFamily: F.display, fontWeight: '600' }}>Simulador</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={function() { setSub('radar'); }} style={{ flex: 1, backgroundColor: C.opcoes + '15', borderRadius: 10, paddingVertical: 12, alignItems: 'center', gap: 4 }}>
                  <Ionicons name="scan-outline" size={20} color={C.opcoes} />
                  <Text style={{ fontSize: 11, color: C.opcoes, fontFamily: F.display, fontWeight: '600' }}>Radar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={function() { setSub('hist'); }} style={{ flex: 1, backgroundColor: C.opcoes + '15', borderRadius: 10, paddingVertical: 12, alignItems: 'center', gap: 4 }}>
                  <Ionicons name="time-outline" size={20} color={C.opcoes} />
                  <Text style={{ fontSize: 11, color: C.opcoes, fontFamily: F.display, fontWeight: '600' }}>Historico</Text>
                </TouchableOpacity>
              </View>
            </View>
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
                {plTotalCount > 0 ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
                    {[
                      { l: 'Prêmio Mês', v: 'R$ ' + fmt(premioMes), c: C.green },
                      { l: 'Theta/Dia', v: (thetaDiaTotal >= 0 ? '+' : '') + 'R$ ' + fmt(thetaDiaTotal), c: thetaDiaTotal >= 0 ? C.green : C.red },
                      { l: 'P&L Total', v: (plTotalAtivas >= 0 ? '+' : '-') + 'R$ ' + fmt(Math.abs(plTotalAtivas)), c: plTotalAtivas >= 0 ? C.green : C.red },
                    ].map(function(m, i) {
                      return (
                        <View key={'pl' + i} style={{ alignItems: 'center', flex: 1 }}>
                          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 }}>{m.l}</Text>
                          <Sensitive><Text style={{ fontSize: 14, fontWeight: '700', color: m.c, fontFamily: F.mono, marginTop: 2 }}>{m.v}</Text></Sensitive>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              </Glass>

              {/* Strategy AI button */}
              {subCtx.canAccess('AI_ANALYSIS') && positions.length > 0 ? (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={function() { setPendingAiType2('Sugestão de estratégias'); setAiConfirmVisible2(true); }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: C.accent + '40', backgroundColor: C.accent + '08' }}
                >
                  <Ionicons name="sparkles" size={16} color={C.accent} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.accent, fontFamily: F.display }}>Sugestão de Estratégias IA</Text>
                </TouchableOpacity>
              ) : null}

              {/* BANNER: gregas usando PM */}
              {!pricesAvailable && positions.length > 0 ? (
                <View style={{ padding: 8, borderRadius: 8, backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.15)' }}>
                  <Text style={{ fontSize: 12, color: '#f59e0b', fontFamily: F.mono, textAlign: 'center' }}>
                    Gregas usando PM (cotações indisponíveis)
                  </Text>
                </View>
              ) : null}

              {/* GARANTIAS POR CORRETORA/BANCO */}
              {(function() {
                var HAIRCUT_MAP_G = { acao: 0.80, fii: 0.70, etf: 0.85, stock_int: 0.75, rf: 0.95 };
                // Coletar todas corretoras com saldo ou ativos
                var garantiasMap = {};
                for (var gi = 0; gi < saldos.length; gi++) {
                  var sc = saldos[gi];
                  var scName = ((sc.corretora || sc.name) || '').toUpperCase().trim();
                  if (!scName) continue;
                  if (!garantiasMap[scName]) garantiasMap[scName] = { caixa: 0, ativos: [], emUsoPut: 0, putsCount: 0, callMap: {} };
                  garantiasMap[scName].caixa += (sc.saldo || 0);
                }
                for (var gpi = 0; gpi < positions.length; gpi++) {
                  var gp = positions[gpi];
                  if (!gp.por_corretora) continue;
                  var gpCors = Object.keys(gp.por_corretora);
                  for (var gpci = 0; gpci < gpCors.length; gpci++) {
                    var gpCorName = gpCors[gpci];
                    var gpQty = gp.por_corretora[gpCorName] || 0;
                    if (gpQty <= 0) continue;
                    if (!garantiasMap[gpCorName]) garantiasMap[gpCorName] = { caixa: 0, ativos: [], emUsoPut: 0, putsCount: 0, callMap: {} };
                    var gpPreco = gp.preco_atual || gp.pm || 0;
                    var gpHaircut = HAIRCUT_MAP_G[gp.categoria] || 0.70;
                    var gpVal = gpQty * gpPreco * gpHaircut;
                    if (gpVal > 0) {
                      garantiasMap[gpCorName].ativos.push({
                        ticker: gp.ticker,
                        qty: gpQty,
                        preco: gpPreco,
                        haircut: gpHaircut,
                        valor: gpVal,
                      });
                    }
                    // Track ações para seção CALL
                    if (!garantiasMap[gpCorName].callMap[gp.ticker]) garantiasMap[gpCorName].callMap[gp.ticker] = { totalAcoes: 0, callsVendidas: 0 };
                    garantiasMap[gpCorName].callMap[gp.ticker].totalAcoes += gpQty;
                  }
                }
                // Calcular em uso por PUTs vendidas ativas + CALLs vendidas
                for (var gui = 0; gui < ativas.length; gui++) {
                  var gu = ativas[gui];
                  var guIsVenda = gu.direcao === 'lancamento' || gu.direcao === 'venda';
                  if (!guIsVenda) continue;
                  var guCor = (gu.corretora || '').toUpperCase().trim();
                  if (!guCor) continue;
                  var guTipo = (gu.tipo || '').toLowerCase();
                  if (!garantiasMap[guCor]) garantiasMap[guCor] = { caixa: 0, ativos: [], emUsoPut: 0, putsCount: 0, callMap: {} };
                  if (guTipo === 'put') {
                    garantiasMap[guCor].emUsoPut += (gu.strike || 0) * (gu.quantidade || 0);
                    garantiasMap[guCor].putsCount += 1;
                  } else if (guTipo === 'call') {
                    var guBase = (gu.ativo_base || '').toUpperCase().trim();
                    if (guBase) {
                      if (!garantiasMap[guCor].callMap[guBase]) garantiasMap[guCor].callMap[guBase] = { totalAcoes: 0, callsVendidas: 0 };
                      garantiasMap[guCor].callMap[guBase].callsVendidas += (gu.quantidade || 0);
                    }
                  }
                }
                var gKeys = Object.keys(garantiasMap);
                if (gKeys.length === 0) return null;
                gKeys.sort(function(a, b) {
                  var tA = garantiasMap[a].caixa;
                  for (var ai = 0; ai < garantiasMap[a].ativos.length; ai++) tA += garantiasMap[a].ativos[ai].valor;
                  var tB = garantiasMap[b].caixa;
                  for (var bi = 0; bi < garantiasMap[b].ativos.length; bi++) tB += garantiasMap[b].ativos[bi].valor;
                  return tB - tA;
                });
                // Filter by visible corretoras
                // _visible === null/undefined → never configured → show all
                // _visible === [] → user explicitly unchecked all → show none
                var visibleList = garantiasConfig ? garantiasConfig._visible : undefined;
                var hasVisConfig = Array.isArray(visibleList);
                var gKeysFiltered = [];
                if (hasVisConfig) {
                  for (var vf = 0; vf < gKeys.length; vf++) {
                    if (visibleList.indexOf(gKeys[vf]) >= 0) gKeysFiltered.push(gKeys[vf]);
                  }
                } else {
                  gKeysFiltered = gKeys;
                }
                var visCount = gKeysFiltered.length;
                return (
                  <Glass padding={14}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                        <Ionicons name="shield-checkmark-outline" size={14} color={C.accent} />
                        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono, letterSpacing: 1.2, fontWeight: '600' }}>GARANTIAS POR CORRETORA/BANCO</Text>
                        <InfoTip text={"Garantias por corretora para PUT (CSP) e CALL (Cobertura).\n\nPUT: Caixa + ativos com haircut. Toque no escudo para marcar como garantia principal.\nCALL: Ações disponíveis para covered call por ativo."} size={13} />
                      </View>
                      <TouchableOpacity onPress={function() { setGarantiasDropdown(!garantiasDropdown); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)' }}>
                        <Ionicons name="funnel-outline" size={12} color={C.dim} />
                        <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>{visCount + '/' + gKeys.length}</Text>
                        <Ionicons name={garantiasDropdown ? 'chevron-up' : 'chevron-down'} size={11} color={C.dim} />
                      </TouchableOpacity>
                    </View>
                    {/* Dropdown de corretoras */}
                    {garantiasDropdown ? (
                      <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
                        <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginBottom: 8 }}>EXIBIR CORRETORAS</Text>
                        {gKeys.map(function(gkPill) {
                          var isVis = !hasVisConfig || visibleList.indexOf(gkPill) >= 0;
                          return (
                            <TouchableOpacity key={'gpill_' + gkPill} onPress={function() { handleToggleGarantiaCorretora(gkPill, gKeys); }}
                              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' }}>
                              <Ionicons name={isVis ? 'checkbox' : 'square-outline'} size={16} color={isVis ? C.accent : C.dim} />
                              <Text style={{ fontSize: 12, color: isVis ? C.text : C.dim, fontFamily: F.body, flex: 1 }}>{gkPill}</Text>
                              <Ionicons name={isVis ? 'eye' : 'eye-off-outline'} size={13} color={isVis ? C.accent : 'rgba(255,255,255,0.15)' } />
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ) : null}
                    {gKeysFiltered.length === 0 ? (
                      <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.body, textAlign: 'center', paddingVertical: 12 }}>Nenhuma corretora selecionada</Text>
                    ) : null}
                    {gKeysFiltered.map(function(gk, gIdx) {
                      var gData = garantiasMap[gk];
                      var corConfig = garantiasConfig[gk] || [];
                      var isOpen = !!garantiasOpen[gk];
                      // Separar ativos em principal e secundária
                      var principal = [];
                      var secundaria = [];
                      for (var ga2 = 0; ga2 < gData.ativos.length; ga2++) {
                        var at = gData.ativos[ga2];
                        if (corConfig.indexOf(at.ticker) >= 0) {
                          principal.push(at);
                        } else {
                          secundaria.push(at);
                        }
                      }
                      var totalPrincipal = gData.caixa;
                      for (var tp = 0; tp < principal.length; tp++) totalPrincipal += principal[tp].valor;
                      var totalSecundaria = 0;
                      for (var ts = 0; ts < secundaria.length; ts++) totalSecundaria += secundaria[ts].valor;
                      var gTotal = totalPrincipal + totalSecundaria;
                      var gLivrePut = gTotal - gData.emUsoPut;
                      // % livre e % em uso
                      var pctLivre = gTotal > 0 ? Math.round((gLivrePut / gTotal) * 100) : 100;
                      var pctEmUso = gTotal > 0 ? Math.round((gData.emUsoPut / gTotal) * 100) : 0;
                      var livrePutColor = gLivrePut > 0 ? C.green : gLivrePut < 0 ? C.red : C.dim;
                      // Principal livre (sempre calculado, independente de ter PUTs)
                      var usoPrincipal = Math.min(gData.emUsoPut, totalPrincipal);
                      var livrePrincipal = totalPrincipal - usoPrincipal;
                      var pctPrincipalUsado = totalPrincipal > 0 ? Math.round((usoPrincipal / totalPrincipal) * 100) : 0;
                      var pctPrincipalLivre = totalPrincipal > 0 ? Math.round((livrePrincipal / totalPrincipal) * 100) : 100;
                      var usoSecundaria = gData.emUsoPut > totalPrincipal ? gData.emUsoPut - totalPrincipal : 0;
                      var livreSecundaria = totalSecundaria - usoSecundaria;
                      var pctSecundariaLivre = totalSecundaria > 0 ? Math.round((livreSecundaria / totalSecundaria) * 100) : 100;
                      // CALL data
                      var callKeys = Object.keys(gData.callMap);
                      var callRows = [];
                      for (var ck = 0; ck < callKeys.length; ck++) {
                        var cd = gData.callMap[callKeys[ck]];
                        if (cd.totalAcoes > 0) {
                          callRows.push({ ticker: callKeys[ck], total: cd.totalAcoes, vendidas: cd.callsVendidas, livres: cd.totalAcoes - cd.callsVendidas });
                        }
                      }
                      // Header badge color
                      var headerBadgeColor = pctLivre >= 50 ? C.green : pctLivre >= 20 ? C.yellow : C.red;
                      var headerBadgeBg = pctLivre >= 50 ? 'rgba(34,197,94,0.15)' : pctLivre >= 20 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)';
                      return (
                        <View key={gk} style={gIdx > 0 ? { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' } : {}}>
                          {/* Header — toque para expandir/colapsar */}
                          <TouchableOpacity onPress={function() { var n = {}; var ok = Object.keys(garantiasOpen); for (var oi = 0; oi < ok.length; oi++) n[ok[oi]] = garantiasOpen[ok[oi]]; n[gk] = !isOpen; setGarantiasOpen(n); }}
                            style={{ paddingVertical: 4 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                                <Text style={{ fontSize: 13, fontWeight: '700', color: C.text, fontFamily: F.display }}>{gk}</Text>
                                {gData.putsCount > 0 ? (
                                  <View style={{ backgroundColor: 'rgba(245,158,11,0.15)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                                    <Text style={{ fontSize: 9, color: C.yellow, fontFamily: F.mono, fontWeight: '600' }}>{gData.putsCount + 'P'}</Text>
                                  </View>
                                ) : null}
                                {callRows.length > 0 ? (
                                  <View style={{ backgroundColor: 'rgba(59,130,246,0.15)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                                    <Text style={{ fontSize: 9, color: C.acoes, fontFamily: F.mono, fontWeight: '600' }}>{callRows.length + 'C'}</Text>
                                  </View>
                                ) : null}
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={{ backgroundColor: headerBadgeBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                                  <Text style={{ fontSize: 10, color: headerBadgeColor, fontFamily: F.mono, fontWeight: '700' }}>{pctLivre + '% livre'}</Text>
                                </View>
                                <Sensitive><Text style={{ fontSize: 11, color: livrePutColor, fontFamily: F.mono, fontWeight: '600' }}>{'R$ ' + fmt(gLivrePut)}</Text></Sensitive>
                                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} color={C.dim} />
                              </View>
                            </View>
                            {/* Barra de progresso no header (sempre visível) */}
                            <View style={{ marginTop: 6, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                              {gTotal > 0 ? (
                                <View style={{ flexDirection: 'row', height: 4 }}>
                                  {pctEmUso > 0 ? (
                                    <View style={{ width: (pctEmUso > 100 ? 100 : pctEmUso) + '%', height: 4, backgroundColor: pctEmUso >= 100 ? C.red : pctEmUso >= 80 ? C.yellow + 'CC' : C.yellow + '88', borderRadius: 2 }} />
                                  ) : null}
                                  {pctEmUso < 100 ? (
                                    <View style={{ flex: 1, height: 4, backgroundColor: C.green + '44', borderRadius: 2 }} />
                                  ) : null}
                                </View>
                              ) : null}
                            </View>
                          </TouchableOpacity>

                          {/* Conteúdo expandido */}
                          {isOpen ? (
                            <View style={{ marginTop: 8 }}>
                              {/* ── GARANTIA PRINCIPAL ── */}
                              {(principal.length > 0 || gData.caixa > 0) ? (
                                <View style={{ marginBottom: 8 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                      <Ionicons name="shield-checkmark" size={12} color={C.accent} />
                                      <Text style={{ fontSize: 10, color: C.accent, fontFamily: F.mono, letterSpacing: 0.8, fontWeight: '600' }}>PRINCIPAL</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                      <View style={{ backgroundColor: (pctPrincipalLivre >= 50 ? 'rgba(34,197,94,0.12)' : pctPrincipalLivre >= 20 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)'), paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                                        <Text style={{ fontSize: 9, color: pctPrincipalLivre >= 50 ? C.green : pctPrincipalLivre >= 20 ? C.yellow : C.red, fontFamily: F.mono, fontWeight: '600' }}>{pctPrincipalLivre + '% livre'}</Text>
                                      </View>
                                      <Sensitive><Text style={{ fontSize: 11, color: C.accent, fontFamily: F.mono, fontWeight: '600' }}>{'R$ ' + fmt(totalPrincipal)}</Text></Sensitive>
                                    </View>
                                  </View>
                                  {gData.caixa > 0 ? (
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, paddingLeft: 16 }}>
                                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                        <Ionicons name="wallet-outline" size={11} color={C.sub} />
                                        <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.mono }}>Caixa</Text>
                                      </View>
                                      <Sensitive><Text style={{ fontSize: 11, color: C.text, fontFamily: F.mono }}>{'R$ ' + fmt(gData.caixa)}</Text></Sensitive>
                                    </View>
                                  ) : null}
                                  {principal.map(function(ga, gaIdx) {
                                    var haircutPct = Math.round(ga.haircut * 100);
                                    return (
                                      <TouchableOpacity key={'p_' + ga.ticker + '_' + gaIdx} onPress={function() { handleToggleGarantia(gk, ga.ticker); }} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2, paddingLeft: 16 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                          <Ionicons name="shield-checkmark" size={11} color={C.accent} />
                                          <Text style={{ fontSize: 11, color: C.accent, fontFamily: F.mono, fontWeight: '600' }}>{ga.ticker}</Text>
                                          <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>{'(' + haircutPct + '%)'}</Text>
                                        </View>
                                        <Sensitive><Text style={{ fontSize: 11, color: C.text, fontFamily: F.mono }}>{'R$ ' + fmt(ga.valor)}</Text></Sensitive>
                                      </TouchableOpacity>
                                    );
                                  })}
                                  {/* Linha de uso e livre da principal */}
                                  {gData.emUsoPut > 0 ? (
                                    <View style={{ paddingLeft: 16, marginTop: 2 }}>
                                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1 }}>
                                        <Text style={{ fontSize: 10, color: pctPrincipalUsado >= 100 ? C.red : pctPrincipalUsado >= 80 ? C.yellow : C.dim, fontFamily: F.mono }}>{'Em uso (' + pctPrincipalUsado + '%)'}</Text>
                                        <Sensitive><Text style={{ fontSize: 10, color: pctPrincipalUsado >= 100 ? C.red : pctPrincipalUsado >= 80 ? C.yellow : C.dim, fontFamily: F.mono }}>{'R$ ' + fmt(usoPrincipal)}</Text></Sensitive>
                                      </View>
                                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1 }}>
                                        <Text style={{ fontSize: 10, color: livrePrincipal > 0 ? C.green : C.red, fontFamily: F.mono, fontWeight: '600' }}>{'Livre (' + pctPrincipalLivre + '%)'}</Text>
                                        <Sensitive><Text style={{ fontSize: 10, color: livrePrincipal > 0 ? C.green : C.red, fontFamily: F.mono, fontWeight: '600' }}>{'R$ ' + fmt(livrePrincipal)}</Text></Sensitive>
                                      </View>
                                    </View>
                                  ) : (
                                    <View style={{ paddingLeft: 16, marginTop: 2 }}>
                                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1 }}>
                                        <Text style={{ fontSize: 10, color: C.green, fontFamily: F.mono, fontWeight: '600' }}>Livre (100%)</Text>
                                        <Sensitive><Text style={{ fontSize: 10, color: C.green, fontFamily: F.mono, fontWeight: '600' }}>{'R$ ' + fmt(totalPrincipal)}</Text></Sensitive>
                                      </View>
                                    </View>
                                  )}
                                </View>
                              ) : null}

                              {/* ── GARANTIA SECUNDÁRIA ── */}
                              {secundaria.length > 0 ? (
                                <View style={{ marginBottom: 8 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                      <Ionicons name="shield-outline" size={12} color={C.dim} />
                                      <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, fontWeight: '600' }}>SECUNDÁRIA</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                      <View style={{ backgroundColor: (pctSecundariaLivre >= 50 ? 'rgba(34,197,94,0.12)' : pctSecundariaLivre >= 20 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)'), paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                                        <Text style={{ fontSize: 9, color: pctSecundariaLivre >= 50 ? C.green : pctSecundariaLivre >= 20 ? C.yellow : C.red, fontFamily: F.mono, fontWeight: '600' }}>{pctSecundariaLivre + '% livre'}</Text>
                                      </View>
                                      <Sensitive><Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>{'R$ ' + fmt(totalSecundaria)}</Text></Sensitive>
                                    </View>
                                  </View>
                                  {secundaria.map(function(ga, gaIdx) {
                                    var haircutPct = Math.round(ga.haircut * 100);
                                    return (
                                      <TouchableOpacity key={'s_' + ga.ticker + '_' + gaIdx} onPress={function() { handleToggleGarantia(gk, ga.ticker); }} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2, paddingLeft: 16 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                          <Ionicons name="shield-outline" size={11} color={C.dim} />
                                          <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.mono }}>{ga.ticker}</Text>
                                          <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>{'(' + haircutPct + '%)'}</Text>
                                        </View>
                                        <Sensitive><Text style={{ fontSize: 11, color: C.text, fontFamily: F.mono }}>{'R$ ' + fmt(ga.valor)}</Text></Sensitive>
                                      </TouchableOpacity>
                                    );
                                  })}
                                  {usoSecundaria > 0 ? (
                                    <View style={{ paddingLeft: 16, marginTop: 2 }}>
                                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1 }}>
                                        <Text style={{ fontSize: 10, color: C.red, fontFamily: F.mono }}>{'Em uso (' + (100 - pctSecundariaLivre) + '%)'}</Text>
                                        <Sensitive><Text style={{ fontSize: 10, color: C.red, fontFamily: F.mono }}>{'R$ ' + fmt(usoSecundaria)}</Text></Sensitive>
                                      </View>
                                    </View>
                                  ) : null}
                                </View>
                              ) : null}

                              {/* ── RESUMO PUT ── */}
                              <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                  <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />
                                  <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 1, marginHorizontal: 8 }}>PUT (CSP)</Text>
                                  <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />
                                </View>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                                  <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>Total garantia</Text>
                                  <Sensitive><Text style={{ fontSize: 11, color: C.text, fontFamily: F.mono, fontWeight: '600' }}>{'R$ ' + fmt(gTotal)}</Text></Sensitive>
                                </View>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                                  <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>{'Em uso' + (gData.putsCount > 0 ? ' (' + gData.putsCount + ' PUT' + (gData.putsCount > 1 ? 's' : '') + ')' : '')}</Text>
                                  <Sensitive><Text style={{ fontSize: 11, color: gData.emUsoPut > 0 ? C.yellow : C.dim, fontFamily: F.mono }}>{'R$ ' + fmt(gData.emUsoPut) + (pctEmUso > 0 ? '  (' + pctEmUso + '%)' : '')}</Text></Sensitive>
                                </View>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                                  <Text style={{ fontSize: 12, color: livrePutColor, fontFamily: F.mono, fontWeight: '700' }}>Livre total</Text>
                                  <Sensitive><Text style={{ fontSize: 12, color: livrePutColor, fontFamily: F.mono, fontWeight: '700' }}>{'R$ ' + fmt(gLivrePut) + '  (' + pctLivre + '%)'}</Text></Sensitive>
                                </View>
                              </View>

                              {/* ── CALL (Cobertura) ── */}
                              {callRows.length > 0 ? (
                                <View style={{ marginTop: 10 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                                    <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                                    <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 1, marginHorizontal: 8 }}>CALL (Cobertura)</Text>
                                    <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                                  </View>
                                  {callRows.map(function(cr) {
                                    var crLivreColor = cr.livres > 0 ? C.green : cr.livres === 0 ? C.yellow : C.red;
                                    var crPctLivre = cr.total > 0 ? Math.round((cr.livres / cr.total) * 100) : 0;
                                    return (
                                      <View key={'call_' + cr.ticker} style={{ paddingVertical: 3 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                          <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.mono, width: 58 }}>{cr.ticker}</Text>
                                          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>{cr.total + ' ações'}</Text>
                                          <Text style={{ fontSize: 10, color: cr.vendidas > 0 ? C.yellow : C.dim, fontFamily: F.mono }}>{cr.vendidas > 0 ? cr.vendidas + ' vend.' : '—'}</Text>
                                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                            <Text style={{ fontSize: 11, color: crLivreColor, fontFamily: F.mono, fontWeight: '600' }}>{cr.livres + ' livres'}</Text>
                                            <View style={{ backgroundColor: (crPctLivre >= 50 ? 'rgba(34,197,94,0.12)' : crPctLivre >= 20 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)'), paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 }}>
                                              <Text style={{ fontSize: 8, color: crLivreColor, fontFamily: F.mono, fontWeight: '600' }}>{crPctLivre + '%'}</Text>
                                            </View>
                                          </View>
                                        </View>
                                      </View>
                                    );
                                  })}
                                </View>
                              ) : null}
                            </View>
                          ) : null}
                        </View>
                      );
                    })}
                  </Glass>
                );
              })()}

              {/* Option cards (grouped) */}
              {ativasGrouped.map(function(group, gi) {
                if (group.type === 'single') {
                  var op = group.op;
                  var cachedOp = getCachedOptionData(op.ativo_base, op.strike, op.tipo, op.vencimento);
                  var cachedCh = getCachedChain(op.ativo_base);
                  return (
                    <OpCard key={op.id || gi} op={op} positions={positions} saldos={saldos} indicators={indicators} selicRate={selicRate} setInfoModal={setInfoModal}
                      cachedOption={cachedOp} cachedChain={cachedCh}
                      onEdit={function() { navigation.navigate('EditOpcao', { opcao: op }); }}
                      onDelete={function() { handleDelete(op.id); }}
                      onClose={handleClose}
                      onRoll={handleRoll}
                      onAlertaPLSave={handleAlertaPLSave}
                    />
                  );
                }
                // Grouped card
                var combined = group.combined;
                var subOps = group.ops;
                var cachedOp2 = getCachedOptionData(combined.ativo_base, combined.strike, combined.tipo, combined.vencimento);
                var cachedCh2 = getCachedChain(combined.ativo_base);
                return (
                  <GroupedOpCard key={'g' + gi} combined={combined} subOps={subOps} positions={positions} saldos={saldos} indicators={indicators} selicRate={selicRate} setInfoModal={setInfoModal}
                    cachedOption={cachedOp2} cachedChain={cachedCh2}
                    navigation={navigation}
                    handleDelete={handleDelete}
                    handleClose={handleClose}
                    handleGroupClose={handleGroupClose}
                    handleRoll={handleRoll}
                    handleAlertaPLSave={handleAlertaPLSave}
                  />
                );
              })}

              {/* Vencimentos */}
              {vencimentos.length > 0 && (
                <View>
                  <SectionLabel>PRÓXIMOS VENCIMENTOS</SectionLabel>
                  {vencimentos.map(function(v, i) {
                    var daysLeft = Math.max(0, Math.ceil((parseLocalDate(v.vencimento) - new Date()) / (1000 * 60 * 60 * 24)));
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
                              {formatDateBR(v.vencimento)}
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
              {subCtx.isAtLimit('options', ativas.length) && !subCtx.canAccess('OPTIONS_UNLIMITED') ? (
                <UpgradePrompt feature="OPTIONS_UNLIMITED" compact={true} />
              ) : (
                <TouchableOpacity
                  activeOpacity={0.8} style={styles.addBtn}
                  onPress={function() { navigation.navigate('AddOpcao', { portfolio_id: selPortfolio && selPortfolio !== '__null__' ? selPortfolio : null }); }}
                >
                  <Text style={styles.addBtnText}>+ Nova Opcao</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      )}

      {/* CALCULADORA TAB */}
      {sub === 'sim' && (
        <View style={{ gap: SIZE.gap }}>
          <SectionLabel>CALCULADORA DE OPÇÕES</SectionLabel>
          <CalculadoraOpcoes positions={positions} indicators={indicators} selicRate={selicRate} ativas={ativas} allOpcoes={opcoes} subCtx={subCtx}
            priceAlerts={priceAlerts} setPriceAlerts={setPriceAlerts} priceAlertsFired={priceAlertsFired} setPriceAlertsFired={setPriceAlertsFired}
            pendingRadarTicker={pendingRadarTicker} setPendingRadarTicker={setPendingRadarTicker} />
        </View>
      )}

      {/* RADAR TAB */}
      {sub === 'radar' && (
        <RadarView
          positions={positions}
          selicRate={selicRate}
          radarResults={radarResults} setRadarResults={setRadarResults}
          radarScanning={radarScanning} setRadarScanning={setRadarScanning}
          radarScannedCount={radarScannedCount} setRadarScannedCount={setRadarScannedCount}
          radarTotalCount={radarTotalCount} setRadarTotalCount={setRadarTotalCount}
          radarLastScan={radarLastScan} setRadarLastScan={setRadarLastScan}
          onNavigateToSim={function(ticker) {
            setPendingRadarTicker(ticker);
            setSub('sim');
          }}
        />
      )}

      {/* HISTORICO TAB */}
      {sub === 'hist' && (function() {
        // Helper: parse DD/MM/AAAA to YYYY-MM-DD for comparison
        var parseBRtoISO = function(br) {
          if (!br || br.length < 10) return '';
          var parts = br.split('/');
          if (parts.length !== 3) return '';
          return parts[2] + '-' + parts[1] + '-' + parts[0];
        };
        // Filter historico based on selected filter
        var MESES_HIST = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        var histFiltered = historico.filter(function(op) {
          // Status filter
          if (histStatusFilter !== 'todos') {
            if (histStatusFilter === 'fechada' && op.status !== 'fechada') return false;
            if (histStatusFilter === 'exercida' && op.status !== 'exercida') return false;
            if (histStatusFilter === 'vencida' && op.status !== 'expirou_po' && op.status !== 'expirada') return false;
          }
          // Tipo filter (call/put)
          if (histTipoFilter !== 'todos') {
            if ((op.tipo || '').toLowerCase() !== histTipoFilter) return false;
          }
          // Date filter
          var refDate = op.data_fechamento || op.vencimento || op.data_abertura;
          if (!refDate) return histFilterMode === 'todos';
          var d = new Date(refDate + 'T12:00:00');
          var isoDate = refDate.substring(0, 10);
          if (histFilterMode === 'mes') {
            return d.getMonth() === histFilterMonth && d.getFullYear() === histFilterYear;
          }
          if (histFilterMode === 'ano') {
            return d.getFullYear() === histFilterYear;
          }
          if (histFilterMode === 'periodo') {
            var isoDe = parseBRtoISO(histDateDe);
            var isoAte = parseBRtoISO(histDateAte);
            if (isoDe && isoAte) return isoDate >= isoDe && isoDate <= isoAte;
            if (isoDe) return isoDate >= isoDe;
            if (isoAte) return isoDate <= isoAte;
            return true;
          }
          return true;
        });
        // Available years from historico
        var histYears = (function() {
          var yrs = {};
          for (var yi = 0; yi < historico.length; yi++) {
            var rd = historico[yi].data_fechamento || historico[yi].vencimento || historico[yi].data_abertura;
            if (rd) { yrs[new Date(rd + 'T12:00:00').getFullYear()] = true; }
          }
          var arr = [];
          for (var yk in yrs) { arr.push(Number(yk)); }
          arr.sort(function(a, b) { return b - a; });
          if (arr.length === 0) arr.push(new Date().getFullYear());
          return arr;
        })();
        var histVisible = histShowAll ? histFiltered : histFiltered.slice(0, HIST_PAGE_SIZE);
        var histHasMore = histFiltered.length > HIST_PAGE_SIZE && !histShowAll;
        return (
        <View style={{ gap: SIZE.gap }}>
          {historico.length === 0 ? (
            <Glass padding={24}>
              <Text style={{ fontSize: 14, color: C.sub, fontFamily: F.body, textAlign: 'center' }}>
                Nenhuma operação encerrada ainda.
              </Text>
            </Glass>
          ) : (
            <>
              {/* Filter bar */}
              <Glass padding={12}>
                {/* Filter mode pills */}
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {[
                    { k: 'todos', l: 'Todos' },
                    { k: 'mes', l: 'Mês' },
                    { k: 'ano', l: 'Ano' },
                    { k: 'periodo', l: 'Período' },
                  ].map(function(fm) {
                    var active = histFilterMode === fm.k;
                    return (
                      <TouchableOpacity key={fm.k}
                        onPress={function() { setHistFilterMode(fm.k); setHistShowAll(false); }}
                        style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: active ? C.accent : 'rgba(255,255,255,0.06)' }}>
                        <Text style={{ fontSize: 12, color: active ? '#fff' : C.sub, fontFamily: F.mono, fontWeight: active ? '700' : '500' }}>{fm.l}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {/* Status + Tipo filters */}
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {[
                    { k: 'todos', l: 'Todos', c: C.sub },
                    { k: 'fechada', l: 'Encerradas', c: C.yellow },
                    { k: 'exercida', l: 'Exercidas', c: C.etfs },
                    { k: 'vencida', l: 'Vencidas', c: C.green },
                  ].map(function(sf) {
                    var sActive = histStatusFilter === sf.k;
                    return (
                      <TouchableOpacity key={sf.k}
                        onPress={function() { setHistStatusFilter(sf.k); setHistShowAll(false); }}
                        style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: sActive ? sf.c + '30' : 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: sActive ? sf.c : 'transparent' }}>
                        <Text style={{ fontSize: 11, color: sActive ? sf.c : C.dim, fontFamily: F.mono, fontWeight: sActive ? '700' : '400' }}>{sf.l}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  <View style={{ width: 1, height: 18, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: 2 }} />
                  {[
                    { k: 'todos', l: 'C+P' },
                    { k: 'call', l: 'CALL' },
                    { k: 'put', l: 'PUT' },
                  ].map(function(tf) {
                    var tActive = histTipoFilter === tf.k;
                    return (
                      <TouchableOpacity key={tf.k}
                        onPress={function() { setHistTipoFilter(tf.k); setHistShowAll(false); }}
                        style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: tActive ? C.opcoes + '30' : 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: tActive ? C.opcoes : 'transparent' }}>
                        <Text style={{ fontSize: 11, color: tActive ? C.opcoes : C.dim, fontFamily: F.mono, fontWeight: tActive ? '700' : '400' }}>{tf.l}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {/* Month selector */}
                {histFilterMode === 'mes' ? (
                  <View style={{ marginTop: 10, gap: 8 }}>
                    {/* Year row */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                      <TouchableOpacity onPress={function() { setHistFilterYear(histFilterYear - 1); setHistShowAll(false); }}
                        style={{ padding: 6 }}>
                        <Ionicons name="chevron-back" size={18} color={C.sub} />
                      </TouchableOpacity>
                      <Text style={{ fontSize: 14, color: C.text, fontFamily: F.mono, fontWeight: '700', minWidth: 50, textAlign: 'center' }}>{histFilterYear}</Text>
                      <TouchableOpacity onPress={function() { setHistFilterYear(histFilterYear + 1); setHistShowAll(false); }}
                        style={{ padding: 6 }}>
                        <Ionicons name="chevron-forward" size={18} color={C.sub} />
                      </TouchableOpacity>
                    </View>
                    {/* Month pills */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
                      {MESES_HIST.map(function(ml, mi) {
                        var mActive = histFilterMonth === mi;
                        return (
                          <TouchableOpacity key={mi}
                            onPress={function() { setHistFilterMonth(mi); setHistShowAll(false); }}
                            style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: mActive ? C.opcoes : 'rgba(255,255,255,0.04)', minWidth: 38, alignItems: 'center' }}>
                            <Text style={{ fontSize: 11, color: mActive ? '#fff' : C.dim, fontFamily: F.mono, fontWeight: mActive ? '700' : '400' }}>{ml}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ) : null}
                {/* Year selector */}
                {histFilterMode === 'ano' ? (
                  <View style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                    {histYears.map(function(yr) {
                      var yActive = histFilterYear === yr;
                      return (
                        <TouchableOpacity key={yr}
                          onPress={function() { setHistFilterYear(yr); setHistShowAll(false); }}
                          style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: yActive ? C.opcoes : 'rgba(255,255,255,0.04)' }}>
                          <Text style={{ fontSize: 13, color: yActive ? '#fff' : C.sub, fontFamily: F.mono, fontWeight: yActive ? '700' : '400' }}>{yr}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}
                {/* Period inputs (de / até) */}
                {histFilterMode === 'periodo' ? (
                  <View style={{ marginTop: 10, gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.mono, width: 28 }}>De</Text>
                      <TextInput
                        value={histDateDe}
                        onChangeText={function(t) {
                          var clean = t.replace(/[^0-9]/g, '');
                          if (clean.length > 8) clean = clean.substring(0, 8);
                          var formatted = '';
                          if (clean.length >= 5) {
                            formatted = clean.substring(0, 2) + '/' + clean.substring(2, 4) + '/' + clean.substring(4);
                          } else if (clean.length >= 3) {
                            formatted = clean.substring(0, 2) + '/' + clean.substring(2);
                          } else {
                            formatted = clean;
                          }
                          setHistDateDe(formatted);
                          setHistShowAll(false);
                        }}
                        placeholder="DD/MM/AAAA"
                        placeholderTextColor={C.dim}
                        keyboardType="numeric"
                        maxLength={10}
                        style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: C.text, fontFamily: F.mono, fontSize: 13 }}
                      />
                      {histDateDe ? (
                        <TouchableOpacity onPress={function() { setHistDateDe(''); setHistShowAll(false); }}
                          style={{ padding: 4 }}>
                          <Ionicons name="close-circle" size={18} color={C.sub} />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.mono, width: 28 }}>Até</Text>
                      <TextInput
                        value={histDateAte}
                        onChangeText={function(t) {
                          var clean = t.replace(/[^0-9]/g, '');
                          if (clean.length > 8) clean = clean.substring(0, 8);
                          var formatted = '';
                          if (clean.length >= 5) {
                            formatted = clean.substring(0, 2) + '/' + clean.substring(2, 4) + '/' + clean.substring(4);
                          } else if (clean.length >= 3) {
                            formatted = clean.substring(0, 2) + '/' + clean.substring(2);
                          } else {
                            formatted = clean;
                          }
                          setHistDateAte(formatted);
                          setHistShowAll(false);
                        }}
                        placeholder="DD/MM/AAAA"
                        placeholderTextColor={C.dim}
                        keyboardType="numeric"
                        maxLength={10}
                        style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: C.text, fontFamily: F.mono, fontSize: 13 }}
                      />
                      {histDateAte ? (
                        <TouchableOpacity onPress={function() { setHistDateAte(''); setHistShowAll(false); }}
                          style={{ padding: 4 }}>
                          <Ionicons name="close-circle" size={18} color={C.sub} />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    {(histDateDe || histDateAte) ? (
                      <TouchableOpacity onPress={function() { setHistDateDe(''); setHistDateAte(''); setHistShowAll(false); }}
                        style={{ alignSelf: 'flex-end', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.06)' }}>
                        <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.mono }}>Limpar</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null}
                {/* Result count */}
                {(histFilterMode !== 'todos' || histStatusFilter !== 'todos' || histTipoFilter !== 'todos') ? (
                  <View style={{ marginTop: 8, gap: 2 }}>
                    <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>
                      {histFiltered.length + ' de ' + historico.length + ' operações'}
                    </Text>
                  </View>
                ) : null}
              </Glass>

              {/* Summary */}
              <Glass padding={14}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                  {(function() {
                    var totalPL = 0;
                    for (var hi = 0; hi < histFiltered.length; hi++) {
                      var h = histFiltered[hi];
                      var hIsVenda = h.direcao === 'lancamento' || h.direcao === 'venda';
                      if (h.status === 'fechada' && h.premio_fechamento != null) {
                        if (hIsVenda) {
                          totalPL = totalPL + ((h.premio || 0) - (h.premio_fechamento || 0)) * (h.quantidade || 0);
                        } else {
                          totalPL = totalPL + ((h.premio_fechamento || 0) - (h.premio || 0)) * (h.quantidade || 0);
                        }
                      } else if (hIsVenda) {
                        totalPL = totalPL + (h.premio || 0) * (h.quantidade || 0);
                      } else {
                        totalPL = totalPL - (h.premio || 0) * (h.quantidade || 0);
                      }
                    }
                    var expiradas = histFiltered.filter(function(o) { return o.status === 'expirou_po' || o.status === 'expirada'; }).length;
                    var exercidas = histFiltered.filter(function(o) { return o.status === 'exercida'; }).length;
                    var fechadas = histFiltered.filter(function(o) { return o.status === 'fechada'; }).length;
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
              {histFiltered.length === 0 ? (
                <Glass padding={20}>
                  <Text style={{ fontSize: 13, color: C.sub, fontFamily: F.body, textAlign: 'center' }}>
                    Nenhuma operação neste período.
                  </Text>
                </Glass>
              ) : (
              <Glass padding={0}>
                {histVisible.map(function(op, i) {
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
                  } else if (isVendaHist) {
                    // Virou pó / expirada / exercida (venda) = full premium kept
                    histDisplayVal = '+R$ ' + fmt(premTotal);
                    histDisplayColor = C.green;
                  } else {
                    // Compra: expirou = perda total do prêmio
                    histDisplayVal = '-R$ ' + fmt(premTotal);
                    histDisplayColor = C.red;
                    histPL = -premTotal;
                  }

                  var isExercida = op.status === 'exercida';
                  var isExpPo = op.status === 'expirou_po' || op.status === 'expirada';
                  var direcaoLabel = isVendaHist ? 'Venda' : 'Compra';

                  // Duração em dias
                  var duracaoDias = '';
                  if (op.data_abertura) {
                    var dtAbertura = new Date(op.data_abertura + 'T12:00:00');
                    var dtFim = op.data_fechamento ? new Date(op.data_fechamento + 'T12:00:00') : (op.vencimento ? new Date(op.vencimento + 'T12:00:00') : null);
                    if (dtFim) {
                      var diffMs = dtFim.getTime() - dtAbertura.getTime();
                      var dias = Math.round(diffMs / 86400000);
                      duracaoDias = dias + 'd';
                    }
                  }

                  // Total exercício para exercidas
                  var totalExercicio = (op.strike || 0) * (op.quantidade || 0);

                  return (
                    <View key={op.id || i}
                      style={[styles.histRow, i > 0 && { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)' }]}
                    >
                      <View style={{ flex: 1 }}>
                        {/* Header: ativo + tipo + strike */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[{ fontSize: 14, fontWeight: '700', color: C.text, fontFamily: F.display }, ps]}>
                            {op.ativo_base + ' ' + tipoLabel + ' ' + fmt(op.strike || 0)}
                          </Text>
                          <Badge text={direcaoLabel} color={isVendaHist ? C.etfs : C.rf} />
                        </View>
                        {/* Ticker da opção */}
                        {op.ticker_opcao ? (
                          <Text style={{ fontSize: 11, color: C.opcoes, fontFamily: F.mono, marginTop: 2 }}>
                            {op.ticker_opcao}
                          </Text>
                        ) : null}
                        {/* Status + vencimento + corretora + duração */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                          <Badge text={statusLabel} color={stColor} />
                          <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>
                            {'Venc. ' + formatDateBR(op.vencimento)}
                          </Text>
                          {op.corretora ? (
                            <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>{op.corretora}</Text>
                          ) : null}
                          {duracaoDias ? (
                            <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.mono }}>{'(' + duracaoDias + ')'}</Text>
                          ) : null}
                        </View>
                        {/* Datas abertura/encerramento */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                          {op.data_abertura ? (
                            <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>
                              {'Aberta: ' + new Date(op.data_abertura + 'T12:00:00').toLocaleDateString('pt-BR')}
                            </Text>
                          ) : null}
                          {op.data_fechamento ? (
                            <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>
                              {'Encerrada: ' + new Date(op.data_fechamento + 'T12:00:00').toLocaleDateString('pt-BR')}
                            </Text>
                          ) : null}
                        </View>
                        {/* Prêmio recebido/pago (todas) */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                          <Text style={[{ fontSize: 11, color: C.sub, fontFamily: F.mono }, ps]}>
                            {(isVendaHist ? 'Prêmio recebido: ' : 'Prêmio pago: ') + 'R$ ' + fmt(op.premio || 0) + ' x ' + (op.quantidade || 0) + ' = R$ ' + fmt(premTotal)}
                          </Text>
                        </View>
                        {/* Detalhes FECHADA */}
                        {isFechada ? (
                          <View style={{ marginTop: 4, gap: 2 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Text style={[{ fontSize: 11, color: C.dim, fontFamily: F.mono }, ps]}>
                                {'Recompra: R$ ' + fmt(op.premio_fechamento || 0) + ' x ' + (op.quantidade || 0) + ' = R$ ' + fmt((op.premio_fechamento || 0) * (op.quantidade || 0))}
                              </Text>
                            </View>
                            <Text style={[{ fontSize: 12, fontWeight: '700', color: histPL >= 0 ? C.green : C.red, fontFamily: F.mono, marginTop: 3 }, ps]}>
                              {'Resultado: ' + (histPL >= 0 ? '+' : '') + 'R$ ' + fmt(histPL)}
                            </Text>
                          </View>
                        ) : null}
                        {/* Detalhes EXERCIDA */}
                        {isExercida ? (
                          <View style={{ marginTop: 4, gap: 2 }}>
                            <Text style={[{ fontSize: 11, color: C.etfs, fontFamily: F.mono }, ps]}>
                              {'Exercício: ' + (op.quantidade || 0) + ' x R$ ' + fmt(op.strike || 0) + ' = R$ ' + fmt(totalExercicio)}
                            </Text>
                            <Text style={[{ fontSize: 12, fontWeight: '700', color: C.green, fontFamily: F.mono, marginTop: 3 }, ps]}>
                              {'Prêmio retido: +R$ ' + fmt(premTotal)}
                            </Text>
                          </View>
                        ) : null}
                        {/* Detalhes EXPIROU PÓ / EXPIRADA */}
                        {isExpPo ? (
                          <View style={{ marginTop: 4 }}>
                            <Text style={[{ fontSize: 12, fontWeight: '700', color: C.green, fontFamily: F.mono }, ps]}>
                              {isVendaHist ? 'Prêmio retido: +R$ ' + fmt(premTotal) : 'Perda total: -R$ ' + fmt(premTotal)}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[{ fontSize: 15, fontWeight: '700', color: histDisplayColor, fontFamily: F.mono }, ps]}>
                          {histDisplayVal}
                        </Text>
                        {isFechada ? (
                          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, marginTop: 2 }}>P&L</Text>
                        ) : isExercida ? (
                          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, marginTop: 2 }}>Prêmio</Text>
                        ) : (
                          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, marginTop: 2 }}>Prêmio</Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </Glass>
              )}
              {/* Ver mais button */}
              {histHasMore ? (
                <TouchableOpacity
                  onPress={function() { setHistShowAll(true); }}
                  style={{ alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', marginTop: 4 }}>
                  <Text style={{ fontSize: 13, color: C.accent, fontFamily: F.mono, fontWeight: '600' }}>
                    {'Ver mais (' + (histFiltered.length - HIST_PAGE_SIZE) + ' restantes)'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </>
          )}
        </View>
        );
      })()}

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

    {/* Strategy AI Modal */}
    <SharedAiModal
      visible={stratModalVisible}
      onClose={function() { setStratModalVisible(false); }}
      result={stratResult}
      loading={stratLoading}
      error={stratError}
      type="estrategia"
      title="Sugestão de Estratégias"
      usage={stratUsage}
      onSave={handleSaveStrategy}
      saving={stratSaving}
    />

    {/* AI Confirm Modal (strategy flow) */}
    <AiConfirmModal
      visible={aiConfirmVisible2}
      navigation={navigation}
      analysisType={pendingAiType2}
      onCancel={function() { setAiConfirmVisible2(false); setPendingAiType2(''); }}
      onConfirm={function() {
        setAiConfirmVisible2(false);
        setPendingAiType2('');
        handleAiEstrategia();
      }}
    />

    <Fab navigation={navigation} />
    </KeyboardAvoidingView>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 18, gap: SIZE.gap },
  subTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },

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
