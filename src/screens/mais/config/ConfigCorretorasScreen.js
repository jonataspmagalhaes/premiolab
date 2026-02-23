import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, F, SIZE } from '../../../theme';
import { useAuth } from '../../../contexts/AuthContext';
import { getSaldos } from '../../../services/database';
import { Glass, Badge, SectionLabel } from '../../../components';
import { TouchableOpacity } from 'react-native';
import { getSymbol } from '../../../services/currencyService';

function fmt(v) {
  if (v == null || isNaN(v)) return '0,00';
  return Number(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export default function ConfigCorretorasScreen(props) {
  var navigation = props.navigation;
  var _auth = useAuth(); var user = _auth.user;
  var _contas = useState([]); var contas = _contas[0]; var setContas = _contas[1];

  var load = async function() {
    if (!user) return;
    var result = await getSaldos(user.id);
    setContas(result.data || []);
  };

  useFocusEffect(useCallback(function() { load(); }, [user]));

  // Separar por tipo
  var corretoras = [];
  var bancos = [];
  var outros = [];
  for (var i = 0; i < contas.length; i++) {
    var tipo = contas[i].tipo || 'corretora';
    if (tipo === 'corretora') corretoras.push(contas[i]);
    else if (tipo === 'banco') bancos.push(contas[i]);
    else outros.push(contas[i]);
  }

  function renderSection(title, items, icon, color) {
    if (items.length === 0) return null;
    return (
      <View>
        <SectionLabel right={items.length + (items.length === 1 ? ' conta' : ' contas')}>{title}</SectionLabel>
        <Glass padding={0}>
          {items.map(function(c, idx) {
            var moeda = c.moeda || 'BRL';
            var simbolo = getSymbol(moeda);
            var initials = (c.corretora || '??').substring(0, 2).toUpperCase();
            return (
              <View key={c.id || idx} style={[styles.row, idx > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[styles.iconWrap, { backgroundColor: color + '15', borderColor: color + '30' }]}>
                    <Text style={[styles.iconText, { color: color }]}>{initials}</Text>
                  </View>
                  <View>
                    <Text style={styles.name}>{c.corretora}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      {moeda !== 'BRL' ? <Badge text={moeda} color={C.rf} /> : null}
                      <Text style={styles.saldo}>{simbolo} {fmt(c.saldo || 0)}</Text>
                    </View>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Ionicons name={icon} size={16} color={color} />
                </View>
              </View>
            );
          })}
        </Glass>
      </View>
    );
  }

  var total = contas.length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={function() { navigation.goBack(); }}
          accessibilityRole="button" accessibilityLabel="Voltar">
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Contas</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Resumo */}
      <Glass padding={14}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.summaryVal}>{String(total)}</Text>
            <Text style={styles.summaryLabel}>Total</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={[styles.summaryVal, { color: C.acoes }]}>{String(corretoras.length)}</Text>
            <Text style={styles.summaryLabel}>Corretoras</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={[styles.summaryVal, { color: C.green }]}>{String(bancos.length)}</Text>
            <Text style={styles.summaryLabel}>Bancos</Text>
          </View>
          {outros.length > 0 ? (
            <View style={{ alignItems: 'center' }}>
              <Text style={[styles.summaryVal, { color: C.dim }]}>{String(outros.length)}</Text>
              <Text style={styles.summaryLabel}>Outros</Text>
            </View>
          ) : null}
        </View>
      </Glass>

      {renderSection('CORRETORAS', corretoras, 'trending-up-outline', C.acoes)}
      {renderSection('BANCOS', bancos, 'business-outline', C.green)}
      {outros.length > 0 ? renderSection('OUTROS', outros, 'wallet-outline', C.dim) : null}

      {total === 0 ? (
        <Glass padding={24}>
          <Text style={styles.empty}>Nenhuma conta cadastrada.</Text>
          <Text style={[styles.empty, { marginTop: 4, color: C.dim }]}>
            Adicione contas em Carteira {'>'} Caixa.
          </Text>
        </Glass>
      ) : null}

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
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  name: { fontSize: 13, fontWeight: '600', color: C.text, fontFamily: F.display },
  saldo: { fontSize: 11, color: C.sub, fontFamily: F.mono },
  iconWrap: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 11, fontWeight: '800', fontFamily: F.mono },
  empty: { fontSize: 12, color: C.sub, fontFamily: F.body, textAlign: 'center' },
  summaryVal: { fontSize: 20, fontWeight: '800', color: C.text, fontFamily: F.display },
  summaryLabel: { fontSize: 10, color: C.dim, fontFamily: F.mono, marginTop: 2 },
});
