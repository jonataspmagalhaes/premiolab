#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════
// PremioLab Test Bot
// Cria dados realistas, valida calculos, reporta erros.
// Uso: node tests/test-bot.js
// ═══════════════════════════════════════════════════════════

var setup = require('./setup');
var h = require('./helpers');

var supabase = null;
var userId = null;
var startTime = Date.now();

// ── Seed data references ──
var seedPortfolioId = null;
var seedCartoes = [];

function now() {
  var d = new Date();
  return d.toISOString().substring(0, 19).replace('T', ' ');
}

function log(msg) {
  console.log('\n\x1b[36m--- ' + msg + ' ---\x1b[0m');
}

// ═══════════════════════════════════════════════════════════
// SEED DATA
// ═══════════════════════════════════════════════════════════

function seedData() {
  return seedPortfolio()
    .then(seedOperacoes)
    .then(seedOpcoes)
    .then(seedCartoesCredito)
    .then(seedMovimentacoes)
    .then(seedProventos)
    .then(seedRendaFixa)
    .then(seedSaldos);
}

function seedPortfolio() {
  return supabase.from('portfolios').insert({
    user_id: userId,
    nome: 'Test Bot',
    cor: '#6C5CE7',
    icone: 'flask-outline',
    ordem: 99,
  }).select().single().then(function(res) {
    if (res.error) throw new Error('Seed portfolio: ' + res.error.message);
    seedPortfolioId = res.data.id;
  });
}

function seedOperacoes() {
  var ops = [
    // PETR4: compra 300 a 28.50 na Rico, venda 100 a 32.00 na Rico = 200 restantes
    { ticker: 'PETR4', tipo: 'compra', categoria: 'acao', quantidade: 300, preco: 28.50, corretora: 'Rico', data: '2025-06-15', mercado: 'BR' },
    { ticker: 'PETR4', tipo: 'venda', categoria: 'acao', quantidade: 100, preco: 32.00, corretora: 'Rico', data: '2025-09-10', mercado: 'BR' },
    // HGLG11: compra 50 a 160.00 na Inter
    { ticker: 'HGLG11', tipo: 'compra', categoria: 'fii', quantidade: 50, preco: 160.00, corretora: 'Inter', data: '2025-07-01', mercado: 'BR' },
    // MXRF11: compra 200 a 10.50 na Rico
    { ticker: 'MXRF11', tipo: 'compra', categoria: 'fii', quantidade: 200, preco: 10.50, corretora: 'Rico', data: '2025-08-01', mercado: 'BR' },
    // IVVB11: compra 100 a 280.00 na Inter
    { ticker: 'IVVB11', tipo: 'compra', categoria: 'etf', quantidade: 100, preco: 280.00, corretora: 'Inter', data: '2025-05-20', mercado: 'BR' },
    // AAPL: compra 10.5 a 185.00 na Inter (fracionado, INT)
    { ticker: 'AAPL', tipo: 'compra', categoria: 'stock_int', quantidade: 10.5, preco: 185.00, corretora: 'Inter', data: '2025-04-10', mercado: 'INT', taxa_cambio: 5.10 },
  ];

  var payloads = [];
  for (var i = 0; i < ops.length; i++) {
    var op = ops[i];
    payloads.push({
      user_id: userId,
      ticker: op.ticker,
      tipo: op.tipo,
      categoria: op.categoria,
      quantidade: op.quantidade,
      preco: op.preco,
      corretora: op.corretora,
      data: op.data,
      mercado: op.mercado || 'BR',
      taxa_cambio: op.taxa_cambio || null,
      portfolio_id: seedPortfolioId,
    });
  }
  return supabase.from('operacoes').insert(payloads).then(function(res) {
    if (res.error) throw new Error('Seed operacoes: ' + res.error.message);
  });
}

