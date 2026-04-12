// ═══════════════════════════════════════════════════════════
// SimuladorFIIScreen — Simulador de FIIs com DY real (StatusInvest)
// Modos: Capital→Rendimento | Meta→Capital necessario
// Aporte mensal progressivo, comparativo RF, P/VP, carteira real
// ═══════════════════════════════════════════════════════════

import React from 'react';
var useState = React.useState;
var useEffect = React.useEffect;
var useCallback = React.useCallback;
var useRef = React.useRef;
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Dimensions, PanResponder, TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Rect, Line, Path, Circle, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { C, F, SIZE } from '../../theme';
import { Glass } from '../../components';
import { useAuth } from '../../contexts/AuthContext';
import { useAppStore } from '../../contexts/AppStoreContext';
import { getPositions, getProfile } from '../../services/database';
import { enrichPositionsWithPrices } from '../../services/priceService';
import { fetchAllFiis, fetchFii12mChart, searchFiis } from '../../services/fiiStatusInvestService';
import { usePrivacyStyle } from '../../components/Sensitive';
import Sensitive from '../../components/Sensitive';

var TEORICA_STORAGE_KEY = '@premiolab:fii_carteira_teorica';

var W = Dimensions.get('window').width;

var CATEGORIAS = [
  { id: 'papel_hg', name: 'FII Papel HG', color: '#06B6D4', pct: 25, tickers: ['KNCR11', 'HGCR11', 'MXRF11', 'CPTS11', 'RBRR11', 'IRDM11'] },
  { id: 'papel_hy', name: 'FII Papel HY', color: '#8B5CF6', pct: 15, tickers: ['KNHY11', 'VGIR11', 'RBHY11', 'DEVA11', 'RECR11'] },
  { id: 'logistica', name: 'Logistica', color: '#10B981', pct: 20, tickers: ['HGLG11', 'XPLG11', 'BRCO11', 'BTLG11', 'VILG11', 'LVBI11'] },
  { id: 'lajes', name: 'Lajes Corp.', color: '#3B82F6', pct: 12, tickers: ['RBRP11', 'BRCR11', 'VINO11', 'PVBI11', 'JSRE11'] },
  { id: 'shopping', name: 'Shopping', color: '#F59E0B', pct: 10, tickers: ['XPML11', 'VISC11', 'HSML11', 'HGBS11', 'MALL11'] },
  { id: 'hibrido', name: 'Hibrido/Renda', color: '#EC4899', pct: 8, tickers: ['HGRU11', 'TRXF11', 'RZTR11', 'VRTA11', 'HABT11'] },
  { id: 'fof', name: 'FOFs', color: '#6366F1', pct: 10, tickers: ['BCFF11', 'RBRF11', 'KFOF11', 'HFOF11', 'MGFF11'] },
];

var FALLBACK_DY = { papel_hg: 14, papel_hy: 16, logistica: 12, lajes: 11, shopping: 11, hibrido: 13, fof: 12 };

// P/VP referencia (atualizar trimestralmente — dados mudam pouco)
// Fonte: StatusInvest Mar/2026
var PVP_REF = {
  KNCR11: 1.03, HGCR11: 1.01, MXRF11: 0.97, CPTS11: 0.87, RBRR11: 0.85, IRDM11: 0.83,
  KNHY11: 0.89, VGIR11: 0.95, RBHY11: 0.82, DEVA11: 0.70, RECR11: 0.81,
  HGLG11: 1.02, XPLG11: 0.94, BRCO11: 0.92, BTLG11: 0.96, VILG11: 0.80, LVBI11: 0.86,
  RBRP11: 0.65, BRCR11: 0.57, VINO11: 0.62, PVBI11: 0.72, JSRE11: 0.68,
  XPML11: 0.95, VISC11: 0.93, HSML11: 1.05, HGBS11: 0.97, MALL11: 0.99,
  HGRU11: 1.04, TRXF11: 1.01, RZTR11: 0.88, VRTA11: 0.81, HABT11: 0.79,
  BCFF11: 0.88, RBRF11: 0.85, KFOF11: 0.91, HFOF11: 0.82, MGFF11: 0.87,
};

var ALL_TICKERS = [];
for (var ci = 0; ci < CATEGORIAS.length; ci++) {
  for (var ti = 0; ti < CATEGORIAS[ci].tickers.length; ti++) {
    ALL_TICKERS.push(CATEGORIAS[ci].tickers[ti]);
  }
}

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtInt(v) {
  return Math.round(v || 0).toLocaleString('pt-BR');
}
function fmtPct(v) {
  return (v || 0).toFixed(1) + '%';
}

// ═══════════ SLIDER CUSTOMIZADO ═══════════
function CustomSlider(props) {
  var value = props.value;
  var min = props.min || 0;
  var max = props.max || 100;
  var step = props.step || 1;
  var onValueChange = props.onValueChange;
  var color = props.color || C.accent;

  var layoutRef = useRef({ x: 0, width: W - SIZE.padding * 2 - 24 });
  var propsRef = useRef({ min: min, max: max, step: step, onValueChange: onValueChange });
  propsRef.current = { min: min, max: max, step: step, onValueChange: onValueChange };

  var trackWidth = layoutRef.current.width || (W - SIZE.padding * 2 - 24);
  var pct = max > min ? (value - min) / (max - min) : 0;
  var thumbX = pct * trackWidth;

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
    // Medir posicao absoluta
    if (evt.target && evt.target.measure) {
      evt.target.measure(function(fx, fy, w, h, px) { layoutRef.current.x = px; layoutRef.current.width = w; });
    }
  }

  return (
    <View
      style={{ height: 40, justifyContent: 'center' }}
      onLayout={onLayout}
      ref={function(ref) { if (ref) ref.measure(function(fx, fy, w, h, px) { layoutRef.current = { x: px, width: w }; }); }}
      {...panRef.current.panHandlers}
    >
      <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: color, width: (pct * 100) + '%' }} />
      </View>
      <View style={{
        position: 'absolute', left: Math.max(0, thumbX - 12), top: 8,
        width: 24, height: 24, borderRadius: 12, backgroundColor: color,
        borderWidth: 3, borderColor: '#fff',
        elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3,
      }} />
    </View>
  );
}

// ═══════════ MINI CHART 12 BARRAS ═══════════
function MiniChart(props) {
  var data = props.data || [];
  var outliers = props.outliers || {};
  var width = props.width || (W - SIZE.padding * 2 - 48);
  var height = props.height || 50;
  var maxVal = 0;
  for (var i = 0; i < data.length; i++) {
    if (data[i] > maxVal) maxVal = data[i];
  }
  if (maxVal <= 0) maxVal = 1;
  var barW = Math.floor(width / 12) - 2;

  return (
    <Svg width={width} height={height}>
      {data.map(function(v, idx) {
        var barH = (v / maxVal) * (height - 8);
        if (barH < 1 && v > 0) barH = 2;
        var fill = v <= 0 ? 'rgba(255,255,255,0.06)' : outliers[idx] ? '#F59E0B' : '#22c55e';
        return (
          <Rect key={idx} x={idx * (barW + 2)} y={height - barH - 4} width={barW} height={barH} rx={2} fill={fill} />
        );
      })}
    </Svg>
  );
}

// ═══════════ GROWTH CHART SVG ═══════════
function GrowthChart(props) {
  var data = props.data || [];
  var width = props.width || (W - SIZE.padding * 2 - 32);
  var height = props.height || 120;
  if (data.length < 2) return null;
  var maxVal = 0;
  var minVal = data[0];
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
    pathD = pathD + (j === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
  }

  var areaD = pathD + ' L' + width + ',' + height + ' L0,' + height + ' Z';

  return (
    <Svg width={width} height={height}>
      <Path d={areaD} fill="rgba(16,185,129,0.12)" />
      <Path d={pathD} stroke="#10B981" strokeWidth={2} fill="none" />
      <Circle cx={width} cy={padY + (1 - (data[data.length - 1] - minVal) / range) * (height - padY * 2)} r={4} fill="#10B981" />
    </Svg>
  );
}

