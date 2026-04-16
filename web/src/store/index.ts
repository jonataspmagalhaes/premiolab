// Store central unico — Zustand
// Todas as telas consomem slices derivados, NENHUMA calcula
// Dados brutos vem do React Query, store deriva

import { create } from 'zustand';

// ══════════ Types ══════════

export interface PorCorretora {
  corretora: string;
  quantidade: number;
  pm: number;
  valor_mercado?: number;
  pl?: number;
  pl_pct?: number;
}

export interface Position {
  ticker: string;
  categoria: string;
  quantidade: number;
  pm: number;
  preco_atual?: number;
  valor_mercado?: number;
  pl?: number;
  pl_pct?: number;
  day_change_pct?: number;
  mercado?: string;
  portfolio_id?: string | null;
  sector?: string;
  industry?: string;
  por_corretora?: PorCorretora[];
}

export interface Portfolio {
  id: string;
  nome: string;
  cor?: string;
  icone?: string;
  ordem?: number;
}

export interface Provento {
  id?: string | number;
  ticker: string;
  tipo_provento: string;
  valor_total: number;
  valor_por_cota?: number;
  quantidade?: number;
  data_pagamento: string;
  fonte?: string | null;
}

export interface Opcao {
  id?: string;
  ativo_base: string;
  ticker_opcao: string;
  tipo: 'call' | 'put';
  direcao: string;
  strike: number;
  premio: number;
  qty: number;
  vencimento: string;
  status: string;
}

export interface RendaFixa {
  id?: string;
  tipo: string;
  emissor: string;
  taxa: number;
  indexador?: string;        // legado; pode vir vazio
  valor_aplicado: number;
  vencimento: string;
  corretora?: string | null;
  created_at?: string;       // proxy de data de aplicacao p/ MTM
  portfolio_id?: string | null;
  valor_mtm?: number;        // marcacao a mercado (composicao de juros ate hoje)
}

export interface Fundo {
  id?: string;
  cnpj: string;
  nome: string;
  classe?: string | null;
  valor_aplicado: number;
  qtde_cotas?: number | null;
  valor_cota_compra?: number | null;
  data_aplicacao: string;
  corretora?: string | null;
  taxa_admin?: number | null;
  taxa_perf?: number | null;
  portfolio_id?: string | null;
  created_at?: string;
  valor_mtm?: number;        // qtde_cotas × cota atual via DadosDeMercado
  cota_atual?: number;
}

export interface Saldo {
  id?: string;
  name: string;
  saldo: number;
  tipo?: string;
  moeda?: string;
}

export interface Caixa {
  id: string;
  corretora: string;
  moeda: 'BRL' | 'USD';
  valor: number;           // pode ser negativo (saida)
  data: string;            // ISO date
  descricao?: string | null;
  created_at?: string;
}

export interface Profile {
  id: string;
  nome?: string;
  meta_mensal?: number;
  selic?: number;
  tier?: string;
}

// ══════════ Derived Slices ══════════

export interface PatrimonioSlice {
  total: number;
  porClasse: {
    fii: number; acao: number; etf: number; stock_int: number;
    bdr: number; adr: number; reit: number; cripto: number;
    fundo: number; rf: number; caixa: number;
  };
  investido: number;
}

export interface RendaSlice {
  atual: number;
  porFonte: { fii: number; acao: number; opcao: number; rf: number };
  dyReal: number;
}

export interface GapSlice {
  fiiDeficit: number;
  acaoDeficit: number;
  caixaOciosa: number;
  mesesFracos: number[];
}

// ══════════ Store ══════════

interface AppState {
  // Raw data (populated by React Query)
  positions: Position[];
  proventos: Provento[];
  opcoes: Opcao[];
  rf: RendaFixa[];
  fundos: Fundo[];
  saldos: Saldo[];         // legado — nao usado em patrimonio; mantido ate mobile sair
  caixa: Caixa[];
  usdBrl: number;          // cotacao USD→BRL do ultimo fetch de precos (0 se nao fetchou)
  profile: Profile | null;
  portfolios: Portfolio[];

  // Portfolio selection (global, persisted)
  // null = Todos | '__null__' = Padrao | UUID = custom
  selectedPortfolio: string | null;
  setSelectedPortfolio: (p: string | null) => void;

  // Setters
  setPositions: (p: Position[]) => void;
  setProventos: (p: Provento[]) => void;
  setOpcoes: (o: Opcao[]) => void;
  setRf: (r: RendaFixa[]) => void;
  setFundos: (f: Fundo[]) => void;
  setSaldos: (s: Saldo[]) => void;
  setCaixa: (c: Caixa[]) => void;
  setUsdBrl: (rate: number) => void;
  setProfile: (p: Profile) => void;
  setPortfolios: (p: Portfolio[]) => void;

  // Derived (computed on set)
  patrimonio: PatrimonioSlice;
  renda: RendaSlice;
  gaps: GapSlice;
}

export const PORTFOLIO_STORAGE_KEY = 'premiolab-web-portfolio';

export function loadSelectedPortfolio(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PORTFOLIO_STORAGE_KEY);
    if (raw === null) return null;
    if (raw === 'null' || raw === '') return null;
    return raw;
  } catch {
    return null;
  }
}

