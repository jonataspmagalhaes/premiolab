import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getSaldos, getMovimentacoes, deleteMovimentacao } from '../../services/database';
import { Glass, Pill, Badge, SectionLabel } from '../../components';
import { LoadingScreen } from '../../components/States';

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

export default function ExtratoScreen(props) {
  var navigation = props.navigation;
  var user = useAuth().user;

  var _movs = useState([]); var movs = _movs[0]; var setMovs = _movs[1];
  var _saldos = useState([]); var saldos = _saldos[0]; var setSaldos = _saldos[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _refreshing = useState(false); var refreshing = _refreshing[0]; var setRefreshing = _refreshing[1];
  var _contaFilter = useState('todos'); var contaFilter = _contaFilter[0]; var setContaFilter = _contaFilter[1];
  var _periodo = useState('3m'); var periodo = _periodo[0]; var setPeriodo = _periodo[1];

  var load = async function() {
    if (!user) return;
    var filters = {};

    // Period filter
    var pDef = PERIODOS.find(function(p) { return p.k === periodo; });
    if (pDef && pDef.days > 0) {
      var dInicio = new Date();
      dInicio.setDate(dInicio.getDate() - pDef.days);
      filters.dataInicio = dInicio.toISOString().substring(0, 10);
    }
    filters.limit = 500;

    var results = await Promise.all([
      getMovimentacoes(user.id, filters),
      getSaldos(user.id),
    ]);
    setMovs(results[0].data || []);
    setSaldos(results[1].data || []);
    setLoading(false);
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

  function handleDelete(mov) {
    var isAuto = AUTO_CATEGORIAS.indexOf(mov.categoria) >= 0;
    if (isAuto) {
      Alert.alert('Não permitido', 'Movimentações automáticas não podem ser excluídas.');
      return;
    }
    Alert.alert('Excluir movimentação?', 'Essa ação não pode ser desfeita. O saldo NÃO será revertido automaticamente.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir', style: 'destructive',
        onPress: async function() {
          var result = await deleteMovimentacao(mov.id);
          if (!result.error) {
            setMovs(movs.filter(function(x) { return x.id !== mov.id; }));
          } else {
            Alert.alert('Erro', 'Falha ao excluir.');
          }
        },
      },
    ]);
  }

  if (loading) return <View style={styles.container}><LoadingScreen /></View>;

  // Conta names for filter
  var contaNames = ['todos'];
  for (var ci = 0; ci < saldos.length; ci++) {
    var cn = saldos[ci].corretora || saldos[ci].name || '';
    if (cn && contaNames.indexOf(cn) === -1) contaNames.push(cn);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}>

      <View style={styles.header}>
        <TouchableOpacity onPress={function() { navigation.goBack(); }}>
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Extrato</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Resumo top */}
      <Glass padding={12}>
        <View style={styles.resumoRow}>
          <View style={{ alignItems: 'center', flex: 1 }}>
            <Text style={styles.resumoLabel}>Entradas</Text>
            <Text style={[styles.resumoVal, { color: C.green }]}>+R$ {fmt(totalEntradas)}</Text>
          </View>
          <View style={{ width: 1, height: 30, backgroundColor: C.border }} />
          <View style={{ alignItems: 'center', flex: 1 }}>
            <Text style={styles.resumoLabel}>Saídas</Text>
            <Text style={[styles.resumoVal, { color: C.red }]}>-R$ {fmt(totalSaidas)}</Text>
          </View>
          <View style={{ width: 1, height: 30, backgroundColor: C.border }} />
          <View style={{ alignItems: 'center', flex: 1 }}>
            <Text style={styles.resumoLabel}>Saldo</Text>
            <Text style={[styles.resumoVal, { color: (totalEntradas - totalSaidas) >= 0 ? C.green : C.red }]}>
              R$ {fmt(totalEntradas - totalSaidas)}
            </Text>
          </View>
        </View>
      </Glass>

      {/* Period filter */}
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

      {/* Conta filter */}
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

      {/* Grouped list */}
      {monthKeys.length === 0 ? (
        <Glass padding={16}>
          <Text style={{ fontSize: 13, color: C.sub, fontFamily: F.body, textAlign: 'center' }}>
            Nenhuma movimentação no período
          </Text>
        </Glass>
      ) : monthKeys.map(function(mk) {
        var group = grouped[mk];
        var saldoMes = group.entradas - group.saidas;
        return (
          <View key={mk}>
            {/* Month header */}
            <View style={styles.monthHeader}>
              <Text style={styles.monthLabel}>{formatMonthLabel(mk)}</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Text style={[styles.monthSub, { color: C.green }]}>+{fmt(group.entradas)}</Text>
                <Text style={[styles.monthSub, { color: C.red }]}>-{fmt(group.saidas)}</Text>
                <Text style={[styles.monthSub, { color: saldoMes >= 0 ? C.green : C.red, fontWeight: '700' }]}>
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
                  <TouchableOpacity key={mov.id || mi}
                    onLongPress={function() { handleDelete(mov); }}
                    activeOpacity={0.8}
                    style={[styles.movRow, mi > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
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
                      <Text style={[styles.movVal, { color: movColor }]}>
                        {isEntrada ? '+' : '-'}R$ {fmt(mov.valor)}
                      </Text>
                      {mov.saldo_apos != null ? (
                        <Text style={styles.movSaldoApos}>Saldo: R$ {fmt(mov.saldo_apos)}</Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </Glass>
          </View>
        );
      })}

      <View style={{ height: SIZE.tabBarHeight + 20 }} />
    </ScrollView>
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
  movSaldoApos: { fontSize: 9, color: C.dim, fontFamily: F.mono, marginTop: 1 },
});
