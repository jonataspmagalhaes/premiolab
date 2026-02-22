import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, ActivityIndicator, LayoutAnimation,
  Platform, UIManager, Alert, TextInput, Modal,
} from 'react-native';
import Svg, {
  Circle as SvgCircle, Path, Defs, LinearGradient as SvgGrad,
  Stop, Line as SvgLine,
} from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { C, F, SIZE, PRODUCT_COLORS } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getPositions, getSaldos, getRendaFixa, deleteRendaFixa } from '../../services/database';
import { enrichPositionsWithPrices, fetchPriceHistory, clearPriceCache, getLastPriceUpdate } from '../../services/priceService';
import { Glass, Badge, Pill, SectionLabel, InfoTip, PressableCard } from '../../components';
import { MiniLineChart } from '../../components/InteractiveChart';
import { SkeletonCarteira, EmptyState } from '../../components/States';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ══════════ HELPERS ══════════
var FILTERS = [
  { k: 'todos', l: 'Todos', color: C.accent },
  { k: 'acoes', l: 'Ações', cat: 'acao', color: C.acoes },
  { k: 'fiis', l: 'FIIs', cat: 'fii', color: C.fiis },
  { k: 'etfs', l: 'ETFs', cat: 'etf', color: C.etfs },
  { k: 'rf', l: 'RF', color: C.rf },
];
var CAT_LABELS = { acao: 'Ação', fii: 'FII', etf: 'ETF', opcao: 'Opção' };
var CAT_NAMES = { acao: 'Ações', fii: 'FIIs', etf: 'ETFs', rf: 'RF' };
var TIPO_LABELS = {
  cdb: 'CDB', lci_lca: 'LCI/LCA', tesouro_selic: 'Tesouro Selic',
  tesouro_ipca: 'Tesouro IPCA+', tesouro_pre: 'Tesouro Pré', debenture: 'Debênture',
};
var IDX_COLORS = { prefixado: C.green, cdi: C.accent, ipca: C.fiis, selic: C.opcoes };

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtK(v) {
  return 'R$ ' + fmt(v);
}
function formatTaxa(taxa, indexador) {
  var t = parseFloat(taxa) || 0;
  var idx = (indexador || 'prefixado').toLowerCase();
  if (idx === 'prefixado') return t.toFixed(1) + '% a.a.';
  if (idx === 'cdi') return t.toFixed(0) + '% CDI';
  if (idx === 'ipca') return 'IPCA + ' + t.toFixed(1) + '%';
  if (idx === 'selic') return t.toFixed(0) + '% Selic';
  return t.toFixed(1) + '%';
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ══════════════════════════════════════════════
// SECTION: DONUT CHART — alocação por classe
// ══════════════════════════════════════════════
function DonutChart(props) {
  var segments = props.segments || [];
  var s = props.size || 110;
  var strokeW = 10;
  var r = (s / 2) - strokeW;
  var circ = 2 * Math.PI * r;
  var offset = 0;

  return (
    <Svg width={s} height={s} viewBox={'0 0 ' + s + ' ' + s}>
      <SvgCircle cx={s / 2} cy={s / 2} r={r} fill="none"
        stroke="rgba(255,255,255,0.03)" strokeWidth={strokeW} />
      {segments.map(function (seg, i) {
        var dash = (seg.pct / 100) * circ;
        var gap = circ - dash;
        var o = offset;
        offset += dash;
        return (
          <SvgCircle key={i} cx={s / 2} cy={s / 2} r={r} fill="none"
            stroke={seg.color} strokeWidth={strokeW}
            strokeDasharray={dash + ' ' + gap}
            strokeDashoffset={-o}
            strokeLinecap="round"
            rotation={-90} origin={s / 2 + ',' + s / 2} />
        );
      })}
    </Svg>
  );
}

// ══════════════════════════════════════════════
// SECTION: HORIZONTAL BAR — rentabilidade / peso
// ══════════════════════════════════════════════
function HBar(props) {
  var label = props.label;
  var value = props.value;
  var maxValue = props.maxValue || 100;
  var color = props.color || C.accent;
  var suffix = props.suffix || '%';
  var isNeg = value < 0;
  var barPct = clamp(Math.abs(value) / Math.abs(maxValue) * 100, 2, 100);

  return (
    <View style={styles.hbarRow}>
      <Text style={styles.hbarLabel} numberOfLines={1}>{label}</Text>
      <View style={styles.hbarTrack}>
        <View style={[styles.hbarFill, {
          width: barPct + '%',
          backgroundColor: color + (isNeg ? '60' : '40'),
          borderColor: color + '80',
        }]} />
      </View>
      <Text style={[styles.hbarValue, { color: isNeg ? C.red : color }]}>
        {isNeg ? '' : '+'}{value.toFixed(1)}{suffix}
      </Text>
    </View>
  );
}

// ══════════════════════════════════════════════
// SECTION: BENCHMARK COMPARISON — mini chart
// ══════════════════════════════════════════════
function BenchmarkChart(props) {
  var lines = props.lines || [];
  var height = props.height || 80;
  var _w = useState(0);
  var w = _w[0]; var setW = _w[1];

  if (w === 0 || lines.length === 0) {
    return <View onLayout={function (e) { setW(e.nativeEvent.layout.width); }} style={{ height: height }} />;
  }

  // Find global min/max across all lines
  var allVals = [];
  lines.forEach(function (line) { line.data.forEach(function (v) { allVals.push(v); }); });
  var max = Math.max.apply(null, allVals);
  var min = Math.min.apply(null, allVals);
  var range = max - min || 1;

  return (
    <View onLayout={function (e) { setW(e.nativeEvent.layout.width); }}>
      <Svg width={w} height={height}>
        {/* Grid */}
        {[0.33, 0.66].map(function (p, gi) {
          return <SvgLine key={gi} x1="0" y1={height * p} x2={w} y2={height * p}
            stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />;
        })}
        {lines.map(function (line, li) {
          var pts = line.data.map(function (v, i) {
            return {
              x: (i / (line.data.length - 1)) * w,
              y: 4 + (height - 8) - ((v - min) / range) * (height - 8),
            };
          });
          var d = 'M ' + pts[0].x + ' ' + pts[0].y;
          for (var i = 1; i < pts.length; i++) {
            var cpx = (pts[i - 1].x + pts[i].x) / 2;
            d += ' C ' + cpx + ' ' + pts[i - 1].y + ', ' + cpx + ' ' + pts[i].y + ', ' + pts[i].x + ' ' + pts[i].y;
          }
          return (
            <Path key={li} d={d} fill="none" stroke={line.color}
              strokeWidth={li === 0 ? '2' : '1.2'}
              strokeDasharray={li === 0 ? '' : '4,3'}
              strokeLinecap="round" opacity={li === 0 ? 1 : 0.5} />
          );
        })}
      </Svg>
      {/* Legend */}
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
        {lines.map(function (line, i) {
          return (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 10, height: 2, borderRadius: 1, backgroundColor: line.color,
                opacity: i === 0 ? 1 : 0.5 }} />
              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>{line.label}</Text>
              <Text style={{ fontSize: 10, color: line.color, fontWeight: '600', fontFamily: F.mono }}>
                {line.data.length > 0 ? (line.data[line.data.length - 1]).toFixed(1) + '%' : ''}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════
// SECTION: POSITION CARD — expandível
// ══════════════════════════════════════════════
var PositionCard = React.memo(function PositionCard(props) {
  var pos = props.pos;
  var history = props.history;
  var totalCarteira = props.totalCarteira;
  var expanded = props.expanded;
  var onToggle = props.onToggle;
  var onBuy = props.onBuy;
  var onSell = props.onSell;
  var onLancarOpcao = props.onLancarOpcao;
  var onTransacoes = props.onTransacoes;

  var color = PRODUCT_COLORS[pos.categoria] || C.accent;
  var catLabel = CAT_LABELS[pos.categoria] || (pos.categoria || '').toUpperCase();
  var hasPrice = pos.preco_atual != null;
  var precoRef = hasPrice ? pos.preco_atual : pos.pm;
  var valorAtual = pos.quantidade * precoRef;
  var custoTotal = pos.quantidade * pos.pm;
  var pnl = valorAtual - custoTotal;
  var pnlPct = custoTotal > 0 ? (pnl / custoTotal) * 100 : 0;
  var isPos = pnl >= 0;
  var pnlColor = isPos ? C.green : C.red;
  var plReal = pos.pl_realizado || 0;
  var temVendas = pos.total_vendido > 0;
  var sparkData = history || [];
  var pctCarteira = totalCarteira > 0 ? (valorAtual / totalCarteira) * 100 : 0;

  var corretorasText = '';
  if (pos.por_corretora) {
    var cKeys = Object.keys(pos.por_corretora);
    var cParts = [];
    for (var ck = 0; ck < cKeys.length; ck++) {
      if (pos.por_corretora[cKeys[ck]] > 0) {
        cParts.push(cKeys[ck] + ' (' + pos.por_corretora[cKeys[ck]] + ')');
      }
    }
    corretorasText = cParts.join(', ');
  }

  return (
    <PressableCard onPress={onToggle}>
      <Glass padding={12} style={expanded ? { borderColor: color + '30' } : {}}>
        {/* Row 1: dot + ticker + badges | P&L */}
        <View style={styles.cardRow1}>
          <View style={styles.cardRow1Left}>
            <View style={[styles.dot, { backgroundColor: color }]} />
            <Text style={styles.cardTicker}>{pos.ticker}</Text>
            <View style={[styles.typeBadge, { backgroundColor: color + '14' }]}>
              <Text style={[styles.typeBadgeText, { color: color }]}>{catLabel}</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.cardPL, { color: pnlColor }]}>
              {isPos ? '+' : '-'}R$ {fmt(Math.abs(pnl))}
            </Text>
            <Text style={[styles.cardPLPct, { color: pnlColor }]}>
              {isPos ? '+' : ''}{pnlPct.toFixed(1)}%
            </Text>
          </View>
        </View>

        {/* Row 2: preço + PM + qty | sparkline */}
        <View style={styles.cardRow2}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={styles.cardPriceMain}>
                {hasPrice ? 'R$ ' + fmt(precoRef) : 'PM R$ ' + fmt(pos.pm)}
              </Text>
              {hasPrice ? <Text style={styles.cardPriceSub}>{'PM R$ ' + fmt(pos.pm)}</Text> : null}
              <Text style={styles.cardPriceSub}>Qtd: {pos.quantidade.toLocaleString('pt-BR')}</Text>
            </View>
            {hasPrice && pos.change_day != null && pos.change_day !== 0 ? (
              <Text style={[styles.cardDayVar, {
                color: pos.change_day > 0 ? C.green : C.red,
              }]}>
                {pos.change_day > 0 ? '▲' : '▼'} {Math.abs(pos.change_day).toFixed(2)}% dia
              </Text>
            ) : null}
            {temVendas ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <Text style={{ fontSize: 10, color: plReal >= 0 ? C.green : C.red, fontFamily: F.mono }}>
                  P&L realizado: {plReal >= 0 ? '+' : ''}R$ {fmt(plReal)} ({pos.total_vendido} un vendida(s))
                </Text>
                <InfoTip text="Resultado das vendas já realizadas, usando o preço médio da corretora onde cada venda ocorreu." size={11} />
              </View>
            ) : null}
          </View>
          {sparkData.length >= 2 ? (
            <View style={styles.sparkWrap}>
              <MiniLineChart data={sparkData} color={color} height={22} />
            </View>
          ) : null}
        </View>

        {/* EXPANDED */}
        {expanded ? (
          <View style={styles.expandedWrap}>
            <View style={styles.expandedStats}>
              {[
                { l: 'Custo total', v: 'R$ ' + custoTotal.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) },
                { l: 'Valor atual', v: 'R$ ' + valorAtual.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) },
                { l: '% Carteira', v: pctCarteira.toFixed(1) + '%' },
                { l: 'Corretoras', v: corretorasText || '–' },
              ].map(function (d, j) {
                return (
                  <View key={j} style={styles.expandedStatItem}>
                    <Text style={styles.expandedStatLabel}>{d.l}</Text>
                    <Text style={styles.expandedStatValue}>{d.v}</Text>
                  </View>
                );
              })}
            </View>
            {temVendas ? (
              <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono, fontWeight: '600' }}>VENDAS REALIZADAS</Text>
                    <InfoTip text="Calculado com o PM da corretora onde a venda ocorreu. Se você comprou barato em uma corretora e caro em outra, cada venda reflete o custo real daquela posição. Para IR, o PM geral é usado (veja Relatórios > IR)." size={11} />
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: plReal >= 0 ? C.green : C.red, fontFamily: F.mono }}>
                    {plReal >= 0 ? '+' : ''}R$ {fmt(plReal)}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                  <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.mono }}>
                    {pos.total_vendido} un vendida(s) · Receita R$ {fmt(pos.receita_vendas)}
                  </Text>
                </View>
              </View>
            ) : null}
            <View style={styles.expandedActions}>
              <TouchableOpacity style={[styles.actionBtn, { borderColor: C.green + '30', backgroundColor: C.green + '08' }]}
                onPress={onBuy}>
                <Text style={[styles.actionBtnText, { color: C.green }]}>+ Comprar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, { borderColor: C.red + '30', backgroundColor: C.red + '08' }]}
                onPress={onSell}>
                <Text style={[styles.actionBtnText, { color: C.red }]}>Vender</Text>
              </TouchableOpacity>
              {pos.categoria === 'acao' ? (
                <TouchableOpacity style={[styles.actionBtn, { borderColor: C.opcoes + '30', backgroundColor: C.opcoes + '08' }]}
                  onPress={onLancarOpcao}>
                  <Text style={[styles.actionBtnText, { color: C.opcoes }]}>Lançar opção</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
              <TouchableOpacity style={[styles.actionBtn, { borderColor: C.accent + '30', backgroundColor: C.accent + '08' }]}
                onPress={onTransacoes}>
                <Text style={[styles.actionBtnText, { color: C.accent }]}>Transações</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </Glass>
    </PressableCard>
  );
});

