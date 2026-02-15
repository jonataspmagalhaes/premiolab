import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle, Path } from 'react-native-svg';
import { C, F } from '../theme';

// ═══════════ SPARKLINE ═══════════
export function Sparkline({ data = [], color = C.accent, height = 24, width = 60 }) {
  if (!data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 2;

  const points = data
    .map((v, i) => {
      const x = padding + (i / (data.length - 1)) * (width - padding * 2);
      const y = padding + (1 - (v - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');

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
export function Gauge({ value, max, label, color, suffix = '%' }) {
  const pct = Math.min(value / max, 1);
  const radius = 20;
  const stroke = 4;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct * 0.75); // 270 degrees max

  // SVG arc
  const size = (radius + stroke) * 2;
  const center = radius + stroke;

  return (
    <View style={styles.gaugeWrap}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background arc */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={C.border}
          strokeWidth={stroke}
          strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform={`rotate(135 ${center} ${center})`}
        />
        {/* Value arc */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${circumference * 0.75 * pct} ${circumference}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          transform={`rotate(135 ${center} ${center})`}
          opacity={0.9}
        />
      </Svg>
      <View style={styles.gaugeCenter}>
        <Text style={[styles.gaugeValue, { color }]}>
          {typeof value === 'number' ? (value % 1 ? value.toFixed(1) : value) : value}
        </Text>
      </View>
      {label ? <Text style={styles.gaugeLabel}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
