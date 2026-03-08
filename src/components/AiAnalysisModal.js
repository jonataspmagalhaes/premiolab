// ═══════════════════════════════════════════════════════════
// AiAnalysisModal — Modal reutilizável para exibir análises IA
// Usado em HomeScreen, CarteiraScreen, AssetDetailScreen
// ═══════════════════════════════════════════════════════════

import React from 'react';
import {
  View, Text, ScrollView, Modal, TouchableOpacity, StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F } from '../theme';

// Mapeamento de seções por tipo de análise
var SECTION_CONFIG = {
  resumo: [
    { key: 'resumo', title: 'Resumo', icon: 'reader-outline', color: C.accent },
    { key: 'acoes_urgentes', title: 'Ações Urgentes', icon: 'alert-circle-outline', color: C.etfs },
    { key: 'dica_do_dia', title: 'Dica do Dia', icon: 'bulb-outline', color: C.fiis },
  ],
  carteira: [
    { key: 'diagnostico', title: 'Diagnóstico', icon: 'analytics-outline', color: C.accent },
    { key: 'oportunidades', title: 'Oportunidades', icon: 'trending-up-outline', color: C.green },
    { key: 'riscos', title: 'Riscos', icon: 'warning-outline', color: C.red },
    { key: 'proximos_passos', title: 'Próximos Passos', icon: 'footsteps-outline', color: C.rf },
  ],
  ativo: [
    { key: 'diagnostico', title: 'Diagnóstico', icon: 'analytics-outline', color: C.accent },
    { key: 'oportunidades', title: 'Oportunidades', icon: 'trending-up-outline', color: C.green },
    { key: 'riscos', title: 'Riscos', icon: 'warning-outline', color: C.red },
    { key: 'projecao', title: 'Projeção', icon: 'telescope-outline', color: C.rf },
  ],
  estrategia: [
    { key: 'oportunidades_venda', title: 'Oportunidades de Venda', icon: 'trending-up-outline', color: C.green },
    { key: 'protecao', title: 'Proteção', icon: 'shield-outline', color: C.rf },
    { key: 'gestao', title: 'Gestão', icon: 'settings-outline', color: C.etfs },
  ],
  renda: [
    { key: 'diagnostico', title: 'Diagnóstico', icon: 'analytics-outline', color: C.accent },
    { key: 'otimizacao', title: 'Otimização', icon: 'rocket-outline', color: C.green },
    { key: 'projecao', title: 'Projeção', icon: 'telescope-outline', color: C.rf },
  ],
};

