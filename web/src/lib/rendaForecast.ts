// Projecao mensal de renda com sazonalidade por ticker.
// Substitui logica antiga que repetia o mesmo valor nos 12 meses.
//
// Ideia: cada ticker tem padrao sazonal. Ex. PETR4 paga fev/mai/ago/nov.
// Olhamos os ultimos 24 meses de proventos historicos, aprendemos em que meses
// o ticker paga e com que valor medio (liquido), e projetamos mes a mes.
//
// Se ha proventos ja anunciados para o futuro (data_pagamento > now) eles viram
// overlay "confirmado" na linha projetada.

import { valorLiquido } from './proventosUtils';

export interface EnrichedProvento {
  ticker: string;
  ts: number;
  date: Date;
  valor_total: number;
  tipo_provento: string;
}

export interface PositionLite {
  ticker: string;
  quantidade: number;
}

export interface ProjecaoMes {
  mesISO: string;              // YYYY-MM-01
  label: string;               // ex "Mai/26"
  estimado: number;            // projecao liquida
  confirmado: number;          // soma dos ja anunciados
  total: number;               // estimado + confirmado (para grafico)
  items: { ticker: string; valor: number; fonte: 'historico' | 'confirmado' }[];
}

var MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function labelMes(d: Date): string {
  return MESES_PT[d.getMonth()] + '/' + String(d.getFullYear()).slice(-2);
}

function keyMes(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
}

/**
 * Projeta renda mensal para os proximos N meses com base em sazonalidade historica.
 *
 * Algoritmo:
 *  1. Para cada ticker na carteira (quantidade > 0):
 *     - Olha proventos dos ultimos 24 meses (lookbackMeses).
 *     - Agrupa por (mes_calendario 0-11) -> lista de {valor_liquido, qty_na_epoca}.
 *     - Calcula media ponderada pela qty_atual / qty_media_historica (ajusta quem aumentou posicao).
 *  2. Para cada mes futuro M (1..horizonteMeses):
 *     - Soma contribuicao de cada ticker que historicamente paga em M.
 *  3. Overlay de proventos ja confirmados (data_pagamento > agora): soma em 'confirmado'.
 *  4. Se um mes tem apenas confirmado e sem historico sazonal, ainda aparece corretamente.
 */
