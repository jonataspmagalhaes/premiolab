import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, TouchableOpacity } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { C, F, SIZE } from '../theme';

// ═══════════ SKELETON BAR ═══════════
export function Skeleton(props) {
  var width = props.width || '100%';
  var height = props.height || 14;
  var radius = props.radius || 6;
  var style = props.style;

  var opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(function() {
    var anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.08, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return function() { anim.stop(); };
  }, []);

  return (
    <Animated.View
      style={[
        {
          width: width,
          height: height,
          borderRadius: radius,
          backgroundColor: 'rgba(255,255,255,0.1)',
          opacity: opacity,
        },
        style,
      ]}
    />
  );
}

// ═══════════ SKELETON CARD ═══════════
export function SkeletonCard(props) {
  var height = props.height || 80;
  return (
    <View style={[styles.skelCard, { height: height }]}>
      <Skeleton width="40%" height={10} />
      <View style={{ height: 8 }} />
      <Skeleton width="70%" height={16} />
      <View style={{ height: 6 }} />
      <Skeleton width="55%" height={10} />
    </View>
  );
}

// ═══════════ SKELETON ROW ═══════════
export function SkeletonRow() {
  return (
    <View style={styles.skelRow}>
      <View style={{ flex: 1 }}>
        <Skeleton width="60%" height={12} />
        <View style={{ height: 4 }} />
        <Skeleton width="40%" height={8} />
      </View>
      <Skeleton width={50} height={14} />
    </View>
  );
}

// ═══════════ LOADING SCREEN ═══════════
export function LoadingScreen() {
  return (
    <View style={styles.loadingWrap}>
      {/* Hero patrimônio card */}
      <View style={[styles.skelCard, { height: 140 }]}>
        <Skeleton width="50%" height={10} />
        <View style={{ height: 10 }} />
        <Skeleton width="65%" height={28} />
        <View style={{ height: 10 }} />
        <Skeleton width="100%" height={6} radius={3} />
        <View style={{ height: 10 }} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Skeleton width={50} height={10} />
          <Skeleton width={50} height={10} />
          <Skeleton width={50} height={10} />
          <Skeleton width={50} height={10} />
        </View>
      </View>

      {/* KPI bar (3 compact cards) */}
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[1, 2, 3].map(function(i) {
          return (
            <View key={i} style={[styles.loadingMiniCard, { padding: 10 }]}>
              <Skeleton width="60%" height={8} />
              <View style={{ height: 6 }} />
              <Skeleton width="45%" height={16} />
            </View>
          );
        })}
      </View>

      {/* Donuts row */}
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[1, 2].map(function(i) {
          return (
            <View key={i} style={[styles.loadingMiniCard, { flex: 1, height: 110, alignItems: 'center', justifyContent: 'center' }]}>
              <Skeleton width={60} height={60} radius={30} />
              <View style={{ height: 8 }} />
              <Skeleton width="50%" height={8} />
            </View>
          );
        })}
      </View>

      {/* Alert skeleton */}
      <SkeletonCard height={60} />

      {/* Chart skeleton */}
      <SkeletonCard height={160} />
    </View>
  );
}

// ═══════════ SKELETON CARTEIRA ═══════════
export function SkeletonCarteira() {
  return (
    <View style={styles.loadingWrap}>
      {/* Donut + stats */}
      <View style={[styles.skelCard, { height: 160, alignItems: 'center', justifyContent: 'center' }]}>
        <Skeleton width={120} height={120} radius={60} />
        <View style={{ height: 10 }} />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Skeleton width={60} height={10} />
          <Skeleton width={60} height={10} />
        </View>
      </View>
      {/* Stat rows */}
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <View style={[styles.loadingMiniCard, { flex: 1 }]}>
          <Skeleton width="50%" height={8} />
          <View style={{ height: 4 }} />
          <Skeleton width="70%" height={14} />
        </View>
        <View style={[styles.loadingMiniCard, { flex: 1 }]}>
          <Skeleton width="50%" height={8} />
          <View style={{ height: 4 }} />
          <Skeleton width="70%" height={14} />
        </View>
      </View>
      {/* Position cards */}
      <SkeletonCard height={80} />
      <SkeletonCard height={80} />
      <SkeletonCard height={80} />
    </View>
  );
}

