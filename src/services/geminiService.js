var supabaseModule = require('../config/supabase');
var supabase = supabaseModule.supabase;
var database = require('./database');

var CACHE = {};
var CACHE_TTL = 300000; // 5 min
var _lastCallTs = 0;
var COOLDOWN = 10000; // 10s
var _profileCache = null;
var _profileCacheTs = 0;
var PROFILE_CACHE_TTL = 600000; // 10 min

function _getInvestorProfile(userId) {
  var now = Date.now();
  if (_profileCache && (now - _profileCacheTs < PROFILE_CACHE_TTL)) {
    return Promise.resolve(_profileCache);
  }
  return database.getProfile(userId).then(function(result) {
    var data = result && result.data ? result.data : {};
    var profile = {
      perfil: data.perfil_investidor || '',
      objetivo: data.objetivo_investimento || '',
      horizonte: data.horizonte_investimento || '',
    };
    if (profile.perfil || profile.objetivo || profile.horizonte) {
      _profileCache = profile;
      _profileCacheTs = Date.now();
    }
    return profile;
  }).catch(function() {
    return { perfil: '', objetivo: '', horizonte: '' };
  });
}

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

function _invokeEdgeFunction(functionName, data) {
  return new Promise(function(resolve) {
    supabase.auth.getSession().then(function(sessionResult) {
      var session = sessionResult && sessionResult.data ? sessionResult.data.session : null;
      if (!session || !session.access_token) {
        resolve({ error: 'Sessão expirada. Faça login novamente.' });
        return;
      }

      return supabase.functions.invoke(functionName, {
        body: data,
        headers: {
          Authorization: 'Bearer ' + session.access_token,
        },
      });
    }).then(function(response) {
      if (!response) return;

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

      if (result.error) {
        resolve({ error: result.error });
        return;
      }

      resolve(result);
    }).catch(function(err) {
      var msg = err && err.message ? err.message : String(err);
      console.warn('Edge Function catch:', msg);
      resolve({ error: 'Falha de conexão: ' + msg });
    });
  });
}

function analyzeOption(data) {
  return new Promise(function(resolve) {
    var now = Date.now();
    if (now - _lastCallTs < COOLDOWN) {
      var wait = Math.ceil((COOLDOWN - (now - _lastCallTs)) / 1000);
      resolve({ error: 'Aguarde ' + wait + ' segundos entre análises.' });
      return;
    }

    var cacheKey = buildCacheKey(data);
    var cached = CACHE[cacheKey];
    if (cached && (now - cached.ts < CACHE_TTL)) {
      resolve(cached.result);
      return;
    }

    _lastCallTs = now;

    // Auto-inject investor profile
    supabase.auth.getSession().then(function(sr) {
      var sess = sr && sr.data ? sr.data.session : null;
      var uid = sess && sess.user ? sess.user.id : null;
      if (!uid) return data;
      return _getInvestorProfile(uid).then(function(profile) {
        data.perfilInvestidor = profile;
        return data;
      });
    }).then(function(enrichedData) {
      return _invokeEdgeFunction('analyze-option', enrichedData || data);
    }).then(function(result) {
      if (!result.error) {
        CACHE[cacheKey] = { ts: Date.now(), result: result };
      }
      resolve(result);
    });
  });
}

function buildGeneralCacheKey(data) {
  var type = data.type || 'resumo';
  var ticker = data.ticker || '';
  var pat = Math.round((data.patrimonio || 0) / 100);
  return 'gen:' + type + ':' + ticker + ':' + pat;
}

function analyzeGeneral(data) {
  return new Promise(function(resolve) {
    var now = Date.now();
    if (now - _lastCallTs < COOLDOWN) {
      var wait = Math.ceil((COOLDOWN - (now - _lastCallTs)) / 1000);
      resolve({ error: 'Aguarde ' + wait + ' segundos entre análises.' });
      return;
    }

    var cacheKey = buildGeneralCacheKey(data);
    var cached = CACHE[cacheKey];
    if (cached && (now - cached.ts < CACHE_TTL)) {
      resolve(cached.result);
      return;
    }

    _lastCallTs = now;

    // Auto-inject investor profile
    supabase.auth.getSession().then(function(sr) {
      var sess = sr && sr.data ? sr.data.session : null;
      var uid = sess && sess.user ? sess.user.id : null;
      if (!uid) return data;
      return _getInvestorProfile(uid).then(function(profile) {
        data.perfilInvestidor = profile;
        return data;
      });
    }).then(function(enrichedData) {
      return _invokeEdgeFunction('analyze-general', enrichedData || data);
    }).then(function(result) {
      if (!result.error) {
        CACHE[cacheKey] = { ts: Date.now(), result: result };
      }
      resolve(result);
    });
  });
}

module.exports = {
  analyzeOption: analyzeOption,
  analyzeGeneral: analyzeGeneral,
  clearGeminiCache: clearGeminiCache,
};
