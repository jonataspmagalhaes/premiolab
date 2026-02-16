import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle, Path } from 'react-native-svg';
import { C, F } from '../theme';

// ═══════════ SPARKLINE ═══════════
export function Sparkline(props) {
  var data = props.data || [];
  var color = props.color || C.accent;
  var height = props.height || 24;
  var width = props.width || 60;

  if (!data.length) return null;
  var min = Math.min.apply(null, data);
  var max = Math.max.apply(null, data);
  var range = max - min || 1;
  var padding = 2;

  var pointsArr = [];
  for (var i = 0; i < data.length; i++) {
    var x = padding + (i / (data.length - 1)) * (width - padding * 2);
    var y = padding + (1 - (data[i] - min) / range) * (height - padding * 2);
    pointsArr.push(x + ',' + y);
  }
  var points = pointsArr.join(' ');

  return (
    <Svg width={width} height={height}>
      <Polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ═══════════ GAUGE ═══════════
export function Gauge(props) {
  var value = props.value;
  var max = props.max;
  var label = props.label;
  var color = props.color;
  var suffix = props.suffix || '%';

  var pct = Math.min(value / max, 1);
  var radius = 20;
  var stroke = 4;
  var circumference = 2 * Math.PI * radius;

  var size = (radius + stroke) * 2;
  var center = radius + stroke;

  return (
    <View style={styles.gaugeWrap}>
      <Svg width={size} height={size} viewBox={'0 0 ' + size + ' ' + size}>
        {/* Background arc */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={C.border}
          strokeWidth={stroke}
          strokeDasharray={(circumference * 0.75) + ' ' + (circumference * 0.25)}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform={'rotate(135 ' + center + ' ' + center + ')'}
        />
        {/* Value arc */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={(circumference * 0.75 * pct) + ' ' + circumference}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform={'rotate(135 ' + center + ' ' + center + ')'}
          opacity={0.9}
        />
      </Svg>
      <View style={styles.gaugeCenter}>
        <Text style={[styles.gaugeValue, { color: color }]}>
          {typeof value === 'number' ? (value % 1 ? value.toFixed(1) : value) : value}
        </Text>
      </View>
      {label ? <Text style={styles.gaugeLabel}>{label}</Text> : null}
    </View>
  );
}

var styles = StyleSheet.create({
  gaugeWrap: {
    alignItems: 'center',
  },
  gaugeCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 4,
  },
  gaugeValue: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: F.display,
  },
  gaugeLabel: {
    fontSize: 6,
    color: C.dim,
    fontFamily: F.mono,
    marginTop: -4,
    letterSpacing: 0.3,
  },
});