function persistSelectedPortfolio(p: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (p === null) {
      window.localStorage.removeItem(PORTFOLIO_STORAGE_KEY);
    } else {
      window.localStorage.setItem(PORTFOLIO_STORAGE_KEY, p);
    }
  } catch {
    // ignore
  }
}

function computePatrimonio(positions: Position[], rf: RendaFixa[], caixa: Caixa[], fundos: Fundo[], usdBrl: number): PatrimonioSlice {
  const porClasse = {
    fii: 0, acao: 0, etf: 0, stock_int: 0,
    bdr: 0, adr: 0, reit: 0, cripto: 0,
    fundo: 0, rf: 0, caixa: 0,
  };

  for (const pos of positions) {
    if (pos.quantidade <= 0) continue;
    const val = (pos.preco_atual ?? pos.pm) * pos.quantidade;
    const cat = pos.categoria as keyof typeof porClasse;
    if (cat in porClasse) {
      porClasse[cat] += val;
    } else {
      porClasse.acao += val;
    }
  }

  // RF: prefere MTM (juros acumulados ate hoje) se disponivel
  for (const r of rf) {
    porClasse.rf += (r.valor_mtm != null ? r.valor_mtm : r.valor_aplicado) || 0;
  }

  // Fundos: prefere MTM (qtde_cotas × cota atual) se disponivel
  for (const f of fundos) {
    porClasse.fundo += (f.valor_mtm != null ? f.valor_mtm : f.valor_aplicado) || 0;
  }

  // Caixa: soma entradas +/- por moeda, converte USD via usdBrl (0 = sem cotacao ainda)
  for (const c of caixa) {
    const v = Number(c.valor) || 0;
    if (c.moeda === 'USD') {
      porClasse.caixa += usdBrl > 0 ? v * usdBrl : 0;
    } else {
      porClasse.caixa += v;
    }
  }

  const total = Object.values(porClasse).reduce((a, b) => a + b, 0);
  const investido = total - porClasse.caixa;

  return { total, porClasse, investido };
}

function computeRenda(proventos: Provento[]): RendaSlice {
  // Media ultimos 3 meses completos
  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthlyMap: Record<string, number> = {};

  for (const p of proventos) {
    const d = new Date(p.data_pagamento);
    if (isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthlyMap[key] = (monthlyMap[key] || 0) + (p.valor_total || 0);
  }

  const months = Object.keys(monthlyMap)
    .filter(k => k !== currentKey)
    .sort()
    .slice(-3);

  let sum = 0;
  for (const m of months) sum += monthlyMap[m] || 0;
  const atual = months.length > 0 ? sum / months.length : 0;

  return {
    atual,
    porFonte: { fii: 0, acao: 0, opcao: 0, rf: 0 },
    dyReal: 0,
  };
}

const emptyPatrimonio: PatrimonioSlice = {
  total: 0,
  porClasse: { fii: 0, acao: 0, etf: 0, stock_int: 0, bdr: 0, adr: 0, reit: 0, cripto: 0, fundo: 0, rf: 0, caixa: 0 },
  investido: 0,
};
const emptyRenda: RendaSlice = { atual: 0, porFonte: { fii: 0, acao: 0, opcao: 0, rf: 0 }, dyReal: 0 };
const emptyGaps: GapSlice = { fiiDeficit: 0, acaoDeficit: 0, caixaOciosa: 0, mesesFracos: [] };

export const useAppStore = create<AppState>((set, get) => ({
  positions: [],
  proventos: [],
  opcoes: [],
  rf: [],
  fundos: [],
  saldos: [],
  caixa: [],
  usdBrl: 0,
  profile: null,
  portfolios: [],

  // Always starts null on SSR/first client render to avoid hydration mismatch.
  // DataLoader hydrates from localStorage after mount.
  selectedPortfolio: null,
  setSelectedPortfolio: (p) => {
    persistSelectedPortfolio(p);
    set({ selectedPortfolio: p });
  },

  patrimonio: emptyPatrimonio,
  renda: emptyRenda,
  gaps: emptyGaps,

  setPositions: (p) => {
    set({ positions: p });
    const state = get();
    set({ patrimonio: computePatrimonio(p, state.rf, state.caixa, state.fundos, state.usdBrl) });
  },

  setProventos: (p) => {
    set({ proventos: p });
    set({ renda: computeRenda(p) });
  },

  setOpcoes: (o) => set({ opcoes: o }),

  setRf: (r) => {
    set({ rf: r });
    const state = get();
    set({ patrimonio: computePatrimonio(state.positions, r, state.caixa, state.fundos, state.usdBrl) });
  },

  setFundos: (f) => {
    set({ fundos: f });
    const state = get();
    set({ patrimonio: computePatrimonio(state.positions, state.rf, state.caixa, f, state.usdBrl) });
  },

  setSaldos: (s) => {
    // legado — nao recomputa patrimonio
    set({ saldos: s });
  },

  setCaixa: (c) => {
    set({ caixa: c });
    const state = get();
    set({ patrimonio: computePatrimonio(state.positions, state.rf, c, state.fundos, state.usdBrl) });
  },

  setUsdBrl: (rate) => {
    set({ usdBrl: rate });
    const state = get();
    set({ patrimonio: computePatrimonio(state.positions, state.rf, state.caixa, state.fundos, rate) });
  },

  setProfile: (p) => set({ profile: p }),
  setPortfolios: (p) => set({ portfolios: p }),
}));
