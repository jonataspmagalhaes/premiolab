import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, ActivityIndicator,
  Alert, TextInput, Modal, Dimensions,
} from 'react-native';
import { animateLayout } from '../../utils/a11y';
var dateUtils = require('../../utils/dateUtils');
var parseLocalDate = dateUtils.parseLocalDate;
var formatDateBR = dateUtils.formatDateBR;
import Svg, {
  Circle as SvgCircle, Path, Defs, LinearGradient as SvgGrad, ClipPath,
  Stop, Line as SvgLine, Rect as SvgRect, G, Text as SvgText,
} from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { C, F, SIZE, PRODUCT_COLORS } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getPositions, getSaldos, getRendaFixa, deleteRendaFixa, getOpcoes, getIndicatorByTicker, addSavedAnalysis, getPatrimonioSnapshots, getProfile, getRebalanceTargets, upsertRebalanceTargets } from '../../services/database';
import { fetchFundamentals } from '../../services/fundamentalService';
import { enrichPositionsWithPrices, fetchPriceHistory, fetchHistoryRouted, fetchPriceHistoryLong, fetchPriceHistoryRange, clearPriceCache, getLastPriceUpdate } from '../../services/priceService';
import { fetchExchangeRates, convertToBRL, getSymbol } from '../../services/currencyService';
import { Glass, Badge, Pill, SectionLabel, InfoTip, PressableCard, FundamentalAccordion, Fab, UpgradePrompt, AiAnalysisModal, AiConfirmModal } from '../../components';
import InteractiveChart, { MiniLineChart } from '../../components/InteractiveChart';
import Toast from 'react-native-toast-message';
import { SkeletonCarteira, EmptyState } from '../../components/States';
import { usePrivacyStyle } from '../../components/Sensitive';
import { useSubscription } from '../../contexts/SubscriptionContext';
var geminiService = require('../../services/geminiService');

