// CalendarioRendaScreen — Calendario unificado de renda.
// Mostra em um calendario mensal cada entrada de renda:
//  - Dividendos/JCP (proventos recebidos)
//  - Rendimentos de FII
//  - Premios de opcoes (por vencimento)
//  - Cupons de renda fixa (estimados)
// Navegacao mes anterior/proximo, tap no dia abre detalhe.

import React from 'react';
var useState = React.useState;
var useEffect = React.useEffect;
var useCallback = React.useCallback;
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, SIZE } from '../../theme';
import { Glass } from '../../components';
import { useAuth } from '../../contexts/AuthContext';
import Sensitive, { usePrivacyStyle } from '../../components/Sensitive';
import { getProventos, getOpcoes, getRendaFixa } from '../../services/database';

var W = Dimensions.get('window').width;

var MESES_LONG = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
var DIAS_ABBR = ['D','S','T','Q','Q','S','S'];

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

function sameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear()
    && d1.getMonth() === d2.getMonth()
    && d1.getDate() === d2.getDate();
}

// Cores dos tipos
var TIPO_COLOR = {
  fii: C.fiis || '#10B981',
  acao: C.acoes || '#3B82F6',
  etf: C.etfs || '#F59E0B',
  opcao: '#8B5CF6',
  rf: C.rf || '#06B6D4',
};
var TIPO_LABEL = {
  fii: 'FII',
  acao: 'Acao',
  etf: 'ETF',
  opcao: 'Opcao',
  rf: 'RF',
};

function inferTipoFromTicker(ticker) {
  var tk = (ticker || '').toUpperCase();
  if (/11$/.test(tk)) return 'fii';
  return 'acao';
}

function buildEventsForMonth(year, monthIdx, proventos, opcoes, rfList) {
  // monthIdx 0-11
  var events = [];
  var startMes = new Date(year, monthIdx, 1);
  var endMes = new Date(year, monthIdx + 1, 1);

  // Proventos
  for (var i = 0; i < proventos.length; i++) {
    var p = proventos[i];
    var pd = parseDateSafe(p.data_pagamento);
    if (!pd || pd < startMes || pd >= endMes) continue;
    var v = p.valor_total || ((p.valor_por_cota || 0) * (p.quantidade || 0));
    if (v <= 0) continue;
    var tipo = inferTipoFromTicker(p.ticker);
    events.push({
      dia: pd.getDate(),
      tipo: tipo,
      ticker: (p.ticker || '').toUpperCase(),
      valor: v,
      status: 'recebido',
      label: p.tipo_provento || 'Dividendo',
      data: pd,
    });
  }

  // Opcoes — vencimento
  for (var j = 0; j < opcoes.length; j++) {
    var o = opcoes[j];
    var venc = parseDateSafe(o.vencimento);
    if (!venc || venc < startMes || venc >= endMes) continue;
    if ((o.direcao || 'venda') === 'compra') continue;
    var premio = (o.premio || 0) * (o.qty || 0);
    if (premio <= 0) continue;
    events.push({
      dia: venc.getDate(),
      tipo: 'opcao',
      ticker: o.ticker_opcao,
      valor: premio,
      status: o.status === 'ativa' ? 'previsto' : 'recebido',
      label: 'Venc. ' + (o.tipo || 'call').toUpperCase(),
      data: venc,
    });
  }

  // Renda fixa — vencimentos (cupom estimado)
  for (var k = 0; k < rfList.length; k++) {
    var rf = rfList[k];
    var vencRF = parseDateSafe(rf.vencimento);
    if (vencRF && vencRF >= startMes && vencRF < endMes) {
      events.push({
        dia: vencRF.getDate(),
        tipo: 'rf',
        ticker: rf.emissor || rf.tipo || 'RF',
        valor: rf.valor_aplicado || 0,
        status: 'previsto',
        label: 'Venc. ' + (rf.tipo || 'RF'),
        data: vencRF,
      });
    }
  }

  return events;
}

function groupByDay(events) {
  var map = {};
  for (var i = 0; i < events.length; i++) {
    var d = events[i].dia;
    if (!map[d]) map[d] = { total: 0, tipos: {}, items: [] };
    map[d].total += events[i].valor;
    map[d].tipos[events[i].tipo] = true;
    map[d].items.push(events[i]);
  }
  return map;
}

