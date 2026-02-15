import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, SIZE, SHADOW } from '../theme';

export default function Glass({
  children,
  style,
  glow,
  padding = SIZE.padding,
  onPress,
}) {
  const Wrapper = onPress ? TouchableOpacity : View;
  const wrapperProps = onPress
    ? { onPress, activeOpacity: 0.7 }
    : {};

  return (
    <Wrapper
      {...wrapperProps}
      style={[
        styles.card,
        glow && SHADOW.glow(glow),
        { padding },
        style,
      ]}
    >
      {glow && (
        <LinearGradient
          colors={['transparent', glow, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.glowLine}
        />
      )}
      {children}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
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
