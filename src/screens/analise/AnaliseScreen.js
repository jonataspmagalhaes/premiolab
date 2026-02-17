import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, TextInput, LayoutAnimation,
  Platform, UIManager,
} from 'react-native';
import Svg, {
  Circle, Rect as SvgRect, G,
  Text as SvgText, Line as SvgLine, Path,
} from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { C, F, SIZE, PRODUCT_COLORS } from '../../theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { useAuth } from '../../contexts/AuthContext';
import {
  getDashboard, getProventos,
  getOperacoes, getProfile, getOpcoes,
  getIndicators,
} from '../../services/database';
import {
  runDailyCalculation, shouldCalculateToday,
  calcHV, calcSMA, calcEMA, calcRSI, calcBeta,
  calcATR, calcBollingerBands, calcMaxDrawdown,
} from '../../services/indicatorService';
import { fetchPriceHistoryLong } from '../../services/priceService';
import { Glass, Badge, Pill, SectionLabel } from '../../components';
import { LoadingScreen, EmptyState } from '../../components/States';
import InteractiveChart from '../../components/InteractiveChart';

// ═══════════ CONSTANTS ═══════════

var PERIODS = [
  { key: '1M', days: 30 },
  { key: '3M', days: 90 },
  { key: '6M', days: 180 },
  { key: '1A', days: 365 },
  { key: 'Tudo', days: 0 },
];

var PROV_FILTERS = [
  { k: 'todos', l: 'Todos' },
  { k: 'dividendo', l: 'Dividendos' },
  { k: 'jcp', l: 'JCP' },
  { k: 'rendimento', l: 'Rendimento' },
];

var MONTH_LABELS = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

var CAT_COLORS = { acao: C.acoes, fii: C.fiis, etf: C.etfs, rf: C.rf };
var CAT_LABELS = { acao: 'Ações', fii: 'FIIs', etf: 'ETFs' };

var PERF_SUBS = [
  { k: 'todos', l: 'Todos' },
  { k: 'acao', l: 'Ação' },
  { k: 'fii', l: 'FII' },
  { k: 'etf', l: 'ETF' },
  { k: 'opcoes', l: 'Opções' },
  { k: 'rf', l: 'RF' },
];

var PERF_SUB_COLORS = {
  todos: C.accent, acao: C.acoes, fii: C.fiis, etf: C.etfs, opcoes: C.opcoes, rf: C.rf,
};

var OPC_STATUS_LABELS = { ativa: 'Ativa', exercida: 'Exercida', expirada: 'Expirada', fechada: 'Fechada', expirou_po: 'Expirou PO' };
var OPC_STATUS_COLORS = { ativa: C.accent, exercida: C.green, expirada: C.dim, fechada: C.yellow, expirou_po: C.green };

var RF_TIPO_LABELS = {
  cdb: 'CDB', lci_lca: 'LCI/LCA', tesouro_selic: 'Tesouro Selic',
  tesouro_ipca: 'Tesouro IPCA+', tesouro_pre: 'Tesouro Pre', debenture: 'Debenture',
};

var RF_IDX_LABELS = { prefixado: 'Prefixado', cdi: 'CDI', ipca: 'IPCA+', selic: 'Selic' };
var RF_IDX_COLORS = { prefixado: C.green, cdi: C.accent, ipca: C.fiis, selic: C.rf };

var RF_ISENTOS = { lci_lca: true, debenture: true };

