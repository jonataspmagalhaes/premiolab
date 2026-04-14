// GeradorRendaScreen — Gerador de renda com dados reais da carteira.
// Usa positions, RF, saldos, forecast e analytics do store pra dar
// recomendacoes concretas e personalizadas.

import React from 'react';
var useState = React.useState;
var useMemo = React.useMemo;
var useEffect = React.useEffect;
var useRef = React.useRef;
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Dimensions, PanResponder, ActivityIndicator } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { C, F, SIZE } from '../../theme';
import { Glass } from '../../components';
import { useCarteira, useFinancas, useAnalytics, useIncome, useAppStore } from '../../contexts/AppStoreContext';
import Sensitive, { usePrivacyStyle } from '../../components/Sensitive';
import { fetchAllFiis } from '../../services/fiiStatusInvestService';
import AsyncStorage from '@react-native-async-storage/async-storage';

var GERADOR_STORAGE_KEY = '@premiolab:gerador_renda_state';

var W = Dimensions.get('window').width;

function fmtInt(v) {
  return Math.round(v || 0).toLocaleString('pt-BR');
}
function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

// ═══════════ MINI CHART (area) ═══════════
function RendaChart(props) {
  var data = props.data || [];
  var width = props.width || (W - SIZE.padding * 2 - 32);
  var height = props.height || 100;
  if (data.length < 2) return null;
  var maxVal = 0;
  for (var i = 0; i < data.length; i++) {
    if (data[i].renda > maxVal) maxVal = data[i].renda;
  }
  if (maxVal <= 0) maxVal = 1;
  var padY = 8;
  var pathD = '';
  for (var j = 0; j < data.length; j++) {
    var x = (j / (data.length - 1)) * width;
    var y = padY + (1 - data[j].renda / maxVal) * (height - padY * 2);
    pathD += (j === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
  }
  var areaD = pathD + ' L' + width + ',' + height + ' L0,' + height + ' Z';
  return (
    <Svg width={width} height={height}>
      <Path d={areaD} fill={C.accent + '20'} />
      <Path d={pathD} stroke={C.accent} strokeWidth={2} fill="none" />
    </Svg>
  );
}

// Perfis de risco
var PERFIS = [
  {
    id: 'conservador', label: 'Conservador', icon: 'shield-checkmark-outline',
    mix: { fii: 40, acao: 10, rf: 45, caixa: 5 },
    dyAlvo: 10,
  },
  {
    id: 'equilibrado', label: 'Equilibrado', icon: 'scale-outline',
    mix: { fii: 40, acao: 25, rf: 25, caixa: 10 },
    dyAlvo: 11,
  },
  {
    id: 'renda_max', label: 'Renda Max', icon: 'rocket-outline',
    mix: { fii: 35, acao: 35, rf: 15, caixa: 15 },
    dyAlvo: 13,
  },
];

var CLASSE_META = {
  fii: { label: 'FIIs', color: C.fiis, icon: 'home-outline', dyRef: 11 },
  acao: { label: 'Acoes', color: C.acoes, icon: 'trending-up-outline', dyRef: 6 },
  rf: { label: 'Renda Fixa', color: '#06B6D4', icon: 'document-text-outline', dyRef: 10 },
  caixa: { label: 'Caixa', color: '#8888aa', icon: 'wallet-outline', dyRef: 0 },
};

// ═══════════ TELA PRINCIPAL ═══════════
export default function GeradorRendaScreen(props) {
  var navigation = props.navigation;
  var ps = usePrivacyStyle();

  // Dados reais do store
  var carteira = useCarteira();
  var positions = carteira.positions || [];
  var rfData = carteira.rf || [];
  var financas = useFinancas();
  var saldos = financas.saldos || [];
  var analytics = useAnalytics();
  var dashboard = analytics.dashboard;
  var income = useIncome();
  var forecast = income.forecast;
  var store = useAppStore();
  var profile = store.profile;

  // FIIs sugeridos (StatusInvest)
  var _fiiList = useState(null); var fiiList = _fiiList[0]; var setFiiList = _fiiList[1];
  var _fiiLoading = useState(false); var fiiLoading = _fiiLoading[0]; var setFiiLoading = _fiiLoading[1];

  var _meta = useState(profile && profile.meta_mensal ? profile.meta_mensal : 5000);
  var meta = _meta[0]; var setMeta = _meta[1];
  var _aporte = useState(1500); var aporte = _aporte[0]; var setAporte = _aporte[1];
  var _perfil = useState(1); var perfil = _perfil[0]; var setPerfil = _perfil[1];
  var _loaded = useState(false); var loaded = _loaded[0]; var setLoaded = _loaded[1];

  // Carregar estado salvo
  useEffect(function() {
    AsyncStorage.getItem(GERADOR_STORAGE_KEY).then(function(raw) {
      if (raw) {
        try {
          var s = JSON.parse(raw);
          if (s.meta) setMeta(s.meta);
          if (s.aporte != null) setAporte(s.aporte);
          if (s.perfil != null) setPerfil(s.perfil);
        } catch (e) {}
      }
      setLoaded(true);
    }).catch(function() { setLoaded(true); });
  }, []);

  // Persistir quando muda
  useEffect(function() {
    if (!loaded) return;
    AsyncStorage.setItem(GERADOR_STORAGE_KEY, JSON.stringify({ meta: meta, aporte: aporte, perfil: perfil })).catch(function() {});
  }, [meta, aporte, perfil, loaded]);

  // ── Dados reais computados (mesma fonte da Carteira) ──
  var dados = useMemo(function() {
    // Patrimonio por categoria — direto das positions enriquecidas do store
    var porClasse = { fii: 0, acao: 0, etf: 0, stock_int: 0, rf: 0, caixa: 0 };
    for (var i = 0; i < positions.length; i++) {
      var pos = positions[i];
      if ((pos.quantidade || 0) <= 0) continue;
      var preco = pos.preco_atual;
      if (preco == null || preco <= 0) continue; // so usar positions com preco real
      var val = preco * pos.quantidade;
      var cat = pos.categoria || 'acao';
      if (porClasse[cat] != null) {
        porClasse[cat] += val;
      } else {
        porClasse.acao += val; // fallback
      }
    }
    // RF e Caixa do store
    for (var r = 0; r < rfData.length; r++) {
      porClasse.rf += rfData[r].valor_aplicado || 0;
    }
    for (var s = 0; s < saldos.length; s++) {
      porClasse.caixa += saldos[s].saldo || 0;
    }

    // Agrupar pra exibicao: FII, Acoes (acao+etf+stock_int), RF, Caixa
    var agrupado = {
      fii: porClasse.fii,
      acao: porClasse.acao + porClasse.etf + porClasse.stock_int,
      rf: porClasse.rf,
      caixa: porClasse.caixa,
    };

    var patrimonioTotal = agrupado.fii + agrupado.acao + agrupado.rf + agrupado.caixa;

    // Renda por fonte (do forecast — mesma fonte da tab Renda)
    var rendaPorFonte = { fii: 0, acao: 0, rf: 0 };
    if (forecast && forecast.bySource) {
      rendaPorFonte.fii = forecast.bySource.fii || 0;
      rendaPorFonte.acao = (forecast.bySource.acao || 0) + (forecast.bySource.opcao || 0);
      rendaPorFonte.rf = forecast.bySource.rf || 0;
    }
    var rendaAtual = rendaPorFonte.fii + rendaPorFonte.acao + rendaPorFonte.rf;

    // DY real
    var investido = agrupado.fii + agrupado.acao + agrupado.rf;
    var dyReal = investido > 0 ? (rendaAtual * 12 / investido) * 100 : 0;

    // DY por classe
    var dyFii = agrupado.fii > 0 ? (rendaPorFonte.fii * 12 / agrupado.fii) * 100 : 0;
    var dyAcao = agrupado.acao > 0 ? (rendaPorFonte.acao * 12 / agrupado.acao) * 100 : 0;
    var dyRf = agrupado.rf > 0 ? (rendaPorFonte.rf * 12 / agrupado.rf) * 100 : 0;

    return {
      porClasse: agrupado,
      patrimonioTotal: patrimonioTotal,
      rendaPorFonte: rendaPorFonte,
      rendaAtual: rendaAtual,
      dyReal: dyReal,
      dyFii: dyFii,
      dyAcao: dyAcao,
      dyRf: dyRf,
      investido: investido,
    };
  }, [positions, rfData, saldos, forecast]);

  var perfilAtual = PERFIS[perfil];
  var dy = perfilAtual.dyAlvo;

  // Capital necessario pra meta
  var capitalMeta = dy > 0 ? (meta * 12) / (dy / 100) : 0;
  var faltaCapital = Math.max(0, capitalMeta - dados.patrimonioTotal);
  var jaAtingiu = dados.rendaAtual >= meta;

  // Composicao atual vs ideal
  var composicao = useMemo(function() {
    var classes = ['fii', 'acao', 'rf', 'caixa'];
    var items = [];
    for (var ci = 0; ci < classes.length; ci++) {
      var cls = classes[ci];
      var valorAtual = dados.porClasse[cls] || 0;
      var pctAtual = dados.patrimonioTotal > 0 ? (valorAtual / dados.patrimonioTotal) * 100 : 0;
      var pctIdeal = perfilAtual.mix[cls] || 0;
      var valorIdeal = capitalMeta * pctIdeal / 100;
      var gap = valorIdeal - valorAtual;
      var dyClasse = cls === 'fii' ? dados.dyFii : cls === 'acao' ? dados.dyAcao : cls === 'rf' ? dados.dyRf : 0;
      items.push({
        classe: cls,
        label: CLASSE_META[cls].label,
        color: CLASSE_META[cls].color,
        icon: CLASSE_META[cls].icon,
        valorAtual: valorAtual,
        pctAtual: pctAtual,
        pctIdeal: pctIdeal,
        valorIdeal: valorIdeal,
        gap: gap,
        dyClasse: dyClasse,
        rendaMensal: cls === 'caixa' ? 0 : valorIdeal * (CLASSE_META[cls].dyRef / 100) / 12,
      });
    }
    return items;
  }, [dados, perfilAtual, capitalMeta]);

  // ── Buscar FIIs reais quando gap de FII eh positivo ──
  var gapFii = 0;
  for (var gfi = 0; gfi < composicao.length; gfi++) {
    if (composicao[gfi].classe === 'fii') { gapFii = composicao[gfi].gap; break; }
  }

  useEffect(function() {
    if (gapFii <= 1000) { setFiiList(null); return; }
    setFiiLoading(true);
    fetchAllFiis().then(function(result) {
      setFiiList(result);
      setFiiLoading(false);
    }).catch(function() { setFiiLoading(false); });
  }, [gapFii > 1000]);

  // Tickers de FII que o usuario ja tem
  var fiiJaTem = {};
  for (var fjt = 0; fjt < positions.length; fjt++) {
    if (positions[fjt].categoria === 'fii' && (positions[fjt].quantidade || 0) > 0) {
      fiiJaTem[(positions[fjt].ticker || '').toUpperCase()] = true;
    }
  }

  // Sugestoes de FIIs concretos
  var fiiSugestoes = useMemo(function() {
    if (!fiiList || !fiiList.arr || gapFii <= 1000) return [];
    var candidatos = [];
    for (var fi = 0; fi < fiiList.arr.length; fi++) {
      var f = fiiList.arr[fi];
      if (!f.ticker || f.price <= 0) continue;
      if (f.dy < 8) continue;              // DY minimo 8%
      if (f.pvp > 1.1) continue;           // P/VP maximo 1.1 (com desconto)
      if (f.liquidez < 500000) continue;    // Liquidez minima 500k/dia
      if (fiiJaTem[f.ticker]) continue;     // Nao sugerir o que ja tem
      candidatos.push(f);
    }
    // Ordenar por DY decrescente
    candidatos.sort(function(a, b) { return b.dy - a.dy; });
    // Top 5 com calculo de cotas e renda
    var top = candidatos.slice(0, 5);
    var result = [];
    var valorRestante = gapFii;
    for (var ti = 0; ti < top.length; ti++) {
      var fii = top[ti];
      var alocFii = Math.min(valorRestante / (top.length - ti), valorRestante);
      var cotas = Math.floor(alocFii / fii.price);
      if (cotas <= 0) cotas = 1;
      var valorInv = cotas * fii.price;
      var rendaMes = valorInv * (fii.dy / 100) / 12;
      result.push({
        ticker: fii.ticker,
        name: fii.name,
        price: fii.price,
        dy: fii.dy,
        pvp: fii.pvp,
        segment: fii.segment,
        cotas: cotas,
        valorInvestido: valorInv,
        rendaMensal: rendaMes,
      });
      valorRestante -= valorInv;
      if (valorRestante <= 0) break;
    }
    return result;
  }, [fiiList, gapFii, fiiJaTem]);

  // Roadmap de proximos passos
  var roadmap = useMemo(function() {
    var passos = [];

    // 1. Se tem caixa ociosa, alocar primeiro
    if (dados.porClasse.caixa > 500) {
      // Encontrar classe com maior deficit
      var maiorGap = null;
      for (var rg = 0; rg < composicao.length; rg++) {
        if (composicao[rg].classe === 'caixa') continue;
        if (composicao[rg].gap > 0) {
          if (!maiorGap || composicao[rg].gap > maiorGap.gap) maiorGap = composicao[rg];
        }
      }
      if (maiorGap) {
        var valorAlocar = Math.min(dados.porClasse.caixa * 0.8, maiorGap.gap);
        var rendaGanha = valorAlocar * (CLASSE_META[maiorGap.classe].dyRef / 100) / 12;
        passos.push({
          prioridade: 1,
          icon: 'flash-outline',
          color: C.green,
          titulo: 'Alocar caixa livre em ' + maiorGap.label,
          descricao: 'R$ ' + fmtInt(valorAlocar) + ' do caixa geraria +R$ ' + fmtInt(rendaGanha) + '/mes',
          impacto: rendaGanha,
        });
      }
    }

    // 2. Proximo aporte — distribuir proporcionalmente aos gaps
    if (aporte > 0) {
      var gapsPositivos = [];
      var totalGap = 0;
      for (var rg2 = 0; rg2 < composicao.length; rg2++) {
        if (composicao[rg2].classe === 'caixa') continue;
        if (composicao[rg2].gap > 0) {
          gapsPositivos.push(composicao[rg2]);
          totalGap += composicao[rg2].gap;
        }
      }
      if (gapsPositivos.length > 0) {
        var distrib = [];
        for (var rg3 = 0; rg3 < gapsPositivos.length; rg3++) {
          var pctGap = totalGap > 0 ? gapsPositivos[rg3].gap / totalGap : 1 / gapsPositivos.length;
          var valorAporte = Math.round(aporte * pctGap);
          if (valorAporte >= 50) {
            distrib.push(gapsPositivos[rg3].label + ' R$ ' + fmtInt(valorAporte));
          }
        }
        if (distrib.length > 0) {
          var rendaAporte = aporte * (dy / 100) / 12;
          passos.push({
            prioridade: 2,
            icon: 'add-circle-outline',
            color: C.accent,
            titulo: 'Proximo aporte de R$ ' + fmtInt(aporte),
            descricao: distrib.join(' + ') + ' (+R$ ' + fmtInt(rendaAporte) + '/mes)',
            impacto: rendaAporte,
          });
        }
      }
    }

    // 3. Objetivo de medio prazo
    var classeComMaiorGap = null;
    for (var rg4 = 0; rg4 < composicao.length; rg4++) {
      if (composicao[rg4].classe === 'caixa') continue;
      if (composicao[rg4].gap > 5000) {
        if (!classeComMaiorGap || composicao[rg4].gap > classeComMaiorGap.gap) {
          classeComMaiorGap = composicao[rg4];
        }
      }
    }
    if (classeComMaiorGap) {
      var mesesPraGap = aporte > 0 ? Math.ceil(classeComMaiorGap.gap / aporte) : 0;
      passos.push({
        prioridade: 3,
        icon: 'flag-outline',
        color: C.yellow,
        titulo: 'Equilibrar ' + classeComMaiorGap.label,
        descricao: 'Faltam R$ ' + fmtInt(classeComMaiorGap.gap) + (mesesPraGap > 0 ? ' (~' + mesesPraGap + ' meses de aporte)' : ''),
        impacto: 0,
      });
    }

    return passos;
  }, [dados, composicao, aporte, dy]);

  // Projecao de renda mensal (12 meses)
  var projecaoRenda = useMemo(function() {
    var pontos = [];
    var capital = dados.patrimonioTotal;
    var rMensal = dy / 100 / 12;
    for (var m = 0; m <= 12; m++) {
      var renda = capital * rMensal;
      pontos.push({ mes: m, renda: renda, capital: capital });
      capital = capital + aporte + (capital * rMensal);
    }
    return pontos;
  }, [dados.patrimonioTotal, aporte, dy]);

  // Tempo ate meta
  var tempoAteMeta = useMemo(function() {
    if (jaAtingiu) return { atingiu: true, meses: 0 };
    var capital = dados.patrimonioTotal;
    var r = dy / 100 / 12;
    var meses = 0;
    while (meses < 600) {
      var rendaMes = capital * r;
      if (rendaMes >= meta) return { atingiu: false, meses: meses };
      capital = capital * (1 + r) + aporte;
      meses++;
    }
    return { atingiu: false, meses: null };
  }, [dados.patrimonioTotal, meta, aporte, dy, jaAtingiu]);

  var tempoStr = '';
  if (tempoAteMeta.atingiu) {
    tempoStr = 'Voce ja atingiu!';
  } else if (tempoAteMeta.meses != null) {
    var anos = Math.floor(tempoAteMeta.meses / 12);
    var mesesR = tempoAteMeta.meses % 12;
    if (anos > 0) tempoStr += anos + (anos === 1 ? ' ano' : ' anos');
    if (anos > 0 && mesesR > 0) tempoStr += ' e ';
    if (mesesR > 0) tempoStr += mesesR + (mesesR === 1 ? ' mes' : ' meses');
    tempoStr += ' ate a meta';
  }

  return (
    <ScrollView style={st.container} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <TouchableOpacity onPress={function() { navigation.goBack(); }}>
          <Ionicons name="chevron-back" size={28} color={C.accent} />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '800', color: C.text, fontFamily: F.display }}>Gerador de Renda</Text>
      </View>

      {/* Situacao atual */}
      <Glass padding={16} glow="rgba(108,92,231,0.1)" style={{ marginBottom: 12, borderColor: C.accent + '30' }}>
        <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 1, marginBottom: 8 }}>SUA SITUACAO ATUAL</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, marginBottom: 2 }}>PATRIMONIO</Text>
            <Sensitive><Text style={[{ fontSize: 18, fontWeight: '800', color: C.text, fontFamily: F.mono }, ps]}>{'R$ ' + fmtInt(dados.patrimonioTotal)}</Text></Sensitive>
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, marginBottom: 2 }}>RENDA MENSAL</Text>
            <Sensitive><Text style={[{ fontSize: 18, fontWeight: '800', color: C.green, fontFamily: F.mono }, ps]}>{'R$ ' + fmtInt(dados.rendaAtual)}</Text></Sensitive>
          </View>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="pulse-outline" size={12} color={C.accent} />
            <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>{'DY real: ' + dados.dyReal.toFixed(1) + '% a.a.'}</Text>
          </View>
          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>{'Investido: R$ ' + fmtInt(dados.investido)}</Text>
        </View>

        {/* Composicao atual — barras */}
        <View style={{ flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 10 }}>
          {composicao.map(function(c) {
            if (c.pctAtual <= 0) return null;
            return <View key={c.classe} style={{ width: c.pctAtual + '%', height: 6, backgroundColor: c.color }} />;
          })}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
          {composicao.map(function(c) {
            if (c.valorAtual <= 0) return null;
            return (
              <View key={c.classe} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.color }} />
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>{c.label + ' ' + Math.round(c.pctAtual) + '%'}</Text>
              </View>
            );
          })}
        </View>
      </Glass>

      {/* Meta + Aporte */}
      <Glass padding={16} style={{ marginBottom: 12 }}>
        <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 1, marginBottom: 4 }}>META MENSAL</Text>
        <Sensitive>
          <Text style={[{ fontSize: 28, fontWeight: '800', color: C.green, fontFamily: F.mono, marginBottom: 8 }, ps]}>{'R$ ' + fmtInt(meta)}</Text>
        </Sensitive>
        <Slider value={meta} min={500} max={200000} step={500} onValueChange={setMeta} color={C.green} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
          <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>R$ 500</Text>
          <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>R$ 100k</Text>
          <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>R$ 200k</Text>
        </View>
      </Glass>

      <Glass padding={16} style={{ marginBottom: 12 }}>
        <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 1, marginBottom: 4 }}>APORTE MENSAL</Text>
        <Sensitive>
          <Text style={[{ fontSize: 24, fontWeight: '800', color: C.accent, fontFamily: F.mono, marginBottom: 8 }, ps]}>{'R$ ' + fmtInt(aporte)}</Text>
        </Sensitive>
        <Slider value={aporte} min={0} max={100000} step={500} onValueChange={setAporte} color={C.accent} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
          <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>R$ 0</Text>
          <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>R$ 50k</Text>
          <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>R$ 100k</Text>
        </View>
      </Glass>

      {/* Perfil de risco */}
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
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, marginTop: 2 }}>{'DY ~' + p.dyAlvo + '%'}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Resultado — capital necessario */}
      <Glass padding={16} glow="rgba(34,197,94,0.12)" style={{ marginBottom: 12, borderColor: 'rgba(34,197,94,0.2)' }}>
        <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 1, marginBottom: 6 }}>CAPITAL NECESSARIO</Text>
        <Sensitive>
          <Text style={[{ fontSize: 28, fontWeight: '800', color: C.green, fontFamily: F.mono }, ps]}>{'R$ ' + fmtInt(capitalMeta)}</Text>
          <Text style={[{ fontSize: 11, color: C.sub, fontFamily: F.body, marginBottom: 8 }, ps]}>
            {'pra gerar R$ ' + fmtInt(meta) + '/mes com DY ' + dy + '% a.a.'}
          </Text>
        </Sensitive>

        {/* Barra de progresso */}
        <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>PROGRESSO</Text>
            <Sensitive><Text style={[{ fontSize: 11, color: C.text, fontFamily: F.mono, fontWeight: '700' }, ps]}>{Math.min(100, (dados.patrimonioTotal / capitalMeta * 100)).toFixed(0) + '%'}</Text></Sensitive>
          </View>
          <View style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3 }}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: jaAtingiu ? C.green : C.accent, width: Math.min(100, (dados.patrimonioTotal / capitalMeta) * 100) + '%' }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <Sensitive><Text style={[{ fontSize: 9, color: C.dim, fontFamily: F.mono }, ps]}>{'Tem R$ ' + fmtInt(dados.patrimonioTotal)}</Text></Sensitive>
            <Sensitive><Text style={[{ fontSize: 9, color: faltaCapital > 0 ? C.red : C.green, fontFamily: F.mono }, ps]}>{faltaCapital > 0 ? 'Falta R$ ' + fmtInt(faltaCapital) : 'Meta atingida!'}</Text></Sensitive>
          </View>
        </View>

        {/* Tempo */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name={jaAtingiu ? 'checkmark-circle' : 'time-outline'} size={18} color={jaAtingiu ? C.green : C.accent} />
          <Text style={{ fontSize: 13, color: C.text, fontFamily: F.body }}>
            {tempoStr || 'Aumentar aporte — prazo acima de 30 anos'}
          </Text>
        </View>

        {/* DY real vs perfil */}
        {dados.dyReal > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: dados.dyReal >= dy ? C.green + '12' : C.yellow + '12', borderRadius: 6, padding: 8 }}>
            <Ionicons name={dados.dyReal >= dy ? 'checkmark-circle-outline' : 'alert-circle-outline'} size={14} color={dados.dyReal >= dy ? C.green : C.yellow} />
            <Text style={{ fontSize: 10, color: dados.dyReal >= dy ? C.green : C.yellow, fontFamily: F.body, flex: 1 }}>
              {dados.dyReal >= dy
                ? 'Seu DY real (' + dados.dyReal.toFixed(1) + '%) ja supera o perfil ' + perfilAtual.label.toLowerCase() + ' (' + dy + '%)'
                : 'Seu DY real (' + dados.dyReal.toFixed(1) + '%) esta abaixo do perfil ' + perfilAtual.label.toLowerCase() + ' (' + dy + '%). Ajustar mix pode acelerar.'}
            </Text>
          </View>
        ) : null}
      </Glass>

      {/* Composicao: Atual vs Ideal */}
      <Glass padding={14} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Ionicons name="pie-chart-outline" size={16} color={C.accent} />
          <Text style={{ fontSize: 13, fontFamily: F.display, color: C.text, fontWeight: '700' }}>Atual vs Ideal</Text>
        </View>
        {composicao.map(function(c) {
          var isExcesso = c.gap < -1000;
          var isFalta = c.gap > 1000;
          return (
            <View key={c.classe} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.color }} />
                  <Text style={{ fontSize: 12, color: C.text, fontFamily: F.body, fontWeight: '600' }}>{c.label}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>{Math.round(c.pctAtual) + '% \u2192 ' + c.pctIdeal + '%'}</Text>
                  {isFalta ? (
                    <Text style={{ fontSize: 9, color: C.red, fontFamily: F.mono }}>{'+ R$ ' + fmtInt(c.gap)}</Text>
                  ) : isExcesso ? (
                    <Text style={{ fontSize: 9, color: C.yellow, fontFamily: F.mono }}>excesso</Text>
                  ) : (
                    <Text style={{ fontSize: 9, color: C.green, fontFamily: F.mono }}>OK</Text>
                  )}
                </View>
              </View>
              {/* Barra dupla: atual (solida) + ideal (outline) */}
              <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                <View style={{ height: 4, borderRadius: 2, backgroundColor: c.color, width: Math.min(100, c.pctAtual) + '%' }} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                <Sensitive><Text style={[{ fontSize: 9, color: C.dim, fontFamily: F.mono }, ps]}>{'R$ ' + fmtInt(c.valorAtual)}</Text></Sensitive>
                <Sensitive><Text style={[{ fontSize: 9, color: C.dim, fontFamily: F.mono }, ps]}>{'meta R$ ' + fmtInt(c.valorIdeal)}</Text></Sensitive>
              </View>
            </View>
          );
        })}
      </Glass>

      {/* FIIs sugeridos — quando gap de FII eh positivo */}
      {gapFii > 1000 ? (
        <Glass padding={14} style={{ marginBottom: 12, borderColor: C.fiis + '30' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Ionicons name="home-outline" size={16} color={C.fiis} />
            <Text style={{ fontSize: 13, fontFamily: F.display, color: C.text, fontWeight: '700' }}>FIIs Sugeridos</Text>
            <View style={{ flex: 1 }} />
            <Sensitive><Text style={[{ fontSize: 10, color: C.fiis, fontFamily: F.mono }, ps]}>{'gap R$ ' + fmtInt(gapFii)}</Text></Sensitive>
          </View>
          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body, marginBottom: 10, lineHeight: 15 }}>
            FIIs com DY acima de 8%, P/VP abaixo de 1.1 e boa liquidez que voce ainda nao tem.
          </Text>

          {fiiLoading ? (
            <ActivityIndicator size="small" color={C.fiis} style={{ paddingVertical: 20 }} />
          ) : fiiSugestoes.length > 0 ? (
            <View>
              {fiiSugestoes.map(function(fii, idx) {
                return (
                  <View key={idx} style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 10, marginBottom: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                      <Text style={{ fontSize: 13, color: C.text, fontFamily: F.mono, fontWeight: '700' }}>{fii.ticker}</Text>
                      <View style={{ backgroundColor: C.fiis + '22', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, marginLeft: 6 }}>
                        <Text style={{ fontSize: 8, color: C.fiis, fontFamily: F.mono, fontWeight: '700' }}>{'DY ' + fii.dy.toFixed(1) + '%'}</Text>
                      </View>
                      <View style={{ backgroundColor: fii.pvp < 1 ? C.green + '22' : C.yellow + '22', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, marginLeft: 4 }}>
                        <Text style={{ fontSize: 8, color: fii.pvp < 1 ? C.green : C.yellow, fontFamily: F.mono, fontWeight: '700' }}>{'P/VP ' + fii.pvp.toFixed(2)}</Text>
                      </View>
                      <View style={{ flex: 1 }} />
                      <Sensitive><Text style={[{ fontSize: 12, color: C.fiis, fontFamily: F.mono, fontWeight: '700' }, ps]}>{'R$ ' + fmtInt(fii.valorInvestido)}</Text></Sensitive>
                    </View>
                    <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body, marginBottom: 2 }} numberOfLines={1}>{fii.name}</Text>
                    <Sensitive>
                      <Text style={[{ fontSize: 10, color: C.dim, fontFamily: F.mono }, ps]}>
                        {fii.cotas + ' cota' + (fii.cotas > 1 ? 's' : '') + ' x R$ ' + fmt(fii.price) + ' \u2192 +R$ ' + fmt(fii.rendaMensal) + '/mes'}
                      </Text>
                    </Sensitive>
                  </View>
                );
              })}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={function() { navigation.navigate('SimuladorFII', { preselectedFiis: fiiSugestoes.map(function(f) { return f.ticker; }) }); }}
                style={{ backgroundColor: C.fiis + '18', borderRadius: 8, padding: 10, marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Ionicons name="calculator-outline" size={14} color={C.fiis} />
                <Text style={{ fontSize: 12, color: C.fiis, fontFamily: F.display, fontWeight: '700' }}>Simular no Simulador FII</Text>
                <Ionicons name="arrow-forward" size={14} color={C.fiis} />
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body, textAlign: 'center', paddingVertical: 10 }}>
              Nenhum FII encontrado com os criterios (DY 8%+, P/VP 1.1, liquidez 500k+)
            </Text>
          )}
        </Glass>
      ) : null}

      {/* Roadmap de proximos passos */}
      {roadmap.length > 0 ? (
        <Glass padding={14} style={{ marginBottom: 12, borderColor: C.accent + '25' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Ionicons name="map-outline" size={16} color={C.accent} />
            <Text style={{ fontSize: 13, fontFamily: F.display, color: C.text, fontWeight: '700' }}>Proximos Passos</Text>
          </View>
          {roadmap.map(function(passo, idx) {
            return (
              <View key={idx} style={{ flexDirection: 'row', marginBottom: 10, gap: 10 }}>
                <View style={{ alignItems: 'center', width: 24 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: passo.color + '22', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={passo.icon} size={14} color={passo.color} />
                  </View>
                  {idx < roadmap.length - 1 ? <View style={{ width: 1, flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 4 }} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, color: C.text, fontFamily: F.body, fontWeight: '600', marginBottom: 2 }}>{passo.titulo}</Text>
                  <Sensitive><Text style={[{ fontSize: 10, color: C.dim, fontFamily: F.body, lineHeight: 15 }, ps]}>{passo.descricao}</Text></Sensitive>
                </View>
              </View>
            );
          })}
        </Glass>
      ) : null}

      {/* Projecao de renda mensal */}
      {projecaoRenda.length > 1 ? (
        <Glass padding={14} style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 1 }}>PROJECAO RENDA MENSAL</Text>
            <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>12 meses</Text>
          </View>
          <RendaChart data={projecaoRenda} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <Sensitive><Text style={[{ fontSize: 10, color: C.dim, fontFamily: F.mono }, ps]}>{'Hoje: R$ ' + fmtInt(projecaoRenda[0].renda)}</Text></Sensitive>
            <Sensitive><Text style={[{ fontSize: 10, color: C.accent, fontFamily: F.mono, fontWeight: '700' }, ps]}>{'12m: R$ ' + fmtInt(projecaoRenda[projecaoRenda.length - 1].renda)}</Text></Sensitive>
          </View>
          {projecaoRenda[projecaoRenda.length - 1].renda > projecaoRenda[0].renda ? (
            <Text style={{ fontSize: 10, color: C.green, fontFamily: F.body, textAlign: 'center', marginTop: 4 }}>
              {'+R$ ' + fmtInt(projecaoRenda[projecaoRenda.length - 1].renda - projecaoRenda[0].renda) + '/mes em 12 meses com aporte de R$ ' + fmtInt(aporte) + '/mes'}
            </Text>
          ) : null}
        </Glass>
      ) : null}

      {/* Disclaimer */}
      <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body, textAlign: 'center', lineHeight: 16, paddingHorizontal: 12, marginBottom: 20 }}>
        Simulacao baseada em DY medio estimado por classe. Rentabilidade passada nao garante futura. Nao e recomendacao de investimento.
      </Text>
    </ScrollView>
  );
}

var st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: SIZE.padding },
});
