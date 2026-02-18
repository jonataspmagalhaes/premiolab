import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, TextInput, Alert, Dimensions,
} from 'react-native';
import Svg, { Line, Rect, Path, Text as SvgText } from 'react-native-svg';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getOpcoes, getPositions, getSaldos, addOperacao, getAlertasConfig, getIndicators, getProfile } from '../../services/database';
import { enrichPositionsWithPrices, clearPriceCache, fetchPrices } from '../../services/priceService';
import { runDailyCalculation, shouldCalculateToday } from '../../services/indicatorService';
import { supabase } from '../../config/supabase';
import { Glass, Badge, Pill, SectionLabel, InfoTip } from '../../components';
import { LoadingScreen, EmptyState } from '../../components/States';

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
  var tipo = (props.tipo || 'call').toLowerCase();
  var direcao = props.direcao || 'venda';
  var strike = props.strike || 0;
  var premio = props.premio || 0;
  var quantidade = props.quantidade || 1;
  var spotPrice = props.spotPrice || strike;
  var chartWidth = props.chartWidth || (Dimensions.get('window').width - 72);

  var _touchX = useState(null); var touchX = _touchX[0]; var setTouchX = _touchX[1];

  var isVenda = direcao === 'venda' || direcao === 'lancamento';
  var rangeMin = strike * 0.7;
  var rangeMax = strike * 1.3;
  var numPoints = 60;
  var step = (rangeMax - rangeMin) / numPoints;

  // Breakeven
  var breakeven = tipo === 'call' ? strike + premio : strike - premio;

  // Compute P&L for a given price
  function calcPL(price) {
    var intrinsic;
    if (tipo === 'call') {
      intrinsic = Math.max(0, price - strike);
    } else {
      intrinsic = Math.max(0, strike - price);
    }
    if (isVenda) {
      return (premio - intrinsic) * quantidade;
    } else {
      return (intrinsic - premio) * quantidade;
    }
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
  // Clamp zeroY within chart area
  var clampedZeroY = Math.max(padT, Math.min(padT + h, zeroY));

  // Line path
  var linePath = '';
  for (var li = 0; li < points.length; li++) {
    var lx = toX(points[li].x);
    var ly = toY(points[li].y);
    if (li === 0) {
      linePath = linePath + 'M' + lx.toFixed(1) + ',' + ly.toFixed(1);
    } else {
      linePath = linePath + ' L' + lx.toFixed(1) + ',' + ly.toFixed(1);
    }
  }

  // Green fill (above zero)
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
  // Close fill paths
  var lastFx = toX(points[points.length - 1].x);
  var firstFx = toX(points[0].x);
  greenPath = greenPath + ' L' + lastFx.toFixed(1) + ',' + clampedZeroY.toFixed(1) + ' Z';
  redPath = redPath + ' L' + lastFx.toFixed(1) + ',' + clampedZeroY.toFixed(1) + ' Z';

  // Breakeven X
  var beX = toX(breakeven);
  var spotX = toX(spotPrice);

  // Touch handling
  function handleTouch(evt) {
    var touch = evt.nativeEvent;
    var tx = touch.locationX;
    if (tx >= padL && tx <= padL + w) {
      setTouchX(tx);
    }
  }

  // Touch info
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

  // Max profit/loss labels
  var maxProfitLabel = isVenda ? 'Max +R$' + fmt(premio * quantidade) : 'Ilimitado';
  var maxLossLabel = isVenda ? 'Ilimitado' : 'Max -R$' + fmt(premio * quantidade);

  return (
    <View style={styles.payoffContainer}>
      <View
        onTouchStart={handleTouch}
        onTouchMove={handleTouch}
        onTouchEnd={function() { setTouchX(null); }}
      >
        <Svg width={chartWidth} height={CHART_H}>
          {/* Green fill (profit zone) */}
          <Path d={greenPath} fill="rgba(34,197,94,0.12)" />
          {/* Red fill (loss zone) */}
          <Path d={redPath} fill="rgba(239,68,68,0.12)" />

          {/* Zero line */}
          <Line x1={padL} y1={clampedZeroY} x2={padL + w} y2={clampedZeroY}
            stroke="rgba(255,255,255,0.15)" strokeWidth={1} />

          {/* P&L line */}
          <Path d={linePath} fill="none" stroke={C.opcoes} strokeWidth={2} />

          {/* Breakeven line */}
          {breakeven >= rangeMin && breakeven <= rangeMax ? (
            <>
              <Line x1={beX} y1={padT} x2={beX} y2={padT + h}
                stroke={C.yellow} strokeWidth={1} strokeDasharray="4,3" />
              <SvgText x={beX} y={padT - 4} fill={C.yellow}
                fontSize={8} fontFamily={F.mono} textAnchor="middle">
                {'BE ' + fmt(breakeven)}
              </SvgText>
            </>
          ) : null}

          {/* Spot line */}
          {spotPrice >= rangeMin && spotPrice <= rangeMax ? (
            <>
              <Line x1={spotX} y1={padT} x2={spotX} y2={padT + h}
                stroke={C.accent} strokeWidth={1} strokeDasharray="2,3" />
              <SvgText x={spotX} y={padT + h + 12} fill={C.accent}
                fontSize={8} fontFamily={F.mono} textAnchor="middle">
                {'Spot ' + fmt(spotPrice)}
              </SvgText>
            </>
          ) : null}

          {/* Y axis labels */}
          {yLabels.map(function(yl, yi) {
            return (
              <SvgText key={'y' + yi} x={padL - 4} y={yl.y + 3} fill={C.dim}
                fontSize={8} fontFamily={F.mono} textAnchor="end">
                {(yl.val >= 0 ? '+' : '') + fmt(Math.round(yl.val))}
              </SvgText>
            );
          })}

          {/* X axis labels */}
          {xLabels.map(function(xl, xi) {
            return (
              <SvgText key={'x' + xi} x={xl.x} y={padT + h + 12} fill={C.dim}
                fontSize={8} fontFamily={F.mono} textAnchor="middle">
                {fmt(xl.val)}
              </SvgText>
            );
          })}

          {/* Touch crosshair */}
          {touchInfo ? (
            <>
              <Line x1={touchInfo.x} y1={padT} x2={touchInfo.x} y2={padT + h}
                stroke="rgba(255,255,255,0.3)" strokeWidth={1} />
              <Rect x={touchInfo.x - 1.5} y={touchInfo.y - 1.5} width={5} height={5}
                rx={2.5} fill={C.text} />
            </>
          ) : null}
        </Svg>

        {/* Touch tooltip */}
        {touchInfo ? (
          <View style={[styles.payoffTooltip, {
            left: Math.min(touchInfo.x, chartWidth - 100),
            top: 4,
          }]}>
            <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.mono }}>
              {'Ativo R$ ' + fmt(touchInfo.price)}
            </Text>
            <Text style={{ fontSize: 11, fontWeight: '700', fontFamily: F.mono,
              color: touchInfo.pl >= 0 ? C.green : C.red }}>
              {'P&L ' + (touchInfo.pl >= 0 ? '+' : '') + 'R$ ' + fmt(touchInfo.pl)}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Legend row */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        <Text style={{ fontSize: 11, color: C.green, fontFamily: F.mono }}>
          {maxProfitLabel}
        </Text>
        <Text style={{ fontSize: 11, color: C.red, fontFamily: F.mono }}>
          {maxLossLabel}
        </Text>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════
// OPTION CARD
// ═══════════════════════════════════════
function OpCard(props) {
  var op = props.op;
  var positions = props.positions || [];
  var saldos = props.saldos || [];
  var indicatorsMap = props.indicators || {};
  var cardSelicRate = props.selicRate || 13.25;
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
        <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.mono }}>
          {'R$ ' + fmt(op.premio || 0) + ' x ' + (op.quantidade || 0)}
        </Text>
        <Text style={{ fontSize: 13, fontWeight: '800', color: C.green, fontFamily: F.display }}>
          {'= R$ ' + fmt(premTotal)}
        </Text>
      </View>

      {/* Option code + moneyness text + cobertura detail */}
      {op.ticker_opcao ? (
        <Text style={styles.opCode}>{op.ticker_opcao}</Text>
      ) : null}
      {moneyness ? (
        <Text style={{ fontSize: 11, color: moneyness.color, fontFamily: F.mono, marginBottom: 2 }}>{moneyness.text}</Text>
      ) : null}
      {coberturaDetail ? (
        <Text style={{ fontSize: 11, color: coberturaColor, fontFamily: F.mono, marginBottom: 4 }}>{coberturaDetail}</Text>
      ) : null}

      {/* Greeks row */}
      <View style={styles.greeksRow}>
        {[
          { l: 'Spot', v: spotPrice > 0 ? 'R$ ' + fmt(spotPrice) : '–' },
          { l: 'Delta', v: greeks.delta.toFixed(2) },
          { l: 'Theta', v: (greeks.theta * (op.quantidade || 1) >= 0 ? '+' : '') + 'R$ ' + fmt(greeks.theta * (op.quantidade || 1)) + '/d' },
          { l: 'IV', v: greeks.iv.toFixed(0) + '%' },
          { l: 'DTE', v: daysLeft + 'd' },
        ].map(function(g, i) {
          return (
            <View key={i} style={{ alignItems: 'center', flex: 1 }}>
              <Text style={styles.greekLabel}>{g.l}</Text>
              <Text style={styles.greekValue}>{g.v}</Text>
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
        if (ratio != null && ratio >= 1.3) {
          ivLabel = 'IV ALTA';
          ivColor = C.red;
        } else if (ratio != null && ratio <= 0.7) {
          ivLabel = 'IV BAIXA';
          ivColor = C.green;
        }
        return (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.mono }}>
              {'HV: ' + hv.toFixed(0) + '%'}
            </Text>
            <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.mono }}>|</Text>
            <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.mono }}>
              {'IV: ' + iv.toFixed(0) + '%'}
            </Text>
            {ivLabel ? <Badge text={ivLabel} color={ivColor} /> : null}
            <InfoTip text="HV = volatilidade histórica 20d. IV = volatilidade implícita. IV > 130% HV = prêmio caro." size={12} />
          </View>
        );
      })()}

      {/* Bottom: corretora + actions */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {op.corretora ? (
            <Text style={{ fontSize: 12, color: C.dim, fontFamily: F.mono }}>{op.corretora}</Text>
          ) : null}
          <Badge text={daysLeft + 'd'} color={dayColor} />
        </View>
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
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.red, fontFamily: F.mono }}>
                    {'R$ ' + fmt(recompraTotal)}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>P&L DO ENCERRAMENTO</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: closePL >= 0 ? C.green : C.red, fontFamily: F.display }}>
                      {(closePL >= 0 ? '+' : '') + 'R$ ' + fmt(closePL)}
                    </Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: closePL >= 0 ? C.green : C.red, fontFamily: F.mono }}>
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
}

