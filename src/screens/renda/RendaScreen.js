import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { C, SIZE } from '../../theme';
import { Pill } from '../../components';
import RendaResumoView from './RendaResumoView';
import ProventosScreen from '../proventos/ProventosScreen';
import RelatoriosScreen from '../relatorios/RelatoriosScreen';

var SUB_TABS = [
  { k: 'resumo', l: 'Resumo', color: C.green },
  { k: 'proventos', l: 'Proventos', color: C.fiis },
  { k: 'relatorios', l: 'Relatórios', color: C.yellow },
];

export default function RendaScreen(props) {
  var navigation = props.navigation;
  var _sub = useState('resumo'); var sub = _sub[0]; var setSub = _sub[1];

  return (
    <View style={styles.container}>
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
      {sub === 'resumo' ? (
        <RendaResumoView navigation={navigation} />
      ) : sub === 'proventos' ? (
        <ProventosScreen navigation={navigation} embedded={true} />
      ) : (
        <RelatoriosScreen navigation={navigation} embedded={true} />
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
