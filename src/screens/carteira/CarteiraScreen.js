import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, ActivityIndicator,
  Alert, TextInput, Modal, Dimensions,
} from 'react-native';
import { animateLayout } from '../../utils/a11y';
var dateUtils = require('../../utils/dateUtils');
var parseLocalDate = dateUtils.parseLocalDate;
var formatDateBR = dateUtils.formatDateBR;
var fractional = require('../../utils/fractional');
var formatQty = fractional.formatQty;
var decMul = fractional.decMul;
import Svg, {
  Circle as SvgCircle, Path, Defs, LinearGradient as SvgGrad, ClipPath,
  Stop, Line as SvgLine, Rect as SvgRect, G, Text as SvgText,
} from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { C, F, SIZE, PRODUCT_COLORS } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { useCarteira, useFinancas, useAppStore } from '../../contexts/AppStoreContext';
import { getPositions, deleteRendaFixa, getIndicatorByTicker, addSavedAnalysis, getPatrimonioSnapshots, getProfile, getRebalanceTargets, upsertRebalanceTargets } from '../../services/database';
import { fetchFundamentals } from '../../services/fundamentalService';
import { fetchPriceHistory, fetchHistoryRouted, fetchPriceHistoryLong, fetchPriceHistoryRange, clearPriceCache, getLastPriceUpdate, fetchTickerProfile } from '../../services/priceService';
import { fetchExchangeRates, convertToBRL, getSymbol } from '../../services/currencyService';
import { Glass, Badge, Pill, SectionLabel, InfoTip, PressableCard, FundamentalAccordion, Fab, UpgradePrompt, AiAnalysisModal, AiConfirmModal } from '../../components';
import InteractiveChart, { MiniLineChart } from '../../components/InteractiveChart';
import Toast from 'react-native-toast-message';
import { SkeletonCarteira, EmptyState } from '../../components/States';
import Sensitive, { usePrivacyStyle } from '../../components/Sensitive';
import { useSubscription } from '../../contexts/SubscriptionContext';
var geminiService = require('../../services/geminiService');
var TICKER_SECTORS = require('../../constants/tickerSectors').TICKER_SECTORS;
var rebalUtils = require('../../utils/rebalance');
var classifyMarketCap = rebalUtils.classifyMarketCap;
var CAP_COLORS = rebalUtils.CAP_COLORS;
var CAP_ORDER = rebalUtils.CAP_ORDER;
var PROFILES = rebalUtils.PROFILES;
var computeAporteSuggestions = rebalUtils.computeAporteSuggestions;
var computeAccuracy = rebalUtils.computeAccuracy;
var FII_REBAL_MAP = rebalUtils.FII_REBAL_MAP;
var redistribute = rebalUtils.redistribute;

// ══════════ HELPERS ══════════
var FILTERS = [
  { k: 'todos', l: 'Todos', color: C.accent },
  { k: 'acoes', l: 'Ações', cat: 'acao', color: C.acoes },
  { k: 'fiis', l: 'FIIs', cat: 'fii', color: C.fiis },
  { k: 'etfs', l: 'ETFs', cat: 'etf', color: C.etfs },
  { k: 'etfs_int', l: 'ETFs INT', cat: 'etf_int', color: C.etfs_int },
  { k: 'bdrs', l: 'BDRs', cat: 'bdr', color: C.bdr },
  { k: 'stocks_int', l: 'Stocks', cat: 'stock_int', color: C.stock_int },
  { k: 'adrs', l: 'ADRs', cat: 'adr', color: C.adr },
  { k: 'reits', l: 'REITs', cat: 'reit', color: C.reit },
  { k: 'rf', l: 'RF', color: C.rf },
];
var CAT_LABELS = { acao: 'Ação', fii: 'FII', etf: 'ETF', etf_int: 'ETF INT', opcao: 'Opção', stock_int: 'Stock', bdr: 'BDR', adr: 'ADR', reit: 'REIT' };
var CAT_NAMES = { acao: 'Ações', fii: 'FIIs', etf: 'ETFs', etf_int: 'ETFs INT', stock_int: 'Stocks', bdr: 'BDRs', adr: 'ADRs', reit: 'REITs', rf: 'RF' };
var TIPO_LABELS = {
  cdb: 'CDB', lci_lca: 'LCI/LCA', tesouro_selic: 'Tesouro Selic',
  tesouro_ipca: 'Tesouro IPCA+', tesouro_pre: 'Tesouro Pré', debenture: 'Debênture',
};
var IDX_COLORS = { prefixado: C.green, cdi: C.accent, ipca: C.fiis, selic: C.opcoes };

