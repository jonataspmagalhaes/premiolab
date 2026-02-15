import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { Pill } from '../../components/Primitives';

const CORRETORAS = [
  'Clear', 'XP', 'Rico', 'Inter', 'BTG Pactual',
  'Nubank', 'Genial', 'Modal', 'Itaú', 'Bradesco',
];

const METAS_RAPIDAS = [3000, 5000, 6000, 8000, 10000, 15000];

export default function OnboardingScreen() {
  const { completeOnboarding } = useAuth();
  const [step, setStep] = useState(0);
  const [nome, setNome] = useState('');
  const [corretoras, setCorretoras] = useState([]);
  const [meta, setMeta] = useState('6000');

  const toggleCorretora = (c) => {
    setCorretoras((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  };

  const canNext = () => {
    if (step === 1 && !nome.trim()) return false;
    if (step === 2 && corretoras.length === 0) return false;
    if (step === 3 && !meta) return false;
    return true;
  };

  const handleNext = async () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      try {
        await completeOnboarding({
          nome: nome.trim(),
          corretoras,
          meta: parseInt(meta) || 6000,
        });
      } catch {
        Alert.alert('Erro', 'Falha ao salvar. Tente novamente.');
      }
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Progress dots */}
        <View style={styles.dots}>
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === step && styles.dotActive,
                i < step && styles.dotDone,
              ]}
            />
          ))}
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
              {[
                { icon: '◫', label: 'Carteira', color: C.acoes },
                { icon: '⚡', label: 'Opções', color: C.opcoes },
                { icon: '◈', label: 'Proventos', color: C.fiis },
                { icon: '⬡', label: 'Renda Fixa', color: C.rf },
              ].map((f, i) => (
                <View key={i} style={styles.featureItem}>
                  <View style={[styles.featureIcon, { borderColor: f.color + '30' }]}>
                    <Text style={[styles.featureIconText, { color: f.color }]}>
                      {f.icon}
                    </Text>
                  </View>
                  <Text style={styles.featureLabel}>{f.label}</Text>
                </View>
              ))}
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

        {/* Step 2: Corretoras */}
        {step === 2 && (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Suas corretoras</Text>
            <Text style={styles.stepDesc}>
              Selecione onde você tem conta ({corretoras.length} selecionadas)
            </Text>
            <View style={styles.pillGrid}>
              {CORRETORAS.map((c) => (
                <Pill
                  key={c}
                  active={corretoras.includes(c)}
                  color={C.accent}
                  onPress={() => toggleCorretora(c)}
                >
                  {c}
                </Pill>
              ))}
            </View>
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
              {METAS_RAPIDAS.map((m) => (
                <Pill
                  key={m}
                  active={parseInt(meta) === m}
                  color={C.green}
                  onPress={() => setMeta(String(m))}
                >
                  R$ {m.toLocaleString('pt-BR')}
                </Pill>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom button */}
      <View style={styles.bottomWrap}>
        {step > 0 && (
          <TouchableOpacity
            onPress={() => setStep(step - 1)}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 60 },
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
    textAlign: 'center', lineHeight: 20, marginBottom: 32,
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
  featureLabel: { fontSize: 9, color: C.sub, fontFamily: F.body },
  bigInput: {
    fontSize: 28, fontWeight: '700', color: C.text, fontFamily: F.display,
    textAlign: 'center', borderBottomWidth: 2, borderBottomColor: C.accent,
    paddingVertical: 12, width: '100%', maxWidth: 260,
  },
  pillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
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
