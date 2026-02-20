import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  TouchableOpacity, Alert, ActivityIndicator, Switch, Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, F, SIZE } from '../../../theme';
import { useAuth } from '../../../contexts/AuthContext';
import { updateProfile, getProfile } from '../../../services/database';
import { Glass, Badge, SectionLabel } from '../../../components';

export default function ConfigSelicScreen(props) {
  var navigation = props.navigation;
  var _auth = useAuth(); var user = _auth.user;
  var _selic = useState(''); var selic = _selic[0]; var setSelic = _selic[1];
  var _selicBCB = useState(null); var selicBCB = _selicBCB[0]; var setSelicBCB = _selicBCB[1];
  var _manual = useState(false); var manual = _manual[0]; var setManual = _manual[1];
  var _history = useState([]); var history = _history[0]; var setHistory = _history[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _saving = useState(false); var saving = _saving[0]; var setSaving = _saving[1];
  var _lastUpdate = useState(''); var lastUpdate = _lastUpdate[0]; var setLastUpdate = _lastUpdate[1];
  var _infoModal = useState(null); var infoModal = _infoModal[0]; var setInfoModal = _infoModal[1];

  useFocusEffect(useCallback(function() {
    load();
  }, []));

  var load = async function() {
    setLoading(true);
    try {
      var profilePromise = getProfile(user.id);
      var selicPromise = fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json')
        .then(function(r) { return r.json(); })
        .catch(function() { return null; });

      var results = await Promise.all([profilePromise, selicPromise]);
      var profile = results[0];
      var selicData = results[1];

      // Selic do BCB
      var bcbRate = null;
      if (selicData && selicData.length > 0) {
        bcbRate = parseFloat(selicData[0].valor);
        setSelicBCB(bcbRate);
        setLastUpdate(selicData[0].data);
      }

      // Perfil do usuario
      var prof = (profile && profile.data) ? profile.data : null;
      var isManual = prof && prof.selic_manual === true;
      setManual(isManual);

      // Historico de alteracoes
      var hist = (prof && prof.selic_history && Array.isArray(prof.selic_history)) ? prof.selic_history : [];
      setHistory(hist);

      // Se manual, usa selic do perfil. Se nao, usa BCB.
      if (isManual && prof && prof.selic != null) {
        setSelic(String(prof.selic));
      } else if (bcbRate != null) {
        setSelic(String(bcbRate));
      } else {
        setSelic('14.75');
      }
    } catch (e) {
      console.warn('ConfigSelic load error:', e);
    }
    setLoading(false);
  };

  var toggleManual = function(val) {
    setManual(val);
    if (!val && selicBCB != null) {
      setSelic(String(selicBCB));
    }
  };

  var save = async function() {
    setSaving(true);
    var newRate = parseFloat(selic) || 14.75;
    var updates = {
      selic: newRate,
      selic_manual: manual,
    };

    // Append to history if rate changed
    var newHistory = history.slice();
    var lastHist = newHistory.length > 0 ? newHistory[newHistory.length - 1] : null;
    if (!lastHist || lastHist.taxa !== newRate) {
      var today = new Date().toISOString().substring(0, 10);
      newHistory.push({ data: today, taxa: newRate });
      updates.selic_history = newHistory;
    }

    var result = await updateProfile(user.id, updates);
    if (result.error) {
      Alert.alert('Erro', 'Falha ao salvar: ' + (result.error.message || 'tente novamente'));
    } else {
      setHistory(updates.selic_history || newHistory);
      Alert.alert('Salvo', 'Taxa Selic atualizada para ' + newRate + '%');
      navigation.goBack();
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={C.accent} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={function() { navigation.goBack(); }}>
          <Text style={styles.back}>{'‹'}</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.title}>Taxa Selic</Text>
          <TouchableOpacity onPress={function() { setInfoModal({ title: 'Taxa Selic', text: 'Taxa usada para cálculo de Black-Scholes, benchmark CDI e simulações de renda fixa.' }); }}>
            <Text style={{ fontSize: 13, color: C.accent }}>ⓘ</Text>
          </TouchableOpacity>
        </View>
        <View style={{ width: 32 }} />
      </View>

      {/* Taxa BCB */}
      {selicBCB != null && (
        <Glass glow={C.green} padding={14}>
          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8 }}>SELIC OFICIAL (BCB)</Text>
          <Text style={{ fontSize: 28, fontWeight: '800', color: C.green, fontFamily: F.display, marginTop: 4 }}>
            {selicBCB.toFixed(2) + '%'}
          </Text>
          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body, marginTop: 2 }}>
            {'Atualizado em ' + lastUpdate}
          </Text>
        </Glass>
      )}

      {/* Toggle taxa manual */}
      <Glass padding={14}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: C.text, fontFamily: F.display }}>Taxa manual</Text>
            <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body, marginTop: 2 }}>
              {manual ? 'Usando taxa personalizada' : 'Usando taxa oficial do BCB'}
            </Text>
          </View>
          <Switch
            value={manual}
            onValueChange={toggleManual}
            trackColor={{ false: C.border, true: C.accent + '60' }}
            thumbColor={manual ? C.accent : C.dim}
          />
        </View>
      </Glass>

      {/* Input taxa */}
      <Glass glow={manual ? C.accent : undefined} padding={20} style={!manual ? { opacity: 0.5 } : undefined}>
        <Text style={styles.inputLabel}>SUA TAXA SELIC (% a.a.)</Text>
        <View style={styles.inputRow}>
          <TextInput
            value={selic}
            onChangeText={manual ? setSelic : undefined}
            editable={manual}
            keyboardType="decimal-pad"
            style={[styles.input, !manual && { color: C.sub }]}
          />
          <Text style={styles.suffix}>%</Text>
        </View>
        {manual && selicBCB != null && String(selicBCB) !== selic && (
          <Text style={{ fontSize: 10, color: C.yellow, fontFamily: F.body, marginTop: 4 }}>
            {'Diferente da oficial (' + selicBCB.toFixed(2) + '%)'}
          </Text>
        )}
        {!manual && (
          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body, marginTop: 4 }}>
            Ative a taxa manual para editar
          </Text>
        )}
      </Glass>

      <TouchableOpacity onPress={save} disabled={saving} activeOpacity={0.8} style={styles.saveBtn}>
        <LinearGradient
          colors={[C.accent, C.opcoes]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.saveGradient}
        >
          {saving ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.saveText}>Salvar</Text>
          )}
        </LinearGradient>
      </TouchableOpacity>

      {/* Historico de alteracoes */}
      {history.length > 0 && (
        <>
          <SectionLabel>HISTÓRICO DE ALTERAÇÕES</SectionLabel>
          <Glass padding={0}>
            {history.slice().reverse().map(function(h, i, arr) {
              var prevRate = i < arr.length - 1 ? arr[i + 1].taxa : null;
              var diff = prevRate != null ? h.taxa - prevRate : 0;
              var variacao = diff > 0 ? '+' + diff.toFixed(2) : diff === 0 ? '0.00' : diff.toFixed(2);
              var isUp = diff > 0;
              var isDown = diff < 0;
              var parts = (h.data || '').split('-');
              var dataFmt = parts.length >= 3 ? parts[2] + '/' + parts[1] + '/' + parts[0] : h.data;
              return (
                <View key={i} style={[styles.copomRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                  <Text style={styles.copomDate}>{dataFmt}</Text>
                  <Text style={styles.copomTaxa}>{h.taxa.toFixed(2) + '%'}</Text>
                  {prevRate != null && (
                    <Badge
                      text={variacao === '0.00' ? '=' : variacao}
                      color={isUp ? C.red : isDown ? C.green : C.dim}
                    />
                  )}
                </View>
              );
            })}
          </Glass>
        </>
      )}

      <View style={{ height: 40 }} />

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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  back: { fontSize: 28, color: C.accent, fontWeight: '300' },
  title: { fontSize: 18, fontWeight: '800', color: C.text, fontFamily: F.display },
  inputLabel: { fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'baseline' },
  input: { fontSize: 40, fontWeight: '800', color: C.text, fontFamily: F.display, flex: 1, padding: 0 },
  suffix: { fontSize: 20, color: C.sub, fontFamily: F.body },
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
