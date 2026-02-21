import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, Dimensions, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getDashboard, getIndicators, getProfile, upsertPatrimonioSnapshot } from '../../services/database';
import { clearPriceCache } from '../../services/priceService';
import { runDailyCalculation, shouldCalculateToday } from '../../services/indicatorService';
import { runDividendSync, shouldSyncDividends } from '../../services/dividendService';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import { Badge, Logo, Wordmark, InfoTip } from '../../components';
import { LoadingScreen, EmptyState } from '../../components/States';
import InteractiveChart from '../../components/InteractiveChart';

var W = Dimensions.get('window').width;
var PAD = 16;

var P = {
  acao:  { label: 'Ações',  short: 'Ações', color: '#22c55e' },
  fii:   { label: 'FIIs',   short: 'FII', color: '#a855f7' },
  opcao: { label: 'Opções', short: 'OP', color: '#0ea5e9' },
  etf:   { label: 'ETFs',   short: 'ETF', color: '#f59e0b' },
  rf:    { label: 'RF',     short: 'RF', color: '#ec4899' },
};
var PKEYS = ['acao', 'fii', 'opcao', 'etf', 'rf'];

function fmt(v) {
  if (v == null || isNaN(v)) return 'R$ 0,00';
  return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function AlertRow(props) {
  var type = props.type;
  var title = props.title;
  var desc = props.desc;
  var badge = props.badge;
  var onPress = props.onPress;
  var gc = {
    critico: ['#f59e0b', '#ef4444'],
    warning: ['#f59e0b', '#f97316'],
    atencao: ['#f59e0b', '#f97316'],
    ok:      ['#22c55e', '#10b981'],
    info:    ['#0ea5e9', '#a855f7'],
  };
  var icons = { critico: '⚠', warning: '⚡', atencao: '⚡', ok: '✓', info: '◈' };
  var bc = { critico: '#ef4444', warning: '#f59e0b', atencao: '#f59e0b', ok: '#22c55e', info: '#0ea5e9' };
  var colors = gc[type] || gc.info;
  var badgeColor = bc[type] || '#0ea5e9';

  var content = (
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
                <Text style={{ fontSize: 10, fontWeight: '700', color: badgeColor, fontFamily: F.mono, letterSpacing: 0.5 }}>
                  ● {badge}
                </Text>
              </View>
            ) : null}
          </View>
          {desc ? (
            <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', fontFamily: F.body, lineHeight: 18, paddingLeft: 21 }}>
              {desc}
            </Text>
          ) : null}
        </View>
      </LinearGradient>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.8} onPress={onPress}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
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
        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: F.mono, marginTop: 1 }}>
          {qty} un · PM R$ {fmt2(pm)}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {hasPrice ? (
          <>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff', fontFamily: F.mono }}>
              R$ {fmt2(precoAtual)}
            </Text>
            <Text style={{ fontSize: 11, fontWeight: '700', color: varColor, fontFamily: F.mono, marginTop: 2 }}>
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
        <Text style={{ fontSize: 10, fontWeight: '600', color: c + '80', fontFamily: F.mono, marginTop: 1, letterSpacing: 0.5 }}>{diaSemana}</Text>
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
      <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono, letterSpacing: 1, textTransform: 'uppercase' }}>
        {label}
      </Text>
      {subtitle ? (
        <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', fontFamily: F.body, marginTop: 1 }}>{subtitle}</Text>
      ) : null}
      <Text style={{ fontSize: 16, fontWeight: '800', color: c, fontFamily: F.display, marginTop: 6 }}>
        {fmt(value)}
      </Text>
    </GlassCard>
  );
}

