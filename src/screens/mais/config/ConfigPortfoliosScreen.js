import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Keyboard,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, F, SIZE } from '../../../theme';
import { useAuth } from '../../../contexts/AuthContext';
import { getPortfolios, addPortfolio, updatePortfolio, deletePortfolio, getOperacoes, getPortfolioBackups, restorePortfolioBackup } from '../../../services/database';
import { Glass, SwipeableRow } from '../../../components';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';

var COLORS = [
  C.acoes, C.fiis, C.opcoes, C.etfs, C.rf, C.stock_int, C.green, C.red, C.accent,
];

var ICONS = [
  'briefcase-outline', 'trending-up-outline', 'shield-outline', 'time-outline',
  'wallet-outline', 'rocket-outline', 'heart-outline', 'star-outline', 'flag-outline',
];

export default function ConfigPortfoliosScreen(props) {
  var navigation = props.navigation;
  var user = useAuth().user;

  var _portfolios = useState([]); var portfolios = _portfolios[0]; var setPortfolios = _portfolios[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _counts = useState({}); var counts = _counts[0]; var setCounts = _counts[1];
  var _editing = useState(null); var editing = _editing[0]; var setEditing = _editing[1];
  var _editName = useState(''); var editName = _editName[0]; var setEditName = _editName[1];
  var _editColor = useState(C.accent); var editColor = _editColor[0]; var setEditColor = _editColor[1];
  var _editIcon = useState('briefcase-outline'); var editIcon = _editIcon[0]; var setEditIcon = _editIcon[1];
  var _adding = useState(false); var adding = _adding[0]; var setAdding = _adding[1];
  var _saving = useState(false); var saving = _saving[0]; var setSaving = _saving[1];
  var _editOpContas = useState(true); var editOpContas = _editOpContas[0]; var setEditOpContas = _editOpContas[1];
  var _backups = useState([]); var backups = _backups[0]; var setBackups = _backups[1];
  var _restoring = useState(null); var restoring = _restoring[0]; var setRestoring = _restoring[1];

  var load = async function() {
    if (!user) return;
    setLoading(true);
    try {
      var res = await getPortfolios(user.id);
      var list = res.data || [];
      setPortfolios(list);

      // Count operations per portfolio
      var opsRes = await getOperacoes(user.id);
      var ops = opsRes.data || [];
      var cMap = {};
      for (var i = 0; i < list.length; i++) {
        cMap[list[i].id] = 0;
      }
      cMap['_none'] = 0;
      for (var j = 0; j < ops.length; j++) {
        var pid = ops[j].portfolio_id;
        if (pid && cMap[pid] !== undefined) {
          cMap[pid] = cMap[pid] + 1;
        } else {
          cMap['_none'] = cMap['_none'] + 1;
        }
      }
      setCounts(cMap);

      // Load backups
      var bkRes = await getPortfolioBackups(user.id);
      setBackups(bkRes.data || []);
    } catch (e) {
      console.warn('ConfigPortfolios load error:', e);
    }
    setLoading(false);
  };

  useFocusEffect(useCallback(function() {
    load();
  }, [user]));

  var handleAdd = async function() {
    Keyboard.dismiss();
    if (portfolios.length >= 4) {
      Alert.alert('Limite atingido', 'Máximo de 4 portfolios (+ Padrão).');
      return;
    }
    if (!editName || !editName.trim()) {
      Alert.alert('Nome obrigatório', 'Informe um nome para o portfolio.');
      return;
    }
    setSaving(true);
    var result = await addPortfolio(user.id, {
      nome: editName.trim(),
      cor: editColor,
      icone: editIcon,
      ordem: portfolios.length,
      operacoes_contas: editOpContas,
    });
    setSaving(false);
    if (result.error) {
      Alert.alert('Erro', result.error.message || 'Não foi possível criar o portfolio.');
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(function() {});
      Toast.show({ type: 'success', text1: 'Portfolio criado' });
      setAdding(false);
      setEditName('');
      setEditColor(C.accent);
      setEditIcon('briefcase-outline');
      setEditOpContas(true);
      load();
    }
  };

  var handleSaveEdit = async function() {
    Keyboard.dismiss();
    if (!editing) return;
    if (!editName || !editName.trim()) {
      Alert.alert('Nome obrigatório', 'Informe um nome para o portfolio.');
      return;
    }
    setSaving(true);
    var result = await updatePortfolio(user.id, editing, {
      nome: editName.trim(),
      cor: editColor,
      icone: editIcon,
      operacoes_contas: editOpContas,
    });
    setSaving(false);
    if (result.error) {
      Alert.alert('Erro', result.error.message || 'Não foi possível salvar.');
    } else {
      Toast.show({ type: 'success', text1: 'Portfolio atualizado' });
      setEditing(null);
      load();
    }
  };

  var doDelete = function(portfolioId, deleteData) {
    deletePortfolio(portfolioId, deleteData).then(function(res) {
      if (res.error) {
        Alert.alert('Erro', 'Não foi possível excluir.');
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(function() {});
        Toast.show({ type: 'success', text1: deleteData ? 'Portfolio e dados excluídos' : 'Portfolio excluído' });
        load();
      }
    });
  };

  var handleDelete = function(portfolio) {
    var count = counts[portfolio.id] || 0;
    if (count === 0) {
      Alert.alert('Excluir portfolio', 'Excluir "' + portfolio.nome + '"?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Excluir', style: 'destructive', onPress: function() { doDelete(portfolio.id, false); } },
      ]);
      return;
    }
    Alert.alert(
      'Excluir "' + portfolio.nome + '"',
      count + ' operações encontradas neste portfolio. O que fazer com elas?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Mover para Padrão', onPress: function() { doDelete(portfolio.id, false); } },
        { text: 'Excluir tudo', style: 'destructive', onPress: function() {
          Alert.alert(
            'Confirmar exclusão total',
            'Todas as operações, opções, proventos, renda fixa, contas e cartões deste portfolio serão excluídos permanentemente. Essa ação não pode ser desfeita.',
            [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Excluir permanentemente', style: 'destructive', onPress: function() { doDelete(portfolio.id, true); } },
            ]
          );
        }},
      ]
    );
  };

  var startEdit = function(p) {
    setAdding(false);
    setEditing(p.id);
    setEditName(p.nome);
    setEditColor(p.cor || C.accent);
    setEditIcon(p.icone || 'briefcase-outline');
    setEditOpContas(p.operacoes_contas !== false);
  };

  var startAdd = function() {
    setEditing(null);
    setAdding(true);
    setEditName('');
    setEditColor(C.accent);
    setEditIcon('briefcase-outline');
    setEditOpContas(true);
  };

  var cancelEdit = function() {
    setEditing(null);
    setAdding(false);
  };

  var handleRestore = function(backup) {
    if (portfolios.length >= 4) {
      Alert.alert('Limite atingido', 'Exclua um portfolio antes de restaurar.');
      return;
    }
    Alert.alert(
      'Restaurar "' + backup.portfolio_nome + '"?',
      'O portfolio e todos os seus dados serão restaurados.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Restaurar', onPress: function() {
          setRestoring(backup.id);
          restorePortfolioBackup(backup.id).then(function(res) {
            setRestoring(null);
            if (res.error) {
              Alert.alert('Erro', res.error.message || 'Falha ao restaurar.');
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(function() {});
              Toast.show({ type: 'success', text1: 'Portfolio restaurado' });
              load();
            }
          });
        }},
      ]
    );
  };

  var isEditorOpen = editing || adding;

  function renderEditor() {
    return (
      <Glass glow={editColor} padding={14} style={{ marginTop: 10 }}>
        <Text style={styles.editorTitle}>{adding ? 'Novo Portfolio' : 'Editar Portfolio'}</Text>
        <TextInput
          style={styles.nameInput}
          placeholder="Nome do portfolio"
          placeholderTextColor={C.dim}
          value={editName}
          onChangeText={setEditName}
          autoFocus
          maxLength={40}
        />

        <Text style={styles.pickerLabel}>COR</Text>
        <View style={styles.colorRow}>
          {COLORS.map(function(c) {
            return (
              <TouchableOpacity
                key={c}
                onPress={function() { setEditColor(c); }}
                style={[styles.colorDot, { backgroundColor: c }, editColor === c && styles.colorDotSelected]}
              />
            );
          })}
        </View>

        <Text style={styles.pickerLabel}>ÍCONE</Text>
        <View style={styles.iconRow}>
          {ICONS.map(function(ic) {
            return (
              <TouchableOpacity
                key={ic}
                onPress={function() { setEditIcon(ic); }}
                style={[styles.iconBtn, editIcon === ic && { backgroundColor: editColor + '33' }]}
              >
                <Ionicons name={ic} size={20} color={editIcon === ic ? editColor : C.dim} />
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={function() { setEditOpContas(!editOpContas); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border }}
        >
          <Ionicons name={editOpContas ? 'checkbox' : 'square-outline'} size={20} color={editOpContas ? editColor : C.dim} />
          <Text style={{ fontSize: 12, color: C.text, fontFamily: F.body, flex: 1 }}>
            Operações atualizam saldo da conta
          </Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body, marginTop: 4, marginLeft: 28 }}>
          {editOpContas ? 'Ao comprar/vender, o app perguntará se deseja atualizar o saldo.' : 'Operações não afetarão o saldo das contas automaticamente.'}
        </Text>

        <View style={styles.editorActions}>
          <TouchableOpacity onPress={cancelEdit} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={adding ? handleAdd : handleSaveEdit}
            disabled={saving}
            style={[styles.saveBtn, { backgroundColor: editColor }]}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveText}>{adding ? 'Criar' : 'Salvar'}</Text>
            )}
          </TouchableOpacity>
        </View>
      </Glass>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={function() { navigation.goBack(); }} accessibilityLabel="Voltar">
          <Ionicons name="chevron-back" size={28} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Portfolios</Text>
        <View style={{ minWidth: 28, alignItems: 'flex-end' }}>
          {!loading ? (
            <Text style={{ fontSize: 12, fontFamily: F.mono, color: portfolios.length >= 4 ? C.red : C.dim }}>{(portfolios.length + 1) + '/5'}</Text>
          ) : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator size="large" color={C.accent} style={{ marginTop: 40 }} />
        ) : (
          <View>
            {/* Info text */}
            <Text style={styles.infoText}>
              Organize seus investimentos em portfolios separados. Operações sem portfolio aparecem em "Padrão". Cada portfolio pode ter suas próprias contas.
            </Text>

            {/* Portfolio list */}
            {portfolios.map(function(p) {
              var count = counts[p.id] || 0;
              var isEditingThis = editing === p.id;
              return (
                <SwipeableRow key={p.id} onDelete={function() { handleDelete(p); }}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={function() { startEdit(p); }}
                  >
                    <Glass padding={14} style={{ marginBottom: 8 }}>
                      <View style={styles.cardRow}>
                        <View style={[styles.iconCircle, { backgroundColor: (p.cor || C.accent) + '22' }]}>
                          <Ionicons name={p.icone || 'briefcase-outline'} size={20} color={p.cor || C.accent} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cardName}>{p.nome}</Text>
                          <Text style={styles.cardCount}>{count + ' operações'}</Text>
                        </View>
                        <View style={[styles.colorIndicator, { backgroundColor: p.cor || C.accent }]} />
                      </View>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={function() {
                          var newVal = p.operacoes_contas === false ? true : false;
                          updatePortfolio(user.id, p.id, { operacoes_contas: newVal }).then(function() {
                            Toast.show({ type: 'success', text1: newVal ? 'Operações de conta ativadas' : 'Operações de conta desativadas' });
                            load();
                          }).catch(function() {});
                        }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border }}
                      >
                        <Ionicons name={p.operacoes_contas !== false ? 'checkbox' : 'square-outline'} size={18} color={p.operacoes_contas !== false ? (p.cor || C.accent) : C.dim} />
                        <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.body, flex: 1 }}>
                          {p.operacoes_contas !== false ? 'Operações atualizam saldo da conta' : 'Operações não afetam saldo da conta'}
                        </Text>
                      </TouchableOpacity>
                    </Glass>
                  </TouchableOpacity>
                </SwipeableRow>
              );
            })}

            {/* None-portfolio info */}
            {(counts['_none'] || 0) > 0 ? (
              <View style={styles.noneInfo}>
                <Ionicons name="information-circle-outline" size={14} color={C.dim} />
                <Text style={styles.noneText}>
                  {(counts['_none'] || 0) + ' operações no portfolio Padrão'}
                </Text>
              </View>
            ) : null}

            {/* Editor (inline) */}
            {isEditorOpen ? renderEditor() : null}

            {/* Add button — max 4 portfolios */}
            {!isEditorOpen && portfolios.length < 4 ? (
              <TouchableOpacity onPress={startAdd} style={styles.addBtn}>
                <Ionicons name="add-circle-outline" size={20} color={C.accent} />
                <Text style={styles.addText}>Adicionar portfolio</Text>
              </TouchableOpacity>
            ) : !isEditorOpen && portfolios.length >= 4 ? (
              <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.body, textAlign: 'center', marginTop: 14 }}>
                Limite de 4 portfolios atingido (+ Padrão)
              </Text>
            ) : null}

            {/* Backups disponíveis */}
            {backups.length > 0 ? (
              <View style={{ marginTop: 20 }}>
                <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginBottom: 8 }}>BACKUPS (30 DIAS)</Text>
                {backups.map(function(bk) {
                  var delDate = new Date(bk.deleted_at);
                  var expDate = new Date(bk.expires_at);
                  var diasRestantes = Math.max(0, Math.ceil((expDate.getTime() - Date.now()) / 86400000));
                  var dateStr = (delDate.getDate() < 10 ? '0' : '') + delDate.getDate() + '/' + (delDate.getMonth() < 9 ? '0' : '') + (delDate.getMonth() + 1) + '/' + delDate.getFullYear();
                  return (
                    <View key={bk.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: C.border }}>
                      <Ionicons name="archive-outline" size={18} color={C.etfs} />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={{ fontSize: 13, fontFamily: F.body, color: C.text }}>{bk.portfolio_nome}</Text>
                        <Text style={{ fontSize: 10, fontFamily: F.body, color: C.dim }}>{'Excluído em ' + dateStr + ' · ' + diasRestantes + 'd restantes'}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={function() { handleRestore(bk); }}
                        disabled={restoring === bk.id}
                        style={{ backgroundColor: C.green + '22', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}
                      >
                        {restoring === bk.id ? (
                          <ActivityIndicator size="small" color={C.green} />
                        ) : (
                          <Text style={{ fontSize: 11, fontFamily: F.display, color: C.green }}>Restaurar</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            ) : null}
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
  infoText: {
    fontSize: 12, color: C.dim, fontFamily: F.body, marginBottom: 14, lineHeight: 18,
  },

  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconCircle: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
  },
  cardName: { fontSize: 14, fontFamily: F.display, color: C.text },
  cardCount: { fontSize: 11, fontFamily: F.mono, color: C.dim, marginTop: 2 },
  colorIndicator: { width: 8, height: 8, borderRadius: 4 },

  noneInfo: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 4,
  },
  noneText: { fontSize: 11, color: C.dim, fontFamily: F.body },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, marginTop: 10,
    borderWidth: 1, borderColor: C.accent + '44', borderRadius: SIZE.radius,
    borderStyle: 'dashed',
  },
  addText: { fontSize: 14, color: C.accent, fontFamily: F.body },

  editorTitle: { fontSize: 14, fontFamily: F.display, color: C.text, marginBottom: 10 },
  nameInput: {
    height: 44, backgroundColor: C.bg, borderRadius: 10, paddingHorizontal: 14,
    fontSize: 14, fontFamily: F.body, color: C.text, borderWidth: 1, borderColor: C.border,
  },
  pickerLabel: {
    fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8,
    marginTop: 12, marginBottom: 6,
  },
  colorRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  colorDot: {
    width: 28, height: 28, borderRadius: 14,
  },
  colorDotSelected: {
    borderWidth: 2.5, borderColor: C.text,
  },
  iconRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
  },
  editorActions: {
    flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14,
  },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  cancelText: { fontSize: 13, color: C.dim, fontFamily: F.body },
  saveBtn: {
    paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10,
  },
  saveText: { fontSize: 13, color: '#fff', fontFamily: F.display },
});
