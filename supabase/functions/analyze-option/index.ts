// analyze-option — Supabase Edge Function
// Recebe dados de uma operação de opções, chama Claude API e retorna análise completa
// A chave Anthropic fica como secret ANTHROPIC_API_KEY (nunca exposta ao client)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

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

function fmt(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "—";
  return Number(v).toFixed(2);
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "—";
  return Number(v).toFixed(1) + "%";
}

function buildPrompt(data: any): string {
  const g = data.greeks || {};
  const dte = data.dte || 21;
  const legs = data.legs || [];
  const isMultiLeg = legs.length > 1;

  // Objective context
  const obj = data.objetivo || "renda";
  let contexto = "";
  if (obj === "renda") {
    contexto = "CONTEXTO: o investidor vende opções para gerar renda recorrente com prêmios. Objetivo: coletar prêmio e maximizar yield mensal.";
  } else if (obj === "protecao") {
    contexto = "CONTEXTO: o investidor quer proteger sua carteira contra quedas usando opções como hedge. Objetivo: minimizar perdas em cenários adversos.";
  } else {
    contexto = "CONTEXTO: o investidor busca ganhos direcionais com opções, apostando em movimento do ativo. Objetivo: maximizar retorno com risco controlado.";
  }

  let p = "Analise esta operação de opções (mercado BR, em português).\n";
  p += "TOM: explique como se fosse para um investidor iniciante/intermediário em opções. Use linguagem simples e direta. Quando mencionar termos técnicos (como delta, theta, IV, breakeven, etc.), explique brevemente o que significam entre parênteses.\n";
  p += contexto + "\n\n";

  // Describe operation — multi-leg or single-leg
  if (isMultiLeg) {
    p += "ESTRATÉGIA MULTI-PERNA | Spot R$" + fmt(data.spot) + " | DTE " + dte + "d | Selic " + fmtPct(data.selicRate || 13.25) + "\n";
    for (let i = 0; i < legs.length; i++) {
      const lg = legs[i];
      const lgDir = lg.direcao === "compra" ? "COMPRA" : "VENDA";
      p += "  Perna " + (i + 1) + ": " + lgDir + " " + (lg.tipo || "CALL") + " Strike R$" + fmt(lg.strike) + " Prêmio R$" + fmt(lg.premio) + " Qty " + (lg.qty || 100) + "\n";
    }
    if (data.netPremio != null) {
      p += "Posição líquida: " + (data.netPremio >= 0 ? "Crédito" : "Débito") + " R$" + fmt(Math.abs(data.netPremio)) + "\n";
    }
    p += "Gregas posição: Δ" + fmt(g.delta) + " Γ" + fmt(g.gamma) + " Θ" + fmt(g.theta) + " ν" + fmt(g.vega) + "\n";
  } else {
    const dir = data.direcao === "compra" ? "COMPRA" : "VENDA";
    const qtyVal = data.qty || 100;
    p += dir + " de " + (data.tipo || "CALL") + " | Spot R$" + fmt(data.spot) + " | Strike R$" + fmt(data.strike);
    p += " | Prêmio R$" + fmt(data.premio) + " | IV " + fmtPct(data.iv) + " | DTE " + dte + "d | Qty " + qtyVal + "\n";
    p += "Gregas: Δ" + fmt(g.delta) + " Γ" + fmt(g.gamma) + " Θ" + fmt(g.theta) + " ν" + fmt(g.vega);
    if (data.bsTheoPrice != null) p += " | BS R$" + fmt(data.bsTheoPrice);
    if (data.premioTotal != null) p += " | Total R$" + fmt(data.premioTotal);
    p += " | Selic " + fmtPct(data.selicRate || 13.25) + "\n";
  }

  // Scenarios
  const sc = data.scenarios || [];
  if (sc.length > 0) {
    p += "What-If: ";
    for (let i = 0; i < sc.length; i++) {
      if (i > 0) p += ", ";
      p += sc[i].label + " " + (sc[i].result >= 0 ? "+" : "") + "R$" + fmt(Math.abs(sc[i].result));
    }
    p += "\n";
  }

  // Position context
  if (data.position) {
    p += "Carteira: " + (data.position.ticker || "?") + " " + (data.position.quantidade || 0) + " ações PM R$" + fmt(data.position.pm) + " Atual R$" + fmt(data.position.preco_atual) + "\n";
  }

  // Portfolio context
  if (data.portfolio && data.portfolio.ativos && data.portfolio.ativos.length > 0) {
    p += "Carteira total: R$" + fmt(data.portfolio.total) + " | Ativos: ";
    const maxShow = 8;
    for (let pi = 0; pi < Math.min(data.portfolio.ativos.length, maxShow); pi++) {
      if (pi > 0) p += ", ";
      const a = data.portfolio.ativos[pi];
      p += a.ticker + " " + a.qty + "x R$" + fmt(a.valor);
    }
    if (data.portfolio.ativos.length > maxShow) p += " +" + (data.portfolio.ativos.length - maxShow) + " outros";
    p += "\n";
  }

  // Capital
  if (data.capital != null && data.capital > 0) {
    p += "Capital disponível para opções: R$" + fmt(data.capital) + "\n";
  }

  // Indicators
  if (data.indicators) {
    const ind = data.indicators;
    const parts: string[] = [];
    if (ind.hv_20 != null) parts.push("HV20d " + fmtPct(ind.hv_20));
    if (ind.rsi_14 != null) parts.push("RSI " + fmt(ind.rsi_14));
    if (ind.beta != null) parts.push("Beta " + fmt(ind.beta));
    if (ind.max_drawdown != null) parts.push("MaxDD " + fmtPct(ind.max_drawdown));
    if (parts.length > 0) p += "Indicadores: " + parts.join(" | ") + "\n";
  }

  // Instructions per objective
  p += "\nResponda com EXATAMENTE estas 4 seções (use os cabeçalhos entre colchetes):\n\n";

  if (obj === "renda") {
    p += "[RISCO]\n";
    p += "Nível (baixo/moderado/alto/muito alto). Ganho máx vs perda máx em R$. Delta e prob. de lucro. ";
    p += "IV vs HV. Yield anualizado vs Selic. 3-4 linhas.\n\n";

    p += "[ESTRATÉGIAS]\n";
    p += "2 estratégias de RENDA com strikes e R$ concretos. Para cada: o que é (1 frase), como montar (pernas), crédito líquido, ganho/perda máx. ";
    p += "2-3 linhas cada.\n\n";

    p += "[CENÁRIOS]\n";
    p += "3 cenários (" + dte + "d): otimista, base, pessimista. Preço, resultado R$, ação. 2 linhas cada.\n\n";

    p += "[EDUCACIONAL]\n";
    p += "3-4 dicas práticas para vendedor de opções. Linguagem simples. 3 linhas.\n\n";

  } else if (obj === "protecao") {
    p += "[RISCO]\n";
    p += "Exposição sem proteção. Custo do hedge vs perda potencial. % do portfolio coberto. 3-4 linhas.\n\n";

    p += "[ESTRATÉGIAS]\n";
    p += "2 estratégias de PROTEÇÃO com strikes e R$ concretos. Para cada: o que é, como montar, custo, nível de proteção. ";
    p += "2-3 linhas cada.\n\n";

    p += "[CENÁRIOS]\n";
    p += "3 cenários (" + dte + "d): queda forte, moderada, alta. Resultado R$ com/sem hedge. 2 linhas cada.\n\n";

    p += "[EDUCACIONAL]\n";
    p += "3-4 dicas práticas sobre hedge. Linguagem simples. 3 linhas.\n\n";

  } else {
    p += "[RISCO]\n";
    p += "Nível. Ganho/perda máx em R$. Delta, alavancagem, IV vs HV. Breakeven. 3-4 linhas.\n\n";

    p += "[ESTRATÉGIAS]\n";
    p += "2 estratégias DIRECIONAIS com strikes e R$ concretos. Para cada: o que é, como montar, débito, ganho máx. ";
    p += "2-3 linhas cada.\n\n";

    p += "[CENÁRIOS]\n";
    p += "3 cenários (" + dte + "d): forte a favor, moderado, contra. Preço, resultado R$, ação. 2 linhas cada.\n\n";

    p += "[EDUCACIONAL]\n";
    p += "3-4 dicas práticas para especulador. Linguagem simples. 3 linhas.\n\n";
  }

  const hasCapital = data.capital != null && data.capital > 0;
  const hasPortfolio = data.portfolio && data.portfolio.total > 0;
  if (hasCapital || hasPortfolio) {
    p += "SIZING: ";
    if (hasCapital) p += "Capital: R$" + fmt(data.capital) + ". ";
    if (hasPortfolio) p += "Patrimônio: R$" + fmt(data.portfolio.total) + ". ";
    p += "Sugira qtd exata de opções (max 2-5% do capital por operação). Mostre a conta em 1 linha por estratégia.\n\n";
  }

  if (isMultiLeg) {
    p += "NOTA: multi-perna. Analise posição combinada. Identifique o nome da estratégia.\n\n";
  }

  p += "REGRA CRÍTICA: seja CONCISO. Máximo 800 caracteres por seção. Inclua TODAS 4 seções. Use R$. Sem introdução/conclusão/comentários extras.";

  return p;
}