// ══════════ HELPERS ══════════
var FILTERS = [
  { k: 'todos', l: 'Todos', color: C.accent },
  { k: 'acoes', l: 'Ações', cat: 'acao', color: C.acoes },
  { k: 'fiis', l: 'FIIs', cat: 'fii', color: C.fiis },
  { k: 'etfs', l: 'ETFs', cat: 'etf', color: C.etfs },
  { k: 'stocks_int', l: 'Stocks', cat: 'stock_int', color: C.stock_int },
  { k: 'rf', l: 'RF', color: C.rf },
];
var CAT_LABELS = { acao: 'Ação', fii: 'FII', etf: 'ETF', opcao: 'Opção', stock_int: 'Stock' };
var CAT_NAMES = { acao: 'Ações', fii: 'FIIs', etf: 'ETFs', stock_int: 'Stocks', rf: 'RF' };
var TIPO_LABELS = {
  cdb: 'CDB', lci_lca: 'LCI/LCA', tesouro_selic: 'Tesouro Selic',
  tesouro_ipca: 'Tesouro IPCA+', tesouro_pre: 'Tesouro Pré', debenture: 'Debênture',
};
var IDX_COLORS = { prefixado: C.green, cdi: C.accent, ipca: C.fiis, selic: C.opcoes };

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtK(v) {
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
var MONTH_LABELS = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function computeWeeklyReturns(history) {
  if (!history || history.length < 2) return [];
  var weeks = {};
  for (var i = 0; i < history.length; i++) {
    var pt = history[i];
    if (!pt || !pt.date) continue;
    var d = new Date(pt.date + 'T12:00:00');
    var jan1 = new Date(d.getFullYear(), 0, 1);
    var dayOfYear = Math.floor((d - jan1) / 86400000) + 1;
    var weekNum = Math.ceil(dayOfYear / 7);
    var key = d.getFullYear() + '-W' + (weekNum < 10 ? '0' : '') + weekNum;
    if (!weeks[key]) weeks[key] = { first: pt.value, last: pt.value, lastDate: pt.date };
    weeks[key].last = pt.value;
    weeks[key].lastDate = pt.date;
  }
  var keys = Object.keys(weeks).sort();
  var returns = [];
  for (var j = 1; j < keys.length; j++) {
    var prev = weeks[keys[j - 1]].last;
    var curr = weeks[keys[j]].last;
    var ret = prev > 0 ? ((curr - prev) / prev) * 100 : 0;
    returns.push({ week: keys[j], date: weeks[keys[j]].lastDate, pct: ret });
  }
  return returns;
}

// ══════════════════════════════════════════════
// SECTION: SQUARIFIED TREEMAP
// ══════════════════════════════════════════════

function squarify(items, x, y, w, h) {
  if (items.length === 0) return [];
  if (items.length === 1) {
    return [{ x: x, y: y, w: w, h: h, item: items[0] }];
  }

  var total = items.reduce(function (s, it) { return s + it.normWeight; }, 0);
  if (total <= 0) return [];

  var sorted = items.slice().sort(function (a, b) { return b.normWeight - a.normWeight; });

  var isHoriz = w >= h;
  var mainSize = isHoriz ? w : h;
  var crossSize = isHoriz ? h : w;

  var bestRatio = Infinity;
  var bestSplit = 1;

  for (var i = 1; i <= sorted.length; i++) {
    var rowSum = 0;
    for (var j = 0; j < i; j++) rowSum += sorted[j].normWeight;
    var rowFrac = rowSum / total;
    var rowPixels = rowFrac * mainSize;
    if (rowPixels <= 0) continue;

    var worstRatio = 0;
    for (var k = 0; k < i; k++) {
      var itemFrac = sorted[k].normWeight / rowSum;
      var itemCross = itemFrac * crossSize;
      var ratio = Math.max(rowPixels / itemCross, itemCross / rowPixels);
      if (ratio > worstRatio) worstRatio = ratio;
    }
    if (worstRatio <= bestRatio) {
      bestRatio = worstRatio;
      bestSplit = i;
    } else {
      break;
    }
  }

  var rowItems = sorted.slice(0, bestSplit);
  var restItems = sorted.slice(bestSplit);

  var rowSum2 = 0;
  for (var ri = 0; ri < rowItems.length; ri++) rowSum2 += rowItems[ri].normWeight;
  var rowFrac2 = rowSum2 / total;
  var rowPixels2 = rowFrac2 * mainSize;

  var rects = [];
  var crossOffset = 0;
  for (var qi = 0; qi < rowItems.length; qi++) {
    var itemFrac2 = rowItems[qi].normWeight / rowSum2;
    var itemCross2 = itemFrac2 * crossSize;
    if (isHoriz) {
      rects.push({ x: x, y: y + crossOffset, w: rowPixels2, h: itemCross2, item: rowItems[qi] });
    } else {
      rects.push({ x: x + crossOffset, y: y, w: itemCross2, h: rowPixels2, item: rowItems[qi] });
    }
    crossOffset += itemCross2;
  }

  if (restItems.length > 0) {
    var restRects;
    if (isHoriz) {
      restRects = squarify(restItems, x + rowPixels2, y, w - rowPixels2, h);
    } else {
      restRects = squarify(restItems, x, y + rowPixels2, w, h - rowPixels2);
    }
    for (var rri = 0; rri < restRects.length; rri++) rects.push(restRects[rri]);
  }

  return rects;
}

function TreemapChart(props) {
  var items = props.items || [];
  var _w = useState(0);
  var width = _w[0]; var setWidth = _w[1];
  var height = props.height || 140;
  var onPressTile = props.onPressTile;

  if (items.length === 0 || width === 0) {
    return <View onLayout={function (e) { setWidth(e.nativeEvent.layout.width); }} style={{ height: height }} />;
  }

  var total = items.reduce(function (s, it) { return s + Math.abs(it.weight); }, 0);
  if (total === 0) return <View style={{ height: height }} />;

  var normalized = items.map(function (it) {
    var copy = {};
    Object.keys(it).forEach(function (k) { copy[k] = it[k]; });
    copy.normWeight = Math.abs(it.weight) / total;
    return copy;
  });

  var rects = squarify(normalized, 0, 0, width, height);

  return (
    <View onLayout={function (e) { setWidth(e.nativeEvent.layout.width); }}>
      <Svg width={width} height={height}>
        <Defs>
          {rects.map(function (r, i) {
            return (
              <ClipPath key={'cp-' + i} id={'tc-' + i}>
                <SvgRect x={r.x + 1} y={r.y + 1} width={Math.max(r.w - 2, 1)} height={Math.max(r.h - 2, 1)} rx={4} />
              </ClipPath>
            );
          })}
        </Defs>
        {rects.map(function (r, i) {
          var changeDay = r.item.change_day || 0;
          var intensity = clamp(Math.abs(changeDay) / 5, 0.2, 0.7);
          var fill = changeDay >= 0 ? C.green : C.red;
          var showLabel = r.w > 36 && r.h > 26;
          var showPct = r.w > 26 && r.h > 18;
          var pctStr = r.w > 58 ? ((changeDay >= 0 ? '+' : '') + changeDay.toFixed(1) + '%') : (Math.abs(changeDay).toFixed(changeDay >= 10 || changeDay <= -10 ? 0 : 1) + '%');
          var pctSize = r.w > 58 ? 10 : 9;
          return (
            <G key={i}>
              <SvgRect x={r.x + 1} y={r.y + 1} width={Math.max(r.w - 2, 1)} height={Math.max(r.h - 2, 1)}
                rx={4} fill={fill} opacity={intensity} />
              <G clipPath={'url(#tc-' + i + ')'}>
                {showLabel ? (
                  <G>
                    <SvgText x={r.x + r.w / 2} y={r.y + r.h / 2 - 5} fill="#000" fontSize="11"
                      fontWeight="800" textAnchor="middle" opacity="0.4">
                      {r.item.ticker}
                    </SvgText>
                    <SvgText x={r.x + r.w / 2} y={r.y + r.h / 2 - 5} fill="#fff" fontSize="11"
                      fontWeight="800" textAnchor="middle">
                      {r.item.ticker}
                    </SvgText>
                    <SvgText x={r.x + r.w / 2} y={r.y + r.h / 2 + 10} fill="#000" fontSize={pctSize}
                      fontWeight="700" textAnchor="middle" opacity="0.4">
                      {pctStr}
                    </SvgText>
                    <SvgText x={r.x + r.w / 2} y={r.y + r.h / 2 + 10} fill="#fff" fontSize={pctSize}
                      fontWeight="700" textAnchor="middle">
                      {pctStr}
                    </SvgText>
                  </G>
                ) : showPct ? (
                  <G>
                    <SvgText x={r.x + r.w / 2} y={r.y + r.h / 2 + 3} fill="#000" fontSize="9"
                      fontWeight="700" textAnchor="middle" opacity="0.4">
                      {r.item.ticker}
                    </SvgText>
                    <SvgText x={r.x + r.w / 2} y={r.y + r.h / 2 + 3} fill="#fff" fontSize="9"
                      fontWeight="700" textAnchor="middle">
                      {r.item.ticker}
                    </SvgText>
                  </G>
                ) : null}
              </G>
              {onPressTile ? (
                <SvgRect x={r.x} y={r.y} width={r.w} height={r.h}
                  fill="transparent" onPress={function () { onPressTile(r.item); }} />
              ) : null}
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

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
  var ps = usePrivacyStyle();

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
      <Text style={[styles.hbarValue, { color: isNeg ? C.red : color }, ps]}>
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
  var ps = usePrivacyStyle();

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
              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>{line.label}</Text>
              <Text style={[{ fontSize: 10, color: line.color, fontWeight: '600', fontFamily: F.mono }, ps]}>
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
// SECTION: POSITION CARD — expandível
// ══════════════════════════════════════════════
var PositionCard = React.memo(function PositionCard(props) {
  var pos = props.pos;
  var history = props.history;
  var totalCarteira = props.totalCarteira;
  var expanded = props.expanded;
  var onToggle = props.onToggle;
  var onBuy = props.onBuy;
  var onSell = props.onSell;
  var onLancarOpcao = props.onLancarOpcao;
  var onTransacoes = props.onTransacoes;
  var fundData = props.fundamentals;
  var fundLoading = props.fundLoading;
  var opcoesForTicker = props.opcoesForTicker;
  var indicatorData = props.indicator;
  var canAccessFund = props.canAccessFund;
  var onAiAnalysis = props.onAiAnalysis;
  var portfoliosList = props.portfoliosList || [];
  var showPortfolioBadge = props.showPortfolioBadge;
  var tickerMeta = props.tickerMeta;
  var onSetMeta = props.onSetMeta;
  var totalPortfolio = props.totalPortfolio || 0;
  var tickerValorTotal = props.tickerValorTotal;
  var ps = usePrivacyStyle();
  var _metaEditing = useState(false); var metaEditing = _metaEditing[0]; var setMetaEditing = _metaEditing[1];
  var _metaInput = useState(''); var metaInput = _metaInput[0]; var setMetaInput = _metaInput[1];

  var color = PRODUCT_COLORS[pos.categoria] || C.accent;
  var catLabel = CAT_LABELS[pos.categoria] || (pos.categoria || '').toUpperCase();
  var posIsInt = pos.mercado === 'INT';
  var posSymbol = posIsInt ? 'US$' : 'R$';
  var hasPrice = pos.preco_atual != null;
  // taxa de cambio: enrichment (atual) > media historica das operacoes > 1
  var fxRate = pos.taxa_cambio || pos.taxa_cambio_media || 1;
  // Para INT: preco_atual ja esta em BRL (enrichPositionsWithPrices converte)
  var precoRef = hasPrice ? pos.preco_atual : (posIsInt && pos.pm ? pos.pm * fxRate : pos.pm);
  var valorAtual = pos.quantidade * precoRef;
  var custoTotal = posIsInt ? pos.quantidade * pos.pm * fxRate : pos.quantidade * pos.pm;
  var pnl = valorAtual - custoTotal;
  var pnlPct = custoTotal > 0 ? (pnl / custoTotal) * 100 : 0;
  var isPos = pnl >= 0;
  var pnlColor = isPos ? C.green : C.red;
  var plReal = pos.pl_realizado || 0;
  var temVendas = pos.total_vendido > 0;
  var sparkData = history || [];
  var pctCarteira = totalCarteira > 0 ? (valorAtual / totalCarteira) * 100 : 0;

  var corretorasText = '';
  if (pos.por_corretora) {
    var cKeys = Object.keys(pos.por_corretora);
    var cParts = [];
    for (var ck = 0; ck < cKeys.length; ck++) {
      if (pos.por_corretora[cKeys[ck]] > 0) {
        cParts.push(cKeys[ck] + ' (' + pos.por_corretora[cKeys[ck]] + ')');
      }
    }
    corretorasText = cParts.join(', ');
  }

  // Accordion state for DESEMPENHO section
  var _sections = useState({});
  var sections = _sections[0];
  var setSections = _sections[1];

  // Chart state for expanded card
  var _chartData = useState(null);
  var chartData = _chartData[0];
  var setChartData = _chartData[1];
  var _chartPeriod = useState('3mo');
  var chartPeriod = _chartPeriod[0];
  var setChartPeriod = _chartPeriod[1];
  var _chartLoading = useState(false);
  var chartLoading = _chartLoading[0];
  var setChartLoading = _chartLoading[1];

  function toggleSection(sKey) {
    animateLayout();
    var next = {};
    var ks = Object.keys(sections);
    for (var si = 0; si < ks.length; si++) { next[ks[si]] = sections[ks[si]]; }
    next[sKey] = !next[sKey];
    setSections(next);
    if (sKey === 'grafico' && next[sKey] && !chartData && !chartLoading) {
      loadChart(chartPeriod);
    }
  }

  function loadChart(period) {
    setChartLoading(true);
    fetchPriceHistoryRange([pos.ticker], period).then(function(result) {
      var ohlcv = result && result[pos.ticker] ? result[pos.ticker] : [];
      var pts = [];
      for (var ci = 0; ci < ohlcv.length; ci++) {
        if (ohlcv[ci] && ohlcv[ci].close != null && ohlcv[ci].date) {
          pts.push({ value: ohlcv[ci].close, date: ohlcv[ci].date });
        }
      }
      setChartData(pts);
      setChartLoading(false);
    }).catch(function() {
      setChartLoading(false);
    });
  }

  function handleChartPeriod(p) {
    setChartPeriod(p);
    setChartData(null);
    loadChart(p);
  }

  function renderDesempenhoMetric(label, value, metricColor) {
    return (
      <View key={label} style={{ width: '48%', marginBottom: 8 }}>
        <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>{label}</Text>
        <Text style={[{ fontSize: 12, color: metricColor || C.text, fontFamily: F.mono, fontWeight: '600', marginTop: 1 }, ps]}>{value}</Text>
      </View>
    );
  }

  return (
    <PressableCard onPress={onToggle} accessibilityLabel={pos.ticker + ', PM ' + posSymbol + ' ' + fmt(pos.pm) + ', Qtd ' + pos.quantidade} accessibilityHint={expanded ? 'Toque para recolher' : 'Toque para expandir'}>
      <Glass padding={12} style={expanded
        ? { borderColor: color + '30', borderLeftWidth: 3, borderLeftColor: pnlColor }
        : { borderLeftWidth: 3, borderLeftColor: pnlColor }}>
        {/* Row 1: dot + ticker + badges | preço atual + dia % */}
        <View style={styles.cardRow1}>
          <View style={styles.cardRow1Left}>
            <View style={[styles.dot, { backgroundColor: color }]} />
            <Text style={styles.cardTicker}>{pos.ticker}</Text>
            <View style={[styles.typeBadge, { backgroundColor: color + '14' }]}>
              <Text style={[styles.typeBadgeText, { color: color }]}>{catLabel}</Text>
            </View>
            {pos.mercado === 'INT' ? (
              <View style={[styles.typeBadge, { backgroundColor: C.stock_int + '14' }]}>
                <Text style={[styles.typeBadgeText, { color: C.stock_int }]}>INT</Text>
              </View>
            ) : pos.categoria === 'etf' ? (
              <View style={[styles.typeBadge, { backgroundColor: C.etfs + '14' }]}>
                <Text style={[styles.typeBadgeText, { color: C.etfs }]}>BR</Text>
              </View>
            ) : null}
            {onAiAnalysis ? (
              <TouchableOpacity onPress={onAiAnalysis} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ marginLeft: 4 }} accessibilityRole="button" accessibilityLabel={'Análise IA de ' + pos.ticker}>
                <Ionicons name="sparkles" size={14} color={C.accent} />
              </TouchableOpacity>
            ) : null}
            {showPortfolioBadge && pos.portfolio_ids && pos.portfolio_ids.length > 0 ? (
              pos.portfolio_ids.map(function(pid) {
                var pfName = 'Padrão';
                var pfColor = C.accent;
                if (pid) {
                  for (var pfi = 0; pfi < portfoliosList.length; pfi++) {
                    if (portfoliosList[pfi].id === pid) {
                      pfName = portfoliosList[pfi].nome;
                      pfColor = portfoliosList[pfi].cor || C.accent;
                      break;
                    }
                  }
                }
                return (
                  <View key={pid || 'default'} style={[styles.typeBadge, { backgroundColor: pfColor + '14', marginLeft: 2 }]}>
                    <Text style={[styles.typeBadgeText, { color: pfColor }]}>{pfName}</Text>
                  </View>
                );
              })
            ) : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.cardPriceMain, ps]}>
              {hasPrice ? (posIsInt && pos.preco_atual_usd != null ? 'US$ ' + fmt(pos.preco_atual_usd) : 'R$ ' + fmt(precoRef)) : '–'}
            </Text>
            {hasPrice && pos.change_day != null && pos.change_day !== 0 ? (
              <View style={[styles.typeBadge, { backgroundColor: (pos.change_day > 0 ? C.green : C.red) + '14', marginTop: 2 }]}>
                <Text style={[styles.typeBadgeText, { color: pos.change_day > 0 ? C.green : C.red }, ps]}>
                  {pos.change_day > 0 ? '▲' : '▼'} {Math.abs(pos.change_day).toFixed(2) + '%'}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Row 2: PM + Qty proeminentes | sparkline */}
        <View style={styles.cardRow2}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <View>
              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>PM</Text>
              <Text style={[{ fontSize: 14, fontWeight: '700', color: C.text, fontFamily: F.mono }, ps]}>
                {posSymbol + ' ' + fmt(pos.pm)}
              </Text>
            </View>
            <View>
              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>QTD</Text>
              <Text style={[{ fontSize: 14, fontWeight: '700', color: C.text, fontFamily: F.mono }, ps]}>
                {pos.quantidade.toLocaleString('pt-BR')}
              </Text>
            </View>
          </View>
          {sparkData.length >= 2 ? (
            <View style={styles.sparkWrap}>
              <MiniLineChart data={sparkData} color={color} height={22} />
            </View>
          ) : null}
        </View>

        {/* Row 3: Valor total + P&L */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: C.border + '30' }}>
          <View>
            <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>TOTAL</Text>
            <Text style={[{ fontSize: 14, fontWeight: '700', color: C.text, fontFamily: F.mono }, ps]}>
              {'R$ ' + fmt(valorAtual)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>P&L</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={[{ fontSize: 14, fontWeight: '700', color: pnlColor, fontFamily: F.mono }, ps]}>
                {(isPos ? '+' : '') + 'R$ ' + fmt(Math.abs(pnl))}
              </Text>
              <View style={[styles.typeBadge, { backgroundColor: pnlColor + '14' }]}>
                <Text style={[styles.typeBadgeText, { color: pnlColor }, ps]}>
                  {(isPos ? '+' : '') + pnlPct.toFixed(1) + '%'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* EXPANDED */}
        {expanded ? (
          <View style={styles.expandedWrap}>
            {/* ▶ DESEMPENHO accordion */}
            <View>
              <TouchableOpacity onPress={function() { toggleSection('desempenho'); }}
                activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingVertical: 8, paddingHorizontal: 2 }}
                accessibilityRole="button"
                accessibilityLabel={(sections['desempenho'] ? 'Recolher ' : 'Expandir ') + 'Desempenho'}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name={sections['desempenho'] ? 'chevron-down' : 'chevron-forward'} size={14} color={C.accent} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: C.accent, fontFamily: F.display }}>DESEMPENHO</Text>
                </View>
                <Text style={[{ fontSize: 12, fontWeight: '700', color: pnlColor, fontFamily: F.mono }, ps]}>
                  {isPos ? '+' : ''}R$ {fmt(pnl)}
                </Text>
              </TouchableOpacity>
              {sections['desempenho'] ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 2, paddingTop: 4, paddingBottom: 4 }}>
                  {renderDesempenhoMetric('P&L Aberto', (isPos ? '+' : '') + 'R$ ' + fmt(pnl), pnlColor)}
                  {renderDesempenhoMetric('P&L %', (isPos ? '+' : '') + pnlPct.toFixed(1) + '%', pnlColor)}
                  {renderDesempenhoMetric(posIsInt ? 'Custo (US$)' : 'Custo total', posIsInt ? 'US$ ' + fmt(pos.quantidade * pos.pm) : 'R$ ' + custoTotal.toLocaleString('pt-BR', { maximumFractionDigits: 0 }), C.sub)}
                  {renderDesempenhoMetric(posIsInt ? 'Custo (R$)' : 'Valor atual', posIsInt ? '≈ R$ ' + custoTotal.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : 'R$ ' + valorAtual.toLocaleString('pt-BR', { maximumFractionDigits: 0 }), C.sub)}
                  {posIsInt ? renderDesempenhoMetric('Valor atual', 'R$ ' + valorAtual.toLocaleString('pt-BR', { maximumFractionDigits: 0 }), C.sub) : null}
                  {renderDesempenhoMetric('% Carteira', pctCarteira.toFixed(1) + '%', C.sub)}
                  {renderDesempenhoMetric('Corretoras', corretorasText || '–', C.dim)}
                  {temVendas ? renderDesempenhoMetric('P&L Realizado', (plReal >= 0 ? '+' : '') + 'R$ ' + fmt(plReal), plReal >= 0 ? C.green : C.red) : null}
                  {temVendas ? renderDesempenhoMetric('Receita vendas', 'R$ ' + fmt(pos.receita_vendas), C.sub) : null}
                  {temVendas ? renderDesempenhoMetric('Vendidas', pos.total_vendido + ' un', C.dim) : null}
                </View>
              ) : null}
            </View>
            {/* ▶ GRÁFICO accordion */}
            <View>
              <TouchableOpacity onPress={function() {
                  toggleSection('grafico');
                  if (!sections['grafico'] && !chartData && !chartLoading) { loadChart(chartPeriod); }
                }}
                activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  paddingVertical: 8, paddingHorizontal: 2 }}
                accessibilityRole="button"
                accessibilityLabel={(sections['grafico'] ? 'Recolher ' : 'Expandir ') + 'Gráfico'}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name={sections['grafico'] ? 'chevron-down' : 'chevron-forward'} size={14} color={color} />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: color, fontFamily: F.display }}>HISTÓRICO DE PREÇOS</Text>
                </View>
                {hasPrice ? (
                  <Text style={[{ fontSize: 11, color: C.dim, fontFamily: F.mono }, ps]}>
                    {posSymbol + ' ' + Number(pos.preco_atual).toFixed(2)}
                  </Text>
                ) : null}
              </TouchableOpacity>
              {sections['grafico'] ? (
                <View style={{ paddingBottom: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                    <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body, marginRight: 2 }}>Período</Text>
                    {['1mo', '3mo', '6mo', '1y'].map(function(p) {
                      var lbl = p === '1mo' ? '1M' : p === '3mo' ? '3M' : p === '6mo' ? '6M' : '1A';
                      return (
                        <Pill key={p} label={lbl} active={chartPeriod === p}
                          onPress={function() { handleChartPeriod(p); }}
                          color={color} />
                      );
                    })}
                  </View>
                  {chartLoading ? (
                    <View style={{ height: 120, justifyContent: 'center', alignItems: 'center' }}>
                      <ActivityIndicator color={color} size="small" />
                    </View>
                  ) : chartData && chartData.length >= 2 ? (
                    <InteractiveChart
                      data={chartData}
                      color={color}
                      height={120}
                      formatValue={function(v) { return posSymbol + ' ' + Number(v).toFixed(2); }}
                      fontFamily={F.mono}
                    />
                  ) : (
                    <View style={{ height: 60, justifyContent: 'center', alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.body }}>Sem dados para o período</Text>
                    </View>
                  )}
                </View>
              ) : null}
            </View>
            {canAccessFund ? (
            <FundamentalAccordion
              fundamentals={fundData}
              fundLoading={fundLoading}
              opcoes={opcoesForTicker}
              positionQty={pos.quantidade}
              positionCusto={custoTotal}
              precoAtual={pos.preco_atual}
              indicator={indicatorData}
              ticker={pos.ticker}
              mercado={pos.mercado}
              color={color}
            />
            ) : (
            <UpgradePrompt feature="FUNDAMENTALS" compact navigation={navigation} />
            )}
            <View style={styles.expandedActions}>
              <TouchableOpacity style={[styles.actionBtn, { borderColor: C.green + '30', backgroundColor: C.green + '08' }]}
                onPress={onBuy} accessibilityRole="button" accessibilityLabel="Comprar">
                <Text style={[styles.actionBtnText, { color: C.green }]}>+ Comprar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, { borderColor: C.red + '30', backgroundColor: C.red + '08' }]}
                onPress={onSell} accessibilityRole="button" accessibilityLabel="Vender">
                <Text style={[styles.actionBtnText, { color: C.red }]}>Vender</Text>
              </TouchableOpacity>
              {pos.categoria === 'acao' ? (
                <TouchableOpacity style={[styles.actionBtn, { borderColor: C.opcoes + '30', backgroundColor: C.opcoes + '08' }]}
                  onPress={onLancarOpcao} accessibilityRole="button" accessibilityLabel="Lançar opção">
                  <Text style={[styles.actionBtnText, { color: C.opcoes }]}>Lançar opção</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              <TouchableOpacity style={[styles.actionBtn, { borderColor: C.accent + '30', backgroundColor: C.accent + '08' }]}
                onPress={onTransacoes} accessibilityRole="button" accessibilityLabel="Mais">
                <Text style={[styles.actionBtnText, { color: C.accent }]}>Mais</Text>
              </TouchableOpacity>
            </View>
            {/* ▶ META inline */}
            {(function() {
              var metaValorRef = tickerValorTotal != null ? tickerValorTotal : valorAtual;
              var pctAtualTotal = totalPortfolio > 0 ? (metaValorRef / totalPortfolio) * 100 : 0;
              var hasMeta = tickerMeta != null && tickerMeta !== '';
              var metaVal = hasMeta ? parseFloat(tickerMeta) : 0;
              var diff = hasMeta ? pctAtualTotal - metaVal : 0;
              var diffColor = Math.abs(diff) < 0.5 ? C.green : diff > 0 ? C.etfs : C.red;
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 }}>
                  <Ionicons name="flag-outline" size={13} color={C.etfs} />
                  <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.body }}>Atual</Text>
                  <Text style={{ fontSize: 12, color: C.text, fontFamily: F.mono }}>{pctAtualTotal.toFixed(1) + '%'}</Text>
                  <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.body }}>Meta</Text>
                  {metaEditing ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <TextInput
                        style={{ width: 48, height: 26, borderRadius: 6, borderWidth: 1, borderColor: C.etfs + '60',
                          backgroundColor: C.bg, color: C.text, fontSize: 12, fontFamily: F.mono, textAlign: 'center', paddingVertical: 0 }}
                        value={metaInput}
                        onChangeText={setMetaInput}
                        keyboardType="decimal-pad"
                        autoFocus
                        maxLength={5}
                        returnKeyType="done"
                        onSubmitEditing={function() {
                          var v = metaInput.replace(',', '.');
                          if (v === '' || isNaN(parseFloat(v))) {
                            if (onSetMeta) onSetMeta(pos.ticker, null);
                          } else {
                            if (onSetMeta) onSetMeta(pos.ticker, parseFloat(v));
                          }
                          setMetaEditing(false);
                        }}
                        onBlur={function() {
                          var v = metaInput.replace(',', '.');
                          if (v === '' || isNaN(parseFloat(v))) {
                            if (onSetMeta) onSetMeta(pos.ticker, null);
                          } else {
                            if (onSetMeta) onSetMeta(pos.ticker, parseFloat(v));
                          }
                          setMetaEditing(false);
                        }}
                      />
                      <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>%</Text>
                    </View>
                  ) : (
                    <TouchableOpacity onPress={function() { setMetaInput(hasMeta ? String(metaVal) : ''); setMetaEditing(true); }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                      <Text style={{ fontSize: 12, color: hasMeta ? C.text : C.dim, fontFamily: F.mono }}>
                        {hasMeta ? metaVal.toFixed(1) + '%' : '–'}
                      </Text>
                      <Ionicons name="pencil-outline" size={11} color={C.dim} />
                    </TouchableOpacity>
                  )}
                  {hasMeta && !metaEditing ? (
                    <Text style={{ fontSize: 11, fontFamily: F.mono, color: diffColor }}>
                      {(diff >= 0 ? '+' : '') + diff.toFixed(1) + '%'}
                    </Text>
                  ) : null}
                </View>
              );
            })()}
          </View>
        ) : null}
      </Glass>
    </PressableCard>
  );
});

