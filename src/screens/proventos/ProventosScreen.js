import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, RefreshControl,
  TouchableOpacity, Alert, Modal, ActivityIndicator,
} from 'react-native';
import { animateLayout } from '../../utils/a11y';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import Toast from 'react-native-toast-message';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useProventos } from '../../contexts/AppStoreContext';
import { deleteProvento, deleteAllProventos, addProvento, getProfile } from '../../services/database';
import { runDividendSync } from '../../services/dividendService';
import { Glass, Badge, Pill, SectionLabel, SwipeableRow, PeriodFilter } from '../../components';
import { SkeletonProventos, EmptyState } from '../../components/States';
import { usePrivacyStyle } from '../../components/Sensitive';
import * as Haptics from 'expo-haptics';

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
  { key: 'juros_rf', label: 'Juros RF' },
  { key: 'amortizacao', label: 'Amortização' },
  { key: 'bonificacao', label: 'Bonificação' },
];

function isoToBr(iso) {
  if (!iso) return '';
  var parts = iso.split('T')[0].split('-');
  if (parts.length !== 3) return iso;
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

function daysUntil(isoDate) {
  if (!isoDate) return 0;
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var target = new Date(isoDate + 'T12:00:00');
  var diff = target.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function ProventosScreen(props) {
  var navigation = props.navigation;
  var embedded = props.embedded || false;
  var user = useAuth().user;
  var sub = useSubscription();
  // Dataset via AppStoreContext — filtrado por selectedPortfolio globalmente
  var provStore = useProventos();
  var items = provStore.proventos;
  var loading = provStore.loading;
  var refreshProventos = provStore.refresh;
  var _refreshing = useState(false); var refreshing = _refreshing[0]; var setRefreshing = _refreshing[1];
  var _filter = useState('todos'); var filter = _filter[0]; var setFilter = _filter[1];
  var _tab = useState('pendente'); var tab = _tab[0]; var setTab = _tab[1];
  var _syncing = useState(false); var syncing = _syncing[0]; var setSyncing = _syncing[1];
  var _lastSync = useState(null); var lastSync = _lastSync[0]; var setLastSync = _lastSync[1];
  var _infoModal = useState(null); var infoModal = _infoModal[0]; var setInfoModal = _infoModal[1];
  var _loadError = useState(false); var loadError = _loadError[0]; var setLoadError = _loadError[1];
  var _dateRange = useState(null); var dateRange = _dateRange[0]; var setDateRange = _dateRange[1];
  var ps = usePrivacyStyle();

  // Carrega last_dividend_sync do profile (fora do store pra simplificar).
  // Na montagem e no focus, garante o store de proventos atualizado.
  useFocusEffect(useCallback(function() {
    if (!user) return;
    setLoadError(false);
    getProfile(user.id).then(function(res) {
      var prof = res && res.data ? res.data : null;
      if (prof && prof.last_dividend_sync) setLastSync(prof.last_dividend_sync);
    }).catch(function() { setLoadError(true); });
    refreshProventos(true);
  }, [user, refreshProventos]));

  var onRefresh = async function() {
    setRefreshing(true);
    try { await refreshProventos(true); } catch (_) {}
    setRefreshing(false);
  };

  var handleSync = async function() {
    if (syncing || !user) return;
    setSyncing(true);
    try {
      var result = await runDividendSync(user.id);
      setLastSync(new Date().toISOString().substring(0, 10));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (result.inserted > 0) {
        Toast.show({ type: 'success', text1: result.inserted + ' provento' + (result.inserted > 1 ? 's' : '') + ' importado' + (result.inserted > 1 ? 's' : ''), text2: (result.checked || 0) + ' ticker' + (result.checked > 1 ? 's' : '') + ' verificado' + (result.checked > 1 ? 's' : '') });
        await refreshProventos(true);
      } else {
        Alert.alert('Nenhum provento novo', result.message || 'Nenhum provento novo encontrado.');
      }
    } catch (e) {
      Alert.alert('Erro', 'Falha ao sincronizar dividendos: ' + (e.message || e));
    }
    setSyncing(false);
  };

  var handleResync = function() {
    if (syncing || !user) return;
    Alert.alert(
      'Resincronizar proventos?',
      'Proventos dos últimos 12 meses serão apagados e reimportados automaticamente com quantidades corretas por portfólio.\n\nProventos mais antigos serão preservados.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Resincronizar',
          style: 'destructive',
          onPress: async function() {
            setSyncing(true);
            try {
              // Apagar proventos dos ultimos 12 meses (janela do sync) — sem filtro de portfolio
              // para limpar proventos que podem ter sido atribuidos ao portfolio errado
              var cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
              var cutoffStr = cutoff.toISOString().substring(0, 10);
              var delResult = await deleteAllProventos(user.id, null, cutoffStr);
              if (delResult.error) {
                Alert.alert('Erro', 'Falha ao apagar proventos: ' + (delResult.error.message || ''));
                setSyncing(false);
                return;
              }
              var result = await runDividendSync(user.id);
              setLastSync(new Date().toISOString().substring(0, 10));
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Toast.show({ type: 'success', text1: (result.inserted || 0) + ' provento' + ((result.inserted || 0) > 1 ? 's' : '') + ' reimportado' + ((result.inserted || 0) > 1 ? 's' : ''), text2: 'Resincronização concluída' });
              await refreshProventos(true);
            } catch (e) {
              Alert.alert('Erro', 'Falha ao resincronizar: ' + (e.message || e));
            }
            setSyncing(false);
          },
        },
      ]
    );
  };

  var undoRef = useRef(null);

  var handleUndo = async function() {
    var saved = undoRef.current;
    if (!saved || !user) return;
    undoRef.current = null;
    var payload = {
      tipo: saved.tipo_provento || saved.tipo || 'dividendo',
      ticker: saved.ticker,
      data_pagamento: saved.data_pagamento,
      quantidade: saved.quantidade || 1,
      valor_por_cota: saved.valor_por_cota || 0,
    };
    if (saved.corretora) payload.corretora = saved.corretora;
    await addProvento(user.id, payload);
    refreshProventos(true);
  };

  var handleDelete = function(id) {
    var prov = null;
    for (var di = 0; di < items.length; di++) { if (items[di].id === id) { prov = items[di]; break; } }
    var detailMsg = prov
      ? (prov.ticker || '') + ' — R$ ' + fmt((prov.valor_por_cota || 0) * (prov.quantidade || 1))
      : 'Excluir este provento?';
    Alert.alert(
      'Excluir provento?',
      detailMsg,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async function() {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            var result = await deleteProvento(id);
            if (!result.error) {
              undoRef.current = prov;
              animateLayout();
              refreshProventos(true);
              Toast.show({
                type: 'undo',
                text1: 'Provento excluído',
                text2: (prov && prov.ticker ? prov.ticker : '') + ' removido',
                props: { onUndo: handleUndo },
                visibilityTime: 5000,
              });
            } else {
              Alert.alert('Erro', 'Falha ao excluir.');
            }
          },
        },
      ]
    );
  };

  // Separar por status: pendente (a receber) vs historico (ja pago)
  var todayStr = new Date().toISOString().substring(0, 10);
  var pendentes = [];
  var historico = [];
  for (var s = 0; s < items.length; s++) {
    var provDate = (items[s].data_pagamento || '').substring(0, 10);
    if (provDate > todayStr) {
      pendentes.push(items[s]);
    } else {
      historico.push(items[s]);
    }
  }

  var baseItems = tab === 'pendente' ? pendentes : historico;

  // Filter by date range (only for historico)
  if (tab === 'historico' && dateRange) {
    baseItems = baseItems.filter(function(i) {
      var d = (i.data_pagamento || '').substring(0, 10);
      return d >= dateRange.start && d <= dateRange.end;
    });
  }

  // Filter by tipo
  var filtered = filter === 'todos'
    ? baseItems
    : baseItems.filter(function(i) { return i.tipo_provento === filter; });

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
    // JCP tem 15% IR retido na fonte — somar valor liquido
    var ptipo = (p.tipo_provento || '').toLowerCase();
    var pval = (p.valor_total || 0);
    months[dateStr].total += (ptipo === 'jcp') ? pval * 0.85 : pval;
  }

  // Grand total
  var totalGeral = 0;
  for (var j = 0; j < filtered.length; j++) {
    var jtipo = (filtered[j].tipo_provento || '').toLowerCase();
    var jval = (filtered[j].valor_total || 0);
    totalGeral += (jtipo === 'jcp') ? jval * 0.85 : jval;
  }

  // Month label
  var MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  function monthLabel(ym) {
    if (!ym || ym.length < 7) return ym;
    var parts = ym.split('-');
    var mesIdx = parseInt(parts[1]) - 1;
    return MESES[mesIdx] + ' ' + parts[0];
  }

  if (loading) return <View style={{ flex: 1, backgroundColor: C.bg, padding: 18 }}><SkeletonProventos /></View>;
  if (loadError) return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: 18 }}>
      <EmptyState ionicon="alert-circle-outline" title="Erro ao carregar" description="Não foi possível carregar os proventos. Verifique sua conexão e tente novamente." cta="Tentar novamente" onCta={function() { refreshProventos(true); }} color={C.red} />
    </View>
  );

  var isPendente = tab === 'pendente';

  var renderHeader = function() {
    return (
      <View style={{ gap: SIZE.gap }}>
        {!embedded ? (
          <View style={styles.header}>
            <TouchableOpacity onPress={function() { navigation.goBack(); }}>
              <Text style={styles.back}>{'‹'}</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.title}>Proventos</Text>
              <TouchableOpacity onPress={function() { setInfoModal({ title: 'Proventos', text: 'Dividendos, JCP, rendimentos de FIIs e amortizações.\n\nTap no ícone de sync para importar novos.\nSegure para resincronizar ou adicionar manual.' }); }}>
                <Text style={{ fontSize: 13, color: C.accent }}>ⓘ</Text>
              </TouchableOpacity>
            </View>
            {sub.canAccess('AUTO_SYNC_DIVIDENDS') ? (
              <TouchableOpacity
                onPress={handleSync}
                onLongPress={function() {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  Alert.alert('Proventos', lastSync ? 'Último sync: ' + (function() { var p = (lastSync || '').split('-'); return p.length >= 3 ? p[2] + '/' + p[1] + '/' + p[0] : lastSync; })() : 'Nunca sincronizado', [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Adicionar manual', onPress: function() { navigation.navigate('AddProvento'); } },
                    { text: 'Resincronizar', style: 'destructive', onPress: function() { handleResync(); } },
                  ]);
                }}
                disabled={syncing}
                style={{ opacity: syncing ? 0.5 : 1, padding: 6 }}
                accessibilityLabel="Sincronizar proventos"
                accessibilityHint="Segure para mais opções"
              >
                {syncing ? <ActivityIndicator size="small" color={C.accent} /> : <Ionicons name="sync-outline" size={20} color={C.accent} />}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={function() { navigation.navigate('AddProvento'); }}>
                <Text style={styles.addIcon}>+</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, paddingHorizontal: SIZE.padding }}>
            {sub.canAccess('AUTO_SYNC_DIVIDENDS') ? (
              <TouchableOpacity
                onPress={handleSync}
                onLongPress={function() {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  Alert.alert('Proventos', lastSync ? 'Último sync: ' + (function() { var p = (lastSync || '').split('-'); return p.length >= 3 ? p[2] + '/' + p[1] + '/' + p[0] : lastSync; })() : 'Nunca sincronizado', [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Adicionar manual', onPress: function() { navigation.navigate('AddProvento'); } },
                    { text: 'Resincronizar', style: 'destructive', onPress: function() { handleResync(); } },
                  ]);
                }}
                disabled={syncing}
                style={{ opacity: syncing ? 0.5 : 1, padding: 6 }}
                accessibilityLabel="Sincronizar proventos"
                accessibilityHint="Segure para mais opções"
              >
                {syncing ? <ActivityIndicator size="small" color={C.accent} /> : <Ionicons name="sync-outline" size={20} color={C.accent} />}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={function() { navigation.navigate('AddProvento'); }}>
                <Text style={styles.addIcon}>+</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, isPendente && styles.tabBtnActive]}
            onPress={function() { setTab('pendente'); setDateRange(null); }}
          >
            <Text style={[styles.tabText, isPendente && styles.tabTextActive]}>
              {'A receber (' + pendentes.length + ')'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, !isPendente && styles.tabBtnActive]}
            onPress={function() { setTab('historico'); }}
          >
            <Text style={[styles.tabText, !isPendente && styles.tabTextActive]}>
              {'Histórico (' + historico.length + ')'}
            </Text>
          </TouchableOpacity>
        </View>

        {!isPendente ? (
          <PeriodFilter onRangeChange={function(r) { setDateRange(r); }} color={C.fiis} />
        ) : null}

        <Glass glow={isPendente ? C.yellow : C.fiis} padding={16}>
          <Text style={styles.totalLabel}>{isPendente ? 'TOTAL A RECEBER' : 'TOTAL RECEBIDO'}</Text>
          <Text style={[styles.totalValue, isPendente && { color: C.yellow }, ps]}>
            {'R$ ' + totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          <Text style={styles.totalCount}>
            {filtered.length + ' provento' + (filtered.length !== 1 ? 's' : '')}
            {filter !== 'todos' ? ' (' + TIPO_LABELS[filter] + ')' : ''}
          </Text>
        </Glass>

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

        {filtered.length === 0 ? (
          <EmptyState
            ionicon="cash-outline"
            title={isPendente ? 'Nenhum provento pendente' : 'Nenhum provento no historico'}
            description={isPendente
              ? 'Proventos a receber aparecerao aqui apos a sincronizacao.'
              : 'Proventos já pagos aparecem aqui para consulta.'}
            cta={isPendente ? (sub.canAccess('AUTO_SYNC_DIVIDENDS') ? 'Sincronizar' : 'Registrar Provento') : 'Registrar Provento'}
            onCta={isPendente ? (sub.canAccess('AUTO_SYNC_DIVIDENDS') ? handleSync : function() { navigation.navigate('AddProvento'); }) : function() { navigation.navigate('AddProvento'); }}
            color={isPendente ? (sub.canAccess('AUTO_SYNC_DIVIDENDS') ? C.yellow : C.fiis) : C.fiis}
          />
        ) : null}
      </View>
    );
  };

  var renderMonthGroup = function(info) {
    var ym = info.item;
    var group = months[ym];
    return (
      <View>
        <SectionLabel right={<Text style={ps}>{'R$ ' + fmt(group.total)}</Text>}>
          {monthLabel(ym)}
        </SectionLabel>
        <Glass padding={0}>
          {group.items.map(function(p, idx) {
            var tipoLabel = TIPO_LABELS[p.tipo_provento] || p.tipo_provento || 'DIV';
            var tipoColor = TIPO_COLORS[p.tipo_provento] || C.fiis;
            var valorBruto = p.valor_total || 0;
            // JCP tem 15% IR retido na fonte — mostrar valor liquido
            var valorTotal = ((p.tipo_provento || '').toLowerCase() === 'jcp') ? valorBruto * 0.85 : valorBruto;
            var days = isPendente ? daysUntil(p.data_pagamento) : 0;

            return (
              <SwipeableRow key={p.id || idx} onDelete={function() { handleDelete(p.id); }}>
                <View style={[styles.provRow, idx > 0 && { borderTopWidth: 1, borderTopColor: C.border }, { backgroundColor: C.cardSolid }]}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.provTicker}>{p.ticker}</Text>
                      <Badge text={tipoLabel} color={tipoColor} />
                      {isPendente && days > 0 && (
                        <Badge text={days + 'd'} color={days <= 7 ? C.yellow : C.dim} />
                      )}
                    </View>
                    <Text style={styles.provDate}>{isoToBr(p.data_pagamento)}</Text>
                    {p.quantidade > 0 && p.valor_por_cota > 0 && (
                      <Text style={[styles.provDetail, ps]}>
                        {p.quantidade + ' x R$ ' + fmt4(p.valor_por_cota)}
                      </Text>
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={[styles.provValor, isPendente && { color: C.yellow }, ps]}>
                      {(isPendente ? '' : '+') + 'R$ ' + fmt(valorTotal)}
                    </Text>
                    <TouchableOpacity onPress={function() {
                      navigation.navigate('EditProvento', { provento: p });
                    }}>
                      <Text style={styles.actionLink}>Editar</Text>
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

  var renderFooter = function() {
    return (
      <View style={{ gap: SIZE.gap }}>
        <TouchableOpacity
          activeOpacity={0.8}
          style={styles.addBtn}
          onPress={function() { navigation.navigate('AddProvento'); }}
        >
          <Text style={styles.addBtnText}>+ Novo Provento</Text>
        </TouchableOpacity>
        <View style={{ height: SIZE.tabBarHeight + 20 }} />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        data={monthOrder}
        keyExtractor={monthKeyExtractor}
        renderItem={renderMonthGroup}
        ListHeaderComponent={renderHeader()}
        ListFooterComponent={renderFooter()}
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={5}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />
        }
      />

      <Modal visible={infoModal !== null} animationType="fade" transparent={true}
        onRequestClose={function() { setInfoModal(null); }}>
        <TouchableOpacity activeOpacity={1} onPress={function() { setInfoModal(null); }}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 30 }}>
          <TouchableOpacity activeOpacity={1}
            style={{ backgroundColor: C.card, borderRadius: 14, padding: 20, maxWidth: 340, width: '100%', borderWidth: 1, borderColor: C.border }}>
            <Text style={{ fontSize: 13, color: C.text, fontFamily: F.display, fontWeight: '700', marginBottom: 10 }}>
              {infoModal && infoModal.title || ''}
            </Text>
            <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body, lineHeight: 18 }}>
              {infoModal && infoModal.text || ''}
            </Text>
            <TouchableOpacity onPress={function() { setInfoModal(null); }}
              style={{ marginTop: 14, alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 8, borderRadius: 8, backgroundColor: C.accent }}>
              <Text style={{ fontSize: 12, color: C.text, fontFamily: F.mono, fontWeight: '600' }}>Fechar</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
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

  tabRow: {
    flexDirection: 'row', borderRadius: 10, overflow: 'hidden',
    borderWidth: 1, borderColor: C.border,
  },
  tabBtn: {
    flex: 1, paddingVertical: 10, alignItems: 'center',
    backgroundColor: C.cardSolid,
  },
  tabBtnActive: { backgroundColor: C.accent },
  tabText: { fontSize: 13, fontWeight: '600', color: C.sub, fontFamily: F.body },
  tabTextActive: { color: 'white' },

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
