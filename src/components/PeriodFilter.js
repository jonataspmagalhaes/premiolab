import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, SIZE } from '../theme';
import { Pill } from './Primitives';

var MODES = [
  { k: 'mes', l: 'Mês' },
  { k: 'ano', l: 'Ano' },
  { k: 'tudo', l: 'Tudo' },
  { k: 'custom', l: 'Personalizado' },
];

var MESES_FULL = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

var MESES_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function lastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function maskDate(text) {
  var digits = text.replace(/\D/g, '');
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return digits.substring(0, 2) + '/' + digits.substring(2);
  return digits.substring(0, 2) + '/' + digits.substring(2, 4) + '/' + digits.substring(4, 8);
}

function brToIso(br) {
  if (!br || br.length < 10) return null;
  var parts = br.split('/');
  if (parts.length !== 3) return null;
  var dd = parts[0];
  var mm = parts[1];
  var yyyy = parts[2];
  if (yyyy.length !== 4) return null;
  return yyyy + '-' + mm + '-' + dd;
}

function computeRange(mode, curMonth, curYear, naviYear, dataInicio, dataFim) {
  if (mode === 'tudo') return null;

  if (mode === 'mes') {
    var start = curYear + '-' + pad2(curMonth) + '-01';
    var endDay = lastDayOfMonth(curYear, curMonth);
    var end = curYear + '-' + pad2(curMonth) + '-' + pad2(endDay);
    return { start: start, end: end };
  }

  if (mode === 'ano') {
    return { start: naviYear + '-01-01', end: naviYear + '-12-31' };
  }

  if (mode === 'custom') {
    var isoStart = brToIso(dataInicio);
    var isoEnd = brToIso(dataFim);
    if (!isoStart || !isoEnd) return null;
    return { start: isoStart, end: isoEnd };
  }

  return null;
}

export default function PeriodFilter(props) {
  var onRangeChange = props.onRangeChange;
  var color = props.color || C.accent;
  var defaultMode = props.defaultMode || 'mes';

  var now = new Date();
  var nowMonth = now.getMonth() + 1;
  var nowYear = now.getFullYear();

  var _mode = useState(defaultMode); var mode = _mode[0]; var setMode = _mode[1];
  var _curMonth = useState(nowMonth); var curMonth = _curMonth[0]; var setCurMonth = _curMonth[1];
  var _curYear = useState(nowYear); var curYear = _curYear[0]; var setCurYear = _curYear[1];
  var _naviYear = useState(nowYear); var naviYear = _naviYear[0]; var setNaviYear = _naviYear[1];
  var _dataInicio = useState(''); var dataInicio = _dataInicio[0]; var setDataInicio = _dataInicio[1];
  var _dataFim = useState(''); var dataFim = _dataFim[0]; var setDataFim = _dataFim[1];

  var cbRef = useRef(onRangeChange);
  cbRef.current = onRangeChange;
  var lastRangeRef = useRef('__init__');

  useEffect(function() {
    var range = computeRange(mode, curMonth, curYear, naviYear, dataInicio, dataFim);
    var key = range ? range.start + '|' + range.end : 'null';
    if (key === lastRangeRef.current) return;
    lastRangeRef.current = key;
    if (cbRef.current) cbRef.current(range);
  }, [mode, curMonth, curYear, naviYear, dataInicio, dataFim]);

  var canAdvanceMonth = !(curYear === nowYear && curMonth === nowMonth);
  var canAdvanceYear = naviYear < nowYear;

  function prevMonth() {
    if (curMonth === 1) {
      setCurMonth(12);
      setCurYear(curYear - 1);
    } else {
      setCurMonth(curMonth - 1);
    }
  }

  function nextMonth() {
    if (!canAdvanceMonth) return;
    if (curMonth === 12) {
      setCurMonth(1);
      setCurYear(curYear + 1);
    } else {
      setCurMonth(curMonth + 1);
    }
  }

  function prevYear() {
    setNaviYear(naviYear - 1);
  }

  function nextYear() {
    if (!canAdvanceYear) return;
    setNaviYear(naviYear + 1);
  }

  function handleChangeInicio(text) {
    setDataInicio(maskDate(text));
  }

  function handleChangeFim(text) {
    setDataFim(maskDate(text));
  }

  var monthLabel = MESES_SHORT[curMonth - 1] + '/' + curYear;

  return (
    <View style={styles.wrapper}>
      <View style={styles.modeRow}>
        {MODES.map(function(m) {
          return (
            <Pill key={m.k} active={mode === m.k} color={color}
              onPress={function() { setMode(m.k); }}>
              {m.l}
            </Pill>
          );
        })}
      </View>

      {mode === 'mes' && (
        <View style={styles.naviRow}>
          <TouchableOpacity onPress={prevMonth} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={20} color={color} />
          </TouchableOpacity>
          <Text style={styles.naviLabel}>{monthLabel}</Text>
          <TouchableOpacity onPress={nextMonth} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            disabled={!canAdvanceMonth}>
            <Ionicons name="chevron-forward" size={20}
              color={canAdvanceMonth ? color : C.dim} />
          </TouchableOpacity>
        </View>
      )}

      {mode === 'ano' && (
        <View style={styles.naviRow}>
          <TouchableOpacity onPress={prevYear} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={20} color={color} />
          </TouchableOpacity>
          <Text style={styles.naviLabel}>{'' + naviYear}</Text>
          <TouchableOpacity onPress={nextYear} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            disabled={!canAdvanceYear}>
            <Ionicons name="chevron-forward" size={20}
              color={canAdvanceYear ? color : C.dim} />
          </TouchableOpacity>
        </View>
      )}

      {mode === 'custom' && (
        <View style={styles.customRow}>
          <View style={styles.customField}>
            <Text style={styles.customLabel}>DE</Text>
            <TextInput
              style={styles.customInput}
              placeholder="DD/MM/AAAA"
              placeholderTextColor={C.dim}
              value={dataInicio}
              onChangeText={handleChangeInicio}
              keyboardType="numeric"
              maxLength={10}
            />
          </View>
          <View style={styles.customField}>
            <Text style={styles.customLabel}>ATÉ</Text>
            <TextInput
              style={styles.customInput}
              placeholder="DD/MM/AAAA"
              placeholderTextColor={C.dim}
              value={dataFim}
              onChangeText={handleChangeFim}
              keyboardType="numeric"
              maxLength={10}
            />
          </View>
        </View>
      )}
    </View>
  );
}

var styles = StyleSheet.create({
  wrapper: { gap: 10 },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  naviRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16,
    paddingVertical: 6,
  },
  naviLabel: {
    fontSize: 15, fontWeight: '700', color: C.text, fontFamily: F.display,
    minWidth: 90, textAlign: 'center',
  },
  customRow: { flexDirection: 'row', gap: 12 },
  customField: { flex: 1 },
  customLabel: {
    fontSize: 10, color: C.dim, fontFamily: F.mono, letterSpacing: 0.6,
    marginBottom: 4,
  },
  customInput: {
    backgroundColor: C.cardSolid, borderRadius: SIZE.radiusSm,
    borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: C.text, fontFamily: F.mono,
  },
});
