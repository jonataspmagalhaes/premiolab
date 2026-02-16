import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity,
} from 'react-native';
import Svg, {
  Circle, Rect as SvgRect, G,
  Text as SvgText, Line as SvgLine, Path,
} from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import {
  getDashboard, getProventos,
  getOperacoes, getProfile,
} from '../../services/database';
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

var CAT_COLORS = { acao: C.acoes, fii: C.fiis, etf: C.etfs };
var CAT_LABELS = { acao: 'Ações', fii: 'FIIs', etf: 'ETFs' };

// ═══════════ HELPERS ═══════════

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtK(v) {
  if (Math.abs(v) >= 1000000) return (v / 1000000).toFixed(1) + 'M';
  if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + 'k';
  return v.toFixed(0);
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
                  R$ {d.value.toFixed(0)}
                </SvgText>
              </G>
            );
          })}
        </Svg>
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

  // ── Data loading ──
  var load = async function() {
    if (!user) return;
    try {
      var results = await Promise.all([
        getDashboard(user.id),
        getProventos(user.id),
        getOperacoes(user.id),
        getProfile(user.id),
      ]);
      setDashboard(results[0]);
      setPositions(results[0].positions || []);
      setProventos(results[1].data || []);
      setOperacoes(results[2].data || []);
      setProfile(results[3].data || null);
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
          {/* Hero */}
          <Glass glow={C.accent} padding={16}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View>
                <Text style={styles.heroLabel}>PATRIMONIO TOTAL</Text>
                <Text style={styles.heroValue}>R$ {fmtK(totalPatrimonio)}</Text>
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
                        R$ {fmtK(totalAlocPatrimonio)}
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
                    <Text style={{ fontSize: 7, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 }}>{d.l}</Text>
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
  heroLabel: { fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.6 },
  heroValue: { fontSize: 24, fontWeight: '800', color: C.text, fontFamily: F.display, marginTop: 2, letterSpacing: -0.5 },
  heroPct: { fontSize: 18, fontWeight: '700', fontFamily: F.mono, marginTop: 2 },
  heroPctSub: { fontSize: 9, fontFamily: F.mono, marginTop: 1 },

  // Period pills
  periodRow: { flexDirection: 'row', gap: 6 },
  periodPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  periodPillActive: { backgroundColor: C.accent + '20', borderColor: C.accent + '50' },
  periodPillInactive: { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)' },
  periodPillText: { fontSize: 10, fontWeight: '700', fontFamily: F.mono, letterSpacing: 0.5 },

  // KPI
  kpiRow: { flexDirection: 'row', gap: 8 },
  kpiCard: { alignItems: 'center', gap: 2 },
  kpiLabel: { fontSize: 7, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 },
  kpiValue: { fontSize: 16, fontWeight: '800', fontFamily: F.display },
  kpiSub: { fontSize: 8, color: C.dim, fontFamily: F.mono },

  // Section
  sectionTitle: { fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.6, marginBottom: 2 },

  // Benchmark legend
  benchLegend: { flexDirection: 'row', gap: 16, marginTop: 8 },
  benchLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  benchLegendDot: { width: 12, height: 2, borderRadius: 1 },
  benchLegendLabel: { fontSize: 9, color: C.dim, fontFamily: F.mono },
  benchLegendValue: { fontSize: 9, fontWeight: '600', fontFamily: F.mono },

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
  irSummaryLabel: { fontSize: 7, color: C.dim, fontFamily: F.mono, letterSpacing: 0.3 },
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
});
