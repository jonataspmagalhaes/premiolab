// ═══════════════════════════════════════════════════
// CURRENCY SERVICE — Câmbio via brapi.dev + cache
// ═══════════════════════════════════════════════════

var BRAPI_TOKEN = 'tEU8wyBixv8hCi7J3NCjsi';
var CACHE_TTL = 30 * 60 * 1000; // 30 minutos

var _ratesCache = null;
var _ratesCacheTime = 0;

// ── Lista compacta legada (compat) ──
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

// ── Lista completa ~160 moedas ISO 4217 ──
var ALL_CURRENCIES = [
  { code: 'AED', symbol: 'د.إ', name: 'Dirham dos Emirados' },
  { code: 'AFN', symbol: '؋', name: 'Afghani' },
  { code: 'ALL', symbol: 'L', name: 'Lek albanês' },
  { code: 'AMD', symbol: '֏', name: 'Dram armênio' },
  { code: 'ANG', symbol: 'ƒ', name: 'Florim antilhano' },
  { code: 'AOA', symbol: 'Kz', name: 'Kwanza angolano' },
  { code: 'ARS', symbol: 'AR$', name: 'Peso argentino' },
  { code: 'AUD', symbol: 'A$', name: 'Dólar australiano' },
  { code: 'AWG', symbol: 'ƒ', name: 'Florim arubano' },
  { code: 'AZN', symbol: '₼', name: 'Manat azerbaijano' },
  { code: 'BAM', symbol: 'KM', name: 'Marco conversível' },
  { code: 'BBD', symbol: 'Bds$', name: 'Dólar de Barbados' },
  { code: 'BDT', symbol: '৳', name: 'Taka de Bangladesh' },
  { code: 'BGN', symbol: 'лв', name: 'Lev búlgaro' },
  { code: 'BHD', symbol: '.د.ب', name: 'Dinar do Bahrein' },
  { code: 'BIF', symbol: 'FBu', name: 'Franco do Burundi' },
  { code: 'BMD', symbol: 'BD$', name: 'Dólar das Bermudas' },
  { code: 'BND', symbol: 'B$', name: 'Dólar de Brunei' },
  { code: 'BOB', symbol: 'Bs', name: 'Boliviano' },
  { code: 'BRL', symbol: 'R$', name: 'Real brasileiro' },
  { code: 'BSD', symbol: 'B$', name: 'Dólar das Bahamas' },
  { code: 'BTN', symbol: 'Nu', name: 'Ngultrum butanês' },
  { code: 'BWP', symbol: 'P', name: 'Pula de Botsuana' },
  { code: 'BYN', symbol: 'Br', name: 'Rublo bielorrusso' },
  { code: 'BZD', symbol: 'BZ$', name: 'Dólar de Belize' },
  { code: 'CAD', symbol: 'C$', name: 'Dólar canadense' },
  { code: 'CDF', symbol: 'FC', name: 'Franco congolês' },
  { code: 'CHF', symbol: 'CHF', name: 'Franco suíço' },
  { code: 'CLP', symbol: 'CL$', name: 'Peso chileno' },
  { code: 'CNY', symbol: '¥', name: 'Yuan chinês' },
  { code: 'COP', symbol: 'CO$', name: 'Peso colombiano' },
  { code: 'CRC', symbol: '₡', name: 'Colón costa-riquenho' },
  { code: 'CUP', symbol: '$MN', name: 'Peso cubano' },
  { code: 'CVE', symbol: '$', name: 'Escudo cabo-verdiano' },
  { code: 'CZK', symbol: 'Kč', name: 'Coroa tcheca' },
  { code: 'DJF', symbol: 'Fdj', name: 'Franco do Djibuti' },
  { code: 'DKK', symbol: 'kr', name: 'Coroa dinamarquesa' },
  { code: 'DOP', symbol: 'RD$', name: 'Peso dominicano' },
  { code: 'DZD', symbol: 'د.ج', name: 'Dinar argelino' },
  { code: 'EGP', symbol: 'E£', name: 'Libra egípcia' },
  { code: 'ERN', symbol: 'Nfk', name: 'Nakfa eritreia' },
  { code: 'ETB', symbol: 'Br', name: 'Birr etíope' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'FJD', symbol: 'FJ$', name: 'Dólar fijiano' },
  { code: 'FKP', symbol: '£', name: 'Libra das Malvinas' },
  { code: 'GBP', symbol: '£', name: 'Libra esterlina' },
  { code: 'GEL', symbol: '₾', name: 'Lari georgiano' },
  { code: 'GHS', symbol: 'GH₵', name: 'Cedi ganês' },
  { code: 'GIP', symbol: '£', name: 'Libra de Gibraltar' },
  { code: 'GMD', symbol: 'D', name: 'Dalasi gambiano' },
  { code: 'GNF', symbol: 'FG', name: 'Franco guineano' },
  { code: 'GTQ', symbol: 'Q', name: 'Quetzal guatemalteco' },
  { code: 'GYD', symbol: 'GY$', name: 'Dólar guianense' },
  { code: 'HKD', symbol: 'HK$', name: 'Dólar de Hong Kong' },
  { code: 'HNL', symbol: 'L', name: 'Lempira hondurenha' },
  { code: 'HRK', symbol: 'kn', name: 'Kuna croata' },
  { code: 'HTG', symbol: 'G', name: 'Gourde haitiano' },
  { code: 'HUF', symbol: 'Ft', name: 'Florim húngaro' },
  { code: 'IDR', symbol: 'Rp', name: 'Rupia indonésia' },
  { code: 'ILS', symbol: '₪', name: 'Shekel israelense' },
  { code: 'INR', symbol: '₹', name: 'Rupia indiana' },
  { code: 'IQD', symbol: 'ع.د', name: 'Dinar iraquiano' },
  { code: 'IRR', symbol: '﷼', name: 'Rial iraniano' },
  { code: 'ISK', symbol: 'kr', name: 'Coroa islandesa' },
  { code: 'JMD', symbol: 'J$', name: 'Dólar jamaicano' },
  { code: 'JOD', symbol: 'د.ا', name: 'Dinar jordaniano' },
  { code: 'JPY', symbol: '¥', name: 'Iene japonês' },
  { code: 'KES', symbol: 'KSh', name: 'Xelim queniano' },
  { code: 'KGS', symbol: 'сом', name: 'Som quirguiz' },
  { code: 'KHR', symbol: '៛', name: 'Riel cambojano' },
  { code: 'KMF', symbol: 'CF', name: 'Franco comoriano' },
  { code: 'KRW', symbol: '₩', name: 'Won sul-coreano' },
  { code: 'KWD', symbol: 'د.ك', name: 'Dinar kuwaitiano' },
  { code: 'KYD', symbol: 'CI$', name: 'Dólar das Ilhas Cayman' },
  { code: 'KZT', symbol: '₸', name: 'Tenge cazaque' },
  { code: 'LAK', symbol: '₭', name: 'Kip laosiano' },
  { code: 'LBP', symbol: 'L£', name: 'Libra libanesa' },
  { code: 'LKR', symbol: 'Rs', name: 'Rupia do Sri Lanka' },
  { code: 'LRD', symbol: 'L$', name: 'Dólar liberiano' },
  { code: 'LSL', symbol: 'L', name: 'Loti do Lesoto' },
  { code: 'LYD', symbol: 'ل.د', name: 'Dinar líbio' },
  { code: 'MAD', symbol: 'د.م.', name: 'Dirham marroquino' },
  { code: 'MDL', symbol: 'L', name: 'Leu moldavo' },
  { code: 'MGA', symbol: 'Ar', name: 'Ariary malgaxe' },
  { code: 'MKD', symbol: 'ден', name: 'Dinar macedônio' },
  { code: 'MMK', symbol: 'K', name: 'Quiate birmanês' },
  { code: 'MNT', symbol: '₮', name: 'Tugrik mongol' },
  { code: 'MOP', symbol: 'MOP$', name: 'Pataca macaense' },
  { code: 'MRU', symbol: 'UM', name: 'Uguia mauritana' },
  { code: 'MUR', symbol: '₨', name: 'Rupia mauriciana' },
  { code: 'MVR', symbol: 'Rf', name: 'Rufia maldiva' },
  { code: 'MWK', symbol: 'MK', name: 'Kwacha malauiana' },
  { code: 'MXN', symbol: 'MX$', name: 'Peso mexicano' },
  { code: 'MYR', symbol: 'RM', name: 'Ringgit malaio' },
  { code: 'MZN', symbol: 'MT', name: 'Metical moçambicano' },
  { code: 'NAD', symbol: 'N$', name: 'Dólar namibiano' },
  { code: 'NGN', symbol: '₦', name: 'Naira nigeriana' },
  { code: 'NIO', symbol: 'C$', name: 'Córdoba nicaraguense' },
  { code: 'NOK', symbol: 'kr', name: 'Coroa norueguesa' },
  { code: 'NPR', symbol: 'Rs', name: 'Rupia nepalesa' },
  { code: 'NZD', symbol: 'NZ$', name: 'Dólar neozelandês' },
  { code: 'OMR', symbol: 'ر.ع.', name: 'Rial omanense' },
  { code: 'PAB', symbol: 'B/.', name: 'Balboa panamenho' },
  { code: 'PEN', symbol: 'S/.', name: 'Sol peruano' },
  { code: 'PGK', symbol: 'K', name: 'Kina papua' },
  { code: 'PHP', symbol: '₱', name: 'Peso filipino' },
  { code: 'PKR', symbol: '₨', name: 'Rupia paquistanesa' },
  { code: 'PLN', symbol: 'zł', name: 'Zloti polonês' },
  { code: 'PYG', symbol: '₲', name: 'Guarani paraguaio' },
  { code: 'QAR', symbol: 'QR', name: 'Rial catarense' },
  { code: 'RON', symbol: 'lei', name: 'Leu romeno' },
  { code: 'RSD', symbol: 'din', name: 'Dinar sérvio' },
  { code: 'RUB', symbol: '₽', name: 'Rublo russo' },
  { code: 'RWF', symbol: 'RF', name: 'Franco ruandês' },
  { code: 'SAR', symbol: 'ر.س', name: 'Rial saudita' },
  { code: 'SBD', symbol: 'SI$', name: 'Dólar das Ilhas Salomão' },
  { code: 'SCR', symbol: '₨', name: 'Rupia seichelense' },
  { code: 'SDG', symbol: 'ج.س.', name: 'Libra sudanesa' },
  { code: 'SEK', symbol: 'kr', name: 'Coroa sueca' },
  { code: 'SGD', symbol: 'S$', name: 'Dólar de Singapura' },
  { code: 'SHP', symbol: '£', name: 'Libra de Santa Helena' },
  { code: 'SLE', symbol: 'Le', name: 'Leone de Serra Leoa' },
  { code: 'SOS', symbol: 'Sh', name: 'Xelim somali' },
  { code: 'SRD', symbol: 'SR$', name: 'Dólar surinamês' },
  { code: 'SSP', symbol: '£', name: 'Libra sul-sudanesa' },
  { code: 'STN', symbol: 'Db', name: 'Dobra são-tomense' },
  { code: 'SYP', symbol: '£S', name: 'Libra síria' },
  { code: 'SZL', symbol: 'E', name: 'Lilangeni suázi' },
  { code: 'THB', symbol: '฿', name: 'Baht tailandês' },
  { code: 'TJS', symbol: 'SM', name: 'Somoni tadjique' },
  { code: 'TMT', symbol: 'T', name: 'Manat turcomeno' },
  { code: 'TND', symbol: 'د.ت', name: 'Dinar tunisiano' },
  { code: 'TOP', symbol: 'T$', name: 'Paanga tonganesa' },
  { code: 'TRY', symbol: '₺', name: 'Lira turca' },
  { code: 'TTD', symbol: 'TT$', name: 'Dólar de Trinidad' },
  { code: 'TWD', symbol: 'NT$', name: 'Dólar taiwanês' },
  { code: 'TZS', symbol: 'TSh', name: 'Xelim tanzaniano' },
  { code: 'UAH', symbol: '₴', name: 'Hryvnia ucraniana' },
  { code: 'UGX', symbol: 'USh', name: 'Xelim ugandense' },
  { code: 'USD', symbol: 'US$', name: 'Dólar americano' },
  { code: 'UYU', symbol: '$U', name: 'Peso uruguaio' },
  { code: 'UZS', symbol: 'сўм', name: 'Som uzbeque' },
  { code: 'VES', symbol: 'Bs.S', name: 'Bolívar venezuelano' },
  { code: 'VND', symbol: '₫', name: 'Dong vietnamita' },
  { code: 'VUV', symbol: 'VT', name: 'Vatu de Vanuatu' },
  { code: 'WST', symbol: 'WS$', name: 'Tala samoano' },
  { code: 'XAF', symbol: 'FCFA', name: 'Franco CFA Central' },
  { code: 'XCD', symbol: 'EC$', name: 'Dólar do Caribe Oriental' },
  { code: 'XOF', symbol: 'CFA', name: 'Franco CFA Ocidental' },
  { code: 'XPF', symbol: '₣', name: 'Franco CFP' },
  { code: 'YER', symbol: '﷼', name: 'Rial iemenita' },
  { code: 'ZAR', symbol: 'R', name: 'Rand sul-africano' },
  { code: 'ZMW', symbol: 'ZK', name: 'Kwacha zambiano' },
  { code: 'ZWL', symbol: 'Z$', name: 'Dólar zimbabuano' },
];

