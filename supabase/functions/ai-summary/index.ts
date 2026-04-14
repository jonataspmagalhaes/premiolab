// ai-summary — Supabase Edge Function
// Roda via pg_cron diariamente às 18h BRT (21h UTC) em dias úteis
// Gera resumos diários/semanais automáticos via Claude Haiku para usuários opt-in
// Envia push notification via Expo Push API com teaser do resumo
// Melhorias: prompt caching, retry com backoff, dedup, paginação, custo otimizado

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const BRAPI_TOKEN = "tEU8wyBixv8hCi7J3NCjsi";
const BRAPI_BASE = "https://brapi.dev/api";
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const MAX_USERS_PER_RUN = 50;
const BATCH_SIZE = 10; // Process in batches for memory

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

const supabase = createClient(supabaseUrl, supabaseKey);

// ─── System prompt cacheado (fixo para todos os resumos) ─────
const SUMMARY_SYSTEM_PROMPT = `Você é um assistente financeiro pessoal. Responda SEMPRE em português. Seja CONCISO — máximo 500 caracteres por seção. Use R$. Tom amigável e direto, como um consultor que conhece bem o cliente.

FORMATO OBRIGATÓRIO: responda com JSON válido contendo exatamente estas 4 chaves:
{"resumo":"...","acoes_urgentes":"...","dica_do_dia":"...","teaser":"..."}

Regras:
- Use \\n para quebras de linha dentro dos valores
- Não use aspas duplas dentro dos valores (use aspas simples)
- "teaser" deve ter no máximo 100 caracteres — é o insight mais importante em 1 linha
- Não invente dados. Se informação insuficiente, diga
- Priorize o que é acionável
- Se nada urgente em acoes_urgentes, escreva 'Nenhuma ação urgente — carteira sob controle.'`;

// ─── Helpers ────────────────────────────────────────────────

function fmt(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "—";
  return Number(v).toFixed(2);
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "—";
  return Number(v).toFixed(1) + "%";
}

// ─── Retry helper ───────────────────────────────────────────

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 2,
  backoffMs: number = 1500
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, options);
      if (resp.status >= 500 && resp.status !== 529 && attempt < maxRetries) {
        console.warn("HTTP " + resp.status + ", retry " + (attempt + 1));
        await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
        continue;
      }
      return resp;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
      }
    }
  }
  throw lastError || new Error("All retries failed");
}

// ─── Brapi Prices (batch) ───────────────────────────────────

interface BrapiQuote {
  symbol: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  marketCap?: number;
}

