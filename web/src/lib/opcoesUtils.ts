// Helpers de calculo de P&L mensal e resumo de renda em opcoes.
//
// Regras:
// - Operacao realizada = status in {exercida, expirada, fechada, expirou_po}.
// - Venda (ou "lancamento"): ganho = (premio - premio_fechamento) * qty.
//   Se expirou sem recompra, premio_fechamento = 0 → lucro integral.
// - Compra: ganho = (premio_fechamento - premio) * qty.
// - Data de referencia: data_fechamento quando existir, senao vencimento, senao data_abertura.

import type { Opcao } from '@/store';

export interface OpcoesMensal {
  mesISO: string;         // YYYY-MM-01
  label: string;          // "Mai/26"
  premios: number;        // soma de entradas liquidas (vendas abertas que fecharam com lucro ou expiraram)
  recompras: number;      // soma de saidas liquidas (fechamentos de compras com perda, recompras)
  liquido: number;        // saldo do mes (premios - recompras)
  count: number;          // numero de operacoes realizadas no mes
}

export interface OpcoesResumo {
  total12m: number;       // liquido 12m
  mediaMensal: number;
  melhorMes: { label: string; valor: number } | null;
  piorMes: { label: string; valor: number } | null;
  operacoes12m: number;
  operacoesAbertas: number;
}

var MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function dataReferencia(o: Opcao): Date | null {
  var s = o.data_fechamento || o.vencimento || o.data_abertura;
  if (!s) return null;
  var d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d;
}

function isRealizada(status: string | undefined): boolean {
  var s = (status || '').toLowerCase();
  return s === 'exercida' || s === 'expirada' || s === 'fechada' || s === 'expirou_po';
}

function isVenda(direcao: string | undefined): boolean {
  var d = (direcao || 'venda').toLowerCase();
  return d === 'venda' || d === 'lancamento';
}

function mesKey(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
}

function mesLabel(d: Date): string {
  return MESES_PT[d.getMonth()] + '/' + String(d.getFullYear()).slice(-2);
}

/**
 * Calcula resultado por operacao (positivo = ganho, negativo = prejuizo).
 * Se status nao-realizado, retorna 0.
 */
export function resultadoOperacao(o: Opcao): number {
  if (!isRealizada(o.status)) return 0;
  var qty = o.qty || 0;
  var pa = (o.premio || 0) * qty;
  var pf = (o.premio_fechamento || 0) * qty;
  return isVenda(o.direcao) ? (pa - pf) : (pf - pa);
}

/**
 * Agrega resultados por mes, retornando 1 entrada para cada mes do periodo.
 * Periodo: ultimos N meses (inclui mes atual).
 */
export function computeOpcoesMensal(opcoes: Opcao[], periodoMeses: number = 12): OpcoesMensal[] {
  var now = new Date();
  var meses: Array<OpcoesMensal> = [];

  for (var i = periodoMeses - 1; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    meses.push({
      mesISO: mesKey(d),
      label: mesLabel(d),
      premios: 0,
      recompras: 0,
      liquido: 0,
      count: 0,
    });
  }
  var idx: Record<string, number> = {};
  meses.forEach(function (m, i) { idx[m.mesISO] = i; });

  opcoes.forEach(function (o) {
    if (!isRealizada(o.status)) return;
    var dref = dataReferencia(o);
    if (!dref) return;
    var k = mesKey(new Date(dref.getFullYear(), dref.getMonth(), 1));
    var iMes = idx[k];
    if (iMes == null) return;
    var res = resultadoOperacao(o);
    if (res >= 0) meses[iMes].premios += res;
    else meses[iMes].recompras += Math.abs(res);
    meses[iMes].liquido += res;
    meses[iMes].count += 1;
  });

  return meses;
}

export function resumoOpcoes12m(opcoes: Opcao[]): OpcoesResumo {
  var mensal = computeOpcoesMensal(opcoes, 12);
  var total12m = 0;
  var melhor: { label: string; valor: number } | null = null;
  var pior: { label: string; valor: number } | null = null;
  var operacoes12m = 0;

  mensal.forEach(function (m) {
    total12m += m.liquido;
    operacoes12m += m.count;
    if (melhor == null || m.liquido > melhor.valor) melhor = { label: m.label, valor: m.liquido };
    if (pior == null || m.liquido < pior.valor) pior = { label: m.label, valor: m.liquido };
  });

  var operacoesAbertas = 0;
  opcoes.forEach(function (o) {
    var s = (o.status || '').toLowerCase();
    if (s === 'ativa' || s === 'aberta' || s === '') operacoesAbertas += 1;
  });

  return {
    total12m: total12m,
    mediaMensal: total12m / 12,
    melhorMes: melhor,
    piorMes: pior,
    operacoes12m: operacoes12m,
    operacoesAbertas: operacoesAbertas,
  };
}

/**
 * Heuristica de estrategia baseada em tipo + direcao.
 */
export function inferirEstrategia(o: Opcao): string {
  var tipo = (o.tipo || '').toLowerCase();
  var dir = (o.direcao || 'venda').toLowerCase();
  if (dir === 'venda' || dir === 'lancamento') {
    if (tipo === 'call') return 'Venda coberta';
    if (tipo === 'put') return 'Venda de put';
    return 'Venda';
  }
  if (tipo === 'call') return 'Compra de call';
  if (tipo === 'put') return 'Compra de put';
  return 'Compra';
}
