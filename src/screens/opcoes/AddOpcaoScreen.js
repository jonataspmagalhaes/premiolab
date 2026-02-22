import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard,
} from 'react-native';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { addOpcao, addMovimentacaoComSaldo, buildMovDescricao, getPositions } from '../../services/database';
import { Glass, Pill, Badge, TickerInput } from '../../components';
import * as Haptics from 'expo-haptics';

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

var CORRETORAS = ['Clear', 'XP Investimentos', 'Rico', 'Inter', 'Nubank', 'BTG Pactual', 'Genial'];

function maskDate(text) {
  var clean = text.replace(/\D/g, '');
  if (clean.length <= 2) return clean;
  if (clean.length <= 4) return clean.slice(0, 2) + '/' + clean.slice(2);
  return clean.slice(0, 2) + '/' + clean.slice(2, 4) + '/' + clean.slice(4, 8);
}

function brToIso(brDate) {
  var parts = brDate.split('/');
  if (parts.length !== 3) return null;
  var day = parts[0]; var month = parts[1]; var year = parts[2];
  if (day.length !== 2 || month.length !== 2 || year.length !== 4) return null;
  return year + '-' + month + '-' + day;
}

function isValidFutureDate(brDate) {
  var iso = brToIso(brDate);
  if (!iso) return false;
  var date = new Date(iso + 'T12:00:00');
  if (isNaN(date.getTime())) return false;
  var day = parseInt(brDate.split('/')[0]);
  var month = parseInt(brDate.split('/')[1]);
  if (date.getDate() !== day || (date.getMonth() + 1) !== month) return false;
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  return date >= today;
}

function isValidDate(brDate) {
  var iso = brToIso(brDate);
  if (!iso) return false;
  var date = new Date(iso + 'T12:00:00');
  if (isNaN(date.getTime())) return false;
  var day = parseInt(brDate.split('/')[0]);
  var month = parseInt(brDate.split('/')[1]);
  return date.getDate() === day && (date.getMonth() + 1) === month;
}

function todayBr() {
  var d = new Date();
  var dd = String(d.getDate()).padStart(2, '0');
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var yyyy = d.getFullYear();
  return dd + '/' + mm + '/' + yyyy;
}

