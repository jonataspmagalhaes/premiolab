import { supabase } from '../config/supabase';
import { enrichPositionsWithPrices } from './priceService';
import { fetchExchangeRates, convertToBRL } from './currencyService';

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
  var payload = { updated_at: new Date().toISOString() };
  var keys = Object.keys(updates);
  for (var i = 0; i < keys.length; i++) {
    payload[keys[i]] = updates[keys[i]];
  }
  var result = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', userId);
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
        mercado: op.mercado || 'BR',
        moeda: (op.mercado === 'INT') ? 'USD' : 'BRL',
        quantidade: 0,
        custo_total: 0,
        pm: 0,
        por_corretora: {},
        custo_por_corretora: {},
        total_comprado: 0,
        custo_compras: 0,
        total_vendido: 0,
        receita_vendas: 0,
        pl_realizado: 0,
        pl_realizado_ir: 0,
        taxa_cambio_media: 0,
        _custo_brl: 0,
      };
    }
    var p = positions[tickerKey];
    var corr = op.corretora || 'Sem corretora';
    if (!p.por_corretora[corr]) {
      p.por_corretora[corr] = 0;
      p.custo_por_corretora[corr] = 0;
    }
    if (op.tipo === 'compra') {
      var custos = (op.custo_corretagem || 0) + (op.custo_emolumentos || 0) + (op.custo_impostos || 0);
      var custoOp = op.quantidade * op.preco + custos;
      p.custo_total += custoOp;
      p.quantidade += op.quantidade;
      p.por_corretora[corr] += op.quantidade;
      p.custo_por_corretora[corr] += custoOp;
      p.total_comprado += op.quantidade;
      p.custo_compras += custoOp;
      // Acumular custo em BRL para INT (usando taxa_cambio da operacao)
      if ((op.mercado === 'INT') && op.taxa_cambio) {
        p._custo_brl += custoOp * op.taxa_cambio;
      }
    } else {
      var custosVenda = (op.custo_corretagem || 0) + (op.custo_emolumentos || 0) + (op.custo_impostos || 0);
      var receitaLiq = op.quantidade * op.preco - custosVenda;
      // PM por corretora para P&L real
      var pmCorr = p.por_corretora[corr] > 0 ? p.custo_por_corretora[corr] / p.por_corretora[corr] : p.pm;
      p.pl_realizado += op.quantidade * (op.preco - pmCorr) - custosVenda;
      // PM geral para IR
      p.pl_realizado_ir += op.quantidade * (op.preco - p.pm) - custosVenda;
      p.receita_vendas += receitaLiq;
      p.total_vendido += op.quantidade;
      // Reduzir custo proporcional ao PM da corretora
      p.custo_por_corretora[corr] -= op.quantidade * pmCorr;
      p.por_corretora[corr] -= op.quantidade;
      // Reduzir custo geral pelo PM geral
      p.custo_total -= op.quantidade * p.pm;
      p.quantidade -= op.quantidade;
    }
    p.pm = p.quantidade > 0 ? p.custo_total / p.quantidade : 0;
    // Calcular taxa_cambio_media para INT
    if (p.mercado === 'INT' && p.custo_total > 0 && p._custo_brl > 0) {
      p.taxa_cambio_media = p._custo_brl / p.custo_total;
    }
  }

  var tickers = Object.keys(positions);
  var resultArr = [];
  var encerradas = [];
  for (var j = 0; j < tickers.length; j++) {
    var pos = positions[tickers[j]];
    if (pos.quantidade > 0) {
      resultArr.push(pos);
    } else if (pos.total_vendido > 0) {
      encerradas.push(pos);
    }
  }
  return { data: resultArr, encerradas: encerradas, error: null };
}

