// ═══════════════════════════════════════════════════════════
// Test Bot — Helpers (funcoes puras de calculo)
// Replicas exatas da logica do app, adaptadas para Node.js
// ═══════════════════════════════════════════════════════════

var Decimal = require('decimal.js');

// ── Decimal math (de src/utils/fractional.js) ──

function decMul(a, b) {
  return new Decimal(a || 0).times(b || 0).toNumber();
}

function decDiv(a, b) {
  if (!b || b === 0) return 0;
  return new Decimal(a || 0).div(b).toNumber();
}

function decAdd(a, b) {
  return new Decimal(a || 0).plus(b || 0).toNumber();
}

function decSub(a, b) {
  return new Decimal(a || 0).minus(b || 0).toNumber();
}

// ── Positions (de database.js:502-603) ──

function calculatePositions(operacoes) {
  var positions = {};
  for (var i = 0; i < operacoes.length; i++) {
    var op = operacoes[i];
    var tickerKey = (op.ticker || '').toUpperCase().trim();
    if (!positions[tickerKey]) {
      positions[tickerKey] = {
        ticker: tickerKey,
        categoria: op.categoria,
        mercado: op.mercado || 'BR',
        quantidade: 0,
        custo_total: 0,
        pm: 0,
        por_corretora: {},
        custo_por_corretora: {},
        total_comprado: 0,
        custo_compras: 0,
        total_vendido: 0,
        receita_vendas: 0,
        pl_realizado: 0,
        pl_realizado_ir: 0,
        taxa_cambio_media: 0,
        _custo_brl: 0,
      };
    }
    var p = positions[tickerKey];
    var corr = (op.corretora || 'Sem corretora').toUpperCase().trim();
    if (!p.por_corretora[corr]) {
      p.por_corretora[corr] = 0;
      p.custo_por_corretora[corr] = 0;
    }
    if (op.tipo === 'compra') {
      var custos = decAdd(decAdd(op.custo_corretagem || 0, op.custo_emolumentos || 0), op.custo_impostos || 0);
      var custoOp = decAdd(decMul(op.quantidade, op.preco), custos);
      p.custo_total = decAdd(p.custo_total, custoOp);
      p.quantidade = decAdd(p.quantidade, op.quantidade);
      p.por_corretora[corr] = decAdd(p.por_corretora[corr], op.quantidade);
      p.custo_por_corretora[corr] = decAdd(p.custo_por_corretora[corr], custoOp);
      p.total_comprado = decAdd(p.total_comprado, op.quantidade);
      p.custo_compras = decAdd(p.custo_compras, custoOp);
      if ((op.mercado === 'INT') && op.taxa_cambio) {
        p._custo_brl = decAdd(p._custo_brl, decMul(custoOp, op.taxa_cambio));
      }
    } else if (op.tipo === 'venda') {
      var custosVenda = decAdd(decAdd(op.custo_corretagem || 0, op.custo_emolumentos || 0), op.custo_impostos || 0);
      var pmCorr = p.por_corretora[corr] > 0 ? decDiv(p.custo_por_corretora[corr], p.por_corretora[corr]) : p.pm;
      p.pl_realizado = decAdd(p.pl_realizado, decSub(decMul(op.quantidade, decSub(op.preco, pmCorr)), custosVenda));
      p.pl_realizado_ir = decAdd(p.pl_realizado_ir, decSub(decMul(op.quantidade, decSub(op.preco, p.pm)), custosVenda));
      var receitaLiq = decSub(decMul(op.quantidade, op.preco), custosVenda);
      p.receita_vendas = decAdd(p.receita_vendas, receitaLiq);
      p.total_vendido = decAdd(p.total_vendido, op.quantidade);
      p.custo_por_corretora[corr] = decSub(p.custo_por_corretora[corr], decMul(op.quantidade, pmCorr));
      p.por_corretora[corr] = decSub(p.por_corretora[corr], op.quantidade);
      p.custo_total = decSub(p.custo_total, decMul(op.quantidade, p.pm));
      p.quantidade = decSub(p.quantidade, op.quantidade);
    }
    if (Math.abs(p.quantidade) < 0.000001) p.quantidade = 0;
    p.pm = p.quantidade > 0 ? decDiv(p.custo_total, p.quantidade) : 0;
    if (p.mercado === 'INT' && p.custo_total > 0 && p._custo_brl > 0) {
      p.taxa_cambio_media = decDiv(p._custo_brl, p.custo_total);
    }
  }

  var tickers = Object.keys(positions);
  var resultArr = [];
  var encerradas = [];
  for (var j = 0; j < tickers.length; j++) {
    var pos = positions[tickers[j]];
    if (pos.quantidade > 0) {
      resultArr.push(pos);
    } else if (pos.total_vendido > 0) {
      encerradas.push(pos);
    }
  }
  return { data: resultArr, encerradas: encerradas };
}

