import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';

import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { upsertSaldo, getUserCorretoras } from '../../services/database';
import { Glass, Pill } from '../../components';

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

var CORRETORAS_FALLBACK = ['Clear', 'XP', 'Rico', 'Inter', 'Nubank', 'BTG', 'Genial', 'Itau', 'Bradesco', 'BB'];

export default function AddSaldoScreen(props) {
  var navigation = props.navigation;
  var user = useAuth().user;

  var _v = useState(''); var valor = _v[0]; var setValor = _v[1];
  var _n = useState(''); var nome = _n[0]; var setNome = _n[1];
  var _o = useState(''); var outro = _o[0]; var setOutro = _o[1];
  var _l = useState(false); var loading = _l[0]; var setLoading = _l[1];
  var _s = useState(false); var submitted = _s[0]; var setSubmitted = _s[1];
  var _c = useState(CORRETORAS_FALLBACK); var corretoras = _c[0]; var setCorretoras = _c[1];

  useEffect(function () {
    if (!user) return;
    getUserCorretoras(user.id).then(function (res) {
      var userList = (res.data || []).map(function (c) { return c.name; });
      if (userList.length > 0) {
        var merged = userList.slice();
        for (var i = 0; i < CORRETORAS_FALLBACK.length; i++) {
          if (merged.indexOf(CORRETORAS_FALLBACK[i]) === -1) {
            merged.push(CORRETORAS_FALLBACK[i]);
          }
        }
        setCorretoras(merged);
      }
    });
  }, [user]);

  var valorNum = parseFloat((valor || '').replace(/\./g, '').replace(',', '.')) || 0;
  var nomeFinal = nome === '__outro__' ? outro.trim() : nome;
  var canSubmit = valorNum > 0 && nomeFinal.length > 0;

  var handleSubmit = async function () {
    if (!canSubmit || submitted) return;
    setSubmitted(true);
    setLoading(true);
    try {
      var result = await upsertSaldo(user.id, {
        corretora: nomeFinal,
        saldo: valorNum,
      });

      if (result.error) {
        Alert.alert('Erro', result.error.message);
        setSubmitted(false);
      } else {
        Alert.alert(
          'Sucesso!',
          'Saldo de R$ ' + fmt(valorNum) + ' em ' + nomeFinal + ' registrado.',
          [
            {
              text: 'Adicionar outro',
              onPress: function () {
                setValor('');
                setNome('');
                setOutro('');
                setSubmitted(false);
              },
            },
            { text: 'Concluir', onPress: function () { navigation.goBack(); } },
          ]
        );
      }
    } catch (err) {
      Alert.alert('Erro', 'Falha ao salvar. Tente novamente.');
      setSubmitted(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={function () { navigation.goBack(); }}>
          <Text style={styles.back}>&#8249;</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Saldo Livre</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* ========== VALOR ========== */}
      <Text style={styles.label}>VALOR (R$) *</Text>
      <Glass glow={C.accent} padding={16}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={styles.currency}>R$</Text>
          <TextInput
            value={valor}
            onChangeText={function (t) {
              var nums = t.replace(/\D/g, '');
              if (nums === '') { setValor(''); return; }
              var centavos = parseInt(nums);
              var reais = (centavos / 100).toFixed(2);
              var parts = reais.split('.');
              parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
              setValor(parts[0] + ',' + parts[1]);
            }}
            placeholder="0,00"
            placeholderTextColor={C.dim}
            keyboardType="numeric"
            style={styles.valorInput}
          />
        </View>
      </Glass>

      {/* ========== BANCO / CORRETORA ========== */}
      <Text style={styles.label}>BANCO / CORRETORA *</Text>
      <View style={styles.pillRow}>
        {corretoras.map(function (c) {
          return (
            <Pill
              key={c}
              active={nome === c}
              color={C.acoes}
              onPress={function () { setNome(c); }}
            >
              {c}
            </Pill>
          );
        })}
        <Pill
          active={nome === '__outro__'}
          color={C.sub}
          onPress={function () { setNome('__outro__'); }}
        >
          Outro
        </Pill>
      </View>

      {nome === '__outro__' ? (
        <TextInput
          value={outro}
          onChangeText={setOutro}
          placeholder="Nome do banco ou corretora"
          placeholderTextColor={C.dim}
          autoFocus
          style={styles.input}
        />
      ) : null}

      {/* ========== SUBMIT ========== */}
      <TouchableOpacity
        onPress={handleSubmit}
        disabled={!canSubmit || loading}
        activeOpacity={0.8}
        style={[styles.submitBtn, !canSubmit && { opacity: 0.4 }]}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.submitText}>Registrar Saldo</Text>
        )}
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 18, gap: 12 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 8,
  },
  back: { fontSize: 34, color: C.accent, fontWeight: '300' },
  title: { fontSize: 20, fontWeight: '800', color: C.text, fontFamily: F.display },
  label: {
    fontSize: 12, color: C.dim, fontFamily: F.mono,
    letterSpacing: 0.8, marginTop: 6,
  },
  currency: {
    fontSize: 36, fontWeight: '800', color: C.dim,
    fontFamily: F.display, marginRight: 8,
  },
  valorInput: {
    fontSize: 36, fontWeight: '800', color: C.text,
    fontFamily: F.display, flex: 1, padding: 0,
  },
  input: {
    backgroundColor: C.cardSolid, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 17, color: C.text, fontFamily: F.body,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  submitBtn: {
    backgroundColor: C.accent, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 10,
  },
  submitText: { fontSize: 17, fontWeight: '700', color: 'white', fontFamily: F.display },
});
