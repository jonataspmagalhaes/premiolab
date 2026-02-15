import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, TextInput, Alert,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { C, F, SIZE } from '../../theme';
import { useAuth } from '../../contexts/AuthContext';
import { getOpcoes, getPositions } from '../../services/database';
import { supabase } from '../../config/supabase';
import { Glass, Badge, Pill, SectionLabel } from '../../components';
import { LoadingScreen, EmptyState } from '../../components/States';

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ═══════════════════════════════════════
// GREGAS (simplified BS approximation)
// ═══════════════════════════════════════
function calcGreeks(op, spot) {
  var s = spot || op.strike || 0;
  var k = op.strike || 0;
  var p = op.premio || 0;
  var daysLeft = Math.max(1, Math.ceil((new Date(op.vencimento) - new Date()) / (1000 * 60 * 60 * 24)));
  var t = daysLeft / 365;
  var ivGuess = 0.35; // Default IV estimate

  if (s <= 0 || k <= 0) return { delta: 0, gamma: 0, theta: 0, iv: 0, daysLeft: daysLeft };

  var moneyness = s / k;
  var rawDelta = 0.5 + (moneyness - 1) * 3;
  var delta;
  if (op.tipo === 'call') {
    delta = Math.min(0.99, Math.max(0.01, rawDelta));
  } else {
    delta = -Math.min(0.99, Math.max(0.01, 1 - rawDelta));
  }

  var gamma = Math.max(0.001, 0.05 * Math.exp(-Math.pow(moneyness - 1, 2) * 50));
  var theta = -(s * ivGuess * gamma) / (2 * Math.sqrt(t)) / 365;
  var iv = (p > 0 && s > 0) ? (p / s) * Math.sqrt(365 / daysLeft) * 100 : ivGuess * 100;

  return {
    delta: delta,
    gamma: gamma,
    theta: theta,
    iv: Math.min(200, Math.max(5, iv)),
    daysLeft: daysLeft,
  };
}

