var supabaseModule = require('../config/supabase');
var supabase = supabaseModule.supabase;

var CACHE = {};
var CACHE_TTL = 300000; // 5 min
var _lastCallTs = 0;
var COOLDOWN = 10000; // 10s

function clearGeminiCache() {
  CACHE = {};
}

function buildCacheKey(data) {
  var s = Math.round((data.spot || 0) * 100);
  var iv = Math.round((data.iv || 0) * 10);
  var dte = data.dte || 0;
  var obj = data.objetivo || 'renda';
  var cap = data.capital ? Math.round(data.capital) : 0;

  // Include legs in cache key
  var legsKey = '';
  var legs = data.legs || [];
  for (var i = 0; i < legs.length; i++) {
    var lg = legs[i];
    legsKey += (lg.tipo || '') + (lg.direcao || '') + Math.round((lg.strike || 0) * 100) + Math.round((lg.premio || 0) * 100) + (lg.qty || 0);
  }

  // Fallback single-leg key if no legs array
  if (!legsKey) {
    legsKey = (data.tipo || '') + (data.direcao || '') + Math.round((data.strike || 0) * 100) + Math.round((data.premio || 0) * 100) + (data.qty || 0);
  }

  return s + ':' + iv + ':' + dte + ':' + obj + ':' + cap + ':' + legsKey;
}

function analyzeOption(data) {
  return new Promise(function(resolve) {
    // Rate limit
    var now = Date.now();
    if (now - _lastCallTs < COOLDOWN) {
      var wait = Math.ceil((COOLDOWN - (now - _lastCallTs)) / 1000);
      resolve({ error: 'Aguarde ' + wait + ' segundos entre análises.' });
      return;
    }

    // Check cache
    var cacheKey = buildCacheKey(data);
    var cached = CACHE[cacheKey];
    if (cached && (now - cached.ts < CACHE_TTL)) {
      resolve(cached.result);
      return;
    }

    _lastCallTs = now;

    // Get session token for auth
    supabase.auth.getSession().then(function(sessionResult) {
      var session = sessionResult && sessionResult.data ? sessionResult.data.session : null;
      if (!session || !session.access_token) {
        resolve({ error: 'Sessão expirada. Faça login novamente.' });
        return;
      }

      return supabase.functions.invoke('analyze-option', {
        body: data,
        headers: {
          Authorization: 'Bearer ' + session.access_token,
        },
      });
    }).then(function(response) {
      if (!response) return; // already resolved above

      var result = response.data;
      var error = response.error;

      if (error) {
        var errMsg = '';
        if (error.message) errMsg = error.message;
        if (error.context && error.context.statusText) errMsg = errMsg + ' (' + error.context.statusText + ')';
        console.warn('Edge Function error:', errMsg, error);
        resolve({ error: 'Erro no serviço: ' + (errMsg || 'tente novamente') });
        return;
      }

      if (!result) {
        resolve({ error: 'Resposta vazia do serviço. Tente novamente.' });
        return;
      }

      // Edge function returns { error: '...' } on failure
      if (result.error) {
        resolve({ error: result.error });
        return;
      }

      // Success — result has { risco, estrategias, cenarios, educacional }
      CACHE[cacheKey] = { ts: Date.now(), result: result };
      resolve(result);
    }).catch(function(err) {
      var msg = err && err.message ? err.message : String(err);
      console.warn('analyzeOption catch:', msg);
      resolve({ error: 'Falha de conexão: ' + msg });
    });
  });
}

module.exports = {
  analyzeOption: analyzeOption,
  clearGeminiCache: clearGeminiCache,
};
