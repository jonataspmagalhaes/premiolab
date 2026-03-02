// ═══════════════════════════════════════════════════════════
// FinancasView — Dashboard de Finanças Pessoais
// Renderizado dentro de GestaoScreen quando pill "Finanças" ativa
// Recebe props.navigation
// ═══════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { C, F, SIZE } from '../../theme';
import { Glass, Pill, Badge, SectionLabel, EmptyState, InfoTip, PressableCard } from '../../components';
import { usePrivacyStyle } from '../../components/Sensitive';
import Sensitive from '../../components/Sensitive';
import { Fab } from '../../components';
import { useAuth } from '../../contexts/AuthContext';
import { getFinancasSummary, getOrcamentos, getRecorrentes, getMovimentacoes } from '../../services/database';
import { getSymbol, fetchExchangeRates } from '../../services/currencyService';
var finCats = require('../../constants/financeCategories');

// ── Meses ──
var MESES_FULL = finCats.MESES_FULL;

// ── Cores por grupo para donut (fallback) ──
var DONUT_COLORS = [
  '#3B82F6', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4',
  '#E879F9', '#10B981', '#F97316', '#6366F1', '#555577',
];

// ── FAB items ──
var FAB_ITEMS = [
  { label: 'Despesa', icon: 'arrow-up-circle-outline', color: C.red, screen: 'AddMovimentacao', params: { presetTipo: 'saida' } },
  { label: 'Cartão', icon: 'card-outline', color: C.accent, screen: 'AddMovimentacao', params: { presetTipo: 'saida', presetPayMethod: 'cartao' } },
  { label: 'Receita', icon: 'arrow-down-circle-outline', color: C.green, screen: 'AddMovimentacao', params: { presetTipo: 'entrada' } },
  { label: 'Recorrentes', icon: 'repeat-outline', color: C.rf, screen: 'Recorrentes' },
];

// ═══════════════════════════════════════════════════════════
// HELPER: Formatar valor monetário
// ═══════════════════════════════════════════════════════════
function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtCompact(v) {
  if (Math.abs(v) >= 1000) {
    return (v / 1000).toFixed(1) + 'k';
  }
  return fmt(v);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  var parts = dateStr.substring(0, 10).split('-');
  if (parts.length !== 3) return dateStr;
  return parts[2] + '/' + parts[1];
}

