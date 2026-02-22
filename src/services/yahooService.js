/**
 * yahooService.js
 * Busca cotacoes de ativos internacionais via Yahoo Finance v8 chart API
 * Token nao necessario + cache em memoria + helpers
 */

var YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';
var FETCH_TIMEOUT = 8000; // 8s

// ══════════ CACHE ══════════
var _cache = {
  prices: {},
  history: {},
  historyLong: {},
  dividends: {},
  lastPrices: null,
  lastHistory: null,
  lastHistoryLong: null,
  lastDividends: null,
};
var CACHE_PRICES_MS = 60000;       // 60s
var CACHE_HISTORY_MS = 300000;     // 5min
var CACHE_HISTORY_LONG_MS = 3600000; // 1h
var CACHE_DIVIDENDS_MS = 86400000;   // 24h

// ══════════ HELPERS ══════════
function isCacheValid(timestamp, maxAge) {
  if (!timestamp) return false;
  return (Date.now() - timestamp) < maxAge;
}

function allTickersInCache(tickers, cacheObj) {
  for (var i = 0; i < tickers.length; i++) {
    if (!cacheObj[tickers[i]]) return false;
  }
  return true;
}

function fetchWithTimeout(url, timeoutMs) {
  return new Promise(function(resolve, reject) {
    var controller = new AbortController();
    var timer = setTimeout(function() {
      controller.abort();
      reject(new Error('Timeout'));
    }, timeoutMs);

    fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    }).then(function(response) {
      clearTimeout(timer);
      resolve(response);
    }).catch(function(err) {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ══════════ FETCH PRICES ══════════
export async function fetchYahooPrices(tickers) {
  if (!tickers || tickers.length === 0) return {};

  // Check cache
  if (isCacheValid(_cache.lastPrices, CACHE_PRICES_MS) && allTickersInCache(tickers, _cache.prices)) {
    var cached = {};
    for (var c = 0; c < tickers.length; c++) {
      cached[tickers[c]] = _cache.prices[tickers[c]];
    }
    return cached;
  }

  var prices = {};

  // Yahoo v8 busca um ticker por vez
  for (var t = 0; t < tickers.length; t++) {
    try {
      var ticker = tickers[t];
      var url = YAHOO_BASE + encodeURIComponent(ticker) + '?interval=1d&range=1d';
      var response = await fetchWithTimeout(url, FETCH_TIMEOUT);

      if (!response.ok) continue;

      var json = await response.json();
      var result = json.chart && json.chart.result && json.chart.result[0];
      if (!result || !result.meta) continue;

      var meta = result.meta;
      var prevClose = meta.chartPreviousClose || meta.previousClose || 0;
      var price = meta.regularMarketPrice || 0;
      var change = price - prevClose;
      var changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

      var entry = {
        price: price,
        change: change,
        changePercent: changePct,
        previousClose: prevClose,
        updatedAt: meta.regularMarketTime || null,
        marketCap: 0, // Yahoo v8 chart nao retorna marketCap
        currency: meta.currency || 'USD',
      };
      prices[ticker] = entry;
      _cache.prices[ticker] = entry;
    } catch (err) {
      console.warn('fetchYahooPrices error for ' + tickers[t] + ':', err.message);
    }
  }

  _cache.lastPrices = Date.now();
  return prices;
}

// ══════════ FETCH HISTORY (1 mes, closes) ══════════
export async function fetchYahooHistory(tickers) {
  if (!tickers || tickers.length === 0) return {};

  // Check cache
  if (isCacheValid(_cache.lastHistory, CACHE_HISTORY_MS) && allTickersInCache(tickers, _cache.history)) {
    var cached = {};
    for (var c = 0; c < tickers.length; c++) {
      cached[tickers[c]] = _cache.history[tickers[c]];
    }
    return cached;
  }

  var history = {};

  for (var t = 0; t < tickers.length; t++) {
    try {
      var ticker = tickers[t];
      var url = YAHOO_BASE + encodeURIComponent(ticker) + '?interval=1d&range=1mo';
      var response = await fetchWithTimeout(url, FETCH_TIMEOUT);

      if (!response.ok) continue;

      var json = await response.json();
      var result = json.chart && json.chart.result && json.chart.result[0];
      if (!result) continue;

      var quote = result.indicators && result.indicators.quote && result.indicators.quote[0];
      if (!quote || !quote.close) continue;

      var closes = [];
      for (var j = 0; j < quote.close.length; j++) {
        if (quote.close[j] != null) closes.push(quote.close[j]);
      }
      history[ticker] = closes;
      _cache.history[ticker] = closes;
    } catch (err) {
      console.warn('fetchYahooHistory error for ' + tickers[t] + ':', err.message);
    }
  }

  _cache.lastHistory = Date.now();
  return history;
}

// ══════════ FETCH HISTORY LONG (6 meses OHLCV) ══════════
export async function fetchYahooHistoryLong(tickers) {
  if (!tickers || tickers.length === 0) return {};

  // Check cache
  if (isCacheValid(_cache.lastHistoryLong, CACHE_HISTORY_LONG_MS) && allTickersInCache(tickers, _cache.historyLong)) {
    var cached = {};
    for (var c = 0; c < tickers.length; c++) {
      cached[tickers[c]] = _cache.historyLong[tickers[c]];
    }
    return cached;
  }

  var result = {};

  for (var t = 0; t < tickers.length; t++) {
    try {
      var ticker = tickers[t];
      var url = YAHOO_BASE + encodeURIComponent(ticker) + '?interval=1d&range=6mo';
      var response = await fetchWithTimeout(url, FETCH_TIMEOUT);

      if (!response.ok) continue;

      var json = await response.json();
      var chartResult = json.chart && json.chart.result && json.chart.result[0];
      if (!chartResult) continue;

      var timestamps = chartResult.timestamp || [];
      var quote = chartResult.indicators && chartResult.indicators.quote && chartResult.indicators.quote[0];
      if (!quote) continue;

      var ohlcv = [];
      for (var h = 0; h < timestamps.length; h++) {
        var closeVal = quote.close && quote.close[h];
        if (closeVal != null) {
          ohlcv.push({
            date: new Date(timestamps[h] * 1000).toISOString().substring(0, 10),
            open: (quote.open && quote.open[h]) || closeVal,
            high: (quote.high && quote.high[h]) || closeVal,
            low: (quote.low && quote.low[h]) || closeVal,
            close: closeVal,
            volume: (quote.volume && quote.volume[h]) || 0,
          });
        }
      }
      result[ticker] = ohlcv;
      _cache.historyLong[ticker] = ohlcv;
    } catch (err) {
      console.warn('fetchYahooHistoryLong error for ' + tickers[t] + ':', err.message);
    }
  }

  _cache.lastHistoryLong = Date.now();
  return result;
}

// ══════════ FETCH DIVIDENDS (1 ano, events=div) ══════════
export async function fetchYahooDividends(ticker) {
  // Cache check (por ticker, 24h)
  if (_cache.dividends[ticker] && isCacheValid(_cache.lastDividends, CACHE_DIVIDENDS_MS)) {
    return { data: _cache.dividends[ticker], error: null };
  }

  try {
    var url = YAHOO_BASE + encodeURIComponent(ticker) + '?interval=1d&range=1y&events=div';
    var response = await fetchWithTimeout(url, FETCH_TIMEOUT);
    if (!response.ok) return { data: [], error: 'HTTP ' + response.status };

    var json = await response.json();
    var result = json.chart && json.chart.result && json.chart.result[0];
    if (!result) return { data: [], error: null };

    var events = result.events && result.events.dividends;
    if (!events) return { data: [], error: null };

    // events e um objeto keyed por timestamp, converter para array
    var dividends = [];
    var keys = Object.keys(events);
    for (var i = 0; i < keys.length; i++) {
      var ev = events[keys[i]];
      if (ev && ev.amount > 0) {
        var dateStr = new Date(ev.date * 1000).toISOString().substring(0, 10);
        dividends.push({
          paymentDate: dateStr,
          rate: ev.amount,
          label: 'DIVIDEND',
          lastDatePrior: null,
        });
      }
    }

    _cache.dividends[ticker] = dividends;
    _cache.lastDividends = Date.now();
    return { data: dividends, error: null };
  } catch (err) {
    console.warn('fetchYahooDividends error for ' + ticker + ':', err.message);
    return { data: [], error: err.message };
  }
}

// ══════════ CACHE UTILS ══════════
export function clearYahooCache() {
  _cache.prices = {};
  _cache.history = {};
  _cache.historyLong = {};
  _cache.dividends = {};
  _cache.lastPrices = null;
  _cache.lastHistory = null;
  _cache.lastHistoryLong = null;
  _cache.lastDividends = null;
}
