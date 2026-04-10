// ═══════════════════════════════════════════════════════════
// Subscription Features — tiers, features, limites, helpers
// ═══════════════════════════════════════════════════════════

var ADMIN_EMAILS = ['jonataspmagalhaes@gmail.com'];

var TIERS = { FREE: 'free', PRO: 'pro', PREMIUM: 'premium' };

var TIER_ORDER = { free: 0, pro: 1, premium: 2 };

var TIER_LABELS = { free: 'Free', pro: 'PRO', premium: 'Premium' };

var TIER_COLORS = { free: '#666688', pro: '#3B82F6', premium: '#8B5CF6' };

var FEATURES = {
  POSITIONS_UNLIMITED: 'pro',
  OPTIONS_UNLIMITED: 'pro',
  TECHNICAL_CHART: 'pro',
  INDICATORS: 'pro',
  FUNDAMENTALS: 'pro',
  ANALYSIS_TAB: 'pro',
  REPORTS: 'pro',
  CSV_IMPORT: 'pro',
  AUTO_SYNC_DIVIDENDS: 'pro',
  FINANCES: 'pro',
  AI_ANALYSIS: 'disabled',
  SAVED_ANALYSES: 'disabled',
  AI_SUMMARY: 'pro',
};

var FEATURE_LABELS = {
  POSITIONS_UNLIMITED: 'Posições ilimitadas',
  OPTIONS_UNLIMITED: 'Opções ilimitadas',
  TECHNICAL_CHART: 'Gráfico técnico anotado',
  INDICATORS: 'Indicadores técnicos',
  FUNDAMENTALS: 'Indicadores fundamentalistas',
  ANALYSIS_TAB: 'Análise Completa',
  REPORTS: 'Relatórios detalhados',
  CSV_IMPORT: 'Importar CSV/B3',
  AUTO_SYNC_DIVIDENDS: 'Auto-sync dividendos',
  FINANCES: 'Finanças (orçamento)',
  AI_ANALYSIS: 'Análise IA (desativado)',
  SAVED_ANALYSES: 'Análises salvas (desativado)',
  AI_SUMMARY: 'Resumo IA semanal',
};

var LIMITS = {
  FREE_POSITIONS: 5,
  FREE_OPTIONS: 3,
};

// Fase I reconstrucao: novo posicionamento premium R$14,90/mes ou R$149/ano
// (~16% off anual). Justificado pelas features de renda novas (RendaPotencial,
// Gerador, Calendario unificado, Snowball, Covered Call, Score).
var PRICES = {
  pro: {
    monthly: 14.90,
    annual: 149.00,
    annualMonthlyEquivalent: 12.42, // 149/12 — mostrar como "R$ 12,42/mes"
    annualDiscountPct: 17,           // ~ economia vs mensal
  },
};

function isAdminEmail(email) {
  if (!email) return false;
  return ADMIN_EMAILS.indexOf(email.toLowerCase().trim()) >= 0;
}

function tierMeetsMin(userTier, requiredTier) {
  if (requiredTier === 'disabled') return false;
  var userOrder = TIER_ORDER[userTier] || 0;
  var reqOrder = TIER_ORDER[requiredTier] || 0;
  return userOrder >= reqOrder;
}

function getRequiredTier(featureKey) {
  return FEATURES[featureKey] || 'pro';
}

// ═══════════ REFERRAL ═══════════

var REFERRAL_THRESHOLDS = [
  { count: 5, rewardTier: 'premium', rewardDays: 30 },
  { count: 3, rewardTier: 'pro', rewardDays: 30 },
];

function generateReferralCode() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var code = '';
  for (var i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return 'PL-' + code;
}

function isValidTier(tier) {
  return tier === 'pro' || tier === 'premium';
}

module.exports = {
  ADMIN_EMAILS: ADMIN_EMAILS,
  TIERS: TIERS,
  TIER_ORDER: TIER_ORDER,
  TIER_LABELS: TIER_LABELS,
  TIER_COLORS: TIER_COLORS,
  FEATURES: FEATURES,
  FEATURE_LABELS: FEATURE_LABELS,
  LIMITS: LIMITS,
  PRICES: PRICES,
  REFERRAL_THRESHOLDS: REFERRAL_THRESHOLDS,
  isAdminEmail: isAdminEmail,
  tierMeetsMin: tierMeetsMin,
  getRequiredTier: getRequiredTier,
  generateReferralCode: generateReferralCode,
  isValidTier: isValidTier,
};
