// incomeAnalyticsService — Motor de analise de renda passiva.
// 6 funcoes que alimentam a tab Estrategias com insights acionaveis.
// Todas usam dados ja existentes no app (proventos, positions, fundamentals, movimentacoes).

var database = require('./database');
var getProventos = database.getProventos;
var getOpcoes = database.getOpcoes;
var getPositions = database.getPositions;
var getOperacoes = database.getOperacoes;
var getMovimentacoes = database.getMovimentacoes;
var getOrcamentos = database.getOrcamentos;
var getSaldos = database.getSaldos;
var getProfile = database.getProfile;

var MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// ══════════ 1. RAIO-X DA RENDA ══════════
// Concentracao por ticker + sazonalidade mensal + riscos
function computeIncomeXray(userId, opts) {
  if (!opts) opts = {};
  var pfId = opts.portfolioId || undefined;

  return Promise.all([
    getProventos(userId, { limit: 5000, portfolioId: pfId }),
    getPositions(userId, pfId),
  ]).then(function(allRes) {
    var proventos = (allRes[0] && allRes[0].data) || [];
    var positionsData = (allRes[1] && allRes[1].data) || [];
    if (proventos.length === 0) return null;

    var now = new Date();
    var limite12m = new Date(now.getFullYear() - 1, now.getMonth(), 1);

    // Filtrar ultimos 12 meses
    var recentes = [];
    for (var i = 0; i < proventos.length; i++) {
      var d = new Date(proventos[i].data_pagamento);
      if (d >= limite12m) recentes.push(proventos[i]);
    }

    // Concentracao por ticker
    var porTicker = {};
    var total12m = 0;
    for (var j = 0; j < recentes.length; j++) {
      var tk = recentes[j].ticker || 'Outros';
      var val = recentes[j].valor_total || 0;
      if (!porTicker[tk]) porTicker[tk] = 0;
      porTicker[tk] += val;
      total12m += val;
    }

    var tickers = Object.keys(porTicker);
    var concentracao = [];
    for (var k = 0; k < tickers.length; k++) {
      concentracao.push({
        ticker: tickers[k],
        valor12m: porTicker[tickers[k]],
        pct: total12m > 0 ? (porTicker[tickers[k]] / total12m) * 100 : 0,
      });
    }
    concentracao.sort(function(a, b) { return b.valor12m - a.valor12m; });

    // Top 3 concentracao
    var top3Pct = 0;
    for (var t = 0; t < Math.min(3, concentracao.length); t++) {
      top3Pct += concentracao[t].pct;
    }

    // Sazonalidade — media por mes
    var mesSoma = [0,0,0,0,0,0,0,0,0,0,0,0];
    var mesCount = [0,0,0,0,0,0,0,0,0,0,0,0];
    for (var s = 0; s < proventos.length; s++) {
      var sd = new Date(proventos[s].data_pagamento);
      var mesIdx = sd.getMonth();
      mesSoma[mesIdx] += proventos[s].valor_total || 0;
      mesCount[mesIdx]++;
    }
    // Normalizar por numero real de ocorrencias de cada mes
    var sazonalidade = [];
    var totalSazon = 0;
    var mesesComDados = 0;
    for (var m = 0; m < 12; m++) {
      var contMes = mesCount[m] || 0;
      var mediaMes = contMes > 0 ? mesSoma[m] / contMes : 0;
      sazonalidade.push({ mes: m, label: MESES[m], media: mediaMes, ocorrencias: contMes });
      totalSazon += mediaMes;
      if (contMes > 0) mesesComDados++;
    }
    var mediaGeral = mesesComDados > 0 ? totalSazon / mesesComDados : 0;

    // Meses fracos (< 60% da media)
    var mesesFracos = [];
    for (var mf = 0; mf < 12; mf++) {
      if (sazonalidade[mf].media < mediaGeral * 0.6 && mediaGeral > 0) {
        mesesFracos.push(MESES[mf]);
      }
    }

    // Tendencia mensal — renda por mes (ultimos 24m) pra mostrar evolucao
    var limite24m = new Date(now.getFullYear() - 2, now.getMonth(), 1);
    var rendaPorMes = {};
    for (var tm = 0; tm < proventos.length; tm++) {
      var tmd = new Date(proventos[tm].data_pagamento);
      if (tmd < limite24m) continue;
      var tmk = tmd.getFullYear() + '-' + String(tmd.getMonth() + 1).padStart(2, '0');
      if (!rendaPorMes[tmk]) rendaPorMes[tmk] = 0;
      rendaPorMes[tmk] += proventos[tm].valor_total || 0;
    }
    var mesesOrdenados = Object.keys(rendaPorMes).sort();
    var tendenciaMensal = [];
    for (var tmi = 0; tmi < mesesOrdenados.length; tmi++) {
      var tmParts = mesesOrdenados[tmi].split('-');
      tendenciaMensal.push({
        key: mesesOrdenados[tmi],
        mes: parseInt(tmParts[1]) - 1,
        ano: parseInt(tmParts[0]),
        valor: rendaPorMes[mesesOrdenados[tmi]],
      });
    }

    // Comparar ultimos 6m vs 6m anteriores
    var ultimos6 = tendenciaMensal.slice(-6);
    var anteriores6 = tendenciaMensal.slice(-12, -6);
    var mediaUlt6 = 0;
    var mediaAnt6 = 0;
    for (var u6 = 0; u6 < ultimos6.length; u6++) mediaUlt6 += ultimos6[u6].valor;
    mediaUlt6 = ultimos6.length > 0 ? mediaUlt6 / ultimos6.length : 0;
    for (var a6 = 0; a6 < anteriores6.length; a6++) mediaAnt6 += anteriores6[a6].valor;
    mediaAnt6 = anteriores6.length > 0 ? mediaAnt6 / anteriores6.length : 0;
    var tendenciaGeral = mediaAnt6 > 0 ? ((mediaUlt6 / mediaAnt6) - 1) * 100 : 0;
    var tendenciaLabel = tendenciaGeral > 5 ? 'crescendo' : tendenciaGeral < -5 ? 'caindo' : 'estavel';

    // Tendencia por ticker (top 5)
    var porTickerSem = {};
    for (var pts = 0; pts < proventos.length; pts++) {
      var ptsd = new Date(proventos[pts].data_pagamento);
      if (ptsd < limite24m) continue;
      var ptsTk = proventos[pts].ticker || 'Outros';
      var ptsRecente = ptsd >= limite12m;
      if (!porTickerSem[ptsTk]) porTickerSem[ptsTk] = { recente: 0, anterior: 0 };
      if (ptsRecente) {
        porTickerSem[ptsTk].recente += proventos[pts].valor_total || 0;
      } else {
        porTickerSem[ptsTk].anterior += proventos[pts].valor_total || 0;
      }
    }

    // Adicionar tendencia a cada item de concentracao (somente dados de 24m)
    for (var tc = 0; tc < concentracao.length; tc++) {
      var tcData = porTickerSem[concentracao[tc].ticker];
      if (tcData && tcData.anterior > 0 && tcData.recente > 0) {
        concentracao[tc].tendencia = ((tcData.recente / tcData.anterior) - 1) * 100;
      } else if (tcData && tcData.recente > 0 && tcData.anterior === 0) {
        concentracao[tc].tendencia = 100; // novo pagador
      } else {
        concentracao[tc].tendencia = null;
      }
    }

    // Breakdown por tipo de provento
    var porTipo = {};
    for (var bt = 0; bt < recentes.length; bt++) {
      var tipo = recentes[bt].tipo_provento || 'outro';
      if (!porTipo[tipo]) porTipo[tipo] = 0;
      porTipo[tipo] += recentes[bt].valor_total || 0;
    }
    var breakdownTipo = [];
    var tipoKeys = Object.keys(porTipo);
    for (var bti = 0; bti < tipoKeys.length; bti++) {
      breakdownTipo.push({
        tipo: tipoKeys[bti],
        valor: porTipo[tipoKeys[bti]],
        pct: total12m > 0 ? (porTipo[tipoKeys[bti]] / total12m) * 100 : 0,
      });
    }
    breakdownTipo.sort(function(a, b) { return b.valor - a.valor; });

    // Simulacao de impacto: "se o top ticker cortar X%, sua renda cai Y"
    var impactos = [];
    var cenarios = [25, 50, 100]; // corte de 25%, 50%, 100%
    for (var imp = 0; imp < Math.min(3, concentracao.length); imp++) {
      var tk = concentracao[imp];
      var impItem = { ticker: tk.ticker, valor12m: tk.valor12m, pct: tk.pct, cenarios: [] };
      for (var ci = 0; ci < cenarios.length; ci++) {
        var corte = cenarios[ci];
        var perdaMensal = (tk.valor12m / 12) * (corte / 100);
        var novaRenda = (total12m / 12) - perdaMensal;
        impItem.cenarios.push({
          cortePct: corte,
          perdaMensal: perdaMensal,
          novaRenda: novaRenda,
          impactoPct: total12m > 0 ? (perdaMensal / (total12m / 12)) * 100 : 0,
        });
      }
      impactos.push(impItem);
    }

    // Diversificacao: quantos tickers cobrem 80% da renda
    var acum = 0;
    var tickersPra80 = 0;
    for (var d80 = 0; d80 < concentracao.length; d80++) {
      acum += concentracao[d80].pct;
      tickersPra80++;
      if (acum >= 80) break;
    }

    // Variabilidade mensal (desvio padrao / media)
    var somaDesvio = 0;
    for (var dv = 0; dv < 12; dv++) {
      var diff = sazonalidade[dv].media - mediaGeral;
      somaDesvio += diff * diff;
    }
    var desvio = Math.sqrt(somaDesvio / 12);
    var variabilidade = mediaGeral > 0 ? (desvio / mediaGeral) * 100 : 0;

    // Meses fortes (> 130% da media)
    var mesesFortes = [];
    for (var mfo = 0; mfo < 12; mfo++) {
      if (sazonalidade[mfo].media > mediaGeral * 1.3 && mediaGeral > 0) {
        mesesFortes.push(MESES[mfo]);
      }
    }

    // Melhor e pior mes
    var melhorMes = { idx: 0, valor: 0 };
    var piorMes = { idx: 0, valor: Infinity };
    for (var bp = 0; bp < 12; bp++) {
      if (sazonalidade[bp].media > melhorMes.valor) { melhorMes = { idx: bp, valor: sazonalidade[bp].media }; }
      if (sazonalidade[bp].media < piorMes.valor) { piorMes = { idx: bp, valor: sazonalidade[bp].media }; }
    }

    return {
      total12m: total12m,
      mediaMensal: total12m / 12,
      concentracao: concentracao,
      top3Pct: top3Pct,
      sazonalidade: sazonalidade,
      mesesFracos: mesesFracos,
      mesesFortes: mesesFortes,
      melhorMes: { mes: MESES[melhorMes.idx], valor: melhorMes.valor },
      piorMes: { mes: MESES[piorMes.idx], valor: piorMes.valor },
      variabilidade: variabilidade,
      impactos: impactos,
      tickersPra80: tickersPra80,
      totalTickers: concentracao.length,
      breakdownTipo: breakdownTipo,
      tendenciaMensal: tendenciaMensal,
      tendenciaGeral: tendenciaGeral,
      tendenciaLabel: tendenciaLabel,
      mediaUlt6: mediaUlt6,
      mediaAnt6: mediaAnt6,
      ativosSubperformando: (function() {
        // Detectar ativos com DY abaixo do ideal pra sua categoria
        var DY_MIN = { fii: 6, acao: 3, etf: 2, stock_int: 1 };
        var sub = [];
        for (var sp = 0; sp < positionsData.length; sp++) {
          var sPos = positionsData[sp];
          if ((sPos.quantidade || 0) <= 0) continue;
          var sTk = (sPos.ticker || '').toUpperCase();
          var sCat = sPos.categoria || 'acao';
          var sValor = (sPos.preco_atual || sPos.pm || 0) * sPos.quantidade;
          // DY = renda 12m do ticker / valor de mercado
          var sRenda12m = porTicker[sTk] || 0;
          var sDy = sValor > 0 ? (sRenda12m / sValor) * 100 : 0;
          var sMinDy = DY_MIN[sCat] || 3;
          if (sDy < sMinDy && sValor > 1000) {
            sub.push({
              ticker: sTk,
              categoria: sCat,
              valor: sValor,
              dy: sDy,
              dyIdeal: sMinDy,
              renda12m: sRenda12m,
              deficit: (sMinDy - sDy) * sValor / 100 / 12,
            });
          }
        }
        sub.sort(function(a, b) { return b.deficit - a.deficit; });
        return sub;
      })(),
      risco: top3Pct > 60 ? 'alto' : top3Pct > 40 ? 'medio' : 'baixo',
    };
  });
}

