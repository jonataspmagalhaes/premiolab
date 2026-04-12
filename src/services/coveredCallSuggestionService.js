/**
 * coveredCallSuggestionService.js
 * Sugere vendas cobertas (covered calls) para acoes em carteira sem opcoes ativas.
 *
 * Regras:
 *  - Considera apenas acoes BR com qty >= 100 (lote minimo)
 *  - Exclui qty ja coberta por opcoes ativas existentes
 *  - Para cada acao elegivel, busca chain de opcoes e seleciona calls OTM
 *    com vencimento proximo (30-60 dias preferencial) e bom premio mensal
 *  - Ordena por yield_mensal desc
 *
 * Exports:
 *  - suggestCoveredCalls(userId, opts) → [
 *      {
 *        ticker, qty_disponivel, preco_atual,
 *        sugestao: { symbol, strike, vencimento, dias, premio, premio_total, yield_mensal, delta, oom_pct },
 *        comparativo: { renda_sem, renda_com, aumento_pct }
 *      }
 *    ]
 */

import { getPositions, getOpcoes, getProfile } from './database';
import { fetchOptionsChain } from './oplabService';
import { fetchPrices } from './priceService';

var MIN_QTY = 100;
var MIN_DAYS = 14;
var MAX_DAYS = 75;
var PREFERRED_MIN_DAYS = 25;
var PREFERRED_MAX_DAYS = 55;
var MIN_PREMIO = 0.02; // R$ 0,02 minimo pra descartar calls mortas
var MIN_YIELD_MENSAL = 0.5; // 0.5% a.m. minimo

function parseDateSafe(s) {
  if (!s) return null;
  var d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d;
}

