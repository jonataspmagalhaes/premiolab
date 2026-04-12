/**
 * incomeForecastService.js
 * Motor de projecao de renda mensal (12 meses) baseado em dados historicos.
 *
 * Fontes:
 *  - Proventos reais dos ultimos 24m (tabela proventos)
 *  - Historico StatusInvest via fiiStatusInvestService para FIIs (fallback se sem historico local)
 *  - Opcoes ativas (premios travados ate vencimento)
 *  - Renda fixa (cupons semestrais/mensais projetados)
 *
 * Exports:
 *  - buildIncomeForecast(userId, opts) → {
 *      monthly: [{mes, year, total, fii, acao, opcao, rf, items:[...]}] (12 meses a frente),
 *      historyMonthly: [...] (12 meses atras),
 *      summary: { mediaProjetada, max, min, totalProjetado, currentMonth, lastMonth, delta },
 *      bySource: { fii, acao, opcao, rf },
 *      byTicker: { [ticker]: mediaMensal }
 *    }
 *  - getCurrentMonthIncome(userId) → renda recebida no mes corrente
 *  - getLastMonthIncome(userId) → renda recebida mes passado
 *  - getMonthlyIncomeHistory(userId, months) → historico N meses para sparkline
 */

import { getProventos, getOpcoes, getRendaFixa, getPositions, getProfile } from './database';
import { fetchFii12mChart } from './fiiStatusInvestService';
import { fetchAcao12mChart, fetchAcaoDpaMedio } from './acaoStatusInvestService';
import { fetchMarketIndicators } from './marketIndicatorsService';

var FII_CATS = { fii: true };
var ACAO_CATS = { acao: true, stock_int: true };
var ETF_CATS = { etf: true };

function monthKey(year, monthIdx) {
  return year + '-' + String(monthIdx + 1).padStart(2, '0');
}

function parseDateSafe(s) {
  if (!s) return null;
  var d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d;
}

// Distribui valor anual de RF em cupons mensais estimados
// Papeis isentos de IR na pessoa fisica (debentures incentivadas nao estao
// na lista porque o dropdown atual mostra "Debenture" generico — se o user
// marcar como incentivada no futuro, adicionar aqui).
var TIPOS_ISENTOS_IR = { lci_lca: true, lci: true, lca: true, cri: true, cra: true, poupanca: true, lcd: true };

// Tabela regressiva do IR pra aplicacoes de renda fixa tributadas.
// Calcula pelo dias desde a aplicacao ate o vencimento (assume hold to maturity).
// Fallback: se nao tem vencimento, assume 720+ dias (15%).
function irRateFromDays(days) {
  if (days == null || !isFinite(days)) return 0.15;
  if (days <= 180) return 0.225;
  if (days <= 360) return 0.20;
  if (days <= 720) return 0.175;
  return 0.15;
}

function rfMensalEstimado(rf, indicadores) {
  var valor = rf.valor_aplicado || 0;
  var taxaPct = rf.taxa || 0;
  var indexador = (rf.indexador || '').toUpperCase();
  var taxaAnual = taxaPct;
  // Selic ~= CDI (o DI segue a Selic meta com spread minimo). Se indicadores
  // nao vieram, usa defaults conservadores. CDI aqui e a taxa total anual
  // do indexador, nao o spread do papel.
  var selicAnual = (indicadores && indicadores.selic) || 10.75;
  var ipcaAnual = (indicadores && indicadores.ipca) || 4.5;
  if (indexador === 'CDI' || indexador.indexOf('CDI') !== -1) {
    // taxaPct e o % do CDI que o papel paga (ex: 110% → 1.10)
    taxaAnual = (taxaPct / 100) * selicAnual;
  } else if (indexador === 'IPCA') {
    // taxaPct e o cupom real acima do IPCA (ex: IPCA+6 → taxaPct=6)
    taxaAnual = taxaPct + ipcaAnual;
  } else if (indexador === 'SELIC') {
    // Tesouro Selic: taxaPct e o spread (geralmente 0) sobre a Selic
    taxaAnual = taxaPct + selicAnual;
  }
  if (taxaAnual <= 0) return 0;
  var bruto = valor * taxaAnual / 100 / 12;

  // Desconta IR. Isentos (LCI/LCA/CRI/CRA/Poupanca/LCD) retornam bruto.
  var tipo = (rf.tipo || '').toLowerCase();
  if (TIPOS_ISENTOS_IR[tipo]) return bruto;

  // Tributado: calcula dias de posse (aplicacao → vencimento). Se nao tem
  // vencimento, assume longo prazo (15%). Se nao tem data_aplicacao, usa
  // created_at como fallback.
  var dataAplic = parseDateSafe(rf.data_aplicacao || rf.created_at);
  var venc = parseDateSafe(rf.vencimento);
  var dias = null;
  if (dataAplic && venc) {
    dias = Math.round((venc - dataAplic) / (1000 * 60 * 60 * 24));
  }
  var irRate = irRateFromDays(dias);
  return bruto * (1 - irRate);
}

