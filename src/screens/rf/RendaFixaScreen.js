import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, Alert, Modal,
} from 'react-native';
import { animateLayout } from '../../utils/a11y';
var dateUtils = require('../../utils/dateUtils');
var parseLocalDate = dateUtils.parseLocalDate;
var formatDateBR = dateUtils.formatDateBR;

import { useFocusEffect } from '@react-navigation/native';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getRendaFixa } from '../../services/database';
import { supabase } from '../../config/supabase';
import { Glass, Badge, SectionLabel } from '../../components';
import * as Haptics from 'expo-haptics';
import { SkeletonRendaFixa, EmptyState } from '../../components/States';

var TIPO_LABELS = {
  cdb: 'CDB',
  lci_lca: 'LCI/LCA',
  tesouro_selic: 'Tesouro Selic',
  tesouro_ipca: 'Tesouro IPCA+',
  tesouro_pre: 'Tesouro Pré',
  debenture: 'Debênture',
};

var IDX_LABELS = {
  prefixado: 'PRE',
  cdi: 'CDI',
  ipca: 'IPCA+',
  selic: 'SELIC',
};

var IDX_COLORS = {
  prefixado: C.green,
  cdi: C.accent,
  ipca: C.fiis,
  selic: C.opcoes,
};

function formatTaxa(taxa, indexador) {
  var t = parseFloat(taxa) || 0;
  var idx = (indexador || 'prefixado').toLowerCase();
  if (idx === 'prefixado' || idx === 'pre') return t.toFixed(1) + '% a.a.';
  if (idx === 'cdi' || idx === 'cdi%') return t.toFixed(0) + '% CDI';
  if (idx === 'ipca' || idx === 'ipca+') return 'IPCA + ' + t.toFixed(1) + '%';
  if (idx === 'selic' || idx === 'selic%') return t.toFixed(0) + '% Selic';
  return t.toFixed(1) + '%';
}