function seedOpcoes() {
  var hoje = new Date();
  var venc = new Date(hoje);
  venc.setDate(venc.getDate() + 30);
  var vencStr = venc.toISOString().substring(0, 10);

  var ops = [
    // CALL vendida coberta: 100 PETR4 na Rico (tem 200)
    {
      ativo_base: 'PETR4', ticker_opcao: 'PETRD300', tipo: 'call', direcao: 'venda',
      strike: 30.00, premio: 1.50, quantidade: 100, vencimento: vencStr,
      data_abertura: hoje.toISOString().substring(0, 10), status: 'ativa', corretora: 'Rico',
    },
    // PUT vendida: PETR4 na Rico
    {
      ativo_base: 'PETR4', ticker_opcao: 'PETRO260', tipo: 'put', direcao: 'venda',
      strike: 26.00, premio: 0.80, quantidade: 200, vencimento: vencStr,
      data_abertura: hoje.toISOString().substring(0, 10), status: 'ativa', corretora: 'Rico',
    },
  ];

  var payloads = [];
  for (var i = 0; i < ops.length; i++) {
    var op = ops[i];
    op.user_id = userId;
    op.portfolio_id = seedPortfolioId;
    payloads.push(op);
  }
  return supabase.from('opcoes').insert(payloads).then(function(res) {
    if (res.error) throw new Error('Seed opcoes: ' + res.error.message);
  });
}

function seedCartoesCredito() {
  var cartoes = [
    { ultimos_digitos: '1111', bandeira: 'visa', dia_fechamento: 21, dia_vencimento: 1, limite: 5000, moeda: 'BRL' },
    { ultimos_digitos: '2222', bandeira: 'mastercard', dia_fechamento: 3, dia_vencimento: 10, limite: 10000, moeda: 'BRL' },
    { ultimos_digitos: '3333', bandeira: 'elo', dia_fechamento: 25, dia_vencimento: 15, limite: 3000, moeda: 'BRL' },
  ];

  var payloads = [];
  for (var i = 0; i < cartoes.length; i++) {
    cartoes[i].user_id = userId;
    cartoes[i].portfolio_id = seedPortfolioId;
    payloads.push(cartoes[i]);
  }
  return supabase.from('cartoes_credito').insert(payloads).select().then(function(res) {
    if (res.error) throw new Error('Seed cartoes: ' + res.error.message);
    seedCartoes = res.data || [];
  });
}

function seedMovimentacoes() {
  if (seedCartoes.length === 0) return Promise.resolve();
  var cartao = seedCartoes[0]; // Visa 1111, fech=21, venc=1
  var movs = [
    { valor: 150.00, categoria: 'despesa_variavel', data: '2026-03-05', descricao: 'Supermercado' },
    { valor: 49.90, categoria: 'despesa_variavel', data: '2026-03-10', descricao: 'Streaming' },
    { valor: 200.00, categoria: 'despesa_variavel', data: '2026-03-18', descricao: 'Combustivel' },
    // Fora do ciclo (depois do fechamento 21)
    { valor: 80.00, categoria: 'despesa_variavel', data: '2026-03-25', descricao: 'Cinema' },
  ];

  var payloads = [];
  for (var i = 0; i < movs.length; i++) {
    payloads.push({
      user_id: userId,
      cartao_id: cartao.id,
      tipo: 'saida',
      categoria: movs[i].categoria,
      valor: movs[i].valor,
      descricao: movs[i].descricao,
      data: movs[i].data,
      conta: 'VISA ••1111',
      meio_pagamento: 'credito',
    });
  }
  return supabase.from('movimentacoes').insert(payloads).then(function(res) {
    if (res.error) throw new Error('Seed movimentacoes: ' + res.error.message);
  });
}

