// Modo Contador — conteudo educacional estruturado por secao do menu IR.
//
// REFERENCIA_LEGAL_ANO = 2026 (revisar anualmente).
// Fontes: IN RFB 1585/2015, 1888/2019, 208/2002, Lei 11.033/2004, Lei
// 13.259/2016, Cartilha IRPF 2025/2026 da Receita Federal.
//
// Todo bloco DEVE ter disclaimer implicito: informacao orientativa; usuario
// deve conferir com contador em casos complexos.

export interface ContadorStep {
  titulo: string;
  descricao: string;
  dica?: string;
}

export interface ContadorExample {
  titulo: string;
  cenario: string;
  calculo: string;
  resultado: string;
}

export interface ContadorFAQ {
  pergunta: string;
  resposta: string;
}

export interface ContadorContent {
  secao: string;
  titulo: string;
  regra: {
    resumo: string;
    pontos: string[];
    fundamentoLegal: string;
  };
  comoPreencher: {
    programa: 'IRPF' | 'eCAC' | 'Sicalc' | 'Carne-leao';
    ficha: string;
    codigo?: string;
    steps: ContadorStep[];
  };
  exemplos: ContadorExample[];
  prazos: string;
  multa: string;
  faq: ContadorFAQ[];
  avisos: string[];
}

// ─── Blocos principais ────────────────────────────────────

