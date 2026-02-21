import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getSaldos, addMovimentacaoComSaldo, buildMovDescricao } from '../../services/database';
import { Glass, Pill, Badge } from '../../components';
import * as Haptics from 'expo-haptics';

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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

function todayBr() {
  var now = new Date();
  var d = String(now.getDate()).padStart(2, '0');
  var m = String(now.getMonth() + 1).padStart(2, '0');
  var y = now.getFullYear();
  return d + '/' + m + '/' + y;
}

var CATEGORIAS_ENTRADA = [
  { k: 'deposito', l: 'Depósito', g: 'Outro' },
  { k: 'salario', l: 'Salário', g: 'Renda' },
  { k: 'venda_ativo', l: 'Venda ativo', g: 'Investimento' },
  { k: 'premio_opcao', l: 'Prêmio opção', g: 'Investimento' },
  { k: 'dividendo', l: 'Dividendo', g: 'Renda' },
  { k: 'jcp', l: 'JCP', g: 'Renda' },
  { k: 'rendimento_fii', l: 'Rend. FII', g: 'Renda' },
  { k: 'rendimento_rf', l: 'Rend. RF', g: 'Renda' },
  { k: 'ajuste_manual', l: 'Ajuste', g: 'Outro' },
  { k: 'outro', l: 'Outro', g: 'Outro' },
];

var CATEGORIAS_SAIDA = [
  { k: 'retirada', l: 'Retirada', g: 'Outro' },
  { k: 'compra_ativo', l: 'Compra ativo', g: 'Investimento' },
  { k: 'recompra_opcao', l: 'Recompra opção', g: 'Investimento' },
  { k: 'exercicio_opcao', l: 'Exercício opção', g: 'Investimento' },
  { k: 'despesa_fixa', l: 'Despesa fixa', g: 'Despesa' },
  { k: 'despesa_variavel', l: 'Despesa variável', g: 'Despesa' },
  { k: 'ajuste_manual', l: 'Ajuste', g: 'Outro' },
  { k: 'outro', l: 'Outro', g: 'Outro' },
];

