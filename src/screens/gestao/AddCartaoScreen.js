import React from 'react';
var useState = React.useState;
var useEffect = React.useEffect;
var useRef = React.useRef;
var useCallback = React.useCallback;
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  Alert, Keyboard, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Glass, Pill, CurrencyPicker } from '../../components';
import { useAuth } from '../../contexts/AuthContext';
import { addCartao, updateCartao, getSaldos, addRegraPontos, getRegrasPontos, deleteRegraPontos, getPortfolios } from '../../services/database';
import { getSymbol } from '../../services/currencyService';
import { C, F, SIZE } from '../../theme';
import { animateLayout } from '../../utils/a11y';
import Toast from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';
import widgetBridge from '../../services/widgetBridge';
import * as databaseModule from '../../services/database';
import * as currencyServiceModule from '../../services/currencyService';

var BANDEIRAS = ['Visa', 'Mastercard', 'Elo', 'Amex', 'Hipercard', 'Outro'];
var MOEDAS_PILLS = ['BRL', 'USD', 'EUR', 'GBP'];
var BENEFICIOS = [
  { k: 'nenhum', l: 'Nenhum' },
  { k: 'pontos', l: 'Pontos' },
  { k: 'cashback', l: 'Cashback' },
];

function nextRuleId() {
  return '_r' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
}

