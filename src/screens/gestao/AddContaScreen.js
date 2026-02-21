import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard,
} from 'react-native';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { upsertSaldo, addMovimentacao, buildMovDescricao } from '../../services/database';
import { Glass, Pill } from '../../components';
import { MOEDAS, getSymbol } from '../../services/currencyService';
import * as Haptics from 'expo-haptics';

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

var TIPOS = [
  { k: 'corretora', l: 'Corretora' },
  { k: 'banco', l: 'Banco' },
  { k: 'outro', l: 'Outro' },
];

var SUGESTOES = ['Clear', 'XP Investimentos', 'Rico', 'Inter', 'Nubank', 'BTG Pactual', 'Genial', 'Banco do Brasil', 'Itaú', 'Bradesco'];

// Moedas principais para exibir como pills
var MOEDAS_PRINCIPAIS = ['BRL', 'USD', 'EUR', 'GBP', 'QAR'];

export default function AddContaScreen(props) {
  var navigation = props.navigation;
  var user = useAuth().user;

  var _nome = useState(''); var nome = _nome[0]; var setNome = _nome[1];
  var _tipo = useState('corretora'); var tipo = _tipo[0]; var setTipo = _tipo[1];
  var _moeda = useState('BRL'); var moeda = _moeda[0]; var setMoeda = _moeda[1];
  var _saldo = useState(''); var saldoInit = _saldo[0]; var setSaldoInit = _saldo[1];
  var _loading = useState(false); var loading = _loading[0]; var setLoading = _loading[1];
  var _submitted = useState(false); var submitted = _submitted[0]; var setSubmitted = _submitted[1];
  var _showAllMoedas = useState(false); var showAllMoedas = _showAllMoedas[0]; var setShowAllMoedas = _showAllMoedas[1];

  function onChangeSaldo(t) {
    var nums = t.replace(/\D/g, '');
    if (nums === '') { setSaldoInit(''); return; }
    var centavos = parseInt(nums);
    var reais = (centavos / 100).toFixed(2);
    var parts = reais.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    setSaldoInit(parts[0] + ',' + parts[1]);
  }

  function parseSaldo() {
    return parseFloat((saldoInit || '').replace(/\./g, '').replace(',', '.')) || 0;
  }

  var canSubmit = nome.trim().length >= 2;
  var nomeValid = nome.trim().length >= 2;
  var nomeError = nome.length > 0 && nome.trim().length < 2;

  useEffect(function() {
    return navigation.addListener('beforeRemove', function(e) {
      if (submitted) return;
      if (!nome) return;
      e.preventDefault();
      Alert.alert('Descartar alterações?', 'Você tem dados não salvos.', [
        { text: 'Continuar editando', style: 'cancel' },
        { text: 'Descartar', style: 'destructive', onPress: function() { navigation.dispatch(e.data.action); } },
      ]);
    });
  }, [navigation, submitted, nome]);

  var handleSubmit = async function() {
    Keyboard.dismiss();
    if (!canSubmit || submitted) return;
    setSubmitted(true);
    setLoading(true);
    try {
      var nomeNorm = nome.toUpperCase().trim();
      var saldoNum = parseSaldo();

      var result = await upsertSaldo(user.id, {
        corretora: nomeNorm,
        saldo: saldoNum,
        moeda: moeda,
      });

      if (result.error) {
        Alert.alert('Erro', result.error.message || 'Falha ao criar conta.');
        setSubmitted(false);
      } else {
        // Log initial deposit if saldo > 0
        if (saldoNum > 0) {
          await addMovimentacao(user.id, {
            conta: nomeNorm,
            tipo: 'entrada',
            categoria: 'deposito',
            valor: saldoNum,
            descricao: buildMovDescricao('deposito', null, 'Saldo inicial'),
            saldo_apos: saldoNum,
            data: new Date().toISOString().substring(0, 10),
          });
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Sucesso!', 'Conta ' + nomeNorm + ' criada.', [
          { text: 'OK', onPress: function() { navigation.goBack(); } },
        ]);
      }
    } catch (err) {
      Alert.alert('Erro', 'Falha ao salvar.');
      setSubmitted(false);
    }
    setLoading(false);
  };

  // Moedas a exibir
  var moedasVisiveis = showAllMoedas ? MOEDAS : MOEDAS.filter(function(m) {
    return MOEDAS_PRINCIPAIS.indexOf(m.code) !== -1;
  });

  var simbolo = getSymbol(moeda);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <View style={styles.header}>
        <TouchableOpacity onPress={function() { navigation.goBack(); }}>
          <Text style={styles.back}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Nova Conta</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Nome */}
      <Text style={styles.label}>NOME DA CONTA *</Text>
      <TextInput
        value={nome}
        onChangeText={setNome}
        placeholder="Ex: Clear, Nubank..."
        placeholderTextColor={C.dim}
        autoFocus={true}
        returnKeyType="next"
        style={[styles.input,
          nomeValid && { borderColor: C.green },
          nomeError && { borderColor: C.red },
        ]}
      />
      {nomeError ? <Text style={styles.fieldError}>Mínimo 2 caracteres</Text> : null}

      {/* Sugestões */}
      <Text style={styles.label}>SUGESTÕES</Text>
      <View style={styles.pillRow}>
        {SUGESTOES.map(function(s) {
          return (
            <Pill key={s} active={nome.toUpperCase() === s.toUpperCase()} color={C.accent}
              onPress={function() { setNome(s); }}>
              {s}
            </Pill>
          );
        })}
      </View>

      {/* Tipo */}
      <Text style={styles.label}>TIPO</Text>
      <View style={styles.pillRow}>
        {TIPOS.map(function(t) {
          return (
            <Pill key={t.k} active={tipo === t.k} color={C.acoes}
              onPress={function() { setTipo(t.k); }}>
              {t.l}
            </Pill>
          );
        })}
      </View>

      {/* Moeda */}
      <Text style={styles.label}>MOEDA</Text>
      <View style={styles.pillRow}>
        {moedasVisiveis.map(function(m) {
          return (
            <Pill key={m.code} active={moeda === m.code} color={C.etfs}
              onPress={function() { setMoeda(m.code); }}>
              {m.symbol + ' ' + m.code}
            </Pill>
          );
        })}
        {!showAllMoedas ? (
          <TouchableOpacity onPress={function() { setShowAllMoedas(true); }} activeOpacity={0.7}>
            <Text style={{ fontSize: 11, color: C.accent, fontFamily: F.body, paddingVertical: 6 }}>+ Outras</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Saldo inicial */}
      <Text style={styles.label}>SALDO INICIAL (OPCIONAL)</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 14, color: C.sub, fontFamily: F.mono }}>{simbolo}</Text>
        <TextInput
          value={saldoInit}
          onChangeText={onChangeSaldo}
          placeholder="0,00"
          placeholderTextColor={C.dim}
          keyboardType="decimal-pad"
          returnKeyType="done"
          style={[styles.input, { flex: 1 }]}
        />
      </View>

      {/* Submit */}
      <TouchableOpacity onPress={handleSubmit} disabled={!canSubmit || loading} activeOpacity={0.8}
        style={[styles.submitBtn, !canSubmit && { opacity: 0.4 }]}>
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.submitText}>Criar Conta</Text>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  back: { fontSize: 28, color: C.accent, fontWeight: '300' },
  title: { fontSize: 18, fontWeight: '800', color: C.text, fontFamily: F.display },
  label: { fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginTop: 4 },
  input: {
    backgroundColor: C.cardSolid, borderWidth: 1, borderColor: C.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: C.text, fontFamily: F.body,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  submitBtn: { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  submitText: { fontSize: 15, fontWeight: '700', color: 'white', fontFamily: F.display },
  fieldError: { fontSize: 11, color: C.red, fontFamily: F.mono, marginTop: 2 },
});
