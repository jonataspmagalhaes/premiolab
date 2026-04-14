import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, F, SIZE } from '../../../theme';
import { Glass, Pill } from '../../../components';
import { useAuth } from '../../../contexts/AuthContext';
import { getProfile, updateProfile } from '../../../services/database';
import Toast from 'react-native-toast-message';

var PERFIS = [
  { k: 'conservador', l: 'Conservador', icon: 'shield-checkmark-outline', desc: 'Prioriza segurança e preservação do capital. Prefere renda fixa e ativos de baixo risco.' },
  { k: 'moderado', l: 'Moderado', icon: 'swap-horizontal-outline', desc: 'Busca equilíbrio entre segurança e rentabilidade. Mix de renda fixa e variável.' },
  { k: 'arrojado', l: 'Arrojado', icon: 'rocket-outline', desc: 'Aceita maior volatilidade em busca de retornos acima da média. Foco em renda variável.' },
];

var OBJETIVOS = [
  { k: 'renda_passiva', l: 'Renda Passiva', icon: 'cash-outline', desc: 'Gerar renda mensal recorrente com dividendos, FIIs e opções.' },
  { k: 'crescimento', l: 'Crescimento', icon: 'trending-up-outline', desc: 'Valorização do patrimônio no longo prazo com ações de crescimento.' },
  { k: 'preservacao', l: 'Preservação', icon: 'umbrella-outline', desc: 'Proteger o patrimônio contra inflação e manter poder de compra.' },
  { k: 'especulacao', l: 'Especulação', icon: 'flash-outline', desc: 'Operações de curto prazo buscando ganhos rápidos com opções e trades.' },
];

var HORIZONTES = [
  { k: 'curto', l: 'Curto Prazo', icon: 'time-outline', desc: 'Até 1 ano. Foco em liquidez e oportunidades rápidas.' },
  { k: 'medio', l: 'Médio Prazo', icon: 'calendar-outline', desc: '1 a 5 anos. Equilíbrio entre liquidez e rentabilidade.' },
  { k: 'longo', l: 'Longo Prazo', icon: 'hourglass-outline', desc: '5+ anos. Foco em acumulação e juros compostos.' },
];

export default function ConfigPerfilInvestidorScreen(props) {
  var navigation = props.navigation;
  var user = useAuth().user;

  var _perfil = useState(''); var perfil = _perfil[0]; var setPerfil = _perfil[1];
  var _objetivo = useState(''); var objetivo = _objetivo[0]; var setObjetivo = _objetivo[1];
  var _horizonte = useState(''); var horizonte = _horizonte[0]; var setHorizonte = _horizonte[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _saving = useState(false); var saving = _saving[0]; var setSaving = _saving[1];
  var savedRef = useRef(false);

  useEffect(function() {
    if (!user) return;
    getProfile(user.id).then(function(res) {
      if (res.data) {
        setPerfil(res.data.perfil_investidor || '');
        setObjetivo(res.data.objetivo_investimento || '');
        setHorizonte(res.data.horizonte_investimento || '');
      }
      setLoading(false);
    }).catch(function() { setLoading(false); });
  }, [user]);

  var handleSave = function() {
    if (saving || !user) return;
    setSaving(true);
    updateProfile(user.id, {
      perfil_investidor: perfil,
      objetivo_investimento: objetivo,
      horizonte_investimento: horizonte,
      perfil_investidor_updated_at: new Date().toISOString(),
    }).then(function() {
      setSaving(false);
      savedRef.current = true;
      Toast.show({ type: 'success', text1: 'Perfil de investidor salvo' });
      navigation.goBack();
    }).catch(function() {
      setSaving(false);
      Toast.show({ type: 'error', text1: 'Erro ao salvar' });
    });
  };

  var renderOptionCards = function(items, selected, onSelect) {
    return items.map(function(item) {
      var isSelected = selected === item.k;
      return (
        <TouchableOpacity
          key={item.k}
          style={[st.optionCard, isSelected && st.optionCardActive]}
          onPress={function() { onSelect(item.k); }}
          activeOpacity={0.7}
        >
          <View style={[st.optionIcon, isSelected && { backgroundColor: C.accent + '22', borderColor: C.accent + '40' }]}>
            <Ionicons name={item.icon} size={20} color={isSelected ? C.accent : C.dim} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[st.optionLabel, isSelected && { color: C.accent }]}>{item.l}</Text>
            <Text style={st.optionDesc}>{item.desc}</Text>
          </View>
          {isSelected ? (
            <Ionicons name="checkmark-circle" size={22} color={C.accent} />
          ) : (
            <View style={st.radioEmpty} />
          )}
        </TouchableOpacity>
      );
    });
  };

  if (loading) {
    return (
      <View style={st.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      </View>
    );
  }

  return (
    <View style={st.container}>
      <View style={st.headerBar}>
        <TouchableOpacity onPress={function() { navigation.goBack(); }} accessibilityLabel="Voltar">
          <Ionicons name="chevron-back" size={28} color={C.text} />
        </TouchableOpacity>
        <Text style={st.headerTitle}>Perfil de Investidor</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: SIZE.padding, gap: 20, paddingBottom: 100 }}>
        {/* Info card */}
        <Glass padding={14}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Ionicons name="sparkles" size={16} color={C.accent} />
            <Text style={{ fontSize: 13, fontFamily: F.display, color: C.text }}>Personalize sua análise IA</Text>
          </View>
          <Text style={{ fontSize: 11, fontFamily: F.body, color: C.dim, lineHeight: 16 }}>
            Configure seu perfil para que a IA entenda seus objetivos e faça análises mais alinhadas com suas metas e tolerância a risco.
          </Text>
        </Glass>

        {/* Perfil */}
        <View>
          <Text style={st.sectionTitle}>SEU PERFIL</Text>
          {renderOptionCards(PERFIS, perfil, setPerfil)}
        </View>

        {/* Objetivo */}
        <View>
          <Text style={st.sectionTitle}>OBJETIVO PRINCIPAL</Text>
          {renderOptionCards(OBJETIVOS, objetivo, setObjetivo)}
        </View>

        {/* Horizonte */}
        <View>
          <Text style={st.sectionTitle}>HORIZONTE DE INVESTIMENTO</Text>
          {renderOptionCards(HORIZONTES, horizonte, setHorizonte)}
        </View>
      </ScrollView>

      {/* Save button */}
      <View style={st.footer}>
        <TouchableOpacity
          style={[st.saveBtn, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.7}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={st.saveBtnText}>Salvar Perfil</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

var st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SIZE.padding,
    paddingTop: 8,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: F.display,
    color: C.text,
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: F.mono,
    color: C.dim,
    letterSpacing: 1,
    marginBottom: 10,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  optionCardActive: {
    borderColor: C.accent + '50',
    backgroundColor: C.accent + '08',
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: C.border,
  },
  optionLabel: {
    fontSize: 14,
    fontFamily: F.display,
    color: C.text,
    marginBottom: 2,
  },
  optionDesc: {
    fontSize: 11,
    fontFamily: F.body,
    color: C.dim,
    lineHeight: 15,
  },
  radioEmpty: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: C.border,
  },
  footer: {
    padding: SIZE.padding,
    paddingBottom: 30,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  saveBtn: {
    backgroundColor: C.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 15,
    fontFamily: F.display,
    color: '#fff',
  },
});
