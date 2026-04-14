// Overrides manuais para casos onde brapi nao retorna sector adequado.

// Tipo de FII (Papel/Tijolo/Hibrido/FoF) — nao vem da brapi, precisa hardcoded.
// Cobertura foca nos FIIs mais populares da B3.
export const FII_TIPOS: Record<string, 'Papel' | 'Tijolo' | 'Hibrido' | 'FoF' | 'Agro'> = {
  // Papel (CRI/CRA/Recebiveis)
  MXRF11: 'Papel', KNCR11: 'Papel', KNSC11: 'Papel', BCRI11: 'Papel', RURA11: 'Agro',
  LFTB11: 'Papel', VGIP11: 'Papel', VGIR11: 'Papel', RECR11: 'Papel', IRDM11: 'Papel',
  HGCR11: 'Papel', RBRR11: 'Papel', VCJR11: 'Papel', HCTR11: 'Papel', OUJP11: 'Papel',
  CPTS11: 'Papel', CVBI11: 'Papel', FIIB11: 'Papel', VRTA11: 'Papel', BTCI11: 'Papel',
  PLCR11: 'Papel', HABT11: 'Papel', URPR11: 'Papel', VSLH11: 'Papel', DEVA11: 'Papel',

  // Tijolo (imoveis fisicos)
  HGLG11: 'Tijolo', KNRI11: 'Tijolo', XPML11: 'Tijolo', VISC11: 'Tijolo', MALL11: 'Tijolo',
  HGRE11: 'Tijolo', VINO11: 'Tijolo', PVBI11: 'Tijolo', XPLG11: 'Tijolo', BRCO11: 'Tijolo',
  GGRC11: 'Tijolo', LVBI11: 'Tijolo', RBRP11: 'Tijolo', ALZR11: 'Tijolo', JSRE11: 'Tijolo',
  BTLG11: 'Tijolo', HGBS11: 'Tijolo', HSML11: 'Tijolo', VILG11: 'Tijolo', XPPR11: 'Tijolo',
  HGPO11: 'Tijolo', VGHF11: 'Tijolo', BRLA11: 'Tijolo', BTHF11: 'Tijolo',

  // Hibrido (papel + tijolo)
  BBPO11: 'Hibrido', XPIN11: 'Hibrido', HGFF11: 'Hibrido', KISU11: 'Hibrido',
  RBED11: 'Hibrido', MFII11: 'Hibrido', RFOF11: 'Hibrido',

  // FoF (fundo de fundos)
  RBFF11: 'FoF', BCFF11: 'FoF', HFOF11: 'FoF', KFOF11: 'FoF', MGFF11: 'FoF',
  RBCB11: 'FoF',
};

// Fallback para tickers BR onde brapi nao retorna sector (small-caps principalmente).
// Mantido curto e ampliavel conforme necessidade.
export const STOCK_SECTOR_FALLBACK: Record<string, string> = {
  UNIP6: 'Materiais Basicos', UNIP3: 'Materiais Basicos', UNIP5: 'Materiais Basicos',
  SAPR4: 'Utilidade Publica', SAPR3: 'Utilidade Publica', SAPR11: 'Utilidade Publica',
  CGRA4: 'Consumo Ciclico', CGRA3: 'Consumo Ciclico',
  TASA4: 'Bens Industriais', TASA3: 'Bens Industriais',
  KEPL3: 'Bens Industriais',
  WIZC3: 'Servicos Financeiros',
  CSED3: 'Consumo Ciclico',
  ISAE4: 'Utilidade Publica',
  AXIA3: 'Tecnologia',
  ALOS3: 'Consumo Ciclico',
  EZTC3: 'Consumo Ciclico',
  SIMH3: 'Bens Industriais',
  TUPY3: 'Bens Industriais',
  EVEN3: 'Consumo Ciclico',
  CEAB3: 'Consumo Ciclico',
  DEXP3: 'Materiais Basicos',
  BRSR6: 'Servicos Financeiros',
  JALL3: 'Consumo Nao Ciclico',
  FLRY3: 'Saude',
  ODPV3: 'Saude',
  RANI3: 'Materiais Basicos',
  LOGG3: 'Exploracao de Imoveis',
  AGRO3: 'Consumo Nao Ciclico',
};