// ═══════════════════════════════════════
// SIMULADOR BLACK-SCHOLES
// ═══════════════════════════════════════
function SimuladorBS(props) {
  var simSelicRate = props.selicRate || 13.25;
  var s1 = useState('CALL'); var tipo = s1[0]; var setTipo = s1[1];
  var s2 = useState('venda'); var direcao = s2[0]; var setDirecao = s2[1];
  var s3 = useState('34.30'); var spot = s3[0]; var setSpot = s3[1];
  var s4 = useState('36.00'); var strike = s4[0]; var setStrike = s4[1];
  var s5 = useState('1.20'); var premio = s5[0]; var setPremio = s5[1];
  var s6 = useState('35'); var ivInput = s6[0]; var setIvInput = s6[1];
  var s7 = useState('21'); var dte = s7[0]; var setDte = s7[1];
  var s8 = useState('100'); var qty = s8[0]; var setQty = s8[1];

  var sVal = parseFloat(spot) || 0;
  var kVal = parseFloat(strike) || 0;
  var pVal = parseFloat(premio) || 0;
  var qVal = parseInt(qty) || 0;
  var dVal = parseInt(dte) || 0;
  var t = dVal / 365;
  var r = simSelicRate / 100;
  var tipoLower = tipo.toLowerCase();

  // Use input IV or calculate from premium
  var sigma = parseFloat(ivInput) / 100 || 0.30;
  if (pVal > 0 && sVal > 0 && kVal > 0 && t > 0) {
    var computedIV = bsIV(sVal, kVal, t, r, pVal, tipoLower);
    sigma = computedIV;
  }

  // Real BS Greeks
  var greeks = bsGreeks(sVal, kVal, t, r, sigma, tipoLower);

  var premioTotal = pVal * qVal;
  var contratos = Math.floor(qVal / 100);
  var thetaDia = greeks.theta * qVal;
  var breakeven = tipoLower === 'call' ? kVal + pVal : kVal - pVal;

  // BS theoretical price
  var bsTheoPrice = bsPrice(sVal, kVal, t, r, sigma, tipoLower);

  // What-If scenarios with proper BS
  var scenarios = [
    { label: '+5%', pctMove: 0.05 },
    { label: '-5%', pctMove: -0.05 },
    { label: '+10%', pctMove: 0.10 },
    { label: '-10%', pctMove: -0.10 },
  ];

  function calcScenarioResult(pctMove) {
    var newSpot = sVal * (1 + pctMove);
    // Recalculate BS price at new spot with reduced DTE (half the move period)
    var newT = Math.max(0.001, (dVal - 5) / 365);
    var newPrice = bsPrice(newSpot, kVal, newT, r, sigma, tipoLower);
    if (direcao === 'lancamento' || direcao === 'venda') {
      return (pVal - newPrice) * qVal;
    } else {
      return (newPrice - pVal) * qVal;
    }
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
      {/* Tipo + Direcao */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
          {['CALL', 'PUT'].map(function(t) {
            return <Pill key={t} active={tipo === t} color={t === 'CALL' ? C.green : C.red} onPress={function() { setTipo(t); }}>{t}</Pill>;
          })}
        </View>
        <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
          <Pill active={direcao === 'venda'} color={C.accent} onPress={function() { setDirecao('venda'); }}>Venda</Pill>
          <Pill active={direcao === 'compra'} color={C.accent} onPress={function() { setDirecao('compra'); }}>Compra</Pill>
        </View>
      </View>

      {/* Inputs */}
      <Glass padding={14}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {renderField('Spot', spot, setSpot, 'R$')}
          {renderField('Strike', strike, setStrike, 'R$')}
          {renderField('Premio', premio, setPremio, 'R$')}
          {renderField('IV', ivInput, setIvInput, '%')}
          {renderField('DTE', dte, setDte, 'dias')}
          {renderField('Qtd Opcoes', qty, setQty)}
        </View>
      </Glass>

      {/* Gregas */}
      <Glass glow={C.opcoes} padding={14}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: '600' }}>GREGAS (BLACK-SCHOLES)</Text>
          <InfoTip text="Delta: sensibilidade ao preço. Gamma: aceleração do delta. Theta: perda temporal/dia. Vega: sensibilidade à volatilidade." />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 8 }}>
          {[
            { l: 'Delta', v: greeks.delta.toFixed(3), c: Math.abs(greeks.delta) > 0.5 ? C.green : C.sub },
            { l: 'Gamma', v: greeks.gamma.toFixed(4), c: C.sub },
            { l: 'Theta', v: greeks.theta.toFixed(3), c: C.red },
            { l: 'Vega', v: greeks.vega.toFixed(3), c: C.acoes },
          ].map(function(g, i) {
            return (
              <View key={i} style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>{g.l}</Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: g.c, fontFamily: F.display }}>{g.v}</Text>
              </View>
            );
          })}
        </View>
        {/* IV + BS Price */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 10, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8 }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>IV IMPLÍCITA</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.opcoes, fontFamily: F.mono }}>{(sigma * 100).toFixed(1)}%</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>PREÇO BS</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, fontFamily: F.mono }}>{'R$ ' + fmt(bsTheoPrice)}</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>MERCADO</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: bsTheoPrice > pVal ? C.green : C.red, fontFamily: F.mono }}>{'R$ ' + fmt(pVal)}</Text>
          </View>
        </View>
      </Glass>

      {/* Resumo */}
      <Glass padding={14}>
        <SectionLabel>RESUMO</SectionLabel>
        <View style={{ gap: 6, marginTop: 6 }}>
          {[
            { l: 'Premio total', v: 'R$ ' + fmt(premioTotal) },
            { l: 'Theta/dia', v: 'R$ ' + fmt(thetaDia) },
            { l: 'Breakeven', v: 'R$ ' + fmt(breakeven) },
            { l: 'Contratos', v: contratos + ' (' + qVal + ' opções)' },
          ].map(function(rr, i) {
            return (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                <Text style={{ fontSize: 13, color: C.sub, fontFamily: F.body }}>{rr.l}</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: C.text, fontFamily: F.mono }}>{rr.v}</Text>
              </View>
            );
          })}
        </View>
      </Glass>

      {/* What-If Scenarios */}
      <Glass glow={C.etfs} padding={14}>
        <SectionLabel>CENÁRIOS WHAT-IF</SectionLabel>
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
                <Text style={{ fontSize: 13, fontWeight: '700', color: scColor, fontFamily: F.mono }}>
                  {isPos ? '+' : ''}R$ {fmt(Math.abs(result))}
                </Text>
              </View>
            );
          })}
        </View>
      </Glass>
    </View>
  );
}