// ══════════ 2. RENDA VS CONTAS ══════════
// Quanto da renda passiva cobre cada categoria de gastos PESSOAIS
// Ignora categorias financeiras/investimento (compra_ativo, recompra, etc)
var GRUPOS_PESSOAIS = ['moradia','alimentacao','transporte','saude','educacao','lazer','compras','pessoal','pets','servicos','seguros'];

function computeIncomeCoverage(userId, opts) {
  if (!opts) opts = {};
  var pfId = opts.portfolioId || undefined;

  var now = new Date();
  var mesAtual = now.getMonth();
  var anoAtual = now.getFullYear();

  return Promise.all([
    getProventos(userId, { limit: 2000, portfolioId: pfId }),
    getOrcamentos(userId),
    getMovimentacoes(userId, { limit: 1000 }),
  ]).then(function(results) {
    var proventos = (results[0] && results[0].data) || [];
    var orcamentos = (results[1] && results[1].data) || [];
    var movimentacoes = (results[2] && results[2].data) || [];

    // Renda media mensal (ultimos 3 meses)
    var rendaPorMes = {};
    for (var p = 0; p < proventos.length; p++) {
      var pd = new Date(proventos[p].data_pagamento);
      var pk = pd.getFullYear() + '-' + String(pd.getMonth() + 1).padStart(2, '0');
      if (!rendaPorMes[pk]) rendaPorMes[pk] = 0;
      rendaPorMes[pk] += proventos[p].valor_total || 0;
    }
    var mesesKeys = Object.keys(rendaPorMes).sort().reverse().slice(0, 3);
    var rendaMedia = 0;
    for (var rm = 0; rm < mesesKeys.length; rm++) {
      rendaMedia += rendaPorMes[mesesKeys[rm]];
    }
    rendaMedia = mesesKeys.length > 0 ? rendaMedia / mesesKeys.length : 0;

    // Gastos por GRUPO pessoal (ultimos 3 meses completos — mesma janela da renda)
    var finCatsLocal = require('../constants/financeCategories');
    var SUBCATS = finCatsLocal.SUBCATEGORIAS || {};

    var limiteGastos = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    var gastoPorGrupo = {};
    var gastoMesesSet = {};
    for (var g = 0; g < movimentacoes.length; g++) {
      var mov = movimentacoes[g];
      if (mov.tipo !== 'saida') continue;
      var movDate = new Date(mov.data);
      if (movDate < limiteGastos || movDate >= new Date(now.getFullYear(), now.getMonth(), 1)) continue;

      // Determinar grupo: subcategoria tem precedencia
      var grupo = null;
      var subcat = mov.subcategoria || '';
      var cat = mov.categoria || '';

      if (subcat && SUBCATS[subcat] && SUBCATS[subcat].grupo) {
        grupo = SUBCATS[subcat].grupo;
      } else if (GRUPOS_PESSOAIS.indexOf(cat) !== -1) {
        grupo = cat;
      }

      // Ignorar se nao e gasto pessoal
      if (!grupo || GRUPOS_PESSOAIS.indexOf(grupo) === -1) continue;

      var gd = new Date(mov.data);
      var gk = gd.getFullYear() + '-' + String(gd.getMonth() + 1).padStart(2, '0');
      gastoMesesSet[gk] = true;
      if (!gastoPorGrupo[grupo]) gastoPorGrupo[grupo] = 0;
      gastoPorGrupo[grupo] += mov.valor || 0;
    }
    var numMesesGasto = Math.max(1, Object.keys(gastoMesesSet).length);
    // Normalizar pra media mensal
    var grupos = Object.keys(gastoPorGrupo);
    for (var ng = 0; ng < grupos.length; ng++) {
      gastoPorGrupo[grupos[ng]] = gastoPorGrupo[grupos[ng]] / numMesesGasto;
    }

    // Usar orcamento se existir, senao gasto real
    var contas = [];
    var totalGastos = 0;

    // Primeiro: orcamentos ativos (somente grupos pessoais)
    var orcGrupos = {};
    for (var o = 0; o < orcamentos.length; o++) {
      if (!orcamentos[o].ativo) continue;
      var oGrupo = orcamentos[o].grupo;
      if (GRUPOS_PESSOAIS.indexOf(oGrupo) === -1) continue;
      orcGrupos[oGrupo] = orcamentos[o].valor_limite || 0;
    }

    // Combinar: orcamento OU gasto real (somente grupos pessoais)
    var todosGrupos = {};
    for (var og = 0; og < Object.keys(orcGrupos).length; og++) {
      todosGrupos[Object.keys(orcGrupos)[og]] = true;
    }
    for (var gg = 0; gg < grupos.length; gg++) {
      todosGrupos[grupos[gg]] = true;
    }

    var tgKeys = Object.keys(todosGrupos);
    for (var tg = 0; tg < tgKeys.length; tg++) {
      var grp = tgKeys[tg];
      var gastoMensal = orcGrupos[grp] || gastoPorGrupo[grp] || 0;
      if (gastoMensal <= 0) continue;
      totalGastos += gastoMensal;
      contas.push({ categoria: grp, gastoMensal: gastoMensal });
    }

    // Ordenar por gasto desc
    contas.sort(function(a, b) { return b.gastoMensal - a.gastoMensal; });

    // Alocar renda pra cobrir contas (maior primeiro)
    var rendaDisponivel = rendaMedia;
    var cobertas = 0;
    var parciais = 0;
    for (var c = 0; c < contas.length; c++) {
      if (rendaDisponivel >= contas[c].gastoMensal) {
        contas[c].coberto = contas[c].gastoMensal;
        contas[c].status = 'coberto';
        rendaDisponivel -= contas[c].gastoMensal;
        cobertas++;
      } else if (rendaDisponivel > 0) {
        contas[c].coberto = rendaDisponivel;
        contas[c].status = 'parcial';
        rendaDisponivel = 0;
        parciais++;
      } else {
        contas[c].coberto = 0;
        contas[c].status = 'descoberto';
      }
      contas[c].falta = contas[c].gastoMensal - contas[c].coberto;
    }

    var progressoPct = totalGastos > 0 ? (rendaMedia / totalGastos) * 100 : 0;

    return {
      rendaMedia: rendaMedia,
      totalGastos: totalGastos,
      progressoPct: Math.min(100, progressoPct),
      contas: contas,
      cobertas: cobertas,
      parciais: parciais,
      descobertas: contas.length - cobertas - parciais,
      temOrcamentos: Object.keys(orcGrupos).length > 0,
    };
  });
}

