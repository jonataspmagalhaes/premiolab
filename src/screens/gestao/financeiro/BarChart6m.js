// ═══════════════════════════════════════════════════════════
// BarChart6m — Gráfico de barras Entradas vs Saídas (6 meses)
// ═══════════════════════════════════════════════════════════

import React, { useState } from 'react';
import { View, Text } from 'react-native';
import Svg, { Rect, Line as SvgLine, Text as SvgText } from 'react-native-svg';
import { C, F } from '../../../theme';
import { usePrivacyStyle } from '../../../components/Sensitive';
import Sensitive from '../../../components/Sensitive';
var helpers = require('./helpers');
var fmt = helpers.fmt;

export default function BarChart6m(props) {
  var data = props.data || [];
  var selected = props.selected;
  var onSelect = props.onSelect;
  var _w = useState(0); var w = _w[0]; var setW = _w[1];
  var chartH = 120;
  var barPad = 4;
  var ps = usePrivacyStyle();

  if (w === 0 || data.length === 0) {
    return React.createElement(View, {
      onLayout: function(e) { setW(e.nativeEvent.layout.width); },
      style: { height: chartH + 30 },
    });
  }

  var maxVal = 0;
  for (var i = 0; i < data.length; i++) {
    if (data[i].entradas > maxVal) maxVal = data[i].entradas;
    if (data[i].saidas > maxVal) maxVal = data[i].saidas;
  }
  if (maxVal === 0) maxVal = 1;

  var groupW = w / data.length;
  var barW = (groupW - barPad * 3) / 2;

  function handleTouch(e) {
    if (!onSelect) return;
    var x = e.nativeEvent.locationX;
    var idx = Math.floor(x / groupW);
    if (idx >= 0 && idx < data.length) {
      onSelect(idx === selected ? null : idx);
    }
  }

  return (
    <View onLayout={function(e) { setW(e.nativeEvent.layout.width); }}>
      {selected != null && data[selected] ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 6, borderRadius: 8, backgroundColor: C.cardSolid, borderWidth: 1, borderColor: C.border, alignSelf: 'center' }}>
          <Text style={{ fontSize: 10, color: C.text, fontFamily: F.mono, fontWeight: '700' }}>
            {data[selected].label}
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Text style={[{ fontSize: 10, color: C.green, fontFamily: F.mono }, ps]}>
              +R$ {fmt(data[selected].entradas)}
            </Text>
            <Text style={[{ fontSize: 10, color: C.red, fontFamily: F.mono }, ps]}>
              -R$ {fmt(data[selected].saidas)}
            </Text>
          </View>
        </View>
      ) : null}
      <Sensitive>
        <View onTouchEnd={handleTouch}>
          <Svg width={w} height={chartH + 30}>
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
              var isSelected = selected === i;
              var barOpacity = selected != null ? (isSelected ? 1.0 : 0.3) : 0.8;
              return React.createElement(React.Fragment, { key: i },
                React.createElement(Rect, {
                  x: x, y: chartH - hE, width: barW, height: Math.max(hE, 1),
                  rx: 3, fill: C.green, opacity: barOpacity,
                }),
                isSelected ? React.createElement(Rect, {
                  x: x - 1, y: chartH - hE - 1, width: barW + 2, height: Math.max(hE, 1) + 2,
                  rx: 4, fill: 'none', stroke: C.green, strokeWidth: 1, opacity: 0.6,
                }) : null,
                React.createElement(Rect, {
                  x: x + barW + barPad, y: chartH - hS, width: barW, height: Math.max(hS, 1),
                  rx: 3, fill: C.red, opacity: barOpacity,
                }),
                isSelected ? React.createElement(Rect, {
                  x: x + barW + barPad - 1, y: chartH - hS - 1, width: barW + 2, height: Math.max(hS, 1) + 2,
                  rx: 4, fill: 'none', stroke: C.red, strokeWidth: 1, opacity: 0.6,
                }) : null,
                React.createElement(SvgText, {
                  x: x + groupW / 2 - barPad, y: chartH + 16,
                  fontSize: 9, fill: isSelected ? C.text : C.dim, textAnchor: 'middle',
                  fontFamily: F.mono, fontWeight: isSelected ? '700' : '400',
                }, d.label)
              );
            })}
          </Svg>
        </View>
      </Sensitive>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: C.green }} />
          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>Entradas</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: C.red }} />
          <Text style={{ fontSize: 10, color: C.dim, fontFamily: F.mono }}>Saídas</Text>
        </View>
      </View>
    </View>
  );
}
