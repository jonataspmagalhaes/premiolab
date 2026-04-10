/**
 * acaoStatusInvestService.js
 * Dados de dividendos historicos de acoes via StatusInvest (mesmos endpoints
 * do fiiStatusInvestService, mas categoria='acao').
 *
 * Uso principal: projecao de renda futura pra acoes sem historico proprio
 * suficiente na tabela de proventos (compras recentes) ou como base mais
 * confiavel que o historico do proprio usuario (replica o que o AGF faz).
 *
 * Exports:
 *  - fetchAcao12mChart(ticker)    → array[12] de DPA mensal (ultimos 12m, por acao)
 *  - fetchAcaoDpaMedio(ticker, n) → DPA medio anual dos ultimos n anos (default 5)
 *  - clearAcaoCache()             → limpa caches
 *
 * StatusInvest nao cobre ETFs nem stocks internacionais. Pra esses, o caller
 * deve cair no comportamento atual (historico proprio ou zero).
 */

import { fetchDividendsStatusInvest } from './dividendService';

var CACHE_TTL = 60 * 60 * 1000; // 1h

var _chartCache = {};
var _chartPending = {};
var _dpaCache = {};
var _dpaPending = {};

// Retorna [12] com dividendo por acao (DPA) somado por mes, ultimos 12 meses.
// Similar ao fetchFii12mChart mas pra categoria 'acao'.
export function fetchAcao12mChart(ticker) {
  var tk = (ticker || '').toUpperCase().trim();
  if (!tk) return Promise.resolve([0,0,0,0,0,0,0,0,0,0,0,0]);

  var now = Date.now();
  var cached = _chartCache[tk];
  if (cached && (now - cached.ts) < CACHE_TTL) {
    return Promise.resolve(cached.data);
  }
  if (_chartPending[tk]) return _chartPending[tk];

  _chartPending[tk] = fetchDividendsStatusInvest(tk, 'acao').then(function(res) {
    var divs = (res && res.data) || [];
    var nowD = new Date();
    var cutoff = new Date(nowD.getFullYear() - 1, nowD.getMonth(), 1);
    var monthly = {};
    for (var i = 0; i < divs.length; i++) {
      var d = divs[i];
      var pd = d.paymentDate;
      var rate = d.rate;
      if (!pd || !rate || rate <= 0) continue;
      var dD = new Date(pd);
      if (isNaN(dD.getTime()) || dD < cutoff) continue;
      var mk = dD.getFullYear() + '-' + String(dD.getMonth() + 1).padStart(2, '0');
      if (!monthly[mk]) monthly[mk] = 0;
      monthly[mk] += rate;
    }
    var chart = [];
    for (var m = 11; m >= 0; m--) {
      var md = new Date(nowD.getFullYear(), nowD.getMonth() - m, 1);
      var mk2 = md.getFullYear() + '-' + String(md.getMonth() + 1).padStart(2, '0');
      chart.push(monthly[mk2] || 0);
    }
    _chartCache[tk] = { data: chart, ts: Date.now() };
    delete _chartPending[tk];
    return chart;
  }).catch(function(err) {
    delete _chartPending[tk];
    console.warn('fetchAcao12mChart error ' + tk + ':', err.message || err);
    return [0,0,0,0,0,0,0,0,0,0,0,0];
  });

  return _chartPending[tk];
}

// Retorna o DPA medio ANUAL dos ultimos N anos (default 5). Soma total de
// dividendos por acao nos ultimos N anos, divide por N. Usado pra projecao
// mais suavizada (metodologia comum em research de dividendos).
// Retorna { avgAnual, avgMensal, yearsWithData } — se yearsWithData < 2
// o caller deve considerar pouco confiavel e cair em outro fallback.
export function fetchAcaoDpaMedio(ticker, years) {
  var tk = (ticker || '').toUpperCase().trim();
  if (!tk) return Promise.resolve({ avgAnual: 0, avgMensal: 0, yearsWithData: 0 });
  var n = years || 5;
  var cacheKey = tk + ':' + n;

  var now = Date.now();
  var cached = _dpaCache[cacheKey];
  if (cached && (now - cached.ts) < CACHE_TTL) {
    return Promise.resolve(cached.data);
  }
  if (_dpaPending[cacheKey]) return _dpaPending[cacheKey];

  _dpaPending[cacheKey] = fetchDividendsStatusInvest(tk, 'acao').then(function(res) {
    var divs = (res && res.data) || [];
    var nowD = new Date();
    var cutoff = new Date(nowD.getFullYear() - n, nowD.getMonth(), 1);
    var totalByYear = {};
    for (var i = 0; i < divs.length; i++) {
      var d = divs[i];
      var pd = d.paymentDate;
      var rate = d.rate;
      if (!pd || !rate || rate <= 0) continue;
      var dD = new Date(pd);
      if (isNaN(dD.getTime()) || dD < cutoff || dD > nowD) continue;
      var yr = dD.getFullYear();
      if (!totalByYear[yr]) totalByYear[yr] = 0;
      totalByYear[yr] += rate;
    }
    var years_keys = Object.keys(totalByYear);
    var yearsWithData = years_keys.length;
    var sumTotal = 0;
    for (var k = 0; k < years_keys.length; k++) {
      sumTotal += totalByYear[years_keys[k]];
    }
    // Divide pelo periodo completo N, nao so anos com dados — ano seco conta
    // como zero, evita inflar media de empresa que pagou uma vez e sumiu.
    var avgAnual = n > 0 ? sumTotal / n : 0;
    var result = {
      avgAnual: avgAnual,
      avgMensal: avgAnual / 12,
      yearsWithData: yearsWithData,
    };
    _dpaCache[cacheKey] = { data: result, ts: Date.now() };
    delete _dpaPending[cacheKey];
    return result;
  }).catch(function(err) {
    delete _dpaPending[cacheKey];
    console.warn('fetchAcaoDpaMedio error ' + tk + ':', err.message || err);
    return { avgAnual: 0, avgMensal: 0, yearsWithData: 0 };
  });

  return _dpaPending[cacheKey];
}

export function clearAcaoCache() {
  _chartCache = {};
  _chartPending = {};
  _dpaCache = {};
  _dpaPending = {};
}
