// RendaHomeScreen — Tela principal (Fase E + recovery 2026-04-10).
// Substitui HomeScreen. Narrativa focada em renda mensal.
//
// Layout:
//   1. Header (titulo + portfolio selector + privacy toggle + profile)
//   2. Patrimonio Hero (InteractiveChart + KPI bar + allocation bar + 3 cards)
//   3. Renda do Mes detalhada (Dividendos + Opcoes + breakdown + Meta)
//   4. Esta Semana — alertas + proximos 7 dias
//   5. Como Crescer — potencial + gaps + snowball
//   6. Breakdown 12m — bars mensais + fontes
//   7. FAB
//
// Consome AppStoreContext + getDashboard direto (patrimonioHistory).

import React from 'react';
var useState = React.useState;
var useEffect = React.useEffect;
var useCallback = React.useCallback;
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Rect, Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { C, F } from '../../theme';
import { T } from '../../theme/tokens';
import { Glass } from '../../components';
import InteractiveChart from '../../components/InteractiveChart';
import Fab from '../../components/Fab';
import Sensitive, { usePrivacyStyle } from '../../components/Sensitive';
import SnowballCard from '../../components/SnowballCard';
import { useAuth } from '../../contexts/AuthContext';
import { usePrivacy } from '../../contexts/PrivacyContext';
import { animateLayout } from '../../utils/a11y';
import {
  useAppStore, useIncome, useCarteira, useFinancas, useRefresh,
} from '../../contexts/AppStoreContext';
import { computeRendaPotencial } from '../../services/rendaPotencialService';
import { getDashboard } from '../../services/database';

var W = Dimensions.get('window').width;

// ─────────── Paleta por categoria (reuso do HomeScreen antigo) ───────────
var P = {
  acao:      { label: 'Acoes',    short: 'Acoes', color: '#22c55e' },
  fii:       { label: 'FIIs',     short: 'FII', color: '#a855f7' },
  opcao:     { label: 'Opcoes',   short: 'OP', color: '#0ea5e9' },
  etf:       { label: 'ETFs BR',  short: 'ETF', color: '#f59e0b' },
  etf_int:   { label: 'ETFs INT', short: 'ETF INT', color: '#FBBF24' },
  bdr:       { label: 'BDRs',     short: 'BDR', color: '#FB923C' },
  stock_int: { label: 'Stocks',   short: 'Stock', color: '#E879F9' },
  adr:       { label: 'ADRs',     short: 'ADR', color: '#F472B6' },
  reit:      { label: 'REITs',    short: 'REIT', color: '#34D399' },
  rf:        { label: 'RF',       short: 'RF', color: '#ec4899' },
};
var PKEYS = ['acao', 'fii', 'opcao', 'etf', 'etf_int', 'bdr', 'stock_int', 'adr', 'reit', 'rf'];

var PERIODS = [
  { key: '1M', label: '1M', days: 30 },
  { key: '3M', label: '3M', days: 90 },
  { key: '6M', label: '6M', days: 180 },
  { key: '1A', label: '1A', days: 365 },
  { key: 'ALL', label: 'Tudo', days: 0 },
];

// ─────────── Helpers ───────────

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtInt(v) {
  return Math.round(v || 0).toLocaleString('pt-BR');
}
function fmtPct(v, d) {
  return (v || 0).toFixed(d != null ? d : 1) + '%';
}

function parseDateSafe(s) {
  if (!s) return null;
  var d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d;
}

function computePatrimonio(positions, rf, saldos) {
  var total = 0;
  for (var i = 0; i < positions.length; i++) {
    var p = positions[i];
    var price = p.preco_atual || p.pm || 0;
    total += (p.quantidade || 0) * price;
  }
  for (var j = 0; j < rf.length; j++) {
    total += rf[j].valor_aplicado || 0;
  }
  for (var k = 0; k < saldos.length; k++) {
    if ((saldos[k].moeda || 'BRL') === 'BRL') {
      total += saldos[k].saldo || 0;
    }
  }
  return total;
}

function computeAlloc(positions, rfTotalAplicado) {
  var alloc = {};
  for (var ki = 0; ki < PKEYS.length; ki++) alloc[PKEYS[ki]] = 0;
  for (var i = 0; i < positions.length; i++) {
    var p = positions[i];
    var t = p.categoria || 'acao';
    var price = p.preco_atual || (p.mercado === 'INT'
      ? (p.pm || 0) * (p.taxa_cambio || p.taxa_cambio_media || 1)
      : (p.pm || 0));
    var val = (p.quantidade || 0) * price;
    if (t === 'etf' && p.mercado === 'INT') {
      alloc.etf_int += val;
    } else {
      alloc[t] = (alloc[t] || 0) + val;
    }
  }
  alloc.rf = rfTotalAplicado;
  var totalAlloc = 0;
  for (var kj = 0; kj < PKEYS.length; kj++) totalAlloc += alloc[PKEYS[kj]];
  return { alloc: alloc, totalAlloc: totalAlloc };
}

function computeRentabilidade(patrimonioHistory, patrimonio, positions, rfTotalAplicado) {
  var rentSemanal = 0;
  var rentMensal = 0;
  var rentAno = 0;
  var rentTotal = 0;
  if (!patrimonioHistory || patrimonioHistory.length < 2) {
    return { rentSemanal: 0, rentMensal: 0, rentAno: 0, rentTotal: 0 };
  }
  var lastVal = patrimonioHistory[patrimonioHistory.length - 1].value;
  function findValAt(daysAgo) {
    var d = new Date();
    d.setDate(d.getDate() - daysAgo);
    var cutStr = d.toISOString().substring(0, 10);
    var best = null;
    for (var hi = 0; hi < patrimonioHistory.length; hi++) {
      if (patrimonioHistory[hi].date <= cutStr) best = patrimonioHistory[hi];
    }
    return best ? best.value : 0;
  }
  var val7 = findValAt(7);
  if (val7 > 0) rentSemanal = ((lastVal - val7) / val7) * 100;
  var val30 = findValAt(30);
  if (val30 > 0) rentMensal = ((lastVal - val30) / val30) * 100;

  var yearStart = new Date().getFullYear() + '-01-01';
  var valYtd = 0;
  for (var yi = 0; yi < patrimonioHistory.length; yi++) {
    if (patrimonioHistory[yi].date >= yearStart) { valYtd = patrimonioHistory[yi].value; break; }
  }
  if (valYtd > 0) rentAno = ((lastVal - valYtd) / valYtd) * 100;

  var custoInvestido = 0;
  for (var ci = 0; ci < positions.length; ci++) {
    var cPos = positions[ci];
    var cQty = cPos.quantidade || 0;
    var cPm = cPos.pm || 0;
    if (cPos.mercado === 'INT') {
      custoInvestido += cQty * cPm * (cPos.taxa_cambio || cPos.taxa_cambio_media || 1);
    } else {
      custoInvestido += cQty * cPm;
    }
  }
  custoInvestido += rfTotalAplicado;
  if (custoInvestido > 0) rentTotal = ((patrimonio - custoInvestido) / custoInvestido) * 100;
  return { rentSemanal: rentSemanal, rentMensal: rentMensal, rentAno: rentAno, rentTotal: rentTotal };
}