// ── Historico de renda mensal a partir dos proventos reais ──
function buildHistoryFromProventos(proventos, opcoesFechadas, months) {
  var now = new Date();
  var cutoff = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  var map = {};
  for (var i = 0; i < months; i++) {
    var md = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    var k = monthKey(md.getFullYear(), md.getMonth());
    map[k] = { mes: md.getMonth(), year: md.getFullYear(), total: 0, fii: 0, acao: 0, opcao: 0, rf: 0, items: [] };
  }
  // Proventos
  for (var j = 0; j < proventos.length; j++) {
    var p = proventos[j];
    var pd = parseDateSafe(p.data_pagamento);
    if (!pd || pd < cutoff) continue;
    var mk = monthKey(pd.getFullYear(), pd.getMonth());
    if (!map[mk]) continue;
    var val = p.valor_total || ((p.valor_por_cota || 0) * (p.quantidade || 0));
    if (val <= 0) continue;
    map[mk].total += val;
    var tk = (p.ticker || '').toUpperCase();
    // Heuristica de categoria — proventos nao guardam categoria, inferir pelo ticker
    var isFii = /\d{2}$/.test(tk) && tk.slice(-2) === '11';
    if (isFii) map[mk].fii += val;
    else map[mk].acao += val;
    map[mk].items.push({ tipo: isFii ? 'fii' : 'acao', ticker: tk, valor: val, data: p.data_pagamento });
  }
  // Opcoes fechadas (premio recebido = renda)
  for (var k2 = 0; k2 < opcoesFechadas.length; k2++) {
    var o = opcoesFechadas[k2];
    var direcao = o.direcao || 'venda';
    if (direcao === 'compra') continue; // apenas vendas geram renda
    var dataClose = parseDateSafe(o.data_fechamento || o.vencimento || o.data_abertura);
    if (!dataClose || dataClose < cutoff) continue;
    var mk2 = monthKey(dataClose.getFullYear(), dataClose.getMonth());
    if (!map[mk2]) continue;
    var premioLiq = (o.premio || 0) * (o.qty || 0);
    if (o.premio_fechamento != null && (o.status === 'fechada' || o.status === 'exercida')) {
      premioLiq = ((o.premio || 0) - (o.premio_fechamento || 0)) * (o.qty || 0);
    }
    if (premioLiq <= 0) continue;
    map[mk2].total += premioLiq;
    map[mk2].opcao += premioLiq;
    map[mk2].items.push({ tipo: 'opcao', ticker: o.ticker_opcao, valor: premioLiq, data: o.data_fechamento || o.vencimento });
  }

  var arr = [];
  var keys = Object.keys(map).sort();
  for (var a = 0; a < keys.length; a++) arr.push(map[keys[a]]);
  return arr;
}

