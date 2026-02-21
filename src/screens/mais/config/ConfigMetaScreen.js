import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  TouchableOpacity, Alert, Modal,
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
  var _infoModal = useState(null); var infoModal = _infoModal[0]; var setInfoModal = _infoModal[1];

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
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={function() { navigation.goBack(); }}>
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.title}>Meta Mensal</Text>
          <TouchableOpacity onPress={function() { setInfoModal({ title: 'Meta Mensal', text: 'Meta de renda passiva mensal (prêmios + dividendos + RF). Usada no gauge da Home.' }); }}>
            <Text style={{ fontSize: 13, color: C.accent }}>ⓘ</Text>
          </TouchableOpacity>
        </View>
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

      <Modal visible={infoModal !== null} animationType="fade" transparent={true}
        onRequestClose={function() { setInfoModal(null); }}>
        <TouchableOpacity activeOpacity={1} onPress={function() { setInfoModal(null); }}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 30 }}>
          <TouchableOpacity activeOpacity={1}
            style={{ backgroundColor: C.card, borderRadius: 14, padding: 20, maxWidth: 340, width: '100%', borderWidth: 1, borderColor: C.border }}>
            <Text style={{ fontSize: 13, color: C.text, fontFamily: F.display, fontWeight: '700', marginBottom: 10 }}>
              {infoModal && infoModal.title || ''}
            </Text>
            <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body, lineHeight: 18 }}>
              {infoModal && infoModal.text || ''}
            </Text>
            <TouchableOpacity onPress={function() { setInfoModal(null); }}
              style={{ marginTop: 14, alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 8, borderRadius: 8, backgroundColor: C.accent }}>
              <Text style={{ fontSize: 12, color: C.text, fontFamily: F.mono, fontWeight: '600' }}>Fechar</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
  inputLabel: { fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'baseline' },
  prefix: { fontSize: 20, color: C.sub, fontFamily: F.body, marginRight: 4 },
  input: { fontSize: 36, fontWeight: '800', color: C.text, fontFamily: F.display, flex: 1, padding: 0 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  saveBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 8 },
  saveGradient: { paddingVertical: 16, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '700', color: 'white', fontFamily: F.display },
});
