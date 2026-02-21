import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Keyboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';

export default function LoginScreen() {
  var _auth = useAuth(); var signIn = _auth.signIn; var signUp = _auth.signUp;
  var _mode = useState('login'); var mode = _mode[0]; var setMode = _mode[1];
  var _email = useState(''); var email = _email[0]; var setEmail = _email[1];
  var _password = useState(''); var password = _password[0]; var setPassword = _password[1];
  var _loading = useState(false); var loading = _loading[0]; var setLoading = _loading[1];

  var handleSubmit = async function() {
    Keyboard.dismiss();
    if (!email || !password) {
      Alert.alert('Erro', 'Preencha email e senha');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Erro', 'Senha deve ter pelo menos 6 caracteres');
      return;
    }

    setLoading(true);
    try {
      var result = mode === 'login'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password);

      if (result.error) {
        var msg = result.error.message;
        if (msg.indexOf('Invalid login') >= 0) {
          msg = 'Email ou senha incorretos';
        } else if (msg.indexOf('already registered') >= 0) {
          msg = 'Email já cadastrado';
        }
        Alert.alert('Erro', msg);
      } else if (mode === 'register') {
        Alert.alert('Sucesso', 'Conta criada! Faça login para continuar.');
        setMode('login');
      }
    } catch (err) {
      Alert.alert('Erro', 'Falha na conexão. Tente novamente.');
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoWrap}>
          <LinearGradient
            colors={[C.accent, C.opcoes]}
            style={styles.logoGradient}
          >
            <Text style={styles.logoText}>◈</Text>
          </LinearGradient>
          <Text style={styles.appName}>PremioLab</Text>
          <Text style={styles.tagline}>Seu laboratório de investimentos</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
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
              autoFocus={true}
              returnKeyType="next"
              style={styles.input}
            />
          </View>

          <View style={styles.inputWrap}>
            <Text style={styles.inputLabel}>Senha</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={C.dim}
              secureTextEntry
              returnKeyType="go"
              style={styles.input}
            />
          </View>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.8}
            style={styles.submitBtn}
          >
            <LinearGradient
              colors={[C.accent, C.opcoes]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.submitGradient}
            >
              {loading ? (
                <ActivityIndicator color="white" size="small" />
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
          onPress={function() { setMode(mode === 'login' ? 'register' : 'login'); }}
          style={styles.toggleWrap}
        >
          <Text style={styles.toggleText}>
            {mode === 'login' ? 'Não tem conta? ' : 'Já tem conta? '}
            <Text style={styles.toggleLink}>
              {mode === 'login' ? 'Criar conta' : 'Fazer login'}
            </Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

var styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoGradient: {
    width: 72,
    height: 72,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  logoText: {
    fontSize: 32,
    color: 'white',
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
  submitBtn: {
    marginTop: 8,
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
