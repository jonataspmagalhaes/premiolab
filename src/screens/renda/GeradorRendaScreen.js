// GeradorRendaScreen — Gerador de renda reverso.
// Usuario define meta de renda mensal + prazo + aporte. App calcula mix
// sugerido (FII tijolo/papel/venda coberta/RF) e roadmap de aportes.

import React from 'react';
var useState = React.useState;
var useEffect = React.useEffect;
var useCallback = React.useCallback;
var useRef = React.useRef;
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Dimensions, PanResponder, ActivityIndicator, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { C, F, SIZE } from '../../theme';
import { Glass } from '../../components';
import { useAuth } from '../../contexts/AuthContext';
import Sensitive, { usePrivacyStyle } from '../../components/Sensitive';
import { buildIncomeForecast } from '../../services/incomeForecastService';

var W = Dimensions.get('window').width;

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtInt(v) {
  return Math.round(v || 0).toLocaleString('pt-BR');
}

// ═══════════ SLIDER ═══════════
function Slider(props) {
  var value = props.value;
  var min = props.min || 0;
  var max = props.max || 100;
  var step = props.step || 1;
  var onValueChange = props.onValueChange;
  var color = props.color || C.accent;

  var layoutRef = useRef({ x: 0, width: W - SIZE.padding * 2 - 40 });
  var propsRef = useRef({ min: min, max: max, step: step, onValueChange: onValueChange });
  propsRef.current = { min: min, max: max, step: step, onValueChange: onValueChange };

  var pct = max > min ? (value - min) / (max - min) : 0;
  var thumbX = pct * layoutRef.current.width;

  function handleTouch(pageX) {
    var p = propsRef.current;
    var localX = pageX - layoutRef.current.x;
    var newPct = Math.max(0, Math.min(1, localX / (layoutRef.current.width || 1)));
    var raw = p.min + newPct * (p.max - p.min);
    var stepped = Math.round(raw / p.step) * p.step;
    p.onValueChange(Math.max(p.min, Math.min(p.max, stepped)));
  }

  var panRef = useRef(PanResponder.create({
    onStartShouldSetPanResponder: function() { return true; },
    onMoveShouldSetPanResponder: function() { return true; },
    onPanResponderGrant: function(evt) { handleTouch(evt.nativeEvent.pageX); },
    onPanResponderMove: function(evt) { handleTouch(evt.nativeEvent.pageX); },
  }));

  function onLayout(evt) {
    layoutRef.current = { x: evt.nativeEvent.layout.x, width: evt.nativeEvent.layout.width };
    if (evt.target && evt.target.measure) {
      evt.target.measure(function(fx, fy, w, h, px) { layoutRef.current = { x: px, width: w }; });
    }
  }

  return (
    <View
      style={{ height: 36, justifyContent: 'center' }}
      onLayout={onLayout}
      ref={function(r) { if (r) r.measure(function(fx, fy, w, h, px) { layoutRef.current = { x: px, width: w }; }); }}
      {...panRef.current.panHandlers}
    >
      <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: color, width: (pct * 100) + '%' }} />
      </View>
      <View style={{
        position: 'absolute', left: Math.max(0, thumbX - 10), top: 8,
        width: 20, height: 20, borderRadius: 10, backgroundColor: color,
        borderWidth: 3, borderColor: '#fff',
      }} />
    </View>
  );
}

// Mix sugerido por perfil
var PERFIS = [
  {
    id: 'conservador',
    label: 'Conservador',
    desc: 'Menos risco, mais previsibilidade',
    icon: 'shield-checkmark-outline',
    mix: { fii_papel: 30, fii_tijolo: 10, acao: 5, covered_call: 5, rf: 50 },
    dy: 11,
  },
  {
    id: 'equilibrado',
    label: 'Equilibrado',
    desc: 'Balanceado entre risco e retorno',
    icon: 'scale-outline',
    mix: { fii_papel: 25, fii_tijolo: 25, acao: 15, covered_call: 15, rf: 20 },
    dy: 12,
  },
  {
    id: 'renda_max',
    label: 'Renda Max',
    desc: 'Maximo yield, maior volatilidade',
    icon: 'rocket-outline',
    mix: { fii_papel: 20, fii_tijolo: 15, acao: 20, covered_call: 35, rf: 10 },
    dy: 14.5,
  },
];

