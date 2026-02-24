import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { Pill } from '../../components/Primitives';
import { getInstitutionMeta } from '../../components/CorretoraSelector';
import { getSymbol } from '../../services/currencyService';

var SUGESTOES_RAPIDAS = [
  'Clear', 'XP Investimentos', 'Rico', 'Inter',
  'Nubank', 'BTG Pactual', 'Avenue', 'Nomad',
];

var TIPOS = [
  { k: 'corretora', l: 'Corretora' },
  { k: 'banco', l: 'Banco' },
];

var MOEDAS_PILLS = ['BRL', 'USD', 'EUR', 'GBP'];

var METAS_RAPIDAS = [3000, 5000, 6000, 8000, 10000, 15000];

export default function OnboardingScreen() {
  var _auth = useAuth(); var completeOnboarding = _auth.completeOnboarding;
  var _step = useState(0); var step = _step[0]; var setStep = _step[1];
  var _nome = useState(''); var nome = _nome[0]; var setNome = _nome[1];
  var _meta = useState('6000'); var meta = _meta[0]; var setMeta = _meta[1];

  // Step 2 — contas
  var _contas = useState([]); var contas = _contas[0]; var setContas = _contas[1];
  var _contaNome = useState(''); var contaNome = _contaNome[0]; var setContaNome = _contaNome[1];
  var _contaTipo = useState('corretora'); var contaTipo = _contaTipo[0]; var setContaTipo = _contaTipo[1];
  var _contaMoeda = useState('BRL'); var contaMoeda = _contaMoeda[0]; var setContaMoeda = _contaMoeda[1];
  var _contaSaldo = useState(''); var contaSaldo = _contaSaldo[0]; var setContaSaldo = _contaSaldo[1];

  function onChangeSaldo(t) {
    var nums = t.replace(/\D/g, '');
    if (nums === '') { setContaSaldo(''); return; }
    var centavos = parseInt(nums);
    var reais = (centavos / 100).toFixed(2);
    var parts = reais.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    setContaSaldo(parts[0] + ',' + parts[1]);
  }

  function parseSaldo() {
    return parseFloat((contaSaldo || '').replace(/\./g, '').replace(',', '.')) || 0;
  }

  function contaJaExiste(nomeCheck) {
    var up = nomeCheck.toUpperCase().trim();
    for (var i = 0; i < contas.length; i++) {
      if (contas[i].nome.toUpperCase().trim() === up) return true;
    }
    return false;
  }

  function handleSugestao(s) {
    setContaNome(s);
    var meta2 = getInstitutionMeta(s);
    if (meta2) {
      if (meta2.moeda) setContaMoeda(meta2.moeda);
      if (meta2.tipo) setContaTipo(meta2.tipo);
    }
  }

  function handleAdicionarConta() {
    var nomeNorm = contaNome.trim();
    if (nomeNorm.length < 2) {
      Alert.alert('Nome inválido', 'Informe pelo menos 2 caracteres.');
      return;
    }
    if (contaJaExiste(nomeNorm)) {
      Alert.alert('Conta duplicada', 'Você já adicionou ' + nomeNorm + '.');
      return;
    }
    var novaConta = {
      nome: nomeNorm,
      tipo: contaTipo,
      moeda: contaMoeda,
      saldo: parseSaldo(),
    };
    setContas(contas.concat([novaConta]));
    // Reset form
    setContaNome('');
    setContaTipo('corretora');
    setContaMoeda('BRL');
    setContaSaldo('');
  }

  function handleRemoverConta(idx) {
    var next = [];
    for (var i = 0; i < contas.length; i++) {
      if (i !== idx) next.push(contas[i]);
    }
    setContas(next);
  }

  var canNext = function() {
    if (step === 1 && !nome.trim()) return false;
    if (step === 3 && !meta) return false;
    return true;
  };

  var handleNext = async function() {
    if (step < 3) {
      setStep(step + 1);
    } else {
      try {
        await completeOnboarding({
          nome: nome.trim(),
          contas: contas,
          meta: parseInt(meta) || 6000,
        });
      } catch (e) {
        Alert.alert('Erro', 'Falha ao salvar. Tente novamente.');
      }
    }
  };

  var FEATURES = [
    { icon: '◫', label: 'Carteira', color: C.acoes },
    { icon: '⚡', label: 'Opções', color: C.opcoes },
    { icon: '◈', label: 'Proventos', color: C.fiis },
    { icon: '⬡', label: 'Renda Fixa', color: C.rf },
  ];

  var simbolo = getSymbol(contaMoeda);
  var canAdd = contaNome.trim().length >= 2;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Progress dots */}
        <View style={styles.dots}>
          {[0, 1, 2, 3].map(function(i) {
            return (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === step && styles.dotActive,
                  i < step && styles.dotDone,
                ]}
              />
            );
          })}
        </View>

        {/* Step 0: Welcome */}
        {step === 0 && (
          <View style={styles.stepContent}>
            <LinearGradient
              colors={[C.accent, C.opcoes]}
              style={styles.welcomeLogo}
            >
              <Text style={styles.welcomeIcon}>◈</Text>
            </LinearGradient>
            <Text style={styles.stepTitle}>Bem-vindo ao PremioLab</Text>
            <Text style={styles.stepDesc}>
              Seu laboratório completo de investimentos com foco em opções, ações, FIIs e renda fixa.
            </Text>
            <View style={styles.features}>
              {FEATURES.map(function(f, i) {
                return (
                  <View key={i} style={styles.featureItem}>
                    <View style={[styles.featureIcon, { borderColor: f.color + '30' }]}>
                      <Text style={[styles.featureIconText, { color: f.color }]}>
                        {f.icon}
                      </Text>
                    </View>
                    <Text style={styles.featureLabel}>{f.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Step 1: Name */}
        {step === 1 && (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Qual seu nome?</Text>
            <Text style={styles.stepDesc}>
              Para personalizar sua experiência
            </Text>
            <TextInput
              value={nome}
              onChangeText={setNome}
              placeholder="Seu nome"
              placeholderTextColor={C.dim}
              autoFocus
              style={styles.bigInput}
            />
          </View>
        )}

        {/* Step 2: Contas */}
        {step === 2 && (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Suas contas</Text>
            <Text style={styles.stepDesc}>
              Cadastre suas corretoras e bancos com saldo
            </Text>

            {/* Sugestões rápidas */}
            <View style={styles.pillGrid}>
              {SUGESTOES_RAPIDAS.map(function(s) {
                var jaAdicionada = contaJaExiste(s);
                return (
                  <Pill
                    key={s}
                    active={contaNome === s}
                    color={jaAdicionada ? C.dim : C.accent}
                    onPress={function() {
                      if (!jaAdicionada) handleSugestao(s);
                    }}
                  >
                    {s}
                  </Pill>
                );
              })}
            </View>

            {/* Nome da conta */}
            <View style={styles.formSection}>
              <Text style={styles.formLabel}>NOME DA CONTA</Text>
              <TextInput
                value={contaNome}
                onChangeText={setContaNome}
                placeholder="Ex: Clear, Nubank..."
                placeholderTextColor={C.dim}
                style={styles.formInput}
              />
            </View>

            {/* Tipo */}
            <View style={styles.formSection}>
              <Text style={styles.formLabel}>TIPO</Text>
              <View style={styles.pillRow}>
                {TIPOS.map(function(t) {
                  return (
                    <Pill key={t.k} active={contaTipo === t.k} color={C.acoes}
                      onPress={function() { setContaTipo(t.k); }}>
                      {t.l}
                    </Pill>
                  );
                })}
              </View>
            </View>

            {/* Moeda */}
            <View style={styles.formSection}>
              <Text style={styles.formLabel}>MOEDA</Text>
              <View style={styles.pillRow}>
                {MOEDAS_PILLS.map(function(m) {
                  return (
                    <Pill key={m} active={contaMoeda === m} color={C.etfs}
                      onPress={function() { setContaMoeda(m); }}>
                      {m}
                    </Pill>
                  );
                })}
              </View>
            </View>

            {/* Saldo */}
            <View style={styles.formSection}>
              <Text style={styles.formLabel}>SALDO</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 14, color: C.sub, fontFamily: F.mono }}>{simbolo}</Text>
                <TextInput
                  value={contaSaldo}
                  onChangeText={onChangeSaldo}
                  placeholder="0,00"
                  placeholderTextColor={C.dim}
                  keyboardType="decimal-pad"
                  style={[styles.formInput, { flex: 1 }]}
                />
              </View>
            </View>

            {/* Botão Adicionar */}
            <TouchableOpacity
              onPress={handleAdicionarConta}
              disabled={!canAdd}
              activeOpacity={0.8}
              style={[styles.addBtn, !canAdd && { opacity: 0.4 }]}
            >
              <Ionicons name="add-circle-outline" size={18} color={C.accent} />
              <Text style={styles.addBtnText}>Adicionar conta</Text>
            </TouchableOpacity>

            {/* Lista de contas adicionadas */}
            {contas.length > 0 && (
              <View style={styles.contasList}>
                <Text style={styles.formLabel}>CONTAS ADICIONADAS ({contas.length})</Text>
                {contas.map(function(c, idx) {
                  var sym = getSymbol(c.moeda) || c.moeda;
                  return (
                    <View key={idx} style={styles.contaItem}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.contaName}>{c.nome}</Text>
                        <Text style={styles.contaSub}>
                          {c.tipo === 'banco' ? 'Banco' : 'Corretora'} · {c.moeda}
                          {c.saldo > 0 ? ' · ' + sym + ' ' + c.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={function() { handleRemoverConta(idx); }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name="close-circle" size={22} color={C.red + '80'} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Link "Deixar para depois" */}
            <TouchableOpacity
              onPress={function() { setStep(step + 1); }}
              style={styles.skipLink}
              activeOpacity={0.7}
            >
              <Text style={styles.skipText}>Deixar para depois</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step 3: Meta */}
        {step === 3 && (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Meta mensal de renda</Text>
            <Text style={styles.stepDesc}>
              Quanto você quer receber por mês com investimentos?
            </Text>
            <View style={styles.metaInput}>
              <Text style={styles.metaPrefix}>R$</Text>
              <TextInput
                value={meta}
                onChangeText={setMeta}
                keyboardType="numeric"
                style={styles.metaValue}
              />
            </View>
            <View style={styles.pillGrid}>
              {METAS_RAPIDAS.map(function(m) {
                return (
                  <Pill
                    key={m}
                    active={parseInt(meta) === m}
                    color={C.green}
                    onPress={function() { setMeta(String(m)); }}
                  >
                    {'R$ ' + m.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Pill>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom button */}
      <View style={styles.bottomWrap}>
        {step > 0 && (
          <TouchableOpacity
            onPress={function() { setStep(step - 1); }}
            style={styles.backBtn}
          >
            <Text style={styles.backText}>Voltar</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={handleNext}
          disabled={!canNext()}
          activeOpacity={0.8}
          style={[styles.nextBtn, !canNext() && styles.nextDisabled]}
        >
          <LinearGradient
            colors={canNext() ? [C.accent, C.opcoes] : [C.dim, C.dim]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.nextGradient}
          >
            <Text style={styles.nextText}>
              {step === 3 ? 'Começar' : 'Próximo'}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 60, paddingBottom: 24 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 40 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.border },
  dotActive: { backgroundColor: C.accent, width: 24 },
  dotDone: { backgroundColor: C.accent + '50' },
  stepContent: { alignItems: 'center', flex: 1, paddingTop: 20 },
  stepTitle: {
    fontSize: 24, fontWeight: '800', color: C.text,
    fontFamily: F.display, textAlign: 'center', marginBottom: 8,
  },
  stepDesc: {
    fontSize: 13, color: C.sub, fontFamily: F.body,
    textAlign: 'center', lineHeight: 20, marginBottom: 24,
  },
  welcomeLogo: {
    width: 80, height: 80, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
  },
  welcomeIcon: { fontSize: 36, color: 'white' },
  features: { flexDirection: 'row', gap: 16, marginTop: 8 },
  featureItem: { alignItems: 'center', gap: 6 },
  featureIcon: {
    width: 48, height: 48, borderRadius: 14, borderWidth: 1,
    backgroundColor: C.cardSolid, justifyContent: 'center', alignItems: 'center',
  },
  featureIconText: { fontSize: 18 },
  featureLabel: { fontSize: 11, color: C.sub, fontFamily: F.body },
  bigInput: {
    fontSize: 28, fontWeight: '700', color: C.text, fontFamily: F.display,
    textAlign: 'center', borderBottomWidth: 2, borderBottomColor: C.accent,
    paddingVertical: 12, width: '100%', maxWidth: 260,
  },
  pillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', width: '100%' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  formSection: { width: '100%', marginTop: 12, gap: 6 },
  formLabel: { fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8 },
  formInput: {
    backgroundColor: C.cardSolid, borderWidth: 1, borderColor: C.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, color: C.text, fontFamily: F.body,
  },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: C.accent + '40', borderStyle: 'dashed',
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16,
    marginTop: 12, alignSelf: 'center',
  },
  addBtnText: { fontSize: 13, color: C.accent, fontFamily: F.body, fontWeight: '600' },
  contasList: { width: '100%', marginTop: 16, gap: 8 },
  contaItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: C.cardSolid, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: C.border,
  },
  contaName: { fontSize: 14, color: C.text, fontFamily: F.body, fontWeight: '600' },
  contaSub: { fontSize: 11, color: C.sub, fontFamily: F.mono, marginTop: 2 },
  skipLink: { marginTop: 16, paddingVertical: 8 },
  skipText: { fontSize: 13, color: C.dim, fontFamily: F.body, textDecorationLine: 'underline' },
  metaInput: {
    flexDirection: 'row', alignItems: 'baseline', marginBottom: 24,
  },
  metaPrefix: { fontSize: 20, color: C.sub, fontFamily: F.body, marginRight: 4 },
  metaValue: {
    fontSize: 36, fontWeight: '800', color: C.text, fontFamily: F.display,
    borderBottomWidth: 2, borderBottomColor: C.green,
    paddingVertical: 4, minWidth: 120, textAlign: 'center',
  },
  bottomWrap: {
    flexDirection: 'row', paddingHorizontal: 24,
    paddingBottom: 40, paddingTop: 12, gap: 12,
  },
  backBtn: { paddingVertical: 16, paddingHorizontal: 20, justifyContent: 'center' },
  backText: { fontSize: 14, color: C.sub, fontFamily: F.body },
  nextBtn: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  nextDisabled: { opacity: 0.4 },
  nextGradient: { paddingVertical: 16, alignItems: 'center' },
  nextText: { fontSize: 15, fontWeight: '700', color: 'white', fontFamily: F.display },
});
