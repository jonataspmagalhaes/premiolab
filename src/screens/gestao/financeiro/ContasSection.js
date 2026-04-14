// ═══════════════════════════════════════════════════════════
// ContasSection — Grid de contas + painel expandido
// ═══════════════════════════════════════════════════════════

import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, Alert, Dimensions, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, SIZE } from '../../../theme';
import { Glass, Badge, SectionLabel } from '../../../components';
import { usePrivacyStyle } from '../../../components/Sensitive';
import Sensitive from '../../../components/Sensitive';
import { animateLayout } from '../../../utils/a11y';
import * as Haptics from 'expo-haptics';
import {
  upsertSaldo, deleteSaldo,
  addMovimentacaoComSaldo, buildMovDescricao,
  reconciliarVendasAntigas, recalcularSaldos,
} from '../../../services/database';
import { fetchExchangeRates, convertToBRL, getSymbol } from '../../../services/currencyService';
var helpers = require('./helpers');
var fmt = helpers.fmt;
var groupByPortfolio = helpers.groupByPortfolio;

export default function ContasSection(props) {
  var saldos = props.saldos || [];
  var rates = props.rates || { BRL: 1 };
  var portfolioId = props.portfolioId;
  var portfolios = props.portfolios || [];
  var navigation = props.navigation;
  var user = props.user;
  var onReload = props.onReload;
  var scrollRef = props.scrollRef;
  var ps = usePrivacyStyle();

  var _expanded = useState(null); var expanded = _expanded[0]; var setExpanded = _expanded[1];
  var _actMode = useState(null); var actMode = _actMode[0]; var setActMode = _actMode[1];
  var _actVal = useState(''); var actVal = _actVal[0]; var setActVal = _actVal[1];
  var _trDest = useState(null); var trDest = _trDest[0]; var setTrDest = _trDest[1];
  var _trCambio = useState(''); var trCambio = _trCambio[0]; var setTrCambio = _trCambio[1];
  var _reconciling = useState(false); var reconciling = _reconciling[0]; var setReconciling = _reconciling[1];

  var expandedPanelRef = useRef(null);

  var showPortGroups = !portfolioId && portfolios.length > 0;

  function toggleExpand(id) {
    animateLayout();
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
      setTimeout(function() {
        if (expandedPanelRef.current && scrollRef && scrollRef.current) {
          expandedPanelRef.current.measureLayout(
            scrollRef.current.getInnerViewRef(),
            function(x, y) {
              scrollRef.current.scrollTo({ y: y - 80, animated: true });
            },
            function() {}
          );
        }
      }, 100);
    }
  }

  function openMode(mode) {
    animateLayout();
    setActMode(actMode === mode ? null : mode);
    setActVal('');
    setTrDest(null);
    setTrCambio('');
  }

  function resetAction() {
    setActMode(null);
    setActVal('');
    setTrDest(null);
    setTrCambio('');
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
      moeda: s.moeda || 'BRL',
    }).then(function() { onReload(); });
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
      moeda: s.moeda || 'BRL',
    }).then(function() { onReload(); });
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
    var sMoeda2 = s.moeda || 'BRL';
    var dMoeda = dest.moeda || 'BRL';
    var valorDest = num;
    var descOrigem = 'Transferência para ' + destName;
    var descDest = 'Transferência de ' + sName;

    if (sMoeda2 !== dMoeda) {
      var cambio = parseFloat((trCambio || '').replace(',', '.')) || 0;
      if (cambio <= 0) {
        Alert.alert('Câmbio inválido', 'Informe a taxa de câmbio para converter ' + sMoeda2 + ' → ' + dMoeda + '.');
        return;
      }
      valorDest = num * cambio;
      descOrigem = 'Transferência para ' + destName + ' (' + getSymbol(sMoeda2) + ' ' + fmt(num) + ' × ' + cambio.toFixed(4) + ' = ' + getSymbol(dMoeda) + ' ' + fmt(valorDest) + ')';
      descDest = 'Transferência de ' + sName + ' (' + getSymbol(sMoeda2) + ' ' + fmt(num) + ' × ' + cambio.toFixed(4) + ' = ' + getSymbol(dMoeda) + ' ' + fmt(valorDest) + ')';
    }

    resetAction();
    addMovimentacaoComSaldo(user.id, {
      conta: sName, tipo: 'saida', categoria: 'transferencia',
      valor: num, descricao: descOrigem,
      conta_destino: destName,
      data: new Date().toISOString().substring(0, 10),
      moeda: sMoeda2,
    }).then(function(res1) {
      if (res1 && res1.error) {
        Alert.alert('Erro', 'Falha ao debitar da conta de origem.');
        return;
      }
      addMovimentacaoComSaldo(user.id, {
        conta: destName, tipo: 'entrada', categoria: 'transferencia',
        valor: valorDest, descricao: descDest,
        data: new Date().toISOString().substring(0, 10),
        moeda: dMoeda,
      }).then(function(res2) {
        if (res2 && res2.error) {
          Alert.alert('Atenção', 'O débito foi feito na origem, mas houve falha ao creditar no destino. Verifique os saldos.');
        }
        onReload();
      }).catch(function() {
        Alert.alert('Atenção', 'O débito foi feito na origem, mas houve falha ao creditar no destino. Verifique os saldos.');
        onReload();
      });
    }).catch(function() {
      Alert.alert('Erro', 'Falha ao debitar da conta de origem.');
    });
  }

  function handleEditar(s) {
    var num = parseVal();
    var sName = s.corretora || s.name || '';
    var saldoAntigo = s.saldo || 0;
    var diff = num - saldoAntigo;
    resetAction();
    setExpanded(null);
    if (diff === 0) return;

    addMovimentacaoComSaldo(user.id, {
      conta: sName,
      tipo: diff > 0 ? 'entrada' : 'saida',
      categoria: 'ajuste_manual',
      valor: Math.abs(diff),
      descricao: 'Ajuste manual de saldo (' + getSymbol(s.moeda || 'BRL') + ' ' + fmt(saldoAntigo) + ' → ' + getSymbol(s.moeda || 'BRL') + ' ' + fmt(num) + ')',
      data: new Date().toISOString().substring(0, 10),
      moeda: s.moeda || 'BRL',
    }).then(function(res) {
      if (res && res.error) {
        Alert.alert('Erro', 'Falha ao atualizar saldo.');
      }
      onReload();
    });
  }

  function handleExcluir(s) {
    var sName = s.corretora || s.name || '';
    Alert.alert(
      'Excluir conta',
      'Remover ' + sName + ' e todo o saldo (' + getSymbol(s.moeda || 'BRL') + ' ' + fmt(s.saldo || 0) + ')? Esta ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir', style: 'destructive',
          onPress: function() {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setExpanded(null);
            setActMode(null);
            deleteSaldo(s.id).then(function(res) {
              if (res && res.error) {
                Alert.alert('Erro', 'Falha ao excluir conta. Tente novamente.');
              }
              onReload();
            }).catch(function() {
              Alert.alert('Erro', 'Falha ao excluir conta.');
              onReload();
            });
          },
        },
      ]
    );
  }

  function handleAddConta() {
    var params = {};
    if (portfolioId === '__null__') params.defaultPortfolio = null;
    else if (portfolioId) params.defaultPortfolio = portfolioId;
    navigation.navigate('AddConta', params);
  }

  var modeColor = actMode === 'depositar' ? C.green : actMode === 'transferir' ? C.accent : actMode === 'editar' ? C.acoes : C.yellow;

  // Find expanded conta
  var expandedConta = null;
  var expandedBC = C.accent;
  if (expanded) {
    for (var ei = 0; ei < saldos.length; ei++) {
      if (saldos[ei].id === expanded) {
        expandedConta = saldos[ei];
        expandedBC = [C.opcoes, C.acoes, C.fiis, C.etfs, C.rf, C.accent][ei % 6];
        break;
      }
    }
  }

  var contaGroups = showPortGroups ? groupByPortfolio(saldos, portfolios) : [{ key: '__all__', label: null, color: null, items: saldos }];

  return (
    <View>
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
      ) : (
        <View>
          {contaGroups.map(function(group) {
            return (
              <View key={group.key}>
                {group.label ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: group.color }} />
                    <Text style={{ fontSize: 11, fontFamily: F.body, color: group.color, fontWeight: '600' }}>{group.label}</Text>
                  </View>
                ) : null}
                <View style={styles.accountGrid}>
                  {group.items.map(function(s, i) {
                    var globalIdx = saldos.indexOf(s);
                    var bc = [C.opcoes, C.acoes, C.fiis, C.etfs, C.rf, C.accent][globalIdx % 6];
                    var sName = s.corretora || s.name || '';
                    var isExp = expanded === s.id;
                    var contaMoeda2 = s.moeda || 'BRL';
                    var simbolo = getSymbol(contaMoeda2);
                    var saldoBRL = convertToBRL(s.saldo || 0, contaMoeda2, rates);

                    return (
                      <TouchableOpacity key={s.id || i}
                        onPress={function() { toggleExpand(s.id); }}
                        activeOpacity={0.7}
                        accessibilityLabel={sName + ', saldo ' + simbolo + ' ' + fmt(s.saldo || 0)}
                        accessibilityHint={isExp ? 'Toque para recolher' : 'Toque para expandir'}
                        style={styles.accountGridItem}>
                        <Glass padding={10} style={isExp ? { borderColor: bc + '40', borderWidth: 1.5 } : {}}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={[styles.gridIcon, { backgroundColor: bc + '12', borderColor: bc + '22' }]}>
                              <Text style={[styles.gridIconText, { color: bc }]}>
                                {(sName || 'CT').substring(0, 2).toUpperCase()}
                              </Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.gridContaName} numberOfLines={1}>{sName}</Text>
                              <Text style={styles.gridContaTipo}>{s.tipo === 'corretora' ? 'Corretora' : s.tipo === 'banco' ? 'Banco' : s.tipo || 'Conta'}</Text>
                            </View>
                          </View>
                          <Sensitive>
                            <Text style={[styles.gridContaSaldo, { color: bc }]}>{simbolo} {fmt(s.saldo || 0)}</Text>
                          </Sensitive>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <Badge text={contaMoeda2} color={contaMoeda2 !== 'BRL' ? C.etfs : bc} />
                            {contaMoeda2 !== 'BRL' ? (
                              <Sensitive>
                                <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono }}>
                                  {'≈ R$ ' + fmt(saldoBRL)}
                                </Text>
                              </Sensitive>
                            ) : null}
                          </View>
                        </Glass>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })}

          {/* Painel expandido full-width */}
          {expandedConta ? (function() {
            var s = expandedConta;
            var bc = expandedBC;
            var sName = s.corretora || s.name || '';
            var contaMoeda2 = s.moeda || 'BRL';
            var simbolo = getSymbol(contaMoeda2);
            var destOptions = saldos.filter(function(x) { return x.id !== s.id; });

            return (
              <View ref={expandedPanelRef} collapsable={false}>
              <Glass padding={12} style={{ borderColor: bc + '30', marginTop: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={[styles.gridIcon, { backgroundColor: bc + '12', borderColor: bc + '22' }]}>
                      <Text style={[styles.gridIconText, { color: bc }]}>
                        {(sName || 'CT').substring(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: C.text, fontFamily: F.display }}>{sName}</Text>
                  </View>
                  <TouchableOpacity onPress={function() { toggleExpand(s.id); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="close" size={18} color={C.dim} />
                  </TouchableOpacity>
                </View>
                {!actMode ? (
                  <View style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity onPress={function() { openMode('depositar'); }} activeOpacity={0.7}
                        style={[styles.saldoBtn, { borderColor: C.green + '30' }]}
                        accessibilityRole="button" accessibilityLabel="Depositar">
                        <Text style={[styles.saldoBtnText, { color: C.green + 'CC' }]}>Depositar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={function() { openMode('deduzir'); }} activeOpacity={0.7}
                        style={[styles.saldoBtn, { borderColor: C.yellow + '30' }]}
                        accessibilityRole="button" accessibilityLabel="Retirar">
                        <Text style={[styles.saldoBtnText, { color: C.yellow + 'CC' }]}>Retirar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={function() { openMode('transferir'); }} activeOpacity={0.7}
                        style={[styles.saldoBtn, { borderColor: C.accent + '30' }]}
                        accessibilityRole="button" accessibilityLabel="Transferir">
                        <Text style={[styles.saldoBtnText, { color: C.accent + 'CC' }]}>Transferir</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TouchableOpacity onPress={function() { openMode('editar'); }} activeOpacity={0.7}
                        style={[styles.saldoBtn, { borderColor: C.acoes + '30' }]}
                        accessibilityRole="button" accessibilityLabel="Editar saldo">
                        <Text style={[styles.saldoBtnText, { color: C.acoes + 'CC' }]}>Editar saldo</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={function() { handleExcluir(s); }} activeOpacity={0.7}
                        style={[styles.saldoBtn, { borderColor: C.red + '30' }]}
                        accessibilityRole="button" accessibilityLabel="Excluir conta">
                        <Text style={[styles.saldoBtnText, { color: C.red + 'CC' }]}>Excluir conta</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={function() { navigation.navigate('Extrato', { conta: sName }); }} activeOpacity={0.7}
                      style={[styles.saldoBtn, { borderColor: C.text + '20', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }]}
                      accessibilityRole="button" accessibilityLabel={'Transações de ' + sName}>
                      <Ionicons name="receipt-outline" size={14} color={C.text + 'CC'} />
                      <Text style={[styles.saldoBtnText, { color: C.text + 'CC' }]}>Transações</Text>
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
                        {actMode === 'editar' ? (
                          <Text style={[{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 }, ps]}>
                            NOVO SALDO (atual: {simbolo} {fmt(s.saldo || 0)})
                          </Text>
                        ) : null}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ fontSize: 13, color: C.sub, fontFamily: F.mono }}>{simbolo}</Text>
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
                          <View style={{ gap: 6 }}>
                            <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.4 }}>DESTINO</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                              {destOptions.map(function(d) {
                                var sel = trDest === d.id;
                                var dMoeda = d.moeda || 'BRL';
                                return (
                                  <TouchableOpacity key={d.id}
                                    onPress={function() {
                                      var destId = sel ? null : d.id;
                                      setTrDest(destId);
                                      if (!sel && contaMoeda2 !== dMoeda) {
                                        var moedasNecessarias = [contaMoeda2, dMoeda].filter(function(m) { return m !== 'BRL'; });
                                        fetchExchangeRates(moedasNecessarias).then(function(freshRates) {
                                          var rateFrom = freshRates[contaMoeda2] || 1;
                                          var rateTo = freshRates[dMoeda] || 1;
                                          var cambioAuto = rateTo > 0 ? (rateFrom / rateTo) : 1;
                                          setTrCambio(cambioAuto.toFixed(4).replace('.', ','));
                                        });
                                      } else {
                                        setTrCambio('');
                                      }
                                    }}
                                    activeOpacity={0.7}
                                    style={[styles.destPill, sel && { borderColor: C.accent, backgroundColor: C.accent + '18' }]}>
                                    <Text style={[styles.destPillText, sel && { color: C.accent, fontWeight: '700' }]}>
                                      {(d.corretora || d.name || '') + (dMoeda !== contaMoeda2 ? ' (' + dMoeda + ')' : '')}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                            {(function() {
                              var destSel = trDest ? saldos.find(function(x) { return x.id === trDest; }) : null;
                              var dMoeda = destSel ? (destSel.moeda || 'BRL') : contaMoeda2;
                              if (contaMoeda2 === dMoeda) return null;
                              var cambioNum = parseFloat((trCambio || '').replace(',', '.')) || 0;
                              var valOrigem = parseVal();
                              var valConv = valOrigem * cambioNum;
                              return (
                                <View style={{ gap: 6, marginTop: 4, padding: 8, borderRadius: 8, backgroundColor: C.accent + '08', borderWidth: 1, borderColor: C.accent + '20' }}>
                                  <Text style={{ fontSize: 10, color: C.accent, fontFamily: F.mono, letterSpacing: 0.4 }}>
                                    CÂMBIO {contaMoeda2} → {dMoeda}
                                  </Text>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.mono }}>1 {contaMoeda2} =</Text>
                                    <TextInput
                                      value={trCambio}
                                      onChangeText={setTrCambio}
                                      placeholder="0,0000"
                                      placeholderTextColor={C.dim}
                                      keyboardType="decimal-pad"
                                      style={[styles.valInput, { flex: 0, width: 100, borderColor: C.accent + '40', fontSize: 13 }]}
                                    />
                                    <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.mono }}>{dMoeda}</Text>
                                  </View>
                                  {valOrigem > 0 && cambioNum > 0 ? (
                                    <Text style={[{ fontSize: 11, color: C.green, fontFamily: F.mono }, ps]}>
                                      {getSymbol(contaMoeda2) + ' ' + fmt(valOrigem) + ' → ' + getSymbol(dMoeda) + ' ' + fmt(valConv)}
                                    </Text>
                                  ) : null}
                                </View>
                              );
                            })()}
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
                          else if (actMode === 'editar') handleEditar(s);
                          else handleDeduzir(s);
                        }}
                        activeOpacity={0.7}
                        style={[styles.confirmBtn, { backgroundColor: modeColor + '18', borderColor: modeColor + '40' }]}>
                        <Text style={[styles.confirmBtnText, { color: modeColor }]}>Confirmar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </Glass>
              </View>
            );
          })() : null}
        </View>
      )}
    </View>
  );
}

