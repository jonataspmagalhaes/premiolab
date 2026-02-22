import React, { useRef } from 'react';
import { Animated, TouchableWithoutFeedback } from 'react-native';
import { shouldAnimate } from '../utils/a11y';

export default function PressableCard(props) {
  var onPress = props.onPress;
  var style = props.style;
  var children = props.children;
  var accessibilityLabel = props.accessibilityLabel;
  var accessibilityHint = props.accessibilityHint;

  var scale = useRef(new Animated.Value(1)).current;

  function handlePressIn() {
    if (!shouldAnimate()) return;
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  }

  function handlePressOut() {
    if (!shouldAnimate()) return;
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 40,
      bounciness: 6,
    }).start();
  }

  return (
    <TouchableWithoutFeedback
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
    >
      <Animated.View style={[style, { transform: [{ scale: scale }] }]}>
        {children}
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}