function daysUntil(dateStr) {
  var d = parseDateSafe(dateStr);
  if (!d) return null;
  var now = new Date();
  return Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function calcCoveredQty(opcoesAtivas, ticker) {
  var tk = (ticker || '').toUpperCase();
  var total = 0;
  for (var i = 0; i < opcoesAtivas.length; i++) {
    var o = opcoesAtivas[i];
    if (o.status !== 'ativa') continue;
    if ((o.tipo || '').toLowerCase() !== 'call') continue;
    if ((o.direcao || 'venda') === 'compra') continue;
    if ((o.ativo_base || '').toUpperCase() !== tk) continue;
    total += (o.qty || 0);
  }
  return total;
}

// Seleciona a melhor call OTM de uma chain para uma acao
function pickBestCall(chain, precoAtual) {
  if (!chain || !chain.length) return null;
  var candidates = [];

  for (var s = 0; s < chain.length; s++) {
    var serie = chain[s];
    var dias = serie.days_to_maturity || daysUntil(serie.due_date);
    if (dias == null || dias < MIN_DAYS || dias > MAX_DAYS) continue;

    for (var k = 0; k < serie.strikes.length; k++) {
      var st = serie.strikes[k];
      var call = st.call;
      if (!call || !call.symbol) continue;
      // OTM: strike > preco atual
      if (st.strike <= precoAtual) continue;
      var premio = call.bid || call.last || 0;
      if (premio < MIN_PREMIO) continue;
      var oomPct = ((st.strike - precoAtual) / precoAtual) * 100;
      // Preferir OTM entre 2% e 10%
      if (oomPct < 1 || oomPct > 15) continue;

      var premioTotal = premio * 100; // lote 100
      var yieldMensal = (premio / precoAtual) * 100 * (30 / dias);
      if (yieldMensal < MIN_YIELD_MENSAL) continue;

      // Score: premia janela preferida de dias e yield
      var diasPenalty = 1;
      if (dias < PREFERRED_MIN_DAYS || dias > PREFERRED_MAX_DAYS) diasPenalty = 0.85;
      var oomScore = 1 - Math.abs(oomPct - 5) / 15; // pico em 5% OTM
      if (oomScore < 0) oomScore = 0;

      candidates.push({
        symbol: call.symbol,
        strike: st.strike,
        vencimento: serie.due_date,
        dias: dias,
        premio: premio,
        premio_total_por_lote: premioTotal,
        yield_mensal: yieldMensal,
        delta: call.delta,
        iv: call.iv,
        oom_pct: oomPct,
        score: yieldMensal * diasPenalty * (0.7 + oomScore * 0.3),
      });
    }
  }

  candidates.sort(function(a, b) { return b.score - a.score; });
  return candidates.length > 0 ? candidates[0] : null;
}

export async function suggestCoveredCalls(userId, opts) {
  if (!opts) opts = {};
  var portfolioId = opts.portfolioId || null;
  var limit = opts.limit || 10;

  // Aceita dados pre-carregados ou busca do banco
  var positions, opcoes, selic;
  if (opts.positions && opts.opcoes) {
    positions = opts.positions;
    opcoes = opts.opcoes;
    selic = opts.selic || 13.25;
  } else {
    var results = await Promise.all([
      getPositions(userId, portfolioId || undefined),
      getOpcoes(userId, portfolioId || undefined),
      getProfile(userId),
    ]);
    positions = (results[0] && results[0].data) || [];
    opcoes = (results[1] && results[1].data) || [];
    var profile = (results[2] && results[2].data) || {};
    selic = profile.selic || 13.25;
  }

  // Filtrar acoes BR com qty disponivel
  var elegiveis = [];
  var opcoesAtivas = [];
  for (var i = 0; i < opcoes.length; i++) {
    if (opcoes[i].status === 'ativa') opcoesAtivas.push(opcoes[i]);
  }

  for (var p = 0; p < positions.length; p++) {
    var pos = positions[p];
    if (pos.categoria !== 'acao') continue;
    if ((pos.mercado || 'BR') !== 'BR') continue;
    var qty = pos.quantidade || 0;
    if (qty < MIN_QTY) continue;
    var coveredQty = calcCoveredQty(opcoesAtivas, pos.ticker);
    var disponivel = qty - coveredQty;
    if (disponivel < MIN_QTY) continue;
    elegiveis.push({
      ticker: (pos.ticker || '').toUpperCase(),
      qty_disponivel: Math.floor(disponivel / 100) * 100,
      pm: pos.pm || 0,
    });
  }

  if (elegiveis.length === 0) return [];

  // Buscar precos atuais
  var tickers = elegiveis.map(function(e) { return e.ticker; });
  var priceRes = await fetchPrices(tickers).catch(function() { return {}; });
  var precoMap = priceRes || {};

  // Para cada elegivel, buscar chain e escolher melhor call
  var sugestoes = [];
  for (var e = 0; e < elegiveis.length; e++) {
    var el = elegiveis[e];
    var precoAtual = (precoMap[el.ticker] && precoMap[el.ticker].price) || el.pm || 0;
    if (precoAtual <= 0) continue;
    try {
      var chainRes = await fetchOptionsChain(el.ticker, selic);
      if (chainRes && chainRes.chain) {
        var best = pickBestCall(chainRes.chain, precoAtual);
        if (best) {
          var lotes = Math.floor(el.qty_disponivel / 100);
          var rendaMensalSem = 0;
          var rendaMensalCom = (best.premio * 100 * lotes) * (30 / best.dias);
          sugestoes.push({
            ticker: el.ticker,
            qty_disponivel: el.qty_disponivel,
            lotes: lotes,
            preco_atual: precoAtual,
            pm: el.pm,
            sugestao: best,
            comparativo: {
              renda_sem: rendaMensalSem,
              renda_com: rendaMensalCom,
              valor_imobilizado: precoAtual * el.qty_disponivel,
              yield_mensal_carteira: (rendaMensalCom / (precoAtual * el.qty_disponivel)) * 100,
            },
          });
        }
      }
    } catch (err) {
      // Fallback: estimar premio conservador (0.8% do preco por mes, OTM 5%)
      console.warn('suggestCoveredCalls chain error for ' + el.ticker + ':', err.message || err);
      var estPremio = precoAtual * 0.008;
      var estStrike = Math.round(precoAtual * 1.05 * 100) / 100;
      var lotesFb = Math.floor(el.qty_disponivel / 100);
      sugestoes.push({
        ticker: el.ticker,
        qty_disponivel: el.qty_disponivel,
        lotes: lotesFb,
        preco_atual: precoAtual,
        pm: el.pm,
        estimado: true,
        sugestao: {
          symbol: el.ticker + ' ~C' + estStrike,
          strike: estStrike,
          vencimento: null,
          dias: 30,
          premio: estPremio,
          premio_total_por_lote: estPremio * 100,
          yield_mensal: precoAtual > 0 ? (estPremio / precoAtual) * 100 : 0,
          delta: null,
          iv: null,
          oom_pct: 5,
          score: 0,
        },
        comparativo: {
          renda_sem: 0,
          renda_com: estPremio * 100 * lotesFb,
          valor_imobilizado: precoAtual * el.qty_disponivel,
          yield_mensal_carteira: precoAtual > 0 ? (estPremio * 100 * lotesFb) / (precoAtual * el.qty_disponivel) * 100 : 0,
        },
      });
    }
    if (sugestoes.length >= limit) break;
  }

  // Ordenar por yield mensal desc
  sugestoes.sort(function(a, b) { return b.sugestao.yield_mensal - a.sugestao.yield_mensal; });

  // Retorno enriquecido: inclui elegiveis pra UI explicar quando nao tem sugestao
  sugestoes._elegiveis = elegiveis;
  sugestoes._elegiveisCount = elegiveis.length;
  return sugestoes;
}
