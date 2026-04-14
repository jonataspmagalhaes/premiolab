// ═══════════════════════════════════════════════════════
// TICKER_SECTORS — Mapa ticker → setor/segmento
// Compartilhado entre: AnaliseScreen, CarteiraScreen
// Tickers nao mapeados aqui sao enriquecidos via brapi
// ═══════════════════════════════════════════════════════

var TICKER_SECTORS = {
  // ══════════ FINANCEIRO ══════════
  // Bancos
  BBAS3: { setor: 'Financeiro', segmento: 'Bancos' }, ITUB4: { setor: 'Financeiro', segmento: 'Bancos' },
  ITUB3: { setor: 'Financeiro', segmento: 'Bancos' }, BBDC4: { setor: 'Financeiro', segmento: 'Bancos' },
  BBDC3: { setor: 'Financeiro', segmento: 'Bancos' }, SANB11: { setor: 'Financeiro', segmento: 'Bancos' },
  ABCB4: { setor: 'Financeiro', segmento: 'Bancos' }, BMGB4: { setor: 'Financeiro', segmento: 'Bancos' },
  BRBI11: { setor: 'Financeiro', segmento: 'Bancos' }, BPAN4: { setor: 'Financeiro', segmento: 'Bancos' },
  PINE4: { setor: 'Financeiro', segmento: 'Bancos' }, BSLI3: { setor: 'Financeiro', segmento: 'Bancos' },
  BGIP4: { setor: 'Financeiro', segmento: 'Bancos' },
  // Investimentos / Holdings
  BPAC11: { setor: 'Financeiro', segmento: 'Investimentos' }, BPAC3: { setor: 'Financeiro', segmento: 'Investimentos' },
  BPAC5: { setor: 'Financeiro', segmento: 'Investimentos' },
  B3SA3: { setor: 'Financeiro', segmento: 'Bolsa' },
  ITSA4: { setor: 'Financeiro', segmento: 'Holding' }, ITSA3: { setor: 'Financeiro', segmento: 'Holding' },
  // Seguros
  BBSE3: { setor: 'Financeiro', segmento: 'Seguros' }, IRBR3: { setor: 'Financeiro', segmento: 'Seguros' },
  PSSA3: { setor: 'Financeiro', segmento: 'Seguros' }, CXSE3: { setor: 'Financeiro', segmento: 'Seguros' },
  SULA11: { setor: 'Financeiro', segmento: 'Seguros' }, WIZC3: { setor: 'Financeiro', segmento: 'Seguros' },
  // Pagamentos / Fintech
  CIEL3: { setor: 'Financeiro', segmento: 'Pagamentos' },
  PAGS3: { setor: 'Financeiro', segmento: 'Pagamentos' },
  STNE3: { setor: 'Financeiro', segmento: 'Pagamentos' },

  // ══════════ PETROLEO E GAS ══════════
  PETR4: { setor: 'Petróleo', segmento: 'Expl. e Refino' }, PETR3: { setor: 'Petróleo', segmento: 'Expl. e Refino' },
  PRIO3: { setor: 'Petróleo', segmento: 'Junior Oils' }, RECV3: { setor: 'Petróleo', segmento: 'Junior Oils' },
  RRRP3: { setor: 'Petróleo', segmento: 'Junior Oils' }, ENAT3: { setor: 'Petróleo', segmento: 'Junior Oils' },
  CSAN3: { setor: 'Petróleo', segmento: 'Distribuicao' }, UGPA3: { setor: 'Petróleo', segmento: 'Distribuicao' },
  VBBR3: { setor: 'Petróleo', segmento: 'Distribuicao' }, RAIZ4: { setor: 'Petróleo', segmento: 'Distribuicao' },

  // ══════════ MINERACAO / SIDERURGIA ══════════
  VALE3: { setor: 'Mineracao', segmento: 'Mineracao' }, CMIN3: { setor: 'Mineracao', segmento: 'Mineracao' },
  BRAP4: { setor: 'Mineracao', segmento: 'Holding' }, BRAP3: { setor: 'Mineracao', segmento: 'Holding' },
  CSNA3: { setor: 'Siderurgia', segmento: 'Siderurgia' }, GGBR4: { setor: 'Siderurgia', segmento: 'Siderurgia' },
  GGBR3: { setor: 'Siderurgia', segmento: 'Siderurgia' }, USIM5: { setor: 'Siderurgia', segmento: 'Siderurgia' },
  USIM3: { setor: 'Siderurgia', segmento: 'Siderurgia' }, GOAU4: { setor: 'Siderurgia', segmento: 'Siderurgia' },
  GOAU3: { setor: 'Siderurgia', segmento: 'Siderurgia' }, FESA4: { setor: 'Siderurgia', segmento: 'Ferro-ligas' },
  FESA3: { setor: 'Siderurgia', segmento: 'Ferro-ligas' },
  TASA4: { setor: 'Siderurgia', segmento: 'Acos Especiais' }, TASA3: { setor: 'Siderurgia', segmento: 'Acos Especiais' },

  // ══════════ ENERGIA ══════════
  // Geracao
  ELET3: { setor: 'Energia', segmento: 'Geracao' }, ELET6: { setor: 'Energia', segmento: 'Geracao' },
  ENGI11: { setor: 'Energia', segmento: 'Geracao' }, CMIG4: { setor: 'Energia', segmento: 'Geracao' },
  CMIG3: { setor: 'Energia', segmento: 'Geracao' }, EGIE3: { setor: 'Energia', segmento: 'Geracao' },
  ENEV3: { setor: 'Energia', segmento: 'Geracao' }, AESB3: { setor: 'Energia', segmento: 'Geracao' },
  MEGA3: { setor: 'Energia', segmento: 'Geracao' }, CBEE3: { setor: 'Energia', segmento: 'Geracao' },
  // Transmissao
  TAEE11: { setor: 'Energia', segmento: 'Transmissao' }, TAEE3: { setor: 'Energia', segmento: 'Transmissao' },
  TAEE4: { setor: 'Energia', segmento: 'Transmissao' }, EQTL3: { setor: 'Energia', segmento: 'Transmissao' },
  TRPL4: { setor: 'Energia', segmento: 'Transmissao' }, TRPL3: { setor: 'Energia', segmento: 'Transmissao' },
  ALUP11: { setor: 'Energia', segmento: 'Transmissao' }, ALUP3: { setor: 'Energia', segmento: 'Transmissao' },
  ALUP4: { setor: 'Energia', segmento: 'Transmissao' },
  // Distribuicao
  CPFE3: { setor: 'Energia', segmento: 'Distribuicao' }, CPLE6: { setor: 'Energia', segmento: 'Distribuicao' },
  CPLE3: { setor: 'Energia', segmento: 'Distribuicao' }, NEOE3: { setor: 'Energia', segmento: 'Distribuicao' },
  COCE5: { setor: 'Energia', segmento: 'Distribuicao' }, CESP6: { setor: 'Energia', segmento: 'Distribuicao' },
  ENBR3: { setor: 'Energia', segmento: 'Distribuicao' }, LIGHT3: { setor: 'Energia', segmento: 'Distribuicao' },
  CLSC4: { setor: 'Energia', segmento: 'Distribuicao' },
  // Renovavel
  AURE3: { setor: 'Energia', segmento: 'Renovavel' }, RNEW4: { setor: 'Energia', segmento: 'Renovavel' },
  RNEW3: { setor: 'Energia', segmento: 'Renovavel' },

  // ══════════ CONSUMO ══════════
  // Bebidas
  ABEV3: { setor: 'Consumo', segmento: 'Bebidas' },
  // Frigorificos
  JBSS3: { setor: 'Consumo', segmento: 'Frigorificos' }, MRFG3: { setor: 'Consumo', segmento: 'Frigorificos' },
  BRFS3: { setor: 'Consumo', segmento: 'Frigorificos' }, BEEF3: { setor: 'Consumo', segmento: 'Frigorificos' },
  MNPR3: { setor: 'Consumo', segmento: 'Frigorificos' },
  // Alimentos
  MDIA3: { setor: 'Consumo', segmento: 'Alimentos' }, CAML3: { setor: 'Consumo', segmento: 'Alimentos' },
  MLAS3: { setor: 'Consumo', segmento: 'Alimentos' },
  // Cosmeticos / Higiene
  NTCO3: { setor: 'Consumo', segmento: 'Cosmeticos' },
  // Agronegocio
  SMTO3: { setor: 'Consumo', segmento: 'Agronegocio' }, SLCE3: { setor: 'Consumo', segmento: 'Agronegocio' },
  AGRO3: { setor: 'Consumo', segmento: 'Agronegocio' }, TTEN3: { setor: 'Consumo', segmento: 'Agronegocio' },
  SOJA3: { setor: 'Consumo', segmento: 'Agronegocio' },
  // Fumo
  PGMN3: { setor: 'Consumo', segmento: 'Fumo' },

  // ══════════ VAREJO ══════════
  // E-commerce
  MGLU3: { setor: 'Varejo', segmento: 'E-commerce' }, BHIA3: { setor: 'Varejo', segmento: 'E-commerce' },
  AMER3: { setor: 'Varejo', segmento: 'E-commerce' },
  // Moda
  LREN3: { setor: 'Varejo', segmento: 'Moda' }, ARZZ3: { setor: 'Varejo', segmento: 'Moda' },
  ALPA4: { setor: 'Varejo', segmento: 'Moda' }, ALPA3: { setor: 'Varejo', segmento: 'Moda' },
  SOMA3: { setor: 'Varejo', segmento: 'Moda' }, CEAB3: { setor: 'Varejo', segmento: 'Moda' },
  GRND3: { setor: 'Varejo', segmento: 'Moda' }, GUAR3: { setor: 'Varejo', segmento: 'Moda' },
  TFCO4: { setor: 'Varejo', segmento: 'Moda' },
  // Especializado
  PETZ3: { setor: 'Varejo', segmento: 'Especializado' }, VIVA3: { setor: 'Varejo', segmento: 'Joias' },
  ESPA3: { setor: 'Varejo', segmento: 'Especializado' },
  // Supermercados / Atacado
  ASAI3: { setor: 'Varejo', segmento: 'Supermercados' }, CRFB3: { setor: 'Varejo', segmento: 'Supermercados' },
  PCAR3: { setor: 'Varejo', segmento: 'Supermercados' }, GMAT3: { setor: 'Varejo', segmento: 'Supermercados' },
  // Locacao
  RENT3: { setor: 'Varejo', segmento: 'Locacao' }, MOVI3: { setor: 'Varejo', segmento: 'Locacao' },
  LCAM3: { setor: 'Varejo', segmento: 'Locacao' }, VAMO3: { setor: 'Varejo', segmento: 'Locacao' },
  // Shoppings
  MULT3: { setor: 'Varejo', segmento: 'Shoppings' }, IGTI11: { setor: 'Varejo', segmento: 'Shoppings' },
  IGTI3: { setor: 'Varejo', segmento: 'Shoppings' }, BRML3: { setor: 'Varejo', segmento: 'Shoppings' },
  ALOS3: { setor: 'Varejo', segmento: 'Shoppings' },
  // Farmacia
  RADL3: { setor: 'Varejo', segmento: 'Farmacias' }, PGMN3: { setor: 'Varejo', segmento: 'Farmacias' },
  PNVL3: { setor: 'Varejo', segmento: 'Farmacias' },
  // Material Construcao
  VIVA3: { setor: 'Varejo', segmento: 'Joias' },

  // ══════════ SAUDE ══════════
  HAPV3: { setor: 'Saude', segmento: 'Planos' }, RDOR3: { setor: 'Saude', segmento: 'Hospitais' },
  FLRY3: { setor: 'Saude', segmento: 'Diagnosticos' }, QUAL3: { setor: 'Saude', segmento: 'Planos' },
  HYPE3: { setor: 'Saude', segmento: 'Farmaceutica' }, ONCO3: { setor: 'Saude', segmento: 'Hospitais' },
  MATD3: { setor: 'Saude', segmento: 'Hospitais' }, BLAU3: { setor: 'Saude', segmento: 'Farmaceutica' },
  ODPV3: { setor: 'Saude', segmento: 'Odontologia' },
  AALR3: { setor: 'Saude', segmento: 'Diagnosticos' }, PARD3: { setor: 'Saude', segmento: 'Diagnosticos' },

  // ══════════ TECNOLOGIA ══════════
  TOTS3: { setor: 'Tecnologia', segmento: 'Software' }, LWSA3: { setor: 'Tecnologia', segmento: 'Internet' },
  CASH3: { setor: 'Tecnologia', segmento: 'Fintech' }, LINX3: { setor: 'Tecnologia', segmento: 'Software' },
  SQIA3: { setor: 'Tecnologia', segmento: 'Software' }, MILS3: { setor: 'Tecnologia', segmento: 'Servicos' },
  INTB3: { setor: 'Tecnologia', segmento: 'Software' }, TRAD3: { setor: 'Tecnologia', segmento: 'Fintech' },
  BMOB3: { setor: 'Tecnologia', segmento: 'Software' }, LVTC3: { setor: 'Tecnologia', segmento: 'Software' },
  DESK3: { setor: 'Tecnologia', segmento: 'Telecom/ISP' }, BRIT3: { setor: 'Tecnologia', segmento: 'Telecom/ISP' },
  NGRD3: { setor: 'Tecnologia', segmento: 'Seguranca' },

  // ══════════ TELECOM ══════════
  VIVT3: { setor: 'Telecom', segmento: 'Telecom' }, TIMS3: { setor: 'Telecom', segmento: 'Telecom' },
  OIBR3: { setor: 'Telecom', segmento: 'Telecom' }, OIBR4: { setor: 'Telecom', segmento: 'Telecom' },

  // ══════════ INDUSTRIA ══════════
  // Motores / Equipamentos
  WEGE3: { setor: 'Industria', segmento: 'Motores' }, KEPL3: { setor: 'Industria', segmento: 'Equipamentos' },
  ROMI3: { setor: 'Industria', segmento: 'Maquinas' }, MYPK3: { setor: 'Industria', segmento: 'Autopeças' },
  SHUL4: { setor: 'Industria', segmento: 'Maquinas' }, SHUL3: { setor: 'Industria', segmento: 'Maquinas' },
  // Aeronautica
  EMBR3: { setor: 'Industria', segmento: 'Aeronautica' },
  // Veiculos
  POMO4: { setor: 'Industria', segmento: 'Veiculos' }, POMO3: { setor: 'Industria', segmento: 'Veiculos' },
  RAPT4: { setor: 'Industria', segmento: 'Autopeças' }, RAPT3: { setor: 'Industria', segmento: 'Autopeças' },
  TUPY3: { setor: 'Industria', segmento: 'Autopeças' }, LEVE3: { setor: 'Industria', segmento: 'Autopeças' },
  RCSL4: { setor: 'Industria', segmento: 'Autopeças' }, RCSL3: { setor: 'Industria', segmento: 'Autopeças' },
  FRAS3: { setor: 'Industria', segmento: 'Autopeças' },
  // Materiais / Servicos
  DXCO3: { setor: 'Industria', segmento: 'Materiais' }, GGPS3: { setor: 'Industria', segmento: 'Servicos' },
  MTSA4: { setor: 'Industria', segmento: 'Metalurgia' }, MTSA3: { setor: 'Industria', segmento: 'Metalurgia' },
  PTBL3: { setor: 'Industria', segmento: 'Materiais' },

  // ══════════ QUIMICA ══════════
  UNIP6: { setor: 'Quimica', segmento: 'Petroquimica' }, UNIP5: { setor: 'Quimica', segmento: 'Petroquimica' },
  UNIP3: { setor: 'Quimica', segmento: 'Petroquimica' },
  BRKM5: { setor: 'Quimica', segmento: 'Petroquimica' }, BRKM3: { setor: 'Quimica', segmento: 'Petroquimica' },
  LUPA3: { setor: 'Quimica', segmento: 'Fertilizantes' },
  CRPG5: { setor: 'Quimica', segmento: 'Petroquimica' },

  // ══════════ PAPEL E CELULOSE ══════════
  SUZB3: { setor: 'Papel/Celulose', segmento: 'Celulose' }, KLBN11: { setor: 'Papel/Celulose', segmento: 'Celulose' },
  KLBN3: { setor: 'Papel/Celulose', segmento: 'Celulose' }, KLBN4: { setor: 'Papel/Celulose', segmento: 'Celulose' },

  // ══════════ TRANSPORTE ══════════
  CCRO3: { setor: 'Transporte', segmento: 'Concessoes' }, ECOR3: { setor: 'Transporte', segmento: 'Concessoes' },
  AZUL4: { setor: 'Transporte', segmento: 'Aereo' }, GOLL4: { setor: 'Transporte', segmento: 'Aereo' },
  RAIL3: { setor: 'Transporte', segmento: 'Ferroviario' }, STBP3: { setor: 'Transporte', segmento: 'Portos' },
  LOGN3: { setor: 'Transporte', segmento: 'Portos' }, HBSA3: { setor: 'Transporte', segmento: 'Portos' },
  TPIS3: { setor: 'Transporte', segmento: 'Pedagio' },

  // ══════════ CONSTRUCAO ══════════
  CYRE3: { setor: 'Construcao', segmento: 'Incorporacao' }, EZTC3: { setor: 'Construcao', segmento: 'Incorporacao' },
  MRVE3: { setor: 'Construcao', segmento: 'Incorporacao' }, TRIS3: { setor: 'Construcao', segmento: 'Incorporacao' },
  DIRR3: { setor: 'Construcao', segmento: 'Incorporacao' }, EVEN3: { setor: 'Construcao', segmento: 'Incorporacao' },
  TEND3: { setor: 'Construcao', segmento: 'Incorporacao' }, MDNE3: { setor: 'Construcao', segmento: 'Incorporacao' },
  PLPL3: { setor: 'Construcao', segmento: 'Incorporacao' }, JHSF3: { setor: 'Construcao', segmento: 'Incorporacao' },
  LAVV3: { setor: 'Construcao', segmento: 'Incorporacao' }, CURY3: { setor: 'Construcao', segmento: 'Incorporacao' },
  MELK3: { setor: 'Construcao', segmento: 'Incorporacao' }, HBOR3: { setor: 'Construcao', segmento: 'Incorporacao' },
  GFSA3: { setor: 'Construcao', segmento: 'Incorporacao' },
  // Engenharia
  ALSO3: { setor: 'Construcao', segmento: 'Engenharia' },

  // ══════════ SANEAMENTO ══════════
  SBSP3: { setor: 'Saneamento', segmento: 'Saneamento' }, SAPR11: { setor: 'Saneamento', segmento: 'Saneamento' },
  SAPR4: { setor: 'Saneamento', segmento: 'Saneamento' }, SAPR3: { setor: 'Saneamento', segmento: 'Saneamento' },
  CSMG3: { setor: 'Saneamento', segmento: 'Saneamento' },

  // ══════════ EDUCACAO ══════════
  COGN3: { setor: 'Educacao', segmento: 'Educacao' }, YDUQ3: { setor: 'Educacao', segmento: 'Educacao' },
  SEER3: { setor: 'Educacao', segmento: 'Educacao' }, ANIM3: { setor: 'Educacao', segmento: 'Educacao' },
  CSED3: { setor: 'Educacao', segmento: 'Educacao' },

  // ══════════ MIDIA / ENTRETENIMENTO ══════════
  RECV3: { setor: 'Petróleo', segmento: 'Junior Oils' },
  CVCB3: { setor: 'Turismo', segmento: 'Turismo' },
  SMFT3: { setor: 'Turismo', segmento: 'Turismo' },

  // ══════════ IMOBILIARIO (NAO FII) ══════════
  BRPR3: { setor: 'Imobiliario', segmento: 'Escritorios' },
  SCAR3: { setor: 'Imobiliario', segmento: 'Shoppings' },
  LOGG3: { setor: 'Imobiliario', segmento: 'Logistica' },

  // ══════════ SEGURANCA / DEFESA ══════════
  NGRD3: { setor: 'Tecnologia', segmento: 'Seguranca' },

  // ══════════ FIIs — TIJOLO (LOGISTICA / GALPOES) ══════════
  HGLG11: { setor: 'Logistica', segmento: 'Galpoes' }, XPLG11: { setor: 'Logistica', segmento: 'Galpoes' },
  BTLG11: { setor: 'Logistica', segmento: 'Galpoes' }, GGRC11: { setor: 'Logistica', segmento: 'Galpoes' },
  LVBI11: { setor: 'Logistica', segmento: 'Galpoes' }, VILG11: { setor: 'Logistica', segmento: 'Galpoes' },
  BRCO11: { setor: 'Logistica', segmento: 'Galpoes' }, GALG11: { setor: 'Logistica', segmento: 'Galpoes' },
  SDIL11: { setor: 'Logistica', segmento: 'Galpoes' }, GLOG11: { setor: 'Logistica', segmento: 'Galpoes' },
  XPIN11: { setor: 'Logistica', segmento: 'Galpoes' }, EURO11: { setor: 'Logistica', segmento: 'Galpoes' },
  PLOG11: { setor: 'Logistica', segmento: 'Galpoes' }, RVBI11: { setor: 'Logistica', segmento: 'Galpoes' },
  LGCP11: { setor: 'Logistica', segmento: 'Galpoes' }, VTLT11: { setor: 'Logistica', segmento: 'Galpoes' },

  // FIIs — TIJOLO (LAJES CORPORATIVAS / ESCRITORIOS)
  HGRE11: { setor: 'Lajes Corp.', segmento: 'Escritorios' },
  BRCR11: { setor: 'Lajes Corp.', segmento: 'Escritorios' }, PVBI11: { setor: 'Lajes Corp.', segmento: 'Escritorios' },
  VINO11: { setor: 'Lajes Corp.', segmento: 'Escritorios' }, RBRP11: { setor: 'Lajes Corp.', segmento: 'Escritorios' },
  RECT11: { setor: 'Lajes Corp.', segmento: 'Escritorios' }, TEPP11: { setor: 'Lajes Corp.', segmento: 'Escritorios' },
  JSRE11: { setor: 'Lajes Corp.', segmento: 'Escritorios' }, GTWR11: { setor: 'Lajes Corp.', segmento: 'Escritorios' },
  NEWL11: { setor: 'Lajes Corp.', segmento: 'Escritorios' }, PATL11: { setor: 'Lajes Corp.', segmento: 'Escritorios' },
  SARE11: { setor: 'Lajes Corp.', segmento: 'Escritorios' }, BREV11: { setor: 'Lajes Corp.', segmento: 'Escritorios' },
  XPPR11: { setor: 'Lajes Corp.', segmento: 'Escritorios' },

  // FIIs — TIJOLO (SHOPPINGS)
  XPML11: { setor: 'Shopping', segmento: 'Shopping' }, VISC11: { setor: 'Shopping', segmento: 'Shopping' },
  HSML11: { setor: 'Shopping', segmento: 'Shopping' }, HGBS11: { setor: 'Shopping', segmento: 'Shopping' },
  MALL11: { setor: 'Shopping', segmento: 'Shopping' }, FIGS11: { setor: 'Shopping', segmento: 'Shopping' },
  JRDM11: { setor: 'Shopping', segmento: 'Shopping' }, PQDP11: { setor: 'Shopping', segmento: 'Shopping' },
  ABCP11: { setor: 'Shopping', segmento: 'Shopping' }, SHOP11: { setor: 'Shopping', segmento: 'Shopping' },
  FLMA11: { setor: 'Shopping', segmento: 'Shopping' },

  // FIIs — TIJOLO (RENDA URBANA / VAREJO)
  TRXF11: { setor: 'Renda Urbana', segmento: 'Renda Urbana' }, HGRU11: { setor: 'Renda Urbana', segmento: 'Renda Urbana' },
  RBVA11: { setor: 'Renda Urbana', segmento: 'Renda Urbana' }, NSLU11: { setor: 'Renda Urbana', segmento: 'Renda Urbana' },
  ALZR11: { setor: 'Renda Urbana', segmento: 'Renda Urbana' }, BPML11: { setor: 'Renda Urbana', segmento: 'Renda Urbana' },
  OUJP11: { setor: 'Renda Urbana', segmento: 'Renda Urbana' }, CACR11: { setor: 'Renda Urbana', segmento: 'Renda Urbana' },
  GARE11: { setor: 'Renda Urbana', segmento: 'Renda Urbana' }, VGIP11: { setor: 'Renda Urbana', segmento: 'Renda Urbana' },

  // FIIs — TIJOLO (HOSPITAIS / EDUCACAO)
  NSLU11: { setor: 'Renda Urbana', segmento: 'Hospitais' },
  HCTR11: { setor: 'Renda Urbana', segmento: 'Hospitais' },
  FCFL11: { setor: 'Renda Urbana', segmento: 'Educacao' },

  // FIIs — TIJOLO (AGRO)
  XPCA11: { setor: 'Agro', segmento: 'Agro' }, KNCA11: { setor: 'Agro', segmento: 'Agro' },
  RZTR11: { setor: 'Agro', segmento: 'Agro' }, BTAL11: { setor: 'Agro', segmento: 'Agro' },
  RURA11: { setor: 'Agro', segmento: 'Agro' }, TGAR11: { setor: 'Agro', segmento: 'Agro' },
  RZAG11: { setor: 'Agro', segmento: 'Agro' }, VGIA11: { setor: 'Agro', segmento: 'Agro' },
  NCRA11: { setor: 'Agro', segmento: 'Agro' }, FGAA11: { setor: 'Agro', segmento: 'Agro' },

  // FIIs — TIJOLO (RESIDENCIAL)
  MFII11: { setor: 'Residencial', segmento: 'Residencial' }, RBDS11: { setor: 'Residencial', segmento: 'Residencial' },
  URPR11: { setor: 'Residencial', segmento: 'Residencial' }, LUGG11: { setor: 'Residencial', segmento: 'Residencial' },

  // FIIs — TIJOLO (HOTEL)
  HTMX11: { setor: 'Hotel', segmento: 'Hotel' }, XPHT11: { setor: 'Hotel', segmento: 'Hotel' },

  // FIIs — PAPEL (CRI / RECEBIVEIS)
  KNCR11: { setor: 'Papel/CRI', segmento: 'Recebiveis' }, KNIP11: { setor: 'Papel/CRI', segmento: 'Recebiveis' },
  MXRF11: { setor: 'Papel/CRI', segmento: 'Recebiveis' }, IRDM11: { setor: 'Papel/CRI', segmento: 'Recebiveis' },
  RECR11: { setor: 'Papel/CRI', segmento: 'Recebiveis' }, RBRR11: { setor: 'Papel/CRI', segmento: 'Recebiveis' },
  VGIR11: { setor: 'Papel/CRI', segmento: 'Recebiveis' }, CPTS11: { setor: 'Papel/CRI', segmento: 'Recebiveis' },
  VRTA11: { setor: 'Papel/CRI', segmento: 'Recebiveis' }, HABT11: { setor: 'Papel/CRI', segmento: 'Recebiveis' },
  DEVA11: { setor: 'Papel/CRI', segmento: 'Recebiveis' }, AFHI11: { setor: 'Papel/CRI', segmento: 'Recebiveis' },
  SNCI11: { setor: 'Papel/CRI', segmento: 'Recebiveis' }, HGCR11: { setor: 'Papel/CRI', segmento: 'Recebiveis' },
  RBRY11: { setor: 'Papel/CRI', segmento: 'Recebiveis' }, XPCI11: { setor: 'Papel/CRI', segmento: 'Recebiveis' },
  PLCR11: { setor: 'Papel/CRI', segmento: 'Recebiveis' }, CVBI11: { setor: 'Papel/CRI', segmento: 'Recebiveis' },
  NCHB11: { setor: 'Papel/CRI', segmento: 'Recebiveis' }, RZAK11: { setor: 'Papel/CRI', segmento: 'Recebiveis' },
  MCCI11: { setor: 'Papel/CRI', segmento: 'Recebiveis' }, TORD11: { setor: 'Papel/CRI', segmento: 'Recebiveis' },
  VCJR11: { setor: 'Papel/CRI', segmento: 'Recebiveis' }, ARRI11: { setor: 'Papel/CRI', segmento: 'Recebiveis' },
  BTCI11: { setor: 'Papel/CRI', segmento: 'Recebiveis' }, VGHF11: { setor: 'Papel/CRI', segmento: 'Recebiveis' },
  KCRE11: { setor: 'Papel/CRI', segmento: 'Recebiveis' }, KNHY11: { setor: 'Papel/CRI', segmento: 'Recebiveis' },
  KNSC11: { setor: 'Papel/CRI', segmento: 'Recebiveis' }, PORD11: { setor: 'Papel/CRI', segmento: 'Recebiveis' },
  RBHG11: { setor: 'Papel/CRI', segmento: 'Recebiveis' }, SPXS11: { setor: 'Papel/CRI', segmento: 'Recebiveis' },
  VGIP11: { setor: 'Papel/CRI', segmento: 'Recebiveis' }, MORC11: { setor: 'Papel/CRI', segmento: 'Recebiveis' },

  // FIIs — HIBRIDO (FUNDO DE FUNDOS)
  RBRF11: { setor: 'Fundo de Fundos', segmento: 'FoF' }, BCFF11: { setor: 'Fundo de Fundos', segmento: 'FoF' },
  HFOF11: { setor: 'Fundo de Fundos', segmento: 'FoF' }, MGFF11: { setor: 'Fundo de Fundos', segmento: 'FoF' },
  KFOF11: { setor: 'Fundo de Fundos', segmento: 'FoF' }, CXRI11: { setor: 'Fundo de Fundos', segmento: 'FoF' },
  BCIA11: { setor: 'Fundo de Fundos', segmento: 'FoF' }, BLMG11: { setor: 'Fundo de Fundos', segmento: 'FoF' },

  // FIIs — HIBRIDO (MULTISTRATEGIA)
  KNRI11: { setor: 'Hibrido', segmento: 'Multistrategia' }, JSAF11: { setor: 'Hibrido', segmento: 'Multistrategia' },
  RBED11: { setor: 'Hibrido', segmento: 'Multistrategia' }, SADI11: { setor: 'Hibrido', segmento: 'Multistrategia' },
  HGFF11: { setor: 'Hibrido', segmento: 'Multistrategia' }, BARI11: { setor: 'Hibrido', segmento: 'Multistrategia' },
  BPFF11: { setor: 'Hibrido', segmento: 'Multistrategia' }, CXAG11: { setor: 'Hibrido', segmento: 'Multistrategia' },
  MGHT11: { setor: 'Hibrido', segmento: 'Multistrategia' }, RELG11: { setor: 'Hibrido', segmento: 'Multistrategia' },

  // FIIs — DESENVOLVIMENTO
  TORD11: { setor: 'Desenvolvimento', segmento: 'Desenvolvimento' },
  RBDS11: { setor: 'Desenvolvimento', segmento: 'Desenvolvimento' },

  // ══════════ ETFs — IBOVESPA / AMPLO BRASIL ══════════
  BOVA11: { setor: 'Ibovespa', segmento: 'Ibovespa' },
  BOVV11: { setor: 'Ibovespa', segmento: 'Ibovespa' },
  BOVB11: { setor: 'Ibovespa', segmento: 'Ibovespa' },
  BOVX11: { setor: 'Ibovespa', segmento: 'Ibovespa' },
  BBOV11: { setor: 'Ibovespa', segmento: 'Ibovespa' },
  IBOB11: { setor: 'Ibovespa', segmento: 'Ibovespa' },
  PIBB11: { setor: 'Ibovespa', segmento: 'IBrX-50' },
  BRAX11: { setor: 'Ibovespa', segmento: 'IBrX-100' },
  XBOV11: { setor: 'Ibovespa', segmento: 'Ibovespa' },

  // ETFs — SMALL CAPS
  SMAL11: { setor: 'Small Caps', segmento: 'Small Caps BR' },
  SMAC11: { setor: 'Small Caps', segmento: 'Small Caps BR' },
  SMAB11: { setor: 'Small Caps', segmento: 'Small Caps BR' },
  TRIG11: { setor: 'Small Caps', segmento: 'Small Caps BR' },

  // ETFs — DIVIDENDOS / VALOR
  DIVO11: { setor: 'Dividendos', segmento: 'Dividendos BR' },
  BBSD11: { setor: 'Dividendos', segmento: 'Dividendos BR' },
  NDIV11: { setor: 'Dividendos', segmento: 'Dividendos BR' },
  IDIV11: { setor: 'Dividendos', segmento: 'Dividendos BR' },
  DIVS11: { setor: 'Dividendos', segmento: 'Dividendos BR' },

  // ETFs — INTERNACIONAL (S&P 500)
  IVVB11: { setor: 'Internacional', segmento: 'S&P 500' },
  SPXI11: { setor: 'Internacional', segmento: 'S&P 500' },
  SPXB11: { setor: 'Internacional', segmento: 'S&P 500' },
  BIVB39: { setor: 'Internacional', segmento: 'S&P 500' },

  // ETFs — INTERNACIONAL (NASDAQ / TECH)
  NASD11: { setor: 'Internacional', segmento: 'Nasdaq' },
  QQQM11: { setor: 'Internacional', segmento: 'Nasdaq' },
  QQQI11: { setor: 'Internacional', segmento: 'Nasdaq' },

  // ETFs — INTERNACIONAL (EUROPA / ASIA / GLOBAL)
  EURP11: { setor: 'Internacional', segmento: 'Europa' },
  XINA11: { setor: 'Internacional', segmento: 'China' },
  ACWI11: { setor: 'Internacional', segmento: 'Global' },
  WRLD11: { setor: 'Internacional', segmento: 'Global' },
  EMEG11: { setor: 'Internacional', segmento: 'Emergentes' },
  JPON11: { setor: 'Internacional', segmento: 'Japao' },
  ASIA11: { setor: 'Internacional', segmento: 'Asia' },

  // ETFs — CRIPTO
  HASH11: { setor: 'Cripto', segmento: 'Multi-cripto' },
  ETHE11: { setor: 'Cripto', segmento: 'Ethereum' },
  QBTC11: { setor: 'Cripto', segmento: 'Bitcoin' },
  BITH11: { setor: 'Cripto', segmento: 'Bitcoin' },
  DEFI11: { setor: 'Cripto', segmento: 'DeFi' },
  NFTS11: { setor: 'Cripto', segmento: 'NFT/Meta' },
  WEB311: { setor: 'Cripto', segmento: 'Web3' },
  QDFI11: { setor: 'Cripto', segmento: 'DeFi' },
  META11: { setor: 'Cripto', segmento: 'Metaverso' },
  CRPT11: { setor: 'Cripto', segmento: 'Multi-cripto' },
  BITI11: { setor: 'Cripto', segmento: 'Bitcoin' },
  QETH11: { setor: 'Cripto', segmento: 'Ethereum' },
  BLOK11: { setor: 'Cripto', segmento: 'Blockchain' },

  // ETFs — RENDA FIXA
  IMAB11: { setor: 'Renda Fixa', segmento: 'IMA-B' },
  IMBB11: { setor: 'Renda Fixa', segmento: 'IMA-B' },
  IB5M11: { setor: 'Renda Fixa', segmento: 'IMA-B 5+' },
  B5P211: { setor: 'Renda Fixa', segmento: 'IMA-B 5+' },
  B5MB11: { setor: 'Renda Fixa', segmento: 'IMA-B 5+' },
  IRFM11: { setor: 'Renda Fixa', segmento: 'IRF-M' },
  FIXA11: { setor: 'Renda Fixa', segmento: 'Pre-fixado' },
  NTNS11: { setor: 'Renda Fixa', segmento: 'Tesouro' },
  LFTS11: { setor: 'Renda Fixa', segmento: 'Tesouro Selic' },
  LFTB11: { setor: 'Renda Fixa', segmento: 'Tesouro Selic' },
  CPTI11: { setor: 'Renda Fixa', segmento: 'Credito Privado' },
  KDIF11: { setor: 'Renda Fixa', segmento: 'Infra Debentures' },
  JURO11: { setor: 'Renda Fixa', segmento: 'Juros Reais' },
  IPCA11: { setor: 'Renda Fixa', segmento: 'IPCA+' },

  // ETFs — SETORIAL BRASIL
  FIND11: { setor: 'Setorial', segmento: 'Financeiro' },
  MATB11: { setor: 'Setorial', segmento: 'Materiais' },
  GOVE11: { setor: 'Setorial', segmento: 'Governanca' },
  TECK11: { setor: 'Setorial', segmento: 'Tecnologia' },
  ISUS11: { setor: 'Setorial', segmento: 'Sustentabilidade' },
  ECOO11: { setor: 'Setorial', segmento: 'Carbono' },
  UTIP11: { setor: 'Setorial', segmento: 'Utilities' },
  SHOT11: { setor: 'Setorial', segmento: 'Consumo' },
  AGRX11: { setor: 'Setorial', segmento: 'Agronegocio' },

  // ETFs — ESTRATEGIA / SMART BETA
  GOLD11: { setor: 'Commodities', segmento: 'Ouro' },
  QINC11: { setor: 'Renda', segmento: 'Income' },
  YDRO11: { setor: 'Tematico', segmento: 'Hidrogenio' },
  CHIP11: { setor: 'Tematico', segmento: 'Semicondutores' },
  GENB11: { setor: 'Tematico', segmento: 'Genomica' },
  MILL11: { setor: 'Tematico', segmento: 'Millennials' },
  NAJA11: { setor: 'Tematico', segmento: 'Gaming' },
  FOOD11: { setor: 'Tematico', segmento: 'Agri-food' },
  HTEK11: { setor: 'Tematico', segmento: 'Health Tech' },
  REVE11: { setor: 'Tematico', segmento: 'Revenue' },
  USAL11: { setor: 'Internacional', segmento: 'US Value' },
  USDB11: { setor: 'Internacional', segmento: 'US Bonds' },
  BNDX11: { setor: 'Internacional', segmento: 'Global Bonds' },

  // ══════════ STOCKS INTERNACIONAIS ══════════
  // Tech / FAANG+
  AAPL: { setor: 'Tecnologia', segmento: 'Big Tech' }, MSFT: { setor: 'Tecnologia', segmento: 'Big Tech' },
  GOOGL: { setor: 'Tecnologia', segmento: 'Big Tech' }, GOOG: { setor: 'Tecnologia', segmento: 'Big Tech' },
  AMZN: { setor: 'Tecnologia', segmento: 'Big Tech' }, META: { setor: 'Tecnologia', segmento: 'Big Tech' },
  NVDA: { setor: 'Tecnologia', segmento: 'Semicondutores' }, TSM: { setor: 'Tecnologia', segmento: 'Semicondutores' },
  AVGO: { setor: 'Tecnologia', segmento: 'Semicondutores' }, AMD: { setor: 'Tecnologia', segmento: 'Semicondutores' },
  INTC: { setor: 'Tecnologia', segmento: 'Semicondutores' }, QCOM: { setor: 'Tecnologia', segmento: 'Semicondutores' },
  TSLA: { setor: 'Tecnologia', segmento: 'EV / Energia' }, NFLX: { setor: 'Tecnologia', segmento: 'Streaming' },
  CRM: { setor: 'Tecnologia', segmento: 'Cloud / SaaS' }, ORCL: { setor: 'Tecnologia', segmento: 'Cloud / SaaS' },
  ADBE: { setor: 'Tecnologia', segmento: 'Software' }, SNOW: { setor: 'Tecnologia', segmento: 'Cloud / SaaS' },
  PLTR: { setor: 'Tecnologia', segmento: 'IA / Data' }, AI: { setor: 'Tecnologia', segmento: 'IA / Data' },
  UBER: { setor: 'Tecnologia', segmento: 'Mobilidade' }, SHOP: { setor: 'Tecnologia', segmento: 'E-commerce' },
  SQ: { setor: 'Tecnologia', segmento: 'Fintech' }, PYPL: { setor: 'Tecnologia', segmento: 'Fintech' },
  COIN: { setor: 'Tecnologia', segmento: 'Cripto' }, MSTR: { setor: 'Tecnologia', segmento: 'Cripto' },
  // Financeiro
  JPM: { setor: 'Financeiro', segmento: 'Bancos' }, BAC: { setor: 'Financeiro', segmento: 'Bancos' },
  GS: { setor: 'Financeiro', segmento: 'Investimentos' }, MS: { setor: 'Financeiro', segmento: 'Investimentos' },
  WFC: { setor: 'Financeiro', segmento: 'Bancos' }, C: { setor: 'Financeiro', segmento: 'Bancos' },
  V: { setor: 'Financeiro', segmento: 'Pagamentos' }, MA: { setor: 'Financeiro', segmento: 'Pagamentos' },
  BRK_B: { setor: 'Financeiro', segmento: 'Holding' }, SCHW: { setor: 'Financeiro', segmento: 'Corretora' },
  // Saude / Pharma
  JNJ: { setor: 'Saude', segmento: 'Farmaceutica' }, UNH: { setor: 'Saude', segmento: 'Planos' },
  PFE: { setor: 'Saude', segmento: 'Farmaceutica' }, ABBV: { setor: 'Saude', segmento: 'Farmaceutica' },
  LLY: { setor: 'Saude', segmento: 'Farmaceutica' }, MRK: { setor: 'Saude', segmento: 'Farmaceutica' },
  NVO: { setor: 'Saude', segmento: 'Farmaceutica' }, TMO: { setor: 'Saude', segmento: 'Equipamentos' },
  // Consumo
  KO: { setor: 'Consumo', segmento: 'Bebidas' }, PEP: { setor: 'Consumo', segmento: 'Bebidas' },
  PG: { setor: 'Consumo', segmento: 'Higiene' }, WMT: { setor: 'Consumo', segmento: 'Varejo' },
  COST: { setor: 'Consumo', segmento: 'Varejo' }, MCD: { setor: 'Consumo', segmento: 'Fast Food' },
  NKE: { setor: 'Consumo', segmento: 'Moda' }, SBUX: { setor: 'Consumo', segmento: 'Bebidas' },
  DIS: { setor: 'Consumo', segmento: 'Entretenimento' },
  // Energia
  XOM: { setor: 'Energia', segmento: 'Petroleo' }, CVX: { setor: 'Energia', segmento: 'Petroleo' },
  COP: { setor: 'Energia', segmento: 'Petroleo' }, NEE: { setor: 'Energia', segmento: 'Renovavel' },
  // Industrial
  BA: { setor: 'Industria', segmento: 'Aeroespacial' }, CAT: { setor: 'Industria', segmento: 'Maquinas' },
  DE: { setor: 'Industria', segmento: 'Agro Maquinas' }, HON: { setor: 'Industria', segmento: 'Diversificada' },
  GE: { setor: 'Industria', segmento: 'Diversificada' }, LMT: { setor: 'Industria', segmento: 'Defesa' },
  // Telecom / Media
  T: { setor: 'Telecom', segmento: 'Telecom' }, VZ: { setor: 'Telecom', segmento: 'Telecom' },
  CMCSA: { setor: 'Telecom', segmento: 'Media' },
  // Commodities / Mineracao
  BHP: { setor: 'Mineracao', segmento: 'Mineracao' }, RIO: { setor: 'Mineracao', segmento: 'Mineracao' },
  FCX: { setor: 'Mineracao', segmento: 'Cobre' }, NEM: { setor: 'Mineracao', segmento: 'Ouro' },

  // ══════════ ETFs INTERNACIONAIS (mercado INT) ══════════
  SPY: { setor: 'Indices', segmento: 'S&P 500' }, VOO: { setor: 'Indices', segmento: 'S&P 500' },
  IVV: { setor: 'Indices', segmento: 'S&P 500' }, QQQ: { setor: 'Indices', segmento: 'Nasdaq 100' },
  DIA: { setor: 'Indices', segmento: 'Dow Jones' }, IWM: { setor: 'Indices', segmento: 'Russell 2000' },
  VTI: { setor: 'Indices', segmento: 'US Total Market' }, VT: { setor: 'Indices', segmento: 'Global' },
  VXUS: { setor: 'Indices', segmento: 'Ex-US' }, EEM: { setor: 'Indices', segmento: 'Emergentes' },
  VWO: { setor: 'Indices', segmento: 'Emergentes' }, EFA: { setor: 'Indices', segmento: 'Desenvolvidos' },
  VEA: { setor: 'Indices', segmento: 'Desenvolvidos' }, IEMG: { setor: 'Indices', segmento: 'Emergentes' },
  // ETFs Setoriais INT
  XLK: { setor: 'Setorial', segmento: 'Tecnologia' }, XLF: { setor: 'Setorial', segmento: 'Financeiro' },
  XLE: { setor: 'Setorial', segmento: 'Energia' }, XLV: { setor: 'Setorial', segmento: 'Saude' },
  XLI: { setor: 'Setorial', segmento: 'Industrial' }, XLP: { setor: 'Setorial', segmento: 'Consumo' },
  XLY: { setor: 'Setorial', segmento: 'Consumo Disc.' }, XLU: { setor: 'Setorial', segmento: 'Utilities' },
  SOXX: { setor: 'Setorial', segmento: 'Semicondutores' }, SMH: { setor: 'Setorial', segmento: 'Semicondutores' },
  ARKK: { setor: 'Tematico', segmento: 'Inovacao' }, ARKG: { setor: 'Tematico', segmento: 'Genomica' },
  // ETFs RF INT
  BND: { setor: 'Renda Fixa', segmento: 'US Bonds' }, AGG: { setor: 'Renda Fixa', segmento: 'US Bonds' },
  TLT: { setor: 'Renda Fixa', segmento: 'US Treasuries 20+' }, SHY: { setor: 'Renda Fixa', segmento: 'US Treasuries 1-3' },
  LQD: { setor: 'Renda Fixa', segmento: 'Corp Bonds' }, HYG: { setor: 'Renda Fixa', segmento: 'High Yield' },
  BNDX: { setor: 'Renda Fixa', segmento: 'Global Bonds' },
  // ETFs Commodities INT
  GLD: { setor: 'Commodities', segmento: 'Ouro' }, IAU: { setor: 'Commodities', segmento: 'Ouro' },
  SLV: { setor: 'Commodities', segmento: 'Prata' }, USO: { setor: 'Commodities', segmento: 'Petroleo' },
  // ETFs Dividendos INT
  VYM: { setor: 'Dividendos', segmento: 'US Dividendos' }, SCHD: { setor: 'Dividendos', segmento: 'US Dividendos' },
  DVY: { setor: 'Dividendos', segmento: 'US Dividendos' }, HDV: { setor: 'Dividendos', segmento: 'US Dividendos' },
  // ETFs Cripto INT
  IBIT: { setor: 'Cripto', segmento: 'Bitcoin' }, FBTC: { setor: 'Cripto', segmento: 'Bitcoin' },
  GBTC: { setor: 'Cripto', segmento: 'Bitcoin' }, ETHA: { setor: 'Cripto', segmento: 'Ethereum' },
  // ETFs REIT
  VNQ: { setor: 'REITs', segmento: 'US REITs' }, VNQI: { setor: 'REITs', segmento: 'Global REITs' },

  // ══════════ REITs ══════════
  O: { setor: 'REITs', segmento: 'Net Lease' }, AMT: { setor: 'REITs', segmento: 'Torres' },
  PLD: { setor: 'REITs', segmento: 'Logistica' }, CCI: { setor: 'REITs', segmento: 'Torres' },
  EQIX: { setor: 'REITs', segmento: 'Data Centers' }, DLR: { setor: 'REITs', segmento: 'Data Centers' },
  SPG: { setor: 'REITs', segmento: 'Shoppings' }, PSA: { setor: 'REITs', segmento: 'Self Storage' },
  WELL: { setor: 'REITs', segmento: 'Healthcare' }, AVB: { setor: 'REITs', segmento: 'Residencial' },
  EQR: { setor: 'REITs', segmento: 'Residencial' }, VICI: { setor: 'REITs', segmento: 'Cassinos' },
  WPC: { setor: 'REITs', segmento: 'Net Lease' }, NNN: { setor: 'REITs', segmento: 'Net Lease' },
  STAG: { setor: 'REITs', segmento: 'Industrial' }, MPW: { setor: 'REITs', segmento: 'Healthcare' },
  IRM: { setor: 'REITs', segmento: 'Data/Storage' },

  // ══════════ BDRs POPULARES ══════════
  AAPL34: { setor: 'Tecnologia', segmento: 'Big Tech' }, MSFT34: { setor: 'Tecnologia', segmento: 'Big Tech' },
  GOGL34: { setor: 'Tecnologia', segmento: 'Big Tech' }, AMZO34: { setor: 'Tecnologia', segmento: 'Big Tech' },
  FBOK34: { setor: 'Tecnologia', segmento: 'Big Tech' }, M1TA34: { setor: 'Tecnologia', segmento: 'Big Tech' },
  NVDC34: { setor: 'Tecnologia', segmento: 'Semicondutores' }, TSLA34: { setor: 'Tecnologia', segmento: 'EV / Energia' },
  NFLX34: { setor: 'Tecnologia', segmento: 'Streaming' }, DISB34: { setor: 'Consumo', segmento: 'Entretenimento' },
  JPMC34: { setor: 'Financeiro', segmento: 'Bancos' }, BOAC34: { setor: 'Financeiro', segmento: 'Bancos' },
  GSGI34: { setor: 'Financeiro', segmento: 'Investimentos' }, BERK34: { setor: 'Financeiro', segmento: 'Holding' },
  VISA34: { setor: 'Financeiro', segmento: 'Pagamentos' }, MSCD34: { setor: 'Financeiro', segmento: 'Pagamentos' },
  COCA34: { setor: 'Consumo', segmento: 'Bebidas' }, PEPB34: { setor: 'Consumo', segmento: 'Bebidas' },
  PGCO34: { setor: 'Consumo', segmento: 'Higiene' }, WALM34: { setor: 'Consumo', segmento: 'Varejo' },
  MCDC34: { setor: 'Consumo', segmento: 'Fast Food' }, NIKE34: { setor: 'Consumo', segmento: 'Moda' },
  JNJB34: { setor: 'Saude', segmento: 'Farmaceutica' }, LILY34: { setor: 'Saude', segmento: 'Farmaceutica' },
  PFIZ34: { setor: 'Saude', segmento: 'Farmaceutica' }, ABBV34: { setor: 'Saude', segmento: 'Farmaceutica' },
  EXXO34: { setor: 'Energia', segmento: 'Petroleo' }, CHVX34: { setor: 'Energia', segmento: 'Petroleo' },
  BABA34: { setor: 'Tecnologia', segmento: 'E-commerce' }, MELI34: { setor: 'Tecnologia', segmento: 'E-commerce' },
};

module.exports = { TICKER_SECTORS: TICKER_SECTORS };