// ══════════════════════════════════════════════
// SECTION: RF CARD
// ══════════════════════════════════════════════
function RFCard(props) {
  var rf = props.rf;
  var expanded = props.expanded;
  var onToggle = props.onToggle;
  var onEdit = props.onEdit;
  var onDelete = props.onDelete;
  var ps = usePrivacyStyle();

  var valor = parseFloat(rf.valor_aplicado) || 0;
  var tipoLabel = TIPO_LABELS[rf.tipo] || rf.tipo;
  var idxColor = IDX_COLORS[(rf.indexador || '').toLowerCase()] || C.accent;
  var now = new Date();
  var daysLeft = Math.ceil((parseLocalDate(rf.vencimento) - now) / (1000 * 60 * 60 * 24));
  var dayColor = daysLeft < 30 ? C.red : daysLeft < 90 ? C.yellow : daysLeft < 365 ? C.etfs : C.rf;

  return (
    <PressableCard onPress={onToggle} accessibilityLabel={tipoLabel + ', R$ ' + fmt(valor)} accessibilityHint={expanded ? 'Toque para recolher' : 'Toque para expandir'}>
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
          <Text style={[styles.cardPL, { color: C.rf }, ps]}>R$ {fmt(valor)}</Text>
        </View>
        <View style={styles.cardRow2}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={[styles.cardPriceMain, ps]}>{formatTaxa(rf.taxa, rf.indexador)}</Text>
            {rf.corretora ? <Text style={styles.cardPriceSub}>{rf.corretora}</Text> : null}
          </View>
          <Badge text={daysLeft + 'd'} color={dayColor} />
        </View>
        {expanded ? (
          <View style={styles.expandedWrap}>
            <View style={styles.expandedStats}>
              {[
                { l: 'Valor aplicado', v: 'R$ ' + fmt(valor), fin: true },
                { l: 'Taxa', v: formatTaxa(rf.taxa, rf.indexador), fin: true },
                { l: 'Vencimento', v: formatDateBR(rf.vencimento) },
                { l: 'Corretora', v: rf.corretora || '–' },
              ].map(function (d, j) {
                return (
                  <View key={j} style={styles.expandedStatItem}>
                    <Text style={styles.expandedStatLabel}>{d.l}</Text>
                    <Text style={[styles.expandedStatValue, d.fin ? ps : null]}>{d.v}</Text>
                  </View>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <TouchableOpacity style={[styles.actionBtn, { borderColor: C.accent + '30', backgroundColor: C.accent + '08' }]}
                onPress={onEdit}>
                <Text style={[styles.actionBtnText, { color: C.accent }]}>Editar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, { borderColor: C.red + '30', backgroundColor: C.red + '08' }]}
                onPress={onDelete}>
                <Text style={[styles.actionBtnText, { color: C.red }]}>Excluir</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </Glass>
    </PressableCard>
  );
}

// ══════════════════════════════════════════════════════
// MAIN SCREEN
// ══════════════════════════════════════════════════════
export default function CarteiraScreen(props) {
  var navigation = props.navigation;
  var portfolioId = props.portfolioId || null;
  var portfoliosList = props.portfolios || [];
  var user = useAuth().user;
  var ps = usePrivacyStyle();
  var sub = useSubscription();
  var _navigating = useRef(false);

  useFocusEffect(useCallback(function() { _navigating.current = false; }, []));

  function nav(screen, params) {
    if (_navigating.current) return;
    _navigating.current = true;
    navigation.navigate(screen, params);
  }

  var _pos = useState([]); var positions = _pos[0]; var setPositions = _pos[1];
  var _sal = useState([]); var saldos = _sal[0]; var setSaldos = _sal[1];
  var _fxRates = useState({ BRL: 1 }); var fxRates = _fxRates[0]; var setFxRates = _fxRates[1];
  var _fil = useState('todos'); var filter = _fil[0]; var setFilter = _fil[1];
  var _sort = useState('valor'); var sortKey = _sort[0]; var setSortKey = _sort[1];
  var _corrFilter = useState(null); var corrFilter = _corrFilter[0]; var setCorrFilter = _corrFilter[1];
  var _load = useState(true); var loading = _load[0]; var setLoading = _load[1];
  var _ref = useState(false); var refreshing = _ref[0]; var setRefreshing = _ref[1];
  var _rf = useState([]); var rfItems = _rf[0]; var setRfItems = _rf[1];
  var _pLoad = useState(false); var pricesLoading = _pLoad[0]; var setPricesLoading = _pLoad[1];
  var _hist = useState({}); var priceHistory = _hist[0]; var setPriceHistory = _hist[1];
  var _exp = useState(null); var expanded = _exp[0]; var setExpanded = _exp[1];
  var _infoModal = useState(null); var infoModal = _infoModal[0]; var setInfoModal = _infoModal[1];
  var _enc = useState([]); var encerradas = _enc[0]; var setEncerradas = _enc[1];
  var _showEnc = useState(false); var showEnc = _showEnc[0]; var setShowEnc = _showEnc[1];
  var _showAllEnc = useState(false); var showAllEnc = _showAllEnc[0]; var setShowAllEnc = _showAllEnc[1];
  var _loadError = useState(false); var loadError = _loadError[0]; var setLoadError = _loadError[1];
  var _selTile = useState(null); var selectedTile = _selTile[0]; var setSelectedTile = _selTile[1];
  var _treemapModal = useState(false); var treemapModalVisible = _treemapModal[0]; var setTreemapModal = _treemapModal[1];
  var _showSaldosDD = useState(false); var showSaldosDD = _showSaldosDD[0]; var setShowSaldosDD = _showSaldosDD[1];
  var _fund = useState({}); var fundamentals = _fund[0]; var setFundamentals = _fund[1];
  var _fundL = useState({}); var fundLoading = _fundL[0]; var setFundLoading = _fundL[1];
  var _opc = useState([]); var opcoes = _opc[0]; var setOpcoes = _opc[1];
  var _indic = useState({}); var indicators = _indic[0]; var setIndicators = _indic[1];
  var _aiModalVisible = useState(false); var aiModalVisible = _aiModalVisible[0]; var setAiModalVisible = _aiModalVisible[1];
  var _aiResult = useState(null); var aiResult = _aiResult[0]; var setAiResult = _aiResult[1];
  var _aiLoading = useState(false); var aiLoading = _aiLoading[0]; var setAiLoading = _aiLoading[1];
  var _aiError = useState(null); var aiError = _aiError[0]; var setAiError = _aiError[1];
  var _aiUsage = useState(null); var aiUsage = _aiUsage[0]; var setAiUsage = _aiUsage[1];
  var _aiSaving = useState(false); var aiSaving = _aiSaving[0]; var setAiSaving = _aiSaving[1];
  var _aiConfirmVisible = useState(false); var aiConfirmVisible = _aiConfirmVisible[0]; var setAiConfirmVisible = _aiConfirmVisible[1];
  var _snapshots = useState([]); var snapshots = _snapshots[0]; var setSnapshots = _snapshots[1];
  var _selicRate = useState(13.25); var selicRate = _selicRate[0]; var setSelicRate = _selicRate[1];
  var _ibovHist = useState([]); var ibovHist = _ibovHist[0]; var setIbovHist = _ibovHist[1];
  var _perfSeries = useState({ cart: true, cdi: true, ibov: true, acao: false, fii: false, etf: false, stock_int: false, rf: false });
  var perfSeries = _perfSeries[0]; var setPerfSeries = _perfSeries[1];
  var _showPerfChart = useState(true); var showPerfChart = _showPerfChart[0]; var setShowPerfChart = _showPerfChart[1];
  var _familyBreakdown = useState(null); var familyBreakdown = _familyBreakdown[0]; var setFamilyBreakdown = _familyBreakdown[1];
  var _tickerMetas = useState({}); var tickerMetas = _tickerMetas[0]; var setTickerMetas = _tickerMetas[1];
  var _rebalTargetsRef = useRef(null);

  var handleSetMeta = function(ticker, pct) {
    var newMetas = {};
    var mKeys = Object.keys(tickerMetas);
    for (var mk = 0; mk < mKeys.length; mk++) { newMetas[mKeys[mk]] = tickerMetas[mKeys[mk]]; }
    if (pct === null || pct === '' || isNaN(pct)) {
      delete newMetas[ticker];
    } else {
      newMetas[ticker] = parseFloat(pct);
    }
    setTickerMetas(newMetas);
    // Persist
    var existing = _rebalTargetsRef.current || {};
    var tt = existing.ticker_targets || {};
    var ttCopy = {};
    var ttKeys = Object.keys(tt);
    for (var tk = 0; tk < ttKeys.length; tk++) { ttCopy[ttKeys[tk]] = tt[ttKeys[tk]]; }
    ttCopy._flat = newMetas;
    upsertRebalanceTargets(user.id, {
      class_targets: existing.class_targets || {},
      sector_targets: existing.sector_targets || {},
      ticker_targets: ttCopy,
    }).catch(function() {});
  };

  var handleSaveAiCarteira = function() {
    if (!user || !user.id || !aiResult) return;
    setAiSaving(true);
    addSavedAnalysis(user.id, { type: 'carteira', title: 'Análise da Carteira', result: aiResult }).then(function(res) {
      setAiSaving(false);
      if (res.error) {
        Toast.show({ type: 'error', text1: 'Erro ao salvar' });
      } else {
        Toast.show({ type: 'success', text1: 'Análise salva' });
      }
    }).catch(function() { setAiSaving(false); });
  };

  var load = async function () {
    if (!user) return;
    setLoadError(false);
    var rawPos;
    try {
      var results = await Promise.all([
        getPositions(user.id, portfolioId),
        getSaldos(user.id, portfolioId),
        getRendaFixa(user.id, portfolioId),
        getOpcoes(user.id, portfolioId),
      ]);
      rawPos = results[0].data || [];
      setEncerradas(results[0].encerradas || []);
      var saldosArr = results[1].data || [];
      setSaldos(saldosArr);
      setRfItems(results[2].data || []);
      setOpcoes(results[3].data || []);
      setPositions(rawPos);

      // Buscar câmbio para saldos em moeda estrangeira
      var moedasEstr = [];
      for (var mi2 = 0; mi2 < saldosArr.length; mi2++) {
        var m2 = saldosArr[mi2].moeda || 'BRL';
        if (m2 !== 'BRL' && moedasEstr.indexOf(m2) === -1) { moedasEstr.push(m2); }
      }
      if (moedasEstr.length > 0) {
        try {
          var rates = await fetchExchangeRates(moedasEstr);
          setFxRates(rates);
        } catch (e2) { /* fallback BRL:1 */ }
      } else {
        setFxRates({ BRL: 1 });
      }
      // Compute family breakdown when viewing "Todos" and portfolios exist
      if (!portfolioId && portfoliosList.length > 0) {
        try {
          var pfPromises = [];
          for (var pfIdx = 0; pfIdx < portfoliosList.length; pfIdx++) {
            pfPromises.push(getPositions(user.id, portfoliosList[pfIdx].id));
          }
          pfPromises.push(getPositions(user.id, '__null__'));
          var pfResults = await Promise.all(pfPromises);
          var breakdown = [];
          for (var pfr = 0; pfr < portfoliosList.length; pfr++) {
            var pfPositions = pfResults[pfr].data || [];
            var pfTotal = 0;
            for (var pp = 0; pp < pfPositions.length; pp++) {
              pfTotal += pfPositions[pp].quantidade * pfPositions[pp].pm;
            }
            breakdown.push({ id: portfoliosList[pfr].id, nome: portfoliosList[pfr].nome, cor: portfoliosList[pfr].cor || C.accent, icone: portfoliosList[pfr].icone, valor: pfTotal, ativos: pfPositions.length });
          }
          // "Sem portfólio" (last result)
          var nullPositions = pfResults[pfResults.length - 1].data || [];
          var nullTotal = 0;
          for (var npi = 0; npi < nullPositions.length; npi++) {
            nullTotal += nullPositions[npi].quantidade * nullPositions[npi].pm;
          }
          if (nullTotal > 0) {
            breakdown.push({ id: null, nome: 'Padrão', cor: C.accent, icone: null, valor: nullTotal, ativos: nullPositions.length });
          }
          setFamilyBreakdown(breakdown);
        } catch (e3) { console.warn('Family breakdown failed:', e3); }
      } else {
        setFamilyBreakdown(null);
      }
    } catch (e) {
      console.warn('CarteiraScreen load failed:', e);
      setLoadError(true);
      setLoading(false);
      return;
    }
    setLoading(false);

    setPricesLoading(true);
    try {
      var tickers = rawPos.map(function (p) { return p.ticker; }).filter(Boolean);
      var enriched = await enrichPositionsWithPrices(rawPos);
      setPositions(enriched);
      if (tickers.length > 0) {
        // Construir mercadoMap para rotear BR vs INT
        var mercadoMap = {};
        for (var mi = 0; mi < enriched.length; mi++) {
          if (enriched[mi].ticker && enriched[mi].mercado) {
            mercadoMap[enriched[mi].ticker] = enriched[mi].mercado;
          }
        }
        var hist = await fetchHistoryRouted(tickers, mercadoMap);
        setPriceHistory(hist || {});
      }
    } catch (e) { console.warn('Price enrichment failed:', e.message); }
    setPricesLoading(false);

    // Fire-and-forget: load ticker metas
    getRebalanceTargets(user.id).then(function(rtRes) {
      if (rtRes.data) {
        _rebalTargetsRef.current = rtRes.data;
        var flat = rtRes.data.ticker_targets && rtRes.data.ticker_targets._flat ? rtRes.data.ticker_targets._flat : {};
        setTickerMetas(flat);
      }
    }).catch(function() {});

    // Fire-and-forget: snapshots, selic, ibov for perf chart
    Promise.all([
      getPatrimonioSnapshots(user.id),
      getProfile(user.id),
    ]).then(function(perfResults) {
      var snaps = perfResults[0] || [];
      setSnapshots(snaps.map(function(s) { return { date: s.data, value: s.valor }; }));
      var profResult = perfResults[1];
      var prof = profResult && profResult.data;
      if (prof && prof.selic) setSelicRate(parseFloat(prof.selic) || 13.25);
    }).catch(function() {});
    fetchPriceHistoryLong(['^BVSP']).then(function(ibovData) {
      if (ibovData && ibovData['^BVSP']) {
        var closes = ibovData['^BVSP'];
        var ibovArr = [];
        for (var ib = 0; ib < closes.length; ib++) {
          if (closes[ib] && closes[ib].date) {
            ibovArr.push({ date: closes[ib].date, value: closes[ib].close || closes[ib].price || 0 });
          }
        }
        setIbovHist(ibovArr);
      }
    }).catch(function() {});
  };

  useFocusEffect(useCallback(function () { load(); }, [user, portfolioId, portfoliosList.length]));

  var onRefresh = async function () {
    setRefreshing(true);
    clearPriceCache();
    setFundamentals({});
    setIndicators({});
    await load();
    setRefreshing(false);
  };

  // ── DERIVED DATA ──
  var now = new Date();
  var rfAtivos = rfItems.filter(function (r) { return parseLocalDate(r.vencimento) > now; });

  // Unique corretoras from positions
  var allCorretoras = [];
  for (var ci = 0; ci < positions.length; ci++) {
    var pc = positions[ci].por_corretora;
    if (pc) {
      var cks = Object.keys(pc);
      for (var ck = 0; ck < cks.length; ck++) {
        if (pc[cks[ck]] > 0 && allCorretoras.indexOf(cks[ck]) === -1) {
          allCorretoras.push(cks[ck]);
        }
      }
    }
  }
  allCorretoras.sort();

  // Filter
  var filteredPositions;
  if (filter === 'todos') filteredPositions = positions;
  else if (filter === 'rf') filteredPositions = [];
  else {
    var fd = FILTERS.find(function (f) { return f.k === filter; });
    filteredPositions = positions.filter(function (p) { return p.categoria === (fd ? fd.cat : ''); });
  }
  // Corretora filter — adjust qty and PM to show only the selected corretora's data
  if (corrFilter) {
    var corrAdjusted = [];
    for (var cfi = 0; cfi < filteredPositions.length; cfi++) {
      var fp = filteredPositions[cfi];
      if (!fp.por_corretora || !fp.por_corretora[corrFilter] || fp.por_corretora[corrFilter] <= 0) continue;
      var corrQty = fp.por_corretora[corrFilter];
      var corrCusto = fp.custo_por_corretora && fp.custo_por_corretora[corrFilter] ? fp.custo_por_corretora[corrFilter] : corrQty * fp.pm;
      var corrPm = corrQty > 0 ? corrCusto / corrQty : fp.pm;
      var adjPos = {};
      var fpKeys = Object.keys(fp);
      for (var fk = 0; fk < fpKeys.length; fk++) {
        adjPos[fpKeys[fk]] = fp[fpKeys[fk]];
      }
      adjPos.quantidade = corrQty;
      adjPos.pm = corrPm;
      adjPos.custo_total = corrCusto;
      adjPos._corrFiltered = true;
      corrAdjusted.push(adjPos);
    }
    filteredPositions = corrAdjusted;
  }
  // Sort
  var sortedPositions = filteredPositions.slice().sort(function (a, b) {
    if (sortKey === 'nome') return (a.ticker || '').localeCompare(b.ticker || '');
    if (sortKey === 'var') return ((b.variacao || 0) - (a.variacao || 0));
    if (sortKey === 'pl') {
      var plA = a.preco_atual ? (a.preco_atual - a.pm) * a.quantidade : 0;
      var plB = b.preco_atual ? (b.preco_atual - b.pm) * b.quantidade : 0;
      return plB - plA;
    }
    // default 'valor'
    var vA = a.quantidade * (a.preco_atual || a.pm);
    var vB = b.quantidade * (b.preco_atual || b.pm);
    return vB - vA;
  });
  filteredPositions = sortedPositions;
  var showRF = filter === 'todos' || filter === 'rf';

  // Totals — converter INT para BRL
  var totalPositions = positions.reduce(function (s, p) {
    if (p.mercado === 'INT') {
      // preco_atual ja esta em BRL (enrichment converte), pm esta em USD
      var rate = p.taxa_cambio || p.taxa_cambio_media || 1;
      return s + p.quantidade * (p.preco_atual || (p.pm * rate));
    }
    return s + p.quantidade * (p.preco_atual || p.pm);
  }, 0);
  var totalRF = rfAtivos.reduce(function (s, r) { return s + (parseFloat(r.valor_aplicado) || 0); }, 0);
  var totalSaldos = saldos.reduce(function (s, c) {
    return s + convertToBRL(c.saldo || 0, c.moeda || 'BRL', fxRates);
  }, 0);
  var totalInvestido = totalPositions + totalRF;
  var totalValue = totalInvestido + totalSaldos;

  var totalCusto = positions.reduce(function (s, p) {
    if (p.mercado === 'INT') {
      var rate = p.taxa_cambio || p.taxa_cambio_media || 1;
      return s + p.quantidade * p.pm * rate;
    }
    return s + p.quantidade * p.pm;
  }, 0);
  var totalPL = totalPositions - totalCusto;
  var totalPLPct = totalCusto > 0 ? (totalPL / totalCusto) * 100 : 0;
  var isPosTotal = totalPL >= 0;

  // P&L realizado (encerradas + vendas parciais de ativas)
  var plEncerradas = encerradas.reduce(function (s, e) { return s + (e.pl_realizado || 0); }, 0);
  var plAtivas = positions.reduce(function (s, p) { return s + (p.pl_realizado || 0); }, 0);
  var plRealizado = plEncerradas + plAtivas;
  var custoEncerradas = encerradas.reduce(function (s, e) { return s + (e.custo_compras || 0); }, 0);
  var custoVendasAtivas = positions.reduce(function (s, p) {
    return s + ((p.total_vendido || 0) > 0 ? (p.custo_compras || 0) * ((p.total_vendido || 0) / ((p.total_comprado || 0) || 1)) : 0);
  }, 0);
  var custoTotalVendas = custoEncerradas + custoVendasAtivas;
  var plRealizadoPct = custoTotalVendas > 0 ? (plRealizado / custoTotalVendas) * 100 : 0;
  var isPosRealizado = plRealizado >= 0;

  // Allocation by class
  var allocMap = { acao: 0, fii: 0, etf: 0, stock_int: 0, rf: totalRF };
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

  // Treemap items (with change_day for heatmap coloring)
  var treemapItems = positions.map(function (p) {
    var val = p.quantidade * (p.preco_atual || p.pm);
    var custo = p.quantidade * p.pm;
    var pnlPct = custo > 0 ? ((val - custo) / custo) * 100 : 0;
    return {
      ticker: p.ticker, weight: val, pnlPct: pnlPct,
      color: PRODUCT_COLORS[p.categoria] || C.accent,
      categoria: p.categoria, pnl: val - custo,
      change_day: p.change_day || 0,
      quantidade: p.quantidade, pm: p.pm,
      preco_atual: p.preco_atual || p.pm,
    };
  });

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

  function toggleExpand(key, ticker, mercado) {
    animateLayout();
    if (expanded === key) { setExpanded(null); return; }
    setExpanded(key);
    // Lazy load fundamentals (undefined = not fetched yet, null = fetched but empty/error)
    if (ticker && fundamentals[ticker] === undefined) {
      setFundLoading(function(prev) {
        var upd = {};
        var pk = Object.keys(prev);
        for (var pi = 0; pi < pk.length; pi++) { upd[pk[pi]] = prev[pk[pi]]; }
        upd[ticker] = true;
        return upd;
      });
      fetchFundamentals(ticker, mercado || 'BR').then(function(data) {
        setFundamentals(function(prev) {
          var fd = {};
          var fk = Object.keys(prev);
          for (var fi = 0; fi < fk.length; fi++) { fd[fk[fi]] = prev[fk[fi]]; }
          fd[ticker] = data || false; // false = fetched but empty
          return fd;
        });
        setFundLoading(function(prev) {
          var done = {};
          var dk = Object.keys(prev);
          for (var di = 0; di < dk.length; di++) { done[dk[di]] = prev[dk[di]]; }
          done[ticker] = false;
          return done;
        });
      }).catch(function() {
        setFundamentals(function(prev) {
          var fd = {};
          var fk = Object.keys(prev);
          for (var fi = 0; fi < fk.length; fi++) { fd[fk[fi]] = prev[fk[fi]]; }
          fd[ticker] = false; // mark as attempted
          return fd;
        });
        setFundLoading(function(prev) {
          var done = {};
          var dk = Object.keys(prev);
          for (var di = 0; di < dk.length; di++) { done[dk[di]] = prev[dk[di]]; }
          done[ticker] = false;
          return done;
        });
      });
    }
    // Lazy load indicator (HV)
    if (ticker && !indicators[ticker] && user) {
      getIndicatorByTicker(user.id, ticker).then(function(result) {
        if (result && result.data) {
          setIndicators(function(prev) {
            var ind = {};
            var ik = Object.keys(prev);
            for (var ii = 0; ii < ik.length; ii++) { ind[ik[ii]] = prev[ik[ii]]; }
            ind[ticker] = result.data;
            return ind;
          });
        }
      }).catch(function() {});
    }
  }

  function handleDeleteRF(rfId) {
    var rf = null;
    for (var di = 0; di < rfItems.length; di++) { if (rfItems[di].id === rfId) { rf = rfItems[di]; break; } }
    var detailMsg = rf
      ? (rf.tipo || '').toUpperCase() + (rf.emissor ? ' — ' + rf.emissor : '') + '\nR$ ' + fmt(rf.valor_aplicado || 0) + '\n\nEssa ação não pode ser desfeita.'
      : 'Essa ação não pode ser desfeita.';
    Alert.alert('Excluir título?', detailMsg, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir', style: 'destructive',
        onPress: async function () {
          var result = await deleteRendaFixa(rfId);
          if (!result.error) {
            setRfItems(rfItems.filter(function (r) { return r.id !== rfId; }));
          } else {
            Alert.alert('Erro', 'Falha ao excluir.');
          }
        },
      },
    ]);
  }

  // ══════════ AI CARTEIRA ══════════
  var handleAiCarteira = function() {
    if (!sub.canAccess('AI_ANALYSIS')) {
      navigation.navigate('Paywall');
      return;
    }
    setAiModalVisible(true);
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);

    // Build allocation percentages
    var alocPct = {};
    var alocKeys = Object.keys(allocMap);
    for (var ak = 0; ak < alocKeys.length; ak++) {
      alocPct[alocKeys[ak]] = allocTotal > 0 ? (allocMap[alocKeys[ak]] / allocTotal) * 100 : 0;
    }
    alocPct.saldo = allocTotal > 0 ? (totalSaldos / (allocTotal + totalSaldos)) * 100 : 0;

    // Build positions summary
    var posResumo = positions.map(function(p) {
      var val = p.quantidade * (p.preco_atual || p.pm);
      var custo = p.quantidade * p.pm;
      var plPct = custo > 0 ? ((val - custo) / custo) * 100 : 0;
      return {
        ticker: p.ticker,
        categoria: p.categoria,
        quantidade: p.quantidade,
        pm: p.pm,
        preco_atual: p.preco_atual || p.pm,
        pl_pct: plPct,
        variacao: p.change_day || 0,
      };
    });

    // Build opcoes summary
    var opsResumo = null;
    var opsAtivas = opcoes.filter(function(o) { return o.status === 'ativa'; });
    if (opsAtivas.length > 0) {
      var premMes = 0;
      var plOps = 0;
      for (var oi = 0; oi < opsAtivas.length; oi++) {
        premMes += (opsAtivas[oi].premio || 0) * (opsAtivas[oi].quantidade || 0);
      }
      opsResumo = { ativas: opsAtivas.length, premiosMes: premMes, plTotal: plOps };
    }

    // Build indicators summary
    var indResumo = [];
    var indKeys = Object.keys(indicators);
    for (var ik = 0; ik < indKeys.length; ik++) {
      var ind = indicators[indKeys[ik]];
      if (ind) {
        indResumo.push({
          ticker: indKeys[ik],
          hv: ind.hv_20 || null,
          rsi: ind.rsi_14 || null,
          beta: ind.beta || null,
        });
      }
    }

    var payload = {
      type: 'carteira',
      patrimonio: totalValue,
      alocacao: alocPct,
      posicoes: posResumo,
      rendaMensal: null,
      opcoesResumo: opsResumo,
      rfTotal: totalRF,
      saldoLivre: totalSaldos,
      rentabilidade: totalPLPct,
      indicadores: indResumo,
    };

    geminiService.analyzeGeneral(payload).then(function(result) {
      setAiLoading(false);
      if (result.error) {
        setAiError(result.error);
      } else {
        setAiResult(result);
        if (result._usage) setAiUsage(result._usage);
      }
    });
  };

  if (loading) return <View style={styles.container}><SkeletonCarteira /></View>;
  if (loadError) return (
    <View style={styles.container}>
      <EmptyState ionicon="alert-circle-outline" title="Erro ao carregar" description="Não foi possível carregar a carteira. Verifique sua conexão e tente novamente." cta="Tentar novamente" onCta={function() { setLoading(true); load(); }} color={C.red} />
    </View>
  );
  if (positions.length === 0 && rfAtivos.length === 0 && saldos.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState ionicon="briefcase-outline" title="Carteira vazia"
          description="Nenhum ativo na carteira. Registre compras de ações, FIIs, ETFs ou renda fixa."
          cta="Adicionar ativo" onCta={function () { nav('AddOperacao'); }} color={C.acoes} />
        <Fab navigation={navigation} items={[
          { label: 'Operação', icon: 'wallet-outline', color: C.acoes, screen: 'AddOperacao' },
          { label: 'Opção', icon: 'flash-outline', color: C.opcoes, screen: 'AddOpcao' },
          { label: 'Provento', icon: 'cash-outline', color: C.fiis, screen: 'AddProvento' },
          { label: 'Renda Fixa', icon: 'document-text-outline', color: C.rf, screen: 'AddRendaFixa' },
          { label: 'Portfolio', icon: 'folder-outline', color: C.etfs, screen: 'ConfigPortfolios' },
        ]} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}>

      {/* ══════ 1. HERO ══════ */}
      <Glass glow={C.acoes} padding={16}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Text style={styles.heroLabel}>PATRIMÔNIO TOTAL</Text>
            <Text style={[styles.heroValue, ps]}>R$ {fmt(totalValue)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.heroLabel}>P&L ABERTO</Text>
              <InfoTip text="Ganho ou perda das posições que você ainda tem em carteira, comparando o preço atual com o preço médio de compra." size={12} />
            </View>
            <Text style={[styles.heroPL, { color: isPosTotal ? C.green : C.red }, ps]}>
              {isPosTotal ? '+' : '-'}R$ {fmt(Math.abs(totalPL))}
            </Text>
            <Text style={[styles.heroPLSub, { color: isPosTotal ? C.green : C.red }, ps]}>
              {isPosTotal ? '▲' : '▼'} {Math.abs(totalPLPct).toFixed(1)}% geral
            </Text>
          </View>
        </View>
        {encerradas.length > 0 ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border }}>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={styles.heroLabel}>P&L REALIZADO</Text>
                <InfoTip text="Lucro ou prejuízo das ações já vendidas. Calculado usando o preço médio de cada corretora, que reflete o resultado real de cada operação. O IR usa o preço médio geral (veja Relatórios > IR)." size={12} />
              </View>
              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>{encerradas.length} encerrada(s) + vendas parciais</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.heroPL, { color: isPosRealizado ? C.green : C.red }, ps]}>
                {isPosRealizado ? '+' : '-'}R$ {fmt(Math.abs(plRealizado))}
              </Text>
              <Text style={[styles.heroPLSub, { color: isPosRealizado ? C.green : C.red }, ps]}>
                {isPosRealizado ? '▲' : '▼'} {Math.abs(plRealizadoPct).toFixed(1)}%
              </Text>
            </View>
          </View>
        ) : null}
        <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={styles.heroLabel}>INVESTIDO</Text>
              <Text style={[{ fontSize: 15, color: C.text, fontFamily: F.mono }, ps]}>R$ {fmt(totalInvestido)}</Text>
            </View>
            <TouchableOpacity activeOpacity={0.7} onPress={function() { setShowSaldosDD(!showSaldosDD); }}>
              <View style={{ alignItems: 'flex-end' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <InfoTip title="Patrimônio Livre" text={'Patrimônio Livre é o valor em caixa disponível nas suas contas de corretoras e bancos — ou seja, o dinheiro que não está investido em ativos (ações, FIIs, ETFs, renda fixa).' + '\n\n' + 'Cálculo: Patrimônio Total - Patrimônio Investido = Patrimônio Livre.' + '\n\n' + '⚠ Para que este valor seja preciso, mantenha os saldos de todas as suas contas atualizados na aba Caixa.'} size={12} />
                  <Text style={styles.heroLabel}>PATRIMÔNIO LIVRE</Text>
                  <Ionicons name={showSaldosDD ? 'chevron-up' : 'chevron-down'} size={11} color={C.dim} />
                </View>
                <Text style={[{ fontSize: 15, color: totalSaldos > 0 ? C.rf : C.dim, fontFamily: F.mono }, ps]}>R$ {fmt(totalSaldos)}</Text>
              </View>
            </TouchableOpacity>
          </View>
          {showSaldosDD && saldos.length > 0 ? (
            <View style={{ marginTop: 10, borderRadius: 10, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, padding: 12 }}>
              {saldos.map(function(conta, ci) {
                var moeda = conta.moeda || 'BRL';
                var sym = getSymbol(moeda);
                var valBRL = convertToBRL(conta.saldo || 0, moeda, fxRates);
                var isForeign = moeda !== 'BRL';
                return (
                  <View key={ci} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderTopWidth: ci > 0 ? 1 : 0, borderTopColor: C.border + '40' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: C.accent, fontFamily: F.mono }}>{(conta.corretora || '??').substring(0, 2).toUpperCase()}</Text>
                      </View>
                      <Text numberOfLines={1} style={{ fontSize: 13, color: C.text, fontFamily: F.body, maxWidth: 140 }}>{conta.corretora || 'Conta'}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[{ fontSize: 13, color: (conta.saldo || 0) > 0 ? C.rf : C.dim, fontFamily: F.mono, fontWeight: '600' }, ps]}>{sym + ' ' + fmt(conta.saldo || 0)}</Text>
                      {isForeign ? (
                        <Text style={[{ fontSize: 10, color: C.dim, fontFamily: F.mono }, ps]}>{'≈ R$ ' + fmt(valBRL)}</Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
        <View style={styles.heroStats}>
          {[
            { l: 'ATIVOS', v: String(positions.length + rfAtivos.length), c: C.accent },
            { l: 'ENCERRADAS', v: String(encerradas.length), c: encerradas.length > 0 ? C.yellow : C.dim },
            { l: 'CONTAS', v: String(saldos.length || 1), c: C.accent },
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
            <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>Atualizando cotações...</Text>
          </View>
        ) : getLastPriceUpdate() ? (
          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, marginTop: 6, textAlign: 'right' }}>
            {'Cotações de ' + new Date(getLastPriceUpdate()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        ) : null}
      </Glass>

      {/* ══════ RESUMO FAMÍLIA / PORTFÓLIOS ══════ */}
      {familyBreakdown && familyBreakdown.length > 0 ? (
        <Glass padding={14}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Ionicons name="people-outline" size={14} color={C.accent} />
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: '600' }}>PORTFÓLIOS</Text>
          </View>
          {familyBreakdown.map(function(fb) {
            var pct = totalValue > 0 ? (fb.valor / totalValue * 100) : 0;
            return (
              <View key={fb.id || 'null'} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                {fb.icone ? (
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: fb.cor + '22', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={fb.icone} size={14} color={fb.cor} />
                  </View>
                ) : (
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: fb.cor + '22', alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: fb.cor }} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, fontFamily: F.body, color: C.text }}>{fb.nome}</Text>
                    <Text style={[{ fontSize: 13, fontFamily: F.mono, color: C.text }, ps]}>{'R$ ' + fmt(fb.valor)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                    <Text style={{ fontSize: 10, fontFamily: F.mono, color: C.dim }}>{fb.ativos + ' ativos'}</Text>
                    <Text style={{ fontSize: 10, fontFamily: F.mono, color: fb.cor }}>{pct.toFixed(1) + '%'}</Text>
                  </View>
                  <View style={{ height: 3, backgroundColor: C.border, borderRadius: 1.5, marginTop: 4 }}>
                    <View style={{ height: 3, borderRadius: 1.5, backgroundColor: fb.cor, width: pct + '%' }} />
                  </View>
                </View>
              </View>
            );
          })}
        </Glass>
      ) : null}

      {/* ══════ MAPA DE CALOR ══════ */}
      {treemapItems.length > 0 ? (
        <Glass padding={14}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: '600' }}>MAPA DE CALOR</Text>
              <InfoTip title="Mapa de Calor" text={"Visualização da carteira onde o tamanho de cada bloco representa o peso (valor) do ativo no portfólio.\n\nVerde = ativo subiu hoje. Vermelho = caiu hoje.\nQuanto mais intensa a cor, maior a variação.\n\nToque em um bloco para ver detalhes."} size={12} />
            </View>
            <TouchableOpacity onPress={function () { setTreemapModal(true); setSelectedTile(null); }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button" accessibilityLabel="Expandir mapa de calor">
              <Ionicons name="expand-outline" size={16} color={C.accent} />
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, marginBottom: 8 }}>
            Tamanho = peso · Verde = alta hoje · Vermelho = queda
          </Text>
          <TreemapChart items={treemapItems} height={130} onPressTile={function (tile) { setSelectedTile(tile); }} />
          {selectedTile && !treemapModalVisible ? (
            <View style={{ marginTop: 8, padding: 8, borderRadius: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: selectedTile.color }} />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.text, fontFamily: F.display }}>{selectedTile.ticker}</Text>
                  <Text style={{ fontSize: 11, color: selectedTile.change_day >= 0 ? C.green : C.red, fontWeight: '600', fontFamily: F.mono }}>
                    {selectedTile.change_day >= 0 ? '+' : ''}{selectedTile.change_day.toFixed(2)}% dia
                  </Text>
                </View>
                <TouchableOpacity onPress={function () { setSelectedTile(null); }}>
                  <Text style={{ fontSize: 14, color: C.dim, fontFamily: F.mono }}>✕</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
                <View>
                  <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>QTD</Text>
                  <Text style={{ fontSize: 11, color: C.text, fontFamily: F.mono }}>{selectedTile.quantidade}</Text>
                </View>
                <View>
                  <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>PM</Text>
                  <Text style={{ fontSize: 11, color: C.text, fontFamily: F.mono }}>R$ {fmt(selectedTile.pm)}</Text>
                </View>
                <View>
                  <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>ATUAL</Text>
                  <Text style={{ fontSize: 11, color: C.text, fontFamily: F.mono }}>R$ {fmt(selectedTile.preco_atual)}</Text>
                </View>
                <View>
                  <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>DIA</Text>
                  <Text style={{ fontSize: 11, color: selectedTile.change_day >= 0 ? C.green : C.red, fontFamily: F.mono }}>
                    {selectedTile.change_day >= 0 ? '+' : ''}{selectedTile.change_day.toFixed(2)}%
                  </Text>
                </View>
              </View>
            </View>
          ) : null}
        </Glass>
      ) : null}

      {/* ══════ PERFORMANCE CHART ══════ */}
      {snapshots.length >= 2 ? (
        <Glass padding={14}>
          <TouchableOpacity activeOpacity={0.7} onPress={function() { setShowPerfChart(!showPerfChart); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: showPerfChart ? 8 : 0 }}>
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: '600' }}>
              {showPerfChart ? '▾' : '▸'} RETORNO SEMANAL
            </Text>
            <InfoTip title="Retorno Semanal" text={"Retorno percentual semanal comparando sua carteira vs CDI vs IBOV.\n\nCarteira: variação do patrimônio entre semanas.\nCDI: retorno teórico da Selic.\nIBOV: retorno real do índice Bovespa.\n\nToggle as séries para comparar classes de ativos."} size={12} />
          </TouchableOpacity>
          {showPerfChart ? (function() {
            // Compute weekly returns for carteira
            var cartReturns = computeWeeklyReturns(snapshots);
            if (cartReturns.length === 0) return React.createElement(Text, { style: { fontSize: 11, color: C.sub, fontFamily: F.body, textAlign: 'center', paddingVertical: 10 } }, 'Dados insuficientes para o gráfico');

            // CDI weekly returns
            var cdiAnual = (selicRate || 13.25) - 0.10;
            var cdiSemanal = (Math.pow(1 + cdiAnual / 100, 1 / 52) - 1) * 100;
            var cdiReturns = {};
            for (var cwi = 0; cwi < cartReturns.length; cwi++) {
              cdiReturns[cartReturns[cwi].week] = cdiSemanal;
            }

            // IBOV weekly returns
            var ibovReturns = {};
            if (ibovHist.length > 0) {
              var ibovWR = computeWeeklyReturns(ibovHist);
              for (var iwi = 0; iwi < ibovWR.length; iwi++) {
                ibovReturns[ibovWR[iwi].week] = ibovWR[iwi].pct;
              }
            }

            // Per-category weekly returns (from snapshots proportional split)
            var catReturns = {};
            var catKeys = ['acao', 'fii', 'etf', 'stock_int', 'rf'];
            if (allocTotal > 0) {
              for (var ck = 0; ck < catKeys.length; ck++) {
                var catKey = catKeys[ck];
                var catPct = allocMap[catKey] / allocTotal;
                if (catPct > 0) {
                  var catWR = {};
                  for (var cri = 0; cri < cartReturns.length; cri++) {
                    catWR[cartReturns[cri].week] = cartReturns[cri].pct * catPct;
                  }
                  catReturns[catKey] = catWR;
                }
              }
            }

            // Build visible series
            var n = cartReturns.length;
            var chartH = 150;
            var chartW = Dimensions.get('window').width - 2 * SIZE.padding - 28 - 40;
            var padL = 38;
            var padR = 8;
            var padT = 8;
            var padB = 22;
            var plotH = chartH - padT - padB;
            var plotW = chartW - padL - padR;

            // Compute maxAbs from all visible series
            var maxAbs = 1;
            for (var mi = 0; mi < n; mi++) {
              var rKey = cartReturns[mi].week;
              if (perfSeries.cart) {
                var av = Math.abs(cartReturns[mi].pct);
                if (av > maxAbs) maxAbs = av;
              }
              if (perfSeries.cdi) {
                var cdv = cdiReturns[rKey];
                if (cdv != null && Math.abs(cdv) > maxAbs) maxAbs = Math.abs(cdv);
              }
              if (perfSeries.ibov) {
                var ibv = ibovReturns[rKey];
                if (ibv != null && Math.abs(ibv) > maxAbs) maxAbs = Math.abs(ibv);
              }
              for (var cki2 = 0; cki2 < catKeys.length; cki2++) {
                if (perfSeries[catKeys[cki2]] && catReturns[catKeys[cki2]]) {
                  var crv = catReturns[catKeys[cki2]][rKey];
                  if (crv != null && Math.abs(crv) > maxAbs) maxAbs = Math.abs(crv);
                }
              }
            }
            maxAbs = Math.ceil(maxAbs) + 1;
            if (maxAbs < 3) maxAbs = 3;

            var zeroY = padT + plotH / 2;
            var valToY = function(v) { return zeroY - (v / maxAbs) * (plotH / 2); };
            var idxToX = function(i) { return n === 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW; };

            var allEls = [];

            // Grid lines + Y labels
            var ySteps = [maxAbs, maxAbs / 2, 0, -maxAbs / 2, -maxAbs];
            for (var yi = 0; yi < ySteps.length; yi++) {
              var yv = ySteps[yi];
              var yp = valToY(yv);
              allEls.push(React.createElement(SvgLine, {
                key: 'pg-' + yi, x1: padL, y1: yp, x2: padL + plotW, y2: yp,
                stroke: yv === 0 ? C.sub + '50' : C.sub + '18', strokeWidth: yv === 0 ? 1 : 0.5,
              }));
              allEls.push(React.createElement(SvgText, {
                key: 'pyl-' + yi, x: padL - 4, y: yp + 3,
                fontSize: 8, fill: C.dim, fontFamily: F.mono, textAnchor: 'end',
              }, (yv >= 0 ? '+' : '') + yv.toFixed(1) + '%'));
            }

            // Helper: build points for a series
            var buildPts = function(getVal) {
              var pts = [];
              for (var pi = 0; pi < n; pi++) {
                var v = getVal(cartReturns[pi].week, pi);
                if (v != null) pts.push({ x: idxToX(pi), y: valToY(v), val: v });
              }
              return pts;
            };

            // Helper: render series (line + dots)
            var renderSer = function(pts, color, key, showArea) {
              var els = [];
              if (pts.length < 1) return els;
              if (showArea && pts.length >= 2) {
                var areaP = 'M' + pts[0].x + ',' + zeroY;
                for (var a = 0; a < pts.length; a++) areaP = areaP + ' L' + pts[a].x + ',' + pts[a].y;
                areaP = areaP + ' L' + pts[pts.length - 1].x + ',' + zeroY + ' Z';
                els.push(React.createElement(Path, { key: key + '-a', d: areaP, fill: color, opacity: 0.08 }));
              }
              if (pts.length >= 2) {
                var lp = 'M' + pts[0].x + ',' + pts[0].y;
                for (var l = 1; l < pts.length; l++) lp = lp + ' L' + pts[l].x + ',' + pts[l].y;
                els.push(React.createElement(Path, { key: key + '-l', d: lp, stroke: color, strokeWidth: 2, fill: 'none', opacity: 0.9 }));
              }
              for (var d = 0; d < pts.length; d++) {
                els.push(React.createElement(SvgCircle, { key: key + '-g' + d, cx: pts[d].x, cy: pts[d].y, r: 4, fill: color, opacity: 0.15 }));
                els.push(React.createElement(SvgCircle, { key: key + '-d' + d, cx: pts[d].x, cy: pts[d].y, r: 2.5, fill: color, opacity: 1 }));
                els.push(React.createElement(SvgText, { key: key + '-v' + d, x: pts[d].x, y: pts[d].y - 6, fontSize: 7, fill: color, fontFamily: F.mono, textAnchor: 'middle', opacity: 0.8 },
                  (pts[d].val >= 0 ? '+' : '') + pts[d].val.toFixed(1) + '%'));
              }
              return els;
            };

            // Render series in order (back to front)
            var seriesConfig = [
              { key: 'cdi', active: perfSeries.cdi, color: C.rf, area: false, getVal: function(wk) { return cdiReturns[wk] != null ? cdiReturns[wk] : null; } },
              { key: 'ibov', active: perfSeries.ibov, color: C.etfs, area: false, getVal: function(wk) { return ibovReturns[wk] != null ? ibovReturns[wk] : null; } },
              { key: 'rf', active: perfSeries.rf, color: C.rf, area: false, getVal: function(wk) { return catReturns.rf && catReturns.rf[wk] != null ? catReturns.rf[wk] : null; } },
              { key: 'etf', active: perfSeries.etf, color: C.etfs, area: false, getVal: function(wk) { return catReturns.etf && catReturns.etf[wk] != null ? catReturns.etf[wk] : null; } },
              { key: 'stock_int', active: perfSeries.stock_int, color: C.stock_int, area: false, getVal: function(wk) { return catReturns.stock_int && catReturns.stock_int[wk] != null ? catReturns.stock_int[wk] : null; } },
              { key: 'fii', active: perfSeries.fii, color: C.fiis, area: false, getVal: function(wk) { return catReturns.fii && catReturns.fii[wk] != null ? catReturns.fii[wk] : null; } },
              { key: 'acao', active: perfSeries.acao, color: C.acoes, area: false, getVal: function(wk) { return catReturns.acao && catReturns.acao[wk] != null ? catReturns.acao[wk] : null; } },
              { key: 'cart', active: perfSeries.cart, color: C.accent, area: true, getVal: function(wk, idx) { return cartReturns[idx].pct; } },
            ];

            for (var si = 0; si < seriesConfig.length; si++) {
              var sc = seriesConfig[si];
              if (!sc.active) continue;
              var pts = buildPts(sc.getVal);
              var sEls = renderSer(pts, sc.color, 'p' + sc.key, sc.area);
              for (var se = 0; se < sEls.length; se++) allEls.push(sEls[se]);
            }

            // X-axis labels
            for (var xi = 0; xi < n; xi++) {
              var showXL = n <= 12 || xi % Math.ceil(n / 8) === 0 || xi === n - 1;
              if (showXL && cartReturns[xi].date) {
                var dp = cartReturns[xi].date.split('-');
                var ml = dp[2] + '/' + dp[1];
                allEls.push(React.createElement(SvgText, {
                  key: 'pxl-' + xi, x: idxToX(xi), y: chartH - 2,
                  fontSize: 8, fill: C.dim, fontFamily: F.mono, textAnchor: 'middle',
                }, ml));
              }
            }

            // Toggle pills
            var SERIES_PILLS = [
              { k: 'cart', l: 'Carteira', c: C.accent },
              { k: 'cdi', l: 'CDI', c: C.rf },
              { k: 'ibov', l: 'IBOV', c: C.etfs },
              { k: 'acao', l: 'Ações', c: C.acoes },
              { k: 'fii', l: 'FIIs', c: C.fiis },
              { k: 'etf', l: 'ETFs', c: C.etfs },
              { k: 'stock_int', l: 'Stocks', c: C.stock_int },
              { k: 'rf', l: 'RF', c: C.rf },
            ];

            return React.createElement(View, null,
              React.createElement(ScrollView, { horizontal: true, showsHorizontalScrollIndicator: false, style: { marginBottom: 10 }, contentContainerStyle: { gap: 6 } },
                SERIES_PILLS.map(function(sp) {
                  var isOn = perfSeries[sp.k];
                  return React.createElement(TouchableOpacity, {
                    key: sp.k,
                    onPress: function() {
                      var next = {};
                      for (var pk in perfSeries) next[pk] = perfSeries[pk];
                      next[sp.k] = !next[sp.k];
                      setPerfSeries(next);
                    },
                    style: {
                      paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
                      borderWidth: 1, borderColor: isOn ? sp.c : C.border,
                      backgroundColor: isOn ? sp.c + '22' : 'transparent',
                    },
                  },
                    React.createElement(Text, {
                      style: { fontSize: 9, fontFamily: F.mono, fontWeight: '600', color: isOn ? sp.c : C.dim },
                    }, sp.l)
                  );
                })
              ),
              React.createElement(Svg, { width: chartW, height: chartH }, allEls)
            );
          })() : null}
        </Glass>
      ) : null}

      {/* ══════ 6. FILTER PILLS ══════ */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: '600' }}>POSIÇÕES</Text>
        <TouchableOpacity onPress={function() { setInfoModal({ title: 'Posições', text: 'Posições agregadas por ticker com preço médio ponderado. PM = custo médio de compra.' }); }}>
          <Text style={{ fontSize: 13, color: C.accent }}>ⓘ</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        {sub.canAccess('AI_ANALYSIS') ? (
        <TouchableOpacity onPress={function() { setAiConfirmVisible(true); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2, paddingHorizontal: 6 }}
          accessibilityRole="button" accessibilityLabel="Análise IA da carteira">
          <Ionicons name="sparkles" size={16} color={C.accent} />
          <Text style={{ fontSize: 11, fontFamily: F.body, color: C.accent }}>IA</Text>
        </TouchableOpacity>
        ) : null}
        {sub.canAccess('SAVED_ANALYSES') ? (
        <TouchableOpacity onPress={function() { navigation.navigate('AnalisesSalvas'); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2, paddingHorizontal: 6 }}
          accessibilityRole="button" accessibilityLabel="Análises salvas">
          <Ionicons name="bookmark-outline" size={14} color={C.accent} />
        </TouchableOpacity>
        ) : null}
        {sub.canAccess('CSV_IMPORT') ? (
        <TouchableOpacity onPress={function() { navigation.navigate('ImportOperacoes'); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2, paddingHorizontal: 6 }}
          accessibilityRole="button" accessibilityLabel="Importar operações">
          <Ionicons name="cloud-upload-outline" size={16} color={C.accent} />
          <Text style={{ fontSize: 11, fontFamily: F.body, color: C.accent }}>Importar</Text>
        </TouchableOpacity>
        ) : (
        <TouchableOpacity onPress={function() { navigation.navigate('Paywall'); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2, paddingHorizontal: 6, opacity: 0.5 }}
          accessibilityRole="button" accessibilityLabel="Importar operações - requer PRO">
          <Ionicons name="lock-closed" size={14} color={C.dim} />
          <Text style={{ fontSize: 11, fontFamily: F.body, color: C.dim }}>Importar</Text>
        </TouchableOpacity>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, paddingBottom: 2 }}>
        {FILTERS.map(function (f) {
          return (
            <Pill key={f.k} active={filter === f.k} color={f.color}
              onPress={function () { setFilter(f.k); setCorrFilter(null); }}>
              {f.l} ({countCat(f.k)})
            </Pill>
          );
        })}
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, marginBottom: 2 }}>
        {[
          { k: 'valor', l: 'Valor' },
          { k: 'nome', l: 'A-Z' },
          { k: 'var', l: 'Variação' },
          { k: 'pl', l: 'P&L' },
        ].map(function (s) {
          return (
            <TouchableOpacity key={s.k}
              onPress={function () { setSortKey(s.k); }}
              style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
                backgroundColor: sortKey === s.k ? C.accent + '22' : 'transparent' }}>
              <Text style={{ fontSize: 11, fontFamily: F.body,
                color: sortKey === s.k ? C.accent : C.textSecondary }}>
                {s.l}{sortKey === s.k ? (s.k === 'nome' ? ' ↑' : ' ↓') : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {allCorretoras.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingBottom: 2, marginTop: 4 }}>
          <Pill active={!corrFilter} color={C.accent}
            onPress={function () { setCorrFilter(null); }}>
            Todas
          </Pill>
          {allCorretoras.map(function (c) {
            return (
              <Pill key={c} active={corrFilter === c} color={C.accent}
                onPress={function () { setCorrFilter(corrFilter === c ? null : c); }}>
                {c}
              </Pill>
            );
          })}
        </ScrollView>
      ) : null}

      {/* ══════ 10. POSITION CARDS ══════ */}
      {filteredPositions.map(function (pos, i) {
        var key = 'pos_' + pos.ticker + '_' + i;
        var opcoesForTicker = opcoes.filter(function(o) {
          return o.ativo_base && o.ativo_base.toUpperCase() === pos.ticker.toUpperCase();
        });
        return (
          <PositionCard key={key} pos={pos} history={priceHistory[pos.ticker] || null}
            totalCarteira={totalValue} expanded={expanded === key}
            fundamentals={fundamentals[pos.ticker] && fundamentals[pos.ticker] !== false ? fundamentals[pos.ticker] : null}
            fundLoading={!!fundLoading[pos.ticker]}
            opcoesForTicker={opcoesForTicker}
            indicator={indicators[pos.ticker] || null}
            canAccessFund={sub.canAccess('FUNDAMENTALS')}
            portfoliosList={portfoliosList}
            showPortfolioBadge={!portfolioId && portfoliosList.length > 0}
            onAiAnalysis={sub.canAccess('AI_ANALYSIS') ? function () { nav('AssetDetail', { ticker: pos.ticker, mercado: pos.mercado, autoAi: true }); } : null}
            onToggle={function () { toggleExpand(key, pos.ticker, pos.mercado); }}
            onBuy={function () { nav('AddOperacao', { ticker: pos.ticker, tipo: 'compra', categoria: pos.categoria }); }}
            onSell={function () { nav('AddOperacao', { ticker: pos.ticker, tipo: 'venda', categoria: pos.categoria }); }}
            onLancarOpcao={function () { nav('AddOpcao', { ativo_base: pos.ticker }); }}
            onTransacoes={function () { nav('AssetDetail', { ticker: pos.ticker, mercado: pos.mercado }); }}
            tickerMeta={tickerMetas[pos.ticker]}
            totalPortfolio={totalValue}
            tickerValorTotal={corrFilter ? (function() {
              for (var opi = 0; opi < positions.length; opi++) {
                if (positions[opi].ticker === pos.ticker) {
                  var op = positions[opi];
                  var opRef = op.preco_atual != null ? op.preco_atual : (op.mercado === 'INT' ? op.pm * (op.taxa_cambio || op.taxa_cambio_media || 1) : op.pm);
                  return op.quantidade * opRef;
                }
              }
              return 0;
            })() : null}
            onSetMeta={handleSetMeta} />
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
                  onToggle={function () { toggleExpand(key); }}
                  onEdit={function () { nav('EditRendaFixa', { rf: rf }); }}
                  onDelete={function () { handleDeleteRF(rf.id); }} />
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Empty states */}
      {filter === 'rf' && rfAtivos.length === 0 ? (
        <EmptyState ionicon="document-text-outline" title="Nenhum título"
          description="Cadastre seus investimentos de renda fixa."
          cta="Novo título" onCta={function () { nav('AddRendaFixa'); }} color={C.rf} />
      ) : null}
      {filter !== 'todos' && filter !== 'rf' && filteredPositions.length === 0 ? (
        <Glass padding={20}>
          <Text style={{ fontSize: 14, color: C.sub, fontFamily: F.body, textAlign: 'center' }}>
            Nenhum ativo de {(FILTERS.find(function (f) { return f.k === filter; }) || {}).l || filter}
          </Text>
        </Glass>
      ) : null}

      {/* Saldos moved to Gestão > Caixa */}

      {/* ══════ POSIÇÕES ENCERRADAS ══════ */}
      {filter === 'todos' && encerradas.length > 0 ? (
        <View>
          <TouchableOpacity activeOpacity={0.7} onPress={function() { setShowEnc(!showEnc); }}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <SectionLabel>POSIÇÕES ENCERRADAS ({encerradas.length})</SectionLabel>
            <Text style={{ fontSize: 12, color: C.dim, fontFamily: F.body }}>{showEnc ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {showEnc ? (
            <View>
              {encerradas.slice(0, showAllEnc ? encerradas.length : 3).map(function(e, i) {
                var plColor = e.pl_realizado >= 0 ? C.green : C.red;
                var plIcon = e.pl_realizado >= 0 ? '▲' : '▼';
                var plLabel = e.pl_realizado >= 0 ? 'LUCRO' : 'PREJUÍZO';
                var catColor = e.categoria === 'acao' ? C.acoes : e.categoria === 'fii' ? C.fiis : e.categoria === 'etf' ? C.etfs : e.categoria === 'stock_int' ? C.stock_int : C.accent;
                var eIsInt = e.mercado === 'INT';
                var eSymbol = eIsInt ? 'US$' : 'R$';
                var pmCompra = e.total_comprado > 0 ? e.custo_compras / e.total_comprado : 0;
                var pmVenda = e.total_vendido > 0 ? e.receita_vendas / e.total_vendido : 0;
                var plPct = e.custo_compras > 0 ? (e.pl_realizado / e.custo_compras) * 100 : 0;
                return (
                  <Glass key={'enc_' + i} padding={12} style={{ marginTop: i > 0 ? 6 : 0, borderLeftWidth: 3, borderLeftColor: plColor }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, fontFamily: F.display }}>{e.ticker}</Text>
                        <Badge text={e.categoria ? e.categoria.toUpperCase() : ''} color={catColor} />
                        {eIsInt ? <Badge text="INT" color={C.stock_int} /> : null}
                      </View>
                      <Badge text={plLabel} color={plColor} />
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 }}>
                      <Text style={[{ fontSize: 18, fontWeight: '700', color: plColor, fontFamily: F.mono }, ps]}>
                        {e.pl_realizado >= 0 ? '+' : ''}{eSymbol + ' '}{fmt(e.pl_realizado)}
                      </Text>
                      <Text style={[{ fontSize: 13, fontWeight: '600', color: plColor, fontFamily: F.mono }, ps]}>
                        {plIcon} {Math.abs(plPct).toFixed(1)}%
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8,
                      paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border }}>
                      <View>
                        <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>COMPRA</Text>
                        <Text style={[{ fontSize: 12, color: C.sub, fontFamily: F.mono }, ps]}>{e.total_comprado + ' un · PM ' + eSymbol + ' ' + fmt(pmCompra)}</Text>
                        <Text style={[{ fontSize: 11, color: C.dim, fontFamily: F.mono }, ps]}>{'Total ' + eSymbol + ' ' + fmt(e.custo_compras)}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>VENDA</Text>
                        <Text style={[{ fontSize: 12, color: C.sub, fontFamily: F.mono }, ps]}>{e.total_vendido + ' un · PM ' + eSymbol + ' ' + fmt(pmVenda)}</Text>
                        <Text style={[{ fontSize: 11, color: C.dim, fontFamily: F.mono }, ps]}>{'Total ' + eSymbol + ' ' + fmt(e.receita_vendas)}</Text>
                      </View>
                    </View>
                  </Glass>
                );
              })}
              {encerradas.length > 3 ? (
                <TouchableOpacity activeOpacity={0.7}
                  onPress={function() { setShowAllEnc(!showAllEnc); }}
                  style={{ alignSelf: 'center', marginTop: 8, paddingHorizontal: 16, paddingVertical: 6,
                    backgroundColor: C.accent + '12', borderRadius: 8, borderWidth: 1, borderColor: C.accent + '25' }}>
                  <Text style={{ fontSize: 12, color: C.accent, fontFamily: F.body }}>
                    {showAllEnc ? 'Mostrar menos' : 'Ver todas (' + encerradas.length + ')'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={{ height: SIZE.tabBarHeight + 20 }} />

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

      {/* ══════ MAPA DE CALOR FULLSCREEN ══════ */}
      <Modal visible={treemapModalVisible} animationType="fade" transparent={true}
        onRequestClose={function() { setTreemapModal(false); setSelectedTile(null); }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' }}>
          <View style={{ paddingTop: 50, paddingHorizontal: 18, paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, fontFamily: F.display, letterSpacing: 0.6 }}>
              MAPA DE CALOR — EXPOSIÇÃO
            </Text>
            <TouchableOpacity onPress={function () { setTreemapModal(false); setSelectedTile(null); }}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}
              accessibilityRole="button" accessibilityLabel="Fechar mapa de calor">
              <Text style={{ fontSize: 12, color: C.text, fontFamily: F.mono }}>Fechar</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 18, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: C.green, opacity: 0.5 }} />
              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>Alta hoje</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: C.red, opacity: 0.5 }} />
              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>Queda hoje</Text>
            </View>
          </View>
          <View style={{ flex: 1, paddingHorizontal: 12 }}>
            <TreemapChart items={treemapItems} height={Dimensions.get('window').height - 260} onPressTile={function (tile) { setSelectedTile(tile); }} />
          </View>
          {selectedTile ? (
            <View style={{ margin: 12, padding: 12, borderRadius: 10, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: selectedTile.color }} />
                  <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, fontFamily: F.display }}>{selectedTile.ticker}</Text>
                  <Text style={{ fontSize: 11, color: selectedTile.change_day >= 0 ? C.green : C.red, fontWeight: '600', fontFamily: F.mono }}>
                    {selectedTile.change_day >= 0 ? '+' : ''}{selectedTile.change_day.toFixed(2)}% dia
                  </Text>
                </View>
                <TouchableOpacity onPress={function () { setSelectedTile(null); }}>
                  <Text style={{ fontSize: 16, color: C.dim, fontFamily: F.mono }}>✕</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', gap: 20, marginTop: 8 }}>
                <View>
                  <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.3 }}>QUANTIDADE</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: C.text, fontFamily: F.mono, marginTop: 2 }}>
                    {selectedTile.quantidade.toLocaleString('pt-BR')}
                  </Text>
                </View>
                <View>
                  <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.3 }}>PM</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: C.text, fontFamily: F.mono, marginTop: 2 }}>
                    R$ {fmt(selectedTile.pm)}
                  </Text>
                </View>
                <View>
                  <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.3 }}>PREÇO ATUAL</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: C.text, fontFamily: F.mono, marginTop: 2 }}>
                    R$ {fmt(selectedTile.preco_atual)}
                  </Text>
                </View>
                <View>
                  <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.3 }}>P&L</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: selectedTile.pnl >= 0 ? C.green : C.red, fontFamily: F.mono, marginTop: 2 }}>
                    {selectedTile.pnl >= 0 ? '+' : '-'}R$ {fmt(Math.abs(selectedTile.pnl))}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </ScrollView>
    {sub.isAtLimit('positions', positions.length) && !sub.canAccess('POSITIONS_UNLIMITED') ? (
    <View style={{ position: 'absolute', bottom: SIZE.tabBarHeight + 16, right: 18, left: 18, zIndex: 10 }}>
      <UpgradePrompt feature="POSITIONS_UNLIMITED" compact navigation={navigation}
        message={'Limite de ' + positions.length + ' posições atingido'} />
    </View>
    ) : (
    <Fab navigation={navigation} items={
      sub.canAccess('AI_ANALYSIS') ? [
        { label: 'Análise IA', icon: 'sparkles', color: C.accent, onPress: function() { setAiConfirmVisible(true); } },
        { label: 'Operação', icon: 'wallet-outline', color: C.acoes, screen: 'AddOperacao' },
        { label: 'Opção', icon: 'flash-outline', color: C.opcoes, screen: 'AddOpcao' },
        { label: 'Renda Fixa', icon: 'document-text-outline', color: C.rf, screen: 'AddRendaFixa' },
        { label: 'Portfolio', icon: 'folder-outline', color: C.etfs, screen: 'ConfigPortfolios' },
      ] : [
        { label: 'Operação', icon: 'wallet-outline', color: C.acoes, screen: 'AddOperacao' },
        { label: 'Opção', icon: 'flash-outline', color: C.opcoes, screen: 'AddOpcao' },
        { label: 'Provento', icon: 'cash-outline', color: C.fiis, screen: 'AddProvento' },
        { label: 'Renda Fixa', icon: 'document-text-outline', color: C.rf, screen: 'AddRendaFixa' },
        { label: 'Portfolio', icon: 'folder-outline', color: C.etfs, screen: 'ConfigPortfolios' },
      ]
    } />
    )}

    {/* AI Confirm Modal */}
    <AiConfirmModal
      visible={aiConfirmVisible}
      analysisType="Análise da carteira"
      onCancel={function() { setAiConfirmVisible(false); }}
      onConfirm={function() { setAiConfirmVisible(false); handleAiCarteira(); }}
    />

    {/* AI Modal */}
    <AiAnalysisModal
      visible={aiModalVisible}
      onClose={function() { setAiModalVisible(false); }}
      result={aiResult}
      loading={aiLoading}
      error={aiError}
      type="carteira"
      title="Análise da Carteira"
      usage={aiUsage}
      onSave={sub.canAccess('SAVED_ANALYSES') ? handleSaveAiCarteira : undefined}
      saving={aiSaving}
    />
    </View>
  );
}

