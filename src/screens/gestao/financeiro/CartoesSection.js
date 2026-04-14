// ═══════════════════════════════════════════════════════════
// CartoesSection — Grid de cartões de crédito + painel expandido
// ═══════════════════════════════════════════════════════════

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Alert, Dimensions, StyleSheet, ActivityIndicator, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, SIZE } from '../../../theme';
import { Glass, Badge, SectionLabel } from '../../../components';
import { usePrivacyStyle } from '../../../components/Sensitive';
import Sensitive from '../../../components/Sensitive';
import { animateLayout } from '../../../utils/a11y';
import Toast from 'react-native-toast-message';
import { deleteCartao, pagarFatura, getSaldos } from '../../../services/database';
import { getSymbol } from '../../../services/currencyService';
import * as Haptics from 'expo-haptics';
var helpers = require('./helpers');
var fmt = helpers.fmt;
var groupByPortfolio = helpers.groupByPortfolio;

export default function CartoesSection(props) {
  var cartoes = props.cartoes || [];
  var faturasTotais = props.faturasTotais || {};
  var faturasStatus = props.faturasStatus || {};
  var cardPontos = props.cardPontos || {};
  var portfolioId = props.portfolioId;
  var portfolios = props.portfolios || [];
  var navigation = props.navigation;
  var user = props.user;
  var onReload = props.onReload;
  var cartaoPrincipal = props.cartaoPrincipal || null;
  var onSetPrincipal = props.onSetPrincipal;
  var ps = usePrivacyStyle();

  var _expandedCartao = useState(null); var expandedCartao = _expandedCartao[0]; var setExpandedCartao = _expandedCartao[1];
  var _payingCardId = useState(null); var payingCardId = _payingCardId[0]; var setPayingCardId = _payingCardId[1];
  var _payValor = useState(''); var payValor = _payValor[0]; var setPayValor = _payValor[1];
  var _payContas = useState([]); var payContas = _payContas[0]; var setPayContas = _payContas[1];
  var _payConta = useState(''); var payConta = _payConta[0]; var setPayConta = _payConta[1];
  var _payLoading = useState(false); var payLoading = _payLoading[0]; var setPayLoading = _payLoading[1];

  var showPortGroups = !portfolioId && portfolios.length > 0;

  function openPayPanel(cartao) {
    var total = faturasTotais[cartao.id] || 0;
    var cents = Math.round(total * 100);
    var formatted = (cents / 100).toFixed(2).replace('.', ',');
    setPayValor(formatted);
    setPayingCardId(cartao.id);
    // Buscar contas para selecionar
    if (user) {
      getSaldos(user.id).then(function(res) {
        setPayContas(res.data || []);
        // Auto-selecionar conta vinculada
        if (cartao.conta_vinculada) {
          setPayConta(cartao.conta_vinculada);
        } else if (res.data && res.data.length === 1) {
          setPayConta(res.data[0].corretora || res.data[0].name || '');
        }
      }).catch(function() {});
    }
  }

  function handlePaySubmit(cartao) {
    Keyboard.dismiss();
    if (!payConta) {
      Alert.alert('Conta', 'Selecione a conta para pagamento.');
      return;
    }
    var valorNum = parseFloat(payValor.replace(/\./g, '').replace(',', '.'));
    if (!valorNum || valorNum <= 0) {
      Alert.alert('Valor', 'Informe um valor válido.');
      return;
    }
    setPayLoading(true);
    var dataHoje = new Date().toISOString().substring(0, 10);
    var moedaCartao = cartao.moeda || 'BRL';
    pagarFatura(user.id, cartao.id, payConta, valorNum, moedaCartao, dataHoje)
      .then(function(result) {
        setPayLoading(false);
        if (result.error) {
          Alert.alert('Erro', 'Não foi possível registrar o pagamento.');
          return;
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Toast.show({ type: 'success', text1: 'Fatura paga!' });
        setPayingCardId(null);
        setPayValor('');
        onReload();
      }).catch(function() {
        setPayLoading(false);
        Alert.alert('Erro', 'Falha ao pagar fatura.');
      });
  }

  function onChangePayVal(text) {
    var clean = text.replace(/[^0-9]/g, '');
    if (!clean) { setPayValor(''); return; }
    var cents = parseInt(clean);
    var reais = (cents / 100).toFixed(2);
    setPayValor(reais.replace('.', ','));
  }

  function handleExcluirCartao(cartao) {
    var bandeira = cartao.bandeira ? cartao.bandeira.toUpperCase() : '';
    var msg = 'Excluir ' + bandeira + ' ••••' + cartao.ultimos_digitos + '?';
    var sub = 'O histórico de lançamentos será mantido.';
    if (faturasTotais[cartao.id] && faturasTotais[cartao.id] > 0) {
      sub = sub + ' Atenção: há fatura aberta de ' + getSymbol(cartao.moeda || 'BRL') + ' ' + faturasTotais[cartao.id].toFixed(2).replace('.', ',') + '.';
    }
    Alert.alert(msg, sub, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: function() {
        deleteCartao(cartao.id).then(function(res) {
          if (res.error) { Alert.alert('Erro', 'Não foi possível excluir.'); return; }
          Toast.show({ type: 'success', text1: 'Cartão excluído' });
          setExpandedCartao(null);
          onReload();
        });
      }}
    ]);
  }

  if (cartoes.length === 0) return null;

  var cartaoGroups = showPortGroups ? groupByPortfolio(cartoes, portfolios) : [{ key: '__all__', label: null, color: null, items: cartoes }];

  var expandedCartaoObj = null;
  if (expandedCartao) {
    for (var eci = 0; eci < cartoes.length; eci++) {
      if (cartoes[eci].id === expandedCartao) { expandedCartaoObj = cartoes[eci]; break; }
    }
  }

  return (
    <View>
      <SectionLabel>CARTÕES DE CRÉDITO</SectionLabel>
      {cartaoGroups.map(function(group) {
        return (
          <View key={group.key}>
            {group.label ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: group.color }} />
                <Text style={{ fontSize: 11, fontFamily: F.body, color: group.color, fontWeight: '600' }}>{group.label}</Text>
              </View>
            ) : null}
            <View style={styles.accountGrid}>
              {group.items.map(function(c) {
                var isCardExp = expandedCartao === c.id;
                var fatTotal = faturasTotais[c.id] || 0;
                var fatStatus = faturasStatus[c.id] || 'aberta';
                var sym = getSymbol(c.moeda || 'BRL');
                var bandeira = c.bandeira ? c.bandeira.toUpperCase() : '';
                var label = (c.apelido || bandeira) + ' ••••' + c.ultimos_digitos;

                return (
                  <TouchableOpacity key={c.id}
                    onPress={function() { animateLayout(); setExpandedCartao(isCardExp ? null : c.id); }}
                    activeOpacity={0.7}
                    style={styles.accountGridItem}>
                    <Glass padding={10} style={isCardExp ? { borderColor: C.accent + '40', borderWidth: 1.5 } : {}}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="card-outline" size={16} color={C.accent} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.gridContaName} numberOfLines={2}>{label}</Text>
                          <Text style={styles.gridContaTipo}>{bandeira || 'Cartão'}</Text>
                        </View>
                      </View>
                      <Sensitive>
                        <Text style={[styles.gridContaSaldo, { color: fatStatus === 'paga' ? C.green : fatTotal > 0 ? C.yellow : C.green }]}>
                          {sym + ' ' + fatTotal.toFixed(2).replace('.', ',')}
                        </Text>
                      </Sensitive>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                        {cartaoPrincipal === c.id ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginRight: 4 }}>
                            <Ionicons name="star" size={9} color={C.yellow} />
                            <Text style={{ fontSize: 9, fontFamily: F.mono, color: C.yellow }}>Principal</Text>
                          </View>
                        ) : null}
                        {cardPontos[c.id] && cardPontos[c.id] > 0 ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                            <Ionicons
                              name={c.tipo_beneficio === 'pontos' ? 'star' : 'cash-outline'}
                              size={10}
                              color={c.tipo_beneficio === 'pontos' ? C.yellow : C.green}
                            />
                            <Text style={{ fontSize: 9, fontFamily: F.mono, color: c.tipo_beneficio === 'pontos' ? C.yellow : C.green }}>
                              {c.tipo_beneficio === 'pontos'
                                ? Math.round(cardPontos[c.id]).toLocaleString('pt-BR') + ' pts'
                                : fmt(cardPontos[c.id]) + ' cb'}
                            </Text>
                          </View>
                        ) : (
                          <Text style={{ fontSize: 9, fontFamily: F.mono, color: C.dim }}>Fatura atual</Text>
                        )}
                        {fatStatus === 'paga' ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 4 }}>
                            <Ionicons name="checkmark-circle" size={10} color={C.green} />
                            <Text style={{ fontSize: 9, fontFamily: F.mono, color: C.green }}>PAGA</Text>
                          </View>
                        ) : fatStatus === 'parcial' ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 4 }}>
                            <Ionicons name="alert-circle" size={10} color={C.yellow} />
                            <Text style={{ fontSize: 9, fontFamily: F.mono, color: C.yellow }}>PARCIAL</Text>
                          </View>
                        ) : fatStatus === 'fechada' ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 4 }}>
                            <Ionicons name="lock-closed" size={10} color={C.red} />
                            <Text style={{ fontSize: 9, fontFamily: F.mono, color: C.red }}>FECHADA</Text>
                          </View>
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

      {/* Painel expandido do cartão */}
      {expandedCartaoObj ? (function() {
        var c = expandedCartaoObj;
        var fatTotal = faturasTotais[c.id] || 0;
        var fatSt = faturasStatus[c.id] || 'aberta';
        var fatStLabel = fatSt === 'paga' ? 'Fatura paga' : fatSt === 'parcial' ? 'Fatura parcial' : fatSt === 'fechada' ? 'Fatura fechada' : 'Fatura aberta';
        var fatStColor = fatSt === 'paga' ? C.green : fatSt === 'parcial' ? C.yellow : fatSt === 'fechada' ? C.red : C.dim;
        var sym = getSymbol(c.moeda || 'BRL');
        var bandeira = c.bandeira ? c.bandeira.toUpperCase() : '';
        var label = (c.apelido || bandeira) + ' ••••' + c.ultimos_digitos;

        return (
          <Glass padding={12} style={{ borderColor: C.accent + '30', marginTop: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="card-outline" size={18} color={C.accent} />
                <Text style={{ fontSize: 14, fontFamily: F.body, color: C.text }}>{label}</Text>
              </View>
              <TouchableOpacity onPress={function() { animateLayout(); setExpandedCartao(null); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={18} color={C.dim} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontSize: 11, color: fatStColor }}>{fatStLabel}</Text>
              <Sensitive>
                <Text style={{ fontSize: 13, fontFamily: F.mono, color: C.text }}>
                  {sym + ' ' + fatTotal.toFixed(2).replace('.', ',')}
                </Text>
              </Sensitive>
            </View>

            {c.limite && c.limite > 0 ? (
              <View style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 10, color: C.dim }}>Limite</Text>
                  <Sensitive>
                    <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>
                      {sym + ' ' + Number(c.limite).toFixed(2).replace('.', ',')}
                    </Text>
                  </Sensitive>
                </View>
                <View style={{ height: 4, backgroundColor: C.border, borderRadius: 2 }}>
                  <View style={{ height: 4, borderRadius: 2, backgroundColor: fatTotal / c.limite > 0.9 ? C.red : fatTotal / c.limite > 0.7 ? C.yellow : C.green, width: Math.min(fatTotal / c.limite, 1) * 100 + '%' }} />
                </View>
              </View>
            ) : null}

            <Text style={{ fontSize: 11, color: C.dim, marginBottom: 10 }}>
              {'Fechamento dia ' + c.dia_fechamento + '  ·  Vencimento dia ' + c.dia_vencimento + (c.moeda && c.moeda !== 'BRL' ? '  ·  ' + c.moeda : '')}
            </Text>

            {cardPontos[c.id] && cardPontos[c.id] > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Ionicons
                  name={c.tipo_beneficio === 'pontos' ? 'star' : 'cash-outline'}
                  size={12}
                  color={c.tipo_beneficio === 'pontos' ? C.yellow : C.green}
                />
                <Text style={{ fontSize: 11, fontFamily: F.mono, color: c.tipo_beneficio === 'pontos' ? C.yellow : C.green }}>
                  {c.tipo_beneficio === 'pontos'
                    ? Math.round(cardPontos[c.id]).toLocaleString('pt-BR') + ' pts'
                    : sym + ' ' + fmt(cardPontos[c.id]) + ' cashback'}
                </Text>
                {c.programa_nome ? <Text style={{ fontSize: 10, color: C.dim }}>{c.programa_nome}</Text> : null}
              </View>
            ) : null}

            {/* Painel pagamento inline */}
            {payingCardId === c.id ? (
              <View style={{ backgroundColor: C.green + '10', borderRadius: 8, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: C.green + '30' }}>
                <Text style={{ fontSize: 11, color: C.green, fontFamily: F.mono, fontWeight: '700', marginBottom: 8 }}>PAGAR FATURA</Text>
                <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, marginBottom: 6 }}>VALOR</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Text style={{ fontSize: 14, color: C.sub, fontFamily: F.mono }}>{sym}</Text>
                  <TextInput
                    value={payValor}
                    onChangeText={onChangePayVal}
                    keyboardType="numeric"
                    placeholder="0,00"
                    placeholderTextColor={C.dim}
                    style={{ flex: 1, backgroundColor: C.cardSolid, borderWidth: 1, borderColor: C.borderLight, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 16, color: C.text, fontFamily: F.mono }}
                    autoFocus
                  />
                </View>
                <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, marginBottom: 6 }}>CONTA</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {payContas.map(function(s) {
                    var sName = s.corretora || s.name || '';
                    return (
                      <TouchableOpacity key={s.id} onPress={function() { setPayConta(sName); }}
                        style={{ backgroundColor: payConta === sName ? C.accent + '33' : 'rgba(255,255,255,0.06)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: payConta === sName ? 1 : 0, borderColor: C.accent }}>
                        <Text style={{ fontSize: 11, color: payConta === sName ? C.accent : C.sub, fontFamily: F.body }}>{sName}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity onPress={function() { setPayingCardId(null); }}
                    style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)' }}>
                    <Text style={{ fontSize: 12, color: C.dim, fontFamily: F.body }}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={function() { handlePaySubmit(c); }} disabled={payLoading}
                    style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8, backgroundColor: C.green }}>
                    {payLoading ? (
                      <ActivityIndicator color="white" size="small" />
                    ) : (
                      <Text style={{ fontSize: 12, color: '#fff', fontFamily: F.display, fontWeight: '700' }}>Confirmar</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {/* Botão Pagar — só se fatura fechada ou com saldo */}
              {fatSt !== 'paga' && fatTotal > 0 ? (
                <TouchableOpacity onPress={function() { openPayPanel(c); }}
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.green + '22', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, gap: 4 }}>
                  <Ionicons name="wallet-outline" size={14} color={C.green} />
                  <Text style={{ fontSize: 12, color: C.green, fontFamily: F.body, fontWeight: '600' }}>Pagar Fatura</Text>
                </TouchableOpacity>
              ) : null}
              {onSetPrincipal ? (
                <TouchableOpacity onPress={function() { onSetPrincipal(cartaoPrincipal === c.id ? null : c.id); }}
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: cartaoPrincipal === c.id ? C.yellow + '22' : 'rgba(255,255,255,0.06)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, gap: 4 }}>
                  <Ionicons name={cartaoPrincipal === c.id ? 'star' : 'star-outline'} size={14} color={C.yellow} />
                  <Text style={{ fontSize: 12, color: C.yellow, fontFamily: F.body }}>{cartaoPrincipal === c.id ? 'Principal' : 'Tornar Principal'}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={function() { navigation.navigate('Fatura', { cartaoId: c.id, cartao: c }); }}
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.accent + '22', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, gap: 4 }}>
                <Ionicons name="receipt-outline" size={14} color={C.accent} />
                <Text style={{ fontSize: 12, color: C.accent, fontFamily: F.body }}>Ver Fatura</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={function() { navigation.navigate('AddCartao', { cartao: c }); }}
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.accent + '22', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, gap: 4 }}>
                <Ionicons name="create-outline" size={14} color={C.accent} />
                <Text style={{ fontSize: 12, color: C.accent, fontFamily: F.body }}>Editar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={function() { handleExcluirCartao(c); }}
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.red + '22', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, gap: 4 }}>
                <Ionicons name="trash-outline" size={14} color={C.red} />
                <Text style={{ fontSize: 12, color: C.red, fontFamily: F.body }}>Excluir</Text>
              </TouchableOpacity>
            </View>
          </Glass>
        );
      })() : null}
    </View>
  );
}

var styles = StyleSheet.create({
  accountGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  accountGridItem: { width: (Dimensions.get('window').width - SIZE.padding * 2 - 8) / 2 },
  gridContaName: { fontSize: 12, fontWeight: '600', color: C.text, fontFamily: F.display, flex: 1 },
  gridContaTipo: { fontSize: 9, color: C.dim, fontFamily: F.mono, marginTop: 1 },
  gridContaSaldo: { fontSize: 14, fontWeight: '700', fontFamily: F.mono, marginTop: 6 },
});
