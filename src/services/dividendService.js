/**
 * dividendService.js
 * Auto-sync de dividendos via brapi.dev + StatusInvest (cross-check)
 * Detecta novos dividendos para tickers na carteira e insere como proventos
 */

import { getPositions, getProventos, addProvento, getOperacoes, updateProfile, getSaldos, addMovimentacao, getMovimentacoes } from './database';
import { fetchYahooDividends } from './yahooService';
import { fetchExchangeRates } from './currencyService';

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

// Helper interno: busca StatusInvest em um tipo especifico (fii ou acao)
async function fetchStatusInvestByType(ticker, tipo) {
  var siHeaders = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };

  var result = [];
  var resultKeys = {};
  var hadAnyResponse = false;

  // Endpoint 1: companytickerprovents (chart — dados historicos)
  try {
    var url1 = SI_BASE_URL + tipo + '/companytickerprovents?ticker=' + ticker + '&chartProvType=2';
    var resp1 = await fetch(url1, { method: 'GET', headers: siHeaders });
    if (resp1.ok) {
      hadAnyResponse = true;
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
      } catch (e) { console.warn('StatusInvest endpoint1 JSON parse for ' + ticker + ' (' + tipo + '):', e.message); }
    }
  } catch (e) { console.warn('StatusInvest endpoint1 fetch for ' + ticker + ' (' + tipo + '):', e.message); }

  // Endpoint 2: companytickerproventsresult (tabela — inclui proventos recentes/futuros)
  try {
    var url2 = SI_BASE_URL + tipo + '/companytickerproventsresult?ticker=' + ticker + '&start=0&length=50';
    var resp2 = await fetch(url2, { method: 'GET', headers: siHeaders });
    if (resp2.ok) {
      hadAnyResponse = true;
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
      } catch (e) { console.warn('StatusInvest endpoint2 JSON parse for ' + ticker + ' (' + tipo + '):', e.message); }
    }
  } catch (e) { console.warn('StatusInvest endpoint2 fetch for ' + ticker + ' (' + tipo + '):', e.message); }

  return { data: result, hadResponse: hadAnyResponse };
}

