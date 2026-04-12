import { supabase } from '../config/supabase';
import { enrichPositionsWithPrices } from './priceService';
import { fetchExchangeRates, convertToBRL } from './currencyService';
var dateUtils = require('../utils/dateUtils');
var parseLocalDate = dateUtils.parseLocalDate;
var fractional = require('../utils/fractional');
var decMul = fractional.decMul;
var decDiv = fractional.decDiv;
var decAdd = fractional.decAdd;
var decSub = fractional.decSub;

// Helper: aplica filtro de portfolio na query Supabase (server-side)
function applyPortfolioFilter(query, portfolioId) {
  if (!portfolioId) return query;
  if (portfolioId === '__null__') {
    return query.is('portfolio_id', null);
  }
  return query.eq('portfolio_id', portfolioId);
}

// ═══════════ PORTFOLIOS ═══════════
export async function getPortfolios(userId) {
  var result = await supabase
    .from('portfolios')
    .select('*')
    .eq('user_id', userId)
    .order('ordem', { ascending: true });
  return { data: result.data || [], error: result.error };
}

export async function addPortfolio(userId, data) {
  var payload = { user_id: userId };
  var keys = Object.keys(data);
  for (var i = 0; i < keys.length; i++) {
    payload[keys[i]] = data[keys[i]];
  }
  var result = await supabase
    .from('portfolios')
    .insert(payload)
    .select()
    .single();
  return { data: result.data, error: result.error };
}

export async function updatePortfolio(userId, id, data) {
  var result = await supabase
    .from('portfolios')
    .update(data)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();
  return { data: result.data, error: result.error };
}

export async function deletePortfolio(id, deleteData) {
  if (deleteData) {
    // Snapshot all data before deleting (backup 30 dias)
    await backupPortfolioData(id);
    // Delete all related records permanently
    await supabase.from('movimentacoes').delete().eq('portfolio_id', id);
    await supabase.from('proventos').delete().eq('portfolio_id', id);
    await supabase.from('opcoes').delete().eq('portfolio_id', id);
    await supabase.from('operacoes').delete().eq('portfolio_id', id);
    await supabase.from('renda_fixa').delete().eq('portfolio_id', id);
    await supabase.from('saldos_corretora').delete().eq('portfolio_id', id);
    await supabase.from('cartoes_credito').delete().eq('portfolio_id', id);
  } else {
    // Set portfolio_id to NULL on all related records (move to Padrão)
    await supabase.from('operacoes').update({ portfolio_id: null }).eq('portfolio_id', id);
    await supabase.from('opcoes').update({ portfolio_id: null }).eq('portfolio_id', id);
    await supabase.from('renda_fixa').update({ portfolio_id: null }).eq('portfolio_id', id);
    await supabase.from('proventos').update({ portfolio_id: null }).eq('portfolio_id', id);
    await supabase.from('movimentacoes').update({ portfolio_id: null }).eq('portfolio_id', id);
    await supabase.from('saldos_corretora').update({ portfolio_id: null }).eq('portfolio_id', id);
    await supabase.from('cartoes_credito').update({ portfolio_id: null }).eq('portfolio_id', id);
  }
  var result = await supabase.from('portfolios').delete().eq('id', id);
  return { error: result.error };
}

// Snapshot completo do portfolio antes de excluir (retencao 30 dias)
async function backupPortfolioData(portfolioId) {
  try {
    // Buscar portfolio info
    var pfRes = await supabase.from('portfolios').select('*').eq('id', portfolioId).single();
    if (!pfRes.data) return;
    var pf = pfRes.data;

    // Buscar todos os dados vinculados em paralelo
    var results = await Promise.all([
      supabase.from('operacoes').select('*').eq('portfolio_id', portfolioId),
      supabase.from('opcoes').select('*').eq('portfolio_id', portfolioId),
      supabase.from('renda_fixa').select('*').eq('portfolio_id', portfolioId),
      supabase.from('proventos').select('*').eq('portfolio_id', portfolioId),
      supabase.from('movimentacoes').select('*').eq('portfolio_id', portfolioId),
      supabase.from('saldos_corretora').select('*').eq('portfolio_id', portfolioId),
      supabase.from('cartoes_credito').select('*').eq('portfolio_id', portfolioId),
    ]);

    var dados = {
      portfolio: pf,
      operacoes: (results[0].data || []),
      opcoes: (results[1].data || []),
      renda_fixa: (results[2].data || []),
      proventos: (results[3].data || []),
      movimentacoes: (results[4].data || []),
      saldos: (results[5].data || []),
      cartoes: (results[6].data || []),
    };

    await supabase.from('portfolio_backups').insert({
      user_id: pf.user_id,
      portfolio_id: portfolioId,
      portfolio_nome: pf.nome,
      dados: dados,
    });
  } catch (e) {
    console.warn('backupPortfolioData failed:', e);
    // Nao bloqueia a exclusao se backup falhar
  }
}

export async function getPortfolioBackups(userId) {
  var result = await supabase
    .from('portfolio_backups')
    .select('id, portfolio_id, portfolio_nome, deleted_at, expires_at')
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .order('deleted_at', { ascending: false });
  return { data: result.data || [], error: result.error };
}

export async function restorePortfolioBackup(backupId) {
  // Buscar backup completo
  var bkRes = await supabase.from('portfolio_backups').select('*').eq('id', backupId).single();
  if (bkRes.error || !bkRes.data) return { error: bkRes.error || { message: 'Backup não encontrado' } };
  var bk = bkRes.data;
  var dados = bk.dados;
  var userId = bk.user_id;

  try {
    // Recriar portfolio
    var pfData = dados.portfolio;
    var pfInsert = await supabase.from('portfolios').insert({
      user_id: userId,
      nome: pfData.nome,
      cor: pfData.cor,
      icone: pfData.icone,
      ordem: pfData.ordem || 0,
      operacoes_contas: pfData.operacoes_contas !== false,
    }).select().single();
    if (pfInsert.error) return { error: pfInsert.error };
    var newPfId = pfInsert.data.id;

    // Helper: re-insert array com novo portfolio_id (remove id e timestamps originais)
    var reinsert = async function(table, rows) {
      if (!rows || rows.length === 0) return;
      var cleaned = [];
      for (var i = 0; i < rows.length; i++) {
        var row = {};
        var keys = Object.keys(rows[i]);
        for (var k = 0; k < keys.length; k++) {
          if (keys[k] === 'id' || keys[k] === 'created_at') continue;
          row[keys[k]] = rows[i][keys[k]];
        }
        row.portfolio_id = newPfId;
        row.user_id = userId;
        cleaned.push(row);
      }
      await supabase.from(table).insert(cleaned);
    };

    await reinsert('operacoes', dados.operacoes);
    await reinsert('opcoes', dados.opcoes);
    await reinsert('renda_fixa', dados.renda_fixa);
    await reinsert('proventos', dados.proventos);
    await reinsert('movimentacoes', dados.movimentacoes);
    await reinsert('saldos_corretora', dados.saldos);
    await reinsert('cartoes_credito', dados.cartoes);

    // Remover backup apos restaurar
    await supabase.from('portfolio_backups').delete().eq('id', backupId);

    return { data: pfInsert.data, error: null };
  } catch (e) {
    return { error: { message: e.message || 'Falha ao restaurar' } };
  }
}

// ═══════════ USER BACKUPS (DIARIO) ═══════════
export async function getUserBackups(userId) {
  var result = await supabase
    .from('user_backups')
    .select('id, backup_date, tabelas_count, size_bytes, created_at')
    .eq('user_id', userId)
    .order('backup_date', { ascending: false });
  return { data: result.data || [], error: result.error };
}

export async function getUserBackupDetail(backupId) {
  var result = await supabase
    .from('user_backups')
    .select('*')
    .eq('id', backupId)
    .single();
  return { data: result.data, error: result.error };
}

// Restaurar backup completo: substitui TODOS os dados do usuario pelo snapshot
export async function restoreUserBackup(userId, backupId) {
  // 1. Buscar backup
  var bkRes = await supabase.from('user_backups').select('*').eq('id', backupId).eq('user_id', userId).single();
  if (bkRes.error || !bkRes.data) return { error: bkRes.error || { message: 'Backup não encontrado' } };
  var dados = bkRes.data.dados;

  var TABLES_ORDER = [
    'alertas_opcoes', 'indicators', 'rebalance_targets', 'alertas_config',
    'transacoes_recorrentes', 'orcamentos',
    'movimentacoes', 'proventos', 'opcoes', 'operacoes', 'renda_fixa',
    'cartoes_credito', 'saldos_corretora', 'portfolios',
  ];

  try {
    // 2. Deletar dados atuais (ordem reversa de dependencias)
    for (var di = 0; di < TABLES_ORDER.length; di++) {
      await supabase.from(TABLES_ORDER[di]).delete().eq('user_id', userId);
    }

    // 3. Re-inserir dados do backup (ordem de dependencias: portfolios primeiro)
    var INSERT_ORDER = [
      'portfolios',
      'saldos_corretora', 'cartoes_credito',
      'operacoes', 'opcoes', 'renda_fixa', 'proventos', 'movimentacoes',
      'orcamentos', 'transacoes_recorrentes',
      'alertas_config', 'indicators', 'rebalance_targets', 'alertas_opcoes',
    ];

    var inserted = {};
    for (var ii = 0; ii < INSERT_ORDER.length; ii++) {
      var table = INSERT_ORDER[ii];
      var rows = dados[table];
      if (!rows || rows.length === 0) {
        inserted[table] = 0;
        continue;
      }
      // Limpar campos auto-gerados
      var cleaned = [];
      for (var ri = 0; ri < rows.length; ri++) {
        var row = {};
        var keys = Object.keys(rows[ri]);
        for (var ki = 0; ki < keys.length; ki++) {
          // Preservar id original para manter referencias (portfolio_id, referencia_id, etc)
          if (keys[ki] === 'created_at') continue;
          row[keys[ki]] = rows[ri][keys[ki]];
        }
        cleaned.push(row);
      }
      var insRes = await supabase.from(table).insert(cleaned);
      if (insRes.error) {
        console.warn('Restore insert error on ' + table + ':', insRes.error.message);
      }
      inserted[table] = cleaned.length;
    }

    // 4. Restaurar profile (update, nao insert — profile ja existe)
    if (dados.profiles && dados.profiles.length > 0) {
      var prof = dados.profiles[0];
      var profUpdate = {};
      var profKeys = Object.keys(prof);
      for (var pk = 0; pk < profKeys.length; pk++) {
        if (profKeys[pk] === 'id' || profKeys[pk] === 'created_at') continue;
        profUpdate[profKeys[pk]] = prof[profKeys[pk]];
      }
      await supabase.from('profiles').update(profUpdate).eq('id', userId);
    }

    return { data: { inserted: inserted }, error: null };
  } catch (e) {
    return { error: { message: e.message || 'Falha ao restaurar backup' } };
  }
}

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
  query = applyPortfolioFilter(query, filters.portfolioId);

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

