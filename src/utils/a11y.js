import { AccessibilityInfo, LayoutAnimation, Platform, UIManager } from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

var _reduceMotion = false;

AccessibilityInfo.isReduceMotionEnabled().then(function(enabled) {
  _reduceMotion = enabled;
});

AccessibilityInfo.addEventListener('reduceMotionChanged', function(enabled) {
  _reduceMotion = enabled;
});

export function shouldAnimate() {
  return !_reduceMotion;
}

export function animateLayout() {
  if (!_reduceMotion) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }
}
