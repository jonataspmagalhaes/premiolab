// AcoesScreen — Tab "Estrategias".
// Dashboard de renda passiva com 6 ferramentas reais + hero + covered calls + score + forecast.

import React from 'react';
var useState = React.useState;
var useCallback = React.useCallback;
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, SIZE } from '../../theme';
import { T } from '../../theme/tokens';
import { Glass } from '../../components';
import Sensitive, { usePrivacyStyle } from '../../components/Sensitive';
import { useAuth } from '../../contexts/AuthContext';
import { useIncome, useCarteira, useAnalytics, useAppStore } from '../../contexts/AppStoreContext';
var finCats = require('../../constants/financeCategories');
var CAT_LABELS = finCats.CAT_LABELS;
var CAT_IONICONS = finCats.CAT_IONICONS;

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtInt(v) {
  return Math.round(v || 0).toLocaleString('pt-BR');
}
function fmtPct(v) {
  return (v || 0).toFixed(1) + '%';
}

var MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// ───────── SectionHeader ─────────
function SectionHeader(props) {
  return (
    <View style={{ marginBottom: T.space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: T.space.xs }}>
        <Ionicons name={props.icon} size={14} color={props.color} />
        <Text style={[T.type.kpiLabel, { color: T.color.textMuted }]}>{props.title}</Text>
        {props.badge ? (
          <View style={{ backgroundColor: props.color + '22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 'auto' }}>
            <Text style={{ fontSize: 10, color: props.color, fontFamily: F.mono, fontWeight: '700' }}>{props.badge}</Text>
          </View>
        ) : null}
      </View>
      {props.subtitle ? (
        <Text style={{ fontSize: 11, color: T.color.textSecondary, fontFamily: F.body, marginTop: 4, lineHeight: 16 }}>{props.subtitle}</Text>
      ) : null}
    </View>
  );
}

// ───────── Hero "Pra Crescer" ─────────
function HeroPraCrescer(props) {
  var data = props.data;
  var loading = props.loading;
  var navigation = props.navigation;
  var ps = usePrivacyStyle();
  var _exp = useState(false); var expanded = _exp[0]; var setExpanded = _exp[1];

  if (loading) {
    return (
      <Glass padding={T.space.cardPad} style={{ marginBottom: T.space.gap }}>
        <View style={{ alignItems: 'center', paddingVertical: T.space.lg }}>
          <ActivityIndicator size="small" color={C.accent} />
          <Text style={{ fontSize: 11, color: T.color.textMuted, fontFamily: F.mono, marginTop: T.space.xs }}>Calculando potencial...</Text>
        </View>
      </Glass>
    );
  }
  if (!data || data.patrimonio <= 0) {
    return (
      <Glass padding={T.space.cardPad} style={{ marginBottom: T.space.gap }}>
        <Text style={{ fontSize: 13, color: T.color.textSecondary, fontFamily: F.body }}>Adicione ativos a sua carteira para ver o potencial de renda.</Text>
      </Glass>
    );
  }

  var captura = data.capturaPct || 0;
  var gap = data.gap || 0;
  var gapsCount = (data.gaps || []).length;
  var superando = captura > 100;

  return (
    <Glass padding={0} glow="rgba(34,197,94,0.18)" style={{ marginBottom: T.space.gap, borderColor: 'rgba(34,197,94,0.30)' }}>
      <View style={{ height: 3, borderTopLeftRadius: T.radius.md, borderTopRightRadius: T.radius.md, backgroundColor: T.color.income }} />
      <View style={{ padding: T.space.lg }}>
        <SectionHeader icon="rocket-outline" color={T.color.income} title="PRA CRESCER" />
        {superando ? (
          <View style={{ marginBottom: T.space.md }}>
            <Text style={{ fontSize: 14, color: T.color.income, fontFamily: F.body, fontWeight: '700', marginBottom: 4 }}>
              Sua renda esta acima do potencial estimado!
            </Text>
            <Sensitive>
              <Text style={[{ fontSize: 12, color: T.color.textSecondary, fontFamily: F.body }, ps]}>
                {'Recebe R$ ' + fmtInt(data.rendaReal) + '/mes vs R$ ' + fmtInt(data.rendaPotencial) + ' estimado (' + Math.round(captura) + '% de captura)'}
              </Text>
            </Sensitive>
          </View>
        ) : (
          <View style={{ marginBottom: T.space.md }}>
            <Sensitive>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: T.space.xs }}>
                <Text style={[{ fontSize: 14, color: T.color.income, fontFamily: F.mono, fontWeight: '700' }, ps]}>+R$ </Text>
                <Text style={[{ fontSize: 36, color: T.color.income, fontFamily: F.mono, fontWeight: '800', lineHeight: 40 }, ps]}>{fmtInt(gap)}</Text>
                <Text style={[{ fontSize: 16, color: T.color.income, fontFamily: F.mono, fontWeight: '600', opacity: 0.8 }, ps]}>/mes</Text>
              </View>
            </Sensitive>
            <Text style={{ fontSize: 12, color: T.color.textSecondary, fontFamily: F.body }}>de potencial nao capturado</Text>
          </View>
        )}
        <View style={{ marginBottom: T.space.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: T.space.xxs }}>
            <Text style={{ fontSize: 10, color: T.color.textMuted, fontFamily: F.mono }}>CAPTURA ATUAL</Text>
            <Text style={{ fontSize: 10, color: T.color.income, fontFamily: F.mono, fontWeight: '700' }}>{captura.toFixed(0) + '%'}</Text>
          </View>
          <View style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3 }}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: T.color.income, width: Math.min(100, captura) + '%' }} />
          </View>
          <Sensitive><Text style={[{ fontSize: 10, color: T.color.textMuted, fontFamily: F.mono, marginTop: T.space.xxs }, ps]}>{'R$ ' + fmt(data.rendaReal) + ' / R$ ' + fmt(data.rendaPotencial) + ' possivel'}</Text></Sensitive>
        </View>
        {gapsCount > 0 ? (
          <TouchableOpacity activeOpacity={0.7} onPress={function() { setExpanded(!expanded); }} style={{
            backgroundColor: 'rgba(34,197,94,0.08)', borderRadius: T.radius.sm, padding: T.space.sm,
            flexDirection: 'row', alignItems: 'center', gap: T.space.xs,
          }}>
            <Ionicons name="alert-circle-outline" size={14} color={T.color.income} />
            <Text style={{ fontSize: 11, color: T.color.textPrimary, fontFamily: F.body, flex: 1 }}>{gapsCount + ' pontos onde otimizar'}</Text>
            <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={14} color={T.color.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>
      {expanded && gapsCount > 0 ? (
        <View style={{ paddingHorizontal: T.space.lg, paddingBottom: T.space.lg }}>
          {(data.gaps || []).map(function(g, idx) {
            var sevColor = g.severidade === 'alta' ? C.red : g.severidade === 'media' ? C.yellow : T.color.income;
            return (
              <TouchableOpacity key={idx} activeOpacity={0.7} onPress={function() { if (g.rota && navigation) navigation.navigate(g.rota); }}
                style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: T.radius.sm, padding: T.space.sm, marginTop: T.space.xs, flexDirection: 'row', alignItems: 'center', gap: T.space.sm }}>
                <View style={{ width: 4, height: 28, borderRadius: 2, backgroundColor: sevColor }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: T.color.textPrimary, fontFamily: F.body, fontWeight: '600' }}>{g.titulo}</Text>
                  <Text style={{ fontSize: 10, color: T.color.textMuted, fontFamily: F.body, marginTop: 2 }}>{g.descricao}</Text>
                </View>
                {g.ganhoMensal > 0 ? <Text style={{ fontSize: 11, color: T.color.income, fontFamily: F.mono, fontWeight: '700' }}>{'+R$ ' + g.ganhoMensal.toFixed(0)}</Text> : null}
                <Ionicons name="chevron-forward" size={12} color={T.color.textMuted} />
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </Glass>
  );
}

// ───────── Covered Calls Sugeridos ─────────
function CoveredCallsSection(props) {
  var suggestions = props.suggestions;
  var loading = props.loading;
  var navigation = props.navigation;
  var ps = usePrivacyStyle();
  if (loading) return (<Glass padding={T.space.cardPad} style={{ marginBottom: T.space.gap }}><SectionHeader icon="sync-outline" color={C.opcoes} title="COVERED CALLS SUGERIDOS" subtitle="Suas acoes paradas podem gerar renda extra vendendo opcoes de compra. Toque pra ver os detalhes." /><ActivityIndicator size="small" color={C.opcoes} /></Glass>);
  if (!suggestions || suggestions.length === 0) {
    var elegCount = suggestions && suggestions._elegiveisCount ? suggestions._elegiveisCount : 0;
    var elegList = suggestions && suggestions._elegiveis ? suggestions._elegiveis : [];
    return (
      <Glass padding={T.space.cardPad} style={{ marginBottom: T.space.gap }}>
        <SectionHeader icon="sync-outline" color={C.opcoes} title="COVERED CALLS SUGERIDOS" subtitle="Suas acoes paradas podem gerar renda extra vendendo opcoes de compra." />
        {elegCount > 0 ? (
          <View>
            <Text style={{ fontSize: 11, color: C.yellow, fontFamily: F.body, marginBottom: T.space.xs }}>
              {elegCount + ' acoes elegiveis encontradas, mas nao foi possivel buscar as opcoes disponiveis (mercado pode estar fechado ou fora do horario).'}
            </Text>
            <Text style={{ fontSize: 10, color: T.color.textMuted, fontFamily: F.body, marginBottom: T.space.xs }}>
              Acoes elegiveis: {elegList.map(function(e) { return e.ticker; }).join(', ')}
            </Text>
            <TouchableOpacity activeOpacity={0.7} onPress={function() { if (navigation) navigation.navigate('Opcoes'); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: T.space.xs }}>
              <Text style={{ fontSize: 11, color: C.accent, fontFamily: F.body }}>Abrir Opcoes pra ver a grade manualmente</Text>
              <Ionicons name="chevron-forward" size={12} color={C.accent} />
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={{ fontSize: 11, color: T.color.textMuted, fontFamily: F.body }}>
            Nenhuma acao elegivel. Para sugestoes de covered call, voce precisa ter acoes BR com pelo menos 100 cotas sem covered call ativa.
          </Text>
        )}
      </Glass>
    );
  }
  var top = suggestions.slice(0, 3);
  return (
    <Glass padding={T.space.cardPad} style={{ marginBottom: T.space.gap }}>
      <SectionHeader icon="sync-outline" color={C.opcoes} title="COVERED CALLS SUGERIDOS" subtitle="Suas acoes paradas podem gerar renda extra vendendo opcoes de compra. Toque pra ver os detalhes." />
      {top.map(function(cc, idx) {
        var sug = cc.sugestao;
        if (!sug) return null;
        var vencLabel = '';
        if (sug.vencimento) { var pts = sug.vencimento.split('-'); if (pts.length >= 2) vencLabel = MESES[parseInt(pts[1]) - 1] || ''; }
        var isEstimado = cc.estimado;
        return (
          <TouchableOpacity key={idx} activeOpacity={0.7} onPress={function() { navigation.navigate('Opcoes'); }}
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: T.space.xs, borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: 'rgba(255,255,255,0.06)' }}>
            <Text style={{ fontSize: 13, color: T.color.textPrimary, fontFamily: F.mono, fontWeight: '700', width: 60 }}>{cc.ticker}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, color: T.color.textMuted, fontFamily: F.mono }}>
                {cc.lotes + ' lote' + (cc.lotes > 1 ? 's' : '') + '  ·  C' + (sug.strike || '') + (vencLabel ? '  ' + vencLabel : '')}
              </Text>
              {isEstimado ? <Text style={{ fontSize: 8, color: C.yellow, fontFamily: F.mono }}>estimativa (mercado fechado)</Text> : null}
            </View>
            <Sensitive><Text style={[{ fontSize: 12, color: C.opcoes, fontFamily: F.mono, fontWeight: '700' }, ps]}>{'~+' + fmtPct(sug.yield_mensal) + '/m'}</Text></Sensitive>
          </TouchableOpacity>
        );
      })}
      {suggestions.length > 3 ? (
        <TouchableOpacity activeOpacity={0.7} onPress={function() { navigation.navigate('Opcoes'); }} style={{ alignItems: 'center', marginTop: T.space.sm }}>
          <Text style={{ fontSize: 11, color: C.accent, fontFamily: F.body }}>{'Ver todas ' + suggestions.length + ' sugestoes >'}</Text>
        </TouchableOpacity>
      ) : null}
    </Glass>
  );
}

