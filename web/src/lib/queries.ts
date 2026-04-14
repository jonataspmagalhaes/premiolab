'use client';

import { useQuery } from '@tanstack/react-query';
import { getSupabaseBrowser } from './supabase';
import { useAppStore } from '@/store';
import { useEffect } from 'react';
import type { Position, PorCorretora, Provento, Opcao, RendaFixa, Saldo, Profile, Portfolio } from '@/store';
import { fetchPrices } from './priceService';

const supabase = getSupabaseBrowser();

// ══════════ Auth ══════════

export function useUser() {
  return useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ══════════ Profile ══════════

export function useProfile(userId: string | undefined) {
  const setProfile = useAppStore((s) => s.setProfile);

  const query = useQuery({
    queryKey: ['profile', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase
        .from('profiles')
        .select('id, nome, meta_mensal, selic, tier, subscription_status, subscription_expires_at')
        .eq('id', userId)
        .maybeSingle();
      return data as Profile | null;
    },
    enabled: !!userId,
  });

  useEffect(() => {
    if (query.data) setProfile(query.data);
  }, [query.data, setProfile]);

  return query;
}

// ══════════ Portfolios ══════════

export function usePortfolios(userId: string | undefined) {
  const setPortfolios = useAppStore((s) => s.setPortfolios);

  const query = useQuery({
    queryKey: ['portfolios', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data } = await supabase
        .from('portfolios')
        .select('id, nome, cor, icone, ordem')
        .eq('user_id', userId)
        .order('ordem', { ascending: true });
      return (data || []) as Portfolio[];
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (query.data) setPortfolios(query.data);
  }, [query.data, setPortfolios]);

  return query;
}

// ══════════ Positions (aggregated from operacoes + prices) ══════════

export function usePositions(userId: string | undefined) {
  const setPositions = useAppStore((s) => s.setPositions);
  const selectedPortfolio = useAppStore((s) => s.selectedPortfolio);

  const query = useQuery({
    queryKey: ['positions', userId, selectedPortfolio],
    queryFn: async () => {
      if (!userId) return [];
      let q = supabase
        .from('operacoes')
        .select('ticker, tipo, categoria, quantidade, preco, custo_corretagem, custo_emolumentos, custo_impostos, mercado, portfolio_id, corretora')
        .eq('user_id', userId);

      if (selectedPortfolio === '__null__') {
        q = q.is('portfolio_id', null);
      } else if (selectedPortfolio !== null) {
        q = q.eq('portfolio_id', selectedPortfolio);
      }

      const { data: ops } = await q;

      // DEBUG: contar quantas ops vieram sem corretora preenchida
      if (typeof window !== 'undefined' && ops && ops.length > 0) {
        const semCorr = ops.filter((o) => !o.corretora || !String(o.corretora).trim()).length;
        const samples: Record<string, number> = {};
        for (const o of ops) {
          const c = (o.corretora || '(null)').toString();
          samples[c] = (samples[c] || 0) + 1;
        }
        console.log('[positions] ops:', ops.length, '· sem corretora:', semCorr, '· buckets:', samples);
      }

      // Aggregate into positions (keyed by ticker+portfolio if showing all; else just ticker)
      // Em paralelo: por_corretora — sub-bucket de qty/pm por corretora
      const map: Record<string, Position> = {};
      const corretoraMap: Record<string, Record<string, { quantidade: number; pm: number }>> = {};
      for (const op of ops || []) {
        const tk = (op.ticker || '').toUpperCase().trim();
        if (!tk) continue;
        const key = selectedPortfolio === null ? tk + '|' + (op.portfolio_id || '__null__') : tk;
        if (!map[key]) {
          map[key] = {
            ticker: tk,
            categoria: op.categoria || 'acao',
            quantidade: 0,
            pm: 0,
            mercado: op.mercado || 'BR',
            portfolio_id: op.portfolio_id ?? null,
          };
        }
        const pos = map[key];
        const custos = (op.custo_corretagem || 0) + (op.custo_emolumentos || 0) + (op.custo_impostos || 0);
        if (op.tipo === 'compra') {
          const custoAtual = pos.pm * pos.quantidade;
          const novoCusto = custoAtual + op.quantidade * op.preco + custos;
          pos.quantidade += op.quantidade;
          pos.pm = pos.quantidade > 0 ? novoCusto / pos.quantidade : 0;
        } else if (op.tipo === 'venda') {
          pos.quantidade -= op.quantidade;
          if (pos.quantidade <= 0) { pos.quantidade = 0; pos.pm = 0; }
        }

        // por_corretora bucket — mesmo algoritmo de PM, isolado por corretora
        // Normaliza igual ao mobile (.toUpperCase().trim()) pra evitar fragmentar
        // buckets ('XP' vs 'xp' vs 'Xp')
        const corrRaw = (op.corretora || '').toString().toUpperCase().trim();
        const corr = corrRaw || 'Sem corretora';
        if (!corretoraMap[key]) corretoraMap[key] = {};
        if (!corretoraMap[key][corr]) corretoraMap[key][corr] = { quantidade: 0, pm: 0 };
        const cBucket = corretoraMap[key][corr];
        if (op.tipo === 'compra') {
          const custoAtualC = cBucket.pm * cBucket.quantidade;
          const novoCustoC = custoAtualC + op.quantidade * op.preco + custos;
          cBucket.quantidade += op.quantidade;
          cBucket.pm = cBucket.quantidade > 0 ? novoCustoC / cBucket.quantidade : 0;
        } else if (op.tipo === 'venda') {
          cBucket.quantidade -= op.quantidade;
          if (cBucket.quantidade <= 0) { cBucket.quantidade = 0; cBucket.pm = 0; }
        }
      }

      const positions = Object.values(map).filter((p) => p.quantidade > 0);

      // Anexa por_corretora (apenas buckets com qty > 0, ordenado por qty desc)
      for (const [key, pos] of Object.entries(map)) {
        if (pos.quantidade <= 0) continue;
        const buckets = corretoraMap[key] || {};
        const arr: PorCorretora[] = [];
        for (const [corr, b] of Object.entries(buckets)) {
          if (b.quantidade > 0) arr.push({ corretora: corr, quantidade: b.quantidade, pm: b.pm });
        }
        arr.sort((a, b) => b.quantidade - a.quantidade);
        if (arr.length > 0) pos.por_corretora = arr;
      }

      // Fetch prices for all unique tickers (BR vs INT)
      const brTickers = Array.from(new Set(positions.filter((p) => p.mercado !== 'INT').map((p) => p.ticker)));
      const intTickers = Array.from(new Set(positions.filter((p) => p.mercado === 'INT').map((p) => p.ticker)));

      // Convert INT positions (USD → BRL) so totals/valor_mercado stay in BRL.
      // Mobile does the same in enrichPositionsWithPrices (priceService.js).
      // We need the cambio BEFORE pricing — and even if price fetch fails, we still
      // need to convert pm from USD to BRL for display/aggregation.
      if (brTickers.length > 0 || intTickers.length > 0) {
        try {
          const { prices, usdBrl } = await fetchPrices(brTickers, intTickers);

          // First: convert INT pm from USD to BRL so PM-based fallbacks are correct
          // (aplica tanto no PM agregado quanto nos buckets por_corretora)
          if (usdBrl > 0) {
            for (const pos of positions) {
              if (pos.mercado === 'INT') {
                if (pos.pm > 0) pos.pm = pos.pm * usdBrl;
                if (pos.por_corretora) {
                  for (const b of pos.por_corretora) {
                    if (b.pm > 0) b.pm = b.pm * usdBrl;
                  }
                }
              }
            }
          }

          for (const pos of positions) {
            const hit = prices[pos.ticker];
            if (hit && hit.price > 0) {
              // For INT: convert USD price → BRL
              const priceBRL = pos.mercado === 'INT' && usdBrl > 0 ? hit.price * usdBrl : hit.price;
              pos.preco_atual = priceBRL;
              pos.valor_mercado = priceBRL * pos.quantidade;
              pos.day_change_pct = hit.dayChangePct;
              if (hit.sector) pos.sector = hit.sector;
              if (hit.industry) pos.industry = hit.industry;
              if (pos.pm > 0) {
                pos.pl = (priceBRL - pos.pm) * pos.quantidade;
                pos.pl_pct = ((priceBRL - pos.pm) / pos.pm) * 100;
              }
              // Espelha valor_mercado/pl em cada bucket de corretora
              // (PM ja foi convertido USD→BRL no loop anterior)
              if (pos.por_corretora && pos.por_corretora.length > 0) {
                for (const b of pos.por_corretora) {
                  b.valor_mercado = priceBRL * b.quantidade;
                  if (b.pm > 0) {
                    b.pl = (priceBRL - b.pm) * b.quantidade;
                    b.pl_pct = ((priceBRL - b.pm) / b.pm) * 100;
                  }
                }
              }
            }
          }
        } catch {
          // silent: fallback to PM in UI
        }
      }

      return positions;
    },
    enabled: !!userId,
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (query.data) setPositions(query.data);
  }, [query.data, setPositions]);

  return query;
}

// ══════════ Proventos ══════════

export function useProventos(userId: string | undefined) {
  const setProventos = useAppStore((s) => s.setProventos);
  const selectedPortfolio = useAppStore((s) => s.selectedPortfolio);

  const query = useQuery({
    queryKey: ['proventos', userId, selectedPortfolio],
    queryFn: async () => {
      if (!userId) return [];
      // Schema real: tipo (nao tipo_provento); sem coluna valor_total — computar
      let q = supabase
        .from('proventos')
        .select('id, ticker, tipo, valor_por_cota, quantidade, data_pagamento, portfolio_id')
        .eq('user_id', userId);

      if (selectedPortfolio === '__null__') {
        q = q.is('portfolio_id', null);
      } else if (selectedPortfolio !== null) {
        q = q.eq('portfolio_id', selectedPortfolio);
      }

      const { data } = await q
        .order('data_pagamento', { ascending: false })
        .limit(2000);
      const rows: Provento[] = (data || []).map((r: any) => ({
        id: r.id,
        ticker: r.ticker,
        tipo_provento: r.tipo, // alias para compatibilidade com o resto do app
        valor_por_cota: Number(r.valor_por_cota) || 0,
        quantidade: Number(r.quantidade) || 0,
        valor_total: (Number(r.valor_por_cota) || 0) * (Number(r.quantidade) || 0),
        data_pagamento: r.data_pagamento,
      }));
      return rows;
    },
    enabled: !!userId,
  });

  useEffect(() => {
    if (query.data) setProventos(query.data);
  }, [query.data, setProventos]);

  return query;
}

// ══════════ Opcoes ══════════

export function useOpcoes(userId: string | undefined) {
  const setOpcoes = useAppStore((s) => s.setOpcoes);
  const selectedPortfolio = useAppStore((s) => s.selectedPortfolio);

  const query = useQuery({
    queryKey: ['opcoes', userId, selectedPortfolio],
    queryFn: async () => {
      if (!userId) return [];
      let q = supabase
        .from('opcoes')
        .select('id, ativo_base, ticker_opcao, tipo, direcao, strike, premio, qty, vencimento, status, portfolio_id')
        .eq('user_id', userId);

      if (selectedPortfolio === '__null__') {
        q = q.is('portfolio_id', null);
      } else if (selectedPortfolio !== null) {
        q = q.eq('portfolio_id', selectedPortfolio);
      }

      const { data } = await q.order('vencimento', { ascending: true });
      return (data || []) as Opcao[];
    },
    enabled: !!userId,
  });

  useEffect(() => {
    if (query.data) setOpcoes(query.data);
  }, [query.data, setOpcoes]);

  return query;
}

// ══════════ Renda Fixa ══════════

export function useRendaFixa(userId: string | undefined) {
  const setRf = useAppStore((s) => s.setRf);
  const selectedPortfolio = useAppStore((s) => s.selectedPortfolio);

  const query = useQuery({
    queryKey: ['renda_fixa', userId, selectedPortfolio],
    queryFn: async () => {
      if (!userId) return [];
      let q = supabase
        .from('renda_fixa')
        .select('id, tipo, emissor, taxa, indexador, valor_aplicado, vencimento, portfolio_id')
        .eq('user_id', userId);

      if (selectedPortfolio === '__null__') {
        q = q.is('portfolio_id', null);
      } else if (selectedPortfolio !== null) {
        q = q.eq('portfolio_id', selectedPortfolio);
      }

      const { data } = await q;
      return (data || []) as RendaFixa[];
    },
    enabled: !!userId,
  });

  useEffect(() => {
    if (query.data) setRf(query.data);
  }, [query.data, setRf]);

  return query;
}

// ══════════ Patrimonio Snapshots ══════════
// Convencao da tabela (mobile database.js): null=global, UUID=portfolio, sentinela=Padrao
// Sentinel UUID espelha o mobile.
const PADRAO_SNAPSHOT_ID = '00000000-0000-0000-0000-000000000001';

export interface PatrimonioSnapshot {
  data: string;
  valor: number;
  valor_investido?: number;
  valor_saldos?: number;
}

export function usePatrimonioSnapshots(userId: string | undefined) {
  const selectedPortfolio = useAppStore((s) => s.selectedPortfolio);

  return useQuery({
    queryKey: ['patrimonio_snapshots', userId, selectedPortfolio],
    queryFn: async () => {
      if (!userId) return [];
      let q = supabase
        .from('patrimonio_snapshots')
        .select('data, valor, valor_investido, valor_saldos')
        .eq('user_id', userId)
        .order('data', { ascending: true });

      if (selectedPortfolio === null) {
        q = q.is('portfolio_id', null); // global
      } else if (selectedPortfolio === '__null__') {
        q = q.eq('portfolio_id', PADRAO_SNAPSHOT_ID);
      } else {
        q = q.eq('portfolio_id', selectedPortfolio);
      }

      const { data } = await q;
      return (data || []).filter((r) => typeof r.valor === 'number' && r.valor > 0) as PatrimonioSnapshot[];
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}

// ══════════ Saldos (GLOBAL — saldos_corretora nao tem portfolio_id) ══════════

export function useSaldos(userId: string | undefined) {
  const setSaldos = useAppStore((s) => s.setSaldos);

  const query = useQuery({
    queryKey: ['saldos', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data } = await supabase
        .from('saldos_corretora')
        .select('id, name, saldo, tipo, moeda')
        .eq('user_id', userId);
      return (data || []) as Saldo[];
    },
    enabled: !!userId,
  });

  useEffect(() => {
    if (query.data) setSaldos(query.data);
  }, [query.data, setSaldos]);

  return query;
}

// ══════════ Combined loader ══════════

export function useLoadAllData(userId: string | undefined) {
  const profile = useProfile(userId);
  const portfolios = usePortfolios(userId);
  const positions = usePositions(userId);
  const proventos = useProventos(userId);
  const opcoes = useOpcoes(userId);
  const rf = useRendaFixa(userId);
  const saldos = useSaldos(userId);

  const isLoading = profile.isLoading || portfolios.isLoading || positions.isLoading ||
    proventos.isLoading || opcoes.isLoading || rf.isLoading || saldos.isLoading;

  return { isLoading };
}