// ══════════════════════════════════════════════
// SECTION: RF CARD
// ══════════════════════════════════════════════
function RFCard(props) {
  var rf = props.rf;
  var expanded = props.expanded;
  var onToggle = props.onToggle;
  var onEdit = props.onEdit;
  var onDelete = props.onDelete;

  var valor = parseFloat(rf.valor_aplicado) || 0;
  var tipoLabel = TIPO_LABELS[rf.tipo] || rf.tipo;
  var idxColor = IDX_COLORS[(rf.indexador || '').toLowerCase()] || C.accent;
  var now = new Date();
  var daysLeft = Math.ceil((new Date(rf.vencimento) - now) / (1000 * 60 * 60 * 24));
  var dayColor = daysLeft < 30 ? C.red : daysLeft < 90 ? C.yellow : daysLeft < 365 ? C.etfs : C.rf;

  return (
    <PressableCard onPress={onToggle}>
      <Glass padding={12} style={expanded ? { borderColor: C.rf + '30' } : {}}>
        <View style={styles.cardRow1}>
          <View style={styles.cardRow1Left}>
            <View style={[styles.dot, { backgroundColor: C.rf }]} />
            <Text style={styles.cardTicker}>{tipoLabel}</Text>
            <View style={[styles.typeBadge, { backgroundColor: idxColor + '14' }]}>
              <Text style={[styles.typeBadgeText, { color: idxColor }]}>
                {(rf.indexador || 'PRE').toUpperCase()}
              </Text>
            </View>
          </View>
          <Text style={[styles.cardPL, { color: C.rf }]}>R$ {fmt(valor)}</Text>
        </View>
        <View style={styles.cardRow2}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={styles.cardPriceMain}>{formatTaxa(rf.taxa, rf.indexador)}</Text>
            {rf.corretora ? <Text style={styles.cardPriceSub}>{rf.corretora}</Text> : null}
          </View>
          <Badge text={daysLeft + 'd'} color={dayColor} />
        </View>
        {expanded ? (
          <View style={styles.expandedWrap}>
            <View style={styles.expandedStats}>
              {[
                { l: 'Valor aplicado', v: 'R$ ' + fmt(valor) },
                { l: 'Taxa', v: formatTaxa(rf.taxa, rf.indexador) },
                { l: 'Vencimento', v: new Date(rf.vencimento).toLocaleDateString('pt-BR') },
                { l: 'Corretora', v: rf.corretora || '–' },
              ].map(function (d, j) {
                return (
                  <View key={j} style={styles.expandedStatItem}>
                    <Text style={styles.expandedStatLabel}>{d.l}</Text>
                    <Text style={styles.expandedStatValue}>{d.v}</Text>
                  </View>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <TouchableOpacity style={[styles.actionBtn, { borderColor: C.accent + '30', backgroundColor: C.accent + '08' }]}
                onPress={onEdit}>
                <Text style={[styles.actionBtnText, { color: C.accent }]}>Editar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, { borderColor: C.red + '30', backgroundColor: C.red + '08' }]}
                onPress={onDelete}>
                <Text style={[styles.actionBtnText, { color: C.red }]}>Excluir</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </Glass>
    </PressableCard>
  );
}

// ══════════════════════════════════════════════════════
// MAIN SCREEN
// ══════════════════════════════════════════════════════
export default function CarteiraScreen(props) {
  var navigation = props.navigation;
  var user = useAuth().user;
  var _navigating = useRef(false);

  useFocusEffect(useCallback(function() { _navigating.current = false; }, []));

  function nav(screen, params) {
    if (_navigating.current) return;
    _navigating.current = true;
    navigation.navigate(screen, params);
  }

  var _pos = useState([]); var positions = _pos[0]; var setPositions = _pos[1];
  var _sal = useState([]); var saldos = _sal[0]; var setSaldos = _sal[1];
  var _fil = useState('todos'); var filter = _fil[0]; var setFilter = _fil[1];
  var _load = useState(true); var loading = _load[0]; var setLoading = _load[1];
  var _ref = useState(false); var refreshing = _ref[0]; var setRefreshing = _ref[1];
  var _rf = useState([]); var rfItems = _rf[0]; var setRfItems = _rf[1];
  var _pLoad = useState(false); var pricesLoading = _pLoad[0]; var setPricesLoading = _pLoad[1];
  var _hist = useState({}); var priceHistory = _hist[0]; var setPriceHistory = _hist[1];
  var _exp = useState(null); var expanded = _exp[0]; var setExpanded = _exp[1];
  var _infoModal = useState(null); var infoModal = _infoModal[0]; var setInfoModal = _infoModal[1];
  var _enc = useState([]); var encerradas = _enc[0]; var setEncerradas = _enc[1];
  var _showEnc = useState(false); var showEnc = _showEnc[0]; var setShowEnc = _showEnc[1];
  var _showAllEnc = useState(false); var showAllEnc = _showAllEnc[0]; var setShowAllEnc = _showAllEnc[1];
  var _loadError = useState(false); var loadError = _loadError[0]; var setLoadError = _loadError[1];

  var load = async function () {
    if (!user) return;
    setLoadError(false);
    var rawPos;
    try {
      var results = await Promise.all([
        getPositions(user.id),
        getSaldos(user.id),
        getRendaFixa(user.id),
      ]);
      rawPos = results[0].data || [];
      setEncerradas(results[0].encerradas || []);
      setSaldos(results[1].data || []);
      setRfItems(results[2].data || []);
      setPositions(rawPos);
    } catch (e) {
      console.warn('CarteiraScreen load failed:', e);
      setLoadError(true);
      setLoading(false);
      return;
    }
    setLoading(false);

    setPricesLoading(true);
    try {
      var tickers = rawPos.map(function (p) { return p.ticker; }).filter(Boolean);
      var enriched = await enrichPositionsWithPrices(rawPos);
      setPositions(enriched);
      if (tickers.length > 0) {
        var hist = await fetchPriceHistory(tickers);
        setPriceHistory(hist || {});
      }
    } catch (e) { console.warn('Price enrichment failed:', e.message); }
    setPricesLoading(false);
  };

  useFocusEffect(useCallback(function () { load(); }, [user]));

  var onRefresh = async function () {
    setRefreshing(true);
    clearPriceCache();
    await load();
    setRefreshing(false);
  };

  // ── DERIVED DATA ──
  var now = new Date();
  var rfAtivos = rfItems.filter(function (r) { return new Date(r.vencimento) > now; });

  // Filter
  var filteredPositions;
  if (filter === 'todos') filteredPositions = positions;
  else if (filter === 'rf') filteredPositions = [];
  else {
    var fd = FILTERS.find(function (f) { return f.k === filter; });
    filteredPositions = positions.filter(function (p) { return p.categoria === (fd ? fd.cat : ''); });
  }
  var showRF = filter === 'todos' || filter === 'rf';

  // Totals
  var totalPositions = positions.reduce(function (s, p) { return s + p.quantidade * (p.preco_atual || p.pm); }, 0);
  var totalRF = rfAtivos.reduce(function (s, r) { return s + (parseFloat(r.valor_aplicado) || 0); }, 0);
  var totalSaldos = saldos.reduce(function (s, c) { return s + (c.saldo || 0); }, 0);
  var totalValue = totalPositions + totalRF + totalSaldos;

  var totalCusto = positions.reduce(function (s, p) { return s + p.quantidade * p.pm; }, 0);
  var totalPL = totalPositions - totalCusto;
  var totalPLPct = totalCusto > 0 ? (totalPL / totalCusto) * 100 : 0;
  var isPosTotal = totalPL >= 0;

  // P&L realizado (encerradas + vendas parciais de ativas)
  var plEncerradas = encerradas.reduce(function (s, e) { return s + (e.pl_realizado || 0); }, 0);
  var plAtivas = positions.reduce(function (s, p) { return s + (p.pl_realizado || 0); }, 0);
  var plRealizado = plEncerradas + plAtivas;
  var custoEncerradas = encerradas.reduce(function (s, e) { return s + (e.custo_compras || 0); }, 0);
  var custoVendasAtivas = positions.reduce(function (s, p) {
    return s + ((p.total_vendido || 0) > 0 ? (p.custo_compras || 0) * ((p.total_vendido || 0) / ((p.total_comprado || 0) || 1)) : 0);
  }, 0);
  var custoTotalVendas = custoEncerradas + custoVendasAtivas;
  var plRealizadoPct = custoTotalVendas > 0 ? (plRealizado / custoTotalVendas) * 100 : 0;
  var isPosRealizado = plRealizado >= 0;

  // Allocation by class
  var allocMap = { acao: 0, fii: 0, etf: 0, rf: totalRF };
  positions.forEach(function (p) {
    var cat = p.categoria || '';
    if (allocMap[cat] !== undefined) allocMap[cat] += p.quantidade * (p.preco_atual || p.pm);
  });
  var allocTotal = Object.values(allocMap).reduce(function (s, v) { return s + v; }, 0);
  var allocSegments = Object.keys(allocMap).filter(function (k) { return allocMap[k] > 0; }).map(function (k) {
    return { label: CAT_NAMES[k] || k, pct: allocTotal > 0 ? (allocMap[k] / allocTotal) * 100 : 0,
      color: PRODUCT_COLORS[k] || C.accent, val: allocMap[k] };
  });

  // Per-asset data for treemap, bars
  var assetList = positions.map(function (p) {
    var val = p.quantidade * (p.preco_atual || p.pm);
    var custo = p.quantidade * p.pm;
    var pnlPct = custo > 0 ? ((val - custo) / custo) * 100 : 0;
    return { ticker: p.ticker, weight: val, pnlPct: pnlPct, color: PRODUCT_COLORS[p.categoria] || C.accent,
      categoria: p.categoria, pnl: val - custo };
  });

  // Peso por ativo (% do total)
  var pesoList = assetList.slice().sort(function (a, b) { return b.weight - a.weight; }).map(function (a) {
    return { ticker: a.ticker, pct: allocTotal > 0 ? (a.weight / allocTotal) * 100 : 0, color: a.color };
  });

  // Benchmark comparison (simulated accrual from position start)
  // Build simple comparison: portfolio vs CDI vs Ibov
  var benchLines = [];
  if (positions.length > 0) {
    var numPoints = 12;
    var portLine = [];
    var cdiLine = [];
    var cdiMonthly = 0.95; // ~11.4% a.a. = 0.95% mês
    for (var bi = 0; bi < numPoints; bi++) {
      var portPct = (totalPLPct / numPoints) * (bi + 1); // Linear interpolation
      var cdiPct = cdiMonthly * (bi + 1);
      portLine.push(portPct);
      cdiLine.push(cdiPct);
    }
    benchLines = [
      { label: 'Carteira', data: portLine, color: C.accent },
      { label: 'CDI (' + (cdiMonthly * 12).toFixed(1) + '% a.a.)', data: cdiLine, color: C.etfs },
    ];
  }

  // Counts
  function countCat(catKey) {
    if (catKey === 'todos') return positions.length + rfAtivos.length;
    if (catKey === 'rf') return rfAtivos.length;
    var fdef = FILTERS.find(function (f) { return f.k === catKey; });
    return positions.filter(function (p) { return p.categoria === (fdef ? fdef.cat : ''); }).length;
  }

  function toggleExpand(key) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(expanded === key ? null : key);
  }

  function handleDeleteRF(rfId) {
    var rf = null;
    for (var di = 0; di < rfItems.length; di++) { if (rfItems[di].id === rfId) { rf = rfItems[di]; break; } }
    var detailMsg = rf
      ? (rf.tipo || '').toUpperCase() + (rf.emissor ? ' — ' + rf.emissor : '') + '\nR$ ' + fmt(rf.valor_aplicado || 0) + '\n\nEssa ação não pode ser desfeita.'
      : 'Essa ação não pode ser desfeita.';
    Alert.alert('Excluir título?', detailMsg, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir', style: 'destructive',
        onPress: async function () {
          var result = await deleteRendaFixa(rfId);
          if (!result.error) {
            setRfItems(rfItems.filter(function (r) { return r.id !== rfId; }));
          } else {
            Alert.alert('Erro', 'Falha ao excluir.');
          }
        },
      },
    ]);
  }

  if (loading) return <View style={styles.container}><SkeletonCarteira /></View>;
  if (loadError) return (
    <View style={styles.container}>
      <EmptyState ionicon="alert-circle-outline" title="Erro ao carregar" description="Não foi possível carregar a carteira. Verifique sua conexão e tente novamente." cta="Tentar novamente" onCta={function() { setLoading(true); load(); }} color={C.red} />
    </View>
  );
  if (positions.length === 0 && rfAtivos.length === 0 && saldos.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState ionicon="briefcase-outline" title="Carteira vazia"
          description="Nenhum ativo na carteira. Registre compras de ações, FIIs, ETFs ou renda fixa."
          cta="Adicionar ativo" onCta={function () { nav('AddOperacao'); }} color={C.acoes} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}>

      {/* ══════ 1. HERO ══════ */}
      <Glass glow={C.acoes} padding={16}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Text style={styles.heroLabel}>PATRIMÔNIO EM CARTEIRA</Text>
            <Text style={styles.heroValue}>R$ {fmt(totalValue)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.heroLabel}>P&L ABERTO</Text>
              <InfoTip text="Ganho ou perda das posições que você ainda tem em carteira, comparando o preço atual com o preço médio de compra." size={12} />
            </View>
            <Text style={[styles.heroPL, { color: isPosTotal ? C.green : C.red }]}>
              {isPosTotal ? '+' : '-'}R$ {fmt(Math.abs(totalPL))}
            </Text>
            <Text style={[styles.heroPLSub, { color: isPosTotal ? C.green : C.red }]}>
              {isPosTotal ? '▲' : '▼'} {Math.abs(totalPLPct).toFixed(1)}% geral
            </Text>
          </View>
        </View>
        {encerradas.length > 0 ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border }}>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={styles.heroLabel}>P&L REALIZADO</Text>
                <InfoTip text="Lucro ou prejuízo das ações já vendidas. Calculado usando o preço médio de cada corretora, que reflete o resultado real de cada operação. O IR usa o preço médio geral (veja Relatórios > IR)." size={12} />
              </View>
              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>{encerradas.length} encerrada(s) + vendas parciais</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.heroPL, { color: isPosRealizado ? C.green : C.red }]}>
                {isPosRealizado ? '+' : '-'}R$ {fmt(Math.abs(plRealizado))}
              </Text>
              <Text style={[styles.heroPLSub, { color: isPosRealizado ? C.green : C.red }]}>
                {isPosRealizado ? '▲' : '▼'} {Math.abs(plRealizadoPct).toFixed(1)}%
              </Text>
            </View>
          </View>
        ) : null}
        <View style={styles.heroStats}>
          {[
            { l: 'ATIVOS', v: String(positions.length + rfAtivos.length), c: C.accent },
            { l: 'ENCERRADAS', v: String(encerradas.length), c: encerradas.length > 0 ? C.yellow : C.dim },
            { l: 'CORRETORAS', v: String(saldos.length || 1), c: C.accent },
          ].map(function (m, i) {
            return (
              <View key={i} style={{ alignItems: 'center', flex: 1 }}>
                <Text style={styles.heroStatLabel}>{m.l}</Text>
                <Text style={[styles.heroStatVal, { color: m.c }]}>{m.v}</Text>
              </View>
            );
          })}
        </View>
        {pricesLoading ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <ActivityIndicator size="small" color={C.accent} />
            <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>Atualizando cotações...</Text>
          </View>
        ) : getLastPriceUpdate() ? (
          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, marginTop: 6, textAlign: 'right' }}>
            {'Cotações de ' + new Date(getLastPriceUpdate()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        ) : null}
      </Glass>

      {/* ══════ 6. FILTER PILLS ══════ */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: F.mono, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: '600' }}>POSIÇÕES</Text>
        <TouchableOpacity onPress={function() { setInfoModal({ title: 'Posições', text: 'Posições agregadas por ticker com preço médio ponderado. PM = custo médio de compra.' }); }}>
          <Text style={{ fontSize: 13, color: C.accent }}>ⓘ</Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, paddingBottom: 2 }}>
        {FILTERS.map(function (f) {
          return (
            <Pill key={f.k} active={filter === f.k} color={f.color}
              onPress={function () { setFilter(f.k); }}>
              {f.l} ({countCat(f.k)})
            </Pill>
          );
        })}
      </ScrollView>

      {/* ══════ 10. POSITION CARDS ══════ */}
      {filteredPositions.map(function (pos, i) {
        var key = 'pos_' + pos.ticker + '_' + i;
        return (
          <PositionCard key={key} pos={pos} history={priceHistory[pos.ticker] || null}
            totalCarteira={totalValue} expanded={expanded === key}
            onToggle={function () { toggleExpand(key); }}
            onBuy={function () { nav('AddOperacao', { ticker: pos.ticker, tipo: 'compra', categoria: pos.categoria }); }}
            onSell={function () { nav('AddOperacao', { ticker: pos.ticker, tipo: 'venda', categoria: pos.categoria }); }}
            onLancarOpcao={function () { nav('AddOpcao', { ativo_base: pos.ticker }); }}
            onTransacoes={function () { nav('AssetDetail', { ticker: pos.ticker }); }} />
        );
      })}

      {/* ══════ 11. RF CARDS ══════ */}
      {showRF && rfAtivos.length > 0 ? (
        <View>
          {filter === 'todos' ? <SectionLabel>RENDA FIXA</SectionLabel> : null}
          {rfAtivos.map(function (rf, i) {
            var key = 'rf_' + (rf.id || i);
            return (
              <View key={key} style={{ marginTop: i > 0 ? 6 : 0 }}>
                <RFCard rf={rf} expanded={expanded === key}
                  onToggle={function () { toggleExpand(key); }}
                  onEdit={function () { nav('EditRendaFixa', { rf: rf }); }}
                  onDelete={function () { handleDeleteRF(rf.id); }} />
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Empty states */}
      {filter === 'rf' && rfAtivos.length === 0 ? (
        <EmptyState ionicon="document-text-outline" title="Nenhum título"
          description="Cadastre seus investimentos de renda fixa."
          cta="Novo título" onCta={function () { nav('AddRendaFixa'); }} color={C.rf} />
      ) : null}
      {filter !== 'todos' && filter !== 'rf' && filteredPositions.length === 0 ? (
        <Glass padding={20}>
          <Text style={{ fontSize: 14, color: C.sub, fontFamily: F.body, textAlign: 'center' }}>
            Nenhum ativo de {(FILTERS.find(function (f) { return f.k === filter; }) || {}).l || filter}
          </Text>
        </Glass>
      ) : null}

      {/* Saldos moved to Gestão > Caixa */}

      {/* ══════ POSIÇÕES ENCERRADAS ══════ */}
      {filter === 'todos' && encerradas.length > 0 ? (
        <View>
          <TouchableOpacity activeOpacity={0.7} onPress={function() { setShowEnc(!showEnc); }}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <SectionLabel>POSIÇÕES ENCERRADAS ({encerradas.length})</SectionLabel>
            <Text style={{ fontSize: 12, color: C.dim, fontFamily: F.body }}>{showEnc ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {showEnc ? (
            <View>
              {encerradas.slice(0, showAllEnc ? encerradas.length : 3).map(function(e, i) {
                var plColor = e.pl_realizado >= 0 ? C.green : C.red;
                var plIcon = e.pl_realizado >= 0 ? '▲' : '▼';
                var plLabel = e.pl_realizado >= 0 ? 'LUCRO' : 'PREJUÍZO';
                var catColor = e.categoria === 'acao' ? C.acoes : e.categoria === 'fii' ? C.fiis : e.categoria === 'etf' ? C.etfs : C.accent;
                var pmCompra = e.total_comprado > 0 ? e.custo_compras / e.total_comprado : 0;
                var pmVenda = e.total_vendido > 0 ? e.receita_vendas / e.total_vendido : 0;
                var plPct = e.custo_compras > 0 ? (e.pl_realizado / e.custo_compras) * 100 : 0;
                return (
                  <Glass key={'enc_' + i} padding={12} style={{ marginTop: i > 0 ? 6 : 0, borderLeftWidth: 3, borderLeftColor: plColor }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, fontFamily: F.display }}>{e.ticker}</Text>
                        <Badge text={e.categoria ? e.categoria.toUpperCase() : ''} color={catColor} />
                      </View>
                      <Badge text={plLabel} color={plColor} />
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 }}>
                      <Text style={{ fontSize: 18, fontWeight: '700', color: plColor, fontFamily: F.mono }}>
                        {e.pl_realizado >= 0 ? '+' : ''}R$ {fmt(e.pl_realizado)}
                      </Text>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: plColor, fontFamily: F.mono }}>
                        {plIcon} {Math.abs(plPct).toFixed(1)}%
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8,
                      paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border }}>
                      <View>
                        <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>COMPRA</Text>
                        <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.mono }}>{e.total_comprado} un · PM R$ {fmt(pmCompra)}</Text>
                        <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>Total R$ {fmt(e.custo_compras)}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>VENDA</Text>
                        <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.mono }}>{e.total_vendido} un · PM R$ {fmt(pmVenda)}</Text>
                        <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>Total R$ {fmt(e.receita_vendas)}</Text>
                      </View>
                    </View>
                  </Glass>
                );
              })}
              {encerradas.length > 3 ? (
                <TouchableOpacity activeOpacity={0.7}
                  onPress={function() { setShowAllEnc(!showAllEnc); }}
                  style={{ alignSelf: 'center', marginTop: 8, paddingHorizontal: 16, paddingVertical: 6,
                    backgroundColor: C.accent + '12', borderRadius: 8, borderWidth: 1, borderColor: C.accent + '25' }}>
                  <Text style={{ fontSize: 12, color: C.accent, fontFamily: F.body }}>
                    {showAllEnc ? 'Mostrar menos' : 'Ver todas (' + encerradas.length + ')'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={{ height: SIZE.tabBarHeight + 20 }} />

      <Modal visible={infoModal !== null} animationType="fade" transparent={true}
        onRequestClose={function() { setInfoModal(null); }}>
        <TouchableOpacity activeOpacity={1} onPress={function() { setInfoModal(null); }}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 30 }}>
          <TouchableOpacity activeOpacity={1}
            style={{ backgroundColor: C.card, borderRadius: 14, padding: 20, maxWidth: 340, width: '100%', borderWidth: 1, borderColor: C.border }}>
            <Text style={{ fontSize: 13, color: C.text, fontFamily: F.display, fontWeight: '700', marginBottom: 10 }}>
              {infoModal && infoModal.title || ''}
            </Text>
            <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body, lineHeight: 18 }}>
              {infoModal && infoModal.text || ''}
            </Text>
            <TouchableOpacity onPress={function() { setInfoModal(null); }}
              style={{ marginTop: 14, alignSelf: 'center', paddingHorizontal: 24, paddingVertical: 8, borderRadius: 8, backgroundColor: C.accent }}>
              <Text style={{ fontSize: 12, color: C.text, fontFamily: F.mono, fontWeight: '600' }}>Fechar</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