var MIX_META = {
  fii_papel: { label: 'FIIs de Papel', color: '#06B6D4', yield: 13 },
  fii_tijolo: { label: 'FIIs de Tijolo', color: '#10B981', yield: 11 },
  acao: { label: 'Acoes Dividendos', color: '#3B82F6', yield: 8 },
  covered_call: { label: 'Venda Coberta', color: '#8B5CF6', yield: 18 },
  rf: { label: 'Renda Fixa', color: '#06B6D4', yield: 10 },
};

// Calcula capital necessario para renda mensal meta dado DY medio
function capitalNecessario(metaMensal, dyAnual) {
  if (dyAnual <= 0) return 0;
  return (metaMensal * 12) / (dyAnual / 100);
}

// Calcula quantos meses ate atingir meta com aporte mensal + capital inicial
function mesesParaMeta(capitalAtual, rendaAtual, metaMensal, aporteMensal, dyAnual) {
  if (rendaAtual >= metaMensal) return 0;
  var capitalMeta = capitalNecessario(metaMensal, dyAnual);
  var capital = capitalAtual;
  var r = dyAnual / 100 / 12;
  var meses = 0;
  while (capital < capitalMeta && meses < 600) {
    capital = capital * (1 + r) + aporteMensal;
    meses++;
  }
  return meses < 600 ? meses : null;
}

// Projecao patrimonial mes a mes
function projetaCapital(capitalInicial, aporteMensal, dyAnual, meses) {
  var r = dyAnual / 100 / 12;
  var data = [capitalInicial];
  var capital = capitalInicial;
  for (var i = 1; i <= meses; i++) {
    capital = capital * (1 + r) + aporteMensal;
    data.push(capital);
  }
  return data;
}