// ═══════════ PROVENTOS ═══════════
export async function getProventos(userId, filters) {
  if (!filters) filters = {};
  var query = supabase
    .from('proventos')
    .select('*')
    .eq('user_id', userId)
    .order('data_pagamento', { ascending: false });

  if (filters.limit) {
    var pLimit = filters.limit;
    var pOffset = filters.offset || 0;
    query = query.range(pOffset, pOffset + pLimit - 1);
  }

  var result = await query;
  var data = result.data || [];
  if (filters.ticker) {
    var normalTicker = filters.ticker.toUpperCase().trim();
    data = data.filter(function(p) {
      return (p.ticker || '').toUpperCase().trim() === normalTicker;
    });
  }
  // Normalizar: DB tem coluna 'tipo', UI espera 'tipo_provento'; computar valor_total
  for (var j = 0; j < data.length; j++) {
    if (data[j].tipo && !data[j].tipo_provento) {
      data[j].tipo_provento = data[j].tipo;
    }
    if (data[j].valor_total == null) {
      data[j].valor_total = (data[j].valor_por_cota || 0) * (data[j].quantidade || 0);
    }
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

export async function upsertSaldo(userId, data) {
  var payload = {
    user_id: userId,
    corretora: (data.corretora || '').toUpperCase().trim(),
    saldo: data.saldo,
  };
  if (data.moeda) {
    payload.moeda = data.moeda;
  }
  var result = await supabase
    .from('saldos_corretora')
    .upsert(payload, { onConflict: 'user_id,corretora,moeda' });
  return { error: result.error };
}

export async function deleteSaldo(id) {
  var result = await supabase
    .from('saldos_corretora')
    .delete()
    .eq('id', id);
  return { error: result.error };
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

// ═══════════ REBALANCE TARGETS ═══════════
export async function getRebalanceTargets(userId) {
  try {
    var result = await supabase
      .from('rebalance_targets')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    return { data: result.data, error: result.error };
  } catch (e) {
    return { data: null, error: e };
  }
}

export async function upsertRebalanceTargets(userId, targets) {
  try {
    var payload = {
      user_id: userId,
      class_targets: targets.class_targets,
      sector_targets: targets.sector_targets,
      ticker_targets: targets.ticker_targets,
      updated_at: new Date().toISOString(),
    };
    var result = await supabase
      .from('rebalance_targets')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single();
    return { data: result.data, error: result.error };
  } catch (e) {
    return { data: null, error: e };
  }
}

// ═══════════ INDICADORES TÉCNICOS ═══════════
export async function getIndicators(userId) {
  var result = await supabase
    .from('indicators')
    .select('*')
    .eq('user_id', userId);
  return { data: result.data || [], error: result.error };
}

export async function getIndicatorByTicker(userId, ticker) {
  var result = await supabase
    .from('indicators')
    .select('*')
    .eq('user_id', userId)
    .eq('ticker', ticker.toUpperCase().trim())
    .maybeSingle();
  return { data: result.data, error: result.error };
}

export async function upsertIndicator(userId, indicator) {
  var payload = { user_id: userId };
  var keys = Object.keys(indicator);
  for (var i = 0; i < keys.length; i++) {
    payload[keys[i]] = indicator[keys[i]];
  }
  var result = await supabase
    .from('indicators')
    .upsert(payload, { onConflict: 'user_id,ticker' })
    .select()
    .single();
  return { data: result.data, error: result.error };
}

export async function upsertIndicatorsBatch(userId, indicatorsList) {
  var payloads = [];
  for (var i = 0; i < indicatorsList.length; i++) {
    var payload = { user_id: userId };
    var keys = Object.keys(indicatorsList[i]);
    for (var j = 0; j < keys.length; j++) {
      payload[keys[j]] = indicatorsList[i][keys[j]];
    }
    payloads.push(payload);
  }
  var result = await supabase
    .from('indicators')
    .upsert(payloads, { onConflict: 'user_id,ticker' })
    .select();
  return { data: result.data || [], error: result.error };
}

// ═══════════ PATRIMONIO SNAPSHOTS ═══════════
export async function getPatrimonioSnapshots(userId) {
  var result = await supabase
    .from('patrimonio_snapshots')
    .select('*')
    .eq('user_id', userId)
    .order('data', { ascending: true });
  return result.data || [];
}

export async function upsertPatrimonioSnapshot(userId, data, valor) {
  var result = await supabase
    .from('patrimonio_snapshots')
    .upsert({
      user_id: userId,
      data: data,
      valor: valor,
    }, { onConflict: 'user_id,data' });
  return { error: result.error };
}

// ═══════════ MOVIMENTAÇÕES (Fluxo de Caixa) ═══════════

function buildMovDescricao(categoria, ticker, extra) {
  var MAP = {
    compra_ativo: 'Compra ', venda_ativo: 'Venda ',
    premio_opcao: 'Prêmio ', recompra_opcao: 'Recompra ',
    exercicio_opcao: 'Exercício ', dividendo: 'Dividendo ',
    jcp: 'JCP ', rendimento_fii: 'Rendimento ',
    rendimento_rf: 'Rendimento RF ',
    deposito: 'Depósito ', retirada: 'Retirada ',
    transferencia: 'Transferência ',
    salario: 'Salário ', despesa_fixa: 'Despesa fixa ',
    despesa_variavel: 'Despesa variável ',
    ajuste_manual: 'Ajuste ',
  };
  return (MAP[categoria] || '') + (ticker || '') + (extra ? ' ' + extra : '');
}

export { buildMovDescricao };

// ═══════════ RECONCILIACAO ═══════════
export async function reconciliarVendasAntigas(userId) {
  // 1. Buscar todas as vendas
  var opsResult = await getOperacoes(userId, { tipo: 'venda' });
  var vendas = (opsResult.data || []).filter(function(op) { return op.tipo === 'venda'; });

  // 2. Buscar movimentacoes de venda_ativo existentes
  var movsResult = await getMovimentacoes(userId, { categoria: 'venda_ativo' });
  var movsExist = movsResult.data || [];

  // 3. Montar set de chaves ja reconciliadas: ticker+data+valor_arredondado
  var jaReconciliado = {};
  for (var m = 0; m < movsExist.length; m++) {
    var mv = movsExist[m];
    var chave = (mv.ticker || '').toUpperCase() + '|' + (mv.data || '') + '|' + Math.round((mv.valor || 0) * 100);
    jaReconciliado[chave] = true;
  }

  // 4. Encontrar vendas sem movimentacao correspondente
  var pendentes = [];
  for (var v = 0; v < vendas.length; v++) {
    var op = vendas[v];
    var ticker = (op.ticker || '').toUpperCase().trim();
    var data = op.data || '';
    var custos = (op.custo_corretagem || 0) + (op.custo_emolumentos || 0) + (op.custo_impostos || 0);
    var totalVenda = op.quantidade * op.preco - custos;
    var chaveOp = ticker + '|' + data + '|' + Math.round(totalVenda * 100);
    if (!jaReconciliado[chaveOp]) {
      pendentes.push({
        op: op,
        ticker: ticker,
        data: data,
        valor: totalVenda,
        corretora: op.corretora || '',
      });
    }
  }

  // 5. Creditar cada venda pendente na conta da corretora
  var creditadas = 0;
  var erros = 0;
  for (var p = 0; p < pendentes.length; p++) {
    var item = pendentes[p];
    if (!item.corretora || item.valor <= 0) { erros++; continue; }
    try {
      await addMovimentacaoComSaldo(userId, {
        conta: item.corretora,
        tipo: 'entrada',
        categoria: 'venda_ativo',
        valor: item.valor,
        descricao: 'Venda ' + item.ticker + ' x' + item.op.quantidade + ' (reconciliação)',
        ticker: item.ticker,
        referencia_tipo: 'operacao',
        data: item.data,
      });
      creditadas++;
    } catch (e) {
      console.warn('Reconciliação falhou para', item.ticker, e);
      erros++;
    }
  }

  return { total: vendas.length, pendentes: pendentes.length, creditadas: creditadas, erros: erros };
}

export async function recalcularSaldos(userId) {
  // 1. Buscar todas as movimentacoes
  var movsResult = await getMovimentacoes(userId, {});
  var allMovs = movsResult.data || [];

  // 2. Somar por conta
  var saldoPorConta = {};
  for (var i = 0; i < allMovs.length; i++) {
    var m = allMovs[i];
    var conta = m.conta || '';
    if (!conta) continue;
    if (!saldoPorConta[conta]) saldoPorConta[conta] = 0;
    if (m.tipo === 'entrada') {
      saldoPorConta[conta] += (m.valor || 0);
    } else if (m.tipo === 'saida') {
      saldoPorConta[conta] -= (m.valor || 0);
    }
  }

  // 3. Atualizar cada conta
  var contas = Object.keys(saldoPorConta);
  var atualizadas = 0;
  for (var c = 0; c < contas.length; c++) {
    var nome = contas[c];
    var novoSaldo = saldoPorConta[nome];
    // Buscar conta existente
    var contaResult = await supabase
      .from('saldos_corretora')
      .select('*')
      .eq('user_id', userId)
      .eq('corretora', nome)
      .maybeSingle();
    if (contaResult.data) {
      await supabase
        .from('saldos_corretora')
        .update({ saldo: novoSaldo, updated_at: new Date().toISOString() })
        .eq('id', contaResult.data.id);
      atualizadas++;
    }
  }

  return { contas: contas.length, atualizadas: atualizadas, saldos: saldoPorConta };
}

export async function getMovimentacoes(userId, filters) {
  if (!filters) filters = {};
  var query = supabase
    .from('movimentacoes')
    .select('*')
    .eq('user_id', userId)
    .order('data', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters.conta) query = query.eq('conta', filters.conta);
  if (filters.tipo) query = query.eq('tipo', filters.tipo);
  if (filters.categoria) query = query.eq('categoria', filters.categoria);
  if (filters.dataInicio) query = query.gte('data', filters.dataInicio);
  if (filters.dataFim) query = query.lte('data', filters.dataFim);
  if (filters.ticker) query = query.eq('ticker', filters.ticker.toUpperCase().trim());
  var limit = filters.limit || 1000;
  var offset = filters.offset || 0;
  query = query.range(offset, offset + limit - 1);

  var result = await query;
  return { data: result.data || [], error: result.error };
}

export async function addMovimentacao(userId, mov) {
  var payload = { user_id: userId };
  var keys = Object.keys(mov);
  for (var i = 0; i < keys.length; i++) {
    payload[keys[i]] = mov[keys[i]];
  }
  var result = await supabase
    .from('movimentacoes')
    .insert(payload)
    .select()
    .single();
  return { data: result.data, error: result.error };
}

export async function addMovimentacaoComSaldo(userId, mov) {
  // Normalizar nome da conta para uppercase (consistente com AddContaScreen)
  var contaNorm = (mov.conta || '').toUpperCase().trim();
  mov.conta = contaNorm;

  // 1. Get current saldo (match by conta + moeda when moeda provided)
  var saldoQuery = supabase
    .from('saldos_corretora')
    .select('*')
    .eq('user_id', userId)
    .eq('corretora', contaNorm);
  if (mov.moeda) {
    saldoQuery = saldoQuery.eq('moeda', mov.moeda);
  }
  var saldoResult = await saldoQuery.maybeSingle();

  var saldoAtual = (saldoResult.data && saldoResult.data.saldo) || 0;
  var novoSaldo;
  if (mov.tipo === 'entrada') {
    novoSaldo = saldoAtual + (mov.valor || 0);
  } else {
    novoSaldo = saldoAtual - (mov.valor || 0);
  }

  // 2. Insert movimentacao with saldo_apos
  var payload = { user_id: userId, saldo_apos: novoSaldo };
  var keys = Object.keys(mov);
  for (var i = 0; i < keys.length; i++) {
    payload[keys[i]] = mov[keys[i]];
  }
  var movResult = await supabase
    .from('movimentacoes')
    .insert(payload)
    .select()
    .single();

  if (movResult.error) return { data: null, error: movResult.error };

  // 3. Update saldo
  if (saldoResult.data) {
    await supabase
      .from('saldos_corretora')
      .update({ saldo: novoSaldo, updated_at: new Date().toISOString() })
      .eq('id', saldoResult.data.id);
  } else {
    var insertPayload = { user_id: userId, corretora: mov.conta, saldo: novoSaldo };
    if (mov.moeda) {
      insertPayload.moeda = mov.moeda;
    }
    await supabase
      .from('saldos_corretora')
      .insert(insertPayload);
  }

  return { data: movResult.data, error: null };
}

export async function deleteMovimentacao(id) {
  var result = await supabase
    .from('movimentacoes')
    .delete()
    .eq('id', id);
  return { error: result.error };
}

export async function getMovimentacoesSummary(userId, mes, ano) {
  var dataInicio = ano + '-' + String(mes).padStart(2, '0') + '-01';
  var nextMonth = mes === 12 ? 1 : mes + 1;
  var nextYear = mes === 12 ? ano + 1 : ano;
  var dataFim = nextYear + '-' + String(nextMonth).padStart(2, '0') + '-01';

  var result = await supabase
    .from('movimentacoes')
    .select('*')
    .eq('user_id', userId)
    .gte('data', dataInicio)
    .lt('data', dataFim);

  var movs = result.data || [];
  var totalEntradas = 0;
  var totalSaidas = 0;
  var porCategoria = {};

  for (var i = 0; i < movs.length; i++) {
    var m = movs[i];
    if (m.tipo === 'entrada') totalEntradas += (m.valor || 0);
    else if (m.tipo === 'saida') totalSaidas += (m.valor || 0);

    if (!porCategoria[m.categoria]) porCategoria[m.categoria] = 0;
    porCategoria[m.categoria] += (m.valor || 0);
  }

  return {
    totalEntradas: totalEntradas,
    totalSaidas: totalSaidas,
    saldo: totalEntradas - totalSaidas,
    porCategoria: porCategoria,
    total: movs.length,
  };
}

// ═══════════ DASHBOARD AGGREGATES ═══════════
export async function getDashboard(userId) {
  try {
    var results = await Promise.all([
      getPositions(userId),
      getProventos(userId, { limit: 1000 }),
      getOpcoes(userId),
      getRendaFixa(userId),
      getSaldos(userId),
      getProfile(userId),
      getPatrimonioSnapshots(userId),
    ]);

    var positions = results[0];
    var proventos = results[1];
    var opcoes = results[2];
    var rendaFixa = results[3];
    var saldos = results[4];
    var profile = results[5];
    var snapshots = results[6];

    var now = new Date();
    var mesAtual = now.getMonth();
    var anoAtual = now.getFullYear();

    // ── Posições ──
    var posDataRaw = positions.data || [];
    var posEncerradas = positions.encerradas || [];

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

    // ── Saldo livre (corretoras/bancos) com conversão multi-moeda ──
    var saldosData = saldos.data || [];
    var moedasEstrangeiras = [];
    for (var mi = 0; mi < saldosData.length; mi++) {
      var moedaItem = saldosData[mi].moeda || 'BRL';
      if (moedaItem !== 'BRL' && moedasEstrangeiras.indexOf(moedaItem) === -1) {
        moedasEstrangeiras.push(moedaItem);
      }
    }
    var exchangeRates = { BRL: 1 };
    if (moedasEstrangeiras.length > 0) {
      try { exchangeRates = await fetchExchangeRates(moedasEstrangeiras); } catch (e) { /* fallback */ }
    }
    var saldoLivreTotal = 0;
    for (var si = 0; si < saldosData.length; si++) {
      var sMoeda = saldosData[si].moeda || 'BRL';
      var sOriginal = saldosData[si].saldo || 0;
      saldoLivreTotal += convertToBRL(sOriginal, sMoeda, exchangeRates);
    }

    // ── Patrimônio total ──
    var patrimonio = patrimonioAcoes + rfTotalAplicado + saldoLivreTotal;

    // ── Mes anterior ──
    var mesAnterior = mesAtual === 0 ? 11 : mesAtual - 1;
    var anoMesAnterior = mesAtual === 0 ? anoAtual - 1 : anoAtual;

    // ── Dividendos do mês ──
    // Parse YYYY-MM-DD sem timezone (new Date("YYYY-MM-DD") e UTC, getMonth() e local = bug)
    var mesAtualStr = String(mesAtual + 1);
    if (mesAtualStr.length === 1) mesAtualStr = '0' + mesAtualStr;
    var mesAntStr = String(mesAnterior + 1);
    if (mesAntStr.length === 1) mesAntStr = '0' + mesAntStr;
    var prefixMesAtual = anoAtual + '-' + mesAtualStr;
    var prefixMesAnterior = anoMesAnterior + '-' + mesAntStr;

    var proventosData = proventos.data || [];
    var dividendosMes = 0;
    var dividendosMesAnterior = 0;
    var dividendosRecebidosMes = 0;
    var dividendosAReceberMes = 0;
    var todayDateStr = now.toISOString().substring(0, 10);
    for (var di = 0; di < proventosData.length; di++) {
      var provDateStr = (proventosData[di].data_pagamento || '').substring(0, 10);
      var provVal = (proventosData[di].valor_por_cota || 0) * (proventosData[di].quantidade || 0);
      if (provDateStr.substring(0, 7) === prefixMesAtual) {
        dividendosMes += provVal;
        if (provDateStr <= todayDateStr) {
          dividendosRecebidosMes += provVal;
        } else {
          dividendosAReceberMes += provVal;
        }
      } else if (provDateStr.substring(0, 7) === prefixMesAnterior) {
        dividendosMesAnterior += provVal;
      }
    }

    // ── Proventos pagos hoje ──
    var todayStr = now.toISOString().substring(0, 10);
    var proventosHoje = [];
    for (var phi = 0; phi < proventosData.length; phi++) {
      var phDate = (proventosData[phi].data_pagamento || '').substring(0, 10);
      if (phDate === todayStr) {
        proventosHoje.push(proventosData[phi]);
      }
    }

    // ── Dividendos por categoria (mes atual e anterior) ──
    var dividendosCatMes = { acao: 0, fii: 0, etf: 0, stock_int: 0 };
    var dividendosCatMesAnt = { acao: 0, fii: 0, etf: 0, stock_int: 0 };
    var posCategoria = {};
    for (var pci = 0; pci < posDataRaw.length; pci++) {
      posCategoria[posDataRaw[pci].ticker] = posDataRaw[pci].categoria || 'acao';
    }
    for (var dci = 0; dci < proventosData.length; dci++) {
      var dcDateStr = (proventosData[dci].data_pagamento || '').substring(0, 10);
      var dcVal = (proventosData[dci].valor_por_cota || 0) * (proventosData[dci].quantidade || 0);
      var dcCat = posCategoria[proventosData[dci].ticker] || 'acao';
      if (dcCat !== 'acao' && dcCat !== 'fii' && dcCat !== 'etf' && dcCat !== 'stock_int') dcCat = 'acao';
      if (dcDateStr.substring(0, 7) === prefixMesAtual) {
        dividendosCatMes[dcCat] += dcVal;
      } else if (dcDateStr.substring(0, 7) === prefixMesAnterior) {
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

    // Recompra por mes (data de fechamento) + P&L mensal ultimos 3 meses
    var recompraMes = 0;
    var recompraMesAnterior = 0;
    var plMensal3m = {};
    for (var rci = 0; rci < todasOpcoes.length; rci++) {
      var rcOp = todasOpcoes[rci];
      var rcDir = rcOp.direcao || 'venda';
      if (rcDir !== 'venda' && rcDir !== 'lancamento') continue;
      var rcPremFech = (rcOp.premio_fechamento || 0) * (rcOp.quantidade || 0);
      if (rcPremFech <= 0) continue;
      var rcDate = rcOp.updated_at || rcOp.vencimento || '';
      if (!rcDate) continue;
      var dRc = new Date(rcDate);
      var rcM = dRc.getMonth();
      var rcY = dRc.getFullYear();
      if (rcM === mesAtual && rcY === anoAtual) {
        recompraMes += rcPremFech;
      } else if (rcM === mesAnterior && rcY === anoMesAnterior) {
        recompraMesAnterior += rcPremFech;
      }
      // Agrupar por mes para media 3m
      var rcKey = rcY + '-' + String(rcM + 1).padStart(2, '0');
      if (!plMensal3m[rcKey]) plMensal3m[rcKey] = { prem: 0, rec: 0 };
      plMensal3m[rcKey].rec += rcPremFech;
    }
    // Premios por mes (para media 3m)
    for (var p3i = 0; p3i < todasOpcoes.length; p3i++) {
      var p3Op = todasOpcoes[p3i];
      var p3Dir = p3Op.direcao || 'venda';
      if (p3Dir !== 'venda' && p3Dir !== 'lancamento') continue;
      var p3Prem = (p3Op.premio || 0) * (p3Op.quantidade || 0);
      if (p3Prem <= 0) continue;
      var p3Date = p3Op.data_abertura || p3Op.created_at || p3Op.vencimento;
      if (!p3Date) continue;
      var dP3 = new Date(p3Date);
      dP3.setDate(dP3.getDate() + 1);
      var p3Key = dP3.getFullYear() + '-' + String(dP3.getMonth() + 1).padStart(2, '0');
      if (!plMensal3m[p3Key]) plMensal3m[p3Key] = { prem: 0, rec: 0 };
      plMensal3m[p3Key].prem += p3Prem;
    }
    // Calcular media P&L dos ultimos 3 meses (mes atual + 2 anteriores)
    var plMedia3m = 0;
    var meses3m = [];
    for (var m3i = 0; m3i < 3; m3i++) {
      var d3m = new Date(anoAtual, mesAtual - m3i, 1);
      meses3m.push(d3m.getFullYear() + '-' + String(d3m.getMonth() + 1).padStart(2, '0'));
    }
    var soma3m = 0;
    var count3m = 0;
    for (var s3i = 0; s3i < meses3m.length; s3i++) {
      var m3Data = plMensal3m[meses3m[s3i]];
      var m3pl = (m3Data ? m3Data.prem : 0) - (m3Data ? m3Data.rec : 0);
      soma3m += m3pl;
      count3m++;
    }
    plMedia3m = count3m > 0 ? soma3m / count3m : 0;
    var plMes = premiosMes - recompraMes;
    var plMesAnterior = premiosMesAnterior - recompraMesAnterior;

    // Media anual de renda (P&L opcoes + dividendos + RF) do ano corrente
    var mesesDecorridos = mesAtual + 1;
    var rendaAnualByMonth = {};
    // P&L opcoes por mes (reusa plMensal3m que ja tem prem/rec)
    var plKeys = Object.keys(plMensal3m);
    var prefixAno = String(anoAtual);
    for (var pki = 0; pki < plKeys.length; pki++) {
      if (plKeys[pki].substring(0, 4) === prefixAno) {
        var pkData = plMensal3m[plKeys[pki]];
        if (!rendaAnualByMonth[plKeys[pki]]) rendaAnualByMonth[plKeys[pki]] = 0;
        rendaAnualByMonth[plKeys[pki]] += (pkData.prem || 0) - (pkData.rec || 0);
      }
    }
    // Dividendos ja recebidos do ano corrente (data_pagamento <= hoje)
    var todayStr = now.toISOString().substring(0, 10);
    for (var dai = 0; dai < proventosData.length; dai++) {
      var daDateStr = (proventosData[dai].data_pagamento || '').substring(0, 10);
      if (daDateStr.substring(0, 4) === prefixAno && daDateStr <= todayStr) {
        var daMonth = daDateStr.substring(0, 7);
        var daVal = (proventosData[dai].valor_por_cota || 0) * (proventosData[dai].quantidade || 0);
        if (!rendaAnualByMonth[daMonth]) rendaAnualByMonth[daMonth] = 0;
        rendaAnualByMonth[daMonth] += daVal;
      }
    }
    // RF mensal para cada mes decorrido
    var raKeys = Object.keys(rendaAnualByMonth);
    for (var rai = 0; rai < raKeys.length; rai++) {
      rendaAnualByMonth[raKeys[rai]] += rfRendaMensal;
    }
    // Meses sem opcoes/dividendos mas com RF
    for (var rmi2 = 0; rmi2 < mesesDecorridos; rmi2++) {
      var rmKey = anoAtual + '-' + String(rmi2 + 1).padStart(2, '0');
      if (!rendaAnualByMonth[rmKey]) rendaAnualByMonth[rmKey] = rfRendaMensal;
    }
    var somaRendaAno = 0;
    var rendaAnoKeys = Object.keys(rendaAnualByMonth);
    for (var srai = 0; srai < rendaAnoKeys.length; srai++) {
      somaRendaAno += rendaAnualByMonth[rendaAnoKeys[srai]];
    }
    var mesesCompletos = Math.max(mesAtual, 1);
    var rendaMediaAnual = mesesCompletos > 0 ? somaRendaAno / mesesCompletos : 0;

    // Opções que vencem em breve (agrupadas por urgência)
    var opsVenc7d = [];
    var opsVenc15d = [];
    var opsVenc30d = [];
    var em7dias = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    var em15dias = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
    var em30dias = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    for (var ov = 0; ov < opsAtivas.length; ov++) {
      var vencOp = new Date(opsAtivas[ov].vencimento);
      if (vencOp <= em7dias) {
        opsVenc7d.push(opsAtivas[ov]);
      } else if (vencOp <= em15dias) {
        opsVenc15d.push(opsAtivas[ov]);
      } else if (vencOp <= em30dias) {
        opsVenc30d.push(opsAtivas[ov]);
      }
    }
    var opsProxVenc = opsVenc7d.concat(opsVenc15d).concat(opsVenc30d);

    // RF que vence em 90 dias
    var em90dias = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    var rfProxVenc = [];
    for (var rv = 0; rv < rfData.length; rv++) {
      var vencDate = new Date(rfData[rv].vencimento);
      if (vencDate > now && vencDate <= em90dias) {
        rfProxVenc.push(rfData[rv]);
      }
    }

    // ── Renda total do mês (usa P&L de opções) ──
    var rendaTotalMes = dividendosMes + plMes + rfRendaMensal;
    var rendaTotalMesAnterior = dividendosMesAnterior + plMesAnterior + rfRendaMensal;

    // ── Saldos (convertidos para BRL) ──
    // Reutiliza exchangeRates ja calculado acima
    var saldoTotal = 0;
    for (var sti = 0; sti < saldosData.length; sti++) {
      var stMoeda = saldosData[sti].moeda || 'BRL';
      var stOriginal = saldosData[sti].saldo || 0;
      saldoTotal += convertToBRL(stOriginal, stMoeda, exchangeRates);
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
    todayStr = now.toISOString().substring(0, 10);
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

    // Merge snapshots (real market value from past sessions)
    var snapshotByDate = {};
    for (var sn = 0; sn < snapshots.length; sn++) {
      snapshotByDate[snapshots[sn].data] = snapshots[sn].valor;
    }

    // Build final timeline: prefer snapshot values (real market) over cost-based
    var historyByDate = {};
    for (var ph = 0; ph < patrimonioHistory.length; ph++) {
      historyByDate[patrimonioHistory[ph].date] = patrimonioHistory[ph].value;
    }

    // Add snapshot dates that dont exist in history
    var snKeys = Object.keys(snapshotByDate);
    for (var sk = 0; sk < snKeys.length; sk++) {
      historyByDate[snKeys[sk]] = snapshotByDate[snKeys[sk]];
    }

    // Override cost-based values with snapshot values where available
    var mergedDates = Object.keys(historyByDate).sort();
    var mergedHistory = [];
    for (var mh = 0; mh < mergedDates.length; mh++) {
      var mDate = mergedDates[mh];
      var mVal = snapshotByDate[mDate] !== undefined ? snapshotByDate[mDate] : historyByDate[mDate];
      mergedHistory.push({ date: mDate, value: mVal });
    }

    // Replace today's point with real market value
    if (mergedHistory.length > 0 && mergedHistory[mergedHistory.length - 1].date === todayStr) {
      mergedHistory[mergedHistory.length - 1].value = patrimonio;
    }

    patrimonioHistory = mergedHistory;

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
      opsVenc7d: opsVenc7d.length,
      opsVenc15d: opsVenc15d.length,
      opsVenc30d: opsVenc30d.length,
      meta: metaMensal,
      positions: posData,
      encerradas: posEncerradas,
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
      proventosHoje: proventosHoje,
      dividendosRecebidosMes: dividendosRecebidosMes,
      dividendosAReceberMes: dividendosAReceberMes,
      plMes: plMes,
      plMesAnterior: plMesAnterior,
      plMedia3m: plMedia3m,
      rendaMediaAnual: rendaMediaAnual,
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
      dividendosCatMes: { acao: 0, fii: 0, etf: 0, stock_int: 0 },
      dividendosCatMesAnt: { acao: 0, fii: 0, etf: 0, stock_int: 0 },
      proventosHoje: [],
      dividendosRecebidosMes: 0,
      dividendosAReceberMes: 0,
      plMes: 0,
      plMesAnterior: 0,
      plMedia3m: 0,
      rendaMediaAnual: 0,
    };
  }
}
