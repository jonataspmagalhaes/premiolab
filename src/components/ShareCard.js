// ═══════════════════════════════════════════════════════════
// ShareCard — Card bonito para compartilhar performance
// Renderizado offscreen via ViewShot, exportado como PNG
// ═══════════════════════════════════════════════════════════

import React from 'react';
var useState = React.useState;
var useRef = React.useRef;
import { View, Text, TouchableOpacity, Modal, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
var ViewShot = null;
try { ViewShot = require('react-native-view-shot').default; } catch (e) { /* nao instalado no build nativo */ }
var Sharing = require('expo-sharing');
var FileSystem = require('expo-file-system');
import { C, F, SIZE } from '../theme';

function fmt(v) {
  return (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ShareCard(props) {
  var visible = props.visible;
  var onClose = props.onClose;
  var patrimonio = props.patrimonio || 0;
  var rendaMes = props.rendaMes || 0;
  var metaPct = props.metaPct || 0;
  var varMes = props.varMes || 0;
  var dividendosMes = props.dividendosMes || 0;
  var premiosMes = props.premiosMes || 0;

  var _sharing = useState(false); var sharing = _sharing[0]; var setSharing = _sharing[1];
  var _hideValues = useState(false); var hideValues = _hideValues[0]; var setHideValues = _hideValues[1];
  var viewShotRef = useRef(null);

  function handleShare() {
    if (!ViewShot || !viewShotRef.current) {
      Alert.alert('Indisponivel', 'Compartilhamento requer atualização do app.');
      return;
    }
    setSharing(true);
    viewShotRef.current.capture().then(function(uri) {
      // Copiar para diretorio acessivel
      var destPath = FileSystem.cacheDirectory + 'premiolab-share.png';
      return FileSystem.copyAsync({ from: uri, to: destPath }).then(function() {
        return Sharing.shareAsync(destPath, {
          mimeType: 'image/png',
          dialogTitle: 'Compartilhar performance',
        });
      });
    }).then(function() {
      setSharing(false);
    }).catch(function(err) {
      console.warn('Share error:', err);
      setSharing(false);
    });
  }

  var masked = '••••••';

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Preview — wrappear com ViewShot se disponivel */}
          {(function() {
            var cardContent = (
              <LinearGradient
                colors={['#0c0f1a', '#151a2e', '#0c0f1a']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.card}
              >
                <View style={styles.cardHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: C.accent + '30', justifyContent: 'center', alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: C.accent, fontFamily: F.display }}>P</Text>
                    </View>
                    <Text style={styles.cardTitle}>PremioLab</Text>
                  </View>
                  <Text style={styles.cardDate}>{new Date().toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}</Text>
                </View>

                <Text style={styles.cardLabel}>Patrimonio</Text>
                <Text style={styles.cardValue}>{hideValues ? masked : ('R$ ' + fmt(patrimonio))}</Text>

                {varMes !== 0 ? (
                  <View style={[styles.varBadge, { backgroundColor: (varMes >= 0 ? '#22c55e' : '#ef4444') + '20' }]}>
                    <Ionicons name={varMes >= 0 ? 'trending-up' : 'trending-down'} size={14} color={varMes >= 0 ? '#22c55e' : '#ef4444'} />
                    <Text style={{ fontSize: 13, fontFamily: F.mono, fontWeight: '700', color: varMes >= 0 ? '#22c55e' : '#ef4444' }}>
                      {(varMes >= 0 ? '+' : '') + varMes.toFixed(1) + '% no mes'}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.cardDivider} />
                <View style={styles.cardRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardSmallLabel}>Renda do mes</Text>
                    <Text style={styles.cardSmallValue}>{hideValues ? masked : ('R$ ' + fmt(rendaMes))}</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={styles.cardSmallLabel}>Meta mensal</Text>
                    <Text style={[styles.cardSmallValue, { color: metaPct >= 100 ? '#22c55e' : C.accent }]}>{metaPct.toFixed(0) + '%'}</Text>
                  </View>
                </View>

                {(dividendosMes > 0 || premiosMes > 0) ? (
                  <View style={styles.cardRow}>
                    {dividendosMes > 0 ? (
                      <View style={styles.breakdownItem}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.green, marginRight: 6 }} />
                        <Text style={styles.breakdownLabel}>Dividendos</Text>
                        <Text style={styles.breakdownVal}>{hideValues ? '••••' : fmt(dividendosMes)}</Text>
                      </View>
                    ) : null}
                    {premiosMes > 0 ? (
                      <View style={styles.breakdownItem}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.opcoes, marginRight: 6 }} />
                        <Text style={styles.breakdownLabel}>Premios</Text>
                        <Text style={styles.breakdownVal}>{hideValues ? '••••' : fmt(premiosMes)}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                <View style={styles.watermark}>
                  <Text style={styles.watermarkText}>premiolab.com.br</Text>
                </View>
              </LinearGradient>
            );

            if (ViewShot) {
              return React.createElement(ViewShot, { ref: viewShotRef, options: { format: 'png', quality: 1, result: 'tmpfile' } }, cardContent);
            }
            return cardContent;
          })()}

          {/* Controls */}
          <View style={styles.controls}>
            <TouchableOpacity onPress={function() { setHideValues(!hideValues); }} style={styles.toggleBtn}>
              <Ionicons name={hideValues ? 'eye-off-outline' : 'eye-outline'} size={18} color={C.text} />
              <Text style={styles.toggleText}>{hideValues ? 'Mostrar valores' : 'Esconder valores'}</Text>
            </TouchableOpacity>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Fechar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleShare} disabled={sharing} style={[styles.shareBtn, sharing && { opacity: 0.5 }]}>
              {sharing ? (
                <ActivityIndicator size="small" color={C.text} />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="share-outline" size={18} color={C.text} />
                  <Text style={styles.shareText}>Compartilhar</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

var styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  container: { width: '100%', maxWidth: 380 },
  card: { borderRadius: 20, padding: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  cardTitle: { fontSize: 16, fontFamily: F.display, color: C.text, fontWeight: '800' },
  cardDate: { fontSize: 12, fontFamily: F.mono, color: 'rgba(255,255,255,0.4)' },
  cardLabel: { fontSize: 11, fontFamily: F.mono, color: 'rgba(255,255,255,0.4)', letterSpacing: 1, marginBottom: 4 },
  cardValue: { fontSize: 32, fontFamily: F.mono, color: C.text, fontWeight: '800', marginBottom: 8 },
  varBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  cardDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 16 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  cardSmallLabel: { fontSize: 10, fontFamily: F.mono, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.5, marginBottom: 4 },
  cardSmallValue: { fontSize: 18, fontFamily: F.mono, color: C.text, fontWeight: '700' },
  breakdownItem: { flexDirection: 'row', alignItems: 'center' },
  breakdownLabel: { fontSize: 11, fontFamily: F.body, color: 'rgba(255,255,255,0.5)', marginRight: 6 },
  breakdownVal: { fontSize: 11, fontFamily: F.mono, color: C.text },
  watermark: { alignItems: 'center', marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.04)' },
  watermarkText: { fontSize: 11, fontFamily: F.mono, color: 'rgba(255,255,255,0.2)', letterSpacing: 1 },
  controls: { flexDirection: 'row', justifyContent: 'center', marginTop: 16, marginBottom: 12 },
  toggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)' },
  toggleText: { fontSize: 13, fontFamily: F.body, color: C.text },
  actions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  cancelText: { fontSize: 14, fontFamily: F.body, color: 'rgba(255,255,255,0.5)' },
  shareBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: C.accent },
  shareText: { fontSize: 14, fontFamily: F.display, color: C.text, fontWeight: '700' },
});
