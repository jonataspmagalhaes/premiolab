// ═══════════════════════════════════════════════════════════
// FAB — Floating Action Button com menu de ações
// Reutilizado em Home, Carteira, Opções, Renda
// Inclui toggle de privacidade (olho) logo abaixo do botão +
// ═══════════════════════════════════════════════════════════

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { C, F, SIZE } from '../theme';
import { usePrivacy } from '../contexts/PrivacyContext';

var ITEMS = [
  { label: 'Operação', icon: 'wallet-outline', color: C.acoes, screen: 'AddOperacao' },
  { label: 'Opção', icon: 'flash-outline', color: C.opcoes, screen: 'AddOpcao' },
  { label: 'Provento', icon: 'cash-outline', color: C.fiis, screen: 'AddProvento' },
  { label: 'Renda Fixa', icon: 'document-text-outline', color: C.rf, screen: 'AddRendaFixa' },
];

export default function Fab(props) {
  var navigation = props.navigation;
  var items = props.items || ITEMS;
  var _open = useState(false);
  var open = _open[0];
  var setOpen = _open[1];
  var priv = usePrivacy();

  return (
    <View style={styles.wrap}>
      {open ? (
        <View style={{ marginBottom: 12, gap: 8, alignItems: 'flex-end' }}>
          {items.map(function(item, i) {
            return (
              <TouchableOpacity key={i} activeOpacity={0.7}
                onPress={function() {
                  setOpen(false);
                  if (item.onPress) { item.onPress(); }
                  else if (item.screen) { navigation.navigate(item.screen, item.params || undefined); }
                }}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  paddingHorizontal: 16, paddingVertical: 12,
                  borderRadius: 14, borderWidth: 1,
                  borderColor: item.color + '40', backgroundColor: item.color + '10',
                }}>
                <Ionicons name={item.icon} size={16} color={item.color} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: item.color, fontFamily: F.display }}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
      <TouchableOpacity activeOpacity={0.8} onPress={function() { setOpen(!open); }}
        accessibilityRole="button" accessibilityLabel={open ? 'Fechar menu' : 'Adicionar ativo'}>
        <LinearGradient
          colors={open ? ['#ef4444', '#dc2626'] : ['#0ea5e9', '#a855f7']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{
            width: 56, height: 56, borderRadius: 28,
            justifyContent: 'center', alignItems: 'center',
            shadowColor: open ? '#ef4444' : '#0ea5e9',
            shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 14,
            elevation: 8,
          }}>
          <Text style={{ fontSize: 28, color: '#fff', fontWeight: '300', lineHeight: 30 }}>{open ? '×' : '+'}</Text>
        </LinearGradient>
      </TouchableOpacity>
      <TouchableOpacity activeOpacity={0.7}
        onPress={function() { priv.togglePrivacy(); }}
        accessibilityRole="button"
        accessibilityLabel={priv.isPrivate ? 'Mostrar valores' : 'Ocultar valores'}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{
          width: 36, height: 36, borderRadius: 18, marginTop: 10,
          backgroundColor: priv.isPrivate ? C.yellow + '15' : 'rgba(255,255,255,0.05)',
          borderWidth: 1, borderColor: priv.isPrivate ? C.yellow + '30' : 'rgba(255,255,255,0.08)',
          justifyContent: 'center', alignItems: 'center', alignSelf: 'center',
        }}>
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
});
