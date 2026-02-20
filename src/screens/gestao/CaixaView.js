import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, TextInput, LayoutAnimation,
  Platform, UIManager, Alert,
} from 'react-native';
import Svg, { Rect, Line as SvgLine, Text as SvgText } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import {
  getSaldos, upsertSaldo, deleteSaldo,
  getMovimentacoes, addMovimentacaoComSaldo, getMovimentacoesSummary,
  buildMovDescricao,
} from '../../services/database';
import { Glass, Badge, Pill, SectionLabel } from '../../components';
import { LoadingScreen } from '../../components/States';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

var CAT_ICONS = {
  deposito: '↓', retirada: '↑', transferencia: '→',
  compra_ativo: '↓', venda_ativo: '↑',
  premio_opcao: '↓', recompra_opcao: '↑', exercicio_opcao: '↑',
  dividendo: '↓', jcp: '↓', rendimento_fii: '↓', rendimento_rf: '↓',
  ajuste_manual: '●', salario: '↓',
  despesa_fixa: '↑', despesa_variavel: '↑', outro: '●',
};

var CAT_LABELS = {
  deposito: 'Depósito', retirada: 'Retirada', transferencia: 'Transferência',
  compra_ativo: 'Compra ativo', venda_ativo: 'Venda ativo',
  premio_opcao: 'Prêmio opção', recompra_opcao: 'Recompra opção',
  exercicio_opcao: 'Exercício', dividendo: 'Dividendo',
  jcp: 'JCP', rendimento_fii: 'Rendimento FII', rendimento_rf: 'Rendimento RF',
  ajuste_manual: 'Ajuste', salario: 'Salário',
  despesa_fixa: 'Despesa fixa', despesa_variavel: 'Despesa variável', outro: 'Outro',
};