// ── Lookup rápido code → symbol ──
var _symbolMap = {};
for (var _si = 0; _si < ALL_CURRENCIES.length; _si++) {
  _symbolMap[ALL_CURRENCIES[_si].code] = ALL_CURRENCIES[_si].symbol;
}

function getSymbol(moeda) {
  if (!moeda) return '';
  if (_symbolMap[moeda]) return _symbolMap[moeda];
  // Fallback legado
  for (var i = 0; i < MOEDAS.length; i++) {
    if (MOEDAS[i].code === moeda) return MOEDAS[i].symbol;
  }
  return moeda;
}

function searchCurrencies(query) {
  if (!query || query.length < 1) return ALL_CURRENCIES.slice(0, 20);
  var q = query.toLowerCase();
  var exact = [];
  var starts = [];
  var contains = [];
  for (var i = 0; i < ALL_CURRENCIES.length; i++) {
    var c = ALL_CURRENCIES[i];
    var codeLower = c.code.toLowerCase();
    var nameLower = c.name.toLowerCase();
    if (codeLower === q) {
      exact.push(c);
    } else if (codeLower.indexOf(q) === 0 || nameLower.indexOf(q) === 0) {
      starts.push(c);
    } else if (codeLower.indexOf(q) >= 0 || nameLower.indexOf(q) >= 0) {
      contains.push(c);
    }
  }
  return exact.concat(starts).concat(contains);
}

function getCurrencyName(code) {
  for (var i = 0; i < ALL_CURRENCIES.length; i++) {
    if (ALL_CURRENCIES[i].code === code) return ALL_CURRENCIES[i].name;
  }
  return code;
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

export { MOEDAS, ALL_CURRENCIES, getSymbol, searchCurrencies, getCurrencyName, fetchExchangeRates, convertToBRL };
