// analyze-option — Supabase Edge Function
// Recebe dados de uma operação de opções, chama Claude API e retorna análise completa
// A chave Anthropic fica como secret ANTHROPIC_API_KEY (nunca exposta ao client)
// Melhorias: prompt caching, system/user split, retry com backoff, modelos atualizados

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODELS = ["claude-haiku-4-5-20251001", "claude-sonnet-4-6-20250514"];

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

function sseEvent(event: string, data: string): string {
  return "event: " + event + "\ndata: " + data + "\n\n";
}

function fmt(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "—";
  return Number(v).toFixed(2);
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "—";
  return Number(v).toFixed(1) + "%";
}

// ═══ SYSTEM PROMPT — regras fixas (cacheadas via prompt caching) ═══
// Tudo que NAO depende dos dados do usuario vai aqui para ser cacheado
const SYSTEM_PROMPT = `Você é um analista CNPI especialista em opções e análise fundamentalista do mercado brasileiro (B3). Responda SEMPRE em português. Seja CONCISO — máximo 600 caracteres por seção. Inclua TODAS as 4 seções solicitadas. Use R$. Sem introdução/conclusão/comentários extras.

FORMATO OBRIGATÓRIO: responda com JSON válido contendo exatamente estas 4 chaves:
{"risco":"...","estrategias":"...","cenarios":"...","educacional":"..."}

Regras de formatação dentro de cada campo:
- Use \\n para quebras de linha
- Não use aspas duplas dentro dos valores (use aspas simples se necessário)
- Mantenha cada seção com máximo 600 caracteres

REGRA DE QUANTIDADE: sempre fale em número de OPÇÕES (ex: 'vender 200 opções'), NUNCA em contratos ou lotes. Cada 100 opções = 1 lote. Em cada perna de cada estratégia, escreva a ação completa: 'VENDER 100 CALL strike R$32.00 a R$1.50'. NUNCA omita COMPRAR/VENDER ou CALL/PUT.

REGRA RISCO-PRIMEIRO: SEMPRE apresente o risco/perda máxima ANTES do ganho potencial. 'Você pode perder até R$X para ganhar até R$Y' — nunca ao contrário.

REGRA DE SAÍDA: TODA estratégia sugerida DEVE incluir critérios de saída: (1) quando realizar lucro, (2) quando cortar perda, (3) quando rolar ou ajustar. O investidor precisa saber ANTES de entrar quando vai sair.

REGRA CSP: Para toda PUT vendida, calcular e informar: (1) capital necessário se exercida (strike x qty em R$), (2) preço efetivo de compra (strike - prêmio), (3) se o investidor tem capital suficiente.

REGRA COVERED CALL: Para toda CALL vendida coberta, informar: (1) se strike está acima do PM (lucro se exercida?), (2) yield mensal do prêmio, (3) custo de oportunidade se ativo subir muito acima do strike.

REGRAS B3: Na B3, opções de ações são AMERICANAS (exercício a qualquer momento, não só no vencimento). Liquidação é FÍSICA (entrega de ações, D+1). Se CALL vendida ITM perto de data-ex de dividendo, exercício antecipado é provável — alertar quando relevante.

REGRA DE IR: Opções NÃO têm isenção de R$20k/mês. Todo ganho líquido em opções é tributado: 15% swing trade, 20% day trade. Prêmios recebidos são receita tributável. Prejuízo só compensa com mesmo regime (swing com swing). Mencionar impacto de IR no resultado líquido quando relevante.

REGRA SOBRE VENDA DE ATIVOS (ABSOLUTA): NUNCA sugira vender o ativo-base diretamente. Sugira manutenção da posição. Somente sugira reduzir se os fundamentos se deterioraram claramente ou o investidor está desconfortável. Apresente como opção, nunca como ordem.

REGRA FUNDAMENTALISTA (CNPI): Quando dados fundamentalistas forem fornecidos, analise-os como analista CNPI — avalie P/L, P/VP, ROE, endividamento, margens e crescimento. NUNCA afirme que um ativo 'perdeu fundamentos' baseado apenas na queda de preço. Fundamentos se deterioram quando indicadores financeiros pioram (ROE caindo, dívida subindo, margens comprimindo), NÃO quando o preço cai. Use os dados fundamentalistas para contextualizar risco e oportunidade nas estratégias de opções.

REGRA DE DISCLAIMER: Esta é uma análise assistida por IA com fins educacionais. Não constitui recomendação de investimento. Todo investimento envolve riscos.`;

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

  // Fundamentals (CNPI analysis)
  if (data.fundamentals) {
    const f = data.fundamentals;
    const fParts: string[] = [];
    if (f.valuation) {
      if (f.valuation.pl != null) fParts.push("P/L " + fmt(f.valuation.pl));
      if (f.valuation.pvp != null) fParts.push("P/VP " + fmt(f.valuation.pvp));
      if (f.valuation.evEbitda != null) fParts.push("EV/EBITDA " + fmt(f.valuation.evEbitda));
      if (f.valuation.dy != null) fParts.push("DY " + fmtPct(f.valuation.dy));
      if (f.valuation.lpa != null) fParts.push("LPA " + fmt(f.valuation.lpa));
    }
    if (f.endividamento) {
      if (f.endividamento.divLiqPl != null) fParts.push("Div.Liq/PL " + fmt(f.endividamento.divLiqPl));
      if (f.endividamento.divLiqEbitda != null) fParts.push("Div.Liq/EBITDA " + fmt(f.endividamento.divLiqEbitda));
    }
    if (f.eficiencia) {
      if (f.eficiencia.margemLiquida != null) fParts.push("M.Liq " + fmtPct(f.eficiencia.margemLiquida));
      if (f.eficiencia.margemEbitda != null) fParts.push("M.EBITDA " + fmtPct(f.eficiencia.margemEbitda));
    }
    if (f.rentabilidade) {
      if (f.rentabilidade.roe != null) fParts.push("ROE " + fmtPct(f.rentabilidade.roe));
      if (f.rentabilidade.roic != null) fParts.push("ROIC " + fmtPct(f.rentabilidade.roic));
    }
    if (f.crescimento) {
      if (f.crescimento.cagrReceitas != null) fParts.push("CAGR Rec 5A " + fmtPct(f.crescimento.cagrReceitas));
      if (f.crescimento.cagrLucros != null) fParts.push("CAGR Lucros 5A " + fmtPct(f.crescimento.cagrLucros));
    }
    if (fParts.length > 0) {
      p += "FUNDAMENTOS (CNPI): " + fParts.join(" | ") + "\n";
      p += "INSTRUCAO: analise os fundamentos como CNPI. Contextualize risco e oportunidade com base nos indicadores. Integre em risco e cenarios.\n";
    }
  }

  // Opcoes ja abertas no mesmo ativo
  if (data.opcoesAbertas && data.opcoesAbertas.length > 0) {
    p += "OPCOES JA ABERTAS neste ativo:\n";
    for (let oai = 0; oai < data.opcoesAbertas.length; oai++) {
      const oa = data.opcoesAbertas[oai];
      p += "  " + (oa.direcao || "venda").toUpperCase() + " " + (oa.tipo || "").toUpperCase() + " strike R$" + fmt(oa.strike) + " premio R$" + fmt(oa.premio) + " qty " + (oa.quantidade || 0) + " venc " + (oa.vencimento || "?") + "\n";
    }
    p += "INSTRUCAO: considere estas posicoes. Evite conflitos. Sugira complementos ou ajustes.\n";
  }

  if (data.opcoesHistPL && data.opcoesHistPL.length > 0) {
    let wins = 0; let losses = 0; let totalPL = 0;
    for (let hi = 0; hi < data.opcoesHistPL.length; hi++) { const h = data.opcoesHistPL[hi]; totalPL += h.pl || 0; if ((h.pl || 0) >= 0) wins++; else losses++; }
    p += "HISTORICO OPCOES: " + wins + " ganhos, " + losses + " perdas, P&L total R$" + fmt(totalPL) + "\n";
  }

  if (data.ivRank != null) {
    p += "IV Rank: " + fmtPct(data.ivRank);
    if (data.ivRank > 70) p += " (ALTA — favorece venda)";
    else if (data.ivRank < 30) p += " (BAIXA — favorece compra)";
    p += "\n";
  }

  if (data.marketContext) {
    const mc = data.marketContext;
    const mcP: string[] = [];
    if (mc.ibov != null) mcP.push("IBOV " + fmt(mc.ibov) + " (" + (mc.ibov_var >= 0 ? "+" : "") + fmtPct(mc.ibov_var) + ")");
    if (mc.usd != null) mcP.push("USD/BRL R$" + fmt(mc.usd) + " (" + (mc.usd_var >= 0 ? "+" : "") + fmtPct(mc.usd_var) + ")");
    if (mcP.length > 0) p += "MERCADO: " + mcP.join(" | ") + "\n";
  }

  if (data.nextDividend) {
    p += "PROXIMO DIVIDENDO: " + data.nextDividend.type + " R$" + fmt(data.nextDividend.rate) + "/acao em " + data.nextDividend.date + "\n";
    p += "ALERTA: risco de exercicio antecipado em CALL vendida ITM proximo a data-ex.\n";
  }

  // Technical analysis context
  if (data.technicalSummary) {
    p += "Análise técnica (" + (data.technicalPeriod || "6 meses") + "): " + data.technicalSummary + "\n";
    p += "INSTRUÇÃO: use suportes/resistências para sugerir strikes ideais. Tendência influencia direção. Integre em risco e cenarios, NÃO crie seção separada.\n";
  }

  // Instructions per objective — seções esperadas no JSON de resposta
  if (obj === "renda") {
    p += "\nPreencha o JSON com:\n";
    p += "risco: Nível (baixo/moderado/alto/muito alto). PRIMEIRO a perda máx em R$, DEPOIS o ganho máx em R$. Delta e prob. de lucro aproximada (1 - |delta| para vendas). ";
    p += "VI vs VH (se informados). VWAP vs Spot (se informado). Liquidez/OI (se informado). ";
    p += "Yield anualizado do prêmio e compare com Selic — se yield < 1.5x Selic, alerte que risco pode não compensar vs renda fixa. 3-4 linhas.\n\n";

    p += "estrategias: 2 estratégias de RENDA com strikes e R$ concretos. Para cada:\n";
    p += "• Nome (ex: Venda Coberta, Trava de Alta com Put)\n";
    p += "• Passo a passo EXPLÍCITO: 'VENDER X CALL strike R$Y a R$Z'\n";
    p += "• Crédito/débito líquido, ganho máx, perda máx em R$\n";
    p += "• Para CSP: capital necessário se exercida (strike x qty)\n";
    p += "• Para covered call: strike vs PM (lucro se exercida? sim/não)\n";
    p += "• Critério de saída: quando lucrar (50% prêmio), cortar perda, rolar (21 DTE)\n";
    p += "2-3 linhas cada.\n\n";

    p += "cenarios: 3 cenários (" + dte + "d): otimista, base, pessimista. Preço, resultado R$, ação (manter/fechar/rolar). 2 linhas cada.\n\n";

    p += "educacional: 3-4 dicas práticas para vendedor de opções. Inclua 1 alerta sobre erro comum. Linguagem simples. 3 linhas.\n\n";

  } else if (obj === "protecao") {
    p += "\nPreencha o JSON com:\n";
    p += "risco: Exposição sem proteção (perda máx em R$ se ativo cair 20%). Custo do hedge vs perda potencial. % do portfolio coberto. Compare custo do hedge com Selic. 3-4 linhas.\n\n";

    p += "estrategias: 2 estratégias de PROTEÇÃO com strikes e R$ concretos. Para cada:\n";
    p += "• Nome (ex: Protective Put, Collar)\n";
    p += "• Passo a passo EXPLÍCITO: 'COMPRAR X PUT strike R$Y a R$Z'\n";
    p += "• Custo do hedge em R$, nível de proteção, perda máx em R$\n";
    p += "• Para Collar: ganho máx limitado — alertar sobre custo de oportunidade\n";
    p += "• Critério de saída: quando renovar o hedge, quando desmontar\n";
    p += "2-3 linhas cada.\n\n";

    p += "cenarios: 3 cenários (" + dte + "d): queda forte (-15%), moderada (-7%), alta (+10%). Resultado R$ COM hedge vs SEM hedge. 2 linhas cada.\n\n";

    p += "educacional: 3-4 dicas práticas sobre hedge. Inclua 1 alerta sobre erro comum. Linguagem simples. 3 linhas.\n\n";

  } else {
    p += "\nPreencha o JSON com:\n";
    p += "risco: Nível. PRIMEIRO perda máx R$, DEPOIS ganho máx R$. Delta, alavancagem, VI vs VH. VWAP vs Spot. Liquidez/OI. Breakeven. 3-4 linhas.\n\n";

    p += "estrategias: 2 estratégias DIRECIONAIS com strikes e R$ concretos. Para cada:\n";
    p += "• Nome (ex: Compra de Call, Trava de Alta com Call)\n";
    p += "• Passo a passo EXPLÍCITO: 'COMPRAR X CALL strike R$Y a R$Z'\n";
    p += "• Débito/crédito, ganho máx, perda máx em R$\n";
    p += "• Breakeven da estratégia\n";
    p += "• Critério de saída: target lucro (50-100%), stop loss (50% prêmio), prazo\n";
    p += "Prefira RISCO DEFINIDO (travas/spreads) sobre naked. 2-3 linhas cada.\n\n";

    p += "cenarios: 3 cenários (" + dte + "d): forte a favor, moderado, contra. Preço, resultado R$, ação (manter/fechar/ajustar). 2 linhas cada.\n\n";

    p += "educacional: 3-4 dicas práticas para especulador. Inclua 1 alerta sobre erro comum. Linguagem simples. 3 linhas.\n\n";
  }

  const hasCapital = data.capital != null && data.capital > 0;
  const hasPortfolio = data.portfolio && data.portfolio.total > 0;
  if (hasCapital || hasPortfolio) {
    p += "SIZING: ";
    if (hasCapital) p += "Capital: R$" + fmt(data.capital) + ". ";
    if (hasPortfolio) p += "Patrimônio: R$" + fmt(data.portfolio.total) + ". ";
    p += "Sugira qtd exata em NÚMERO DE OPÇÕES. Max 2-5% do capital por operação. Mostre a conta em 1 linha por estratégia.\n\n";
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
    p += "\nRegra Absoluta: Ao sugerir estratégias de múltiplas pernas, TODAS as pernas DEVEM usar exclusivamente os strikes listados acima. É proibido inventar strikes fora da lista.\n\n";
  }

  // Cobertura — depende da posição do usuario
  p += "REGRA DE COBERTURA (ABSOLUTA): ";
  if (posQty > 0) {
    p += "O investidor possui " + posQty + " ações. Venda de CALL é PERMITIDA apenas como COBERTA, ou seja, no MÁXIMO " + posQty + " opções de CALL vendidas. NUNCA sugira vender mais CALLs do que ações possui.";
  } else {
    p += "O investidor NÃO possui ações deste ativo. NUNCA sugira VENDER CALL (seria venda descoberta). Estratégias de renda devem usar apenas VENDA DE PUT (cash-secured put) ou COMPRA de opções.";
  }
  p += " JAMAIS sugira venda descoberta/naked de CALL.\n";

  // DTE-based warnings
  if (dte <= 7) {
    p += "ALERTA DTE CURTO: faltam apenas " + dte + " dias. Gamma alto, risco de pin. Abrir posição vendida com DTE < 7 dias é arriscado — theta residual baixo, gamma explosivo.\n";
  } else if (dte >= 30 && dte <= 45) {
    p += "DTE IDEAL PARA VENDA: " + dte + " dias está na zona de maior decaimento de theta (30-45 DTE). Mencionar como ponto positivo se for venda.\n";
  }

  // IV-based warnings
  const ivVal = typeof data.iv === "number" ? data.iv : parseFloat(data.iv) || 0;
  const hvVal = data.hvManual || (data.indicators && data.indicators.hv_20) || 0;
  if (ivVal > 0 && hvVal > 0 && ivVal < hvVal * 0.7) {
    p += "ALERTA VI BAIXA: VI (" + fmtPct(ivVal) + ") está muito abaixo da VH (" + fmtPct(hvVal) + "). Prêmios baratos — venda pode NÃO compensar o risco.\n";
  }

  // Liquidity warnings
  const oi = data.openInterest || 0;
  if (oi > 0 && oi < 200) {
    p += "ALERTA LIQUIDEZ: OI de " + oi + " é BAIXO (< 200). Risco de não conseguir sair sem perda no spread bid-ask.\n";
  }

  p += buildProfileContext(data);

  return p;
}