// ═══════════ CELULA DO DIA ═══════════
function DayCell(props) {
  var cellWidth = props.cellWidth;
  var day = props.day;
  var dayData = props.dayData;
  var isToday = props.isToday;
  var isSelected = props.isSelected;
  var inMonth = props.inMonth;
  var onPress = props.onPress;

  var tipoKeys = dayData ? Object.keys(dayData.tipos) : [];
  var bg = 'transparent';
  var borderColor = 'transparent';
  if (isSelected) {
    bg = C.accent + '30';
    borderColor = C.accent;
  } else if (isToday) {
    bg = 'rgba(255,255,255,0.06)';
    borderColor = 'rgba(255,255,255,0.18)';
  }

  return (
    <TouchableOpacity
      onPress={inMonth ? onPress : undefined}
      activeOpacity={0.7}
      style={{
        width: cellWidth,
        height: cellWidth,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: borderColor,
      }}
    >
      <Text style={{
        fontSize: 13,
        color: inMonth ? (isToday ? C.accent : C.text) : C.dim,
        fontFamily: isToday ? F.display : F.body,
        fontWeight: isToday ? '800' : '500',
        opacity: inMonth ? 1 : 0.25,
      }}>{day}</Text>
      {tipoKeys.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: 2, marginTop: 2 }}>
          {tipoKeys.slice(0, 4).map(function(tp) {
            return (
              <View key={tp} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: TIPO_COLOR[tp] }} />
            );
          })}
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

