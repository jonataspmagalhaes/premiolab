// AppStoreContext — store de dados de negocio centralizado.
// Fase C da reconstrucao. Antes dessa fase, cada tela chamava
// getDashboard/getPositions/getProventos independentemente → triplo fetch.
//
// Uso:
//   import { useIncome, useCarteira, useRefresh } from '../contexts/AppStoreContext';
//   function MyScreen() {
//     var _i = useIncome(); var forecast = _i.forecast; var score = _i.score;
//     ...
//   }
//
// Regras:
//   - Telas NAO chamam services diretamente. Consomem via hooks.
//   - Cache 5min por dataset. Invalidacao apos mutations (add/edit/delete).
//   - Auto-refetch quando user muda portfolio selecionado.
//
// Legado: services e database.js continuam existindo. Telas legadas
// (HomeScreen, CarteiraScreen etc) continuam chamando direto ate serem
// migradas nas Fases D-G.

import React from 'react';
var createContext = React.createContext;
var useContext = React.useContext;
var useState = React.useState;
var useEffect = React.useEffect;
var useCallback = React.useCallback;
var useRef = React.useRef;

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import {
  getPositions, getProventos, getOpcoes, getRendaFixa,
  getSaldos, getMovimentacoes, getPortfolios, getProfile,
  getPatrimonioSnapshots, computeDashboardFromData,
} from '../services/database';
import { enrichPositionsWithPrices } from '../services/priceService';
var marketStatusService = require('../services/marketStatusService');
var isB3Open = marketStatusService.isB3Open;
import { buildIncomeForecast } from '../services/incomeForecastService';
import { computePortfolioScore } from '../services/incomeScoreService';
import { computeYoC } from '../services/yieldOnCostService';
import { detectIncomeAlerts } from '../services/incomeAlertsService';
import { computeRendaPotencial } from '../services/rendaPotencialService';
import { suggestCoveredCalls } from '../services/coveredCallSuggestionService';
var analyticsModule = require('../services/incomeAnalyticsService');

var CACHE_TTL_MS = 5 * 60 * 1000; // 5min
var MOV_PAGE_SIZE = 50;
var PRICE_TTL_OPEN_MS = 60 * 1000; // 1min bolsa aberta
var PRICE_TTL_CLOSED_MS = 30 * 60 * 1000; // 30min bolsa fechada

var AppStoreContext = createContext({});

export function useAppStore() {
  return useContext(AppStoreContext);
}

// ───────── Hooks semanticos ─────────

export function useIncome() {
  var store = useAppStore();
  return {
    forecast: store.forecast,
    score: store.score,
    yoc: store.yoc,
    alerts: store.alerts,
    loading: store.loading.income,
    refresh: store.refreshIncome,
  };
}

export function useCarteira() {
  var store = useAppStore();
  return {
    positions: store.positions,
    encerradas: store.encerradas,
    opcoes: store.opcoes,
    rf: store.rf,
    portfolios: store.portfolios,
    selectedPortfolio: store.selectedPortfolio,
    setSelectedPortfolio: store.setSelectedPortfolio,
    loading: store.loading.carteira,
    loadingPrices: store.loading.prices,
    refresh: store.refreshCarteira,
    refreshPrices: store.refreshPrices,
  };
}

export function useFinancas() {
  var store = useAppStore();
  return {
    saldos: store.saldos,
    movimentacoes: store.movimentacoes,
    movimentacoesHasMore: store.movimentacoesHasMore,
    loadMoreMovimentacoes: store.loadMoreMovimentacoes,
    loading: store.loading.financas,
    refresh: store.refreshFinancas,
  };
}

export function useProventos() {
  var store = useAppStore();
  return {
    proventos: store.proventos,
    loading: store.loading.proventos,
    refresh: store.refreshProventos,
  };
}

