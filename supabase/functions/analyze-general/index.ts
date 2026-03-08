// analyze-general — Supabase Edge Function
// Handles multiple AI analysis types: carteira, ativo, resumo, estrategia, renda
// Reuses same auth/usage-limit pattern as analyze-option

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

// ═══════════ INVESTOR PROFILE + RULES ═══════════

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

const NO_SELL_RULE = "REGRA SOBRE VENDA DE ATIVOS (ABSOLUTA): NUNCA sugira vender um ativo diretamente. Em vez disso, sugira manutenção da posição. Somente sugira reduzir ou vender se: (1) o investidor expressou desconforto com a posição, (2) os fundamentos se deterioraram claramente (dados comprovam), ou (3) o ativo perdeu a tese de investimento. Mesmo nesses casos, apresente como uma OPÇÃO para o investidor considerar, nunca como ordem. Use frases como 'caso se sinta desconfortável com a posição, pode considerar reduzir' em vez de 'venda imediatamente'.\n";

const DISCLAIMER_RULE = "REGRA DE DISCLAIMER: Ao final de cada análise, lembre que esta é uma análise assistida por IA com fins educacionais. Não constitui recomendação de investimento. Todo investimento envolve riscos e o investidor deve tomar suas próprias decisões.\n";

// ═══════════ PROMPT BUILDERS ═══════════

function buildCarteiraPrompt(data: any): { system: string; prompt: string; sections: string[] } {
  const system = "Você é um consultor financeiro pessoal especializado no mercado brasileiro. Responda SEMPRE em português. Seja CONCISO — máximo 600 caracteres por seção. Use R$. Sem introdução/conclusão/comentários extras. Fale como para um investidor iniciante/intermediário, explicando termos técnicos entre parênteses.";

  let p = "Analise esta carteira de investimentos (mercado BR, em português).\n\n";

  // Patrimonio
  if (data.patrimonio != null) {
    p += "PATRIMÔNIO TOTAL: R$" + fmt(data.patrimonio) + "\n";
  }

  // Allocation breakdown
  if (data.alocacao) {
    p += "ALOCAÇÃO: ";
    const keys = Object.keys(data.alocacao);
    for (let i = 0; i < keys.length; i++) {
      if (i > 0) p += ", ";
      const k = keys[i];
      const label = k === "acao" ? "Ações" : k === "fii" ? "FIIs" : k === "etf" ? "ETFs" : k === "stock_int" ? "Stocks INT" : k === "rf" ? "Renda Fixa" : k === "opcao" ? "Opções" : k === "saldo" ? "Caixa" : k;
      p += label + " " + fmtPct(data.alocacao[k]);
    }
    p += "\n";
  }

  // Positions
  if (data.posicoes && data.posicoes.length > 0) {
    p += "\nPOSIÇÕES (" + data.posicoes.length + " ativos):\n";
    const max = 15;
    for (let i = 0; i < Math.min(data.posicoes.length, max); i++) {
      const pos = data.posicoes[i];
      p += "  " + pos.ticker + " (" + (pos.categoria || "?") + ") " + (pos.quantidade || 0) + " un. PM R$" + fmt(pos.pm);
      if (pos.preco_atual) p += " Atual R$" + fmt(pos.preco_atual);
      if (pos.pl_pct != null) p += " P&L " + fmtPct(pos.pl_pct);
      if (pos.variacao != null) p += " Var.dia " + fmtPct(pos.variacao);
      p += "\n";
    }
    if (data.posicoes.length > max) p += "  +" + (data.posicoes.length - max) + " outros ativos\n";
  }

  // Renda mensal
  if (data.rendaMensal != null) {
    p += "\nRENDA MENSAL: R$" + fmt(data.rendaMensal);
    if (data.metaMensal) p += " (meta: R$" + fmt(data.metaMensal) + ", " + fmtPct(data.rendaMensal / data.metaMensal * 100) + " da meta)";
    p += "\n";
  }

  // Options summary
  if (data.opcoesResumo) {
    const opr = data.opcoesResumo;
    p += "\nOPÇÕES: " + (opr.ativas || 0) + " ativas, Prêmios mês R$" + fmt(opr.premiosMes) + ", P&L R$" + fmt(opr.plTotal) + "\n";
  }

  // RF summary
  if (data.rfTotal != null && data.rfTotal > 0) {
    p += "RENDA FIXA: R$" + fmt(data.rfTotal) + "\n";
  }

  // Saldos
  if (data.saldoLivre != null && data.saldoLivre > 0) {
    p += "SALDO LIVRE: R$" + fmt(data.saldoLivre) + "\n";
  }

  // Performance
  if (data.rentabilidade != null) {
    p += "RENTABILIDADE MÊS: " + fmtPct(data.rentabilidade) + "\n";
  }

  // Indicators summary
  if (data.indicadores && data.indicadores.length > 0) {
    p += "\nINDICADORES (destaques):\n";
    for (let i = 0; i < Math.min(data.indicadores.length, 8); i++) {
      const ind = data.indicadores[i];
      p += "  " + ind.ticker + ": ";
      const parts: string[] = [];
      if (ind.rsi != null) parts.push("RSI " + fmt(ind.rsi));
      if (ind.hv != null) parts.push("HV " + fmtPct(ind.hv));
      if (ind.beta != null) parts.push("Beta " + fmt(ind.beta));
      if (parts.length > 0) p += parts.join(" | ");
      p += "\n";
    }
  }

  p += "\nResponda com EXATAMENTE estas 4 seções (use os cabeçalhos entre colchetes):\n\n";

  p += "[DIAGNÓSTICO]\n";
  p += "Visão geral da carteira: diversificação, concentração, risco. Pontos fortes e fracos. Se alocação muito concentrada em 1 classe (>60%), alertar. Comparar rentabilidade com CDI. 4-5 linhas.\n\n";

  p += "[OPORTUNIDADES]\n";
  p += "2-3 ações concretas para melhorar a carteira. Ex: rebalancear classe X, aumentar exposição a Y, reduzir concentração em Z, considerar hedge. Para cada ação, explicar o porquê e o impacto esperado. 3-4 linhas cada.\n\n";

  p += "[RISCOS]\n";
  p += "2-3 riscos principais da carteira atual. Ex: concentração setorial, exposição cambial, falta de hedge, prazo de RF curto. Para cada risco, sugerir mitigação. 2-3 linhas cada.\n\n";

  p += "[PRÓXIMOS PASSOS]\n";
  p += "3 ações prioritárias para o próximo mês, ordenadas por importância. Ser específico (ticker, valor, prazo). 2 linhas cada.\n\n";

  p += buildProfileContext(data);
  p += NO_SELL_RULE;
  p += DISCLAIMER_RULE;
  p += "REGRAS: Considere o perfil de investidor brasileiro. Selic atual ~13.25%. CDI ~13%. Não sugira produtos que não existem na B3. Não sugira criptomoedas a menos que já tenha na carteira. Priorize simplicidade.\n";

  return { system, prompt: p, sections: ["diagnostico", "oportunidades", "riscos", "proximos_passos"] };
}

