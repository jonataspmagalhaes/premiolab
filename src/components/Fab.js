// ═══════════════════════════════════════════════════════════
// FAB — Floating Action Button com menu de ações
// Reutilizado em Home, Carteira, Opções, Renda
// ═══════════════════════════════════════════════════════════

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { C, F, SIZE } from '../theme';

var ITEMS = [
  { label: 'Operação', icon: 'wallet-outline', color: C.acoes, screen: 'AddOperacao' },
  { label: 'Opção', icon: 'flash-outline', color: C.opcoes, screen: 'AddOpcao' },
  { label: 'Provento', icon: 'cash-outline', color: C.fiis, screen: 'AddProvento' },
  { label: 'Renda Fixa', icon: 'document-text-outline', color: C.rf, screen: 'AddRendaFixa' },
];

export default function Fab(props) {
  var navigation = props.navigation;
  var _open = useState(false);
  var open = _open[0];
  var setOpen = _open[1];

  return (
    <View style={styles.wrap}>
      {open ? (
        <View style={{ marginBottom: 12, gap: 8, alignItems: 'flex-end' }}>
          {ITEMS.map(function(item, i) {
            return (
              <TouchableOpacity key={i} activeOpacity={0.7}
                onPress={function() { setOpen(false); navigation.navigate(item.screen); }}
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
    </View>
  );
}

var styles = StyleSheet.create({
  wrap: {
    position: 'absolute', bottom: SIZE.tabBarHeight + 16, right: 18,
    alignItems: 'flex-end', zIndex: 10,
  },
});
