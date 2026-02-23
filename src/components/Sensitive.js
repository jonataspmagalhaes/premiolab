// ═══════════════════════════════════════════════════════════
// Sensitive — Modo privacidade: blur em valores financeiros
// usePrivacyStyle() para Text, <Sensitive> para gráficos SVG
// ═══════════════════════════════════════════════════════════

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { usePrivacy } from '../contexts/PrivacyContext';

var BLUR_TEXT_STYLE = {
  color: 'transparent',
  textShadowColor: 'rgba(255,255,255,0.5)',
  textShadowOffset: { width: 0, height: 0 },
  textShadowRadius: 10,
};

export function usePrivacyStyle() {
  var priv = usePrivacy();
  if (priv.isPrivate) return BLUR_TEXT_STYLE;
  return null;
}

export default function Sensitive(props) {
  var children = props.children;
  var style = props.style;
  var priv = usePrivacy();

  if (!priv.isPrivate) return children;

  return (
    <View style={[{ position: 'relative', borderRadius: 14, overflow: 'hidden' }, style]}>
      {children}
      <BlurView tint="dark" intensity={80} style={StyleSheet.absoluteFill} />
    </View>
  );
}
