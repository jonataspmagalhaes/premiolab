/**
 * fiiStatusInvestService.js
 * Dados de FIIs via StatusInvest (substitui brapi para FIIs).
 *
 * Exports:
 *  - fetchAllFiis()          → { map, arr } com todos FIIs (price, dy, pvp, name, segment)
 *  - fetchFii12mChart(tk)    → array[12] de dividendos/cota por mes (ultimos 12m)
 *  - searchFiis(query)       → autocomplete (filtra lista cacheada)
 *  - clearFiiCache()         → limpa caches
 */

import { fetchDividendsStatusInvest } from './dividendService';

var SI_ADVANCED_URL = 'https://statusinvest.com.br/category/advancedsearchresult?search=%7B%22Segment%22%3A%22%22%7D&CategoryType=2';
var SI_HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

var CACHE_TTL_ALL = 60 * 60 * 1000;   // 1h — lista geral
var CACHE_TTL_CHART = 60 * 60 * 1000; // 1h — por ticker

var _allCache = null;
var _allCacheTs = 0;
var _allPending = null;

var _chartCache = {};
var _chartPending = {};

export function fetchAllFiis() {
  var now = Date.now();
  if (_allCache && (now - _allCacheTs) < CACHE_TTL_ALL) {
    return Promise.resolve(_allCache);
  }
  if (_allPending) return _allPending;

  _allPending = fetch(SI_ADVANCED_URL, { method: 'GET', headers: SI_HEADERS })
    .then(function(r) {
      if (!r.ok) throw new Error('SI advancedsearch HTTP ' + r.status);
      return r.json();
    })
    .then(function(json) {
      var list = Array.isArray(json) ? json : [];
      var map = {};
      var arr = [];
      for (var i = 0; i < list.length; i++) {
        var it = list[i];
        if (!it || !it.ticker) continue;
        var tk = String(it.ticker).toUpperCase().trim();
        if (!tk) continue;
        var entry = {
          ticker: tk,
          name: it.companyname || '',
          price: typeof it.price === 'number' ? it.price : 0,
          dy: typeof it.dy === 'number' ? it.dy : 0,
          pvp: typeof it.p_vp === 'number' ? it.p_vp : 0,
          vpa: typeof it.valorpatrimonialcota === 'number' ? it.valorpatrimonialcota : 0,
          segment: it.segment || '',
          subsector: it.subsectorname || '',
          sector: it.sectorname || '',
          lastDividend: typeof it.lastdividend === 'number' ? it.lastdividend : 0,
          liquidez: typeof it.liquidezmediadiaria === 'number' ? it.liquidezmediadiaria : 0,
        };
        map[tk] = entry;
        arr.push(entry);
      }
      _allCache = { map: map, arr: arr };
      _allCacheTs = Date.now();
      _allPending = null;
      return _allCache;
    })
    .catch(function(err) {
      _allPending = null;
      console.warn('fetchAllFiis error:', err.message || err);
      throw err;
    });

  return _allPending;
}

// Chart 12m (dividendos/cota por mes) via StatusInvest /companytickerprovents
export function fetchFii12mChart(ticker) {
  var tk = (ticker || '').toUpperCase().trim();
  if (!tk) return Promise.resolve([0,0,0,0,0,0,0,0,0,0,0,0]);

  var now = Date.now();
  var cached = _chartCache[tk];
  if (cached && (now - cached.ts) < CACHE_TTL_CHART) {
    return Promise.resolve(cached.data);
  }
  if (_chartPending[tk]) return _chartPending[tk];

  _chartPending[tk] = fetchDividendsStatusInvest(tk, 'fii').then(function(res) {
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
    console.warn('fetchFii12mChart error ' + tk + ':', err.message || err);
    return [0,0,0,0,0,0,0,0,0,0,0,0];
  });

  return _chartPending[tk];
}

// Autocomplete — filtra lista cacheada por ticker (prefix) ou nome
export function searchFiis(query) {
  if (!query) return Promise.resolve([]);
  var q = String(query).toUpperCase().trim();
  if (q.length < 1) return Promise.resolve([]);
  return fetchAllFiis().then(function(cached) {
    var arr = (cached && cached.arr) || [];
    var prefix = [];
    var contains = [];
    var nameMatch = [];
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      var tk = it.ticker;
      var nameU = (it.name || '').toUpperCase();
      if (tk.indexOf(q) === 0) prefix.push(it);
      else if (tk.indexOf(q) !== -1) contains.push(it);
      else if (nameU.indexOf(q) !== -1) nameMatch.push(it);
    }
    var results = prefix.concat(contains).concat(nameMatch);
    if (results.length > 10) results = results.slice(0, 10);
    return results;
  }).catch(function() { return []; });
}

export function clearFiiCache() {
  _allCache = null;
  _allCacheTs = 0;
  _chartCache = {};
}