async function fetchBrapiPrices(tickers: string[]): Promise<Record<string, BrapiQuote>> {
  const result: Record<string, BrapiQuote> = {};
  if (tickers.length === 0) return result;

  const batchSize = 20;
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    const joined = batch.join(",");
    const url = BRAPI_BASE + "/quote/" + joined + "?token=" + BRAPI_TOKEN;

    try {
      const resp = await fetch(url, { method: "GET" });
      if (!resp.ok) {
        console.warn("Brapi error HTTP " + resp.status + " for batch starting at " + i);
        continue;
      }
      const data = await resp.json();
      const results = data.results || [];
      for (const q of results) {
        if (q.symbol) {
          result[q.symbol.toUpperCase()] = q;
        }
      }
    } catch (err) {
      console.warn("Brapi fetch error:", err);
    }

    if (i + batchSize < tickers.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return result;
}

// ─── Aggregate positions from operacoes ─────────────────────

interface Position {
  ticker: string;
  categoria: string;
  mercado: string;
  quantidade: number;
  custo_total: number;
  pm: number;
  preco_atual?: number;
  variacao?: number;
  pl_pct?: number;
  valor_mercado?: number;
}

async function getPositions(userId: string): Promise<Position[]> {
  const { data: ops, error } = await supabase
    .from("operacoes")
    .select("ticker, tipo, categoria, quantidade, preco, custos, mercado, taxa_cambio")
    .eq("user_id", userId);

  if (error || !ops) return [];

  const map: Record<string, { ticker: string; categoria: string; mercado: string; qty: number; custo: number }> = {};

  for (const op of ops) {
    const ticker = (op.ticker || "").toUpperCase().trim();
    if (!ticker) continue;

    if (!map[ticker]) {
      map[ticker] = {
        ticker,
        categoria: op.categoria || "acao",
        mercado: op.mercado || "BR",
        qty: 0,
        custo: 0,
      };
    }

    const qty = Number(op.quantidade) || 0;
    const preco = Number(op.preco) || 0;
    const custos = Number(op.custos) || 0;

    if (op.tipo === "compra") {
      map[ticker].qty += qty;
      map[ticker].custo += qty * preco + custos;
    } else if (op.tipo === "venda") {
      map[ticker].qty -= qty;
      map[ticker].custo -= qty * preco - custos;
    }
  }

  const positions: Position[] = [];
  for (const key of Object.keys(map)) {
    const m = map[key];
    if (m.qty <= 0) continue;
    positions.push({
      ticker: m.ticker,
      categoria: m.categoria,
      mercado: m.mercado,
      quantidade: m.qty,
      custo_total: m.custo,
      pm: m.custo / m.qty,
    });
  }

  return positions;
}

// ─── Fetch user data ────────────────────────────────────────

interface UserData {
  userId: string;
  positions: Position[];
  opcoes: any[];
  proventos: any[];
  rendaFixa: any[];
  saldos: any[];
  snapshots: any[];
  profile: any;
}

async function fetchUserData(userId: string): Promise<UserData> {
  const positions = await getPositions(userId);

  const [opcoesRes, proventosRes, rfRes, saldosRes, snapshotsRes, profileRes] = await Promise.all([
    supabase
      .from("opcoes")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "ativa"),
    supabase
      .from("proventos")
      .select("ticker, tipo_provento, valor_total, data_pagamento")
      .eq("user_id", userId)
      .gte("data_pagamento", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0]),
    supabase
      .from("renda_fixa")
      .select("tipo, emissor, taxa, indexador, valor_aplicado, vencimento")
      .eq("user_id", userId),
    supabase
      .from("saldos_corretora")
      .select("name, saldo, moeda")
      .eq("user_id", userId),
    supabase
      .from("patrimonio_snapshots")
      .select("data, valor")
      .eq("user_id", userId)
      .order("data", { ascending: false })
      .limit(2),
    supabase
      .from("profiles")
      .select("meta_mensal, selic, ai_summary_frequency")
      .eq("id", userId)
      .single(),
  ]);

  return {
    userId,
    positions,
    opcoes: opcoesRes.data || [],
    proventos: proventosRes.data || [],
    rendaFixa: rfRes.data || [],
    saldos: saldosRes.data || [],
    snapshots: snapshotsRes.data || [],
    profile: profileRes.data || {},
  };
}

// ─── Enrich positions with prices ───────────────────────────

function enrichPositions(positions: Position[], prices: Record<string, BrapiQuote>): void {
  for (const pos of positions) {
    const quote = prices[pos.ticker.toUpperCase()];
    if (quote && quote.regularMarketPrice) {
      pos.preco_atual = quote.regularMarketPrice;
      pos.variacao = quote.regularMarketChangePercent || 0;
      pos.valor_mercado = pos.quantidade * quote.regularMarketPrice;
      if (pos.pm > 0) {
        pos.pl_pct = ((quote.regularMarketPrice - pos.pm) / pos.pm) * 100;
      }
    }
  }
}

// ─── Build prompt (dados variáveis apenas) ──────────────────

