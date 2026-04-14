// oplabService.js — Client service para cadeia de opcoes real via Edge Function
// Cache 2min em memoria. Fallback gracioso se API falhar.

var supabaseModule = require('../config/supabase');
var supabase = supabaseModule.supabase;
var marketStatusModule = require('./marketStatusService');
var isB3Open = marketStatusModule.isB3Open;

var CACHE = {};
var CACHE_TTL = 120000; // 2 min
var CACHE_TTL_CLOSED = 1800000; // 30 min quando bolsa fechada

var MESES_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function clearOplabCache(ticker) {
  if (ticker) {
    var key = ticker.toUpperCase().trim();
    delete CACHE[key];
  } else {
    CACHE = {};
  }
}

function formatSeriesLabel(dueDate) {
  if (!dueDate) return '';
  var parts = dueDate.split('-');
  if (parts.length < 2) return dueDate;
  var mesIdx = parseInt(parts[1], 10) - 1;
  var ano = parts[0].substring(2);
  return MESES_SHORT[mesIdx] + '/' + ano;
}

function normalizeSeries(rawSeries) {
  if (!rawSeries || !rawSeries.length) return [];
  var result = [];
  for (var i = 0; i < rawSeries.length; i++) {
    var s = rawSeries[i];
    if (!s.strikes || !s.strikes.length) continue;
    var strikes = [];
    for (var j = 0; j < s.strikes.length; j++) {
      var st = s.strikes[j];
      strikes.push({
        strike: st.strike || 0,
        call: normalizeOption(st.call),
        put: normalizeOption(st.put),
      });
    }
    // Sort strikes ascending
    strikes.sort(function(a, b) { return a.strike - b.strike; });
    result.push({
      due_date: s.due_date || '',
      days_to_maturity: s.days_to_maturity || 0,
      label: formatSeriesLabel(s.due_date),
      call_letter: s.call || '',
      put_letter: s.put || '',
      strikes: strikes,
    });
  }
  // Sort by due_date ascending
  result.sort(function(a, b) {
    if (a.due_date < b.due_date) return -1;
    if (a.due_date > b.due_date) return 1;
    return 0;
  });
  return result;
}

function normalizeOption(opt) {
  if (!opt) return null;
  // Gregas ficam dentro de opt.bs quando bs=true na query
  var bs = (opt.bs && typeof opt.bs === 'object') ? opt.bs : {};
  return {
    symbol: opt.symbol || '',
    bid: opt.bid || 0,
    ask: opt.ask || 0,
    last: opt.last || 0,
    close: opt.close || 0,
    volume: opt.volume || 0,
    financial_volume: opt.financial_volume || 0,
    variation: opt.variation || 0,
    maturity_type: opt.maturity_type || 'AMERICAN',
    category: opt.category || '',
    strike: opt.strike || 0,
    market_maker: opt.market_maker || false,
    // BS greeks — extraidos de opt.bs
    delta: bs.delta != null ? bs.delta : null,
    gamma: bs.gamma != null ? bs.gamma : null,
    theta: bs.theta != null ? bs.theta : null,
    vega: bs.vega != null ? bs.vega : null,
    rho: bs.rho != null ? bs.rho : null,
    iv: bs.volatility != null ? bs.volatility : null,
    bs_price: bs.price != null ? bs.price : null,
    moneyness: bs.moneyness || null,
    poe: bs.poe != null ? bs.poe : null,
  };
}

// Filtra series: ate 3 meses a frente, com pelo menos 1 strike
function filterSeries(series) {
  var now = new Date();
  var cutoff = new Date(now.getTime() + 92 * 24 * 60 * 60 * 1000); // ~3 meses
  var cutoffStr = cutoff.toISOString().substring(0, 10);
  var todayStr = now.toISOString().substring(0, 10);
  var filtered = [];
  for (var i = 0; i < series.length; i++) {
    var s = series[i];
    if (s.due_date >= todayStr && s.due_date <= cutoffStr && s.strikes.length > 0) {
      filtered.push(s);
    }
  }
  return filtered;
}

