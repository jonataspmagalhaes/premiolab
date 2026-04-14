// ═══════════════════════════════════════════════════════════
// FaturaScreen — Fatura do cartão de crédito
// Exibe lançamentos do mês, status, pontos/cashback,
// pagamento e importação de fatura PDF
// ═══════════════════════════════════════════════════════════

import React from 'react';
var useState = React.useState;
var useEffect = React.useEffect;
var useCallback = React.useCallback;
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  Alert, ActivityIndicator, Modal, TextInput, ScrollView, Keyboard, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Glass, Pill, Badge, SectionLabel, EmptyState, SwipeableRow } from '../../components';
import { useAuth } from '../../contexts/AuthContext';
import {
  getFatura, getSaldos, pagarFatura, deleteMovimentacao,
  getRegrasPontos, addMovimentacaoCartao,
} from '../../services/database';
import { getSymbol, fetchExchangeRates } from '../../services/currencyService';
import { C, F, SIZE } from '../../theme';
var finCats = require('../../constants/financeCategories');
var CAT_LABELS = finCats.CAT_LABELS;
var CAT_IONICONS = finCats.CAT_IONICONS;
var CAT_COLORS = finCats.CAT_COLORS;
import Toast from 'react-native-toast-message';
import widgetBridge from '../../services/widgetBridge';
import * as databaseModule from '../../services/database';
import * as currencyServiceModule from '../../services/currencyService';
import * as Haptics from 'expo-haptics';

// ── Meses em português ──
var MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// ── Helpers ──
function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Formata numero para o mesmo padrao do mask handler (ex: 1.234,56)
// Diferente de fmt() que usa toLocaleString e pode gerar chars inconsistentes
function fmtMask(v) {
  var cents = Math.round((v || 0) * 100);
  var reais = (cents / 100).toFixed(2);
  var parts = reais.split('.');
  var intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return intPart + ',' + parts[1];
}

// Parse valor formatado pelo mask (ex: "1.234,56" -> 1234.56)
function parseMask(str) {
  if (!str) return 0;
  return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
}

function formatDayMonth(isoStr) {
  if (!isoStr) return '';
  var parts = isoStr.substring(0, 10).split('-');
  if (parts.length !== 3) return isoStr;
  return parts[2] + '/' + parts[1];
}

function formatFullDate(isoStr) {
  if (!isoStr) return '';
  var parts = isoStr.substring(0, 10).split('-');
  if (parts.length !== 3) return isoStr;
  var day = parseInt(parts[2]);
  var month = parseInt(parts[1]) - 1;
  var shortMonth = MESES[month] ? MESES[month].substring(0, 3).toLowerCase() : parts[1];
  return day + '/' + shortMonth;
}

