// Calculos de projecao para renda fixa.
// Fase 1: estimativas simples com CDI/IPCA mockados.
// Fase 2 (futuro): buscar indexadores atuais via DadosDeMercado /macro/indices.
//
// Premissas:
// - taxa eh sempre % a.a. efetiva (decimal NAO, porcentagem)
// - Tesouro Selic: taxa armazenada eh Selic base (~10.5%). Real retorno = Selic atual
// - Tesouro IPCA+: taxa eh o juro real acima da inflacao. Retorno = (1+IPCA)(1+taxa) - 1
// - Tesouro Pre / CDB Pre / Debenture: taxa eh direta
// - CDB 100% CDI etc: user digita taxa efetiva ja, nao % do CDI (simplificacao)
// - IR regressivo: 22.5% ate 180d, 20% ate 360d, 17.5% ate 720d, 15% acima
// - LCI, LCA, debentures incentivadas: IR isento. Debenture comum: IR regressivo.

// Fallback (somente se /api/macro-indices nao responder); valores reais vem do hook useMacroIndices.
export var CDI_FALLBACK = 14.65;
export var IPCA_FALLBACK = 4.14;

export interface MacroIdx {
  cdi: number;     // % a.a.
  ipca: number;    // % 12m
}

export type TipoRF =
  | 'cdb' | 'lc'
  | 'lci_lca' | 'lci' | 'lca' | 'lig'
  | 'cri' | 'cra'
  | 'tesouro_ipca' | 'tesouro_selic' | 'tesouro_pre'
  | 'debenture' | 'debenture_incentivada'
  | 'poupanca';
export type Indexador = 'pre' | 'cdi' | 'ipca' | 'selic' | '';

// Default do indexador derivado do tipo (compat com registros antigos sem indexador).
export function defaultIndexador(tipo: TipoRF): Indexador {
  if (tipo === 'tesouro_selic') return 'selic';
  if (tipo === 'tesouro_ipca') return 'ipca';
  if (tipo === 'tesouro_pre') return 'pre';
  return 'pre'; // cdb/lci_lca/debenture default
}

export function anosEntre(inicioISO: string, fimISO: string): number {
  if (!inicioISO || !fimISO) return 0;
  var ini = new Date(inicioISO + 'T00:00:00').getTime();
  var fim = new Date(fimISO + 'T00:00:00').getTime();
  if (!isFinite(ini) || !isFinite(fim) || fim <= ini) return 0;
  var dias = (fim - ini) / 86400000;
  return dias / 365.25;
}

export function diasEntre(inicioISO: string, fimISO: string): number {
  if (!inicioISO || !fimISO) return 0;
  var ini = new Date(inicioISO + 'T00:00:00').getTime();
  var fim = new Date(fimISO + 'T00:00:00').getTime();
  if (!isFinite(ini) || !isFinite(fim)) return 0;
  return Math.round((fim - ini) / 86400000);
}

// Taxa efetiva a.a. baseada em indexador + taxa digitada.
// `indexador`:
//   - 'pre'   → taxa eh efetiva direta (ex: CDB Pre 13.5%)
//   - 'cdi'   → taxa eh % do CDI (ex: 110 = 110% do CDI)
//   - 'ipca'  → taxa eh juros real acima do IPCA (ex: 7 = IPCA + 7%)
//   - 'selic' → taxa eh spread sobre Selic (ex: 0.05 = Selic + 0.05%)
//   - ''      → fallback via defaultIndexador(tipo)
export function taxaEfetivaAA(
  tipo: TipoRF,
  taxaDigitada: number,
  idx?: MacroIdx,
  indexador?: Indexador,
): number {
  var cdi = idx ? idx.cdi : CDI_FALLBACK;
  var ipca = idx ? idx.ipca : IPCA_FALLBACK;

  var ix: Indexador = indexador ? indexador : defaultIndexador(tipo);

  if (ix === 'cdi') {
    // % do CDI; default 100 se taxa zero
    var pct = taxaDigitada > 0 ? taxaDigitada : 100;
    return cdi * (pct / 100);
  }
  if (ix === 'selic') {
    // Selic + spread
    return cdi + Math.max(0, taxaDigitada);
  }
  if (ix === 'ipca') {
    // (1+IPCA)(1+juros real) - 1
    var ipcaR = ipca / 100;
    var juros = (taxaDigitada || 0) / 100;
    return ((1 + ipcaR) * (1 + juros) - 1) * 100;
  }
  // 'pre' (default): taxa direta
  return taxaDigitada || 0;
}

