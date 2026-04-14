// ═══════════════════════════════════════════════════════════
// AddAlertaPrecoScreen — Criar alerta de preco para ativo
// Reutiliza tabela alertas_opcoes com tipo_alerta='preco_ativo'
// ═══════════════════════════════════════════════════════════

import React from 'react';
var useState = React.useState;
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  Alert, Keyboard, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, SIZE } from '../../theme';
import { Glass, Pill } from '../../components';
import { useAuth } from '../../contexts/AuthContext';
import { addAlertaOpcao } from '../../services/database';
import Toast from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';

export default function AddAlertaPrecoScreen(props) {
  var navigation = props.navigation;
  var route = props.route;
  var params = route && route.params ? route.params : {};
  var user = useAuth().user;

  var _ticker = useState(params.ticker || ''); var ticker = _ticker[0]; var setTicker = _ticker[1];
  var _preco = useState(''); var preco = _preco[0]; var setPreco = _preco[1];
  var _direcao = useState('abaixo'); var direcao = _direcao[0]; var setDirecao = _direcao[1];
  var _saving = useState(false); var saving = _saving[0]; var setSaving = _saving[1];
  var _saved = useState(false); var saved = _saved[0]; var setSaved = _saved[1];

  var precoAtual = params.precoAtual || null;

  function onChangePreco(text) {
    var clean = text.replace(/[^0-9]/g, '');
    if (!clean) { setPreco(''); return; }
    var cents = parseInt(clean);
    var reais = (cents / 100).toFixed(2);
    var parts = reais.split('.');
    var intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    setPreco(intPart + ',' + parts[1]);
  }

  function parsePreco() {
    if (!preco) return 0;
    return parseFloat(preco.replace(/\./g, '').replace(',', '.')) || 0;
  }

  function handleSave() {
    Keyboard.dismiss();
    if (!ticker.trim()) {
      Alert.alert('Ticker', 'Informe o ticker do ativo.');
      return;
    }
    var val = parsePreco();
    if (val <= 0) {
      Alert.alert('Preco', 'Informe um preco-alvo valido.');
      return;
    }
    if (saved) return;
    setSaving(true);

    var tickerUp = ticker.toUpperCase().trim();
    var payload = {
      ativo_base: tickerUp,
      ticker_opcao: tickerUp,
      tipo_alerta: 'preco',
      valor_alvo: val,
      direcao: direcao,
      ativo: true,
    };

    addAlertaOpcao(user.id, payload).then(function(res) {
      setSaving(false);
      if (res.error) {
        Alert.alert('Erro', res.error.message || 'Falha ao criar alerta.');
        return;
      }
      setSaved(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Toast.show({
        type: 'success',
        text1: 'Alerta criado',
        text2: ticker.toUpperCase() + ' ' + direcao + ' de R$ ' + preco,
      });
      navigation.goBack();
    }).catch(function() {
      setSaving(false);
      Alert.alert('Erro', 'Falha ao criar alerta.');
    });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={function() { navigation.goBack(); }}>
          <Ionicons name="chevron-back" size={28} color={C.accent} />
        </TouchableOpacity>
        <Text style={styles.title}>Novo Alerta de Preco</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Ticker */}
      <Text style={styles.label}>TICKER</Text>
      <TextInput
        value={ticker}
        onChangeText={function(t) { setTicker(t.toUpperCase().replace(/[^A-Z0-9]/g, '')); }}
        placeholder="PETR4"
        placeholderTextColor={C.dim}
        autoCapitalize="characters"
        style={styles.input}
        maxLength={10}
      />

      {precoAtual ? (
        <Text style={styles.precoAtualText}>Preco atual: R$ {precoAtual.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
      ) : null}

      {/* Direcao */}
      <Text style={styles.label}>NOTIFICAR QUANDO</Text>
      <View style={styles.pillRow}>
        <Pill active={direcao === 'abaixo'} color={C.green}
          onPress={function() { setDirecao('abaixo'); }}>Cair abaixo de</Pill>
        <Pill active={direcao === 'acima'} color={C.red}
          onPress={function() { setDirecao('acima'); }}>Subir acima de</Pill>
      </View>

      {/* Preco alvo */}
      <Text style={styles.label}>PRECO-ALVO</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={styles.prefix}>R$</Text>
        <TextInput
          value={preco}
          onChangeText={onChangePreco}
          placeholder="0,00"
          placeholderTextColor={C.dim}
          keyboardType="decimal-pad"
          style={[styles.input, { flex: 1 }]}
        />
      </View>

      {/* Info */}
      <Glass style={styles.infoCard}>
        <Ionicons name="notifications-outline" size={16} color={C.accent} />
        <Text style={styles.infoText}>
          Voce recebera uma notificacao push quando {ticker || 'o ativo'} {direcao === 'abaixo' ? 'cair abaixo' : 'subir acima'} de R$ {preco || '0,00'}. Alertas sao verificados a cada 5 minutos em horario de mercado.
        </Text>
      </Glass>

      {/* Submit */}
      <TouchableOpacity
        onPress={handleSave}
        disabled={!ticker.trim() || !preco || saving}
        style={[styles.submitBtn, (!ticker.trim() || !preco) && { opacity: 0.4 }]}
      >
        {saving ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.submitText}>Criar Alerta</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: SIZE.padding, gap: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  title: { fontSize: 18, fontWeight: '800', color: C.text, fontFamily: F.display },
  label: { fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginTop: 8 },
  input: {
    backgroundColor: C.cardSolid, borderWidth: 1, borderColor: C.borderLight,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: C.text, fontFamily: F.body,
  },
  prefix: { fontSize: 14, color: C.sub, fontFamily: F.mono, marginRight: 8 },
  pillRow: { flexDirection: 'row', gap: 8 },
  precoAtualText: { fontSize: 12, fontFamily: F.mono, color: C.dim, marginTop: 4 },
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, marginTop: 8 },
  infoText: { fontSize: 12, fontFamily: F.body, color: C.textSecondary, flex: 1, lineHeight: 18 },
  submitBtn: { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 16 },
  submitText: { fontSize: 15, fontWeight: '700', color: 'white', fontFamily: F.display },
});
