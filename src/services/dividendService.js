/**
 * dividendService.js
 * Auto-sync de dividendos via brapi.dev
 * Detecta novos dividendos para tickers na carteira e insere como proventos
 */

import { getPositions, getProventos, addProvento, getOperacoes, updateProfile } from './database';

var BRAPI_URL = 'https://brapi.dev/api/quote/';
var BRAPI_TOKEN = 'tEU8wyBixv8hCi7J3NCjsi';

// ══════════ FETCH DIVIDENDS ══════════

export async function fetchDividends(ticker) {
  try {
    var url = BRAPI_URL + ticker + '?dividends=true&token=' + BRAPI_TOKEN;
    var response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) return [];

    var json = await response.json();
    var results = json.results || [];

    if (results.length === 0) return [];

    var dividendsData = results[0].dividendsData || {};
    var cashDividends = dividendsData.cashDividends || [];
    return cashDividends;
  } catch (err) {
    console.warn('fetchDividends error for ' + ticker + ':', err.message);
    return [];
  }
}

// ══════════ MAP LABEL TO TIPO ══════════

export function mapLabelToTipo(label) {
  if (!label) return 'dividendo';
  var upper = label.toUpperCase().trim();
  if (upper === 'JCP' || upper.indexOf('JCP') !== -1 || upper.indexOf('JUROS SOBRE CAPITAL') !== -1) {
    return 'jcp';
  }
  return 'dividendo';
}

// ══════════ SHOULD SYNC DIVIDENDS ══════════

export function shouldSyncDividends(lastSyncDate) {
  var now = new Date();

  // Verificar se e dia util (seg-sex)
  var dayOfWeek = now.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;

  // Verificar se hora >= 18 BRT (UTC-3 = 21 UTC)
  var utcHour = now.getUTCHours();
  var brtHour = utcHour - 3;
  if (brtHour < 0) brtHour += 24;
  if (brtHour < 18) return false;

  // Verificar se ja sincronizou hoje
  if (lastSyncDate) {
    var todayStr = now.toISOString().substring(0, 10);
    var lastStr = typeof lastSyncDate === 'string'
      ? lastSyncDate.substring(0, 10)
      : new Date(lastSyncDate).toISOString().substring(0, 10);
    if (lastStr === todayStr) return false;
  }

  return true;
}

// ══════════ DEDUP KEY ══════════

function dedupKey(ticker, dataPagamento, valorPorCota) {
  var t = (ticker || '').toUpperCase().trim();
  var d = (dataPagamento || '').substring(0, 10);
  var v = Math.round((valorPorCota || 0) * 10000);
  return t + '|' + d + '|' + v;
}

// ══════════ RUN DIVIDEND SYNC ══════════

export async function runDividendSync(userId) {
  try {
    // 1. Buscar posicoes com qty > 0
    var posResult = await getPositions(userId);
    var positions = posResult.data || [];

    if (positions.length === 0) {
      return { inserted: 0, message: 'Nenhuma posicao encontrada' };
    }

    // 2. Buscar proventos existentes para dedup
    var provResult = await getProventos(userId, { limit: 1000 });
    var existingProventos = provResult.data || [];

    // Construir set de chaves existentes
    var existingKeys = {};
    for (var e = 0; e < existingProventos.length; e++) {
      var ep = existingProventos[e];
      var key = dedupKey(ep.ticker, ep.data_pagamento, ep.valor_por_cota);
      existingKeys[key] = true;
    }

    // 3. Buscar operacoes para determinar primeira compra por ticker
    var opsResult = await getOperacoes(userId, { tipo: 'compra' });
    var allOps = opsResult.data || [];
    var firstBuyDate = {};
    for (var o = 0; o < allOps.length; o++) {
      var op = allOps[o];
      var opTicker = (op.ticker || '').toUpperCase().trim();
      var opDate = (op.data || '').substring(0, 10);
      if (!opDate) continue;
      if (!firstBuyDate[opTicker] || opDate < firstBuyDate[opTicker]) {
        firstBuyDate[opTicker] = opDate;
      }
    }

    // 4. Filtro de data: ultimos 12 meses
    var now = new Date();
    var cutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    var cutoffStr = cutoff.toISOString().substring(0, 10);

    var inserted = 0;

    // 5. Para cada ticker, buscar dividendos e inserir novos
    for (var p = 0; p < positions.length; p++) {
      var pos = positions[p];
      var ticker = pos.ticker;
      var qty = pos.quantidade || 0;

      if (qty <= 0) continue;

      var dividends = await fetchDividends(ticker);

      for (var d = 0; d < dividends.length; d++) {
        var div = dividends[d];

        // Validar paymentDate
        var paymentDate = div.paymentDate;
        if (!paymentDate) continue;

        var paymentDateStr = paymentDate.substring(0, 10);
        if (paymentDateStr < cutoffStr) continue;

        var rate = div.rate;
        if (!rate || rate <= 0) continue;

        // Checar data-com: usuario precisa ter comprado ANTES da data-ex
        var dataCom = div.lastDatePrior ? div.lastDatePrior.substring(0, 10) : null;
        if (dataCom && firstBuyDate[ticker]) {
          if (firstBuyDate[ticker] > dataCom) continue;
        }

        // Dedup check
        var dkey = dedupKey(ticker, paymentDateStr, rate);
        if (existingKeys[dkey]) continue;

        // Mapear tipo
        var tipoProv = mapLabelToTipo(div.label);

        // Inserir provento
        var provento = {
          ticker: ticker,
          tipo_provento: tipoProv,
          valor_por_cota: rate,
          quantidade: qty,
          valor_total: Math.round(rate * qty * 100) / 100,
          data_pagamento: paymentDateStr,
        };
        if (dataCom) {
          provento.data_com = dataCom;
        }

        var addResult = await addProvento(userId, provento);

        if (!addResult.error) {
          existingKeys[dkey] = true;
          inserted++;
        } else {
          console.warn('dividendSync: falha ao inserir provento ' + ticker + ' ' + paymentDateStr + ':', addResult.error);
        }
      }
    }

    // 5. Atualizar data do ultimo sync
    var todayStr = now.toISOString().substring(0, 10);
    await updateProfile(userId, { last_dividend_sync: todayStr });

    return { inserted: inserted, message: 'Sincronizados ' + inserted + ' proventos' };
  } catch (err) {
    console.error('runDividendSync error:', err);
    return { inserted: 0, error: err.message || 'Erro no sync' };
  }
}
