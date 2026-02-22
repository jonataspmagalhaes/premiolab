// ═══════════════════════════════════════════════════════════
// FUNDAMENTAL CHART — Modal com gráfico de barras 5 anos
// ═══════════════════════════════════════════════════════════

import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { C, F } from '../theme';

function fmt(v) {
  if (v == null) return '–';
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'k';
  return v.toFixed(1);
}

export default function FundamentalChart(props) {
  var visible = props.visible;
  var onClose = props.onClose;
  var title = props.title || '';
  var ticker = props.ticker || '';
  var data = props.data || []; // [{ano, valor}]
  var suffix = props.suffix || '';
  var color = props.color || C.accent;

  if (!visible) return null;

  // Compute max absolute value for scaling
  var maxAbs = 0;
  for (var i = 0; i < data.length; i++) {
    if (data[i].valor != null && Math.abs(data[i].valor) > maxAbs) {
      maxAbs = Math.abs(data[i].valor);
    }
  }
  if (maxAbs === 0) maxAbs = 1;

  var BAR_MAX_H = 120;
  var BAR_W = 36;

  return (
    <Modal visible={visible} animationType="fade" transparent={true}
      onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose}
        style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
          justifyContent: 'center', alignItems: 'center', padding: 24,
        }}>
        <TouchableOpacity activeOpacity={1}
          style={{
            backgroundColor: '#141822', borderRadius: 14,
            padding: 18, maxWidth: 360, width: '100%',
            borderWidth: 1, borderColor: C.border || 'rgba(255,255,255,0.06)',
          }}>
          <Text style={{
            fontSize: 14, fontWeight: '700', color: C.text,
            fontFamily: F.display, marginBottom: 4,
          }}>{title}</Text>
          <Text style={{
            fontSize: 11, color: C.dim, fontFamily: F.mono, marginBottom: 16,
          }}>{ticker + ' — últimos ' + data.length + ' anos'}</Text>

          {/* Bars */}
          <View style={{
            flexDirection: 'row', justifyContent: 'space-around',
            alignItems: 'flex-end', height: BAR_MAX_H + 30, paddingBottom: 20,
          }}>
            {data.map(function(d, idx) {
              var val = d.valor != null ? d.valor : 0;
              var h = Math.max(4, (Math.abs(val) / maxAbs) * BAR_MAX_H);
              var barColor = val >= 0 ? C.green : C.red;
              return (
                <View key={idx} style={{ alignItems: 'center', flex: 1 }}>
                  <Text style={{
                    fontSize: 9, color: barColor, fontFamily: F.mono,
                    marginBottom: 2,
                  }}>{fmt(val) + suffix}</Text>
                  <View style={{
                    width: BAR_W, height: h, borderRadius: 4,
                    backgroundColor: barColor + '80',
                    borderWidth: 1, borderColor: barColor + '40',
                  }} />
                  <Text style={{
                    fontSize: 9, color: C.dim, fontFamily: F.mono,
                    marginTop: 4,
                  }}>{d.ano || ''}</Text>
                </View>
              );
            })}
          </View>

          <TouchableOpacity onPress={onClose}
            accessibilityRole="button" accessibilityLabel="Fechar"
            style={{
              marginTop: 12, alignSelf: 'flex-end',
              paddingHorizontal: 16, paddingVertical: 8,
              backgroundColor: C.accent + '18', borderRadius: 8,
              borderWidth: 1, borderColor: C.accent + '30',
            }}>
            <Text style={{ fontSize: 13, color: C.accent, fontFamily: F.body, fontWeight: '600' }}>Fechar</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
