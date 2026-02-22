// ═══════════════════════════════════════════════════════════
// FUNDAMENTAL SERVICE — Indicadores fundamentalistas via API
// brapi.dev (BR) + Yahoo Finance (INT), cache 24h
// ═══════════════════════════════════════════════════════════

var BRAPI_TOKEN = 'tEU8wyBixv8hCi7J3NCjsi';
var CACHE = {};
var CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

function isExpired(entry) {
  return !entry || (Date.now() - entry.ts > CACHE_TTL);
}

function safeNum(v) {
  if (v == null || v === '' || isNaN(v)) return null;
  return Number(v);
}

function pct(v) {
  var n = safeNum(v);
  if (n == null) return null;
  return n * 100;
}

// ═══════════════════════════════════════
// FETCH — brapi.dev (BR)
// ═══════════════════════════════════════
function fetchBrapi(ticker) {
  var url = 'https://brapi.dev/api/quote/' + encodeURIComponent(ticker)
    + '?modules=defaultKeyStatistics,financialData,incomeStatementHistory,balanceSheetHistory'
    + '&token=' + BRAPI_TOKEN;

  return Promise.race([
    fetch(url).then(function(r) { return r.json(); }),
    new Promise(function(_, reject) {
      setTimeout(function() { reject(new Error('timeout')); }, 8000);
    }),
  ]);
}

// ═══════════════════════════════════════
// FETCH — Yahoo Finance (INT)
// ═══════════════════════════════════════
function fetchYahoo(ticker) {
  var url = 'https://query2.finance.yahoo.com/v10/finance/quoteSummary/'
    + encodeURIComponent(ticker)
    + '?modules=defaultKeyStatistics,financialData,incomeStatementHistory,balanceSheetHistory';

  return Promise.race([
    fetch(url).then(function(r) { return r.json(); }),
    new Promise(function(_, reject) {
      setTimeout(function() { reject(new Error('timeout')); }, 8000);
    }),
  ]);
}

