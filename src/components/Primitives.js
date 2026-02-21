import React from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { C, F, SIZE } from '../theme';

// ═══════════ BADGE ═══════════
export function Badge(props) {
  var text = props.text;
  var color = props.color || C.accent;
  return (
    <View accessibilityRole="text" accessibilityLabel={text}
      style={[styles.badge, { backgroundColor: color + '15', borderColor: color + '25' }]}>
      <Text style={[styles.badgeText, { color: color }]}>{text}</Text>
    </View>
  );
}

// ═══════════ PILL ═══════════
export function Pill(props) {
  var children = props.children;
  var active = props.active;
  var color = props.color || C.accent;
  var onPress = props.onPress;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={typeof children === 'string' ? children : undefined}
      style={[
        styles.pill,
        active
          ? { backgroundColor: color + '18', borderColor: color + '30' }
          : { backgroundColor: C.surface, borderColor: C.border },
      ]}
    >
      <Text style={[styles.pillText, { color: active ? color : C.textSecondary, fontWeight: active ? '700' : '500' }]}>
        {children}
      </Text>
    </TouchableOpacity>
  );
}

// ═══════════ SECTION LABEL ═══════════
export function SectionLabel(props) {
  var children = props.children;
  var right = props.right;
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionText}>{children}</Text>
      {right && <Text style={styles.sectionRight}>{right}</Text>}
    </View>
  );
}

// ═══════════ TEXT INPUT FIELD ═══════════
export function Field(props) {
  var label = props.label;
  var placeholder = props.placeholder;
  var value = props.value;
  var onChangeText = props.onChangeText;
  var suffix = props.suffix;
  var prefix = props.prefix;
  var icon = props.icon;
  var required = props.required;
  var keyboardType = props.keyboardType || 'default';
  var half = props.half;
  var style = props.style;

  return (
    <View style={[styles.fieldWrap, half && { width: '48%' }, style]}>
      {label && (
        <Text style={styles.fieldLabel}>
          {label}
          {required && <Text style={{ color: C.red }}> *</Text>}
        </Text>
      )}
      <View style={styles.fieldInput}>
        {prefix && <Text style={styles.fieldPrefix}>{prefix}</Text>}
        {icon && <Text style={styles.fieldIcon}>{icon}</Text>}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={C.dim}
          keyboardType={keyboardType}
          accessibilityLabel={label || placeholder}
          style={styles.fieldTextInput}
        />
        {suffix && <Text style={styles.fieldSuffix}>{suffix}</Text>}
      </View>
    </View>
  );
}

var styles = StyleSheet.create({
  // Badge
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: F.mono,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Pill
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
  },
  pillText: {
    fontSize: 12,
    fontFamily: F.body,
    fontWeight: '600',
  },

  // Section Label
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  sectionText: {
    fontSize: SIZE.xs,
    color: C.textSecondary,
    fontFamily: F.mono,
    letterSpacing: 0.8,
    fontWeight: '600',
  },
  sectionRight: {
    fontSize: SIZE.xs,
    color: C.accent,
    fontFamily: F.mono,
  },

  // Field
  fieldWrap: {
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 11,
    color: C.sub,
    fontFamily: F.body,
    marginBottom: 4,
  },
  fieldInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: SIZE.radiusSm,
    paddingHorizontal: 10,
    height: 44,
  },
  fieldPrefix: {
    fontSize: 12,
    color: C.dim,
    fontFamily: F.mono,
    marginRight: 4,
  },
  fieldSuffix: {
    fontSize: 12,
    color: C.dim,
    fontFamily: F.mono,
    marginLeft: 4,
  },
  fieldIcon: {
    fontSize: 12,
    marginRight: 6,
  },
  fieldTextInput: {
    flex: 1,
    fontSize: 14,
    color: C.text,
    fontFamily: F.body,
    padding: 0,
  },
});
