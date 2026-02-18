var sharp = require('sharp');
var path = require('path');

var BG = '#070a11';
var W = 1284;
var H = 2778;
var LOGO_SIZE = 280;

var svgLogo = [
  '<svg width="' + LOGO_SIZE + '" height="' + LOGO_SIZE + '" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">',
  '  <defs>',
  '    <linearGradient id="v1g" x1="0%" y1="0%" x2="100%" y2="100%">',
  '      <stop offset="0%" stop-color="#6366f1" />',
  '      <stop offset="50%" stop-color="#60a5fa" />',
  '      <stop offset="100%" stop-color="#06b6d4" />',
  '    </linearGradient>',
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

// Wordmark — "Premio" blue gradient, "Lab" cyan (matches Logo.js Wordmark)
var FONT_SIZE = 46;
var wordmarkSvg = [
  '<svg width="380" height="60" xmlns="http://www.w3.org/2000/svg">',
  '  <defs>',
  '    <linearGradient id="wg" x1="0%" y1="0%" x2="100%" y2="0%">',
  '      <stop offset="0%" stop-color="#6366f1" />',
  '      <stop offset="100%" stop-color="#60a5fa" />',
  '    </linearGradient>',
  '  </defs>',
  '  <text x="0" y="44" font-family="Arial,sans-serif" font-weight="800" font-size="' + FONT_SIZE + '" fill="url(#wg)">Premio</text>',
  '  <text x="200" y="44" font-family="Arial,sans-serif" font-weight="800" font-size="' + FONT_SIZE + '" fill="#06b6d4">Lab</text>',
  '</svg>',
].join('\n');

// Subtle ambient glow behind logo on splash
var GLOW_SIZE = 400;
var glowSvg = [
  '<svg width="' + GLOW_SIZE + '" height="' + GLOW_SIZE + '" xmlns="http://www.w3.org/2000/svg">',
  '  <defs>',
  '    <radialGradient id="ag" cx="50%" cy="50%" r="50%">',
  '      <stop offset="0%" stop-color="#6366f1" stop-opacity="0.12" />',
  '      <stop offset="60%" stop-color="#6366f1" stop-opacity="0.04" />',
  '      <stop offset="100%" stop-color="#070a11" stop-opacity="0" />',
  '    </radialGradient>',
  '  </defs>',
  '  <rect width="' + GLOW_SIZE + '" height="' + GLOW_SIZE + '" fill="url(#ag)" />',
  '</svg>',
].join('\n');

async function generate() {
  var logoBuf = await sharp(Buffer.from(svgLogo))
    .resize(LOGO_SIZE, LOGO_SIZE)
    .png()
    .toBuffer();

  var wordBuf = await sharp(Buffer.from(wordmarkSvg))
    .resize(380, 60)
    .png()
    .toBuffer();

  var glowBuf = await sharp(Buffer.from(glowSvg))
    .resize(GLOW_SIZE, GLOW_SIZE)
    .png()
    .toBuffer();

  var logoTop = Math.round(H / 2 - LOGO_SIZE / 2 - 40);
  var wordTop = logoTop + LOGO_SIZE + 28;
  var wordLeft = Math.round(W / 2 - 190);
  var glowTop = Math.round(logoTop + LOGO_SIZE / 2 - GLOW_SIZE / 2);
  var glowLeft = Math.round(W / 2 - GLOW_SIZE / 2);

  await sharp({
    create: {
      width: W,
      height: H,
      channels: 4,
      background: { r: 7, g: 10, b: 17, alpha: 1 },
    },
  })
    .composite([
      { input: glowBuf, top: glowTop, left: glowLeft },
      { input: logoBuf, top: logoTop, left: Math.round(W / 2 - LOGO_SIZE / 2) },
      { input: wordBuf, top: wordTop, left: wordLeft },
    ])
    .png()
    .toFile(path.join(__dirname, '..', 'assets', 'splash.png'));

  console.log('Generated splash.png (' + W + 'x' + H + ')');
}

generate().catch(function(err) {
  console.error('Error:', err);
  process.exit(1);
});