function fetchOptionsChain(ticker, selic) {
  return new Promise(function(resolve) {
    if (!ticker) {
      resolve({ error: 'Ticker obrigatório.' });
      return;
    }

    var key = ticker.toUpperCase().trim();
    var now = Date.now();

    // Check cache (TTL mais longo quando bolsa fechada)
    var ttl = isB3Open() ? CACHE_TTL : CACHE_TTL_CLOSED;
    var cached = CACHE[key];
    if (cached && (now - cached.ts < ttl)) {
      resolve(cached.result);
      return;
    }

    supabase.auth.getSession().then(function(sessionResult) {
      var session = sessionResult && sessionResult.data ? sessionResult.data.session : null;
      if (!session || !session.access_token) {
        resolve({ error: 'Sessão expirada.' });
        return;
      }

      return supabase.functions.invoke('oplab-options', {
        body: { ticker: key, selic: selic || 13.25 },
        headers: {
          Authorization: 'Bearer ' + session.access_token,
        },
      });
    }).then(function(response) {
      if (!response) return;

      var result = response.data;
      var error = response.error;

      if (error) {
        console.warn('oplab-options error:', error.message || error);
        resolve({ error: 'Erro: ' + (error.message || 'tente novamente') });
        return;
      }

      if (!result) {
        resolve({ error: 'Resposta vazia.' });
        return;
      }

      if (result.error) {
        resolve({ error: result.error });
        return;
      }

      // Normalize
      var allSeries = normalizeSeries(result.series);
      var filtered = filterSeries(allSeries);

      var normalized = {
        symbol: result.symbol || key,
        name: result.name || '',
        spot: result.spot || 0,
        bid: result.bid || 0,
        ask: result.ask || 0,
        volume: result.volume || 0,
        iv_current: result.iv_current,
        ewma_current: result.ewma_current,
        beta_ibov: result.beta_ibov,
        series: filtered,
      };

      // Cache
      CACHE[key] = { ts: Date.now(), result: normalized };
      resolve(normalized);
    }).catch(function(err) {
      var msg = err && err.message ? err.message : String(err);
      console.warn('fetchOptionsChain catch:', msg);
      resolve({ error: 'Falha de conexão: ' + msg });
    });
  });
}

// Retorna chain cacheada do ticker (ou null se expirada/inexistente)
function getCachedChain(ticker) {
  if (!ticker) return null;
  var key = ticker.toUpperCase().trim();
  var cached = CACHE[key];
  var ttl = isB3Open() ? CACHE_TTL : CACHE_TTL_CLOSED;
  if (cached && (Date.now() - cached.ts < ttl)) return cached.result;
  return null;
}

// Busca dados de uma opcao especifica no cache por ticker + strike + tipo + vencimento
// vencimento (opcional): ISO date string (YYYY-MM-DD) para match exato na serie correta
function getCachedOptionData(ticker, strike, tipo, vencimento) {
  var chain = getCachedChain(ticker);
  if (!chain || !chain.series) return null;
  var tipoLower = (tipo || 'call').toLowerCase();
  var strikeParsed = parseFloat(strike) || 0;
  if (strikeParsed <= 0) return null;

  // Se tem vencimento, busca na serie correta primeiro
  if (vencimento) {
    var vencStr = String(vencimento).substring(0, 10); // YYYY-MM-DD
    for (var i = 0; i < chain.series.length; i++) {
      if (chain.series[i].due_date !== vencStr) continue;
      var strikes = chain.series[i].strikes;
      for (var j = 0; j < strikes.length; j++) {
        var st = strikes[j];
        if (Math.abs(st.strike - strikeParsed) < 0.01) {
          var opt = tipoLower === 'put' ? st.put : st.call;
          if (opt) return opt;
        }
      }
    }
  }

  // Fallback: busca em qualquer serie (compatibilidade)
  for (var fi = 0; fi < chain.series.length; fi++) {
    var fStrikes = chain.series[fi].strikes;
    for (var fj = 0; fj < fStrikes.length; fj++) {
      var fst = fStrikes[fj];
      if (Math.abs(fst.strike - strikeParsed) < 0.01) {
        var fopt = tipoLower === 'put' ? fst.put : fst.call;
        if (fopt) return fopt;
      }
    }
  }
  return null;
}

module.exports = {
  fetchOptionsChain: fetchOptionsChain,
  clearOplabCache: clearOplabCache,
  getCachedChain: getCachedChain,
  getCachedOptionData: getCachedOptionData,
};
