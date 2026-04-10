// AcoesScreen — Nova tab "Acoes" (Fase D).
// Hero "Pra Crescer" (usa rendaPotencialService) + 4 cards de ferramentas:
// Gerador de Renda, Simulador FII, Covered Call Sugerido, Radar Oportunidades.
//
// Layout decidido na Fase B+: "Hero 'Pra Crescer' + ferramentas".
// Densidade: BALANCEADO (padding 16, gap 12).

import React from 'react';
var useState = React.useState;
var useEffect = React.useEffect;
var useCallback = React.useCallback;
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, SIZE } from '../../theme';
import { T } from '../../theme/tokens';
import { Glass } from '../../components';
import Sensitive, { usePrivacyStyle } from '../../components/Sensitive';
import { useAuth } from '../../contexts/AuthContext';
import { computeRendaPotencial } from '../../services/rendaPotencialService';

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtInt(v) {
  return Math.round(v || 0).toLocaleString('pt-BR');
}

// ───────── Hero "Pra Crescer" ─────────
function HeroPraCrescer(props) {
  var data = props.data;
  var loading = props.loading;
  var onPress = props.onPress;
  var ps = usePrivacyStyle();

  if (loading) {
    return (
      <Glass padding={T.space.cardPad} style={{ marginBottom: T.space.gap }}>
        <View style={{ alignItems: 'center', paddingVertical: T.space.lg }}>
          <ActivityIndicator size="small" color={C.accent} />
          <Text style={{ fontSize: 11, color: T.color.textMuted, fontFamily: F.mono, marginTop: T.space.xs }}>
            Calculando potencial...
          </Text>
        </View>
      </Glass>
    );
  }

  if (!data || data.patrimonio <= 0) {
    return (
      <Glass padding={T.space.cardPad} style={{ marginBottom: T.space.gap }}>
        <Text style={{ fontSize: 13, color: T.color.textSecondary, fontFamily: F.body }}>
          Adicione ativos a sua carteira para ver o potencial de renda.
        </Text>
      </Glass>
    );
  }

  var captura = data.capturaPct || 0;
  var gap = data.gap || 0;
  var gapsCount = (data.gaps || []).length;

  return (
    <Glass padding={0} glow="rgba(34,197,94,0.18)" style={{ marginBottom: T.space.gap, borderColor: 'rgba(34,197,94,0.30)' }}>
      <View style={{ height: 3, borderTopLeftRadius: T.radius.md, borderTopRightRadius: T.radius.md, backgroundColor: T.color.income }} />
      <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
        <View style={{ padding: T.space.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: T.space.xs, marginBottom: T.space.xs }}>
            <Ionicons name="rocket-outline" size={14} color={T.color.income} />
            <Text style={[T.type.kpiLabel, { color: T.color.textMuted }]}>PRA CRESCER</Text>
          </View>

          <Sensitive>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: T.space.xs }}>
              <Text style={[{ fontSize: 14, color: T.color.income, fontFamily: F.mono, fontWeight: '700' }, ps]}>+R$ </Text>
              <Text style={[{ fontSize: 36, color: T.color.income, fontFamily: F.mono, fontWeight: '800', lineHeight: 40 }, ps]}>
                {fmtInt(gap)}
              </Text>
              <Text style={[{ fontSize: 16, color: T.color.income, fontFamily: F.mono, fontWeight: '600', opacity: 0.8 }, ps]}>/mes</Text>
            </View>
          </Sensitive>

          <Text style={{ fontSize: 12, color: T.color.textSecondary, fontFamily: F.body, marginBottom: T.space.md }}>
            {'de potencial nao capturado'}
          </Text>

          {/* Barra de captura */}
          <View style={{ marginBottom: T.space.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: T.space.xxs }}>
              <Text style={{ fontSize: 10, color: T.color.textMuted, fontFamily: F.mono }}>CAPTURA ATUAL</Text>
              <Text style={{ fontSize: 10, color: T.color.income, fontFamily: F.mono, fontWeight: '700' }}>
                {captura.toFixed(0) + '%'}
              </Text>
            </View>
            <View style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3 }}>
              <View style={{
                height: 6, borderRadius: 3,
                backgroundColor: T.color.income,
                width: Math.min(100, captura) + '%',
              }} />
            </View>
            <Sensitive>
              <Text style={[{ fontSize: 10, color: T.color.textMuted, fontFamily: F.mono, marginTop: T.space.xxs }, ps]}>
                {'R$ ' + fmt(data.rendaReal) + ' / R$ ' + fmt(data.rendaPotencial) + ' possivel'}
              </Text>
            </Sensitive>
          </View>

          {/* Tapeable — diagnosticos resumo */}
          {gapsCount > 0 ? (
            <View style={{
              backgroundColor: 'rgba(34,197,94,0.08)',
              borderRadius: T.radius.sm,
              padding: T.space.sm,
              flexDirection: 'row',
              alignItems: 'center',
              gap: T.space.xs,
            }}>
              <Ionicons name="alert-circle-outline" size={14} color={T.color.income} />
              <Text style={{ fontSize: 11, color: T.color.textPrimary, fontFamily: F.body, flex: 1 }}>
                {gapsCount + ' pontos onde otimizar'}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={T.color.textMuted} />
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    </Glass>
  );
}

