import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Keyboard,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { useFocusEffect } from '@react-navigation/native';
import { C, F, SIZE } from '../../theme';
import { Glass, Pill, Badge, SectionLabel } from '../../components';
import { useAuth } from '../../contexts/AuthContext';
import { addRecorrente, addMovimentacaoComSaldo, getSaldos } from '../../services/database';
import { getSymbol } from '../../services/currencyService';
var finCats = require('../../constants/financeCategories');
var BUDGET_GROUPS = finCats.BUDGET_GROUPS;
var SUBCATS_SAIDA = finCats.SUBCATS_SAIDA;
var SUBCATS_ENTRADA = finCats.SUBCATS_ENTRADA;

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseVal(str) {
  return parseFloat((str || '').replace(/\./g, '').replace(',', '.')) || 0;
}

var FREQUENCIAS = [
  { k: 'semanal', l: 'Semanal' },
  { k: 'quinzenal', l: 'Quinzenal' },
  { k: 'mensal', l: 'Mensal' },
  { k: 'anual', l: 'Anual' },
];

// All expense groups (for saída) — excludes investimento, renda, outro
var GRUPOS_SAIDA = [];
for (var gsi = 0; gsi < BUDGET_GROUPS.length; gsi++) {
  GRUPOS_SAIDA.push(BUDGET_GROUPS[gsi]);
}

// Income groups (for entrada)
var GRUPOS_ENTRADA = [
  { k: 'renda', l: 'Renda', icon: 'wallet-outline', color: '#22C55E' },
];

function calcProximas(proximo, frequencia, dia, count) {
  var results = [];
  var current = proximo;
  for (var i = 0; i < count; i++) {
    results.push(current);
    var parts = current.split('-');
    var dt = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    if (frequencia === 'semanal') {
      dt.setDate(dt.getDate() + 7);
    } else if (frequencia === 'quinzenal') {
      dt.setDate(dt.getDate() + 15);
    } else if (frequencia === 'mensal') {
      dt.setMonth(dt.getMonth() + 1);
      if (dia) {
        var max = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
        dt.setDate(Math.min(dia, max));
      }
    } else if (frequencia === 'anual') {
      dt.setFullYear(dt.getFullYear() + 1);
    }
    current = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
  }
  return results;
}