function buildSummaryPrompt(data: UserData, tipo: string): string {
  const isWeekly = tipo === "weekly";

  let p = isWeekly
    ? "Gere um resumo SEMANAL da situação financeira deste investidor.\n\n"
    : "Gere um resumo DIÁRIO da situação financeira deste investidor.\n\n";

  // Patrimonio
  let patrimonio = 0;
  for (const pos of data.positions) {
    if (pos.valor_mercado) patrimonio += pos.valor_mercado;
    else patrimonio += pos.custo_total;
  }
  for (const rf of data.rendaFixa) {
    patrimonio += Number(rf.valor_aplicado) || 0;
  }
  for (const s of data.saldos) {
    patrimonio += Number(s.saldo) || 0;
  }
  p += "PATRIMÔNIO TOTAL: R$" + fmt(patrimonio) + "\n";

  // Rentabilidade
  if (data.snapshots.length >= 2) {
    const atual = Number(data.snapshots[0].valor) || 0;
    const anterior = Number(data.snapshots[1].valor) || 0;
    if (anterior > 0) {
      const rent = ((atual - anterior) / anterior) * 100;
      p += "RENTABILIDADE PERÍODO: " + fmtPct(rent) + "\n";
    }
  }

  // Renda mensal
  let rendaMensal = 0;
  for (const prov of data.proventos) {
    rendaMensal += Number(prov.valor_total) || 0;
  }
  p += "RENDA MENSAL (PROVENTOS): R$" + fmt(rendaMensal) + "\n";
  if (data.profile.meta_mensal) {
    const meta = Number(data.profile.meta_mensal);
    const pctMeta = meta > 0 ? (rendaMensal / meta) * 100 : 0;
    p += "META MENSAL: R$" + fmt(meta) + " (" + fmtPct(pctMeta) + " atingida)\n";
  }

  // Allocation
  const alloc: Record<string, number> = {};
  for (const pos of data.positions) {
    const cat = pos.categoria || "acao";
    const val = pos.valor_mercado || pos.custo_total;
    alloc[cat] = (alloc[cat] || 0) + val;
  }
  if (data.rendaFixa.length > 0) {
    let rfTotal = 0;
    for (const rf of data.rendaFixa) rfTotal += Number(rf.valor_aplicado) || 0;
    if (rfTotal > 0) alloc["rf"] = rfTotal;
  }
  if (patrimonio > 0 && Object.keys(alloc).length > 0) {
    p += "ALOCAÇÃO: ";
    const keys = Object.keys(alloc);
    for (let i = 0; i < keys.length; i++) {
      if (i > 0) p += ", ";
      const k = keys[i];
      const label = k === "acao" ? "Ações" : k === "fii" ? "FIIs" : k === "etf" ? "ETFs" : k === "stock_int" ? "Stocks" : k === "rf" ? "RF" : k;
      p += label + " " + fmtPct((alloc[k] / patrimonio) * 100);
    }
    p += "\n";
  }

  // Positions
  p += "POSIÇÕES: " + data.positions.length + " ativos\n";
  if (data.positions.length > 0) {
    const sorted = data.positions.slice().sort((a, b) => (b.valor_mercado || 0) - (a.valor_mercado || 0));
    const max = 10;
    for (let i = 0; i < Math.min(sorted.length, max); i++) {
      const pos = sorted[i];
      p += "  " + pos.ticker + " (" + (pos.categoria || "?") + ") " + pos.quantidade + " un. PM R$" + fmt(pos.pm);
      if (pos.preco_atual) p += " Atual R$" + fmt(pos.preco_atual);
      if (pos.pl_pct != null) p += " P&L " + fmtPct(pos.pl_pct);
      if (pos.variacao != null) p += " Var.dia " + fmtPct(pos.variacao);
      p += "\n";
    }
    if (sorted.length > max) p += "  +" + (sorted.length - max) + " outros\n";
  }

  // Destaques (top movers)
  const withVar = data.positions.filter((pos) => pos.variacao != null && pos.preco_atual != null);
  if (withVar.length > 0) {
    const sortedByVar = withVar.slice().sort((a, b) => Math.abs(b.variacao || 0) - Math.abs(a.variacao || 0));
    p += "\nDESTAQUES DO DIA:\n";
    for (let i = 0; i < Math.min(sortedByVar.length, 5); i++) {
      const d = sortedByVar[i];
      p += "  " + d.ticker + " " + ((d.variacao || 0) >= 0 ? "+" : "") + fmtPct(d.variacao) + "\n";
    }
  }

  // Opções ativas
  if (data.opcoes.length > 0) {
    p += "\nOPÇÕES ATIVAS (" + data.opcoes.length + "):\n";
    const now = new Date();
    for (let i = 0; i < Math.min(data.opcoes.length, 6); i++) {
      const op = data.opcoes[i];
      const venc = op.vencimento ? new Date(op.vencimento) : null;
      const dte = venc ? Math.ceil((venc.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
      p += "  " + (op.ticker_opcao || op.ativo_base || "?") + " ";
      p += (op.direcao === "compra" ? "COMPRA" : "VENDA") + " " + (op.tipo || "CALL");
      p += " Strike R$" + fmt(op.strike) + " Prêmio R$" + fmt(op.premio);
      if (dte != null) p += " DTE " + dte + "d";
      p += "\n";
    }

    // Opções vencendo em 7 dias
    const vencendo = data.opcoes.filter((op) => {
      if (!op.vencimento) return false;
      const venc = new Date(op.vencimento);
      const diff = Math.ceil((venc.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return diff >= 0 && diff <= 7;
    });
    if (vencendo.length > 0) {
      p += "\nOPÇÕES VENCENDO EM 7 DIAS:\n";
      for (const ov of vencendo) {
        const venc = new Date(ov.vencimento);
        const dte = Math.ceil((venc.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        p += "  " + (ov.ticker_opcao || ov.ativo_base) + " " + (ov.tipo || "CALL") + " Strike R$" + fmt(ov.strike) + " DTE " + dte + "d\n";
      }
    }
  }

  // Renda fixa
  if (data.rendaFixa.length > 0) {
    let rfTotal = 0;
    for (const rf of data.rendaFixa) rfTotal += Number(rf.valor_aplicado) || 0;
    p += "\nRENDA FIXA: R$" + fmt(rfTotal) + " (" + data.rendaFixa.length + " títulos)\n";
  }

  // Saldo livre
  let saldoTotal = 0;
  for (const s of data.saldos) saldoTotal += Number(s.saldo) || 0;
  if (saldoTotal > 0) {
    p += "SALDO LIVRE: R$" + fmt(saldoTotal) + "\n";
  }

  // Instruções por tipo
  if (isWeekly) {
    p += "\nPreencha o JSON:\n";
    p += "resumo: Resumo semanal 4-5 frases. Movimentos relevantes, proventos recebidos, opções que venceram. Compare patrimônio início vs fim. Tom motivador.\n";
    p += "acoes_urgentes: 1-3 ações para a próxima semana. Opções vencendo, ativo caindo, meta atrasada.\n";
    p += "dica_do_dia: 1 dica prática semanal: oportunidade, diversificação, hedge. Linguagem simples.\n";
    p += "teaser: 1 linha max 100 chars com o insight mais importante.\n";
  } else {
    p += "\nPreencha o JSON:\n";
    p += "resumo: Resumo de 3-4 frases da situação atual. O que vai bem e o que precisa de atenção. Tom motivador.\n";
    p += "acoes_urgentes: 1-3 ações que precisam de atenção HOJE ou esta semana.\n";
    p += "dica_do_dia: 1 dica prática acionável baseada nos dados. Linguagem simples.\n";
    p += "teaser: 1 linha max 100 chars com o insight mais importante.\n";
  }

  p += "\nSelic ~" + fmtPct(data.profile.selic || 13.25) + ".\n";

  return p;
}

// ─── Parse Claude response — JSON first, regex fallback ─────

interface ParsedSummary {
  resumo: string;
  acoes_urgentes: string;
  dica_do_dia: string;
  teaser: string;
}

function parseResponse(text: string): ParsedSummary {
  const result: ParsedSummary = {
    resumo: "",
    acoes_urgentes: "",
    dica_do_dia: "",
    teaser: "",
  };

  if (!text) return result;

  // Tentar JSON primeiro
  try {
    const jsonMatch = text.match(/\{[\s\S]*"resumo"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.resumo) result.resumo = parsed.resumo;
      if (parsed.acoes_urgentes) result.acoes_urgentes = parsed.acoes_urgentes;
      if (parsed.dica_do_dia) result.dica_do_dia = parsed.dica_do_dia;
      if (parsed.teaser) result.teaser = (parsed.teaser || "").substring(0, 100);

      const filled = [result.resumo, result.acoes_urgentes, result.dica_do_dia].filter(Boolean).length;
      if (filled >= 2) {
        // Fallback teaser
        if (!result.teaser && result.resumo) {
          result.teaser = result.resumo.split(/[.!]\s/)[0].substring(0, 100);
        }
        return result;
      }
    }
  } catch (_e) {
    // JSON parse falhou
  }

  // Fallback: regex com headers
  // Extract teaser first
  const teaserMatch = text.match(/\[TEASER\]\s*([\s\S]*?)\s*\[\/TEASER\]/i);
  if (teaserMatch) {
    result.teaser = teaserMatch[1].trim().substring(0, 100);
  }

  const cleaned = text.replace(/\[TEASER\][\s\S]*?\[\/TEASER\]/i, "");

  const normalized = cleaned
    .replace(/\[RESUMO\]/gi, "[RESUMO]")
    .replace(/\[A[ÇC][ÕO]ES?\s*URGENTES?\]/gi, "[AÇÕES URGENTES]")
    .replace(/\[DICA\s*DO\s*DIA\]/gi, "[DICA DO DIA]");

  const sections = [
    { key: "resumo" as const, header: "[RESUMO]" },
    { key: "acoes_urgentes" as const, header: "[AÇÕES URGENTES]" },
    { key: "dica_do_dia" as const, header: "[DICA DO DIA]" },
  ];

  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    const startIdx = normalized.indexOf(sec.header);
    if (startIdx === -1) continue;
    const contentStart = startIdx + sec.header.length;

    let endIdx = normalized.length;
    for (let j = i + 1; j < sections.length; j++) {
      const nextIdx = normalized.indexOf(sections[j].header, contentStart);
      if (nextIdx !== -1) {
        endIdx = nextIdx;
        break;
      }
    }
    result[sec.key] = normalized.substring(contentStart, endIdx).trim();
  }

  if (!result.resumo && !result.acoes_urgentes && !result.dica_do_dia) {
    result.resumo = cleaned.trim();
  }

  if (!result.teaser && result.resumo) {
    const firstSentence = result.resumo.split(/[.!]\s/)[0];
    result.teaser = (firstSentence || "").substring(0, 100);
  }

  return result;
}

// ─── Expo Push Notifications ────────────────────────────────

interface PushMessage {
  to: string[];
  sound: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  channelId: string;
}

async function sendPushNotifications(messages: PushMessage[]): Promise<void> {
  if (messages.length === 0) return;

  try {
    const resp = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messages),
    });

    if (!resp.ok) {
      console.warn("Expo Push API error: HTTP " + resp.status);
    } else {
      const result = await resp.json();
      console.log("Expo Push sent:", JSON.stringify(result).substring(0, 300));
    }
  } catch (err) {
    console.warn("Expo Push fetch error:", err);
  }
}

// ─── Dedup check — skip if user already has summary today ───

async function hasExistingSummary(userId: string, tipo: string): Promise<boolean> {
  const today = new Date().toISOString().split("T")[0];
  const { data, error } = await supabase
    .from("ai_summaries")
    .select("id")
    .eq("user_id", userId)
    .eq("tipo", tipo)
    .gte("created_at", today + "T00:00:00Z")
    .limit(1);

  if (error) return false;
  return data != null && data.length > 0;
}

// ─── Process single user ────────────────────────────────────

async function processUser(
  userData: UserData,
  prices: Record<string, BrapiQuote>,
  tipo: string
): Promise<{ ok: boolean; error?: string; skipped?: boolean }> {
  const userId = userData.userId;

  // Dedup: skip if already processed today
  const exists = await hasExistingSummary(userId, tipo);
  if (exists) {
    console.log("Skipping user " + userId.substring(0, 8) + " — already has " + tipo + " summary today");
    return { ok: true, skipped: true };
  }

  // Enrich positions with prices
  enrichPositions(userData.positions, prices);

  // Build prompt
  const prompt = buildSummaryPrompt(userData, tipo);

  if (!anthropicKey) {
    return { ok: false, error: "ANTHROPIC_API_KEY not set" };
  }

  let claudeJson: any;
  try {
    const claudeResp = await fetchWithRetry(CLAUDE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        system: [
          {
            type: "text",
            text: SUMMARY_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: prompt }],
      }),
    });

    claudeJson = await claudeResp.json();

    if (claudeResp.status === 529 || claudeResp.status === 429) {
      console.warn("Claude overloaded for user " + userId + ": HTTP " + claudeResp.status);
      return { ok: false, error: "Claude overloaded: " + claudeResp.status };
    }
  } catch (err) {
    console.warn("Claude fetch error for user " + userId + ":", err);
    return { ok: false, error: "Claude fetch error" };
  }

  if (claudeJson.error) {
    console.warn("Claude API error for user " + userId + ":", claudeJson.error.message);
    return { ok: false, error: "Claude API error: " + claudeJson.error.message };
  }

  // Extract text
  let text = "";
  if (claudeJson.content && claudeJson.content.length > 0) {
    for (const block of claudeJson.content) {
      if (block.type === "text" && block.text) {
        text += block.text;
      }
    }
  }

  if (!text) {
    return { ok: false, error: "Empty Claude response" };
  }

  const usage = claudeJson.usage || {};
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  const stopReason = claudeJson.stop_reason || "unknown";
  console.log(
    "ai-summary [" + tipo + "] user=" + userId.substring(0, 8) +
    " stop:" + stopReason +
    " in:" + inputTokens +
    " out:" + outputTokens +
    " cache:" + cacheRead
  );

  // Parse response (JSON first, regex fallback)
  const parsed = parseResponse(text);

  // Cost with cache discount
  const cacheReadCost = cacheRead * 0.0000008 * 0.1;
  const freshInputCost = (inputTokens - cacheRead) * 0.0000008;
  const costEstimate = cacheReadCost + freshInputCost + outputTokens * 0.000004;

  // Insert into ai_summaries
  const { error: insertError } = await supabase.from("ai_summaries").insert({
    user_id: userId,
    tipo: tipo,
    resumo: parsed.resumo,
    acoes_urgentes: parsed.acoes_urgentes,
    dica_do_dia: parsed.dica_do_dia,
    teaser: parsed.teaser,
    tokens_in: inputTokens,
    tokens_out: outputTokens,
    custo_estimado: costEstimate,
    lido: false,
  });

  if (insertError) {
    console.warn("Error inserting ai_summary for user " + userId + ":", insertError);
    return { ok: false, error: "Insert error: " + insertError.message };
  }

  // Log to ai_usage
  try {
    await supabase.from("ai_usage").insert({
      user_id: userId,
      tipo: tipo === "weekly" ? "summary_weekly" : "summary_daily",
      tokens_in: inputTokens,
      tokens_out: outputTokens,
      custo_estimado: costEstimate,
      resultado_id: null,
    });
  } catch (logErr) {
    console.warn("Failed to log ai_usage for user " + userId + ":", logErr);
  }

  // Send push notification
  try {
    const { data: tokenRows } = await supabase
      .from("push_tokens")
      .select("token")
      .eq("user_id", userId)
      .gt("updated_at", new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString());

    const tokens = (tokenRows || []).map((r: { token: string }) => r.token).filter(Boolean);

    if (tokens.length > 0) {
      const title = tipo === "weekly" ? "Resumo Semanal" : "Resumo do Dia";
      const body = parsed.teaser || "Confira o resumo da sua carteira.";

      await sendPushNotifications([
        {
          to: tokens,
          sound: "default",
          title: title,
          body: body,
          data: { type: "ai_summary", summary_type: tipo },
          channelId: "default",
        },
      ]);
    }
  } catch (pushErr) {
    console.warn("Push notification error for user " + userId + ":", pushErr);
  }

  return { ok: true };
}

