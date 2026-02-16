import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { C, F, SIZE } from '../../../theme';
import { useAuth } from '../../../contexts/AuthContext';
import { getUserCorretoras, incrementCorretora } from '../../../services/database';
import { Glass, Badge, Pill, SectionLabel } from '../../../components';
import { TouchableOpacity } from 'react-native';

var AVAILABLE = ['Clear', 'XP', 'Rico', 'Modal', 'Genial', 'Inter', 'Nubank', 'Itau', 'Bradesco', 'BB', 'BTG Pactual', 'Santander'];

export default function ConfigCorretorasScreen(props) {
  var navigation = props.navigation;
  var _auth = useAuth(); var user = _auth.user;
  var _corretoras = useState([]); var corretoras = _corretoras[0]; var setCorretoras = _corretoras[1];
  var _adding = useState(false); var adding = _adding[0]; var setAdding = _adding[1];

  useEffect(function() { load(); }, []);

  var load = async function() {
    if (!user) return;
    var result = await getUserCorretoras(user.id);
    setCorretoras(result.data || []);
  };

  var handleAdd = async function(name) {
    if (adding || !user) return;
    setAdding(true);
    try {
      await incrementCorretora(user.id, name);
      await load();
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível adicionar a corretora.');
    }
    setAdding(false);
  };

  var active = corretoras.filter(function(c) { return c.count > 0; });
  var activeNames = active.map(function(c) { return c.name; });
  var available = AVAILABLE.filter(function(c) { return activeNames.indexOf(c) === -1; });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={function() { navigation.goBack(); }}>
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Corretoras</Text>
        <View style={{ width: 32 }} />
      </View>

      <SectionLabel right={active.length + ' ativas'}>ATIVAS</SectionLabel>
      <Glass padding={0}>
        {active.length === 0 ? (
          <Text style={styles.empty}>Nenhuma corretora ativa</Text>
        ) : (
          active.map(function(c, i) {
            return (
              <View key={i} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.name}>{c.name}</Text>
                  <Badge text={c.count + '\u00D7'} color={C.accent} />
                </View>
                <Badge text="ATIVA" color={C.green} />
              </View>
            );
          })
        )}
      </Glass>

      <SectionLabel>ADICIONAR</SectionLabel>
      <View style={styles.pillGrid}>
        {available.map(function(c) {
          return (
            <Pill key={c} color={C.acoes} onPress={function() { handleAdd(c); }}>
              + {c}
            </Pill>
          );
        })}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

var styles = StyleSheet.create({
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
