import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  TouchableOpacity, Alert, ActivityIndicator,
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
  var _copom = useState([]); var copom = _copom[0]; var setCopom = _copom[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _saving = useState(false); var saving = _saving[0]; var setSaving = _saving[1];
  var _lastUpdate = useState(''); var lastUpdate = _lastUpdate[0]; var setLastUpdate = _lastUpdate[1];

  useFocusEffect(useCallback(function() {
    load();
  }, []));

  var load = async function() {
    setLoading(true);
    try {
      // Buscar Selic atual do BCB + perfil em paralelo
      var profilePromise = getProfile(user.id);
      var selicPromise = fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json')
        .then(function(r) { return r.json(); })
        .catch(function() { return null; });
      var copomPromise = fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/10?formato=json')
        .then(function(r) { return r.json(); })
        .catch(function() { return null; });

      var results = await Promise.all([profilePromise, selicPromise, copomPromise]);
      var profile = results[0];
      var selicData = results[1];
      var copomData = results[2];

      // Selic do BCB
      var bcbRate = null;
      if (selicData && selicData.length > 0) {
        bcbRate = parseFloat(selicData[0].valor);
        setSelicBCB(bcbRate);
        setLastUpdate(selicData[0].data);
      }

      // Perfil do usuario
      var profileSelic = (profile && profile.data) ? profile.data.selic : null;

      // Se o perfil tem selic, usa; senao usa a do BCB
      if (profileSelic != null) {
        setSelic(String(profileSelic));
      } else if (bcbRate != null) {
        setSelic(String(bcbRate));
      } else {
        setSelic('14.25');
      }

      // Historico COPOM do BCB
      if (copomData && copomData.length > 1) {
        var hist = [];
        for (var i = copomData.length - 1; i >= 0; i--) {
          var taxa = parseFloat(copomData[i].valor);
          var prevTaxa = i > 0 ? parseFloat(copomData[i - 1].valor) : taxa;
          var diff = taxa - prevTaxa;
          var variacao = diff > 0 ? '+' + diff.toFixed(2) : diff === 0 ? '0.00' : diff.toFixed(2);
          hist.push({ data: copomData[i].data, taxa: taxa, variacao: variacao });
        }
        setCopom(hist);
      }
    } catch (e) {
      console.warn('ConfigSelic load error:', e);
    }
    setLoading(false);
  };

  var save = async function() {
    setSaving(true);
    var result = await updateProfile(user.id, { selic: parseFloat(selic) || 14.25 });
    if (result.error) {
      Alert.alert('Erro', 'Falha ao salvar: ' + (result.error.message || 'tente novamente'));
    } else {
      Alert.alert('Salvo', 'Taxa Selic atualizada para ' + selic + '%');
      navigation.goBack();
    }
    setSaving(false);
  };

  var useBCB = function() {
    if (selicBCB != null) {
      setSelic(String(selicBCB));
    }
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
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Taxa Selic</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Taxa BCB */}
      {selicBCB != null && (
        <Glass glow={C.green} padding={14}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8 }}>SELIC OFICIAL (BCB)</Text>
              <Text style={{ fontSize: 28, fontWeight: '800', color: C.green, fontFamily: F.display, marginTop: 4 }}>
                {selicBCB.toFixed(2) + '%'}
              </Text>
              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body, marginTop: 2 }}>
                {'Atualizado em ' + lastUpdate}
              </Text>
            </View>
            {String(selicBCB) !== selic && (
              <TouchableOpacity onPress={useBCB} activeOpacity={0.8} style={{
                backgroundColor: C.green + '18', borderWidth: 1, borderColor: C.green + '40',
                borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
              }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: C.green, fontFamily: F.display }}>Usar esta</Text>
              </TouchableOpacity>
            )}
          </View>
        </Glass>
      )}

      {/* Input manual */}
      <Glass glow={C.accent} padding={20}>
        <Text style={styles.inputLabel}>SUA TAXA SELIC (% a.a.)</Text>
        <View style={styles.inputRow}>
          <TextInput
            value={selic}
            onChangeText={setSelic}
            keyboardType="decimal-pad"
            style={styles.input}
          />
          <Text style={styles.suffix}>%</Text>
        </View>
        {selicBCB != null && String(selicBCB) !== selic && (
          <Text style={{ fontSize: 10, color: C.yellow, fontFamily: F.body, marginTop: 4 }}>
            Diferente da taxa oficial ({selicBCB.toFixed(2) + '%'})
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

      {/* Historico COPOM do BCB */}
      {copom.length > 0 && (
        <>
          <SectionLabel>HISTORICO COPOM (BCB)</SectionLabel>
          <Glass padding={0}>
            {copom.map(function(c, i) {
              var isUp = c.variacao.startsWith('+') && c.variacao !== '+0.00';
              var isDown = c.variacao.startsWith('-');
              return (
                <View key={i} style={[styles.copomRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                  <Text style={styles.copomDate}>{c.data}</Text>
                  <Text style={styles.copomTaxa}>{c.taxa.toFixed(2) + '%'}</Text>
                  <Badge
                    text={c.variacao === '0.00' ? '=' : c.variacao}
                    color={isUp ? C.red : isDown ? C.green : C.dim}
                  />
                </View>
              );
            })}
          </Glass>
        </>
      )}

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