// ═══════════════════════════════════════
// CADEIA SINTETICA (BS)
// ═══════════════════════════════════════
function CadeiaSintetica(props) {
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

  // When ticker changes, update IV to that ticker's HV
  var handleTickerChange = function(tk) {
    setChainTicker(tk);
    if (indicatorsMap[tk] && indicatorsMap[tk].hv_20) {
      setChainIV(String(Math.round(indicatorsMap[tk].hv_20)));
    }
  };

  // Current ticker HV for badge
  var currentHV = (chainTicker && indicatorsMap[chainTicker] && indicatorsMap[chainTicker].hv_20)
    ? indicatorsMap[chainTicker].hv_20
    : null;

  if (tickers.length === 0) {
    return (
      <Glass padding={24}>
        <Text style={{ fontSize: 14, color: C.sub, fontFamily: F.body, textAlign: 'center' }}>
          Adicione ativos na carteira para gerar a cadeia de opções.
        </Text>
      </Glass>
    );
  }

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
            <Pill key={tk} active={chainTicker === tk} color={C.acoes}
              onPress={function() { handleTickerChange(tk); }}>
              {tk}
            </Pill>
          );
        })}
      </View>

      {/* Spot display + HV badge */}
      {spot > 0 ? (
        <Glass padding={10}>
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>SPOT</Text>
            <Text style={{ fontSize: 18, fontWeight: '800', color: C.text, fontFamily: F.display }}>
              {'R$ ' + fmt(spot)}
            </Text>
            {currentHV != null ? (
              <Badge text={'HV 20d: ' + currentHV.toFixed(0) + '%'} color={C.opcoes} />
            ) : null}
          </View>
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
          <View style={styles.chainStrike} />
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
          var rowBg = isAtm ? styles.chainAtm : (callMon === 'ITM' ? styles.chainItm : null);

          return (
            <View key={idx} style={[styles.chainRow, rowBg]}>
              {/* CALL side */}
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={styles.chainDelta}>{callGreeks.delta.toFixed(2)}</Text>
                </View>
                <View style={{ flex: 1.2, alignItems: 'center' }}>
                  <Text style={styles.chainPrice}>{'R$ ' + fmt(callPrice)}</Text>
                </View>
                <View style={{ flex: 0.8, alignItems: 'center' }}>
                  <Badge text={callMon} color={monColor[callMon] || C.dim} />
                </View>
              </View>

              {/* Strike center */}
              <View style={styles.chainStrike}>
                <Text style={{
                  fontSize: 13, fontWeight: '700', fontFamily: F.mono,
                  color: isAtm ? C.accent : C.text,
                }}>
                  {fmt(sk)}
                </Text>
              </View>

              {/* PUT side */}
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 0.8, alignItems: 'center' }}>
                  <Badge text={putMon} color={monColor[putMon] || C.dim} />
                </View>
                <View style={{ flex: 1.2, alignItems: 'center' }}>
                  <Text style={styles.chainPrice}>{'R$ ' + fmt(putPrice)}</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={styles.chainDelta}>{putGreeks.delta.toFixed(2)}</Text>
                </View>
              </View>
            </View>
          );
        })}
      </Glass>

      {/* Legend */}
      <View style={{ paddingHorizontal: 4 }}>
        <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono, textAlign: 'center' }}>
          {currentHV != null
            ? 'IV inicializado com HV 20d (' + currentHV.toFixed(0) + '%). Ajuste manualmente se necessario.'
            : 'Precos teoricos via Black-Scholes. IV e DTE ajustaveis.'}
        </Text>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════
