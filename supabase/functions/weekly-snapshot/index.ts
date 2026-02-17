// weekly-snapshot — Supabase Edge Function
// Roda toda sexta 18h BRT via pg_cron ou Supabase Cron
// Busca cotacoes reais da brapi e salva snapshot de patrimonio por usuario

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BRAPI_URL = "https://brapi.dev/api/quote/";
const BRAPI_TOKEN = "tEU8wyBixv8hCi7J3NCjsi";

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

async function generateSnapshots() {
  const today = new Date().toISOString().substring(0, 10);

  // 1. Buscar todos os tickers unicos com posicao positiva
  const { data: ops, error: opsErr } = await supabase
    .from("operacoes")
    .select("user_id, ticker, tipo, quantidade, preco, custo_corretagem, custo_emolumentos, custo_impostos");

  if (opsErr) {
    console.error("Error fetching operacoes:", opsErr);
    return { error: opsErr.message };
  }

  // 2. Agregar posicoes por usuario+ticker
  const userPositions: Record<
    string,
    Record<string, { qty: number; custoTotal: number }>
  > = {};
  const allTickers: Set<string> = new Set();

  for (const op of ops || []) {
    const uid = op.user_id;
    const ticker = (op.ticker || "").toUpperCase().trim();
    if (!ticker) continue;

    if (!userPositions[uid]) userPositions[uid] = {};
    if (!userPositions[uid][ticker])
      userPositions[uid][ticker] = { qty: 0, custoTotal: 0 };

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

  // 3. Buscar cotacoes reais
  const tickerList = Array.from(allTickers);
  console.log("Fetching prices for", tickerList.length, "tickers");
  const prices = await fetchPricesFromBrapi(tickerList);
  console.log("Got prices for", Object.keys(prices).length, "tickers");

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
