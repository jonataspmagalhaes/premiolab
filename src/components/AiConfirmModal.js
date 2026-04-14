import React, { useState, useEffect } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, F } from '../theme';
import { useAuth } from '../contexts/AuthContext';
var aiUsageService = require('../services/aiUsageService');
var database = require('../services/database');

function AiConfirmModal(props) {
  var visible = props.visible;
  var onConfirm = props.onConfirm;
  var onCancel = props.onCancel;
  var analysisType = props.analysisType || 'análise';
  var navigation = props.navigation;

  var user = useAuth().user;
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _usage = useState(null); var usage = _usage[0]; var setUsage = _usage[1];
  var _agreed = useState(false); var agreed = _agreed[0]; var setAgreed = _agreed[1];
  var _profileMissing = useState(false); var profileMissing = _profileMissing[0]; var setProfileMissing = _profileMissing[1];
  var _profileStale = useState(false); var profileStale = _profileStale[0]; var setProfileStale = _profileStale[1];

  useEffect(function() {
    if (visible && user) {
      setLoading(true);
      setAgreed(false);
      setProfileMissing(false);
      setProfileStale(false);
      Promise.all([
        aiUsageService.getAiUsageSummary(user.id),
        database.getProfile(user.id),
      ]).then(function(results) {
        var summary = results[0];
        var profileResult = results[1];
        setUsage(summary);
        var data = profileResult && profileResult.data ? profileResult.data : {};
        var hasPerfil = !!(data.perfil_investidor && data.objetivo_investimento && data.horizonte_investimento);
        var profileStale = false;
        if (hasPerfil && data.perfil_investidor_updated_at) {
          var updatedAt = new Date(data.perfil_investidor_updated_at);
          var oneYear = 365 * 24 * 60 * 60 * 1000;
          if (Date.now() - updatedAt.getTime() > oneYear) {
            profileStale = true;
          }
        }
        setProfileMissing(!hasPerfil);
        setProfileStale(profileStale);
        setLoading(false);
      }).catch(function() {
        setUsage({ today: 0, month: 0, credits: 0, dailyLimit: 5, monthlyLimit: 100 });
        setProfileMissing(false);
        setLoading(false);
      });
    }
  }, [visible, user]);

  var todayUsed = usage ? usage.today : 0;
  var todayLimit = usage ? usage.dailyLimit : 5;
  var monthUsed = usage ? usage.month : 0;
  var monthLimit = usage ? usage.monthlyLimit : 100;
  var extras = usage ? usage.credits : 0;
  var todayRemaining = Math.max(0, todayLimit - todayUsed) + extras;

  return (
    <Modal visible={visible} animationType="fade" transparent={true} onRequestClose={onCancel}>
      <View style={st.overlay}>
        <View style={st.container}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={st.header}>
              <Ionicons name="sparkles" size={28} color={C.accent} />
              <Text style={st.title}>Análise IA</Text>
              <Text style={st.subtitle}>{analysisType}</Text>
            </View>

            {/* Credits info */}
            {loading ? (
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <ActivityIndicator size="small" color={C.accent} />
              </View>
            ) : (
              <View style={st.creditsCard}>
                <Text style={st.creditsTitle}>CRÉDITOS DISPONÍVEIS</Text>
                <View style={st.creditsRow}>
                  <View style={st.creditItem}>
                    <Text style={st.creditValue}>{todayUsed}/{todayLimit}</Text>
                    <Text style={st.creditLabel}>Hoje</Text>
                  </View>
                  <View style={[st.creditDivider]} />
                  <View style={st.creditItem}>
                    <Text style={st.creditValue}>{monthUsed}/{monthLimit}</Text>
                    <Text style={st.creditLabel}>Mês</Text>
                  </View>
                  {extras > 0 ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={[st.creditDivider]} />
                      <View style={st.creditItem}>
                        <Text style={[st.creditValue, { color: C.green }]}>{'+'+ extras}</Text>
                        <Text style={st.creditLabel}>Extras</Text>
                      </View>
                    </View>
                  ) : null}
                </View>
                {todayRemaining <= 0 ? (
                  <View style={st.noCreditsWarn}>
                    <Ionicons name="alert-circle" size={14} color={C.red} />
                    <Text style={st.noCreditsText}>Sem créditos disponíveis</Text>
                  </View>
                ) : (
                  <Text style={st.creditAvail}>
                    {todayRemaining + (todayRemaining === 1 ? ' análise disponível' : ' análises disponíveis')}
                  </Text>
                )}
              </View>
            )}

            {/* Profile missing or stale warning */}
            {!loading && (profileMissing || profileStale) ? (
              <View style={st.profileCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Ionicons name={profileMissing ? 'person-circle-outline' : 'time-outline'} size={18} color={C.opcoes} />
                  <Text style={st.profileTitle}>{profileMissing ? 'Perfil de investidor não preenchido' : 'Perfil desatualizado (mais de 1 ano)'}</Text>
                </View>
                <Text style={st.profileText}>
                  {profileMissing
                    ? 'Para uma análise personalizada e mais precisa, preencha seu perfil de investidor (perfil de risco, objetivo e horizonte de investimento).'
                    : 'Seu perfil de investidor foi preenchido há mais de 1 ano. Seus objetivos ou tolerância a risco podem ter mudado. Recomendamos revisar.'}
                </Text>
                {navigation ? (
                  <TouchableOpacity
                    style={st.profileBtn}
                    activeOpacity={0.7}
                    onPress={function() {
                      onCancel();
                      setTimeout(function() {
                        navigation.navigate('ConfigPerfilInvestidor');
                      }, 300);
                    }}
                  >
                    <Ionicons name="arrow-forward-circle" size={16} color="#fff" />
                    <Text style={st.profileBtnText}>{profileMissing ? 'Preencher perfil' : 'Revisar perfil'}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {/* Disclaimer */}
            <View style={st.disclaimerCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Ionicons name="information-circle" size={16} color={C.etfs} />
                <Text style={st.disclaimerTitle}>Aviso Importante</Text>
              </View>
              <Text style={st.disclaimerText}>
                Esta análise é gerada por Inteligência Artificial e tem caráter exclusivamente informativo e educacional. Não constitui recomendação de investimento, consultoria financeira ou qualquer tipo de aconselhamento profissional.
              </Text>
              <Text style={[st.disclaimerText, { marginTop: 6 }]}>
                Todo investimento envolve riscos, incluindo a possibilidade de perda do capital investido. Decisões de investimento devem ser tomadas com base em sua própria análise e, se necessário, com o auxílio de um profissional certificado.
              </Text>
              <Text style={[st.disclaimerText, { marginTop: 6 }]}>
                Ao prosseguir, você declara estar ciente de que esta é uma ferramenta de apoio e que a responsabilidade pelas decisões de investimento é exclusivamente sua.
              </Text>
            </View>

            {/* Agreement toggle */}
            <TouchableOpacity
              style={st.agreeRow}
              onPress={function() { setAgreed(!agreed); }}
              activeOpacity={0.7}
            >
              <View style={[st.checkbox, agreed && st.checkboxChecked]}>
                {agreed ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
              </View>
              <Text style={st.agreeText}>Li e compreendo que esta análise não é uma recomendação de investimento</Text>
            </TouchableOpacity>

            {/* Buttons */}
            <View style={st.buttons}>
              <TouchableOpacity
                style={[st.confirmBtn, (!agreed || todayRemaining <= 0) && st.confirmBtnDisabled]}
                onPress={function() { if (agreed && todayRemaining > 0) onConfirm(); }}
                disabled={!agreed || todayRemaining <= 0 || loading}
                activeOpacity={0.7}
              >
                <Ionicons name="sparkles" size={16} color={agreed && todayRemaining > 0 ? '#fff' : C.dim} />
                <Text style={[st.confirmText, (!agreed || todayRemaining <= 0) && { color: C.dim }]}>
                  Concordo e quero continuar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.cancelBtn} onPress={onCancel} activeOpacity={0.7}>
                <Text style={st.cancelText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: '#12121e',
    borderRadius: 20,
    padding: 20,
    maxHeight: '90%',
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
    gap: 4,
  },
  title: {
    fontSize: 18,
    fontFamily: F.display,
    color: C.text,
    marginTop: 6,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: F.body,
    color: C.dim,
  },
  creditsCard: {
    backgroundColor: 'rgba(108,92,231,0.08)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(108,92,231,0.15)',
  },
  creditsTitle: {
    fontSize: 9,
    fontFamily: F.mono,
    color: C.accent,
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 10,
  },
  creditsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 0,
  },
  creditItem: {
    alignItems: 'center',
    flex: 1,
  },
  creditValue: {
    fontSize: 18,
    fontFamily: F.mono,
    color: C.text,
    fontWeight: '700',
  },
  creditLabel: {
    fontSize: 10,
    fontFamily: F.body,
    color: C.dim,
    marginTop: 2,
  },
  creditDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  creditAvail: {
    fontSize: 11,
    fontFamily: F.body,
    color: C.green,
    textAlign: 'center',
    marginTop: 8,
  },
  noCreditsWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 8,
  },
  noCreditsText: {
    fontSize: 11,
    fontFamily: F.body,
    color: C.red,
  },
  profileCard: {
    backgroundColor: 'rgba(139,92,246,0.08)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
  },
  profileTitle: {
    fontSize: 12,
    fontFamily: F.display,
    color: C.opcoes,
  },
  profileText: {
    fontSize: 11,
    fontFamily: F.body,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 16,
  },
  profileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: C.opcoes,
    borderRadius: 8,
    paddingVertical: 10,
    marginTop: 10,
  },
  profileBtnText: {
    fontSize: 13,
    fontFamily: F.display,
    color: '#fff',
  },
  disclaimerCard: {
    backgroundColor: 'rgba(245,158,11,0.06)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.12)',
  },
  disclaimerTitle: {
    fontSize: 12,
    fontFamily: F.display,
    color: C.etfs,
  },
  disclaimerText: {
    fontSize: 11,
    fontFamily: F.body,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 16,
  },
  agreeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
    paddingVertical: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: C.dim,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  agreeText: {
    fontSize: 12,
    fontFamily: F.body,
    color: C.text,
    flex: 1,
    lineHeight: 17,
  },
  buttons: {
    gap: 10,
  },
  confirmBtn: {
    backgroundColor: C.accent,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  confirmBtnDisabled: {
    backgroundColor: 'rgba(108,92,231,0.2)',
  },
  confirmText: {
    fontSize: 14,
    fontFamily: F.display,
    color: '#fff',
  },
  cancelBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  cancelText: {
    fontSize: 13,
    fontFamily: F.body,
    color: C.dim,
  },
});

module.exports = AiConfirmModal;