// ═══════════════════════════════════════
// OPTION CARD
// ═══════════════════════════════════════
function OpCard({ op, positions, onEdit, onDelete }) {
  var tipoLabel = (op.tipo || 'call').toUpperCase();
  var premTotal = (op.premio || 0) * (op.quantidade || 0);
  var daysLeft = Math.max(0, Math.ceil((new Date(op.vencimento) - new Date()) / (1000 * 60 * 60 * 24)));

  // Status: coberta, descoberta, etc
  var status = 'COBERTA';
  var statusColor = C.green;
  if (tipoLabel === 'CALL' && (op.direcao === 'lancamento' || op.direcao === 'venda')) {
    var pos = positions.find(function (p) { return p.ticker === op.ativo_base; });
    if (!pos || pos.quantidade < (op.quantidade || 0)) {
      status = 'DESCOBERTA';
      statusColor = C.red;
    }
  } else if (tipoLabel === 'PUT') {
    status = 'CSP';
    statusColor = C.opcoes;
  }

  // Gregas
  var spotPrice = 0;
  var matchPos = positions.find(function (p) { return p.ticker === op.ativo_base; });
  if (matchPos) spotPrice = matchPos.preco_atual || matchPos.pm || 0;
  var greeks = calcGreeks(op, spotPrice);

  // Day urgency
  var dayColor = daysLeft <= 7 ? C.red : daysLeft <= 21 ? C.etfs : C.opcoes;

  return (
    <Glass padding={14} style={{
      backgroundColor: statusColor + '04',
      borderColor: statusColor + '12',
      borderWidth: 1,
    }}>
      {/* Header: ticker + type + status + premium */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <Text style={styles.opTicker}>{op.ativo_base}</Text>
          <Badge text={tipoLabel} color={tipoLabel === 'CALL' ? C.green : C.red} />
          <Badge text={status} color={statusColor} />
        </View>
        <Text style={[styles.opPremio, { color: C.green }]}>+R$ {fmt(premTotal)}</Text>
      </View>

      {/* Option code */}
      {op.ticker_opcao ? (
        <Text style={styles.opCode}>{op.ticker_opcao}</Text>
      ) : null}

      {/* Greeks row */}
      <View style={styles.greeksRow}>
        {[
          { l: 'Strike', v: 'R$ ' + fmt(op.strike) },
          { l: 'Delta', v: greeks.delta.toFixed(2) },
          { l: 'Theta', v: (greeks.theta * (op.quantidade || 1) >= 0 ? '+' : '') + 'R$' + (greeks.theta * (op.quantidade || 1)).toFixed(1) + '/d' },
          { l: 'IV', v: greeks.iv.toFixed(0) + '%' },
          { l: 'DTE', v: daysLeft + 'd' },
        ].map(function (g, i) {
          return (
            <View key={i} style={{ alignItems: 'center', flex: 1 }}>
              <Text style={styles.greekLabel}>{g.l}</Text>
              <Text style={styles.greekValue}>{g.v}</Text>
            </View>
          );
        })}
      </View>

      {/* Bottom: corretora + actions */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {op.corretora ? (
            <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>{op.corretora}</Text>
          ) : null}
          <Badge text={daysLeft + 'd'} color={dayColor} />
        </View>
        <View style={{ flexDirection: 'row', gap: 14 }}>
          <TouchableOpacity onPress={onEdit}>
            <Text style={styles.actionLink}>Editar</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete}>
            <Text style={[styles.actionLink, { color: C.red }]}>Excluir</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Glass>
  );
}

// ═══════════════════════════════════════
// SIMULADOR BLACK-SCHOLES
// ═══════════════════════════════════════
function SimuladorBS() {
  var s1 = useState('CALL'); var tipo = s1[0]; var setTipo = s1[1];
  var s2 = useState('lancamento'); var direcao = s2[0]; var setDirecao = s2[1];
  var s3 = useState('34.30'); var spot = s3[0]; var setSpot = s3[1];
  var s4 = useState('36.00'); var strike = s4[0]; var setStrike = s4[1];
  var s5 = useState('1.20'); var premio = s5[0]; var setPremio = s5[1];
  var s6 = useState('35'); var iv = s6[0]; var setIv = s6[1];
  var s7 = useState('21'); var dte = s7[0]; var setDte = s7[1];
  var s8 = useState('100'); var qty = s8[0]; var setQty = s8[1];

  var sVal = parseFloat(spot) || 0;
  var kVal = parseFloat(strike) || 0;
  var pVal = parseFloat(premio) || 0;
  var qVal = parseInt(qty) || 0;
  var dVal = parseInt(dte) || 0;
  var ivPct = parseFloat(iv) / 100 || 0;

  var moneyness = kVal > 0 ? sVal / kVal : 1;
  var delta = tipo === 'CALL'
    ? Math.min(0.99, Math.max(0.01, 0.5 + (moneyness - 1) * 3))
    : -Math.min(0.99, Math.max(0.01, 0.5 - (moneyness - 1) * 3));
  var gamma = Math.max(0.001, 0.05 * Math.exp(-Math.pow(moneyness - 1, 2) * 50));
  var theta = -(sVal * ivPct * gamma) / (2 * Math.sqrt(dVal / 365 || 0.01)) / 365;
  var vega = sVal * Math.sqrt(dVal / 365 || 0.01) * gamma;

  var premioTotal = pVal * qVal;
  var contratos = Math.floor(qVal / 100);
  var thetaDia = theta * qVal;
  var breakeven = tipo === 'CALL' ? kVal + pVal : kVal - pVal;

  // What-If scenarios
  var scenarios = [
    { label: '+5%', pctMove: 0.05 },
    { label: '-5%', pctMove: -0.05 },
    { label: '+10%', pctMove: 0.10 },
    { label: '-10%', pctMove: -0.10 },
  ];

  function calcScenarioResult(pctMove) {
    var newSpot = sVal * (1 + pctMove);
    var intrinsic;
    if (tipo === 'CALL') {
      intrinsic = Math.max(0, newSpot - kVal);
    } else {
      intrinsic = Math.max(0, kVal - newSpot);
    }
    if (direcao === 'lancamento') {
      return (pVal - intrinsic) * qVal;
    } else {
      return (intrinsic - pVal) * qVal;
    }
  }

  function renderField(label, val, setter, suffix) {
    return (
      <View style={styles.simField}>
        <Text style={styles.simFieldLabel}>{label}</Text>
        <View style={styles.simFieldInput}>
          <TextInput value={val} onChangeText={setter} keyboardType="numeric"
            style={styles.simFieldText} placeholderTextColor={C.dim} />
          {suffix ? <Text style={styles.simFieldSuffix}>{suffix}</Text> : null}
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: SIZE.gap }}>
      {/* Tipo + Direção */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
          {['CALL', 'PUT'].map(function (t) {
            return <Pill key={t} active={tipo === t} color={t === 'CALL' ? C.green : C.red} onPress={function () { setTipo(t); }}>{t}</Pill>;
          })}
        </View>
        <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
          <Pill active={direcao === 'lancamento'} color={C.accent} onPress={function () { setDirecao('lancamento'); }}>Lançamento</Pill>
          <Pill active={direcao === 'compra'} color={C.accent} onPress={function () { setDirecao('compra'); }}>Compra</Pill>
        </View>
      </View>

      {/* Inputs */}
      <Glass padding={14}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {renderField('Spot', spot, setSpot, 'R$')}
          {renderField('Strike', strike, setStrike, 'R$')}
          {renderField('Prêmio', premio, setPremio, 'R$')}
          {renderField('IV', iv, setIv, '%')}
          {renderField('DTE', dte, setDte, 'dias')}
          {renderField('Qtd Opções', qty, setQty)}
        </View>
      </Glass>

      {/* Gregas */}
      <Glass glow={C.opcoes} padding={14}>
        <SectionLabel>GREGAS</SectionLabel>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 8 }}>
          {[
            { l: 'Delta', v: delta.toFixed(3), c: Math.abs(delta) > 0.5 ? C.green : C.sub },
            { l: 'Gamma', v: gamma.toFixed(4), c: C.sub },
            { l: 'Theta', v: theta.toFixed(3), c: C.red },
            { l: 'Vega', v: vega.toFixed(3), c: C.acoes },
          ].map(function (g, i) {
            return (
              <View key={i} style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>{g.l}</Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: g.c, fontFamily: F.display }}>{g.v}</Text>
              </View>
            );
          })}
        </View>
      </Glass>

      {/* Resumo */}
      <Glass padding={14}>
        <SectionLabel>RESUMO</SectionLabel>
        <View style={{ gap: 6, marginTop: 6 }}>
          {[
            { l: 'Prêmio total', v: 'R$ ' + premioTotal.toFixed(2) },
            { l: 'Theta/dia', v: 'R$ ' + thetaDia.toFixed(2) },
            { l: 'Breakeven', v: 'R$ ' + breakeven.toFixed(2) },
            { l: 'Contratos', v: contratos + ' (' + qVal + ' opções)' },
          ].map(function (r, i) {
            return (
              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                <Text style={{ fontSize: 13, color: C.sub, fontFamily: F.body }}>{r.l}</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: C.text, fontFamily: F.mono }}>{r.v}</Text>
              </View>
            );
          })}
        </View>
      </Glass>

      {/* What-If Scenarios */}
      <Glass glow={C.etfs} padding={14}>
        <SectionLabel>CENÁRIOS WHAT-IF</SectionLabel>
        <View style={{ gap: 6, marginTop: 8 }}>
          {scenarios.map(function (sc, i) {
            var result = calcScenarioResult(sc.pctMove);
            var isPos = result >= 0;
            var scColor = isPos ? C.green : C.red;
            return (
              <View key={i} style={{
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                padding: 10, borderRadius: 8,
                backgroundColor: scColor + '06', borderWidth: 1, borderColor: scColor + '14',
              }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: C.text, fontFamily: F.display }}>
                  {'Ativo ' + sc.label}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: scColor, fontFamily: F.mono }}>
                  {isPos ? '+' : ''}R$ {fmt(Math.abs(result))}
                </Text>
              </View>
            );
          })}
        </View>
      </Glass>
    </View>
  );
}

