// SnowballCard — Reinvestimento gamificado.
// Mostra R$ recebidos na ultima semana + sugestao de compra (ticker, cotas,
// ganho mensal adicional). Botao 1-clique registra via addOperacao.
// Medidor de aceleracao composta.

import React from 'react';
var useState = React.useState;
var useEffect = React.useEffect;
import { View, Text, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { C, F, SIZE } from '../theme';
import { Glass } from './index';
import Sensitive, { usePrivacyStyle } from './Sensitive';
import { getProventos, addOperacao } from '../services/database';
import { fetchAllFiis } from '../services/fiiStatusInvestService';
import { fetchPrices } from '../services/priceService';
import Toast from 'react-native-toast-message';

var W = Dimensions.get('window').width;

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtInt(v) {
  return Math.round(v || 0).toLocaleString('pt-BR');
}

function parseDateSafe(s) {
  if (!s) return null;
  var d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d;
}

// Calculo simples: renda recebida nos ultimos 7 dias
function rendaUltimaSemana(proventos) {
  var now = new Date();
  var cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  var total = 0;
  for (var i = 0; i < proventos.length; i++) {
    var p = proventos[i];
    var pd = parseDateSafe(p.data_pagamento);
    if (!pd || pd < cutoff || pd > now) continue;
    var v = p.valor_total || ((p.valor_por_cota || 0) * (p.quantidade || 0));
    if (v > 0) total += v;
  }
  return total;
}

// Seleciona um FII com bom DY atual para sugerir reinvestimento
async function escolherFiiReinvest(valorDisponivel) {
  try {
    var all = await fetchAllFiis();
    var arr = (all && all.arr) || [];
    // Filtros: price <= valorDisponivel, DY entre 8-18%, liquidez alta
    var candidatos = [];
    for (var i = 0; i < arr.length; i++) {
      var f = arr[i];
      if (!f.price || f.price > valorDisponivel) continue;
      if (f.dy < 8 || f.dy > 20) continue;
      if ((f.liquidez || 0) < 100000) continue;
      candidatos.push(f);
    }
    // Ordenar por DY desc mas dar preferencia a P/VP < 1
    candidatos.sort(function(a, b) {
      var aScore = a.dy * (a.pvp > 0 && a.pvp < 1 ? 1.2 : 1);
      var bScore = b.dy * (b.pvp > 0 && b.pvp < 1 ? 1.2 : 1);
      return bScore - aScore;
    });
    return candidatos.length > 0 ? candidatos[0] : null;
  } catch (e) { return null; }
}

// Medidor de aceleracao — quanto sua renda cresce ao reinvestir N% dos proventos
function AceleradorGauge(props) {
  var renda = props.renda || 0;
  var aceleracao = props.aceleracao || 0; // porcentagem

  var size = 80;
  var strokeW = 8;
  var radius = (size - strokeW) / 2;
  var circ = 2 * Math.PI * radius;
  var pct = Math.min(1, aceleracao / 50); // 50% e o maximo visual
  var dash = circ * pct;

  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(255,255,255,0.08)" strokeWidth={strokeW} fill="none" />
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke="#22c55e" strokeWidth={strokeW} fill="none"
          strokeDasharray={circ} strokeDashoffset={circ - dash}
          strokeLinecap="round"
          transform={'rotate(-90 ' + (size / 2) + ' ' + (size / 2) + ')'}
        />
      </Svg>
      <View style={{ position: 'absolute', width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 14, color: '#22c55e', fontFamily: F.mono, fontWeight: '800' }}>{'+' + aceleracao.toFixed(0) + '%'}</Text>
        <Text style={{ fontSize: 7, color: C.dim, fontFamily: F.mono }}>SNOWBALL</Text>
      </View>
    </View>
  );
}

