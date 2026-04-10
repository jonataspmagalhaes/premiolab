// RendaHomeScreen — Tela principal (Fase E).
// Substitui HomeScreen. Narrativa unica focada em renda mensal.
//
// Layout (decidido na Fase B+):
//   1. Split hero (patrimonio + renda lado a lado) + chart + meta
//   2. "Esta Semana" — alertas + proximos 7 dias
//   3. "Como Crescer" — potencial + gaps + snowball
//   4. "Breakdown 12m" — bars mensais + fontes
//
// Consome AppStoreContext: zero fetches diretos, tudo via hooks.
// Usa tokens (T) e densidade balanceada.

import React from 'react';
var useState = React.useState;
var useEffect = React.useEffect;
var useCallback = React.useCallback;
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Rect, Path, Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { C, F } from '../../theme';
import { T } from '../../theme/tokens';
import { Glass } from '../../components';
import Sensitive, { usePrivacyStyle } from '../../components/Sensitive';
import SnowballCard from '../../components/SnowballCard';
import { useAuth } from '../../contexts/AuthContext';
import {
  useAppStore, useIncome, useCarteira, useFinancas, useRefresh,
} from '../../contexts/AppStoreContext';
import { computeRendaPotencial } from '../../services/rendaPotencialService';

var W = Dimensions.get('window').width;

// ─────────── Helpers ───────────

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtInt(v) {
  return Math.round(v || 0).toLocaleString('pt-BR');
}
function fmtPct(v, d) {
  return (v || 0).toFixed(d != null ? d : 1) + '%';
}

function parseDateSafe(s) {
  if (!s) return null;
  var d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d;
}

function computePatrimonio(positions, rf, saldos) {
  var total = 0;
  for (var i = 0; i < positions.length; i++) {
    var p = positions[i];
    var price = p.preco_atual || p.pm || 0;
    total += (p.quantidade || 0) * price;
  }
  for (var j = 0; j < rf.length; j++) {
    total += rf[j].valor_aplicado || 0;
  }
  for (var k = 0; k < saldos.length; k++) {
    if ((saldos[k].moeda || 'BRL') === 'BRL') {
      total += saldos[k].saldo || 0;
    }
  }
  return total;
}

function computeProximos7Dias(proventos, opcoes) {
  var eventos = [];
  var now = new Date();
  var limite = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

  for (var i = 0; i < proventos.length; i++) {
    var p = proventos[i];
    var pd = parseDateSafe(p.data_pagamento);
    if (!pd || pd < now || pd > limite) continue;
    var v = p.valor_total || ((p.valor_por_cota || 0) * (p.quantidade || 0));
    if (v <= 0) continue;
    eventos.push({
      data: pd,
      tipo: 'provento',
      ticker: (p.ticker || '').toUpperCase(),
      valor: v,
    });
  }

  for (var j = 0; j < opcoes.length; j++) {
    var o = opcoes[j];
    if (o.status !== 'ativa') continue;
    if ((o.direcao || 'venda') === 'compra') continue;
    var venc = parseDateSafe(o.vencimento);
    if (!venc || venc < now || venc > limite) continue;
    var premio = (o.premio || 0) * (o.qty || 0);
    if (premio <= 0) continue;
    eventos.push({
      data: venc,
      tipo: 'opcao',
      ticker: o.ticker_opcao,
      valor: premio,
    });
  }

  eventos.sort(function(a, b) { return a.data - b.data; });
  return eventos;
}

var MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
var DIAS_SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