// ═══════════════════════════════════════
// NORMALIZE — converte resposta em formato padrão
// ═══════════════════════════════════════
function normalizeBrapi(json) {
  var stock = (json.results && json.results[0]) || {};
  var ks = stock.defaultKeyStatistics || {};
  var fd = stock.financialData || {};
  var isArr = stock.incomeStatementHistory && stock.incomeStatementHistory.incomeStatementHistory;
  var bsArr = stock.balanceSheetHistory && stock.balanceSheetHistory.balanceSheetStatements;
  var incomeStmts = isArr || [];
  var balanceStmts = bsArr || [];

  var marketCap = safeNum(stock.marketCap);
  var ev = safeNum(ks.enterpriseValue);
  var ebitda = safeNum(fd.ebitda);
  var totalDebt = safeNum(fd.totalDebt);
  var totalCash = safeNum(fd.totalCash);
  var totalRevenue = safeNum(fd.totalRevenue);
  var opMargins = safeNum(fd.operatingMargins);

  // Balance sheet mais recente
  var bs0 = balanceStmts[0] || {};
  var totalAssets = safeNum(bs0.totalAssets);
  var totalLiab = safeNum(bs0.totalLiab);
  var shEquity = safeNum(bs0.totalStockholderEquity);
  var longTermDebt = safeNum(bs0.longTermDebt);

  // Income statement mais recente
  var is0 = incomeStmts[0] || {};
  var netIncome = safeNum(is0.netIncome);
  var ebit = safeNum(is0.ebit);

  // Cálculos derivados
  var divLiqEbitda = null;
  if (totalDebt != null && totalCash != null && ebitda != null && ebitda !== 0) {
    divLiqEbitda = (totalDebt - totalCash) / ebitda;
  }

  var passivosAtivos = null;
  if (totalLiab != null && totalAssets != null && totalAssets !== 0) {
    passivosAtivos = totalLiab / totalAssets;
  }

  var plAtivos = null;
  if (shEquity != null && totalAssets != null && totalAssets !== 0) {
    plAtivos = shEquity / totalAssets;
  }

  var evEbit = null;
  if (ev != null && ebit != null && ebit !== 0) {
    evEbit = ev / ebit;
  } else if (ev != null && opMargins != null && totalRevenue != null && opMargins !== 0) {
    var ebitCalc = opMargins * totalRevenue;
    if (ebitCalc !== 0) evEbit = ev / ebitCalc;
  }

  var pAtivo = null;
  if (marketCap != null && totalAssets != null && totalAssets !== 0) {
    pAtivo = marketCap / totalAssets;
  }

  var roic = null;
  if (netIncome != null && shEquity != null && longTermDebt != null) {
    var invested = shEquity + (longTermDebt || 0);
    if (invested !== 0) roic = (netIncome / invested) * 100;
  }

  var giroAtivos = null;
  if (totalRevenue != null && totalAssets != null && totalAssets !== 0) {
    giroAtivos = totalRevenue / totalAssets;
  }

  // CAGR 5 anos
  var cagrReceitas = computeCAGR(incomeStmts, 'totalRevenue', 5);
  var cagrLucros = computeCAGR(incomeStmts, 'netIncome', 5);

  // Histórico 5 anos
  var historico = buildHistorico(incomeStmts, balanceStmts);

  // D.Y. — pegar de earningsPerShare e priceEarnings
  var dy = safeNum(stock.dividendYield);
  if (dy == null && ks.trailingAnnualDividendYield != null) {
    dy = safeNum(ks.trailingAnnualDividendYield);
    if (dy != null) dy = dy * 100;
  }

  return {
    valuation: {
      pl: safeNum(ks.trailingPE) || safeNum(stock.priceEarnings),
      pvp: safeNum(ks.priceToBook),
      evEbitda: safeNum(ks.enterpriseToEbitda),
      evEbit: evEbit,
      vpa: safeNum(ks.bookValue),
      lpa: safeNum(ks.trailingEps) || safeNum(stock.earningsPerShare),
      pAtivo: pAtivo,
      psr: safeNum(ks.enterpriseToRevenue),
      peg: safeNum(ks.pegRatio),
      dy: dy,
    },
    endividamento: {
      divLiqPl: safeNum(fd.debtToEquity),
      divLiqEbitda: divLiqEbitda,
      passivosAtivos: passivosAtivos,
      plAtivos: plAtivos,
    },
    eficiencia: {
      mBruta: pct(fd.grossMargins),
      mEbitda: pct(fd.ebitdaMargins),
      mEbit: pct(fd.operatingMargins),
      mLiquida: pct(fd.profitMargins),
    },
    rentabilidade: {
      roe: pct(fd.returnOnEquity),
      roic: roic,
      roa: pct(fd.returnOnAssets),
      giroAtivos: giroAtivos,
    },
    crescimento: {
      cagrReceitas: cagrReceitas,
      cagrLucros: cagrLucros,
    },
    historico: historico,
  };
}

