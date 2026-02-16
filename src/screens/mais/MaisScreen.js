import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Share } from 'react-native';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getOperacoes, getProventos, getOpcoes } from '../../services/database';
import { Glass, Badge } from '../../components';

var SECTIONS = [
  {
    title: 'CONFIGURACOES',
    items: [
      { icon: '⚙', label: 'Taxa Selic', value: '13.25%', color: C.accent, route: 'ConfigSelic' },
      { icon: '⊕', label: 'Corretoras', value: 'Gerenciar', color: C.acoes, route: 'ConfigCorretoras' },
      { icon: '◉', label: 'Alertas', value: 'Ativados', color: C.green, route: 'ConfigAlertas' },
      { icon: '◎', label: 'Meta Mensal', value: 'Configurar', color: C.yellow, route: 'ConfigMeta' },
    ],
  },
  {
    title: 'OPERACOES',
    items: [
      { icon: '☰', label: 'Historico Completo', value: '', color: C.acoes, route: 'Historico' },
      { icon: '◈', label: 'Proventos', value: 'Gerenciar', color: C.fiis, route: 'Proventos' },
      { icon: '🏦', label: 'Renda Fixa', value: 'Gerenciar', color: C.rf, route: 'RendaFixa' },
      { icon: '↓', label: 'Exportar CSV', value: '', color: C.sub, action: 'export_csv' },
    ],
  },
  {
    title: 'APRENDER',
    items: [
      { icon: '◈', label: 'Guia: Covered Call', value: '', color: C.fiis, route: 'Guia', params: { guia: 'covered_call' } },
      { icon: '◈', label: 'Guia: Cash Secured Put', value: '', color: C.fiis, route: 'Guia', params: { guia: 'csp' } },
      { icon: '◈', label: 'Guia: Wheel Strategy', value: '', color: C.fiis, route: 'Guia', params: { guia: 'wheel' } },
    ],
  },
  {
    title: 'APP',
    items: [
      { icon: 'ℹ', label: 'Sobre', value: 'v4.0.0', color: C.dim, route: 'Sobre' },
      { icon: '↪', label: 'Sair', value: '', color: C.red, action: 'logout' },
    ],
  },
];

export default function MaisScreen(props) {
  var navigation = props.navigation;
  var _auth = useAuth();
  var signOut = _auth.signOut;
  var user = _auth.user;

  var handleExportCSV = async function() {
    try {
      if (!user) return;
      var results = await Promise.all([
        getOperacoes(user.id),
        getOpcoes(user.id),
        getProventos(user.id),
      ]);
      var ops = results[0].data || [];
      var opcoes = results[1].data || [];
      var provs = results[2].data || [];

      var csv = 'tipo,data,ticker,quantidade,preco,categoria,corretora\n';
      ops.forEach(function(op) {
        csv += [op.tipo, op.data, op.ticker, op.quantidade, op.preco, op.categoria || '', op.corretora || ''].join(',') + '\n';
      });

      csv += '\ntipo_opcao,ticker,strike,premio,quantidade,vencimento,status\n';
      opcoes.forEach(function(op) {
        csv += [op.tipo || '', op.ticker_opcao || op.ticker || '', op.strike, op.premio, op.quantidade, op.vencimento, op.status || ''].join(',') + '\n';
      });

      csv += '\ntipo_provento,data,ticker,valor_total\n';
      provs.forEach(function(p) {
        csv += [p.tipo_provento || '', p.data_pagamento, p.ticker, p.valor_total || 0].join(',') + '\n';
      });

      await Share.share({
        message: csv,
        title: 'PremioLab - Exportacao CSV',
      });
    } catch (e) {
      Alert.alert('Erro', 'Nao foi possivel exportar os dados.');
    }
  };

  var handleItem = async function(item) {
    if (item.action === 'logout') {
      await signOut();
      return;
    }
    if (item.action === 'export_csv') {
      await handleExportCSV();
      return;
    }
    if (item.route) {
      navigation.navigate(item.route, item.params || {});
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Profile card */}
      <Glass glow={C.accent} padding={14}>
        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user && user.email ? user.email[0].toUpperCase() : 'U'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>Investidor</Text>
            <Text style={styles.profileEmail}>{user ? (user.email || '') : ''}</Text>
          </View>
          <Badge text="PRO" color={C.accent} />
        </View>
      </Glass>

      {/* Sections */}
      {SECTIONS.map(function(sec, si) {
        return (
          <View key={si}>
            <Text style={styles.sectionLabel}>{sec.title}</Text>
            <Glass padding={0}>
              {sec.items.map(function(item, i) {
                return (
                  <TouchableOpacity
                    key={i}
                    activeOpacity={0.7}
                    onPress={function() { handleItem(item); }}
                    style={[
                      styles.menuRow,
                      i > 0 && { borderTopWidth: 1, borderTopColor: C.border },
                    ]}
                  >
                    <View style={styles.menuLeft}>
                      <Text style={[styles.menuIcon, { color: item.color }]}>{item.icon}</Text>
                      <Text style={[styles.menuLabel, item.action === 'logout' && { color: C.red }]}>
                        {item.label}
                      </Text>
                    </View>
                    <View style={styles.menuRight}>
                      {item.value ? (
                        <Text style={styles.menuValue}>{item.value}</Text>
                      ) : null}
                      <Text style={styles.menuChevron}>{'›'}</Text>
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
  content: { padding: 16, gap: SIZE.gap },

  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: C.accent, justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '800', color: 'white', fontFamily: F.display },
  profileName: { fontSize: 14, fontWeight: '700', color: C.text, fontFamily: F.display },
  profileEmail: { fontSize: 10, color: C.sub, fontFamily: F.body },

  sectionLabel: {
    fontSize: 7, color: C.dim, fontFamily: F.mono,
    letterSpacing: 0.8, fontWeight: '600', marginBottom: 4, marginTop: 8,
  },

  menuRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12,
  },
  menuLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  menuIcon: { fontSize: 14, width: 20, textAlign: 'center' },
  menuLabel: { fontSize: 12, color: C.text, fontFamily: F.body },
  menuRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  menuValue: { fontSize: 10, color: C.dim, fontFamily: F.mono },
  menuChevron: { fontSize: 14, color: C.dim },
});
