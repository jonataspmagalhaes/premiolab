import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { C, SIZE } from '../../theme';
import { Pill } from '../../components';
import CarteiraScreen from '../carteira/CarteiraScreen';
import CaixaView from './CaixaView';
import FinancasView from './FinancasView';

var SUB_TABS = [
  { k: 'ativos', l: 'Ativos', color: C.acoes },
  { k: 'caixa', l: 'Caixa', color: C.green },
  { k: 'financas', l: 'Finanças', color: C.etfs },
];

export default function GestaoScreen(props) {
  var navigation = props.navigation;
  var _sub = useState('ativos'); var sub = _sub[0]; var setSub = _sub[1];

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
      {sub === 'financas' ? (
        <FinancasView navigation={navigation} />
      ) : sub === 'caixa' ? (
        <CaixaView navigation={navigation} />
      ) : (
        <CarteiraScreen navigation={navigation} />
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
