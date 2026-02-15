import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../config/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [onboarded, setOnboarded] = useState(false);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) checkOnboarding(session.user.id);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) checkOnboarding(session.user.id);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const checkOnboarding = async (userId) => {
    try {
      const stored = await AsyncStorage.getItem(`@onboarded_${userId}`);
      setOnboarded(stored === 'true');
    } catch {
      setOnboarded(false);
    }
  };

  const completeOnboarding = async (data = {}) => {
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
      if (data.corretoras?.length) {
        const rows = data.corretoras.map((name) => ({
          user_id: user.id,
          name,
          count: 0,
        }));
        await supabase.from('user_corretoras').upsert(rows, {
          onConflict: 'user_id,name',
        });
      }

      await AsyncStorage.setItem(`@onboarded_${user.id}`, 'true');
      setOnboarded(true);
    } catch (err) {
      console.error('Onboarding error:', err);
    }
  };

  const signUp = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    return { data, error };
  };

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      setUser(null);
      setSession(null);
    }
    return { error };
  };

  const value = {
    user,
    session,
    loading,
    onboarded,
    signUp,
    signIn,
    signOut,
    completeOnboarding,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
