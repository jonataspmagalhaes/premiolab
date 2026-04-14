import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Share } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import Toast from 'react-native-toast-message';
import { C, F, SIZE } from '../../theme';
import { Glass } from '../../components';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useAuth } from '../../contexts/AuthContext';
var subFeatures = require('../../constants/subscriptionFeatures');
var aiUsageService = require('../../services/aiUsageService');

var PLAN_FEATURES = [
  { key: 'positions', label: 'Posições na carteira', free: 'Max 5', pro: true, premium: true },
  { key: 'options', label: 'Opções ativas', free: 'Max 3', pro: true, premium: true },
  { key: 'technical', label: 'Gráfico técnico anotado', free: false, pro: true, premium: true },
  { key: 'indicators', label: 'Indicadores técnicos', free: false, pro: true, premium: true },
  { key: 'fundamentals', label: 'Indicadores fundamentalistas', free: false, pro: true, premium: true },
  { key: 'analysis', label: 'Análise Completa', free: false, pro: true, premium: true },
  { key: 'reports', label: 'Relatórios detalhados', free: false, pro: true, premium: true },
  { key: 'import', label: 'Importar CSV/B3', free: false, pro: true, premium: true },
  { key: 'sync', label: 'Auto-sync dividendos', free: false, pro: true, premium: true },
  { key: 'finances', label: 'Finanças (orçamento)', free: false, pro: true, premium: true },
  { key: 'ai', label: 'Análise IA (Claude)', free: false, pro: false, premium: '5/dia' },
  { key: 'saved', label: 'Análises salvas IA', free: false, pro: false, premium: true },
  { key: 'credits', label: 'Créditos IA extras', free: false, pro: false, premium: true },
];

function formatPrice(val) {
  return 'R$ ' + val.toFixed(2).replace('.', ',');
}

