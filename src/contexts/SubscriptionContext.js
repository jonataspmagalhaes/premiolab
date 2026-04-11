import React, { createContext, useContext, useState, useEffect } from 'react';
import { Alert } from 'react-native';
import { useAuth } from './AuthContext';
import { supabase } from '../config/supabase';
import { checkVipOverride, getReferralCount, activateReferral, applyReferralReward, findReferrerByCode, addReferral, checkReferralRateLimit, checkReferralDevice, saveDeviceId } from '../services/database';
var subFeatures = require('../constants/subscriptionFeatures');
var deviceIdUtil = require('../utils/deviceId');

var SubscriptionContext = createContext({});

export function useSubscription() {
  return useContext(SubscriptionContext);
}

// Try to load RevenueCat (may not be installed)
var Purchases = null;
try {
  Purchases = require('react-native-purchases').default;
} catch (e) {
  // RevenueCat not installed — works without it
}

function getTierFromEntitlements(customerInfo) {
  if (!customerInfo || !customerInfo.entitlements || !customerInfo.entitlements.active) {
    return null;
  }
  var active = customerInfo.entitlements.active;
  if (active.premium) return 'premium';
  if (active.pro) return 'pro';
  return null;
}

export function SubscriptionProvider(props) {
  var children = props.children;
  var _auth = useAuth();
  var user = _auth.user;
  var reconcilePendingSubscriptions = _auth.reconcilePendingSubscriptions;

  var _tier = useState('free'); var tier = _tier[0]; var setTier = _tier[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _trialInfo = useState(null); var trialInfo = _trialInfo[0]; var setTrialInfo = _trialInfo[1];
  var _trialExpiredRecently = useState(false); var trialExpiredRecently = _trialExpiredRecently[0]; var setTrialExpiredRecently = _trialExpiredRecently[1];
  var _referralCode = useState(null); var referralCode = _referralCode[0]; var setReferralCode = _referralCode[1];
  var _referralCount = useState(0); var referralCount = _referralCount[0]; var setReferralCount = _referralCount[1];
  var _isVip = useState(false); var isVip = _isVip[0]; var setIsVip = _isVip[1];

  var isAdmin = user && user.email ? subFeatures.isAdminEmail(user.email) : false;

  useEffect(function() {
    if (!user) {
      setTier('free');
      setTrialInfo(null);
      setReferralCode(null);
      setReferralCount(0);
      setIsVip(false);
      setLoading(false);
      return;
    }

    // Admin bypass
    if (isAdmin) {
      setTier('premium');
      setTrialInfo(null);
      setIsVip(false);
      setLoading(false);
      ensureReferralCode();
      loadReferralCount();
      return;
    }

    // Check all sources
    checkSubscription();

    // RevenueCat listener
    var removeListener = null;
    if (Purchases) {
      try {
        removeListener = Purchases.addCustomerInfoUpdateListener(function(info) {
          var rcTier = getTierFromEntitlements(info);
          if (rcTier) {
            setTier(rcTier);
            // Activate referral when user subscribes
            activateReferral(user.id);
          }
        });
      } catch (e) {
        // ignore
      }
    }

    return function() {
      if (removeListener && typeof removeListener === 'function') {
        removeListener();
      }
    };
  }, [user]);

  async function ensureReferralCode() {
    if (!user) return;
    try {
      var result = await supabase
        .from('profiles')
        .select('referral_code')
        .eq('id', user.id)
        .single();
      if (result.data && result.data.referral_code) {
        setReferralCode(result.data.referral_code);
      } else {
        // Generate new code
        var code = subFeatures.generateReferralCode();
        var updateResult = await supabase
          .from('profiles')
          .update({ referral_code: code })
          .eq('id', user.id);
        if (!updateResult.error) {
          setReferralCode(code);
        }
      }
    } catch (e) {
      // ignore
    }
  }

  async function loadReferralCount() {
    if (!user) return;
    try {
      var result = await getReferralCount(user.id, 'active');
      setReferralCount(result.count || 0);
    } catch (e) {
      // ignore
    }
  }

  async function checkSubscription() {
    setLoading(true);
    try {
      // 1. Check VIP override (tabela vip_overrides)
      if (user && user.email) {
        var vipResult = await checkVipOverride(user.email);
        if (vipResult.data && subFeatures.isValidTier(vipResult.data)) {
          setTier(vipResult.data);
          setTrialInfo(null);
          setIsVip(true);
          setLoading(false);
          ensureReferralCode();
          loadReferralCount();
          return;
        }
      }
      setIsVip(false);

      // 2. Check RevenueCat
      if (Purchases) {
        try {
          var info = await Purchases.getCustomerInfo();
          var rcTier = getTierFromEntitlements(info);
          if (rcTier) {
            setTier(rcTier);
            setTrialInfo(null);
            setLoading(false);
            ensureReferralCode();
            loadReferralCount();
            return;
          }
        } catch (e) {
          // RevenueCat failed, continue
        }
      }

      // Safety net: reconcilia compras Kiwify orfas (caso o signIn/signUp
      // original nao tenha rodado — sessao restaurada, outro device, etc).
      if (reconcilePendingSubscriptions && user.email) {
        try { await reconcilePendingSubscriptions(user.id, user.email); } catch (_) { /* ignore */ }
      }

      // 3. Check assinatura externa (Kiwify) via profiles
      var kiwifyResult = await supabase
        .from('profiles')
        .select('tier, subscription_expires_at, subscription_source, subscription_status')
        .eq('id', user.id)
        .single();
      if (kiwifyResult.data) {
        var kp = kiwifyResult.data;
        var hasExternal = kp.tier && kp.tier !== 'free' && kp.subscription_source && kp.subscription_source !== 'vip_override' && kp.subscription_source !== 'trial';
        if (hasExternal && subFeatures.isValidTier(kp.tier)) {
          var statusOk = !kp.subscription_status || kp.subscription_status === 'active';
          var notExpired = true;
          if (kp.subscription_expires_at) {
            notExpired = new Date(kp.subscription_expires_at).getTime() > Date.now();
          }
          if (statusOk && notExpired) {
            setTier(kp.tier);
            setTrialInfo(null);
            setLoading(false);
            ensureReferralCode();
            loadReferralCount();
            return;
          }
        }
      }

      // 4. Check referral reward / trial
      var profileResult = await supabase
        .from('profiles')
        .select('trial_pro_used, trial_pro_start, trial_premium_used, trial_premium_start, referral_code, referral_reward_tier, referral_reward_end')
        .eq('id', user.id)
        .single();

      if (profileResult.data) {
        var profile = profileResult.data;
        var now = new Date();
        var todayStr = now.toISOString().substring(0, 10);

        // Set referral code
        if (profile.referral_code) {
          setReferralCode(profile.referral_code);
        } else {
          ensureReferralCode();
        }

        // Check referral reward
        if (profile.referral_reward_tier && profile.referral_reward_end) {
          if (todayStr <= profile.referral_reward_end && subFeatures.isValidTier(profile.referral_reward_tier)) {
            setTier(profile.referral_reward_tier);
            setTrialInfo(null);
            setLoading(false);
            loadReferralCount();
            return;
          }
        }

        // 4. Check Premium trial first (higher tier)
        if (profile.trial_premium_start) {
          var premStart = new Date(profile.trial_premium_start);
          var premEnd = new Date(premStart);
          premEnd.setDate(premEnd.getDate() + 7);
          var premEndStr = premEnd.toISOString().substring(0, 10);
          if (todayStr <= premEndStr) {
            var daysLeft = Math.ceil((premEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            setTier('premium');
            setTrialInfo({ tier: 'premium', daysLeft: daysLeft, endDate: premEndStr });
            setLoading(false);
            loadReferralCount();
            return;
          } else {
            setTrialExpiredRecently(true);
          }
        }

        // Check PRO trial
        if (profile.trial_pro_start) {
          var proStart = new Date(profile.trial_pro_start);
          var proEnd = new Date(proStart);
          proEnd.setDate(proEnd.getDate() + 7);
          var proEndStr = proEnd.toISOString().substring(0, 10);
          if (todayStr <= proEndStr) {
            var daysLeftPro = Math.ceil((proEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            setTier('pro');
            setTrialInfo({ tier: 'pro', daysLeft: daysLeftPro, endDate: proEndStr });
            setLoading(false);
            loadReferralCount();
            return;
          } else {
            setTrialExpiredRecently(true);
          }
        }
      } else {
        ensureReferralCode();
      }

      // 5. Default: free
      setTier('free');
      setTrialInfo(null);
      loadReferralCount();
    } catch (e) {
      setTier('free');
      setTrialInfo(null);
    }
    setLoading(false);
  }

  function canAccess(featureKey) {
    var requiredTier = subFeatures.getRequiredTier(featureKey);
    if (requiredTier === 'disabled') return false;
    if (isAdmin) return true;
    return subFeatures.tierMeetsMin(tier, requiredTier);
  }

  function isAtLimit(type, count) {
    if (type === 'positions') {
      return count >= subFeatures.LIMITS.FREE_POSITIONS;
    }
    if (type === 'options') {
      return count >= subFeatures.LIMITS.FREE_OPTIONS;
    }
    return false;
  }

  async function startTrial(trialTier) {
    if (!user) return { error: 'Usuário não logado' };
    if (isAdmin) return { error: 'Admin não precisa de trial' };

    try {
      var profileUpdates = {};
      var todayStr = new Date().toISOString().substring(0, 10);

      if (trialTier === 'pro') {
        var checkResult = await supabase
          .from('profiles')
          .select('trial_pro_used')
          .eq('id', user.id)
          .single();
        if (checkResult.data && checkResult.data.trial_pro_used) {
          return { error: 'Você já utilizou o trial PRO.' };
        }
        profileUpdates.trial_pro_used = true;
        profileUpdates.trial_pro_start = todayStr;
      } else if (trialTier === 'premium') {
        var checkResult2 = await supabase
          .from('profiles')
          .select('trial_premium_used')
          .eq('id', user.id)
          .single();
        if (checkResult2.data && checkResult2.data.trial_premium_used) {
          return { error: 'Você já utilizou o trial Premium.' };
        }
        profileUpdates.trial_premium_used = true;
        profileUpdates.trial_premium_start = todayStr;
      } else {
        return { error: 'Tier inválido' };
      }

      var updateResult = await supabase
        .from('profiles')
        .update(profileUpdates)
        .eq('id', user.id);

      if (updateResult.error) {
        return { error: 'Erro ao iniciar trial. Tente novamente.' };
      }

      // Activate referral when user starts trial
      activateReferral(user.id);

      // Refresh subscription state
      await checkSubscription();
      return { success: true };
    } catch (e) {
      return { error: 'Falha na conexão. Tente novamente.' };
    }
  }

  async function applyReferralCodeFn(code) {
    if (!user) return { error: 'Usuário não logado' };
    if (!code) return { error: 'Código inválido' };

    try {
      var referrerResult = await findReferrerByCode(code);
      if (!referrerResult.data) {
        return { error: 'Código de indicação não encontrado.' };
      }
      if (referrerResult.data.id === user.id) {
        return { error: 'Você não pode usar seu próprio código.' };
      }

      // Anti-fraud: rate limit (max 10 referrals/month per referrer)
      var rateResult = await checkReferralRateLimit(referrerResult.data.id);
      if (rateResult.count >= 10) {
        return { error: 'Este código atingiu o limite de indicações do mês.' };
      }

      // Anti-fraud: same device check
      var deviceId = await deviceIdUtil.getDeviceId();
      if (deviceId) {
        var deviceResult = await checkReferralDevice(referrerResult.data.id, deviceId);
        if (deviceResult.count > 0) {
          return { error: 'Este dispositivo já usou um código de indicação.' };
        }
      }

      // Save referred_by + device_id
      var profileUpdate = { referred_by: code.toUpperCase().trim() };
      if (deviceId) profileUpdate.device_id = deviceId;
      await supabase
        .from('profiles')
        .update(profileUpdate)
        .eq('id', user.id);

      // Create referral record with device_id
      var refResult = await addReferral(referrerResult.data.id, user.id, user.email || '', deviceId);
      if (refResult.error) {
        // Might be unique constraint (already referred)
        return { error: 'Você já usou um código de indicação.' };
      }

      // Check if referrer earned a reward
      await checkAndGrantReferralReward(referrerResult.data.id);

      return { success: true, referrerName: referrerResult.data.nome || '' };
    } catch (e) {
      return { error: 'Falha ao aplicar código. Tente novamente.' };
    }
  }

  async function checkAndGrantReferralReward(referrerId) {
    try {
      var countResult = await getReferralCount(referrerId, 'active');
      var activeCount = countResult.count || 0;
      var thresholds = subFeatures.REFERRAL_THRESHOLDS;

      for (var i = 0; i < thresholds.length; i++) {
        if (activeCount >= thresholds[i].count) {
          await applyReferralReward(referrerId, thresholds[i].rewardTier, thresholds[i].rewardDays);
          break;
        }
      }
    } catch (e) {
      // ignore — reward will be checked on next login
    }
  }

  async function purchase(packageId) {
    if (!Purchases) {
      Alert.alert('Em breve', 'Assinaturas estarão disponíveis em breve na App Store.');
      return { error: 'not_available' };
    }
    try {
      var result = await Purchases.purchasePackage(packageId);
      var rcTier = getTierFromEntitlements(result.customerInfo);
      if (rcTier) {
        setTier(rcTier);
        setTrialInfo(null);
        // Activate referral on purchase
        activateReferral(user.id);
      }
      return { success: true };
    } catch (e) {
      if (e.userCancelled) return { cancelled: true };
      return { error: e.message || 'Erro na compra' };
    }
  }

  async function restore() {
    if (!Purchases) {
      Alert.alert('Em breve', 'Restauração estará disponível em breve.');
      return { error: 'not_available' };
    }
    try {
      var restoreInfo = await Purchases.restorePurchases();
      var rcTier = getTierFromEntitlements(restoreInfo);
      if (rcTier) {
        setTier(rcTier);
        setTrialInfo(null);
        return { success: true, tier: rcTier };
      }
      return { success: true, tier: 'free' };
    } catch (e) {
      return { error: e.message || 'Erro ao restaurar' };
    }
  }

  var tierLabel = subFeatures.TIER_LABELS[tier] || 'Free';
  var tierColor = subFeatures.TIER_COLORS[tier] || subFeatures.TIER_COLORS.free;

  var value = {
    tier: tier,
    tierLabel: tierLabel,
    tierColor: tierColor,
    isAdmin: isAdmin,
    isVip: isVip,
    loading: loading,
    trialInfo: trialInfo,
    trialExpiredRecently: trialExpiredRecently,
    referralCode: referralCode,
    referralCount: referralCount,
    canAccess: canAccess,
    isAtLimit: isAtLimit,
    startTrial: startTrial,
    purchase: purchase,
    restore: restore,
    refresh: checkSubscription,
    applyReferralCode: applyReferralCodeFn,
  };

  return React.createElement(SubscriptionContext.Provider, { value: value }, children);
}