// ═══════════════════════════════════════════════════════════
// DONUT CHART — Gráfico de rosca interativo
// ═══════════════════════════════════════════════════════════
function DonutChart(props) {
  var segments = props.segments || [];
  var s = props.size || 140;
  var selected = props.selected != null ? props.selected : -1;
  var onSelect = props.onSelect;
  var strokeW = 12;
  var r = (s / 2) - strokeW;
  var circ = 2 * Math.PI * r;
  var offset = 0;

  function handleTouch(e) {
    if (!onSelect || segments.length === 0) return;
    var tx = e.nativeEvent.locationX - s / 2;
    var ty = e.nativeEvent.locationY - s / 2;
    var dist = Math.sqrt(tx * tx + ty * ty);
    if (dist < r - strokeW * 1.5 || dist > r + strokeW * 1.5) { onSelect(-1); return; }
    var angle = Math.atan2(ty, tx) * 180 / Math.PI;
    var adjusted = (angle + 90 + 360) % 360;
    var cum = 0;
    for (var i = 0; i < segments.length; i++) {
      cum += segments[i].pct * 3.6;
      if (adjusted < cum) { onSelect(i === selected ? -1 : i); return; }
    }
    onSelect(-1);
  }

  return (
    <View onStartShouldSetResponder={function() { return !!onSelect; }} onResponderRelease={handleTouch}>
      <Svg width={s} height={s} viewBox={'0 0 ' + s + ' ' + s}>
        <Circle cx={s / 2} cy={s / 2} r={r} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth={strokeW} />
        {segments.map(function(seg, i) {
          var dash = (seg.pct / 100) * circ;
          var gap = circ - dash;
          var o = offset;
          offset += dash;
          var isSel = i === selected;
          var segOpacity = selected === -1 ? 1 : (isSel ? 1 : 0.3);
          var segStrokeW = isSel ? strokeW + 3 : strokeW;
          return (
            <Circle key={i} cx={s / 2} cy={s / 2} r={r} fill="none"
              stroke={seg.color} strokeWidth={segStrokeW}
              strokeDasharray={dash + ' ' + gap} strokeDashoffset={-o}
              strokeLinecap="round" opacity={segOpacity}
              rotation={-90} origin={s / 2 + ',' + s / 2} />
          );
        })}
      </Svg>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// PROGRESS BAR — Barra de progresso do orçamento
// ═══════════════════════════════════════════════════════════
function ProgressBar(props) {
  var pct = props.pct || 0;
  var color = pct > 90 ? C.red : (pct > 75 ? C.yellow : C.green);
  var clampedPct = Math.min(pct, 100);
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.06)', flex: 1 }}>
      <View style={{ width: clampedPct + '%', height: 6, borderRadius: 3, backgroundColor: color + '80' }} />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════
export default function FinancasView(props) {
  var navigation = props.navigation;
  var user = useAuth().user;
  var ps = usePrivacyStyle();

  // ── States ──
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _refreshing = useState(false); var refreshing = _refreshing[0]; var setRefreshing = _refreshing[1];
  var _mesAtual = useState(new Date().getMonth()); var mesAtual = _mesAtual[0]; var setMesAtual = _mesAtual[1];
  var _anoAtual = useState(new Date().getFullYear()); var anoAtual = _anoAtual[0]; var setAnoAtual = _anoAtual[1];
  var _summary = useState(null); var summary = _summary[0]; var setSummary = _summary[1];
  var _summaryAnterior = useState(null); var summaryAnterior = _summaryAnterior[0]; var setSummaryAnterior = _summaryAnterior[1];
  var _orcamentos = useState([]); var orcamentos = _orcamentos[0]; var setOrcamentos = _orcamentos[1];
  var _recorrentes = useState([]); var recorrentes = _recorrentes[0]; var setRecorrentes = _recorrentes[1];
  var _selDonut = useState(-1); var selDonut = _selDonut[0]; var setSelDonut = _selDonut[1];
  var _drillMovs = useState([]); var drillMovs = _drillMovs[0]; var setDrillMovs = _drillMovs[1];
  var _loadError = useState(false); var loadError = _loadError[0]; var setLoadError = _loadError[1];
  var _fxRates = useState(null); var fxRates = _fxRates[0]; var setFxRates = _fxRates[1];

  // ── Data loading ──
  var load = async function(mes, ano) {
    if (!user) return;
    setLoadError(false);
    var mesParam = (mes != null ? mes : mesAtual) + 1; // 0-indexed → 1-indexed
    var anoParam = ano != null ? ano : anoAtual;

    // Previous month
    var prevMes = mesParam - 1;
    var prevAno = anoParam;
    if (prevMes < 1) { prevMes = 12; prevAno = prevAno - 1; }

    try {
      var results = await Promise.all([
        getFinancasSummary(user.id, mesParam, anoParam),
        getFinancasSummary(user.id, prevMes, prevAno),
        getOrcamentos(user.id),
        getRecorrentes(user.id),
      ]);

      setSummary(results[0]);
      setSummaryAnterior(results[1]);
      var orcData = results[2].data || [];
      setOrcamentos(orcData);
      setRecorrentes(results[3].data || []);
      // Fetch exchange rates if any budget uses non-BRL
      var needFx = false;
      for (var fi = 0; fi < orcData.length; fi++) {
        if (orcData[fi].moeda && orcData[fi].moeda !== 'BRL') { needFx = true; break; }
      }
      if (needFx) {
        fetchExchangeRates(['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'QAR', 'ARS']).then(function(r) {
          setFxRates(r);
        }).catch(function() {});
      }
    } catch (e) {
      console.warn('FinancasView load error:', e);
      setLoadError(true);
    }
    setLoading(false);
  };

  useFocusEffect(useCallback(function() {
    setLoading(true);
    load(mesAtual, anoAtual);
  }, [user, mesAtual, anoAtual]));

  var onRefresh = async function() {
    setRefreshing(true);
    await load(mesAtual, anoAtual);
    setRefreshing(false);
  };

  // ── Month navigation ──
  function goToPrevMonth() {
    var newMes = mesAtual - 1;
    var newAno = anoAtual;
    if (newMes < 0) { newMes = 11; newAno = newAno - 1; }
    setMesAtual(newMes);
    setAnoAtual(newAno);
    setSelDonut(-1);
    setDrillMovs([]);
  }

  function goToNextMonth() {
    var now = new Date();
    var curMes = now.getMonth();
    var curAno = now.getFullYear();
    // Don't go past current month
    if (anoAtual > curAno || (anoAtual === curAno && mesAtual >= curMes)) return;
    var newMes = mesAtual + 1;
    var newAno = anoAtual;
    if (newMes > 11) { newMes = 0; newAno = newAno + 1; }
    setMesAtual(newMes);
    setAnoAtual(newAno);
    setSelDonut(-1);
    setDrillMovs([]);
  }

  var canGoNext = (function() {
    var now = new Date();
    var curMes = now.getMonth();
    var curAno = now.getFullYear();
    return anoAtual < curAno || (anoAtual === curAno && mesAtual < curMes);
  })();

  // ── Derived data ──
  var totalEntradasPessoais = summary ? summary.totalEntradasPessoais : 0;
  var totalSaidasPessoais = summary ? summary.totalSaidasPessoais : 0;
  var saldoPessoal = summary ? summary.saldoPessoal : 0;
  var porGrupo = summary ? summary.porGrupo : {};
  var porGrupoEntrada = summary ? summary.porGrupoEntrada : {};
  var porSubcategoria = summary ? summary.porSubcategoria : {};
  var movsPessoais = summary ? summary.movsPessoais : [];
  var savingsRate = totalEntradasPessoais > 0 ? (saldoPessoal / totalEntradasPessoais * 100) : 0;

  // Previous month comparison
  var prevSaidas = summaryAnterior ? summaryAnterior.totalSaidasPessoais : 0;
  var prevEntradas = summaryAnterior ? summaryAnterior.totalEntradasPessoais : 0;
  var prevSaldo = summaryAnterior ? summaryAnterior.saldoPessoal : 0;
  var saldoChange = prevSaldo !== 0 ? ((saldoPessoal - prevSaldo) / Math.abs(prevSaldo) * 100) : 0;

  // ── Income breakdown rows ──
  var incomeRows = [];
  var incomeKeys = Object.keys(porGrupoEntrada);
  for (var ik = 0; ik < incomeKeys.length; ik++) {
    var iKey = incomeKeys[ik];
    var iVal = porGrupoEntrada[iKey];
    if (iVal <= 0) continue;
    var iMeta = finCats.getGrupoMeta(iKey);
    incomeRows.push({ k: iKey, label: iMeta.label, icon: iMeta.icon, color: iMeta.color, value: iVal });
  }
  incomeRows.sort(function(a, b) { return b.value - a.value; });

  // ── Donut segments ──
  var donutSegments = [];
  var totalGastos = 0;
  var grupoKeys = Object.keys(porGrupo);
  for (var gi = 0; gi < grupoKeys.length; gi++) {
    var gk = grupoKeys[gi];
    if (gk === 'investimento') continue;
    if (porGrupo[gk] <= 0) continue;
    totalGastos += porGrupo[gk];
  }
  // Re-iterate to build segments
  var sortedGrupos = [];
  for (var si = 0; si < grupoKeys.length; si++) {
    var sk = grupoKeys[si];
    if (sk === 'investimento') continue;
    if (porGrupo[sk] <= 0) continue;
    sortedGrupos.push({ k: sk, v: porGrupo[sk] });
  }
  sortedGrupos.sort(function(a, b) { return b.v - a.v; });

  for (var di = 0; di < sortedGrupos.length; di++) {
    var sg = sortedGrupos[di];
    var meta = finCats.getGrupoMeta(sg.k);
    donutSegments.push({
      label: meta.label,
      pct: totalGastos > 0 ? (sg.v / totalGastos * 100) : 0,
      color: meta.color,
      value: sg.v,
      grupo: sg.k,
      icon: meta.icon,
    });
  }

  // ── Drill-down when donut segment selected ──
  function handleDonutSelect(idx) {
    setSelDonut(idx);
    if (idx < 0 || idx >= donutSegments.length) {
      setDrillMovs([]);
      return;
    }
    var grupo = donutSegments[idx].grupo;
    // Filter movsPessoais by grupo
    var filtered = [];
    for (var fi = 0; fi < movsPessoais.length; fi++) {
      var m = movsPessoais[fi];
      var mGrupo = finCats.getGrupo(m.categoria, m.subcategoria);
      if (mGrupo === grupo && filtered.length < 5) {
        filtered.push(m);
      }
    }
    setDrillMovs(filtered);
  }

  // ── Subcategorias for selected grupo ──
  var selectedGrupoSubs = [];
  if (selDonut >= 0 && selDonut < donutSegments.length) {
    var selGrupo = donutSegments[selDonut].grupo;
    var subKeys = Object.keys(porSubcategoria);
    for (var ski = 0; ski < subKeys.length; ski++) {
      var subk = subKeys[ski];
      var subMeta = finCats.SUBCATEGORIAS[subk];
      if (subMeta && subMeta.grupo === selGrupo && porSubcategoria[subk] > 0) {
        selectedGrupoSubs.push({
          k: subk,
          label: subMeta.l,
          icon: subMeta.icon,
          color: subMeta.color,
          value: porSubcategoria[subk],
        });
      }
    }
    selectedGrupoSubs.sort(function(a, b) { return b.value - a.value; });
  }

  // ── Budget matching ──
  var budgetItems = [];
  for (var bi = 0; bi < orcamentos.length; bi++) {
    var orc = orcamentos[bi];
    if (!orc.ativo) continue;
    var orcMoeda = orc.moeda || 'BRL';
    var spentRaw = porGrupo[orc.grupo] || 0; // always in BRL
    var limitRaw = orc.valor_limite || 0;
    // Convert limit to BRL for comparison if non-BRL
    var limitBRL = limitRaw;
    if (orcMoeda !== 'BRL' && fxRates && fxRates[orcMoeda]) {
      limitBRL = limitRaw * fxRates[orcMoeda];
    }
    var pct = limitBRL > 0 ? (spentRaw / limitBRL * 100) : 0;
    var bMeta = finCats.getGrupoMeta(orc.grupo);
    var sym = getSymbol(orcMoeda);
    budgetItems.push({
      grupo: orc.grupo,
      label: bMeta.label,
      icon: bMeta.icon,
      color: bMeta.color,
      spent: spentRaw,
      limit: limitRaw,
      limitBRL: limitBRL,
      moeda: orcMoeda,
      symbol: sym,
      pct: pct,
      remaining: limitBRL - spentRaw,
    });
  }

  // ── Comparison rows ──
  var comparisonRows = [];
  var prevPorGrupo = summaryAnterior ? summaryAnterior.porGrupo : {};
  var allGrupoKeys = {};
  var pgKeys = Object.keys(porGrupo);
  for (var pgi = 0; pgi < pgKeys.length; pgi++) {
    if (pgKeys[pgi] !== 'investimento' && pgKeys[pgi] !== 'outro') {
      allGrupoKeys[pgKeys[pgi]] = true;
    }
  }
  var ppgKeys = Object.keys(prevPorGrupo);
  for (var ppgi = 0; ppgi < ppgKeys.length; ppgi++) {
    if (ppgKeys[ppgi] !== 'investimento' && ppgKeys[ppgi] !== 'outro') {
      allGrupoKeys[ppgKeys[ppgi]] = true;
    }
  }
  var compKeys = Object.keys(allGrupoKeys);
  var compTotal = 0;
  var prevCompTotal = 0;
  for (var ci = 0; ci < compKeys.length; ci++) {
    var ck = compKeys[ci];
    var curVal = porGrupo[ck] || 0;
    var prevVal = prevPorGrupo[ck] || 0;
    if (curVal === 0 && prevVal === 0) continue;
    var chg = prevVal > 0 ? ((curVal - prevVal) / prevVal * 100) : (curVal > 0 ? 100 : 0);
    var cMeta = finCats.getGrupoMeta(ck);
    comparisonRows.push({
      grupo: ck,
      label: cMeta.label,
      icon: cMeta.icon,
      color: cMeta.color,
      current: curVal,
      previous: prevVal,
      change: chg,
    });
    compTotal += curVal;
    prevCompTotal += prevVal;
  }
  comparisonRows.sort(function(a, b) { return b.current - a.current; });

  // ── Upcoming recurring ──
  var upcomingRec = [];
  var today = new Date();
  var todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  for (var ri = 0; ri < recorrentes.length; ri++) {
    var rec = recorrentes[ri];
    if (!rec.ativo) continue;
    var proxVenc = rec.proximo_vencimento;
    if (!proxVenc) continue;
    // Days until
    var vencDate = new Date(proxVenc + 'T00:00:00');
    var diffMs = vencDate.getTime() - today.getTime();
    var daysUntil = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (daysUntil < -30) continue; // Skip very old
    upcomingRec.push({
      id: rec.id,
      tipo: rec.tipo,
      categoria: rec.categoria,
      subcategoria: rec.subcategoria,
      descricao: rec.descricao,
      valor: rec.valor,
      frequencia: rec.frequencia,
      proximo_vencimento: proxVenc,
      daysUntil: daysUntil,
    });
  }
  upcomingRec.sort(function(a, b) { return a.daysUntil - b.daysUntil; });
  var upcomingSlice = upcomingRec.slice(0, 5);

  // ── Has any data? ──
  var hasData = summary && summary.total > 0;

  // ── Loading / Error states ──
  if (loading) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.centerWrap}>
        <EmptyState
          ionicon="alert-circle-outline"
          title="Erro ao carregar"
          description="Não foi possível carregar os dados financeiros."
          cta="Tentar novamente"
          onCta={function() { setLoading(true); load(mesAtual, anoAtual); }}
        />
      </View>
    );
  }

  if (!hasData && orcamentos.length === 0 && recorrentes.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: SIZE.padding }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}>
          <EmptyState
            ionicon="pie-chart-outline"
            title="Finanças pessoais"
            description="Comece registrando suas despesas e receitas para acompanhar seu balanço mensal."
            cta="Registrar movimentação"
            onCta={function() { navigation.navigate('AddMovimentacao'); }}
          />
        </ScrollView>
        <Fab navigation={navigation} items={FAB_ITEMS} />
      </View>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: SIZE.tabBarHeight + 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        showsVerticalScrollIndicator={false}
      >

        {/* ══════════════════════════════════════════ */}
        {/* 1. HERO — Balanço do Mês                  */}
        {/* ══════════════════════════════════════════ */}
        <View style={{ paddingHorizontal: SIZE.padding, paddingTop: 8 }}>
          <Glass glow={saldoPessoal >= 0 ? C.green : C.red}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.display, letterSpacing: 1 }}>
                  BALANÇO DO MÊS
                </Text>
                <InfoTip text="Balanço pessoal: receitas menos despesas do mês, excluindo movimentações automáticas de investimento." />
              </View>
              {savingsRate > 0 ? (
                <Badge text={savingsRate.toFixed(0) + '% poupado'} color={C.green} />
              ) : null}
            </View>

            {/* Saldo grande */}
            <Text style={[{ fontSize: 28, fontFamily: F.mono, fontWeight: '700', color: saldoPessoal >= 0 ? C.green : C.red, marginBottom: 4 }, ps]}>
              {saldoPessoal >= 0 ? '+' : '-'}R$ {fmt(Math.abs(saldoPessoal))}
            </Text>

            {/* Month navigation */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginVertical: 10 }}>
              <TouchableOpacity onPress={goToPrevMonth} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button" accessibilityLabel="Mês anterior">
                <Ionicons name="chevron-back" size={20} color={C.text} />
              </TouchableOpacity>
              <Text style={{ fontSize: 14, fontFamily: F.display, color: C.text, minWidth: 140, textAlign: 'center' }}>
                {MESES_FULL[mesAtual] + ' ' + anoAtual}
              </Text>
              <TouchableOpacity onPress={goToNextMonth} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button" accessibilityLabel="Próximo mês"
                style={{ opacity: canGoNext ? 1 : 0.3 }}>
                <Ionicons name="chevron-forward" size={20} color={canGoNext ? C.text : C.dim} />
              </TouchableOpacity>
            </View>

            {/* 3-column summary */}
            <View style={{ flexDirection: 'row', marginTop: 4 }}>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.display, letterSpacing: 0.5, marginBottom: 2 }}>ENTRADAS</Text>
                <Text style={[{ fontSize: 14, fontFamily: F.mono, fontWeight: '700', color: C.green }, ps]}>
                  R$ {fmt(totalEntradasPessoais)}
                </Text>
              </View>
              <View style={{ width: 1, backgroundColor: C.border, marginHorizontal: 8 }} />
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.display, letterSpacing: 0.5, marginBottom: 2 }}>SAÍDAS</Text>
                <Text style={[{ fontSize: 14, fontFamily: F.mono, fontWeight: '700', color: C.red }, ps]}>
                  R$ {fmt(totalSaidasPessoais)}
                </Text>
              </View>
              <View style={{ width: 1, backgroundColor: C.border, marginHorizontal: 8 }} />
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.display, letterSpacing: 0.5, marginBottom: 2 }}>SALDO</Text>
                <Text style={[{ fontSize: 14, fontFamily: F.mono, fontWeight: '700', color: saldoPessoal >= 0 ? C.green : C.red }, ps]}>
                  R$ {fmt(Math.abs(saldoPessoal))}
                </Text>
              </View>
            </View>

            {/* Comparison badge with previous month */}
            {summaryAnterior && prevSaldo !== 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10, gap: 6 }}>
                <Ionicons
                  name={saldoChange >= 0 ? 'arrow-up' : 'arrow-down'}
                  size={12}
                  color={saldoChange >= 0 ? C.green : C.red}
                />
                <Text style={{ fontSize: 10, fontFamily: F.mono, color: saldoChange >= 0 ? C.green : C.red }}>
                  {(saldoChange >= 0 ? '+' : '') + saldoChange.toFixed(1) + '% vs mês anterior'}
                </Text>
              </View>
            ) : null}
          </Glass>
        </View>

        {/* ══════════════════════════════════════════ */}
        {/* 1b. RECEITAS — Breakdown de entradas       */}
        {/* ══════════════════════════════════════════ */}
        {incomeRows.length > 0 ? (
          <View style={{ paddingHorizontal: SIZE.padding, marginTop: SIZE.gap }}>
            <SectionLabel>RECEITAS</SectionLabel>
            <Glass style={{ marginTop: 8 }} padding={14}>
              {incomeRows.map(function(row, ri) {
                var pct = totalEntradasPessoais > 0 ? (row.value / totalEntradasPessoais * 100) : 0;
                return (
                  <View key={row.k} style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }, ri > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: row.color + '18', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={row.icon} size={14} color={row.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontFamily: F.body, color: C.text }}>{row.label}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.06)' }}>
                          <View style={{ width: Math.min(pct, 100) + '%', height: 4, borderRadius: 2, backgroundColor: row.color + '80' }} />
                        </View>
                        <Text style={{ fontSize: 10, fontFamily: F.mono, color: C.dim, minWidth: 36, textAlign: 'right' }}>
                          {pct.toFixed(0) + '%'}
                        </Text>
                      </View>
                    </View>
                    <Text style={[{ fontSize: 13, fontFamily: F.mono, fontWeight: '700', color: C.green }, ps]}>
                      {'R$ ' + fmt(row.value)}
                    </Text>
                  </View>
                );
              })}
            </Glass>
          </View>
        ) : null}

        {/* ══════════════════════════════════════════ */}
        {/* 2. DONUT — Gastos por Grupo               */}
        {/* ══════════════════════════════════════════ */}
        {donutSegments.length > 0 ? (
          <View style={{ paddingHorizontal: SIZE.padding, marginTop: SIZE.gap }}>
            <SectionLabel>DESPESAS POR CATEGORIA</SectionLabel>
            <Glass style={{ marginTop: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {/* Donut */}
                <Sensitive>
                  <DonutChart
                    segments={donutSegments}
                    size={140}
                    selected={selDonut}
                    onSelect={handleDonutSelect}
                  />
                </Sensitive>
                {/* Center text */}
                <View style={{ flex: 1, marginLeft: 16 }}>
                  <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.display, letterSpacing: 0.5, marginBottom: 2 }}>TOTAL GASTOS</Text>
                  <Text style={[{ fontSize: 18, fontFamily: F.mono, fontWeight: '700', color: C.red }, ps]}>
                    R$ {fmt(totalGastos)}
                  </Text>
                  {selDonut >= 0 && selDonut < donutSegments.length ? (
                    <View style={{ marginTop: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name={donutSegments[selDonut].icon} size={14} color={donutSegments[selDonut].color} />
                        <Text style={{ fontSize: 12, fontFamily: F.display, color: donutSegments[selDonut].color }}>
                          {donutSegments[selDonut].label}
                        </Text>
                      </View>
                      <Text style={[{ fontSize: 14, fontFamily: F.mono, fontWeight: '600', color: C.text, marginTop: 2 }, ps]}>
                        R$ {fmt(donutSegments[selDonut].value)}
                      </Text>
                      <Text style={{ fontSize: 10, fontFamily: F.mono, color: C.dim }}>
                        {donutSegments[selDonut].pct.toFixed(1) + '%'}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {/* Legend rows */}
              <View style={{ marginTop: 12, gap: 4 }}>
                {donutSegments.map(function(seg, i) {
                  var isActive = selDonut === i;
                  return (
                    <TouchableOpacity key={seg.grupo}
                      onPress={function() { handleDonutSelect(i === selDonut ? -1 : i); }}
                      activeOpacity={0.7}
                      style={[styles.legendRow, isActive && { backgroundColor: seg.color + '10', borderRadius: 6 }]}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: seg.color, opacity: selDonut === -1 || isActive ? 1 : 0.3 }} />
                      <Ionicons name={seg.icon} size={12} color={isActive ? seg.color : C.dim} />
                      <Text style={{ flex: 1, fontSize: 11, fontFamily: F.body, color: isActive ? C.text : C.sub }} numberOfLines={1}>
                        {seg.label}
                      </Text>
                      <Text style={{ fontSize: 10, fontFamily: F.mono, color: isActive ? seg.color : C.dim, marginRight: 6 }}>
                        {seg.pct.toFixed(1) + '%'}
                      </Text>
                      <Text style={[{ fontSize: 10, fontFamily: F.mono, color: isActive ? C.text : C.dim, width: 70, textAlign: 'right' }, ps]}>
                        R$ {fmt(seg.value)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Drill-down: subcategorias + transactions */}
              {selDonut >= 0 && selDonut < donutSegments.length ? (
                <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10 }}>
                  {/* Subcategorias */}
                  {selectedGrupoSubs.length > 0 ? (
                    <View style={{ gap: 4, marginBottom: 8 }}>
                      <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.display, letterSpacing: 0.5, marginBottom: 4 }}>SUBCATEGORIAS</Text>
                      {selectedGrupoSubs.map(function(sub) {
                        return (
                          <View key={sub.k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 }}>
                            <Ionicons name={sub.icon} size={12} color={sub.color} />
                            <Text style={{ flex: 1, fontSize: 11, fontFamily: F.body, color: C.sub }} numberOfLines={1}>{sub.label}</Text>
                            <Text style={[{ fontSize: 10, fontFamily: F.mono, color: C.text }, ps]}>R$ {fmt(sub.value)}</Text>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}

                  {/* Recent transactions in this grupo */}
                  {drillMovs.length > 0 ? (
                    <View style={{ gap: 4 }}>
                      <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.display, letterSpacing: 0.5, marginBottom: 4 }}>ÚLTIMAS TRANSAÇÕES</Text>
                      {drillMovs.map(function(m, mi) {
                        var isEntrada = m.tipo === 'entrada';
                        var movColor = isEntrada ? C.green : C.red;
                        var movIcon = finCats.getCatIcon(m.categoria, m.subcategoria);
                        var movLabel = m.descricao || finCats.getCatLabel(m.categoria) || '';
                        return (
                          <View key={m.id || mi} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 9, fontFamily: F.mono, color: C.dim, width: 36 }}>{formatDate(m.data)}</Text>
                            <Ionicons name={movIcon} size={12} color={movColor} />
                            <Text style={{ flex: 1, fontSize: 10, fontFamily: F.body, color: C.sub }} numberOfLines={1}>{movLabel}</Text>
                            <Text style={[{ fontSize: 10, fontFamily: F.mono, fontWeight: '600', color: movColor }, ps]}>
                              {isEntrada ? '+' : '-'}R$ {fmt(m.valor)}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </Glass>
          </View>
        ) : null}

        {/* ══════════════════════════════════════════ */}
        {/* 3. ORÇAMENTOS                             */}
        {/* ══════════════════════════════════════════ */}
        <View style={{ paddingHorizontal: SIZE.padding, marginTop: SIZE.gap }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <SectionLabel>ORÇAMENTOS</SectionLabel>
            <InfoTip text={'Acompanhe seus gastos vs limites definidos por categoria. ' +
              'A barra verde indica que está dentro do orçamento. ' +
              'Amarela quando perto do limite (>70%). Vermelha quando estourou. ' +
              'Se o orçamento estiver em moeda estrangeira, o gasto (em BRL) é comparado pelo câmbio atual.'} />
          </View>
          {budgetItems.length > 0 ? (
            <Glass style={{ marginTop: 8, gap: 10 }}>
              {budgetItems.map(function(b) {
                var overBudget = b.remaining < 0;
                return (
                  <View key={b.grupo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: b.color + '18', justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name={b.icon} size={13} color={b.color} />
                      </View>
                      <Text style={{ flex: 1, fontSize: 12, fontFamily: F.body, color: C.text }} numberOfLines={1}>{b.label}</Text>
                      <Text style={[{ fontSize: 10, fontFamily: F.mono, color: C.dim }, ps]}>
                        {'R$ ' + fmt(b.spent) + ' / ' + b.symbol + ' ' + fmt(b.limit)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <ProgressBar pct={b.pct} />
                      <Text style={{ fontSize: 10, fontFamily: F.mono, fontWeight: '600', color: overBudget ? C.red : C.green, width: 70, textAlign: 'right' }}>
                        {overBudget ? '-R$ ' + fmt(Math.abs(b.remaining)) : 'R$ ' + fmt(b.remaining)}
                      </Text>
                    </View>
                  </View>
                );
              })}
              <TouchableOpacity
                onPress={function() { navigation.navigate('Orcamento'); }}
                activeOpacity={0.7}
                style={{ alignSelf: 'center', paddingVertical: 4, marginTop: 4 }}>
                <Text style={{ fontSize: 11, fontFamily: F.mono, color: C.accent }}>Editar orçamentos →</Text>
              </TouchableOpacity>
            </Glass>
          ) : (
            <Glass style={{ marginTop: 8, padding: SIZE.padding }}>
              <EmptyState
                ionicon="calculator-outline"
                title="Sem orçamentos"
                description="Configure limites de gastos por categoria para acompanhar suas despesas."
                cta="Configurar orçamentos"
                onCta={function() { navigation.navigate('Orcamento'); }}
              />
            </Glass>
          )}
        </View>

        {/* ══════════════════════════════════════════ */}
        {/* 4. COMPARATIVO MENSAL                     */}
        {/* ══════════════════════════════════════════ */}
        {comparisonRows.length > 0 ? (
          <View style={{ paddingHorizontal: SIZE.padding, marginTop: SIZE.gap }}>
            <SectionLabel>COMPARATIVO MENSAL</SectionLabel>
            <Glass style={{ marginTop: 8 }}>
              {/* Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.border }}>
                <Text style={{ flex: 1, fontSize: 9, color: C.dim, fontFamily: F.display, letterSpacing: 0.5 }}>CATEGORIA</Text>
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.display, letterSpacing: 0.5, width: 70, textAlign: 'right' }}>ATUAL</Text>
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.display, letterSpacing: 0.5, width: 30, textAlign: 'center' }}></Text>
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.display, letterSpacing: 0.5, width: 70, textAlign: 'right' }}>ANTERIOR</Text>
              </View>

              {/* Rows */}
              {comparisonRows.map(function(row) {
                var increased = row.current > row.previous;
                var decreased = row.current < row.previous;
                var arrowIcon = increased ? 'arrow-up' : (decreased ? 'arrow-down' : 'remove-outline');
                var arrowColor = increased ? C.red : (decreased ? C.green : C.dim);
                return (
                  <View key={row.grupo} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: 6 }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: row.color + '15', justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name={row.icon} size={11} color={row.color} />
                    </View>
                    <Text style={{ flex: 1, fontSize: 11, fontFamily: F.body, color: C.sub }} numberOfLines={1}>{row.label}</Text>
                    <Text style={[{ fontSize: 10, fontFamily: F.mono, color: C.text, width: 70, textAlign: 'right' }, ps]}>
                      R$ {fmtCompact(row.current)}
                    </Text>
                    <View style={{ width: 30, alignItems: 'center' }}>
                      <Ionicons name={arrowIcon} size={10} color={arrowColor} />
                    </View>
                    <Text style={[{ fontSize: 10, fontFamily: F.mono, color: C.dim, width: 70, textAlign: 'right' }, ps]}>
                      R$ {fmtCompact(row.previous)}
                    </Text>
                  </View>
                );
              })}

              {/* Total row */}
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 8, marginTop: 6, borderTopWidth: 1, borderTopColor: C.border, gap: 6 }}>
                <Text style={{ flex: 1, fontSize: 11, fontFamily: F.display, color: C.text }}>Total</Text>
                <Text style={[{ fontSize: 11, fontFamily: F.mono, fontWeight: '700', color: C.red, width: 70, textAlign: 'right' }, ps]}>
                  R$ {fmtCompact(compTotal)}
                </Text>
                <View style={{ width: 30, alignItems: 'center' }}>
                  {compTotal !== prevCompTotal ? (
                    <Ionicons
                      name={compTotal > prevCompTotal ? 'arrow-up' : 'arrow-down'}
                      size={10}
                      color={compTotal > prevCompTotal ? C.red : C.green}
                    />
                  ) : null}
                </View>
                <Text style={[{ fontSize: 11, fontFamily: F.mono, fontWeight: '700', color: C.dim, width: 70, textAlign: 'right' }, ps]}>
                  R$ {fmtCompact(prevCompTotal)}
                </Text>
              </View>
            </Glass>
          </View>
        ) : null}

        {/* ══════════════════════════════════════════ */}
        {/* 5. PRÓXIMAS RECORRENTES                   */}
        {/* ══════════════════════════════════════════ */}
        <View style={{ paddingHorizontal: SIZE.padding, marginTop: SIZE.gap }}>
          <SectionLabel>PRÓXIMAS RECORRENTES</SectionLabel>
          {upcomingSlice.length > 0 ? (
            <Glass style={{ marginTop: 8, gap: 6 }}>
              {upcomingSlice.map(function(rec) {
                var recIcon = finCats.getCatIcon(rec.categoria, rec.subcategoria);
                var recColor = finCats.getCatColor(rec.categoria, rec.subcategoria);
                var recLabel = rec.descricao || finCats.getCatLabel(rec.categoria) || '';
                var subLabel = rec.subcategoria ? finCats.getSubcatLabel(rec.subcategoria) : '';
                var isEntrada = rec.tipo === 'entrada';
                var valColor = isEntrada ? C.green : C.red;

                // Days badge color
                var daysBadgeColor = C.green;
                if (rec.daysUntil <= 3) daysBadgeColor = C.red;
                else if (rec.daysUntil <= 7) daysBadgeColor = C.yellow;

                var daysLabel = '';
                if (rec.daysUntil < 0) {
                  daysLabel = Math.abs(rec.daysUntil) + 'd atrás';
                  daysBadgeColor = C.red;
                } else if (rec.daysUntil === 0) {
                  daysLabel = 'Hoje';
                  daysBadgeColor = C.red;
                } else if (rec.daysUntil === 1) {
                  daysLabel = 'Amanhã';
                } else {
                  daysLabel = rec.daysUntil + 'd';
                }

                return (
                  <View key={rec.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: recColor + '15', justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name={recIcon} size={14} color={recColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontFamily: F.body, color: C.text }} numberOfLines={1}>{recLabel}</Text>
                      {subLabel ? (
                        <Text style={{ fontSize: 9, fontFamily: F.body, color: C.dim }} numberOfLines={1}>{subLabel}</Text>
                      ) : null}
                    </View>
                    <Text style={[{ fontSize: 12, fontFamily: F.mono, fontWeight: '600', color: valColor, marginRight: 6 }, ps]}>
                      {isEntrada ? '+' : '-'}R$ {fmt(rec.valor)}
                    </Text>
                    <View style={{ backgroundColor: daysBadgeColor + '15', borderRadius: 6, borderWidth: 1, borderColor: daysBadgeColor + '25', paddingHorizontal: 6, paddingVertical: 2, minWidth: 40, alignItems: 'center' }}>
                      <Text style={{ fontSize: 9, fontFamily: F.mono, fontWeight: '700', color: daysBadgeColor }}>
                        {daysLabel}
                      </Text>
                    </View>
                  </View>
                );
              })}
              {upcomingRec.length > 5 ? (
                <TouchableOpacity
                  onPress={function() { navigation.navigate('Recorrentes'); }}
                  activeOpacity={0.7}
                  style={{ alignSelf: 'center', paddingVertical: 4, marginTop: 4 }}>
                  <Text style={{ fontSize: 11, fontFamily: F.mono, color: C.accent }}>Ver todas →</Text>
                </TouchableOpacity>
              ) : null}
            </Glass>
          ) : (
            <Glass style={{ marginTop: 8, padding: SIZE.padding }}>
              <EmptyState
                ionicon="repeat-outline"
                title="Nenhuma recorrente"
                description="Cadastre despesas e receitas recorrentes para não esquecer de pagamentos."
                cta="Adicionar recorrente"
                onCta={function() { navigation.navigate('AddRecorrente'); }}
              />
            </Glass>
          )}
        </View>

        {/* Bottom spacing */}
        <View style={{ height: 20 }} />

      </ScrollView>

      {/* ══════════════════════════════════════════ */}
      {/* 6. FAB                                    */}
      {/* ══════════════════════════════════════════ */}
      <Fab navigation={navigation} items={FAB_ITEMS} />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════
var styles = StyleSheet.create({
  centerWrap: {
    flex: 1,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SIZE.padding,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
});
