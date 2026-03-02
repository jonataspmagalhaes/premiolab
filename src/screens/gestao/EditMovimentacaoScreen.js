import React from 'react';
var useState = React.useState;
var useEffect = React.useEffect;
var useRef = React.useRef;
var useCallback = React.useCallback;
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getSaldos, updateMovimentacaoComSaldo } from '../../services/database';
import { getSymbol } from '../../services/currencyService';
import { Glass, Pill } from '../../components';
import Toast from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';
var finCats = require('../../constants/financeCategories');

var CATEGORIAS_ENTRADA = finCats.CATEGORIAS_ENTRADA;
var CATEGORIAS_SAIDA = finCats.CATEGORIAS_SAIDA;
var SUBCATS_SAIDA = finCats.SUBCATS_SAIDA;
var SUBCATS_ENTRADA = finCats.SUBCATS_ENTRADA;
var FINANCE_GROUPS = finCats.FINANCE_GROUPS;
var AUTO_CATEGORIAS = finCats.AUTO_CATEGORIAS;

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function maskDate(text) {
  var clean = text.replace(/[^0-9]/g, '');
  if (clean.length <= 2) return clean;
  if (clean.length <= 4) return clean.slice(0, 2) + '/' + clean.slice(2);
  return clean.slice(0, 2) + '/' + clean.slice(2, 4) + '/' + clean.slice(4, 8);
}

function brToIso(br) {
  var parts = br.split('/');
  if (parts.length !== 3 || parts[2].length !== 4) return null;
  return parts[2] + '-' + parts[1] + '-' + parts[0];
}

