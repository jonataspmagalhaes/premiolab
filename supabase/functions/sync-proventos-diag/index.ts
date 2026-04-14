// sync-proventos-diag — Diagnostico rapido do pipeline de dividendos
// Invocar com POST { user_id: "..." }
// Retorna em <10s: status DM, tickers do usuario, proventos por fonte, gaps

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { dm, DM_ENABLED } from "../_shared/dadosdemercado.ts";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async function (req) {
  try {
    let body: { user_id?: string; email?: string } = {};
    try { body = await req.json(); } catch (_) { /* body opcional */ }
    let userId = body.user_id;

    const result: Record<string, unknown> = {
      dm_enabled: DM_ENABLED,
      dm_key_length: (Deno.env.get("DM_API_KEY") || "").length,
      massive_key_length: (Deno.env.get("MASSIVE_API_KEY") || "").length,
    };

    // Resolve user_id por email se informado
    if (!userId && body.email) {
      const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const match = (data?.users || []).find((u: any) => (u.email || "").toLowerCase() === body.email!.toLowerCase());
      userId = match?.id;
      result.email_lookup = userId ? "found" : "not_found";
    }

    if (!userId) {
      result.error = "Passe user_id ou email no body";
      return new Response(JSON.stringify(result), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // 1. Operacoes do usuario
    const opsR = await supabase
      .from("operacoes")
      .select("ticker, tipo, quantidade, categoria, mercado, data, corretora, portfolio_id")
      .eq("user_id", userId);
    const ops = opsR.data || [];

    // Operacoes do ticker inspecionado (ou VGIP11 default)
    const tickerInspect = ((body as any).ticker || "VGIP11").toUpperCase();
    const opsVGIP = ops.filter((o: any) => (o.ticker || "").toUpperCase().trim() === tickerInspect);

    // 2. Posicao atual por ticker
    const positions: Record<string, { qty: number; categoria: string | null; mercado: string }> = {};
    for (const op of ops) {
      const t = (op.ticker || "").toUpperCase().trim();
      if (!t) continue;
      if (!positions[t]) positions[t] = { qty: 0, categoria: op.categoria, mercado: op.mercado || "BR" };
      positions[t].qty += (op.tipo === "compra" ? op.quantidade : -op.quantidade) || 0;
    }
    const activeTickers = Object.keys(positions).filter((t) => positions[t].qty > 0);

    // 3. Proventos existentes por fonte
    const provR = await supabase
      .from("proventos")
      .select("ticker, fonte, tipo, corretora, data_pagamento, portfolio_id, valor_por_cota")
      .eq("user_id", userId);
    const proventosByFonte: Record<string, number> = {};
    const proventosByTicker: Record<string, number> = {};
    for (const p of (provR.data || [])) {
      const f = p.fonte || "unknown";
      proventosByFonte[f] = (proventosByFonte[f] || 0) + 1;
      proventosByTicker[p.ticker] = (proventosByTicker[p.ticker] || 0) + 1;
    }

    // 4. Se tem VGIP11, testa DM
    let vgipSample: unknown = null;
    if (positions["VGIP11"] && DM_ENABLED) {
      const divs = await dm.dividendsByFII("VGIP11");
      vgipSample = {
        count: divs.length,
        latest: divs.slice(0, 3),
      };
    }

    // 5. Testa Massive para BITO
    let massiveBitoSample: unknown = null;
    const massiveKey = Deno.env.get("MASSIVE_API_KEY") || "";
    if (massiveKey) {
      try {
        const url = "https://api.massive.com/v3/reference/dividends?ticker=BITO&apiKey=" + massiveKey;
        const resp = await fetch(url, { headers: { Accept: "application/json" } });
        if (resp.ok) {
          const json = await resp.json();
          massiveBitoSample = {
            status: resp.status,
            count: (json.results || []).length,
            latest: (json.results || []).slice(0, 3),
          };
        } else {
          massiveBitoSample = { status: resp.status, error: await resp.text() };
        }
      } catch (e: any) {
        massiveBitoSample = { error: e?.message };
      }
    }
    result.massive_bito_sample = massiveBitoSample;

    // 6. Testa Yahoo Finance direto
    let yahooSample: unknown = null;
    try {
      const url = "https://query1.finance.yahoo.com/v8/finance/chart/BITO?interval=1d&range=1y&events=div";
      const resp = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json",
        },
      });
      const body = await resp.text();
      yahooSample = {
        status: resp.status,
        bodyPrefix: body.substring(0, 500),
      };
    } catch (e: any) {
      yahooSample = { error: e?.message };
    }
    result.yahoo_bito_sample = yahooSample;

    // Proventos VGIP11 + KNSC11 detalhados
    // Aceita ticker customizado no body pra inspecionar
    const inspectTicker = (body as any).ticker || null;
    const tickersToInspect = inspectTicker ? [String(inspectTicker).toUpperCase()] : ["VGIP11", "KNSC11", "ISAE4"];
    const provVGIPR = await supabase
      .from("proventos")
      .select("id, ticker, tipo, data_pagamento, data_com, valor_por_cota, quantidade, fonte, portfolio_id, corretora, por_corretora")
      .eq("user_id", userId)
      .in("ticker", tickersToInspect)
      .order("ticker")
      .order("data_pagamento", { ascending: false });

    // ─── AUDITORIA ABRANGENTE ──────
    const audit: Record<string, unknown> = {};

    // 1. Operacoes sem categoria
    const noCat = ops.filter((o: any) => !o.categoria).length;
    audit.operacoes_sem_categoria = noCat;

    // 2. Variacoes de corretora (potenciais aliases)
    const corrMap: Record<string, number> = {};
    for (const o of ops) {
      const c = (o.corretora || "").trim().toUpperCase();
      if (!c) continue;
      corrMap[c] = (corrMap[c] || 0) + 1;
    }
    audit.corretoras_distintas = Object.keys(corrMap).length;
    audit.corretoras_lista = Object.entries(corrMap).sort(function(a: any, b: any) { return b[1] - a[1]; });

    // 3. Proventos com duplicatas residuais
    const allProv = (provR.data || []);
    const provKey: Record<string, number> = {};
    for (const p of allProv as any[]) {
      const k = [p.ticker, p.data_pagamento, p.portfolio_id || "_"].join("|");
      provKey[k] = (provKey[k] || 0) + 1;
    }
    const dupGroups = Object.entries(provKey).filter(function(e: any) { return e[1] > 1; });
    audit.proventos_grupos_duplicados = dupGroups.length;
    audit.proventos_duplicados_amostra = dupGroups.slice(0, 5);

    // 4. Tipos de proventos existentes
    const tiposMap: Record<string, number> = {};
    for (const p of allProv as any[]) {
      tiposMap[p.tipo || "null"] = (tiposMap[p.tipo || "null"] || 0) + 1;
    }
    audit.proventos_por_tipo = tiposMap;

    // 5. Proventos sem corretora
    const semCorr = allProv.filter((p: any) => !p.corretora).length;
    audit.proventos_sem_corretora = semCorr;

    // 6. Proventos orfaos (portfolio_id que nao existe)
    const pfR = await supabase.from("portfolios").select("id").eq("user_id", userId);
    const pfIds = new Set((pfR.data || []).map((p: any) => p.id));
    const orphanProv = allProv.filter((p: any) => p.portfolio_id && !pfIds.has(p.portfolio_id)).length;
    audit.proventos_orfaos = orphanProv;

    result.audit = audit;
    result.ops_vgip11 = opsVGIP;
    result.proventos_vgip11_rows = provVGIPR.data || [];
    result.positions_count = activeTickers.length;
    result.tickers_br = activeTickers.filter((t) => positions[t].mercado !== "INT");
    result.tickers_int = activeTickers.filter((t) => positions[t].mercado === "INT");
    result.tem_vgip11 = !!positions["VGIP11"];
    result.proventos_total = (provR.data || []).length;
    result.proventos_by_fonte = proventosByFonte;
    result.proventos_vgip11 = proventosByTicker["VGIP11"] || 0;
    result.proventos_knsc11 = proventosByTicker["KNSC11"] || 0;
    result.proventos_bito11 = proventosByTicker["BITO11"] || 0;
    result.dm_vgip11_sample = vgipSample;

    return new Response(JSON.stringify(result, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
