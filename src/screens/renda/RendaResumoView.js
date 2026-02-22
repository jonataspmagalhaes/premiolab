import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { C, F, SIZE, PRODUCT_COLORS } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getDashboard } from '../../services/database';
import { Glass, InfoTip } from '../../components';
import { EmptyState } from '../../components/States';

var P = {
  acao: { color: PRODUCT_COLORS.acao || C.acoes },
  fii: { color: PRODUCT_COLORS.fii || C.fiis },
  etf: { color: PRODUCT_COLORS.etf || C.etfs },
  opcao: { color: PRODUCT_COLORS.opcao || C.opcoes },
  rf: { color: C.rf },
};

function fmt(v) {
  if (v == null || isNaN(v)) return 'R$ 0,00';
  var n = Number(v);
  var sign = n < 0 ? '-' : '';
  var abs = Math.abs(n);
  return sign + 'R$ ' + abs.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function RendaResumoView(props) {
  var navigation = props.navigation;
  var _auth = useAuth(); var user = _auth.user;

  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _refreshing = useState(false); var refreshing = _refreshing[0]; var setRefreshing = _refreshing[1];
  var _data = useState(null); var data = _data[0]; var setData = _data[1];

  var load = async function() {
    if (!user) return;
    try {
      var result = await getDashboard(user.id);
      setData(result);
    } catch (e) {
      console.warn('RendaResumo load:', e);
    }
    setLoading(false);
  };

  useFocusEffect(useCallback(function() {
    setLoading(true);
    load();
  }, [user && user.id]));

  var onRefresh = async function() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: C.sub, fontFamily: F.body }}>Carregando...</Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={{ flex: 1 }}>
        <EmptyState ionicon="cash-outline" title="Sem dados"
          description="Registre operações para ver sua renda." color={C.accent} />
      </View>
    );
  }

  // Data
  var rendaTotalMes = data.rendaTotalMes || 0;
  var rendaTotalMesAnterior = data.rendaTotalMesAnterior || 0;
  var plMes = data.plMes || 0;
  var plMedia3m = data.plMedia3m || 0;
  var dividendosMes = data.dividendosMes || 0;
  var dividendosCatMes = data.dividendosCatMes || { acao: 0, fii: 0, etf: 0 };
  var dividendosRecebidosMes = data.dividendosRecebidosMes || 0;
  var dividendosAReceberMes = data.dividendosAReceberMes || 0;
  var rfRendaMensal = data.rfRendaMensal || 0;
  var meta = data.meta || 6000;
  var rendaMediaAnual = data.rendaMediaAnual || 0;
  var rentabilidadeMes = data.rentabilidadeMes || 0;

  var metaPct = meta > 0 ? Math.min((rendaTotalMes / meta) * 100, 150) : 0;

  var rendaCompare = '';
  if (rendaTotalMesAnterior > 0) {
    var rendaChangePct = ((rendaTotalMes - rendaTotalMesAnterior) / Math.abs(rendaTotalMesAnterior)) * 100;
    rendaCompare = (rendaChangePct > 0 ? '+' : '') + rendaChangePct.toFixed(0) + '% vs ant.';
  }
  var rendaBetter = rendaTotalMes >= rendaTotalMesAnterior;

  return (
    <ScrollView
      style={st.container}
      contentContainerStyle={st.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} colors={[C.accent]} />}
    >
      {/* RENDA DO MÊS */}
      <Glass glow="rgba(108,92,231,0.10)" padding={SIZE.padding}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}>
          <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: '600' }}>RENDA DO MÊS</Text>
          <InfoTip
            title="Renda do Mês"
            text="P&L de opções (prêmios - recompras) + dividendos/JCP + juros RF no mês. Opções mostra o P&L líquido, podendo ser negativo em meses com recompra."
          />
        </View>

        {/* Total + comparação */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <Text maxFontSizeMultiplier={1.5} style={{ fontSize: 30, fontWeight: '800', color: rendaTotalMes >= 0 ? '#22c55e' : '#ef4444', fontFamily: F.display }}>
            {fmt(rendaTotalMes)}
          </Text>
          {rendaCompare ? (
            <View style={{
              backgroundColor: (rendaBetter ? '#22c55e' : '#ef4444') + '15',
              borderWidth: 1,
              borderColor: (rendaBetter ? '#22c55e' : '#ef4444') + '30',
              borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
            }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: rendaBetter ? '#22c55e' : '#ef4444', fontFamily: F.mono }}>
                {rendaCompare}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Breakdown por tipo */}
        <View style={{ gap: 8, marginBottom: 14 }}>
          <View style={st.bRow}>
            <View style={st.bLabel}>
              <View style={[st.dot, { backgroundColor: P.opcao.color }]} />
              <Text style={st.bText}>P&L Opções</Text>
            </View>
            <Text maxFontSizeMultiplier={1.5} style={[st.bVal, { color: plMes >= 0 ? '#22c55e' : '#ef4444' }]}>
              {fmt(plMes)}
            </Text>
          </View>
          <View style={st.bRow}>
            <View style={st.bLabel}>
              <View style={[st.dot, { backgroundColor: P.acao.color }]} />
              <Text style={st.bText}>Dividendos Ações</Text>
            </View>
            <Text maxFontSizeMultiplier={1.5} style={[st.bVal, { color: dividendosCatMes.acao > 0 ? '#22c55e' : C.dim }]}>
              {fmt(dividendosCatMes.acao)}
            </Text>
          </View>
          <View style={st.bRow}>
            <View style={st.bLabel}>
              <View style={[st.dot, { backgroundColor: P.fii.color }]} />
              <Text style={st.bText}>Rendimentos FIIs</Text>
            </View>
            <Text maxFontSizeMultiplier={1.5} style={[st.bVal, { color: dividendosCatMes.fii > 0 ? '#22c55e' : C.dim }]}>
              {fmt(dividendosCatMes.fii)}
            </Text>
          </View>
          {dividendosCatMes.etf > 0 ? (
            <View style={st.bRow}>
              <View style={st.bLabel}>
                <View style={[st.dot, { backgroundColor: P.etf.color }]} />
                <Text style={st.bText}>Dividendos ETFs</Text>
              </View>
              <Text maxFontSizeMultiplier={1.5} style={[st.bVal, { color: '#22c55e' }]}>
                {fmt(dividendosCatMes.etf)}
              </Text>
            </View>
          ) : null}
          <View style={st.bRow}>
            <View style={st.bLabel}>
              <View style={[st.dot, { backgroundColor: C.rf }]} />
              <Text style={st.bText}>Renda Fixa</Text>
            </View>
            <Text maxFontSizeMultiplier={1.5} style={[st.bVal, { color: rfRendaMensal > 0 ? '#22c55e' : C.dim }]}>
              {fmt(rfRendaMensal)}
            </Text>
          </View>
        </View>

        {/* Divider */}
        <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: 14 }} />

        {/* META MENSAL */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono, letterSpacing: 1.2, fontWeight: '600', marginBottom: 6 }}>
              META MENSAL
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: C.accent, fontFamily: F.display }}>
                {fmt(rendaTotalMes)}
              </Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', fontFamily: F.display, marginLeft: 4 }}>
                / {fmt(meta)}
              </Text>
            </View>
            {(plMes !== 0 || dividendosMes > 0 || rfRendaMensal > 0) ? (
              <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: F.mono, marginTop: 3 }}>
                {'P&L Opções ' + fmt(plMes) + ' + Div ' + fmt(dividendosMes) + ' + RF ' + fmt(rfRendaMensal)}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
              <Text maxFontSizeMultiplier={1.5} style={{ fontSize: 14, color: rendaMediaAnual >= meta ? '#22c55e' : 'rgba(255,255,255,0.45)', fontFamily: F.mono, fontWeight: '700' }}>
                {'Média ' + new Date().getFullYear() + ': ' + fmt(rendaMediaAnual) + '/mês'}
              </Text>
              <InfoTip
                title="Média Anual"
                text="Média calculada com base nos meses completos do ano. O mês atual (incompleto) não entra no denominador para não distorcer o resultado."
              />
            </View>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{
              fontSize: 26, fontWeight: '800', fontFamily: F.mono,
              color: metaPct >= 100 ? '#22c55e' : metaPct >= 50 ? '#f59e0b' : C.accent,
            }}>{metaPct.toFixed(0) + '%'}</Text>
            <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: F.mono, letterSpacing: 0.5, marginTop: 2 }}>DA META</Text>
          </View>
        </View>
        <View style={{ height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.03)', marginTop: 10, overflow: 'hidden' }}>
          <LinearGradient
            colors={[C.accent, metaPct >= 100 ? '#22c55e' : '#f59e0b']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={{ height: 5, borderRadius: 3, width: Math.min(metaPct, 100) + '%' }}
          />
        </View>
        {metaPct < 100 && metaPct > 0 ? (
          <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', fontFamily: F.mono, textAlign: 'right', marginTop: 5 }}>
            {'Faltam ' + fmt(meta - rendaTotalMes)}
          </Text>
        ) : null}
      </Glass>

      {/* DIVIDENDOS DO MÊS */}
      {(dividendosRecebidosMes > 0 || dividendosAReceberMes > 0) ? (
        <Glass padding={SIZE.padding}>
          <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono, letterSpacing: 1.5, fontWeight: '600', marginBottom: 12 }}>
            DIVIDENDOS DO MÊS
          </Text>
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.mono, marginBottom: 4 }}>RECEBIDOS</Text>
              <Text maxFontSizeMultiplier={1.5} style={{ fontSize: 18, fontWeight: '800', color: '#22c55e', fontFamily: F.mono }}>
                {fmt(dividendosRecebidosMes)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.mono, marginBottom: 4 }}>A RECEBER</Text>
              <Text maxFontSizeMultiplier={1.5} style={{ fontSize: 18, fontWeight: '800', color: C.yellow, fontFamily: F.mono }}>
                {fmt(dividendosAReceberMes)}
              </Text>
            </View>
          </View>
        </Glass>
      ) : null}

      {/* KPIs */}
      <Glass padding={SIZE.padding}>
        <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono, letterSpacing: 1.5, fontWeight: '600', marginBottom: 12 }}>
          RESUMO
        </Text>
        <View style={{ flexDirection: 'row', gap: 14 }}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.mono, marginBottom: 4 }}>P&L MÉDIA 3M</Text>
            <Text maxFontSizeMultiplier={1.5} style={{ fontSize: 16, fontWeight: '800', color: plMedia3m >= 0 ? '#22c55e' : '#ef4444', fontFamily: F.mono }}>
              {fmt(plMedia3m)}
            </Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.mono, marginBottom: 4 }}>RENT. MÊS</Text>
            <Text maxFontSizeMultiplier={1.5} style={{ fontSize: 16, fontWeight: '800', color: rentabilidadeMes >= 0 ? '#22c55e' : '#ef4444', fontFamily: F.mono }}>
              {(rentabilidadeMes >= 0 ? '+' : '') + rentabilidadeMes.toFixed(2) + '%'}
            </Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.mono, marginBottom: 4 }}>MÉDIA ANUAL</Text>
            <Text maxFontSizeMultiplier={1.5} style={{ fontSize: 16, fontWeight: '800', color: rendaMediaAnual > 0 ? '#22c55e' : C.dim, fontFamily: F.mono }}>
              {fmt(rendaMediaAnual)}
            </Text>
          </View>
        </View>
      </Glass>

      <View style={{ height: SIZE.tabBarHeight + 20 }} />
    </ScrollView>
  );
}

var st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: SIZE.padding, gap: SIZE.gap },
  bRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  bText: { fontSize: 12, color: C.sub, fontFamily: F.body },
  bVal: { fontSize: 13, fontWeight: '700', fontFamily: F.mono },
});
