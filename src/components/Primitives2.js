// Primitives2 — novos primitivos que usam tokens (Fase B).
// O Primitives.js original continua pra nao quebrar codigo legado.
// Codigo novo deve importar daqui.
//
// Export: Button, Row, Stack, Spacer, KpiLabel, Heading, BodyText, CaptionText

import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { T } from '../theme/tokens';

// ───────────────── Button ─────────────────
// variants: primary | secondary | ghost | danger | income
// sizes: sm | md | lg
export function Button(props) {
  var variant = props.variant || 'primary';
  var sizeName = props.size || 'md';
  var disabled = props.disabled;
  var loading = props.loading;
  var fullWidth = props.fullWidth;
  var onPress = props.onPress;
  var children = props.children;
  var icon = props.icon;
  var style = props.style;

  var variants = {
    primary: { bg: T.color.accent, fg: T.color.textOnAccent, border: null },
    secondary: { bg: T.color.accentBg, fg: T.color.accent, border: T.color.borderAccent },
    ghost: { bg: 'transparent', fg: T.color.textPrimary, border: T.color.border },
    danger: { bg: T.color.danger, fg: T.color.textOnAccent, border: null },
    income: { bg: T.color.income, fg: T.color.textOnAccent, border: null },
  };
  var v = variants[variant] || variants.primary;

  var sizes = {
    sm: { padY: T.space.xs, padX: T.space.sm, font: 12, iconSize: 14 },
    md: { padY: T.space.sm, padX: T.space.md, font: 14, iconSize: 16 },
    lg: { padY: T.space.md, padX: T.space.lg, font: 16, iconSize: 18 },
  };
  var s = sizes[sizeName] || sizes.md;

  var base = {
    backgroundColor: disabled ? T.color.surface2 : v.bg,
    paddingVertical: s.padY,
    paddingHorizontal: s.padX,
    borderRadius: T.radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: T.space.xs,
    minHeight: T.size.buttonHeight,
    opacity: disabled ? 0.5 : 1,
    alignSelf: fullWidth ? 'stretch' : 'flex-start',
  };
  if (v.border) {
    base.borderWidth = 1;
    base.borderColor = v.border;
  }

  return React.createElement(
    TouchableOpacity,
    { activeOpacity: 0.8, onPress: disabled || loading ? undefined : onPress, style: [base, style] },
    loading
      ? React.createElement(ActivityIndicator, { size: 'small', color: v.fg })
      : React.createElement(
          React.Fragment,
          null,
          icon || null,
          React.createElement(
            Text,
            { style: { fontSize: s.font, fontWeight: '700', color: v.fg, fontFamily: T.type.h2.fontFamily } },
            children
          )
        )
  );
}

// ───────────────── Row ─────────────────
// Layout horizontal com gap consistente. Shorthand pra flexDirection: 'row'.
export function Row(props) {
  var gap = props.gap != null ? props.gap : T.space.sm;
  var align = props.align || 'center';
  var justify = props.justify || 'flex-start';
  var wrap = props.wrap;
  var style = props.style;
  return React.createElement(
    View,
    {
      style: [
        {
          flexDirection: 'row',
          alignItems: align,
          justifyContent: justify,
          gap: gap,
          flexWrap: wrap ? 'wrap' : 'nowrap',
        },
        style,
      ],
    },
    props.children
  );
}

// ───────────────── Stack ─────────────────
// Layout vertical com gap consistente. flex column + gap.
export function Stack(props) {
  var gap = props.gap != null ? props.gap : T.space.sm;
  var align = props.align;
  var justify = props.justify;
  var style = props.style;
  return React.createElement(
    View,
    {
      style: [
        {
          flexDirection: 'column',
          alignItems: align,
          justifyContent: justify,
          gap: gap,
        },
        style,
      ],
    },
    props.children
  );
}

// ───────────────── Spacer ─────────────────
// Ocupa espaco vertical/horizontal consistente
export function Spacer(props) {
  var sz = props.size != null ? props.size : T.space.md;
  var horizontal = props.horizontal;
  var style = horizontal ? { width: sz } : { height: sz };
  return React.createElement(View, { style: style });
}

// ───────────────── Typography ─────────────────
export function Heading(props) {
  var level = props.level || 2;
  var color = props.color || T.color.textPrimary;
  var style = level === 1 ? T.type.h1 : T.type.h2;
  return React.createElement(Text, { style: [style, { color: color }, props.style] }, props.children);
}

export function BodyText(props) {
  var color = props.color || T.color.textPrimary;
  return React.createElement(Text, { style: [T.type.body, { color: color }, props.style] }, props.children);
}

export function CaptionText(props) {
  var color = props.color || T.color.textSecondary;
  return React.createElement(Text, { style: [T.type.caption, { color: color }, props.style] }, props.children);
}

export function KpiLabel(props) {
  var color = props.color || T.color.textSecondary;
  return React.createElement(
    Text,
    { style: [T.type.kpiLabel, { color: color }, props.style] },
    props.children
  );
}

export function MonoText(props) {
  var color = props.color || T.color.textPrimary;
  var bold = props.bold;
  var base = bold ? T.type.monoBold : T.type.mono;
  return React.createElement(Text, { style: [base, { color: color }, props.style] }, props.children);
}

// ───────────────── Card2 ─────────────────
// Wrapper basico com tokens. Use Glass pra glassmorphism, Card2 pra card simples.
export function Card2(props) {
  var variant = props.variant || 'surface1';
  var padding = props.padding != null ? props.padding : T.space.cardPad;
  var radius = props.radius != null ? props.radius : T.radius.md;
  var borderColor = props.borderColor;
  var style = props.style;

  var bgMap = {
    surface1: T.color.surface1,
    surface2: T.color.surface2,
    surface3: T.color.surface3,
    income: T.color.incomeBg,
    accent: T.color.accentBg,
    danger: T.color.dangerBg,
    warning: T.color.warningBg,
    info: T.color.infoBg,
  };
  var bg = bgMap[variant] || T.color.surface1;

  var base = {
    backgroundColor: bg,
    padding: padding,
    borderRadius: radius,
    borderWidth: borderColor ? 1 : 0,
    borderColor: borderColor || 'transparent',
  };

  return React.createElement(View, { style: [base, style] }, props.children);
}
