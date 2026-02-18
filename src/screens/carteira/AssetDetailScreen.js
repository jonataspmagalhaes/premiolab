import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl, LayoutAnimation,
  Platform, UIManager, TextInput,
} from 'react-native';

import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getOperacoes, getProventos, deleteOperacao, getIndicatorByTicker } from '../../services/database';
import { fetchPrices, fetchPriceHistory, clearPriceCache, getLastPriceUpdate } from '../../services/priceService';
import { Glass, Badge, Pill, SectionLabel } from '../../components';
import InteractiveChart from '../../components/InteractiveChart';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function maskDate(text) {
  var clean = text.replace(/\D/g, '');
  if (clean.length > 8) clean = clean.substring(0, 8);
  if (clean.length > 4) {
    return clean.substring(0, 2) + '/' + clean.substring(2, 4) + '/' + clean.substring(4);
  }
  if (clean.length > 2) {
    return clean.substring(0, 2) + '/' + clean.substring(2);
  }
  return clean;
}

function brToIso(br) {
  if (!br || br.length !== 10) return null;
  var parts = br.split('/');
  if (parts.length !== 3) return null;
  return parts[2] + '-' + parts[1] + '-' + parts[0];
}

function getDateRange(key) {
  var now = new Date();
  var end = now.toISOString().substring(0, 10);
  var start = null;
  if (key === '7d') {
    var d = new Date(now);
    d.setDate(d.getDate() - 7);
    start = d.toISOString().substring(0, 10);
  } else if (key === '30d') {
    var d2 = new Date(now);
    d2.setDate(d2.getDate() - 30);
    start = d2.toISOString().substring(0, 10);
  } else if (key === '90d') {
    var d3 = new Date(now);
    d3.setDate(d3.getDate() - 90);
    start = d3.toISOString().substring(0, 10);
  } else if (key === '1a') {
    var d4 = new Date(now);
    d4.setFullYear(d4.getFullYear() - 1);
    start = d4.toISOString().substring(0, 10);
  }
  if (!start) return null;
  return { start: start, end: end };
}

function isInDateRange(dateStr, range) {
  if (!range || !dateStr) return true;
  var d = dateStr.substring(0, 10);
  return d >= range.start && d <= range.end;
}

function groupByCorretora(items, corretoraField) {
  var groups = {};
  var order = [];
  for (var i = 0; i < items.length; i++) {
    var key = items[i][corretoraField] || 'Sem corretora';
    if (!groups[key]) {
      groups[key] = [];
      order.push(key);
    }
    groups[key].push(items[i]);
  }
  return { groups: groups, order: order };
}

function calcPmCorretora(txnList) {
  var custoCompras = 0;
  var qtyCompras = 0;
  for (var i = 0; i < txnList.length; i++) {
    if (txnList[i].tipo === 'compra') {
      custoCompras += (txnList[i].quantidade || 0) * (txnList[i].preco || 0);
      qtyCompras += (txnList[i].quantidade || 0);
    }
  }
  return qtyCompras > 0 ? custoCompras / qtyCompras : 0;
}

function calcPorCorretora(allTxns) {
  var result = {};
  for (var i = 0; i < allTxns.length; i++) {
    var corr = allTxns[i].corretora || 'Sem corretora';
    if (!result[corr]) result[corr] = 0;
    if (allTxns[i].tipo === 'compra') {
      result[corr] += (allTxns[i].quantidade || 0);
    } else if (allTxns[i].tipo === 'venda') {
      result[corr] -= (allTxns[i].quantidade || 0);
    }
  }
  return result;
}

var PERIODO_OPTIONS = [
  { key: 'todos', label: 'Todos' },
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: '90d', label: '90 dias' },
  { key: '1a', label: '1 ano' },
  { key: 'custom', label: 'Período' },
];

