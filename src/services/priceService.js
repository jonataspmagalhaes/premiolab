/**
 * priceService.js
 * Busca cotações reais da B3 via brapi.dev (gratuito, sem API key)
 * Retorna preço atual e variação do dia para cada ticker
 */

const BRAPI_URL = 'https://brapi.dev/api/quote/';

/**
 * Busca cotações para uma lista de tickers
 * @param {string[]} tickers - ex: ['PETR4', 'VALE3', 'HGLG11']
 * @returns {Object} { PETR4: { price, change, changePercent }, ... }
 */
export async function fetchPrices(tickers) {
  if (!tickers || tickers.length === 0) return {};

  try {
    const tickerStr = tickers.join(',');
    const response = await fetch(BRAPI_URL + tickerStr + '?fundamental=false', {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) return {};

    const json = await response.json();
    const results = json.results || [];

    const prices = {};
    results.forEach((r) => {
      if (r.symbol && r.regularMarketPrice != null) {
        prices[r.symbol] = {
          price: r.regularMarketPrice,
          change: r.regularMarketChange || 0,
          changePercent: r.regularMarketChangePercent || 0,
          previousClose: r.regularMarketPreviousClose || 0,
          updatedAt: r.regularMarketTime || null,
        };
      }
    });

    return prices;
  } catch (err) {
    console.warn('fetchPrices error:', err.message);
    return {};
  }
}

/**
 * Busca histórico de preços (últimos 30 dias) para sparklines
 * @param {string[]} tickers
 * @returns {Object} { PETR4: [34.2, 34.5, 35.1, ...], ... }
 */
export async function fetchPriceHistory(tickers) {
  if (!tickers || tickers.length === 0) return {};

  try {
    const tickerStr = tickers.join(',');
    const response = await fetch(
      BRAPI_URL + tickerStr + '?range=1mo&interval=1d&fundamental=false',
      { method: 'GET', headers: { 'Accept': 'application/json' } }
    );

    if (!response.ok) return {};

    const json = await response.json();
    const results = json.results || [];
    const history = {};

    results.forEach((r) => {
      if (r.symbol && r.historicalDataPrice && r.historicalDataPrice.length > 0) {
        history[r.symbol] = r.historicalDataPrice.map((d) => d.close).filter((v) => v != null);
      }
    });

    return history;
  } catch (err) {
    console.warn('fetchPriceHistory error:', err.message);
    return {};
  }
}

/**
 * Enriquece posições com preço atual e variação vs PM
 * @param {Array} positions - [{ ticker, quantidade, pm, ... }]
 * @returns {Array} positions com campos adicionais: preco_atual, variacao_pct, pl
 */
export async function enrichPositionsWithPrices(positions) {
  if (!positions || positions.length === 0) return [];

  const tickers = positions.map((p) => p.ticker).filter(Boolean);
  const prices = await fetchPrices(tickers);

  return positions.map((p) => {
    const quote = prices[p.ticker];
    if (!quote) {
      return { ...p, preco_atual: null, variacao_pct: null, pl: null, change_day: null };
    }

    const precoAtual = quote.price;
    const pm = p.pm || 0;
    const qty = p.quantidade || 0;

    // Variação vs preço médio (ganho/perda total em %)
    const variacao_pct = pm > 0 ? ((precoAtual - pm) / pm) * 100 : 0;

    // P&L em reais
    const pl = (precoAtual - pm) * qty;

    // Variação do dia (%)
    const change_day = quote.changePercent || 0;

    return {
      ...p,
      preco_atual: precoAtual,
      variacao_pct,
      pl,
      change_day,
    };
  });
}
