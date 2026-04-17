// Ficha de Bens e Direitos — replay de operacoes ate 31/12 do ano base
// pra calcular posicao final por ativo com custo medio.

import type { BensItem, OperacaoRaw, CategoriaIR } from './types';
import type { RendaFixa } from '@/store';
import { CODIGOS_IRPF_BENS } from './constants';
import { usdParaBrl } from './cambio';

interface PosAcumulada {
  ticker: string;
  categoria: string;
  mercado: 'BR' | 'INT';
  qty: number;
  custoTotal: number;       // BRL
  custoTotalUsd: number;    // so p/ INT
}

function normalizarCategoria(cat: string | undefined): string {
  var c = (cat || 'acao').toLowerCase();
  return c;
}

function codigoIRPF(cat: string): { codigo: string; grupo: string; descricao: string } {
  if (CODIGOS_IRPF_BENS[cat]) return CODIGOS_IRPF_BENS[cat];
  return CODIGOS_IRPF_BENS['acao'];
}

// Replay operacoes do ano-base inteiro + anteriores; retorna posicao em 31/12
export function computeFichaBens(
  ops: OperacaoRaw[],
  year: number,
  rfAtivas: RendaFixa[],
): BensItem[] {
  var ordenadas = ops.slice().sort(function (a, b) { return a.data.localeCompare(b.data); });
  var cutoffISO = year + '-12-31';
  var pos: Record<string, PosAcumulada> = {};

  for (var i = 0; i < ordenadas.length; i++) {
    var o = ordenadas[i];
    if ((o.data || '') > cutoffISO) break;
    var tk = (o.ticker || '').toUpperCase();
    if (!tk) continue;
    var cat = normalizarCategoria(o.categoria);
    var mercado: 'BR' | 'INT' = o.mercado === 'INT' ? 'INT' : 'BR';

    var qty = Number(o.quantidade) || 0;
    var preco = Number(o.preco) || 0;
    var custos = Number(o.custo_total != null ? o.custo_total : (o.custos || 0));
    var precoBRL = mercado === 'INT' ? usdParaBrl(preco, o.taxa_cambio) : preco;
    var custosBRL = mercado === 'INT' ? usdParaBrl(custos, o.taxa_cambio) : custos;

    if (!pos[tk]) {
      pos[tk] = { ticker: tk, categoria: cat, mercado: mercado, qty: 0, custoTotal: 0, custoTotalUsd: 0 };
    }
    var p = pos[tk];
    p.categoria = cat;
    p.mercado = mercado;

    var tipo = (o.tipo || '').toLowerCase();
    if (tipo === 'compra') {
      p.custoTotal += qty * precoBRL + custosBRL;
      if (mercado === 'INT') p.custoTotalUsd += qty * preco + custos;
      p.qty += qty;
    } else if (tipo === 'venda') {
      if (p.qty <= 0) continue;
      var proporcao = qty / p.qty;
      p.custoTotal = p.custoTotal * (1 - proporcao);
      if (mercado === 'INT') p.custoTotalUsd = p.custoTotalUsd * (1 - proporcao);
      p.qty -= qty;
      if (p.qty < 0.0000001) { p.qty = 0; p.custoTotal = 0; p.custoTotalUsd = 0; }
    } else if (tipo === 'desdobramento' || tipo === 'bonificacao') {
      p.qty += qty;
    }
  }

  // Monta BensItem
  var items: BensItem[] = [];
  Object.values(pos).forEach(function (p) {
    if (p.qty <= 0 || p.custoTotal <= 0.01) return;
    var catMeta = codigoIRPF(p.categoria);
    var pm = p.custoTotal / p.qty;
    var pmUsd = p.mercado === 'INT' && p.custoTotalUsd > 0 ? p.custoTotalUsd / p.qty : undefined;
    var discr = catMeta.descricao + ' ' + p.ticker + ' — ' + p.qty.toLocaleString('pt-BR') + ' cotas — PM R$ ' + pm.toFixed(2);
    if (pmUsd) discr += ' (USD ' + pmUsd.toFixed(2) + ')';
    items.push({
      codigo: catMeta.codigo,
      grupo: catMeta.grupo,
      descricao: discr,
      ticker: p.ticker,
      quantidade: p.qty,
      custoMedioBRL: pm,
      custoMedioUSD: pmUsd,
      valorTotalBRL: p.custoTotal,
      categoria: (p.categoria as CategoriaIR | 'rf' | 'cripto'),
      situacao31_12_base: p.custoTotal,
    });
  });

  // Adiciona aplicacoes RF ativas em 31/12 (sem baixa)
  rfAtivas.forEach(function (rf) {
    var valor = rf.valor_aplicado || 0;
    if (valor <= 0.01) return;
    var tipoLow = (rf.tipo || '').toLowerCase();
    var catKey = 'cdb';
    if (tipoLow === 'lci' || tipoLow === 'lca' || tipoLow === 'lci_lca' || tipoLow === 'lca_lci') catKey = 'lci_lca';
    else if (tipoLow.indexOf('tesouro') >= 0) catKey = 'tesouro';
    else if (tipoLow.indexOf('debenture') >= 0) catKey = 'debenture';
    var catMeta = codigoIRPF(catKey);
    items.push({
      codigo: catMeta.codigo,
      grupo: catMeta.grupo,
      descricao: catMeta.descricao + ' — ' + (rf.emissor || '?') + ' — aplicado R$ ' + valor.toFixed(2) + ' em ' + (rf.created_at || '').substring(0, 10),
      quantidade: 1,
      custoMedioBRL: valor,
      valorTotalBRL: valor,
      categoria: 'rf',
      situacao31_12_base: valor,
    });
  });

  items.sort(function (a, b) {
    if (a.codigo !== b.codigo) return a.codigo.localeCompare(b.codigo);
    return b.valorTotalBRL - a.valorTotalBRL;
  });

  return items;
}

// Formato pipe-delimited pra colar no programa IRPF
export function bensParaTexto(items: BensItem[], year: number): string {
  var linhas: string[] = [];
  linhas.push('BENS E DIREITOS - Posicao 31/12/' + year);
  linhas.push('');
  items.forEach(function (it) {
    linhas.push(
      [
        it.codigo,
        it.descricao,
        'R$ ' + it.valorTotalBRL.toFixed(2),
      ].join(' | ')
    );
  });
  linhas.push('');
  linhas.push('Total: ' + items.length + ' bens | Valor total: R$ ' + items.reduce(function (a, i) { return a + i.valorTotalBRL; }, 0).toFixed(2));
  return linhas.join('\n');
}