// ───────── Card de ferramenta ─────────
function ToolCard(props) {
  var icon = props.icon;
  var color = props.color;
  var title = props.title;
  var subtitle = props.subtitle;
  var badge = props.badge;
  var onPress = props.onPress;

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      <Glass padding={T.space.md} style={{ marginBottom: T.space.gap }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: T.space.md }}>
          <View style={{
            width: 48, height: 48, borderRadius: T.radius.md,
            backgroundColor: color + '22',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons name={icon} size={22} color={color} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: T.space.xs, marginBottom: 2 }}>
              <Text style={{ fontSize: 15, color: T.color.textPrimary, fontFamily: F.display, fontWeight: '700' }}>
                {title}
              </Text>
              {badge ? (
                <View style={{
                  backgroundColor: color + '22',
                  paddingHorizontal: T.space.xs,
                  paddingVertical: 2,
                  borderRadius: T.radius.sm,
                }}>
                  <Text style={{ fontSize: 9, color: color, fontFamily: F.mono, fontWeight: '700' }}>{badge}</Text>
                </View>
              ) : null}
            </View>
            <Text style={{ fontSize: 11, color: T.color.textSecondary, fontFamily: F.body }}>{subtitle}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={T.color.textMuted} />
        </View>
      </Glass>
    </TouchableOpacity>
  );
}

// ───────── Tela principal ─────────
export default function AcoesScreen(props) {
  var navigation = props.navigation;
  var user = useAuth().user;

  var _potencial = useState(null); var potencial = _potencial[0]; var setPotencial = _potencial[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];

  function loadPotencial() {
    if (!user) return;
    setLoading(true);
    computeRendaPotencial(user.id)
      .then(function(res) { setPotencial(res); setLoading(false); })
      .catch(function(err) {
        console.warn('AcoesScreen potencial error:', err && err.message);
        setLoading(false);
      });
  }

  useFocusEffect(useCallback(function() { loadPotencial(); }, [user]));

  var gapsCount = potencial && potencial.gaps ? potencial.gaps.length : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: T.space.md }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: T.color.textPrimary, fontFamily: F.display }}>Acoes</Text>
      </View>

      {/* Hero "Pra Crescer" */}
      <HeroPraCrescer
        data={potencial}
        loading={loading}
        onPress={function() {
          // Por ora expande no proprio card — na Fase E abre modal ou scroll para gaps detalhados
        }}
      />

      {/* Ferramentas */}
      <Text style={[T.type.kpiLabel, { color: T.color.textMuted, marginBottom: T.space.xs, marginTop: T.space.sm }]}>
        FERRAMENTAS
      </Text>

      <ToolCard
        icon="rocket-outline"
        color={C.accent}
        title="Gerador de Renda"
        subtitle="Meta mensal → mix sugerido"
        onPress={function() { navigation.navigate('GeradorRenda'); }}
      />

      <ToolCard
        icon="business-outline"
        color={C.fiis}
        title="Simulador FII"
        subtitle="Carteira teorica + previsao mensal"
        onPress={function() { navigation.navigate('SimuladorFII'); }}
      />

      <ToolCard
        icon="sync-outline"
        color={C.opcoes}
        title="Covered Call Sugerido"
        subtitle="Acoes paradas → renda mensal de premios"
        badge={gapsCount > 0 ? 'NOVO' : null}
        onPress={function() {
          // Navega pra tab Opcoes sub-tab radar — ou no futuro tela propria
          navigation.navigate('Opcoes');
        }}
      />

      <ToolCard
        icon="search-outline"
        color={C.yellow}
        title="Radar de Oportunidades"
        subtitle="Scan de estrategias na sua carteira"
        onPress={function() {
          navigation.navigate('Opcoes');
        }}
      />

      {/* Calendario */}
      <Text style={[T.type.kpiLabel, { color: T.color.textMuted, marginBottom: T.space.xs, marginTop: T.space.md }]}>
        ACOMPANHAR
      </Text>

      <ToolCard
        icon="calendar-outline"
        color={C.green}
        title="Calendario de Renda"
        subtitle="Todos os eventos de renda, dia a dia"
        onPress={function() { navigation.navigate('CalendarioRenda'); }}
      />

      <View style={{ height: T.space.xl }} />
    </ScrollView>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.color.bg },
  content: { padding: T.space.screenPad },
});
