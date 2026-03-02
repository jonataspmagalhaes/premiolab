import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Switch, Alert, ActivityIndicator, Keyboard,
  KeyboardAvoidingView, Platform, Modal, FlatList,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { useFocusEffect } from '@react-navigation/native';
import { C, F, SIZE } from '../../theme';
import { Glass, InfoTip, Pill } from '../../components';
import { useAuth } from '../../contexts/AuthContext';
import { getOrcamentos, upsertOrcamentos } from '../../services/database';
import { MOEDAS, ALL_CURRENCIES, getSymbol, fetchExchangeRates, convertToBRL } from '../../services/currencyService';
var finCats = require('../../constants/financeCategories');
var BUDGET_GROUPS = finCats.BUDGET_GROUPS;

// Moedas rapidas para Pills
var QUICK_CURRENCIES = ['BRL', 'USD', 'EUR', 'GBP', 'QAR'];

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseVal(str) {
  return parseFloat((str || '').replace(/\./g, '').replace(',', '.')) || 0;
}

function numToMasked(n) {
  if (!n && n !== 0) return '';
  var fixed = n.toFixed(2);
  var parts = fixed.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return parts[0] + ',' + parts[1];
}

export default function OrcamentoScreen(props) {
  var navigation = props.navigation;
  var user = useAuth().user;

  // budgets: array of { grupo, valStr, ativo, moeda }
  var _budgets = useState([]); var budgets = _budgets[0]; var setBudgets = _budgets[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _saving = useState(false); var saving = _saving[0]; var setSaving = _saving[1];
  var _dirty = useState(false); var dirty = _dirty[0]; var setDirty = _dirty[1];
  var _initial = useState(null); var initial = _initial[0]; var setInitial = _initial[1];
  var _moedaGlobal = useState('BRL'); var moedaGlobal = _moedaGlobal[0]; var setMoedaGlobal = _moedaGlobal[1];
  var _rates = useState(null); var rates = _rates[0]; var setRates = _rates[1];
  var _currencyModalIdx = useState(-1); var currencyModalIdx = _currencyModalIdx[0]; var setCurrencyModalIdx = _currencyModalIdx[1];
  var _currencySearch = useState(''); var currencySearch = _currencySearch[0]; var setCurrencySearch = _currencySearch[1];

  // Initialize budgets from BUDGET_GROUPS
  function initBudgets(existing) {
    var result = [];
    for (var i = 0; i < BUDGET_GROUPS.length; i++) {
      var g = BUDGET_GROUPS[i];
      var found = null;
      for (var j = 0; j < existing.length; j++) {
        if (existing[j].grupo === g.k) {
          found = existing[j];
          break;
        }
      }
      if (found) {
        result.push({
          grupo: g.k,
          valStr: found.valor_limite > 0 ? numToMasked(found.valor_limite) : '',
          ativo: found.ativo !== false,
          moeda: found.moeda || null,
        });
      } else {
        result.push({
          grupo: g.k,
          valStr: '',
          ativo: true,
          moeda: null,
        });
      }
    }
    return result;
  }

  // Detect moedaGlobal from existing data
  function detectGlobalCurrency(existing) {
    var counts = {};
    for (var i = 0; i < existing.length; i++) {
      var m = existing[i].moeda || 'BRL';
      counts[m] = (counts[m] || 0) + 1;
    }
    var best = 'BRL';
    var bestCount = 0;
    var keys = Object.keys(counts);
    for (var k = 0; k < keys.length; k++) {
      if (counts[keys[k]] > bestCount) {
        best = keys[k];
        bestCount = counts[keys[k]];
      }
    }
    return best;
  }

  useFocusEffect(useCallback(function() {
    if (!user) return;
    setLoading(true);
    getOrcamentos(user.id).then(function(r) {
      var data = r.data || [];
      var detected = detectGlobalCurrency(data);
      setMoedaGlobal(detected);
      var b = initBudgets(data);
      setBudgets(b);
      setInitial(JSON.stringify(b));
      setDirty(false);
      setLoading(false);
    }).catch(function() {
      var b = initBudgets([]);
      setBudgets(b);
      setInitial(JSON.stringify(b));
      setLoading(false);
    });
    // Fetch exchange rates for summary conversion
    fetchExchangeRates(['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'QAR', 'ARS']).then(function(r) {
      setRates(r);
    }).catch(function() {});
  }, [user]));

  // beforeRemove guard
  useEffect(function() {
    return navigation.addListener('beforeRemove', function(e) {
      if (!dirty) return;
      e.preventDefault();
      Alert.alert('Descartar alterações?', 'Você tem dados não salvos.', [
        { text: 'Continuar editando', style: 'cancel' },
        { text: 'Descartar', style: 'destructive', onPress: function() { navigation.dispatch(e.data.action); } },
      ]);
    });
  }, [navigation, dirty]);

  function updateBudget(index, field, value) {
    var updated = [];
    for (var i = 0; i < budgets.length; i++) {
      if (i === index) {
        var item = { grupo: budgets[i].grupo, valStr: budgets[i].valStr, ativo: budgets[i].ativo, moeda: budgets[i].moeda };
        item[field] = value;
        updated.push(item);
      } else {
        updated.push(budgets[i]);
      }
    }
    setBudgets(updated);
    setDirty(JSON.stringify(updated) !== initial);
  }

  function onChangeVal(index, t) {
    var nums = t.replace(/[^0-9]/g, '');
    if (!nums) {
      updateBudget(index, 'valStr', '');
      return;
    }
    var reais = (parseInt(nums) / 100).toFixed(2);
    var parts = reais.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    updateBudget(index, 'valStr', parts[0] + ',' + parts[1]);
  }

  function toggleAtivo(index) {
    updateBudget(index, 'ativo', !budgets[index].ativo);
  }

  function getEffectiveMoeda(b) {
    return b.moeda || moedaGlobal || 'BRL';
  }

  function handleGlobalCurrencyChange(code) {
    setMoedaGlobal(code);
    setDirty(true);
  }

  function handleRowCurrencyTap(index) {
    setCurrencyModalIdx(index);
    setCurrencySearch('');
  }

  function handleRowCurrencySelect(code) {
    var isGlobal = code === moedaGlobal;
    updateBudget(currencyModalIdx, 'moeda', isGlobal ? null : code);
    setCurrencyModalIdx(-1);
  }

  // Count active budgets with value + summary conversion
  var activeCount = 0;
  var totalLimitBRL = 0;
  var hasMixed = false;
  var allSameCurrency = true;
  var firstCurrency = null;
  for (var ci = 0; ci < budgets.length; ci++) {
    var v = parseVal(budgets[ci].valStr);
    if (v > 0 && budgets[ci].ativo) {
      activeCount++;
      var m = getEffectiveMoeda(budgets[ci]);
      if (firstCurrency === null) {
        firstCurrency = m;
      } else if (m !== firstCurrency) {
        allSameCurrency = false;
      }
      if (m === 'BRL') {
        totalLimitBRL += v;
      } else if (rates && rates[m]) {
        totalLimitBRL += v * rates[m];
        hasMixed = true;
      } else {
        totalLimitBRL += v;
        hasMixed = true;
      }
    }
  }

  var handleSave = async function() {
    Keyboard.dismiss();
    if (saving) return;
    setSaving(true);
    try {
      var toSave = [];
      for (var i = 0; i < budgets.length; i++) {
        var val = parseVal(budgets[i].valStr);
        if (val > 0) {
          toSave.push({
            grupo: budgets[i].grupo,
            valor_limite: val,
            ativo: budgets[i].ativo,
            moeda: getEffectiveMoeda(budgets[i]),
          });
        }
      }
      var result = await upsertOrcamentos(user.id, toSave);
      if (result.error) {
        Alert.alert('Erro', result.error.message || 'Falha ao salvar.');
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setDirty(false);
        setInitial(JSON.stringify(budgets));
        Toast.show({ type: 'success', text1: 'Orçamentos salvos', visibilityTime: 2000 });
        navigation.goBack();
      }
    } catch (err) {
      Alert.alert('Erro', 'Falha ao salvar. Tente novamente.');
    }
    setSaving(false);
  };

  function getGroupMeta(key) {
    for (var i = 0; i < BUDGET_GROUPS.length; i++) {
      if (BUDGET_GROUPS[i].k === key) return BUDGET_GROUPS[i];
    }
    return { k: key, l: key, icon: 'ellipse-outline', color: C.dim };
  }

  // Filtered currencies for modal
  function getFilteredCurrencies() {
    var q = currencySearch.toUpperCase().trim();
    if (!q) return MOEDAS;
    var result = [];
    for (var i = 0; i < ALL_CURRENCIES.length; i++) {
      var c = ALL_CURRENCIES[i];
      if (c.code.indexOf(q) >= 0 || c.name.toUpperCase().indexOf(q) >= 0) {
        result.push(c);
      }
      if (result.length >= 20) break;
    }
    return result;
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={C.accent} size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={function() { navigation.goBack(); }} accessibilityLabel="Voltar" accessibilityRole="button">
          <Ionicons name="chevron-back" size={28} color={C.accent} />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.title}>Orçamentos</Text>
          <InfoTip text={'Defina limites mensais de gastos por categoria. ' +
            'O app vai acompanhar seus gastos reais e avisar quando estiver ' +
            'perto ou acima do limite definido.\n\n' +
            'Escolha a moeda padrão no topo. Para usar uma moeda diferente ' +
            'em uma categoria específica, toque no símbolo da moeda ao lado do valor.'} />
        </View>
        <View style={{ width: 28 }} />
      </View>

      {/* Global currency picker */}
      <View style={{ marginBottom: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.sectionLabel}>MOEDA PADRÃO</Text>
          <InfoTip text={'A moeda padrão é aplicada a todas as categorias. ' +
            'Gastos são sempre registrados em BRL. Se o orçamento estiver em outra moeda, ' +
            'o app converte automaticamente pelo câmbio atual para comparar.'} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
          {QUICK_CURRENCIES.map(function(code) {
            var sym = getSymbol(code);
            var isActive = moedaGlobal === code;
            return (
              <Pill
                key={code}
                active={isActive}
                color={C.accent}
                onPress={function() { handleGlobalCurrencyChange(code); }}
              >{code + ' (' + sym + ')'}</Pill>
            );
          })}
          {/* Show current global if not in quick list */}
          {QUICK_CURRENCIES.indexOf(moedaGlobal) < 0 ? (
            <Pill active={true} color={C.accent} onPress={function() { setCurrencyModalIdx(-2); setCurrencySearch(''); }}>
              {moedaGlobal + ' (' + getSymbol(moedaGlobal) + ')'}
            </Pill>
          ) : null}
          <Pill active={false} color={C.dim} onPress={function() { setCurrencyModalIdx(-2); setCurrencySearch(''); }}>
            {'+ Outra'}
          </Pill>
        </View>
      </View>

      {/* Summary */}
      {activeCount > 0 ? (
        <Glass glow={C.accent} padding={14}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>LIMITE MENSAL TOTAL</Text>
            <View style={{ alignItems: 'flex-end' }}>
              {hasMixed || !allSameCurrency ? (
                <Text style={styles.summaryValue}>{'≈ R$ ' + fmt(totalLimitBRL)}</Text>
              ) : (
                <Text style={styles.summaryValue}>{getSymbol(firstCurrency || 'BRL') + ' ' + fmt(totalLimitBRL)}</Text>
              )}
            </View>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>CATEGORIAS ATIVAS</Text>
            <Text style={styles.summarySmall}>{activeCount + ' de ' + BUDGET_GROUPS.length}</Text>
          </View>
        </Glass>
      ) : null}

      {/* Budget rows */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={styles.sectionLabel}>LIMITES POR CATEGORIA</Text>
        <InfoTip text={'Defina o valor máximo que deseja gastar por mês em cada categoria. ' +
          'O switch ativa/desativa o monitoramento sem apagar o valor. ' +
          'Toque no símbolo da moeda (ex: R$) para usar uma moeda diferente da padrão nessa categoria.'} />
      </View>

      {budgets.map(function(b, index) {
        var meta = getGroupMeta(b.grupo);
        var val = parseVal(b.valStr);
        var hasValue = val > 0;
        var effMoeda = getEffectiveMoeda(b);
        var sym = getSymbol(effMoeda);
        var isOverride = b.moeda && b.moeda !== moedaGlobal;

        return (
          <View key={b.grupo} style={[styles.row, !b.ativo && { opacity: 0.5 }]}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconCircle, { backgroundColor: meta.color + '18' }]}>
                <Ionicons name={meta.icon} size={18} color={meta.color} />
              </View>
              <View style={styles.rowCenter}>
                <Text style={styles.rowLabel}>{meta.l}</Text>
                <View style={styles.inputRow}>
                  <TouchableOpacity
                    onPress={function() { handleRowCurrencyTap(index); }}
                    activeOpacity={0.7}
                    style={[styles.prefixBtn, isOverride && { backgroundColor: C.accent + '22', borderColor: C.accent + '40' }]}
                  >
                    <Text style={[styles.prefix, isOverride && { color: C.accent }]}>{sym}</Text>
                    <Ionicons name="chevron-down" size={10} color={isOverride ? C.accent : C.dim} />
                  </TouchableOpacity>
                  <TextInput
                    value={b.valStr}
                    onChangeText={function(t) { onChangeVal(index, t); }}
                    placeholder="0,00"
                    placeholderTextColor={C.dim}
                    keyboardType="numeric"
                    editable={b.ativo}
                    style={[styles.input, hasValue && { borderColor: meta.color + '40' }]}
                  />
                </View>
              </View>
            </View>
            <Switch
              value={b.ativo}
              onValueChange={function() { toggleAtivo(index); }}
              trackColor={{ false: C.border, true: meta.color + '40' }}
              thumbColor={b.ativo ? meta.color : C.dim}
              ios_backgroundColor={C.border}
            />
          </View>
        );
      })}

      {/* Hint */}
      <Text style={styles.hint}>
        Categorias sem valor definido não serão monitoradas. Desative o switch para pausar o acompanhamento sem apagar o valor. Toque no símbolo da moeda para usar uma moeda diferente da padrão.
      </Text>

      {/* Save button */}
      <TouchableOpacity
        onPress={handleSave}
        disabled={saving || !dirty}
        activeOpacity={0.8}
        style={[styles.submitBtn, (!dirty || saving) && { opacity: 0.4 }]}
        accessibilityRole="button"
        accessibilityLabel="Salvar Orçamentos"
      >
        {saving ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.submitText}>Salvar Orçamentos</Text>
        )}
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>

    {/* Currency picker modal — idx >= 0: per-category, idx === -2: global */}
    <Modal visible={currencyModalIdx >= 0 || currencyModalIdx === -2} animationType="slide" transparent={true}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{currencyModalIdx === -2 ? 'Moeda padrão' : 'Moeda'}</Text>
            <TouchableOpacity onPress={function() { setCurrencyModalIdx(-1); }}>
              <Ionicons name="close" size={24} color={C.text} />
            </TouchableOpacity>
          </View>

          {/* Use global option — only for per-category */}
          {currencyModalIdx >= 0 ? (
            <TouchableOpacity
              onPress={function() {
                updateBudget(currencyModalIdx, 'moeda', null);
                setCurrencyModalIdx(-1);
              }}
              style={styles.modalGlobalOption}
            >
              <Ionicons name="globe-outline" size={18} color={C.accent} />
              <Text style={{ fontSize: 14, color: C.accent, fontFamily: F.body, fontWeight: '600' }}>
                {'Usar padrão (' + moedaGlobal + ' ' + getSymbol(moedaGlobal) + ')'}
              </Text>
            </TouchableOpacity>
          ) : null}

          {/* Search */}
          <TextInput
            value={currencySearch}
            onChangeText={setCurrencySearch}
            placeholder="Buscar moeda..."
            placeholderTextColor={C.dim}
            autoFocus={true}
            style={styles.modalSearch}
          />

          {/* Currency list */}
          <FlatList
            data={getFilteredCurrencies()}
            keyExtractor={function(item) { return item.code; }}
            keyboardShouldPersistTaps="handled"
            renderItem={function(info) {
              var item = info.item;
              var isSelected = false;
              if (currencyModalIdx === -2) {
                isSelected = moedaGlobal === item.code;
              } else if (currencyModalIdx >= 0) {
                isSelected = getEffectiveMoeda(budgets[currencyModalIdx]) === item.code;
              }
              return (
                <TouchableOpacity
                  onPress={function() {
                    if (currencyModalIdx === -2) {
                      handleGlobalCurrencyChange(item.code);
                      setCurrencyModalIdx(-1);
                    } else {
                      handleRowCurrencySelect(item.code);
                    }
                  }}
                  style={[styles.modalCurrencyRow, isSelected && { backgroundColor: C.accent + '15' }]}
                >
                  <Text style={styles.modalCurrencyCode}>{item.code}</Text>
                  <Text style={styles.modalCurrencySymbol}>{item.symbol}</Text>
                  <Text style={styles.modalCurrencyName} numberOfLines={1}>{item.name}</Text>
                  {isSelected ? <Ionicons name="checkmark" size={18} color={C.accent} /> : null}
                </TouchableOpacity>
              );
            }}
            style={{ maxHeight: 300 }}
          />
        </View>
      </View>
    </Modal>

    </KeyboardAvoidingView>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 12 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 8,
  },
  title: { fontSize: 18, fontWeight: '800', color: C.text, fontFamily: F.display },
  sectionLabel: {
    fontSize: 10, color: C.dim, fontFamily: F.mono,
    letterSpacing: 0.8, marginTop: 8, marginBottom: 4,
  },
  summaryRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 2,
  },
  summaryLabel: { fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 },
  summaryValue: { fontSize: 18, fontWeight: '800', color: C.accent, fontFamily: F.display },
  summarySmall: { fontSize: 13, fontWeight: '600', color: C.text, fontFamily: F.mono },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.cardSolid, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, padding: 12, gap: 10,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  iconCircle: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  rowCenter: { flex: 1, gap: 4 },
  rowLabel: { fontSize: 13, fontWeight: '600', color: C.text, fontFamily: F.body },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  prefixBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 6, paddingVertical: 4,
    borderRadius: 6, borderWidth: 1, borderColor: 'transparent',
  },
  prefix: { fontSize: 13, color: C.sub, fontFamily: F.mono },
  input: {
    flex: 1, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
    fontSize: 14, color: C.text, fontFamily: F.mono,
  },
  hint: {
    fontSize: 11, color: C.dim, fontFamily: F.body,
    textAlign: 'center', marginTop: 4, lineHeight: 16,
  },
  submitBtn: {
    backgroundColor: C.accent, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  submitText: { fontSize: 15, fontWeight: '700', color: 'white', fontFamily: F.display },
  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: C.cardSolid, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: C.text, fontFamily: F.display },
  modalGlobalOption: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: C.accent + '10', borderRadius: 10,
    marginBottom: 12, borderWidth: 1, borderColor: C.accent + '25',
  },
  modalSearch: {
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: C.text, fontFamily: F.body,
    marginBottom: 8,
  },
  modalCurrencyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 8,
  },
  modalCurrencyCode: { fontSize: 14, fontWeight: '700', color: C.text, fontFamily: F.mono, width: 40 },
  modalCurrencySymbol: { fontSize: 14, color: C.sub, fontFamily: F.mono, width: 36 },
  modalCurrencyName: { fontSize: 13, color: C.dim, fontFamily: F.body, flex: 1 },
});
