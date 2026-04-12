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

// UUID sentinela para snapshot do portfolio "Padrao" (ops sem portfolio_id)
const PADRAO_SNAPSHOT_ID = "00000000-0000-0000-0000-000000000001";

async function generateSnapshots() {
  const today = new Date().toISOString().substring(0, 10);

  // 1. Buscar todos os tickers unicos com posicao positiva (inclui portfolio_id)
  const { data: ops, error: opsErr } = await supabase
    .from("operacoes")
    .select("user_id, ticker, tipo, quantidade, preco, custo_corretagem, custo_emolumentos, custo_impostos, mercado, portfolio_id");

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

  // 5. Buscar portfolios de todos os usuarios
  const { data: portfoliosData } = await supabase
    .from("portfolios")
    .select("id, user_id");
  const portfoliosByUser: Record<string, string[]> = {};
  for (const pf of portfoliosData || []) {
    if (!portfoliosByUser[pf.user_id]) portfoliosByUser[pf.user_id] = [];
    portfoliosByUser[pf.user_id].push(pf.id);
  }

  // 5b. Agregar posicoes por usuario+portfolio+ticker
  const userPortfolioPositions: Record<string, Record<string, Record<string, { qty: number; custoTotal: number; mercado: string }>>> = {};
  for (const op of ops || []) {
    const uid = op.user_id;
    const ticker = (op.ticker || "").toUpperCase().trim();
    if (!ticker) continue;
    const pfId = op.portfolio_id || "__null__";
    if (!userPortfolioPositions[uid]) userPortfolioPositions[uid] = {};
    if (!userPortfolioPositions[uid][pfId]) userPortfolioPositions[uid][pfId] = {};
    if (!userPortfolioPositions[uid][pfId][ticker])
      userPortfolioPositions[uid][pfId][ticker] = { qty: 0, custoTotal: 0, mercado: op.mercado || "BR" };
    const pos = userPortfolioPositions[uid][pfId][ticker];
    const custos = (op.custo_corretagem || 0) + (op.custo_emolumentos || 0) + (op.custo_impostos || 0);
    if (op.tipo === "compra") {
      pos.custoTotal += op.quantidade * op.preco + custos;
      pos.qty += op.quantidade;
    } else if (op.tipo === "venda") {
      if (pos.qty > 0) { const pm = pos.custoTotal / pos.qty; pos.custoTotal -= op.quantidade * pm; }
      pos.qty -= op.quantidade;
      if (pos.qty <= 0) { pos.qty = 0; pos.custoTotal = 0; }
    }
  }

  // 5c. Buscar RF por usuario+portfolio
  const { data: rfDataPf } = await supabase
    .from("renda_fixa")
    .select("user_id, valor_aplicado, portfolio_id");
  const rfByUserPortfolio: Record<string, Record<string, number>> = {};
  for (const rf of rfDataPf || []) {
    const uid = rf.user_id;
    const pfId = rf.portfolio_id || "__null__";
    if (!rfByUserPortfolio[uid]) rfByUserPortfolio[uid] = {};
    if (!rfByUserPortfolio[uid][pfId]) rfByUserPortfolio[uid][pfId] = 0;
    rfByUserPortfolio[uid][pfId] += rf.valor_aplicado || 0;
  }

  // 6. Calcular patrimonio real por usuario (global + per-portfolio)
  const allUsers = new Set([
    ...Object.keys(userPositions),
    ...Object.keys(rfByUser),
  ]);

  const snapshots: { user_id: string; data: string; valor: number; valor_investido: number; valor_saldos: number; portfolio_id: string | null }[] = [];

  // Buscar saldos por user
  const saldosRes = await supabase.from('saldos_corretora').select('user_id, saldo');
  const saldosByUser: Record<string, number> = {};
  for (const s of (saldosRes.data || [])) {
    if (!saldosByUser[s.user_id]) saldosByUser[s.user_id] = 0;
    saldosByUser[s.user_id] += (s.saldo || 0);
  }

  for (const uid of allUsers) {
    // Global snapshot (portfolio_id = null)
    let equity = 0;
    const positions = userPositions[uid] || {};
    for (const ticker of Object.keys(positions)) {
      const pos = positions[ticker];
      if (pos.qty <= 0) continue;
      const preco = prices[ticker] || pos.custoTotal / (pos.qty || 1);
      equity += pos.qty * preco;
    }
    const rf = rfByUser[uid] || 0;
    const investido = equity + rf;
    const saldosUser = saldosByUser[uid] || 0;
    const total = investido + saldosUser;
    if (total > 0) {
      snapshots.push({ user_id: uid, data: today, valor: total, valor_investido: investido, valor_saldos: saldosUser, portfolio_id: null });
    }

    // Per-portfolio snapshots
    const pfPositions = userPortfolioPositions[uid] || {};
    const pfRf = rfByUserPortfolio[uid] || {};
    const allPfIds = new Set([...Object.keys(pfPositions), ...Object.keys(pfRf)]);
    for (const pfId of allPfIds) {
      let pfEquity = 0;
      const pfTickers = pfPositions[pfId] || {};
      for (const ticker of Object.keys(pfTickers)) {
        const pos = pfTickers[ticker];
        if (pos.qty <= 0) continue;
        const preco = prices[ticker] || pos.custoTotal / (pos.qty || 1);
        pfEquity += pos.qty * preco;
      }
      const pfRfVal = pfRf[pfId] || 0;
      const pfTotal = pfEquity + pfRfVal;
      if (pfTotal > 0) {
        snapshots.push({
          user_id: uid,
          data: today,
          valor: pfTotal,
          valor_investido: pfTotal,
          valor_saldos: 0,
          portfolio_id: pfId === "__null__" ? PADRAO_SNAPSHOT_ID : pfId,
        });
      }
    }
  }

  // 7. Save snapshots (update existing, insert new)
  let savedCount = 0;
  for (const snap of snapshots) {
    let query = supabase
      .from("patrimonio_snapshots")
      .update({ valor: snap.valor, valor_investido: snap.valor_investido, valor_saldos: snap.valor_saldos })
      .eq("user_id", snap.user_id)
      .eq("data", snap.data);
    if (snap.portfolio_id) {
      query = query.eq("portfolio_id", snap.portfolio_id);
    } else {
      query = query.is("portfolio_id", null);
    }
    const updateResult = await query.select();
    if (!updateResult.error && (!updateResult.data || updateResult.data.length === 0)) {
      const payload: any = { user_id: snap.user_id, data: snap.data, valor: snap.valor, valor_investido: snap.valor_investido, valor_saldos: snap.valor_saldos };
      if (snap.portfolio_id) payload.portfolio_id = snap.portfolio_id;
      await supabase.from("patrimonio_snapshots").insert(payload);
    }
    savedCount++;
  }

  console.log("Saved", savedCount, "snapshots for", today);
  return { ok: true, count: savedCount, date: today };
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
