// test-health — Supabase Edge Function
// Roda diariamente via pg_cron (6h BRT = 9h UTC)
// Verifica integridade dos dados de todos os usuarios
// Envia push notification para admin se encontrar problemas

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const ADMIN_EMAIL = "jonataspmagalhaes@gmail.com";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface HealthIssue {
  check: string;
  count: number;
  details: string;
}

// ─── Check 1: Opcoes ativas com vencimento passado ───

async function checkExpiredOptions(): Promise<HealthIssue | null> {
  const today = new Date().toISOString().substring(0, 10);
  const { data, error } = await supabase
    .from("opcoes")
    .select("id, user_id, ticker_opcao, vencimento")
    .eq("status", "ativa")
    .lt("vencimento", today)
    .limit(100);

  if (error) {
    console.error("checkExpiredOptions error:", error.message);
    return null;
  }
  if (!data || data.length === 0) return null;

  const userCount: Record<string, number> = {};
  for (const op of data) {
    userCount[op.user_id] = (userCount[op.user_id] || 0) + 1;
  }

  return {
    check: "Opcoes expiradas ativas",
    count: data.length,
    details: Object.keys(userCount).length + " usuarios, ex: " + data[0].ticker_opcao + " venc " + data[0].vencimento,
  };
}

// ─── Check 2: Movimentacoes com cartao_id orfao ───

async function checkOrphanedMovs(): Promise<HealthIssue | null> {
  // Buscar cartao_ids usados em movimentacoes
  const { data: movs, error: movErr } = await supabase
    .from("movimentacoes")
    .select("cartao_id")
    .not("cartao_id", "is", null)
    .limit(5000);

  if (movErr || !movs) return null;

  const cartaoIds: string[] = [];
  for (const m of movs) {
    if (m.cartao_id && cartaoIds.indexOf(m.cartao_id) === -1) {
      cartaoIds.push(m.cartao_id);
    }
  }
  if (cartaoIds.length === 0) return null;

  // Verificar quais existem
  const { data: cartoes, error: cartErr } = await supabase
    .from("cartoes_credito")
    .select("id")
    .in("id", cartaoIds);

  if (cartErr) return null;

  const existingIds = (cartoes || []).map((c: { id: string }) => c.id);
  let orphanCount = 0;
  for (const cid of cartaoIds) {
    if (existingIds.indexOf(cid) === -1) orphanCount++;
  }

  if (orphanCount === 0) return null;
  return {
    check: "Movimentacoes com cartao orfao",
    count: orphanCount,
    details: orphanCount + " cartao_ids referenciando cartoes deletados",
  };
}

// ─── Check 3: Portfolio_id orfao ───

async function checkOrphanedPortfolios(): Promise<HealthIssue | null> {
  // Buscar portfolios existentes
  const { data: portfolios } = await supabase.from("portfolios").select("id").limit(5000);
  const pfIds = (portfolios || []).map((p: { id: string }) => p.id);
  if (pfIds.length === 0) return null;

  // Verificar operacoes com portfolio_id que nao existe
  const tables = ["operacoes", "opcoes", "renda_fixa", "proventos"];
  let totalOrphans = 0;

  for (const table of tables) {
    const { data } = await supabase
      .from(table)
      .select("portfolio_id")
      .not("portfolio_id", "is", null)
      .limit(5000);

    if (!data) continue;
    for (const row of data) {
      if (row.portfolio_id && pfIds.indexOf(row.portfolio_id) === -1) {
        totalOrphans++;
      }
    }
  }

  if (totalOrphans === 0) return null;
  return {
    check: "Portfolio_id orfao",
    count: totalOrphans,
    details: "Registros referenciando portfolios deletados",
  };
}

// ─── Check 4: Posicoes liquidas negativas ───

async function checkNegativePositions(): Promise<HealthIssue | null> {
  const { data, error } = await supabase
    .from("operacoes")
    .select("user_id, ticker, tipo, quantidade")
    .in("tipo", ["compra", "venda"])
    .limit(50000);

  if (error || !data) return null;

  // Agrupar por user_id + ticker
  const groups: Record<string, number> = {};
  for (const op of data) {
    const key = op.user_id + "|" + (op.ticker || "").toUpperCase().trim();
    if (!groups[key]) groups[key] = 0;
    groups[key] += op.tipo === "compra" ? op.quantidade : -op.quantidade;
  }

  let negCount = 0;
  const examples: string[] = [];
  for (const key of Object.keys(groups)) {
    if (groups[key] < -0.001) {
      negCount++;
      if (examples.length < 3) {
        examples.push(key.split("|")[1] + " = " + groups[key].toFixed(2));
      }
    }
  }

  if (negCount === 0) return null;
  return {
    check: "Posicoes liquidas negativas",
    count: negCount,
    details: examples.join(", "),
  };
}

// ─── Check 5: Saldos negativos ───

