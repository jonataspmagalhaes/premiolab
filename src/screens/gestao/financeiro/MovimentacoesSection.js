// ═══════════════════════════════════════════════════════════
// MovimentacoesSection — Timeline de movimentações + filtros
// ═══════════════════════════════════════════════════════════

import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, SIZE } from '../../../theme';
import { Glass, Badge, Pill, SectionLabel, SwipeableRow, PeriodFilter } from '../../../components';
import { usePrivacyStyle } from '../../../components/Sensitive';
import Sensitive from '../../../components/Sensitive';
import * as Haptics from 'expo-haptics';
import { deleteMovimentacao, upsertSaldo, reconciliarVendasAntigas, recalcularSaldos } from '../../../services/database';
import { getSymbol } from '../../../services/currencyService';
var helpers = require('./helpers');
var fmt = helpers.fmt;
var groupMovsByDate = helpers.groupMovsByDate;
var CAT_IONICONS = helpers.CAT_IONICONS;
var CAT_COLORS = helpers.CAT_COLORS;
var CAT_LABELS = helpers.CAT_LABELS;
var AUTO_CATEGORIAS = helpers.AUTO_CATEGORIAS;
var finCats = helpers.finCats;

var MOVS_TIPOS = [
  { k: 'todos', l: 'Todos' },
  { k: 'entradas', l: 'Entradas', c: C.green },
  { k: 'saidas', l: 'Saídas', c: C.red },
  { k: 'pix', l: 'PIX', c: C.green },
  { k: 'dividendo', l: 'Dividendos', c: C.opcoes },
  { k: 'jcp', l: 'JCP', c: C.opcoes },
  { k: 'opcoes', l: 'Opções', c: C.opcoes },
  { k: 'ativos', l: 'Ativos', c: C.acoes },
  { k: 'transferencia', l: 'Transf.', c: C.accent },
  { k: 'cartao', l: 'Cartão', c: C.accent },
];

