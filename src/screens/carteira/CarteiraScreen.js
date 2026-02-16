import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, ActivityIndicator, LayoutAnimation,
  Platform, UIManager, TextInput,
} from 'react-native';
import Svg, {
  Circle as SvgCircle, Path, Defs, LinearGradient as SvgGrad,
  Stop, Rect as SvgRect, Line as SvgLine, G, Text as SvgText,
} from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { C, F, SIZE, PRODUCT_COLORS } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getPositions, getSaldos, getRendaFixa } from '../../services/database';
import { enrichPositionsWithPrices, fetchPriceHistory, clearPriceCache, getLastPriceUpdate } from '../../services/priceService';
import { Glass, Badge, Pill, SectionLabel } from '../../components';
import { MiniLineChart } from '../../components/InteractiveChart';
import { LoadingScreen, EmptyState } from '../../components/States';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ══════════ HELPERS ══════════
var FILTERS = [
  { k: 'todos', l: 'Todos', color: C.accent },
  { k: 'acoes', l: 'Ações', cat: 'acao', color: C.acoes },
  { k: 'fiis', l: 'FIIs', cat: 'fii', color: C.fiis },
  { k: 'etfs', l: 'ETFs', cat: 'etf', color: C.etfs },
  { k: 'rf', l: 'RF', color: C.rf },
];
var CAT_LABELS = { acao: 'Ação', fii: 'FII', etf: 'ETF', opcao: 'Opção' };
var CAT_NAMES = { acao: 'Ações', fii: 'FIIs', etf: 'ETFs', rf: 'RF' };
var TIPO_LABELS = {
  cdb: 'CDB', lci_lca: 'LCI/LCA', tesouro_selic: 'Tesouro Selic',
  tesouro_ipca: 'Tesouro IPCA+', tesouro_pre: 'Tesouro Pré', debenture: 'Debênture',
};
var IDX_COLORS = { prefixado: C.green, cdi: C.accent, ipca: C.fiis, selic: C.opcoes };

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtK(v) {
  var abs = Math.abs(v || 0);
  if (abs >= 1000000) return 'R$ ' + (v / 1000000).toFixed(1) + 'M';
  if (abs >= 1000) return 'R$ ' + (v / 1000).toFixed(1) + 'k';
  return 'R$ ' + fmt(v);
}
function formatTaxa(taxa, indexador) {
  var t = parseFloat(taxa) || 0;
  var idx = (indexador || 'prefixado').toLowerCase();
  if (idx === 'prefixado') return t.toFixed(1) + '% a.a.';
  if (idx === 'cdi') return t.toFixed(0) + '% CDI';
  if (idx === 'ipca') return 'IPCA + ' + t.toFixed(1) + '%';
  if (idx === 'selic') return t.toFixed(0) + '% Selic';
  return t.toFixed(1) + '%';
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ══════════════════════════════════════════════
// SECTION: DONUT CHART — alocação por classe
// ══════════════════════════════════════════════
function DonutChart(props) {
  var segments = props.segments || [];
  var s = props.size || 110;
  var strokeW = 10;
  var r = (s / 2) - strokeW;
  var circ = 2 * Math.PI * r;
  var offset = 0;

  return (
    <Svg width={s} height={s} viewBox={'0 0 ' + s + ' ' + s}>
      <SvgCircle cx={s / 2} cy={s / 2} r={r} fill="none"
        stroke="rgba(255,255,255,0.03)" strokeWidth={strokeW} />
      {segments.map(function (seg, i) {
        var dash = (seg.pct / 100) * circ;
        var gap = circ - dash;
        var o = offset;
        offset += dash;
        return (
          <SvgCircle key={i} cx={s / 2} cy={s / 2} r={r} fill="none"
            stroke={seg.color} strokeWidth={strokeW}
            strokeDasharray={dash + ' ' + gap}
            strokeDashoffset={-o}
            strokeLinecap="round"
            rotation={-90} origin={s / 2 + ',' + s / 2} />
        );
      })}
    </Svg>
  );
}

// ══════════════════════════════════════════════
// SECTION: TREEMAP — exposição visual
// ══════════════════════════════════════════════
function Treemap(props) {
  var items = props.items || [];
  var _w = useState(0);
  var width = _w[0]; var setWidth = _w[1];
  var height = props.height || 140;

  if (items.length === 0 || width === 0) {
    return <View onLayout={function (e) { setWidth(e.nativeEvent.layout.width); }} style={{ height: height }} />;
  }

  // Simple slice-and-dice treemap
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

// ══════════════════════════════════════════════
// SECTION: HORIZONTAL BAR — rentabilidade / peso
// ══════════════════════════════════════════════
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

// ══════════════════════════════════════════════
// SECTION: BENCHMARK COMPARISON — mini chart
// ══════════════════════════════════════════════
function BenchmarkChart(props) {
  var lines = props.lines || [];
  var height = props.height || 80;
  var _w = useState(0);
  var w = _w[0]; var setW = _w[1];

  if (w === 0 || lines.length === 0) {
    return <View onLayout={function (e) { setW(e.nativeEvent.layout.width); }} style={{ height: height }} />;
  }

  // Find global min/max across all lines
  var allVals = [];
  lines.forEach(function (line) { line.data.forEach(function (v) { allVals.push(v); }); });
  var max = Math.max.apply(null, allVals);
  var min = Math.min.apply(null, allVals);
  var range = max - min || 1;

  return (
    <View onLayout={function (e) { setW(e.nativeEvent.layout.width); }}>
      <Svg width={w} height={height}>
        {/* Grid */}
        {[0.33, 0.66].map(function (p, gi) {
          return <SvgLine key={gi} x1="0" y1={height * p} x2={w} y2={height * p}
            stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />;
        })}
        {lines.map(function (line, li) {
          var pts = line.data.map(function (v, i) {
            return {
              x: (i / (line.data.length - 1)) * w,
              y: 4 + (height - 8) - ((v - min) / range) * (height - 8),
            };
          });
          var d = 'M ' + pts[0].x + ' ' + pts[0].y;
          for (var i = 1; i < pts.length; i++) {
            var cpx = (pts[i - 1].x + pts[i].x) / 2;
            d += ' C ' + cpx + ' ' + pts[i - 1].y + ', ' + cpx + ' ' + pts[i].y + ', ' + pts[i].x + ' ' + pts[i].y;
          }
          return (
            <Path key={li} d={d} fill="none" stroke={line.color}
              strokeWidth={li === 0 ? '2' : '1.2'}
              strokeDasharray={li === 0 ? '' : '4,3'}
              strokeLinecap="round" opacity={li === 0 ? 1 : 0.5} />
          );
        })}
      </Svg>
      {/* Legend */}
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
        {lines.map(function (line, i) {
          return (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 10, height: 2, borderRadius: 1, backgroundColor: line.color,
                opacity: i === 0 ? 1 : 0.5 }} />
              <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono }}>{line.label}</Text>
              <Text style={{ fontSize: 8, color: line.color, fontWeight: '600', fontFamily: F.mono }}>
                {line.data.length > 0 ? (line.data[line.data.length - 1]).toFixed(1) + '%' : ''}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════
// SECTION: REBALANCEAMENTO TOOL
// ══════════════════════════════════════════════
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
        <Text style={styles.sectionTitle2}>REBALANCEAMENTO</Text>
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
          <Text style={{ fontSize: 9, color: C.red, fontFamily: F.mono, textAlign: 'center' }}>
            Total das metas: {totalTargetPct}% (deve ser 100%)
          </Text>
        </View>
      ) : null}

      {/* Header */}
      <View style={styles.rebalHeader}>
        <Text style={[styles.rebalColLabel, { flex: 2 }]}>Classe</Text>
        <Text style={styles.rebalColLabel}>Atual</Text>
        <Text style={styles.rebalColLabel}>Meta</Text>
        <Text style={styles.rebalColLabel}>Dif.</Text>
        <Text style={[styles.rebalColLabel, { flex: 1.5 }]}>Ação</Text>
      </View>

      {classes.map(function (cat) {
        var color = PRODUCT_COLORS[cat] || C.accent;
        var nome = CAT_NAMES[cat] || cat;
        var atualVal = (allocAtual[cat] || 0);
        var atualPct = totalCarteira > 0 ? (atualVal / totalCarteira) * 100 : 0;
        var metaPct = targets[cat] || 0;
        var diff = atualPct - metaPct;
        var diffColor = Math.abs(diff) < 2 ? C.green : diff > 0 ? C.yellow : C.red;
        var metaVal = (metaPct / 100) * totalCarteira;
        var ajuste = metaVal - atualVal;

        return (
          <View key={cat} style={styles.rebalRow}>
            {/* Classe */}
            <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
              <Text style={{ fontSize: 11, color: C.text, fontWeight: '600', fontFamily: F.body }}>{nome}</Text>
            </View>

            {/* Atual % */}
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.mono }}>{atualPct.toFixed(1)}%</Text>
            </View>

            {/* Meta % */}
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

            {/* Diferença */}
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 10, color: diffColor, fontWeight: '600', fontFamily: F.mono }}>
                {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
              </Text>
            </View>

            {/* Ação sugerida */}
            <View style={{ flex: 1.5, alignItems: 'flex-end' }}>
              {Math.abs(ajuste) > 50 ? (
                <Text style={{ fontSize: 9, color: ajuste > 0 ? C.green : C.red, fontWeight: '600', fontFamily: F.mono }}>
                  {ajuste > 0 ? '+ Comprar' : '− Vender'}
                </Text>
              ) : (
                <Text style={{ fontSize: 9, color: C.green, fontFamily: F.mono }}>✓ OK</Text>
              )}
              {Math.abs(ajuste) > 50 ? (
                <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono }}>
                  {fmtK(Math.abs(ajuste))}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}

      {/* Visual bars: atual vs meta */}
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
            <Text style={{ fontSize: 7, color: C.dim, fontFamily: F.mono }}>Atual</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 8, height: 4, borderRadius: 1, backgroundColor: C.accent + '30' }} />
            <Text style={{ fontSize: 7, color: C.dim, fontFamily: F.mono }}>Meta</Text>
          </View>
        </View>
      </View>
    </Glass>
  );
}

