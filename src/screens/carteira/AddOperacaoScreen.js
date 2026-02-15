import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { addOperacao, incrementCorretora } from '../../services/database';
import { Glass, Pill, Badge } from '../../components';

var CATEGORIAS = [
  { key: 'acao', label: 'Acao', color: C.acoes },
  { key: 'fii', label: 'FII', color: C.fiis },
  { key: 'etf', label: 'ETF', color: C.etfs },
];

var CORRETORAS = ['Clear', 'XP Investimentos', 'Rico', 'Inter', 'Nubank', 'BTG Pactual', 'Genial'];

export default function AddOperacaoScreen(props) {
  var navigation = props.navigation;
  var user = useAuth().user;

  var s1 = useState('compra'); var tipo = s1[0]; var setTipo = s1[1];
  var s2 = useState('acao'); var categoria = s2[0]; var setCategoria = s2[1];
  var s3 = useState(''); var ticker = s3[0]; var setTicker = s3[1];
  var s4 = useState(''); var quantidade = s4[0]; var setQuantidade = s4[1];
  var s5 = useState(''); var preco = s5[0]; var setPreco = s5[1];
  var s6 = useState(''); var corretora = s6[0]; var setCorretora = s6[1];
  var s7 = useState('0'); var custoCorretagem = s7[0]; var setCustoCorretagem = s7[1];
  var s8 = useState(false); var loading = s8[0]; var setLoading = s8[1];
  var s9 = useState(false); var showCustos = s9[0]; var setShowCustos = s9[1];

  var total = (parseFloat(quantidade) || 0) * (parseFloat(preco) || 0);
  var canSubmit = ticker.length >= 4 && parseFloat(quantidade) > 0 && parseFloat(preco) > 0 && corretora;

  var handleSubmit = async function() {
    if (!canSubmit) return;
    setLoading(true);
    try {
      var result = await addOperacao(user.id, {
        ticker: ticker.toUpperCase(),
        tipo: tipo,
        categoria: categoria,
        quantidade: parseInt(quantidade),
        preco: parseFloat(preco),
        custo_corretagem: parseFloat(custoCorretagem) || 0,
        custo_emolumentos: 0,
        custo_impostos: 0,
        corretora: corretora,
        data: new Date().toISOString().split('T')[0],
      });
      if (result.error) {
        Alert.alert('Erro', result.error.message);
      } else {
        await incrementCorretora(user.id, corretora);
        Alert.alert('Sucesso!', 'Operacao registrada.', [
          { text: 'OK', onPress: function() { navigation.goBack(); } },
        ]);
      }
    } catch (err) {
      Alert.alert('Erro', 'Falha ao salvar. Tente novamente.');
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
          <Text style={styles.title}>Nova Operacao</Text>
          <View style={{ width: 32 }} />
        </View>

        <View style={styles.toggleRow}>
          <TouchableOpacity
            onPress={function() { setTipo('compra'); }}
            style={[styles.toggleBtn, tipo === 'compra' && { backgroundColor: '#22C55E18', borderColor: '#22C55E40' }]}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: tipo === 'compra' ? C.green : C.dim }}>COMPRA</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={function() { setTipo('venda'); }}
            style={[styles.toggleBtn, tipo === 'venda' && { backgroundColor: '#EF444418', borderColor: '#EF444440' }]}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: tipo === 'venda' ? C.red : C.dim }}>VENDA</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>TIPO DE ATIVO</Text>
        <View style={styles.pillRow}>
          {CATEGORIAS.map(function(cat) {
            return (
              <Pill key={cat.key} active={categoria === cat.key} color={cat.color} onPress={function() { setCategoria(cat.key); }}>
                {cat.label}
              </Pill>
            );
          })}
        </View>

        <Text style={styles.label}>TICKER *</Text>
        <TextInput value={ticker} onChangeText={function(t) { setTicker(t.toUpperCase()); }} placeholder="Ex: PETR4" placeholderTextColor={C.dim} autoCapitalize="characters" style={styles.input} />

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>QUANTIDADE *</Text>
            <TextInput value={quantidade} onChangeText={setQuantidade} placeholder="100" placeholderTextColor={C.dim} keyboardType="numeric" style={styles.input} />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>PRECO (R$) *</Text>
            <TextInput value={preco} onChangeText={setPreco} placeholder="34.50" placeholderTextColor={C.dim} keyboardType="decimal-pad" style={styles.input} />
          </View>
        </View>

        {total > 0 && (
          <Glass padding={12}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TOTAL DA OPERACAO</Text>
              <Text style={[styles.totalValue, { color: tipo === 'compra' ? C.green : C.red }]}>R$ {total.toFixed(2)}</Text>
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

        <TouchableOpacity onPress={function() { setShowCustos(!showCustos); }}>
          <Text style={styles.custoToggle}>{showCustos ? 'v Custos' : '> Custos (opcional)'}</Text>
        </TouchableOpacity>
        {showCustos && (
          <View>
            <Text style={styles.label}>CORRETAGEM</Text>
            <TextInput value={custoCorretagem} onChangeText={setCustoCorretagem} placeholder="0.00" placeholderTextColor={C.dim} keyboardType="decimal-pad" style={styles.input} />
          </View>
        )}

        <TouchableOpacity onPress={handleSubmit} disabled={!canSubmit || loading} activeOpacity={0.8} style={[styles.submitBtn, !canSubmit && { opacity: 0.4 }]}>
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.submitText}>{tipo === 'compra' ? 'Registrar Compra' : 'Registrar Venda'}</Text>
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
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 },
  totalValue: { fontSize: 18, fontWeight: '800', fontFamily: F.display },
  custoToggle: { fontSize: 11, color: C.sub, fontFamily: F.body, paddingVertical: 4 },
  submitBtn: { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  submitText: { fontSize: 15, fontWeight: '700', color: 'white', fontFamily: F.display },
});