export function ehIsentoIR(tipo: TipoRF): boolean {
  // Isentos para PF: LCI, LCA, LIG, CRI, CRA, debenture incentivada, poupanca.
  if (tipo === 'lci' || tipo === 'lca' || tipo === 'lci_lca') return true;
  if (tipo === 'lig') return true;
  if (tipo === 'cri' || tipo === 'cra') return true;
  if (tipo === 'debenture_incentivada') return true;
  if (tipo === 'poupanca') return true;
  return false;
}

export function aliquotaIR(dias: number): number {
  if (dias <= 180) return 22.5;
  if (dias <= 360) return 20.0;
  if (dias <= 720) return 17.5;
  return 15.0;
}

export interface ProjecaoRF {
  anos: number;
  dias: number;
  taxaEfetivaAA: number;      // %
  valorBrutoVencimento: number;
  rendimentoBruto: number;
  rentabTotalPct: number;     // (VF/PV - 1) * 100
  ir: number;                 // R$
  aliquotaIRpct: number;      // %, 0 se isento
  isento: boolean;
  valorLiquidoVencimento: number;
  rendimentoLiquido: number;
  rentabLiquidaPct: number;
}

// Valor marcado a mercado (MTM) hoje — composicao de juros desde a aplicacao.
// Se dataAplicacao eh hoje/futura, retorna o valor aplicado original.
export function valorAtualRF(opts: {
  tipo: TipoRF;
  taxaDigitada: number;
  valorAplicado: number;
  dataAplicacaoISO: string;
  idx?: MacroIdx;
  indexador?: Indexador;
}): number {
  var pv = opts.valorAplicado;
  if (!pv || pv <= 0) return 0;
  var hojeISO = new Date().toISOString().slice(0, 10);
  var anos = anosEntre(opts.dataAplicacaoISO, hojeISO);
  if (anos <= 0) return pv;
  var teff = taxaEfetivaAA(opts.tipo, opts.taxaDigitada, opts.idx, opts.indexador);
  var r = teff / 100;
  return pv * Math.pow(1 + r, anos);
}

export function projetarRF(opts: {
  tipo: TipoRF;
  taxaDigitada: number;      // % a.a.
  valorAplicado: number;
  dataAplicacaoISO: string;  // YYYY-MM-DD
  vencimentoISO: string;
  idx?: MacroIdx;            // CDI/IPCA reais; opcional
  indexador?: Indexador;     // opcional; default via defaultIndexador(tipo)
}): ProjecaoRF | null {
  var pv = opts.valorAplicado;
  if (!pv || pv <= 0) return null;
  var anos = anosEntre(opts.dataAplicacaoISO, opts.vencimentoISO);
  var dias = diasEntre(opts.dataAplicacaoISO, opts.vencimentoISO);
  if (anos <= 0) return null;

  var teff = taxaEfetivaAA(opts.tipo, opts.taxaDigitada, opts.idx, opts.indexador);
  var r = teff / 100;
  var vf = pv * Math.pow(1 + r, anos);
  var rendimento = vf - pv;
  var rentab = (vf / pv - 1) * 100;

  var isento = ehIsentoIR(opts.tipo);
  var aliq = isento ? 0 : aliquotaIR(dias);
  var ir = rendimento * (aliq / 100);
  var vlLiq = vf - ir;
  var rendLiq = vlLiq - pv;
  var rentabLiq = (vlLiq / pv - 1) * 100;

  return {
    anos,
    dias,
    taxaEfetivaAA: teff,
    valorBrutoVencimento: vf,
    rendimentoBruto: rendimento,
    rentabTotalPct: rentab,
    ir,
    aliquotaIRpct: aliq,
    isento,
    valorLiquidoVencimento: vlLiq,
    rendimentoLiquido: rendLiq,
    rentabLiquidaPct: rentabLiq,
  };
}