export default function RendaFixaScreen(props) {
  var navigation = props.navigation;
  var user = useAuth().user;
  var s1 = useState([]); var items = s1[0]; var setItems = s1[1];
  var s2 = useState(true); var loading = s2[0]; var setLoading = s2[1];
  var s3 = useState(false); var refreshing = s3[0]; var setRefreshing = s3[1];
  var _infoModal = useState(null); var infoModal = _infoModal[0]; var setInfoModal = _infoModal[1];

  var load = async function() {
    if (!user) return;
    var result = await getRendaFixa(user.id);
    setItems(result.data || []);
    setLoading(false);
  };

  useFocusEffect(useCallback(function() { load(); }, [user]));

  var onRefresh = async function() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  var handleDelete = function(id) {
    var rf = null;
    for (var di = 0; di < items.length; di++) { if (items[di].id === id) { rf = items[di]; break; } }
    var detailMsg = rf
      ? (TIPO_LABELS[rf.tipo] || rf.tipo) + (rf.emissor ? ' — ' + rf.emissor : '') + '\nR$ ' + fmt(rf.valor_aplicado || 0) + '\n\nEssa ação não pode ser desfeita.'
      : 'Essa ação não pode ser desfeita.';
    Alert.alert(
      'Excluir título?',
      detailMsg,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async function() {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            var result = await supabase.from('renda_fixa').delete().eq('id', id);
            if (!result.error) {
              animateLayout();
              setItems(items.filter(function(i) { return i.id !== id; }));
            } else {
              Alert.alert('Erro', 'Falha ao excluir.');
            }
          },
        },
      ]
    );
  };

  var now = new Date();
  var ativos = items.filter(function(i) { return parseLocalDate(i.vencimento) > now; });
  var vencidos = items.filter(function(i) { return parseLocalDate(i.vencimento) <= now; });

  var totalAplicado = ativos.reduce(function(s, i) { return s + (parseFloat(i.valor_aplicado) || 0); }, 0);

  if (loading) return <View style={{ flex: 1, backgroundColor: C.bg, padding: 18 }}><SkeletonRendaFixa /></View>;

  return (
    <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={function() { navigation.goBack(); }}>
            <Text style={styles.back}>‹</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.title}>Renda Fixa</Text>
            <TouchableOpacity onPress={function() { setInfoModal({ title: 'Renda Fixa', text: 'CDB, LCI/LCA, Tesouro Direto e debêntures. Indexadores: CDI, IPCA, Selic ou prefixado.' }); }}>
              <Text style={{ fontSize: 13, color: C.accent }}>ⓘ</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={function() { navigation.navigate('AddRendaFixa'); }}>
            <Text style={styles.addIcon}>+</Text>
          </TouchableOpacity>
        </View>

        {/* Total */}
        <Glass glow={C.rf} padding={16}>
          <Text style={styles.totalLabel}>TOTAL APLICADO</Text>
          <Text style={styles.totalValue}>
            R$ {totalAplicado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          <Text style={styles.totalCount}>{ativos.length} título{ativos.length !== 1 ? 's' : ''} ativo{ativos.length !== 1 ? 's' : ''}</Text>
        </Glass>

        {ativos.length === 0 && vencidos.length === 0 && (
          <EmptyState
            ionicon="document-text-outline"
            title="Nenhum título"
            description="Cadastre seus investimentos de renda fixa."
            cta="Novo título"
            onCta={function() { navigation.navigate('AddRendaFixa'); }}
            color={C.rf}
          />
        )}

        {/* Ativos */}
        {ativos.length > 0 && (
          <View>
            <SectionLabel>ATIVOS</SectionLabel>
            <Glass padding={0}>
              {ativos.map(function(rf, i) {
                var daysLeft = Math.ceil((parseLocalDate(rf.vencimento) - now) / (1000 * 60 * 60 * 24));
                var valor = parseFloat(rf.valor_aplicado) || 0;
                var tipoLabel = TIPO_LABELS[rf.tipo] || rf.tipo;
                var idxLabel = IDX_LABELS[rf.indexador] || rf.indexador || 'PRE';
                var idxColor = IDX_COLORS[rf.indexador] || C.accent;

                return (
                  <View
                    key={rf.id || i}
                    style={[styles.rfRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={styles.rfTipo}>{tipoLabel}</Text>
                        <Badge text={idxLabel} color={idxColor} />
                      </View>
                      <Text style={styles.rfTaxa}>{formatTaxa(rf.taxa, rf.indexador)}</Text>
                      {rf.emissor ? <Text style={styles.rfEmissor}>{rf.emissor}</Text> : null}
                      <Text style={styles.rfDetail}>
                        {rf.corretora || ''} | Venc {formatDateBR(rf.vencimento)} | {daysLeft}d
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 5 }}>
                      <Text style={styles.rfValor}>
                        R$ {valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                      <Badge text={daysLeft + 'd'} color={daysLeft < 30 ? C.red : C.rf} />
                      <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                        <TouchableOpacity onPress={function() {
                          navigation.navigate('EditRendaFixa', { rf: rf });
                        }}>
                          <Text style={styles.actionLink}>Editar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={function() { handleDelete(rf.id); }}>
                          <Text style={[styles.actionLink, { color: C.red }]}>Excluir</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}
            </Glass>
          </View>
        )}

        {/* Vencidos */}
        {vencidos.length > 0 && (
          <View>
            <SectionLabel>VENCIDOS</SectionLabel>
            <Glass padding={0}>
              {vencidos.map(function(rf, i) {
                var valor = parseFloat(rf.valor_aplicado) || 0;
                var tipoLabel = TIPO_LABELS[rf.tipo] || rf.tipo;

                return (
                  <View
                    key={rf.id || i}
                    style={[styles.rfRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={[styles.rfTipo, { color: C.dim }]}>{tipoLabel}</Text>
                        <Badge text="VENCIDO" color={C.dim} />
                      </View>
                      <Text style={styles.rfDetail}>
                        {formatTaxa(rf.taxa, rf.indexador)} | {rf.corretora || ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 5 }}>
                      <Text style={[styles.rfValor, { color: C.dim }]}>
                        R$ {valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Text>
                      <TouchableOpacity onPress={function() { handleDelete(rf.id); }}>
                        <Text style={[styles.actionLink, { color: C.red }]}>Excluir</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </Glass>
          </View>
        )}

        {/* Add button */}
        <TouchableOpacity
          activeOpacity={0.8}
          style={styles.addBtn}
          onPress={function() { navigation.navigate('AddRendaFixa'); }}
        >
          <Text style={styles.addBtnText}>+ Novo Título</Text>
        </TouchableOpacity>

        <View style={{ height: SIZE.tabBarHeight + 20 }} />

        <Modal visible={infoModal !== null} animationType="fade" transparent={true}
          onRequestClose={function() { setInfoModal(null); }}>
          <TouchableOpacity activeOpacity={1} onPress={function() { setInfoModal(null); }}
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 30 }}>
            <TouchableOpacity activeOpacity={1}
              style={{ backgroundColor: C.card, borderRadius: 14, padding: 20, maxWidth: 340, width: '100%', borderWidth: 1, borderColor: C.border }}>
              <Text style={{ fontSize: 13, color: C.text, fontFamily: F.display, fontWeight: '700', marginBottom: 10 }}>
                {infoModal && infoModal.title || ''}
              </Text>
              <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body, lineHeight: 18 }}>
                {infoModal && infoModal.text || ''}
              </Text>
              <TouchableOpacity onPress={function() { setInfoModal(null); }}
                style={{ marginTop: 14, alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 8, borderRadius: 8, backgroundColor: C.accent }}>
                <Text style={{ fontSize: 12, color: C.text, fontFamily: F.mono, fontWeight: '600' }}>Fechar</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      </ScrollView>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 18, gap: SIZE.gap },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 8,
  },
  back: { fontSize: 28, color: C.accent, fontWeight: '300' },
  title: { fontSize: 20, fontWeight: '800', color: C.text, fontFamily: F.display },
  addIcon: { fontSize: 28, color: C.rf, fontWeight: '300' },

  totalLabel: { fontSize: 12, color: C.dim, fontFamily: F.mono, letterSpacing: 0.8 },
  totalValue: { fontSize: 30, fontWeight: '800', color: C.text, fontFamily: F.display, marginTop: 4 },
  totalCount: { fontSize: 13, color: C.sub, fontFamily: F.body, marginTop: 4 },

  rfRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 16 },
  rfTipo: { fontSize: 17, fontWeight: '700', color: C.text, fontFamily: F.display },
  rfTaxa: { fontSize: 15, fontWeight: '600', color: C.rf, fontFamily: F.mono, marginTop: 3 },
  rfEmissor: { fontSize: 13, color: C.sub, fontFamily: F.body, marginTop: 2 },
  rfDetail: { fontSize: 12, color: C.dim, fontFamily: F.mono, marginTop: 3 },
  rfValor: { fontSize: 17, fontWeight: '700', color: C.text, fontFamily: F.mono },
  actionLink: { fontSize: 13, color: C.accent, fontFamily: F.mono, fontWeight: '600' },

  addBtn: { backgroundColor: C.rf, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  addBtnText: { fontSize: 17, fontWeight: '700', color: 'white', fontFamily: F.display },
});
