/**
 * rendaPotencialService.js
 * Calcula a renda que o patrimonio atual PODERIA gerar se 100% otimizado.
 *
 * Motivacao: o usuario tem R$ X em capital e gera R$ Y/mes. Com a
 * alocacao ideal (FII 12%, Acao+CC 11%, RF CDI, etc) ele poderia
 * gerar R$ Z. Gap = Z - Y. O app mostra esse gap + diagnostica onde
 * esta travado (caixa ociosa, acoes sem CC, RF abaixo do ideal).
 *
 * Este service e o motor narrativo da secao "Como Crescer" da Renda.
 *
 * Exports:
 *  - computeRendaPotencial(userId, opts) → {
 *      patrimonio, rendaReal, rendaPotencial, gap, capturaPct,
 *      yieldIdealPonderado, yieldRealPonderado,
 *      gaps: [{ tipo, titulo, descricao, valorEnvolvido, ganhoMensal, acao }]
 *    }
 */

import { getPositions, getProventos, getOpcoes, getRendaFixa, getSaldos, getProfile } from './database';
import { buildIncomeForecast } from './incomeForecastService';

// Yields ideais por classe (a.a.)
var YIELD_IDEAL = {
  fii: 12.0,
  acao_com_cc: 11.0,  // 6% divs + 5% covered call
  acao_sem_cc: 6.0,   // apenas dividendos
  etf: 8.0,
  etf_int: 6.0,
  rf_min: 12.0,       // selic base
  caixa: 0.5,         // conta corrente/poupanca rende ~0.5% a.a.
  opcao: 0,           // ja computado no real
};

// Limiares de deteccao
var LIMIAR_CAIXA_OCIOSA = 1000; // R$ acima disso ja conta como ocioso
var LIMIAR_RF_BAIXA_PCT = 0.90; // RF rendendo <90% do CDI = baixa
var LIMIAR_ACAO_MIN_QTY = 100;  // lote minimo pra CC

function safeNum(v) {
  if (v == null || isNaN(v)) return 0;
  return Number(v);
}