function isoToBr(iso) {
  if (!iso) return '';
  var d = iso.substring(0, 10);
  var parts = d.split('-');
  if (parts.length !== 3) return iso;
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

function numToMasked(n) {
  if (!n && n !== 0) return '';
  var fixed = n.toFixed(2);
  var parts = fixed.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return parts[0] + ',' + parts[1];
}

function parseBR(str) {
  if (!str) return 0;
  var s = str.replace(/\./g, '').replace(',', '.');
  return parseFloat(s) || 0;
}

function findGrupoForSubcat(subcat) {
  if (!subcat) return null;
  var sc = finCats.SUBCATEGORIAS[subcat];
  if (sc) return sc.grupo;
  var idx = subcat.indexOf('_');
  if (idx > 0) return subcat.substring(0, idx);
  return null;
}

export default function EditMovimentacaoScreen(props) {
  var navigation = props.navigation;
  var route = props.route;
  var authCtx = useAuth();
  var user = authCtx.user;
  var mov = route.params.movimentacao;

  var isAuto = AUTO_CATEGORIAS.indexOf(mov.categoria) >= 0;

  // Original values for dirty check
  var origTipo = mov.tipo || 'entrada';
  var origCat = mov.categoria || 'deposito';
  var origSubcat = mov.subcategoria || null;
  var origConta = mov.conta || '';
  var origValor = numToMasked(mov.valor || 0);
  var origDesc = mov.descricao || '';
  var origTicker = mov.ticker || '';
  var origData = isoToBr(mov.data);
  var origTaxaCambio = mov.taxa_cambio_mov ? String(mov.taxa_cambio_mov) : '';

  var _tipo = useState(origTipo); var tipo = _tipo[0]; var setTipo = _tipo[1];
  var _cat = useState(origCat); var categoria = _cat[0]; var setCategoria = _cat[1];
  var _subcat = useState(origSubcat); var subcategoria = _subcat[0]; var setSubcategoria = _subcat[1];
  var _subcatGrupo = useState(findGrupoForSubcat(origSubcat)); var subcatGrupo = _subcatGrupo[0]; var setSubcatGrupo = _subcatGrupo[1];
  var _conta = useState(origConta); var conta = _conta[0]; var setConta = _conta[1];
  var _contaMoeda = useState(mov.moeda_original || 'BRL'); var contaMoeda = _contaMoeda[0]; var setContaMoeda = _contaMoeda[1];
  var _valor = useState(origValor); var valor = _valor[0]; var setValor = _valor[1];
  var _desc = useState(origDesc); var descricao = _desc[0]; var setDescricao = _desc[1];
  var _ticker = useState(origTicker); var ticker = _ticker[0]; var setTicker = _ticker[1];
  var _data = useState(origData); var data = _data[0]; var setData = _data[1];
  var _taxaCambio = useState(origTaxaCambio); var taxaCambio = _taxaCambio[0]; var setTaxaCambio = _taxaCambio[1];
  var _loading = useState(false); var loading = _loading[0]; var setLoading = _loading[1];
  var _saldos = useState([]); var saldos = _saldos[0]; var setSaldos = _saldos[1];

  var savedRef = useRef(false);

  useFocusEffect(useCallback(function() {
    if (!user) return;
    getSaldos(user.id).then(function(r) { setSaldos(r.data || []); });
  }, [user]));

  function onChangeVal(t) {
    var nums = t.replace(/\D/g, '');
    if (nums === '') { setValor(''); return; }
    var centavos = parseInt(nums, 10);
    var reais = (centavos / 100).toFixed(2);
    var parts = reais.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    setValor(parts[0] + ',' + parts[1]);
  }

  var categorias = tipo === 'entrada' ? CATEGORIAS_ENTRADA : CATEGORIAS_SAIDA;
  var isoDate = data.length === 10 ? brToIso(data) : null;
  var valorNum = parseBR(valor);
  var canSubmit = conta && valorNum > 0 && isoDate;

  var valorValid = valorNum > 0;
  var valorError = valor.length > 0 && valorNum <= 0;
  var dateValid = isoDate !== null;
  var dateError = data.length === 10 && isoDate === null;

  var showTicker = ['compra_ativo', 'venda_ativo', 'premio_opcao', 'recompra_opcao',
    'exercicio_opcao', 'dividendo', 'jcp', 'rendimento_fii'].indexOf(categoria) >= 0;

  var hasOriginalCurrency = mov.moeda_original && mov.moeda_original !== 'BRL' && mov.valor_original;
  var moedaSymbol = getSymbol(contaMoeda);

  // Dirty check
  function isDirty() {
    return tipo !== origTipo || categoria !== origCat || conta !== origConta ||
      valor !== origValor || descricao !== origDesc || ticker !== origTicker ||
      data !== origData || subcategoria !== origSubcat || taxaCambio !== origTaxaCambio;
  }

  useEffect(function() {
    return navigation.addListener('beforeRemove', function(e) {
      if (savedRef.current) return;
      if (!isDirty()) return;
      e.preventDefault();
      Alert.alert('Descartar alterações?', 'Você tem dados não salvos.', [
        { text: 'Continuar editando', style: 'cancel' },
        { text: 'Descartar', style: 'destructive', onPress: function() { navigation.dispatch(e.data.action); } },
      ]);
    });
  }, [navigation, tipo, categoria, conta, valor, descricao, ticker, data, subcategoria, taxaCambio]);

  var handleSubmit = async function() {
    Keyboard.dismiss();
    if (!canSubmit || loading) return;
    setLoading(true);
    try {
      var oldMov = {
        tipo: origTipo,
        categoria: origCat,
        conta: origConta,
        valor: mov.valor || 0,
      };
      var newMov = {
        tipo: tipo,
        categoria: categoria,
        conta: conta,
        valor: valorNum,
        descricao: descricao,
        ticker: ticker ? ticker.toUpperCase().trim() : null,
        data: isoDate,
      };
      if (subcategoria) {
        newMov.subcategoria = subcategoria;
      } else {
        newMov.subcategoria = null;
      }
      if (hasOriginalCurrency && taxaCambio) {
        var taxaNum = parseFloat(taxaCambio.replace(',', '.'));
        if (taxaNum && taxaNum > 0) {
          newMov.taxa_cambio_mov = taxaNum;
        }
      }
      var result = await updateMovimentacaoComSaldo(user.id, mov.id, oldMov, newMov);
      if (result.error) {
        Alert.alert('Erro', result.error.message || 'Falha ao salvar.');
      } else {
        savedRef.current = true;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Toast.show({ type: 'success', text1: 'Lançamento atualizado' });
        navigation.goBack();
      }
    } catch (err) {
      Alert.alert('Erro', 'Falha ao salvar. Tente novamente.');
    }
    setLoading(false);
  };

  function switchTipo(newTipo) {
    if (isAuto) return;
    setTipo(newTipo);
    setCategoria(newTipo === 'entrada' ? 'deposito' : 'retirada');
    setSubcategoria(null);
    setSubcatGrupo(null);
  }

  var disabledStyle = { opacity: 0.4 };

  // Check if current categoria allows subcategorias
  var showSubcatSaida = tipo === 'saida' && (categoria === 'despesa_fixa' || categoria === 'despesa_variavel');
  var showSubcatEntrada = tipo === 'entrada' && (categoria === 'salario' || categoria === 'outro');

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <View style={styles.header}>
        <TouchableOpacity onPress={function() { navigation.goBack(); }} accessibilityLabel="Voltar" accessibilityRole="button">
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Editar Lançamento</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Tipo: Entrada / Saída */}
      <View style={[styles.toggleRow, isAuto && disabledStyle]}>
        <TouchableOpacity
          onPress={function() { switchTipo('entrada'); }}
          disabled={isAuto}
          style={[styles.toggleBtn, tipo === 'entrada' && { backgroundColor: '#22C55E18', borderColor: '#22C55E40' }]}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: tipo === 'entrada' ? C.green : C.dim }}>ENTRADA</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={function() { switchTipo('saida'); }}
          disabled={isAuto}
          style={[styles.toggleBtn, tipo === 'saida' && { backgroundColor: '#EF444418', borderColor: '#EF444440' }]}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: tipo === 'saida' ? C.red : C.dim }}>SAÍDA</Text>
        </TouchableOpacity>
      </View>

      {/* Categoria */}
      <Text style={styles.label}>CATEGORIA</Text>
      <View style={[styles.pillRow, isAuto && disabledStyle]}>
        {categorias.map(function(cat) {
          return (
            <Pill key={cat.k} active={categoria === cat.k} color={tipo === 'entrada' ? C.green : C.red}
              onPress={isAuto ? function() {} : function() { setCategoria(cat.k); setSubcategoria(null); setSubcatGrupo(null); }}>
              {cat.l}
            </Pill>
          );
        })}
      </View>
      {isAuto ? (
        <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, fontStyle: 'italic' }}>
          Categoria automática (não editável)
        </Text>
      ) : null}

      {/* Subcategoria — saídas: despesa_fixa / despesa_variavel */}
      {showSubcatSaida && !isAuto ? (
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>SUBCATEGORIA</Text>
          <View style={styles.pillRow}>
            {SUBCATS_SAIDA.map(function(grp) {
              var grpMeta = null;
              for (var gi = 0; gi < FINANCE_GROUPS.length; gi++) {
                if (FINANCE_GROUPS[gi].k === grp.grupo) { grpMeta = FINANCE_GROUPS[gi]; break; }
              }
              return (
                <Pill key={grp.grupo} active={subcatGrupo === grp.grupo}
                  color={grpMeta ? grpMeta.color : C.dim}
                  onPress={function() {
                    var g = grp.grupo;
                    if (subcatGrupo === g) { setSubcatGrupo(null); setSubcategoria(null); }
                    else { setSubcatGrupo(g); setSubcategoria(null); }
                  }}>
                  {grpMeta ? grpMeta.l : grp.grupo}
                </Pill>
              );
            })}
          </View>
          {subcatGrupo ? (
            <View style={styles.pillRow}>
              {(function() {
                var items = [];
                for (var si = 0; si < SUBCATS_SAIDA.length; si++) {
                  if (SUBCATS_SAIDA[si].grupo === subcatGrupo) { items = SUBCATS_SAIDA[si].items; break; }
                }
                var grpMeta2 = null;
                for (var gi2 = 0; gi2 < FINANCE_GROUPS.length; gi2++) {
                  if (FINANCE_GROUPS[gi2].k === subcatGrupo) { grpMeta2 = FINANCE_GROUPS[gi2]; break; }
                }
                return items.map(function(sc) {
                  return (
                    <Pill key={sc.k} active={subcategoria === sc.k}
                      color={grpMeta2 ? grpMeta2.color : C.dim}
                      onPress={function() { setSubcategoria(sc.k); }}>
                      {sc.l}
                    </Pill>
                  );
                });
              })()}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Subcategoria — entradas: salario / outro */}
      {showSubcatEntrada && !isAuto ? (
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>SUBCATEGORIA</Text>
          <View style={styles.pillRow}>
            {SUBCATS_ENTRADA.map(function(grp) {
              var grpMeta3 = null;
              for (var gi3 = 0; gi3 < FINANCE_GROUPS.length; gi3++) {
                if (FINANCE_GROUPS[gi3].k === grp.grupo) { grpMeta3 = FINANCE_GROUPS[gi3]; break; }
              }
              return grp.items.map(function(sc) {
                return (
                  <Pill key={sc.k} active={subcategoria === sc.k}
                    color={grpMeta3 ? grpMeta3.color : C.dim}
                    onPress={function() { setSubcategoria(sc.k); }}>
                    {sc.l}
                  </Pill>
                );
              });
            })}
          </View>
        </View>
      ) : null}

      {/* Conta */}
      <Text style={styles.label}>CONTA *</Text>
      {saldos.length > 0 ? (
        <View style={[styles.pillRow, isAuto && disabledStyle]}>
          {saldos.map(function(s) {
            var sName = s.corretora || s.name || '';
            var sMoeda = s.moeda || 'BRL';
            var pillLabel = sMoeda !== 'BRL' ? sName + ' (' + sMoeda + ')' : sName;
            return (
              <Pill key={s.id} active={conta === sName} color={C.accent}
                onPress={isAuto ? function() {} : function() { setConta(sName); setContaMoeda(sMoeda); }}>
                {pillLabel}
              </Pill>
            );
          })}
        </View>
      ) : (
        <Text style={{ fontSize: 12, color: C.dim, fontFamily: F.body }}>
          Nenhuma conta cadastrada.
        </Text>
      )}

      {/* Valor */}
      <Text style={styles.label}>{'VALOR (' + moedaSymbol + ') *'}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 14, color: C.dim, fontFamily: F.mono }}>{moedaSymbol}</Text>
        <TextInput
          value={valor}
          onChangeText={onChangeVal}
          placeholder="0,00"
          placeholderTextColor={C.dim}
          keyboardType="numeric"
          style={[styles.input, { flex: 1 },
            valorValid && { borderColor: C.green },
            valorError && { borderColor: C.red },
          ]}
        />
      </View>

      {/* Valor original (moeda estrangeira) */}
      {hasOriginalCurrency ? (
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>{'VALOR ORIGINAL (' + getSymbol(mov.moeda_original) + ')'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 14, color: C.dim, fontFamily: F.mono }}>{getSymbol(mov.moeda_original)}</Text>
            <Text style={{ fontSize: 15, color: C.text, fontFamily: F.mono }}>
              {fmt(mov.valor_original)}
            </Text>
          </View>
          <Text style={styles.label}>TAXA DE CÂMBIO</Text>
          <TextInput
            value={taxaCambio}
            onChangeText={setTaxaCambio}
            placeholder="Ex: 5,25"
            placeholderTextColor={C.dim}
            keyboardType="decimal-pad"
            style={styles.input}
          />
        </View>
      ) : null}

      {/* Ticker (conditional) */}
      {showTicker ? (
        <View>
          <Text style={styles.label}>TICKER</Text>
          <TextInput
            value={ticker}
            onChangeText={function(t) { setTicker(t.toUpperCase()); }}
            placeholder="Ex: PETR4"
            placeholderTextColor={C.dim}
            autoCapitalize="characters"
            style={styles.input}
          />
        </View>
      ) : null}

      {/* Descrição */}
      <Text style={styles.label}>DESCRIÇÃO</Text>
      <TextInput
        value={descricao}
        onChangeText={setDescricao}
        placeholder="Descrição opcional"
        placeholderTextColor={C.dim}
        style={styles.input}
      />

      {/* Data */}
      <Text style={styles.label}>DATA *</Text>
      <TextInput
        value={data}
        onChangeText={function(t) { setData(maskDate(t)); }}
        placeholder="DD/MM/AAAA"
        placeholderTextColor={C.dim}
        keyboardType="numeric"
        maxLength={10}
        returnKeyType="done"
        style={[styles.input,
          dateValid && { borderColor: C.green },
          dateError && { borderColor: C.red },
        ]}
      />
      {dateError ? <Text style={styles.fieldError}>Data inválida</Text> : null}

      {/* Resumo */}
      {valorNum > 0 ? (
        <Glass glow={tipo === 'entrada' ? C.green : C.red} padding={14}>
          <View style={styles.resumoRow}>
            <Text style={styles.resumoLabel}>{tipo === 'entrada' ? 'ENTRADA' : 'SAÍDA'}</Text>
            <Text style={[styles.resumoValue, { color: tipo === 'entrada' ? C.green : C.red }]}>
              {tipo === 'entrada' ? '+' : '-'}{moedaSymbol + ' '}{fmt(valorNum)}
            </Text>
          </View>
          <View style={styles.resumoRow}>
            <Text style={styles.resumoLabel}>CONTA</Text>
            <Text style={styles.resumoSmall}>{conta || '—'}</Text>
          </View>
        </Glass>
      ) : null}

      {/* Submit */}
      <TouchableOpacity onPress={handleSubmit} disabled={!canSubmit || loading} activeOpacity={0.8}
        style={[styles.submitBtn, !canSubmit && { opacity: 0.4 }]}
        accessibilityRole="button" accessibilityLabel="Salvar Alterações">
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.submitText}>Salvar Alterações</Text>
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
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggleBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center', backgroundColor: C.cardSolid },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  resumoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
  resumoLabel: { fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 },
  resumoValue: { fontSize: 18, fontWeight: '800', fontFamily: F.display },
  resumoSmall: { fontSize: 12, fontWeight: '600', color: C.text, fontFamily: F.mono },
  submitBtn: { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  submitText: { fontSize: 15, fontWeight: '700', color: 'white', fontFamily: F.display },
  fieldError: { fontSize: 11, color: C.red, fontFamily: F.mono, marginTop: 2 },
});
