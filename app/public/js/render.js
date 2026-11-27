// Drawing a thumbnail onto a canvas.
//
// A "variant" is one version of a thumbnail (A, B or C). It is plain data:
//   { id: 'A', background: { color: '#1f2937' }, layers: [ ... ] }
// Layers are drawn in order: the first layer is at the back, the last in front.
//
//   image layer: { id, type: 'image', name, file, x, y, w, h, fill }
//                (fill = true → stretch to cover the whole 16:9 frame)
//   text layer:  { id, type: 'text', text, size, color, x, y }
//
// All positions use the full 3840×2160 space. The same function draws the
// small on-screen preview and the full-size export, so what you see is
// exactly what you get.

import { YOUTUBE } from './youtube-rules.js';

const W = YOUTUBE.width;
const H = YOUTUBE.height;

// The Mac's own system font (San Francisco), bold. Your own fonts arrive with the brand kit.
export const SYSTEM_FONT = 'system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';

export function textFont(layer) {
  return `bold ${layer.size}px ${SYSTEM_FONT}`;
}

// A scratch canvas used only for measuring text.
const measureCtx = document.createElement('canvas').getContext('2d');

// The box a layer covers, in 3840×2160 units: { x, y, w, h }.
export function layerBounds(layer) {
  if (layer.type === 'text') {
    measureCtx.font = textFont(layer);
    const w = Math.max(measureCtx.measureText(layer.text || ' ').width, layer.size * 0.3);
    return { x: layer.x, y: layer.y, w, h: layer.size * 1.2 };
  }
  if (layer.fill) return { x: 0, y: 0, w: W, h: H };
  return { x: layer.x, y: layer.y, w: layer.w, h: layer.h };
}

// Where an image goes when it fills the frame: scaled to cover it, centered,
// with any overflow cropped off the edges.
export function coverRect(imgW, imgH) {
  const scale = Math.max(W / imgW, H / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

// Draw `variant` onto `canvas`, scaled to fit the canvas's pixel size.
// `images` maps layer id → decoded picture (ImageBitmap).
export function renderVariant(canvas, variant, images) {
  const ctx = canvas.getContext('2d');
  const scale = canvas.width / W;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.fillStyle = variant.background?.color || '#000000';
  ctx.fillRect(0, 0, W, H);

  for (const layer of variant.layers || []) {
    if (layer.type === 'image') {
      const img = images?.get(layer.id);
      if (!img) continue;
      const r = layer.fill ? coverRect(img.width, img.height) : layer;
      ctx.drawImage(img, r.x, r.y, r.w, r.h);
    } else if (layer.type === 'text') {
      ctx.font = textFont(layer);
      ctx.fillStyle = layer.color;
      ctx.textBaseline = 'top';
      // Small top offset so the letters sit inside their box.
      ctx.fillText(layer.text, layer.x, layer.y + layer.size * 0.1);
    }
  }

  ctx.restore();
}

// Make a fresh full-size canvas with the variant drawn on it (used by export).
export function renderFullSize(variant, images) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  renderVariant(canvas, variant, images);
  return canvas;
}