function daysBetween(isoA, isoB) {
  var a = new Date(isoA);
  var b = new Date(isoB);
  var diff = b.getTime() - a.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function todayIso() {
  var now = new Date();
  return now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
}

function groupByDate(movs) {
  var groups = [];
  var currentKey = '';
  var currentItems = [];
  for (var i = 0; i < movs.length; i++) {
    var m = movs[i];
    var dateStr = (m.data || '').substring(0, 10);
    var parts = dateStr.split('-');
    var label = dateStr;
    if (parts.length === 3) {
      var day = parseInt(parts[2]);
      var month = parseInt(parts[1]) - 1;
      var shortMonth = MESES[month] ? MESES[month].substring(0, 3).toUpperCase() : parts[1];
      label = day + ' ' + shortMonth;
    }
    if (label !== currentKey) {
      if (currentItems.length > 0) {
        groups.push({ label: currentKey, items: currentItems });
      }
      currentKey = label;
      currentItems = [];
    }
    currentItems.push(m);
  }
  if (currentItems.length > 0) {
    groups.push({ label: currentKey, items: currentItems });
  }
  return groups;
}

// ── Cálculo de pontos/cashback ──
// rates: objeto de cambio { USD: 5.20, EUR: 5.80 } (moeda -> BRL)
function calcPontos(movs, regras, tipoBeneficio, moedaCartao, rates) {
  var fxRates = rates || {};
  var total = 0;
  for (var i = 0; i < movs.length; i++) {
    var m = movs[i];
    if (m.tipo !== 'saida') continue;
    var valBRL = m.valor || 0;

    // Tentar match com cada regra
    var matched = null;
    var matchedVal = valBRL;
    for (var j = 0; j < regras.length; j++) {
      var r = regras[j];
      var valForRule = valBRL;

      if (r.moeda) {
        // Regra com moeda especifica (ex: USD)
        if (m.moeda_original && m.moeda_original === r.moeda && m.valor_original != null) {
          // Transacao ja tem valor na moeda da regra
          valForRule = m.valor_original;
        } else if (moedaCartao === 'BRL' && r.moeda !== 'BRL' && fxRates[r.moeda] && fxRates[r.moeda] > 0) {
          // Cartao BRL, regra em moeda estrangeira: converter BRL -> moeda da regra
          valForRule = valBRL / fxRates[r.moeda];
        } else if (moedaCartao === r.moeda) {
          // Cartao na mesma moeda da regra
          valForRule = valBRL;
        } else {
          // Moeda da regra nao bate e nao consegue converter
          continue;
        }
      }

      if (valForRule >= (r.valor_min || 0) && (!r.valor_max || valForRule <= r.valor_max)) {
        if (!matched || (r.moeda && !matched.moeda)) {
          matched = r;
          matchedVal = valForRule;
        }
      }
    }
    if (matched) {
      if (tipoBeneficio === 'pontos') {
        total += matchedVal * matched.taxa;
      } else {
        total += matchedVal * (matched.taxa / 100);
      }
    }
  }
  return total;
}

// ═══════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════

export default function FaturaScreen(props) {
  var navigation = props.navigation;
  var route = props.route;
  var auth = useAuth();
  var user = auth.user;
  var insets = useSafeAreaInsets();

  var params = route && route.params ? route.params : {};
  var cartaoId = params.cartaoId;
  var cartao = params.cartao || {};

  // ── Current month (ciclo mais relevante: fatura fechada se ainda não venceu) ──
  // Ex: fechamento 21, vencimento 1
  //   Em 01/abr: fatura fechada em 21/mar vence 01/abr → mostrar ela (mes=3)
  //   Em 02/abr: vencimento já passou → mostrar fatura aberta (mes=4)
  var now = new Date();
  var diaFechInit = cartao.dia_fechamento || 1;
  var diaVencInit = cartao.dia_vencimento || 1;
  var diaHoje = now.getDate();
  var mesAtual = now.getMonth() + 1;
  var anoAtual = now.getFullYear();

  // Ciclo aberto (acumulando gastos): se passou do fechamento, é o próximo mês
  var mesCicloAberto = mesAtual;
  var anoCicloAberto = anoAtual;
  if (diaHoje > diaFechInit) {
    mesCicloAberto = mesAtual === 12 ? 1 : mesAtual + 1;
    anoCicloAberto = mesAtual === 12 ? anoAtual + 1 : anoAtual;
  }

  // Ciclo fechado (anterior ao aberto)
  var mesCicloFechado = mesCicloAberto === 1 ? 12 : mesCicloAberto - 1;
  var anoCicloFechado = mesCicloAberto === 1 ? anoCicloAberto - 1 : anoCicloAberto;

  // Data de vencimento da fatura fechada
  var dueM, dueY;
  if (diaVencInit > diaFechInit) {
    dueM = mesCicloFechado;
    dueY = anoCicloFechado;
  } else {
    dueM = mesCicloFechado === 12 ? 1 : mesCicloFechado + 1;
    dueY = mesCicloFechado === 12 ? anoCicloFechado + 1 : anoCicloFechado;
  }

  // Se hoje <= vencimento da fatura fechada, mostrar ela (aguarda pagamento)
  var todayNum = anoAtual * 10000 + mesAtual * 100 + diaHoje;
  var dueNum = dueY * 10000 + dueM * 100 + diaVencInit;
  var initMes = todayNum <= dueNum ? mesCicloFechado : mesCicloAberto;
  var initAno = todayNum <= dueNum ? anoCicloFechado : anoCicloAberto;

  var _mes = useState(initMes); var mes = _mes[0]; var setMes = _mes[1];
  var _ano = useState(initAno); var ano = _ano[0]; var setAno = _ano[1];

  // ── Display month: label = mês de VENCIMENTO da fatura ──
  // Convenção BR: "Fatura de Abril" = a que vence em Abril
  var diaFech = cartao.dia_fechamento || 1;
  var diaVenc = cartao.dia_vencimento || 1;
  var mesDisplay, anoDisplay;
  if (diaVenc > diaFech) {
    // Vencimento no mesmo mês do fechamento
    mesDisplay = mes;
    anoDisplay = ano;
  } else {
    // Vencimento no mês seguinte ao fechamento
    mesDisplay = mes === 12 ? 1 : mes + 1;
    anoDisplay = mes === 12 ? ano + 1 : ano;
  }

  // ── Data ──
  var _faturaData = useState(null); var faturaData = _faturaData[0]; var setFaturaData = _faturaData[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _refreshing = useState(false); var refreshing = _refreshing[0]; var setRefreshing = _refreshing[1];
  var _saldos = useState([]); var saldos = _saldos[0]; var setSaldos = _saldos[1];
  var _regras = useState([]); var regras = _regras[0]; var setRegras = _regras[1];
  var _fxRates = useState({}); var fxRates = _fxRates[0]; var setFxRates = _fxRates[1];

  // ── Pay panel ──
  var _showPay = useState(false); var showPay = _showPay[0]; var setShowPay = _showPay[1];
  var _payConta = useState(''); var payConta = _payConta[0]; var setPayConta = _payConta[1];
  var _payValor = useState(''); var payValor = _payValor[0]; var setPayValor = _payValor[1];
  var _paying = useState(false); var paying = _paying[0]; var setPaying = _paying[1];

  // ── Lançar total manual ──
  var _showManual = useState(false); var showManual = _showManual[0]; var setShowManual = _showManual[1];
  var _manualValor = useState(''); var manualValor = _manualValor[0]; var setManualValor = _manualValor[1];
  var _manualDesc = useState(''); var manualDesc = _manualDesc[0]; var setManualDesc = _manualDesc[1];
  var _savingManual = useState(false); var savingManual = _savingManual[0]; var setSavingManual = _savingManual[1];

  // ── Confirmar fatura pós-vencimento ──
  var _confirmDismissed = useState(false); var confirmDismissed = _confirmDismissed[0]; var setConfirmDismissed = _confirmDismissed[1];
  var _confirmPayFromAccount = useState(false); var confirmPayFromAccount = _confirmPayFromAccount[0]; var setConfirmPayFromAccount = _confirmPayFromAccount[1];
  var _confirmPayConta = useState(cartao.conta_vinculada || ''); var confirmPayConta = _confirmPayConta[0]; var setConfirmPayConta = _confirmPayConta[1];
  var _confirmPaying = useState(false); var confirmPaying = _confirmPaying[0]; var setConfirmPaying = _confirmPaying[1];
  var _confirmValor = useState(''); var confirmValor = _confirmValor[0]; var setConfirmValor = _confirmValor[1];

  // ── Import modal ──
  var _importVisible = useState(false); var importVisible = _importVisible[0]; var setImportVisible = _importVisible[1];
  var _importText = useState(''); var importText = _importText[0]; var setImportText = _importText[1];
  var _importParsed = useState(null); var importParsed = _importParsed[0]; var setImportParsed = _importParsed[1];
  var _importSelected = useState([]); var importSelected = _importSelected[0]; var setImportSelected = _importSelected[1];
  var _importing = useState(false); var importing = _importing[0]; var setImporting = _importing[1];
  var _importStep = useState(1); var importStep = _importStep[0]; var setImportStep = _importStep[1];

  var moedaCartao = cartao.moeda || 'BRL';
  var symb = getSymbol(moedaCartao);

  // ── Load fatura data ──
  var load = function() {
    if (!user || !cartaoId) return Promise.resolve();
    setLoading(true);
    return Promise.all([
      getFatura(user.id, cartaoId, mes, ano),
      getSaldos(user.id),
      getRegrasPontos(cartaoId),
    ]).then(function(results) {
      var faturaResult = results[0];
      var saldosResult = results[1];
      var regrasResult = results[2];
      setFaturaData(faturaResult.data);
      setSaldos(saldosResult.data || []);
      var regrasData = regrasResult.data || [];
      setRegras(regrasData);
      // Buscar cambio para moedas das regras
      var regraMoedas = [];
      for (var ri = 0; ri < regrasData.length; ri++) {
        if (regrasData[ri].moeda && regrasData[ri].moeda !== 'BRL' && regraMoedas.indexOf(regrasData[ri].moeda) === -1) {
          regraMoedas.push(regrasData[ri].moeda);
        }
      }
      if (regraMoedas.length > 0) {
        fetchExchangeRates(regraMoedas).then(function(r) { setFxRates(r || {}); }).catch(function() {});
      }
      // Pre-select conta_vinculada for pay panel
      if (faturaResult.data && cartao.conta_vinculada) {
        setPayConta(cartao.conta_vinculada);
      }
      if (faturaResult.data) {
        setPayValor(fmtMask(faturaResult.data.total));
        setConfirmValor(fmtMask(faturaResult.data.total));
      }
      setLoading(false);
    }).catch(function(err) {
      console.warn('FaturaScreen load error:', err);
      setLoading(false);
    });
  };

  useFocusEffect(useCallback(function() { load(); }, [user, cartaoId, mes, ano]));

  function onRefresh() {
    setRefreshing(true);
    load().then(function() { setRefreshing(false); });
  }

  // ── Month navigation ──
  function prevMonth() {
    if (mes === 1) { setMes(12); setAno(ano - 1); }
    else { setMes(mes - 1); }
    setShowPay(false);
    setConfirmDismissed(false);
    setShowManual(false);
  }

  function nextMonth() {
    if (mes === 12) { setMes(1); setAno(ano + 1); }
    else { setMes(mes + 1); }
    setShowPay(false);
    setConfirmDismissed(false);
    setShowManual(false);
  }

  // ── Determine status ──
  function getStatus() {
    if (!faturaData) return 'aberta';
    var td = todayIso();
    if (faturaData.pago) {
      return faturaData.pagamentoTotal >= faturaData.total ? 'paga' : 'parcial';
    }
    if (td > faturaData.cycleEnd) return 'fechada';
    return 'aberta';
  }

  var status = getStatus();

  var STATUS_LABELS = {
    aberta: 'ABERTA', fechada: 'FECHADA', paga: 'PAGA', parcial: 'PARCIAL',
  };
  var STATUS_COLORS = {
    aberta: C.acoes, fechada: C.yellow, paga: C.green, parcial: '#F97316',
  };

  // ── Delete lancamento ──
  function handleDelete(mov) {
    Alert.alert(
      'Excluir lançamento',
      'Remover "' + (mov.descricao || 'este lançamento') + '"?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir', style: 'destructive', onPress: function() {
            deleteMovimentacao(mov.id).then(function() {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Toast.show({ type: 'success', text1: 'Lançamento excluído' });
              load();
            }).catch(function(err) {
              Alert.alert('Erro', 'Não foi possível excluir.');
            });
          },
        },
      ]
    );
  }

  // ── Pay fatura ──
  function handlePay() {
    Keyboard.dismiss();
    if (!payConta) {
      Alert.alert('Conta', 'Selecione a conta para pagamento.');
      return;
    }
    var valorNum = parseMask(payValor);
    if (!valorNum || valorNum <= 0) {
      Alert.alert('Valor', 'Informe um valor válido.');
      return;
    }
    setPaying(true);
    var dataHoje = todayIso();
    pagarFatura(user.id, cartaoId, payConta, valorNum, moedaCartao, dataHoje)
      .then(function(result) {
        setPaying(false);
        if (result.error) {
          Alert.alert('Erro', 'Não foi possível registrar o pagamento.');
          return;
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Toast.show({ type: 'success', text1: 'Fatura paga com sucesso!' });
        setShowPay(false);
        load();
        // Fire-and-forget: sync widget data
        widgetBridge.updateWidgetFromContext(user.id, databaseModule, currencyServiceModule).catch(function() {});
      }).catch(function() {
        setPaying(false);
        Alert.alert('Erro', 'Falha ao pagar fatura.');
      });
  }

  function onChangePayValor(text) {
    var clean = text.replace(/[^0-9]/g, '');
    if (!clean) { setPayValor(''); return; }
    var cents = parseInt(clean);
    var reais = (cents / 100).toFixed(2);
    var parts = reais.split('.');
    var intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    setPayValor(intPart + ',' + parts[1]);
  }

  // ── Lançar total manual ──
  function onChangeManualValor(text) {
    var clean = text.replace(/[^0-9]/g, '');
    if (!clean) { setManualValor(''); return; }
    var cents = parseInt(clean);
    var reais = (cents / 100).toFixed(2);
    var parts = reais.split('.');
    var intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    setManualValor(intPart + ',' + parts[1]);
  }

  function parseBRVal(str) {
    return parseMask(str);
  }

  function handleSaveManual() {
    Keyboard.dismiss();
    var val = parseBRVal(manualValor);
    if (val <= 0) {
      Alert.alert('Valor inválido', 'Informe o valor total da fatura.');
      return;
    }
    var diferenca = Math.round((val - total) * 100) / 100;
    if (diferenca <= 0) {
      Alert.alert('Tudo registrado', 'O total informado é igual ou menor que o já registrado (' + symb + ' ' + fmt(total) + '). Não há diferença a lançar.');
      return;
    }
    setSavingManual(true);
    var mesLabel = MESES[mesDisplay - 1] + '/' + anoDisplay;
    var descFatura = 'Gastos não especificados - Fatura ' + mesLabel;
    // Usar data dentro do ciclo (cycleEnd) para o lancamento cair na fatura correta
    var dataStr = faturaData && faturaData.cycleEnd ? faturaData.cycleEnd : todayIso();
    var label = (cartao.apelido || ((cartao.bandeira || '').toUpperCase())) + ' ••' + (cartao.ultimos_digitos || '');
    var mov = {
      conta: label,
      tipo: 'saida',
      categoria: 'despesa_variavel',
      subcategoria: 'nao_especificado',
      valor: diferenca,
      descricao: descFatura,
      data: dataStr,
      ticker: null,
      cartao_id: cartaoId,
    };
    addMovimentacaoCartao(user.id, mov).then(function(res) {
      if (res.error) {
        setSavingManual(false);
        Alert.alert('Erro', res.error.message || 'Erro ao salvar.');
        return;
      }
      // Se marcou pagar do saldo, registrar pagamento
      var payPromise = Promise.resolve();
      if (confirmPayFromAccount && confirmPayConta) {
        payPromise = pagarFatura(user.id, cartaoId, confirmPayConta, val, moedaCartao, todayIso());
      }
      payPromise.then(function(payRes) {
        setSavingManual(false);
        if (payRes && payRes.error) {
          Toast.show({ type: 'success', text1: 'Diferença lançada', text2: 'Mas houve erro ao pagar fatura' });
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          var msg = symb + ' ' + fmt(diferenca) + ' em gastos não especificados';
          if (confirmPayFromAccount && confirmPayConta) {
            msg = msg + ' + fatura paga de ' + confirmPayConta;
          }
          Toast.show({ type: 'success', text1: 'Diferença lançada', text2: msg });
        }
        setShowManual(false);
        setManualValor('');
        setManualDesc('');
        load();
        if (confirmPayFromAccount) {
          widgetBridge.updateWidgetFromContext(user.id, databaseModule, currencyServiceModule).catch(function() {});
        }
      });
    });
  }

  function onChangeConfirmValor(text) {
    var clean = text.replace(/[^0-9]/g, '');
    if (!clean) { setConfirmValor(''); return; }
    var cents = parseInt(clean);
    var reais = (cents / 100).toFixed(2);
    var parts = reais.split('.');
    var intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    setConfirmValor(intPart + ',' + parts[1]);
  }

  // ── Confirmar total da fatura (pós-vencimento) ──
  function handleConfirmTotal() {
    Keyboard.dismiss();
    var valorConfirmado = parseMask(confirmValor);
    if (valorConfirmado <= 0) {
      Alert.alert('Valor', 'Informe um valor válido.');
      return;
    }
    setConfirmPaying(true);

    // Se valor confirmado > total registrado, lancar a diferenca na fatura
    var diferenca = Math.round((valorConfirmado - total) * 100) / 100;
    var diffPromise = Promise.resolve();
    if (diferenca > 0) {
      var mesLabel = MESES[mesDisplay - 1] + '/' + anoDisplay;
      var descFatura = 'Gastos não especificados - Fatura ' + mesLabel;
      var dataStr = faturaData && faturaData.cycleEnd ? faturaData.cycleEnd : todayIso();
      var bandLabel = (cartao.apelido || ((cartao.bandeira || '').toUpperCase())) + ' ••' + (cartao.ultimos_digitos || '');
      diffPromise = addMovimentacaoCartao(user.id, {
        conta: bandLabel,
        tipo: 'saida',
        categoria: 'despesa_variavel',
        subcategoria: 'nao_especificado',
        valor: diferenca,
        descricao: descFatura,
        data: dataStr,
        cartao_id: cartaoId,
      });
    }

    diffPromise.then(function(diffResult) {
      if (diffResult && diffResult.error) {
        setConfirmPaying(false);
        Alert.alert('Erro', 'Não foi possível lançar a diferença: ' + (diffResult.error.message || ''));
        return Promise.reject('diff_error');
      }
      var payPromise = Promise.resolve();
      if (confirmPayFromAccount && confirmPayConta && valorConfirmado > 0) {
        payPromise = pagarFatura(user.id, cartaoId, confirmPayConta, valorConfirmado, moedaCartao, todayIso());
      }
      return payPromise;
    }).then(function(result) {
      if (result === 'diff_error') return;
      setConfirmPaying(false);
      if (result && result.error) {
        Alert.alert('Erro', 'Não foi possível registrar o pagamento: ' + (result.error.message || ''));
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      var toastMsg = symb + ' ' + fmtMask(valorConfirmado);
      if (diferenca > 0) {
        toastMsg = toastMsg + ' (diferença ' + symb + ' ' + fmtMask(diferenca) + ' lançada)';
      }
      if (confirmPayFromAccount && confirmPayConta) {
        Toast.show({ type: 'success', text1: 'Fatura confirmada e paga', text2: toastMsg + ' debitado de ' + confirmPayConta });
      } else {
        Toast.show({ type: 'success', text1: 'Fatura confirmada', text2: toastMsg });
      }
      setConfirmDismissed(true);
      load();
      if (confirmPayFromAccount) {
        widgetBridge.updateWidgetFromContext(user.id, databaseModule, currencyServiceModule).catch(function() {});
      }
    }).catch(function(err) {
      if (err === 'diff_error') return;
      setConfirmPaying(false);
      Alert.alert('Erro', 'Falha ao processar fatura.');
    });
  }

  // ── Import fatura ──
  function handleProcessImport() {
    Keyboard.dismiss();
    if (!importText.trim()) {
      Alert.alert('Texto vazio', 'Cole o texto copiado da fatura.');
      return;
    }
    // Simple parser: each non-empty line → date + description + value
    var lines = importText.split('\n');
    var parsed = [];
    var ignored = 0;
    var dateRegex = /^(\d{2}\/\d{2}(?:\/\d{2,4})?)/;
    var valorRegex = /([+-]?\s*\d{1,3}(?:\.\d{3})*,\d{2})\s*$/;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var dateMatch = line.match(dateRegex);
      var valorMatch = line.match(valorRegex);
      if (dateMatch && valorMatch) {
        var dateRaw = dateMatch[1];
        var valorRaw = valorMatch[1].replace(/\s/g, '');
        var valNum = parseFloat(valorRaw.replace(/\./g, '').replace(',', '.'));
        var desc = line.substring(dateMatch[0].length, line.length - valorMatch[0].length).trim();
        // Normalize date to YYYY-MM-DD
        var dateParts = dateRaw.split('/');
        var dataIso = '';
        if (dateParts.length === 3) {
          var yearPart = dateParts[2];
          if (yearPart.length === 2) yearPart = '20' + yearPart;
          dataIso = yearPart + '-' + dateParts[1] + '-' + dateParts[0];
        } else if (dateParts.length === 2) {
          dataIso = ano + '-' + dateParts[1] + '-' + dateParts[0];
        }
        parsed.push({
          data: dataIso,
          descricao: desc || 'Lançamento importado',
          valor: Math.abs(valNum),
          _selected: true,
          _duplicate: false,
        });
      } else {
        ignored++;
      }
    }

    // Dedup against existing fatura movs
    if (faturaData && faturaData.movs) {
      for (var p = 0; p < parsed.length; p++) {
        for (var e = 0; e < faturaData.movs.length; e++) {
          var existing = faturaData.movs[e];
          var sameDate = (existing.data || '').substring(0, 10) === parsed[p].data;
          var valueDiff = Math.abs((existing.valor || 0) - parsed[p].valor);
          if (sameDate && valueDiff < 0.02) {
            parsed[p]._duplicate = true;
            parsed[p]._selected = false;
            break;
          }
        }
      }
    }

    var selectedArr = [];
    for (var s = 0; s < parsed.length; s++) {
      selectedArr.push(parsed[s]._selected);
    }
    setImportParsed(parsed);
    setImportSelected(selectedArr);
    setImportStep(2);
  }

  function toggleImportItem(idx) {
    var next = [];
    for (var i = 0; i < importSelected.length; i++) {
      next.push(i === idx ? !importSelected[i] : importSelected[i]);
    }
    setImportSelected(next);
  }

  function countSelected() {
    var c = 0;
    for (var i = 0; i < importSelected.length; i++) {
      if (importSelected[i]) c++;
    }
    return c;
  }

  function handleImportConfirm() {
    if (!importParsed || countSelected() === 0) return;
    setImporting(true);
    var toImport = [];
    for (var i = 0; i < importParsed.length; i++) {
      if (importSelected[i]) toImport.push(importParsed[i]);
    }
    var promises = [];
    for (var j = 0; j < toImport.length; j++) {
      var item = toImport[j];
      promises.push(addMovimentacaoCartao(user.id, {
        cartao_id: cartaoId,
        categoria: 'despesa_variavel',
        valor: item.valor,
        descricao: item.descricao,
        data: item.data,
        bandeira: cartao.bandeira,
        ultimos_digitos: cartao.ultimos_digitos,
      }));
    }
    Promise.all(promises).then(function() {
      setImporting(false);
      setImportVisible(false);
      setImportText('');
      setImportParsed(null);
      setImportStep(1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Toast.show({ type: 'success', text1: toImport.length + ' lançamentos importados' });
      load();
    }).catch(function() {
      setImporting(false);
      Alert.alert('Erro', 'Falha ao importar lançamentos.');
    });
  }

  function closeImportModal() {
    setImportVisible(false);
    setImportText('');
    setImportParsed(null);
    setImportStep(1);
  }

  // ── Navigate to edit ──
  function handleEditMov(mov) {
    navigation.navigate('EditMovimentacao', { movimentacao: mov });
  }

  // ── Derived data ──
  var movs = faturaData ? faturaData.movs || [] : [];
  var total = faturaData ? faturaData.total || 0 : 0;
  var groups = groupByDate(movs);
  var dte = faturaData ? daysBetween(todayIso(), faturaData.dueDate) : 0;

  // Points/cashback
  var pontosValue = 0;
  var hasBeneficio = cartao.tipo_beneficio && regras.length > 0;
  if (hasBeneficio) {
    pontosValue = calcPontos(movs, regras, cartao.tipo_beneficio, moedaCartao, fxRates);
  }

  // Limit usage
  var limite = cartao.limite || 0;
  var usagePercent = limite > 0 ? Math.min((total / limite) * 100, 100) : 0;

  // ── Title ──
  var bandeiraTxt = cartao.bandeira ? cartao.bandeira.toUpperCase() : '';
  var digitosTxt = cartao.ultimos_digitos || '****';
  var title = 'Fatura ' + bandeiraTxt + ' ••••' + digitosTxt;

  // ══════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════

  // ── Render lancamento item ──
  function renderItem(item) {
    var m = item;
    var catIcon = CAT_IONICONS[m.categoria] || 'ellipse-outline';
    var catColor = CAT_COLORS[m.categoria] || C.dim;
    var catLabel = m.descricao || CAT_LABELS[m.categoria] || m.categoria || '';
    var valorStr = symb + ' ' + fmt(m.valor);

    return (
      <SwipeableRow onDelete={function() { handleDelete(m); }}>
        <TouchableOpacity
          style={styles.movRow}
          activeOpacity={0.7}
          onPress={function() { handleEditMov(m); }}
        >
          <View style={[styles.movIcon, { backgroundColor: catColor + '22' }]}>
            <Ionicons name={catIcon} size={16} color={catColor} />
          </View>
          <View style={styles.movInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={[styles.movDesc, { flex: 0, flexShrink: 1 }]} numberOfLines={1}>{catLabel}</Text>
              {m.parcela_atual && m.parcela_total ? <Badge text={m.parcela_atual + '/' + m.parcela_total} color={C.etfs} /> : null}
            </View>
            {m.subcategoria ? (
              <Text style={styles.movSub} numberOfLines={1}>
                {finCats.getSubcatLabel(m.subcategoria)}
              </Text>
            ) : null}
          </View>
          <Text style={styles.movValor}>{valorStr}</Text>
        </TouchableOpacity>
      </SwipeableRow>
    );
  }

  // ── Build FlatList data ──
  var flatData = [];
  for (var g = 0; g < groups.length; g++) {
    flatData.push({ _type: 'header', label: groups[g].label, _key: 'h_' + g });
    for (var gi = 0; gi < groups[g].items.length; gi++) {
      var mov = groups[g].items[gi];
      flatData.push(Object.assign({}, mov, { _type: 'item', _key: 'i_' + (mov.id || g + '_' + gi) }));
    }
  }

  function renderFlatItem(info) {
    var d = info.item;
    if (d._type === 'header') {
      return (
        <Text style={styles.dateHeader}>{d.label}</Text>
      );
    }
    return renderItem(d);
  }

  function keyExtractor(item) { return item._key || item.id || Math.random().toString(); }

  // ── Header component for FlatList ──
  function renderListHeader() {
    return (
      <View>
        {/* Hero card */}
        <Glass style={styles.hero}>
          <View style={styles.heroRow}>
            <View>
              <Text style={styles.heroLabel}>Total da fatura</Text>
              <Text style={styles.heroValue}>{symb + ' ' + fmt(total)}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[status] || C.dim) + '22' }]}>
              <Text style={[styles.statusText, { color: STATUS_COLORS[status] || C.dim }]}>
                {STATUS_LABELS[status] || status}
              </Text>
            </View>
          </View>


          {faturaData ? (
            <View style={styles.heroDates}>
              <Text style={styles.heroCycle}>
                {formatFullDate(faturaData.cycleStart) + ' a ' + formatFullDate(faturaData.cycleEnd)}
              </Text>
              <Text style={styles.heroDue}>
                {'Vencimento ' + formatDayMonth(faturaData.dueDate) + (dte > 0 ? ' (' + dte + ' dias)' : dte === 0 ? ' (hoje)' : '')}
              </Text>
            </View>
          ) : null}

          {limite > 0 ? (
            <View style={styles.limitSection}>
              <View style={styles.limitRow}>
                <Text style={styles.limitLabel}>Limite utilizado</Text>
                <Text style={styles.limitPct}>{usagePercent.toFixed(0) + '%'}</Text>
              </View>
              <View style={styles.limitBar}>
                <View style={[
                  styles.limitFill,
                  {
                    width: usagePercent + '%',
                    backgroundColor: usagePercent > 90 ? C.red : usagePercent > 70 ? C.yellow : C.green,
                  },
                ]} />
              </View>
              <View style={styles.limitRow}>
                <Text style={styles.limitVal}>{symb + ' ' + fmt(total)}</Text>
                <Text style={styles.limitVal}>{symb + ' ' + fmt(limite)}</Text>
              </View>
            </View>
          ) : null}

          {status === 'parcial' && faturaData ? (
            <View style={styles.parcialRow}>
              <Text style={styles.parcialLabel}>Pago até agora:</Text>
              <Text style={styles.parcialVal}>{symb + ' ' + fmt(faturaData.pagamentoTotal)}</Text>
            </View>
          ) : null}
        </Glass>

        {/* Points / Cashback card */}
        {hasBeneficio ? (
          <Glass style={styles.pontosCard}>
            <View style={styles.pontosHeader}>
              <View style={styles.pontosIconWrap}>
                <Ionicons
                  name={cartao.tipo_beneficio === 'pontos' ? 'star' : 'cash-outline'}
                  size={20}
                  color={cartao.tipo_beneficio === 'pontos' ? C.yellow : C.green}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pontosProgramLabel}>
                  {cartao.programa_nome || (cartao.tipo_beneficio === 'pontos' ? 'Programa de Pontos' : 'Cashback')}
                </Text>
                <Text style={styles.pontosSubLabel}>Acumulado este mês</Text>
              </View>
            </View>
            <View style={styles.pontosValueRow}>
              {cartao.tipo_beneficio === 'pontos' ? (
                <View style={{ alignItems: 'center', flex: 1 }}>
                  <Text style={styles.pontosValueBig}>
                    {Math.round(pontosValue).toLocaleString('pt-BR')}
                  </Text>
                  <Text style={styles.pontosUnit}>pontos</Text>
                </View>
              ) : (
                <View style={{ alignItems: 'center', flex: 1 }}>
                  <Text style={[styles.pontosValueBig, { color: C.green }]}>
                    {symb + ' ' + fmt(pontosValue)}
                  </Text>
                  <Text style={styles.pontosUnit}>
                    {total > 0 ? (pontosValue / total * 100).toFixed(1) + '% da fatura' : 'cashback'}
                  </Text>
                </View>
              )}
            </View>
            {/* Taxa info */}
            {regras.length > 0 ? (
              <View style={styles.pontosTaxaRow}>
                {regras.map(function(r, ri) {
                  var taxaLabel = cartao.tipo_beneficio === 'pontos'
                    ? (r.taxa + 'x' + (r.moeda ? ' (' + r.moeda + ')' : ''))
                    : (r.taxa + '%' + (r.moeda ? ' (' + r.moeda + ')' : ''));
                  return (
                    <View key={ri} style={styles.pontosTaxaBadge}>
                      <Text style={styles.pontosTaxaText}>{taxaLabel}</Text>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </Glass>
        ) : null}

        {/* Pay panel */}
        {status === 'fechada' && total > 0 ? (
          <View>
            {!showPay ? (
              <TouchableOpacity style={styles.payBtn} activeOpacity={0.7} onPress={function() { setShowPay(true); }}>
                <Ionicons name="wallet-outline" size={18} color={C.text} />
                <Text style={styles.payBtnText}>Pagar Fatura</Text>
              </TouchableOpacity>
            ) : (
              <Glass style={styles.payPanel}>
                <Text style={styles.payTitle}>Pagamento da Fatura</Text>

                <Text style={styles.payLabel}>CONTA</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.contaPills}>
                  {saldos.map(function(s) {
                    var sName = s.corretora || s.name || '';
                    var selected = payConta === sName;
                    return (
                      <TouchableOpacity
                        key={s.id || sName}
                        style={[styles.contaPill, selected && styles.contaPillActive]}
                        activeOpacity={0.7}
                        onPress={function() { setPayConta(sName); }}
                      >
                        <Text style={[styles.contaPillText, selected && styles.contaPillTextActive]}>
                          {sName}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <Text style={styles.payLabel}>VALOR</Text>
                <View style={styles.payInputRow}>
                  <Text style={styles.payPrefix}>{symb}</Text>
                  <TextInput
                    style={styles.payInput}
                    value={payValor}
                    onChangeText={onChangePayValor}
                    keyboardType="decimal-pad"
                    placeholderTextColor={C.dim}
                    placeholder="0,00"
                  />
                </View>

                <View style={styles.payActions}>
                  <TouchableOpacity style={styles.payCancelBtn} activeOpacity={0.7} onPress={function() { setShowPay(false); }}>
                    <Text style={styles.payCancelText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.payConfirmBtn, paying && { opacity: 0.6 }]}
                    activeOpacity={0.7}
                    onPress={handlePay}
                    disabled={paying}
                  >
                    {paying ? (
                      <ActivityIndicator size="small" color={C.text} />
                    ) : (
                      <Text style={styles.payConfirmText}>Pagar Fatura</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </Glass>
            )}
          </View>
        ) : null}

        {/* Section label */}
        <SectionLabel style={styles.sectionLabel}>
          {'LANÇAMENTOS (' + movs.length + ')'}
        </SectionLabel>
      </View>
    );
  }

  // ── Loading ──
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={function() { navigation.goBack(); }} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={C.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={function() { navigation.goBack(); }}
          style={styles.backBtn}
          accessibilityLabel="Voltar"
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            style={styles.importBtn}
            activeOpacity={0.7}
            onPress={function() { navigation.navigate('ConfigGastosRapidos', { presetCartaoId: cartaoId }); }}
            accessibilityLabel="Gastos rápidos"
            accessibilityRole="button"
          >
            <Ionicons name="flash-outline" size={20} color={C.etfs} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.importBtn}
            activeOpacity={0.7}
            onPress={function() { setImportVisible(true); }}
            accessibilityLabel="Importar fatura"
            accessibilityRole="button"
          >
            <Ionicons name="document-text-outline" size={20} color={C.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Month navigation */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={prevMonth} style={styles.monthArrow} accessibilityLabel="Mês anterior">
          <Ionicons name="chevron-back" size={20} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{MESES[mesDisplay - 1] + ' ' + anoDisplay}</Text>
        <TouchableOpacity onPress={nextMonth} style={styles.monthArrow} accessibilityLabel="Próximo mês">
          <Ionicons name="chevron-forward" size={20} color={C.text} />
        </TouchableOpacity>
      </View>

      {/* Banner confirmar fatura pós-vencimento */}
      {(status === 'fechada') && total > 0 && !confirmDismissed && !showManual ? (
        <Glass style={{ marginHorizontal: SIZE.padding, marginBottom: 10, padding: 14, borderWidth: 1, borderColor: C.yellow + '44' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Ionicons name="alert-circle" size={20} color={C.yellow} />
            <Text style={{ fontSize: 13, fontFamily: F.display, color: C.text, flex: 1 }}>
              Confirme o total da fatura
            </Text>
          </View>
          <Text style={{ fontSize: 12, color: C.textSecondary, marginBottom: 12 }}>
            A fatura venceu. Confira o valor e ajuste se necessário.
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, paddingHorizontal: 4 }}>
            <Text style={{ fontSize: 11, fontFamily: F.body, color: C.dim }}>Registrado: {symb + ' ' + fmt(total)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingVertical: 4, paddingHorizontal: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, borderWidth: 1, borderColor: C.border }}>
            <Text style={{ fontSize: 14, fontFamily: F.mono, color: C.dim, marginRight: 6 }}>{symb}</Text>
            <TextInput
              style={{ flex: 1, fontSize: 16, fontFamily: F.mono, color: C.text, paddingVertical: 8 }}
              value={confirmValor}
              onChangeText={onChangeConfirmValor}
              keyboardType="decimal-pad"
              placeholderTextColor={C.dim}
              placeholder="0,00"
            />
          </View>

          {/* Opção pagar do saldo */}
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}
            activeOpacity={0.7}
            onPress={function() { setConfirmPayFromAccount(!confirmPayFromAccount); }}
          >
            <Ionicons
              name={confirmPayFromAccount ? 'checkbox' : 'square-outline'}
              size={20}
              color={confirmPayFromAccount ? C.green : C.dim}
            />
            <Text style={{ fontSize: 12, fontFamily: F.body, color: C.text, flex: 1 }}>
              Pagar fatura do saldo bancário
            </Text>
          </TouchableOpacity>

          {confirmPayFromAccount ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {saldos.map(function(s) {
                var sName = s.corretora || s.name || '';
                var sel = confirmPayConta === sName;
                return (
                  <TouchableOpacity
                    key={s.id || sName}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginRight: 8, backgroundColor: sel ? C.accent : 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: sel ? C.accent : C.border }}
                    activeOpacity={0.7}
                    onPress={function() { setConfirmPayConta(sName); }}
                  >
                    <Text style={{ fontSize: 12, fontFamily: F.body, color: sel ? C.text : C.textSecondary }}>{sName}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
            <TouchableOpacity
              style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 }}
              activeOpacity={0.7}
              onPress={function() { setConfirmDismissed(true); }}
            >
              <Text style={{ fontSize: 13, color: C.dim, fontFamily: F.body }}>Dispensar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ backgroundColor: C.green, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, opacity: (confirmPaying || (confirmPayFromAccount && !confirmPayConta) || !confirmValor) ? 0.4 : 1 }}
              activeOpacity={0.7}
              onPress={handleConfirmTotal}
              disabled={confirmPaying || (confirmPayFromAccount && !confirmPayConta) || !confirmValor}
            >
              {confirmPaying ? (
                <ActivityIndicator size="small" color={C.text} />
              ) : (
                <Text style={{ fontSize: 13, color: C.text, fontFamily: F.display }}>
                  {confirmPayFromAccount ? 'Confirmar e pagar' : 'Confirmar total'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </Glass>
      ) : null}

      {/* Lançar total manual — outside FlatList to avoid keyboard issues */}
      {!showManual ? (
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: SIZE.padding, marginBottom: 10, paddingVertical: 8 }}
          activeOpacity={0.7}
          onPress={function() { setShowManual(true); }}
        >
          <Ionicons name="calculator-outline" size={16} color={C.rf} />
          <Text style={{ fontSize: 13, fontFamily: F.body, color: C.rf }}>
            Informar total da fatura
          </Text>
        </TouchableOpacity>
      ) : (
        <Glass style={{ marginHorizontal: SIZE.padding, marginBottom: 10, padding: 14 }}>
          <Text style={{ fontSize: 13, fontFamily: F.display, color: C.text, marginBottom: 10 }}>
            Informar total da fatura
          </Text>
          <Text style={{ fontSize: 11, color: C.dim, marginBottom: 6 }}>
            Informe o total real da fatura. Se for maior que o registrado, a diferença será lançada como "Gastos não especificados".
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
            <Text style={{ fontSize: 12, fontFamily: F.body, color: C.textSecondary }}>Registrado</Text>
            <Text style={{ fontSize: 14, fontFamily: F.mono, color: C.text }}>{symb + ' ' + fmt(total)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontSize: 14, fontFamily: F.mono, color: C.dim, marginRight: 6 }}>{symb}</Text>
            <TextInput
              style={{ flex: 1, height: 44, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, color: C.text, fontFamily: F.mono, fontSize: 16, backgroundColor: 'rgba(255,255,255,0.04)' }}
              value={manualValor}
              onChangeText={onChangeManualValor}
              keyboardType="decimal-pad"
              placeholder="Total real da fatura"
              placeholderTextColor={C.dim}
              returnKeyType="done"
            />
          </View>
          {parseBRVal(manualValor) > 0 ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: (parseBRVal(manualValor) - total) > 0 ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
              <Text style={{ fontSize: 12, fontFamily: F.body, color: (parseBRVal(manualValor) - total) > 0 ? C.green : C.textSecondary }}>Diferença</Text>
              <Text style={{ fontSize: 14, fontFamily: F.mono, color: (parseBRVal(manualValor) - total) > 0 ? C.green : C.textSecondary }}>
                {(parseBRVal(manualValor) - total) > 0 ? (symb + ' ' + fmt(Math.round((parseBRVal(manualValor) - total) * 100) / 100)) : 'Nenhuma diferença'}
              </Text>
            </View>
          ) : null}

          {/* Opção pagar do saldo */}
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}
            activeOpacity={0.7}
            onPress={function() { setConfirmPayFromAccount(!confirmPayFromAccount); }}
          >
            <Ionicons
              name={confirmPayFromAccount ? 'checkbox' : 'square-outline'}
              size={20}
              color={confirmPayFromAccount ? C.green : C.dim}
            />
            <Text style={{ fontSize: 12, fontFamily: F.body, color: C.text, flex: 1 }}>
              Pagar fatura do saldo bancário
            </Text>
          </TouchableOpacity>

          {confirmPayFromAccount ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              {saldos.map(function(s) {
                var sName = s.corretora || s.name || '';
                var sel = confirmPayConta === sName;
                return (
                  <TouchableOpacity
                    key={s.id || sName}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginRight: 8, backgroundColor: sel ? C.accent : 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: sel ? C.accent : C.border }}
                    activeOpacity={0.7}
                    onPress={function() { setConfirmPayConta(sName); }}
                  >
                    <Text style={{ fontSize: 12, fontFamily: F.body, color: sel ? C.text : C.textSecondary }}>{sName}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
            <TouchableOpacity
              style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 }}
              activeOpacity={0.7}
              onPress={function() { setShowManual(false); setManualValor(''); setManualDesc(''); }}
            >
              <Text style={{ fontSize: 13, color: C.dim, fontFamily: F.body }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ backgroundColor: (parseBRVal(manualValor) > total && !savingManual) ? C.green : C.accent, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, opacity: (parseBRVal(manualValor) > 0 && !savingManual) ? 1 : 0.4 }}
              activeOpacity={0.7}
              onPress={handleSaveManual}
              disabled={parseBRVal(manualValor) <= 0 || savingManual}
            >
              {savingManual ? (
                <ActivityIndicator size="small" color={C.text} />
              ) : (
                <Text style={{ fontSize: 13, color: C.text, fontFamily: F.display }}>
                  {(parseBRVal(manualValor) > total) ? 'Lançar diferença' : 'Lançar'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </Glass>
      )}

      {/* Content */}
      <FlatList
        data={flatData}
        renderItem={renderFlatItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={renderListHeader}
        ListEmptyComponent={
          <EmptyState
            ionicon="receipt-outline"
            title="Nenhum lançamento"
            subtitle="Esta fatura não possui lançamentos no período."
          />
        }
        contentContainerStyle={styles.listContent}
        refreshing={refreshing}
        onRefresh={onRefresh}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={5}
      />

      {/* Import Modal */}
      <Modal visible={importVisible} animationType="slide" transparent={false}>
        <View style={styles.modalContainer}>
          <View style={[styles.modalHeader, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity onPress={closeImportModal} accessibilityLabel="Fechar" accessibilityRole="button">
              <Ionicons name="close" size={24} color={C.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Importar Fatura</Text>
            <View style={{ width: 24 }} />
          </View>

          {importStep === 1 ? (
            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalHint}>
                Cole o texto copiado do PDF da fatura. Cada linha deve conter data, descrição e valor.
              </Text>
              <TextInput
                style={styles.importInput}
                multiline
                numberOfLines={12}
                value={importText}
                onChangeText={setImportText}
                placeholder={'Exemplo:\n25/02  Supermercado XYZ    287,50\n26/02  Streaming ABC       39,90'}
                placeholderTextColor={C.dim}
                textAlignVertical="top"
                autoFocus
              />
              <TouchableOpacity
                style={[styles.processBtn, !importText.trim() && { opacity: 0.4 }]}
                activeOpacity={0.7}
                onPress={handleProcessImport}
                disabled={!importText.trim()}
              >
                <Text style={styles.processBtnText}>Processar</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <View style={styles.modalBody2}>
              <Text style={styles.previewCount}>
                {(importParsed ? importParsed.length : 0) + ' lançamentos detectados'}
                {importParsed ? (function() {
                  var dups = 0;
                  for (var d = 0; d < importParsed.length; d++) { if (importParsed[d]._duplicate) dups++; }
                  return dups > 0 ? '  •  ' + dups + ' duplicados' : '';
                })() : ''}
              </Text>

              <FlatList
                data={importParsed || []}
                keyExtractor={function(item, idx) { return 'imp_' + idx; }}
                renderItem={function(info) {
                  var item = info.item;
                  var idx = info.index;
                  var selected = importSelected[idx];
                  var isDup = item._duplicate;
                  return (
                    <TouchableOpacity
                      style={[styles.importRow, isDup && styles.importRowDup]}
                      activeOpacity={0.7}
                      onPress={function() { toggleImportItem(idx); }}
                    >
                      <Ionicons
                        name={selected ? 'checkbox' : 'square-outline'}
                        size={20}
                        color={selected ? C.accent : C.dim}
                      />
                      <View style={styles.importRowInfo}>
                        <Text style={styles.importRowDesc} numberOfLines={1}>{item.descricao}</Text>
                        <Text style={styles.importRowDate}>{formatDayMonth(item.data)}</Text>
                      </View>
                      <Text style={styles.importRowVal}>{symb + ' ' + fmt(item.valor)}</Text>
                      {isDup ? (
                        <View style={styles.dupBadge}>
                          <Text style={styles.dupBadgeText}>DUP</Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  );
                }}
                contentContainerStyle={{ paddingBottom: 80 }}
                initialNumToRender={20}
              />

              <View style={styles.importFooter}>
                <TouchableOpacity
                  style={styles.importBackBtn}
                  activeOpacity={0.7}
                  onPress={function() { setImportStep(1); setImportParsed(null); }}
                >
                  <Text style={styles.importBackText}>Voltar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.importConfirmBtn, (countSelected() === 0 || importing) && { opacity: 0.4 }]}
                  activeOpacity={0.7}
                  onPress={handleImportConfirm}
                  disabled={countSelected() === 0 || importing}
                >
                  {importing ? (
                    <ActivityIndicator size="small" color={C.text} />
                  ) : (
                    <Text style={styles.importConfirmText}>
                      {'Importar ' + countSelected() + ' lançamentos'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════
var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SIZE.padding, paddingTop: 12, paddingBottom: 8,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontFamily: F.display, fontSize: 16, color: C.text, textAlign: 'center', marginHorizontal: 8 },
  headerRight: { width: 28 },
  importBtn: { padding: 4 },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Month nav
  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, gap: 16,
  },
  monthArrow: { padding: 6 },
  monthLabel: { fontFamily: F.body, fontSize: 16, color: C.text, minWidth: 140, textAlign: 'center' },

  // Hero
  hero: { marginHorizontal: SIZE.padding, marginTop: 4, marginBottom: SIZE.gap },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroLabel: { fontFamily: F.body, fontSize: 12, color: C.sub, marginBottom: 2 },
  heroValue: { fontFamily: F.mono, fontSize: 28, color: C.text },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontFamily: F.display, fontSize: 11, letterSpacing: 0.5 },
  saldoBreakdown: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  saldoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  saldoLabel: { fontFamily: F.body, fontSize: 12, color: C.sub },
  saldoVal: { fontFamily: F.mono, fontSize: 12, color: C.sub },
  saldoDivider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border, marginVertical: 6 },
  heroDates: { marginTop: 12 },
  heroCycle: { fontFamily: F.body, fontSize: 12, color: C.sub },
  heroDue: { fontFamily: F.body, fontSize: 12, color: C.text, marginTop: 2 },
  limitSection: { marginTop: 14 },
  limitRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  limitLabel: { fontFamily: F.body, fontSize: 11, color: C.sub },
  limitPct: { fontFamily: F.mono, fontSize: 11, color: C.text },
  limitBar: { height: 6, borderRadius: 3, backgroundColor: C.border, marginVertical: 4, overflow: 'hidden' },
  limitFill: { height: 6, borderRadius: 3 },
  limitVal: { fontFamily: F.mono, fontSize: 10, color: C.dim },
  parcialRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  parcialLabel: { fontFamily: F.body, fontSize: 12, color: C.sub },
  parcialVal: { fontFamily: F.mono, fontSize: 13, color: C.green },

  // Points / Cashback
  pontosCard: { marginHorizontal: SIZE.padding, marginBottom: SIZE.gap },
  pontosHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  pontosIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.yellow + '18', justifyContent: 'center', alignItems: 'center' },
  pontosProgramLabel: { fontFamily: F.display, fontSize: 13, color: C.text },
  pontosSubLabel: { fontFamily: F.body, fontSize: 11, color: C.dim, marginTop: 1 },
  pontosValueRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 8 },
  pontosValueBig: { fontFamily: F.mono, fontSize: 24, color: C.yellow, fontWeight: '700' },
  pontosUnit: { fontFamily: F.body, fontSize: 11, color: C.dim, marginTop: 2 },
  pontosTaxaRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 4 },
  pontosTaxaBadge: { backgroundColor: C.yellow + '18', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  pontosTaxaText: { fontFamily: F.mono, fontSize: 10, color: C.yellow },

  // Pay button
  payBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: SIZE.padding, marginBottom: SIZE.gap,
    paddingVertical: 12, borderRadius: SIZE.radius,
    backgroundColor: C.accent + '22', borderWidth: 1, borderColor: C.accent + '44',
  },
  payBtnText: { fontFamily: F.display, fontSize: 14, color: C.text },

  // Pay panel
  payPanel: { marginHorizontal: SIZE.padding, marginBottom: SIZE.gap },
  payTitle: { fontFamily: F.display, fontSize: 14, color: C.text, marginBottom: 12 },
  payLabel: { fontFamily: F.display, fontSize: 10, color: C.sub, marginBottom: 6, letterSpacing: 1 },
  contaPills: { marginBottom: 12, maxHeight: 36 },
  contaPill: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: C.surface, marginRight: 8, borderWidth: 1, borderColor: C.border,
  },
  contaPillActive: { backgroundColor: C.accent + '33', borderColor: C.accent },
  contaPillText: { fontFamily: F.body, fontSize: 12, color: C.sub },
  contaPillTextActive: { color: C.text },
  payInputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 10, paddingHorizontal: 12, marginBottom: 14, borderWidth: 1, borderColor: C.border },
  payPrefix: { fontFamily: F.mono, fontSize: 14, color: C.sub, marginRight: 4 },
  payInput: { flex: 1, fontFamily: F.mono, fontSize: 16, color: C.text, paddingVertical: 10 },
  payActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  payCancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  payCancelText: { fontFamily: F.body, fontSize: 13, color: C.sub },
  payConfirmBtn: { backgroundColor: C.accent, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10 },
  payConfirmText: { fontFamily: F.display, fontSize: 13, color: C.text },

  // Section label
  sectionLabel: { marginHorizontal: SIZE.padding, marginTop: 4, marginBottom: 8 },

  // Lancamentos
  listContent: { paddingBottom: 40 },
  dateHeader: {
    fontFamily: F.display, fontSize: 11, color: C.sub, letterSpacing: 1,
    marginHorizontal: SIZE.padding, marginTop: 12, marginBottom: 6,
  },
  movRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SIZE.padding, paddingVertical: 10,
  },
  movIcon: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  movInfo: { flex: 1, marginRight: 8 },
  movDesc: { fontFamily: F.body, fontSize: 13, color: C.text },
  movSub: { fontFamily: F.body, fontSize: 11, color: C.sub, marginTop: 1 },
  movValor: { fontFamily: F.mono, fontSize: 13, color: C.red },

  // Import modal
  modalContainer: { flex: 1, backgroundColor: C.bg },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SIZE.padding, paddingTop: 16, paddingBottom: 12,
  },
  modalTitle: { fontFamily: F.display, fontSize: 16, color: C.text },
  modalBody: { flex: 1, paddingHorizontal: SIZE.padding },
  modalBody2: { flex: 1 },
  modalHint: { fontFamily: F.body, fontSize: 13, color: C.sub, marginBottom: 12, lineHeight: 20 },
  importInput: {
    fontFamily: F.mono, fontSize: 12, color: C.text, lineHeight: 20,
    backgroundColor: C.surface, borderRadius: SIZE.radius, padding: 14,
    minHeight: 220, borderWidth: 1, borderColor: C.border, textAlignVertical: 'top',
  },
  processBtn: {
    backgroundColor: C.accent, borderRadius: 10, paddingVertical: 14,
    alignItems: 'center', marginTop: 16,
  },
  processBtnText: { fontFamily: F.display, fontSize: 14, color: C.text },

  // Import preview
  previewCount: { fontFamily: F.body, fontSize: 12, color: C.sub, marginHorizontal: SIZE.padding, marginBottom: 8 },
  importRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: SIZE.padding,
    paddingVertical: 10, gap: 10,
  },
  importRowDup: { opacity: 0.4 },
  importRowInfo: { flex: 1 },
  importRowDesc: { fontFamily: F.body, fontSize: 13, color: C.text },
  importRowDate: { fontFamily: F.body, fontSize: 11, color: C.sub, marginTop: 1 },
  importRowVal: { fontFamily: F.mono, fontSize: 13, color: C.text },
  dupBadge: { backgroundColor: C.yellow + '33', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 4 },
  dupBadgeText: { fontFamily: F.display, fontSize: 9, color: C.yellow },
  importFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SIZE.padding, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: C.border,
  },
  importBackBtn: { paddingVertical: 10, paddingHorizontal: 12 },
  importBackText: { fontFamily: F.body, fontSize: 13, color: C.sub },
  importConfirmBtn: { backgroundColor: C.accent, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10 },
  importConfirmText: { fontFamily: F.display, fontSize: 13, color: C.text },
});