export function useAnalytics() {
  var store = useAppStore();
  return {
    dashboard: store.analytics.dashboard,
    potencial: store.analytics.potencial,
    ccSuggestions: store.analytics.ccSuggestions,
    xray: store.analytics.xray,
    coverage: store.analytics.coverage,
    cutRisks: store.analytics.cutRisks,
    snowball: store.analytics.snowball,
    autopilot: store.analytics.autopilot,
    fire: store.analytics.fire,
    loading: store.loading.analytics,
    refresh: store.refreshAnalytics,
  };
}

export function useRefresh() {
  var store = useAppStore();
  return store.refreshAll;
}

export function useInvalidate() {
  var store = useAppStore();
  return store.invalidate;
}

// ───────── Provider ─────────

export function AppStoreProvider(props) {
  var _auth = useAuth();
  var user = _auth.user;

  // Raw datasets
  var _positions = useState([]); var positions = _positions[0]; var setPositions = _positions[1];
  var _proventos = useState([]); var proventos = _proventos[0]; var setProventos = _proventos[1];
  var _opcoes = useState([]); var opcoes = _opcoes[0]; var setOpcoes = _opcoes[1];
  var _rf = useState([]); var rf = _rf[0]; var setRf = _rf[1];
  var _encerradas = useState([]); var encerradas = _encerradas[0]; var setEncerradas = _encerradas[1];
  var _saldos = useState([]); var saldos = _saldos[0]; var setSaldos = _saldos[1];
  var _movimentacoes = useState([]); var movimentacoes = _movimentacoes[0]; var setMovimentacoes = _movimentacoes[1];
  var _movHasMore = useState(true); var movimentacoesHasMore = _movHasMore[0]; var setMovHasMore = _movHasMore[1];
  var _portfolios = useState([]); var portfoliosS = _portfolios[0]; var setPortfoliosS = _portfolios[1];
  var _profile = useState(null); var profile = _profile[0]; var setProfile = _profile[1];
  // selectedPortfolio: null = Todos, '__null__' = Padrao (portfolio_id IS NULL no DB), UUID = custom.
  // Persistido em AsyncStorage por user pra sobreviver reinicios. Inicia como
  // undefined ate terminar o load; nesse estado o auto-fetch nao dispara.
  var _selectedPortfolio = useState(undefined); var selectedPortfolio = _selectedPortfolio[0]; var _rawSetSelectedPortfolio = _selectedPortfolio[1];
  var setSelectedPortfolio = useCallback(function(value) {
    _rawSetSelectedPortfolio(value);
    if (user && user.id) {
      var key = '@selected_portfolio_' + user.id;
      if (value === null || value === undefined) {
        AsyncStorage.removeItem(key).catch(function() {});
      } else {
        AsyncStorage.setItem(key, String(value)).catch(function() {});
      }
    }
  }, [user]);

  // Carrega o portfolio selecionado do AsyncStorage quando user muda.
  useEffect(function() {
    if (!user || !user.id) {
      _rawSetSelectedPortfolio(null);
      return;
    }
    var key = '@selected_portfolio_' + user.id;
    AsyncStorage.getItem(key).then(function(stored) {
      if (stored === null || stored === undefined) {
        _rawSetSelectedPortfolio(null); // default: Todos
      } else {
        _rawSetSelectedPortfolio(stored);
      }
    }).catch(function() {
      _rawSetSelectedPortfolio(null);
    });
  }, [user]);

  // Derived datasets
  var _forecast = useState(null); var forecast = _forecast[0]; var setForecast = _forecast[1];
  var _score = useState(null); var score = _score[0]; var setScore = _score[1];
  var _yoc = useState(null); var yoc = _yoc[0]; var setYoc = _yoc[1];
  var _alerts = useState([]); var alerts = _alerts[0]; var setAlerts = _alerts[1];

  // Raw positions ref (before price enrichment) — used by refreshPrices
  var rawPositionsRef = useRef([]);

  // Analytics module — dados derivados computados uma unica vez e compartilhados entre todas as telas
  var _analytics = useState({
    dashboard: null,
    potencial: null,
    ccSuggestions: null,
    xray: null,
    coverage: null,
    cutRisks: null,
    snowball: null,
    autopilot: null,
    fire: null,
  });
  var analytics = _analytics[0];
  var setAnalytics = _analytics[1];

  // Loading flags
  var _loading = useState({
    carteira: false,
    proventos: false,
    financas: false,
    income: false,
    prices: false,
    analytics: false,
  });
  var loading = _loading[0];
  var setLoading = _loading[1];

  // Last fetch timestamps
  var lastFetch = useRef({
    carteira: 0,
    proventos: 0,
    financas: 0,
    income: 0,
    prices: 0,
    analytics: 0,
  });

  function isStale(key) {
    if (key === 'prices') {
      var ttl = isB3Open() ? PRICE_TTL_OPEN_MS : PRICE_TTL_CLOSED_MS;
      return (Date.now() - (lastFetch.current.prices || 0)) > ttl;
    }
    return (Date.now() - (lastFetch.current[key] || 0)) > CACHE_TTL_MS;
  }

  function patchLoading(key, value) {
    setLoading(function(prev) {
      var next = {};
      var keys = Object.keys(prev);
      for (var i = 0; i < keys.length; i++) next[keys[i]] = prev[keys[i]];
      next[key] = value;
      return next;
    });
  }

  // ─────────── Fetchers ───────────

  var refreshCarteira = useCallback(function(force) {
    if (!user) return Promise.resolve();
    if (!force && !isStale('carteira')) return Promise.resolve();
    patchLoading('carteira', true);
    var pfArg = selectedPortfolio || undefined;
    return Promise.all([
      getPositions(user.id, pfArg),
      getOpcoes(user.id, pfArg),
      getRendaFixa(user.id, pfArg),
      getPortfolios(user.id),
    ]).then(function(results) {
      var rawPos = (results[0] && results[0].data) || [];
      rawPositionsRef.current = rawPos;
      setPositions(rawPos);
      setEncerradas((results[0] && results[0].encerradas) || []);
      setOpcoes((results[1] && results[1].data) || []);
      setRf((results[2] && results[2].data) || []);
      setPortfoliosS((results[3] && results[3].data) || []);
      lastFetch.current.carteira = Date.now();
      patchLoading('carteira', false);
      // Enriquecer com precos (async, nao bloqueia carteira loading)
      if (rawPos.length > 0) {
        patchLoading('prices', true);
        enrichPositionsWithPrices(rawPos).then(function(enriched) {
          setPositions(enriched);
          lastFetch.current.prices = Date.now();
          patchLoading('prices', false);
        }).catch(function(err) {
          console.warn('enrichPositions error:', err && err.message);
          patchLoading('prices', false);
        });
      }
    }).catch(function(err) {
      console.warn('refreshCarteira error:', err && err.message);
      patchLoading('carteira', false);
    });
  }, [user, selectedPortfolio]);

  // Re-enriquecer positions com precos atualizados sem re-buscar do banco
  var refreshPrices = useCallback(function(force) {
    if (!user) return Promise.resolve();
    if (!force && !isStale('prices')) return Promise.resolve();
    var raw = rawPositionsRef.current;
    if (!raw || raw.length === 0) return Promise.resolve();
    patchLoading('prices', true);
    return enrichPositionsWithPrices(raw).then(function(enriched) {
      setPositions(enriched);
      lastFetch.current.prices = Date.now();
      patchLoading('prices', false);
    }).catch(function(err) {
      console.warn('refreshPrices error:', err && err.message);
      patchLoading('prices', false);
    });
  }, [user]);

  var refreshProventos = useCallback(function(force) {
    if (!user) return Promise.resolve();
    if (!force && !isStale('proventos')) return Promise.resolve();
    patchLoading('proventos', true);
    return getProventos(user.id, { limit: 2000, portfolioId: selectedPortfolio || undefined })
      .then(function(res) {
        setProventos((res && res.data) || []);
        lastFetch.current.proventos = Date.now();
        patchLoading('proventos', false);
      }).catch(function(err) {
        console.warn('refreshProventos error:', err && err.message);
        patchLoading('proventos', false);
      });
  }, [user, selectedPortfolio]);

  var refreshFinancas = useCallback(function(force) {
    if (!user) return Promise.resolve();
    if (!force && !isStale('financas')) return Promise.resolve();
    patchLoading('financas', true);
    return Promise.all([
      getSaldos(user.id),
      getMovimentacoes(user.id, { limit: MOV_PAGE_SIZE, offset: 0 }),
    ]).then(function(results) {
      setSaldos((results[0] && results[0].data) || []);
      var movs = (results[1] && results[1].data) || [];
      setMovimentacoes(movs);
      setMovHasMore(movs.length >= MOV_PAGE_SIZE);
      lastFetch.current.financas = Date.now();
      patchLoading('financas', false);
    }).catch(function(err) {
      console.warn('refreshFinancas error:', err && err.message);
      patchLoading('financas', false);
    });
  }, [user]);

  var loadMoreMovimentacoes = useCallback(function() {
    if (!user) return Promise.resolve();
    return getMovimentacoes(user.id, { limit: MOV_PAGE_SIZE, offset: movimentacoes.length })
      .then(function(res) {
        var newMovs = (res && res.data) || [];
        if (newMovs.length > 0) {
          setMovimentacoes(function(prev) { return prev.concat(newMovs); });
        }
        setMovHasMore(newMovs.length >= MOV_PAGE_SIZE);
      }).catch(function(err) {
        console.warn('loadMoreMovimentacoes error:', err && err.message);
      });
  }, [user, movimentacoes.length]);

  var refreshIncome = useCallback(function(force) {
    if (!user) return Promise.resolve();
    if (!force && !isStale('income')) return Promise.resolve();
    patchLoading('income', true);
    return Promise.all([
      buildIncomeForecast(user.id, { portfolioId: selectedPortfolio }).catch(function() { return null; }),
      computePortfolioScore(user.id, { portfolioId: selectedPortfolio }).catch(function() { return null; }),
      computeYoC(user.id, { portfolioId: selectedPortfolio }).catch(function() { return null; }),
      detectIncomeAlerts(user.id, { portfolioId: selectedPortfolio }).catch(function() { return []; }),
    ]).then(function(results) {
      setForecast(results[0]);
      setScore(results[1]);
      setYoc(results[2]);
      setAlerts(results[3] || []);
      lastFetch.current.income = Date.now();
      patchLoading('income', false);
    }).catch(function(err) {
      console.warn('refreshIncome error:', err && err.message);
      patchLoading('income', false);
    });
  }, [user, selectedPortfolio]);

  // Analytics — computados a partir dos dados base. Uma unica fonte de verdade.
  var refreshAnalytics = useCallback(function(force) {
    if (!user) return Promise.resolve();
    if (!force && !isStale('analytics')) return Promise.resolve();
    patchLoading('analytics', true);
    var pfOpts = { portfolioId: selectedPortfolio };

    // Patch helper: atualiza analytics imutavelmente campo por campo
    function patch(key, val) {
      setAnalytics(function(prev) {
        var next = {};
        var ks = Object.keys(prev);
        for (var i = 0; i < ks.length; i++) next[ks[i]] = prev[ks[i]];
        next[key] = val;
        return next;
      });
    }

    // Dashboard unificado (computado a partir dos dados do store)
    // Guard: so computa se tem positions carregadas
    // So computa dashboard quando positions ja tem preco_atual (enriquecidas)
    var posEnriquecidas = positions && positions.length > 0 && positions[0].preco_atual != null;
    var p0 = posEnriquecidas
      ? getPatrimonioSnapshots(user.id).then(function(snaps) {
          return computeDashboardFromData({
            userId: user.id,
            positions: positions || [],
            encerradas: encerradas || [],
            proventos: proventos || [],
            opcoes: opcoes || [],
            rf: rf || [],
            saldos: saldos || [],
            profile: profile || {},
            snapshots: snaps || [],
            portfolioId: selectedPortfolio,
          }).then(function(dash) {
            patch('dashboard', dash);
          });
        }).catch(function(err) { console.warn('dashboard compute error:', err && err.message); })
      : Promise.resolve();

    // Paralelo: potencial + xray + coverage + snowball + ccSuggestions
    var p1 = computeRendaPotencial(user.id, pfOpts).then(function(r) { patch('potencial', r); return r; }).catch(function() { return null; });
    var p2 = analyticsModule.computeIncomeXray(user.id, pfOpts).then(function(r) { patch('xray', r); }).catch(function() {});
    var p3 = analyticsModule.computeIncomeCoverage(user.id, pfOpts).then(function(r) { patch('coverage', r); }).catch(function() {});
    var p4 = analyticsModule.computeSnowballEffect(user.id, pfOpts).then(function(r) { patch('snowball', r); }).catch(function() {});
    var ccOpts = { portfolioId: selectedPortfolio, positions: positions, opcoes: opcoes, selic: profile && profile.selic ? profile.selic : 13.25 };
    var p5 = suggestCoveredCalls(user.id, ccOpts).then(function(r) { patch('ccSuggestions', r || []); }).catch(function() { patch('ccSuggestions', []); });

    return Promise.all([p0, p1, p2, p3, p4, p5]).then(function(results) {
      var pot = results[1];

      // Cut risks — depende de positions + score (que vem do income)
      if (positions.length > 0 && score && score.byTicker) {
        var risks = analyticsModule.detectDividendCutRisk(positions, score.byTicker, null);
        patch('cutRisks', risks);
      }

      // Media real dos ultimos 3 meses completos (usada por autopilot e FIRE)
      var rendaAtual = 0;
      if (forecast && forecast.summary) {
        if (forecast.historyMonthly && forecast.historyMonthly.length > 1) {
          var nowFire = new Date();
          var mesAtualKeyFire = nowFire.getFullYear() + '-' + String(nowFire.getMonth() + 1).padStart(2, '0');
          var mesesCompletosFire = [];
          for (var hmf = 0; hmf < forecast.historyMonthly.length; hmf++) {
            var hmItem = forecast.historyMonthly[hmf];
            var hmkFire = hmItem.year + '-' + String(hmItem.mes + 1).padStart(2, '0');
            if (hmkFire !== mesAtualKeyFire) mesesCompletosFire.push(hmItem);
          }
          var ultMeses = mesesCompletosFire.slice(-3);
          for (var hm = 0; hm < ultMeses.length; hm++) { rendaAtual += ultMeses[hm].total || 0; }
          rendaAtual = ultMeses.length > 0 ? rendaAtual / ultMeses.length : 0;
        }
        if (rendaAtual <= 0) rendaAtual = forecast.summary.lastMonth || 0;
      }

      // Autopilot — depende de forecast + positions + score + potencial.gaps
      // Fallback: se rendaAtual = 0, usar mediaProjetada do forecast
      var divMesAutopilot = rendaAtual > 0 ? rendaAtual : (forecast && forecast.summary ? forecast.summary.mediaProjetada || 0 : 0);
      if (forecast && forecast.summary && positions.length > 0 && divMesAutopilot > 0) {
        var scoreByTicker = score && score.byTicker ? score.byTicker : {};
        var gaps = pot && pot.gaps ? pot.gaps : [];
        var plan = analyticsModule.computeReinvestmentPlan(divMesAutopilot, positions, scoreByTicker, gaps, proventos);
        patch('autopilot', plan);
      }

      // FIRE milestones — usa renda REAL recebida (nao projecao)
      if (forecast && forecast.summary) {
        var meta = profile && profile.meta_mensal ? profile.meta_mensal : 20000;
        var growth = yoc && yoc.growth && yoc.growth.growthPct ? yoc.growth.growthPct : 15;
        var fire = analyticsModule.computeFireMilestones(rendaAtual, meta, Math.max(5, Math.min(50, growth)));
        patch('fire', fire);
      }

      lastFetch.current.analytics = Date.now();
      patchLoading('analytics', false);
    }).catch(function(err) {
      console.warn('refreshAnalytics error:', err && err.message);
      patchLoading('analytics', false);
    });
  }, [user, selectedPortfolio, positions, forecast, score, yoc, profile]);

  var refreshAll = useCallback(function() {
    return Promise.all([
      refreshCarteira(true),
      refreshProventos(true),
      refreshFinancas(true),
      refreshIncome(true),
    ]).then(function() {
      return refreshAnalytics(true);
    });
  }, [refreshCarteira, refreshProventos, refreshFinancas, refreshIncome, refreshAnalytics]);

  // Invalidacao apos mutations (add/edit/delete)
  var invalidate = useCallback(function(keys) {
    var arr = Array.isArray(keys) ? keys : [keys];
    for (var i = 0; i < arr.length; i++) {
      if (lastFetch.current[arr[i]] != null) lastFetch.current[arr[i]] = 0;
    }
    // Auto-refetch
    if (arr.indexOf('carteira') !== -1) refreshCarteira(true);
    if (arr.indexOf('proventos') !== -1) refreshProventos(true);
    if (arr.indexOf('financas') !== -1) refreshFinancas(true);
    if (arr.indexOf('income') !== -1) refreshIncome(true);
    if (arr.indexOf('analytics') !== -1) refreshAnalytics(true);
  }, [refreshCarteira, refreshProventos, refreshFinancas, refreshIncome, refreshAnalytics]);

  // Profile — carregado uma vez quando user muda
  useEffect(function() {
    if (!user) return;
    getProfile(user.id).then(function(res) {
      if (res && res.data) setProfile(res.data);
    }).catch(function() {});
  }, [user]);

  // Auto-fetch inicial quando user autentica. Forca refresh na mudanca de
  // portfolio — o cache de 5min nao e chaveado por portfolioId, entao sem
  // force=true trocar de portfolio dentro da janela nao atualizava nada.
  // Pula enquanto selectedPortfolio === undefined (load do AsyncStorage
  // ainda em andamento) pra evitar double-fetch logo apos login.
  useEffect(function() {
    if (!user) return;
    if (selectedPortfolio === undefined) return;
    refreshCarteira(true);
    refreshProventos(true);
    refreshFinancas(true);
    refreshIncome(true);
  }, [user, selectedPortfolio, refreshCarteira, refreshProventos, refreshFinancas, refreshIncome]);

  // Analytics re-computa quando dados base terminam de carregar
  useEffect(function() {
    if (!user) return;
    if (positions.length === 0) return;
    // Pequeno delay pra income/forecast terminarem
    var timer = setTimeout(function() { refreshAnalytics(true); }, 1500);
    return function() { clearTimeout(timer); };
  }, [positions, proventos, opcoes, selectedPortfolio, refreshAnalytics]);

  var value = {
    // Datasets
    positions: positions,
    encerradas: encerradas,
    proventos: proventos,
    opcoes: opcoes,
    rf: rf,
    saldos: saldos,
    movimentacoes: movimentacoes,
    movimentacoesHasMore: movimentacoesHasMore,
    portfolios: portfoliosS,
    profile: profile,
    selectedPortfolio: selectedPortfolio,
    setSelectedPortfolio: setSelectedPortfolio,

    // Derived
    forecast: forecast,
    score: score,
    yoc: yoc,
    alerts: alerts,

    // Analytics (modulo unificado)
    analytics: analytics,

    // Loading
    loading: loading,

    // Actions
    refreshCarteira: refreshCarteira,
    refreshPrices: refreshPrices,
    refreshProventos: refreshProventos,
    refreshFinancas: refreshFinancas,
    loadMoreMovimentacoes: loadMoreMovimentacoes,
    refreshIncome: refreshIncome,
    refreshAnalytics: refreshAnalytics,
    refreshAll: refreshAll,
    invalidate: invalidate,
  };

  return React.createElement(AppStoreContext.Provider, { value: value }, props.children);
}