function filterChartByPeriod(patrimonioHistory, chartPeriod) {
  if (!patrimonioHistory || patrimonioHistory.length === 0) return [];
  if (chartPeriod === 'ALL') return patrimonioHistory;
  var periodDef = null;
  for (var i = 0; i < PERIODS.length; i++) {
    if (PERIODS[i].key === chartPeriod) { periodDef = PERIODS[i]; break; }
  }
  if (!periodDef || periodDef.days === 0) return patrimonioHistory;
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - periodDef.days);
  var cutoffStr = cutoff.toISOString().substring(0, 10);
  return patrimonioHistory.filter(function(pt) { return pt.date >= cutoffStr; });
}

function computeProximos7Dias(proventos, opcoes) {
  var eventos = [];
  var now = new Date();
  var limite = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

  for (var i = 0; i < proventos.length; i++) {
    var p = proventos[i];
    var pd = parseDateSafe(p.data_pagamento);
    if (!pd || pd < now || pd > limite) continue;
    var v = p.valor_total || ((p.valor_por_cota || 0) * (p.quantidade || 0));
    if (v <= 0) continue;
    eventos.push({
      data: pd,
      tipo: 'provento',
      ticker: (p.ticker || '').toUpperCase(),
      valor: v,
    });
  }

  for (var j = 0; j < opcoes.length; j++) {
    var o = opcoes[j];
    if (o.status !== 'ativa') continue;
    if ((o.direcao || 'venda') === 'compra') continue;
    var venc = parseDateSafe(o.vencimento);
    if (!venc || venc < now || venc > limite) continue;
    var premio = (o.premio || 0) * (o.qty || 0);
    if (premio <= 0) continue;
    eventos.push({
      data: venc,
      tipo: 'opcao',
      ticker: o.ticker_opcao,
      valor: premio,
    });
  }

  eventos.sort(function(a, b) { return a.data - b.data; });
  return eventos;
}

function countOpsVenc7d(opcoes) {
  var now = new Date();
  var limite = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  var count = 0;
  for (var i = 0; i < opcoes.length; i++) {
    var o = opcoes[i];
    if (o.status !== 'ativa') continue;
    var venc = parseDateSafe(o.vencimento);
    if (!venc || venc < now || venc > limite) continue;
    count++;
  }
  return count;
}

function countOpsAtivas(opcoes) {
  var c = 0;
  for (var i = 0; i < opcoes.length; i++) {
    if (opcoes[i].status === 'ativa') c++;
  }
  return c;
}

var MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
var DIAS_SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

