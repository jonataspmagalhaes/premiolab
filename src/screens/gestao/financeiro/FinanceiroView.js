// ═══════════════════════════════════════════════════════════
// FinanceiroView — Tab "Financeiro" unificada (Caixa + Finanças)
// Compõe sub-componentes em ScrollView única
// ═══════════════════════════════════════════════════════════

import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { C, F, SIZE } from '../../../theme';
import { useAuth } from '../../../contexts/AuthContext';
import { useSubscription } from '../../../contexts/SubscriptionContext';
import { Glass, Badge, Pill, SectionLabel, Fab, InfoTip, UpgradePrompt } from '../../../components';
import { SkeletonFinanceiro, EmptyState } from '../../../components/States';
import { usePrivacyStyle } from '../../../components/Sensitive';
import Sensitive from '../../../components/Sensitive';
import {
  getSaldos, getMovimentacoes, getMovimentacoesSummary,
  getCartoes, getFatura, getRegrasPontos,
  getFinancasSummary, getOrcamentos, getRecorrentes,
  getProfile, updateProfile,
} from '../../../services/database';
import { fetchExchangeRates, convertToBRL, getSymbol } from '../../../services/currencyService';
import Toast from 'react-native-toast-message';

// Sub-components
import ContasSection from './ContasSection';
import CartoesSection from './CartoesSection';
import MovimentacoesSection from './MovimentacoesSection';
import BarChart6m from './BarChart6m';
import { DonutChart, ProgressBar } from './DonutChart';

var helpers = require('./helpers');
var fmt = helpers.fmt;
var fmtCompact = helpers.fmtCompact;
var formatDate = helpers.formatDate;
var calcPontos = helpers.calcPontos;
var getCurrentFaturaMesAno = helpers.getCurrentFaturaMesAno;
var MESES_NOMES = helpers.MESES_NOMES;
var MESES_FULL = helpers.MESES_FULL;
var finCats = helpers.finCats;
var CAT_IONICONS = helpers.CAT_IONICONS;
var CAT_COLORS = helpers.CAT_COLORS;
var CAT_LABELS = helpers.CAT_LABELS;

var PERIODOS = [
  { k: 'M', l: '1M', months: 1 },
  { k: '3M', l: '3M', months: 3 },
  { k: '6M', l: '6M', months: 6 },
  { k: '1A', l: '1A', months: 12 },
];


