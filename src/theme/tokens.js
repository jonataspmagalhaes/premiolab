// =========== PREMIOLAB DESIGN TOKENS ===========
// Fase B da reconstrucao. Tokens semanticos para uso consistente.
// Densidade: BALANCEADO (padding 16, gap 12, radius 12-14).
//
// USO:
//   import { T } from '../theme/tokens';
//   <View style={{ padding: T.space.md, backgroundColor: T.color.surface1 }} />
//
// Nao quebra nada — os exports antigos (C, F, SIZE, SHADOW) continuam
// exportados por theme/index.js por compatibilidade.

// ──────────────────────────────────────────────
// COLOR TOKENS — semanticos, nao hex cru
// ──────────────────────────────────────────────
export var color = {
  // Background layers
  bg: '#070a11',                      // tela
  surface1: 'rgba(255,255,255,0.03)', // cards base
  surface2: 'rgba(255,255,255,0.05)', // card elevado (hover, selected)
  surface3: 'rgba(255,255,255,0.08)', // card muito elevado (modal, popover)
  scrim: 'rgba(0,0,0,0.6)',           // overlay modal

  // Borders
  border: 'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.12)',
  borderAccent: 'rgba(108,92,231,0.30)',

  // Text
  textPrimary: '#f1f1f4',
  textSecondary: '#9999aa',
  textMuted: '#666688',
  textDisabled: '#444466',
  textOnAccent: '#ffffff',

  // Semantic intent
  income: '#22C55E',         // verde renda (protagonista do app)
  incomeBg: 'rgba(34,197,94,0.10)',
  incomeBgStrong: 'rgba(34,197,94,0.18)',
  growth: '#10B981',         // verde crescimento (deltas positivos)
  danger: '#EF4444',
  dangerBg: 'rgba(239,68,68,0.10)',
  warning: '#F59E0B',
  warningBg: 'rgba(245,158,11,0.10)',
  info: '#3B82F6',
  infoBg: 'rgba(59,130,246,0.10)',

  // Brand accent (roxo)
  accent: '#6C5CE7',
  accentStrong: '#8B5CF6',
  accentBg: 'rgba(108,92,231,0.15)',
  accentBgStrong: 'rgba(108,92,231,0.22)',

  // Product categories (cores dedicadas por classe de ativo)
  fii: '#10B981',
  acao: '#3B82F6',
  opcao: '#8B5CF6',
  etf: '#F59E0B',
  etfInt: '#FBBF24',
  rf: '#06B6D4',
  stockInt: '#E879F9',
  bdr: '#FB923C',
  caixa: '#8888aa',
};

// ──────────────────────────────────────────────
// SPACING SCALE — unica fonte de verdade
// Proibir padding/margin inline no codigo novo
// ──────────────────────────────────────────────
export var space = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,   // padding padrao (balanceado)
  s5: 24,
  s6: 32,
  s7: 48,
  s8: 64,

  // Aliases semanticos (use estes por clareza)
  xxs: 4,
  xs: 8,
  sm: 12,   // gap padrao
  md: 16,   // padding padrao
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,

  // Verticais comuns
  gap: 12,           // espaco entre cards
  cardPad: 16,       // padding interno de Glass/Card
  screenPad: 16,     // padding da tela
  rowGap: 8,         // gap entre rows numa lista
};

// ──────────────────────────────────────────────
// TYPOGRAPHY — 6 estilos, nao mais
// ──────────────────────────────────────────────
export var type = {
  display: {
    fontFamily: 'DMSans-Bold',
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 38,
  },
  h1: {
    fontFamily: 'DMSans-Bold',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
  h2: {
    fontFamily: 'DMSans-Bold',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  body: {
    fontFamily: 'DMSans-Medium',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  caption: {
    fontFamily: 'DMSans-Medium',
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 14,
  },
  mono: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 16,
  },
  monoBold: {
    fontFamily: 'JetBrainsMono-Bold',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16,
  },

  // Label pra KPIs (letterSpacing)
  kpiLabel: {
    fontFamily: 'JetBrainsMono-Regular',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
};

// ──────────────────────────────────────────────
// RADIUS SCALE
// ──────────────────────────────────────────────
export var radius = {
  sm: 8,    // chips, pills, badges pequenos
  md: 12,   // cards padrao (balanceado)
  lg: 16,   // cards hero
  xl: 20,   // modais
  full: 999,
};

// ──────────────────────────────────────────────
// SHADOW / GLOW
// ──────────────────────────────────────────────
export var shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  hero: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  glow: function(c) {
    return {
      shadowColor: c,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.18,
      shadowRadius: 14,
      elevation: 6,
    };
  },
  fab: {
    shadowColor: '#6C5CE7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
};

// ──────────────────────────────────────────────
// COMPONENT SIZES — heights/widths fixos de UI
// ──────────────────────────────────────────────
export var size = {
  tabBar: 78,
  headerHeight: 58,
  fab: 58,
  touchTarget: 44,   // minimo clickable (a11y)
  inputHeight: 44,
  buttonHeight: 44,
  iconSm: 14,
  iconMd: 18,
  iconLg: 24,
  iconXl: 32,
};

// ──────────────────────────────────────────────
// T — namespace completo pra import conveniente
// ──────────────────────────────────────────────
export var T = {
  color: color,
  space: space,
  type: type,
  radius: radius,
  shadow: shadow,
  size: size,
};

// Export default tambem
export default T;
