import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';

import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { addRendaFixa, incrementCorretora } from '../../services/database';
import { Glass, Pill, Badge } from '../../components';

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// =========== TIPOS DE RF ===========
var TIPOS = [
  { key: 'cdb', indexador: 'cdi', label: 'CDB' },
  { key: 'lci_lca', indexador: 'cdi', label: 'LCI / LCA' },
  { key: 'tesouro_selic', indexador: 'selic', label: 'Tesouro Selic' },
  { key: 'tesouro_ipca', indexador: 'ipca', label: 'Tesouro IPCA+' },
  { key: 'tesouro_pre', indexador: 'prefixado', label: 'Tesouro Pre' },
  { key: 'debenture', indexador: 'cdi', label: 'Debenture' },
];
var INDEXADORES = [
  { key: 'prefixado', label: 'Prefixado', hint: 'Taxa anual fixa (ex: 14.5)', color: C.green },
  { key: 'cdi', label: 'CDI%', hint: '% do CDI (ex: 110)', color: C.accent },
  { key: 'ipca', label: 'IPCA+', hint: 'Spread sobre IPCA (ex: 6.5)', color: C.fiis },
  { key: 'selic', label: 'Selic', hint: '% da Selic (ex: 100)', color: C.opcoes },
];

var CORRETORAS = ['Clear', 'XP', 'Rico', 'Inter', 'Nubank', 'BTG', 'Genial', 'Itau', 'Bradesco', 'BB'];

var CUSTODIAS = [
  { key: 'corretora', label: 'Na Corretora/Banco' },
  { key: 'emissor', label: 'No Emissor' },
];

// =========== DATE MASK (BR FORMAT) ===========
function maskDate(text) {
  var nums = text.replace(/\D/g, '');
  if (nums.length <= 2) return nums;
  if (nums.length <= 4) return nums.slice(0, 2) + '/' + nums.slice(2);
  return nums.slice(0, 2) + '/' + nums.slice(2, 4) + '/' + nums.slice(4, 8);
}

function brToIso(brDate) {
  var parts = brDate.split('/');
  if (parts.length !== 3) return null;
  return parts[2] + '-' + parts[1] + '-' + parts[0];
}

function isValidFutureDate(brDate) {
  if (!brDate || brDate.length !== 10) return false;
  var parts = brDate.split('/');
  if (parts.length !== 3) return false;
  var day = parseInt(parts[0]);
  var month = parseInt(parts[1]);
  var year = parseInt(parts[2]);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  var date = new Date(year, month - 1, day);
  if (date.getDate() !== day || date.getMonth() !== month - 1) return false;
  return date > new Date();
}

