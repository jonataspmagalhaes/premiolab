// YoCCard — exibe Yield on Cost real da carteira + crescimento da renda + top growers.
// Pluggavel: passar userId e (opcional) portfolioId.

import React from 'react';
var useState = React.useState;
var useEffect = React.useEffect;
import { View, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, SIZE } from '../theme';
import { Glass } from './index';
import Sensitive, { usePrivacyStyle } from './Sensitive';
import { computeYoC } from '../services/yieldOnCostService';

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtInt(v) {
  return Math.round(v || 0).toLocaleString('pt-BR');
}
function fmtPct(v, d) {
  return (v || 0).toFixed(d != null ? d : 1) + '%';
}

export default function YoCCard(props) {
  var userId = props.userId;
  var portfolioId = props.portfolioId != null ? props.portfolioId : undefined;
  var ps = usePrivacyStyle();

  var _data = useState(null); var data = _data[0]; var setData = _data[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];

  useEffect(function() {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    computeYoC(userId, { portfolioId: portfolioId })
      .then(function(res) { setData(res); setLoading(false); })
      .catch(function(err) {
        console.warn('YoCCard error:', err && err.message);
        setLoading(false);
      });
  }, [userId, portfolioId]);

  if (loading) {
    return (
      <Glass padding={14} style={{ marginBottom: 12 }}>
        <ActivityIndicator size="small" color={C.accent} />
      </Glass>
    );
  }
  if (!data || !data.carteira || data.carteira.custoTotal <= 0) return null;

  var carteira = data.carteira;
  var growth = data.growth;
  var growers = data.topGrowers || [];
  var growthColor = growth.growthPct > 0 ? '#22c55e' : growth.growthPct < 0 ? C.red : C.dim;
  var realColor = growth.realPct > 0 ? '#22c55e' : C.red;

  return (
    <Glass padding={14} style={{ marginBottom: 12, borderColor: 'rgba(34,197,94,0.22)' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Ionicons name="trending-up" size={16} color="#22c55e" />
        <Text style={{ fontSize: 13, fontFamily: F.display, color: C.text, fontWeight: '700' }}>Yield on Cost</Text>
        <View style={{ backgroundColor: '#22c55e22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 'auto' }}>
          <Text style={{ fontSize: 9, color: '#22c55e', fontFamily: F.mono, fontWeight: '700' }}>REAL</Text>
        </View>
      </View>

      {/* YoC da carteira */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(34,197,94,0.08)', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: 'rgba(34,197,94,0.20)' }}>
          <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 }}>YoC CARTEIRA</Text>
          <Text style={{ fontSize: 24, fontWeight: '800', color: '#22c55e', fontFamily: F.mono }}>{fmtPct(carteira.yoc, 2)}</Text>
          <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>ao ano sobre custo</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 12 }}>
          <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 }}>RENDA 12M</Text>
          <Sensitive><Text style={[{ fontSize: 20, fontWeight: '800', color: C.text, fontFamily: F.mono }, ps]}>{'R$ ' + fmtInt(carteira.renda12m)}</Text></Sensitive>
          <Sensitive><Text style={[{ fontSize: 9, color: C.dim, fontFamily: F.mono }, ps]}>{'custo R$ ' + fmtInt(carteira.custoTotal)}</Text></Sensitive>
        </View>
      </View>

      {/* Growth */}
      <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
        <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 1, marginBottom: 6 }}>CRESCIMENTO DA RENDA</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: growthColor, fontFamily: F.mono }}>{(growth.growthPct >= 0 ? '+' : '') + fmtPct(growth.growthPct, 1)}</Text>
          <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.body }}>vs 12m anterior</Text>
        </View>
        <Sensitive>
          <Text style={[{ fontSize: 11, color: C.sub, fontFamily: F.body, marginTop: 2 }, ps]}>
            {'R$ ' + fmtInt(growth.renda12mAnterior) + ' → R$ ' + fmtInt(growth.renda12m)}
          </Text>
        </Sensitive>
        {growth.renda12mAnterior > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' }}>
            <Ionicons name={growth.realPct > 0 ? 'arrow-up' : 'arrow-down'} size={12} color={realColor} />
            <Text style={{ fontSize: 11, color: realColor, fontFamily: F.mono, fontWeight: '700' }}>{(growth.realPct >= 0 ? '+' : '') + fmtPct(growth.realPct, 1)}</Text>
            <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body }}>{'real (desc. IPCA ' + fmtPct(growth.ipca, 1) + ')'}</Text>
          </View>
        ) : null}
      </View>

      {/* Top growers */}
      {growers.length > 0 ? (
        <View>
          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 1, marginBottom: 8 }}>TOP AUMENTOS DE DISTRIBUICAO</Text>
          {growers.map(function(g, idx) {
            var gColor = g.growth > 0 ? '#22c55e' : g.growth < 0 ? C.red : C.dim;
            return (
              <View key={g.ticker} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: idx < growers.length - 1 ? 1 : 0, borderBottomColor: 'rgba(255,255,255,0.04)' }}>
                <View style={{ width: 22, alignItems: 'center' }}>
                  <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, fontWeight: '700' }}>{idx + 1}</Text>
                </View>
                <Text style={{ flex: 1.2, fontSize: 12, color: C.text, fontFamily: F.mono, fontWeight: '600' }}>{g.ticker}</Text>
                <Text style={{ flex: 1, fontSize: 11, color: C.sub, fontFamily: F.mono, textAlign: 'right' }}>{'YoC ' + fmtPct(g.yocAtual, 1)}</Text>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 12, color: gColor, fontFamily: F.mono, fontWeight: '700' }}>{(g.growth >= 0 ? '+' : '') + fmtPct(g.growth, 0)}</Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </Glass>
  );
}