var styles = StyleSheet.create({
  addContaBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: C.accent + '30' },
  addContaBtnText: { fontSize: 10, fontWeight: '600', color: C.accent, fontFamily: F.mono },
  ctaBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: C.accent },
  ctaBtnText: { fontSize: 12, fontWeight: '600', color: C.text, fontFamily: F.body },
  accountGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  accountGridItem: { width: (Dimensions.get('window').width - SIZE.padding * 2 - 8) / 2 },
  gridIcon: { width: 24, height: 24, borderRadius: 6, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  gridIconText: { fontSize: 9, fontWeight: '700', fontFamily: F.mono },
  gridContaName: { fontSize: 12, fontWeight: '600', color: C.text, fontFamily: F.display, flex: 1 },
  gridContaTipo: { fontSize: 9, color: C.dim, fontFamily: F.mono, marginTop: 1 },
  gridContaSaldo: { fontSize: 14, fontWeight: '700', fontFamily: F.mono, marginTop: 6 },
  saldoBtn: { flex: 1, paddingVertical: 5, borderRadius: 6, borderWidth: 1, alignItems: 'center' },
  saldoBtnText: { fontSize: 10, fontWeight: '600', fontFamily: F.mono, letterSpacing: 0.4 },
  valInput: {
    flex: 1, backgroundColor: C.cardSolid, borderWidth: 1,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 16, color: C.text, fontFamily: F.mono,
  },
  destPill: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: C.border },
  destPillText: { fontSize: 11, fontFamily: F.body, fontWeight: '500', color: C.sub },
  cancelBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  cancelBtnText: { fontSize: 13, fontWeight: '600', color: C.sub, fontFamily: F.body },
  confirmBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  confirmBtnText: { fontSize: 13, fontWeight: '600', fontFamily: F.body },
});