export function projetarMensal(
  enriched: EnrichedProvento[],
  positions: PositionLite[],
  horizonteMeses: number = 12,
  lookbackMeses: number = 24,
): ProjecaoMes[] {
  var now = new Date();
  var nowTs = now.getTime();
  var lookbackMs = lookbackMeses * 30.4375 * 86400000;

  // Mapa qty atual
  var qtyAtual: Record<string, number> = {};
  positions.forEach(function (p) {
    if (p.quantidade > 0) qtyAtual[p.ticker] = p.quantidade;
  });

  // Para cada ticker, quais meses (0-11) historicamente paga e com que valor medio liquido
  // Estrutura: sazonal[ticker][monthIdx 0-11] = { soma: number, count: number, qtyMedia: number }
  type SazonalBucket = { soma: number; count: number; qtyMedia: number };
  var sazonal: Record<string, SazonalBucket[]> = {};
  var qtyHistAcc: Record<string, { soma: number; count: number }> = {};

  enriched.forEach(function (pv) {
    if (Number.isNaN(pv.ts)) return;
    // Apenas passado, ate lookbackMeses atras
    if (pv.ts > nowTs) return;
    if (pv.ts < nowTs - lookbackMs) return;
    if (!qtyAtual[pv.ticker]) return; // so projeta tickers ativos

    var m = pv.date.getMonth();
    if (!sazonal[pv.ticker]) {
      sazonal[pv.ticker] = [];
      for (var i = 0; i < 12; i++) sazonal[pv.ticker].push({ soma: 0, count: 0, qtyMedia: 0 });
    }
    var bucket = sazonal[pv.ticker][m];
    var liquido = valorLiquido(pv.valor_total || 0, pv.tipo_provento, pv.ticker);
    bucket.soma += liquido;
    bucket.count += 1;

    // qty estimada no momento do provento: valor_total / valor_por_cota nao disponivel aqui,
    // ficamos com a tendencia geral (aproximacao: assume qty_hist ~ qty_atual).
    // Ajuste fino ficaria via (valor_total / valor_por_cota) se passarmos o raw.
  });

  // Normaliza qty historica por ticker (soma / count das qty ao longo do periodo) -> ainda
  // aproximado. Usamos qty_atual como referencia, sem ajuste forte (evita over-amplify).
  Object.keys(sazonal).forEach(function (tk) {
    var agg = qtyHistAcc[tk];
    if (agg && agg.count > 0) {
      var qtyMed = agg.soma / agg.count;
      sazonal[tk].forEach(function (b) { b.qtyMedia = qtyMed; });
    }
  });

  // Overlay confirmados: proventos futuros ja anunciados (data_pagamento > now)
  var confirmadosPorMes: Record<string, { ticker: string; valor: number }[]> = {};
  enriched.forEach(function (pv) {
    if (pv.ts <= nowTs) return;
    var k = keyMes(pv.date);
    if (!confirmadosPorMes[k]) confirmadosPorMes[k] = [];
    confirmadosPorMes[k].push({
      ticker: pv.ticker,
      valor: valorLiquido(pv.valor_total || 0, pv.tipo_provento, pv.ticker),
    });
  });

  // Monta array de meses futuros
  var out: ProjecaoMes[] = [];
  for (var i = 1; i <= horizonteMeses; i++) {
    var d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    var mesIdx = d.getMonth();
    var k = keyMes(d);

    var items: { ticker: string; valor: number; fonte: 'historico' | 'confirmado' }[] = [];
    var estimadoMes = 0;

    Object.keys(sazonal).forEach(function (tk) {
      var bucket = sazonal[tk][mesIdx];
      if (!bucket || bucket.count === 0) return;
      // Media simples por evento no mes (mesmo mes pode ter 1 pgto por ano ou mais)
      // Se olhamos 24m, esperamos count <= 2 por mes_calendario. Usamos media.
      var mediaEvento = bucket.soma / bucket.count;
      // Ajuste por qty: se temos qtyMedia > 0, escala. Senao, usa valor cru.
      var fator = bucket.qtyMedia > 0 ? (qtyAtual[tk] / bucket.qtyMedia) : 1;
      if (!Number.isFinite(fator) || fator <= 0) fator = 1;
      var contrib = mediaEvento * fator;
      if (contrib > 0) {
        items.push({ ticker: tk, valor: contrib, fonte: 'historico' });
        estimadoMes += contrib;
      }
    });

    // Overlay confirmados
    var confirmadoMes = 0;
    var confs = confirmadosPorMes[k];
    if (confs) {
      confs.forEach(function (c) {
        confirmadoMes += c.valor;
        items.push({ ticker: c.ticker, valor: c.valor, fonte: 'confirmado' });
      });
    }

    // Se ha confirmado, ele substitui (ou complementa) a estimativa historica do mesmo ticker?
    // Conservador: usamos MAX(estimadoPorTicker, confirmadoPorTicker) para nao dobrar.
    // Simplificacao: aqui somamos separado (confirmado + estimado dos OUTROS tickers).
    // Dedup: se ticker tem confirmado, remove sua estimativa historica.
    if (confs && confs.length > 0) {
      var tickersConfirmados: Record<string, boolean> = {};
      confs.forEach(function (c) { tickersConfirmados[c.ticker] = true; });
      var estimadoAjustado = 0;
      var itemsAjustados: typeof items = [];
      items.forEach(function (it) {
        if (it.fonte === 'historico' && tickersConfirmados[it.ticker]) return; // dedup
        itemsAjustados.push(it);
        if (it.fonte === 'historico') estimadoAjustado += it.valor;
      });
      estimadoMes = estimadoAjustado;
      items = itemsAjustados;
    }

    // Ordena itens por valor desc
    items.sort(function (a, b) { return b.valor - a.valor; });

    out.push({
      mesISO: k,
      label: labelMes(d),
      estimado: estimadoMes,
      confirmado: confirmadoMes,
      total: estimadoMes + confirmadoMes,
      items: items,
    });
  }

  return out;
}

// Helper pra KPI "Proximos 30 dias": soma estimado + confirmado do primeiro mes da projecao
// (proxy razoavel; para precisao real use janela 30d corrida).
export function proximos30dias(projecao: ProjecaoMes[]): number {
  if (projecao.length === 0) return 0;
  return projecao[0].total;
}

// Soma total projetada do horizonte completo
export function totalProjetado(projecao: ProjecaoMes[]): number {
  return projecao.reduce(function (acc, m) { return acc + m.total; }, 0);
}
