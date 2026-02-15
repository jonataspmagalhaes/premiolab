import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getDashboard } from '../../services/database';
import { Badge } from '../../components';
import { LoadingScreen, EmptyState } from '../../components/States';
import InteractiveChart from '../../components/InteractiveChart';

var W = Dimensions.get('window').width;
var PAD = 16;

var P = {
  acao:  { label: 'Ações',  short: 'AÇ', color: '#22c55e' },
  fii:   { label: 'FIIs',   short: 'FII', color: '#a855f7' },
  opcao: { label: 'Opções', short: 'OP', color: '#0ea5e9' },
  etf:   { label: 'ETFs',   short: 'ETF', color: '#f59e0b' },
  rf:    { label: 'RF',     short: 'RF', color: '#ec4899' },
};
var PKEYS = ['acao', 'fii', 'opcao', 'etf', 'rf'];

function fmt(v) {
  if (v == null || isNaN(v)) return 'R$ 0';
  return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmt2(v) {
  if (v == null || isNaN(v)) return '0,00';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ══════════ COMPONENTS ══════════

function GlassCard({ children, style, glow, pad }) {
  return (
    <View style={[{
      backgroundColor: 'rgba(255,255,255,0.035)',
      borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
      padding: pad !== undefined ? pad : 20, marginBottom: 14,
    }, glow && {
      shadowColor: glow, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3, shadowRadius: 16, elevation: 4,
    }, style]}>
      {children}
    </View>
  );
}

function AlertRow({ type, title, desc, badge }) {
  var gc = {
    critico: ['#f59e0b', '#ef4444'],
    atencao: ['#f59e0b', '#f97316'],
    ok:      ['#22c55e', '#10b981'],
    info:    ['#0ea5e9', '#a855f7'],
  };
  var icons = { critico: '⚠', atencao: '⚡', ok: '✓', info: '◈' };
  var bc = { critico: '#ef4444', atencao: '#f59e0b', ok: '#22c55e', info: '#0ea5e9' };
  var colors = gc[type] || gc.info;
  var badgeColor = bc[type] || '#0ea5e9';

  return (
    <View style={{ marginBottom: 10, borderRadius: 16, overflow: 'hidden' }}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ padding: 1.5, borderRadius: 16 }}>
        <View style={{ backgroundColor: 'rgba(12,12,20,0.94)', borderRadius: 14.5, padding: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: desc ? 4 : 0 }}>
            <Text style={{ fontSize: 13 }}>{icons[type] || '•'}</Text>
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.9)', fontFamily: F.display }}>
              {title}
            </Text>
            {badge ? (
              <View style={{
                backgroundColor: badgeColor + '18', borderWidth: 1, borderColor: badgeColor + '40',
                borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
              }}>
                <Text style={{ fontSize: 9, fontWeight: '700', color: badgeColor, fontFamily: F.mono, letterSpacing: 0.5 }}>
                  ● {badge}
                </Text>
              </View>
            ) : null}
          </View>
          {desc ? (
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', fontFamily: F.body, lineHeight: 17, paddingLeft: 21 }}>
              {desc}
            </Text>
          ) : null}
        </View>
      </LinearGradient>
    </View>
  );
}

