import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { animateLayout } from '../../utils/a11y';
import Svg, { Rect, Line as SvgLine, Text as SvgText } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import {
  getSaldos, upsertSaldo, deleteSaldo,
  getMovimentacoes, addMovimentacaoComSaldo, deleteMovimentacao,
  getMovimentacoesSummary, buildMovDescricao, reconciliarVendasAntigas,
  recalcularSaldos,
} from '../../services/database';
import { fetchExchangeRates, convertToBRL, getSymbol } from '../../services/currencyService';
import { Glass, Badge, Pill, SectionLabel, SwipeableRow, PressableCard, Fab } from '../../components';
import { SkeletonCaixa, EmptyState } from '../../components/States';
import { usePrivacyStyle } from '../../components/Sensitive';
import Sensitive from '../../components/Sensitive';
import * as Haptics from 'expo-haptics';

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ══════════════════════════════════════════════
// Ícones Ionicons por categoria
// ══════════════════════════════════════════════
var CAT_IONICONS = {
  deposito: 'arrow-down-circle-outline',
  retirada: 'arrow-up-circle-outline',
  transferencia: 'swap-horizontal-outline',
  compra_ativo: 'cart-outline',
  venda_ativo: 'trending-up-outline',
  premio_opcao: 'flash-outline',
  recompra_opcao: 'flash-outline',
  exercicio_opcao: 'flash-outline',
  dividendo: 'cash-outline',
  jcp: 'cash-outline',
  rendimento_fii: 'home-outline',
  rendimento_rf: 'document-text-outline',
  ajuste_manual: 'build-outline',
  salario: 'wallet-outline',
  despesa_fixa: 'receipt-outline',
  despesa_variavel: 'receipt-outline',
  outro: 'ellipse-outline',
};

var CAT_COLORS = {
  deposito: C.green, retirada: C.red, transferencia: C.accent,
  compra_ativo: C.acoes, venda_ativo: C.acoes,
  premio_opcao: C.opcoes, recompra_opcao: C.opcoes,
  exercicio_opcao: C.opcoes, dividendo: C.opcoes,
  jcp: C.opcoes, rendimento_fii: C.opcoes, rendimento_rf: C.rf,
  ajuste_manual: C.dim, salario: C.green,
  despesa_fixa: C.yellow, despesa_variavel: C.yellow, outro: C.dim,
};

var CAT_LABELS = {
  deposito: 'Depósito', retirada: 'Retirada', transferencia: 'Transferência',
  compra_ativo: 'Compra ativo', venda_ativo: 'Venda ativo',
  premio_opcao: 'Prêmio opção', recompra_opcao: 'Recompra opção',
  exercicio_opcao: 'Exercício', dividendo: 'Dividendo',
  jcp: 'JCP', rendimento_fii: 'Rendimento FII', rendimento_rf: 'Rendimento RF',
  ajuste_manual: 'Ajuste', salario: 'Salário',
  despesa_fixa: 'Despesa fixa', despesa_variavel: 'Despesa variável', outro: 'Outro',
};

var MESES_NOMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
var MESES_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

var AUTO_CATEGORIAS = ['compra_ativo', 'venda_ativo', 'premio_opcao', 'recompra_opcao',
  'exercicio_opcao', 'dividendo', 'jcp', 'rendimento_fii', 'rendimento_rf'];

var PERIODOS = [
  { k: 'M', l: '1M', months: 1 },
  { k: '3M', l: '3M', months: 3 },
  { k: '6M', l: '6M', months: 6 },
  { k: '1A', l: '1A', months: 12 },
];

var CAIXA_FAB_ITEMS = [
  { label: 'Movimentação', icon: 'swap-vertical-outline', color: C.green, screen: 'AddMovimentacao' },
  { label: 'Nova Conta', icon: 'add-circle-outline', color: C.rf, screen: 'AddConta' },
  { label: 'Extrato', icon: 'receipt-outline', color: C.yellow, screen: 'Extrato' },
];

// ══════════════════════════════════════════════
// HELPER: Agrupar movimentações por data
// ══════════════════════════════════════════════
function groupMovsByDate(movs) {
  var today = new Date();
  var todayStr = today.toISOString().substring(0, 10);
  var yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  var yesterdayStr = yesterday.toISOString().substring(0, 10);

  var groups = [];
  var currentKey = '';
  var currentItems = [];

  for (var i = 0; i < movs.length; i++) {
    var m = movs[i];
    var dateStr = (m.data || '').substring(0, 10);
    var label;
    if (dateStr === todayStr) {
      label = 'HOJE';
    } else if (dateStr === yesterdayStr) {
      label = 'ONTEM';
    } else {
      var parts = dateStr.split('-');
      if (parts.length === 3) {
        var day = parseInt(parts[2]);
        var month = parseInt(parts[1]) - 1;
        label = day + ' DE ' + (MESES_FULL[month] || '').toUpperCase().substring(0, 3);
      } else {
        label = dateStr;
      }
    }

    if (label !== currentKey) {
      if (currentItems.length > 0) {
        groups.push({ label: currentKey, items: currentItems });
      }
      currentKey = label;
      currentItems = [m];
    } else {
      currentItems.push(m);
    }
  }
  if (currentItems.length > 0) {
    groups.push({ label: currentKey, items: currentItems });
  }
  return groups;
}

