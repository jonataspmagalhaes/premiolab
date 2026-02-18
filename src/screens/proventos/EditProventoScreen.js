import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../config/supabase';
import { getUserCorretoras } from '../../services/database';
import { Glass, Pill, Badge } from '../../components';

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

function isoToBr(iso) {
  if (!iso) return '';
  var parts = iso.split('T')[0].split('-');
  if (parts.length !== 3) return iso;
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

function isValidDate(br) {
  var iso = brToIso(br);
  if (!iso) return false;
  var d = new Date(iso + 'T12:00:00');
  return !isNaN(d.getTime());
}

export default function EditProventoScreen(props) {
  var navigation = props.navigation;
  var route = props.route;
  var p = route.params.provento;
  var user = useAuth().user;

  var initialTipo = p.tipo_provento || p.tipo || 'dividendo';
  var initialValor = p.valor_total || ((p.valor_por_cota || 0) * (p.quantidade || 0));

  var _tipo = useState(initialTipo); var tipo = _tipo[0]; var setTipo = _tipo[1];
  var _ticker = useState(p.ticker || ''); var ticker = _ticker[0]; var setTicker = _ticker[1];
  var _valor = useState(String(initialValor || '')); var valor = _valor[0]; var setValor = _valor[1];
  var _qtd = useState(String(p.quantidade || '')); var qtd = _qtd[0]; var setQtd = _qtd[1];
  var _data = useState(isoToBr(p.data_pagamento)); var data = _data[0]; var setData = _data[1];
  var _corretora = useState(p.corretora || ''); var corretora = _corretora[0]; var setCorretora = _corretora[1];
  var _corretoras = useState(CORRETORAS_DEFAULT); var corretoras = _corretoras[0]; var setCorretoras = _corretoras[1];
  var _loading = useState(false); var loading = _loading[0]; var setLoading = _loading[1];

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

  var canSubmit = ticker.length >= 4 && valorNum > 0 && data.length === 10 && isValidDate(data);

  var tipoObj = TIPOS.filter(function(t) { return t.key === tipo; })[0];

  var handleSave = async function() {
    if (!canSubmit) return;
    setLoading(true);
    try {
      var isoDate = brToIso(data);
      var payload = {
        tipo: tipo,
        ticker: ticker.toUpperCase(),
        data_pagamento: isoDate,
        corretora: corretora || null,
      };
      if (qtdNum > 0) {
        payload.quantidade = qtdNum;
        payload.valor_por_cota = parseFloat(valorPorCota.toFixed(4));
      } else {
        payload.quantidade = 1;
        payload.valor_por_cota = valorNum;
      }
      var result = await supabase
        .from('proventos')
        .update(payload)
        .eq('id', p.id);

      if (result.error) {
        Alert.alert('Erro', result.error.message);
      } else {
        Alert.alert('Salvo!', 'Provento atualizado.', [
          { text: 'OK', onPress: function() { navigation.goBack(); } },
        ]);
      }
    } catch (err) {
      Alert.alert('Erro', 'Falha ao salvar.');
    }
    setLoading(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={function() { navigation.goBack(); }}>
          <Text style={styles.back}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Editar Provento</Text>
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
        style={styles.input}
      />

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
            style={styles.input}
          />
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
        style={styles.input}
      />

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
        <Glass glow={tipoObj ? tipoObj.color : C.fiis} padding={14}>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <Badge text={tipo.toUpperCase()} color={tipoObj ? tipoObj.color : C.fiis} />
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
        onPress={handleSave}
        disabled={!canSubmit || loading}
        activeOpacity={0.8}
        style={[styles.submitBtn, !canSubmit && { opacity: 0.4 }]}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.submitText}>Salvar Alterações</Text>
        )}
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
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
  submitBtn: { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  submitText: { fontSize: 15, fontWeight: '700', color: 'white', fontFamily: F.display },
});