export default function SnowballCard(props) {
  var userId = props.userId;
  var rendaAtual = props.rendaAtual || 0; // renda mensal atual projetada
  var ps = usePrivacyStyle();

  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _rendaSemana = useState(0); var rendaSemana = _rendaSemana[0]; var setRendaSemana = _rendaSemana[1];
  var _sugestao = useState(null); var sugestao = _sugestao[0]; var setSugestao = _sugestao[1];
  var _comprando = useState(false); var comprando = _comprando[0]; var setComprando = _comprando[1];

  useEffect(function() {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    getProventos(userId, { limit: 200 }).then(function(res) {
      var pvs = (res && res.data) || [];
      var renda = rendaUltimaSemana(pvs);
      setRendaSemana(renda);
      if (renda > 10) {
        escolherFiiReinvest(renda).then(function(fii) {
          if (fii && fii.price > 0) {
            var cotas = Math.floor(renda / fii.price);
            if (cotas > 0) {
              var rendaMensalAdicional = (fii.dy / 100 / 12) * (cotas * fii.price);
              setSugestao({
                ticker: fii.ticker,
                name: fii.name,
                price: fii.price,
                dy: fii.dy,
                cotas: cotas,
                valor: cotas * fii.price,
                rendaMensalAdicional: rendaMensalAdicional,
              });
            }
          }
          setLoading(false);
        }).catch(function() { setLoading(false); });
      } else {
        setLoading(false);
      }
    }).catch(function(err) {
      console.warn('SnowballCard error:', err && err.message);
      setLoading(false);
    });
  }, [userId]);

  function registrarCompra() {
    if (!userId || !sugestao || comprando) return;
    setComprando(true);
    var hoje = new Date().toISOString().substring(0, 10);
    addOperacao(userId, {
      ticker: sugestao.ticker,
      tipo: 'compra',
      categoria: 'fii',
      quantidade: sugestao.cotas,
      preco: sugestao.price,
      custos: 0,
      corretora: 'Reinvest',
      data: hoje,
      mercado: 'BR',
    }).then(function(res) {
      if (res && !res.error) {
        Toast.show({ type: 'success', text1: 'Compra registrada', text2: sugestao.cotas + ' cotas de ' + sugestao.ticker });
        setSugestao(null);
      } else {
        Toast.show({ type: 'error', text1: 'Erro ao registrar compra' });
      }
      setComprando(false);
    }).catch(function(e) {
      console.warn('SnowballCard addOp error:', e && e.message);
      Toast.show({ type: 'error', text1: 'Erro ao registrar' });
      setComprando(false);
    });
  }

  if (loading) {
    return (
      <Glass padding={14} style={{ marginBottom: 12 }}>
        <ActivityIndicator size="small" color={C.accent} />
      </Glass>
    );
  }
  if (rendaSemana < 10) return null;

  var aceleracaoPct = rendaAtual > 0 && sugestao ? (sugestao.rendaMensalAdicional / rendaAtual) * 100 : 0;

  return (
    <Glass padding={14} style={{ marginBottom: 12, borderColor: 'rgba(34,197,94,0.25)' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Ionicons name="snow-outline" size={16} color="#22c55e" />
        <Text style={{ fontSize: 13, fontFamily: F.display, color: C.text, fontWeight: '700' }}>Snowball</Text>
        <View style={{ backgroundColor: '#22c55e22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 'auto' }}>
          <Text style={{ fontSize: 9, color: '#22c55e', fontFamily: F.mono, fontWeight: '700' }}>REINVESTIMENTO</Text>
        </View>
      </View>

      <Sensitive>
        <Text style={[{ fontSize: 11, color: C.dim, fontFamily: F.body, marginBottom: 2 }, ps]}>Voce recebeu nos ultimos 7 dias</Text>
        <Text style={[{ fontSize: 22, fontWeight: '800', color: '#22c55e', fontFamily: F.mono, marginBottom: 12 }, ps]}>{'R$ ' + fmt(rendaSemana)}</Text>
      </Sensitive>

      {sugestao ? (
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 12 }}>
            <AceleradorGauge renda={rendaAtual} aceleracao={aceleracaoPct} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 }}>SUGESTAO</Text>
              <Text style={{ fontSize: 16, color: C.text, fontFamily: F.mono, fontWeight: '800' }}>{sugestao.ticker}</Text>
              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.body }} numberOfLines={1}>{sugestao.name}</Text>
              <Sensitive>
                <Text style={[{ fontSize: 11, color: C.sub, fontFamily: F.mono, marginTop: 4 }, ps]}>
                  {sugestao.cotas + ' cotas x R$ ' + fmt(sugestao.price)}
                </Text>
                <Text style={[{ fontSize: 11, color: '#22c55e', fontFamily: F.mono, fontWeight: '700' }, ps]}>
                  {'+R$ ' + fmt(sugestao.rendaMensalAdicional) + '/mes'}
                </Text>
              </Sensitive>
            </View>
          </View>

          <TouchableOpacity onPress={registrarCompra} disabled={comprando}
            style={{ marginTop: 10, backgroundColor: '#22c55e', paddingVertical: 10, borderRadius: 8, alignItems: 'center', opacity: comprando ? 0.6 : 1 }}>
            {comprando ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="add-circle-outline" size={16} color="#fff" />
                <Text style={{ fontSize: 12, color: '#fff', fontFamily: F.display, fontWeight: '700' }}>Registrar compra 1-clique</Text>
              </View>
            )}
          </TouchableOpacity>
          <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, textAlign: 'center', marginTop: 4 }}>
            Sugestao baseada em DY x P/VP, nao e recomendacao de investimento.
          </Text>
        </View>
      ) : (
        <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.body }}>Sem sugestao no momento.</Text>
      )}
    </Glass>
  );
}