// ═══════════ TELA PRINCIPAL ═══════════
export default function CalendarioRendaScreen(props) {
  var navigation = props.navigation;
  var user = useAuth().user;
  var ps = usePrivacyStyle();

  var now = new Date();
  var _year = useState(now.getFullYear()); var year = _year[0]; var setYear = _year[1];
  var _month = useState(now.getMonth()); var month = _month[0]; var setMonth = _month[1];
  var _selDay = useState(now.getDate()); var selDay = _selDay[0]; var setSelDay = _selDay[1];

  var _loading = useState(true); var loading = _loading[0]; var setLoading = _loading[1];
  var _proventos = useState([]); var proventos = _proventos[0]; var setProventos = _proventos[1];
  var _opcoes = useState([]); var opcoes = _opcoes[0]; var setOpcoes = _opcoes[1];
  var _rfList = useState([]); var rfList = _rfList[0]; var setRfList = _rfList[1];

  function loadAll() {
    if (!user) return;
    setLoading(true);
    Promise.all([
      getProventos(user.id, { limit: 2000 }),
      getOpcoes(user.id),
      getRendaFixa(user.id),
    ]).then(function(results) {
      setProventos((results[0] && results[0].data) || []);
      setOpcoes((results[1] && results[1].data) || []);
      setRfList((results[2] && results[2].data) || []);
      setLoading(false);
    }).catch(function(err) {
      console.warn('Calendario loadAll error:', err && err.message);
      setLoading(false);
    });
  }

  useFocusEffect(useCallback(function() { loadAll(); }, [user]));

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else { setMonth(month - 1); }
    setSelDay(1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else { setMonth(month + 1); }
    setSelDay(1);
  }

  var events = buildEventsForMonth(year, month, proventos, opcoes, rfList);
  var dayMap = groupByDay(events);

  // Totais do mes
  var totalMes = 0;
  var totalPorTipo = { fii: 0, acao: 0, opcao: 0, rf: 0, etf: 0 };
  for (var ei = 0; ei < events.length; ei++) {
    totalMes += events[ei].valor;
    totalPorTipo[events[ei].tipo] = (totalPorTipo[events[ei].tipo] || 0) + events[ei].valor;
  }

  // Grid do calendario
  var firstDay = new Date(year, month, 1);
  var firstDow = firstDay.getDay();
  var daysInMonth = new Date(year, month + 1, 0).getDate();
  var prevDays = new Date(year, month, 0).getDate();

  var cells = [];
  for (var d1 = firstDow - 1; d1 >= 0; d1--) {
    cells.push({ day: prevDays - d1, inMonth: false });
  }
  for (var d2 = 1; d2 <= daysInMonth; d2++) {
    cells.push({ day: d2, inMonth: true });
  }
  while (cells.length < 42) {
    cells.push({ day: cells.length - firstDow - daysInMonth + 1, inMonth: false });
  }

  var cellWidth = Math.floor((W - SIZE.padding * 2 - 28) / 7);
  var todayDate = new Date();

  // Detalhe do dia selecionado
  var selDayData = dayMap[selDay];
  var selDayItems = selDayData ? selDayData.items : [];

  return (
    <ScrollView style={st.container} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity onPress={function() { navigation.goBack(); }}>
            <Ionicons name="chevron-back" size={28} color={C.accent} />
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: '800', color: C.text, fontFamily: F.display }}>Calendario de Renda</Text>
        </View>
      </View>

      {loading ? (
        <View style={{ alignItems: 'center', paddingVertical: 60 }}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={{ fontSize: 12, color: C.dim, fontFamily: F.body, marginTop: 10 }}>Carregando eventos...</Text>
        </View>
      ) : (
        <View>
          {/* Navegacao mes */}
          <Glass padding={14} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <TouchableOpacity onPress={prevMonth} style={{ padding: 6 }}>
                <Ionicons name="chevron-back" size={22} color={C.accent} />
              </TouchableOpacity>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 17, fontFamily: F.display, fontWeight: '700', color: C.text }}>{MESES_LONG[month]}</Text>
                <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.mono }}>{year}</Text>
              </View>
              <TouchableOpacity onPress={nextMonth} style={{ padding: 6 }}>
                <Ionicons name="chevron-forward" size={22} color={C.accent} />
              </TouchableOpacity>
            </View>

            {/* Total do mes */}
            <View style={{ backgroundColor: 'rgba(34,197,94,0.08)', borderRadius: 10, padding: 10, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(34,197,94,0.18)' }}>
              <Text style={{ fontSize: 9, color: C.dim, fontFamily: F.mono, letterSpacing: 1 }}>TOTAL DO MES</Text>
              <Sensitive>
                <Text style={[{ fontSize: 24, color: '#22c55e', fontFamily: F.mono, fontWeight: '800' }, ps]}>{'R$ ' + fmt(totalMes)}</Text>
              </Sensitive>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
                {Object.keys(totalPorTipo).map(function(tp) {
                  if (totalPorTipo[tp] <= 0) return null;
                  return (
                    <View key={tp} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: TIPO_COLOR[tp] }} />
                      <Sensitive><Text style={[{ fontSize: 10, color: C.sub, fontFamily: F.mono }, ps]}>{TIPO_LABEL[tp] + ' R$ ' + fmtInt(totalPorTipo[tp])}</Text></Sensitive>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Header dias da semana */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              {DIAS_ABBR.map(function(d, idx) {
                return (
                  <View key={idx} style={{ width: cellWidth, alignItems: 'center' }}>
                    <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, fontWeight: '700' }}>{d}</Text>
                  </View>
                );
              })}
            </View>

            {/* Grid de dias */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
              {cells.map(function(cell, idx) {
                var isToday = cell.inMonth && cell.day === todayDate.getDate()
                  && month === todayDate.getMonth() && year === todayDate.getFullYear();
                var isSelected = cell.inMonth && cell.day === selDay;
                var dayData = cell.inMonth ? dayMap[cell.day] : null;
                return (
                  <DayCell
                    key={idx}
                    cellWidth={cellWidth}
                    day={cell.day}
                    dayData={dayData}
                    isToday={isToday}
                    isSelected={isSelected}
                    inMonth={cell.inMonth}
                    onPress={function() { setSelDay(cell.day); }}
                  />
                );
              })}
            </View>
          </Glass>

          {/* Detalhe do dia selecionado */}
          <Glass padding={14} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Ionicons name="calendar-outline" size={16} color={C.accent} />
              <Text style={{ fontSize: 13, fontFamily: F.display, color: C.text, fontWeight: '700' }}>
                {'Dia ' + selDay + ' de ' + MESES_LONG[month]}
              </Text>
              {selDayData ? (
                <View style={{ marginLeft: 'auto' }}>
                  <Sensitive><Text style={[{ fontSize: 13, color: '#22c55e', fontFamily: F.mono, fontWeight: '700' }, ps]}>{'R$ ' + fmt(selDayData.total)}</Text></Sensitive>
                </View>
              ) : null}
            </View>

            {selDayItems.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                <Ionicons name="calendar-clear-outline" size={24} color={C.dim} />
                <Text style={{ fontSize: 11, color: C.dim, fontFamily: F.body, marginTop: 6 }}>Nenhum evento neste dia</Text>
              </View>
            ) : (
              selDayItems.map(function(item, idx) {
                return (
                  <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: idx < selDayItems.length - 1 ? 1 : 0, borderBottomColor: 'rgba(255,255,255,0.04)' }}>
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: TIPO_COLOR[item.tipo] + '22', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 9, color: TIPO_COLOR[item.tipo], fontFamily: F.mono, fontWeight: '800' }}>{TIPO_LABEL[item.tipo]}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={{ fontSize: 13, color: C.text, fontFamily: F.mono, fontWeight: '700' }}>{item.ticker}</Text>
                      <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.body }}>{item.label}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Sensitive><Text style={[{ fontSize: 14, color: '#22c55e', fontFamily: F.mono, fontWeight: '700' }, ps]}>{'R$ ' + fmt(item.valor)}</Text></Sensitive>
                      <Text style={{ fontSize: 9, color: item.status === 'recebido' ? '#22c55e' : C.accent, fontFamily: F.mono }}>{item.status === 'recebido' ? '+ recebido' : '~ previsto'}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </Glass>

          {/* Legenda */}
          <Glass padding={12} style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 1, marginBottom: 8 }}>LEGENDA</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {[
                { k: 'fii', label: 'FIIs' },
                { k: 'acao', label: 'Acoes/JCP' },
                { k: 'opcao', label: 'Vencimento opcoes' },
                { k: 'rf', label: 'Renda Fixa' },
              ].map(function(l) {
                return (
                  <View key={l.k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: TIPO_COLOR[l.k] }} />
                    <Text style={{ fontSize: 11, color: C.text, fontFamily: F.body }}>{l.label}</Text>
                  </View>
                );
              })}
            </View>
          </Glass>

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