// MAIN OPCOES SCREEN
// ═══════════════════════════════════════
export default function OpcoesScreen() {
  var navigation = useNavigation();
  var user = useAuth().user;

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

  var load = async function() {
    if (!user) return;
    var results = await Promise.all([
      getOpcoes(user.id),
      getPositions(user.id),
      getSaldos(user.id),
      getIndicators(user.id),
      getProfile(user.id),
    ]);

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
        if (poCount > 0) msg = msg + poCount + ' expirou PO';
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
    Alert.alert('Excluir opção?', 'Essa ação não pode ser desfeita.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir', style: 'destructive',
        onPress: async function() {
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
              var novoSaldo = saldoAtual - recompraTotal;
              var saldoName = saldoMatch.corretora || saldoMatch.name;
              var resS = await supabase
                .from('saldos_corretora')
                .update({ saldo: novoSaldo })
                .eq('id', saldoMatch.id);
              if (resS.error) {
                Alert.alert('Erro', 'Falha ao atualizar saldo: ' + (resS.error.message || ''));
              } else {
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
    Alert.alert('Registrado', 'Opção expirou sem valor (PO). Prêmio mantido integralmente.');
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

  if (loading) return <View style={styles.container}><LoadingScreen /></View>;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />
      }
    >
      {/* SUMMARY BAR */}
      <Glass glow={C.opcoes} padding={16}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 }}>
          <InfoTip text="Moneyness: ITM/ATM/OTM indica se a opção está no/perto/fora do dinheiro. Cobertura: verifica se há ações suficientes na mesma corretora. DTE: dias até o vencimento." />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          {[
            { l: 'PRÊMIO MÊS', v: 'R$ ' + fmt(premioMes), c: C.opcoes },
            { l: 'THETA/DIA', v: (thetaDiaTotal >= 0 ? '+' : '') + 'R$ ' + fmt(thetaDiaTotal), c: thetaDiaTotal >= 0 ? C.green : C.red },
            { l: 'OPERAÇÕES', v: String(ativas.length), c: C.sub },
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
          <Text style={{ fontSize: 11, color: '#f59e0b', fontFamily: F.mono, textAlign: 'center' }}>
            Gregas usando PM (cotações indisponíveis)
          </Text>
        </View>
      ) : null}

      {/* SUB TABS */}
      <View style={styles.subTabs}>
        {[
          { k: 'ativas', l: 'Ativas (' + ativas.length + ')', c: C.opcoes },
          { k: 'pendentes', l: 'Pendentes (' + expired.length + ')', c: C.yellow },
          { k: 'sim', l: 'Simulador', c: C.opcoes },
          { k: 'cadeia', l: 'Cadeia', c: C.opcoes },
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
                      <Text style={[styles.opPremio, { color: C.green }]}>+R$ {fmt(expPrem)}</Text>
                    </View>
                    {expOp.ticker_opcao ? (
                      <Text style={{ fontSize: 11, color: C.opcoes, fontFamily: F.mono, marginBottom: 4 }}>{expOp.ticker_opcao}</Text>
                    ) : null}
                    <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
                      <Text style={{ fontSize: 12, color: C.dim, fontFamily: F.mono }}>
                        Venc: {new Date(expOp.vencimento).toLocaleDateString('pt-BR')}
                      </Text>
                      <Text style={{ fontSize: 12, color: C.dim, fontFamily: F.mono }}>
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
                        <Text style={{ fontSize: 11, fontWeight: '700', color: C.green, fontFamily: F.display }}>Expirou sem valor (PO)</Text>
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
              icon="~" title="Nenhuma opção pendente"
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
              icon="$" title="Nenhuma opção ativa"
              description="Lance opções para começar a receber prêmios."
              cta="Nova opção" onCta={function() { navigation.navigate('AddOpcao'); }}
              color={C.opcoes}
            />
          ) : (
            <>
              {/* Option cards */}
              {ativas.map(function(op, i) {
                return (
                  <OpCard key={op.id || i} op={op} positions={positions} saldos={saldos} indicators={indicators} selicRate={selicRate}
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

      {/* SIMULADOR TAB */}
      {sub === 'sim' && <SimuladorBS selicRate={selicRate} />}

      {/* CADEIA TAB */}
      {sub === 'cadeia' && <CadeiaSintetica positions={positions} indicators={indicators} selicRate={selicRate} />}

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
                        // Expirou PO, expirada, exercida = full premium
                        totalPL = totalPL + (h.premio || 0) * (h.quantidade || 0);
                      }
                    }
                    var expiradas = historico.filter(function(o) { return o.status === 'expirou_po' || o.status === 'expirada'; }).length;
                    var exercidas = historico.filter(function(o) { return o.status === 'exercida'; }).length;
                    var fechadas = historico.filter(function(o) { return o.status === 'fechada'; }).length;
                    return [
                      { l: 'P&L TOTAL', v: (totalPL >= 0 ? '+' : '') + 'R$ ' + fmt(totalPL), c: totalPL >= 0 ? C.green : C.red },
                      { l: 'EXPIROU PO', v: String(expiradas), c: C.acoes },
                      { l: 'EXERCIDAS', v: String(exercidas), c: C.etfs },
                      { l: 'FECHADAS', v: String(fechadas), c: C.yellow },
                    ];
                  })().map(function(m, i) {
                    return (
                      <View key={i} style={{ alignItems: 'center', flex: 1 }}>
                        <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 }}>{m.l}</Text>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: m.c, fontFamily: F.display, marginTop: 2 }}>{m.v}</Text>
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
                  var statusLabel = (op.status || 'encerrada').toUpperCase().replace('_', ' ');
                  var statusMap = {
                    'EXPIROU PO': C.green,
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
                    // Expirou PO / expirada = full premium kept
                    histDisplayVal = '+R$ ' + fmt(premTotal);
                  }

                  return (
                    <View key={op.id || i}
                      style={[styles.histRow, i > 0 && { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)' }]}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, fontFamily: F.display }}>
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
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                            <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>
                              {'Recompra: R$ ' + fmt(op.premio_fechamento || 0) + ' x ' + (op.quantidade || 0)}
                            </Text>
                            {op.data_fechamento ? (
                              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>
                                {'em ' + new Date(op.data_fechamento + 'T12:00:00').toLocaleDateString('pt-BR')}
                              </Text>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: histDisplayColor, fontFamily: F.mono }}>
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
  chainAtm: { backgroundColor: 'rgba(245,158,11,0.06)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.15)' },
});
