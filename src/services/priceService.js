/**
 * priceService.js
 * Busca cotacoes reais da B3 via brapi.dev + internacionais via Yahoo
 * Token + cache em memoria + helpers
 */

import { fetchYahooPrices, fetchYahooHistory, fetchYahooHistoryLong } from './yahooService';
import { fetchExchangeRates, convertToBRL } from './currencyService';

var BRAPI_URL = 'https://brapi.dev/api/quote/';
var BRAPI_TOKEN = 'tEU8wyBixv8hCi7J3NCjsi';

var marketStatusModule = require('./marketStatusService');
var isB3Open = marketStatusModule.isB3Open;

// ══════════ CACHE ══════════
var _cache = {
  prices: {},
  history: {},
  lastPrices: null,
  lastHistory: null,
};
var CACHE_PRICES_MS = 60000;   // 60s
var CACHE_PRICES_CLOSED_MS = 1800000; // 30min quando fechado
var CACHE_HISTORY_MS = 300000; // 5min
var CACHE_HISTORY_CLOSED_MS = 7200000; // 2h quando fechado

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
var CHUNK_SIZE = 15;

export async function fetchPrices(tickers) {
  if (!tickers || tickers.length === 0) return {};

  // Check cache (TTL mais longo quando bolsa fechada)
  var pricesTTL = isB3Open() ? CACHE_PRICES_MS : CACHE_PRICES_CLOSED_MS;
  if (isCacheValid(_cache.lastPrices, pricesTTL) && allTickersInCache(tickers, _cache.prices)) {
    var cached = {};
    for (var c = 0; c < tickers.length; c++) {
      cached[tickers[c]] = _cache.prices[tickers[c]];
    }
    return cached;
  }

  var prices = {};

  // Buscar em chunks para nao exceder limite da brapi
  for (var ci = 0; ci < tickers.length; ci += CHUNK_SIZE) {
    var chunk = tickers.slice(ci, ci + CHUNK_SIZE);
    try {
      var tickerStr = chunk.join(',');
      var url = buildUrl(tickerStr, {});
      var response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) continue;

      var json = await response.json();
      var results = json.results || [];

      for (var i = 0; i < results.length; i++) {
        var r = results[i];
        if (r.symbol && r.regularMarketPrice != null) {
          var entry = {
            price: r.regularMarketPrice,
            change: r.regularMarketChange || 0,
            changePercent: r.regularMarketChangePercent || 0,
            previousClose: r.regularMarketPreviousClose || 0,
            updatedAt: r.regularMarketTime || null,
            marketCap: r.marketCap || 0,
          };
          prices[r.symbol] = entry;
          _cache.prices[r.symbol] = entry;
        }
      }
    } catch (err) {
      console.warn('fetchPrices chunk error:', err.message);
    }
  }

  _cache.lastPrices = Date.now();
  return prices;
}

// ══════════ FETCH HISTORY ══════════
export async function fetchPriceHistory(tickers) {
  if (!tickers || tickers.length === 0) return {};

  // Check cache (TTL mais longo quando bolsa fechada)
  var histTTL = isB3Open() ? CACHE_HISTORY_MS : CACHE_HISTORY_CLOSED_MS;
  if (isCacheValid(_cache.lastHistory, histTTL) && allTickersInCache(tickers, _cache.history)) {
    var cached = {};
    for (var c = 0; c < tickers.length; c++) {
      cached[tickers[c]] = _cache.history[tickers[c]];
    }
    return cached;
  }

  var history = {};

  for (var ci = 0; ci < tickers.length; ci += CHUNK_SIZE) {
    var chunk = tickers.slice(ci, ci + CHUNK_SIZE);
    try {
      var tickerStr = chunk.join(',');
      var url = buildUrl(tickerStr, { range: '1mo', interval: '1d' });
      var response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) continue;

      var json = await response.json();
      var results = json.results || [];

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
    } catch (err) {
      console.warn('fetchPriceHistory chunk error:', err.message);
    }
  }

  _cache.lastHistory = Date.now();
  return history;
}

// ══════════ FETCH HISTORY LONG (6 months OHLCV) ══════════
var CACHE_HISTORY_LONG_MS = 3600000; // 1h
var CACHE_HISTORY_LONG_CLOSED_MS = 14400000; // 4h quando fechado

