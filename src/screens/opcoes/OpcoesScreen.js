import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, TextInput, Alert, Dimensions, Modal,
  ActivityIndicator,
} from 'react-native';
import Svg, { Line, Rect, Path, Text as SvgText } from 'react-native-svg';
import { useFocusEffect, useNavigation, useScrollToTop } from '@react-navigation/native';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getOpcoes, getPositions, getSaldos, addOperacao, getAlertasConfig, getIndicators, getProfile, addMovimentacaoComSaldo, addMovimentacao } from '../../services/database';
import { enrichPositionsWithPrices, clearPriceCache, fetchPrices } from '../../services/priceService';
import { runDailyCalculation, shouldCalculateToday } from '../../services/indicatorService';
import { supabase } from '../../config/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Glass, Badge, Pill, SectionLabel, Fab, InfoTip } from '../../components';
import { SkeletonOpcoes, EmptyState } from '../../components/States';
import { usePrivacyStyle } from '../../components/Sensitive';
import Sensitive from '../../components/Sensitive';
import * as Haptics from 'expo-haptics';
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
// BLACK-SCHOLES MATH
// ═══════════════════════════════════════

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

// Black-Scholes d1 and d2
function bsD1D2(s, k, t, r, sigma) {
  if (t <= 0 || sigma <= 0 || s <= 0 || k <= 0) return { d1: 0, d2: 0 };
  var d1 = (Math.log(s / k) + (r + sigma * sigma / 2) * t) / (sigma * Math.sqrt(t));
  var d2 = d1 - sigma * Math.sqrt(t);
  return { d1: d1, d2: d2 };
}

// BS option price
function bsPrice(s, k, t, r, sigma, tipo) {
  if (t <= 0) {
    if (tipo === 'call') return Math.max(0, s - k);
    return Math.max(0, k - s);
  }
  var dd = bsD1D2(s, k, t, r, sigma);
  if (tipo === 'call') {
    return s * normCDF(dd.d1) - k * Math.exp(-r * t) * normCDF(dd.d2);
  }
  return k * Math.exp(-r * t) * normCDF(-dd.d2) - s * normCDF(-dd.d1);
}

// BS Greeks
function bsGreeks(s, k, t, r, sigma, tipo) {
  if (s <= 0 || k <= 0 || t <= 0 || sigma <= 0) {
    return { delta: 0, gamma: 0, theta: 0, vega: 0 };
  }
  var dd = bsD1D2(s, k, t, r, sigma);
  var sqrtT = Math.sqrt(t);

  // Delta
  var delta;
  if (tipo === 'call') {
    delta = normCDF(dd.d1);
  } else {
    delta = normCDF(dd.d1) - 1;
  }

  // Gamma (same for call and put)
  var gamma = normPDF(dd.d1) / (s * sigma * sqrtT);

  // Theta (per day)
  var thetaAnnual;
  if (tipo === 'call') {
    thetaAnnual = -(s * normPDF(dd.d1) * sigma) / (2 * sqrtT) - r * k * Math.exp(-r * t) * normCDF(dd.d2);
  } else {
    thetaAnnual = -(s * normPDF(dd.d1) * sigma) / (2 * sqrtT) + r * k * Math.exp(-r * t) * normCDF(-dd.d2);
  }
  var theta = thetaAnnual / 365;

  // Vega (per 1% IV change)
  var vega = s * sqrtT * normPDF(dd.d1) / 100;

  return { delta: delta, gamma: gamma, theta: theta, vega: vega };
}

