import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, Alert, Switch, ActivityIndicator,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { animateLayout } from '../../utils/a11y';
import { C, F, SIZE } from '../../theme';
import { Glass, Badge, SectionLabel, SwipeableRow } from '../../components';
import { EmptyState } from '../../components/States';
import { useAuth } from '../../contexts/AuthContext';
import { getRecorrentes, deleteRecorrente, updateRecorrente } from '../../services/database';
var finCats = require('../../constants/financeCategories');

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

var FREQ_LABELS = {
  semanal: 'Semanal',
  quinzenal: 'Quinzenal',
  mensal: 'Mensal',
  anual: 'Anual',
};

var FREQ_ORDER = ['semanal', 'quinzenal', 'mensal', 'anual'];

function diasAte(dataStr) {
  if (!dataStr) return 999;
  var hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  var parts = dataStr.split('-');
  var target = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  var diff = Math.round((target - hoje) / 86400000);
  return diff;
}

function formatDateBr(dataStr) {
  if (!dataStr) return '—';
  var parts = dataStr.substring(0, 10).split('-');
  if (parts.length !== 3) return dataStr;
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

function getDiaBadge(dias) {
  if (dias < 0) return { text: 'ATRASADO', color: C.red };
  if (dias === 0) return { text: 'HOJE', color: C.red };
  if (dias <= 3) return { text: 'em ' + dias + 'd', color: C.red };
  if (dias <= 7) return { text: 'em ' + dias + 'd', color: C.yellow };
  return { text: 'em ' + dias + 'd', color: C.green };
}

export default function RecorrentesScreen(props) {
  var navigation = props.navigation;
  var user = useAuth().user;

  var _data = useState([]); var data = _data[0]; var setData = _data[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _refreshing = useState(false); var refreshing = _refreshing[0]; var setRefreshing = _refreshing[1];
  var _loadError = useState(false); var loadError = _loadError[0]; var setLoadError = _loadError[1];

  function loadData() {
    if (!user) return;
    getRecorrentes(user.id).then(function(r) {
      if (r.error) {
        setLoadError(true);
      } else {
        setData(r.data || []);
        setLoadError(false);
      }
      setLoading(false);
      setRefreshing(false);
    }).catch(function() {
      setLoadError(true);
      setLoading(false);
      setRefreshing(false);
    });
  }

  useFocusEffect(useCallback(function() {
    setLoading(true);
    loadData();
  }, [user]));

  function handleRefresh() {
    setRefreshing(true);
    loadData();
  }

  function handleDelete(item) {
    Alert.alert(
      'Excluir Recorrente',
      'Deseja excluir "' + (item.descricao || finCats.getCatLabel(item.categoria)) + '"?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir', style: 'destructive',
          onPress: function() {
            deleteRecorrente(item.id).then(function(r) {
              if (r.error) {
                Alert.alert('Erro', 'Falha ao excluir.');
              } else {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                animateLayout();
                var updated = [];
                for (var i = 0; i < data.length; i++) {
                  if (data[i].id !== item.id) updated.push(data[i]);
                }
                setData(updated);
                Toast.show({ type: 'success', text1: 'Recorrente excluída', visibilityTime: 2000 });
              }
            });
          },
        },
      ]
    );
  }

  function handleToggleAtivo(item) {
    var newAtivo = !item.ativo;
    updateRecorrente(user.id, item.id, { ativo: newAtivo }).then(function(r) {
      if (r.error) {
        Alert.alert('Erro', 'Falha ao atualizar.');
      } else {
        animateLayout();
        var updated = [];
        for (var i = 0; i < data.length; i++) {
          if (data[i].id === item.id) {
            var copy = {};
            var keys = Object.keys(data[i]);
            for (var j = 0; j < keys.length; j++) {
              copy[keys[j]] = data[i][keys[j]];
            }
            copy.ativo = newAtivo;
            updated.push(copy);
          } else {
            updated.push(data[i]);
          }
        }
        setData(updated);
      }
    });
  }

  // Group by frequency
  function groupByFreq(items) {
    var groups = {};
    for (var i = 0; i < items.length; i++) {
      var freq = items[i].frequencia || 'mensal';
      if (!groups[freq]) groups[freq] = [];
      groups[freq].push(items[i]);
    }
    // Sort within each group by proximo_vencimento
    var keys = Object.keys(groups);
    for (var k = 0; k < keys.length; k++) {
      groups[keys[k]].sort(function(a, b) {
        return (a.proximo_vencimento || '').localeCompare(b.proximo_vencimento || '');
      });
    }
    return groups;
  }

  // Summary calculations
  var totalEntradas = 0;
  var totalSaidas = 0;
  for (var si = 0; si < data.length; si++) {
    var item = data[si];
    if (!item.ativo) continue;
    var mensal = item.valor || 0;
    if (item.frequencia === 'semanal') mensal = mensal * 4.33;
    else if (item.frequencia === 'quinzenal') mensal = mensal * 2;
    else if (item.frequencia === 'anual') mensal = mensal / 12;

    if (item.tipo === 'entrada') {
      totalEntradas += mensal;
    } else {
      totalSaidas += mensal;
    }
  }

  var grouped = groupByFreq(data);

  // Build sections for FlatList
  var sections = [];
  for (var fi = 0; fi < FREQ_ORDER.length; fi++) {
    var freq = FREQ_ORDER[fi];
    var items = grouped[freq];
    if (items && items.length > 0) {
      sections.push({ type: 'header', freq: freq, count: items.length, key: 'h_' + freq });
      for (var ii = 0; ii < items.length; ii++) {
        sections.push({ type: 'item', data: items[ii], key: 'i_' + items[ii].id });
      }
    }
  }

  function renderItem(info) {
    var row = info.item;

    if (row.type === 'header') {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{FREQ_LABELS[row.freq] || row.freq}</Text>
          <Badge text={row.count + (row.count === 1 ? ' item' : ' itens')} color={C.accent} />
        </View>
      );
    }

    var rec = row.data;
    var catIcon = finCats.getCatIcon(rec.categoria, rec.subcategoria);
    var catColor = finCats.getCatColor(rec.categoria, rec.subcategoria);
    var catLabel = rec.descricao || finCats.getCatLabel(rec.categoria);
    var subLabel = rec.subcategoria ? finCats.getSubcatLabel(rec.subcategoria) : '';
    var isEntrada = rec.tipo === 'entrada';
    var valorColor = isEntrada ? C.green : C.red;
    var valorPrefix = isEntrada ? '+' : '-';
    var dias = diasAte(rec.proximo_vencimento);
    var diaBadge = getDiaBadge(dias);

    return (
      <SwipeableRow onDelete={function() { handleDelete(rec); }}>
        <View style={[styles.card, !rec.ativo && { opacity: 0.45 }]}>
          <View style={styles.cardLeft}>
            <View style={[styles.catCircle, { backgroundColor: catColor + '18' }]}>
              <Ionicons name={catIcon} size={18} color={catColor} />
            </View>
            <View style={styles.cardCenter}>
              <Text style={styles.cardTitle} numberOfLines={1}>{catLabel}</Text>
              {subLabel ? (
                <Text style={styles.cardSub} numberOfLines={1}>{subLabel}</Text>
              ) : null}
              <View style={styles.cardMeta}>
                {rec.conta ? (
                  <Badge text={rec.conta} color={C.accent} />
                ) : null}
                <Text style={styles.cardDate}>
                  {'Próx: ' + formatDateBr(rec.proximo_vencimento)}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.cardRight}>
            <Text style={[styles.cardValue, { color: valorColor }]}>
              {valorPrefix + 'R$ ' + fmt(rec.valor || 0)}
            </Text>
            <Badge text={FREQ_LABELS[rec.frequencia] || rec.frequencia} color={catColor} />
            <Badge text={diaBadge.text} color={diaBadge.color} />
            <Switch
              value={rec.ativo !== false}
              onValueChange={function() { handleToggleAtivo(rec); }}
              trackColor={{ false: C.border, true: catColor + '40' }}
              thumbColor={rec.ativo !== false ? catColor : C.dim}
              ios_backgroundColor={C.border}
              style={styles.switchSmall}
            />
          </View>
        </View>
      </SwipeableRow>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={C.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={function() { navigation.goBack(); }} accessibilityLabel="Voltar" accessibilityRole="button">
          <Ionicons name="chevron-back" size={28} color={C.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transações Recorrentes</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Summary */}
      {data.length > 0 ? (
        <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
          <Glass glow={C.accent} padding={14}>
            <Text style={styles.summaryTitle}>ESTIMATIVA MENSAL</Text>
            <View style={styles.summaryRow}>
              <View style={styles.summaryCol}>
                <Text style={styles.summaryLabel}>ENTRADAS</Text>
                <Text style={[styles.summaryValue, { color: C.green }]}>
                  {'R$ ' + fmt(totalEntradas)}
                </Text>
              </View>
              <View style={styles.summaryCol}>
                <Text style={styles.summaryLabel}>SAÍDAS</Text>
                <Text style={[styles.summaryValue, { color: C.red }]}>
                  {'R$ ' + fmt(totalSaidas)}
                </Text>
              </View>
              <View style={styles.summaryCol}>
                <Text style={styles.summaryLabel}>SALDO</Text>
                <Text style={[styles.summaryValue, { color: (totalEntradas - totalSaidas) >= 0 ? C.green : C.red }]}>
                  {'R$ ' + fmt(totalEntradas - totalSaidas)}
                </Text>
              </View>
            </View>
          </Glass>
        </View>
      ) : null}

      {/* List or empty */}
      {loadError ? (
        <EmptyState
          ionicon="alert-circle-outline"
          title="Erro ao carregar"
          description="Não foi possível carregar as transações recorrentes."
          cta="Tentar novamente"
          onCta={function() { setLoading(true); loadData(); }}
          color={C.red}
        />
      ) : data.length === 0 ? (
        <EmptyState
          ionicon="repeat-outline"
          title="Nenhuma recorrente"
          description="Adicione transações recorrentes para acompanhar gastos fixos e receitas regulares."
          cta="Adicionar recorrente"
          onCta={function() { navigation.navigate('AddRecorrente'); }}
          color={C.accent}
        />
      ) : (
        <FlatList
          data={sections}
          renderItem={renderItem}
          keyExtractor={function(item) { return item.key; }}
          contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 8 }}
          refreshControl={
            React.createElement(RefreshControl, {
              refreshing: refreshing,
              onRefresh: handleRefresh,
              tintColor: C.accent,
              colors: [C.accent],
            })
          }
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={5}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        onPress={function() { navigation.navigate('AddRecorrente'); }}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Adicionar recorrente"
        style={styles.fab}
      >
        <Ionicons name="add" size={28} color="white" />
      </TouchableOpacity>
    </View>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: C.text, fontFamily: F.display },
  summaryTitle: {
    fontSize: 10, color: C.dim, fontFamily: F.mono,
    letterSpacing: 0.8, marginBottom: 8,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryCol: { alignItems: 'center', flex: 1 },
  summaryLabel: { fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 },
  summaryValue: { fontSize: 15, fontWeight: '800', fontFamily: F.display, marginTop: 2 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 6,
  },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: C.textSecondary,
    fontFamily: F.display, letterSpacing: 0.5,
  },
  card: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.cardSolid, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, padding: 12,
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  catCircle: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  cardCenter: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 13, fontWeight: '600', color: C.text, fontFamily: F.body },
  cardSub: { fontSize: 11, color: C.sub, fontFamily: F.body },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  cardDate: { fontSize: 10, color: C.dim, fontFamily: F.mono },
  cardRight: { alignItems: 'flex-end', gap: 4, marginLeft: 8 },
  cardValue: { fontSize: 14, fontWeight: '700', fontFamily: F.mono },
  switchSmall: { transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] },
  fab: {
    position: 'absolute', bottom: 24, right: 20,
    width: SIZE.fabSize, height: SIZE.fabSize, borderRadius: SIZE.fabSize / 2,
    backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center',
    shadowColor: C.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 16, elevation: 8,
  },
});
