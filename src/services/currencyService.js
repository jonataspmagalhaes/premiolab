// ═══════════════════════════════════════════════════
// CURRENCY SERVICE — Câmbio via brapi.dev + cache
// ═══════════════════════════════════════════════════

var BRAPI_TOKEN = 'tEU8wyBixv8hCi7J3NCjsi';
var CACHE_TTL = 30 * 60 * 1000; // 30 minutos

var _ratesCache = null;
var _ratesCacheTime = 0;

var MOEDAS = [
  { code: 'BRL', symbol: 'R$', name: 'Real' },
  { code: 'USD', symbol: 'US$', name: 'Dólar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'Libra' },
  { code: 'QAR', symbol: 'QR', name: 'Rial Catarense' },
  { code: 'ARS', symbol: 'AR$', name: 'Peso Argentino' },
  { code: 'JPY', symbol: '¥', name: 'Iene' },
  { code: 'CHF', symbol: 'CHF', name: 'Franco Suíço' },
];

function getSymbol(moeda) {
  for (var i = 0; i < MOEDAS.length; i++) {
    if (MOEDAS[i].code === moeda) return MOEDAS[i].symbol;
  }
  return moeda;
}

async function fetchExchangeRates(moedas) {
  // Sempre inclui BRL: 1
  var rates = { BRL: 1 };

  if (!moedas || moedas.length === 0) return rates;

  // Filtrar BRL e duplicatas
  var uniqueMoedas = [];
  for (var i = 0; i < moedas.length; i++) {
    if (moedas[i] !== 'BRL' && uniqueMoedas.indexOf(moedas[i]) === -1) {
      uniqueMoedas.push(moedas[i]);
    }
  }
  if (uniqueMoedas.length === 0) return rates;

  // Checar cache
  var now = Date.now();
  if (_ratesCache && (now - _ratesCacheTime) < CACHE_TTL) {
    var allCached = true;
    for (var ci = 0; ci < uniqueMoedas.length; ci++) {
      if (_ratesCache[uniqueMoedas[ci]] === undefined) {
        allCached = false;
        break;
      }
    }
    if (allCached) {
      var cached = { BRL: 1 };
      for (var ck = 0; ck < uniqueMoedas.length; ck++) {
        cached[uniqueMoedas[ck]] = _ratesCache[uniqueMoedas[ck]];
      }
      return cached;
    }
  }

  // Montar pares para brapi
  var pairs = [];
  for (var pi = 0; pi < uniqueMoedas.length; pi++) {
    pairs.push(uniqueMoedas[pi] + '-BRL');
  }

  try {
    var url = 'https://brapi.dev/api/v2/currency?currency=' + pairs.join(',') + '&token=' + BRAPI_TOKEN;
    var response = await fetch(url);
    var json = await response.json();

    var currencies = json.currency || [];
    for (var ri = 0; ri < currencies.length; ri++) {
      var curr = currencies[ri];
      // brapi retorna { fromCurrency: 'USD', toCurrency: 'BRL', bidPrice: '5.12', ... }
      var fromCode = curr.fromCurrency || '';
      var bid = parseFloat(curr.bidPrice) || 0;
      if (fromCode && bid > 0) {
        rates[fromCode] = bid;
      }
    }

    // Atualizar cache
    _ratesCache = {};
    var rateKeys = Object.keys(rates);
    for (var rk = 0; rk < rateKeys.length; rk++) {
      _ratesCache[rateKeys[rk]] = rates[rateKeys[rk]];
    }
    _ratesCacheTime = now;
  } catch (err) {
    console.warn('[currencyService] Erro ao buscar câmbio:', err);
    // Retorna rates parciais (BRL: 1 + o que tiver no cache)
    if (_ratesCache) {
      for (var fi = 0; fi < uniqueMoedas.length; fi++) {
        if (_ratesCache[uniqueMoedas[fi]] !== undefined) {
          rates[uniqueMoedas[fi]] = _ratesCache[uniqueMoedas[fi]];
        }
      }
    }
  }

  return rates;
}

function convertToBRL(valor, moeda, rates) {
  if (!moeda || moeda === 'BRL') return valor;
  var rate = (rates && rates[moeda]) || 1;
  return valor * rate;
}

export { MOEDAS, getSymbol, fetchExchangeRates, convertToBRL };