// Subtipo dos INT (Stocks, ETFs, ADR, REIT, Cripto)
export type IntTipo = 'Stock' | 'ETF' | 'ADR' | 'REIT' | 'Cripto';
export const INT_TIPOS: Record<string, IntTipo> = {
  // ETFs amplos / setoriais / internacionais
  SPY: 'ETF', VOO: 'ETF', IVV: 'ETF', QQQ: 'ETF', DIA: 'ETF', IWM: 'ETF',
  VTI: 'ETF', VXUS: 'ETF', SCHD: 'ETF', VYM: 'ETF', DGRO: 'ETF', VIG: 'ETF',
  XLK: 'ETF', XLF: 'ETF', XLE: 'ETF', XLV: 'ETF', XLI: 'ETF', XLP: 'ETF',
  XLY: 'ETF', XLRE: 'ETF', XLB: 'ETF', XLU: 'ETF', XLC: 'ETF',
  SMH: 'ETF', SOXX: 'ETF', ARKK: 'ETF', ARKG: 'ETF', ARKW: 'ETF',
  EWZ: 'ETF', EEM: 'ETF', VWO: 'ETF', IEMG: 'ETF',

  // Cripto ETFs / Trusts
  BITO: 'Cripto', IBIT: 'Cripto', FBTC: 'Cripto', BTF: 'Cripto', GBTC: 'Cripto',
  ETHE: 'Cripto', ETHA: 'Cripto', BITX: 'Cripto', BTCC: 'Cripto',

  // REITs (empresas imobiliarias listadas)
  O: 'REIT', STAG: 'REIT', VICI: 'REIT', AMT: 'REIT', PLD: 'REIT', EQIX: 'REIT',
  SPG: 'REIT', PSA: 'REIT', CCI: 'REIT', WELL: 'REIT', AVB: 'REIT', EQR: 'REIT',
  EXR: 'REIT', DLR: 'REIT', ARE: 'REIT', MAA: 'REIT', ESS: 'REIT', HST: 'REIT',
  EPR: 'REIT',

  // ADRs tipicas (empresas estrangeiras listadas na NYSE/NASDAQ)
  TSM: 'ADR', BABA: 'ADR', JD: 'ADR', NIO: 'ADR', PDD: 'ADR', TME: 'ADR',
  BP: 'ADR', SHEL: 'ADR', TTE: 'ADR', SONY: 'ADR', TM: 'ADR', HMC: 'ADR',
  SAP: 'ADR', ASML: 'ADR', NVO: 'ADR', AZN: 'ADR', GSK: 'ADR', DEO: 'ADR',
  UL: 'ADR', RIO: 'ADR', BHP: 'ADR', VALE: 'ADR', ITUB: 'ADR', BBD: 'ADR',
  ABEV: 'ADR', PBR: 'ADR', GGB: 'ADR', SBS: 'ADR',
  // Stocks americanos principais (tudo que nao eh ETF/REIT/ADR)
  AAPL: 'Stock', MSFT: 'Stock', GOOG: 'Stock', GOOGL: 'Stock', AMZN: 'Stock',
  META: 'Stock', TSLA: 'Stock', NVDA: 'Stock', NFLX: 'Stock', DIS: 'Stock',
  'BRK-A': 'Stock', 'BRK-B': 'Stock', JPM: 'Stock', V: 'Stock', MA: 'Stock',
  JNJ: 'Stock', PG: 'Stock', KO: 'Stock', PEP: 'Stock', WMT: 'Stock',
  HD: 'Stock', MCD: 'Stock', NKE: 'Stock', SBUX: 'Stock', CRM: 'Stock',
  AMD: 'Stock', INTC: 'Stock', ORCL: 'Stock', CSCO: 'Stock', IBM: 'Stock',
  PYPL: 'Stock', SQ: 'Stock', SHOP: 'Stock', UBER: 'Stock', ABNB: 'Stock',
};