// ══════════ 3. DETECTOR DE CORTES ══════════
// Cruzar fundamentals + score + historico pra alertar antes de cortes
function detectDividendCutRisk(positions, scoreByTicker, fundamentalsMap) {
  var risks = [];

  for (var i = 0; i < positions.length; i++) {
    var pos = positions[i];
    var tk = pos.ticker;
    if (!tk) continue;
    if ((pos.quantidade || 0) <= 0) continue;
    if (pos.categoria === 'etf' || pos.categoria === 'rf') continue;

    var score = scoreByTicker && scoreByTicker[tk] ? scoreByTicker[tk] : null;
    var fund = fundamentalsMap && fundamentalsMap[tk] ? fundamentalsMap[tk] : null;

    var sinais = [];
    var riskScore = 0;

    // Sinal 1: Score de renda em queda
    if (score && score.tendencia < 30) {
      sinais.push('Tendencia de pagamento em queda');
      riskScore += 30;
    }

    // Sinal 2: Regularidade baixa
    if (score && score.regularidade < 50) {
      sinais.push('Paga em menos de 50% dos meses');
      riskScore += 20;
    }

    // Sinal 3: Payout ratio alto (quando disponivel)
    if (fund && fund.payoutRatio && fund.payoutRatio > 85) {
      sinais.push('Payout ratio em ' + fund.payoutRatio.toFixed(0) + '% (risco acima de 85%)');
      riskScore += 25;
    }

    // Sinal 4: Divida crescente
    if (fund && fund.divLiqEbitda && fund.divLiqEbitda > 3) {
      sinais.push('Divida liquida/EBITDA em ' + fund.divLiqEbitda.toFixed(1) + 'x (alto)');
      riskScore += 20;
    }

    // Sinal 5: Margem liquida caindo
    if (fund && fund.mLiquida && fund.mLiquida < 5) {
      sinais.push('Margem liquida baixa: ' + fund.mLiquida.toFixed(1) + '%');
      riskScore += 15;
    }

    // Sinal 6: Growth negativo forte
    if (score && score.growth12m < -30) {
      sinais.push('Renda caiu ' + Math.abs(score.growth12m).toFixed(0) + '% em 12 meses');
      riskScore += 30;
    }

    // Sinal 7: CAGR lucros negativo
    if (fund && fund.cagrLucros && fund.cagrLucros < -10) {
      sinais.push('Lucros caindo ' + Math.abs(fund.cagrLucros).toFixed(0) + '% a.a. (5 anos)');
      riskScore += 20;
    }

    if (sinais.length >= 2 && riskScore >= 40) {
      risks.push({
        ticker: tk,
        riskScore: Math.min(100, riskScore),
        severidade: riskScore >= 70 ? 'alta' : riskScore >= 50 ? 'media' : 'baixa',
        sinais: sinais,
        rendaMensal: score ? (score.sum12m || 0) / 12 : 0,
      });
    }
  }

  risks.sort(function(a, b) { return b.riskScore - a.riskScore; });
  return risks;
}

