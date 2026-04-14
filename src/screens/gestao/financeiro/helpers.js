// ═══════════════════════════════════════════════════════════
// Financeiro — Shared helpers
// ═══════════════════════════════════════════════════════════

var finCats = require('../../../constants/financeCategories');

var MESES_NOMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
var MESES_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

var CAT_IONICONS = finCats.CAT_IONICONS;
var CAT_COLORS = finCats.CAT_COLORS;
var CAT_LABELS = finCats.CAT_LABELS;
var AUTO_CATEGORIAS = finCats.AUTO_CATEGORIAS;

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtCompact(v) {
  if (Math.abs(v) >= 1000) {
    return (v / 1000).toFixed(1) + 'k';
  }
  return fmt(v);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  var parts = dateStr.substring(0, 10).split('-');
  if (parts.length !== 3) return dateStr;
  return parts[2] + '/' + parts[1];
}

function groupMovsByDate(movs) {
  var today = new Date();
  var todayStr = today.toISOString().substring(0, 10);
  var yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  var yesterdayStr = yesterday.toISOString().substring(0, 10);

  var groups = [];
  var currentKey = '';
  var currentItems = [];

  for (var i = 0; i < movs.length; i++) {
    var m = movs[i];
    var dateStr = (m.data || '').substring(0, 10);
    var label;
    if (dateStr === todayStr) {
      label = 'HOJE';
    } else if (dateStr === yesterdayStr) {
      label = 'ONTEM';
    } else {
      var parts = dateStr.split('-');
      if (parts.length === 3) {
        var day = parseInt(parts[2]);
        var month = parseInt(parts[1]) - 1;
        label = day + ' DE ' + (MESES_FULL[month] || '').toUpperCase().substring(0, 3);
      } else {
        label = dateStr;
      }
    }

    if (label !== currentKey) {
      if (currentItems.length > 0) {
        groups.push({ label: currentKey, items: currentItems });
      }
      currentKey = label;
      currentItems = [m];
    } else {
      currentItems.push(m);
    }
  }
  if (currentItems.length > 0) {
    groups.push({ label: currentKey, items: currentItems });
  }
  return groups;
}

function groupByPortfolio(items, portfolios) {
  function getPortfolioLabel(pfId) {
    if (!pfId) return 'Padrão';
    for (var gi = 0; gi < portfolios.length; gi++) {
      if (portfolios[gi].id === pfId) return portfolios[gi].nome;
    }
    return 'Padrão';
  }
  function getPortfolioColor(pfId) {
    if (!pfId) return '#6C5CE7';
    for (var gi = 0; gi < portfolios.length; gi++) {
      if (portfolios[gi].id === pfId) return portfolios[gi].cor || '#6C5CE7';
    }
    return '#6C5CE7';
  }

  var groups = [];
  var groupMap = {};
  for (var gi = 0; gi < items.length; gi++) {
    var pfKey = items[gi].portfolio_id || '__default__';
    if (!groupMap[pfKey]) {
      groupMap[pfKey] = { key: pfKey, label: getPortfolioLabel(items[gi].portfolio_id), color: getPortfolioColor(items[gi].portfolio_id), items: [] };
      groups.push(groupMap[pfKey]);
    }
    groupMap[pfKey].items.push(items[gi]);
  }
  groups.sort(function(a, b) {
    if (a.key === '__default__') return -1;
    if (b.key === '__default__') return 1;
    return 0;
  });
  return groups;
}

function calcPontos(movs, regras, tipoBeneficio, moedaCartao, rates) {
  var fxRates = rates || {};
  var total = 0;
  for (var i = 0; i < movs.length; i++) {
    var m = movs[i];
    if (m.tipo !== 'saida') continue;
    var valBRL = m.valor || 0;

    var matched = null;
    var matchedVal = valBRL;
    for (var j = 0; j < regras.length; j++) {
      var r = regras[j];
      var valForRule = valBRL;

      if (r.moeda) {
        if (m.moeda_original && m.moeda_original === r.moeda && m.valor_original != null) {
          valForRule = m.valor_original;
        } else if (moedaCartao === 'BRL' && r.moeda !== 'BRL' && fxRates[r.moeda] && fxRates[r.moeda] > 0) {
          valForRule = valBRL / fxRates[r.moeda];
        } else if (moedaCartao === r.moeda) {
          valForRule = valBRL;
        } else {
          continue;
        }
      }

      if (valForRule >= (r.valor_min || 0) && (!r.valor_max || valForRule <= r.valor_max)) {
        if (!matched || (r.moeda && !matched.moeda)) {
          matched = r;
          matchedVal = valForRule;
        }
      }
    }
    if (matched) {
      if (tipoBeneficio === 'pontos') {
        total += matchedVal * matched.taxa;
      } else {
        total += matchedVal * (matched.taxa / 100);
      }
    }
  }
  return total;
}

function getCurrentFaturaMesAno(diaFech, diaVenc) {
  var now = new Date();
  var dia = now.getDate();
  var mesAtual = now.getMonth() + 1;
  var anoAtual = now.getFullYear();

  // Ciclo aberto: se passou do fechamento, próximo mês
  var mesCicloAberto = mesAtual;
  var anoCicloAberto = anoAtual;
  if (dia > diaFech) {
    mesCicloAberto = mesAtual === 12 ? 1 : mesAtual + 1;
    anoCicloAberto = mesAtual === 12 ? anoAtual + 1 : anoAtual;
  }

  // Sem dia_vencimento, retorna ciclo aberto (compatibilidade)
  if (!diaVenc) {
    return { mes: mesCicloAberto, ano: anoCicloAberto };
  }

  // Ciclo fechado (anterior)
  var mesCicloFechado = mesCicloAberto === 1 ? 12 : mesCicloAberto - 1;
  var anoCicloFechado = mesCicloAberto === 1 ? anoCicloAberto - 1 : anoCicloAberto;

  // Vencimento da fatura fechada
  var dueM, dueY;
  if (diaVenc > diaFech) {
    dueM = mesCicloFechado;
    dueY = anoCicloFechado;
  } else {
    dueM = mesCicloFechado === 12 ? 1 : mesCicloFechado + 1;
    dueY = mesCicloFechado === 12 ? anoCicloFechado + 1 : anoCicloFechado;
  }

  // Se hoje <= vencimento da fatura fechada, mostrar ela
  var todayNum = anoAtual * 10000 + mesAtual * 100 + dia;
  var dueNum = dueY * 10000 + dueM * 100 + diaVenc;

  if (todayNum <= dueNum) {
    return { mes: mesCicloFechado, ano: anoCicloFechado };
  }
  return { mes: mesCicloAberto, ano: anoCicloAberto };
}

module.exports = {
  fmt: fmt,
  fmtCompact: fmtCompact,
  formatDate: formatDate,
  groupMovsByDate: groupMovsByDate,
  groupByPortfolio: groupByPortfolio,
  calcPontos: calcPontos,
  getCurrentFaturaMesAno: getCurrentFaturaMesAno,
  MESES_NOMES: MESES_NOMES,
  MESES_FULL: MESES_FULL,
  CAT_IONICONS: CAT_IONICONS,
  CAT_COLORS: CAT_COLORS,
  CAT_LABELS: CAT_LABELS,
  AUTO_CATEGORIAS: AUTO_CATEGORIAS,
  finCats: finCats,
};
