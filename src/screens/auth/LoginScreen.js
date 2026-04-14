import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Keyboard,
  Image, ScrollView,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { LinearGradient } from 'expo-linear-gradient';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { Pill } from '../../components/Primitives';
var rateLimiter = require('../../utils/rateLimiter');

var SEXO_OPTIONS = [
  { k: 'masculino', l: 'Masculino' },
  { k: 'feminino', l: 'Feminino' },
  { k: 'outro', l: 'Outro' },
  { k: 'nao_informar', l: 'Prefiro não informar' },
];

function maskDate(text) {
  var nums = text.replace(/\D/g, '');
  if (nums.length <= 2) return nums;
  if (nums.length <= 4) return nums.substring(0, 2) + '/' + nums.substring(2);
  return nums.substring(0, 2) + '/' + nums.substring(2, 4) + '/' + nums.substring(4, 8);
}

function parseDate(dd_mm_yyyy) {
  if (!dd_mm_yyyy || dd_mm_yyyy.length < 10) return null;
  var parts = dd_mm_yyyy.split('/');
  if (parts.length !== 3) return null;
  var d = parseInt(parts[0]);
  var m = parseInt(parts[1]);
  var y = parseInt(parts[2]);
  if (!d || !m || !y || d < 1 || d > 31 || m < 1 || m > 12 || y < 1900 || y > 2026) return null;
  var mm = m < 10 ? '0' + m : String(m);
  var dd = d < 10 ? '0' + d : String(d);
  return y + '-' + mm + '-' + dd;
}

