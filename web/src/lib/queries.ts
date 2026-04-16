'use client';

import { useQuery } from '@tanstack/react-query';
import { getSupabaseBrowser } from './supabase';
import { useAppStore } from '@/store';
import { useEffect } from 'react';
import type { Position, PorCorretora, Provento, Opcao, RendaFixa, Fundo, Saldo, Caixa, Profile, Portfolio } from '@/store';
import { fetchPrices } from './priceService';
import { valorAtualRF, type TipoRF, type Indexador } from './rendaFixaCalc';
import { useMacroIndices } from './useMacroIndices';

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
  const setUsdBrl = useAppStore((s) => s.setUsdBrl);
  const selectedPortfolio = useAppStore((s) => s.selectedPortfolio);

  const query = useQuery({
    queryKey: ['positions', userId, selectedPortfolio],
    queryFn: async () => {
      if (!userId) return [];
      let q = supabase
        .from('operacoes')
        .select('ticker, tipo, categoria, quantidade, preco, custo_corretagem, custo_emolumentos, custo_impostos, mercado, portfolio_id, corretora, ratio, data')
        .eq('user_id', userId);

      if (selectedPortfolio === '__null__') {
        q = q.is('portfolio_id', null);
      } else if (selectedPortfolio !== null) {
        q = q.eq('portfolio_id', selectedPortfolio);
      }

      const { data: ops } = await q.order('data', { ascending: true });

      // Aggregate into positions (keyed by ticker+portfolio if showing all; else just ticker)
      // Ordem cronologica e essencial para splits/bonus recalcularem PM corretamente
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
        } else if (op.tipo === 'desdobramento' && op.ratio) {
          // Split: ratio "X:Y" → multiplica qty por X/Y, divide PM por X/Y
          const parts = op.ratio.split(':');
          const mult = Number(parts[0]) / Number(parts[1] || 1);
          if (mult > 0 && pos.quantidade > 0) {
            pos.quantidade = pos.quantidade * mult;
            pos.pm = pos.pm / mult;
          }
        } else if (op.tipo === 'bonificacao') {
          // Bonus: recebe novas acoes ao preco declarado (op.preco = valor base IR)
          const custoAtual = pos.pm * pos.quantidade;
          const novoCusto = custoAtual + op.quantidade * (op.preco || 0);
          pos.quantidade += op.quantidade;
          pos.pm = pos.quantidade > 0 ? novoCusto / pos.quantidade : 0;
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
        } else if (op.tipo === 'desdobramento' && op.ratio) {
          const partsC = op.ratio.split(':');
          const multC = Number(partsC[0]) / Number(partsC[1] || 1);
          if (multC > 0 && cBucket.quantidade > 0) {
            cBucket.quantidade = cBucket.quantidade * multC;
            cBucket.pm = cBucket.pm / multC;
          }
        } else if (op.tipo === 'bonificacao') {
          const custoAtualC2 = cBucket.pm * cBucket.quantidade;
          const novoCustoC2 = custoAtualC2 + op.quantidade * (op.preco || 0);
          cBucket.quantidade += op.quantidade;
          cBucket.pm = cBucket.quantidade > 0 ? novoCustoC2 / cBucket.quantidade : 0;
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

      // Fetch prices: BR (brapi), INT (Yahoo), CRIPTO (Yahoo BTC-USD)
      const brTickers = Array.from(new Set(positions.filter((p) => p.mercado === 'BR' || (!p.mercado)).map((p) => p.ticker)));
      const intTickers = Array.from(new Set(positions.filter((p) => p.mercado === 'INT').map((p) => p.ticker)));
      const cryptoTickers = Array.from(new Set(positions.filter((p) => p.mercado === 'CRIPTO').map((p) => p.ticker)));

      if (brTickers.length > 0 || intTickers.length > 0 || cryptoTickers.length > 0) {
        try {
          const { prices, usdBrl } = await fetchPrices(brTickers, intTickers, cryptoTickers);

          // Propaga cotacao pro store (caixa USD usa mesma taxa no computePatrimonio)
          if (usdBrl > 0) setUsdBrl(usdBrl);

          // Converte PM USD → BRL (INT e CRIPTO sao precificados em USD)
          if (usdBrl > 0) {
            for (const pos of positions) {
              if (pos.mercado === 'INT' || pos.mercado === 'CRIPTO') {
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
              // INT/CRIPTO: convert USD price → BRL
              const isUsdQuoted = pos.mercado === 'INT' || pos.mercado === 'CRIPTO';
              const priceBRL = isUsdQuoted && usdBrl > 0 ? hit.price * usdBrl : hit.price;
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
        .select('id, ticker, tipo, valor_por_cota, quantidade, data_pagamento, portfolio_id, fonte')
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
        fonte: r.fonte || null,
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

// ══════════ Operacoes (raw — inferencia historica de corretora) ══════════
// Retorna ops crus minimos pra reconstruir custodia por (ticker, corretora) em
// qualquer data passada. Usado pela aba Renda pra atribuir corretora ao provento.

export interface OperacaoRaw {
  ticker: string;
  tipo: string;
  quantidade: number;
  data: string;
  corretora: string | null;
  portfolio_id: string | null;
}

export function useOperacoesRaw(userId: string | undefined) {
  const selectedPortfolio = useAppStore((s) => s.selectedPortfolio);
  return useQuery({
    queryKey: ['operacoes-raw', userId, selectedPortfolio],
    queryFn: async () => {
      if (!userId) return [] as OperacaoRaw[];
      let q = supabase
        .from('operacoes')
        .select('ticker, tipo, quantidade, data, corretora, portfolio_id')
        .eq('user_id', userId);
      if (selectedPortfolio === '__null__') q = q.is('portfolio_id', null);
      else if (selectedPortfolio !== null) q = q.eq('portfolio_id', selectedPortfolio);
      const { data } = await q.order('data', { ascending: true });
      return (data || []).map((r: any) => ({
        ticker: (r.ticker || '').toUpperCase().trim(),
        tipo: r.tipo,
        quantidade: Number(r.quantidade) || 0,
        data: r.data,
        corretora: r.corretora ? String(r.corretora).toUpperCase().trim() : null,
        portfolio_id: r.portfolio_id ?? null,
      })) as OperacaoRaw[];
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
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
// Enriquece com MTM (valor_mtm = juros compostos desde data aplicacao ate hoje)
// usando taxa efetiva baseada no indexador e macro indices atuais (CDI/IPCA).

export function useRendaFixa(userId: string | undefined) {
  const setRf = useAppStore((s) => s.setRf);
  const selectedPortfolio = useAppStore((s) => s.selectedPortfolio);
  const macro = useMacroIndices();
  const idx = macro.data ? { cdi: macro.data.cdi, ipca: macro.data.ipca_12m } : undefined;

  const query = useQuery({
    queryKey: ['renda_fixa', userId, selectedPortfolio, idx?.cdi, idx?.ipca],
    queryFn: async () => {
      if (!userId) return [];
      let q = supabase
        .from('renda_fixa')
        .select('id, tipo, emissor, taxa, indexador, valor_aplicado, vencimento, corretora, created_at, portfolio_id')
        .eq('user_id', userId);

      if (selectedPortfolio === '__null__') {
        q = q.is('portfolio_id', null);
      } else if (selectedPortfolio !== null) {
        q = q.eq('portfolio_id', selectedPortfolio);
      }

      const { data } = await q;
      return (data || []).map(function (r: any) {
        var valorAplicado = Number(r.valor_aplicado) || 0;
        var dataAplic = r.created_at ? String(r.created_at).substring(0, 10) : null;
        var mtm: number | undefined = undefined;
        if (dataAplic && r.tipo && Number(r.taxa) > 0) {
          mtm = valorAtualRF({
            tipo: r.tipo as TipoRF,
            taxaDigitada: Number(r.taxa),
            valorAplicado: valorAplicado,
            dataAplicacaoISO: dataAplic,
            idx: idx,
            indexador: (r.indexador || '') as Indexador,
          });
        }
        return {
          id: r.id,
          tipo: r.tipo,
          emissor: r.emissor,
          taxa: Number(r.taxa) || 0,
          indexador: r.indexador || '',
          valor_aplicado: valorAplicado,
          vencimento: r.vencimento,
          corretora: r.corretora,
          created_at: r.created_at,
          portfolio_id: r.portfolio_id,
          valor_mtm: mtm,
        };
      }) as RendaFixa[];
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
        .select('id, corretora, saldo, tipo, moeda')
        .eq('user_id', userId);
      return (data || []).map(function (r: any) {
        return {
          id: r.id,
          name: r.corretora,
          saldo: Number(r.saldo) || 0,
          tipo: r.tipo,
          moeda: r.moeda,
        };
      }) as Saldo[];
    },
    enabled: !!userId,
  });

  useEffect(() => {
    if (query.data) setSaldos(query.data);
  }, [query.data, setSaldos]);

  return query;
}

// ══════════ Caixa (GLOBAL — sem portfolio_id) ══════════
// Novo modelo: lancamentos +/- por corretora+moeda. Saldo atual = SUM(valor).
// Substitui saldos_corretora no web. Apenas BRL e USD.

export function useCaixa(userId: string | undefined) {
  const setCaixa = useAppStore((s) => s.setCaixa);

  const query = useQuery({
    queryKey: ['caixa', userId],
    queryFn: async () => {
      if (!userId) return [] as Caixa[];
      const { data } = await supabase
        .from('caixa')
        .select('id, corretora, moeda, valor, data, descricao, created_at')
        .eq('user_id', userId)
        .order('data', { ascending: false });
      return (data || []).map(function (r: any) {
        return {
          id: r.id,
          corretora: r.corretora,
          moeda: (r.moeda === 'USD' ? 'USD' : 'BRL') as 'BRL' | 'USD',
          valor: Number(r.valor) || 0,
          data: r.data,
          descricao: r.descricao,
          created_at: r.created_at,
        };
      }) as Caixa[];
    },
    enabled: !!userId,
  });

  useEffect(() => {
    if (query.data) setCaixa(query.data);
  }, [query.data, setCaixa]);

  return query;
}

// ══════════ Corretoras (derivada do store, sem query extra) ══════════
// Union de todas as tabelas que tem corretora: operacoes(positions), opcoes,
// rf, fundos, proventos(inferida de position source), caixa. Client-side.

export function useCorretoras(): string[] {
  const positions = useAppStore((s) => s.positions);
  const opcoes = useAppStore((s) => s.opcoes);
  const rf = useAppStore((s) => s.rf);
  const fundos = useAppStore((s) => s.fundos);
  const caixa = useAppStore((s) => s.caixa);

  const set = new Set<string>();
  for (const p of positions) {
    if (p.por_corretora) {
      for (const b of p.por_corretora) {
        const name = (b.corretora || '').trim();
        if (name && name.toUpperCase() !== 'SEM CORRETORA') set.add(name);
      }
    }
  }
  for (const o of opcoes as Array<{ corretora?: string | null }>) {
    const name = (o.corretora || '').trim();
    if (name) set.add(name);
  }
  for (const r of rf) {
    const name = (r.corretora || '').trim();
    if (name) set.add(name);
  }
  for (const f of fundos) {
    const name = (f.corretora || '').trim();
    if (name) set.add(name);
  }
  for (const c of caixa) {
    const name = (c.corretora || '').trim();
    if (name) set.add(name);
  }

  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

// ══════════ Transacoes unificadas ══════════
// Union client-side de operacoes + opcoes + proventos + renda_fixa, normalizado.
// Read-only por ora; delete funciona. Edit/add via sheets especificos por tipo.

export type TransacaoTipoKey = 'operacao' | 'opcao' | 'provento' | 'rf' | 'fundo' | 'caixa';

export interface Transacao {
  uid: string; // tipo:id — pra key estavel
  source_id: string; // id na tabela original
  source_table: 'operacoes' | 'opcoes' | 'proventos' | 'renda_fixa' | 'fundos' | 'caixa';
  tipo_key: TransacaoTipoKey;
  categoria_display: string; // "Ação", "FII", "ETF", "Stock INT", "Opção CALL", "Dividendo", "JCP", "Rendimento", "Renda Fixa", "Caixa"
  data: string; // ISO
  descricao: string; // ticker ou emissor
  subtitulo: string | null; // ex: "Compra 200 × R$ 38,42"
  valor: number; // sempre absoluto
  valor_signed: number; // + entrada, - saida
  moeda: 'BRL' | 'USD';
  corretora: string | null;
  fonte: 'manual' | 'auto' | 'sync' | null;
  portfolio_id: string | null;
}

export function useTransacoes(userId: string | undefined) {
  const selectedPortfolio = useAppStore((s) => s.selectedPortfolio);

  return useQuery<Transacao[]>({
    queryKey: ['transacoes', userId, selectedPortfolio],
    queryFn: async () => {
      if (!userId) return [];

      function applyPortfolioFilter(q: any) {
        if (selectedPortfolio === '__null__') return q.is('portfolio_id', null);
        if (selectedPortfolio !== null) return q.eq('portfolio_id', selectedPortfolio);
        return q;
      }

      const [opsRes, opcRes, provRes, rfRes, fundosRes, caixaRes] = await Promise.all([
        applyPortfolioFilter(
          supabase.from('operacoes')
            .select('id, ticker, tipo, categoria, quantidade, preco, custo_corretagem, custo_emolumentos, custo_impostos, corretora, data, mercado, portfolio_id, ratio, fonte')
            .eq('user_id', userId),
        ).order('data', { ascending: false }).limit(1000),
        applyPortfolioFilter(
          supabase.from('opcoes')
            .select('id, ticker_opcao, ativo_base, tipo, direcao, strike, premio, premio_fechamento, qty, data_abertura, data_fechamento, status, corretora, portfolio_id')
            .eq('user_id', userId),
        ).order('data_abertura', { ascending: false }).limit(1000),
        applyPortfolioFilter(
          supabase.from('proventos')
            .select('id, ticker, tipo, valor_por_cota, quantidade, data_pagamento, corretora, fonte, portfolio_id')
            .eq('user_id', userId),
        ).order('data_pagamento', { ascending: false }).limit(1000),
        applyPortfolioFilter(
          supabase.from('renda_fixa')
            .select('id, tipo, emissor, taxa, valor_aplicado, vencimento, corretora, created_at, portfolio_id')
            .eq('user_id', userId),
        ).order('created_at', { ascending: false }).limit(1000),
        applyPortfolioFilter(
          supabase.from('fundos')
            .select('id, cnpj, nome, classe, valor_aplicado, data_aplicacao, corretora, portfolio_id')
            .eq('user_id', userId),
        ).order('data_aplicacao', { ascending: false }).limit(1000),
        // Caixa: GLOBAL (sem portfolio_id), nao aplica filtro
        supabase.from('caixa')
          .select('id, corretora, moeda, valor, data, descricao')
          .eq('user_id', userId)
          .order('data', { ascending: false })
          .limit(1000),
      ]);

      const out: Transacao[] = [];

      // ── operacoes ──
      const catMap: Record<string, string> = {
        acao: 'Ação', fii: 'FII', etf: 'ETF', stock_int: 'Stock INT',
        bdr: 'BDR', adr: 'ADR', reit: 'REIT', cripto: 'Cripto',
      };
      for (const r of (opsRes.data || [])) {
        const qty = Number(r.quantidade) || 0;
        const preco = Number(r.preco) || 0;
        const custos = (Number(r.custo_corretagem) || 0) + (Number(r.custo_emolumentos) || 0) + (Number(r.custo_impostos) || 0);
        const tk = String(r.ticker || '').toUpperCase();
        const moeda = r.mercado === 'INT' ? 'USD' : 'BRL';
        const moedaPrefix = r.mercado === 'INT' ? 'US$' : 'R$';

        if (r.tipo === 'desdobramento') {
          out.push({
            uid: 'operacao:' + r.id,
            source_id: r.id,
            source_table: 'operacoes',
            tipo_key: 'operacao',
            categoria_display: 'Split',
            data: r.data,
            descricao: tk,
            subtitulo: 'Desdobramento ' + (r.ratio || ''),
            valor: 0,
            valor_signed: 0,
            moeda: moeda,
            corretora: r.corretora || null,
            fonte: r.fonte || 'auto',
            portfolio_id: r.portfolio_id,
          });
        } else if (r.tipo === 'bonificacao') {
          const totalBonus = qty * preco;
          out.push({
            uid: 'operacao:' + r.id,
            source_id: r.id,
            source_table: 'operacoes',
            tipo_key: 'operacao',
            categoria_display: 'Bonus',
            data: r.data,
            descricao: tk,
            subtitulo: 'Bonificacao +' + qty + ' acoes a ' + moedaPrefix + ' ' + preco.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            valor: totalBonus,
            valor_signed: totalBonus,
            moeda: moeda,
            corretora: r.corretora || null,
            fonte: r.fonte || 'auto',
            portfolio_id: r.portfolio_id,
          });
        } else {
          const bruto = qty * preco;
          const total = r.tipo === 'compra' ? -(bruto + custos) : (bruto - custos);
          out.push({
            uid: 'operacao:' + r.id,
            source_id: r.id,
            source_table: 'operacoes',
            tipo_key: 'operacao',
            categoria_display: catMap[r.categoria] || 'Acao',
            data: r.data,
            descricao: tk,
            subtitulo: (r.tipo === 'compra' ? 'Compra' : 'Venda') + ' ' + qty + ' x ' + moedaPrefix + ' ' + preco.toLocaleString(r.mercado === 'INT' ? 'en-US' : 'pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            valor: Math.abs(total),
            valor_signed: total,
            moeda: moeda,
            corretora: r.corretora || null,
            fonte: r.fonte || 'manual',
            portfolio_id: r.portfolio_id,
          });
        }
      }

      // ── opcoes (abertura + fechamento quando houver) ──
      for (const r of (opcRes.data || [])) {
        const qty = Number(r.qty) || 0;
        const premio = Number(r.premio) || 0;
        const isVenda = r.direcao === 'venda' || r.direcao === 'lancamento';
        const aberturaVal = isVenda ? (premio * qty) : -(premio * qty);
        const tipoLabel = r.tipo === 'call' ? 'CALL' : 'PUT';
        const acaoLabel = isVenda ? 'Venda' : 'Compra';
        out.push({
          uid: 'opcao:' + r.id + ':a',
          source_id: r.id,
          source_table: 'opcoes',
          tipo_key: 'opcao',
          categoria_display: 'Opção ' + tipoLabel,
          data: r.data_abertura,
          descricao: String(r.ticker_opcao || '').toUpperCase(),
          subtitulo: acaoLabel + ' ' + qty + ' × R$ ' + premio.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          valor: Math.abs(aberturaVal),
          valor_signed: aberturaVal,
          moeda: 'BRL',
          corretora: r.corretora || null,
          fonte: 'manual',
          portfolio_id: r.portfolio_id,
        });

        if (r.premio_fechamento != null && r.data_fechamento) {
          const pf = Number(r.premio_fechamento) || 0;
          const fechamentoVal = isVenda ? -(pf * qty) : (pf * qty);
          const acaoFech = isVenda ? 'Recompra' : 'Venda';
          out.push({
            uid: 'opcao:' + r.id + ':f',
            source_id: r.id,
            source_table: 'opcoes',
            tipo_key: 'opcao',
            categoria_display: 'Opção ' + tipoLabel,
            data: r.data_fechamento,
            descricao: String(r.ticker_opcao || '').toUpperCase(),
            subtitulo: 'Fechamento · ' + acaoFech + ' ' + qty + ' × R$ ' + pf.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            valor: Math.abs(fechamentoVal),
            valor_signed: fechamentoVal,
            moeda: 'BRL',
            corretora: r.corretora || null,
            fonte: 'manual',
            portfolio_id: r.portfolio_id,
          });
        }
      }

      // ── proventos (so pagos — data_pagamento <= hoje) ──
      const provMap: Record<string, string> = { dividendo: 'Dividendo', jcp: 'JCP', rendimento: 'Rendimento' };
      const today = new Date().toISOString().substring(0, 10);
      for (const r of (provRes.data || [])) {
        if (r.data_pagamento && r.data_pagamento > today) continue;
        const vpc = Number(r.valor_por_cota) || 0;
        const qty = Number(r.quantidade) || 0;
        const total = vpc * qty;
        out.push({
          uid: 'provento:' + r.id,
          source_id: r.id,
          source_table: 'proventos',
          tipo_key: 'provento',
          categoria_display: provMap[r.tipo] || 'Provento',
          data: r.data_pagamento,
          descricao: String(r.ticker || '').toUpperCase(),
          subtitulo: qty + ' × R$ ' + vpc.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
          valor: Math.abs(total),
          valor_signed: total,
          moeda: 'BRL',
          corretora: r.corretora || null,
          fonte: (r.fonte === 'manual' ? 'manual' : 'sync'),
          portfolio_id: r.portfolio_id,
        });
      }

      // ── renda fixa ──
      for (const r of (rfRes.data || [])) {
        const total = Number(r.valor_aplicado) || 0;
        out.push({
          uid: 'rf:' + r.id,
          source_id: r.id,
          source_table: 'renda_fixa',
          tipo_key: 'rf',
          categoria_display: 'Renda Fixa',
          data: (r.created_at ? String(r.created_at).substring(0, 10) : null) || r.vencimento,
          descricao: String(r.emissor || r.tipo || 'RF'),
          subtitulo: (r.tipo || 'RF') + (r.taxa ? ' · ' + r.taxa + '%' : ''),
          valor: total,
          valor_signed: -total,
          moeda: 'BRL',
          corretora: r.corretora || null,
          fonte: 'manual',
          portfolio_id: r.portfolio_id,
        });
      }

      // ── fundos ──
      for (const r of (fundosRes.data || [])) {
        const total = Number(r.valor_aplicado) || 0;
        out.push({
          uid: 'fundo:' + r.id,
          source_id: r.id,
          source_table: 'fundos',
          tipo_key: 'fundo',
          categoria_display: 'Fundo',
          data: r.data_aplicacao,
          descricao: String(r.nome || 'Fundo'),
          subtitulo: (r.classe || 'fundo') + ' · ' + r.cnpj,
          valor: total,
          valor_signed: -total,
          moeda: 'BRL',
          corretora: r.corretora || null,
          fonte: 'manual',
          portfolio_id: r.portfolio_id,
        });
      }

      // ── caixa ──
      for (const r of (caixaRes.data || [])) {
        const v = Number(r.valor) || 0;
        const isAporte = v >= 0;
        out.push({
          uid: 'caixa:' + r.id,
          source_id: r.id,
          source_table: 'caixa',
          tipo_key: 'caixa',
          categoria_display: 'Caixa',
          data: r.data,
          descricao: r.corretora || 'Caixa',
          subtitulo: (isAporte ? 'Aporte' : 'Saída') + (r.descricao ? ' · ' + r.descricao : ''),
          valor: Math.abs(v),
          valor_signed: v,
          moeda: (r.moeda === 'USD' ? 'USD' : 'BRL') as 'BRL' | 'USD',
          corretora: r.corretora || null,
          fonte: 'manual',
          portfolio_id: null,
        });
      }

      out.sort(function (a, b) {
        if (a.data === b.data) return 0;
        return a.data < b.data ? 1 : -1;
      });

      return out;
    },
    enabled: !!userId,
  });
}

// ══════════ Fundos ══════════
// Enriquece com MTM: busca cota atual via /api/dm-fund-quote por CNPJ.
// MTM = qtde_cotas × cota_atual. Fallback pra valor_aplicado.

async function fetchFundQuote(cnpj: string): Promise<{ cota: number | null; data: string | null }> {
  try {
    const res = await fetch('/api/dm-fund-quote?cnpj=' + encodeURIComponent(cnpj));
    if (!res.ok) return { cota: null, data: null };
    const body = await res.json();
    return { cota: Number(body?.cota) || null, data: body?.data || null };
  } catch {
    return { cota: null, data: null };
  }
}

export function useFundos(userId: string | undefined) {
  const setFundos = useAppStore((s) => s.setFundos);
  const selectedPortfolio = useAppStore((s) => s.selectedPortfolio);

  const query = useQuery({
    queryKey: ['fundos', userId, selectedPortfolio],
    queryFn: async () => {
      if (!userId) return [] as Fundo[];
      let q = supabase
        .from('fundos')
        .select('id, cnpj, nome, classe, valor_aplicado, qtde_cotas, valor_cota_compra, data_aplicacao, corretora, taxa_admin, taxa_perf, portfolio_id, created_at')
        .eq('user_id', userId);

      if (selectedPortfolio === '__null__') q = q.is('portfolio_id', null);
      else if (selectedPortfolio !== null) q = q.eq('portfolio_id', selectedPortfolio);

      const { data } = await q.order('data_aplicacao', { ascending: false });
      const rows = data || [];

      // Unique CNPJs -> fetch cotas em paralelo (cache 12h server-side)
      const uniqCnpjs: string[] = [];
      const seenCnpj: Record<string, boolean> = {};
      for (const r of rows) {
        const cnpj = String(r.cnpj || '').replace(/\D/g, '');
        if (cnpj && !seenCnpj[cnpj]) { seenCnpj[cnpj] = true; uniqCnpjs.push(cnpj); }
      }
      const quotes = await Promise.all(uniqCnpjs.map(fetchFundQuote));
      const cotaByCnpj: Record<string, number> = {};
      for (let i = 0; i < uniqCnpjs.length; i++) {
        const c = quotes[i].cota;
        if (c != null && c > 0) cotaByCnpj[uniqCnpjs[i]] = c;
      }

      return rows.map(function (r: any) {
        const cnpjClean = String(r.cnpj || '').replace(/\D/g, '');
        const cotaAtual = cotaByCnpj[cnpjClean];
        const qtd = r.qtde_cotas != null ? Number(r.qtde_cotas) : null;
        const mtm = cotaAtual && qtd != null && qtd > 0 ? cotaAtual * qtd : undefined;
        return {
          id: r.id,
          cnpj: r.cnpj,
          nome: r.nome,
          classe: r.classe,
          valor_aplicado: Number(r.valor_aplicado) || 0,
          qtde_cotas: qtd,
          valor_cota_compra: r.valor_cota_compra != null ? Number(r.valor_cota_compra) : null,
          data_aplicacao: r.data_aplicacao,
          corretora: r.corretora,
          taxa_admin: r.taxa_admin != null ? Number(r.taxa_admin) : null,
          taxa_perf: r.taxa_perf != null ? Number(r.taxa_perf) : null,
          portfolio_id: r.portfolio_id,
          created_at: r.created_at,
          cota_atual: cotaAtual,
          valor_mtm: mtm,
        };
      }) as Fundo[];
    },
    enabled: !!userId,
    staleTime: 60 * 60 * 1000, // cotas mudam 1x/dia — cache 1h
  });

  useEffect(() => {
    if (query.data) setFundos(query.data);
  }, [query.data, setFundos]);

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
  const fundos = useFundos(userId);
  const caixa = useCaixa(userId);

  const isLoading = profile.isLoading || portfolios.isLoading || positions.isLoading ||
    proventos.isLoading || opcoes.isLoading || rf.isLoading || saldos.isLoading ||
    fundos.isLoading || caixa.isLoading;

  return { isLoading };
}