// ─────────── Mini Sparkline ───────────
function Sparkline(props) {
  var data = props.data || [];
  var width = props.width || 180;
  var height = props.height || 36;
  var color = props.color || T.color.income;
  if (data.length < 2) return null;
  var maxVal = data[0]; var minVal = data[0];
  for (var i = 1; i < data.length; i++) {
    if (data[i] > maxVal) maxVal = data[i];
    if (data[i] < minVal) minVal = data[i];
  }
  var range = maxVal - minVal;
  if (range <= 0) range = 1;
  var padY = 4;
  var pathD = '';
  for (var j = 0; j < data.length; j++) {
    var x = (j / (data.length - 1)) * width;
    var y = padY + (1 - (data[j] - minVal) / range) * (height - padY * 2);
    pathD += (j === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
  }
  var areaD = pathD + ' L' + width + ',' + height + ' L0,' + height + ' Z';
  return (
    <Svg width={width} height={height}>
      <Path d={areaD} fill={color + '22'} />
      <Path d={pathD} stroke={color} strokeWidth={2} fill="none" />
    </Svg>
  );
}

// ─────────── Bars 12m ───────────
function Bars12m(props) {
  var data = props.data || [];
  var width = props.width || (W - T.space.screenPad * 2 - T.space.cardPad * 2);
  var height = props.height || 80;
  if (data.length === 0) return null;
  var maxV = 0;
  for (var i = 0; i < data.length; i++) if (data[i].total > maxV) maxV = data[i].total;
  if (maxV <= 0) maxV = 1;
  var bw = Math.floor(width / data.length) - 3;
  var now = new Date();

  return (
    <Svg width={width} height={height}>
      {data.map(function(d, idx) {
        var bh = (d.total / maxV) * (height - 16);
        if (bh < 1 && d.total > 0) bh = 2;
        var isCurrent = d.mes === now.getMonth() && d.year === now.getFullYear();
        return (
          <Rect
            key={idx}
            x={idx * (bw + 3)}
            y={height - bh - 14}
            width={bw}
            height={bh}
            rx={2}
            fill={isCurrent ? T.color.income : T.color.accent}
            opacity={isCurrent ? 1 : 0.7}
          />
        );
      })}
    </Svg>
  );
}

// ═══════════════════════════════════════════════════════════
// SECTION 1: SPLIT HERO
// ═══════════════════════════════════════════════════════════
function SplitHeroSection(props) {
  var patrimonio = props.patrimonio || 0;
  var rendaMedia = props.rendaMedia || 0;
  var meta = props.meta || 0;
  var forecast = props.forecast;
  var ps = usePrivacyStyle();

  var deltaMes = (forecast && forecast.summary && forecast.summary.deltaMes) || 0;
  var deltaColor = deltaMes > 0 ? T.color.income : deltaMes < 0 ? T.color.danger : T.color.textMuted;
  var deltaIcon = deltaMes > 0 ? 'trending-up' : deltaMes < 0 ? 'trending-down' : 'remove';

  var historyMonthly = (forecast && forecast.historyMonthly) || [];
  var sparkData = historyMonthly.map(function(h) { return h.total; });

  var pctMeta = meta > 0 ? Math.min(100, (rendaMedia / meta) * 100) : 0;

  return (
    <Glass padding={0} glow="rgba(34,197,94,0.18)" style={{ marginBottom: T.space.gap, borderColor: 'rgba(34,197,94,0.25)' }}>
      <View style={{ height: 3, borderTopLeftRadius: T.radius.md, borderTopRightRadius: T.radius.md, backgroundColor: T.color.income }} />
      <View style={{ padding: T.space.lg }}>

        {/* Split KPIs */}
        <View style={{ flexDirection: 'row', gap: T.space.md, marginBottom: T.space.md }}>
          {/* Patrimonio */}
          <View style={{ flex: 1, borderRightWidth: 1, borderRightColor: T.color.border, paddingRight: T.space.md }}>
            <Text style={[T.type.kpiLabel, { color: T.color.textMuted, marginBottom: T.space.xxs }]}>PATRIMONIO</Text>
            <Sensitive>
              <Text style={[{ fontSize: 20, fontWeight: '800', color: T.color.textPrimary, fontFamily: F.mono }, ps]}>
                {'R$ ' + fmtInt(patrimonio)}
              </Text>
            </Sensitive>
          </View>
          {/* Renda */}
          <View style={{ flex: 1, paddingLeft: T.space.xs }}>
            <Text style={[T.type.kpiLabel, { color: T.color.textMuted, marginBottom: T.space.xxs }]}>RENDA/MES</Text>
            <Sensitive>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text style={[{ fontSize: 20, fontWeight: '800', color: T.color.income, fontFamily: F.mono }, ps]}>
                  {'R$ ' + fmtInt(rendaMedia)}
                </Text>
              </View>
            </Sensitive>
            {deltaMes !== 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 }}>
                <Ionicons name={deltaIcon} size={10} color={deltaColor} />
                <Text style={{ fontSize: 10, color: deltaColor, fontFamily: F.mono, fontWeight: '700' }}>
                  {(deltaMes >= 0 ? '+' : '') + deltaMes.toFixed(1) + '%'}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Sparkline historico renda */}
        {sparkData.length >= 2 ? (
          <View style={{ marginBottom: T.space.md }}>
            <Text style={[T.type.kpiLabel, { color: T.color.textMuted, marginBottom: T.space.xxs }]}>
              RENDA ULTIMOS 12M
            </Text>
            <Sparkline data={sparkData} width={W - T.space.screenPad * 2 - T.space.lg * 2} height={40} />
          </View>
        ) : null}

        {/* Meta bar */}
        {meta > 0 ? (
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: T.space.xxs }}>
              <Text style={[T.type.kpiLabel, { color: T.color.textMuted }]}>META MENSAL</Text>
              <Sensitive>
                <Text style={[{ fontSize: 11, color: pctMeta >= 100 ? T.color.income : T.color.accent, fontFamily: F.mono, fontWeight: '700' }, ps]}>
                  {fmtPct(pctMeta, 0) + ' de R$ ' + fmtInt(meta)}
                </Text>
              </Sensitive>
            </View>
            <View style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3 }}>
              <View style={{
                height: 6, borderRadius: 3,
                backgroundColor: pctMeta >= 100 ? T.color.income : T.color.accent,
                width: Math.min(100, pctMeta) + '%',
              }} />
            </View>
          </View>
        ) : null}
      </View>
    </Glass>
  );
}