// ─────────── Mini Sparkline (usado no BreakdownSection) ───────────
function Sparkline(props) {
  var data = props.data || [];
  var width = props.width || 180;
  var height = props.height || 36;
  var color = props.color || T.color.income;
  if (data.length < 2) return null;
  var maxVal = data[0]; var minVal = data[0];
  for (var i = 1; i < data.length; i++) {
    if (data[i] > maxVal) maxVal = data[i];
    if (data[i] < minVal) minVal = data[i];
  }
  var range = maxVal - minVal;
  if (range <= 0) range = 1;
  var padY = 4;
  var pathD = '';
  for (var j = 0; j < data.length; j++) {
    var x = (j / (data.length - 1)) * width;
    var y = padY + (1 - (data[j] - minVal) / range) * (height - padY * 2);
    pathD += (j === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
  }
  var areaD = pathD + ' L' + width + ',' + height + ' L0,' + height + ' Z';
  return (
    <Svg width={width} height={height}>
      <Path d={areaD} fill={color + '22'} />
      <Path d={pathD} stroke={color} strokeWidth={2} fill="none" />
    </Svg>
  );
}

// ─────────── Bars 12m ───────────
function Bars12m(props) {
  var data = props.data || [];
  var width = props.width || (W - T.space.screenPad * 2 - T.space.cardPad * 2);
  var height = props.height || 80;
  if (data.length === 0) return null;
  var maxV = 0;
  for (var i = 0; i < data.length; i++) if (data[i].total > maxV) maxV = data[i].total;
  if (maxV <= 0) maxV = 1;
  var bw = Math.floor(width / data.length) - 3;
  var now = new Date();

  return (
    <Svg width={width} height={height}>
      {data.map(function(d, idx) {
        var bh = (d.total / maxV) * (height - 16);
        if (bh < 1 && d.total > 0) bh = 2;
        var isCurrent = d.mes === now.getMonth() && d.year === now.getFullYear();
        return (
          <Rect
            key={idx}
            x={idx * (bw + 3)}
            y={height - bh - 14}
            width={bw}
            height={bh}
            rx={2}
            fill={isCurrent ? T.color.income : T.color.accent}
            opacity={isCurrent ? 1 : 0.7}
          />
        );
      })}
    </Svg>
  );
}

// ─────────── Portfolio Selector (dropdown) ───────────
function PortfolioSelector(props) {
  var portfolios = props.portfolios || [];
  var selected = props.selected;
  var onChange = props.onChange;
  var _open = useState(false); var open = _open[0]; var setOpen = _open[1];

  if (portfolios.length === 0) return null;

  var lbl = 'Todos';
  var clr = T.color.accent;
  var ico = 'people-outline';
  if (selected === '__null__') { lbl = 'Padrao'; ico = 'briefcase-outline'; }
  else if (selected) {
    for (var pi = 0; pi < portfolios.length; pi++) {
      if (portfolios[pi].id === selected) {
        lbl = portfolios[pi].nome;
        clr = portfolios[pi].cor || T.color.accent;
        ico = portfolios[pi].icone || null;
        break;
      }
    }
  }

  function pick(val) {
    animateLayout();
    setOpen(false);
    onChange(val);
  }

  return (
    <View style={{ zIndex: 10 }}>
      <TouchableOpacity
        onPress={function() { animateLayout(); setOpen(!open); }}
        activeOpacity={0.7}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 6,
          backgroundColor: 'rgba(255,255,255,0.04)',
          borderRadius: 10,
          paddingHorizontal: 12, paddingVertical: 8,
          borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
          alignSelf: 'flex-start',
        }}
      >
        {ico ? (
          <Ionicons name={ico} size={14} color={clr} />
        ) : (
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: clr }} />
        )}
        <Text style={{ fontSize: 12, fontFamily: F.body, color: T.color.textPrimary }}>{lbl}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color="rgba(255,255,255,0.3)" />
      </TouchableOpacity>
      {open ? (
        <View style={{
          position: 'absolute',
          top: 40,
          left: 0,
          minWidth: 180,
          backgroundColor: T.color.bg,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.07)',
          overflow: 'hidden',
          zIndex: 20,
          elevation: 10,
        }}>
          <TouchableOpacity
            onPress={function() { pick(null); }}
            style={[
              { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
              !selected && { backgroundColor: T.color.accent + '11' },
            ]}
          >
            <Ionicons name="people-outline" size={14} color={!selected ? T.color.accent : 'rgba(255,255,255,0.3)'} />
            <Text style={[{ fontSize: 13, fontFamily: F.body, color: T.color.textPrimary }, !selected && { color: T.color.accent }]}>
              Todos
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={function() { pick('__null__'); }}
            style={[
              { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
              selected === '__null__' && { backgroundColor: T.color.accent + '11' },
            ]}
          >
            <Ionicons name="briefcase-outline" size={14} color={selected === '__null__' ? T.color.accent : 'rgba(255,255,255,0.3)'} />
            <Text style={[{ fontSize: 13, fontFamily: F.body, color: T.color.textPrimary }, selected === '__null__' && { color: T.color.accent }]}>
              Padrao
            </Text>
          </TouchableOpacity>
          {portfolios.map(function(p) {
            var isAct = selected === p.id;
            var pColor = p.cor || T.color.accent;
            return (
              <TouchableOpacity
                key={p.id}
                onPress={function() { pick(p.id); }}
                style={[
                  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
                  isAct && { backgroundColor: T.color.accent + '11' },
                ]}
              >
                {p.icone ? (
                  <Ionicons name={p.icone} size={14} color={isAct ? pColor : 'rgba(255,255,255,0.3)'} />
                ) : (
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: pColor }} />
                )}
                <Text style={[{ fontSize: 13, fontFamily: F.body, color: T.color.textPrimary }, isAct && { color: pColor }]}>
                  {p.nome}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// SECTION 1: PATRIMONIO HERO (expandido - restaurado da Home antiga)
// ═══════════════════════════════════════════════════════════
function PatrimonioHeroSection(props) {
  var patrimonio = props.patrimonio || 0;
  var rendaMedia = props.rendaMedia || 0;
  var forecast = props.forecast;
  var patrimonioHistory = props.patrimonioHistory || [];
  var alloc = props.alloc || {};
  var totalAlloc = props.totalAlloc || 0;
  var rentSemanal = props.rentSemanal || 0;
  var rentMensal = props.rentMensal || 0;
  var rentAno = props.rentAno || 0;
  var rentTotal = props.rentTotal || 0;
  var chartPeriod = props.chartPeriod;
  var setChartPeriod = props.setChartPeriod;
  var posicoesCount = props.posicoesCount || 0;
  var opsAtivas = props.opsAtivas || 0;
  var opsVenc7d = props.opsVenc7d || 0;
  var ps = usePrivacyStyle();

  var deltaMes = (forecast && forecast.summary && forecast.summary.deltaMes) || 0;
  var deltaColor = deltaMes > 0 ? T.color.income : deltaMes < 0 ? T.color.danger : T.color.textMuted;
  var deltaIcon = deltaMes > 0 ? 'trending-up' : deltaMes < 0 ? 'trending-down' : 'remove';

  var filteredChartData = filterChartByPeriod(patrimonioHistory, chartPeriod);
  var hasRealChart = filteredChartData.length >= 2;

  var kpiItems = [
    { label: '7D', val: rentSemanal },
    { label: '1M', val: rentMensal },
    { label: 'YTD', val: rentAno },
    { label: 'Total', val: rentTotal },
  ];

  return (
    <Glass padding={0} glow="rgba(34,197,94,0.18)" style={{ marginBottom: T.space.gap, borderColor: 'rgba(34,197,94,0.25)' }}>
      <View style={{ height: 3, borderTopLeftRadius: T.radius.md, borderTopRightRadius: T.radius.md, backgroundColor: T.color.income }} />
      <View style={{ padding: T.space.lg }}>

        {/* Split KPIs — patrimonio + renda */}
        <View style={{ flexDirection: 'row', gap: T.space.md, marginBottom: T.space.md }}>
          <View style={{ flex: 1, borderRightWidth: 1, borderRightColor: T.color.border, paddingRight: T.space.md }}>
            <Text style={[T.type.kpiLabel, { color: T.color.textMuted, marginBottom: T.space.xxs }]}>INVESTIDO</Text>
            <Sensitive>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
                style={[{ fontSize: 22, fontWeight: '800', color: T.color.textPrimary, fontFamily: F.mono }, ps]}
              >
                {'R$ ' + fmtInt(patrimonio)}
              </Text>
            </Sensitive>
          </View>
          <View style={{ flex: 1, paddingLeft: T.space.xs }}>
            <Text style={[T.type.kpiLabel, { color: T.color.textMuted, marginBottom: T.space.xxs }]}>PROJ. 12M/MES</Text>
            <Sensitive>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
                style={[{ fontSize: 22, fontWeight: '800', color: T.color.income, fontFamily: F.mono }, ps]}
              >
                {'R$ ' + fmtInt(rendaMedia)}
              </Text>
            </Sensitive>
            {deltaMes !== 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 }}>
                <Ionicons name={deltaIcon} size={10} color={deltaColor} />
                <Text style={{ fontSize: 10, color: deltaColor, fontFamily: F.mono, fontWeight: '700' }}>
                  {(deltaMes >= 0 ? '+' : '') + deltaMes.toFixed(1) + '%'}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* KPI bar rentabilidade 7D / 1M / YTD / Total */}
        {patrimonioHistory.length >= 2 ? (
          <View style={{ flexDirection: 'row', gap: 4, marginBottom: T.space.sm }}>
            {kpiItems.map(function(item) {
              var v = item.val || 0;
              var col = v > 0 ? '#22c55e' : (v < 0 ? '#ef4444' : T.color.textMuted);
              return (
                <View key={item.label} style={{
                  flex: 1,
                  backgroundColor: 'rgba(255,255,255,0.035)',
                  borderRadius: 8,
                  paddingVertical: 6,
                  paddingHorizontal: 4,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.06)',
                }}>
                  <Text style={{ fontSize: 9, color: T.color.textMuted, fontFamily: F.mono, letterSpacing: 0.5 }}>
                    {item.label}
                  </Text>
                  <Text style={[{ fontSize: 11, fontWeight: '800', color: col, fontFamily: F.mono, marginTop: 2 }, ps]}>
                    {(v > 0 ? '+' : '') + v.toFixed(1) + '%'}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Filtro de periodo */}
        {patrimonioHistory.length >= 2 ? (
          <View style={{ flexDirection: 'row', gap: 4, marginBottom: T.space.xs }}>
            {PERIODS.map(function(p) {
              var active = chartPeriod === p.key;
              return (
                <TouchableOpacity
                  key={p.key}
                  onPress={function() { setChartPeriod(p.key); }}
                  activeOpacity={0.7}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 6,
                    backgroundColor: active ? T.color.accent + '22' : 'transparent',
                    borderWidth: 1,
                    borderColor: active ? T.color.accent + '55' : 'rgba(255,255,255,0.06)',
                  }}
                >
                  <Text style={{
                    fontSize: 10,
                    fontFamily: F.mono,
                    color: active ? T.color.accent : T.color.textMuted,
                    fontWeight: active ? '700' : '500',
                  }}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        {/* InteractiveChart */}
        {hasRealChart ? (
          <View style={{ marginHorizontal: -6, marginBottom: T.space.sm }}>
            <Sensitive>
              <InteractiveChart
                data={filteredChartData}
                color="#0ea5e9"
                height={130}
                fontFamily={F.mono}
                label="Evolucao do patrimonio"
              />
            </Sensitive>
          </View>
        ) : (
          <View style={{
            height: 80,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(255,255,255,0.02)',
            borderRadius: 10,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.04)',
            borderStyle: 'dashed',
            marginBottom: T.space.sm,
          }}>
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', fontFamily: F.mono }}>
              Grafico disponivel com mais historico
            </Text>
          </View>
        )}

        {/* Allocation bar por categoria */}
        {totalAlloc > 0 ? (
          <View style={{ marginBottom: T.space.sm }}>
            <View style={{
              flexDirection: 'row',
              height: 6,
              borderRadius: 3,
              overflow: 'hidden',
              backgroundColor: 'rgba(255,255,255,0.03)',
            }}>
              {PKEYS.map(function(k, i) {
                var pct = (alloc[k] || 0) / totalAlloc * 100;
                if (pct < 0.5) return null;
                return (
                  <View key={k} style={{
                    flex: pct,
                    height: 6,
                    backgroundColor: P[k].color,
                    marginRight: i < PKEYS.length - 1 ? 1 : 0,
                  }} />
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {PKEYS.map(function(k) {
                var pct = (alloc[k] || 0) / totalAlloc * 100;
                if (pct < 0.5) return null;
                return (
                  <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: P[k].color }} />
                    <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontFamily: F.body }}>
                      {P[k].short}
                    </Text>
                    <Text style={[{ fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.65)', fontFamily: F.mono }, ps]}>
                      {pct.toFixed(0) + '%'}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* 3 cards resumo: Rentab Ano / Posicoes / Opcoes */}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <View style={{
            flex: 1,
            backgroundColor: 'rgba(255,255,255,0.035)',
            borderRadius: 10,
            padding: 10,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.06)',
          }}>
            <Text style={{ fontSize: 9, color: T.color.textMuted, fontFamily: F.mono, letterSpacing: 0.5 }}>RENTAB. ANO</Text>
            <Text style={[{
              fontSize: 14,
              fontWeight: '800',
              color: rentAno > 0 ? '#22c55e' : (rentAno < 0 ? '#ef4444' : T.color.textMuted),
              fontFamily: F.mono,
              marginTop: 2,
            }, ps]}>
              {(rentAno > 0 ? '+' : '') + rentAno.toFixed(2) + '%'}
            </Text>
          </View>
          <View style={{
            flex: 1,
            backgroundColor: 'rgba(255,255,255,0.035)',
            borderRadius: 10,
            padding: 10,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.06)',
          }}>
            <Text style={{ fontSize: 9, color: T.color.textMuted, fontFamily: F.mono, letterSpacing: 0.5 }}>POSICOES</Text>
            <Text style={{ fontSize: 14, fontWeight: '800', color: T.color.textPrimary, fontFamily: F.mono, marginTop: 2 }}>
              {posicoesCount}
            </Text>
          </View>
          <View style={{
            flex: 1,
            backgroundColor: 'rgba(255,255,255,0.035)',
            borderRadius: 10,
            padding: 10,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.06)',
          }}>
            <Text style={{ fontSize: 9, color: T.color.textMuted, fontFamily: F.mono, letterSpacing: 0.5 }}>OPCOES</Text>
            <Text style={{ fontSize: 14, fontWeight: '800', color: P.opcao.color, fontFamily: F.mono, marginTop: 2 }}>
              {opsAtivas}
            </Text>
            {opsVenc7d > 0 ? (
              <Text style={{ fontSize: 9, color: '#ef4444', fontFamily: F.mono }}>
                {opsVenc7d + ' vence 7d'}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </Glass>
  );
}

// ═══════════════════════════════════════════════════════════
// SECTION 1b: RENDA DO MES detalhada (restaurado da Home antiga)
// ═══════════════════════════════════════════════════════════
function RendaDoMesSection(props) {
  var dashData = props.dashData;
  var meta = props.meta || 0;
  var ps = usePrivacyStyle();

  if (!dashData) return null;

  var dividendosMes = dashData.dividendosMes || 0;
  var dividendosMesAnterior = dashData.dividendosMesAnterior || 0;
  var dividendosCatMes = dashData.dividendosCatMes || {};
  var plMes = dashData.plMes || 0;
  var plMesAnterior = dashData.plMesAnterior || 0;
  var premiosMes = dashData.premiosMes || 0;
  var premiosMesAnterior = dashData.premiosMesAnterior || 0;
  var recompraMes = dashData.recompraMes || 0;
  var rfRendaMensal = dashData.rfRendaMensal || 0;
  var rendaTotalMes = dashData.rendaTotalMes || 0;

  if (dividendosMes === 0 && plMes === 0 && rfRendaMensal === 0 && dividendosMesAnterior === 0) {
    return null;
  }

  var rendaColor = rendaTotalMes >= 0 ? '#22c55e' : '#ef4444';
  var pctMeta = meta > 0 ? (rendaTotalMes / meta) * 100 : 0;
  var pctMetaClamped = Math.max(0, Math.min(100, pctMeta));

  var catItems = [
    { key: 'acao', label: 'Acoes', color: P.acao.color, val: dividendosCatMes.acao || 0 },
    { key: 'fii', label: 'FIIs', color: P.fii.color, val: dividendosCatMes.fii || 0 },
    { key: 'etf', label: 'ETFs', color: P.etf.color, val: dividendosCatMes.etf || 0 },
    { key: 'stock_int', label: 'Stocks', color: P.stock_int.color, val: dividendosCatMes.stock_int || 0 },
    { key: 'bdr', label: 'BDRs/ADRs/REITs', color: P.bdr.color,
      val: (dividendosCatMes.bdr || 0) + (dividendosCatMes.adr || 0) + (dividendosCatMes.reit || 0) },
  ];

  function renderDeltaChip(atual, anterior) {
    if (!anterior || Math.abs(anterior) === 0) return null;
    var pct = ((atual - anterior) / Math.abs(anterior)) * 100;
    var up = atual >= anterior;
    var col = up ? '#22c55e' : '#ef4444';
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <View style={{ backgroundColor: col + '15', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
          <Text style={[{ fontSize: 10, fontWeight: '700', color: col, fontFamily: F.mono }, ps]}>
            {(pct > 0 ? '+' : '') + pct.toFixed(0) + '%'}
          </Text>
        </View>
        <Text style={[{ fontSize: 10, color: T.color.textMuted, fontFamily: F.mono }, ps]}>
          {'Ant: R$ ' + fmt(anterior)}
        </Text>
      </View>
    );
  }

  return (
    <Glass padding={T.space.cardPad} glow="rgba(108,92,231,0.10)" style={{ marginBottom: T.space.gap }}>
      {/* Header + total */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: T.space.xs, marginBottom: T.space.sm }}>
        <Text style={{ fontSize: 14 }}>💰</Text>
        <Text style={{ fontSize: 13, color: T.color.textPrimary, fontFamily: F.display, fontWeight: '700' }}>
          Renda do Mes
        </Text>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: T.space.md }}>
        <Sensitive>
          <Text style={[{ fontSize: 26, fontWeight: '800', color: rendaColor, fontFamily: F.display }, ps]}>
            {'R$ ' + fmt(rendaTotalMes)}
          </Text>
        </Sensitive>
      </View>

      {/* Dividendos card */}
      {(dividendosMes > 0 || dividendosMesAnterior > 0) ? (
        <View style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text style={{ fontSize: 12, color: T.color.textPrimary, fontFamily: F.display, fontWeight: '700' }}>
              Dividendos
            </Text>
            <Sensitive>
              <Text style={[{ fontSize: 15, fontWeight: '800', color: dividendosMes > 0 ? '#22c55e' : T.color.textMuted, fontFamily: F.mono }, ps]}>
                {'R$ ' + fmt(dividendosMes)}
              </Text>
            </Sensitive>
          </View>
          {renderDeltaChip(dividendosMes, dividendosMesAnterior)}
          <View style={{ gap: 4 }}>
            {catItems.map(function(c) {
              if (c.val <= 0) return null;
              return (
                <View key={c.key} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.color }} />
                    <Text style={{ fontSize: 11, color: T.color.textSecondary, fontFamily: F.body }}>{c.label}</Text>
                  </View>
                  <Sensitive>
                    <Text style={[{ fontSize: 12, fontWeight: '700', color: '#22c55e', fontFamily: F.mono }, ps]}>
                      {'R$ ' + fmt(c.val)}
                    </Text>
                  </Sensitive>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Premios Opcoes card */}
      {(plMes !== 0 || premiosMesAnterior !== 0) ? (
        <View style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text style={{ fontSize: 12, color: T.color.textPrimary, fontFamily: F.display, fontWeight: '700' }}>
              Premios de Opcoes
            </Text>
            <Sensitive>
              <Text style={[{ fontSize: 15, fontWeight: '800', color: plMes >= 0 ? '#22c55e' : '#ef4444', fontFamily: F.mono }, ps]}>
                {'R$ ' + fmt(plMes)}
              </Text>
            </Sensitive>
          </View>
          {renderDeltaChip(plMes, premiosMesAnterior)}
          {premiosMes > 0 ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' }} />
                <Text style={{ fontSize: 11, color: T.color.textSecondary, fontFamily: F.body }}>Premios</Text>
              </View>
              <Sensitive>
                <Text style={[{ fontSize: 12, fontWeight: '700', color: '#22c55e', fontFamily: F.mono }, ps]}>
                  {'R$ ' + fmt(premiosMes)}
                </Text>
              </Sensitive>
            </View>
          ) : null}
          {recompraMes > 0 ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#ef4444' }} />
                <Text style={{ fontSize: 11, color: T.color.textSecondary, fontFamily: F.body }}>Recompras</Text>
              </View>
              <Sensitive>
                <Text style={[{ fontSize: 12, fontWeight: '700', color: '#ef4444', fontFamily: F.mono }, ps]}>
                  {'-R$ ' + fmt(recompraMes)}
                </Text>
              </Sensitive>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Renda Fixa card */}
      {rfRendaMensal > 0 ? (
        <View style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 12, color: T.color.textPrimary, fontFamily: F.display, fontWeight: '700' }}>
              Renda Fixa
            </Text>
            <Sensitive>
              <Text style={[{ fontSize: 15, fontWeight: '800', color: '#22c55e', fontFamily: F.mono }, ps]}>
                {'R$ ' + fmt(rfRendaMensal)}
              </Text>
            </Sensitive>
          </View>
        </View>
      ) : null}

      {/* Consolidado Dividendos + Opcoes */}
      {(dividendosMes > 0 || plMes !== 0) ? (
        <View style={{
          backgroundColor: T.color.accent + '10',
          borderRadius: 8,
          padding: 10,
          borderWidth: 1,
          borderColor: T.color.accent + '20',
          marginBottom: 14,
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 12, color: T.color.accent, fontFamily: F.display, fontWeight: '700' }}>
              Dividendos + Opcoes
            </Text>
            <Sensitive>
              <Text style={[{
                fontSize: 17,
                fontWeight: '800',
                color: (dividendosMes + plMes) >= 0 ? '#22c55e' : '#ef4444',
                fontFamily: F.mono,
              }, ps]}>
                {'R$ ' + fmt(dividendosMes + plMes)}
              </Text>
            </Sensitive>
          </View>
          {renderDeltaChip(dividendosMes + plMes, dividendosMesAnterior + plMesAnterior)}
        </View>
      ) : null}

      {/* META MENSAL com progress bar gradient */}
      {meta > 0 ? (
        <View style={{ borderTopWidth: 1, borderTopColor: T.color.border, paddingTop: T.space.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <Text style={[T.type.kpiLabel, { color: T.color.textMuted }]}>META MENSAL</Text>
            <Sensitive>
              <Text style={[{
                fontSize: 11,
                color: pctMeta >= 100 ? '#22c55e' : (pctMeta < 0 ? '#ef4444' : T.color.accent),
                fontFamily: F.mono,
                fontWeight: '700',
              }, ps]}>
                {fmtPct(pctMeta, 0) + ' DA META'}
              </Text>
            </Sensitive>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 8 }}>
            <Sensitive>
              <Text style={[{ fontSize: 18, fontWeight: '800', color: T.color.accent, fontFamily: F.display }, ps]}>
                {'R$ ' + fmt(rendaTotalMes)}
              </Text>
            </Sensitive>
            <Sensitive>
              <Text style={[{ fontSize: 12, color: T.color.textMuted, fontFamily: F.display, marginLeft: 4 }, ps]}>
                {' / R$ ' + fmt(meta)}
              </Text>
            </Sensitive>
          </View>
          {/* Progress bar gradient (simulado com 3 layers empilhadas) */}
          <View style={{ height: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
            <View style={{
              height: 8,
              width: pctMetaClamped + '%',
              borderRadius: 4,
              backgroundColor: pctMeta >= 100 ? '#22c55e' : T.color.accent,
            }} />
          </View>
          {(plMes !== 0 || dividendosMes > 0 || rfRendaMensal > 0) ? (
            <Text style={[{ fontSize: 10, color: T.color.textMuted, fontFamily: F.mono, marginTop: 6 }, ps]}>
              {'P&L Opcoes R$ ' + fmt(plMes) + ' + Div R$ ' + fmt(dividendosMes) + ' + RF R$ ' + fmt(rfRendaMensal)}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Glass>
  );
}

// ═══════════════════════════════════════════════════════════
// SECTION 2: ESTA SEMANA
// ═══════════════════════════════════════════════════════════
function EstaSemanaSection(props) {
  var alerts = props.alerts || [];
  var eventos = props.eventos || [];
  var navigation = props.navigation;
  var ps = usePrivacyStyle();

  if (alerts.length === 0 && eventos.length === 0) return null;

  var alertsTop = alerts.slice(0, 2);
  var eventosTop = eventos.slice(0, 3);

  return (
    <Glass padding={T.space.cardPad} style={{ marginBottom: T.space.gap }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: T.space.xs, marginBottom: T.space.sm }}>
        <Text style={{ fontSize: 14 }}>📅</Text>
        <Text style={{ fontSize: 13, color: T.color.textPrimary, fontFamily: F.display, fontWeight: '700' }}>
          Esta Semana
        </Text>
      </View>

      {alertsTop.map(function(a, idx) {
        var sevColor = a.severidade === 'alta' ? T.color.danger : a.severidade === 'media' ? T.color.warning : T.color.info;
        return (
          <View key={'alert' + idx} style={{
            flexDirection: 'row', alignItems: 'center',
            gap: T.space.xs, paddingVertical: T.space.xs,
            borderBottomWidth: 1, borderBottomColor: T.color.border,
          }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: sevColor }} />
            <Text style={{ flex: 1, fontSize: 12, color: T.color.textPrimary, fontFamily: F.body }} numberOfLines={1}>
              {a.titulo}
            </Text>
          </View>
        );
      })}

      {eventosTop.map(function(e, idx) {
        var diaSemIdx = e.data.getDay();
        var diaNome = DIAS_SEM[diaSemIdx] + ' ' + e.data.getDate();
        var icon = e.tipo === 'opcao' ? '📋' : '💰';
        return (
          <View key={'ev' + idx} style={{
            flexDirection: 'row', alignItems: 'center',
            gap: T.space.xs, paddingVertical: T.space.xs,
            borderBottomWidth: idx < eventosTop.length - 1 ? 1 : 0,
            borderBottomColor: T.color.border,
          }}>
            <Text style={{ fontSize: 12 }}>{icon}</Text>
            <Text style={{ fontSize: 11, color: T.color.textMuted, fontFamily: F.mono, width: 60 }}>
              {diaNome}
            </Text>
            <Text style={{ flex: 1, fontSize: 12, color: T.color.textPrimary, fontFamily: F.mono, fontWeight: '600' }}>
              {e.ticker}
            </Text>
            <Sensitive>
              <Text style={[{ fontSize: 12, color: T.color.income, fontFamily: F.mono, fontWeight: '700' }, ps]}>
                {'+R$ ' + fmt(e.valor)}
              </Text>
            </Sensitive>
          </View>
        );
      })}

      <TouchableOpacity
        onPress={function() { navigation.navigate('CalendarioRenda'); }}
        activeOpacity={0.7}
        style={{
          marginTop: T.space.sm,
          paddingVertical: T.space.xs,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: T.space.xxs,
        }}
      >
        <Text style={{ fontSize: 11, color: T.color.accent, fontFamily: F.body, fontWeight: '600' }}>
          Ver calendario completo
        </Text>
        <Ionicons name="chevron-forward" size={12} color={T.color.accent} />
      </TouchableOpacity>
    </Glass>
  );
}

// ═══════════════════════════════════════════════════════════
// SECTION 3: COMO CRESCER
// ═══════════════════════════════════════════════════════════
function ComoCrescerSection(props) {
  var potencial = props.potencial;
  var rendaAtual = props.rendaAtual;
  var navigation = props.navigation;
  var userId = props.userId;
  var ps = usePrivacyStyle();

  if (!potencial) return null;

  var captura = potencial.capturaPct || 0;
  var gap = potencial.gap || 0;
  var gaps = potencial.gaps || [];
  var topGaps = gaps.slice(0, 3);

  return (
    <Glass padding={T.space.cardPad} glow="rgba(34,197,94,0.12)" style={{ marginBottom: T.space.gap, borderColor: 'rgba(34,197,94,0.22)' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: T.space.xs, marginBottom: T.space.sm }}>
        <Text style={{ fontSize: 14 }}>🚀</Text>
        <Text style={{ fontSize: 13, color: T.color.textPrimary, fontFamily: F.display, fontWeight: '700' }}>
          Como Crescer
        </Text>
      </View>

      {gap > 0 ? (
        <View style={{
          backgroundColor: T.color.incomeBg,
          borderRadius: T.radius.sm,
          padding: T.space.sm,
          marginBottom: T.space.sm,
        }}>
          <Sensitive>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 2 }}>
              <Text style={[{ fontSize: 11, color: T.color.income, fontFamily: F.mono, fontWeight: '700' }, ps]}>+R$ </Text>
              <Text style={[{ fontSize: 24, color: T.color.income, fontFamily: F.mono, fontWeight: '800', lineHeight: 28 }, ps]}>
                {fmtInt(gap)}
              </Text>
              <Text style={[{ fontSize: 12, color: T.color.income, fontFamily: F.mono, fontWeight: '600' }, ps]}>/mes</Text>
            </View>
          </Sensitive>
          <Text style={{ fontSize: 11, color: T.color.textSecondary, fontFamily: F.body, marginBottom: T.space.xs }}>
            {'de potencial nao capturado  ·  voce captura ' + captura.toFixed(0) + '%'}
          </Text>
          <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
            <View style={{
              height: 4, borderRadius: 2, backgroundColor: T.color.income,
              width: Math.min(100, captura) + '%',
            }} />
          </View>
        </View>
      ) : null}

      {topGaps.length > 0 ? (
        <View style={{ marginBottom: T.space.sm }}>
          {topGaps.map(function(g, idx) {
            return (
              <TouchableOpacity
                key={'gap' + idx}
                activeOpacity={0.7}
                onPress={function() { if (g.rota) navigation.navigate(g.rota); }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: T.space.xs,
                  borderBottomWidth: idx < topGaps.length - 1 ? 1 : 0,
                  borderBottomColor: T.color.border,
                }}
              >
                <View style={{
                  width: 28, height: 28, borderRadius: 14,
                  backgroundColor: T.color.incomeBgStrong,
                  alignItems: 'center', justifyContent: 'center',
                  marginRight: T.space.sm,
                }}>
                  <Text style={{ fontSize: 11, color: T.color.income, fontFamily: F.mono, fontWeight: '800' }}>
                    {idx + 1}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: T.color.textPrimary, fontFamily: F.body, fontWeight: '600' }} numberOfLines={1}>
                    {g.titulo}
                  </Text>
                  <Sensitive>
                    <Text style={[{ fontSize: 10, color: T.color.textMuted, fontFamily: F.mono }, ps]} numberOfLines={1}>
                      {'+R$ ' + fmt(g.ganhoMensal) + '/mes  ·  ' + g.acao}
                    </Text>
                  </Sensitive>
                </View>
                <Ionicons name="chevron-forward" size={14} color={T.color.textMuted} />
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      <TouchableOpacity
        activeOpacity={0.8}
        onPress={function() { navigation.navigate('Acoes'); }}
        style={{
          backgroundColor: T.color.incomeBgStrong,
          paddingVertical: T.space.sm,
          borderRadius: T.radius.sm,
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'center',
          gap: T.space.xxs,
        }}
      >
        <Text style={{ fontSize: 12, color: T.color.income, fontFamily: F.display, fontWeight: '700' }}>
          Abrir ferramentas de crescimento
        </Text>
        <Ionicons name="chevron-forward" size={14} color={T.color.income} />
      </TouchableOpacity>

      <View style={{ marginTop: T.space.sm }}>
        <SnowballCard userId={userId} rendaAtual={rendaAtual} />
      </View>
    </Glass>
  );
}

// ═══════════════════════════════════════════════════════════
// SECTION 4: BREAKDOWN 12M
// ═══════════════════════════════════════════════════════════
function BreakdownSection(props) {
  var forecast = props.forecast;
  var ps = usePrivacyStyle();

  if (!forecast || !forecast.monthly) return null;

  var monthly = forecast.monthly;
  var bySource = forecast.bySource || {};
  var summary = forecast.summary || {};
  var mediaProj = summary.mediaProjetada || 0;

  var fontes = [
    { k: 'fii', label: 'FIIs', color: T.color.fii, val: bySource.fii || 0 },
    { k: 'acao', label: 'Acoes/ETFs', color: T.color.acao, val: bySource.acao || 0 },
    { k: 'opcao', label: 'Opcoes', color: T.color.opcao, val: bySource.opcao || 0 },
    { k: 'rf', label: 'Renda Fixa', color: T.color.rf, val: bySource.rf || 0 },
  ];

  return (
    <Glass padding={T.space.cardPad} style={{ marginBottom: T.space.gap }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: T.space.xs, marginBottom: T.space.sm }}>
        <Text style={{ fontSize: 14 }}>📊</Text>
        <Text style={{ fontSize: 13, color: T.color.textPrimary, fontFamily: F.display, fontWeight: '700' }}>
          Projecao 12 meses
        </Text>
      </View>

      <Bars12m data={monthly} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: T.space.sm }}>
        <Text style={{ fontSize: 9, color: T.color.textMuted, fontFamily: F.mono }}>
          {monthly[0] ? MESES[monthly[0].mes] : ''}
        </Text>
        <Text style={{ fontSize: 9, color: T.color.textMuted, fontFamily: F.mono }}>
          {monthly.length > 0 ? MESES[monthly[monthly.length - 1].mes] : ''}
        </Text>
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: T.color.border, paddingTop: T.space.sm }}>
        <Text style={[T.type.kpiLabel, { color: T.color.textMuted, marginBottom: T.space.xs }]}>
          POR FONTE (media/mes)
        </Text>
        {fontes.map(function(src) {
          var pct = mediaProj > 0 ? (src.val / mediaProj) * 100 : 0;
          return (
            <View key={src.k} style={{ marginBottom: T.space.xs }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: T.space.xxs }}>
                  <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: src.color }} />
                  <Text style={{ fontSize: 11, color: T.color.textPrimary, fontFamily: F.body }}>{src.label}</Text>
                </View>
                <Sensitive>
                  <Text style={[{ fontSize: 11, color: T.color.textPrimary, fontFamily: F.mono, fontWeight: '600' }, ps]}>
                    {'R$ ' + fmt(src.val) + '  ·  ' + pct.toFixed(0) + '%'}
                  </Text>
                </Sensitive>
              </View>
              <View style={{ height: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
                <View style={{ height: 3, borderRadius: 2, backgroundColor: src.color, width: Math.min(100, pct) + '%' }} />
              </View>
            </View>
          );
        })}
      </View>
    </Glass>
  );
}

// ═══════════════════════════════════════════════════════════
// TELA PRINCIPAL
// ═══════════════════════════════════════════════════════════
export default function RendaHomeScreen(props) {
  var navigation = props.navigation;
  var auth = useAuth();
  var user = auth.user;

  var income = useIncome();
  var carteira = useCarteira();
  var financas = useFinancas();
  var store = useAppStore();
  var refresh = useRefresh();
  var privacy = usePrivacy();

  var forecast = income.forecast;
  var alerts = income.alerts;
  var positions = carteira.positions;
  var rf = carteira.rf;
  var opcoes = carteira.opcoes;
  var portfolios = carteira.portfolios || [];
  var selectedPortfolio = carteira.selectedPortfolio;
  var setSelectedPortfolio = carteira.setSelectedPortfolio;
  var saldos = financas.saldos;
  var profile = store.profile;

  var _refreshing = useState(false); var refreshing = _refreshing[0]; var setRefreshing = _refreshing[1];
  var _potencial = useState(null); var potencial = _potencial[0]; var setPotencial = _potencial[1];
  var _proventosList = useState([]); var proventosList = _proventosList[0]; var setProventosList = _proventosList[1];
  var _dashData = useState(null); var dashData = _dashData[0]; var setDashData = _dashData[1];
  var _chartPeriod = useState('ALL'); var chartPeriod = _chartPeriod[0]; var setChartPeriod = _chartPeriod[1];

  function loadDashboard() {
    if (!user) return Promise.resolve();
    var pfArg = selectedPortfolio || undefined;
    return getDashboard(user.id, pfArg).then(function(res) {
      // getDashboard retorna o objeto de dados direto (nao envolvido em {data, error}).
      if (res) setDashData(res);
    }).catch(function(err) {
      console.warn('getDashboard error:', err && err.message);
    });
  }

  useFocusEffect(useCallback(function() {
    if (!user) return;
    computeRendaPotencial(user.id)
      .then(function(res) { setPotencial(res); })
      .catch(function(err) { console.warn('potencial error:', err && err.message); });
    setProventosList(store.proventos || []);
  }, [user, store.proventos]));

  // Reage a mudancas de user/portfolio pra refetch o dashboard mesmo quando a
  // tela ja esta focada. useFocusEffect so dispara no evento de focus, nao
  // quando deps mudam in-place.
  useEffect(function() {
    if (!user) return;
    loadDashboard();
  }, [user, selectedPortfolio]);

  function onRefresh() {
    setRefreshing(true);
    refresh().then(function() {
      if (user) {
        return Promise.all([
          computeRendaPotencial(user.id).then(function(res) { setPotencial(res); }),
          loadDashboard(),
        ]);
      }
    }).catch(function() {}).then(function() {
      setRefreshing(false);
    });
  }

  // Derivados — prefere patrimonio do getDashboard (ja aplica a regra
  // 'saldos globais so entram em Todos' e faz FX pra posicoes INT).
  // Fallback local enquanto dashData carrega.
  var patrimonio = (dashData && typeof dashData.patrimonio === 'number')
    ? dashData.patrimonio
    : computePatrimonio(positions, rf, saldos);
  var rendaMedia = (forecast && forecast.summary && forecast.summary.mediaProjetada) || 0;
  var meta = (profile && profile.meta_mensal) || 0;
  var eventos7d = computeProximos7Dias(proventosList, opcoes);
  var opsAtivas = countOpsAtivas(opcoes);
  var opsVenc7d = countOpsVenc7d(opcoes);

  var rfTotalAplicado = 0;
  for (var rfi = 0; rfi < rf.length; rfi++) rfTotalAplicado += (rf[rfi].valor_aplicado || 0);

  var allocRes = computeAlloc(positions, rfTotalAplicado);
  var alloc = allocRes.alloc;
  var totalAlloc = allocRes.totalAlloc;

  var patrimonioHistory = (dashData && dashData.patrimonioHistory) || [];
  var rentRes = computeRentabilidade(patrimonioHistory, patrimonio, positions, rfTotalAplicado);

  var posicoesCount = positions.length + rf.length;

  var loadingInicial = income.loading && !forecast;

  return (
    <View style={{ flex: 1, backgroundColor: T.color.bg }}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.color.accent} />
      }
    >
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: T.space.sm,
      }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: T.color.textPrimary, fontFamily: F.display }}>
          Renda
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            onPress={function() { privacy.togglePrivacy(); }}
            activeOpacity={0.7}
            style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: T.color.surface1,
              alignItems: 'center', justifyContent: 'center',
            }}
            accessibilityLabel="Alternar privacidade"
          >
            <Ionicons
              name={privacy.isPrivate ? 'eye-off-outline' : 'eye-outline'}
              size={18}
              color={T.color.textSecondary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={function() { navigation.navigate('Mais'); }}
            style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: T.color.surface1,
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="person-outline" size={18} color={T.color.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Portfolio selector */}
      {portfolios.length > 0 ? (
        <View style={{ marginBottom: T.space.md }}>
          <PortfolioSelector
            portfolios={portfolios}
            selected={selectedPortfolio}
            onChange={setSelectedPortfolio}
          />
        </View>
      ) : null}

      {loadingInicial ? (
        <View style={{ paddingVertical: T.space.xxl, alignItems: 'center' }}>
          <ActivityIndicator size="large" color={T.color.accent} />
          <Text style={{ fontSize: 12, color: T.color.textMuted, fontFamily: F.mono, marginTop: T.space.sm }}>
            Calculando sua renda...
          </Text>
        </View>
      ) : (
        <View>
          <PatrimonioHeroSection
            patrimonio={patrimonio}
            rendaMedia={rendaMedia}
            forecast={forecast}
            patrimonioHistory={patrimonioHistory}
            alloc={alloc}
            totalAlloc={totalAlloc}
            rentSemanal={rentRes.rentSemanal}
            rentMensal={rentRes.rentMensal}
            rentAno={rentRes.rentAno}
            rentTotal={rentRes.rentTotal}
            chartPeriod={chartPeriod}
            setChartPeriod={setChartPeriod}
            posicoesCount={posicoesCount}
            opsAtivas={opsAtivas}
            opsVenc7d={opsVenc7d}
          />

          <RendaDoMesSection
            dashData={dashData}
            meta={meta}
          />

          <EstaSemanaSection
            alerts={alerts}
            eventos={eventos7d}
            navigation={navigation}
          />

          <ComoCrescerSection
            potencial={potencial}
            rendaAtual={rendaMedia}
            userId={user && user.id}
            navigation={navigation}
          />

          <BreakdownSection forecast={forecast} />
        </View>
      )}

      <View style={{ height: T.space.xl }} />
    </ScrollView>
    <Fab navigation={navigation} />
    </View>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.color.bg },
  content: { padding: T.space.screenPad },
});