// ───────── Raio-X da Renda ─────────
function IncomeXraySection(props) {
  var xray = props.xray;
  var navigation = props.navigation;
  var ps = usePrivacyStyle();
  var _selTicker = useState(null); var selTicker = _selTicker[0]; var setSelTicker = _selTicker[1];
  var _selMes = useState(-1); var selMes = _selMes[0]; var setSelMes = _selMes[1];
  var _showImpacto = useState(false); var showImpacto = _showImpacto[0]; var setShowImpacto = _showImpacto[1];
  var _showAll = useState(false); var showAllTickers = _showAll[0]; var setShowAllTickers = _showAll[1];
  var _selKpiX = useState(null); var selKpiX = _selKpiX[0]; var setSelKpiX = _selKpiX[1];
  var _selTrend = useState(-1); var selTrend = _selTrend[0]; var setSelTrend = _selTrend[1];
  if (!xray) return null;
  var riscoColor = xray.risco === 'alto' ? C.red : xray.risco === 'medio' ? C.yellow : C.green;
  var allConcentracao = xray.concentracao || [];
  var visibleTickers = showAllTickers ? allConcentracao : allConcentracao.slice(0, 5);
  var sazon = xray.sazonalidade;
  var maxSazon = 0;
  for (var i = 0; i < sazon.length; i++) { if (sazon[i].media > maxSazon) maxSazon = sazon[i].media; }

  // Impacto do ticker selecionado
  var selImpacto = null;
  if (selTicker && xray.impactos) {
    for (var ii = 0; ii < xray.impactos.length; ii++) {
      if (xray.impactos[ii].ticker === selTicker) { selImpacto = xray.impactos[ii]; break; }
    }
  }

  return (
    <Glass padding={T.space.cardPad} style={{ marginBottom: T.space.gap }}>
      <SectionHeader icon="analytics-outline" color={C.acoes} title="RAIO-X DA RENDA" badge={xray.risco === 'alto' ? 'RISCO' : null} subtitle="De onde vem sua renda e quao vulneravel voce esta. Toque nos ativos pra simular impacto." />

      {/* KPI resumo — clicaveis com tooltip */}
      <View style={{ flexDirection: 'row', marginBottom: T.space.xs, gap: T.space.sm }}>
        <TouchableOpacity activeOpacity={0.7} onPress={function() { setSelKpiX(selKpiX === 'tickers' ? null : 'tickers'); setShowAllTickers(!showAllTickers); }} style={{ flex: 1, backgroundColor: selKpiX === 'tickers' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)', borderRadius: T.radius.sm, padding: T.space.xs, alignItems: 'center' }}>
          <Text style={{ fontSize: 9, color: T.color.textMuted, fontFamily: F.mono }}>TICKERS</Text>
          <Text style={{ fontSize: 14, color: T.color.textPrimary, fontFamily: F.mono, fontWeight: '700' }}>{xray.totalTickers}</Text>
          <Text style={{ fontSize: 8, color: C.accent, fontFamily: F.mono }}>{showAllTickers ? 'colapsar' : 'ver todos'}</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.7} onPress={function() { setSelKpiX(selKpiX === 'pra80' ? null : 'pra80'); }} style={{ flex: 1, backgroundColor: selKpiX === 'pra80' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)', borderRadius: T.radius.sm, padding: T.space.xs, alignItems: 'center' }}>
          <Text style={{ fontSize: 9, color: T.color.textMuted, fontFamily: F.mono }}>PRA 80%</Text>
          <Text style={{ fontSize: 14, color: xray.tickersPra80 <= 5 ? C.red : xray.tickersPra80 <= 8 ? C.yellow : C.green, fontFamily: F.mono, fontWeight: '700' }}>{xray.tickersPra80 + ' ativos'}</Text>
          <Text style={{ fontSize: 8, color: T.color.textMuted, fontFamily: F.mono }}>{xray.tickersPra80 <= 5 ? 'concentrado' : xray.tickersPra80 <= 8 ? 'moderado' : 'diversificado'}</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.7} onPress={function() { setSelKpiX(selKpiX === 'tend' ? null : 'tend'); }} style={{ flex: 1, backgroundColor: selKpiX === 'tend' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)', borderRadius: T.radius.sm, padding: T.space.xs, alignItems: 'center' }}>
          <Text style={{ fontSize: 9, color: T.color.textMuted, fontFamily: F.mono }}>TENDENCIA</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Ionicons name={xray.tendenciaLabel === 'crescendo' ? 'trending-up' : xray.tendenciaLabel === 'caindo' ? 'trending-down' : 'remove'} size={14} color={xray.tendenciaLabel === 'crescendo' ? C.green : xray.tendenciaLabel === 'caindo' ? C.red : C.yellow} />
            <Text style={{ fontSize: 12, color: xray.tendenciaLabel === 'crescendo' ? C.green : xray.tendenciaLabel === 'caindo' ? C.red : C.yellow, fontFamily: F.mono, fontWeight: '700' }}>
              {(xray.tendenciaGeral > 0 ? '+' : '') + Math.round(xray.tendenciaGeral) + '%'}
            </Text>
          </View>
          <Text style={{ fontSize: 8, color: T.color.textMuted, fontFamily: F.mono }}>{xray.tendenciaLabel}</Text>
        </TouchableOpacity>
      </View>
      {/* KPI tooltip */}
      {selKpiX ? (
        <Sensitive>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: T.radius.sm, padding: T.space.xs, marginBottom: T.space.sm }}>
            <Text style={[{ fontSize: 10, color: T.color.textSecondary, fontFamily: F.body, textAlign: 'center' }, ps]}>
              {selKpiX === 'tickers' ? xray.totalTickers + ' ativos diferentes pagaram renda nos ultimos 12 meses. Quanto mais tickers, menor o risco de um corte impactar sua renda total.'
                : selKpiX === 'pra80' ? 'Apenas ' + xray.tickersPra80 + ' ativos de ' + xray.totalTickers + ' representam 80% da sua renda. ' + (xray.tickersPra80 <= 5 ? 'Concentracao alta — se um deles cortar dividendos, o impacto sera significativo. O ideal e ter pelo menos 8-10 ativos cobrindo 80% da renda.' : xray.tickersPra80 <= 8 ? 'Concentracao moderada. Diversificar mais reduziria o risco.' : 'Boa diversificacao — renda bem distribuida.')
                : 'Compara a media dos ultimos 6 meses com os 6 anteriores. ' + (xray.tendenciaGeral > 5 ? 'Sua renda esta crescendo — bom sinal de que seus ativos estao aumentando os pagamentos.' : xray.tendenciaGeral < -5 ? 'Sua renda esta caindo. Verifique se houve cortes de dividendos ou vendas de ativos pagadores.' : 'Sua renda esta estavel — sem grandes mudancas recentes.')}
            </Text>
          </View>
        </Sensitive>
      ) : null}

      {/* Tendencia — grafico de renda mensal */}
      {xray.tendenciaMensal && xray.tendenciaMensal.length > 3 ? (
        <View style={{ marginBottom: T.space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: T.space.xs }}>
            <Text style={[T.type.kpiLabel, { color: T.color.textMuted }]}>TENDENCIA</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name={xray.tendenciaLabel === 'crescendo' ? 'trending-up' : xray.tendenciaLabel === 'caindo' ? 'trending-down' : 'remove'} size={14} color={xray.tendenciaLabel === 'crescendo' ? C.green : xray.tendenciaLabel === 'caindo' ? C.red : C.yellow} />
              <Text style={{ fontSize: 11, color: xray.tendenciaLabel === 'crescendo' ? C.green : xray.tendenciaLabel === 'caindo' ? C.red : C.yellow, fontFamily: F.mono, fontWeight: '700' }}>
                {(xray.tendenciaGeral > 0 ? '+' : '') + Math.round(xray.tendenciaGeral) + '%'}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 44, gap: 1 }}>
            {(function() {
              var tData = xray.tendenciaMensal;
              var tMax = 0;
              for (var ti = 0; ti < tData.length; ti++) { if (tData[ti].valor > tMax) tMax = tData[ti].valor; }
              if (tMax <= 0) tMax = 1;
              return tData.map(function(t, idx) {
                var th = (t.valor / tMax) * 36 + 2;
                var isRecent = idx >= tData.length - 6;
                var isSel = selTrend === idx;
                return (
                  <TouchableOpacity key={idx} activeOpacity={0.7} onPress={function() { setSelTrend(isSel ? -1 : idx); setSelKpiX(null); }} style={{ flex: 1, justifyContent: 'flex-end', height: 44 }}>
                    <View style={{ width: '100%', height: th, borderRadius: 2, backgroundColor: isSel ? C.acoes : isRecent ? C.acoes + 'cc' : C.acoes + '44', borderWidth: isSel ? 1 : 0, borderColor: C.acoes }} />
                  </TouchableOpacity>
                );
              });
            })()}
          </View>
          {/* Tooltip da barra selecionada */}
          {selTrend >= 0 && selTrend < xray.tendenciaMensal.length ? (
            <Sensitive>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: T.radius.sm, padding: T.space.xs, marginTop: T.space.xs }}>
                {(function() {
                  var td = xray.tendenciaMensal[selTrend];
                  var prevVal = selTrend > 0 ? xray.tendenciaMensal[selTrend - 1].valor : 0;
                  var delta = prevVal > 0 ? ((td.valor / prevVal) - 1) * 100 : 0;
                  return (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={[{ fontSize: 12, color: C.acoes, fontFamily: F.mono, fontWeight: '700' }, ps]}>
                        {MESES[td.mes] + '/' + td.ano + ': R$ ' + fmtInt(td.valor)}
                      </Text>
                      {prevVal > 0 ? (
                        <Text style={{ fontSize: 10, color: delta > 0 ? C.green : delta < 0 ? C.red : T.color.textMuted, fontFamily: F.mono }}>
                          {(delta > 0 ? '+' : '') + Math.round(delta) + '% vs anterior'}
                        </Text>
                      ) : null}
                    </View>
                  );
                })()}
              </View>
            </Sensitive>
          ) : (
            <Sensitive>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                <Text style={[{ fontSize: 9, color: T.color.textMuted, fontFamily: F.mono }, ps]}>{'Ult. 6m: R$ ' + fmtInt(xray.mediaUlt6) + '/m'}</Text>
                <Text style={[{ fontSize: 9, color: T.color.textMuted, fontFamily: F.mono }, ps]}>{'Ant. 6m: R$ ' + fmtInt(xray.mediaAnt6) + '/m'}</Text>
              </View>
            </Sensitive>
          )}
        </View>
      ) : null}

      {xray.top3Pct > 50 ? (
        <View style={{ backgroundColor: C.red + '15', borderRadius: T.radius.sm, padding: T.space.xs, marginBottom: T.space.sm, flexDirection: 'row', alignItems: 'center', gap: T.space.xs }}>
          <Ionicons name="warning-outline" size={12} color={C.yellow} />
          <Text style={{ fontSize: 11, color: C.yellow, fontFamily: F.body, flex: 1 }}>
            {Math.round(xray.top3Pct) + '% da renda concentrada em 3 ativos — alto risco de queda'}
          </Text>
        </View>
      ) : null}

      {/* Concentracao por ticker */}
      <Text style={[T.type.kpiLabel, { color: T.color.textMuted, marginBottom: T.space.xs }]}>CONCENTRACAO</Text>
      {visibleTickers.map(function(c, idx) {
        var isSel = selTicker === c.ticker;
        return (
          <TouchableOpacity key={idx} activeOpacity={0.7} onPress={function() { setSelTicker(isSel ? null : c.ticker); setSelMes(-1); setShowImpacto(false); }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, paddingVertical: 2, backgroundColor: isSel ? 'rgba(255,255,255,0.04)' : 'transparent', borderRadius: 4 }}>
              <Text style={{ fontSize: 11, color: isSel ? C.acoes : T.color.textPrimary, fontFamily: F.mono, fontWeight: '600', width: 60 }}>{c.ticker}</Text>
              <View style={{ flex: 1, height: isSel ? 6 : 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, marginHorizontal: T.space.xs }}>
                <View style={{ height: isSel ? 6 : 4, borderRadius: 3, backgroundColor: idx < 3 && xray.risco === 'alto' ? riscoColor : C.acoes, width: Math.min(100, c.pct) + '%' }} />
              </View>
              <Text style={{ fontSize: 10, color: T.color.textMuted, fontFamily: F.mono, width: 30, textAlign: 'right' }}>{c.pct.toFixed(0) + '%'}</Text>
              {c.tendencia != null ? (
                <Ionicons name={c.tendencia > 5 ? 'trending-up' : c.tendencia < -5 ? 'trending-down' : 'remove'} size={10} color={c.tendencia > 5 ? C.green : c.tendencia < -5 ? C.red : T.color.textMuted} style={{ width: 14, marginLeft: 2 }} />
              ) : c.novoTicker ? (
                <Ionicons name="sparkles" size={10} color={C.accent} style={{ width: 14, marginLeft: 2 }} />
              ) : <View style={{ width: 16 }} />}
            </View>
            {isSel ? (
              <View style={{ paddingLeft: 8, marginBottom: 6 }}>
                <Sensitive>
                  <View style={{ flexDirection: 'row', gap: T.space.sm, marginBottom: 4, flexWrap: 'wrap' }}>
                    <Text style={[{ fontSize: 10, color: T.color.textMuted, fontFamily: F.mono }, ps]}>{'12m: R$ ' + fmtInt(c.valor12m)}</Text>
                    <Text style={[{ fontSize: 10, color: T.color.textMuted, fontFamily: F.mono }, ps]}>{'Media: R$ ' + fmtInt(c.valor12m / 12) + '/mes'}</Text>
                    {c.tendencia != null ? (
                      <Text style={[{ fontSize: 10, color: c.tendencia > 5 ? C.green : c.tendencia < -5 ? C.red : T.color.textMuted, fontFamily: F.mono }, ps]}>
                        {'Tendencia: ' + (c.tendencia > 0 ? '+' : '') + Math.round(c.tendencia) + '% a.a.'}
                      </Text>
                    ) : c.novoTicker ? (
                      <Text style={[{ fontSize: 10, color: C.accent, fontFamily: F.mono }, ps]}>Novo pagador</Text>
                    ) : null}
                  </View>
                </Sensitive>
                {/* Simulacao de impacto */}
                {selImpacto ? (
                  <View>
                    <TouchableOpacity activeOpacity={0.7} onPress={function() { setShowImpacto(!showImpacto); }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="flask-outline" size={10} color={C.yellow} />
                      <Text style={{ fontSize: 10, color: C.yellow, fontFamily: F.body }}>Simular impacto de corte</Text>
                      <Ionicons name={showImpacto ? 'chevron-up' : 'chevron-down'} size={10} color={C.yellow} />
                    </TouchableOpacity>
                    {showImpacto ? (
                      <View style={{ marginTop: 4 }}>
                        {selImpacto.cenarios.map(function(cen, ci) {
                          return (
                            <Sensitive key={ci}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3, borderTopWidth: ci > 0 ? 1 : 0, borderTopColor: 'rgba(255,255,255,0.06)' }}>
                                <Text style={{ fontSize: 10, color: T.color.textMuted, fontFamily: F.mono, width: 55 }}>{'Corte ' + cen.cortePct + '%'}</Text>
                                <Text style={[{ fontSize: 10, color: C.red, fontFamily: F.mono, width: 70 }, ps]}>{'-R$ ' + fmtInt(cen.perdaMensal) + '/m'}</Text>
                                <Text style={[{ fontSize: 10, color: T.color.textMuted, fontFamily: F.mono, flex: 1 }, ps]}>{'Renda: R$ ' + fmtInt(cen.novaRenda)}</Text>
                                <Text style={{ fontSize: 9, color: C.red, fontFamily: F.mono }}>{ '-' + cen.impactoPct.toFixed(0) + '%'}</Text>
                              </View>
                            </Sensitive>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}

      {/* Botao ver todos / colapsar */}
      {allConcentracao.length > 5 ? (
        <TouchableOpacity activeOpacity={0.7} onPress={function() { setShowAllTickers(!showAllTickers); }}
          style={{ alignItems: 'center', marginTop: T.space.xs, marginBottom: T.space.xs }}>
          <Text style={{ fontSize: 11, color: C.accent, fontFamily: F.body }}>
            {showAllTickers ? 'Mostrar menos' : 'Ver todos ' + allConcentracao.length + ' tickers >'}
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* Sazonalidade */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: T.space.md, marginBottom: T.space.xs }}>
        <Text style={[T.type.kpiLabel, { color: T.color.textMuted }]}>SAZONALIDADE (MEDIA MENSAL)</Text>
        {xray.tendenciaMensal && xray.tendenciaMensal.length > 0 ? (
          <Text style={{ fontSize: 9, color: T.color.textMuted, fontFamily: F.mono }}>
            {xray.tendenciaMensal[0].ano + '-' + xray.tendenciaMensal[xray.tendenciaMensal.length - 1].ano}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 40, gap: 2 }}>
        {sazon.map(function(s, idx) {
          var h = maxSazon > 0 ? (s.media / maxSazon) * 32 + 4 : 4;
          var isWeak = s.media < ((xray.medianaGeral || xray.mediaMensal) * 0.6);
          var isStrong = s.media > ((xray.medianaGeral || xray.mediaMensal) * 1.3);
          var isSel2 = selMes === idx;
          return (
            <TouchableOpacity key={idx} activeOpacity={0.7} onPress={function() { setSelMes(isSel2 ? -1 : idx); setSelTicker(null); }} style={{ flex: 1, alignItems: 'center' }}>
              <View style={{ width: '100%', height: h, borderRadius: 2, backgroundColor: isSel2 ? (isWeak ? C.red : isStrong ? C.green : C.acoes) : (isWeak ? C.red + '55' : isStrong ? C.green + '55' : C.acoes + '44'), borderWidth: isSel2 ? 1 : 0, borderColor: isWeak ? C.red : isStrong ? C.green : C.acoes }} />
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 2 }}>
        {sazon.map(function(s, idx) {
          var isSel2 = selMes === idx;
          return <Text key={idx} style={{ flex: 1, fontSize: 7, color: isSel2 ? C.acoes : T.color.textMuted, fontFamily: F.mono, textAlign: 'center', fontWeight: isSel2 ? '800' : '400' }}>{s.label.substring(0, 3)}</Text>;
        })}
      </View>
      {selMes >= 0 ? (
        <Sensitive>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: T.radius.sm, padding: T.space.sm, marginTop: T.space.xs }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={[{ fontSize: 12, color: T.color.textPrimary, fontFamily: F.display, fontWeight: '700' }, ps]}>
                {sazon[selMes].label + ': R$ ' + fmtInt(sazon[selMes].media)}
              </Text>
              <Text style={{ fontSize: 10, color: sazon[selMes].media < (xray.medianaGeral || xray.mediaMensal) * 0.6 ? C.red : sazon[selMes].media > (xray.medianaGeral || xray.mediaMensal) * 1.3 ? C.green : T.color.textMuted, fontFamily: F.mono }}>
                {sazon[selMes].media < (xray.medianaGeral || xray.mediaMensal) * 0.6 ? 'MES FRACO' : sazon[selMes].media > (xray.medianaGeral || xray.mediaMensal) * 1.3 ? 'MES FORTE' : 'NORMAL'}
              </Text>
            </View>
            <Text style={[{ fontSize: 10, color: T.color.textMuted, fontFamily: F.body }, ps]}>
              {(sazon[selMes].media > xray.mediaMensal ? '+' : '') + Math.round(((sazon[selMes].media / xray.mediaMensal) - 1) * 100) + '% vs media geral de R$ ' + fmtInt(xray.mediaMensal) + '/mes (media de todos os anos)'}
            </Text>
          </View>
        </Sensitive>
      ) : null}
      {selMes < 0 ? (
        <View style={{ marginTop: T.space.xs }}>
          <Sensitive>
            <Text style={[{ fontSize: 10, color: T.color.textMuted, fontFamily: F.body }, ps]}>
              {'Melhor: ' + xray.melhorMes.mes + ' (R$ ' + fmtInt(xray.melhorMes.valor) + ')  ·  Pior: ' + xray.piorMes.mes + ' (R$ ' + fmtInt(xray.piorMes.valor) + ')'}
            </Text>
          </Sensitive>
          {xray.mesesFracos.length > 0 ? (
            <Text style={{ fontSize: 10, color: C.yellow, fontFamily: F.body, marginTop: 2 }}>
              {'Meses fracos: ' + xray.mesesFracos.join(', ') + (xray.mesesFortes.length > 0 ? '  ·  Fortes: ' + xray.mesesFortes.join(', ') : '')}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Ativos subperformando — DY abaixo do ideal */}
      {xray.ativosSubperformando && xray.ativosSubperformando.length > 0 ? (
        <View style={{ marginTop: T.space.md }}>
          <Text style={[T.type.kpiLabel, { color: C.red, marginBottom: T.space.xs }]}>ATIVOS COM DY ABAIXO DO IDEAL</Text>
          <Text style={{ fontSize: 10, color: T.color.textMuted, fontFamily: F.body, marginBottom: T.space.xs }}>
            Esses ativos pagam menos dividendos do que o esperado pra sua categoria. Considere substituir por ativos com DY melhor.
          </Text>
          {xray.ativosSubperformando.slice(0, 5).map(function(sub, si) {
            return (
              <TouchableOpacity key={si} activeOpacity={0.7} onPress={function() { if (navigation) navigation.navigate('AssetDetail', { ticker: sub.ticker }); }}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: T.space.xs, borderTopWidth: si > 0 ? 1 : 0, borderTopColor: 'rgba(255,255,255,0.06)' }}>
                <Text style={{ fontSize: 11, color: T.color.textPrimary, fontFamily: F.mono, fontWeight: '600', width: 55 }}>{sub.ticker}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10, color: sub.semDados ? C.yellow : C.red, fontFamily: F.mono }}>
                    {sub.semDados ? 'Sem proventos registrados' : 'DY ' + sub.dy.toFixed(1) + '% (ideal: ' + sub.dyIdeal + '%+)'}
                  </Text>
                </View>
                <Sensitive>
                  <Text style={[{ fontSize: 10, color: T.color.textMuted, fontFamily: F.mono }, ps]}>
                    {'-R$ ' + fmtInt(sub.deficit) + '/m'}
                  </Text>
                </Sensitive>
                <Ionicons name="chevron-forward" size={12} color={T.color.textMuted} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </Glass>
  );
}

// ───────── Renda vs Contas ─────────
function IncomeCoverageSection(props) {
  var coverage = props.coverage;
  var ps = usePrivacyStyle();
  if (!coverage || coverage.contas.length === 0) return null;
  var top = coverage.contas.slice(0, 8);

  // Lookup de grupo → metadata (icon, color, label)
  var GRUPO_META = {};
  var fgGroups = finCats.FINANCE_GROUPS || [];
  for (var fi = 0; fi < fgGroups.length; fi++) {
    GRUPO_META[fgGroups[fi].k] = { label: fgGroups[fi].l, icon: fgGroups[fi].icon, color: fgGroups[fi].color };
  }

  return (
    <Glass padding={T.space.cardPad} style={{ marginBottom: T.space.gap }}>
      <SectionHeader icon="shield-checkmark-outline" color={C.green} title="RENDA VS CONTAS" badge={Math.round(coverage.progressoPct) + '%'} subtitle="Quanto das suas despesas mensais ja esta coberto pela renda passiva. O objetivo e chegar a 100%." />
      <View style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, marginBottom: T.space.sm }}>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: C.green, width: Math.min(100, coverage.progressoPct) + '%' }} />
      </View>
      {top.map(function(c, idx) {
        var meta = GRUPO_META[c.categoria] || {};
        var label = meta.label || c.categoria;
        var grpIcon = meta.icon || 'ellipse-outline';
        var grpColor = meta.color || T.color.textMuted;
        var statusIcon = c.status === 'coberto' ? 'checkmark-circle' : c.status === 'parcial' ? 'remove-circle-outline' : 'close-circle-outline';
        var statusColor = c.status === 'coberto' ? C.green : c.status === 'parcial' ? C.yellow : C.red;
        return (
          <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: 'rgba(255,255,255,0.06)' }}>
            <Ionicons name={statusIcon} size={16} color={statusColor} style={{ marginRight: T.space.xs }} />
            <Ionicons name={grpIcon} size={13} color={grpColor} style={{ marginRight: 6 }} />
            <Text style={{ fontSize: 12, color: T.color.textPrimary, fontFamily: F.body, flex: 1 }}>{label}</Text>
            <Sensitive>
              <Text style={[{ fontSize: 11, color: T.color.textMuted, fontFamily: F.mono }, ps]}>{'R$ ' + fmtInt(c.gastoMensal)}</Text>
            </Sensitive>
            {c.status === 'coberto' ? (
              <Ionicons name="checkmark" size={12} color={C.green} style={{ marginLeft: 6 }} />
            ) : c.falta > 0 ? (
              <Sensitive><Text style={[{ fontSize: 10, color: C.red + 'aa', fontFamily: F.mono, marginLeft: 6 }, ps]}>{'falta ' + fmtInt(c.falta)}</Text></Sensitive>
            ) : null}
          </View>
        );
      })}
      <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: T.radius.sm, padding: T.space.sm, marginTop: T.space.sm }}>
        <Sensitive>
          <Text style={[{ fontSize: 11, color: T.color.textSecondary, fontFamily: F.body, textAlign: 'center' }, ps]}>
            {'Sua renda passiva de R$ ' + fmtInt(coverage.rendaMedia) + '/mes cobre ' + Math.round(coverage.progressoPct) + '% dos gastos de R$ ' + fmtInt(coverage.totalGastos) + '/mes'}
          </Text>
        </Sensitive>
      </View>
      {!coverage.temOrcamentos ? (
        <TouchableOpacity activeOpacity={0.7} onPress={function() { if (props.navigation) props.navigation.navigate('Carteira', { initialTab: 'financas' }); }}
          style={{ marginTop: T.space.xs, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
          <Ionicons name="settings-outline" size={11} color={C.accent} />
          <Text style={{ fontSize: 10, color: C.accent, fontFamily: F.body }}>Defina seus orcamentos em Financeiro pra personalizar suas metas</Text>
        </TouchableOpacity>
      ) : null}
    </Glass>
  );
}

// ───────── Detector de Cortes ─────────
function CutRiskSection(props) {
  var risks = props.risks;
  if (!risks || risks.length === 0) return null;
  return (
    <Glass padding={T.space.cardPad} style={{ marginBottom: T.space.gap }}>
      <SectionHeader icon="warning-outline" color={C.red} title="RISCO DE CORTE" badge={risks.length + ''} subtitle="Ativos com sinais de que podem reduzir dividendos. Fique atento e considere reduzir exposicao." />
      {risks.slice(0, 3).map(function(r, idx) {
        var sevColor = r.severidade === 'alta' ? C.red : r.severidade === 'media' ? C.yellow : T.color.textMuted;
        return (
          <View key={idx} style={{ marginBottom: T.space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <View style={{ width: 4, height: 20, borderRadius: 2, backgroundColor: sevColor, marginRight: T.space.xs }} />
              <Text style={{ fontSize: 13, color: T.color.textPrimary, fontFamily: F.mono, fontWeight: '700' }}>{r.ticker}</Text>
              <View style={{ flex: 1 }} />
              <Text style={{ fontSize: 10, color: sevColor, fontFamily: F.mono, fontWeight: '700' }}>{'risco ' + r.riskScore}</Text>
            </View>
            {r.sinais.slice(0, 2).map(function(s, si) {
              return <Text key={si} style={{ fontSize: 10, color: T.color.textMuted, fontFamily: F.body, marginLeft: 12, marginBottom: 1 }}>{'- ' + s}</Text>;
            })}
          </View>
        );
      })}
    </Glass>
  );
}

// ───────── Snowball Tracker ─────────
function SnowballSection(props) {
  var snow = props.snowball;
  var ps = usePrivacyStyle();
  var _selAno = useState(-1); var selAno = _selAno[0]; var setSelAno = _selAno[1];
  var _showProj = useState(false); var showProj = _showProj[0]; var setShowProj = _showProj[1];
  var _selKpi = useState(null); var selKpi = _selKpi[0]; var setSelKpi = _selKpi[1];
  var _selBarMes = useState(-1); var selBarMes = _selBarMes[0]; var setSelBarMes = _selBarMes[1];
  if (!snow || snow.rendaAtual <= 0) return null;

  var CYAN = '#06B6D4';

  return (
    <Glass padding={T.space.cardPad} style={{ marginBottom: T.space.gap }}>
      <SectionHeader icon="snow-outline" color={CYAN} title="EFEITO BOLA DE NEVE" subtitle="Como seus dividendos reinvestidos geram mais dividendos. O poder do compounding." />

      {/* KPIs — clicaveis */}
      <View style={{ flexDirection: 'row', marginBottom: T.space.xs, gap: T.space.sm }}>
        <TouchableOpacity activeOpacity={0.7} onPress={function() { setSelKpi(selKpi === 'total' ? null : 'total'); }} style={{ flex: 1, backgroundColor: selKpi === 'total' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)', borderRadius: T.radius.sm, padding: T.space.xs, alignItems: 'center' }}>
          <Text style={{ fontSize: 9, color: T.color.textMuted, fontFamily: F.mono }}>TOTAL RECEBIDO</Text>
          <Sensitive><Text style={[{ fontSize: 13, color: C.green, fontFamily: F.mono, fontWeight: '700' }, ps]}>{'R$ ' + fmtInt(snow.totalProventos)}</Text></Sensitive>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.7} onPress={function() { setSelKpi(selKpi === 'cagr' ? null : 'cagr'); }} style={{ flex: 1, backgroundColor: selKpi === 'cagr' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)', borderRadius: T.radius.sm, padding: T.space.xs, alignItems: 'center' }}>
          <Text style={{ fontSize: 9, color: T.color.textMuted, fontFamily: F.mono }}>CAGR RENDA</Text>
          <Text style={{ fontSize: 13, color: snow.cagr > 0 ? C.green : C.red, fontFamily: F.mono, fontWeight: '700' }}>
            {(snow.cagr > 0 ? '+' : '') + snow.cagr.toFixed(0) + '% a.a.'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.7} onPress={function() { setSelKpi(selKpi === 'acel' ? null : 'acel'); }} style={{ flex: 1, backgroundColor: selKpi === 'acel' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)', borderRadius: T.radius.sm, padding: T.space.xs, alignItems: 'center' }}>
          <Text style={{ fontSize: 9, color: T.color.textMuted, fontFamily: F.mono }}>ACELERACAO</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Ionicons name={snow.aceleracao > 10 ? 'rocket-outline' : snow.aceleracao > 0 ? 'trending-up' : 'trending-down'} size={12} color={snow.aceleracao > 0 ? C.green : C.red} />
            <Text style={{ fontSize: 13, color: snow.aceleracao > 0 ? C.green : C.red, fontFamily: F.mono, fontWeight: '700' }}>
              {(snow.aceleracao > 0 ? '+' : '') + Math.round(snow.aceleracao) + '%'}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
      {/* KPI tooltip */}
      {selKpi ? (
        <Sensitive>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: T.radius.sm, padding: T.space.xs, marginBottom: T.space.sm }}>
            <Text style={[{ fontSize: 10, color: T.color.textSecondary, fontFamily: F.body, textAlign: 'center' }, ps]}>
              {selKpi === 'total' ? 'Total de dividendos, JCP e rendimentos recebidos desde o inicio. Aportou R$ ' + fmtInt(snow.aporteTotal) + ' e recebeu R$ ' + fmtInt(snow.totalProventos) + ' de volta (' + (snow.aporteTotal > 0 ? Math.round(snow.totalProventos / snow.aporteTotal * 100) : 0) + '% do aporte).'
                : selKpi === 'cagr' ? 'Taxa de crescimento composto anual da sua renda passiva. ' + (snow.cagr > 0 ? 'Sua renda cresce ' + snow.cagr.toFixed(1) + '% ao ano em media.' : 'Sua renda diminuiu ' + Math.abs(snow.cagr).toFixed(1) + '% ao ano. Revise seus ativos.')
                : 'Compara a renda dos ultimos 6 meses com os primeiros 6 meses. ' + (snow.aceleracao > 0 ? 'Sua renda esta acelerando — o snowball esta funcionando.' : 'Sua renda esta desacelerando. Considere reinvestir mais.')}
            </Text>
          </View>
        </Sensitive>
      ) : null}

      {/* Dividendos sobre dividendos */}
      {snow.renda2aOrdem > 0 ? (
        <View style={{ backgroundColor: CYAN + '15', borderRadius: T.radius.sm, padding: T.space.sm, marginBottom: T.space.sm }}>
          <Text style={{ fontSize: 11, color: CYAN, fontFamily: F.body, fontWeight: '600', marginBottom: 2 }}>Dividendos sobre dividendos</Text>
          <Sensitive>
            <Text style={[{ fontSize: 10, color: T.color.textSecondary, fontFamily: F.body }, ps]}>
              {'R$ ' + fmtInt(snow.proventosReinvestidos) + ' de dividendos reinvestidos geram ~R$ ' + fmtInt(snow.renda2aOrdem) + '/mes extras — dinheiro que se paga sozinho.'}
            </Text>
          </Sensitive>
        </View>
      ) : null}

      {/* Evolucao mensal — barras clicaveis */}
      {snow.evolucaoMensal && snow.evolucaoMensal.length > 3 ? (
        <View style={{ marginBottom: T.space.sm }}>
          <Text style={[T.type.kpiLabel, { color: T.color.textMuted, marginBottom: T.space.xs }]}>EVOLUCAO DA RENDA</Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 44, gap: 1 }}>
            {(function() {
              var data = snow.evolucaoMensal;
              var maxV = 0;
              for (var mi = 0; mi < data.length; mi++) { if (data[mi].valor > maxV) maxV = data[mi].valor; }
              if (maxV <= 0) maxV = 1;
              return data.map(function(d, idx) {
                var h = (d.valor / maxV) * 36 + 2;
                var isRecent = idx >= data.length - 6;
                var isSel = selBarMes === idx;
                return (
                  <TouchableOpacity key={idx} activeOpacity={0.7} onPress={function() { setSelBarMes(isSel ? -1 : idx); setSelKpi(null); }} style={{ flex: 1, justifyContent: 'flex-end', height: 44 }}>
                    <View style={{ width: '100%', height: h, borderRadius: 2, backgroundColor: isSel ? CYAN : isRecent ? CYAN + 'bb' : CYAN + '44', borderWidth: isSel ? 1 : 0, borderColor: CYAN }} />
                  </TouchableOpacity>
                );
              });
            })()}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
            <Text style={{ fontSize: 8, color: T.color.textMuted, fontFamily: F.mono }}>
              {snow.evolucaoMensal[0] ? MESES[snow.evolucaoMensal[0].mes] + '/' + String(snow.evolucaoMensal[0].ano).substring(2) : ''}
            </Text>
            <Text style={{ fontSize: 8, color: T.color.textMuted, fontFamily: F.mono }}>
              {snow.evolucaoMensal.length > 0 ? MESES[snow.evolucaoMensal[snow.evolucaoMensal.length - 1].mes] + '/' + String(snow.evolucaoMensal[snow.evolucaoMensal.length - 1].ano).substring(2) : ''}
            </Text>
          </View>
          {/* Tooltip da barra selecionada */}
          {selBarMes >= 0 && selBarMes < snow.evolucaoMensal.length ? (
            <Sensitive>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: T.radius.sm, padding: T.space.xs, marginTop: T.space.xs }}>
                {(function() {
                  var d = snow.evolucaoMensal[selBarMes];
                  var prevVal = selBarMes > 0 ? snow.evolucaoMensal[selBarMes - 1].valor : 0;
                  var delta = prevVal > 0 ? ((d.valor / prevVal) - 1) * 100 : 0;
                  return (
                    <View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={[{ fontSize: 12, color: CYAN, fontFamily: F.mono, fontWeight: '700' }, ps]}>
                          {MESES[d.mes] + '/' + d.ano + ': R$ ' + fmtInt(d.valor)}
                        </Text>
                        {prevVal > 0 ? (
                          <Text style={{ fontSize: 10, color: delta > 0 ? C.green : delta < 0 ? C.red : T.color.textMuted, fontFamily: F.mono }}>
                            {(delta > 0 ? '+' : '') + Math.round(delta) + '% vs anterior'}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={[{ fontSize: 10, color: T.color.textMuted, fontFamily: F.mono, marginTop: 2 }, ps]}>
                        {'Acumulado ate aqui: R$ ' + fmtInt(d.acumulado)}
                      </Text>
                    </View>
                  );
                })()}
              </View>
            </Sensitive>
          ) : null}
        </View>
      ) : null}

      {/* Evolucao por ano — clicavel */}
      {snow.evolucaoAnual && snow.evolucaoAnual.length > 1 ? (
        <View style={{ marginBottom: T.space.sm }}>
          <Text style={[T.type.kpiLabel, { color: T.color.textMuted, marginBottom: T.space.xs }]}>POR ANO</Text>
          {snow.evolucaoAnual.map(function(ev, idx) {
            var isSel = selAno === idx;
            var maxMedia = snow.rendaAtual;
            for (var mm = 0; mm < snow.evolucaoAnual.length; mm++) { if (snow.evolucaoAnual[mm].media > maxMedia) maxMedia = snow.evolucaoAnual[mm].media; }
            return (
              <TouchableOpacity key={idx} activeOpacity={0.7} onPress={function() { setSelAno(isSel ? -1 : idx); }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3, paddingVertical: isSel ? 3 : 0, backgroundColor: isSel ? 'rgba(255,255,255,0.04)' : 'transparent', borderRadius: 4 }}>
                  <Text style={{ fontSize: 10, color: isSel ? CYAN : T.color.textMuted, fontFamily: F.mono, width: 35, fontWeight: isSel ? '700' : '400' }}>{ev.ano}</Text>
                  <View style={{ flex: 1, height: isSel ? 6 : 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3, marginHorizontal: T.space.xs }}>
                    <View style={{ height: isSel ? 6 : 4, borderRadius: 3, backgroundColor: CYAN, width: Math.min(100, maxMedia > 0 ? (ev.media / maxMedia) * 100 : 0) + '%' }} />
                  </View>
                  <Sensitive><Text style={[{ fontSize: isSel ? 11 : 9, color: isSel ? CYAN : T.color.textMuted, fontFamily: F.mono, width: 65, textAlign: 'right', fontWeight: isSel ? '700' : '400' }, ps]}>{'R$ ' + fmtInt(ev.media) + '/m'}</Text></Sensitive>
                  {ev.growth !== 0 ? (
                    <Text style={{ fontSize: 9, color: ev.growth > 0 ? C.green : C.red, fontFamily: F.mono, width: 40, textAlign: 'right' }}>
                      {(ev.growth > 0 ? '+' : '') + Math.round(ev.growth) + '%'}
                    </Text>
                  ) : <View style={{ width: 40 }} />}
                </View>
                {isSel ? (
                  <Sensitive>
                    <View style={{ flexDirection: 'row', paddingLeft: 35, marginBottom: 4, gap: T.space.sm, flexWrap: 'wrap' }}>
                      <Text style={[{ fontSize: 10, color: T.color.textMuted, fontFamily: F.mono }, ps]}>{'Total: R$ ' + fmtInt(ev.total)}</Text>
                      <Text style={[{ fontSize: 10, color: T.color.textMuted, fontFamily: F.mono }, ps]}>{ev.meses + ' meses de pagamento'}</Text>
                    </View>
                  </Sensitive>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {/* Projecao futura — cenarios de reinvestimento */}
      {snow.projecoes && snow.projecoes.length > 0 ? (
        <View>
          <TouchableOpacity activeOpacity={0.7} onPress={function() { setShowProj(!showProj); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: T.space.xs }}>
            <Ionicons name="telescope-outline" size={12} color={C.accent} />
            <Text style={{ fontSize: 11, color: C.accent, fontFamily: F.body, fontWeight: '600', flex: 1 }}>Projecao: e se voce reinvestir?</Text>
            <Ionicons name={showProj ? 'chevron-up' : 'chevron-down'} size={12} color={C.accent} />
          </TouchableOpacity>
          {showProj ? (
            <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: T.radius.sm, padding: T.space.sm }}>
              <View style={{ flexDirection: 'row', marginBottom: T.space.xs }}>
                <Text style={{ fontSize: 9, color: T.color.textMuted, fontFamily: F.mono, width: 100 }}>CENARIO</Text>
                <Text style={{ fontSize: 9, color: T.color.textMuted, fontFamily: F.mono, flex: 1, textAlign: 'center' }}>1 ANO</Text>
                <Text style={{ fontSize: 9, color: T.color.textMuted, fontFamily: F.mono, flex: 1, textAlign: 'center' }}>3 ANOS</Text>
                <Text style={{ fontSize: 9, color: T.color.textMuted, fontFamily: F.mono, flex: 1, textAlign: 'center' }}>5 ANOS</Text>
              </View>
              {snow.projecoes.map(function(proj, idx) {
                var colors = [T.color.textMuted, C.yellow, C.green];
                return (
                  <Sensitive key={idx}>
                    <View style={{ flexDirection: 'row', paddingVertical: 4, borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: 'rgba(255,255,255,0.06)' }}>
                      <Text style={{ fontSize: 10, color: colors[idx] || T.color.textMuted, fontFamily: F.body, width: 100 }}>{proj.label}</Text>
                      <Text style={[{ fontSize: 10, color: colors[idx], fontFamily: F.mono, flex: 1, textAlign: 'center' }, ps]}>{'R$ ' + fmtInt(proj.renda12m)}</Text>
                      <Text style={[{ fontSize: 10, color: colors[idx], fontFamily: F.mono, flex: 1, textAlign: 'center' }, ps]}>{'R$ ' + fmtInt(proj.renda36m)}</Text>
                      <Text style={[{ fontSize: 10, color: colors[idx], fontFamily: F.mono, flex: 1, textAlign: 'center', fontWeight: idx === 2 ? '700' : '400' }, ps]}>{'R$ ' + fmtInt(proj.renda60m)}</Text>
                    </View>
                  </Sensitive>
                );
              })}
              {snow.projecoes.length >= 3 ? (
                <Sensitive>
                  <View style={{ backgroundColor: C.green + '12', borderRadius: 4, padding: T.space.xs, marginTop: T.space.xs }}>
                    <Text style={[{ fontSize: 10, color: C.green, fontFamily: F.body, textAlign: 'center' }, ps]}>
                      {'Reinvestindo 100% por 5 anos: R$ ' + fmtInt(snow.projecoes[2].renda60m) + '/mes vs R$ ' + fmtInt(snow.projecoes[0].renda60m) + ' sem reinvestir. Diferenca: +R$ ' + fmtInt(snow.projecoes[2].renda60m - snow.projecoes[0].renda60m)}
                    </Text>
                  </View>
                </Sensitive>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </Glass>
  );
}

// ───────── Piloto Automatico ─────────
function AutopilotSection(props) {
  var plan = props.plan;
  var ps = usePrivacyStyle();
  if (!plan) return null;
  var catLabel = { acao: 'Acao', fii: 'FII', etf: 'ETF', stock_int: 'INT' };
  var catColor = { acao: C.acoes, fii: C.fiis, etf: C.etfs, stock_int: C.stock_int };

  // Projecao: barras dos 12 meses
  var proj = plan.projecao12m || [];
  var maxProj = 0;
  for (var mp = 0; mp < proj.length; mp++) {
    if (proj[mp].comReinvestir > maxProj) maxProj = proj[mp].comReinvestir;
  }

  return (
    <Glass padding={T.space.cardPad} style={{ marginBottom: T.space.gap, borderColor: C.accent + '30' }}>
      <SectionHeader icon="navigate-outline" color={C.accent} title="PILOTO AUTOMATICO" badge={plan.sugestoes.length + ' ativos'} subtitle={'Reinvestindo R$ ' + fmtInt(plan.dividendosMes) + '/mes de dividendos (' + plan.totalCandidatos + ' ativos analisados)'} />

      {/* Sugestoes com razoes */}
      {plan.sugestoes.map(function(s, idx) {
        return (
          <View key={idx} style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: T.radius.sm, padding: T.space.sm, marginBottom: T.space.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Text style={{ fontSize: 13, color: T.color.textPrimary, fontFamily: F.mono, fontWeight: '700' }}>{s.ticker}</Text>
              <View style={{ backgroundColor: (catColor[s.categoria] || C.acoes) + '22', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, marginLeft: 6 }}>
                <Text style={{ fontSize: 8, color: catColor[s.categoria] || C.acoes, fontFamily: F.mono, fontWeight: '700' }}>{catLabel[s.categoria] || 'ACAO'}</Text>
              </View>
              <View style={{ backgroundColor: C.accent + '22', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, marginLeft: 4 }}>
                <Text style={{ fontSize: 8, color: C.accent, fontFamily: F.mono, fontWeight: '700' }}>{s.pctAlocacao + '%'}</Text>
              </View>
              <View style={{ flex: 1 }} />
              <Sensitive>
                <Text style={[{ fontSize: 13, color: C.accent, fontFamily: F.mono, fontWeight: '700' }, ps]}>{'R$ ' + fmtInt(s.valor)}</Text>
              </Sensitive>
            </View>
            <Text style={{ fontSize: 11, color: T.color.textPrimary, fontFamily: F.body, marginBottom: 4 }}>
              {'Comprar ' + s.qtdCotas + ' cota' + (s.qtdCotas > 1 ? 's' : '') + ' a R$ ' + fmt(s.precoUnitario)}
            </Text>
            {/* Razoes como chips */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
              {s.razoes.map(function(r, ri) {
                return (
                  <View key={ri} style={{ backgroundColor: C.green + '18', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 9, color: C.green, fontFamily: F.body }}>{r}</Text>
                  </View>
                );
              })}
              {s.riscoCorte ? (
                <View style={{ backgroundColor: C.yellow + '18', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 9, color: C.yellow, fontFamily: F.body }}>Risco de corte</Text>
                </View>
              ) : null}
            </View>
          </View>
        );
      })}

      {/* Candidatos com risco de corte (excluidos) */}
      {plan.candidatosRisco && plan.candidatosRisco.length > 0 ? (
        <View style={{ marginTop: T.space.xs, marginBottom: T.space.xs }}>
          <Text style={{ fontSize: 9, color: C.yellow, fontFamily: F.body }}>
            {plan.candidatosRisco.map(function(r) { return r.ticker; }).join(', ') + ' — excluido' + (plan.candidatosRisco.length > 1 ? 's' : '') + ' por risco de corte'}
          </Text>
        </View>
      ) : null}

      {/* Projecao 12 meses — barras */}
      {proj.length > 0 && plan.rendaAdicionalMes > 0 ? (
        <View style={{ marginTop: T.space.sm }}>
          <Text style={[T.type.kpiLabel, { color: T.color.textMuted, marginBottom: T.space.xs }]}>PROJECAO 12 MESES</Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 36, gap: 2 }}>
            {proj.map(function(p, pi) {
              var hSem = maxProj > 0 ? (p.semReinvestir / maxProj) * 28 + 4 : 4;
              var hCom = maxProj > 0 ? (p.comReinvestir / maxProj) * 28 + 4 : 4;
              return (
                <View key={pi} style={{ flex: 1, alignItems: 'center' }}>
                  <View style={{ width: '100%', height: hCom, borderRadius: 2, backgroundColor: C.accent + '44' }}>
                    <View style={{ width: '100%', height: hSem, borderRadius: 2, backgroundColor: T.color.textMuted + '33', position: 'absolute', bottom: 0 }} />
                  </View>
                </View>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', marginTop: 2 }}>
            {proj.map(function(p, pi) {
              return <Text key={pi} style={{ flex: 1, fontSize: 7, color: T.color.textMuted, fontFamily: F.mono, textAlign: 'center' }}>{p.mes}</Text>;
            })}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: T.space.sm, marginTop: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <View style={{ width: 8, height: 3, backgroundColor: T.color.textMuted + '33', borderRadius: 1 }} />
              <Text style={{ fontSize: 7, color: T.color.textMuted, fontFamily: F.mono }}>Sem reinvestir</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <View style={{ width: 8, height: 3, backgroundColor: C.accent + '44', borderRadius: 1 }} />
              <Text style={{ fontSize: 7, color: T.color.textMuted, fontFamily: F.mono }}>Com reinvestimento</Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* Efeito composto + impacto na carteira */}
      {plan.rendaAdicionalMes > 0 ? (
        <View style={{ backgroundColor: C.accent + '12', borderRadius: T.radius.sm, padding: T.space.sm, marginTop: T.space.sm }}>
          <Sensitive>
            <Text style={[{ fontSize: 12, color: C.accent, fontFamily: F.display, fontWeight: '700', textAlign: 'center', marginBottom: 2 }, ps]}>
              {'+R$ ' + plan.rendaAdicionalMes.toFixed(2) + '/mes de renda extra'}
            </Text>
            <Text style={[{ fontSize: 10, color: T.color.textMuted, fontFamily: F.body, textAlign: 'center' }, ps]}>
              {'+R$ ' + fmtInt(plan.rendaAdicional12m) + ' acumulado em 12 meses (yield medio ' + (plan.yieldMedio || 0).toFixed(1) + '% a.a.)'}
            </Text>
          </Sensitive>
          {plan.concentracaoAntes && plan.concentracaoDepois ? (
            <Text style={{ fontSize: 9, color: T.color.textMuted, fontFamily: F.body, textAlign: 'center', marginTop: 4 }}>
              {'Concentracao top 3: ' + Math.round(plan.concentracaoAntes) + '% \u2192 ' + Math.round(plan.concentracaoDepois) + '%'}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Glass>
  );
}

// ───────── FIRE Milestones ─────────
function FireMilestonesSection(props) {
  var fire = props.fire;
  var ps = usePrivacyStyle();
  if (!fire) return null;
  var ICONS = { seedling: 'leaf-outline', sprout: 'leaf-outline', 'shield-checkmark': 'shield-checkmark-outline', rocket: 'rocket-outline', 'trending-up': 'trending-up-outline', flame: 'flame-outline', trophy: 'trophy-outline', star: 'star-outline', diamond: 'diamond-outline', flag: 'flag-outline' };

  return (
    <Glass padding={T.space.cardPad} style={{ marginBottom: T.space.gap }}>
      <SectionHeader icon="flag-outline" color={C.yellow} title="JORNADA DE INDEPENDENCIA" badge={fire.progressoPct.toFixed(0) + '%'} subtitle="Seu progresso rumo a viver de renda passiva. Cada marco atingido e uma vitoria." />
      <View style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, marginBottom: T.space.xs }}>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: C.yellow, width: Math.min(100, fire.progressoPct) + '%' }} />
      </View>
      <Sensitive>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: T.space.sm }}>
          <Text style={[{ fontSize: 11, color: T.color.textPrimary, fontFamily: F.mono, fontWeight: '600' }, ps]}>
            {'Media atual: R$ ' + fmtInt(fire.rendaAtual) + '/mes'}
          </Text>
          <Text style={[{ fontSize: 11, color: T.color.textMuted, fontFamily: F.mono }, ps]}>
            {'Meta: R$ ' + fmtInt(fire.meta) + '/mes'}
          </Text>
        </View>
      </Sensitive>
      {fire.milestones.map(function(m, idx) {
        var iconName = ICONS[m.icon] || 'ellipse-outline';
        var color = m.atingido ? C.green : T.color.textMuted;
        return (
          <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}>
            <Ionicons name={m.atingido ? 'checkmark-circle' : iconName} size={16} color={color} style={{ width: 24 }} />
            <Text style={{ fontSize: 12, color: m.atingido ? T.color.textPrimary : T.color.textMuted, fontFamily: F.body, flex: 1, textDecorationLine: m.atingido ? 'none' : 'none' }}>
              {m.label}
            </Text>
            <Sensitive>
              <Text style={[{ fontSize: 11, color: m.atingido ? C.green : T.color.textMuted, fontFamily: F.mono }, ps]}>
                {'R$ ' + fmtInt(m.valor)}
              </Text>
            </Sensitive>
            {!m.atingido && m.dataEstimada ? (
              <Text style={{ fontSize: 9, color: T.color.textMuted, fontFamily: F.mono, marginLeft: T.space.xs, width: 55, textAlign: 'right' }}>
                {'~' + m.dataEstimada}
              </Text>
            ) : null}
          </View>
        );
      })}
      {fire.proximo ? (
        <View style={{ backgroundColor: C.yellow + '12', borderRadius: T.radius.sm, padding: T.space.sm, marginTop: T.space.sm }}>
          <Text style={{ fontSize: 11, color: C.yellow, fontFamily: F.body, textAlign: 'center' }}>
            {'Proximo: ' + fire.proximo.label + ' (' + fmtInt(fire.proximo.valor) + '/mes)' + (fire.proximo.dataEstimada ? '  ~' + fire.proximo.dataEstimada : '')}
          </Text>
        </View>
      ) : null}
      <TouchableOpacity activeOpacity={0.7} onPress={function() { if (props.navigation) props.navigation.navigate('Mais', { screen: 'ConfigMeta' }); }}
        style={{ marginTop: T.space.xs, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4 }}>
        <Ionicons name="settings-outline" size={11} color={C.accent} />
        <Text style={{ fontSize: 10, color: C.accent, fontFamily: F.body }}>
          {'Meta atual: R$ ' + fmtInt(fire.meta) + '/mes. Toque pra alterar.'}
        </Text>
      </TouchableOpacity>
    </Glass>
  );
}

// ForecastSection removida — a projecao 12 meses completa fica na tab Renda (RendaHomeScreen).
// Evita duplicacao de informacao com visualizacoes diferentes.

// ───────── Mini tool card ─────────
function MiniTool(props) {
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={props.onPress} style={{ flex: 1 }}>
      <Glass padding={T.space.md} style={{ alignItems: 'center', gap: T.space.xs }}>
        <View style={{ width: 36, height: 36, borderRadius: T.radius.sm, backgroundColor: props.color + '22', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={props.icon} size={18} color={props.color} />
        </View>
        <Text style={{ fontSize: 11, color: T.color.textPrimary, fontFamily: F.body, fontWeight: '600', textAlign: 'center' }}>{props.title}</Text>
      </Glass>
    </TouchableOpacity>
  );
}

// ═══════════ TELA PRINCIPAL ═══════════
export default function AcoesScreen(props) {
  var navigation = props.navigation;
  var user = useAuth().user;
  var income = useIncome();
  var carteira = useCarteira();
  var a = useAnalytics();
  var store = useAppStore();
  var _refreshing = useState(false); var refreshing = _refreshing[0]; var setRefreshing = _refreshing[1];

  // Trigger analytics refresh on focus (respeita cache)
  useFocusEffect(useCallback(function() {
    a.refresh();
  }, [user, carteira.selectedPortfolio]));

  var onRefresh = function() {
    setRefreshing(true);
    store.refreshAll().then(function() {
      setRefreshing(false);
    }).catch(function() { setRefreshing(false); });
  };


  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: T.space.md }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: T.color.textPrimary, fontFamily: F.display }}>Estrategias</Text>
      </View>

      <HeroPraCrescer data={a.potencial} loading={a.loading} navigation={navigation} />
      <AutopilotSection plan={a.autopilot} />
      <CoveredCallsSection suggestions={a.ccSuggestions} loading={a.loading && !a.ccSuggestions} navigation={navigation} />
      <IncomeXraySection xray={a.xray} navigation={navigation} />
      <IncomeCoverageSection coverage={a.coverage} navigation={navigation} />
      <CutRiskSection risks={a.cutRisks} />
      <SnowballSection snowball={a.snowball} />
      <FireMilestonesSection fire={a.fire} navigation={navigation} />

      <Text style={[T.type.kpiLabel, { color: T.color.textMuted, marginBottom: T.space.xs, marginTop: T.space.sm }]}>FERRAMENTAS</Text>
      <View style={{ flexDirection: 'row', gap: T.space.gap, marginBottom: T.space.gap }}>
        <MiniTool icon="rocket-outline" color={C.accent} title="Gerador de Renda" onPress={function() { navigation.navigate('GeradorRenda'); }} />
        <MiniTool icon="business-outline" color={C.fiis} title="Simulador FII" onPress={function() { navigation.navigate('SimuladorFII'); }} />
      </View>
      <View style={{ flexDirection: 'row', gap: T.space.gap, marginBottom: T.space.gap }}>
        <MiniTool icon="calendar-outline" color={C.green} title="Calendario" onPress={function() { navigation.navigate('CalendarioRenda'); }} />
        <MiniTool icon="options-outline" color={C.yellow} title="Opcoes" onPress={function() { navigation.navigate('Opcoes'); }} />
      </View>
      <View style={{ height: T.space.xl }} />
    </ScrollView>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.color.bg },
  content: { padding: T.space.screenPad },
});
