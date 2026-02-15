import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import { C, F, SIZE } from '../../../theme';
import { useAuth } from '../../../contexts/AuthContext';
import { getUserCorretoras } from '../../../services/database';
import { Glass, Badge, Pill, SectionLabel } from '../../../components';

const AVAILABLE = ['Clear', 'XP', 'Rico', 'Modal', 'Genial', 'Inter', 'Nubank', 'Itaú', 'Bradesco', 'BB', 'BTG Pactual', 'Santander'];

export default function ConfigCorretorasScreen({ navigation }) {
  const { user } = useAuth();
  const [corretoras, setCorretoras] = useState([]);

  useEffect(() => { load(); }, []);

  const load = async () => {
    if (!user) return;
    const { data } = await getUserCorretoras(user.id);
    setCorretoras(data || []);
  };

  const active = corretoras.filter((c) => c.count > 0);
  const activeNames = active.map((c) => c.name);
  const available = AVAILABLE.filter((c) => !activeNames.includes(c));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Corretoras</Text>
        <View style={{ width: 32 }} />
      </View>

      <SectionLabel right={`${active.length} ativas`}>ATIVAS</SectionLabel>
      <Glass padding={0}>
        {active.length === 0 ? (
          <Text style={styles.empty}>Nenhuma corretora ativa</Text>
        ) : (
          active.map((c, i) => (
            <View key={i} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.name}>{c.name}</Text>
                <Badge text={`${c.count}×`} color={C.accent} />
              </View>
              <Badge text="ATIVA" color={C.green} />
            </View>
          ))
        )}
      </Glass>

      <SectionLabel>ADICIONAR</SectionLabel>
      <View style={styles.pillGrid}>
        {available.map((c) => (
          <Pill key={c} color={C.acoes} onPress={() => {/* TODO: add */}}>
            + {c}
          </Pill>
        ))}
      </View>

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
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  name: { fontSize: 13, fontWeight: '600', color: C.text, fontFamily: F.display },
  empty: { padding: 20, fontSize: 11, color: C.dim, fontFamily: F.body, textAlign: 'center' },
  pillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
