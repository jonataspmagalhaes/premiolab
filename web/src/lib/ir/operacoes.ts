// Calculo de ganhos/perdas por operacao + agregacao mensal por categoria.
//
// MIRROR: src/screens/relatorios/RelatoriosScreen.js#computeIR (port do
// mobile, mantido como funcao pura TS).
//
// Regras:
//  - PM (preco medio) calculado por ticker em base FIFO/ponderada:
//    em compra: custoTotal += qty × preco + custos; qty += qty.
//    em venda: ganho = qty × preco - custos - qty × PM; qty -= qty.
//  - Stocks internacionais: converte USD→BRL em CADA operacao via taxa_cambio.
//  - Bonificacao/desdobramento: atualiza qty sem custo (herda PM anterior
//    ajustado pela razao).

import type { CategoriaIR, MonthResult, OperacaoRaw, VendaDetalhada } from './types';
import { mesKeyFromDate } from './cambio';
import { usdParaBrl } from './cambio';

interface PosAtual {
  qty: number;
  custoTotal: number;  // em BRL (para INT, custoTotal ja e convertido)
  categoria: CategoriaIR;
  mercado: 'BR' | 'INT';
}

function normalizaCategoria(cat: string | undefined): CategoriaIR {
  var c = (cat || 'acao').toLowerCase();
  if (c === 'fii') return 'fii';
  if (c === 'etf') return 'etf';
  if (c === 'bdr') return 'bdr';
  if (c === 'adr') return 'adr';
  if (c === 'reit') return 'reit';
  if (c === 'stock_int') return 'stock_int';
  // 'acao', 'cripto' (cripto deveria vir em array separado) → acao por seguranca
  return 'acao';
}

export function computeIROperacoes(opsIn: OperacaoRaw[], year: number): MonthResult[] {
  // Ordena asc por data; inclui ops dos anos ANTERIORES para PM correto,
  // mas so gera linhas do ano solicitado.
  var ops = opsIn.slice().sort(function (a, b) {
    return a.data.localeCompare(b.data);
  });

  var pos: Record<string, PosAtual> = {};

  // Mapa mes -> MonthResult; inicializa 12 meses do ano
  var mesesMap: Record<string, MonthResult> = {};
  function initMes(k: string): MonthResult {
    var r: MonthResult = {
      mes: k,
      vendas: { acao: 0, fii: 0, etf: 0, bdr: 0, adr: 0, reit: 0, stock_int: 0, opcoes_swing: 0, opcoes_day: 0, cripto_swing: 0, cripto_day: 0 },
      ganhos: { acao: 0, fii: 0, etf: 0, bdr: 0, adr: 0, reit: 0, stock_int: 0, opcoes_swing: 0, opcoes_day: 0, cripto_swing: 0, cripto_day: 0 },
      detalhe: [],
    };
    mesesMap[k] = r;
    return r;
  }
  for (var m = 1; m <= 12; m++) {
    initMes(year + '-' + String(m).padStart(2, '0'));
  }

  for (var i = 0; i < ops.length; i++) {
    var o = ops[i];
    var tk = (o.ticker || '').toUpperCase();
    if (!tk) continue;

    var cat = normalizaCategoria(o.categoria);
    var mercado: 'BR' | 'INT' = o.mercado === 'INT' ? 'INT' : 'BR';
    var qty = Number(o.quantidade) || 0;
    var preco = Number(o.preco) || 0;
    var custos = Number(o.custo_total != null ? o.custo_total : (o.custos || 0));
    var precoBRL = mercado === 'INT' ? usdParaBrl(preco, o.taxa_cambio) : preco;
    var custosBRL = mercado === 'INT' ? usdParaBrl(custos, o.taxa_cambio) : custos;

    if (!pos[tk]) {
      pos[tk] = { qty: 0, custoTotal: 0, categoria: cat, mercado: mercado };
    }
    var p = pos[tk];
    p.categoria = cat;  // atualiza (caso venha diferente em ops recentes)
    p.mercado = mercado;

    var tipo = (o.tipo || '').toLowerCase();
    var dataOp = o.data;
    var mesOp = mesKeyFromDate(dataOp);
    var yearOp = dataOp.substring(0, 4);

    if (tipo === 'compra') {
      p.custoTotal += qty * precoBRL + custosBRL;
      p.qty += qty;
    } else if (tipo === 'venda') {
      if (p.qty <= 0) {
        // Venda sem posicao (vendido descoberto?) — ignora cautelosamente
        continue;
      }
      var pm = p.custoTotal / p.qty;
      var valorVendaBRL = qty * precoBRL - custosBRL;
      var ganho = valorVendaBRL - qty * pm;

      // Atualiza posicao (retira qty, proporcionalmente o custo)
      var proporcaoVendida = qty / p.qty;
      p.custoTotal = p.custoTotal * (1 - proporcaoVendida);
      p.qty -= qty;
      if (p.qty < 0.0000001) { p.qty = 0; p.custoTotal = 0; }

      // So registra em MonthResult se for ano alvo
      if (yearOp === String(year) && mesesMap[mesOp]) {
        mesesMap[mesOp].vendas[cat] += valorVendaBRL;
        mesesMap[mesOp].ganhos[cat] += ganho;
        var det: VendaDetalhada = {
          ticker: tk,
          data: dataOp,
          quantidade: qty,
          precoVenda: precoBRL,
          precoMedio: pm,
          custos: custosBRL,
          valorVenda: valorVendaBRL,
          ganho: ganho,
          categoria: cat,
          mercado: mercado,
          taxaCambio: o.taxa_cambio,
        };
        mesesMap[mesOp].detalhe.push(det);
      }
    } else if (tipo === 'desdobramento' || tipo === 'bonificacao') {
      // Ajusta qty mantendo custo total. Nao afeta IR.
      // Assume que op carrega quantidade nova absoluta ou delta; aqui tratamos como delta pra ser seguro.
      p.qty += qty;
    } else {
      // tipos nao reconhecidos (transferencia, split reverso etc): ignora
    }
  }

  // Retorna ordenado por mes asc
  return Object.keys(mesesMap)
    .sort()
    .map(function (k) { return mesesMap[k]; });
}