function AiAnalysisModal(props) {
  var visible = props.visible;
  var onClose = props.onClose;
  var result = props.result;
  var loading = props.loading;
  var error = props.error;
  var type = props.type || 'resumo';
  var title = props.title || 'Análise IA';
  var usage = props.usage;
  var onSave = props.onSave;
  var saving = props.saving;

  var sections = SECTION_CONFIG[type] || SECTION_CONFIG.resumo;

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={st.overlay}>
        <View style={st.container}>
          {/* Header */}
          <View style={st.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <Ionicons name="sparkles" size={18} color={C.accent} />
              <Text style={st.title} numberOfLines={1}>{title}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={22} color={C.text} />
            </TouchableOpacity>
          </View>

          {/* Usage bar */}
          {usage ? (
            <View style={st.usageBar}>
              <Text style={st.usageText}>
                {'Hoje: ' + (usage.today || 0) + '/' + (usage.daily_limit || 5) + ' | Mês: ' + (usage.month || 0) + '/' + (usage.monthly_limit || 100)}
                {usage.credits > 0 ? ' | +' + usage.credits + ' extras' : ''}
              </Text>
            </View>
          ) : null}

          {/* Content */}
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {loading ? (
              <View style={st.loadingWrap}>
                <ActivityIndicator size="large" color={C.accent} />
                <Text style={st.loadingText}>Analisando com IA...</Text>
                <Text style={st.loadingSubtext}>Isso pode levar alguns segundos</Text>
              </View>
            ) : error ? (
              <View style={st.errorWrap}>
                <Ionicons name="alert-circle" size={32} color={C.red} />
                <Text style={st.errorText}>{error}</Text>
                <TouchableOpacity onPress={onClose} style={st.errorBtn}>
                  <Text style={st.errorBtnText}>Fechar</Text>
                </TouchableOpacity>
              </View>
            ) : result ? (
              <View style={{ gap: 16, paddingBottom: 24 }}>
                {sections.map(function(sec) {
                  var content = result[sec.key];
                  if (!content) return null;
                  return (
                    <View key={sec.key} style={st.sectionCard}>
                      <View style={st.sectionHeader}>
                        <View style={[st.sectionIcon, { backgroundColor: sec.color + '18', borderColor: sec.color + '30' }]}>
                          <Ionicons name={sec.icon} size={16} color={sec.color} />
                        </View>
                        <Text style={[st.sectionTitle, { color: sec.color }]}>{sec.title}</Text>
                      </View>
                      <Text style={st.sectionContent}>{content}</Text>
                    </View>
                  );
                })}

                {/* Disclaimer */}
                <View style={st.disclaimerBox}>
                  <Ionicons name="information-circle-outline" size={13} color="rgba(245,158,11,0.6)" />
                  <Text style={st.disclaimerText}>
                    Esta análise é gerada por IA e não constitui recomendação de investimento. Todo investimento envolve riscos.
                  </Text>
                </View>

                {/* Model info */}
                {result._meta ? (
                  <Text style={st.metaText}>
                    {'Modelo: ' + (result._meta.model || '?') + ' | Tokens: ' + (result._meta.output_tokens || '?')}
                  </Text>
                ) : null}

                {/* Save button */}
                {onSave && result ? (
                  <TouchableOpacity
                    style={st.saveBtn}
                    onPress={onSave}
                    disabled={saving}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Salvar análise"
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color={C.accent} />
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="bookmark-outline" size={16} color={C.accent} />
                        <Text style={st.saveBtnText}>Salvar análise</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

var st = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#12121e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
    minHeight: '50%',
    padding: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
    fontFamily: F.display,
    flex: 1,
  },
  usageBar: {
    backgroundColor: 'rgba(108,92,231,0.08)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(108,92,231,0.15)',
  },
  usageText: {
    fontSize: 10,
    color: C.accent,
    fontFamily: F.mono,
    fontWeight: '600',
    textAlign: 'center',
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: C.text,
    fontFamily: F.display,
    fontWeight: '600',
  },
  loadingSubtext: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    fontFamily: F.body,
  },
  errorWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  errorText: {
    fontSize: 13,
    color: C.red,
    fontFamily: F.body,
    textAlign: 'center',
    lineHeight: 18,
  },
  errorBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginTop: 8,
  },
  errorBtnText: {
    fontSize: 13,
    color: C.text,
    fontFamily: F.mono,
    fontWeight: '600',
  },
  sectionCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  sectionIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: F.display,
    letterSpacing: 0.3,
  },
  sectionContent: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    fontFamily: F.body,
    lineHeight: 20,
  },
  metaText: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.2)',
    fontFamily: F.mono,
    textAlign: 'center',
    marginTop: 4,
  },
  saveBtn: {
    borderWidth: 1,
    borderColor: C.accent,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 40,
  },
  saveBtnText: {
    fontSize: 13,
    color: C.accent,
    fontFamily: F.display,
    fontWeight: '600',
  },
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: 'rgba(245,158,11,0.06)',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.1)',
  },
  disclaimerText: {
    fontSize: 9,
    color: 'rgba(245,158,11,0.6)',
    fontFamily: F.body,
    flex: 1,
    lineHeight: 14,
  },
});

module.exports = AiAnalysisModal;
