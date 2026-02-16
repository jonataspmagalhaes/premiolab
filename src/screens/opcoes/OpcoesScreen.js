import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, TextInput, Alert,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getOpcoes, getPositions, getSaldos, addOperacao } from '../../services/database';
import { enrichPositionsWithPrices, clearPriceCache } from '../../services/priceService';
import { supabase } from '../../config/supabase';
import { Glass, Badge, Pill, SectionLabel } from '../../components';
import { LoadingScreen, EmptyState } from '../../components/States';

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
function calcGreeks(op, spot) {
  var s = spot || op.strike || 0;
  var k = op.strike || 0;
  var p = op.premio || 0;
  var daysLeft = Math.max(1, Math.ceil((new Date(op.vencimento) - new Date()) / (1000 * 60 * 60 * 24)));
  var t = daysLeft / 365;
  var r = 0.1325; // Selic ~13.25%
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
// OPTION CARD
// ═══════════════════════════════════════
function OpCard(props) {
  var op = props.op;
  var positions = props.positions;
  var saldos = props.saldos || [];
  var onEdit = props.onEdit;
  var onDelete = props.onDelete;
  var onClose = props.onClose;

  var _showClose = useState(false); var showClose = _showClose[0]; var setShowClose = _showClose[1];
  var _premRecompra = useState(''); var premRecompra = _premRecompra[0]; var setPremRecompra = _premRecompra[1];

  var tipoLabel = (op.tipo || 'call').toUpperCase();
  var isVenda = op.direcao === 'lancamento' || op.direcao === 'venda';
  var premTotal = (op.premio || 0) * (op.quantidade || 0);
  var daysLeft = Math.max(0, Math.ceil((new Date(op.vencimento) - new Date()) / (1000 * 60 * 60 * 24)));

  // Cobertura: CALL = acoes na mesma corretora, PUT = saldo na mesma corretora
  var cobertura = '';
  var coberturaColor = C.green;
  var coberturaDetail = '';

  if (tipoLabel === 'CALL' && isVenda) {
    // CALL vendida: precisa ter acoes do ativo_base na mesma corretora
    var posMatch = null;
    for (var ci = 0; ci < positions.length; ci++) {
      if (positions[ci].ticker === op.ativo_base && positions[ci].corretora === op.corretora) {
        posMatch = positions[ci];
        break;
      }
    }
    // Fallback: checar qualquer corretora
    var posAny = null;
    if (!posMatch) {
      for (var cj = 0; cj < positions.length; cj++) {
        if (positions[cj].ticker === op.ativo_base) {
          posAny = positions[cj];
          break;
        }
      }
    }

    if (posMatch && posMatch.quantidade >= (op.quantidade || 0)) {
      cobertura = 'COBERTA';
      coberturaColor = C.green;
      coberturaDetail = posMatch.quantidade + ' acoes em ' + op.corretora;
    } else if (posMatch) {
      cobertura = 'PARCIAL';
      coberturaColor = C.yellow;
      coberturaDetail = 'Tem ' + posMatch.quantidade + '/' + (op.quantidade || 0) + ' em ' + op.corretora;
    } else if (posAny && posAny.quantidade >= (op.quantidade || 0)) {
      cobertura = 'COBERTA*';
      coberturaColor = C.yellow;
      coberturaDetail = posAny.quantidade + ' acoes em ' + (posAny.corretora || 'outra') + ' (corretora diferente)';
    } else {
      cobertura = 'DESCOBERTA';
      coberturaColor = C.red;
      coberturaDetail = 'Sem ' + op.ativo_base + ' em ' + (op.corretora || 'nenhuma corretora');
    }
  } else if (tipoLabel === 'PUT' && isVenda) {
    // PUT vendida (CSP): precisa ter saldo >= strike * qty na mesma corretora
    var custoExercicio = (op.strike || 0) * (op.quantidade || 0);
    var saldoMatch = null;
    for (var si = 0; si < saldos.length; si++) {
      if (saldos[si].name === op.corretora) {
        saldoMatch = saldos[si];
        break;
      }
    }
    var saldoVal = saldoMatch ? (saldoMatch.saldo || 0) : 0;

    if (saldoMatch && saldoVal >= custoExercicio) {
      cobertura = 'CSP';
      coberturaColor = C.green;
      coberturaDetail = 'Saldo R$ ' + fmt(saldoVal) + ' em ' + op.corretora + ' (precisa R$ ' + fmt(custoExercicio) + ')';
    } else if (saldoMatch) {
      cobertura = 'CSP PARCIAL';
      coberturaColor = C.yellow;
      coberturaDetail = 'Saldo R$ ' + fmt(saldoVal) + '/' + fmt(custoExercicio) + ' em ' + op.corretora;
    } else {
      cobertura = 'DESCOBERTA';
      coberturaColor = C.red;
      coberturaDetail = 'Sem saldo em ' + (op.corretora || 'nenhuma corretora') + ' (precisa R$ ' + fmt(custoExercicio) + ')';
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
  var greeks = calcGreeks(op, spotPrice);

  // Moneyness
  var moneyness = getMoneyness(op.tipo, op.direcao, op.strike, spotPrice);

  // Encerramento P&L
  var recompraVal = parseFloat(premRecompra) || 0;
  var closePL = 0;
  if (recompraVal > 0) {
    if (op.direcao === 'lancamento' || op.direcao === 'venda') {
      closePL = ((op.premio || 0) - recompraVal) * (op.quantidade || 0);
    } else {
      closePL = (recompraVal - (op.premio || 0)) * (op.quantidade || 0);
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
      {/* Header: ticker + type + cobertura + moneyness + premium */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <Text style={styles.opTicker}>{op.ativo_base}</Text>
          <Badge text={tipoLabel} color={tipoLabel === 'CALL' ? C.green : C.red} />
          <Badge text={cobertura} color={coberturaColor} />
          {moneyness ? <Badge text={moneyness.label} color={moneyness.color} /> : null}
          <Badge text={daysLeft + 'd'} color={dayColor} />
        </View>
        <Text style={[styles.opPremio, { color: C.green }]}>+R$ {fmt(premTotal)}</Text>
      </View>

      {/* Option code + moneyness text + cobertura detail */}
      {op.ticker_opcao ? (
        <Text style={styles.opCode}>{op.ticker_opcao}</Text>
      ) : null}
      {moneyness ? (
        <Text style={{ fontSize: 10, color: moneyness.color, fontFamily: F.mono, marginBottom: 2 }}>{moneyness.text}</Text>
      ) : null}
      {coberturaDetail ? (
        <Text style={{ fontSize: 9, color: coberturaColor, fontFamily: F.mono, marginBottom: 4 }}>{coberturaDetail}</Text>
      ) : null}

      {/* Greeks row */}
      <View style={styles.greeksRow}>
        {[
          { l: 'Spot', v: spotPrice > 0 ? 'R$ ' + fmt(spotPrice) : '–' },
          { l: 'Delta', v: greeks.delta.toFixed(2) },
          { l: 'Theta', v: (greeks.theta * (op.quantidade || 1) >= 0 ? '+' : '') + 'R$' + (greeks.theta * (op.quantidade || 1)).toFixed(1) + '/d' },
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

      {/* Bottom: corretora + actions */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {op.corretora ? (
            <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>{op.corretora}</Text>
          ) : null}
          <Badge text={daysLeft + 'd'} color={dayColor} />
        </View>
        <View style={{ flexDirection: 'row', gap: 14 }}>
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

      {/* Encerramento panel */}
      {showClose ? (
        <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
          <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginBottom: 4 }}>PREMIO RECOMPRA (R$)</Text>
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
          {recompraVal > 0 ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>P&L DO ENCERRAMENTO</Text>
              <Text style={{ fontSize: 16, fontWeight: '800', color: closePL >= 0 ? C.green : C.red, fontFamily: F.display }}>
                {closePL >= 0 ? '+' : ''}R$ {fmt(closePL)}
              </Text>
            </View>
          ) : null}
          <TouchableOpacity
            onPress={function() {
              if (recompraVal <= 0) return;
              if (onClose) onClose(op.id, recompraVal, closePL);
            }}
            disabled={recompraVal <= 0}
            style={{
              backgroundColor: recompraVal > 0 ? C.yellow : C.dim,
              borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 8,
              opacity: recompraVal > 0 ? 1 : 0.4,
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
function SimuladorBS() {
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
  var r = 0.1325;
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
        <SectionLabel>GREGAS (BLACK-SCHOLES)</SectionLabel>
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
            <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>IV IMPLICITA</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.opcoes, fontFamily: F.mono }}>{(sigma * 100).toFixed(1)}%</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>PRECO BS</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, fontFamily: F.mono }}>R$ {bsTheoPrice.toFixed(2)}</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>MERCADO</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: bsTheoPrice > pVal ? C.green : C.red, fontFamily: F.mono }}>R$ {pVal.toFixed(2)}</Text>
          </View>
        </View>
      </Glass>

      {/* Resumo */}
      <Glass padding={14}>
        <SectionLabel>RESUMO</SectionLabel>
        <View style={{ gap: 6, marginTop: 6 }}>
          {[
            { l: 'Premio total', v: 'R$ ' + premioTotal.toFixed(2) },
            { l: 'Theta/dia', v: 'R$ ' + thetaDia.toFixed(2) },
            { l: 'Breakeven', v: 'R$ ' + breakeven.toFixed(2) },
            { l: 'Contratos', v: contratos + ' (' + qVal + ' opcoes)' },
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
        <SectionLabel>CENARIOS WHAT-IF</SectionLabel>
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

  var load = async function() {
    if (!user) return;
    var results = await Promise.all([
      getOpcoes(user.id),
      getPositions(user.id),
      getSaldos(user.id),
    ]);
    var allOpcoes = results[0].data || [];
    var rawPos = results[1].data || [];
    setSaldos(results[2].data || []);
    setPositions(rawPos);
    setLoading(false);

    // Detect expired options (ativa + vencimento < hoje)
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var expiredList = [];
    var nonExpiredOpcoes = [];
    for (var ei = 0; ei < allOpcoes.length; ei++) {
      var o = allOpcoes[ei];
      if (o.status === 'ativa' && new Date(o.vencimento) < today) {
        expiredList.push(o);
      } else {
        nonExpiredOpcoes.push(o);
      }
    }
    setExpired(expiredList);
    setOpcoes(nonExpiredOpcoes);

    // Two-phase: enrich with real prices
    try {
      var enriched = await enrichPositionsWithPrices(rawPos);
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
    Alert.alert('Excluir opcao?', 'Essa acao nao pode ser desfeita.', [
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

  var handleClose = async function(id, premFechamento, pl) {
    var result = await supabase
      .from('opcoes')
      .update({ status: 'fechada', premio_fechamento: premFechamento })
      .eq('id', id);
    if (result.error) {
      Alert.alert('Erro', 'Falha ao encerrar opcao.');
      return;
    }
    var updated = [];
    for (var ci = 0; ci < opcoes.length; ci++) {
      if (opcoes[ci].id === id) {
        var copy = {};
        var keys = Object.keys(opcoes[ci]);
        for (var ck = 0; ck < keys.length; ck++) { copy[keys[ck]] = opcoes[ci][keys[ck]]; }
        copy.status = 'fechada';
        copy.premio_fechamento = premFechamento;
        updated.push(copy);
      } else {
        updated.push(opcoes[ci]);
      }
    }
    setOpcoes(updated);
    var plText = pl >= 0 ? '+R$ ' + fmt(pl) : '-R$ ' + fmt(Math.abs(pl));
    Alert.alert('Opcao encerrada', 'P&L: ' + plText);
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
    Alert.alert('Registrado', 'Opcao expirou sem valor (PO). Premio mantido integralmente.');
  };

  var handleExercida = function(expOp) {
    var tipoUpper = (expOp.tipo || 'call').toUpperCase();
    var isLanc = expOp.direcao === 'lancamento' || expOp.direcao === 'venda';
    var descricao = '';
    var opTipo = ''; // tipo da operacao de acoes resultante
    if (tipoUpper === 'CALL') {
      if (isLanc) {
        descricao = 'CALL lancada exercida: venda de ' + expOp.quantidade + ' acoes de ' + expOp.ativo_base + ' ao strike R$ ' + fmt(expOp.strike);
        opTipo = 'venda';
      } else {
        descricao = 'CALL comprada exercida: compra de ' + expOp.quantidade + ' acoes de ' + expOp.ativo_base + ' ao strike R$ ' + fmt(expOp.strike);
        opTipo = 'compra';
      }
    } else {
      if (isLanc) {
        descricao = 'PUT lancada exercida: compra de ' + expOp.quantidade + ' acoes de ' + expOp.ativo_base + ' ao strike R$ ' + fmt(expOp.strike);
        opTipo = 'compra';
      } else {
        descricao = 'PUT comprada exercida: venda de ' + expOp.quantidade + ' acoes de ' + expOp.ativo_base + ' ao strike R$ ' + fmt(expOp.strike);
        opTipo = 'venda';
      }
    }

    Alert.alert('Confirmar exercicio', descricao + '\n\nUma operacao de ' + opTipo + ' sera registrada na carteira.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Confirmar',
        onPress: async function() {
          var result = await supabase
            .from('opcoes')
            .update({ status: 'exercida' })
            .eq('id', expOp.id);
          if (result.error) {
            Alert.alert('Erro', 'Falha ao atualizar opcao.');
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
            Alert.alert('Aviso', 'Opcao marcada como exercida, mas falha ao criar operacao: ' + opResult.error.message);
          } else {
            Alert.alert('Exercida!', 'Opcao exercida e operacao de ' + opTipo + ' registrada na carteira.');
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

  // Totals
  var premioMes = ativas.reduce(function(s, o) { return s + (o.premio || 0) * (o.quantidade || 0); }, 0);

  // Theta/dia estimate
  var thetaDiaTotal = 0;
  ativas.forEach(function(op) {
    var spotPrice = 0;
    var matchPos = positions.find(function(p) { return p.ticker === op.ativo_base; });
    if (matchPos) spotPrice = matchPos.preco_atual || matchPos.pm || 0;
    var greeks = calcGreeks(op, spotPrice);
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
        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          {[
            { l: 'PREMIO MES', v: 'R$ ' + premioMes.toFixed(0), c: C.opcoes },
            { l: 'THETA/DIA', v: (thetaDiaTotal >= 0 ? '+' : '') + 'R$ ' + thetaDiaTotal.toFixed(0), c: thetaDiaTotal >= 0 ? C.green : C.red },
            { l: 'OPERACOES', v: String(ativas.length), c: C.sub },
          ].map(function(m, i) {
            return (
              <View key={i} style={{ alignItems: 'center', flex: 1 }}>
                <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 }}>{m.l}</Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: m.c, fontFamily: F.display, marginTop: 2 }}>{m.v}</Text>
              </View>
            );
          })}
        </View>
      </Glass>

      {/* BANNER: gregas usando PM */}
      {!pricesAvailable && positions.length > 0 ? (
        <View style={{ padding: 8, borderRadius: 8, backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.15)' }}>
          <Text style={{ fontSize: 10, color: '#f59e0b', fontFamily: F.mono, textAlign: 'center' }}>
            Gregas usando PM (cotacoes indisponiveis)
          </Text>
        </View>
      ) : null}

      {/* SUB TABS */}
      <View style={styles.subTabs}>
        {[
          { k: 'ativas', l: 'Ativas (' + ativas.length + (expired.length > 0 ? ' +' + expired.length + ' venc.' : '') + ')' },
          { k: 'sim', l: 'Simulador' },
          { k: 'hist', l: 'Historico (' + historico.length + ')' },
        ].map(function(t) {
          return (
            <Pill key={t.k} active={sub === t.k} color={C.opcoes} onPress={function() { setSub(t.k); }}>{t.l}</Pill>
          );
        })}
      </View>

      {/* ATIVAS TAB */}
      {sub === 'ativas' && (
        <View style={{ gap: SIZE.gap }}>
          {/* Opcoes vencidas que precisam de resolucao */}
          {expired.length > 0 ? (
            <View style={{ gap: SIZE.gap }}>
              <SectionLabel>OPCOES VENCIDAS</SectionLabel>
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
                    <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
                      <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>
                        Venc: {new Date(expOp.vencimento).toLocaleDateString('pt-BR')}
                      </Text>
                      <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>
                        Strike: R$ {fmt(expOp.strike)}
                      </Text>
                      <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>
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
            </View>
          ) : null}

          {ativas.length === 0 && expired.length === 0 ? (
            <EmptyState
              icon="\u26A1" title="Nenhuma opcao ativa"
              description="Lance opcoes para comecar a receber premios."
              cta="Nova opcao" onCta={function() { navigation.navigate('AddOpcao'); }}
              color={C.opcoes}
            />
          ) : ativas.length > 0 ? (
            <>
              {/* Option cards */}
              {ativas.map(function(op, i) {
                return (
                  <OpCard key={op.id || i} op={op} positions={positions} saldos={saldos}
                    onEdit={function() { navigation.navigate('EditOpcao', { opcao: op }); }}
                    onDelete={function() { handleDelete(op.id); }}
                    onClose={handleClose}
                  />
                );
              })}

              {/* Vencimentos */}
              {vencimentos.length > 0 && (
                <View>
                  <SectionLabel>PROXIMOS VENCIMENTOS</SectionLabel>
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
          ) : null}
        </View>
      )}

      {/* SIMULADOR TAB */}
      {sub === 'sim' && <SimuladorBS />}

      {/* HISTORICO TAB */}
      {sub === 'hist' && (
        <View style={{ gap: SIZE.gap }}>
          {historico.length === 0 ? (
            <Glass padding={24}>
              <Text style={{ fontSize: 14, color: C.sub, fontFamily: F.body, textAlign: 'center' }}>
                Nenhuma operacao encerrada ainda.
              </Text>
            </Glass>
          ) : (
            <>
              {/* Summary */}
              <Glass padding={14}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                  {(function() {
                    var totalPrem = historico.reduce(function(s, o) { return s + (o.premio || 0) * (o.quantidade || 0); }, 0);
                    var expiradas = historico.filter(function(o) { return o.status === 'expirou_po' || o.status === 'expirada'; }).length;
                    var exercidas = historico.filter(function(o) { return o.status === 'exercida'; }).length;
                    return [
                      { l: 'TOTAL RECEBIDO', v: 'R$ ' + totalPrem.toFixed(0), c: C.green },
                      { l: 'EXPIROU PO', v: String(expiradas), c: C.acoes },
                      { l: 'EXERCIDAS', v: String(exercidas), c: C.etfs },
                    ];
                  })().map(function(m, i) {
                    return (
                      <View key={i} style={{ alignItems: 'center', flex: 1 }}>
                        <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 }}>{m.l}</Text>
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

                  return (
                    <View key={op.id || i}
                      style={[styles.histRow, i > 0 && { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)' }]}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, fontFamily: F.display }}>
                            {op.ativo_base} {tipoLabel} {(op.strike || 0).toFixed(0)}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>
                            {new Date(op.vencimento).toLocaleDateString('pt-BR')}
                          </Text>
                          <Badge text={statusLabel} color={stColor} />
                          {op.corretora ? (
                            <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>{op.corretora}</Text>
                          ) : null}
                        </View>
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: C.green, fontFamily: F.mono }}>
                        +R$ {fmt(premTotal)}
                      </Text>
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
  greekLabel: { fontSize: 8, color: C.dim, fontFamily: F.mono, letterSpacing: 0.3 },
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
});