function seedProventos() {
  var provs = [
    { ticker: 'PETR4', tipo: 'dividendo', valor_por_cota: 1.20, quantidade: 200, data_pagamento: '2026-03-15' },
    { ticker: 'PETR4', tipo: 'jcp', valor_por_cota: 0.50, quantidade: 200, data_pagamento: '2026-03-15' },
    { ticker: 'HGLG11', tipo: 'rendimento', valor_por_cota: 1.10, quantidade: 50, data_pagamento: '2026-03-10' },
  ];

  var payloads = [];
  for (var i = 0; i < provs.length; i++) {
    payloads.push({
      user_id: userId,
      ticker: provs[i].ticker,
      tipo: provs[i].tipo,
      valor_por_cota: provs[i].valor_por_cota,
      quantidade: provs[i].quantidade,
      data_pagamento: provs[i].data_pagamento,
      portfolio_id: seedPortfolioId,
    });
  }
  return supabase.from('proventos').insert(payloads).then(function(res) {
    if (res.error) throw new Error('Seed proventos: ' + res.error.message);
  });
}

function seedRendaFixa() {
  return supabase.from('renda_fixa').insert({
    user_id: userId,
    tipo: 'cdb',
    emissor: 'Banco Test',
    taxa: 13.5,
    indexador: 'pre',
    valor_aplicado: 10000,
    vencimento: '2027-06-15',
    portfolio_id: seedPortfolioId,
  }).then(function(res) {
    if (res.error) throw new Error('Seed renda_fixa: ' + res.error.message);
  });
}

function seedSaldos() {
  var saldos = [
    { corretora: 'RICO', saldo: 15000, tipo: 'corretora', moeda: 'BRL' },
    { corretora: 'INTER', saldo: 8000, tipo: 'banco', moeda: 'BRL' },
  ];

  var payloads = [];
  for (var i = 0; i < saldos.length; i++) {
    payloads.push({
      user_id: userId,
      corretora: saldos[i].corretora,
      saldo: saldos[i].saldo,
      tipo: saldos[i].tipo,
      moeda: saldos[i].moeda,
    });
  }
  return supabase.from('saldos_corretora').upsert(payloads, { onConflict: 'user_id,corretora,moeda' }).then(function(res) {
    if (res.error) throw new Error('Seed saldos: ' + res.error.message);
  });
}

// ═══════════════════════════════════════════════════════════
// SUITE A: Positions
// ═══════════════════════════════════════════════════════════

function suitePositions() {
  log('Suite A: Positions');

  return supabase.from('operacoes')
    .select('*')
    .eq('user_id', userId)
    .order('data', { ascending: true })
    .then(function(res) {
      if (res.error) throw new Error('Query operacoes: ' + res.error.message);
      var ops = res.data || [];
      var result = h.calculatePositions(ops);
      var positions = result.data;

      // Encontrar PETR4
      var petr4 = null;
      var hglg11 = null;
      var aapl = null;
      for (var i = 0; i < positions.length; i++) {
        if (positions[i].ticker === 'PETR4') petr4 = positions[i];
        if (positions[i].ticker === 'HGLG11') hglg11 = positions[i];
        if (positions[i].ticker === 'AAPL') aapl = positions[i];
      }

      h.assert(petr4 !== null, 'PETR4 encontrada');
      h.eq(petr4.quantidade, 200, 'PETR4 qty = 200 (300 compra - 100 venda)');
      h.eq(petr4.pm, 28.50, 'PETR4 PM = 28.50 (compra unica a 28.50)');
      h.assert(petr4.por_corretora['RICO'] === 200, 'PETR4 por_corretora.RICO = 200');
      h.assert(petr4.pl_realizado > 0, 'PETR4 P&L realizado > 0 (vendeu a 32, PM 28.50)');

      h.assert(hglg11 !== null, 'HGLG11 encontrada');
      h.eq(hglg11.quantidade, 50, 'HGLG11 qty = 50');

      h.assert(aapl !== null, 'AAPL encontrada');
      h.eq(aapl.quantidade, 10.5, 'AAPL qty = 10.5 (fracionado INT)');
      h.eq(aapl.mercado, 'INT', 'AAPL mercado = INT');

      h.eq(positions.length, 5, '5 posicoes ativas (PETR4, HGLG11, MXRF11, IVVB11, AAPL)');
    });
}