// ═══════════ SKELETON OPCOES ═══════════
export function SkeletonOpcoes() {
  return (
    <View style={styles.loadingWrap}>
      {/* Summary bar */}
      <View style={[styles.skelCard, { height: 50 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          <Skeleton width={60} height={14} />
          <Skeleton width={60} height={14} />
          <Skeleton width={60} height={14} />
        </View>
      </View>
      {/* Op cards */}
      <SkeletonCard height={100} />
      <SkeletonCard height={100} />
      <SkeletonCard height={100} />
    </View>
  );
}

// ═══════════ SKELETON CAIXA ═══════════
export function SkeletonCaixa() {
  return (
    <View style={styles.loadingWrap}>
      {/* Hero saldo */}
      <View style={[styles.skelCard, { height: 120 }]}>
        <Skeleton width="40%" height={10} />
        <View style={{ height: 10 }} />
        <Skeleton width="60%" height={28} />
        <View style={{ height: 12 }} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Skeleton width={80} height={24} radius={12} />
          <Skeleton width={80} height={24} radius={12} />
          <Skeleton width={80} height={24} radius={12} />
        </View>
      </View>
      {/* Account cards */}
      <SkeletonCard height={60} />
      <SkeletonCard height={60} />
      <SkeletonCard height={60} />
      {/* Chart area */}
      <SkeletonCard height={140} />
    </View>
  );
}

// ═══════════ SKELETON PROVENTOS ═══════════
export function SkeletonProventos() {
  return (
    <View style={styles.loadingWrap}>
      {/* Header */}
      <View style={[styles.skelCard, { height: 50 }]}>
        <Skeleton width="50%" height={10} />
        <View style={{ height: 8 }} />
        <Skeleton width="30%" height={16} />
      </View>
      {/* Filter pills */}
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Skeleton width={70} height={28} radius={14} />
        <Skeleton width={70} height={28} radius={14} />
        <Skeleton width={70} height={28} radius={14} />
        <Skeleton width={70} height={28} radius={14} />
      </View>
      {/* Provento rows */}
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />
    </View>
  );
}

// ═══════════ SKELETON RENDA FIXA ═══════════
export function SkeletonRendaFixa() {
  return (
    <View style={styles.loadingWrap}>
      {/* Header */}
      <View style={[styles.skelCard, { height: 50 }]}>
        <Skeleton width="45%" height={10} />
        <View style={{ height: 8 }} />
        <Skeleton width="35%" height={16} />
      </View>
      {/* RF cards */}
      <SkeletonCard height={70} />
      <SkeletonCard height={70} />
      <SkeletonCard height={70} />
    </View>
  );
}

// ═══════════ EMPTY STATE ═══════════
export function EmptyState(props) {
  var icon = props.icon;
  var ionicon = props.ionicon;
  var title = props.title;
  var description = props.description;
  var cta = props.cta;
  var onCta = props.onCta;
  var color = props.color || C.accent;

  return (
    <View style={styles.emptyWrap}>
      <View style={[styles.emptyIcon, { backgroundColor: color + '08', borderColor: color + '15' }]}>
        {ionicon ? (
          <Ionicons name={ionicon} size={28} color={color} />
        ) : (
          <Text style={[styles.emptyIconText, { color: color }]}>{icon || '◫'}</Text>
        )}
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {description && <Text style={styles.emptyDesc}>{description}</Text>}
      {cta && onCta && (
        <TouchableOpacity
          onPress={onCta}
          activeOpacity={0.8}
          style={[styles.emptyCta, { backgroundColor: color }]}
        >
          <Text style={styles.emptyCtaText}>{cta}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

var styles = StyleSheet.create({
  // Skeleton
  skelCard: {
    backgroundColor: C.cardSolid,
    borderRadius: SIZE.radius,
    borderWidth: 1,
    borderColor: C.border,
    padding: SIZE.padding,
    justifyContent: 'center',
    marginBottom: SIZE.gap,
  },
  skelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.cardSolid,
    borderRadius: SIZE.radiusSm,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    marginBottom: SIZE.gap,
  },
  loadingWrap: {
    flex: 1,
    gap: SIZE.gap,
  },
  loadingRow: {
    flexDirection: 'row',
    gap: 6,
  },
  loadingMiniCard: {
    flex: 1,
    backgroundColor: C.cardSolid,
    borderRadius: SIZE.radiusSm,
    borderWidth: 1,
    borderColor: C.border,
    padding: 10,
  },

  // Empty State
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyIconText: {
    fontSize: 28,
  },
  emptyTitle: {
    fontSize: SIZE.lg,
    fontWeight: '800',
    color: C.text,
    fontFamily: F.display,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: SIZE.sm,
    color: C.sub,
    fontFamily: F.body,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  emptyCta: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyCtaText: {
    fontSize: SIZE.md,
    fontWeight: '700',
    color: 'white',
    fontFamily: F.display,
  },
});
