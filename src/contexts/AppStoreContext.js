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
} from '../services/database';
import { buildIncomeForecast } from '../services/incomeForecastService';
import { computePortfolioScore } from '../services/incomeScoreService';
import { computeYoC } from '../services/yieldOnCostService';
import { detectIncomeAlerts } from '../services/incomeAlertsService';

var CACHE_TTL_MS = 5 * 60 * 1000; // 5min

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
    opcoes: store.opcoes,
    rf: store.rf,
    portfolios: store.portfolios,
    selectedPortfolio: store.selectedPortfolio,
    setSelectedPortfolio: store.setSelectedPortfolio,
    loading: store.loading.carteira,
    refresh: store.refreshCarteira,
  };
}

export function useFinancas() {
  var store = useAppStore();
  return {
    saldos: store.saldos,
    movimentacoes: store.movimentacoes,
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
  var _saldos = useState([]); var saldos = _saldos[0]; var setSaldos = _saldos[1];
  var _movimentacoes = useState([]); var movimentacoes = _movimentacoes[0]; var setMovimentacoes = _movimentacoes[1];
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

  // Loading flags
  var _loading = useState({
    carteira: false,
    proventos: false,
    financas: false,
    income: false,
  });
  var loading = _loading[0];
  var setLoading = _loading[1];

  // Last fetch timestamps
  var lastFetch = useRef({
    carteira: 0,
    proventos: 0,
    financas: 0,
    income: 0,
  });

  function isStale(key) {
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
      setPositions((results[0] && results[0].data) || []);
      setOpcoes((results[1] && results[1].data) || []);
      setRf((results[2] && results[2].data) || []);
      setPortfoliosS((results[3] && results[3].data) || []);
      lastFetch.current.carteira = Date.now();
      patchLoading('carteira', false);
    }).catch(function(err) {
      console.warn('refreshCarteira error:', err && err.message);
      patchLoading('carteira', false);
    });
  }, [user, selectedPortfolio]);

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
      getMovimentacoes(user.id, { limit: 500 }),
    ]).then(function(results) {
      setSaldos((results[0] && results[0].data) || []);
      setMovimentacoes((results[1] && results[1].data) || []);
      lastFetch.current.financas = Date.now();
      patchLoading('financas', false);
    }).catch(function(err) {
      console.warn('refreshFinancas error:', err && err.message);
      patchLoading('financas', false);
    });
  }, [user]);

  var refreshIncome = useCallback(function(force) {
    if (!user) return Promise.resolve();
    if (!force && !isStale('income')) return Promise.resolve();
    patchLoading('income', true);
    return Promise.all([
      buildIncomeForecast(user.id, { portfolioId: selectedPortfolio }).catch(function() { return null; }),
      computePortfolioScore(user.id, { portfolioId: selectedPortfolio }).catch(function() { return null; }),
      computeYoC(user.id, { portfolioId: selectedPortfolio }).catch(function() { return null; }),
      detectIncomeAlerts(user.id).catch(function() { return []; }),
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

  var refreshAll = useCallback(function() {
    return Promise.all([
      refreshCarteira(true),
      refreshProventos(true),
      refreshFinancas(true),
      refreshIncome(true),
    ]);
  }, [refreshCarteira, refreshProventos, refreshFinancas, refreshIncome]);

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
  }, [refreshCarteira, refreshProventos, refreshFinancas, refreshIncome]);

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
  }, [user, selectedPortfolio]);

  var value = {
    // Datasets
    positions: positions,
    proventos: proventos,
    opcoes: opcoes,
    rf: rf,
    saldos: saldos,
    movimentacoes: movimentacoes,
    portfolios: portfoliosS,
    profile: profile,
    selectedPortfolio: selectedPortfolio,
    setSelectedPortfolio: setSelectedPortfolio,

    // Derived
    forecast: forecast,
    score: score,
    yoc: yoc,
    alerts: alerts,

    // Loading
    loading: loading,

    // Actions
    refreshCarteira: refreshCarteira,
    refreshProventos: refreshProventos,
    refreshFinancas: refreshFinancas,
    refreshIncome: refreshIncome,
    refreshAll: refreshAll,
    invalidate: invalidate,
  };

  return React.createElement(AppStoreContext.Provider, { value: value }, props.children);
}
