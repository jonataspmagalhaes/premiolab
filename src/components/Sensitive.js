// ═══════════════════════════════════════════════════════════
// Sensitive — Modo privacidade: blur premium em valores
// usePrivacyStyle() para Text — textShadow blur (iOS+Android)
// <Sensitive> para gráficos/charts — BlurView nativo
// ═══════════════════════════════════════════════════════════

import React from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { usePrivacy } from '../contexts/PrivacyContext';

var BLUR_STYLE = {
  color: 'transparent',
  textShadowColor: Platform.OS === 'ios'
    ? 'rgba(160, 160, 190, 0.8)'
    : 'rgba(140, 140, 170, 0.9)',
  textShadowOffset: { width: 0, height: 0 },
  textShadowRadius: Platform.OS === 'ios' ? 12 : 16,
};

export function usePrivacyStyle() {
  var priv = usePrivacy();
  if (priv.isPrivate) return BLUR_STYLE;
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
      <BlurView
        tint="dark"
        intensity={Platform.OS === 'ios' ? 60 : 90}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
