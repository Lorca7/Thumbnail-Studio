// Drawing a thumbnail onto a canvas.
//
// A "variant" is one version of a thumbnail (A, B or C). It is plain data:
//   { id: 'A', background: { color: '#1f2937' }, layers: [] }
// The same function draws the small on-screen preview and the full-size
// export, so what you see is exactly what you get.
//
// Layers (images, text) arrive in step 3; for now only the background is drawn.

import { YOUTUBE } from './youtube-rules.js';

// Draw `variant` onto `canvas`, scaled to fit the canvas's pixel size.
export function renderVariant(canvas, variant) {
  const ctx = canvas.getContext('2d');
  // All positions in a design use the full 3840×2160 space; scale down to the canvas.
  const scale = canvas.width / YOUTUBE.width;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  ctx.fillStyle = variant.background?.color || '#000000';
  ctx.fillRect(0, 0, YOUTUBE.width, YOUTUBE.height);

  ctx.restore();
}

// Make a fresh full-size canvas with the variant drawn on it (used by export).
export function renderFullSize(variant) {
  const canvas = document.createElement('canvas');
  canvas.width = YOUTUBE.width;
  canvas.height = YOUTUBE.height;
  renderVariant(canvas, variant);
  return canvas;
}
