import { supabase } from '../config/supabase';
import { enrichPositionsWithPrices } from './priceService';

// ═══════════ PROFILES ═══════════
export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  return { data, error };
}

export async function updateProfile(userId, updates) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: userId, ...updates, updated_at: new Date().toISOString() });
  return { data, error };
}

// ═══════════ OPERAÇÕES ═══════════
export async function getOperacoes(userId, filters = {}) {
  let query = supabase
    .from('operacoes')
    .select('*')
    .eq('user_id', userId)
    .order('data', { ascending: false });

  if (filters.ticker) query = query.eq('ticker', filters.ticker);
  if (filters.tipo) query = query.eq('tipo', filters.tipo);
  if (filters.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  return { data: data || [], error };
}

export async function addOperacao(userId, operacao) {
  const { data, error } = await supabase
    .from('operacoes')
    .insert({ user_id: userId, ...operacao })
    .select()
    .single();
  return { data, error };
}

export async function deleteOperacao(id) {
  const { error } = await supabase
    .from('operacoes')
    .delete()
    .eq('id', id);
  return { error };
}

// ═══════════ POSIÇÕES (computed view) ═══════════
export async function getPositions(userId) {
  const { data: ops, error } = await supabase
    .from('operacoes')
    .select('*')
    .eq('user_id', userId)
    .in('tipo', ['compra', 'venda'])
    .order('data', { ascending: true });

  if (error) return { data: [], error };

  const positions = {};
  for (const op of ops || []) {
    if (!positions[op.ticker]) {
      positions[op.ticker] = {
        ticker: op.ticker,
        categoria: op.categoria,
        corretora: op.corretora,
        quantidade: 0,
        custo_total: 0,
        pm: 0,
      };
    }
    const p = positions[op.ticker];
    if (op.tipo === 'compra') {
      const custos = (op.custo_corretagem || 0) + (op.custo_emolumentos || 0) + (op.custo_impostos || 0);
      p.custo_total += op.quantidade * op.preco + custos;
      p.quantidade += op.quantidade;
    } else {
      p.quantidade -= op.quantidade;
    }
    p.pm = p.quantidade > 0 ? p.custo_total / p.quantidade : 0;
  }

  const result = Object.values(positions).filter((p) => p.quantidade > 0);
  return { data: result, error: null };
}

// ═══════════ PROVENTOS ═══════════
export async function getProventos(userId, filters = {}) {
  let query = supabase
    .from('proventos')
    .select('*')
    .eq('user_id', userId)
    .order('data_pagamento', { ascending: false });

  if (filters.ticker) query = query.eq('ticker', filters.ticker);
  if (filters.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  return { data: data || [], error };
}

export async function addProvento(userId, provento) {
  const { data, error } = await supabase
    .from('proventos')
    .insert({ user_id: userId, ...provento })
    .select()
    .single();
  return { data, error };
}

// ═══════════ OPÇÕES ═══════════
export async function getOpcoes(userId) {
  const { data, error } = await supabase
    .from('opcoes')
    .select('*')
    .eq('user_id', userId)
    .order('vencimento', { ascending: true });
  return { data: data || [], error };
}

export async function addOpcao(userId, opcao) {
  const { data, error } = await supabase
    .from('opcoes')
    .insert({ user_id: userId, ...opcao })
    .select()
    .single();
  return { data, error };
}

// ═══════════ RENDA FIXA ═══════════
export async function getRendaFixa(userId) {
  const { data, error } = await supabase
    .from('renda_fixa')
    .select('*')
    .eq('user_id', userId)
    .order('vencimento', { ascending: true });
  return { data: data || [], error };
}

// ═══════════ CORRETORAS ═══════════
export async function getUserCorretoras(userId) {
  const { data, error } = await supabase
    .from('user_corretoras')
    .select('*')
    .eq('user_id', userId)
    .order('count', { ascending: false });
  return { data: data || [], error };
}

export async function incrementCorretora(userId, name) {
  const { data: existing } = await supabase
    .from('user_corretoras')
    .select('count')
    .eq('user_id', userId)
    .eq('name', name)
    .single();

  if (existing) {
    await supabase
      .from('user_corretoras')
      .update({ count: existing.count + 1 })
      .eq('user_id', userId)
      .eq('name', name);
  } else {
    await supabase
      .from('user_corretoras')
      .insert({ user_id: userId, name, count: 1 });
  }
}

// ═══════════ SALDOS CORRETORA ═══════════
export async function getSaldos(userId) {
  const { data, error } = await supabase
    .from('saldos_corretora')
    .select('*')
    .eq('user_id', userId);
  return { data: data || [], error };
}

// ═══════════ ALERTAS CONFIG ═══════════
export async function getAlertasConfig(userId) {
  const { data, error } = await supabase
    .from('alertas_config')
    .select('*')
    .eq('user_id', userId)
    .single();
  return { data, error };
}

export async function updateAlertasConfig(userId, config) {
  const { data, error } = await supabase
    .from('alertas_config')
    .upsert({ user_id: userId, ...config });
  return { data, error };
}

// ═══════════ DASHBOARD AGGREGATES ═══════════
export async function getDashboard(userId) {
  try {
    const [positions, proventos, opcoes, rendaFixa, saldos, profile] = await Promise.all([
      getPositions(userId),
      getProventos(userId, { limit: 200 }),
      getOpcoes(userId),
      getRendaFixa(userId),
      getSaldos(userId),
      getProfile(userId),
    ]);

    const now = new Date();
    const mesAtual = now.getMonth();
    const anoAtual = now.getFullYear();

    // ── Posições ──
    const posDataRaw = positions.data || [];

    // Buscar preços atuais e calcular variação
    let posData;
    try {
      posData = await enrichPositionsWithPrices(posDataRaw);
    } catch (e) {
      console.warn('Price fetch failed, using positions without prices');
      posData = posDataRaw;
    }

    const patrimonioAcoes = posData.reduce(
      (sum, p) => sum + p.quantidade * (p.preco_atual || p.pm), 0
    );

    // ── Renda Fixa ──
    const rfData = rendaFixa.data || [];
    const rfTotalAplicado = rfData.reduce(
      (sum, r) => sum + (r.valor_aplicado || 0), 0
    );

    // Rendimento estimado mensal da RF
    // taxa = % ao ano, rendimento mensal ≈ valor * taxa / 100 / 12
    const rfRendaMensal = rfData.reduce((sum, r) => {
      const taxa = r.taxa || 0;
      const valor = r.valor_aplicado || 0;
      return sum + (valor * taxa / 100 / 12);
    }, 0);

    // ── Patrimônio total ──
    const patrimonio = patrimonioAcoes + rfTotalAplicado;

    // ── Dividendos do mês ──
    const proventosData = proventos.data || [];
    const dividendosMes = proventosData
      .filter((p) => {
        const d = new Date(p.data_pagamento);
        return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
      })
      .reduce((sum, p) => sum + (p.valor_por_cota * p.quantidade || 0), 0);

    // ── Opções ──
    const todasOpcoes = opcoes.data || [];
    const opsAtivas = todasOpcoes.filter(
      (o) => new Date(o.vencimento) > now
    );
    const premiosMes = opsAtivas.reduce(
      (s, o) => s + (o.premio * o.quantidade || 0), 0
    );

    // Opções que vencem em 30 dias
    const em30dias = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const opsProxVenc = opsAtivas.filter(
      (o) => new Date(o.vencimento) <= em30dias
    );

    // RF que vence em 90 dias
    const em90dias = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const rfProxVenc = rfData.filter((r) => {
      const v = new Date(r.vencimento);
      return v > now && v <= em90dias;
    });

    // ── Renda total do mês ──
    const rendaTotalMes = dividendosMes + premiosMes + rfRendaMensal;

    // ── Saldos ──
    const saldosData = saldos.data || [];
    const saldoTotal = saldosData.reduce(
      (sum, s) => sum + (s.saldo || 0), 0
    );

    // ── Rentabilidade mensal estimada ──
    const rentabilidadeMes = patrimonio > 0
      ? (rendaTotalMes / patrimonio) * 100
      : 0;

    // ── Eventos reais ──
    const eventos = [];

    opsProxVenc.forEach((o) => {
      const d = new Date(o.vencimento);
      eventos.push({
        data: o.vencimento,
        dia: d.getDate().toString(),
        diaSemana: ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'][d.getDay()],
        titulo: (o.tipo || 'Opção').toUpperCase() + ' ' + (o.ticker || o.ativo || ''),
        detalhe: 'Strike R$ ' + ((o.strike || 0).toFixed(2)) + ' · ' + (o.quantidade || 0) + ' lotes',
        tipo: 'opcao',
      });
    });

    rfProxVenc.forEach((r) => {
      const d = new Date(r.vencimento);
      eventos.push({
        data: r.vencimento,
        dia: d.getDate().toString(),
        diaSemana: ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'][d.getDay()],
        titulo: (r.tipo || 'RF').toUpperCase() + ' ' + (r.emissor || ''),
        detalhe: 'R$ ' + ((r.valor_aplicado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })) + ' · ' + (r.taxa || 0) + '% a.a.',
        tipo: 'rf',
      });
    });

    eventos.sort((a, b) => new Date(a.data) - new Date(b.data));

    // ── Histórico real do patrimônio ──
    // 1) Reconstrói equity (ações/FIIs/ETFs) por data das operações
    const { data: allOps } = await supabase
      .from('operacoes')
      .select('data, tipo, ticker, quantidade, preco, custo_corretagem, custo_emolumentos, custo_impostos')
      .eq('user_id', userId)
      .in('tipo', ['compra', 'venda'])
      .order('data', { ascending: true });

    const equityTimeline = []; // [{ date, value }] — só ações/FIIs
    const runningPositions = {};

    (allOps || []).forEach((op) => {
      const dateStr = op.data ? op.data.substring(0, 10) : null;
      if (!dateStr) return;

      if (!runningPositions[op.ticker]) {
        runningPositions[op.ticker] = { qty: 0, custoTotal: 0 };
      }
      const pos = runningPositions[op.ticker];

      if (op.tipo === 'compra') {
        const custos = (op.custo_corretagem || 0) + (op.custo_emolumentos || 0) + (op.custo_impostos || 0);
        pos.custoTotal += op.quantidade * op.preco + custos;
        pos.qty += op.quantidade;
      } else if (op.tipo === 'venda') {
        if (pos.qty > 0) {
          const pmAtual = pos.custoTotal / pos.qty;
          pos.custoTotal -= op.quantidade * pmAtual;
        }
        pos.qty -= op.quantidade;
        if (pos.qty <= 0) { pos.qty = 0; pos.custoTotal = 0; }
      }

      let equityAtDate = 0;
      Object.values(runningPositions).forEach((p) => {
        if (p.qty > 0) equityAtDate += p.custoTotal;
      });

      equityTimeline.push({ date: dateStr, value: equityAtDate });
    });

    // 2) Collect all unique dates (operações + RF)
    const allDates = new Set();
    equityTimeline.forEach((e) => allDates.add(e.date));
    rfData.forEach((r) => {
      const d = (r.data_aplicacao || r.created_at || '').substring(0, 10);
      if (d) allDates.add(d);
    });
    const todayStr = now.toISOString().substring(0, 10);
    allDates.add(todayStr);

    // 3) For each date, compute: equity at that date + RF applied up to that date
    const sortedDates = Array.from(allDates).sort();

    // Dedup equity: keep last value per date
    const equityByDate = {};
    equityTimeline.forEach((e) => { equityByDate[e.date] = e.value; });

    const patrimonioHistory = [];
    let lastEquity = 0;

    sortedDates.forEach((dateStr) => {
      // Equity: use value if exists for this date, else carry forward
      if (equityByDate[dateStr] !== undefined) {
        lastEquity = equityByDate[dateStr];
      }

      // RF: sum all RF aplicações up to this date
      let rfAtDate = 0;
      rfData.forEach((r) => {
        const rd = (r.data_aplicacao || r.created_at || '').substring(0, 10);
        if (rd && rd <= dateStr) {
          rfAtDate += (r.valor_aplicado || 0);
        }
      });

      patrimonioHistory.push({ date: dateStr, value: lastEquity + rfAtDate });
    });

    return {
      patrimonio,
      patrimonioAcoes,
      rfTotalAplicado,
      rfRendaMensal,
      dividendosMes,
      premiosMes,
      rendaTotalMes,
      rentabilidadeMes,
      opsAtivas: opsAtivas.length,
      opsProxVenc: opsProxVenc.length,
      meta: profile.data?.meta_mensal || 6000,
      positions: posData,
      saldos: saldosData,
      saldoTotal,
      rendaFixa: rfData,
      eventos,
      patrimonioHistory,
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
    };
  }
}