function buildAtivoPrompt(data: any): { system: string; prompt: string; sections: string[] } {
  const system = "Você é um analista de ações do mercado brasileiro. Responda SEMPRE em português. Seja CONCISO — máximo 600 caracteres por seção. Use R$. Sem introdução/conclusão/comentários extras. Fale como para um investidor iniciante/intermediário.";

  let p = "Analise este ativo da carteira (mercado BR, em português).\n\n";

  p += "ATIVO: " + (data.ticker || "?") + " (" + (data.categoria || "ação") + ")\n";

  if (data.quantidade != null) p += "Posição: " + data.quantidade + " un. PM R$" + fmt(data.pm) + "\n";
  if (data.preco_atual != null) p += "Preço atual: R$" + fmt(data.preco_atual) + "\n";
  if (data.pl_pct != null) p += "P&L: " + fmtPct(data.pl_pct) + " (R$" + fmt(data.pl_valor) + ")\n";
  if (data.variacao != null) p += "Variação dia: " + fmtPct(data.variacao) + "\n";
  if (data.valor_mercado != null) p += "Valor de mercado: R$" + fmt(data.valor_mercado) + "\n";

  // Indicators
  if (data.indicadores) {
    const ind = data.indicadores;
    const parts: string[] = [];
    if (ind.hv != null) parts.push("HV 20d: " + fmtPct(ind.hv));
    if (ind.rsi != null) parts.push("RSI 14: " + fmt(ind.rsi));
    if (ind.beta != null) parts.push("Beta: " + fmt(ind.beta));
    if (ind.sma_20 != null) parts.push("SMA20: R$" + fmt(ind.sma_20));
    if (ind.sma_50 != null) parts.push("SMA50: R$" + fmt(ind.sma_50));
    if (ind.max_drawdown != null) parts.push("MaxDD: " + fmtPct(ind.max_drawdown));
    if (parts.length > 0) p += "Indicadores: " + parts.join(" | ") + "\n";
  }

  // Fundamentals
  if (data.fundamentais) {
    const f = data.fundamentais;
    const parts: string[] = [];
    if (f.pl != null) parts.push("P/L: " + fmt(f.pl));
    if (f.pvp != null) parts.push("P/VP: " + fmt(f.pvp));
    if (f.dy != null) parts.push("D.Y.: " + fmtPct(f.dy));
    if (f.roe != null) parts.push("ROE: " + fmtPct(f.roe));
    if (f.divLiqEbitda != null) parts.push("Dív.Líq/EBITDA: " + fmt(f.divLiqEbitda));
    if (f.margemLiquida != null) parts.push("M.Líquida: " + fmtPct(f.margemLiquida));
    if (parts.length > 0) p += "Fundamentos: " + parts.join(" | ") + "\n";
  }

  // Options on this asset
  if (data.opcoes && data.opcoes.length > 0) {
    p += "Opções ativas: " + data.opcoes.length + " (";
    for (let i = 0; i < Math.min(data.opcoes.length, 4); i++) {
      if (i > 0) p += ", ";
      const op = data.opcoes[i];
      p += (op.direcao === "compra" ? "C" : "V") + " " + (op.tipo || "CALL") + " R$" + fmt(op.strike);
    }
    p += ")\n";
  }

  // Dividends
  if (data.proventos) {
    p += "Proventos 12m: R$" + fmt(data.proventos.total) + " (" + (data.proventos.count || 0) + " pagamentos)\n";
  }

  // Portfolio context
  if (data.pesoCarteira != null) {
    p += "Peso na carteira: " + fmtPct(data.pesoCarteira) + "\n";
  }

  p += "\nResponda com EXATAMENTE estas 4 seções (use os cabeçalhos entre colchetes):\n\n";

  p += "[DIAGNÓSTICO]\n";
  p += "Avaliação geral do ativo: está caro/barato (vs histórico e setor)? Tendência de preço (alta/lateral/baixa). Qualidade dos fundamentos. Posição do investidor (lucro/prejuízo). 3-4 linhas.\n\n";

  p += "[OPORTUNIDADES]\n";
  p += "2 ações concretas. Ex: comprar mais (reforçar posição), vender parcial (realizar lucro), lançar covered call (gerar renda), montar hedge (proteger). Para cada: preço/strike sugerido, justificativa, risco. 2-3 linhas cada.\n\n";

  p += "[RISCOS]\n";
  p += "2-3 riscos específicos deste ativo. Ex: valuation esticado, setor cíclico, alavancagem alta, concentração na carteira, perda de fundamentos. Sugerir mitigação para cada. 2 linhas cada.\n\n";

  p += "[PROJEÇÃO]\n";
  p += "3 cenários para próximos 3 meses: otimista, base, pessimista. Preço-alvo, probabilidade estimada, ação recomendada (manter/comprar mais/reduzir). 2 linhas cada.\n\n";

  if (data.categoria === "fii") {
    p += "NOTA: este é um FII. Foque em D.Y., vacância, gestão, qualidade dos ativos do fundo. Compare D.Y. com Selic (~13.25%).\n";
  } else if (data.categoria === "stock_int") {
    p += "NOTA: ativo internacional. Considere risco cambial USD/BRL. Valores em USD convertidos para BRL.\n";
  }

  p += buildProfileContext(data);
  p += NO_SELL_RULE;
  p += DISCLAIMER_RULE;

  return { system, prompt: p, sections: ["diagnostico", "oportunidades", "riscos", "projecao"] };
}

