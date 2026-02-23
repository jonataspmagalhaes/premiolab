// analyze-option — Supabase Edge Function
// Recebe dados de uma operação de opções, chama Claude API e retorna análise completa
// A chave Anthropic fica como secret ANTHROPIC_API_KEY (nunca exposta ao client)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODELS = ["claude-haiku-4-5-20251001", "claude-sonnet-4-5-20250514"];

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
  p += "TOM: explique como se fosse para um investidor iniciante/intermediário em opções. Use linguagem simples e direta. Quando mencionar termos técnicos (como delta, theta, VI, breakeven, etc.), explique brevemente o que significam entre parênteses. Use 'VI' (Volatilidade Implícita) em vez de 'IV'.\n";
  p += contexto + "\n\n";

  // Describe operation — multi-leg or single-leg
  if (isMultiLeg) {
    p += "ESTRATÉGIA MULTI-PERNA | Spot R$" + fmt(data.spot) + " | DTE " + dte + "d | Selic " + fmtPct(data.selicRate || 13.25) + "\n";
    for (let i = 0; i < legs.length; i++) {
      const lg = legs[i];
      const lgDir = lg.direcao === "compra" ? "COMPRA" : "VENDA";
      p += "  Perna " + (i + 1) + ": " + lgDir + " " + (lg.tipo || "CALL") + " Strike R$" + fmt(lg.strike) + " Prêmio R$" + fmt(lg.premio) + " " + (lg.qty || 100) + " opções\n";
    }
    if (data.netPremio != null) {
      p += "Posição líquida: " + (data.netPremio >= 0 ? "Crédito" : "Débito") + " R$" + fmt(Math.abs(data.netPremio)) + "\n";
    }
    p += "Gregas posição: Δ" + fmt(g.delta) + " Γ" + fmt(g.gamma) + " Θ" + fmt(g.theta) + " ν" + fmt(g.vega) + "\n";
  } else {
    const dir = data.direcao === "compra" ? "COMPRA" : "VENDA";
    const qtyVal = data.qty || 100;
    p += dir + " de " + (data.tipo || "CALL") + " | Spot R$" + fmt(data.spot) + " | Strike R$" + fmt(data.strike);
    p += " | Prêmio R$" + fmt(data.premio) + " | VI " + fmtPct(data.iv) + " | DTE " + dte + "d | " + qtyVal + " opções\n";
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
  const posQty = (data.position && data.position.quantidade) ? Number(data.position.quantidade) : 0;
  if (data.position) {
    p += "Carteira: " + (data.position.ticker || "?") + " " + posQty + " ações PM R$" + fmt(data.position.pm) + " Atual R$" + fmt(data.position.preco_atual);
    if (posQty > 0) {
      p += " (cobertura máxima para venda de CALL: " + posQty + " opções)";
    } else {
      p += " (SEM ações — venda de CALL PROIBIDA)";
    }
    p += "\n";
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

  // Indicators (computed)
  if (data.indicators) {
    const ind = data.indicators;
    const parts: string[] = [];
    if (ind.hv_20 != null) parts.push("HV20d " + fmtPct(ind.hv_20));
    if (ind.rsi_14 != null) parts.push("RSI " + fmt(ind.rsi_14));
    if (ind.beta != null) parts.push("Beta " + fmt(ind.beta));
    if (ind.max_drawdown != null) parts.push("MaxDD " + fmtPct(ind.max_drawdown));
    if (parts.length > 0) p += "Indicadores: " + parts.join(" | ") + "\n";
  }

  // Manual indicators (user input)
  const manualParts: string[] = [];
  if (data.hvManual != null) manualParts.push("VH (Vol. Historica): " + fmtPct(data.hvManual));
  if (data.vwap != null) manualParts.push("VWAP: R$" + fmt(data.vwap));
  if (data.openInterest != null) manualParts.push("Contratos em Aberto: " + data.openInterest.toLocaleString("pt-BR"));
  if (manualParts.length > 0) {
    p += "Indicadores manuais do usuario: " + manualParts.join(" | ") + "\n";
    p += "INSTRUCAO: use estes indicadores na analise de risco e estrategias. ";
    if (data.hvManual != null && data.iv != null) {
      const viVal = typeof data.iv === "number" ? data.iv : parseFloat(data.iv) || 0;
      const vhVal = data.hvManual;
      if (viVal > vhVal * 1.3) {
        p += "VI (" + fmtPct(viVal) + ") esta ACIMA da VH (" + fmtPct(vhVal) + ") — premios inflados, bom para venda. ";
      } else if (viVal < vhVal * 0.7) {
        p += "VI (" + fmtPct(viVal) + ") esta ABAIXO da VH (" + fmtPct(vhVal) + ") — premios baratos, bom para compra. ";
      } else {
        p += "VI (" + fmtPct(viVal) + ") esta proxima da VH (" + fmtPct(vhVal) + ") — premios em nivel justo. ";
      }
    }
    if (data.vwap != null && data.spot != null) {
      if (data.spot > data.vwap) {
        p += "Spot acima do VWAP — tendencia compradora intraday. ";
      } else if (data.spot < data.vwap) {
        p += "Spot abaixo do VWAP — tendencia vendedora intraday. ";
      }
    }
    if (data.openInterest != null) {
      if (data.openInterest < 100) {
        p += "Liquidez BAIXA (OI < 100) — alertar sobre risco de spread largo. ";
      } else if (data.openInterest >= 500) {
        p += "Boa liquidez (OI " + data.openInterest.toLocaleString("pt-BR") + "). ";
      }
    }
    p += "\n";
  }

  // Instructions per objective
  p += "\nResponda com EXATAMENTE estas 4 seções (use os cabeçalhos entre colchetes):\n\n";

  if (obj === "renda") {
    p += "[RISCO]\n";
    p += "Nível (baixo/moderado/alto/muito alto). PRIMEIRO a perda máx em R$, DEPOIS o ganho máx em R$. Delta e prob. de lucro aproximada (1 - |delta| para vendas). ";
    p += "VI vs VH (se informados). VWAP vs Spot (se informado). Liquidez/OI (se informado). ";
    p += "Yield anualizado do prêmio e compare com Selic — se yield < 1.5x Selic, alerte que risco pode não compensar vs renda fixa. 3-4 linhas.\n\n";

    p += "[ESTRATÉGIAS]\n";
    p += "2 estratégias de RENDA com strikes e R$ concretos. Para cada estratégia:\n";
    p += "• Nome da estratégia (ex: Venda Coberta, Trava de Alta com Put)\n";
    p += "• Passo a passo EXPLÍCITO: 'VENDER X CALL strike R$Y a R$Z' ou 'COMPRAR X PUT strike R$Y a R$Z'\n";
    p += "• Crédito/débito líquido, ganho máx, perda máx em R$\n";
    p += "• Para CSP: capital necessário se exercida (strike x qty)\n";
    p += "• Para covered call: strike vs PM (lucro se exercida? sim/não)\n";
    p += "• Critério de saída: quando realizar lucro (ex: 50% do prêmio), quando cortar perda (ex: se prêmio dobrar), quando rolar (ex: faltando 21 DTE)\n";
    p += "2-3 linhas cada.\n\n";

    p += "[CENÁRIOS]\n";
    p += "3 cenários (" + dte + "d): otimista, base, pessimista. Preço, resultado R$, ação recomendada (manter/fechar/rolar). 2 linhas cada.\n\n";

    p += "[EDUCACIONAL]\n";
    p += "3-4 dicas práticas para vendedor de opções. Inclua 1 alerta sobre erro comum relevante para esta operação. Linguagem simples. 3 linhas.\n\n";

  } else if (obj === "protecao") {
    p += "[RISCO]\n";
    p += "Exposição sem proteção (perda máx em R$ se ativo cair 20%). Custo do hedge vs perda potencial. % do portfolio coberto. Compare custo do hedge com Selic (quanto custa proteger por ano). 3-4 linhas.\n\n";

    p += "[ESTRATÉGIAS]\n";
    p += "2 estratégias de PROTEÇÃO com strikes e R$ concretos. Para cada estratégia:\n";
    p += "• Nome da estratégia (ex: Protective Put, Collar)\n";
    p += "• Passo a passo EXPLÍCITO: 'COMPRAR X PUT strike R$Y a R$Z' ou 'VENDER X CALL strike R$Y a R$Z'\n";
    p += "• Custo do hedge em R$, nível de proteção (a partir de que preço protege), perda máx em R$\n";
    p += "• Para Collar: ganho máx limitado pelo strike da CALL — alertar sobre custo de oportunidade\n";
    p += "• Critério de saída: quando renovar o hedge, quando desmontar se cenário mudar\n";
    p += "2-3 linhas cada.\n\n";

    p += "[CENÁRIOS]\n";
    p += "3 cenários (" + dte + "d): queda forte (-15%), moderada (-7%), alta (+10%). Resultado R$ COM hedge vs SEM hedge lado a lado. 2 linhas cada.\n\n";

    p += "[EDUCACIONAL]\n";
    p += "3-4 dicas práticas sobre hedge. Inclua 1 alerta sobre erro comum relevante. Linguagem simples. 3 linhas.\n\n";

  } else {
    p += "[RISCO]\n";
    p += "Nível. PRIMEIRO a perda máx em R$ (risco), DEPOIS o ganho máx em R$ (recompensa). Delta, alavancagem, VI vs VH (se informados). VWAP vs Spot (se informado). Liquidez/OI (se informado). Breakeven. 3-4 linhas.\n\n";

    p += "[ESTRATÉGIAS]\n";
    p += "2 estratégias DIRECIONAIS com strikes e R$ concretos. Para cada estratégia:\n";
    p += "• Nome da estratégia (ex: Compra de Call, Trava de Alta com Call)\n";
    p += "• Passo a passo EXPLÍCITO: 'COMPRAR X CALL strike R$Y a R$Z' ou 'VENDER X PUT strike R$Y a R$Z'\n";
    p += "• Débito/crédito, ganho máx, perda máx em R$\n";
    p += "• Breakeven da estratégia\n";
    p += "• Critério de saída: target de lucro (ex: 50-100% do investido), stop loss (ex: 50% do prêmio pago), prazo máximo\n";
    p += "Prefira estratégias de RISCO DEFINIDO (travas/spreads) sobre naked. 2-3 linhas cada.\n\n";

    p += "[CENÁRIOS]\n";
    p += "3 cenários (" + dte + "d): forte a favor, moderado, contra. Preço, resultado R$, ação recomendada (manter/fechar/ajustar). 2 linhas cada.\n\n";

    p += "[EDUCACIONAL]\n";
    p += "3-4 dicas práticas para especulador. Inclua 1 alerta sobre erro comum relevante. Linguagem simples. 3 linhas.\n\n";
  }

  const hasCapital = data.capital != null && data.capital > 0;
  const hasPortfolio = data.portfolio && data.portfolio.total > 0;
  if (hasCapital || hasPortfolio) {
    p += "SIZING: ";
    if (hasCapital) p += "Capital: R$" + fmt(data.capital) + ". ";
    if (hasPortfolio) p += "Patrimônio: R$" + fmt(data.portfolio.total) + ". ";
    p += "Sugira qtd exata em NÚMERO DE OPÇÕES (não contratos/lotes). Cada 100 opções = 1 lote. Ex: 'vender 200 opções' (não '2 lotes'). Max 2-5% do capital por operação. Mostre a conta em 1 linha por estratégia.\n\n";
  }

  if (isMultiLeg) {
    p += "NOTA: multi-perna. Analise posição combinada. Identifique o nome da estratégia.\n\n";
  }

  // Strikes disponíveis da cadeia — IA deve usar apenas estes
  const avStrikes = data.availableStrikes || [];
  if (avStrikes.length > 0) {
    p += "STRIKES DISPONÍVEIS NA CADEIA: ";
    for (let si = 0; si < avStrikes.length; si++) {
      if (si > 0) p += ", ";
      p += "R$" + fmt(avStrikes[si]);
    }
    p += "\n";
    p += "Regra Absoluta: Ao sugerir estratégias de múltiplas pernas (Travas, Condors, etc.), TODAS as pernas DEVEM usar exclusivamente os strikes listados acima. É estritamente proibido inventar strikes que não estejam na lista.\n\n";
  }

  p += "REGRA CRÍTICA: seja CONCISO. Máximo 800 caracteres por seção. Inclua TODAS 4 seções. Use R$. Sem introdução/conclusão/comentários extras.\n";
  p += "REGRA DE QUANTIDADE: sempre fale em número de OPÇÕES (ex: 'vender 200 opções'), NUNCA em contratos ou lotes. Na B3, 100 opções = 1 lote, mas corretoras mostram em opções.\n";
  p += "REGRA DE CLAREZA: em CADA perna de CADA estratégia, SEMPRE escreva a ação completa no formato 'VENDER 100 CALL strike R$32.00 a R$1.50' ou 'COMPRAR 100 PUT strike R$30.00 a R$0.80'. NUNCA omita se é COMPRAR ou VENDER, NUNCA omita se é CALL ou PUT. O investidor precisa saber exatamente o que fazer.\n";
  p += "REGRA DE COBERTURA (ABSOLUTA): ";
  if (posQty > 0) {
    p += "O investidor possui " + posQty + " ações. Venda de CALL é PERMITIDA apenas como COBERTA, ou seja, no MÁXIMO " + posQty + " opções de CALL vendidas (equivalente a " + posQty + " ações de cobertura). NUNCA sugira vender mais CALLs do que ações possui. Se a estratégia exige vender CALL, use no máximo " + posQty + " opções.";
  } else {
    p += "O investidor NÃO possui ações deste ativo. NUNCA sugira VENDER CALL (seria venda descoberta). Estratégias de renda devem usar apenas VENDA DE PUT (cash-secured put) ou COMPRA de opções. Se o objetivo é renda sem ações, sugira venda de PUT (CSP) com capital para cobrir exercício.";
  }
  p += " JAMAIS sugira venda descoberta/naked de CALL em NENHUMA circunstância.\n";

  // DTE-based warnings
  if (dte <= 7) {
    p += "ALERTA DTE CURTO: faltam apenas " + dte + " dias. Gamma alto, risco de pin (preço perto do strike no vencimento). Alertar que abrir posição vendida com DTE < 7 dias é arriscado — theta residual baixo, gamma explosivo.\n";
  } else if (dte >= 30 && dte <= 45) {
    p += "DTE IDEAL PARA VENDA: " + dte + " dias está na zona de maior decaimento de theta (30-45 DTE). Mencionar isso como ponto positivo se for venda.\n";
  }

  // IV-based warnings
  const ivVal = typeof data.iv === "number" ? data.iv : parseFloat(data.iv) || 0;
  const hvVal = data.hvManual || (data.indicators && data.indicators.hv_20) || 0;
  if (ivVal > 0 && hvVal > 0 && ivVal < hvVal * 0.7) {
    p += "ALERTA VI BAIXA: VI (" + fmtPct(ivVal) + ") está muito abaixo da VH (" + fmtPct(hvVal) + "). Prêmios baratos — venda de opções pode NÃO compensar o risco. Prefira compra de opções ou espere VI subir.\n";
  }

  // Liquidity warnings
  const oi = data.openInterest || 0;
  if (oi > 0 && oi < 200) {
    p += "ALERTA LIQUIDEZ: OI de " + oi + " é BAIXO (< 200). Risco real de não conseguir sair da posição sem perda no spread bid-ask. Mencione este risco EXPLICITAMENTE na seção [RISCO].\n";
  }

  // B3 market rules
  p += "REGRAS B3: Na B3, opções de ações são AMERICANAS (exercício a qualquer momento, não só no vencimento). Liquidação é FÍSICA (entrega de ações, D+1). Se CALL vendida ITM perto de data-ex de dividendo, exercício antecipado é provável — alertar quando relevante.\n";
  p += "REGRA DE IR: Opções NÃO têm isenção de R$20k/mês. Todo ganho líquido em opções é tributado: 15% swing trade, 20% day trade. Prêmios recebidos são receita tributável. Prejuízo só compensa com mesmo regime (swing com swing). Mencionar impacto de IR no resultado líquido quando relevante.\n";
  p += "REGRA RISCO-PRIMEIRO: SEMPRE apresente o risco/perda máxima ANTES do ganho potencial. 'Você pode perder até R$X para ganhar até R$Y' — nunca ao contrário.\n";
  p += "REGRA DE SAÍDA: TODA estratégia sugerida DEVE incluir critérios de saída: (1) quando realizar lucro, (2) quando cortar perda, (3) quando rolar ou ajustar. O investidor precisa saber ANTES de entrar quando vai sair.\n";
  p += "REGRA CSP: Para toda PUT vendida, calcular e informar: (1) capital necessário se exercida (strike x qty em R$), (2) preço efetivo de compra (strike - prêmio), (3) se o investidor tem capital suficiente.\n";
  p += "REGRA COVERED CALL: Para toda CALL vendida coberta, informar: (1) se strike está acima do PM (lucro se exercida?), (2) yield mensal do prêmio, (3) custo de oportunidade se ativo subir muito acima do strike.\n";

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

    // Build prompt and call Claude (with model fallback on overload)
    const prompt = buildPrompt(body);

    let claudeJson: any = null;
    for (const model of CLAUDE_MODELS) {
      const claudeResp = await fetch(CLAUDE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: model,
          max_tokens: 8192,
          messages: [
            { role: "user", content: prompt },
          ],
        }),
      });

      claudeJson = await claudeResp.json();

      // If overloaded (529) or rate limited (429), try next model
      if (claudeResp.status === 529 || claudeResp.status === 429) {
        console.warn("Model " + model + " overloaded (" + claudeResp.status + "), trying next...");
        continue;
      }
      // Success or other error — stop trying
      console.log("Using model: " + model);
      break;
    }

    // Check for API errors
    if (claudeJson.error) {
      const msg = claudeJson.error.message || "Erro desconhecido";
      console.error("Claude API error:", msg, JSON.stringify(claudeJson.error));
      if (msg.includes("overloaded") || msg.includes("rate")) {
        return ok({ error: "IA temporariamente sobrecarregada. Tente novamente em 30 segundos." });
      }
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
