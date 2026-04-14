// ═══════════════════════════════════════════════════════
// REBALANCE UTILS — Constantes e funcoes compartilhadas
// Usado por: CarteiraScreen, AnaliseScreen
// ═══════════════════════════════════════════════════════

var FII_REBAL_MAP = {
  'Logistica': 'Tijolo', 'Lajes Corp.': 'Tijolo', 'Shopping': 'Tijolo',
  'Agro': 'Tijolo', 'Renda Urbana': 'Tijolo', 'Residencial': 'Tijolo', 'Hotel': 'Tijolo',
  'Papel/CRI': 'Papel',
  'Fundo de Fundos': 'Hibrido', 'Hibrido': 'Hibrido', 'Desenvolvimento': 'Hibrido',
};

var CAP_THRESHOLDS = [
  { key: 'Large Cap', min: 40000000000 },
  { key: 'Mid Cap', min: 10000000000 },
  { key: 'Small Cap', min: 2000000000 },
  { key: 'Micro Cap', min: 0 },
];

var CAP_COLORS = {
  'Large Cap': '#3B82F6', 'Mid Cap': '#10B981',
  'Small Cap': '#F59E0B', 'Micro Cap': '#EF4444',
  'Sem Info': '#6B7280',
};

var CAP_ORDER = ['Large Cap', 'Mid Cap', 'Small Cap', 'Micro Cap', 'Sem Info'];

function classifyMarketCap(marketCap) {
  if (!marketCap || marketCap <= 0) return 'Sem Info';
  for (var i = 0; i < CAP_THRESHOLDS.length; i++) {
    if (marketCap >= CAP_THRESHOLDS[i].min) return CAP_THRESHOLDS[i].key;
  }
  return 'Micro Cap';
}

var DEFAULT_CLASS_TARGETS = { acao: 35, fii: 20, etf: 15, bdr: 0, stock_int: 15, adr: 0, reit: 0, rf: 15 };
var DEFAULT_CAP_TARGETS = { 'Large Cap': 40, 'Mid Cap': 30, 'Small Cap': 20, 'Micro Cap': 10 };

var PROFILES = {
  conservador: {
    label: 'Conservador', emoji: '🛡️',
    desc: 'Prioriza renda fixa e FIIs de papel. Menor exposicao a acoes.',
    classes: { acao: 15, fii: 15, etf: 7, bdr: 0, stock_int: 3, adr: 0, reit: 0, rf: 60 },
    acaoCaps: { 'Large Cap': 60, 'Mid Cap': 25, 'Small Cap': 10, 'Micro Cap': 5 },
    fiiSectors: { 'Tijolo': 30, 'Papel': 55, 'Híbrido': 15 },
  },
  moderado: {
    label: 'Moderado', emoji: '⚖️',
    desc: 'Equilibrio entre renda variavel e fixa. Diversificacao ampla.',
    classes: { acao: 25, fii: 20, etf: 15, bdr: 0, stock_int: 10, adr: 0, reit: 0, rf: 30 },
    acaoCaps: { 'Large Cap': 45, 'Mid Cap': 30, 'Small Cap': 20, 'Micro Cap': 5 },
    fiiSectors: { 'Tijolo': 45, 'Papel': 40, 'Híbrido': 15 },
  },
  arrojado: {
    label: 'Arrojado', emoji: '🚀',
    desc: 'Foco em acoes e ETFs para crescimento. Pouca renda fixa.',
    classes: { acao: 30, fii: 15, etf: 20, bdr: 0, stock_int: 20, adr: 0, reit: 0, rf: 15 },
    acaoCaps: { 'Large Cap': 30, 'Mid Cap': 30, 'Small Cap': 25, 'Micro Cap': 15 },
    fiiSectors: { 'Tijolo': 55, 'Papel': 30, 'Híbrido': 15 },
  },
};

function redistribute(obj, changedKey, newVal) {
  var result = {};
  var keys = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) { result[keys[i]] = obj[keys[i]]; }
  result[changedKey] = newVal;
  var remaining = 100 - newVal;
  var otherKeys = [];
  for (var j = 0; j < keys.length; j++) {
    if (keys[j] !== changedKey) otherKeys.push(keys[j]);
  }
  var otherTotal = 0;
  for (var k = 0; k < otherKeys.length; k++) { otherTotal += (result[otherKeys[k]] || 0); }
  if (remaining <= 0) {
    for (var m = 0; m < otherKeys.length; m++) { result[otherKeys[m]] = 0; }
  } else if (otherTotal === 0) {
    if (otherKeys.length > 0) {
      var eq = Math.floor(remaining / otherKeys.length);
      var leftover = remaining - eq * otherKeys.length;
      for (var n = 0; n < otherKeys.length; n++) {
        result[otherKeys[n]] = n === 0 ? eq + leftover : eq;
      }
    }
  } else {
    var scale = remaining / otherTotal;
    var assigned = 0;
    for (var p = 0; p < otherKeys.length; p++) {
      if (p === otherKeys.length - 1) {
        result[otherKeys[p]] = Math.max(0, remaining - assigned);
      } else {
        var v = Math.round((result[otherKeys[p]] || 0) * scale);
        result[otherKeys[p]] = Math.max(0, v);
        assigned += result[otherKeys[p]];
      }
    }
  }
  return result;
}

