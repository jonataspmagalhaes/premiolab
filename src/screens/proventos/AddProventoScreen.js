import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { addProvento, getUserCorretoras } from '../../services/database';
import { Glass, Pill, Badge } from '../../components';
import * as Haptics from 'expo-haptics';

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmt4(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

var TIPOS = [
  { key: 'dividendo', label: 'Dividendo', color: C.fiis },
  { key: 'jcp', label: 'JCP', color: C.acoes },
  { key: 'rendimento', label: 'Rendimento', color: C.etfs },
  { key: 'juros_rf', label: 'Juros RF', color: C.rf },
  { key: 'amortizacao', label: 'Amortização', color: C.yellow },
  { key: 'bonificacao', label: 'Bonificação', color: C.opcoes },
];

var CORRETORAS_DEFAULT = ['Clear', 'XP Investimentos', 'Rico', 'Inter', 'Nubank', 'BTG Pactual', 'Genial'];

function maskDate(text) {
  var clean = text.replace(/[^0-9]/g, '');
  if (clean.length <= 2) return clean;
  if (clean.length <= 4) return clean.slice(0, 2) + '/' + clean.slice(2);
  return clean.slice(0, 2) + '/' + clean.slice(2, 4) + '/' + clean.slice(4, 8);
}

function brToIso(br) {
  var parts = br.split('/');
  if (parts.length !== 3 || parts[2].length !== 4) return null;
  return parts[2] + '-' + parts[1] + '-' + parts[0];
}

function isValidDate(br) {
  var iso = brToIso(br);
  if (!iso) return false;
  var d = new Date(iso + 'T12:00:00');
  return !isNaN(d.getTime());
}

function todayBR() {
  var d = new Date();
  var dd = String(d.getDate()).padStart(2, '0');
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var yyyy = d.getFullYear();
  return dd + '/' + mm + '/' + yyyy;
}

export default function AddProventoScreen(props) {
  var navigation = props.navigation;
  var user = useAuth().user;

  var _tipo = useState('dividendo'); var tipo = _tipo[0]; var setTipo = _tipo[1];
  var _ticker = useState(''); var ticker = _ticker[0]; var setTicker = _ticker[1];
  var _valor = useState(''); var valor = _valor[0]; var setValor = _valor[1];
  var _qtd = useState(''); var qtd = _qtd[0]; var setQtd = _qtd[1];
  var _data = useState(todayBR()); var data = _data[0]; var setData = _data[1];
  var _corretora = useState(''); var corretora = _corretora[0]; var setCorretora = _corretora[1];
  var _corretoras = useState(CORRETORAS_DEFAULT); var corretoras = _corretoras[0]; var setCorretoras = _corretoras[1];
  var _loading = useState(false); var loading = _loading[0]; var setLoading = _loading[1];
  var _submitted = useState(false); var submitted = _submitted[0]; var setSubmitted = _submitted[1];

  useEffect(function() {
    if (!user) return;
    getUserCorretoras(user.id).then(function(result) {
      var list = result.data || [];
      if (list.length > 0) {
        var names = [];
        for (var i = 0; i < list.length; i++) {
          names.push(list[i].name);
        }
        setCorretoras(names);
      }
    });
  }, [user]);

  var valorNum = parseFloat(valor) || 0;
  var qtdNum = parseInt(qtd) || 0;
  var valorPorCota = qtdNum > 0 ? valorNum / qtdNum : 0;

  var canSubmit = ticker.length >= 4 && valorNum > 0 && isValidDate(data);

  var tickerValid = ticker.length >= 4;
  var tickerError = ticker.length > 0 && ticker.length < 4;
  var valorValid = valorNum > 0;
  var valorError = valor.length > 0 && valorNum <= 0;
  var dateValid = data.length === 10 && isValidDate(data);
  var dateError = data.length === 10 && !isValidDate(data);

  var tipoLabel = TIPOS.filter(function(t) { return t.key === tipo; })[0];

  var handleSubmit = async function() {
    if (!canSubmit || !user || submitted) return;
    setSubmitted(true);
    setLoading(true);
    try {
      var isoDate = brToIso(data);
      var payload = {
        tipo: tipo,
        ticker: ticker.toUpperCase(),
        data_pagamento: isoDate,
      };
      if (qtdNum > 0) {
        payload.quantidade = qtdNum;
        payload.valor_por_cota = parseFloat(valorPorCota.toFixed(4));
      } else {
        payload.quantidade = 1;
        payload.valor_por_cota = valorNum;
      }
      if (corretora) {
        payload.corretora = corretora;
      }
      var result = await addProvento(user.id, payload);
      if (result.error) {
        Alert.alert('Erro', result.error.message);
        setSubmitted(false);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Sucesso!', 'Provento registrado.', [
          {
            text: 'Adicionar outro',
            onPress: function() {
              setTicker('');
              setValor('');
              setQtd('');
              setData(todayBR());
              setSubmitted(false);
            },
          },
          { text: 'Concluir', onPress: function() { navigation.goBack(); } },
        ]);
      }
    } catch (err) {
      Alert.alert('Erro', 'Falha ao salvar. Tente novamente.');
      setSubmitted(false);
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <View style={styles.header}>
        <TouchableOpacity onPress={function() { navigation.goBack(); }}>
          <Text style={styles.back}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Novo Provento</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Tipo */}
      <Text style={styles.label}>TIPO DE PROVENTO</Text>
      <View style={styles.pillRow}>
        {TIPOS.map(function(t) {
          return (
            <Pill key={t.key} active={tipo === t.key} color={t.color} onPress={function() { setTipo(t.key); }}>
              {t.label}
            </Pill>
          );
        })}
      </View>

      {/* Ticker */}
      <Text style={styles.label}>TICKER *</Text>
      <TextInput
        value={ticker}
        onChangeText={function(t) { setTicker(t.toUpperCase()); }}
        placeholder="Ex: PETR4"
        placeholderTextColor={C.dim}
        autoCapitalize="characters"
        returnKeyType="next"
        style={[styles.input,
          tickerValid && { borderColor: C.green },
          tickerError && { borderColor: C.red },
        ]}
      />
      {tickerError ? <Text style={styles.fieldError}>Mínimo 4 caracteres</Text> : null}

      {/* Valor + Qtd */}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>VALOR TOTAL (R$) *</Text>
          <TextInput
            value={valor}
            onChangeText={setValor}
            placeholder="150.00"
            placeholderTextColor={C.dim}
            keyboardType="decimal-pad"
            style={[styles.input,
              valorValid && { borderColor: C.green },
              valorError && { borderColor: C.red },
            ]}
          />
          {valorError ? <Text style={styles.fieldError}>Deve ser maior que 0</Text> : null}
        </View>
        <View style={{ width: 12 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>QUANTIDADE (opc.)</Text>
          <TextInput
            value={qtd}
            onChangeText={setQtd}
            placeholder="100"
            placeholderTextColor={C.dim}
            keyboardType="numeric"
            style={styles.input}
          />
        </View>
      </View>

      {/* Valor por cota */}
      {valorNum > 0 && qtdNum > 0 && (
        <Glass padding={12}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>VALOR POR COTA</Text>
            <Text style={styles.infoValue}>{'R$ ' + fmt4(valorPorCota)}</Text>
          </View>
        </Glass>
      )}

      {/* Data */}
      <Text style={styles.label}>DATA PAGAMENTO *</Text>
      <TextInput
        value={data}
        onChangeText={function(t) { setData(maskDate(t)); }}
        placeholder="DD/MM/AAAA"
        placeholderTextColor={C.dim}
        keyboardType="numeric"
        maxLength={10}
        returnKeyType="done"
        style={[styles.input,
          dateValid && { borderColor: C.green },
          dateError && { borderColor: C.red },
        ]}
      />
      {dateError ? <Text style={styles.fieldError}>Data inválida</Text> : null}

      {/* Corretora */}
      <Text style={styles.label}>CORRETORA</Text>
      <View style={styles.pillRow}>
        {corretoras.map(function(c) {
          return (
            <Pill key={c} active={corretora === c} color={C.acoes} onPress={function() {
              setCorretora(corretora === c ? '' : c);
            }}>
              {c}
            </Pill>
          );
        })}
      </View>

      {/* Preview */}
      {canSubmit && (
        <Glass glow={tipoLabel ? tipoLabel.color : C.fiis} padding={14}>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Badge text={tipo.toUpperCase()} color={tipoLabel ? tipoLabel.color : C.fiis} />
            <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.body }}>
              {ticker + ' — ' + data + (corretora ? ' — ' + corretora : '')}
            </Text>
            <Text style={{ fontSize: 24, fontWeight: '800', color: C.green, fontFamily: F.display }}>
              {'+ R$ ' + fmt(valorNum)}
            </Text>
          </View>
        </Glass>
      )}

      {/* Submit */}
      <TouchableOpacity
        onPress={handleSubmit}
        disabled={!canSubmit || loading}
        activeOpacity={0.8}
        style={[styles.submitBtn, !canSubmit && { opacity: 0.4 }]}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.submitText}>Registrar Provento</Text>
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
  row: { flexDirection: 'row' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  infoLabel: { fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 },
  infoValue: { fontSize: 16, fontWeight: '700', color: C.text, fontFamily: F.display },
  submitBtn: { backgroundColor: C.fiis, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  submitText: { fontSize: 15, fontWeight: '700', color: 'white', fontFamily: F.display },
  fieldError: { fontSize: 11, color: C.red, fontFamily: F.mono, marginTop: 2 },
});