// ── Fatura cycle (de database.js:2597-2666) ──

function daysInMonth(y, m) {
  return new Date(y, m + 1, 0).getDate();
}

function padTwo(n) {
  return String(n).padStart(2, '0');
}

function formatDateStr(dt) {
  return dt.getFullYear() + '-' + padTwo(dt.getMonth() + 1) + '-' + padTwo(dt.getDate());
}

function calculateFaturaCycle(diaFech, diaVenc, mes, ano) {
  var cycleEndDate = new Date(ano, mes - 1, Math.min(diaFech, daysInMonth(ano, mes - 1)));
  var prevM = mes === 1 ? 12 : mes - 1;
  var prevY = mes === 1 ? ano - 1 : ano;
  var startDay = Math.min(diaFech + 1, daysInMonth(prevY, prevM - 1));
  var cycleStartDate = new Date(prevY, prevM - 1, startDay);

  var dueMonth = mes === 12 ? 1 : mes + 1;
  var dueYear = mes === 12 ? ano + 1 : ano;
  if (diaVenc > diaFech) {
    dueMonth = mes;
    dueYear = ano;
  }
  var dueDateClamped = Math.min(diaVenc, daysInMonth(dueYear, dueMonth - 1));
  var dueDate = new Date(dueYear, dueMonth - 1, dueDateClamped);

  return {
    cycleStart: formatDateStr(cycleStartDate),
    cycleEnd: formatDateStr(cycleEndDate),
    dueDate: formatDateStr(dueDate),
  };
}

// Mes de vencimento para display (de FaturaScreen.js)
function getFaturaDisplayMonth(mes, ano, diaFech, diaVenc) {
  if (diaVenc > diaFech) {
    return { mes: mes, ano: ano };
  }
  return {
    mes: mes === 12 ? 1 : mes + 1,
    ano: mes === 12 ? ano + 1 : ano,
  };
}

// Mes inicial (de FaturaScreen.js — logica de qual fatura mostrar)
function getCurrentFaturaMes(diaFech, diaVenc, fakeNow) {
  var now = fakeNow || new Date();
  var dia = now.getDate();
  var mesAtual = now.getMonth() + 1;
  var anoAtual = now.getFullYear();

  var mesCicloAberto = mesAtual;
  var anoCicloAberto = anoAtual;
  if (dia > diaFech) {
    mesCicloAberto = mesAtual === 12 ? 1 : mesAtual + 1;
    anoCicloAberto = mesAtual === 12 ? anoAtual + 1 : anoAtual;
  }

  var mesCicloFechado = mesCicloAberto === 1 ? 12 : mesCicloAberto - 1;
  var anoCicloFechado = mesCicloAberto === 1 ? anoCicloAberto - 1 : anoCicloAberto;

  var dueM, dueY;
  if (diaVenc > diaFech) {
    dueM = mesCicloFechado;
    dueY = anoCicloFechado;
  } else {
    dueM = mesCicloFechado === 12 ? 1 : mesCicloFechado + 1;
    dueY = mesCicloFechado === 12 ? anoCicloFechado + 1 : anoCicloFechado;
  }

  var todayNum = anoAtual * 10000 + mesAtual * 100 + dia;
  var dueNum = dueY * 10000 + dueM * 100 + diaVenc;

  if (todayNum <= dueNum) {
    return { mes: mesCicloFechado, ano: anoCicloFechado };
  }
  return { mes: mesCicloAberto, ano: anoCicloAberto };
}

// ── Cobertura (de OpcoesScreen.js:714-762) ──

function findCorretora(porCorretora, corrName) {
  if (!porCorretora || !corrName) return 0;
  var key = corrName.toUpperCase().trim();
  if (porCorretora[key]) return porCorretora[key];
  if (porCorretora[corrName]) return porCorretora[corrName];
  var keys = Object.keys(porCorretora);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].toUpperCase().trim() === key) return porCorretora[keys[i]];
  }
  return 0;
}