// ══════════════════════════════════════════════
// SECTION: POSITION CARD — expandível
// ══════════════════════════════════════════════
function PositionCard(props) {
  var pos = props.pos;
  var history = props.history;
  var totalCarteira = props.totalCarteira;
  var expanded = props.expanded;
  var onToggle = props.onToggle;
  var onBuy = props.onBuy;
  var onSell = props.onSell;
  var onLancarOpcao = props.onLancarOpcao;

  var color = PRODUCT_COLORS[pos.categoria] || C.accent;
  var catLabel = CAT_LABELS[pos.categoria] || (pos.categoria || '').toUpperCase();
  var hasPrice = pos.preco_atual != null;
  var precoRef = hasPrice ? pos.preco_atual : pos.pm;
  var valorAtual = pos.quantidade * precoRef;
  var custoTotal = pos.quantidade * pos.pm;
  var pnl = valorAtual - custoTotal;
  var pnlPct = custoTotal > 0 ? (pnl / custoTotal) * 100 : 0;
  var isPos = pnl >= 0;
  var pnlColor = isPos ? C.green : C.red;
  var sparkData = history || [];
  var pctCarteira = totalCarteira > 0 ? (valorAtual / totalCarteira) * 100 : 0;

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onToggle}>
      <Glass padding={12} style={expanded ? { borderColor: color + '30' } : {}}>
        {/* Row 1: dot + ticker + badges | P&L */}
        <View style={styles.cardRow1}>
          <View style={styles.cardRow1Left}>
            <View style={[styles.dot, { backgroundColor: color }]} />
            <Text style={styles.cardTicker}>{pos.ticker}</Text>
            <View style={[styles.typeBadge, { backgroundColor: color + '14' }]}>
              <Text style={[styles.typeBadgeText, { color: color }]}>{catLabel}</Text>
            </View>
            {pos.corretora ? <Text style={styles.cardCorretora}>{pos.corretora}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.cardPL, { color: pnlColor }]}>
              {isPos ? '+' : '-'}R$ {fmt(Math.abs(pnl))}
            </Text>
            <Text style={[styles.cardPLPct, { color: pnlColor }]}>
              {isPos ? '+' : ''}{pnlPct.toFixed(1)}%
            </Text>
          </View>
        </View>

        {/* Row 2: preço + PM + qty | sparkline */}
        <View style={styles.cardRow2}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={styles.cardPriceMain}>
                {hasPrice ? 'R$ ' + fmt(precoRef) : 'PM R$ ' + fmt(pos.pm)}
              </Text>
              {hasPrice ? <Text style={styles.cardPriceSub}>PM {pos.pm.toFixed(2)}</Text> : null}
              <Text style={styles.cardPriceSub}>Qtd: {pos.quantidade.toLocaleString('pt-BR')}</Text>
            </View>
            {hasPrice && pos.change_day != null && pos.change_day !== 0 ? (
              <Text style={[styles.cardDayVar, {
                color: pos.change_day > 0 ? C.green : C.red,
              }]}>
                {pos.change_day > 0 ? '▲' : '▼'} {Math.abs(pos.change_day).toFixed(2)}% dia
              </Text>
            ) : null}
          </View>
          {sparkData.length >= 2 ? (
            <View style={styles.sparkWrap}>
              <MiniLineChart data={sparkData} color={color} height={22} />
            </View>
          ) : null}
        </View>

        {/* EXPANDED */}
        {expanded ? (
          <View style={styles.expandedWrap}>
            <View style={styles.expandedStats}>
              {[
                { l: 'Custo total', v: 'R$ ' + custoTotal.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) },
                { l: 'Valor atual', v: 'R$ ' + valorAtual.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) },
                { l: '% Carteira', v: pctCarteira.toFixed(1) + '%' },
                { l: 'Corretora', v: pos.corretora || '–' },
              ].map(function (d, j) {
                return (
                  <View key={j} style={styles.expandedStatItem}>
                    <Text style={styles.expandedStatLabel}>{d.l}</Text>
                    <Text style={styles.expandedStatValue}>{d.v}</Text>
                  </View>
                );
              })}
            </View>
            <View style={styles.expandedActions}>
              <TouchableOpacity style={[styles.actionBtn, { borderColor: C.green + '30', backgroundColor: C.green + '08' }]}
                onPress={onBuy}>
                <Text style={[styles.actionBtnText, { color: C.green }]}>+ Comprar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, { borderColor: C.red + '30', backgroundColor: C.red + '08' }]}
                onPress={onSell}>
                <Text style={[styles.actionBtnText, { color: C.red }]}>Vender</Text>
              </TouchableOpacity>
              {pos.categoria === 'acao' ? (
                <TouchableOpacity style={[styles.actionBtn, { borderColor: C.opcoes + '30', backgroundColor: C.opcoes + '08' }]}
                  onPress={onLancarOpcao}>
                  <Text style={[styles.actionBtnText, { color: C.opcoes }]}>Lançar opção</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}
      </Glass>
    </TouchableOpacity>
  );
}