function buildResumoPrompt(data: any): { system: string; prompt: string; sections: string[] } {
  const system = "Você é um assistente financeiro pessoal. Responda SEMPRE em português. Seja CONCISO — máximo 500 caracteres por seção. Use R$. Tom amigável e direto, como um consultor que conhece bem o cliente.";

  let p = "Gere um resumo inteligente da situação financeira atual deste investidor.\n\n";

  // Patrimonio
  if (data.patrimonio != null) {
    p += "PATRIMÔNIO: R$" + fmt(data.patrimonio) + "\n";
  }
  if (data.rentabilidade != null) {
    p += "RENTABILIDADE MÊS: " + fmtPct(data.rentabilidade) + "\n";
  }

  // Renda
  if (data.rendaMensal != null) {
    p += "RENDA MENSAL: R$" + fmt(data.rendaMensal);
    if (data.metaMensal) {
      const pctMeta = data.rendaMensal / data.metaMensal * 100;
      p += " (" + fmtPct(pctMeta) + " da meta de R$" + fmt(data.metaMensal) + ")";
    }
    p += "\n";
  }
  if (data.rendaMesAnterior != null) {
    p += "RENDA MÊS ANTERIOR: R$" + fmt(data.rendaMesAnterior) + "\n";
  }

  // Allocation
  if (data.alocacao) {
    p += "ALOCAÇÃO: ";
    const keys = Object.keys(data.alocacao);
    for (let i = 0; i < keys.length; i++) {
      if (i > 0) p += ", ";
      const k = keys[i];
      const label = k === "acao" ? "Ações" : k === "fii" ? "FIIs" : k === "etf" ? "ETFs" : k === "stock_int" ? "Stocks" : k === "rf" ? "RF" : k === "opcao" ? "Opções" : k === "saldo" ? "Caixa" : k;
      p += label + " " + fmtPct(data.alocacao[k]);
    }
    p += "\n";
  }

  // Positions summary
  if (data.posicoes != null) {
    p += "POSIÇÕES: " + data.posicoes + " ativos\n";
  }

  // Alerts
  if (data.alertas && data.alertas.length > 0) {
    p += "\nALERTAS ATIVOS:\n";
    for (let i = 0; i < Math.min(data.alertas.length, 5); i++) {
      p += "  • " + data.alertas[i] + "\n";
    }
  }

  // Events
  if (data.eventos && data.eventos.length > 0) {
    p += "\nPRÓXIMOS EVENTOS:\n";
    for (let i = 0; i < Math.min(data.eventos.length, 5); i++) {
      p += "  • " + data.eventos[i] + "\n";
    }
  }

  // Top movers
  if (data.destaques && data.destaques.length > 0) {
    p += "\nDESTAQUES DO DIA:\n";
    for (let i = 0; i < Math.min(data.destaques.length, 5); i++) {
      const d = data.destaques[i];
      p += "  " + d.ticker + " " + (d.variacao >= 0 ? "+" : "") + fmtPct(d.variacao) + "\n";
    }
  }

  // Opcoes vencendo
  if (data.opcoesVencendo && data.opcoesVencendo.length > 0) {
    p += "\nOPÇÕES VENCENDO EM 7 DIAS:\n";
    for (let i = 0; i < data.opcoesVencendo.length; i++) {
      const ov = data.opcoesVencendo[i];
      p += "  " + ov.ticker + " " + ov.tipo + " Strike R$" + fmt(ov.strike) + " DTE " + ov.dte + "d\n";
    }
  }

  p += "\nResponda com EXATAMENTE estas 3 seções (use os cabeçalhos entre colchetes):\n\n";

  p += "[RESUMO]\n";
  p += "Resumo de 3-4 frases da situação atual. Destaque o que está indo bem e o que precisa de atenção. Compare com mês anterior se disponível. Tom motivador mas realista. 4 linhas.\n\n";

  p += "[AÇÕES URGENTES]\n";
  p += "1-3 ações que precisam de atenção HOJE ou esta semana. Ex: opção vencendo, ativo caindo muito, meta de renda atrasada, rebalanceamento necessário. Se nada urgente, diga 'Nenhuma ação urgente — carteira sob controle.' 2-3 linhas.\n\n";

  p += "[DICA DO DIA]\n";
  p += "1 dica prática e acionável baseada nos dados atuais. Pode ser: oportunidade de compra/venda, sugestão de diversificação, alerta de risco, ou educacional. Linguagem simples. 2-3 linhas.\n\n";

  p += buildProfileContext(data);
  p += NO_SELL_RULE;
  p += DISCLAIMER_RULE;
  p += "REGRAS: Não invente dados. Se informação insuficiente, diga. Selic ~13.25%. Priorize o que é acionável.\n";

  return { system, prompt: p, sections: ["resumo", "acoes_urgentes", "dica_do_dia"] };
}

