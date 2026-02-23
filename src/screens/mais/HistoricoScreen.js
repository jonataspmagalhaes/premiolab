import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getOperacoes, getOpcoes, getProventos } from '../../services/database';
import { Glass, Badge, Pill, SectionLabel } from '../../components';
import { LoadingScreen, EmptyState } from '../../components/States';

var CAT_COLORS = { acao: C.acoes, fii: C.fiis, etf: C.etfs, opcao: C.opcoes };

var PERIODOS = [
  { k: '1m', l: '1M', days: 30 },
  { k: '3m', l: '3M', days: 90 },
  { k: '6m', l: '6M', days: 180 },
  { k: '1a', l: '1A', days: 365 },
  { k: 'tudo', l: 'Tudo', days: 0 },
];

function filterByPeriod(items, dateField, days) {
  if (!days) return items;
  var now = new Date();
  var cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  var cutoffStr = cutoff.toISOString().substring(0, 10);
  return items.filter(function(item) {
    return (item[dateField] || '') >= cutoffStr;
  });
}

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function HistoricoScreen(props) {
  var navigation = props.navigation;
  var _auth = useAuth(); var user = _auth.user;

  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _refreshing = useState(false); var refreshing = _refreshing[0]; var setRefreshing = _refreshing[1];
  var _filter = useState('todos'); var filter = _filter[0]; var setFilter = _filter[1];
  var _operacoes = useState([]); var operacoes = _operacoes[0]; var setOperacoes = _operacoes[1];
  var _opcoes = useState([]); var opcoes = _opcoes[0]; var setOpcoes = _opcoes[1];
  var _proventos = useState([]); var proventos = _proventos[0]; var setProventos = _proventos[1];
  var _loadError = useState(false); var loadError = _loadError[0]; var setLoadError = _loadError[1];
  var _subFilter = useState('todos'); var subFilter = _subFilter[0]; var setSubFilter = _subFilter[1];
  var _periodo = useState('tudo'); var periodo = _periodo[0]; var setPeriodo = _periodo[1];

  var load = async function() {
    if (!user) return;
    setLoadError(false);
    try {
      var results = await Promise.all([
        getOperacoes(user.id),
        getOpcoes(user.id),
        getProventos(user.id),
      ]);
      setOperacoes(results[0].data || []);
      setOpcoes(results[1].data || []);
      setProventos(results[2].data || []);
    } catch (e) {
      console.warn('HistoricoScreen load error:', e);
      setLoadError(true);
    }
    setLoading(false);
  };

  var onRefresh = async function() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  useEffect(function() { load(); }, []);

  // Build unified timeline
  var timeline = [];

  operacoes.forEach(function(op) {
    timeline.push({
      date: op.data || '',
      type: op.tipo === 'compra' ? 'COMPRA' : 'VENDA',
      ticker: op.ticker,
      detail: op.quantidade + ' x R$ ' + fmt(op.preco),
      value: op.quantidade * op.preco,
      color: op.tipo === 'compra' ? C.acoes : C.red,
      catColor: CAT_COLORS[op.categoria] || C.acoes,
      cat: 'operacao',
      filterKey: op.tipo || 'compra',
    });
  });

  opcoes.forEach(function(op) {
    timeline.push({
      date: op.data_abertura || (op.created_at ? op.created_at.substring(0, 10) : ''),
      type: (op.tipo || 'CALL').toUpperCase(),
      ticker: op.ticker_opcao || op.ticker || '',
      detail: 'Strike R$ ' + fmt(op.strike) + ' · ' + (op.quantidade || 0) + ' lotes',
      value: (op.premio || 0) * (op.quantidade || 0) * 100,
      color: C.opcoes,
      catColor: C.opcoes,
      cat: 'opcao',
      filterKey: (op.tipo || 'call').toLowerCase(),
    });
  });

  proventos.forEach(function(p) {
    timeline.push({
      date: p.data_pagamento || '',
      type: (p.tipo_provento || 'DIV').toUpperCase(),
      ticker: p.ticker,
      detail: 'R$ ' + fmt(p.valor_total || 0),
      value: p.valor_total || 0,
      color: C.fiis,
      catColor: C.fiis,
      cat: 'provento',
      filterKey: (p.tipo_provento || 'dividendo').toLowerCase(),
    });
  });

  // Sort by date descending
  timeline.sort(function(a, b) { return b.date.localeCompare(a.date); });

  // Apply period filter
  var periodoObj = PERIODOS.filter(function(p) { return p.k === periodo; })[0];
  var periodoDays = periodoObj ? periodoObj.days : 0;
  var timelineFiltered = filterByPeriod(timeline, 'date', periodoDays);

  // Apply filter + sub-filter
  var filtered = timelineFiltered;
  if (filter === 'todos') {
    if (subFilter !== 'todos') {
      filtered = timelineFiltered.filter(function(t) { return t.filterKey === subFilter; });
    }
  } else if (filter === 'operacoes') {
    filtered = timelineFiltered.filter(function(t) { return t.cat === 'operacao'; });
    if (subFilter !== 'todos') {
      filtered = filtered.filter(function(t) { return t.filterKey === subFilter; });
    }
  } else if (filter === 'opcoes') {
    filtered = timelineFiltered.filter(function(t) { return t.cat === 'opcao'; });
    if (subFilter !== 'todos') {
      filtered = filtered.filter(function(t) { return t.filterKey === subFilter; });
    }
  } else if (filter === 'proventos') {
    filtered = timelineFiltered.filter(function(t) { return t.cat === 'provento'; });
    if (subFilter !== 'todos') {
      filtered = filtered.filter(function(t) { return t.filterKey === subFilter; });
    }
  }

  // Sub-filter pills per main filter
  var SUB_TODOS = [
    { k: 'todos', l: 'Todos' },
    { k: 'compra', l: 'Compras', c: C.acoes },
    { k: 'venda', l: 'Vendas', c: C.red },
    { k: 'call', l: 'CALL', c: C.green },
    { k: 'put', l: 'PUT', c: C.red },
    { k: 'dividendo', l: 'Dividendos', c: C.fiis },
    { k: 'jcp', l: 'JCP', c: C.acoes },
    { k: 'rendimento', l: 'Rendimento', c: C.rf },
  ];
  var SUB_OPERACOES = [
    { k: 'todos', l: 'Todas' },
    { k: 'compra', l: 'Compras', c: C.acoes },
    { k: 'venda', l: 'Vendas', c: C.red },
  ];
  var SUB_OPCOES = [
    { k: 'todos', l: 'Todas' },
    { k: 'call', l: 'CALL', c: C.green },
    { k: 'put', l: 'PUT', c: C.red },
  ];
  var SUB_PROVENTOS = [
    { k: 'todos', l: 'Todos' },
    { k: 'dividendo', l: 'Dividendos', c: C.fiis },
    { k: 'jcp', l: 'JCP', c: C.acoes },
    { k: 'rendimento', l: 'Rendimento', c: C.rf },
    { k: 'juros_rf', l: 'Juros RF', c: C.etfs },
    { k: 'amortizacao', l: 'Amortização', c: C.dim },
  ];

  var subFilterPills = [];
  if (filter === 'todos') subFilterPills = SUB_TODOS;
  else if (filter === 'operacoes') subFilterPills = SUB_OPERACOES;
  else if (filter === 'opcoes') subFilterPills = SUB_OPCOES;
  else if (filter === 'proventos') subFilterPills = SUB_PROVENTOS;

  // Group by month
  var grouped = {};
  filtered.forEach(function(item) {
    var key = item.date.substring(0, 7) || 'sem-data';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  });

  var MONTH_LABELS = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  var sortedMonthKeys = Object.keys(grouped).sort(function(a, b) { return b.localeCompare(a); });

  if (loading) return <LoadingScreen />;

  if (loadError) return (
    <View style={styles.container}>
      <EmptyState
        ionicon="alert-circle-outline"
        title="Erro ao carregar"
        description="Não foi possível carregar o histórico. Verifique sua conexão e tente novamente."
        cta="Tentar novamente"
        onCta={function() { setLoading(true); load(); }}
        color={C.red}
      />
    </View>
  );

  var renderHeader = function() {
    return (
      <View style={{ gap: SIZE.gap }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={function() { navigation.goBack(); }}>
            <Text style={styles.back}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Histórico</Text>
          <View style={{ width: 32 }} />
        </View>

        <Glass glow={C.accent} padding={14}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
            {[
              { l: 'OPERAÇÕES', v: String(operacoes.length), c: C.acoes },
              { l: 'OPÇÕES', v: String(opcoes.length), c: C.opcoes },
              { l: 'PROVENTOS', v: String(proventos.length), c: C.fiis },
            ].map(function(d, i) {
              return (
                <View key={i} style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 }}>{d.l}</Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: d.c, fontFamily: F.display, marginTop: 2 }}>{d.v}</Text>
                </View>
              );
            })}
          </View>
        </Glass>

        <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap' }}>
          {PERIODOS.map(function(p) {
            return (
              <Pill key={p.k} active={periodo === p.k} color={C.accent}
                onPress={function() { setPeriodo(p.k); setSubFilter('todos'); }}>
                {p.l}
              </Pill>
            );
          })}
        </View>

        <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap' }}>
          {[
            { k: 'todos', l: 'Todos (' + timelineFiltered.length + ')' },
            { k: 'operacoes', l: 'Operações' },
            { k: 'opcoes', l: 'Opções' },
            { k: 'proventos', l: 'Proventos' },
          ].map(function(f) {
            return (
              <Pill key={f.k} active={filter === f.k} color={C.accent}
                onPress={function() { setFilter(f.k); setSubFilter('todos'); }}>
                {f.l}
              </Pill>
            );
          })}
        </View>

        {subFilterPills.length > 0 ? (
          <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap' }}>
            {subFilterPills.map(function(f) {
              return (
                <Pill key={f.k} active={subFilter === f.k} color={f.c || C.sub}
                  onPress={function() { setSubFilter(f.k); }}>
                  {f.l}
                </Pill>
              );
            })}
          </View>
        ) : null}

        {filtered.length === 0 ? (
          <EmptyState
            ionicon="time-outline"
            title="Sem registros"
            description="Adicione operações, opções ou proventos para ver o histórico"
            color={C.accent}
          />
        ) : null}
      </View>
    );
  };

  var renderMonthGroup = function(info) {
    var monthKey = info.item;
    var items = grouped[monthKey];
    var parts = monthKey.split('-');
    var label = parts.length === 2
      ? MONTH_LABELS[parseInt(parts[1])] + '/' + parts[0]
      : monthKey;
    return (
      <Glass padding={0}>
        <View style={styles.monthHeader}>
          <Text style={styles.monthLabel}>{label}</Text>
          <Badge text={items.length + ' reg.'} color={C.dim} />
        </View>
        {items.map(function(item, i) {
          return (
            <View key={i} style={[styles.itemRow, { borderTopWidth: 1, borderTopColor: C.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <View style={{ width: 3, height: 24, borderRadius: 2, backgroundColor: item.catColor }} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.itemTicker}>{item.ticker}</Text>
                    <Badge text={item.type} color={item.color} />
                  </View>
                  <Text style={styles.itemDetail}>{item.detail}</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.itemValue, { color: item.color }]}>
                  R$ {fmt(item.value)}
                </Text>
                <Text style={styles.itemDate}>{item.date.substring(8, 10) || ''}</Text>
              </View>
            </View>
          );
        })}
      </Glass>
    );
  };

  var monthKeyExtractor = function(item) { return item; };

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      data={sortedMonthKeys}
      keyExtractor={monthKeyExtractor}
      renderItem={renderMonthGroup}
      ListHeaderComponent={renderHeader}
      ListFooterComponent={<View style={{ height: 40 }} />}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
          tintColor={C.accent} colors={[C.accent]} />
      }
    />
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: SIZE.gap },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  back: { fontSize: 28, color: C.accent, fontWeight: '300' },
  title: { fontSize: 18, fontWeight: '800', color: C.text, fontFamily: F.display },
  monthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  monthLabel: { fontSize: 12, fontWeight: '700', color: C.text, fontFamily: F.display },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12 },
  itemTicker: { fontSize: 11, fontWeight: '700', color: C.text, fontFamily: F.display },
  itemDetail: { fontSize: 11, color: C.sub, fontFamily: F.mono, marginTop: 2 },
  itemValue: { fontSize: 11, fontWeight: '700', fontFamily: F.mono },
  itemDate: { fontSize: 10, color: C.dim, fontFamily: F.mono, marginTop: 2 },
});