export default function AddMovimentacaoScreen(props) {
  var navigation = props.navigation;
  var user = useAuth().user;

  var _tipo = useState('entrada'); var tipo = _tipo[0]; var setTipo = _tipo[1];
  var _cat = useState('deposito'); var categoria = _cat[0]; var setCategoria = _cat[1];
  var _conta = useState(''); var conta = _conta[0]; var setConta = _conta[1];
  var _valor = useState(''); var valor = _valor[0]; var setValor = _valor[1];
  var _desc = useState(''); var descricao = _desc[0]; var setDescricao = _desc[1];
  var _ticker = useState(''); var ticker = _ticker[0]; var setTicker = _ticker[1];
  var _data = useState(todayBr()); var data = _data[0]; var setData = _data[1];
  var _loading = useState(false); var loading = _loading[0]; var setLoading = _loading[1];
  var _submitted = useState(false); var submitted = _submitted[0]; var setSubmitted = _submitted[1];
  var _saldos = useState([]); var saldos = _saldos[0]; var setSaldos = _saldos[1];

  useFocusEffect(useCallback(function() {
    if (!user) return;
    getSaldos(user.id).then(function(r) { setSaldos(r.data || []); });
  }, [user]));

  function onChangeVal(t) {
    var nums = t.replace(/\D/g, '');
    if (nums === '') { setValor(''); return; }
    var centavos = parseInt(nums);
    var reais = (centavos / 100).toFixed(2);
    var parts = reais.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    setValor(parts[0] + ',' + parts[1]);
  }

  function parseVal() {
    return parseFloat((valor || '').replace(/\./g, '').replace(',', '.')) || 0;
  }

  var categorias = tipo === 'entrada' ? CATEGORIAS_ENTRADA : CATEGORIAS_SAIDA;
  var isoDate = data.length === 10 ? brToIso(data) : null;
  var valorNum = parseVal();
  var canSubmit = conta && valorNum > 0 && isoDate;

  var valorValid = valorNum > 0;
  var valorError = valor.length > 0 && valorNum <= 0;
  var dateValid = isoDate !== null;
  var dateError = data.length === 10 && isoDate === null;

  // Show ticker field for investment categories
  var showTicker = ['compra_ativo', 'venda_ativo', 'premio_opcao', 'recompra_opcao',
    'exercicio_opcao', 'dividendo', 'jcp', 'rendimento_fii'].indexOf(categoria) >= 0;

  var handleSubmit = async function() {
    if (!canSubmit || submitted) return;
    setSubmitted(true);
    setLoading(true);
    try {
      var autoDesc = descricao || buildMovDescricao(categoria, ticker || null, null);
      var result = await addMovimentacaoComSaldo(user.id, {
        conta: conta,
        tipo: tipo,
        categoria: categoria,
        valor: valorNum,
        descricao: autoDesc,
        ticker: ticker ? ticker.toUpperCase().trim() : null,
        data: isoDate,
      });
      if (result.error) {
        Alert.alert('Erro', result.error.message || 'Falha ao salvar.');
        setSubmitted(false);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Sucesso!', 'Movimentação registrada.', [
          {
            text: 'Adicionar outra',
            onPress: function() {
              setValor('');
              setDescricao('');
              setTicker('');
              setData(todayBr());
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

  // Switch tipo resets categoria
  function switchTipo(newTipo) {
    setTipo(newTipo);
    setCategoria(newTipo === 'entrada' ? 'deposito' : 'retirada');
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={function() { navigation.goBack(); }}>
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Nova Movimentação</Text>
        <View style={{ width: 32 }} />
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

      {/* Categoria */}
      <Text style={styles.label}>CATEGORIA</Text>
      <View style={styles.pillRow}>
        {categorias.map(function(cat) {
          return (
            <Pill key={cat.k} active={categoria === cat.k} color={tipo === 'entrada' ? C.green : C.red}
              onPress={function() { setCategoria(cat.k); }}>
              {cat.l}
            </Pill>
          );
        })}
      </View>

      {/* Conta */}
      <Text style={styles.label}>CONTA *</Text>
      {saldos.length > 0 ? (
        <View style={styles.pillRow}>
          {saldos.map(function(s) {
            var sName = s.corretora || s.name || '';
            return (
              <Pill key={s.id} active={conta === sName} color={C.accent}
                onPress={function() { setConta(sName); }}>
                {sName}
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
      <Text style={styles.label}>VALOR (R$) *</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 14, color: C.sub, fontFamily: F.mono }}>R$</Text>
        <TextInput
          value={valor}
          onChangeText={onChangeVal}
          placeholder="0,00"
          placeholderTextColor={C.dim}
          keyboardType="numeric"
          style={[styles.input, { flex: 1 },
            valorValid && { borderColor: C.green },
            valorError && { borderColor: C.red },
          ]}
        />
      </View>

      {/* Ticker (conditional) */}
      {showTicker ? (
        <View>
          <Text style={styles.label}>TICKER</Text>
          <TextInput
            value={ticker}
            onChangeText={function(t) { setTicker(t.toUpperCase()); }}
            placeholder="Ex: PETR4"
            placeholderTextColor={C.dim}
            autoCapitalize="characters"
            style={styles.input}
          />
        </View>
      ) : null}

      {/* Descrição */}
      <Text style={styles.label}>DESCRIÇÃO</Text>
      <TextInput
        value={descricao}
        onChangeText={setDescricao}
        placeholder="Descrição opcional"
        placeholderTextColor={C.dim}
        style={styles.input}
      />

      {/* Data */}
      <Text style={styles.label}>DATA *</Text>
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

      {/* Resumo */}
      {valorNum > 0 ? (
        <Glass glow={tipo === 'entrada' ? C.green : C.red} padding={14}>
          <View style={styles.resumoRow}>
            <Text style={styles.resumoLabel}>{tipo === 'entrada' ? 'ENTRADA' : 'SAÍDA'}</Text>
            <Text style={[styles.resumoValue, { color: tipo === 'entrada' ? C.green : C.red }]}>
              {tipo === 'entrada' ? '+' : '-'}R$ {fmt(valorNum)}
            </Text>
          </View>
          <View style={styles.resumoRow}>
            <Text style={styles.resumoLabel}>CONTA</Text>
            <Text style={styles.resumoSmall}>{conta || '—'}</Text>
          </View>
        </Glass>
      ) : null}

      {/* Submit */}
      <TouchableOpacity onPress={handleSubmit} disabled={!canSubmit || loading} activeOpacity={0.8}
        style={[styles.submitBtn, !canSubmit && { opacity: 0.4 }]}>
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.submitText}>Registrar Movimentação</Text>
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
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggleBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center', backgroundColor: C.cardSolid },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  resumoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
  resumoLabel: { fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 },
  resumoValue: { fontSize: 18, fontWeight: '800', fontFamily: F.display },
  resumoSmall: { fontSize: 12, fontWeight: '600', color: C.text, fontFamily: F.mono },
  submitBtn: { backgroundColor: C.green, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  submitText: { fontSize: 15, fontWeight: '700', color: 'white', fontFamily: F.display },
  fieldError: { fontSize: 11, color: C.red, fontFamily: F.mono, marginTop: 2 },
});
