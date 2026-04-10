import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, Dimensions, Modal, Image, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useScrollToTop } from '@react-navigation/native';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getDashboard, getIndicators, upsertPatrimonioSnapshot, getPatrimonioSnapshots, processRecorrentes, getCartoes, getFatura, addSavedAnalysis, getLatestAiSummary, getAiSummaries, markSummaryRead, getPortfolios, getPortfolioPatrimonios, getFinancasSummary, getProfile } from '../../services/database';
import { getSymbol } from '../../services/currencyService';
import { clearPriceCache } from '../../services/priceService';
import { runDailyCalculation, shouldCalculateToday } from '../../services/indicatorService';
import { runDividendSync, shouldSyncDividends, saveCorretoraAlias } from '../../services/dividendService';
var notifService = require('../../services/notificationService');
var financasHelpers = require('../gestao/financeiro/helpers');
var getCurrentFaturaMesAno = financasHelpers.getCurrentFaturaMesAno;
import widgetBridge from '../../services/widgetBridge';
import * as database from '../../services/database';
import * as currencyService from '../../services/currencyService';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { Badge, InfoTip, Fab, AiAnalysisModal, AiConfirmModal, RendaHero } from '../../components';
import { LoadingScreen, EmptyState } from '../../components/States';
import { useSubscription } from '../../contexts/SubscriptionContext';
import InteractiveChart from '../../components/InteractiveChart';
import { usePrivacyStyle } from '../../components/Sensitive';
import { animateLayout } from '../../utils/a11y';
import Sensitive from '../../components/Sensitive';
import ShareCard from '../../components/ShareCard';
var geminiService = require('../../services/geminiService');
var finCats = require('../../constants/financeCategories');

var W = Dimensions.get('window').width;
var PAD = 16;

var P = {
  acao:      { label: 'Ações',    short: 'Ações', color: '#22c55e' },
  fii:       { label: 'FIIs',     short: 'FII', color: '#a855f7' },
  opcao:     { label: 'Opções',   short: 'OP', color: '#0ea5e9' },
  etf:       { label: 'ETFs BR',  short: 'ETF', color: '#f59e0b' },
  etf_int:   { label: 'ETFs INT', short: 'ETF INT', color: '#FBBF24' },
  bdr:       { label: 'BDRs',     short: 'BDR', color: '#FB923C' },
  stock_int: { label: 'Stocks',   short: 'Stock', color: '#E879F9' },
  adr:       { label: 'ADRs',     short: 'ADR', color: '#F472B6' },
  reit:      { label: 'REITs',    short: 'REIT', color: '#34D399' },
  rf:        { label: 'RF',       short: 'RF', color: '#ec4899' },
};
var PKEYS = ['acao', 'fii', 'opcao', 'etf', 'etf_int', 'bdr', 'stock_int', 'adr', 'reit', 'rf'];

function fmt(v) {
  if (v == null || isNaN(v)) return 'R$ 0,00';
  return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmt2(v) {
  if (v == null || isNaN(v)) return '0,00';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ══════════ COMPONENTS ══════════

function GlassCard({ children, style, glow, pad }) {
  return (
    <View style={[{
      backgroundColor: 'rgba(255,255,255,0.035)',
      borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
      padding: pad !== undefined ? pad : 20, marginBottom: 14,
    }, glow && {
      shadowColor: glow, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3, shadowRadius: 16, elevation: 4,
    }, style]}>
      {children}
    </View>
  );
}

function AlertRow(props) {
  var type = props.type;
  var title = props.title;
  var desc = props.desc;
  var badge = props.badge;
  var onPress = props.onPress;
  var ps = props.ps;
  var gc = {
    critico: ['#f59e0b', '#ef4444'],
    warning: ['#f59e0b', '#f97316'],
    atencao: ['#f59e0b', '#f97316'],
    ok:      ['#22c55e', '#10b981'],
    info:    ['#0ea5e9', '#a855f7'],
  };
  var icons = { critico: '⚠', warning: '⚡', atencao: '⚡', ok: '✓', info: '◈' };
  var bc = { critico: '#ef4444', warning: '#f59e0b', atencao: '#f59e0b', ok: '#22c55e', info: '#0ea5e9' };
  var colors = gc[type] || gc.info;
  var badgeColor = bc[type] || '#0ea5e9';

  var content = (
    <View style={{ marginBottom: 10, borderRadius: 16, overflow: 'hidden' }}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ padding: 1.5, borderRadius: 16 }}>
        <View style={{ backgroundColor: 'rgba(12,12,20,0.94)', borderRadius: 14.5, padding: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: desc ? 4 : 0 }}>
            <Text style={{ fontSize: 13 }}>{icons[type] || '•'}</Text>
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.9)', fontFamily: F.display }}>
              {title}
            </Text>
            {badge ? (
              <View style={{
                backgroundColor: badgeColor + '18', borderWidth: 1, borderColor: badgeColor + '40',
                borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
              }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: badgeColor, fontFamily: F.mono, letterSpacing: 0.5 }}>
                  ● {badge}
                </Text>
              </View>
            ) : null}
          </View>
          {desc ? (
            <Text style={[{ fontSize: 13, color: 'rgba(255,255,255,0.45)', fontFamily: F.body, lineHeight: 18, paddingLeft: 21 }, ps]}>
              {desc}
            </Text>
          ) : null}
        </View>
      </LinearGradient>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.8} onPress={onPress}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

function CalItem({ dia, diaSemana, titulo, detalhe, tipo, last }) {
  var c = tipo === 'opcao' ? P.opcao.color : tipo === 'rf' ? P.rf.color : tipo === 'dividendo' ? C.green : P.acao.color;
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10,
      borderBottomWidth: last ? 0 : 1, borderBottomColor: 'rgba(255,255,255,0.04)',
    }}>
      <View style={{
        width: 42, height: 44, borderRadius: 12,
        backgroundColor: c + '0A', borderWidth: 1, borderColor: c + '20',
        justifyContent: 'center', alignItems: 'center',
      }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: c, fontFamily: F.display, lineHeight: 18 }}>{dia}</Text>
        <Text style={{ fontSize: 10, fontWeight: '600', color: c + '80', fontFamily: F.mono, marginTop: 1, letterSpacing: 0.5 }}>{diaSemana}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.85)', fontFamily: F.display }}>{titulo}</Text>
        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: F.body, marginTop: 1 }}>{detalhe}</Text>
      </View>
      <View style={{
        width: 6, height: 6, borderRadius: 3, backgroundColor: c,
        shadowColor: c, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 4,
      }} />
    </View>
  );
}

function SLabel({ children, right }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <Text style={{
        fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono,
        letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: '600',
      }}>{children}</Text>
      {right || null}
    </View>
  );
}