// ═══════════════════════════════════════════════════════════
// SECTION 2: ESTA SEMANA
// ═══════════════════════════════════════════════════════════
function EstaSemanaSection(props) {
  var alerts = props.alerts || [];
  var eventos = props.eventos || [];
  var navigation = props.navigation;
  var ps = usePrivacyStyle();

  if (alerts.length === 0 && eventos.length === 0) return null;

  var alertsTop = alerts.slice(0, 2);
  var eventosTop = eventos.slice(0, 3);

  return (
    <Glass padding={T.space.cardPad} style={{ marginBottom: T.space.gap }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: T.space.xs, marginBottom: T.space.sm }}>
        <Text style={{ fontSize: 14 }}>📅</Text>
        <Text style={{ fontSize: 13, color: T.color.textPrimary, fontFamily: F.display, fontWeight: '700' }}>
          Esta Semana
        </Text>
      </View>

      {/* Alertas */}
      {alertsTop.map(function(a, idx) {
        var sevColor = a.severidade === 'alta' ? T.color.danger : a.severidade === 'media' ? T.color.warning : T.color.info;
        return (
          <View key={'alert' + idx} style={{
            flexDirection: 'row', alignItems: 'center',
            gap: T.space.xs, paddingVertical: T.space.xs,
            borderBottomWidth: 1, borderBottomColor: T.color.border,
          }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: sevColor }} />
            <Text style={{ flex: 1, fontSize: 12, color: T.color.textPrimary, fontFamily: F.body }} numberOfLines={1}>
              {a.titulo}
            </Text>
          </View>
        );
      })}

      {/* Proximos eventos */}
      {eventosTop.map(function(e, idx) {
        var diaSemIdx = e.data.getDay();
        var diaNome = DIAS_SEM[diaSemIdx] + ' ' + e.data.getDate();
        var icon = e.tipo === 'opcao' ? '📋' : '💰';
        return (
          <View key={'ev' + idx} style={{
            flexDirection: 'row', alignItems: 'center',
            gap: T.space.xs, paddingVertical: T.space.xs,
            borderBottomWidth: idx < eventosTop.length - 1 ? 1 : 0,
            borderBottomColor: T.color.border,
          }}>
            <Text style={{ fontSize: 12 }}>{icon}</Text>
            <Text style={{ fontSize: 11, color: T.color.textMuted, fontFamily: F.mono, width: 60 }}>
              {diaNome}
            </Text>
            <Text style={{ flex: 1, fontSize: 12, color: T.color.textPrimary, fontFamily: F.mono, fontWeight: '600' }}>
              {e.ticker}
            </Text>
            <Sensitive>
              <Text style={[{ fontSize: 12, color: T.color.income, fontFamily: F.mono, fontWeight: '700' }, ps]}>
                {'+R$ ' + fmt(e.valor)}
              </Text>
            </Sensitive>
          </View>
        );
      })}

      {/* Link calendario */}
      <TouchableOpacity
        onPress={function() { navigation.navigate('CalendarioRenda'); }}
        activeOpacity={0.7}
        style={{
          marginTop: T.space.sm,
          paddingVertical: T.space.xs,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: T.space.xxs,
        }}
      >
        <Text style={{ fontSize: 11, color: T.color.accent, fontFamily: F.body, fontWeight: '600' }}>
          Ver calendario completo
        </Text>
        <Ionicons name="chevron-forward" size={12} color={T.color.accent} />
      </TouchableOpacity>
    </Glass>
  );
}

