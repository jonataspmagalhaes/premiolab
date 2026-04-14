import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Keyboard, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getCartoes, getSaldos, getGastosRapidos, saveGastosRapidos } from '../../services/database';
import { getSymbol } from '../../services/currencyService';
import { Glass, Pill, SectionLabel, Field } from '../../components';
import widgetBridge from '../../services/widgetBridge';
import * as databaseModule from '../../services/database';
import * as currencyServiceModule from '../../services/currencyService';
var finCats = require('../../constants/financeCategories');
var FINANCE_GROUPS = finCats.FINANCE_GROUPS;
var SUBCATS_SAIDA = finCats.SUBCATS_SAIDA;

// Expense groups (excluding investimento, renda, outro)
var EXPENSE_GROUPS = [];
for (var egi = 0; egi < FINANCE_GROUPS.length; egi++) {
  var fg = FINANCE_GROUPS[egi];
  if (fg.k !== 'investimento' && fg.k !== 'renda' && fg.k !== 'outro') {
    EXPENSE_GROUPS.push(fg);
  }
}
// Add outro at the end
EXPENSE_GROUPS.push({ k: 'outro', l: 'Outro', icon: 'ellipse-outline', color: '#555577' });

var ICON_GRID = [
  'restaurant-outline', 'cafe-outline', 'car-outline', 'bus-outline',
  'cart-outline', 'film-outline', 'musical-notes-outline', 'airplane-outline',
  'bed-outline', 'fitness-outline', 'medkit-outline', 'school-outline',
  'shirt-outline', 'cut-outline', 'paw-outline', 'game-controller-outline',
  'gift-outline', 'home-outline', 'construct-outline', 'ellipsis-horizontal-outline',
];

function onChangeValor(raw, setValor) {
  var clean = raw.replace(/[^0-9]/g, '');
  if (!clean) { setValor(''); return; }
  var num = parseInt(clean, 10);
  var reais = (num / 100).toFixed(2);
  var parts = reais.split('.');
  var intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  setValor(intPart + ',' + parts[1]);
}