// ═══ Parse response — tenta JSON primeiro, fallback regex ═══
function parseResponse(text: string): Record<string, string> {
  const result: Record<string, string> = {
    risco: "",
    estrategias: "",
    cenarios: "",
    educacional: "",
  };

  if (!text) return result;

  // Tentar extrair JSON da resposta
  try {
    // Procura JSON no texto (pode ter texto antes/depois)
    const jsonMatch = text.match(/\{[\s\S]*"risco"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.risco) result.risco = parsed.risco;
      if (parsed.estrategias) result.estrategias = parsed.estrategias;
      if (parsed.cenarios) result.cenarios = parsed.cenarios;
      if (parsed.educacional) result.educacional = parsed.educacional;

      // Se pelo menos 2 seções preenchidas, JSON parse foi sucesso
      const filled = [result.risco, result.estrategias, result.cenarios, result.educacional].filter(Boolean).length;
      if (filled >= 2) {
        return result;
      }
    }
  } catch (_e) {
    // JSON parse falhou, usar fallback regex
  }

  // Fallback: regex com headers [SEÇÃO]
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

// ═══ SMART SCAN — prompt e parser ═══
const SMART_SYSTEM_PROMPT = `Voce e um analista CNPI especialista em opcoes e analise fundamentalista do mercado brasileiro (B3). Responda SEMPRE em portugues. Seja CONCISO. Use R$. Sem introducao/conclusao/comentarios extras.

FORMATO OBRIGATORIO: responda com JSON valido contendo exatamente estas 5 chaves:
{"panorama":"...","estrategia_1":"...","estrategia_2":"...","riscos":"...","educacional":"..."}

Regras de formatacao dentro de cada campo:
- Use \\n para quebras de linha
- Nao use aspas duplas dentro dos valores (use aspas simples se necessario)
- Mantenha cada secao com maximo 800 caracteres

REGRA DE QUANTIDADE: sempre fale em numero de OPCOES (ex: 'vender 200 opcoes'), NUNCA em contratos ou lotes. Em cada perna de cada estrategia, escreva a acao completa: 'VENDER 100 CALL PETRH325 strike R$32.50 a R$1.50'. NUNCA omita COMPRAR/VENDER ou CALL/PUT. SEMPRE inclua o ticker da opcao quando disponivel.

REGRA RISCO-PRIMEIRO: SEMPRE apresente o risco/perda maxima ANTES do ganho potencial.

REGRA DE SAIDA: TODA estrategia DEVE incluir criterios de saida: (1) quando realizar lucro, (2) quando cortar perda, (3) quando rolar ou ajustar.

REGRA CSP: Para toda PUT vendida, calcular: (1) capital necessario se exercida (strike x qty em R$), (2) preco efetivo de compra (strike - premio).

REGRA COVERED CALL: Para toda CALL vendida coberta: (1) strike vs PM (lucro se exercida?), (2) yield mensal do premio, (3) custo de oportunidade.

REGRAS B3: Opcoes de acoes sao AMERICANAS (exercicio a qualquer momento). Liquidacao FISICA D+1. Se CALL vendida ITM perto de data-ex, exercicio antecipado e provavel.

REGRA DE IR: Opcoes NAO tem isencao de R$20k/mes. 15% swing, 20% day trade. Premios recebidos sao receita tributavel.

REGRA DE STRIKES: Use APENAS strikes da cadeia fornecida. E PROIBIDO inventar strikes fora da lista.

REGRA SOBRE VENDA DE ATIVOS (ABSOLUTA): NUNCA sugira vender o ativo-base diretamente.

REGRA FUNDAMENTALISTA (CNPI): Quando dados fundamentalistas forem fornecidos, analise-os como analista CNPI — avalie P/L, P/VP, ROE, endividamento, margens e crescimento. NUNCA afirme que ativo 'perdeu fundamentos' baseado apenas na queda de preco. Fundamentos se deterioram quando indicadores financeiros pioram, NAO quando o preco cai.`;

function buildSmartPrompt(data: any): string {
  const obj = data.objetivo || "renda";
  let contexto = "";
  if (obj === "renda") {
    contexto = "OBJETIVO: gerar renda recorrente com premios de opcoes. Maximizar yield mensal com risco controlado.";
  } else if (obj === "protecao") {
    contexto = "OBJETIVO: proteger a carteira contra quedas usando opcoes como hedge. Minimizar perdas em cenarios adversos.";
  } else {
    contexto = "OBJETIVO: ganhos direcionais com opcoes, apostando em movimento do ativo. Maximizar retorno com risco controlado.";
  }

  let p = "Escaneie a cadeia de opcoes e a analise tecnica do ativo. Recomende as 2 melhores estrategias para o objetivo do investidor, usando strikes EXATOS da cadeia fornecida.\n";
  p += "TOM: explique como para investidor iniciante/intermediario. Termos tecnicos com explicacao entre parenteses. Use 'VI' em vez de 'IV'.\n";
  p += contexto + "\n\n";

  // Ticker e spot
  p += "ATIVO: " + (data.ticker || "?") + " | Spot R$" + fmt(data.spot) + " | Selic " + fmtPct(data.selicRate || 13.25) + "\n";

  // Position context
  const posQty = (data.position && data.position.quantidade) ? Number(data.position.quantidade) : 0;
  if (data.position) {
    p += "Posicao: " + posQty + " acoes PM R$" + fmt(data.position.pm) + " Atual R$" + fmt(data.position.preco_atual);
    if (posQty > 0) {
      p += " (cobertura max CALL: " + posQty + " opcoes)";
    } else {
      p += " (SEM acoes — venda de CALL PROIBIDA)";
    }
    p += "\n";
  }

  // Portfolio
  if (data.portfolio && data.portfolio.ativos && data.portfolio.ativos.length > 0) {
    p += "Carteira total: R$" + fmt(data.portfolio.total) + " | ";
    const maxShow = 6;
    for (let pi = 0; pi < Math.min(data.portfolio.ativos.length, maxShow); pi++) {
      if (pi > 0) p += ", ";
      const a = data.portfolio.ativos[pi];
      p += a.ticker + " " + a.qty + "x";
    }
    if (data.portfolio.ativos.length > maxShow) p += " +" + (data.portfolio.ativos.length - maxShow) + " outros";
    p += "\n";
  }

  // Capital
  if (data.capital != null && data.capital > 0) {
    p += "Capital disponivel: R$" + fmt(data.capital) + "\n";
  }

  // Indicators
  if (data.indicators) {
    const ind = data.indicators;
    const parts: string[] = [];
    if (ind.hv_20 != null) parts.push("HV20d " + fmtPct(ind.hv_20));
    if (ind.rsi_14 != null) parts.push("RSI " + fmt(ind.rsi_14));
    if (ind.beta != null) parts.push("Beta " + fmt(ind.beta));
    if (parts.length > 0) p += "Indicadores: " + parts.join(" | ") + "\n";
  }

  // Fundamentals (CNPI analysis)
  if (data.fundamentals) {
    const f = data.fundamentals;
    const fParts: string[] = [];
    if (f.valuation) {
      if (f.valuation.pl != null) fParts.push("P/L " + fmt(f.valuation.pl));
      if (f.valuation.pvp != null) fParts.push("P/VP " + fmt(f.valuation.pvp));
      if (f.valuation.evEbitda != null) fParts.push("EV/EBITDA " + fmt(f.valuation.evEbitda));
      if (f.valuation.dy != null) fParts.push("DY " + fmtPct(f.valuation.dy));
    }
    if (f.endividamento) {
      if (f.endividamento.divLiqPl != null) fParts.push("Div.Liq/PL " + fmt(f.endividamento.divLiqPl));
      if (f.endividamento.divLiqEbitda != null) fParts.push("Div.Liq/EBITDA " + fmt(f.endividamento.divLiqEbitda));
    }
    if (f.eficiencia) {
      if (f.eficiencia.margemLiquida != null) fParts.push("M.Liq " + fmtPct(f.eficiencia.margemLiquida));
    }
    if (f.rentabilidade) {
      if (f.rentabilidade.roe != null) fParts.push("ROE " + fmtPct(f.rentabilidade.roe));
      if (f.rentabilidade.roic != null) fParts.push("ROIC " + fmtPct(f.rentabilidade.roic));
    }
    if (f.crescimento) {
      if (f.crescimento.cagrReceitas != null) fParts.push("CAGR Rec 5A " + fmtPct(f.crescimento.cagrReceitas));
    }
    if (fParts.length > 0) {
      p += "FUNDAMENTOS (CNPI): " + fParts.join(" | ") + "\n";
      p += "INSTRUCAO: analise os fundamentos como CNPI. Contextualize risco e oportunidade. Integre no panorama e riscos.\n";
    }
  }

  // Opcoes ja abertas no mesmo ativo
  if (data.opcoesAbertas && data.opcoesAbertas.length > 0) {
    p += "OPCOES JA ABERTAS neste ativo:\n";
    for (let oai = 0; oai < data.opcoesAbertas.length; oai++) {
      const oa = data.opcoesAbertas[oai];
      p += "  " + (oa.direcao || "venda").toUpperCase() + " " + (oa.tipo || "").toUpperCase() + " " + (oa.ticker_opcao || "") + " strike R$" + fmt(oa.strike) + " premio R$" + fmt(oa.premio) + " qty " + (oa.quantidade || 0) + " venc " + (oa.vencimento || "?") + "\n";
    }
    p += "INSTRUCAO: considere estas posicoes ao sugerir estrategias. Evite conflitos (ex: CALL vendida no mesmo strike). Sugira complementos ou ajustes se fizer sentido.\n";
  }

  // Historico P&L de opcoes neste ativo
  if (data.opcoesHistPL && data.opcoesHistPL.length > 0) {
    p += "HISTORICO OPCOES neste ativo: ";
    let wins = 0; let losses = 0; let totalPL = 0;
    for (let hi = 0; hi < data.opcoesHistPL.length; hi++) {
      const h = data.opcoesHistPL[hi];
      totalPL += h.pl || 0;
      if ((h.pl || 0) >= 0) wins++; else losses++;
    }
    p += wins + " ganhos, " + losses + " perdas, P&L total R$" + fmt(totalPL) + "\n";
    p += "INSTRUCAO: calibre o risco com base no historico. Se muitas perdas, sugira estrategias mais conservadoras.\n";
  }

  // IV Rank
  if (data.ivRank != null) {
    p += "IV Rank (percentil atual vs historico): " + fmtPct(data.ivRank) + "\n";
    if (data.ivRank > 70) {
      p += "INSTRUCAO: IV ALTA — premios inflados, favorece VENDA de opcoes. Alertar sobre risco de reversao da volatilidade.\n";
    } else if (data.ivRank < 30) {
      p += "INSTRUCAO: IV BAIXA — premios baratos, favorece COMPRA de opcoes. Venda de premios pode nao compensar o risco.\n";
    }
  }

  // Contexto de mercado
  if (data.marketContext) {
    const mc = data.marketContext;
    const mcParts: string[] = [];
    if (mc.ibov != null) mcParts.push("IBOV " + fmt(mc.ibov) + " (" + (mc.ibov_var >= 0 ? "+" : "") + fmtPct(mc.ibov_var) + ")");
    if (mc.usd != null) mcParts.push("USD/BRL R$" + fmt(mc.usd) + " (" + (mc.usd_var >= 0 ? "+" : "") + fmtPct(mc.usd_var) + ")");
    if (mcParts.length > 0) {
      p += "MERCADO HOJE: " + mcParts.join(" | ") + "\n";
      p += "INSTRUCAO: contextualize as estrategias com o cenario de mercado atual.\n";
    }
  }

  // Proximo dividendo
  if (data.nextDividend) {
    p += "PROXIMO DIVIDENDO: " + data.nextDividend.type + " R$" + fmt(data.nextDividend.rate) + "/acao em " + data.nextDividend.date + "\n";
    p += "INSTRUCAO CRITICA: dividendo proximo aumenta risco de exercicio antecipado em CALL vendida ITM. Alertar se relevante. Considerar data-ex na escolha de vencimento.\n";
  }

  // Technical analysis
  if (data.technicalSummary) {
    p += "Analise tecnica (" + (data.technicalPeriod || "6 meses") + "): " + data.technicalSummary + "\n";
    p += "INSTRUCAO: use suportes/resistencias para justificar escolha de strikes. Tendencia influencia direcao.\n";
  }

  // Chain strikes — the core data
  const series = data.series || [];
  const chainStrikes = data.chainStrikes || [];
  if (series.length > 0) {
    p += "\nSERIES DISPONIVEIS:\n";
    for (let si = 0; si < series.length; si++) {
      const s = series[si];
      p += "  " + (s.label || s.due_date) + " (DTE " + (s.days_to_maturity || "?") + "d)\n";
    }
  }

  if (chainStrikes.length > 0) {
    p += "\nCADEIA DE OPCOES (strikes mais liquidos):\n";
    p += "Strike | C.Bid C.Ask C.Vol C.Delta C.IV C.Ticker | P.Bid P.Ask P.Vol P.Delta P.IV P.Ticker\n";
    for (let ci = 0; ci < chainStrikes.length; ci++) {
      const cs = chainStrikes[ci];
      const c = cs.call || {};
      const pu = cs.put || {};
      p += fmt(cs.strike) + " | ";
      p += fmt(c.bid) + " " + fmt(c.ask) + " " + (c.volume || 0) + " " + fmt(c.delta) + " " + fmtPct(c.iv) + " " + (c.symbol || "-") + " | ";
      p += fmt(pu.bid) + " " + fmt(pu.ask) + " " + (pu.volume || 0) + " " + fmt(pu.delta) + " " + fmtPct(pu.iv) + " " + (pu.symbol || "-");
      p += "\n";
    }
  }

  // Cobertura
  p += "\nREGRA DE COBERTURA (ABSOLUTA): ";
  if (posQty > 0) {
    p += "O investidor possui " + posQty + " acoes. Venda de CALL PERMITIDA apenas COBERTA, max " + posQty + " opcoes. JAMAIS venda descoberta.";
  } else {
    p += "NAO possui acoes. NUNCA sugira VENDER CALL. Use apenas VENDA DE PUT (CSP) ou COMPRA de opcoes.";
  }
  p += "\n";

  // Sections instructions
  p += "\nPreencha o JSON com:\n";
  p += "panorama: Visao geral em 3-4 frases. Tendencia do ativo (alta/baixa/lateral). VI vs VH (premios caros ou baratos?). Liquidez da cadeia. Suportes e resistencias relevantes para opcoes.\n\n";

  if (obj === "renda") {
    p += "estrategia_1: MELHOR estrategia de RENDA. Passo a passo EXPLICITO com strikes exatos da cadeia, tickers das opcoes, premios bid/ask, qty. Credito liquido. Ganho max e perda max em R$. Yield mensal. Criterio de saida. 4-6 linhas.\n\n";
    p += "estrategia_2: ALTERNATIVA de renda com perfil de risco diferente. Mesmo formato. 4-6 linhas.\n\n";
  } else if (obj === "protecao") {
    p += "estrategia_1: MELHOR estrategia de PROTECAO. Passo a passo com strikes exatos, tickers, custos. Nivel de protecao. Quando renovar hedge. 4-6 linhas.\n\n";
    p += "estrategia_2: ALTERNATIVA de protecao. Mesmo formato. 4-6 linhas.\n\n";
  } else {
    p += "estrategia_1: MELHOR estrategia DIRECIONAL. Passo a passo com strikes exatos, tickers, premios, breakeven. Prefira risco definido (travas). 4-6 linhas.\n\n";
    p += "estrategia_2: ALTERNATIVA direcional. Mesmo formato. 4-6 linhas.\n\n";
  }

  p += "riscos: Cenarios adversos vinculados a suportes/resistencias. Gamma risk se DTE curto. Risco de exercicio antecipado. Impacto de IR. 3-4 linhas.\n\n";
  p += "educacional: Por que essas estrategias para este objetivo. Conceitos-chave usados. 1 erro comum a evitar. 3-4 linhas.\n\n";

  const hasCapital = data.capital != null && data.capital > 0;
  if (hasCapital) {
    p += "SIZING: Capital R$" + fmt(data.capital) + ". Sugira qty exata em NUMERO DE OPCOES. Max 2-5% do capital por operacao.\n\n";
  }

  p += buildProfileContext(data);

  return p;
}

function parseSmartResponse(text: string): Record<string, string> {
  const result: Record<string, string> = {
    panorama: "",
    estrategia_1: "",
    estrategia_2: "",
    riscos: "",
    educacional: "",
  };

  if (!text) return result;

  // Try JSON parse first
  try {
    const jsonMatch = text.match(/\{[\s\S]*"panorama"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.panorama) result.panorama = parsed.panorama;
      if (parsed.estrategia_1) result.estrategia_1 = parsed.estrategia_1;
      if (parsed.estrategia_2) result.estrategia_2 = parsed.estrategia_2;
      if (parsed.riscos) result.riscos = parsed.riscos;
      if (parsed.educacional) result.educacional = parsed.educacional;

      const filled = [result.panorama, result.estrategia_1, result.estrategia_2, result.riscos, result.educacional].filter(Boolean).length;
      if (filled >= 3) return result;
    }
  } catch (_e) { /* fallback to regex */ }

  // Fallback regex
  const sections = [
    { key: "panorama", header: "[PANORAMA]" },
    { key: "estrategia_1", header: "[ESTRATÉGIA 1]" },
    { key: "estrategia_2", header: "[ESTRATÉGIA 2]" },
    { key: "riscos", header: "[RISCOS]" },
    { key: "educacional", header: "[EDUCACIONAL]" },
  ];

  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    const startIdx = text.indexOf(sec.header);
    if (startIdx === -1) continue;
    const contentStart = startIdx + sec.header.length;
    let endIdx = text.length;
    for (let j = i + 1; j < sections.length; j++) {
      const nextIdx = text.indexOf(sections[j].header, contentStart);
      if (nextIdx !== -1) { endIdx = nextIdx; break; }
    }
    result[sec.key] = text.substring(contentStart, endIdx).trim();
  }

  if (!result.panorama && !result.estrategia_1) {
    result.panorama = text.trim();
  }

  return result;
}