export default function LoginScreen(props) {
  var navigation = props && props.navigation ? props.navigation : null;
  var _auth = useAuth(); var signIn = _auth.signIn; var signUp = _auth.signUp;
  var _mode = useState('login'); var mode = _mode[0]; var setMode = _mode[1];
  var _email = useState(''); var email = _email[0]; var setEmail = _email[1];
  var _password = useState(''); var password = _password[0]; var setPassword = _password[1];
  var _loading = useState(false); var loading = _loading[0]; var setLoading = _loading[1];

  // Registration extra fields
  var _nome = useState(''); var nome = _nome[0]; var setNome = _nome[1];
  var _pais = useState('Brasil'); var pais = _pais[0]; var setPais = _pais[1];
  var _cidade = useState(''); var cidade = _cidade[0]; var setCidade = _cidade[1];
  var _dataNasc = useState(''); var dataNasc = _dataNasc[0]; var setDataNasc = _dataNasc[1];
  var _sexo = useState(''); var sexo = _sexo[0]; var setSexo = _sexo[1];
  var _codigoIndicacao = useState(''); var codigoIndicacao = _codigoIndicacao[0]; var setCodigoIndicacao = _codigoIndicacao[1];
  var _emailConfirm = useState(''); var emailConfirm = _emailConfirm[0]; var setEmailConfirm = _emailConfirm[1];
  var _passwordConfirm = useState(''); var passwordConfirm = _passwordConfirm[0]; var setPasswordConfirm = _passwordConfirm[1];

  // Rate limiting
  var RATE_KEY = 'auth_login';
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

  var handleSubmit = async function() {
    Keyboard.dismiss();

    // Check rate limit
    var remaining = rateLimiter.getRemainingCooldown(RATE_KEY);
    if (remaining > 0) {
      Alert.alert('Aguarde', 'Muitas tentativas. Tente novamente em ' + rateLimiter.formatCooldown(remaining) + '.');
      return;
    }

    if (!email || !password) {
      Alert.alert('Erro', 'Preencha email e senha');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Erro', 'Senha deve ter pelo menos 6 caracteres');
      return;
    }

    if (mode === 'register') {
      if (!nome.trim()) {
        Alert.alert('Erro', 'Preencha seu nome');
        return;
      }
      if (email.trim().toLowerCase() !== emailConfirm.trim().toLowerCase()) {
        Alert.alert('Erro', 'Os emails não conferem. Verifique e tente novamente.');
        return;
      }
      if (password !== passwordConfirm) {
        Alert.alert('Erro', 'As senhas não conferem. Verifique e tente novamente.');
        return;
      }
      if (dataNasc && dataNasc.length > 0 && dataNasc.length < 10) {
        Alert.alert('Erro', 'Data de nascimento incompleta. Use DD/MM/AAAA.');
        return;
      }
      if (dataNasc && dataNasc.length === 10 && !parseDate(dataNasc)) {
        Alert.alert('Erro', 'Data de nascimento inválida.');
        return;
      }
    }

    setLoading(true);
    try {
      var result;
      if (mode === 'login') {
        result = await signIn(email.trim(), password);
      } else {
        var profileData = {
          nome: nome.trim(),
          pais: pais.trim(),
          cidade: cidade.trim(),
          sexo: sexo,
          referral_code_input: codigoIndicacao.trim() || null,
        };
        var parsedDate = parseDate(dataNasc);
        if (parsedDate) profileData.data_nascimento = parsedDate;
        result = await signUp(email.trim(), password, profileData);
      }

      if (result.error) {
        var msg = result.error.message;
        if (msg.indexOf('Invalid login') >= 0) {
          msg = 'Email ou senha incorretos';
        } else if (msg.indexOf('already registered') >= 0) {
          msg = 'Email já cadastrado';
        }
        // Record failure and apply cooldown
        var cooldownSec = rateLimiter.recordFailure(RATE_KEY);
        if (cooldownSec > 0) {
          msg = msg + '\nAguarde ' + rateLimiter.formatCooldown(cooldownSec) + ' antes de tentar novamente.';
          setCooldown(cooldownSec);
          startCooldownTimer();
        }
        Alert.alert('Erro', msg);
      } else {
        rateLimiter.recordSuccess(RATE_KEY);
        if (mode === 'register') {
          Toast.show({ type: 'success', text1: 'Conta criada!', text2: 'Faça login para continuar.' });
          setMode('login');
        }
      }
    } catch (err) {
      rateLimiter.recordFailure(RATE_KEY);
      Alert.alert('Erro', 'Falha na conexão. Tente novamente.');
    }
    setLoading(false);
  };

  var handleForgotPassword = function() {
    if (navigation) {
      navigation.navigate('RecuperarSenha');
    }
  };

  var toggleMode = function() {
    setMode(mode === 'login' ? 'register' : 'login');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo */}
        <View style={styles.logoWrap}>
          <Image
            source={require('../../../assets/logo.png')}
            style={styles.logoImage}
          />
          <Text style={styles.appName}>PremioLab</Text>
          <Text style={styles.tagline}>Seu laboratório de investimentos</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {/* Registration extra fields */}
          {mode === 'register' && (
            <View style={styles.extraFields}>
              <View style={styles.inputWrap}>
                <Text style={styles.inputLabel}>Nome completo *</Text>
                <TextInput
                  value={nome}
                  onChangeText={setNome}
                  placeholder="Seu nome"
                  placeholderTextColor={C.dim}
                  autoFocus={true}
                  returnKeyType="next"
                  style={styles.input}
                />
              </View>

              <View style={styles.inputWrap}>
                <Text style={styles.inputLabel}>País</Text>
                <TextInput
                  value={pais}
                  onChangeText={setPais}
                  placeholder="Brasil"
                  placeholderTextColor={C.dim}
                  returnKeyType="next"
                  style={styles.input}
                />
              </View>

              <View style={styles.inputWrap}>
                <Text style={styles.inputLabel}>Cidade</Text>
                <TextInput
                  value={cidade}
                  onChangeText={setCidade}
                  placeholder="São Paulo"
                  placeholderTextColor={C.dim}
                  returnKeyType="next"
                  style={styles.input}
                />
              </View>

              <View style={styles.inputWrap}>
                <Text style={styles.inputLabel}>Data de nascimento</Text>
                <TextInput
                  value={dataNasc}
                  onChangeText={function(t) { setDataNasc(maskDate(t)); }}
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor={C.dim}
                  keyboardType="numeric"
                  maxLength={10}
                  returnKeyType="next"
                  style={styles.input}
                />
              </View>

              <View style={styles.inputWrap}>
                <Text style={styles.inputLabel}>Sexo</Text>
                <View style={styles.pillRow}>
                  {SEXO_OPTIONS.map(function(opt) {
                    return (
                      <Pill
                        key={opt.k}
                        active={sexo === opt.k}
                        color={C.accent}
                        onPress={function() { setSexo(sexo === opt.k ? '' : opt.k); }}
                      >
                        {opt.l}
                      </Pill>
                    );
                  })}
                </View>
              </View>

              <View style={styles.inputWrap}>
                <Text style={styles.inputLabel}>Código de indicação (opcional)</Text>
                <TextInput
                  value={codigoIndicacao}
                  onChangeText={function(t) { setCodigoIndicacao(t.toUpperCase()); }}
                  placeholder="Ex: PL-ABC123"
                  placeholderTextColor={C.dim}
                  style={styles.input}
                  autoCapitalize="characters"
                  returnKeyType="next"
                  maxLength={10}
                />
              </View>
            </View>
          )}

          <View style={styles.inputWrap}>
            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="seu@email.com"
              placeholderTextColor={C.dim}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus={mode === 'login'}
              returnKeyType="next"
              style={styles.input}
            />
          </View>

          {mode === 'register' && (
            <View style={styles.inputWrap}>
              <Text style={styles.inputLabel}>Confirmar email</Text>
              <TextInput
                value={emailConfirm}
                onChangeText={setEmailConfirm}
                placeholder="Digite o email novamente"
                placeholderTextColor={C.dim}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                style={styles.input}
              />
            </View>
          )}

          <View style={styles.inputWrap}>
            <Text style={styles.inputLabel}>Senha</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={C.dim}
              secureTextEntry
              returnKeyType={mode === 'register' ? 'next' : 'go'}
              style={styles.input}
            />
          </View>

          {mode === 'register' && (
            <View style={styles.inputWrap}>
              <Text style={styles.inputLabel}>Confirmar senha</Text>
              <TextInput
                value={passwordConfirm}
                onChangeText={setPasswordConfirm}
                placeholder="Digite a senha novamente"
                placeholderTextColor={C.dim}
                secureTextEntry
                returnKeyType="go"
                style={styles.input}
              />
            </View>
          )}

          {/* Forgot password link (only in login mode) */}
          {mode === 'login' && (
            <TouchableOpacity
              onPress={handleForgotPassword}
              style={styles.forgotWrap}
              activeOpacity={0.7}
            >
              <Text style={styles.forgotText}>Esqueceu a senha?</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={handleSubmit}
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
                <Text style={styles.submitText}>
                  {'Aguarde ' + rateLimiter.formatCooldown(cooldown)}
                </Text>
              ) : (
                <Text style={styles.submitText}>
                  {mode === 'login' ? 'Entrar' : 'Criar Conta'}
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Toggle mode */}
        <TouchableOpacity
          onPress={toggleMode}
          style={styles.toggleWrap}
        >
          <Text style={styles.toggleText}>
            {mode === 'login' ? 'Não tem conta? ' : 'Já tem conta? '}
            <Text style={styles.toggleLink}>
              {mode === 'login' ? 'Criar conta' : 'Fazer login'}
            </Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

var styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoImage: {
    width: 120,
    height: 120,
    borderRadius: 28,
    marginBottom: 16,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: C.text,
    fontFamily: F.display,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 12,
    color: C.sub,
    fontFamily: F.body,
    marginTop: 4,
  },
  form: {
    gap: 12,
  },
  extraFields: {
    gap: 12,
    marginBottom: 4,
  },
  inputWrap: {},
  inputLabel: {
    fontSize: 10,
    color: C.sub,
    fontFamily: F.body,
    marginBottom: 4,
    marginLeft: 2,
  },
  input: {
    backgroundColor: C.cardSolid,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: C.text,
    fontFamily: F.body,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  forgotWrap: {
    alignSelf: 'flex-end',
    paddingVertical: 2,
  },
  forgotText: {
    fontSize: 12,
    color: C.accent,
    fontFamily: F.body,
  },
  submitBtn: {
    marginTop: 4,
    borderRadius: 14,
    overflow: 'hidden',
  },
  submitGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    fontSize: 15,
    fontWeight: '700',
    color: 'white',
    fontFamily: F.display,
  },
  toggleWrap: {
    marginTop: 24,
    alignItems: 'center',
  },
  toggleText: {
    fontSize: 12,
    color: C.sub,
    fontFamily: F.body,
  },
  toggleLink: {
    color: C.accent,
    fontWeight: '600',
  },
});
