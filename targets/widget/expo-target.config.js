/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = function(config) {
  return {
    type: 'widget',
    name: 'PremioLabWidget',
    displayName: 'PremioLab Gastos',
    deploymentTarget: '16.0',
    frameworks: ['SwiftUI', 'WidgetKit'],
    entitlements: {
      'com.apple.security.application-groups': [
        'group.com.premiotrader.app.data',
      ],
    },
    colors: {
      $accent: { color: '#6C5CE7', darkColor: '#6C5CE7' },
      WidgetBackground: { color: '#070a11', darkColor: '#070a11' },
      CardBg: { color: '#0d1117', darkColor: '#0d1117' },
      TextPrimary: { color: '#f1f1f4', darkColor: '#f1f1f4' },
      TextSecondary: { color: '#8888aa', darkColor: '#8888aa' },
      GreenColor: { color: '#22C55E', darkColor: '#22C55E' },
      RedColor: { color: '#EF4444', darkColor: '#EF4444' },
      YellowColor: { color: '#F59E0B', darkColor: '#F59E0B' },
    },
  };
};