export default function AddOpcaoScreen(props) {
  var navigation = props.navigation;
  var route = props.route;
  var params = (route && route.params) ? route.params : {};
  var user = useAuth().user;

  var _tipo = useState('call'); var tipo = _tipo[0]; var setTipo = _tipo[1];
  var _direcao = useState('venda'); var direcao = _direcao[0]; var setDirecao = _direcao[1];
  var _ativoBase = useState(params.ativo_base || ''); var ativoBase = _ativoBase[0]; var setAtivoBase = _ativoBase[1];
  var _tickerOpcao = useState(''); var tickerOpcao = _tickerOpcao[0]; var setTickerOpcao = _tickerOpcao[1];
  var _strike = useState(''); var strike = _strike[0]; var setStrike = _strike[1];
  var _premio = useState(''); var premio = _premio[0]; var setPremio = _premio[1];
  var _qtd = useState(''); var quantidade = _qtd[0]; var setQuantidade = _qtd[1];
  var _venc = useState(''); var vencimento = _venc[0]; var setVencimento = _venc[1];
  var _dataAbertura = useState(todayBr()); var dataAbertura = _dataAbertura[0]; var setDataAbertura = _dataAbertura[1];
  var _corretora = useState(''); var corretora = _corretora[0]; var setCorretora = _corretora[1];
  var _loading = useState(false); var loading = _loading[0]; var setLoading = _loading[1];

  var qty = parseInt(quantidade) || 0;
  var prem = parseFloat(premio) || 0;
  var premioTotal = qty * prem;
  var contratos = Math.floor(qty / 100);

  var dateValid = vencimento.length === 10 && isValidFutureDate(vencimento);
  var datePast = vencimento.length === 10 && !isValidFutureDate(vencimento);
  var dataAberturaValid = dataAbertura.length === 10 && isValidDate(dataAbertura);
  var canSubmit = ativoBase.length >= 4 && parseFloat(strike) > 0 && prem > 0 && qty > 0 && dateValid && dataAberturaValid && corretora;

  var ativoBaseValid = ativoBase.length >= 4;
  var ativoBaseError = ativoBase.length > 0 && ativoBase.length < 4;
  var strikeValid = parseFloat(strike) > 0;
  var strikeError = strike.length > 0 && parseFloat(strike) <= 0;
  var premioValid = prem > 0;
  var premioError = premio.length > 0 && prem <= 0;
  var qtyValid = qty > 0;
  var qtyError = quantidade.length > 0 && qty <= 0;

  var _submitted = useState(false); var submitted = _submitted[0]; var setSubmitted = _submitted[1];
  var _tickers = useState([]); var tickers = _tickers[0]; var setTickers = _tickers[1];

  useEffect(function() {
    if (!user) return;
    getPositions(user.id).then(function(result) {
      var list = result.data || [];
      var names = [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].ticker) names.push(list[i].ticker.toUpperCase());
      }
      setTickers(names);
    });
  }, [user]);

  useEffect(function() {
    return navigation.addListener('beforeRemove', function(e) {
      if (submitted) return;
      if (!strike && !premio) return;
      e.preventDefault();
      Alert.alert('Descartar alterações?', 'Você tem dados não salvos.', [
        { text: 'Continuar editando', style: 'cancel' },
        { text: 'Descartar', style: 'destructive', onPress: function() { navigation.dispatch(e.data.action); } },
      ]);
    });
  }, [navigation, submitted, strike, premio]);

  var handleSubmit = async function() {
    Keyboard.dismiss();
    if (!canSubmit || submitted) return;
    if (!dateValid) {
      Alert.alert('Data inválida', 'O vencimento deve ser uma data futura no formato DD/MM/AAAA.');
      return;
    }
    setSubmitted(true);
    setLoading(true);
    try {
      var isoDate = brToIso(vencimento);
      var isoAbertura = brToIso(dataAbertura);
      var result = await addOpcao(user.id, {
        ativo_base: ativoBase.toUpperCase(),
        ticker_opcao: tickerOpcao.toUpperCase() || null,
        tipo: tipo,
        direcao: direcao,
        strike: parseFloat(strike),
        premio: prem,
        quantidade: qty,
        vencimento: isoDate,
        data_abertura: isoAbertura,
        status: 'ativa',
        corretora: corretora,
      });
      if (result.error) {
        Alert.alert('Erro', result.error.message);
        setSubmitted(false);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        var resetFields = function() {
          setAtivoBase('');
          setTickerOpcao('');
          setStrike('');
          setPremio('');
          setQuantidade('');
          setVencimento('');
          setDataAbertura(todayBr());
          setSubmitted(false);
        };

        // Oferecer creditar prêmio no saldo (apenas para venda/lançamento)
        if (direcao === 'venda' || direcao === 'lancamento') {
          var opDesc = 'Prêmio ' + tipo.toUpperCase() + ' ' + ativoBase.toUpperCase();
          Alert.alert(
            'Opção registrada!',
            'Creditar prêmio R$ ' + fmt(premioTotal) + ' em ' + corretora + '?',
            [
              {
                text: 'Não',
                style: 'cancel',
                onPress: function() {
                  Alert.alert('Sucesso!', 'Opção registrada.', [
                    { text: 'Adicionar outra', onPress: resetFields },
                    { text: 'Concluir', onPress: function() { navigation.goBack(); } },
                  ]);
                },
              },
              {
                text: 'Sim, creditar',
                onPress: function() {
                  addMovimentacaoComSaldo(user.id, {
                    conta: corretora,
                    tipo: 'entrada',
                    categoria: 'premio_opcao',
                    valor: premioTotal,
                    descricao: opDesc,
                    ticker: ativoBase.toUpperCase(),
                    referencia_tipo: 'opcao',
                    data: brToIso(dataAbertura) || new Date().toISOString().substring(0, 10),
                  }).catch(function(e) { console.warn('Mov premio failed:', e); });
                  Alert.alert('Sucesso!', 'Opção + prêmio creditado.', [
                    { text: 'Adicionar outra', onPress: resetFields },
                    { text: 'Concluir', onPress: function() { navigation.goBack(); } },
                  ]);
                },
              },
            ]
          );
        } else {
          Alert.alert('Sucesso!', 'Opção registrada.', [
            { text: 'Adicionar outra', onPress: resetFields },
            { text: 'Concluir', onPress: function() { navigation.goBack(); } },
          ]);
        }
      }
    } catch (err) {
      Alert.alert('Erro', 'Falha ao salvar.');
      setSubmitted(false);
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <View style={styles.header}>
        <TouchableOpacity onPress={function() { navigation.goBack(); }}>
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Nova Opção</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Tipo */}
      <Text style={styles.label}>TIPO</Text>
      <View style={styles.toggleRow}>
        <TouchableOpacity
          onPress={function() { setTipo('call'); }}
          style={[styles.toggleBtn, tipo === 'call' && { backgroundColor: '#22C55E18', borderColor: '#22C55E40' }]}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: tipo === 'call' ? C.green : C.dim }}>CALL</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={function() { setTipo('put'); }}
          style={[styles.toggleBtn, tipo === 'put' && { backgroundColor: '#EF444418', borderColor: '#EF444440' }]}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: tipo === 'put' ? C.red : C.dim }}>PUT</Text>
        </TouchableOpacity>
      </View>

      {/* Direção */}
      <Text style={styles.label}>DIREÇÃO</Text>
      <View style={styles.pillRow}>
        <Pill active={direcao === 'venda'} color={C.opcoes} onPress={function() { setDirecao('venda'); }}>Venda</Pill>
        <Pill active={direcao === 'compra'} color={C.opcoes} onPress={function() { setDirecao('compra'); }}>Compra</Pill>
      </View>

      {/* Ativo base + Código */}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>ATIVO BASE *</Text>
          <TickerInput value={ativoBase} onChangeText={setAtivoBase} tickers={tickers} autoFocus={true} returnKeyType="next"
            style={[styles.input, ativoBaseValid && { borderColor: C.green }, ativoBaseError && { borderColor: C.red }]} />
          {ativoBaseError ? <Text style={styles.fieldError}>Mínimo 4 caracteres</Text> : null}
        </View>
        <View style={{ width: 12 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>CÓDIGO DA OPÇÃO</Text>
          <TextInput value={tickerOpcao} onChangeText={function(t) { setTickerOpcao(t.toUpperCase()); }} placeholder="Ex: PETRA260" placeholderTextColor={C.dim} autoCapitalize="characters" style={styles.input} />
        </View>
      </View>

      {/* Strike + Prêmio */}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>STRIKE (R$) *</Text>
          <TextInput value={strike} onChangeText={setStrike} placeholder="36.00" placeholderTextColor={C.dim} keyboardType="decimal-pad"
            style={[styles.input, strikeValid && { borderColor: C.green }, strikeError && { borderColor: C.red }]} />
          {strikeError ? <Text style={styles.fieldError}>Deve ser maior que 0</Text> : null}
        </View>
        <View style={{ width: 12 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>PRÊMIO (R$) *</Text>
          <TextInput value={premio} onChangeText={setPremio} placeholder="1.20" placeholderTextColor={C.dim} keyboardType="decimal-pad"
            style={[styles.input, premioValid && { borderColor: C.green }, premioError && { borderColor: C.red }]} />
          {premioError ? <Text style={styles.fieldError}>Deve ser maior que 0</Text> : null}
        </View>
      </View>

      {/* Qtd */}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>QTD OPÇÕES *</Text>
          <TextInput value={quantidade} onChangeText={setQuantidade} placeholder="100" placeholderTextColor={C.dim} keyboardType="numeric"
            style={[styles.input, qtyValid && { borderColor: C.green }, qtyError && { borderColor: C.red }]} />
          {qtyError ? <Text style={styles.fieldError}>Deve ser maior que 0</Text> : null}
        </View>
      </View>

      {/* Data abertura + Vencimento */}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>DATA ABERTURA *</Text>
          <TextInput
            value={dataAbertura}
            onChangeText={function(t) { setDataAbertura(maskDate(t)); }}
            placeholder="DD/MM/AAAA"
            placeholderTextColor={C.dim}
            keyboardType="numeric"
            maxLength={10}
            style={[
              styles.input,
              dataAberturaValid && { borderColor: C.green },
              dataAbertura.length === 10 && !dataAberturaValid && { borderColor: C.red },
            ]}
          />
          {dataAbertura.length === 10 && !dataAberturaValid && (
            <Text style={styles.dateError}>Data invalida</Text>
          )}
        </View>
        <View style={{ width: 12 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>VENCIMENTO *</Text>
          <TextInput
            value={vencimento}
            onChangeText={function(t) { setVencimento(maskDate(t)); }}
            placeholder="DD/MM/AAAA"
            placeholderTextColor={C.dim}
            keyboardType="numeric"
            maxLength={10}
            returnKeyType="done"
            style={[
              styles.input,
              dateValid && { borderColor: C.green },
              datePast && { borderColor: C.red },
            ]}
          />
          {datePast && (
            <Text style={styles.dateError}>Data deve ser futura</Text>
          )}
        </View>
      </View>

      {/* Resumo */}
      {premioTotal > 0 && (
        <Glass glow={direcao === 'venda' ? C.green : C.red} padding={14}>
          <View style={styles.resumoRow}>
            <Text style={styles.resumoLabel}>PRÊMIO TOTAL</Text>
            <Text style={[styles.resumoValue, { color: direcao === 'venda' ? C.green : C.red }]}>
              {'R$ ' + fmt(premioTotal)}
            </Text>
          </View>
          <View style={styles.resumoRow}>
            <Text style={styles.resumoLabel}>CONTRATOS</Text>
            <Text style={styles.resumoSmall}>{contratos} ({qty} opções)</Text>
          </View>
        </Glass>
      )}

      {/* Corretora */}
      <Text style={styles.label}>CORRETORA *</Text>
      <View style={styles.pillRow}>
        {CORRETORAS.map(function(c) {
          return (
            <Pill key={c} active={corretora === c} color={C.acoes} onPress={function() { setCorretora(c); }}>{c}</Pill>
          );
        })}
      </View>

      {/* Submit */}
      <TouchableOpacity onPress={handleSubmit} disabled={!canSubmit || loading} activeOpacity={0.8} style={[styles.submitBtn, !canSubmit && { opacity: 0.4 }]}>
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.submitText}>Registrar Opção</Text>
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
  back: { fontSize: 28, color: C.accent, fontWeight: '300' },
  title: { fontSize: 18, fontWeight: '800', color: C.text, fontFamily: F.display },
  label: { fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginTop: 4 },
  input: {
    backgroundColor: C.cardSolid, borderWidth: 1, borderColor: C.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: C.text, fontFamily: F.body,
  },
  row: { flexDirection: 'row' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggleBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center', backgroundColor: C.cardSolid },
  custoToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  custoToggleText: { fontSize: 11, color: C.sub, fontFamily: F.body },
  resumoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
  resumoLabel: { fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 },
  resumoValue: { fontSize: 18, fontWeight: '800', fontFamily: F.display },
  resumoSmall: { fontSize: 12, fontWeight: '600', color: C.text, fontFamily: F.mono },
  resumoPM: { fontSize: 14, fontWeight: '700', fontFamily: F.mono },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 6 },
  submitBtn: { backgroundColor: C.opcoes, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  submitText: { fontSize: 15, fontWeight: '700', color: 'white', fontFamily: F.display },
  dateError: { fontSize: 11, color: C.red, fontFamily: F.mono, marginTop: 2 },
  fieldError: { fontSize: 11, color: C.red, fontFamily: F.mono, marginTop: 2 },
});