// ═══════════════════════════════════════════════════════════
// SECTION 3: COMO CRESCER
// ═══════════════════════════════════════════════════════════
function ComoCrescerSection(props) {
  var potencial = props.potencial;
  var rendaAtual = props.rendaAtual;
  var navigation = props.navigation;
  var userId = props.userId;
  var ps = usePrivacyStyle();

  if (!potencial) return null;

  var captura = potencial.capturaPct || 0;
  var gap = potencial.gap || 0;
  var gaps = potencial.gaps || [];
  var topGaps = gaps.slice(0, 3);

  return (
    <Glass padding={T.space.cardPad} glow="rgba(34,197,94,0.12)" style={{ marginBottom: T.space.gap, borderColor: 'rgba(34,197,94,0.22)' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: T.space.xs, marginBottom: T.space.sm }}>
        <Text style={{ fontSize: 14 }}>🚀</Text>
        <Text style={{ fontSize: 13, color: T.color.textPrimary, fontFamily: F.display, fontWeight: '700' }}>
          Como Crescer
        </Text>
      </View>

      {/* Hero potencial */}
      {gap > 0 ? (
        <View style={{
          backgroundColor: T.color.incomeBg,
          borderRadius: T.radius.sm,
          padding: T.space.sm,
          marginBottom: T.space.sm,
        }}>
          <Sensitive>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 2 }}>
              <Text style={[{ fontSize: 11, color: T.color.income, fontFamily: F.mono, fontWeight: '700' }, ps]}>+R$ </Text>
              <Text style={[{ fontSize: 24, color: T.color.income, fontFamily: F.mono, fontWeight: '800', lineHeight: 28 }, ps]}>
                {fmtInt(gap)}
              </Text>
              <Text style={[{ fontSize: 12, color: T.color.income, fontFamily: F.mono, fontWeight: '600' }, ps]}>/mes</Text>
            </View>
          </Sensitive>
          <Text style={{ fontSize: 11, color: T.color.textSecondary, fontFamily: F.body, marginBottom: T.space.xs }}>
            {'de potencial nao capturado  ·  voce captura ' + captura.toFixed(0) + '%'}
          </Text>
          <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
            <View style={{
              height: 4, borderRadius: 2, backgroundColor: T.color.income,
              width: Math.min(100, captura) + '%',
            }} />
          </View>
        </View>
      ) : null}

      {/* Gaps — onde esta travado */}
      {topGaps.length > 0 ? (
        <View style={{ marginBottom: T.space.sm }}>
          {topGaps.map(function(g, idx) {
            return (
              <TouchableOpacity
                key={'gap' + idx}
                activeOpacity={0.7}
                onPress={function() { if (g.rota) navigation.navigate(g.rota); }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: T.space.xs,
                  borderBottomWidth: idx < topGaps.length - 1 ? 1 : 0,
                  borderBottomColor: T.color.border,
                }}
              >
                <View style={{
                  width: 28, height: 28, borderRadius: 14,
                  backgroundColor: T.color.incomeBgStrong,
                  alignItems: 'center', justifyContent: 'center',
                  marginRight: T.space.sm,
                }}>
                  <Text style={{ fontSize: 11, color: T.color.income, fontFamily: F.mono, fontWeight: '800' }}>
                    {idx + 1}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: T.color.textPrimary, fontFamily: F.body, fontWeight: '600' }} numberOfLines={1}>
                    {g.titulo}
                  </Text>
                  <Sensitive>
                    <Text style={[{ fontSize: 10, color: T.color.textMuted, fontFamily: F.mono }, ps]} numberOfLines={1}>
                      {'+R$ ' + fmt(g.ganhoMensal) + '/mes  ·  ' + g.acao}
                    </Text>
                  </Sensitive>
                </View>
                <Ionicons name="chevron-forward" size={14} color={T.color.textMuted} />
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {/* Link pra tela Acoes */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={function() { navigation.navigate('Acoes'); }}
        style={{
          backgroundColor: T.color.incomeBgStrong,
          paddingVertical: T.space.sm,
          borderRadius: T.radius.sm,
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'center',
          gap: T.space.xxs,
        }}
      >
        <Text style={{ fontSize: 12, color: T.color.income, fontFamily: F.display, fontWeight: '700' }}>
          Abrir ferramentas de crescimento
        </Text>
        <Ionicons name="chevron-forward" size={14} color={T.color.income} />
      </TouchableOpacity>

      {/* Snowball inline */}
      <View style={{ marginTop: T.space.sm }}>
        <SnowballCard userId={userId} rendaAtual={rendaAtual} />
      </View>
    </Glass>
  );
}

// ═══════════════════════════════════════════════════════════
// SECTION 4: BREAKDOWN 12M
// ═══════════════════════════════════════════════════════════
function BreakdownSection(props) {
  var forecast = props.forecast;
  var ps = usePrivacyStyle();

  if (!forecast || !forecast.monthly) return null;

  var monthly = forecast.monthly;
  var bySource = forecast.bySource || {};
  var summary = forecast.summary || {};
  var mediaProj = summary.mediaProjetada || 0;

  var fontes = [
    { k: 'fii', label: 'FIIs', color: T.color.fii, val: bySource.fii || 0 },
    { k: 'acao', label: 'Acoes/ETFs', color: T.color.acao, val: bySource.acao || 0 },
    { k: 'opcao', label: 'Opcoes', color: T.color.opcao, val: bySource.opcao || 0 },
    { k: 'rf', label: 'Renda Fixa', color: T.color.rf, val: bySource.rf || 0 },
  ];

  return (
    <Glass padding={T.space.cardPad} style={{ marginBottom: T.space.gap }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: T.space.xs, marginBottom: T.space.sm }}>
        <Text style={{ fontSize: 14 }}>📊</Text>
        <Text style={{ fontSize: 13, color: T.color.textPrimary, fontFamily: F.display, fontWeight: '700' }}>
          Projecao 12 meses
        </Text>
      </View>

      {/* Bars 12m */}
      <Bars12m data={monthly} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: T.space.sm }}>
        <Text style={{ fontSize: 9, color: T.color.textMuted, fontFamily: F.mono }}>
          {monthly[0] ? MESES[monthly[0].mes] : ''}
        </Text>
        <Text style={{ fontSize: 9, color: T.color.textMuted, fontFamily: F.mono }}>
          {monthly.length > 0 ? MESES[monthly[monthly.length - 1].mes] : ''}
        </Text>
      </View>

      {/* Breakdown por fonte */}
      <View style={{ borderTopWidth: 1, borderTopColor: T.color.border, paddingTop: T.space.sm }}>
        <Text style={[T.type.kpiLabel, { color: T.color.textMuted, marginBottom: T.space.xs }]}>
          POR FONTE (media/mes)
        </Text>
        {fontes.map(function(src) {
          var pct = mediaProj > 0 ? (src.val / mediaProj) * 100 : 0;
          return (
            <View key={src.k} style={{ marginBottom: T.space.xs }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: T.space.xxs }}>
                  <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: src.color }} />
                  <Text style={{ fontSize: 11, color: T.color.textPrimary, fontFamily: F.body }}>{src.label}</Text>
                </View>
                <Sensitive>
                  <Text style={[{ fontSize: 11, color: T.color.textPrimary, fontFamily: F.mono, fontWeight: '600' }, ps]}>
                    {'R$ ' + fmt(src.val) + '  ·  ' + pct.toFixed(0) + '%'}
                  </Text>
                </Sensitive>
              </View>
              <View style={{ height: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
                <View style={{ height: 3, borderRadius: 2, backgroundColor: src.color, width: Math.min(100, pct) + '%' }} />
              </View>
            </View>
          );
        })}
      </View>
    </Glass>
  );
}

