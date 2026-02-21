import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F } from '../theme';

export default function InfoTip(props) {
  var text = props.text || '';
  var title = props.title || '';
  var size = props.size || 14;
  var color = props.color || C.accent;
  var style = props.style;

  var _open = useState(false);
  var open = _open[0];
  var setOpen = _open[1];

  return (
    <View style={[{ flexShrink: 1 }, style]}>
      <TouchableOpacity onPress={function() { setOpen(true); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button" accessibilityLabel="Mais informações">
        <Ionicons name="information-circle-outline" size={size} color={color} />
      </TouchableOpacity>
      <Modal visible={open} animationType="fade" transparent={true}
        onRequestClose={function() { setOpen(false); }}>
        <TouchableOpacity activeOpacity={1} onPress={function() { setOpen(false); }}
          style={{
            flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
            justifyContent: 'center', alignItems: 'center', padding: 30,
          }}>
          <TouchableOpacity activeOpacity={1}
            style={{
              backgroundColor: C.card || '#141822', borderRadius: 14,
              padding: 20, maxWidth: 340, width: '100%',
              borderWidth: 1, borderColor: C.border || 'rgba(255,255,255,0.06)',
            }}>
            {title ? (
              <Text style={{
                fontSize: 14, fontWeight: '700', color: C.text,
                fontFamily: F.display, marginBottom: 10,
              }}>{title}</Text>
            ) : null}
            <Text style={{
              fontSize: 13, color: C.sub || 'rgba(255,255,255,0.5)',
              fontFamily: F.body, lineHeight: 20,
            }}>{text}</Text>
            <TouchableOpacity onPress={function() { setOpen(false); }}
              accessibilityRole="button" accessibilityLabel="Fechar"
              style={{
                marginTop: 16, alignSelf: 'flex-end',
                paddingHorizontal: 16, paddingVertical: 8,
                backgroundColor: C.accent + '18', borderRadius: 8,
                borderWidth: 1, borderColor: C.accent + '30',
              }}>
              <Text style={{ fontSize: 13, color: C.accent, fontFamily: F.body, fontWeight: '600' }}>Entendi</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
