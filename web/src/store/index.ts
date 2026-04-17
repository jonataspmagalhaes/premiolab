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
  // Campos expandidos pra calculo de P&L e IR
  premio_fechamento?: number | null;
  data_abertura?: string;
  data_fechamento?: string | null;
  portfolio_id?: string | null;
  corretora?: string | null;
}

// Provento estimado (nao-anunciado, vem de calendario externo)
// Hidratado por hook useProventosCalendar a partir de /api/proventos/calendar
export interface ProventoEstimado {
  ticker: string;
  data_com: string;
  data_pagamento: string;
  valor_por_cota: number;
  tipo: string;
  fonte: 'dm' | 'statusinvest' | 'cache';
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
  atual: number;                       // media 12m liquida
  porFonte: {
    fii: number;
    acao: number;
    etf: number;
    stock_int: number;
    opcao: number;
    rf: number;
  };
  dyReal: number;                      // (liquido 12m / patrimonio) * 100
  rendaOpcoes12m: number;              // soma liquida 12m de ganhos realizados em opcoes
  proventosEstimados: ProventoEstimado[];  // hidratado por hook useProventosCalendar
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
  setProventosEstimados: (e: ProventoEstimado[]) => void;

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

// Helpers de IR para calculo liquido dentro do store (sem criar dep cruzada com proventosUtils.ts)
function isIntTickerStore(t: string): boolean {
  if (!t) return false;
  return !/\d$/.test(t.toUpperCase());
}
function tipoLabelStore(t: string): string {
  const x = (t || '').toLowerCase();
  if (x.indexOf('jcp') >= 0 || x.indexOf('juros') >= 0) return 'JCP';
  if (x.indexOf('rend') >= 0) return 'Rendimento';
  return 'Dividendo';
}
function valorLiquidoStore(bruto: number, tipo: string, ticker: string): number {
  if (tipoLabelStore(tipo) === 'JCP') return bruto * 0.85;
  if (isIntTickerStore(ticker)) return bruto * 0.70;
  return bruto;
}

function computeRenda(
  proventos: Provento[],
  positions: Position[],
  opcoes: Opcao[],
  patrimonioTotal: number,
  estimados: ProventoEstimado[] = [],
): RendaSlice {
  // Mapa ticker -> categoria a partir de positions (evita lookup repetido)
  const catByTicker: Record<string, string> = {};
  for (const pos of positions) catByTicker[pos.ticker] = pos.categoria;

  const now = Date.now();
  const limite12m = now - 365 * 86400000;

  // 1) Totais 12m liquidos + breakdown por fonte
  const porFonte = { fii: 0, acao: 0, etf: 0, stock_int: 0, opcao: 0, rf: 0 };
  let total12m = 0;
  let total12mBruto = 0;

  for (const p of proventos) {
    const d = new Date(p.data_pagamento).getTime();
    if (isNaN(d)) continue;
    if (d > now) continue;            // ignora futuros na soma historica
    if (d < limite12m) continue;
    const liquido = valorLiquidoStore(p.valor_total || 0, p.tipo_provento, p.ticker);
    total12m += liquido;
    total12mBruto += p.valor_total || 0;
    const cat = catByTicker[p.ticker] || 'acao';
    if (cat === 'fii') porFonte.fii += liquido;
    else if (cat === 'etf') porFonte.etf += liquido;
    else if (cat === 'stock_int') porFonte.stock_int += liquido;
    else porFonte.acao += liquido;   // acao, bdr, adr, reit, etc
  }

  // 2) Renda de opcoes nos ultimos 12m (apenas operacoes ja realizadas)
  let rendaOpcoes12m = 0;
  for (const o of opcoes) {
    const status = (o.status || '').toLowerCase();
    const realizada = status === 'exercida' || status === 'expirada' || status === 'fechada' || status === 'expirou_po';
    if (!realizada) continue;
    const dataRef = o.data_fechamento || o.vencimento || o.data_abertura;
    if (!dataRef) continue;
    const ts = new Date(dataRef).getTime();
    if (isNaN(ts) || ts < limite12m || ts > now) continue;
    const qty = o.qty || 0;
    const premioAbert = (o.premio || 0) * qty;
    const premioFech = (o.premio_fechamento || 0) * qty;
    const isVenda = (o.direcao || 'venda') === 'venda' || (o.direcao || '').toLowerCase() === 'lancamento';
    // Venda: recebe premio na abertura; paga premio_fechamento se recomprou; se expirou, premio_fechamento = 0 (lucro cheio)
    // Compra: paga premio na abertura; recebe premio_fechamento se vendeu; se expirou, perde tudo
    const ganho = isVenda ? (premioAbert - premioFech) : (premioFech - premioAbert);
    rendaOpcoes12m += ganho;
  }
  porFonte.opcao = rendaOpcoes12m;

  // 3) atual = media mensal liquida 12m (proventos + opcoes)
  const atual = (total12m + rendaOpcoes12m) / 12;

  // 4) DY real liquido = (total liquido 12m incluindo opcoes) / patrimonio
  const dyReal = patrimonioTotal > 0 ? ((total12m + rendaOpcoes12m) / patrimonioTotal) * 100 : 0;

  return {
    atual,
    porFonte,
    dyReal,
    rendaOpcoes12m,
    proventosEstimados: estimados,
  };
}

const emptyPatrimonio: PatrimonioSlice = {
  total: 0,
  porClasse: { fii: 0, acao: 0, etf: 0, stock_int: 0, bdr: 0, adr: 0, reit: 0, cripto: 0, fundo: 0, rf: 0, caixa: 0 },
  investido: 0,
};
const emptyRenda: RendaSlice = {
  atual: 0,
  porFonte: { fii: 0, acao: 0, etf: 0, stock_int: 0, opcao: 0, rf: 0 },
  dyReal: 0,
  rendaOpcoes12m: 0,
  proventosEstimados: [],
};
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
    const patrimonio = computePatrimonio(p, state.rf, state.caixa, state.fundos, state.usdBrl);
    set({
      patrimonio,
      renda: computeRenda(state.proventos, p, state.opcoes, patrimonio.total, state.renda.proventosEstimados),
    });
  },

  setProventos: (p) => {
    set({ proventos: p });
    const state = get();
    set({ renda: computeRenda(p, state.positions, state.opcoes, state.patrimonio.total, state.renda.proventosEstimados) });
  },

  setOpcoes: (o) => {
    set({ opcoes: o });
    const state = get();
    set({ renda: computeRenda(state.proventos, state.positions, o, state.patrimonio.total, state.renda.proventosEstimados) });
  },

  setRf: (r) => {
    set({ rf: r });
    const state = get();
    const patrimonio = computePatrimonio(state.positions, r, state.caixa, state.fundos, state.usdBrl);
    set({
      patrimonio,
      renda: computeRenda(state.proventos, state.positions, state.opcoes, patrimonio.total, state.renda.proventosEstimados),
    });
  },

  setFundos: (f) => {
    set({ fundos: f });
    const state = get();
    const patrimonio = computePatrimonio(state.positions, state.rf, state.caixa, f, state.usdBrl);
    set({
      patrimonio,
      renda: computeRenda(state.proventos, state.positions, state.opcoes, patrimonio.total, state.renda.proventosEstimados),
    });
  },

  setSaldos: (s) => {
    // legado — nao recomputa patrimonio
    set({ saldos: s });
  },

  setCaixa: (c) => {
    set({ caixa: c });
    const state = get();
    const patrimonio = computePatrimonio(state.positions, state.rf, c, state.fundos, state.usdBrl);
    set({
      patrimonio,
      renda: computeRenda(state.proventos, state.positions, state.opcoes, patrimonio.total, state.renda.proventosEstimados),
    });
  },

  setUsdBrl: (rate) => {
    set({ usdBrl: rate });
    const state = get();
    const patrimonio = computePatrimonio(state.positions, state.rf, state.caixa, state.fundos, rate);
    set({
      patrimonio,
      renda: computeRenda(state.proventos, state.positions, state.opcoes, patrimonio.total, state.renda.proventosEstimados),
    });
  },

  setProfile: (p) => set({ profile: p }),
  setPortfolios: (p) => set({ portfolios: p }),

  setProventosEstimados: (e) => {
    const state = get();
    set({ renda: { ...state.renda, proventosEstimados: e } });
  },
}));