function QuoteRow({ ticker, tipo, qty, pm, precoAtual, changeDay, pl, onPress, last }) {
  var prod = P[tipo || 'acao'] || P.acao;
  var hasPrice = precoAtual != null;
  var isUp = changeDay > 0;
  var varColor = isUp ? '#22c55e' : changeDay < 0 ? '#ef4444' : 'rgba(255,255,255,0.4)';

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10,
        borderBottomWidth: last ? 0 : 1, borderBottomColor: 'rgba(255,255,255,0.04)',
      }}>
      <View style={{
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: prod.color + '10', borderWidth: 1, borderColor: prod.color + '22',
        justifyContent: 'center', alignItems: 'center',
      }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: prod.color, fontFamily: F.mono }}>
          {ticker ? ticker.substring(0, 2) : '??'}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff', fontFamily: F.display }}>{ticker}</Text>
        <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: F.mono, marginTop: 1 }}>
          {qty} un · PM R$ {fmt2(pm)}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {hasPrice ? (
          <>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff', fontFamily: F.mono }}>
              R$ {fmt2(precoAtual)}
            </Text>
            <Text style={{ fontSize: 10, fontWeight: '700', color: varColor, fontFamily: F.mono, marginTop: 2 }}>
              {isUp ? '▲' : changeDay < 0 ? '▼' : '–'} {Math.abs(changeDay || 0).toFixed(2)}%
            </Text>
          </>
        ) : (
          <Text style={{ fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.4)', fontFamily: F.mono }}>
            {fmt(qty * pm)}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

function CalItem({ dia, diaSemana, titulo, detalhe, tipo, last }) {
  var c = tipo === 'opcao' ? P.opcao.color : tipo === 'rf' ? P.rf.color : P.acao.color;
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10,
      borderBottomWidth: last ? 0 : 1, borderBottomColor: 'rgba(255,255,255,0.04)',
    }}>
      <View style={{
        width: 42, height: 44, borderRadius: 12,
        backgroundColor: c + '0A', borderWidth: 1, borderColor: c + '20',
        justifyContent: 'center', alignItems: 'center',
      }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: c, fontFamily: F.display, lineHeight: 18 }}>{dia}</Text>
        <Text style={{ fontSize: 8, fontWeight: '600', color: c + '80', fontFamily: F.mono, marginTop: 1, letterSpacing: 0.5 }}>{diaSemana}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.85)', fontFamily: F.display }}>{titulo}</Text>
        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: F.body, marginTop: 1 }}>{detalhe}</Text>
      </View>
      <View style={{
        width: 6, height: 6, borderRadius: 3, backgroundColor: c,
        shadowColor: c, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 4,
      }} />
    </View>
  );
}

function IncomeCard({ label, subtitle, value, color }) {
  var c = color || '#0ea5e9';
  return (
    <GlassCard pad={14} glow={c} style={{ flex: 1, marginBottom: 0 }}>
      <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono, letterSpacing: 1, textTransform: 'uppercase' }}>
        {label}
      </Text>
      {subtitle ? (
        <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.18)', fontFamily: F.body, marginTop: 1 }}>{subtitle}</Text>
      ) : null}
      <Text style={{ fontSize: 16, fontWeight: '800', color: c, fontFamily: F.display, marginTop: 6 }}>
        {fmt(value)}
      </Text>
    </GlassCard>
  );
}

function SLabel({ children, right }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <Text style={{
        fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono,
        letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: '600',
      }}>{children}</Text>
      {right || null}
    </View>
  );
}

// Stat row for Resumo
function StatRow({ label, value, sub, color, last }) {
  return (
    <View style={{
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: last ? 0 : 1, borderBottomColor: 'rgba(255,255,255,0.04)',
    }}>
      <View>
        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontFamily: F.body }}>{label}</Text>
        {sub ? (
          <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: F.mono, marginTop: 2 }}>{sub}</Text>
        ) : null}
      </View>
      <Text style={{ fontSize: 15, fontWeight: '700', color: color || '#fff', fontFamily: F.mono }}>
        {value}
      </Text>
    </View>
  );
}

