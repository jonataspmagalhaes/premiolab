import React from 'react';
import { View, Text, Image } from 'react-native';
import { C, F } from '../theme';

function Logo(props) {
  var size = props.size || 40;
  var br = Math.round(size * 0.28);

  return (
    <Image
      source={require('../../assets/logo.png')}
      style={{ width: size, height: size, borderRadius: br }}
      resizeMode="cover"
    />
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