// ── Projecao 12 meses a frente ──
// Media dos ultimos 12m por ticker + opcoes ativas + RF recorrente
function buildProjectionFromHistory(positions, proventos, opcoesAtivas, rf, fiiCharts, acaoCharts, acaoDpa, indicadores) {
  var now = new Date();
  var projecao = [];
  for (var i = 0; i < 12; i++) {
    var md = new Date(now.getFullYear(), now.getMonth() + i, 1);
    projecao.push({
      mes: md.getMonth(),
      year: md.getFullYear(),
      key: monthKey(md.getFullYear(), md.getMonth()),
      total: 0, fii: 0, acao: 0, opcao: 0, rf: 0,
      items: [],
    });
  }

  // Positions map por ticker
  var posMap = {};
  for (var pi = 0; pi < positions.length; pi++) {
    var ps = positions[pi];
    if ((ps.quantidade || 0) <= 0) continue;
    posMap[(ps.ticker || '').toUpperCase()] = ps;
  }

  // Historico por ticker — media mensal dos ultimos 12m pagos
  var cutoff12 = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  var tickerMonthlyHist = {};
  for (var j = 0; j < proventos.length; j++) {
    var p = proventos[j];
    var pd = parseDateSafe(p.data_pagamento);
    if (!pd || pd < cutoff12 || pd > now) continue;
    var tk = (p.ticker || '').toUpperCase();
    if (!tk) continue;
    var val = p.valor_total || ((p.valor_por_cota || 0) * (p.quantidade || 0));
    if (val <= 0) continue;
    if (!tickerMonthlyHist[tk]) tickerMonthlyHist[tk] = { sum: 0, months: {} };
    tickerMonthlyHist[tk].sum += val;
    var mk = monthKey(pd.getFullYear(), pd.getMonth());
    if (!tickerMonthlyHist[tk].months[mk]) tickerMonthlyHist[tk].months[mk] = 0;
    tickerMonthlyHist[tk].months[mk] += val;
  }

  // Funcao auxiliar: calcular fator de tendencia por ticker
  // Compara 2o semestre (recente) vs 1o semestre (antigo) dos 12m
  function calcTrendFactor(tk) {
    var hist = tickerMonthlyHist[tk];
    if (!hist) return 1;
    var histMonths = Object.keys(hist.months).sort();
    if (histMonths.length < 4) return 1;
    var mid = Math.floor(histMonths.length / 2);
    // Usar medias (nao somas) pra compensar numero diferente de meses
    var soma1 = 0;
    var soma2 = 0;
    var count1 = mid;
    var count2 = histMonths.length - mid;
    for (var t1 = 0; t1 < mid; t1++) soma1 += hist.months[histMonths[t1]];
    for (var t2 = mid; t2 < histMonths.length; t2++) soma2 += hist.months[histMonths[t2]];
    var media1 = count1 > 0 ? soma1 / count1 : 0;
    var media2 = count2 > 0 ? soma2 / count2 : 0;
    if (media1 <= 0) return 1;
    var growthSem = ((media2 / media1) - 1);
    // Limitar entre -15% e +20% (conservador)
    if (growthSem > 0.20) growthSem = 0.20;
    if (growthSem < -0.15) growthSem = -0.15;
    // Aplicar metade da tendencia (conservador)
    return 1 + (growthSem * 0.5);
  }

  // 1) FIIs: usa fiiCharts (dividendo por cota por mes, 12m) × qty atual
  var posKeys = Object.keys(posMap);
  for (var pk = 0; pk < posKeys.length; pk++) {
    var pos = posMap[posKeys[pk]];
    var cat = pos.categoria;
    var tk2 = posKeys[pk];
    if (FII_CATS[cat]) {
      var chart = fiiCharts[tk2];
      if (chart && chart.length === 12) {
        // Projecao = mesma distribuicao dos ultimos 12m × qty atual × fator tendencia
        var trendFii = calcTrendFactor(tk2);
        for (var m = 0; m < 12; m++) {
          var valMes = (chart[m] || 0) * pos.quantidade * trendFii;
          if (valMes <= 0) continue;
          projecao[m].total += valMes;
          projecao[m].fii += valMes;
          projecao[m].items.push({ tipo: 'fii', ticker: tk2, valor: valMes });
        }
      } else {
        // Fallback: usa proventos historicos do proprio usuario
        // Corrigido: converte pra DPC (dividendo por cota) e multiplica pela qty atual
        var hist = tickerMonthlyHist[tk2];
        if (hist) {
          // Estimar qty historica: valor_total / valor_por_cota dos proventos originais
          var histQty = 0;
          var histQtyCount = 0;
          for (var hqi = 0; hqi < proventos.length; hqi++) {
            if ((proventos[hqi].ticker || '').toUpperCase() === tk2 && proventos[hqi].quantidade > 0) {
              histQty += proventos[hqi].quantidade;
              histQtyCount++;
            }
          }
          var avgHistQty = histQtyCount > 0 ? histQty / histQtyCount : pos.quantidade;
          var qtyFator = avgHistQty > 0 ? pos.quantidade / avgHistQty : 1;
          var media = (hist.sum / 12) * qtyFator;
          for (var m2 = 0; m2 < 12; m2++) {
            projecao[m2].total += media;
            projecao[m2].fii += media;
            projecao[m2].items.push({ tipo: 'fii', ticker: tk2, valor: media });
          }
        }
      }
    } else if (ACAO_CATS[cat] || ETF_CATS[cat]) {
      // Acoes/ETFs: 3 tiers de fallback
      //  T1. StatusInvest 12m chart (so categoria='acao', sem etf/stock_int):
      //      chart de DPA × qty_atual, replica sazonalidade, corrige compras
      //      recentes e zeragem de historico proprio.
      //  T2. DPA medio 5 anos StatusInvest: distribui linear pelos 12 meses.
      //      Util pra quando chart 12m veio zerado mas empresa tem historico
      //      mais antigo (cortou dividendo recente mas pagava bem antes).
      //  T3. Historico proprio da tabela proventos (comportamento antigo):
      //      so usa se StatusInvest nao retornou nada.
      var siChart = cat === 'acao' ? (acaoCharts[tk2] || null) : null;
      var siDpa = cat === 'acao' ? (acaoDpa[tk2] || null) : null;
      var acaoChartTotal = 0;
      if (siChart) {
        for (var sci = 0; sci < siChart.length; sci++) acaoChartTotal += siChart[sci];
      }
      var qtyAtual = pos.quantidade || 0;

      if (acaoChartTotal > 0 && qtyAtual > 0) {
        // T1: chart × qty_atual × fator tendencia
        var trendAcao = calcTrendFactor(tk2);
        var nowMonthIdx = now.getMonth();
        for (var ci = 0; ci < 12; ci++) {
          var dpaMes = siChart[ci] || 0;
          if (dpaMes <= 0) continue;
          // Chart e indexado [11] = mais antigo ... [0] = mes corrente (11 meses atras).
          // No fiiStatusInvestService o loop push e de m=11 descending, entao
          // chart[0] = mes corrente-11, chart[11] = mes corrente. Confirma mapeando:
          // o mes do chart[ci] e (nowMonth - (11-ci)) normalizado.
          var chartMonthIdx = ((nowMonthIdx - (11 - ci)) % 12 + 12) % 12;
          for (var fm1 = 0; fm1 < 12; fm1++) {
            if (projecao[fm1].mes === chartMonthIdx) {
              var valV = dpaMes * qtyAtual * trendAcao;
              projecao[fm1].total += valV;
              projecao[fm1].acao += valV;
              projecao[fm1].items.push({ tipo: 'acao', ticker: tk2, valor: valV, fonte: 'si_12m' });
              break;
            }
          }
        }
      } else if (siDpa && siDpa.avgAnual > 0 && siDpa.yearsWithData >= 2 && qtyAtual > 0) {
        // T2: DPA medio 5 anos distribuido linear
        var mensalLinear = (siDpa.avgAnual * qtyAtual) / 12;
        for (var fm2 = 0; fm2 < 12; fm2++) {
          projecao[fm2].total += mensalLinear;
          projecao[fm2].acao += mensalLinear;
          projecao[fm2].items.push({ tipo: 'acao', ticker: tk2, valor: mensalLinear, fonte: 'si_5y' });
        }
      } else {
        // T3: historico proprio da tabela proventos, corrigido pela qty atual
        var hist2 = tickerMonthlyHist[tk2];
        if (hist2) {
          // Estimar fator de correcao qty
          var histQty2 = 0;
          var histQtyCount2 = 0;
          for (var hqi2 = 0; hqi2 < proventos.length; hqi2++) {
            if ((proventos[hqi2].ticker || '').toUpperCase() === tk2 && proventos[hqi2].quantidade > 0) {
              histQty2 += proventos[hqi2].quantidade;
              histQtyCount2++;
            }
          }
          var avgHistQty2 = histQtyCount2 > 0 ? histQty2 / histQtyCount2 : qtyAtual;
          var qtyFator2 = avgHistQty2 > 0 ? qtyAtual / avgHistQty2 : 1;

          var histKeys = Object.keys(hist2.months);
          for (var hk = 0; hk < histKeys.length; hk++) {
            var parts = histKeys[hk].split('-');
            var histMonthIdx = parseInt(parts[1], 10) - 1;
            for (var fm3 = 0; fm3 < 12; fm3++) {
              if (projecao[fm3].mes === histMonthIdx) {
                var v = hist2.months[histKeys[hk]] * qtyFator2;
                projecao[fm3].total += v;
                projecao[fm3].acao += v;
                projecao[fm3].items.push({ tipo: cat === 'etf' ? 'etf' : 'acao', ticker: tk2, valor: v, fonte: 'user_hist' });
                break;
              }
            }
          }
        }
      }
    }
  }

  // 2) Opcoes ativas — premio ratiado linearmente pelos meses ate o
  // vencimento (theta decay simplificado). Antes: prejudicava a leitura
  // de "renda mensal estavel" ao concentrar o valor inteiro num so mes.
  // Agora: distribui igual pelos meses restantes (incluindo o corrente).
  for (var oi = 0; oi < opcoesAtivas.length; oi++) {
    var op = opcoesAtivas[oi];
    if (op.status !== 'ativa') continue;
    if ((op.direcao || 'venda') === 'compra') continue;
    var venc = parseDateSafe(op.vencimento);
    if (!venc) continue;
    var monthsAhead = (venc.getFullYear() - now.getFullYear()) * 12 + (venc.getMonth() - now.getMonth());
    if (monthsAhead < 0 || monthsAhead >= 12) continue;
    var premioTotal = (op.premio || 0) * (op.qty || 0);
    if (premioTotal <= 0) continue;
    // Mes corrente conta como 1 parcela, proximo mes = 2 parcelas, etc.
    var parcelas = monthsAhead + 1;
    var parcelaMes = premioTotal / parcelas;
    for (var mi = 0; mi <= monthsAhead; mi++) {
      projecao[mi].total += parcelaMes;
      projecao[mi].opcao += parcelaMes;
      projecao[mi].items.push({ tipo: 'opcao', ticker: op.ticker_opcao, valor: parcelaMes });
    }
  }

  // 3) RF — rendimento mensal estimado (todos os meses)
  for (var ri = 0; ri < rf.length; ri++) {
    var rfItem = rf[ri];
    var mensal = rfMensalEstimado(rfItem, indicadores);
    if (mensal <= 0) continue;
    for (var rm = 0; rm < 12; rm++) {
      projecao[rm].total += mensal;
      projecao[rm].rf += mensal;
    }
  }

  return projecao;
}

