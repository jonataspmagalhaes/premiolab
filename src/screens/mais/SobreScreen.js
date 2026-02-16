import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { C, F, SIZE } from '../../theme';
import { Glass, Badge, SectionLabel } from '../../components';

export default function SobreScreen(props) {
  var navigation = props.navigation;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={function() { navigation.goBack(); }}>
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Sobre</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Logo / App info */}
      <Glass glow={C.accent} padding={20}>
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 36 }}>◈</Text>
          <Text style={{ fontSize: 22, fontWeight: '800', color: C.text, fontFamily: F.display }}>
            PremioLab
          </Text>
          <Badge text="v4.0.0" color={C.accent} />
          <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body, textAlign: 'center', marginTop: 4 }}>
            Gestão inteligente de investimentos com foco em opções, venda coberta e geração de renda.
          </Text>
        </View>
      </Glass>

      {/* Stack */}
      <SectionLabel>TECNOLOGIAS</SectionLabel>
      <Glass padding={0}>
        {[
          { l: 'React Native', v: 'Expo SDK 54', c: C.acoes },
          { l: 'Backend', v: 'Supabase', c: C.fiis },
          { l: 'Cotações', v: 'brapi.dev API', c: C.etfs },
          { l: 'Gráficos', v: 'react-native-svg', c: C.opcoes },
          { l: 'Tema', v: 'Dark Glassmorphism', c: C.accent },
        ].map(function(item, i) {
          return (
            <View key={i} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
              <Text style={{ fontSize: 13, color: C.text, fontFamily: F.body }}>{item.l}</Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: item.c, fontFamily: F.mono }}>{item.v}</Text>
            </View>
          );
        })}
      </Glass>

      {/* Features */}
      <SectionLabel>FUNCIONALIDADES</SectionLabel>
      <Glass padding={12}>
        {[
          'Portfolio tracking com cotações em tempo real',
          'Gestão de opções com gregas (Delta, Theta, IV)',
          'Simulador Black-Scholes',
          'Renda fixa com indexadores (CDI, IPCA, Selic)',
          'Cálculo automático de IR com DARF',
          'Benchmark vs CDI',
          'Gráficos interativos touch-draggable',
          'Proventos com yield on cost',
          'Alertas configuráveis',
        ].map(function(f, i) {
          return (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: 3 }}>
              <Text style={{ fontSize: 11, color: C.accent, marginTop: 1 }}>●</Text>
              <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body, flex: 1 }}>{f}</Text>
            </View>
          );
        })}
      </Glass>

      {/* Legal */}
      <SectionLabel>AVISO LEGAL</SectionLabel>
      <Glass padding={12}>
        <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.body, lineHeight: 18 }}>
          Este aplicativo tem finalidade exclusivamente informativa e educacional. Não constitui recomendação de investimento. Rentabilidade passada não garante retornos futuros. Os cálculos de IR são estimativas e não substituem a orientação de um contador.
        </Text>
      </Glass>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: SIZE.gap },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  back: { fontSize: 28, color: C.accent, fontWeight: '300' },
  title: { fontSize: 18, fontWeight: '800', color: C.text, fontFamily: F.display },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
});