function calculateCobertura(opcao, positions, saldos) {
  var tipo = (opcao.tipo || 'call').toUpperCase();
  var isVenda = opcao.direcao === 'lancamento' || opcao.direcao === 'venda';

  if (!isVenda) return { status: 'N/A', detail: 'Compra' };

  if (tipo === 'CALL') {
    var posForAsset = null;
    var ativoBase = (opcao.ativo_base || '').toUpperCase().trim();
    for (var i = 0; i < positions.length; i++) {
      if ((positions[i].ticker || '').toUpperCase().trim() === ativoBase) {
        posForAsset = positions[i];
        break;
      }
    }

    var qtyCorretora = 0;
    var qtyTotal = 0;
    if (posForAsset) {
      qtyTotal = posForAsset.quantidade || 0;
      qtyCorretora = findCorretora(posForAsset.por_corretora, opcao.corretora);
    }

    if (qtyCorretora >= (opcao.quantidade || 0)) {
      return { status: 'COBERTA', detail: qtyCorretora + ' acoes ' + opcao.corretora };
    } else if (qtyCorretora > 0) {
      return { status: 'PARCIAL', detail: qtyCorretora + '/' + (opcao.quantidade || 0) };
    } else if (qtyTotal >= (opcao.quantidade || 0)) {
      return { status: 'COBERTA*', detail: qtyTotal + ' acoes outra corretora' };
    }
    return { status: 'DESCOBERTA', detail: 'Sem ' + opcao.ativo_base };
  }

  if (tipo === 'PUT') {
    var custoExercicio = (opcao.strike || 0) * (opcao.quantidade || 0);
    var saldoVal = 0;
    var corrUp = (opcao.corretora || '').toUpperCase().trim();
    for (var si = 0; si < saldos.length; si++) {
      if ((saldos[si].corretora || '').toUpperCase().trim() === corrUp) {
        saldoVal = saldos[si].saldo || 0;
        break;
      }
    }

    var HAIRCUT = { acao: 0.80, fii: 0.70, etf: 0.85, stock_int: 0.75, rf: 0.95 };
    var garantiaValor = 0;
    for (var gi = 0; gi < positions.length; gi++) {
      var gPos = positions[gi];
      var qty = findCorretora(gPos.por_corretora, opcao.corretora);
      if (qty > 0 && gPos.preco_atual > 0) {
        var haircut = HAIRCUT[gPos.categoria] || 0.70;
        garantiaValor = garantiaValor + (qty * gPos.preco_atual * haircut);
      }
    }

    var coberturaTotal = saldoVal + garantiaValor;
    if (coberturaTotal >= custoExercicio) {
      return { status: 'GARANTIDA', detail: 'Caixa + ativos cobrem' };
    } else if (coberturaTotal > 0) {
      var pct = Math.round(coberturaTotal / custoExercicio * 100);
      return { status: 'PARCIAL', detail: pct + '% coberto' };
    }
    return { status: 'DESCOBERTA', detail: 'Sem garantia' };
  }

  return { status: 'N/A', detail: '' };
}

// ── Assert helpers ──

var _passed = 0;
var _failed = 0;
var _errors = [];

function eq(a, b, label) {
  // Comparacao com tolerancia para floats
  var match = false;
  if (typeof a === 'number' && typeof b === 'number') {
    match = Math.abs(a - b) < 0.01;
  } else {
    match = a === b;
  }
  if (match) {
    _passed++;
    console.log('  \x1b[32m\u2713\x1b[0m ' + label);
  } else {
    _failed++;
    _errors.push(label + ' (esperado: ' + b + ', recebido: ' + a + ')');
    console.log('  \x1b[31m\u2717\x1b[0m ' + label + ' (esperado: ' + b + ', recebido: ' + a + ')');
  }
}

function assert(cond, label) {
  if (cond) {
    _passed++;
    console.log('  \x1b[32m\u2713\x1b[0m ' + label);
  } else {
    _failed++;
    _errors.push(label);
    console.log('  \x1b[31m\u2717\x1b[0m ' + label);
  }
}

function getResults() {
  return { passed: _passed, failed: _failed, errors: _errors };
}

function resetResults() {
  _passed = 0;
  _failed = 0;
  _errors = [];
}

module.exports = {
  decMul: decMul,
  decDiv: decDiv,
  decAdd: decAdd,
  decSub: decSub,
  calculatePositions: calculatePositions,
  calculateFaturaCycle: calculateFaturaCycle,
  getFaturaDisplayMonth: getFaturaDisplayMonth,
  getCurrentFaturaMes: getCurrentFaturaMes,
  calculateCobertura: calculateCobertura,
  findCorretora: findCorretora,
  eq: eq,
  assert: assert,
  getResults: getResults,
  resetResults: resetResults,
};
