// weekly-snapshot — Supabase Edge Function
// Roda toda sexta 18h BRT via pg_cron ou Supabase Cron
// Busca cotacoes reais da brapi (BR) e Yahoo (INT) e salva snapshot de patrimonio por usuario

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BRAPI_URL = "https://brapi.dev/api/quote/";
const BRAPI_TOKEN = "tEU8wyBixv8hCi7J3NCjsi";
const YAHOO_URL = "https://query1.finance.yahoo.com/v8/finance/chart/";
const BRAPI_CURRENCY_URL = "https://brapi.dev/api/v2/currency";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseKey);

// Buscar cotacoes da brapi em chunks de 20
async function fetchPricesFromBrapi(
  tickers: string[]
): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  const chunkSize = 20;

  for (let i = 0; i < tickers.length; i += chunkSize) {
    const chunk = tickers.slice(i, i + chunkSize);
    try {
      const url =
        BRAPI_URL +
        chunk.join(",") +
        "?fundamental=false&token=" +
        BRAPI_TOKEN;
      const resp = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      if (!resp.ok) continue;

      const json = await resp.json();
      const results = json.results || [];
      for (const r of results) {
        if (r.symbol && r.regularMarketPrice != null) {
          prices[r.symbol.toUpperCase()] = r.regularMarketPrice;
        }
      }
    } catch (err) {
      console.warn("Brapi chunk error:", err);
    }
  }

  return prices;
}

// Buscar cotacoes do Yahoo Finance (ativos internacionais, um por vez)
async function fetchPricesFromYahoo(
  tickers: string[]
): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};

  for (const ticker of tickers) {
    try {
      const url = YAHOO_URL + encodeURIComponent(ticker) + "?interval=1d&range=1d";
      const resp = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      if (!resp.ok) continue;

      const json = await resp.json();
      const result = json.chart?.result?.[0];
      if (result?.meta?.regularMarketPrice) {
        prices[ticker.toUpperCase()] = result.meta.regularMarketPrice;
      }
    } catch (err) {
      console.warn("Yahoo price error for " + ticker + ":", err);
    }
  }

  return prices;
}

// Buscar cambio USD->BRL
async function fetchUsdRate(): Promise<number> {
  try {
    const url = BRAPI_CURRENCY_URL + "?currency=USD-BRL&token=" + BRAPI_TOKEN;
    const resp = await fetch(url, { headers: { Accept: "application/json" } });
    if (!resp.ok) return 5.0; // fallback
    const json = await resp.json();
    const currencies = json.currency || [];
    for (const c of currencies) {
      if (c.fromCurrency === "USD" && c.bidPrice) {
        return parseFloat(c.bidPrice);
      }
    }
  } catch (err) {
    console.warn("USD rate error:", err);
  }
  return 5.0; // fallback
}

