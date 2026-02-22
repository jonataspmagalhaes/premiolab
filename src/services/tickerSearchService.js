/**
 * tickerSearchService.js
 * Busca e validacao de tickers via brapi.dev (BR) e Yahoo Finance (INT)
 * Cache 24h por query + debounce no componente
 */

var BRAPI_TOKEN = 'tEU8wyBixv8hCi7J3NCjsi';
var BRAPI_SEARCH_URL = 'https://brapi.dev/api/quote/list';
var YAHOO_SEARCH_URL = 'https://query1.finance.yahoo.com/v1/finance/search';
var FETCH_TIMEOUT = 5000;
var CACHE_TTL = 86400000; // 24h
var _searchCache = {};

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

function isCacheValid(entry) {
  if (!entry || !entry.ts) return false;
  return (Date.now() - entry.ts) < CACHE_TTL;
}

// ══════════ SEARCH BR (brapi.dev) ══════════
function searchBR(query) {
  var url = BRAPI_SEARCH_URL + '?search=' + encodeURIComponent(query) + '&token=' + BRAPI_TOKEN + '&limit=8';
  return fetchWithTimeout(url, FETCH_TIMEOUT).then(function(response) {
    if (!response.ok) return [];
    return response.json().then(function(json) {
      var stocks = (json && json.stocks) || [];
      var results = [];
      for (var i = 0; i < stocks.length; i++) {
        var item = stocks[i];
        if (item && item.stock) {
          results.push({
            ticker: item.stock,
            name: item.name || '',
            type: item.type || '',
            exchange: 'B3',
          });
        }
      }
      return results;
    });
  }).catch(function(err) {
    console.warn('searchBR error:', err.message);
    return [];
  });
}

// ══════════ SEARCH INT (Yahoo Finance) ══════════
function searchINT(query) {
  var url = YAHOO_SEARCH_URL + '?q=' + encodeURIComponent(query) + '&quotesCount=8&lang=pt-BR';
  return fetchWithTimeout(url, FETCH_TIMEOUT).then(function(response) {
    if (!response.ok) return [];
    return response.json().then(function(json) {
      var quotes = (json && json.quotes) || [];
      var results = [];
      for (var i = 0; i < quotes.length; i++) {
        var item = quotes[i];
        if (!item) continue;
        var qType = item.quoteType || '';
        if (qType !== 'EQUITY' && qType !== 'ETF') continue;
        results.push({
          ticker: item.symbol || '',
          name: item.longname || item.shortname || '',
          type: qType,
          exchange: item.exchange || '',
        });
      }
      return results;
    });
  }).catch(function(err) {
    console.warn('searchINT error:', err.message);
    return [];
  });
}

// ══════════ ROTEADOR PRINCIPAL ══════════
export function searchTickers(query, mercado) {
  if (!query || query.length < 2) return Promise.resolve([]);

  var cacheKey = mercado + ':' + query.toUpperCase();
  var cached = _searchCache[cacheKey];
  if (cached && isCacheValid(cached)) {
    return Promise.resolve(cached.data);
  }

  var searchFn = mercado === 'INT' ? searchINT : searchBR;

  return searchFn(query).then(function(results) {
    _searchCache[cacheKey] = { data: results, ts: Date.now() };
    return results;
  }).catch(function() {
    return [];
  });
}

export function clearSearchCache() {
  _searchCache = {};
}
