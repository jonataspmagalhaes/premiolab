import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getOperacoes, getOpcoes, getProventos } from '../../services/database';
import { Glass, Badge, Pill, SectionLabel } from '../../components';
import { LoadingScreen, EmptyState } from '../../components/States';

var CAT_COLORS = { acao: C.acoes, fii: C.fiis, etf: C.etfs, opcao: C.opcoes };

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

  var load = async function() {
    if (!user) return;
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
    });
  });

  opcoes.forEach(function(op) {
    timeline.push({
      date: op.created_at ? op.created_at.substring(0, 10) : '',
      type: (op.tipo || 'CALL').toUpperCase(),
      ticker: op.ticker_opcao || op.ticker || '',
      detail: 'Strike R$ ' + fmt(op.strike) + ' · ' + (op.quantidade || 0) + ' lotes',
      value: (op.premio || 0) * (op.quantidade || 0) * 100,
      color: C.opcoes,
      catColor: C.opcoes,
      cat: 'opcao',
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
    });
  });

  // Sort by date descending
  timeline.sort(function(a, b) { return b.date.localeCompare(a.date); });

  // Apply filter
  var filtered = timeline;
  if (filter === 'operacoes') {
    filtered = timeline.filter(function(t) { return t.cat === 'operacao'; });
  } else if (filter === 'opcoes') {
    filtered = timeline.filter(function(t) { return t.cat === 'opcao'; });
  } else if (filter === 'proventos') {
    filtered = timeline.filter(function(t) { return t.cat === 'provento'; });
  }

  // Group by month
  var grouped = {};
  filtered.forEach(function(item) {
    var key = item.date.substring(0, 7) || 'sem-data';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  });

  var MONTH_LABELS = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  if (loading) return <LoadingScreen />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
          tintColor={C.accent} colors={[C.accent]} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={function() { navigation.goBack(); }}>
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Historico</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Stats */}
      <Glass glow={C.accent} padding={14}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          {[
            { l: 'OPERAÇÕES', v: String(operacoes.length), c: C.acoes },
            { l: 'OPÇÕES', v: String(opcoes.length), c: C.opcoes },
            { l: 'PROVENTOS', v: String(proventos.length), c: C.fiis },
          ].map(function(d, i) {
            return (
              <View key={i} style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 }}>{d.l}</Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: d.c, fontFamily: F.display, marginTop: 2 }}>{d.v}</Text>
              </View>
            );
          })}
        </View>
      </Glass>

      {/* Filters */}
      <View style={{ flexDirection: 'row', gap: 5 }}>
        {[
          { k: 'todos', l: 'Todos (' + timeline.length + ')' },
          { k: 'operacoes', l: 'Operações' },
          { k: 'opcoes', l: 'Opções' },
          { k: 'proventos', l: 'Proventos' },
        ].map(function(f) {
          return (
            <Pill key={f.k} active={filter === f.k} color={C.accent}
              onPress={function() { setFilter(f.k); }}>
              {f.l}
            </Pill>
          );
        })}
      </View>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="\u2630"
          title="Sem registros"
          description="Adicione operações, opções ou proventos para ver o histórico"
          color={C.accent}
        />
      ) : (
        Object.keys(grouped)
          .sort(function(a, b) { return b.localeCompare(a); })
          .map(function(monthKey) {
            var items = grouped[monthKey];
            var parts = monthKey.split('-');
            var label = parts.length === 2
              ? MONTH_LABELS[parseInt(parts[1])] + '/' + parts[0]
              : monthKey;
            return (
              <Glass key={monthKey} padding={0}>
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
          })
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
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