export async function computeRendaPotencial(userId, opts) {
  if (!opts) opts = {};
  var portfolioId = opts.portfolioId || null;

  var results = await Promise.all([
    getPositions(userId, portfolioId || undefined),
    getOpcoes(userId, portfolioId || undefined),
    getRendaFixa(userId, portfolioId || undefined),
    getSaldos(userId),
    getProfile(userId),
    buildIncomeForecast(userId, { portfolioId: portfolioId }).catch(function() { return null; }),
  ]);
  var positions = (results[0] && results[0].data) || [];
  var opcoes = (results[1] && results[1].data) || [];
  var rf = (results[2] && results[2].data) || [];
  var saldos = (results[3] && results[3].data) || [];
  var profile = (results[4] && results[4].data) || {};
  var forecast = results[5];
  var selic = profile.selic || 13.25;

  // ─── Classificar valor do patrimonio por classe ───
  var totais = {
    fii: 0,
    acao_com_cc: 0,      // acoes com venda coberta ativa
    acao_sem_cc: 0,      // acoes paradas
    etf: 0,
    etf_int: 0,
    rf: 0,
    rf_baixa: 0,         // RF rendendo <90% CDI
    caixa: 0,
    outros: 0,
  };

  // Opcoes ativas — saber quais tickers tem CC
  var tickersComCC = {};
  for (var oi = 0; oi < opcoes.length; oi++) {
    var o = opcoes[oi];
    if (o.status !== 'ativa') continue;
    if ((o.tipo || '').toLowerCase() !== 'call') continue;
    if ((o.direcao || 'venda') === 'compra') continue;
    var base = (o.ativo_base || '').toUpperCase();
    if (!tickersComCC[base]) tickersComCC[base] = 0;
    tickersComCC[base] += o.quantidade || 0;
  }

  // Acoes e FIIs paradas — para detectar gap de covered call
  var acoesSemCC = []; // [{ticker, qty, valor}]

  for (var p = 0; p < positions.length; p++) {
    var pos = positions[p];
    var qty = safeNum(pos.quantidade);
    if (qty <= 0) continue;
    var pm = safeNum(pos.pm);
    var valor = qty * pm;
    var cat = pos.categoria;
    var tk = (pos.ticker || '').toUpperCase();
    var mercado = pos.mercado || 'BR';

    if (cat === 'fii') {
      totais.fii += valor;
    } else if (cat === 'acao') {
      if (mercado === 'BR' && qty >= LIMIAR_ACAO_MIN_QTY) {
        var ccQty = tickersComCC[tk] || 0;
        var qtyLivre = qty - ccQty;
        if (qtyLivre >= LIMIAR_ACAO_MIN_QTY) {
          var valorLivre = qtyLivre * pm;
          acoesSemCC.push({ ticker: tk, qty: qtyLivre, valor: valorLivre });
          totais.acao_sem_cc += valorLivre;
          // O restante ja tem CC
          totais.acao_com_cc += (ccQty * pm);
        } else {
          totais.acao_com_cc += valor;
        }
      } else {
        totais.acao_sem_cc += valor;
      }
    } else if (cat === 'stock_int') {
      totais.acao_sem_cc += valor;
    } else if (cat === 'etf') {
      if (mercado === 'INT') totais.etf_int += valor;
      else totais.etf += valor;
    } else {
      totais.outros += valor;
    }
  }

  // Renda fixa — detectar taxas baixas
  var rfBaixas = []; // [{ emissor, valor, taxa, taxaIdeal }]
  for (var r = 0; r < rf.length; r++) {
    var rfItem = rf[r];
    var valorRf = safeNum(rfItem.valor_aplicado);
    var taxa = safeNum(rfItem.taxa);
    var indexador = (rfItem.indexador || '').toUpperCase();
    var taxaEfetiva = taxa;
    if (indexador === 'CDI' || indexador.indexOf('CDI') !== -1) {
      // taxa pos-fixada: Y% do CDI × selic = taxa real anual
      taxaEfetiva = (taxa / 100) * selic;
    }
    totais.rf += valorRf;
    if (taxaEfetiva < selic * LIMIAR_RF_BAIXA_PCT) {
      totais.rf_baixa += valorRf;
      rfBaixas.push({
        emissor: rfItem.emissor || rfItem.tipo || 'RF',
        valor: valorRf,
        taxaEfetiva: taxaEfetiva,
        ganhoPossivel: valorRf * (selic - taxaEfetiva) / 100 / 12,
      });
    }
  }

  // Caixa — saldos em conta (BRL)
  var totalCaixa = 0;
  for (var s = 0; s < saldos.length; s++) {
    var sal = saldos[s];
    if ((sal.moeda || 'BRL') === 'BRL' && (sal.tipo === 'conta' || sal.tipo === 'corretora')) {
      totalCaixa += safeNum(sal.saldo);
    }
  }
  totais.caixa = totalCaixa;

  // ─── Patrimonio total e renda real ───
  var patrimonio = 0;
  var keys = Object.keys(totais);
  for (var k = 0; k < keys.length; k++) patrimonio += totais[keys[k]];

  // Renda real = media dos ultimos 3 meses completos (nao projecao)
  var rendaReal = 0;
  if (forecast && forecast.historyMonthly && forecast.historyMonthly.length > 1) {
    var nowRR = new Date();
    var mesAtualRR = nowRR.getFullYear() + '-' + String(nowRR.getMonth() + 1).padStart(2, '0');
    var mesesCompletosRR = [];
    for (var rrh = 0; rrh < forecast.historyMonthly.length; rrh++) {
      var rrItem = forecast.historyMonthly[rrh];
      var rrKey = rrItem.year + '-' + String(rrItem.mes + 1).padStart(2, '0');
      if (rrKey !== mesAtualRR) mesesCompletosRR.push(rrItem);
    }
    var rrUlt = mesesCompletosRR.slice(-3);
    for (var rri2 = 0; rri2 < rrUlt.length; rri2++) { rendaReal += rrUlt[rri2].total || 0; }
    rendaReal = rrUlt.length > 0 ? rendaReal / rrUlt.length : 0;
  }
  if (rendaReal <= 0 && forecast && forecast.summary) {
    rendaReal = forecast.summary.lastMonth || 0;
  }

  // ─── Renda potencial = soma(total_classe * yield_ideal / 12) ───
  var rendaPotencial = 0;
  rendaPotencial += totais.fii * YIELD_IDEAL.fii / 100 / 12;
  rendaPotencial += totais.acao_com_cc * YIELD_IDEAL.acao_com_cc / 100 / 12;
  rendaPotencial += totais.acao_sem_cc * YIELD_IDEAL.acao_sem_cc / 100 / 12;
  rendaPotencial += totais.etf * YIELD_IDEAL.etf / 100 / 12;
  rendaPotencial += totais.etf_int * YIELD_IDEAL.etf_int / 100 / 12;
  // RF: boa rende selic, baixa rende a taxa real (nao inflacionar potencial)
  var rfBoa = totais.rf - totais.rf_baixa;
  rendaPotencial += rfBoa * selic / 100 / 12;
  // RF baixa: potencial = migrar pra selic
  rendaPotencial += totais.rf_baixa * selic / 100 / 12;
  // Caixa: nao rende selic (esta em conta corrente), potencial se aplicar
  rendaPotencial += totais.caixa * YIELD_IDEAL.caixa / 100 / 12;

  var gap = Math.max(0, rendaPotencial - rendaReal);
  var capturaPct = rendaPotencial > 0 ? (rendaReal / rendaPotencial) * 100 : 0;
  var yieldIdealPonderado = patrimonio > 0 ? (rendaPotencial * 12 / patrimonio) * 100 : 0;
  var yieldRealPonderado = patrimonio > 0 ? (rendaReal * 12 / patrimonio) * 100 : 0;

  // ─── Diagnosticos (onde esta travado) ───
  var gaps = [];

  // 1. Caixa ociosa
  if (totais.caixa >= LIMIAR_CAIXA_OCIOSA) {
    var ganhoCaixa = totais.caixa * selic / 100 / 12;
    gaps.push({
      tipo: 'caixa_ociosa',
      severidade: totais.caixa > 5000 ? 'alta' : 'media',
      titulo: 'R$ ' + Math.round(totais.caixa).toLocaleString('pt-BR') + ' parado em caixa',
      descricao: 'Aplicando em FII/RF renderia +R$ ' + ganhoCaixa.toFixed(2) + '/mes',
      valorEnvolvido: totais.caixa,
      ganhoMensal: ganhoCaixa,
      acao: 'Alocar capital',
      rota: 'SimuladorFII',
    });
  }

  // 2. Acoes sem covered call
  if (acoesSemCC.length > 0) {
    var totalAcoesLivre = 0;
    var ganhoCC = 0;
    for (var ai = 0; ai < acoesSemCC.length; ai++) {
      totalAcoesLivre += acoesSemCC[ai].valor;
      // Assume 0.4% a.m. de premio em venda coberta OTM (realista)
      ganhoCC += acoesSemCC[ai].valor * 0.004;
    }
    var topAcoes = acoesSemCC.slice().sort(function(x, y) { return y.valor - x.valor; }).slice(0, 3);
    var tickersLista = topAcoes.map(function(a) { return a.ticker; }).join(', ');
    gaps.push({
      tipo: 'acao_sem_cc',
      severidade: totalAcoesLivre > 20000 ? 'alta' : 'media',
      titulo: acoesSemCC.length + ' a\u00e7\u00f5es sem venda coberta',
      descricao: tickersLista + ' paradas \u2014 covered call geraria +R$ ' + ganhoCC.toFixed(2) + '/mes',
      valorEnvolvido: totalAcoesLivre,
      ganhoMensal: ganhoCC,
      acao: 'Ver sugest\u00f5es de covered call',
      rota: 'Opcoes',
      tickers: acoesSemCC.map(function(a) { return a.ticker; }),
    });
  }

  // 3. RF abaixo do ideal
  if (rfBaixas.length > 0) {
    var totalRfBaixa = 0;
    var ganhoRf = 0;
    for (var ri = 0; ri < rfBaixas.length; ri++) {
      totalRfBaixa += rfBaixas[ri].valor;
      ganhoRf += rfBaixas[ri].ganhoPossivel;
    }
    gaps.push({
      tipo: 'rf_baixa',
      severidade: 'baixa',
      titulo: rfBaixas.length + ' RF rendendo menos que CDI',
      descricao: 'Migrando pra LCI/LCA 95% CDI renderia +R$ ' + ganhoRf.toFixed(2) + '/mes',
      valorEnvolvido: totalRfBaixa,
      ganhoMensal: ganhoRf,
      acao: 'Revisar renda fixa',
      rota: 'RendaFixa',
    });
  }

  // Ordenar gaps por ganho mensal desc
  gaps.sort(function(x, y) { return y.ganhoMensal - x.ganhoMensal; });

  return {
    patrimonio: patrimonio,
    rendaReal: rendaReal,
    rendaPotencial: rendaPotencial,
    gap: gap,
    capturaPct: capturaPct,
    yieldIdealPonderado: yieldIdealPonderado,
    yieldRealPonderado: yieldRealPonderado,
    totais: totais,
    gaps: gaps,
  };
}
