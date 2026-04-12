import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, FlatList, StyleSheet, RefreshControl,
  TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { animateLayout } from '../../utils/a11y';
import { useFocusEffect } from '@react-navigation/native';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { useFinancas, useAppStore } from '../../contexts/AppStoreContext';
import Toast from 'react-native-toast-message';
import { getMovimentacoes, deleteMovimentacao, upsertSaldo, addMovimentacaoComSaldo } from '../../services/database';
import { Glass, Pill, Badge, SectionLabel, SwipeableRow, PeriodFilter } from '../../components';
import { LoadingScreen } from '../../components/States';
import { usePrivacyStyle } from '../../components/Sensitive';
import { getSymbol } from '../../services/currencyService';
import * as Haptics from 'expo-haptics';
var finCats = require('../../constants/financeCategories');

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

var CAT_LABELS = finCats.CAT_LABELS;
var CAT_IONICONS = finCats.CAT_IONICONS;

var MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Auto-generated movs (from integrations) should not be deletable
var AUTO_CATEGORIAS = finCats.AUTO_CATEGORIAS;

var PAGE_SIZE = 50;

export default function ExtratoScreen(props) {
  var navigation = props.navigation;
  var route = props.route;
  var user = useAuth().user;

  var initConta = (route && route.params && route.params.conta) ? route.params.conta : 'todos';

  // Store hooks
  var financas = useFinancas();
  var store = useAppStore();
  var saldos = financas.saldos;

  var _contaFilter = useState(initConta); var contaFilter = _contaFilter[0]; var setContaFilter = _contaFilter[1];
  var _dateRange = useState(null); var dateRange = _dateRange[0]; var setDateRange = _dateRange[1];
  // Quando dateRange ativo, busca direto (store nao suporta filtro por data)
  var _localMovs = useState(null); var localMovs = _localMovs[0]; var setLocalMovs = _localMovs[1];
  var _localHasMore = useState(true); var localHasMore = _localHasMore[0]; var setLocalHasMore = _localHasMore[1];
  var _loadingMore = useState(false); var loadingMore = _loadingMore[0]; var setLoadingMore = _loadingMore[1];
  var _refreshing = useState(false); var refreshing = _refreshing[0]; var setRefreshing = _refreshing[1];
  var ps = usePrivacyStyle();

  var movs = dateRange ? (localMovs || []) : financas.movimentacoes;
  var hasMore = dateRange ? localHasMore : financas.movimentacoesHasMore;
  var loading = dateRange ? (localMovs === null) : financas.loading;

  function buildFilters(offset) {
    var filters = {};
    if (dateRange) {
      filters.dataInicio = dateRange.start;
      filters.dataFim = dateRange.end;
    }
    filters.limit = PAGE_SIZE;
    filters.offset = offset || 0;
    return filters;
  }

  var load = function() {
    if (!user) return;
    if (dateRange) {
      // Fetch filtrado direto (store nao suporta dateRange)
      setLocalMovs(null);
      getMovimentacoes(user.id, buildFilters(0)).then(function(res) {
        var newMovs = (res && res.data) || [];
        setLocalMovs(newMovs);
        setLocalHasMore(newMovs.length >= PAGE_SIZE);
      }).catch(function() { setLocalMovs([]); });
    } else {
      // Usa store
      setLocalMovs(null);
      financas.refresh();
    }
  };

  var loadMore = function() {
    if (loadingMore || !hasMore || !user) return;
    setLoadingMore(true);
    if (dateRange) {
      getMovimentacoes(user.id, buildFilters(movs.length)).then(function(res) {
        var newMovs = (res && res.data) || [];
        if (newMovs.length > 0) {
          setLocalMovs((localMovs || []).concat(newMovs));
        }
        setLocalHasMore(newMovs.length >= PAGE_SIZE);
        setLoadingMore(false);
      }).catch(function() { setLoadingMore(false); });
    } else {
      financas.loadMoreMovimentacoes().then(function() {
        setLoadingMore(false);
      }).catch(function() { setLoadingMore(false); });
    }
  };

  useFocusEffect(useCallback(function() { load(); }, [user, dateRange]));

  var onRefresh = function() {
    setRefreshing(true);
    if (dateRange) {
      getMovimentacoes(user.id, buildFilters(0)).then(function(res) {
        var newMovs = (res && res.data) || [];
        setLocalMovs(newMovs);
        setLocalHasMore(newMovs.length >= PAGE_SIZE);
        setRefreshing(false);
      }).catch(function() { setRefreshing(false); });
    } else {
      financas.refresh(true).then(function() {
        setRefreshing(false);
      }).catch(function() { setRefreshing(false); });
    }
  };

  // Filter by conta (case-insensitive)
  var filtered = movs;
  if (contaFilter !== 'todos') {
    var filterUp = contaFilter.toUpperCase().trim();
    filtered = movs.filter(function(m) { return (m.conta || '').toUpperCase().trim() === filterUp; });
  }

  // Group by month
  var grouped = {};
  var totalEntradas = 0;
  var totalSaidas = 0;
  for (var i = 0; i < filtered.length; i++) {
    var m = filtered[i];
    var monthKey = (m.data || '').substring(0, 7);
    if (!grouped[monthKey]) {
      grouped[monthKey] = { movs: [], entradas: 0, saidas: 0 };
    }
    grouped[monthKey].movs.push(m);
    if (m.tipo === 'entrada') {
      grouped[monthKey].entradas += (m.valor || 0);
      totalEntradas += (m.valor || 0);
    } else if (m.tipo === 'saida') {
      grouped[monthKey].saidas += (m.valor || 0);
      totalSaidas += (m.valor || 0);
    }
  }
  var monthKeys = Object.keys(grouped).sort().reverse();

  function formatMonthLabel(key) {
    var parts = key.split('-');
    if (parts.length !== 2) return key;
    var mesIdx = parseInt(parts[1]) - 1;
    return MESES[mesIdx] + '/' + parts[0].substring(2);
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    var parts = dateStr.substring(0, 10).split('-');
    if (parts.length !== 3) return dateStr;
    return parts[2] + '/' + parts[1];
  }

  var undoRef = useRef(null);

  var handleUndo = async function() {
    var saved = undoRef.current;
    if (!saved || !user) return;
    undoRef.current = null;
    // Find moeda from saldos for the conta
    var undoMoeda = 'BRL';
    var undoConta = saved.conta || '';
    for (var ui = 0; ui < saldos.length; ui++) {
      var uName = saldos[ui].corretora || saldos[ui].name || '';
      if (uName === undoConta || uName.toUpperCase() === undoConta.toUpperCase()) {
        undoMoeda = saldos[ui].moeda || 'BRL';
        break;
      }
    }
    var movPayload = {
      conta: saved.conta,
      moeda: undoMoeda,
      tipo: saved.tipo,
      categoria: saved.categoria,
      valor: saved.valor,
      descricao: saved.descricao || '',
      data: saved.data,
    };
    if (saved.ticker) movPayload.ticker = saved.ticker;
    await addMovimentacaoComSaldo(user.id, movPayload);
    store.invalidate('financas');
  };

  function handleDelete(mov) {
    var isAuto = AUTO_CATEGORIAS.indexOf(mov.categoria) >= 0;
    if (isAuto) {
      Alert.alert('Não permitido', 'Movimentações automáticas não podem ser excluídas.');
      return;
    }
    var desc = mov.descricao || CAT_LABELS[mov.categoria] || mov.categoria;
    Alert.alert(
      'Excluir movimentação?',
      desc + '\n' + getSymbol(getMovMoeda(mov)) + ' ' + fmt(mov.valor) + '\n\nO saldo será revertido automaticamente.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir e reverter', style: 'destructive',
          onPress: function() {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            deleteMovimentacao(mov.id).then(function(res) {
              if (res && res.error) {
                Alert.alert('Erro', 'Falha ao excluir.');
                return;
              }
              var conta = (mov.conta || '').toUpperCase().trim();
              var saldoAtual = null;
              for (var si = 0; si < saldos.length; si++) {
                var sName = (saldos[si].corretora || saldos[si].name || '').toUpperCase().trim();
                if (sName === conta) {
                  saldoAtual = saldos[si];
                  break;
                }
              }
              if (saldoAtual) {
                var saldoNovo = saldoAtual.saldo || 0;
                if (mov.tipo === 'entrada') {
                  saldoNovo = saldoNovo - (mov.valor || 0);
                } else {
                  saldoNovo = saldoNovo + (mov.valor || 0);
                }
                upsertSaldo(user.id, {
                  corretora: conta,
                  saldo: Math.max(0, saldoNovo),
                  moeda: saldoAtual.moeda || 'BRL',
                }).then(function() {
                  undoRef.current = mov;
                  animateLayout();
                  store.invalidate('financas');
                  Toast.show({
                    type: 'undo',
                    text1: 'Movimentação excluída',
                    text2: desc,
                    props: { onUndo: handleUndo },
                    visibilityTime: 5000,
                  });
                });
              } else {
                undoRef.current = mov;
                animateLayout();
                store.invalidate('financas');
                Toast.show({
                  type: 'undo',
                  text1: 'Movimentação excluída',
                  text2: desc,
                  props: { onUndo: handleUndo },
                  visibilityTime: 5000,
                });
              }
            });
          },
        },
      ]
    );
  }

  if (loading) return <View style={styles.container}><LoadingScreen /></View>;

  // Mapa conta→moeda para exibir símbolo correto
  var contaMoedaMap = {};
  for (var cmi = 0; cmi < saldos.length; cmi++) {
    var cmName = (saldos[cmi].corretora || saldos[cmi].name || '').toUpperCase().trim();
    if (cmName) contaMoedaMap[cmName] = saldos[cmi].moeda || 'BRL';
  }
  function getMovMoeda(mov) {
    var conta = (mov.conta || '').toUpperCase().trim();
    return contaMoedaMap[conta] || 'BRL';
  }

  // Conta names for filter
  var contaNames = ['todos'];
  for (var ci = 0; ci < saldos.length; ci++) {
    var cn = saldos[ci].corretora || saldos[ci].name || '';
    if (cn && contaNames.indexOf(cn) === -1) contaNames.push(cn);
  }

  var renderHeader = function() {
    return (
      <View style={{ gap: SIZE.gap }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={function() { navigation.goBack(); }}>
            <Text style={styles.back}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Extrato</Text>
          <View style={{ width: 32 }} />
        </View>

        <Glass padding={12}>
          <View style={styles.resumoRow}>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={styles.resumoLabel}>Entradas</Text>
              <Text style={[styles.resumoVal, { color: C.green }, ps]}>+R$ {fmt(totalEntradas)}</Text>
            </View>
            <View style={{ width: 1, height: 30, backgroundColor: C.border }} />
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={styles.resumoLabel}>Saídas</Text>
              <Text style={[styles.resumoVal, { color: C.red }, ps]}>-R$ {fmt(totalSaidas)}</Text>
            </View>
            <View style={{ width: 1, height: 30, backgroundColor: C.border }} />
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={styles.resumoLabel}>Saldo</Text>
              <Text style={[styles.resumoVal, { color: (totalEntradas - totalSaidas) >= 0 ? C.green : C.red }, ps]}>
                R$ {fmt(totalEntradas - totalSaidas)}
              </Text>
            </View>
          </View>
        </Glass>

        <PeriodFilter onRangeChange={function(r) { setDateRange(r); }} />

        {contaNames.length > 2 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6, paddingBottom: 2 }}>
            {contaNames.map(function(cn) {
              return (
                <Pill key={cn} active={contaFilter === cn} color={C.fiis}
                  onPress={function() { setContaFilter(cn); }}>
                  {cn === 'todos' ? 'Todas' : cn}
                </Pill>
              );
            })}
          </ScrollView>
        ) : null}

        {monthKeys.length === 0 ? (
          <Glass padding={16}>
            <Text style={{ fontSize: 13, color: C.sub, fontFamily: F.body, textAlign: 'center' }}>
              Nenhuma movimentação no período
            </Text>
          </Glass>
        ) : null}
      </View>
    );
  };

  var renderMonthGroup = function(info) {
    var mk = info.item;
    var group = grouped[mk];
    var saldoMes = group.entradas - group.saidas;
    return (
      <View>
        <View style={styles.monthHeader}>
          <Text style={styles.monthLabel}>{formatMonthLabel(mk)}</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Text style={[styles.monthSub, { color: C.green }, ps]}>+{fmt(group.entradas)}</Text>
            <Text style={[styles.monthSub, { color: C.red }, ps]}>-{fmt(group.saidas)}</Text>
            <Text style={[styles.monthSub, { color: saldoMes >= 0 ? C.green : C.red, fontWeight: '700' }, ps]}>
              = {fmt(saldoMes)}
            </Text>
          </View>
        </View>
        <Glass padding={0}>
          {group.movs.map(function(mov, mi) {
            var isEntrada = mov.tipo === 'entrada';
            var isTransf = mov.tipo === 'transferencia' || mov.categoria === 'transferencia';
            var isPix = mov.meio_pagamento === 'pix';
            var subcatMeta = mov.subcategoria ? finCats.SUBCATEGORIAS[mov.subcategoria] : null;
            var movColor = isPix ? C.green : subcatMeta ? subcatMeta.color : (isEntrada ? C.green : isTransf ? C.accent : C.red);
            var movIconName = isPix ? 'flash-outline' : subcatMeta ? subcatMeta.icon : (CAT_IONICONS[mov.categoria] || (isEntrada ? 'arrow-down-circle-outline' : isTransf ? 'swap-horizontal-outline' : 'arrow-up-circle-outline'));
            var isAuto = AUTO_CATEGORIAS.indexOf(mov.categoria) >= 0;
            var movLabel = mov.descricao || (subcatMeta ? subcatMeta.l : (CAT_LABELS[mov.categoria] || mov.categoria));

            return (
              <SwipeableRow key={mov.id || mi} enabled={!isAuto} onDelete={function() { handleDelete(mov); }}>
                <View style={[styles.movRow, mi > 0 && { borderTopWidth: 1, borderTopColor: C.border }, { backgroundColor: C.cardSolid }]}>
                  <View style={[styles.movIconWrap, { backgroundColor: movColor + '18' }]}>
                    <Ionicons name={movIconName} size={16} color={movColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.movDesc} numberOfLines={1}>
                      {movLabel}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={styles.movDate}>{formatDate(mov.data)}</Text>
                      <Badge text={mov.conta} color={C.dim} />
                      {mov.ticker ? <Badge text={mov.ticker} color={C.acoes} /> : null}
                      {isAuto ? <Badge text="auto" color={C.accent} /> : null}
                      {isPix ? <Badge text="PIX" color={C.green} /> : null}
                      {mov.parcela_atual && mov.parcela_total ? <Badge text={mov.parcela_atual + '/' + mov.parcela_total} color={C.etfs} /> : null}
                      {mov.cartao_id ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                          <Ionicons name="card-outline" size={10} color={C.accent} />
                          <Text style={{ fontSize: 9, color: C.accent, fontFamily: F.body }}>{'CARTÃO'}</Text>
                        </View>
                      ) : null}
                      {subcatMeta && !mov.descricao ? <Badge text={finCats.getGrupoMeta(subcatMeta.grupo).label} color={movColor} /> : null}
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', flexDirection: 'row', gap: 8 }}>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.movVal, { color: movColor }, ps]}>
                        {isEntrada ? '+' : '-'}{getSymbol(getMovMoeda(mov))} {fmt(mov.valor)}
                      </Text>
                      {mov.moeda_original && mov.valor_original && mov.moeda_original !== 'BRL' ? (
                        <Text style={[styles.movOriginalCurrency, ps]}>
                          {'(' + getSymbol(mov.moeda_original) + ' ' + Number(mov.valor_original).toFixed(2).replace('.', ',') + ')'}
                        </Text>
                      ) : null}
                      {mov.saldo_apos != null ? (
                        <Text style={[styles.movSaldoApos, ps]}>Saldo: {getSymbol(getMovMoeda(mov))} {fmt(mov.saldo_apos)}</Text>
                      ) : null}
                    </View>
                    <TouchableOpacity
                      onPress={function() { navigation.navigate('EditMovimentacao', { movimentacao: mov }); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ opacity: isAuto ? 0.4 : 1 }}
                      accessibilityLabel="Editar movimentação"
                      accessibilityRole="button">
                      <Ionicons name="create-outline" size={16} color={C.dim} />
                    </TouchableOpacity>
                  </View>
                </View>
              </SwipeableRow>
            );
          })}
        </Glass>
      </View>
    );
  };

  var monthKeyExtractor = function(item) { return item; };

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      data={monthKeys}
      keyExtractor={monthKeyExtractor}
      renderItem={renderMonthGroup}
      ListHeaderComponent={renderHeader()}
      ListFooterComponent={
        <View style={{ paddingVertical: 16, height: SIZE.tabBarHeight + 40 }}>
          {loadingMore ? <ActivityIndicator color={C.accent} size="small" /> : null}
        </View>
      }
      onEndReached={loadMore}
      onEndReachedThreshold={0.3}
      initialNumToRender={8}
      maxToRenderPerBatch={10}
      windowSize={5}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
    />
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: SIZE.padding, gap: SIZE.gap },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  back: { fontSize: 28, color: C.accent, fontWeight: '300' },
  title: { fontSize: 18, fontWeight: '800', color: C.text, fontFamily: F.display },

  // Resumo
  resumoRow: { flexDirection: 'row', alignItems: 'center' },
  resumoLabel: { fontSize: 10, color: C.dim, fontFamily: F.mono },
  resumoVal: { fontSize: 13, fontWeight: '700', fontFamily: F.mono, marginTop: 2 },

  // Month header
  monthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  monthLabel: { fontSize: 13, fontWeight: '700', color: C.text, fontFamily: F.display },
  monthSub: { fontSize: 10, fontFamily: F.mono },

  // Mov list
  movRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14 },
  movIconWrap: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  movIconText: { fontSize: 14, fontWeight: '700', fontFamily: F.mono },
  movDesc: { fontSize: 12, fontWeight: '600', color: C.text, fontFamily: F.body },
  movDate: { fontSize: 10, color: C.dim, fontFamily: F.mono },
  movVal: { fontSize: 13, fontWeight: '700', fontFamily: F.mono },
  movOriginalCurrency: { fontSize: 10, color: C.dim, fontFamily: F.mono, marginTop: 1 },
  movSaldoApos: { fontSize: 10, color: C.dim, fontFamily: F.mono, marginTop: 1 },
});