// ══════════════════════════════════════════════
// SECTION: RF CARD
// ══════════════════════════════════════════════
function RFCard(props) {
  var rf = props.rf;
  var expanded = props.expanded;
  var onToggle = props.onToggle;

  var valor = parseFloat(rf.valor_aplicado) || 0;
  var tipoLabel = TIPO_LABELS[rf.tipo] || rf.tipo;
  var idxColor = IDX_COLORS[(rf.indexador || '').toLowerCase()] || C.accent;
  var now = new Date();
  var daysLeft = Math.ceil((new Date(rf.vencimento) - now) / (1000 * 60 * 60 * 24));
  var dayColor = daysLeft < 30 ? C.red : daysLeft < 90 ? C.yellow : daysLeft < 365 ? C.etfs : C.rf;

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onToggle}>
      <Glass padding={12} style={expanded ? { borderColor: C.rf + '30' } : {}}>
        <View style={styles.cardRow1}>
          <View style={styles.cardRow1Left}>
            <View style={[styles.dot, { backgroundColor: C.rf }]} />
            <Text style={styles.cardTicker}>{tipoLabel}</Text>
            <View style={[styles.typeBadge, { backgroundColor: idxColor + '14' }]}>
              <Text style={[styles.typeBadgeText, { color: idxColor }]}>
                {(rf.indexador || 'PRE').toUpperCase()}
              </Text>
            </View>
          </View>
          <Text style={[styles.cardPL, { color: C.rf }]}>R$ {fmt(valor)}</Text>
        </View>
        <View style={styles.cardRow2}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={styles.cardPriceMain}>{formatTaxa(rf.taxa, rf.indexador)}</Text>
            {rf.corretora ? <Text style={styles.cardPriceSub}>{rf.corretora}</Text> : null}
          </View>
          <Badge text={daysLeft + 'd'} color={dayColor} />
        </View>
        {expanded ? (
          <View style={styles.expandedWrap}>
            <View style={styles.expandedStats}>
              {[
                { l: 'Valor aplicado', v: 'R$ ' + fmt(valor) },
                { l: 'Taxa', v: formatTaxa(rf.taxa, rf.indexador) },
                { l: 'Vencimento', v: new Date(rf.vencimento).toLocaleDateString('pt-BR') },
                { l: 'Corretora', v: rf.corretora || '–' },
              ].map(function (d, j) {
                return (
                  <View key={j} style={styles.expandedStatItem}>
                    <Text style={styles.expandedStatLabel}>{d.l}</Text>
                    <Text style={styles.expandedStatValue}>{d.v}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}
      </Glass>
    </TouchableOpacity>
  );
}

// ══════════════════════════════════════════════════════
// MAIN SCREEN
// ══════════════════════════════════════════════════════
export default function CarteiraScreen(props) {
  var navigation = props.navigation;
  var user = useAuth().user;

  var _pos = useState([]); var positions = _pos[0]; var setPositions = _pos[1];
  var _sal = useState([]); var saldos = _sal[0]; var setSaldos = _sal[1];
  var _fil = useState('todos'); var filter = _fil[0]; var setFilter = _fil[1];
  var _load = useState(true); var loading = _load[0]; var setLoading = _load[1];
  var _ref = useState(false); var refreshing = _ref[0]; var setRefreshing = _ref[1];
  var _rf = useState([]); var rfItems = _rf[0]; var setRfItems = _rf[1];
  var _pLoad = useState(false); var pricesLoading = _pLoad[0]; var setPricesLoading = _pLoad[1];
  var _hist = useState({}); var priceHistory = _hist[0]; var setPriceHistory = _hist[1];
  var _exp = useState(null); var expanded = _exp[0]; var setExpanded = _exp[1];

  var load = async function () {
    if (!user) return;
    var results = await Promise.all([
      getPositions(user.id),
      getSaldos(user.id),
      getRendaFixa(user.id),
    ]);
    var rawPos = results[0].data || [];
    setSaldos(results[1].data || []);
    setRfItems(results[2].data || []);
    setLoading(false);
    setPositions(rawPos);

    setPricesLoading(true);
    try {
      var tickers = rawPos.map(function (p) { return p.ticker; }).filter(Boolean);
      var enriched = await enrichPositionsWithPrices(rawPos);
      setPositions(enriched);
      if (tickers.length > 0) {
        var hist = await fetchPriceHistory(tickers);
        setPriceHistory(hist || {});
      }
    } catch (e) { console.warn('Price enrichment failed:', e.message); }
    setPricesLoading(false);
  };

  useFocusEffect(useCallback(function () { load(); }, [user]));

  var onRefresh = async function () {
    setRefreshing(true);
    clearPriceCache();
    await load();
    setRefreshing(false);
  };

  // ── DERIVED DATA ──
  var now = new Date();
  var rfAtivos = rfItems.filter(function (r) { return new Date(r.vencimento) > now; });

  // Filter
  var filteredPositions;
  if (filter === 'todos') filteredPositions = positions;
  else if (filter === 'rf') filteredPositions = [];
  else {
    var fd = FILTERS.find(function (f) { return f.k === filter; });
    filteredPositions = positions.filter(function (p) { return p.categoria === (fd ? fd.cat : ''); });
  }
  var showRF = filter === 'todos' || filter === 'rf';

  // Totals
  var totalPositions = positions.reduce(function (s, p) { return s + p.quantidade * (p.preco_atual || p.pm); }, 0);
  var totalRF = rfAtivos.reduce(function (s, r) { return s + (parseFloat(r.valor_aplicado) || 0); }, 0);
  var totalSaldos = saldos.reduce(function (s, c) { return s + (c.saldo || 0); }, 0);
  var totalValue = totalPositions + totalRF + totalSaldos;

  var totalCusto = positions.reduce(function (s, p) { return s + p.quantidade * p.pm; }, 0);
  var totalPL = totalPositions - totalCusto;
  var totalPLPct = totalCusto > 0 ? (totalPL / totalCusto) * 100 : 0;
  var isPosTotal = totalPL >= 0;

  // Allocation by class
  var allocMap = { acao: 0, fii: 0, etf: 0, rf: totalRF };
  positions.forEach(function (p) {
    var cat = p.categoria || '';
    if (allocMap[cat] !== undefined) allocMap[cat] += p.quantidade * (p.preco_atual || p.pm);
  });
  var allocTotal = Object.values(allocMap).reduce(function (s, v) { return s + v; }, 0);
  var allocSegments = Object.keys(allocMap).filter(function (k) { return allocMap[k] > 0; }).map(function (k) {
    return { label: CAT_NAMES[k] || k, pct: allocTotal > 0 ? (allocMap[k] / allocTotal) * 100 : 0,
      color: PRODUCT_COLORS[k] || C.accent, val: allocMap[k] };
  });

  // Per-asset data for treemap, bars
  var assetList = positions.map(function (p) {
    var val = p.quantidade * (p.preco_atual || p.pm);
    var custo = p.quantidade * p.pm;
    var pnlPct = custo > 0 ? ((val - custo) / custo) * 100 : 0;
    return { ticker: p.ticker, weight: val, pnlPct: pnlPct, color: PRODUCT_COLORS[p.categoria] || C.accent,
      categoria: p.categoria, pnl: val - custo };
  });

  // Sort by P&L% for rentabilidade bars
  var sortedByPnl = assetList.slice().sort(function (a, b) { return b.pnlPct - a.pnlPct; });
  var maxAbsPnl = sortedByPnl.reduce(function (m, a) { return Math.max(m, Math.abs(a.pnlPct)); }, 1);

  // P&L by class
  var pnlByClass = {};
  assetList.forEach(function (a) {
    var cat = a.categoria || 'outro';
    pnlByClass[cat] = (pnlByClass[cat] || 0) + a.pnl;
  });
  var pnlClassList = Object.keys(pnlByClass).map(function (k) {
    return { label: CAT_NAMES[k] || k, val: pnlByClass[k], color: PRODUCT_COLORS[k] || C.accent };
  });
  var maxAbsClassPnl = pnlClassList.reduce(function (m, c) { return Math.max(m, Math.abs(c.val)); }, 1);

  // Peso por ativo (% do total)
  var pesoList = assetList.slice().sort(function (a, b) { return b.weight - a.weight; }).map(function (a) {
    return { ticker: a.ticker, pct: allocTotal > 0 ? (a.weight / allocTotal) * 100 : 0, color: a.color };
  });

  // Benchmark comparison (simulated accrual from position start)
  // Build simple comparison: portfolio vs CDI vs Ibov
  var benchLines = [];
  if (positions.length > 0) {
    var numPoints = 12;
    var portLine = [];
    var cdiLine = [];
    var cdiMonthly = 0.95; // ~11.4% a.a. = 0.95% mês
    for (var bi = 0; bi < numPoints; bi++) {
      var portPct = (totalPLPct / numPoints) * (bi + 1); // Linear interpolation
      var cdiPct = cdiMonthly * (bi + 1);
      portLine.push(portPct);
      cdiLine.push(cdiPct);
    }
    benchLines = [
      { label: 'Carteira', data: portLine, color: C.accent },
      { label: 'CDI (' + (cdiMonthly * 12).toFixed(1) + '% a.a.)', data: cdiLine, color: C.etfs },
    ];
  }

  // Counts
  function countCat(catKey) {
    if (catKey === 'todos') return positions.length + rfAtivos.length;
    if (catKey === 'rf') return rfAtivos.length;
    var fdef = FILTERS.find(function (f) { return f.k === catKey; });
    return positions.filter(function (p) { return p.categoria === (fdef ? fdef.cat : ''); }).length;
  }

  function toggleExpand(key) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(expanded === key ? null : key);
  }

  if (loading) return <View style={styles.container}><LoadingScreen /></View>;
  if (positions.length === 0 && rfAtivos.length === 0 && saldos.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState icon="◫" title="Carteira vazia"
          description="Nenhum ativo na carteira. Registre compras de ações, FIIs, ETFs ou renda fixa."
          cta="Adicionar ativo" onCta={function () { navigation.navigate('AddOperacao'); }} color={C.acoes} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}>

      {/* ══════ 1. HERO ══════ */}
      <Glass glow={C.acoes} padding={16}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Text style={styles.heroLabel}>PATRIMÔNIO EM CARTEIRA</Text>
            <Text style={styles.heroValue}>R$ {fmt(totalValue)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.heroLabel}>P&L TOTAL</Text>
            <Text style={[styles.heroPL, { color: isPosTotal ? C.green : C.red }]}>
              {isPosTotal ? '+' : '-'}R$ {fmt(Math.abs(totalPL))}
            </Text>
            <Text style={[styles.heroPLSub, { color: isPosTotal ? C.green : C.red }]}>
              {isPosTotal ? '▲' : '▼'} {Math.abs(totalPLPct).toFixed(1)}% geral
            </Text>
          </View>
        </View>
        <View style={styles.heroStats}>
          {[
            { l: 'ATIVOS', v: String(positions.length + rfAtivos.length), c: C.accent },
            { l: 'CLASSES', v: String(allocSegments.length), c: C.accent },
            { l: 'CORRETORAS', v: String(saldos.length || 1), c: C.accent },
          ].map(function (m, i) {
            return (
              <View key={i} style={{ alignItems: 'center', flex: 1 }}>
                <Text style={styles.heroStatLabel}>{m.l}</Text>
                <Text style={[styles.heroStatVal, { color: m.c }]}>{m.v}</Text>
              </View>
            );
          })}
        </View>
        {pricesLoading ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <ActivityIndicator size="small" color={C.accent} />
            <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>Atualizando cotacoes...</Text>
          </View>
        ) : getLastPriceUpdate() ? (
          <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, marginTop: 6, textAlign: 'right' }}>
            {'Cotacoes de ' + new Date(getLastPriceUpdate()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        ) : null}
      </Glass>

      {/* ══════ 2. ALOCAÇÃO POR CLASSE — Donut ══════ */}
      {allocSegments.length > 0 ? (
        <Glass padding={14}>
          <Text style={styles.sectionTitle2}>ALOCAÇÃO POR CLASSE</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ position: 'relative', width: 110, height: 110 }}>
              <DonutChart segments={allocSegments} size={110} />
              <View style={styles.donutCenter}>
                <Text style={{ fontSize: 7, color: C.dim, fontFamily: F.mono }}>TOTAL</Text>
                <Text style={{ fontSize: 14, fontWeight: '800', color: C.text, fontFamily: F.display }}>{allocSegments.length}</Text>
                <Text style={{ fontSize: 7, color: C.dim, fontFamily: F.mono }}>classes</Text>
              </View>
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              {allocSegments.map(function (s, i) {
                return (
                  <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: s.color }} />
                      <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.body }}>{s.label}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: C.text, fontFamily: F.mono }}>{s.pct.toFixed(1)}%</Text>
                      <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>{fmtK(s.val)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        </Glass>
      ) : null}

      {/* ══════ 3. PESO POR ATIVO — barras % ══════ */}
      {pesoList.length > 0 ? (
        <Glass padding={14}>
          <Text style={styles.sectionTitle2}>PESO POR ATIVO</Text>
          {pesoList.map(function (a, i) {
            return <HBar key={i} label={a.ticker} value={a.pct} maxValue={pesoList[0].pct} color={a.color} suffix="%" />;
          })}
        </Glass>
      ) : null}

      {/* ══════ 4. TREEMAP — exposição visual ══════ */}
      {assetList.length > 0 ? (
        <Glass padding={14}>
          <Text style={styles.sectionTitle2}>TREEMAP — EXPOSIÇÃO</Text>
          <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono, marginBottom: 8 }}>
            Tamanho = peso na carteira · Cor = performance
          </Text>
          <Treemap items={assetList} height={130} />
        </Glass>
      ) : null}

      {/* ══════ 5. RENTABILIDADE POR ATIVO — barras P&L% ══════ */}
      {sortedByPnl.length > 0 ? (
        <Glass padding={14}>
          <Text style={styles.sectionTitle2}>RENTABILIDADE POR ATIVO</Text>
          {sortedByPnl.map(function (a, i) {
            return <HBar key={i} label={a.ticker} value={a.pnlPct} maxValue={maxAbsPnl}
              color={a.pnlPct >= 0 ? C.green : C.red} suffix="%" />;
          })}
        </Glass>
      ) : null}

      {/* ══════ 6. P&L POR CLASSE — contribuição ══════ */}
      {pnlClassList.length > 0 ? (
        <Glass padding={14}>
          <Text style={styles.sectionTitle2}>P&L POR CLASSE</Text>
          {pnlClassList.map(function (c, i) {
            var isPos = c.val >= 0;
            return (
              <View key={i} style={styles.hbarRow}>
                <Text style={styles.hbarLabel}>{c.label}</Text>
                <View style={styles.hbarTrack}>
                  <View style={[styles.hbarFill, {
                    width: clamp(Math.abs(c.val) / maxAbsClassPnl * 100, 2, 100) + '%',
                    backgroundColor: (isPos ? C.green : C.red) + '40',
                    borderColor: (isPos ? C.green : C.red) + '80',
                  }]} />
                </View>
                <Text style={[styles.hbarValue, { color: isPos ? C.green : C.red }]}>
                  {isPos ? '+' : '-'}R$ {Math.abs(c.val).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                </Text>
              </View>
            );
          })}
        </Glass>
      ) : null}

      {/* ══════ 7. BENCHMARK — comparativo ══════ */}
      {benchLines.length > 0 ? (
        <Glass padding={14}>
          <Text style={styles.sectionTitle2}>VS BENCHMARK</Text>
          <BenchmarkChart lines={benchLines} height={70} />
        </Glass>
      ) : null}

      {/* ══════ 8. REBALANCEAMENTO ══════ */}
      {allocSegments.length > 0 ? (
        <RebalanceTool allocAtual={allocMap} totalCarteira={allocTotal} />
      ) : null}

      {/* ══════ 9. FILTER PILLS ══════ */}
      <SectionLabel>POSIÇÕES</SectionLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, paddingBottom: 2 }}>
        {FILTERS.map(function (f) {
          return (
            <Pill key={f.k} active={filter === f.k} color={f.color}
              onPress={function () { setFilter(f.k); }}>
              {f.l} ({countCat(f.k)})
            </Pill>
          );
        })}
      </ScrollView>

      {/* ══════ 10. POSITION CARDS ══════ */}
      {filteredPositions.map(function (pos, i) {
        var key = 'pos_' + pos.ticker + '_' + i;
        return (
          <PositionCard key={key} pos={pos} history={priceHistory[pos.ticker] || null}
            totalCarteira={totalValue} expanded={expanded === key}
            onToggle={function () { toggleExpand(key); }}
            onBuy={function () { navigation.navigate('AddOperacao', { ticker: pos.ticker, tipo: 'compra', categoria: pos.categoria }); }}
            onSell={function () { navigation.navigate('AddOperacao', { ticker: pos.ticker, tipo: 'venda', categoria: pos.categoria }); }}
            onLancarOpcao={function () { navigation.navigate('AddOpcao', { ativo_base: pos.ticker }); }} />
        );
      })}

      {/* ══════ 11. RF CARDS ══════ */}
      {showRF && rfAtivos.length > 0 ? (
        <View>
          {filter === 'todos' ? <SectionLabel>RENDA FIXA</SectionLabel> : null}
          {rfAtivos.map(function (rf, i) {
            var key = 'rf_' + (rf.id || i);
            return (
              <View key={key} style={{ marginTop: i > 0 ? 6 : 0 }}>
                <RFCard rf={rf} expanded={expanded === key}
                  onToggle={function () { toggleExpand(key); }} />
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Empty states */}
      {filter === 'rf' && rfAtivos.length === 0 ? (
        <EmptyState icon="◉" title="Nenhum título"
          description="Cadastre seus investimentos de renda fixa."
          cta="Novo título" onCta={function () { navigation.navigate('AddRendaFixa'); }} color={C.rf} />
      ) : null}
      {filter !== 'todos' && filter !== 'rf' && filteredPositions.length === 0 ? (
        <Glass padding={20}>
          <Text style={{ fontSize: 14, color: C.sub, fontFamily: F.body, textAlign: 'center' }}>
            Nenhum ativo de {(FILTERS.find(function (f) { return f.k === filter; }) || {}).l || filter}
          </Text>
        </Glass>
      ) : null}

      {/* ══════ 12. SALDOS ══════ */}
      {saldos.length > 0 && filter === 'todos' ? (
        <View>
          <SectionLabel>SALDO EM CONTA</SectionLabel>
          {saldos.map(function (s, i) {
            var bc = [C.opcoes, C.acoes, C.fiis, C.etfs, C.rf, C.accent][i % 6];
            return (
              <View key={i} style={{ marginTop: i > 0 ? 6 : 0 }}>
                <Glass padding={12}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={[styles.brokerIcon, { backgroundColor: bc + '12', borderColor: bc + '22' }]}>
                        <Text style={[styles.brokerIconText, { color: bc }]}>
                          {(s.name || 'COR').substring(0, 2).toUpperCase()}
                        </Text>
                      </View>
                      <Text style={styles.saldoName}>{s.name}</Text>
                    </View>
                    <Text style={[styles.saldoValue, { color: bc }]}>R$ {fmt(s.saldo || 0)}</Text>
                  </View>
                </Glass>
              </View>
            );
          })}
        </View>
      ) : null}

      <View style={{ height: SIZE.tabBarHeight + 20 }} />
    </ScrollView>
  );
}

// ══════════ STYLES ══════════
var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 18, gap: SIZE.gap },

  // Hero
  heroLabel: { fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.6 },
  heroValue: { fontSize: 24, fontWeight: '800', color: C.text, fontFamily: F.display, marginTop: 2, letterSpacing: -0.5 },
  heroPL: { fontSize: 18, fontWeight: '700', fontFamily: F.mono, marginTop: 2 },
  heroPLSub: { fontSize: 9, fontFamily: F.mono, marginTop: 1 },
  heroStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border },
  heroStatLabel: { fontSize: 7, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 },
  heroStatVal: { fontSize: 11, fontWeight: '700', fontFamily: F.mono, marginTop: 1 },

  // Section
  sectionTitle2: { fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.6, marginBottom: 10 },

  // Donut center
  donutCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },

  // HBar
  hbarRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  hbarLabel: { width: 60, fontSize: 10, color: C.sub, fontWeight: '600', fontFamily: F.mono },
  hbarTrack: { flex: 1, height: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.03)' },
  hbarFill: { height: 12, borderRadius: 6, borderWidth: 1, minWidth: 4 },
  hbarValue: { width: 55, fontSize: 10, fontWeight: '700', fontFamily: F.mono, textAlign: 'right' },

  // Rebalance
  rebalHeader: { flexDirection: 'row', alignItems: 'center', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.border, marginBottom: 6 },
  rebalColLabel: { flex: 1, fontSize: 8, color: C.dim, fontFamily: F.mono, textAlign: 'center' },
  rebalRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  rebalInput: { width: 36, height: 22, borderRadius: 4, borderWidth: 1, borderColor: C.accent + '40',
    backgroundColor: C.accent + '08', color: C.accent, fontSize: 11, fontFamily: F.mono,
    textAlign: 'center', paddingVertical: 0, paddingHorizontal: 4 },

  // Cards
  cardRow1: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardRow1Left: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  cardRow2: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  cardTicker: { fontSize: 14, fontWeight: '700', color: C.text, fontFamily: F.display },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  typeBadgeText: { fontSize: 8, fontWeight: '600', fontFamily: F.mono },
  cardCorretora: { fontSize: 7, color: C.dim, fontFamily: F.mono },
  cardPL: { fontSize: 13, fontWeight: '700', fontFamily: F.mono },
  cardPLPct: { fontSize: 9, fontFamily: F.mono, marginTop: 1 },
  cardPriceMain: { fontSize: 11, color: C.text, fontWeight: '600', fontFamily: F.mono },
  cardPriceSub: { fontSize: 9, color: C.dim, fontFamily: F.mono },
  cardDayVar: { fontSize: 9, fontWeight: '600', fontFamily: F.mono, marginTop: 2 },
  sparkWrap: { width: '32%', flexShrink: 0 },

  // Expanded
  expandedWrap: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border },
  expandedStats: { flexDirection: 'row', justifyContent: 'space-between' },
  expandedStatItem: { alignItems: 'center', flex: 1 },
  expandedStatLabel: { fontSize: 7, color: C.dim, fontFamily: F.mono, letterSpacing: 0.3 },
  expandedStatValue: { fontSize: 10, color: C.sub, fontWeight: '600', fontFamily: F.mono, marginTop: 2 },
  expandedActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  actionBtnText: { fontSize: 11, fontWeight: '600', fontFamily: F.body },

  // Broker/Saldos
  brokerIcon: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  brokerIconText: { fontSize: 8, fontWeight: '700', fontFamily: F.mono },
  saldoName: { fontSize: 13, fontWeight: '600', color: C.text, fontFamily: F.display },
  saldoValue: { fontSize: 14, fontWeight: '700', fontFamily: F.mono },
});