// ══════════ 4. SNOWBALL TRACKER ══════════
// Analise completa do efeito composto: quanto veio de reinvestimento,
// evolucao mes a mes, projecao futura, e comparacao de cenarios.
function computeSnowballEffect(userId, opts) {
  if (!opts) opts = {};
  var pfId = opts.portfolioId || undefined;

  return Promise.all([
    getOperacoes(userId, { portfolioId: pfId }),
    getProventos(userId, { limit: 5000, portfolioId: pfId }),
  ]).then(function(results) {
    var operacoes = (results[0] && results[0].data) || [];
    var proventos = (results[1] && results[1].data) || [];
    if (proventos.length === 0) return null;

    // ── Renda mensal historica ──
    var rendaPorMes = {};
    for (var rp = 0; rp < proventos.length; rp++) {
      var rpd = new Date(proventos[rp].data_pagamento);
      var rpk = rpd.getFullYear() + '-' + String(rpd.getMonth() + 1).padStart(2, '0');
      if (!rendaPorMes[rpk]) rendaPorMes[rpk] = 0;
      rendaPorMes[rpk] += proventos[rp].valor_total || 0;
    }

    // Renda media atual (ultimos 3m)
    var mkeys = Object.keys(rendaPorMes).sort().reverse().slice(0, 3);
    var rendaAtual = 0;
    for (var rk = 0; rk < mkeys.length; rk++) rendaAtual += rendaPorMes[mkeys[rk]];
    rendaAtual = mkeys.length > 0 ? rendaAtual / mkeys.length : 0;

    // ── Aportes vs Dividendos recebidos ──
    var totalCompras = 0;
    var totalVendas = 0;
    for (var o = 0; o < operacoes.length; o++) {
      var opVal = (operacoes[o].preco || 0) * (operacoes[o].quantidade || 0);
      if (operacoes[o].tipo === 'compra') totalCompras += opVal;
      if (operacoes[o].tipo === 'venda') totalVendas += opVal;
    }
    var aporteTotal = totalCompras - totalVendas;

    var totalProventos = 0;
    for (var tp = 0; tp < proventos.length; tp++) {
      totalProventos += proventos[tp].valor_total || 0;
    }

    // Patrimonio atual estimado (valor de mercado das posicoes)
    // Nao temos positions aqui, entao usamos aporteTotal como proxy conservador
    var patrimonioEstimado = Math.max(aporteTotal, totalCompras * 0.8);

    // Retorno sobre investimento: quanto recebeu de volta vs quanto investiu
    var retornoPct = aporteTotal > 0 ? (totalProventos / aporteTotal) * 100 : 0;

    // ── Evolucao mes a mes (renda acumulada + compounding) ──
    var mesesOrdenados = Object.keys(rendaPorMes).sort();
    var acumulado = 0;
    var evolucaoMensal = [];
    for (var em = 0; em < mesesOrdenados.length; em++) {
      acumulado += rendaPorMes[mesesOrdenados[em]];
      var parts = mesesOrdenados[em].split('-');
      evolucaoMensal.push({
        key: mesesOrdenados[em],
        mes: parseInt(parts[1]) - 1,
        ano: parseInt(parts[0]),
        valor: rendaPorMes[mesesOrdenados[em]],
        acumulado: acumulado,
      });
    }

    // ── Evolucao anual ──
    var porAno = {};
    for (var ea = 0; ea < evolucaoMensal.length; ea++) {
      var anoKey = evolucaoMensal[ea].ano;
      if (!porAno[anoKey]) porAno[anoKey] = { total: 0, meses: 0 };
      porAno[anoKey].total += evolucaoMensal[ea].valor;
      porAno[anoKey].meses++;
    }
    var anosKeys = Object.keys(porAno).sort();
    var evolucaoAnual = [];
    for (var eai = 0; eai < anosKeys.length; eai++) {
      var anoData = porAno[anosKeys[eai]];
      var mediaAno = anoData.meses > 0 ? anoData.total / anoData.meses : 0;
      var growthVsAnt = eai > 0 && evolucaoAnual[eai - 1].media > 0
        ? ((mediaAno / evolucaoAnual[eai - 1].media) - 1) * 100
        : 0;
      evolucaoAnual.push({
        ano: parseInt(anosKeys[eai]),
        total: anoData.total,
        media: mediaAno,
        meses: anoData.meses,
        growth: growthVsAnt,
      });
    }

    // ── Taxa de crescimento composto (CAGR da renda) ──
    // Comparar media do primeiro ano completo vs media do ultimo ano completo
    var primeiraRenda = evolucaoAnual.length > 0 ? evolucaoAnual[0].media : 0;
    var ultimaRenda = evolucaoAnual.length > 1 ? evolucaoAnual[evolucaoAnual.length - 1].media : rendaAtual;
    var numAnos = evolucaoAnual.length > 1 ? evolucaoAnual.length - 1 : 1;
    var cagr = primeiraRenda > 0 && ultimaRenda > 0
      ? (Math.pow(ultimaRenda / primeiraRenda, 1 / numAnos) - 1) * 100
      : 0;

    // ── Projecao futura: 3 cenarios (0%, 50%, 100% reinvestimento) ──
    // Yield estimado = renda anual / patrimonio estimado (nao sobre aportes)
    var yieldEstimado = patrimonioEstimado > 0 ? (rendaAtual * 12 / patrimonioEstimado) * 100 : 8;
    // Sanity: yield entre 2% e 15%
    if (yieldEstimado > 15) yieldEstimado = 15;
    if (yieldEstimado < 2) yieldEstimado = 2;
    var projecoes = [];
    var cenarios = [
      { label: 'Sem reinvestir', pct: 0 },
      { label: 'Reinvestir 50%', pct: 50 },
      { label: 'Reinvestir 100%', pct: 100 },
    ];
    for (var pc = 0; pc < cenarios.length; pc++) {
      var cen = cenarios[pc];
      var rendaProj = rendaAtual;
      var patrimonioExtra = 0;
      var pontos = [{ mes: 0, renda: rendaAtual }];
      for (var pm = 1; pm <= 60; pm++) { // 5 anos
        var reinveste = rendaProj * (cen.pct / 100);
        patrimonioExtra += reinveste;
        var rendaExtra = patrimonioExtra * yieldEstimado / 100 / 12;
        rendaProj = rendaAtual + rendaExtra;
        if (pm === 12 || pm === 24 || pm === 36 || pm === 60) {
          pontos.push({ mes: pm, renda: rendaProj });
        }
      }
      projecoes.push({
        label: cen.label,
        pctReinvest: cen.pct,
        pontos: pontos,
        renda12m: pontos.length > 1 ? pontos[1].renda : rendaAtual,
        renda36m: pontos.length > 3 ? pontos[3].renda : rendaAtual,
        renda60m: pontos.length > 4 ? pontos[4].renda : rendaAtual,
      });
    }

    // ── "Dividendos sobre dividendos" — efeito de 2a ordem ──
    // Quanto dos proventos recebidos foi efetivamente reinvestido (comprou mais cotas)?
    // Heuristica: se totalProventos < totalCompras, assume que proventos foram reinvestidos
    var proventosReinvestidos = Math.min(totalProventos, totalCompras);
    var renda2aOrdem = proventosReinvestidos * yieldEstimado / 100 / 12;

    // ── Velocidade do snowball ──
    // Quanto a renda cresce por mes (taxa de aceleracao)
    var ultimos6 = evolucaoMensal.slice(-6);
    var primeiros6 = evolucaoMensal.slice(0, 6);
    var mediaUlt6 = 0;
    var mediaPrim6 = 0;
    for (var u6 = 0; u6 < ultimos6.length; u6++) mediaUlt6 += ultimos6[u6].valor;
    mediaUlt6 = ultimos6.length > 0 ? mediaUlt6 / ultimos6.length : 0;
    for (var p6 = 0; p6 < primeiros6.length; p6++) mediaPrim6 += primeiros6[p6].valor;
    mediaPrim6 = primeiros6.length > 0 ? mediaPrim6 / primeiros6.length : 0;
    var aceleracao = mediaPrim6 > 0 ? ((mediaUlt6 / mediaPrim6) - 1) * 100 : 0;

    return {
      rendaAtual: rendaAtual,
      totalProventos: totalProventos,
      aporteTotal: aporteTotal,
      retornoPct: retornoPct,
      renda2aOrdem: renda2aOrdem,
      proventosReinvestidos: proventosReinvestidos,
      yieldEstimado: yieldEstimado,
      cagr: cagr,
      aceleracao: aceleracao,
      evolucaoMensal: evolucaoMensal,
      evolucaoAnual: evolucaoAnual,
      projecoes: projecoes,
    };
  });
}

