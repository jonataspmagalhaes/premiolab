import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  TouchableOpacity, Alert, ActivityIndicator, Keyboard,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { LinearGradient } from 'expo-linear-gradient';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getProfile, updateProfile } from '../../services/database';
import { supabase } from '../../config/supabase';
import { Glass, Pill } from '../../components';

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

function formatDateBR(isoDate) {
  if (!isoDate) return '';
  var parts = isoDate.substring(0, 10).split('-');
  if (parts.length !== 3) return '';
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

export default function ProfileScreen(props) {
  var navigation = props.navigation;
  var _auth = useAuth(); var user = _auth.user;

  var _nome = useState(''); var nome = _nome[0]; var setNome = _nome[1];
  var _email = useState(''); var email = _email[0]; var setEmail = _email[1];
  var _pais = useState(''); var pais = _pais[0]; var setPais = _pais[1];
  var _cidade = useState(''); var cidade = _cidade[0]; var setCidade = _cidade[1];
  var _dataNasc = useState(''); var dataNasc = _dataNasc[0]; var setDataNasc = _dataNasc[1];
  var _sexo = useState(''); var sexo = _sexo[0]; var setSexo = _sexo[1];
  var _saving = useState(false); var saving = _saving[0]; var setSaving = _saving[1];
  var _loaded = useState(false); var loaded = _loaded[0]; var setLoaded = _loaded[1];

  // Password change
  var _showPassword = useState(false); var showPassword = _showPassword[0]; var setShowPassword = _showPassword[1];
  var _currentPassword = useState(''); var currentPassword = _currentPassword[0]; var setCurrentPassword = _currentPassword[1];
  var _newPassword = useState(''); var newPassword = _newPassword[0]; var setNewPassword = _newPassword[1];
  var _confirmPassword = useState(''); var confirmPassword = _confirmPassword[0]; var setConfirmPassword = _confirmPassword[1];
  var _savingPassword = useState(false); var savingPassword = _savingPassword[0]; var setSavingPassword = _savingPassword[1];

  // Original values for dirty check
  var origRef = useRef({});
  var savedRef = useRef(false);

  useEffect(function() { loadProfile(); }, []);

  // beforeRemove dirty check
  useEffect(function() {
    var unsub = navigation.addListener('beforeRemove', function(e) {
      if (savedRef.current) return;
      var orig = origRef.current;
      var dirty = nome !== orig.nome || email !== orig.email ||
        pais !== orig.pais || cidade !== orig.cidade ||
        dataNasc !== orig.dataNasc || sexo !== orig.sexo;
      if (!dirty) return;
      e.preventDefault();
      Alert.alert('Descartar alterações?', 'Você tem alterações não salvas.', [
        { text: 'Continuar editando', style: 'cancel' },
        { text: 'Descartar', style: 'destructive', onPress: function() { navigation.dispatch(e.data.action); } },
      ]);
    });
    return unsub;
  }, [navigation, nome, email, pais, cidade, dataNasc, sexo]);

  var loadProfile = async function() {
    if (!user) return;
    var result = await getProfile(user.id);
    var p = result.data || {};
    var n = p.nome || '';
    var em = user.email || '';
    var pa = p.pais || '';
    var ci = p.cidade || '';
    var dn = formatDateBR(p.data_nascimento);
    var sx = p.sexo || '';

    setNome(n);
    setEmail(em);
    setPais(pa);
    setCidade(ci);
    setDataNasc(dn);
    setSexo(sx);

    origRef.current = { nome: n, email: em, pais: pa, cidade: ci, dataNasc: dn, sexo: sx };
    setLoaded(true);
  };

  var handleChangePassword = async function() {
    Keyboard.dismiss();
    if (!currentPassword) {
      Alert.alert('Erro', 'Informe sua senha atual');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      Alert.alert('Erro', 'A nova senha deve ter pelo menos 6 caracteres');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Erro', 'As senhas não coincidem');
      return;
    }
    setSavingPassword(true);
    try {
      // Verify current password by re-authenticating
      var verifyResult = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (verifyResult.error) {
        Alert.alert('Erro', 'Senha atual incorreta');
        setSavingPassword(false);
        return;
      }

      // Now update to new password
      var result = await supabase.auth.updateUser({ password: newPassword });
      if (result.error) {
        Alert.alert('Erro', result.error.message || 'Falha ao alterar senha');
      } else {
        Toast.show({ type: 'success', text1: 'Senha alterada com sucesso' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setShowPassword(false);
      }
    } catch (e) {
      Alert.alert('Erro', 'Falha ao alterar senha. Tente novamente.');
    }
    setSavingPassword(false);
  };

  var handleSave = async function() {
    Keyboard.dismiss();
    if (!nome.trim()) {
      Alert.alert('Erro', 'Nome é obrigatório');
      return;
    }

    setSaving(true);
    try {
      // Save profile fields
      var profileData = {
        nome: nome.trim(),
        pais: pais.trim(),
        cidade: cidade.trim(),
        sexo: sexo,
      };

      var parsedDate = parseDate(dataNasc);
      if (dataNasc && !parsedDate) {
        Alert.alert('Erro', 'Data de nascimento inválida. Use o formato DD/MM/AAAA.');
        setSaving(false);
        return;
      }
      if (parsedDate) {
        profileData.data_nascimento = parsedDate;
      } else {
        profileData.data_nascimento = null;
      }

      var result = await updateProfile(user.id, profileData);
      if (result.error) {
        Alert.alert('Erro', 'Falha ao salvar perfil');
        setSaving(false);
        return;
      }

      // Check if email changed
      var trimEmail = email.trim();
      if (trimEmail && trimEmail !== (user.email || '')) {
        var emailResult = await supabase.auth.updateUser({ email: trimEmail });
        if (emailResult.error) {
          Alert.alert('Erro', emailResult.error.message || 'Falha ao atualizar email');
          setSaving(false);
          return;
        }
        Toast.show({
          type: 'success',
          text1: 'Perfil salvo',
          text2: 'Verificação enviada para o novo email',
          visibilityTime: 3500,
        });
      } else {
        Toast.show({ type: 'success', text1: 'Perfil atualizado' });
      }

      savedRef.current = true;
      navigation.goBack();
    } catch (e) {
      Alert.alert('Erro', 'Falha ao salvar. Tente novamente.');
    }
    setSaving(false);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
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
        <Text style={styles.title}>Meu Perfil</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Nome */}
      <Glass glow={C.accent} padding={16}>
        <Text style={styles.fieldLabel}>NOME</Text>
        <TextInput
          value={nome}
          onChangeText={setNome}
          placeholder="Seu nome completo"
          placeholderTextColor={C.dim}
          returnKeyType="next"
          style={styles.input}
        />
      </Glass>

      {/* Email */}
      <Glass padding={16}>
        <Text style={styles.fieldLabel}>EMAIL</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="seu@email.com"
          placeholderTextColor={C.dim}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="next"
          style={styles.input}
        />
        <Text style={styles.hint}>
          Ao alterar o email, um link de verificação será enviado para o novo endereço.
        </Text>
      </Glass>

      {/* Alterar senha */}
      <Glass padding={16}>
        <TouchableOpacity
          onPress={function() { setShowPassword(!showPassword); }}
          activeOpacity={0.7}
          style={styles.passwordToggle}
        >
          <Text style={styles.passwordToggleText}>Alterar senha</Text>
          <Text style={styles.passwordChevron}>{showPassword ? '▾' : '›'}</Text>
        </TouchableOpacity>

        {showPassword && (
          <View style={styles.passwordFields}>
            <View style={{ marginBottom: 10 }}>
              <Text style={styles.fieldLabel}>SENHA ATUAL</Text>
              <TextInput
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="Digite sua senha atual"
                placeholderTextColor={C.dim}
                secureTextEntry
                returnKeyType="next"
                style={styles.input}
              />
            </View>
            <View style={{ marginBottom: 10 }}>
              <Text style={styles.fieldLabel}>NOVA SENHA</Text>
              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Mínimo 6 caracteres"
                placeholderTextColor={C.dim}
                secureTextEntry
                returnKeyType="next"
                style={styles.input}
              />
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={styles.fieldLabel}>CONFIRMAR SENHA</Text>
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Repita a nova senha"
                placeholderTextColor={C.dim}
                secureTextEntry
                returnKeyType="done"
                style={styles.input}
              />
            </View>
            <TouchableOpacity
              onPress={handleChangePassword}
              disabled={savingPassword}
              activeOpacity={0.8}
              style={styles.passwordBtn}
            >
              {savingPassword ? (
                <ActivityIndicator color={C.accent} size="small" />
              ) : (
                <Text style={styles.passwordBtnText}>Salvar nova senha</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </Glass>

      {/* País + Cidade */}
      <Glass padding={16}>
        <Text style={styles.fieldLabel}>PAÍS</Text>
        <TextInput
          value={pais}
          onChangeText={setPais}
          placeholder="Brasil"
          placeholderTextColor={C.dim}
          returnKeyType="next"
          style={styles.input}
        />

        <View style={{ height: 14 }} />

        <Text style={styles.fieldLabel}>CIDADE</Text>
        <TextInput
          value={cidade}
          onChangeText={setCidade}
          placeholder="São Paulo"
          placeholderTextColor={C.dim}
          returnKeyType="next"
          style={styles.input}
        />
      </Glass>

      {/* Data de nascimento */}
      <Glass padding={16}>
        <Text style={styles.fieldLabel}>DATA DE NASCIMENTO</Text>
        <TextInput
          value={dataNasc}
          onChangeText={function(t) { setDataNasc(maskDate(t)); }}
          placeholder="DD/MM/AAAA"
          placeholderTextColor={C.dim}
          keyboardType="numeric"
          maxLength={10}
          returnKeyType="done"
          style={styles.input}
        />
      </Glass>

      {/* Sexo */}
      <Glass padding={16}>
        <Text style={styles.fieldLabel}>SEXO</Text>
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
      </Glass>

      {/* Save button */}
      <TouchableOpacity
        onPress={handleSave}
        disabled={saving}
        activeOpacity={0.8}
        style={styles.saveBtn}
        accessibilityLabel="Salvar perfil"
        accessibilityRole="button"
      >
        <LinearGradient
          colors={[C.accent, C.opcoes]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.saveGradient}
        >
          {saving ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Text style={styles.saveText}>Salvar Perfil</Text>
          )}
        </LinearGradient>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: SIZE.gap },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 8,
  },
  back: { fontSize: 28, color: C.accent, fontWeight: '300' },
  title: { fontSize: 18, fontWeight: '800', color: C.text, fontFamily: F.display },
  fieldLabel: {
    fontSize: 10, color: C.dim, fontFamily: F.mono,
    letterSpacing: 0.8, marginBottom: 6,
  },
  input: {
    backgroundColor: C.cardSolid, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 15, color: C.text, fontFamily: F.body,
  },
  hint: {
    fontSize: 11, color: C.dim, fontFamily: F.body,
    marginTop: 6, lineHeight: 16,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  passwordToggle: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  passwordToggleText: { fontSize: 14, color: C.accent, fontFamily: F.body, fontWeight: '600' },
  passwordChevron: { fontSize: 16, color: C.dim },
  passwordFields: { marginTop: 14 },
  passwordBtn: {
    borderWidth: 1, borderColor: C.accent + '50', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  passwordBtnText: { fontSize: 13, color: C.accent, fontFamily: F.body, fontWeight: '600' },
  saveBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 8 },
  saveGradient: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 15, fontWeight: '700', color: 'white', fontFamily: F.display },
});