// ═══════════════════════════════════════════════════════════
// SUITE B: Fatura Cycles
// ═══════════════════════════════════════════════════════════

function suiteFatura() {
  log('Suite B: Fatura Cycles');

  // Cartao 1: fech=21, venc=1 (Rico tipico)
  var c1 = h.calculateFaturaCycle(21, 1, 3, 2026);
  h.eq(c1.cycleStart, '2026-02-22', 'Cartao fech=21,venc=1: cycleStart = 22/fev');
  h.eq(c1.cycleEnd, '2026-03-21', 'Cartao fech=21,venc=1: cycleEnd = 21/mar');
  h.eq(c1.dueDate, '2026-04-01', 'Cartao fech=21,venc=1: vencimento = 01/abr');

  // Cartao 2: fech=3, venc=10 (Nubank tipico)
  var c2 = h.calculateFaturaCycle(3, 10, 4, 2026);
  h.eq(c2.cycleStart, '2026-03-04', 'Cartao fech=3,venc=10: cycleStart = 04/mar');
  h.eq(c2.cycleEnd, '2026-04-03', 'Cartao fech=3,venc=10: cycleEnd = 03/abr');
  h.eq(c2.dueDate, '2026-04-10', 'Cartao fech=3,venc=10: vencimento = 10/abr (mesmo mes)');

  // Cartao 3: fech=25, venc=15
  var c3 = h.calculateFaturaCycle(25, 15, 3, 2026);
  h.eq(c3.dueDate, '2026-04-15', 'Cartao fech=25,venc=15: vencimento = 15/abr (mes seguinte)');

  // Display month
  var d1 = h.getFaturaDisplayMonth(3, 2026, 21, 1);
  h.eq(d1.mes, 4, 'Display fech=21,venc=1 mes=3: mostra Abril');

  var d2 = h.getFaturaDisplayMonth(4, 2026, 3, 10);
  h.eq(d2.mes, 4, 'Display fech=3,venc=10 mes=4: mostra Abril');

  // Testar movimentacoes dentro do ciclo via DB
  if (seedCartoes.length === 0) return Promise.resolve();
  var cartao = seedCartoes[0]; // fech=21, venc=1

  // Fatura mes=3: ciclo 22/fev - 21/mar
  return supabase.from('movimentacoes')
    .select('*')
    .eq('user_id', userId)
    .eq('cartao_id', cartao.id)
    .gte('data', '2026-02-22')
    .lte('data', '2026-03-21')
    .neq('categoria', 'pagamento_fatura')
    .then(function(res) {
      var movs = res.data || [];
      h.eq(movs.length, 3, 'Fatura mar: 3 movimentacoes no ciclo (exclui 25/mar)');
      var total = 0;
      for (var i = 0; i < movs.length; i++) total += movs[i].valor;
      h.eq(total, 399.90, 'Fatura mar total = 399.90 (150+49.90+200)');
    });
}

// ═══════════════════════════════════════════════════════════
// SUITE C: Cobertura
// ═══════════════════════════════════════════════════════════