// Mapeamento brapi sector/industry → setor/segmento BR (fallback para tickers nao no mapa estatico)
var _BRAPI_SECTOR_MAP = {
  'Financial Services': { setor: 'Financeiro', segmento: 'Financeiro' },
  'Energy': { setor: 'Petroleo', segmento: 'Petroleo' },
  'Basic Materials': { setor: 'Mineracao', segmento: 'Materiais' },
  'Consumer Cyclical': { setor: 'Varejo', segmento: 'Varejo' },
  'Consumer Defensive': { setor: 'Consumo', segmento: 'Consumo' },
  'Healthcare': { setor: 'Saude', segmento: 'Saude' },
  'Technology': { setor: 'Tecnologia', segmento: 'Tecnologia' },
  'Communication Services': { setor: 'Telecom', segmento: 'Telecom' },
  'Utilities': { setor: 'Energia', segmento: 'Energia' },
  'Industrials': { setor: 'Industria', segmento: 'Industria' },
  'Real Estate': { setor: 'Construcao', segmento: 'Construcao' },
};
function _mapBrapiSector(sector, industry) {
  if (industry) {
    if (industry.indexOf('Steel') >= 0) return { setor: 'Siderurgia', segmento: 'Siderurgia' };
    if (industry.indexOf('Mining') >= 0 || industry.indexOf('Gold') >= 0) return { setor: 'Mineracao', segmento: 'Mineracao' };
    if (industry.indexOf('Oil') >= 0 || industry.indexOf('Gas') >= 0) return { setor: 'Petroleo', segmento: 'Petroleo' };
    if (industry.indexOf('Pulp') >= 0 || industry.indexOf('Paper') >= 0) return { setor: 'Papel/Celulose', segmento: 'Celulose' };
    if (industry.indexOf('Chemical') >= 0 || industry.indexOf('Specialty Chemical') >= 0) return { setor: 'Quimica', segmento: 'Petroquimica' };
    if (industry.indexOf('Airlines') >= 0 || industry.indexOf('Airport') >= 0) return { setor: 'Transporte', segmento: 'Aereo' };
    if (industry.indexOf('Railroads') >= 0 || industry.indexOf('Trucking') >= 0) return { setor: 'Transporte', segmento: 'Ferroviario' };
    if (industry.indexOf('Electric') >= 0 || industry.indexOf('Utilities') >= 0 || industry.indexOf('Renewable') >= 0) return { setor: 'Energia', segmento: 'Energia' };
    if (industry.indexOf('Water') >= 0) return { setor: 'Saneamento', segmento: 'Saneamento' };
    if (industry.indexOf('Bank') >= 0) return { setor: 'Financeiro', segmento: 'Bancos' };
    if (industry.indexOf('Insurance') >= 0) return { setor: 'Financeiro', segmento: 'Seguros' };
    if (industry.indexOf('Capital Markets') >= 0) return { setor: 'Financeiro', segmento: 'Investimentos' };
    if (industry.indexOf('Pharmaceutical') >= 0 || industry.indexOf('Drug') >= 0) return { setor: 'Saude', segmento: 'Farmaceutica' };
    if (industry.indexOf('Medical') >= 0 || industry.indexOf('Health') >= 0 || industry.indexOf('Dental') >= 0) return { setor: 'Saude', segmento: 'Saude' };
    if (industry.indexOf('Residential') >= 0 || industry.indexOf('Real Estate') >= 0) return { setor: 'Construcao', segmento: 'Incorporacao' };
    if (industry.indexOf('Packaged Foods') >= 0 || industry.indexOf('Farm') >= 0 || industry.indexOf('Beverages') >= 0) return { setor: 'Consumo', segmento: 'Alimentos' };
    if (industry.indexOf('Meat') >= 0) return { setor: 'Consumo', segmento: 'Frigorificos' };
    if (industry.indexOf('Apparel') >= 0 || industry.indexOf('Luxury') >= 0 || industry.indexOf('Footwear') >= 0) return { setor: 'Varejo', segmento: 'Moda' };
    if (industry.indexOf('Grocery') >= 0 || industry.indexOf('Department') >= 0) return { setor: 'Varejo', segmento: 'Supermercados' };
    if (industry.indexOf('Retail') >= 0 || industry.indexOf('Specialty') >= 0) return { setor: 'Varejo', segmento: 'Varejo' };
    if (industry.indexOf('Rental') >= 0 || industry.indexOf('Leasing') >= 0) return { setor: 'Varejo', segmento: 'Locacao' };
    if (industry.indexOf('Telecom') >= 0) return { setor: 'Telecom', segmento: 'Telecom' };
    if (industry.indexOf('Software') >= 0 || industry.indexOf('Internet') >= 0) return { setor: 'Tecnologia', segmento: 'Tecnologia' };
    if (industry.indexOf('Education') >= 0) return { setor: 'Educacao', segmento: 'Educacao' };
    if (industry.indexOf('Tobacco') >= 0 || industry.indexOf('Personal') >= 0 || industry.indexOf('Household') >= 0) return { setor: 'Consumo', segmento: 'Consumo' };
    if (industry.indexOf('Engineering') >= 0 || industry.indexOf('Construction') >= 0) return { setor: 'Construcao', segmento: 'Engenharia' };
    if (industry.indexOf('Aero') >= 0 || industry.indexOf('Defense') >= 0) return { setor: 'Industria', segmento: 'Aeronautica' };
    if (industry.indexOf('Auto') >= 0) return { setor: 'Industria', segmento: 'Autopeças' };
    if (industry.indexOf('Agricultural') >= 0) return { setor: 'Consumo', segmento: 'Agronegocio' };
  }
  return _BRAPI_SECTOR_MAP[sector] || null;
}

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
  var onComparar = props.onComparar;
  var onAlerta = props.onAlerta;
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
  var metaTotalPct = props.metaTotalPct || 0;
  var onNavigateRebal = props.onNavigateRebal;
  var totalPortfolio = props.totalPortfolio || 0;
  var tickerValorTotal = props.tickerValorTotal;
  var typeTotal = props.typeTotal;
  var typeLabel = props.typeLabel;
  var ps = usePrivacyStyle();
  var _metaEditing = useState(false); var metaEditing = _metaEditing[0]; var setMetaEditing = _metaEditing[1];
  var _metaInput = useState(''); var metaInput = _metaInput[0]; var setMetaInput = _metaInput[1];

  var posIsInt = pos.mercado === 'INT';
  var displayCat = posIsInt && pos.categoria === 'etf' ? 'etf_int' : pos.categoria;
  var color = PRODUCT_COLORS[pos.categoria] || C.accent;
  var catLabel = CAT_LABELS[displayCat] || CAT_LABELS[pos.categoria] || (pos.categoria || '').toUpperCase();
  var posSymbol = posIsInt ? 'US$' : 'R$';
  var hasPrice = pos.preco_atual != null;
  // taxa de cambio: enrichment (atual) > media historica das operacoes > 1
  var fxRate = pos.taxa_cambio || pos.taxa_cambio_media || 1;
  // Para INT: preco_atual ja esta em BRL (enrichPositionsWithPrices converte)
  var precoRef = hasPrice ? pos.preco_atual : (posIsInt && pos.pm ? decMul(pos.pm, fxRate) : pos.pm);
  var valorAtual = decMul(pos.quantidade, precoRef);
  var custoTotal = posIsInt ? decMul(decMul(pos.quantidade, pos.pm), fxRate) : decMul(pos.quantidade, pos.pm);
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
            {pos.mercado === 'INT' && displayCat !== 'etf_int' ? (
              <View style={[styles.typeBadge, { backgroundColor: C.stock_int + '14' }]}>
                <Text style={[styles.typeBadgeText, { color: C.stock_int }]}>INT</Text>
              </View>
            ) : pos.categoria === 'etf' && pos.mercado !== 'INT' ? (
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
                {formatQty(pos.quantidade)}
              </Text>
            </View>
          </View>
          {sparkData.length >= 2 ? (
            <View style={styles.sparkWrap}>
              <MiniLineChart data={sparkData} color={color} height={22} />
            </View>
          ) : null}
        </View>

        {/* Row 3: Valor total + % + P&L */}
        <View style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: C.border + '30' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>TOTAL</Text>
              <Text style={[{ fontSize: 14, fontWeight: '700', color: C.text, fontFamily: F.mono }, ps]}>
                {'R$ ' + fmt(valorAtual)}
              </Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>% CART.</Text>
              <Text style={[{ fontSize: 13, fontWeight: '600', color: C.accent, fontFamily: F.mono }, ps]}>
                {pctCarteira.toFixed(1) + '%'}
              </Text>
            </View>
            {typeTotal != null && typeTotal > 0 ? (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>{'% ' + (typeLabel || '').toUpperCase()}</Text>
                <Text style={[{ fontSize: 13, fontWeight: '600', color: color, fontFamily: F.mono }, ps]}>
                  {(typeTotal > 0 ? (valorAtual / typeTotal * 100).toFixed(1) : '0.0') + '%'}
                </Text>
              </View>
            ) : null}
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>P&L</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={[{ fontSize: 13, fontWeight: '700', color: pnlColor, fontFamily: F.mono }, ps]}>
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
        </View>

        {/* ▶ META BAR — visível sempre (colapsado e expandido) */}
        {(function() {
          var metaValorRef2 = tickerValorTotal != null ? tickerValorTotal : valorAtual;
          var pctAtual2 = totalPortfolio > 0 ? (metaValorRef2 / totalPortfolio) * 100 : 0;
          var hasMeta2 = tickerMeta != null && tickerMeta !== '';
          var metaVal2 = hasMeta2 ? parseFloat(tickerMeta) : 0;
          var diff2 = hasMeta2 ? pctAtual2 - metaVal2 : 0;
          var diffColor2 = Math.abs(diff2) < 0.5 ? C.green : diff2 > 0 ? C.etfs : C.red;
          var barPct = hasMeta2 && metaVal2 > 0 ? Math.min(100, (pctAtual2 / metaVal2) * 100) : 0;
          // Colapsado: só mostrar se tem meta definida. Expandido: sempre mostrar.
          if (!expanded && !hasMeta2) return null;
          return (
            <View style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: C.border + '30' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="flag" size={12} color={C.etfs} />
                  <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body }}>Alocação</Text>
                  <Text style={{ fontSize: 11, color: C.text, fontFamily: F.mono, fontWeight: '600' }}>{pctAtual2.toFixed(1) + '%'}</Text>
                  {metaEditing ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Ionicons name="arrow-forward" size={9} color={C.dim} />
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                        <TextInput
                          style={{ width: 42, height: 22, borderRadius: 5, borderWidth: 1, borderColor: C.etfs + '60',
                            backgroundColor: C.bg, color: C.text, fontSize: 11, fontFamily: F.mono, textAlign: 'center', paddingVertical: 0 }}
                          value={metaInput}
                          onChangeText={setMetaInput}
                          keyboardType="decimal-pad"
                          autoFocus
                          maxLength={5}
                          returnKeyType="done"
                          onSubmitEditing={function() {
                            var v = metaInput.replace(',', '.');
                            if (v === '' || isNaN(parseFloat(v))) {
                              if (onSetMeta) onSetMeta(pos.ticker, null, pos.categoria);
                            } else {
                              if (onSetMeta) onSetMeta(pos.ticker, parseFloat(v), pos.categoria);
                            }
                            setMetaEditing(false);
                          }}
                          onBlur={function() {
                            var v = metaInput.replace(',', '.');
                            if (v === '' || isNaN(parseFloat(v))) {
                              if (onSetMeta) onSetMeta(pos.ticker, null, pos.categoria);
                            } else {
                              if (onSetMeta) onSetMeta(pos.ticker, parseFloat(v), pos.categoria);
                            }
                            setMetaEditing(false);
                          }}
                        />
                        <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>%</Text>
                      </View>
                    </View>
                  ) : hasMeta2 ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Ionicons name="arrow-forward" size={9} color={C.dim} />
                      <TouchableOpacity onPress={function() { setMetaInput(String(metaVal2)); setMetaEditing(true); }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                        <Text style={{ fontSize: 11, color: C.etfs, fontFamily: F.mono, fontWeight: '600' }}>{metaVal2.toFixed(1) + '%'}</Text>
                        <Ionicons name="pencil-outline" size={9} color={C.dim} />
                      </TouchableOpacity>
                    </View>
                  ) : expanded ? (
                    <TouchableOpacity onPress={function() { setMetaInput(''); setMetaEditing(true); }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Ionicons name="add-circle-outline" size={12} color={C.dim} />
                      <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body }}>Definir meta</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {hasMeta2 && !metaEditing ? (
                  <Text style={{ fontSize: 11, fontFamily: F.mono, fontWeight: '600', color: diffColor2 }}>
                    {(diff2 >= 0 ? '+' : '') + diff2.toFixed(1) + '%'}
                  </Text>
                ) : null}
              </View>
              {hasMeta2 && metaVal2 > 0 ? (
                <View style={{ height: 3, backgroundColor: C.border + '40', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                  <View style={{ height: 3, borderRadius: 2, backgroundColor: diffColor2, width: barPct + '%' }} />
                </View>
              ) : null}
              {metaEditing ? (function() {
                var metaRestTicker = 100 - metaTotalPct;
                var restColorTicker = Math.abs(metaRestTicker) < 0.5 ? C.green : metaRestTicker > 0 ? C.yellow : C.red;
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 3 }}>
                    <Text style={{ fontSize: 9, fontFamily: F.mono, color: C.dim }}>
                      {'Alocado ' + metaTotalPct.toFixed(0) + '%'}
                    </Text>
                    <Text style={{ fontSize: 9, fontFamily: F.mono, fontWeight: '600', color: restColorTicker }}>
                      {Math.abs(metaRestTicker) < 0.5 ? '= 100%' : (metaRestTicker > 0 ? 'Falta ' : 'Excede ') + Math.abs(metaRestTicker).toFixed(1) + '%'}
                    </Text>
                  </View>
                );
              })() : null}
            </View>
          );
        })()}

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
                  {renderDesempenhoMetric(posIsInt ? 'Custo (US$)' : 'Custo total', posIsInt ? 'US$ ' + fmt(decMul(pos.quantidade, pos.pm)) : 'R$ ' + custoTotal.toLocaleString('pt-BR', { maximumFractionDigits: 0 }), C.sub)}
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
                        <Pill key={p} active={chartPeriod === p}
                          onPress={function() { handleChartPeriod(p); }}
                          color={color}>{lbl}</Pill>
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
              {onComparar ? (
                <TouchableOpacity style={[styles.actionBtn, { borderColor: C.etfs + '30', backgroundColor: C.etfs + '08' }]}
                  onPress={onComparar} accessibilityRole="button" accessibilityLabel="Comparar">
                  <Text style={[styles.actionBtnText, { color: C.etfs }]}>Comparar</Text>
                </TouchableOpacity>
              ) : null}
              {onAlerta ? (
                <TouchableOpacity style={[styles.actionBtn, { borderColor: C.yellow + '30', backgroundColor: C.yellow + '08' }]}
                  onPress={onAlerta} accessibilityRole="button" accessibilityLabel="Alerta">
                  <Text style={[styles.actionBtnText, { color: C.yellow }]}>Alerta</Text>
                </TouchableOpacity>
              ) : null}
            </View>
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
  var user = useAuth().user;
  var ps = usePrivacyStyle();
  var sub = useSubscription();
  var _navigating = useRef(false);

  // Store hooks — dados centralizados
  var carteira = useCarteira();
  var financas = useFinancas();
  var store = useAppStore();
  var positions = carteira.positions;
  var encerradas = carteira.encerradas;
  var opcoes = carteira.opcoes;
  var rfItems = carteira.rf;
  var saldos = financas.saldos;
  var portfolioId = carteira.selectedPortfolio;
  var portfoliosList = carteira.portfolios;
  var loading = carteira.loading;
  var pricesLoading = carteira.loadingPrices;

  useFocusEffect(useCallback(function() { _navigating.current = false; }, []));

  function nav(screen, params) {
    if (_navigating.current) return;
    _navigating.current = true;
    navigation.navigate(screen, params);
  }

  var _fxRates = useState({ BRL: 1 }); var fxRates = _fxRates[0]; var setFxRates = _fxRates[1];
  var _fil = useState('todos'); var filter = _fil[0]; var setFilter = _fil[1];
  var _sort = useState('valor'); var sortKey = _sort[0]; var setSortKey = _sort[1];
  var _groupBy = useState('flat'); var groupBy = _groupBy[0]; var setGroupBy = _groupBy[1];
  var _sectorMetas = useState({}); var sectorMetas = _sectorMetas[0]; var setSectorMetas = _sectorMetas[1];
  var _editingSector = useState(null); var editingSector = _editingSector[0]; var setEditingSector = _editingSector[1];
  var _sectorMetaInput = useState(''); var sectorMetaInput = _sectorMetaInput[0]; var setSectorMetaInput = _sectorMetaInput[1];
  var _corrFilter = useState(null); var corrFilter = _corrFilter[0]; var setCorrFilter = _corrFilter[1];
  var _ref = useState(false); var refreshing = _ref[0]; var setRefreshing = _ref[1];
  var _hist = useState({}); var priceHistory = _hist[0]; var setPriceHistory = _hist[1];
  var _exp = useState(null); var expanded = _exp[0]; var setExpanded = _exp[1];
  var _infoModal = useState(null); var infoModal = _infoModal[0]; var setInfoModal = _infoModal[1];
  var _showEnc = useState(false); var showEnc = _showEnc[0]; var setShowEnc = _showEnc[1];
  var _showAllEnc = useState(false); var showAllEnc = _showAllEnc[0]; var setShowAllEnc = _showAllEnc[1];
  var _loadError = useState(false); var loadError = _loadError[0]; var setLoadError = _loadError[1];
  var _selTile = useState(null); var selectedTile = _selTile[0]; var setSelectedTile = _selTile[1];
  var _treemapModal = useState(false); var treemapModalVisible = _treemapModal[0]; var setTreemapModal = _treemapModal[1];
  var _showSaldosDD = useState(false); var showSaldosDD = _showSaldosDD[0]; var setShowSaldosDD = _showSaldosDD[1];
  var _fund = useState({}); var fundamentals = _fund[0]; var setFundamentals = _fund[1];
  var _fundL = useState({}); var fundLoading = _fundL[0]; var setFundLoading = _fundL[1];
  var _indic = useState({}); var indicators = _indic[0]; var setIndicators = _indic[1];
  var _aiModalVisible = useState(false); var aiModalVisible = _aiModalVisible[0]; var setAiModalVisible = _aiModalVisible[1];
  var _aiResult = useState(null); var aiResult = _aiResult[0]; var setAiResult = _aiResult[1];
  var _aiLoading = useState(false); var aiLoading = _aiLoading[0]; var setAiLoading = _aiLoading[1];
  var _aiError = useState(null); var aiError = _aiError[0]; var setAiError = _aiError[1];
  var _aiUsage = useState(null); var aiUsage = _aiUsage[0]; var setAiUsage = _aiUsage[1];
  var _aiSaving = useState(false); var aiSaving = _aiSaving[0]; var setAiSaving = _aiSaving[1];
  var _aiConfirmVisible = useState(false); var aiConfirmVisible = _aiConfirmVisible[0]; var setAiConfirmVisible = _aiConfirmVisible[1];
  var _pendingAiCard = useState(null); var pendingAiCard = _pendingAiCard[0]; var setPendingAiCard = _pendingAiCard[1];
  var _snapshots = useState([]); var snapshots = _snapshots[0]; var setSnapshots = _snapshots[1];
  var _selicRate = useState(13.25); var selicRate = _selicRate[0]; var setSelicRate = _selicRate[1];
  var _ibovHist = useState([]); var ibovHist = _ibovHist[0]; var setIbovHist = _ibovHist[1];
  var _perfSeries = useState({ cart: true, cdi: true, ibov: true, ipca: false, acao: false, fii: false, etf: false, stock_int: false, rf: false });
  var perfSeries = _perfSeries[0]; var setPerfSeries = _perfSeries[1];
  var _showPerfChart = useState(true); var showPerfChart = _showPerfChart[0]; var setShowPerfChart = _showPerfChart[1];
  var _perfSelIdx = useState(-1); var perfSelIdx = _perfSelIdx[0]; var setPerfSelIdx = _perfSelIdx[1];
  var _perfFullscreen = useState(false); var perfFullscreen = _perfFullscreen[0]; var setPerfFullscreen = _perfFullscreen[1];
  var _screenDims = useState({ w: Dimensions.get('window').width, h: Dimensions.get('window').height });
  var screenDims = _screenDims[0]; var setScreenDims = _screenDims[1];
  var _familyBreakdown = useState(null); var familyBreakdown = _familyBreakdown[0]; var setFamilyBreakdown = _familyBreakdown[1];
  var _tickerMetas = useState({}); var tickerMetas = _tickerMetas[0]; var setTickerMetas = _tickerMetas[1];
  var _rebalTargetsRef = useRef(null);
  var _segmentoMetas = useState({}); var segmentoMetas = _segmentoMetas[0]; var setSegmentoMetas = _segmentoMetas[1];
  var _capMetas = useState({}); var capMetas = _capMetas[0]; var setCapMetas = _capMetas[1];
  var _classMetas = useState({}); var classMetas = _classMetas[0]; var setClassMetas = _classMetas[1];
  var _editingClass = useState(null); var editingClass = _editingClass[0]; var setEditingClass = _editingClass[1];
  var _classMetaInput = useState(''); var classMetaInput = _classMetaInput[0]; var setClassMetaInput = _classMetaInput[1];
  var _editingGroup = useState(null); var editingGroup = _editingGroup[0]; var setEditingGroup = _editingGroup[1];
  var _groupMetaInput = useState(''); var groupMetaInput = _groupMetaInput[0]; var setGroupMetaInput = _groupMetaInput[1];
  var _showProfiles = useState(false); var showProfiles = _showProfiles[0]; var setShowProfiles = _showProfiles[1];
  var _aporteText = useState(''); var aporteText = _aporteText[0]; var setAporteText = _aporteText[1];
  var _showAporte = useState(false); var showAporte = _showAporte[0]; var setShowAporte = _showAporte[1];
  var _wishlistInput = useState(''); var wishlistInput = _wishlistInput[0]; var setWishlistInput = _wishlistInput[1];
  var _selAllocSeg = useState(null); var selAllocSeg = _selAllocSeg[0]; var setSelAllocSeg = _selAllocSeg[1];
  var _expandedGroups = useState({}); var expandedGroups = _expandedGroups[0]; var setExpandedGroups = _expandedGroups[1];
  var _wishlistTickers = useState([]); var wishlistTickers = _wishlistTickers[0]; var setWishlistTickers = _wishlistTickers[1];

  // Totais de alocação derivados das metas
  var metaTotalPct = 0;
  var metaTickerCount = 0;
  var metaKeys = Object.keys(tickerMetas);
  for (var mi = 0; mi < metaKeys.length; mi++) {
    var mVal = parseFloat(tickerMetas[metaKeys[mi]]);
    if (!isNaN(mVal)) {
      metaTotalPct = metaTotalPct + mVal;
      metaTickerCount = metaTickerCount + 1;
    }
  }
  var metaRemainingPct = 100 - metaTotalPct;

  // Helper: persistir sector_targets mantendo keys reservadas (_cap, _segmento, _capGroup)
  var _persistSectorTargets = function(sectorFlat, segmentoObj, capGroupObj) {
    var existing = _rebalTargetsRef.current || {};
    var stFull = {};
    var exST = existing.sector_targets || {};
    var exSTKeys = Object.keys(exST);
    for (var ei = 0; ei < exSTKeys.length; ei++) {
      if (exSTKeys[ei].charAt(0) === '_') stFull[exSTKeys[ei]] = exST[exSTKeys[ei]];
    }
    if (sectorFlat) {
      var sfKeys = Object.keys(sectorFlat);
      for (var sfi = 0; sfi < sfKeys.length; sfi++) { stFull[sfKeys[sfi]] = sectorFlat[sfKeys[sfi]]; }
    }
    if (segmentoObj !== undefined) stFull._segmento = segmentoObj;
    if (capGroupObj !== undefined) stFull._capGroup = capGroupObj;
    upsertRebalanceTargets(user.id, {
      class_targets: existing.class_targets || {},
      sector_targets: stFull,
      ticker_targets: existing.ticker_targets || {},
    }).catch(function() {});
  };

  var handleSetMeta = function(ticker, pct, categoria) {
    var numPct = (pct === null || pct === '' || isNaN(pct)) ? null : parseFloat(pct);
    var newMetas = {};
    var mKeys = Object.keys(tickerMetas);
    for (var mk = 0; mk < mKeys.length; mk++) { newMetas[mKeys[mk]] = tickerMetas[mKeys[mk]]; }
    if (numPct === null) {
      delete newMetas[ticker];
    } else {
      newMetas[ticker] = numPct;
    }
    setTickerMetas(newMetas);
    // Persist
    var existing = _rebalTargetsRef.current || {};
    var tt = existing.ticker_targets || {};
    var ttCopy = {};
    var ttKeys = Object.keys(tt);
    for (var tk = 0; tk < ttKeys.length; tk++) { ttCopy[ttKeys[tk]] = tt[ttKeys[tk]]; }
    ttCopy._flat = newMetas;
    if (categoria) {
      var catKey = categoria + ':_flat';
      var catFlat = {};
      var cfKeys = ttCopy[catKey] ? Object.keys(ttCopy[catKey]) : [];
      for (var ci = 0; ci < cfKeys.length; ci++) { catFlat[cfKeys[ci]] = ttCopy[catKey][cfKeys[ci]]; }
      if (numPct === null) {
        delete catFlat[ticker];
      } else {
        catFlat[ticker] = numPct;
      }
      ttCopy[catKey] = catFlat;
    }
    upsertRebalanceTargets(user.id, {
      class_targets: existing.class_targets || {},
      sector_targets: existing.sector_targets || {},
      ticker_targets: ttCopy,
    }).catch(function() {});
  };

  var handleSetSectorMeta = function(setor, pct) {
    var numPct = (pct === null || pct === '' || isNaN(pct)) ? null : parseFloat(pct);
    var newSM = {};
    var smKeys = Object.keys(sectorMetas);
    for (var si = 0; si < smKeys.length; si++) { newSM[smKeys[si]] = sectorMetas[smKeys[si]]; }
    if (numPct === null) {
      delete newSM[setor];
    } else {
      newSM[setor] = numPct;
    }
    setSectorMetas(newSM);
    _persistSectorTargets(newSM, undefined, undefined);
  };

  var handleSetSegmentoMeta = function(segmento, pct) {
    var numPct = (pct === null || pct === '' || isNaN(pct)) ? null : parseFloat(pct);
    var newSeg = {};
    var segKeys = Object.keys(segmentoMetas);
    for (var si = 0; si < segKeys.length; si++) { newSeg[segKeys[si]] = segmentoMetas[segKeys[si]]; }
    if (numPct === null) {
      delete newSeg[segmento];
    } else {
      newSeg[segmento] = numPct;
    }
    setSegmentoMetas(newSeg);
    _persistSectorTargets(null, newSeg, undefined);
  };

  var handleSetCapGroupMeta = function(capLabel, pct) {
    var numPct = (pct === null || pct === '' || isNaN(pct)) ? null : parseFloat(pct);
    var newCap = {};
    var capKeys = Object.keys(capMetas);
    for (var ci = 0; ci < capKeys.length; ci++) { newCap[capKeys[ci]] = capMetas[capKeys[ci]]; }
    if (numPct === null) {
      delete newCap[capLabel];
    } else {
      newCap[capLabel] = numPct;
    }
    setCapMetas(newCap);
    _persistSectorTargets(null, undefined, newCap);
  };

  var handleSetClassMeta = function(cat, pct) {
    var numPct = (pct === null || pct === '' || isNaN(pct)) ? null : parseFloat(pct);
    var newCM = {};
    var cmKeys = Object.keys(classMetas);
    for (var ci = 0; ci < cmKeys.length; ci++) { newCM[cmKeys[ci]] = classMetas[cmKeys[ci]]; }
    if (numPct === null) {
      delete newCM[cat];
    } else {
      newCM[cat] = numPct;
    }
    setClassMetas(newCM);
    var existing = _rebalTargetsRef.current || {};
    upsertRebalanceTargets(user.id, {
      class_targets: newCM,
      sector_targets: existing.sector_targets || {},
      ticker_targets: existing.ticker_targets || {},
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

  // Dados locais que nao vem do store (screen-specific)
  var loadLocalData = function() {
    if (!user) return Promise.resolve();
    setLoadError(false);

    // Cambio para saldos multi-moeda
    var saldosArr = saldos;
    var moedasEstr = [];
    for (var mi2 = 0; mi2 < saldosArr.length; mi2++) {
      var m2 = saldosArr[mi2].moeda || 'BRL';
      if (m2 !== 'BRL' && moedasEstr.indexOf(m2) === -1) { moedasEstr.push(m2); }
    }
    if (moedasEstr.length > 0) {
      fetchExchangeRates(moedasEstr).then(function(rates) {
        setFxRates(rates);
      }).catch(function() { /* fallback BRL:1 */ });
    } else {
      setFxRates({ BRL: 1 });
    }

    // Family breakdown quando viewing "Todos" e portfolios existem
    if (!portfolioId && portfoliosList.length > 0) {
      var pfPromises = [];
      for (var pfIdx = 0; pfIdx < portfoliosList.length; pfIdx++) {
        pfPromises.push(getPositions(user.id, portfoliosList[pfIdx].id));
      }
      pfPromises.push(getPositions(user.id, '__null__'));
      Promise.all(pfPromises).then(function(pfResults) {
        var breakdown = [];
        for (var pfr = 0; pfr < portfoliosList.length; pfr++) {
          var pfPositions = pfResults[pfr].data || [];
          var pfTotal = 0;
          for (var pp = 0; pp < pfPositions.length; pp++) {
            pfTotal += pfPositions[pp].quantidade * pfPositions[pp].pm;
          }
          breakdown.push({ id: portfoliosList[pfr].id, nome: portfoliosList[pfr].nome, cor: portfoliosList[pfr].cor || C.accent, icone: portfoliosList[pfr].icone, valor: pfTotal, ativos: pfPositions.length });
        }
        var nullPositions = pfResults[pfResults.length - 1].data || [];
        var nullTotal = 0;
        for (var npi = 0; npi < nullPositions.length; npi++) {
          nullTotal += nullPositions[npi].quantidade * nullPositions[npi].pm;
        }
        if (nullTotal > 0) {
          breakdown.push({ id: null, nome: 'Padrão', cor: C.accent, icone: null, valor: nullTotal, ativos: nullPositions.length });
        }
        setFamilyBreakdown(breakdown);
      }).catch(function(e3) { console.warn('Family breakdown failed:', e3); });
    } else {
      setFamilyBreakdown(null);
    }

    // Rebalance targets
    getRebalanceTargets(user.id).then(function(rtRes) {
      if (rtRes.data) {
        _rebalTargetsRef.current = rtRes.data;
        var tt = rtRes.data.ticker_targets || {};
        var flat = tt._flat || {};
        setTickerMetas(flat);
        var st = rtRes.data.sector_targets || {};
        var stClean = {};
        var stKeys = Object.keys(st);
        for (var sti = 0; sti < stKeys.length; sti++) {
          if (stKeys[sti].charAt(0) !== '_') stClean[stKeys[sti]] = st[stKeys[sti]];
        }
        setSectorMetas(stClean);
        if (st._segmento) setSegmentoMetas(st._segmento);
        if (st._capGroup) setCapMetas(st._capGroup);
        if (rtRes.data.class_targets) setClassMetas(rtRes.data.class_targets);
      }
    }).catch(function() {});

    // Snapshots, selic, ibov para perf chart
    var snapshotPfId = portfolioId || null;
    Promise.all([
      getPatrimonioSnapshots(user.id, snapshotPfId),
      getProfile(user.id),
    ]).then(function(perfResults) {
      var snaps = perfResults[0] || [];
      var mapped = snaps.map(function(s) { return { date: s.data, value: s.valor }; });
      var weeklyCount = computeWeeklyReturns(mapped).length;
      if (weeklyCount < 4 && snapshotPfId) {
        getPatrimonioSnapshots(user.id, null).then(function(globalSnaps) {
          var gs = globalSnaps || [];
          setSnapshots(gs.map(function(s) { return { date: s.data, value: s.valor }; }));
        }).catch(function() {});
      } else {
        setSnapshots(mapped);
      }
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

    return Promise.resolve();
  };

  // Quando positions enriquecidas mudam (tem preco_atual), buscar sparklines + sector profiles
  var _lastHistTickers = useRef('');
  useEffect(function() {
    if (!positions.length || positions[0].preco_atual === undefined) return;
    var tickers = [];
    for (var ti = 0; ti < positions.length; ti++) {
      if (positions[ti].ticker) tickers.push(positions[ti].ticker);
    }
    var tickerKey = tickers.join(',');
    if (tickerKey === _lastHistTickers.current) return;
    _lastHistTickers.current = tickerKey;

    if (tickers.length > 0) {
      var mercadoMap = {};
      for (var mi = 0; mi < positions.length; mi++) {
        if (positions[mi].ticker && positions[mi].mercado) {
          mercadoMap[positions[mi].ticker] = positions[mi].mercado;
        }
      }
      fetchHistoryRouted(tickers, mercadoMap).then(function(hist) {
        setPriceHistory(hist || {});
      }).catch(function() {});
    }

    // Sector profiles
    try {
      var unknownSectors = [];
      for (var usi = 0; usi < positions.length; usi++) {
        var usTicker = positions[usi].ticker;
        if (usTicker && !TICKER_SECTORS[usTicker.toUpperCase()]) unknownSectors.push(usTicker);
      }
      if (unknownSectors.length > 0) {
        fetchTickerProfile(unknownSectors).then(function(profiles) {
          var pKeys = Object.keys(profiles);
          for (var pk = 0; pk < pKeys.length; pk++) {
            var sym = pKeys[pk];
            var prof = profiles[sym];
            if (!prof || !prof.sector) continue;
            var mapped = _mapBrapiSector(prof.sector, prof.industry);
            if (mapped) TICKER_SECTORS[sym] = mapped;
          }
        }).catch(function() {});
      }
    } catch (e) { /* silent */ }
  }, [positions]);

  // Trigger store refresh + local data on focus
  useFocusEffect(useCallback(function () {
    carteira.refresh();
    financas.refresh();
    loadLocalData();
  }, [user, portfolioId, portfoliosList.length]));

  var onRefresh = function () {
    setRefreshing(true);
    clearPriceCache();
    _lastHistTickers.current = '';
    setFundamentals({});
    setIndicators({});
    Promise.all([
      carteira.refresh(true),
      financas.refresh(true),
    ]).then(function() {
      return loadLocalData();
    }).then(function() {
      setRefreshing(false);
    }).catch(function() {
      setRefreshing(false);
    });
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
    var fCat = fd ? fd.cat : '';
    if (fCat === 'etf_int') {
      filteredPositions = positions.filter(function (p) { return p.categoria === 'etf' && p.mercado === 'INT'; });
    } else if (fCat === 'etf') {
      filteredPositions = positions.filter(function (p) { return p.categoria === 'etf' && p.mercado !== 'INT'; });
    } else {
      filteredPositions = positions.filter(function (p) { return p.categoria === fCat; });
    }
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
  // Incluir wishlist tickers (posicoes fantasma com qty=0 que tem meta definida)
  // Apenas no modo 'todos' e sem filtro de corretora
  if (filter === 'todos' && !corrFilter) {
    var existingTickers = {};
    for (var eti = 0; eti < filteredPositions.length; eti++) {
      existingTickers[filteredPositions[eti].ticker] = true;
    }
    var metaTickerKeys = Object.keys(tickerMetas);
    for (var wti = 0; wti < metaTickerKeys.length; wti++) {
      var wTicker = metaTickerKeys[wti];
      if (!existingTickers[wTicker] && tickerMetas[wTicker] > 0) {
        filteredPositions = filteredPositions.concat([{
          ticker: wTicker, categoria: 'acao', mercado: 'BR', quantidade: 0,
          pm: 0, preco_atual: null, por_corretora: {}, _wishlist: true,
        }]);
      }
    }
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
  var allocMap = { acao: 0, fii: 0, etf: 0, etf_int: 0, bdr: 0, stock_int: 0, adr: 0, reit: 0, rf: totalRF };
  positions.forEach(function (p) {
    var cat = p.categoria || '';
    if (cat === 'etf' && p.mercado === 'INT') {
      allocMap.etf_int += p.quantidade * (p.preco_atual || p.pm);
    } else if (allocMap[cat] !== undefined) {
      allocMap[cat] += p.quantidade * (p.preco_atual || p.pm);
    }
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
    var fCat = fdef ? fdef.cat : '';
    if (fCat === 'etf_int') return positions.filter(function (p) { return p.categoria === 'etf' && p.mercado === 'INT'; }).length;
    if (fCat === 'etf') return positions.filter(function (p) { return p.categoria === 'etf' && p.mercado !== 'INT'; }).length;
    return positions.filter(function (p) { return p.categoria === fCat; }).length;
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
            store.invalidate('carteira');
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

  // Esperar ate precos reais chegarem — evita mostrar PM e depois "pular" pra preco real
  var temPositions = positions.length > 0;
  var precosCarregados = !temPositions || positions[0].preco_atual != null;
  if (loading || pricesLoading || (temPositions && !precosCarregados)) return <View style={styles.container}><SkeletonCarteira /></View>;
  if (loadError) return (
    <View style={styles.container}>
      <EmptyState ionicon="alert-circle-outline" title="Erro ao carregar" description="Não foi possível carregar a carteira. Verifique sua conexão e tente novamente." cta="Tentar novamente" onCta={function() { carteira.refresh(true); financas.refresh(true); loadLocalData(); }} color={C.red} />
    </View>
  );
  if (positions.length === 0 && rfAtivos.length === 0 && saldos.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState ionicon="briefcase-outline" title="Carteira vazia"
          description="Nenhum ativo na carteira. Registre compras de ações, FIIs, ETFs ou renda fixa."
          cta="Adicionar ativo" onCta={function () { nav('AddOperacao'); }} color={C.acoes} />
        <Fab navigation={navigation} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}>

      {/* ══════ 1. HERO — INVESTIDO ══════ */}
      <Glass glow={C.acoes} padding={16}>
        {/* Investido (hero principal) */}
        <Text style={styles.heroLabel}>INVESTIDO</Text>
        <Text style={[styles.heroValue, ps]}>R$ {fmt(totalInvestido)}</Text>

        {/* P&L Aberto + Realizado lado a lado */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border }}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.heroLabel}>P&L ABERTO</Text>
              <InfoTip text="Ganho ou perda das posicoes que voce ainda tem em carteira." size={12} />
            </View>
            <Text style={[styles.heroPL, { color: isPosTotal ? C.green : C.red }, ps]}>
              {isPosTotal ? '+' : '-'}R$ {fmt(Math.abs(totalPL))}
            </Text>
            <Text style={[styles.heroPLSub, { color: isPosTotal ? C.green : C.red }, ps]}>
              {isPosTotal ? '▲' : '▼'} {Math.abs(totalPLPct).toFixed(1)}% geral
            </Text>
          </View>
          {encerradas.length > 0 ? (
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={styles.heroLabel}>P&L REALIZADO</Text>
                <InfoTip text="Lucro ou prejuizo das acoes ja vendidas." size={12} />
              </View>
              <Text style={[styles.heroPL, { color: isPosRealizado ? C.green : C.red }, ps]}>
                {isPosRealizado ? '+' : '-'}R$ {fmt(Math.abs(plRealizado))}
              </Text>
              <Text style={[styles.heroPLSub, { color: isPosRealizado ? C.green : C.red }, ps]}>
                {isPosRealizado ? '▲' : '▼'} {Math.abs(plRealizadoPct).toFixed(1)}%
              </Text>
            </View>
          ) : null}
        </View>

        {/* Grafico de evolucao do investido */}
        {snapshots.length >= 2 ? (
          <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border }}>
            <Sensitive>
              <InteractiveChart
                data={snapshots}
                height={100}
                color={C.acoes}
                label="Evolucao investido"
              />
            </Sensitive>
          </View>
        ) : null}

        {/* Stats bottom */}
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
            <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>Atualizando cotacoes...</Text>
          </View>
        ) : getLastPriceUpdate() ? (
          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, marginTop: 6, textAlign: 'right' }}>
            {'Cotacoes de ' + new Date(getLastPriceUpdate()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
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
        <Glass padding={0} style={{ overflow: 'hidden' }}>
          {(function() {
            var cR = computeWeeklyReturns(snapshots);
            if (cR.length === 0) return null;
            var aC = 0;
            for (var aci = 0; aci < cR.length; aci++) { aC = (1 + aC / 100) * (1 + cR[aci].pct / 100) - 1; aC = aC * 100; }
            var cdiAH = (selicRate || 13.25) - 0.10;
            var cdiSH = (Math.pow(1 + cdiAH / 100, 1 / 52) - 1) * 100;
            var aCDI = (Math.pow(1 + cdiSH / 100, cR.length) - 1) * 100;
            var aIPCA = (Math.pow(1 + 4.5 / 100, cR.length / 52) - 1) * 100;
            var aIBOV = 0;
            if (ibovHist.length > 0) { var ibW = computeWeeklyReturns(ibovHist); for (var ii = 0; ii < ibW.length; ii++) { aIBOV = (1 + aIBOV / 100) * (1 + ibW[ii].pct / 100) - 1; aIBOV = aIBOV * 100; } }
            var cCol = aC >= 0 ? C.green : C.red;
            var bCDI = aC > aCDI;
            var bCol = bCDI ? C.green : C.red;
            var weeks = cR.length;
            return (
              <View style={{ padding: 14, paddingBottom: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 10 }}>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body }}>Retorno acumulado</Text>
                      <TouchableOpacity onPress={function() { setPerfFullscreen(true); setPerfSelIdx(-1); }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="expand-outline" size={14} color={C.accent} />
                      </TouchableOpacity>
                    </View>
                    <Text style={{ fontSize: 22, fontFamily: F.mono, fontWeight: '700', color: cCol }}>
                      {(aC >= 0 ? '+' : '') + aC.toFixed(1) + '%'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.body }}>CDI</Text>
                      <Text style={{ fontSize: 13, fontFamily: F.mono, fontWeight: '600', color: C.rf }}>{'+' + aCDI.toFixed(1) + '%'}</Text>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.body }}>IBOV</Text>
                      <Text style={{ fontSize: 13, fontFamily: F.mono, fontWeight: '600', color: C.etfs }}>{(aIBOV >= 0 ? '+' : '') + aIBOV.toFixed(1) + '%'}</Text>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.body }}>IPCA</Text>
                      <Text style={{ fontSize: 13, fontFamily: F.mono, fontWeight: '600', color: '#F97316' }}>{'+' + aIPCA.toFixed(1) + '%'}</Text>
                    </View>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: bCol + '15', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Ionicons name={bCDI ? 'trending-up' : 'trending-down'} size={12} color={bCol} />
                    <Text style={{ fontSize: 10, fontFamily: F.mono, fontWeight: '600', color: bCol }}>{bCDI ? 'Acima do CDI' : 'Abaixo do CDI'}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: C.accent + '12', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 10, fontFamily: F.mono, color: C.accent }}>{weeks + ' semanas'}</Text>
                  </View>
                </View>
              </View>
            );
          })()}
          {(function() {
            var cartReturns = computeWeeklyReturns(snapshots);
            if (cartReturns.length === 0) return null;

            // CDI weekly returns
            var cdiAnual = (selicRate || 13.25) - 0.10;
            var cdiSemanal = (Math.pow(1 + cdiAnual / 100, 1 / 52) - 1) * 100;
            var cdiReturns = {};
            for (var cwi = 0; cwi < cartReturns.length; cwi++) {
              cdiReturns[cartReturns[cwi].week] = cdiSemanal;
            }

            // IPCA weekly returns (estimado ~4.5% a.a.)
            var ipcaAnual = 4.5;
            var ipcaSemanal = (Math.pow(1 + ipcaAnual / 100, 1 / 52) - 1) * 100;
            var ipcaReturns = {};
            for (var ipci = 0; ipci < cartReturns.length; ipci++) {
              ipcaReturns[cartReturns[ipci].week] = ipcaSemanal;
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
            var catKeys = ['acao', 'fii', 'etf', 'etf_int', 'bdr', 'stock_int', 'adr', 'reit', 'rf'];
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
            var chartH = 180;
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
              if (perfSeries.ipca) {
                var ipv = ipcaReturns[rKey];
                if (ipv != null && Math.abs(ipv) > maxAbs) maxAbs = Math.abs(ipv);
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

            // Grid lines + Y labels (minimal e elegante)
            var ySteps = [maxAbs, maxAbs / 2, 0, -maxAbs / 2, -maxAbs];
            for (var yi = 0; yi < ySteps.length; yi++) {
              var yv = ySteps[yi];
              var yp = valToY(yv);
              var isZero = yv === 0;
              allEls.push(React.createElement(SvgLine, {
                key: 'pg-' + yi, x1: padL, y1: yp, x2: padL + plotW, y2: yp,
                stroke: isZero ? C.text + '20' : C.text + '08', strokeWidth: isZero ? 1 : 0.5,
                strokeDasharray: isZero ? undefined : '4,4',
              }));
              allEls.push(React.createElement(SvgText, {
                key: 'pyl-' + yi, x: padL - 4, y: yp + 3,
                fontSize: 8, fill: C.dim + '80', fontFamily: F.mono, textAnchor: 'end',
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

            // Helper: build smooth cubic bezier path from points
            var smoothPath = function(pts) {
              if (pts.length < 2) return '';
              var d = 'M' + pts[0].x + ',' + pts[0].y;
              for (var i = 1; i < pts.length; i++) {
                var prev = pts[i - 1];
                var curr = pts[i];
                var tension = 0.3;
                var dx = curr.x - prev.x;
                var cp1x = prev.x + dx * tension;
                var cp2x = curr.x - dx * tension;
                d = d + ' C' + cp1x + ',' + prev.y + ' ' + cp2x + ',' + curr.y + ' ' + curr.x + ',' + curr.y;
              }
              return d;
            };

            // Helper: render series
            var renderSer = function(pts, color, key, showArea, isDashed) {
              var els = [];
              if (pts.length < 1) return els;

              // Gradiente (para area e glow da linha)
              var gradId = 'grad_' + key;
              var glowId = 'glow_' + key;
              els.push(React.createElement(Defs, { key: key + '-defs' },
                React.createElement(SvgGrad, { id: gradId, x1: '0', y1: '0', x2: '0', y2: '1' },
                  React.createElement(Stop, { offset: '0%', stopColor: color, stopOpacity: showArea ? '0.30' : '0.0' }),
                  React.createElement(Stop, { offset: '100%', stopColor: color, stopOpacity: '0.0' })
                ),
                React.createElement(SvgGrad, { id: glowId, x1: '0', y1: '0', x2: '1', y2: '0' },
                  React.createElement(Stop, { offset: '0%', stopColor: color, stopOpacity: '0.3' }),
                  React.createElement(Stop, { offset: '50%', stopColor: color, stopOpacity: '1' }),
                  React.createElement(Stop, { offset: '100%', stopColor: color, stopOpacity: '0.6' })
                )
              ));

              // Area fill com curva suave
              if (showArea && pts.length >= 2) {
                var curvePath = smoothPath(pts);
                var areaP = curvePath + ' L' + pts[pts.length - 1].x + ',' + zeroY + ' L' + pts[0].x + ',' + zeroY + ' Z';
                els.push(React.createElement(Path, { key: key + '-a', d: areaP, fill: 'url(#' + gradId + ')' }));
              }

              // Linha curva suave
              if (pts.length >= 2) {
                var linePath = smoothPath(pts);
                var sw = showArea ? 2.5 : 1.5;
                // Glow (sombra colorida atras da linha)
                if (showArea) {
                  els.push(React.createElement(Path, { key: key + '-glow', d: linePath, stroke: color, strokeWidth: sw + 3, fill: 'none', opacity: 0.15, strokeLinecap: 'round' }));
                }
                // Linha principal
                var dashArr = isDashed ? '6,4' : undefined;
                els.push(React.createElement(Path, { key: key + '-l', d: linePath, stroke: showArea ? 'url(#' + glowId + ')' : color, strokeWidth: sw, fill: 'none', opacity: isDashed ? 0.7 : 1, strokeLinecap: 'round', strokeDasharray: dashArr }));
              }

              // Endpoint dot com glow pulsante
              if (pts.length > 0) {
                var last = pts[pts.length - 1];
                // Glow grande
                els.push(React.createElement(SvgCircle, { key: key + '-g3', cx: last.x, cy: last.y, r: 8, fill: color, opacity: 0.08 }));
                els.push(React.createElement(SvgCircle, { key: key + '-g2', cx: last.x, cy: last.y, r: 5, fill: color, opacity: 0.15 }));
                // Dot solido
                els.push(React.createElement(SvgCircle, { key: key + '-dot', cx: last.x, cy: last.y, r: 3, fill: color, opacity: 1 }));
                // Centro branco
                els.push(React.createElement(SvgCircle, { key: key + '-inner', cx: last.x, cy: last.y, r: 1.2, fill: '#fff', opacity: 0.9 }));
                // Valor no endpoint
                var valText = (last.val >= 0 ? '+' : '') + last.val.toFixed(1) + '%';
                els.push(React.createElement(SvgText, { key: key + '-val', x: last.x, y: last.y - 10, fontSize: 9, fill: color, fontFamily: F.mono, fontWeight: '700', textAnchor: 'middle' }, valText));
              }
              return els;
            };

            // Render series in order (back to front)
            var seriesConfig = [
              { key: 'ipca', active: perfSeries.ipca, color: '#F97316', area: false, dash: true, getVal: function(wk) { return ipcaReturns[wk] != null ? ipcaReturns[wk] : null; } },
              { key: 'cdi', active: perfSeries.cdi, color: C.rf, area: false, dash: true, getVal: function(wk) { return cdiReturns[wk] != null ? cdiReturns[wk] : null; } },
              { key: 'ibov', active: perfSeries.ibov, color: C.etfs, area: false, dash: false, getVal: function(wk) { return ibovReturns[wk] != null ? ibovReturns[wk] : null; } },
              { key: 'rf', active: perfSeries.rf, color: C.rf, area: false, dash: false, getVal: function(wk) { return catReturns.rf && catReturns.rf[wk] != null ? catReturns.rf[wk] : null; } },
              { key: 'etf', active: perfSeries.etf, color: C.etfs, area: false, dash: false, getVal: function(wk) { return catReturns.etf && catReturns.etf[wk] != null ? catReturns.etf[wk] : null; } },
              { key: 'stock_int', active: perfSeries.stock_int, color: C.stock_int, area: false, dash: false, getVal: function(wk) { return catReturns.stock_int && catReturns.stock_int[wk] != null ? catReturns.stock_int[wk] : null; } },
              { key: 'fii', active: perfSeries.fii, color: C.fiis, area: false, dash: false, getVal: function(wk) { return catReturns.fii && catReturns.fii[wk] != null ? catReturns.fii[wk] : null; } },
              { key: 'acao', active: perfSeries.acao, color: C.acoes, area: false, dash: false, getVal: function(wk) { return catReturns.acao && catReturns.acao[wk] != null ? catReturns.acao[wk] : null; } },
              { key: 'cart', active: perfSeries.cart, color: C.accent, area: true, dash: false, getVal: function(wk, idx) { return cartReturns[idx].pct; } },
            ];

            for (var si = 0; si < seriesConfig.length; si++) {
              var sc = seriesConfig[si];
              if (!sc.active) continue;
              var pts = buildPts(sc.getVal);
              var sEls = renderSer(pts, sc.color, 'p' + sc.key, sc.area, sc.dash);
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

            // Crosshair + tooltip para ponto selecionado
            if (perfSelIdx >= 0 && perfSelIdx < n) {
              var selX = idxToX(perfSelIdx);
              // Linha vertical
              allEls.push(React.createElement(SvgLine, { key: 'cross-v', x1: selX, y1: padT, x2: selX, y2: chartH - padB, stroke: C.text + '30', strokeWidth: 1, strokeDasharray: '3,3' }));
              // Dots em todas as series ativas nesse ponto
              for (var csi = 0; csi < seriesConfig.length; csi++) {
                var csc = seriesConfig[csi];
                if (!csc.active) continue;
                var csv = csc.getVal(cartReturns[perfSelIdx].week, perfSelIdx);
                if (csv == null) continue;
                var csY = valToY(csv);
                allEls.push(React.createElement(SvgCircle, { key: 'cross-d-' + csc.key, cx: selX, cy: csY, r: 4, fill: csc.color, opacity: 0.9 }));
                allEls.push(React.createElement(SvgCircle, { key: 'cross-i-' + csc.key, cx: selX, cy: csY, r: 1.5, fill: '#fff', opacity: 0.9 }));
              }
            }

            // Touch handler
            var handleChartTouch = function(e) {
              var touchX = e.nativeEvent.locationX - padL;
              if (touchX < 0 || n === 0) { setPerfSelIdx(-1); return; }
              var slotW = plotW / Math.max(1, n - 1);
              var idx = Math.round(touchX / slotW);
              if (idx < 0) idx = 0;
              if (idx >= n) idx = n - 1;
              setPerfSelIdx(perfSelIdx === idx ? -1 : idx);
            };

            // Tooltip data
            var tooltipData = null;
            if (perfSelIdx >= 0 && perfSelIdx < n) {
              tooltipData = { date: cartReturns[perfSelIdx].date, week: cartReturns[perfSelIdx].week, values: [] };
              for (var tti = 0; tti < seriesConfig.length; tti++) {
                var tsc = seriesConfig[tti];
                if (!tsc.active) continue;
                var tv = tsc.getVal(cartReturns[perfSelIdx].week, perfSelIdx);
                if (tv != null) tooltipData.values.push({ key: tsc.key, color: tsc.color, val: tv });
              }
            }

            // Series pill labels
            var PILL_LABELS = { cart: 'Carteira', cdi: 'CDI', ibov: 'IBOV', ipca: 'IPCA', acao: 'Acoes', fii: 'FIIs', etf: 'ETFs', stock_int: 'Stocks', rf: 'RF' };

            // Toggle pills
            var SERIES_PILLS = [
              { k: 'cart', l: 'Carteira', c: C.accent },
              { k: 'cdi', l: 'CDI', c: C.rf },
              { k: 'ibov', l: 'IBOV', c: C.etfs },
              { k: 'ipca', l: 'IPCA', c: '#F97316' },
              { k: 'acao', l: 'Ações', c: C.acoes },
              { k: 'fii', l: 'FIIs', c: C.fiis },
              { k: 'etf', l: 'ETFs', c: C.etfs },
              { k: 'stock_int', l: 'Stocks', c: C.stock_int },
              { k: 'rf', l: 'RF', c: C.rf },
            ];

            return React.createElement(View, { style: { paddingHorizontal: 14, paddingBottom: 14 } },
              // Grafico com touch
              React.createElement(View, {
                onStartShouldSetResponder: function() { return true; },
                onResponderGrant: handleChartTouch,
                onResponderMove: function(e) {
                  var tx = e.nativeEvent.locationX - padL;
                  if (tx < 0 || n === 0) return;
                  var sw2 = plotW / Math.max(1, n - 1);
                  var ni = Math.round(tx / sw2);
                  if (ni < 0) ni = 0;
                  if (ni >= n) ni = n - 1;
                  setPerfSelIdx(ni);
                },
                onResponderRelease: function() { /* manter selecionado */ },
              },
                React.createElement(Svg, { width: chartW, height: chartH }, allEls)
              ),
              // Tooltip
              tooltipData ? React.createElement(View, { style: { backgroundColor: C.text + '08', borderRadius: 10, padding: 10, marginTop: 6 } },
                React.createElement(View, { style: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 } },
                  React.createElement(Text, { style: { fontSize: 11, fontFamily: F.mono, fontWeight: '600', color: C.text } },
                    (function() { var dp2 = tooltipData.date.split('-'); return dp2[2] + '/' + dp2[1] + '/' + dp2[0]; })()),
                  React.createElement(TouchableOpacity, { onPress: function() { setPerfSelIdx(-1); } },
                    React.createElement(Ionicons, { name: 'close-circle', size: 16, color: C.dim }))
                ),
                React.createElement(View, { style: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } },
                  tooltipData.values.map(function(tv) {
                    return React.createElement(View, { key: 'tt-' + tv.key, style: { flexDirection: 'row', alignItems: 'center', gap: 4 } },
                      React.createElement(View, { style: { width: 6, height: 6, borderRadius: 3, backgroundColor: tv.color } }),
                      React.createElement(Text, { style: { fontSize: 10, fontFamily: F.body, color: C.dim } }, PILL_LABELS[tv.key] || tv.key),
                      React.createElement(Text, { style: { fontSize: 11, fontFamily: F.mono, fontWeight: '700', color: tv.val >= 0 ? C.green : C.red } },
                        (tv.val >= 0 ? '+' : '') + tv.val.toFixed(2) + '%')
                    );
                  })
                )
              ) : null,
              // Toggle pills
              React.createElement(ScrollView, { horizontal: true, showsHorizontalScrollIndicator: false, style: { marginTop: 10 }, contentContainerStyle: { gap: 5 } },
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
                      flexDirection: 'row', alignItems: 'center', gap: 4,
                      paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                      backgroundColor: isOn ? sp.c + '18' : C.border + '15',
                    },
                  },
                    React.createElement(View, { style: { width: 6, height: 6, borderRadius: 3, backgroundColor: isOn ? sp.c : C.dim } }),
                    React.createElement(Text, {
                      style: { fontSize: 10, fontFamily: F.body, fontWeight: isOn ? '600' : '400', color: isOn ? sp.c : C.dim },
                    }, sp.l)
                  );
                })
              )
            );
          })()}
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
        {/* AnalisesSalvas removido na Fase G — IA desativada, feature morta */}
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

      <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, marginBottom: 2, alignItems: 'center' }}>
        {/* Toggle agrupamento */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexDirection: 'row', borderRadius: 6, borderWidth: 1, borderColor: C.border + '50', overflow: 'hidden', marginRight: 4 }}>
          {(function() {
            var modes = [{ k: 'flat', l: 'Ativo' }, { k: 'setor', l: 'Setor' }, { k: 'segmento', l: 'Segmento' }];
            if (filter === 'fiis') {
              modes.push({ k: 'tipo_fii', l: 'Tipo' });
            } else {
              modes.push({ k: 'cap', l: 'Cap' });
            }
            return modes;
          })().map(function(g) {
            return (
              <TouchableOpacity key={g.k} onPress={function() { setGroupBy(g.k); setEditingGroup(null); }}
                style={{ paddingHorizontal: 6, paddingVertical: 3, backgroundColor: groupBy === g.k ? C.accent + '22' : 'transparent' }}>
                <Text style={{ fontSize: 10, fontFamily: F.body, color: groupBy === g.k ? C.accent : C.dim }}>{g.l}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
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

      {/* ══════ ALOCACAO POR CLASSE (Nivel 1 do rebalanceamento) ══════ */}
      {(function() {
        var CLASS_DEFS = [
          { cat: 'acao', label: 'Acoes', filterKey: 'acoes', color: C.acoes },
          { cat: 'fii', label: 'FIIs', filterKey: 'fiis', color: C.fiis },
          { cat: 'etf', label: 'ETFs', filterKey: 'etfs', color: C.etfs },
          { cat: 'stock_int', label: 'Stocks', filterKey: 'stocks_int', color: C.stock_int },
          { cat: 'bdr', label: 'BDRs', filterKey: 'bdrs', color: C.bdr || '#A855F7' },
          { cat: 'reit', label: 'REITs', filterKey: 'reits', color: C.reit || '#EC4899' },
        ];
        var classVals = {};
        for (var cdi = 0; cdi < CLASS_DEFS.length; cdi++) { classVals[CLASS_DEFS[cdi].cat] = 0; }
        var rfTotal = 0;
        for (var rfi = 0; rfi < rfAtivos.length; rfi++) { rfTotal += rfAtivos[rfi].valor_aplicado || 0; }
        for (var pi = 0; pi < positions.length; pi++) {
          var pc = positions[pi].categoria || 'acao';
          if (classVals[pc] !== undefined) {
            classVals[pc] += positions[pi].quantidade * (positions[pi].preco_atual || positions[pi].pm);
          }
        }
        var classTotal = totalInvestido;
        var classMetaTotal = 0;
        var classMetaCount = 0;
        var cmkKeys = Object.keys(classMetas);
        for (var cmi = 0; cmi < cmkKeys.length; cmi++) {
          var cmv = parseFloat(classMetas[cmkKeys[cmi]]);
          if (!isNaN(cmv)) { classMetaTotal += cmv; classMetaCount++; }
        }
        var classMetaRestante = 100 - classMetaTotal;
        var activeClasses = [];
        for (var aci = 0; aci < CLASS_DEFS.length; aci++) {
          var cd = CLASS_DEFS[aci];
          if (classVals[cd.cat] > 0 || (classMetas[cd.cat] != null && classMetas[cd.cat] !== '')) {
            activeClasses.push(cd);
          }
        }
        if (rfTotal > 0 || (classMetas.rf != null && classMetas.rf !== '')) {
          activeClasses.push({ cat: 'rf', label: 'RF', filterKey: 'rf', color: C.rf });
          classVals.rf = rfTotal;
        }
        if (activeClasses.length < 2) return null;

        var submitClassMeta = function() {
          var sv = classMetaInput.replace(',', '.');
          if (sv === '' || isNaN(parseFloat(sv))) {
            handleSetClassMeta(editingClass, null);
          } else {
            handleSetClassMeta(editingClass, parseFloat(sv));
          }
          setEditingClass(null);
        };

        return (
          <View style={{ borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.accent + '20', backgroundColor: C.accent + '04' }}>
            {/* Barra segmentada clicavel */}
            <View style={{ flexDirection: 'row', height: 18, borderRadius: 9, overflow: 'hidden', backgroundColor: C.border + '30', marginBottom: 4 }}>
              {activeClasses.map(function(cd) {
                var pct = classTotal > 0 ? (classVals[cd.cat] / classTotal) * 100 : 0;
                if (pct < 0.5) return null;
                var isActive = filter === cd.filterKey;
                return (
                  <TouchableOpacity key={'cb_' + cd.cat} activeOpacity={0.7}
                    onPress={function() {
                      var fk = cd.filterKey;
                      setFilter(filter === fk ? 'todos' : fk);
                      setCorrFilter(null); setSelAllocSeg(null);
                      // Nao mudar groupBy — manter a selecao do usuario
                    }}
                    style={{ width: pct + '%', height: 18, backgroundColor: cd.color,
                      opacity: filter !== 'todos' && !isActive ? 0.35 : 1,
                      justifyContent: 'center', alignItems: 'center' }}>
                    {pct >= 18 ? (
                      <Text numberOfLines={1} style={{ fontSize: 8, fontFamily: F.mono, color: '#fff', fontWeight: '700' }}>
                        {cd.label + ' ' + Math.round(pct) + '%'}
                      </Text>
                    ) : pct >= 8 ? (
                      <Text numberOfLines={1} style={{ fontSize: 7, fontFamily: F.mono, color: '#fff', fontWeight: '700' }}>
                        {Math.round(pct) + '%'}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
            {/* Detalhe do filtro ativo */}
            {filter !== 'todos' ? (function() {
              var activeCd = null;
              for (var afi = 0; afi < activeClasses.length; afi++) {
                if (activeClasses[afi].filterKey === filter) { activeCd = activeClasses[afi]; break; }
              }
              if (!activeCd) return null;
              var aVal = classVals[activeCd.cat] || 0;
              var aPct = classTotal > 0 ? (aVal / classTotal) * 100 : 0;
              var aMeta = classMetas[activeCd.cat];
              var aHasMeta = aMeta != null && aMeta !== '' && !isNaN(parseFloat(aMeta));
              var aMetaVal = aHasMeta ? parseFloat(aMeta) : 0;
              var aValFmt = aVal >= 1000 ? ('R$ ' + (aVal / 1000).toFixed(1) + 'k') : ('R$ ' + aVal.toFixed(0));
              return (
                <TouchableOpacity onPress={function() { setFilter('todos'); setCorrFilter(null); setSelAllocSeg(null); /* manter groupBy do usuario */ }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                    marginBottom: 6, paddingVertical: 4, borderRadius: 8, backgroundColor: activeCd.color + '12' }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: activeCd.color }} />
                  <Text style={{ fontSize: 12, fontFamily: F.display, fontWeight: '700', color: activeCd.color }}>{activeCd.label}</Text>
                  <Text style={{ fontSize: 12, fontFamily: F.mono, fontWeight: '600', color: C.text }}>{aPct.toFixed(1) + '%'}</Text>
                  <Text style={{ fontSize: 11, fontFamily: F.mono, color: C.dim }}>{aValFmt}</Text>
                  {aHasMeta ? <Text style={{ fontSize: 10, fontFamily: F.mono, color: C.accent }}>{'meta ' + aMetaVal.toFixed(0) + '%'}</Text> : null}
                  <Ionicons name="close-circle" size={14} color={C.dim} />
                </TouchableOpacity>
              );
            })() : null}
            {/* Cards horizontais */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
              {activeClasses.map(function(cd) {
                var val = classVals[cd.cat] || 0;
                var pct = classTotal > 0 ? (val / classTotal) * 100 : 0;
                var meta = classMetas[cd.cat];
                var hasMeta = meta != null && meta !== '' && !isNaN(parseFloat(meta));
                var metaVal = hasMeta ? parseFloat(meta) : 0;
                var diff = hasMeta ? pct - metaVal : 0;
                var diffColor = hasMeta ? (Math.abs(diff) < 0.5 ? C.green : (diff > 0 ? C.etfs : C.red)) : C.dim;
                var isActive = filter === cd.filterKey;
                var isEdCls = editingClass === cd.cat;
                var valFmt = val >= 1000 ? (val / 1000).toFixed(1) + 'k' : val.toFixed(0);

                return (
                  <TouchableOpacity key={'cc_' + cd.cat} activeOpacity={0.7}
                    onPress={function() {
                      var fk = cd.filterKey;
                      setFilter(filter === fk ? 'todos' : fk);
                      setCorrFilter(null); setSelAllocSeg(null);
                      // Nao mudar groupBy — manter a selecao do usuario
                    }}
                    style={{ width: 110, backgroundColor: isActive ? cd.color + '15' : C.bg,
                      borderRadius: 10, borderWidth: isActive ? 1.5 : 1, borderColor: isActive ? cd.color + '50' : C.border + '30',
                      paddingHorizontal: 10, paddingVertical: 8 }}>
                    {/* Nome + % */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cd.color }} />
                      <Text style={{ fontSize: 12, fontFamily: F.display, fontWeight: '700', color: C.text }}>{cd.label}</Text>
                    </View>
                    <Text style={{ fontSize: 16, fontFamily: F.mono, fontWeight: '700', color: cd.color, marginBottom: 1 }}>{pct.toFixed(1) + '%'}</Text>
                    <Text style={{ fontSize: 10, fontFamily: F.mono, color: C.dim, marginBottom: 5 }}>{'R$ ' + valFmt}</Text>
                    {/* Meta */}
                    {isEdCls ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <TextInput
                          style={{ width: 40, height: 22, borderRadius: 5, borderWidth: 1.5, borderColor: C.accent,
                            backgroundColor: C.bg, color: C.text, fontSize: 12, fontFamily: F.mono, fontWeight: '700', textAlign: 'center', paddingVertical: 0 }}
                          value={classMetaInput}
                          onChangeText={setClassMetaInput}
                          keyboardType="decimal-pad"
                          autoFocus
                          maxLength={5}
                          returnKeyType="done"
                          onSubmitEditing={submitClassMeta}
                          onBlur={submitClassMeta}
                        />
                        <Text style={{ fontSize: 10, color: C.accent, fontFamily: F.mono }}>%</Text>
                      </View>
                    ) : hasMeta ? (
                      <TouchableOpacity onPress={function() { setClassMetaInput(String(metaVal)); setEditingClass(cd.cat); }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Text style={{ fontSize: 11, color: C.accent, fontFamily: F.mono, fontWeight: '600' }}>{'Meta ' + metaVal.toFixed(0) + '%'}</Text>
                        <Text style={{ fontSize: 9, fontFamily: F.mono, fontWeight: '700', color: diffColor }}>
                          {(diff >= 0 ? '+' : '') + diff.toFixed(1)}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity onPress={function() { setClassMetaInput(''); setEditingClass(cd.cat); }}>
                        <Text style={{ fontSize: 10, color: C.accent, fontFamily: F.body }}>+ Meta</Text>
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {/* Rodape: alocado + perfil + aporte */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border + '20' }}>
              {classMetaCount > 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 10, fontFamily: F.mono, color: C.dim }}>
                    {'Metas ' + classMetaTotal.toFixed(0) + '%'}
                  </Text>
                  <Text style={{ fontSize: 10, fontFamily: F.mono, fontWeight: '700',
                    color: Math.abs(classMetaRestante) < 0.5 ? C.green : classMetaRestante > 0 ? C.yellow : C.red }}>
                    {Math.abs(classMetaRestante) < 0.5 ? '= 100%' : (classMetaRestante > 0 ? 'Falta ' : 'Excede ') + Math.abs(classMetaRestante).toFixed(1) + '%'}
                  </Text>
                </View>
              ) : <View />}
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity onPress={function() { setShowProfiles(true); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: C.accent + '15' }}>
                  <Ionicons name="people" size={13} color={C.accent} />
                  <Text style={{ fontSize: 11, fontFamily: F.body, color: C.accent }}>Perfil</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={function() { setShowAporte(!showAporte); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: C.green + '15' }}>
                  <Ionicons name="trending-up" size={13} color={C.green} />
                  <Text style={{ fontSize: 11, fontFamily: F.body, color: C.green }}>Aporte</Text>
                </TouchableOpacity>
              </View>
            </View>
            {/* Aporte expandido */}
            {showAporte ? (
              <View style={{ marginTop: 8, backgroundColor: C.green + '06', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.green + '20' }}>
                <Text style={{ fontSize: 13, fontFamily: F.display, fontWeight: '700', color: C.text, marginBottom: 8 }}>Simular Aporte</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <Text style={{ fontSize: 14, fontFamily: F.mono, fontWeight: '600', color: C.text }}>R$</Text>
                  <TextInput
                    style={{ flex: 1, height: 40, borderRadius: 8, borderWidth: 1.5, borderColor: C.green + '40',
                      backgroundColor: C.bg, color: C.text, fontSize: 18, fontFamily: F.mono, fontWeight: '700', textAlign: 'center', paddingVertical: 0 }}
                    value={aporteText}
                    onChangeText={setAporteText}
                    keyboardType="decimal-pad"
                    placeholder="1.000"
                    placeholderTextColor={C.dim}
                  />
                </View>
                {(function() {
                  var aporteVal = parseFloat((aporteText || '0').replace(',', '.')) || 0;
                  var suggestions = aporteVal > 0 ? computeAporteSuggestions(positions, tickerMetas, classMetas, totalValue, aporteVal) : [];
                  if (suggestions.length > 0) {
                    var totalSug = 0;
                    for (var tsi = 0; tsi < suggestions.length; tsi++) { totalSug += suggestions[tsi].valor; }
                    return (
                      <View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text style={{ fontSize: 11, fontFamily: F.body, color: C.dim }}>Distribuicao sugerida</Text>
                          <Text style={{ fontSize: 11, fontFamily: F.mono, color: C.dim }}>{'R$ ' + fmt(totalSug) + ' de R$ ' + fmt(aporteVal)}</Text>
                        </View>
                        <View style={{ gap: 6 }}>
                          {suggestions.slice(0, 10).map(function(s) {
                            var sColor = PRODUCT_COLORS[s.categoria] || C.accent;
                            return (
                              <View key={'sug_' + s.ticker} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: sColor + '08', borderRadius: 8, padding: 8 }}>
                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: sColor, marginRight: 8 }} />
                                <Text style={{ fontSize: 14, fontFamily: F.mono, fontWeight: '700', color: C.text, width: 70 }}>{s.ticker}</Text>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 13, fontFamily: F.body, color: C.text }}>
                                    {s.cotas + (s.cotas === 1 ? ' cota' : ' cotas')}
                                  </Text>
                                  <Text style={{ fontSize: 11, fontFamily: F.mono, color: C.dim }}>
                                    {'R$ ' + fmt(s.preco) + ' cada'}
                                  </Text>
                                </View>
                                <Text style={{ fontSize: 14, fontFamily: F.mono, fontWeight: '700', color: C.green }}>
                                  {'R$ ' + fmt(s.valor)}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    );
                  }
                  if (aporteVal > 0) return (
                    <View style={{ alignItems: 'center', paddingVertical: 10 }}>
                      <Ionicons name="flag-outline" size={20} color={C.dim} />
                      <Text style={{ fontSize: 12, color: C.dim, fontFamily: F.body, textAlign: 'center', marginTop: 4 }}>
                        Defina metas por classe acima para ver sugestoes de compra
                      </Text>
                    </View>
                  );
                  return null;
                })()}
              </View>
            ) : null}
          </View>
        );
      })()}

      {/* ══════ PERFORMANCE FULLSCREEN ══════ */}
      <Modal visible={perfFullscreen} animationType="slide" transparent={false} supportedOrientations={['portrait', 'landscape']}
        onRequestClose={function() { setPerfFullscreen(false); setPerfSelIdx(-1); }}>
        <View style={{ flex: 1, backgroundColor: C.bg }}
          onLayout={function() { var d = Dimensions.get('window'); setScreenDims({ w: d.width, h: d.height }); }}>
          {/* Header linha 1: titulo + fechar */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            paddingTop: 50, paddingHorizontal: 16, paddingBottom: 4 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: C.text, fontFamily: F.display }}>Performance da Carteira</Text>
            <TouchableOpacity onPress={function() { setPerfFullscreen(false); setPerfSelIdx(-1); }}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: C.border + '30' }}>
              <Text style={{ fontSize: 12, color: C.text, fontFamily: F.mono }}>Fechar</Text>
            </TouchableOpacity>
          </View>
          {/* Header linha 2: pills */}
          <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 6 }}>
            {[{ l: 'Carteira', c: C.accent, k: 'cart' }, { l: 'CDI', c: C.rf, k: 'cdi' }, { l: 'IBOV', c: C.etfs, k: 'ibov' }, { l: 'IPCA', c: '#F97316', k: 'ipca' }].map(function(lg) {
              var lgOn = perfSeries[lg.k];
              return (
                <TouchableOpacity key={'fpl_' + lg.k} onPress={function() { var nx = {}; var pks = Object.keys(perfSeries); for (var pi2 = 0; pi2 < pks.length; pi2++) { nx[pks[pi2]] = perfSeries[pks[pi2]]; } nx[lg.k] = !nx[lg.k]; setPerfSeries(nx); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: lgOn ? lg.c + '20' : C.border + '15' }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: lgOn ? lg.c : C.dim }} />
                  <Text style={{ fontSize: 11, fontFamily: F.body, fontWeight: lgOn ? '600' : '400', color: lgOn ? lg.c : C.dim }}>{lg.l}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {/* Grafico — usa onLayout para dimensoes dinamicas */}
          <View style={{ flex: 1, marginHorizontal: 8 }}
            onLayout={function() { /* trigger re-render */ }}
            onStartShouldSetResponder={function() { return true; }}
            onResponderGrant={function(e) {
              var cR2 = computeWeeklyReturns(snapshots);
              var fn = cR2.length; if (fn === 0) return;
              var sw = screenDims.w; var fPadL = 44;
              var fPlotW = sw - 60 - fPadL - 12;
              var tx = e.nativeEvent.locationX - fPadL;
              var slotW = fPlotW / Math.max(1, fn - 1);
              var idx = Math.round(tx / slotW);
              if (idx < 0) idx = 0; if (idx >= fn) idx = fn - 1;
              setPerfSelIdx(idx);
            }}
            onResponderMove={function(e) {
              var cR2 = computeWeeklyReturns(snapshots);
              var fn = cR2.length; if (fn === 0) return;
              var sw = screenDims.w; var fPadL = 44;
              var fPlotW = sw - 60 - fPadL - 12;
              var tx = e.nativeEvent.locationX - fPadL;
              var slotW = fPlotW / Math.max(1, fn - 1);
              var idx = Math.round(tx / slotW);
              if (idx < 0) idx = 0; if (idx >= fn) idx = fn - 1;
              setPerfSelIdx(idx);
            }}>
            {(function() {
              var cR2 = computeWeeklyReturns(snapshots);
              if (cR2.length === 0) return null;
              var sw = screenDims.w;
              var sh = screenDims.h;
              var fChartW = sw - 60;
              var fChartH = sh - 160;
              var fPadL = 44; var fPadR = 12; var fPadT = 12; var fPadB = 28;
              var fPlotW = fChartW - fPadL - fPadR;
              var fPlotH = fChartH - fPadT - fPadB;
              var fn = cR2.length;
              if (fPlotH < 50 || fPlotW < 50) return null;

              var cdiAF = (selicRate || 13.25) - 0.10;
              var cdiSF = (Math.pow(1 + cdiAF / 100, 1 / 52) - 1) * 100;
              var ipcaSF = (Math.pow(1 + 4.5 / 100, 1 / 52) - 1) * 100;
              var cdiRF = {}; var ipcaRF = {}; var ibovRF = {};
              for (var fi = 0; fi < fn; fi++) { cdiRF[cR2[fi].week] = cdiSF; ipcaRF[cR2[fi].week] = ipcaSF; }
              if (ibovHist.length > 0) { var ibWF = computeWeeklyReturns(ibovHist); for (var fi2 = 0; fi2 < ibWF.length; fi2++) { ibovRF[ibWF[fi2].week] = ibWF[fi2].pct; } }

              var fMaxAbs = 1;
              for (var fmi = 0; fmi < fn; fmi++) {
                var fv2 = Math.abs(cR2[fmi].pct); if (fv2 > fMaxAbs) fMaxAbs = fv2;
                var fiv = ibovRF[cR2[fmi].week]; if (fiv != null && Math.abs(fiv) > fMaxAbs) fMaxAbs = Math.abs(fiv);
              }
              fMaxAbs = Math.ceil(fMaxAbs) + 1; if (fMaxAbs < 3) fMaxAbs = 3;
              var fZeroY = fPadT + fPlotH / 2;
              var fValToY = function(v) { return fZeroY - (v / fMaxAbs) * (fPlotH / 2); };
              var fIdxToX = function(i) { return fn === 1 ? fPadL + fPlotW / 2 : fPadL + (i / (fn - 1)) * fPlotW; };
              var fSmooth = function(pts) {
                if (pts.length < 2) return '';
                var d = 'M' + pts[0].x + ',' + pts[0].y;
                for (var j = 1; j < pts.length; j++) { var p = pts[j - 1]; var c = pts[j]; var dx = c.x - p.x; d = d + ' C' + (p.x + dx * 0.3) + ',' + p.y + ' ' + (c.x - dx * 0.3) + ',' + c.y + ' ' + c.x + ',' + c.y; }
                return d;
              };

              var fEls = [];
              var fYSteps = [fMaxAbs, fMaxAbs / 2, 0, -fMaxAbs / 2, -fMaxAbs];
              for (var fyi = 0; fyi < fYSteps.length; fyi++) {
                var fyv = fYSteps[fyi]; var fyp = fValToY(fyv);
                fEls.push(React.createElement(SvgLine, { key: 'fg' + fyi, x1: fPadL, y1: fyp, x2: fPadL + fPlotW, y2: fyp, stroke: fyv === 0 ? C.text + '25' : C.text + '0A', strokeWidth: fyv === 0 ? 1 : 0.5, strokeDasharray: fyv === 0 ? undefined : '5,5' }));
                fEls.push(React.createElement(SvgText, { key: 'fyl' + fyi, x: fPadL - 4, y: fyp + 4, fontSize: 10, fill: C.dim, fontFamily: F.mono, textAnchor: 'end' }, (fyv >= 0 ? '+' : '') + fyv.toFixed(1) + '%'));
              }

              var fSerDefs = [
                { key: 'ipca', on: perfSeries.ipca, color: '#F97316', dash: true, gv: function(wk) { return ipcaRF[wk]; } },
                { key: 'cdi', on: perfSeries.cdi, color: C.rf, dash: true, gv: function(wk) { return cdiRF[wk]; } },
                { key: 'ibov', on: perfSeries.ibov, color: C.etfs, dash: false, gv: function(wk) { return ibovRF[wk]; } },
                { key: 'cart', on: perfSeries.cart, color: C.accent, dash: false, gv: function(wk, idx) { return cR2[idx].pct; } },
              ];
              for (var fsi = 0; fsi < fSerDefs.length; fsi++) {
                var fs = fSerDefs[fsi]; if (!fs.on) continue;
                var fPts = [];
                for (var fpi = 0; fpi < fn; fpi++) { var fpv = fs.gv(cR2[fpi].week, fpi); if (fpv != null) fPts.push({ x: fIdxToX(fpi), y: fValToY(fpv), val: fpv }); }
                if (fPts.length < 2) continue;
                var fPath = fSmooth(fPts); var isCart = fs.key === 'cart';
                if (isCart) {
                  var fGId = 'fsg_' + fs.key;
                  fEls.push(React.createElement(Defs, { key: 'fsd' + fs.key }, React.createElement(SvgGrad, { id: fGId, x1: '0', y1: '0', x2: '0', y2: '1' }, React.createElement(Stop, { offset: '0%', stopColor: fs.color, stopOpacity: '0.3' }), React.createElement(Stop, { offset: '100%', stopColor: fs.color, stopOpacity: '0.02' }))));
                  fEls.push(React.createElement(Path, { key: 'fsa' + fs.key, d: fPath + ' L' + fPts[fPts.length - 1].x + ',' + fZeroY + ' L' + fPts[0].x + ',' + fZeroY + ' Z', fill: 'url(#' + fGId + ')' }));
                  fEls.push(React.createElement(Path, { key: 'fsgl' + fs.key, d: fPath, stroke: fs.color, strokeWidth: 5, fill: 'none', opacity: 0.12, strokeLinecap: 'round' }));
                }
                fEls.push(React.createElement(Path, { key: 'fsl' + fs.key, d: fPath, stroke: fs.color, strokeWidth: isCart ? 3 : 2, fill: 'none', strokeLinecap: 'round', strokeDasharray: fs.dash ? '8,5' : undefined, opacity: fs.dash ? 0.8 : 1 }));
                var fLast = fPts[fPts.length - 1];
                fEls.push(React.createElement(SvgCircle, { key: 'fse' + fs.key, cx: fLast.x, cy: fLast.y, r: 5, fill: fs.color }));
                fEls.push(React.createElement(SvgCircle, { key: 'fsi' + fs.key, cx: fLast.x, cy: fLast.y, r: 2, fill: '#fff' }));
                fEls.push(React.createElement(SvgText, { key: 'fsv' + fs.key, x: fLast.x, y: fLast.y - 10, fontSize: 11, fill: fs.color, fontFamily: F.mono, fontWeight: '700', textAnchor: 'middle' }, (fLast.val >= 0 ? '+' : '') + fLast.val.toFixed(2) + '%'));
              }
              for (var fxi = 0; fxi < fn; fxi++) {
                var fShowX = fn <= 20 || fxi % Math.ceil(fn / 12) === 0 || fxi === fn - 1;
                if (fShowX && cR2[fxi].date) { var fdp = cR2[fxi].date.split('-'); fEls.push(React.createElement(SvgText, { key: 'fxl' + fxi, x: fIdxToX(fxi), y: fChartH - 4, fontSize: 9, fill: C.dim, fontFamily: F.mono, textAnchor: 'middle' }, fdp[2] + '/' + fdp[1])); }
              }
              if (perfSelIdx >= 0 && perfSelIdx < fn) {
                var fSelX = fIdxToX(perfSelIdx);
                fEls.push(React.createElement(SvgLine, { key: 'fcrs', x1: fSelX, y1: fPadT, x2: fSelX, y2: fChartH - fPadB, stroke: C.text + '40', strokeWidth: 1, strokeDasharray: '4,4' }));
                for (var fci = 0; fci < fSerDefs.length; fci++) { var fcs = fSerDefs[fci]; if (!fcs.on) continue; var fcv = fcs.gv(cR2[perfSelIdx].week, perfSelIdx); if (fcv == null) continue; fEls.push(React.createElement(SvgCircle, { key: 'fcrD' + fcs.key, cx: fSelX, cy: fValToY(fcv), r: 5, fill: fcs.color })); fEls.push(React.createElement(SvgCircle, { key: 'fcrI' + fcs.key, cx: fSelX, cy: fValToY(fcv), r: 2, fill: '#fff' })); }
              }
              return React.createElement(Svg, { width: fChartW, height: fChartH }, fEls);
            })()}
          </View>
          {/* Tooltip */}
          {(function() {
            var cR2 = computeWeeklyReturns(snapshots);
            if (perfSelIdx < 0 || perfSelIdx >= cR2.length) return null;
            var FNAMES = { cart: 'Carteira', cdi: 'CDI', ibov: 'IBOV', ipca: 'IPCA' };
            var cdiAF2 = (selicRate || 13.25) - 0.10;
            var cdiSF2 = (Math.pow(1 + cdiAF2 / 100, 1 / 52) - 1) * 100;
            var ipcaSF2 = (Math.pow(1 + 4.5 / 100, 1 / 52) - 1) * 100;
            var vals = [];
            if (perfSeries.cart) vals.push({ l: 'Carteira', c: C.accent, v: cR2[perfSelIdx].pct });
            if (perfSeries.cdi) vals.push({ l: 'CDI', c: C.rf, v: cdiSF2 });
            if (perfSeries.ibov && ibovHist.length > 0) {
              var ibW2 = computeWeeklyReturns(ibovHist);
              var ibMap2 = {}; for (var ib2 = 0; ib2 < ibW2.length; ib2++) { ibMap2[ibW2[ib2].week] = ibW2[ib2].pct; }
              var ibv2 = ibMap2[cR2[perfSelIdx].week];
              if (ibv2 != null) vals.push({ l: 'IBOV', c: C.etfs, v: ibv2 });
            }
            if (perfSeries.ipca) vals.push({ l: 'IPCA', c: '#F97316', v: ipcaSF2 });
            var dp4 = cR2[perfSelIdx].date.split('-');
            return (
              <View style={{ paddingHorizontal: 16, paddingBottom: 20 }}>
                <View style={{ backgroundColor: C.text + '08', borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Text style={{ fontSize: 12, fontFamily: F.mono, fontWeight: '600', color: C.text }}>{dp4[2] + '/' + dp4[1] + '/' + dp4[0]}</Text>
                  {vals.map(function(vv) {
                    return (
                      <View key={'ftt_' + vv.l} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: vv.c }} />
                        <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body }}>{vv.l}</Text>
                        <Text style={{ fontSize: 11, fontFamily: F.mono, fontWeight: '700', color: vv.v >= 0 ? C.green : C.red }}>
                          {(vv.v >= 0 ? '+' : '') + vv.v.toFixed(2) + '%'}
                        </Text>
                      </View>
                    );
                  })}
                  <TouchableOpacity onPress={function() { setPerfSelIdx(-1); }} style={{ marginLeft: 'auto' }}>
                    <Ionicons name="close-circle" size={16} color={C.dim} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })()}
        </View>
      </Modal>

      {/* ══════ PROFILE MODAL ══════ */}
      <Modal visible={showProfiles} transparent animationType="fade" onRequestClose={function() { setShowProfiles(false); }}>
        <TouchableOpacity activeOpacity={1} onPress={function() { setShowProfiles(false); }}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: C.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 }}>
            <Text style={{ fontSize: 16, fontFamily: F.display, fontWeight: '700', color: C.text, marginBottom: 14, textAlign: 'center' }}>Perfil de Investidor</Text>
            {['conservador', 'moderado', 'arrojado'].map(function(pk) {
              var prof = PROFILES[pk];
              return (
                <TouchableOpacity key={pk} onPress={function() {
                  animateLayout();
                  // Apply profile: set sector metas from classes as flat %
                  var classKeys = Object.keys(prof.classes);
                  var newSM = {};
                  for (var ci = 0; ci < classKeys.length; ci++) { newSM[classKeys[ci]] = prof.classes[classKeys[ci]]; }
                  // Set cap metas
                  var newCM = {};
                  var capKeys = Object.keys(prof.acaoCaps);
                  for (var ki = 0; ki < capKeys.length; ki++) { newCM[capKeys[ki]] = prof.acaoCaps[capKeys[ki]]; }
                  setCapMetas(newCM);
                  // Persist
                  var existing = _rebalTargetsRef.current || {};
                  var stFull = {};
                  var exST = existing.sector_targets || {};
                  var exSTKeys = Object.keys(exST);
                  for (var ei = 0; ei < exSTKeys.length; ei++) { stFull[exSTKeys[ei]] = exST[exSTKeys[ei]]; }
                  stFull._capGroup = newCM;
                  upsertRebalanceTargets(user.id, {
                    class_targets: prof.classes,
                    sector_targets: stFull,
                    ticker_targets: existing.ticker_targets || {},
                  }).catch(function() {});
                  setShowProfiles(false);
                  Toast.show({ type: 'success', text1: 'Perfil ' + prof.label + ' aplicado' });
                }}
                  style={{ backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: C.border + '30' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 18 }}>{prof.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontFamily: F.display, fontWeight: '700', color: C.text }}>{prof.label}</Text>
                      <Text style={{ fontSize: 11, fontFamily: F.body, color: C.dim, marginTop: 2 }}>{prof.desc}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={C.dim} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ══════ 10. POSITION CARDS ══════ */}
      {(function() {
        // Total do tipo filtrado (para % relativa)
        var typeTotal = 0;
        for (var tti = 0; tti < filteredPositions.length; tti++) {
          var tp = filteredPositions[tti];
          typeTotal += tp.quantidade * (tp.preco_atual || tp.pm);
        }
        var typeLabel = (function() {
          var af = FILTERS.find(function(f) { return f.k === filter; });
          return af ? af.l : 'Todos';
        })();

        var renderCard = function(pos, i) {
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
              onAiAnalysis={sub.canAccess('AI_ANALYSIS') ? function () { setPendingAiCard({ ticker: pos.ticker, mercado: pos.mercado }); setAiConfirmVisible(true); } : null}
              onToggle={function () { toggleExpand(key, pos.ticker, pos.mercado); }}
              onBuy={function () { nav('AddOperacao', { ticker: pos.ticker, tipo: 'compra', categoria: pos.categoria }); }}
              onSell={function () { nav('AddOperacao', { ticker: pos.ticker, tipo: 'venda', categoria: pos.categoria }); }}
              onLancarOpcao={function () { nav('AddOpcao', { ativo_base: pos.ticker }); }}
              onTransacoes={function () { nav('AssetDetail', { ticker: pos.ticker, mercado: pos.mercado, portfolioId: portfolioId }); }}
              onComparar={function () { nav('Analise', { forcedTab: 'compar', initialTickers: [pos.ticker] }); }}
              onAlerta={function () { nav('AddAlertaPreco', { ticker: pos.ticker, precoAtual: pos.preco_atual }); }}
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
              onSetMeta={handleSetMeta}
              metaTotalPct={metaTotalPct}
              typeTotal={filter !== 'todos' ? typeTotal : null}
              typeLabel={filter !== 'todos' ? typeLabel : null} />
          );
        };

        // ── Funcao reutilizavel de header de grupo ──
        var toggleGroup = function(gName) {
          animateLayout();
          var next = {};
          var egKeys = Object.keys(expandedGroups);
          for (var egi = 0; egi < egKeys.length; egi++) { next[egKeys[egi]] = expandedGroups[egKeys[egi]]; }
          next[gName] = !next[gName];
          setExpandedGroups(next);
        };

        var renderGroupHeader = function(gName, gData, metaVal, onSetMeta, dotColor, metaAllocInfo) {
          var gPct = totalValue > 0 ? (gData.totalVal / totalValue) * 100 : 0;
          var gHasMeta = metaVal != null && metaVal !== '';
          var gMetaVal = gHasMeta ? parseFloat(metaVal) : 0;
          var gDiff = gHasMeta ? gPct - gMetaVal : 0;
          var gDiffColor = gHasMeta ? (Math.abs(gDiff) < 0.5 ? C.green : (gDiff > 0 ? C.etfs : C.red)) : C.dim;
          var gBarPct = gHasMeta && gMetaVal > 0 ? Math.min(100, (gPct / gMetaVal) * 100) : 0;
          var isEd = editingGroup === gName;
          var isOpen = !!expandedGroups[gName];
          var valFmt = gData.totalVal >= 1000 ? ('R$ ' + (gData.totalVal / 1000).toFixed(1) + 'k') : ('R$ ' + gData.totalVal.toFixed(0));

          var submitMeta = function() {
            var sv = groupMetaInput.replace(',', '.');
            if (sv === '' || isNaN(parseFloat(sv))) {
              onSetMeta(gName, null);
            } else {
              onSetMeta(gName, parseFloat(sv));
            }
            setEditingGroup(null);
          };

          return (
            <View style={{ backgroundColor: C.accent + '08', borderRadius: 12, marginBottom: 4, borderWidth: 1,
              borderColor: isOpen ? (dotColor || C.accent) + '40' : C.border + '30', overflow: 'hidden' }}>
              {/* Linha 1: toggle + nome + info */}
              <TouchableOpacity activeOpacity={0.7} onPress={function() { toggleGroup(gName); }}
                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 9, paddingBottom: 5 }}>
                <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={16} color={dotColor || C.accent} style={{ marginRight: 6 }} />
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dotColor || C.accent, marginRight: 6 }} />
                <Text style={{ fontSize: 13, color: C.text, fontFamily: F.display, fontWeight: '700', flex: 1 }}>{gName}</Text>
                <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, marginRight: 8 }}>{gData.positions.length + ' ativos'}</Text>
                <Text style={{ fontSize: 12, color: C.text, fontFamily: F.mono, fontWeight: '700' }}>{gPct.toFixed(1) + '%'}</Text>
              </TouchableOpacity>
              {/* Linha 2: valor + botao de meta grande e claro */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 8 }}>
                <Text style={{ fontSize: 12, fontFamily: F.mono, color: C.dim }}>{valFmt}</Text>
                {/* Botao META — grande e obvio */}
                {isEd ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.accent + '15',
                    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Ionicons name="flag" size={13} color={C.accent} />
                    <Text style={{ fontSize: 11, color: C.accent, fontFamily: F.body }}>Meta</Text>
                    <TextInput
                      style={{ width: 50, height: 26, borderRadius: 6, borderWidth: 1.5, borderColor: C.accent,
                        backgroundColor: C.bg, color: C.text, fontSize: 13, fontFamily: F.mono, fontWeight: '700', textAlign: 'center', paddingVertical: 0 }}
                      value={groupMetaInput}
                      onChangeText={setGroupMetaInput}
                      keyboardType="decimal-pad"
                      autoFocus
                      maxLength={5}
                      returnKeyType="done"
                      onSubmitEditing={submitMeta}
                      onBlur={submitMeta}
                    />
                    <Text style={{ fontSize: 12, color: C.accent, fontFamily: F.mono, fontWeight: '600' }}>%</Text>
                  </View>
                ) : gHasMeta ? (
                  <TouchableOpacity onPress={function() { setGroupMetaInput(String(gMetaVal)); setEditingGroup(gName); }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.accent + '15',
                      borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Ionicons name="flag" size={13} color={C.accent} />
                    <Text style={{ fontSize: 13, color: C.accent, fontFamily: F.mono, fontWeight: '700' }}>{gMetaVal.toFixed(1) + '%'}</Text>
                    <View style={{ backgroundColor: gDiffColor + '20', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                      <Text style={{ fontSize: 11, fontFamily: F.mono, fontWeight: '700', color: gDiffColor }}>
                        {(gDiff >= 0 ? '+' : '') + gDiff.toFixed(1) + '%'}
                      </Text>
                    </View>
                    <Ionicons name="pencil" size={11} color={C.dim} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={function() { setGroupMetaInput(''); setEditingGroup(gName); }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.border + '25',
                      borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: C.border + '40', borderStyle: 'dashed' }}>
                    <Ionicons name="flag-outline" size={13} color={C.dim} />
                    <Text style={{ fontSize: 12, color: C.dim, fontFamily: F.body }}>Definir meta %</Text>
                  </TouchableOpacity>
                )}
              </View>
              {/* Progress bar */}
              {gHasMeta && gMetaVal > 0 ? (
                <View style={{ height: 3, backgroundColor: C.border + '40', marginHorizontal: 12, marginBottom: 6, borderRadius: 2, overflow: 'hidden' }}>
                  <View style={{ height: 3, borderRadius: 2, backgroundColor: gDiffColor, width: gBarPct + '%' }} />
                </View>
              ) : null}
              {/* Indicador de alocacao quando editando */}
              {isEd && metaAllocInfo ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, paddingHorizontal: 12, paddingBottom: 6 }}>
                  <Text style={{ fontSize: 10, fontFamily: F.mono, color: C.dim }}>
                    {'Alocado ' + metaAllocInfo.total.toFixed(0) + '%'}
                  </Text>
                  <Text style={{ fontSize: 10, fontFamily: F.mono, fontWeight: '700',
                    color: Math.abs(metaAllocInfo.restante) < 0.5 ? C.green : metaAllocInfo.restante > 0 ? C.yellow : C.red }}>
                    {Math.abs(metaAllocInfo.restante) < 0.5 ? '= 100%' : (metaAllocInfo.restante > 0 ? 'Falta ' : 'Excede ') + Math.abs(metaAllocInfo.restante).toFixed(1) + '%'}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        };

        // ── Helper: setor/segmento com fallback para FIIs ──
        var getSectorInfo = function(pos) {
          var info = TICKER_SECTORS[pos.ticker];
          if (info) return info;
          // Fallbacks por categoria para tickers nao mapeados
          if (pos.categoria === 'fii') return { setor: 'Papel/CRI', segmento: 'Recebiveis' };
          if (pos.categoria === 'etf') {
            if (pos.mercado === 'INT') return { setor: 'Internacional', segmento: 'ETF Global' };
            return { setor: 'Ibovespa', segmento: 'ETF Brasil' };
          }
          if (pos.categoria === 'stock_int') return { setor: 'Stocks', segmento: 'Acao Global' };
          if (pos.categoria === 'reit') return { setor: 'REITs', segmento: 'REIT' };
          if (pos.categoria === 'bdr') return { setor: 'BDRs', segmento: 'BDR' };
          if (pos.categoria === 'adr') return { setor: 'ADRs', segmento: 'ADR' };
          return null;
        };

        // ── Funcao generica de agrupamento ──
        var buildGroups = function(keyFn, orderFn) {
          var gMap = {};
          var gOrder = [];
          for (var gi = 0; gi < filteredPositions.length; gi++) {
            var gp = filteredPositions[gi];
            var gKey = keyFn(gp);
            if (!gMap[gKey]) {
              gMap[gKey] = { positions: [], totalVal: 0 };
              gOrder.push(gKey);
            }
            gMap[gKey].positions.push(gp);
            gMap[gKey].totalVal += gp.quantidade * (gp.preco_atual || gp.pm);
          }
          if (orderFn) {
            gOrder.sort(function(a, b) { return orderFn(a, b, gMap); });
          } else {
            gOrder.sort(function(a, b) { return gMap[b].totalVal - gMap[a].totalVal; });
          }
          return { map: gMap, order: gOrder };
        };

        var renderGrouped = function(groups, metaMap, onSetMeta, colorFn) {
          // Barra de alocacao 100% no topo
          var ALLOC_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16', '#A855F7'];
          // Dados do segmento selecionado
          var selSegData = selAllocSeg ? groups.map[selAllocSeg] : null;
          var selSegPct = selSegData && totalValue > 0 ? (selSegData.totalVal / totalValue) * 100 : 0;
          var selSegMeta = selAllocSeg ? metaMap[selAllocSeg] : null;

          // Total filtrado (soma de todos os grupos)
          var filteredTotal = 0;
          for (var fti = 0; fti < groups.order.length; fti++) {
            filteredTotal += groups.map[groups.order[fti]].totalVal;
          }
          var filteredPctOfTotal = totalValue > 0 ? (filteredTotal / totalValue) * 100 : 0;
          var activeFilter = FILTERS.find(function(f) { return f.k === filter; });
          var filterLabel = activeFilter ? activeFilter.l : 'Ativos';
          var filterColor = activeFilter ? activeFilter.color : C.accent;

          // Calcular total de metas e restante
          var metaTotal = 0;
          var metaCount = 0;
          var mmKeys = Object.keys(metaMap);
          for (var mmi = 0; mmi < mmKeys.length; mmi++) {
            var mv = parseFloat(metaMap[mmKeys[mmi]]);
            if (!isNaN(mv)) { metaTotal += mv; metaCount++; }
          }
          var metaRestante = 100 - metaTotal;
          var metaRestanteColor = Math.abs(metaRestante) < 0.5 ? C.green : metaRestante > 0 ? C.yellow : C.red;

          var allocBar = (
            <View key="alloc_bar" style={{ backgroundColor: C.card || C.accent + '06', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border + '25' }}>
              {/* Header com totais */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 }}>
                <View>
                  <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body }}>{'Total ' + filterLabel}</Text>
                  <Text style={{ fontSize: 18, fontFamily: F.mono, fontWeight: '700', color: filterColor }}>
                    {'R$ ' + (filteredTotal >= 100000 ? (filteredTotal / 1000).toFixed(1) + 'k' : filteredTotal.toFixed(0))}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body }}>Total Carteira</Text>
                  <Text style={{ fontSize: 14, fontFamily: F.mono, fontWeight: '600', color: C.text }}>
                    {'R$ ' + (totalValue >= 100000 ? (totalValue / 1000).toFixed(1) + 'k' : totalValue.toFixed(0))}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body }}>Peso</Text>
                  <Text style={{ fontSize: 14, fontFamily: F.mono, fontWeight: '600', color: filterColor }}>
                    {filteredPctOfTotal.toFixed(1) + '%'}
                  </Text>
                </View>
              </View>

              {/* Indicador de metas: alocado / restante */}
              {metaCount > 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 8, paddingVertical: 5, paddingHorizontal: 8,
                  backgroundColor: metaRestanteColor + '10', borderRadius: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="pie-chart" size={12} color={metaRestanteColor} />
                    <Text style={{ fontSize: 11, fontFamily: F.body, color: C.text }}>Meta alocada</Text>
                    <Text style={{ fontSize: 12, fontFamily: F.mono, fontWeight: '700', color: C.text }}>{metaTotal.toFixed(0) + '%'}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 11, fontFamily: F.body, color: C.dim }}>
                      {Math.abs(metaRestante) < 0.5 ? 'Completo' : metaRestante > 0 ? 'Falta' : 'Excede'}
                    </Text>
                    {Math.abs(metaRestante) >= 0.5 ? (
                      <Text style={{ fontSize: 12, fontFamily: F.mono, fontWeight: '700', color: metaRestanteColor }}>
                        {Math.abs(metaRestante).toFixed(1) + '%'}
                      </Text>
                    ) : (
                      <Ionicons name="checkmark-circle" size={14} color={C.green} />
                    )}
                  </View>
                </View>
              ) : null}

              {/* Barra segmentada clicavel */}
              <View style={{ flexDirection: 'row', height: 18, borderRadius: 9, overflow: 'hidden', backgroundColor: C.border + '30' }}>
                {groups.order.map(function(gName, gi) {
                  var gData = groups.map[gName];
                  var pct = totalValue > 0 ? (gData.totalVal / totalValue) * 100 : 0;
                  if (pct < 0.5) return null;
                  var col = colorFn ? colorFn(gName) : ALLOC_COLORS[gi % ALLOC_COLORS.length];
                  var isSel = selAllocSeg === gName;
                  return (
                    <TouchableOpacity key={'ab_' + gName} activeOpacity={0.7}
                      onPress={function() { setSelAllocSeg(selAllocSeg === gName ? null : gName); }}
                      style={{ width: pct + '%', height: 18, backgroundColor: col,
                        justifyContent: 'center', alignItems: 'center',
                        opacity: selAllocSeg && !isSel ? 0.4 : 1 }}>
                      {pct >= 8 ? (
                        <Text style={{ fontSize: 9, fontFamily: F.mono, color: '#fff', fontWeight: '700' }}>{Math.round(pct) + '%'}</Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Painel de detalhe do segmento selecionado */}
              {selSegData ? (function() {
                var selCol = colorFn ? colorFn(selAllocSeg) : C.accent;
                var selMetaVal = selSegMeta != null && !isNaN(parseFloat(selSegMeta)) ? parseFloat(selSegMeta) : null;
                var selDiff = selMetaVal != null ? selSegPct - selMetaVal : null;
                // P&L total do grupo
                var grpPnl = 0;
                for (var si = 0; si < selSegData.positions.length; si++) {
                  var sp = selSegData.positions[si];
                  var spVal = sp.quantidade * (sp.preco_atual || sp.pm);
                  var spCost = sp.quantidade * sp.pm;
                  grpPnl += spVal - spCost;
                }
                var grpPnlPct = selSegData.totalVal > 0 ? (grpPnl / (selSegData.totalVal - grpPnl)) * 100 : 0;
                var pnlColor = grpPnl >= 0 ? C.green : C.red;

                return (
                  <View style={{ marginTop: 10, backgroundColor: selCol + '10', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: selCol + '25' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: selCol }} />
                        <Text style={{ fontSize: 15, fontFamily: F.display, fontWeight: '700', color: C.text }}>{selAllocSeg}</Text>
                      </View>
                      <TouchableOpacity onPress={function() { setSelAllocSeg(null); }}>
                        <Ionicons name="close-circle" size={20} color={C.dim} />
                      </TouchableOpacity>
                    </View>
                    {/* Metricas em grid */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      <View style={{ minWidth: '45%' }}>
                        <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body }}>Valor</Text>
                        <Text style={{ fontSize: 14, fontFamily: F.mono, fontWeight: '700', color: C.text }}>
                          {'R$ ' + (selSegData.totalVal >= 10000 ? (selSegData.totalVal / 1000).toFixed(1) + 'k' : selSegData.totalVal.toFixed(0))}
                        </Text>
                      </View>
                      <View style={{ minWidth: '45%' }}>
                        <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body }}>% Carteira</Text>
                        <Text style={{ fontSize: 14, fontFamily: F.mono, fontWeight: '700', color: C.text }}>{selSegPct.toFixed(1) + '%'}</Text>
                      </View>
                      <View style={{ minWidth: '45%' }}>
                        <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body }}>{'% ' + filterLabel}</Text>
                        <Text style={{ fontSize: 14, fontFamily: F.mono, fontWeight: '700', color: filterColor }}>
                          {(filteredTotal > 0 ? (selSegData.totalVal / filteredTotal * 100).toFixed(1) : '0.0') + '%'}
                        </Text>
                      </View>
                      <View style={{ minWidth: '45%' }}>
                        <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body }}>P&L</Text>
                        <Text style={{ fontSize: 14, fontFamily: F.mono, fontWeight: '700', color: pnlColor }}>
                          {(grpPnl >= 0 ? '+' : '') + 'R$ ' + (Math.abs(grpPnl) >= 10000 ? (grpPnl / 1000).toFixed(1) + 'k' : grpPnl.toFixed(0))}
                          {'  (' + (grpPnlPct >= 0 ? '+' : '') + grpPnlPct.toFixed(1) + '%)'}
                        </Text>
                      </View>
                      {selMetaVal != null ? (
                        <View style={{ minWidth: '45%' }}>
                          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body }}>Meta</Text>
                          <Text style={{ fontSize: 14, fontFamily: F.mono, fontWeight: '700',
                            color: Math.abs(selDiff) < 0.5 ? C.green : (selDiff > 0 ? C.etfs : C.red) }}>
                            {selMetaVal.toFixed(1) + '%  (' + (selDiff >= 0 ? '+' : '') + selDiff.toFixed(1) + '%)'}
                          </Text>
                        </View>
                      ) : null}
                      <View style={{ minWidth: '45%' }}>
                        <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body }}>Ativos</Text>
                        <Text style={{ fontSize: 14, fontFamily: F.mono, fontWeight: '700', color: C.text }}>{selSegData.positions.length}</Text>
                      </View>
                    </View>
                    {/* Lista de tickers do grupo */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8, borderTopWidth: 1, borderTopColor: selCol + '20', paddingTop: 8 }}>
                      {selSegData.positions.map(function(sp) {
                        var spVal = sp.quantidade * (sp.preco_atual || sp.pm);
                        var spPctTotal = totalValue > 0 ? (spVal / totalValue) * 100 : 0;
                        var spPctType = filteredTotal > 0 ? (spVal / filteredTotal) * 100 : 0;
                        return (
                          <View key={'st_' + sp.ticker} style={{ backgroundColor: selCol + '15', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                            <Text style={{ fontSize: 11, fontFamily: F.mono, fontWeight: '600', color: C.text }}>{sp.ticker}</Text>
                            <Text style={{ fontSize: 9, fontFamily: F.mono, color: C.dim }}>
                              {spPctTotal.toFixed(1) + '% cart. · ' + spPctType.toFixed(1) + '% ' + filterLabel.toLowerCase()}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })() : null}

              {/* Labels compactas (quando nenhum selecionado) */}
              {!selAllocSeg ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                  {groups.order.map(function(gName, gi) {
                    var gData = groups.map[gName];
                    var pctType = filteredTotal > 0 ? (gData.totalVal / filteredTotal) * 100 : 0;
                    var col = colorFn ? colorFn(gName) : ALLOC_COLORS[gi % ALLOC_COLORS.length];
                    return (
                      <TouchableOpacity key={'al_' + gName} activeOpacity={0.7}
                        onPress={function() { setSelAllocSeg(gName); }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: col + '15',
                          borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
                        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: col }} />
                        <Text style={{ fontSize: 11, fontFamily: F.body, color: C.text }}>{gName}</Text>
                        <Text style={{ fontSize: 11, fontFamily: F.mono, fontWeight: '600', color: col }}>{pctType.toFixed(0) + '%'}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );

          var cards = groups.order.map(function(gName, gi) {
            var gData = groups.map[gName];
            var dotCol = colorFn ? colorFn(gName) : ALLOC_COLORS[gi % ALLOC_COLORS.length];
            var isGrpOpen = !!expandedGroups[gName];
            return (
              <View key={'grp_' + gName} style={{ marginBottom: 4 }}>
                {renderGroupHeader(gName, gData, metaMap[gName], onSetMeta, dotCol, { total: metaTotal, restante: metaRestante })}
                {isGrpOpen ? gData.positions.map(function(pos, i) { return renderCard(pos, i); }) : null}
              </View>
            );
          });

          return [allocBar].concat(cards);
        };

        if (groupBy === 'setor') {
          var sGroups = buildGroups(function(p) {
            var sInfo = getSectorInfo(p);
            return sInfo ? sInfo.setor : 'Outros';
          });
          return renderGrouped(sGroups, sectorMetas, handleSetSectorMeta);
        }

        if (groupBy === 'segmento') {
          var sgGroups = buildGroups(function(p) {
            var sInfo = getSectorInfo(p);
            return sInfo ? sInfo.segmento : 'Outros';
          });
          return renderGrouped(sgGroups, segmentoMetas, handleSetSegmentoMeta);
        }

        if (groupBy === 'cap') {
          var cGroups = buildGroups(
            function(p) { return classifyMarketCap(p.marketCap); },
            function(a, b) { return CAP_ORDER.indexOf(a) - CAP_ORDER.indexOf(b); }
          );
          return renderGrouped(cGroups, capMetas, handleSetCapGroupMeta, function(name) {
            return CAP_COLORS[name] || C.accent;
          });
        }

        if (groupBy === 'tipo_fii') {
          var FII_TIPO_ORDER = ['Tijolo', 'Papel', 'Hibrido', 'Outros'];
          var FII_TIPO_COLORS = { 'Tijolo': '#10B981', 'Papel': '#3B82F6', 'Hibrido': '#F59E0B', 'Outros': '#6B7280' };
          var fiiGroups = buildGroups(
            function(p) {
              var sInfo = getSectorInfo(p);
              if (!sInfo) return 'Outros';
              return FII_REBAL_MAP[sInfo.setor] || 'Outros';
            },
            function(a, b) { return FII_TIPO_ORDER.indexOf(a) - FII_TIPO_ORDER.indexOf(b); }
          );
          return renderGrouped(fiiGroups, sectorMetas, handleSetSectorMeta, function(name) {
            return FII_TIPO_COLORS[name] || C.accent;
          });
        }

        // Flat mode (default)
        return filteredPositions.map(function(pos, i) { return renderCard(pos, i); });
      })()}

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
                var catColor = e.categoria === 'acao' ? C.acoes : e.categoria === 'fii' ? C.fiis : e.categoria === 'etf' ? C.etfs : e.categoria === 'bdr' ? C.bdr : e.categoria === 'stock_int' ? C.stock_int : e.categoria === 'adr' ? C.adr : e.categoria === 'reit' ? C.reit : C.accent;
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
                    {formatQty(selectedTile.quantidade)}
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
    <Fab navigation={navigation} extraItems={
      sub.canAccess('AI_ANALYSIS') ? [
        { label: 'Análise IA', icon: 'sparkles', color: C.accent, onPress: function() { setAiConfirmVisible(true); } },
      ] : undefined
    } />
    )}

    {/* AI Confirm Modal */}
    <AiConfirmModal
      visible={aiConfirmVisible}
      navigation={navigation}
      analysisType={pendingAiCard ? ('Análise IA de ' + pendingAiCard.ticker) : 'Análise da carteira'}
      onCancel={function() { setAiConfirmVisible(false); setPendingAiCard(null); }}
      onConfirm={function() {
        setAiConfirmVisible(false);
        if (pendingAiCard) {
          var t = pendingAiCard.ticker;
          var m = pendingAiCard.mercado;
          setPendingAiCard(null);
          nav('AssetDetail', { ticker: t, mercado: m, autoAi: true, portfolioId: portfolioId });
        } else {
          handleAiCarteira();
        }
      }}
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