// ══════════════════════════════════════════════
// SECTION: BAR CHART — Entradas vs Saídas 6 meses
// ══════════════════════════════════════════════
function BarChart6m(props) {
  var data = props.data || [];
  var _w = useState(0); var w = _w[0]; var setW = _w[1];
  var chartH = 120;
  var barPad = 4;

  if (w === 0 || data.length === 0) {
    return <View onLayout={function(e) { setW(e.nativeEvent.layout.width); }} style={{ height: chartH + 30 }} />;
  }

  var maxVal = 0;
  for (var i = 0; i < data.length; i++) {
    if (data[i].entradas > maxVal) maxVal = data[i].entradas;
    if (data[i].saidas > maxVal) maxVal = data[i].saidas;
  }
  if (maxVal === 0) maxVal = 1;

  var groupW = w / data.length;
  var barW = (groupW - barPad * 3) / 2;

  return (
    <View onLayout={function(e) { setW(e.nativeEvent.layout.width); }}>
      <Svg width={w} height={chartH + 30}>
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map(function(p, gi) {
          return React.createElement(SvgLine, {
            key: gi, x1: 0, y1: chartH * (1 - p), x2: w, y2: chartH * (1 - p),
            stroke: 'rgba(255,255,255,0.04)', strokeWidth: 0.5,
          });
        })}
        {data.map(function(d, i) {
          var x = i * groupW + barPad;
          var hE = maxVal > 0 ? (d.entradas / maxVal) * (chartH - 10) : 0;
          var hS = maxVal > 0 ? (d.saidas / maxVal) * (chartH - 10) : 0;
          return React.createElement(React.Fragment, { key: i },
            React.createElement(Rect, {
              x: x, y: chartH - hE, width: barW, height: Math.max(hE, 1),
              rx: 3, fill: C.green + '80',
            }),
            React.createElement(Rect, {
              x: x + barW + barPad, y: chartH - hS, width: barW, height: Math.max(hS, 1),
              rx: 3, fill: C.red + '80',
            }),
            React.createElement(SvgText, {
              x: x + groupW / 2 - barPad, y: chartH + 16,
              fontSize: 9, fill: C.dim, textAnchor: 'middle',
              fontFamily: F.mono,
            }, d.label)
          );
        })}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: C.green + '80' }} />
          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>Entradas</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: C.red + '80' }} />
          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>Saídas</Text>
        </View>
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════
// SECTION: CATEGORY BREAKDOWN
// ══════════════════════════════════════════════
function CategoryBreakdown(props) {
  var data = props.data || {};
  var total = props.total || 1;

  var catColors = {
    deposito: C.green, retirada: C.red, transferencia: C.accent,
    compra_ativo: C.acoes, venda_ativo: C.acoes,
    premio_opcao: C.opcoes, recompra_opcao: C.opcoes,
    exercicio_opcao: C.opcoes, dividendo: C.fiis,
    jcp: C.fiis, rendimento_fii: C.fiis, rendimento_rf: C.rf,
    ajuste_manual: C.dim, salario: C.green,
    despesa_fixa: C.yellow, despesa_variavel: C.yellow, outro: C.dim,
  };

  var keys = Object.keys(data);
  // Sort by value descending
  keys.sort(function(a, b) { return (data[b] || 0) - (data[a] || 0); });

  return (
    <View style={{ gap: 6 }}>
      {keys.map(function(k) {
        var val = data[k] || 0;
        var pct = total > 0 ? (val / total) * 100 : 0;
        var color = catColors[k] || C.dim;
        var label = CAT_LABELS[k] || k;
        return (
          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
            <Text style={{ flex: 1, fontSize: 11, color: C.sub, fontFamily: F.body }} numberOfLines={1}>{label}</Text>
            <View style={{ width: 80, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.03)' }}>
              <View style={{ width: Math.max(pct, 2) + '%', height: 8, borderRadius: 4, backgroundColor: color + '60' }} />
            </View>
            <Text style={{ fontSize: 10, color: color, fontFamily: F.mono, fontWeight: '600', width: 38, textAlign: 'right' }}>
              {pct.toFixed(0)}%
            </Text>
            <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, width: 65, textAlign: 'right' }}>
              R$ {fmt(val)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ══════════════════════════════════════════════
// MAIN CAIXA VIEW
// ══════════════════════════════════════════════
export default function CaixaView(props) {
  var navigation = props.navigation;
  var user = useAuth().user;

  var _saldos = useState([]); var saldos = _saldos[0]; var setSaldos = _saldos[1];
  var _movs = useState([]); var movs = _movs[0]; var setMovs = _movs[1];
  var _summary = useState(null); var summary = _summary[0]; var setSummary = _summary[1];
  var _summaryAnt = useState(null); var summaryAnt = _summaryAnt[0]; var setSummaryAnt = _summaryAnt[1];
  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _refreshing = useState(false); var refreshing = _refreshing[0]; var setRefreshing = _refreshing[1];
  var _expanded = useState(null); var expanded = _expanded[0]; var setExpanded = _expanded[1];
  var _actMode = useState(null); var actMode = _actMode[0]; var setActMode = _actMode[1];
  var _actVal = useState(''); var actVal = _actVal[0]; var setActVal = _actVal[1];
  var _trDest = useState(null); var trDest = _trDest[0]; var setTrDest = _trDest[1];
  var _hist6m = useState([]); var hist6m = _hist6m[0]; var setHist6m = _hist6m[1];

  var load = async function() {
    if (!user) return;
    var now = new Date();
    var mesAtual = now.getMonth() + 1;
    var anoAtual = now.getFullYear();
    var mesAnt = mesAtual === 1 ? 12 : mesAtual - 1;
    var anoAnt = mesAtual === 1 ? anoAtual - 1 : anoAtual;

    // Build 6-month summary requests
    var histPromises = [];
    var histLabels = [];
    var MESES_NOMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    for (var hi = 5; hi >= 0; hi--) {
      var hd = new Date(anoAtual, mesAtual - 1 - hi, 1);
      var hm = hd.getMonth() + 1;
      var hy = hd.getFullYear();
      histPromises.push(getMovimentacoesSummary(user.id, hm, hy));
      histLabels.push(MESES_NOMES[hm - 1]);
    }

    var results = await Promise.all([
      getSaldos(user.id),
      getMovimentacoes(user.id, { limit: 15 }),
      getMovimentacoesSummary(user.id, mesAtual, anoAtual),
      getMovimentacoesSummary(user.id, mesAnt, anoAnt),
    ].concat(histPromises));

    setSaldos(results[0].data || []);
    setMovs(results[1].data || []);
    setSummary(results[2]);
    setSummaryAnt(results[3]);

    // Build hist6m from results[4..9]
    var h6 = [];
    for (var hj = 0; hj < 6; hj++) {
      var hSummary = results[4 + hj];
      h6.push({ label: histLabels[hj], entradas: hSummary.totalEntradas, saidas: hSummary.totalSaidas });
    }
    setHist6m(h6);
    setLoading(false);
  };

  useFocusEffect(useCallback(function() { load(); }, [user]));

  var onRefresh = async function() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  var totalSaldos = 0;
  for (var si = 0; si < saldos.length; si++) {
    totalSaldos += (saldos[si].saldo || 0);
  }

  function toggleExpand(id) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (expanded === id) {
      setExpanded(null);
      setActMode(null);
      setActVal('');
      setTrDest(null);
    } else {
      setExpanded(id);
      setActMode(null);
      setActVal('');
      setTrDest(null);
    }
  }

  function openMode(mode) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActMode(actMode === mode ? null : mode);
    setActVal('');
    setTrDest(null);
  }

  function resetAction() {
    setActMode(null);
    setActVal('');
    setTrDest(null);
  }

  function onChangeVal(t) {
    var nums = t.replace(/\D/g, '');
    if (nums === '') { setActVal(''); return; }
    var centavos = parseInt(nums);
    var reais = (centavos / 100).toFixed(2);
    var parts = reais.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    setActVal(parts[0] + ',' + parts[1]);
  }

  function parseVal() {
    return parseFloat((actVal || '').replace(/\./g, '').replace(',', '.')) || 0;
  }

  function handleDepositar(s) {
    var num = parseVal();
    if (num <= 0) return;
    var sName = s.corretora || s.name || '';
    resetAction();
    addMovimentacaoComSaldo(user.id, {
      conta: sName, tipo: 'entrada', categoria: 'deposito',
      valor: num, descricao: buildMovDescricao('deposito', null, sName),
      data: new Date().toISOString().substring(0, 10),
    }).then(function() { load(); });
  }

  function handleDeduzir(s) {
    var num = parseVal();
    if (num <= 0) return;
    var sName = s.corretora || s.name || '';
    resetAction();
    addMovimentacaoComSaldo(user.id, {
      conta: sName, tipo: 'saida', categoria: 'retirada',
      valor: num, descricao: buildMovDescricao('retirada', null, sName),
      data: new Date().toISOString().substring(0, 10),
    }).then(function() { load(); });
  }

  function handleTransferir(s) {
    var num = parseVal();
    if (num <= 0 || !trDest) return;
    var sName = s.corretora || s.name || '';
    if (num > (s.saldo || 0)) {
      Alert.alert('Saldo insuficiente', 'O valor excede o saldo disponível.');
      return;
    }
    var dest = saldos.find(function(x) { return x.id === trDest; });
    if (!dest) return;
    var destName = dest.corretora || dest.name || '';
    resetAction();
    Promise.all([
      addMovimentacaoComSaldo(user.id, {
        conta: sName, tipo: 'saida', categoria: 'transferencia',
        valor: num, descricao: 'Transferência para ' + destName,
        conta_destino: destName,
        data: new Date().toISOString().substring(0, 10),
      }),
      addMovimentacaoComSaldo(user.id, {
        conta: destName, tipo: 'entrada', categoria: 'transferencia',
        valor: num, descricao: 'Transferência de ' + sName,
        data: new Date().toISOString().substring(0, 10),
      }),
    ]).then(function() { load(); });
  }

  function handleExcluir(s) {
    var sName = s.corretora || s.name || '';
    Alert.alert('Excluir conta', 'Remover ' + sName + '?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir', style: 'destructive',
        onPress: function() {
          deleteSaldo(s.id).then(function() { load(); });
        },
      },
    ]);
  }

  function handleAddConta() {
    navigation.navigate('AddConta');
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    var parts = dateStr.substring(0, 10).split('-');
    if (parts.length !== 3) return dateStr;
    return parts[2] + '/' + parts[1];
  }

  if (loading) return <View style={styles.container}><LoadingScreen /></View>;

  var modeColor = actMode === 'depositar' ? C.green : actMode === 'transferir' ? C.accent : C.yellow;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}>

      {/* ══════ 1. HERO — Saldo Total ══════ */}
      <Glass glow={C.green} padding={16}>
        <Text style={styles.heroLabel}>SALDO TOTAL</Text>
        <Text style={styles.heroValue}>R$ {fmt(totalSaldos)}</Text>
        {saldos.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, marginTop: 10 }}>
            {saldos.map(function(s, i) {
              var bc = [C.opcoes, C.acoes, C.fiis, C.etfs, C.rf, C.accent][i % 6];
              var sName = s.corretora || s.name || '';
              return (
                <View key={s.id || i} style={[styles.chipConta, { borderColor: bc + '30' }]}>
                  <Text style={[styles.chipName, { color: bc }]}>
                    {sName.length > 10 ? sName.substring(0, 10) : sName}
                  </Text>
                  <Text style={styles.chipVal}>R$ {fmt(s.saldo || 0)}</Text>
                </View>
              );
            })}
          </ScrollView>
        ) : null}
      </Glass>

      {/* ══════ 2. CONTAS (Accordion) ══════ */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <SectionLabel>CONTAS</SectionLabel>
        <TouchableOpacity onPress={handleAddConta} activeOpacity={0.7}
          style={styles.addContaBtn}>
          <Text style={styles.addContaBtnText}>+ Nova conta</Text>
        </TouchableOpacity>
      </View>

      {saldos.length === 0 ? (
        <Glass padding={16}>
          <Text style={{ fontSize: 13, color: C.sub, fontFamily: F.body, textAlign: 'center' }}>
            Nenhuma conta cadastrada
          </Text>
          <TouchableOpacity onPress={handleAddConta} activeOpacity={0.7}
            style={[styles.ctaBtn, { marginTop: 10, alignSelf: 'center' }]}>
            <Text style={styles.ctaBtnText}>Criar primeira conta</Text>
          </TouchableOpacity>
        </Glass>
      ) : saldos.map(function(s, i) {
        var bc = [C.opcoes, C.acoes, C.fiis, C.etfs, C.rf, C.accent][i % 6];
        var sName = s.corretora || s.name || '';
        var isExp = expanded === s.id;

        // Get last 5 movs for this conta
        var contaMovs = [];
        for (var mi = 0; mi < movs.length; mi++) {
          if (movs[mi].conta === sName && contaMovs.length < 5) {
            contaMovs.push(movs[mi]);
          }
        }

        var destOptions = saldos.filter(function(x) { return x.id !== s.id; });

        return (
          <TouchableOpacity key={s.id || i} activeOpacity={0.8}
            onPress={function() { toggleExpand(s.id); }}>
            <Glass padding={12} style={isExp ? { borderColor: bc + '30' } : {}}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[styles.brokerIcon, { backgroundColor: bc + '12', borderColor: bc + '22' }]}>
                    <Text style={[styles.brokerIconText, { color: bc }]}>
                      {(sName || 'CT').substring(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.contaName}>{sName}</Text>
                    {s.tipo ? (
                      <Text style={styles.contaTipo}>{s.tipo === 'corretora' ? 'Corretora' : s.tipo === 'banco' ? 'Banco' : s.tipo}</Text>
                    ) : null}
                  </View>
                </View>
                <Text style={[styles.contaSaldo, { color: bc }]}>R$ {fmt(s.saldo || 0)}</Text>
              </View>

              {/* EXPANDED */}
              {isExp ? (
                <View style={styles.expandedWrap}>
                  {/* Last movs */}
                  {contaMovs.length > 0 ? (
                    <View style={{ marginBottom: 10 }}>
                      {contaMovs.map(function(m, mi) {
                        var isEntrada = m.tipo === 'entrada';
                        var movColor = isEntrada ? C.green : m.tipo === 'transferencia' ? C.accent : C.red;
                        var movIcon = isEntrada ? '↓' : m.tipo === 'transferencia' ? '→' : '↑';
                        return (
                          <View key={m.id || mi} style={styles.miniMovRow}>
                            <Text style={[styles.miniMovIcon, { color: movColor }]}>{movIcon}</Text>
                            <Text style={styles.miniMovDesc} numberOfLines={1}>
                              {m.descricao || CAT_LABELS[m.categoria] || m.categoria}
                            </Text>
                            <Text style={[styles.miniMovVal, { color: movColor }]}>
                              {isEntrada ? '+' : '-'}R$ {fmt(m.valor)}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono, textAlign: 'center', marginBottom: 10 }}>
                      Nenhuma movimentação
                    </Text>
                  )}

                  {/* Action buttons */}
                  {!actMode ? (
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity onPress={function() { openMode('depositar'); }} activeOpacity={0.7}
                        style={[styles.saldoBtn, { borderColor: C.green + '30' }]}>
                        <Text style={[styles.saldoBtnText, { color: C.green + 'CC' }]}>Depositar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={function() { openMode('deduzir'); }} activeOpacity={0.7}
                        style={[styles.saldoBtn, { borderColor: C.yellow + '30' }]}>
                        <Text style={[styles.saldoBtnText, { color: C.yellow + 'CC' }]}>Retirar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={function() { openMode('transferir'); }} activeOpacity={0.7}
                        style={[styles.saldoBtn, { borderColor: C.accent + '30' }]}>
                        <Text style={[styles.saldoBtnText, { color: C.accent + 'CC' }]}>Transferir</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={function() { handleExcluir(s); }} activeOpacity={0.7}
                        style={[styles.saldoBtn, { borderColor: C.red + '30' }]}>
                        <Text style={[styles.saldoBtnText, { color: C.red + 'CC' }]}>Excluir</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {actMode === 'transferir' && destOptions.length === 0 ? (
                        <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body, textAlign: 'center' }}>
                          Nenhuma outra conta para transferir
                        </Text>
                      ) : (
                        <View style={{ gap: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ fontSize: 13, color: C.sub, fontFamily: F.mono }}>R$</Text>
                            <TextInput
                              value={actVal}
                              onChangeText={onChangeVal}
                              placeholder="0,00"
                              placeholderTextColor={C.dim}
                              keyboardType="numeric"
                              autoFocus
                              style={[styles.valInput, { borderColor: modeColor + '40' }]}
                            />
                          </View>
                          {actMode === 'transferir' ? (
                            <View style={{ gap: 4 }}>
                              <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 }}>DESTINO</Text>
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                {destOptions.map(function(d) {
                                  var sel = trDest === d.id;
                                  return (
                                    <TouchableOpacity key={d.id}
                                      onPress={function() { setTrDest(sel ? null : d.id); }}
                                      activeOpacity={0.7}
                                      style={[styles.destPill, sel && { borderColor: C.accent, backgroundColor: C.accent + '18' }]}>
                                      <Text style={[styles.destPillText, sel && { color: C.accent, fontWeight: '700' }]}>
                                        {d.corretora || d.name || ''}
                                      </Text>
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>
                            </View>
                          ) : null}
                        </View>
                      )}
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity onPress={resetAction} activeOpacity={0.7}
                          style={styles.cancelBtn}>
                          <Text style={styles.cancelBtnText}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={function() {
                            if (actMode === 'depositar') handleDepositar(s);
                            else if (actMode === 'transferir') handleTransferir(s);
                            else handleDeduzir(s);
                          }}
                          activeOpacity={0.7}
                          style={[styles.confirmBtn, { backgroundColor: modeColor + '18', borderColor: modeColor + '40' }]}>
                          <Text style={[styles.confirmBtnText, { color: modeColor }]}>Confirmar</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              ) : null}
            </Glass>
          </TouchableOpacity>
        );
      })}

      {/* ══════ 3. RESUMO MENSAL ══════ */}
      <SectionLabel>RESUMO DO MÊS</SectionLabel>
      <Glass padding={14}>
        {summary ? (
          <View>
            <View style={styles.resumoRow}>
              <Text style={styles.resumoLabel}>Entradas</Text>
              <Text style={[styles.resumoVal, { color: C.green }]}>+R$ {fmt(summary.totalEntradas)}</Text>
            </View>
            <View style={styles.resumoRow}>
              <Text style={styles.resumoLabel}>Saídas</Text>
              <Text style={[styles.resumoVal, { color: C.red }]}>-R$ {fmt(summary.totalSaidas)}</Text>
            </View>
            <View style={[styles.resumoRow, { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 6, marginTop: 4 }]}>
              <Text style={styles.resumoLabel}>Saldo do período</Text>
              <Text style={[styles.resumoVal, { color: summary.saldo >= 0 ? C.green : C.red }]}>
                {summary.saldo >= 0 ? '+' : '-'}R$ {fmt(Math.abs(summary.saldo))}
              </Text>
            </View>
            {summaryAnt ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>vs mês anterior:</Text>
                {summaryAnt.saldo !== 0 ? (
                  <Text style={{ fontSize: 10, fontFamily: F.mono, fontWeight: '600',
                    color: summary.saldo >= summaryAnt.saldo ? C.green : C.red }}>
                    {summary.saldo >= summaryAnt.saldo ? '↑' : '↓'} R$ {fmt(Math.abs(summary.saldo - summaryAnt.saldo))}
                  </Text>
                ) : (
                  <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>sem dados</Text>
                )}
              </View>
            ) : null}
          </View>
        ) : (
          <Text style={{ fontSize: 12, color: C.sub, fontFamily: F.body, textAlign: 'center' }}>
            Nenhuma movimentação este mês
          </Text>
        )}
      </Glass>

      {/* ══════ 4. ÚLTIMAS MOVIMENTAÇÕES ══════ */}
      <SectionLabel>ÚLTIMAS MOVIMENTAÇÕES</SectionLabel>
      {movs.length === 0 ? (
        <Glass padding={16}>
          <Text style={{ fontSize: 13, color: C.sub, fontFamily: F.body, textAlign: 'center' }}>
            Nenhuma movimentação registrada
          </Text>
        </Glass>
      ) : (
        <Glass padding={0}>
          {movs.map(function(m, i) {
            var isEntrada = m.tipo === 'entrada';
            var isTransf = m.tipo === 'transferencia' || m.categoria === 'transferencia';
            var movColor = isEntrada ? C.green : isTransf ? C.accent : C.red;
            var movIcon = isEntrada ? '↓' : isTransf ? '→' : '↑';
            return (
              <View key={m.id || i} style={[styles.movRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
                <View style={[styles.movIconWrap, { backgroundColor: movColor + '12' }]}>
                  <Text style={[styles.movIconText, { color: movColor }]}>{movIcon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.movDesc} numberOfLines={1}>
                    {m.descricao || CAT_LABELS[m.categoria] || m.categoria}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.movDate}>{formatDate(m.data)}</Text>
                    <Badge text={m.conta} color={C.dim} />
                  </View>
                </View>
                <Text style={[styles.movVal, { color: movColor }]}>
                  {isEntrada ? '+' : '-'}R$ {fmt(m.valor)}
                </Text>
              </View>
            );
          })}
        </Glass>
      )}

      {/* Ver extrato completo */}
      {movs.length > 0 ? (
        <TouchableOpacity
          onPress={function() { navigation.navigate('Extrato'); }}
          activeOpacity={0.7}
          style={styles.extratoBtn}>
          <Text style={styles.extratoBtnText}>Ver extrato completo</Text>
        </TouchableOpacity>
      ) : null}

      {/* ══════ 5. GRÁFICO ENTRADAS VS SAÍDAS (6 meses) ══════ */}
      {hist6m.length > 0 ? (
        <View>
          <SectionLabel>ENTRADAS VS SAÍDAS</SectionLabel>
          <Glass padding={14}>
            <BarChart6m data={hist6m} />
          </Glass>
        </View>
      ) : null}

      {/* ══════ 6. RESUMO POR CATEGORIA ══════ */}
      {summary && summary.porCategoria && Object.keys(summary.porCategoria).length > 0 ? (
        <View>
          <SectionLabel>POR CATEGORIA (MÊS ATUAL)</SectionLabel>
          <Glass padding={14}>
            <CategoryBreakdown data={summary.porCategoria} total={summary.totalEntradas + summary.totalSaidas} />
          </Glass>
        </View>
      ) : null}

      {/* FAB + Nova Movimentação */}
      <TouchableOpacity
        onPress={function() { navigation.navigate('AddMovimentacao'); }}
        activeOpacity={0.8}
        style={styles.fab}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <View style={{ height: SIZE.tabBarHeight + 20 }} />
    </ScrollView>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: SIZE.padding, gap: SIZE.gap },

  // Hero
  heroLabel: { fontSize: 11, color: C.dim, fontFamily: F.mono, letterSpacing: 0.6 },
  heroValue: { fontSize: 26, fontWeight: '800', color: C.text, fontFamily: F.display, marginTop: 2, letterSpacing: -0.5 },

  // Chip conta
  chipConta: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, backgroundColor: C.cardSolid },
  chipName: { fontSize: 10, fontWeight: '600', fontFamily: F.mono },
  chipVal: { fontSize: 11, fontWeight: '700', color: C.text, fontFamily: F.mono, marginTop: 1 },

  // Add conta btn
  addContaBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: C.accent + '30' },
  addContaBtnText: { fontSize: 10, fontWeight: '600', color: C.accent, fontFamily: F.mono },

  // CTA button
  ctaBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: C.accent },
  ctaBtnText: { fontSize: 12, fontWeight: '600', color: C.text, fontFamily: F.body },

  // Broker icon
  brokerIcon: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  brokerIconText: { fontSize: 11, fontWeight: '700', fontFamily: F.mono },

  // Conta
  contaName: { fontSize: 13, fontWeight: '600', color: C.text, fontFamily: F.display },
  contaTipo: { fontSize: 10, color: C.dim, fontFamily: F.mono },
  contaSaldo: { fontSize: 15, fontWeight: '700', fontFamily: F.mono },

  // Expanded
  expandedWrap: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border },

  // Mini mov row
  miniMovRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 },
  miniMovIcon: { fontSize: 12, fontWeight: '700', fontFamily: F.mono, width: 14, textAlign: 'center' },
  miniMovDesc: { flex: 1, fontSize: 11, color: C.sub, fontFamily: F.body },
  miniMovVal: { fontSize: 11, fontWeight: '600', fontFamily: F.mono },

  // Saldo buttons
  saldoBtn: { flex: 1, paddingVertical: 5, borderRadius: 6, borderWidth: 1, alignItems: 'center' },
  saldoBtnText: { fontSize: 10, fontWeight: '600', fontFamily: F.mono, letterSpacing: 0.4 },

  // Input
  valInput: {
    flex: 1, backgroundColor: C.cardSolid, borderWidth: 1,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 16, color: C.text, fontFamily: F.mono,
  },

  // Dest pill
  destPill: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: C.border },
  destPillText: { fontSize: 11, fontFamily: F.body, fontWeight: '500', color: C.sub },

  // Cancel/Confirm
  cancelBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  cancelBtnText: { fontSize: 13, fontWeight: '600', color: C.sub, fontFamily: F.body },
  confirmBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  confirmBtnText: { fontSize: 13, fontWeight: '600', fontFamily: F.body },

  // Resumo
  resumoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  resumoLabel: { fontSize: 12, color: C.sub, fontFamily: F.body },
  resumoVal: { fontSize: 14, fontWeight: '700', fontFamily: F.mono },

  // Mov list
  movRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14 },
  movIconWrap: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  movIconText: { fontSize: 14, fontWeight: '700', fontFamily: F.mono },
  movDesc: { fontSize: 12, fontWeight: '600', color: C.text, fontFamily: F.body },
  movDate: { fontSize: 10, color: C.dim, fontFamily: F.mono },
  movVal: { fontSize: 13, fontWeight: '700', fontFamily: F.mono },

  // Extrato button
  extratoBtn: { alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: C.accent + '30' },
  extratoBtnText: { fontSize: 12, fontWeight: '600', color: C.accent, fontFamily: F.body },

  // FAB
  fab: {
    position: 'absolute', bottom: SIZE.tabBarHeight + 24, right: SIZE.padding,
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: C.green, justifyContent: 'center', alignItems: 'center',
    shadowColor: C.green, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  fabText: { fontSize: 26, fontWeight: '300', color: 'white', marginTop: -2 },
});