function buildEstrategiaPrompt(data: any): { system: string; prompt: string; sections: string[] } {
  const system = "Você é um consultor de opções especialista no mercado brasileiro (B3). Responda SEMPRE em português. Seja CONCISO — máximo 600 caracteres por seção. Use R$. Sem introdução/conclusão/comentários extras. Fale como para um investidor iniciante/intermediário.";

  let p = "Sugira estratégias de opções para este investidor (mercado BR, em português).\n\n";

  // Positions
  if (data.posicoes && data.posicoes.length > 0) {
    p += "POSIÇÕES (" + data.posicoes.length + " ativos):\n";
    const max = 12;
    for (let i = 0; i < Math.min(data.posicoes.length, max); i++) {
      const pos = data.posicoes[i];
      p += "  " + pos.ticker + " (" + (pos.categoria || "?") + ") " + (pos.quantidade || 0) + " un. PM R$" + fmt(pos.pm);
      if (pos.preco_atual) p += " Atual R$" + fmt(pos.preco_atual);
      if (pos.pl_pct != null) p += " P&L " + fmtPct(pos.pl_pct);
      p += "\n";
    }
    if (data.posicoes.length > max) p += "  +" + (data.posicoes.length - max) + " outros ativos\n";
  }

  // Selic
  if (data.selic != null) {
    p += "\nSELIC: " + fmtPct(data.selic) + "\n";
  }

  // Indicators
  if (data.indicadores && data.indicadores.length > 0) {
    p += "\nINDICADORES:\n";
    for (let i = 0; i < Math.min(data.indicadores.length, 8); i++) {
      const ind = data.indicadores[i];
      const parts: string[] = [];
      if (ind.hv != null) parts.push("HV " + fmtPct(ind.hv));
      if (ind.iv != null) parts.push("IV " + fmtPct(ind.iv));
      if (ind.rsi != null) parts.push("RSI " + fmt(ind.rsi));
      if (parts.length > 0) p += "  " + ind.ticker + ": " + parts.join(" | ") + "\n";
    }
  }

  // Active options
  if (data.opcoesAtivas && data.opcoesAtivas.length > 0) {
    p += "\nOPÇÕES ATIVAS (" + data.opcoesAtivas.length + "):\n";
    for (let i = 0; i < Math.min(data.opcoesAtivas.length, 8); i++) {
      const op = data.opcoesAtivas[i];
      p += "  " + (op.ticker_opcao || op.ativo_base || "?") + " ";
      p += (op.direcao === "compra" ? "COMPRA" : "VENDA") + " " + (op.tipo || "CALL");
      p += " Strike R$" + fmt(op.strike) + " Prêmio R$" + fmt(op.premio);
      if (op.dte != null) p += " DTE " + op.dte + "d";
      if (op.pl_pct != null) p += " P&L " + fmtPct(op.pl_pct);
      p += "\n";
    }
  }

  p += "\nResponda com EXATAMENTE estas 3 seções (use os cabeçalhos entre colchetes):\n\n";

  p += "[OPORTUNIDADES DE VENDA]\n";
  p += "Para cada ativo com ações na carteira, sugira 1-2 covered calls ou CSPs concretas com strike, prêmio estimado, DTE, yield mensal. Máximo 3 ativos. Use strikes reais se disponíveis. Formato: TICKER — VENDA CALL/PUT strike R$X, prêmio ~R$Y, DTE Z dias, yield W%/mês. 3-4 linhas por ativo.\n\n";

  p += "[PROTEÇÃO]\n";
  p += "1-2 sugestões de hedge (protective put, collar) para as posições maiores da carteira. Strike, custo estimado, nível de proteção (% de queda coberta). Justificar por que essa posição precisa de proteção. 3-4 linhas cada.\n\n";

  p += "[GESTÃO]\n";
  p += "Ações concretas sobre as opções ativas do usuário: rolar (nova strike/vencimento), fechar (realizar lucro/prejuízo), ou manter. Critérios baseados em DTE, moneyness, P&L atual. Para cada opção ativa, 1-2 linhas com recomendação.\n\n";

  p += buildProfileContext(data);
  p += NO_SELL_RULE;
  p += DISCLAIMER_RULE;
  p += "REGRAS: Nunca sugira venda descoberta/naked de CALL. Covered call exige ações do ativo. CSP exige capital para exercício. Opções B3 são americanas. Prêmios são receita tributável (15%). Quantidades em número de opções. Selic ~" + fmtPct(data.selic || 13.25) + ".\n";

  return { system, prompt: p, sections: ["oportunidades_venda", "protecao", "gestao"] };
}

