// RendaHero — Hero de renda mensal projetada + delta + sparkline 12m + meta.
// Alimenta a Home com o novo foco "renda mensal". Encapsula toda a logica
// para minimizar intrusao em HomeScreen.js.

import React from 'react';
var useState = React.useState;
var useEffect = React.useEffect;
var useRef = React.useRef;
import { View, Text, TouchableOpacity, Dimensions, ActivityIndicator } from 'react-native';
import Svg, { Path, Circle, Rect, Line } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { C, F, SIZE } from '../theme';
import { Glass } from './index';
import Sensitive, { usePrivacyStyle } from './Sensitive';
import { buildIncomeForecast } from '../services/incomeForecastService';

var W = Dimensions.get('window').width;

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtInt(v) {
  return Math.round(v || 0).toLocaleString('pt-BR');
}
function fmtPct(v, d) {
  return (v || 0).toFixed(d != null ? d : 1) + '%';
}

var MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function Sparkline(props) {
  var data = props.data || [];
  var width = props.width || (W - SIZE.padding * 2 - 40);
  var height = props.height || 50;
  if (data.length < 2) return null;
  var maxVal = 0;
  var minVal = data[0];
  for (var i = 0; i < data.length; i++) {
    if (data[i] > maxVal) maxVal = data[i];
    if (data[i] < minVal) minVal = data[i];
  }
  var range = maxVal - minVal;
  if (range <= 0) range = 1;
  var padY = 4;
  var pathD = '';
  var areaD = '';
  for (var j = 0; j < data.length; j++) {
    var x = (j / (data.length - 1)) * width;
    var y = padY + (1 - (data[j] - minVal) / range) * (height - padY * 2);
    pathD += (j === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
  }
  areaD = pathD + ' L' + width + ',' + height + ' L0,' + height + ' Z';
  var lastX = width;
  var lastY = padY + (1 - (data[data.length - 1] - minVal) / range) * (height - padY * 2);
  return (
    <Svg width={width} height={height}>
      <Path d={areaD} fill="rgba(34,197,94,0.15)" />
      <Path d={pathD} stroke="#22c55e" strokeWidth={2} fill="none" />
      <Circle cx={lastX} cy={lastY} r={3} fill="#22c55e" />
    </Svg>
  );
}

function ForecastBars(props) {
  var data = props.data || [];
  var width = props.width || (W - SIZE.padding * 2 - 40);
  var height = props.height || 70;
  if (data.length === 0) return null;
  var maxVal = 0;
  for (var i = 0; i < data.length; i++) if (data[i].total > maxVal) maxVal = data[i].total;
  if (maxVal <= 0) maxVal = 1;
  var bw = Math.floor(width / data.length) - 3;
  var now = new Date();
  return (
    <Svg width={width} height={height}>
      {data.map(function(d, idx) {
        var bh = (d.total / maxVal) * (height - 14);
        if (bh < 1 && d.total > 0) bh = 2;
        var isCurrent = d.mes === now.getMonth() && d.year === now.getFullYear();
        return (
          <Rect
            key={idx}
            x={idx * (bw + 3)}
            y={height - bh - 12}
            width={bw}
            height={bh}
            rx={2}
            fill={isCurrent ? '#22c55e' : C.accent}
            opacity={isCurrent ? 1 : 0.7}
          />
        );
      })}
    </Svg>
  );
}

export default function RendaHero(props) {
  var userId = props.userId;
  var portfolioId = props.portfolioId != null ? props.portfolioId : undefined;
  var metaMensal = props.metaMensal || 0;
  var onPress = props.onPress;
  var ps = usePrivacyStyle();

  var _forecast = useState(null); var forecast = _forecast[0]; var setForecast = _forecast[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _expanded = useState(false); var expanded = _expanded[0]; var setExpanded = _expanded[1];

  useEffect(function() {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    buildIncomeForecast(userId, { portfolioId: portfolioId })
      .then(function(res) { setForecast(res); setLoading(false); })
      .catch(function(err) {
        console.warn('RendaHero forecast error:', err && err.message);
        setLoading(false);
      });
  }, [userId, portfolioId]);

  if (loading) {
    return (
      <Glass padding={22} glow="rgba(34,197,94,0.15)" style={{ marginBottom: 12, borderColor: 'rgba(34,197,94,0.22)' }}>
        <View style={{ alignItems: 'center', paddingVertical: 20 }}>
          <ActivityIndicator size="small" color={C.accent} />
          <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono, marginTop: 8 }}>Calculando renda projetada...</Text>
        </View>
      </Glass>
    );
  }

  if (!forecast) return null;

  var summary = forecast.summary || {};
  var mediaProj = summary.mediaProjetada || 0;
  var currentMonth = summary.currentMonth || 0;
  var lastMonth = summary.lastMonth || 0;
  var delta = summary.deltaMes || 0;
  var deltaColor = delta > 0 ? '#22c55e' : delta < 0 ? C.red : C.dim;
  var deltaIcon = delta > 0 ? 'trending-up' : delta < 0 ? 'trending-down' : 'remove';

  // % do mes ja recebido vs projetado do mes corrente
  var currentProj = 0;
  var monthly = forecast.monthly || [];
  if (monthly.length > 0) currentProj = monthly[0].total;
  var pctRecebido = currentProj > 0 ? Math.min(100, (currentMonth / currentProj) * 100) : 0;

  // Meta
  var pctMeta = metaMensal > 0 ? Math.min(100, (mediaProj / metaMensal) * 100) : 0;

  // Sparkline historico 12m
  var historyMonthly = forecast.historyMonthly || [];
  var sparkData = historyMonthly.map(function(h) { return h.total; });

  // Breakdown por fonte
  var bySource = forecast.bySource || {};

  return (
    <Glass padding={0} glow="rgba(34,197,94,0.18)" style={{ marginBottom: 12, borderColor: 'rgba(34,197,94,0.25)' }}>
      <View style={{ height: 3, borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: '#22c55e' }} />
      <TouchableOpacity activeOpacity={0.85} onPress={function() { setExpanded(!expanded); if (onPress) onPress(); }}>
        <View style={{ padding: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="cash-outline" size={14} color="#22c55e" />
              <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 1, fontWeight: '700' }}>RENDA PROJETADA/MES</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: deltaColor + '22', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
              <Ionicons name={deltaIcon} size={11} color={deltaColor} />
              <Text style={{ fontSize: 10, color: deltaColor, fontFamily: F.mono, fontWeight: '700' }}>{(delta >= 0 ? '+' : '') + delta.toFixed(1) + '%'}</Text>
            </View>
          </View>

          <Sensitive>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 6 }}>
              <Text style={[{ fontSize: 16, color: '#22c55e', fontFamily: F.mono, fontWeight: '700' }, ps]}>R$ </Text>
              <Text style={[{ fontSize: 38, color: '#22c55e', fontFamily: F.mono, fontWeight: '800', lineHeight: 42 }, ps]}>{fmtInt(mediaProj)}</Text>
              <Text style={[{ fontSize: 18, color: '#22c55e', fontFamily: F.mono, fontWeight: '600', opacity: 0.8 }, ps]}>,{(mediaProj % 1).toFixed(2).split('.')[1]}</Text>
            </View>
          </Sensitive>

          <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.body, marginBottom: 14 }}>
            {'media dos proximos 12 meses  ·  total ~R$ ' + fmtInt(summary.totalProjetado || 0) + '/ano'}
          </Text>

          {/* Barra % mes atual recebido */}
          <View style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>RECEBIDO ESTE MES</Text>
              <Sensitive><Text style={[{ fontSize: 10, color: C.sub, fontFamily: F.mono }, ps]}>{'R$ ' + fmt(currentMonth) + ' / ' + fmt(currentProj)}</Text></Sensitive>
            </View>
            <View style={{ height: 5, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3 }}>
              <View style={{ height: 5, borderRadius: 3, backgroundColor: '#22c55e', width: pctRecebido + '%' }} />
            </View>
            <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, textAlign: 'right', marginTop: 2 }}>{pctRecebido.toFixed(0) + '%'}</Text>
          </View>

          {/* Barra meta mensal */}
          {metaMensal > 0 ? (
            <View style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>META MENSAL</Text>
                <Sensitive><Text style={[{ fontSize: 10, color: pctMeta >= 100 ? '#22c55e' : C.accent, fontFamily: F.mono, fontWeight: '700' }, ps]}>{fmtPct(pctMeta, 0) + '  ·  R$ ' + fmtInt(metaMensal)}</Text></Sensitive>
              </View>
              <View style={{ height: 5, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3 }}>
                <View style={{ height: 5, borderRadius: 3, backgroundColor: pctMeta >= 100 ? '#22c55e' : C.accent, width: Math.min(100, pctMeta) + '%' }} />
              </View>
            </View>
          ) : null}

          {/* Sparkline historico 12m */}
          {sparkData.length >= 2 ? (
            <View style={{ marginBottom: 4 }}>
              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, marginBottom: 2 }}>ULTIMOS 12M (real)</Text>
              <Sparkline data={sparkData} />
            </View>
          ) : null}

          {/* Expandido */}
          {expanded ? (
            <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', paddingTop: 14 }}>
              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 1, marginBottom: 8 }}>PROJECAO 12 MESES</Text>
              <ForecastBars data={monthly} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>{MESES_ABREV[monthly[0] ? monthly[0].mes : 0]}</Text>
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>{monthly.length > 0 ? MESES_ABREV[monthly[monthly.length - 1].mes] : ''}</Text>
              </View>

              {/* Breakdown por fonte */}
              <View style={{ marginTop: 14 }}>
                <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 1, marginBottom: 8 }}>POR FONTE (media/mes)</Text>
                {[
                  { k: 'fii', label: 'FIIs', color: C.fiis, val: bySource.fii || 0 },
                  { k: 'acao', label: 'Acoes/ETFs', color: C.acoes, val: bySource.acao || 0 },
                  { k: 'opcao', label: 'Opcoes', color: '#8B5CF6', val: bySource.opcao || 0 },
                  { k: 'rf', label: 'Renda Fixa', color: C.rf, val: bySource.rf || 0 },
                ].map(function(src) {
                  var pct = mediaProj > 0 ? (src.val / mediaProj) * 100 : 0;
                  return (
                    <View key={src.k} style={{ marginBottom: 6 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: src.color }} />
                          <Text style={{ fontSize: 11, color: C.text, fontFamily: F.body }}>{src.label}</Text>
                        </View>
                        <Sensitive><Text style={[{ fontSize: 11, color: C.text, fontFamily: F.mono, fontWeight: '600' }, ps]}>{'R$ ' + fmt(src.val) + '  ·  ' + pct.toFixed(0) + '%'}</Text></Sensitive>
                      </View>
                      <View style={{ height: 3, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
                        <View style={{ height: 3, borderRadius: 2, backgroundColor: src.color, width: Math.min(100, pct) + '%' }} />
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 6 }}>
              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>tocar para ver projecao 12m e breakdown</Text>
              <Ionicons name="chevron-down" size={12} color={C.dim} />
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Glass>
  );
}
