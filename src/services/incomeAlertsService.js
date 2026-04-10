/**
 * incomeAlertsService.js
 * Detector de alertas voltados a RENDA (nao preco).
 *
 * Tipos:
 *  - corte_provento: ticker pagou X% menos que media 12m
 *  - queda_projecao: projecao do mes caiu Y% vs mes anterior
 *  - vencimento_cc: venda coberta vencendo em ate 3 dias
 *  - sem_pagamento: ticker historico pagando que passou 2+ meses sem pagar
 *
 * Exports:
 *  - detectIncomeAlerts(userId) → [{ tipo, severidade, titulo, mensagem, ticker?, valor? }]
 *  - dispatchIncomeAlerts(userId) → chama detect + envia notificacoes locais
 */

import { getProventos, getOpcoes, getPositions } from './database';
import { buildIncomeForecast } from './incomeForecastService';

var notifService = null;
try { notifService = require('./notificationService'); } catch (e) {}

function parseDateSafe(s) {
  if (!s) return null;
  var d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d;
}

function monthKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// Detecta cortes nos proventos (ticker pagou X% menos que media 12m)
function detectCortes(proventos, limiarPct) {
  var alerts = [];
  var now = new Date();
  var cutoff12 = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  var cutoff3 = new Date(now.getFullYear(), now.getMonth() - 2, 1);

  // Agregar por ticker
  var tickerData = {};
  for (var i = 0; i < proventos.length; i++) {
    var p = proventos[i];
    var pd = parseDateSafe(p.data_pagamento);
    if (!pd || pd < cutoff12) continue;
    var tk = (p.ticker || '').toUpperCase();
    if (!tk) continue;
    var val = p.valor_total || ((p.valor_por_cota || 0) * (p.quantidade || 0));
    if (val <= 0) continue;
    if (!tickerData[tk]) tickerData[tk] = { todos: [], recentes: [] };
    tickerData[tk].todos.push({ date: pd, val: val });
    if (pd >= cutoff3) tickerData[tk].recentes.push({ date: pd, val: val });
  }

  var keys = Object.keys(tickerData);
  for (var k = 0; k < keys.length; k++) {
    var td = tickerData[keys[k]];
    if (td.todos.length < 6) continue;
    if (td.recentes.length === 0) continue;
    var somaTotal = 0;
    for (var a = 0; a < td.todos.length; a++) somaTotal += td.todos[a].val;
    var media = somaTotal / td.todos.length;
    // Comparar ultimo pagamento com a media
    td.recentes.sort(function(x, y) { return y.date - x.date; });
    var ultimo = td.recentes[0];
    var queda = ((media - ultimo.val) / media) * 100;
    if (queda >= limiarPct) {
      alerts.push({
        tipo: 'corte_provento',
        severidade: queda >= 25 ? 'alta' : 'media',
        titulo: keys[k] + ' cortou o provento ' + queda.toFixed(0) + '%',
        mensagem: 'Pagamento de R$ ' + ultimo.val.toFixed(2) + ' esta ' + queda.toFixed(0) + '% abaixo da media 12m.',
        ticker: keys[k],
        valor: ultimo.val,
      });
    }
  }
  return alerts;
}

// Queda da projecao do proximo mes vs mes anterior
function detectQuedaProjecao(forecast, limiarPct) {
  var alerts = [];
  if (!forecast || !forecast.monthly || forecast.monthly.length < 2) return alerts;
  var atual = forecast.monthly[0].total;
  var proximo = forecast.monthly[1].total;
  if (atual <= 0) return alerts;
  var variacao = ((proximo - atual) / atual) * 100;
  if (variacao <= -limiarPct) {
    alerts.push({
      tipo: 'queda_projecao',
      severidade: variacao <= -25 ? 'alta' : 'media',
      titulo: 'Proximo mes deve cair ' + Math.abs(variacao).toFixed(0) + '%',
      mensagem: 'Renda projetada de R$ ' + atual.toFixed(2) + ' → R$ ' + proximo.toFixed(2) + '. Rebalancear?',
      valor: proximo,
    });
  }
  return alerts;
}

