import { supabase } from '../config/supabase';
import { enrichPositionsWithPrices } from './priceService';

// ═══════════ PROFILES ═══════════
export async function getProfile(userId) {
  var result = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  return { data: result.data, error: result.error };
}

export async function updateProfile(userId, updates) {
  var payload = { id: userId, updated_at: new Date().toISOString() };
  var keys = Object.keys(updates);
  for (var i = 0; i < keys.length; i++) {
    payload[keys[i]] = updates[keys[i]];
  }
  var result = await supabase
    .from('profiles')
    .upsert(payload);
  return { data: result.data, error: result.error };
}

// ═══════════ OPERAÇÕES ═══════════
export async function getOperacoes(userId, filters) {
  if (!filters) filters = {};
  var query = supabase
    .from('operacoes')
    .select('*')
    .eq('user_id', userId)
    .order('data', { ascending: false });

  if (filters.tipo) query = query.eq('tipo', filters.tipo);
  if (filters.limit) query = query.limit(filters.limit);

  var result = await query;
  var data = result.data || [];
  if (filters.ticker) {
    var normalTicker = filters.ticker.toUpperCase().trim();
    data = data.filter(function(op) {
      return (op.ticker || '').toUpperCase().trim() === normalTicker;
    });
  }
  return { data: data, error: result.error };
}

export async function addOperacao(userId, operacao) {
  var payload = { user_id: userId };
  var keys = Object.keys(operacao);
  for (var i = 0; i < keys.length; i++) {
    payload[keys[i]] = operacao[keys[i]];
  }
  var result = await supabase
    .from('operacoes')
    .insert(payload)
    .select()
    .single();
  return { data: result.data, error: result.error };
}

export async function deleteOperacao(id) {
  var result = await supabase
    .from('operacoes')
    .delete()
    .eq('id', id);
  return { error: result.error };
}

// ═══════════ POSIÇÕES (computed view) ═══════════
export async function getPositions(userId) {
  var result = await supabase
    .from('operacoes')
    .select('*')
    .eq('user_id', userId)
    .in('tipo', ['compra', 'venda'])
    .order('data', { ascending: true });

  if (result.error) return { data: [], error: result.error };

  var ops = result.data || [];
  var positions = {};
  for (var i = 0; i < ops.length; i++) {
    var op = ops[i];
    var tickerKey = (op.ticker || '').toUpperCase().trim();
    if (!positions[tickerKey]) {
      positions[tickerKey] = {
        ticker: tickerKey,
        categoria: op.categoria,
        quantidade: 0,
        custo_total: 0,
        pm: 0,
        por_corretora: {},
      };
    }
    var p = positions[tickerKey];
    var corr = op.corretora || 'Sem corretora';
    if (!p.por_corretora[corr]) {
      p.por_corretora[corr] = 0;
    }
    if (op.tipo === 'compra') {
      var custos = (op.custo_corretagem || 0) + (op.custo_emolumentos || 0) + (op.custo_impostos || 0);
      p.custo_total += op.quantidade * op.preco + custos;
      p.quantidade += op.quantidade;
      p.por_corretora[corr] += op.quantidade;
    } else {
      p.quantidade -= op.quantidade;
      p.por_corretora[corr] -= op.quantidade;
    }
    p.pm = p.quantidade > 0 ? p.custo_total / p.quantidade : 0;
  }

  var tickers = Object.keys(positions);
  var resultArr = [];
  for (var j = 0; j < tickers.length; j++) {
    if (positions[tickers[j]].quantidade > 0) {
      resultArr.push(positions[tickers[j]]);
    }
  }
  return { data: resultArr, error: null };
}

// ═══════════ PROVENTOS ═══════════
export async function getProventos(userId, filters) {
  if (!filters) filters = {};
  var query = supabase
    .from('proventos')
    .select('*')
    .eq('user_id', userId)
    .order('data_pagamento', { ascending: false });

  if (filters.limit) query = query.limit(filters.limit);

  var result = await query;
  var data = result.data || [];
  if (filters.ticker) {
    var normalTicker = filters.ticker.toUpperCase().trim();
    data = data.filter(function(p) {
      return (p.ticker || '').toUpperCase().trim() === normalTicker;
    });
  }
  return { data: data, error: result.error };
}

export async function addProvento(userId, provento) {
  var payload = { user_id: userId };
  var keys = Object.keys(provento);
  for (var i = 0; i < keys.length; i++) {
    payload[keys[i]] = provento[keys[i]];
  }
  var result = await supabase
    .from('proventos')
    .insert(payload)
    .select()
    .single();
  return { data: result.data, error: result.error };
}