// ══════════ 5. PILOTO AUTOMATICO ══════════
// Dado o valor dos dividendos recebidos, sugerir alocacao otima de reinvestimento.
// So sugere tickers reais com score de renda > 0 e DY razoavel.
function computeReinvestmentPlan(dividendosMes, positions, scoreByTicker, gaps) {
  if (!dividendosMes || dividendosMes <= 0) return null;
  if (!positions || positions.length === 0) return null;

  var sugestoes = [];
  var restante = dividendosMes;

  // Montar candidatos: tickers com bom score e DY calculavel
  var candidatos = [];
  for (var i = 0; i < positions.length; i++) {
    var pos = positions[i];
    if (!pos.ticker || (pos.quantidade || 0) <= 0) continue;
    if (pos.categoria === 'rf') continue;

    var score = scoreByTicker && scoreByTicker[pos.ticker] ? scoreByTicker[pos.ticker] : null;
    if (!score || score.score < 30) continue; // Ignorar tickers com score ruim

    var preco = pos.preco_atual || pos.pm || 0;
    if (preco <= 0) continue;

    // DY = renda 12m / valor de mercado atual (preco_atual * qty)
    var valorMercado = preco * (pos.quantidade || 1);
    var dy = valorMercado > 0 && score.sum12m ? (score.sum12m / valorMercado) * 100 : 0;

    // Sanity check: DY fora da faixa razoavel por categoria
    var maxDy = pos.categoria === 'fii' ? 18 : 12;
    if (dy > maxDy) dy = 0;

    candidatos.push({
      ticker: pos.ticker,
      preco: preco,
      score: score.score,
      regularidade: score.regularidade || 0,
      categoria: pos.categoria,
      dy: dy,
    });
  }

  if (candidatos.length === 0) return null;

  // Ordenar: score alto + regularidade alta + DY razoavel
  candidatos.sort(function(a, b) {
    var scoreA = a.score * 0.4 + a.regularidade * 0.3 + Math.min(15, a.dy) * 2;
    var scoreB = b.score * 0.4 + b.regularidade * 0.3 + Math.min(15, b.dy) * 2;
    return scoreB - scoreA;
  });

  // Alocar nos top 3 candidatos
  var topN = Math.min(3, candidatos.length);
  for (var t = 0; t < topN; t++) {
    if (restante <= 30) break;
    var cand = candidatos[t];
    var alocPct = t === 0 ? 0.5 : t === 1 ? 0.3 : 0.2;
    var alocValor = Math.min(restante, dividendosMes * alocPct);
    var qtdCotas = Math.floor(alocValor / cand.preco);
    if (qtdCotas <= 0) continue;
    var valorReal = qtdCotas * cand.preco;

    var motivo = 'Score ' + cand.score.toFixed(0) + '/100';
    if (cand.regularidade >= 80) motivo = motivo + ', paga regularmente';
    if (cand.dy > 0) motivo = motivo + ', DY ' + cand.dy.toFixed(1) + '%';
    sugestoes.push({
      tipo: 'reinvestir',
      ticker: cand.ticker,
      qtdCotas: qtdCotas,
      precoUnitario: cand.preco,
      valor: valorReal,
      score: cand.score,
      regularidade: cand.regularidade,
      dy: cand.dy,
      motivo: motivo,
    });
    restante -= valorReal;
  }

  // Calcular renda adicional estimada
  // Se investir X, e o yield medio da carteira eh Y% a.a., renda mensal = X * Y / 12
  var totalAlocado = dividendosMes - restante;
  // Usar yield medio dos candidatos sugeridos (nao assumir 10% fixo)
  var yieldMedio = 0;
  var yieldCount = 0;
  for (var yi = 0; yi < sugestoes.length; yi++) {
    if (sugestoes[yi].dy > 0) { yieldMedio += sugestoes[yi].dy; yieldCount++; }
  }
  yieldMedio = yieldCount > 0 ? yieldMedio / yieldCount : 8;
  var rendaAdicionalMes = totalAlocado * yieldMedio / 100 / 12;
  // Em 12 meses de reinvestimento mensal: soma geometrica
  // Cada mes reinveste dividendosMes, que gera yield. Total = sum(i=1..12) dividendosMes * yield/12 * (12-i)/12
  var rendaAdicional12m = 0;
  for (var ri = 0; ri < 12; ri++) {
    rendaAdicional12m += dividendosMes * yieldMedio / 100 / 12 * (12 - ri) / 12;
  }

  return {
    dividendosMes: dividendosMes,
    sugestoes: sugestoes,
    totalAlocado: totalAlocado,
    restante: restante,
    rendaAdicionalMes: rendaAdicionalMes,
    rendaAdicional12m: rendaAdicional12m,
  };
}