function computeAporteSuggestions(positions, tickerMetas, classMetas, totalPortfolio, aporteVal) {
  if (!aporteVal || aporteVal <= 0 || !positions || positions.length === 0) return [];
  var newTotal = totalPortfolio + aporteVal;

  // 1. Calcular valor atual por classe
  var classVals = {};
  for (var i = 0; i < positions.length; i++) {
    var pos = positions[i];
    var cat = pos.categoria || 'acao';
    if (!classVals[cat]) classVals[cat] = { val: 0, positions: [] };
    var posVal = pos.quantidade * (pos.preco_atual || pos.pm || 0);
    classVals[cat].val += posVal;
    classVals[cat].positions.push(pos);
  }

  // 2. Calcular deficit por classe (meta vs atual)
  var classDeficits = [];
  var totalDeficit = 0;
  var cmKeys = Object.keys(classMetas);
  for (var ci = 0; ci < cmKeys.length; ci++) {
    var cat = cmKeys[ci];
    var metaPct = parseFloat(classMetas[cat]);
    if (isNaN(metaPct) || metaPct <= 0) continue;
    var atual = classVals[cat] ? classVals[cat].val : 0;
    var metaVal = (metaPct / 100) * newTotal;
    var deficit = metaVal - atual;
    if (deficit > 0) {
      classDeficits.push({ cat: cat, deficit: deficit, metaPct: metaPct });
      totalDeficit += deficit;
    }
  }

  if (totalDeficit <= 0) {
    // Sem deficit por classe — tentar por ticker
    return _computeTickerSuggestions(positions, tickerMetas, newTotal);
  }

  // 3. Distribuir aporte proporcionalmente ao deficit de cada classe
  var suggestions = [];
  for (var di = 0; di < classDeficits.length; di++) {
    var cd = classDeficits[di];
    var aporteClasse = (cd.deficit / totalDeficit) * aporteVal;
    if (aporteClasse < 50) continue;

    // Dentro da classe, distribuir entre posicoes com ticker meta ou uniformemente
    var classPos = classVals[cd.cat] ? classVals[cd.cat].positions : [];
    if (classPos.length === 0) continue;

    // Verificar se tem metas por ticker nesta classe
    var tickerComMeta = [];
    var tickerSemMeta = [];
    for (var ti = 0; ti < classPos.length; ti++) {
      var tm = tickerMetas[classPos[ti].ticker];
      if (tm != null && !isNaN(parseFloat(tm)) && parseFloat(tm) > 0) {
        tickerComMeta.push(classPos[ti]);
      } else {
        tickerSemMeta.push(classPos[ti]);
      }
    }

    var targets = tickerComMeta.length > 0 ? tickerComMeta : classPos;
    var perTicker = aporteClasse / targets.length;

    for (var pi = 0; pi < targets.length; pi++) {
      var tp = targets[pi];
      var preco = tp.preco_atual || tp.pm || 0;
      if (preco <= 0) continue;
      var cotas = Math.floor(perTicker / preco);
      if (cotas <= 0) continue;
      suggestions.push({
        ticker: tp.ticker,
        categoria: tp.categoria,
        cotas: cotas,
        preco: preco,
        valor: cotas * preco,
        classe: cd.cat,
      });
    }
  }

  suggestions.sort(function(a, b) { return b.valor - a.valor; });
  return suggestions;
}

function _computeTickerSuggestions(positions, tickerMetas, newTotal) {
  var suggestions = [];
  for (var i = 0; i < positions.length; i++) {
    var pos = positions[i];
    var meta = tickerMetas[pos.ticker];
    if (meta == null || isNaN(parseFloat(meta))) continue;
    var metaPct = parseFloat(meta);
    if (metaPct <= 0) continue;
    var valorAtual = pos.quantidade * (pos.preco_atual || pos.pm || 0);
    var valorMeta = (metaPct / 100) * newTotal;
    var deficit = valorMeta - valorAtual;
    if (deficit < 50) continue;
    var preco = pos.preco_atual || pos.pm || 0;
    if (preco <= 0) continue;
    var cotas = Math.floor(deficit / preco);
    if (cotas <= 0) continue;
    suggestions.push({
      ticker: pos.ticker,
      categoria: pos.categoria,
      cotas: cotas,
      preco: preco,
      valor: cotas * preco,
    });
  }
  suggestions.sort(function(a, b) { return b.valor - a.valor; });
  return suggestions;
}

function computeAccuracy(groups, metaMap, totalPortfolio) {
  var sumDrift = 0;
  var metaCount = 0;
  var groupKeys = Object.keys(groups);
  for (var i = 0; i < groupKeys.length; i++) {
    var gName = groupKeys[i];
    var meta = metaMap[gName];
    if (meta == null || isNaN(parseFloat(meta))) continue;
    var metaPct = parseFloat(meta);
    var atualPct = totalPortfolio > 0 ? (groups[gName].totalVal / totalPortfolio) * 100 : 0;
    sumDrift += Math.abs(atualPct - metaPct);
    metaCount++;
  }
  if (metaCount === 0) return null;
  var score = Math.max(0, Math.round(100 - sumDrift));
  return { score: score, count: metaCount };
}

module.exports = {
  FII_REBAL_MAP: FII_REBAL_MAP,
  CAP_THRESHOLDS: CAP_THRESHOLDS,
  CAP_COLORS: CAP_COLORS,
  CAP_ORDER: CAP_ORDER,
  classifyMarketCap: classifyMarketCap,
  DEFAULT_CLASS_TARGETS: DEFAULT_CLASS_TARGETS,
  DEFAULT_CAP_TARGETS: DEFAULT_CAP_TARGETS,
  PROFILES: PROFILES,
  redistribute: redistribute,
  computeAporteSuggestions: computeAporteSuggestions,
  computeAccuracy: computeAccuracy,
};