// Vencimentos de vendas cobertas nos proximos 3 dias
function detectVencimentosCC(opcoes) {
  var alerts = [];
  var now = new Date();
  var limite = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  for (var i = 0; i < opcoes.length; i++) {
    var o = opcoes[i];
    if (o.status !== 'ativa') continue;
    if ((o.direcao || 'venda') === 'compra') continue;
    if ((o.tipo || '').toLowerCase() !== 'call') continue;
    var venc = parseDateSafe(o.vencimento);
    if (!venc || venc < now || venc > limite) continue;
    var premio = (o.premio || 0) * (o.qty || 0);
    var dias = Math.round((venc.getTime() - now.getTime()) / (24 * 3600 * 1000));
    alerts.push({
      tipo: 'vencimento_cc',
      severidade: dias <= 1 ? 'alta' : 'info',
      titulo: 'Venc. ' + (o.ticker_opcao || '') + ' em ' + (dias <= 0 ? 'hoje' : dias + 'd'),
      mensagem: 'R$ ' + premio.toFixed(2) + ' de premio travado. Preparar rolagem ou expirar.',
      ticker: o.ticker_opcao,
      valor: premio,
    });
  }
  return alerts;
}

// Ticker historico pagando ficou 2+ meses sem pagar
function detectSemPagamento(proventos) {
  var alerts = [];
  var now = new Date();
  var cutoff6 = new Date(now.getFullYear(), now.getMonth() - 6, 1);
  var limite2m = new Date(now.getFullYear(), now.getMonth() - 2, 1);

  var porTicker = {};
  for (var i = 0; i < proventos.length; i++) {
    var p = proventos[i];
    var pd = parseDateSafe(p.data_pagamento);
    if (!pd || pd < cutoff6) continue;
    var tk = (p.ticker || '').toUpperCase();
    if (!tk) continue;
    if (!porTicker[tk]) porTicker[tk] = { count: 0, last: null };
    porTicker[tk].count++;
    if (!porTicker[tk].last || pd > porTicker[tk].last) porTicker[tk].last = pd;
  }

  var keys = Object.keys(porTicker);
  for (var k = 0; k < keys.length; k++) {
    var td = porTicker[keys[k]];
    // Ticker que pagou pelo menos 4x nos ultimos 6m (pagador regular)
    if (td.count < 4) continue;
    if (td.last && td.last < limite2m) {
      var diasSem = Math.round((now.getTime() - td.last.getTime()) / (24 * 3600 * 1000));
      alerts.push({
        tipo: 'sem_pagamento',
        severidade: 'media',
        titulo: keys[k] + ' sem pagar ha ' + diasSem + ' dias',
        mensagem: 'Ticker pagador regular nao distribuiu nos ultimos 2+ meses. Checar anuncios.',
        ticker: keys[k],
      });
    }
  }
  return alerts;
}

export async function detectIncomeAlerts(userId, opts) {
  if (!opts) opts = {};
  var limiarCortePct = opts.limiarCortePct || 15;
  var limiarProjecaoPct = opts.limiarProjecaoPct || 15;

  var results = await Promise.all([
    getProventos(userId, { limit: 2000 }),
    getOpcoes(userId),
    buildIncomeForecast(userId).catch(function() { return null; }),
  ]);
  var proventos = (results[0] && results[0].data) || [];
  var opcoes = (results[1] && results[1].data) || [];
  var forecast = results[2];

  var alerts = [];
  alerts = alerts.concat(detectCortes(proventos, limiarCortePct));
  if (forecast) alerts = alerts.concat(detectQuedaProjecao(forecast, limiarProjecaoPct));
  alerts = alerts.concat(detectVencimentosCC(opcoes));
  alerts = alerts.concat(detectSemPagamento(proventos));

  // Ordenar por severidade
  var ordem = { alta: 0, media: 1, info: 2 };
  alerts.sort(function(a, b) { return (ordem[a.severidade] || 3) - (ordem[b.severidade] || 3); });

  return alerts;
}

export async function dispatchIncomeAlerts(userId) {
  var alerts = await detectIncomeAlerts(userId);
  if (!notifService || !notifService.scheduleLocal) return alerts;
  for (var i = 0; i < alerts.length; i++) {
    if (alerts[i].severidade === 'alta') {
      try {
        notifService.scheduleLocal({
          title: alerts[i].titulo,
          body: alerts[i].mensagem,
          seconds: 1,
        });
      } catch (e) { /* ignore */ }
    }
  }
  return alerts;
}