export default function MovimentacoesSection(props) {
  var movs = props.movs || [];
  var saldos = props.saldos || [];
  var navigation = props.navigation;
  var user = props.user;
  var onReload = props.onReload;
  var ps = usePrivacyStyle();

  var _movsDateRange = useState(null); var movsDateRange = _movsDateRange[0]; var setMovsDateRange = _movsDateRange[1];
  var _movsTipo = useState('todos'); var movsTipo = _movsTipo[0]; var setMovsTipo = _movsTipo[1];
  var _reconciling = useState(false); var reconciling = _reconciling[0]; var setReconciling = _reconciling[1];

  // Mapa conta→moeda
  var contaMoedaMap = {};
  for (var cmi = 0; cmi < saldos.length; cmi++) {
    var cmName = (saldos[cmi].corretora || saldos[cmi].name || '').toUpperCase().trim();
    if (cmName) contaMoedaMap[cmName] = saldos[cmi].moeda || 'BRL';
  }
  function getMovMoeda(mov) {
    var conta = (mov.conta || '').toUpperCase().trim();
    return contaMoedaMap[conta] || 'BRL';
  }

  // Separar passadas/futuras
  var todayStr = new Date().toISOString().substring(0, 10);
  var movsPast = movs.filter(function(m) { return (m.data || '').substring(0, 10) <= todayStr; });

  // Filtrar por período
  var movsByDate = movsPast;
  if (movsDateRange) {
    movsByDate = movsPast.filter(function(m) {
      var d = (m.data || '').substring(0, 10);
      return d >= movsDateRange.start && d <= movsDateRange.end;
    });
  }

  // Filtrar por tipo
  var movsFiltered = movsByDate;
  if (movsTipo === 'entradas') movsFiltered = movsByDate.filter(function(m) { return m.tipo === 'entrada'; });
  else if (movsTipo === 'saidas') movsFiltered = movsByDate.filter(function(m) { return m.tipo === 'saida'; });
  else if (movsTipo === 'dividendo') movsFiltered = movsByDate.filter(function(m) { return m.categoria === 'dividendo' || m.categoria === 'rendimento_fii'; });
  else if (movsTipo === 'jcp') movsFiltered = movsByDate.filter(function(m) { return m.categoria === 'jcp'; });
  else if (movsTipo === 'opcoes') movsFiltered = movsByDate.filter(function(m) { return m.categoria === 'premio_opcao' || m.categoria === 'recompra_opcao' || m.categoria === 'exercicio_opcao'; });
  else if (movsTipo === 'ativos') movsFiltered = movsByDate.filter(function(m) { return m.categoria === 'compra_ativo' || m.categoria === 'venda_ativo'; });
  else if (movsTipo === 'pix') movsFiltered = movsByDate.filter(function(m) { return m.meio_pagamento === 'pix'; });
  else if (movsTipo === 'transferencia') movsFiltered = movsByDate.filter(function(m) { return m.categoria === 'transferencia'; });
  else if (movsTipo === 'cartao') movsFiltered = movsByDate.filter(function(m) { return !!m.cartao_id || m.meio_pagamento === 'credito'; });

  var movsGrouped = groupMovsByDate(movsFiltered);

  function handleDeleteMov(mov) {
    var isAuto = AUTO_CATEGORIAS.indexOf(mov.categoria) >= 0;
    if (isAuto) { Alert.alert('Não permitido', 'Movimentações automáticas não podem ser excluídas.'); return; }
    var movMoeda = getMovMoeda(mov);
    var desc = mov.descricao || CAT_LABELS[mov.categoria] || mov.categoria;
    Alert.alert('Excluir movimentação?', desc + '\n' + getSymbol(movMoeda) + ' ' + fmt(mov.valor) + '\n\nO saldo será revertido automaticamente.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir e reverter', style: 'destructive', onPress: function() {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        deleteMovimentacao(mov.id).then(function(res) {
          if (res && res.error) { Alert.alert('Erro', 'Falha ao excluir.'); onReload(); return; }
          var conta = (mov.conta || '').toUpperCase().trim();
          var saldoAtual = null;
          for (var ssi = 0; ssi < saldos.length; ssi++) {
            var ssName = (saldos[ssi].corretora || saldos[ssi].name || '').toUpperCase().trim();
            if (ssName === conta) { saldoAtual = saldos[ssi]; break; }
          }
          if (saldoAtual) {
            var saldoNovo = (saldoAtual.saldo || 0);
            if (mov.tipo === 'entrada') saldoNovo = saldoNovo - (mov.valor || 0);
            else saldoNovo = saldoNovo + (mov.valor || 0);
            upsertSaldo(user.id, { corretora: conta, saldo: Math.max(0, saldoNovo), moeda: saldoAtual.moeda || 'BRL' }).then(function() { onReload(); });
          } else { onReload(); }
        });
      }}
    ]);
  }

  function handleReconciliar() {
    Alert.alert('Reconciliar vendas antigas', 'Isso vai creditar nas contas o valor de vendas que não tiveram movimentação registrada e recalcular os saldos. Deseja continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Reconciliar', onPress: function() {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setReconciling(true);
        reconciliarVendasAntigas(user.id).then(function(res) {
          return recalcularSaldos(user.id).then(function(sRes) {
            setReconciling(false);
            if (res.pendentes === 0) Alert.alert('Tudo certo', 'Nenhuma venda pendente.\nSaldos recalculados (' + sRes.atualizadas + ' conta(s)).');
            else Alert.alert('Reconciliação concluída', res.creditadas + ' venda(s) creditada(s).\nSaldos recalculados (' + sRes.atualizadas + ' conta(s)).' + (res.erros > 0 ? '\n' + res.erros + ' erro(s).' : ''));
            onReload();
          });
        }).catch(function(e) { setReconciling(false); Alert.alert('Erro', 'Falha: ' + (e.message || e)); });
      }}
    ]);
  }

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <SectionLabel>MOVIMENTAÇÕES RECENTES</SectionLabel>
        {movsPast.length > 0 ? (
          <TouchableOpacity onPress={function() { navigation.navigate('Extrato'); }} activeOpacity={0.7}
            style={styles.linkBtn}>
            <Text style={styles.linkBtnText}>Ver extrato →</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {movsPast.length > 0 ? (
        <View style={{ gap: 6 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5 }}>
            {MOVS_TIPOS.map(function(t) {
              return (
                <Pill key={t.k} active={movsTipo === t.k} color={t.c || C.accent}
                  onPress={function() { setMovsTipo(t.k); }}>
                  {t.l + (movsTipo === t.k && t.k !== 'todos' ? ' (' + movsFiltered.length + ')' : (t.k === 'todos' ? ' (' + movsByDate.length + ')' : ''))}
                </Pill>
              );
            })}
          </ScrollView>
          <PeriodFilter onRangeChange={function(r) { setMovsDateRange(r); setMovsTipo('todos'); }} />
        </View>
      ) : null}

      {movsFiltered.length === 0 ? (
        <Glass padding={16}>
          <Text style={{ fontSize: 13, color: C.sub, fontFamily: F.body, textAlign: 'center' }}>
            {movsPast.length === 0 ? 'Nenhuma movimentação realizada' : (movsTipo !== 'todos' ? 'Nenhum resultado para este filtro no período' : 'Nenhuma movimentação no período')}
          </Text>
        </Glass>
      ) : (
        <View style={{ gap: 0 }}>
          {movsGrouped.map(function(group, gi) {
            return (
              <View key={gi}>
                <View style={styles.timelineDateWrap}>
                  <View style={styles.timelineDateLine} />
                  <Text style={styles.timelineDateText}>{group.label}</Text>
                  <View style={styles.timelineDateLine} />
                </View>
                <Glass padding={0} style={{ marginBottom: 4 }}>
                  {group.items.map(function(m, mi) {
                    var isEntrada = m.tipo === 'entrada';
                    var isPix = m.meio_pagamento === 'pix';
                    var subcatM2 = m.subcategoria ? finCats.SUBCATEGORIAS[m.subcategoria] : null;
                    var movColor = isPix ? C.green : subcatM2 ? subcatM2.color : (CAT_COLORS[m.categoria] || (isEntrada ? C.green : C.red));
                    var catIcon = isPix ? 'flash-outline' : subcatM2 ? subcatM2.icon : (CAT_IONICONS[m.categoria] || 'ellipse-outline');
                    var movLabel = m.descricao || (subcatM2 ? subcatM2.l : (CAT_LABELS[m.categoria] || m.categoria));
                    var isAuto = AUTO_CATEGORIAS.indexOf(m.categoria) >= 0;
                    var isAjuste = m.categoria === 'ajuste_manual';

                    return (
                      <SwipeableRow key={m.id || mi} enabled={!isAuto} onDelete={function() { handleDeleteMov(m); }}>
                        <View style={[styles.movRow, mi > 0 && { borderTopWidth: 1, borderTopColor: C.border }, { backgroundColor: C.cardSolid }, isAjuste && { opacity: 0.45 }]}>
                          <View style={[styles.movIconWrap, { backgroundColor: movColor + '18' }]}>
                            <Ionicons name={catIcon} size={16} color={movColor} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              {m.ticker ? <Text style={styles.movTicker}>{m.ticker}</Text> : null}
                              <Text style={[styles.movDesc, m.ticker && { color: C.sub, fontWeight: '500' }]} numberOfLines={1}>
                                {m.ticker ? (CAT_LABELS[m.categoria] || m.categoria) : movLabel}
                              </Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Badge text={m.conta} color={C.dim} />
                              {isPix ? <Badge text="PIX" color={C.green} /> : null}
                              {m.parcela_atual && m.parcela_total ? <Badge text={m.parcela_atual + '/' + m.parcela_total} color={C.etfs} /> : null}
                              {isAuto ? <Badge text="auto" color={C.dim} /> : null}
                              {isAjuste ? <Badge text="ajuste" color={C.yellow} /> : null}
                              {subcatM2 && !m.descricao ? <Badge text={finCats.getGrupoMeta(subcatM2.grupo).label} color={movColor} /> : null}
                            </View>
                          </View>
                          <Text style={[styles.movVal, { color: isEntrada ? C.green : C.red }, ps]}>
                            {isEntrada ? '+' : '-'}{getSymbol(getMovMoeda(m))} {fmt(m.valor)}
                          </Text>
                        </View>
                      </SwipeableRow>
                    );
                  })}
                </Glass>
              </View>
            );
          })}
        </View>
      )}

      {movsFiltered.length > 0 ? (
        <TouchableOpacity onPress={handleReconciliar} activeOpacity={0.7} disabled={reconciling}
          style={{ alignSelf: 'center', paddingVertical: 8 }}>
          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, textDecorationLine: 'underline' }}>
            {reconciling ? 'Reconciliando...' : 'Reconciliar vendas antigas'}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

var styles = StyleSheet.create({
  linkBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: C.accent + '30' },
  linkBtnText: { fontSize: 10, fontWeight: '600', color: C.accent, fontFamily: F.mono },
  timelineDateWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 6, paddingHorizontal: 4 },
  timelineDateLine: { flex: 1, height: 1, backgroundColor: C.border },
  timelineDateText: { fontSize: 10, fontWeight: '700', color: C.dim, fontFamily: F.mono, letterSpacing: 0.5 },
  movRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14 },
  movIconWrap: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  movTicker: { fontSize: 12, fontWeight: '700', color: C.text, fontFamily: F.mono },
  movDesc: { fontSize: 12, fontWeight: '600', color: C.text, fontFamily: F.body },
  movVal: { fontSize: 13, fontWeight: '700', fontFamily: F.mono },
});
