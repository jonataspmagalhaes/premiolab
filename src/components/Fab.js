// ═══════════════════════════════════════════════════════════
// FAB — Floating Action Button com menu unificado por categorias
// Modal fullscreen com 3 seções: Investimentos, Finanças, Gestão
// Inclui toggle de privacidade (olho) logo abaixo do botão +
// ═══════════════════════════════════════════════════════════

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { C, F, SIZE } from '../theme';
import { usePrivacy } from '../contexts/PrivacyContext';

var GROUPS = [
  {
    title: 'INVESTIMENTOS',
    color: C.acoes,
    items: [
      { label: 'Operação', icon: 'wallet-outline', color: C.acoes, screen: 'AddOperacao' },
      { label: 'Opção', icon: 'flash-outline', color: C.opcoes, screen: 'AddOpcao' },
      { label: 'Provento', icon: 'cash-outline', color: C.fiis, screen: 'AddProvento' },
      { label: 'Renda Fixa', icon: 'document-text-outline', color: C.rf, screen: 'AddRendaFixa' },
    ],
  },
  {
    title: 'FINANÇAS',
    color: C.green,
    items: [
      { label: 'Movimentação', icon: 'swap-vertical-outline', color: C.green, screen: 'AddMovimentacao' },
      { label: 'Despesa', icon: 'arrow-up-circle-outline', color: C.red, screen: 'AddMovimentacao', params: { presetTipo: 'saida' } },
      { label: 'PIX', icon: 'flash-outline', color: C.green, screen: 'AddMovimentacao', params: { presetTipo: 'saida', presetPayMethod: 'pix' } },
    ],
  },
  {
    title: 'GESTÃO',
    color: C.accent,
    items: [
      { label: 'Nova Conta', icon: 'add-circle-outline', color: C.rf, screen: 'AddConta' },
      { label: 'Novo Cartão', icon: 'card-outline', color: C.accent, screen: 'AddCartao' },
      { label: 'Portfolio', icon: 'folder-outline', color: C.etfs, screen: 'ConfigPortfolios' },
      { label: 'Recorrentes', icon: 'repeat-outline', color: C.rf, screen: 'Recorrentes' },
    ],
  },
];

function renderItem(item, index, onPress) {
  return (
    <TouchableOpacity key={index} activeOpacity={0.7} onPress={function() { onPress(item); }}
      style={[styles.item, { borderColor: item.color + '40' }]}>
      <View style={[styles.itemIcon, { backgroundColor: item.color + '18' }]}>
        <Ionicons name={item.icon} size={18} color={item.color} />
      </View>
      <Text style={[styles.itemLabel, { color: C.text }]}>{item.label}</Text>
      <Ionicons name="chevron-forward" size={14} color={C.textTertiary} />
    </TouchableOpacity>
  );
}

export default function Fab(props) {
  var navigation = props.navigation;
  var extraItems = props.extraItems;
  var _open = useState(false);
  var open = _open[0];
  var setOpen = _open[1];
  var priv = usePrivacy();

  function handleItemPress(item) {
    setOpen(false);
    if (item.onPress) { item.onPress(); }
    else if (item.screen) { navigation.navigate(item.screen, item.params || undefined); }
  }

  return (
    <View style={styles.wrap}>
      <Modal visible={open} transparent={true} animationType="fade"
        onRequestClose={function() { setOpen(false); }}>
        <TouchableOpacity activeOpacity={1} style={styles.backdrop}
          onPress={function() { setOpen(false); }}>
          <View style={styles.modalInner}>
            <TouchableOpacity activeOpacity={1} onPress={function() {}}>
              <ScrollView showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.modalContent}>

                {/* Extras contextuais (ex: Análise IA) */}
                {extraItems && extraItems.length > 0 ? (
                  <View style={styles.group}>
                    {extraItems.map(function(item, i) {
                      return renderItem(item, i, handleItemPress);
                    })}
                  </View>
                ) : null}

                {GROUPS.map(function(group, gi) {
                  return (
                    <View key={gi} style={styles.group}>
                      <Text style={[styles.groupTitle, { color: group.color }]}>{group.title}</Text>
                      {group.items.map(function(item, ii) {
                        return renderItem(item, gi + '-' + ii, handleItemPress);
                      })}
                    </View>
                  );
                })}

              </ScrollView>
            </TouchableOpacity>

            {/* Botão fechar no modal */}
            <TouchableOpacity activeOpacity={0.8} onPress={function() { setOpen(false); }}
              style={styles.closeBtn}>
              <LinearGradient
                colors={['#ef4444', '#dc2626']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.closeBtnGradient}>
                <Text style={styles.closeBtnText}>×</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <TouchableOpacity activeOpacity={0.8} onPress={function() { setOpen(!open); }}
        accessibilityRole="button" accessibilityLabel={open ? 'Fechar menu' : 'Adicionar'}>
        <LinearGradient
          colors={open ? ['#ef4444', '#dc2626'] : ['#0ea5e9', '#a855f7']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.fabBtn}>
          <Text style={styles.fabBtnText}>{open ? '×' : '+'}</Text>
        </LinearGradient>
      </TouchableOpacity>
      <TouchableOpacity activeOpacity={0.7}
        onPress={function() { priv.togglePrivacy(); }}
        accessibilityRole="button"
        accessibilityLabel={priv.isPrivate ? 'Mostrar valores' : 'Ocultar valores'}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={[styles.privacyBtn, {
          backgroundColor: priv.isPrivate ? C.yellow + '15' : 'rgba(255,255,255,0.05)',
          borderColor: priv.isPrivate ? C.yellow + '30' : 'rgba(255,255,255,0.08)',
        }]}>
        <Ionicons name={priv.isPrivate ? 'eye-off-outline' : 'eye-outline'}
          size={16} color={priv.isPrivate ? C.yellow : C.textTertiary} />
      </TouchableOpacity>
    </View>
  );
}

var styles = StyleSheet.create({
  wrap: {
    position: 'absolute', bottom: SIZE.tabBarHeight + 16, right: 18,
    alignItems: 'flex-end', zIndex: 10,
  },
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end', alignItems: 'flex-end',
    paddingBottom: SIZE.tabBarHeight + 90, paddingRight: 18,
  },
  modalInner: {
    alignItems: 'flex-end',
    maxHeight: Dimensions.get('window').height * 0.65,
  },
  modalContent: {
    paddingBottom: 16, gap: 20,
  },
  group: {
    gap: 6,
  },
  groupTitle: {
    fontFamily: F.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 4,
    textAlign: 'right',
    paddingRight: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: SIZE.radius,
    backgroundColor: C.cardSolid,
    borderWidth: 1,
    minWidth: 200,
  },
  itemIcon: {
    width: 32, height: 32, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  itemLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: F.display,
    fontWeight: '700',
  },
  fabBtn: {
    width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#0ea5e9',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 14,
    elevation: 8,
  },
  fabBtnText: {
    fontSize: 28, color: '#fff', fontWeight: '300', lineHeight: 30,
  },
  closeBtn: {
    alignSelf: 'center', marginTop: 14,
  },
  closeBtnGradient: {
    width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 14,
    elevation: 8,
  },
  closeBtnText: {
    fontSize: 28, color: '#fff', fontWeight: '300', lineHeight: 30,
  },
  privacyBtn: {
    width: 36, height: 36, borderRadius: 18, marginTop: 10,
    borderWidth: 1,
    justifyContent: 'center', alignItems: 'center', alignSelf: 'center',
  },
});
