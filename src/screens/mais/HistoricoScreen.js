import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { useAppStore } from '../../contexts/AppStoreContext';
import { getOperacoes, getOpcoes, getProventos, getPortfolios } from '../../services/database';
import { Glass, Badge, Pill, SectionLabel, PeriodFilter } from '../../components';
import { LoadingScreen, EmptyState } from '../../components/States';

var CAT_COLORS = { acao: C.acoes, fii: C.fiis, etf: C.etfs, opcao: C.opcoes, bdr: C.bdr, adr: C.adr, reit: C.reit, stock_int: C.stock_int };


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
  var _dateRange = useState(null); var dateRange = _dateRange[0]; var setDateRange = _dateRange[1];
  var _portfolios = useState([]); var portfolios = _portfolios[0]; var setPortfolios = _portfolios[1];
  // selectedPortfolio unificado via AppStoreContext
  var appStore = useAppStore();
  var selPortfolio = appStore.selectedPortfolio;
  var setSelPortfolio = appStore.setSelectedPortfolio;
  var _showPortDD = useState(false); var showPortDD = _showPortDD[0]; var setShowPortDD = _showPortDD[1];

  var load = async function() {
    if (!user) return;
    setLoadError(false);

    try {
      var pfRes = await getPortfolios(user.id);
      setPortfolios(pfRes.data || []);
    } catch (e) { /* ignore */ }

    var dashPfId = selPortfolio || null;

    try {
      var results = await Promise.all([
        getOperacoes(user.id, { portfolioId: dashPfId }),
        getOpcoes(user.id, dashPfId),
        getProventos(user.id, { portfolioId: dashPfId }),
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

  useEffect(function() {
    if (!user) return;
    if (selPortfolio === undefined) return;
    load();
  }, [user, selPortfolio]);

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

  // Apply date range filter
  var timelineFiltered = timeline;
  if (dateRange) {
    timelineFiltered = timeline.filter(function(t) {
      var d = (t.date || '').substring(0, 10);
      return d >= dateRange.start && d <= dateRange.end;
    });
  }

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

        {/* Portfolio selector */}
        {portfolios.length > 0 ? (
          <View style={{ marginBottom: 0, zIndex: 10 }}>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', alignSelf: 'flex-start' }}
              onPress={function() { setShowPortDD(!showPortDD); }}
              activeOpacity={0.7}
            >
              {(function() {
                var lbl = 'Todos';
                var clr = C.accent;
                var ico = 'people-outline';
                if (selPortfolio === '__null__') { lbl = 'Padrão'; ico = 'briefcase-outline'; }
                else if (selPortfolio) {
                  for (var pi2 = 0; pi2 < portfolios.length; pi2++) {
                    if (portfolios[pi2].id === selPortfolio) {
                      lbl = portfolios[pi2].nome; clr = portfolios[pi2].cor || C.accent; ico = portfolios[pi2].icone || null;
                      break;
                    }
                  }
                }
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {ico ? <Ionicons name={ico} size={14} color={clr} /> : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: clr }} />}
                    <Text style={{ fontSize: 12, fontFamily: F.body, color: C.text }}>{lbl}</Text>
                    <Ionicons name={showPortDD ? 'chevron-up' : 'chevron-down'} size={14} color="rgba(255,255,255,0.3)" />
                  </View>
                );
              })()}
            </TouchableOpacity>
            {showPortDD ? (
              <View style={{ backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', marginTop: 4, overflow: 'hidden' }}>
                <TouchableOpacity
                  style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' }, !selPortfolio && { backgroundColor: C.accent + '11' }]}
                  onPress={function() { setSelPortfolio(null); setShowPortDD(false); }}
                >
                  <Ionicons name="people-outline" size={14} color={!selPortfolio ? C.accent : 'rgba(255,255,255,0.3)'} />
                  <Text style={[{ fontSize: 13, fontFamily: F.body, color: C.text }, !selPortfolio && { color: C.accent }]}>Todos</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' }, selPortfolio === '__null__' && { backgroundColor: C.accent + '11' }]}
                  onPress={function() { setSelPortfolio('__null__'); setShowPortDD(false); }}
                >
                  <Ionicons name="briefcase-outline" size={14} color={selPortfolio === '__null__' ? C.accent : 'rgba(255,255,255,0.3)'} />
                  <Text style={[{ fontSize: 13, fontFamily: F.body, color: C.text }, selPortfolio === '__null__' && { color: C.accent }]}>Padrão</Text>
                </TouchableOpacity>
                {portfolios.map(function(p) {
                  var isAct = selPortfolio === p.id;
                  return (
                    <TouchableOpacity key={p.id}
                      style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' }, isAct && { backgroundColor: C.accent + '11' }]}
                      onPress={function() { setSelPortfolio(p.id); setShowPortDD(false); }}
                    >
                      {p.icone ? (
                        <Ionicons name={p.icone} size={14} color={isAct ? (p.cor || C.accent) : 'rgba(255,255,255,0.3)'} />
                      ) : (
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: p.cor || C.accent }} />
                      )}
                      <Text style={[{ fontSize: 13, fontFamily: F.body, color: C.text }, isAct && { color: p.cor || C.accent }]}>{p.nome}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : null}

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

        <PeriodFilter onRangeChange={function(r) { setDateRange(r); setSubFilter('todos'); }} />

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
      ListHeaderComponent={renderHeader()}
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
