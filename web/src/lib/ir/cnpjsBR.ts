// Mapa de CNPJs das maiores pagadoras brasileiras, pra pre-preencher as
// fichas de Rendimentos do IRPF. User nao precisa buscar CNPJ por CNPJ.
//
// FONTE: B3, CVM, site institucional da empresa. Revisado abril/2026.
// Tickers normalizados: apenas o "codigo base" (PETR, nao PETR4/PETR3).

export interface EmpresaCNPJ {
  tickerBase: string;
  cnpj: string;
  razaoSocial: string;
}

var TOP_BR: EmpresaCNPJ[] = [
  { tickerBase: 'PETR', cnpj: '33.000.167/0001-01', razaoSocial: 'PETROLEO BRASILEIRO S.A. PETROBRAS' },
  { tickerBase: 'VALE', cnpj: '33.592.510/0001-54', razaoSocial: 'VALE S.A.' },
  { tickerBase: 'ITSA', cnpj: '61.532.644/0001-15', razaoSocial: 'ITAUSA S.A.' },
  { tickerBase: 'ITUB', cnpj: '60.872.504/0001-23', razaoSocial: 'ITAU UNIBANCO HOLDING S.A.' },
  { tickerBase: 'BBDC', cnpj: '60.746.948/0001-12', razaoSocial: 'BANCO BRADESCO S.A.' },
  { tickerBase: 'BBAS', cnpj: '00.000.000/0001-91', razaoSocial: 'BANCO DO BRASIL S.A.' },
  { tickerBase: 'SANB', cnpj: '90.400.888/0001-42', razaoSocial: 'BANCO SANTANDER (BRASIL) S.A.' },
  { tickerBase: 'ABEV', cnpj: '07.526.557/0001-00', razaoSocial: 'AMBEV S.A.' },
  { tickerBase: 'WEGE', cnpj: '84.429.695/0001-11', razaoSocial: 'WEG S.A.' },
  { tickerBase: 'TAEE', cnpj: '07.859.971/0001-30', razaoSocial: 'TRANSMISSORA ALIANCA DE ENERGIA ELETRICA S.A.' },
  { tickerBase: 'EGIE', cnpj: '02.474.103/0001-19', razaoSocial: 'ENGIE BRASIL ENERGIA S.A.' },
  { tickerBase: 'CMIG', cnpj: '17.155.730/0001-64', razaoSocial: 'CIA ENERGETICA DE MINAS GERAIS CEMIG' },
  { tickerBase: 'CPLE', cnpj: '76.483.817/0001-20', razaoSocial: 'COMPANHIA PARANAENSE DE ENERGIA COPEL' },
  { tickerBase: 'ELET', cnpj: '00.001.180/0001-26', razaoSocial: 'CENTRAIS ELETRICAS BRASILEIRAS S.A. ELETROBRAS' },
  { tickerBase: 'KLBN', cnpj: '89.637.490/0001-45', razaoSocial: 'KLABIN S.A.' },
  { tickerBase: 'SUZB', cnpj: '16.404.287/0001-55', razaoSocial: 'SUZANO S.A.' },
  { tickerBase: 'MGLU', cnpj: '47.960.950/0001-21', razaoSocial: 'MAGAZINE LUIZA S.A.' },
  { tickerBase: 'LREN', cnpj: '60.476.884/0001-87', razaoSocial: 'LOJAS RENNER S.A.' },
  { tickerBase: 'B3SA', cnpj: '09.346.601/0001-25', razaoSocial: 'B3 S.A. - BRASIL, BOLSA, BALCAO' },
  { tickerBase: 'JBSS', cnpj: '02.916.265/0001-60', razaoSocial: 'JBS S.A.' },
  { tickerBase: 'RENT', cnpj: '16.670.085/0001-55', razaoSocial: 'LOCALIZA RENT A CAR S.A.' },
  { tickerBase: 'BPAC', cnpj: '30.306.294/0001-45', razaoSocial: 'BTG PACTUAL S.A.' },
  { tickerBase: 'RADL', cnpj: '61.585.865/0001-51', razaoSocial: 'RAIADROGASIL S.A.' },
  { tickerBase: 'VIVT', cnpj: '02.558.157/0001-62', razaoSocial: 'TELEFONICA BRASIL S.A.' },
  { tickerBase: 'HYPE', cnpj: '02.932.074/0001-91', razaoSocial: 'HYPERA S.A.' },
  { tickerBase: 'CSAN', cnpj: '50.746.577/0001-15', razaoSocial: 'COSAN S.A.' },
  { tickerBase: 'GGBR', cnpj: '33.611.500/0001-19', razaoSocial: 'GERDAU S.A.' },
  { tickerBase: 'GOAU', cnpj: '92.690.783/0001-09', razaoSocial: 'METALURGICA GERDAU S.A.' },
  { tickerBase: 'CSNA', cnpj: '33.042.730/0001-04', razaoSocial: 'CIA SIDERURGICA NACIONAL' },
  { tickerBase: 'USIM', cnpj: '60.894.730/0001-05', razaoSocial: 'USINAS SIDERURGICAS DE MINAS GERAIS USIMINAS' },
  { tickerBase: 'MRVE', cnpj: '08.343.492/0001-20', razaoSocial: 'MRV ENGENHARIA E PARTICIPACOES S.A.' },
  { tickerBase: 'CYRE', cnpj: '73.178.600/0001-18', razaoSocial: 'CYRELA BRAZIL REALTY S.A.' },
  { tickerBase: 'EQTL', cnpj: '03.220.438/0001-73', razaoSocial: 'EQUATORIAL ENERGIA S.A.' },
  { tickerBase: 'PSSA', cnpj: '61.198.164/0001-60', razaoSocial: 'PORTO SEGURO S.A.' },
  { tickerBase: 'BBSE', cnpj: '17.192.451/0001-70', razaoSocial: 'BB SEGURIDADE PARTICIPACOES S.A.' },
  { tickerBase: 'IRBR', cnpj: '33.376.989/0001-91', razaoSocial: 'IRB BRASIL RESSEGUROS S.A.' },
  { tickerBase: 'VBBR', cnpj: '33.453.598/0001-23', razaoSocial: 'VIBRA ENERGIA S.A.' },
  { tickerBase: 'UGPA', cnpj: '33.256.439/0001-39', razaoSocial: 'ULTRAPAR PARTICIPACOES S.A.' },
  { tickerBase: 'BRKM', cnpj: '42.150.391/0001-70', razaoSocial: 'BRASKEM S.A.' },
];

