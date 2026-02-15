import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Switch, TextInput, Alert,
} from 'react-native';
import { C, F, SIZE } from '../../../theme';
import { useAuth } from '../../../contexts/AuthContext';
import { getAlertasConfig, updateAlertasConfig } from '../../../services/database';
import { Glass, SectionLabel } from '../../../components';

const ALERT_TYPES = [
  { key: 'descobertas', label: 'Opções descobertas', desc: 'Alerta quando há CALL sem cobertura', color: C.red },
  { key: 'margem', label: 'Margem de garantia', desc: 'Percentual mínimo', color: C.etfs, threshold: '%' },
  { key: 'vencimento', label: 'Próximo vencimento', desc: 'Dias antes do vencimento', color: C.opcoes, threshold: 'dias' },
  { key: 'proventos', label: 'Proventos a receber', desc: 'Notificar sobre dividendos e JCP', color: C.fiis },
  { key: 'meta', label: 'Meta mensal', desc: 'Progresso da meta de renda', color: C.accent },
  { key: 'variacao', label: 'Variação de preço', desc: 'Percentual de variação', color: C.acoes, threshold: '%' },
];

export default function ConfigAlertasScreen({ navigation }) {
  const { user } = useAuth();
  const [config, setConfig] = useState({});

  useEffect(() => { load(); }, []);

  const load = async () => {
    if (!user) return;
    const { data } = await getAlertasConfig(user.id);
    if (data) setConfig(data);
  };

  const toggle = (key) => {
    setConfig((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const setThreshold = (key, val) => {
    setConfig((prev) => ({ ...prev, [`${key}_threshold`]: val }));
  };

  const save = async () => {
    const { error } = await updateAlertasConfig(user.id, config);
    if (error) Alert.alert('Erro', 'Falha ao salvar');
    else {
      Alert.alert('Salvo', 'Alertas atualizados');
      navigation.goBack();
    }
  };

  const activeCount = ALERT_TYPES.filter((t) => config[t.key]).length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Alertas</Text>
        <TouchableOpacity onPress={save}>
          <Text style={styles.saveBtn}>Salvar</Text>
        </TouchableOpacity>
      </View>

      <SectionLabel right={`${activeCount} de ${ALERT_TYPES.length} ativados`}>TIPOS DE ALERTA</SectionLabel>

      <Glass padding={0}>
        {ALERT_TYPES.map((t, i) => (
          <View key={t.key}>
            <View style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.alertLabel}>{t.label}</Text>
                <Text style={styles.alertDesc}>{t.desc}</Text>
              </View>
              <Switch
                value={!!config[t.key]}
                onValueChange={() => toggle(t.key)}
                trackColor={{ false: C.border, true: t.color + '60' }}
                thumbColor={config[t.key] ? t.color : C.dim}
              />
            </View>
            {t.threshold && config[t.key] && (
              <View style={styles.thresholdRow}>
                <Text style={styles.thresholdLabel}>Limite:</Text>
                <TextInput
                  value={String(config[`${t.key}_threshold`] || '')}
                  onChangeText={(v) => setThreshold(t.key, v)}
                  keyboardType="numeric"
                  style={styles.thresholdInput}
                />
                <Text style={styles.thresholdSuffix}>{t.threshold}</Text>
              </View>
            )}
          </View>
        ))}
      </Glass>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: SIZE.gap },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  back: { fontSize: 28, color: C.accent, fontWeight: '300' },
  title: { fontSize: 18, fontWeight: '800', color: C.text, fontFamily: F.display },
  saveBtn: { fontSize: 14, color: C.accent, fontWeight: '600', fontFamily: F.body },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
  alertLabel: { fontSize: 12, fontWeight: '600', color: C.text, fontFamily: F.display },
  alertDesc: { fontSize: 9, color: C.dim, fontFamily: F.body, marginTop: 1 },
  thresholdRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingBottom: 10,
  },
  thresholdLabel: { fontSize: 9, color: C.sub, fontFamily: F.body },
  thresholdInput: {
    width: 60, height: 30, backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border, borderRadius: 6,
    textAlign: 'center', color: C.text, fontSize: 13, fontFamily: F.mono,
  },
  thresholdSuffix: { fontSize: 9, color: C.dim, fontFamily: F.mono },
});