function buildRendaPrompt(data: any): { system: string; prompt: string; sections: string[] } {
  const system = "Você é um consultor de renda passiva especializado no mercado brasileiro. Responda SEMPRE em português. Seja CONCISO — máximo 600 caracteres por seção. Use R$. Tom prático e acionável.";

  let p = "Analise a renda passiva deste investidor e sugira otimizações (mercado BR, em português).\n\n";

  // Renda mensal total
  if (data.rendaMensal != null) {
    p += "RENDA MENSAL ATUAL: R$" + fmt(data.rendaMensal) + "\n";
  }
  if (data.metaMensal != null && data.metaMensal > 0) {
    p += "META MENSAL: R$" + fmt(data.metaMensal);
    if (data.rendaMensal != null) {
      p += " (" + fmtPct(data.rendaMensal / data.metaMensal * 100) + " atingida)";
    }
    p += "\n";
  }
  if (data.rendaTotalMesAnterior != null) {
    p += "RENDA MÊS ANTERIOR: R$" + fmt(data.rendaTotalMesAnterior) + "\n";
  }
  if (data.rendaMediaAnual != null) {
    p += "RENDA MÉDIA MENSAL (12M): R$" + fmt(data.rendaMediaAnual) + "\n";
  }

  // Breakdown
  if (data.breakdown) {
    p += "\nCOMPOSIÇÃO DA RENDA:\n";
    const bk = data.breakdown;
    if (bk.dividendos != null) p += "  Dividendos: R$" + fmt(bk.dividendos) + "\n";
    if (bk.jcp != null) p += "  JCP: R$" + fmt(bk.jcp) + "\n";
    if (bk.rendimentoFii != null) p += "  Rendimento FIIs: R$" + fmt(bk.rendimentoFii) + "\n";
    if (bk.plOpcoes != null) p += "  P&L Opções: R$" + fmt(bk.plOpcoes) + "\n";
    if (bk.rendaFixa != null) p += "  Renda Fixa (juros): R$" + fmt(bk.rendaFixa) + "\n";
    if (bk.dividendosStocks != null) p += "  Dividendos Stocks INT: R$" + fmt(bk.dividendosStocks) + "\n";
  }

  // DY carteira
  if (data.dyCarteira != null) {
    p += "\nD.Y. CARTEIRA: " + fmtPct(data.dyCarteira) + "\n";
  }

  // Proventos por ticker
  if (data.proventosPorTicker && data.proventosPorTicker.length > 0) {
    p += "\nPROVENTOS POR ATIVO (12M):\n";
    const max = 10;
    for (let i = 0; i < Math.min(data.proventosPorTicker.length, max); i++) {
      const pt = data.proventosPorTicker[i];
      p += "  " + pt.ticker + ": R$" + fmt(pt.total);
      if (pt.dy != null) p += " (DY " + fmtPct(pt.dy) + ")";
      p += "\n";
    }
  }

  // Opcoes ativas (premios)
  if (data.opcoesAtivas && data.opcoesAtivas.length > 0) {
    p += "\nOPÇÕES ATIVAS (prêmios):\n";
    for (let i = 0; i < Math.min(data.opcoesAtivas.length, 6); i++) {
      const op = data.opcoesAtivas[i];
      p += "  " + (op.ativo_base || "?") + " " + (op.tipo || "CALL") + " R$" + fmt(op.strike) + " Prêmio R$" + fmt(op.premio);
      if (op.dte != null) p += " DTE " + op.dte + "d";
      p += "\n";
    }
  }

  // Renda fixa
  if (data.rendaFixa && data.rendaFixa.length > 0) {
    p += "\nRENDA FIXA:\n";
    for (let i = 0; i < Math.min(data.rendaFixa.length, 5); i++) {
      const rf = data.rendaFixa[i];
      p += "  " + (rf.tipo || "CDB") + " " + (rf.emissor || "?") + " R$" + fmt(rf.valor_aplicado);
      if (rf.taxa != null) p += " " + fmtPct(rf.taxa);
      if (rf.indexador) p += " " + rf.indexador;
      p += "\n";
    }
  }

  p += "\nResponda com EXATAMENTE estas 3 seções (use os cabeçalhos entre colchetes):\n\n";

  p += "[DIAGNÓSTICO]\n";
  p += "Análise da renda atual vs meta: está no caminho? Composição saudável ou dependente de 1 fonte? Comparativo vs mês anterior (melhor/pior e por quê). Yield da carteira vs Selic. 4 linhas.\n\n";

  p += "[OTIMIZAÇÃO]\n";
  p += "2-3 ações concretas para aumentar renda passiva. Ex: aumentar posição em ativos com DY alto (citar tickers), lançar covered calls em ativos da carteira (strike/prêmio sugerido), diversificar fontes de renda (FIIs, RF). Cada ação com valor/impacto estimado. 3-4 linhas cada.\n\n";

  p += "[PROJEÇÃO]\n";
  p += "Cenário para próximos 3 meses mantendo posições atuais. Quanto de renda esperar por mês. Se a meta mensal é atingível e em quanto tempo. O que falta para atingir (valor/ação). 4-5 linhas.\n\n";

  p += buildProfileContext(data);
  p += NO_SELL_RULE;
  p += DISCLAIMER_RULE;
  p += "REGRAS: Selic ~" + fmtPct(data.selic || 13.25) + ". Não invente dados. Se informação insuficiente, diga. Priorize ações acionáveis com impacto quantificável.\n";

  return { system, prompt: p, sections: ["diagnostico", "otimizacao", "projecao"] };
}