// Implied Volatility via Newton-Raphson
function bsIV(s, k, t, r, marketPrice, tipo) {
  if (marketPrice <= 0 || s <= 0 || k <= 0 || t <= 0) return 0.35;
  var sigma = 0.30; // initial guess
  for (var i = 0; i < 20; i++) {
    var price = bsPrice(s, k, t, r, sigma, tipo);
    var dd = bsD1D2(s, k, t, r, sigma);
    var vegaVal = s * Math.sqrt(t) * normPDF(dd.d1);
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
            <Text maxFontSizeMultiplier={1.5} style={[{ fontSize: 10, color: C.sub, fontFamily: F.mono }, ps]}>
              {'Ativo R$ ' + fmt(touchInfo.price)}
            </Text>
            <Text maxFontSizeMultiplier={1.5} style={[{ fontSize: 11, fontWeight: '700', fontFamily: F.mono,
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
        <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.body, marginBottom: 4 }}>{op.corretora}</Text>
      ) : null}
      {/* Premio: unitario + total */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>PREMIO</Text>
        <Text style={[{ fontSize: 10, color: C.sub, fontFamily: F.mono }, ps]}>
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
          { l: 'IV', v: greeks.iv.toFixed(0) + '%' },
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
          ivLabel = 'IV ALTA';
          ivColor = C.red;
          ivGlow = true;
        } else if (ratio != null && ratio <= 0.7) {
          ivLabel = 'IV BAIXA';
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
              {'IV: ' + iv.toFixed(0) + '%'}
            </Text>
            {ivLabel ? <Badge text={ivLabel} color={ivColor} /> : null}
            <TouchableOpacity onPress={function() { setInfoModal({ title: 'HV / IV', text: 'HV = volatilidade histórica 20d. IV = volatilidade implícita. IV > 130% HV = prêmio caro (venda favorecida). IV < 70% HV = prêmio barato (compra favorecida).' }); }}>
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
            <Text style={{ fontSize: 11, color: C.opcoes, fontFamily: F.mono, marginBottom: 6 }}>{op.ticker_opcao}</Text>
          ) : null}
          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginBottom: 4 }}>PRÊMIO RECOMPRA (R$)</Text>
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
          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginBottom: 4, marginTop: 10 }}>QUANTIDADE</Text>
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
            <Text style={{ fontSize: 10, color: C.red, fontFamily: F.body, marginTop: 2 }}>
              {qtyFechamentoVal > (op.quantidade || 0) ? 'Máximo: ' + (op.quantidade || 0) : 'Quantidade inválida'}
            </Text>
          ) : null}
          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginBottom: 4, marginTop: 10 }}>DATA DO ENCERRAMENTO</Text>
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
            <Text style={{ fontSize: 10, color: C.red, fontFamily: F.body, marginTop: 2 }}>Data inválida</Text>
          ) : null}
          {recompraVal > 0 && qtyFechamentoValid ? (function() {
            var recompraTotal = recompraVal * qtyFechamentoVal;
            var premTotalClose = (op.premio || 0) * qtyFechamentoVal;
            var closePLPct = premTotalClose > 0 ? (closePL / premTotalClose) * 100 : 0;
            return (
              <View style={{ marginTop: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>RECOMPRA TOTAL</Text>
                  <Text style={[{ fontSize: 13, fontWeight: '700', color: C.red, fontFamily: F.mono }, ps]}>
                    {'R$ ' + fmt(recompraTotal)}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>P&L DO ENCERRAMENTO</Text>
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
    text: 'Spot: preço atual do ativo no mercado.\n\nStrike: preço de exercício da opção. Quanto mais distante do spot, mais barata (OTM).\n\nPrêmio: valor da opção por unidade. Se você vende 100 opções a R$1,20, recebe R$120.\n\nIV (Volatilidade Implícita): expectativa do mercado sobre oscilação futura. IV alta = prêmios maiores = bom para vender.\n\nDTE: dias até o vencimento. Mais DTE = mais prêmio, mas mais risco de movimento.\n\nQtd: número total de opções (não contratos).',
  },
  {
    title: 'As Gregas',
    icon: 'analytics-outline',
    text: 'Delta (Δ): sensibilidade ao preço do ativo.\n• Delta 0.30: opção sobe R$0,30 se ativo subir R$1\n• Vendedor quer delta baixo (longe do strike)\n• PUT tem delta negativo\n\nGamma (Γ): velocidade de mudança do delta.\n• Gamma alto perto do strike e do vencimento\n• Risco para vendedores: delta muda rápido\n\nTheta (Θ): perda de valor por dia.\n• Favorece VENDEDORES (time decay a seu favor)\n• Acelera nos últimos 30 dias\n\nVega (ν): sensibilidade à volatilidade.\n• IV subindo = opção mais cara\n• Vendedor quer IV caindo após a venda',
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
    title: 'Cadeia de Opções',
    icon: 'grid-outline',
    text: 'A tabela mostra preços teóricos (Black-Scholes) para diferentes strikes:\n\n• Lado esquerdo: CALLs\n• Lado direito: PUTs\n• Centro: strike e distância % do spot\n\nITM (In The Money): opção com valor intrínseco. CALL ITM = spot > strike.\nATM (At The Money): strike ≈ spot.\nOTM (Out The Money): sem valor intrínseco. Mais barata.\n\nDelta ao lado de cada preço indica probabilidade de exercício.\n\nToque em qualquer CALL ou PUT para preencher o simulador automaticamente com aquele strike e preço.\n\nUse "+ Outro" para analisar tickers fora da sua carteira.',
  },
  {
    title: 'Indicadores Técnicos',
    icon: 'pulse-outline',
    text: 'HV 20d (Volatilidade Histórica):\nOscilação real do ativo nos últimos 20 dias. Compare com IV: se IV > HV, prêmios estão caros (bom para vender).\n\nRSI 14:\n• > 70: sobrecomprado (possível queda)\n• < 30: sobrevendido (possível alta)\n• 30-70: neutro\n\nBeta:\n• > 1.2: mais volátil que o mercado\n• < 0.8: mais defensivo\n• = 1: acompanha o mercado\n\nMax Drawdown:\nMaior queda do pico ao vale. Indica risco histórico máximo.\n\nSMA/EMA: médias móveis — suporte e resistência dinâmicos.\nATR: amplitude média diária — útil para definir stops.\nBB Width: largura das Bandas de Bollinger — baixa = baixa volatilidade (breakout próximo).',
  },
  {
    title: 'Estratégias Práticas',
    icon: 'rocket-outline',
    text: 'Venda Coberta (Covered Call):\nVocê TEM as ações e vende CALL OTM. Recebe prêmio como renda extra. Se exercido, vende as ações com lucro.\n\nCSP (Cash-Secured Put):\nVocê QUER comprar o ativo mais barato. Vende PUT OTM. Se exercido, compra com desconto (strike - prêmio).\n\nWheel Strategy:\n1. Vende PUT → se exercido, compra ações\n2. Com as ações, vende CALL → se exercido, vende\n3. Repete o ciclo recebendo prêmios\n\nDicas:\n• IV alta = prêmios maiores (melhor para vender)\n• DTE 21-45 dias: melhor relação theta/risco\n• Strikes OTM 5-10%: equilíbrio prêmio/segurança\n• Sempre cheque cobertura antes de vender',
  },
];

// ═══════════════════════════════════════
// AI ANALYSIS MODAL
// ═══════════════════════════════════════
function AiAnalysisModal(props) {
  var analysis = props.analysis;
  var onClose = props.onClose;

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
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button" accessibilityLabel="Fechar análise">
          <Ionicons name="close-circle-outline" size={28} color={C.sub} />
        </TouchableOpacity>
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
                <Text style={{ fontSize: 11, fontWeight: '700', color: sec.color, fontFamily: F.mono, letterSpacing: 0.8 }}>{sec.label}</Text>
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
          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, textAlign: 'center', lineHeight: 16 }}>
            Análise gerada por IA. Não constitui recomendação de investimento. Use como ferramenta educacional complementar à sua própria análise.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function SimuladorBS(props) {
  var ps = usePrivacyStyle();
  var simSelicRate = props.selicRate || 13.25;
  var setInfoModal = props.setInfoModal;
  var simParams = props.simParams;
  var positions = props.positions || [];
  var indicatorsMap = props.indicators || {};
  var onChainSelect = props.onChainSelect;
  var setTutStep = props.setTutStep;
  // Shared params (same underlying)
  var s3 = useState('34.30'); var spot = s3[0]; var setSpot = s3[1];
  var s6 = useState('35'); var ivInput = s6[0]; var setIvInput = s6[1];
  var s7 = useState('21'); var dte = s7[0]; var setDte = s7[1];

  // Multi-leg state
  var _legs = useState([{ id: 1, tipo: 'CALL', direcao: 'venda', strike: '36.00', premio: '1.20', qty: '100' }]);
  var legs = _legs[0]; var setLegs = _legs[1];
  var _activeLeg = useState(0); var activeLeg = _activeLeg[0]; var setActiveLeg = _activeLeg[1];
  var _nextLegId = useState(2); var nextLegId = _nextLegId[0]; var setNextLegId = _nextLegId[1];

  // Active leg shorthand
  var curLeg = legs[activeLeg] || legs[0];
  var tipo = curLeg.tipo || 'CALL';
  var direcao = curLeg.direcao || 'venda';
  var strike = curLeg.strike || '';
  var premio = curLeg.premio || '';
  var qty = curLeg.qty || '100';

  // Leg helpers
  function updateLeg(idx, field, val) {
    var newLegs = [];
    for (var ul = 0; ul < legs.length; ul++) {
      if (ul === idx) {
        var copy = {};
        var kk = Object.keys(legs[ul]);
        for (var ki = 0; ki < kk.length; ki++) { copy[kk[ki]] = legs[ul][kk[ki]]; }
        copy[field] = val;
        newLegs.push(copy);
      } else {
        newLegs.push(legs[ul]);
      }
    }
    setLegs(newLegs);
  }

  function addLeg(params) {
    var newLeg = {
      id: nextLegId,
      tipo: (params && params.tipo) || 'CALL',
      direcao: (params && params.direcao) || 'venda',
      strike: (params && params.strike) || '',
      premio: (params && params.premio) || '',
      qty: (params && params.qty) || '100',
    };
    setNextLegId(nextLegId + 1);
    var newLegs = legs.concat([newLeg]);
    setLegs(newLegs);
    setActiveLeg(newLegs.length - 1);
  }

  function removeLeg(idx) {
    if (legs.length <= 1) return;
    var newLegs = [];
    for (var rl = 0; rl < legs.length; rl++) {
      if (rl !== idx) newLegs.push(legs[rl]);
    }
    setLegs(newLegs);
    if (activeLeg >= newLegs.length) { setActiveLeg(newLegs.length - 1); }
    else if (activeLeg > idx) { setActiveLeg(activeLeg - 1); }
  }

  // AI Analysis states
  var _aiAnalysis = useState(null); var aiAnalysis = _aiAnalysis[0]; var setAiAnalysis = _aiAnalysis[1];
  var _aiLoading = useState(false); var aiLoading = _aiLoading[0]; var setAiLoading = _aiLoading[1];
  var _aiError = useState(null); var aiError = _aiError[0]; var setAiError = _aiError[1];
  var _aiModalOpen = useState(false); var aiModalOpen = _aiModalOpen[0]; var setAiModalOpen = _aiModalOpen[1];
  var _aiObj = useState('renda'); var aiObjetivo = _aiObj[0]; var setAiObjetivo = _aiObj[1];
  var _aiCapital = useState(''); var aiCapital = _aiCapital[0]; var setAiCapital = _aiCapital[1];

  // Apply params from chain tap
  React.useEffect(function() {
    if (!simParams) return;
    // Shared params always update
    if (simParams.spot) setSpot(simParams.spot);
    if (simParams.iv) setIvInput(simParams.iv);
    if (simParams.dte) setDte(simParams.dte);

    if (simParams.addAsLeg) {
      // Add as new leg (from chain or preset)
      addLeg({
        tipo: simParams.tipo || 'CALL',
        direcao: simParams.direcao || 'venda',
        strike: simParams.strike || '',
        premio: simParams.premio || '',
        qty: simParams.qty || '100',
      });
    } else {
      // Replace first leg (single-leg compat)
      var newLeg = {
        id: legs[0] ? legs[0].id : 1,
        tipo: simParams.tipo || legs[0].tipo || 'CALL',
        direcao: simParams.direcao || legs[0].direcao || 'venda',
        strike: simParams.strike || legs[0].strike || '',
        premio: simParams.premio || legs[0].premio || '',
        qty: legs[0].qty || '100',
      };
      setLegs([newLeg]);
      setActiveLeg(0);
    }
  }, [simParams]);

  var sVal = parseFloat(spot) || 0;
  var dVal = parseInt(dte) || 0;
  var t = dVal / 365;
  var r = simSelicRate / 100;
  var baseSigma = parseFloat(ivInput) / 100 || 0.30;

  // Active leg parsed values (for single-leg display compat)
  var kVal = parseFloat(strike) || 0;
  var pVal = parseFloat(premio) || 0;
  var qVal = parseInt(qty) || 0;
  var tipoLower = tipo.toLowerCase();

  // Per-leg IV: compute from premium if available, else use base IV
  function legIV(leg) {
    var lTipo = (leg.tipo || 'CALL').toLowerCase();
    var lStrike = parseFloat(leg.strike) || 0;
    var lPremio = parseFloat(leg.premio) || 0;
    if (lPremio > 0 && sVal > 0 && lStrike > 0 && t > 0) {
      return bsIV(sVal, lStrike, t, r, lPremio, lTipo);
    }
    return baseSigma;
  }

  // Active leg sigma (for IV display)
  var sigma = legIV(curLeg);

  // Aggregated greeks across all legs
  var netDelta = 0, netGamma = 0, netTheta = 0, netVega = 0;
  var netPremio = 0; // positive = net credit, negative = net debit
  var netBsTheo = 0;
  var totalQty = 0;

  for (var li = 0; li < legs.length; li++) {
    var leg = legs[li];
    var lTipo = (leg.tipo || 'CALL').toLowerCase();
    var lStrike = parseFloat(leg.strike) || 0;
    var lPremio = parseFloat(leg.premio) || 0;
    var lQty = parseInt(leg.qty) || 0;
    var lSign = (leg.direcao === 'venda' || leg.direcao === 'lancamento') ? -1 : 1;
    var lSigma = legIV(leg);

    totalQty += lQty;
    // venda receives premium (+), compra pays (-)
    netPremio += lPremio * lQty * (-lSign);

    if (sVal > 0 && lStrike > 0 && t > 0) {
      var lGreeks = bsGreeks(sVal, lStrike, t, r, lSigma, lTipo);
      netDelta += lGreeks.delta * lQty * lSign;
      netGamma += lGreeks.gamma * lQty * lSign;
      netTheta += lGreeks.theta * lQty * lSign;
      netVega += lGreeks.vega * lQty * lSign;
      netBsTheo += bsPrice(sVal, lStrike, t, r, lSigma, lTipo) * lQty * (-lSign);
    }
  }

  // Active leg greeks (for single-leg compat display)
  var greeks = (sVal > 0 && kVal > 0 && t > 0)
    ? bsGreeks(sVal, kVal, t, r, sigma, tipoLower)
    : { delta: 0, gamma: 0, theta: 0, vega: 0 };
  var bsTheoPrice = (sVal > 0 && kVal > 0 && t > 0)
    ? bsPrice(sVal, kVal, t, r, sigma, tipoLower)
    : 0;

  var isMultiLeg = legs.length > 1;
  var premioTotal = isMultiLeg ? netPremio : pVal * qVal;
  var contratos = Math.floor(totalQty / 100);

  // What-If scenarios with proper BS (multi-leg)
  var scenarios = [
    { label: '+5%', pctMove: 0.05 },
    { label: '-5%', pctMove: -0.05 },
    { label: '+10%', pctMove: 0.10 },
    { label: '-10%', pctMove: -0.10 },
  ];

  function calcScenarioResult(pctMove) {
    var newSpot = sVal * (1 + pctMove);
    var newT = Math.max(0.001, (dVal - 5) / 365);
    var totalPL = 0;
    for (var si = 0; si < legs.length; si++) {
      var sLeg = legs[si];
      var sLTipo = (sLeg.tipo || 'CALL').toLowerCase();
      var sLStrike = parseFloat(sLeg.strike) || 0;
      var sLPremio = parseFloat(sLeg.premio) || 0;
      var sLQty = parseInt(sLeg.qty) || 0;
      var sLSigma = legIV(sLeg);
      var sLSign = (sLeg.direcao === 'venda' || sLeg.direcao === 'lancamento') ? -1 : 1;
      var newPrice = bsPrice(newSpot, sLStrike, newT, r, sLSigma, sLTipo);
      // venda: (premium - newPrice) * qty; compra: (newPrice - premium) * qty
      totalPL += (sLPremio - newPrice) * sLQty * (-sLSign);
    }
    return totalPL;
  }

  // Format greek value adaptively
  function fmtGreek(val) {
    var abs = Math.abs(val);
    if (abs >= 100) return val.toFixed(0);
    if (abs >= 10) return val.toFixed(1);
    if (abs >= 1) return val.toFixed(2);
    if (abs >= 0.01) return val.toFixed(3);
    return val.toFixed(4);
  }

  // Strategy presets
  function applyPreset(key) {
    if (sVal <= 0) return;
    var step;
    if (sVal < 20) { step = 1; }
    else if (sVal <= 50) { step = 2; }
    else { step = 5; }

    var atm = Math.round(sVal / step) * step;
    var newLegs = [];
    var nid = nextLegId;

    function mkLeg(tp, dir, sk, q) {
      var p = (t > 0) ? bsPrice(sVal, sk, t, r, baseSigma, tp.toLowerCase()) : 0;
      var lg = { id: nid, tipo: tp, direcao: dir, strike: sk.toFixed(2), premio: p.toFixed(2), qty: String(q || 100) };
      nid = nid + 1;
      return lg;
    }

    if (key === 'credit_call') {
      // Bear Call Spread: sell call near ATM, buy call OTM
      newLegs.push(mkLeg('CALL', 'venda', atm + step, 100));
      newLegs.push(mkLeg('CALL', 'compra', atm + step * 2, 100));
    } else if (key === 'credit_put') {
      // Bull Put Spread: sell put near ATM, buy put OTM
      newLegs.push(mkLeg('PUT', 'venda', atm - step, 100));
      newLegs.push(mkLeg('PUT', 'compra', atm - step * 2, 100));
    } else if (key === 'iron_condor') {
      // Short Iron Condor: sell put + sell call near ATM, buy wings
      newLegs.push(mkLeg('PUT', 'venda', atm - step, 100));
      newLegs.push(mkLeg('PUT', 'compra', atm - step * 2, 100));
      newLegs.push(mkLeg('CALL', 'venda', atm + step, 100));
      newLegs.push(mkLeg('CALL', 'compra', atm + step * 2, 100));
    } else if (key === 'straddle') {
      // Short Straddle: sell call + put at ATM
      newLegs.push(mkLeg('CALL', 'venda', atm, 100));
      newLegs.push(mkLeg('PUT', 'venda', atm, 100));
    } else if (key === 'strangle') {
      // Short Strangle: sell OTM call + OTM put
      newLegs.push(mkLeg('CALL', 'venda', atm + step, 100));
      newLegs.push(mkLeg('PUT', 'venda', atm - step, 100));
    } else if (key === 'butterfly') {
      // Long Call Butterfly: buy 1 lower, sell 2 middle, buy 1 upper
      newLegs.push(mkLeg('CALL', 'compra', atm - step, 100));
      newLegs.push(mkLeg('CALL', 'venda', atm, 200));
      newLegs.push(mkLeg('CALL', 'compra', atm + step, 100));
    }

    if (newLegs.length > 0) {
      setLegs(newLegs);
      setNextLegId(nid);
      setActiveLeg(0);
    }
  }

  function handleAiAnalysis() {
    if (aiLoading) return;
    if (sVal <= 0 || kVal <= 0) return;

    // Find matching position for context
    // Priority: 1) ticker from simParams, 2) match by spot price, 3) none
    var basePos = null;
    if (simParams && simParams.ticker) {
      for (var pi = 0; pi < positions.length; pi++) {
        if (positions[pi].ticker && positions[pi].ticker.toUpperCase() === simParams.ticker.toUpperCase()) {
          basePos = positions[pi];
          break;
        }
      }
    }
    if (!basePos) {
      // Try to match by spot price (closest match within 1%)
      var bestDiff = Infinity;
      for (var pi2 = 0; pi2 < positions.length; pi2++) {
        var posPrice = positions[pi2].preco_atual || positions[pi2].pm || 0;
        if (posPrice > 0) {
          var diff = Math.abs(posPrice - sVal) / posPrice;
          if (diff < 0.01 && diff < bestDiff) {
            bestDiff = diff;
            basePos = positions[pi2];
          }
        }
      }
    }

    // Find matching indicators
    var tickerInd = null;
    if (basePos && basePos.ticker && indicatorsMap) {
      tickerInd = indicatorsMap[basePos.ticker.toUpperCase()] || null;
    }

    // Build portfolio summary for context
    var portfolioSummary = [];
    var portfolioTotal = 0;
    for (var psi = 0; psi < positions.length; psi++) {
      var pos = positions[psi];
      var posVal = (pos.preco_atual || pos.pm || 0) * (pos.quantidade || 0);
      portfolioTotal += posVal;
      if (pos.ticker) {
        portfolioSummary.push({
          ticker: pos.ticker,
          qty: pos.quantidade || 0,
          valor: Math.round(posVal),
        });
      }
    }

    // Build scenarios results
    var scenarioResults = [];
    for (var si = 0; si < scenarios.length; si++) {
      scenarioResults.push({
        label: scenarios[si].label,
        result: calcScenarioResult(scenarios[si].pctMove),
      });
    }

    // Build legs array for AI
    var aiLegs = [];
    for (var ali = 0; ali < legs.length; ali++) {
      var aiLeg = legs[ali];
      aiLegs.push({
        tipo: aiLeg.tipo || 'CALL',
        direcao: aiLeg.direcao || 'venda',
        strike: parseFloat(aiLeg.strike) || 0,
        premio: parseFloat(aiLeg.premio) || 0,
        qty: parseInt(aiLeg.qty) || 0,
      });
    }

    var data = {
      tipo: tipo,
      direcao: direcao,
      objetivo: aiObjetivo,
      spot: sVal,
      strike: kVal,
      premio: pVal,
      iv: sigma * 100,
      dte: dVal,
      qty: qVal,
      legs: aiLegs,
      greeks: {
        delta: netDelta,
        gamma: netGamma,
        theta: netTheta,
        vega: netVega,
      },
      netPremio: netPremio,
      premioTotal: premioTotal,
      bsTheoPrice: isMultiLeg ? netBsTheo : bsTheoPrice,
      scenarios: scenarioResults,
      selicRate: simSelicRate,
      indicators: tickerInd,
      position: basePos ? {
        ticker: basePos.ticker,
        quantidade: basePos.quantidade,
        pm: basePos.pm,
        preco_atual: basePos.preco_atual,
      } : null,
      capital: aiCapital ? parseFloat(aiCapital.replace(/\./g, '').replace(',', '.')) : null,
      portfolio: portfolioSummary.length > 0 ? { ativos: portfolioSummary, total: Math.round(portfolioTotal) } : null,
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

  function renderField(label, val, setter, suffix) {
    return (
      <View style={styles.simField}>
        <Text style={styles.simFieldLabel}>{label}</Text>
        <View style={styles.simFieldInput}>
          <TextInput value={val} onChangeText={setter} keyboardType="numeric"
            style={styles.simFieldText} placeholderTextColor={C.dim} />
          {suffix ? <Text style={styles.simFieldSuffix}>{suffix}</Text> : null}
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: SIZE.gap }}>
      {/* Tutorial button */}
      <TouchableOpacity activeOpacity={0.7} onPress={function() { setTutStep(0); }}
        accessibilityRole="button" accessibilityLabel="Tutorial do simulador"
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
          paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10,
          backgroundColor: C.opcoes + '12', borderWidth: 1, borderColor: C.opcoes + '30',
        }}>
        <Ionicons name="school-outline" size={16} color={C.opcoes} />
        <Text style={{ fontSize: 13, fontWeight: '700', color: C.opcoes, fontFamily: F.display }}>Como Simular e Analisar</Text>
      </TouchableOpacity>

      {/* Leg Cards */}
      {legs.length > 0 ? (
        <View style={{ gap: 6 }}>
          {legs.map(function(lg, idx) {
            var isActive = idx === activeLeg;
            var lgTipo = lg.tipo || 'CALL';
            var lgDir = lg.direcao || 'venda';
            var lgStrike = lg.strike || '—';
            var lgPremio = lg.premio || '—';
            var lgQty = lg.qty || '100';
            return (
              <TouchableOpacity key={lg.id} activeOpacity={0.7}
                onPress={function() { setActiveLeg(idx); }}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10,
                  backgroundColor: isActive ? C.opcoes + '15' : 'rgba(255,255,255,0.03)',
                  borderWidth: 1.5, borderColor: isActive ? C.opcoes : C.border,
                }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: C.dim, fontFamily: F.mono, width: 18 }}>{'#' + (idx + 1)}</Text>
                <Badge text={lgTipo} color={lgTipo === 'CALL' ? C.green : C.red} />
                <Badge text={lgDir === 'venda' ? 'V' : 'C'} color={lgDir === 'venda' ? C.etfs : C.rf} />
                <Text style={{ fontSize: 12, color: C.text, fontFamily: F.mono, flex: 1 }}>
                  {'K ' + lgStrike + ' | P ' + lgPremio + ' | x' + lgQty}
                </Text>
                {legs.length > 1 ? (
                  <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    onPress={function() { removeLeg(idx); }}>
                    <Ionicons name="close-circle" size={18} color={C.red + '80'} />
                  </TouchableOpacity>
                ) : null}
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity activeOpacity={0.7}
            onPress={function() { addLeg({ tipo: 'CALL', direcao: 'venda' }); }}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              paddingVertical: 8, borderRadius: 10,
              backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: C.border, borderStyle: 'dashed',
            }}>
            <Ionicons name="add-circle-outline" size={16} color={C.opcoes} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: C.opcoes, fontFamily: F.body }}>Adicionar Perna</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Strategy Presets */}
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, fontWeight: '600' }}>ESTRATÉGIAS PRONTAS</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -4 }}
          contentContainerStyle={{ paddingHorizontal: 4, gap: 6 }}>
          {[
            { key: 'credit_call', label: 'Credit Call' },
            { key: 'credit_put', label: 'Credit Put' },
            { key: 'iron_condor', label: 'Iron Condor' },
            { key: 'straddle', label: 'Straddle' },
            { key: 'strangle', label: 'Strangle' },
            { key: 'butterfly', label: 'Butterfly' },
          ].map(function(preset) {
            return (
              <TouchableOpacity key={preset.key} activeOpacity={0.7}
                onPress={function() { applyPreset(preset.key); }}
                style={{
                  paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8,
                  backgroundColor: C.accent + '12', borderWidth: 1, borderColor: C.accent + '30',
                }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: C.accent, fontFamily: F.body }}>{preset.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Tipo + Direcao (edits active leg) */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
          {['CALL', 'PUT'].map(function(tp) {
            return <Pill key={tp} active={tipo === tp} color={tp === 'CALL' ? C.green : C.red} onPress={function() { updateLeg(activeLeg, 'tipo', tp); }}>{tp}</Pill>;
          })}
        </View>
        <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
          <Pill active={direcao === 'venda'} color={C.accent} onPress={function() { updateLeg(activeLeg, 'direcao', 'venda'); }}>Venda</Pill>
          <Pill active={direcao === 'compra'} color={C.accent} onPress={function() { updateLeg(activeLeg, 'direcao', 'compra'); }}>Compra</Pill>
        </View>
      </View>

      {/* Inputs */}
      <Glass padding={14}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono, letterSpacing: 1.2, fontWeight: '600' }}>PARÂMETROS</Text>
          <TouchableOpacity hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            onPress={function() { setInfoModal({ title: 'Parâmetros da Simulação', text: 'Spot: preço atual do ativo-objeto no mercado.\n\nStrike: preço de exercício da opção.\n\nPrêmio: valor pago (compra) ou recebido (venda) por opção.\n\nIV: volatilidade implícita — quanto o mercado espera que o ativo oscile. Maior IV = opção mais cara.\n\nDTE: dias até o vencimento. Quanto menor, mais rápido o theta come o prêmio.\n\nQtd: número total de opções (100 opções = 1 contrato).' }); }}>
            <Ionicons name="information-circle-outline" size={14} color={C.accent} />
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {renderField('Spot', spot, setSpot, 'R$')}
          {renderField('Strike', strike, function(v) { updateLeg(activeLeg, 'strike', v); }, 'R$')}
          {renderField('Prêmio', premio, function(v) { updateLeg(activeLeg, 'premio', v); }, 'R$')}
          {renderField('IV', ivInput, setIvInput, '%')}
          {renderField('DTE', dte, setDte, 'dias')}
          {renderField('Qtd', qty, function(v) { updateLeg(activeLeg, 'qty', v); })}
        </View>
      </Glass>

      {/* Gregas */}
      <Glass glow={C.opcoes} padding={14}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: '600' }}>GREGAS (BLACK-SCHOLES)</Text>
          <TouchableOpacity hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            onPress={function() { setInfoModal({ title: 'Gregas (Black-Scholes)', text: 'Delta: quanto o preço da opção muda para cada R$1 do ativo. Delta 0.30 = opção sobe R$0.30 se ativo subir R$1.\n\nGamma: aceleração do delta. Gamma alto perto do strike e vencimento.\n\nTheta: perda de valor por dia (time decay). Favorece vendedores.\n\nVega: sensibilidade à volatilidade. Se IV subir 1%, preço da opção sobe ~Vega reais.' }); }}>
            <Ionicons name="information-circle-outline" size={14} color={C.accent} />
          </TouchableOpacity>
        </View>
        {isMultiLeg ? (
          <Text style={{ fontSize: 10, color: C.opcoes, fontFamily: F.mono, textAlign: 'center', marginBottom: 4 }}>
            {'Posição líquida (' + legs.length + ' pernas)'}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 8 }}>
          {[
            { l: 'Delta', v: fmtGreek(isMultiLeg ? netDelta : greeks.delta), c: Math.abs(isMultiLeg ? netDelta : greeks.delta) > (isMultiLeg ? 10 : 0.5) ? C.green : C.sub },
            { l: 'Gamma', v: fmtGreek(isMultiLeg ? netGamma : greeks.gamma), c: C.sub },
            { l: 'Theta', v: fmtGreek(isMultiLeg ? netTheta : greeks.theta), c: (isMultiLeg ? netTheta : greeks.theta) > 0 ? C.green : C.red },
            { l: 'Vega', v: fmtGreek(isMultiLeg ? netVega : greeks.vega), c: C.acoes },
          ].map(function(g, i) {
            return (
              <View key={i} style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>{g.l}</Text>
                <Text style={[{ fontSize: 18, fontWeight: '800', color: g.c, fontFamily: F.display }, ps]}>{g.v}</Text>
              </View>
            );
          })}
        </View>
        {/* IV + BS Price */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 10, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8 }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>IV IMPLÍCITA</Text>
            <Text style={[{ fontSize: 14, fontWeight: '700', color: C.opcoes, fontFamily: F.mono }, ps]}>{(sigma * 100).toFixed(1)}%</Text>
          </View>
          {isMultiLeg ? (
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>{netPremio >= 0 ? 'CRÉDITO LÍQ.' : 'DÉBITO LÍQ.'}</Text>
              <Text style={[{ fontSize: 14, fontWeight: '700', color: netPremio >= 0 ? C.green : C.red, fontFamily: F.mono }, ps]}>{'R$ ' + fmt(Math.abs(netPremio))}</Text>
            </View>
          ) : (
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>PREÇO BS</Text>
              <Text style={[{ fontSize: 14, fontWeight: '700', color: C.text, fontFamily: F.mono }, ps]}>{'R$ ' + fmt(bsTheoPrice)}</Text>
            </View>
          )}
          {isMultiLeg ? (
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>THETA/DIA</Text>
              <Text style={[{ fontSize: 14, fontWeight: '700', color: netTheta > 0 ? C.green : C.red, fontFamily: F.mono }, ps]}>{'R$ ' + fmt(netTheta)}</Text>
            </View>
          ) : (
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>MERCADO</Text>
              <Text style={[{ fontSize: 14, fontWeight: '700', color: bsTheoPrice > pVal ? C.green : C.red, fontFamily: F.mono }, ps]}>{'R$ ' + fmt(pVal)}</Text>
            </View>
          )}
        </View>
      </Glass>

      {/* Payoff Chart */}
      {sVal > 0 && kVal > 0 && pVal > 0 ? (
        <Glass padding={14}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <SectionLabel>PAYOFF NO VENCIMENTO</SectionLabel>
            <TouchableOpacity hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={function() { setInfoModal({ title: 'Gráfico de Payoff', text: isMultiLeg
                ? 'Mostra o lucro ou prejuízo combinado de todas as pernas no vencimento.\n\nÁrea verde = faixa de lucro\nÁrea vermelha = faixa de prejuízo\nLinhas tracejadas = breakevens (equilíbrios)\nLinha pontilhada = spot (preço atual)\n\nToque no gráfico e arraste para ver o P&L exato em cada ponto.'
                : 'Mostra o lucro ou prejuízo no vencimento para cada preço possível do ativo.\n\nÁrea verde = faixa de lucro\nÁrea vermelha = faixa de prejuízo\nLinha tracejada = breakeven (equilíbrio)\nLinha pontilhada = spot (preço atual)\n\nToque no gráfico e arraste para ver o P&L exato em cada ponto.\n\nVenda de CALL: lucro máximo limitado ao prêmio, risco ilimitado acima do strike + prêmio.\nVenda de PUT (CSP): lucro = prêmio, risco = strike ir a zero.\nCompra: prejuízo máximo = prêmio pago.' }); }}>
              <Ionicons name="information-circle-outline" size={14} color={C.accent} />
            </TouchableOpacity>
          </View>
          <Sensitive>
          <View style={{ marginTop: 8 }}>
            <PayoffChart
              legs={legs}
              tipo={tipoLower}
              direcao={direcao}
              strike={kVal}
              premio={pVal}
              quantidade={qVal}
              spotPrice={sVal}
            />
          </View>
          </Sensitive>
        </Glass>
      ) : null}

      {/* Resumo */}
      <Glass padding={14}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <SectionLabel>RESUMO</SectionLabel>
          <TouchableOpacity hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            onPress={function() { setInfoModal({ title: 'Resumo da Simulação', text: isMultiLeg
              ? 'Crédito/Débito líquido: soma dos prêmios de todas as pernas (venda = crédito, compra = débito).\n\nTheta/dia: ganho (positivo) ou perda (negativo) diário pelo time decay da posição combinada.\n\nContratos: total de opções em todas as pernas.'
              : 'Prêmio total: valor total recebido (venda) ou pago (compra) = prêmio x quantidade.\n\nTheta/dia: quanto você ganha (venda) ou perde (compra) por dia pelo time decay.\n\nBreakeven: preço do ativo onde você não ganha nem perde no vencimento.\n\nContratos: cada contrato = 100 opções na B3.' }); }}>
            <Ionicons name="information-circle-outline" size={14} color={C.accent} />
          </TouchableOpacity>
        </View>
        <View style={{ gap: 6, marginTop: 6 }}>
          {isMultiLeg ? (
            [
              { l: netPremio >= 0 ? 'Crédito líquido' : 'Débito líquido', v: 'R$ ' + fmt(Math.abs(netPremio)), c: netPremio >= 0 ? C.green : C.red },
              { l: 'Theta/dia', v: 'R$ ' + fmt(netTheta), c: netTheta > 0 ? C.green : C.red },
              { l: 'Pernas', v: legs.length + ' pernas', c: C.text },
              { l: 'Total opções', v: totalQty + ' (' + contratos + ' contratos)', c: C.text },
            ].map(function(rr, i) {
              return (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                  <Text style={{ fontSize: 13, color: C.sub, fontFamily: F.body }}>{rr.l}</Text>
                  <Text style={[{ fontSize: 14, fontWeight: '600', color: rr.c || C.text, fontFamily: F.mono }, ps]}>{rr.v}</Text>
                </View>
              );
            })
          ) : (
            [
              { l: 'Prêmio total', v: 'R$ ' + fmt(premioTotal) },
              { l: 'Theta/dia', v: 'R$ ' + fmt(greeks.theta * qVal) },
              { l: 'Breakeven', v: 'R$ ' + fmt(tipoLower === 'call' ? kVal + pVal : kVal - pVal) },
              { l: 'Contratos', v: contratos + ' (' + qVal + ' opções)' },
            ].map(function(rr, i) {
              return (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                  <Text style={{ fontSize: 13, color: C.sub, fontFamily: F.body }}>{rr.l}</Text>
                  <Text style={[{ fontSize: 14, fontWeight: '600', color: C.text, fontFamily: F.mono }, ps]}>{rr.v}</Text>
                </View>
              );
            })
          )}
        </View>
      </Glass>

      {/* What-If Scenarios */}
      <Glass glow={C.etfs} padding={14}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <SectionLabel>CENÁRIOS WHAT-IF</SectionLabel>
          <TouchableOpacity hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            onPress={function() { setInfoModal({ title: 'Cenários What-If', text: 'Simula o resultado da operação se o ativo subir ou cair 5% ou 10%.\n\nO cálculo usa Black-Scholes com o novo preço do ativo e DTE reduzido em 5 dias (simulando passagem de tempo).\n\nValor positivo (verde) = lucro no cenário.\nValor negativo (vermelho) = prejuízo no cenário.\n\nUse para avaliar o risco/retorno antes de abrir a operação.' }); }}>
            <Ionicons name="information-circle-outline" size={14} color={C.accent} />
          </TouchableOpacity>
        </View>
        <View style={{ gap: 6, marginTop: 8 }}>
          {scenarios.map(function(sc, i) {
            var result = calcScenarioResult(sc.pctMove);
            var isPos = result >= 0;
            var scColor = isPos ? C.green : C.red;
            return (
              <View key={i} style={{
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                padding: 10, borderRadius: 8,
                backgroundColor: scColor + '06', borderWidth: 1, borderColor: scColor + '14',
              }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: C.text, fontFamily: F.display }}>
                  {'Ativo ' + sc.label}
                </Text>
                <Text style={[{ fontSize: 13, fontWeight: '700', color: scColor, fontFamily: F.mono }, ps]}>
                  {isPos ? '+' : ''}R$ {fmt(Math.abs(result))}
                </Text>
              </View>
            );
          })}
        </View>
      </Glass>

      {/* AI Objective + Button */}
      <Glass padding={14}>
        <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.mono, letterSpacing: 0.8, fontWeight: '600', marginBottom: 8 }}>OBJETIVO DA ANÁLISE</Text>
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
          <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.mono, letterSpacing: 0.8, fontWeight: '600' }}>CAPITAL</Text>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 8, borderWidth: 1, borderColor: C.border, paddingHorizontal: 10, height: 36 }}>
            <Text style={{ fontSize: 12, color: C.dim, fontFamily: F.mono, marginRight: 4 }}>R$</Text>
            <TextInput
              value={aiCapital}
              onChangeText={setAiCapital}
              keyboardType="numeric"
              placeholder="opcional"
              placeholderTextColor={C.dim}
              style={{ flex: 1, fontSize: 13, color: C.text, fontFamily: F.mono, padding: 0 }}
            />
          </View>
          <InfoTip text="Informe seu capital disponível para opções. A IA avaliará se o tamanho da posição é adequado e sugerirá sizing." size={13} />
        </View>
      </Glass>

      <TouchableOpacity
        activeOpacity={0.7}
        disabled={aiLoading || sVal <= 0 || kVal <= 0}
        onPress={handleAiAnalysis}
        accessibilityRole="button"
        accessibilityLabel="Analisar operação com inteligência artificial"
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          gap: 8, paddingVertical: 14, borderRadius: SIZE.radius,
          backgroundColor: C.accent + '18', borderWidth: 1, borderColor: C.accent + '40',
          opacity: (aiLoading || sVal <= 0 || kVal <= 0) ? 0.5 : 1,
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

      {/* AI Error */}
      {aiError ? (
        <View style={{ padding: 10, borderRadius: 10, backgroundColor: C.red + '10', borderWidth: 1, borderColor: C.red + '25' }}>
          <Text style={{ fontSize: 12, color: C.red, fontFamily: F.body, textAlign: 'center' }}>{aiError}</Text>
        </View>
      ) : null}

      {/* AI Analysis Modal */}
      <Modal visible={aiModalOpen} animationType="slide" transparent={false}
        onRequestClose={function() { setAiModalOpen(false); }}>
        <AiAnalysisModal analysis={aiAnalysis} onClose={function() { setAiModalOpen(false); }} />
      </Modal>

    </View>
  );
}

