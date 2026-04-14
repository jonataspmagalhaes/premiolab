// dadosdemercado.ts — Cliente compartilhado entre edge functions
// Docs: https://www.dadosdemercado.com.br/api/docs
//
// Uso:
//   import { dm, DM_ENABLED } from "../_shared/dadosdemercado.ts";
//   if (DM_ENABLED) {
//     const divs = await dm.dividendsByFII("VGIP11");
//   }
//
// Feature flag: DM_ENABLED (env) — controla se API esta ativa.
// Rollback sem deploy: setar DM_ENABLED=false via `supabase secrets set`.

const DM_BASE = "https://api.dadosdemercado.com.br/v1";
const DM_API_KEY = Deno.env.get("DM_API_KEY") || "";
// Ativo automaticamente se a chave estiver presente. Pra desativar: remover o secret DM_API_KEY.
export const DM_ENABLED = DM_API_KEY.length > 0;

// Rate limit: plano = 1 req/s. Fila simples global por instancia da edge function.
let _lastCallMs = 0;
const MIN_INTERVAL_MS = 1050; // 1s + buffer 50ms de seguranca

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - _lastCallMs;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - elapsed));
  }
  _lastCallMs = Date.now();
}

async function dmFetch<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T | null> {
  if (!DM_ENABLED) return null;
  await rateLimit();

  const url = new URL(DM_BASE + path);
  if (params) {
    for (const k of Object.keys(params)) {
      const v = params[k];
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }

  try {
    const resp = await fetch(url.toString(), {
      headers: {
        "Authorization": "Bearer " + DM_API_KEY,
        "Accept": "application/json",
      },
    });
    if (!resp.ok) {
      console.warn("dm " + path + " HTTP " + resp.status);
      return null;
    }
    return (await resp.json()) as T;
  } catch (err) {
    console.warn("dm " + path + " error:", err);
    return null;
  }
}

// ══════════ TYPES ══════════

export interface DMDividend {
  ticker: string;
  type: string | null;         // DIVIDENDO | JCP | RENDIMENTO | AMORTIZACAO | ...
  amount: number;              // bruto por cota
  adj_amount: number | null;   // ajustado (splits/bonif)
  approval_date: string | null;
  ex_date: string | null;
  record_date: string;         // data-com
  payable_date: string | null; // data de pagamento
  cvm_code: number | null;
  notes: string | null;
}

export interface DMQuote {
  ticker: string;
  price: number;
  change: number;
  change_percent: number;
  volume: number;
  day_high: number;
  day_low: number;
  updated_at: string;
}

export interface DMMacroIndex {
  code: string;   // SELIC | IPCA | CDI | IGPM | DOLAR
  date: string;
  value: number;
  period: string; // daily | monthly | annual
}

export interface DMFocusExpectation {
  indicator: string;
  year: number;
  median: number;
  mean: number;
  updated_at: string;
}

export interface DMCurrencyConversion {
  from: string;
  to: string;
  rate: number;
  date: string;
}

export interface DMFundamentals {
  ticker: string;
  pl: number | null;
  pvp: number | null;
  dy: number | null;
  roe: number | null;
  roa: number | null;
  margem_liquida: number | null;
  divida_liquida_ebitda: number | null;
  updated_at: string;
}

export interface DMNews {
  title: string;
  url: string;
  source: string;
  published_at: string;
  tickers: string[];
}

// ══════════ ENDPOINTS ══════════
// Expor apenas o que for consumido. Adicionar sob demanda.

export const dm = {
  // Dividendos empresas (ACAO + BDR) — API retorna array direto
  dividendsByCompany: async function (ticker: string, dateFrom?: string): Promise<DMDividend[]> {
    const json = await dmFetch<DMDividend[]>(
      "/companies/" + encodeURIComponent(ticker) + "/dividends",
      dateFrom ? { date_from: dateFrom } : undefined,
    );
    return Array.isArray(json) ? json : [];
  },

  // Dividendos FII — API retorna array direto
  dividendsByFII: async function (ticker: string, dateFrom?: string): Promise<DMDividend[]> {
    const json = await dmFetch<DMDividend[]>(
      "/reits/" + encodeURIComponent(ticker) + "/dividends",
      dateFrom ? { date_from: dateFrom } : undefined,
    );
    return Array.isArray(json) ? json : [];
  },

  // Cotacao de ativos (batch)
  quotes: async function (tickers: string[]): Promise<DMQuote[]> {
    if (tickers.length === 0) return [];
    const json = await dmFetch<{ data: DMQuote[] }>(
      "/assets/quotes",
      { tickers: tickers.join(",") },
    );
    return (json && json.data) || [];
  },

  // Indices macro (SELIC, IPCA, CDI, etc)
  macroIndex: async function (code: string, dateFrom?: string): Promise<DMMacroIndex[]> {
    const json = await dmFetch<{ data: DMMacroIndex[] }>(
      "/macro/indices/" + encodeURIComponent(code),
      dateFrom ? { date_from: dateFrom } : undefined,
    );
    return (json && json.data) || [];
  },

  // Boletim Focus — projecoes mercado
  focusExpectations: async function (indicator: string): Promise<DMFocusExpectation[]> {
    const json = await dmFetch<{ data: DMFocusExpectation[] }>(
      "/macro/focus",
      { indicator: indicator },
    );
    return (json && json.data) || [];
  },

  // Conversao moeda
  convertCurrency: async function (from: string, to: string): Promise<DMCurrencyConversion | null> {
    const json = await dmFetch<{ data: DMCurrencyConversion }>(
      "/currencies/convert",
      { from: from, to: to },
    );
    return (json && json.data) || null;
  },

  // Fundamentalistas
  fundamentals: async function (ticker: string): Promise<DMFundamentals | null> {
    const json = await dmFetch<{ data: DMFundamentals }>(
      "/companies/" + encodeURIComponent(ticker) + "/indicators",
    );
    return (json && json.data) || null;
  },

  // Noticias
  news: async function (ticker?: string, limit: number = 20): Promise<DMNews[]> {
    const json = await dmFetch<{ data: DMNews[] }>(
      "/news",
      { ticker: ticker, limit: limit },
    );
    return (json && json.data) || [];
  },
};