export async function addOperacoesBatch(userId, operacoes) {
  var inserted = 0;
  var failed = [];
  for (var i = 0; i < operacoes.length; i++) {
    var op = operacoes[i];
    var result = await addOperacao(userId, op);
    if (result.error) {
      failed.push({ index: i, ticker: op.ticker, error: result.error.message });
    } else {
      inserted = inserted + 1;
    }
  }
  return { inserted: inserted, failed: failed };
}

export async function getOperacoesForDedup(userId) {
  var result = await supabase
    .from('operacoes')
    .select('ticker, data, tipo, quantidade, preco')
    .eq('user_id', userId);
  return { data: result.data || [], error: result.error };
}

export async function getOpcoesForDedup(userId) {
  var result = await supabase
    .from('opcoes')
    .select('ticker_opcao, data_abertura, premio, quantidade')
    .eq('user_id', userId);
  return { data: result.data || [], error: result.error };
}

// Router unificado para importacao em batch (operacoes + opcoes + exercicios)
// Cada item deve ter _importType: 'operacao' | 'opcao' | 'exercicio' | 'skip'
export async function importBatch(userId, items) {
  var inserted = 0;
  var failed = [];
  var counts = { operacao: 0, opcao: 0, exercicio: 0 };

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var importType = item._importType || 'operacao';

    // Skip items should not reach here, but just in case
    if (importType === 'skip') continue;

    // Build clean payload (remove _ prefixed internal fields)
    var clean = {};
    var keys = Object.keys(item);
    for (var k = 0; k < keys.length; k++) {
      if (keys[k].charAt(0) !== '_') {
        clean[keys[k]] = item[keys[k]];
      }
    }

    var result;
    if (importType === 'opcao') {
      result = await addOpcao(userId, clean);
      if (result.error) {
        failed.push({ index: i, ticker: item.ticker_opcao || item.ativo_base, error: result.error.message });
      } else {
        inserted = inserted + 1;
        counts.opcao = counts.opcao + 1;
      }
    } else {
      // 'operacao' or 'exercicio' → both create operacoes
      result = await addOperacao(userId, clean);
      if (result.error) {
        failed.push({ index: i, ticker: item.ticker, error: result.error.message });
      } else {
        inserted = inserted + 1;
        if (importType === 'exercicio') {
          counts.exercicio = counts.exercicio + 1;
        } else {
          counts.operacao = counts.operacao + 1;
        }
      }
    }
  }

  return { inserted: inserted, failed: failed, counts: counts };
}

export async function deleteOperacao(id) {
  var result = await supabase
    .from('operacoes')
    .delete()
    .eq('id', id);
  return { error: result.error };
}

export async function deleteOperacaoComMovimentacoes(userId, operacaoId) {
  // 1. Buscar a operacao para saber ticker, data, tipo
  var opResult = await supabase
    .from('operacoes')
    .select('*')
    .eq('id', operacaoId)
    .maybeSingle();
  var op = opResult.data;

  // 2. Buscar movimentacoes vinculadas por ticker + data + categoria
  var movs = [];
  if (op) {
    var ticker = (op.ticker || '').toUpperCase().trim();
    var movCat = op.tipo === 'compra' ? 'compra_ativo' : 'venda_ativo';
    var movsQuery = supabase
      .from('movimentacoes')
      .select('*')
      .eq('user_id', userId)
      .eq('categoria', movCat)
      .eq('ticker', ticker);
    if (op.data) {
      movsQuery = movsQuery.eq('data', op.data);
    }
    var movsResult = await movsQuery;
    movs = (movsResult.data) || [];
  }

  // 3. Reverter saldos e excluir cada movimentacao
  for (var i = 0; i < movs.length; i++) {
    var mov = movs[i];
    var conta = (mov.conta || '').toUpperCase().trim();
    var saldoResult = await supabase
      .from('saldos_corretora')
      .select('*')
      .eq('user_id', userId)
      .eq('corretora', conta)
      .limit(1);
    var saldoRow = (saldoResult.data && saldoResult.data[0]) || null;
    if (saldoRow) {
      var saldoAtual = saldoRow.saldo || 0;
      var novoSaldo;
      if (mov.tipo === 'entrada') {
        novoSaldo = saldoAtual - (mov.valor || 0);
      } else {
        novoSaldo = saldoAtual + (mov.valor || 0);
      }
      await supabase
        .from('saldos_corretora')
        .update({ saldo: novoSaldo, updated_at: new Date().toISOString() })
        .eq('id', saldoRow.id);
    }
    await supabase
      .from('movimentacoes')
      .delete()
      .eq('id', mov.id);
  }

  // 4. Excluir a operacao
  var result = await supabase
    .from('operacoes')
    .delete()
    .eq('id', operacaoId);
  return { error: result.error, movimentacoesExcluidas: movs.length };
}