function normalizeYahoo(json) {
  var result = (json.quoteSummary && json.quoteSummary.result && json.quoteSummary.result[0]) || {};

  // Yahoo wraps values in {raw, fmt} objects
  function raw(obj) {
    if (obj == null) return null;
    if (typeof obj === 'object' && obj.raw != null) return obj.raw;
    return obj;
  }

  var ks = result.defaultKeyStatistics || {};
  var fd = result.financialData || {};
  var isHist = result.incomeStatementHistory || {};
  var bsHist = result.balanceSheetHistory || {};
  var incomeStmts = (isHist.incomeStatementHistory) || [];
  var balanceStmts = (bsHist.balanceSheetStatements) || [];

  // Extrair raw values
  var ev = safeNum(raw(ks.enterpriseValue));
  var ebitda = safeNum(raw(fd.ebitda));
  var totalDebt = safeNum(raw(fd.totalDebt));
  var totalCash = safeNum(raw(fd.totalCash));
  var totalRevenue = safeNum(raw(fd.totalRevenue));

  var bs0 = balanceStmts[0] || {};
  var totalAssets = safeNum(raw(bs0.totalAssets));
  var totalLiab = safeNum(raw(bs0.totalLiab));
  var shEquity = safeNum(raw(bs0.totalStockholderEquity));
  var longTermDebt = safeNum(raw(bs0.longTermDebt));

  var is0 = incomeStmts[0] || {};
  var netIncome = safeNum(raw(is0.netIncome));
  var ebit = safeNum(raw(is0.ebit));

  var divLiqEbitda = null;
  if (totalDebt != null && totalCash != null && ebitda != null && ebitda !== 0) {
    divLiqEbitda = (totalDebt - totalCash) / ebitda;
  }

  var passivosAtivos = (totalLiab != null && totalAssets != null && totalAssets !== 0)
    ? totalLiab / totalAssets : null;
  var plAtivos = (shEquity != null && totalAssets != null && totalAssets !== 0)
    ? shEquity / totalAssets : null;
  var evEbit = (ev != null && ebit != null && ebit !== 0) ? ev / ebit : null;
  var pAtivo = null; // Need marketCap which Yahoo doesn't always provide here
  var roic = null;
  if (netIncome != null && shEquity != null) {
    var invested = shEquity + (longTermDebt || 0);
    if (invested !== 0) roic = (netIncome / invested) * 100;
  }
  var giroAtivos = (totalRevenue != null && totalAssets != null && totalAssets !== 0)
    ? totalRevenue / totalAssets : null;

  // Adaptar incomeStmts para formato do computeCAGR (Yahoo usa {raw,fmt})
  var adaptedIncome = [];
  for (var i = 0; i < incomeStmts.length; i++) {
    var s = incomeStmts[i];
    adaptedIncome.push({
      totalRevenue: safeNum(raw(s.totalRevenue)),
      netIncome: safeNum(raw(s.netIncome)),
      ebit: safeNum(raw(s.ebit)),
      ebitda: safeNum(raw(s.ebitda)),
      grossProfit: safeNum(raw(s.grossProfit)),
      endDate: s.endDate ? (raw(s.endDate) || '') : '',
    });
  }
  var adaptedBalance = [];
  for (var bi = 0; bi < balanceStmts.length; bi++) {
    var b = balanceStmts[bi];
    adaptedBalance.push({
      totalAssets: safeNum(raw(b.totalAssets)),
      totalLiab: safeNum(raw(b.totalLiab)),
      totalStockholderEquity: safeNum(raw(b.totalStockholderEquity)),
      totalDebt: safeNum(raw(b.longTermDebt)),
      endDate: b.endDate ? (raw(b.endDate) || '') : '',
    });
  }

  return {
    valuation: {
      pl: safeNum(raw(ks.trailingPE)),
      pvp: safeNum(raw(ks.priceToBook)),
      evEbitda: safeNum(raw(ks.enterpriseToEbitda)),
      evEbit: evEbit,
      vpa: safeNum(raw(ks.bookValue)),
      lpa: safeNum(raw(ks.trailingEps)),
      pAtivo: pAtivo,
      psr: safeNum(raw(ks.priceToSalesTrailing12Months)),
      peg: safeNum(raw(ks.pegRatio)),
      dy: safeNum(raw(ks.trailingAnnualDividendYield)) != null
        ? safeNum(raw(ks.trailingAnnualDividendYield)) * 100 : null,
    },
    endividamento: {
      divLiqPl: safeNum(raw(fd.debtToEquity)),
      divLiqEbitda: divLiqEbitda,
      passivosAtivos: passivosAtivos,
      plAtivos: plAtivos,
    },
    eficiencia: {
      mBruta: pct(raw(fd.grossMargins)),
      mEbitda: pct(raw(fd.ebitdaMargins)),
      mEbit: pct(raw(fd.operatingMargins)),
      mLiquida: pct(raw(fd.profitMargins)),
    },
    rentabilidade: {
      roe: pct(raw(fd.returnOnEquity)),
      roic: roic,
      roa: pct(raw(fd.returnOnAssets)),
      giroAtivos: giroAtivos,
    },
    crescimento: {
      cagrReceitas: computeCAGR(adaptedIncome, 'totalRevenue', 5),
      cagrLucros: computeCAGR(adaptedIncome, 'netIncome', 5),
    },
    historico: buildHistorico(adaptedIncome, adaptedBalance),
  };
}

// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════
function computeCAGR(stmts, field, years) {
  if (!stmts || stmts.length < 2) return null;
  var recent = safeNum(stmts[0][field]);
  var oldest = null;
  var idx = Math.min(years - 1, stmts.length - 1);
  oldest = safeNum(stmts[idx][field]);
  if (recent == null || oldest == null || oldest <= 0 || recent <= 0) return null;
  var cagr = (Math.pow(recent / oldest, 1 / Math.min(years, idx + 1)) - 1) * 100;
  return cagr;
}

function buildHistorico(incomeStmts, balanceStmts) {
  var anos = [];
  var receitas = [];
  var lucros = [];
  var margemLiq = [];
  var limit = Math.min(5, incomeStmts.length);

  for (var i = limit - 1; i >= 0; i--) {
    var s = incomeStmts[i];
    var endDate = s.endDate || '';
    var year = '';
    if (typeof endDate === 'string' && endDate.length >= 4) {
      year = endDate.substring(0, 4);
    } else if (typeof endDate === 'number') {
      year = new Date(endDate * 1000).getFullYear().toString();
    }
    anos.push(year);
    var rev = safeNum(s.totalRevenue);
    var ni = safeNum(s.netIncome);
    receitas.push(rev);
    lucros.push(ni);
    margemLiq.push(rev && ni ? (ni / rev) * 100 : null);
  }

  // ROE histórico
  var roe = [];
  var balLimit = Math.min(5, balanceStmts.length);
  for (var bi = balLimit - 1; bi >= 0; bi--) {
    var bs = balanceStmts[bi];
    var eq = safeNum(bs.totalStockholderEquity);
    var incIdx = bi < incomeStmts.length ? bi : null;
    var niForRoe = incIdx != null ? safeNum(incomeStmts[incIdx].netIncome) : null;
    roe.push(eq && niForRoe ? (niForRoe / eq) * 100 : null);
  }

  // Dív/EBITDA histórico
  var divEbitda = [];
  for (var di = limit - 1; di >= 0; di--) {
    var isStmt = incomeStmts[di];
    var bsStmt = di < balanceStmts.length ? balanceStmts[di] : {};
    var ebitdaVal = safeNum(isStmt.ebitda);
    var debtVal = safeNum(bsStmt.totalDebt) || safeNum(bsStmt.longTermDebt);
    var cashVal = 0; // simplified — not always available in statements
    divEbitda.push(ebitdaVal && debtVal != null ? (debtVal - cashVal) / ebitdaVal : null);
  }

  return {
    anos: anos,
    receitas: receitas,
    lucros: lucros,
    roe: roe,
    margemLiq: margemLiq,
    divEbitda: divEbitda,
  };
}

// ═══════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════
export function fetchFundamentals(ticker, mercado) {
  var key = (mercado || 'BR') + ':' + ticker.toUpperCase().trim();
  var cached = CACHE[key];
  if (cached && !isExpired(cached)) {
    return Promise.resolve(cached.data);
  }

  var fetchFn = (mercado === 'INT') ? fetchYahoo : fetchBrapi;
  var normFn = (mercado === 'INT') ? normalizeYahoo : normalizeBrapi;

  return fetchFn(ticker).then(function(json) {
    var data = normFn(json);
    CACHE[key] = { data: data, ts: Date.now() };
    return data;
  }).catch(function(err) {
    console.warn('fetchFundamentals error for ' + ticker + ':', err);
    return null;
  });
}

export function clearFundamentalsCache() {
  CACHE = {};
}
