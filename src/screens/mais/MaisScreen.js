import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Share, Switch, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { C, F, SIZE } from '../../theme';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { getOperacoes, getProventos, getOpcoes, getAlertasConfig, updateAlertasConfig, getProfile } from '../../services/database';
import { Glass, Badge } from '../../components';

var SECTIONS = [
  {
    title: 'CONFIGURAÇÕES',
    items: [
      { icon: '📊', label: 'Taxa Selic', value: '_selic_', color: C.accent, route: 'ConfigSelic' },
      { icon: '🏛', label: 'Contas', value: 'Corretoras e Bancos', color: C.acoes, route: 'ConfigCorretoras' },
      { icon: '🔔', label: 'Alertas', value: 'Ativados', color: C.green, route: 'ConfigAlertas' },
      { icon: '🎯', label: 'Meta Mensal', value: 'Configurar', color: C.yellow, route: 'ConfigMeta' },
      { icon: '⚡', label: 'Gastos Rápidos', value: 'Atalhos de despesas', color: C.etfs, route: 'ConfigGastosRapidos' },
      { icon: '📂', label: 'Portfolios', value: 'Separar investimentos', color: C.fiis, route: 'ConfigPortfolios' },
      { icon: '🤖', label: 'Resumo IA', value: '_resumo_ia_', color: C.accent, route: 'ConfigResumoIA', gate: 'AI_SUMMARY' },
      { icon: '🧠', label: 'Perfil Investidor', value: 'Personalizar IA', color: C.opcoes, route: 'ConfigPerfilInvestidor' },
      { icon: '💾', label: 'Backup', value: 'Restaurar dados', color: C.rf, route: 'Backup' },
    ],
  },
  {
    title: 'ANÁLISE',
    items: [
      { icon: '📈', label: 'Análise Completa', value: 'Performance, Alocação, Indicadores', color: C.accent, route: 'Analise', gate: 'ANALYSIS_TAB' },
      { icon: '✨', label: 'Análises IA Salvas', value: 'Histórico de análises', color: C.accent, route: 'AnalisesSalvas', gate: 'SAVED_ANALYSES' },
    ],
  },
  {
    title: 'OPERAÇÕES',
    items: [
      { icon: '📋', label: 'Histórico Completo', value: '', color: C.acoes, route: 'Historico' },
      { icon: '🏦', label: 'Renda Fixa', value: 'Gerenciar', color: C.rf, route: 'RendaFixa' },
      { icon: '📥', label: 'Importar Operações', value: 'CSV / B3', color: C.fiis, route: 'ImportOperacoes', gate: 'CSV_IMPORT' },
      { icon: '📤', label: 'Exportar CSV', value: '', color: C.sub, action: 'export_csv' },
    ],
  },
  {
    title: 'APRENDER',
    items: [
      { icon: '📖', label: 'Guia: Covered Call', value: '', color: C.fiis, route: 'Guia', params: { guia: 'covered_call' } },
      { icon: '📖', label: 'Guia: Cash Secured Put', value: '', color: C.fiis, route: 'Guia', params: { guia: 'csp' } },
      { icon: '📖', label: 'Guia: Wheel Strategy', value: '', color: C.fiis, route: 'Guia', params: { guia: 'wheel' } },
    ],
  },
  {
    title: 'APP',
    items: [
      { icon: 'ℹ️', label: 'Sobre', value: 'v4.0.0', color: C.dim, route: 'Sobre' },
      { icon: '🚪', label: 'Sair', value: '', color: C.red, action: 'logout' },
    ],
  },
];