export async function buildIncomeForecast(userId, opts) {
  if (!opts) opts = {};
  var portfolioId = opts.portfolioId || null;

  var results = await Promise.all([
    getPositions(userId, portfolioId || undefined),
    getProventos(userId, { limit: 2000, portfolioId: portfolioId || undefined }),
    getOpcoes(userId, portfolioId || undefined),
    getRendaFixa(userId, portfolioId || undefined),
    getProfile(userId).catch(function() { return null; }),
    fetchMarketIndicators().catch(function() { return { selic: 10.75, ipca: 4.5 }; }),
  ]);
  var positions = (results[0] && results[0].data) || [];
  var proventos = (results[1] && results[1].data) || [];
  var opcoes = (results[2] && results[2].data) || [];
  var rf = (results[3] && results[3].data) || [];
  var profile = (results[4] && results[4].data) || null;
  var marketInd = results[5] || { selic: 10.75, ipca: 4.5 };

  // Selic do profile tem prioridade (user pode sobrescrever o BCB em Mais>Config).
  // IPCA vem sempre do BCB (ou fallback).
  var indicadores = {
    selic: (profile && profile.selic > 0) ? profile.selic : marketInd.selic,
    ipca: marketInd.ipca,
  };

  var opcoesAtivas = [];
  var opcoesFechadas = [];
  for (var oi = 0; oi < opcoes.length; oi++) {
    if (opcoes[oi].status === 'ativa') opcoesAtivas.push(opcoes[oi]);
    else opcoesFechadas.push(opcoes[oi]);
  }

  // Buscar charts FII (em paralelo) para tickers FII das positions
  var fiiTickers = [];
  var acaoTickers = [];
  for (var pi = 0; pi < positions.length; pi++) {
    var catPi = positions[pi].categoria;
    var qtyPi = positions[pi].quantidade || 0;
    if (qtyPi <= 0) continue;
    var tkPi = (positions[pi].ticker || '').toUpperCase();
    if (!tkPi) continue;
    if (catPi === 'fii') fiiTickers.push(tkPi);
    else if (catPi === 'acao') acaoTickers.push(tkPi);
    // etf, etf_int, stock_int, bdr nao tem cobertura StatusInvest
  }
  var fiiCharts = {};
  if (fiiTickers.length > 0) {
    var chartPromises = fiiTickers.map(function(tk) {
      return fetchFii12mChart(tk).then(function(ch) { return { tk: tk, chart: ch }; }).catch(function() { return { tk: tk, chart: null }; });
    });
    var chartResults = await Promise.all(chartPromises);
    for (var ci = 0; ci < chartResults.length; ci++) {
      fiiCharts[chartResults[ci].tk] = chartResults[ci].chart;
    }
  }

  // Buscar charts + DPA medio de acoes (paralelo) — replica a mesma estrategia
  // dos FIIs. Usado pra projetar renda de compras recentes e suavizar anos
  // atipicos, similar ao que sites como AGF fazem.
  var acaoCharts = {};
  var acaoDpa = {};
  if (acaoTickers.length > 0) {
    var acaoChartPromises = acaoTickers.map(function(tk) {
      return fetchAcao12mChart(tk).then(function(ch) { return { tk: tk, chart: ch }; }).catch(function() { return { tk: tk, chart: null }; });
    });
    var acaoDpaPromises = acaoTickers.map(function(tk) {
      return fetchAcaoDpaMedio(tk, 5).then(function(dpa) { return { tk: tk, dpa: dpa }; }).catch(function() { return { tk: tk, dpa: null }; });
    });
    var acaoChartRes = await Promise.all(acaoChartPromises);
    var acaoDpaRes = await Promise.all(acaoDpaPromises);
    for (var aci = 0; aci < acaoChartRes.length; aci++) {
      acaoCharts[acaoChartRes[aci].tk] = acaoChartRes[aci].chart;
    }
    for (var adi = 0; adi < acaoDpaRes.length; adi++) {
      acaoDpa[acaoDpaRes[adi].tk] = acaoDpaRes[adi].dpa;
    }
  }

  // Historico 12m (real)
  var historyMonthly = buildHistoryFromProventos(proventos, opcoesFechadas, 12);

  // Projecao 12m futuro
  var projection = buildProjectionFromHistory(positions, proventos, opcoesAtivas, rf, fiiCharts, acaoCharts, acaoDpa, indicadores);

  // Summary
  var totalProj = 0; var maxMes = 0; var minMes = null;
  for (var pm = 0; pm < projection.length; pm++) {
    totalProj += projection[pm].total;
    if (projection[pm].total > maxMes) maxMes = projection[pm].total;
    if (minMes === null || projection[pm].total < minMes) minMes = projection[pm].total;
  }
  var mediaProj = totalProj / 12;

  // Renda mes corrente vs passado (real)
  var nowD = new Date();
  var currentKey = monthKey(nowD.getFullYear(), nowD.getMonth());
  var lastD = new Date(nowD.getFullYear(), nowD.getMonth() - 1, 1);
  var lastKey = monthKey(lastD.getFullYear(), lastD.getMonth());
  var currentMonth = 0; var lastMonth = 0;
  for (var h = 0; h < historyMonthly.length; h++) {
    var hk = monthKey(historyMonthly[h].year, historyMonthly[h].mes);
    if (hk === currentKey) currentMonth = historyMonthly[h].total;
    if (hk === lastKey) lastMonth = historyMonthly[h].total;
  }
  var deltaMes = lastMonth > 0 ? ((currentMonth - lastMonth) / lastMonth) * 100 : 0;

  // By source (projetado media)
  var bySource = { fii: 0, acao: 0, opcao: 0, rf: 0 };
  for (var s = 0; s < projection.length; s++) {
    bySource.fii += projection[s].fii;
    bySource.acao += projection[s].acao;
    bySource.opcao += projection[s].opcao;
    bySource.rf += projection[s].rf;
  }
  bySource.fii /= 12;
  bySource.acao /= 12;
  bySource.opcao /= 12;
  bySource.rf /= 12;

  // By ticker (media mensal projetada)
  var byTicker = {};
  for (var tp = 0; tp < projection.length; tp++) {
    for (var ti = 0; ti < projection[tp].items.length; ti++) {
      var it = projection[tp].items[ti];
      if (!byTicker[it.ticker]) byTicker[it.ticker] = 0;
      byTicker[it.ticker] += it.valor / 12;
    }
  }

  return {
    monthly: projection,
    historyMonthly: historyMonthly,
    indicadores: indicadores,
    summary: {
      mediaProjetada: mediaProj,
      totalProjetado: totalProj,
      maxMes: maxMes,
      minMes: minMes || 0,
      currentMonth: currentMonth,
      lastMonth: lastMonth,
      deltaMes: deltaMes,
    },
    bySource: bySource,
    byTicker: byTicker,
  };
}

