import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, F, SIZE } from '../../../theme';
import { useAuth } from '../../../contexts/AuthContext';
import { getUserBackups, restoreUserBackup } from '../../../services/database';
import { Glass } from '../../../components';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  var parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

function diasAtras(dateStr) {
  var d = new Date(dateStr + 'T12:00:00');
  var now = new Date();
  var diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  return diff + ' dias atrás';
}

function dayOfWeek(dateStr) {
  var DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  var d = new Date(dateStr + 'T12:00:00');
  return DIAS[d.getDay()];
}

function totalRecords(tablesCount) {
  if (!tablesCount) return 0;
  var total = 0;
  var keys = Object.keys(tablesCount);
  for (var i = 0; i < keys.length; i++) {
    total = total + (tablesCount[keys[i]] || 0);
  }
  return total;
}

export default function BackupScreen(props) {
  var navigation = props.navigation;
  var user = useAuth().user;

  var _backups = useState([]); var backups = _backups[0]; var setBackups = _backups[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _restoring = useState(null); var restoring = _restoring[0]; var setRestoring = _restoring[1];
  var _expanded = useState(null); var expanded = _expanded[0]; var setExpanded = _expanded[1];

  var load = async function() {
    if (!user) return;
    setLoading(true);
    try {
      var res = await getUserBackups(user.id);
      setBackups(res.data || []);
    } catch (e) {
      console.warn('BackupScreen load error:', e);
    }
    setLoading(false);
  };

  useFocusEffect(useCallback(function() {
    load();
  }, [user]));

  var handleRestore = function(backup) {
    Alert.alert(
      'Restaurar backup de ' + fmtDate(backup.backup_date) + '?',
      'ATENÇÃO: Todos os seus dados atuais serão substituídos pelos dados deste backup. Operações cadastradas após esta data serão perdidas.\n\nEssa ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Restaurar', style: 'destructive', onPress: function() {
          Alert.alert(
            'Confirmar restauração',
            'Tem certeza? Seus dados atuais serão substituídos permanentemente.',
            [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Sim, restaurar', style: 'destructive', onPress: function() {
                setRestoring(backup.id);
                restoreUserBackup(user.id, backup.id).then(function(res) {
                  setRestoring(null);
                  if (res.error) {
                    Alert.alert('Erro', res.error.message || 'Falha ao restaurar backup.');
                  } else {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(function() {});
                    Toast.show({ type: 'success', text1: 'Backup restaurado', text2: 'Dados de ' + fmtDate(backup.backup_date) + ' recuperados.' });
                  }
                }).catch(function(e) {
                  setRestoring(null);
                  Alert.alert('Erro', 'Falha inesperada: ' + (e.message || ''));
                });
              }},
            ]
          );
        }},
      ]
    );
  };

  var TABLE_LABELS = {
    profiles: 'Perfil',
    portfolios: 'Portfolios',
    operacoes: 'Operações',
    opcoes: 'Opções',
    renda_fixa: 'Renda Fixa',
    proventos: 'Proventos',
    movimentacoes: 'Movimentações',
    saldos_corretora: 'Contas',
    cartoes_credito: 'Cartões',
    orcamentos: 'Orçamentos',
    transacoes_recorrentes: 'Recorrentes',
    alertas_config: 'Alertas',
    indicators: 'Indicadores',
    rebalance_targets: 'Rebalanceamento',
    alertas_opcoes: 'Alertas Opções',
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={function() { navigation.goBack(); }} accessibilityLabel="Voltar">
          <Ionicons name="chevron-back" size={28} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Backup e Restauração</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Info */}
        <Glass padding={14} style={{ marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="shield-checkmark-outline" size={24} color={C.green} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontFamily: F.display, color: C.text }}>Backup automático diário</Text>
              <Text style={{ fontSize: 11, fontFamily: F.body, color: C.dim, marginTop: 2 }}>
                Seus dados são salvos automaticamente todos os dias. Backups ficam disponíveis por 30 dias.
              </Text>
            </View>
          </View>
        </Glass>

        {loading ? (
          <ActivityIndicator size="large" color={C.accent} style={{ marginTop: 40 }} />
        ) : backups.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 40 }}>
            <Ionicons name="cloud-offline-outline" size={48} color={C.dim} />
            <Text style={{ fontSize: 14, fontFamily: F.body, color: C.dim, marginTop: 12, textAlign: 'center' }}>
              Nenhum backup disponível ainda.{'\n'}O primeiro backup será feito amanhã às 2h.
            </Text>
          </View>
        ) : (
          <View>
            <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginBottom: 8 }}>
              {'BACKUPS DISPONÍVEIS (' + backups.length + ')'}
            </Text>

            {backups.map(function(bk) {
              var isExpanded = expanded === bk.id;
              var records = totalRecords(bk.tabelas_count);
              var isRestoring = restoring === bk.id;
              var isToday = bk.backup_date === new Date().toISOString().substring(0, 10);

              return (
                <TouchableOpacity
                  key={bk.id}
                  activeOpacity={0.7}
                  onPress={function() { setExpanded(isExpanded ? null : bk.id); }}
                  style={[styles.backupCard, isToday && { borderColor: C.green + '44' }]}
                >
                  <View style={styles.backupRow}>
                    <View style={[styles.dateCircle, isToday && { backgroundColor: C.green + '22' }]}>
                      <Ionicons name="calendar-outline" size={18} color={isToday ? C.green : C.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.backupDate}>{fmtDate(bk.backup_date)}</Text>
                        <Text style={styles.backupDay}>{dayOfWeek(bk.backup_date)}</Text>
                        {isToday ? (
                          <View style={{ backgroundColor: C.green + '22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                            <Text style={{ fontSize: 9, fontFamily: F.mono, color: C.green }}>HOJE</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.backupMeta}>
                        {diasAtras(bk.backup_date) + ' · ' + records + ' registros · ' + fmtSize(bk.size_bytes || 0)}
                      </Text>
                    </View>
                    <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={C.dim} />
                  </View>

                  {isExpanded ? (
                    <View style={styles.expandedContent}>
                      {/* Detalhes por tabela */}
                      <View style={styles.tablesGrid}>
                        {Object.keys(bk.tabelas_count || {}).map(function(tbl) {
                          var cnt = bk.tabelas_count[tbl];
                          if (cnt === 0) return null;
                          var label = TABLE_LABELS[tbl] || tbl;
                          return (
                            <View key={tbl} style={styles.tableItem}>
                              <Text style={styles.tableCount}>{cnt}</Text>
                              <Text style={styles.tableLabel}>{label}</Text>
                            </View>
                          );
                        })}
                      </View>

                      {/* Botao restaurar */}
                      <TouchableOpacity
                        onPress={function() { handleRestore(bk); }}
                        disabled={isRestoring}
                        style={styles.restoreBtn}
                      >
                        {isRestoring ? (
                          <ActivityIndicator size="small" color={C.text} />
                        ) : (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Ionicons name="refresh-outline" size={16} color={C.text} />
                            <Text style={styles.restoreText}>Restaurar para esta data</Text>
                          </View>
                        )}
                      </TouchableOpacity>

                      <Text style={styles.restoreWarning}>
                        Seus dados atuais serão substituídos pelos deste backup.
                      </Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  headerTitle: { fontSize: 17, fontFamily: F.display, color: C.text },
  scrollContent: { paddingHorizontal: 16, paddingTop: 4 },

  backupCard: {
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    marginBottom: 8,
  },
  backupRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  dateCircle: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: C.accent + '18',
    alignItems: 'center', justifyContent: 'center',
  },
  backupDate: { fontSize: 14, fontFamily: F.display, color: C.text },
  backupDay: { fontSize: 12, fontFamily: F.body, color: C.dim },
  backupMeta: { fontSize: 10, fontFamily: F.body, color: C.dim, marginTop: 2 },

  expandedContent: {
    marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border,
  },
  tablesGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14,
  },
  tableItem: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.bg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  tableCount: { fontSize: 11, fontFamily: F.mono, color: C.accent },
  tableLabel: { fontSize: 10, fontFamily: F.body, color: C.dim },

  restoreBtn: {
    backgroundColor: C.accent + '22',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreText: { fontSize: 13, fontFamily: F.display, color: C.text },
  restoreWarning: {
    fontSize: 10, fontFamily: F.body, color: C.red, textAlign: 'center', marginTop: 8,
  },
});
