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

// Cache key completa: inclui portfolio, indicadores e analise tecnica
function buildCacheKey(data) {
  var s = Math.round((data.spot || 0) * 100);
  var iv = Math.round((data.iv || 0) * 10);
  var dte = data.dte || 0;
  var obj = data.objetivo || 'renda';
  var cap = data.capital ? Math.round(data.capital) : 0;

  // Legs hash
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

  // Portfolio hash — total e qtd de ativos
  var portHash = '';
  if (data.portfolio && data.portfolio.total) {
    portHash = Math.round(data.portfolio.total / 100) + ':' + (data.portfolio.ativos ? data.portfolio.ativos.length : 0);
  }

  // Position hash — qty e PM do ativo base
  var posHash = '';
  if (data.position) {
    posHash = (data.position.quantidade || 0) + ':' + Math.round((data.position.pm || 0) * 100);
  }

  // Indicators hash
  var indHash = '';
  if (data.indicators) {
    var ind = data.indicators;
    indHash = Math.round((ind.hv_20 || 0) * 10) + ':' + Math.round((ind.rsi_14 || 0));
  }

  // Technical summary hash (first 50 chars)
  var techHash = '';
  if (data.technicalSummary) {
    techHash = data.technicalSummary.substring(0, 50).length;
  }

  return s + ':' + iv + ':' + dte + ':' + obj + ':' + cap + ':' + legsKey + ':' + portHash + ':' + posHash + ':' + indHash + ':' + techHash;
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

// ═══ Streaming analysis via SSE ═══
function analyzeOptionStream(data, onChunk, onDone, onError) {
  var now = Date.now();
  if (now - _lastCallTs < COOLDOWN) {
    var wait = Math.ceil((COOLDOWN - (now - _lastCallTs)) / 1000);
    if (onError) onError('Aguarde ' + wait + ' segundos entre análises.');
    return function() {};
  }

  var cacheKey = buildCacheKey(data);
  var cached = CACHE[cacheKey];
  if (cached && (now - cached.ts < CACHE_TTL)) {
    if (onDone) onDone(cached.result);
    return function() {};
  }

  _lastCallTs = now;
  var aborted = false;

  // Auto-inject investor profile then start stream
  supabase.auth.getSession().then(function(sr) {
    var sess = sr && sr.data ? sr.data.session : null;
    var uid = sess && sess.user ? sess.user.id : null;
    if (!uid) {
      if (onError) onError('Sessão expirada. Faça login novamente.');
      return;
    }

    return _getInvestorProfile(uid).then(function(profile) {
      data.perfilInvestidor = profile;
      return sess;
    });
  }).then(function(sess) {
    if (!sess || aborted) return;

    var fnUrl = 'https://zephynezarjsxzselozi.supabase.co/functions/v1/analyze-option';

    var payload = Object.assign({}, data, { stream: true });

    return fetch(fnUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + sess.access_token,
      },
      body: JSON.stringify(payload),
    });
  }).then(function(response) {
    if (!response || aborted) return;

    if (!response.ok) {
      if (onError) onError('Erro HTTP ' + response.status);
      return;
    }

    var contentType = response.headers.get('content-type') || '';
    // If server returned JSON instead of SSE (error case), handle it
    if (contentType.indexOf('application/json') !== -1) {
      return response.json().then(function(json) {
        if (json && json.error) {
          if (onError) onError(json.error);
        } else if (onDone) {
          onDone(json);
        }
      });
    }

    // ═══ SSE parser — robust to fragmentation ═══
    // SSE format: "event: <type>\ndata: <json>\n\n"
    // Events may arrive split across chunks.
    function processSSEBuffer(buffer) {
      // Returns { events: [{type, data}], remaining: string }
      var events = [];
      var remaining = buffer;

      // Each SSE event is terminated by a blank line (\n\n)
      var idx;
      while ((idx = remaining.indexOf('\n\n')) !== -1) {
        var block = remaining.slice(0, idx);
        remaining = remaining.slice(idx + 2);

        var evtType = 'text';
        var evtData = '';
        var blockLines = block.split('\n');
        for (var bi = 0; bi < blockLines.length; bi++) {
          var bl = blockLines[bi];
          if (bl.indexOf('event: ') === 0) {
            evtType = bl.slice(7).trim();
          } else if (bl.indexOf('data: ') === 0) {
            evtData = bl.slice(6).trim();
          }
        }
        if (evtData) {
          events.push({ type: evtType, data: evtData });
        }
      }

      return { events: events, remaining: remaining };
    }

    function handleSSEEvents(events) {
      // Returns true if stream should stop (done/error received)
      for (var ei = 0; ei < events.length; ei++) {
        var evt = events[ei];
        try {
          var parsed = JSON.parse(evt.data);
          if (evt.type === 'text' && parsed.t) {
            if (onChunk) onChunk(parsed.t);
          } else if (evt.type === 'done') {
            CACHE[cacheKey] = { ts: Date.now(), result: parsed };
            if (onDone) onDone(parsed);
            return true;
          } else if (evt.type === 'error') {
            if (onError) onError(parsed.error || 'Erro durante streaming.');
            return true;
          }
        } catch (_) { /* skip non-JSON */ }
      }
      return false;
    }

    // Try ReadableStream (works in modern RN / web)
    // Fallback to response.text() for Hermes without streaming support
    var hasReader = response.body && typeof response.body.getReader === 'function';

    if (hasReader && typeof TextDecoder !== 'undefined') {
      var reader = response.body.getReader();
      var decoder = new TextDecoder();
      var sseBuffer = '';

      function readChunk() {
        if (aborted) return;
        return reader.read().then(function(result) {
          if (result.done || aborted) return;

          sseBuffer += decoder.decode(result.value, { stream: true });
          var parsed = processSSEBuffer(sseBuffer);
          sseBuffer = parsed.remaining;

          if (handleSSEEvents(parsed.events)) return; // done or error
          return readChunk();
        });
      }

      return readChunk();
    } else {
      // Hermes fallback: read entire response as text, then parse SSE events
      return response.text().then(function(fullText) {
        if (aborted) return;
        var parsed = processSSEBuffer(fullText + '\n\n');
        handleSSEEvents(parsed.events);
      });
    }
  }).catch(function(err) {
    if (aborted) return;
    var msg = err && err.message ? err.message : String(err);
    console.warn('Stream error:', msg);
    if (onError) onError('Falha de conexão: ' + msg);
  });

  // Return abort function
  return function() { aborted = true; };
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
  analyzeOptionStream: analyzeOptionStream,
  analyzeGeneral: analyzeGeneral,
  clearGeminiCache: clearGeminiCache,
};