function buildComparacaoPrompt(data: any): { system: string; prompt: string; sections: string[] } {
  const system = "Você é um analista de ações especialista no mercado brasileiro. Responda SEMPRE em português. Seja CONCISO — máximo 700 caracteres por seção. Use R$. Sem introdução/conclusão/comentários extras. Fale como para um investidor iniciante/intermediário, explicando termos técnicos entre parênteses.";

  let p = "Compare estes ativos lado a lado e ajude o investidor a decidir qual é a melhor opção (mercado BR, em português).\n\n";

  // Tickers being compared
  const tickers = data.tickers || [];
  p += "ATIVOS COMPARADOS: " + tickers.join(" vs ") + "\n\n";

  // Prices
  if (data.precos) {
    p += "PREÇOS ATUAIS:\n";
    for (let i = 0; i < tickers.length; i++) {
      const tk = tickers[i];
      const pr = data.precos[tk];
      if (pr) {
        p += "  " + tk + ": R$" + fmt(pr.preco) + " (var. dia " + fmtPct(pr.variacao) + ")";
        if (pr.marketCap) p += " MktCap R$" + fmt(pr.marketCap / 1e9) + "B";
        p += "\n";
      }
    }
  }

  // Fundamentals per ticker
  if (data.fundamentais) {
    for (let i = 0; i < tickers.length; i++) {
      const tk = tickers[i];
      const f = data.fundamentais[tk];
      if (!f) continue;
      p += "\n" + tk + " — FUNDAMENTOS:\n";
      // Valuation
      const val = f.valuation;
      if (val) {
        const parts: string[] = [];
        if (val.pl != null) parts.push("P/L " + fmt(val.pl));
        if (val.pvp != null) parts.push("P/VP " + fmt(val.pvp));
        if (val.evEbitda != null) parts.push("EV/EBITDA " + fmt(val.evEbitda));
        if (val.dy != null) parts.push("DY " + fmtPct(val.dy));
        if (val.lpa != null) parts.push("LPA " + fmt(val.lpa));
        if (parts.length > 0) p += "  Valuation: " + parts.join(", ") + "\n";
      }
      // Rentabilidade
      const rent = f.rentabilidade;
      if (rent) {
        const parts: string[] = [];
        if (rent.roe != null) parts.push("ROE " + fmtPct(rent.roe));
        if (rent.roic != null) parts.push("ROIC " + fmtPct(rent.roic));
        if (rent.roa != null) parts.push("ROA " + fmtPct(rent.roa));
        if (parts.length > 0) p += "  Rentabilidade: " + parts.join(", ") + "\n";
      }
      // Eficiencia
      const ef = f.eficiencia;
      if (ef) {
        const parts: string[] = [];
        if (ef.mBruta != null) parts.push("M.Bruta " + fmtPct(ef.mBruta));
        if (ef.mEbitda != null) parts.push("M.EBITDA " + fmtPct(ef.mEbitda));
        if (ef.mLiquida != null) parts.push("M.Líquida " + fmtPct(ef.mLiquida));
        if (parts.length > 0) p += "  Eficiência: " + parts.join(", ") + "\n";
      }
      // Endividamento
      const end = f.endividamento;
      if (end) {
        const parts: string[] = [];
        if (end.divLiqPl != null) parts.push("Dív.Líq/PL " + fmt(end.divLiqPl));
        if (end.divLiqEbitda != null) parts.push("Dív.Líq/EBITDA " + fmt(end.divLiqEbitda));
        if (parts.length > 0) p += "  Endividamento: " + parts.join(", ") + "\n";
      }
      // Crescimento
      const cr = f.crescimento;
      if (cr) {
        const parts: string[] = [];
        if (cr.cagrReceitas != null) parts.push("CAGR Rec " + fmtPct(cr.cagrReceitas));
        if (cr.cagrLucros != null) parts.push("CAGR Lucros " + fmtPct(cr.cagrLucros));
        if (parts.length > 0) p += "  Crescimento: " + parts.join(", ") + "\n";
      }
    }
  }

  // Ranking summary
  if (data.ranking) {
    p += "\nRANKING QUANTITATIVO (indicadores vencidos):\n";
    for (let i = 0; i < data.ranking.length; i++) {
      const r = data.ranking[i];
      p += "  " + (i + 1) + "º " + r.ticker + ": " + r.wins + " vitórias\n";
    }
  }

  // Correlation
  if (data.correlacao) {
    p += "\nCORRELAÇÃO: " + data.correlacao + "\n";
  }

  // User context
  if (data.possuiNaCarteira && data.possuiNaCarteira.length > 0) {
    p += "\nATIVOS NA CARTEIRA DO USUÁRIO: " + data.possuiNaCarteira.join(", ") + "\n";
  }

  p += "\nResponda com EXATAMENTE estas 4 seções (use os cabeçalhos entre colchetes):\n\n";

  p += "[COMPARAÇÃO]\n";
  p += "Comparação direta entre os ativos. Para cada indicador-chave (valuation, rentabilidade, endividamento, crescimento), qual ativo se destaca e por quê. Destacar diferenças significativas. 5-6 linhas.\n\n";

  p += "[VENCEDOR]\n";
  p += "Declare qual ativo é a melhor opção e para qual perfil de investidor. Justifique com 3 argumentos baseados nos dados. Se empate técnico, explique os trade-offs. Se ativos de setores diferentes, explicar que a comparação é limitada. 4-5 linhas.\n\n";

  p += "[RISCOS]\n";
  p += "1-2 riscos específicos de CADA ativo comparado. Ex: valuation esticado, dívida alta, crescimento estagnado, concentração setorial. Dizer qual ativo tem o pior perfil de risco e por quê. 3-4 linhas.\n\n";

  p += "[RECOMENDAÇÃO]\n";
  p += "Ação concreta para o investidor: qual comprar (se nenhum na carteira), qual aumentar/reduzir (se já possui), ou como dividir entre eles. Considerar diversificação. Ser específico. 3-4 linhas.\n\n";

  p += buildProfileContext(data);
  p += NO_SELL_RULE;
  p += DISCLAIMER_RULE;
  p += "REGRAS: Compare objetivamente. Não invente dados. Se um ativo é claramente superior nos números, diga. Se empate, diga. Considere setor e momento de mercado. Selic ~13.25%.\n";

  return { system, prompt: p, sections: ["comparacao", "vencedor", "riscos", "recomendacao"] };
}