function parseBR(str) {
  if (!str) return 0;
  return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
}

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AddGastoRapidoScreen(props) {
  var navigation = props.navigation;
  var route = props.route;
  var user = useAuth().user;

  var editPreset = route && route.params && route.params.preset;
  var presetCartaoId = route && route.params && route.params.presetCartaoId;
  var isEdit = !!editPreset;

  var _label = useState(editPreset ? (editPreset.label || '') : '');
  var label = _label[0]; var setLabel = _label[1];

  var _valor = useState(editPreset ? (editPreset.valor ? fmt(editPreset.valor) : '') : '');
  var valor = _valor[0]; var setValor = _valor[1];

  var _cartaoId = useState(editPreset ? (editPreset.cartao_id || null) : (presetCartaoId || null));
  var cartaoId = _cartaoId[0]; var setCartaoId = _cartaoId[1];

  var _cartaoLabel = useState('');
  var cartaoLabel = _cartaoLabel[0]; var setCartaoLabel = _cartaoLabel[1];

  var _cartoes = useState([]);
  var cartoes = _cartoes[0]; var setCartoes = _cartoes[1];

  var _grupo = useState(editPreset ? (editPreset.grupo || '') : '');
  var grupo = _grupo[0]; var setGrupo = _grupo[1];

  var _subcategoria = useState(editPreset ? (editPreset.subcategoria || '') : '');
  var subcategoria = _subcategoria[0]; var setSubcategoria = _subcategoria[1];

  var _icone = useState(editPreset ? (editPreset.icone || 'restaurant-outline') : 'restaurant-outline');
  var icone = _icone[0]; var setIcone = _icone[1];

  var _meioPagamento = useState(editPreset ? (editPreset.meio_pagamento || 'credito') : 'credito');
  var meioPagamento = _meioPagamento[0]; var setMeioPagamento = _meioPagamento[1];

  var _contaNome = useState(editPreset ? (editPreset.conta || '') : '');
  var contaNome = _contaNome[0]; var setContaNome = _contaNome[1];

  var _contaMoeda = useState(editPreset ? (editPreset.conta_moeda || 'BRL') : 'BRL');
  var contaMoeda = _contaMoeda[0]; var setContaMoeda = _contaMoeda[1];

  var _saldos = useState([]);
  var saldos = _saldos[0]; var setSaldos = _saldos[1];

  var _submitted = useState(false);
  var submitted = _submitted[0]; var setSubmitted = _submitted[1];

  var _saving = useState(false);
  var saving = _saving[0]; var setSaving = _saving[1];

  var _presets = useState([]);
  var presets = _presets[0]; var setPresets = _presets[1];

  // Fetch cartoes and existing presets on focus
  useFocusEffect(useCallback(function() {
    if (!user) return;
    var profilePromise = databaseModule.getProfile(user.id);
    getCartoes(user.id).then(function(res) {
      var data = res.data || [];
      setCartoes(data);

      // Validate that editPreset cartão still exists
      if (editPreset && editPreset.cartao_id) {
        var cartaoExists = false;
        for (var vi = 0; vi < data.length; vi++) {
          if (data[vi].id === editPreset.cartao_id) { cartaoExists = true; break; }
        }
        if (!cartaoExists) {
          setCartaoId(null);
          setCartaoLabel('');
          Toast.show({ type: 'info', text1: 'Cartão removido', text2: 'Selecione outro cartão' });
        }
      }

      // Priority: editPreset.cartao_id > presetCartaoId > profile.cartao_principal > first card
      profilePromise.then(function(profileRes) {
        var principal = profileRes.data && profileRes.data.cartao_principal;
        var effectiveId = cartaoId;

        if (!effectiveId && principal) {
          // Check principal exists in card list
          for (var pi = 0; pi < data.length; pi++) {
            if (data[pi].id === principal) {
              effectiveId = principal;
              break;
            }
          }
        }
        if (!effectiveId && data.length === 1) {
          effectiveId = data[0].id;
        }

        if (effectiveId) {
          setCartaoId(effectiveId);
          for (var ci = 0; ci < data.length; ci++) {
            if (data[ci].id === effectiveId) {
              var cLabel = (data[ci].apelido || data[ci].bandeira.toUpperCase()) + ' ••' + data[ci].ultimos_digitos;
              setCartaoLabel(cLabel);
              break;
            }
          }
        }
      }).catch(function() {});
    });
    getGastosRapidos(user.id).then(function(res) {
      setPresets(res.data || []);
    });
    getSaldos(user.id).then(function(res) {
      setSaldos(res.data || []);
    });
  }, [user]));

  // beforeRemove guard
  useEffect(function() {
    return navigation.addListener('beforeRemove', function(e) {
      if (submitted) return;
      if (!label && !valor && !grupo) return;
      e.preventDefault();
      Alert.alert('Descartar alterações?', 'Você tem dados não salvos.', [
        { text: 'Continuar editando', style: 'cancel' },
        { text: 'Descartar', style: 'destructive', onPress: function() { navigation.dispatch(e.data.action); } },
      ]);
    });
  }, [navigation, submitted, label, valor, grupo]);

  function handleChangeValor(raw) {
    onChangeValor(raw, setValor);
  }

  function selectGrupo(g) {
    setGrupo(g);
    setSubcategoria('');
  }

  // Get subcategories for selected grupo
  function getSubcats() {
    for (var i = 0; i < SUBCATS_SAIDA.length; i++) {
      if (SUBCATS_SAIDA[i].grupo === grupo) return SUBCATS_SAIDA[i].items;
    }
    return [];
  }

  // Resolve legacy categoria from grupo
  function resolveCategoria() {
    var fixos = ['moradia', 'servicos', 'seguros', 'educacao', 'saude'];
    if (fixos.indexOf(grupo) >= 0) return 'despesa_fixa';
    return 'despesa_variavel';
  }

  var valorNum = parseBR(valor);
  var canSubmitCartao = label.trim().length > 0 && valorNum > 0 && cartaoId;
  var canSubmitConta = label.trim().length > 0 && valorNum > 0 && contaNome;
  var canSubmit = meioPagamento === 'credito' ? canSubmitCartao : canSubmitConta;

  // Get moeda for prefix
  var cardMoeda = 'BRL';
  if (cartaoId && cartoes.length > 0) {
    for (var ci2 = 0; ci2 < cartoes.length; ci2++) {
      if (cartoes[ci2].id === cartaoId) {
        cardMoeda = cartoes[ci2].moeda || 'BRL';
        break;
      }
    }
  }
  var currSymbol = getSymbol(meioPagamento === 'credito' ? cardMoeda : contaMoeda);

  var handleSubmit = async function() {
    Keyboard.dismiss();
    if (!canSubmit || submitted || saving) return;
    setSubmitted(true);
    setSaving(true);
    try {
      var updatedPresets = [];
      for (var pi = 0; pi < presets.length; pi++) {
        updatedPresets.push(presets[pi]);
      }

      var usaConta = meioPagamento === 'pix' || meioPagamento === 'debito';
      var presetData = {
        id: isEdit ? editPreset.id : (Date.now().toString() + '_' + Math.random().toString(36).substring(2, 8)),
        label: label.trim(),
        valor: valorNum,
        meio_pagamento: meioPagamento,
        cartao_id: meioPagamento === 'credito' ? cartaoId : null,
        cartao_label: meioPagamento === 'credito' ? cartaoLabel : null,
        conta: usaConta ? contaNome : null,
        conta_moeda: usaConta ? contaMoeda : null,
        grupo: grupo || null,
        subcategoria: subcategoria || null,
        categoria: grupo ? resolveCategoria() : 'despesa_variavel',
        icone: icone,
      };

      if (isEdit) {
        // Find and replace existing preset
        var found = false;
        for (var ui = 0; ui < updatedPresets.length; ui++) {
          if (updatedPresets[ui].id === editPreset.id) {
            updatedPresets[ui] = presetData;
            found = true;
            break;
          }
        }
        if (!found) {
          updatedPresets.push(presetData);
        }
      } else {
        updatedPresets.push(presetData);
      }

      var result = await saveGastosRapidos(user.id, updatedPresets);

      if (result && result.error) {
        Alert.alert('Erro', result.error.message || 'Falha ao salvar.');
        setSubmitted(false);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Toast.show({
          type: 'success',
          text1: isEdit ? 'Gasto rápido atualizado' : 'Gasto rápido criado',
          visibilityTime: 2000,
        });
        widgetBridge.updateWidgetFromContext(user.id, databaseModule, currencyServiceModule).catch(function() {});
        navigation.goBack();
      }
    } catch (err) {
      Alert.alert('Erro', 'Falha ao salvar. Tente novamente.');
      setSubmitted(false);
    }
    setSaving(false);
  };

  var subcats = getSubcats();
  var grupoMeta = grupo ? finCats.getGrupoMeta(grupo) : null;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={function() { navigation.goBack(); }} accessibilityLabel="Voltar" accessibilityRole="button">
          <Ionicons name="chevron-back" size={28} color={C.accent} />
        </TouchableOpacity>
        <Text style={styles.title}>{isEdit ? 'Editar Gasto Rápido' : 'Novo Gasto Rápido'}</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* NOME */}
      <Text style={styles.label}>NOME *</Text>
      <TextInput
        value={label}
        onChangeText={setLabel}
        placeholder="Ex: Almoço, Uber, Café"
        placeholderTextColor={C.dim}
        autoFocus={!isEdit}
        returnKeyType="next"
        style={[styles.input, label.trim().length > 0 && { borderColor: C.green }]}
      />

      {/* VALOR */}
      <Text style={styles.label}>{'VALOR (' + currSymbol + ') *'}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 14, color: C.sub, fontFamily: F.mono }}>{currSymbol}</Text>
        <TextInput
          value={valor}
          onChangeText={handleChangeValor}
          placeholder="0,00"
          placeholderTextColor={C.dim}
          keyboardType="decimal-pad"
          returnKeyType="next"
          style={[styles.input, { flex: 1 }, valorNum > 0 && { borderColor: C.green }]}
        />
      </View>

      {/* MÉTODO DE PAGAMENTO */}
      <SectionLabel>MÉTODO *</SectionLabel>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        <Pill active={meioPagamento === 'credito'} color={C.accent}
          onPress={function() { setMeioPagamento('credito'); }}>
          Cartão
        </Pill>
        <Pill active={meioPagamento === 'debito'} color={C.rf}
          onPress={function() { setMeioPagamento('debito'); }}>
          Débito
        </Pill>
        <Pill active={meioPagamento === 'pix'} color={C.green}
          onPress={function() { setMeioPagamento('pix'); }}>
          PIX
        </Pill>
      </View>

      {/* CARTÃO (quando método = cartão) */}
      {meioPagamento === 'credito' ? (
        <View>
          <SectionLabel>CARTÃO *</SectionLabel>
          {cartoes.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {cartoes.map(function(c) {
                  var cLabel = (c.apelido || c.bandeira.toUpperCase()) + ' ••' + c.ultimos_digitos;
                  var cMoeda = c.moeda || 'BRL';
                  return (
                    <Pill key={c.id} active={cartaoId === c.id} color={C.accent}
                      onPress={function() {
                        setCartaoId(c.id);
                        setCartaoLabel(cLabel);
                      }}>
                      {cMoeda !== 'BRL' ? cLabel + ' (' + cMoeda + ')' : cLabel}
                    </Pill>
                  );
                })}
              </View>
            </ScrollView>
          ) : (
            <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body }}>
              Nenhum cartão cadastrado. Cadastre um cartão primeiro.
            </Text>
          )}
        </View>
      ) : null}

      {/* CONTA (quando método = PIX ou Débito) */}
      {meioPagamento === 'pix' || meioPagamento === 'debito' ? (
        <View>
          <SectionLabel>CONTA *</SectionLabel>
          {saldos.length > 0 ? (
            <View style={styles.pillRow}>
              {saldos.map(function(s) {
                var sName = s.corretora || s.name || '';
                var sMoeda = s.moeda || 'BRL';
                var pillLabel = sMoeda !== 'BRL' ? sName + ' (' + sMoeda + ')' : sName;
                return (
                  <Pill key={s.id} active={contaNome === sName && contaMoeda === sMoeda} color={C.green}
                    onPress={function() { setContaNome(sName); setContaMoeda(sMoeda); }}>
                    {pillLabel}
                  </Pill>
                );
              })}
            </View>
          ) : (
            <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body }}>
              Nenhuma conta cadastrada. Crie uma conta primeiro.
            </Text>
          )}
        </View>
      ) : null}

      {/* CATEGORIA */}
      <SectionLabel>CATEGORIA</SectionLabel>
      <View style={styles.pillRow}>
        {EXPENSE_GROUPS.map(function(g) {
          return (
            <Pill key={g.k} active={grupo === g.k} color={g.color}
              onPress={function() { selectGrupo(g.k); }}>
              {g.l}
            </Pill>
          );
        })}
      </View>

      {/* SUBCATEGORIA */}
      {grupo && subcats.length > 0 ? (
        <View>
          <SectionLabel>SUBCATEGORIA</SectionLabel>
          <View style={styles.pillRow}>
            <Pill active={!subcategoria} color={grupoMeta ? grupoMeta.color : C.accent}
              onPress={function() { setSubcategoria(''); }}>
              Geral
            </Pill>
            {subcats.map(function(sc) {
              return (
                <Pill key={sc.k} active={subcategoria === sc.k}
                  color={grupoMeta ? grupoMeta.color : C.accent}
                  onPress={function() { setSubcategoria(sc.k); }}>
                  {sc.l}
                </Pill>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* ÍCONE */}
      <SectionLabel>ÍCONE</SectionLabel>
      <View style={styles.iconGrid}>
        {ICON_GRID.map(function(ic) {
          var isSelected = icone === ic;
          return (
            <TouchableOpacity
              key={ic}
              onPress={function() { setIcone(ic); }}
              activeOpacity={0.7}
              style={[
                styles.iconCircle,
                isSelected && { borderColor: C.accent, backgroundColor: C.accent + '22' },
              ]}
              accessibilityLabel={'Ícone ' + ic.replace('-outline', '')}
              accessibilityRole="button"
            >
              <Ionicons name={ic} size={22} color={isSelected ? C.accent : C.sub} />
            </TouchableOpacity>
          );
        })}
      </View>

      {/* PREVIEW */}
      {label.trim().length > 0 || valorNum > 0 ? (
        <Glass padding={14}>
          <Text style={styles.previewHeader}>PREVIEW</Text>
          <View style={styles.previewCard}>
            <View style={[styles.previewIconWrap, { backgroundColor: (grupoMeta ? grupoMeta.color : C.accent) + '22' }]}>
              <Ionicons name={icone} size={24} color={grupoMeta ? grupoMeta.color : C.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.previewLabel} numberOfLines={1}>
                {label.trim() || 'Nome do gasto'}
              </Text>
              {meioPagamento === 'pix' && contaNome ? (
                <Text style={styles.previewCartao} numberOfLines={1}>{'PIX · ' + contaNome}</Text>
              ) : meioPagamento === 'debito' && contaNome ? (
                <Text style={styles.previewCartao} numberOfLines={1}>{'Débito · ' + contaNome}</Text>
              ) : cartaoLabel ? (
                <Text style={styles.previewCartao} numberOfLines={1}>{cartaoLabel}</Text>
              ) : null}
            </View>
            <Text style={styles.previewValor}>
              {currSymbol + ' ' + (valorNum > 0 ? fmt(valorNum) : '0,00')}
            </Text>
          </View>
        </Glass>
      ) : null}

      {/* BOTÃO SALVAR */}
      <TouchableOpacity
        onPress={handleSubmit}
        disabled={!canSubmit || saving}
        activeOpacity={0.8}
        style={[styles.submitBtn, (!canSubmit || saving) && { opacity: 0.4 }]}
        accessibilityRole="button"
        accessibilityLabel={isEdit ? 'Salvar alterações' : 'Salvar gasto rápido'}
      >
        {saving ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.submitText}>Salvar</Text>
        )}
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 10 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 8,
  },
  title: { fontSize: 18, fontWeight: '800', color: C.text, fontFamily: F.display },
  label: {
    fontSize: 10, color: C.dim, fontFamily: F.mono,
    letterSpacing: 0.8, marginTop: 4,
  },
  input: {
    backgroundColor: C.cardSolid, borderWidth: 1, borderColor: C.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: C.text, fontFamily: F.body,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
    justifyContent: 'flex-start',
  },
  iconCircle: {
    width: 48, height: 48, borderRadius: 24,
    borderWidth: 1.5, borderColor: C.border,
    backgroundColor: C.cardSolid,
    alignItems: 'center', justifyContent: 'center',
  },
  previewHeader: {
    fontSize: 10, color: C.dim, fontFamily: F.mono,
    letterSpacing: 0.8, marginBottom: 10,
  },
  previewCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  previewIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  previewLabel: {
    fontSize: 15, fontWeight: '700', color: C.text, fontFamily: F.display,
  },
  previewCartao: {
    fontSize: 11, color: C.sub, fontFamily: F.mono, marginTop: 2,
  },
  previewValor: {
    fontSize: 16, fontWeight: '700', color: C.red,
    fontFamily: F.mono,
  },
  submitBtn: {
    backgroundColor: C.accent, borderRadius: SIZE.radius,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  submitText: {
    fontSize: 15, fontWeight: '700', color: 'white', fontFamily: F.display,
  },
});
