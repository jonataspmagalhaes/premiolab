/**
 * priceService.js
 * Busca cotacoes reais da B3 via brapi.dev
 * Token + cache em memoria + helpers
 */

var BRAPI_URL = 'https://brapi.dev/api/quote/';
var BRAPI_TOKEN = 'tEU8wyBixv8hCi7J3NCjsi';

// ══════════ CACHE ══════════
var _cache = {
  prices: {},
  history: {},
  lastPrices: null,
  lastHistory: null,
};
var CACHE_PRICES_MS = 60000;   // 60s
var CACHE_HISTORY_MS = 300000; // 5min

// ══════════ HELPERS ══════════
function buildUrl(tickerStr, params) {
  var url = BRAPI_URL + tickerStr + '?fundamental=false';
  if (params) {
    var keys = Object.keys(params);
    for (var i = 0; i < keys.length; i++) {
      url = url + '&' + keys[i] + '=' + params[keys[i]];
    }
  }
  if (BRAPI_TOKEN) {
    url = url + '&token=' + BRAPI_TOKEN;
  }
  return url;
}

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

// ══════════ FETCH PRICES ══════════
export async function fetchPrices(tickers) {
  if (!tickers || tickers.length === 0) return {};

  // Check cache
  if (isCacheValid(_cache.lastPrices, CACHE_PRICES_MS) && allTickersInCache(tickers, _cache.prices)) {
    var cached = {};
    for (var c = 0; c < tickers.length; c++) {
      cached[tickers[c]] = _cache.prices[tickers[c]];
    }
    return cached;
  }

  try {
    var tickerStr = tickers.join(',');
    var url = buildUrl(tickerStr, {});
    var response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) return {};

    var json = await response.json();
    var results = json.results || [];

    var prices = {};
    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      if (r.symbol && r.regularMarketPrice != null) {
        var entry = {
          price: r.regularMarketPrice,
          change: r.regularMarketChange || 0,
          changePercent: r.regularMarketChangePercent || 0,
          previousClose: r.regularMarketPreviousClose || 0,
          updatedAt: r.regularMarketTime || null,
        };
        prices[r.symbol] = entry;
        _cache.prices[r.symbol] = entry;
      }
    }

    _cache.lastPrices = Date.now();
    return prices;
  } catch (err) {
    console.warn('fetchPrices error:', err.message);
    return {};
  }
}

// ══════════ FETCH HISTORY ══════════
export async function fetchPriceHistory(tickers) {
  if (!tickers || tickers.length === 0) return {};

  // Check cache
  if (isCacheValid(_cache.lastHistory, CACHE_HISTORY_MS) && allTickersInCache(tickers, _cache.history)) {
    var cached = {};
    for (var c = 0; c < tickers.length; c++) {
      cached[tickers[c]] = _cache.history[tickers[c]];
    }
    return cached;
  }

  try {
    var tickerStr = tickers.join(',');
    var url = buildUrl(tickerStr, { range: '1mo', interval: '1d' });
    var response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) return {};

    var json = await response.json();
    var results = json.results || [];
    var history = {};

    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      if (r.symbol && r.historicalDataPrice && r.historicalDataPrice.length > 0) {
        var closes = [];
        for (var j = 0; j < r.historicalDataPrice.length; j++) {
          var closeVal = r.historicalDataPrice[j].close;
          if (closeVal != null) closes.push(closeVal);
        }
        history[r.symbol] = closes;
        _cache.history[r.symbol] = closes;
      }
    }

    _cache.lastHistory = Date.now();
    return history;
  } catch (err) {
    console.warn('fetchPriceHistory error:', err.message);
    return {};
  }
}

// ══════════ FETCH HISTORY LONG (6 months OHLCV) ══════════
var CACHE_HISTORY_LONG_MS = 3600000; // 1h

