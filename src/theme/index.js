// =========== PREMIOLAB DESIGN SYSTEM ===========
export var C = {
  // Backgrounds
  bg: '#070a11',
  card: 'rgba(255,255,255,0.015)',
  cardSolid: '#0d1017',
  surface: 'rgba(255,255,255,0.03)',
  // Borders
  border: 'rgba(255,255,255,0.04)',
  borderLight: 'rgba(255,255,255,0.08)',
  // Text
  text: '#f1f1f4',
  sub: '#9999aa',
  dim: '#555577',
  // Accent
  accent: '#6C5CE7',
  accentFrom: '#6C5CE7',
  accentTo: '#a855f7',
  // Products
  acoes: '#3B82F6',
  fiis: '#10B981',
  opcoes: '#8B5CF6',
  etfs: '#F59E0B',
  rf: '#06B6D4',
  // Status
  green: '#22C55E',
  red: '#EF4444',
  yellow: '#F59E0B',
  // Transparent overlays
  overlay: 'rgba(0,0,0,0.6)',
};

export var PRODUCT_COLORS = {
  'acao': C.acoes,
  'fii': C.fiis,
  'etf': C.etfs,
  'opcao': C.opcoes,
  'rf': C.rf,
};

export var F = {
  display: 'DMSans-Bold',
  body: 'DMSans-Medium',
  mono: 'JetBrainsMono-Regular',
  monoBold: 'JetBrainsMono-Bold',
  displayFallback: 'System',
  bodyFallback: 'System',
};

export var FONT_ASSETS = {
  'DMSans-Bold': require('../../assets/fonts/DMSans-Bold.ttf'),
  'DMSans-Medium': require('../../assets/fonts/DMSans-Medium.ttf'),
  'DMSans-Regular': require('../../assets/fonts/DMSans-Regular.ttf'),
  'JetBrainsMono-Regular': require('../../assets/fonts/JetBrainsMono-Regular.ttf'),
  'JetBrainsMono-Bold': require('../../assets/fonts/JetBrainsMono-Bold.ttf'),
};

export var SIZE = {
  // Font sizes
  xs: 13,
  sm: 15,
  md: 17,
  base: 19,
  lg: 23,
  xl: 28,
  xxl: 36,
  hero: 44,
  // Spacing
  gap: 14,
  padding: 18,
  radius: 14,
  radiusSm: 10,
  radiusLg: 20,
  // Component sizes
  tabBarHeight: 78,
  fabSize: 58,
  headerHeight: 58,
};

export var SHADOW = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  glow: function(color) {
    return {
      shadowColor: color,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
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
