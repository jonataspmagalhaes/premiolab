import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getOperacoes, getProventos, deleteOperacao } from '../../services/database';
import { Glass, Badge, SectionLabel } from '../../components';

export default function AssetDetailScreen(props) {
  var navigation = props.navigation;
  var route = props.route;
  var ticker = route.params.ticker;
  var user = useAuth().user;

  var s1 = useState([]); var txns = s1[0]; var setTxns = s1[1];
  var s2 = useState([]); var provs = s2[0]; var setProvs = s2[1];
  var s3 = useState(true); var loading = s3[0]; var setLoading = s3[1];

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
  };

  var handleDelete = function(id, idx) {
    Alert.alert(
      'Excluir operacao?',
      'Essa acao nao pode ser desfeita.',
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

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={C.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={function() { navigation.goBack(); }} style={styles.backBtn}>
            <Text style={styles.backText}>{'<'}</Text>
          </TouchableOpacity>
          <Text style={styles.ticker}>{ticker}</Text>
          <View style={{ width: 32 }} />
        </View>

        <Glass glow={C.acoes} padding={14}>
          <SectionLabel>POSICAO</SectionLabel>
          <View style={styles.posGrid}>
            {[
              { l: 'Quantidade', v: String(position.qty) },
              { l: 'Preco Medio', v: 'R$ ' + pm.toFixed(2) },
              { l: 'Custo Total', v: 'R$ ' + position.custo.toFixed(2) },
              { l: 'Proventos', v: 'R$ ' + totalProvs.toFixed(2) },
            ].map(function(d, i) {
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
                      {t.quantidade + ' x R$ ' + (t.preco || 0).toFixed(2) + (t.corretora ? ' | ' + t.corretora : '')}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={[styles.txnTotal, { color: t.tipo === 'compra' ? C.acoes : C.red }]}>
                      R$ {totalTxn.toFixed(2)}
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
            <SectionLabel>{'PROVENTOS - R$ ' + totalProvs.toFixed(2)}</SectionLabel>
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
                    <Text style={[styles.txnTotal, { color: C.green }]}>+R$ {valProv.toFixed(2)}</Text>
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
    </SafeAreaView>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: SIZE.gap },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  backBtn: { width: 32, height: 32, justifyContent: 'center' },
  backText: { fontSize: 28, color: C.accent, fontWeight: '300' },
  ticker: { fontSize: 20, fontWeight: '800', color: C.text, fontFamily: F.display },
  posGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  posItem: { width: '48%', backgroundColor: C.surface, borderRadius: SIZE.radiusSm, padding: 10, borderWidth: 1, borderColor: C.border },
  posItemLabel: { fontSize: 7, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 },
  posItemValue: { fontSize: 14, fontWeight: '700', color: C.text, fontFamily: F.display, marginTop: 2 },
  txnRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  txnDate: { fontSize: 9, color: C.sub, fontFamily: F.mono },
  txnDetail: { fontSize: 9, color: C.dim, fontFamily: F.mono, marginTop: 2 },
  txnTotal: { fontSize: 12, fontWeight: '700', fontFamily: F.mono },
  emptyText: { padding: 20, fontSize: 11, color: C.dim, fontFamily: F.body, textAlign: 'center' },
  actionLink: { fontSize: 10, color: C.accent, fontFamily: F.mono, fontWeight: '600' },
  buyBtn: { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  buyBtnText: { fontSize: 14, fontWeight: '700', color: 'white', fontFamily: F.display },
});