export default function AddCartaoScreen(props) {
  var navigation = props.navigation;
  var route = props.route;
  var cartaoEdit = route && route.params && route.params.cartao;
  var isEdit = !!cartaoEdit;
  var user = useAuth().user;
  var savedRef = useRef(false);

  // ── Form state ──
  var _digitos = useState(isEdit ? (cartaoEdit.ultimos_digitos || '') : '');
  var digitos = _digitos[0]; var setDigitos = _digitos[1];
  var _bandeira = useState(isEdit ? (cartaoEdit.bandeira || '') : '');
  var bandeira = _bandeira[0]; var setBandeira = _bandeira[1];
  var _apelido = useState(isEdit ? (cartaoEdit.apelido || '') : '');
  var apelido = _apelido[0]; var setApelido = _apelido[1];
  var _diaFech = useState(isEdit ? String(cartaoEdit.dia_fechamento || '') : '');
  var diaFech = _diaFech[0]; var setDiaFech = _diaFech[1];
  var _diaVenc = useState(isEdit ? String(cartaoEdit.dia_vencimento || '') : '');
  var diaVenc = _diaVenc[0]; var setDiaVenc = _diaVenc[1];
  var _limite = useState('');
  var limite = _limite[0]; var setLimite = _limite[1];
  var _moeda = useState(isEdit ? (cartaoEdit.moeda || 'BRL') : 'BRL');
  var moeda = _moeda[0]; var setMoeda = _moeda[1];
  var _contaVinc = useState(isEdit ? (cartaoEdit.conta_vinculada || '') : '');
  var contaVinc = _contaVinc[0]; var setContaVinc = _contaVinc[1];
  var _tipoBenef = useState(isEdit ? (cartaoEdit.tipo_beneficio || 'nenhum') : 'nenhum');
  var tipoBenef = _tipoBenef[0]; var setTipoBenef = _tipoBenef[1];
  var _programaNome = useState(isEdit ? (cartaoEdit.programa_nome || '') : '');
  var programaNome = _programaNome[0]; var setProgramaNome = _programaNome[1];
  var _regras = useState([]);
  var regras = _regras[0]; var setRegras = _regras[1];
  var _regrasOriginais = useState([]);
  var regrasOriginais = _regrasOriginais[0]; var setRegrasOriginais = _regrasOriginais[1];

  // Avançado: abrir auto se editando com campos avançados preenchidos
  var hasAdvancedData = isEdit && (apelido || (moeda && moeda !== 'BRL') || contaVinc || tipoBenef !== 'nenhum');
  var _showAdvanced = useState(hasAdvancedData); var showAdvanced = _showAdvanced[0]; var setShowAdvanced = _showAdvanced[1];

  // ── UI state ──
  var _contas = useState([]);
  var contas = _contas[0]; var setContas = _contas[1];
  var _loading = useState(false);
  var loading = _loading[0]; var setLoading = _loading[1];
  var _submitted = useState(false);
  var submitted = _submitted[0]; var setSubmitted = _submitted[1];
  var _showCurrencyPicker = useState(false);
  var showCurrencyPicker = _showCurrencyPicker[0]; var setShowCurrencyPicker = _showCurrencyPicker[1];

  // ── Portfolio state ──
  var defaultPortfolio = route && route.params && route.params.defaultPortfolio !== undefined ? route.params.defaultPortfolio : (isEdit ? (cartaoEdit.portfolio_id || null) : null);
  var _portfolios = useState([]); var portfolios = _portfolios[0]; var setPortfoliosState = _portfolios[1];
  var _selPortfolioId = useState(defaultPortfolio); var selPortfolioId = _selPortfolioId[0]; var setSelPortfolioId = _selPortfolioId[1];

  useFocusEffect(useCallback(function() {
    if (!user) return;
    getPortfolios(user.id).then(function(res) { setPortfoliosState(res.data || []); }).catch(function() {});
  }, [user]));

  // ── Init limite from edit data ──
  useEffect(function() {
    if (isEdit && cartaoEdit.limite) {
      var v = Number(cartaoEdit.limite);
      if (v > 0) {
        var parts = v.toFixed(2).split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        setLimite(parts[0] + ',' + parts[1]);
      }
    }
  }, []);

  // ── Fetch user accounts for conta_vinculada ──
  useEffect(function() {
    if (!user) return;
    getSaldos(user.id).then(function(result) {
      var list = result.data || [];
      setContas(list);
    }).catch(function() {});
  }, [user]);

  // ── Load existing rules in edit mode ──
  useEffect(function() {
    if (!isEdit || !cartaoEdit.id) return;
    getRegrasPontos(cartaoEdit.id).then(function(result) {
      var list = result.data || [];
      var mapped = [];
      for (var i = 0; i < list.length; i++) {
        mapped.push({
          _id: nextRuleId(),
          dbId: list[i].id,
          moeda: list[i].moeda || '',
          valor_min: list[i].valor_min != null ? String(list[i].valor_min) : '',
          valor_max: list[i].valor_max != null ? String(list[i].valor_max) : '',
          taxa: list[i].taxa != null ? String(list[i].taxa) : '',
        });
      }
      setRegras(mapped);
      setRegrasOriginais(mapped.map(function(r) { return r.dbId; }));
    }).catch(function() {});
  }, []);

  // ── Value mask for limite ──
  function onChangeLimite(t) {
    var nums = t.replace(/[^0-9]/g, '');
    if (!nums) { setLimite(''); return; }
    var cents = parseInt(nums, 10);
    var reais = (cents / 100).toFixed(2);
    var parts = reais.split('.');
    var intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    setLimite(intPart + ',' + parts[1]);
  }

  function parseLimite() {
    return parseFloat((limite || '').replace(/\./g, '').replace(',', '.')) || 0;
  }

  // ── Rules helpers ──
  function addRegra() {
    var newRegras = regras.slice();
    newRegras.push({ _id: nextRuleId(), dbId: null, moeda: '', valor_min: '', valor_max: '', taxa: '' });
    setRegras(newRegras);
  }

  function updateRegra(idx, field, val) {
    var newRegras = regras.slice();
    var updated = {};
    var keys = Object.keys(newRegras[idx]);
    for (var k = 0; k < keys.length; k++) {
      updated[keys[k]] = newRegras[idx][keys[k]];
    }
    updated[field] = val;
    newRegras[idx] = updated;
    setRegras(newRegras);
  }

  function removeRegra(idx) {
    var newRegras = [];
    for (var i = 0; i < regras.length; i++) {
      if (i !== idx) newRegras.push(regras[i]);
    }
    setRegras(newRegras);
  }

  // ── Dirty check for beforeRemove ──
  function isDirty() {
    if (digitos || bandeira || apelido || diaFech || diaVenc || limite) return true;
    return false;
  }

  useEffect(function() {
    return navigation.addListener('beforeRemove', function(e) {
      if (savedRef.current) return;
      if (!isEdit && !isDirty()) return;
      if (isEdit) return; // edit mode always allows back after save
      e.preventDefault();
      Alert.alert('Descartar alterações?', 'Você tem dados não salvos.', [
        { text: 'Continuar editando', style: 'cancel' },
        { text: 'Descartar', style: 'destructive', onPress: function() { navigation.dispatch(e.data.action); } },
      ]);
    });
  }, [navigation, digitos, bandeira, apelido, diaFech, diaVenc, limite]);

  // ── Validation ──
  var digitosValid = /^\d{4}$/.test(digitos);
  var bandeiraValid = bandeira.length > 0;
  var fechValid = diaFech && parseInt(diaFech, 10) >= 1 && parseInt(diaFech, 10) <= 31;
  var vencValid = diaVenc && parseInt(diaVenc, 10) >= 1 && parseInt(diaVenc, 10) <= 31;
  var canSubmit = digitosValid && bandeiraValid && fechValid && vencValid;

  // ── Submit ──
  var handleSubmit = async function() {
    Keyboard.dismiss();
    if (!canSubmit || submitted) return;
    setSubmitted(true);
    setLoading(true);

    try {
      var payload = {
        ultimos_digitos: digitos,
        bandeira: bandeira.toLowerCase(),
        apelido: apelido.trim() || null,
        dia_fechamento: parseInt(diaFech, 10),
        dia_vencimento: parseInt(diaVenc, 10),
        limite: parseLimite() || null,
        moeda: moeda,
        conta_vinculada: contaVinc || null,
        tipo_beneficio: tipoBenef === 'nenhum' ? null : tipoBenef,
        programa_nome: (tipoBenef !== 'nenhum' && programaNome.trim()) ? programaNome.trim() : null,
        portfolio_id: selPortfolioId || null,
      };

      var cartaoId = null;

      if (isEdit) {
        var res = await updateCartao(user.id, cartaoEdit.id, payload);
        if (res.error) {
          Alert.alert('Erro', res.error.message || 'Falha ao atualizar cartão.');
          setSubmitted(false);
          setLoading(false);
          return;
        }
        cartaoId = cartaoEdit.id;

        // Delete removed rules
        for (var d = 0; d < regrasOriginais.length; d++) {
          var dbId = regrasOriginais[d];
          var stillExists = false;
          for (var c = 0; c < regras.length; c++) {
            if (regras[c].dbId === dbId) { stillExists = true; break; }
          }
          if (!stillExists) {
            await deleteRegraPontos(dbId);
          }
        }

        // Add new rules (no dbId)
        for (var a = 0; a < regras.length; a++) {
          if (!regras[a].dbId && regras[a].taxa) {
            await addRegraPontos(cartaoId, {
              moeda: regras[a].moeda || null,
              valor_min: parseFloat(regras[a].valor_min) || 0,
              valor_max: regras[a].valor_max ? parseFloat(regras[a].valor_max) : null,
              taxa: parseFloat(regras[a].taxa) || 0,
            });
          }
        }
      } else {
        var res2 = await addCartao(user.id, payload);
        if (res2.error) {
          Alert.alert('Erro', res2.error.message || 'Falha ao registrar cartão.');
          setSubmitted(false);
          setLoading(false);
          return;
        }
        cartaoId = res2.data && res2.data.id;

        // Add rules
        if (cartaoId && tipoBenef !== 'nenhum') {
          for (var r = 0; r < regras.length; r++) {
            if (regras[r].taxa) {
              await addRegraPontos(cartaoId, {
                moeda: regras[r].moeda || null,
                valor_min: parseFloat(regras[r].valor_min) || 0,
                valor_max: regras[r].valor_max ? parseFloat(regras[r].valor_max) : null,
                taxa: parseFloat(regras[r].taxa) || 0,
              });
            }
          }
        }
      }

      savedRef.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Toast.show({ type: 'success', text1: isEdit ? 'Cartão atualizado' : 'Cartão registrado' });
      widgetBridge.updateWidgetFromContext(user.id, databaseModule, currencyServiceModule).catch(function() {});
      navigation.goBack();
    } catch (err) {
      Alert.alert('Erro', 'Falha ao salvar cartão.');
      setSubmitted(false);
    }
    setLoading(false);
  };

  // ── Card preview text ──
  var previewBandeira = bandeira ? bandeira.toUpperCase() : '----';
  var previewDigitos = digitos || '----';
  var previewFech = diaFech || '--';
  var previewVenc = diaVenc || '--';
  var previewText = previewBandeira + ' •••• ' + previewDigitos + '  —  Fechamento ' + previewFech + '  ·  Vencimento ' + previewVenc;

  var simbolo = getSymbol(moeda);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={function() { navigation.goBack(); }} accessibilityLabel="Voltar" accessibilityRole="button">
          <Ionicons name="chevron-back" size={28} color={C.accent} />
        </TouchableOpacity>
        <Text style={styles.title}>{isEdit ? 'Editar Cartão' : 'Novo Cartão'}</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* ── Últimos 4 dígitos ── */}
      <Text style={styles.label}>ÚLTIMOS 4 DÍGITOS *</Text>
      <TextInput
        value={digitos}
        onChangeText={function(t) { setDigitos(t.replace(/[^0-9]/g, '').substring(0, 4)); }}
        placeholder="1234"
        placeholderTextColor={C.dim}
        keyboardType="numeric"
        maxLength={4}
        autoFocus={!isEdit}
        returnKeyType="next"
        style={[styles.input,
          digitos.length === 4 && digitosValid && { borderColor: C.green },
          digitos.length > 0 && !digitosValid && { borderColor: C.red },
        ]}
      />
      {digitos.length > 0 && !digitosValid ? <Text style={styles.fieldError}>Exatamente 4 dígitos</Text> : null}

      {/* ── Bandeira ── */}
      <Text style={styles.label}>BANDEIRA *</Text>
      <View style={styles.pillRow}>
        {BANDEIRAS.map(function(b) {
          return (
            <Pill key={b} active={bandeira === b} color={C.accent} onPress={function() { setBandeira(b); }}>
              {b}
            </Pill>
          );
        })}
      </View>

      {/* ── Dia fechamento ── */}
      <View style={styles.rowFields}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>DIA DE FECHAMENTO *</Text>
          <TextInput
            value={diaFech}
            onChangeText={function(t) { setDiaFech(t.replace(/[^0-9]/g, '').substring(0, 2)); }}
            placeholder="15"
            placeholderTextColor={C.dim}
            keyboardType="numeric"
            maxLength={2}
            returnKeyType="next"
            style={[styles.input,
              diaFech && fechValid && { borderColor: C.green },
              diaFech && !fechValid && { borderColor: C.red },
            ]}
          />
        </View>
        <View style={{ width: 14 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>DIA DE VENCIMENTO *</Text>
          <TextInput
            value={diaVenc}
            onChangeText={function(t) { setDiaVenc(t.replace(/[^0-9]/g, '').substring(0, 2)); }}
            placeholder="22"
            placeholderTextColor={C.dim}
            keyboardType="numeric"
            maxLength={2}
            returnKeyType="next"
            style={[styles.input,
              diaVenc && vencValid && { borderColor: C.green },
              diaVenc && !vencValid && { borderColor: C.red },
            ]}
          />
        </View>
      </View>

      {/* ── Limite ── */}
      <Text style={styles.label}>LIMITE (OPCIONAL)</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={styles.prefix}>{simbolo}</Text>
        <TextInput
          value={limite}
          onChangeText={onChangeLimite}
          placeholder="0,00"
          placeholderTextColor={C.dim}
          keyboardType="decimal-pad"
          returnKeyType="done"
          style={[styles.input, { flex: 1 }]}
        />
      </View>

      {/* ── Toggle Avançado ── */}
      <TouchableOpacity
        onPress={function() { animateLayout(); setShowAdvanced(!showAdvanced); }}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, marginTop: 4 }}
        activeOpacity={0.7}
      >
        <Ionicons name={showAdvanced ? 'chevron-up' : 'chevron-down'} size={16} color={C.accent} />
        <Text style={{ fontSize: 13, color: C.accent, fontFamily: F.body, marginLeft: 6 }}>
          {showAdvanced ? 'Menos opções' : 'Mais opções'}
        </Text>
      </TouchableOpacity>

      {showAdvanced ? (
        <View>

      {/* ── Apelido ── */}
      <Text style={styles.label}>APELIDO (OPCIONAL)</Text>
      <TextInput
        value={apelido}
        onChangeText={setApelido}
        placeholder="Ex: Nubank Ultravioleta"
        placeholderTextColor={C.dim}
        returnKeyType="next"
        style={styles.input}
      />

      {/* ── Moeda ── */}
      <Text style={styles.label}>MOEDA DO CARTÃO</Text>
      <View style={styles.pillRow}>
        {MOEDAS_PILLS.map(function(m) {
          return (
            <Pill key={m} active={moeda === m} color={C.etfs} onPress={function() { setMoeda(m); }}>
              {getSymbol(m) + ' ' + m}
            </Pill>
          );
        })}
        <Pill active={MOEDAS_PILLS.indexOf(moeda) === -1} color={C.etfs} onPress={function() { setShowCurrencyPicker(true); }}>
          {MOEDAS_PILLS.indexOf(moeda) === -1 ? (getSymbol(moeda) + ' ' + moeda) : 'Outra'}
        </Pill>
      </View>

      <CurrencyPicker
        visible={showCurrencyPicker}
        onClose={function() { setShowCurrencyPicker(false); }}
        onSelect={function(cur) { setMoeda(cur.code); }}
        cardMoeda={moeda}
      />

      {/* ── Conta vinculada ── */}
      <Text style={styles.label}>CONTA VINCULADA (OPCIONAL)</Text>
      <View style={styles.pillRow}>
        <Pill active={!contaVinc} color={C.acoes} onPress={function() { setContaVinc(''); }}>
          Nenhuma
        </Pill>
        {contas.map(function(c) {
          var nome = c.corretora || c.name || '';
          var sym = getSymbol(c.moeda || 'BRL');
          var lbl = nome + ' (' + sym + ')';
          return (
            <Pill key={nome + '_' + (c.moeda || 'BRL')} active={contaVinc === nome} color={C.acoes} onPress={function() { setContaVinc(nome); }}>
              {lbl}
            </Pill>
          );
        })}
      </View>

      {/* ── Portfólio — so exibe se usuario tem portfolios customizados ── */}
      {portfolios.length > 0 ? (
        <View>
          <Text style={styles.label}>PORTFÓLIO</Text>
          <View style={styles.pillRow}>
            <Pill active={!selPortfolioId} color={C.accent} onPress={function() { setSelPortfolioId(null); }}>Padrão</Pill>
            {portfolios.map(function(pf) {
              return (
                <Pill key={pf.id} active={selPortfolioId === pf.id} color={pf.cor || C.accent} onPress={function() { setSelPortfolioId(pf.id); }}>
                  {pf.nome}
                </Pill>
              );
            })}
            {portfolios.length < 4 ? (
              <Pill active={false} color={C.dim} onPress={function() { navigation.navigate('ConfigPortfolios'); }}>+ Novo</Pill>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* ── Benefícios ── */}
      <Text style={styles.label}>BENEFÍCIOS</Text>
      <View style={styles.pillRow}>
        {BENEFICIOS.map(function(b) {
          return (
            <Pill key={b.k} active={tipoBenef === b.k} color={C.fiis} onPress={function() { setTipoBenef(b.k); }}>
              {b.l}
            </Pill>
          );
        })}
      </View>

      {tipoBenef !== 'nenhum' ? (
        <View>
          <Text style={styles.label}>NOME DO PROGRAMA</Text>
          <TextInput
            value={programaNome}
            onChangeText={setProgramaNome}
            placeholder="Ex: Livelo"
            placeholderTextColor={C.dim}
            returnKeyType="done"
            style={styles.input}
          />

          <Text style={[styles.label, { marginTop: 10 }]}>REGRAS DE {tipoBenef === 'pontos' ? 'PONTOS' : 'CASHBACK'}</Text>
          {regras.map(function(r, idx) {
            return (
              <View key={r._id} style={styles.ruleCard}>
                <View style={styles.ruleHeader}>
                  <Text style={styles.ruleTitle}>{'Regra ' + (idx + 1)}</Text>
                  <TouchableOpacity onPress={function() { removeRegra(idx); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={20} color={C.red} />
                  </TouchableOpacity>
                </View>
                <View style={styles.pillRow}>
                  <Pill active={!r.moeda} color={C.rf} onPress={function() { updateRegra(idx, 'moeda', ''); }}>
                    Todas
                  </Pill>
                  {MOEDAS_PILLS.map(function(m) {
                    return (
                      <Pill key={m} active={r.moeda === m} color={C.rf} onPress={function() { updateRegra(idx, 'moeda', m); }}>
                        {m}
                      </Pill>
                    );
                  })}
                </View>
                <View style={styles.ruleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ruleLabel}>De {simbolo}</Text>
                    <TextInput
                      value={r.valor_min}
                      onChangeText={function(t) { updateRegra(idx, 'valor_min', t.replace(/[^0-9.,]/g, '')); }}
                      placeholder="0"
                      placeholderTextColor={C.dim}
                      keyboardType="decimal-pad"
                      style={styles.ruleInput}
                    />
                  </View>
                  <View style={{ width: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ruleLabel}>Até {simbolo}</Text>
                    <TextInput
                      value={r.valor_max}
                      onChangeText={function(t) { updateRegra(idx, 'valor_max', t.replace(/[^0-9.,]/g, '')); }}
                      placeholder="∞"
                      placeholderTextColor={C.dim}
                      keyboardType="decimal-pad"
                      style={styles.ruleInput}
                    />
                  </View>
                  <View style={{ width: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ruleLabel}>{tipoBenef === 'pontos' ? 'Pts/unid.' : '% Cashback'}</Text>
                    <TextInput
                      value={r.taxa}
                      onChangeText={function(t) { updateRegra(idx, 'taxa', t.replace(/[^0-9.,]/g, '')); }}
                      placeholder={tipoBenef === 'pontos' ? '1.0' : '1.5'}
                      placeholderTextColor={C.dim}
                      keyboardType="decimal-pad"
                      style={styles.ruleInput}
                    />
                  </View>
                </View>
              </View>
            );
          })}
          <TouchableOpacity onPress={addRegra} style={styles.addRuleBtn} activeOpacity={0.7}>
            <Ionicons name="add-circle-outline" size={18} color={C.accent} />
            <Text style={styles.addRuleText}>Adicionar regra</Text>
          </TouchableOpacity>
        </View>
      ) : null}

        </View>
      ) : null}

      {/* ── Preview card ── */}
      <Glass style={styles.previewCard}>
        <Ionicons name="card-outline" size={20} color={C.accent} style={{ marginRight: 10 }} />
        <Text style={styles.previewText} numberOfLines={1}>{previewText}</Text>
      </Glass>

      {/* ── Submit ── */}
      <TouchableOpacity
        onPress={handleSubmit}
        disabled={!canSubmit || loading}
        activeOpacity={0.8}
        style={[styles.submitBtn, !canSubmit && { opacity: 0.4 }]}
        accessibilityRole="button"
        accessibilityLabel={isEdit ? 'Salvar Alterações' : 'Registrar Cartão'}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.submitText}>{isEdit ? 'Salvar Alterações' : 'Registrar Cartão'}</Text>
        )}
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  title: { fontSize: 18, fontWeight: '800', color: C.text, fontFamily: F.display },
  label: { fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginTop: 4 },
  input: {
    backgroundColor: C.cardSolid, borderWidth: 1, borderColor: C.borderLight,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: C.text, fontFamily: F.body,
  },
  prefix: { fontSize: 14, color: C.sub, fontFamily: F.mono, marginRight: 8 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rowFields: { flexDirection: 'row' },
  fieldError: { fontSize: 11, color: C.red, fontFamily: F.mono, marginTop: 2 },
  previewCard: { flexDirection: 'row', alignItems: 'center', padding: 14, marginTop: 8 },
  previewText: { fontSize: 13, color: C.text, fontFamily: F.mono, flex: 1 },
  submitBtn: { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  submitText: { fontSize: 15, fontWeight: '700', color: 'white', fontFamily: F.display },
  ruleCard: {
    backgroundColor: C.cardSolid, borderWidth: 1, borderColor: C.borderLight,
    borderRadius: 10, padding: 12, marginTop: 8, gap: 8,
  },
  ruleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ruleTitle: { fontSize: 12, fontFamily: F.body, color: C.sub },
  ruleRow: { flexDirection: 'row', alignItems: 'flex-end' },
  ruleLabel: { fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5, marginBottom: 4 },
  ruleInput: {
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
    fontSize: 14, color: C.text, fontFamily: F.mono,
  },
  addRuleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingVertical: 8 },
  addRuleText: { fontSize: 13, color: C.accent, fontFamily: F.body },
});