// ═══════════ RESPONSE PARSER ═══════════

function parseResponse(text: string, sectionKeys: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const k of sectionKeys) result[k] = "";

  if (!text) return result;

  // Normalize headers
  const normalized = text
    .replace(/\[DIAGN[ÓO]STICO\]/gi, "[DIAGNÓSTICO]")
    .replace(/\[OPORTUNIDADES?\s*DE\s*VENDA\]/gi, "[OPORTUNIDADES DE VENDA]")
    .replace(/\[OPORTUNIDADES?\]/gi, "[OPORTUNIDADES]")
    .replace(/\[RISCOS?\]/gi, "[RISCOS]")
    .replace(/\[PR[ÓO]XIMOS?\s*PASSOS?\]/gi, "[PRÓXIMOS PASSOS]")
    .replace(/\[PROJE[ÇC][ÃA]O\]/gi, "[PROJEÇÃO]")
    .replace(/\[RESUMO\]/gi, "[RESUMO]")
    .replace(/\[A[ÇC][ÕO]ES?\s*URGENTES?\]/gi, "[AÇÕES URGENTES]")
    .replace(/\[DICA\s*DO\s*DIA\]/gi, "[DICA DO DIA]")
    .replace(/\[PROTE[ÇC][ÃA]O\]/gi, "[PROTEÇÃO]")
    .replace(/\[GEST[ÃA]O\]/gi, "[GESTÃO]")
    .replace(/\[OTIMIZA[ÇC][ÃA]O\]/gi, "[OTIMIZAÇÃO]")
    .replace(/\[COMPARA[ÇC][ÃA]O\]/gi, "[COMPARAÇÃO]")
    .replace(/\[VENCEDOR\]/gi, "[VENCEDOR]")
    .replace(/\[RECOMENDA[ÇC][ÃA]O\]/gi, "[RECOMENDAÇÃO]");

  // Map section keys to headers
  const headerMap: Record<string, string> = {
    diagnostico: "[DIAGNÓSTICO]",
    oportunidades: "[OPORTUNIDADES]",
    oportunidades_venda: "[OPORTUNIDADES DE VENDA]",
    riscos: "[RISCOS]",
    proximos_passos: "[PRÓXIMOS PASSOS]",
    projecao: "[PROJEÇÃO]",
    resumo: "[RESUMO]",
    acoes_urgentes: "[AÇÕES URGENTES]",
    dica_do_dia: "[DICA DO DIA]",
    protecao: "[PROTEÇÃO]",
    gestao: "[GESTÃO]",
    otimizacao: "[OTIMIZAÇÃO]",
    comparacao: "[COMPARAÇÃO]",
    vencedor: "[VENCEDOR]",
    recomendacao: "[RECOMENDAÇÃO]",
  };

  const sections = sectionKeys.map(function (k) {
    return { key: k, header: headerMap[k] || "[" + k.toUpperCase() + "]" };
  });

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

  // Fallback: if no sections parsed, put everything in first section
  const hasContent = sectionKeys.some(function (k) { return result[k].length > 0; });
  if (!hasContent) {
    result[sectionKeys[0]] = text.trim();
  }

  return result;
}

// ═══════════ MAIN HANDLER ═══════════

