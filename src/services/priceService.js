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
