// Classificacao de setores em grupos visuais (por classe pai).
// O schema JSONB continua flat (sector_targets: Record<string, number>),
// isso e' so uma camada de visualizacao.

export interface SectorGroup {
  key: string;
  label: string;
  /** Ordem de exibicao (menor = primeiro) */
  order: number;
}

export const SECTOR_GROUPS: Record<string, SectorGroup> = {
  fii:    { key: 'fii',    label: 'FIIs',          order: 1 },
  acao:   { key: 'acao',   label: 'Ações BR',      order: 2 },
  etf:    { key: 'etf',    label: 'ETFs BR',       order: 3 },
  bdr:    { key: 'bdr',    label: 'BDRs',          order: 4 },
  int:    { key: 'int',    label: 'Internacional', order: 5 },
  rf:     { key: 'rf',     label: 'Renda Fixa',    order: 6 },
  outros: { key: 'outros', label: 'Outros',        order: 99 },
};

// TODO(usuario): refinar classificacao se necessario.
// Hoje a logica e':
//  - "FII *"          -> grupo fii
//  - "* INT"          -> grupo int
//  - "Cripto ETF"     -> grupo int (cripto via ETF/Trust)
//  - "ETFs"           -> grupo etf
//  - "BDRs"           -> grupo bdr
//  - "Renda Fixa"     -> grupo rf
//  - "Outros"         -> grupo outros
//  - default          -> grupo acao (setor BR de acao)
//
// Casos limite que talvez voce queira tratar diferente:
//  - "ADR" (sem sufixo INT) -> hoje cai em "acao", deveria ir pra "int"?
//  - "Stock INT" / "REIT INT" -> ja terminam com INT, ok
//  - Setores customizados que voce adicionar -> seriam classificados como "acao" por default
export function classifySector(sectorName: string): SectorGroup {
  const s = (sectorName || '').trim();
  if (!s) return SECTOR_GROUPS.outros;

  if (s.startsWith('FII ')) return SECTOR_GROUPS.fii;
  if (s.endsWith(' INT')) return SECTOR_GROUPS.int;
  if (s === 'Cripto ETF') return SECTOR_GROUPS.int;
  if (s === 'ADR') return SECTOR_GROUPS.int;
  if (s === 'ETFs') return SECTOR_GROUPS.etf;
  if (s === 'BDRs') return SECTOR_GROUPS.bdr;
  if (s === 'Renda Fixa') return SECTOR_GROUPS.rf;
  if (s === 'Outros') return SECTOR_GROUPS.outros;

  // Default: setor BR de acao (Tecnologia, Energia, Financeiro, etc.)
  return SECTOR_GROUPS.acao;
}

// Sugestao de novo setor por grupo, util pro botao "+ Adicionar setor"
// quando o usuario quer adicionar setor ja agrupado.
export const SUGGESTED_BY_GROUP: Record<string, string[]> = {
  fii: ['FII Tijolo', 'FII Papel', 'FII Hibrido', 'FII FoF', 'FII Agro', 'FII Outros'],
  acao: [
    'Financeiro', 'Energia', 'Tecnologia', 'Materiais Basicos',
    'Consumo Ciclico', 'Consumo Nao Ciclico', 'Saude', 'Utilidade Publica',
    'Bens Industriais', 'Comunicacoes', 'Exploracao de Imoveis',
  ],
  etf: ['ETFs'],
  bdr: ['BDRs'],
  int: [
    'Tecnologia INT', 'Financeiro INT', 'Saude INT', 'Consumo INT',
    'Energia INT', 'Materiais INT', 'Automotivo INT', 'Cripto ETF', 'ADR',
  ],
  rf: ['Renda Fixa'],
  outros: [],
};