// ═══════════════════════════════════════════════════════════
// TELA PRINCIPAL
// ═══════════════════════════════════════════════════════════
export default function RendaHomeScreen(props) {
  var navigation = props.navigation;
  var auth = useAuth();
  var user = auth.user;

  var income = useIncome();
  var carteira = useCarteira();
  var financas = useFinancas();
  var store = useAppStore();
  var refresh = useRefresh();

  var forecast = income.forecast;
  var alerts = income.alerts;
  var positions = carteira.positions;
  var rf = carteira.rf;
  var opcoes = carteira.opcoes;
  var saldos = financas.saldos;
  var profile = store.profile;

  var _refreshing = useState(false); var refreshing = _refreshing[0]; var setRefreshing = _refreshing[1];
  var _potencial = useState(null); var potencial = _potencial[0]; var setPotencial = _potencial[1];
  var _proventosList = useState([]); var proventosList = _proventosList[0]; var setProventosList = _proventosList[1];

  // Carregar rendaPotencial quando user muda/foco
  useFocusEffect(useCallback(function() {
    if (!user) return;
    computeRendaPotencial(user.id)
      .then(function(res) { setPotencial(res); })
      .catch(function(err) { console.warn('potencial error:', err && err.message); });
    // Proventos pra proximos 7 dias (puxa direto do store)
    setProventosList(store.proventos || []);
  }, [user, store.proventos]));

  function onRefresh() {
    setRefreshing(true);
    refresh().then(function() {
      if (user) {
        return computeRendaPotencial(user.id).then(function(res) { setPotencial(res); });
      }
    }).catch(function() {}).then(function() {
      setRefreshing(false);
    });
  }

  // Derivados
  var patrimonio = computePatrimonio(positions, rf, saldos);
  var rendaMedia = (forecast && forecast.summary && forecast.summary.mediaProjetada) || 0;
  var meta = (profile && profile.meta_mensal) || 0;
  var eventos7d = computeProximos7Dias(proventosList, opcoes);

  var loadingInicial = income.loading && !forecast;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.color.accent} />
      }
    >
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: T.space.md,
      }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: T.color.textPrimary, fontFamily: F.display }}>
          Renda
        </Text>
        <TouchableOpacity
          onPress={function() { navigation.navigate('Mais'); }}
          style={{
            width: 36, height: 36, borderRadius: 18,
            backgroundColor: T.color.surface1,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Ionicons name="person-outline" size={18} color={T.color.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Loading inicial */}
      {loadingInicial ? (
        <View style={{ paddingVertical: T.space.xxl, alignItems: 'center' }}>
          <ActivityIndicator size="large" color={T.color.accent} />
          <Text style={{ fontSize: 12, color: T.color.textMuted, fontFamily: F.mono, marginTop: T.space.sm }}>
            Calculando sua renda...
          </Text>
        </View>
      ) : (
        <View>
          {/* 1. Split Hero */}
          <SplitHeroSection
            patrimonio={patrimonio}
            rendaMedia={rendaMedia}
            meta={meta}
            forecast={forecast}
          />

          {/* 2. Esta Semana */}
          <EstaSemanaSection
            alerts={alerts}
            eventos={eventos7d}
            navigation={navigation}
          />

          {/* 3. Como Crescer */}
          <ComoCrescerSection
            potencial={potencial}
            rendaAtual={rendaMedia}
            userId={user && user.id}
            navigation={navigation}
          />

          {/* 4. Breakdown 12m */}
          <BreakdownSection forecast={forecast} />
        </View>
      )}

      <View style={{ height: T.space.xl }} />
    </ScrollView>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.color.bg },
  content: { padding: T.space.screenPad },
});
