import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { Pill } from '../../components';
import CarteiraScreen from '../carteira/CarteiraScreen';
import CaixaView from './CaixaView';
import RelatoriosScreen from '../relatorios/RelatoriosScreen';

var SUB_TABS = [
  { k: 'carteira', l: 'Carteira', color: C.acoes },
  { k: 'caixa', l: 'Caixa', color: C.green },
  { k: 'relatorios', l: 'Relatórios', color: C.yellow },
];

export default function GestaoScreen(props) {
  var navigation = props.navigation;
  var _sub = useState('carteira'); var sub = _sub[0]; var setSub = _sub[1];

  return (
    <View style={styles.container}>
      {/* Sub-tab pills */}
      <View style={styles.pillBar}>
        {SUB_TABS.map(function(tab) {
          return (
            <Pill key={tab.k} active={sub === tab.k} color={tab.color}
              onPress={function() { setSub(tab.k); }}>
              {tab.l}
            </Pill>
          );
        })}
      </View>

      {/* Content */}
      {sub === 'carteira' ? (
        <CarteiraScreen navigation={navigation} />
      ) : sub === 'caixa' ? (
        <CaixaView navigation={navigation} />
      ) : (
        <RelatoriosScreen navigation={navigation} />
      )}
    </View>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  pillBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: SIZE.padding,
    paddingTop: 8,
    paddingBottom: 6,
  },
});
