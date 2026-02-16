import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getProventos, deleteProvento } from '../../services/database';
import { Glass, Badge, Pill, SectionLabel } from '../../components';
import { LoadingScreen, EmptyState } from '../../components/States';

var TIPO_LABELS = {
  dividendo: 'Dividendo',
  jcp: 'JCP',
  rendimento: 'Rendimento',
  juros_rf: 'Juros RF',
  amortizacao: 'Amortização',
  bonificacao: 'Bonificação',
};

var TIPO_COLORS = {
  dividendo: C.fiis,
  jcp: C.acoes,
  rendimento: C.etfs,
  juros_rf: C.rf,
  amortizacao: C.yellow,
  bonificacao: C.opcoes,
};

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmt4(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

var FILTERS = [
  { key: 'todos', label: 'Todos' },
  { key: 'dividendo', label: 'Dividendos' },
  { key: 'jcp', label: 'JCP' },
  { key: 'rendimento', label: 'Rendimento' },
];

function isoToBr(iso) {
  if (!iso) return '';
  var parts = iso.split('T')[0].split('-');
  if (parts.length !== 3) return iso;
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

export default function ProventosScreen(props) {
  var navigation = props.navigation;
  var user = useAuth().user;
  var _items = useState([]); var items = _items[0]; var setItems = _items[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _refreshing = useState(false); var refreshing = _refreshing[0]; var setRefreshing = _refreshing[1];
  var _filter = useState('todos'); var filter = _filter[0]; var setFilter = _filter[1];

  var load = async function() {
    if (!user) return;
    var result = await getProventos(user.id);
    setItems(result.data || []);
    setLoading(false);
  };

  useFocusEffect(useCallback(function() { load(); }, [user]));

  var onRefresh = async function() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  var handleDelete = function(id) {
    Alert.alert(
      'Excluir provento?',
      'Essa ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async function() {
            var result = await deleteProvento(id);
            if (!result.error) {
              setItems(items.filter(function(i) { return i.id !== id; }));
            } else {
              Alert.alert('Erro', 'Falha ao excluir.');
            }
          },
        },
      ]
    );
  };

  // Filter items
  var filtered = filter === 'todos'
    ? items
    : items.filter(function(i) { return i.tipo_provento === filter; });

  // Group by month
  var months = {};
  var monthOrder = [];
  for (var i = 0; i < filtered.length; i++) {
    var p = filtered[i];
    var dateStr = (p.data_pagamento || '').substring(0, 7); // YYYY-MM
    if (!months[dateStr]) {
      months[dateStr] = { items: [], total: 0 };
      monthOrder.push(dateStr);
    }
    months[dateStr].items.push(p);
    months[dateStr].total += (p.valor_total || 0);
  }

  // Grand total
  var totalGeral = 0;
  for (var j = 0; j < filtered.length; j++) {
    totalGeral += (filtered[j].valor_total || 0);
  }

  // Month label
  var MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  function monthLabel(ym) {
    if (!ym || ym.length < 7) return ym;
    var parts = ym.split('-');
    var mesIdx = parseInt(parts[1]) - 1;
    return MESES[mesIdx] + ' ' + parts[0];
  }

  if (loading) return <View style={{ flex: 1, backgroundColor: C.bg, padding: 18 }}><LoadingScreen /></View>;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={function() { navigation.goBack(); }}>
          <Text style={styles.back}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Proventos</Text>
        <TouchableOpacity onPress={function() { navigation.navigate('AddProvento'); }}>
          <Text style={styles.addIcon}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Total card */}
      <Glass glow={C.fiis} padding={16}>
        <Text style={styles.totalLabel}>TOTAL RECEBIDO</Text>
        <Text style={styles.totalValue}>
          R$ {totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </Text>
        <Text style={styles.totalCount}>
          {filtered.length} provento{filtered.length !== 1 ? 's' : ''}
          {filter !== 'todos' ? ' (' + TIPO_LABELS[filter] + ')' : ''}
        </Text>
      </Glass>

      {/* Filter pills */}
      <View style={styles.pillRow}>
        {FILTERS.map(function(f) {
          return (
            <Pill
              key={f.key}
              active={filter === f.key}
              color={f.key === 'todos' ? C.accent : (TIPO_COLORS[f.key] || C.accent)}
              onPress={function() { setFilter(f.key); }}
            >
              {f.label}
            </Pill>
          );
        })}
      </View>

      {/* Empty state */}
      {filtered.length === 0 && (
        <EmptyState
          icon="◈"
          title="Nenhum provento"
          description="Registre dividendos, JCP e rendimentos recebidos."
          cta="Registrar Provento"
          onCta={function() { navigation.navigate('AddProvento'); }}
          color={C.fiis}
        />
      )}

      {/* Monthly groups */}
      {monthOrder.map(function(ym) {
        var group = months[ym];
        return (
          <View key={ym}>
            <SectionLabel right={'R$ ' + fmt(group.total)}>
              {monthLabel(ym)}
            </SectionLabel>
            <Glass padding={0}>
              {group.items.map(function(p, idx) {
                var tipoLabel = TIPO_LABELS[p.tipo_provento] || p.tipo_provento || 'DIV';
                var tipoColor = TIPO_COLORS[p.tipo_provento] || C.fiis;
                var valorTotal = p.valor_total || 0;

                return (
                  <View
                    key={p.id || idx}
                    style={[styles.provRow, idx > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={styles.provTicker}>{p.ticker}</Text>
                        <Badge text={tipoLabel} color={tipoColor} />
                      </View>
                      <Text style={styles.provDate}>{isoToBr(p.data_pagamento)}</Text>
                      {p.quantidade > 0 && p.valor_por_cota > 0 && (
                        <Text style={styles.provDetail}>
                          {p.quantidade + ' x R$ ' + fmt4(p.valor_por_cota)}
                        </Text>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={styles.provValor}>
                        {'+R$ ' + fmt(valorTotal)}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity onPress={function() {
                          navigation.navigate('EditProvento', { provento: p });
                        }}>
                          <Text style={styles.actionLink}>Editar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={function() { handleDelete(p.id); }}>
                          <Text style={[styles.actionLink, { color: C.red }]}>Excluir</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}
            </Glass>
          </View>
        );
      })}

      {/* Add button */}
      <TouchableOpacity
        activeOpacity={0.8}
        style={styles.addBtn}
        onPress={function() { navigation.navigate('AddProvento'); }}
      >
        <Text style={styles.addBtnText}>+ Novo Provento</Text>
      </TouchableOpacity>

      <View style={{ height: SIZE.tabBarHeight + 20 }} />
    </ScrollView>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 18, gap: SIZE.gap },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 8,
  },
  back: { fontSize: 34, color: C.accent, fontWeight: '300' },
  title: { fontSize: 20, fontWeight: '800', color: C.text, fontFamily: F.display },
  addIcon: { fontSize: 28, color: C.fiis, fontWeight: '300' },

  totalLabel: { fontSize: 13, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8 },
  totalValue: { fontSize: 30, fontWeight: '800', color: C.green, fontFamily: F.display, marginTop: 4 },
  totalCount: { fontSize: 13, color: C.sub, fontFamily: F.body, marginTop: 4 },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  provRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 14 },
  provTicker: { fontSize: 15, fontWeight: '700', color: C.text, fontFamily: F.display },
  provDate: { fontSize: 12, color: C.sub, fontFamily: F.mono, marginTop: 2 },
  provDetail: { fontSize: 11, color: C.dim, fontFamily: F.mono, marginTop: 2 },
  provValor: { fontSize: 15, fontWeight: '700', color: C.green, fontFamily: F.mono },
  actionLink: { fontSize: 12, color: C.accent, fontFamily: F.mono, fontWeight: '600' },

  addBtn: { backgroundColor: C.fiis, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  addBtnText: { fontSize: 17, fontWeight: '700', color: 'white', fontFamily: F.display },
});
