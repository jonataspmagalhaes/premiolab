import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { Glass, Badge } from '../../components';

const SECTIONS = [
  {
    title: 'CONFIGURAÇÕES',
    items: [
      { icon: '⚙', label: 'Taxa Selic', value: '13.25%', color: C.accent, route: 'ConfigSelic' },
      { icon: '⊕', label: 'Corretoras', value: 'Gerenciar', color: C.acoes, route: 'ConfigCorretoras' },
      { icon: '◉', label: 'Alertas', value: 'Ativados', color: '#22C55E', route: 'ConfigAlertas' },
      { icon: '🎯', label: 'Meta Mensal', value: 'Configurar', color: '#F59E0B', route: 'ConfigMeta' },
    ],
  },
  {
    title: 'OPERAÇÕES',
    items: [
      { icon: '☰', label: 'Histórico Completo', value: '', color: C.acoes },
      { icon: '↓', label: 'Exportar CSV', value: '', color: C.sub },
      { icon: '↑', label: 'Importar Operações', value: '', color: C.sub },
    ],
  },
  {
    title: 'APRENDER',
    items: [
      { icon: '▸', label: 'Tutorial Interativo', value: '17 passos', color: C.opcoes },
      { icon: '◈', label: 'Guia: Covered Call', value: '', color: C.fiis },
      { icon: '◈', label: 'Guia: Cash Secured Put', value: '', color: C.fiis },
      { icon: '◈', label: 'Guia: Wheel Strategy', value: '', color: C.fiis },
    ],
  },
  {
    title: 'APP',
    items: [
      { icon: '★', label: 'Novidades v4.0', value: 'Changelog', color: '#F59E0B' },
      { icon: '?', label: 'Feedback / Suporte', value: '', color: C.sub },
      { icon: 'ℹ', label: 'Sobre', value: 'v4.0.0', color: C.dim },
      { icon: '↪', label: 'Sair', value: '', color: C.red, action: 'logout' },
    ],
  },
];

export default function MaisScreen({ navigation }) {
  const { signOut, user } = useAuth();

  const handleItem = async (item) => {
    if (item.action === 'logout') {
      await signOut();
      return;
    }
    if (item.route) {
      navigation.navigate(item.route);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Profile card */}
      <Glass glow={C.accent} padding={14}>
        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.email?.[0]?.toUpperCase() || 'U'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>Investidor</Text>
            <Text style={styles.profileEmail}>{user?.email || ''}</Text>
          </View>
          <Badge text="PRO" color={C.accent} />
        </View>
      </Glass>

      {/* Sections */}
      {SECTIONS.map((sec, si) => (
        <View key={si}>
          <Text style={styles.sectionLabel}>{sec.title}</Text>
          <Glass padding={0}>
            {sec.items.map((item, i) => (
              <TouchableOpacity
                key={i}
                activeOpacity={0.7}
                onPress={() => handleItem(item)}
                style={[
                  styles.menuRow,
                  i > 0 && { borderTopWidth: 1, borderTopColor: C.border },
                ]}
              >
                <View style={styles.menuLeft}>
                  <Text style={[styles.menuIcon, { color: item.color }]}>{item.icon}</Text>
                  <Text style={[styles.menuLabel, item.action === 'logout' && { color: C.red }]}>
                    {item.label}
                  </Text>
                </View>
                <View style={styles.menuRight}>
                  {item.value ? (
                    <Text style={styles.menuValue}>{item.value}</Text>
                  ) : null}
                  <Text style={styles.menuChevron}>›</Text>
                </View>
              </TouchableOpacity>
            ))}
          </Glass>
        </View>
      ))}

      <View style={{ height: SIZE.tabBarHeight + 20 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: SIZE.gap },

  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: C.accent, justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '800', color: 'white', fontFamily: F.display },
  profileName: { fontSize: 14, fontWeight: '700', color: C.text, fontFamily: F.display },
  profileEmail: { fontSize: 10, color: C.sub, fontFamily: F.body },

  sectionLabel: {
    fontSize: 7, color: C.dim, fontFamily: F.mono,
    letterSpacing: 0.8, fontWeight: '600', marginBottom: 4, marginTop: 8,
  },

  menuRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12,
  },
  menuLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  menuIcon: { fontSize: 14, width: 20, textAlign: 'center' },
  menuLabel: { fontSize: 12, color: C.text, fontFamily: F.body },
  menuRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  menuValue: { fontSize: 10, color: C.dim, fontFamily: F.mono },
  menuChevron: { fontSize: 14, color: C.dim },
});
