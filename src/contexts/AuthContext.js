import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../config/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
      // Save profile data
      await supabase.from('profiles').upsert({
        id: user.id,
        nome: data.nome || '',
        meta_mensal: data.meta || 6000,
        updated_at: new Date().toISOString(),
      });

      // Save selected corretoras
      if (data.corretoras && data.corretoras.length) {
        var rows = [];
        for (var i = 0; i < data.corretoras.length; i++) {
          rows.push({
            user_id: user.id,
            name: data.corretoras[i],
            count: 0,
          });
        }
        await supabase.from('user_corretoras').upsert(rows, {
          onConflict: 'user_id,name',
        });
      }

      await AsyncStorage.setItem('@onboarded_' + user.id, 'true');
      setOnboarded(true);
    } catch (err) {
      console.error('Onboarding error:', err);
    }
  }

  async function signUp(email, password) {
    var result = await supabase.auth.signUp({
      email: email,
      password: password,
    });
    return { data: result.data, error: result.error };
  }

  async function signIn(email, password) {
    var result = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });
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
  };

  return React.createElement(AuthContext.Provider, { value: value }, children);
}