export async function getCurrentMonthIncome(userId, portfolioId) {
  var now = new Date();
  var startMes = new Date(now.getFullYear(), now.getMonth(), 1);
  var res = await getProventos(userId, { limit: 500, portfolioId: portfolioId || undefined });
  var data = (res && res.data) || [];
  var total = 0;
  for (var i = 0; i < data.length; i++) {
    var pd = parseDateSafe(data[i].data_pagamento);
    if (!pd || pd < startMes) continue;
    var v = data[i].valor_total || ((data[i].valor_por_cota || 0) * (data[i].quantidade || 0));
    if (v > 0) total += v;
  }
  return total;
}

export async function getLastMonthIncome(userId, portfolioId) {
  var now = new Date();
  var startLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var endLast = new Date(now.getFullYear(), now.getMonth(), 1);
  var res = await getProventos(userId, { limit: 500, portfolioId: portfolioId || undefined });
  var data = (res && res.data) || [];
  var total = 0;
  for (var i = 0; i < data.length; i++) {
    var pd = parseDateSafe(data[i].data_pagamento);
    if (!pd || pd < startLast || pd >= endLast) continue;
    var v = data[i].valor_total || ((data[i].valor_por_cota || 0) * (data[i].quantidade || 0));
    if (v > 0) total += v;
  }
  return total;
}

export async function getMonthlyIncomeHistory(userId, months, portfolioId) {
  var n = months || 12;
  var res = await getProventos(userId, { limit: 2000, portfolioId: portfolioId || undefined });
  var proventos = (res && res.data) || [];
  var opRes = await getOpcoes(userId, portfolioId || undefined);
  var opcoesFechadas = [];
  var opcoes = (opRes && opRes.data) || [];
  for (var i = 0; i < opcoes.length; i++) {
    if (opcoes[i].status !== 'ativa') opcoesFechadas.push(opcoes[i]);
  }
  return buildHistoryFromProventos(proventos, opcoesFechadas, n);
}