export async function fetchPriceHistoryLong(tickers) {
  if (!tickers || tickers.length === 0) return {};

  // Check cache
  if (isCacheValid(_cache.lastHistoryLong, CACHE_HISTORY_LONG_MS) && allTickersInCache(tickers, _cache.historyLong || {})) {
    var cached = {};
    for (var c = 0; c < tickers.length; c++) {
      cached[tickers[c]] = _cache.historyLong[tickers[c]];
    }
    return cached;
  }

  var result = {};

  // brapi nao suporta multiplos tickers com historico longo, buscar um por um
  for (var t = 0; t < tickers.length; t++) {
    try {
      var ticker = tickers[t];
      var url = buildUrl(ticker, { range: '6mo', interval: '1d' });
      var response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) continue;

      var json = await response.json();
      var results = json.results || [];

      if (results.length > 0 && results[0].historicalDataPrice) {
        var histData = results[0].historicalDataPrice;
        var ohlcv = [];
        for (var h = 0; h < histData.length; h++) {
          var candle = histData[h];
          if (candle.close != null) {
            ohlcv.push({
              date: candle.date ? new Date(candle.date * 1000).toISOString().substring(0, 10) : null,
              open: candle.open || candle.close,
              high: candle.high || candle.close,
              low: candle.low || candle.close,
              close: candle.close,
              volume: candle.volume || 0,
            });
          }
        }
        result[ticker] = ohlcv;
        if (!_cache.historyLong) _cache.historyLong = {};
        _cache.historyLong[ticker] = ohlcv;
      }
    } catch (err) {
      console.warn('fetchPriceHistoryLong error for ' + tickers[t] + ':', err.message);
    }
  }

  _cache.lastHistoryLong = Date.now();
  return result;
}

// ══════════ FETCH TICKER PROFILE (sector/industry) ══════════
var _profileCache = {};
var PROFILE_CACHE_MS = 86400000; // 24h
var _profileCacheTime = null;

export async function fetchTickerProfile(tickers) {
  if (!tickers || tickers.length === 0) return {};

  // Filter already cached
  var toFetch = [];
  for (var i = 0; i < tickers.length; i++) {
    var t = tickers[i].toUpperCase().trim();
    if (!_profileCache[t]) toFetch.push(t);
  }

  if (toFetch.length > 0) {
    // Fetch in chunks of 10
    for (var c = 0; c < toFetch.length; c += 10) {
      var chunk = toFetch.slice(c, c + 10);
      try {
        var url = BRAPI_URL + chunk.join(',') + '?modules=summaryProfile&token=' + BRAPI_TOKEN;
        var response = await fetch(url, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        });
        if (!response.ok) continue;
        var json = await response.json();
        var results = json.results || [];
        for (var r = 0; r < results.length; r++) {
          var item = results[r];
          if (item.symbol) {
            var sp = item.summaryProfile || {};
            _profileCache[item.symbol] = {
              sector: sp.sector || '',
              industry: sp.industry || '',
              longName: item.longName || '',
            };
          }
        }
      } catch (err) {
        console.warn('fetchTickerProfile chunk error:', err.message);
      }
    }
  }

  var result = {};
  for (var k = 0; k < tickers.length; k++) {
    var tk = tickers[k].toUpperCase().trim();
    if (_profileCache[tk]) result[tk] = _profileCache[tk];
  }
  return result;
}

// ══════════ ENRICH POSITIONS ══════════
export async function enrichPositionsWithPrices(positions) {
  if (!positions || positions.length === 0) return [];

  var tickers = [];
  for (var i = 0; i < positions.length; i++) {
    if (positions[i].ticker) tickers.push(positions[i].ticker);
  }
  var prices = await fetchPrices(tickers);

  var enriched = [];
  for (var k = 0; k < positions.length; k++) {
    var p = positions[k];
    var quote = prices[p.ticker];
    if (!quote) {
      var copy = {};
      var pKeys = Object.keys(p);
      for (var c = 0; c < pKeys.length; c++) { copy[pKeys[c]] = p[pKeys[c]]; }
      copy.preco_atual = null;
      copy.variacao_pct = null;
      copy.pl = null;
      copy.change_day = null;
      enriched.push(copy);
      continue;
    }

    var precoAtual = quote.price;
    var pm = p.pm || 0;
    var qty = p.quantidade || 0;
    var variacao_pct = pm > 0 ? ((precoAtual - pm) / pm) * 100 : 0;
    var pl = (precoAtual - pm) * qty;
    var change_day = quote.changePercent || 0;

    var enrichedItem = {};
    var eKeys = Object.keys(p);
    for (var e = 0; e < eKeys.length; e++) { enrichedItem[eKeys[e]] = p[eKeys[e]]; }
    enrichedItem.preco_atual = precoAtual;
    enrichedItem.variacao_pct = variacao_pct;
    enrichedItem.pl = pl;
    enrichedItem.change_day = change_day;
    enriched.push(enrichedItem);
  }

  return enriched;
}

// ══════════ CACHE UTILS ══════════
export function clearPriceCache() {
  _cache.prices = {};
  _cache.history = {};
  _cache.lastPrices = null;
  _cache.lastHistory = null;
}

export function getLastPriceUpdate() {
  return _cache.lastPrices;
}