function parseResponse(text: string): Record<string, string> {
  const result: Record<string, string> = {
    risco: "",
    estrategias: "",
    cenarios: "",
    educacional: "",
  };

  if (!text) return result;

  const normalized = text
    .replace(/\[ESTRAT[ÉE]GIAS?\]/gi, "[ESTRATÉGIAS]")
    .replace(/\[CEN[ÁA]RIOS?\]/gi, "[CENÁRIOS]");

  const sections = [
    { key: "risco", header: "[RISCO]" },
    { key: "estrategias", header: "[ESTRATÉGIAS]" },
    { key: "cenarios", header: "[CENÁRIOS]" },
    { key: "educacional", header: "[EDUCACIONAL]" },
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

  if (
    !result.risco &&
    !result.estrategias &&
    !result.cenarios &&
    !result.educacional
  ) {
    result.risco = text.trim();
  }

  return result;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return ok({ error: "Token de autenticação ausente." });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: authError } =
      await supabase.auth.getUser();
    if (authError || !userData || !userData.user) {
      return ok({ error: "Usuário não autenticado." });
    }

    // Parse request body
    const body = await req.json();
    if (!body || !body.tipo || !body.spot || !body.strike) {
      return ok({ error: "Dados incompletos. Preencha spot, strike e tipo." });
    }

    // Get Anthropic API key from secrets
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return ok({ error: "Serviço de IA temporariamente indisponível. Chave API não configurada." });
    }

    // Build prompt and call Claude
    const prompt = buildPrompt(body);

    const claudeResp = await fetch(CLAUDE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 8192,
        messages: [
          { role: "user", content: prompt },
        ],
      }),
    });

    const claudeJson = await claudeResp.json();

    // Check for API errors
    if (claudeJson.error) {
      const msg = claudeJson.error.message || "Erro desconhecido";
      console.error("Claude API error:", msg);
      return ok({ error: "Erro na IA: " + msg });
    }

    // Extract text from response
    let text = "";
    if (claudeJson.content && claudeJson.content.length > 0) {
      for (const block of claudeJson.content) {
        if (block.type === "text" && block.text) {
          text += block.text;
        }
      }
    }

    if (!text) {
      return ok({ error: "Resposta vazia da IA. Tente novamente." });
    }

    // Log stop reason for debugging
    if (claudeJson.stop_reason) {
      console.log("Claude stop_reason:", claudeJson.stop_reason);
    }

    // Parse into sections
    const parsed = parseResponse(text);

    return ok(parsed);
  } catch (err) {
    console.error("analyze-option error:", err);
    return ok({ error: "Erro interno: " + (err instanceof Error ? err.message : String(err)) });
  }
});