async function checkNegativeSaldos(): Promise<HealthIssue | null> {
  const { data, error } = await supabase
    .from("saldos_corretora")
    .select("id, user_id, name, saldo")
    .lt("saldo", 0)
    .limit(50);

  if (error || !data || data.length === 0) return null;

  return {
    check: "Saldos negativos",
    count: data.length,
    details: data.slice(0, 3).map((s: { name: string; saldo: number }) => s.name + " = " + s.saldo.toFixed(2)).join(", "),
  };
}

// ─── Check 6: Proventos duplicados ───

async function checkDuplicateProventos(): Promise<HealthIssue | null> {
  const { data, error } = await supabase
    .from("proventos")
    .select("user_id, ticker, data_pagamento, tipo_provento, corretora, portfolio_id")
    .limit(50000);

  if (error || !data) return null;

  const seen: Record<string, number> = {};
  let dupCount = 0;
  for (const p of data) {
    const key = [p.user_id, p.ticker, p.data_pagamento, p.tipo_provento, p.corretora || "", p.portfolio_id || ""].join("|");
    seen[key] = (seen[key] || 0) + 1;
    if (seen[key] === 2) dupCount++; // Conta cada duplicata uma vez
  }

  if (dupCount === 0) return null;
  return {
    check: "Proventos duplicados",
    count: dupCount,
    details: dupCount + " grupos com duplicatas",
  };
}

// ─── Check 7: Dividend sync gaps (tickers com 0 em todas as fontes) ───

async function checkDividendSyncGaps(): Promise<HealthIssue | null> {
  // Janela: apenas runs das ultimas 36h (evita alertar por runs antigos)
  const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("dividend_sync_log")
    .select("ticker, source, dividends_found")
    .gte("ran_at", since)
    .limit(50000);

  if (error) {
    console.error("checkDividendSyncGaps error:", error.message);
    return null;
  }
  if (!data || data.length === 0) return null;

  // Agregar por ticker: um ticker so e gap se TODAS as fontes retornaram 0
  const byTicker: Record<string, { total: number; sources: Record<string, number> }> = {};
  for (const row of data) {
    const t = row.ticker;
    if (!byTicker[t]) byTicker[t] = { total: 0, sources: {} };
    // Guardar o maior valor visto por fonte (ultima run bem sucedida)
    const prev = byTicker[t].sources[row.source] || 0;
    if (row.dividends_found > prev) byTicker[t].sources[row.source] = row.dividends_found;
  }

  const gaps: string[] = [];
  for (const t of Object.keys(byTicker)) {
    const srcs = byTicker[t].sources;
    // Ignora se for so uma fonte com 0 — precisa ser gap REAL
    // (merged + brapi + statusinvest todos 0 = problema de verdade)
    const hasMerged = srcs.merged !== undefined;
    const mergedTotal = srcs.merged || 0;
    if (hasMerged && mergedTotal === 0) {
      gaps.push(t);
    }
  }

  if (gaps.length === 0) return null;
  return {
    check: "Dividend sync gaps",
    count: gaps.length,
    details: gaps.slice(0, 5).join(", ") + (gaps.length > 5 ? " +" + (gaps.length - 5) : ""),
  };
}

// ─── Push Notification ───

async function sendAdminPush(issues: HealthIssue[]): Promise<void> {
  // Buscar push tokens do admin
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", ADMIN_EMAIL)
    .single();

  if (!profiles) {
    console.log("Admin profile not found, skip push");
    return;
  }

  const { data: tokens } = await supabase
    .from("push_tokens")
    .select("token")
    .eq("user_id", profiles.id);

  if (!tokens || tokens.length === 0) {
    console.log("No push tokens for admin");
    return;
  }

  const body = issues.map((i) => i.check + ": " + i.count).join("\n");

  const messages = tokens.map((t: { token: string }) => ({
    to: t.token,
    title: "PremioLab Health Alert",
    body: body,
    sound: "default",
    data: { type: "health_alert" },
  }));

  try {
    await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messages),
    });
    console.log("Push sent to " + tokens.length + " token(s)");
  } catch (e) {
    console.error("Push error:", e);
  }
}

// ─── Main ───

async function checkHealth(): Promise<{ issues: HealthIssue[]; ok: boolean }> {
  console.log("=== Health Check Start ===");
  const start = Date.now();

  const checks = await Promise.all([
    checkExpiredOptions(),
    checkOrphanedMovs(),
    checkOrphanedPortfolios(),
    checkNegativePositions(),
    checkNegativeSaldos(),
    checkDuplicateProventos(),
    checkDividendSyncGaps(),
  ]);

  const issues: HealthIssue[] = [];
  for (const c of checks) {
    if (c) issues.push(c);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log("Checks: 7, Issues: " + issues.length + ", Time: " + elapsed + "s");

  for (const issue of issues) {
    console.log("  [!] " + issue.check + ": " + issue.count + " — " + issue.details);
  }

  if (issues.length > 0) {
    await sendAdminPush(issues);
  }

  console.log("=== Health Check Done ===");
  return { issues, ok: issues.length === 0 };
}

// ─── Handler ───

Deno.serve(async (_req: Request) => {
  try {
    const result = await checkHealth();
    return new Response(
      JSON.stringify(result),
      {
        status: result.ok ? 200 : 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("Health check failed:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
