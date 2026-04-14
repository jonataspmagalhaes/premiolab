var supabaseModule = require('../config/supabase');
var supabase = supabaseModule.supabase;

// ═══════════ AI USAGE SERVICE ═══════════
// Controle de limites e créditos de IA

var DAILY_LIMIT = 5;
var MONTHLY_LIMIT = 100;

function getAiUsageToday(userId) {
  return supabase.rpc('get_ai_usage_today', { p_user_id: userId })
    .then(function(result) {
      return { count: result.data || 0, error: result.error };
    })
    .catch(function(e) {
      return { count: 0, error: e };
    });
}

function getAiUsageMonth(userId) {
  return supabase.rpc('get_ai_usage_month', { p_user_id: userId })
    .then(function(result) {
      return { count: result.data || 0, error: result.error };
    })
    .catch(function(e) {
      return { count: 0, error: e };
    });
}

function getAiCreditsExtra(userId) {
  return supabase
    .from('profiles')
    .select('ai_credits_extra')
    .eq('id', userId)
    .single()
    .then(function(result) {
      var credits = (result.data && result.data.ai_credits_extra) || 0;
      return { credits: credits, error: result.error };
    })
    .catch(function(e) {
      return { credits: 0, error: e };
    });
}

function logAiUsage(userId, tipo, tokensIn, tokensOut, custoEstimado, resultadoId) {
  var row = {
    user_id: userId,
    tipo: tipo || 'opcao',
    tokens_in: tokensIn || 0,
    tokens_out: tokensOut || 0,
    custo_estimado: custoEstimado || 0,
    resultado_id: resultadoId || null,
  };
  return supabase
    .from('ai_usage')
    .insert(row)
    .then(function(result) {
      return { error: result.error };
    })
    .catch(function(e) {
      return { error: e };
    });
}

function getAiUsageSummary(userId) {
  return Promise.all([
    getAiUsageToday(userId),
    getAiUsageMonth(userId),
    getAiCreditsExtra(userId),
  ]).then(function(results) {
    return {
      today: results[0].count,
      month: results[1].count,
      credits: results[2].credits,
      dailyLimit: DAILY_LIMIT,
      monthlyLimit: MONTHLY_LIMIT,
    };
  });
}

// Check if user can make an AI request. Returns { allowed, reason, usedCredit }
function checkAiLimit(userId) {
  return getAiUsageSummary(userId).then(function(summary) {
    // Under daily limit from plan
    if (summary.today < DAILY_LIMIT) {
      return { allowed: true, reason: null, usedCredit: false, summary: summary };
    }
    // Daily limit reached — check extra credits
    if (summary.credits > 0) {
      return { allowed: true, reason: null, usedCredit: true, summary: summary };
    }
    // Check monthly limit
    if (summary.month >= MONTHLY_LIMIT) {
      return {
        allowed: false,
        reason: 'Limite mensal atingido (' + MONTHLY_LIMIT + ' análises). Adquira créditos extras.',
        usedCredit: false,
        summary: summary,
      };
    }
    return {
      allowed: false,
      reason: 'Limite diário atingido (' + DAILY_LIMIT + ' análises). Adquira créditos extras ou tente amanhã.',
      usedCredit: false,
      summary: summary,
    };
  });
}

module.exports = {
  getAiUsageToday: getAiUsageToday,
  getAiUsageMonth: getAiUsageMonth,
  getAiCreditsExtra: getAiCreditsExtra,
  logAiUsage: logAiUsage,
  getAiUsageSummary: getAiUsageSummary,
  checkAiLimit: checkAiLimit,
  DAILY_LIMIT: DAILY_LIMIT,
  MONTHLY_LIMIT: MONTHLY_LIMIT,
};