export async function fetchPriceHistoryLong(tickers) {
  if (!tickers || tickers.length === 0) return {};

  // Check cache (TTL mais longo quando bolsa fechada)
  var histLongTTL = isB3Open() ? CACHE_HISTORY_LONG_MS : CACHE_HISTORY_LONG_CLOSED_MS;
  if (isCacheValid(_cache.lastHistoryLong, histLongTTL) && allTickersInCache(tickers, _cache.historyLong || {})) {
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

// ══════════ FETCH HISTORY RANGE (variable period OHLCV) ══════════
var _rangeCache = {};
var CACHE_RANGE_MS = 3600000; // 1h
var CACHE_RANGE_CLOSED_MS = 14400000; // 4h quando fechado

export async function fetchPriceHistoryRange(tickers, range) {
  if (!tickers || tickers.length === 0) return {};
  var rng = range || '6mo';

  // Check cache keyed by ticker:range
  var allCached = true;
  for (var ck = 0; ck < tickers.length; ck++) {
    var ckey = tickers[ck] + ':' + rng;
    var entry = _rangeCache[ckey];
    var rangeTTL = isB3Open() ? CACHE_RANGE_MS : CACHE_RANGE_CLOSED_MS;
    if (!entry || (Date.now() - entry.ts > rangeTTL)) {
      allCached = false;
      break;
    }
  }
  if (allCached) {
    var cached = {};
    for (var cc = 0; cc < tickers.length; cc++) {
      cached[tickers[cc]] = _rangeCache[tickers[cc] + ':' + rng].data;
    }
    return cached;
  }

  var result = {};
  for (var t = 0; t < tickers.length; t++) {
    try {
      var ticker = tickers[t];
      var url = buildUrl(ticker, { range: rng, interval: '1d' });
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
        _rangeCache[ticker + ':' + rng] = { data: ohlcv, ts: Date.now() };
      }
    } catch (err) {
      console.warn('fetchPriceHistoryRange error for ' + tickers[t] + ':', err.message);
    }
  }
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

  // Separar tickers BR vs INT
  var brTickers = [];
  var intTickers = [];
  for (var i = 0; i < positions.length; i++) {
    if (!positions[i].ticker) continue;
    if (positions[i].mercado === 'INT') {
      intTickers.push(positions[i].ticker);
    } else {
      brTickers.push(positions[i].ticker);
    }
  }

  // Buscar precos em paralelo: BR via brapi, INT via Yahoo
  var promises = [
    brTickers.length > 0 ? fetchPrices(brTickers) : Promise.resolve({}),
    intTickers.length > 0 ? fetchYahooPrices(intTickers) : Promise.resolve({}),
    intTickers.length > 0 ? fetchExchangeRates(['USD']) : Promise.resolve({ BRL: 1, USD: 1 }),
  ];
  var results = await Promise.all(promises);
  var brPrices = results[0];
  var intPrices = results[1];
  var rates = results[2];
  var usdRate = (rates && rates.USD) || 1;

  var enriched = [];
  for (var k = 0; k < positions.length; k++) {
    var p = positions[k];
    var isInt = p.mercado === 'INT';
    var quote = isInt ? intPrices[p.ticker] : brPrices[p.ticker];

    if (!quote) {
      var copy = {};
      var pKeys = Object.keys(p);
      for (var c = 0; c < pKeys.length; c++) { copy[pKeys[c]] = p[pKeys[c]]; }
      copy.preco_atual = null;
      copy.preco_atual_usd = null;
      copy.variacao_pct = null;
      copy.pl = null;
      copy.change_day = null;
      copy.marketCap = 0;
      enriched.push(copy);
      continue;
    }

    var precoOriginal = quote.price;
    var pm = p.pm || 0;
    var qty = p.quantidade || 0;

    // Para INT: preco em USD, PM em USD, P&L em USD depois converte
    // preco_atual sempre em BRL (compatibilidade com todo o app)
    var precoAtualBRL = isInt ? precoOriginal * usdRate : precoOriginal;
    var pmBRL = isInt ? pm * usdRate : pm;
    var variacao_pct = pm > 0 ? ((precoOriginal - pm) / pm) * 100 : 0;
    var pl = (precoAtualBRL - pmBRL) * qty;
    var change_day = quote.changePercent || 0;

    var enrichedItem = {};
    var eKeys = Object.keys(p);
    for (var e = 0; e < eKeys.length; e++) { enrichedItem[eKeys[e]] = p[eKeys[e]]; }
    enrichedItem.preco_atual = precoAtualBRL;
    enrichedItem.preco_atual_usd = isInt ? precoOriginal : null;
    enrichedItem.variacao_pct = variacao_pct;
    enrichedItem.pl = pl;
    enrichedItem.change_day = change_day;
    enrichedItem.marketCap = quote.marketCap || 0;
    enrichedItem.moeda = isInt ? 'USD' : 'BRL';
    enrichedItem.taxa_cambio = isInt ? usdRate : null;
    // Reclassificar stock_int como etf quando Yahoo diz que e ETF
    if (isInt && quote.instrumentType === 'ETF' && enrichedItem.categoria === 'stock_int') {
      enrichedItem.categoria = 'etf';
    }
    enriched.push(enrichedItem);
  }

  return enriched;
}

// ══════════ ROUTED FETCH (BR vs INT) ══════════
export async function fetchPricesRouted(tickers, mercadoMap) {
  if (!tickers || tickers.length === 0) return {};
  var brTickers = [];
  var intTickers = [];
  for (var i = 0; i < tickers.length; i++) {
    if (mercadoMap && mercadoMap[tickers[i]] === 'INT') {
      intTickers.push(tickers[i]);
    } else {
      brTickers.push(tickers[i]);
    }
  }
  var results = await Promise.all([
    brTickers.length > 0 ? fetchPrices(brTickers) : Promise.resolve({}),
    intTickers.length > 0 ? fetchYahooPrices(intTickers) : Promise.resolve({}),
  ]);
  var merged = {};
  var brKeys = Object.keys(results[0]);
  for (var b = 0; b < brKeys.length; b++) { merged[brKeys[b]] = results[0][brKeys[b]]; }
  var intKeys = Object.keys(results[1]);
  for (var n = 0; n < intKeys.length; n++) { merged[intKeys[n]] = results[1][intKeys[n]]; }
  return merged;
}

export async function fetchHistoryRouted(tickers, mercadoMap) {
  if (!tickers || tickers.length === 0) return {};
  var brTickers = [];
  var intTickers = [];
  for (var i = 0; i < tickers.length; i++) {
    if (mercadoMap && mercadoMap[tickers[i]] === 'INT') {
      intTickers.push(tickers[i]);
    } else {
      brTickers.push(tickers[i]);
    }
  }
  var results = await Promise.all([
    brTickers.length > 0 ? fetchPriceHistory(brTickers) : Promise.resolve({}),
    intTickers.length > 0 ? fetchYahooHistory(intTickers) : Promise.resolve({}),
  ]);
  var merged = {};
  var brKeys = Object.keys(results[0]);
  for (var b = 0; b < brKeys.length; b++) { merged[brKeys[b]] = results[0][brKeys[b]]; }
  var intKeys = Object.keys(results[1]);
  for (var n = 0; n < intKeys.length; n++) { merged[intKeys[n]] = results[1][intKeys[n]]; }
  return merged;
}

export async function fetchHistoryLongRouted(tickers, mercadoMap) {
  if (!tickers || tickers.length === 0) return {};
  var brTickers = [];
  var intTickers = [];
  for (var i = 0; i < tickers.length; i++) {
    if (mercadoMap && mercadoMap[tickers[i]] === 'INT') {
      intTickers.push(tickers[i]);
    } else {
      brTickers.push(tickers[i]);
    }
  }
  var results = await Promise.all([
    brTickers.length > 0 ? fetchPriceHistoryLong(brTickers) : Promise.resolve({}),
    intTickers.length > 0 ? fetchYahooHistoryLong(intTickers) : Promise.resolve({}),
  ]);
  var merged = {};
  var brKeys = Object.keys(results[0]);
  for (var b = 0; b < brKeys.length; b++) { merged[brKeys[b]] = results[0][brKeys[b]]; }
  var intKeys = Object.keys(results[1]);
  for (var n = 0; n < intKeys.length; n++) { merged[intKeys[n]] = results[1][intKeys[n]]; }
  return merged;
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