// ═══════════ TELA PRINCIPAL ═══════════
export default function SimuladorFIIScreen(props) {
  var navigation = props.navigation;
  var route = props.route;
  var user = useAuth().user;
  var _store = useAppStore();
  var _selectedPortfolio = _store.selectedPortfolio;
  var ps = usePrivacyStyle();
  var params = route && route.params ? route.params : {};
  var initialCapital = params.capitalInicial || 1000000;

  // State
  var _capital = useState(initialCapital); var capital = _capital[0]; var setCapital = _capital[1];
  var _mode = useState('capital'); var mode = _mode[0]; var setMode = _mode[1];
  var _metaMensal = useState(5000); var metaMensal = _metaMensal[0]; var setMetaMensal = _metaMensal[1];
  var _aporteMensal = useState(0); var aporteMensal = _aporteMensal[0]; var setAporteMensal = _aporteMensal[1];
  var _prazoAnos = useState(10); var prazoAnos = _prazoAnos[0]; var setPrazoAnos = _prazoAnos[1];
  var _showAporte = useState(false); var showAporte = _showAporte[0]; var setShowAporte = _showAporte[1];

  // % alocacao customizavel por categoria (inicia com defaults do CATEGORIAS)
  var defaultAloc = {};
  for (var dai = 0; dai < CATEGORIAS.length; dai++) { defaultAloc[CATEGORIAS[dai].id] = CATEGORIAS[dai].pct; }
  var _aloc = useState(defaultAloc); var aloc = _aloc[0]; var setAloc = _aloc[1];
  var _numAtivos = useState(15); var numAtivos = _numAtivos[0]; var setNumAtivos = _numAtivos[1];

  function updateAloc(catId, newVal) {
    var updated = {};
    var keys = Object.keys(aloc);
    for (var ui = 0; ui < keys.length; ui++) { updated[keys[ui]] = aloc[keys[ui]]; }
    updated[catId] = newVal;
    // Normalizar: ajustar outros proporcionalmente para somar 100
    var somaOutros = 0;
    for (var uj = 0; uj < keys.length; uj++) {
      if (keys[uj] !== catId) somaOutros += updated[keys[uj]];
    }
    var restante = 100 - newVal;
    if (somaOutros > 0 && restante >= 0) {
      for (var uk = 0; uk < keys.length; uk++) {
        if (keys[uk] !== catId) {
          updated[keys[uk]] = Math.round((updated[keys[uk]] / somaOutros) * restante);
        }
      }
      // Corrigir arredondamento para somar exatamente 100
      var somaFinal = 0;
      for (var ul = 0; ul < keys.length; ul++) somaFinal += updated[keys[ul]];
      if (somaFinal !== 100) {
        for (var um = 0; um < keys.length; um++) {
          if (keys[um] !== catId) { updated[keys[um]] += (100 - somaFinal); break; }
        }
      }
    }
    setAloc(updated);
  }

  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _error = useState(null); var error = _error[0]; var setError = _error[1];
  var _tickerData = useState({}); var tickerData = _tickerData[0]; var setTickerData = _tickerData[1];
  var _catData = useState({}); var catData = _catData[0]; var setCatData = _catData[1];
  var _outliers = useState([]); var outliers = _outliers[0]; var setOutliers = _outliers[1];
  var _fetchTime = useState(null); var fetchTime = _fetchTime[0]; var setFetchTime = _fetchTime[1];
  var _selicAnual = useState(13.25); var selicAnual = _selicAnual[0]; var setSelicAnual = _selicAnual[1];

  // Carteira real
  var _fiiCarteira = useState(null); var fiiCarteira = _fiiCarteira[0]; var setFiiCarteira = _fiiCarteira[1];
  var _userFiis = useState([]); var userFiis = _userFiis[0]; var setUserFiis = _userFiis[1];

  // Carteira teorica (persistida em AsyncStorage)
  var _teoricaList = useState([]); var teoricaList = _teoricaList[0]; var setTeoricaList = _teoricaList[1];
  var _teoricaLoaded = useState(false); var teoricaLoaded = _teoricaLoaded[0]; var setTeoricaLoaded = _teoricaLoaded[1];
  var _teoricaTicker = useState(''); var teoricaTicker = _teoricaTicker[0]; var setTeoricaTicker = _teoricaTicker[1];
  var _teoricaQty = useState(''); var teoricaQty = _teoricaQty[0]; var setTeoricaQty = _teoricaQty[1];
  var _showTeoricaForm = useState(false); var showTeoricaForm = _showTeoricaForm[0]; var setShowTeoricaForm = _showTeoricaForm[1];
  var _teoricaSug = useState([]); var teoricaSug = _teoricaSug[0]; var setTeoricaSug = _teoricaSug[1];
  var teoricaSugDebounce = useRef(null);

  function onTeoricaTickerChange(v) {
    var upper = (v || '').toUpperCase();
    setTeoricaTicker(upper);
    if (teoricaSugDebounce.current) clearTimeout(teoricaSugDebounce.current);
    if (upper.length < 1) { setTeoricaSug([]); return; }
    teoricaSugDebounce.current = setTimeout(function() {
      searchFiis(upper).then(function(results) {
        setTeoricaSug(results || []);
      }).catch(function() { setTeoricaSug([]); });
    }, 200);
  }

  function pickSuggestion(sug) {
    setTeoricaTicker(sug.ticker);
    setTeoricaSug([]);
  }

  function persistTeorica(list) {
    AsyncStorage.setItem(TEORICA_STORAGE_KEY, JSON.stringify(list)).catch(function() {});
  }

  function addTeoricaTicker() {
    var tk = (teoricaTicker || '').toUpperCase().trim();
    var qty = parseInt(teoricaQty, 10);
    if (!tk || !qty || qty <= 0) return;
    var updated = [];
    var found = false;
    for (var i = 0; i < teoricaList.length; i++) {
      if (teoricaList[i].ticker === tk) {
        updated.push({ ticker: tk, qty: qty });
        found = true;
      } else {
        updated.push(teoricaList[i]);
      }
    }
    if (!found) updated.push({ ticker: tk, qty: qty });
    setTeoricaList(updated);
    persistTeorica(updated);
    setTeoricaTicker('');
    setTeoricaQty('');
    setTeoricaSug([]);
    // Refetch com uniao dos tickers
    var extras = [];
    for (var ui = 0; ui < userFiis.length; ui++) extras.push(userFiis[ui].ticker);
    for (var ti = 0; ti < updated.length; ti++) {
      if (extras.indexOf(updated[ti].ticker) === -1) extras.push(updated[ti].ticker);
    }
    fetchData(extras);
  }

  function removeTeoricaTicker(ticker) {
    var updated = [];
    for (var i = 0; i < teoricaList.length; i++) {
      if (teoricaList[i].ticker !== ticker) updated.push(teoricaList[i]);
    }
    setTeoricaList(updated);
    persistTeorica(updated);
  }

  function clearTeorica() {
    setTeoricaList([]);
    persistTeorica([]);
  }

  // ── Fetch dados via StatusInvest ──
  // 1) fetchAllFiis (1 call) → price/dy/pvp de todos FIIs
  // 2) fetchFii12mChart por ticker → dividendos mensais (historico 12m)
  function fetchData(extraTickers) {
    setLoading(true);
    setError(null);

    // Tickers que precisam de chart (CATEGORIAS + user + teorica)
    var tickersChart = [];
    function addTk(tk) {
      var u = (tk || '').toUpperCase().trim();
      if (u && tickersChart.indexOf(u) === -1) tickersChart.push(u);
    }
    for (var ci = 0; ci < CATEGORIAS.length; ci++) {
      for (var ti = 0; ti < CATEGORIAS[ci].tickers.length; ti++) addTk(CATEGORIAS[ci].tickers[ti]);
    }
    if (extraTickers && extraTickers.length) {
      for (var xi = 0; xi < extraTickers.length; xi++) addTk(extraTickers[xi]);
    }

    fetchAllFiis().then(function(allFiis) {
      var map = (allFiis && allFiis.map) || {};
      var chartPromises = [];
      for (var ti2 = 0; ti2 < tickersChart.length; ti2++) {
        chartPromises.push((function(tkLocal) {
          return fetchFii12mChart(tkLocal).then(function(ch) { return { tk: tkLocal, chart: ch }; });
        })(tickersChart[ti2]));
      }
      return Promise.all(chartPromises).then(function(chartsArr) {
        var tdMap = {};
        var allOutliers = [];
        var now = new Date();

        for (var ci3 = 0; ci3 < chartsArr.length; ci3++) {
          var tk = chartsArr[ci3].tk;
          var chartArr = chartsArr[ci3].chart || [0,0,0,0,0,0,0,0,0,0,0,0];
          var info = map[tk] || null;
          var price = info ? info.price : 0;
          var pvpSI = info && info.pvp > 0 ? info.pvp : (PVP_REF[tk] || null);
          var dySI = info && info.dy > 0 ? info.dy : 0;

          // Yields mensais em % → DY historico / outliers
          var yields = [];
          var outMap = {};
          for (var j = 0; j < 12; j++) {
            if (price > 0 && chartArr[j] > 0) yields.push((chartArr[j] / price) * 100);
          }
          var dyCalc = dySI;
          var dyMin = dySI;
          var dyMax = dySI;
          if (yields.length >= 3) {
            var ySum = 0; var yMin = yields[0]; var yMax = yields[0];
            for (var yj = 0; yj < yields.length; yj++) {
              ySum += yields[yj];
              if (yields[yj] < yMin) yMin = yields[yj];
              if (yields[yj] > yMax) yMax = yields[yj];
            }
            var avgY = ySum / yields.length;
            for (var oi = 0; oi < 12; oi++) {
              if (price > 0 && chartArr[oi] > 0) {
                var thisY = (chartArr[oi] / price) * 100;
                if (thisY > avgY * 1.8) {
                  outMap[oi] = true;
                  var md2 = new Date(now.getFullYear(), now.getMonth() - (11 - oi), 1);
                  var mesNome = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][md2.getMonth()];
                  allOutliers.push({
                    ticker: tk,
                    mes: mesNome + '/' + md2.getFullYear(),
                    valor: chartArr[oi],
                    pctAcima: Math.round(((thisY / avgY) - 1) * 100),
                  });
                }
              }
            }
            // Priorizar DY calculado pelo historico quando tem amostras suficientes
            dyCalc = avgY * 12;
            dyMin = yMin * 12;
            dyMax = yMax * 12;
          } else if (dySI > 0) {
            dyMin = dySI * 0.85;
            dyMax = dySI * 1.15;
          }

          tdMap[tk] = {
            dy: dyCalc, dyMin: dyMin, dyMax: dyMax,
            price: price, pvp: pvpSI, chart: chartArr, outliers: outMap,
            name: info ? info.name : '',
          };
        }

        setTickerData(tdMap);
        setOutliers(allOutliers);

        // Dados por categoria
        var cdMap = {};
        for (var ci4 = 0; ci4 < CATEGORIAS.length; ci4++) {
          var cat = CATEGORIAS[ci4];
          var catDy = 0; var catDyMin = 0; var catDyMax = 0;
          var catPvp = 0; var pvpCount = 0;
          var catChart = [0,0,0,0,0,0,0,0,0,0,0,0];
          var catOutliers = {};
          var count = 0;
          var source = 'estimado';

          for (var cti2 = 0; cti2 < cat.tickers.length; cti2++) {
            var tdEntry = tdMap[cat.tickers[cti2]];
            if (tdEntry && tdEntry.dy > 0) {
              catDy += tdEntry.dy;
              catDyMin += tdEntry.dyMin;
              catDyMax += tdEntry.dyMax;
              count++;
              source = 'statusinvest';
              if (tdEntry.pvp != null && tdEntry.pvp > 0) { catPvp += tdEntry.pvp; pvpCount++; }
              for (var cci = 0; cci < 12; cci++) {
                catChart[cci] += tdEntry.chart[cci];
                if (tdEntry.outliers[cci]) catOutliers[cci] = true;
              }
            }
          }

          if (count > 0) {
            catDy = catDy / count;
            catDyMin = catDyMin / count;
            catDyMax = catDyMax / count;
            catPvp = pvpCount > 0 ? catPvp / pvpCount : null;
          } else {
            catDy = FALLBACK_DY[cat.id] || 12;
            catDyMin = catDy * 0.85;
            catDyMax = catDy * 1.15;
            catPvp = null;
          }

          cdMap[cat.id] = { dy: catDy, dyMin: catDyMin, dyMax: catDyMax, pvp: catPvp, chart: catChart, outliers: catOutliers, source: source };
        }

        setCatData(cdMap);
        setFetchTime(new Date());
        setLoading(false);
      });
    }).catch(function(err) {
      console.warn('SimuladorFII StatusInvest fetch error:', err);
      setError('Falha ao buscar dados. Usando estimativas.');
      var cdFallback = {};
      for (var fi = 0; fi < CATEGORIAS.length; fi++) {
        var fcat = CATEGORIAS[fi];
        cdFallback[fcat.id] = {
          dy: FALLBACK_DY[fcat.id], dyMin: FALLBACK_DY[fcat.id] * 0.85,
          dyMax: FALLBACK_DY[fcat.id] * 1.15, pvp: null,
          chart: [0,0,0,0,0,0,0,0,0,0,0,0], outliers: {}, source: 'estimado',
        };
      }
      setCatData(cdFallback);
      setLoading(false);
    });
  }

  // ── Buscar carteira real + selic → depois chama fetchData com tickers do usuario ──
  function loadAll() {
    if (!user) { fetchData(null); return; }
    getProfile(user.id).then(function(res) {
      if (res && res.data && res.data.selic) setSelicAnual(res.data.selic);
    }).catch(function() {});
    getPositions(user.id, _selectedPortfolio || undefined).then(function(res) {
      var pos = res.data || [];
      var fiis = [];
      for (var i = 0; i < pos.length; i++) {
        if (pos[i].categoria === 'fii' && (pos[i].quantidade || 0) > 0) fiis.push(pos[i]);
      }
      if (fiis.length === 0) { setUserFiis([]); setFiiCarteira(null); fetchData(null); return; }
      enrichPositionsWithPrices(fiis).then(function(enriched) {
        buildUserFiis(enriched);
      }).catch(function() {
        buildUserFiis(fiis);
      });
    }).catch(function() { fetchData(null); });
  }

  function buildUserFiis(list) {
    var out = [];
    var totalVal = 0;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      var tk = (e.ticker || '').toUpperCase().trim();
      var qty = e.quantidade || 0;
      var price = e.preco_atual || e.pm || 0;
      if (!tk || qty <= 0) continue;
      var valor = qty * price;
      totalVal += valor;
      out.push({ ticker: tk, qty: qty, price: price, valor: valor });
    }
    setUserFiis(out);
    setFiiCarteira({ count: out.length, valor: totalVal });
    var extras = out.map(function(f) { return f.ticker; });
    for (var ti = 0; ti < teoricaList.length; ti++) {
      if (extras.indexOf(teoricaList[ti].ticker) === -1) extras.push(teoricaList[ti].ticker);
    }
    fetchData(extras);
  }

  // Carrega carteira teorica do AsyncStorage uma vez
  useEffect(function() {
    AsyncStorage.getItem(TEORICA_STORAGE_KEY).then(function(raw) {
      if (raw) {
        try {
          var parsed = JSON.parse(raw);
          if (parsed && parsed.length) setTeoricaList(parsed);
        } catch (e) {}
      }
      setTeoricaLoaded(true);
    }).catch(function() { setTeoricaLoaded(true); });
  }, []);

  useFocusEffect(useCallback(function() {
    if (!teoricaLoaded) return;
    loadAll();
  }, [user, teoricaLoaded]));

  // ── Calculos totais ──
  var dyTotal = 0; var dyTotalMin = 0; var dyTotalMax = 0;
  for (var di2 = 0; di2 < CATEGORIAS.length; di2++) {
    var cd = catData[CATEGORIAS[di2].id];
    if (cd) {
      var catPct = aloc[CATEGORIAS[di2].id] || 0;
      dyTotal += catPct * cd.dy / 100;
      dyTotalMin += catPct * cd.dyMin / 100;
      dyTotalMax += catPct * cd.dyMax / 100;
    }
  }

  var efCapital = mode === 'meta' && dyTotal > 0 ? (metaMensal * 12 / (dyTotal / 100)) : capital;
  var rendMedio = efCapital * dyTotal / 100 / 12;
  var rendMin = efCapital * dyTotalMin / 100 / 12;
  var rendMax = efCapital * dyTotalMax / 100 / 12;
  var rendAnual = rendMedio * 12;
  var rendDia = rendMedio / 30;

  // Aporte progressivo
  var r = dyTotal / 100 / 12;
  var n = prazoAnos * 12;
  var patrimonioFinal = efCapital;
  var rendFinal = rendMedio;
  var growthData = [];
  if (showAporte && r > 0) {
    for (var gi = 0; gi <= n; gi++) {
      var pf = efCapital * Math.pow(1 + r, gi) + aporteMensal * (Math.pow(1 + r, gi) - 1) / r;
      growthData.push(pf);
    }
    patrimonioFinal = growthData[growthData.length - 1];
    rendFinal = patrimonioFinal * dyTotal / 100 / 12;
  }

  // Comparativo RF
  var cdiAnual = selicAnual - 0.10;
  var rendSelicBruto = efCapital * selicAnual / 100 / 12;
  var rendSelicLiq = rendSelicBruto * 0.85;
  var rendCdiBruto = efCapital * cdiAnual / 100 / 12;
  var rendCdiLiq = rendCdiBruto * 0.85;
  var rendLciLca = efCapital * (cdiAnual * 0.90) / 100 / 12;

  // Pior mes
  var piorMes = rendMin;

  // ── Projecao mensal da carteira REAL do usuario ──
  var carteiraMonthly = [0,0,0,0,0,0,0,0,0,0,0,0];
  var carteiraDetail = [];
  var carteiraAnual = 0;
  var carteiraTickersSemDados = [];
  for (var cfi = 0; cfi < userFiis.length; cfi++) {
    var uf = userFiis[cfi];
    var td = tickerData[uf.ticker];
    if (!td || !td.chart || td.chart.length !== 12) {
      carteiraTickersSemDados.push(uf.ticker);
      continue;
    }
    var ufAnual = 0;
    var ufChart = [];
    for (var ufm = 0; ufm < 12; ufm++) {
      var v = (td.chart[ufm] || 0) * uf.qty;
      carteiraMonthly[ufm] += v;
      ufAnual += v;
      ufChart.push(v);
    }
    carteiraAnual += ufAnual;
    carteiraDetail.push({
      ticker: uf.ticker,
      qty: uf.qty,
      valor: uf.valor,
      anual: ufAnual,
      mensalMedio: ufAnual / 12,
      dy: td.dy || 0,
      chart: ufChart,
    });
  }
  // Ordenar por rendimento mensal desc
  carteiraDetail.sort(function(a, b) { return b.mensalMedio - a.mensalMedio; });
  var carteiraMensalMedio = carteiraAnual / 12;
  var carteiraMaxMes = 0; var carteiraMinMes = 0;
  if (carteiraMonthly.length > 0) {
    carteiraMaxMes = carteiraMonthly[0];
    carteiraMinMes = carteiraMonthly[0];
    for (var cmi = 1; cmi < 12; cmi++) {
      if (carteiraMonthly[cmi] > carteiraMaxMes) carteiraMaxMes = carteiraMonthly[cmi];
      if (carteiraMonthly[cmi] < carteiraMinMes) carteiraMinMes = carteiraMonthly[cmi];
    }
  }
  var carteiraDyReal = fiiCarteira && fiiCarteira.valor > 0 ? (carteiraAnual / fiiCarteira.valor) * 100 : 0;
  var MESES_ABREV = ['J','F','M','A','M','J','J','A','S','O','N','D'];

  // ── Projecao da carteira TEORICA ──
  var teoricaMonthly = [0,0,0,0,0,0,0,0,0,0,0,0];
  var teoricaDetail = [];
  var teoricaAnual = 0;
  var teoricaValorTotal = 0;
  var teoricaSemDados = [];
  for (var tli = 0; tli < teoricaList.length; tli++) {
    var tt = teoricaList[tli];
    var ttd = tickerData[tt.ticker];
    var ttPrice = ttd && ttd.price ? ttd.price : 0;
    var ttValor = ttPrice * tt.qty;
    teoricaValorTotal += ttValor;
    if (!ttd || !ttd.chart || ttd.chart.length !== 12) {
      teoricaSemDados.push(tt.ticker);
      teoricaDetail.push({
        ticker: tt.ticker, qty: tt.qty, price: ttPrice, valor: ttValor,
        anual: 0, mensalMedio: 0, dy: 0, semDados: true,
      });
      continue;
    }
    var ttAnual = 0;
    for (var tm = 0; tm < 12; tm++) {
      var tv = (ttd.chart[tm] || 0) * tt.qty;
      teoricaMonthly[tm] += tv;
      ttAnual += tv;
    }
    teoricaAnual += ttAnual;
    teoricaDetail.push({
      ticker: tt.ticker, qty: tt.qty, price: ttPrice, valor: ttValor,
      anual: ttAnual, mensalMedio: ttAnual / 12, dy: ttd.dy || 0, semDados: false,
    });
  }
  teoricaDetail.sort(function(a, b) { return b.mensalMedio - a.mensalMedio; });
  var teoricaMensalMedio = teoricaAnual / 12;
  var teoricaMaxMes = 0; var teoricaMinMes = 0;
  if (teoricaAnual > 0) {
    teoricaMaxMes = teoricaMonthly[0];
    teoricaMinMes = teoricaMonthly[0];
    for (var tmi = 1; tmi < 12; tmi++) {
      if (teoricaMonthly[tmi] > teoricaMaxMes) teoricaMaxMes = teoricaMonthly[tmi];
      if (teoricaMonthly[tmi] < teoricaMinMes) teoricaMinMes = teoricaMonthly[tmi];
    }
  }
  var teoricaDyCalc = teoricaValorTotal > 0 ? (teoricaAnual / teoricaValorTotal) * 100 : 0;

  // Status badge
  var statusLabel = loading ? 'Buscando...' : error ? 'Estimado' : 'Ao vivo ' + (fetchTime ? (String(fetchTime.getHours()).padStart(2, '0') + ':' + String(fetchTime.getMinutes()).padStart(2, '0')) : '');
  var statusColor = loading ? C.yellow : error ? C.red : C.green;

  return (
    <ScrollView style={st.container} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>

      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity onPress={function() { navigation.goBack(); }}>
            <Ionicons name="chevron-back" size={28} color={C.accent} />
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: '800', color: C.text, fontFamily: F.display }}>Simulador FII</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: statusColor + '15', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor }} />
          <Text style={{ fontSize: 10, color: statusColor, fontFamily: F.mono, fontWeight: '600' }}>{statusLabel}</Text>
        </View>
      </View>

      {loading ? (
        <View style={{ alignItems: 'center', paddingVertical: 60 }}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={{ fontSize: 13, color: C.dim, fontFamily: F.body, marginTop: 12 }}>Buscando dados de FIIs no StatusInvest...</Text>
        </View>
      ) : (
        <View>

          {/* Banner */}
          {error ? (
            <View style={{ backgroundColor: C.red + '15', borderWidth: 1, borderColor: C.red + '30', borderRadius: 12, padding: 12, marginBottom: 14 }}>
              <Text style={{ fontSize: 12, color: C.red, fontFamily: F.body }}>{error}</Text>
            </View>
          ) : null}

          {/* Carteira Real + Projecao Mensal */}
          {fiiCarteira && fiiCarteira.valor > 0 ? (
            <Glass padding={14} style={{ marginBottom: 14, borderColor: C.fiis + '30' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Ionicons name="briefcase-outline" size={16} color={C.fiis} />
                <Text style={{ fontSize: 13, fontFamily: F.display, color: C.text, fontWeight: '700' }}>Minha Carteira de FIIs</Text>
                <View style={{ backgroundColor: C.fiis + '22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                  <Text style={{ fontSize: 9, color: C.fiis, fontFamily: F.mono, fontWeight: '700' }}>{fiiCarteira.count + ' FIIs'}</Text>
                </View>
              </View>
              <Sensitive>
                <Text style={[{ fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5, marginBottom: 2 }, ps]}>VALOR INVESTIDO</Text>
                <Text style={[{ fontSize: 22, fontWeight: '800', color: C.text, fontFamily: F.mono, marginBottom: 10 }, ps]}>{'R$ ' + fmtInt(fiiCarteira.valor)}</Text>
              </Sensitive>

              {/* KPIs reais */}
              {carteiraAnual > 0 ? (
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  <View style={{ flex: 1, backgroundColor: 'rgba(16,185,129,0.10)', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: 'rgba(16,185,129,0.22)' }}>
                    <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 }}>MEDIA/MES</Text>
                    <Sensitive><Text style={[{ fontSize: 16, fontWeight: '800', color: '#22c55e', fontFamily: F.mono }, ps]}>{'R$ ' + fmt(carteiraMensalMedio)}</Text></Sensitive>
                  </View>
                  <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 10 }}>
                    <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 }}>ANO (12M)</Text>
                    <Sensitive><Text style={[{ fontSize: 16, fontWeight: '800', color: C.text, fontFamily: F.mono }, ps]}>{'R$ ' + fmtInt(carteiraAnual)}</Text></Sensitive>
                  </View>
                  <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 10 }}>
                    <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 }}>DY REAL</Text>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: C.fiis, fontFamily: F.mono }}>{fmtPct(carteiraDyReal)}</Text>
                  </View>
                </View>
              ) : null}

              {/* Grafico projecao mensal 12m */}
              {carteiraAnual > 0 ? (
                <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                  <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 1, marginBottom: 8 }}>PREVISAO MENSAL (base 12M)</Text>
                  {(function() {
                    var chartW = W - SIZE.padding * 2 - 52;
                    var chartH = 90;
                    var maxV = carteiraMaxMes || 1;
                    var bw = Math.floor(chartW / 12) - 4;
                    return (
                      <View>
                        <Svg width={chartW} height={chartH + 18}>
                          {carteiraMonthly.map(function(v, idx) {
                            var bh = (v / maxV) * chartH;
                            if (bh < 1 && v > 0) bh = 2;
                            var isMax = v === carteiraMaxMes && v > 0;
                            return (
                              <React.Fragment key={idx}>
                                <Rect x={idx * (bw + 4)} y={chartH - bh} width={bw} height={bh} rx={2} fill={isMax ? '#22c55e' : C.fiis} opacity={isMax ? 1 : 0.75} />
                                <SvgText x={idx * (bw + 4) + bw / 2} y={chartH + 12} fontSize="8" fill={C.dim} textAnchor="middle" fontFamily={F.mono}>{MESES_ABREV[idx]}</SvgText>
                              </React.Fragment>
                            );
                          })}
                        </Svg>
                        <Sensitive>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                            <Text style={[{ fontSize: 10, color: C.red, fontFamily: F.mono }, ps]}>{'Pior: R$ ' + fmt(carteiraMinMes)}</Text>
                            <Text style={[{ fontSize: 10, color: '#22c55e', fontFamily: F.mono }, ps]}>{'Melhor: R$ ' + fmt(carteiraMaxMes)}</Text>
                          </View>
                        </Sensitive>
                      </View>
                    );
                  })()}
                </View>
              ) : (
                <View style={{ backgroundColor: 'rgba(245,158,11,0.10)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                  <Text style={{ fontSize: 11, color: C.yellow, fontFamily: F.body }}>Carregando historico de dividendos...</Text>
                </View>
              )}

              {/* Lista por FII */}
              {carteiraDetail.length > 0 ? (
                <View style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                    <Text style={{ flex: 1.4, fontSize: 9, color: C.dim, fontFamily: F.mono }}>FII</Text>
                    <Text style={{ flex: 0.8, fontSize: 9, color: C.dim, fontFamily: F.mono, textAlign: 'right' }}>Cotas</Text>
                    <Text style={{ flex: 1.3, fontSize: 9, color: C.dim, fontFamily: F.mono, textAlign: 'right' }}>R$/mes</Text>
                    <Text style={{ flex: 0.9, fontSize: 9, color: C.dim, fontFamily: F.mono, textAlign: 'right' }}>DY</Text>
                  </View>
                  {carteiraDetail.map(function(d, idx) {
                    return (
                      <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)' }}>
                        <Text style={{ flex: 1.4, fontSize: 11, color: C.text, fontFamily: F.mono, fontWeight: '600' }}>{d.ticker}</Text>
                        <Text style={{ flex: 0.8, fontSize: 11, color: C.sub, fontFamily: F.mono, textAlign: 'right' }}>{d.qty}</Text>
                        <Sensitive><Text style={[{ flex: 1.3, fontSize: 11, color: '#22c55e', fontFamily: F.mono, textAlign: 'right', fontWeight: '600' }, ps]}>{fmt(d.mensalMedio)}</Text></Sensitive>
                        <Text style={{ flex: 0.9, fontSize: 11, color: C.fiis, fontFamily: F.mono, textAlign: 'right' }}>{fmtPct(d.dy)}</Text>
                      </View>
                    );
                  })}
                  {carteiraTickersSemDados.length > 0 ? (
                    <Text style={{ fontSize: 9, color: C.yellow, fontFamily: F.mono, marginTop: 6 }}>{'Sem historico: ' + carteiraTickersSemDados.join(', ')}</Text>
                  ) : null}
                </View>
              ) : null}

              <TouchableOpacity onPress={function() { setCapital(Math.round(fiiCarteira.valor / 10000) * 10000); setMode('capital'); }}
                style={{ backgroundColor: C.fiis + '22', paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: C.fiis + '40' }}>
                <Text style={{ fontSize: 12, color: C.fiis, fontFamily: F.display, fontWeight: '700' }}>Usar este capital no simulador</Text>
              </TouchableOpacity>
            </Glass>
          ) : null}

          {/* Carteira Teorica */}
          <Glass padding={14} style={{ marginBottom: 14, borderColor: C.accent + '30' }}>
            <TouchableOpacity onPress={function() { setShowTeoricaForm(!showTeoricaForm); }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="flask-outline" size={16} color={C.accent} />
                <Text style={{ fontSize: 13, fontFamily: F.display, color: C.text, fontWeight: '700' }}>Carteira Teorica</Text>
                {teoricaList.length > 0 ? (
                  <View style={{ backgroundColor: C.accent + '22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                    <Text style={{ fontSize: 9, color: C.accent, fontFamily: F.mono, fontWeight: '700' }}>{teoricaList.length + ' FIIs'}</Text>
                  </View>
                ) : null}
              </View>
              <Ionicons name={showTeoricaForm ? 'chevron-up' : 'chevron-down'} size={18} color={C.dim} />
            </TouchableOpacity>

            <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.body, marginTop: 6, marginBottom: 10 }}>
              Monte uma carteira hipotetica e veja quanto renderia por mes.
            </Text>

            {showTeoricaForm ? (
              <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 10, marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  <TextInput
                    value={teoricaTicker}
                    onChangeText={onTeoricaTickerChange}
                    placeholder="TICKER"
                    placeholderTextColor={C.dim}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={6}
                    style={{ flex: 1.3, backgroundColor: 'rgba(255,255,255,0.06)', color: C.text, fontFamily: F.mono, fontSize: 13, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 }}
                  />
                  <TextInput
                    value={teoricaQty}
                    onChangeText={setTeoricaQty}
                    placeholder="Cotas"
                    placeholderTextColor={C.dim}
                    keyboardType="number-pad"
                    maxLength={6}
                    style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', color: C.text, fontFamily: F.mono, fontSize: 13, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 }}
                  />
                  <TouchableOpacity onPress={addTeoricaTicker}
                    style={{ backgroundColor: C.accent, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 8 }}>
                    <Ionicons name="add" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>

                {/* Dropdown autocomplete */}
                {teoricaSug.length > 0 ? (
                  <View style={{ backgroundColor: 'rgba(15,20,30,0.98)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 8, overflow: 'hidden' }}>
                    {teoricaSug.map(function(sug, idx) {
                      return (
                        <TouchableOpacity key={sug.ticker + idx} onPress={function() { pickSuggestion(sug); }}
                          style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: idx < teoricaSug.length - 1 ? 1 : 0, borderBottomColor: 'rgba(255,255,255,0.05)' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                            <Text style={{ fontSize: 13, color: C.text, fontFamily: F.mono, fontWeight: '700' }}>{sug.ticker}</Text>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              {sug.price > 0 ? (
                                <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.mono }}>{'R$ ' + fmt(sug.price)}</Text>
                              ) : null}
                              {sug.dy > 0 ? (
                                <Text style={{ fontSize: 11, color: '#22c55e', fontFamily: F.mono }}>{fmtPct(sug.dy)}</Text>
                              ) : null}
                            </View>
                          </View>
                          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body }} numberOfLines={1}>
                            {(sug.name || '') + (sug.segment ? '  ·  ' + sug.segment : '')}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}

                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>Digite o ticker ou parte do nome · dados em tempo real do StatusInvest.</Text>
              </View>
            ) : null}

            {teoricaList.length === 0 ? (
              <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 14, alignItems: 'center' }}>
                <Ionicons name="flask-outline" size={28} color={C.dim} style={{ marginBottom: 6 }} />
                <Text style={{ fontSize: 12, color: C.dim, fontFamily: F.body, textAlign: 'center' }}>Nenhum FII adicionado ainda.</Text>
                {!showTeoricaForm ? (
                  <TouchableOpacity onPress={function() { setShowTeoricaForm(true); }}
                    style={{ marginTop: 8, backgroundColor: C.accent + '22', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 }}>
                    <Text style={{ fontSize: 12, color: C.accent, fontFamily: F.display, fontWeight: '700' }}>Adicionar FII</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : (
              <View>
                {/* KPIs teoricos */}
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                  <View style={{ flex: 1, backgroundColor: 'rgba(16,185,129,0.10)', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: 'rgba(16,185,129,0.22)' }}>
                    <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 }}>MEDIA/MES</Text>
                    <Sensitive><Text style={[{ fontSize: 16, fontWeight: '800', color: '#22c55e', fontFamily: F.mono }, ps]}>{'R$ ' + fmt(teoricaMensalMedio)}</Text></Sensitive>
                  </View>
                  <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 10 }}>
                    <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 }}>INVESTIDO</Text>
                    <Sensitive><Text style={[{ fontSize: 16, fontWeight: '800', color: C.text, fontFamily: F.mono }, ps]}>{'R$ ' + fmtInt(teoricaValorTotal)}</Text></Sensitive>
                  </View>
                  <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 10 }}>
                    <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 }}>DY</Text>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: C.accent, fontFamily: F.mono }}>{fmtPct(teoricaDyCalc)}</Text>
                  </View>
                </View>

                {/* Chart 12m teorica */}
                {teoricaAnual > 0 ? (
                  <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                    <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 1, marginBottom: 8 }}>PREVISAO MENSAL (base 12M)</Text>
                    {(function() {
                      var chartW = W - SIZE.padding * 2 - 52;
                      var chartH = 90;
                      var maxV = teoricaMaxMes || 1;
                      var bw = Math.floor(chartW / 12) - 4;
                      return (
                        <View>
                          <Svg width={chartW} height={chartH + 18}>
                            {teoricaMonthly.map(function(v, idx) {
                              var bh = (v / maxV) * chartH;
                              if (bh < 1 && v > 0) bh = 2;
                              var isMax = v === teoricaMaxMes && v > 0;
                              return (
                                <React.Fragment key={idx}>
                                  <Rect x={idx * (bw + 4)} y={chartH - bh} width={bw} height={bh} rx={2} fill={isMax ? '#22c55e' : C.accent} opacity={isMax ? 1 : 0.75} />
                                  <SvgText x={idx * (bw + 4) + bw / 2} y={chartH + 12} fontSize="8" fill={C.dim} textAnchor="middle" fontFamily={F.mono}>{MESES_ABREV[idx]}</SvgText>
                                </React.Fragment>
                              );
                            })}
                          </Svg>
                          <Sensitive>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                              <Text style={[{ fontSize: 10, color: C.red, fontFamily: F.mono }, ps]}>{'Pior: R$ ' + fmt(teoricaMinMes)}</Text>
                              <Text style={[{ fontSize: 10, color: '#22c55e', fontFamily: F.mono }, ps]}>{'Melhor: R$ ' + fmt(teoricaMaxMes)}</Text>
                            </View>
                          </Sensitive>
                        </View>
                      );
                    })()}
                  </View>
                ) : null}

                {/* Lista teorica */}
                <View style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                    <Text style={{ flex: 1.4, fontSize: 9, color: C.dim, fontFamily: F.mono }}>FII</Text>
                    <Text style={{ flex: 0.8, fontSize: 9, color: C.dim, fontFamily: F.mono, textAlign: 'right' }}>Cotas</Text>
                    <Text style={{ flex: 1.4, fontSize: 9, color: C.dim, fontFamily: F.mono, textAlign: 'right' }}>Valor</Text>
                    <Text style={{ flex: 1.3, fontSize: 9, color: C.dim, fontFamily: F.mono, textAlign: 'right' }}>R$/mes</Text>
                    <Text style={{ width: 28 }} />
                  </View>
                  {teoricaDetail.map(function(d, idx) {
                    return (
                      <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)' }}>
                        <View style={{ flex: 1.4 }}>
                          <Text style={{ fontSize: 11, color: C.text, fontFamily: F.mono, fontWeight: '600' }}>{d.ticker}</Text>
                          {d.semDados ? (
                            <Text style={{ fontSize: 8, color: C.yellow, fontFamily: F.mono }}>sem historico</Text>
                          ) : (
                            <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono }}>{'DY ' + fmtPct(d.dy)}</Text>
                          )}
                        </View>
                        <Text style={{ flex: 0.8, fontSize: 11, color: C.sub, fontFamily: F.mono, textAlign: 'right' }}>{d.qty}</Text>
                        <Sensitive><Text style={[{ flex: 1.4, fontSize: 11, color: C.text, fontFamily: F.mono, textAlign: 'right' }, ps]}>{fmtInt(d.valor)}</Text></Sensitive>
                        <Sensitive><Text style={[{ flex: 1.3, fontSize: 11, color: '#22c55e', fontFamily: F.mono, textAlign: 'right', fontWeight: '600' }, ps]}>{fmt(d.mensalMedio)}</Text></Sensitive>
                        <TouchableOpacity onPress={function(t) { return function() { removeTeoricaTicker(t); }; }(d.ticker)}
                          style={{ width: 28, alignItems: 'center' }}>
                          <Ionicons name="close-circle" size={16} color={C.dim} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {teoricaValorTotal > 0 ? (
                    <TouchableOpacity onPress={function() { setCapital(Math.round(teoricaValorTotal / 10000) * 10000); setMode('capital'); }}
                      style={{ flex: 1, backgroundColor: C.accent + '22', paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: C.accent + '40' }}>
                      <Text style={{ fontSize: 11, color: C.accent, fontFamily: F.display, fontWeight: '700' }}>Usar no simulador</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity onPress={clearTeorica}
                    style={{ backgroundColor: 'rgba(239,68,68,0.15)', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(239,68,68,0.30)' }}>
                    <Text style={{ fontSize: 11, color: C.red, fontFamily: F.display, fontWeight: '700' }}>Limpar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </Glass>

          {/* Toggle modo */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            <TouchableOpacity onPress={function() { setMode('capital'); }}
              style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: mode === 'capital' ? C.accent + '22' : 'rgba(255,255,255,0.04)', borderWidth: mode === 'capital' ? 1 : 0, borderColor: C.accent + '40' }}>
              <Text style={{ fontSize: 12, fontFamily: F.display, fontWeight: '700', color: mode === 'capital' ? C.accent : C.dim }}>Quanto rendo</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={function() { setMode('meta'); }}
              style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: mode === 'meta' ? C.fiis + '22' : 'rgba(255,255,255,0.04)', borderWidth: mode === 'meta' ? 1 : 0, borderColor: C.fiis + '40' }}>
              <Text style={{ fontSize: 12, fontFamily: F.display, fontWeight: '700', color: mode === 'meta' ? C.fiis : C.dim }}>Quanto preciso</Text>
            </TouchableOpacity>
          </View>

          {/* Slider */}
          {mode === 'capital' ? (
            <View style={{ marginBottom: 14 }}>
              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 1, marginBottom: 4 }}>CAPITAL INVESTIDO</Text>
              <Sensitive><Text style={[{ fontSize: 28, fontWeight: '800', color: C.text, fontFamily: F.mono, marginBottom: 8 }, ps]}>{'R$ ' + fmtInt(capital)}</Text></Sensitive>
              <CustomSlider value={capital} min={10000} max={5000000} step={10000} onValueChange={setCapital} color={C.accent} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>R$ 10k</Text>
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>R$ 2,5M</Text>
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>R$ 5M</Text>
              </View>
            </View>
          ) : (
            <View style={{ marginBottom: 14 }}>
              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 1, marginBottom: 4 }}>META MENSAL</Text>
              <Sensitive><Text style={[{ fontSize: 28, fontWeight: '800', color: C.fiis, fontFamily: F.mono, marginBottom: 8 }, ps]}>{'R$ ' + fmtInt(metaMensal) + '/mes'}</Text></Sensitive>
              <CustomSlider value={metaMensal} min={500} max={50000} step={100} onValueChange={setMetaMensal} color={C.fiis} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>R$ 500</Text>
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>R$ 25k</Text>
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>R$ 50k</Text>
              </View>
              {dyTotal > 0 ? (
                <Sensitive><Text style={[{ fontSize: 14, color: C.sub, fontFamily: F.body, marginTop: 8, textAlign: 'center' }, ps]}>
                  {'Precisa investir R$ ' + fmtInt(efCapital)}
                </Text></Sensitive>
              ) : null}
            </View>
          )}

          {/* Hero Card */}
          <Glass padding={18} glow="rgba(16,185,129,0.15)" style={{ marginBottom: 14, borderColor: 'rgba(16,185,129,0.22)' }}>
            <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 1, marginBottom: 6 }}>RENDIMENTO ESTIMADO</Text>
            <Sensitive>
              <Text style={[{ fontSize: 34, fontWeight: '800', color: '#22c55e', fontFamily: F.mono }, ps]}>{'R$ ' + fmt(rendMedio)}</Text>
              <Text style={[{ fontSize: 13, color: C.sub, fontFamily: F.body, marginBottom: 10 }, ps]}>{'por mes  ·  R$ ' + fmt(rendAnual) + '/ano'}</Text>
            </Sensitive>
            {/* Barra min-max */}
            <View style={{ marginBottom: 10 }}>
              <View style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
                <View style={{ position: 'absolute', left: rendMin > 0 ? ((rendMin / rendMax) * 100) + '%' : '0%', right: '0%', height: 6, borderRadius: 3, backgroundColor: '#22c55e33' }} />
              </View>
              <Sensitive>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                  <Text style={[{ fontSize: 10, color: C.red, fontFamily: F.mono }, ps]}>{'Min R$ ' + fmt(rendMin)}</Text>
                  <Text style={[{ fontSize: 10, color: '#22c55e', fontFamily: F.mono }, ps]}>{'Max R$ ' + fmt(rendMax)}</Text>
                </View>
              </Sensitive>
            </View>
            {/* Mini chart */}
            <MiniChart data={Object.keys(catData).length > 0 ? (function() {
              var merged = [0,0,0,0,0,0,0,0,0,0,0,0];
              for (var k = 0; k < CATEGORIAS.length; k++) {
                var cd2 = catData[CATEGORIAS[k].id];
                if (cd2) { for (var m2 = 0; m2 < 12; m2++) merged[m2] += cd2.chart[m2] * (aloc[CATEGORIAS[k].id] || 0) / 100; }
              }
              return merged;
            })() : []} />
            <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, textAlign: 'center', marginTop: 4 }}>Distribuicao mensal ponderada (12 meses)</Text>
          </Glass>

          {/* Grid 2x2 KPIs */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            <Glass padding={12} style={{ flex: 1 }}>
              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 }}>DY MEDIO</Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#22c55e', fontFamily: F.mono }}>{fmtPct(dyTotal)}</Text>
              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>ao ano</Text>
            </Glass>
            <Glass padding={12} style={{ flex: 1 }}>
              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 }}>YIELD MENSAL</Text>
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#3B82F6', fontFamily: F.mono }}>{fmtPct(dyTotal / 12)}</Text>
              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>ao mes</Text>
            </Glass>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            <Glass padding={12} style={{ flex: 1 }}>
              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 }}>POR DIA</Text>
              <Sensitive><Text style={[{ fontSize: 20, fontWeight: '800', color: C.sub, fontFamily: F.mono }, ps]}>{'R$ ' + fmt(rendDia)}</Text></Sensitive>
              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>estimado</Text>
            </Glass>
            <Glass padding={12} style={{ flex: 1 }}>
              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 }}>PIOR MES</Text>
              <Sensitive><Text style={[{ fontSize: 20, fontWeight: '800', color: C.red, fontFamily: F.mono }, ps]}>{'R$ ' + fmt(piorMes)}</Text></Sensitive>
              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>estimado</Text>
            </Glass>
          </View>

          {/* Toggle Aporte Mensal */}
          <TouchableOpacity onPress={function() { setShowAporte(!showAporte); }}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="trending-up" size={18} color={C.accent} />
              <Text style={{ fontSize: 13, fontFamily: F.display, color: C.text, fontWeight: '600' }}>Aporte mensal + prazo</Text>
            </View>
            <Ionicons name={showAporte ? 'chevron-up' : 'chevron-down'} size={18} color={C.dim} />
          </TouchableOpacity>

          {showAporte ? (
            <Glass padding={14} style={{ marginBottom: 14 }}>
              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 1, marginBottom: 4 }}>APORTE MENSAL</Text>
              <Sensitive><Text style={[{ fontSize: 22, fontWeight: '800', color: C.accent, fontFamily: F.mono, marginBottom: 6 }, ps]}>{'R$ ' + fmtInt(aporteMensal)}</Text></Sensitive>
              <CustomSlider value={aporteMensal} min={0} max={20000} step={100} onValueChange={setAporteMensal} color={C.accent} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2, marginBottom: 14 }}>
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>R$ 0</Text>
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>R$ 20k</Text>
              </View>

              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 1, marginBottom: 4 }}>PRAZO</Text>
              <Text style={{ fontSize: 22, fontWeight: '800', color: C.accent, fontFamily: F.mono, marginBottom: 6 }}>{prazoAnos + (prazoAnos === 1 ? ' ano' : ' anos')}</Text>
              <CustomSlider value={prazoAnos} min={1} max={30} step={1} onValueChange={setPrazoAnos} color={C.accent} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2, marginBottom: 14 }}>
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>1 ano</Text>
                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>30 anos</Text>
              </View>

              {/* Resultado projecao */}
              <View style={{ backgroundColor: 'rgba(16,185,129,0.08)', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: 'rgba(16,185,129,0.20)' }}>
                <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 1, marginBottom: 6 }}>{'EM ' + prazoAnos + ' ANOS'}</Text>
                <Sensitive>
                  <Text style={[{ fontSize: 22, fontWeight: '800', color: '#22c55e', fontFamily: F.mono }, ps]}>{'R$ ' + fmtInt(patrimonioFinal)}</Text>
                  <Text style={[{ fontSize: 13, color: C.sub, fontFamily: F.body, marginBottom: 8 }, ps]}>{'rendendo R$ ' + fmt(rendFinal) + '/mes'}</Text>
                </Sensitive>
                {growthData.length > 1 ? <GrowthChart data={growthData} /> : null}
              </View>
            </Glass>
          ) : null}

          {/* Comparativo RF */}
          <Glass padding={14} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="swap-horizontal" size={16} color={C.accent} />
              <Text style={{ fontSize: 13, fontFamily: F.display, color: C.text, fontWeight: '700' }}>Comparativo Renda Fixa</Text>
            </View>
            {[
              { nome: 'FIIs (isento IR)', rend: rendMedio, ir: 0, liq: rendMedio, color: C.fiis, best: rendMedio >= rendSelicLiq && rendMedio >= rendLciLca },
              { nome: 'Selic ' + fmtPct(selicAnual), rend: rendSelicBruto, ir: 15, liq: rendSelicLiq, color: C.yellow, best: rendSelicLiq > rendMedio && rendSelicLiq >= rendLciLca },
              { nome: 'CDB 100% CDI', rend: rendCdiBruto, ir: 15, liq: rendCdiLiq, color: C.acoes, best: false },
              { nome: 'LCI/LCA 90% CDI', rend: rendLciLca, ir: 0, liq: rendLciLca, color: C.rf, best: rendLciLca > rendMedio && rendLciLca > rendSelicLiq },
            ].map(function(item) {
              return (
                <View key={item.nome} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.color }} />
                      <Text style={{ fontSize: 12, color: C.text, fontFamily: F.body }}>{item.nome}</Text>
                      {item.best ? (
                        <View style={{ backgroundColor: '#22c55e22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ fontSize: 8, color: '#22c55e', fontFamily: F.mono, fontWeight: '700' }}>MELHOR</Text>
                        </View>
                      ) : null}
                    </View>
                    {item.ir > 0 ? <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, marginLeft: 14 }}>{'IR ' + item.ir + '%'}</Text> : null}
                  </View>
                  <Sensitive><Text style={[{ fontSize: 14, fontWeight: '700', color: item.best ? '#22c55e' : C.sub, fontFamily: F.mono }, ps]}>{'R$ ' + fmt(item.liq)}</Text></Sensitive>
                </View>
              );
            })}
            <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, marginTop: 8 }}>IR considerado: 15% (prazo > 2 anos). FIIs isentos para PF.</Text>
          </Glass>

          {/* Numero de ativos */}
          <Glass padding={14} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="grid-outline" size={16} color={C.accent} />
                <Text style={{ fontSize: 13, fontFamily: F.display, color: C.text, fontWeight: '700' }}>Ativos na carteira</Text>
              </View>
              <Text style={{ fontSize: 20, fontWeight: '800', color: C.accent, fontFamily: F.mono }}>{numAtivos}</Text>
            </View>
            <CustomSlider value={numAtivos} min={5} max={38} step={1} onValueChange={setNumAtivos} color={C.accent} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>5 FIIs</Text>
              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>20 FIIs</Text>
              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>38 FIIs</Text>
            </View>
          </Glass>

          {/* Alocacao por Categoria */}
          <View style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Ionicons name="pie-chart-outline" size={16} color={C.accent} />
              <Text style={{ fontSize: 13, fontFamily: F.display, color: C.text, fontWeight: '700' }}>Alocacao por Categoria</Text>
            </View>

            {/* Perfis de alocacao */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {[
                  { label: 'Renda', desc: 'Mais yield', icon: 'cash-outline', aloc: { papel_hg: 30, papel_hy: 25, logistica: 15, lajes: 5, shopping: 5, hibrido: 10, fof: 10 } },
                  { label: 'Equilibrado', desc: 'Balanceado', icon: 'scale-outline', aloc: { papel_hg: 25, papel_hy: 15, logistica: 20, lajes: 12, shopping: 10, hibrido: 8, fof: 10 } },
                  { label: 'Tijolo', desc: 'Imoveis fisicos', icon: 'business-outline', aloc: { papel_hg: 5, papel_hy: 5, logistica: 30, lajes: 25, shopping: 20, hibrido: 10, fof: 5 } },
                  { label: 'Seguranca', desc: 'Menos risco', icon: 'shield-checkmark-outline', aloc: { papel_hg: 40, papel_hy: 5, logistica: 15, lajes: 10, shopping: 10, hibrido: 5, fof: 15 } },
                  { label: 'Yield Max', desc: 'Maximo retorno', icon: 'rocket-outline', aloc: { papel_hg: 15, papel_hy: 35, logistica: 15, lajes: 5, shopping: 5, hibrido: 20, fof: 5 } },
                ].map(function(perfil) {
                  var isActive = true;
                  var pKeys = Object.keys(perfil.aloc);
                  for (var pai = 0; pai < pKeys.length; pai++) {
                    if (aloc[pKeys[pai]] !== perfil.aloc[pKeys[pai]]) { isActive = false; break; }
                  }
                  return (
                    <TouchableOpacity key={perfil.label} onPress={function() { setAloc(perfil.aloc); }} activeOpacity={0.7}
                      style={{ backgroundColor: isActive ? C.accent + '22' : 'rgba(255,255,255,0.04)', borderWidth: isActive ? 1 : 0, borderColor: C.accent + '40', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center', minWidth: 80 }}>
                      <Ionicons name={perfil.icon} size={18} color={isActive ? C.accent : C.dim} />
                      <Text style={{ fontSize: 11, color: isActive ? C.accent : C.text, fontFamily: F.display, fontWeight: '700', marginTop: 2 }}>{perfil.label}</Text>
                      <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>{perfil.desc}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, marginBottom: 8 }}>{'Perfil selecionado ou custom. Total: ' + (function() { var s = 0; var ks = Object.keys(aloc); for (var ki = 0; ki < ks.length; ki++) s += aloc[ks[ki]]; return s; })() + '%'}</Text>
            {CATEGORIAS.map(function(cat) {
              var cd3 = catData[cat.id];
              if (!cd3) return null;
              var catRend = efCapital * (aloc[cat.id] || 0) / 100 * cd3.dy / 100 / 12;
              var catRendMin = efCapital * (aloc[cat.id] || 0) / 100 * cd3.dyMin / 100 / 12;
              var catRendMax = efCapital * (aloc[cat.id] || 0) / 100 * cd3.dyMax / 100 / 12;
              var pvpLabel = cd3.pvp != null ? (cd3.pvp < 0.90 ? 'Desconto' : cd3.pvp > 1.10 ? 'Premio' : 'Justo') : null;
              var pvpColor = cd3.pvp != null ? (cd3.pvp < 0.90 ? '#22c55e' : cd3.pvp > 1.10 ? '#F59E0B' : C.dim) : null;

              return (
                <Glass key={cat.id} padding={12} style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: cat.color }} />
                      <Text style={{ fontSize: 13, fontFamily: F.display, color: C.text, fontWeight: '600' }}>{cat.name}</Text>
                      <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>{(aloc[cat.id] || 0) + '%'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {pvpLabel ? (
                        <View style={{ backgroundColor: pvpColor + '22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ fontSize: 8, color: pvpColor, fontFamily: F.mono, fontWeight: '700' }}>{pvpLabel + ' ' + (cd3.pvp ? cd3.pvp.toFixed(2) : '')}</Text>
                        </View>
                      ) : null}
                      <View style={{ backgroundColor: cd3.source === 'statusinvest' ? '#22c55e15' : C.yellow + '15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ fontSize: 8, color: cd3.source === 'statusinvest' ? '#22c55e' : C.yellow, fontFamily: F.mono }}>{cd3.source}</Text>
                      </View>
                    </View>
                  </View>
                  {/* Slider alocacao */}
                  <CustomSlider value={aloc[cat.id] || 0} min={0} max={60} step={5}
                    onValueChange={function(catId) { return function(v) { updateAloc(catId, v); }; }(cat.id)}
                    color={cat.color} />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View>
                      <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>DY {fmtPct(cd3.dy)} a.a.</Text>
                      <Sensitive><Text style={[{ fontSize: 14, fontWeight: '700', color: '#22c55e', fontFamily: F.mono }, ps]}>{'R$ ' + fmt(catRend) + '/mes'}</Text></Sensitive>
                      <Sensitive><Text style={[{ fontSize: 9, color: C.dim, fontFamily: F.mono }, ps]}>{'R$ ' + fmt(catRendMin) + ' - R$ ' + fmt(catRendMax)}</Text></Sensitive>
                    </View>
                    <MiniChart data={cd3.chart} outliers={cd3.outliers} width={80} height={30} />
                  </View>
                </Glass>
              );
            })}
          </View>

          {/* Outliers */}
          {outliers.length > 0 ? (
            <Glass padding={12} style={{ marginBottom: 14, borderColor: C.yellow + '30' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Ionicons name="warning-outline" size={14} color={C.yellow} />
                <Text style={{ fontSize: 12, fontFamily: F.display, color: C.yellow, fontWeight: '700' }}>Pagamentos atipicos detectados</Text>
              </View>
              {outliers.map(function(o, idx) {
                return (
                  <Text key={idx} style={{ fontSize: 11, color: C.sub, fontFamily: F.body, marginBottom: 4 }}>
                    {o.ticker + ' pagou R$ ' + fmt(o.valor) + ' em ' + o.mes + ' — ' + o.pctAcima + '% acima da media. Pode nao se repetir.'}
                  </Text>
                );
              })}
            </Glass>
          ) : null}

          {/* Sugestao de Carteira */}
          {Object.keys(tickerData).length > 0 ? (function() {
            // 1. Distribuir numAtivos entre categorias proporcionalmente ao % de alocacao
            var catAtivosMap = {};
            var ativosUsados = 0;
            var catsSorted = [];
            for (var sci = 0; sci < CATEGORIAS.length; sci++) {
              var scat = CATEGORIAS[sci];
              var catPctVal = aloc[scat.id] || 0;
              if (catPctVal <= 0) continue;
              var raw = numAtivos * catPctVal / 100;
              var floor = Math.max(1, Math.floor(raw));
              catAtivosMap[scat.id] = floor;
              ativosUsados += floor;
              catsSorted.push({ id: scat.id, frac: raw - floor });
            }
            // Distribuir sobra para categorias com maior fracao
            catsSorted.sort(function(a, b) { return b.frac - a.frac; });
            var sobra = numAtivos - ativosUsados;
            for (var sbi = 0; sbi < sobra && sbi < catsSorted.length; sbi++) {
              catAtivosMap[catsSorted[sbi].id]++;
            }

            // 2. Para cada categoria, pegar os N melhores tickers
            var sugestoes = [];
            var totalInvestido = 0;
            for (var sci2 = 0; sci2 < CATEGORIAS.length; sci2++) {
              var scat = CATEGORIAS[sci2];
              var catCapital = efCapital * (aloc[scat.id] || 0) / 100;
              var maxTickers = catAtivosMap[scat.id] || 0;
              if (catCapital <= 0 || maxTickers <= 0) continue;

              var catTickers = [];
              for (var sti = 0; sti < scat.tickers.length; sti++) {
                var std = tickerData[scat.tickers[sti]];
                if (std && std.price > 0) {
                  catTickers.push({ ticker: scat.tickers[sti], price: std.price, dy: std.dy, pvp: std.pvp || 1.0 });
                }
              }
              catTickers.sort(function(a, b) {
                if (Math.abs(a.pvp - b.pvp) > 0.05) return a.pvp - b.pvp;
                return b.dy - a.dy;
              });
              // Limitar ao numAtivos da categoria
              if (catTickers.length > maxTickers) catTickers = catTickers.slice(0, maxTickers);
              // Distribuir capital igualmente entre os selecionados
              var perTicker = catTickers.length > 0 ? catCapital / catTickers.length : 0;
              for (var ctj = 0; ctj < catTickers.length; ctj++) {
                var cotas = Math.floor(perTicker / catTickers[ctj].price);
                if (cotas <= 0) continue;
                var valorReal = cotas * catTickers[ctj].price;
                totalInvestido += valorReal;
                sugestoes.push({
                  ticker: catTickers[ctj].ticker,
                  cotas: cotas,
                  preco: catTickers[ctj].price,
                  valor: valorReal,
                  dy: catTickers[ctj].dy,
                  pvp: catTickers[ctj].pvp,
                  catName: scat.name,
                  catColor: scat.color,
                });
              }
            }

            return (
              <Glass padding={14} style={{ marginBottom: 14, borderColor: C.accent + '30' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Ionicons name="basket-outline" size={16} color={C.accent} />
                  <Text style={{ fontSize: 13, fontFamily: F.display, color: C.text, fontWeight: '700' }}>{'Sugestao de Carteira (' + sugestoes.length + ' FIIs)'}</Text>
                </View>
                <Sensitive>
                  <Text style={[{ fontSize: 11, color: C.sub, fontFamily: F.body, marginBottom: 10 }, ps]}>
                    {'R$ ' + fmtInt(efCapital) + ' em ' + sugestoes.length + ' FIIs, priorizando desconto (P/VP) e yield.'}
                  </Text>
                </Sensitive>

                {/* Header */}
                <View style={{ flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                  <Text style={{ flex: 2, fontSize: 9, color: C.dim, fontFamily: F.mono }}>FII</Text>
                  <Text style={{ flex: 1, fontSize: 9, color: C.dim, fontFamily: F.mono, textAlign: 'right' }}>Cotas</Text>
                  <Text style={{ flex: 1.5, fontSize: 9, color: C.dim, fontFamily: F.mono, textAlign: 'right' }}>Valor</Text>
                  <Text style={{ flex: 1, fontSize: 9, color: C.dim, fontFamily: F.mono, textAlign: 'right' }}>DY</Text>
                  <Text style={{ flex: 1, fontSize: 9, color: C.dim, fontFamily: F.mono, textAlign: 'right' }}>P/VP</Text>
                </View>

                {sugestoes.map(function(s, idx) {
                  var pvpColor = s.pvp < 0.90 ? '#22c55e' : s.pvp > 1.10 ? '#F59E0B' : C.sub;
                  return (
                    <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)' }}>
                      <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: s.catColor }} />
                        <Text style={{ fontSize: 11, color: C.text, fontFamily: F.mono, fontWeight: '600' }}>{s.ticker}</Text>
                      </View>
                      <Text style={{ flex: 1, fontSize: 11, color: C.sub, fontFamily: F.mono, textAlign: 'right' }}>{s.cotas}</Text>
                      <Sensitive><Text style={[{ flex: 1.5, fontSize: 11, color: C.text, fontFamily: F.mono, textAlign: 'right' }, ps]}>{fmtInt(s.valor)}</Text></Sensitive>
                      <Text style={{ flex: 1, fontSize: 11, color: '#22c55e', fontFamily: F.mono, textAlign: 'right' }}>{fmtPct(s.dy)}</Text>
                      <Text style={{ flex: 1, fontSize: 11, color: pvpColor, fontFamily: F.mono, textAlign: 'right' }}>{s.pvp.toFixed(2)}</Text>
                    </View>
                  );
                })}

                {/* Total */}
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 8, marginTop: 4 }}>
                  <Text style={{ flex: 2, fontSize: 11, color: C.text, fontFamily: F.display, fontWeight: '700' }}>Total</Text>
                  <Text style={{ flex: 1, fontSize: 11, color: C.dim, fontFamily: F.mono, textAlign: 'right' }}>{sugestoes.reduce(function(a, s) { return a + s.cotas; }, 0)}</Text>
                  <Sensitive><Text style={[{ flex: 1.5, fontSize: 11, color: '#22c55e', fontFamily: F.mono, fontWeight: '700', textAlign: 'right' }, ps]}>{'R$ ' + fmtInt(totalInvestido)}</Text></Sensitive>
                  <Text style={{ flex: 1, fontSize: 11, color: '#22c55e', fontFamily: F.mono, textAlign: 'right' }}>{fmtPct(dyTotal)}</Text>
                  <Text style={{ flex: 1 }} />
                </View>

                {/* Botao rebalanceamento */}
                <TouchableOpacity
                  onPress={function() {
                    // TODO: integrar com rebalanceamento — passar targets de FII
                    navigation.navigate('Analise', { scrollTo: 'rebalance', fiiTargets: sugestoes });
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: C.accent + '18', borderWidth: 1, borderColor: C.accent + '40' }}>
                  <Ionicons name="git-compare-outline" size={16} color={C.accent} />
                  <Text style={{ fontSize: 13, color: C.accent, fontFamily: F.display, fontWeight: '700' }}>Ver no Rebalanceamento</Text>
                </TouchableOpacity>
              </Glass>
            );
          })() : null}

          {/* Disclaimer */}
          <View style={{ paddingVertical: 16, paddingHorizontal: 8 }}>
            <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body, textAlign: 'center', lineHeight: 16 }}>
              {'Simulacao baseada em dados historicos de dividendos dos ultimos 12 meses via StatusInvest. FIIs sao isentos de IR para pessoa fisica. Rentabilidade passada nao garante rentabilidade futura. Nao constitui recomendacao de investimento.'}
            </Text>
          </View>

          <View style={{ height: 40 }} />
        </View>
      )}
    </ScrollView>
  );
}

var st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: SIZE.padding },
});
