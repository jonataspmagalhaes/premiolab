// Tipos compartilhados pela biblioteca de calculo de IR.

import type { Opcao, Provento, RendaFixa } from '@/store';

// Modalidades com silo proprio de compensacao de prejuizo
export type CategoriaIR =
  | 'acao'
  | 'fii'
  | 'etf'
  | 'bdr'
  | 'adr'
  | 'reit'
  | 'stock_int'
  | 'opcoes_swing'
  | 'opcoes_day'
  | 'cripto_swing'
  | 'cripto_day';

export interface PrejuizoAnterior {
  acao: number;
  fii: number;
  etf: number;
  bdr: number;
  adr: number;
  reit: number;
  stock_int: number;
  opcoes_swing: number;
  opcoes_day: number;
  cripto_swing: number;
  cripto_day: number;
}

// ─── Operacoes / vendas ────────────────────────────────────

export interface VendaDetalhada {
  ticker: string;
  data: string;                // YYYY-MM-DD
  quantidade: number;
  precoVenda: number;
  precoMedio: number;          // PM no momento da venda
  custos: number;              // corretagem + emolumentos + impostos
  valorVenda: number;          // quantidade × precoVenda - custos
  ganho: number;               // valorVenda - (quantidade × PM)
  categoria: CategoriaIR;
  mercado: 'BR' | 'INT';
  taxaCambio?: number;         // para stocks INT
}

export interface MonthResult {
  mes: string;                 // YYYY-MM
  vendas: Record<CategoriaIR, number>;   // volume total de vendas na modalidade
  ganhos: Record<CategoriaIR, number>;   // ganho/prejuizo liquido (positivo = lucro)
  detalhe: VendaDetalhada[];
}

// ─── DARF ──────────────────────────────────────────────────

export interface DarfPorCategoria {
  categoria: CategoriaIR;
  baseCalculo: number;         // ganho apos compensacao de prejuizo
  aliquota: number;            // 0.15, 0.20, etc
  prejuizoConsumido: number;   // quanto do prejAnterior foi usado neste mes
  prejuizoRemanescente: number;
  imposto: number;             // baseCalculo × aliquota (0 se nao devido)
  isento: boolean;             // true se isencao 20k/35k aplicada
  motivoIsencao?: string;
}

export interface DarfRecord {
  mes: string;                  // YYYY-MM
  vencimento: string;           // YYYY-MM-DD (ultimo dia util mes seguinte)
  codigo: string;               // 6015 ou 4600
  valorTotal: number;           // soma de categorias
  porCategoria: DarfPorCategoria[];
  pago?: boolean;
  pagoEm?: string;
}

// ─── Rendimentos (proventos) ──────────────────────────────

export type CategoriaRendimento =
  | 'isento_div_br'         // Dividendos BR
  | 'isento_fii'            // Rendimentos FII
  | 'isento_rf'             // LCI, LCA, debenture incentivada, poupanca
  | 'tributado_jcp'         // JCP (15% retido)
  | 'tributado_us'          // Dividendos EUA (30% retido)
  | 'tributado_rf'          // CDB, Tesouro, debenture comum
  | 'carne_leao';           // Dividendos exterior sem retencao

export interface ItemRendimento {
  ticker: string;
  data: string;
  bruto: number;
  liquido: number;
  irRetido: number;
  categoria: CategoriaRendimento;
  ficha: string;             // "09" | "10" | "17" | ...
  codigo: string;            // codigo IRPF da linha
  descricao: string;
}

// ─── Renda fixa ────────────────────────────────────────────

export interface RFItem {
  id?: string;
  tipo: string;              // cdb | lci | lca | tesouro_* | debenture | ...
  emissor: string;
  valorAplicado: number;
  valorAtual: number;        // MTM (composicao de juros)
  diasCorridos: number;
  aliquotaProjetada: number; // 0.15..0.225 ou 0 se isento
  irProjetado: number;       // (valorAtual - aplicado) × aliquota
  isenta: boolean;
  motivo?: string;           // "LCI isenta" | "Debenture incentivada" | ...
}

// ─── Bens e Direitos (posicao 31/12) ──────────────────────

export interface BensItem {
  codigo: string;            // "31" | "73" | ...
  grupo: string;
  descricao: string;         // discriminacao gerada
  ticker?: string;
  quantidade: number;
  custoMedioBRL: number;
  custoMedioUSD?: number;    // stocks INT
  valorTotalBRL: number;
  categoria: CategoriaIR | 'rf' | 'cripto';
  situacao31_12_anterior?: number;
  situacao31_12_base: number;
}

// ─── Cripto ───────────────────────────────────────────────

export interface CriptoMonthResult {
  mes: string;
  vendasTotais: number;         // soma das vendas (independente de ganho)
  ganho: number;                // ganho liquido
  isento: boolean;              // true se vendasTotais <= 35k
  aliquota: number;
  imposto: number;
}

// ─── Opcoes ────────────────────────────────────────────────

export interface OpcoesMonthIR {
  mes: string;
  swingGanho: number;
  swingPerda: number;
  daytradeGanho: number;
  daytradePerda: number;
}

// ─── Input agregado ────────────────────────────────────────

export interface IRInput {
  year: number;
  operacoes: OperacaoRaw[];      // inclui todas categorias EXCETO cripto (recomendacao)
  operacoesCripto: OperacaoRaw[]; // separadas pra isencao 35k
  proventos: Provento[];
  opcoes: Opcao[];
  rendaFixa: RendaFixa[];
  prejuizoAnterior: PrejuizoAnterior;
}

export interface IRAnualResult {
  year: number;
  darfs: DarfRecord[];
  opcoesMensal: OpcoesMonthIR[];
  criptoMensal: CriptoMonthResult[];
  rendaFixa: { isentas: RFItem[]; tributadas: RFItem[] };
  rendimentos: ItemRendimento[];
  bens: BensItem[];
  prejuizoFinal: PrejuizoAnterior;
  totais: {
    irDevido: number;
    irRetido: number;
    rendimentosIsentos: number;
    rendimentosTributados: number;
  };
  alertas: string[];
}

// ─── Tipos de operacao crua do banco ────────────────────

export interface OperacaoRaw {
  id?: string;
  ticker: string;
  tipo: 'compra' | 'venda' | 'desdobramento' | 'bonificacao' | string;
  quantidade: number;
  preco: number;
  custo_total?: number;
  custos?: number;
  data: string;
  categoria?: string;
  mercado?: 'BR' | 'INT';
  taxa_cambio?: number;
  portfolio_id?: string | null;
  corretora?: string | null;
}

export type { Opcao, Provento, RendaFixa };