function GrowthChart(props) {
  var data = props.data || [];
  var width = props.width || (W - SIZE.padding * 2 - 32);
  var height = props.height || 120;
  if (data.length < 2) return null;
  var maxVal = 0; var minVal = data[0];
  for (var i = 0; i < data.length; i++) {
    if (data[i] > maxVal) maxVal = data[i];
    if (data[i] < minVal) minVal = data[i];
  }
  var range = maxVal - minVal;
  if (range <= 0) range = 1;
  var padY = 10;
  var pathD = '';
  for (var j = 0; j < data.length; j++) {
    var x = (j / (data.length - 1)) * width;
    var y = padY + (1 - (data[j] - minVal) / range) * (height - padY * 2);
    pathD += (j === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
  }
  var areaD = pathD + ' L' + width + ',' + height + ' L0,' + height + ' Z';
  return (
    <Svg width={width} height={height}>
      <Path d={areaD} fill="rgba(34,197,94,0.15)" />
      <Path d={pathD} stroke="#22c55e" strokeWidth={2} fill="none" />
    </Svg>
  );
}

// ═══════════ TELA PRINCIPAL ═══════════
export default function GeradorRendaScreen(props) {
  var navigation = props.navigation;
  var user = useAuth().user;
  var ps = usePrivacyStyle();

  var _meta = useState(5000); var meta = _meta[0]; var setMeta = _meta[1];
  var _aporte = useState(1500); var aporte = _aporte[0]; var setAporte = _aporte[1];
  var _perfil = useState(1); var perfil = _perfil[0]; var setPerfil = _perfil[1]; // idx em PERFIS

  var _rendaAtual = useState(0); var rendaAtual = _rendaAtual[0]; var setRendaAtual = _rendaAtual[1];
  var _capitalAtual = useState(0); var capitalAtual = _capitalAtual[0]; var setCapitalAtual = _capitalAtual[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];

  useFocusEffect(useCallback(function() {
    if (!user) return;
    setLoading(true);
    buildIncomeForecast(user.id).then(function(fcast) {
      setRendaAtual((fcast && fcast.summary && fcast.summary.mediaProjetada) || 0);
      // Capital = soma dos ativos (aproximado via soma custo byTicker)
      var byT = fcast && fcast.byTicker ? fcast.byTicker : {};
      var totalRenda = 0;
      var tKeys = Object.keys(byT);
      for (var i = 0; i < tKeys.length; i++) totalRenda += byT[tKeys[i]] * 12;
      // Estimar capital com DY do perfil atual
      setCapitalAtual(capitalNecessario(totalRenda / 12, PERFIS[perfil].dy));
      setLoading(false);
    }).catch(function(err) {
      console.warn('GeradorRenda forecast error:', err && err.message);
      setLoading(false);
    });
  }, [user]));

  var perfilAtual = PERFIS[perfil];
  var dy = perfilAtual.dy;
  var capitalMeta = capitalNecessario(meta, dy);
  var faltaCapital = Math.max(0, capitalMeta - capitalAtual);

  var mesesAteMeta = mesesParaMeta(capitalAtual, rendaAtual, meta, aporte, dy);
  var anosMeses = null;
  if (mesesAteMeta != null) {
    var anos = Math.floor(mesesAteMeta / 12);
    var mesesR = mesesAteMeta % 12;
    anosMeses = { anos: anos, meses: mesesR };
  }

  // Projecao para o grafico (ate atingir meta ou 30 anos)
  var projMeses = mesesAteMeta || 360;
  if (projMeses > 360) projMeses = 360;
  var projData = projetaCapital(capitalAtual, aporte, dy, projMeses);

  // Mix em reais
  var mixKeys = Object.keys(perfilAtual.mix);
  var mixBreakdown = mixKeys.map(function(k) {
    var pct = perfilAtual.mix[k];
    var valor = capitalMeta * pct / 100;
    var renda = valor * (MIX_META[k].yield / 100) / 12;
    return { k: k, pct: pct, valor: valor, renda: renda, color: MIX_META[k].color, label: MIX_META[k].label };
  });
  mixBreakdown.sort(function(a, b) { return b.valor - a.valor; });

  return (
    <ScrollView style={st.container} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <TouchableOpacity onPress={function() { navigation.goBack(); }}>
          <Ionicons name="chevron-back" size={28} color={C.accent} />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '800', color: C.text, fontFamily: F.display }}>Gerador de Renda</Text>
      </View>

      {loading ? (
        <View style={{ alignItems: 'center', paddingVertical: 60 }}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      ) : (
        <View>
          <Text style={{ fontSize: 12, color: C.dim, fontFamily: F.body, marginBottom: 16, lineHeight: 18 }}>
            Defina sua meta de renda mensal e veja quanto capital precisa, qual mix seguir e em quanto tempo atinge.
          </Text>

          {/* Meta */}
          <Glass padding={16} style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 1, marginBottom: 4 }}>META MENSAL</Text>
            <Sensitive>
              <Text style={[{ fontSize: 32, fontWeight: '800', color: '#22c55e', fontFamily: F.mono, marginBottom: 8 }, ps]}>{'R$ ' + fmtInt(meta)}</Text>
            </Sensitive>
            <Slider value={meta} min={500} max={50000} step={100} onValueChange={setMeta} color="#22c55e" />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>R$ 500</Text>
              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>R$ 25k</Text>
              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>R$ 50k</Text>
            </View>
          </Glass>

          {/* Aporte */}
          <Glass padding={16} style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 1, marginBottom: 4 }}>APORTE MENSAL</Text>
            <Sensitive>
              <Text style={[{ fontSize: 28, fontWeight: '800', color: C.accent, fontFamily: F.mono, marginBottom: 8 }, ps]}>{'R$ ' + fmtInt(aporte)}</Text>
            </Sensitive>
            <Slider value={aporte} min={0} max={20000} step={100} onValueChange={setAporte} color={C.accent} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>R$ 0</Text>
              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>R$ 20k</Text>
            </View>
          </Glass>

          {/* Perfil */}
          <View style={{ marginBottom: 12 }}>
            <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 1, marginBottom: 8 }}>PERFIL DE RISCO</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {PERFIS.map(function(p, idx) {
                var isActive = perfil === idx;
                return (
                  <TouchableOpacity key={p.id} onPress={function() { setPerfil(idx); }} activeOpacity={0.7}
                    style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: isActive ? C.accent + '22' : 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: isActive ? C.accent + '60' : 'transparent', alignItems: 'center' }}>
                    <Ionicons name={p.icon} size={20} color={isActive ? C.accent : C.dim} />
                    <Text style={{ fontSize: 11, color: isActive ? C.accent : C.text, fontFamily: F.display, fontWeight: '700', marginTop: 4 }}>{p.label}</Text>
                    <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, marginTop: 2, textAlign: 'center' }}>{'DY ~' + p.dy + '%'}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Resultado — capital necessario + tempo */}
          <Glass padding={16} glow="rgba(34,197,94,0.15)" style={{ marginBottom: 12, borderColor: 'rgba(34,197,94,0.25)' }}>
            <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 1, marginBottom: 6 }}>VOCE PRECISA DE</Text>
            <Sensitive>
              <Text style={[{ fontSize: 30, fontWeight: '800', color: '#22c55e', fontFamily: F.mono }, ps]}>{'R$ ' + fmtInt(capitalMeta)}</Text>
              <Text style={[{ fontSize: 12, color: C.sub, fontFamily: F.body, marginBottom: 10 }, ps]}>
                {'investidos em ' + perfilAtual.label.toLowerCase() + ' rendendo ' + dy + '% a.a.'}
              </Text>
            </Sensitive>

            {capitalAtual > 0 ? (
              <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>JA TEM</Text>
                  <Sensitive><Text style={[{ fontSize: 11, color: C.text, fontFamily: F.mono, fontWeight: '700' }, ps]}>{'R$ ' + fmtInt(capitalAtual)}</Text></Sensitive>
                </View>
                <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                  <View style={{ height: 4, borderRadius: 2, backgroundColor: '#22c55e', width: Math.min(100, (capitalAtual / capitalMeta) * 100) + '%' }} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                  <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>{((capitalAtual / capitalMeta) * 100).toFixed(0) + '%'}</Text>
                  <Sensitive><Text style={[{ fontSize: 9, color: C.dim, fontFamily: F.mono }, ps]}>{'falta R$ ' + fmtInt(faltaCapital)}</Text></Sensitive>
                </View>
              </View>
            ) : null}

            {/* Tempo ate meta */}
            {anosMeses ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="time-outline" size={18} color={C.accent} />
                <Text style={{ fontSize: 13, color: C.text, fontFamily: F.body }}>
                  {anosMeses.anos > 0 ? (anosMeses.anos + (anosMeses.anos === 1 ? ' ano' : ' anos')) : ''}
                  {anosMeses.anos > 0 && anosMeses.meses > 0 ? ' e ' : ''}
                  {anosMeses.meses > 0 ? (anosMeses.meses + (anosMeses.meses === 1 ? ' mes' : ' meses')) : ''}
                  {anosMeses.anos === 0 && anosMeses.meses === 0 ? 'Voce ja atingiu!' : ' ate atingir a meta'}
                </Text>
              </View>
            ) : (
              <Text style={{ fontSize: 11, color: C.red, fontFamily: F.body }}>Aumentar aporte — prazo acima de 30 anos</Text>
            )}
          </Glass>

          {/* Grafico crescimento */}
          {projData.length > 1 ? (
            <Glass padding={14} style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 1, marginBottom: 8 }}>PROJECAO DE PATRIMONIO</Text>
              <GrowthChart data={projData} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                <Sensitive><Text style={[{ fontSize: 9, color: C.dim, fontFamily: F.mono }, ps]}>{'R$ ' + fmtInt(projData[0])}</Text></Sensitive>
                <Sensitive><Text style={[{ fontSize: 9, color: '#22c55e', fontFamily: F.mono, fontWeight: '700' }, ps]}>{'R$ ' + fmtInt(projData[projData.length - 1])}</Text></Sensitive>
              </View>
            </Glass>
          ) : null}

          {/* Mix sugerido */}
          <Glass padding={14} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="pie-chart-outline" size={16} color={C.accent} />
              <Text style={{ fontSize: 13, fontFamily: F.display, color: C.text, fontWeight: '700' }}>Mix Sugerido ({perfilAtual.label})</Text>
            </View>
            {mixBreakdown.map(function(m) {
              if (m.pct <= 0) return null;
              return (
                <View key={m.k} style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: m.color }} />
                      <Text style={{ fontSize: 12, color: C.text, fontFamily: F.body, fontWeight: '600' }}>{m.label}</Text>
                      <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>{m.pct + '%'}</Text>
                    </View>
                    <Sensitive><Text style={[{ fontSize: 11, color: C.text, fontFamily: F.mono, fontWeight: '700' }, ps]}>{'R$ ' + fmtInt(m.valor)}</Text></Sensitive>
                  </View>
                  <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                    <View style={{ height: 4, borderRadius: 2, backgroundColor: m.color, width: m.pct + '%' }} />
                  </View>
                  <Sensitive><Text style={[{ fontSize: 9, color: C.dim, fontFamily: F.mono, marginTop: 2 }, ps]}>{'renda mensal ~R$ ' + fmtInt(m.renda)}</Text></Sensitive>
                </View>
              );
            })}
          </Glass>

          {/* Disclaimer */}
          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body, textAlign: 'center', lineHeight: 16, paddingHorizontal: 12, marginBottom: 20 }}>
            Simulacao baseada em DY medio estimado por classe. FIIs sao isentos de IR. Rentabilidade passada nao garante futura. Nao e recomendacao de investimento.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

var st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: SIZE.padding },
});
