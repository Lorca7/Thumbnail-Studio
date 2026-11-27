// Drawing a thumbnail onto a canvas.
//
// A "variant" is one version of a thumbnail (A, B or C). It is plain data:
//   { id: 'A', background: { color: '#1f2937' }, layers: [ ... ] }
// Layers are drawn in order: the first is at the back, the last in front.
// Every layer has: id, type, x, y, rotation (degrees), hidden, locks, and
// optionally `slot` (its name in a template).
//
//   image: { file, w, h, fill, pixelArt }   file = null → an empty template slot
//   logo:  { logoId, w, h, role }           role 'cornerMark' = the brand corner mark
//   text:  { text, font, size, color, outline:{width,color},
//            shadow:{blur,x,y,color}, allCaps, letterSpacing, align }
//
// All positions use the full 3840×2160 space. The same function draws the
// on-screen preview and the full-size export, so what you see is exactly
// what you get.

import { YOUTUBE } from './youtube-rules.js';
import { canvasFont } from './assets.js';

export const W = YOUTUBE.width;
export const H = YOUTUBE.height;
export const LINE_HEIGHT = 1.12; // text line spacing, as a multiple of the size

// Where YouTube puts the video length badge on a thumbnail (bottom-right).
// Anything important here gets covered. Generous on purpose.
export const TIMESTAMP_ZONE = { x: W * 0.8, y: H * 0.82, w: W * 0.2, h: H * 0.18 };

// --- Measuring ---------------------------------------------------------------------

const measureCtx = document.createElement('canvas').getContext('2d');

export function displayText(layer) {
  const t = layer.text || '';
  return layer.allCaps ? t.toUpperCase() : t;
}

// Width of each line of a text layer, in 3840×2160 units.
function measureLines(layer) {
  measureCtx.font = canvasFont(layer.font, layer.size);
  measureCtx.letterSpacing = `${layer.letterSpacing || 0}px`;
  const lines = displayText(layer).split('\n');
  return lines.map((line) => ({ line, width: measureCtx.measureText(line || ' ').width }));
}

// The (unrotated) box a layer covers: { x, y, w, h }.
export function layerBounds(layer) {
  if (layer.type === 'text') {
    const lines = measureLines(layer);
    const pad = (layer.outline?.width || 0);
    const w = Math.max(...lines.map((l) => l.width), layer.size * 0.3) + pad * 2;
    return { x: layer.x, y: layer.y, w, h: lines.length * layer.size * LINE_HEIGHT + pad * 2 };
  }
  if (layer.type === 'image' && layer.fill) return { x: 0, y: 0, w: W, h: H };
  return { x: layer.x, y: layer.y, w: layer.w, h: layer.h };
}

