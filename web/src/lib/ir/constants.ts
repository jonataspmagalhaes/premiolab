// Constantes fiscais IR Brasil — ano referencia 2026 (IRPF entregue em 2026 refere-se a 2025).
//
// ATENCAO: aliquotas e limites podem mudar por lei anual. Revisar em janeiro
// de cada ano fiscal. Fonte dos valores: Receita Federal do Brasil,
// Instrucoes Normativas RFB 1585/2015, 1888/2019, 208/2002 + Lei 11.033/2004
// (isencao R$20k) + Lei 13.259/2016 (stocks internacionais).

export var REFERENCIA_LEGAL_ANO = 2026;

export var ALIQUOTAS = {
  acoes: 0.15,                // Swing trade acoes BR
  acoes_day: 0.20,            // Daytrade acoes BR
  fii: 0.20,                  // FIIs (sem isencao)
  etf: 0.15,                  // ETFs BR
  bdr: 0.15,                  // BDRs
  adr: 0.15,                  // ADRs
  reit: 0.15,                 // REITs
  stock_int: 0.15,            // Stocks internacionais
  opcoes_swing: 0.15,         // Opcoes swing
  opcoes_day: 0.20,           // Opcoes daytrade
  cripto_swing: 0.15,         // Cripto swing
  cripto_day: 0.225,          // Cripto daytrade (22,5%)
  jcp_fonte: 0.15,            // JCP retido na fonte
  us_dividendo_fonte: 0.30,   // Dividendos EUA retidos na fonte
} as const;

export var LIMITES_ISENCAO = {
  acoes_vendas_mes: 20000,    // R$ 20.000 em vendas/mes libera isencao em swing trade acoes
  cripto_vendas_mes: 35000,   // R$ 35.000 em vendas/mes libera isencao cripto
} as const;

// Codigo DARF principal pra renda variavel + opcoes + cripto
export var CODIGO_DARF_RV = '6015';
// Codigo DARF para cripto (Receita criou separado desde 2019)
export var CODIGO_DARF_CRIPTO = '4600';

// Tabela regressiva de IR em renda fixa tributada — por dias corridos da aplicacao
export var RF_TABELA_REGRESSIVA = [
  { ateDias: 180, aliquota: 0.225, label: 'Ate 180 dias' },
  { ateDias: 360, aliquota: 0.20, label: '181 a 360 dias' },
  { ateDias: 720, aliquota: 0.175, label: '361 a 720 dias' },
  { ateDias: Infinity, aliquota: 0.15, label: 'Acima de 720 dias' },
] as const;

// Codigos de "Bens e Direitos" da IRPF
export var CODIGOS_IRPF_BENS: Record<string, { codigo: string; grupo: string; descricao: string }> = {
  acao:           { codigo: '31', grupo: '03 — Participacoes societarias', descricao: 'Acoes (inclusive ex-ON/PN)' },
  fii:            { codigo: '73', grupo: '07 — Fundos', descricao: 'Fundo de Investimento Imobiliario (FII)' },
  etf:            { codigo: '74', grupo: '07 — Fundos', descricao: 'ETF — Fundo de indice' },
  bdr:            { codigo: '04', grupo: '03 — Participacoes societarias', descricao: 'BDR (recibo brasileiro)' },
  adr:            { codigo: '04', grupo: '03 — Participacoes societarias', descricao: 'ADR' },
  reit:           { codigo: '45', grupo: '03 — Participacoes societarias (exterior)', descricao: 'REIT (fundo imobiliario americano)' },
  stock_int:      { codigo: '45', grupo: '03 — Participacoes societarias (exterior)', descricao: 'Acao no exterior' },
  cripto_bitcoin: { codigo: '81', grupo: '08 — Criptoativos', descricao: 'Criptoativo Bitcoin (BTC)' },
  cripto_altcoin: { codigo: '82', grupo: '08 — Criptoativos', descricao: 'Outros criptoativos (altcoins)' },
  cripto_stable:  { codigo: '89', grupo: '08 — Criptoativos', descricao: 'Stablecoins e NFTs' },
  cdb:            { codigo: '45', grupo: '04 — Aplicacoes e investimentos', descricao: 'CDB, RDB, LC' },
  lci_lca:        { codigo: '45', grupo: '04 — Aplicacoes e investimentos', descricao: 'LCI, LCA' },
  tesouro:        { codigo: '45', grupo: '04 — Aplicacoes e investimentos', descricao: 'Tesouro Direto' },
  debenture:      { codigo: '45', grupo: '04 — Aplicacoes e investimentos', descricao: 'Debentures (incentivadas ou nao)' },
};

// Codigos de "Rendimentos Isentos" (Ficha 09 IRPF)
export var FICHA_09_CODIGOS = {
  dividendo_br:            '09',   // Dividendos de acoes BR
  rendimento_fii:          '26',   // Rendimentos mensais de FII
  lci_lca:                 '12',   // LCI/LCA
  poupanca:                '12',   // Poupanca
  debenture_incentivada:   '24',   // Debentures de infraestrutura
};

// Codigos de "Rendimentos Sujeitos a Tributacao Exclusiva" (Ficha 10 IRPF)
export var FICHA_10_CODIGOS = {
  jcp:                '10',   // Juros sobre Capital Proprio
  rv_15:              '06',   // Ganhos liquidos em renda variavel (15% swing trade + 20% daytrade)
  rf_aplicacoes:      '06',   // Aplicacoes financeiras (ja retido)
  ganhos_cripto:      '12',   // Ganhos com cripto
};

// Codigo para Rendimentos Recebidos de PJ/PF no Exterior (Carne-Leao / Ficha Exterior)
export var FICHA_EXTERIOR = {
  dividendos_eua: 'Rendimentos recebidos de PJ no Exterior',
  juros_exterior: 'Juros do Exterior',
};

// Categorias de ativo que compoem cada silo de compensacao IR
// (prejuizo acumulado so pode ser usado em ganhos da MESMA modalidade)
export var SILOS_COMPENSACAO = {
  acoes:        ['acao'],                  // swing acoes BR + BDR (discutivel — tratamos separado na categoria)
  fii:          ['fii'],                   // FII so compensa FII
  etf:          ['etf'],
  bdr:          ['bdr', 'adr'],
  reit:         ['reit'],
  stock_int:    ['stock_int'],
  opcoes_swing: ['opcoes_swing'],
  opcoes_day:   ['opcoes_day'],
  cripto_swing: ['cripto_swing'],
  cripto_day:   ['cripto_day'],
};

// Multa e juros (informativo, para DARF em atraso)
export var MULTA_DARF = {
  moraPorDiaPct: 0.33,       // 0,33% ao dia ate limite
  moraMaxPct: 20,            // Maximo 20% sobre o principal
  taxaJuros: 'Selic acumulada do mes seguinte + 1% no mes do pagamento',
};