function fmtDonut(v) {
  var abs = Math.abs(v || 0);
  var s = v < 0 ? '-' : '';
  return s + Number(abs).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function DonutMini(props) {
  var value = props.value || 0;
  var prevValue = props.prevValue;
  var hasPrev = prevValue != null && prevValue !== undefined;
  var label = props.label || '';
  var color = props.color || C.accent;
  var size = props.size || 80;
  var meta = props.meta;
  var isTotalDonut = props.isTotal;
  var subLines = props.subLines;
  var segments = props.segments; // [{ value, color, label }]

  // tapState: -1 = total atual, -2 = total anterior, 0..N = segment index
  var _tapState = useState(-1);
  var tapState = _tapState[0];
  var setTapState = _tapState[1];

  // ── Triple Ring Chart — concentric rings ──
  var segStroke = 8;
  var outerStroke = 6;
  var innerStroke = 7;
  var gap = 4;

  // Segments ring (outermost) — only if segments provided
  var hasSegments = segments && segments.length > 0;
  var segRadius = (size - segStroke) / 2;
  var segCirc = 2 * Math.PI * segRadius;

  // Filter segments with value > 0 for display
  var activeSegs = [];
  var segTotal = 0;
  if (hasSegments) {
    for (var si = 0; si < segments.length; si++) {
      var sv = Math.abs(segments[si].value || 0);
      segTotal += sv;
      if (sv > 0) {
        activeSegs.push({ value: sv, color: segments[si].color, label: segments[si].label || '', rawValue: segments[si].value || 0 });
      }
    }
  }

  // Build segment arcs
  var segArcs = [];
  if (segTotal > 0) {
    var segAngle = -90;
    for (var sj = 0; sj < activeSegs.length; sj++) {
      var segPct = activeSegs[sj].value / segTotal;
      var segLen = segCirc * segPct;
      var segGapVal = activeSegs.length > 1 ? 3 : 0;
      var segDash = Math.max(segLen - segGapVal, 1);
      segArcs.push({
        color: activeSegs[sj].color,
        dasharray: segDash + ' ' + (segCirc - segDash),
        rotation: segAngle,
        idx: sj,
      });
      segAngle += segPct * 360;
    }
  }

  var prevRadius = hasSegments ? segRadius - segStroke / 2 - gap - outerStroke / 2 : (size - outerStroke) / 2;
  var prevCirc = 2 * Math.PI * prevRadius;
  var curRadius = prevRadius - outerStroke / 2 - gap - innerStroke / 2;
  var curCirc = 2 * Math.PI * curRadius;

  // Dynamic scale: 100% = max(|value|, |prevValue|)
  var absVal = Math.abs(value);
  var absPrev = Math.abs(prevValue || 0);
  var maxRef = Math.max(absVal, absPrev, 1);
  var curPct = Math.min((absVal / maxRef) * 100, 100);
  var prevPct = hasPrev ? Math.min((absPrev / maxRef) * 100, 100) : 0;

  var curOffset = curCirc - (curCirc * curPct / 100);
  var prevOffset = prevCirc - (prevCirc * prevPct / 100);

  // Dynamic colors: green = better month, red = worse month
  var atualMelhor = value >= (prevValue || 0);
  var curColor = atualMelhor ? '#22C55E' : '#EF4444';
  var prevColor = atualMelhor ? '#EF4444' : '#22C55E';

  // Comparison %
  var comparePct = '';
  if (hasPrev && Math.abs(prevValue) > 0) {
    var changePct = ((value - prevValue) / Math.abs(prevValue)) * 100;
    if (changePct > 0) {
      comparePct = '+' + changePct.toFixed(0) + '%';
    } else if (changePct < 0) {
      comparePct = changePct.toFixed(0) + '%';
    } else {
      comparePct = '0%';
    }
  }

  // Center display based on tapState
  var displayValue, displayColor, displayLabel;
  if (tapState >= 0 && tapState < activeSegs.length) {
    // Showing a segment
    displayValue = activeSegs[tapState].rawValue;
    displayColor = activeSegs[tapState].color;
    displayLabel = activeSegs[tapState].label;
  } else if (tapState === -2) {
    // Showing previous month total
    displayValue = prevValue || 0;
    displayColor = prevColor;
    displayLabel = 'Anterior';
  } else {
    // Default: showing current total
    displayValue = value;
    displayColor = curColor;
    displayLabel = '';
  }
  var centerNum = fmtDonut(displayValue);
  var showingSegment = tapState >= 0 && tapState < activeSegs.length;
  var segPctLabel = showingSegment && segTotal > 0 ? (activeSegs[tapState].value / segTotal * 100).toFixed(0) + '%' : '';

  // Tap cycles: total atual → segments → total anterior → total atual
  var onTap = function () {
    if (hasSegments && activeSegs.length > 0) {
      if (tapState === -1) {
        // Go to first segment
        setTapState(0);
      } else if (tapState >= 0 && tapState < activeSegs.length - 1) {
        // Next segment
        setTapState(tapState + 1);
      } else if (tapState >= 0 && tapState === activeSegs.length - 1) {
        // After last segment, go to previous month
        if (hasPrev) {
          setTapState(-2);
        } else {
          setTapState(-1);
        }
      } else {
        // From previous month, back to total
        setTapState(-1);
      }
    } else if (hasPrev) {
      setTapState(tapState === -1 ? -2 : -1);
    }
  };

  var center = size / 2;

  return (
    <View style={{ alignItems: 'center', width: size + 16 }}>
      <Text style={{
        fontSize: 11, color: 'rgba(255,255,255,0.45)', fontFamily: F.mono,
        letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: '600',
        marginBottom: 6, textAlign: 'center',
      }}>{label}</Text>

      <TouchableOpacity activeOpacity={0.7} onPress={onTap}>
        <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
          <Svg width={size} height={size} style={{ position: 'absolute' }}>
            {/* Segments ring (outermost) — category breakdown */}
            {hasSegments ? (
              <SvgCircle
                cx={center} cy={center} r={segRadius}
                stroke="rgba(255,255,255,0.03)"
                strokeWidth={segStroke}
                fill="none"
              />
            ) : null}
            {segArcs.map(function(arc, idx) {
              var isSelected = tapState === arc.idx;
              var isAnySelected = tapState >= 0;
              return (
                <SvgCircle
                  key={'seg' + idx}
                  cx={center} cy={center} r={segRadius}
                  stroke={arc.color}
                  strokeWidth={isSelected ? segStroke + 3 : segStroke}
                  strokeOpacity={isAnySelected ? (isSelected ? 1 : 0.3) : 0.85}
                  fill="none"
                  strokeDasharray={arc.dasharray}
                  rotation={arc.rotation}
                  origin={center + ',' + center}
                />
              );
            })}
            {/* Previous month ring (middle) background */}
            <SvgCircle
              cx={center} cy={center} r={prevRadius}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth={outerStroke}
              fill="none"
            />
            {/* Previous month ring */}
            {prevPct > 0 ? (
              <SvgCircle
                cx={center} cy={center} r={prevRadius}
                stroke={prevColor}
                strokeWidth={outerStroke}
                strokeOpacity={0.7}
                fill="none"
                strokeDasharray={prevCirc}
                strokeDashoffset={prevOffset}
                strokeLinecap="round"
                rotation={-90}
                origin={center + ',' + center}
              />
            ) : null}
            {/* Current month ring (innermost) background */}
            <SvgCircle
              cx={center} cy={center} r={curRadius}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth={innerStroke}
              fill="none"
            />
            {/* Current month ring */}
            {curPct > 0 ? (
              <SvgCircle
                cx={center} cy={center} r={curRadius}
                stroke={curColor}
                strokeWidth={innerStroke}
                strokeOpacity={0.7}
                fill="none"
                strokeDasharray={curCirc}
                strokeDashoffset={curOffset}
                strokeLinecap="round"
                rotation={-90}
                origin={center + ',' + center}
              />
            ) : null}
          </Svg>

          {/* Center value */}
          <View style={{ alignItems: 'center' }}>
            {showingSegment ? (
              <>
                <Text style={{
                  fontSize: 9, fontWeight: '600', color: displayColor, fontFamily: F.mono,
                  marginBottom: 2, textAlign: 'center',
                }}>{displayLabel}</Text>
                <Text style={{
                  fontSize: isTotalDonut ? 16 : 14,
                  fontWeight: '800', color: displayColor, fontFamily: F.mono, textAlign: 'center',
                }}>{centerNum}</Text>
                <Text style={{
                  fontSize: 10, fontWeight: '700', color: displayColor, fontFamily: F.mono,
                  marginTop: 1, opacity: 0.7,
                }}>{segPctLabel}</Text>
              </>
            ) : (
              <>
                <Text style={{
                  fontSize: 9, fontWeight: '600', color: curColor, fontFamily: F.mono,
                  letterSpacing: 1, marginBottom: 2, opacity: 0.7,
                }}>MÊS ATUAL</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                  <Text style={{
                    fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.35)', fontFamily: F.mono,
                  }}>R$</Text>
                  <Text style={{
                    fontSize: isTotalDonut ? 28 : 20,
                    fontWeight: '800', color: curColor, fontFamily: F.display, textAlign: 'center',
                  }}>{fmtDonut(value)}</Text>
                </View>
                {hasPrev ? (
                  <>
                    <Text style={{
                      fontSize: 8, fontWeight: '600', color: prevColor, fontFamily: F.mono,
                      letterSpacing: 0.8, marginTop: 6, marginBottom: 1, opacity: 0.7,
                    }}>MÊS ANTERIOR</Text>
                    <Text style={{
                      fontSize: 14, fontWeight: '600', color: prevColor, fontFamily: F.mono,
                    }}>{fmtDonut(prevValue || 0)}</Text>
                  </>
                ) : null}
                {comparePct ? (
                  <Text style={{
                    fontSize: 16, fontWeight: '800', fontFamily: F.mono, marginTop: 4,
                    color: atualMelhor ? '#22c55e' : '#ef4444',
                  }}>{comparePct}</Text>
                ) : null}
              </>
            )}
          </View>
        </View>
      </TouchableOpacity>

      {/* Ring legend */}
      {hasSegments ? (
        <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontFamily: F.mono, marginTop: 4, textAlign: 'center' }}>
          toque para detalhar
        </Text>
      ) : null}

      {/* Optional sub-lines (e.g. Recebido / A receber) */}
      {subLines && subLines.length > 0 ? (
        <View style={{ alignItems: 'center', marginTop: 2 }}>
          {subLines.map(function (line, idx) {
            if (!line) return null;
            return (
              <Text key={idx} style={{ fontSize: 9, color: line.color || 'rgba(255,255,255,0.3)', fontFamily: F.mono }}>
                {line.text}
              </Text>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function SLabel({ children, right }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <Text style={{
        fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono,
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
          <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', fontFamily: F.mono, marginTop: 2 }}>{sub}</Text>
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
  var _infoModal = useState(null); var infoModal = _infoModal[0]; var setInfoModal = _infoModal[1];
  var _alertsExpanded = useState(false); var alertsExpanded = _alertsExpanded[0]; var setAlertsExpanded = _alertsExpanded[1];
  var _loadError = useState(false); var loadError = _loadError[0]; var setLoadError = _loadError[1];

  var load = async function () {
    if (!user) return;
    setLoadError(false);

    // Sync dividendos ANTES do dashboard para numeros atualizados
    try {
      var profResult = await getProfile(user.id);
      var profile = profResult.data;
      var lastSync = profile && profile.last_dividend_sync ? profile.last_dividend_sync : null;
      if (shouldSyncDividends(lastSync)) {
        await runDividendSync(user.id);
      }
    } catch (e) {
      console.warn('Home dividend sync failed:', e);
    }

    try {
      var result = await getDashboard(user.id);
      setData(result);
    } catch (e) {
      console.warn('Home dashboard load failed:', e);
      setLoadError(true);
    }
    setLoading(false);

    // Save patrimonio snapshot (real market value) for chart history
    if (result && result.patrimonio > 0) {
      var todayISO = new Date().toISOString().substring(0, 10);
      upsertPatrimonioSnapshot(user.id, todayISO, result.patrimonio).catch(function (e) {
        console.warn('Snapshot save failed:', e);
      });
    }

    // Fire-and-forget: trigger indicator calculation if stale
    getIndicators(user.id).then(function(indResult) {
      var indData = indResult.data || [];
      var lastCalc = indData.length > 0 ? indData[0].data_calculo : null;
      if (shouldCalculateToday(lastCalc)) {
        runDailyCalculation(user.id).catch(function(e) {
          console.warn('Home indicator calc failed:', e);
        });
      }
    }).catch(function(e) {
      console.warn('Home indicator check failed:', e);
    });
  };

  useFocusEffect(useCallback(function () { load(); }, [user]));

  var onRefresh = async function () {
    setRefreshing(true);
    clearPriceCache();
    await load();
    setRefreshing(false);
  };

  if (loading) return <View style={st.container}><LoadingScreen /></View>;

  if (loadError) return (
    <View style={st.container}>
      <EmptyState
        icon="!"
        title="Erro ao carregar"
        description="Não foi possível carregar o dashboard. Verifique sua conexão e tente novamente."
        cta="Tentar novamente"
        onCta={function() { setLoading(true); load(); }}
        color={C.red}
      />
    </View>
  );

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
  var opsVenc7d = data.opsVenc7d || 0;
  var opsVenc15d = data.opsVenc15d || 0;
  var opsVenc30d = data.opsVenc30d || 0;
  var meta = data.meta || 6000;
  var positions = data.positions || [];
  var saldos = data.saldos || [];
  var saldoTotal = data.saldoTotal || 0;
  var rendaFixa = data.rendaFixa || [];
  var eventos = data.eventos || [];

  // Mes anterior
  var dividendosMesAnterior = data.dividendosMesAnterior || 0;
  var premiosMesAnterior = data.premiosMesAnterior || 0;
  var rendaTotalMesAnterior = data.rendaTotalMesAnterior || 0;
  var dividendosCatMes = data.dividendosCatMes || { acao: 0, fii: 0, etf: 0 };
  var dividendosCatMesAnt = data.dividendosCatMesAnt || { acao: 0, fii: 0, etf: 0 };
  var dividendosRecebidosMes = data.dividendosRecebidosMes || 0;
  var dividendosAReceberMes = data.dividendosAReceberMes || 0;
  var plMes = data.plMes || 0;
  var plMesAnterior = data.plMesAnterior || 0;
  var plMedia3m = data.plMedia3m || 0;
  var rendaMediaAnual = data.rendaMediaAnual || 0;

  // Ganhos acumulados por categoria (P&L posicoes)
  var ganhosPorCat = { acao: 0, fii: 0, rf: 0, etf: 0 };
  for (var gi = 0; gi < positions.length; gi++) {
    var gPos = positions[gi];
    var gCat = gPos.categoria || 'acao';
    if (gCat !== 'acao' && gCat !== 'fii' && gCat !== 'etf') gCat = 'acao';
    var gPreco = gPos.preco_atual || gPos.pm;
    ganhosPorCat[gCat] += (gPreco - gPos.pm) * gPos.quantidade;
  }
  // RF ganho = rendimento estimado mensal
  ganhosPorCat.rf = rfRendaMensal;
  var ganhosTotal = ganhosPorCat.acao + ganhosPorCat.fii + ganhosPorCat.etf + ganhosPorCat.rf;

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
  var topGainers = sorted.filter(function (p) { return (p.change_day || 0) > 0; }).slice(0, 5);
  var topLosers = sorted.filter(function (p) { return (p.change_day || 0) < 0; }).sort(function (a, b) { return (a.change_day || 0) - (b.change_day || 0); }).slice(0, 5);

  // Proventos pagos hoje
  var proventosHoje = data.proventosHoje || [];

  // Build por_corretora lookup from positions
  var posCorretoras = {};
  for (var pci = 0; pci < positions.length; pci++) {
    var pcTk = (positions[pci].ticker || '').toUpperCase();
    if (positions[pci].por_corretora) {
      posCorretoras[pcTk] = positions[pci].por_corretora;
    }
  }

  // Alerts
  var alerts = [];
  var phDetailData = null;
  if (proventosHoje.length > 0) {
    var phByTicker = {};
    var phTotal = 0;
    // Build detailed breakdown: ticker → { total, tipo, vpc, corretoras: { name → { qty, valor } } }
    var phDetail = {};
    for (var phi = 0; phi < proventosHoje.length; phi++) {
      var phItem = proventosHoje[phi];
      var phTk = (phItem.ticker || '?').toUpperCase();
      var phVpc = phItem.valor_por_cota || 0;
      var phQty = phItem.quantidade || 0;
      var phVal = phVpc * phQty;
      var phTipo = phItem.tipo_provento || phItem.tipo || 'dividendo';
      if (!phByTicker[phTk]) phByTicker[phTk] = 0;
      phByTicker[phTk] += phVal;
      phTotal += phVal;
      if (!phDetail[phTk]) {
        phDetail[phTk] = { total: 0, tipo: phTipo, qty: 0, vpc: phVpc, corretoras: {} };
        // Distribute by por_corretora from positions
        var pcMap = posCorretoras[phTk];
        if (pcMap) {
          var pcKeys = Object.keys(pcMap);
          for (var pck = 0; pck < pcKeys.length; pck++) {
            var corrName = pcKeys[pck];
            var corrQty = pcMap[corrName] || 0;
            if (corrQty > 0) {
              phDetail[phTk].corretoras[corrName] = { qty: corrQty, valor: corrQty * phVpc };
            }
          }
        }
      }
      phDetail[phTk].total += phVal;
      phDetail[phTk].qty += phQty;
    }
    phDetailData = { tickers: phDetail, total: phTotal };
    var phTickers = Object.keys(phByTicker);
    var phDesc = '';
    for (var phd = 0; phd < phTickers.length; phd++) {
      if (phd > 0) phDesc += ', ';
      phDesc += phTickers[phd] + ' R$ ' + fmt2(phByTicker[phTickers[phd]]);
    }
    alerts.push({
      type: 'ok',
      title: 'Dividendo sendo pago hoje',
      desc: phDesc + ' · Total ' + fmt(phTotal),
      badge: 'HOJE',
      detailType: 'proventos',
    });
  }
  if (opsVenc7d > 0) {
    alerts.push({
      type: 'critico',
      title: opsVenc7d + (opsVenc7d === 1 ? ' opção vence' : ' opções vencem') + ' em 7 dias',
      desc: 'Ação urgente: rolar, exercer ou encerrar.',
      badge: 'URGENTE',
    });
  }
  if (opsVenc15d > 0) {
    alerts.push({
      type: 'warning',
      title: opsVenc15d + (opsVenc15d === 1 ? ' opção vence' : ' opções vencem') + ' em 8-15 dias',
      desc: 'Considere rolar ou encerrar em breve.',
      badge: 'ATENÇÃO',
    });
  }
  if (opsVenc30d > 0) {
    alerts.push({
      type: 'info',
      title: opsVenc30d + (opsVenc30d === 1 ? ' opção vence' : ' opções vencem') + ' em 16-30 dias',
      desc: 'Monitore o theta decay e avalie rolagem.',
      badge: 'INFO',
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Logo size={52} />
            <Wordmark fontSize={32} />
          </View>
          <View style={st.syncBadge}>
            <Text style={{ fontSize: 10, color: '#22c55e', fontWeight: '600', fontFamily: F.mono }}>
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={st.heroLabel}>PATRIMÔNIO TOTAL</Text>
                <TouchableOpacity onPress={function() { setInfoModal({ title: 'Patrimônio Total', text: 'Soma de ações, FIIs, ETFs, opções e renda fixa a preços de mercado.' }); }}>
                  <Text style={{ fontSize: 13, color: C.accent }}>ⓘ</Text>
                </TouchableOpacity>
              </View>
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
                          fontSize: 11, fontWeight: '700', fontFamily: F.mono, letterSpacing: 0.5,
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
                    height={120}
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
                        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: F.body }}>{P[k].short}</Text>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.6)', fontFamily: F.mono }}>{pct.toFixed(0)}%</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </View>
        </GlassCard>

        {/* RENDA DO MÊS — donuts + meta */}
        <GlassCard glow="rgba(108,92,231,0.10)">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: '600' }}>RENDA DO MÊS</Text>
            <TouchableOpacity onPress={function() { setInfoModal({ title: 'Renda do Mês', text: 'P&L de opções (prêmios - recompras) + dividendos/JCP + juros RF no mês. Opções mostra o P&L líquido, podendo ser negativo em meses com recompra.' }); }}>
              <Text style={{ fontSize: 13, color: C.accent }}>ⓘ</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.20)', fontFamily: F.mono, letterSpacing: 0.5, textAlign: 'center', marginTop: -6, marginBottom: 10 }}>
            {new Date().toLocaleString('pt-BR', { month: 'short' }).toUpperCase() + ' ' + new Date().getFullYear() + '  ·  ATUAL vs ANTERIOR'}
          </Text>

          <View style={{ alignItems: 'center', marginBottom: 16 }}>
            <DonutMini
              label="Total"
              value={rendaTotalMes}
              prevValue={rendaTotalMesAnterior}
              color={C.accent}
              size={220}
              meta={meta}
              isTotal={true}
              segments={[
                { value: plMes, color: P.opcao.color, label: 'P&L Opções' },
                { value: dividendosCatMes.acao, color: P.acao.color, label: 'Div. Ações' },
                { value: dividendosCatMes.fii, color: P.fii.color, label: 'Rend. FIIs' },
                { value: dividendosCatMes.etf, color: P.etf.color, label: 'Div. ETFs' },
                { value: rfRendaMensal, color: C.rf, label: 'Renda Fixa' },
              ]}
            />
          </View>

          {/* Discriminação por tipo */}
          <View style={{ gap: 6, marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: P.opcao.color }} />
                <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body }}>P&L Opções</Text>
              </View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: plMes >= 0 ? '#22c55e' : '#ef4444', fontFamily: F.mono }}>
                {'R$ ' + fmt(plMes)}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: P.acao.color }} />
                <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body }}>Dividendos Ações</Text>
              </View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: dividendosCatMes.acao > 0 ? '#22c55e' : C.dim, fontFamily: F.mono }}>
                {'R$ ' + fmt(dividendosCatMes.acao)}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: P.fii.color }} />
                <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body }}>Rendimentos FIIs</Text>
              </View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: dividendosCatMes.fii > 0 ? '#22c55e' : C.dim, fontFamily: F.mono }}>
                {'R$ ' + fmt(dividendosCatMes.fii)}
              </Text>
            </View>
            {dividendosCatMes.etf > 0 ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: P.etf.color }} />
                  <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body }}>Dividendos ETFs</Text>
                </View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#22c55e', fontFamily: F.mono }}>
                  {'R$ ' + fmt(dividendosCatMes.etf)}
                </Text>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.rf }} />
                <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body }}>Renda Fixa</Text>
              </View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: rfRendaMensal > 0 ? '#22c55e' : C.dim, fontFamily: F.mono }}>
                {'R$ ' + fmt(rfRendaMensal)}
              </Text>
            </View>
            <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 2 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: C.text, fontFamily: F.display, fontWeight: '700' }}>Total do Mês</Text>
              <Text style={{ fontSize: 14, fontWeight: '800', color: rendaTotalMes >= 0 ? '#22c55e' : '#ef4444', fontFamily: F.mono }}>
                {'R$ ' + fmt(rendaTotalMes)}
              </Text>
            </View>
          </View>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: 14 }} />

          {/* META MENSAL inline */}
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
                <Text style={{ fontSize: 14, color: rendaMediaAnual >= meta ? '#22c55e' : 'rgba(255,255,255,0.45)', fontFamily: F.mono, fontWeight: '700' }}>
                  {'Média ' + new Date().getFullYear() + ': R$ ' + fmt(rendaMediaAnual) + '/mês'}
                </Text>
                <TouchableOpacity onPress={function() { Alert.alert('Média Anual', 'Média calculada com base nos meses completos do ano. O mês atual (incompleto) não entra no denominador para não distorcer o resultado.'); }}>
                  <Text style={{ fontSize: 12, color: C.accent }}>ⓘ</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{
                fontSize: 22, fontWeight: '800', fontFamily: F.mono,
                color: metaPct >= 100 ? '#22c55e' : metaPct >= 50 ? '#f59e0b' : C.accent,
              }}>{metaPct.toFixed(0)}%</Text>
              <Text style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', fontFamily: F.mono, letterSpacing: 0.5, marginTop: 2 }}>DA META</Text>
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
        </GlassCard>

        {/* GANHOS ACUMULADOS — donuts por categoria */}
        <GlassCard glow="rgba(34,197,94,0.06)">
          <SLabel right={
            <Text style={{ fontSize: 10, color: ganhosTotal >= 0 ? '#22c55e' : '#ef4444', fontFamily: F.mono, fontWeight: '700' }}>
              {ganhosTotal >= 0 ? '+' : ''}{fmt(ganhosTotal)}
            </Text>
          }>GANHOS ACUMULADOS</SLabel>
          <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.20)', fontFamily: F.mono, letterSpacing: 0.5, textAlign: 'center', marginTop: -6, marginBottom: 10 }}>
            {new Date().toLocaleString('pt-BR', { month: 'short' }).toUpperCase() + ' ' + new Date().getFullYear() + '  ·  ATUAL vs ANTERIOR'}
          </Text>

          <View style={{ alignItems: 'center', marginBottom: 16 }}>
            <DonutMini
              label="Total"
              value={ganhosTotal}
              prevValue={dividendosCatMesAnt.acao + dividendosCatMesAnt.fii + dividendosCatMesAnt.etf}
              color={ganhosTotal >= 0 ? '#22c55e' : '#ef4444'}
              size={220}
              isTotal={true}
              segments={[
                { value: ganhosPorCat.acao, color: P.acao.color, label: 'Ações' },
                { value: ganhosPorCat.fii, color: P.fii.color, label: 'FIIs' },
                { value: ganhosPorCat.etf, color: P.etf.color, label: 'ETFs' },
                { value: ganhosPorCat.rf, color: P.rf.color, label: 'Renda Fixa' },
              ]}
            />
          </View>

          {/* Discriminação por categoria */}
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: P.acao.color }} />
                <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body }}>Ações</Text>
              </View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: ganhosPorCat.acao >= 0 ? '#22c55e' : '#ef4444', fontFamily: F.mono }}>
                {'R$ ' + fmt(ganhosPorCat.acao)}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: P.fii.color }} />
                <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body }}>FIIs</Text>
              </View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: ganhosPorCat.fii >= 0 ? '#22c55e' : '#ef4444', fontFamily: F.mono }}>
                {'R$ ' + fmt(ganhosPorCat.fii)}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: P.etf.color }} />
                <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body }}>ETFs</Text>
              </View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: ganhosPorCat.etf >= 0 ? '#22c55e' : '#ef4444', fontFamily: F.mono }}>
                {'R$ ' + fmt(ganhosPorCat.etf)}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: P.rf.color }} />
                <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body }}>Renda Fixa</Text>
              </View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: ganhosPorCat.rf >= 0 ? '#22c55e' : '#ef4444', fontFamily: F.mono }}>
                {'R$ ' + fmt(ganhosPorCat.rf)}
              </Text>
            </View>
            <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 2 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: C.text, fontFamily: F.display, fontWeight: '700' }}>Total Acumulado</Text>
              <Text style={{ fontSize: 14, fontWeight: '800', color: ganhosTotal >= 0 ? '#22c55e' : '#ef4444', fontFamily: F.mono }}>
                {'R$ ' + fmt(ganhosTotal)}
              </Text>
            </View>
          </View>
        </GlassCard>

        {/* KPI BAR — resumo compacto horizontal */}
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.035)', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
            <Text style={{ fontSize: 9, color: C.textSecondary, fontFamily: F.mono, letterSpacing: 0.5 }}>RENT. MÊS</Text>
            <Text style={{ fontSize: 15, fontWeight: '800', color: rentabilidadeMes > 1 ? C.green : C.yellow, fontFamily: F.mono, marginTop: 2 }}>
              {rentabilidadeMes.toFixed(2) + '%'}
            </Text>
          </View>
          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.035)', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
            <Text style={{ fontSize: 9, color: C.textSecondary, fontFamily: F.mono, letterSpacing: 0.5 }}>POSIÇÕES</Text>
            <Text style={{ fontSize: 15, fontWeight: '800', color: C.text, fontFamily: F.mono, marginTop: 2 }}>
              {positions.length + rendaFixa.length}
            </Text>
          </View>
          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.035)', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
            <Text style={{ fontSize: 9, color: C.textSecondary, fontFamily: F.mono, letterSpacing: 0.5 }}>OPÇÕES</Text>
            <Text style={{ fontSize: 15, fontWeight: '800', color: P.opcao.color, fontFamily: F.mono, marginTop: 2 }}>
              {opsAtivas}
            </Text>
            {opsVenc7d > 0 ? (
              <Text style={{ fontSize: 9, color: C.red, fontFamily: F.mono }}>
                {opsVenc7d + ' venc. 7d'}
              </Text>
            ) : null}
          </View>
        </View>

        {/* ALERTAS */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: '600' }}>ALERTAS</Text>
            <TouchableOpacity onPress={function() { setInfoModal({ title: 'Alertas', text: 'Avisos automáticos sobre vencimentos, opções descobertas e eventos da carteira.' }); }}>
              <Text style={{ fontSize: 13, color: C.accent }}>ⓘ</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono }}>
            {alerts.length} {alerts.length === 1 ? 'novo' : 'novos'}
          </Text>
        </View>
        {(function() {
          var criticalAlerts = [];
          var infoAlerts = [];
          for (var ai = 0; ai < alerts.length; ai++) {
            var al = alerts[ai];
            if (al.type === 'critico' || al.type === 'warning' || al.detailType) {
              criticalAlerts.push(al);
            } else {
              infoAlerts.push(al);
            }
          }
          var showCollapse = alerts.length > 2 && infoAlerts.length > 0;
          var visibleAlerts = showCollapse && !alertsExpanded ? criticalAlerts : alerts;

          return (
            <View>
              {visibleAlerts.map(function(a, i) {
                var alertOnPress = null;
                if (a.detailType === 'proventos' && phDetailData) {
                  alertOnPress = function() {
                    setInfoModal({ title: 'Proventos Pagos Hoje', detailType: 'proventos', detail: phDetailData });
                  };
                }
                return <AlertRow key={i} type={a.type} title={a.title} desc={a.desc} badge={a.badge} onPress={alertOnPress} />;
              })}
              {showCollapse ? (
                <TouchableOpacity onPress={function() { setAlertsExpanded(!alertsExpanded); }}
                  style={{ alignItems: 'center', paddingVertical: 6, marginBottom: 8 }}>
                  <Text style={{ fontSize: 11, color: C.accent, fontFamily: F.body, fontWeight: '600' }}>
                    {alertsExpanded ? 'Mostrar menos' : infoAlerts.length + (infoAlerts.length === 1 ? ' alerta' : ' alertas') + ' info ▾'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })()}

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


        <View style={{ height: SIZE.tabBarHeight + 80 }} />
      </ScrollView>

      {/* FAB */}
      <View style={st.fabWrap}>
        {fabOpen ? (
          <View style={{ marginBottom: 12, gap: 8, alignItems: 'flex-end' }}>
            {[
              { label: '💰 Operação', color: P.acao.color, screen: 'AddOperacao' },
              { label: '⚡ Opção', color: P.opcao.color, screen: 'AddOpcao' },
              { label: '◈ Provento', color: P.fii.color, screen: 'AddProvento' },
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

      <Modal visible={infoModal !== null} animationType="fade" transparent={true}
        onRequestClose={function() { setInfoModal(null); }}>
        <TouchableOpacity activeOpacity={1} onPress={function() { setInfoModal(null); }}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <TouchableOpacity activeOpacity={1}
            style={{ backgroundColor: '#12121e', borderRadius: 14, padding: 20, maxWidth: 380, width: '100%', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
            <Text style={{ fontSize: 13, color: C.text, fontFamily: F.display, fontWeight: '700', marginBottom: 10 }}>
              {infoModal && infoModal.title || ''}
            </Text>
            {infoModal && infoModal.detailType === 'proventos' && infoModal.detail ? (
              <View style={{ gap: 12 }}>
                {Object.keys(infoModal.detail.tickers).map(function(tk) {
                  var tkData = infoModal.detail.tickers[tk];
                  var tipoLabel = tkData.tipo === 'jcp' ? 'JCP' : tkData.tipo === 'rendimento' ? 'Rendimento' : 'Dividendo';
                  var corrKeys = Object.keys(tkData.corretoras);
                  return (
                    <View key={tk} style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 12 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: C.text, fontFamily: F.display }}>{tk}</Text>
                          <View style={{ backgroundColor: '#22c55e18', borderWidth: 1, borderColor: '#22c55e40', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 9, fontWeight: '700', color: '#22c55e', fontFamily: F.mono }}>{tipoLabel}</Text>
                          </View>
                        </View>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: '#22c55e', fontFamily: F.mono }}>
                          {'R$ ' + fmt(tkData.total)}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 10, color: C.sub, fontFamily: F.mono, marginBottom: 4 }}>
                        {tkData.qty + ' cotas × R$ ' + fmt(tkData.vpc) + '/cota'}
                      </Text>
                      {corrKeys.length > 0 ? (
                        <View style={{ gap: 4, marginTop: 4 }}>
                          <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', fontFamily: F.mono, letterSpacing: 0.8 }}>POR CORRETORA</Text>
                          {corrKeys.map(function(corr) {
                            var corrData = tkData.corretoras[corr];
                            return (
                              <View key={corr} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                  <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.body }}>{corr}</Text>
                                  <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontFamily: F.mono }}>
                                    {'(' + corrData.qty + ' cotas)'}
                                  </Text>
                                </View>
                                <Text style={{ fontSize: 12, fontWeight: '700', color: '#22c55e', fontFamily: F.mono }}>
                                  {'R$ ' + fmt(corrData.valor)}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
                <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.text, fontFamily: F.display }}>Total</Text>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#22c55e', fontFamily: F.mono }}>
                    {'R$ ' + fmt(infoModal.detail.total)}
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body, lineHeight: 18 }}>
                {infoModal && infoModal.text || ''}
              </Text>
            )}
            <TouchableOpacity onPress={function() { setInfoModal(null); }}
              style={{ marginTop: 14, alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 8, borderRadius: 8, backgroundColor: C.accent }}>
              <Text style={{ fontSize: 12, color: C.text, fontFamily: F.mono, fontWeight: '600' }}>Fechar</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
    fontSize: 12, color: 'rgba(255,255,255,0.35)',
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
  fabWrap: {
    position: 'absolute', bottom: SIZE.tabBarHeight + 16, right: PAD,
    alignItems: 'flex-end',
  },
});
