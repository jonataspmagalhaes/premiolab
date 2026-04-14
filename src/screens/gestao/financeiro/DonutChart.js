// ═══════════════════════════════════════════════════════════
// DonutChart + ProgressBar — Componentes visuais de Finanças
// ═══════════════════════════════════════════════════════════

import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { C } from '../../../theme';

export function DonutChart(props) {
  var segments = props.segments || [];
  var s = props.size || 140;
  var selected = props.selected != null ? props.selected : -1;
  var onSelect = props.onSelect;
  var strokeW = 12;
  var r = (s / 2) - strokeW;
  var circ = 2 * Math.PI * r;
  var offset = 0;

  function handleTouch(e) {
    if (!onSelect || segments.length === 0) return;
    var tx = e.nativeEvent.locationX - s / 2;
    var ty = e.nativeEvent.locationY - s / 2;
    var dist = Math.sqrt(tx * tx + ty * ty);
    if (dist < r - strokeW * 1.5 || dist > r + strokeW * 1.5) { onSelect(-1); return; }
    var angle = Math.atan2(ty, tx) * 180 / Math.PI;
    var adjusted = (angle + 90 + 360) % 360;
    var cum = 0;
    for (var i = 0; i < segments.length; i++) {
      cum += segments[i].pct * 3.6;
      if (adjusted < cum) { onSelect(i === selected ? -1 : i); return; }
    }
    onSelect(-1);
  }

  return (
    <View onStartShouldSetResponder={function() { return !!onSelect; }} onResponderRelease={handleTouch}>
      <Svg width={s} height={s} viewBox={'0 0 ' + s + ' ' + s}>
        <Circle cx={s / 2} cy={s / 2} r={r} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth={strokeW} />
        {segments.map(function(seg, i) {
          var dash = (seg.pct / 100) * circ;
          var gap = circ - dash;
          var o = offset;
          offset += dash;
          var isSel = i === selected;
          var segOpacity = selected === -1 ? 1 : (isSel ? 1 : 0.3);
          var segStrokeW = isSel ? strokeW + 3 : strokeW;
          return (
            <Circle key={i} cx={s / 2} cy={s / 2} r={r} fill="none"
              stroke={seg.color} strokeWidth={segStrokeW}
              strokeDasharray={dash + ' ' + gap} strokeDashoffset={-o}
              strokeLinecap="round" opacity={segOpacity}
              rotation={-90} origin={s / 2 + ',' + s / 2} />
          );
        })}
      </Svg>
    </View>
  );
}

export function ProgressBar(props) {
  var pct = props.pct || 0;
  var color = pct > 90 ? C.red : (pct > 75 ? C.yellow : C.green);
  var clampedPct = Math.min(pct, 100);
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.06)', flex: 1 }}>
      <View style={{ width: clampedPct + '%', height: 6, borderRadius: 3, backgroundColor: color + '80' }} />
    </View>
  );
}