// ═══════════ OPÇÕES ═══════════
export async function getOpcoes(userId) {
  var result = await supabase
    .from('opcoes')
    .select('*')
    .eq('user_id', userId)
    .order('vencimento', { ascending: true });
  return { data: result.data || [], error: result.error };
}

export async function addOpcao(userId, opcao) {
  var payload = { user_id: userId };
  var keys = Object.keys(opcao);
  for (var i = 0; i < keys.length; i++) {
    payload[keys[i]] = opcao[keys[i]];
  }
  var result = await supabase
    .from('opcoes')
    .insert(payload)
    .select()
    .single();
  return { data: result.data, error: result.error };
}

// ═══════════ RENDA FIXA ═══════════
export async function getRendaFixa(userId) {
  var result = await supabase
    .from('renda_fixa')
    .select('*')
    .eq('user_id', userId)
    .order('vencimento', { ascending: true });
  return { data: result.data || [], error: result.error };
}

export async function addRendaFixa(userId, rf) {
  var payload = { user_id: userId };
  var keys = Object.keys(rf);
  for (var i = 0; i < keys.length; i++) {
    payload[keys[i]] = rf[keys[i]];
  }
  var result = await supabase
    .from('renda_fixa')
    .insert(payload)
    .select()
    .single();
  return { data: result.data, error: result.error };
}

export async function deleteRendaFixa(id) {
  var result = await supabase
    .from('renda_fixa')
    .delete()
    .eq('id', id);
  return { error: result.error };
}

// ═══════════ PROVENTOS DELETE ═══════════
export async function deleteProvento(id) {
  var result = await supabase
    .from('proventos')
    .delete()
    .eq('id', id);
  return { error: result.error };
}

// ═══════════ CORRETORAS ═══════════
export async function getUserCorretoras(userId) {
  var result = await supabase
    .from('user_corretoras')
    .select('*')
    .eq('user_id', userId)
    .order('count', { ascending: false });
  return { data: result.data || [], error: result.error };
}

export async function incrementCorretora(userId, name) {
  var existing = await supabase
    .from('user_corretoras')
    .select('count')
    .eq('user_id', userId)
    .eq('name', name)
    .single();

  if (existing.data) {
    await supabase
      .from('user_corretoras')
      .update({ count: existing.data.count + 1 })
      .eq('user_id', userId)
      .eq('name', name);
  } else {
    await supabase
      .from('user_corretoras')
      .insert({ user_id: userId, name: name, count: 1 });
  }
}

// ═══════════ SALDOS CORRETORA ═══════════
export async function getSaldos(userId) {
  var result = await supabase
    .from('saldos_corretora')
    .select('*')
    .eq('user_id', userId);
  return { data: result.data || [], error: result.error };
}

// ═══════════ ALERTAS CONFIG ═══════════
// Schema real: id (bigint PK), user_id, tipo (text), ativo (bool), threshold (numeric), created_at, exercicio_auto (bool)
// Cada alerta eh uma row com tipo='descobertas', tipo='margem', etc.
// Funcoes convertem multi-row <-> objeto flat { descobertas: true, margem_threshold: '80', exercicio_auto: false, ... }

export async function getAlertasConfig(userId) {
  var result = await supabase
    .from('alertas_config')
    .select('*')
    .eq('user_id', userId);
  if (result.error) return { data: {}, error: result.error };
  var rows = result.data || [];
  var config = {};
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (!row.tipo) continue;
    config[row.tipo] = !!row.ativo;
    if (row.threshold != null) {
      config[row.tipo + '_threshold'] = String(row.threshold);
    }
  }
  return { data: config, error: null };
}

export async function updateAlertasConfig(userId, config) {
  var keys = Object.keys(config);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (k === 'user_id' || k.indexOf('_threshold') !== -1) continue;

    var ativo = !!config[k];
    var threshold = null;
    if (config[k + '_threshold'] != null) {
      threshold = parseFloat(config[k + '_threshold']) || null;
    }

    // Checar se row ja existe
    var existing = await supabase
      .from('alertas_config')
      .select('id')
      .eq('user_id', userId)
      .eq('tipo', k)
      .maybeSingle();

    if (existing.data) {
      await supabase
        .from('alertas_config')
        .update({ ativo: ativo, threshold: threshold })
        .eq('id', existing.data.id);
    } else {
      await supabase
        .from('alertas_config')
        .insert({ user_id: userId, tipo: k, ativo: ativo, threshold: threshold });
    }
  }
  return { data: null, error: null };
}

