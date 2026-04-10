// marketIndicatorsService.js
// Fonte unica de indicadores macro (Selic, IPCA) pra projecoes de renda fixa.
// Puxa da API publica do Banco Central (BCB SGS) — sem auth, sem chave.
//
// Series usadas:
//  - 432: Meta Selic definida pelo Copom (% a.a., ultimo valor)
//  - 433: IPCA mensal (variacao %, somamos 12 ultimos pra ter ~anual)
//
// Cache em memoria 24h (valores nao mudam diario, Copom reune ~45 dias, IPCA mensal).

var BCB_BASE = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.';
var CACHE_TTL_MS = 24 * 60 * 60 * 1000;

var cache = {
  selic: null,
  selicAt: 0,
  ipca: null,
  ipcaAt: 0,
};

// Fallbacks defensivos se a API do BCB ficar offline
var FALLBACK_SELIC = 10.75;
var FALLBACK_IPCA = 4.5;

function isFresh(ts) {
  return ts > 0 && (Date.now() - ts) < CACHE_TTL_MS;
}

export async function fetchSelicAnual() {
  if (isFresh(cache.selicAt) && cache.selic != null) return cache.selic;
  try {
    var url = BCB_BASE + '432/dados/ultimos/1?formato=json';
    var res = await fetch(url);
    if (!res.ok) throw new Error('bcb http ' + res.status);
    var data = await res.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error('bcb selic vazio');
    var v = parseFloat(String(data[0].valor).replace(',', '.'));
    if (!isFinite(v) || v <= 0) throw new Error('bcb selic invalido');
    cache.selic = v;
    cache.selicAt = Date.now();
    return v;
  } catch (err) {
    console.warn('fetchSelicAnual fallback:', err && err.message);
    return cache.selic != null ? cache.selic : FALLBACK_SELIC;
  }
}

export async function fetchIpca12m() {
  if (isFresh(cache.ipcaAt) && cache.ipca != null) return cache.ipca;
  try {
    var url = BCB_BASE + '433/dados/ultimos/12?formato=json';
    var res = await fetch(url);
    if (!res.ok) throw new Error('bcb http ' + res.status);
    var data = await res.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error('bcb ipca vazio');
    // Soma simples dos 12 ultimos meses (aproximacao — tecnicamente deveria
    // ser composto, mas pra projecao mensal linear a diferenca e < 0.1 p.p.)
    var sum = 0;
    for (var i = 0; i < data.length; i++) {
      var v = parseFloat(String(data[i].valor).replace(',', '.'));
      if (isFinite(v)) sum += v;
    }
    if (sum <= 0) throw new Error('bcb ipca zero');
    cache.ipca = sum;
    cache.ipcaAt = Date.now();
    return sum;
  } catch (err) {
    console.warn('fetchIpca12m fallback:', err && err.message);
    return cache.ipca != null ? cache.ipca : FALLBACK_IPCA;
  }
}

// Helper pra buscar os dois em paralelo
export async function fetchMarketIndicators() {
  var results = await Promise.all([
    fetchSelicAnual().catch(function() { return FALLBACK_SELIC; }),
    fetchIpca12m().catch(function() { return FALLBACK_IPCA; }),
  ]);
  return { selic: results[0], ipca: results[1] };
}

export function clearMarketIndicatorsCache() {
  cache.selic = null;
  cache.selicAt = 0;
  cache.ipca = null;
  cache.ipcaAt = 0;
}