export default function AssetDetailScreen(props) {
  var navigation = props.navigation;
  var route = props.route;
  var ticker = route.params.ticker;
  var user = useAuth().user;

  var s1 = useState([]); var txns = s1[0]; var setTxns = s1[1];
  var s2 = useState([]); var provs = s2[0]; var setProvs = s2[1];
  var s3 = useState(true); var loading = s3[0]; var setLoading = s3[1];
  var s4 = useState(null); var priceData = s4[0]; var setPriceData = s4[1];
  var s5 = useState([]); var historyData = s5[0]; var setHistoryData = s5[1];
  var s6 = useState(false); var priceLoading = s6[0]; var setPriceLoading = s6[1];
  var s7 = useState(false); var refreshing = s7[0]; var setRefreshing = s7[1];
  var s8 = useState(null); var priceError = s8[0]; var setPriceError = s8[1];
  var s9 = useState(null); var indicator = s9[0]; var setIndicator = s9[1];

  var s10 = useState('todos'); var periodo = s10[0]; var setPeriodo = s10[1];
  var s11 = useState(''); var dataInicio = s11[0]; var setDataInicio = s11[1];
  var s12 = useState(''); var dataFim = s12[0]; var setDataFim = s12[1];
  var s13 = useState({}); var expandedCorretora = s13[0]; var setExpandedCorretora = s13[1];

  useEffect(function() { loadData(); }, []);

  var loadData = async function() {
    if (!user) return;
    var results = await Promise.all([
      getOperacoes(user.id, { ticker: ticker }),
      getProventos(user.id, { ticker: ticker }),
      getIndicatorByTicker(user.id, ticker),
    ]);
    setTxns(results[0].data || []);
    setProvs(results[1].data || []);
    setIndicator(results[2].data || null);
    setLoading(false);

    // Fetch live price + history
    setPriceLoading(true);
    setPriceError(null);
    try {
      var priceResult = await fetchPrices([ticker]);
      if (priceResult[ticker]) {
        setPriceData(priceResult[ticker]);
      }
    } catch (e) {
      setPriceError('Cotações indisponíveis');
    }

    try {
      var histResult = await fetchPriceHistory([ticker]);
      if (histResult[ticker] && histResult[ticker].length > 0) {
        var closes = histResult[ticker];
        var chartData = [];
        var today = new Date();
        for (var i = 0; i < closes.length; i++) {
          var d = new Date(today);
          d.setDate(d.getDate() - (closes.length - 1 - i));
          var dateStr = d.toISOString().substring(0, 10);
          chartData.push({ date: dateStr, value: closes[i] });
        }
        setHistoryData(chartData);
      }
    } catch (e) {
      console.warn('History fetch failed:', e.message);
    }
    setPriceLoading(false);
  };

  var onRefresh = async function() {
    setRefreshing(true);
    clearPriceCache();
    await loadData();
    setRefreshing(false);
  };

  var handleDelete = function(id, idx) {
    Alert.alert(
      'Excluir operação?',
      'Essa ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async function() {
            var result = await deleteOperacao(id);
            if (!result.error) {
              var updated = txns.filter(function(t) { return t.id !== id; });
              setTxns(updated);
            } else {
              Alert.alert('Erro', 'Falha ao excluir.');
            }
          },
        },
      ]
    );
  };

  var toggleCorretora = function(key) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    var next = {};
    var keys = Object.keys(expandedCorretora);
    for (var i = 0; i < keys.length; i++) {
      next[keys[i]] = expandedCorretora[keys[i]];
    }
    next[key] = !next[key];
    setExpandedCorretora(next);
  };

  // Position totals (all txns, not filtered)
  var position = { qty: 0, custo: 0 };
  for (var i = 0; i < txns.length; i++) {
    var t = txns[i];
    if (t.tipo === 'compra') {
      position.custo += t.quantidade * t.preco;
      position.qty += t.quantidade;
    } else if (t.tipo === 'venda') {
      position.qty -= t.quantidade;
    }
  }
  var pm = position.qty > 0 ? position.custo / position.qty : 0;
  var porCorretora = calcPorCorretora(txns);
  var totalProvs = 0;
  var todayStr = new Date().toISOString().substring(0, 10);
  for (var j = 0; j < provs.length; j++) {
    var pDate = (provs[j].data_pagamento || '').substring(0, 10);
    if (pDate <= todayStr) {
      totalProvs += (provs[j].valor_por_cota || 0) * (provs[j].quantidade || 0);
    }
  }

  // Date range for filtering
  var dateRange = null;
  if (periodo === 'custom') {
    var isoStart = brToIso(dataInicio);
    var isoEnd = brToIso(dataFim);
    if (isoStart && isoEnd) {
      dateRange = { start: isoStart, end: isoEnd };
    }
  } else if (periodo !== 'todos') {
    dateRange = getDateRange(periodo);
  }

  // Filtered data
  var filteredTxns = [];
  for (var fi = 0; fi < txns.length; fi++) {
    if (isInDateRange(txns[fi].data, dateRange)) {
      filteredTxns.push(txns[fi]);
    }
  }
  var filteredProvs = [];
  var todayDateStr = new Date().toISOString().substring(0, 10);
  for (var fp = 0; fp < provs.length; fp++) {
    var provDate = (provs[fp].data_pagamento || '').substring(0, 10);
    // So mostrar proventos ja pagos (data_pagamento <= hoje)
    if (provDate > todayDateStr) continue;
    if (isInDateRange(provs[fp].data_pagamento, dateRange)) {
      filteredProvs.push(provs[fp]);
    }
  }

  // Group by corretora
  var txnGroups = groupByCorretora(filteredTxns, 'corretora');

  // Auto-expand if only 1 corretora group
  var autoExpandTxn = txnGroups.order.length === 1;

  // Filtered proventos total
  var filteredProvsTotal = 0;
  for (var fpt = 0; fpt < filteredProvs.length; fpt++) {
    filteredProvsTotal += (filteredProvs[fpt].valor_por_cota || 0) * (filteredProvs[fpt].quantidade || 0);
  }

  // P&L calculations
  var precoAtual = priceData ? priceData.price : null;
  var plTotal = precoAtual != null && pm > 0 ? (precoAtual - pm) * position.qty : null;
  var plPct = precoAtual != null && pm > 0 ? ((precoAtual - pm) / pm) * 100 : null;
  var valorAtual = precoAtual != null ? position.qty * precoAtual : null;
  var yieldOnCost = position.custo > 0 ? (totalProvs / position.custo) * 100 : 0;

  // Format timestamp
  var lastUpdate = getLastPriceUpdate();
  var updateTimeStr = '';
  if (lastUpdate) {
    var ud = new Date(lastUpdate);
    var hh = ud.getHours().toString();
    if (hh.length < 2) hh = '0' + hh;
    var mm = ud.getMinutes().toString();
    if (mm.length < 2) mm = '0' + mm;
    updateTimeStr = 'Atualizado ' + hh + ':' + mm;
  }

  // ── Render helpers ──

  var renderCorretoraHeader = function(corretora, count, pmCorretora, isExpanded) {
    var initials = corretora.substring(0, 2).toUpperCase();
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        style={styles.corretoraHeader}
        onPress={function() { toggleCorretora(corretora); }}
      >
        <View style={styles.corretoraIcon}>
          <Text style={styles.corretoraIconText}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.corretoraName}>{corretora}</Text>
          {pmCorretora > 0 ? (
            <Text style={styles.corretoraPm}>{'PM R$ ' + fmt(pmCorretora)}</Text>
          ) : null}
        </View>
        <Text style={styles.corretoraCount}>{count}</Text>
        <Text style={styles.corretoraChevron}>{isExpanded ? '\u25BE' : '\u25B8'}</Text>
      </TouchableOpacity>
    );
  };

  var renderTxnItem = function(t, idx) {
    var totalTxn = (t.quantidade || 0) * (t.preco || 0);
    return (
      <View
        key={t.id || idx}
        style={[styles.txnRow, idx > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}
      >
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Badge text={t.tipo.toUpperCase()} color={t.tipo === 'compra' ? C.acoes : C.red} />
            <Text style={styles.txnDate}>{new Date(t.data).toLocaleDateString('pt-BR')}</Text>
          </View>
          <Text style={styles.txnDetail}>
            {t.quantidade + ' x R$ ' + fmt(t.preco || 0)}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={[styles.txnTotal, { color: t.tipo === 'compra' ? C.acoes : C.red }]}>
            {'R$ ' + fmt(totalTxn)}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={function() {
              navigation.navigate('EditOperacao', {
                operacao: t,
                ticker: ticker,
              });
            }}>
              <Text style={styles.actionLink}>Editar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={function() { handleDelete(t.id, idx); }}>
              <Text style={[styles.actionLink, { color: C.red }]}>Excluir</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  var renderProvItem = function(p, idx) {
    var valProv = (p.valor_por_cota || 0) * (p.quantidade || 0);
    return (
      <View
        key={p.id || idx}
        style={[styles.txnRow, idx > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}
      >
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Badge text={p.tipo || 'DIV'} color={C.fiis} />
            <Text style={styles.txnDate}>{new Date(p.data_pagamento).toLocaleDateString('pt-BR')}</Text>
          </View>
        </View>
        <Text style={[styles.txnTotal, { color: C.green }]}>{'+R$ ' + fmt(valProv)}</Text>
      </View>
    );
  };

  var renderProvsForCorretora = function(corretoraName, qtyCorretora) {
    if (filteredProvs.length === 0 || qtyCorretora <= 0) return null;
    var items = [];
    for (var i = 0; i < filteredProvs.length; i++) {
      var p = filteredProvs[i];
      var valProv = (p.valor_por_cota || 0) * qtyCorretora;
      items.push(
        <View
          key={'prov_' + (p.id || i)}
          style={[styles.txnRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}
        >
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Badge text={(p.tipo || 'DIV').toUpperCase()} color={C.fiis} />
              <Text style={styles.txnDate}>{new Date(p.data_pagamento).toLocaleDateString('pt-BR')}</Text>
            </View>
            <Text style={styles.txnDetail}>
              {qtyCorretora + ' x R$ ' + fmt(p.valor_por_cota || 0)}
            </Text>
          </View>
          <Text style={[styles.txnTotal, { color: C.green }]}>{'+R$ ' + fmt(valProv)}</Text>
        </View>
      );
    }
    return (
      <View>
        <View style={styles.provDivider}>
          <View style={styles.provDividerLine} />
          <Text style={styles.provDividerText}>{'PROVENTOS (' + qtyCorretora + ' cotas)'}</Text>
          <View style={styles.provDividerLine} />
        </View>
        {items}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator color={C.accent} size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />
      }
    >
        <View style={styles.header}>
          <TouchableOpacity onPress={function() { navigation.goBack(); }} style={styles.backBtn}>
            <Text style={styles.backText}>{'<'}</Text>
          </TouchableOpacity>
          <Text style={styles.ticker}>{ticker}</Text>
          <View style={{ width: 32 }} />
        </View>

        {/* ══════ PRICE HERO CARD ══════ */}
        <Glass glow={C.accent} padding={16}>
          {priceLoading && !priceData ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
              <ActivityIndicator size="small" color={C.accent} />
              <Text style={{ fontSize: 12, color: C.dim, fontFamily: F.mono }}>Buscando cotacao...</Text>
            </View>
          ) : priceError && !priceData ? (
            <View style={{ padding: 8, borderRadius: 8, backgroundColor: C.red + '10' }}>
              <Text style={{ fontSize: 11, color: C.red, fontFamily: F.mono, textAlign: 'center' }}>
                {priceError}
              </Text>
            </View>
          ) : priceData ? (
            <View>
              {/* Cotacao + variacao dia */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                  <Text style={styles.priceHeroValue}>R$ {fmt(priceData.price)}</Text>
                  <Badge
                    text={(priceData.changePercent >= 0 ? '+' : '') + priceData.changePercent.toFixed(2) + '%'}
                    color={priceData.changePercent >= 0 ? C.green : C.red}
                  />
                </View>
              </View>

              {/* P&L row */}
              {plTotal != null ? (
                <View style={styles.plRow}>
                  <View style={styles.plItem}>
                    <Text style={styles.plLabel}>P&L TOTAL</Text>
                    <Text style={[styles.plValue, { color: plTotal >= 0 ? C.green : C.red }]}>
                      {plTotal >= 0 ? '+' : '-'}R$ {fmt(Math.abs(plTotal))}
                    </Text>
                  </View>
                  <View style={styles.plItem}>
                    <Text style={styles.plLabel}>P&L %</Text>
                    <Text style={[styles.plValue, { color: plPct >= 0 ? C.green : C.red }]}>
                      {plPct >= 0 ? '+' : ''}{plPct.toFixed(2)}%
                    </Text>
                  </View>
                  <View style={styles.plItem}>
                    <Text style={styles.plLabel}>VALOR ATUAL</Text>
                    <Text style={[styles.plValue, { color: C.text }]}>
                      R$ {fmt(valorAtual)}
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Timestamp */}
              {updateTimeStr ? (
                <Text style={styles.updateTime}>{updateTimeStr}</Text>
              ) : null}
            </View>
          ) : (
            <View style={{ padding: 8 }}>
              <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono, textAlign: 'center' }}>
                Cotacao nao disponivel
              </Text>
            </View>
          )}
        </Glass>

        {/* ══════ CHART 30 DIAS ══════ */}
        {historyData.length >= 2 ? (
          <Glass padding={14}>
            <SectionLabel>HISTÓRICO 30 DIAS</SectionLabel>
            <View style={{ marginTop: 4 }}>
              <InteractiveChart
                data={historyData}
                color={C.accent}
                height={120}
                fontFamily={F.mono}
                label={ticker + ' - 30 dias'}
              />
            </View>
          </Glass>
        ) : null}

        {/* ══════ INDICADORES TECNICOS ══════ */}
        {indicator ? (
          <Glass padding={14}>
            <SectionLabel>INDICADORES TECNICOS</SectionLabel>
            <View style={styles.indGrid}>
              {[
                { l: 'HV 20d', v: indicator.hv_20 != null ? indicator.hv_20.toFixed(1) + '%' : '\u2013', c: C.opcoes },
                { l: 'RSI 14', v: indicator.rsi_14 != null ? indicator.rsi_14.toFixed(1) : '\u2013',
                  c: indicator.rsi_14 != null ? (indicator.rsi_14 > 70 ? C.red : indicator.rsi_14 < 30 ? C.green : C.text) : C.text },
                { l: 'SMA 20', v: indicator.sma_20 != null ? 'R$ ' + fmt(indicator.sma_20) : '\u2013', c: C.acoes },
                { l: 'EMA 9', v: indicator.ema_9 != null ? 'R$ ' + fmt(indicator.ema_9) : '\u2013', c: C.acoes },
                { l: 'Beta', v: indicator.beta != null ? indicator.beta.toFixed(2) : '\u2013',
                  c: indicator.beta != null ? (indicator.beta > 1.2 ? C.red : indicator.beta < 0.8 ? C.green : C.text) : C.text },
                { l: 'ATR 14', v: indicator.atr_14 != null ? 'R$ ' + fmt(indicator.atr_14) : '\u2013', c: C.text },
                { l: 'Max DD', v: indicator.max_drawdown != null ? indicator.max_drawdown.toFixed(1) + '%' : '\u2013', c: C.red },
                { l: 'BB Width', v: indicator.bb_width != null ? indicator.bb_width.toFixed(1) + '%' : '\u2013', c: C.opcoes },
              ].map(function(d, idx) {
                return (
                  <View key={idx} style={styles.indItem}>
                    <Text style={styles.indLabel}>{d.l}</Text>
                    <Text style={[styles.indValue, { color: d.c }]}>{d.v}</Text>
                  </View>
                );
              })}
            </View>
            {indicator.data_calculo ? (
              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, textAlign: 'right', marginTop: 6 }}>
                {'Calculado em ' + new Date(indicator.data_calculo).toLocaleDateString('pt-BR')}
              </Text>
            ) : null}
          </Glass>
        ) : null}

        {/* ══════ POSICAO ══════ */}
        <Glass glow={C.acoes} padding={14}>
          <SectionLabel>POSIÇÃO</SectionLabel>
          <View style={styles.posGrid}>
            {[
              { l: 'Quantidade', v: String(position.qty) },
              { l: 'Preço Médio', v: 'R$ ' + fmt(pm) },
              { l: 'Custo Total', v: 'R$ ' + fmt(position.custo) },
              { l: 'Proventos', v: 'R$ ' + fmt(totalProvs) },
              valorAtual != null ? { l: 'Valor Atual', v: 'R$ ' + fmt(valorAtual) } : null,
              yieldOnCost > 0 ? { l: 'Yield on Cost', v: yieldOnCost.toFixed(2) + '%' } : null,
            ].filter(Boolean).map(function(d, idx) {
              return (
                <View key={idx} style={styles.posItem}>
                  <Text style={styles.posItemLabel}>{d.l}</Text>
                  <Text style={styles.posItemValue}>{d.v}</Text>
                </View>
              );
            })}
          </View>
        </Glass>

        {/* ══════ FILTRO DE PERIODO ══════ */}
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {PERIODO_OPTIONS.map(function(opt) {
                return (
                  <Pill
                    key={opt.key}
                    active={periodo === opt.key}
                    onPress={function() {
                      setPeriodo(opt.key);
                      setExpandedCorretora({});
                    }}
                  >
                    {opt.label}
                  </Pill>
                );
              })}
            </View>
          </ScrollView>
          {periodo === 'custom' ? (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 4 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.filterLabel}>DE</Text>
                <TextInput
                  style={styles.filterInput}
                  value={dataInicio}
                  onChangeText={function(txt) { setDataInicio(maskDate(txt)); }}
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor={C.dim}
                  keyboardType="numeric"
                  maxLength={10}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.filterLabel}>ATE</Text>
                <TextInput
                  style={styles.filterInput}
                  value={dataFim}
                  onChangeText={function(txt) { setDataFim(maskDate(txt)); }}
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor={C.dim}
                  keyboardType="numeric"
                  maxLength={10}
                />
              </View>
            </View>
          ) : null}
        </View>

        {/* ══════ TRANSACOES AGRUPADAS POR CORRETORA ══════ */}
        <SectionLabel>{filteredTxns.length + ' TRANSAÇÕES'}</SectionLabel>
        <Glass padding={0}>
          {filteredTxns.length === 0 ? (
            <Text style={styles.emptyText}>Nenhuma transacao</Text>
          ) : txnGroups.order.length === 1 ? (
            <View>
              {renderCorretoraHeader(
                txnGroups.order[0],
                txnGroups.groups[txnGroups.order[0]].length,
                calcPmCorretora(txnGroups.groups[txnGroups.order[0]]),
                true
              )}
              {txnGroups.groups[txnGroups.order[0]].map(function(txn, idx) {
                return renderTxnItem(txn, idx);
              })}
              {renderProvsForCorretora(txnGroups.order[0], porCorretora[txnGroups.order[0]] || 0)}
            </View>
          ) : (
            txnGroups.order.map(function(corretora) {
              var items = txnGroups.groups[corretora];
              var isOpen = autoExpandTxn || expandedCorretora[corretora];
              var pmCor = calcPmCorretora(items);
              return (
                <View key={corretora}>
                  {renderCorretoraHeader(corretora, items.length, pmCor, isOpen)}
                  {isOpen ? (
                    <View>
                      {items.map(function(txn, idx) {
                        return renderTxnItem(txn, idx);
                      })}
                      {renderProvsForCorretora(corretora, porCorretora[corretora] || 0)}
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </Glass>

        {/* ══════ TOTAL PROVENTOS (resumo) ══════ */}
        {filteredProvs.length > 0 ? (
          <View style={styles.provSummary}>
            <Text style={styles.provSummaryText}>
              {filteredProvs.length + ' proventos no periodo - Total R$ ' + fmt(filteredProvsTotal)}
            </Text>
          </View>
        ) : null}

        <TouchableOpacity
          activeOpacity={0.8}
          style={styles.buyBtn}
          onPress={function() { navigation.navigate('AddOperacao'); }}
        >
          <Text style={styles.buyBtnText}>Comprar / Vender</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: SIZE.gap },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  backBtn: { width: 32, height: 32, justifyContent: 'center' },
  backText: { fontSize: 28, color: C.accent, fontWeight: '300' },
  ticker: { fontSize: 20, fontWeight: '800', color: C.text, fontFamily: F.display },

  // Price hero
  priceHeroValue: { fontSize: 28, fontWeight: '800', color: C.text, fontFamily: F.display, letterSpacing: -0.5 },
  plRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border },
  plItem: { alignItems: 'center', flex: 1 },
  plLabel: { fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 },
  plValue: { fontSize: 13, fontWeight: '700', fontFamily: F.mono, marginTop: 2 },
  updateTime: { fontSize: 11, color: C.dim, fontFamily: F.mono, marginTop: 8, textAlign: 'right' },

  // Position
  posGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  posItem: { width: '48%', backgroundColor: C.surface, borderRadius: SIZE.radiusSm, padding: 10, borderWidth: 1, borderColor: C.border },
  posItemLabel: { fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 },
  posItemValue: { fontSize: 14, fontWeight: '700', color: C.text, fontFamily: F.display, marginTop: 2 },

  // Filter
  filterLabel: { fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5, marginBottom: 4 },
  filterInput: {
    backgroundColor: C.surface, borderRadius: SIZE.radiusSm, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: C.text, fontFamily: F.mono,
  },

  // Corretora group header
  corretoraHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  corretoraIcon: {
    width: 32, height: 32, borderRadius: 8, backgroundColor: C.accent + '20',
    justifyContent: 'center', alignItems: 'center',
  },
  corretoraIconText: { fontSize: 11, fontWeight: '800', color: C.accent, fontFamily: F.display },
  corretoraName: { fontSize: 13, fontWeight: '700', color: C.text, fontFamily: F.display },
  corretoraPm: { fontSize: 10, color: C.dim, fontFamily: F.mono, marginTop: 1 },
  corretoraCount: { fontSize: 11, color: C.sub, fontFamily: F.mono, marginRight: 4 },
  corretoraChevron: { fontSize: 14, color: C.dim },

  // Transactions
  txnRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  txnDate: { fontSize: 11, color: C.sub, fontFamily: F.mono },
  txnDetail: { fontSize: 11, color: C.dim, fontFamily: F.mono, marginTop: 2 },
  txnTotal: { fontSize: 12, fontWeight: '700', fontFamily: F.mono },
  emptyText: { padding: 20, fontSize: 11, color: C.dim, fontFamily: F.body, textAlign: 'center' },
  actionLink: { fontSize: 12, color: C.accent, fontFamily: F.mono, fontWeight: '600' },
  buyBtn: { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  buyBtnText: { fontSize: 14, fontWeight: '700', color: 'white', fontFamily: F.display },
  provDivider: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  provDividerLine: { flex: 1, height: 1, backgroundColor: C.fiis + '30' },
  provDividerText: { fontSize: 10, fontWeight: '700', color: C.fiis, fontFamily: F.mono, letterSpacing: 0.5 },
  provSummary: { paddingVertical: 6, paddingHorizontal: 4 },
  provSummaryText: { fontSize: 11, color: C.fiis, fontFamily: F.mono, textAlign: 'center' },

  // Indicators grid
  indGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  indItem: { width: '48%', backgroundColor: C.surface, borderRadius: SIZE.radiusSm, padding: 10, borderWidth: 1, borderColor: C.border },
  indLabel: { fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 },
  indValue: { fontSize: 14, fontWeight: '700', fontFamily: F.display, marginTop: 2 },
});
