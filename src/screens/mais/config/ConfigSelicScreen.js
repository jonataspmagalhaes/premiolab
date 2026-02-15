import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  TouchableOpacity, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, F, SIZE } from '../../../theme';
import { useAuth } from '../../../contexts/AuthContext';
import { updateProfile } from '../../../services/database';
import { Glass, Badge, SectionLabel } from '../../../components';

const COPOM = [
  { data: '29/01/2026', taxa: 13.25, var: '+1.00' },
  { data: '11/12/2025', taxa: 12.25, var: '+1.00' },
  { data: '06/11/2025', taxa: 11.25, var: '+0.50' },
  { data: '18/09/2025', taxa: 10.75, var: '+0.25' },
  { data: '30/07/2025', taxa: 10.50, var: '0.00' },
  { data: '18/06/2025', taxa: 10.50, var: '-0.50' },
  { data: '07/05/2025', taxa: 11.00, var: '-0.50' },
  { data: '19/03/2025', taxa: 11.50, var: '-0.50' },
];

export default function ConfigSelicScreen({ navigation }) {
  const { user } = useAuth();
  const [selic, setSelic] = useState('13.25');

  const save = async () => {
    const { error } = await updateProfile(user.id, { selic: parseFloat(selic) || 13.25 });
    if (error) Alert.alert('Erro', 'Falha ao salvar');
    else {
      Alert.alert('Salvo', 'Taxa Selic atualizada');
      navigation.goBack();
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Taxa Selic</Text>
        <View style={{ width: 32 }} />
      </View>

      <Glass glow={C.accent} padding={20}>
        <Text style={styles.inputLabel}>SELIC ATUAL (% a.a.)</Text>
        <View style={styles.inputRow}>
          <TextInput
            value={selic}
            onChangeText={setSelic}
            keyboardType="decimal-pad"
            style={styles.input}
          />
          <Text style={styles.suffix}>%</Text>
        </View>
        <Text style={styles.lastUpdate}>Última reunião COPOM: {COPOM[0].data}</Text>
      </Glass>

      <TouchableOpacity onPress={save} activeOpacity={0.8} style={styles.saveBtn}>
        <LinearGradient
          colors={[C.accent, C.opcoes]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.saveGradient}
        >
          <Text style={styles.saveText}>Salvar</Text>
        </LinearGradient>
      </TouchableOpacity>

      <SectionLabel>HISTÓRICO COPOM</SectionLabel>
      <Glass padding={0}>
        {COPOM.map((c, i) => {
          const isUp = c.var.startsWith('+') && c.var !== '+0.00';
          const isDown = c.var.startsWith('-');
          return (
            <View key={i} style={[styles.copomRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
              <Text style={styles.copomDate}>{c.data}</Text>
              <Text style={styles.copomTaxa}>{c.taxa.toFixed(2)}%</Text>
              <Badge
                text={c.var === '0.00' ? '=' : c.var}
                color={isUp ? C.red : isDown ? C.green : C.dim}
              />
            </View>
          );
        })}
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
  inputLabel: { fontSize: 8, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'baseline' },
  input: { fontSize: 40, fontWeight: '800', color: C.text, fontFamily: F.display, flex: 1, padding: 0 },
  suffix: { fontSize: 20, color: C.sub, fontFamily: F.body },
  lastUpdate: { fontSize: 9, color: C.dim, fontFamily: F.body, marginTop: 8 },
  saveBtn: { borderRadius: 14, overflow: 'hidden' },
  saveGradient: { paddingVertical: 16, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '700', color: 'white', fontFamily: F.display },
  copomRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: 12,
  },
  copomDate: { fontSize: 10, color: C.sub, fontFamily: F.mono, flex: 1 },
  copomTaxa: { fontSize: 12, fontWeight: '700', color: C.text, fontFamily: F.mono, marginRight: 8 },
});
