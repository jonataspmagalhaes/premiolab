import React from 'react';
import { View, Text } from 'react-native';
import Svg, {
  Rect, Circle, Line, Text as SvgText,
  Defs, LinearGradient, RadialGradient, Stop,
} from 'react-native-svg';
import { C, F } from '../theme';

function Logo(props) {
  var size = props.size || 40;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="v1g" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#6366f1" />
          <Stop offset="50%" stopColor="#60a5fa" />
          <Stop offset="100%" stopColor="#06b6d4" />
        </LinearGradient>
        <RadialGradient id="glow1" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#4ade80" stopOpacity="0.25" />
          <Stop offset="100%" stopColor="#4ade80" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="glow2" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#a78bfa" stopOpacity="0.25" />
          <Stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="glow3" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#fbbf24" stopOpacity="0.25" />
          <Stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      {/* Background rounded rect */}
      <Rect x="6" y="6" width="88" height="88" rx="24"
        fill="url(#v1g)" opacity="0.08" />
      <Rect x="6" y="6" width="88" height="88" rx="24"
        fill="none" stroke="url(#v1g)" strokeWidth="1.5" opacity="0.35" />
      {/* PL text */}
      <SvgText x="12" y="70" fontFamily={F.display} fontWeight="800"
        fontSize="48" fill="url(#v1g)">
        PL
      </SvgText>
      {/* Connection lines */}
      <Line x1="76" y1="22" x2="86" y2="38"
        stroke="#4ade80" strokeWidth="1.4" opacity="0.5" />
      <Line x1="76" y1="22" x2="72" y2="40"
        stroke="#a78bfa" strokeWidth="1.4" opacity="0.5" />
      <Line x1="86" y1="38" x2="72" y2="40"
        stroke="#fbbf24" strokeWidth="1.4" opacity="0.5" />
      {/* Molecule glows (radial) */}
      <Circle cx="76" cy="22" r="12" fill="url(#glow1)" />
      <Circle cx="86" cy="38" r="10" fill="url(#glow2)" />
      <Circle cx="72" cy="40" r="9.5" fill="url(#glow3)" />
      {/* Molecules */}
      <Circle cx="76" cy="22" r="6" fill="#4ade80" />
      <Circle cx="86" cy="38" r="5" fill="#a78bfa" />
      <Circle cx="72" cy="40" r="4.5" fill="#fbbf24" />
      {/* Specular highlights */}
      <Circle cx="74" cy="20" r="2" fill="#ffffff" opacity="0.35" />
      <Circle cx="84.5" cy="36.5" r="1.6" fill="#ffffff" opacity="0.3" />
      <Circle cx="70.5" cy="38.5" r="1.5" fill="#ffffff" opacity="0.3" />
    </Svg>
  );
}

function Wordmark(props) {
  var fontSize = props.fontSize || 20;

  return (
    <Text style={{
      fontSize: fontSize,
      fontWeight: '800',
      color: '#60a5fa',
      fontFamily: F.display,
    }}>
      Premio
      <Text style={{ color: '#06b6d4' }}>Lab</Text>
    </Text>
  );
}

export { Logo, Wordmark };
