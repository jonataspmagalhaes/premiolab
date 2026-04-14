import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { C, F } from '../theme';
import Glass from './Glass';
var subFeatures = require('../constants/subscriptionFeatures');

export default function UpgradePrompt(props) {
  var feature = props.feature;
  var compact = props.compact || false;
  var navigation = props.navigation;
  var message = props.message;

  var requiredTier = subFeatures.getRequiredTier(feature);
  var tierLabel = subFeatures.TIER_LABELS[requiredTier] || 'PRO';
  var tierColor = subFeatures.TIER_COLORS[requiredTier] || subFeatures.TIER_COLORS.pro;
  var featureLabel = subFeatures.FEATURE_LABELS[feature] || '';

  function handlePress() {
    if (navigation) {
      navigation.navigate('Paywall');
    }
  }

  if (compact) {
    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        style={styles.compactWrap}
        accessibilityLabel={'Upgrade para ' + tierLabel}
        accessibilityRole="button"
      >
        <Ionicons name="lock-closed" size={14} color={tierColor} />
        <View style={[styles.compactBadge, { backgroundColor: tierColor + '22' }]}>
          <Text style={[styles.compactBadgeText, { color: tierColor }]}>{tierLabel}</Text>
        </View>
        <Text style={styles.compactText}>Upgrade</Text>
        <Ionicons name="chevron-forward" size={14} color={C.dim} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.blockWrap}>
      <Glass glow={tierColor} padding={24}>
        <View style={styles.blockContent}>
          <View style={[styles.lockCircle, { backgroundColor: tierColor + '18' }]}>
            <Ionicons name="lock-closed" size={32} color={tierColor} />
          </View>
          <Text style={styles.blockTitle}>
            {message || ('Disponível no plano ' + tierLabel)}
          </Text>
          {featureLabel ? (
            <Text style={styles.blockDesc}>{featureLabel}</Text>
          ) : null}
          <TouchableOpacity
            onPress={handlePress}
            activeOpacity={0.8}
            style={styles.blockBtn}
            accessibilityLabel="Ver planos"
            accessibilityRole="button"
          >
            <LinearGradient
              colors={[tierColor, tierColor + 'CC']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.blockGradient}
            >
              <Text style={styles.blockBtnText}>Ver planos</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </Glass>
    </View>
  );
}

var styles = StyleSheet.create({
  // Compact mode
  compactWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.cardSolid,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  compactBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  compactBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: F.display,
  },
  compactText: {
    flex: 1,
    fontSize: 12,
    color: C.sub,
    fontFamily: F.body,
  },
  // Block mode
  blockWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  blockContent: {
    alignItems: 'center',
  },
  lockCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  blockTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.text,
    fontFamily: F.display,
    textAlign: 'center',
    marginBottom: 8,
  },
  blockDesc: {
    fontSize: 13,
    color: C.sub,
    fontFamily: F.body,
    textAlign: 'center',
    marginBottom: 20,
  },
  blockBtn: {
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
  },
  blockGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  blockBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: 'white',
    fontFamily: F.display,
  },
});
