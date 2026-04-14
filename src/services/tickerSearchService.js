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

// ══════════ LOOKUP AUTORITATIVO DE TICKER ══════════
// Consulta brapi (BR) e Yahoo (INT) para determinar onde o ticker existe e qual seu tipo.
// Usado para validar o cadastro antes de inserir operacao/opcao/provento.
//
// Retorna:
//   {
//     found: boolean,            // true se achou em alguma fonte
//     mercado: 'BR'|'INT'|null,  // onde foi encontrado (se em ambos, prioriza BR)
//     sources: { br: {...}|null, int: {...}|null },
//     suggestedCategoria: 'acao'|'fii'|'etf'|'stock_int'|null
//     name: string,              // nome da empresa/ativo
//   }
var _lookupCache = {};
var LOOKUP_TTL = 86400000; // 24h

export function lookupTicker(ticker) {
  if (!ticker) return Promise.resolve({ found: false, mercado: null, sources: { br: null, int: null }, suggestedCategoria: null, name: '' });
  var t = String(ticker).toUpperCase().trim();
  if (t.length < 2) return Promise.resolve({ found: false, mercado: null, sources: { br: null, int: null }, suggestedCategoria: null, name: '' });

  var cached = _lookupCache[t];
  if (cached && (Date.now() - cached.ts) < LOOKUP_TTL) {
    return Promise.resolve(cached.data);
  }

  // Busca em paralelo: brapi (BR) e Yahoo (INT)
  return Promise.all([searchBR(t), searchINT(t)]).then(function(results) {
    var brResults = results[0] || [];
    var intResults = results[1] || [];

    // Match EXATO por ticker (case-insensitive)
    var br = null;
    for (var i = 0; i < brResults.length; i++) {
      if ((brResults[i].ticker || '').toUpperCase() === t) { br = brResults[i]; break; }
    }
    var intMatch = null;
    for (var j = 0; j < intResults.length; j++) {
      if ((intResults[j].ticker || '').toUpperCase() === t) { intMatch = intResults[j]; break; }
    }

    // Sugerir categoria com base no tipo retornado
    var suggestedCategoria = null;
    var suggestedMercado = null;
    var name = '';
    if (br) {
      suggestedMercado = 'BR';
      name = br.name || '';
      var brType = String(br.type || '').toLowerCase();
      if (brType === 'fund') suggestedCategoria = 'fii';
      else if (brType === 'bdr') suggestedCategoria = 'acao';
      else if (brType === 'stock') {
        // brapi classifica ETFs BR como 'stock'. Heuristica por sufixo 11 E nome:
        // se termina em 11 e nome tem "ETF" ou "ISHARES" ou similar, e' ETF.
        var nameUpper = name.toUpperCase();
        var isEtfByName = /ETF|ISHARES|INDEX|FTSE|S&P|MSCI|IBOVESPA/.test(nameUpper);
        if (/11$/.test(t) && isEtfByName) suggestedCategoria = 'etf';
        else suggestedCategoria = 'acao';
      }
    } else if (intMatch) {
      suggestedMercado = 'INT';
      name = intMatch.name || '';
      var intType = String(intMatch.type || '').toUpperCase();
      suggestedCategoria = intType === 'ETF' ? 'etf' : 'stock_int';
    }

    var data = {
      found: !!(br || intMatch),
      mercado: suggestedMercado,
      sources: { br: br, int: intMatch },
      suggestedCategoria: suggestedCategoria,
      name: name,
    };

    _lookupCache[t] = { data: data, ts: Date.now() };
    return data;
  }).catch(function(err) {
    console.warn('lookupTicker error for ' + t + ':', err.message);
    // Em erro de rede, retornar "nao sei" — nao bloquear usuario
    return { found: false, mercado: null, sources: { br: null, int: null }, suggestedCategoria: null, name: '', error: err.message };
  });
}

// Helper: validar uma combinacao ticker+categoria+mercado contra lookup.
// Retorna objeto descritivo:
//   {
//     ok: boolean,                    // true se nenhum mismatch critico
//     mismatch: 'mercado'|'categoria'|'not_found'|null,
//     suggestedCategoria: string|null,
//     suggestedMercado: 'BR'|'INT'|null,
//     message: string|null,           // mensagem descritiva para usuario
//     info: lookup result             // lookup bruto
//   }
export function validateTickerCombo(ticker, categoria, mercado) {
  return lookupTicker(ticker).then(function(info) {
    // Nao encontrou em nenhuma fonte — pode ser ticker novo. Avisar mas nao bloquear.
    if (!info.found) {
      // Se teve erro de rede, nao reportar mismatch — deixar passar silenciosamente
      if (info.error) {
        return { ok: true, mismatch: null, suggestedCategoria: null, suggestedMercado: null, message: null, info: info };
      }
      return {
        ok: false,
        mismatch: 'not_found',
        suggestedCategoria: null,
        suggestedMercado: null,
        message: 'Ticker ' + ticker + ' não encontrado em nenhuma fonte. Confirme se está correto antes de continuar.',
        info: info,
      };
    }

    // Mismatch de mercado: user marcou BR mas so existe em INT (ou vice-versa)
    if (info.mercado && mercado && info.mercado !== mercado) {
      var lbl = info.mercado === 'BR' ? 'Brasileiro (BR)' : 'Internacional (INT)';
      return {
        ok: false,
        mismatch: 'mercado',
        suggestedCategoria: info.suggestedCategoria,
        suggestedMercado: info.mercado,
        message: 'Ticker ' + ticker + ' é ' + lbl + ' (' + (info.name || 'sem nome') + '). Deseja trocar o mercado?',
        info: info,
      };
    }

    // Mismatch de categoria (so verificar quando mercado bate)
    if (info.suggestedCategoria && categoria && info.suggestedCategoria !== categoria) {
      var catLbl = {
        'acao': 'Ação',
        'fii': 'FII (Fundo Imobiliário)',
        'etf': 'ETF',
        'stock_int': 'Stock Internacional',
      }[info.suggestedCategoria] || info.suggestedCategoria;
      return {
        ok: false,
        mismatch: 'categoria',
        suggestedCategoria: info.suggestedCategoria,
        suggestedMercado: info.mercado,
        message: 'Ticker ' + ticker + ' parece ser ' + catLbl + ' (' + (info.name || '') + '). Deseja trocar a categoria?',
        info: info,
      };
    }

    return { ok: true, mismatch: null, suggestedCategoria: null, suggestedMercado: null, message: null, info: info };
  }).catch(function() {
    // Erro na validacao nao deve bloquear cadastro
    return { ok: true, mismatch: null, suggestedCategoria: null, suggestedMercado: null, message: null, info: null };
  });
}