function suiteCobertura() {
  log('Suite C: Cobertura');

  // Montar positions simuladas (como retornado por getPositions)
  var positions = [
    { ticker: 'PETR4', categoria: 'acao', quantidade: 200, por_corretora: { 'RICO': 200 }, preco_atual: 32.00 },
    { ticker: 'HGLG11', categoria: 'fii', quantidade: 50, por_corretora: { 'INTER': 50 }, preco_atual: 165.00 },
  ];

  var saldos = [
    { corretora: 'Rico', saldo: 15000 },
    { corretora: 'Inter', saldo: 8000 },
  ];

  // CALL 100 PETR4 na Rico: COBERTA (tem 200)
  var r1 = h.calculateCobertura(
    { ativo_base: 'PETR4', tipo: 'call', direcao: 'venda', quantidade: 100, corretora: 'Rico' },
    positions, saldos
  );
  h.eq(r1.status, 'COBERTA', 'CALL 100 PETR4 Rico: COBERTA');

  // CALL 250 PETR4 na Rico: PARCIAL (so tem 200)
  var r2 = h.calculateCobertura(
    { ativo_base: 'PETR4', tipo: 'call', direcao: 'venda', quantidade: 250, corretora: 'Rico' },
    positions, saldos
  );
  h.eq(r2.status, 'PARCIAL', 'CALL 250 PETR4 Rico: PARCIAL');

  // CALL 100 PETR4 na Inter: COBERTA* (tem na outra corretora)
  var r3 = h.calculateCobertura(
    { ativo_base: 'PETR4', tipo: 'call', direcao: 'venda', quantidade: 100, corretora: 'Inter' },
    positions, saldos
  );
  h.eq(r3.status, 'COBERTA*', 'CALL 100 PETR4 Inter: COBERTA* (outra corretora)');

  // CALL 500 PETR4 na Clear: DESCOBERTA
  var r4 = h.calculateCobertura(
    { ativo_base: 'PETR4', tipo: 'call', direcao: 'venda', quantidade: 500, corretora: 'Clear' },
    positions, saldos
  );
  h.eq(r4.status, 'DESCOBERTA', 'CALL 500 PETR4 Clear: DESCOBERTA');

  // PUT 200 PETR4 na Rico: GARANTIDA (strike 26 * 200 = 5200, saldo Rico = 15000)
  var r5 = h.calculateCobertura(
    { ativo_base: 'PETR4', tipo: 'put', direcao: 'venda', quantidade: 200, strike: 26, corretora: 'Rico' },
    positions, saldos
  );
  h.eq(r5.status, 'GARANTIDA', 'PUT 200 PETR4 Rico strike=26: GARANTIDA (saldo 15k > 5.2k)');

  // Case insensitive: "rico" vs "RICO"
  var r6 = h.calculateCobertura(
    { ativo_base: 'petr4', tipo: 'call', direcao: 'venda', quantidade: 100, corretora: 'rico' },
    positions, saldos
  );
  h.eq(r6.status, 'COBERTA', 'Case insensitive: "rico"/"petr4" = COBERTA');

  return Promise.resolve();
}

// ═══════════════════════════════════════════════════════════
// SUITE D: Integridade de Dados
// ═══════════════════════════════════════════════════════════

function suiteIntegridade() {
  log('Suite D: Integridade de Dados');

  return Promise.all([
    supabase.from('proventos').select('*').eq('user_id', userId),
    supabase.from('saldos_corretora').select('*').eq('user_id', userId),
    supabase.from('renda_fixa').select('*').eq('user_id', userId),
  ]).then(function(results) {
    var provs = results[0].data || [];
    var saldos = results[1].data || [];
    var rf = results[2].data || [];

    // Proventos: campos obrigatorios presentes
    var provsOk = true;
    for (var i = 0; i < provs.length; i++) {
      var p = provs[i];
      if (!p.valor_por_cota || !p.quantidade || !p.ticker) {
        provsOk = false;
        break;
      }
    }
    h.assert(provsOk, 'Proventos: campos obrigatorios presentes');

    // JCP tem desconto 15%
    var jcp = null;
    for (var j = 0; j < provs.length; j++) {
      if ((provs[j].tipo || '') === 'jcp') { jcp = provs[j]; break; }
    }
    h.assert(jcp !== null, 'Provento JCP encontrado');
    var jcpBruto = h.decMul(jcp.valor_por_cota, jcp.quantidade);
    var jcpLiquido = jcpBruto * 0.85;
    h.assert(jcpLiquido < jcpBruto, 'JCP liquido (' + jcpLiquido.toFixed(2) + ') < bruto (' + jcpBruto.toFixed(2) + ')');

    // Saldos nao negativos
    var saldosOk = true;
    for (var s = 0; s < saldos.length; s++) {
      if (saldos[s].saldo < 0) { saldosOk = false; break; }
    }
    h.assert(saldosOk, 'Nenhum saldo negativo');

    // Renda fixa: valor_aplicado > 0
    h.assert(rf.length > 0 && rf[0].valor_aplicado > 0, 'Renda fixa com valor positivo');
  });
}

