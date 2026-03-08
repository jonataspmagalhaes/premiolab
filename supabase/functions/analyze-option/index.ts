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

function buildProfileContext(data: any): string {
  let ctx = "";
  const perfil = data.perfilInvestidor || {};
  const p = perfil.perfil || "";
  const obj = perfil.objetivo || "";
  const hor = perfil.horizonte || "";

  if (p || obj || hor) {
    ctx += "\nPERFIL DO INVESTIDOR:\n";
    if (p === "conservador") ctx += "  Perfil: Conservador — prioriza segurança e preservação de capital.\n";
    else if (p === "moderado") ctx += "  Perfil: Moderado — aceita risco controlado em busca de retorno.\n";
    else if (p === "arrojado") ctx += "  Perfil: Arrojado — aceita volatilidade em busca de retornos altos.\n";

    if (obj === "renda_passiva") ctx += "  Objetivo: Gerar renda passiva recorrente (dividendos, prêmios de opções, juros).\n";
    else if (obj === "crescimento") ctx += "  Objetivo: Crescimento de patrimônio a longo prazo.\n";
    else if (obj === "preservacao") ctx += "  Objetivo: Preservar capital e proteger contra inflação.\n";
    else if (obj === "especulacao") ctx += "  Objetivo: Ganhos direcionais com operações de curto prazo.\n";

    if (hor === "curto") ctx += "  Horizonte: Curto prazo (até 1 ano).\n";
    else if (hor === "medio") ctx += "  Horizonte: Médio prazo (1-5 anos).\n";
    else if (hor === "longo") ctx += "  Horizonte: Longo prazo (5+ anos).\n";

    ctx += "INSTRUÇÃO: adapte suas recomendações ao perfil, objetivo e horizonte acima. ";
    if (p === "conservador") ctx += "Priorize opções de baixo risco. ";
    else if (p === "arrojado") ctx += "Pode sugerir operações com mais risco/retorno. ";
    ctx += "\n";
  }

  return ctx;
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

  // Technical analysis context
  if (data.technicalSummary) {
    p += "Análise técnica (" + (data.technicalPeriod || "6 meses") + "): " + data.technicalSummary + "\n";
    p += "INSTRUÇÃO: use suportes/resistências para sugerir strikes ideais. Tendência influencia direção. Integre em [RISCO] e [CENÁRIOS], NÃO crie seção separada.\n";
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

  p += "REGRA DE QUANTIDADE: sempre fale em número de OPÇÕES (ex: 'vender 200 opções'), NUNCA em contratos ou lotes.\n";
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

  p += buildProfileContext(data);
  p += "REGRA SOBRE VENDA DE ATIVOS (ABSOLUTA): NUNCA sugira vender o ativo-base diretamente. Sugira manutenção da posição. Somente sugira reduzir se os fundamentos se deterioraram claramente ou o investidor está desconfortável. Apresente como opção, nunca como ordem.\n";
  p += "REGRA DE DISCLAIMER: Esta é uma análise assistida por IA com fins educacionais. Não constitui recomendação de investimento. Todo investimento envolve riscos.\n";

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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });
    // Service role client for RPCs that need elevated access
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: authError } =
      await supabase.auth.getUser();
    if (authError || !userData || !userData.user) {
      return ok({ error: "Usuário não autenticado." });
    }

    const userId = userData.user.id;
    const userEmail = userData.user.email || "";

    // Parse request body
    const body = await req.json();
    if (!body || !body.tipo || !body.spot || !body.strike) {
      return ok({ error: "Dados incompletos. Preencha spot, strike e tipo." });
    }

    // ═══ AI Usage Limits ═══
    // Admin bypass
    const ADMIN_EMAIL = "jonataspmagalhaes@gmail.com";
    const isAdmin = userEmail === ADMIN_EMAIL;
    let usedCredit = false;
    const DAILY_LIMIT = 5;
    const MONTHLY_LIMIT = 100;

    if (!isAdmin) {
      // Check subscription tier via profile (VIP or referral reward)
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("ai_credits_extra, referral_reward_tier, referral_reward_end, trial_premium_used, trial_premium_start")
        .eq("id", userId)
        .single();

      // Check VIP override
      const { data: vipData } = await supabaseAdmin
        .from("vip_overrides")
        .select("tier, ativo")
        .eq("email", userEmail)
        .eq("ativo", true)
        .maybeSingle();

      const isPremiumVip = vipData && (vipData.tier === "premium");

      // Check if Premium via referral reward (still active)
      const now = new Date();
      const rewardEnd = profile && profile.referral_reward_end ? new Date(profile.referral_reward_end) : null;
      const isPremiumReferral = profile && profile.referral_reward_tier === "premium" && rewardEnd && rewardEnd > now;

      // Check if Premium via trial (within 7 days)
      const trialStart = profile && profile.trial_premium_start ? new Date(profile.trial_premium_start) : null;
      const trialEnd = trialStart ? new Date(trialStart.getTime() + 7 * 24 * 60 * 60 * 1000) : null;
      const isPremiumTrial = trialEnd && trialEnd > now;

      // RevenueCat check happens client-side; server trusts the request if it arrives
      // The client-side gate (canAccess('AI_ANALYSIS')) already blocks non-Premium users
      // Server enforces usage limits as a second layer

      // Count usage today
      const { data: todayCount } = await supabaseAdmin.rpc("get_ai_usage_today", { p_user_id: userId });
      const usageToday = todayCount || 0;

      if (usageToday >= DAILY_LIMIT) {
        // Daily limit exceeded — try extra credits
        const credits = (profile && profile.ai_credits_extra) || 0;
        if (credits > 0) {
          // Reserve a credit
          const { data: decremented } = await supabaseAdmin.rpc("decrement_ai_credit", { p_user_id: userId });
          if (decremented) {
            usedCredit = true;
            console.log("Used extra credit for user:", userId, "remaining:", credits - 1);
          } else {
            return ok({ error: "Limite diário atingido (" + DAILY_LIMIT + " análises). Adquira créditos extras ou tente amanhã." });
          }
        } else {
          // Check monthly limit
          const { data: monthCount } = await supabaseAdmin.rpc("get_ai_usage_month", { p_user_id: userId });
          const usageMonth = monthCount || 0;
          if (usageMonth >= MONTHLY_LIMIT) {
            return ok({ error: "Limite mensal atingido (" + MONTHLY_LIMIT + " análises). Adquira créditos extras." });
          }
          return ok({ error: "Limite diário atingido (" + DAILY_LIMIT + " análises). Adquira créditos extras ou tente amanhã." });
        }
      }
    }

    // Get Anthropic API key from secrets
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      // Refund credit if reserved
      if (usedCredit) {
        await supabaseAdmin.rpc("increment_ai_credit", { p_user_id: userId }).catch(() => {});
      }
      return ok({ error: "Serviço de IA temporariamente indisponível. Chave API não configurada." });
    }

    // Build prompt and call Claude (with model fallback on overload)
    // Use system message for formatting rules (more token-efficient)
    const systemMsg = "Você é um analista de opções do mercado brasileiro (B3). Responda SEMPRE em português. Seja CONCISO — máximo 600 caracteres por seção. Inclua TODAS as 4 seções solicitadas. Use R$. Sem introdução/conclusão/comentários extras. Fale em número de OPÇÕES (não contratos/lotes). Em cada perna de cada estratégia, escreva a ação completa: 'VENDER 100 CALL strike R$32.00 a R$1.50'. NUNCA omita COMPRAR/VENDER ou CALL/PUT. Apresente risco/perda ANTES do ganho.";
    const prompt = buildPrompt(body);

    let claudeJson: any = null;
    let usedModel = "";
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
          system: systemMsg,
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
      usedModel = model;
      console.log("Using model: " + model);
      break;
    }

    // Check for API errors
    if (claudeJson.error) {
      const msg = claudeJson.error.message || "Erro desconhecido";
      console.error("Claude API error:", msg, JSON.stringify(claudeJson.error));
      // Refund credit on API error
      if (usedCredit) {
        await supabaseAdmin.rpc("increment_ai_credit", { p_user_id: userId }).catch(() => {});
        console.log("Refunded credit for user:", userId, "(API error)");
      }
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
      // Refund credit on empty response
      if (usedCredit) {
        await supabaseAdmin.rpc("increment_ai_credit", { p_user_id: userId }).catch(() => {});
        console.log("Refunded credit for user:", userId, "(empty response)");
      }
      return ok({ error: "Resposta vazia da IA. Tente novamente." });
    }

    // Log usage and stop reason for debugging
    const stopReason = claudeJson.stop_reason || "unknown";
    const outputTokens = claudeJson.usage ? claudeJson.usage.output_tokens : 0;
    const inputTokens = claudeJson.usage ? claudeJson.usage.input_tokens : 0;
    console.log("Claude stop_reason:", stopReason, "| input_tokens:", inputTokens, "| output_tokens:", outputTokens, "| model:", usedModel);

    const wasTruncated = stopReason === "max_tokens";

    // If truncated, attempt continuation
    if (wasTruncated) {
      console.warn("Response truncated at " + outputTokens + " tokens. Attempting continuation...");
      try {
        const contResp = await fetch(CLAUDE_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: usedModel,
            max_tokens: 4096,
            system: systemMsg,
            messages: [
              { role: "user", content: prompt },
              { role: "assistant", content: text },
              { role: "user", content: "Continue exatamente de onde parou. Não repita o que já escreveu. Complete as seções faltantes." },
            ],
          }),
        });
        const contJson = await contResp.json();
        if (!contJson.error && contJson.content) {
          let contText = "";
          for (const block of contJson.content) {
            if (block.type === "text" && block.text) {
              contText += block.text;
            }
          }
          if (contText.length > 20) {
            text += "\n" + contText;
            console.log("Continuation added:", contText.length, "chars. New stop_reason:", contJson.stop_reason || "unknown");
          }
        }
      } catch (contErr) {
        console.warn("Continuation failed:", contErr);
      }
    }

    // Parse into sections
    const parsed = parseResponse(text);

    // Check if any expected section is missing after parse
    const missingSections: string[] = [];
    if (!parsed.risco) missingSections.push("risco");
    if (!parsed.estrategias) missingSections.push("estrategias");
    if (!parsed.cenarios) missingSections.push("cenarios");
    if (!parsed.educacional) missingSections.push("educacional");
    if (missingSections.length > 0) {
      console.warn("Missing sections after parse:", missingSections.join(", "));
    }

    // ═══ Log AI usage on success ═══
    const costEstimate = (inputTokens * 0.0000008 + outputTokens * 0.000004); // Haiku pricing approx
    try {
      await supabaseAdmin.from("ai_usage").insert({
        user_id: userId,
        tipo: body.aiUsageType || "opcao",
        tokens_in: inputTokens,
        tokens_out: outputTokens,
        custo_estimado: costEstimate,
        resultado_id: null,
      });
      console.log("AI usage logged for user:", userId, "cost:", costEstimate.toFixed(6));
    } catch (logErr) {
      console.warn("Failed to log AI usage:", logErr);
    }

    // Return with metadata
    const { data: updatedProfile } = await supabaseAdmin
      .from("profiles")
      .select("ai_credits_extra")
      .eq("id", userId)
      .single()
      .catch(() => ({ data: null }));

    const { data: newTodayCount } = await supabaseAdmin.rpc("get_ai_usage_today", { p_user_id: userId }).catch(() => ({ data: 0 }));
    const { data: newMonthCount } = await supabaseAdmin.rpc("get_ai_usage_month", { p_user_id: userId }).catch(() => ({ data: 0 }));

    return ok({
      ...parsed,
      _meta: {
        stop_reason: stopReason,
        output_tokens: outputTokens,
        model: usedModel,
        truncated: wasTruncated && missingSections.length > 0,
      },
      _usage: {
        today: newTodayCount || 0,
        month: newMonthCount || 0,
        credits: (updatedProfile && updatedProfile.ai_credits_extra) || 0,
        daily_limit: DAILY_LIMIT,
        monthly_limit: MONTHLY_LIMIT,
        used_credit: usedCredit,
      },
    });
  } catch (err) {
    console.error("analyze-option error:", err);
    // Refund credit on unexpected error
    if (typeof usedCredit !== "undefined" && usedCredit && typeof userId !== "undefined") {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const adminClient = createClient(supabaseUrl, serviceRoleKey);
        await adminClient.rpc("increment_ai_credit", { p_user_id: userId });
        console.log("Refunded credit for user:", userId, "(catch block)");
      } catch (refundErr) {
        console.warn("Refund failed in catch:", refundErr);
      }
    }
    return ok({ error: "Erro interno: " + (err instanceof Error ? err.message : String(err)) });
  }
});
