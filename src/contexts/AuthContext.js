import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../config/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { upsertSaldo, addMovimentacao, buildMovDescricao, findReferrerByCode, addReferral, checkReferralRateLimit, checkReferralDevice } from '../services/database';
var deviceIdUtil = require('../utils/deviceId');

var AuthContext = createContext({});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider(props) {
  var children = props.children;
  var _user = useState(null); var user = _user[0]; var setUser = _user[1];
  var _session = useState(null); var session = _session[0]; var setSession = _session[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _onboarded = useState(false); var onboarded = _onboarded[0]; var setOnboarded = _onboarded[1];

  useEffect(function() {
    // Get initial session
    supabase.auth.getSession().then(function(result) {
      var sess = result.data && result.data.session ? result.data.session : null;
      setSession(sess);
      setUser(sess && sess.user ? sess.user : null);
      if (sess && sess.user) checkOnboarding(sess.user.id);
      setLoading(false);
    });

    // Listen for auth changes
    var authResult = supabase.auth.onAuthStateChange(
      function(_event, sess) {
        setSession(sess);
        setUser(sess && sess.user ? sess.user : null);
        if (sess && sess.user) checkOnboarding(sess.user.id);
      }
    );

    var subscription = authResult.data && authResult.data.subscription ? authResult.data.subscription : null;

    return function() {
      if (subscription) subscription.unsubscribe();
    };
  }, []);

  function checkOnboarding(userId) {
    AsyncStorage.getItem('@onboarded_' + userId).then(function(stored) {
      setOnboarded(stored === 'true');
    }).catch(function() {
      setOnboarded(false);
    });
  }

  async function completeOnboarding(data) {
    if (!data) data = {};
    if (!user) return;
    try {
      // Build profile payload with extra fields from registration metadata
      var profilePayload = {
        id: user.id,
        nome: data.nome || '',
        meta_mensal: data.meta || 6000,
        updated_at: new Date().toISOString(),
      };
      // Merge fields from user_metadata (set during signUp)
      var meta = user.user_metadata || {};
      if (meta.pais) profilePayload.pais = meta.pais;
      if (meta.cidade) profilePayload.cidade = meta.cidade;
      if (meta.data_nascimento) profilePayload.data_nascimento = meta.data_nascimento;
      if (meta.sexo) profilePayload.sexo = meta.sexo;
      // Override nome from metadata if onboarding nome is empty
      if (!profilePayload.nome && meta.nome) profilePayload.nome = meta.nome;

      // Save profile data
      await supabase.from('profiles').upsert(profilePayload);

      // Save device_id + process referral code if provided during registration
      var deviceId = null;
      try { deviceId = await deviceIdUtil.getDeviceId(); } catch (devErr) { /* ignore */ }
      if (deviceId) {
        await supabase.from('profiles').update({ device_id: deviceId }).eq('id', user.id);
      }

      var refCode = meta.referral_code_input;
      if (refCode) {
        try {
          var referrerResult = await findReferrerByCode(refCode);
          if (referrerResult.data && referrerResult.data.id !== user.id) {
            // Anti-fraud: rate limit
            var rateCheck = await checkReferralRateLimit(referrerResult.data.id);
            if (rateCheck.count >= 10) {
              // Silently skip — rate limited
            } else {
              // Anti-fraud: device check
              var deviceOk = true;
              if (deviceId) {
                var devCheck = await checkReferralDevice(referrerResult.data.id, deviceId);
                if (devCheck.count > 0) deviceOk = false;
              }
              if (deviceOk) {
                await supabase.from('profiles').update({ referred_by: refCode.toUpperCase().trim() }).eq('id', user.id);
                await addReferral(referrerResult.data.id, user.id, email || user.email || '', deviceId);
              }
            }
          }
        } catch (refErr) {
          // Non-critical — ignore referral errors
        }
      }

      // Save accounts to saldos_corretora
      if (data.contas && data.contas.length) {
        for (var i = 0; i < data.contas.length; i++) {
          var conta = data.contas[i];
          var nomeNorm = (conta.nome || '').toUpperCase().trim();
          await upsertSaldo(user.id, {
            corretora: nomeNorm,
            saldo: conta.saldo || 0,
            moeda: conta.moeda || 'BRL',
            tipo: conta.tipo || 'corretora',
          });
          // Log initial deposit if saldo > 0
          if (conta.saldo && conta.saldo > 0) {
            await addMovimentacao(user.id, {
              conta: nomeNorm,
              tipo: 'entrada',
              categoria: 'deposito',
              valor: conta.saldo,
              descricao: buildMovDescricao('deposito', null, 'Saldo inicial'),
              saldo_apos: conta.saldo,
              data: new Date().toISOString().substring(0, 10),
            });
          }
        }
      }

      await AsyncStorage.setItem('@onboarded_' + user.id, 'true');
      setOnboarded(true);
    } catch (err) {
      console.error('Onboarding error:', err);
    }
  }

  // Reconcilia compras Kiwify feitas antes do user ter conta no app.
  // Busca pending_subscriptions pelo email, aplica em profiles, marca como applied.
  async function reconcilePendingSubscriptions(userId, email) {
    if (!userId || !email) return;
    try {
      var emailLower = email.toLowerCase().trim();
      var pendingResult = await supabase
        .from('pending_subscriptions')
        .select('*')
        .eq('email', emailLower)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      var pendings = pendingResult.data || [];
      if (pendings.length === 0) return;
      var latest = pendings[0];
      // Aplica no profile
      var profileUpdate = {
        tier: latest.tier,
        subscription_expires_at: latest.expires_at,
        subscription_source: latest.subscription_source,
        subscription_external_id: latest.subscription_external_id,
        subscription_status: latest.subscription_status || 'active',
        updated_at: new Date().toISOString(),
      };
      var updateResult = await supabase.from('profiles').update(profileUpdate).eq('id', userId);
      if (updateResult.error) {
        console.warn('reconcilePending: profile update failed', updateResult.error.message);
        return;
      }
      // Marca o pending aplicado + supersede os outros
      var nowIso = new Date().toISOString();
      await supabase.from('pending_subscriptions').update({
        status: 'applied',
        applied_at: nowIso,
        applied_to_user_id: userId,
        updated_at: nowIso,
      }).eq('id', latest.id);
      if (pendings.length > 1) {
        var otherIds = [];
        for (var pi = 1; pi < pendings.length; pi++) otherIds.push(pendings[pi].id);
        await supabase.from('pending_subscriptions').update({
          status: 'superseded',
          updated_at: nowIso,
        }).in('id', otherIds);
      }
    } catch (e) {
      console.warn('reconcilePending error:', e && e.message ? e.message : e);
    }
  }

  async function signUp(email, password, profileData, captchaToken) {
    var options = {
      email: email,
      password: password,
    };
    if (profileData) {
      options.options = {
        data: profileData,
        emailRedirectTo: 'premiolab://auth/callback',
      };
    } else {
      options.options = {
        emailRedirectTo: 'premiolab://auth/callback',
      };
    }
    if (captchaToken) {
      options.options.captchaToken = captchaToken;
    }
    var result = await supabase.auth.signUp(options);
    if (!result.error && result.data && result.data.user && result.data.user.id) {
      await reconcilePendingSubscriptions(result.data.user.id, email);
    }
    return { data: result.data, error: result.error };
  }

  async function signIn(email, password, captchaToken) {
    var opts = {
      email: email,
      password: password,
    };
    if (captchaToken) {
      opts.options = { captchaToken: captchaToken };
    }
    var result = await supabase.auth.signInWithPassword(opts);
    if (!result.error && result.data && result.data.user && result.data.user.id) {
      await reconcilePendingSubscriptions(result.data.user.id, email);
    }
    return { data: result.data, error: result.error };
  }

  async function signOut() {
    var result = await supabase.auth.signOut();
    if (!result.error) {
      setUser(null);
      setSession(null);
    }
    return { error: result.error };
  }

  var value = {
    user: user,
    session: session,
    loading: loading,
    onboarded: onboarded,
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    completeOnboarding: completeOnboarding,
    reconcilePendingSubscriptions: reconcilePendingSubscriptions,
  };

  return React.createElement(AuthContext.Provider, { value: value }, children);
}