export default function FinanceiroView(props) {
  var navigation = props.navigation;
  var portfolioId = props.portfolioId || null;
  var portfolios = props.portfolios || [];
  var user = useAuth().user;
  var subscription = useSubscription();
  var ps = usePrivacyStyle();
  var scrollRef = useRef(null);

  // ── Caixa state ──
  var _saldos = useState([]); var saldos = _saldos[0]; var setSaldos = _saldos[1];
  var _movs = useState([]); var movs = _movs[0]; var setMovs = _movs[1];
  var _allSummaries = useState([]); var allSummaries = _allSummaries[0]; var setAllSummaries = _allSummaries[1];
  var _rates = useState({ BRL: 1 }); var rates = _rates[0]; var setRates = _rates[1];
  var _cartoes = useState([]); var cartoes = _cartoes[0]; var setCartoes = _cartoes[1];
  var _faturasTotais = useState({}); var faturasTotais = _faturasTotais[0]; var setFaturasTotais = _faturasTotais[1];
  var _faturasStatus = useState({}); var faturasStatus = _faturasStatus[0]; var setFaturasStatus = _faturasStatus[1];
  var _cardPontos = useState({}); var cardPontos = _cardPontos[0]; var setCardPontos = _cardPontos[1];
  var _periodo = useState('M'); var periodo = _periodo[0]; var setPeriodo = _periodo[1];
  var _selectedMonth = useState(null); var selectedMonth = _selectedMonth[0]; var setSelectedMonth = _selectedMonth[1];

  // ── Finanças state ──
  var _mesAtual = useState(new Date().getMonth()); var mesAtual = _mesAtual[0]; var setMesAtual = _mesAtual[1];
  var _anoAtual = useState(new Date().getFullYear()); var anoAtual = _anoAtual[0]; var setAnoAtual = _anoAtual[1];
  var _summary = useState(null); var summary = _summary[0]; var setSummary = _summary[1];
  var _summaryAnterior = useState(null); var summaryAnterior = _summaryAnterior[0]; var setSummaryAnterior = _summaryAnterior[1];
  var _orcamentos = useState([]); var orcamentos = _orcamentos[0]; var setOrcamentos = _orcamentos[1];
  var _recorrentes = useState([]); var recorrentes = _recorrentes[0]; var setRecorrentes = _recorrentes[1];
  var _selDonut = useState(-1); var selDonut = _selDonut[0]; var setSelDonut = _selDonut[1];
  var _drillMovs = useState([]); var drillMovs = _drillMovs[0]; var setDrillMovs = _drillMovs[1];
  var _fxRates = useState(null); var fxRates = _fxRates[0]; var setFxRates = _fxRates[1];

  // ── Cartão principal ──
  var _cartaoPrincipal = useState(null); var cartaoPrincipal = _cartaoPrincipal[0]; var setCartaoPrincipal = _cartaoPrincipal[1];

  // ── Shared state ──
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _refreshing = useState(false); var refreshing = _refreshing[0]; var setRefreshing = _refreshing[1];
  var _loadError = useState(false); var loadError = _loadError[0]; var setLoadError = _loadError[1];

  // ── Combined data loading ──
  var load = async function(mes, ano) {
    if (!user) return;
    setLoadError(false);
    var now = new Date();
    var mesAtualVal = now.getMonth() + 1;
    var anoAtualVal = now.getFullYear();

    // Caixa: 12-month summaries
    var histPromises = [];
    var histLabels = [];
    var histMonths = [];
    for (var hi = 11; hi >= 0; hi--) {
      var hd = new Date(anoAtualVal, mesAtualVal - 1 - hi, 1);
      var hm = hd.getMonth() + 1;
      var hy = hd.getFullYear();
      histPromises.push(getMovimentacoesSummary(user.id, hm, hy));
      histLabels.push(MESES_NOMES[hm - 1]);
      histMonths.push({ mes: hm, ano: hy });
    }

    // Finanças: current + prev month summary
    var mesParam = (mes != null ? mes : mesAtual) + 1;
    var anoParam = ano != null ? ano : anoAtual;
    var prevMes = mesParam - 1;
    var prevAno = anoParam;
    if (prevMes < 1) { prevMes = 12; prevAno = prevAno - 1; }

    try {
      var results = await Promise.all([
        getSaldos(user.id),
        getMovimentacoes(user.id, { limit: 100 }),
        getFinancasSummary(user.id, mesParam, anoParam),
        getFinancasSummary(user.id, prevMes, prevAno),
        getOrcamentos(user.id),
        getRecorrentes(user.id),
      ].concat(histPromises));

      // Caixa data
      var saldosArr = results[0].data || [];
      setSaldos(saldosArr);
      setMovs(results[1].data || []);

      // Finanças data
      setSummary(results[2]);
      setSummaryAnterior(results[3]);
      var orcData = results[4].data || [];
      setOrcamentos(orcData);
      setRecorrentes(results[5].data || []);

      // Build 12-month summaries
      var summaries = [];
      for (var hj = 0; hj < 12; hj++) {
        var hSummary = results[6 + hj];
        summaries.push({
          label: histLabels[hj],
          mes: histMonths[hj].mes,
          ano: histMonths[hj].ano,
          entradas: hSummary.totalEntradas,
          saidas: hSummary.totalSaidas,
          saldo: hSummary.saldo,
          porCategoria: hSummary.porCategoria,
          movs: hSummary.movs || [],
        });
      }
      setAllSummaries(summaries);

      // Fetch exchange rates for foreign currencies
      var moedasEstrangeiras = [];
      for (var mi = 0; mi < saldosArr.length; mi++) {
        var moedaItem = saldosArr[mi].moeda || 'BRL';
        if (moedaItem !== 'BRL' && moedasEstrangeiras.indexOf(moedaItem) === -1) moedasEstrangeiras.push(moedaItem);
      }
      var newRates = { BRL: 1 };
      if (moedasEstrangeiras.length > 0) {
        try { newRates = await fetchExchangeRates(moedasEstrangeiras); } catch (e) { /* fallback */ }
      }
      setRates(newRates);

      // Fetch FX for budgets
      var needFx = false;
      for (var fi = 0; fi < orcData.length; fi++) {
        if (orcData[fi].moeda && orcData[fi].moeda !== 'BRL') { needFx = true; break; }
      }
      if (needFx) {
        fetchExchangeRates(['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'QAR', 'ARS']).then(function(r) { setFxRates(r); }).catch(function() {});
      }

      // Fetch cartão principal
      getProfile(user.id).then(function(profRes) {
        if (profRes.data && profRes.data.cartao_principal) {
          setCartaoPrincipal(profRes.data.cartao_principal);
        }
      }).catch(function() {});

      // Fetch cartões
      getCartoes(user.id, portfolioId).then(function(res) {
        if (res.data) {
          setCartoes(res.data);
          var totais = {};
          var statusMap = {};
          var pontosMap = {};
          var promises = [];
          for (var ci = 0; ci < res.data.length; ci++) {
            (function(card) {
              // Sempre buscar ciclo aberto (sem diaVenc para manter compatibilidade)
              var faturaMesAnoAberto = getCurrentFaturaMesAno(card.dia_fechamento || 1);
              // Ciclo fechado (anterior)
              var prevMes = faturaMesAnoAberto.mes === 1 ? 12 : faturaMesAnoAberto.mes - 1;
              var prevAno = faturaMesAnoAberto.mes === 1 ? faturaMesAnoAberto.ano - 1 : faturaMesAnoAberto.ano;

              var p = getFatura(user.id, card.id, faturaMesAnoAberto.mes, faturaMesAnoAberto.ano).then(function(fResAberta) {
                // Sempre verificar fatura fechada para ver se precisa pagar
                return getFatura(user.id, card.id, prevMes, prevAno).then(function(fResFechada) {
                  var fdFechada = fResFechada && !fResFechada.error ? fResFechada.data : null;
                  var fechadaPaga = fdFechada && fdFechada.pago && fdFechada.pagamentoTotal >= fdFechada.total;

                  if (fdFechada && fdFechada.total > 0 && !fechadaPaga) {
                    // Fatura fechada nao paga — mostrar ela
                    totais[card.id] = fdFechada.total || 0;
                    if (fdFechada.pago) {
                      statusMap[card.id] = 'parcial';
                    } else {
                      statusMap[card.id] = 'fechada';
                    }
                    return { data: fResAberta && !fResAberta.error ? fResAberta.data : null };
                  } else {
                    // Fatura fechada paga ou zerada — mostrar fatura aberta
                    var fdAberta = fResAberta && !fResAberta.error ? fResAberta.data : null;
                    totais[card.id] = (fdAberta && fdAberta.total) || 0;
                    statusMap[card.id] = 'aberta';
                    return { data: fdAberta };
                  }
                });
              }).then(function(result) {
                var fData = result && result.data;
                if (card.tipo_beneficio && fData && fData.movs) {
                  return getRegrasPontos(card.id).then(function(rRes) {
                    var regras = (rRes && rRes.data) || [];
                    if (regras.length > 0) {
                      var regraMoedas = [];
                      for (var ri = 0; ri < regras.length; ri++) {
                        if (regras[ri].moeda && regras[ri].moeda !== 'BRL' && regraMoedas.indexOf(regras[ri].moeda) === -1) regraMoedas.push(regras[ri].moeda);
                      }
                      if (regraMoedas.length > 0) {
                        return fetchExchangeRates(regraMoedas).then(function(rRates) {
                          pontosMap[card.id] = calcPontos(fData.movs, regras, card.tipo_beneficio, card.moeda || 'BRL', rRates);
                        }).catch(function() {
                          pontosMap[card.id] = calcPontos(fData.movs, regras, card.tipo_beneficio, card.moeda || 'BRL', {});
                        });
                      }
                      pontosMap[card.id] = calcPontos(fData.movs, regras, card.tipo_beneficio, card.moeda || 'BRL', {});
                    }
                  });
                }
              });
              promises.push(p);
            })(res.data[ci]);
          }
          Promise.all(promises).then(function() { setFaturasTotais(totais); setFaturasStatus(statusMap); setCardPontos(pontosMap); });
        }
      });
    } catch (e) {
      console.warn('FinanceiroView load error:', e);
      setLoadError(true);
    }
    setLoading(false);
  };

  var _lastPortfolio = useState(portfolioId); var lastPortfolio = _lastPortfolio[0]; var setLastPortfolio = _lastPortfolio[1];

  useFocusEffect(useCallback(function() {
    var portfolioChanged = portfolioId !== lastPortfolio;
    if (!saldos.length || portfolioChanged) {
      setLoading(true);
      if (portfolioChanged) setLastPortfolio(portfolioId);
    }
    load(mesAtual, anoAtual);
  }, [user, portfolioId, mesAtual, anoAtual]));

  var onRefresh = async function() {
    setRefreshing(true);
    await load(mesAtual, anoAtual);
    setRefreshing(false);
  };

  // ── Month navigation (Finanças) ──
  function goToPrevMonth() {
    var newMes = mesAtual - 1;
    var newAno = anoAtual;
    if (newMes < 0) { newMes = 11; newAno = newAno - 1; }
    setMesAtual(newMes);
    setAnoAtual(newAno);
    setSelDonut(-1);
    setDrillMovs([]);
  }
  function goToNextMonth() {
    var now = new Date();
    if (anoAtual > now.getFullYear() || (anoAtual === now.getFullYear() && mesAtual >= now.getMonth())) return;
    var newMes = mesAtual + 1;
    var newAno = anoAtual;
    if (newMes > 11) { newMes = 0; newAno = newAno + 1; }
    setMesAtual(newMes);
    setAnoAtual(newAno);
    setSelDonut(-1);
    setDrillMovs([]);
  }
  var canGoNext = (function() {
    var now = new Date();
    return anoAtual < now.getFullYear() || (anoAtual === now.getFullYear() && mesAtual < now.getMonth());
  })();

  // ── Derived: Caixa ──
  var periodoMonths = 1;
  for (var pi = 0; pi < PERIODOS.length; pi++) { if (PERIODOS[pi].k === periodo) { periodoMonths = PERIODOS[pi].months; break; } }
  var filteredSummaries = allSummaries.slice(12 - periodoMonths);
  var periodoEntradas = 0;
  var periodoSaidas = 0;
  for (var fsi = 0; fsi < filteredSummaries.length; fsi++) {
    periodoEntradas += filteredSummaries[fsi].entradas;
    periodoSaidas += filteredSummaries[fsi].saidas;
  }
  var periodoSaldo = periodoEntradas - periodoSaidas;
  var prevSummaries = allSummaries.slice(Math.max(0, 12 - periodoMonths * 2), 12 - periodoMonths);
  var prevSaldo = 0;
  for (var pvi = 0; pvi < prevSummaries.length; pvi++) prevSaldo += prevSummaries[pvi].entradas - prevSummaries[pvi].saidas;
  var hist6m = allSummaries.slice(6);

  // Saldo total BRL + por moeda
  var totalSaldos = 0;
  var totalPorMoeda = {};
  for (var si = 0; si < saldos.length; si++) {
    var sMoeda = saldos[si].moeda || 'BRL';
    var sOriginal = saldos[si].saldo || 0;
    totalSaldos += convertToBRL(sOriginal, sMoeda, rates);
    if (!totalPorMoeda[sMoeda]) totalPorMoeda[sMoeda] = 0;
    totalPorMoeda[sMoeda] += sOriginal;
  }
  var moedasList = Object.keys(totalPorMoeda).sort(function(a, b) { if (a === 'BRL') return -1; if (b === 'BRL') return 1; return a < b ? -1 : 1; });
  var temMultiMoeda = moedasList.length > 1;

  // Sort saldos/cartoes by portfolio
  if (!portfolioId && portfolios.length > 0) {
    saldos.sort(function(a, b) { var pa = a.portfolio_id || ''; var pb = b.portfolio_id || ''; if (pa === pb) return 0; if (!pa) return -1; if (!pb) return 1; return pa < pb ? -1 : 1; });
    cartoes.sort(function(a, b) { var pa = a.portfolio_id || ''; var pb = b.portfolio_id || ''; if (pa === pb) return 0; if (!pa) return -1; if (!pb) return 1; return pa < pb ? -1 : 1; });
  }

  // ── Derived: Finanças ──
  var canFinancas = subscription.canAccess('FINANCES');
  var totalEntradasPessoais = summary ? summary.totalEntradasPessoais : 0;
  var totalSaidasPessoais = summary ? summary.totalSaidasPessoais : 0;
  var saldoPessoal = summary ? summary.saldoPessoal : 0;
  var porGrupo = summary ? summary.porGrupo : {};
  var porGrupoEntrada = summary ? summary.porGrupoEntrada : {};
  var porSubcategoria = summary ? summary.porSubcategoria : {};
  var porMeioPagamento = summary ? (summary.porMeioPagamento || {}) : {};
  var movsPessoais = summary ? summary.movsPessoais : [];
  var savingsRate = totalEntradasPessoais > 0 ? (saldoPessoal / totalEntradasPessoais * 100) : 0;
  var prevSaidasF = summaryAnterior ? summaryAnterior.totalSaidasPessoais : 0;
  var prevSaldoF = summaryAnterior ? summaryAnterior.saldoPessoal : 0;
  var saldoChange = prevSaldoF !== 0 ? ((saldoPessoal - prevSaldoF) / Math.abs(prevSaldoF) * 100) : 0;

  // Income rows
  var incomeRows = [];
  var incomeKeys = Object.keys(porGrupoEntrada);
  for (var ik = 0; ik < incomeKeys.length; ik++) {
    var iVal = porGrupoEntrada[incomeKeys[ik]];
    if (iVal <= 0) continue;
    var iMeta = finCats.getGrupoMeta(incomeKeys[ik]);
    incomeRows.push({ k: incomeKeys[ik], label: iMeta.label, icon: iMeta.icon, color: iMeta.color, value: iVal });
  }
  incomeRows.sort(function(a, b) { return b.value - a.value; });

  // Donut segments
  var donutSegments = [];
  var totalGastos = 0;
  var grupoKeys = Object.keys(porGrupo);
  var sortedGrupos = [];
  for (var gi = 0; gi < grupoKeys.length; gi++) {
    if (grupoKeys[gi] === 'investimento' || porGrupo[grupoKeys[gi]] <= 0) continue;
    totalGastos += porGrupo[grupoKeys[gi]];
    sortedGrupos.push({ k: grupoKeys[gi], v: porGrupo[grupoKeys[gi]] });
  }
  sortedGrupos.sort(function(a, b) { return b.v - a.v; });
  for (var di = 0; di < sortedGrupos.length; di++) {
    var meta = finCats.getGrupoMeta(sortedGrupos[di].k);
    donutSegments.push({ label: meta.label, pct: totalGastos > 0 ? (sortedGrupos[di].v / totalGastos * 100) : 0, color: meta.color, value: sortedGrupos[di].v, grupo: sortedGrupos[di].k, icon: meta.icon });
  }

  function handleDonutSelect(idx) {
    setSelDonut(idx);
    if (idx < 0 || idx >= donutSegments.length) { setDrillMovs([]); return; }
    var grupo = donutSegments[idx].grupo;
    var filtered = [];
    for (var fi = 0; fi < movsPessoais.length; fi++) {
      var mGrupo = finCats.getGrupo(movsPessoais[fi].categoria, movsPessoais[fi].subcategoria);
      if (mGrupo === grupo && filtered.length < 5) filtered.push(movsPessoais[fi]);
    }
    setDrillMovs(filtered);
  }

  var selectedGrupoSubs = [];
  if (selDonut >= 0 && selDonut < donutSegments.length) {
    var selGrupo = donutSegments[selDonut].grupo;
    var subKeys = Object.keys(porSubcategoria);
    for (var ski = 0; ski < subKeys.length; ski++) {
      var subMeta = finCats.SUBCATEGORIAS[subKeys[ski]];
      if (subMeta && subMeta.grupo === selGrupo && porSubcategoria[subKeys[ski]] > 0) {
        selectedGrupoSubs.push({ k: subKeys[ski], label: subMeta.l, icon: subMeta.icon, color: subMeta.color, value: porSubcategoria[subKeys[ski]] });
      }
    }
    selectedGrupoSubs.sort(function(a, b) { return b.value - a.value; });
  }

  // Budget items
  var budgetItems = [];
  for (var bi = 0; bi < orcamentos.length; bi++) {
    var orc = orcamentos[bi];
    if (!orc.ativo) continue;
    var orcMoeda = orc.moeda || 'BRL';
    var spentRaw = porGrupo[orc.grupo] || 0;
    var limitRaw = orc.valor_limite || 0;
    var limitBRL = limitRaw;
    if (orcMoeda !== 'BRL' && fxRates && fxRates[orcMoeda]) limitBRL = limitRaw * fxRates[orcMoeda];
    var pct = limitBRL > 0 ? (spentRaw / limitBRL * 100) : 0;
    var bMeta = finCats.getGrupoMeta(orc.grupo);
    budgetItems.push({ grupo: orc.grupo, label: bMeta.label, icon: bMeta.icon, color: bMeta.color, spent: spentRaw, limit: limitRaw, limitBRL: limitBRL, moeda: orcMoeda, symbol: getSymbol(orcMoeda), pct: pct, remaining: limitBRL - spentRaw });
  }

  // Comparison rows
  var comparisonRows = [];
  var prevPorGrupo = summaryAnterior ? summaryAnterior.porGrupo : {};
  var allGrupoKeys = {};
  var pgKeys = Object.keys(porGrupo);
  for (var pgi = 0; pgi < pgKeys.length; pgi++) { if (pgKeys[pgi] !== 'investimento' && pgKeys[pgi] !== 'outro') allGrupoKeys[pgKeys[pgi]] = true; }
  var ppgKeys = Object.keys(prevPorGrupo);
  for (var ppgi = 0; ppgi < ppgKeys.length; ppgi++) { if (ppgKeys[ppgi] !== 'investimento' && ppgKeys[ppgi] !== 'outro') allGrupoKeys[ppgKeys[ppgi]] = true; }
  var compKeys = Object.keys(allGrupoKeys);
  var compTotal = 0;
  var prevCompTotal = 0;
  for (var ci = 0; ci < compKeys.length; ci++) {
    var curVal = porGrupo[compKeys[ci]] || 0;
    var prevVal = prevPorGrupo[compKeys[ci]] || 0;
    if (curVal === 0 && prevVal === 0) continue;
    var chg = prevVal > 0 ? ((curVal - prevVal) / prevVal * 100) : (curVal > 0 ? 100 : 0);
    var cMeta = finCats.getGrupoMeta(compKeys[ci]);
    comparisonRows.push({ grupo: compKeys[ci], label: cMeta.label, icon: cMeta.icon, color: cMeta.color, current: curVal, previous: prevVal, change: chg });
    compTotal += curVal;
    prevCompTotal += prevVal;
  }
  comparisonRows.sort(function(a, b) { return b.current - a.current; });

  // Upcoming recurring
  var upcomingRec = [];
  var today = new Date();
  var todayStr2 = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  for (var ri = 0; ri < recorrentes.length; ri++) {
    var rec = recorrentes[ri];
    if (!rec.ativo) continue;
    var proxVenc = rec.proximo_vencimento;
    if (!proxVenc) continue;
    var vencDate = new Date(proxVenc + 'T00:00:00');
    var daysUntil = Math.ceil((vencDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil < -30) continue;
    upcomingRec.push({ id: rec.id, tipo: rec.tipo, categoria: rec.categoria, subcategoria: rec.subcategoria, descricao: rec.descricao, valor: rec.valor, frequencia: rec.frequencia, proximo_vencimento: proxVenc, daysUntil: daysUntil });
  }
  upcomingRec.sort(function(a, b) { return a.daysUntil - b.daysUntil; });

  // Futuras movimentações
  var movsFuture = movs.filter(function(m) { return (m.data || '').substring(0, 10) > new Date().toISOString().substring(0, 10); });
  movsFuture.sort(function(a, b) { var da = (a.data || '').substring(0, 10); var db = (b.data || '').substring(0, 10); return da < db ? -1 : da > db ? 1 : 0; });

  // Merge próximos: recorrentes + futuras
  var proximosItems = [];
  for (var ui = 0; ui < upcomingRec.length; ui++) {
    var u = upcomingRec[ui];
    proximosItems.push({ type: 'rec', id: 'rec-' + u.id, tipo: u.tipo, categoria: u.categoria, subcategoria: u.subcategoria, descricao: u.descricao, valor: u.valor, daysUntil: u.daysUntil, proximo_vencimento: u.proximo_vencimento });
  }
  for (var mfi = 0; mfi < movsFuture.length; mfi++) {
    var mf = movsFuture[mfi];
    var mfDate = new Date(((mf.data || '').substring(0, 10)) + 'T00:00:00');
    var mfDays = Math.ceil((mfDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    proximosItems.push({ type: 'mov', id: 'mov-' + (mf.id || mfi), tipo: mf.tipo, categoria: mf.categoria, subcategoria: mf.subcategoria, descricao: mf.descricao, valor: mf.valor, daysUntil: mfDays, data: mf.data });
  }
  proximosItems.sort(function(a, b) { return a.daysUntil - b.daysUntil; });
  var proximosSlice = proximosItems.slice(0, 8);

  // Mapa moeda para movimentações
  var contaMoedaMap = {};
  for (var cmi2 = 0; cmi2 < saldos.length; cmi2++) {
    var cmn = (saldos[cmi2].corretora || saldos[cmi2].name || '').toUpperCase().trim();
    if (cmn) contaMoedaMap[cmn] = saldos[cmi2].moeda || 'BRL';
  }
  function getMovMoeda(mov) { return contaMoedaMap[(mov.conta || '').toUpperCase().trim()] || 'BRL'; }

  // ── Loading / Error ──
  if (loading) return <View style={styles.container}><SkeletonFinanceiro /></View>;
  if (loadError) return (
    <View style={styles.container}>
      <EmptyState ionicon="alert-circle-outline" title="Erro ao carregar" description="Não foi possível carregar os dados. Verifique sua conexão." cta="Tentar novamente" onCta={function() { setLoading(true); load(mesAtual, anoAtual); }} color={C.red} />
    </View>
  );

  // ── RENDER ──
  return (
    <View style={{ flex: 1 }}>
      <ScrollView ref={scrollRef} style={styles.container} contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}>

        {/* ══════ 1. HERO UNIFICADO ══════ */}
        <Glass glow={C.green} padding={16}>
          <Text style={styles.heroLabel}>SALDO TOTAL</Text>
          <Text style={[styles.heroValue, ps]}>R$ {fmt(totalSaldos)}</Text>

          {temMultiMoeda ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {moedasList.map(function(moeda) {
                var simb = getSymbol(moeda);
                var val = totalPorMoeda[moeda];
                var cor = moeda === 'BRL' ? C.green : C.etfs;
                return (
                  <View key={moeda} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: cor + '12', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                    <Text style={{ fontSize: 10, fontFamily: F.display, color: cor }}>{moeda}</Text>
                    <Text style={[{ fontSize: 11, fontFamily: F.mono, color: C.text }, ps]}>{simb} {fmt(val)}</Text>
                    {moeda !== 'BRL' ? <Text style={[{ fontSize: 9, fontFamily: F.mono, color: C.dim }, ps]}>{'≈ R$ ' + fmt(convertToBRL(val, moeda, rates))}</Text> : null}
                  </View>
                );
              })}
            </View>
          ) : null}

          {saldos.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 10 }}>
              {saldos.map(function(s, i) {
                var bc = [C.opcoes, C.acoes, C.fiis, C.etfs, C.rf, C.accent][i % 6];
                var sName = s.corretora || s.name || '';
                var contaMoeda = s.moeda || 'BRL';
                return (
                  <View key={s.id || i} style={[styles.chipConta, { borderColor: bc + '30' }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={[styles.chipName, { color: bc }]}>{sName}</Text>
                      <Badge text={contaMoeda} color={contaMoeda === 'BRL' ? C.green : C.etfs} />
                    </View>
                    <Text style={[styles.chipVal, ps]}>{getSymbol(contaMoeda)} {fmt(s.saldo || 0)}</Text>
                  </View>
                );
              })}
            </ScrollView>
          ) : null}

          {/* Nav mensal (Finanças) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 14 }}>
            <TouchableOpacity onPress={goToPrevMonth} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="chevron-back" size={20} color={C.text} />
            </TouchableOpacity>
            <Text style={{ fontSize: 14, fontFamily: F.display, color: C.text, minWidth: 140, textAlign: 'center' }}>
              {MESES_FULL[mesAtual] + ' ' + anoAtual}
            </Text>
            <TouchableOpacity onPress={goToNextMonth} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ opacity: canGoNext ? 1 : 0.3 }}>
              <Ionicons name="chevron-forward" size={20} color={canGoNext ? C.text : C.dim} />
            </TouchableOpacity>
          </View>

          {/* KPIs */}
          <View style={{ flexDirection: 'row', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.kpiLabel}>Entradas</Text>
              <Text style={[styles.kpiVal, { color: C.green }, ps]}>+R$ {fmt(canFinancas ? totalEntradasPessoais : periodoEntradas)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.kpiLabel}>Saídas</Text>
              <Text style={[styles.kpiVal, { color: C.red }, ps]}>-R$ {fmt(canFinancas ? totalSaidasPessoais : periodoSaidas)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.kpiLabel}>Saldo</Text>
              <Text style={[styles.kpiVal, { color: (canFinancas ? saldoPessoal : periodoSaldo) >= 0 ? C.green : C.red }, ps]}>
                {(canFinancas ? saldoPessoal : periodoSaldo) >= 0 ? '+' : '-'}R$ {fmt(Math.abs(canFinancas ? saldoPessoal : periodoSaldo))}
              </Text>
            </View>
          </View>

          {/* Savings rate + comparison */}
          {canFinancas && savingsRate > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 }}>
              <Badge text={savingsRate.toFixed(0) + '% poupado'} color={C.green} />
              {summaryAnterior && prevSaldoF !== 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name={saldoChange >= 0 ? 'arrow-up' : 'arrow-down'} size={12} color={saldoChange >= 0 ? C.green : C.red} />
                  <Text style={{ fontSize: 10, fontFamily: F.mono, color: saldoChange >= 0 ? C.green : C.red }}>
                    {(saldoChange >= 0 ? '+' : '') + saldoChange.toFixed(1) + '% vs anterior'}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </Glass>

        {/* ══════ 2. CONTAS ══════ */}
        <ContasSection saldos={saldos} rates={rates} portfolioId={portfolioId} portfolios={portfolios} navigation={navigation} user={user} onReload={function() { load(mesAtual, anoAtual); }} scrollRef={scrollRef} />

        {/* ══════ 3. CARTÕES ══════ */}
        <CartoesSection cartoes={cartoes} faturasTotais={faturasTotais} faturasStatus={faturasStatus} cardPontos={cardPontos} portfolioId={portfolioId} portfolios={portfolios} navigation={navigation} user={user} onReload={function() { load(mesAtual, anoAtual); }} cartaoPrincipal={cartaoPrincipal} onSetPrincipal={function(cardId) {
          setCartaoPrincipal(cardId);
          updateProfile(user.id, { cartao_principal: cardId }).then(function(r) {
            if (r && r.error) {
              Toast.show({ type: 'error', text1: 'Erro ao salvar' });
            } else {
              Toast.show({ type: 'success', text1: cardId ? 'Cartão principal definido' : 'Cartão principal removido', visibilityTime: 1500 });
            }
          }).catch(function() {});
        }} />

        {/* ══════ 4. RECEITAS (Premium) ══════ */}
        {canFinancas && incomeRows.length > 0 ? (
          <View>
            <SectionLabel>RECEITAS</SectionLabel>
            <Glass padding={14}>
              {incomeRows.map(function(row, ri) {
                var pctI = totalEntradasPessoais > 0 ? (row.value / totalEntradasPessoais * 100) : 0;
                return (
                  <View key={row.k} style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }, ri > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: row.color + '18', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={row.icon} size={14} color={row.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontFamily: F.body, color: C.text }}>{row.label}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.06)' }}>
                          <View style={{ width: Math.min(pctI, 100) + '%', height: 4, borderRadius: 2, backgroundColor: row.color + '80' }} />
                        </View>
                        <Text style={{ fontSize: 10, fontFamily: F.mono, color: C.dim, minWidth: 36, textAlign: 'right' }}>{pctI.toFixed(0) + '%'}</Text>
                      </View>
                    </View>
                    <Text style={[{ fontSize: 13, fontFamily: F.mono, fontWeight: '700', color: C.green }, ps]}>R$ {fmt(row.value)}</Text>
                  </View>
                );
              })}
            </Glass>
          </View>
        ) : null}

        {/* ══════ 5. DESPESAS DONUT (Premium) ══════ */}
        {canFinancas && donutSegments.length > 0 ? (
          <View>
            <SectionLabel>DESPESAS POR CATEGORIA</SectionLabel>
            <Glass>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Sensitive><DonutChart segments={donutSegments} size={140} selected={selDonut} onSelect={handleDonutSelect} /></Sensitive>
                <View style={{ flex: 1, marginLeft: 16 }}>
                  <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.display, letterSpacing: 0.5, marginBottom: 2 }}>TOTAL GASTOS</Text>
                  <Text style={[{ fontSize: 18, fontFamily: F.mono, fontWeight: '700', color: C.red }, ps]}>R$ {fmt(totalGastos)}</Text>
                  {selDonut >= 0 && selDonut < donutSegments.length ? (
                    <View style={{ marginTop: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name={donutSegments[selDonut].icon} size={14} color={donutSegments[selDonut].color} />
                        <Text style={{ fontSize: 12, fontFamily: F.display, color: donutSegments[selDonut].color }}>{donutSegments[selDonut].label}</Text>
                      </View>
                      <Text style={[{ fontSize: 14, fontFamily: F.mono, fontWeight: '600', color: C.text, marginTop: 2 }, ps]}>R$ {fmt(donutSegments[selDonut].value)}</Text>
                      <Text style={{ fontSize: 10, fontFamily: F.mono, color: C.dim }}>{donutSegments[selDonut].pct.toFixed(1) + '%'}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <View style={{ marginTop: 12, gap: 4 }}>
                {donutSegments.map(function(seg, i) {
                  var isActive = selDonut === i;
                  return (
                    <TouchableOpacity key={seg.grupo} onPress={function() { handleDonutSelect(i === selDonut ? -1 : i); }} activeOpacity={0.7}
                      style={[{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 4 }, isActive && { backgroundColor: seg.color + '10', borderRadius: 6 }]}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: seg.color, opacity: selDonut === -1 || isActive ? 1 : 0.3 }} />
                      <Ionicons name={seg.icon} size={12} color={isActive ? seg.color : C.dim} />
                      <Text style={{ flex: 1, fontSize: 11, fontFamily: F.body, color: isActive ? C.text : C.sub }} numberOfLines={1}>{seg.label}</Text>
                      <Text style={{ fontSize: 10, fontFamily: F.mono, color: isActive ? seg.color : C.dim, marginRight: 6 }}>{seg.pct.toFixed(1) + '%'}</Text>
                      <Text style={[{ fontSize: 10, fontFamily: F.mono, color: isActive ? C.text : C.dim, width: 70, textAlign: 'right' }, ps]}>R$ {fmt(seg.value)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {selDonut >= 0 && selDonut < donutSegments.length ? (
                <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10 }}>
                  {selectedGrupoSubs.length > 0 ? (
                    <View style={{ gap: 4, marginBottom: 8 }}>
                      <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.display, letterSpacing: 0.5, marginBottom: 4 }}>SUBCATEGORIAS</Text>
                      {selectedGrupoSubs.map(function(sub) {
                        return (
                          <View key={sub.k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 }}>
                            <Ionicons name={sub.icon} size={12} color={sub.color} />
                            <Text style={{ flex: 1, fontSize: 11, fontFamily: F.body, color: C.sub }} numberOfLines={1}>{sub.label}</Text>
                            <Text style={[{ fontSize: 10, fontFamily: F.mono, color: C.text }, ps]}>R$ {fmt(sub.value)}</Text>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                  {drillMovs.length > 0 ? (
                    <View style={{ gap: 4 }}>
                      <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.display, letterSpacing: 0.5, marginBottom: 4 }}>ÚLTIMAS TRANSAÇÕES</Text>
                      {drillMovs.map(function(m, mi) {
                        var isEntrada = m.tipo === 'entrada';
                        var movColor = isEntrada ? C.green : C.red;
                        var movIcon = finCats.getCatIcon(m.categoria, m.subcategoria);
                        var movLabel = m.descricao || finCats.getCatLabel(m.categoria) || '';
                        return (
                          <View key={m.id || mi} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 9, fontFamily: F.mono, color: C.dim, width: 36 }}>{formatDate(m.data)}</Text>
                            <Ionicons name={movIcon} size={12} color={movColor} />
                            <Text style={{ flex: 1, fontSize: 10, fontFamily: F.body, color: C.sub }} numberOfLines={1}>{movLabel}</Text>
                            <Text style={[{ fontSize: 10, fontFamily: F.mono, fontWeight: '600', color: movColor }, ps]}>{isEntrada ? '+' : '-'}R$ {fmt(m.valor)}</Text>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </Glass>
          </View>
        ) : null}

        {/* ══════ 6. MEIO DE PAGAMENTO (Premium) ══════ */}
        {canFinancas && totalSaidasPessoais > 0 ? (
          <View>
            <SectionLabel>MEIO DE PAGAMENTO</SectionLabel>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
              {(function() {
                var pixVal = porMeioPagamento['pix'] || 0;
                var creditoVal = porMeioPagamento['credito'] || 0;
                var outrosVal = totalSaidasPessoais - pixVal - creditoVal;
                if (outrosVal < 0) outrosVal = 0;
                var items = [];
                if (pixVal > 0) items.push({ label: 'PIX', icon: 'flash-outline', color: C.green, value: pixVal });
                if (creditoVal > 0) items.push({ label: 'Cartão', icon: 'card-outline', color: C.accent, value: creditoVal });
                if (outrosVal > 0) items.push({ label: 'Débito', icon: 'swap-vertical-outline', color: C.textSecondary, value: outrosVal });
                return items.map(function(it) {
                  var pctM = totalSaidasPessoais > 0 ? Math.round(it.value / totalSaidasPessoais * 100) : 0;
                  return (
                    <View key={it.label} style={{ flex: 1, alignItems: 'center', backgroundColor: C.cardSolid, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 6 }}>
                      <Ionicons name={it.icon} size={18} color={it.color} />
                      <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, marginTop: 4 }}>{it.label}</Text>
                      <Sensitive><Text style={{ fontSize: 13, fontWeight: '700', color: C.text, fontFamily: F.mono, marginTop: 2 }}>R$ {fmt(it.value)}</Text></Sensitive>
                      <Text style={{ fontSize: 10, color: it.color, fontFamily: F.mono }}>{pctM + '%'}</Text>
                    </View>
                  );
                });
              })()}
            </View>
          </View>
        ) : null}

        {/* ══════ 7. ORÇAMENTOS (Premium) ══════ */}
        {canFinancas ? (
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <SectionLabel>ORÇAMENTOS</SectionLabel>
              <InfoTip text="Acompanhe seus gastos vs limites definidos por categoria." />
            </View>
            {budgetItems.length > 0 ? (
              <Glass style={{ marginTop: 8, gap: 10 }}>
                {budgetItems.map(function(b) {
                  var overBudget = b.remaining < 0;
                  return (
                    <View key={b.grupo}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: b.color + '18', justifyContent: 'center', alignItems: 'center' }}>
                          <Ionicons name={b.icon} size={13} color={b.color} />
                        </View>
                        <Text style={{ flex: 1, fontSize: 12, fontFamily: F.body, color: C.text }} numberOfLines={1}>{b.label}</Text>
                        <Text style={[{ fontSize: 10, fontFamily: F.mono, color: C.dim }, ps]}>R$ {fmt(b.spent)} / {b.symbol} {fmt(b.limit)}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <ProgressBar pct={b.pct} />
                        <Text style={{ fontSize: 10, fontFamily: F.mono, fontWeight: '600', color: overBudget ? C.red : C.green, width: 70, textAlign: 'right' }}>
                          {overBudget ? '-R$ ' + fmt(Math.abs(b.remaining)) : 'R$ ' + fmt(b.remaining)}
                        </Text>
                      </View>
                    </View>
                  );
                })}
                <TouchableOpacity onPress={function() { navigation.navigate('Orcamento'); }} activeOpacity={0.7} style={{ alignSelf: 'center', paddingVertical: 4, marginTop: 4 }}>
                  <Text style={{ fontSize: 11, fontFamily: F.mono, color: C.accent }}>Editar orçamentos →</Text>
                </TouchableOpacity>
              </Glass>
            ) : (
              <Glass style={{ marginTop: 8, padding: SIZE.padding }}>
                <EmptyState ionicon="calculator-outline" title="Sem orçamentos" description="Configure limites de gastos por categoria." cta="Configurar orçamentos" onCta={function() { navigation.navigate('Orcamento'); }} />
              </Glass>
            )}
          </View>
        ) : null}

        {/* ══════ 8. GRÁFICO 6M ══════ */}
        {hist6m.length > 0 ? (
          <View>
            <SectionLabel>ENTRADAS VS SAÍDAS</SectionLabel>
            <Glass padding={14}>
              <BarChart6m data={hist6m} selected={selectedMonth} onSelect={function(idx) { setSelectedMonth(idx); }} />
            </Glass>
            {selectedMonth != null && hist6m[selectedMonth] && hist6m[selectedMonth].movs && hist6m[selectedMonth].movs.length > 0 ? (function() {
              var selMovs = hist6m[selectedMonth].movs;
              var entradas = [];
              var saidas = [];
              for (var dm = 0; dm < selMovs.length; dm++) {
                if (selMovs[dm].tipo === 'entrada') entradas.push(selMovs[dm]);
                else if (selMovs[dm].tipo === 'saida') saidas.push(selMovs[dm]);
              }
              entradas.sort(function(a, b) { return (b.valor || 0) - (a.valor || 0); });
              saidas.sort(function(a, b) { return (b.valor || 0) - (a.valor || 0); });
              function renderMovList(items, color, sign) {
                if (items.length === 0) return <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.body, fontStyle: 'italic', paddingVertical: 4 }}>Nenhuma</Text>;
                return items.map(function(m, mi) {
                  var subcatD = m.subcategoria ? finCats.SUBCATEGORIAS[m.subcategoria] : null;
                  var catLabel = m.descricao || (subcatD ? subcatD.l : (CAT_LABELS[m.categoria] || m.categoria));
                  var mIsPix = m.meio_pagamento === 'pix';
                  var catIcon = mIsPix ? 'flash-outline' : subcatD ? subcatD.icon : (CAT_IONICONS[m.categoria] || 'ellipse-outline');
                  var displayColor = mIsPix ? C.green : subcatD ? subcatD.color : color;
                  return (
                    <View key={m.id || mi} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, borderTopWidth: mi > 0 ? 1 : 0, borderTopColor: C.border }}>
                      <Ionicons name={catIcon} size={14} color={displayColor} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, color: C.text, fontFamily: F.body }} numberOfLines={1}>{m.ticker ? m.ticker + ' · ' : ''}{catLabel}</Text>
                        <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>{m.conta || ''}{m.conta ? ' · ' : ''}{new Date(m.data).toLocaleDateString('pt-BR')}{mIsPix ? ' · PIX' : ''}</Text>
                      </View>
                      <Text style={[{ fontSize: 12, fontWeight: '700', color: displayColor, fontFamily: F.mono }, ps]}>{sign}{getSymbol(getMovMoeda(m))} {fmt(m.valor)}</Text>
                    </View>
                  );
                });
              }
              return (
                <Glass padding={14}>
                  <Text style={{ fontSize: 11, color: C.text, fontFamily: F.mono, fontWeight: '700', marginBottom: 8 }}>{hist6m[selectedMonth].label.toUpperCase() + ' — DETALHAMENTO'}</Text>
                  {entradas.length > 0 ? (
                    <View style={{ marginBottom: saidas.length > 0 ? 12 : 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: C.green }} />
                        <Text style={{ fontSize: 11, color: C.green, fontFamily: F.mono, fontWeight: '700' }}>{'ENTRADAS (' + entradas.length + ')'}</Text>
                      </View>
                      {renderMovList(entradas, C.green, '+')}
                    </View>
                  ) : null}
                  {saidas.length > 0 ? (
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: C.red }} />
                        <Text style={{ fontSize: 11, color: C.red, fontFamily: F.mono, fontWeight: '700' }}>{'SAÍDAS (' + saidas.length + ')'}</Text>
                      </View>
                      {renderMovList(saidas, C.red, '-')}
                    </View>
                  ) : null}
                </Glass>
              );
            })() : null}
          </View>
        ) : null}

        {/* ══════ 9. COMPARATIVO MENSAL (Premium) ══════ */}
        {canFinancas && comparisonRows.length > 0 ? (
          <View>
            <SectionLabel>COMPARATIVO MENSAL</SectionLabel>
            <Glass>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.border }}>
                <Text style={{ flex: 1, fontSize: 9, color: C.dim, fontFamily: F.display, letterSpacing: 0.5 }}>CATEGORIA</Text>
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.display, letterSpacing: 0.5, width: 70, textAlign: 'right' }}>ATUAL</Text>
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.display, letterSpacing: 0.5, width: 30, textAlign: 'center' }}></Text>
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.display, letterSpacing: 0.5, width: 70, textAlign: 'right' }}>ANTERIOR</Text>
              </View>
              {comparisonRows.map(function(row) {
                var increased = row.current > row.previous;
                var decreased = row.current < row.previous;
                return (
                  <View key={row.grupo} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4, gap: 6 }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: row.color + '15', justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name={row.icon} size={11} color={row.color} />
                    </View>
                    <Text style={{ flex: 1, fontSize: 11, fontFamily: F.body, color: C.sub }} numberOfLines={1}>{row.label}</Text>
                    <Text style={[{ fontSize: 10, fontFamily: F.mono, color: C.text, width: 70, textAlign: 'right' }, ps]}>R$ {fmtCompact(row.current)}</Text>
                    <View style={{ width: 30, alignItems: 'center' }}>
                      <Ionicons name={increased ? 'arrow-up' : (decreased ? 'arrow-down' : 'remove-outline')} size={10} color={increased ? C.red : (decreased ? C.green : C.dim)} />
                    </View>
                    <Text style={[{ fontSize: 10, fontFamily: F.mono, color: C.dim, width: 70, textAlign: 'right' }, ps]}>R$ {fmtCompact(row.previous)}</Text>
                  </View>
                );
              })}
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 8, marginTop: 6, borderTopWidth: 1, borderTopColor: C.border, gap: 6 }}>
                <Text style={{ flex: 1, fontSize: 11, fontFamily: F.display, color: C.text }}>Total</Text>
                <Text style={[{ fontSize: 11, fontFamily: F.mono, fontWeight: '700', color: C.red, width: 70, textAlign: 'right' }, ps]}>R$ {fmtCompact(compTotal)}</Text>
                <View style={{ width: 30, alignItems: 'center' }}>
                  {compTotal !== prevCompTotal ? <Ionicons name={compTotal > prevCompTotal ? 'arrow-up' : 'arrow-down'} size={10} color={compTotal > prevCompTotal ? C.red : C.green} /> : null}
                </View>
                <Text style={[{ fontSize: 11, fontFamily: F.mono, fontWeight: '700', color: C.dim, width: 70, textAlign: 'right' }, ps]}>R$ {fmtCompact(prevCompTotal)}</Text>
              </View>
            </Glass>
          </View>
        ) : null}

        {/* ══════ 10. PRÓXIMOS (Merge recorrentes + futuras) ══════ */}
        {proximosSlice.length > 0 ? (
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <SectionLabel>AGENDA FINANCEIRA</SectionLabel>
              <Badge text={String(proximosSlice.length)} color={C.accent} />
            </View>
            <Glass style={{ gap: 6 }}>
              {proximosSlice.map(function(item) {
                var isEntrada = item.tipo === 'entrada';
                var recIcon = finCats.getCatIcon(item.categoria, item.subcategoria);
                var recColor = finCats.getCatColor(item.categoria, item.subcategoria);
                var recLabel = item.descricao || finCats.getCatLabel(item.categoria) || '';
                var valColor = isEntrada ? C.green : C.red;
                var daysBadgeColor = C.green;
                if (item.daysUntil <= 3) daysBadgeColor = C.red;
                else if (item.daysUntil <= 7) daysBadgeColor = C.yellow;
                var daysLabel = '';
                if (item.daysUntil < 0) { daysLabel = Math.abs(item.daysUntil) + 'd atrás'; daysBadgeColor = C.red; }
                else if (item.daysUntil === 0) { daysLabel = 'Hoje'; daysBadgeColor = C.red; }
                else if (item.daysUntil === 1) { daysLabel = 'Amanhã'; }
                else { daysLabel = item.daysUntil + 'd'; }

                return (
                  <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: recColor + '15', justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name={item.type === 'mov' ? 'time-outline' : recIcon} size={14} color={recColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontFamily: F.body, color: C.text }} numberOfLines={1}>{recLabel}</Text>
                      <Text style={{ fontSize: 9, fontFamily: F.body, color: C.dim }}>{item.type === 'rec' ? 'Recorrente' : 'Agendada'}</Text>
                    </View>
                    <Text style={[{ fontSize: 12, fontFamily: F.mono, fontWeight: '600', color: valColor, marginRight: 6 }, ps]}>
                      {isEntrada ? '+' : '-'}R$ {fmt(item.valor)}
                    </Text>
                    <View style={{ backgroundColor: daysBadgeColor + '15', borderRadius: 6, borderWidth: 1, borderColor: daysBadgeColor + '25', paddingHorizontal: 6, paddingVertical: 2, minWidth: 40, alignItems: 'center' }}>
                      <Text style={{ fontSize: 9, fontFamily: F.mono, fontWeight: '700', color: daysBadgeColor }}>{daysLabel}</Text>
                    </View>
                  </View>
                );
              })}
              {proximosItems.length > 8 ? (
                <TouchableOpacity onPress={function() { navigation.navigate('Recorrentes'); }} activeOpacity={0.7} style={{ alignSelf: 'center', paddingVertical: 4, marginTop: 4 }}>
                  <Text style={{ fontSize: 11, fontFamily: F.mono, color: C.accent }}>Ver todas →</Text>
                </TouchableOpacity>
              ) : null}
            </Glass>
          </View>
        ) : null}

        {/* ══════ 11. MOVIMENTAÇÕES ══════ */}
        <MovimentacoesSection movs={movs} saldos={saldos} navigation={navigation} user={user} onReload={function() { load(mesAtual, anoAtual); }} />

        {/* Premium gate for users without FINANCES */}
        {!canFinancas ? (
          <View style={{ marginTop: SIZE.gap }}>
            <UpgradePrompt feature="FINANCES" navigation={navigation} />
          </View>
        ) : null}

        <View style={{ height: SIZE.tabBarHeight + 20 }} />
      </ScrollView>

      {/* ══════ 12. FAB ══════ */}
      <Fab navigation={navigation} />
    </View>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: SIZE.padding, gap: SIZE.gap + 4 },
  heroLabel: { fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 0.6 },
  heroValue: { fontSize: 26, fontWeight: '800', color: C.text, fontFamily: F.display, marginTop: 2, letterSpacing: -0.5 },
  chipConta: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, backgroundColor: C.cardSolid, minWidth: 100 },
  chipName: { fontSize: 10, fontWeight: '600', fontFamily: F.mono },
  chipVal: { fontSize: 11, fontWeight: '700', color: C.text, fontFamily: F.mono, marginTop: 1 },
  kpiLabel: { fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.3 },
  kpiVal: { fontSize: 13, fontWeight: '700', fontFamily: F.mono, marginTop: 2 },
});