// Setor de INT (quando nao vem da brapi/yahoo). Alinhado com sectors GICS em portugues.
export const INT_SECTOR_FALLBACK: Record<string, string> = {
  // Berkshire Hathaway = Conglomerado / Financeiro
  'BRK-A': 'Financeiro INT', 'BRK-B': 'Financeiro INT',
  // Big Tech
  AAPL: 'Tecnologia INT', MSFT: 'Tecnologia INT', GOOG: 'Tecnologia INT',
  GOOGL: 'Tecnologia INT', META: 'Tecnologia INT', AMZN: 'Consumo INT',
  NVDA: 'Tecnologia INT', AMD: 'Tecnologia INT', INTC: 'Tecnologia INT',
  ORCL: 'Tecnologia INT', CRM: 'Tecnologia INT', CSCO: 'Tecnologia INT',
  IBM: 'Tecnologia INT', ASML: 'Tecnologia INT', TSM: 'Tecnologia INT',
  // Autos / EV
  TSLA: 'Automotivo INT', NIO: 'Automotivo INT', TM: 'Automotivo INT',
  HMC: 'Automotivo INT',
  // Financeiro
  JPM: 'Financeiro INT', V: 'Financeiro INT', MA: 'Financeiro INT',
  PYPL: 'Financeiro INT', SQ: 'Financeiro INT',
  // Consumo
  WMT: 'Consumo INT', HD: 'Consumo INT', MCD: 'Consumo INT', NKE: 'Consumo INT',
  SBUX: 'Consumo INT', DIS: 'Consumo INT', KO: 'Consumo INT', PEP: 'Consumo INT',
  PG: 'Consumo INT',
  // Saude
  JNJ: 'Saude INT', NVO: 'Saude INT', AZN: 'Saude INT', GSK: 'Saude INT',
  // Energia
  PBR: 'Energia INT', BP: 'Energia INT', SHEL: 'Energia INT', TTE: 'Energia INT',
  // Materiais
  RIO: 'Materiais INT', BHP: 'Materiais INT', VALE: 'Materiais INT',
  // Streaming/Tech services
  NFLX: 'Tecnologia INT', SHOP: 'Tecnologia INT', UBER: 'Tecnologia INT',
  ABNB: 'Tecnologia INT',
};

export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function resolveIntSubcategoria(ticker: string): string {
  const t = (ticker || '').toUpperCase();
  const tipo = INT_TIPOS[t];
  if (tipo) return 'INT ' + tipo;
  return 'INT Stock'; // default
}

export function resolveSector(opts: {
  ticker: string;
  categoria: string;
  sector?: string;
  industry?: string;
}): string {
  const t = (opts.ticker || '').toUpperCase();

  // FIIs: usar tipo Papel/Tijolo/Hibrido/FoF/Agro
  if (opts.categoria === 'fii') {
    const tipo = FII_TIPOS[t];
    return tipo ? 'FII ' + tipo : 'FII Outros';
  }

  // INT: setor especifico ou fallback por sub-tipo
  if (opts.categoria === 'stock_int') {
    if (INT_SECTOR_FALLBACK[t]) return INT_SECTOR_FALLBACK[t];
    if (opts.sector) return normalize(opts.sector) + ' INT';
    const tipo = INT_TIPOS[t];
    if (tipo === 'ETF') return 'ETF INT';
    if (tipo === 'Cripto') return 'Cripto ETF';
    if (tipo === 'REIT') return 'REIT INT';
    if (tipo === 'ADR') return 'ADR';
    return 'Stock INT';
  }

  // ETF/BDR/RF: labels fixos
  if (opts.categoria === 'etf') return 'ETFs';
  if (opts.categoria === 'bdr') return 'BDRs';
  if (opts.categoria === 'rf') return 'Renda Fixa';

  // Acoes: prefer brapi sector, fallback manual, depois industry, depois Outros
  if (opts.sector) return normalize(opts.sector);
  if (STOCK_SECTOR_FALLBACK[t]) return STOCK_SECTOR_FALLBACK[t];
  if (opts.industry) return normalize(opts.industry);
  return 'Outros';
}