// ══════════════════════════════════════════════
// SECTION: BAR CHART INTERATIVO — Entradas vs Saídas
// ══════════════════════════════════════════════
function BarChart6m(props) {
  var data = props.data || [];
  var selected = props.selected;
  var onSelect = props.onSelect;
  var _w = useState(0); var w = _w[0]; var setW = _w[1];
  var chartH = 120;
  var barPad = 4;
  var ps = usePrivacyStyle();

  if (w === 0 || data.length === 0) {
    return React.createElement(View, {
      onLayout: function(e) { setW(e.nativeEvent.layout.width); },
      style: { height: chartH + 30 },
    });
  }

  var maxVal = 0;
  for (var i = 0; i < data.length; i++) {
    if (data[i].entradas > maxVal) maxVal = data[i].entradas;
    if (data[i].saidas > maxVal) maxVal = data[i].saidas;
  }
  if (maxVal === 0) maxVal = 1;

  var groupW = w / data.length;
  var barW = (groupW - barPad * 3) / 2;

  function handleTouch(e) {
    if (!onSelect) return;
    var x = e.nativeEvent.locationX;
    var idx = Math.floor(x / groupW);
    if (idx >= 0 && idx < data.length) {
      onSelect(idx === selected ? null : idx);
    }
  }

  return (
    <View onLayout={function(e) { setW(e.nativeEvent.layout.width); }}>
      {/* Tooltip do mês selecionado */}
      {selected != null && data[selected] ? (
        <View style={styles.chartTooltip}>
          <Text style={{ fontSize: 10, color: C.text, fontFamily: F.mono, fontWeight: '700' }}>
            {data[selected].label}
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Text style={[{ fontSize: 10, color: C.green, fontFamily: F.mono }, ps]}>
              +R$ {fmt(data[selected].entradas)}
            </Text>
            <Text style={[{ fontSize: 10, color: C.red, fontFamily: F.mono }, ps]}>
              -R$ {fmt(data[selected].saidas)}
            </Text>
          </View>
        </View>
      ) : null}
      <Sensitive>
        <View onTouchEnd={handleTouch}>
          <Svg width={w} height={chartH + 30}>
            {/* Grid lines */}
            {[0.25, 0.5, 0.75].map(function(p, gi) {
              return React.createElement(SvgLine, {
                key: gi, x1: 0, y1: chartH * (1 - p), x2: w, y2: chartH * (1 - p),
                stroke: 'rgba(255,255,255,0.04)', strokeWidth: 0.5,
              });
            })}
            {data.map(function(d, i) {
              var x = i * groupW + barPad;
              var hE = maxVal > 0 ? (d.entradas / maxVal) * (chartH - 10) : 0;
              var hS = maxVal > 0 ? (d.saidas / maxVal) * (chartH - 10) : 0;
              var isSelected = selected === i;
              var barOpacity = selected != null ? (isSelected ? 1.0 : 0.3) : 0.8;
              return React.createElement(React.Fragment, { key: i },
                React.createElement(Rect, {
                  x: x, y: chartH - hE, width: barW, height: Math.max(hE, 1),
                  rx: 3, fill: C.green, opacity: barOpacity,
                }),
                isSelected ? React.createElement(Rect, {
                  x: x - 1, y: chartH - hE - 1, width: barW + 2, height: Math.max(hE, 1) + 2,
                  rx: 4, fill: 'none', stroke: C.green, strokeWidth: 1, opacity: 0.6,
                }) : null,
                React.createElement(Rect, {
                  x: x + barW + barPad, y: chartH - hS, width: barW, height: Math.max(hS, 1),
                  rx: 3, fill: C.red, opacity: barOpacity,
                }),
                isSelected ? React.createElement(Rect, {
                  x: x + barW + barPad - 1, y: chartH - hS - 1, width: barW + 2, height: Math.max(hS, 1) + 2,
                  rx: 4, fill: 'none', stroke: C.red, strokeWidth: 1, opacity: 0.6,
                }) : null,
                React.createElement(SvgText, {
                  x: x + groupW / 2 - barPad, y: chartH + 16,
                  fontSize: 9, fill: isSelected ? C.text : C.dim, textAnchor: 'middle',
                  fontFamily: F.mono, fontWeight: isSelected ? '700' : '400',
                }, d.label)
              );
            })}
          </Svg>
        </View>
      </Sensitive>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: C.green }} />
          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>Entradas</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: C.red }} />
          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>Saídas</Text>
        </View>
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════
// SECTION: CATEGORY BREAKDOWN com Drill-down
// ══════════════════════════════════════════════
function CategoryBreakdown(props) {
  var data = props.data || {};
  var total = props.total || 1;
  var movs = props.movs || [];
  var expandedCat = props.expandedCat;
  var onToggleCat = props.onToggleCat;
  var navigation = props.navigation;
  var ps = usePrivacyStyle();

  var keys = Object.keys(data);
  keys.sort(function(a, b) { return (data[b] || 0) - (data[a] || 0); });

  return (
    <View style={{ gap: 4 }}>
      {keys.map(function(k) {
        var val = data[k] || 0;
        var pct = total > 0 ? (val / total) * 100 : 0;
        var color = CAT_COLORS[k] || C.dim;
        var label = CAT_LABELS[k] || k;
        var isExpanded = expandedCat === k;

        // Filtrar movimentações desta categoria
        var catMovs = [];
        if (isExpanded) {
          for (var ci = 0; ci < movs.length; ci++) {
            if (movs[ci].categoria === k && catMovs.length < 5) {
              catMovs.push(movs[ci]);
            }
          }
        }

        return (
          <View key={k}>
            <TouchableOpacity
              onPress={function() { onToggleCat(k); }}
              activeOpacity={0.7}
              style={[styles.catRow, isExpanded && { backgroundColor: color + '08', borderRadius: 8 }]}>
              <Ionicons name={CAT_IONICONS[k] || 'ellipse-outline'} size={14} color={color} />
              <Text style={{ flex: 1, fontSize: 11, color: C.sub, fontFamily: F.body }} numberOfLines={1}>{label}</Text>
              <View style={{ width: 70, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.03)' }}>
                <View style={{ width: Math.max(pct, 2) + '%', height: 6, borderRadius: 3, backgroundColor: color + '60' }} />
              </View>
              <Text style={{ fontSize: 10, color: color, fontFamily: F.mono, fontWeight: '600', width: 36, textAlign: 'right' }}>
                {pct.toFixed(0)}%
              </Text>
              <Text style={[{ fontSize: 10, color: C.dim, fontFamily: F.mono, width: 65, textAlign: 'right' }, ps]}>
                R$ {fmt(val)}
              </Text>
              <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={12} color={C.dim} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
            {isExpanded && catMovs.length > 0 ? (
              <View style={styles.catDrill}>
                {catMovs.map(function(m, mi) {
                  var isEntrada = m.tipo === 'entrada';
                  var movColor = isEntrada ? C.green : C.red;
                  return (
                    <View key={m.id || mi} style={styles.catDrillRow}>
                      <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, width: 36 }}>
                        {formatDate(m.data)}
                      </Text>
                      <Text style={{ flex: 1, fontSize: 10, color: C.sub, fontFamily: F.body }} numberOfLines={1}>
                        {m.ticker || m.conta || ''}
                      </Text>
                      <Text style={[{ fontSize: 10, color: movColor, fontFamily: F.mono, fontWeight: '600' }, ps]}>
                        {isEntrada ? '+' : '-'}R$ {fmt(m.valor)}
                      </Text>
                    </View>
                  );
                })}
                <TouchableOpacity
                  onPress={function() { navigation.navigate('Extrato'); }}
                  activeOpacity={0.7}
                  style={{ alignSelf: 'center', paddingVertical: 4 }}>
                  <Text style={{ fontSize: 10, color: C.accent, fontFamily: F.mono }}>Ver todos →</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

// ══════════════════════════════════════════════
// HELPER
// ══════════════════════════════════════════════
function formatDate(dateStr) {
  if (!dateStr) return '';
  var parts = dateStr.substring(0, 10).split('-');
  if (parts.length !== 3) return dateStr;
  return parts[2] + '/' + parts[1];
}

// ══════════════════════════════════════════════
// MAIN CAIXA VIEW
// ══════════════════════════════════════════════
export default function CaixaView(props) {
  var navigation = props.navigation;
  var user = useAuth().user;
  var ps = usePrivacyStyle();

  var _saldos = useState([]); var saldos = _saldos[0]; var setSaldos = _saldos[1];
  var _movs = useState([]); var movs = _movs[0]; var setMovs = _movs[1];
  var _allSummaries = useState([]); var allSummaries = _allSummaries[0]; var setAllSummaries = _allSummaries[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _refreshing = useState(false); var refreshing = _refreshing[0]; var setRefreshing = _refreshing[1];
  var _expanded = useState(null); var expanded = _expanded[0]; var setExpanded = _expanded[1];
  var _actMode = useState(null); var actMode = _actMode[0]; var setActMode = _actMode[1];
  var _actVal = useState(''); var actVal = _actVal[0]; var setActVal = _actVal[1];
  var _trDest = useState(null); var trDest = _trDest[0]; var setTrDest = _trDest[1];
  var _trCambio = useState(''); var trCambio = _trCambio[0]; var setTrCambio = _trCambio[1];
  var _rates = useState({ BRL: 1 }); var rates = _rates[0]; var setRates = _rates[1];
  var _loadError = useState(false); var loadError = _loadError[0]; var setLoadError = _loadError[1];
  var _periodo = useState('M'); var periodo = _periodo[0]; var setPeriodo = _periodo[1];
  var _selectedMonth = useState(null); var selectedMonth = _selectedMonth[0]; var setSelectedMonth = _selectedMonth[1];
  var _expandedCat = useState(null); var expandedCat = _expandedCat[0]; var setExpandedCat = _expandedCat[1];

  var load = async function() {
    if (!user) return;
    setLoadError(false);
    var now = new Date();
    var mesAtual = now.getMonth() + 1;
    var anoAtual = now.getFullYear();

    // Build 12-month summary requests (para suportar todos os períodos)
    var histPromises = [];
    var histLabels = [];
    var histMonths = []; // {mes, ano} para filtro
    for (var hi = 11; hi >= 0; hi--) {
      var hd = new Date(anoAtual, mesAtual - 1 - hi, 1);
      var hm = hd.getMonth() + 1;
      var hy = hd.getFullYear();
      histPromises.push(getMovimentacoesSummary(user.id, hm, hy));
      histLabels.push(MESES_NOMES[hm - 1]);
      histMonths.push({ mes: hm, ano: hy });
    }

    var results;
    try {
      results = await Promise.all([
        getSaldos(user.id),
        getMovimentacoes(user.id, { limit: 15 }),
      ].concat(histPromises));
    } catch (e) {
      console.warn('CaixaView load failed:', e);
      setLoadError(true);
      setLoading(false);
      return;
    }

    var saldosArr = results[0].data || [];
    setSaldos(saldosArr);
    setMovs(results[1].data || []);

    // Build all 12 month summaries
    var summaries = [];
    for (var hj = 0; hj < 12; hj++) {
      var hSummary = results[2 + hj];
      summaries.push({
        label: histLabels[hj],
        mes: histMonths[hj].mes,
        ano: histMonths[hj].ano,
        entradas: hSummary.totalEntradas,
        saidas: hSummary.totalSaidas,
        saldo: hSummary.saldo,
        porCategoria: hSummary.porCategoria,
        movs: hSummary.movs || [],
      });
    }
    setAllSummaries(summaries);

    // Buscar câmbio para moedas estrangeiras
    var moedasEstrangeiras = [];
    for (var mi = 0; mi < saldosArr.length; mi++) {
      var moedaItem = saldosArr[mi].moeda || 'BRL';
      if (moedaItem !== 'BRL' && moedasEstrangeiras.indexOf(moedaItem) === -1) {
        moedasEstrangeiras.push(moedaItem);
      }
    }
    var newRates = { BRL: 1 };
    if (moedasEstrangeiras.length > 0) {
      try { newRates = await fetchExchangeRates(moedasEstrangeiras); } catch (e) { /* fallback */ }
    }
    setRates(newRates);
    setLoading(false);
  };

  useFocusEffect(useCallback(function() { load(); }, [user]));

  var onRefresh = async function() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // ── Cálculos derivados do período ──
  var periodoMonths = 1;
  for (var pi = 0; pi < PERIODOS.length; pi++) {
    if (PERIODOS[pi].k === periodo) { periodoMonths = PERIODOS[pi].months; break; }
  }

  // Summaries filtrados pelo período (últimos N meses)
  var filteredSummaries = allSummaries.slice(12 - periodoMonths);

  // Agregar entradas/saídas/saldo/porCategoria para o período
  var periodoEntradas = 0;
  var periodoSaidas = 0;
  var periodoPorCategoria = {};
  for (var fi = 0; fi < filteredSummaries.length; fi++) {
    periodoEntradas += filteredSummaries[fi].entradas;
    periodoSaidas += filteredSummaries[fi].saidas;
    var catKeys = Object.keys(filteredSummaries[fi].porCategoria || {});
    for (var ck = 0; ck < catKeys.length; ck++) {
      if (!periodoPorCategoria[catKeys[ck]]) periodoPorCategoria[catKeys[ck]] = 0;
      periodoPorCategoria[catKeys[ck]] += filteredSummaries[fi].porCategoria[catKeys[ck]];
    }
  }
  var periodoSaldo = periodoEntradas - periodoSaidas;

  // Comparação com período anterior (mesmo tamanho)
  var prevSummaries = allSummaries.slice(Math.max(0, 12 - periodoMonths * 2), 12 - periodoMonths);
  var prevSaldo = 0;
  for (var pvi = 0; pvi < prevSummaries.length; pvi++) {
    prevSaldo += prevSummaries[pvi].entradas - prevSummaries[pvi].saidas;
  }

  // Hist para gráfico: usa últimos 6 meses sempre
  var hist6m = allSummaries.slice(6);

  // Saldo total em BRL (convertido)
  var totalSaldos = 0;
  for (var si = 0; si < saldos.length; si++) {
    var sMoeda = saldos[si].moeda || 'BRL';
    var sOriginal = saldos[si].saldo || 0;
    totalSaldos += convertToBRL(sOriginal, sMoeda, rates);
  }

  // ── Handlers ──
  function toggleExpand(id) {
    animateLayout();
    if (expanded === id) {
      setExpanded(null);
      setActMode(null);
      setActVal('');
      setTrDest(null);
    } else {
      setExpanded(id);
      setActMode(null);
      setActVal('');
      setTrDest(null);
    }
  }

  function openMode(mode) {
    animateLayout();
    setActMode(actMode === mode ? null : mode);
    setActVal('');
    setTrDest(null);
    setTrCambio('');
  }

  function resetAction() {
    setActMode(null);
    setActVal('');
    setTrDest(null);
    setTrCambio('');
  }

  function onChangeVal(t) {
    var nums = t.replace(/\D/g, '');
    if (nums === '') { setActVal(''); return; }
    var centavos = parseInt(nums);
    var reais = (centavos / 100).toFixed(2);
    var parts = reais.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    setActVal(parts[0] + ',' + parts[1]);
  }

  function parseVal() {
    return parseFloat((actVal || '').replace(/\./g, '').replace(',', '.')) || 0;
  }

  function handleDepositar(s) {
    var num = parseVal();
    if (num <= 0) return;
    var sName = s.corretora || s.name || '';
    resetAction();
    addMovimentacaoComSaldo(user.id, {
      conta: sName, tipo: 'entrada', categoria: 'deposito',
      valor: num, descricao: buildMovDescricao('deposito', null, sName),
      data: new Date().toISOString().substring(0, 10),
      moeda: s.moeda || 'BRL',
    }).then(function() { load(); });
  }

  function handleDeduzir(s) {
    var num = parseVal();
    if (num <= 0) return;
    var sName = s.corretora || s.name || '';
    resetAction();
    addMovimentacaoComSaldo(user.id, {
      conta: sName, tipo: 'saida', categoria: 'retirada',
      valor: num, descricao: buildMovDescricao('retirada', null, sName),
      data: new Date().toISOString().substring(0, 10),
      moeda: s.moeda || 'BRL',
    }).then(function() { load(); });
  }

  function handleTransferir(s) {
    var num = parseVal();
    if (num <= 0 || !trDest) return;
    var sName = s.corretora || s.name || '';
    if (num > (s.saldo || 0)) {
      Alert.alert('Saldo insuficiente', 'O valor excede o saldo disponível.');
      return;
    }
    var dest = saldos.find(function(x) { return x.id === trDest; });
    if (!dest) return;
    var destName = dest.corretora || dest.name || '';

    var sMoeda2 = s.moeda || 'BRL';
    var dMoeda = dest.moeda || 'BRL';
    var valorDest = num;
    var descOrigem = 'Transferência para ' + destName;
    var descDest = 'Transferência de ' + sName;

    if (sMoeda2 !== dMoeda) {
      var cambio = parseFloat((trCambio || '').replace(',', '.')) || 0;
      if (cambio <= 0) {
        Alert.alert('Câmbio inválido', 'Informe a taxa de câmbio para converter ' + sMoeda2 + ' → ' + dMoeda + '.');
        return;
      }
      valorDest = num * cambio;
      descOrigem = 'Transferência para ' + destName + ' (' + getSymbol(sMoeda2) + ' ' + fmt(num) + ' × ' + cambio.toFixed(4) + ' = ' + getSymbol(dMoeda) + ' ' + fmt(valorDest) + ')';
      descDest = 'Transferência de ' + sName + ' (' + getSymbol(sMoeda2) + ' ' + fmt(num) + ' × ' + cambio.toFixed(4) + ' = ' + getSymbol(dMoeda) + ' ' + fmt(valorDest) + ')';
    }

    resetAction();
    Promise.all([
      addMovimentacaoComSaldo(user.id, {
        conta: sName, tipo: 'saida', categoria: 'transferencia',
        valor: num, descricao: descOrigem,
        conta_destino: destName,
        data: new Date().toISOString().substring(0, 10),
        moeda: sMoeda2,
      }),
      addMovimentacaoComSaldo(user.id, {
        conta: destName, tipo: 'entrada', categoria: 'transferencia',
        valor: valorDest, descricao: descDest,
        data: new Date().toISOString().substring(0, 10),
        moeda: dMoeda,
      }),
    ]).then(function() { load(); });
  }

  function handleEditar(s) {
    var num = parseVal();
    var sName = s.corretora || s.name || '';
    var saldoAntigo = s.saldo || 0;
    var diff = num - saldoAntigo;
    resetAction();
    setExpanded(null);

    upsertSaldo(user.id, {
      corretora: sName,
      saldo: num,
      moeda: s.moeda || 'BRL',
    }).then(function(res) {
      if (res.error) {
        Alert.alert('Erro', 'Falha ao atualizar saldo.');
        return;
      }
      if (diff !== 0) {
        addMovimentacaoComSaldo(user.id, {
          conta: sName,
          tipo: diff > 0 ? 'entrada' : 'saida',
          categoria: 'ajuste_manual',
          valor: Math.abs(diff),
          descricao: 'Ajuste manual de saldo (' + getSymbol(s.moeda || 'BRL') + ' ' + fmt(saldoAntigo) + ' → ' + getSymbol(s.moeda || 'BRL') + ' ' + fmt(num) + ')',
          saldo_apos: num,
          data: new Date().toISOString().substring(0, 10),
        });
      }
      load();
    });
  }

  function handleExcluir(s) {
    var sName = s.corretora || s.name || '';
    Alert.alert(
      'Excluir conta',
      'Remover ' + sName + ' e todo o saldo (' + getSymbol(s.moeda || 'BRL') + ' ' + fmt(s.saldo || 0) + ')? Esta ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir', style: 'destructive',
          onPress: function() {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setExpanded(null);
            setActMode(null);
            deleteSaldo(s.id).then(function(res) {
              if (res && res.error) {
                Alert.alert('Erro', 'Falha ao excluir conta. Tente novamente.');
              }
              load();
            }).catch(function() {
              Alert.alert('Erro', 'Falha ao excluir conta.');
              load();
            });
          },
        },
      ]
    );
  }

  function handleAddConta() {
    navigation.navigate('AddConta');
  }

  var _reconciling = useState(false); var reconciling = _reconciling[0]; var setReconciling = _reconciling[1];
  function handleReconciliar() {
    Alert.alert(
      'Reconciliar vendas antigas',
      'Isso vai creditar nas contas o valor de vendas que não tiveram movimentação registrada e recalcular os saldos. Deseja continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reconciliar',
          onPress: function() {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setReconciling(true);
            reconciliarVendasAntigas(user.id).then(function(res) {
              return recalcularSaldos(user.id).then(function(sRes) {
                setReconciling(false);
                if (res.pendentes === 0) {
                  Alert.alert('Tudo certo', 'Nenhuma venda pendente.\nSaldos recalculados (' + sRes.atualizadas + ' conta(s)).');
                } else {
                  Alert.alert(
                    'Reconciliação concluída',
                    res.creditadas + ' venda(s) creditada(s).\nSaldos recalculados (' + sRes.atualizadas + ' conta(s)).' +
                    (res.erros > 0 ? '\n' + res.erros + ' erro(s) (sem corretora ou valor inválido).' : '')
                  );
                }
                load();
              });
            }).catch(function(e) {
              setReconciling(false);
              Alert.alert('Erro', 'Falha na reconciliação: ' + (e.message || e));
            });
          },
        },
      ]
    );
  }

  function handleDeleteMov(mov) {
    var isAuto = AUTO_CATEGORIAS.indexOf(mov.categoria) >= 0;
    if (isAuto) {
      Alert.alert('Não permitido', 'Movimentações automáticas não podem ser excluídas.');
      return;
    }
    var movMoeda = mov.moeda || 'BRL';
    var desc = mov.descricao || CAT_LABELS[mov.categoria] || mov.categoria;
    Alert.alert(
      'Excluir movimentação?',
      desc + '\n' + getSymbol(movMoeda) + ' ' + fmt(mov.valor) + '\n\nO saldo será revertido automaticamente.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir e reverter', style: 'destructive',
          onPress: function() {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            deleteMovimentacao(mov.id).then(function(res) {
              if (res && res.error) {
                Alert.alert('Erro', 'Falha ao excluir.');
                load();
                return;
              }
              var conta = mov.conta || '';
              var saldoAtual = null;
              for (var ssi = 0; ssi < saldos.length; ssi++) {
                var ssName = saldos[ssi].corretora || saldos[ssi].name || '';
                if (ssName === conta) {
                  saldoAtual = saldos[ssi];
                  break;
                }
              }
              if (saldoAtual) {
                var saldoNovo = (saldoAtual.saldo || 0);
                if (mov.tipo === 'entrada') {
                  saldoNovo = saldoNovo - (mov.valor || 0);
                } else {
                  saldoNovo = saldoNovo + (mov.valor || 0);
                }
                upsertSaldo(user.id, {
                  corretora: conta,
                  saldo: Math.max(0, saldoNovo),
                  moeda: saldoAtual.moeda || 'BRL',
                }).then(function() { load(); });
              } else {
                load();
              }
            });
          },
        },
      ]
    );
  }

  function handleToggleCat(k) {
    animateLayout();
    setExpandedCat(expandedCat === k ? null : k);
  }

  function handleSelectMonth(idx) {
    animateLayout();
    setSelectedMonth(idx);
  }

  // ── Render ──

  if (loading) return <View style={styles.container}><SkeletonCaixa /></View>;
  if (loadError) return (
    <View style={styles.container}>
      <EmptyState ionicon="alert-circle-outline" title="Erro ao carregar" description="Não foi possível carregar o caixa. Verifique sua conexão e tente novamente." cta="Tentar novamente" onCta={function() { setLoading(true); load(); }} color={C.red} />
    </View>
  );

  var modeColor = actMode === 'depositar' ? C.green : actMode === 'transferir' ? C.accent : actMode === 'editar' ? C.acoes : C.yellow;

  // Agrupar movimentações por data
  var movsGrouped = groupMovsByDate(movs);

  return (
  <View style={{ flex: 1 }}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}>

      {/* ══════ 1. HERO — Saldo Total + Chips + Período + Resumo ══════ */}
      <Glass glow={C.green} padding={16}>
        <Text style={styles.heroLabel}>SALDO TOTAL</Text>
        <Text style={[styles.heroValue, ps]}>R$ {fmt(totalSaldos)}</Text>

        {/* Chips de conta */}
        {saldos.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, marginTop: 10 }}>
            {saldos.map(function(s, i) {
              var bc = [C.opcoes, C.acoes, C.fiis, C.etfs, C.rf, C.accent][i % 6];
              var sName = s.corretora || s.name || '';
              var contaMoeda = s.moeda || 'BRL';
              var simbolo = getSymbol(contaMoeda);
              return (
                <View key={s.id || i} style={[styles.chipConta, { borderColor: bc + '30' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={[styles.chipName, { color: bc }]}>
                      {sName.length > 10 ? sName.substring(0, 10) : sName}
                    </Text>
                    {contaMoeda !== 'BRL' ? (
                      <Badge text={contaMoeda} color={C.etfs} />
                    ) : null}
                  </View>
                  <Text style={[styles.chipVal, ps]}>{simbolo} {fmt(s.saldo || 0)}</Text>
                </View>
              );
            })}
          </ScrollView>
        ) : null}

        {/* Seletor de período */}
        <View style={styles.periodBar}>
          {PERIODOS.map(function(p) {
            return (
              <Pill key={p.k} active={periodo === p.k} color={C.accent}
                onPress={function() { setPeriodo(p.k); setSelectedMonth(null); }}>
                {p.l}
              </Pill>
            );
          })}
        </View>

        {/* Resumo inline do período */}
        <View style={styles.heroSummary}>
          <View style={styles.heroSummaryItem}>
            <Text style={styles.heroSummaryLabel}>Entradas</Text>
            <Text style={[styles.heroSummaryVal, { color: C.green }, ps]}>+R$ {fmt(periodoEntradas)}</Text>
          </View>
          <View style={styles.heroSummaryItem}>
            <Text style={styles.heroSummaryLabel}>Saídas</Text>
            <Text style={[styles.heroSummaryVal, { color: C.red }, ps]}>-R$ {fmt(periodoSaidas)}</Text>
          </View>
          <View style={styles.heroSummaryItem}>
            <Text style={styles.heroSummaryLabel}>Saldo</Text>
            <Text style={[styles.heroSummaryVal, { color: periodoSaldo >= 0 ? C.green : C.red }, ps]}>
              {periodoSaldo >= 0 ? '+' : '-'}R$ {fmt(Math.abs(periodoSaldo))}
            </Text>
          </View>
        </View>

        {/* Comparação com período anterior */}
        {prevSummaries.length > 0 && prevSaldo !== 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>vs período anterior</Text>
            <View style={[styles.compareBadge, { backgroundColor: (periodoSaldo >= prevSaldo ? C.green : C.red) + '14' }]}>
              <Text style={[{ fontSize: 9, fontWeight: '700', fontFamily: F.mono, color: periodoSaldo >= prevSaldo ? C.green : C.red }, ps]}>
                {periodoSaldo >= prevSaldo ? '↑' : '↓'} R$ {fmt(Math.abs(periodoSaldo - prevSaldo))}
              </Text>
            </View>
          </View>
        ) : null}
      </Glass>

      {/* ══════ 2. CONTAS (Accordion) ══════ */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <SectionLabel>CONTAS</SectionLabel>
        <TouchableOpacity onPress={handleAddConta} activeOpacity={0.7}
          style={styles.addContaBtn}>
          <Text style={styles.addContaBtnText}>+ Nova conta</Text>
        </TouchableOpacity>
      </View>

      {saldos.length === 0 ? (
        <Glass padding={16}>
          <Text style={{ fontSize: 13, color: C.sub, fontFamily: F.body, textAlign: 'center' }}>
            Nenhuma conta cadastrada
          </Text>
          <TouchableOpacity onPress={handleAddConta} activeOpacity={0.7}
            style={[styles.ctaBtn, { marginTop: 10, alignSelf: 'center' }]}>
            <Text style={styles.ctaBtnText}>Criar primeira conta</Text>
          </TouchableOpacity>
        </Glass>
      ) : saldos.map(function(s, i) {
        var bc = [C.opcoes, C.acoes, C.fiis, C.etfs, C.rf, C.accent][i % 6];
        var sName = s.corretora || s.name || '';
        var isExp = expanded === s.id;
        var contaMoeda2 = s.moeda || 'BRL';
        var simbolo = getSymbol(contaMoeda2);
        var saldoBRL = convertToBRL(s.saldo || 0, contaMoeda2, rates);

        // Get last 5 movs for this conta
        var contaMovs = [];
        for (var mi = 0; mi < movs.length; mi++) {
          if (movs[mi].conta === sName && contaMovs.length < 5) {
            contaMovs.push(movs[mi]);
          }
        }

        var destOptions = saldos.filter(function(x) { return x.id !== s.id; });

        return (
          <PressableCard key={s.id || i}
            onPress={function() { toggleExpand(s.id); }}
            accessibilityLabel={sName + ', saldo ' + simbolo + ' ' + fmt(s.saldo || 0)}
            accessibilityHint={isExp ? 'Toque para recolher' : 'Toque para expandir'}>
            <Glass padding={12} style={isExp ? { borderColor: bc + '30' } : {}}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[styles.brokerIcon, { backgroundColor: bc + '12', borderColor: bc + '22' }]}>
                    <Text style={[styles.brokerIconText, { color: bc }]}>
                      {(sName || 'CT').substring(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.contaName}>{sName}</Text>
                      {contaMoeda2 !== 'BRL' ? (
                        <Badge text={contaMoeda2} color={C.etfs} />
                      ) : null}
                    </View>
                    {s.tipo ? (
                      <Text style={styles.contaTipo}>{s.tipo === 'corretora' ? 'Corretora' : s.tipo === 'banco' ? 'Banco' : s.tipo}</Text>
                    ) : null}
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.contaSaldo, { color: bc }, ps]}>{simbolo} {fmt(s.saldo || 0)}</Text>
                  {contaMoeda2 !== 'BRL' ? (
                    <Text style={[{ fontSize: 10, color: C.dim, fontFamily: F.mono }, ps]}>
                      {'≈'} R$ {fmt(saldoBRL)}
                    </Text>
                  ) : null}
                </View>
              </View>

              {/* EXPANDED */}
              {isExp ? (
                <View style={styles.expandedWrap}>
                  {/* Last movs */}
                  {contaMovs.length > 0 ? (
                    <View style={{ marginBottom: 10 }}>
                      {contaMovs.map(function(m, mi) {
                        var isEntrada = m.tipo === 'entrada';
                        var movColor = isEntrada ? C.green : m.tipo === 'transferencia' ? C.accent : C.red;
                        var catIcon = CAT_IONICONS[m.categoria] || 'ellipse-outline';
                        var isAutoMini = AUTO_CATEGORIAS.indexOf(m.categoria) >= 0;
                        var isAjuste = m.categoria === 'ajuste_manual';
                        return (
                          <SwipeableRow key={m.id || mi} enabled={!isAutoMini} onDelete={function() { handleDeleteMov(m); }}>
                            <View style={[styles.miniMovRow, { backgroundColor: C.cardSolid }, isAjuste && { opacity: 0.5 }]}>
                              <Ionicons name={catIcon} size={12} color={movColor} style={{ width: 16, textAlign: 'center' }} />
                              <Text style={styles.miniMovDesc} numberOfLines={1}>
                                {m.ticker ? m.ticker + ' · ' : ''}{m.descricao || CAT_LABELS[m.categoria] || m.categoria}
                              </Text>
                              <Text style={[styles.miniMovVal, { color: movColor }, ps]}>
                                {isEntrada ? '+' : '-'}{simbolo} {fmt(m.valor)}
                              </Text>
                            </View>
                          </SwipeableRow>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono, textAlign: 'center', marginBottom: 10 }}>
                      Nenhuma movimentação
                    </Text>
                  )}

                  {/* Action buttons */}
                  {!actMode ? (
                    <View style={{ gap: 6 }}>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity onPress={function() { openMode('depositar'); }} activeOpacity={0.7}
                          style={[styles.saldoBtn, { borderColor: C.green + '30' }]}
                          accessibilityRole="button" accessibilityLabel="Depositar">
                          <Text style={[styles.saldoBtnText, { color: C.green + 'CC' }]}>Depositar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={function() { openMode('deduzir'); }} activeOpacity={0.7}
                          style={[styles.saldoBtn, { borderColor: C.yellow + '30' }]}
                          accessibilityRole="button" accessibilityLabel="Retirar">
                          <Text style={[styles.saldoBtnText, { color: C.yellow + 'CC' }]}>Retirar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={function() { openMode('transferir'); }} activeOpacity={0.7}
                          style={[styles.saldoBtn, { borderColor: C.accent + '30' }]}
                          accessibilityRole="button" accessibilityLabel="Transferir">
                          <Text style={[styles.saldoBtnText, { color: C.accent + 'CC' }]}>Transferir</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity onPress={function() { openMode('editar'); }} activeOpacity={0.7}
                          style={[styles.saldoBtn, { borderColor: C.acoes + '30' }]}
                          accessibilityRole="button" accessibilityLabel="Editar saldo">
                          <Text style={[styles.saldoBtnText, { color: C.acoes + 'CC' }]}>Editar saldo</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={function() { handleExcluir(s); }} activeOpacity={0.7}
                          style={[styles.saldoBtn, { borderColor: C.red + '30' }]}
                          accessibilityRole="button" accessibilityLabel="Excluir conta">
                          <Text style={[styles.saldoBtnText, { color: C.red + 'CC' }]}>Excluir conta</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {actMode === 'transferir' && destOptions.length === 0 ? (
                        <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body, textAlign: 'center' }}>
                          Nenhuma outra conta para transferir
                        </Text>
                      ) : (
                        <View style={{ gap: 8 }}>
                          {actMode === 'editar' ? (
                            <Text style={[{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 }, ps]}>
                              NOVO SALDO (atual: {simbolo} {fmt(s.saldo || 0)})
                            </Text>
                          ) : null}
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ fontSize: 13, color: C.sub, fontFamily: F.mono }}>{simbolo}</Text>
                            <TextInput
                              value={actVal}
                              onChangeText={onChangeVal}
                              placeholder="0,00"
                              placeholderTextColor={C.dim}
                              keyboardType="numeric"
                              autoFocus
                              style={[styles.valInput, { borderColor: modeColor + '40' }]}
                            />
                          </View>
                          {actMode === 'transferir' ? (
                            <View style={{ gap: 6 }}>
                              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 }}>DESTINO</Text>
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                {destOptions.map(function(d) {
                                  var sel = trDest === d.id;
                                  var dMoeda = d.moeda || 'BRL';
                                  return (
                                    <TouchableOpacity key={d.id}
                                      onPress={function() {
                                        var destId = sel ? null : d.id;
                                        setTrDest(destId);
                                        if (!sel && contaMoeda2 !== dMoeda) {
                                          var moedasNecessarias = [contaMoeda2, dMoeda].filter(function(m) { return m !== 'BRL'; });
                                          fetchExchangeRates(moedasNecessarias).then(function(freshRates) {
                                            var rateFrom = freshRates[contaMoeda2] || 1;
                                            var rateTo = freshRates[dMoeda] || 1;
                                            var cambioAuto = rateTo > 0 ? (rateFrom / rateTo) : 1;
                                            setTrCambio(cambioAuto.toFixed(4).replace('.', ','));
                                          });
                                        } else {
                                          setTrCambio('');
                                        }
                                      }}
                                      activeOpacity={0.7}
                                      style={[styles.destPill, sel && { borderColor: C.accent, backgroundColor: C.accent + '18' }]}>
                                      <Text style={[styles.destPillText, sel && { color: C.accent, fontWeight: '700' }]}>
                                        {(d.corretora || d.name || '') + (dMoeda !== contaMoeda2 ? ' (' + dMoeda + ')' : '')}
                                      </Text>
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>
                              {(function() {
                                var destSel = trDest ? saldos.find(function(x) { return x.id === trDest; }) : null;
                                var dMoeda = destSel ? (destSel.moeda || 'BRL') : contaMoeda2;
                                if (contaMoeda2 === dMoeda) return null;
                                var cambioNum = parseFloat((trCambio || '').replace(',', '.')) || 0;
                                var valOrigem = parseVal();
                                var valConv = valOrigem * cambioNum;
                                return (
                                  <View style={{ gap: 6, marginTop: 4, padding: 8, borderRadius: 8, backgroundColor: C.accent + '08', borderWidth: 1, borderColor: C.accent + '20' }}>
                                    <Text style={{ fontSize: 10, color: C.accent, fontFamily: F.mono, letterSpacing: 0.4 }}>
                                      CÂMBIO {contaMoeda2} → {dMoeda}
                                    </Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                      <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.mono }}>1 {contaMoeda2} =</Text>
                                      <TextInput
                                        value={trCambio}
                                        onChangeText={setTrCambio}
                                        placeholder="0,0000"
                                        placeholderTextColor={C.dim}
                                        keyboardType="decimal-pad"
                                        style={[styles.valInput, { flex: 0, width: 100, borderColor: C.accent + '40', fontSize: 13 }]}
                                      />
                                      <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.mono }}>{dMoeda}</Text>
                                    </View>
                                    {valOrigem > 0 && cambioNum > 0 ? (
                                      <Text style={[{ fontSize: 11, color: C.green, fontFamily: F.mono }, ps]}>
                                        {getSymbol(contaMoeda2) + ' ' + fmt(valOrigem) + ' → ' + getSymbol(dMoeda) + ' ' + fmt(valConv)}
                                      </Text>
                                    ) : null}
                                  </View>
                                );
                              })()}
                            </View>
                          ) : null}
                        </View>
                      )}
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity onPress={resetAction} activeOpacity={0.7}
                          style={styles.cancelBtn}>
                          <Text style={styles.cancelBtnText}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={function() {
                            if (actMode === 'depositar') handleDepositar(s);
                            else if (actMode === 'transferir') handleTransferir(s);
                            else if (actMode === 'editar') handleEditar(s);
                            else handleDeduzir(s);
                          }}
                          activeOpacity={0.7}
                          style={[styles.confirmBtn, { backgroundColor: modeColor + '18', borderColor: modeColor + '40' }]}>
                          <Text style={[styles.confirmBtnText, { color: modeColor }]}>Confirmar</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              ) : null}
            </Glass>
          </PressableCard>
        );
      })}

      {/* ══════ 3. GRÁFICO ENTRADAS VS SAÍDAS (6 meses) ══════ */}
      {hist6m.length > 0 ? (
        <View>
          <SectionLabel>ENTRADAS VS SAÍDAS</SectionLabel>
          <Glass padding={14}>
            <BarChart6m data={hist6m} selected={selectedMonth} onSelect={handleSelectMonth} />
          </Glass>

          {/* Drill-down: lista de entradas e saídas do mês selecionado */}
          {selectedMonth != null && hist6m[selectedMonth] && hist6m[selectedMonth].movs && hist6m[selectedMonth].movs.length > 0 ? (function() {
            var selMovs = hist6m[selectedMonth].movs;
            var entradas = [];
            var saidas = [];
            for (var dm = 0; dm < selMovs.length; dm++) {
              if (selMovs[dm].tipo === 'entrada') entradas.push(selMovs[dm]);
              else if (selMovs[dm].tipo === 'saida') saidas.push(selMovs[dm]);
            }
            entradas.sort(function(a, b) { return (b.valor || 0) - (a.valor || 0); });
            saidas.sort(function(a, b) { return (b.valor || 0) - (a.valor || 0); });

            function renderMovList(items, color, sign) {
              if (items.length === 0) return (
                <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.body, fontStyle: 'italic', paddingVertical: 4 }}>Nenhuma</Text>
              );
              return items.map(function(m, mi) {
                var catLabel = CAT_LABELS[m.categoria] || m.categoria;
                var catIcon = CAT_IONICONS[m.categoria] || 'ellipse-outline';
                return (
                  <View key={m.id || mi} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, borderTopWidth: mi > 0 ? 1 : 0, borderTopColor: C.border }}>
                    <Ionicons name={catIcon} size={14} color={color} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, color: C.text, fontFamily: F.body }} numberOfLines={1}>
                        {m.ticker ? m.ticker + ' · ' : ''}{m.descricao || catLabel}
                      </Text>
                      <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>
                        {m.conta || ''}{m.conta ? ' · ' : ''}{new Date(m.data).toLocaleDateString('pt-BR')}
                      </Text>
                    </View>
                    <Text style={[{ fontSize: 12, fontWeight: '700', color: color, fontFamily: F.mono }, ps]}>
                      {sign}R$ {fmt(m.valor)}
                    </Text>
                  </View>
                );
              });
            }

            return (
              <Glass padding={14}>
                <Text style={{ fontSize: 11, color: C.text, fontFamily: F.mono, fontWeight: '700', marginBottom: 8 }}>
                  {hist6m[selectedMonth].label.toUpperCase() + ' — DETALHAMENTO'}
                </Text>

                {entradas.length > 0 ? (
                  <View style={{ marginBottom: saidas.length > 0 ? 12 : 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: C.green }} />
                      <Text style={{ fontSize: 11, color: C.green, fontFamily: F.mono, fontWeight: '700' }}>
                        {'ENTRADAS (' + entradas.length + ')'}
                      </Text>
                    </View>
                    {renderMovList(entradas, C.green, '+')}
                  </View>
                ) : null}

                {saidas.length > 0 ? (
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: C.red }} />
                      <Text style={{ fontSize: 11, color: C.red, fontFamily: F.mono, fontWeight: '700' }}>
                        {'SAÍDAS (' + saidas.length + ')'}
                      </Text>
                    </View>
                    {renderMovList(saidas, C.red, '-')}
                  </View>
                ) : null}
              </Glass>
            );
          })() : null}
        </View>
      ) : null}

      {/* ══════ 4. POR CATEGORIA ══════ */}
      {periodoPorCategoria && Object.keys(periodoPorCategoria).length > 0 ? (
        <View>
          <SectionLabel>POR CATEGORIA ({periodo === 'M' ? 'MÊS ATUAL' : periodo === '3M' ? '3 MESES' : periodo === '6M' ? '6 MESES' : '1 ANO'})</SectionLabel>
          <Glass padding={14}>
            <CategoryBreakdown
              data={periodoPorCategoria}
              total={periodoEntradas + periodoSaidas}
              movs={movs}
              expandedCat={expandedCat}
              onToggleCat={handleToggleCat}
              navigation={navigation}
            />
          </Glass>
        </View>
      ) : null}

      {/* ══════ 5. MOVIMENTAÇÕES RECENTES (Timeline) ══════ */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <SectionLabel>MOVIMENTAÇÕES RECENTES</SectionLabel>
        {movs.length > 0 ? (
          <TouchableOpacity onPress={function() { navigation.navigate('Extrato'); }} activeOpacity={0.7}
            style={styles.addContaBtn}>
            <Text style={styles.addContaBtnText}>Ver extrato →</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {movs.length === 0 ? (
        <Glass padding={16}>
          <Text style={{ fontSize: 13, color: C.sub, fontFamily: F.body, textAlign: 'center' }}>
            Nenhuma movimentação registrada
          </Text>
        </Glass>
      ) : (
        <View style={{ gap: 0 }}>
          {movsGrouped.map(function(group, gi) {
            return (
              <View key={gi}>
                {/* Date header */}
                <View style={styles.timelineDateWrap}>
                  <View style={styles.timelineDateLine} />
                  <Text style={styles.timelineDateText}>{group.label}</Text>
                  <View style={styles.timelineDateLine} />
                </View>

                <Glass padding={0} style={{ marginBottom: 4 }}>
                  {group.items.map(function(m, mi) {
                    var isEntrada = m.tipo === 'entrada';
                    var isTransf = m.tipo === 'transferencia' || m.categoria === 'transferencia';
                    var movColor = CAT_COLORS[m.categoria] || (isEntrada ? C.green : C.red);
                    var catIcon = CAT_IONICONS[m.categoria] || 'ellipse-outline';
                    var isAuto = AUTO_CATEGORIAS.indexOf(m.categoria) >= 0;
                    var isAjuste = m.categoria === 'ajuste_manual';

                    return (
                      <SwipeableRow key={m.id || mi} enabled={!isAuto} onDelete={function() { handleDeleteMov(m); }}>
                        <View style={[styles.movRow, mi > 0 && { borderTopWidth: 1, borderTopColor: C.border }, { backgroundColor: C.cardSolid }, isAjuste && { opacity: 0.45 }]}>
                          <View style={[styles.movIconWrap, { backgroundColor: movColor + '12' }]}>
                            <Ionicons name={catIcon} size={16} color={movColor} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              {m.ticker ? (
                                <Text style={styles.movTicker}>{m.ticker}</Text>
                              ) : null}
                              <Text style={[styles.movDesc, m.ticker && { color: C.sub, fontWeight: '500' }]} numberOfLines={1}>
                                {m.ticker ? (CAT_LABELS[m.categoria] || m.categoria) : (m.descricao || CAT_LABELS[m.categoria] || m.categoria)}
                              </Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Badge text={m.conta} color={C.dim} />
                              {isAuto ? <Badge text="auto" color={C.dim} /> : null}
                              {isAjuste ? <Badge text="ajuste" color={C.yellow} /> : null}
                            </View>
                          </View>
                          <Text style={[styles.movVal, { color: isEntrada ? C.green : C.red }, ps]}>
                            {isEntrada ? '+' : '-'}R$ {fmt(m.valor)}
                          </Text>
                        </View>
                      </SwipeableRow>
                    );
                  })}
                </Glass>
              </View>
            );
          })}
        </View>
      )}

      {/* Reconciliar — discreto no final */}
      {movs.length > 0 ? (
        <TouchableOpacity onPress={handleReconciliar} activeOpacity={0.7} disabled={reconciling}
          style={{ alignSelf: 'center', paddingVertical: 8 }}>
          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, textDecorationLine: 'underline' }}>
            {reconciling ? 'Reconciliando...' : 'Reconciliar vendas antigas'}
          </Text>
        </TouchableOpacity>
      ) : null}

      <View style={{ height: SIZE.tabBarHeight + 20 }} />
    </ScrollView>

    {/* FAB contextual — ações de caixa */}
    <Fab navigation={navigation} items={CAIXA_FAB_ITEMS} />
  </View>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: SIZE.padding, gap: SIZE.gap + 4 },

  // Hero
  heroLabel: { fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 0.6 },
  heroValue: { fontSize: 26, fontWeight: '800', color: C.text, fontFamily: F.display, marginTop: 2, letterSpacing: -0.5 },

  // Period bar
  periodBar: { flexDirection: 'row', gap: 6, marginTop: 12 },

  // Hero summary
  heroSummary: {
    flexDirection: 'row', marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: C.border,
  },
  heroSummaryItem: { flex: 1 },
  heroSummaryLabel: { fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.3 },
  heroSummaryVal: { fontSize: 13, fontWeight: '700', fontFamily: F.mono, marginTop: 2 },

  // Compare badge
  compareBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },

  // Chip conta
  chipConta: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, backgroundColor: C.cardSolid },
  chipName: { fontSize: 10, fontWeight: '600', fontFamily: F.mono },
  chipVal: { fontSize: 11, fontWeight: '700', color: C.text, fontFamily: F.mono, marginTop: 1 },

  // Add conta btn
  addContaBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: C.accent + '30' },
  addContaBtnText: { fontSize: 10, fontWeight: '600', color: C.accent, fontFamily: F.mono },

  // CTA button
  ctaBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: C.accent },
  ctaBtnText: { fontSize: 12, fontWeight: '600', color: C.text, fontFamily: F.body },

  // Broker icon
  brokerIcon: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  brokerIconText: { fontSize: 11, fontWeight: '700', fontFamily: F.mono },

  // Conta
  contaName: { fontSize: 13, fontWeight: '600', color: C.text, fontFamily: F.display },
  contaTipo: { fontSize: 10, color: C.dim, fontFamily: F.mono },
  contaSaldo: { fontSize: 15, fontWeight: '700', fontFamily: F.mono },

  // Expanded
  expandedWrap: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border },

  // Mini mov row
  miniMovRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3, paddingHorizontal: 2 },
  miniMovDesc: { flex: 1, fontSize: 11, color: C.sub, fontFamily: F.body },
  miniMovVal: { fontSize: 11, fontWeight: '600', fontFamily: F.mono },

  // Saldo buttons
  saldoBtn: { flex: 1, paddingVertical: 5, borderRadius: 6, borderWidth: 1, alignItems: 'center' },
  saldoBtnText: { fontSize: 10, fontWeight: '600', fontFamily: F.mono, letterSpacing: 0.4 },

  // Input
  valInput: {
    flex: 1, backgroundColor: C.cardSolid, borderWidth: 1,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 16, color: C.text, fontFamily: F.mono,
  },

  // Dest pill
  destPill: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: C.border },
  destPillText: { fontSize: 11, fontFamily: F.body, fontWeight: '500', color: C.sub },

  // Cancel/Confirm
  cancelBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  cancelBtnText: { fontSize: 13, fontWeight: '600', color: C.sub, fontFamily: F.body },
  confirmBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  confirmBtnText: { fontSize: 13, fontWeight: '600', fontFamily: F.body },

  // Timeline
  timelineDateWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 6, paddingHorizontal: 4 },
  timelineDateLine: { flex: 1, height: 1, backgroundColor: C.border },
  timelineDateText: { fontSize: 10, fontWeight: '700', color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 },

  // Mov list
  movRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14 },
  movIconWrap: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  movTicker: { fontSize: 12, fontWeight: '700', color: C.text, fontFamily: F.mono },
  movDesc: { fontSize: 12, fontWeight: '600', color: C.text, fontFamily: F.body },
  movVal: { fontSize: 13, fontWeight: '700', fontFamily: F.mono },

  // Chart tooltip
  chartTooltip: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12,
    paddingVertical: 6, paddingHorizontal: 10, marginBottom: 6,
    borderRadius: 8, backgroundColor: C.cardSolid, borderWidth: 1, borderColor: C.border,
    alignSelf: 'center',
  },

  // Category row
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 4 },
  catDrill: { paddingLeft: 24, paddingBottom: 6, gap: 4 },
  catDrillRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
});