// Mapa indexado por prefixo do ticker (PETR3 → PETR)
var MAP_BR: Record<string, EmpresaCNPJ> = {};
TOP_BR.forEach(function (e) { MAP_BR[e.tickerBase] = e; });

// Extrai base do ticker (PETR4 → PETR, VALE3 → VALE, ITSA4 → ITSA)
function baseFromTicker(ticker: string): string {
  var t = (ticker || '').toUpperCase();
  // Remove digitos do final (1 ou 2 caracteres numericos)
  var match = t.match(/^([A-Z]+)\d+$/);
  if (match) return match[1];
  return t;
}

export function lookupCNPJ(ticker: string): EmpresaCNPJ | null {
  if (!ticker) return null;
  var base = baseFromTicker(ticker);
  return MAP_BR[base] || null;
}

// Formata entrada da Ficha 09/10 com CNPJ se conhecido
export function discricaoComCNPJ(ticker: string, tipo: string): { cnpj: string; nome: string; texto: string } {
  var e = lookupCNPJ(ticker);
  if (e) {
    return {
      cnpj: e.cnpj,
      nome: e.razaoSocial,
      texto: tipo + ' — ' + ticker + ' — ' + e.razaoSocial,
    };
  }
  return {
    cnpj: '—',
    nome: ticker,
    texto: tipo + ' — ' + ticker + ' (pesquise CNPJ no RI da empresa)',
  };
}
