import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';

import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getOperacoes, getProventos, deleteOperacao } from '../../services/database';
import { fetchPrices, fetchPriceHistory, clearPriceCache, getLastPriceUpdate } from '../../services/priceService';
import { Glass, Badge, SectionLabel } from '../../components';
import InteractiveChart from '../../components/InteractiveChart';

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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

  useEffect(function() { loadData(); }, []);

  var loadData = async function() {
    if (!user) return;
    var results = await Promise.all([
      getOperacoes(user.id, { ticker: ticker }),
      getProventos(user.id, { ticker: ticker }),
    ]);
    setTxns(results[0].data || []);
    setProvs(results[1].data || []);
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
      setPriceError('Cotacoes indisponiveis');
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
  var totalProvs = 0;
  for (var j = 0; j < provs.length; j++) {
    totalProvs += (provs[j].valor_por_cota || 0) * (provs[j].quantidade || 0);
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
                Cotação não disponível
              </Text>
            </View>
          )}
        </Glass>

        {/* ══════ CHART 30 DIAS ══════ */}
        {historyData.length >= 2 ? (
          <Glass padding={14}>
            <SectionLabel>HISTORICO 30 DIAS</SectionLabel>
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

        {/* ══════ POSICAO ══════ */}
        <Glass glow={C.acoes} padding={14}>
          <SectionLabel>POSICAO</SectionLabel>
          <View style={styles.posGrid}>
            {[
              { l: 'Quantidade', v: String(position.qty) },
              { l: 'Preco Medio', v: 'R$ ' + fmt(pm) },
              { l: 'Custo Total', v: 'R$ ' + fmt(position.custo) },
              { l: 'Proventos', v: 'R$ ' + fmt(totalProvs) },
              valorAtual != null ? { l: 'Valor Atual', v: 'R$ ' + fmt(valorAtual) } : null,
              yieldOnCost > 0 ? { l: 'Yield on Cost', v: yieldOnCost.toFixed(2) + '%' } : null,
            ].filter(Boolean).map(function(d, i) {
              return (
                <View key={i} style={styles.posItem}>
                  <Text style={styles.posItemLabel}>{d.l}</Text>
                  <Text style={styles.posItemValue}>{d.v}</Text>
                </View>
              );
            })}
          </View>
        </Glass>

        <SectionLabel>{txns.length + ' TRANSACOES'}</SectionLabel>
        <Glass padding={0}>
          {txns.length === 0 ? (
            <Text style={styles.emptyText}>Nenhuma transacao</Text>
          ) : (
            txns.map(function(t, i) {
              var totalTxn = (t.quantidade || 0) * (t.preco || 0);
              return (
                <View
                  key={t.id || i}
                  style={[styles.txnRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Badge text={t.tipo.toUpperCase()} color={t.tipo === 'compra' ? C.acoes : C.red} />
                      <Text style={styles.txnDate}>{new Date(t.data).toLocaleDateString('pt-BR')}</Text>
                    </View>
                    <Text style={styles.txnDetail}>
                      {t.quantidade + ' x R$ ' + fmt(t.preco || 0) + (t.corretora ? ' | ' + t.corretora : '')}
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
                      <TouchableOpacity onPress={function() { handleDelete(t.id, i); }}>
                        <Text style={[styles.actionLink, { color: C.red }]}>Excluir</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </Glass>

        {provs.length > 0 && (
          <View>
            <SectionLabel>{'PROVENTOS - R$ ' + fmt(totalProvs)}</SectionLabel>
            <Glass padding={0}>
              {provs.map(function(p, i) {
                var valProv = (p.valor_por_cota || 0) * (p.quantidade || 0);
                return (
                  <View
                    key={p.id || i}
                    style={[styles.txnRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}
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
              })}
            </Glass>
          </View>
        )}

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

  // Transactions
  txnRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  txnDate: { fontSize: 11, color: C.sub, fontFamily: F.mono },
  txnDetail: { fontSize: 11, color: C.dim, fontFamily: F.mono, marginTop: 2 },
  txnTotal: { fontSize: 12, fontWeight: '700', fontFamily: F.mono },
  emptyText: { padding: 20, fontSize: 11, color: C.dim, fontFamily: F.body, textAlign: 'center' },
  actionLink: { fontSize: 12, color: C.accent, fontFamily: F.mono, fontWeight: '600' },
  buyBtn: { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  buyBtnText: { fontSize: 14, fontWeight: '700', color: 'white', fontFamily: F.display },
});