// ══════════ MAIN ══════════
export default function HomeScreen({ navigation }) {
  var { user } = useAuth();
  var sub = useSubscription();
  var [data, setData] = useState(null);
  var [loading, setLoading] = useState(true);
  var [refreshing, setRefreshing] = useState(false);
  var [chartTouching, setChartTouching] = useState(false);
  var [chartPeriod, setChartPeriod] = useState('ALL');
  var scrollRef = useRef(null);
  useScrollToTop(scrollRef);
  var _infoModal = useState(null); var infoModal = _infoModal[0]; var setInfoModal = _infoModal[1];
  var _showShare = useState(false); var showShare = _showShare[0]; var setShowShare = _showShare[1];
  var _expandedRendaCat = useState(null); var expandedRendaCat = _expandedRendaCat[0]; var setExpandedRendaCat = _expandedRendaCat[1];
  var _alertsExpanded = useState(false); var alertsExpanded = _alertsExpanded[0]; var setAlertsExpanded = _alertsExpanded[1];
  var _rentAnoExpanded = useState(false); var rentAnoExpanded = _rentAnoExpanded[0]; var setRentAnoExpanded = _rentAnoExpanded[1];
  var _loadError = useState(false); var loadError = _loadError[0]; var setLoadError = _loadError[1];
  var _faturaAlerts = useState([]); var faturaAlerts = _faturaAlerts[0]; var setFaturaAlerts = _faturaAlerts[1];
  var _aiModalVisible = useState(false); var aiModalVisible = _aiModalVisible[0]; var setAiModalVisible = _aiModalVisible[1];
  var _aiResult = useState(null); var aiResult = _aiResult[0]; var setAiResult = _aiResult[1];
  var _aiLoading = useState(false); var aiLoading = _aiLoading[0]; var setAiLoading = _aiLoading[1];
  var _aiError = useState(null); var aiError = _aiError[0]; var setAiError = _aiError[1];
  var _aiConfirmVisible = useState(false); var aiConfirmVisible = _aiConfirmVisible[0]; var setAiConfirmVisible = _aiConfirmVisible[1];
  var _aiUsage = useState(null); var aiUsage = _aiUsage[0]; var setAiUsage = _aiUsage[1];
  var _aiSaving = useState(false); var aiSaving = _aiSaving[0]; var setAiSaving = _aiSaving[1];
  var _autoSummary = useState(null); var autoSummary = _autoSummary[0]; var setAutoSummary = _autoSummary[1];
  var _summaryExpanded = useState(false); var summaryExpanded = _summaryExpanded[0]; var setSummaryExpanded = _summaryExpanded[1];
  var _pastSummaries = useState([]); var pastSummaries = _pastSummaries[0]; var setPastSummaries = _pastSummaries[1];
  var _showPastSummaries = useState(false); var showPastSummaries = _showPastSummaries[0]; var setShowPastSummaries = _showPastSummaries[1];
  var _expandedPastId = useState(null); var expandedPastId = _expandedPastId[0]; var setExpandedPastId = _expandedPastId[1];
  var _portfolios = useState([]); var portfolios = _portfolios[0]; var setPortfolios = _portfolios[1];
  var _selPortfolio = useState(null); var selPortfolio = _selPortfolio[0]; var setSelPortfolio = _selPortfolio[1];
  var _showPortDD = useState(false); var showPortDD = _showPortDD[0]; var setShowPortDD = _showPortDD[1];
  var _defaultApplied = useState(false); var defaultApplied = _defaultApplied[0]; var setDefaultApplied = _defaultApplied[1];
  var _financasSummary = useState(null); var financasSummary = _financasSummary[0]; var setFinancasSummary = _financasSummary[1];
  var _financasCartao = useState(null); var financasCartao = _financasCartao[0]; var setFinancasCartao = _financasCartao[1];
  var _pfHistories = useState({}); var pfHistories = _pfHistories[0]; var setPfHistories = _pfHistories[1];
  var _visiblePfLines = useState({}); var visiblePfLines = _visiblePfLines[0]; var setVisiblePfLines = _visiblePfLines[1];

  // Performance: throttle load to avoid re-fetching on every tab switch
  var lastLoadRef = useRef(0);
  var lastPortfolioRef = useRef(null);
  // Session-level flags: avoid re-running expensive background tasks
  var divSyncDoneRef = useRef(false);
  var indicatorsDoneRef = useRef(false);
  var notifRegisteredRef = useRef(false);

  var handleSaveAiResumo = function() {
    if (!user || !user.id || !aiResult) return;
    setAiSaving(true);
    addSavedAnalysis(user.id, { type: 'resumo', title: 'Resumo Inteligente', result: aiResult }).then(function(res) {
      setAiSaving(false);
      if (res.error) {
        Toast.show({ type: 'error', text1: 'Erro ao salvar' });
      } else {
        Toast.show({ type: 'success', text1: 'Análise salva' });
      }
    }).catch(function() { setAiSaving(false); });
  };

  var ps = usePrivacyStyle();

  var load = async function (forceRefresh) {
    if (!user) return;

    // P0: Throttle — skip reload if <60s since last load (unless forced or portfolio changed)
    var now = Date.now();
    var portfolioChanged = selPortfolio !== lastPortfolioRef.current;
    if (!forceRefresh && !portfolioChanged && !loading && data && (now - lastLoadRef.current) < 60000) return;
    lastLoadRef.current = now;
    lastPortfolioRef.current = selPortfolio;

    setLoadError(false);

    // Fetch portfolios and set default
    var effectivePortfolio = selPortfolio;
    try {
      var pfRes = await getPortfolios(user.id);
      var pfs = pfRes.data || [];
      setPortfolios(pfs);
      if (!defaultApplied && pfs.length > 0) {
        setSelPortfolio('__default__');
        setDefaultApplied(true);
        effectivePortfolio = '__default__';
      }
    } catch (e) { /* ignore */ }

    // Map portfolio selection to getDashboard param
    var dashPortfolioId = null;
    if (effectivePortfolio === '__default__') dashPortfolioId = '__null__';
    else if (effectivePortfolio) dashPortfolioId = effectivePortfolio;

    // P0: Dashboard first — no more blocking on dividend sync or getProfile
    var result = null;
    try {
      result = await getDashboard(user.id, dashPortfolioId);
      setData(result);
    } catch (e) {
      console.warn('Home dashboard load failed:', e);
      setLoadError(true);
    }
    setLoading(false);

    // ── All below is fire-and-forget (non-blocking) ──

    // P0: Dividend sync — now fire-and-forget using lastDividendSync from dashboard
    if (sub.canAccess('AUTO_SYNC_DIVIDENDS') && !divSyncDoneRef.current) {
      var lastSync = result && result.lastDividendSync ? result.lastDividendSync : null;
      if (shouldSyncDividends(lastSync)) {
        divSyncDoneRef.current = true;
        runDividendSync(user.id).then(function(syncResult) {
          if (syncResult && syncResult.missingContas && syncResult.missingContas.length > 0) {
            // Buscar contas existentes para oferecer como opcoes
            database.getSaldos(user.id).then(function(saldosRes) {
              var contas = (saldosRes.data || []).filter(function(s) { return s.corretora && s.moeda === 'BRL'; });
              var idx = 0;
              function showNextMissing() {
                if (idx >= syncResult.missingContas.length) return;
                var missing = syncResult.missingContas[idx];
                idx++;
                var fmtValor = 'R$ ' + missing.valor.toFixed(2).replace('.', ',');
                var buttons = [];
                for (var ci = 0; ci < contas.length; ci++) {
                  (function(conta) {
                    buttons.push({
                      text: conta.corretora,
                      onPress: function() {
                        // Salvar alias e creditar
                        saveCorretoraAlias(missing.name, conta.corretora);
                        database.upsertSaldo(user.id, {
                          name: conta.corretora,
                          saldo: (conta.saldo || 0) + missing.valor,
                        });
                        Toast.show({ type: 'success', text1: fmtValor + ' creditado em ' + conta.corretora });
                        showNextMissing();
                      },
                    });
                  })(contas[ci]);
                }
                buttons.push({
                  text: 'Criar nova conta',
                  onPress: function() {
                    navigation.navigate('CarteiraTab', { screen: 'Carteira', params: { initialGestaoTab: 'caixa' } });
                  },
                });
                buttons.push({ text: 'Ignorar', style: 'cancel', onPress: function() { showNextMissing(); } });
                Alert.alert(
                  'Conta "' + missing.name + '" nao encontrada',
                  'Dividendo de ' + fmtValor + ' precisa ser creditado.\nEscolha a conta correspondente:',
                  buttons
                );
              }
              showNextMissing();
            });
          }
        }).catch(function(e) {
          console.warn('Home dividend sync failed:', e);
          divSyncDoneRef.current = false;
        });
      } else {
        divSyncDoneRef.current = true;
      }
    }

    // P0.5: Fetch per-portfolio snapshot histories for chart overlays (only for "Todos" view)
    if (!dashPortfolioId && portfolios.length > 0) {
      var pfIds2 = [];
      for (var pfi2 = 0; pfi2 < portfolios.length; pfi2++) {
        pfIds2.push(portfolios[pfi2].id);
      }
      pfIds2.push('__null__');
      var pfHistPromises = [];
      for (var phi = 0; phi < pfIds2.length; phi++) {
        (function(pfId) {
          pfHistPromises.push(
            getPatrimonioSnapshots(user.id, pfId).then(function(snaps) {
              var pts = [];
              for (var si2 = 0; si2 < snaps.length; si2++) {
                if (snaps[si2].data && snaps[si2].valor > 0) {
                  pts.push({ date: snaps[si2].data, value: snaps[si2].valor });
                }
              }
              return { pfId: pfId, data: pts };
            }).catch(function() { return { pfId: pfId, data: [] }; })
          );
        })(pfIds2[phi]);
      }
      Promise.all(pfHistPromises).then(function(results2) {
        var hist = {};
        for (var ri = 0; ri < results2.length; ri++) {
          if (results2[ri].data.length > 1) {
            hist[results2[ri].pfId] = results2[ri].data;
          }
        }
        setPfHistories(hist);
      }).catch(function() {});
    } else {
      setPfHistories({});
    }

    // P1: Snapshots — save current + per-portfolio using lightweight query
    if (result && result.patrimonio > 0) {
      var todayISO = new Date().toISOString().substring(0, 10);
      var history = result.patrimonioHistory || [];
      var lastSnap = history.length > 0 ? history[history.length - 1] : null;
      var lastVal = lastSnap && lastSnap.value ? lastSnap.value : 0;

      // Guard: verifica se enriquecimento de precos funcionou
      // Se >30% dos tickers nao tem preco_atual, skip snapshot
      var posArr = result.positions || [];
      var totalPos = posArr.length;
      var withPrice = 0;
      for (var pci2 = 0; pci2 < posArr.length; pci2++) {
        if (posArr[pci2].preco_atual && posArr[pci2].preco_atual > 0) withPrice++;
      }
      var priceRatio = totalPos > 0 ? withPrice / totalPos : 1;

      var shouldSave = true;
      if (priceRatio < 0.7) {
        console.warn('Snapshot skipped: only ' + withPrice + '/' + totalPos + ' positions have prices');
        shouldSave = false;
      } else if (lastVal > 0) {
        var changePct = Math.abs(result.patrimonio - lastVal) / lastVal;
        if (changePct > 0.30) {
          console.warn('Snapshot skipped: value ' + result.patrimonio + ' deviates ' + (changePct * 100).toFixed(0) + '% from last ' + lastVal);
          shouldSave = false;
        }
      }
      if (shouldSave) {
        if (!dashPortfolioId) {
          // Global snapshot
          upsertPatrimonioSnapshot(user.id, todayISO, result.patrimonio).catch(function(e) {
            console.warn('Snapshot save failed:', e);
          });
          // Per-portfolio snapshots using lightweight function
          if (portfolios.length > 0) {
            var priceMap = {};
            for (var pmi = 0; pmi < posArr.length; pmi++) {
              var t = (posArr[pmi].ticker || '').toUpperCase().trim();
              if (posArr[pmi].preco_atual) priceMap[t] = posArr[pmi].preco_atual;
            }
            var pfIds = [];
            for (var pfi = 0; pfi < portfolios.length; pfi++) {
              pfIds.push(portfolios[pfi].id);
            }
            pfIds.push('__null__');
            getPortfolioPatrimonios(user.id, pfIds, priceMap).then(function(patrimonios) {
              var keys = Object.keys(patrimonios);
              // Fetch last snapshot for each portfolio to apply guard
              var guardPromises = [];
              for (var ki = 0; ki < keys.length; ki++) {
                (function(pfKey, pfVal) {
                  if (pfVal <= 0) return;
                  var gp = getPatrimonioSnapshots(user.id, pfKey).then(function(snaps) {
                    if (!snaps) snaps = [];
                    var lastPfVal = snaps.length > 0 ? snaps[snaps.length - 1].valor : 0;
                    if (lastPfVal > 0) {
                      var pfChangePct = Math.abs(pfVal - lastPfVal) / lastPfVal;
                      if (pfChangePct > 0.30) {
                        console.warn('Portfolio snapshot skipped (' + pfKey + '): ' + pfVal + ' deviates ' + (pfChangePct * 100).toFixed(0) + '% from last ' + lastPfVal);
                        return;
                      }
                    }
                    upsertPatrimonioSnapshot(user.id, todayISO, pfVal, pfKey).catch(function() {});
                  }).catch(function() {});
                  guardPromises.push(gp);
                })(keys[ki], patrimonios[keys[ki]]);
              }
              return Promise.all(guardPromises);
            }).catch(function() {});
          }
        } else if (dashPortfolioId === '__null__') {
          upsertPatrimonioSnapshot(user.id, todayISO, result.patrimonio, '__null__').catch(function() {});
        } else {
          upsertPatrimonioSnapshot(user.id, todayISO, result.patrimonio, dashPortfolioId).catch(function() {});
        }
      }
    }

    // P3: Indicators — session flag to avoid re-running
    if (sub.canAccess('INDICATORS') && !indicatorsDoneRef.current) {
      indicatorsDoneRef.current = true;
      getIndicators(user.id).then(function(indResult) {
        var indData = indResult.data || [];
        var lastCalc = indData.length > 0 ? indData[0].data_calculo : null;
        if (shouldCalculateToday(lastCalc)) {
          runDailyCalculation(user.id).catch(function(e) {
            console.warn('Home indicator calc failed:', e);
          });
        }
      }).catch(function(e) {
        console.warn('Home indicator check failed:', e);
        indicatorsDoneRef.current = false;
      });
    }

    // Process recurring transactions
    processRecorrentes(user.id).catch(function(e) {
      console.warn('Home processRecorrentes failed:', e);
    });

    // P2: Finanças do mês — fire-and-forget
    var agora = new Date();
    var mesAtual = agora.getMonth() + 1;
    var anoAtual = agora.getFullYear();
    getFinancasSummary(user.id, mesAtual, anoAtual).then(function(summ) {
      if (summ && summ.total > 0) {
        setFinancasSummary(summ);
      }
    }).catch(function() {});

    // Cartão principal — fatura do mês
    getProfile(user.id).then(function(profRes) {
      if (profRes.data && profRes.data.cartao_principal) {
        var cpId = profRes.data.cartao_principal;
        getCartoes(user.id).then(function(cartoesRes) {
          var cards = cartoesRes.data || [];
          var card = null;
          for (var fi = 0; fi < cards.length; fi++) {
            if (cards[fi].id === cpId) { card = cards[fi]; break; }
          }
          if (card) {
            var fma = getCurrentFaturaMesAno(card.dia_fechamento || 1, card.dia_vencimento || 1);
            getFatura(user.id, card.id, fma.mes, fma.ano).then(function(fatRes) {
              if (fatRes.data) {
                setFinancasCartao({
                  nome: card.apelido || ((card.bandeira || '').toUpperCase() + ' ••' + (card.ultimos_digitos || '')),
                  faturaTotal: fatRes.data.total || 0,
                  vencimento: fatRes.data.dueDate || null,
                });
              }
            }).catch(function() {});
          }
        }).catch(function() {});
      }
    }).catch(function() {});

    // Fetch AI summaries for PRO+ users
    if (sub.canAccess('AI_SUMMARY')) {
      getAiSummaries(user.id, 5, 0).then(function(res) {
        var items = res.data || [];
        if (items.length > 0) {
          setAutoSummary(items[0]);
          setPastSummaries(items.slice(1));
        }
      }).catch(function() {});
    }

    // Widget sync — sempre usa portfolio Padrao
    if (result && (!dashPortfolioId || dashPortfolioId === '__null__')) {
      widgetBridge.updateAllWidgetsFromDashboard(user.id, result, database, currencyService).catch(function(e) {
        console.warn('Home widget sync failed:', e);
      });
    } else if (result) {
      getDashboard(user.id, '__null__').then(function(defaultResult) {
        if (defaultResult) {
          widgetBridge.updateAllWidgetsFromDashboard(user.id, defaultResult, database, currencyService).catch(function(e) {
            console.warn('Home widget sync failed:', e);
          });
        }
      }).catch(function() {});
    }

    // P3: Push token — register once per session
    if (!notifRegisteredRef.current) {
      notifRegisteredRef.current = true;
      notifService.registerForPushNotifications().then(function(token) {
        if (token) {
          notifService.savePushToken(user.id, token, 'ios').catch(function() {});
        }
      }).catch(function() {});
    }
    if (result) {
      var opsAtivas = result.opsAtivasData || [];
      if (opsAtivas.length > 0) {
        notifService.scheduleOptionExpiryNotifications(opsAtivas).catch(function() {});
      }
      var rfData = result.rendaFixa || [];
      if (rfData.length > 0) {
        notifService.scheduleRFExpiryNotifications(rfData).catch(function() {});
      }
    }

    // P2: Fatura alerts — parallel getFatura calls
    getCartoes(user.id).then(function(cartoesRes) {
      if (!cartoesRes.data || cartoesRes.data.length === 0) {
        setFaturaAlerts([]);
        return;
      }
      var cards = cartoesRes.data;
      var nowDate = new Date();
      var curMes = nowDate.getMonth() + 1;
      var curAno = nowDate.getFullYear();
      var fatAlerts = [];
      var promises = [];

      for (var ci = 0; ci < cards.length; ci++) {
        (function(card) {
          var fmaAlert = getCurrentFaturaMesAno(card.dia_fechamento || 1, card.dia_vencimento || 1);
          var p = getFatura(user.id, card.id, fmaAlert.mes, fmaAlert.ano).then(function(fRes) {
            var fData = fRes && fRes.data ? fRes.data : null;
            if (!fData || fRes.error || !fData.total || fData.total <= 0) return;
            if (fData.pago) return;

            var sym = getSymbol(card.moeda || 'BRL');
            var label = (card.bandeira || '').toUpperCase() + ' ••••' + (card.ultimos_digitos || '');
            var valorStr = sym + ' ' + fData.total.toFixed(2).replace('.', ',');

            var dueDate = new Date(fData.dueDate + 'T12:00:00');
            var todayMs = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime();
            var dueMs = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()).getTime();
            var diffDays = Math.round((dueMs - todayMs) / 86400000);

            var dueDateStr = String(dueDate.getDate()).padStart(2, '0') + '/' + String(dueDate.getMonth() + 1).padStart(2, '0');

            var cycleEndDate = new Date(fData.cycleEnd + 'T12:00:00');
            var isClosed = nowDate > cycleEndDate;

            if (diffDays < 0) {
              fatAlerts.push({
                type: 'critico',
                title: 'Fatura vencida - ' + label,
                desc: valorStr + ' venceu em ' + dueDateStr,
                badge: 'VENCIDA',
                _faturaNav: { cartaoId: card.id, cartao: card },
              });
            } else if (diffDays <= 5 && isClosed) {
              fatAlerts.push({
                type: 'critico',
                title: 'Fatura vence em ' + diffDays + ' dia' + (diffDays !== 1 ? 's' : ''),
                desc: label + ': ' + valorStr,
                badge: 'URGENTE',
                _faturaNav: { cartaoId: card.id, cartao: card },
              });
            } else if (isClosed) {
              fatAlerts.push({
                type: 'info',
                title: 'Fatura fechou - ' + label,
                desc: valorStr + '. Vence ' + dueDateStr,
                badge: 'FATURA',
                _faturaNav: { cartaoId: card.id, cartao: card },
              });
            }
          }).catch(function(e) {
            console.warn('Fatura alert fetch failed for card ' + card.id + ':', e);
          });
          promises.push(p);
        })(cards[ci]);
      }

      Promise.all(promises).then(function() {
        setFaturaAlerts(fatAlerts);
      });
    }).catch(function(e) {
      console.warn('Home fatura alerts failed:', e);
    });
  };

  useFocusEffect(useCallback(function () { load(false); }, [user, selPortfolio]));

  var onRefresh = async function () {
    setRefreshing(true);
    clearPriceCache();
    // Reset session flags so background tasks re-run on manual refresh
    divSyncDoneRef.current = false;
    indicatorsDoneRef.current = false;
    await load(true);
    setRefreshing(false);
  };

  if (loading) return <View style={st.container}><LoadingScreen /></View>;

  if (loadError) return (
    <View style={st.container}>
      <EmptyState
        ionicon="alert-circle-outline"
        title="Erro ao carregar"
        description="Não foi possível carregar o dashboard. Verifique sua conexão e tente novamente."
        cta="Tentar novamente"
        onCta={function() { setLoading(true); load(); }}
        color={C.red}
      />
    </View>
  );

  if (!data || data.patrimonio === 0) {
    return (
      <View style={st.container}>
        <EmptyState
          ionicon="rocket-outline" title="Comece sua jornada"
          description="Registre sua primeira operação para ver o dashboard completo."
          cta="Registrar operação"
          onCta={function () { navigation.navigate('AddOperacao'); }}
          color={C.accent}
        />
      </View>
    );
  }

  // ══════════ DATA ══════════
  var patrimonio = data.patrimonio || 0;
  var patrimonioAcoes = data.patrimonioAcoes || 0;
  var rfTotalAplicado = data.rfTotalAplicado || 0;
  var rfRendaMensal = data.rfRendaMensal || 0;
  var dividendosMes = data.dividendosMes || 0;
  var premiosMes = data.premiosMes || 0;
  var recompraMes = data.recompraMes || 0;
  var rendaTotalMes = data.rendaTotalMes || 0;
  var rentabilidadeMes = data.rentabilidadeMes || 0;
  var opsAtivas = data.opsAtivas || 0;
  var opsProxVenc = data.opsProxVenc || 0;
  var opsVenc7d = data.opsVenc7d || 0;
  var opsVenc15d = data.opsVenc15d || 0;
  var opsVenc30d = data.opsVenc30d || 0;
  var meta = data.meta || 6000;
  var positions = data.positions || [];
  var saldos = data.saldos || [];
  var saldoTotal = data.saldoTotal || 0;
  var rendaFixa = data.rendaFixa || [];
  var eventos = data.eventos || [];

  // Mes anterior
  var dividendosMesAnterior = data.dividendosMesAnterior || 0;
  var premiosMesAnterior = data.premiosMesAnterior || 0;
  var rendaTotalMesAnterior = data.rendaTotalMesAnterior || 0;
  var dividendosCatMes = data.dividendosCatMes || { acao: 0, fii: 0, etf: 0, bdr: 0, stock_int: 0, adr: 0, reit: 0 };
  var dividendosCatMesAnt = data.dividendosCatMesAnt || { acao: 0, fii: 0, etf: 0, bdr: 0, stock_int: 0, adr: 0, reit: 0 };
  var dividendosRecebidosMes = data.dividendosRecebidosMes || 0;
  var dividendosAReceberMes = data.dividendosAReceberMes || 0;
  var plMes = data.plMes || 0;
  var plMesAnterior = data.plMesAnterior || 0;
  var plMedia3m = data.plMedia3m || 0;
  var rendaMediaAnual = data.rendaMediaAnual || 0;
  var proventosMesDetalhe = data.proventosMesDetalhe || [];
  var premiosMesDetalhe = data.premiosMesDetalhe || [];

  // Helper: filtrar proventos por categoria de ativo
  function getProvsByCat(cat) {
    var cats = Array.isArray(cat) ? cat : [cat];
    var result = [];
    for (var i = 0; i < proventosMesDetalhe.length; i++) {
      var p = proventosMesDetalhe[i];
      if (cats.indexOf(p.categoria) !== -1) result.push(p);
    }
    return result;
  }

  function isoToBr(iso) {
    if (!iso) return '';
    var parts = (iso || '').substring(0, 10).split('-');
    if (parts.length !== 3) return iso;
    return parts[2] + '/' + parts[1];
  }

  var metaPct = meta > 0 ? Math.min((rendaTotalMes / meta) * 100, 150) : 0;

  // Categorias com posições ativas (para mostrar rows relevantes na renda)
  var hasCat = { acao: false, fii: false, etf: false, etf_int: false, bdr: false, stock_int: false, adr: false, reit: false };
  for (var hci = 0; hci < positions.length; hci++) {
    var hcCat = positions[hci].categoria || 'acao';
    if (hcCat === 'etf' && positions[hci].mercado === 'INT') {
      hasCat.etf_int = true;
    } else if (hasCat[hcCat] !== undefined) {
      hasCat[hcCat] = true;
    }
  }

  // Allocation (usa preco_atual em BRL quando disponivel, senao PM convertido)
  var alloc = {};
  PKEYS.forEach(function (k) { alloc[k] = 0; });
  positions.forEach(function (p) {
    var t = p.categoria || 'acao';
    var val = (p.quantidade || 0) * (p.preco_atual || (p.mercado === 'INT' ? (p.pm || 0) * (p.taxa_cambio || p.taxa_cambio_media || 1) : (p.pm || 0)));
    if (t === 'etf' && p.mercado === 'INT') {
      alloc.etf_int += val;
    } else {
      alloc[t] = (alloc[t] || 0) + val;
    }
  });
  alloc.rf = rfTotalAplicado;
  var totalAlloc = 0;
  PKEYS.forEach(function (k) { totalAlloc += alloc[k]; });
  if (totalAlloc === 0) totalAlloc = patrimonio || 1;

  // Chart data — 100% real, filtered by period
  var patrimonioHistory = data.patrimonioHistory || [];
  var PERIODS = [
    { key: '1M', label: '1M', days: 30 },
    { key: '3M', label: '3M', days: 90 },
    { key: '6M', label: '6M', days: 180 },
    { key: '1A', label: '1A', days: 365 },
    { key: 'ALL', label: 'Tudo', days: 0 },
  ];

  var filteredChartData = patrimonioHistory;
  if (chartPeriod !== 'ALL' && patrimonioHistory.length > 0) {
    var periodDef = PERIODS.find(function (p) { return p.key === chartPeriod; });
    if (periodDef && periodDef.days > 0) {
      var cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - periodDef.days);
      var cutoffStr = cutoff.toISOString().substring(0, 10);
      filteredChartData = patrimonioHistory.filter(function (pt) {
        return pt.date >= cutoffStr;
      });
    }
  }
  var hasRealChart = filteredChartData.length >= 2;

  // Compute rentability from patrimonioHistory
  var rentSemanal = 0;
  var rentMensal = rentabilidadeMes;
  var rentAno = 0;
  var rentTotal = 0;
  if (patrimonioHistory.length >= 2) {
    var lastPt = patrimonioHistory[patrimonioHistory.length - 1];
    var lastVal = lastPt.value;
    // Helper: find closest point at or before a cutoff date
    var findValAt = function(daysAgo) {
      var d = new Date();
      d.setDate(d.getDate() - daysAgo);
      var cutStr = d.toISOString().substring(0, 10);
      var best = null;
      for (var hi = 0; hi < patrimonioHistory.length; hi++) {
        if (patrimonioHistory[hi].date <= cutStr) best = patrimonioHistory[hi];
      }
      return best ? best.value : 0;
    };
    var firstVal = patrimonioHistory[0].value;
    // Semanal
    var val7 = findValAt(7);
    if (val7 > 0) rentSemanal = ((lastVal - val7) / val7) * 100;
    // Mensal (use computed or fallback from history)
    var val30 = findValAt(30);
    if (val30 > 0 && rentMensal === 0) rentMensal = ((lastVal - val30) / val30) * 100;
    // Ano (YTD)
    var yearStart = new Date().getFullYear() + '-01-01';
    var valYtd = 0;
    for (var yi = 0; yi < patrimonioHistory.length; yi++) {
      if (patrimonioHistory[yi].date >= yearStart) { valYtd = patrimonioHistory[yi].value; break; }
    }
    if (valYtd > 0) rentAno = ((lastVal - valYtd) / valYtd) * 100;
    // Total — usa custo investido (PM * qty) vs patrimonio atual
    // Evita distorcao quando primeiro snapshot e muito antigo/pequeno
    var custoInvestido = 0;
    for (var ci = 0; ci < positions.length; ci++) {
      var cPos = positions[ci];
      var cQty = cPos.quantidade || 0;
      var cPm = cPos.pm || 0;
      if (cPos.mercado === 'INT') {
        custoInvestido += cQty * cPm * (cPos.taxa_cambio || cPos.taxa_cambio_media || 1);
      } else {
        custoInvestido += cQty * cPm;
      }
    }
    custoInvestido += rfTotalAplicado;
    if (custoInvestido > 0) rentTotal = ((patrimonio - custoInvestido) / custoInvestido) * 100;
  }

  // Rentabilidade mês a mês do ano atual
  var MONTH_NAMES_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  var rentMeses = [];
  if (patrimonioHistory.length >= 2) {
    var currentYear = new Date().getFullYear();
    var currentMonth = new Date().getMonth(); // 0-based
    for (var mi = 0; mi <= currentMonth; mi++) {
      var mesStr = currentYear + '-' + (mi + 1 < 10 ? '0' : '') + (mi + 1);
      // Valor no início do mês (último ponto antes ou no dia 1)
      var inicioMes = mesStr + '-01';
      var valInicio = 0;
      for (var hi2 = 0; hi2 < patrimonioHistory.length; hi2++) {
        if (patrimonioHistory[hi2].date < inicioMes) valInicio = patrimonioHistory[hi2].value;
      }
      // Se é janeiro e não tem ponto anterior, usar o primeiro ponto do ano
      if (valInicio === 0 && mi === 0) {
        for (var hi3 = 0; hi3 < patrimonioHistory.length; hi3++) {
          if (patrimonioHistory[hi3].date >= inicioMes) { valInicio = patrimonioHistory[hi3].value; break; }
        }
      }
      // Valor no fim do mês (último ponto do mês)
      var proxMes = mi < 11 ? (currentYear + '-' + (mi + 2 < 10 ? '0' : '') + (mi + 2) + '-01') : ((currentYear + 1) + '-01-01');
      var valFim = 0;
      for (var hi4 = 0; hi4 < patrimonioHistory.length; hi4++) {
        if (patrimonioHistory[hi4].date >= inicioMes && patrimonioHistory[hi4].date < proxMes) {
          valFim = patrimonioHistory[hi4].value;
        }
      }
      var rentMi = 0;
      if (valInicio > 0 && valFim > 0) rentMi = ((valFim - valInicio) / valInicio) * 100;
      rentMeses.push({ mes: MONTH_NAMES_SHORT[mi], pct: rentMi, valInicio: valInicio, valFim: valFim });
    }
  }

  // Proventos pagos hoje
  var proventosHoje = data.proventosHoje || [];

  // Build por_corretora lookup from positions
  var posCorretoras = {};
  for (var pci = 0; pci < positions.length; pci++) {
    var pcTk = (positions[pci].ticker || '').toUpperCase();
    if (positions[pci].por_corretora) {
      posCorretoras[pcTk] = positions[pci].por_corretora;
    }
  }

  // Alerts
  var alerts = [];
  var phDetailData = null;
  if (proventosHoje.length > 0) {
    var phByTicker = {};
    var phTotal = 0;
    // Build detailed breakdown: ticker → { total, tipo, vpc, corretoras: { name → { qty, valor } } }
    var phDetail = {};
    for (var phi = 0; phi < proventosHoje.length; phi++) {
      var phItem = proventosHoje[phi];
      var phTk = (phItem.ticker || '?').toUpperCase();
      var phVpc = phItem.valor_por_cota || 0;
      var phQty = phItem.quantidade || 0;
      var phVal = phVpc * phQty;
      var phTipo = phItem.tipo_provento || phItem.tipo || 'dividendo';
      if (!phByTicker[phTk]) phByTicker[phTk] = 0;
      phByTicker[phTk] += phVal;
      phTotal += phVal;
      if (!phDetail[phTk]) {
        phDetail[phTk] = { total: 0, tipo: phTipo, qty: 0, vpc: phVpc, corretoras: {} };
        // Distribute by por_corretora from positions
        var pcMap = posCorretoras[phTk];
        if (pcMap) {
          var pcKeys = Object.keys(pcMap);
          for (var pck = 0; pck < pcKeys.length; pck++) {
            var corrName = pcKeys[pck];
            var corrQty = pcMap[corrName] || 0;
            if (corrQty > 0) {
              phDetail[phTk].corretoras[corrName] = { qty: corrQty, valor: corrQty * phVpc };
            }
          }
        }
      }
      phDetail[phTk].total += phVal;
      phDetail[phTk].qty += phQty;
    }
    phDetailData = { tickers: phDetail, total: phTotal };
    var phTickers = Object.keys(phByTicker);
    var phDesc = '';
    for (var phd = 0; phd < phTickers.length; phd++) {
      if (phd > 0) phDesc += ', ';
      phDesc += phTickers[phd] + ' R$ ' + fmt2(phByTicker[phTickers[phd]]);
    }
    alerts.push({
      type: 'ok',
      title: 'Dividendo sendo pago hoje',
      desc: phDesc + ' · Total ' + fmt(phTotal),
      badge: 'HOJE',
      detailType: 'proventos',
    });
  }
  if (opsVenc7d > 0) {
    alerts.push({
      type: 'critico',
      title: opsVenc7d + (opsVenc7d === 1 ? ' opção vence' : ' opções vencem') + ' em 7 dias',
      desc: 'Ação urgente: rolar, exercer ou encerrar.',
      badge: 'URGENTE',
    });
  }
  if (opsVenc15d > 0) {
    alerts.push({
      type: 'warning',
      title: opsVenc15d + (opsVenc15d === 1 ? ' opção vence' : ' opções vencem') + ' em 8-15 dias',
      desc: 'Considere rolar ou encerrar em breve.',
      badge: 'ATENÇÃO',
    });
  }
  if (opsVenc30d > 0) {
    alerts.push({
      type: 'info',
      title: opsVenc30d + (opsVenc30d === 1 ? ' opção vence' : ' opções vencem') + ' em 16-30 dias',
      desc: 'Monitore o theta decay e avalie rolagem.',
      badge: 'INFO',
    });
  }
  if (metaPct >= 100) {
    alerts.push({ type: 'ok', title: 'Meta mensal atingida!', desc: fmt(rendaTotalMes) + ' de renda no mês.', badge: 'OK' });
  } else if (rendaTotalMes > 0 && metaPct >= 50) {
    alerts.push({ type: 'info', title: 'Meta de renda a ' + metaPct.toFixed(0) + '%', desc: 'Faltam ' + fmt(meta - rendaTotalMes) + ' para atingir a meta mensal de ' + fmt(meta) + '.', badge: 'INFO' });
  }
  // Merge fatura alerts
  for (var fai = 0; fai < faturaAlerts.length; fai++) {
    alerts.push(faturaAlerts[fai]);
  }

  // Trial expiration warning
  if (sub.trialInfo && sub.trialInfo.daysLeft <= 2 && sub.trialInfo.daysLeft > 0) {
    alerts.unshift({
      type: 'warning',
      title: 'Seu trial Premium expira em ' + sub.trialInfo.daysLeft + (sub.trialInfo.daysLeft === 1 ? ' dia' : ' dias'),
      desc: 'Assine agora para manter acesso completo.',
      badge: 'TRIAL',
    });
  } else if (sub.trialInfo && sub.trialInfo.daysLeft <= 0) {
    alerts.unshift({
      type: 'critico',
      title: 'Seu trial Premium expirou',
      desc: 'Assine para continuar usando todos os recursos.',
      badge: 'EXPIRADO',
    });
  }

  // Sort: critical/warning first, then rest
  alerts.sort(function(a, b) {
    var aCrit = (a.type === 'critico' || a.type === 'warning') ? 1 : 0;
    var bCrit = (b.type === 'critico' || b.type === 'warning') ? 1 : 0;
    return bCrit - aCrit;
  });

  if (alerts.length === 0) {
    alerts.push({ type: 'ok', title: 'Tudo em ordem', desc: 'Nenhum alerta no momento.', badge: 'OK' });
  }

  // Renda comparação vs mês anterior
  var rendaCompare = '';
  var rendaAnteriorLabel = '';
  if (rendaTotalMesAnterior > 0) {
    var rendaChangePct = ((rendaTotalMes - rendaTotalMesAnterior) / Math.abs(rendaTotalMesAnterior)) * 100;
    rendaCompare = (rendaChangePct > 0 ? '+' : '') + rendaChangePct.toFixed(0) + '% vs ant.';
    rendaAnteriorLabel = 'Ant: R$ ' + fmt(rendaTotalMesAnterior);
  }
  var rendaBetter = rendaTotalMes >= rendaTotalMesAnterior;

  // ══════════ AI RESUMO ══════════

  var handleAiResumo = function() {
    if (!sub.canAccess('AI_ANALYSIS')) {
      navigation.navigate('Paywall');
      return;
    }
    setAiModalVisible(true);
    setAiLoading(true);
    setAiError(null);
    setAiResult(null);

    // Build alerts text
    var alertTexts = [];
    for (var ai = 0; ai < alerts.length; ai++) {
      alertTexts.push(alerts[ai].title + ': ' + alerts[ai].desc);
    }

    // Build events text
    var eventoTexts = [];
    for (var ei = 0; ei < eventos.length; ei++) {
      eventoTexts.push(eventos[ei].titulo + ' - ' + eventos[ei].detalhe);
    }

    // Build top movers
    var destaques = [];
    for (var di = 0; di < positions.length; di++) {
      var dpos = positions[di];
      if (dpos.variacao != null) {
        destaques.push({ ticker: dpos.ticker || '?', variacao: dpos.variacao || 0 });
      }
    }
    destaques.sort(function(a, b) { return Math.abs(b.variacao) - Math.abs(a.variacao); });
    destaques = destaques.slice(0, 5);

    // Build opcoes vencendo
    var opsVencData = (data.opsAtivasData || []).filter(function(op) {
      if (!op.vencimento) return false;
      var vd = new Date(op.vencimento + 'T00:00:00');
      var now = new Date();
      var diff = Math.ceil((vd - now) / (1000 * 60 * 60 * 24));
      return diff >= 0 && diff <= 7;
    }).map(function(op) {
      var vd = new Date(op.vencimento + 'T00:00:00');
      var now = new Date();
      var dte = Math.ceil((vd - now) / (1000 * 60 * 60 * 24));
      return { ticker: op.ticker_opcao || op.ativo_base, tipo: op.tipo, strike: op.strike, dte: dte };
    });

    // Allocation percentages
    var alocPct = {};
    PKEYS.forEach(function(k) {
      alocPct[k] = totalAlloc > 0 ? (alloc[k] / totalAlloc) * 100 : 0;
    });
    alocPct.saldo = totalAlloc > 0 ? (saldoTotal / totalAlloc) * 100 : 0;

    var payload = {
      type: 'resumo',
      patrimonio: patrimonio,
      rentabilidade: rentabilidadeMes,
      rendaMensal: rendaTotalMes,
      metaMensal: meta,
      rendaMesAnterior: rendaTotalMesAnterior,
      alocacao: alocPct,
      posicoes: positions.length,
      alertas: alertTexts,
      eventos: eventoTexts,
      destaques: destaques,
      opcoesVencendo: opsVencData,
    };

    geminiService.analyzeGeneral(payload).then(function(result) {
      setAiLoading(false);
      if (result.error) {
        setAiError(result.error);
      } else {
        setAiResult(result);
        if (result._usage) setAiUsage(result._usage);
      }
    });
  };

  // ══════════ RENDER ══════════
  return (
    <View style={st.container}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={st.scroll}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!chartTouching}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} colors={[C.accent]} />}
      >
        {/* HEADER */}
        <View style={st.header}>
          <Image
            source={require('../../../assets/logo-header.png')}
            style={{ height: 38, width: 38 * (400 / 95) }}
            resizeMode="contain"
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={st.syncBadge}>
              <Text style={{ fontSize: 10, color: '#22c55e', fontWeight: '600', fontFamily: F.mono }}>
                ● SYNC {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            <TouchableOpacity onPress={function() { setShowShare(true); }} style={{ padding: 4 }} accessibilityLabel="Compartilhar">
              <Ionicons name="share-outline" size={20} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
          </View>
        </View>

        {/* PORTFOLIO SELECTOR */}
        {portfolios.length > 0 ? (
          <View style={{ paddingHorizontal: 0, marginBottom: 8, zIndex: 10 }}>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', alignSelf: 'flex-start' }}
              onPress={function() { setShowPortDD(!showPortDD); }}
              activeOpacity={0.7}
            >
              {(function() {
                var lbl = 'Todos';
                var clr = C.accent;
                var ico = 'people-outline';
                if (selPortfolio === '__default__') { lbl = 'Padrão'; ico = 'briefcase-outline'; }
                else if (selPortfolio) {
                  for (var pi2 = 0; pi2 < portfolios.length; pi2++) {
                    if (portfolios[pi2].id === selPortfolio) {
                      lbl = portfolios[pi2].nome; clr = portfolios[pi2].cor || C.accent; ico = portfolios[pi2].icone || null;
                      break;
                    }
                  }
                }
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {ico ? <Ionicons name={ico} size={14} color={clr} /> : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: clr }} />}
                    <Text style={{ fontSize: 12, fontFamily: F.body, color: C.text }}>{lbl}</Text>
                    <Ionicons name={showPortDD ? 'chevron-up' : 'chevron-down'} size={14} color='rgba(255,255,255,0.3)' />
                  </View>
                );
              })()}
            </TouchableOpacity>
            {showPortDD ? (
              <View style={{ backgroundColor: C.bg, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', marginTop: 4, overflow: 'hidden' }}>
                <TouchableOpacity
                  style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' }, !selPortfolio && { backgroundColor: C.accent + '11' }]}
                  onPress={function() { setSelPortfolio(null); setShowPortDD(false); }}
                >
                  <Ionicons name="people-outline" size={14} color={!selPortfolio ? C.accent : 'rgba(255,255,255,0.3)'} />
                  <Text style={[{ fontSize: 13, fontFamily: F.body, color: C.text }, !selPortfolio && { color: C.accent }]}>Todos</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' }, selPortfolio === '__default__' && { backgroundColor: C.accent + '11' }]}
                  onPress={function() { setSelPortfolio('__default__'); setShowPortDD(false); }}
                >
                  <Ionicons name="briefcase-outline" size={14} color={selPortfolio === '__default__' ? C.accent : 'rgba(255,255,255,0.3)'} />
                  <Text style={[{ fontSize: 13, fontFamily: F.body, color: C.text }, selPortfolio === '__default__' && { color: C.accent }]}>Padrão</Text>
                </TouchableOpacity>
                {portfolios.map(function(p) {
                  var isAct = selPortfolio === p.id;
                  return (
                    <TouchableOpacity key={p.id}
                      style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' }, isAct && { backgroundColor: C.accent + '11' }]}
                      onPress={function() { setSelPortfolio(p.id); setShowPortDD(false); }}
                    >
                      {p.icone ? (
                        <Ionicons name={p.icone} size={14} color={isAct ? (p.cor || C.accent) : 'rgba(255,255,255,0.3)'} />
                      ) : (
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: p.cor || C.accent }} />
                      )}
                      <Text style={[{ fontSize: 13, fontFamily: F.body, color: C.text }, isAct && { color: p.cor || C.accent }]}>{p.nome}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* RENDA HERO — foco principal do app */}
        <RendaHero userId={user && user.id} portfolioId={selPortfolio} metaMensal={meta} />

        {/* PATRIMÔNIO HERO */}
        <GlassCard pad={0} glow="rgba(14,165,233,0.12)">
          <LinearGradient
            colors={['#22c55e', '#0ea5e9', '#a855f7', '#f59e0b', '#ec4899']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={{ height: 3, borderTopLeftRadius: 18, borderTopRightRadius: 18 }}
          />
          <View style={{ padding: 22 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={st.heroLabel}>PATRIMÔNIO TOTAL</Text>
                <TouchableOpacity onPress={function() { setInfoModal({ title: 'Patrimônio Total', text: 'Soma de ações, FIIs, ETFs, opções e renda fixa a preços de mercado.' }); }}>
                  <Text style={{ fontSize: 13, color: C.accent }}>ⓘ</Text>
                </TouchableOpacity>
              </View>
              {patrimonioHistory.length >= 2 ? (
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', flex: 1, marginLeft: 8 }}>
                  {[[rentSemanal, '7D'], [rentMensal, '1M'], [rentAno, 'YTD'], [rentTotal, 'Total']].map(function(item) {
                    var val = item[0];
                    var label = item[1];
                    if (val === 0) return null;
                    var cor = val > 0 ? C.green : C.red;
                    var sinal = val > 0 ? '+' : '';
                    return (
                      <View key={label} style={{ alignItems: 'center' }}>
                        <Text maxFontSizeMultiplier={1.5} style={[{ fontSize: 11, color: cor, fontFamily: F.mono, fontWeight: '700' }, ps]}>
                          {sinal + val.toFixed(1) + '%'}
                        </Text>
                        <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono }}>{label}</Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 6 }}>
              <Text style={[st.heroPrefix, ps]}>R$ </Text>
              <Text style={[st.heroValue, ps]}>{fmt2(patrimonio).split(',')[0]}</Text>
              <Text style={[st.heroCents, ps]}>,{fmt2(patrimonio).split(',')[1]}</Text>
            </View>

            {/* Breakdown: renda variável + renda fixa */}
            {rfTotalAplicado > 0 && patrimonioAcoes > 0 ? (
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono }}>
                  Renda Var. <Text style={[{ color: P.acao.color }, ps]}>{fmt(patrimonioAcoes)}</Text>
                </Text>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono }}>
                  Renda Fixa <Text style={[{ color: P.rf.color }, ps]}>{fmt(rfTotalAplicado)}</Text>
                </Text>
              </View>
            ) : null}

            {/* Evolução do Patrimônio — só dados reais */}
            <View style={{ marginTop: 16 }}>
              {/* Period filter pills */}
              {patrimonioHistory.length >= 2 ? (
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                  {PERIODS.map(function (p) {
                    var active = chartPeriod === p.key;
                    return (
                      <TouchableOpacity key={p.key} activeOpacity={0.7}
                        onPress={function () { setChartPeriod(p.key); }}
                        style={{
                          paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                          backgroundColor: active ? '#0ea5e9' + '20' : 'rgba(255,255,255,0.03)',
                          borderWidth: 1,
                          borderColor: active ? '#0ea5e9' + '50' : 'rgba(255,255,255,0.06)',
                        }}>
                        <Text style={{
                          fontSize: 11, fontWeight: '700', fontFamily: F.mono, letterSpacing: 0.5,
                          color: active ? '#0ea5e9' : 'rgba(255,255,255,0.3)',
                        }}>{p.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}

              {/* Portfolio overlay toggle chips (only in "Todos" view) */}
              {!selPortfolio && Object.keys(pfHistories).length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {(function() {
                    var chips = [];
                    var pfKeys = Object.keys(pfHistories);
                    for (var ci = 0; ci < pfKeys.length; ci++) {
                      (function(pfKey) {
                        var isVisible = visiblePfLines[pfKey] === true;
                        var chipLabel = 'Padrão';
                        var chipColor = C.accent;
                        if (pfKey !== '__null__') {
                          for (var pi3 = 0; pi3 < portfolios.length; pi3++) {
                            if (portfolios[pi3].id === pfKey) {
                              chipLabel = portfolios[pi3].nome;
                              chipColor = portfolios[pi3].cor || C.accent;
                              break;
                            }
                          }
                        }
                        chips.push(
                          <TouchableOpacity key={pfKey}
                            onPress={function() {
                              setVisiblePfLines(function(prev) {
                                var next = {};
                                var keys = Object.keys(prev);
                                for (var ki2 = 0; ki2 < keys.length; ki2++) next[keys[ki2]] = prev[keys[ki2]];
                                next[pfKey] = !prev[pfKey];
                                return next;
                              });
                            }}
                            style={{
                              flexDirection: 'row', alignItems: 'center', gap: 4,
                              paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
                              backgroundColor: isVisible ? chipColor + '20' : 'rgba(255,255,255,0.03)',
                              borderWidth: 1,
                              borderColor: isVisible ? chipColor + '50' : 'rgba(255,255,255,0.06)',
                            }}
                          >
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: chipColor, opacity: isVisible ? 1 : 0.3 }} />
                            <Text style={{ fontSize: 9, fontFamily: F.mono, color: isVisible ? chipColor : 'rgba(255,255,255,0.3)' }}>{chipLabel}</Text>
                          </TouchableOpacity>
                        );
                      })(pfKeys[ci]);
                    }
                    return chips;
                  })()}
                </View>
              ) : null}

              {/* Chart or placeholder */}
              {hasRealChart ? (
                <View style={{ marginHorizontal: -6 }}>
                  <Sensitive>
                    <InteractiveChart
                      data={filteredChartData}
                      color="#0ea5e9"
                      height={120}
                      fontFamily={F.mono}
                      label="Evolução do patrimônio"
                      onTouchStateChange={setChartTouching}
                      overlays={(function() {
                        var ovs = [];
                        var pfKeys = Object.keys(pfHistories);
                        for (var ovi2 = 0; ovi2 < pfKeys.length; ovi2++) {
                          var pfKey2 = pfKeys[ovi2];
                          if (!visiblePfLines[pfKey2]) continue;
                          var ovColor = C.accent;
                          var ovLabel = 'Padrão';
                          if (pfKey2 !== '__null__') {
                            for (var pi4 = 0; pi4 < portfolios.length; pi4++) {
                              if (portfolios[pi4].id === pfKey2) {
                                ovLabel = portfolios[pi4].nome;
                                ovColor = portfolios[pi4].cor || C.accent;
                                break;
                              }
                            }
                          }
                          // Filter overlay data by chart period
                          var ovData = pfHistories[pfKey2];
                          if (chartPeriod !== 'ALL' && ovData.length > 0) {
                            var periodDef2 = PERIODS.find(function(p2) { return p2.key === chartPeriod; });
                            if (periodDef2 && periodDef2.days > 0) {
                              var cutoff2 = new Date();
                              cutoff2.setDate(cutoff2.getDate() - periodDef2.days);
                              var cutoffStr2 = cutoff2.toISOString().substring(0, 10);
                              ovData = ovData.filter(function(pt2) { return pt2.date >= cutoffStr2; });
                            }
                          }
                          if (ovData.length >= 2) {
                            ovs.push({ data: ovData, color: ovColor, label: ovLabel });
                          }
                        }
                        return ovs;
                      })()}
                    />
                  </Sensitive>
                </View>
              ) : (
                <View style={{
                  height: 70, justifyContent: 'center', alignItems: 'center',
                  backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 12,
                  borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)', borderStyle: 'dashed',
                }}>
                  <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', fontFamily: F.mono, textAlign: 'center' }}>
                    {patrimonioHistory.length < 2
                      ? 'Gráfico disponível com operações em datas diferentes'
                      : 'Sem dados no período selecionado'}
                  </Text>
                </View>
              )}
            </View>

            {/* Allocation bar + legend */}
            {totalAlloc > 0 ? (
              <View style={{ marginTop: 14 }}>
                <View style={{ flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.03)' }}>
                  {PKEYS.map(function (k, i) {
                    var pct = alloc[k] / totalAlloc * 100;
                    if (pct < 0.5) return null;
                    return (
                      <View key={k} style={{
                        flex: pct, height: 6, backgroundColor: P[k].color,
                        marginRight: i < PKEYS.length - 1 ? 1 : 0,
                      }} />
                    );
                  })}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {PKEYS.map(function (k) {
                    var pct = (alloc[k] / totalAlloc * 100);
                    if (pct < 0.5) return null;
                    return (
                      <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: P[k].color }} />
                        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: F.body }}>{P[k].short}</Text>
                        <Text style={[{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.6)', fontFamily: F.mono }, ps]}>{pct.toFixed(0)}%</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </View>
        </GlassCard>

        {/* KPI BAR — resumo compacto horizontal */}
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: rentAnoExpanded ? 0 : 14 }}>
          <TouchableOpacity activeOpacity={0.7} onPress={function() { animateLayout(); setRentAnoExpanded(!rentAnoExpanded); }}
            style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.035)', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: rentAnoExpanded ? C.accent + '40' : 'rgba(255,255,255,0.06)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 10, color: C.textSecondary, fontFamily: F.mono, letterSpacing: 0.5 }}>RENTAB. ANO</Text>
              <Ionicons name={rentAnoExpanded ? 'chevron-up' : 'chevron-down'} size={12} color={C.dim} />
            </View>
            <Text maxFontSizeMultiplier={1.5} style={[{ fontSize: 15, fontWeight: '800', color: rentAno > 0 ? C.green : (rentAno < 0 ? C.red : C.yellow), fontFamily: F.mono, marginTop: 2 }, ps]}>
              {(rentAno > 0 ? '+' : '') + rentAno.toFixed(2) + '%'}
            </Text>
          </TouchableOpacity>
          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.035)', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
            <Text style={{ fontSize: 10, color: C.textSecondary, fontFamily: F.mono, letterSpacing: 0.5 }}>POSIÇÕES</Text>
            <Text style={{ fontSize: 15, fontWeight: '800', color: C.text, fontFamily: F.mono, marginTop: 2 }}>
              {positions.length + rendaFixa.length}
            </Text>
          </View>
          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.035)', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
            <Text style={{ fontSize: 10, color: C.textSecondary, fontFamily: F.mono, letterSpacing: 0.5 }}>OPÇÕES</Text>
            <Text style={{ fontSize: 15, fontWeight: '800', color: P.opcao.color, fontFamily: F.mono, marginTop: 2 }}>
              {opsAtivas}
            </Text>
            {opsVenc7d > 0 ? (
              <Text style={{ fontSize: 10, color: C.red, fontFamily: F.mono }}>
                {opsVenc7d + ' vence em 7d'}
              </Text>
            ) : null}
          </View>
        </View>

        {/* RENT. ANO — breakdown mensal expandido */}
        {rentAnoExpanded && rentMeses.length > 0 ? (
          <View style={{ backgroundColor: 'rgba(255,255,255,0.025)', borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: C.accent + '20' }}>
            <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginBottom: 10 }}>
              {'RENTABILIDADE ' + new Date().getFullYear() + ' — MÊS A MÊS'}
            </Text>
            {rentMeses.map(function(rm, idx) {
              var barWidth = Math.min(Math.abs(rm.pct) * 3, 100);
              var barColor = rm.pct > 0 ? C.green : (rm.pct < 0 ? C.red : C.dim);
              var isCurrent = idx === rentMeses.length - 1;
              return (
                <View key={rm.mes} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={{ width: 32, fontSize: 11, color: isCurrent ? C.text : C.textSecondary, fontFamily: F.mono, fontWeight: isCurrent ? '700' : '400' }}>
                    {rm.mes}
                  </Text>
                  <View style={{ flex: 1, height: 14, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 4, overflow: 'hidden', marginHorizontal: 8 }}>
                    {rm.pct !== 0 ? (
                      <View style={{ width: barWidth + '%', height: 14, backgroundColor: barColor + '50', borderRadius: 4 }} />
                    ) : null}
                  </View>
                  <Text maxFontSizeMultiplier={1.5} style={[{ width: 56, textAlign: 'right', fontSize: 12, fontWeight: '700', color: barColor, fontFamily: F.mono }, ps]}>
                    {(rm.pct > 0 ? '+' : '') + rm.pct.toFixed(2) + '%'}
                  </Text>
                </View>
              );
            })}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
              <Text style={{ fontSize: 11, color: C.textSecondary, fontFamily: F.mono, fontWeight: '600' }}>ACUMULADO YTD</Text>
              <Text maxFontSizeMultiplier={1.5} style={[{ fontSize: 13, fontWeight: '800', color: rentAno > 0 ? C.green : (rentAno < 0 ? C.red : C.yellow), fontFamily: F.mono }, ps]}>
                {(rentAno > 0 ? '+' : '') + rentAno.toFixed(2) + '%'}
              </Text>
            </View>
          </View>
        ) : null}

        {/* RENDA DO MÊS — simplificado */}
        <GlassCard glow="rgba(108,92,231,0.10)">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: '600' }}>RENDA DO MÊS</Text>
            <TouchableOpacity onPress={function() { setInfoModal({ title: 'Renda do Mês', text: 'P&L de opções (prêmios - recompras) + dividendos/JCP + juros RF no mês. Opções mostra o P&L líquido, podendo ser negativo em meses com recompra.' }); }}>
              <Text style={{ fontSize: 13, color: C.accent }}>ⓘ</Text>
            </TouchableOpacity>
          </View>

          {/* Total grande + comparação vs anterior */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <Text maxFontSizeMultiplier={1.5} style={[{ fontSize: 26, fontWeight: '800', color: rendaTotalMes >= 0 ? '#22c55e' : '#ef4444', fontFamily: F.display }, ps]}>
              {fmt(rendaTotalMes)}
            </Text>
            {rendaCompare ? (
              <View style={{
                backgroundColor: (rendaBetter ? '#22c55e' : '#ef4444') + '15',
                borderWidth: 1,
                borderColor: (rendaBetter ? '#22c55e' : '#ef4444') + '30',
                borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
                alignItems: 'flex-end',
              }}>
                <Text style={[{ fontSize: 11, fontWeight: '700', color: rendaBetter ? '#22c55e' : '#ef4444', fontFamily: F.mono }, ps]}>
                  {rendaCompare}
                </Text>
                {rendaAnteriorLabel ? (
                  <Text style={[{ fontSize: 9, color: C.dim, fontFamily: F.mono, marginTop: 1 }, ps]}>
                    {rendaAnteriorLabel}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>

          {/* Discriminação por categoria */}
          <View style={{ gap: 10, marginBottom: 14 }}>

            {/* ── Dividendos ── */}
            {dividendosMes > 0 || dividendosMesAnterior > 0 ? (
              <View style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={{ fontSize: 12, color: C.text, fontFamily: F.display, fontWeight: '700' }}>Dividendos</Text>
                  <Text maxFontSizeMultiplier={1.5} style={[{ fontSize: 15, fontWeight: '800', color: dividendosMes > 0 ? '#22c55e' : C.dim, fontFamily: F.mono }, ps]}>
                    {fmt(dividendosMes)}
                  </Text>
                </View>
                {dividendosMesAnterior > 0 ? (function() {
                  var divUp = dividendosMes >= dividendosMesAnterior;
                  var divPct = dividendosMesAnterior > 0 ? ((dividendosMes - dividendosMesAnterior) / dividendosMesAnterior) * 100 : 0;
                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <View style={{ backgroundColor: (divUp ? '#22c55e' : '#ef4444') + '15', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={[{ fontSize: 10, fontWeight: '700', color: divUp ? '#22c55e' : '#ef4444', fontFamily: F.mono }, ps]}>
                          {(divPct > 0 ? '+' : '') + divPct.toFixed(0) + '%'}
                        </Text>
                      </View>
                      <Text style={[{ fontSize: 10, color: C.dim, fontFamily: F.mono }, ps]}>
                        {'Ant: ' + fmt(dividendosMesAnterior)}
                      </Text>
                    </View>
                  );
                })() : null}
                <View style={{ gap: 4 }}>
                  {[
                    { key: 'acao', label: 'Ações', color: P.acao.color, val: dividendosCatMes.acao, cats: ['acao'] },
                    { key: 'fii', label: 'FIIs', color: P.fii.color, val: dividendosCatMes.fii, cats: ['fii'] },
                    { key: 'etf', label: 'ETFs', color: P.etf.color, val: dividendosCatMes.etf, cats: ['etf'] },
                    { key: 'stock_int', label: 'Stocks', color: P.stock_int.color, val: dividendosCatMes.stock_int, cats: ['stock_int'] },
                    { key: 'bdr', label: 'BDRs/ADRs/REITs', color: P.bdr.color, val: (dividendosCatMes.bdr || 0) + (dividendosCatMes.adr || 0) + (dividendosCatMes.reit || 0), cats: ['bdr', 'adr', 'reit'] },
                  ].map(function(catItem) {
                    if (catItem.val <= 0) return null;
                    var isExp = expandedRendaCat === catItem.key;
                    var catProvs = isExp ? getProvsByCat(catItem.cats) : [];
                    return (
                      <View key={catItem.key}>
                        <TouchableOpacity
                          onPress={function() { animateLayout(); setExpandedRendaCat(isExp ? null : catItem.key); }}
                          activeOpacity={0.7}
                          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: catItem.color }} />
                            <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.body }}>{catItem.label}</Text>
                            <Ionicons name={isExp ? 'chevron-up' : 'chevron-down'} size={10} color={C.dim} />
                          </View>
                          <Text maxFontSizeMultiplier={1.5} style={[{ fontSize: 12, fontWeight: '700', color: '#22c55e', fontFamily: F.mono }, ps]}>{fmt(catItem.val)}</Text>
                        </TouchableOpacity>
                        {isExp && catProvs.length > 0 ? (
                          <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: 8, marginTop: 4, marginBottom: 4, gap: 6 }}>
                            {catProvs.map(function(p, idx) {
                              return (
                                <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 11, color: C.text, fontFamily: F.display, fontWeight: '600' }}>{p.ticker}</Text>
                                    <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>
                                      {(p.corretora || '') + (p.data_pagamento ? '  ' + isoToBr(p.data_pagamento) : '')}
                                    </Text>
                                  </View>
                                  <Text maxFontSizeMultiplier={1.5} style={[{ fontSize: 11, fontWeight: '700', color: '#22c55e', fontFamily: F.mono }, ps]}>
                                    {fmt(p.valor)}
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* ── Prêmios de Opções ── */}
            {plMes !== 0 || premiosMesAnterior !== 0 || opsAtivas > 0 ? (
              <View style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: premiosMes > 0 || recompraMes > 0 ? 6 : 0 }}>
                  <Text style={{ fontSize: 12, color: C.text, fontFamily: F.display, fontWeight: '700' }}>Prêmios de Opções</Text>
                  <Text maxFontSizeMultiplier={1.5} style={[{ fontSize: 15, fontWeight: '800', color: plMes >= 0 ? '#22c55e' : '#ef4444', fontFamily: F.mono }, ps]}>
                    {fmt(plMes)}
                  </Text>
                </View>
                {premiosMesAnterior !== 0 ? (function() {
                  var plUp = plMes >= premiosMesAnterior;
                  var plPctComp = Math.abs(premiosMesAnterior) > 0 ? ((plMes - premiosMesAnterior) / Math.abs(premiosMesAnterior)) * 100 : 0;
                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <View style={{ backgroundColor: (plUp ? '#22c55e' : '#ef4444') + '15', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={[{ fontSize: 10, fontWeight: '700', color: plUp ? '#22c55e' : '#ef4444', fontFamily: F.mono }, ps]}>
                          {(plPctComp > 0 ? '+' : '') + plPctComp.toFixed(0) + '%'}
                        </Text>
                      </View>
                      <Text style={[{ fontSize: 10, color: C.dim, fontFamily: F.mono }, ps]}>
                        {'Ant: ' + fmt(premiosMesAnterior)}
                      </Text>
                    </View>
                  );
                })() : null}
                {premiosMes > 0 || recompraMes > 0 ? (
                  <View style={{ gap: 4 }}>
                    {premiosMes > 0 ? (
                      <View>
                        <TouchableOpacity
                          onPress={function() { animateLayout(); setExpandedRendaCat(expandedRendaCat === 'premios' ? null : 'premios'); }}
                          activeOpacity={0.7}
                          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 2 }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' }} />
                            <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.body }}>Prêmios</Text>
                            <Ionicons name={expandedRendaCat === 'premios' ? 'chevron-up' : 'chevron-down'} size={10} color={C.dim} />
                          </View>
                          <Text maxFontSizeMultiplier={1.5} style={[{ fontSize: 12, fontWeight: '700', color: '#22c55e', fontFamily: F.mono }, ps]}>{fmt(premiosMes)}</Text>
                        </TouchableOpacity>
                        {expandedRendaCat === 'premios' && premiosMesDetalhe.length > 0 ? (
                          <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: 8, marginTop: 4, marginBottom: 4, gap: 6 }}>
                            {premiosMesDetalhe.map(function(p, idx) {
                              return (
                                <View key={idx} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 11, color: C.text, fontFamily: F.display, fontWeight: '600' }}>
                                      {p.ticker + ' ' + (p.ticker_opcao || '')}
                                    </Text>
                                    <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>
                                      {(p.tipo_opcao || '') + '  ' + (p.corretora || '')}
                                    </Text>
                                  </View>
                                  <Text maxFontSizeMultiplier={1.5} style={[{ fontSize: 11, fontWeight: '700', color: '#22c55e', fontFamily: F.mono }, ps]}>
                                    {fmt(p.valor)}
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                    {recompraMes > 0 ? (
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#ef4444' }} />
                          <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.body }}>Recompras</Text>
                        </View>
                        <Text maxFontSizeMultiplier={1.5} style={[{ fontSize: 12, fontWeight: '700', color: '#ef4444', fontFamily: F.mono }, ps]}>{'-' + fmt(recompraMes)}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* ── Renda Fixa ── */}
            {rendaFixa.length > 0 || rfRendaMensal > 0 ? (
              <View style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: C.text, fontFamily: F.display, fontWeight: '700' }}>Renda Fixa</Text>
                  <Text maxFontSizeMultiplier={1.5} style={[{ fontSize: 15, fontWeight: '800', color: rfRendaMensal > 0 ? '#22c55e' : C.dim, fontFamily: F.mono }, ps]}>
                    {fmt(rfRendaMensal)}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>

          {/* ── Combinado (Dividendos + Prêmios) ── */}
          {(dividendosMes > 0 || plMes !== 0 || dividendosMesAnterior > 0 || premiosMesAnterior !== 0) ? (
            <View style={{ backgroundColor: C.accent + '10', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: C.accent + '20', marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Text style={{ fontSize: 12, color: C.accent, fontFamily: F.display, fontWeight: '700' }}>Dividendos + Opções</Text>
                <Text maxFontSizeMultiplier={1.5} style={[{ fontSize: 17, fontWeight: '800', color: (dividendosMes + plMes) >= 0 ? '#22c55e' : '#ef4444', fontFamily: F.mono }, ps]}>
                  {fmt(dividendosMes + plMes)}
                </Text>
              </View>
              {dividendosMesAnterior > 0 || Math.abs(plMesAnterior) > 0 ? (function() {
                var combAnterior = dividendosMesAnterior + plMesAnterior;
                var combAtual = dividendosMes + plMes;
                var combPct = Math.abs(combAnterior) > 0 ? ((combAtual - combAnterior) / Math.abs(combAnterior)) * 100 : 0;
                var combUp = combAtual >= combAnterior;
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {combPct !== 0 ? (
                      <View style={{ backgroundColor: (combUp ? '#22c55e' : '#ef4444') + '15', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={[{ fontSize: 10, fontWeight: '700', color: combUp ? '#22c55e' : '#ef4444', fontFamily: F.mono }, ps]}>
                          {(combPct > 0 ? '+' : '') + combPct.toFixed(0) + '% vs ant.'}
                        </Text>
                      </View>
                    ) : null}
                    <Text style={[{ fontSize: 10, color: C.dim, fontFamily: F.mono }, ps]}>
                      {'Ant: ' + fmt(combAnterior)}
                    </Text>
                  </View>
                );
              })() : null}
            </View>
          ) : null}

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: 14 }} />

          {/* META MENSAL inline */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono, letterSpacing: 1.2, fontWeight: '600', marginBottom: 6 }}>
                META MENSAL
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text style={[{ fontSize: 18, fontWeight: '800', color: C.accent, fontFamily: F.display }, ps]}>
                  {fmt(rendaTotalMes)}
                </Text>
                <Text style={[{ fontSize: 12, color: 'rgba(255,255,255,0.25)', fontFamily: F.display, marginLeft: 4 }, ps]}>
                  / {fmt(meta)}
                </Text>
              </View>
              {(plMes !== 0 || dividendosMes > 0 || rfRendaMensal > 0) ? (
                <Text style={[{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: F.mono, marginTop: 3 }, ps]}>
                  {'P&L Opções ' + fmt(plMes) + ' + Div ' + fmt(dividendosMes) + ' + RF ' + fmt(rfRendaMensal)}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                <Text maxFontSizeMultiplier={1.5} style={[{ fontSize: 14, color: rendaMediaAnual >= meta ? '#22c55e' : 'rgba(255,255,255,0.45)', fontFamily: F.mono, fontWeight: '700' }, ps]}>
                  {'Média ' + new Date().getFullYear() + ': ' + fmt(rendaMediaAnual) + '/mês'}
                </Text>
                <TouchableOpacity onPress={function() { setInfoModal({ title: 'Média Anual', text: 'Média calculada com base nos meses completos do ano. O mês atual (incompleto) não entra no denominador para não distorcer o resultado.' }); }}>
                  <Text style={{ fontSize: 12, color: C.accent }}>ⓘ</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={[{
                fontSize: 22, fontWeight: '800', fontFamily: F.mono,
                color: metaPct >= 100 ? '#22c55e' : metaPct >= 50 ? '#f59e0b' : C.accent,
              }, ps]}>{metaPct.toFixed(0)}%</Text>
              <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: F.mono, letterSpacing: 0.5, marginTop: 2 }}>DA META</Text>
            </View>
          </View>
          <View style={{ height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.03)', marginTop: 10, overflow: 'hidden' }}>
            <LinearGradient
              colors={[C.accent, metaPct >= 100 ? '#22c55e' : '#f59e0b']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ height: 5, borderRadius: 3, width: Math.min(metaPct, 100) + '%' }}
            />
          </View>
          {metaPct < 100 && metaPct > 0 ? (
            <Text style={[{ fontSize: 11, color: 'rgba(255,255,255,0.25)', fontFamily: F.mono, textAlign: 'right', marginTop: 5 }, ps]}>
              {'Faltam ' + fmt(meta - rendaTotalMes) + ' da meta mensal'}
            </Text>
          ) : null}

          {/* Projecao anual + Streak */}
          {(function() {
            var projecaoAnual = rendaMediaAnual * 12;
            var rendaByMonth = data.rendaAnualByMonth || {};
            var anoCorrente = new Date().getFullYear();
            var mesCorrente = new Date().getMonth(); // 0-indexed

            // Calcular streak: meses consecutivos que atingiram a meta (de tras pra frente)
            var streak = 0;
            for (var si = mesCorrente - 1; si >= 0; si--) {
              var mKey = anoCorrente + '-' + String(si + 1).padStart(2, '0');
              var mVal = rendaByMonth[mKey] || 0;
              if (mVal >= meta) {
                streak++;
              } else {
                break;
              }
            }

            if (projecaoAnual <= 0 && streak <= 0) return null;

            return (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {projecaoAnual > 0 ? (
                  <View style={{ backgroundColor: C.accent + '15', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="trending-up" size={12} color={C.accent} />
                    <Text style={[{ fontSize: 11, fontFamily: F.mono, color: C.accent }, ps]}>
                      {'Projeção ' + anoCorrente + ': ' + fmt(projecaoAnual)}
                    </Text>
                  </View>
                ) : null}
                {streak >= 2 ? (
                  <View style={{ backgroundColor: '#22c55e15', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 12 }}>{'🔥'}</Text>
                    <Text style={{ fontSize: 11, fontFamily: F.mono, color: '#22c55e', fontWeight: '700' }}>
                      {streak + ' meses seguidos'}
                    </Text>
                  </View>
                ) : null}
                {rendaMediaAnual >= meta && meta > 0 ? (
                  <View style={{ backgroundColor: '#22c55e15', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="checkmark-circle" size={12} color="#22c55e" />
                    <Text style={{ fontSize: 11, fontFamily: F.mono, color: '#22c55e', fontWeight: '700' }}>
                      Meta atingida na média!
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })()}
        </GlassCard>

        {/* FINANÇAS DO MÊS */}
        {financasSummary && financasSummary.total > 0 ? (
          <GlassCard glow="rgba(16,185,129,0.06)">
            <SLabel right={
              <TouchableOpacity onPress={function() { setInfoModal({ title: 'Finanças do Mês', text: 'Resumo das suas movimentações pessoais do mês atual. Valores de investimento são excluídos.' }); }}>
                <Text style={{ fontSize: 13, color: C.accent }}>ⓘ</Text>
              </TouchableOpacity>
            }>FINANÇAS DO MÊS</SLabel>

            {/* Entradas / Saídas lado a lado */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, color: C.textSecondary, fontFamily: F.body, marginBottom: 2 }}>Entradas</Text>
                <Sensitive><Text maxFontSizeMultiplier={1.5} style={[{ fontSize: 18, fontWeight: '700', color: C.green, fontFamily: F.mono }, ps]}>{fmt(financasSummary.totalEntradasPessoais)}</Text></Sensitive>
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 11, color: C.textSecondary, fontFamily: F.body, marginBottom: 2 }}>Saídas</Text>
                <Sensitive><Text maxFontSizeMultiplier={1.5} style={[{ fontSize: 18, fontWeight: '700', color: C.red, fontFamily: F.mono }, ps]}>{fmt(financasSummary.totalSaidasPessoais)}</Text></Sensitive>
              </View>
            </View>

            {/* Saldo pessoal */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
              <Text style={{ fontSize: 12, color: C.textSecondary, fontFamily: F.body }}>Saldo pessoal</Text>
              <Sensitive><Text maxFontSizeMultiplier={1.5} style={[{ fontSize: 16, fontWeight: '700', color: financasSummary.saldoPessoal >= 0 ? C.green : C.red, fontFamily: F.mono }, ps]}>{(financasSummary.saldoPessoal >= 0 ? '+' : '') + fmt(financasSummary.saldoPessoal)}</Text></Sensitive>
            </View>

            {/* Top 4 grupos despesa */}
            {(function() {
              var grupoKeys = Object.keys(financasSummary.porGrupo);
              var grupoArr = [];
              for (var gi = 0; gi < grupoKeys.length; gi++) {
                grupoArr.push({ k: grupoKeys[gi], v: financasSummary.porGrupo[grupoKeys[gi]] });
              }
              grupoArr.sort(function(a, b) { return b.v - a.v; });
              var top4 = grupoArr.slice(0, 4);
              if (top4.length === 0) return null;
              return (
                <View style={{ marginBottom: financasCartao ? 12 : 4 }}>
                  <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: F.mono, letterSpacing: 0.8, marginBottom: 8 }}>TOP DESPESAS</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {top4.map(function(g) {
                      var meta = finCats.getGrupoMeta(g.k);
                      var pct = financasSummary.totalSaidasPessoais > 0 ? Math.round((g.v / financasSummary.totalSaidasPessoais) * 100) : 0;
                      return (
                        <View key={g.k} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: (meta.color || C.accent) + '15', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 }}>
                          <Ionicons name={meta.icon || 'ellipse-outline'} size={12} color={meta.color || C.accent} style={{ marginRight: 4 }} />
                          <Text style={{ fontSize: 11, fontFamily: F.body, color: C.text, marginRight: 4 }}>{meta.label}</Text>
                          <Sensitive><Text style={[{ fontSize: 11, fontFamily: F.mono, color: C.textSecondary }, ps]}>{fmt(g.v)}</Text></Sensitive>
                          <Text style={{ fontSize: 9, fontFamily: F.mono, color: C.textTertiary || '#666688', marginLeft: 3 }}>{pct + '%'}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })()}

            {/* Cartão principal — fatura */}
            {financasCartao ? (
              <View style={{ paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="card-outline" size={14} color={C.accent} />
                    <Text style={{ fontSize: 12, fontFamily: F.body, color: C.text }}>{financasCartao.nome}</Text>
                  </View>
                  <Sensitive><Text maxFontSizeMultiplier={1.5} style={[{ fontSize: 14, fontWeight: '700', fontFamily: F.mono, color: C.red }, ps]}>{'R$ ' + fmt(financasCartao.faturaTotal)}</Text></Sensitive>
                </View>
                {financasCartao.vencimento ? (
                  <Text style={{ fontSize: 11, fontFamily: F.mono, color: (function() {
                    var venc = new Date(financasCartao.vencimento + 'T12:00:00');
                    var hoje = new Date();
                    var diffDias = Math.ceil((venc - hoje) / (1000 * 60 * 60 * 24));
                    if (diffDias < 5) return C.red;
                    if (diffDias < 10) return C.yellow || '#F59E0B';
                    return C.textSecondary;
                  })(), marginTop: 4, textAlign: 'right' }}>
                    {'Vence ' + new Date(financasCartao.vencimento + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {/* Ver detalhes */}
            <TouchableOpacity
              onPress={function() { navigation.navigate('MainTabs', { screen: 'Carteira', params: { initialTab: 'financas' } }); }}
              activeOpacity={0.7}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingTop: 12, marginTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}
            >
              <Text style={{ fontSize: 12, fontFamily: F.display, color: C.accent }}>Ver detalhes</Text>
              <Ionicons name="chevron-forward" size={14} color={C.accent} style={{ marginLeft: 2 }} />
            </TouchableOpacity>
          </GlassCard>
        ) : null}

        {/* ALERTAS */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: '600' }}>ALERTAS</Text>
            <TouchableOpacity onPress={function() { setInfoModal({ title: 'Alertas', text: 'Avisos automáticos sobre vencimentos, opções descobertas e eventos da carteira.' }); }}>
              <Text style={{ fontSize: 13, color: C.accent }}>ⓘ</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono }}>
            {alerts.length} {alerts.length === 1 ? 'novo' : 'novos'}
          </Text>
        </View>
        {(function() {
          var criticalAlerts = [];
          var infoAlerts = [];
          for (var ai = 0; ai < alerts.length; ai++) {
            var al = alerts[ai];
            if (al.type === 'critico' || al.type === 'warning' || al.detailType || al._faturaNav) {
              criticalAlerts.push(al);
            } else {
              infoAlerts.push(al);
            }
          }
          var showCollapse = alerts.length > 2 && infoAlerts.length > 0;
          var visibleAlerts = showCollapse && !alertsExpanded ? criticalAlerts : alerts;

          return (
            <View>
              {visibleAlerts.map(function(a, i) {
                var alertOnPress = null;
                if (a.detailType === 'proventos' && phDetailData) {
                  alertOnPress = function() {
                    setInfoModal({ title: 'Proventos Pagos Hoje', detailType: 'proventos', detail: phDetailData });
                  };
                }
                if (a._faturaNav) {
                  alertOnPress = (function(nav) {
                    return function() {
                      navigation.navigate('Fatura', { cartaoId: nav.cartaoId, cartao: nav.cartao });
                    };
                  })(a._faturaNav);
                }
                return <AlertRow key={i} type={a.type} title={a.title} desc={a.desc} badge={a.badge} onPress={alertOnPress} ps={ps} />;
              })}
              {showCollapse ? (
                <TouchableOpacity onPress={function() { setAlertsExpanded(!alertsExpanded); }}
                  style={{ alignItems: 'center', paddingVertical: 6, marginBottom: 8 }}>
                  <Text style={{ fontSize: 11, color: C.accent, fontFamily: F.body, fontWeight: '600' }}>
                    {alertsExpanded ? 'Mostrar menos' : infoAlerts.length + (infoAlerts.length === 1 ? ' alerta' : ' alertas') + ' info ▾'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })()}

        {/* PRÓXIMOS EVENTOS */}
        {eventos.length > 0 ? (
          <GlassCard glow="rgba(236,72,153,0.06)">
            <SLabel right={
              <Text style={{ fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.35)', fontFamily: F.mono }}>
                {Math.min(eventos.length, 5) + ' de ' + eventos.length}
              </Text>
            }>AGENDA</SLabel>
            {eventos.slice(0, 5).map(function (e, i) {
              return (
                <CalItem key={i} dia={e.dia} diaSemana={e.diaSemana}
                  titulo={e.titulo} detalhe={e.detalhe} tipo={e.tipo}
                  last={i === Math.min(eventos.length, 5) - 1}
                />
              );
            })}
          </GlassCard>
        ) : null}

        {/* RESUMO SEMANAL IA */}
        {sub.canAccess('AI_SUMMARY') ? (
          <GlassCard glow="rgba(108,92,231,0.08)">
            {/* Header */}
            <TouchableOpacity activeOpacity={0.8} onPress={function() {
              if (autoSummary && !autoSummary.lido) {
                markSummaryRead(autoSummary.id).catch(function() {});
                var updated = {};
                var sKeys = Object.keys(autoSummary);
                for (var sk = 0; sk < sKeys.length; sk++) { updated[sKeys[sk]] = autoSummary[sKeys[sk]]; }
                updated.lido = true;
                setAutoSummary(updated);
              }
              setSummaryExpanded(!summaryExpanded);
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="sparkles" size={16} color={C.accent} />
                  <Text style={{ fontSize: 13, fontFamily: F.display, color: C.accent, marginLeft: 6 }}>Resumo Semanal IA</Text>
                  {autoSummary && !autoSummary.lido ? (
                    <View style={{ backgroundColor: C.accent, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, marginLeft: 8 }}>
                      <Text style={{ fontSize: 9, fontFamily: F.display, color: '#fff' }}>NOVO</Text>
                    </View>
                  ) : null}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {autoSummary && autoSummary.created_at ? (
                    <Text style={{ fontSize: 10, fontFamily: F.mono, color: C.dim, marginRight: 4 }}>
                      {new Date(autoSummary.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                    </Text>
                  ) : null}
                  <Ionicons name={summaryExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={C.dim} />
                </View>
              </View>
            </TouchableOpacity>

            {/* Teaser (collapsed) */}
            {!summaryExpanded && autoSummary && autoSummary.teaser ? (
              <Text style={{ fontSize: 12, fontFamily: F.body, color: C.textSecondary, marginTop: 6 }} numberOfLines={2}>
                {autoSummary.teaser}
              </Text>
            ) : null}

            {/* Empty state */}
            {!autoSummary && !summaryExpanded ? (
              <Text style={{ fontSize: 12, fontFamily: F.body, color: C.dim, marginTop: 6 }}>
                Nenhum resumo disponível ainda. O primeiro será gerado na sexta às 18h.
              </Text>
            ) : null}

            {/* Conteúdo expandido */}
            {summaryExpanded && autoSummary ? (
              <View style={{ marginTop: 12 }}>
                {autoSummary.resumo ? (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 11, fontFamily: F.mono, color: C.dim, letterSpacing: 0.8, marginBottom: 4 }}>RESUMO</Text>
                    <Text style={{ fontSize: 13, fontFamily: F.body, color: C.text, lineHeight: 20 }}>{autoSummary.resumo}</Text>
                  </View>
                ) : null}
                {autoSummary.acoes_urgentes ? (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 11, fontFamily: F.mono, color: C.yellow, letterSpacing: 0.8, marginBottom: 4 }}>AÇÕES URGENTES</Text>
                    <Text style={{ fontSize: 13, fontFamily: F.body, color: C.text, lineHeight: 20 }}>{autoSummary.acoes_urgentes}</Text>
                  </View>
                ) : null}
                {autoSummary.dica_do_dia ? (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 11, fontFamily: F.mono, color: C.green, letterSpacing: 0.8, marginBottom: 4 }}>DICA DO DIA</Text>
                    <Text style={{ fontSize: 13, fontFamily: F.body, color: C.text, lineHeight: 20 }}>{autoSummary.dica_do_dia}</Text>
                  </View>
                ) : null}

                {/* Próxima análise */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
                  <Ionicons name="time-outline" size={13} color={C.dim} />
                  <Text style={{ fontSize: 11, fontFamily: F.body, color: C.dim, marginLeft: 4 }}>
                    {'Próxima análise: ' + (function() {
                      var now = new Date();
                      var brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
                      var h = brt.getUTCHours();
                      var dow = brt.getUTCDay();
                      var next = new Date(brt);
                      if (h >= 18 || dow === 0 || dow === 6) {
                        next.setUTCDate(next.getUTCDate() + 1);
                      }
                      while (next.getUTCDay() === 0 || next.getUTCDay() === 6) {
                        next.setUTCDate(next.getUTCDate() + 1);
                      }
                      next.setUTCHours(18, 0, 0, 0);
                      var nextUtc = new Date(next.getTime() + 3 * 60 * 60 * 1000);
                      var dias = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
                      return dias[nextUtc.getDay()] + ', ' + nextUtc.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' às 18h';
                    })()}
                  </Text>
                </View>

                {/* Últimas análises */}
                {pastSummaries.length > 0 ? (
                  <View>
                    <TouchableOpacity activeOpacity={0.7} onPress={function() { setShowPastSummaries(!showPastSummaries); setExpandedPastId(null); }}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="document-text-outline" size={13} color={C.dim} />
                        <Text style={{ fontSize: 11, fontFamily: F.body, color: C.dim, marginLeft: 4 }}>
                          {'Últimas análises (' + pastSummaries.length + ')'}
                        </Text>
                      </View>
                      <Ionicons name={showPastSummaries ? 'chevron-up' : 'chevron-down'} size={12} color={C.dim} />
                    </TouchableOpacity>
                    {showPastSummaries ? pastSummaries.map(function(ps) {
                      var isExp = expandedPastId === ps.id;
                      var dt = ps.created_at ? new Date(ps.created_at) : null;
                      var dtLabel = dt ? dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
                      return (
                        <TouchableOpacity key={ps.id} activeOpacity={0.7} onPress={function() { setExpandedPastId(isExp ? null : ps.id); }}
                          style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 10, marginTop: 6 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={{ fontSize: 12, fontFamily: F.body, color: C.textSecondary, flex: 1 }} numberOfLines={1}>
                              {ps.teaser || 'Resumo de ' + dtLabel}
                            </Text>
                            <Text style={{ fontSize: 10, fontFamily: F.mono, color: C.dim, marginLeft: 8 }}>{dtLabel}</Text>
                          </View>
                          {isExp ? (
                            <View style={{ marginTop: 8 }}>
                              {ps.resumo ? (
                                <View style={{ marginBottom: 8 }}>
                                  <Text style={{ fontSize: 10, fontFamily: F.mono, color: C.dim, letterSpacing: 0.8, marginBottom: 3 }}>RESUMO</Text>
                                  <Text style={{ fontSize: 12, fontFamily: F.body, color: C.text, lineHeight: 18 }}>{ps.resumo}</Text>
                                </View>
                              ) : null}
                              {ps.acoes_urgentes ? (
                                <View style={{ marginBottom: 8 }}>
                                  <Text style={{ fontSize: 10, fontFamily: F.mono, color: C.yellow, letterSpacing: 0.8, marginBottom: 3 }}>AÇÕES URGENTES</Text>
                                  <Text style={{ fontSize: 12, fontFamily: F.body, color: C.text, lineHeight: 18 }}>{ps.acoes_urgentes}</Text>
                                </View>
                              ) : null}
                              {ps.dica_do_dia ? (
                                <View>
                                  <Text style={{ fontSize: 10, fontFamily: F.mono, color: C.green, letterSpacing: 0.8, marginBottom: 3 }}>DICA DO DIA</Text>
                                  <Text style={{ fontSize: 12, fontFamily: F.body, color: C.text, lineHeight: 18 }}>{ps.dica_do_dia}</Text>
                                </View>
                              ) : null}
                            </View>
                          ) : null}
                        </TouchableOpacity>
                      );
                    }) : null}
                  </View>
                ) : null}

                {/* Botão Análise da Carteira */}
                {sub.canAccess('AI_ANALYSIS') ? (
                  <TouchableOpacity activeOpacity={0.7} onPress={function() { setAiConfirmVisible(true); }}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                      paddingVertical: 10, borderRadius: 10, marginTop: 10,
                      backgroundColor: 'rgba(108,92,231,0.12)', borderWidth: 1, borderColor: 'rgba(108,92,231,0.25)',
                    }}>
                    <Ionicons name="analytics-outline" size={15} color={C.accent} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: C.accent, fontFamily: F.display }}>Análise da Carteira</Text>
                    <Text style={{ fontSize: 10, color: 'rgba(108,92,231,0.6)', fontFamily: F.body }}>sob demanda</Text>
                  </TouchableOpacity>
                ) : null}

                {/* Ver análises salvas */}
                {sub.canAccess('SAVED_ANALYSES') ? (
                  <TouchableOpacity activeOpacity={0.7} onPress={function() { navigation.navigate('AnalisesSalvas'); }}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
                      paddingVertical: 8, borderRadius: 8, marginTop: 6,
                    }}>
                    <Ionicons name="bookmark-outline" size={13} color={C.dim} />
                    <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.body }}>Ver análises salvas</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </GlassCard>
        ) : null}

        <View style={{ height: SIZE.tabBarHeight + 140 }} />
      </ScrollView>

      {/* FAB */}
      <Fab navigation={navigation} />

      {/* AI Confirm Modal */}
      <AiConfirmModal
        visible={aiConfirmVisible}
        navigation={navigation}
        analysisType="Resumo da carteira"
        onCancel={function() { setAiConfirmVisible(false); }}
        onConfirm={function() { setAiConfirmVisible(false); handleAiResumo(); }}
      />

      {/* AI Modal */}
      <AiAnalysisModal
        visible={aiModalVisible}
        onClose={function() { setAiModalVisible(false); }}
        result={aiResult}
        loading={aiLoading}
        error={aiError}
        type="resumo"
        title="Resumo Inteligente"
        usage={aiUsage}
        onSave={sub.canAccess('SAVED_ANALYSES') ? handleSaveAiResumo : undefined}
        saving={aiSaving}
      />

      <Modal visible={infoModal !== null} animationType="fade" transparent={true}
        onRequestClose={function() { setInfoModal(null); }}>
        <TouchableOpacity activeOpacity={1} onPress={function() { setInfoModal(null); }}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <TouchableOpacity activeOpacity={1}
            style={{ backgroundColor: '#12121e', borderRadius: 14, padding: 20, maxWidth: 380, width: '100%', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
            <Text style={{ fontSize: 13, color: C.text, fontFamily: F.display, fontWeight: '700', marginBottom: 10 }}>
              {infoModal && infoModal.title || ''}
            </Text>
            {infoModal && infoModal.detailType === 'proventos' && infoModal.detail ? (
              <View style={{ gap: 12 }}>
                {Object.keys(infoModal.detail.tickers).map(function(tk) {
                  var tkData = infoModal.detail.tickers[tk];
                  var tipoLabel = tkData.tipo === 'jcp' ? 'JCP' : tkData.tipo === 'rendimento' ? 'Rendimento' : 'Dividendo';
                  var corrKeys = Object.keys(tkData.corretoras);
                  return (
                    <View key={tk} style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 12 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: C.text, fontFamily: F.display }}>{tk}</Text>
                          <View style={{ backgroundColor: '#22c55e18', borderWidth: 1, borderColor: '#22c55e40', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 9, fontWeight: '700', color: '#22c55e', fontFamily: F.mono }}>{tipoLabel}</Text>
                          </View>
                        </View>
                        <Text style={[{ fontSize: 14, fontWeight: '800', color: '#22c55e', fontFamily: F.mono }, ps]}>
                          {'R$ ' + fmt(tkData.total)}
                        </Text>
                      </View>
                      <Text style={[{ fontSize: 10, color: C.sub, fontFamily: F.mono, marginBottom: 4 }, ps]}>
                        {tkData.qty + ' cotas × R$ ' + fmt(tkData.vpc) + '/cota'}
                      </Text>
                      {corrKeys.length > 0 ? (
                        <View style={{ gap: 4, marginTop: 4 }}>
                          <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', fontFamily: F.mono, letterSpacing: 0.8 }}>POR CORRETORA</Text>
                          {corrKeys.map(function(corr) {
                            var corrData = tkData.corretoras[corr];
                            return (
                              <View key={corr} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                  <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.body }}>{corr}</Text>
                                  <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontFamily: F.mono }}>
                                    {'(' + corrData.qty + ' cotas)'}
                                  </Text>
                                </View>
                                <Text style={[{ fontSize: 12, fontWeight: '700', color: '#22c55e', fontFamily: F.mono }, ps]}>
                                  {'R$ ' + fmt(corrData.valor)}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
                <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.text, fontFamily: F.display }}>Total</Text>
                  <Text style={[{ fontSize: 16, fontWeight: '800', color: '#22c55e', fontFamily: F.mono }, ps]}>
                    {'R$ ' + fmt(infoModal.detail.total)}
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body, lineHeight: 18 }}>
                {infoModal && infoModal.text || ''}
              </Text>
            )}
            <TouchableOpacity onPress={function() { setInfoModal(null); }}
              style={{ marginTop: 14, alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 8, borderRadius: 8, backgroundColor: C.accent }}>
              <Text style={{ fontSize: 12, color: C.text, fontFamily: F.mono, fontWeight: '600' }}>Fechar</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Share Card */}
      <ShareCard
        visible={showShare}
        onClose={function() { setShowShare(false); }}
        patrimonio={patrimonio}
        rendaMes={rendaTotalMes}
        metaPct={metaPct}
        varMes={rentabilidadeMes}
        dividendosMes={dividendosMes}
        premiosMes={premiosMes}
      />
    </View>
  );
}

var st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a14' },
  scroll: { padding: PAD, paddingBottom: 0 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginTop: -10, paddingBottom: 10, marginBottom: 10,
  },
  syncBadge: {
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
  },
  heroLabel: {
    fontSize: 12, color: 'rgba(255,255,255,0.35)',
    letterSpacing: 1.5, fontWeight: '600', fontFamily: F.mono,
  },
  heroPrefix: {
    fontSize: 18, fontWeight: '600', color: 'rgba(255,255,255,0.6)', fontFamily: F.display,
  },
  heroValue: {
    fontSize: 32, fontWeight: '800', color: '#fff', fontFamily: F.display, letterSpacing: -1,
  },
  heroCents: {
    fontSize: 18, fontWeight: '600', color: 'rgba(255,255,255,0.3)', fontFamily: F.display,
  },
});
