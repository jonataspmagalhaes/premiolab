import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Keyboard, Alert,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { C, F, SIZE } from '../../theme';
import { Glass } from '../../components';
import { supabase } from '../../config/supabase';
var rateLimiter = require('../../utils/rateLimiter');

function maskDate(text) {
  var digits = text.replace(/\D/g, '');
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return digits.substring(0, 2) + '/' + digits.substring(2);
  return digits.substring(0, 2) + '/' + digits.substring(2, 4) + '/' + digits.substring(4, 8);
}

function parseDate(masked) {
  if (!masked || masked.length < 10) return null;
  var parts = masked.split('/');
  if (parts.length !== 3) return null;
  var d = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10);
  var y = parseInt(parts[2], 10);
  if (d < 1 || d > 31 || m < 1 || m > 12 || y < 1900 || y > 2025) return null;
  var mm = m < 10 ? '0' + m : '' + m;
  var dd = d < 10 ? '0' + d : '' + d;
  return y + '-' + mm + '-' + dd;
}

export default function RecuperarSenhaScreen(props) {
  var navigation = props.navigation;
  var _email = useState(''); var email = _email[0]; var setEmail = _email[1];
  var _dataNasc = useState(''); var dataNasc = _dataNasc[0]; var setDataNasc = _dataNasc[1];
  var _loading = useState(false); var loading = _loading[0]; var setLoading = _loading[1];
  var _sent = useState(false); var sent = _sent[0]; var setSent = _sent[1];
  var _error = useState(''); var error = _error[0]; var setError = _error[1];

  // Rate limiting
  var RATE_KEY = 'auth_recover';
  var _cooldown = useState(0); var cooldown = _cooldown[0]; var setCooldown = _cooldown[1];
  var cooldownTimer = useRef(null);

  useEffect(function() {
    return function() {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    };
  }, []);

  function startCooldownTimer() {
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(function() {
      var remaining = rateLimiter.getRemainingCooldown(RATE_KEY);
      setCooldown(remaining);
      if (remaining <= 0 && cooldownTimer.current) {
        clearInterval(cooldownTimer.current);
        cooldownTimer.current = null;
      }
    }, 1000);
  }

  var handleSend = async function() {
    Keyboard.dismiss();

    // Check rate limit
    var remaining = rateLimiter.getRemainingCooldown(RATE_KEY);
    if (remaining > 0) {
      setError('Muitas tentativas. Aguarde ' + rateLimiter.formatCooldown(remaining) + '.');
      return;
    }

    var trimmed = (email || '').trim();
    if (!trimmed) {
      setError('Informe seu email');
      return;
    }
    var parsedDate = parseDate(dataNasc);
    if (!parsedDate) {
      setError('Informe a data de nascimento no formato DD/MM/AAAA');
      return;
    }
    setError('');
    setLoading(true);
    try {
      // Verificar email + data de nascimento via RPC
      var verifyResult = await supabase.rpc('verify_birthday', {
        p_email: trimmed,
        p_data_nascimento: parsedDate,
      });
      if (verifyResult.error) {
        var cooldownSec = rateLimiter.recordFailure(RATE_KEY);
        setError('Erro ao verificar. Tente novamente.');
        if (cooldownSec > 0) {
          setCooldown(cooldownSec);
          startCooldownTimer();
        }
        setLoading(false);
        return;
      }
      if (verifyResult.data !== true) {
        var cooldownSec2 = rateLimiter.recordFailure(RATE_KEY);
        var errMsg = 'Email ou data de nascimento incorretos.';
        if (cooldownSec2 > 0) {
          errMsg = errMsg + ' Aguarde ' + rateLimiter.formatCooldown(cooldownSec2) + '.';
          setCooldown(cooldownSec2);
          startCooldownTimer();
        }
        setError(errMsg);
        setLoading(false);
        return;
      }
      // Dados conferem — enviar link de reset
      var result = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: 'premiolab://auth/reset',
      });
      if (result.error) {
        setError(result.error.message || 'Erro ao enviar. Tente novamente.');
      } else {
        rateLimiter.recordSuccess(RATE_KEY);
        setSent(true);
      }
    } catch (e) {
      rateLimiter.recordFailure(RATE_KEY);
      setError('Falha na conexão. Tente novamente.');
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={function() { navigation.goBack(); }}
          accessibilityLabel="Voltar"
          accessibilityRole="button"
        >
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Recuperar Senha</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.content}>
        {sent ? (
          <View style={styles.sentWrap}>
            <View style={styles.sentIcon}>
              <Ionicons name="mail-outline" size={48} color={C.accent} />
            </View>
            <Text style={styles.sentTitle}>Email enviado!</Text>
            <Text style={styles.sentDesc}>
              Enviamos um link de recuperação para{'\n'}
              <Text style={{ color: C.text, fontWeight: '600' }}>{email.trim()}</Text>
            </Text>
            <Text style={styles.sentHint}>
              Verifique sua caixa de entrada e spam. O link expira em 1 hora.
            </Text>
            <TouchableOpacity
              onPress={function() { navigation.goBack(); }}
              activeOpacity={0.8}
              style={styles.backBtn}
            >
              <LinearGradient
                colors={[C.accent, C.opcoes]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.backGradient}
              >
                <Text style={styles.backBtnText}>Voltar ao login</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.formWrap}>
            <Glass glow={C.accent} padding={20}>
              <Text style={styles.formTitle}>
                Informe seu email e data de nascimento para verificar sua identidade.
              </Text>

              <View style={styles.inputWrap}>
                <Text style={styles.inputLabel}>EMAIL</Text>
                <TextInput
                  value={email}
                  onChangeText={function(t) { setEmail(t); setError(''); }}
                  placeholder="seu@email.com"
                  placeholderTextColor={C.dim}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus={true}
                  returnKeyType="next"
                  style={[styles.input, error ? { borderColor: C.red } : null]}
                />
              </View>

              <View style={styles.inputWrap}>
                <Text style={styles.inputLabel}>DATA DE NASCIMENTO</Text>
                <TextInput
                  value={dataNasc}
                  onChangeText={function(t) { setDataNasc(maskDate(t)); setError(''); }}
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor={C.dim}
                  keyboardType="numeric"
                  maxLength={10}
                  returnKeyType="go"
                  onSubmitEditing={handleSend}
                  style={[styles.input, error ? { borderColor: C.red } : null]}
                />
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <TouchableOpacity
                onPress={handleSend}
                disabled={loading || cooldown > 0}
                activeOpacity={0.8}
                style={styles.submitBtn}
              >
                <LinearGradient
                  colors={cooldown > 0 ? [C.dim, C.dim] : [C.accent, C.opcoes]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.submitGradient}
                >
                  {loading ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : cooldown > 0 ? (
                    <Text style={styles.submitText}>{'Aguarde ' + rateLimiter.formatCooldown(cooldown)}</Text>
                  ) : (
                    <Text style={styles.submitText}>Verificar e enviar link</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </Glass>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
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
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },

  formWrap: {},
  formTitle: {
    fontSize: 13, color: C.sub, fontFamily: F.body,
    lineHeight: 20, marginBottom: 20, textAlign: 'center',
  },
  inputWrap: { marginBottom: 16 },
  inputLabel: { fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8, marginBottom: 6 },
  input: {
    backgroundColor: C.cardSolid, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15, color: C.text, fontFamily: F.body,
  },
  errorText: { fontSize: 11, color: C.red, fontFamily: F.body, marginBottom: 12 },
  submitBtn: { borderRadius: 14, overflow: 'hidden' },
  submitGradient: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  submitText: { fontSize: 15, fontWeight: '700', color: 'white', fontFamily: F.display },

  sentWrap: { alignItems: 'center', paddingHorizontal: 16 },
  sentIcon: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: C.accent + '18', justifyContent: 'center', alignItems: 'center',
    marginBottom: 20,
  },
  sentTitle: {
    fontSize: 22, fontWeight: '800', color: C.text,
    fontFamily: F.display, marginBottom: 10,
  },
  sentDesc: {
    fontSize: 14, color: C.sub, fontFamily: F.body,
    textAlign: 'center', lineHeight: 22, marginBottom: 8,
  },
  sentHint: {
    fontSize: 12, color: C.dim, fontFamily: F.body,
    textAlign: 'center', lineHeight: 18, marginBottom: 28,
  },
  backBtn: { borderRadius: 14, overflow: 'hidden', width: '100%' },
  backGradient: { paddingVertical: 16, alignItems: 'center' },
  backBtnText: { fontSize: 15, fontWeight: '700', color: 'white', fontFamily: F.display },
});