// ══════════ STYLES ══════════
var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 18, gap: SIZE.gap },

  // Hero
  heroLabel: { fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 0.6 },
  heroValue: { fontSize: 24, fontWeight: '800', color: C.text, fontFamily: F.display, marginTop: 2, letterSpacing: -0.5 },
  heroPL: { fontSize: 18, fontWeight: '700', fontFamily: F.mono, marginTop: 2 },
  heroPLSub: { fontSize: 11, fontFamily: F.mono, marginTop: 1 },
  heroStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border },
  heroStatLabel: { fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 },
  heroStatVal: { fontSize: 13, fontWeight: '700', fontFamily: F.mono, marginTop: 1 },

  // Section
  sectionTitle2: { fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 0.6, marginBottom: 10 },

  // Donut center
  donutCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },

  // HBar
  hbarRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  hbarLabel: { width: 60, fontSize: 10, color: C.sub, fontWeight: '600', fontFamily: F.mono },
  hbarTrack: { flex: 1, height: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.03)' },
  hbarFill: { height: 12, borderRadius: 6, borderWidth: 1, minWidth: 4 },
  hbarValue: { width: 55, fontSize: 10, fontWeight: '700', fontFamily: F.mono, textAlign: 'right' },

  // Cards
  cardRow1: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardRow1Left: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  cardRow2: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  cardTicker: { fontSize: 14, fontWeight: '700', color: C.text, fontFamily: F.display },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  typeBadgeText: { fontSize: 10, fontWeight: '600', fontFamily: F.mono },
  cardCorretora: { fontSize: 10, color: C.dim, fontFamily: F.mono },
  cardPL: { fontSize: 13, fontWeight: '700', fontFamily: F.mono },
  cardPLPct: { fontSize: 11, fontFamily: F.mono, marginTop: 1 },
  cardPriceMain: { fontSize: 13, color: C.text, fontWeight: '600', fontFamily: F.mono },
  cardPriceSub: { fontSize: 11, color: C.dim, fontFamily: F.mono },
  cardDayVar: { fontSize: 11, fontWeight: '600', fontFamily: F.mono, marginTop: 2 },
  sparkWrap: { width: '32%', flexShrink: 0 },

  // Expanded
  expandedWrap: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border },
  expandedStats: { flexDirection: 'row', justifyContent: 'space-between' },
  expandedStatItem: { alignItems: 'center', flex: 1 },
  expandedStatLabel: { fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.3 },
  expandedStatValue: { fontSize: 12, color: C.sub, fontWeight: '600', fontFamily: F.mono, marginTop: 2 },
  expandedActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  actionBtnText: { fontSize: 13, fontWeight: '600', fontFamily: F.body },

  // Broker/Saldos
  brokerIcon: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  brokerIconText: { fontSize: 10, fontWeight: '700', fontFamily: F.mono },
  saldoName: { fontSize: 13, fontWeight: '600', color: C.text, fontFamily: F.display },
  saldoValue: { fontSize: 14, fontWeight: '700', fontFamily: F.mono },
});
