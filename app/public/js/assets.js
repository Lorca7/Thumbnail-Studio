// Loading pictures and fonts so the canvas can draw them.
//
// Drawing has to be instant, so pictures are decoded once and kept here
// (keyed by their path), and fonts are registered with the window once.

import { toArrayBuffer } from './util.js';

// --- Fonts ---------------------------------------------------------------------

// Open-license fonts that come with the app (see app/public/fonts/README.md).
export const BUILT_IN_FONTS = [
  { family: 'Anton', name: 'Anton', url: 'fonts/anton.woff2' },
  { family: 'Bebas Neue', name: 'Bebas Neue', url: 'fonts/bebas-neue.woff2' },
  { family: 'Inter Black', name: 'Inter Black', url: 'fonts/inter-black.woff2' },
  { family: 'Inter', name: 'Inter Regular', url: 'fonts/inter-regular.woff2' },
  { family: 'system-ui', name: 'Mac system font (bold)', system: true },
];

// The CSS family name used for one of your own fonts.
export function userFontFamily(font) {
  return `ts-${font.id}`;
}

// Every font you can pick, built-in first: [{ family, name }].
export function allFonts(brand) {
  return [
    ...BUILT_IN_FONTS.map((f) => ({ family: f.family, name: f.name, builtIn: true })),
    ...(brand?.fonts || []).map((f) => ({ family: userFontFamily(f), name: f.name, builtIn: false, id: f.id })),
  ];
}

export function fontName(brand, family) {
  return allFonts(brand).find((f) => f.family === family)?.name || 'Missing font';
}

// The canvas "font" setting for a text layer.
export function canvasFont(family, size) {
  if (!family || family === 'system-ui') return `bold ${size}px system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif`;
  return `${size}px "${family}", system-ui, sans-serif`;
}

const loadedFonts = new Set();

export async function loadBuiltInFonts() {
  await Promise.all(BUILT_IN_FONTS.filter((f) => !f.system).map(async (f) => {
    if (loadedFonts.has(f.family)) return;
    const face = new FontFace(f.family, `url(${f.url})`);
    await face.load();
    document.fonts.add(face);
    loadedFonts.add(f.family);
  }));
}

// Register your own fonts (from brand/fonts/). Broken files are skipped.
export async function loadUserFonts(brand) {
  const failed = [];
  for (const f of brand?.fonts || []) {
    const family = userFontFamily(f);
    if (loadedFonts.has(family)) continue;
    try {
      const bytes = await window.studio.readFile(f.file);
      const face = new FontFace(family, toArrayBuffer(bytes));
      await face.load();
      document.fonts.add(face);
      loadedFonts.add(family);
    } catch {
      failed.push(f.name);
    }
  }
  return failed;
}

// --- Pictures --------------------------------------------------------------------

const bitmaps = new Map(); // path → ImageBitmap
const pending = new Map(); // path → Promise

// Decode a picture from your files folder (e.g. "brand/logos/cat.png").
export function loadBitmap(rel) {
  if (bitmaps.has(rel)) return Promise.resolve(bitmaps.get(rel));
  if (!pending.has(rel)) {
    pending.set(rel, window.studio.readFile(rel)
      .then((bytes) => createImageBitmap(new Blob([toArrayBuffer(bytes)])))
      .then((bmp) => { bitmaps.set(rel, bmp); pending.delete(rel); return bmp; })
      .catch((err) => { pending.delete(rel); throw err; }));
  }
  return pending.get(rel);
}

// Already-decoded picture, or null (never waits).
export function bitmap(rel) {
  return bitmaps.get(rel) || null;
}

// Add a picture we already have in memory (just imported).
export async function putBitmap(rel, bytes) {
  const bmp = await createImageBitmap(new Blob([toArrayBuffer(bytes)]));
  bitmaps.set(rel, bmp);
  return bmp;
}

// Forget pictures under a path (e.g. after a design is renamed).
export function forgetBitmaps(prefix) {
  for (const k of [...bitmaps.keys()]) if (k.startsWith(prefix)) bitmaps.delete(k);
}
