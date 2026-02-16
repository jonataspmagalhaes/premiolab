import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  TouchableOpacity, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, F, SIZE } from '../../../theme';
import { useAuth } from '../../../contexts/AuthContext';
import { getProfile, updateProfile } from '../../../services/database';
import { Glass, Pill, SectionLabel } from '../../../components';

var QUICK = [3000, 5000, 6000, 8000, 10000, 15000];

export default function ConfigMetaScreen(props) {
  var navigation = props.navigation;
  var _auth = useAuth(); var user = _auth.user;
  var _meta = useState('6000'); var meta = _meta[0]; var setMeta = _meta[1];
  var _saving = useState(false); var saving = _saving[0]; var setSaving = _saving[1];

  useEffect(function() { loadMeta(); }, []);

  var loadMeta = async function() {
    if (!user) return;
    var result = await getProfile(user.id);
    if (result.data && result.data.meta_mensal) setMeta(String(result.data.meta_mensal));
  };

  var save = async function() {
    setSaving(true);
    var result = await updateProfile(user.id, { meta_mensal: parseInt(meta) || 6000 });
    setSaving(false);
    if (result.error) {
      Alert.alert('Erro', 'Falha ao salvar');
    } else {
      Alert.alert('Salvo', 'Meta atualizada com sucesso');
      navigation.goBack();
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={function() { navigation.goBack(); }}>
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Meta Mensal</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Input */}
      <Glass glow={C.etfs} padding={20}>
        <Text style={styles.inputLabel}>META DE RENDA MENSAL</Text>
        <View style={styles.inputRow}>
          <Text style={styles.prefix}>R$</Text>
          <TextInput
            value={meta}
            onChangeText={setMeta}
            keyboardType="numeric"
            style={styles.input}
          />
        </View>
      </Glass>

      {/* Quick select */}
      <View style={styles.quickGrid}>
        {QUICK.map(function(v) {
          return (
            <Pill
              key={v}
              active={parseInt(meta) === v}
              color={C.etfs}
              onPress={function() { setMeta(String(v)); }}
            >
              {'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Pill>
          );
        })}
      </View>

      {/* Save */}
      <TouchableOpacity onPress={save} disabled={saving} activeOpacity={0.8} style={styles.saveBtn}>
        <LinearGradient
          colors={[C.accent, C.opcoes]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.saveGradient}
        >
          <Text style={styles.saveText}>{saving ? 'Salvando...' : 'Salvar Meta'}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: SIZE.gap },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 8,
  },
  back: { fontSize: 28, color: C.accent, fontWeight: '300' },
  title: { fontSize: 18, fontWeight: '800', color: C.text, fontFamily: F.display },
  inputLabel: { fontSize: 8, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'baseline' },
  prefix: { fontSize: 20, color: C.sub, fontFamily: F.body, marginRight: 4 },
  input: { fontSize: 36, fontWeight: '800', color: C.text, fontFamily: F.display, flex: 1, padding: 0 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  saveBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 8 },
  saveGradient: { paddingVertical: 16, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '700', color: 'white', fontFamily: F.display },
});
