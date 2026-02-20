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

async function fetchFromBrapi(moedas) {
  var rates = {};
  var pairs = [];
  for (var i = 0; i < moedas.length; i++) {
    pairs.push(moedas[i] + '-BRL');
  }
  try {
    var url = 'https://brapi.dev/api/v2/currency?currency=' + pairs.join(',') + '&token=' + BRAPI_TOKEN;
    var response = await fetch(url);
    var json = await response.json();
    var currencies = json.currency || [];
    for (var ri = 0; ri < currencies.length; ri++) {
      var curr = currencies[ri];
      var fromCode = curr.fromCurrency || '';
      var bid = parseFloat(curr.bidPrice) || 0;
      if (fromCode && bid > 0) {
        rates[fromCode] = bid;
      }
    }
  } catch (err) {
    console.warn('[currencyService] brapi erro:', err);
  }
  return rates;
}

async function fetchFromErApi(moedas) {
  // open.er-api.com — gratuita, suporta todas as moedas (QAR, etc.)
  // Retorna rates de BRL para todas as moedas, invertemos para obter X-BRL
  var rates = {};
  try {
    var url = 'https://open.er-api.com/v6/latest/BRL';
    var response = await fetch(url);
    var json = await response.json();
    if (json.result === 'success' && json.rates) {
      for (var i = 0; i < moedas.length; i++) {
        var code = moedas[i];
        var rateBrlToX = json.rates[code];
        if (rateBrlToX && rateBrlToX > 0) {
          // Inverter: 1 X = (1/rateBrlToX) BRL
          rates[code] = 1 / rateBrlToX;
        }
      }
    }
  } catch (err) {
    console.warn('[currencyService] er-api erro:', err);
  }
  return rates;
}

async function fetchExchangeRates(moedas) {
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

  // 1. Tentar brapi primeiro (mais preciso para moedas principais)
  var brapiRates = await fetchFromBrapi(uniqueMoedas);
  var brapiKeys = Object.keys(brapiRates);
  for (var bk = 0; bk < brapiKeys.length; bk++) {
    rates[brapiKeys[bk]] = brapiRates[brapiKeys[bk]];
  }

  // 2. Moedas que faltaram — buscar via er-api (fallback)
  var faltando = [];
  for (var fi = 0; fi < uniqueMoedas.length; fi++) {
    if (rates[uniqueMoedas[fi]] === undefined) {
      faltando.push(uniqueMoedas[fi]);
    }
  }
  if (faltando.length > 0) {
    var erRates = await fetchFromErApi(faltando);
    var erKeys = Object.keys(erRates);
    for (var ek = 0; ek < erKeys.length; ek++) {
      rates[erKeys[ek]] = erRates[erKeys[ek]];
    }
  }

  // Atualizar cache
  _ratesCache = {};
  var rateKeys = Object.keys(rates);
  for (var rk = 0; rk < rateKeys.length; rk++) {
    _ratesCache[rateKeys[rk]] = rates[rateKeys[rk]];
  }
  _ratesCacheTime = now;

  return rates;
}

function convertToBRL(valor, moeda, rates) {
  if (!moeda || moeda === 'BRL') return valor;
  var rate = (rates && rates[moeda]) || 1;
  return valor * rate;
}

export { MOEDAS, getSymbol, fetchExchangeRates, convertToBRL };
