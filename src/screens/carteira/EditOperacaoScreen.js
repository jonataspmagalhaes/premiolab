import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../config/supabase';
import { Glass, Pill, Badge } from '../../components';

var CATEGORIAS = [
  { key: 'acao', label: 'Ação', color: C.acoes },
  { key: 'fii', label: 'FII', color: C.fiis },
  { key: 'etf', label: 'ETF', color: C.etfs },
];

var CORRETORAS = ['Clear', 'XP Investimentos', 'Rico', 'Inter', 'Nubank', 'BTG Pactual', 'Genial'];

function maskDate(text) {
  var clean = text.replace(/[^0-9]/g, '');
  if (clean.length <= 2) return clean;
  if (clean.length <= 4) return clean.slice(0, 2) + '/' + clean.slice(2);
  return clean.slice(0, 2) + '/' + clean.slice(2, 4) + '/' + clean.slice(4, 8);
}

function isoToBr(iso) {
  if (!iso) return '';
  var parts = iso.split('T')[0].split('-');
  if (parts.length !== 3) return iso;
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

function brToIso(br) {
  var parts = br.split('/');
  if (parts.length !== 3 || parts[2].length !== 4) return null;
  return parts[2] + '-' + parts[1] + '-' + parts[0];
}

export default function EditOperacaoScreen(props) {
  var navigation = props.navigation;
  var route = props.route;
  var op = route.params.operacao;
  var user = useAuth().user;

  var _tipo = useState(op.tipo || 'compra'); var tipo = _tipo[0]; var setTipo = _tipo[1];
  var _cat = useState(op.categoria || 'acao'); var categoria = _cat[0]; var setCategoria = _cat[1];
  var _ticker = useState(op.ticker || ''); var ticker = _ticker[0]; var setTicker = _ticker[1];
  var _qtd = useState(String(op.quantidade || '')); var quantidade = _qtd[0]; var setQuantidade = _qtd[1];
  var _preco = useState(String(op.preco || '')); var preco = _preco[0]; var setPreco = _preco[1];
  var _corretora = useState(op.corretora || ''); var corretora = _corretora[0]; var setCorretora = _corretora[1];
  var _data = useState(isoToBr(op.data)); var data = _data[0]; var setData = _data[1];
  var _corretagem = useState(String(op.custo_corretagem || '')); var corretagem = _corretagem[0]; var setCorretagem = _corretagem[1];
  var _emolumentos = useState(String(op.custo_emolumentos || '')); var emolumentos = _emolumentos[0]; var setEmolumentos = _emolumentos[1];
  var _impostos = useState(String(op.custo_impostos || '')); var impostos = _impostos[0]; var setImpostos = _impostos[1];
  var _loading = useState(false); var loading = _loading[0]; var setLoading = _loading[1];

  var hasCustos = (op.custo_corretagem > 0 || op.custo_emolumentos > 0 || op.custo_impostos > 0);
  var _showCustos = useState(hasCustos); var showCustos = _showCustos[0]; var setShowCustos = _showCustos[1];

  var qty = parseFloat(quantidade) || 0;
  var prc = parseFloat(preco) || 0;
  var total = qty * prc;
  var custCorretagem = parseFloat(corretagem) || 0;
  var custEmolumentos = parseFloat(emolumentos) || 0;
  var custImpostos = parseFloat(impostos) || 0;
  var totalCustos = custCorretagem + custEmolumentos + custImpostos;

  var custoTotal = tipo === 'compra' ? total + totalCustos : total - totalCustos;
  var pmComCustos = qty > 0 ? (tipo === 'compra' ? (total + totalCustos) / qty : (total - totalCustos) / qty) : 0;

  var canSubmit = ticker.length >= 4 && qty > 0 && prc > 0 && corretora && data.length === 10;

  var handleSave = async function() {
    if (!canSubmit) return;
    setLoading(true);
    try {
      var isoDate = brToIso(data);
      var result = await supabase
        .from('operacoes')
        .update({
          ticker: ticker.toUpperCase(),
          tipo: tipo,
          categoria: categoria,
          quantidade: parseInt(quantidade),
          preco: parseFloat(preco),
          custo_corretagem: custCorretagem,
          custo_emolumentos: custEmolumentos,
          custo_impostos: custImpostos,
          corretora: corretora,
          data: isoDate,
        })
        .eq('id', op.id);

      if (result.error) {
        Alert.alert('Erro', result.error.message);
      } else {
        Alert.alert('Salvo!', 'Operação atualizada.', [
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
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Editar Operação</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Compra / Venda */}
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

      {/* Categoria */}
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

      {/* Ticker */}
      <Text style={styles.label}>TICKER</Text>
      <TextInput
        value={ticker}
        onChangeText={function(t) { setTicker(t.toUpperCase()); }}
        placeholder="Ex: PETR4"
        placeholderTextColor={C.dim}
        autoCapitalize="characters"
        style={styles.input}
      />

      {/* Qtd + Preço */}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>QUANTIDADE</Text>
          <TextInput value={quantidade} onChangeText={setQuantidade} placeholder="100" placeholderTextColor={C.dim} keyboardType="numeric" style={styles.input} />
        </View>
        <View style={{ width: 12 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>PREÇO (R$)</Text>
          <TextInput value={preco} onChangeText={setPreco} placeholder="34.50" placeholderTextColor={C.dim} keyboardType="decimal-pad" style={styles.input} />
        </View>
      </View>

      {/* Data */}
      <Text style={styles.label}>DATA</Text>
      <TextInput
        value={data}
        onChangeText={function(t) { setData(maskDate(t)); }}
        placeholder="DD/MM/AAAA"
        placeholderTextColor={C.dim}
        keyboardType="numeric"
        maxLength={10}
        style={styles.input}
      />

      {/* Custos */}
      <TouchableOpacity onPress={function() { setShowCustos(!showCustos); }} style={styles.custoToggle}>
        <Text style={styles.custoToggleText}>{showCustos ? '▾ Custos operacionais' : '▸ Custos operacionais (opcional)'}</Text>
        {totalCustos > 0 && (
          <Badge text={'R$ ' + totalCustos.toFixed(2)} color={C.yellow} />
        )}
      </TouchableOpacity>

      {showCustos && (
        <Glass padding={12}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>CORRETAGEM</Text>
              <TextInput value={corretagem} onChangeText={setCorretagem} placeholder="0.00" placeholderTextColor={C.dim} keyboardType="decimal-pad" style={styles.input} />
            </View>
            <View style={{ width: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>EMOLUMENTOS</Text>
              <TextInput value={emolumentos} onChangeText={setEmolumentos} placeholder="0.00" placeholderTextColor={C.dim} keyboardType="decimal-pad" style={styles.input} />
            </View>
            <View style={{ width: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>IMPOSTOS</Text>
              <TextInput value={impostos} onChangeText={setImpostos} placeholder="0.00" placeholderTextColor={C.dim} keyboardType="decimal-pad" style={styles.input} />
            </View>
          </View>
        </Glass>
      )}

      {/* Resumo */}
      {total > 0 && (
        <Glass glow={tipo === 'compra' ? C.green : C.red} padding={14}>
          <View style={styles.resumoRow}>
            <Text style={styles.resumoLabel}>TOTAL DA OPERAÇÃO</Text>
            <Text style={[styles.resumoValue, { color: tipo === 'compra' ? C.green : C.red }]}>
              R$ {total.toFixed(2)}
            </Text>
          </View>
          {totalCustos > 0 && (
            <View>
              <View style={styles.resumoRow}>
                <Text style={styles.resumoLabel}>CUSTOS TOTAIS</Text>
                <Text style={[styles.resumoSmall, { color: C.yellow }]}>R$ {totalCustos.toFixed(2)}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.resumoRow}>
                <Text style={styles.resumoLabel}>{tipo === 'compra' ? 'CUSTO TOTAL C/ TAXAS' : 'RECEITA LÍQUIDA'}</Text>
                <Text style={[styles.resumoValue, { color: tipo === 'compra' ? C.green : C.red }]}>
                  R$ {custoTotal.toFixed(2)}
                </Text>
              </View>
              <View style={styles.resumoRow}>
                <Text style={styles.resumoLabel}>{tipo === 'compra' ? 'PM COM CUSTOS' : 'PREÇO LÍQ. P/ AÇÃO'}</Text>
                <Text style={styles.resumoPM}>R$ {pmComCustos.toFixed(4)}</Text>
              </View>
            </View>
          )}
          {totalCustos === 0 && qty > 0 && (
            <View style={styles.resumoRow}>
              <Text style={styles.resumoLabel}>PM</Text>
              <Text style={styles.resumoPM}>R$ {prc.toFixed(4)}</Text>
            </View>
          )}
        </Glass>
      )}

      {/* Corretora */}
      <Text style={styles.label}>CORRETORA</Text>
      <View style={styles.pillRow}>
        {CORRETORAS.map(function(c) {
          return (
            <Pill key={c} active={corretora === c} color={C.acoes} onPress={function() { setCorretora(c); }}>{c}</Pill>
          );
        })}
      </View>

      {/* Submit */}
      <TouchableOpacity onPress={handleSave} disabled={!canSubmit || loading} activeOpacity={0.8} style={[styles.submitBtn, !canSubmit && { opacity: 0.4 }]}>
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
  label: { fontSize: 8, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginTop: 4 },
  input: {
    backgroundColor: C.cardSolid, borderWidth: 1, borderColor: C.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: C.text, fontFamily: F.body,
  },
  row: { flexDirection: 'row' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggleBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center', backgroundColor: C.cardSolid },
  custoToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  custoToggleText: { fontSize: 11, color: C.sub, fontFamily: F.body },
  resumoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
  resumoLabel: { fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 },
  resumoValue: { fontSize: 18, fontWeight: '800', fontFamily: F.display },
  resumoSmall: { fontSize: 12, fontWeight: '600', fontFamily: F.mono },
  resumoPM: { fontSize: 14, fontWeight: '700', color: C.accent, fontFamily: F.mono },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 6 },
  submitBtn: { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  submitText: { fontSize: 15, fontWeight: '700', color: 'white', fontFamily: F.display },
});