// ═══════════ HELPERS ═══════════

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtC(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function rfIRAliquota(diasCorridos) {
  if (diasCorridos <= 180) return 0.225;
  if (diasCorridos <= 360) return 0.20;
  if (diasCorridos <= 720) return 0.175;
  return 0.15;
}

function rfIRFaixa(diasCorridos) {
  if (diasCorridos <= 180) return '22,5%';
  if (diasCorridos <= 360) return '20%';
  if (diasCorridos <= 720) return '17,5%';
  return '15%';
}

function rfCDIEquivalente(taxaIsenta, aliquotaIR) {
  if (aliquotaIR >= 1) return taxaIsenta;
  return taxaIsenta / (1 - aliquotaIR);
}

function rfValorAtualEstimado(valorAplicado, taxa, indexador, dataAplicacao, selicAnual) {
  var hoje = new Date();
  var inicio = new Date(dataAplicacao);
  var diasCorridos = Math.max(Math.ceil((hoje - inicio) / (1000 * 60 * 60 * 24)), 0);
  var anos = diasCorridos / 365;
  if (anos <= 0) return valorAplicado;

  if (indexador === 'prefixado') {
    return valorAplicado * Math.pow(1 + taxa / 100, anos);
  } else if (indexador === 'cdi') {
    var cdiAnual = (selicAnual || 13.25) - 0.10;
    var taxaEfetiva = cdiAnual * (taxa / 100);
    return valorAplicado * Math.pow(1 + taxaEfetiva / 100, anos);
  } else if (indexador === 'selic') {
    var selicEfetiva = (selicAnual || 13.25) + (taxa || 0) / 100;
    return valorAplicado * Math.pow(1 + selicEfetiva / 100, anos);
  } else if (indexador === 'ipca') {
    var ipcaEstimado = 4.5;
    var taxaTotal = ipcaEstimado + (taxa || 0);
    return valorAplicado * Math.pow(1 + taxaTotal / 100, anos);
  }
  return valorAplicado * Math.pow(1 + (taxa || 0) / 100, anos);
}

function bizDaysBetween(d1, d2) {
  var count = 0;
  var d = new Date(d1);
  d.setDate(d.getDate() + 1);
  while (d <= d2) {
    var dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function computeMonthlyReturns(history) {
  if (!history || history.length < 2) return [];
  var months = {};
  history.forEach(function(pt) {
    var key = pt.date.substring(0, 7);
    if (!months[key]) months[key] = { first: pt.value, last: pt.value };
    months[key].last = pt.value;
  });
  var keys = Object.keys(months).sort();
  var returns = [];
  for (var i = 1; i < keys.length; i++) {
    var prev = months[keys[i - 1]].last;
    var curr = months[keys[i]].last;
    var ret = prev > 0 ? ((curr - prev) / prev) * 100 : 0;
    returns.push({ month: keys[i], pct: ret });
  }
  return returns;
}

function computeCDIAccumulated(history, selicAnual) {
  if (!history || history.length < 2) return [];
  var cdiAnual = (selicAnual || 13.25) - 0.10;
  var dailyRate = Math.pow(1 + cdiAnual / 100, 1 / 252) - 1;
  var result = [{ date: history[0].date, value: 0 }];
  var accum = 0;
  for (var i = 1; i < history.length; i++) {
    var prev = new Date(history[i - 1].date + 'T12:00:00');
    var curr = new Date(history[i].date + 'T12:00:00');
    var bizDays = 0;
    var d = new Date(prev);
    d.setDate(d.getDate() + 1);
    while (d <= curr) {
      var dow = d.getDay();
      if (dow !== 0 && dow !== 6) bizDays++;
      d.setDate(d.getDate() + 1);
    }
    accum = (1 + accum / 100) * Math.pow(1 + dailyRate, bizDays) - 1;
    accum = accum * 100;
    result.push({ date: history[i].date, value: accum });
  }
  return result;
}

// ═══════════ IR COMPUTATION ═══════════

function computeIR(ops) {
  var sorted = (ops || []).slice().sort(function(a, b) {
    return (a.data || '').localeCompare(b.data || '');
  });

  var pmMap = {};
  var monthResults = {};

  sorted.forEach(function(op) {
    var ticker = op.ticker;
    var cat = op.categoria || 'acao';

    if (!pmMap[ticker]) {
      pmMap[ticker] = { qty: 0, custoTotal: 0, categoria: cat };
    }
    var pos = pmMap[ticker];

    if (op.tipo === 'compra') {
      var custos = (op.custo_corretagem || 0) + (op.custo_emolumentos || 0) + (op.custo_impostos || 0);
      pos.custoTotal += op.quantidade * op.preco + custos;
      pos.qty += op.quantidade;
    } else if (op.tipo === 'venda') {
      var pm = pos.qty > 0 ? pos.custoTotal / pos.qty : 0;
      var vendaTotal = op.quantidade * op.preco;
      var custoVenda = op.quantidade * pm;
      var ganho = vendaTotal - custoVenda;

      pos.custoTotal -= custoVenda;
      pos.qty -= op.quantidade;
      if (pos.qty <= 0) { pos.qty = 0; pos.custoTotal = 0; }

      var mKey = (op.data || '').substring(0, 7);
      if (!mKey) return;
      if (!monthResults[mKey]) {
        monthResults[mKey] = {
          vendasAcoes: 0, ganhoAcoes: 0, perdaAcoes: 0,
          vendasFII: 0, ganhoFII: 0, perdaFII: 0,
          vendasETF: 0, ganhoETF: 0, perdaETF: 0,
        };
      }
      var mr = monthResults[mKey];

      if (cat === 'fii') {
        mr.vendasFII += vendaTotal;
        if (ganho >= 0) mr.ganhoFII += ganho; else mr.perdaFII += Math.abs(ganho);
      } else if (cat === 'etf') {
        mr.vendasETF += vendaTotal;
        if (ganho >= 0) mr.ganhoETF += ganho; else mr.perdaETF += Math.abs(ganho);
      } else {
        mr.vendasAcoes += vendaTotal;
        if (ganho >= 0) mr.ganhoAcoes += ganho; else mr.perdaAcoes += Math.abs(ganho);
      }
    }
  });

  return monthResults;
}

function computeTaxByMonth(monthResults) {
  var months = Object.keys(monthResults).sort();
  var prejAcumAcoes = 0;
  var prejAcumFII = 0;
  var prejAcumETF = 0;
  var results = [];

  months.forEach(function(mKey) {
    var mr = monthResults[mKey];
    var saldoAcoes = mr.ganhoAcoes - mr.perdaAcoes - prejAcumAcoes;
    var saldoFII = mr.ganhoFII - mr.perdaFII - prejAcumFII;
    var saldoETF = mr.ganhoETF - mr.perdaETF - prejAcumETF;

    var impostoAcoes = 0;
    if (mr.vendasAcoes > 20000 && saldoAcoes > 0) {
      impostoAcoes = saldoAcoes * 0.15;
      prejAcumAcoes = 0;
    } else if (saldoAcoes < 0) {
      prejAcumAcoes = Math.abs(saldoAcoes);
    } else {
      prejAcumAcoes = 0;
    }

    var impostoFII = 0;
    if (saldoFII > 0) {
      impostoFII = saldoFII * 0.20;
      prejAcumFII = 0;
    } else if (saldoFII < 0) {
      prejAcumFII = Math.abs(saldoFII);
    } else {
      prejAcumFII = 0;
    }

    var impostoETF = 0;
    if (saldoETF > 0) {
      impostoETF = saldoETF * 0.15;
      prejAcumETF = 0;
    } else if (saldoETF < 0) {
      prejAcumETF = Math.abs(saldoETF);
    } else {
      prejAcumETF = 0;
    }

    results.push({
      month: mKey,
      vendasAcoes: mr.vendasAcoes, vendasFII: mr.vendasFII, vendasETF: mr.vendasETF,
      ganhoAcoes: mr.ganhoAcoes, perdaAcoes: mr.perdaAcoes,
      ganhoFII: mr.ganhoFII, perdaFII: mr.perdaFII,
      ganhoETF: mr.ganhoETF, perdaETF: mr.perdaETF,
      saldoAcoes: saldoAcoes, saldoFII: saldoFII, saldoETF: saldoETF,
      impostoAcoes: impostoAcoes, impostoFII: impostoFII, impostoETF: impostoETF,
      impostoTotal: impostoAcoes + impostoFII + impostoETF,
      alertaAcoes20k: mr.vendasAcoes > 20000,
      prejAcumAcoes: prejAcumAcoes, prejAcumFII: prejAcumFII, prejAcumETF: prejAcumETF,
    });
  });

  return results;
}

// ═══════════ INLINE SVG: Benchmark Chart ═══════════

function BenchmarkChart(props) {
  var portData = props.portData || [];
  var cdiData = props.cdiData || [];
  var _w = useState(0); var w = _w[0]; var setW = _w[1];
  var h = 120;
  var pad = { top: 16, right: 8, bottom: 20, left: 36 };

  if (portData.length < 2 || w === 0) {
    return (
      <View onLayout={function(e) { setW(e.nativeEvent.layout.width); }}
        style={{ height: h }} />
    );
  }

  var allVals = portData.map(function(d) { return d.value; })
    .concat(cdiData.map(function(d) { return d.value; }));
  var minV = Math.min.apply(null, allVals);
  var maxV = Math.max.apply(null, allVals);
  if (maxV === minV) { maxV = minV + 1; }

  var chartW = w - pad.left - pad.right;
  var chartH = h - pad.top - pad.bottom;

  function toX(i, len) { return pad.left + (i / Math.max(len - 1, 1)) * chartW; }
  function toY(v) { return pad.top + (1 - (v - minV) / (maxV - minV)) * chartH; }

  function buildLine(data) {
    if (data.length < 2) return '';
    var d = 'M ' + toX(0, data.length) + ' ' + toY(data[0].value);
    for (var i = 1; i < data.length; i++) {
      var px = toX(i - 1, data.length); var py = toY(data[i - 1].value);
      var cx = toX(i, data.length); var cy = toY(data[i].value);
      var mx = (px + cx) / 2;
      d += ' C ' + mx + ' ' + py + ', ' + mx + ' ' + cy + ', ' + cx + ' ' + cy;
    }
    return d;
  }

  var gridLines = [];
  var steps = 3;
  for (var gi = 0; gi <= steps; gi++) {
    var gv = minV + (maxV - minV) * (gi / steps);
    var gy = toY(gv);
    gridLines.push({ y: gy, label: gv.toFixed(1) + '%' });
  }

  var portLine = buildLine(portData);
  var cdiLine = buildLine(cdiData);
  var portFinal = portData.length > 0 ? portData[portData.length - 1].value : 0;
  var cdiFinal = cdiData.length > 0 ? cdiData[cdiData.length - 1].value : 0;

  return (
    <View onLayout={function(e) { setW(e.nativeEvent.layout.width); }}>
      <Svg width={w} height={h}>
        {gridLines.map(function(gl, i) {
          return (
            <G key={'g' + i}>
              <SvgLine x1={pad.left} y1={gl.y} x2={w - pad.right} y2={gl.y}
                stroke={C.border} strokeWidth={1} />
              <SvgText x={pad.left - 4} y={gl.y + 3} fill={C.dim}
                fontSize={8} fontFamily={F.mono} textAnchor="end">{gl.label}</SvgText>
            </G>
          );
        })}
        {portLine ? <Path d={portLine} fill="none" stroke={C.accent} strokeWidth={2} /> : null}
        {cdiLine ? <Path d={cdiLine} fill="none" stroke={C.etfs} strokeWidth={1.5}
          strokeDasharray="4,3" /> : null}
      </Svg>
      <View style={styles.benchLegend}>
        <View style={styles.benchLegendItem}>
          <View style={[styles.benchLegendDot, { backgroundColor: C.accent }]} />
          <Text style={styles.benchLegendLabel}>Carteira</Text>
          <Text style={[styles.benchLegendValue, { color: portFinal >= 0 ? C.green : C.red }]}>
            {portFinal >= 0 ? '+' : ''}{portFinal.toFixed(2)}%
          </Text>
        </View>
        <View style={styles.benchLegendItem}>
          <View style={[styles.benchLegendDot, { backgroundColor: C.etfs }]} />
          <Text style={styles.benchLegendLabel}>CDI</Text>
          <Text style={[styles.benchLegendValue, { color: C.etfs }]}>
            +{cdiFinal.toFixed(2)}%
          </Text>
        </View>
      </View>
    </View>
  );
}

// ═══════════ TREEMAP ═══════════

function Treemap(props) {
  var items = props.items || [];
  var _w = useState(0);
  var width = _w[0]; var setWidth = _w[1];
  var height = props.height || 140;

  if (items.length === 0 || width === 0) {
    return <View onLayout={function (e) { setWidth(e.nativeEvent.layout.width); }} style={{ height: height }} />;
  }

  var total = items.reduce(function (s, it) { return s + Math.abs(it.weight); }, 0);
  if (total === 0) return <View style={{ height: height }} />;

  var sorted = items.slice().sort(function (a, b) { return Math.abs(b.weight) - Math.abs(a.weight); });
  var rects = [];
  var x = 0;

  sorted.forEach(function (item) {
    var pct = Math.abs(item.weight) / total;
    var w = Math.max(pct * width, 2);
    rects.push({ x: x, y: 0, w: w, h: height, item: item });
    x += w;
  });

  return (
    <View onLayout={function (e) { setWidth(e.nativeEvent.layout.width); }}>
      <Svg width={width} height={height}>
        {rects.map(function (r, i) {
          var pnlPct = r.item.pnlPct || 0;
          var intensity = clamp(Math.abs(pnlPct) / 20, 0.15, 0.6);
          var fill = pnlPct >= 0 ? C.green : C.red;
          var showLabel = r.w > 35;
          return (
            <G key={i}>
              <SvgRect x={r.x + 1} y={1} width={Math.max(r.w - 2, 1)} height={r.h - 2}
                rx={6} fill={fill} opacity={intensity} />
              {showLabel ? (
                <G>
                  <SvgText x={r.x + r.w / 2} y={r.h / 2 - 8} fill="#fff" fontSize="10"
                    fontWeight="700" textAnchor="middle" opacity="0.9">
                    {r.item.ticker}
                  </SvgText>
                  <SvgText x={r.x + r.w / 2} y={r.h / 2 + 6} fill="#fff" fontSize="8"
                    textAnchor="middle" opacity="0.6">
                    {(r.item.weight / total * 100).toFixed(1)}%
                  </SvgText>
                  <SvgText x={r.x + r.w / 2} y={r.h / 2 + 18} fill={pnlPct >= 0 ? '#4ade80' : '#fb7185'}
                    fontSize="8" fontWeight="600" textAnchor="middle">
                    {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                  </SvgText>
                </G>
              ) : null}
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

// ═══════════ HBAR ═══════════

function HBar(props) {
  var label = props.label;
  var value = props.value;
  var maxValue = props.maxValue || 100;
  var color = props.color || C.accent;
  var suffix = props.suffix || '%';
  var isNeg = value < 0;
  var barPct = clamp(Math.abs(value) / Math.abs(maxValue) * 100, 2, 100);

  return (
    <View style={styles.hbarRow}>
      <Text style={styles.hbarLabel} numberOfLines={1}>{label}</Text>
      <View style={styles.hbarTrack}>
        <View style={[styles.hbarFill, {
          width: barPct + '%',
          backgroundColor: color + (isNeg ? '60' : '40'),
          borderColor: color + '80',
        }]} />
      </View>
      <Text style={[styles.hbarValue, { color: isNeg ? C.red : color }]}>
        {isNeg ? '' : '+'}{value.toFixed(1)}{suffix}
      </Text>
    </View>
  );
}

// ═══════════ REBALANCEAMENTO ═══════════

var CAT_NAMES_REBAL = { acao: 'Acoes', fii: 'FIIs', etf: 'ETFs', rf: 'RF' };

function RebalanceTool(props) {
  var allocAtual = props.allocAtual || {};
  var totalCarteira = props.totalCarteira || 0;

  var DEFAULT_TARGETS = { acao: 40, fii: 25, etf: 20, rf: 15 };
  var _targets = useState(DEFAULT_TARGETS);
  var targets = _targets[0]; var setTargets = _targets[1];
  var _editing = useState(false);
  var isEditing = _editing[0]; var setEditing = _editing[1];

  var classes = ['acao', 'fii', 'etf', 'rf'];
  var totalTargetPct = classes.reduce(function (s, k) { return s + (targets[k] || 0); }, 0);

  function updateTarget(cat, val) {
    var num = parseInt(val) || 0;
    num = clamp(num, 0, 100);
    var copy = {};
    Object.keys(targets).forEach(function (k) { copy[k] = targets[k]; });
    copy[cat] = num;
    setTargets(copy);
  }

  return (
    <Glass padding={14}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={styles.sectionTitle}>REBALANCEAMENTO</Text>
        <TouchableOpacity onPress={function () {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setEditing(!isEditing);
        }}>
          <Text style={{ fontSize: 10, color: C.accent, fontFamily: F.mono }}>
            {isEditing ? '✓ Salvar' : '✎ Editar metas'}
          </Text>
        </TouchableOpacity>
      </View>

      {totalTargetPct !== 100 && isEditing ? (
        <View style={{ padding: 6, borderRadius: 6, backgroundColor: C.red + '10', marginBottom: 8 }}>
          <Text style={{ fontSize: 11, color: C.red, fontFamily: F.mono, textAlign: 'center' }}>
            {'Total das metas: ' + totalTargetPct + '% (deve ser 100%)'}
          </Text>
        </View>
      ) : null}

      <View style={styles.rebalHeader}>
        <Text style={[styles.rebalColLabel, { flex: 2 }]}>Classe</Text>
        <Text style={styles.rebalColLabel}>Atual</Text>
        <Text style={styles.rebalColLabel}>Meta</Text>
        <Text style={styles.rebalColLabel}>Dif.</Text>
        <Text style={[styles.rebalColLabel, { flex: 1.5 }]}>Ação</Text>
      </View>

      {classes.map(function (cat) {
        var color = PRODUCT_COLORS[cat] || C.accent;
        var nome = CAT_NAMES_REBAL[cat] || cat;
        var atualVal = allocAtual[cat] || 0;
        var atualPct = totalCarteira > 0 ? (atualVal / totalCarteira) * 100 : 0;
        var metaPct = targets[cat] || 0;
        var diff = atualPct - metaPct;
        var diffColor = Math.abs(diff) < 2 ? C.green : diff > 0 ? C.yellow : C.red;
        var metaVal = (metaPct / 100) * totalCarteira;
        var ajuste = metaVal - atualVal;

        return (
          <View key={cat} style={styles.rebalRow}>
            <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
              <Text style={{ fontSize: 11, color: C.text, fontWeight: '600', fontFamily: F.body }}>{nome}</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.mono }}>{atualPct.toFixed(1)}%</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              {isEditing ? (
                <TextInput
                  style={styles.rebalInput}
                  value={String(targets[cat] || 0)}
                  onChangeText={function (v) { updateTarget(cat, v); }}
                  keyboardType="numeric"
                  maxLength={3}
                />
              ) : (
                <Text style={{ fontSize: 11, color: C.accent, fontWeight: '600', fontFamily: F.mono }}>
                  {metaPct}%
                </Text>
              )}
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 11, color: diffColor, fontWeight: '600', fontFamily: F.mono }}>
                {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
              </Text>
            </View>
            <View style={{ flex: 1.5, alignItems: 'flex-end' }}>
              {Math.abs(ajuste) > 50 ? (
                <Text style={{ fontSize: 11, color: ajuste > 0 ? C.green : C.red, fontWeight: '600', fontFamily: F.mono }}>
                  {ajuste > 0 ? '+ Comprar' : '- Vender'}
                </Text>
              ) : (
                <Text style={{ fontSize: 11, color: C.green, fontFamily: F.mono }}>OK</Text>
              )}
              {Math.abs(ajuste) > 50 ? (
                <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>
                  {'R$ ' + fmt(Math.abs(ajuste))}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}

      <View style={{ marginTop: 10, gap: 6 }}>
        {classes.map(function (cat) {
          var color = PRODUCT_COLORS[cat] || C.accent;
          var atualPct = totalCarteira > 0 ? ((allocAtual[cat] || 0) / totalCarteira) * 100 : 0;
          var metaPct = targets[cat] || 0;
          return (
            <View key={cat} style={{ gap: 2 }}>
              <View style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.03)' }}>
                <View style={{ height: 4, borderRadius: 2, backgroundColor: color + '60',
                  width: clamp(atualPct, 0, 100) + '%' }} />
              </View>
              <View style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.03)' }}>
                <View style={{ height: 4, borderRadius: 2, backgroundColor: color,
                  width: clamp(metaPct, 0, 100) + '%', opacity: 0.3 }} />
              </View>
            </View>
          );
        })}
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 8, height: 4, borderRadius: 1, backgroundColor: C.accent + '60' }} />
            <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>Atual</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 8, height: 4, borderRadius: 1, backgroundColor: C.accent + '30' }} />
            <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>Meta</Text>
          </View>
        </View>
      </View>
    </Glass>
  );
}

// ═══════════ INLINE SVG: Proventos Bar Chart ═══════════

function ProvBarChart(props) {
  var data = props.data || [];
  var maxVal = props.maxVal || 1;
  var _w = useState(0); var w = _w[0]; var setW = _w[1];
  var barH = 18;
  var gap = 3;
  var labelW = 48;
  var valW = 60;
  var totalH = data.length * (barH + gap);

  if (data.length === 0) return null;

  return (
    <View onLayout={function(e) { setW(e.nativeEvent.layout.width); }}>
      {w > 0 ? (
        <Svg width={w} height={totalH}>
          {data.map(function(d, i) {
            var y = i * (barH + gap);
            var barW = maxVal > 0 ? ((d.value / maxVal) * (w - labelW - valW - 12)) : 0;
            barW = Math.max(barW, 2);
            return (
              <G key={i}>
                <SvgText x={2} y={y + barH / 2 + 4} fill={C.sub}
                  fontSize={9} fontFamily={F.mono}>{d.month}</SvgText>
                <SvgRect x={labelW} y={y + 2} width={barW} height={barH - 4}
                  rx={4} fill={C.fiis} opacity={0.5} />
                <SvgText x={w - 2} y={y + barH / 2 + 4} fill={C.green}
                  fontSize={9} fontFamily={F.mono} fontWeight="600" textAnchor="end">
                  {'R$ ' + fmt(d.value)}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}

// ═══════════ INLINE SVG: Premios Vertical Bar Chart ═══════════

function PremiosBarChart(props) {
  var data = props.data || [];
  var showCall = props.showCall;
  var showPut = props.showPut;
  var selected = props.selected != null ? props.selected : -1;
  var onSelect = props.onSelect || function() {};

  var _w = useState(0); var w = _w[0]; var setW = _w[1];

  var chartH = 180;
  var topPad = 30;
  var bottomPad = 28;
  var leftPad = 38;
  var rightPad = 8;
  var drawH = chartH - topPad - bottomPad;
  var drawW = w - leftPad - rightPad;

  // Max is always based on total for consistent scale
  var maxVal = 0;
  for (var mi = 0; mi < data.length; mi++) {
    var v = data[mi].total || 0;
    if (v > maxVal) maxVal = v;
  }
  if (maxVal === 0) maxVal = 1;

  var slotW = data.length > 0 ? drawW / data.length : 0;
  var totalBarW = data.length > 0 ? Math.max(slotW - 4, 6) : 6;
  var hasOverlay = showCall || showPut;
  // Sub-bars are narrower; if both shown, split the slot
  var subCount = (showCall ? 1 : 0) + (showPut ? 1 : 0);
  var subBarW = subCount > 0 ? Math.max((totalBarW - 2) / subCount, 4) : 0;

  var gridLines = [0, maxVal * 0.5, maxVal];

  function handleTouch(e) {
    if (drawW <= 0 || data.length === 0) return;
    var x = e.nativeEvent.locationX - leftPad;
    var idx = Math.floor(x / slotW);
    if (idx < 0) idx = 0;
    if (idx >= data.length) idx = data.length - 1;
    onSelect(idx === selected ? -1 : idx);
  }

  function barY(val) {
    var h = maxVal > 0 ? (val / maxVal) * drawH : 0;
    if (val > 0 && h < 2) h = 2;
    return { y: topPad + drawH - h, h: h };
  }

  if (data.length === 0) return null;

  return (
    <View onLayout={function(e) { setW(e.nativeEvent.layout.width); }}>
      {w > 0 ? (
        <TouchableOpacity activeOpacity={1} onPress={handleTouch}>
          <Svg width={w} height={chartH}>
            {/* Grid lines */}
            {gridLines.map(function(gv, gi) {
              var gy = topPad + drawH - (gv / maxVal) * drawH;
              return (
                <G key={'g' + gi}>
                  <SvgLine x1={leftPad} y1={gy} x2={w - rightPad} y2={gy}
                    stroke={C.border} strokeWidth={0.5} strokeDasharray="3,3" />
                  <SvgText x={leftPad - 4} y={gy + 3} fill={C.dim}
                    fontSize={8} fontFamily={F.mono} textAnchor="end">
                    {fmtC(gv)}
                  </SvgText>
                </G>
              );
            })}

            {/* Bars */}
            {data.map(function(d, i) {
              var isSelected = i === selected;
              var slotX = leftPad + i * slotW;
              var barX = slotX + (slotW - totalBarW) / 2;
              var totalB = barY(d.total || 0);
              var totalOpacity = hasOverlay
                ? (selected === -1 ? 0.25 : (isSelected ? 0.35 : 0.12))
                : (selected === -1 ? 0.7 : (isSelected ? 1 : 0.35));

              var monthParts = (d.month || '').split('/');
              var monthLabel = monthParts[0] || '';

              // Build tooltip lines
              var tipLines = [];
              if (isSelected) {
                tipLines.push({ label: 'Total', value: d.total || 0, color: C.text });
                if (showCall) tipLines.push({ label: 'C', value: d.call || 0, color: C.acoes });
                if (showPut) tipLines.push({ label: 'P', value: d.put || 0, color: C.green });
              }

              // Tooltip height
              var tipH = tipLines.length > 1 ? 12 * tipLines.length + 4 : 16;
              var tipW = 72;
              var tipY = totalB.y - tipH - 4;
              if (tipY < 0) tipY = 0;

              return (
                <G key={'b' + i}>
                  {/* Total bar (background) */}
                  <SvgRect x={barX} y={totalB.y} width={totalBarW} height={totalB.h}
                    rx={3} fill={C.opcoes} opacity={totalOpacity} />

                  {/* Call/Put overlay bars */}
                  {hasOverlay ? (function() {
                    var elems = [];
                    var subIdx = 0;
                    var subOpBase = selected === -1 ? 0.8 : (isSelected ? 1 : 0.3);
                    if (showCall) {
                      var cb = barY(d.call || 0);
                      var cx = barX + 1 + subIdx * subBarW;
                      elems.push(
                        <SvgRect key="c" x={cx} y={cb.y} width={subBarW - 1} height={cb.h}
                          rx={2} fill={C.acoes} opacity={subOpBase} />
                      );
                      subIdx++;
                    }
                    if (showPut) {
                      var pb = barY(d.put || 0);
                      var px = barX + 1 + subIdx * subBarW;
                      elems.push(
                        <SvgRect key="p" x={px} y={pb.y} width={subBarW - 1} height={pb.h}
                          rx={2} fill={C.green} opacity={subOpBase} />
                      );
                    }
                    return elems;
                  })() : null}

                  {/* Tooltip */}
                  {isSelected && (d.total || 0) > 0 ? (
                    <G>
                      <SvgRect x={barX + totalBarW / 2 - tipW / 2} y={tipY}
                        width={tipW} height={tipH} rx={4} fill={C.surface} opacity={0.95} />
                      {tipLines.length <= 1 ? (
                        <SvgText x={barX + totalBarW / 2} y={tipY + 11} fill={C.text}
                          fontSize={9} fontFamily={F.mono} fontWeight="600" textAnchor="middle">
                          {'R$ ' + fmt(d.total || 0)}
                        </SvgText>
                      ) : tipLines.map(function(tl, ti) {
                        return (
                          <SvgText key={'t' + ti} x={barX + totalBarW / 2} y={tipY + 11 + ti * 12}
                            fill={tl.color} fontSize={8} fontFamily={F.mono} fontWeight="600" textAnchor="middle">
                            {tl.label + ' R$ ' + fmt(tl.value)}
                          </SvgText>
                        );
                      })}
                    </G>
                  ) : null}

                  {/* Month label */}
                  <SvgText x={barX + totalBarW / 2} y={chartH - 6} fill={isSelected ? C.text : C.dim}
                    fontSize={8} fontFamily={F.mono} textAnchor="middle" fontWeight={isSelected ? '600' : '400'}>
                    {monthLabel}
                  </SvgText>
                </G>
              );
            })}
          </Svg>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ═══════════ MAIN COMPONENT ═══════════

export default function AnaliseScreen() {
  var _auth = useAuth(); var user = _auth.user;

  // State
  var _sub = useState('perf'); var sub = _sub[0]; var setSub = _sub[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _refreshing = useState(false); var refreshing = _refreshing[0]; var setRefreshing = _refreshing[1];
  var _dashboard = useState(null); var dashboard = _dashboard[0]; var setDashboard = _dashboard[1];
  var _positions = useState([]); var positions = _positions[0]; var setPositions = _positions[1];
  var _proventos = useState([]); var proventos = _proventos[0]; var setProventos = _proventos[1];
  var _operacoes = useState([]); var operacoes = _operacoes[0]; var setOperacoes = _operacoes[1];
  var _profile = useState(null); var profile = _profile[0]; var setProfile = _profile[1];
  var _perfPeriod = useState('Tudo'); var perfPeriod = _perfPeriod[0]; var setPerfPeriod = _perfPeriod[1];
  var _provFilter = useState('todos'); var provFilter = _provFilter[0]; var setProvFilter = _provFilter[1];
  var _chartTouching = useState(false); var chartTouching = _chartTouching[0]; var setChartTouching = _chartTouching[1];
  var _perfSub = useState('todos'); var perfSub = _perfSub[0]; var setPerfSub = _perfSub[1];
  var _rendaFixa = useState([]); var rendaFixa = _rendaFixa[0]; var setRendaFixa = _rendaFixa[1];
  var _opcoes = useState([]); var opcoes = _opcoes[0]; var setOpcoes = _opcoes[1];
  var _opcShowCall = useState(false); var opcShowCall = _opcShowCall[0]; var setOpcShowCall = _opcShowCall[1];
  var _opcShowPut = useState(false); var opcShowPut = _opcShowPut[0]; var setOpcShowPut = _opcShowPut[1];
  var _opcPremSelected = useState(-1); var opcPremSelected = _opcPremSelected[0]; var setOpcPremSelected = _opcPremSelected[1];
  var _indicators = useState([]); var indicators = _indicators[0]; var setIndicators = _indicators[1];
  var _searchTicker = useState(''); var searchTicker = _searchTicker[0]; var setSearchTicker = _searchTicker[1];
  var _searchLoading = useState(false); var searchLoading = _searchLoading[0]; var setSearchLoading = _searchLoading[1];
  var _searchResult = useState(null); var searchResult = _searchResult[0]; var setSearchResult = _searchResult[1];
  var _searchError = useState(''); var searchError = _searchError[0]; var setSearchError = _searchError[1];

  // ── Data loading ──
  var load = async function() {
    if (!user) return;
    try {
      var results = await Promise.all([
        getDashboard(user.id),
        getProventos(user.id),
        getOperacoes(user.id),
        getProfile(user.id),
        getOpcoes(user.id),
        getIndicators(user.id),
      ]);
      setDashboard(results[0]);
      setPositions(results[0].positions || []);
      setRendaFixa(results[0].rendaFixa || []);
      setProventos(results[1].data || []);
      setOperacoes(results[2].data || []);
      setProfile(results[3].data || null);
      setOpcoes(results[4].data || []);
      var indData = results[5].data || [];
      setIndicators(indData);

      // Trigger daily calculation if stale
      var lastCalc = indData.length > 0 ? indData[0].data_calculo : null;
      if (shouldCalculateToday(lastCalc)) {
        runDailyCalculation(user.id).then(function(calcResult) {
          if (calcResult.data && calcResult.data.length > 0) {
            setIndicators(calcResult.data);
          }
        }).catch(function(e) {
          console.warn('Indicator calc failed:', e);
        });
      }
    } catch (e) {
      console.warn('AnaliseScreen load error:', e);
    }
    setLoading(false);
  };

  var onRefresh = async function() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  useFocusEffect(useCallback(function() { load(); }, [user]));

  // ── Derived: Performance ──
  var patrimonioHistory = dashboard ? (dashboard.patrimonioHistory || []) : [];
  var totalPatrimonio = dashboard ? (dashboard.patrimonio || 0) : 0;
  var selicAnual = profile ? (profile.selic || 13.25) : 13.25;

  // Filter by period
  var filteredHistory = patrimonioHistory;
  if (perfPeriod !== 'Tudo' && patrimonioHistory.length > 0) {
    var periodDef = PERIODS.find(function(p) { return p.key === perfPeriod; });
    if (periodDef && periodDef.days > 0) {
      var cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - periodDef.days);
      var cutoffStr = cutoff.toISOString().substring(0, 10);
      filteredHistory = patrimonioHistory.filter(function(pt) {
        return pt.date >= cutoffStr;
      });
    }
  }
  if (filteredHistory.length === 0 && patrimonioHistory.length > 0) {
    filteredHistory = patrimonioHistory;
  }

  // Rentabilidade do período
  var rentPct = 0;
  if (filteredHistory.length >= 2) {
    var firstVal = filteredHistory[0].value;
    var lastVal = filteredHistory[filteredHistory.length - 1].value;
    rentPct = firstVal > 0 ? ((lastVal - firstVal) / firstVal) * 100 : 0;
  }

  // CDI do período
  var cdiPct = 0;
  if (filteredHistory.length >= 2) {
    var cdiLine = computeCDIAccumulated(filteredHistory, selicAnual);
    cdiPct = cdiLine.length > 0 ? cdiLine[cdiLine.length - 1].value : 0;
  }

  // Monthly returns for best/worst
  var monthlyReturns = computeMonthlyReturns(filteredHistory);
  var bestMonth = null;
  var worstMonth = null;
  if (monthlyReturns.length > 0) {
    bestMonth = monthlyReturns.reduce(function(best, r) {
      return r.pct > best.pct ? r : best;
    }, monthlyReturns[0]);
    worstMonth = monthlyReturns.reduce(function(worst, r) {
      return r.pct < worst.pct ? r : worst;
    }, monthlyReturns[0]);
  }

  // Benchmark data (normalized % returns)
  var portBenchData = [];
  var cdiBenchData = [];
  if (filteredHistory.length >= 2) {
    var base = filteredHistory[0].value;
    portBenchData = filteredHistory.map(function(pt) {
      return { date: pt.date, value: base > 0 ? ((pt.value - base) / base) * 100 : 0 };
    });
    cdiBenchData = computeCDIAccumulated(filteredHistory, selicAnual);
  }

  // ── Derived: Category Performance (Acao/FII/ETF) ──
  var catPositions = [];
  var catTotalInvested = 0;
  var catCurrentValue = 0;
  var catPL = 0;
  var catRentPct = 0;
  var catPctCDI = 0;
  var catDividendsTotal = 0;
  var catDividends12m = 0;
  var catYieldOnCost = 0;
  var catRetornoTotal = 0;
  var catRetornoTotalPct = 0;
  var catPesoCarteira = 0;
  var catRankedPositions = [];
  var catMonthlyDividends = [];
  var catRendaMensal = 0;
  var catMesesPositivos = 0;
  var catMesesNegativos = 0;

  if (perfSub === 'acao' || perfSub === 'fii' || perfSub === 'etf') {
    for (var cp = 0; cp < positions.length; cp++) {
      if ((positions[cp].categoria || 'acao') === perfSub) {
        catPositions.push(positions[cp]);
      }
    }
    for (var ci = 0; ci < catPositions.length; ci++) {
      var cPos = catPositions[ci];
      var cInvested = cPos.quantidade * cPos.pm;
      var cCurrent = cPos.quantidade * (cPos.preco_atual || cPos.pm);
      catTotalInvested += cInvested;
      catCurrentValue += cCurrent;
    }
    catPL = catCurrentValue - catTotalInvested;
    catRentPct = catTotalInvested > 0 ? ((catCurrentValue - catTotalInvested) / catTotalInvested) * 100 : 0;
    catPctCDI = cdiPct > 0 ? (catRentPct / cdiPct * 100) : 0;
    catPesoCarteira = totalPatrimonio > 0 ? (catCurrentValue / totalPatrimonio * 100) : 0;

    // Dividends: total, 12m, per ticker, monthly
    var oneYrAgo = new Date();
    oneYrAgo.setFullYear(oneYrAgo.getFullYear() - 1);
    var catTickerSet = {};
    for (var ct = 0; ct < catPositions.length; ct++) {
      catTickerSet[catPositions[ct].ticker] = true;
    }
    var catProvByMonth = {};
    var catProvByTicker = {};
    for (var cdp = 0; cdp < proventos.length; cdp++) {
      var prov = proventos[cdp];
      if (!catTickerSet[prov.ticker]) continue;
      var provVal = prov.valor_total || 0;
      catDividendsTotal += provVal;
      var provDate = new Date(prov.data_pagamento);
      if (provDate >= oneYrAgo) catDividends12m += provVal;
      var pmKey = provDate.getFullYear() + '-' + String(provDate.getMonth() + 1).padStart(2, '0');
      if (!catProvByMonth[pmKey]) catProvByMonth[pmKey] = 0;
      catProvByMonth[pmKey] += provVal;
      if (!catProvByTicker[prov.ticker]) catProvByTicker[prov.ticker] = { total: 0, last12m: 0 };
      catProvByTicker[prov.ticker].total += provVal;
      if (provDate >= oneYrAgo) catProvByTicker[prov.ticker].last12m += provVal;
    }
    catYieldOnCost = catTotalInvested > 0 ? (catDividends12m / catTotalInvested * 100) : 0;
    catRetornoTotal = catPL + catDividendsTotal;
    catRetornoTotalPct = catTotalInvested > 0 ? (catRetornoTotal / catTotalInvested * 100) : 0;

    // Monthly dividends: last 12 months for chart
    var nowCat = new Date();
    for (var cmi = 11; cmi >= 0; cmi--) {
      var cmd = new Date(nowCat.getFullYear(), nowCat.getMonth() - cmi, 1);
      var cmk = cmd.getFullYear() + '-' + String(cmd.getMonth() + 1).padStart(2, '0');
      var cml = MONTH_LABELS[cmd.getMonth() + 1] + '/' + String(cmd.getFullYear()).substring(2);
      catMonthlyDividends.push({ month: cml, value: catProvByMonth[cmk] || 0 });
    }

    // Renda mensal media (ultimos 3 meses)
    var last3sum = 0;
    var last3count = 0;
    for (var l3 = Math.max(catMonthlyDividends.length - 3, 0); l3 < catMonthlyDividends.length; l3++) {
      last3sum += catMonthlyDividends[l3].value;
      last3count++;
    }
    catRendaMensal = last3count > 0 ? last3sum / last3count : 0;

    // Monthly returns for win/loss count
    if (monthlyReturns.length > 0) {
      for (var cmr = 0; cmr < monthlyReturns.length; cmr++) {
        if (monthlyReturns[cmr].pct >= 0) catMesesPositivos++;
        else catMesesNegativos++;
      }
    }

    // Ranked positions with retorno total, DY, peso
    var ranked = [];
    for (var rp = 0; rp < catPositions.length; rp++) {
      var rPos = catPositions[rp];
      var rInvested = rPos.quantidade * rPos.pm;
      var rCurrent = rPos.quantidade * (rPos.preco_atual || rPos.pm);
      var rPL = rCurrent - rInvested;
      var rPLPct = rInvested > 0 ? ((rCurrent - rInvested) / rInvested) * 100 : 0;
      var rProvs = catProvByTicker[rPos.ticker] || { total: 0, last12m: 0 };
      var rRetTotal = rPL + rProvs.total;
      var rRetTotalPct = rInvested > 0 ? (rRetTotal / rInvested * 100) : 0;
      var rDY = rCurrent > 0 ? (rProvs.last12m / rCurrent * 100) : 0;
      var rYoC = rInvested > 0 ? (rProvs.last12m / rInvested * 100) : 0;
      var rPeso = totalPatrimonio > 0 ? (rCurrent / totalPatrimonio * 100) : 0;
      ranked.push({
        ticker: rPos.ticker,
        invested: rInvested,
        current: rCurrent,
        pl: rPL,
        plPct: rPLPct,
        retTotal: rRetTotal,
        retTotalPct: rRetTotalPct,
        dy: rDY,
        yoc: rYoC,
        peso: rPeso,
        proventos12m: rProvs.last12m,
        quantidade: rPos.quantidade,
        pm: rPos.pm,
        preco_atual: rPos.preco_atual || rPos.pm,
        change_day: rPos.change_day || 0,
      });
    }
    ranked.sort(function(a, b) { return b.retTotalPct - a.retTotalPct; });
    catRankedPositions = ranked;
  }

  // ── Derived: RF Performance ──
  var rfItems = [];
  var rfTotalAplicado = 0;
  var rfTotalAtual = 0;
  var rfRentBruta = 0;
  var rfRentLiquida = 0;
  var rfPctCDI = 0;
  var rfByTipo = {};
  var rfByIndexador = {};
  var rfSortedByMaturity = [];
  var rfWeightedRate = 0;
  var rfEnriched = [];

  if (perfSub === 'rf') {
    var hojeRF = new Date();
    for (var rfi = 0; rfi < rendaFixa.length; rfi++) {
      var rfItem = rendaFixa[rfi];
      rfItems.push(rfItem);
      var rfValor = parseFloat(rfItem.valor_aplicado) || 0;
      rfTotalAplicado += rfValor;

      var rfTipo = rfItem.tipo || 'cdb';
      if (!rfByTipo[rfTipo]) rfByTipo[rfTipo] = { count: 0, valor: 0, valorAtual: 0 };
      rfByTipo[rfTipo].count += 1;
      rfByTipo[rfTipo].valor += rfValor;

      var rfIdx = rfItem.indexador || 'prefixado';
      if (!rfByIndexador[rfIdx]) rfByIndexador[rfIdx] = { count: 0, valor: 0, valorAtual: 0 };
      rfByIndexador[rfIdx].count += 1;
      rfByIndexador[rfIdx].valor += rfValor;

      rfWeightedRate += (parseFloat(rfItem.taxa) || 0) * rfValor;

      // MtM estimado
      var dataAplic = rfItem.data_aplicacao || rfItem.created_at || '';
      var valorAtualEst = rfValorAtualEstimado(rfValor, parseFloat(rfItem.taxa) || 0, rfIdx, dataAplic, selicAnual);
      rfTotalAtual += valorAtualEst;
      rfByTipo[rfTipo].valorAtual += valorAtualEst;
      rfByIndexador[rfIdx].valorAtual += valorAtualEst;

      // Per-item enrichment
      var diasCorr = Math.max(Math.ceil((hojeRF - new Date(dataAplic)) / (1000 * 60 * 60 * 24)), 0);
      var isIsento = RF_ISENTOS[rfTipo] || false;
      var aliqIR = isIsento ? 0 : rfIRAliquota(diasCorr);
      var rendBruto = valorAtualEst - rfValor;
      var irDevido = rendBruto > 0 ? rendBruto * aliqIR : 0;
      var rendLiquido = rendBruto - irDevido;
      var rentBrutaPct = rfValor > 0 ? (rendBruto / rfValor * 100) : 0;
      var rentLiqPct = rfValor > 0 ? (rendLiquido / rfValor * 100) : 0;
      var diasVenc = Math.ceil((new Date(rfItem.vencimento) - hojeRF) / (1000 * 60 * 60 * 24));
      var cdiEquiv = isIsento ? rfCDIEquivalente(parseFloat(rfItem.taxa) || 0, rfIRAliquota(Math.max(diasVenc, diasCorr))) : 0;

      rfEnriched.push({
        item: rfItem,
        valorAtual: valorAtualEst,
        rendBruto: rendBruto,
        rendLiquido: rendLiquido,
        rentBrutaPct: rentBrutaPct,
        rentLiqPct: rentLiqPct,
        aliqIR: aliqIR,
        irFaixa: isIsento ? 'Isento' : rfIRFaixa(diasCorr),
        isIsento: isIsento,
        diasCorridos: diasCorr,
        diasVenc: diasVenc,
        cdiEquiv: cdiEquiv,
      });
    }
    rfWeightedRate = rfTotalAplicado > 0 ? rfWeightedRate / rfTotalAplicado : 0;
    rfRentBruta = rfTotalAplicado > 0 ? ((rfTotalAtual - rfTotalAplicado) / rfTotalAplicado * 100) : 0;

    // Rent liquida agregada
    var rfTotalRendLiq = 0;
    for (var rle = 0; rle < rfEnriched.length; rle++) {
      rfTotalRendLiq += rfEnriched[rle].rendLiquido;
    }
    rfRentLiquida = rfTotalAplicado > 0 ? (rfTotalRendLiq / rfTotalAplicado * 100) : 0;
    rfPctCDI = cdiPct > 0 ? (rfRentBruta / cdiPct * 100) : 0;

    rfSortedByMaturity = rfEnriched.slice().sort(function(a, b) {
      return a.diasVenc - b.diasVenc;
    });
  }

  // ── Derived: Opcoes Performance ──
  var opcAtivas = [];
  var opcEncerradas = [];
  var opcTotalPremiosRecebidos = 0;
  var opcTotalPremiosFechamento = 0;
  var opcPLTotal = 0;
  var opcByStatus = {};
  var opcByTipo = { call: { count: 0, premio: 0 }, put: { count: 0, premio: 0 } };
  var opcByBase = {};
  var opcProxVenc = [];
  var opcWinRate = 0;
  var opcWins = 0;
  var opcLosses = 0;
  var opcTaxaExercicio = 0;
  var opcTaxaExpirouPO = 0;
  var opcTaxaMediaMensal = 0;
  var opcPremiumYield = 0;
  var opcMonthlyPremiums = [];

  if (perfSub === 'opcoes') {
    var nowOpc = new Date();
    var opcTaxaMensalSum = 0;
    var opcTaxaMensalCount = 0;
    var opcPremByMonth = {};

    for (var oi = 0; oi < opcoes.length; oi++) {
      var op = opcoes[oi];
      var premioTotal = (op.premio || 0) * (op.quantidade || 0);
      var status = op.status || 'ativa';

      if (!opcByStatus[status]) opcByStatus[status] = { count: 0, premio: 0 };
      opcByStatus[status].count += 1;
      opcByStatus[status].premio += premioTotal;

      var direcao = op.direcao || 'venda';
      var isVenda = direcao === 'venda' || direcao === 'lancamento';

      if (isVenda) {
        opcTotalPremiosRecebidos += premioTotal;
      }

      var tipo = op.tipo || 'call';
      opcByTipo[tipo].count += 1;
      opcByTipo[tipo].premio += premioTotal;

      var base2 = op.ativo_base || 'N/A';
      if (!opcByBase[base2]) opcByBase[base2] = { count: 0, premioRecebido: 0, pl: 0 };
      opcByBase[base2].count += 1;

      // Taxa mensal equivalente (normalizada por DTE)
      if (isVenda && op.strike > 0) {
        var taxaPremio = premioTotal / ((op.strike || 1) * (op.quantidade || 1)) * 100;
        var vencOp = new Date(op.vencimento);
        var criadoOp = new Date(op.created_at || op.vencimento);
        var dteOp = Math.max(Math.ceil((vencOp - criadoOp) / (1000 * 60 * 60 * 24)), 1);
        var taxaMensal = (Math.pow(1 + taxaPremio / 100, 30 / dteOp) - 1) * 100;
        opcTaxaMensalSum += taxaMensal;
        opcTaxaMensalCount++;
      }

      // Monthly premium tracking (D+1 settlement)
      if (isVenda) {
        var dataRef = op.data_abertura || op.created_at || op.vencimento || '';
        if (dataRef) {
          var dReceb = new Date(dataRef);
          dReceb.setDate(dReceb.getDate() + 1);
          var opMonth = dReceb.getFullYear() + '-' + String(dReceb.getMonth() + 1).padStart(2, '0');
          if (!opcPremByMonth[opMonth]) opcPremByMonth[opMonth] = { total: 0, call: 0, put: 0 };
          opcPremByMonth[opMonth].total += premioTotal;
          opcPremByMonth[opMonth][tipo] += premioTotal;
        }
      }

      if (status === 'ativa') {
        opcAtivas.push(op);
        if (isVenda) {
          opcByBase[base2].premioRecebido += premioTotal;
          opcByBase[base2].pl += premioTotal;
        }
        var vencDate = new Date(op.vencimento);
        var daysToExp = Math.ceil((vencDate - nowOpc) / (1000 * 60 * 60 * 24));
        if (daysToExp <= 30 && daysToExp >= 0) {
          opcProxVenc.push({ op: op, daysLeft: daysToExp });
        }
      } else {
        opcEncerradas.push(op);
        var premioFech = (op.premio_fechamento || 0) * (op.quantidade || 0);
        if (isVenda) {
          var plOp = premioTotal - premioFech;
          opcPLTotal += plOp;
          opcTotalPremiosFechamento += premioFech;
          opcByBase[base2].premioRecebido += premioTotal;
          opcByBase[base2].pl += plOp;
          if (plOp >= 0) opcWins++; else opcLosses++;
        }
      }
    }
    opcProxVenc.sort(function(a, b) { return a.daysLeft - b.daysLeft; });

    // Win rate
    var opcTotalEncerradasVenda = opcWins + opcLosses;
    opcWinRate = opcTotalEncerradasVenda > 0 ? (opcWins / opcTotalEncerradasVenda * 100) : 0;

    // Taxa exercicio / expirou PO
    var exercidas = (opcByStatus.exercida && opcByStatus.exercida.count) || 0;
    var expirouPO = (opcByStatus.expirou_po && opcByStatus.expirou_po.count) || 0;
    var totalEncerradasAll = opcEncerradas.length;
    opcTaxaExercicio = totalEncerradasAll > 0 ? (exercidas / totalEncerradasAll * 100) : 0;
    opcTaxaExpirouPO = totalEncerradasAll > 0 ? (expirouPO / totalEncerradasAll * 100) : 0;

    // Taxa media mensal
    opcTaxaMediaMensal = opcTaxaMensalCount > 0 ? opcTaxaMensalSum / opcTaxaMensalCount : 0;

    // Premium yield: premios 12m / valor carteira
    var premios12m = 0;
    var oneYrAgoOpc = new Date();
    oneYrAgoOpc.setFullYear(oneYrAgoOpc.getFullYear() - 1);
    for (var py = 0; py < opcoes.length; py++) {
      var pyOp = opcoes[py];
      var pyDir = pyOp.direcao || 'venda';
      var pyVenda = pyDir === 'venda' || pyDir === 'lancamento';
      if (pyVenda) {
        var pyDate = new Date(pyOp.created_at || pyOp.vencimento || '');
        if (pyDate >= oneYrAgoOpc) {
          premios12m += (pyOp.premio || 0) * (pyOp.quantidade || 0);
        }
      }
    }
    opcPremiumYield = totalPatrimonio > 0 ? (premios12m / totalPatrimonio * 100) : 0;

    // Monthly premium chart: last 12 months
    for (var omi = 11; omi >= 0; omi--) {
      var omd = new Date(nowOpc.getFullYear(), nowOpc.getMonth() - omi, 1);
      var omk = omd.getFullYear() + '-' + String(omd.getMonth() + 1).padStart(2, '0');
      var oml = MONTH_LABELS[omd.getMonth() + 1] + '/' + String(omd.getFullYear()).substring(2);
      var omData = opcPremByMonth[omk] || { total: 0, call: 0, put: 0 };
      opcMonthlyPremiums.push({ month: oml, total: omData.total, call: omData.call, put: omData.put });
    }
  }

  // ── Derived: Alocação ──
  var alocGrouped = {};
  var totalAlocPatrimonio = 0;
  positions.forEach(function(p) {
    var cat = p.categoria || 'acao';
    var valor = p.quantidade * (p.preco_atual || p.pm);
    if (!alocGrouped[cat]) alocGrouped[cat] = 0;
    alocGrouped[cat] += valor;
    totalAlocPatrimonio += valor;
  });
  // Include RF in allocation
  var rfTotalAloc = rendaFixa.reduce(function(s, r) { return s + (r.valor_aplicado || 0); }, 0);
  if (rfTotalAloc > 0) {
    alocGrouped.rf = rfTotalAloc;
    totalAlocPatrimonio += rfTotalAloc;
  }

  // ── Derived: Asset list (for treemap + rentabilidade) ──
  var assetList = positions.map(function(p) {
    var val = p.quantidade * (p.preco_atual || p.pm);
    var custo = p.quantidade * p.pm;
    var pnlPct = custo > 0 ? ((val - custo) / custo) * 100 : 0;
    return { ticker: p.ticker, weight: val, pnlPct: pnlPct, color: PRODUCT_COLORS[p.categoria] || C.accent,
      categoria: p.categoria, pnl: val - custo };
  });
  var sortedByPnl = assetList.slice().sort(function(a, b) { return b.pnlPct - a.pnlPct; });
  var maxAbsPnl = sortedByPnl.reduce(function(m, a) { return Math.max(m, Math.abs(a.pnlPct)); }, 1);

  // ── Derived: Proventos ──
  var filteredProventos = proventos;
  if (provFilter !== 'todos') {
    filteredProventos = proventos.filter(function(p) {
      return p.tipo_provento === provFilter;
    });
  }

  var totalProvs = filteredProventos.reduce(function(s, p) { return s + (p.valor_total || 0); }, 0);

  // Proventos grouped by month
  var provsByMonth = {};
  filteredProventos.forEach(function(p) {
    var d = new Date(p.data_pagamento);
    var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    if (!provsByMonth[key]) provsByMonth[key] = [];
    provsByMonth[key].push(p);
  });

  // Bar chart data: last 12 months
  var now = new Date();
  var last12 = [];
  for (var mi = 11; mi >= 0; mi--) {
    var md = new Date(now.getFullYear(), now.getMonth() - mi, 1);
    var mKey = md.getFullYear() + '-' + String(md.getMonth() + 1).padStart(2, '0');
    var mLabel = MONTH_LABELS[md.getMonth() + 1] + '/' + String(md.getFullYear()).substring(2);
    var mTotal = 0;
    filteredProventos.forEach(function(p) {
      var pd = new Date(p.data_pagamento);
      var pk = pd.getFullYear() + '-' + String(pd.getMonth() + 1).padStart(2, '0');
      if (pk === mKey) mTotal += (p.valor_total || 0);
    });
    last12.push({ month: mLabel, value: mTotal });
  }
  var maxProvMonth = last12.reduce(function(m, d) { return Math.max(m, d.value); }, 1);

  // Yield on cost (proventos 12 meses / custo total)
  var totalCusto = positions.reduce(function(s, p) { return s + p.quantidade * p.pm; }, 0);
  var proventos12m = 0;
  var oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  proventos.forEach(function(p) {
    var d = new Date(p.data_pagamento);
    if (d >= oneYearAgo) proventos12m += (p.valor_total || 0);
  });
  var yieldOnCost = totalCusto > 0 ? (proventos12m / totalCusto) * 100 : 0;

  // ── Derived: IR ──
  var irMonthResults = computeIR(operacoes);
  var irTaxData = computeTaxByMonth(irMonthResults);

  var irTotalGanhos = 0;
  var irTotalPerdas = 0;
  var irTotalImposto = 0;
  irTaxData.forEach(function(m) {
    irTotalGanhos += m.ganhoAcoes + m.ganhoFII + m.ganhoETF;
    irTotalPerdas += m.perdaAcoes + m.perdaFII + m.perdaETF;
    irTotalImposto += m.impostoTotal;
  });
  var irSaldoLiquido = irTotalGanhos - irTotalPerdas;
  var hasAlerta20k = irTaxData.some(function(m) { return m.alertaAcoes20k; });

  // ── Loading state ──
  if (loading) return <LoadingScreen />;

  // ── Render ──
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      scrollEnabled={!chartTouching}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
          tintColor={C.accent} colors={[C.accent]} />
      }
    >
      {/* Sub-tabs */}
      <View style={styles.subTabs}>
        {[
          { k: 'perf', l: 'Performance' },
          { k: 'aloc', l: 'Alocação' },
          { k: 'prov', l: 'Proventos' },
          { k: 'ind', l: 'Indicadores' },
          { k: 'ir', l: 'IR' },
        ].map(function(t) {
          return (
            <Pill key={t.k} active={sub === t.k} color={C.accent}
              onPress={function() { setSub(t.k); }}>
              {t.l}
            </Pill>
          );
        })}
      </View>

      {/* ═══════════ PERFORMANCE ═══════════ */}
      {sub === 'perf' && (
        <>
          {/* Performance sub-tabs */}
          <View style={styles.perfSubTabs}>
            {PERF_SUBS.map(function(ps) {
              var isActive = perfSub === ps.k;
              var color = PERF_SUB_COLORS[ps.k];
              return (
                <Pill key={ps.k} active={isActive} color={color}
                  onPress={function() { setPerfSub(ps.k); }}>
                  {ps.l}
                </Pill>
              );
            })}
          </View>

          {/* ── TODOS ── */}
          {perfSub === 'todos' && (
            <>
              {/* Hero */}
              <Glass glow={C.accent} padding={16}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={styles.heroLabel}>PATRIMONIO TOTAL</Text>
                    <Text style={styles.heroValue}>R$ {fmt(totalPatrimonio)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.heroLabel}>RENTABILIDADE</Text>
                    <Text style={[styles.heroPct, { color: rentPct >= 0 ? C.green : C.red }]}>
                      {rentPct >= 0 ? '+' : ''}{rentPct.toFixed(2)}%
                    </Text>
                    <Text style={[styles.heroPctSub, { color: C.sub }]}>
                      CDI: {cdiPct.toFixed(2)}%
                    </Text>
                  </View>
                </View>
              </Glass>

              {/* Period pills */}
              <View style={styles.periodRow}>
                {PERIODS.map(function(p) {
                  var active = perfPeriod === p.key;
                  return (
                    <TouchableOpacity key={p.key}
                      style={[styles.periodPill, active ? styles.periodPillActive : styles.periodPillInactive]}
                      onPress={function() { setPerfPeriod(p.key); }}>
                      <Text style={[styles.periodPillText, { color: active ? C.accent : C.dim }]}>
                        {p.key}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Chart */}
              {filteredHistory.length >= 2 ? (
                <Glass padding={12}>
                  <InteractiveChart
                    data={filteredHistory}
                    color={C.accent}
                    height={140}
                    showGrid={true}
                    fontFamily={F.mono}
                    label="Patrimonio"
                    onTouchStateChange={function(touching) { setChartTouching(touching); }}
                  />
                </Glass>
              ) : (
                <Glass padding={20}>
                  <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.body, textAlign: 'center' }}>
                    Adicione operacoes para ver o grafico de patrimonio
                  </Text>
                </Glass>
              )}

              {/* KPI Row */}
              <View style={styles.kpiRow}>
                <Glass padding={10} style={{ flex: 1 }}>
                  <View style={styles.kpiCard}>
                    <Text style={styles.kpiLabel}>CARTEIRA</Text>
                    <Text style={[styles.kpiValue, { color: rentPct >= 0 ? C.green : C.red }]}>
                      {rentPct >= 0 ? '+' : ''}{rentPct.toFixed(1)}%
                    </Text>
                  </View>
                </Glass>
                <Glass padding={10} style={{ flex: 1 }}>
                  <View style={styles.kpiCard}>
                    <Text style={styles.kpiLabel}>CDI</Text>
                    <Text style={[styles.kpiValue, { color: C.etfs }]}>
                      +{cdiPct.toFixed(1)}%
                    </Text>
                  </View>
                </Glass>
              </View>
              <View style={styles.kpiRow}>
                <Glass padding={10} style={{ flex: 1 }}>
                  <View style={styles.kpiCard}>
                    <Text style={styles.kpiLabel}>MELHOR MES</Text>
                    {bestMonth ? (
                      <>
                        <Text style={[styles.kpiValue, { color: C.green }]}>
                          +{bestMonth.pct.toFixed(1)}%
                        </Text>
                        <Text style={styles.kpiSub}>
                          {MONTH_LABELS[parseInt(bestMonth.month.split('-')[1])]}/{bestMonth.month.split('-')[0].substring(2)}
                        </Text>
                      </>
                    ) : (
                      <Text style={[styles.kpiValue, { color: C.dim }]}>--</Text>
                    )}
                  </View>
                </Glass>
                <Glass padding={10} style={{ flex: 1 }}>
                  <View style={styles.kpiCard}>
                    <Text style={styles.kpiLabel}>PIOR MES</Text>
                    {worstMonth ? (
                      <>
                        <Text style={[styles.kpiValue, { color: C.red }]}>
                          {worstMonth.pct.toFixed(1)}%
                        </Text>
                        <Text style={styles.kpiSub}>
                          {MONTH_LABELS[parseInt(worstMonth.month.split('-')[1])]}/{worstMonth.month.split('-')[0].substring(2)}
                        </Text>
                      </>
                    ) : (
                      <Text style={[styles.kpiValue, { color: C.dim }]}>--</Text>
                    )}
                  </View>
                </Glass>
              </View>

              {/* Benchmark: Carteira vs CDI */}
              {portBenchData.length >= 2 && (
                <>
                  <SectionLabel>BENCHMARK</SectionLabel>
                  <Glass padding={12}>
                    <BenchmarkChart portData={portBenchData} cdiData={cdiBenchData} />
                  </Glass>
                </>
              )}

              {/* Rentabilidade por ativo */}
              {sortedByPnl.length > 0 && (
                <>
                  <SectionLabel>RENTABILIDADE POR ATIVO</SectionLabel>
                  <Glass padding={14}>
                    {sortedByPnl.map(function (a, i) {
                      return <HBar key={i} label={a.ticker} value={a.pnlPct} maxValue={maxAbsPnl}
                        color={a.pnlPct >= 0 ? C.green : C.red} suffix="%" />;
                    })}
                  </Glass>
                </>
              )}
            </>
          )}

          {/* ── ACAO / FII / ETF ── */}
          {(perfSub === 'acao' || perfSub === 'fii' || perfSub === 'etf') && (
            <>
              {catPositions.length === 0 ? (
                <EmptyState
                  icon={"\u25C9"}
                  title={'Sem ' + (CAT_LABELS[perfSub] || perfSub)}
                  description={'Adicione operacoes de ' + (CAT_LABELS[perfSub] || perfSub) + ' para ver a performance'}
                  color={PERF_SUB_COLORS[perfSub]}
                />
              ) : (
                <>
                  {/* Hero Card */}
                  <Glass glow={PERF_SUB_COLORS[perfSub]} padding={16}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <View>
                        <Text style={styles.heroLabel}>INVESTIDO</Text>
                        <Text style={styles.heroValue}>R$ {fmt(catTotalInvested)}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.heroLabel}>VALOR ATUAL</Text>
                        <Text style={[styles.heroValue, { color: catPL >= 0 ? C.green : C.red }]}>R$ {fmt(catCurrentValue)}</Text>
                      </View>
                    </View>
                    <View style={styles.catHeroDivider} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={styles.kpiLabel}>P&L CAPITAL</Text>
                        <Text style={[styles.kpiValue, { color: catPL >= 0 ? C.green : C.red }]}>
                          {catPL >= 0 ? '+' : ''}R$ {fmt(Math.abs(catPL))}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={styles.kpiLabel}>RETORNO TOTAL</Text>
                        <Text style={[styles.kpiValue, { color: catRetornoTotal >= 0 ? C.green : C.red }]}>
                          {catRetornoTotalPct >= 0 ? '+' : ''}{catRetornoTotalPct.toFixed(2)}%
                        </Text>
                      </View>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={styles.kpiLabel}>% CDI</Text>
                        <Text style={[styles.kpiValue, { color: catPctCDI >= 100 ? C.green : C.yellow }]}>
                          {catPctCDI.toFixed(0)}%
                        </Text>
                      </View>
                    </View>
                  </Glass>

                  {/* Stats Row 1 */}
                  <View style={styles.kpiRow}>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>POSICOES</Text>
                        <Text style={[styles.kpiValue, { color: PERF_SUB_COLORS[perfSub] }]}>
                          {String(catPositions.length)}
                        </Text>
                      </View>
                    </Glass>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>PESO CARTEIRA</Text>
                        <Text style={[styles.kpiValue, { color: PERF_SUB_COLORS[perfSub] }]}>
                          {catPesoCarteira.toFixed(1)}%
                        </Text>
                      </View>
                    </Glass>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>RENTAB.</Text>
                        <Text style={[styles.kpiValue, { color: catRentPct >= 0 ? C.green : C.red }]}>
                          {catRentPct >= 0 ? '+' : ''}{catRentPct.toFixed(1)}%
                        </Text>
                      </View>
                    </Glass>
                  </View>

                  {/* Stats Row 2: Proventos */}
                  <View style={styles.kpiRow}>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>PROVENTOS TOTAL</Text>
                        <Text style={[styles.kpiValue, { color: C.green }]}>
                          R$ {fmt(catDividendsTotal)}
                        </Text>
                      </View>
                    </Glass>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>{perfSub === 'fii' ? 'DY 12M' : 'YIELD ON COST'}</Text>
                        <Text style={[styles.kpiValue, { color: C.green }]}>
                          {catYieldOnCost.toFixed(2)}%
                        </Text>
                      </View>
                    </Glass>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>RENDA/MES</Text>
                        <Text style={[styles.kpiValue, { color: C.green }]}>
                          R$ {fmt(catRendaMensal)}
                        </Text>
                      </View>
                    </Glass>
                  </View>

                  {/* Consistencia */}
                  {(catMesesPositivos + catMesesNegativos) > 0 && (
                    <View style={styles.kpiRow}>
                      <Glass padding={10} style={{ flex: 1 }}>
                        <View style={styles.kpiCard}>
                          <Text style={styles.kpiLabel}>MESES POSITIVOS</Text>
                          <Text style={[styles.kpiValue, { color: C.green }]}>
                            {String(catMesesPositivos)}
                          </Text>
                        </View>
                      </Glass>
                      <Glass padding={10} style={{ flex: 1 }}>
                        <View style={styles.kpiCard}>
                          <Text style={styles.kpiLabel}>MESES NEGATIVOS</Text>
                          <Text style={[styles.kpiValue, { color: C.red }]}>
                            {String(catMesesNegativos)}
                          </Text>
                        </View>
                      </Glass>
                      <Glass padding={10} style={{ flex: 1 }}>
                        <View style={styles.kpiCard}>
                          <Text style={styles.kpiLabel}>TAXA ACERTO</Text>
                          <Text style={[styles.kpiValue, { color: C.green }]}>
                            {((catMesesPositivos / (catMesesPositivos + catMesesNegativos)) * 100).toFixed(0)}%
                          </Text>
                        </View>
                      </Glass>
                    </View>
                  )}

                  {/* Proventos mensais chart (FII focus) */}
                  {catDividendsTotal > 0 && (
                    <>
                      <SectionLabel>{perfSub === 'fii' ? 'RENDIMENTOS MENSAIS' : 'PROVENTOS MENSAIS'}</SectionLabel>
                      <Glass padding={12}>
                        <ProvBarChart data={catMonthlyDividends} maxVal={catMonthlyDividends.reduce(function(m, d) { return Math.max(m, d.value); }, 1)} />
                      </Glass>
                    </>
                  )}

                  {/* Position Ranking */}
                  <SectionLabel>RANKING POR RETORNO TOTAL</SectionLabel>
                  <Glass padding={0}>
                    {(function() {
                      var maxAbsPct = 1;
                      for (var mx = 0; mx < catRankedPositions.length; mx++) {
                        if (Math.abs(catRankedPositions[mx].retTotalPct) > maxAbsPct) {
                          maxAbsPct = Math.abs(catRankedPositions[mx].retTotalPct);
                        }
                      }
                      return catRankedPositions.map(function(rp, i) {
                        var barWidth = Math.min(Math.abs(rp.retTotalPct) / maxAbsPct * 100, 100);
                        return (
                          <View key={i} style={[styles.posCard, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={styles.rankIndex}>{String(i + 1)}</Text>
                                <Text style={styles.rankTicker}>{rp.ticker}</Text>
                                {rp.change_day !== 0 && (
                                  <Badge text={(rp.change_day >= 0 ? '+' : '') + rp.change_day.toFixed(1) + '%'} color={rp.change_day >= 0 ? C.green : C.red} />
                                )}
                              </View>
                              <Text style={[styles.rankPct, { color: rp.retTotal >= 0 ? C.green : C.red }]}>
                                {rp.retTotalPct >= 0 ? '+' : ''}{rp.retTotalPct.toFixed(1)}%
                              </Text>
                            </View>
                            <View style={[styles.rankBarBg, { marginVertical: 6, marginHorizontal: 0 }]}>
                              <View style={[styles.rankBarFill, {
                                width: barWidth + '%',
                                backgroundColor: rp.retTotal >= 0 ? C.green : C.red,
                              }]} />
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                              <View>
                                <Text style={styles.posDetail}>PM R$ {fmt(rp.pm)} | Atual R$ {fmt(rp.preco_atual)}</Text>
                                <Text style={styles.posDetail}>{String(rp.quantidade) + ' cotas | Peso ' + rp.peso.toFixed(1) + '%'}</Text>
                              </View>
                              <View style={{ alignItems: 'flex-end' }}>
                                <Text style={[styles.posDetail, { color: rp.pl >= 0 ? C.green : C.red }]}>
                                  P&L {rp.pl >= 0 ? '+' : ''}R$ {fmt(Math.abs(rp.pl))}
                                </Text>
                                {rp.proventos12m > 0 && (
                                  <Text style={[styles.posDetail, { color: C.green }]}>
                                    {perfSub === 'fii' ? 'DY' : 'YoC'} {rp.yoc.toFixed(1)}% | R$ {fmt(rp.proventos12m)}/12m
                                  </Text>
                                )}
                              </View>
                            </View>
                          </View>
                        );
                      });
                    })()}
                  </Glass>
                </>
              )}
            </>
          )}

          {/* ── OPCOES ── */}
          {perfSub === 'opcoes' && (
            <>
              {opcoes.length === 0 ? (
                <EmptyState
                  icon={"\u25C9"}
                  title="Sem Opções"
                  description="Cadastre suas opções para ver a performance"
                  color={C.opcoes}
                />
              ) : (
                <>
                  {/* Hero Card */}
                  <Glass glow={C.opcoes} padding={16}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <View>
                        <Text style={styles.heroLabel}>PREMIOS RECEBIDOS</Text>
                        <Text style={styles.heroValue}>R$ {fmt(opcTotalPremiosRecebidos)}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.heroLabel}>P&L ENCERRADAS</Text>
                        <Text style={[styles.heroPct, { color: opcPLTotal >= 0 ? C.green : C.red }]}>
                          {opcPLTotal >= 0 ? '+' : ''}R$ {fmt(Math.abs(opcPLTotal))}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.catHeroDivider} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={styles.kpiLabel}>ATIVAS</Text>
                        <Text style={[styles.kpiValue, { color: C.opcoes }]}>
                          {String(opcAtivas.length)}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={styles.kpiLabel}>ENCERRADAS</Text>
                        <Text style={[styles.kpiValue, { color: C.sub }]}>
                          {String(opcEncerradas.length)}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={styles.kpiLabel}>TOTAL</Text>
                        <Text style={[styles.kpiValue, { color: C.text }]}>
                          {String(opcoes.length)}
                        </Text>
                      </View>
                    </View>
                  </Glass>

                  {/* Performance metrics */}
                  <View style={styles.kpiRow}>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>WIN RATE</Text>
                        <Text style={[styles.kpiValue, { color: opcWinRate >= 70 ? C.green : (opcWinRate >= 50 ? C.yellow : C.red) }]}>
                          {opcWinRate.toFixed(0)}%
                        </Text>
                        <Text style={styles.kpiSub}>{String(opcWins) + 'W / ' + String(opcLosses) + 'L'}</Text>
                      </View>
                    </Glass>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>TAXA MEDIA a.m.</Text>
                        <Text style={[styles.kpiValue, { color: C.opcoes }]}>
                          {opcTaxaMediaMensal.toFixed(2)}%
                        </Text>
                        <Text style={styles.kpiSub}>{(opcTaxaMediaMensal * 12).toFixed(1) + '% a.a.'}</Text>
                      </View>
                    </Glass>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>PREMIUM YIELD</Text>
                        <Text style={[styles.kpiValue, { color: C.green }]}>
                          {opcPremiumYield.toFixed(1)}%
                        </Text>
                        <Text style={styles.kpiSub}>12 meses</Text>
                      </View>
                    </Glass>
                  </View>

                  {/* CALL vs PUT + Taxas */}
                  <View style={styles.kpiRow}>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>CALL</Text>
                        <Text style={[styles.kpiValue, { color: C.green }]}>
                          {String(opcByTipo.call.count)}
                        </Text>
                        <Text style={styles.kpiSub}>R$ {fmt(opcByTipo.call.premio)}</Text>
                      </View>
                    </Glass>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>PUT</Text>
                        <Text style={[styles.kpiValue, { color: C.red }]}>
                          {String(opcByTipo.put.count)}
                        </Text>
                        <Text style={styles.kpiSub}>R$ {fmt(opcByTipo.put.premio)}</Text>
                      </View>
                    </Glass>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>CUSTO FECH.</Text>
                        <Text style={[styles.kpiValue, { color: C.yellow }]}>
                          R$ {fmt(opcTotalPremiosFechamento)}
                        </Text>
                      </View>
                    </Glass>
                  </View>

                  {/* Taxas de desfecho */}
                  <View style={styles.kpiRow}>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>EXPIROU PO</Text>
                        <Text style={[styles.kpiValue, { color: C.green }]}>
                          {opcTaxaExpirouPO.toFixed(0)}%
                        </Text>
                      </View>
                    </Glass>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>EXERCIDA</Text>
                        <Text style={[styles.kpiValue, { color: C.yellow }]}>
                          {opcTaxaExercicio.toFixed(0)}%
                        </Text>
                      </View>
                    </Glass>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>FECHADA</Text>
                        <Text style={[styles.kpiValue, { color: C.sub }]}>
                          {opcEncerradas.length > 0 ? (((opcByStatus.fechada && opcByStatus.fechada.count || 0) / opcEncerradas.length * 100).toFixed(0)) : '0'}%
                        </Text>
                      </View>
                    </Glass>
                  </View>

                  {/* Historico mensal de premios */}
                  {opcMonthlyPremiums.length > 0 && (function() {
                    var sum12 = opcMonthlyPremiums.reduce(function(s, d) { return s + (d.total || 0); }, 0);
                    var sumCall = opcMonthlyPremiums.reduce(function(s, d) { return s + (d.call || 0); }, 0);
                    var sumPut = opcMonthlyPremiums.reduce(function(s, d) { return s + (d.put || 0); }, 0);
                    return (
                      <>
                        <SectionLabel>PREMIOS MENSAIS</SectionLabel>
                        <Glass padding={12}>
                          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                            <Pill active={opcShowCall}
                              color={C.acoes}
                              onPress={function() { setOpcShowCall(!opcShowCall); setOpcPremSelected(-1); }}>Call</Pill>
                            <Pill active={opcShowPut}
                              color={C.green}
                              onPress={function() { setOpcShowPut(!opcShowPut); setOpcPremSelected(-1); }}>Put</Pill>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                            <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.text }}>
                              {'R$ ' + fmt(sum12)}
                              <Text style={{ fontSize: 10, color: C.sub }}>{' 12m'}</Text>
                            </Text>
                            {opcShowCall ? (
                              <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.acoes }}>
                                {'C R$ ' + fmt(sumCall)}
                              </Text>
                            ) : null}
                            {opcShowPut ? (
                              <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.green }}>
                                {'P R$ ' + fmt(sumPut)}
                              </Text>
                            ) : null}
                          </View>
                          <PremiosBarChart
                            data={opcMonthlyPremiums}
                            showCall={opcShowCall}
                            showPut={opcShowPut}
                            selected={opcPremSelected}
                            onSelect={setOpcPremSelected}
                          />
                        </Glass>
                      </>
                    );
                  })()}

                  {/* Por Ativo Base */}
                  <SectionLabel>POR ATIVO BASE</SectionLabel>
                  <Glass padding={0}>
                    {(function() {
                      var bases = Object.keys(opcByBase).sort(function(a, b) {
                        return opcByBase[b].premioRecebido - opcByBase[a].premioRecebido;
                      });
                      var maxPremio = 1;
                      for (var bm = 0; bm < bases.length; bm++) {
                        if (opcByBase[bases[bm]].premioRecebido > maxPremio) {
                          maxPremio = opcByBase[bases[bm]].premioRecebido;
                        }
                      }
                      return bases.map(function(base, i) {
                        var bd = opcByBase[base];
                        var barW = Math.min(bd.premioRecebido / maxPremio * 100, 100);
                        return (
                          <View key={base} style={[styles.rankRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                              <Text style={styles.rankTicker}>{base}</Text>
                              <View style={styles.rankBarBg}>
                                <View style={[styles.rankBarFill, { width: barW + '%', backgroundColor: C.opcoes }]} />
                              </View>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                              <Text style={[styles.rankPct, { color: C.opcoes }]}>R$ {fmt(bd.premioRecebido)}</Text>
                              <Text style={[styles.rankVal, { color: bd.pl >= 0 ? C.green : C.red }]}>
                                P&L {bd.pl >= 0 ? '+' : ''}R$ {fmt(Math.abs(bd.pl))}
                              </Text>
                            </View>
                          </View>
                        );
                      });
                    })()}
                  </Glass>

                  {/* Por Status */}
                  <SectionLabel>POR STATUS</SectionLabel>
                  <Glass padding={0}>
                    {Object.keys(opcByStatus).map(function(status, i) {
                      var sd = opcByStatus[status];
                      var pct = opcoes.length > 0 ? (sd.count / opcoes.length * 100) : 0;
                      var sColor = OPC_STATUS_COLORS[status] || C.dim;
                      return (
                        <View key={status} style={[styles.rankRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                            <Badge text={OPC_STATUS_LABELS[status] || status} color={sColor} />
                            <View style={styles.rankBarBg}>
                              <View style={[styles.rankBarFill, { width: pct + '%', backgroundColor: sColor }]} />
                            </View>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={[styles.rankPct, { color: sColor }]}>{String(sd.count)}</Text>
                            <Text style={styles.rankVal}>R$ {fmt(sd.premio)}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </Glass>

                  {/* Proximos Vencimentos */}
                  {opcProxVenc.length > 0 && (
                    <>
                      <SectionLabel>VENCEM EM 30 DIAS</SectionLabel>
                      <Glass padding={0}>
                        {opcProxVenc.map(function(item, i) {
                          var o = item.op;
                          var premioOp = (o.premio || 0) * (o.quantidade || 0);
                          var urgColor = item.daysLeft < 7 ? C.red : (item.daysLeft < 15 ? C.yellow : C.opcoes);
                          return (
                            <View key={o.id || i} style={[styles.rankRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                              <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <Text style={styles.rankTicker}>{o.ticker_opcao || o.ativo_base}</Text>
                                  <Badge text={(o.tipo || 'CALL').toUpperCase()} color={o.tipo === 'put' ? C.red : C.green} />
                                  <Badge text={item.daysLeft + 'd'} color={urgColor} />
                                </View>
                                <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono, marginTop: 2 }}>
                                  {o.ativo_base + ' | Strike R$ ' + fmt(o.strike || 0)}
                                </Text>
                              </View>
                              <View style={{ alignItems: 'flex-end' }}>
                                <Text style={[styles.rankPct, { color: C.opcoes }]}>R$ {fmt(premioOp)}</Text>
                                <Text style={styles.rankVal}>{(o.direcao || 'venda') === 'compra' ? 'Compra' : 'Venda'}</Text>
                              </View>
                            </View>
                          );
                        })}
                      </Glass>
                    </>
                  )}
                </>
              )}
            </>
          )}

          {/* ── RF ── */}
          {perfSub === 'rf' && (
            <>
              {rfItems.length === 0 ? (
                <EmptyState
                  icon={"\u25C9"}
                  title="Sem Renda Fixa"
                  description="Cadastre seus titulos de renda fixa para ver a analise"
                  color={C.rf}
                />
              ) : (
                <>
                  {/* Hero Card */}
                  <Glass glow={C.rf} padding={16}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <View>
                        <Text style={styles.heroLabel}>TOTAL APLICADO</Text>
                        <Text style={styles.heroValue}>R$ {fmt(rfTotalAplicado)}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.heroLabel}>VALOR ATUAL EST.</Text>
                        <Text style={[styles.heroValue, { color: C.rf }]}>R$ {fmt(rfTotalAtual)}</Text>
                      </View>
                    </View>
                    <View style={styles.catHeroDivider} />
                    <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={styles.kpiLabel}>RENT. BRUTA</Text>
                        <Text style={[styles.kpiValue, { color: rfRentBruta >= 0 ? C.green : C.red }]}>
                          {rfRentBruta >= 0 ? '+' : ''}{rfRentBruta.toFixed(2)}%
                        </Text>
                      </View>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={styles.kpiLabel}>RENT. LIQ.</Text>
                        <Text style={[styles.kpiValue, { color: rfRentLiquida >= 0 ? C.green : C.red }]}>
                          {rfRentLiquida >= 0 ? '+' : ''}{rfRentLiquida.toFixed(2)}%
                        </Text>
                      </View>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={styles.kpiLabel}>% CDI</Text>
                        <Text style={[styles.kpiValue, { color: rfPctCDI >= 100 ? C.green : C.yellow }]}>
                          {rfPctCDI.toFixed(0)}%
                        </Text>
                      </View>
                    </View>
                  </Glass>

                  {/* Stats Row */}
                  <View style={styles.kpiRow}>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>TITULOS</Text>
                        <Text style={[styles.kpiValue, { color: C.rf }]}>
                          {String(rfItems.length)}
                        </Text>
                      </View>
                    </Glass>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>TAXA MEDIA</Text>
                        <Text style={[styles.kpiValue, { color: C.rf }]}>
                          {rfWeightedRate.toFixed(2)}%
                        </Text>
                      </View>
                    </Glass>
                    <Glass padding={10} style={{ flex: 1 }}>
                      <View style={styles.kpiCard}>
                        <Text style={styles.kpiLabel}>RENDIMENTO</Text>
                        <Text style={[styles.kpiValue, { color: C.green }]}>
                          +R$ {fmt(rfTotalAtual - rfTotalAplicado)}
                        </Text>
                      </View>
                    </Glass>
                  </View>

                  {/* Breakdown by Tipo */}
                  <SectionLabel>POR TIPO</SectionLabel>
                  <Glass padding={0}>
                    {Object.keys(rfByTipo).map(function(tipo, i) {
                      var td = rfByTipo[tipo];
                      var pct = rfTotalAplicado > 0 ? (td.valor / rfTotalAplicado * 100) : 0;
                      var rentTipo = td.valor > 0 ? ((td.valorAtual - td.valor) / td.valor * 100) : 0;
                      return (
                        <View key={tipo} style={[styles.rankRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                            <Text style={styles.rankTicker}>{RF_TIPO_LABELS[tipo] || tipo}</Text>
                            {RF_ISENTOS[tipo] && <Badge text="Isento IR" color={C.green} />}
                            <View style={styles.rankBarBg}>
                              <View style={[styles.rankBarFill, { width: pct + '%', backgroundColor: C.rf }]} />
                            </View>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={[styles.rankPct, { color: C.rf }]}>{pct.toFixed(0)}%</Text>
                            <Text style={styles.rankVal}>R$ {fmt(td.valor)} | {rentTipo >= 0 ? '+' : ''}{rentTipo.toFixed(1)}%</Text>
                          </View>
                        </View>
                      );
                    })}
                  </Glass>

                  {/* Breakdown by Indexador */}
                  <SectionLabel>POR INDEXADOR</SectionLabel>
                  <Glass padding={0}>
                    {Object.keys(rfByIndexador).map(function(idx, i) {
                      var id = rfByIndexador[idx];
                      var pct = rfTotalAplicado > 0 ? (id.valor / rfTotalAplicado * 100) : 0;
                      var idxColor = RF_IDX_COLORS[idx] || C.rf;
                      var rentIdx = id.valor > 0 ? ((id.valorAtual - id.valor) / id.valor * 100) : 0;
                      return (
                        <View key={idx} style={[styles.rankRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                            <Badge text={RF_IDX_LABELS[idx] || idx} color={idxColor} />
                            <View style={styles.rankBarBg}>
                              <View style={[styles.rankBarFill, { width: pct + '%', backgroundColor: idxColor }]} />
                            </View>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={[styles.rankPct, { color: idxColor }]}>{pct.toFixed(0)}%</Text>
                            <Text style={styles.rankVal}>R$ {fmt(id.valor)} | {rentIdx >= 0 ? '+' : ''}{rentIdx.toFixed(1)}%</Text>
                          </View>
                        </View>
                      );
                    })}
                  </Glass>

                  {/* Detalhamento por titulo */}
                  <SectionLabel>DETALHAMENTO</SectionLabel>
                  {rfEnriched.map(function(re, i) {
                    var rf = re.item;
                    var tipoLabel = RF_TIPO_LABELS[rf.tipo] || rf.tipo;
                    var urgencyColor = re.diasVenc < 30 ? C.red : (re.diasVenc < 90 ? C.yellow : C.rf);
                    return (
                      <Glass key={rf.id || i} padding={0}>
                        <View style={styles.posCard}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={styles.rankTicker}>{tipoLabel}</Text>
                              <Badge text={re.irFaixa} color={re.isIsento ? C.green : C.yellow} />
                              <Badge text={re.diasVenc + 'd'} color={urgencyColor} />
                            </View>
                            <Text style={[styles.rankPct, { color: C.rf }]}>R$ {fmt(re.valorAtual)}</Text>
                          </View>
                          <Text style={[styles.posDetail, { marginTop: 4 }]}>
                            {rf.emissor || 'N/A'} | {rf.taxa + '% ' + (RF_IDX_LABELS[rf.indexador] || '')}
                          </Text>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                            <Text style={styles.posDetail}>
                              Aplicado: R$ {fmt(parseFloat(rf.valor_aplicado) || 0)}
                            </Text>
                            <Text style={[styles.posDetail, { color: re.rendBruto >= 0 ? C.green : C.red }]}>
                              Bruto: {re.rendBruto >= 0 ? '+' : ''}R$ {fmt(Math.abs(re.rendBruto))} ({re.rentBrutaPct.toFixed(1)}%)
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                            <Text style={styles.posDetail}>
                              Venc: {(function() { var d = new Date(rf.vencimento); return d.toLocaleDateString('pt-BR'); })()}
                            </Text>
                            <Text style={[styles.posDetail, { color: C.green }]}>
                              Liq: {re.rendLiquido >= 0 ? '+' : ''}R$ {fmt(Math.abs(re.rendLiquido))} ({re.rentLiqPct.toFixed(1)}%)
                            </Text>
                          </View>
                          {re.isIsento && re.cdiEquiv > 0 && (
                            <Text style={[styles.posDetail, { marginTop: 2, color: C.green }]}>
                              CDI equivalente: {re.cdiEquiv.toFixed(1)}% (vs {rf.taxa}% isento)
                            </Text>
                          )}
                        </View>
                      </Glass>
                    );
                  })}
                </>
              )}
            </>
          )}
        </>
      )}

      {/* ═══════════ ALOCACAO ═══════════ */}
      {sub === 'aloc' && (
        <>
          {positions.length === 0 ? (
            <EmptyState
              icon="\u25EB"
              title="Sem ativos"
              description="Adicione operacoes para ver a alocacao da carteira"
              color={C.accent}
            />
          ) : (
            <>
              {/* Donut */}
              <Glass glow={C.accent} padding={14}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                  <View style={{ position: 'relative', width: 90, height: 90 }}>
                    <Svg width={90} height={90} viewBox="0 0 90 90">
                      {(function() {
                        var cum = 0;
                        return Object.keys(alocGrouped).map(function(cat, i) {
                          var valor = alocGrouped[cat];
                          var pct = totalAlocPatrimonio > 0 ? valor / totalAlocPatrimonio : 0;
                          var r = 38;
                          var circ = 2 * Math.PI * r;
                          var dash = pct * circ;
                          var offset = -(cum) * circ;
                          cum += pct;
                          return (
                            <Circle
                              key={i}
                              cx={45} cy={45} r={r}
                              fill="none"
                              stroke={CAT_COLORS[cat] || C.accent}
                              strokeWidth={8}
                              strokeDasharray={dash + ' ' + (circ - dash)}
                              strokeDashoffset={offset}
                              rotation={-90}
                              origin="45,45"
                            />
                          );
                        });
                      })()}
                    </Svg>
                    <View style={styles.donutCenter}>
                      <Text style={styles.donutValue}>
                        R$ {fmt(totalAlocPatrimonio)}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    {Object.keys(alocGrouped).map(function(cat, i) {
                      var valor = alocGrouped[cat];
                      var pct = totalAlocPatrimonio > 0 ? (valor / totalAlocPatrimonio * 100) : 0;
                      return (
                        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: CAT_COLORS[cat] || C.accent }} />
                          <Text style={{ fontSize: 10, color: C.text, fontFamily: F.body, flex: 1 }}>
                            {CAT_LABELS[cat] || cat}
                          </Text>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: CAT_COLORS[cat] || C.accent, fontFamily: F.mono }}>
                            {pct.toFixed(0)}%
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              </Glass>

              {/* Position list */}
              <Glass padding={0}>
                {positions.map(function(p, i) {
                  var cat = p.categoria || 'acao';
                  var valor = p.quantidade * (p.preco_atual || p.pm);
                  var pct = totalAlocPatrimonio > 0 ? (valor / totalAlocPatrimonio * 100) : 0;
                  return (
                    <View key={i} style={[styles.allocRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 3, height: 20, borderRadius: 2, backgroundColor: CAT_COLORS[cat] || C.accent }} />
                        <Text style={styles.allocTicker}>{p.ticker}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={styles.allocBarBg}>
                          <View style={[styles.allocBarFill, { width: pct + '%', backgroundColor: CAT_COLORS[cat] || C.accent }]} />
                        </View>
                        <Text style={[styles.allocPct, { color: CAT_COLORS[cat] || C.accent }]}>{pct.toFixed(0)}%</Text>
                      </View>
                    </View>
                  );
                })}
              </Glass>

              {/* Treemap */}
              {assetList.length > 0 && (
                <>
                  <SectionLabel>TREEMAP — EXPOSIÇÃO</SectionLabel>
                  <Glass padding={14}>
                    <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, marginBottom: 8 }}>
                      Tamanho = peso na carteira · Cor = performance
                    </Text>
                    <Treemap items={assetList} height={130} />
                  </Glass>
                </>
              )}

              {/* Rebalanceamento */}
              <SectionLabel>REBALANCEAMENTO</SectionLabel>
              <RebalanceTool allocAtual={alocGrouped} totalCarteira={totalAlocPatrimonio} />
            </>
          )}
        </>
      )}

      {/* ═══════════ PROVENTOS ═══════════ */}
      {sub === 'prov' && (
        <>
          {/* Summary card */}
          <Glass glow={C.fiis} padding={14}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
              {[
                { l: 'TOTAL', v: 'R$ ' + fmt(totalProvs), c: C.fiis },
                { l: 'REGISTROS', v: String(filteredProventos.length), c: C.accent },
                { l: 'YIELD 12M', v: yieldOnCost.toFixed(1) + '%', c: C.green },
              ].map(function(d, i) {
                return (
                  <View key={i} style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 }}>{d.l}</Text>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: d.c, fontFamily: F.display, marginTop: 2 }}>{d.v}</Text>
                  </View>
                );
              })}
            </View>
          </Glass>

          {/* Filter pills */}
          <View style={styles.provFilterRow}>
            {PROV_FILTERS.map(function(f) {
              return (
                <Pill key={f.k} active={provFilter === f.k} color={C.fiis}
                  onPress={function() { setProvFilter(f.k); }}>
                  {f.l}
                </Pill>
              );
            })}
          </View>

          {/* Bar chart */}
          {maxProvMonth > 0 && (
            <Glass padding={12}>
              <Text style={styles.sectionTitle}>PROVENTOS MENSAIS</Text>
              <ProvBarChart data={last12} maxVal={maxProvMonth} />
            </Glass>
          )}

          {/* Monthly list */}
          {Object.keys(provsByMonth).length === 0 ? (
            <EmptyState
              icon="\u25C9"
              title="Sem proventos"
              description="Os proventos recebidos aparecerao aqui agrupados por mes"
              color={C.fiis}
            />
          ) : (
            Object.keys(provsByMonth)
              .sort(function(a, b) { return b.localeCompare(a); })
              .slice(0, 12)
              .map(function(month) {
                var items = provsByMonth[month];
                var total = items.reduce(function(s, p) { return s + (p.valor_total || 0); }, 0);
                var parts = month.split('-');
                var label = MONTH_LABELS[parseInt(parts[1])] + '/' + parts[0];
                return (
                  <Glass key={month} padding={0}>
                    <View style={styles.monthHeader}>
                      <Text style={styles.monthLabel}>{label}</Text>
                      <Text style={[styles.monthTotal, { color: C.green }]}>
                        +R$ {fmt(total)}
                      </Text>
                    </View>
                    {items.map(function(p, i) {
                      return (
                        <View key={i} style={[styles.provRow, { borderTopWidth: 1, borderTopColor: C.border }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ fontSize: 10, color: C.text, fontFamily: F.body }}>{p.ticker}</Text>
                            <Badge text={p.tipo_provento || 'DIV'} color={C.fiis} />
                          </View>
                          <Text style={{ fontSize: 10, fontWeight: '600', color: C.green, fontFamily: F.mono }}>
                            +R$ {fmt(p.valor_total || 0)}
                          </Text>
                        </View>
                      );
                    })}
                  </Glass>
                );
              })
          )}
        </>
      )}

      {/* ═══════════ INDICADORES ═══════════ */}
      {sub === 'ind' && (
        <>
          {/* Consulta avulsa */}
          <Glass padding={14}>
            <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginBottom: 6 }}>CONSULTAR ATIVO AVULSO</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput
                value={searchTicker}
                onChangeText={function(t) { setSearchTicker(t.toUpperCase()); }}
                placeholder="Ex: WEGE3"
                placeholderTextColor={C.dim}
                autoCapitalize="characters"
                style={{
                  flex: 1, backgroundColor: C.cardSolid, borderWidth: 1, borderColor: C.border,
                  borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
                  fontSize: 14, color: C.text, fontFamily: F.mono,
                }}
              />
              <TouchableOpacity
                activeOpacity={0.8}
                disabled={searchLoading || searchTicker.length < 4}
                onPress={function() {
                  var tk = searchTicker.trim().toUpperCase();
                  if (tk.length < 4) return;
                  setSearchLoading(true);
                  setSearchError('');
                  setSearchResult(null);
                  fetchPriceHistoryLong([tk, '^BVSP']).then(function(histMap) {
                    var hist = histMap[tk];
                    if (!hist || hist.length < 20) {
                      setSearchError('Dados insuficientes para ' + tk + ' (minimo 20 candles)');
                      setSearchLoading(false);
                      return;
                    }
                    var closes = [];
                    var highs = [];
                    var lows = [];
                    var volumes = [];
                    for (var i = 0; i < hist.length; i++) {
                      closes.push(hist[i].close);
                      highs.push(hist[i].high);
                      lows.push(hist[i].low);
                      volumes.push(hist[i].volume || 0);
                    }
                    var ibovHist = histMap['^BVSP'];
                    var ibovCloses = [];
                    if (ibovHist) {
                      for (var j = 0; j < ibovHist.length; j++) {
                        ibovCloses.push(ibovHist[j].close);
                      }
                    }
                    var volSum = 0;
                    var volCount = Math.min(20, volumes.length);
                    for (var v = volumes.length - volCount; v < volumes.length; v++) {
                      volSum = volSum + volumes[v];
                    }
                    var res = {
                      ticker: tk,
                      preco_fechamento: closes[closes.length - 1],
                      hv_20: closes.length >= 21 ? calcHV(closes, 20) : null,
                      hv_60: closes.length >= 61 ? calcHV(closes, 60) : null,
                      sma_20: closes.length >= 20 ? calcSMA(closes, 20) : null,
                      sma_50: closes.length >= 50 ? calcSMA(closes, 50) : null,
                      ema_9: closes.length >= 9 ? calcEMA(closes, 9) : null,
                      ema_21: closes.length >= 21 ? calcEMA(closes, 21) : null,
                      rsi_14: closes.length >= 15 ? calcRSI(closes, 14) : null,
                      beta: ibovCloses.length >= 21 ? calcBeta(closes, ibovCloses, 20) : null,
                      atr_14: closes.length >= 15 ? calcATR(highs, lows, closes, 14) : null,
                      max_drawdown: calcMaxDrawdown(closes),
                      bb_upper: null, bb_lower: null, bb_width: null,
                      volume_medio_20: volCount > 0 ? volSum / volCount : null,
                    };
                    if (closes.length >= 20) {
                      var bb = calcBollingerBands(closes, 20, 2);
                      res.bb_upper = bb.upper;
                      res.bb_lower = bb.lower;
                      res.bb_width = bb.width;
                    }
                    setSearchResult(res);
                    setSearchLoading(false);
                  }).catch(function(e) {
                    setSearchError('Erro ao buscar ' + tk + ': ' + e.message);
                    setSearchLoading(false);
                  });
                }}
                style={{
                  backgroundColor: C.accent, borderRadius: 10,
                  paddingHorizontal: 16, paddingVertical: 10,
                  opacity: (searchLoading || searchTicker.length < 4) ? 0.4 : 1,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: 'white', fontFamily: F.display }}>
                  {searchLoading ? 'Buscando...' : 'Buscar'}
                </Text>
              </TouchableOpacity>
            </View>
            {searchError ? (
              <Text style={{ fontSize: 11, color: C.red, fontFamily: F.body, marginTop: 6 }}>{searchError}</Text>
            ) : null}
          </Glass>

          {/* Search result card */}
          {searchResult && (
            <Glass padding={14} glow={C.accent}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: C.text, fontFamily: F.display }}>{searchResult.ticker}</Text>
                  <Badge text="AVULSO" color={C.accent} />
                </View>
                {searchResult.preco_fechamento != null ? (
                  <Text style={{ fontSize: 14, color: C.sub, fontFamily: F.mono }}>
                    {'R$ ' + fmt(searchResult.preco_fechamento)}
                  </Text>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {[
                  { l: 'HV 20d', v: searchResult.hv_20 != null ? searchResult.hv_20.toFixed(1) + '%' : '-', c: C.opcoes },
                  { l: 'HV 60d', v: searchResult.hv_60 != null ? searchResult.hv_60.toFixed(1) + '%' : '-', c: C.opcoes },
                  { l: 'RSI 14', v: searchResult.rsi_14 != null ? searchResult.rsi_14.toFixed(1) : '-',
                    c: searchResult.rsi_14 != null ? (searchResult.rsi_14 > 70 ? C.red : searchResult.rsi_14 < 30 ? C.green : C.text) : C.text },
                  { l: 'Beta', v: searchResult.beta != null ? searchResult.beta.toFixed(2) : '-',
                    c: searchResult.beta != null ? (searchResult.beta > 1.2 ? C.red : searchResult.beta < 0.8 ? C.green : C.text) : C.text },
                  { l: 'SMA 20', v: searchResult.sma_20 != null ? 'R$ ' + fmt(searchResult.sma_20) : '-', c: C.acoes },
                  { l: 'SMA 50', v: searchResult.sma_50 != null ? 'R$ ' + fmt(searchResult.sma_50) : '-', c: C.acoes },
                  { l: 'EMA 9', v: searchResult.ema_9 != null ? 'R$ ' + fmt(searchResult.ema_9) : '-', c: C.acoes },
                  { l: 'EMA 21', v: searchResult.ema_21 != null ? 'R$ ' + fmt(searchResult.ema_21) : '-', c: C.acoes },
                  { l: 'ATR 14', v: searchResult.atr_14 != null ? 'R$ ' + fmt(searchResult.atr_14) : '-', c: C.text },
                  { l: 'Max DD', v: searchResult.max_drawdown != null ? searchResult.max_drawdown.toFixed(1) + '%' : '-', c: C.red },
                  { l: 'BB Upper', v: searchResult.bb_upper != null ? 'R$ ' + fmt(searchResult.bb_upper) : '-', c: C.acoes },
                  { l: 'BB Lower', v: searchResult.bb_lower != null ? 'R$ ' + fmt(searchResult.bb_lower) : '-', c: C.acoes },
                  { l: 'BB Width', v: searchResult.bb_width != null ? searchResult.bb_width.toFixed(1) + '%' : '-', c: C.opcoes },
                  { l: 'Vol Med 20', v: searchResult.volume_medio_20 != null ? fmtC(searchResult.volume_medio_20) : '-', c: C.sub },
                ].map(function(d, di) {
                  return (
                    <View key={di} style={styles.indDetailItem}>
                      <Text style={styles.indDetailLabel}>{d.l}</Text>
                      <Text style={[styles.indDetailValue, { color: d.c }]}>{d.v}</Text>
                    </View>
                  );
                })}
              </View>
            </Glass>
          )}

          {indicators.length === 0 ? (
            !searchResult ? (
              <EmptyState
                icon={'\u0394'} title="Sem indicadores"
                description="Indicadores sao calculados automaticamente apos 18h em dias uteis. Adicione ativos na carteira para comecar. Use a busca acima para consultar qualquer ativo."
                color={C.opcoes}
              />
            ) : null
          ) : (
            <>
              {/* Summary */}
              <Glass padding={14}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                  {[
                    { l: 'ATIVOS', v: String(indicators.length), c: C.acoes },
                    { l: 'ULTIMO CALCULO', v: indicators[0] && indicators[0].data_calculo
                      ? new Date(indicators[0].data_calculo).toLocaleDateString('pt-BR') : '–', c: C.sub },
                  ].map(function(m, i) {
                    return (
                      <View key={i} style={{ alignItems: 'center', flex: 1 }}>
                        <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 }}>{m.l}</Text>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: m.c, fontFamily: F.display, marginTop: 2 }}>{m.v}</Text>
                      </View>
                    );
                  })}
                </View>
              </Glass>

              {/* Recalculate button */}
              <TouchableOpacity
                activeOpacity={0.8}
                style={{ backgroundColor: C.opcoes + '15', borderWidth: 1, borderColor: C.opcoes + '30', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
                onPress={function() {
                  if (!user) return;
                  runDailyCalculation(user.id).then(function(calcResult) {
                    if (calcResult.data && calcResult.data.length > 0) {
                      setIndicators(calcResult.data);
                    }
                  }).catch(function(e) {
                    console.warn('Manual calc failed:', e);
                  });
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: C.opcoes, fontFamily: F.display }}>Recalcular indicadores</Text>
              </TouchableOpacity>

              {/* Table header */}
              <Glass padding={0}>
                <View style={styles.indTableHeader}>
                  <Text style={[styles.indTableCol, { flex: 1.2 }]}>Ticker</Text>
                  <Text style={styles.indTableCol}>HV 20d</Text>
                  <Text style={styles.indTableCol}>RSI</Text>
                  <Text style={styles.indTableCol}>Beta</Text>
                  <Text style={styles.indTableCol}>Max DD</Text>
                </View>

                {/* Table rows */}
                {indicators.map(function(ind, i) {
                  var rsiColor = C.text;
                  if (ind.rsi_14 != null) {
                    if (ind.rsi_14 > 70) rsiColor = C.red;
                    else if (ind.rsi_14 < 30) rsiColor = C.green;
                  }
                  var betaColor = C.text;
                  if (ind.beta != null) {
                    if (ind.beta > 1.2) betaColor = C.red;
                    else if (ind.beta < 0.8) betaColor = C.green;
                  }
                  return (
                    <View key={ind.ticker || i} style={[styles.indTableRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                      <Text style={[styles.indTableTicker, { flex: 1.2 }]}>{ind.ticker}</Text>
                      <Text style={[styles.indTableVal, { color: C.opcoes }]}>
                        {ind.hv_20 != null ? ind.hv_20.toFixed(1) + '%' : '–'}
                      </Text>
                      <Text style={[styles.indTableVal, { color: rsiColor }]}>
                        {ind.rsi_14 != null ? ind.rsi_14.toFixed(0) : '–'}
                      </Text>
                      <Text style={[styles.indTableVal, { color: betaColor }]}>
                        {ind.beta != null ? ind.beta.toFixed(2) : '–'}
                      </Text>
                      <Text style={[styles.indTableVal, { color: C.red }]}>
                        {ind.max_drawdown != null ? ind.max_drawdown.toFixed(1) + '%' : '–'}
                      </Text>
                    </View>
                  );
                })}
              </Glass>

              {/* Detailed cards per ticker */}
              <SectionLabel>DETALHES POR ATIVO</SectionLabel>
              {indicators.map(function(ind, i) {
                return (
                  <Glass key={ind.ticker || i} padding={14}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: C.text, fontFamily: F.display }}>{ind.ticker}</Text>
                      {ind.preco_fechamento != null ? (
                        <Text style={{ fontSize: 13, color: C.sub, fontFamily: F.mono }}>
                          {'R$ ' + fmt(ind.preco_fechamento)}
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {[
                        { l: 'HV 20d', v: ind.hv_20 != null ? ind.hv_20.toFixed(1) + '%' : '–', c: C.opcoes },
                        { l: 'HV 60d', v: ind.hv_60 != null ? ind.hv_60.toFixed(1) + '%' : '–', c: C.opcoes },
                        { l: 'RSI 14', v: ind.rsi_14 != null ? ind.rsi_14.toFixed(1) : '–',
                          c: ind.rsi_14 != null ? (ind.rsi_14 > 70 ? C.red : ind.rsi_14 < 30 ? C.green : C.text) : C.text },
                        { l: 'Beta', v: ind.beta != null ? ind.beta.toFixed(2) : '–',
                          c: ind.beta != null ? (ind.beta > 1.2 ? C.red : ind.beta < 0.8 ? C.green : C.text) : C.text },
                        { l: 'SMA 20', v: ind.sma_20 != null ? 'R$ ' + fmt(ind.sma_20) : '–', c: C.acoes },
                        { l: 'SMA 50', v: ind.sma_50 != null ? 'R$ ' + fmt(ind.sma_50) : '–', c: C.acoes },
                        { l: 'EMA 9', v: ind.ema_9 != null ? 'R$ ' + fmt(ind.ema_9) : '–', c: C.acoes },
                        { l: 'EMA 21', v: ind.ema_21 != null ? 'R$ ' + fmt(ind.ema_21) : '–', c: C.acoes },
                        { l: 'ATR 14', v: ind.atr_14 != null ? 'R$ ' + fmt(ind.atr_14) : '–', c: C.text },
                        { l: 'Max DD', v: ind.max_drawdown != null ? ind.max_drawdown.toFixed(1) + '%' : '–', c: C.red },
                        { l: 'BB Upper', v: ind.bb_upper != null ? 'R$ ' + fmt(ind.bb_upper) : '–', c: C.acoes },
                        { l: 'BB Lower', v: ind.bb_lower != null ? 'R$ ' + fmt(ind.bb_lower) : '–', c: C.acoes },
                        { l: 'BB Width', v: ind.bb_width != null ? ind.bb_width.toFixed(1) + '%' : '–', c: C.opcoes },
                        { l: 'Vol Med 20', v: ind.volume_medio_20 != null ? fmtC(ind.volume_medio_20) : '–', c: C.sub },
                      ].map(function(d, di) {
                        return (
                          <View key={di} style={styles.indDetailItem}>
                            <Text style={styles.indDetailLabel}>{d.l}</Text>
                            <Text style={[styles.indDetailValue, { color: d.c }]}>{d.v}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </Glass>
                );
              })}
            </>
          )}
        </>
      )}

      {/* ═══════════ IR ═══════════ */}
      {sub === 'ir' && (
        <>
          {irTaxData.length === 0 ? (
            <EmptyState
              icon="\u25C9"
              title="Sem vendas registradas"
              description="O calculo de IR sera feito automaticamente quando voce registrar vendas de ativos"
              color={C.accent}
            />
          ) : (
            <>
              {/* Summary */}
              <Glass glow={C.accent} padding={14}>
                <View style={styles.irSummaryRow}>
                  <View style={styles.irSummaryItem}>
                    <Text style={styles.irSummaryLabel}>GANHOS</Text>
                    <Text style={[styles.irSummaryValue, { color: C.green }]}>
                      R$ {fmt(irTotalGanhos)}
                    </Text>
                  </View>
                  <View style={styles.irSummaryItem}>
                    <Text style={styles.irSummaryLabel}>PERDAS</Text>
                    <Text style={[styles.irSummaryValue, { color: C.red }]}>
                      R$ {fmt(irTotalPerdas)}
                    </Text>
                  </View>
                  <View style={styles.irSummaryItem}>
                    <Text style={styles.irSummaryLabel}>SALDO</Text>
                    <Text style={[styles.irSummaryValue, { color: irSaldoLiquido >= 0 ? C.green : C.red }]}>
                      R$ {fmt(irSaldoLiquido)}
                    </Text>
                  </View>
                </View>
              </Glass>

              {/* Imposto total */}
              {irTotalImposto > 0 && (
                <Glass glow={C.yellow} padding={14}>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={styles.irSummaryLabel}>IMPOSTO TOTAL ESTIMADO</Text>
                    <Text style={[styles.irSummaryValue, { color: C.yellow, fontSize: 22 }]}>
                      R$ {fmt(irTotalImposto)}
                    </Text>
                  </View>
                </Glass>
              )}

              {/* Alerta 20k */}
              {hasAlerta20k && (
                <View style={styles.irAlert}>
                  <Text style={styles.irAlertText}>
                    Vendas de acoes acima de R$ 20.000 em algum mes — ganhos tributaveis a 15%
                  </Text>
                </View>
              )}

              {/* Monthly breakdown */}
              <SectionLabel>DETALHAMENTO MENSAL</SectionLabel>
              {irTaxData.slice().reverse().map(function(m) {
                var parts = m.month.split('-');
                var label = MONTH_LABELS[parseInt(parts[1])] + '/' + parts[0];
                var vendasTotal = m.vendasAcoes + m.vendasFII + m.vendasETF;
                return (
                  <Glass key={m.month} padding={0}>
                    <View style={styles.irMonthHeader}>
                      <Text style={styles.irMonthLabel}>{label}</Text>
                      {m.impostoTotal > 0 ? (
                        <Badge text={'DARF R$ ' + fmt(m.impostoTotal)} color={C.yellow} />
                      ) : (
                        <Badge text="Isento" color={C.green} />
                      )}
                    </View>

                    {/* Vendas */}
                    <View style={styles.irRow}>
                      <Text style={styles.irRowLabel}>Vendas totais</Text>
                      <Text style={styles.irRowValue}>R$ {fmt(vendasTotal)}</Text>
                    </View>

                    {m.vendasAcoes > 0 && (
                      <View style={styles.irRow}>
                        <Text style={styles.irRowLabel}>  Acoes {m.alertaAcoes20k ? '(>20k)' : '(<20k)'}</Text>
                        <Text style={styles.irRowValue}>R$ {fmt(m.vendasAcoes)}</Text>
                      </View>
                    )}
                    {m.vendasFII > 0 && (
                      <View style={styles.irRow}>
                        <Text style={styles.irRowLabel}>  FIIs</Text>
                        <Text style={styles.irRowValue}>R$ {fmt(m.vendasFII)}</Text>
                      </View>
                    )}
                    {m.vendasETF > 0 && (
                      <View style={styles.irRow}>
                        <Text style={styles.irRowLabel}>  ETFs</Text>
                        <Text style={styles.irRowValue}>R$ {fmt(m.vendasETF)}</Text>
                      </View>
                    )}

                    {/* Ganhos/Perdas */}
                    <View style={[styles.irRow, { borderTopWidth: 1, borderTopColor: C.border }]}>
                      <Text style={styles.irRowLabel}>Ganhos realizados</Text>
                      <Text style={[styles.irRowValue, { color: C.green }]}>
                        +R$ {fmt(m.ganhoAcoes + m.ganhoFII + m.ganhoETF)}
                      </Text>
                    </View>
                    {(m.perdaAcoes + m.perdaFII + m.perdaETF) > 0 && (
                      <View style={styles.irRow}>
                        <Text style={styles.irRowLabel}>Perdas realizadas</Text>
                        <Text style={[styles.irRowValue, { color: C.red }]}>
                          -R$ {fmt(m.perdaAcoes + m.perdaFII + m.perdaETF)}
                        </Text>
                      </View>
                    )}

                    {/* Prejuizo acumulado */}
                    {(m.prejAcumAcoes + m.prejAcumFII + m.prejAcumETF) > 0 && (
                      <View style={styles.irRow}>
                        <Text style={styles.irRowLabel}>Prejuizo acumulado</Text>
                        <Text style={[styles.irRowValue, { color: C.sub }]}>
                          R$ {fmt(m.prejAcumAcoes + m.prejAcumFII + m.prejAcumETF)}
                        </Text>
                      </View>
                    )}

                    {/* DARF footer */}
                    {m.impostoTotal > 0 ? (
                      <View style={styles.irDarfRow}>
                        <Text style={styles.irDarfLabel}>DARF estimado</Text>
                        <Text style={styles.irDarfValue}>R$ {fmt(m.impostoTotal)}</Text>
                      </View>
                    ) : (
                      <View style={[styles.irDarfRow, { backgroundColor: C.green + '08' }]}>
                        <Text style={[styles.irDarfLabel, { color: C.green }]}>Isento</Text>
                        <Text style={[styles.irDarfValue, { color: C.green }]}>R$ 0,00</Text>
                      </View>
                    )}
                  </Glass>
                );
              })}
            </>
          )}
        </>
      )}

      <View style={{ height: SIZE.tabBarHeight + 20 }} />
    </ScrollView>
  );
}

// ═══════════ STYLES ═══════════

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: SIZE.gap },
  subTabs: { flexDirection: 'row', gap: 5 },

  // Hero
  heroLabel: { fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 0.6 },
  heroValue: { fontSize: 24, fontWeight: '800', color: C.text, fontFamily: F.display, marginTop: 2, letterSpacing: -0.5 },
  heroPct: { fontSize: 18, fontWeight: '700', fontFamily: F.mono, marginTop: 2 },
  heroPctSub: { fontSize: 11, fontFamily: F.mono, marginTop: 1 },

  // Period pills
  periodRow: { flexDirection: 'row', gap: 6 },
  periodPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  periodPillActive: { backgroundColor: C.accent + '20', borderColor: C.accent + '50' },
  periodPillInactive: { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)' },
  periodPillText: { fontSize: 11, fontWeight: '700', fontFamily: F.mono, letterSpacing: 0.5 },

  // KPI
  kpiRow: { flexDirection: 'row', gap: 8 },
  kpiCard: { alignItems: 'center', gap: 2 },
  kpiLabel: { fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 },
  kpiValue: { fontSize: 16, fontWeight: '800', fontFamily: F.display },
  kpiSub: { fontSize: 10, color: C.dim, fontFamily: F.mono },

  // Section
  sectionTitle: { fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 0.6, marginBottom: 2 },

  // Benchmark legend
  benchLegend: { flexDirection: 'row', gap: 16, marginTop: 8 },
  benchLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  benchLegendDot: { width: 12, height: 2, borderRadius: 1 },
  benchLegendLabel: { fontSize: 11, color: C.dim, fontFamily: F.mono },
  benchLegendValue: { fontSize: 11, fontWeight: '600', fontFamily: F.mono },

  // Donut
  donutCenter: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
  },
  donutValue: { fontSize: 13, fontWeight: '800', color: C.text, fontFamily: F.display },

  // Alloc
  allocRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  allocTicker: { fontSize: 12, fontWeight: '700', color: C.text, fontFamily: F.display },
  allocBarBg: { width: 60, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.03)' },
  allocBarFill: { height: 4, borderRadius: 2 },
  allocPct: { fontSize: 12, fontWeight: '800', fontFamily: F.display, width: 36, textAlign: 'right' },

  // Proventos
  provFilterRow: { flexDirection: 'row', gap: 5 },
  monthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  monthLabel: { fontSize: 12, fontWeight: '700', color: C.text, fontFamily: F.display },
  monthTotal: { fontSize: 12, fontWeight: '700', fontFamily: F.mono },
  provRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12 },

  // IR
  irSummaryRow: { flexDirection: 'row', justifyContent: 'space-around' },
  irSummaryItem: { alignItems: 'center', flex: 1 },
  irSummaryLabel: { fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.3 },
  irSummaryValue: { fontSize: 16, fontWeight: '800', fontFamily: F.display, marginTop: 2 },
  irMonthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  irMonthLabel: { fontSize: 12, fontWeight: '700', color: C.text, fontFamily: F.display },
  irRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12 },
  irRowLabel: { fontSize: 10, color: C.sub, fontFamily: F.body },
  irRowValue: { fontSize: 10, fontWeight: '600', fontFamily: F.mono, color: C.text },
  irDarfRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: C.yellow + '08', borderBottomLeftRadius: SIZE.radius, borderBottomRightRadius: SIZE.radius },
  irDarfLabel: { fontSize: 10, fontWeight: '700', color: C.yellow, fontFamily: F.body },
  irDarfValue: { fontSize: 12, fontWeight: '800', color: C.yellow, fontFamily: F.mono },
  irAlert: { padding: 10, borderRadius: 8, backgroundColor: C.yellow + '10', borderWidth: 1, borderColor: C.yellow + '25' },
  irAlertText: { fontSize: 10, color: C.yellow, fontFamily: F.body, textAlign: 'center' },

  // Performance sub-tabs
  perfSubTabs: { flexDirection: 'row', gap: 5, marginBottom: 4 },
  catHeroDivider: { height: 1, backgroundColor: C.border, marginVertical: 10 },

  // Ranking
  rankRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  rankIndex: { fontSize: 10, color: C.dim, fontFamily: F.mono, width: 16 },
  rankTicker: { fontSize: 12, fontWeight: '700', color: C.text, fontFamily: F.display },
  rankBarBg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.03)', marginHorizontal: 8 },
  rankBarFill: { height: 4, borderRadius: 2 },
  rankPct: { fontSize: 12, fontWeight: '800', fontFamily: F.mono },
  rankVal: { fontSize: 11, color: C.sub, fontFamily: F.mono, marginTop: 1 },

  // Position cards
  posCard: { padding: 12 },
  posDetail: { fontSize: 11, color: C.dim, fontFamily: F.mono },

  // HBar
  hbarRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  hbarLabel: { width: 60, fontSize: 10, color: C.sub, fontWeight: '600', fontFamily: F.mono },
  hbarTrack: { flex: 1, height: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.03)' },
  hbarFill: { height: 12, borderRadius: 6, borderWidth: 1, minWidth: 4 },
  hbarValue: { width: 55, fontSize: 10, fontWeight: '700', fontFamily: F.mono, textAlign: 'right' },

  // Rebalance
  rebalHeader: { flexDirection: 'row', alignItems: 'center', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 6 },
  rebalColLabel: { flex: 1, fontSize: 10, color: C.dim, fontFamily: F.mono, textAlign: 'center' },
  rebalRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  rebalInput: { width: 36, height: 22, borderRadius: 4, borderWidth: 1, borderColor: C.accent + '40',
    backgroundColor: C.accent + '08', color: C.accent, fontSize: 11, fontFamily: F.mono,
    textAlign: 'center', paddingVertical: 0, paddingHorizontal: 4 },

  // Indicators table
  indTableHeader: { flexDirection: 'row', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: 'rgba(255,255,255,0.02)' },
  indTableCol: { flex: 1, fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4, textAlign: 'center' },
  indTableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10 },
  indTableTicker: { flex: 1, fontSize: 12, fontWeight: '700', color: C.text, fontFamily: F.display },
  indTableVal: { flex: 1, fontSize: 11, fontWeight: '600', fontFamily: F.mono, textAlign: 'center' },
  indDetailItem: { width: '31%', backgroundColor: C.surface, borderRadius: 8, padding: 8, borderWidth: 1, borderColor: C.border },
  indDetailLabel: { fontSize: 8, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 },
  indDetailValue: { fontSize: 12, fontWeight: '700', fontFamily: F.display, marginTop: 2 },
});
