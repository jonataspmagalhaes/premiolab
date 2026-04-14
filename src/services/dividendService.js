/**
 * dividendService.js
 * Auto-sync de dividendos via brapi.dev + StatusInvest (cross-check)
 * Detecta novos dividendos para tickers na carteira e insere como proventos
 */

import { getPositions, getProventos, addProvento, getOperacoes, updateProfile, getSaldos, addMovimentacao, upsertSaldo, getMovimentacoes, getPortfolios } from './database';
import { supabase } from '../config/supabase';
import { fetchYahooDividends } from './yahooService';
import { fetchExchangeRates } from './currencyService';
import AsyncStorage from '@react-native-async-storage/async-storage';

var ALIASES_KEY = '@premiolab_corretora_aliases';

export async function getCorretoraAliases() {
  try {
    var raw = await AsyncStorage.getItem(ALIASES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}

export async function saveCorretoraAlias(from, to) {
  try {
    var aliases = await getCorretoraAliases();
    aliases[from.toUpperCase().trim()] = to.toUpperCase().trim();
    await AsyncStorage.setItem(ALIASES_KEY, JSON.stringify(aliases));
  } catch (e) { console.warn('saveCorretoraAlias error:', e); }
}

// Guard contra sync concorrente (module-level)
var _syncRunning = false;

var BRAPI_URL = 'https://brapi.dev/api/quote/';
var BRAPI_TOKEN = 'tEU8wyBixv8hCi7J3NCjsi';

var SI_BASE_URL = 'https://statusinvest.com.br/';

// ══════════ FETCH DIVIDENDS BRAPI ══════════

export async function fetchDividendsBrapi(ticker) {
  try {
    var url = BRAPI_URL + ticker + '?dividends=true&token=' + BRAPI_TOKEN;
    var response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      console.warn('brapi HTTP ' + response.status + ' for ' + ticker);
      return { data: [], error: 'HTTP ' + response.status };
    }

    var json = await response.json();
    var results = json.results || [];

    if (results.length === 0) {
      return { data: [], error: null };
    }

    var dividendsData = results[0].dividendsData || {};
    var cashDividends = dividendsData.cashDividends || [];
    return { data: cashDividends, error: null };
  } catch (err) {
    console.warn('fetchDividendsBrapi error for ' + ticker + ':', err.message);
    return { data: [], error: err.message };
  }
}

// Alias para compatibilidade
export function fetchDividends(ticker) {
  return fetchDividendsBrapi(ticker);
}

// ══════════ FETCH DIVIDENDS STATUSINVEST ══════════

function parseDateDDMMYYYY(dateStr) {
  if (!dateStr) return null;
  var parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  return parts[2] + '-' + parts[1] + '-' + parts[0];
}

export async function fetchDividendsStatusInvest(ticker, categoria) {
  try {
    // StatusInvest nao suporta ETFs — endpoints sao apenas /acao/ e /fii/
    if (categoria === 'etf') {
      return { data: [], error: null };
    }
    var tipo = (categoria === 'fii') ? 'fii' : 'acao';
    var siHeaders = {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };

    var result = [];
    var resultKeys = {};

    // Endpoint 1: companytickerprovents (chart — dados historicos)
    try {
      var url1 = SI_BASE_URL + tipo + '/companytickerprovents?ticker=' + ticker + '&chartProvType=2';
      var resp1 = await fetch(url1, { method: 'GET', headers: siHeaders });
      if (resp1.ok) {
        var text1 = await resp1.text();
        try {
          var json1 = JSON.parse(text1);
          var models = json1 && json1.assetEarningsModels ? json1.assetEarningsModels : [];
          for (var i = 0; i < models.length; i++) {
            var item = models[i];
            var pd = parseDateDDMMYYYY(item.pd);
            var ed = parseDateDDMMYYYY(item.ed);
            var rate = item.v;
            var label = item.et || '';
            if (!pd || !rate || rate <= 0) continue;
            var rk = mergeDedupKey(pd, rate);
            if (!resultKeys[rk]) {
              resultKeys[rk] = true;
              result.push({ paymentDate: pd, rate: rate, label: label.toUpperCase(), lastDatePrior: ed });
            }
          }
        } catch (e) { console.warn('StatusInvest endpoint1 JSON parse for ' + ticker + ':', e.message); }
      }
    } catch (e) { console.warn('StatusInvest endpoint1 fetch for ' + ticker + ':', e.message); }

    // Endpoint 2: companytickerproventsresult (tabela — inclui proventos recentes/futuros)
    try {
      var url2 = SI_BASE_URL + tipo + '/companytickerproventsresult?ticker=' + ticker + '&start=0&length=50';
      var resp2 = await fetch(url2, { method: 'GET', headers: siHeaders });
      if (resp2.ok) {
        var text2 = await resp2.text();
        try {
          var json2 = JSON.parse(text2);
          var rows = json2 && json2.data ? json2.data : [];
          for (var j = 0; j < rows.length; j++) {
            var row = rows[j];
            var pd2 = parseDateDDMMYYYY(row.pd);
            var ed2 = parseDateDDMMYYYY(row.ed);
            var rate2 = row.v;
            var label2 = row.et || '';
            if (!pd2 || !rate2 || rate2 <= 0) continue;
            var rk2 = mergeDedupKey(pd2, rate2);
            if (!resultKeys[rk2]) {
              resultKeys[rk2] = true;
              result.push({ paymentDate: pd2, rate: rate2, label: label2.toUpperCase(), lastDatePrior: ed2 });
            }
          }
        } catch (e) { console.warn('StatusInvest endpoint2 JSON parse for ' + ticker + ':', e.message); }
      }
    } catch (e) { console.warn('StatusInvest endpoint2 fetch for ' + ticker + ':', e.message); }

    return { data: result, error: null };
  } catch (err) {
    console.warn('fetchDividendsStatusInvest error for ' + ticker + ':', err.message);
    return { data: [], error: err.message };
  }
}

// ══════════ MERGE DIVIDENDS ══════════

function mergeDedupKey(paymentDate, rate) {
  var d = (paymentDate || '').substring(0, 10);
  var v = Math.round((rate || 0) * 10000);
  return d + '|' + v;
}

export function mergeDividends(brapiDivs, statusInvestDivs) {
  var map = {};
  var result = [];

  // Brapi como base
  for (var i = 0; i < brapiDivs.length; i++) {
    var bd = brapiDivs[i];
    var bKey = mergeDedupKey(bd.paymentDate, bd.rate);
    map[bKey] = true;
    result.push(bd);
  }

  // StatusInvest: adiciona apenas os que brapi nao tem
  for (var j = 0; j < statusInvestDivs.length; j++) {
    var sd = statusInvestDivs[j];
    var sKey = mergeDedupKey(sd.paymentDate, sd.rate);
    if (!map[sKey]) {
      map[sKey] = true;
      result.push(sd);
    }
  }

  return result;
}

// ══════════ MAP LABEL TO TIPO ══════════

export function mapLabelToTipo(label) {
  if (!label) return 'dividendo';
  var upper = label.toUpperCase().trim();
  if (upper === 'JCP' || upper.indexOf('JCP') !== -1 || upper.indexOf('JUROS SOBRE CAPITAL') !== -1) {
    return 'jcp';
  }
  if (upper === 'RENDIMENTO' || upper.indexOf('RENDIMENTO') !== -1 || upper.indexOf('REND.') !== -1 || upper.indexOf('REND ') !== -1) {
    return 'rendimento';
  }
  return 'dividendo';
}

// ══════════ SHOULD SYNC DIVIDENDS ══════════

export function shouldSyncDividends(lastSyncDate) {
  // Se nunca sincronizou, sincronizar imediatamente
  if (!lastSyncDate) return true;

  var now = new Date();

  // Verificar se ja sincronizou hoje
  var todayStr = now.toISOString().substring(0, 10);
  var lastStr = typeof lastSyncDate === 'string'
    ? lastSyncDate.substring(0, 10)
    : new Date(lastSyncDate).toISOString().substring(0, 10);
  if (lastStr === todayStr) return false;

  return true;
}

// ══════════ DEDUP KEY ══════════

function dedupKey(ticker, dataPagamento, valorPorCota, portfolioId) {
  var t = (ticker || '').toUpperCase().trim();
  var d = (dataPagamento || '').substring(0, 10);
  var v = Math.round((valorPorCota || 0) * 10000);
  var p = portfolioId || '__null__';
  return t + '|' + d + '|' + v + '|' + p;
}

// Chave loose (ticker+date+portfolio) para catch duplicados com rate diferente
function dedupKeyLoose(ticker, dataPagamento, portfolioId) {
  var t = (ticker || '').toUpperCase().trim();
  var d = (dataPagamento || '').substring(0, 10);
  var p = portfolioId || '__null__';
  return t + '|' + d + '|' + p;
}

// ══════════ POSITION AT DATE (POR PORTFOLIO) ══════════

// Calcula posicao historica na data-com a partir de ops pre-filtradas (portfolio+ticker)
// Retorna { qty, por_corretora, corretora } onde corretora e a principal (maior qty)
function positionAtDateForPortfolio(ops, dateStr) {
  var qtyAt = 0;
  var porCorretora = {};
  for (var i = 0; i < ops.length; i++) {
    var od = (ops[i].data || '').substring(0, 10);
    if (od <= dateStr) {
      var corr = (ops[i].corretora || 'Sem corretora').toUpperCase().trim();
      if (!porCorretora[corr]) porCorretora[corr] = 0;
      if (ops[i].tipo === 'compra') {
        qtyAt += (ops[i].quantidade || 0);
        porCorretora[corr] += (ops[i].quantidade || 0);
      } else if (ops[i].tipo === 'venda') {
        qtyAt -= (ops[i].quantidade || 0);
        porCorretora[corr] -= (ops[i].quantidade || 0);
      }
    }
  }
  // Limpar entradas zero/negativas
  var keys = Object.keys(porCorretora);
  for (var j = 0; j < keys.length; j++) {
    if (porCorretora[keys[j]] <= 0) delete porCorretora[keys[j]];
  }
  // Determinar corretora principal (maior qty)
  var mainCorretora = null;
  var maxQty = 0;
  var finalKeys = Object.keys(porCorretora);
  for (var m = 0; m < finalKeys.length; m++) {
    if (porCorretora[finalKeys[m]] > maxQty) {
      maxQty = porCorretora[finalKeys[m]];
      mainCorretora = finalKeys[m];
    }
  }
  return { qty: Math.max(0, qtyAt), por_corretora: porCorretora, corretora: mainCorretora };
}

// Helper: corretora principal de um objeto por_corretora
function mainCorretoraFrom(porCorretora) {
  if (!porCorretora) return null;
  var keys = Object.keys(porCorretora);
  var mainCorr = null;
  var maxQ = 0;
  for (var i = 0; i < keys.length; i++) {
    if ((porCorretora[keys[i]] || 0) > maxQ) {
      maxQ = porCorretora[keys[i]] || 0;
      mainCorr = keys[i];
    }
  }
  return mainCorr;
}

// ══════════ RUN DIVIDEND SYNC ══════════

export async function runDividendSync(userId) {
  // Guard contra sync concorrente
  if (_syncRunning) {
    return { inserted: 0, checked: 0, details: [], message: 'Sync já em andamento' };
  }
  _syncRunning = true;
  try {
    // 0. Buscar portfolios do usuario
    var portfoliosResult = await getPortfolios(userId);
    var portfoliosList = portfoliosResult.data || [];
    // Lista: null (Padrão) + cada portfolio custom
    var portfolioIds = [null];
    var portfolioOpContas = {}; // portfolioId → boolean (true = gera movimentacoes nas contas)
    portfolioOpContas['__null__'] = true; // Padrao sempre gera
    for (var pi = 0; pi < portfoliosList.length; pi++) {
      portfolioIds.push(portfoliosList[pi].id);
      portfolioOpContas[portfoliosList[pi].id] = portfoliosList[pi].operacoes_contas !== false;
    }

    // 1. Buscar TODAS operacoes uma vez para positionAtDate por portfolio
    var opsResult = await getOperacoes(userId);
    var allOps = opsResult.data || [];

    // Agrupar operacoes: portfolioKey → ticker → [ops]
    var opsByPortTicker = {};
    var firstBuyByPort = {};
    for (var oi = 0; oi < allOps.length; oi++) {
      var op = allOps[oi];
      var opPortKey = op.portfolio_id || '__null__';
      var opTicker = (op.ticker || '').toUpperCase().trim();
      var opDate = (op.data || '').substring(0, 10);
      if (!opDate) continue;
      if (!opsByPortTicker[opPortKey]) opsByPortTicker[opPortKey] = {};
      if (!opsByPortTicker[opPortKey][opTicker]) opsByPortTicker[opPortKey][opTicker] = [];
      opsByPortTicker[opPortKey][opTicker].push(op);
      if (op.tipo === 'compra') {
        var fbKey = opPortKey + '|' + opTicker;
        if (!firstBuyByPort[fbKey] || opDate < firstBuyByPort[fbKey]) {
          firstBuyByPort[fbKey] = opDate;
        }
      }
    }

    // 2. Buscar saldos para contas destino das movimentacoes
    var saldosResult = await getSaldos(userId);
    var saldosData = saldosResult.data || [];
    var saldosByName = {};
    // Aliases: hardcoded + salvos pelo usuario
    var CORRETORA_ALIASES = { 'XP INVESTIMENTOS': 'XP' };
    var savedAliases = await getCorretoraAliases();
    var savedKeys = Object.keys(savedAliases);
    for (var sak = 0; sak < savedKeys.length; sak++) {
      CORRETORA_ALIASES[savedKeys[sak]] = savedAliases[savedKeys[sak]];
    }
    for (var si = 0; si < saldosData.length; si++) {
      var sn = (saldosData[si].corretora || saldosData[si].name || '').trim().toUpperCase();
      var snOriginal = (saldosData[si].corretora || saldosData[si].name || '').trim();
      var sm = (saldosData[si].moeda || 'BRL').toUpperCase();
      if (sn) {
        if (!saldosByName[sn]) saldosByName[sn] = [];
        saldosByName[sn].push({ name: snOriginal, moeda: sm });
      }
    }
    // Registrar aliases: se "XP INVESTIMENTOS" nao existe mas "XP" sim, mapear
    var aliasKeys = Object.keys(CORRETORA_ALIASES);
    for (var ali = 0; ali < aliasKeys.length; ali++) {
      var aliasFrom = aliasKeys[ali];
      var aliasTo = CORRETORA_ALIASES[aliasFrom];
      if (!saldosByName[aliasFrom] && saldosByName[aliasTo]) {
        saldosByName[aliasFrom] = saldosByName[aliasTo];
      }
    }

    // Helper: encontrar conta certa para creditar dividendo
    function findContaForPosition(pos, preferMoeda) {
      if (!preferMoeda) preferMoeda = 'BRL';
      if (saldosData.length === 0) return null;
      var porCorretora = pos && pos.por_corretora;
      if (porCorretora) {
        var corKeys = Object.keys(porCorretora);
        for (var ck = 0; ck < corKeys.length; ck++) {
          var corName = corKeys[ck].toUpperCase().trim();
          var matches = saldosByName[corName];
          if (matches) {
            for (var cm = 0; cm < matches.length; cm++) {
              if (matches[cm].moeda === preferMoeda) return matches[cm].name;
            }
            return matches[0].name;
          }
        }
      }
      return null;
    }

    // 3. Buscar proventos existentes para dedup (com portfolio_id na chave)
    var provResult = await getProventos(userId, {});
    var existingProventos = provResult.data || [];

    // 3a. Cleanup: deletar proventos orfaos (portfolio_id = null) cujos tickers
    // agora pertencem a portfolios especificos. O sync vai recriar per-portfolio.
    var tickersInPortfolios = {}; // ticker → true se existe em portfolio especifico
    for (var tpIdx = 1; tpIdx < portfolioIds.length; tpIdx++) {
      var tpId = portfolioIds[tpIdx];
      if (!tpId) continue;
      var tpPosResult = await getPositions(userId, tpId);
      var tpPositions = tpPosResult.data || [];
      for (var tppi = 0; tppi < tpPositions.length; tppi++) {
        var tpTicker = (tpPositions[tppi].ticker || '').toUpperCase().trim();
        if (tpTicker) tickersInPortfolios[tpTicker] = true;
      }
    }
    // Also check Padrao positions to know which tickers are ONLY in Padrao
    var padraoPosResult = await getPositions(userId, '__null__');
    var padraoPositions = padraoPosResult.data || [];
    var tickersInPadrao = {};
    for (var ppIdx = 0; ppIdx < padraoPositions.length; ppIdx++) {
      var ppTicker = (padraoPositions[ppIdx].ticker || '').toUpperCase().trim();
      if (ppTicker) tickersInPadrao[ppTicker] = true;
    }

    var orphanIdsToDelete = [];
    for (var oe = 0; oe < existingProventos.length; oe++) {
      var oep = existingProventos[oe];
      if (oep.portfolio_id) continue; // not orphan
      var oTicker = (oep.ticker || '').toUpperCase().trim();
      // Delete orphan if ticker exists in a specific portfolio
      // AND either doesn't exist in Padrao OR also exists in a specific portfolio
      if (tickersInPortfolios[oTicker]) {
        orphanIdsToDelete.push(oep.id);
      }
    }
    if (orphanIdsToDelete.length > 0) {
      // Delete in batches of 50
      for (var odBatch = 0; odBatch < orphanIdsToDelete.length; odBatch += 50) {
        var batch = orphanIdsToDelete.slice(odBatch, odBatch + 50);
        await supabase.from('proventos').delete().in('id', batch);
      }
      // Re-fetch proventos after cleanup
      provResult = await getProventos(userId, {});
      existingProventos = provResult.data || [];
    }

    var existingKeys = {};
    var existingKeysLoose = {};
    for (var e = 0; e < existingProventos.length; e++) {
      var ep = existingProventos[e];
      var key = dedupKey(ep.ticker, ep.data_pagamento, ep.valor_por_cota, ep.portfolio_id);
      existingKeys[key] = true;
      var keyL = dedupKeyLoose(ep.ticker, ep.data_pagamento, ep.portfolio_id);
      if (!existingKeysLoose[keyL]) existingKeysLoose[keyL] = 0;
      existingKeysLoose[keyL]++;
    }

    // 3b. Buscar movimentacoes de dividendos existentes para dedup
    var movDivResult = await getMovimentacoes(userId, { limit: 5000 });
    var existingMovs = movDivResult.data || [];
    var existingMovKeys = {};
    for (var em = 0; em < existingMovs.length; em++) {
      var emv = existingMovs[em];
      if (emv.categoria === 'dividendo' || emv.categoria === 'jcp' || emv.categoria === 'rendimento_fii') {
        // Chave por corretora+ticker+data+portfolio para suportar multi-corretora
        var emConta = (emv.conta || '').toUpperCase().trim();
        var emTicker = (emv.ticker || '').toUpperCase().trim();
        var emDate = (emv.data || '').substring(0, 10);
        var emPort = emv.portfolio_id || '__null__';
        var emCat = emv.categoria || '';
        existingMovKeys[emConta + '|' + emTicker + '|' + emDate + '|' + emPort + '|' + emCat] = true;
      }
    }

    // 4. Filtro de data: ultimos 12 meses
    var now = new Date();
    var todayStr = now.toISOString().substring(0, 10);
    var cutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    var cutoffStr = cutoff.toISOString().substring(0, 10);

    var inserted = 0;
    var details = [];
    var divCacheBR = {};
    var divCacheINT = {};
    var hasInt = false;
    var usdRate = 1;
    var positionCache = {}; // portfolioKey|ticker → position (para retroactive movs)
    var saldoAccum = {}; // conta → valor acumulado para atualizar no final (evita race condition)

    // 5. Para cada portfolio, buscar posicoes e processar dividendos
    for (var pIdx = 0; pIdx < portfolioIds.length; pIdx++) {
      var currentPortId = portfolioIds[pIdx];
      var currentPortKey = currentPortId || '__null__';

      var posResult2 = await getPositions(userId, currentPortId ? currentPortId : '__null__');
      var positions = posResult2.data || [];
      if (positions.length === 0) continue;

      // Cache posicoes para retroactive pass
      for (var pci = 0; pci < positions.length; pci++) {
        var pcTk = positions[pci].ticker.toUpperCase().trim();
        positionCache[currentPortKey + '|' + pcTk] = positions[pci];
      }

      var brPositions = [];
      var intPositions = [];
      for (var fi = 0; fi < positions.length; fi++) {
        if (positions[fi].mercado === 'INT') {
          intPositions.push(positions[fi]);
        } else {
          brPositions.push(positions[fi]);
        }
      }

      // Buscar cambio USD→BRL se houver INT e ainda nao buscou
      if (intPositions.length > 0 && !hasInt) {
        hasInt = true;
        try {
          var ratesResult = await fetchExchangeRates(['USD']);
          if (ratesResult && ratesResult['USD']) usdRate = ratesResult['USD'];
        } catch (exc) { console.warn('dividendSync USD rate error:', exc.message); }
      }

      // ─── BR TICKERS ───
      for (var bp = 0; bp < brPositions.length; bp++) {
        var pos = brPositions[bp];
        var ticker = pos.ticker;
        var qty = pos.quantidade || 0;
        if (qty <= 0) continue;

        var fbLookup = currentPortKey + '|' + ticker;
        var tickerDetail = {
          ticker: ticker,
          portfolio: currentPortKey,
          brapiCount: 0,
          brapiError: null,
          siCount: 0,
          siError: null,
          merged: 0,
          skippedDate: 0,
          skippedBuyDate: 0,
          skippedDedup: 0,
          inserted: 0,
          insertFailed: 0,
          lastInsertError: null,
          firstBuy: firstBuyByPort[fbLookup] || null,
          buyDateExamples: [],
        };

        // Buscar dividendos (cache por ticker)
        if (!divCacheBR[ticker]) {
          divCacheBR[ticker] = await fetchDividendsStatusInvest(ticker, pos.categoria);
        }
        var siResult = divCacheBR[ticker];
        var siDivs = siResult.data;
        tickerDetail.siCount = siDivs.length;
        tickerDetail.siError = siResult.error;
        tickerDetail.merged = siDivs.length;

        // Operacoes deste portfolio+ticker para positionAtDate
        var opsForTicker = (opsByPortTicker[currentPortKey] && opsByPortTicker[currentPortKey][ticker]) || [];

        for (var sd = 0; sd < siDivs.length; sd++) {
          var div = siDivs[sd];
          var paymentDate = div.paymentDate;
          if (!paymentDate) continue;
          var paymentDateStr = paymentDate.substring(0, 10);
          if (paymentDateStr < cutoffStr) { tickerDetail.skippedDate++; continue; }

          var rate = div.rate;
          if (!rate || rate <= 0) continue;

          // Data-com: posicao historica ou atual
          var dataCom = div.lastDatePrior ? div.lastDatePrior.substring(0, 10) : null;
          var qtyForDiv = qty;
          var porCorretoraDiv = pos.por_corretora || {};
          var corretoraDiv = mainCorretoraFrom(porCorretoraDiv);

          if (dataCom && dataCom <= todayStr) {
            var posAtDate = positionAtDateForPortfolio(opsForTicker, dataCom);
            qtyForDiv = posAtDate.qty;
            porCorretoraDiv = posAtDate.por_corretora;
            corretoraDiv = posAtDate.corretora;
            if (qtyForDiv <= 0) {
              tickerDetail.skippedBuyDate++;
              if (tickerDetail.buyDateExamples.length < 2) {
                tickerDetail.buyDateExamples.push('pag ' + paymentDateStr + ' ex ' + dataCom + ' qty=0');
              }
              continue;
            }
          }

          // Dedup (com portfolio_id) — para BR usar apenas strong key (inclui rate)
          // Loose key NAO usado para BR porque bloqueia JCP/Rend.Tributado com mesma data
          var dkey = dedupKey(ticker, paymentDateStr, rate, currentPortId);
          if (existingKeys[dkey]) { tickerDetail.skippedDedup++; continue; }

          var tipoProv = mapLabelToTipo(div.label);

          var provento = {
            ticker: ticker,
            tipo: tipoProv,
            valor_por_cota: rate,
            quantidade: qtyForDiv,
            data_pagamento: paymentDateStr,
            portfolio_id: currentPortId,
            corretora: corretoraDiv,
            por_corretora: porCorretoraDiv,
            data_com: dataCom || paymentDateStr,
          };

          var addResult = await addProvento(userId, provento);

          if (!addResult.error) {
            existingKeys[dkey] = true;
            inserted++;
            tickerDetail.inserted++;

            // Movimentacao por corretora (proporcional a qty de cada)
            // Respeitar operacoes_contas do portfolio
            var portOpContas = portfolioOpContas[currentPortId || '__null__'] !== false;
            if (portOpContas && rate * qtyForDiv > 0 && paymentDateStr <= todayStr) {
              var movCat = tipoProv === 'jcp' ? 'jcp' : tipoProv === 'rendimento' ? 'rendimento_fii' : 'dividendo';
              var movDesc = (tipoProv === 'jcp' ? 'JCP' : tipoProv === 'rendimento' ? 'Rendimento' : 'Dividendo') + ' ' + ticker;
              var corrKeys = Object.keys(porCorretoraDiv);
              if (corrKeys.length === 0) corrKeys = [corretoraDiv || 'Sem corretora'];
              for (var mci = 0; mci < corrKeys.length; mci++) {
                var mcCorr = corrKeys[mci];
                var mcQty = porCorretoraDiv[mcCorr] || qtyForDiv;
                var mcValor = rate * mcQty;
                if (mcValor <= 0) continue;
                var mcConta = (saldosByName[mcCorr.toUpperCase().trim()] && saldosByName[mcCorr.toUpperCase().trim()][0]) ? saldosByName[mcCorr.toUpperCase().trim()][0].name : null;
                if (!mcConta) continue;
                var mcMovKey = mcCorr + '|' + ticker + '|' + paymentDateStr + '|' + (currentPortId || '__null__') + '|' + movCat;
                if (existingMovKeys[mcMovKey]) continue;
                existingMovKeys[mcMovKey] = true;
                if (!saldoAccum[mcConta]) saldoAccum[mcConta] = 0;
                saldoAccum[mcConta] += mcValor;
                addMovimentacao(userId, {
                  conta: mcConta,
                  tipo: 'entrada',
                  categoria: movCat,
                  valor: mcValor,
                  descricao: movDesc,
                  ticker: ticker,
                  referencia_tipo: 'provento',
                  data: paymentDateStr,
                  portfolio_id: currentPortId,
                }).catch(function(err) { console.warn('dividendSync movimentacao failed:', err); });
              }
            }
          } else {
            tickerDetail.insertFailed++;
            tickerDetail.lastInsertError = addResult.error.message || addResult.error.code || JSON.stringify(addResult.error);
            console.warn('dividendSync: falha ao inserir provento ' + ticker + ' ' + paymentDateStr + ':', addResult.error);
          }
        }
        details.push(tickerDetail);
      }

      // ─── INT TICKERS ───
      for (var itp = 0; itp < intPositions.length; itp++) {
        var posInt = intPositions[itp];
        var tickerInt = posInt.ticker;
        var qtyInt = posInt.quantidade || 0;
        if (qtyInt <= 0) continue;

        var fbLookupInt = currentPortKey + '|' + tickerInt;
        var tickerDetailInt = {
          ticker: tickerInt,
          portfolio: currentPortKey,
          brapiCount: 0,
          brapiError: null,
          siCount: 0,
          siError: null,
          merged: 0,
          skippedDate: 0,
          skippedBuyDate: 0,
          skippedDedup: 0,
          inserted: 0,
          insertFailed: 0,
          lastInsertError: null,
          firstBuy: firstBuyByPort[fbLookupInt] || null,
          buyDateExamples: [],
        };

        // Buscar dividendos (cache por ticker)
        if (!divCacheINT[tickerInt]) {
          divCacheINT[tickerInt] = await fetchYahooDividends(tickerInt);
        }
        var yahooResult = divCacheINT[tickerInt];
        var yahooDivs = yahooResult.data;
        tickerDetailInt.siCount = yahooDivs.length;
        tickerDetailInt.siError = yahooResult.error;
        tickerDetailInt.merged = yahooDivs.length;

        for (var yd = 0; yd < yahooDivs.length; yd++) {
          var divInt = yahooDivs[yd];
          var paymentDateInt = divInt.paymentDate;
          if (!paymentDateInt) continue;
          var paymentDateStrInt = paymentDateInt.substring(0, 10);
          if (paymentDateStrInt < cutoffStr) { tickerDetailInt.skippedDate++; continue; }

          var rateInt = divInt.rate;
          if (!rateInt || rateInt <= 0) continue;

          var rateBRL = Math.round(rateInt * usdRate * 10000) / 10000;

          // Yahoo nao fornece ex-date — usar posicao atual
          var qtyForDivInt = qtyInt;
          var porCorretoraDivInt = posInt.por_corretora || {};
          var corretoraDivInt = mainCorretoraFrom(porCorretoraDivInt);

          // Dedup (com portfolio_id) — para INT usar LOOSE porque rate BRL varia com cambio
          var dkeyIntL = dedupKeyLoose(tickerInt, paymentDateStrInt, currentPortId);
          if (existingKeysLoose[dkeyIntL] && existingKeysLoose[dkeyIntL] > 0) { tickerDetailInt.skippedDedup++; continue; }
          var dkeyInt = dedupKey(tickerInt, paymentDateStrInt, rateBRL, currentPortId);
          if (existingKeys[dkeyInt]) { tickerDetailInt.skippedDedup++; continue; }

          var proventoInt = {
            ticker: tickerInt,
            tipo: 'dividendo',
            valor_por_cota: rateBRL,
            quantidade: qtyForDivInt,
            data_pagamento: paymentDateStrInt,
            portfolio_id: currentPortId,
            corretora: corretoraDivInt,
            por_corretora: porCorretoraDivInt,
            data_com: paymentDateStrInt,
          };

          var addResultInt = await addProvento(userId, proventoInt);

          if (!addResultInt.error) {
            existingKeys[dkeyInt] = true;
            if (!existingKeysLoose[dkeyIntL]) existingKeysLoose[dkeyIntL] = 0;
            existingKeysLoose[dkeyIntL]++;
            inserted++;
            tickerDetailInt.inserted++;

            // Movimentacao por corretora INT
            var portOpContasInt = portfolioOpContas[currentPortId || '__null__'] !== false;
            if (portOpContasInt && rateBRL * qtyForDivInt > 0 && paymentDateStrInt <= todayStr) {
              var intCorrKeys = Object.keys(porCorretoraDivInt);
              if (intCorrKeys.length === 0) intCorrKeys = [corretoraDivInt || 'Sem corretora'];
              for (var ici = 0; ici < intCorrKeys.length; ici++) {
                var icCorr = intCorrKeys[ici];
                var icQty = porCorretoraDivInt[icCorr] || qtyForDivInt;
                var icValor = rateBRL * icQty;
                if (icValor <= 0) continue;
                var icConta = (saldosByName[icCorr.toUpperCase().trim()] && saldosByName[icCorr.toUpperCase().trim()][0]) ? saldosByName[icCorr.toUpperCase().trim()][0].name : null;
                if (!icConta) continue;
                var icMovKey = icCorr + '|' + tickerInt + '|' + paymentDateStrInt + '|' + (currentPortId || '__null__') + '|dividendo';
                if (existingMovKeys[icMovKey]) continue;
                existingMovKeys[icMovKey] = true;
                if (!saldoAccum[icConta]) saldoAccum[icConta] = 0;
                saldoAccum[icConta] += icValor;
                addMovimentacao(userId, {
                  conta: icConta,
                  tipo: 'entrada',
                  categoria: 'dividendo',
                  valor: icValor,
                  descricao: 'Dividendo ' + tickerInt + ' (US$ ' + rateInt.toFixed(4) + ' x ' + usdRate.toFixed(2) + ')',
                  ticker: tickerInt,
                  referencia_tipo: 'provento',
                  data: paymentDateStrInt,
                  portfolio_id: currentPortId,
                }).catch(function(err) { console.warn('dividendSync INT movimentacao failed:', err); });
              }
            }
          } else {
            tickerDetailInt.insertFailed++;
            tickerDetailInt.lastInsertError = addResultInt.error.message || addResultInt.error.code || JSON.stringify(addResultInt.error);
          }
        }
        details.push(tickerDetailInt);
      }
    }

    // 6. Segundo passo: creditar proventos ja pagos sem movimentacao
    var allProventos = existingProventos;
    if (inserted > 0) {
      var freshProv = await getProventos(userId, {});
      allProventos = freshProv.data || [];
    }

    var movsCreated = 0;
    for (var pp = 0; pp < allProventos.length; pp++) {
      var prov = allProventos[pp];
      var provTicker = (prov.ticker || '').toUpperCase().trim();
      var provDate = (prov.data_pagamento || '').substring(0, 10);
      if (!provDate || !provTicker) continue;
      if (provDate > todayStr) continue;
      var provPortId = prov.portfolio_id || null;
      // Respeitar operacoes_contas do portfolio
      if (portfolioOpContas[provPortId || '__null__'] === false) continue;
      var provPortKey = provPortId || '__null__';
      var provPos = positionCache[provPortKey + '|' + provTicker];
      if (!provPos) provPos = positionCache['__null__|' + provTicker];
      if (!provPos) continue;
      var provValorCota = prov.valor_por_cota || 0;
      if (provValorCota <= 0) continue;
      var provTipo = prov.tipo || 'dividendo';
      var provCat = provTipo === 'jcp' ? 'jcp' : provTipo === 'rendimento' ? 'rendimento_fii' : 'dividendo';
      var provDesc = (provCat === 'jcp' ? 'JCP' : provCat === 'rendimento_fii' ? 'Rendimento' : 'Dividendo') + ' ' + provTicker;
      // Creditar por corretora proporcionalmente
      var provPorCorr = prov.por_corretora || (provPos && provPos.por_corretora) || {};
      var provCorrKeys = Object.keys(provPorCorr);
      if (provCorrKeys.length === 0) {
        var provMainCorr = prov.corretora || mainCorretoraFrom(provPos.por_corretora);
        if (provMainCorr) provCorrKeys = [provMainCorr];
      }
      for (var rci = 0; rci < provCorrKeys.length; rci++) {
        var rcCorr = provCorrKeys[rci];
        var rcQty = provPorCorr[rcCorr] || (prov.quantidade || 0);
        var rcValor = provValorCota * rcQty;
        if (rcValor <= 0) continue;
        var rcConta = (saldosByName[rcCorr.toUpperCase().trim()] && saldosByName[rcCorr.toUpperCase().trim()][0]) ? saldosByName[rcCorr.toUpperCase().trim()][0].name : null;
        if (!rcConta) continue;
        var rcMovKey = rcCorr + '|' + provTicker + '|' + provDate + '|' + (provPortId || '__null__') + '|' + provCat;
        if (existingMovKeys[rcMovKey]) continue;
        existingMovKeys[rcMovKey] = true;
        movsCreated++;
        if (!saldoAccum[rcConta]) saldoAccum[rcConta] = 0;
        saldoAccum[rcConta] += rcValor;
        addMovimentacao(userId, {
          conta: rcConta,
          tipo: 'entrada',
          categoria: provCat,
          valor: rcValor,
          descricao: provDesc,
          ticker: provTicker,
          referencia_tipo: 'provento',
          data: provDate,
          portfolio_id: provPortId,
        }).catch(function(err) { console.warn('dividendSync retroactive mov failed:', err); });
      }
    }
    if (movsCreated > 0) {
      console.log('dividendSync: ' + movsCreated + ' movimentações retroativas criadas');
    }

    // 7. Atualizar saldos acumulados (batch, sem race condition)
    var accumKeys = Object.keys(saldoAccum);
    var missingContas = [];
    for (var ai = 0; ai < accumKeys.length; ai++) {
      var accumConta = accumKeys[ai];
      var accumValor = saldoAccum[accumConta];
      if (accumValor <= 0) continue;
      // Buscar saldo atual — so atualiza se conta ja existe (nao criar contas novas)
      var accumContaNorm = accumConta.toUpperCase().trim();
      var foundSaldo = null;
      for (var asi = 0; asi < saldosData.length; asi++) {
        var asName = (saldosData[asi].corretora || saldosData[asi].name || '').toUpperCase().trim();
        if (asName === accumContaNorm) {
          foundSaldo = saldosData[asi];
          break;
        }
      }
      if (!foundSaldo) {
        missingContas.push({ name: accumConta, valor: accumValor });
        continue;
      }
      var currentSaldo = foundSaldo.saldo || 0;
      await upsertSaldo(userId, { name: accumConta, saldo: currentSaldo + accumValor });
    }
    if (accumKeys.length > 0) {
      console.log('dividendSync: saldos atualizados para ' + accumKeys.length + ' contas');
    }

    // 8. Atualizar data do ultimo sync
    await updateProfile(userId, { last_dividend_sync: todayStr });

    // Montar mensagem detalhada
    var msg = inserted + ' proventos importados de ' + details.length + ' tickers';
    if (inserted === 0 && details.length > 0) {
      var apiErrors = [];
      var noData = [];
      var allDedup = [];
      var buyDateSkip = [];
      var insertErrors = [];
      for (var dti = 0; dti < details.length; dti++) {
        var det = details[dti];
        if (det.brapiError || det.siError) {
          var errParts = det.ticker + ':';
          if (det.brapiError) errParts += ' brapi=' + det.brapiError;
          if (det.siError) errParts += ' SI=' + det.siError;
          apiErrors.push(errParts);
        }
        if (det.merged === 0 && !det.brapiError && !det.siError) {
          noData.push(det.ticker);
        }
        if (det.skippedDedup > 0 && det.inserted === 0 && det.merged > 0) {
          allDedup.push(det.ticker);
        }
        if (det.insertFailed > 0) {
          insertErrors.push(det.ticker + ' (' + det.insertFailed + 'x): ' + (det.lastInsertError || '?'));
        }
        if (det.skippedBuyDate > 0) {
          var exMsg = det.ticker + ' compra=' + (det.firstBuy || '?') + ' [si=' + det.siCount + ']';
          if (det.buyDateExamples.length > 0) {
            exMsg += ' (' + det.buyDateExamples.join(', ') + ')';
          }
          buyDateSkip.push(exMsg);
        }
      }
      var parts = [];
      if (insertErrors.length > 0) parts.push('ERRO INSERT:\n' + insertErrors.join('\n'));
      if (apiErrors.length > 0) parts.push('API falhou: ' + apiErrors.join(', '));
      if (noData.length > 0) parts.push('Sem dividendos nas APIs: ' + noData.join(', '));
      if (allDedup.length > 0) parts.push('Ja importados: ' + allDedup.join(', '));
      if (buyDateSkip.length > 0) parts.push('Compra apos data-ex:\n' + buyDateSkip.join('\n'));
      if (parts.length > 0) msg = parts.join('\n\n');
    }

    return { inserted: inserted, checked: details.length, details: details, message: msg, missingContas: missingContas };
  } catch (err) {
    console.error('runDividendSync error:', err);
    return { inserted: 0, checked: 0, details: [], error: err.message || 'Erro no sync' };
  } finally {
    _syncRunning = false;
  }
}