export default function MaisScreen(props) {
  var navigation = props.navigation;
  var _auth = useAuth();
  var signOut = _auth.signOut;
  var user = _auth.user;
  var sub = useSubscription();

  var _exAuto = useState(false); var exAuto = _exAuto[0]; var setExAuto = _exAuto[1];
  var _selicVal = useState(null); var selicVal = _selicVal[0]; var setSelicVal = _selicVal[1];
  var _sumFreq = useState('off'); var sumFreq = _sumFreq[0]; var setSumFreq = _sumFreq[1];
  var _profileNome = useState(''); var profileNome = _profileNome[0]; var setProfileNome = _profileNome[1];

  useFocusEffect(useCallback(function() {
    if (!user) return;
    getAlertasConfig(user.id).then(function(result) {
      if (result.data) {
        setExAuto(!!result.data.exercicio_auto);
      }
    });
    getProfile(user.id).then(function(result) {
      if (result.data) {
        if (result.data.selic != null) setSelicVal(result.data.selic);
        if (result.data.nome) setProfileNome(result.data.nome);
        if (result.data.ai_summary_frequency) setSumFreq(result.data.ai_summary_frequency);
      }
    });
  }, [user]));

  var toggleExAuto = function() {
    var next = !exAuto;
    setExAuto(next);
    if (!user) return;
    updateAlertasConfig(user.id, { exercicio_auto: next });
  };

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
        title: 'PremioLab - Exportação CSV',
      });
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível exportar os dados.');
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
    // Gate: locked features redirect to Paywall
    if (item.gate && !sub.canAccess(item.gate)) {
      navigation.navigate('Paywall');
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
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={function() { navigation.navigate('Profile'); }}
        accessibilityLabel="Editar perfil"
        accessibilityRole="button"
      >
        <Glass glow={C.accent} padding={14}>
          <View style={styles.profileRow}>
            <Image
              source={require('../../../assets/logo.png')}
              style={styles.avatar}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName}>{profileNome || 'Investidor'}</Text>
              <Text style={styles.profileEmail}>{user ? (user.email || '') : ''}</Text>
            </View>
            <Badge text={sub.tierLabel} color={sub.tierColor} />
            <Text style={styles.profileChevron}>{'›'}</Text>
          </View>
        </Glass>
      </TouchableOpacity>

      {/* Assinatura */}
      <View>
        <Text style={styles.sectionLabel}>ASSINATURA</Text>
        <Glass padding={0}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={function() { navigation.navigate('Paywall'); }}
            style={styles.menuRow}
          >
            <View style={styles.menuLeft}>
              <Ionicons name="star" size={20} color={sub.tierColor} />
              <Text style={styles.menuLabel}>{'Plano: ' + sub.tierLabel}</Text>
            </View>
            <View style={styles.menuRight}>
              <Text style={styles.menuValue}>
                {sub.isAdmin ? 'Admin' : sub.isVip ? 'VIP' : sub.trialInfo ? ('Até ' + (function() { var p = (sub.trialInfo.endDate || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; })()) : sub.tier === 'free' ? 'Fazer upgrade' : 'Gerenciar'}
              </Text>
              <Text style={styles.menuChevron}>{'›'}</Text>
            </View>
          </TouchableOpacity>
        </Glass>
      </View>

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
                      {item.gate && !sub.canAccess(item.gate) ? (
                        <Ionicons name="lock-closed" size={14} color={C.dim} style={{ marginRight: 4 }} />
                      ) : null}
                      {item.value ? (
                        <Text style={styles.menuValue}>{item.value === '_selic_' ? (selicVal != null ? selicVal + '%' : '13.25%') : item.value === '_resumo_ia_' ? (sumFreq === 'daily' ? 'Diário' : sumFreq === 'weekly' ? 'Semanal' : 'Desativado') : item.value}</Text>
                      ) : null}
                      <Text style={styles.menuChevron}>{'›'}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
              {sec.title === 'OPERAÇÕES' ? (
                <View style={[styles.menuRow, { borderTopWidth: 1, borderTopColor: C.border }]}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.menuLeft}>
                      <Text style={[styles.menuIcon, { color: C.opcoes }]}>{'⚡'}</Text>
                      <Text style={styles.menuLabel}>Exercício automático</Text>
                    </View>
                    <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.body, marginLeft: 30, marginTop: 2 }}>
                      Resolver opções vencidas sem confirmação
                    </Text>
                  </View>
                  <Switch
                    value={exAuto}
                    onValueChange={toggleExAuto}
                    trackColor={{ false: C.border, true: C.opcoes + '60' }}
                    thumbColor={exAuto ? C.opcoes : C.dim}
                  />
                </View>
              ) : null}
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
    width: 64, height: 64, borderRadius: 16,
  },
  profileName: { fontSize: 14, fontWeight: '700', color: C.text, fontFamily: F.display },
  profileEmail: { fontSize: 10, color: C.sub, fontFamily: F.body },
  profileChevron: { fontSize: 20, color: C.dim, marginLeft: 4 },

  sectionLabel: {
    fontSize: 10, color: C.dim, fontFamily: F.mono,
    letterSpacing: 0.8, fontWeight: '600', marginBottom: 4, marginTop: 8,
  },

  menuRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12,
  },
  menuLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  menuIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  menuLabel: { fontSize: 14, color: C.text, fontFamily: F.body },
  menuRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  menuValue: { fontSize: 12, color: C.dim, fontFamily: F.mono },
  menuChevron: { fontSize: 16, color: C.dim },
});