// ══════════ MAIN ══════════
export default function HomeScreen({ navigation }) {
  var { user } = useAuth();
  var [data, setData] = useState(null);
  var [loading, setLoading] = useState(true);
  var [refreshing, setRefreshing] = useState(false);
  var [fabOpen, setFabOpen] = useState(false);
  var [chartTouching, setChartTouching] = useState(false);
  var [chartPeriod, setChartPeriod] = useState('ALL');

  var load = async function () {
    if (!user) return;
    var result = await getDashboard(user.id);
    setData(result);
    setLoading(false);
  };

  useFocusEffect(useCallback(function () { load(); }, [user]));

  var onRefresh = async function () {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) return <View style={st.container}><LoadingScreen /></View>;

  if (!data || data.patrimonio === 0) {
    return (
      <View style={st.container}>
        <EmptyState
          icon="◈" title="Comece sua jornada"
          description="Registre sua primeira operação para ver o dashboard completo."
          cta="Registrar operação"
          onCta={function () { navigation.navigate('AddOperacao'); }}
          color={C.accent}
        />
      </View>
    );
  }

  // ══════════ DATA ══════════
  var patrimonio = data.patrimonio || 0;
  var patrimonioAcoes = data.patrimonioAcoes || 0;
  var rfTotalAplicado = data.rfTotalAplicado || 0;
  var rfRendaMensal = data.rfRendaMensal || 0;
  var dividendosMes = data.dividendosMes || 0;
  var premiosMes = data.premiosMes || 0;
  var rendaTotalMes = data.rendaTotalMes || 0;
  var rentabilidadeMes = data.rentabilidadeMes || 0;
  var opsAtivas = data.opsAtivas || 0;
  var opsProxVenc = data.opsProxVenc || 0;
  var meta = data.meta || 6000;
  var positions = data.positions || [];
  var saldos = data.saldos || [];
  var saldoTotal = data.saldoTotal || 0;
  var rendaFixa = data.rendaFixa || [];
  var eventos = data.eventos || [];

  var metaPct = meta > 0 ? Math.min((rendaTotalMes / meta) * 100, 150) : 0;

  // Allocation
  var alloc = {};
  PKEYS.forEach(function (k) { alloc[k] = 0; });
  positions.forEach(function (p) {
    var t = p.categoria || 'acao';
    alloc[t] = (alloc[t] || 0) + (p.quantidade || 0) * (p.pm || 0);
  });
  alloc.rf = rfTotalAplicado;
  var totalAlloc = 0;
  PKEYS.forEach(function (k) { totalAlloc += alloc[k]; });
  if (totalAlloc === 0) totalAlloc = patrimonio || 1;

  // Chart data — 100% real, filtered by period
  var patrimonioHistory = data.patrimonioHistory || [];
  var PERIODS = [
    { key: '1M', label: '1M', days: 30 },
    { key: '3M', label: '3M', days: 90 },
    { key: '6M', label: '6M', days: 180 },
    { key: '1A', label: '1A', days: 365 },
    { key: 'ALL', label: 'Tudo', days: 0 },
  ];

  var filteredChartData = patrimonioHistory;
  if (chartPeriod !== 'ALL' && patrimonioHistory.length > 0) {
    var periodDef = PERIODS.find(function (p) { return p.key === chartPeriod; });
    if (periodDef && periodDef.days > 0) {
      var cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - periodDef.days);
      var cutoffStr = cutoff.toISOString().substring(0, 10);
      filteredChartData = patrimonioHistory.filter(function (pt) {
        return pt.date >= cutoffStr;
      });
    }
  }
  var hasRealChart = filteredChartData.length >= 2;

  // Top gainers / losers (need preco_atual from brapi)
  var posWithPrice = positions.filter(function (p) { return p.preco_atual != null; });
  var sorted = posWithPrice.slice().sort(function (a, b) { return (b.change_day || 0) - (a.change_day || 0); });
  var topGainers = sorted.slice(0, 5);
  var gainerTickers = {};
  topGainers.forEach(function (p) { gainerTickers[p.ticker] = true; });
  var topLosers = sorted.slice().reverse().filter(function (p) {
    return !gainerTickers[p.ticker];
  }).slice(0, 5);
  // reverse so worst is first

  // Alerts
  var alerts = [];
  if (opsProxVenc > 0) {
    alerts.push({
      type: 'critico',
      title: opsProxVenc + (opsProxVenc === 1 ? ' opção vence' : ' opções vencem') + ' em 30 dias',
      desc: 'Verifique se deseja rolar, exercer ou encerrar.',
      badge: 'CRÍTICO',
    });
  }
  if (metaPct >= 100) {
    alerts.push({ type: 'ok', title: 'Meta mensal atingida!', desc: fmt(rendaTotalMes) + ' de renda no mês.', badge: 'OK' });
  } else if (rendaTotalMes > 0 && metaPct >= 50) {
    alerts.push({ type: 'info', title: 'Meta a ' + metaPct.toFixed(0) + '%', desc: 'Faltam ' + fmt(meta - rendaTotalMes) + ' para bater a meta.', badge: 'INFO' });
  }
  if (alerts.length === 0) {
    alerts.push({ type: 'ok', title: 'Tudo em ordem', desc: 'Nenhum alerta no momento.', badge: 'OK' });
  }

  // ══════════ RENDER ══════════
  return (
    <View style={st.container}>
      <ScrollView
        contentContainerStyle={st.scroll}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!chartTouching}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} colors={[C.accent]} />}
      >
        {/* HEADER */}
        <View style={st.header}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#fff', fontFamily: F.display }}>
            Premio<Text style={{ color: '#0ea5e9' }}>Lab</Text>
          </Text>
          <View style={st.syncBadge}>
            <Text style={{ fontSize: 9, color: '#22c55e', fontWeight: '600', fontFamily: F.mono }}>
              ● SYNC {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        </View>

        {/* PATRIMÔNIO HERO */}
        <GlassCard pad={0} glow="rgba(14,165,233,0.12)">
          <LinearGradient
            colors={['#22c55e', '#0ea5e9', '#a855f7', '#f59e0b', '#ec4899']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={{ height: 3, borderTopLeftRadius: 18, borderTopRightRadius: 18 }}
          />
          <View style={{ padding: 22 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Text style={st.heroLabel}>PATRIMÔNIO TOTAL</Text>
              {rentabilidadeMes > 0 ? (
                <Text style={{ fontSize: 12, color: '#22c55e', fontFamily: F.mono, fontWeight: '600' }}>
                  +{rentabilidadeMes.toFixed(2)}% /mês
                </Text>
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 6 }}>
              <Text style={st.heroPrefix}>R$ </Text>
              <Text style={st.heroValue}>{fmt2(patrimonio).split(',')[0]}</Text>
              <Text style={st.heroCents}>,{fmt2(patrimonio).split(',')[1]}</Text>
            </View>

            {/* Breakdown: renda variável + renda fixa */}
            {rfTotalAplicado > 0 && patrimonioAcoes > 0 ? (
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono }}>
                  Renda Var. <Text style={{ color: P.acao.color }}>{fmt(patrimonioAcoes)}</Text>
                </Text>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono }}>
                  Renda Fixa <Text style={{ color: P.rf.color }}>{fmt(rfTotalAplicado)}</Text>
                </Text>
              </View>
            ) : null}

            {/* Evolução do Patrimônio — só dados reais */}
            <View style={{ marginTop: 16 }}>
              {/* Period filter pills */}
              {patrimonioHistory.length >= 2 ? (
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                  {PERIODS.map(function (p) {
                    var active = chartPeriod === p.key;
                    return (
                      <TouchableOpacity key={p.key} activeOpacity={0.7}
                        onPress={function () { setChartPeriod(p.key); }}
                        style={{
                          paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                          backgroundColor: active ? '#0ea5e9' + '20' : 'rgba(255,255,255,0.03)',
                          borderWidth: 1,
                          borderColor: active ? '#0ea5e9' + '50' : 'rgba(255,255,255,0.06)',
                        }}>
                        <Text style={{
                          fontSize: 10, fontWeight: '700', fontFamily: F.mono, letterSpacing: 0.5,
                          color: active ? '#0ea5e9' : 'rgba(255,255,255,0.3)',
                        }}>{p.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}

              {/* Chart or placeholder */}
              {hasRealChart ? (
                <View style={{ marginHorizontal: -6 }}>
                  <InteractiveChart
                    data={filteredChartData}
                    color="#0ea5e9"
                    height={100}
                    fontFamily={F.mono}
                    label="Evolução do patrimônio"
                    onTouchStateChange={setChartTouching}
                  />
                </View>
              ) : (
                <View style={{
                  height: 70, justifyContent: 'center', alignItems: 'center',
                  backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 12,
                  borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)', borderStyle: 'dashed',
                }}>
                  <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', fontFamily: F.mono, textAlign: 'center' }}>
                    {patrimonioHistory.length < 2
                      ? 'Gráfico disponível com operações em datas diferentes'
                      : 'Sem dados no período selecionado'}
                  </Text>
                </View>
              )}
            </View>

            {/* Allocation bar + legend */}
            {totalAlloc > 0 ? (
              <View style={{ marginTop: 14 }}>
                <View style={{ flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.03)' }}>
                  {PKEYS.map(function (k, i) {
                    var pct = alloc[k] / totalAlloc * 100;
                    if (pct < 0.5) return null;
                    return (
                      <View key={k} style={{
                        flex: pct, height: 6, backgroundColor: P[k].color,
                        marginRight: i < PKEYS.length - 1 ? 1 : 0,
                      }} />
                    );
                  })}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {PKEYS.map(function (k) {
                    var pct = (alloc[k] / totalAlloc * 100);
                    if (pct < 0.5) return null;
                    return (
                      <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: P[k].color }} />
                        <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: F.body }}>{P[k].short}</Text>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.6)', fontFamily: F.mono }}>{pct.toFixed(0)}%</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </View>
        </GlassCard>

        {/* RENDA DO MÊS — 3 cards */}
        <SLabel>RENDA DO MÊS</SLabel>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
          <IncomeCard
            label="PRÊMIOS" subtitle="opções"
            value={premiosMes} color={P.opcao.color}
          />
          <IncomeCard
            label="DIVIDENDOS" subtitle="proventos"
            value={dividendosMes} color={P.fii.color}
          />
          <IncomeCard
            label="RENDA FIXA" subtitle={'est. mensal'}
            value={rfRendaMensal} color={P.rf.color}
          />
        </View>

        {/* META MENSAL */}
        <GlassCard glow={metaPct >= 100 ? 'rgba(34,197,94,0.12)' : 'rgba(14,165,233,0.08)'}>
          <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono, letterSpacing: 1.5, fontWeight: '600' }}>
            META MENSAL
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: C.accent, fontFamily: F.display }}>
                  {fmt(rendaTotalMes)}
                </Text>
                <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.25)', fontFamily: F.display, marginLeft: 4 }}>
                  / {fmt(meta)}
                </Text>
              </View>
              {rendaTotalMes > 0 ? (
                <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: F.mono, marginTop: 4 }}>
                  Prêmios {fmt(premiosMes)} + Div {fmt(dividendosMes)} + RF {fmt(rfRendaMensal)}
                </Text>
              ) : null}
            </View>
            <Text style={{
              fontSize: 24, fontWeight: '800', fontFamily: F.mono,
              color: metaPct >= 100 ? '#22c55e' : metaPct >= 50 ? '#f59e0b' : C.accent,
            }}>{metaPct.toFixed(0)}%</Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.03)', marginTop: 12, overflow: 'hidden' }}>
            <LinearGradient
              colors={[C.accent, metaPct >= 100 ? '#22c55e' : '#f59e0b']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={{ height: 6, borderRadius: 3, width: Math.min(metaPct, 100) + '%' }}
            />
          </View>
          {metaPct < 100 && metaPct > 0 ? (
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: F.mono, textAlign: 'right', marginTop: 6 }}>
              Faltam {fmt(meta - rendaTotalMes)}
            </Text>
          ) : null}
        </GlassCard>

        {/* RESUMO DO PORTFÓLIO — dados reais e úteis */}
        <GlassCard>
          <SLabel>RESUMO DO PORTFÓLIO</SLabel>
          <StatRow
            label="Rentabilidade estimada"
            sub="renda mensal / patrimônio"
            value={rentabilidadeMes.toFixed(2) + '% a.m.'}
            color={rentabilidadeMes > 1 ? '#22c55e' : '#f59e0b'}
          />
          <StatRow
            label="Posições em carteira"
            sub={positions.length + ' ativos + ' + rendaFixa.length + ' títulos RF'}
            value={positions.length + rendaFixa.length}
            color="#fff"
          />
          <StatRow
            label="Opções ativas"
            sub={opsProxVenc > 0 ? opsProxVenc + ' vencem em 30 dias' : 'nenhuma vencendo'}
            value={opsAtivas}
            color={P.opcao.color}
          />
          <StatRow
            label="Saldo disponível"
            sub={saldos.length + (saldos.length === 1 ? ' corretora' : ' corretoras')}
            value={fmt(saldoTotal)}
            color={C.accent}
            last={true}
          />
        </GlassCard>

        {/* ALERTAS */}
        <SLabel right={
          <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono }}>
            {alerts.length} {alerts.length === 1 ? 'novo' : 'novos'}
          </Text>
        }>ALERTAS</SLabel>
        {alerts.map(function (a, i) {
          return <AlertRow key={i} type={a.type} title={a.title} desc={a.desc} badge={a.badge} />;
        })}

        {/* MAIORES ALTAS */}
        {topGainers.length > 0 ? (
          <GlassCard glow="rgba(34,197,94,0.06)" style={{ marginTop: 4 }}>
            <SLabel right={
              <TouchableOpacity onPress={function () { navigation.navigate('Carteira'); }}>
                <Text style={{ fontSize: 11, color: '#0ea5e9', fontWeight: '600' }}>Ver todos →</Text>
              </TouchableOpacity>
            }>MAIORES ALTAS</SLabel>
            {topGainers.map(function (p, i) {
              return (
                <QuoteRow key={i} ticker={p.ticker} tipo={p.categoria} qty={p.quantidade} pm={p.pm}
                  precoAtual={p.preco_atual} changeDay={p.change_day}
                  last={i === topGainers.length - 1}
                  onPress={function () { navigation.navigate('AssetDetail', { ticker: p.ticker }); }}
                />
              );
            })}
          </GlassCard>
        ) : null}

        {/* MAIORES BAIXAS */}
        {topLosers.length > 0 ? (
          <GlassCard glow="rgba(239,68,68,0.06)" style={{ marginTop: 4 }}>
            <SLabel>MAIORES BAIXAS</SLabel>
            {topLosers.map(function (p, i) {
              return (
                <QuoteRow key={i} ticker={p.ticker} tipo={p.categoria} qty={p.quantidade} pm={p.pm}
                  precoAtual={p.preco_atual} changeDay={p.change_day}
                  last={i === topLosers.length - 1}
                  onPress={function () { navigation.navigate('AssetDetail', { ticker: p.ticker }); }}
                />
              );
            })}
          </GlassCard>
        ) : null}

        {/* Sem cotações — fallback mostra posições por custo */}
        {posWithPrice.length === 0 && positions.length > 0 ? (
          <GlassCard glow="rgba(34,197,94,0.06)" style={{ marginTop: 4 }}>
            <SLabel right={
              <TouchableOpacity onPress={function () { navigation.navigate('Carteira'); }}>
                <Text style={{ fontSize: 11, color: '#0ea5e9', fontWeight: '600' }}>Ver todos →</Text>
              </TouchableOpacity>
            }>MEUS ATIVOS</SLabel>
            <View style={{
              paddingVertical: 8, paddingHorizontal: 4,
              backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 8, marginBottom: 8,
            }}>
              <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: F.mono, textAlign: 'center' }}>
                Cotações indisponíveis no momento · mostrando custo
              </Text>
            </View>
            {positions.slice(0, 5).map(function (p, i) {
              return (
                <QuoteRow key={i} ticker={p.ticker} tipo={p.categoria} qty={p.quantidade} pm={p.pm}
                  last={i === Math.min(positions.length, 5) - 1}
                  onPress={function () { navigation.navigate('AssetDetail', { ticker: p.ticker }); }}
                />
              );
            })}
            {positions.length > 5 ? (
              <TouchableOpacity onPress={function () { navigation.navigate('Carteira'); }} style={{ paddingTop: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#0ea5e9', fontWeight: '600' }}>+ {positions.length - 5} ativos</Text>
              </TouchableOpacity>
            ) : null}
          </GlassCard>
        ) : null}

        {/* PRÓXIMOS EVENTOS — do banco */}
        {eventos.length > 0 ? (
          <GlassCard glow="rgba(236,72,153,0.06)">
            <SLabel right={
              <Text style={{ fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.35)', fontFamily: F.mono }}>
                próximos {eventos.length}
              </Text>
            }>VENCIMENTOS</SLabel>
            {eventos.slice(0, 5).map(function (e, i) {
              return (
                <CalItem key={i} dia={e.dia} diaSemana={e.diaSemana}
                  titulo={e.titulo} detalhe={e.detalhe} tipo={e.tipo}
                  last={i === Math.min(eventos.length, 5) - 1}
                />
              );
            })}
          </GlassCard>
        ) : null}

        {/* SALDOS */}
        {saldos.length > 0 ? (
          <GlassCard>
            <SLabel>SALDO EM CONTA</SLabel>
            {saldos.map(function (sal, i) {
              return (
                <View key={i} style={[st.saldoRow, i > 0 && { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff', fontFamily: F.display }}>{sal.name}</Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.accent, fontFamily: F.mono }}>
                    R$ {fmt2(sal.saldo || 0)}
                  </Text>
                </View>
              );
            })}
          </GlassCard>
        ) : null}

        <View style={{ height: SIZE.tabBarHeight + 80 }} />
      </ScrollView>

      {/* FAB */}
      <View style={st.fabWrap}>
        {fabOpen ? (
          <View style={{ marginBottom: 12, gap: 8, alignItems: 'flex-end' }}>
            {[
              { label: '💰 Operação', color: P.acao.color, screen: 'AddOperacao' },
              { label: '⚡ Opção', color: P.opcao.color, screen: 'AddOpcao' },
              { label: '🏦 Renda Fixa', color: P.rf.color, screen: 'AddRendaFixa' },
            ].map(function (item, i) {
              return (
                <TouchableOpacity key={i} activeOpacity={0.7}
                  onPress={function () { setFabOpen(false); navigation.navigate(item.screen); }}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 16, paddingVertical: 12,
                    borderRadius: 14, borderWidth: 1,
                    borderColor: item.color + '40', backgroundColor: item.color + '10',
                  }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: item.color, fontFamily: F.display }}>{item.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
        <TouchableOpacity activeOpacity={0.8} onPress={function () { setFabOpen(!fabOpen); }}>
          <LinearGradient
            colors={fabOpen ? ['#ef4444', '#dc2626'] : ['#0ea5e9', '#a855f7']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{
              width: 56, height: 56, borderRadius: 28,
              justifyContent: 'center', alignItems: 'center',
              shadowColor: fabOpen ? '#ef4444' : '#0ea5e9',
              shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 14,
              elevation: 8,
            }}
          >
            <Text style={{ fontSize: 28, color: '#fff', fontWeight: '300', lineHeight: 30 }}>{fabOpen ? '×' : '+'}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

var st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a14' },
  scroll: { padding: PAD, paddingBottom: 0 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 10, marginBottom: 10,
  },
  syncBadge: {
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
  },
  heroLabel: {
    fontSize: 11, color: 'rgba(255,255,255,0.35)',
    letterSpacing: 1.5, fontWeight: '600', fontFamily: F.mono,
  },
  heroPrefix: {
    fontSize: 18, fontWeight: '600', color: 'rgba(255,255,255,0.6)', fontFamily: F.display,
  },
  heroValue: {
    fontSize: 32, fontWeight: '800', color: '#fff', fontFamily: F.display, letterSpacing: -1,
  },
  heroCents: {
    fontSize: 18, fontWeight: '600', color: 'rgba(255,255,255,0.3)', fontFamily: F.display,
  },
  saldoRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 12,
  },
  fabWrap: {
    position: 'absolute', bottom: SIZE.tabBarHeight + 16, right: PAD,
    alignItems: 'flex-end',
  },
});