function formatDateBr(dataStr) {
  if (!dataStr) return '—';
  var parts = dataStr.substring(0, 10).split('-');
  if (parts.length !== 3) return dataStr;
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

function todayIso() {
  var now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
}

function calcProximoVencimento(frequencia, dia) {
  var now = new Date();
  var year = now.getFullYear();
  var month = now.getMonth();
  var today = now.getDate();

  if (frequencia === 'mensal') {
    var d = dia || 1;
    // If day already passed this month, go to next month
    if (today > d) {
      month = month + 1;
      if (month > 11) { month = 0; year = year + 1; }
    }
    var maxDay = new Date(year, month + 1, 0).getDate();
    d = Math.min(d, maxDay);
    return year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  if (frequencia === 'semanal') {
    var dayOfWeek = dia || 1; // 1=monday, 7=sunday
    var curr = now.getDay() || 7; // convert sunday=0 to 7
    var diff = dayOfWeek - curr;
    if (diff <= 0) diff = diff + 7;
    var target = new Date(now);
    target.setDate(today + diff);
    return target.getFullYear() + '-' + String(target.getMonth() + 1).padStart(2, '0') + '-' + String(target.getDate()).padStart(2, '0');
  }
  if (frequencia === 'quinzenal') {
    var target2 = new Date(now);
    target2.setDate(today + 15);
    return target2.getFullYear() + '-' + String(target2.getMonth() + 1).padStart(2, '0') + '-' + String(target2.getDate()).padStart(2, '0');
  }
  if (frequencia === 'anual') {
    var d2 = dia || 1;
    // Use current month, or next year if already passed
    var tryDate = new Date(year, month, d2);
    if (tryDate <= now) {
      tryDate = new Date(year + 1, month, d2);
    }
    return tryDate.getFullYear() + '-' + String(tryDate.getMonth() + 1).padStart(2, '0') + '-' + String(tryDate.getDate()).padStart(2, '0');
  }
  return todayIso();
}

export default function AddRecorrenteScreen(props) {
  var navigation = props.navigation;
  var user = useAuth().user;

  var _tipo = useState('saida'); var tipo = _tipo[0]; var setTipo = _tipo[1];
  var _grupo = useState(''); var grupo = _grupo[0]; var setGrupo = _grupo[1];
  var _subcategoria = useState(''); var subcategoria = _subcategoria[0]; var setSubcategoria = _subcategoria[1];
  var _conta = useState(''); var conta = _conta[0]; var setConta = _conta[1];
  var _contaMoeda = useState('BRL'); var contaMoeda = _contaMoeda[0]; var setContaMoeda = _contaMoeda[1];
  var _valor = useState(''); var valor = _valor[0]; var setValor = _valor[1];
  var _descricao = useState(''); var descricao = _descricao[0]; var setDescricao = _descricao[1];
  var _frequencia = useState('mensal'); var frequencia = _frequencia[0]; var setFrequencia = _frequencia[1];
  var _dia = useState(''); var dia = _dia[0]; var setDia = _dia[1];
  var _saving = useState(false); var saving = _saving[0]; var setSaving = _saving[1];
  var _submitted = useState(false); var submitted = _submitted[0]; var setSubmitted = _submitted[1];
  var _saldos = useState([]); var saldos = _saldos[0]; var setSaldos = _saldos[1];

  useFocusEffect(useCallback(function() {
    if (!user) return;
    getSaldos(user.id).then(function(r) { setSaldos(r.data || []); });
  }, [user]));

  // beforeRemove guard
  useEffect(function() {
    return navigation.addListener('beforeRemove', function(e) {
      if (submitted) return;
      if (!valor && !descricao && !grupo) return;
      e.preventDefault();
      Alert.alert('Descartar alterações?', 'Você tem dados não salvos.', [
        { text: 'Continuar editando', style: 'cancel' },
        { text: 'Descartar', style: 'destructive', onPress: function() { navigation.dispatch(e.data.action); } },
      ]);
    });
  }, [navigation, submitted, valor, descricao, grupo]);

  function onChangeVal(t) {
    var nums = t.replace(/[^0-9]/g, '');
    if (!nums) { setValor(''); return; }
    var reais = (parseInt(nums) / 100).toFixed(2);
    var parts = reais.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    setValor(parts[0] + ',' + parts[1]);
  }

  function switchTipo(newTipo) {
    setTipo(newTipo);
    setGrupo('');
    setSubcategoria('');
  }

  function selectGrupo(g) {
    setGrupo(g);
    setSubcategoria('');
  }

  // Get subcategories for selected grupo
  function getSubcats() {
    var source = tipo === 'saida' ? SUBCATS_SAIDA : SUBCATS_ENTRADA;
    for (var i = 0; i < source.length; i++) {
      if (source[i].grupo === grupo) return source[i].items;
    }
    return [];
  }

  // Map grupo + subcategoria to legacy categoria
  function resolveCategoria() {
    if (tipo === 'entrada') {
      if (grupo === 'renda') return 'salario';
      return 'deposito';
    }
    // saida: map to despesa_fixa or despesa_variavel based on grupo
    var fixos = ['moradia', 'servicos', 'seguros', 'educacao', 'saude'];
    if (fixos.indexOf(grupo) >= 0) return 'despesa_fixa';
    return 'despesa_variavel';
  }

  var valorNum = parseVal(valor);
  var diaNum = parseInt(dia) || 0;
  var canSubmit = grupo && valorNum > 0 && conta && frequencia;

  // Dia validation
  var diaMax = frequencia === 'semanal' ? 7 : 31;
  var diaLabel = frequencia === 'semanal' ? 'DIA DA SEMANA (1=Seg ... 7=Dom)' : 'DIA DO VENCIMENTO (1-31)';
  var diaPlaceholder = frequencia === 'semanal' ? '1-7' : '1-31';

  // Preview next dates
  var proxVenc = '';
  if (diaNum > 0 && diaNum <= diaMax) {
    proxVenc = calcProximoVencimento(frequencia, diaNum);
  } else if (diaNum === 0) {
    proxVenc = todayIso();
  }
  var proximas = proxVenc ? calcProximas(proxVenc, frequencia, diaNum, 3) : [];

  // Available grupos
  var grupos = tipo === 'saida' ? GRUPOS_SAIDA : GRUPOS_ENTRADA;

  var handleSubmit = async function() {
    Keyboard.dismiss();
    if (!canSubmit || submitted || saving) return;
    setSubmitted(true);
    setSaving(true);
    try {
      var finalDia = diaNum > 0 ? Math.min(diaNum, diaMax) : 1;
      var finalProximo = calcProximoVencimento(frequencia, finalDia);
      var cat = resolveCategoria();

      var result = await addRecorrente(user.id, {
        tipo: tipo,
        categoria: cat,
        subcategoria: subcategoria || null,
        conta: conta,
        valor: valorNum,
        descricao: descricao || null,
        frequencia: frequencia,
        dia_vencimento: finalDia,
        proximo_vencimento: finalProximo,
        ativo: true,
      });

      if (result.error) {
        Alert.alert('Erro', result.error.message || 'Falha ao salvar.');
        setSubmitted(false);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Ask if user wants to create first movimentação now
        Alert.alert(
          'Recorrente criada!',
          'Deseja criar a primeira movimentação agora?',
          [
            {
              text: 'Não, só salvar',
              onPress: function() {
                Toast.show({ type: 'success', text1: 'Recorrente criada', visibilityTime: 2000 });
                navigation.goBack();
              },
            },
            {
              text: 'Sim, criar agora',
              onPress: function() {
                var autoDesc = descricao || finCats.getCatLabel(cat);
                if (subcategoria) {
                  autoDesc = finCats.getSubcatLabel(subcategoria);
                }
                addMovimentacaoComSaldo(user.id, {
                  conta: conta,
                  tipo: tipo,
                  categoria: cat,
                  subcategoria: subcategoria || null,
                  valor: valorNum,
                  descricao: autoDesc + ' (recorrente)',
                  data: todayIso(),
                }).then(function(movResult) {
                  if (movResult && movResult.error) {
                    Alert.alert('Aviso', 'Recorrente salva, mas a movimentação falhou: ' + (movResult.error.message || ''));
                  } else {
                    Toast.show({ type: 'success', text1: 'Recorrente + movimentação criadas', visibilityTime: 2500 });
                  }
                  navigation.goBack();
                }).catch(function() {
                  Toast.show({ type: 'success', text1: 'Recorrente criada (movimentação falhou)', visibilityTime: 2500 });
                  navigation.goBack();
                });
              },
            },
          ]
        );
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
        <Text style={styles.title}>Nova Recorrente</Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Tipo: Entrada / Saída */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          onPress={function() { switchTipo('entrada'); }}
          style={[styles.toggleBtn, tipo === 'entrada' && { backgroundColor: '#22C55E18', borderColor: '#22C55E40' }]}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: tipo === 'entrada' ? C.green : C.dim }}>ENTRADA</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={function() { switchTipo('saida'); }}
          style={[styles.toggleBtn, tipo === 'saida' && { backgroundColor: '#EF444418', borderColor: '#EF444440' }]}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: tipo === 'saida' ? C.red : C.dim }}>SAÍDA</Text>
        </TouchableOpacity>
      </View>

      {/* Grupo */}
      <Text style={styles.label}>CATEGORIA *</Text>
      <View style={styles.grupoGrid}>
        {grupos.map(function(g) {
          var isActive = grupo === g.k;
          return (
            <TouchableOpacity key={g.k} activeOpacity={0.7}
              onPress={function() { selectGrupo(g.k); }}
              style={[styles.grupoCard, isActive && { borderColor: g.color + '80', backgroundColor: g.color + '14' }]}>
              <View style={[styles.grupoIconWrap, { backgroundColor: g.color + (isActive ? '28' : '14') }]}>
                <Ionicons name={g.icon} size={16} color={isActive ? g.color : C.dim} />
              </View>
              <Text style={[styles.grupoLabel, isActive && { color: g.color }]} numberOfLines={1}>{g.l}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Subcategoria (if grupo selected and has subcats) */}
      {grupo && subcats.length > 0 ? (
        <Glass padding={12}>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name={grupoMeta ? grupoMeta.icon : 'ellipse-outline'} size={14} color={grupoMeta ? grupoMeta.color : C.dim} />
              <Text style={{ fontSize: 11, fontFamily: F.mono, color: grupoMeta ? grupoMeta.color : C.dim, fontWeight: '600', letterSpacing: 0.5 }}>
                {(grupoMeta ? grupoMeta.label : grupo).toUpperCase()}
              </Text>
            </View>
            <View style={styles.pillRow}>
              <Pill active={!subcategoria} color={grupoMeta ? grupoMeta.color : C.accent}
                onPress={function() { setSubcategoria(''); }}>
                Geral
              </Pill>
              {subcats.map(function(sc) {
                return (
                  <Pill key={sc.k} active={subcategoria === sc.k} color={grupoMeta ? grupoMeta.color : C.accent}
                    onPress={function() { setSubcategoria(sc.k); }}>
                    {sc.l}
                  </Pill>
                );
              })}
            </View>
          </View>
        </Glass>
      ) : null}

      {/* Conta */}
      <Text style={styles.label}>CONTA *</Text>
      {saldos.length > 0 ? (
        <View style={styles.pillRow}>
          {saldos.map(function(s) {
            var sName = s.corretora || s.name || '';
            var sMoeda = s.moeda || 'BRL';
            var pillLabel = sMoeda !== 'BRL' ? sName + ' (' + sMoeda + ')' : sName;
            return (
              <Pill key={s.id} active={conta === sName} color={C.accent}
                onPress={function() { setConta(sName); setContaMoeda(sMoeda); }}>
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

      {/* Valor */}
      <Text style={styles.label}>{'VALOR (' + getSymbol(contaMoeda) + ') *'}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 14, color: C.sub, fontFamily: F.mono }}>{getSymbol(contaMoeda)}</Text>
        <TextInput
          value={valor}
          onChangeText={onChangeVal}
          placeholder="0,00"
          placeholderTextColor={C.dim}
          keyboardType="numeric"
          style={[styles.input, { flex: 1 }, valorNum > 0 && { borderColor: C.green }]}
        />
      </View>

      {/* Descrição */}
      <Text style={styles.label}>DESCRIÇÃO</Text>
      <TextInput
        value={descricao}
        onChangeText={setDescricao}
        placeholder="Ex: Aluguel apartamento"
        placeholderTextColor={C.dim}
        style={styles.input}
      />

      {/* Frequência */}
      <Text style={styles.label}>FREQUÊNCIA *</Text>
      <View style={styles.pillRow}>
        {FREQUENCIAS.map(function(f) {
          return (
            <Pill key={f.k} active={frequencia === f.k} color={C.accent}
              onPress={function() { setFrequencia(f.k); setDia(''); }}>
              {f.l}
            </Pill>
          );
        })}
      </View>

      {/* Dia do vencimento */}
      <Text style={styles.label}>{diaLabel}</Text>
      <TextInput
        value={dia}
        onChangeText={function(t) {
          var nums = t.replace(/[^0-9]/g, '');
          if (nums.length > 2) nums = nums.substring(0, 2);
          setDia(nums);
        }}
        placeholder={diaPlaceholder}
        placeholderTextColor={C.dim}
        keyboardType="numeric"
        maxLength={2}
        returnKeyType="done"
        style={[styles.input, { width: 80 }]}
      />
      {diaNum > diaMax && diaNum > 0 ? (
        <Text style={styles.fieldError}>{'Máximo: ' + diaMax}</Text>
      ) : null}
      {frequencia === 'semanal' && diaNum > 0 && diaNum <= 7 ? (
        <Text style={styles.diaHint}>
          {['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'][diaNum]}
        </Text>
      ) : null}

      {/* Preview next 3 dates */}
      {proximas.length > 0 && valorNum > 0 ? (
        <Glass padding={12}>
          <Text style={styles.previewTitle}>PRÓXIMAS OCORRÊNCIAS</Text>
          {proximas.map(function(d, idx) {
            return (
              <View key={idx} style={styles.previewRow}>
                <View style={styles.previewDot} />
                <Text style={styles.previewDate}>{formatDateBr(d)}</Text>
                <Text style={[styles.previewValue, { color: tipo === 'entrada' ? C.green : C.red }]}>
                  {(tipo === 'entrada' ? '+' : '-') + getSymbol(contaMoeda) + ' ' + fmt(valorNum)}
                </Text>
              </View>
            );
          })}
        </Glass>
      ) : null}

      {/* Submit */}
      <TouchableOpacity
        onPress={handleSubmit}
        disabled={!canSubmit || saving}
        activeOpacity={0.8}
        style={[styles.submitBtn, (!canSubmit || saving) && { opacity: 0.4 }]}
        accessibilityRole="button"
        accessibilityLabel="Criar Recorrente"
      >
        {saving ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.submitText}>Criar Recorrente</Text>
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
  label: { fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginTop: 4 },
  input: {
    backgroundColor: C.cardSolid, borderWidth: 1, borderColor: C.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: C.text, fontFamily: F.body,
  },
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggleBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: C.border,
    alignItems: 'center', backgroundColor: C.cardSolid,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  grupoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  grupoCard: {
    width: '30%', flexGrow: 1, minWidth: 95, maxWidth: '32%',
    paddingVertical: 10, paddingHorizontal: 8,
    borderRadius: 10, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.cardSolid, alignItems: 'center', gap: 5,
  },
  grupoIconWrap: {
    width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
  },
  grupoLabel: {
    fontSize: 10, fontFamily: F.body, color: C.sub, fontWeight: '600', textAlign: 'center',
  },
  fieldError: { fontSize: 11, color: C.red, fontFamily: F.mono, marginTop: 2 },
  diaHint: { fontSize: 11, color: C.sub, fontFamily: F.body, marginTop: 2 },
  previewTitle: {
    fontSize: 10, color: C.dim, fontFamily: F.mono,
    letterSpacing: 0.8, marginBottom: 8,
  },
  previewRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 4,
  },
  previewDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent,
  },
  previewDate: { fontSize: 13, color: C.text, fontFamily: F.mono, flex: 1 },
  previewValue: { fontSize: 13, fontWeight: '700', fontFamily: F.mono },
  submitBtn: {
    backgroundColor: C.accent, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  submitText: { fontSize: 15, fontWeight: '700', color: 'white', fontFamily: F.display },
});