export async function fetchDividendsStatusInvest(ticker, categoria) {
  try {
    // StatusInvest nao suporta ETFs — endpoints sao apenas /acao/ e /fii/
    if (categoria === 'etf') {
      return { data: [], error: null };
    }

    // Tentativa primaria: endpoint baseado na categoria cadastrada
    var primaryType = (categoria === 'fii') ? 'fii' : 'acao';
    var primary = await fetchStatusInvestByType(ticker, primaryType);

    // Fallback: se vier vazio (sem resposta util), tentar o outro endpoint.
    // Protege contra cadastro errado (FII marcado como acao, units, etc.)
    if (primary.data.length === 0) {
      var fallbackType = primaryType === 'fii' ? 'acao' : 'fii';
      var fallback = await fetchStatusInvestByType(ticker, fallbackType);
      if (fallback.data.length > 0) {
        console.log('dividendSync: ' + ticker + ' encontrado em /' + fallbackType + '/ (categoria cadastrada: ' + (categoria || 'none') + ')');
        return { data: fallback.data, error: null };
      }
    }

    return { data: primary.data, error: null };
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
  if (upper === 'RENDIMENTO' || upper.indexOf('RENDIMENTO') !== -1) {
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

function dedupKey(ticker, dataPagamento, valorPorCota) {
  var t = (ticker || '').toUpperCase().trim();
  var d = (dataPagamento || '').substring(0, 10);
  var v = Math.round((valorPorCota || 0) * 10000);
  return t + '|' + d + '|' + v;
}

// Chave loose (ticker+date only) para catch duplicados com rate diferente
// (ex: INT com câmbio diferente, BR com arredondamento diferente entre fontes)
function dedupKeyLoose(ticker, dataPagamento) {
  var t = (ticker || '').toUpperCase().trim();
  var d = (dataPagamento || '').substring(0, 10);
  return t + '|' + d;
}

// ══════════ RUN DIVIDEND SYNC ══════════

export async function runDividendSync(userId) {
  // Guard contra sync concorrente
  if (_syncRunning) {
    return { inserted: 0, checked: 0, details: [], message: 'Sync já em andamento' };
  }
  _syncRunning = true;
  try {
    // 1. Buscar posicoes com qty > 0
    var posResult = await getPositions(userId);
    var positions = posResult.data || [];

    if (positions.length === 0) {
      return { inserted: 0, checked: 0, details: [], message: 'Nenhuma posicao encontrada' };
    }

    // Separar posicoes BR e INT
    var brPositions = [];
    var intPositions = [];
    for (var fi = 0; fi < positions.length; fi++) {
      if (positions[fi].mercado === 'INT') {
        intPositions.push(positions[fi]);
      } else {
        brPositions.push(positions[fi]);
      }
    }

    if (brPositions.length === 0 && intPositions.length === 0) {
      return { inserted: 0, checked: 0, details: [], message: 'Nenhuma posição encontrada' };
    }

    // Buscar cambio USD→BRL se houver posicoes INT
    var usdRate = 1;
    if (intPositions.length > 0) {
      try {
        var ratesResult = await fetchExchangeRates(['USD']);
        if (ratesResult && ratesResult['USD']) usdRate = ratesResult['USD'];
      } catch (e) { console.warn('dividendSync USD rate error:', e.message); }
    }

    // 1b. Buscar saldos para saber conta destino das movimentacoes
    var saldosResult = await getSaldos(userId);
    var saldosData = saldosResult.data || [];

    // Build lookup: nome da conta (UPPERCASE) → { name, moeda }
    // Uppercase para match com por_corretora (que tambem é uppercase)
    var saldosByName = {};
    for (var si = 0; si < saldosData.length; si++) {
      var sn = (saldosData[si].corretora || saldosData[si].name || '').trim().toUpperCase();
      var snOriginal = (saldosData[si].corretora || saldosData[si].name || '').trim();
      var sm = (saldosData[si].moeda || 'BRL').toUpperCase();
      if (sn) {
        if (!saldosByName[sn]) saldosByName[sn] = [];
        saldosByName[sn].push({ name: snOriginal, moeda: sm });
      }
    }

    // Helper: encontrar conta certa para creditar dividendo
    // Prioridade: corretora da posicao (por_corretora) que EXISTE em saldos, senao null
    // NUNCA retorna conta que nao existe — previne criacao de movimentacao orfã
    function findContaForPosition(pos, preferMoeda) {
      if (!preferMoeda) preferMoeda = 'BRL';
      if (saldosData.length === 0) return null;

      // 1. Tentar corretora da posicao (por_corretora) — match com conta existente (uppercase)
      var porCorretora = pos && pos.por_corretora;
      if (porCorretora) {
        var corKeys = Object.keys(porCorretora);
        for (var ck = 0; ck < corKeys.length; ck++) {
          var corName = corKeys[ck].toUpperCase().trim();
          var matches = saldosByName[corName];
          if (matches) {
            // Preferir conta na moeda certa
            for (var cm = 0; cm < matches.length; cm++) {
              if (matches[cm].moeda === preferMoeda) return matches[cm].name;
            }
            // Aceitar conta em outra moeda dessa corretora
            return matches[0].name;
          }
        }
      }

      // 2. SEM FALLBACK para conta aleatoria
      // Se nao achou conta da corretora da posicao, retorna null
      // Movimentacao nao sera criada — melhor nao creditar do que creditar errado
      return null;
    }

    // 2. Buscar proventos existentes para dedup (sem limit para não perder antigos)
    var provResult = await getProventos(userId, {});
    var existingProventos = provResult.data || [];

    // Construir set de chaves existentes (exata + loose)
    var existingKeys = {};
    var existingKeysLoose = {};
    for (var e = 0; e < existingProventos.length; e++) {
      var ep = existingProventos[e];
      var key = dedupKey(ep.ticker, ep.data_pagamento, ep.valor_por_cota);
      existingKeys[key] = true;
      var keyL = dedupKeyLoose(ep.ticker, ep.data_pagamento);
      if (!existingKeysLoose[keyL]) existingKeysLoose[keyL] = 0;
      existingKeysLoose[keyL]++;
    }

    // 2b. Buscar movimentacoes de dividendos existentes para dedup de movimentacoes
    var movDivResult = await getMovimentacoes(userId, { limit: 5000 });
    var existingMovs = movDivResult.data || [];
    var existingMovKeys = {};
    for (var em = 0; em < existingMovs.length; em++) {
      var emv = existingMovs[em];
      if (emv.categoria === 'dividendo' || emv.categoria === 'jcp' || emv.categoria === 'rendimento_fii') {
        var movKey = dedupKeyLoose(emv.ticker, emv.data);
        existingMovKeys[movKey] = true;
      }
    }

    // 3. Buscar TODAS operacoes para calcular posicao historica na data-com
    var opsResult = await getOperacoes(userId);
    var allOps = opsResult.data || [];
    var firstBuyDate = {};
    var opsByTicker = {};
    for (var o = 0; o < allOps.length; o++) {
      var op = allOps[o];
      var opTicker = (op.ticker || '').toUpperCase().trim();
      var opDate = (op.data || '').substring(0, 10);
      if (!opDate) continue;
      // primeira compra
      if (op.tipo === 'compra') {
        if (!firstBuyDate[opTicker] || opDate < firstBuyDate[opTicker]) {
          firstBuyDate[opTicker] = opDate;
        }
      }
      // agrupar por ticker para calculo historico
      if (!opsByTicker[opTicker]) opsByTicker[opTicker] = [];
      opsByTicker[opTicker].push(op);
    }

    // Helper: calcular posicao historica na data-com
    function positionAtDate(tkr, dateStr) {
      var ops = opsByTicker[tkr] || [];
      var qtyAt = 0;
      for (var i = 0; i < ops.length; i++) {
        var od = (ops[i].data || '').substring(0, 10);
        if (od <= dateStr) {
          if (ops[i].tipo === 'compra') {
            qtyAt += (ops[i].quantidade || 0);
          } else if (ops[i].tipo === 'venda') {
            qtyAt -= (ops[i].quantidade || 0);
          }
        }
      }
      return Math.max(0, qtyAt);
    }

    // 4. Filtro de data: ultimos 12 meses + hoje
    var now = new Date();
    var todayStr = now.toISOString().substring(0, 10);
    var cutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    var cutoffStr = cutoff.toISOString().substring(0, 10);

    var inserted = 0;
    var details = [];

    // 5. Para cada ticker BR, buscar dividendos de AMBAS as fontes e inserir novos
    for (var p = 0; p < brPositions.length; p++) {
      var pos = brPositions[p];
      var ticker = pos.ticker;
      var qty = pos.quantidade || 0;

      if (qty <= 0) continue;

      var tickerDetail = {
        ticker: ticker,
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
        firstBuy: firstBuyDate[ticker] || null,
        buyDateExamples: [],
      };

      // Buscar de ambas as fontes (independente, cada uma com try/catch proprio)
      var brapiResult = await fetchDividendsBrapi(ticker);
      var siResult = await fetchDividendsStatusInvest(ticker, pos.categoria);

      var brapiDivs = brapiResult.data;
      var siDivs = siResult.data;
      tickerDetail.brapiCount = brapiDivs.length;
      tickerDetail.brapiError = brapiResult.error;
      tickerDetail.siCount = siDivs.length;
      tickerDetail.siError = siResult.error;

      var dividends = mergeDividends(brapiDivs, siDivs);
      tickerDetail.merged = dividends.length;

      for (var d = 0; d < dividends.length; d++) {
        var div = dividends[d];

        // Validar paymentDate
        var paymentDate = div.paymentDate;
        if (!paymentDate) continue;

        var paymentDateStr = paymentDate.substring(0, 10);
        if (paymentDateStr < cutoffStr) {
          tickerDetail.skippedDate++;
          continue;
        }

        var rate = div.rate;
        if (!rate || rate <= 0) continue;

        // Data-com: se ja passou, usar posicao historica; se futura, usar posicao atual
        var dataCom = div.lastDatePrior ? div.lastDatePrior.substring(0, 10) : null;
        var qtyForDiv = qty; // fallback: posicao atual se nao tem data-com
        if (dataCom) {
          if (dataCom <= todayStr) {
            // Data-com ja passou — usar posicao historica na data-com
            qtyForDiv = positionAtDate(ticker, dataCom);
            if (qtyForDiv <= 0) {
              tickerDetail.skippedBuyDate++;
              if (tickerDetail.buyDateExamples.length < 2) {
                tickerDetail.buyDateExamples.push('pag ' + paymentDateStr + ' ex ' + dataCom + ' qty=0');
              }
              continue;
            }
          }
          // Data-com futura: usa qty atual (posicao pode mudar, mas importa como "a receber")
        }

        // Dedup check: exata (ticker+date+rate)
        var dkey = dedupKey(ticker, paymentDateStr, rate);
        if (existingKeys[dkey]) {
          tickerDetail.skippedDedup++;
          continue;
        }
        // Dedup check: loose (ticker+date) — previne duplicados com rate ligeiramente diferente
        var dkeyL = dedupKeyLoose(ticker, paymentDateStr);
        if (existingKeysLoose[dkeyL] && existingKeysLoose[dkeyL] > 0) {
          tickerDetail.skippedDedup++;
          continue;
        }

        // Mapear tipo
        var tipoProv = mapLabelToTipo(div.label);

        // Inserir provento com quantidade historica na data-com
        var provento = {
          ticker: ticker,
          tipo: tipoProv,
          valor_por_cota: rate,
          quantidade: qtyForDiv,
          data_pagamento: paymentDateStr,
        };

        var addResult = await addProvento(userId, provento);

        if (!addResult.error) {
          existingKeys[dkey] = true;
          if (!existingKeysLoose[dkeyL]) existingKeysLoose[dkeyL] = 0;
          existingKeysLoose[dkeyL]++;
          inserted++;
          tickerDetail.inserted++;
          // Log movimentacao (fire-and-forget) — creditar na conta da corretora da posicao
          // Só creditar se data de pagamento já passou (dinheiro efetivamente recebido)
          // Dedup: verificar se movimentacao ja existe para mesmo ticker+data
          var movKeyBR = dedupKeyLoose(ticker, paymentDateStr);
          var contaBR = findContaForPosition(pos, 'BRL');
          if (contaBR && rate * qtyForDiv > 0 && !existingMovKeys[movKeyBR] && paymentDateStr <= todayStr) {
            existingMovKeys[movKeyBR] = true;
            addMovimentacao(userId, {
              conta: contaBR,
              tipo: 'entrada',
              categoria: tipoProv === 'jcp' ? 'jcp' : tipoProv === 'rendimento' ? 'rendimento_fii' : 'dividendo',
              valor: rate * qtyForDiv,
              descricao: (tipoProv === 'jcp' ? 'JCP' : tipoProv === 'rendimento' ? 'Rendimento' : 'Dividendo') + ' ' + ticker,
              ticker: ticker,
              referencia_tipo: 'provento',
              data: paymentDateStr,
            }).catch(function(e) { console.warn('dividendSync movimentacao failed:', e); });
          }
        } else {
          tickerDetail.insertFailed++;
          tickerDetail.lastInsertError = addResult.error.message || addResult.error.code || JSON.stringify(addResult.error);
          console.warn('dividendSync: falha ao inserir provento ' + ticker + ' ' + paymentDateStr + ':', addResult.error);
        }
      }

      details.push(tickerDetail);
    }

    // 5b. Para cada ticker INT, buscar dividendos via Yahoo Finance
    for (var ip = 0; ip < intPositions.length; ip++) {
      var posInt = intPositions[ip];
      var tickerInt = posInt.ticker;
      var qtyInt = posInt.quantidade || 0;
      if (qtyInt <= 0) continue;

      var tickerDetailInt = {
        ticker: tickerInt,
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
        firstBuy: firstBuyDate[tickerInt] || null,
        buyDateExamples: [],
      };

      var yahooResult = await fetchYahooDividends(tickerInt);
      var yahooDivs = yahooResult.data;
      tickerDetailInt.siCount = yahooDivs.length;
      tickerDetailInt.siError = yahooResult.error;
      tickerDetailInt.merged = yahooDivs.length;

      for (var di = 0; di < yahooDivs.length; di++) {
        var divInt = yahooDivs[di];
        var paymentDateInt = divInt.paymentDate;
        if (!paymentDateInt) continue;
        var paymentDateStrInt = paymentDateInt.substring(0, 10);
        if (paymentDateStrInt < cutoffStr) { tickerDetailInt.skippedDate++; continue; }

        var rateInt = divInt.rate;
        if (!rateInt || rateInt <= 0) continue;

        // Yahoo nao fornece ex-date, usar posicao atual
        var qtyForDivInt = qtyInt;

        // Converter USD→BRL
        var rateBRL = Math.round(rateInt * usdRate * 10000) / 10000;

        // Dedup check: para INT, usar LOOSE (ticker+date) porque rate BRL varia com câmbio
        var dkeyIntL = dedupKeyLoose(tickerInt, paymentDateStrInt);
        if (existingKeysLoose[dkeyIntL] && existingKeysLoose[dkeyIntL] > 0) {
          tickerDetailInt.skippedDedup++;
          continue;
        }
        // Também verificar chave exata (caso já inserido neste mesmo sync)
        var dkeyInt = dedupKey(tickerInt, paymentDateStrInt, rateBRL);
        if (existingKeys[dkeyInt]) { tickerDetailInt.skippedDedup++; continue; }

        var proventoInt = {
          ticker: tickerInt,
          tipo: 'dividendo',
          valor_por_cota: rateBRL,
          quantidade: qtyForDivInt,
          data_pagamento: paymentDateStrInt,
        };

        var addResultInt = await addProvento(userId, proventoInt);

        if (!addResultInt.error) {
          existingKeys[dkeyInt] = true;
          if (!existingKeysLoose[dkeyIntL]) existingKeysLoose[dkeyIntL] = 0;
          existingKeysLoose[dkeyIntL]++;
          inserted++;
          tickerDetailInt.inserted++;
          // Creditar na conta da corretora da posicao INT (preferir conta BRL pois valor ja convertido)
          // Só creditar se data de pagamento já passou (dinheiro efetivamente recebido)
          // Dedup: verificar se movimentacao ja existe para mesmo ticker+data
          var movKeyINT = dedupKeyLoose(tickerInt, paymentDateStrInt);
          var contaINT = findContaForPosition(posInt, 'BRL');
          if (contaINT && rateBRL * qtyForDivInt > 0 && !existingMovKeys[movKeyINT] && paymentDateStrInt <= todayStr) {
            existingMovKeys[movKeyINT] = true;
            addMovimentacao(userId, {
              conta: contaINT,
              tipo: 'entrada',
              categoria: 'dividendo',
              valor: rateBRL * qtyForDivInt,
              descricao: 'Dividendo ' + tickerInt + ' (US$ ' + rateInt.toFixed(4) + ' x ' + usdRate.toFixed(2) + ')',
              ticker: tickerInt,
              referencia_tipo: 'provento',
              data: paymentDateStrInt,
            }).catch(function(e) { console.warn('dividendSync INT movimentacao failed:', e); });
          }
        } else {
          tickerDetailInt.insertFailed++;
          tickerDetailInt.lastInsertError = addResultInt.error.message || addResultInt.error.code || JSON.stringify(addResultInt.error);
        }
      }
      details.push(tickerDetailInt);
    }

    // 5c. Segundo passo: creditar proventos já pagos que não têm movimentação
    // (proventos inseridos quando paymentDate era futuro, agora já passou)
    var allProventos = existingProventos;
    // Incluir proventos recém-inseridos neste sync (re-buscar para ter IDs corretos)
    if (inserted > 0) {
      var freshProv = await getProventos(userId, {});
      allProventos = freshProv.data || [];
    }

    // Build posição lookup por ticker para findContaForPosition
    var positionsByTicker = {};
    for (var pt = 0; pt < positions.length; pt++) {
      positionsByTicker[positions[pt].ticker.toUpperCase().trim()] = positions[pt];
    }

    var movsCreated = 0;
    for (var pp = 0; pp < allProventos.length; pp++) {
      var prov = allProventos[pp];
      var provTicker = (prov.ticker || '').toUpperCase().trim();
      var provDate = (prov.data_pagamento || '').substring(0, 10);
      if (!provDate || !provTicker) continue;
      // Só proventos com data de pagamento já passada
      if (provDate > todayStr) continue;
      // Verificar se já tem movimentação para este ticker+data
      var provMovKey = dedupKeyLoose(provTicker, provDate);
      if (existingMovKeys[provMovKey]) continue;
      // Encontrar posição e conta
      var provPos = positionsByTicker[provTicker];
      if (!provPos) continue;
      var provMoeda = (provPos.mercado === 'INT') ? 'BRL' : 'BRL';
      var provConta = findContaForPosition(provPos, provMoeda);
      if (!provConta) continue;
      var provValor = (prov.valor_por_cota || 0) * (prov.quantidade || 0);
      if (provValor <= 0) continue;
      // Mapear categoria
      var provTipo = prov.tipo || 'dividendo';
      var provCat = provTipo === 'jcp' ? 'jcp' : provTipo === 'rendimento' ? 'rendimento_fii' : 'dividendo';
      existingMovKeys[provMovKey] = true;
      movsCreated++;
      addMovimentacao(userId, {
        conta: provConta,
        tipo: 'entrada',
        categoria: provCat,
        valor: provValor,
        descricao: (provCat === 'jcp' ? 'JCP' : provCat === 'rendimento_fii' ? 'Rendimento' : 'Dividendo') + ' ' + provTicker,
        ticker: provTicker,
        referencia_tipo: 'provento',
        data: provDate,
      }).catch(function(e) { console.warn('dividendSync retroactive mov failed:', e); });
    }
    if (movsCreated > 0) {
      console.log('dividendSync: ' + movsCreated + ' movimentações retroativas criadas');
    }

    // 6. Atualizar data do ultimo sync
    await updateProfile(userId, { last_dividend_sync: todayStr });

    // Montar mensagem detalhada
    var msg = inserted + ' proventos importados de ' + details.length + ' tickers';
    if (inserted === 0 && details.length > 0) {
      var apiErrors = [];
      var noData = [];
      var allDedup = [];
      var buyDateSkip = [];
      var insertErrors = [];
      for (var di = 0; di < details.length; di++) {
        var det = details[di];
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
          var exMsg = det.ticker + ' compra=' + (det.firstBuy || '?') + ' [brapi=' + det.brapiCount + ' si=' + det.siCount + ']';
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

    return { inserted: inserted, checked: details.length, details: details, message: msg };
  } catch (err) {
    console.error('runDividendSync error:', err);
    return { inserted: 0, checked: 0, details: [], error: err.message || 'Erro no sync' };
  } finally {
    _syncRunning = false;
  }
}