// ═══════════ DASHBOARD AGGREGATES ═══════════
export async function getDashboard(userId) {
  try {
    var results = await Promise.all([
      getPositions(userId),
      getProventos(userId, { limit: 200 }),
      getOpcoes(userId),
      getRendaFixa(userId),
      getSaldos(userId),
      getProfile(userId),
    ]);

    var positions = results[0];
    var proventos = results[1];
    var opcoes = results[2];
    var rendaFixa = results[3];
    var saldos = results[4];
    var profile = results[5];

    var now = new Date();
    var mesAtual = now.getMonth();
    var anoAtual = now.getFullYear();

    // ── Posições ──
    var posDataRaw = positions.data || [];

    // Buscar preços atuais e calcular variação
    var posData;
    try {
      posData = await enrichPositionsWithPrices(posDataRaw);
    } catch (e) {
      console.warn('Price fetch failed, using positions without prices');
      posData = posDataRaw;
    }

    var patrimonioAcoes = 0;
    for (var pi = 0; pi < posData.length; pi++) {
      patrimonioAcoes += posData[pi].quantidade * (posData[pi].preco_atual || posData[pi].pm);
    }

    // ── Renda Fixa ──
    var rfData = rendaFixa.data || [];
    var rfTotalAplicado = 0;
    for (var ri = 0; ri < rfData.length; ri++) {
      rfTotalAplicado += (rfData[ri].valor_aplicado || 0);
    }

    // Rendimento estimado mensal da RF
    var rfRendaMensal = 0;
    for (var rmi = 0; rmi < rfData.length; rmi++) {
      var taxa = rfData[rmi].taxa || 0;
      var valor = rfData[rmi].valor_aplicado || 0;
      rfRendaMensal += (valor * taxa / 100 / 12);
    }

    // ── Patrimônio total ──
    var patrimonio = patrimonioAcoes + rfTotalAplicado;

    // ── Mes anterior ──
    var mesAnterior = mesAtual === 0 ? 11 : mesAtual - 1;
    var anoMesAnterior = mesAtual === 0 ? anoAtual - 1 : anoAtual;

    // ── Dividendos do mês ──
    var proventosData = proventos.data || [];
    var dividendosMes = 0;
    var dividendosMesAnterior = 0;
    for (var di = 0; di < proventosData.length; di++) {
      var dProv = new Date(proventosData[di].data_pagamento);
      var provVal = proventosData[di].valor_por_cota * proventosData[di].quantidade || 0;
      if (dProv.getMonth() === mesAtual && dProv.getFullYear() === anoAtual) {
        dividendosMes += provVal;
      } else if (dProv.getMonth() === mesAnterior && dProv.getFullYear() === anoMesAnterior) {
        dividendosMesAnterior += provVal;
      }
    }

    // ── Dividendos por categoria (mes atual e anterior) ──
    var dividendosCatMes = { acao: 0, fii: 0, etf: 0 };
    var dividendosCatMesAnt = { acao: 0, fii: 0, etf: 0 };
    var posCategoria = {};
    for (var pci = 0; pci < posDataRaw.length; pci++) {
      posCategoria[posDataRaw[pci].ticker] = posDataRaw[pci].categoria || 'acao';
    }
    for (var dci = 0; dci < proventosData.length; dci++) {
      var dcProv = new Date(proventosData[dci].data_pagamento);
      var dcVal = proventosData[dci].valor_por_cota * proventosData[dci].quantidade || 0;
      var dcCat = posCategoria[proventosData[dci].ticker] || 'acao';
      if (dcCat !== 'acao' && dcCat !== 'fii' && dcCat !== 'etf') dcCat = 'acao';
      if (dcProv.getMonth() === mesAtual && dcProv.getFullYear() === anoAtual) {
        dividendosCatMes[dcCat] += dcVal;
      } else if (dcProv.getMonth() === mesAnterior && dcProv.getFullYear() === anoMesAnterior) {
        dividendosCatMesAnt[dcCat] += dcVal;
      }
    }

    // ── Opções ──
    var todasOpcoes = opcoes.data || [];
    var opsAtivas = [];
    for (var oi = 0; oi < todasOpcoes.length; oi++) {
      if (new Date(todasOpcoes[oi].vencimento) > now) {
        opsAtivas.push(todasOpcoes[oi]);
      }
    }

    // Premios recebidos no mes (D+1 da data_abertura)
    var premiosMes = 0;
    var premiosMesAnterior = 0;
    for (var opi = 0; opi < todasOpcoes.length; opi++) {
      var opItem = todasOpcoes[opi];
      var opDir = opItem.direcao || 'venda';
      if (opDir !== 'venda' && opDir !== 'lancamento') continue;
      var opPremTotal = (opItem.premio || 0) * (opItem.quantidade || 0);
      if (opPremTotal <= 0) continue;

      // Data de recebimento = data_abertura + 1 dia (D+1)
      var dataRef = opItem.data_abertura || opItem.created_at || opItem.vencimento;
      var dReceb = new Date(dataRef);
      dReceb.setDate(dReceb.getDate() + 1);

      if (dReceb.getMonth() === mesAtual && dReceb.getFullYear() === anoAtual) {
        premiosMes += opPremTotal;
      } else if (dReceb.getMonth() === mesAnterior && dReceb.getFullYear() === anoMesAnterior) {
        premiosMesAnterior += opPremTotal;
      }
    }

    // Opções que vencem em 30 dias
    var em30dias = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    var opsProxVenc = [];
    for (var ov = 0; ov < opsAtivas.length; ov++) {
      if (new Date(opsAtivas[ov].vencimento) <= em30dias) {
        opsProxVenc.push(opsAtivas[ov]);
      }
    }

    // RF que vence em 90 dias
    var em90dias = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    var rfProxVenc = [];
    for (var rv = 0; rv < rfData.length; rv++) {
      var vencDate = new Date(rfData[rv].vencimento);
      if (vencDate > now && vencDate <= em90dias) {
        rfProxVenc.push(rfData[rv]);
      }
    }

    // ── Renda total do mês ──
    var rendaTotalMes = dividendosMes + premiosMes + rfRendaMensal;
    var rendaTotalMesAnterior = dividendosMesAnterior + premiosMesAnterior + rfRendaMensal;

    // ── Saldos ──
    var saldosData = saldos.data || [];
    var saldoTotal = 0;
    for (var si = 0; si < saldosData.length; si++) {
      saldoTotal += (saldosData[si].saldo || 0);
    }

    // ── Rentabilidade mensal estimada ──
    var rentabilidadeMes = patrimonio > 0
      ? (rendaTotalMes / patrimonio) * 100
      : 0;

    // ── Eventos reais ──
    var eventos = [];
    var diasSemana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

    for (var ei = 0; ei < opsProxVenc.length; ei++) {
      var oEvt = opsProxVenc[ei];
      var dEvt = new Date(oEvt.vencimento);
      eventos.push({
        data: oEvt.vencimento,
        dia: dEvt.getDate().toString(),
        diaSemana: diasSemana[dEvt.getDay()],
        titulo: (oEvt.tipo || 'Opção').toUpperCase() + ' ' + (oEvt.ticker_opcao || oEvt.ativo_base || ''),
        detalhe: 'Strike R$ ' + ((oEvt.strike || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + ' · ' + (oEvt.quantidade || 0) + ' lotes',
        tipo: 'opcao',
      });
    }

    for (var erf = 0; erf < rfProxVenc.length; erf++) {
      var rEvt = rfProxVenc[erf];
      var dRf = new Date(rEvt.vencimento);
      eventos.push({
        data: rEvt.vencimento,
        dia: dRf.getDate().toString(),
        diaSemana: diasSemana[dRf.getDay()],
        titulo: (rEvt.tipo || 'RF').toUpperCase() + ' ' + (rEvt.emissor || ''),
        detalhe: 'R$ ' + ((rEvt.valor_aplicado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + ' · ' + (rEvt.taxa || 0) + '% a.a.',
        tipo: 'rf',
      });
    }

    eventos.sort(function(a, b) { return new Date(a.data) - new Date(b.data); });

    // ── Histórico real do patrimônio ──
    var allOpsResult = await supabase
      .from('operacoes')
      .select('data, tipo, ticker, quantidade, preco, custo_corretagem, custo_emolumentos, custo_impostos')
      .eq('user_id', userId)
      .in('tipo', ['compra', 'venda'])
      .order('data', { ascending: true });

    var allOps = allOpsResult.data || [];
    var equityTimeline = [];
    var runningPositions = {};

    for (var ti = 0; ti < allOps.length; ti++) {
      var tOp = allOps[ti];
      var dateStr = tOp.data ? tOp.data.substring(0, 10) : null;
      if (!dateStr) continue;

      if (!runningPositions[tOp.ticker]) {
        runningPositions[tOp.ticker] = { qty: 0, custoTotal: 0 };
      }
      var pos = runningPositions[tOp.ticker];

      if (tOp.tipo === 'compra') {
        var tCustos = (tOp.custo_corretagem || 0) + (tOp.custo_emolumentos || 0) + (tOp.custo_impostos || 0);
        pos.custoTotal += tOp.quantidade * tOp.preco + tCustos;
        pos.qty += tOp.quantidade;
      } else if (tOp.tipo === 'venda') {
        if (pos.qty > 0) {
          var pmAtual = pos.custoTotal / pos.qty;
          pos.custoTotal -= tOp.quantidade * pmAtual;
        }
        pos.qty -= tOp.quantidade;
        if (pos.qty <= 0) { pos.qty = 0; pos.custoTotal = 0; }
      }

      var equityAtDate = 0;
      var rpKeys = Object.keys(runningPositions);
      for (var rk = 0; rk < rpKeys.length; rk++) {
        if (runningPositions[rpKeys[rk]].qty > 0) {
          equityAtDate += runningPositions[rpKeys[rk]].custoTotal;
        }
      }

      equityTimeline.push({ date: dateStr, value: equityAtDate });
    }

    // Collect all unique dates
    var allDatesObj = {};
    for (var ed = 0; ed < equityTimeline.length; ed++) {
      allDatesObj[equityTimeline[ed].date] = true;
    }
    for (var rd = 0; rd < rfData.length; rd++) {
      var rfDateStr = (rfData[rd].data_aplicacao || rfData[rd].created_at || '').substring(0, 10);
      if (rfDateStr) allDatesObj[rfDateStr] = true;
    }
    var todayStr = now.toISOString().substring(0, 10);
    allDatesObj[todayStr] = true;

    var sortedDates = Object.keys(allDatesObj).sort();

    // Dedup equity: keep last value per date
    var equityByDate = {};
    for (var eb = 0; eb < equityTimeline.length; eb++) {
      equityByDate[equityTimeline[eb].date] = equityTimeline[eb].value;
    }

    var patrimonioHistory = [];
    var lastEquity = 0;

    for (var sd = 0; sd < sortedDates.length; sd++) {
      var curDate = sortedDates[sd];
      if (equityByDate[curDate] !== undefined) {
        lastEquity = equityByDate[curDate];
      }

      var rfAtDate = 0;
      for (var rfd = 0; rfd < rfData.length; rfd++) {
        var rfDt = (rfData[rfd].data_aplicacao || rfData[rfd].created_at || '').substring(0, 10);
        if (rfDt && rfDt <= curDate) {
          rfAtDate += (rfData[rfd].valor_aplicado || 0);
        }
      }

      patrimonioHistory.push({ date: curDate, value: lastEquity + rfAtDate });
    }

    var metaMensal = (profile.data && profile.data.meta_mensal) ? profile.data.meta_mensal : 6000;

    return {
      patrimonio: patrimonio,
      patrimonioAcoes: patrimonioAcoes,
      rfTotalAplicado: rfTotalAplicado,
      rfRendaMensal: rfRendaMensal,
      dividendosMes: dividendosMes,
      premiosMes: premiosMes,
      rendaTotalMes: rendaTotalMes,
      rentabilidadeMes: rentabilidadeMes,
      opsAtivas: opsAtivas.length,
      opsProxVenc: opsProxVenc.length,
      meta: metaMensal,
      positions: posData,
      saldos: saldosData,
      saldoTotal: saldoTotal,
      rendaFixa: rfData,
      eventos: eventos,
      patrimonioHistory: patrimonioHistory,
      dividendosMesAnterior: dividendosMesAnterior,
      premiosMesAnterior: premiosMesAnterior,
      rendaTotalMesAnterior: rendaTotalMesAnterior,
      dividendosCatMes: dividendosCatMes,
      dividendosCatMesAnt: dividendosCatMesAnt,
    };
  } catch (err) {
    console.error('Dashboard error:', err);
    return {
      patrimonio: 0, patrimonioAcoes: 0, rfTotalAplicado: 0,
      rfRendaMensal: 0, dividendosMes: 0, premiosMes: 0,
      rendaTotalMes: 0, rentabilidadeMes: 0,
      opsAtivas: 0, opsProxVenc: 0, meta: 6000,
      positions: [], saldos: [], saldoTotal: 0,
      rendaFixa: [], eventos: [],
      patrimonioHistory: [],
      dividendosMesAnterior: 0, premiosMesAnterior: 0, rendaTotalMesAnterior: 0,
      dividendosCatMes: { acao: 0, fii: 0, etf: 0 },
      dividendosCatMesAnt: { acao: 0, fii: 0, etf: 0 },
    };
  }
}
