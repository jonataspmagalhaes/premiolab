import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../config/supabase';
import { Glass, Pill } from '../../components';

var CORRETORAS = ['Clear', 'XP Investimentos', 'Rico', 'Inter', 'Nubank', 'BTG Pactual', 'Genial'];
var STATUS_LIST = ['ativa', 'fechada', 'exercida', 'expirada'];

function maskDate(text) {
  var clean = text.replace(/\D/g, '');
  if (clean.length <= 2) return clean;
  if (clean.length <= 4) return clean.slice(0, 2) + '/' + clean.slice(2);
  return clean.slice(0, 2) + '/' + clean.slice(2, 4) + '/' + clean.slice(4, 8);
}

function brToIso(brDate) {
  var parts = brDate.split('/');
  if (parts.length !== 3) return null;
  return parts[2] + '-' + parts[1] + '-' + parts[0];
}

function isoToBr(isoDate) {
  if (!isoDate) return '';
  var parts = isoDate.split('T')[0].split('-');
  if (parts.length !== 3) return isoDate;
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

function isValidDate(brDate) {
  var iso = brToIso(brDate);
  if (!iso) return false;
  var date = new Date(iso + 'T12:00:00');
  if (isNaN(date.getTime())) return false;
  var day = parseInt(brDate.split('/')[0]);
  var month = parseInt(brDate.split('/')[1]);
  return date.getDate() === day && (date.getMonth() + 1) === month;
}

export default function EditOpcaoScreen(props) {
  var navigation = props.navigation;
  var route = props.route;
  var op = route.params.opcao;
  var user = useAuth().user;

  var s1 = useState(op.tipo || 'call'); var tipo = s1[0]; var setTipo = s1[1];
  var s2 = useState(op.direcao || 'lancamento'); var direcao = s2[0]; var setDirecao = s2[1];
  var s3 = useState(op.ativo_base || ''); var ativoBase = s3[0]; var setAtivoBase = s3[1];
  var s10 = useState(op.ticker_opcao || ''); var tickerOpcao = s10[0]; var setTickerOpcao = s10[1];
  var s4 = useState(String(op.strike || '')); var strike = s4[0]; var setStrike = s4[1];
  var s5 = useState(String(op.premio || '')); var premio = s5[0]; var setPremio = s5[1];
  var s6 = useState(String(op.quantidade || '')); var quantidade = s6[0]; var setQuantidade = s6[1];
  var s7 = useState(isoToBr(op.vencimento)); var vencimento = s7[0]; var setVencimento = s7[1];
  var s8 = useState(op.corretora || ''); var corretora = s8[0]; var setCorretora = s8[1];
  var s9 = useState(false); var loading = s9[0]; var setLoading = s9[1];
  var s11 = useState(op.status || 'ativa'); var status = s11[0]; var setStatus = s11[1];

  var qty = parseInt(quantidade) || 0;
  var prem = parseFloat(premio) || 0;
  var premioTotal = qty * prem;
  var contratos = Math.floor(qty / 100);

  var dateValid = vencimento.length === 10 && isValidDate(vencimento);
  var canSubmit = ativoBase.length >= 4 && parseFloat(strike) > 0 && prem > 0 && qty > 0 && dateValid && corretora;

  var handleDateChange = function(text) {
    setVencimento(maskDate(text));
  };

  var handleSave = async function() {
    if (!canSubmit) return;
    setLoading(true);
    try {
      var isoDate = brToIso(vencimento);
      var result = await supabase
        .from('opcoes')
        .update({
          ativo_base: ativoBase.toUpperCase(),
          ticker_opcao: tickerOpcao.toUpperCase() || null,
          tipo: tipo,
          direcao: direcao,
          strike: parseFloat(strike),
          premio: prem,
          quantidade: qty,
          vencimento: isoDate,
          status: status,
          corretora: corretora,
        })
        .eq('id', op.id);

      if (result.error) {
        Alert.alert('Erro', result.error.message);
      } else {
        Alert.alert('Salvo!', 'Opcao atualizada.', [
          { text: 'OK', onPress: function() { navigation.goBack(); } },
        ]);
      }
    } catch (err) {
      Alert.alert('Erro', 'Falha ao salvar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={function() { navigation.goBack(); }}>
            <Text style={styles.back}>{'<'}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Editar Opcao</Text>
          <View style={{ width: 32 }} />
        </View>

        <Text style={styles.label}>TIPO</Text>
        <View style={styles.toggleRow}>
          <TouchableOpacity
            onPress={function() { setTipo('call'); }}
            style={[styles.toggleBtn, tipo === 'call' && { backgroundColor: '#22C55E18', borderColor: '#22C55E40' }]}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: tipo === 'call' ? C.green : C.dim }}>CALL</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={function() { setTipo('put'); }}
            style={[styles.toggleBtn, tipo === 'put' && { backgroundColor: '#EF444418', borderColor: '#EF444440' }]}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: tipo === 'put' ? C.red : C.dim }}>PUT</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>DIRECAO</Text>
        <View style={styles.pillRow}>
          <Pill active={direcao === 'lancamento'} color={C.opcoes} onPress={function() { setDirecao('lancamento'); }}>Lancamento</Pill>
          <Pill active={direcao === 'compra'} color={C.opcoes} onPress={function() { setDirecao('compra'); }}>Compra</Pill>
        </View>

        <Text style={styles.label}>STATUS</Text>
        <View style={styles.pillRow}>
          {STATUS_LIST.map(function(st) {
            var stColor = st === 'ativa' ? C.green : st === 'fechada' ? C.accent : st === 'exercida' ? C.opcoes : C.dim;
            return (
              <Pill key={st} active={status === st} color={stColor} onPress={function() { setStatus(st); }}>
                {st.charAt(0).toUpperCase() + st.slice(1)}
              </Pill>
            );
          })}
        </View>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>ATIVO BASE *</Text>
            <TextInput value={ativoBase} onChangeText={function(t) { setAtivoBase(t.toUpperCase()); }} placeholder="Ex: PETR4" placeholderTextColor={C.dim} autoCapitalize="characters" style={styles.input} />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>CODIGO DA OPCAO</Text>
            <TextInput value={tickerOpcao} onChangeText={function(t) { setTickerOpcao(t.toUpperCase()); }} placeholder="Ex: PETRA260" placeholderTextColor={C.dim} autoCapitalize="characters" style={styles.input} />
          </View>
        </View>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>STRIKE (R$) *</Text>
            <TextInput value={strike} onChangeText={setStrike} placeholder="36.00" placeholderTextColor={C.dim} keyboardType="decimal-pad" style={styles.input} />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>PREMIO (R$) *</Text>
            <TextInput value={premio} onChangeText={setPremio} placeholder="1.20" placeholderTextColor={C.dim} keyboardType="decimal-pad" style={styles.input} />
          </View>
        </View>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>QTD OPCOES *</Text>
            <TextInput value={quantidade} onChangeText={setQuantidade} placeholder="100" placeholderTextColor={C.dim} keyboardType="numeric" style={styles.input} />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>VENCIMENTO *</Text>
            <TextInput
              value={vencimento}
              onChangeText={handleDateChange}
              placeholder="DD/MM/AAAA"
              placeholderTextColor={C.dim}
              keyboardType="numeric"
              maxLength={10}
              style={[
                styles.input,
                dateValid && { borderColor: C.green },
                vencimento.length === 10 && !dateValid && { borderColor: C.red },
              ]}
            />
            {vencimento.length === 10 && !dateValid && (
              <Text style={styles.dateError}>Data invalida</Text>
            )}
          </View>
        </View>

        {premioTotal > 0 && (
          <Glass padding={12}>
            <View style={styles.resumoRow}>
              <Text style={styles.resumoLabel}>PREMIO TOTAL</Text>
              <Text style={[styles.resumoValue, { color: C.green }]}>R$ {premioTotal.toFixed(2)}</Text>
            </View>
            <View style={styles.resumoRow}>
              <Text style={styles.resumoLabel}>CONTRATOS</Text>
              <Text style={styles.resumoValue}>{contratos} ({qty} opcoes)</Text>
            </View>
          </Glass>
        )}

        <Text style={styles.label}>CORRETORA *</Text>
        <View style={styles.pillRow}>
          {CORRETORAS.map(function(c) {
            return (
              <Pill key={c} active={corretora === c} color={C.acoes} onPress={function() { setCorretora(c); }}>{c}</Pill>
            );
          })}
        </View>

        <TouchableOpacity onPress={handleSave} disabled={!canSubmit || loading} activeOpacity={0.8} style={[styles.submitBtn, !canSubmit && { opacity: 0.4 }]}>
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.submitText}>Salvar Alteracoes</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  back: { fontSize: 28, color: C.accent, fontWeight: '300' },
  title: { fontSize: 18, fontWeight: '800', color: C.text, fontFamily: F.display },
  label: { fontSize: 8, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginTop: 4 },
  input: { backgroundColor: C.cardSolid, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.text, fontFamily: F.body },
  row: { flexDirection: 'row' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggleBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center', backgroundColor: C.cardSolid },
  resumoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  resumoLabel: { fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 },
  resumoValue: { fontSize: 14, fontWeight: '800', color: C.text, fontFamily: F.display },
  submitBtn: { backgroundColor: C.opcoes, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  submitText: { fontSize: 15, fontWeight: '700', color: 'white', fontFamily: F.display },
  dateError: { fontSize: 9, color: C.red, fontFamily: F.mono, marginTop: 2 },
});
