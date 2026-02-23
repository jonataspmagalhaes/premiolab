import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, FlatList, StyleSheet, RefreshControl,
  TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { animateLayout } from '../../utils/a11y';
import { useFocusEffect } from '@react-navigation/native';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import Toast from 'react-native-toast-message';
import { getSaldos, getMovimentacoes, deleteMovimentacao, upsertSaldo, addMovimentacaoComSaldo } from '../../services/database';
import { Glass, Pill, Badge, SectionLabel, SwipeableRow } from '../../components';
import { LoadingScreen } from '../../components/States';
import { usePrivacyStyle } from '../../components/Sensitive';
import * as Haptics from 'expo-haptics';

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

var CAT_LABELS = {
  deposito: 'Depósito', retirada: 'Retirada', transferencia: 'Transferência',
  compra_ativo: 'Compra ativo', venda_ativo: 'Venda ativo',
  premio_opcao: 'Prêmio opção', recompra_opcao: 'Recompra opção',
  exercicio_opcao: 'Exercício', dividendo: 'Dividendo',
  jcp: 'JCP', rendimento_fii: 'Rendimento FII', rendimento_rf: 'Rendimento RF',
  ajuste_manual: 'Ajuste', salario: 'Salário',
  despesa_fixa: 'Despesa fixa', despesa_variavel: 'Despesa variável', outro: 'Outro',
};

var MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

var PERIODOS = [
  { k: '1m', l: '1M', days: 30 },
  { k: '3m', l: '3M', days: 90 },
  { k: '6m', l: '6M', days: 180 },
  { k: '1a', l: '1A', days: 365 },
  { k: 'tudo', l: 'Tudo', days: 0 },
];

// Auto-generated movs (from integrations) should not be deletable
var AUTO_CATEGORIAS = ['compra_ativo', 'venda_ativo', 'premio_opcao', 'recompra_opcao',
  'exercicio_opcao', 'dividendo', 'jcp', 'rendimento_fii', 'rendimento_rf'];

var PAGE_SIZE = 50;

export default function ExtratoScreen(props) {
  var navigation = props.navigation;
  var user = useAuth().user;

  var _movs = useState([]); var movs = _movs[0]; var setMovs = _movs[1];
  var _saldos = useState([]); var saldos = _saldos[0]; var setSaldos = _saldos[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _refreshing = useState(false); var refreshing = _refreshing[0]; var setRefreshing = _refreshing[1];
  var _loadingMore = useState(false); var loadingMore = _loadingMore[0]; var setLoadingMore = _loadingMore[1];
  var _hasMore = useState(true); var hasMore = _hasMore[0]; var setHasMore = _hasMore[1];
  var _contaFilter = useState('todos'); var contaFilter = _contaFilter[0]; var setContaFilter = _contaFilter[1];
  var _periodo = useState('3m'); var periodo = _periodo[0]; var setPeriodo = _periodo[1];
  var ps = usePrivacyStyle();

  function buildFilters(offset) {
    var filters = {};
    var pDef = PERIODOS.find(function(p) { return p.k === periodo; });
    if (pDef && pDef.days > 0) {
      var dInicio = new Date();
      dInicio.setDate(dInicio.getDate() - pDef.days);
      filters.dataInicio = dInicio.toISOString().substring(0, 10);
    }
    filters.limit = PAGE_SIZE;
    filters.offset = offset || 0;
    return filters;
  }

  var load = async function() {
    if (!user) return;
    var results = await Promise.all([
      getMovimentacoes(user.id, buildFilters(0)),
      getSaldos(user.id),
    ]);
    var newMovs = results[0].data || [];
    setMovs(newMovs);
    setSaldos(results[1].data || []);
    setHasMore(newMovs.length >= PAGE_SIZE);
    setLoading(false);
  };

  var loadMore = async function() {
    if (loadingMore || !hasMore || !user) return;
    setLoadingMore(true);
    var result = await getMovimentacoes(user.id, buildFilters(movs.length));
    var newMovs = result.data || [];
    if (newMovs.length > 0) {
      setMovs(movs.concat(newMovs));
    }
    setHasMore(newMovs.length >= PAGE_SIZE);
    setLoadingMore(false);
  };

  useFocusEffect(useCallback(function() { load(); }, [user, periodo]));

  var onRefresh = async function() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Filter by conta
  var filtered = movs;
  if (contaFilter !== 'todos') {
    filtered = movs.filter(function(m) { return m.conta === contaFilter; });
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
    var movPayload = {
      conta: saved.conta,
      tipo: saved.tipo,
      categoria: saved.categoria,
      valor: saved.valor,
      descricao: saved.descricao || '',
      data: saved.data,
    };
    if (saved.ticker) movPayload.ticker = saved.ticker;
    await addMovimentacaoComSaldo(user.id, movPayload);
    load();
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
      desc + '\nR$ ' + fmt(mov.valor) + '\n\nO saldo será revertido automaticamente.',
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
              var conta = mov.conta || '';
              var saldoAtual = null;
              for (var si = 0; si < saldos.length; si++) {
                var sName = saldos[si].corretora || saldos[si].name || '';
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
                  load();
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
                setMovs(movs.filter(function(x) { return x.id !== mov.id; }));
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

        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingBottom: 2 }}>
          {PERIODOS.map(function(p) {
            return (
              <Pill key={p.k} active={periodo === p.k} color={C.accent}
                onPress={function() { setPeriodo(p.k); }}>
                {p.l}
              </Pill>
            );
          })}
        </ScrollView>

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
            var movColor = isEntrada ? C.green : isTransf ? C.accent : C.red;
            var movIcon = isEntrada ? '↓' : isTransf ? '→' : '↑';
            var isAuto = AUTO_CATEGORIAS.indexOf(mov.categoria) >= 0;

            return (
              <SwipeableRow key={mov.id || mi} enabled={!isAuto} onDelete={function() { handleDelete(mov); }}>
                <View style={[styles.movRow, mi > 0 && { borderTopWidth: 1, borderTopColor: C.border }, { backgroundColor: C.cardSolid }]}>
                  <View style={[styles.movIconWrap, { backgroundColor: movColor + '12' }]}>
                    <Text style={[styles.movIconText, { color: movColor }]}>{movIcon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.movDesc} numberOfLines={1}>
                      {mov.descricao || CAT_LABELS[mov.categoria] || mov.categoria}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.movDate}>{formatDate(mov.data)}</Text>
                      <Badge text={mov.conta} color={C.dim} />
                      {mov.ticker ? <Badge text={mov.ticker} color={C.acoes} /> : null}
                      {isAuto ? <Badge text="auto" color={C.accent} /> : null}
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.movVal, { color: movColor }, ps]}>
                      {isEntrada ? '+' : '-'}R$ {fmt(mov.valor)}
                    </Text>
                    {mov.saldo_apos != null ? (
                      <Text style={[styles.movSaldoApos, ps]}>Saldo: R$ {fmt(mov.saldo_apos)}</Text>
                    ) : null}
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
      ListHeaderComponent={renderHeader}
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
  movSaldoApos: { fontSize: 10, color: C.dim, fontFamily: F.mono, marginTop: 1 },
});
