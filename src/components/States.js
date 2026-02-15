import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, TouchableOpacity } from 'react-native';
import { C, F, SIZE } from '../theme';

// ═══════════ SKELETON BAR ═══════════
export function Skeleton({ width = '100%', height = 14, radius = 6, style }) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.08, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: 'rgba(255,255,255,0.1)',
          opacity,
        },
        style,
      ]}
    />
  );
}

// ═══════════ SKELETON CARD ═══════════
export function SkeletonCard({ height = 80 }) {
  return (
    <View style={[styles.skelCard, { height }]}>
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
      <SkeletonCard height={120} />
      <View style={styles.loadingRow}>
        {[1, 2, 3].map((i) => (
          <View key={i} style={styles.loadingMiniCard}>
            <Skeleton width="60%" height={8} />
            <View style={{ height: 4 }} />
            <Skeleton width="80%" height={16} />
          </View>
        ))}
      </View>
      {[1, 2, 3, 4].map((i) => (
        <SkeletonRow key={i} />
      ))}
    </View>
  );
}

// ═══════════ EMPTY STATE ═══════════
export function EmptyState({
  icon = '◫',
  title,
  description,
  cta,
  onCta,
  color = C.accent,
}) {
  return (
    <View style={styles.emptyWrap}>
      <View style={[styles.emptyIcon, { backgroundColor: color + '08', borderColor: color + '15' }]}>
        <Text style={[styles.emptyIconText, { color }]}>{icon}</Text>
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

const styles = StyleSheet.create({
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
    lineHeight: 16,
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
