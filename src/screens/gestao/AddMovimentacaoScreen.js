import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getSaldos, addMovimentacaoComSaldo, buildMovDescricao, getOrcamentos, getFinancasSummary, getCartoes, addMovimentacaoCartao } from '../../services/database';
import { getSymbol, fetchExchangeRates } from '../../services/currencyService';
import { Glass, Pill, Badge, SectionLabel, CurrencyPicker } from '../../components';
import Ionicons from '@expo/vector-icons/Ionicons';
import { animateLayout } from '../../utils/a11y';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import widgetBridge from '../../services/widgetBridge';
import * as databaseModule from '../../services/database';
import * as currencyServiceModule from '../../services/currencyService';
var finCats = require('../../constants/financeCategories');

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

function todayBr() {
  var now = new Date();
  var d = String(now.getDate()).padStart(2, '0');
  var m = String(now.getMonth() + 1).padStart(2, '0');
  var y = now.getFullYear();
  return d + '/' + m + '/' + y;
}

var CATEGORIAS_ENTRADA = finCats.CATEGORIAS_ENTRADA;
var CATEGORIAS_SAIDA = finCats.CATEGORIAS_SAIDA;
var SUBCATS_SAIDA = finCats.SUBCATS_SAIDA;
var SUBCATS_ENTRADA = finCats.SUBCATS_ENTRADA;
var FINANCE_GROUPS = finCats.FINANCE_GROUPS;