// ══════════ 6. FIRE MILESTONES ══════════
// Jornada de independencia financeira com marcos proporcionais a meta do usuario
function computeFireMilestones(rendaAtualMensal, metaMensal, growthAnual) {
  if (!metaMensal || metaMensal <= 0) metaMensal = 20000;
  if (!growthAnual || growthAnual <= 0) growthAnual = 15;
  var renda = rendaAtualMensal || 0;

  // Gerar marcos proporcionais a meta do usuario
  function fmtR(v) { return 'R$ ' + Math.round(v).toLocaleString('pt-BR'); }
  var marcosRelevantes = [
    { valor: Math.round(metaMensal * 0.05), label: 'Primeiro passo (5%)', emoji: 'seedling' },
    { valor: Math.round(metaMensal * 0.10), label: 'Decolando (10%)', emoji: 'sprout' },
    { valor: Math.round(metaMensal * 0.25), label: 'Um quarto do caminho', emoji: 'shield-checkmark' },
    { valor: Math.round(metaMensal * 0.50), label: 'Metade da meta', emoji: 'rocket' },
    { valor: Math.round(metaMensal * 0.75), label: 'Quase la (75%)', emoji: 'flame' },
    { valor: Math.round(metaMensal * 1.00), label: 'Meta atingida!', emoji: 'trophy' },
    { valor: Math.round(metaMensal * 1.50), label: 'Alem da meta (150%)', emoji: 'star' },
  ];
  // Remover duplicatas (ex: meta 1000 → 5% = 50 e 10% = 100 sao diferentes)
  var seen = {};
  var filtrados = [];
  for (var fi = 0; fi < marcosRelevantes.length; fi++) {
    var val = marcosRelevantes[fi].valor;
    if (val <= 0 || seen[val]) continue;
    seen[val] = true;
    filtrados.push(marcosRelevantes[fi]);
  }
  marcosRelevantes = filtrados;

  var now = new Date();
  var growthMensal = Math.pow(1 + growthAnual / 100, 1 / 12) - 1;

  var milestones = [];
  for (var j = 0; j < marcosRelevantes.length; j++) {
    var marco = marcosRelevantes[j];
    var atingido = renda >= marco.valor;
    var dataEstimada = null;

    if (!atingido && renda > 0 && growthMensal > 0) {
      // Meses ate atingir: renda * (1+g)^n = marco.valor → n = ln(marco/renda) / ln(1+g)
      var meses = Math.ceil(Math.log(marco.valor / renda) / Math.log(1 + growthMensal));
      if (meses > 0 && meses < 360) {
        var dt = new Date(now);
        dt.setMonth(dt.getMonth() + meses);
        dataEstimada = MESES[dt.getMonth()] + '/' + dt.getFullYear();
      }
    }

    milestones.push({
      valor: marco.valor,
      label: marco.label,
      icon: marco.emoji,
      atingido: atingido,
      dataEstimada: dataEstimada,
    });
  }

  // Progresso geral
  var progressoPct = metaMensal > 0 ? Math.min(100, (renda / metaMensal) * 100) : 0;

  // Proximo milestone
  var proximo = null;
  for (var p = 0; p < milestones.length; p++) {
    if (!milestones[p].atingido) { proximo = milestones[p]; break; }
  }

  return {
    rendaAtual: renda,
    meta: metaMensal,
    progressoPct: progressoPct,
    milestones: milestones,
    proximo: proximo,
  };
}

module.exports = {
  computeIncomeXray: computeIncomeXray,
  computeIncomeCoverage: computeIncomeCoverage,
  detectDividendCutRisk: detectDividendCutRisk,
  computeSnowballEffect: computeSnowballEffect,
  computeReinvestmentPlan: computeReinvestmentPlan,
  computeFireMilestones: computeFireMilestones,
};