// ═══════════ POSIÇÕES (computed view) ═══════════
export async function getPositions(userId, portfolioId) {
  var query = supabase
    .from('operacoes')
    .select('*')
    .eq('user_id', userId)
    .in('tipo', ['compra', 'venda'])
    .order('data', { ascending: true });

  query = applyPortfolioFilter(query, portfolioId);

  var result = await query;

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
        portfolio_ids: [],
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
    var opPortId = op.portfolio_id || null;
    if (p.portfolio_ids.indexOf(opPortId) === -1) {
      p.portfolio_ids.push(opPortId);
    }
    var corr = (op.corretora || 'Sem corretora').toUpperCase().trim();
    if (!p.por_corretora[corr]) {
      p.por_corretora[corr] = 0;
      p.custo_por_corretora[corr] = 0;
    }
    if (op.tipo === 'compra') {
      var custos = decAdd(decAdd(op.custo_corretagem || 0, op.custo_emolumentos || 0), op.custo_impostos || 0);
      var custoOp = decAdd(decMul(op.quantidade, op.preco), custos);
      p.custo_total = decAdd(p.custo_total, custoOp);
      p.quantidade = decAdd(p.quantidade, op.quantidade);
      p.por_corretora[corr] = decAdd(p.por_corretora[corr], op.quantidade);
      p.custo_por_corretora[corr] = decAdd(p.custo_por_corretora[corr], custoOp);
      p.total_comprado = decAdd(p.total_comprado, op.quantidade);
      p.custo_compras = decAdd(p.custo_compras, custoOp);
      // Acumular custo em BRL para INT (usando taxa_cambio da operacao)
      if ((op.mercado === 'INT') && op.taxa_cambio) {
        p._custo_brl = decAdd(p._custo_brl, decMul(custoOp, op.taxa_cambio));
      }
    } else {
      var custosVenda = decAdd(decAdd(op.custo_corretagem || 0, op.custo_emolumentos || 0), op.custo_impostos || 0);
      var receitaLiq = decSub(decMul(op.quantidade, op.preco), custosVenda);
      // PM por corretora para P&L real
      var pmCorr = p.por_corretora[corr] > 0 ? decDiv(p.custo_por_corretora[corr], p.por_corretora[corr]) : p.pm;
      p.pl_realizado = decAdd(p.pl_realizado, decSub(decMul(op.quantidade, decSub(op.preco, pmCorr)), custosVenda));
      // PM geral para IR
      p.pl_realizado_ir = decAdd(p.pl_realizado_ir, decSub(decMul(op.quantidade, decSub(op.preco, p.pm)), custosVenda));
      p.receita_vendas = decAdd(p.receita_vendas, receitaLiq);
      p.total_vendido = decAdd(p.total_vendido, op.quantidade);
      // Reduzir custo proporcional ao PM da corretora
      p.custo_por_corretora[corr] = decSub(p.custo_por_corretora[corr], decMul(op.quantidade, pmCorr));
      p.por_corretora[corr] = decSub(p.por_corretora[corr], op.quantidade);
      // Reduzir custo geral pelo PM geral
      p.custo_total = decSub(p.custo_total, decMul(op.quantidade, p.pm));
      p.quantidade = decSub(p.quantidade, op.quantidade);
    }
    // Threshold zero: evita posições fantasma por imprecisão
    if (Math.abs(p.quantidade) < 0.000001) p.quantidade = 0;
    p.pm = p.quantidade > 0 ? decDiv(p.custo_total, p.quantidade) : 0;
    // Calcular taxa_cambio_media para INT
    if (p.mercado === 'INT' && p.custo_total > 0 && p._custo_brl > 0) {
      p.taxa_cambio_media = decDiv(p._custo_brl, p.custo_total);
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
  query = applyPortfolioFilter(query, filters.portfolioId);

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
export async function getOpcoes(userId, portfolioId) {
  var query = supabase
    .from('opcoes')
    .select('*')
    .eq('user_id', userId)
    .order('vencimento', { ascending: true });

  query = applyPortfolioFilter(query, portfolioId);

  var result = await query;
  var data = result.data || [];

  return { data: data, error: result.error };
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

export async function updateOpcao(opcaoId, fields) {
  var result = await supabase
    .from('opcoes')
    .update(fields)
    .eq('id', opcaoId)
    .select()
    .single();
  return { data: result.data, error: result.error };
}

export async function updateOpcaoAlertaPL(opcaoId, valor) {
  var result = await supabase
    .from('opcoes')
    .update({ alerta_pl: valor })
    .eq('id', opcaoId);
  return { error: result.error };
}

// ═══════════ RENDA FIXA ═══════════
export async function getRendaFixa(userId, portfolioId) {
  var query = supabase
    .from('renda_fixa')
    .select('*')
    .eq('user_id', userId)
    .order('vencimento', { ascending: true });

  query = applyPortfolioFilter(query, portfolioId);

  var result = await query;
  var data = result.data || [];

  return { data: data, error: result.error };
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

// ═══════════ PROVENTOS UPDATE ═══════════
export async function updateProvento(id, fields) {
  var result = await supabase
    .from('proventos')
    .update(fields)
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

export async function deleteAllProventos(userId, portfolioId, cutoffDate) {
  var q = supabase.from('proventos').delete().eq('user_id', userId);
  if (portfolioId && portfolioId !== '__null__') {
    q = q.eq('portfolio_id', portfolioId);
  } else if (portfolioId === '__null__') {
    q = q.is('portfolio_id', null);
  }
  if (cutoffDate) {
    q = q.gte('data_pagamento', cutoffDate);
  }
  var result = await q;
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
  var normalized = (name || '').toUpperCase().trim();
  var existing = await supabase
    .from('user_corretoras')
    .select('count')
    .eq('user_id', userId)
    .eq('name', normalized)
    .single();

  if (existing.data) {
    await supabase
      .from('user_corretoras')
      .update({ count: existing.data.count + 1 })
      .eq('user_id', userId)
      .eq('name', normalized);
  } else {
    await supabase
      .from('user_corretoras')
      .insert({ user_id: userId, name: normalized, count: 1 });
  }
}

// ═══════════ SALDOS CORRETORA ═══════════
export async function getSaldos(userId) {
  // Saldos sao globais (nao tem portfolio_id) — contas sao as mesmas em todos portfolios
  var query = supabase
    .from('saldos_corretora')
    .select('*')
    .eq('user_id', userId)
    .order('corretora', { ascending: true })
    .order('moeda', { ascending: true });

  var result = await query;
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
  if (data.tipo) {
    payload.tipo = data.tipo;
  }
  if (data.portfolio_id !== undefined) {
    payload.portfolio_id = data.portfolio_id;
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
// UUID sentinela para snapshots do portfolio "Padrao" (ops sem portfolio_id)
var PADRAO_SNAPSHOT_ID = '00000000-0000-0000-0000-000000000001';

// Converte portfolioId do app para portfolio_id do banco
// null/undefined = global (IS NULL), '__null__' = Padrao (sentinela UUID), uuid = portfolio custom
function snapshotPortfolioId(portfolioId) {
  if (!portfolioId) return null; // global
  if (portfolioId === '__null__') return PADRAO_SNAPSHOT_ID; // padrao
  return portfolioId; // portfolio custom
}

export async function getPatrimonioSnapshots(userId, portfolioId) {
  var query = supabase
    .from('patrimonio_snapshots')
    .select('*')
    .eq('user_id', userId)
    .order('data', { ascending: true });
  var pfId = snapshotPortfolioId(portfolioId);
  if (pfId) {
    query = query.eq('portfolio_id', pfId);
  } else {
    query = query.is('portfolio_id', null);
  }
  var result = await query;
  var raw = result.data || [];
  // Filtrar snapshots invalidos na leitura
  var filtered = [];
  for (var fi = 0; fi < raw.length; fi++) {
    if (raw[fi].valor > 0 && raw[fi].valor === raw[fi].valor) {
      filtered.push(raw[fi]);
    }
  }
  return filtered;
}

export async function upsertPatrimonioSnapshot(userId, data, valor, portfolioId) {
  // Validacao: nunca salvar valor invalido
  if (!valor || valor <= 0 || valor !== valor) {
    console.warn('upsertPatrimonioSnapshot: valor invalido ignorado:', valor);
    return { error: null };
  }
  var pfId = snapshotPortfolioId(portfolioId);
  // Try update first
  var query = supabase
    .from('patrimonio_snapshots')
    .update({ valor: valor })
    .eq('user_id', userId)
    .eq('data', data);
  if (pfId) {
    query = query.eq('portfolio_id', pfId);
  } else {
    query = query.is('portfolio_id', null);
  }
  var result = await query.select();
  // If no rows updated, insert
  if (!result.error && (!result.data || result.data.length === 0)) {
    var payload = { user_id: userId, data: data, valor: valor };
    if (pfId) payload.portfolio_id = pfId;
    result = await supabase.from('patrimonio_snapshots').insert(payload);
  }
  return { error: result.error };
}

export async function deletePatrimonioSnapshot(userId, data, portfolioId) {
  var pfId = snapshotPortfolioId(portfolioId);
  var query = supabase
    .from('patrimonio_snapshots')
    .delete()
    .eq('user_id', userId)
    .eq('data', data);
  if (pfId) {
    query = query.eq('portfolio_id', pfId);
  } else {
    query = query.is('portfolio_id', null);
  }
  return await query;
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
    pagamento_fatura: 'Pgto fatura',
  };
  if (categoria === 'pagamento_fatura') return 'Pgto fatura' + (extra ? ' - ' + extra : '');
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
        moeda: (item.op && item.op.mercado === 'INT') ? 'USD' : 'BRL',
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

  // 2. Buscar todas as contas existentes para mapear conta→moeda
  var saldosResult = await getSaldos(userId);
  var saldosList = saldosResult.data || [];
  // Mapa: contaUpper → [{id, corretora, moeda, saldo}]
  var contaMap = {};
  for (var s = 0; s < saldosList.length; s++) {
    var sl = saldosList[s];
    var slKey = (sl.corretora || sl.name || '').toUpperCase().trim();
    if (!contaMap[slKey]) contaMap[slKey] = [];
    contaMap[slKey].push(sl);
  }

  // 3. Somar por conta+moeda (chave: "CONTA|MOEDA")
  var saldoPorContaMoeda = {};
  for (var i = 0; i < allMovs.length; i++) {
    var m = allMovs[i];
    var conta = (m.conta || '').toUpperCase().trim();
    if (!conta) continue;
    // Determinar moeda: buscar na conta existente
    var moeda = 'BRL';
    var contaEntries = contaMap[conta];
    if (contaEntries && contaEntries.length === 1) {
      moeda = contaEntries[0].moeda || 'BRL';
    } else if (contaEntries && contaEntries.length > 1) {
      // Multiplas moedas — usar saldo_apos da movimentacao para inferir
      // ou default BRL se nao conseguir determinar
      moeda = 'BRL';
    }
    var chave = conta + '|' + moeda;
    if (!saldoPorContaMoeda[chave]) saldoPorContaMoeda[chave] = 0;
    if (m.tipo === 'entrada') {
      saldoPorContaMoeda[chave] += (m.valor || 0);
    } else if (m.tipo === 'saida') {
      saldoPorContaMoeda[chave] -= (m.valor || 0);
    }
  }

  // 4. Atualizar cada conta+moeda
  var chaves = Object.keys(saldoPorContaMoeda);
  var atualizadas = 0;
  for (var c = 0; c < chaves.length; c++) {
    var parts = chaves[c].split('|');
    var nome = parts[0];
    var mda = parts[1] || 'BRL';
    var novoSaldo = saldoPorContaMoeda[chaves[c]];
    // Buscar conta existente por nome + moeda
    var contaResult = await supabase
      .from('saldos_corretora')
      .select('*')
      .eq('user_id', userId)
      .eq('corretora', nome)
      .eq('moeda', mda)
      .maybeSingle();
    if (contaResult.data) {
      await supabase
        .from('saldos_corretora')
        .update({ saldo: novoSaldo, updated_at: new Date().toISOString() })
        .eq('id', contaResult.data.id);
      atualizadas++;
    }
  }

  return { contas: chaves.length, atualizadas: atualizadas };
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
  query = applyPortfolioFilter(query, filters.portfolioId);

  var result = await query;
  var movData = result.data || [];

  return { data: movData, error: result.error };
}

export async function addMovimentacao(userId, mov) {
  // Normalizar conta para uppercase (consistente com addMovimentacaoComSaldo)
  if (mov.conta) {
    mov.conta = (mov.conta || '').toUpperCase().trim();
  }
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

  // 1. Get current saldo — tenta com moeda primeiro, fallback sem moeda
  var saldoResult = { data: null, error: null };
  if (mov.moeda) {
    saldoResult = await supabase
      .from('saldos_corretora')
      .select('*')
      .eq('user_id', userId)
      .eq('corretora', contaNorm)
      .eq('moeda', mov.moeda)
      .maybeSingle();
  }
  // Fallback: buscar sem filtro de moeda (conta pode ter moeda diferente da esperada)
  if (!saldoResult.data) {
    var fallbackResult = await supabase
      .from('saldos_corretora')
      .select('*')
      .eq('user_id', userId)
      .eq('corretora', contaNorm)
      .order('moeda', { ascending: true })
      .limit(1);
    var fallbackRows = (fallbackResult.data) || [];
    if (fallbackRows.length > 0) {
      saldoResult = { data: fallbackRows[0], error: null };
    }
  }

  var saldoAtual = (saldoResult.data && saldoResult.data.saldo) || 0;
  var novoSaldo;
  if (mov.tipo === 'entrada') {
    novoSaldo = saldoAtual + (mov.valor || 0);
  } else {
    novoSaldo = saldoAtual - (mov.valor || 0);
  }

  // 2. Insert movimentacao with saldo_apos (excluir 'moeda' — nao existe na tabela movimentacoes)
  var moedaSalva = mov.moeda;
  var payload = { user_id: userId, saldo_apos: novoSaldo };
  var keys = Object.keys(mov);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i] === 'moeda') continue;
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
    // Conta nao existe — criar nova
    var insertPayload = { user_id: userId, corretora: mov.conta, saldo: novoSaldo };
    if (moedaSalva) {
      insertPayload.moeda = moedaSalva;
    }
    await supabase
      .from('saldos_corretora')
      .insert(insertPayload);
  }

  return { data: movResult.data, error: null };
}

export async function updateMovimentacaoComSaldo(userId, movId, oldMov, newMov) {
  // 1. Calculate saldo impact of old mov
  var oldImpact = (oldMov.tipo === 'entrada') ? (oldMov.valor || 0) : -(oldMov.valor || 0);
  // 2. Calculate saldo impact of new mov
  var newImpact = (newMov.tipo === 'entrada') ? (newMov.valor || 0) : -(newMov.valor || 0);
  var diff = newImpact - oldImpact;

  var oldContaNorm = (oldMov.conta || '').toUpperCase().trim();
  var newContaNorm = (newMov.conta || '').toUpperCase().trim();
  var contaChanged = oldContaNorm !== newContaNorm;

  // 3. Update the movimentacao row
  var updatePayload = {
    tipo: newMov.tipo,
    categoria: newMov.categoria,
    conta: newContaNorm,
    valor: newMov.valor,
    descricao: newMov.descricao || '',
    data: newMov.data,
  };
  if (newMov.ticker !== undefined) updatePayload.ticker = newMov.ticker;

  var movResult = await supabase
    .from('movimentacoes')
    .update(updatePayload)
    .eq('id', movId)
    .eq('user_id', userId)
    .select()
    .single();

  if (movResult.error) return { data: null, error: movResult.error };

  // 4. Adjust saldos
  if (contaChanged) {
    // Revert old conta: subtract old impact
    var oldSaldoRes = await supabase
      .from('saldos_corretora')
      .select('*')
      .eq('user_id', userId)
      .eq('corretora', oldContaNorm)
      .limit(1);
    var oldSaldoRow = (oldSaldoRes.data && oldSaldoRes.data[0]) || null;
    if (oldSaldoRow) {
      var revertedSaldo = (oldSaldoRow.saldo || 0) - oldImpact;
      await supabase
        .from('saldos_corretora')
        .update({ saldo: revertedSaldo, updated_at: new Date().toISOString() })
        .eq('id', oldSaldoRow.id);
    }
    // Apply new impact to new conta
    var newSaldoRes = await supabase
      .from('saldos_corretora')
      .select('*')
      .eq('user_id', userId)
      .eq('corretora', newContaNorm)
      .limit(1);
    var newSaldoRow = (newSaldoRes.data && newSaldoRes.data[0]) || null;
    if (newSaldoRow) {
      var appliedSaldo = (newSaldoRow.saldo || 0) + newImpact;
      await supabase
        .from('saldos_corretora')
        .update({ saldo: appliedSaldo, updated_at: new Date().toISOString() })
        .eq('id', newSaldoRow.id);
      // Update saldo_apos on the mov
      await supabase.from('movimentacoes').update({ saldo_apos: appliedSaldo }).eq('id', movId);
    }
  } else {
    // Same conta — apply diff
    var saldoRes = await supabase
      .from('saldos_corretora')
      .select('*')
      .eq('user_id', userId)
      .eq('corretora', newContaNorm)
      .limit(1);
    var saldoRow = (saldoRes.data && saldoRes.data[0]) || null;
    if (saldoRow) {
      var updatedSaldo = (saldoRow.saldo || 0) + diff;
      await supabase
        .from('saldos_corretora')
        .update({ saldo: updatedSaldo, updated_at: new Date().toISOString() })
        .eq('id', saldoRow.id);
      // Update saldo_apos on the mov
      await supabase.from('movimentacoes').update({ saldo_apos: updatedSaldo }).eq('id', movId);
    }
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
    movs: movs,
  };
}

// ═══════════ DASHBOARD AGGREGATES ═══════════
// computeDashboardFromData — funcao pura que computa o dashboard a partir de dados pre-carregados.
// Usada pelo store (dados ja em memoria) e por getDashboard (busca do banco).
export async function computeDashboardFromData(inputs) {
  var posData = inputs.positions || [];
  var posEncerradas = inputs.encerradas || [];
  var proventosData = inputs.proventos || [];
  var opcoesData = inputs.opcoes || [];
  var rfData = inputs.rf || [];
  var saldosData = inputs.saldos || [];
  var profileData = inputs.profile || {};
  var snapshotsData = inputs.snapshots || [];
  var portfolioId = inputs.portfolioId || null;
  var userId = inputs.userId || null;

  try {
    var now = new Date();
    var mesAtual = now.getMonth();
    var anoAtual = now.getFullYear();

    var patrimonioAcoes = 0;
    for (var pi = 0; pi < posData.length; pi++) {
      patrimonioAcoes += posData[pi].quantidade * (posData[pi].preco_atual || posData[pi].pm);
    }

    // ── Renda Fixa ──
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
    // Saldos só entram no patrimônio global (sem filtro de portfolio)
    var patrimonio = patrimonioAcoes + rfTotalAplicado + (portfolioId ? 0 : saldoLivreTotal);

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

    // proventosData ja vem dos inputs
    var dividendosMes = 0;
    var dividendosMesAnterior = 0;
    var dividendosRecebidosMes = 0;
    var dividendosAReceberMes = 0;
    var proventosMesDetalhe = [];
    var todayDateStr = now.toISOString().substring(0, 10);

    // posCategoria: ticker → categoria (precisa ser criado antes do loop de proventos)
    var posCategoria = {};
    var posDataRawForCat = posData;
    for (var pcii = 0; pcii < posDataRawForCat.length; pcii++) {
      posCategoria[(posDataRawForCat[pcii].ticker || '').toUpperCase().trim()] = posDataRawForCat[pcii].categoria || 'acao';
    }
    // Helper: JCP tem 15% IR retido na fonte — mostrar valor liquido
    function provValLiquido(prov) {
      var bruto = (prov.valor_por_cota || 0) * (prov.quantidade || 0);
      var tipo = (prov.tipo_provento || prov.tipo || '').toLowerCase();
      if (tipo === 'jcp') return bruto * 0.85;
      return bruto;
    }
    for (var di = 0; di < proventosData.length; di++) {
      var provDateStr = (proventosData[di].data_pagamento || '').substring(0, 10);
      var provVal = provValLiquido(proventosData[di]);
      if (provDateStr.substring(0, 7) === prefixMesAtual) {
        dividendosMes += provVal;
        if (provDateStr <= todayDateStr) {
          dividendosRecebidosMes += provVal;
        } else {
          dividendosAReceberMes += provVal;
        }
        var provTicker = (proventosData[di].ticker || '').toUpperCase().trim();
        proventosMesDetalhe.push({
          ticker: provTicker,
          tipo: proventosData[di].tipo_provento || proventosData[di].tipo || 'dividendo',
          valor: provVal,
          data: provDateStr,
          recebido: provDateStr <= todayDateStr,
          valor_por_cota: proventosData[di].valor_por_cota || 0,
          quantidade: proventosData[di].quantidade || 0,
          por_corretora: proventosData[di].por_corretora || null,
          corretora: proventosData[di].corretora || null,
          data_com: proventosData[di].data_com || null,
          data_pagamento: proventosData[di].data_pagamento || null,
          categoria: posCategoria[provTicker] || 'acao',
        });
      } else if (provDateStr.substring(0, 7) === prefixMesAnterior) {
        dividendosMesAnterior += provVal;
      }
    }

    // ── Dividendos últimos 12 meses (para DY) ──
    var d12mAgo = new Date(anoAtual, mesAtual - 12, now.getDate());
    var cutoff12m = d12mAgo.toISOString().substring(0, 10);
    var dividendos12m = 0;
    for (var dy12 = 0; dy12 < proventosData.length; dy12++) {
      var dy12Date = (proventosData[dy12].data_pagamento || '').substring(0, 10);
      if (dy12Date >= cutoff12m && dy12Date <= todayDateStr) {
        dividendos12m += provValLiquido(proventosData[dy12]);
      }
    }
    var dyCarteira = patrimonioAcoes > 0 ? (dividendos12m / patrimonioAcoes) * 100 : 0;

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
    var dividendosCatMes = { acao: 0, fii: 0, etf: 0, stock_int: 0, bdr: 0, adr: 0, reit: 0 };
    var dividendosCatMesAnt = { acao: 0, fii: 0, etf: 0, stock_int: 0, bdr: 0, adr: 0, reit: 0 };
    // Enriquecer posCategoria com posicoes encerradas
    for (var pei = 0; pei < posEncerradas.length; pei++) {
      var peKey = (posEncerradas[pei].ticker || '').toUpperCase().trim();
      if (!posCategoria[peKey]) {
        posCategoria[peKey] = posEncerradas[pei].categoria || 'acao';
      }
    }
    for (var dci = 0; dci < proventosData.length; dci++) {
      var dcDateStr = (proventosData[dci].data_pagamento || '').substring(0, 10);
      var dcVal = provValLiquido(proventosData[dci]);
      var dcCat = posCategoria[(proventosData[dci].ticker || '').toUpperCase().trim()] || 'acao';
      if (dcCat !== 'acao' && dcCat !== 'fii' && dcCat !== 'etf' && dcCat !== 'stock_int' && dcCat !== 'bdr' && dcCat !== 'adr' && dcCat !== 'reit') dcCat = 'acao';
      if (dcDateStr.substring(0, 7) === prefixMesAtual) {
        dividendosCatMes[dcCat] += dcVal;
      } else if (dcDateStr.substring(0, 7) === prefixMesAnterior) {
        dividendosCatMesAnt[dcCat] += dcVal;
      }
    }

    // ── Opções ──
    var todasOpcoes = opcoesData;
    var opsAtivas = [];
    for (var oi = 0; oi < todasOpcoes.length; oi++) {
      if (parseLocalDate(todasOpcoes[oi].vencimento) > now) {
        opsAtivas.push(todasOpcoes[oi]);
      }
    }

    // Premios recebidos no mes (D+1 da data_abertura)
    var premiosMes = 0;
    var premiosMesAnterior = 0;
    var premiosMesDetalhe = [];
    for (var opi = 0; opi < todasOpcoes.length; opi++) {
      var opItem = todasOpcoes[opi];
      var opDir = opItem.direcao || 'venda';
      if (opDir !== 'venda' && opDir !== 'lancamento') continue;
      var opPremTotal = (opItem.premio || 0) * (opItem.quantidade || 0);
      if (opPremTotal <= 0) continue;

      // Data de recebimento = data_abertura + 1 dia (D+1)
      var dataRef = opItem.data_abertura || opItem.created_at || opItem.vencimento;
      var dReceb = parseLocalDate(dataRef);
      dReceb.setDate(dReceb.getDate() + 1);

      if (dReceb.getMonth() === mesAtual && dReceb.getFullYear() === anoAtual) {
        premiosMes += opPremTotal;
        premiosMesDetalhe.push({
          ticker: (opItem.ativo_base || '').toUpperCase().trim(),
          ticker_opcao: opItem.ticker_opcao || '',
          tipo_opcao: (opItem.tipo || 'call').toUpperCase(),
          valor: opPremTotal,
          quantidade: opItem.quantidade || 0,
          corretora: opItem.corretora || '',
        });
      } else if (dReceb.getMonth() === mesAnterior && dReceb.getFullYear() === anoMesAnterior) {
        premiosMesAnterior += opPremTotal;
      }
    }

    // Recompra por mes (data de fechamento) + P&L mensal ultimos 3 meses
    var recompraMes = 0;
    var recompraMesAnterior = 0;
    var recompraMesDetalhe = [];
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
        recompraMesDetalhe.push({
          ticker: (rcOp.ativo_base || '').toUpperCase().trim(),
          ticker_opcao: rcOp.ticker_opcao || '',
          tipo_opcao: (rcOp.tipo || 'call').toUpperCase(),
          valor: rcPremFech,
          quantidade: rcOp.quantidade || 0,
          corretora: rcOp.corretora || '',
        });
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

    // Media 3 meses de dividendos
    var divMensal3m = {};
    for (var dm3i = 0; dm3i < proventosData.length; dm3i++) {
      var dm3Date = (proventosData[dm3i].data_pagamento || '').substring(0, 10);
      var dm3Month = dm3Date.substring(0, 7);
      if (!divMensal3m[dm3Month]) divMensal3m[dm3Month] = 0;
      divMensal3m[dm3Month] += provValLiquido(proventosData[dm3i]);
    }
    var dividendosMedia3m = 0;
    var somaDm3 = 0;
    var countDm3 = 0;
    for (var dm3j = 0; dm3j < meses3m.length; dm3j++) {
      somaDm3 += (divMensal3m[meses3m[dm3j]] || 0);
      countDm3++;
    }
    dividendosMedia3m = countDm3 > 0 ? somaDm3 / countDm3 : 0;

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
        var daVal = provValLiquido(proventosData[dai]);
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
      var vencOp = parseLocalDate(opsAtivas[ov].vencimento);
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
      var vencDate = parseLocalDate(rfData[rv].vencimento);
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
      var dEvt = parseLocalDate(oEvt.vencimento);
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
      var dRf = parseLocalDate(rEvt.vencimento);
      eventos.push({
        data: rEvt.vencimento,
        dia: dRf.getDate().toString(),
        diaSemana: diasSemana[dRf.getDay()],
        titulo: (rEvt.tipo || 'RF').toUpperCase() + ' ' + (rEvt.emissor || ''),
        detalhe: 'R$ ' + ((rEvt.valor_aplicado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + ' · ' + (rEvt.taxa || 0) + '% a.a.',
        tipo: 'rf',
      });
    }

    // Proventos futuros (proximos 30 dias)
    var futureLimit = new Date(now);
    futureLimit.setDate(futureLimit.getDate() + 30);
    var futureLimitStr = futureLimit.toISOString().substring(0, 10);
    for (var epv = 0; epv < proventosData.length; epv++) {
      var pEvt = proventosData[epv];
      var pDate = (pEvt.data_pagamento || '').substring(0, 10);
      if (pDate > todayDateStr && pDate <= futureLimitStr) {
        var dProv = parseLocalDate(pDate);
        var pTicker = (pEvt.ticker || '').toUpperCase().trim();
        var pTipo = (pEvt.tipo_provento || pEvt.tipo || 'dividendo').toUpperCase();
        var pLabel = pTipo === 'JCP' ? 'JCP' : pTipo === 'RENDIMENTO' ? 'REND' : 'DIV';
        var pValor = provValLiquido(pEvt);
        eventos.push({
          data: pDate,
          dia: dProv.getDate().toString(),
          diaSemana: diasSemana[dProv.getDay()],
          titulo: pLabel + ' ' + pTicker,
          detalhe: 'R$ ' + pValor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' · ' + (pEvt.quantidade || 0) + ' cotas',
          tipo: 'dividendo',
        });
      }
    }

    eventos.sort(function(a, b) { return new Date(a.data) - new Date(b.data); });

    // ── Histórico real do patrimônio ──
    var histOpsQuery = supabase
      .from('operacoes')
      .select('data, tipo, ticker, quantidade, preco, custo_corretagem, custo_emolumentos, custo_impostos, portfolio_id')
      .eq('user_id', userId)
      .in('tipo', ['compra', 'venda'])
      .order('data', { ascending: true });

    histOpsQuery = applyPortfolioFilter(histOpsQuery, portfolioId);

    var allOpsResult = await histOpsQuery;
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

    // Merge snapshots (per-portfolio or global depending on portfolioId filter)
    if (snapshotsData.length > 0) {
      var snapshotByDate = {};
      for (var sn = 0; sn < snapshotsData.length; sn++) {
        snapshotByDate[snapshotsData[sn].data] = snapshotsData[sn].valor;
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
      // Filter out anomalous snapshots (>40% drop from neighbors = likely incomplete price data)
      var mergedDates = Object.keys(historyByDate).sort();
      var mergedHistory = [];
      for (var mh = 0; mh < mergedDates.length; mh++) {
        var mDate = mergedDates[mh];
        var mVal = snapshotByDate[mDate] !== undefined ? snapshotByDate[mDate] : historyByDate[mDate];
        mergedHistory.push({ date: mDate, value: mVal });
      }
      // Filtro robusto de snapshots anomalos:
      // 1. Remove valores zero/negativos/NaN
      // 2. Remove quedas >30% de um dia pro outro (precos incompletos)
      // 3. Remove picos >50% de um dia pro outro (precos duplicados)
      // 4. Interpola linearmente os pontos removidos
      if (mergedHistory.length > 2) {
        // Passo 1: remover valores invalidos
        var validHistory = [];
        for (var vh = 0; vh < mergedHistory.length; vh++) {
          var vVal = mergedHistory[vh].value;
          if (!vVal || vVal <= 0 || vVal !== vVal) continue; // NaN check
          validHistory.push(mergedHistory[vh]);
        }

        // Passo 2: calcular mediana pra ter referencia estavel
        var valoresOrdenados = [];
        for (var vo = 0; vo < validHistory.length; vo++) {
          valoresOrdenados.push(validHistory[vo].value);
        }
        valoresOrdenados.sort(function(a, b) { return a - b; });
        var mediana = valoresOrdenados.length > 0 ? valoresOrdenados[Math.floor(valoresOrdenados.length / 2)] : 0;

        // Passo 3: remover outliers (mais de 50% abaixo ou 100% acima da mediana)
        if (mediana > 0 && validHistory.length > 4) {
          var cleanHistory = [];
          for (var ch = 0; ch < validHistory.length; ch++) {
            var chVal = validHistory[ch].value;
            // Permitir variacao de 50% abaixo a 100% acima da mediana
            if (chVal < mediana * 0.5 || chVal > mediana * 2.0) {
              // Outlier — pular (exceto primeiro e ultimo ponto que podem ser crescimento real)
              if (ch > 2 && ch < validHistory.length - 2) continue;
            }
            cleanHistory.push(validHistory[ch]);
          }
          // So aplica se nao removeu tudo
          if (cleanHistory.length >= 2) {
            validHistory = cleanHistory;
          }
        }

        // Passo 4: remover variacoes diarias impossiveis (>30% queda ou >40% subida em 1 dia)
        if (validHistory.length > 2) {
          var smoothHistory = [validHistory[0]];
          for (var sh = 1; sh < validHistory.length; sh++) {
            var prevVal = smoothHistory[smoothHistory.length - 1].value;
            var curVal = validHistory[sh].value;
            if (prevVal > 0) {
              var variacao = (curVal / prevVal) - 1;
              if (variacao < -0.30 || variacao > 0.40) {
                // Variacao impossivel — interpolar entre anterior e proximo valido
                continue;
              }
            }
            smoothHistory.push(validHistory[sh]);
          }
          validHistory = smoothHistory;
        }

        mergedHistory = validHistory;
      }

      // Replace today's point with real market value
      if (mergedHistory.length > 0 && mergedHistory[mergedHistory.length - 1].date === todayStr) {
        mergedHistory[mergedHistory.length - 1].value = patrimonio;
      }

      patrimonioHistory = mergedHistory;
    } else {
      // No snapshots available: just add today's point with current value
      var todayExists = false;
      for (var tci = 0; tci < patrimonioHistory.length; tci++) {
        if (patrimonioHistory[tci].date === todayStr) {
          patrimonioHistory[tci].value = patrimonio;
          todayExists = true;
          break;
        }
      }
      if (!todayExists && patrimonio > 0) {
        patrimonioHistory.push({ date: todayStr, value: patrimonio });
      }
    }

    // Construir series de investido e saldos a partir dos snapshots com campos novos
    var investidoHistory = [];
    var saldosHistory = [];
    for (var ihi = 0; ihi < snapshotsData.length; ihi++) {
      var ihSnap = snapshotsData[ihi];
      if (ihSnap.valor_investido != null) {
        investidoHistory.push({ date: ihSnap.data, value: ihSnap.valor_investido });
      }
      if (ihSnap.valor_saldos != null) {
        saldosHistory.push({ date: ihSnap.data, value: ihSnap.valor_saldos });
      }
    }
    // Adicionar ponto de hoje com valores atuais
    if (investidoHistory.length > 0 || saldosHistory.length > 0) {
      investidoHistory.push({ date: todayStr, value: patrimonioAcoes + rfTotalAplicado });
      saldosHistory.push({ date: todayStr, value: saldoTotal });
    }

    var metaMensal = profileData.meta_mensal || 6000;
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
      opsAtivasData: opsAtivas,
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
      investidoHistory: investidoHistory,
      saldosHistory: saldosHistory,
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
      dividendosMedia3m: dividendosMedia3m,
      rendaMediaAnual: rendaMediaAnual,
      rendaAnualByMonth: rendaAnualByMonth,
      recompraMes: recompraMes,
      proventosMesDetalhe: proventosMesDetalhe,
      premiosMesDetalhe: premiosMesDetalhe,
      recompraMesDetalhe: recompraMesDetalhe,
      dividendos12m: dividendos12m,
      dyCarteira: dyCarteira,
      lastDividendSync: profileData.last_dividend_sync || null,
      selic: profileData.selic || null,
    };
  } catch (err) {
    console.error('Dashboard error:', err);
    return {
      patrimonio: 0, patrimonioAcoes: 0, rfTotalAplicado: 0,
      rfRendaMensal: 0, dividendosMes: 0, premiosMes: 0,
      rendaTotalMes: 0, rentabilidadeMes: 0,
      opsAtivas: 0, opsAtivasData: [], opsProxVenc: 0, meta: 6000,
      positions: [], saldos: [], saldoTotal: 0,
      rendaFixa: [], eventos: [],
      patrimonioHistory: [],
      dividendosMesAnterior: 0, premiosMesAnterior: 0, rendaTotalMesAnterior: 0,
      dividendosCatMes: { acao: 0, fii: 0, etf: 0, stock_int: 0, bdr: 0, adr: 0, reit: 0 },
      dividendosCatMesAnt: { acao: 0, fii: 0, etf: 0, stock_int: 0, bdr: 0, adr: 0, reit: 0 },
      proventosHoje: [],
      dividendosRecebidosMes: 0,
      dividendosAReceberMes: 0,
      plMes: 0,
      plMesAnterior: 0,
      plMedia3m: 0,
      dividendosMedia3m: 0,
      rendaMediaAnual: 0,
      recompraMes: 0,
      proventosMesDetalhe: [],
      premiosMesDetalhe: [],
      recompraMesDetalhe: [],
      dividendos12m: 0,
      dyCarteira: 0,
    };
  }
}

export async function getDashboard(userId, portfolioId) {
  try {
    var results = await Promise.all([
      getPositions(userId, portfolioId || undefined),
      getProventos(userId, { limit: 1000, portfolioId: portfolioId || undefined }),
      getOpcoes(userId, portfolioId || undefined),
      getRendaFixa(userId, portfolioId || undefined),
      getSaldos(userId),
      getProfile(userId),
      getPatrimonioSnapshots(userId, portfolioId || undefined),
    ]);
    var posDataRaw = results[0].data || [];
    var posData;
    try {
      posData = await enrichPositionsWithPrices(posDataRaw);
    } catch (e) {
      posData = posDataRaw;
    }
    return computeDashboardFromData({
      userId: userId,
      positions: posData,
      encerradas: results[0].encerradas || [],
      proventos: (results[1] && results[1].data) || [],
      opcoes: (results[2] && results[2].data) || [],
      rf: (results[3] && results[3].data) || [],
      saldos: (results[4] && results[4].data) || {},
      profile: (results[5] && results[5].data) || {},
      snapshots: results[6] || [],
      portfolioId: portfolioId,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    return computeDashboardFromData({});
  }
}

// ═══════════ LIGHTWEIGHT PORTFOLIO PATRIMONIOS ═══════════
// Returns { portfolioId: patrimonio } without full getDashboard overhead
// Reuses priceMap from already-enriched positions to avoid extra API calls
export async function getPortfolioPatrimonios(userId, portfolioIds, priceMap) {
  var result = {};
  var promises = [];
  for (var i = 0; i < portfolioIds.length; i++) {
    (function(pfId) {
      var actualId = pfId === '__null__' ? '__null__' : pfId;
      var p = Promise.all([
        getPositions(userId, actualId),
        getRendaFixa(userId, actualId),
      ]).then(function(res) {
        var posData = res[0].data || [];
        var rfData = res[1].data || [];
        var total = 0;
        for (var pi = 0; pi < posData.length; pi++) {
          var ticker = (posData[pi].ticker || '').toUpperCase().trim();
          var price = (priceMap && priceMap[ticker]) || posData[pi].pm || 0;
          total += posData[pi].quantidade * price;
        }
        for (var ri = 0; ri < rfData.length; ri++) {
          total += (rfData[ri].valor_aplicado || 0);
        }
        result[pfId] = total;
      }).catch(function() { result[pfId] = 0; });
      promises.push(p);
    })(portfolioIds[i]);
  }
  await Promise.all(promises);
  return result;
}

// ═══════════ IR PAGAMENTOS ═══════════

export async function getIRPagamentos(userId) {
  var result = await supabase
    .from('ir_pagamentos')
    .select('*')
    .eq('user_id', userId);
  return { data: result.data || [], error: result.error };
}

export async function upsertIRPagamento(userId, month, pago) {
  var result = await supabase
    .from('ir_pagamentos')
    .upsert({
      user_id: userId,
      month: month,
      pago: pago,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,month' });
  return { error: result.error };
}

// ═══════════ SAVED ANALYSES ═══════════

export async function getSavedAnalyses(userId) {
  var result = await supabase
    .from('saved_analyses')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  return { data: result.data || [], error: result.error };
}

export async function addSavedAnalysis(userId, analysis) {
  var payload = { user_id: userId };
  var keys = Object.keys(analysis);
  for (var i = 0; i < keys.length; i++) {
    payload[keys[i]] = analysis[keys[i]];
  }
  var result = await supabase
    .from('saved_analyses')
    .insert(payload)
    .select()
    .single();
  return { data: result.data, error: result.error };
}

export async function deleteSavedAnalysis(userId, id) {
  var result = await supabase
    .from('saved_analyses')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  return { error: result.error };
}

// ═══════════ ORÇAMENTOS ═══════════

export async function getOrcamentos(userId) {
  var result = await supabase
    .from('orcamentos')
    .select('*')
    .eq('user_id', userId)
    .order('grupo');
  return { data: result.data || [], error: result.error };
}

export async function upsertOrcamentos(userId, budgets) {
  // budgets: [{ grupo, valor_limite, ativo, moeda }]
  var errors = [];
  for (var i = 0; i < budgets.length; i++) {
    var b = budgets[i];
    var result = await supabase
      .from('orcamentos')
      .upsert({
        user_id: userId,
        grupo: b.grupo,
        valor_limite: b.valor_limite,
        ativo: b.ativo !== false,
        moeda: b.moeda || 'BRL',
      }, { onConflict: 'user_id,grupo' });
    if (result.error) errors.push(result.error);
  }
  return { error: errors.length > 0 ? errors[0] : null };
}

export async function deleteOrcamento(userId, grupo) {
  var result = await supabase
    .from('orcamentos')
    .delete()
    .eq('user_id', userId)
    .eq('grupo', grupo);
  return { error: result.error };
}

// ═══════════ TRANSAÇÕES RECORRENTES ═══════════

export async function getRecorrentes(userId) {
  var result = await supabase
    .from('transacoes_recorrentes')
    .select('*')
    .eq('user_id', userId)
    .order('proximo_vencimento');
  return { data: result.data || [], error: result.error };
}

export async function addRecorrente(userId, data) {
  var row = {
    user_id: userId,
    tipo: data.tipo,
    categoria: data.categoria,
    subcategoria: data.subcategoria || null,
    conta: (data.conta || '').toUpperCase(),
    valor: data.valor,
    descricao: data.descricao || null,
    frequencia: data.frequencia,
    dia_vencimento: data.dia_vencimento || 1,
    proximo_vencimento: data.proximo_vencimento,
    ativo: data.ativo !== false,
  };
  var result = await supabase.from('transacoes_recorrentes').insert(row).select();
  return { data: result.data && result.data[0], error: result.error };
}

export async function updateRecorrente(userId, id, updates) {
  var result = await supabase
    .from('transacoes_recorrentes')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId);
  return { error: result.error };
}

export async function deleteRecorrente(id) {
  var result = await supabase
    .from('transacoes_recorrentes')
    .delete()
    .eq('id', id);
  return { error: result.error };
}

export async function advanceRecorrente(id, novaData) {
  var result = await supabase
    .from('transacoes_recorrentes')
    .update({ proximo_vencimento: novaData })
    .eq('id', id);
  return { error: result.error };
}

// ═══════════ FINANCAS SUMMARY ═══════════

var finCats = require('../constants/financeCategories');
var AUTO_CATS_SET = {};
for (var aci = 0; aci < finCats.AUTO_CATEGORIAS.length; aci++) {
  AUTO_CATS_SET[finCats.AUTO_CATEGORIAS[aci]] = true;
}

export async function getFinancasSummary(userId, mes, ano) {
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
  var totalEntradasPessoais = 0;
  var totalSaidasPessoais = 0;
  var porGrupo = {};
  var porGrupoEntrada = {};
  var porSubcategoria = {};
  var porMeioPagamento = {};
  var movsPessoais = [];
  // Opcoes: resultado liquido (premios - recompras)
  var opcoesEntradas = 0;
  var opcoesSaidas = 0;

  // Categorias de renda passiva (contam como entradas pessoais)
  var RENDA_PASSIVA = { dividendo: true, jcp: true, rendimento_fii: true, rendimento_rf: true };
  // Categorias de opcoes (resultado liquido)
  var OPCOES_CAT = { premio_opcao: true, recompra_opcao: true, exercicio_opcao: true };
  // Operacoes de sistema (excluir de pessoais)
  var SISTEMA_CAT = { transferencia: true, ajuste_manual: true, pagamento_fatura: true, deposito: true };
  // Operacoes de compra/venda de ativos (excluir de pessoais)
  var TRADE_CAT = { compra_ativo: true, venda_ativo: true };

  for (var i = 0; i < movs.length; i++) {
    var m = movs[i];
    var isAuto = AUTO_CATS_SET[m.categoria] || false;
    var cat = m.categoria || '';

    if (m.tipo === 'entrada') totalEntradas += (m.valor || 0);
    else if (m.tipo === 'saida') totalSaidas += (m.valor || 0);

    // Renda passiva: sempre conta como entrada pessoal
    if (RENDA_PASSIVA[cat]) {
      totalEntradasPessoais += (m.valor || 0);
      movsPessoais.push(m);
    }
    // Opcoes: acumular para resultado liquido
    else if (OPCOES_CAT[cat]) {
      if (m.tipo === 'entrada') opcoesEntradas += (m.valor || 0);
      else opcoesSaidas += (m.valor || 0);
      movsPessoais.push(m);
    }
    // Sistema ou trades: excluir de pessoais
    else if (SISTEMA_CAT[cat] || TRADE_CAT[cat]) {
      // nao conta como pessoal
    }
    // Tudo mais: despesas, salario, etc
    else {
      if (m.tipo === 'entrada') totalEntradasPessoais += (m.valor || 0);
      else if (m.tipo === 'saida') totalSaidasPessoais += (m.valor || 0);
      movsPessoais.push(m);
    }

    // Agrupar por grupo (exclui transferencia/ajuste_manual que sao operacoes de sistema)
    var grupo = finCats.getGrupo(m.categoria, m.subcategoria);
    var isSistema = SISTEMA_CAT[cat] || false;
    if (m.tipo === 'saida' && !isSistema) {
      if (!porGrupo[grupo]) porGrupo[grupo] = 0;
      porGrupo[grupo] += (m.valor || 0);
    }
    if (m.tipo === 'entrada' && !isAuto) {
      if (!porGrupoEntrada[grupo]) porGrupoEntrada[grupo] = 0;
      porGrupoEntrada[grupo] += (m.valor || 0);
    }

    // Agrupar por subcategoria (se presente)
    if (m.subcategoria) {
      if (!porSubcategoria[m.subcategoria]) porSubcategoria[m.subcategoria] = 0;
      if (m.tipo === 'saida') porSubcategoria[m.subcategoria] += (m.valor || 0);
    }

    // Agrupar por meio de pagamento (saidas pessoais)
    if (m.tipo === 'saida' && !isSistema) {
      var meio = m.meio_pagamento || 'outro';
      if (!porMeioPagamento[meio]) porMeioPagamento[meio] = 0;
      porMeioPagamento[meio] += (m.valor || 0);
    }
  }

  // Resultado liquido de opcoes: positivo = entrada, negativo = saida
  var opcoesLiquido = opcoesEntradas - opcoesSaidas;
  if (opcoesLiquido > 0) totalEntradasPessoais += opcoesLiquido;
  else if (opcoesLiquido < 0) totalSaidasPessoais += Math.abs(opcoesLiquido);

  return {
    totalEntradas: totalEntradas,
    totalSaidas: totalSaidas,
    totalEntradasPessoais: totalEntradasPessoais,
    totalSaidasPessoais: totalSaidasPessoais,
    saldo: totalEntradas - totalSaidas,
    saldoPessoal: totalEntradasPessoais - totalSaidasPessoais,
    porGrupo: porGrupo,
    porGrupoEntrada: porGrupoEntrada,
    porSubcategoria: porSubcategoria,
    porMeioPagamento: porMeioPagamento,
    movsPessoais: movsPessoais,
    opcoesLiquido: opcoesLiquido,
    total: movs.length,
  };
}

// Processa transações recorrentes vencidas — cria movimentação real + avança data
export async function processRecorrentes(userId) {
  var hoje = new Date();
  var hojeStr = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0') + '-' + String(hoje.getDate()).padStart(2, '0');

  var result = await supabase
    .from('transacoes_recorrentes')
    .select('*')
    .eq('user_id', userId)
    .eq('ativo', true)
    .lte('proximo_vencimento', hojeStr);

  var recorrentes = result.data || [];
  var criadas = 0;

  for (var i = 0; i < recorrentes.length; i++) {
    var r = recorrentes[i];
    // Criar movimentação real
    var mov = {
      tipo: r.tipo,
      categoria: r.categoria,
      subcategoria: r.subcategoria,
      conta: r.conta,
      valor: r.valor,
      descricao: r.descricao || '',
      data: r.proximo_vencimento,
    };
    var addResult = await addMovimentacaoComSaldo(userId, mov);
    if (!addResult.error) {
      criadas++;
      // Avançar próximo vencimento
      var prox = calcProximoVencimento(r.proximo_vencimento, r.frequencia, r.dia_vencimento);
      await advanceRecorrente(r.id, prox);
    }
  }

  return { criadas: criadas, total: recorrentes.length };
}

function calcProximoVencimento(dataAtual, frequencia, diaVenc) {
  var parts = dataAtual.split('-');
  var y = parseInt(parts[0]);
  var m = parseInt(parts[1]) - 1; // 0-indexed
  var d = parseInt(parts[2]);
  var dt = new Date(y, m, d);

  if (frequencia === 'semanal') {
    dt.setDate(dt.getDate() + 7);
  } else if (frequencia === 'quinzenal') {
    dt.setDate(dt.getDate() + 15);
  } else if (frequencia === 'mensal') {
    dt.setMonth(dt.getMonth() + 1);
    // Clamp ao dia de vencimento (ex: dia 31 em fevereiro → 28/29)
    if (diaVenc) {
      var maxDay = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
      dt.setDate(Math.min(diaVenc, maxDay));
    }
  } else if (frequencia === 'anual') {
    dt.setFullYear(dt.getFullYear() + 1);
    if (diaVenc) {
      var maxD = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
      dt.setDate(Math.min(diaVenc, maxD));
    }
  }

  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}

// ═══════════ CARTÕES DE CRÉDITO ═══════════

export async function getCartoes(userId, portfolioId) {
  var query = supabase
    .from('cartoes_credito')
    .select('*')
    .eq('user_id', userId)
    .eq('ativo', true)
    .order('created_at');

  query = applyPortfolioFilter(query, portfolioId);

  var result = await query;
  return { data: result.data || [], error: result.error };
}

export async function addCartao(userId, data) {
  var payload = {
    user_id: userId,
    ultimos_digitos: data.ultimos_digitos,
    bandeira: data.bandeira,
    apelido: data.apelido,
    dia_fechamento: data.dia_fechamento,
    dia_vencimento: data.dia_vencimento,
    limite: data.limite,
    moeda: data.moeda || 'BRL',
    conta_vinculada: data.conta_vinculada,
    tipo_beneficio: data.tipo_beneficio,
    programa_nome: data.programa_nome,
  };
  if (data.portfolio_id !== undefined) {
    payload.portfolio_id = data.portfolio_id;
  }
  var result = await supabase
    .from('cartoes_credito')
    .insert(payload)
    .select()
    .single();
  return { data: result.data, error: result.error };
}

export async function updateCartao(userId, id, updates) {
  var result = await supabase
    .from('cartoes_credito')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId);
  return { error: result.error };
}

export async function deleteCartao(id) {
  var result = await supabase
    .from('cartoes_credito')
    .update({ ativo: false })
    .eq('id', id);
  return { error: result.error };
}

export async function hardDeleteCartao(userId, id) {
  // 1. Desvincular movimentacoes
  var r1 = await supabase
    .from('movimentacoes')
    .update({ cartao_id: null })
    .eq('cartao_id', id);
  if (r1.error) return { error: r1.error };

  // 2. Excluir regras de pontos
  var r2 = await supabase
    .from('regras_pontos')
    .delete()
    .eq('cartao_id', id);
  if (r2.error) return { error: r2.error };

  // 3. Excluir cartao
  var r3 = await supabase
    .from('cartoes_credito')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  return { error: r3.error };
}

function daysInMonth(y, m) {
  return new Date(y, m + 1, 0).getDate();
}

function padTwo(n) {
  return String(n).padStart(2, '0');
}

function formatDateStr(dt) {
  return dt.getFullYear() + '-' + padTwo(dt.getMonth() + 1) + '-' + padTwo(dt.getDate());
}

export async function getFatura(userId, cartaoId, mes, ano) {
  // 1. Buscar cartao para obter dia_fechamento e dia_vencimento
  var cardResult = await supabase
    .from('cartoes_credito')
    .select('*')
    .eq('id', cartaoId)
    .eq('user_id', userId)
    .single();
  if (cardResult.error) return { data: null, error: cardResult.error };
  var card = cardResult.data;

  var diaFech = card.dia_fechamento;
  var diaVenc = card.dia_vencimento;

  // 2. Calcular cycleEnd = dia_fechamento do mes dado (clamped)
  var cycleEndDate = new Date(ano, mes - 1, Math.min(diaFech, daysInMonth(ano, mes - 1)));

  // 3. Calcular cycleStart = dia_fechamento + 1 do mes anterior
  var prevM = mes === 1 ? 12 : mes - 1;
  var prevY = mes === 1 ? ano - 1 : ano;
  var startDay = Math.min(diaFech + 1, daysInMonth(prevY, prevM - 1));
  var cycleStartDate = new Date(prevY, prevM - 1, startDay);

  var cycleStartStr = formatDateStr(cycleStartDate);
  var cycleEndStr = formatDateStr(cycleEndDate);

  // 4. Buscar movimentacoes do ciclo (excluindo pagamento_fatura)
  var movsResult = await supabase
    .from('movimentacoes')
    .select('*')
    .eq('user_id', userId)
    .eq('cartao_id', cartaoId)
    .gte('data', cycleStartStr)
    .lte('data', cycleEndStr)
    .neq('categoria', 'pagamento_fatura')
    .order('data', { ascending: false });
  var movs = movsResult.data || [];

  // 5. Somar total dos gastos do ciclo
  var totalCiclo = 0;
  for (var i = 0; i < movs.length; i++) {
    totalCiclo += (movs[i].valor || 0);
  }

  // Total final = gastos do ciclo
  var total = totalCiclo;

  // 6. Calcular data de vencimento (mes seguinte ao fechamento por padrao)
  var dueMonth = mes === 12 ? 1 : mes + 1;
  var dueYear = mes === 12 ? ano + 1 : ano;
  // Se dia_vencimento > dia_fechamento, vencimento e no mesmo mes do fechamento
  if (diaVenc > diaFech) {
    dueMonth = mes;
    dueYear = ano;
  }
  var dueDateClamped = Math.min(diaVenc, daysInMonth(dueYear, dueMonth - 1));
  var dueDate = new Date(dueYear, dueMonth - 1, dueDateClamped);
  var dueDateStr = formatDateStr(dueDate);

  // 7. Verificar se fatura foi paga (pagamento_fatura com referencia ao cartao no periodo de pagamento)
  var pagWindow = new Date(cycleEndDate.getTime());
  pagWindow.setDate(pagWindow.getDate() + 60);
  var pagResult = await supabase
    .from('movimentacoes')
    .select('id, valor')
    .eq('user_id', userId)
    .eq('categoria', 'pagamento_fatura')
    .eq('cartao_id', cartaoId)
    .gte('data', cycleEndStr)
    .lte('data', formatDateStr(pagWindow));
  var pagMovs = pagResult.data || [];
  var pago = pagMovs.length > 0;
  var pagamentoTotal = 0;
  for (var p = 0; p < pagMovs.length; p++) {
    pagamentoTotal += (pagMovs[p].valor || 0);
  }

  return {
    data: {
      movs: movs,
      total: total,
      cycleStart: cycleStartStr,
      cycleEnd: cycleEndStr,
      dueDate: dueDateStr,
      pago: pago,
      pagamentoTotal: pagamentoTotal,
    },
    error: null,
  };
}

export async function addMovimentacaoCartao(userId, mov) {
  var parcelas = mov.parcelas || 1;
  var grupoId = null;
  if (parcelas > 1) {
    grupoId = crypto && crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).substring(2, 10));
  }

  var valorParcela = parcelas > 1 ? Math.round((mov.valor / parcelas) * 100) / 100 : mov.valor;
  var contaLabel = mov.conta || '';

  // Se não tem conta label mas tem cartao_id, buscar dados do cartão
  if (!contaLabel && mov.cartao_id) {
    var cardLookup = await supabase
      .from('cartoes_credito')
      .select('bandeira, ultimos_digitos, apelido')
      .eq('id', mov.cartao_id)
      .single();
    if (cardLookup.data) {
      contaLabel = (cardLookup.data.apelido || (cardLookup.data.bandeira || '').toUpperCase()) + ' ••' + (cardLookup.data.ultimos_digitos || '');
    } else {
      contaLabel = 'CARTÃO ' + (mov.bandeira || '').toUpperCase() + ' ••' + (mov.ultimos_digitos || '');
    }
  } else if (!contaLabel) {
    contaLabel = 'CARTÃO ' + (mov.bandeira || '').toUpperCase() + ' ••' + (mov.ultimos_digitos || '');
  }

  var baseDesc = mov.descricao || '';

  var payloads = [];
  for (var p = 0; p < parcelas; p++) {
    // Calcula data de cada parcela (mes a mes a partir da data original)
    var parcelaDate = mov.data;
    if (p > 0) {
      var dt = new Date(mov.data + 'T12:00:00Z');
      dt.setMonth(dt.getMonth() + p);
      parcelaDate = dt.toISOString().substring(0, 10);
    }

    // Ultima parcela absorve centavos residuais
    var vp = valorParcela;
    if (p === parcelas - 1 && parcelas > 1) {
      vp = Math.round((mov.valor - valorParcela * (parcelas - 1)) * 100) / 100;
    }

    var descParcela = parcelas > 1 ? (baseDesc + ' (' + (p + 1) + '/' + parcelas + ')') : baseDesc;

    var payload = {
      user_id: userId,
      cartao_id: mov.cartao_id,
      tipo: 'saida',
      categoria: mov.categoria,
      subcategoria: mov.subcategoria,
      conta: contaLabel,
      valor: vp,
      descricao: descParcela,
      data: parcelaDate,
      meio_pagamento: mov.meio_pagamento || 'credito',
    };
    if (mov.moeda_original) payload.moeda_original = mov.moeda_original;
    if (mov.valor_original && parcelas > 1) {
      payload.valor_original = Math.round((mov.valor_original / parcelas) * 100) / 100;
    } else if (mov.valor_original) {
      payload.valor_original = mov.valor_original;
    }
    if (mov.taxa_cambio_mov) payload.taxa_cambio_mov = mov.taxa_cambio_mov;
    if (parcelas > 1) {
      payload.parcela_atual = p + 1;
      payload.parcela_total = parcelas;
      payload.parcela_grupo_id = grupoId;
    }
    payloads.push(payload);
  }

  if (payloads.length === 1) {
    var result = await supabase
      .from('movimentacoes')
      .insert(payloads[0])
      .select()
      .single();
    return { data: result.data, error: result.error };
  }

  // Batch insert for parcelas
  var result = await supabase
    .from('movimentacoes')
    .insert(payloads)
    .select();
  return { data: result.data, error: result.error };
}

export async function pagarFatura(userId, cartaoId, conta, valor, moeda, data) {
  var cardResult = await supabase
    .from('cartoes_credito')
    .select('bandeira, ultimos_digitos')
    .eq('id', cartaoId)
    .single();
  var cardLabel = '';
  if (cardResult.data) {
    cardLabel = (cardResult.data.bandeira || '').toUpperCase() + ' •' + (cardResult.data.ultimos_digitos || '');
  }
  var descricao = buildMovDescricao('pagamento_fatura', null, cardLabel);

  var movPayload = {
    conta: conta,
    tipo: 'saida',
    categoria: 'pagamento_fatura',
    valor: valor,
    descricao: descricao,
    data: data,
    cartao_id: cartaoId,
  };
  if (moeda) {
    movPayload.moeda = moeda;
  }
  var result = await addMovimentacaoComSaldo(userId, movPayload);
  return { data: result.data, error: result.error };
}

export async function updateMovimentacao(userId, id, updates) {
  var result = await supabase
    .from('movimentacoes')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId);
  return { error: result.error };
}

// ═══════════ REGRAS DE PONTOS ═══════════

export async function getRegrasPontos(cartaoId) {
  var result = await supabase
    .from('regras_pontos')
    .select('*')
    .eq('cartao_id', cartaoId)
    .order('valor_min');
  return { data: result.data || [], error: result.error };
}

export async function addRegraPontos(cartaoId, regra) {
  var payload = {
    cartao_id: cartaoId,
    moeda: regra.moeda,
    valor_min: regra.valor_min,
    valor_max: regra.valor_max,
    taxa: regra.taxa,
  };
  var result = await supabase
    .from('regras_pontos')
    .insert(payload)
    .select()
    .single();
  return { data: result.data, error: result.error };
}

export async function deleteRegraPontos(id) {
  var result = await supabase
    .from('regras_pontos')
    .delete()
    .eq('id', id);
  return { error: result.error };
}

// ── Gastos Rápidos ──────────────────────────────────────────────────

export async function getGastosRapidos(userId) {
  var result = await getProfile(userId);
  if (result.error) return { data: [], error: result.error };
  var profile = result.data;
  return { data: (profile && profile.gastos_rapidos) || [], error: null };
}

export async function saveGastosRapidos(userId, presets) {
  return await updateProfile(userId, { gastos_rapidos: presets });
}

export async function executeGastoRapido(userId, preset) {
  var now = new Date();
  var yyyy = now.getFullYear();
  var mm = padTwo(now.getMonth() + 1);
  var dd = padTwo(now.getDate());
  var dateStr = yyyy + '-' + mm + '-' + dd;

  var meio = preset.meio_pagamento || 'credito';

  if (meio === 'pix' || meio === 'debito') {
    // PIX ou débito: debita do saldo da conta
    var mov = {
      conta: preset.conta || '',
      moeda: preset.conta_moeda || 'BRL',
      tipo: 'saida',
      categoria: preset.categoria || 'despesa_variavel',
      subcategoria: preset.subcategoria || null,
      valor: preset.valor,
      descricao: preset.label || 'Gasto rápido',
      data: dateStr,
      meio_pagamento: meio,
    };
    return await addMovimentacaoComSaldo(userId, mov);
  }

  // Cartão de crédito (fluxo original)
  var cartaoIdFinal = preset.cartao_id || null;

  // Se não tem cartao_id, tenta cartão principal do profile
  if (!cartaoIdFinal) {
    var profileRes = await getProfile(userId);
    if (profileRes.data && profileRes.data.cartao_principal) {
      cartaoIdFinal = profileRes.data.cartao_principal;
    }
  }

  if (!cartaoIdFinal) {
    return { error: { message: 'Nenhum cartão configurado para este gasto rápido' } };
  }

  // Validar que o cartão existe
  var cardCheck = await supabase
    .from('cartoes_credito')
    .select('id, bandeira, ultimos_digitos')
    .eq('id', cartaoIdFinal)
    .eq('user_id', userId)
    .single();

  if (!cardCheck.data) {
    return { error: { message: 'Cartão não encontrado' } };
  }

  var movCartao = {
    cartao_id: cartaoIdFinal,
    categoria: preset.categoria || 'despesa_variavel',
    subcategoria: preset.subcategoria || null,
    valor: preset.valor,
    descricao: preset.label || 'Gasto rápido',
    data: dateStr,
    meio_pagamento: 'credito',
  };
  return await addMovimentacaoCartao(userId, movCartao);
}

// ═══════════ VIP OVERRIDES ═══════════

export async function checkVipOverride(email) {
  if (!email) return { data: null };
  try {
    var result = await supabase.rpc('check_vip_override', { user_email: email });
    if (result.data && result.data.length > 0) {
      return { data: result.data[0].tier };
    }
    return { data: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

// ═══════════ REFERRALS ═══════════

export async function getReferralsByReferrer(referrerId) {
  var result = await supabase
    .from('referrals')
    .select('*')
    .eq('referrer_id', referrerId)
    .order('created_at', { ascending: false });
  return { data: result.data || [], error: result.error };
}

export async function getReferralCount(referrerId, status) {
  var query = supabase
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('referrer_id', referrerId);
  if (status) query = query.eq('status', status);
  var result = await query;
  return { count: result.count || 0, error: result.error };
}

export async function addReferral(referrerId, referredId, referredEmail, deviceId) {
  var payload = {
    referrer_id: referrerId,
    referred_id: referredId,
    referred_email: referredEmail,
    status: 'pending',
  };
  if (deviceId) payload.device_id = deviceId;
  var result = await supabase
    .from('referrals')
    .insert(payload)
    .select()
    .single();
  return { data: result.data, error: result.error };
}

export async function activateReferral(referredId) {
  var now = new Date().toISOString();
  var result = await supabase
    .from('referrals')
    .update({ status: 'active', activated_at: now })
    .eq('referred_id', referredId)
    .eq('status', 'pending');
  return { data: result.data, error: result.error };
}

export async function findReferrerByCode(code) {
  if (!code) return { data: null };
  var result = await supabase
    .from('profiles')
    .select('id, nome, referral_code')
    .eq('referral_code', code.toUpperCase().trim())
    .single();
  return { data: result.data, error: result.error };
}

export async function applyReferralReward(userId, rewardTier, rewardDays) {
  var endDate = new Date();
  endDate.setDate(endDate.getDate() + rewardDays);
  var endStr = endDate.toISOString().substring(0, 10);
  return await updateProfile(userId, {
    referral_reward_tier: rewardTier,
    referral_reward_end: endStr,
  });
}

// ═══════════ REFERRAL ANTI-FRAUD ═══════════

export async function checkReferralRateLimit(referrerId) {
  try {
    var result = await supabase.rpc('check_referral_rate_limit', { p_referrer_id: referrerId });
    return { count: result.data || 0, error: result.error };
  } catch (e) {
    return { count: 0, error: e };
  }
}

export async function checkReferralDevice(referrerId, deviceId) {
  if (!deviceId) return { count: 0 };
  try {
    var result = await supabase.rpc('check_referral_device', { p_referrer_id: referrerId, p_device_id: deviceId });
    return { count: result.data || 0, error: result.error };
  } catch (e) {
    return { count: 0, error: e };
  }
}

export async function saveDeviceId(userId, deviceId) {
  if (!userId || !deviceId) return;
  return await updateProfile(userId, { device_id: deviceId });
}

// ═══════════ ALERTAS OPCOES ═══════════

export async function getAlertasOpcoes(userId) {
  var result = await supabase
    .from('alertas_opcoes')
    .select('*')
    .eq('user_id', userId)
    .eq('ativo', true)
    .order('criado_em', { ascending: false });
  return { data: result.data || [], error: result.error };
}

export async function addAlertaOpcao(userId, data) {
  var row = {
    user_id: userId,
    ticker_opcao: data.ticker_opcao,
    ativo_base: data.ativo_base,
    tipo_alerta: data.tipo_alerta,
    valor_alvo: data.valor_alvo,
    direcao: data.direcao,
    tipo_opcao: data.tipo_opcao || null,
    strike: data.strike || null,
    vencimento: data.vencimento || null,
  };
  var result = await supabase
    .from('alertas_opcoes')
    .insert(row)
    .select()
    .single();
  return { data: result.data, error: result.error };
}

export async function deleteAlertaOpcao(id) {
  var result = await supabase
    .from('alertas_opcoes')
    .delete()
    .eq('id', id);
  return { error: result.error };
}

export async function markAlertaDisparado(id) {
  var now = new Date().toISOString();
  var result = await supabase
    .from('alertas_opcoes')
    .update({ disparado: true, disparado_em: now })
    .eq('id', id);
  return { error: result.error };
}

export async function deactivateAlertaOpcao(id) {
  var result = await supabase
    .from('alertas_opcoes')
    .update({ ativo: false })
    .eq('id', id);
  return { error: result.error };
}

// ═══════════ PUSH TOKENS ═══════════

export async function savePushToken(userId, token, platform) {
  var result = await supabase
    .from('push_tokens')
    .upsert({
      user_id: userId,
      token: token,
      platform: platform || 'ios',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,token' });
  return { error: result.error };
}

// ═══════════ AI SUMMARIES ═══════════

export async function getLatestAiSummary(userId) {
  var result = await supabase
    .from('ai_summaries')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return { data: result.data, error: result.error };
}

export async function getAiSummaries(userId, limit, offset) {
  var lim = limit || 20;
  var off = offset || 0;
  var result = await supabase
    .from('ai_summaries')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(off, off + lim - 1);
  return { data: result.data || [], error: result.error };
}

export async function markSummaryRead(summaryId) {
  var result = await supabase
    .from('ai_summaries')
    .update({ lido: true })
    .eq('id', summaryId);
  return { error: result.error };
}
