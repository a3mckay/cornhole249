// OG image rendering pipeline: JSX-object → SVG (satori) → PNG (resvg).
// Card dimensions are always 1200×630 (OG/iMessage/Twitter standard).
//
// This module exports two things:
//   - h(type, props, ...children): tiny JSX-element factory so card templates
//     don't need a build step
//   - render(node): takes a satori element, returns a PNG Buffer
//
// Fonts are loaded once at module load. We use:
//   - Abril Fatface (display, for big headings)
//   - Nunito (UI, weights 400/700/900)

const fs = require('fs');
const path = require('path');
const https = require('https');
const satori = require('satori').default || require('satori');
const { Resvg } = require('@resvg/resvg-js');

// In-memory cache for fetched Twemoji SVGs. First render of a given emoji
// is async (a small CDN fetch); subsequent renders are instant.
const emojiCache = new Map();

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return fetchUrl(res.headers.location).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      })
      .on('error', reject);
  });
}

// Convert "🏆" to the matching Twemoji SVG filename. Twemoji omits the
// variation-selector-16 (U+FE0F) from filenames for most emojis.
function emojiToCodePoint(emoji) {
  const cps = [];
  for (const ch of emoji) {
    const cp = ch.codePointAt(0);
    if (cp !== 0xfe0f) cps.push(cp.toString(16));
  }
  return cps.join('-');
}

async function loadEmoji(emoji) {
  if (emojiCache.has(emoji)) return emojiCache.get(emoji);
  const code = emojiToCodePoint(emoji);
  const url = `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${code}.svg`;
  try {
    const svg = await fetchUrl(url);
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    emojiCache.set(emoji, dataUrl);
    return dataUrl;
  } catch (e) {
    emojiCache.set(emoji, null);
    return null;
  }
}

const WIDTH = 1200;
const HEIGHT = 630;

const fontsDir = path.join(__dirname, 'fonts');
const FONTS = [
  {
    name: 'Abril Fatface',
    data: fs.readFileSync(path.join(fontsDir, 'AbrilFatface-Regular.ttf')),
    weight: 400,
    style: 'normal',
  },
  {
    name: 'Nunito',
    data: fs.readFileSync(path.join(fontsDir, 'Nunito-Regular.ttf')),
    weight: 400,
    style: 'normal',
  },
  {
    name: 'Nunito',
    data: fs.readFileSync(path.join(fontsDir, 'Nunito-Bold.ttf')),
    weight: 700,
    style: 'normal',
  },
  {
    name: 'Nunito',
    data: fs.readFileSync(path.join(fontsDir, 'Nunito-Black.ttf')),
    weight: 900,
    style: 'normal',
  },
];

// Tiny JSX-element factory. Card templates read like:
//   h('div', { style: {...} }, h('span', null, 'text'))
function h(type, props, ...children) {
  const flat = children.flat().filter((c) => c != null && c !== false);
  const finalProps = { ...(props || {}) };
  if (flat.length === 1) finalProps.children = flat[0];
  else if (flat.length > 1) finalProps.children = flat;
  return { type, props: finalProps };
}

async function render(node) {
  const svg = await satori(node, {
    width: WIDTH,
    height: HEIGHT,
    fonts: FONTS,
    loadAdditionalAsset: async (code, segment) => {
      if (code === 'emoji') {
        const url = await loadEmoji(segment);
        return url || '';
      }
      return '';
    },
  });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } })
    .render()
    .asPng();
  return png;
}

module.exports = { h, render, WIDTH, HEIGHT };