// =========== MAIN SCREEN ===========
export default function AddRendaFixaScreen(props) {
  var navigation = props.navigation;
  var user = useAuth().user;

  var s1 = useState(''); var tipo = s1[0]; var setTipo = s1[1];
  var s2 = useState('cdi'); var indexador = s2[0]; var setIndexador = s2[1];
  var s3 = useState(''); var taxa = s3[0]; var setTaxa = s3[1];
  var s4 = useState(''); var valorAplicado = s4[0]; var setValorAplicado = s4[1];
  var s5 = useState(''); var vencimento = s5[0]; var setVencimento = s5[1];
  var s6 = useState(''); var dataAplicacao = s6[0]; var setDataAplicacao = s6[1];
  var s7 = useState(''); var emissor = s7[0]; var setEmissor = s7[1];
  var s8 = useState(''); var custodia = s8[0]; var setCustodia = s8[1];
  var s9 = useState(''); var corretora = s9[0]; var setCorretora = s9[1];
  var s10 = useState(false); var loading = s10[0]; var setLoading = s10[1];
  var _submitted = useState(false); var submitted = _submitted[0]; var setSubmitted = _submitted[1];

  // Auto-fill indexador when tipo changes
  function handleTipoSelect(tipoObj) {
    setTipo(tipoObj.key);
    setIndexador(tipoObj.indexador);
  }

  // Get current indexador info
  var idxInfo = null;
  for (var ii = 0; ii < INDEXADORES.length; ii++) {
    if (INDEXADORES[ii].key === indexador) {
      idxInfo = INDEXADORES[ii];
      break;
    }
  }

  // Rendimento preview
  var valorNum = parseFloat((valorAplicado || '').replace(/\./g, '').replace(',', '.')) || 0;

  var taxaNum = parseFloat(taxa) || 0;
  var rendAnual = 0;
  var rendMensal = 0;
  var rendDiario = 0;

  if (valorNum > 0 && taxaNum > 0) {
    if (indexador === 'prefixado') {
      rendAnual = valorNum * (taxaNum / 100);
    } else if (indexador === 'cdi') {
      var cdiEst = 14.15; // Selic - 0.10 estimate
      rendAnual = valorNum * (taxaNum / 100) * (cdiEst / 100);
    } else if (indexador === 'ipca') {
      var ipcaEst = 4.5;
      rendAnual = valorNum * (ipcaEst + taxaNum) / 100;
    } else if (indexador === 'selic') {
      var selicEst = 14.25;
      rendAnual = valorNum * (taxaNum / 100) * (selicEst / 100);
    }
    rendMensal = rendAnual / 12;
    rendDiario = rendAnual / 365;
  }

  var vencValido = isValidFutureDate(vencimento);
  var taxaValid = taxaNum > 0;
  var taxaError = taxa.length > 0 && taxaNum <= 0;
  var valorValid = valorNum > 0;
  var valorError = valorAplicado.length > 0 && valorNum <= 0;
  var canSubmit = tipo && taxaNum > 0 && valorNum > 0 && vencValido && corretora;

  var handleSubmit = async function() {
    if (!canSubmit || submitted) return;
    setSubmitted(true);
    setLoading(true);
    try {
      var isoVenc = brToIso(vencimento);
      var isoData = dataAplicacao.length === 10 ? brToIso(dataAplicacao) : new Date().toISOString().split('T')[0];

      var rfData = {
        tipo: tipo,
        indexador: indexador,
        taxa: taxaNum,
        valor_aplicado: valorNum,
        vencimento: isoVenc,
        data: isoData,
        emissor: emissor || null,
        custodia: custodia || null,
        corretora: corretora,
      };

      var result = await addRendaFixa(user.id, rfData);

      if (result.error) {
        Alert.alert('Erro', result.error.message);
        setSubmitted(false);
      } else {
        await incrementCorretora(user.id, corretora);
        Alert.alert(
          'Sucesso!',
          tipo + ' de R$ ' + fmt(valorNum) + ' registrado.',
          [
            {
              text: 'Adicionar outro',
              onPress: function() {
                setTaxa('');
                setValorAplicado('');
                setVencimento('');
                setDataAplicacao('');
                setEmissor('');
                setCustodia('');
                setSubmitted(false);
              },
            },
            { text: 'Concluir', onPress: function() { navigation.goBack(); } },
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
          <TouchableOpacity onPress={function() { navigation.goBack(); }}>
            <Text style={styles.back}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Nova Renda Fixa</Text>
          <View style={{ width: 32 }} />
        </View>

        {/* ========== TIPO ========== */}
        <Text style={styles.label}>TIPO DO PRODUTO *</Text>
        <View style={styles.pillRow}>
          {TIPOS.map(function(t) {
            return (
              <Pill
                key={t.key}
                active={tipo === t.key}
                color={C.rf}
                onPress={function() { handleTipoSelect(t); }}
              >
                {t.label}
              </Pill>
            );
          })}
        </View>

        {/* ========== INDEXADOR ========== */}
        <Text style={styles.label}>INDEXADOR *</Text>
        <View style={styles.pillRow}>
          {INDEXADORES.map(function(idx) {
            return (
              <Pill
                key={idx.key}
                active={indexador === idx.key}
                color={idx.color}
                onPress={function() { setIndexador(idx.key); }}
              >
                {idx.label}
              </Pill>
            );
          })}
        </View>
        {idxInfo && (
          <Text style={styles.hint}>{idxInfo.hint}</Text>
        )}

        {/* ========== TAXA + VALOR ========== */}
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>TAXA *</Text>
            <View style={styles.inputRow}>
              <TextInput
                value={taxa}
                onChangeText={setTaxa}
                placeholder={indexador === 'cdi' ? '110' : indexador === 'ipca' ? '6.5' : indexador === 'selic' ? '100' : '14.5'}
                placeholderTextColor={C.dim}
                keyboardType="decimal-pad"
                style={[styles.input, { flex: 1 },
                  taxaValid && { borderColor: C.green },
                  taxaError && { borderColor: C.red },
                ]}
              />
              <Text style={styles.inputSuffix}>
                {indexador === 'prefixado' ? '% a.a.' : indexador === 'cdi' ? '% CDI' : indexador === 'ipca' ? '% + IPCA' : '% Selic'}
              </Text>
            </View>
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>VALOR APLICADO (R$) *</Text>
           <TextInput
              value={valorAplicado}
              onChangeText={function(t) {
                var nums = t.replace(/\D/g, '');
                if (nums === '') { setValorAplicado(''); return; }
                var centavos = parseInt(nums);
                var reais = (centavos / 100).toFixed(2);
                var parts = reais.split('.');
                parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
                setValorAplicado(parts[0] + ',' + parts[1]);
              }}
              placeholder="0,00"
              placeholderTextColor={C.dim}
              keyboardType="numeric"
              style={[styles.input,
                valorValid && { borderColor: C.green },
                valorError && { borderColor: C.red },
              ]}
            />
            {valorError ? <Text style={styles.error}>Deve ser maior que 0</Text> : null}
          </View>
        </View>

        {/* ========== RENDIMENTO PREVIEW ========== */}
        {valorNum > 0 && taxaNum > 0 && (
          <Glass glow={C.rf} padding={14}>
            <Text style={styles.previewTitle}>RENDIMENTO ESTIMADO</Text>
            <View style={styles.previewRow}>
              {[
                { l: 'Diario', v: 'R$ ' + fmt(rendDiario), c: C.rf },
                { l: 'Mensal', v: 'R$ ' + fmt(rendMensal), c: C.green },
                { l: 'Anual', v: 'R$ ' + fmt(rendAnual), c: C.accent },
              ].map(function(r, i) {
                return (
                  <View key={i} style={{ alignItems: 'center', flex: 1 }}>
                    <Text style={styles.previewLabel}>{r.l}</Text>
                    <Text style={[styles.previewValue, { color: r.c }]}>{r.v}</Text>
                  </View>
                );
              })}
            </View>
            <View style={styles.previewNote}>
              <Text style={styles.previewNoteText}>
                {indexador === 'prefixado' ? taxaNum + '% a.a.' :
                 indexador === 'cdi' ? taxaNum + '% do CDI (~14.15% a.a.)' :
                 indexador === 'ipca' ? 'IPCA (~4.5%) + ' + taxaNum + '%' :
                 taxaNum + '% da Selic (~14.25% a.a.)'}
              </Text>
            </View>
          </Glass>
        )}

        {/* ========== DATAS ========== */}
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>VENCIMENTO *</Text>
            <TextInput
              value={vencimento}
              onChangeText={function(t) { setVencimento(maskDate(t)); }}
              placeholder="DD/MM/AAAA"
              placeholderTextColor={C.dim}
              keyboardType="numeric"
              maxLength={10}
              style={[
                styles.input,
                vencimento.length === 10 && (vencValido
                  ? { borderColor: C.green }
                  : { borderColor: C.red }),
              ]}
            />
            {vencimento.length === 10 && !vencValido && (
              <Text style={styles.error}>Data deve ser futura</Text>
            )}
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>DATA APLICACAO</Text>
            <TextInput
              value={dataAplicacao}
              onChangeText={function(t) { setDataAplicacao(maskDate(t)); }}
              placeholder="DD/MM/AAAA"
              placeholderTextColor={C.dim}
              keyboardType="numeric"
              maxLength={10}
              style={styles.input}
            />
          </View>
        </View>

        {/* ========== EMISSOR ========== */}
        <Text style={styles.label}>EMISSOR</Text>
        <TextInput
          value={emissor}
          onChangeText={setEmissor}
          placeholder="Ex: Banco Inter, XP, Tesouro Nacional"
          placeholderTextColor={C.dim}
          style={styles.input}
        />

        {/* ========== CUSTODIA ========== */}
        <Text style={styles.label}>CUSTODIA</Text>
        <View style={styles.pillRow}>
         {CUSTODIAS.map(function(c) {
            return (
              <Pill
                key={c.key}
                active={custodia === c.key}
                color={C.rf}
                onPress={function() { setCustodia(c.key); }}
              >
                {c.label}
              </Pill>
            );
          })}

        </View>

        {/* ========== CORRETORA ========== */}
        <Text style={styles.label}>CORRETORA / BANCO *</Text>
        <View style={styles.pillRow}>
          {CORRETORAS.map(function(c) {
            return (
              <Pill
                key={c}
                active={corretora === c}
                color={C.acoes}
                onPress={function() { setCorretora(c); }}
              >
                {c}
              </Pill>
            );
          })}
        </View>

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
            <Text style={styles.submitText}>Registrar Renda Fixa</Text>
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
  hint: {
    fontSize: 13, color: C.sub, fontFamily: F.body,
    fontStyle: 'italic', marginTop: -4,
  },
  input: {
    backgroundColor: C.cardSolid, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 17, color: C.text, fontFamily: F.body,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.cardSolid, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, paddingRight: 12,
  },
  inputSuffix: {
    fontSize: 13, color: C.sub, fontFamily: F.mono,
  },
  row: { flexDirection: 'row' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { fontSize: 12, color: C.red, fontFamily: F.body, marginTop: 4 },

  // Preview
  previewTitle: { fontSize: 12, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5, marginBottom: 10 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between' },
  previewLabel: { fontSize: 12, color: C.dim, fontFamily: F.mono },
  previewValue: { fontSize: 18, fontWeight: '800', fontFamily: F.display, marginTop: 2 },
  previewNote: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border },
  previewNoteText: { fontSize: 13, color: C.sub, fontFamily: F.mono, textAlign: 'center' },

  // Submit
  submitBtn: {
    backgroundColor: C.rf, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 10,
  },
  submitText: { fontSize: 17, fontWeight: '700', color: 'white', fontFamily: F.display },
});