export var CONTADOR_CONTENT: Record<string, ContadorContent> = {

  rv_acoes: {
    secao: 'rv_acoes',
    titulo: 'Acoes BR — Swing Trade',
    regra: {
      resumo:
        'Em acoes brasileiras negociadas em bolsa, o ganho de capital e tributado a 15% em operacoes de swing trade (compra em um dia, venda em outro). Ha isencao total do IR se a SOMA das vendas do mes nao ultrapassar R$ 20.000,00 — aqui o gatilho e o VOLUME de venda, nao o ganho.',
      pontos: [
        'Aliquota: 15% sobre o ganho liquido (venda - PM × qty - custos).',
        'Isencao: se o total vendido no mes ≤ R$ 20.000, a operacao swing e 100% isenta.',
        'Prejuizo: compensa ganhos em acoes em meses seguintes (indefinidamente), somente dentro do mesmo silo.',
        'Daytrade de acoes (compra+venda mesmo dia) tem regra propria: 20% sem isencao.',
        'Custos da corretora (corretagem, emolumentos, impostos B3) entram no calculo como despesa dedutivel.',
      ],
      fundamentoLegal: 'Lei 11.033/2004 art. 3º (isencao R$ 20k); IN RFB 1585/2015 (consolidacao das regras de renda variavel).',
    },
    comoPreencher: {
      programa: 'IRPF',
      ficha: 'Renda Variavel → Operacoes Comuns/Daytrade',
      steps: [
        {
          titulo: 'Mes a mes',
          descricao: 'No programa IRPF, abra "Renda Variavel > Operacoes Comuns" e lance, para cada mes, o total de vendas, custo, resultado liquido e prejuizos compensaveis.',
          dica: 'O PremioLab gera esse rescaldo mensal pronto — baixe o CSV e siga a coluna.',
        },
        {
          titulo: 'Isencao R$ 20k',
          descricao: 'Em meses com vendas ate R$ 20.000, o lucro vai em "Rendimentos Isentos e Nao Tributaveis" (Ficha 09, codigo 20), NAO na ficha de Renda Variavel.',
          dica: 'O app ja sinaliza com um badge verde os meses em que voce ganhou isencao.',
        },
        {
          titulo: 'DARF',
          descricao: 'Se houve imposto devido em um mes, emita DARF com codigo 6015 antes do ultimo dia util do mes seguinte.',
        },
        {
          titulo: 'Prejuizo para anos seguintes',
          descricao: 'O saldo residual de prejuizo no ultimo mes do ano e declarado em "Renda Variavel > Resultados" e carrega para IRPF seguintes. Nao esqueca de lancar em ANOS-BASE posteriores.',
        },
      ],
    },
    exemplos: [
      {
        titulo: 'Mes com isencao',
        cenario: 'Em marco, voce vendeu 100 PETR4 por R$ 36,00 = R$ 3.600. Seu PM era R$ 32,00.',
        calculo: 'Ganho = (36 - 32) × 100 = R$ 400. Total vendido no mes: R$ 3.600 (ou a soma de vendas do mes inteiro).',
        resultado: 'Se total vendido ≤ R$ 20k → ISENTO. Lance R$ 400 na Ficha 09 codigo 20.',
      },
      {
        titulo: 'Mes com IR devido',
        cenario: 'Em abril, vendeu R$ 25.000 em acoes e teve lucro de R$ 2.000. Tem prejuizo anterior de R$ 500.',
        calculo: 'Base = 2.000 - 500 = R$ 1.500. IR = 1.500 × 15% = R$ 225.',
        resultado: 'DARF 6015 de R$ 225 vence ate o ultimo dia util de maio.',
      },
    ],
    prazos: 'DARF vence no ultimo dia util do mes seguinte ao mes de apuracao.',
    multa: 'Atraso: 0,33% ao dia ate 20% + juros Selic acumulada do mes seguinte + 1% no mes do pagamento.',
    faq: [
      {
        pergunta: 'Posso abater custos da corretora?',
        resposta: 'Sim. Corretagem, emolumentos B3 e ISS da corretagem entram como custo — reduzem o ganho tributavel.',
      },
      {
        pergunta: 'Se eu so vendo BDR, vale a isencao de R$ 20k?',
        resposta: 'NAO. BDRs perderam a isencao em 2022. Hoje pagam 15% sem limite de isencao.',
      },
      {
        pergunta: 'Prejuizo de acoes compensa ganho com FII?',
        resposta: 'NAO. Sao silos separados. Prejuizo em acoes so compensa ganho em acoes.',
      },
    ],
    avisos: [
      'Soma TODAS as vendas do mes para avaliar a isencao — nao e "por ticker".',
      'Inclua custos da corretora no calculo do ganho para reduzir legitimamente o IR.',
      'Se vendeu acoes em mes sem ganho liquido (prejuizo), REGISTRE o prejuizo para abater lucros futuros.',
    ],
  },

  rv_fii: {
    secao: 'rv_fii',
    titulo: 'FIIs — Venda de cotas',
    regra: {
      resumo:
        'A venda de cotas de FII gera ganho tributavel a 20% (sem isencao de R$ 20.000 como em acoes). Rendimentos mensais distribuidos pelo FII sao ISENTOS (pessoa fisica em fundos listados na bolsa, respeitadas as regras — minimo 50 cotistas etc).',
      pontos: [
        'Aliquota sobre ganho de capital: 20%.',
        'Sem isencao por volume vendido (regra diferente das acoes).',
        'Prejuizo com FII compensa apenas ganho com FII (silo proprio).',
        'Rendimentos mensais (proventos do FII): ISENTOS para pessoa fisica.',
      ],
      fundamentoLegal: 'Lei 11.033/2004 art. 3º § 2º (rendimento isento pra pessoa fisica); Lei 8.668/1993 (regra geral FII).',
    },
    comoPreencher: {
      programa: 'IRPF',
      ficha: 'Renda Variavel → Operacoes Fundos Imobiliarios',
      steps: [
        {
          titulo: 'Lancar vendas',
          descricao: 'No programa IRPF, abra "Renda Variavel > Fundos Imobiliarios" e lance para cada mes: total de vendas, custo, resultado liquido e prejuizo compensavel.',
        },
        {
          titulo: 'Rendimentos isentos',
          descricao: 'Rendimentos mensais (aluguel recebido) vao em "Rendimentos Isentos e Nao Tributaveis" — Ficha 09 codigo 26.',
        },
        {
          titulo: 'DARF',
          descricao: 'Se ha IR devido no mes, DARF 6015 ate o ultimo dia util do mes seguinte.',
        },
      ],
    },
    exemplos: [
      {
        titulo: 'Venda com lucro',
        cenario: 'Vendeu 50 cotas HGLG11 por R$ 180 (PM R$ 150), sem prejuizo anterior.',
        calculo: 'Ganho = (180 - 150) × 50 = R$ 1.500. IR = 1.500 × 20% = R$ 300.',
        resultado: 'DARF 6015 de R$ 300 no mes seguinte.',
      },
      {
        titulo: 'Rendimento mensal',
        cenario: 'Recebeu R$ 120 de rendimento do HGLG11 em janeiro.',
        calculo: 'Valor ISENTO para pessoa fisica.',
        resultado: 'Lance R$ 120 em Ficha 09 codigo 26 (Rendimentos de FII).',
      },
    ],
    prazos: 'DARF ate ultimo dia util do mes seguinte.',
    multa: '0,33% ao dia ate 20% + Selic.',
    faq: [
      {
        pergunta: 'Por que FII e 20% se acoes sao 15%?',
        resposta: 'Regra diferente da Receita para fundos. Em compensacao, os rendimentos mensais sao isentos — o que em acoes nao necessariamente acontece.',
      },
      {
        pergunta: 'Posso compensar prejuizo de FII com acoes?',
        resposta: 'NAO. Silos separados. Prejuizo FII so compensa ganho FII.',
      },
    ],
    avisos: [
      'Venda de cotas NAO tem isencao de R$ 20k como acoes — qualquer ganho e tributado.',
      'Rendimentos so sao isentos se o FII for listado e tiver 50+ cotistas. Confira no RI do fundo.',
    ],
  },

  rv_acoes_day: {
    secao: 'rv_acoes_day',
    titulo: 'Daytrade — Acoes BR',
    regra: {
      resumo:
        'Daytrade = compra e venda do mesmo ativo no mesmo dia pelo mesmo investidor. Tributacao e 20% (mais alta) e sem isencao por volume. Prejuizo em daytrade so compensa daytrade (nao swing).',
      pontos: [
        'Aliquota: 20% sobre ganho liquido.',
        'Sem isencao R$ 20k.',
        'Prejuizo daytrade compensa apenas daytrade (silo proprio).',
        'IRRF: 1% retido na fonte sobre o lucro de cada operacao.',
      ],
      fundamentoLegal: 'IN RFB 1585/2015 art. 54.',
    },
    comoPreencher: {
      programa: 'IRPF',
      ficha: 'Renda Variavel → Operacoes Comuns/Daytrade (coluna Daytrade)',
      steps: [
        { titulo: 'Separar das ops comuns', descricao: 'No IRPF, a coluna "Daytrade" e SEPARADA da "Comuns". Lance em colunas diferentes.' },
        { titulo: 'IRRF retido', descricao: 'O 1% retido na fonte por cada operacao e deduzido do IR devido no mes.' },
        { titulo: 'DARF', descricao: 'Codigo 6015 com valor liquido do IR devido (apos IRRF).' },
      ],
    },
    exemplos: [
      {
        titulo: 'Daytrade com lucro',
        cenario: 'Comprou 1000 ITSA4 a R$ 10 e vendeu no mesmo dia a R$ 10,20.',
        calculo: 'Ganho = 1000 × 0,20 = R$ 200. IR = 200 × 20% = R$ 40. IRRF retido (1%): ~R$ 2.',
        resultado: 'DARF de R$ 38 (40 - 2 IRRF).',
      },
    ],
    prazos: 'DARF ate ultimo dia util do mes seguinte.',
    multa: '0,33%/dia ate 20% + Selic.',
    faq: [
      { pergunta: 'Exercicio de opcao conta como daytrade?', resposta: 'NAO. Exercicio e liquidacao do derivativo, nao daytrade. A opcao em si pode ser swing ou day dependendo das datas.' },
    ],
    avisos: ['Silo separado — prejuizo daytrade NAO compensa ganho swing.'],
  },

  opcoes_swing: {
    secao: 'opcoes_swing',
    titulo: 'Opcoes — Swing',
    regra: {
      resumo:
        'Lancamentos (vendas) e compras de opcoes com aberturas e fechamentos em dias diferentes seguem regra de swing: aliquota 15% sobre o lucro liquido, sem isencao. Prejuizos em opcoes swing compensam apenas ganhos swing.',
      pontos: [
        'Aliquota: 15% sobre ganho liquido mensal.',
        'Sem isencao por volume.',
        'Prejuizos compensam ganhos swing de opcoes — NAO se misturam com acoes.',
        'Exercicio NAO caracteriza daytrade (mesmo se expira em dia proximo).',
      ],
      fundamentoLegal: 'IN RFB 1585/2015 art. 58.',
    },
    comoPreencher: {
      programa: 'IRPF',
      ficha: 'Renda Variavel → Operacoes Comuns/Daytrade',
      steps: [
        { titulo: 'Lancar resultado liquido', descricao: 'Some premios recebidos - recompras - custos. O resultado do mes vai em "Comuns".' },
        { titulo: 'DARF', descricao: '6015 no mes seguinte se houve imposto devido.' },
      ],
    },
    exemplos: [
      {
        titulo: 'Venda coberta exercida',
        cenario: 'Vendeu call PETR4 strike 36 por R$ 1,20 × 100 = R$ 120. Nao recomprou; expirou.',
        calculo: 'Lucro total: R$ 120. IR: 120 × 15% = R$ 18.',
        resultado: 'DARF 6015 de R$ 18 (agregado com outras operacoes do mes).',
      },
    ],
    prazos: 'DARF ate ultimo dia util mes seguinte.',
    multa: '0,33%/dia ate 20% + Selic.',
    faq: [
      { pergunta: 'Se a opcao expira sem ser exercida, como declaro?', resposta: 'O premio recebido fica como lucro no dia da expiracao. Declare como ganho de swing no mes correspondente.' },
    ],
    avisos: ['Silo separado dos silos de acoes e FII.'],
  },

  rf_tributada: {
    secao: 'rf_tributada',
    titulo: 'Renda Fixa tributada',
    regra: {
      resumo:
        'CDB, LC, RDB, Tesouro Direto (exceto alguns), debentures comuns e CRI/CRA nao-incentivados pagam IR pela tabela regressiva: 22,5% (ate 180d), 20% (181–360d), 17,5% (361–720d), 15% (acima). Retido na fonte no resgate.',
      pontos: [
        'Tabela regressiva por dias corridos da aplicacao.',
        'Retencao na fonte (IR ja e pago automaticamente no resgate).',
        'IOF regressivo ate 30 dias (nao e IR).',
        'So entra na declaracao como informacao — nao gera DARF adicional.',
      ],
      fundamentoLegal: 'Lei 11.033/2004 art. 1º; IN RFB 1585/2015 cap VIII.',
    },
    comoPreencher: {
      programa: 'IRPF',
      ficha: 'Rendimentos Sujeitos a Tributacao Exclusiva — Ficha 10',
      codigo: '06',
      steps: [
        { titulo: 'Informe informe de rendimentos', descricao: 'A corretora/banco envia o Informe de Rendimentos em fevereiro. Os campos "Rendimentos" e "IR Fonte" ja vem prontos.' },
        { titulo: 'Ficha 10', descricao: 'Lance o rendimento liquido em "Rendimentos Sujeitos a Tributacao Exclusiva" codigo 06 (Aplicacoes Financeiras).' },
      ],
    },
    exemplos: [
      {
        titulo: 'CDB resgate 500 dias',
        cenario: 'Aplicou R$ 10.000, resgatou R$ 11.200 apos 500 dias.',
        calculo: 'Ganho = 1.200. Aliquota 17,5% (361–720d). IR retido = R$ 210.',
        resultado: 'Valor liquido recebido: R$ 10.990. No IRPF: Ficha 10 codigo 06, rendimento R$ 1.200, IR Fonte R$ 210.',
      },
    ],
    prazos: 'Sem DARF pra emitir — IR ja e retido na fonte no resgate.',
    multa: 'N/A (nao e o investidor que paga).',
    faq: [
      { pergunta: 'CDB liquidado em menos de 30 dias tem IOF. E o IR?', resposta: 'Ambos retidos. IOF pela tabela propria + IR pela regressiva (22,5% em < 180 dias).' },
    ],
    avisos: ['Apesar de retido, LEMBRE de lancar no IRPF — se omitir pode cair na malha.'],
  },

  rf_isenta: {
    secao: 'rf_isenta',
    titulo: 'Renda Fixa isenta',
    regra: {
      resumo:
        'LCI, LCA, CRI, CRA, debentures incentivadas (Lei 12.431/2011) e caderneta de poupanca sao ISENTAS de IR para pessoa fisica. So declara como informacao em Rendimentos Isentos.',
      pontos: [
        'Isentos de IR no resgate.',
        'Declaracao na Ficha 09 (Isentos).',
        'Nao tem DARF.',
      ],
      fundamentoLegal: 'Lei 10.931/2004; Lei 12.431/2011; Lei 11.033/2004.',
    },
    comoPreencher: {
      programa: 'IRPF',
      ficha: 'Rendimentos Isentos e Nao Tributaveis — Ficha 09',
      codigo: '12 (LCI/LCA/poupanca) ou 24 (debenture incentivada)',
      steps: [
        { titulo: 'Ficha 09', descricao: 'Lance o rendimento recebido no codigo correto (12 para LCI/LCA/poupanca; 24 para debenture incentivada).' },
      ],
    },
    exemplos: [
      {
        titulo: 'LCA',
        cenario: 'Aplicou R$ 50.000 em LCA, recebeu R$ 54.000 apos 2 anos.',
        calculo: 'Ganho R$ 4.000 isento.',
        resultado: 'Ficha 09 codigo 12, valor R$ 4.000.',
      },
    ],
    prazos: 'N/A',
    multa: 'N/A',
    faq: [
      { pergunta: 'Debenture comum e isenta?', resposta: 'NAO. So a debenture INCENTIVADA (Lei 12.431) e isenta. Comum segue tabela regressiva.' },
    ],
    avisos: ['Confira no informe de rendimentos qual codigo se aplica — misturar 12 com 24 e erro comum.'],
  },

  cripto_swing: {
    secao: 'cripto_swing',
    titulo: 'Criptoativos — Swing',
    regra: {
      resumo:
        'Se a soma das VENDAS mensais de cripto ultrapassar R$ 35.000, o ganho liquido do mes e tributado em 15%. Abaixo disso, isento. Declaracao mensal obrigatoria (DIMP) acima de certos limites.',
      pontos: [
        'Aliquota: 15% sobre o ganho liquido.',
        'Isencao ate R$ 35.000 em vendas/mes (soma todas as criptos).',
        'DARF codigo 4600.',
        'Daytrade: 22,5% sem isencao (silo proprio).',
      ],
      fundamentoLegal: 'IN RFB 1888/2019; Lei 13.259/2016.',
    },
    comoPreencher: {
      programa: 'IRPF',
      ficha: 'Renda Variavel → Operacoes com Criptoativos',
      codigo: '4600 (DARF)',
      steps: [
        { titulo: 'Controle mensal', descricao: 'Monitore TOTAL de vendas por mes (nao por cripto). Se soma > R$ 35k, calcule o imposto.' },
        { titulo: 'DARF 4600', descricao: 'Emita DARF ate ultimo dia util do mes seguinte se teve imposto devido.' },
        { titulo: 'Declaracao anual', descricao: 'Informe todas as operacoes do ano na ficha de Renda Variavel > Criptoativos.' },
      ],
    },
    exemplos: [
      {
        titulo: 'Mes com isencao',
        cenario: 'Vendeu R$ 10k em BTC e R$ 15k em ETH no mesmo mes, com lucro total de R$ 3.000.',
        calculo: 'Total vendido: R$ 25.000 (< 35k). ISENTO.',
        resultado: 'Sem DARF. Informe em Ficha 09 codigo propria de cripto isenta no anual.',
      },
      {
        titulo: 'Mes com imposto',
        cenario: 'Vendeu R$ 40k em cripto, lucro R$ 5.000.',
        calculo: 'Total > 35k → nao aplica isencao. IR = 5000 × 15% = R$ 750.',
        resultado: 'DARF 4600 de R$ 750.',
      },
    ],
    prazos: 'DARF 4600 ate ultimo dia util mes seguinte.',
    multa: '0,33%/dia ate 20% + Selic.',
    faq: [
      { pergunta: 'Stablecoins tambem contam no R$ 35k?', resposta: 'Sim. Qualquer venda de cripto-para-fiat (ou cripto-para-cripto que gera ganho) entra na soma.' },
      { pergunta: 'Se eu troco BTC por ETH, paga IR?', resposta: 'SIM. Troca entre criptos e considerada venda + compra para fins de IR.' },
    ],
    avisos: ['Declaracao obrigatoria no e-CAC (sistema DIMP) acima de R$ 30k/mes mesmo se isento.'],
  },

  dividendos_br: {
    secao: 'dividendos_br',
    titulo: 'Dividendos BR',
    regra: {
      resumo:
        'Dividendos distribuidos por empresas brasileiras sao ISENTOS de IR para pessoa fisica. Lanca-se apenas como informacao em Rendimentos Isentos.',
      pontos: [
        'Isento para pessoa fisica (lei vigente 2026).',
        'So declara como informacao.',
      ],
      fundamentoLegal: 'Lei 9.249/1995 art. 10 — em discussao tributacao futura, mas em 2026 segue isento.',
    },
    comoPreencher: {
      programa: 'IRPF',
      ficha: 'Rendimentos Isentos — Ficha 09',
      codigo: '09',
      steps: [
        { titulo: 'Ficha 09 codigo 09', descricao: 'Lance o total recebido no ano por CNPJ pagador.' },
      ],
    },
    exemplos: [
      {
        titulo: 'PETR4',
        cenario: 'Recebeu R$ 1.500 em dividendos PETR4 em 2025.',
        calculo: 'Isento.',
        resultado: 'Ficha 09 codigo 09, R$ 1.500, CNPJ da Petrobras.',
      },
    ],
    prazos: 'N/A',
    multa: 'N/A',
    faq: [
      { pergunta: 'Pode haver tributacao no futuro?', resposta: 'Ha projetos em discussao. Atualize-se a cada ano-base; hoje segue isento.' },
    ],
    avisos: ['Se omitir, a Receita cruza com o informe da empresa — melhor declarar mesmo isento.'],
  },

  jcp: {
    secao: 'jcp',
    titulo: 'JCP — Juros sobre Capital Proprio',
    regra: {
      resumo:
        'Juros sobre Capital Proprio tem 15% retido na fonte pela empresa pagadora. Pessoa fisica declara em Tributacao Exclusiva (Ficha 10).',
      pontos: [
        'IR 15% retido na fonte.',
        'Valor LIQUIDO recebido na conta.',
        'Declara bruto + IR retido na Ficha 10.',
      ],
      fundamentoLegal: 'Lei 9.249/1995 art. 9º § 2º.',
    },
    comoPreencher: {
      programa: 'IRPF',
      ficha: 'Rendimentos Sujeitos a Tributacao Exclusiva — Ficha 10',
      codigo: '10',
      steps: [
        { titulo: 'Ficha 10 codigo 10', descricao: 'Lance o JCP BRUTO (valor antes da retencao de 15%). Nao adicione outro IR.' },
      ],
    },
    exemplos: [
      {
        titulo: 'ITSA4',
        cenario: 'Empresa pagou R$ 100 de JCP. Voce recebeu R$ 85 na conta.',
        calculo: 'Bruto R$ 100, IR retido R$ 15.',
        resultado: 'Ficha 10 codigo 10, valor R$ 100 (bruto). Nao ha DARF adicional.',
      },
    ],
    prazos: 'Ja retido na fonte.',
    multa: 'N/A',
    faq: [
      { pergunta: 'Como diferencio JCP de dividendo?', resposta: 'O informe de rendimentos da empresa separa. JCP aparece como "juros sobre capital proprio"; dividendo como "dividendos".' },
    ],
    avisos: ['O valor bruto esta no informe de rendimentos da empresa — nao inferir a partir do valor liquido recebido.'],
  },

  dividendos_eua: {
    secao: 'dividendos_eua',
    titulo: 'Dividendos EUA',
    regra: {
      resumo:
        'Dividendos pagos por empresas americanas tem 30% retido pelo IRS na origem (tratado Brasil/EUA). No Brasil, declaram-se como rendimento recebido no exterior — com possibilidade de deduzir o IR pago no exterior ate o limite de IR devido no Brasil (evitar bitributacao).',
      pontos: [
        'IR 30% retido nos EUA (via IRS).',
        'Declaracao na Ficha "Rendimentos Recebidos no Exterior".',
        'Pode haver deducao parcial do IR pago no exterior.',
        'Se nao houve retencao, cabe CARNE-LEAO (guia propria, mensal).',
      ],
      fundamentoLegal: 'IN RFB 208/2002; Decreto 9580/2018.',
    },
    comoPreencher: {
      programa: 'IRPF',
      ficha: 'Rendimentos Recebidos de PJ no Exterior',
      steps: [
        { titulo: 'Converter para BRL', descricao: 'Use taxa PTAX de venda do ultimo dia util do mes de recebimento do dividendo.' },
        { titulo: 'Ficha de rendimentos exterior', descricao: 'Lance bruto em BRL, o pais pagador (EUA), CNPJ da empresa (se houver), e o IR retido (convertido em BRL).' },
      ],
    },
    exemplos: [
      {
        titulo: 'AAPL',
        cenario: 'Recebeu US$ 50 de dividendo AAPL. PTAX = R$ 5,20. IR retido 30%.',
        calculo: 'Bruto BRL = 50 × 5,20 = R$ 260. IR retido = 260 × 30% = R$ 78.',
        resultado: 'Ficha exterior: rendimento R$ 260, IR retido R$ 78, pais EUA.',
      },
    ],
    prazos: 'Se cabe carne-leao (sem retencao), ate ultimo dia util mes seguinte.',
    multa: 'Conforme regra de carne-leao.',
    faq: [
      { pergunta: 'Tenho que pagar imposto no Brasil tambem?', resposta: 'O tratado Brasil-EUA permite deduzir o IR pago no exterior ate o limite do IR devido no Brasil. Se a retencao foi maior que a aliquota brasileira, nao paga mais nada aqui.' },
    ],
    avisos: ['Use PTAX de VENDA — nao de compra ou media.'],
  },

  bens_direitos: {
    secao: 'bens_direitos',
    titulo: 'Bens e Direitos (Ficha 31/12)',
    regra: {
      resumo:
        'Toda posicao existente em 31/12 de cada ano deve ser declarada na Ficha "Bens e Direitos", com codigo IRPF + discriminacao + valor em BRL pelo CUSTO DE AQUISICAO (PM × qty), NAO pelo valor de mercado.',
      pontos: [
        'Valor e CUSTO de aquisicao em BRL, nao cotacao.',
        'Cada ativo tem codigo IRPF especifico (31 acoes, 73 FII, 74 ETF, 45 RF/stocks INT, 81-89 cripto).',
        'Para stocks INT: converter cada compra pela PTAX da data; somar em BRL.',
      ],
      fundamentoLegal: 'Cartilha IRPF/Receita + Decreto 9580/2018.',
    },
    comoPreencher: {
      programa: 'IRPF',
      ficha: 'Bens e Direitos',
      steps: [
        { titulo: 'Por ativo', descricao: 'Cada ticker/cripto/RF vira UMA linha na ficha. Discrimine: "Acao PETR4 — 100 cotas — PM R$ 32,00 — Corretora XP".' },
        { titulo: 'Custo acumulado', descricao: 'Valor = qty × PM em BRL. Stocks INT: conversao PTAX de CADA compra somada.' },
        { titulo: 'Situacao anos', descricao: 'Preencha "31/12 ano anterior" (conforme IRPF passado) e "31/12 ano base".' },
      ],
    },
    exemplos: [
      {
        titulo: 'FII HGLG11',
        cenario: 'Tinha 50 cotas em 31/12/2024 por PM R$ 160. Em 2025 comprou mais 30 por R$ 155 cada.',
        calculo: 'PM novo = (50×160 + 30×155) / 80 = R$ 158,13. Custo total 31/12/2025 = R$ 12.650.',
        resultado: 'Ficha Bens codigo 73, valor R$ 12.650. Discriminacao: "HGLG11 — 80 cotas — PM R$ 158,13".',
      },
    ],
    prazos: 'IRPF ate ultimo dia util de abril/maio (varia por ano).',
    multa: 'Atraso IRPF: 1% ao mes sobre IR devido (min R$ 165,74, max 20% do IR).',
    faq: [
      { pergunta: 'E se nao tinha em 31/12 do ano anterior?', resposta: 'Deixe a coluna anterior em BRANCO. So preenche a coluna do ano-base.' },
      { pergunta: 'Mudou de corretora no ano?', resposta: 'Ainda conta como mesmo bem. Mantenha UMA linha por ticker.' },
    ],
    avisos: [
      'USE CUSTO, nao preco de mercado. Erro comum e usar cotacao atual.',
      'Stocks INT: salvar taxa de cambio de cada compra — se perder, consulte Ptax historica no BCB.',
    ],
  },

  darf: {
    secao: 'darf',
    titulo: 'DARF — Como emitir e pagar',
    regra: {
      resumo:
        'DARF e a guia oficial para pagar IR sobre renda variavel mensal (acoes, FII, ETF, BDR, opcoes, cripto). Codigo varia: 6015 para renda variavel; 4600 para cripto especificamente.',
      pontos: [
        'Codigo 6015: acoes, FII, ETF, BDR, ADR, REIT, stocks INT, opcoes.',
        'Codigo 4600: cripto.',
        'Vencimento: ultimo dia util do mes seguinte ao mes de apuracao.',
        'Pagar via Sicalc, Pix ou conta bancaria.',
      ],
      fundamentoLegal: 'IN RFB 1585/2015 art. 65.',
    },
    comoPreencher: {
      programa: 'Sicalc',
      ficha: 'DARF numerico — Codigo 6015 ou 4600',
      steps: [
        { titulo: 'Baixar Sicalc', descricao: 'Acesse https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/pagamentos-e-parcelamentos/sicalc e baixe o Sicalc.' },
        { titulo: 'Preencher', descricao: 'Preencha CPF, periodo de apuracao (MM/YYYY), codigo 6015 (ou 4600), valor principal.' },
        { titulo: 'Imprimir e pagar', descricao: 'O Sicalc gera a DARF com codigo de barras. Pague ate o vencimento via banco/Pix.' },
      ],
    },
    exemplos: [
      {
        titulo: 'DARF de marco',
        cenario: 'Imposto devido em marco/2026: R$ 450 sobre lucro em acoes.',
        calculo: 'Periodo apuracao: 03/2026. Vencimento: ultimo dia util de abril/2026.',
        resultado: 'Sicalc, codigo 6015, R$ 450 principal, vencimento 30/04/2026.',
      },
    ],
    prazos: 'Ultimo dia util mes seguinte.',
    multa: 'Atraso: 0,33% ao dia ate 20% + juros Selic acumulada.',
    faq: [
      { pergunta: 'Posso pagar DARF vencida?', resposta: 'SIM. Sicalc calcula multa + juros automaticamente. Melhor tarde que nunca.' },
      { pergunta: 'Tem valor minimo para emitir DARF?', resposta: 'SIM. R$ 10. Abaixo disso, acumule para o mes seguinte.' },
    ],
    avisos: ['Nao pague DARF sem ter certeza do valor — erro aqui exige retificar no ano seguinte.'],
  },
};

// Helper pra buscar por chave sem quebrar
export function getContadorContent(secao: string): ContadorContent | null {
  return CONTADOR_CONTENT[secao] || null;
}

export function listSecoes(): string[] {
  return Object.keys(CONTADOR_CONTENT);
}
