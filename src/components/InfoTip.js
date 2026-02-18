import React, { useState } from 'react';
import { View, Text, TouchableOpacity, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F } from '../theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function InfoTip(props) {
  var text = props.text || '';
  var size = props.size || 14;
  var color = props.color || C.accent;
  var style = props.style;

  var _open = useState(false);
  var open = _open[0];
  var setOpen = _open[1];

  var toggle = function() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen(!open);
  };

  return (
    <View style={[{ flexDirection: 'row', alignItems: 'flex-start', flexShrink: 1 }, style]}>
      <TouchableOpacity onPress={toggle} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="information-circle-outline" size={size} color={color} />
      </TouchableOpacity>
      {open ? (
        <Text style={{
          fontSize: 10, color: C.sub || 'rgba(255,255,255,0.4)',
          fontFamily: F.body, lineHeight: 14,
          marginLeft: 4, flexShrink: 1,
        }}>{text}</Text>
      ) : null}
    </View>
  );
}