function formatDateBR(dateStr) {
  if (!dateStr) return '';
  var parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

export default function PaywallScreen(props) {
  var navigation = props.navigation;
  var sub = useSubscription();
  var auth = useAuth();
  var user = auth.user;

  var _billing = useState('monthly'); var billing = _billing[0]; var setBilling = _billing[1];
  var _purchasing = useState(false); var purchasing = _purchasing[0]; var setPurchasing = _purchasing[1];
  var _startingTrial = useState(''); var startingTrial = _startingTrial[0]; var setStartingTrial = _startingTrial[1];
  var _aiUsage = useState(null); var aiUsage = _aiUsage[0]; var setAiUsage = _aiUsage[1];

  useEffect(function() {
    if (user && user.id && sub.canAccess('AI_ANALYSIS')) {
      aiUsageService.getAiUsageSummary(user.id).then(function(summary) {
        setAiUsage(summary);
      }).catch(function() {});
    }
  }, [user]);

  function getPrice(tier) {
    var prices = subFeatures.PRICES[tier];
    if (!prices) return '';
    if (billing === 'annual') {
      var monthlyEquiv = prices.annual / 12;
      return formatPrice(monthlyEquiv) + '/mês';
    }
    return formatPrice(prices.monthly) + '/mês';
  }

  function getAnnualTotal(tier) {
    var prices = subFeatures.PRICES[tier];
    if (!prices) return '';
    return formatPrice(prices.annual) + '/ano';
  }

  function getSavings(tier) {
    var prices = subFeatures.PRICES[tier];
    if (!prices) return '';
    var savingsVal = (prices.monthly * 12) - prices.annual;
    return 'Economia de ' + formatPrice(savingsVal);
  }

  async function handleStartTrial(trialTier) {
    setStartingTrial(trialTier);
    var result = await sub.startTrial(trialTier);
    setStartingTrial('');
    if (result.error) {
      Alert.alert('Erro', result.error);
    } else if (result.success) {
      Toast.show({
        type: 'success',
        text1: 'Trial ' + subFeatures.TIER_LABELS[trialTier] + ' ativado!',
        text2: '7 dias grátis para explorar todos os recursos.',
      });
      navigation.goBack();
    }
  }

  async function handlePurchase(tier) {
    setPurchasing(true);
    var packageId = tier + '_' + billing;
    var result = await sub.purchase(packageId);
    setPurchasing(false);
    if (result.success) {
      Toast.show({ type: 'success', text1: 'Assinatura ativada!', text2: 'Aproveite o plano ' + subFeatures.TIER_LABELS[tier] + '.' });
      navigation.goBack();
    } else if (result.error && result.error !== 'not_available' && !result.cancelled) {
      Alert.alert('Erro', result.error);
    }
  }

  async function handleRestore() {
    setPurchasing(true);
    var result = await sub.restore();
    setPurchasing(false);
    if (result.error && result.error !== 'not_available') {
      Alert.alert('Erro', result.error);
    } else if (result.success && result.tier && result.tier !== 'free') {
      Toast.show({ type: 'success', text1: 'Compras restauradas!', text2: 'Plano ' + subFeatures.TIER_LABELS[result.tier] + ' ativado.' });
    } else {
      Toast.show({ type: 'info', text1: 'Nenhuma assinatura encontrada.' });
    }
  }

  function renderFeatureRow(feat, tierKey) {
    var val = feat[tierKey];
    if (val === true) {
      return (
        <Ionicons name="checkmark-circle" size={16} color={C.green} />
      );
    }
    if (val === false) {
      return (
        <Ionicons name="close-circle" size={16} color={C.dim} />
      );
    }
    return (
      <Text style={styles.featureLimitText}>{val}</Text>
    );
  }

  function renderTierCard(tierKey, tierLabel, tierColor, isRecommended) {
    var isCurrent = sub.tier === tierKey;
    var isCurrentTrial = sub.trialInfo && sub.trialInfo.tier === tierKey;

    return (
      <Glass key={tierKey} glow={isCurrent ? tierColor : null} padding={16}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Text style={[styles.cardTitle, { color: tierColor }]}>{tierLabel}</Text>
            {isCurrent && (
              <View style={[styles.currentBadge, { backgroundColor: tierColor + '22' }]}>
                <Text style={[styles.currentBadgeText, { color: tierColor }]}>ATUAL</Text>
              </View>
            )}
            {isRecommended && !isCurrent && (
              <View style={[styles.currentBadge, { backgroundColor: C.yellow + '22' }]}>
                <Text style={[styles.currentBadgeText, { color: C.yellow }]}>RECOMENDADO</Text>
              </View>
            )}
          </View>
          {tierKey !== 'free' ? (
            <View>
              <Text style={styles.cardPrice}>{getPrice(tierKey)}</Text>
              {billing === 'annual' && (
                <Text style={styles.cardAnnual}>{getAnnualTotal(tierKey)} · {getSavings(tierKey)}</Text>
              )}
            </View>
          ) : (
            <Text style={styles.cardPrice}>Grátis</Text>
          )}
        </View>

        {/* Trial info */}
        {isCurrentTrial && sub.trialInfo && (
          <View style={styles.trialBar}>
            <View style={styles.trialProgress}>
              <View style={[styles.trialFill, {
                width: ((7 - sub.trialInfo.daysLeft) / 7 * 100) + '%',
                backgroundColor: sub.trialInfo.daysLeft <= 2 ? C.yellow : tierColor,
              }]} />
            </View>
            <Text style={[styles.trialText, sub.trialInfo.daysLeft <= 2 && { color: C.yellow }]}>
              {sub.trialInfo.daysLeft + ' dia' + (sub.trialInfo.daysLeft !== 1 ? 's' : '') + ' restante' + (sub.trialInfo.daysLeft !== 1 ? 's' : '')}
              {' · Até ' + formatDateBR(sub.trialInfo.endDate)}
            </Text>
          </View>
        )}

        {/* Features */}
        <View style={styles.featuresList}>
          {PLAN_FEATURES.map(function(feat) {
            return (
              <View key={feat.key} style={styles.featureRow}>
                {renderFeatureRow(feat, tierKey)}
                <Text style={styles.featureLabel}>{feat.label}</Text>
              </View>
            );
          })}
        </View>

        {/* CTA */}
        {!sub.isAdmin && tierKey !== 'free' && (
          <View style={styles.ctaWrap}>
            {/* Trial button */}
            {sub.tier === 'free' && !isCurrent && (
              <TouchableOpacity
                onPress={function() { handleStartTrial(tierKey); }}
                disabled={startingTrial !== ''}
                activeOpacity={0.8}
                style={styles.trialBtn}
              >
                <LinearGradient
                  colors={[tierColor, tierColor + 'CC']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.ctaGradient}
                >
                  {startingTrial === tierKey ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <Text style={styles.ctaText}>Testar 7 dias grátis</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            )}

            {/* Purchase button */}
            {!isCurrent && (
              <TouchableOpacity
                onPress={function() { handlePurchase(tierKey); }}
                disabled={purchasing}
                activeOpacity={0.8}
                style={styles.purchaseBtn}
              >
                {purchasing ? (
                  <ActivityIndicator color={tierColor} size="small" />
                ) : (
                  <Text style={[styles.purchaseBtnText, { color: tierColor }]}>
                    {isCurrentTrial ? 'Assinar para continuar' : 'Assinar ' + tierLabel}
                  </Text>
                )}
              </TouchableOpacity>
            )}

            {/* Upgrade from PRO to Premium */}
            {isCurrent && tierKey === 'pro' && (
              <TouchableOpacity
                onPress={function() { handlePurchase('premium'); }}
                disabled={purchasing}
                activeOpacity={0.8}
                style={styles.trialBtn}
              >
                <LinearGradient
                  colors={[subFeatures.TIER_COLORS.premium, subFeatures.TIER_COLORS.premium + 'CC']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.ctaGradient}
                >
                  <Text style={styles.ctaText}>Fazer upgrade para Premium</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        )}
      </Glass>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={function() { navigation.goBack(); }}
          accessibilityLabel="Voltar"
          accessibilityRole="button"
        >
          <Text style={styles.back}>{'‹'}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Escolha seu plano</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Admin badge */}
        {sub.isAdmin && (
          <Glass glow={C.green} padding={12}>
            <View style={styles.adminRow}>
              <Ionicons name="shield-checkmark" size={20} color={C.green} />
              <Text style={styles.adminText}>ADMIN — Acesso completo</Text>
            </View>
          </Glass>
        )}

        {/* Billing toggle */}
        <View style={styles.billingToggle}>
          <TouchableOpacity
            onPress={function() { setBilling('monthly'); }}
            style={[styles.billingPill, billing === 'monthly' && styles.billingPillActive]}
          >
            <Text style={[styles.billingPillText, billing === 'monthly' && styles.billingPillTextActive]}>Mensal</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={function() { setBilling('annual'); }}
            style={[styles.billingPill, billing === 'annual' && styles.billingPillActive]}
          >
            <Text style={[styles.billingPillText, billing === 'annual' && styles.billingPillTextActive]}>Anual</Text>
            <View style={styles.saveBadge}>
              <Text style={styles.saveBadgeText}>3 meses grátis</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Tier cards */}
        <View style={styles.cardsWrap}>
          {renderTierCard('free', 'Free', subFeatures.TIER_COLORS.free, false)}
          {renderTierCard('pro', 'PRO', subFeatures.TIER_COLORS.pro, false)}
          {renderTierCard('premium', 'Premium', subFeatures.TIER_COLORS.premium, true)}
        </View>

        {/* Restore */}
        {!sub.isAdmin && (
          <TouchableOpacity
            onPress={handleRestore}
            disabled={purchasing}
            activeOpacity={0.7}
            style={styles.restoreBtn}
          >
            <Text style={styles.restoreText}>Restaurar compras</Text>
          </TouchableOpacity>
        )}

        {/* Referral section */}
        {sub.referralCode && (
          <Glass padding={16}>
            <View style={styles.referralHeader}>
              <Ionicons name="gift-outline" size={20} color={C.accent} />
              <Text style={styles.referralTitle}>Indique amigos</Text>
            </View>
            <Text style={styles.referralDesc}>
              Compartilhe seu código e ganhe meses grátis quando seus amigos assinarem!
            </Text>
            <View style={styles.referralCodeRow}>
              <View style={styles.referralCodeBox}>
                <Text style={styles.referralCodeText}>{sub.referralCode}</Text>
              </View>
              <TouchableOpacity
                onPress={function() {
                  Share.share({
                    message: 'Use meu código ' + sub.referralCode + ' no PremioLab e ganhe dias extras no trial! Baixe em: https://apps.apple.com/app/premiolab',
                  });
                }}
                style={styles.shareBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="share-outline" size={18} color="white" />
                <Text style={styles.shareBtnText}>Compartilhar</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.referralStats}>
              <View style={styles.referralStat}>
                <Text style={styles.referralStatNum}>{sub.referralCount || 0}</Text>
                <Text style={styles.referralStatLabel}>indicados ativos</Text>
              </View>
              <View style={styles.referralStat}>
                <Text style={styles.referralStatNum}>3</Text>
                <Text style={styles.referralStatLabel}>para PRO grátis</Text>
              </View>
              <View style={styles.referralStat}>
                <Text style={styles.referralStatNum}>5</Text>
                <Text style={styles.referralStatLabel}>para Premium grátis</Text>
              </View>
            </View>
          </Glass>
        )}

        {/* AI Credits section (Premium only) */}
        {sub.canAccess('AI_ANALYSIS') && aiUsage ? (
          <Glass padding={16}>
            <View style={styles.referralHeader}>
              <Ionicons name="sparkles-outline" size={20} color={C.accent} />
              <Text style={styles.referralTitle}>Créditos IA</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 12 }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: C.text, fontFamily: F.mono }}>
                  {aiUsage.today + '/' + aiUsage.dailyLimit}
                </Text>
                <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body, marginTop: 2 }}>hoje</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: C.text, fontFamily: F.mono }}>
                  {aiUsage.month + '/' + aiUsage.monthlyLimit}
                </Text>
                <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body, marginTop: 2 }}>este mês</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: C.accent, fontFamily: F.mono }}>
                  {aiUsage.credits}
                </Text>
                <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body, marginTop: 2 }}>extras</Text>
              </View>
            </View>
            <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.body, textAlign: 'center', lineHeight: 16 }}>
              {'Plano Premium inclui ' + aiUsage.dailyLimit + ' análises/dia e ' + aiUsage.monthlyLimit + '/mês. Créditos extras serão usados quando o limite diário for atingido.'}
            </Text>
            {/* Future: purchase credits buttons */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <View style={{ flex: 1, backgroundColor: C.bg, borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: C.border }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, fontFamily: F.mono }}>20</Text>
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.body }}>créditos</Text>
                <Text style={{ fontSize: 11, fontWeight: '600', color: C.accent, fontFamily: F.body, marginTop: 4 }}>R$ 9,90</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: C.bg, borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: C.accent + '40' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, fontFamily: F.mono }}>50</Text>
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.body }}>créditos</Text>
                <Text style={{ fontSize: 11, fontWeight: '600', color: C.accent, fontFamily: F.body, marginTop: 4 }}>R$ 19,90</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: C.bg, borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: C.border }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, fontFamily: F.mono }}>150</Text>
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.body }}>créditos</Text>
                <Text style={{ fontSize: 11, fontWeight: '600', color: C.accent, fontFamily: F.body, marginTop: 4 }}>R$ 44,90</Text>
              </View>
            </View>
            <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.body, textAlign: 'center', marginTop: 8 }}>
              Em breve: compra de créditos via App Store
            </Text>
          </Glass>
        ) : null}

        {/* VIP badge */}
        {sub.isVip && (
          <Glass glow={C.accent} padding={12}>
            <View style={styles.adminRow}>
              <Ionicons name="diamond-outline" size={20} color={C.accent} />
              <Text style={[styles.adminText, { color: C.accent }]}>VIP — Acesso {sub.tierLabel}</Text>
            </View>
          </Glass>
        )}

        <View style={{ height: SIZE.tabBarHeight + 20 }} />
      </ScrollView>
    </View>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 8, paddingHorizontal: 16,
  },
  back: { fontSize: 28, color: C.accent, fontWeight: '300' },
  title: { fontSize: 18, fontWeight: '800', color: C.text, fontFamily: F.display },
  scrollContent: { padding: 16, gap: 16 },

  // Admin
  adminRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  adminText: { fontSize: 14, fontWeight: '800', color: C.green, fontFamily: F.display },

  // Billing toggle
  billingToggle: {
    flexDirection: 'row', backgroundColor: C.cardSolid,
    borderRadius: 12, padding: 4, gap: 4,
  },
  billingPill: {
    flex: 1, paddingVertical: 10, alignItems: 'center',
    borderRadius: 10, position: 'relative',
  },
  billingPillActive: {
    backgroundColor: C.accent + '22',
  },
  billingPillText: {
    fontSize: 13, fontWeight: '600', color: C.dim, fontFamily: F.body,
  },
  billingPillTextActive: {
    color: C.accent,
  },
  saveBadge: {
    position: 'absolute', top: -6, right: -4,
    backgroundColor: C.green, borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  saveBadgeText: { fontSize: 8, fontWeight: '800', color: 'white', fontFamily: F.display },

  // Cards
  cardsWrap: { gap: 16 },
  cardHeader: { marginBottom: 12 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  cardTitle: { fontSize: 20, fontWeight: '800', fontFamily: F.display },
  currentBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  currentBadgeText: { fontSize: 9, fontWeight: '800', fontFamily: F.display },
  cardPrice: { fontSize: 16, fontWeight: '700', color: C.text, fontFamily: F.display },
  cardAnnual: { fontSize: 11, color: C.sub, fontFamily: F.body, marginTop: 2 },

  // Trial bar
  trialBar: { marginBottom: 12 },
  trialProgress: {
    height: 4, backgroundColor: C.border, borderRadius: 2,
    marginBottom: 4, overflow: 'hidden',
  },
  trialFill: { height: 4, borderRadius: 2 },
  trialText: { fontSize: 11, color: C.sub, fontFamily: F.body },

  // Features list
  featuresList: { gap: 6, marginBottom: 12 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureLabel: { fontSize: 12, color: C.sub, fontFamily: F.body, flex: 1 },
  featureLimitText: { fontSize: 11, color: C.yellow, fontWeight: '600', fontFamily: F.mono, minWidth: 16, textAlign: 'center' },

  // CTA
  ctaWrap: { gap: 8 },
  trialBtn: { borderRadius: 12, overflow: 'hidden' },
  ctaGradient: { paddingVertical: 14, alignItems: 'center' },
  ctaText: { fontSize: 14, fontWeight: '700', color: 'white', fontFamily: F.display },
  purchaseBtn: {
    paddingVertical: 12, alignItems: 'center',
    borderWidth: 1, borderColor: C.border, borderRadius: 12,
  },
  purchaseBtnText: { fontSize: 13, fontWeight: '600', fontFamily: F.body },

  // Restore
  restoreBtn: { alignItems: 'center', paddingVertical: 12 },
  restoreText: { fontSize: 13, color: C.dim, fontFamily: F.body, textDecorationLine: 'underline' },

  // Referral
  referralHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  referralTitle: { fontSize: 16, fontWeight: '800', color: C.text, fontFamily: F.display },
  referralDesc: { fontSize: 12, color: C.sub, fontFamily: F.body, marginBottom: 12, lineHeight: 18 },
  referralCodeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  referralCodeBox: {
    flex: 1, backgroundColor: C.bg, borderRadius: 10, paddingVertical: 12,
    alignItems: 'center', borderWidth: 1, borderColor: C.accent + '44',
  },
  referralCodeText: { fontSize: 18, fontWeight: '800', color: C.accent, fontFamily: F.mono, letterSpacing: 2 },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.accent, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16,
  },
  shareBtnText: { fontSize: 13, fontWeight: '600', color: 'white', fontFamily: F.body },
  referralStats: { flexDirection: 'row', justifyContent: 'space-around' },
  referralStat: { alignItems: 'center' },
  referralStatNum: { fontSize: 18, fontWeight: '800', color: C.text, fontFamily: F.mono },
  referralStatLabel: { fontSize: 10, color: C.dim, fontFamily: F.body, marginTop: 2 },
});