// Where a picture goes when it fills the frame: scaled to cover it,
// centered, with any overflow cropped off the edges.
export function coverRect(imgW, imgH, box = { x: 0, y: 0, w: W, h: H }) {
  const scale = Math.max(box.w / imgW, box.h / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

// Where a picture goes to fit inside a box without cropping, centered.
export function containRect(imgW, imgH, box) {
  const scale = Math.min(box.w / imgW, box.h / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

// Do two boxes overlap?
export function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// The axis-aligned box around a (possibly rotated) layer.
export function outerBounds(layer) {
  const b = layerBounds(layer);
  const rad = ((layer.rotation || 0) * Math.PI) / 180;
  if (!rad) return b;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const w = b.w * cos + b.h * sin;
  const h = b.w * sin + b.h * cos;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

// --- Drawing -----------------------------------------------------------------------

// Draw `variant` onto `canvas`, scaled to the canvas's pixel size.
//   opts.picture(layer) → decoded picture for an image or logo layer, or null
//   opts.forExport      → leave out on-screen helpers (empty slot outlines)
export function renderVariant(canvas, variant, opts = {}) {
  const ctx = canvas.getContext('2d');
  const scale = canvas.width / W;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.fillStyle = variant.background?.color || '#000000';
  ctx.fillRect(0, 0, W, H);

  for (const layer of variant.layers || []) {
    if (layer.hidden) continue;
    if (layer.type === 'text') drawText(ctx, layer, scale);
    else drawPicture(ctx, layer, opts);
  }
  ctx.restore();
}

// Rotate the drawing around the layer's center, then call draw(box).
function withRotation(ctx, layer, box, draw) {
  ctx.save();
  if (layer.rotation) {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((layer.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  draw(box);
  ctx.restore();
}

function drawPicture(ctx, layer, opts) {
  const img = opts.picture?.(layer);
  const box = layerBounds(layer);
  if (!img) {
    // Empty template slot (or a picture that couldn't be loaded): show a
    // placeholder on screen only.
    if (!opts.forExport) withRotation(ctx, layer, box, (b) => drawPlaceholder(ctx, b, layer.slot || 'Image'));
    return;
  }
  withRotation(ctx, layer, box, (b) => {
    // Pixel-art mode: hard-edged pixels (nearest-neighbor), no blur.
    ctx.imageSmoothingEnabled = !layer.pixelArt;
    if (layer.type === 'image' && layer.fill) {
      const r = coverRect(img.width, img.height);
      ctx.drawImage(img, r.x, r.y, r.w, r.h);
    } else {
      ctx.drawImage(img, b.x, b.y, b.w, b.h);
    }
  });
}

function drawPlaceholder(ctx, b, label) {
  ctx.save();
  ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.8)';
  ctx.lineWidth = 8;
  ctx.setLineDash([40, 24]);
  ctx.strokeRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(241, 245, 249, 0.95)';
  ctx.font = canvasFont('system-ui', Math.max(60, Math.min(140, b.w / 10)));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${label} (drop a picture here)`, b.x + b.w / 2, b.y + b.h / 2, b.w * 0.9);
  ctx.restore();
}

function drawText(ctx, layer, scale) {
  const box = layerBounds(layer);
  const lines = measureLines(layer);
  const pad = layer.outline?.width || 0;
  withRotation(ctx, layer, box, (b) => {
    ctx.font = canvasFont(layer.font, layer.size);
    ctx.letterSpacing = `${layer.letterSpacing || 0}px`;
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    const innerW = b.w - pad * 2;
    const shadow = layer.shadow || {};
    const hasShadow = shadow.blur > 0 || shadow.x || shadow.y;
    lines.forEach(({ line, width }, i) => {
      let x = b.x + pad;
      if (layer.align === 'center') x += (innerW - width) / 2;
      if (layer.align === 'right') x += innerW - width;
      const y = b.y + pad + i * layer.size * LINE_HEIGHT + layer.size * 0.06;
      // Canvas shadows ignore zoom, so scale them to match the preview size.
      const setShadow = (on) => {
        ctx.shadowColor = on ? shadow.color || '#000000' : 'transparent';
        ctx.shadowBlur = on ? (shadow.blur || 0) * scale : 0;
        ctx.shadowOffsetX = on ? (shadow.x || 0) * scale : 0;
        ctx.shadowOffsetY = on ? (shadow.y || 0) * scale : 0;
      };
      if (pad > 0) {
        // Outline: a thick stroke drawn first, with the fill on top.
        setShadow(hasShadow);
        ctx.strokeStyle = layer.outline.color || '#000000';
        ctx.lineWidth = pad * 2;
        ctx.strokeText(line, x, y);
        setShadow(false);
      } else {
        setShadow(hasShadow);
      }
      ctx.fillStyle = layer.color || '#ffffff';
      ctx.fillText(line, x, y);
      setShadow(false);
    });
  });
}

// Make a fresh full-size canvas with the variant drawn on it (for export).
export function renderFullSize(variant, opts = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  renderVariant(canvas, variant, { ...opts, forExport: true });
  return canvas;
}

// Draw a scaled-down copy of a variant into `canvas` at its current size,
// via a full-size render so it looks exactly like the export.
export function renderThumb(canvas, variant, opts = {}) {
  const full = renderFullSize(variant, opts);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(full, 0, 0, canvas.width, canvas.height);
  return full;
}