// ══════════ STYLES ══════════
var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 18, gap: SIZE.gap },

  // Hero
  heroLabel: { fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 0.6 },
  heroValue: { fontSize: 24, fontWeight: '800', color: C.text, fontFamily: F.display, marginTop: 2, letterSpacing: -0.5 },
  heroPL: { fontSize: 18, fontWeight: '700', fontFamily: F.mono, marginTop: 2 },
  heroPLSub: { fontSize: 11, fontFamily: F.mono, marginTop: 1 },
  heroStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border },
  heroStatLabel: { fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 },
  heroStatVal: { fontSize: 13, fontWeight: '700', fontFamily: F.mono, marginTop: 1 },

  // Section
  sectionTitle2: { fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 0.6, marginBottom: 10 },

  // Donut center
  donutCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },

  // HBar
  hbarRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  hbarLabel: { width: 60, fontSize: 10, color: C.sub, fontWeight: '600', fontFamily: F.mono },
  hbarTrack: { flex: 1, height: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.03)' },
  hbarFill: { height: 12, borderRadius: 6, borderWidth: 1, minWidth: 4 },
  hbarValue: { width: 55, fontSize: 10, fontWeight: '700', fontFamily: F.mono, textAlign: 'right' },

  // Cards
  cardRow1: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardRow1Left: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  cardRow2: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  cardTicker: { fontSize: 14, fontWeight: '700', color: C.text, fontFamily: F.display },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  typeBadgeText: { fontSize: 10, fontWeight: '600', fontFamily: F.mono },
  cardCorretora: { fontSize: 10, color: C.dim, fontFamily: F.mono },
  cardPL: { fontSize: 13, fontWeight: '700', fontFamily: F.mono },
  cardPLPct: { fontSize: 11, fontFamily: F.mono, marginTop: 1 },
  cardPriceMain: { fontSize: 13, color: C.text, fontWeight: '600', fontFamily: F.mono },
  cardPriceSub: { fontSize: 11, color: C.dim, fontFamily: F.mono },
  cardDayVar: { fontSize: 11, fontWeight: '600', fontFamily: F.mono, marginTop: 2 },
  sparkWrap: { width: '32%', flexShrink: 0 },

  // Expanded
  expandedWrap: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border },
  expandedStats: { flexDirection: 'row', justifyContent: 'space-between' },
  expandedStatItem: { alignItems: 'center', flex: 1 },
  expandedStatLabel: { fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.3 },
  expandedStatValue: { fontSize: 12, color: C.sub, fontWeight: '600', fontFamily: F.mono, marginTop: 2 },
  expandedActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  actionBtnText: { fontSize: 13, fontWeight: '600', fontFamily: F.body },

  // Broker/Saldos
  brokerIcon: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  brokerIconText: { fontSize: 10, fontWeight: '700', fontFamily: F.mono },
  saldoName: { fontSize: 13, fontWeight: '600', color: C.text, fontFamily: F.display },
  saldoValue: { fontSize: 14, fontWeight: '700', fontFamily: F.mono },
});