// ═══════════════════════════════════════
// CADEIA SINTETICA (BS)
// ═══════════════════════════════════════
function CadeiaSintetica(props) {
  var ps = usePrivacyStyle();
  var positions = props.positions || [];
  var indicatorsMap = props.indicators || {};
  var chainSelicRate = props.selicRate || 13.25;
  var onSelect = props.onSelect;

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

  // Default IV from HV 20d if available
  var defaultTicker = tickers.length > 0 ? tickers[0] : null;
  var defaultIV = '35';
  if (defaultTicker && indicatorsMap[defaultTicker] && indicatorsMap[defaultTicker].hv_20) {
    defaultIV = String(Math.round(indicatorsMap[defaultTicker].hv_20));
  }

  var _chainTicker = useState(defaultTicker);
  var chainTicker = _chainTicker[0]; var setChainTicker = _chainTicker[1];
  var _chainIV = useState(defaultIV);
  var chainIV = _chainIV[0]; var setChainIV = _chainIV[1];
  var _chainDTE = useState('21');
  var chainDTE = _chainDTE[0]; var setChainDTE = _chainDTE[1];
  var _customTicker = useState(''); var customTicker = _customTicker[0]; var setCustomTicker = _customTicker[1];
  var _customSpot = useState(''); var customSpot = _customSpot[0]; var setCustomSpot = _customSpot[1];
  var _showCustom = useState(false); var showCustom = _showCustom[0]; var setShowCustom = _showCustom[1];
  var _fetchingSpot = useState(false); var fetchingSpot = _fetchingSpot[0]; var setFetchingSpot = _fetchingSpot[1];
  var _addLegMode = useState(false); var addLegMode = _addLegMode[0]; var setAddLegMode = _addLegMode[1];

  // When ticker changes, update IV to that ticker's HV
  var handleTickerChange = function(tk) {
    setChainTicker(tk);
    setShowCustom(false);
    var newIV = '35';
    if (indicatorsMap[tk] && indicatorsMap[tk].hv_20) {
      newIV = String(Math.round(indicatorsMap[tk].hv_20));
    }
    setChainIV(newIV);
    // Notify simulator of new ticker/spot
    if (onSelect && tickerSpots[tk]) {
      onSelect({
        spot: tickerSpots[tk].toFixed(2),
        iv: newIV,
        ticker: tk,
      });
    }
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
    setChainIV('35');
    // Notify simulator of custom ticker/spot
    if (onSelect) {
      onSelect({
        spot: sp.toFixed(2),
        iv: '35',
        ticker: tk,
      });
    }
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

  var spot = tickerSpots[chainTicker] || 0;
  var ivVal = (parseFloat(chainIV) || 35) / 100;
  var dteVal = parseInt(chainDTE) || 21;
  var tYears = dteVal / 365;
  var r = chainSelicRate / 100;

  // Generate strikes
  var strikeStep;
  if (spot < 20) { strikeStep = 1; }
  else if (spot <= 50) { strikeStep = 2; }
  else { strikeStep = 5; }

  var centerStrike = Math.round(spot / strikeStep) * strikeStep;
  var strikes = [];
  for (var si = -5; si <= 5; si++) {
    strikes.push(centerStrike + si * strikeStep);
  }

  // Find ATM strike (closest to spot)
  var atmStrike = strikes[0];
  var atmDiff = Math.abs(strikes[0] - spot);
  for (var ai = 1; ai < strikes.length; ai++) {
    var d = Math.abs(strikes[ai] - spot);
    if (d < atmDiff) { atmDiff = d; atmStrike = strikes[ai]; }
  }

  function getSimpleMoneyness(tipo, strike, spotVal) {
    if (!spotVal || spotVal <= 0) return 'OTM';
    var diff = Math.abs(spotVal - strike) / strike * 100;
    if (diff < 1) return 'ATM';
    if (tipo === 'call') return spotVal > strike ? 'ITM' : 'OTM';
    return spotVal < strike ? 'ITM' : 'OTM';
  }

  return (
    <View style={{ gap: SIZE.gap }}>
      {/* Ticker selector */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {tickers.map(function(tk) {
          return (
            <Pill key={tk} active={chainTicker === tk && !showCustom} color={C.acoes}
              onPress={function() { handleTickerChange(tk); }}>
              {tk}
            </Pill>
          );
        })}
        <Pill active={showCustom} color={C.opcoes}
          onPress={function() { setShowCustom(true); setChainTicker(null); }}>
          + Outro
        </Pill>
      </View>

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

      {/* Spot display + HV badge */}
      {spot > 0 ? (
        <Glass padding={10}>
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>SPOT</Text>
            <Text style={[{ fontSize: 18, fontWeight: '800', color: C.text, fontFamily: F.display }, ps]}>
              {'R$ ' + fmt(spot)}
            </Text>
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

      {/* IV + DTE inputs */}
      <Glass padding={14}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.simFieldLabel}>IV (%)</Text>
            <View style={styles.simFieldInput}>
              <TextInput value={chainIV} onChangeText={setChainIV} keyboardType="numeric"
                style={styles.simFieldText} placeholderTextColor={C.dim} />
              <Text style={styles.simFieldSuffix}>%</Text>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.simFieldLabel}>DTE (dias)</Text>
            <View style={styles.simFieldInput}>
              <TextInput value={chainDTE} onChangeText={setChainDTE} keyboardType="numeric"
                style={styles.simFieldText} placeholderTextColor={C.dim} />
              <Text style={styles.simFieldSuffix}>dias</Text>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.simFieldLabel}>Taxa</Text>
            <View style={[styles.simFieldInput, { backgroundColor: 'rgba(255,255,255,0.01)' }]}>
              <Text style={[styles.simFieldText, { color: C.dim }]}>{chainSelicRate.toFixed(2)}</Text>
              <Text style={styles.simFieldSuffix}>%</Text>
            </View>
          </View>
        </View>
      </Glass>

      {/* Options chain grid */}
      <Glass padding={0}>
        {/* Header */}
        <View style={styles.chainHeader}>
          <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: C.green, fontFamily: F.mono }}>CALL</Text>
          </View>
          <View style={styles.chainStrike}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: C.accent, fontFamily: F.mono }}>STRIKE</Text>
          </View>
          <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: C.red, fontFamily: F.mono }}>PUT</Text>
          </View>
        </View>

        {/* Sub-header */}
        <View style={[styles.chainRow, { paddingVertical: 4 }]}>
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={styles.chainDelta}>Delta</Text>
            </View>
            <View style={{ flex: 1.2, alignItems: 'center' }}>
              <Text style={styles.chainDelta}>Preco</Text>
            </View>
            <View style={{ flex: 0.8, alignItems: 'center' }}>
              <Text style={styles.chainDelta}>Tipo</Text>
            </View>
          </View>
          <View style={styles.chainStrike}>
            <Text style={styles.chainDelta}>Dist%</Text>
          </View>
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <View style={{ flex: 0.8, alignItems: 'center' }}>
              <Text style={styles.chainDelta}>Tipo</Text>
            </View>
            <View style={{ flex: 1.2, alignItems: 'center' }}>
              <Text style={styles.chainDelta}>Preco</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={styles.chainDelta}>Delta</Text>
            </View>
          </View>
        </View>

        {/* Strike rows */}
        {strikes.map(function(sk, idx) {
          var isAtm = sk === atmStrike;
          var callPrice = spot > 0 && tYears > 0 ? bsPrice(spot, sk, tYears, r, ivVal, 'call') : 0;
          var putPrice = spot > 0 && tYears > 0 ? bsPrice(spot, sk, tYears, r, ivVal, 'put') : 0;
          var callGreeks = spot > 0 && tYears > 0 ? bsGreeks(spot, sk, tYears, r, ivVal, 'call') : { delta: 0 };
          var putGreeks = spot > 0 && tYears > 0 ? bsGreeks(spot, sk, tYears, r, ivVal, 'put') : { delta: 0 };
          var callMon = getSimpleMoneyness('call', sk, spot);
          var putMon = getSimpleMoneyness('put', sk, spot);

          var monColor = { ITM: C.green, ATM: C.yellow, OTM: C.dim };

          // Strike distance from spot
          var distPct = spot > 0 ? ((sk - spot) / spot * 100) : 0;
          var distStr = (distPct >= 0 ? '+' : '') + distPct.toFixed(1) + '%';
          var distColor = isAtm ? C.yellow : (Math.abs(distPct) <= 5 ? C.sub : C.dim);

          // Row background: ATM highlighted, ITM with subtle green/red tint
          var rowBg = isAtm ? styles.chainAtm
            : callMon === 'ITM' ? styles.chainItm
            : putMon === 'ITM' ? styles.chainItmPut
            : null;

          function handleChainTap(tipoTap, price) {
            if (onSelect && spot > 0) {
              onSelect({
                tipo: tipoTap.toUpperCase(),
                direcao: 'venda',
                spot: spot.toFixed(2),
                strike: sk.toFixed(2),
                premio: price.toFixed(2),
                iv: chainIV,
                dte: chainDTE,
                ticker: chainTicker || '',
                addAsLeg: addLegMode,
              });
            }
          }

          return (
            <View key={idx} style={[styles.chainRow, rowBg]}>
              {/* CALL side — tappable */}
              <TouchableOpacity activeOpacity={0.6} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                onPress={function() { handleChainTap('CALL', callPrice); }}>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={[styles.chainDelta, callMon === 'ITM' && { color: C.green, fontWeight: '700' }, ps]}>{callGreeks.delta.toFixed(2)}</Text>
                </View>
                <View style={{ flex: 1.2, alignItems: 'center' }}>
                  <Text style={[styles.chainPrice, callMon === 'ITM' && { color: C.green }, ps]}>{'R$ ' + fmt(callPrice)}</Text>
                </View>
                <View style={{ flex: 0.8, alignItems: 'center' }}>
                  <Badge text={callMon} color={monColor[callMon] || C.dim} />
                </View>
              </TouchableOpacity>

              {/* Strike center + distance */}
              <View style={styles.chainStrike}>
                <Text style={[{
                  fontSize: 13, fontWeight: '700', fontFamily: F.mono,
                  color: isAtm ? C.accent : C.text,
                }, ps]}>
                  {fmt(sk)}
                </Text>
                <Text style={{ fontSize: 8, color: distColor, fontFamily: F.mono, marginTop: 1 }}>
                  {isAtm ? 'ATM' : distStr}
                </Text>
              </View>

              {/* PUT side — tappable */}
              <TouchableOpacity activeOpacity={0.6} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                onPress={function() { handleChainTap('PUT', putPrice); }}>
                <View style={{ flex: 0.8, alignItems: 'center' }}>
                  <Badge text={putMon} color={monColor[putMon] || C.dim} />
                </View>
                <View style={{ flex: 1.2, alignItems: 'center' }}>
                  <Text style={[styles.chainPrice, putMon === 'ITM' && { color: C.red }, ps]}>{'R$ ' + fmt(putPrice)}</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={[styles.chainDelta, putMon === 'ITM' && { color: C.red, fontWeight: '700' }, ps]}>{putGreeks.delta.toFixed(2)}</Text>
                </View>
              </TouchableOpacity>
            </View>
          );
        })}
      </Glass>

      {/* Legend + Add as Leg toggle */}
      <View style={{ paddingHorizontal: 4, gap: 6 }}>
        <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono, textAlign: 'center' }}>
          {currentHV != null
            ? 'IV inicializado com HV 20d (' + currentHV.toFixed(0) + '%). Ajuste manualmente se necessário.'
            : 'Preços teóricos via Black-Scholes. IV e DTE ajustáveis.'}
        </Text>
        {onSelect ? (
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 11, color: C.opcoes, fontFamily: F.body, textAlign: 'center' }}>
              {addLegMode
                ? 'Toque para ADICIONAR perna ao simulador'
                : 'Toque em CALL ou PUT para simular'}
            </Text>
            <TouchableOpacity activeOpacity={0.7}
              onPress={function() { setAddLegMode(!addLegMode); }}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, alignSelf: 'center',
                backgroundColor: addLegMode ? C.opcoes + '20' : 'transparent',
                borderWidth: 1, borderColor: addLegMode ? C.opcoes : C.border,
              }}>
              <Ionicons name={addLegMode ? 'layers' : 'layers-outline'} size={14} color={addLegMode ? C.opcoes : C.dim} />
              <Text style={{ fontSize: 11, fontWeight: addLegMode ? '700' : '500', color: addLegMode ? C.opcoes : C.dim, fontFamily: F.body }}>
                {addLegMode ? 'Modo Multi-Perna ON' : 'Adicionar como perna'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
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
  var _simParams = useState(null); var simParams = _simParams[0]; var setSimParams = _simParams[1];
  var _recalculating = useState(false); var recalculating = _recalculating[0]; var setRecalculating = _recalculating[1];
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
    <View style={styles.container}>
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1 }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />
      }
    >
      {/* SUB TABS — topo da página */}
      <View style={styles.subTabs}>
        {[
          { k: 'ativas', l: 'Ativas (' + ativas.length + ')', c: C.opcoes },
          { k: 'pendentes', l: 'Pendentes (' + expired.length + ')', c: C.yellow },
          { k: 'sim', l: 'Simulador', c: C.opcoes },
          { k: 'ind', l: 'Indicadores', c: C.acoes },
          { k: 'hist', l: 'Histórico (' + historico.length + ')', c: C.opcoes },
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
              <Text style={{ fontSize: 11, color: C.opcoes, fontFamily: F.body, textAlign: 'center' }}>
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
                      <Text style={{ fontSize: 11, color: C.opcoes, fontFamily: F.mono, marginBottom: 4 }}>{expOp.ticker_opcao}</Text>
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
                        <Text style={{ fontSize: 11, fontWeight: '700', color: C.green, fontFamily: F.display }}>Virou Pó</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={function() { handleExercida(expOp); }}
                        style={{ flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: C.etfs + '40', backgroundColor: C.etfs + '08', alignItems: 'center' }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: '700', color: C.etfs, fontFamily: F.display }}>Foi exercida</Text>
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
                        <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 }}>{m.l}</Text>
                        <Text style={{ fontSize: 18, fontWeight: '800', color: m.c, fontFamily: F.display, marginTop: 2 }}>{m.v}</Text>
                      </View>
                    );
                  })}
                </View>
              </Glass>

              {/* BANNER: gregas usando PM */}
              {!pricesAvailable && positions.length > 0 ? (
                <View style={{ padding: 8, borderRadius: 8, backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.15)' }}>
                  <Text style={{ fontSize: 11, color: '#f59e0b', fontFamily: F.mono, textAlign: 'center' }}>
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
                              <Text style={{ fontSize: 10, color: C.opcoes, fontFamily: F.mono }}>{v.ticker_opcao}</Text>
                            ) : null}
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.mono }}>
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

      {/* SIMULADOR TAB (Cadeia + Simulador combinados) */}
      {sub === 'sim' && (
        <View style={{ gap: SIZE.gap }}>
          <SectionLabel>CADEIA DE OPÇÕES</SectionLabel>
          <CadeiaSintetica positions={positions} indicators={indicators} selicRate={selicRate}
            onSelect={function(params) { setSimParams(params); }} />
          <View style={{ height: 1, backgroundColor: C.border, marginVertical: 4 }} />
          <SectionLabel>SIMULADOR BLACK-SCHOLES</SectionLabel>
          <SimuladorBS selicRate={selicRate} setInfoModal={setInfoModal} simParams={simParams}
            positions={positions} indicators={indicators} setTutStep={setTutStep} />
        </View>
      )}

      {/* INDICADORES TAB */}
      {sub === 'ind' && (
        <View style={{ gap: SIZE.gap }}>
          {/* Tutorial shortcut — opens at Indicadores step */}
          <TouchableOpacity activeOpacity={0.7} onPress={function() { setTutStep(7); }}
            accessibilityRole="button" accessibilityLabel="Tutorial de indicadores"
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10,
              backgroundColor: C.acoes + '12', borderWidth: 1, borderColor: C.acoes + '30',
            }}>
            <Ionicons name="school-outline" size={16} color={C.acoes} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.acoes, fontFamily: F.display }}>Entender os Indicadores</Text>
          </TouchableOpacity>

          {/* Recalculate button */}
          <TouchableOpacity activeOpacity={0.7} disabled={recalculating}
            onPress={function() {
              if (!user) return;
              setRecalculating(true);
              runDailyCalculation(user.id).then(function(calcResult) {
                if (calcResult.data && calcResult.data.length > 0) {
                  var newMap = {};
                  var mapKeys = Object.keys(indicators);
                  for (var mk = 0; mk < mapKeys.length; mk++) {
                    newMap[mapKeys[mk]] = indicators[mapKeys[mk]];
                  }
                  for (var ci = 0; ci < calcResult.data.length; ci++) {
                    newMap[calcResult.data[ci].ticker] = calcResult.data[ci];
                  }
                  setIndicators(newMap);
                }
                setRecalculating(false);
              }).catch(function() { setRecalculating(false); });
            }}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              paddingVertical: 12, borderRadius: 10,
              backgroundColor: C.acoes + '12', borderWidth: 1, borderColor: C.acoes + '30',
            }}>
            {recalculating ? (
              <ActivityIndicator size="small" color={C.acoes} />
            ) : (
              <Ionicons name="refresh-outline" size={16} color={C.acoes} />
            )}
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.acoes, fontFamily: F.display }}>
              {recalculating ? 'Calculando...' : 'Recalcular Indicadores'}
            </Text>
          </TouchableOpacity>

          {/* Summary table */}
          {Object.keys(indicators).length === 0 ? (
            <Glass padding={24}>
              <EmptyState ionicon="analytics-outline" message="Nenhum indicador calculado ainda." hint="Toque em Recalcular para gerar." />
            </Glass>
          ) : (
            <>
              {/* Table header */}
              <Glass padding={0}>
                <View style={[styles.chainHeader, { paddingHorizontal: 8 }]}>
                  <View style={{ flex: 1.4 }}><Text style={{ fontSize: 10, fontWeight: '700', color: C.accent, fontFamily: F.mono }}>TICKER</Text></View>
                  <View style={{ flex: 1, alignItems: 'center' }}><Text style={{ fontSize: 10, fontWeight: '700', color: C.accent, fontFamily: F.mono }}>HV 20d</Text></View>
                  <View style={{ flex: 1, alignItems: 'center' }}><Text style={{ fontSize: 10, fontWeight: '700', color: C.accent, fontFamily: F.mono }}>RSI 14</Text></View>
                  <View style={{ flex: 1, alignItems: 'center' }}><Text style={{ fontSize: 10, fontWeight: '700', color: C.accent, fontFamily: F.mono }}>Beta</Text></View>
                  <View style={{ flex: 1, alignItems: 'center' }}><Text style={{ fontSize: 10, fontWeight: '700', color: C.accent, fontFamily: F.mono }}>Max DD</Text></View>
                </View>

                {/* Table rows */}
                {Object.keys(indicators).map(function(tk, ri) {
                  var ind = indicators[tk];
                  if (!ind) return null;
                  var hvVal = ind.hv_20 != null ? ind.hv_20.toFixed(0) + '%' : '-';
                  var rsiVal = ind.rsi_14 != null ? ind.rsi_14.toFixed(0) : '-';
                  var betaVal = ind.beta != null ? ind.beta.toFixed(2) : '-';
                  var ddVal = ind.max_drawdown != null ? ind.max_drawdown.toFixed(0) + '%' : '-';
                  var rsiColor = ind.rsi_14 != null ? (ind.rsi_14 > 70 ? C.red : ind.rsi_14 < 30 ? C.green : C.sub) : C.dim;
                  var betaColor = ind.beta != null ? (ind.beta > 1.2 ? C.red : ind.beta < 0.8 ? C.green : C.sub) : C.dim;
                  return (
                    <View key={tk} style={[styles.chainRow, { paddingHorizontal: 8 }, ri % 2 === 0 && { backgroundColor: 'rgba(255,255,255,0.015)' }]}>
                      <View style={{ flex: 1.4 }}><Text style={{ fontSize: 12, fontWeight: '600', color: C.text, fontFamily: F.display }}>{tk}</Text></View>
                      <View style={{ flex: 1, alignItems: 'center' }}><Text style={[{ fontSize: 12, color: C.sub, fontFamily: F.mono }, ps]}>{hvVal}</Text></View>
                      <View style={{ flex: 1, alignItems: 'center' }}><Text style={[{ fontSize: 12, color: rsiColor, fontFamily: F.mono, fontWeight: ind.rsi_14 != null && (ind.rsi_14 > 70 || ind.rsi_14 < 30) ? '700' : '400' }, ps]}>{rsiVal}</Text></View>
                      <View style={{ flex: 1, alignItems: 'center' }}><Text style={[{ fontSize: 12, color: betaColor, fontFamily: F.mono }, ps]}>{betaVal}</Text></View>
                      <View style={{ flex: 1, alignItems: 'center' }}><Text style={[{ fontSize: 12, color: C.red, fontFamily: F.mono }, ps]}>{ddVal}</Text></View>
                    </View>
                  );
                })}
              </Glass>

              {/* Detailed cards per ticker */}
              {Object.keys(indicators).map(function(tk) {
                var ind = indicators[tk];
                if (!ind) return null;
                var fields = [
                  { l: 'HV 20d', v: ind.hv_20 != null ? ind.hv_20.toFixed(1) + '%' : '-', c: C.opcoes },
                  { l: 'RSI 14', v: ind.rsi_14 != null ? ind.rsi_14.toFixed(1) : '-', c: ind.rsi_14 != null ? (ind.rsi_14 > 70 ? C.red : ind.rsi_14 < 30 ? C.green : C.sub) : C.dim },
                  { l: 'SMA 20', v: ind.sma_20 != null ? 'R$ ' + fmt(ind.sma_20) : '-', c: C.acoes },
                  { l: 'EMA 9', v: ind.ema_9 != null ? 'R$ ' + fmt(ind.ema_9) : '-', c: C.acoes },
                  { l: 'Beta', v: ind.beta != null ? ind.beta.toFixed(2) : '-', c: ind.beta != null ? (ind.beta > 1.2 ? C.red : ind.beta < 0.8 ? C.green : C.sub) : C.dim },
                  { l: 'ATR 14', v: ind.atr_14 != null ? 'R$ ' + fmt(ind.atr_14) : '-', c: C.etfs },
                  { l: 'BB Width', v: ind.bb_width != null ? ind.bb_width.toFixed(1) + '%' : '-', c: C.rf },
                  { l: 'Max DD', v: ind.max_drawdown != null ? ind.max_drawdown.toFixed(1) + '%' : '-', c: C.red },
                ];
                var calcDate = ind.data_calculo ? new Date(ind.data_calculo).toLocaleDateString('pt-BR') : null;
                return (
                  <Glass key={tk} padding={14}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, fontFamily: F.display }}>{tk}</Text>
                      {calcDate ? <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>{calcDate}</Text> : null}
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {fields.map(function(f, fi) {
                        return (
                          <View key={fi} style={{ width: '23%', alignItems: 'center', paddingVertical: 6 }}>
                            <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, marginBottom: 3 }}>{f.l}</Text>
                            <Text style={[{ fontSize: 13, fontWeight: '700', color: f.c, fontFamily: F.mono }, ps]}>{f.v}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </Glass>
                );
              })}
            </>
          )}
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
                          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>
                            {new Date(op.vencimento).toLocaleDateString('pt-BR')}
                          </Text>
                          <Badge text={statusLabel} color={stColor} />
                          {op.corretora ? (
                            <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>{op.corretora}</Text>
                          ) : null}
                        </View>
                        {isFechada ? (
                          <View style={{ marginTop: 4, gap: 2 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Text style={[{ fontSize: 10, color: C.dim, fontFamily: F.mono }, ps]}>
                                {'Recompra: R$ ' + fmt(op.premio_fechamento || 0) + ' x ' + (op.quantidade || 0)}
                              </Text>
                              {op.data_fechamento ? (
                                <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>
                                  {'em ' + new Date(op.data_fechamento + 'T12:00:00').toLocaleDateString('pt-BR')}
                                </Text>
                              ) : null}
                            </View>
                            <View style={{ flexDirection: 'row', gap: 12, marginTop: 2 }}>
                              <Text style={[{ fontSize: 10, color: C.sub, fontFamily: F.mono }, ps]}>
                                {'Recebido: R$ ' + fmt(premTotal)}
                              </Text>
                              <Text style={[{ fontSize: 10, color: C.red, fontFamily: F.mono }, ps]}>
                                {'Recompra: R$ ' + fmt((op.premio_fechamento || 0) * (op.quantidade || 0))}
                              </Text>
                              <Text style={[{ fontSize: 10, fontWeight: '700', color: histPL >= 0 ? C.green : C.red, fontFamily: F.mono }, ps]}>
                                {'Resultado: ' + (histPL >= 0 ? '+' : '') + 'R$ ' + fmt(histPL)}
                              </Text>
                            </View>
                          </View>
                        ) : null}
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[{ fontSize: 14, fontWeight: '700', color: histDisplayColor, fontFamily: F.mono }, ps]}>
                          {histDisplayVal}
                        </Text>
                        {isFechada ? (
                          <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, marginTop: 2 }}>P&L</Text>
                        ) : (
                          <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, marginTop: 2 }}>Prêmio</Text>
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
    </View>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 18, gap: SIZE.gap },
  subTabs: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },

  opTicker: { fontSize: 15, fontWeight: '700', color: C.text, fontFamily: F.display },
  opCode: { fontSize: 11, color: C.opcoes, fontFamily: F.mono, marginBottom: 6 },
  opPremio: { fontSize: 14, fontWeight: '700', fontFamily: F.mono },

  greeksRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 8, marginTop: 4,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)',
  },
  greekLabel: { fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.3 },
  greekValue: { fontSize: 11, color: C.sub, fontFamily: F.mono, fontWeight: '500', marginTop: 2 },

  actionLink: { fontSize: 11, color: C.accent, fontFamily: F.mono, fontWeight: '600' },

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
  simFieldLabel: { fontSize: 11, color: C.dim, fontFamily: F.mono, marginBottom: 3 },
  simFieldInput: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1, borderColor: C.border, borderRadius: 10,
    paddingHorizontal: 10, height: 42,
  },
  simFieldText: { flex: 1, fontSize: 15, color: C.text, fontFamily: F.mono, padding: 0 },
  simFieldSuffix: { fontSize: 11, color: C.dim, fontFamily: F.mono, marginLeft: 4 },

  // Payoff chart
  payoffContainer: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  payoffTooltip: { position: 'absolute', backgroundColor: C.cardSolid, borderRadius: 6, padding: 6, borderWidth: 1, borderColor: C.border },

  // Cadeia
  chainRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  chainHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: C.border },
  chainCell: { flex: 1, alignItems: 'center' },
  chainStrike: { width: 60, alignItems: 'center' },
  chainPrice: { fontSize: 13, fontWeight: '700', color: C.text, fontFamily: F.mono },
  chainDelta: { fontSize: 11, color: C.dim, fontFamily: F.mono },
  chainItm: { backgroundColor: 'rgba(34,197,94,0.06)' },
  chainItmPut: { backgroundColor: 'rgba(239,68,68,0.06)' },
  chainAtm: { backgroundColor: 'rgba(245,158,11,0.06)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.15)' },

});