// ═══════════════════════════════════════
// MAIN OPCOES SCREEN
// ═══════════════════════════════════════
export default function OpcoesScreen() {
  var navigation = useNavigation();
  var user = useAuth().user;

  var s1 = useState('ativas'); var sub = s1[0]; var setSub = s1[1];
  var s2 = useState([]); var opcoes = s2[0]; var setOpcoes = s2[1];
  var s3 = useState(true); var loading = s3[0]; var setLoading = s3[1];
  var s4 = useState(false); var refreshing = s4[0]; var setRefreshing = s4[1];
  var s5 = useState([]); var positions = s5[0]; var setPositions = s5[1];

  var load = async function () {
    if (!user) return;
    var results = await Promise.all([
      getOpcoes(user.id),
      getPositions(user.id),
    ]);
    setOpcoes(results[0].data || []);
    setPositions(results[1].data || []);
    setLoading(false);
  };

  useFocusEffect(useCallback(function () { load(); }, [user]));

  var onRefresh = async function () {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  var handleDelete = function (id) {
    Alert.alert('Excluir opção?', 'Essa ação não pode ser desfeita.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir', style: 'destructive',
        onPress: async function () {
          var result = await supabase.from('opcoes').delete().eq('id', id);
          if (!result.error) {
            setOpcoes(opcoes.filter(function (o) { return o.id !== id; }));
          } else {
            Alert.alert('Erro', 'Falha ao excluir.');
          }
        },
      },
    ]);
  };

  var ativas = opcoes.filter(function (o) { return o.status === 'ativa'; });
  var historico = opcoes.filter(function (o) { return o.status !== 'ativa'; });

  // Totals
  var premioMes = ativas.reduce(function (s, o) { return s + (o.premio || 0) * (o.quantidade || 0); }, 0);

  // Theta/dia estimate
  var thetaDiaTotal = 0;
  ativas.forEach(function (op) {
    var spotPrice = 0;
    var matchPos = positions.find(function (p) { return p.ticker === op.ativo_base; });
    if (matchPos) spotPrice = matchPos.pm || 0;
    var greeks = calcGreeks(op, spotPrice);
    thetaDiaTotal += greeks.theta * (op.quantidade || 1);
  });

  // Vencimentos próximos (sorted)
  var vencimentos = ativas.slice().sort(function (a, b) {
    return new Date(a.vencimento) - new Date(b.vencimento);
  });

  if (loading) return <View style={styles.container}><LoadingScreen /></View>;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />
      }
    >
      {/* ═══ SUMMARY BAR ═══ */}
      <Glass glow={C.opcoes} padding={16}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          {[
            { l: 'PRÊMIO MÊS', v: 'R$ ' + premioMes.toFixed(0), c: C.opcoes },
            { l: 'THETA/DIA', v: (thetaDiaTotal >= 0 ? '+' : '') + 'R$ ' + thetaDiaTotal.toFixed(0), c: thetaDiaTotal >= 0 ? C.green : C.red },
            { l: 'OPERAÇÕES', v: String(ativas.length), c: C.sub },
          ].map(function (m, i) {
            return (
              <View key={i} style={{ alignItems: 'center', flex: 1 }}>
                <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 }}>{m.l}</Text>
                <Text style={{ fontSize: 18, fontWeight: '800', color: m.c, fontFamily: F.display, marginTop: 2 }}>{m.v}</Text>
              </View>
            );
          })}
        </View>
      </Glass>

      {/* ═══ SUB TABS ═══ */}
      <View style={styles.subTabs}>
        {[
          { k: 'ativas', l: 'Ativas (' + ativas.length + ')' },
          { k: 'sim', l: 'Simulador' },
          { k: 'hist', l: 'Histórico (' + historico.length + ')' },
        ].map(function (t) {
          return (
            <Pill key={t.k} active={sub === t.k} color={C.opcoes} onPress={function () { setSub(t.k); }}>{t.l}</Pill>
          );
        })}
      </View>

      {/* ═══════ ATIVAS TAB ═══════ */}
      {sub === 'ativas' && (
        <View style={{ gap: SIZE.gap }}>
          {ativas.length === 0 ? (
            <EmptyState
              icon="⚡" title="Nenhuma opção ativa"
              description="Lance opções para começar a receber prêmios."
              cta="Nova opção" onCta={function () { navigation.navigate('AddOpcao'); }}
              color={C.opcoes}
            />
          ) : (
            <>
              {/* Option cards */}
              {ativas.map(function (op, i) {
                return (
                  <OpCard key={op.id || i} op={op} positions={positions}
                    onEdit={function () { navigation.navigate('EditOpcao', { opcao: op }); }}
                    onDelete={function () { handleDelete(op.id); }}
                  />
                );
              })}

              {/* Vencimentos */}
              {vencimentos.length > 0 && (
                <View>
                  <SectionLabel>PRÓXIMOS VENCIMENTOS</SectionLabel>
                  {vencimentos.map(function (v, i) {
                    var daysLeft = Math.max(0, Math.ceil((new Date(v.vencimento) - new Date()) / (1000 * 60 * 60 * 24)));
                    var tipoLabel = (v.tipo || 'call').toUpperCase();
                    var dayColor = daysLeft <= 7 ? C.red : daysLeft <= 21 ? C.etfs : C.opcoes;

                    return (
                      <Glass key={v.id || i} padding={12} style={{ marginTop: i > 0 ? 6 : 0 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: dayColor }} />
                            <Text style={{ fontSize: 13, fontWeight: '600', color: C.text, fontFamily: F.display }}>
                              {v.ativo_base} {tipoLabel}
                            </Text>
                            {v.ticker_opcao ? (
                              <Text style={{ fontSize: 10, color: C.opcoes, fontFamily: F.mono }}>{v.ticker_opcao}</Text>
                            ) : null}
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.mono }}>
                              {new Date(v.vencimento).toLocaleDateString('pt-BR')}
                            </Text>
                            <Badge text={daysLeft + 'd'} color={dayColor} />
                          </View>
                        </View>
                      </Glass>
                    );
                  })}
                </View>
              )}

              {/* Add button */}
              <TouchableOpacity
                activeOpacity={0.8} style={styles.addBtn}
                onPress={function () { navigation.navigate('AddOpcao'); }}
              >
                <Text style={styles.addBtnText}>+ Nova Opção</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* ═══════ SIMULADOR TAB ═══════ */}
      {sub === 'sim' && <SimuladorBS />}

      {/* ═══════ HISTÓRICO TAB ═══════ */}
      {sub === 'hist' && (
        <View style={{ gap: SIZE.gap }}>
          {historico.length === 0 ? (
            <Glass padding={24}>
              <Text style={{ fontSize: 14, color: C.sub, fontFamily: F.body, textAlign: 'center' }}>
                Nenhuma operação encerrada ainda.
              </Text>
            </Glass>
          ) : (
            <>
              {/* Summary */}
              <Glass padding={14}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                  {(function () {
                    var totalPrem = historico.reduce(function (s, o) { return s + (o.premio || 0) * (o.quantidade || 0); }, 0);
                    var expiradas = historico.filter(function (o) { return o.status === 'expirou_po' || o.status === 'expirada'; }).length;
                    var exercidas = historico.filter(function (o) { return o.status === 'exercida'; }).length;
                    return [
                      { l: 'TOTAL RECEBIDO', v: 'R$ ' + totalPrem.toFixed(0), c: C.green },
                      { l: 'EXPIROU PÓ', v: String(expiradas), c: C.acoes },
                      { l: 'EXERCIDAS', v: String(exercidas), c: C.etfs },
                    ];
                  })().map(function (m, i) {
                    return (
                      <View key={i} style={{ alignItems: 'center', flex: 1 }}>
                        <Text style={{ fontSize: 8, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 }}>{m.l}</Text>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: m.c, fontFamily: F.display, marginTop: 2 }}>{m.v}</Text>
                      </View>
                    );
                  })}
                </View>
              </Glass>

              {/* History list */}
              <Glass padding={0}>
                {historico.map(function (op, i) {
                  var tipoLabel = (op.tipo || 'call').toUpperCase();
                  var premTotal = (op.premio || 0) * (op.quantidade || 0);
                  var statusLabel = (op.status || 'encerrada').toUpperCase().replace('_', ' ');
                  var statusMap = {
                    'EXPIROU PO': C.green,
                    'EXPIRADA': C.green,
                    'EXERCIDA': C.etfs,
                    'RECOMPRADA': C.opcoes,
                    'ENCERRADA': C.dim,
                    'ROLADA': C.accent,
                  };
                  var stColor = statusMap[statusLabel] || C.dim;

                  return (
                    <View key={op.id || i}
                      style={[styles.histRow, i > 0 && { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)' }]}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: C.text, fontFamily: F.display }}>
                            {op.ativo_base} {tipoLabel} {(op.strike || 0).toFixed(0)}
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>
                            {new Date(op.vencimento).toLocaleDateString('pt-BR')}
                          </Text>
                          <Badge text={statusLabel} color={stColor} />
                          {op.corretora ? (
                            <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>{op.corretora}</Text>
                          ) : null}
                        </View>
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: C.green, fontFamily: F.mono }}>
                        +R$ {fmt(premTotal)}
                      </Text>
                    </View>
                  );
                })}
              </Glass>
            </>
          )}
        </View>
      )}

      <View style={{ height: SIZE.tabBarHeight + 20 }} />
    </ScrollView>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 18, gap: SIZE.gap },
  subTabs: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },

  opTicker: { fontSize: 15, fontWeight: '700', color: C.text, fontFamily: F.display },
  opCode: { fontSize: 11, color: C.opcoes, fontFamily: F.mono, marginBottom: 6 },
  opPremio: { fontSize: 14, fontWeight: '700', fontFamily: F.mono },

  greeksRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 8, marginTop: 4,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)',
  },
  greekLabel: { fontSize: 8, color: C.dim, fontFamily: F.mono, letterSpacing: 0.3 },
  greekValue: { fontSize: 11, color: C.sub, fontFamily: F.mono, fontWeight: '500', marginTop: 2 },

  actionLink: { fontSize: 11, color: C.accent, fontFamily: F.mono, fontWeight: '600' },

  addBtn: {
    backgroundColor: C.opcoes, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  addBtnText: { fontSize: 15, fontWeight: '700', color: 'white', fontFamily: F.display },

  histRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: 14,
  },

  simField: { width: '48%' },
  simFieldLabel: { fontSize: 11, color: C.dim, fontFamily: F.mono, marginBottom: 3 },
  simFieldInput: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1, borderColor: C.border, borderRadius: 10,
    paddingHorizontal: 10, height: 42,
  },
  simFieldText: { flex: 1, fontSize: 15, color: C.text, fontFamily: F.mono, padding: 0 },
  simFieldSuffix: { fontSize: 11, color: C.dim, fontFamily: F.mono, marginLeft: 4 },
});