// ─── Main logic com paginação ───────────────────────────────

async function generateSummaries(mode: string): Promise<{
  ok: boolean;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  errors: string[];
}> {
  const errors: string[] = [];

  // Resumo diário para todos os usuários Premium (sem filtro de frequência)
  // Paginação: busca em lotes até MAX_USERS_PER_RUN
  let totalProcessed = 0;
  let totalSucceeded = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let offset = 0;

  while (totalProcessed < MAX_USERS_PER_RUN) {
    const remaining = MAX_USERS_PER_RUN - totalProcessed;
    const batchLimit = Math.min(remaining, BATCH_SIZE);

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id")
      .range(offset, offset + batchLimit - 1);

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      errors.push(profilesError.message);
      break;
    }

    if (!profiles || profiles.length === 0) {
      if (offset === 0) console.log("No eligible users for mode=" + mode);
      break;
    }

    console.log("Batch " + (offset / BATCH_SIZE + 1) + ": " + profiles.length + " users (offset=" + offset + ")");

    // Collect BR tickers for this batch
    const userDataMap: Record<string, UserData> = {};
    const batchTickers: Set<string> = new Set();

    for (const profile of profiles) {
      try {
        const userData = await fetchUserData(profile.id);
        userDataMap[profile.id] = userData;

        for (const pos of userData.positions) {
          if (pos.mercado === "BR" || !pos.mercado) {
            batchTickers.add(pos.ticker.toUpperCase());
          }
        }
      } catch (err) {
        console.warn("Error fetching data for user " + profile.id + ":", err);
        errors.push("Data fetch error for " + profile.id.substring(0, 8));
        totalFailed++;
      }
    }

    // Fetch prices for this batch
    const tickerArray = Array.from(batchTickers);
    const prices = await fetchBrapiPrices(tickerArray);

    // Process users sequentially
    for (const profile of profiles) {
      const userData = userDataMap[profile.id];
      if (!userData) {
        totalFailed++;
        continue;
      }

      // Skip empty users
      if (userData.positions.length === 0 && userData.opcoes.length === 0 && userData.rendaFixa.length === 0) {
        console.log("Skipping user " + profile.id.substring(0, 8) + " — no data");
        totalSkipped++;
        continue;
      }

      const tipo = "daily";

      const result = await processUser(userData, prices, tipo);
      if (result.skipped) {
        totalSkipped++;
      } else if (result.ok) {
        totalSucceeded++;
      } else {
        totalFailed++;
        if (result.error) errors.push(profile.id.substring(0, 8) + ": " + result.error);
      }

      totalProcessed++;

      // Delay between Claude calls
      await new Promise((r) => setTimeout(r, 500));
    }

    offset += profiles.length;

    // If batch returned fewer than requested, no more pages
    if (profiles.length < batchLimit) break;
  }

  console.log("Done: processed=" + totalProcessed + " succeeded=" + totalSucceeded + " failed=" + totalFailed + " skipped=" + totalSkipped);

  return {
    ok: true,
    processed: totalProcessed,
    succeeded: totalSucceeded,
    failed: totalFailed,
    skipped: totalSkipped,
    errors,
  };
}

// ─── Serve ──────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    let mode = "daily";

    try {
      const body = await req.json();
      if (body && body.mode) {
        mode = body.mode;
      }
    } catch (_e) {
      // No body — default "daily"
    }

    const result = await generateSummaries(mode);

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