export default function AddMovimentacaoScreen(props) {
  var navigation = props.navigation;
  var route = props.route;
  var user = useAuth().user;
  var presetTipo = route && route.params && route.params.presetTipo;

  var _tipo = useState(presetTipo === 'saida' ? 'saida' : 'entrada'); var tipo = _tipo[0]; var setTipo = _tipo[1];
  var _cat = useState(presetTipo === 'saida' ? 'retirada' : 'deposito'); var categoria = _cat[0]; var setCategoria = _cat[1];
  var _conta = useState(''); var conta = _conta[0]; var setConta = _conta[1];
  var _contaId = useState(null); var contaId = _contaId[0]; var setContaId = _contaId[1];
  var _contaMoeda = useState('BRL'); var contaMoeda = _contaMoeda[0]; var setContaMoeda = _contaMoeda[1];
  var _valor = useState(''); var valor = _valor[0]; var setValor = _valor[1];
  var _desc = useState(''); var descricao = _desc[0]; var setDescricao = _desc[1];
  var _ticker = useState(''); var ticker = _ticker[0]; var setTicker = _ticker[1];
  var _data = useState(todayBr()); var data = _data[0]; var setData = _data[1];
  var _loading = useState(false); var loading = _loading[0]; var setLoading = _loading[1];
  var _submitted = useState(false); var submitted = _submitted[0]; var setSubmitted = _submitted[1];
  var _saldos = useState([]); var saldos = _saldos[0]; var setSaldos = _saldos[1];
  var _subcat = useState(null); var subcategoria = _subcat[0]; var setSubcategoria = _subcat[1];
  var _subcatGrupo = useState(null); var subcatGrupo = _subcatGrupo[0]; var setSubcatGrupo = _subcatGrupo[1];

  // ── Credit card payment states ──
  var _payMethod = useState('conta'); var payMethod = _payMethod[0]; var setPayMethod = _payMethod[1];
  var _cartaoId = useState(null); var cartaoId = _cartaoId[0]; var setCartaoId = _cartaoId[1];
  var _cartaoLabel = useState(''); var cartaoLabel = _cartaoLabel[0]; var setCartaoLabel = _cartaoLabel[1];
  var _cartoes = useState([]); var cartoes = _cartoes[0]; var setCartoes = _cartoes[1];
  var _moedaOriginal = useState(''); var moedaOriginal = _moedaOriginal[0]; var setMoedaOriginal = _moedaOriginal[1];
  var _valorOriginal = useState(''); var valorOriginal = _valorOriginal[0]; var setValorOriginal = _valorOriginal[1];
  var _taxaCambio = useState(''); var taxaCambio = _taxaCambio[0]; var setTaxaCambio = _taxaCambio[1];
  var _showCurrencyPicker = useState(false); var showCurrencyPicker = _showCurrencyPicker[0]; var setShowCurrencyPicker = _showCurrencyPicker[1];
  var _cartaoMoeda = useState('BRL'); var cartaoMoeda = _cartaoMoeda[0]; var setCartaoMoeda = _cartaoMoeda[1];
  var _parcelas = useState(1); var parcelas = _parcelas[0]; var setParcelas = _parcelas[1];

  // Detalhes extras colapsável — abrir auto se preenchido via params
  var _showDetails = useState(false); var showDetails = _showDetails[0]; var setShowDetails = _showDetails[1];

  var presetCartaoId = route && route.params && route.params.presetCartaoId;
  var presetPayMethod = route && route.params && route.params.presetPayMethod;

  useFocusEffect(useCallback(function() {
    if (!user) return;
    getSaldos(user.id).then(function(r) { setSaldos(r.data || []); });
    getCartoes(user.id).then(function(res) {
      if (res.data) {
        setCartoes(res.data);
        // Pre-select card if passed via route params
        if (presetCartaoId) {
          for (var ci = 0; ci < res.data.length; ci++) {
            var c = res.data[ci];
            if (c.id === presetCartaoId) {
              setPayMethod('cartao');
              setCartaoId(c.id);
              var lbl = (c.apelido || c.bandeira.toUpperCase()) + ' ••' + c.ultimos_digitos;
              setCartaoLabel(lbl);
              setCartaoMoeda(c.moeda || 'BRL');
              break;
            }
          }
        } else if (presetPayMethod === 'pix') {
          setPayMethod('pix');
        } else if (presetPayMethod === 'cartao' && res.data.length > 0) {
          setPayMethod('cartao');
          var first = res.data[0];
          setCartaoId(first.id);
          var firstLbl = (first.apelido || first.bandeira.toUpperCase()) + ' ••' + first.ultimos_digitos;
          setCartaoLabel(firstLbl);
          setCartaoMoeda(first.moeda || 'BRL');
        }
      }
    });
  }, [user]));

  function onChangeVal(t) {
    var nums = t.replace(/\D/g, '');
    if (nums === '') { setValor(''); return; }
    var centavos = parseInt(nums);
    var reais = (centavos / 100).toFixed(2);
    var parts = reais.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    setValor(parts[0] + ',' + parts[1]);
  }

  function parseVal() {
    return parseFloat((valor || '').replace(/\./g, '').replace(',', '.')) || 0;
  }

  var categorias = tipo === 'entrada' ? CATEGORIAS_ENTRADA : CATEGORIAS_SAIDA;
  var isoDate = data.length === 10 ? brToIso(data) : null;
  var valorNum = parseVal();
  var canSubmitConta = conta && valorNum > 0 && isoDate;
  var canSubmitCartao = cartaoId && isoDate && (valorNum > 0 || (moedaOriginal && moedaOriginal !== cartaoMoeda && parseBR(valorOriginal) > 0 && parseFloat(taxaCambio) > 0));
  var canSubmit = (payMethod === 'cartao') ? canSubmitCartao : canSubmitConta; // PIX uses same check as Conta

  var valorValid = valorNum > 0;
  var valorError = valor.length > 0 && valorNum <= 0;
  var dateValid = isoDate !== null;
  var dateError = data.length === 10 && isoDate === null;

  // Show ticker field for investment categories
  var showTicker = ['compra_ativo', 'venda_ativo', 'premio_opcao', 'recompra_opcao',
    'exercicio_opcao', 'dividendo', 'jcp', 'rendimento_fii'].indexOf(categoria) >= 0;

  // ── Credit card multi-currency helpers ──
  function parseBR(str) {
    return parseFloat((str || '').replace(/\./g, '').replace(',', '.')) || 0;
  }

  function handleSelectMoeda(code) {
    setMoedaOriginal(code);
    setValorOriginal('');
    setValor('');
    // Auto-fetch exchange rate: rate = how many units of card currency per 1 unit of foreign currency
    // fetchExchangeRates returns X->BRL rates (e.g. USD: 5.12 means 1 USD = 5.12 BRL)
    fetchExchangeRates([code]).then(function(rates) {
      if (rates && rates[code]) {
        if (cartaoMoeda === 'BRL') {
          // Card is BRL: rate is directly X->BRL (e.g. 1 USD = 5.12 BRL)
          setTaxaCambio(String(rates[code].toFixed(6)));
        } else {
          // Card is foreign (e.g. USD): need cross-rate spending->cardMoeda
          fetchExchangeRates([cartaoMoeda]).then(function(cardRates) {
            if (cardRates && cardRates[cartaoMoeda]) {
              // rates[code] = X->BRL, cardRates[cartaoMoeda] = cardMoeda->BRL
              // cross = X->BRL / cardMoeda->BRL = X->cardMoeda
              var crossRate = rates[code] / cardRates[cartaoMoeda];
              setTaxaCambio(String(crossRate.toFixed(6)));
            }
          });
        }
      }
    });
  }

  function onChangeValorOriginal(t) {
    var nums = t.replace(/[^0-9]/g, '');
    if (!nums) { setValorOriginal(''); setValor(''); return; }
    var cents = parseInt(nums, 10);
    var reais = (cents / 100).toFixed(2);
    var parts = reais.split('.');
    var intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    var formatted = intPart + ',' + parts[1];
    setValorOriginal(formatted);
    autoFillConvertido(formatted, taxaCambio);
  }

  function calcConvertido() {
    var vo = parseBR(valorOriginal);
    var tc = parseFloat(taxaCambio) || 0;
    if (!vo || !tc) return '0,00';
    var converted = vo * tc;
    return converted.toFixed(2).replace('.', ',');
  }

  function autoFillConvertido(voStr, tcStr) {
    var vo = parseBR(voStr);
    var tc = parseFloat(tcStr) || 0;
    if (vo > 0 && tc > 0) {
      var converted = (vo * tc).toFixed(2);
      var parts = converted.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      setValor(parts[0] + ',' + parts[1]);
    }
  }

  // ── Determine effective moeda for display ──
  var effectiveMoeda = (payMethod === 'cartao' && cartaoId) ? cartaoMoeda : contaMoeda;

  useEffect(function() {
    return navigation.addListener('beforeRemove', function(e) {
      if (submitted) return;
      if (!valor) return;
      e.preventDefault();
      Alert.alert('Descartar alterações?', 'Você tem dados não salvos.', [
        { text: 'Continuar editando', style: 'cancel' },
        { text: 'Descartar', style: 'destructive', onPress: function() { navigation.dispatch(e.data.action); } },
      ]);
    });
  }, [navigation, submitted, valor]);

  // Fire-and-forget: check budget limit after saving an expense
  function checkBudgetAlert(userId, cat, subcat) {
    var grupo = finCats.getGrupo(cat, subcat);
    if (!grupo || grupo === 'investimento' || grupo === 'outro') return;
    var grupoMeta = finCats.getGrupoMeta(grupo);
    var grupoLabel = grupoMeta ? grupoMeta.label : grupo;

    Promise.all([
      getOrcamentos(userId),
      getFinancasSummary(userId, new Date().getMonth() + 1, new Date().getFullYear()),
    ]).then(function(results) {
      var orcamentos = results[0].data || [];
      var summary = results[1];
      var orcamento = null;
      for (var i = 0; i < orcamentos.length; i++) {
        if (orcamentos[i].grupo === grupo && orcamentos[i].ativo) { orcamento = orcamentos[i]; break; }
      }
      if (!orcamento) return;
      var gasto = (summary.porGrupo && summary.porGrupo[grupo]) || 0;
      var limite = orcamento.valor_limite || 0;
      if (limite <= 0) return;
      var pct = gasto / limite;

      if (pct > 1) {
        var excesso = gasto - limite;
        Toast.show({
          type: 'error',
          text1: 'Orçamento ultrapassado!',
          text2: grupoLabel + ': R$ ' + fmt(gasto) + ' / R$ ' + fmt(limite) + ' (+R$ ' + fmt(excesso) + ')',
          visibilityTime: 5000,
        });
      } else if (pct > 0.9) {
        Toast.show({
          type: 'info',
          text1: 'Orçamento quase no limite',
          text2: grupoLabel + ': ' + Math.round(pct * 100) + '% utilizado (R$ ' + fmt(gasto) + ' / R$ ' + fmt(limite) + ')',
          visibilityTime: 4000,
        });
      }
    }).catch(function(e) {
      console.warn('Budget alert check failed:', e);
    });
  }

  var handleSubmit = async function() {
    Keyboard.dismiss();
    if (!canSubmit || submitted) return;
    setSubmitted(true);
    setLoading(true);
    try {
      var result;

      if (payMethod === 'cartao' && cartaoId) {
        // ── Credit card payment flow ──
        var autoDescCartao = descricao || buildMovDescricao(categoria, ticker || null, null);
        var movCartao = {
          conta: cartaoLabel,
          tipo: 'saida',
          categoria: categoria,
          subcategoria: subcategoria || null,
          valor: valorNum,
          descricao: autoDescCartao,
          data: isoDate,
          ticker: ticker ? ticker.toUpperCase().trim() : null,
          cartao_id: cartaoId,
          meio_pagamento: 'credito',
          parcelas: parcelas > 1 ? parcelas : 1,
        };
        if (moedaOriginal && moedaOriginal !== cartaoMoeda) {
          movCartao.moeda_original = moedaOriginal;
          movCartao.valor_original = parseBR(valorOriginal);
          movCartao.taxa_cambio_mov = parseFloat(taxaCambio) || null;
          // Auto-fill valor in card currency if empty
          if (!movCartao.valor && movCartao.valor_original && movCartao.taxa_cambio_mov) {
            movCartao.valor = movCartao.valor_original * movCartao.taxa_cambio_mov;
          }
        }
        result = await addMovimentacaoCartao(user.id, movCartao);
      } else {
        // ── Existing conta-based flow (conta ou PIX) ──
        var autoDesc = descricao || buildMovDescricao(categoria, ticker || null, null);
        var movPayload = {
          conta: conta,
          moeda: contaMoeda,
          tipo: tipo,
          categoria: categoria,
          valor: valorNum,
          descricao: autoDesc,
          ticker: ticker ? ticker.toUpperCase().trim() : null,
          data: isoDate,
          meio_pagamento: payMethod === 'pix' ? 'pix' : 'debito',
        };
        if (subcategoria) { movPayload.subcategoria = subcategoria; }
        result = await addMovimentacaoComSaldo(user.id, movPayload);
      }

      if (result.error) {
        Alert.alert('Erro', result.error.message || 'Falha ao salvar.');
        setSubmitted(false);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Fire-and-forget: sync widget data
        widgetBridge.updateWidgetFromContext(user.id, databaseModule, currencyServiceModule).catch(function() {});

        // Budget alert: check if expense group is near/over budget limit
        if (tipo === 'saida') {
          checkBudgetAlert(user.id, categoria, subcategoria);
        }

        Alert.alert('Sucesso!', 'Movimentação registrada.', [
          {
            text: 'Adicionar outra',
            onPress: function() {
              setValor('');
              setDescricao('');
              setTicker('');
              setData(todayBr());
              setSubmitted(false);
              setContaMoeda('BRL');
              setConta('');
              setContaId(null);
              setSubcategoria(null);
              setSubcatGrupo(null);
              setParcelas(1);
              // Reset card fields
              setMoedaOriginal('');
              setValorOriginal('');
              setTaxaCambio('');
            },
          },
          { text: 'Concluir', onPress: function() { if (navigation.canGoBack()) { navigation.goBack(); } else { navigation.navigate('MainTabs'); } } },
        ]);
      }
    } catch (err) {
      Alert.alert('Erro', 'Falha ao salvar. Tente novamente.');
      setSubmitted(false);
    }
    setLoading(false);
  };

  // Switch tipo resets categoria + subcategoria + payMethod
  function switchTipo(newTipo) {
    setTipo(newTipo);
    setCategoria(newTipo === 'entrada' ? 'deposito' : 'retirada');
    setSubcategoria(null);
    setSubcatGrupo(null);
    if (newTipo === 'entrada') {
      setPayMethod('conta');
      setCartaoId(null);
      setCartaoLabel('');
      setMoedaOriginal('');
      setValorOriginal('');
      setTaxaCambio('');
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <View style={styles.header}>
        <TouchableOpacity onPress={function() { if (navigation.canGoBack()) { navigation.goBack(); } else { navigation.navigate('MainTabs'); } }} accessibilityLabel="Voltar" accessibilityRole="button">
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Nova Movimentação</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Tipo: Entrada / Saída */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          onPress={function() { switchTipo('entrada'); }}
          style={[styles.toggleBtn, tipo === 'entrada' && { backgroundColor: '#22C55E18', borderColor: '#22C55E40' }]}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: tipo === 'entrada' ? C.green : C.dim }}>ENTRADA</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={function() { switchTipo('saida'); }}
          style={[styles.toggleBtn, tipo === 'saida' && { backgroundColor: '#EF444418', borderColor: '#EF444440' }]}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: tipo === 'saida' ? C.red : C.dim }}>SAÍDA</Text>
        </TouchableOpacity>
      </View>

      {/* Categoria */}
      <Text style={styles.label}>CATEGORIA</Text>
      <View style={styles.pillRow}>
        {categorias.map(function(cat) {
          return (
            <Pill key={cat.k} active={categoria === cat.k} color={tipo === 'entrada' ? C.green : C.red}
              onPress={function() { setCategoria(cat.k); setSubcategoria(null); setSubcatGrupo(null); }}>
              {cat.l}
            </Pill>
          );
        })}
      </View>

      {/* Subcategoria picker — saídas: despesa_fixa / despesa_variavel / outro */}
      {tipo === 'saida' && (categoria === 'despesa_fixa' || categoria === 'despesa_variavel' || categoria === 'outro') ? (
        <View style={{ gap: 8 }}>
          <Text style={styles.label}>ONDE GASTOU?</Text>
          {/* Grid de grupos com ícone */}
          <View style={styles.grupoGrid}>
            {SUBCATS_SAIDA.map(function(grp) {
              var grpMeta = null;
              for (var gi = 0; gi < FINANCE_GROUPS.length; gi++) {
                if (FINANCE_GROUPS[gi].k === grp.grupo) { grpMeta = FINANCE_GROUPS[gi]; break; }
              }
              var isActive = subcatGrupo === grp.grupo;
              var gColor = grpMeta ? grpMeta.color : C.dim;
              var gIcon = grpMeta ? grpMeta.icon : 'ellipse-outline';
              var gLabel = grpMeta ? grpMeta.l : grp.grupo;
              return (
                <TouchableOpacity key={grp.grupo} activeOpacity={0.7}
                  onPress={function() {
                    var g = grp.grupo;
                    if (subcatGrupo === g) { setSubcatGrupo(null); setSubcategoria(null); }
                    else { setSubcatGrupo(g); setSubcategoria(null); }
                  }}
                  style={[styles.grupoCard, isActive && { borderColor: gColor + '80', backgroundColor: gColor + '14' }]}>
                  <View style={[styles.grupoIconWrap, { backgroundColor: gColor + (isActive ? '28' : '14') }]}>
                    <Ionicons name={gIcon} size={16} color={isActive ? gColor : C.dim} />
                  </View>
                  <Text style={[styles.grupoLabel, isActive && { color: gColor }]} numberOfLines={1}>{gLabel}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {/* Subcategorias do grupo selecionado */}
          {subcatGrupo ? (
            <Glass padding={12} style={{ marginTop: 2 }}>
              {(function() {
                var grpMeta2 = null;
                for (var gi2 = 0; gi2 < FINANCE_GROUPS.length; gi2++) {
                  if (FINANCE_GROUPS[gi2].k === subcatGrupo) { grpMeta2 = FINANCE_GROUPS[gi2]; break; }
                }
                var gColor2 = grpMeta2 ? grpMeta2.color : C.dim;
                var gLabel2 = grpMeta2 ? grpMeta2.l : subcatGrupo;
                var items = [];
                for (var si = 0; si < SUBCATS_SAIDA.length; si++) {
                  if (SUBCATS_SAIDA[si].grupo === subcatGrupo) { items = SUBCATS_SAIDA[si].items; break; }
                }
                return (
                  <View style={{ gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name={grpMeta2 ? grpMeta2.icon : 'ellipse-outline'} size={14} color={gColor2} />
                      <Text style={{ fontSize: 11, fontFamily: F.mono, color: gColor2, fontWeight: '600', letterSpacing: 0.5 }}>{gLabel2.toUpperCase()}</Text>
                    </View>
                    <View style={styles.pillRow}>
                      {items.map(function(sc) {
                        return (
                          <Pill key={sc.k} active={subcategoria === sc.k}
                            color={gColor2}
                            onPress={function() { setSubcategoria(sc.k); }}>
                            {sc.l}
                          </Pill>
                        );
                      })}
                    </View>
                  </View>
                );
              })()}
            </Glass>
          ) : null}
        </View>
      ) : null}

      {/* Subcategoria picker — entradas: salario / deposito / outro */}
      {tipo === 'entrada' && (categoria === 'salario' || categoria === 'deposito' || categoria === 'outro') ? (
        <View style={{ gap: 8 }}>
          <Text style={styles.label}>TIPO DE RENDA</Text>
          {SUBCATS_ENTRADA.map(function(grp) {
            var grpMeta3 = null;
            for (var gi3 = 0; gi3 < FINANCE_GROUPS.length; gi3++) {
              if (FINANCE_GROUPS[gi3].k === grp.grupo) { grpMeta3 = FINANCE_GROUPS[gi3]; break; }
            }
            var gColor3 = grpMeta3 ? grpMeta3.color : C.dim;
            var gIcon3 = grpMeta3 ? grpMeta3.icon : 'ellipse-outline';
            var gLabel3 = grpMeta3 ? grpMeta3.l : grp.grupo;
            return (
              <Glass key={grp.grupo} padding={12}>
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name={gIcon3} size={14} color={gColor3} />
                    <Text style={{ fontSize: 11, fontFamily: F.mono, color: gColor3, fontWeight: '600', letterSpacing: 0.5 }}>{gLabel3.toUpperCase()}</Text>
                  </View>
                  <View style={styles.pillRow}>
                    {grp.items.map(function(sc) {
                      return (
                        <Pill key={sc.k} active={subcategoria === sc.k}
                          color={gColor3}
                          onPress={function() { setSubcategoria(sc.k); }}>
                          {sc.l}
                        </Pill>
                      );
                    })}
                  </View>
                </View>
              </Glass>
            );
          })}
        </View>
      ) : null}

      {/* Payment method toggle (only for saída) */}
      {tipo === 'saida' ? (
        <View>
          <Text style={styles.label}>MÉTODO DE PAGAMENTO</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <Pill active={payMethod === 'conta'} onPress={function() { setPayMethod('conta'); setCartaoId(null); setCartaoLabel(''); setMoedaOriginal(''); setValorOriginal(''); setTaxaCambio(''); }} color={C.accent}>
              Débito
            </Pill>
            <Pill active={payMethod === 'pix'} onPress={function() { setPayMethod('pix'); setCartaoId(null); setCartaoLabel(''); setMoedaOriginal(''); setValorOriginal(''); setTaxaCambio(''); }} color={C.green}>
              PIX
            </Pill>
            {cartoes.length > 0 ? (
              <Pill active={payMethod === 'cartao'} onPress={function() {
                setPayMethod('cartao');
                if (cartoes.length === 1) {
                  var c = cartoes[0];
                  var lbl = (c.apelido || c.bandeira.toUpperCase()) + ' ••' + c.ultimos_digitos;
                  setCartaoId(c.id);
                  setCartaoLabel(lbl);
                  setCartaoMoeda(c.moeda || 'BRL');
                } else if (cartoes.length > 1) {
                  Toast.show({ type: 'info', text1: 'Selecione um cartão', text2: 'Escolha o cartão para esta movimentação', visibilityTime: 3000 });
                }
              }} color={C.accent}>
                Cartão
              </Pill>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Card selector (when payMethod === 'cartao') */}
      {payMethod === 'cartao' && cartoes.length > 0 ? (
        <View>
          <Text style={styles.label}>CARTÃO *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {cartoes.map(function(c) {
                var cLabel = (c.apelido || c.bandeira.toUpperCase()) + ' ••' + c.ultimos_digitos;
                return (
                  <Pill key={c.id} active={cartaoId === c.id} onPress={function() {
                    setCartaoId(c.id);
                    setCartaoLabel(cLabel);
                    setCartaoMoeda(c.moeda || 'BRL');
                    // Reset foreign currency when switching cards
                    setMoedaOriginal('');
                    setValorOriginal('');
                    setTaxaCambio('');
                  }} color={C.accent}>
                    {cLabel}
                  </Pill>
                );
              })}
            </View>
          </ScrollView>
        </View>
      ) : null}

      {/* Currency selector (when card is selected) */}
      {payMethod === 'cartao' && cartaoId ? (
        <View>
          <Text style={styles.label}>MOEDA DO GASTO</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <Pill active={!moedaOriginal || moedaOriginal === cartaoMoeda} onPress={function() { setMoedaOriginal(''); setValorOriginal(''); setTaxaCambio(''); setValor(''); }} color={C.rf}>
              {cartaoMoeda}
            </Pill>
            {cartaoMoeda !== 'BRL' ? (
              <Pill active={moedaOriginal === 'BRL'} onPress={function() { handleSelectMoeda('BRL'); }} color={C.rf}>
                BRL
              </Pill>
            ) : null}
            {cartaoMoeda !== 'USD' ? (
              <Pill active={moedaOriginal === 'USD'} onPress={function() { handleSelectMoeda('USD'); }} color={C.rf}>
                USD
              </Pill>
            ) : null}
            {cartaoMoeda !== 'EUR' ? (
              <Pill active={moedaOriginal === 'EUR'} onPress={function() { handleSelectMoeda('EUR'); }} color={C.rf}>
                EUR
              </Pill>
            ) : null}
            <Pill active={false} onPress={function() { setShowCurrencyPicker(true); }} color={C.dim}>
              Buscar
            </Pill>
          </View>
        </View>
      ) : null}

      {/* Foreign currency fields (when moedaOriginal is set and different from card currency) */}
      {moedaOriginal && moedaOriginal !== cartaoMoeda ? (
        <View>
          <Text style={styles.label}>{'VALOR EM ' + getSymbol(moedaOriginal)}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Text style={{ fontSize: 14, color: C.sub, fontFamily: F.mono }}>{getSymbol(moedaOriginal)}</Text>
            <TextInput
              value={valorOriginal}
              onChangeText={onChangeValorOriginal}
              keyboardType="decimal-pad"
              placeholder="0,00"
              placeholderTextColor={C.dim}
              style={[styles.input, { flex: 1 }]}
            />
          </View>
          <Text style={styles.label}>TAXA DE CÂMBIO</Text>
          <TextInput
            value={taxaCambio}
            onChangeText={function(t) { setTaxaCambio(t); autoFillConvertido(valorOriginal, t); }}
            keyboardType="decimal-pad"
            placeholder="0,0000"
            placeholderTextColor={C.dim}
            style={[styles.input, { marginBottom: 4 }]}
          />
          {valorOriginal && taxaCambio ? (
            <Text style={{ color: C.dim, fontSize: 11, fontFamily: F.mono, marginBottom: 12 }}>
              {'Convertido: ' + getSymbol(cartaoMoeda) + ' ' + calcConvertido()}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Parcelas (when payMethod === 'cartao') */}
      {payMethod === 'cartao' && cartaoId ? (
        <View style={{ marginBottom: 12 }}>
          <Text style={styles.label}>PARCELAS</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(function(n) {
                  return (
                    <Pill key={n} active={parcelas === n} color={C.accent}
                      onPress={function() { setParcelas(n); }}>
                      {n === 1 ? 'À vista' : n + 'x'}
                    </Pill>
                  );
                })}
              </View>
            </ScrollView>
          </View>
          {parcelas > 1 && valorNum > 0 ? (
            <Text style={{ color: C.dim, fontSize: 11, fontFamily: F.mono, marginTop: 4 }}>
              {parcelas + 'x de ' + getSymbol(effectiveMoeda) + ' ' + (valorNum / parcelas).toFixed(2) + ' (total ' + getSymbol(effectiveMoeda) + ' ' + valorNum.toFixed(2) + ')'}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Conta (when payMethod === 'conta' or 'pix') */}
      {payMethod === 'conta' || payMethod === 'pix' ? (
        <View>
          <Text style={styles.label}>CONTA *</Text>
          {saldos.length > 0 ? (
            <View style={styles.pillRow}>
              {saldos.map(function(s) {
                var sName = s.corretora || s.name || '';
                var sMoeda = s.moeda || 'BRL';
                var pillLabel = sMoeda !== 'BRL' ? sName + ' (' + sMoeda + ')' : sName;
                return (
                  <Pill key={s.id} active={contaId === s.id} color={C.accent}
                    onPress={function() { setConta(sName); setContaId(s.id); setContaMoeda(sMoeda); }}>
                    {pillLabel}
                  </Pill>
                );
              })}
            </View>
          ) : (
            <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body }}>
              Nenhuma conta cadastrada. Crie uma conta primeiro.
            </Text>
          )}
        </View>
      ) : null}

      {/* Valor */}
      <Text style={styles.label}>{'VALOR (' + getSymbol(effectiveMoeda) + ')' + (moedaOriginal && moedaOriginal !== cartaoMoeda ? '' : ' *')}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 14, color: C.sub, fontFamily: F.mono }}>{getSymbol(effectiveMoeda)}</Text>
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

      {/* ── Toggle Mais Detalhes (ticker + descrição) ── */}
      {showTicker || !showDetails ? (
        <TouchableOpacity
          onPress={function() { animateLayout(); setShowDetails(!showDetails); }}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, marginTop: 2 }}
          activeOpacity={0.7}
        >
          <Ionicons name={showDetails ? 'chevron-up' : 'chevron-down'} size={16} color={C.accent} />
          <Text style={{ fontSize: 13, color: C.accent, fontFamily: F.body, marginLeft: 6 }}>
            {showDetails ? 'Menos detalhes' : 'Mais detalhes'}
          </Text>
        </TouchableOpacity>
      ) : null}

      {showDetails ? (
        <View>
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
        </View>
      ) : null}

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
      {valorNum > 0 || (payMethod === 'cartao' && moedaOriginal && moedaOriginal !== cartaoMoeda && parseBR(valorOriginal) > 0) ? (
        <Glass glow={tipo === 'entrada' ? C.green : C.red} padding={14}>
          <View style={styles.resumoRow}>
            <Text style={styles.resumoLabel}>{tipo === 'entrada' ? 'ENTRADA' : 'SAÍDA'}</Text>
            <Text style={[styles.resumoValue, { color: tipo === 'entrada' ? C.green : C.red }]}>
              {tipo === 'entrada' ? '+' : '-'}{getSymbol(effectiveMoeda) + ' '}{fmt(valorNum || (parseBR(valorOriginal) * (parseFloat(taxaCambio) || 0)))}
            </Text>
          </View>
          <View style={styles.resumoRow}>
            <Text style={styles.resumoLabel}>{payMethod === 'cartao' ? 'CARTÃO' : payMethod === 'pix' ? 'PIX' : 'DÉBITO'}</Text>
            <Text style={styles.resumoSmall}>{payMethod === 'cartao' ? (cartaoLabel || '—') : (conta || '—')}</Text>
          </View>
          {moedaOriginal && moedaOriginal !== cartaoMoeda && parseBR(valorOriginal) > 0 ? (
            <View style={styles.resumoRow}>
              <Text style={styles.resumoLabel}>ORIGINAL</Text>
              <Text style={styles.resumoSmall}>{getSymbol(moedaOriginal) + ' ' + valorOriginal}</Text>
            </View>
          ) : null}
        </Glass>
      ) : null}

      {/* Submit */}
      <TouchableOpacity onPress={handleSubmit} disabled={!canSubmit || loading} activeOpacity={0.8}
        style={[styles.submitBtn, !canSubmit && { opacity: 0.4 }]}
        accessibilityRole="button" accessibilityLabel="Registrar Movimentação">
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.submitText}>Registrar Movimentação</Text>
        )}
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>

    {/* CurrencyPicker modal */}
    <CurrencyPicker
      visible={showCurrencyPicker}
      onClose={function() { setShowCurrencyPicker(false); }}
      onSelect={function(currency) {
        handleSelectMoeda(currency.code);
        setShowCurrencyPicker(false);
      }}
      cardMoeda={cartaoMoeda}
      color={C.rf}
    />

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
  grupoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  grupoCard: {
    width: '30%', flexGrow: 1, minWidth: 95, maxWidth: '32%',
    paddingVertical: 10, paddingHorizontal: 8,
    borderRadius: 10, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.cardSolid, alignItems: 'center', gap: 5,
  },
  grupoIconWrap: {
    width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
  },
  grupoLabel: {
    fontSize: 10, fontFamily: F.body, color: C.sub, fontWeight: '600', textAlign: 'center',
  },
  resumoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 },
  resumoLabel: { fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 },
  resumoValue: { fontSize: 18, fontWeight: '800', fontFamily: F.display },
  resumoSmall: { fontSize: 12, fontWeight: '600', color: C.text, fontFamily: F.mono },
  submitBtn: { backgroundColor: C.green, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  submitText: { fontSize: 15, fontWeight: '700', color: 'white', fontFamily: F.display },
  fieldError: { fontSize: 11, color: C.red, fontFamily: F.mono, marginTop: 2 },
});