Deno.serve(async (req) => {
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
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: authError } =
      await supabase.auth.getUser();
    if (authError || !userData || !userData.user) {
      return ok({ error: "Usuário não autenticado." });
    }

    const userId = userData.user.id;
    const userEmail = userData.user.email || "";

    const body = await req.json();
    const analysisType = body.type || "resumo";

    if (!["carteira", "ativo", "resumo", "estrategia", "renda", "comparacao"].includes(analysisType)) {
      return ok({ error: "Tipo de análise inválido: " + analysisType });
    }

    // ═══ AI Usage Limits (same as analyze-option) ═══
    const ADMIN_EMAIL = "jonataspmagalhaes@gmail.com";
    const isAdmin = userEmail === ADMIN_EMAIL;
    let usedCredit = false;
    const DAILY_LIMIT = 5;
    const MONTHLY_LIMIT = 100;

    if (!isAdmin) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("ai_credits_extra, referral_reward_tier, referral_reward_end, trial_premium_used, trial_premium_start")
        .eq("id", userId)
        .single();

      const { data: vipData } = await supabaseAdmin
        .from("vip_overrides")
        .select("tier, ativo")
        .eq("email", userEmail)
        .eq("ativo", true)
        .maybeSingle();

      const isPremiumVip = vipData && (vipData.tier === "premium");
      const now = new Date();
      const rewardEnd = profile && profile.referral_reward_end ? new Date(profile.referral_reward_end) : null;
      const isPremiumReferral = profile && profile.referral_reward_tier === "premium" && rewardEnd && rewardEnd > now;
      const trialStart = profile && profile.trial_premium_start ? new Date(profile.trial_premium_start) : null;
      const trialEnd = trialStart ? new Date(trialStart.getTime() + 7 * 24 * 60 * 60 * 1000) : null;
      const isPremiumTrial = trialEnd && trialEnd > now;

      const { data: todayCount } = await supabaseAdmin.rpc("get_ai_usage_today", { p_user_id: userId });
      const usageToday = todayCount || 0;

      if (usageToday >= DAILY_LIMIT) {
        const credits = (profile && profile.ai_credits_extra) || 0;
        if (credits > 0) {
          const { data: decremented } = await supabaseAdmin.rpc("decrement_ai_credit", { p_user_id: userId });
          if (decremented) {
            usedCredit = true;
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

    // Get Anthropic API key
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      if (usedCredit) {
        await supabaseAdmin.rpc("increment_ai_credit", { p_user_id: userId }).catch(() => {});
      }
      return ok({ error: "Serviço de IA temporariamente indisponível." });
    }

    // Build prompt based on type
    let promptData: { system: string; prompt: string; sections: string[] };
    if (analysisType === "carteira") {
      promptData = buildCarteiraPrompt(body);
    } else if (analysisType === "ativo") {
      promptData = buildAtivoPrompt(body);
    } else if (analysisType === "estrategia") {
      promptData = buildEstrategiaPrompt(body);
    } else if (analysisType === "renda") {
      promptData = buildRendaPrompt(body);
    } else if (analysisType === "comparacao") {
      promptData = buildComparacaoPrompt(body);
    } else {
      promptData = buildResumoPrompt(body);
    }

    // Call Claude with model fallback
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
          max_tokens: 4096,
          system: promptData.system,
          messages: [
            { role: "user", content: promptData.prompt },
          ],
        }),
      });

      claudeJson = await claudeResp.json();

      if (claudeResp.status === 529 || claudeResp.status === 429) {
        console.warn("Model " + model + " overloaded (" + claudeResp.status + "), trying next...");
        continue;
      }
      usedModel = model;
      break;
    }

    // Check API errors
    if (claudeJson.error) {
      const msg = claudeJson.error.message || "Erro desconhecido";
      console.error("Claude API error:", msg);
      if (usedCredit) {
        await supabaseAdmin.rpc("increment_ai_credit", { p_user_id: userId }).catch(() => {});
      }
      if (msg.includes("overloaded") || msg.includes("rate")) {
        return ok({ error: "IA temporariamente sobrecarregada. Tente novamente em 30 segundos." });
      }
      return ok({ error: "Erro na IA: " + msg });
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
      if (usedCredit) {
        await supabaseAdmin.rpc("increment_ai_credit", { p_user_id: userId }).catch(() => {});
      }
      return ok({ error: "Resposta vazia da IA. Tente novamente." });
    }

    const stopReason = claudeJson.stop_reason || "unknown";
    const outputTokens = claudeJson.usage ? claudeJson.usage.output_tokens : 0;
    const inputTokens = claudeJson.usage ? claudeJson.usage.input_tokens : 0;
    console.log("analyze-general [" + analysisType + "] stop:", stopReason, "in:", inputTokens, "out:", outputTokens, "model:", usedModel);

    // Parse sections
    const parsed = parseResponse(text, promptData.sections);

    // Log AI usage
    const costEstimate = (inputTokens * 0.0000008 + outputTokens * 0.000004);
    try {
      await supabaseAdmin.from("ai_usage").insert({
        user_id: userId,
        tipo: analysisType,
        tokens_in: inputTokens,
        tokens_out: outputTokens,
        custo_estimado: costEstimate,
        resultado_id: null,
      });
    } catch (logErr) {
      console.warn("Failed to log AI usage:", logErr);
    }

    // Get updated usage stats
    let updatedProfile: any = null;
    let newTodayCount = 0;
    let newMonthCount = 0;
    try {
      const profResult = await supabaseAdmin.from("profiles").select("ai_credits_extra").eq("id", userId).single();
      updatedProfile = profResult.data;
    } catch (_e) { /* ignore */ }
    try {
      const todayResult = await supabaseAdmin.rpc("get_ai_usage_today", { p_user_id: userId });
      newTodayCount = todayResult.data || 0;
    } catch (_e) { /* ignore */ }
    try {
      const monthResult = await supabaseAdmin.rpc("get_ai_usage_month", { p_user_id: userId });
      newMonthCount = monthResult.data || 0;
    } catch (_e) { /* ignore */ }

    return ok({
      type: analysisType,
      ...parsed,
      _meta: {
        stop_reason: stopReason,
        output_tokens: outputTokens,
        model: usedModel,
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
    console.error("analyze-general error:", err);
    if (typeof usedCredit !== "undefined" && usedCredit && typeof userId !== "undefined") {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const adminClient = createClient(supabaseUrl, serviceRoleKey);
        await adminClient.rpc("increment_ai_credit", { p_user_id: userId });
      } catch (refundErr) {
        console.warn("Refund failed:", refundErr);
      }
    }
    return ok({ error: "Erro interno: " + (err instanceof Error ? err.message : String(err)) });
  }
});
