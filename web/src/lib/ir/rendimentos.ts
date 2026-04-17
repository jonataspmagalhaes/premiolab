// Classificacao fiscal de proventos (dividendos, JCP, rendimentos FII, exterior).
// Expande o categorize() que existe em /app/renda/ir/page.tsx com ficha +
// codigo IRPF + descricao.

import type { Provento } from '@/store';
import { tipoLabel, isIntTicker } from '@/lib/proventosUtils';
import { ALIQUOTAS, FICHA_09_CODIGOS, FICHA_10_CODIGOS } from './constants';
import type { ItemRendimento, CategoriaRendimento } from './types';

export function classifyProventoIR(p: Provento): ItemRendimento {
  var bruto = Number(p.valor_total) || 0;
  var tl = tipoLabel(p.tipo_provento);
  var isInt = isIntTicker(p.ticker);

  // JCP: 15% retido
  if (tl === 'JCP') {
    var irJcp = bruto * ALIQUOTAS.jcp_fonte;
    return {
      ticker: p.ticker,
      data: p.data_pagamento,
      bruto: bruto,
      liquido: bruto - irJcp,
      irRetido: irJcp,
      categoria: 'tributado_jcp',
      ficha: '10',
      codigo: FICHA_10_CODIGOS.jcp,
      descricao: 'JCP — ' + p.ticker + ' (IR 15% retido na fonte)',
    };
  }

  // Dividendo internacional (EUA): 30% retido tipicamente
  if (isInt && tl === 'Dividendo') {
    var irUs = bruto * ALIQUOTAS.us_dividendo_fonte;
    return {
      ticker: p.ticker,
      data: p.data_pagamento,
      bruto: bruto,
      liquido: bruto - irUs,
      irRetido: irUs,
      categoria: 'tributado_us',
      ficha: '17',
      codigo: 'Rendimentos Recebidos de PJ no Exterior',
      descricao: 'Dividendo ' + p.ticker + ' (IR 30% retido no exterior)',
    };
  }

  // Rendimento FII (isento)
  if (tl === 'Rendimento') {
    return {
      ticker: p.ticker,
      data: p.data_pagamento,
      bruto: bruto,
      liquido: bruto,
      irRetido: 0,
      categoria: 'isento_fii',
      ficha: '09',
      codigo: FICHA_09_CODIGOS.rendimento_fii,
      descricao: 'Rendimento FII ' + p.ticker + ' (isento)',
    };
  }

  // Dividendo BR (isento)
  return {
    ticker: p.ticker,
    data: p.data_pagamento,
    bruto: bruto,
    liquido: bruto,
    irRetido: 0,
    categoria: 'isento_div_br',
    ficha: '09',
    codigo: FICHA_09_CODIGOS.dividendo_br,
    descricao: 'Dividendo ' + p.ticker + ' (isento)',
  };
}

// Agrupa rendimentos por categoria para exibicao rapida
export function agruparPorCategoria(items: ItemRendimento[]): Record<CategoriaRendimento, { total: number; irRetido: number; count: number }> {
  var out: Record<string, { total: number; irRetido: number; count: number }> = {};
  items.forEach(function (it) {
    if (!out[it.categoria]) out[it.categoria] = { total: 0, irRetido: 0, count: 0 };
    out[it.categoria].total += it.bruto;
    out[it.categoria].irRetido += it.irRetido;
    out[it.categoria].count += 1;
  });
  return out as Record<CategoriaRendimento, { total: number; irRetido: number; count: number }>;
}
