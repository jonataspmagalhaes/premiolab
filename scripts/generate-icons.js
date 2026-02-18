var sharp = require('sharp');
var path = require('path');

// Polished v3 logo SVG with radial glows + specular highlights
var svgLogo = [
  '<svg width="1024" height="1024" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">',
  '  <defs>',
  '    <linearGradient id="v1g" x1="0%" y1="0%" x2="100%" y2="100%">',
  '      <stop offset="0%" stop-color="#6366f1" />',
  '      <stop offset="50%" stop-color="#60a5fa" />',
  '      <stop offset="100%" stop-color="#06b6d4" />',
  '    </linearGradient>',
  '    <radialGradient id="bgGlow" cx="65%" cy="35%" r="50%">',
  '      <stop offset="0%" stop-color="#6366f1" stop-opacity="0.06" />',
  '      <stop offset="100%" stop-color="#070a11" stop-opacity="0" />',
  '    </radialGradient>',
  '    <radialGradient id="g1" cx="50%" cy="50%" r="50%">',
  '      <stop offset="0%" stop-color="#4ade80" stop-opacity="0.25" />',
  '      <stop offset="100%" stop-color="#4ade80" stop-opacity="0" />',
  '    </radialGradient>',
  '    <radialGradient id="g2" cx="50%" cy="50%" r="50%">',
  '      <stop offset="0%" stop-color="#a78bfa" stop-opacity="0.25" />',
  '      <stop offset="100%" stop-color="#a78bfa" stop-opacity="0" />',
  '    </radialGradient>',
  '    <radialGradient id="g3" cx="50%" cy="50%" r="50%">',
  '      <stop offset="0%" stop-color="#fbbf24" stop-opacity="0.25" />',
  '      <stop offset="100%" stop-color="#fbbf24" stop-opacity="0" />',
  '    </radialGradient>',
  '  </defs>',
  '  <rect width="100" height="100" fill="#070a11" />',
  '  <rect width="100" height="100" fill="url(#bgGlow)" />',
  '  <rect x="6" y="6" width="88" height="88" rx="24" fill="url(#v1g)" opacity="0.08" />',
  '  <rect x="6" y="6" width="88" height="88" rx="24" fill="none" stroke="url(#v1g)" stroke-width="1.5" opacity="0.35" />',
  '  <text x="12" y="70" font-family="Arial,sans-serif" font-weight="800" font-size="48" fill="url(#v1g)">PL</text>',
  '  <line x1="76" y1="22" x2="86" y2="38" stroke="#4ade80" stroke-width="1.4" opacity="0.5" />',
  '  <line x1="76" y1="22" x2="72" y2="40" stroke="#a78bfa" stroke-width="1.4" opacity="0.5" />',
  '  <line x1="86" y1="38" x2="72" y2="40" stroke="#fbbf24" stroke-width="1.4" opacity="0.5" />',
  '  <circle cx="76" cy="22" r="12" fill="url(#g1)" />',
  '  <circle cx="86" cy="38" r="10" fill="url(#g2)" />',
  '  <circle cx="72" cy="40" r="9.5" fill="url(#g3)" />',
  '  <circle cx="76" cy="22" r="6" fill="#4ade80" />',
  '  <circle cx="86" cy="38" r="5" fill="#a78bfa" />',
  '  <circle cx="72" cy="40" r="4.5" fill="#fbbf24" />',
  '  <circle cx="74" cy="20" r="2" fill="#ffffff" opacity="0.35" />',
  '  <circle cx="84.5" cy="36.5" r="1.6" fill="#ffffff" opacity="0.3" />',
  '  <circle cx="70.5" cy="38.5" r="1.5" fill="#ffffff" opacity="0.3" />',
  '</svg>',
].join('\n');