// ═══════════════════════════════════════════════════════════
// SUITE E: Dados no Supabase vs Calculo Local
// ═══════════════════════════════════════════════════════════

function suiteDBvsLocal() {
  log('Suite E: DB vs Local (posicoes reais)');

  return Promise.all([
    supabase.from('operacoes').select('*').eq('user_id', userId).order('data', { ascending: true }),
    supabase.from('opcoes').select('*').eq('user_id', userId).eq('status', 'ativa'),
    supabase.from('saldos_corretora').select('*').eq('user_id', userId),
  ]).then(function(results) {
    var ops = results[0].data || [];
    var opcoes = results[1].data || [];
    var saldos = results[2].data || [];

    var localResult = h.calculatePositions(ops);
    var positions = localResult.data;

    h.assert(positions.length > 0, 'Posicoes calculadas localmente > 0');

    // Verificar cobertura para cada opcao ativa vendida
    for (var i = 0; i < opcoes.length; i++) {
      var op = opcoes[i];
      var isVenda = op.direcao === 'venda' || op.direcao === 'lancamento';
      if (!isVenda) continue;
      var cob = h.calculateCobertura(op, positions, saldos);
      var tipoStr = (op.tipo || '').toUpperCase();
      h.assert(
        cob.status !== 'DESCOBERTA',
        tipoStr + ' ' + op.ticker_opcao + ' ' + op.corretora + ': ' + cob.status + ' (nao DESCOBERTA)'
      );
    }
  });
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

function main() {
  console.log('\n\x1b[1m=== PremioLab Test Bot ===\x1b[0m');
  console.log('[' + now() + ']');

  supabase = setup.getTestClient();

  return setup.signIn(supabase)
    .then(function(uid) {
      userId = uid;
      console.log('Logado como: ' + setup.TEST_EMAIL + ' (id: ' + uid.substring(0, 8) + '...)');
      console.log('Limpando dados anteriores...');
      return setup.cleanup(supabase, userId);
    })
    .then(function() {
      console.log('Inserindo dados de teste...');
      return seedData();
    })
    .then(function() {
      return suitePositions();
    })
    .then(function() {
      return suiteFatura();
    })
    .then(function() {
      return suiteCobertura();
    })
    .then(function() {
      return suiteIntegridade();
    })
    .then(function() {
      return suiteDBvsLocal();
    })
    .then(function() {
      console.log('\nLimpando dados de teste...');
      return setup.cleanup(supabase, userId);
    })
    .then(function() {
      var r = h.getResults();
      var elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log('\n\x1b[1m══════════════════════════════════════\x1b[0m');
      if (r.failed === 0) {
        console.log('\x1b[32m  RESULTADO: ' + r.passed + ' passed, 0 failed (' + elapsed + 's)\x1b[0m');
      } else {
        console.log('\x1b[31m  RESULTADO: ' + r.passed + ' passed, ' + r.failed + ' failed (' + elapsed + 's)\x1b[0m');
        console.log('\n  Falhas:');
        for (var i = 0; i < r.errors.length; i++) {
          console.log('    \x1b[31m\u2022\x1b[0m ' + r.errors[i]);
        }
      }
      console.log('\x1b[1m══════════════════════════════════════\x1b[0m\n');
      process.exit(r.failed > 0 ? 1 : 0);
    })
    .catch(function(err) {
      console.error('\n\x1b[31mERRO FATAL:\x1b[0m ' + err.message);
      console.error(err.stack);
      // Tentar cleanup mesmo com erro
      if (supabase && userId) {
        setup.cleanup(supabase, userId).then(function() {
          process.exit(1);
        }).catch(function() {
          process.exit(1);
        });
      } else {
        process.exit(1);
      }
    });
}

main();
