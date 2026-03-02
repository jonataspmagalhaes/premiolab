// oplab-options — Supabase Edge Function
// Proxy seguro para API de mercado de opcoes B3
// API key armazenada como secret OPLAB_API_KEY (nunca exposta ao client)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPLAB_BASE = "https://api.oplab.com.br/v3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function ok(data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return ok({ error: "Token ausente." });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData || !userData.user) {
      return ok({ error: "Não autenticado." });
    }

    // 2. Parse request body
    const body = await req.json();
    if (!body || !body.ticker) {
      return ok({ error: "Ticker obrigatório." });
    }

    const ticker = String(body.ticker).toUpperCase().trim();
    const selic = body.selic || 13.25;

    // 3. Get API key from secret
    const oplabKey = Deno.env.get("OPLAB_API_KEY");
    if (!oplabKey) {
      return ok({ error: "Serviço indisponível." });
    }

    // 4. Fetch options chain with BS greeks
    const url = OPLAB_BASE + "/market/instruments/series/" + ticker + "?bs=true&irate=" + selic;

    const oplabResp = await fetch(url, {
      method: "GET",
      headers: {
        "Access-Token": oplabKey,
      },
    });

    if (!oplabResp.ok) {
      const status = oplabResp.status;
      if (status === 401 || status === 402) {
        return ok({ error: "API não autorizada." });
      }
      if (status === 429 || status === 503) {
        return ok({ error: "API sobrecarregada. Tente em 30s." });
      }
      if (status === 404) {
        return ok({ error: "Ticker não encontrado ou sem opções listadas." });
      }
      return ok({ error: "Erro API: " + status });
    }

    const data = await oplabResp.json();

    // Debug: log first option's keys to identify greek field names
    if (data.series && data.series.length > 0) {
      const firstSerie = data.series[0];
      if (firstSerie.strikes && firstSerie.strikes.length > 0) {
        const sample = firstSerie.strikes[0];
        const sampleOpt = sample.call || sample.put;
        if (sampleOpt) {
          console.log("OpLab option fields:", Object.keys(sampleOpt).join(", "));
          console.log("OpLab sample option:", JSON.stringify(sampleOpt).substring(0, 500));
        }
      }
    }

    // 5. Return raw data (client normalizes)
    return ok({
      symbol: data.symbol || ticker,
      name: data.name || "",
      spot: data.close || data.bid || 0,
      bid: data.bid || 0,
      ask: data.ask || 0,
      volume: data.volume || 0,
      iv_current: data.iv_current || null,
      ewma_current: data.ewma_current || null,
      beta_ibov: data.beta_ibov || null,
      stdv_1y: data.stdv_1y || null,
      series: data.series || [],
    });

  } catch (err) {
    console.error("oplab-options error:", err);
    return ok({
      error: "Erro interno: " + (err instanceof Error ? err.message : String(err)),
    });
  }
});
