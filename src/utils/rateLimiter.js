// ═══════════════════════════════════════════════════════════
// Rate Limiter — proteção contra brute-force e abuso
// Rastreia tentativas falhas e aplica cooldown exponencial
// ═══════════════════════════════════════════════════════════

var attempts = {};

// Cooldown tiers (segundos): 0, 0, 0, 30, 60, 120, 300
var COOLDOWN_TIERS = [0, 0, 0, 30, 60, 120, 300];

function getState(key) {
  if (!attempts[key]) {
    attempts[key] = { count: 0, lockedUntil: 0 };
  }
  return attempts[key];
}

// Verifica se esta em cooldown. Retorna segundos restantes (0 = liberado)
function getRemainingCooldown(key) {
  var state = getState(key);
  if (state.lockedUntil <= 0) return 0;
  var now = Date.now();
  var remaining = Math.ceil((state.lockedUntil - now) / 1000);
  return remaining > 0 ? remaining : 0;
}

// Registra uma tentativa falha e aplica cooldown se necessario
function recordFailure(key) {
  var state = getState(key);
  state.count = state.count + 1;
  var tierIdx = state.count < COOLDOWN_TIERS.length ? state.count : COOLDOWN_TIERS.length - 1;
  var cooldownSec = COOLDOWN_TIERS[tierIdx];
  if (cooldownSec > 0) {
    state.lockedUntil = Date.now() + cooldownSec * 1000;
  }
  return cooldownSec;
}

// Registra sucesso — reseta contador
function recordSuccess(key) {
  attempts[key] = { count: 0, lockedUntil: 0 };
}

// Retorna contagem de falhas
function getFailureCount(key) {
  var state = getState(key);
  return state.count;
}

// Reseta estado para uma chave
function reset(key) {
  attempts[key] = { count: 0, lockedUntil: 0 };
}

// Formata segundos em "Xs" ou "Xmin Ys"
function formatCooldown(seconds) {
  if (seconds <= 0) return '';
  if (seconds < 60) return seconds + 's';
  var min = Math.floor(seconds / 60);
  var sec = seconds % 60;
  if (sec === 0) return min + 'min';
  return min + 'min ' + sec + 's';
}

module.exports = {
  getRemainingCooldown: getRemainingCooldown,
  recordFailure: recordFailure,
  recordSuccess: recordSuccess,
  getFailureCount: getFailureCount,
  reset: reset,
  formatCooldown: formatCooldown,
};