// Adaptive icon foreground (dark bg — Android applies mask on top)
var svgForeground = [
  '<svg width="1024" height="1024" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">',
  '  <defs>',
  '    <linearGradient id="v1g" x1="0%" y1="0%" x2="100%" y2="100%">',
  '      <stop offset="0%" stop-color="#6366f1" />',
  '      <stop offset="50%" stop-color="#60a5fa" />',
  '      <stop offset="100%" stop-color="#06b6d4" />',
  '    </linearGradient>',
  '    <radialGradient id="bgGlow2" cx="65%" cy="35%" r="50%">',
  '      <stop offset="0%" stop-color="#6366f1" stop-opacity="0.06" />',
  '      <stop offset="100%" stop-color="#070a11" stop-opacity="0" />',
  '    </radialGradient>',
  '    <radialGradient id="g1" cx="50%" cy="50%" r="50%">',
  '      <stop offset="0%" stop-color="#4ade80" stop-opacity="0.25" />',
  '      <stop offset="100%" stop-color="#4ade80" stop-opacity="0" />',
  '    </radialGradient>',
  '    <radialGradient id="g2" cx="50%" cy="50%" r="50%">',
  '      <stop offset="0%" stop-color="#a78bfa" stop-opacity="0.25" />',
  '      <stop offset="100%" stop-color="#a78bfa" stop-opacity="0" />',
  '    </radialGradient>',
  '    <radialGradient id="g3" cx="50%" cy="50%" r="50%">',
  '      <stop offset="0%" stop-color="#fbbf24" stop-opacity="0.25" />',
  '      <stop offset="100%" stop-color="#fbbf24" stop-opacity="0" />',
  '    </radialGradient>',
  '  </defs>',
  '  <rect width="100" height="100" fill="#070a11" />',
  '  <rect width="100" height="100" fill="url(#bgGlow2)" />',
  '  <rect x="6" y="6" width="88" height="88" rx="24" fill="url(#v1g)" opacity="0.08" />',
  '  <rect x="6" y="6" width="88" height="88" rx="24" fill="none" stroke="url(#v1g)" stroke-width="1.5" opacity="0.35" />',
  '  <text x="12" y="70" font-family="Arial,sans-serif" font-weight="800" font-size="48" fill="url(#v1g)">PL</text>',
  '  <line x1="76" y1="22" x2="86" y2="38" stroke="#4ade80" stroke-width="1.4" opacity="0.5" />',
  '  <line x1="76" y1="22" x2="72" y2="40" stroke="#a78bfa" stroke-width="1.4" opacity="0.5" />',
  '  <line x1="86" y1="38" x2="72" y2="40" stroke="#fbbf24" stroke-width="1.4" opacity="0.5" />',
  '  <circle cx="76" cy="22" r="12" fill="url(#g1)" />',
  '  <circle cx="86" cy="38" r="10" fill="url(#g2)" />',
  '  <circle cx="72" cy="40" r="9.5" fill="url(#g3)" />',
  '  <circle cx="76" cy="22" r="6" fill="#4ade80" />',
  '  <circle cx="86" cy="38" r="5" fill="#a78bfa" />',
  '  <circle cx="72" cy="40" r="4.5" fill="#fbbf24" />',
  '  <circle cx="74" cy="20" r="2" fill="#ffffff" opacity="0.35" />',
  '  <circle cx="84.5" cy="36.5" r="1.6" fill="#ffffff" opacity="0.3" />',
  '  <circle cx="70.5" cy="38.5" r="1.5" fill="#ffffff" opacity="0.3" />',
  '</svg>',
].join('\n');

var assetsDir = path.join(__dirname, '..', 'assets');

async function generate() {
  var logoBuf = Buffer.from(svgLogo);
  var fgBuf = Buffer.from(svgForeground);

  // icon.png — full logo with background
  await sharp(logoBuf).resize(1024, 1024).png().toFile(path.join(assetsDir, 'icon.png'));
  console.log('Generated icon.png (1024x1024)');

  // adaptive-icon.png — foreground only (Android adds bg)
  await sharp(fgBuf).resize(1024, 1024).png().toFile(path.join(assetsDir, 'adaptive-icon.png'));
  console.log('Generated adaptive-icon.png (1024x1024)');

  // splash-icon.png
  await sharp(logoBuf).resize(200, 200).png().toFile(path.join(assetsDir, 'splash-icon.png'));
  console.log('Generated splash-icon.png (200x200)');

  // favicon.png
  await sharp(logoBuf).resize(48, 48).png().toFile(path.join(assetsDir, 'favicon.png'));
  console.log('Generated favicon.png (48x48)');

  console.log('Done!');
}

generate().catch(function(err) {
  console.error('Error:', err);
  process.exit(1);
});