async function generateSnapshots() {
  const today = new Date().toISOString().substring(0, 10);

  // 1. Buscar todos os tickers unicos com posicao positiva
  const { data: ops, error: opsErr } = await supabase
    .from("operacoes")
    .select("user_id, ticker, tipo, quantidade, preco, custo_corretagem, custo_emolumentos, custo_impostos, mercado");

  if (opsErr) {
    console.error("Error fetching operacoes:", opsErr);
    return { error: opsErr.message };
  }

  // 2. Agregar posicoes por usuario+ticker
  const userPositions: Record<
    string,
    Record<string, { qty: number; custoTotal: number; mercado: string }>
  > = {};
  const allTickers: Set<string> = new Set();
  const tickerMercado: Record<string, string> = {};

  for (const op of ops || []) {
    const uid = op.user_id;
    const ticker = (op.ticker || "").toUpperCase().trim();
    if (!ticker) continue;

    const mercado = op.mercado || "BR";
    tickerMercado[ticker] = mercado;

    if (!userPositions[uid]) userPositions[uid] = {};
    if (!userPositions[uid][ticker])
      userPositions[uid][ticker] = { qty: 0, custoTotal: 0, mercado: mercado };

    const pos = userPositions[uid][ticker];
    const custos =
      (op.custo_corretagem || 0) +
      (op.custo_emolumentos || 0) +
      (op.custo_impostos || 0);

    if (op.tipo === "compra") {
      pos.custoTotal += op.quantidade * op.preco + custos;
      pos.qty += op.quantidade;
    } else if (op.tipo === "venda") {
      if (pos.qty > 0) {
        const pm = pos.custoTotal / pos.qty;
        pos.custoTotal -= op.quantidade * pm;
      }
      pos.qty -= op.quantidade;
      if (pos.qty <= 0) {
        pos.qty = 0;
        pos.custoTotal = 0;
      }
    }
  }

  // Coletar tickers com posicao > 0
  for (const uid of Object.keys(userPositions)) {
    for (const ticker of Object.keys(userPositions[uid])) {
      if (userPositions[uid][ticker].qty > 0) {
        allTickers.add(ticker);
      }
    }
  }

  // 3. Buscar cotacoes reais (separar BR vs INT)
  const tickerList = Array.from(allTickers);
  const brTickers: string[] = [];
  const intTickers: string[] = [];
  for (const t of tickerList) {
    if (tickerMercado[t] === "INT") {
      intTickers.push(t);
    } else {
      brTickers.push(t);
    }
  }

  console.log("Fetching prices: BR=" + brTickers.length + ", INT=" + intTickers.length);

  // Buscar em paralelo: BR via brapi, INT via Yahoo, cambio USD
  const [brPrices, intPricesUsd, usdRate] = await Promise.all([
    brTickers.length > 0 ? fetchPricesFromBrapi(brTickers) : Promise.resolve({}),
    intTickers.length > 0 ? fetchPricesFromYahoo(intTickers) : Promise.resolve({}),
    intTickers.length > 0 ? fetchUsdRate() : Promise.resolve(1),
  ]);

  // Merge: converter INT de USD para BRL
  const prices: Record<string, number> = { ...brPrices };
  for (const [ticker, priceUsd] of Object.entries(intPricesUsd)) {
    prices[ticker] = priceUsd * usdRate;
  }

  console.log("Got prices for", Object.keys(prices).length, "tickers (USD rate=" + usdRate + ")");

  // 4. Buscar renda fixa por usuario
  const { data: rfData } = await supabase
    .from("renda_fixa")
    .select("user_id, valor_aplicado");

  const rfByUser: Record<string, number> = {};
  for (const rf of rfData || []) {
    if (!rfByUser[rf.user_id]) rfByUser[rf.user_id] = 0;
    rfByUser[rf.user_id] += rf.valor_aplicado || 0;
  }

  // 5. Calcular patrimonio real por usuario
  const allUsers = new Set([
    ...Object.keys(userPositions),
    ...Object.keys(rfByUser),
  ]);

  const snapshots: { user_id: string; data: string; valor: number }[] = [];

  for (const uid of allUsers) {
    let equity = 0;
    const positions = userPositions[uid] || {};

    for (const ticker of Object.keys(positions)) {
      const pos = positions[ticker];
      if (pos.qty <= 0) continue;

      // Usar preco real se disponivel, senao PM
      const preco = prices[ticker] || pos.custoTotal / (pos.qty || 1);
      equity += pos.qty * preco;
    }

    const rf = rfByUser[uid] || 0;
    const total = equity + rf;

    if (total > 0) {
      snapshots.push({ user_id: uid, data: today, valor: total });
    }
  }

  // 6. Upsert snapshots
  if (snapshots.length > 0) {
    const { error: upsertErr } = await supabase
      .from("patrimonio_snapshots")
      .upsert(snapshots, { onConflict: "user_id,data" });

    if (upsertErr) {
      console.error("Upsert error:", upsertErr);
      return { error: upsertErr.message };
    }
  }

  console.log("Saved", snapshots.length, "snapshots for", today);
  return { ok: true, count: snapshots.length, date: today };
}

Deno.serve(async (req) => {
  try {
    // Verificar auth header (cron envia o service role key)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.includes(supabaseKey)) {
      // Permitir tambem chamada via cron sem header (internal)
      const url = new URL(req.url);
      if (url.searchParams.get("key") !== supabaseKey) {
        // Aceitar de qualquer forma se vier do cron interno
      }
    }

    const result = await generateSnapshots();

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