// ═══ Retry helper com backoff ═══
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
      // Retry on 500+ server errors (not 429/529 which are handled by model fallback)
      if (resp.status >= 500 && resp.status !== 529 && attempt < maxRetries) {
        console.warn("Claude API HTTP " + resp.status + ", retry " + (attempt + 1) + "/" + maxRetries);
        await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
        continue;
      }
      return resp;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        console.warn("Claude API fetch error, retry " + (attempt + 1) + "/" + maxRetries + ":", lastError.message);
        await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
      }
    }
  }
  throw lastError || new Error("All retries failed");
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let usedCredit = false;
  let userId = "";

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

    userId = userData.user.id;
    const userEmail = userData.user.email || "";

    // Parse request body
    const body = await req.json();
    const isSmartScan = body && body.mode === "smart_scan";
    if (!isSmartScan && (!body || !body.tipo || !body.spot || !body.strike)) {
      return ok({ error: "Dados incompletos. Preencha spot, strike e tipo." });
    }
    if (isSmartScan && (!body || !body.spot || !body.ticker)) {
      return ok({ error: "Dados incompletos para análise smart." });
    }

    // ═══ AI Usage Limits ═══
    const ADMIN_EMAIL = "jonataspmagalhaes@gmail.com";
    const isAdmin = userEmail === ADMIN_EMAIL;
    const DAILY_LIMIT = 5;
    const MONTHLY_LIMIT = 100;

    if (!isAdmin) {
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

      // Count usage today
      const { data: todayCount } = await supabaseAdmin.rpc("get_ai_usage_today", { p_user_id: userId });
      const usageToday = todayCount || 0;

      if (usageToday >= DAILY_LIMIT) {
        // Daily limit exceeded — try extra credits
        const credits = (profile && profile.ai_credits_extra) || 0;
        if (credits > 0) {
          const { data: decremented } = await supabaseAdmin.rpc("decrement_ai_credit", { p_user_id: userId });
          if (decremented) {
            usedCredit = true;
            console.log("Used extra credit for user:", userId, "remaining:", credits - 1);
          } else {
            return ok({ error: "Limite diário atingido (" + DAILY_LIMIT + " análises). Adquira créditos extras ou tente amanhã." });
          }
        } else {
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
      if (usedCredit) {
        await supabaseAdmin.rpc("increment_ai_credit", { p_user_id: userId }).catch(() => {});
      }
      return ok({ error: "Serviço de IA temporariamente indisponível. Chave API não configurada." });
    }

    // Build prompt
    const prompt = isSmartScan ? buildSmartPrompt(body) : buildPrompt(body);
    const systemPrompt = isSmartScan ? SMART_SYSTEM_PROMPT : SYSTEM_PROMPT;
    const wantStream = body.stream === true;

    // ═══ STREAMING MODE ═══
    if (wantStream) {
      // Use Claude streaming API and forward SSE to client
      let streamModel = "";
      let streamResp: Response | null = null;
      for (const model of CLAUDE_MODELS) {
        try {
          streamResp = await fetch(CLAUDE_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": anthropicKey,
              "anthropic-version": "2023-06-01",
              "anthropic-beta": "prompt-caching-2024-07-31",
            },
            body: JSON.stringify({
              model: model,
              max_tokens: 8192,
              stream: true,
              system: [
                {
                  type: "text",
                  text: systemPrompt,
                  cache_control: { type: "ephemeral" },
                },
              ],
              messages: [
                { role: "user", content: prompt },
              ],
            }),
          });
          if (streamResp.status === 529 || streamResp.status === 429) {
            console.warn("Stream model " + model + " overloaded (" + streamResp.status + "), trying next...");
            continue;
          }
          streamModel = model;
          break;
        } catch (fetchErr) {
          console.warn("Stream model " + model + " failed:", fetchErr);
          if (model === CLAUDE_MODELS[CLAUDE_MODELS.length - 1]) {
            if (usedCredit) {
              await supabaseAdmin.rpc("increment_ai_credit", { p_user_id: userId }).catch(() => {});
            }
            return ok({ error: "IA temporariamente indisponível." });
          }
          continue;
        }
      }

      if (!streamResp || !streamResp.body) {
        if (usedCredit) {
          await supabaseAdmin.rpc("increment_ai_credit", { p_user_id: userId }).catch(() => {});
        }
        return ok({ error: "Falha ao iniciar streaming." });
      }

      // Create a TransformStream to forward SSE events
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      let fullText = "";
      let inputToks = 0;
      let outputToks = 0;
      let cacheReadToks = 0;
      let stopR = "unknown";
      const reader = streamResp.body.getReader();

      const readable = new ReadableStream({
        async start(controller) {
          let buffer = "";
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });

              // Process complete SSE events from buffer
              const lines = buffer.split("\n");
              buffer = lines.pop() || ""; // keep incomplete line

              for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                const raw = line.slice(6).trim();
                if (!raw || raw === "[DONE]") continue;
                try {
                  const evt = JSON.parse(raw);
                  if (evt.type === "content_block_delta" && evt.delta && evt.delta.type === "text_delta") {
                    const chunk = evt.delta.text || "";
                    fullText += chunk;
                    // Forward text chunk to client
                    controller.enqueue(encoder.encode(sseEvent("text", JSON.stringify({ t: chunk }))));
                  } else if (evt.type === "message_delta") {
                    stopR = (evt.delta && evt.delta.stop_reason) || stopR;
                    outputToks = (evt.usage && evt.usage.output_tokens) || outputToks;
                  } else if (evt.type === "message_start" && evt.message && evt.message.usage) {
                    inputToks = evt.message.usage.input_tokens || 0;
                    cacheReadToks = evt.message.usage.cache_read_input_tokens || 0;
                  }
                } catch (_) { /* skip non-JSON lines */ }
              }
            }

            // Stream done — parse, log usage, send final event
            const parsed = isSmartScan ? parseSmartResponse(fullText) : parseResponse(fullText);
            const missingSections: string[] = [];
            if (isSmartScan) {
              if (!parsed.panorama) missingSections.push("panorama");
              if (!parsed.estrategia_1) missingSections.push("estrategia_1");
              if (!parsed.estrategia_2) missingSections.push("estrategia_2");
              if (!parsed.riscos) missingSections.push("riscos");
              if (!parsed.educacional) missingSections.push("educacional");
            } else {
              if (!parsed.risco) missingSections.push("risco");
              if (!parsed.estrategias) missingSections.push("estrategias");
              if (!parsed.cenarios) missingSections.push("cenarios");
              if (!parsed.educacional) missingSections.push("educacional");
            }

            const cacheRCost = cacheReadToks * 0.0000008 * 0.1;
            const freshCost = (inputToks - cacheReadToks) * 0.0000008;
            const outCost = outputToks * 0.000004;
            const cost = cacheRCost + freshCost + outCost;

            try {
              await supabaseAdmin.from("ai_usage").insert({
                user_id: userId,
                tipo: body.aiUsageType || "opcao",
                tokens_in: inputToks,
                tokens_out: outputToks,
                custo_estimado: cost,
                resultado_id: null,
              });
            } catch (_) { /* ignore */ }

            let upProf: any = null;
            let nToday = 0;
            let nMonth = 0;
            try {
              const r1 = await supabaseAdmin.from("profiles").select("ai_credits_extra").eq("id", userId).single();
              upProf = r1.data;
            } catch (_) { /* ignore */ }
            try {
              const r2 = await supabaseAdmin.rpc("get_ai_usage_today", { p_user_id: userId });
              nToday = r2.data || 0;
            } catch (_) { /* ignore */ }
            try {
              const r3 = await supabaseAdmin.rpc("get_ai_usage_month", { p_user_id: userId });
              nMonth = r3.data || 0;
            } catch (_) { /* ignore */ }

            const finalPayload = {
              ...parsed,
              _meta: {
                stop_reason: stopR,
                output_tokens: outputToks,
                input_tokens: inputToks,
                cache_read_tokens: cacheReadToks,
                model: streamModel,
                truncated: stopR === "max_tokens" && missingSections.length > 0,
              },
              _usage: {
                today: nToday || 0,
                month: nMonth || 0,
                credits: (upProf && upProf.ai_credits_extra) || 0,
                daily_limit: DAILY_LIMIT,
                monthly_limit: MONTHLY_LIMIT,
                used_credit: usedCredit,
              },
            };

            controller.enqueue(encoder.encode(sseEvent("done", JSON.stringify(finalPayload))));
            controller.close();
            console.log("Stream complete. stop:" + stopR + " out:" + outputToks + " model:" + streamModel);
          } catch (streamErr: any) {
            const errMsg = streamErr && streamErr.message ? streamErr.message : String(streamErr);
            const errStack = streamErr && streamErr.stack ? streamErr.stack.slice(0, 300) : "";
            console.error("Stream processing error:", errMsg, errStack);
            console.error("fullText length:", fullText.length, "inputToks:", inputToks, "outputToks:", outputToks);
            if (usedCredit) {
              await supabaseAdmin.rpc("increment_ai_credit", { p_user_id: userId }).catch(() => {});
            }
            controller.enqueue(encoder.encode(sseEvent("error", JSON.stringify({ error: "Erro durante streaming: " + errMsg }))));
            controller.close();
          }
        },
      });

      return new Response(readable, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // ═══ NON-STREAMING MODE (original) ═══
    let claudeJson: any = null;
    let usedModel = "";
    for (const model of CLAUDE_MODELS) {
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
            model: model,
            max_tokens: 8192,
            system: [
              {
                type: "text",
                text: systemPrompt,
                cache_control: { type: "ephemeral" },
              },
            ],
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
      } catch (fetchErr) {
        console.warn("Model " + model + " fetch failed after retries:", fetchErr);
        if (model === CLAUDE_MODELS[CLAUDE_MODELS.length - 1]) {
          // Last model also failed
          if (usedCredit) {
            await supabaseAdmin.rpc("increment_ai_credit", { p_user_id: userId }).catch(() => {});
          }
          return ok({ error: "IA temporariamente indisponível. Tente novamente em alguns segundos." });
        }
        continue;
      }
    }

    // Check for API errors
    if (!claudeJson || claudeJson.error) {
      const msg = claudeJson && claudeJson.error ? (claudeJson.error.message || "Erro desconhecido") : "Sem resposta";
      console.error("Claude API error:", msg);
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
      if (usedCredit) {
        await supabaseAdmin.rpc("increment_ai_credit", { p_user_id: userId }).catch(() => {});
        console.log("Refunded credit for user:", userId, "(empty response)");
      }
      return ok({ error: "Resposta vazia da IA. Tente novamente." });
    }

    // Log usage and stop reason for debugging
    const stopReason = claudeJson.stop_reason || "unknown";
    const usage = claudeJson.usage || {};
    const outputTokens = usage.output_tokens || 0;
    const inputTokens = usage.input_tokens || 0;
    const cacheRead = usage.cache_read_input_tokens || 0;
    const cacheCreation = usage.cache_creation_input_tokens || 0;
    console.log(
      "Claude stop:" + stopReason +
      " | in:" + inputTokens +
      " | out:" + outputTokens +
      " | cache_read:" + cacheRead +
      " | cache_create:" + cacheCreation +
      " | model:" + usedModel
    );

    const wasTruncated = stopReason === "max_tokens";

    // If truncated, attempt continuation
    if (wasTruncated) {
      console.warn("Response truncated at " + outputTokens + " tokens. Attempting continuation...");
      try {
        const contResp = await fetchWithRetry(CLAUDE_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "prompt-caching-2024-07-31",
          },
          body: JSON.stringify({
            model: usedModel,
            max_tokens: 4096,
            system: [
              {
                type: "text",
                text: systemPrompt,
                cache_control: { type: "ephemeral" },
              },
            ],
            messages: [
              { role: "user", content: prompt },
              { role: "assistant", content: text },
              { role: "user", content: "Continue exatamente de onde parou. Não repita o que já escreveu. Complete as seções faltantes." },
            ],
          }),
        }, 1);
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

    // Parse into sections (JSON first, then regex fallback)
    const parsed = isSmartScan ? parseSmartResponse(text) : parseResponse(text);

    // Check if any expected section is missing after parse
    const missingSections: string[] = [];
    if (isSmartScan) {
      if (!parsed.panorama) missingSections.push("panorama");
      if (!parsed.estrategia_1) missingSections.push("estrategia_1");
      if (!parsed.estrategia_2) missingSections.push("estrategia_2");
      if (!parsed.riscos) missingSections.push("riscos");
      if (!parsed.educacional) missingSections.push("educacional");
    } else {
      if (!parsed.risco) missingSections.push("risco");
      if (!parsed.estrategias) missingSections.push("estrategias");
      if (!parsed.cenarios) missingSections.push("cenarios");
      if (!parsed.educacional) missingSections.push("educacional");
    }
    if (missingSections.length > 0) {
      console.warn("Missing sections after parse:", missingSections.join(", "));
    }

    // ═══ Log AI usage on success ═══
    // Custo com prompt caching: cache_read tokens custam 90% menos
    const cacheReadCost = cacheRead * 0.0000008 * 0.1; // 90% discount
    const freshInputCost = (inputTokens - cacheRead) * 0.0000008;
    const outputCost = outputTokens * 0.000004;
    const costEstimate = cacheReadCost + freshInputCost + outputCost;
    try {
      await supabaseAdmin.from("ai_usage").insert({
        user_id: userId,
        tipo: body.aiUsageType || "opcao",
        tokens_in: inputTokens,
        tokens_out: outputTokens,
        custo_estimado: costEstimate,
        resultado_id: null,
      });
      console.log("AI usage logged. Cost: $" + costEstimate.toFixed(6) + " (cache saved " + cacheRead + " tokens)");
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
        input_tokens: inputTokens,
        cache_read_tokens: cacheRead,
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
    if (usedCredit && userId) {
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
