import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, SIZE, SHADOW } from '../theme';

export default function Glass(props) {
  var children = props.children;
  var style = props.style;
  var glow = props.glow;
  var padding = props.padding !== undefined ? props.padding : SIZE.padding;
  var onPress = props.onPress;

  var Wrapper = onPress ? TouchableOpacity : View;
  var wrapperProps = {};
  if (onPress) {
    wrapperProps.onPress = onPress;
    wrapperProps.activeOpacity = 0.7;
  }

  wrapperProps.style = [
    styles.card,
    glow && SHADOW.glow(glow),
    { padding: padding },
    style,
  ];

  return React.createElement(
    Wrapper,
    wrapperProps,
    glow ? React.createElement(LinearGradient, {
      colors: ['transparent', glow, 'transparent'],
      start: { x: 0, y: 0 },
      end: { x: 1, y: 0 },
      style: styles.glowLine,
    }) : null,
    children
  );
}

var styles = StyleSheet.create({
  card: {
    backgroundColor: C.cardSolid,
    borderRadius: SIZE.radius,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  glowLine: {
    position: 'absolute',
    top: -1,
    left: '12%',
    right: '12%',
    height: 1,
    opacity: 0.5,
  },
});
