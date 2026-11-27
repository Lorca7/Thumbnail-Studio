// Mouse handling on the canvas: click to select a layer, drag to move it,
// drag a corner handle to resize it (proportions always kept).
//
// The editor doesn't own the design; it's given functions to read the
// current layers and to report changes back (see main.js).

import { YOUTUBE } from './youtube-rules.js';
import { layerBounds } from './render.js';

const HANDLE_PX = 12; // corner handle size on screen, in CSS pixels
const MIN_SIZE = 40; // smallest a layer can be resized to, in 3840×2160 units

// The four corners of a box, named by which side they're on.
function corners(b) {
  return {
    nw: { x: b.x, y: b.y }, ne: { x: b.x + b.w, y: b.y },
    sw: { x: b.x, y: b.y + b.h }, se: { x: b.x + b.w, y: b.y + b.h },
  };
}
const OPPOSITE = { nw: 'se', ne: 'sw', sw: 'ne', se: 'nw' };

export function attachEditor(canvas, { getLayers, getSelectedId, select, changed }) {
  let drag = null; // what the current mouse drag is doing

  // Screen position → 3840×2160 design position.
  function toDesign(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * YOUTUBE.width, y: ((e.clientY - r.top) / r.height) * YOUTUBE.height };
  }
  // How many design units one screen pixel covers right now.
  function unitsPerPx() {
    return YOUTUBE.width / canvas.getBoundingClientRect().width;
  }

  function selectedLayer() {
    return getLayers().find((l) => l.id === getSelectedId());
  }

  // Which corner handle (if any) of the selected layer is under the mouse?
  function handleAt(p) {
    const layer = selectedLayer();
    if (!layer || layer.fill) return null;
    const half = (HANDLE_PX * unitsPerPx()) / 2 + 4 * unitsPerPx(); // a little extra grab room
    for (const [name, c] of Object.entries(corners(layerBounds(layer)))) {
      if (Math.abs(p.x - c.x) <= half && Math.abs(p.y - c.y) <= half) return name;
    }
    return null;
  }

  // Front-most layer under the mouse. "Fill background" images can't be
  // dragged, so clicks pass through them.
  function layerAt(p) {
    const layers = getLayers();
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      if (l.fill) continue;
      const b = layerBounds(l);
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return l;
    }
    return null;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const p = toDesign(e);
    const handle = handleAt(p);
    if (handle) {
      const layer = selectedLayer();
      const b = layerBounds(layer);
      drag = { mode: 'resize', layer, handle, anchor: corners(b)[OPPOSITE[handle]], start: { ...b }, size: layer.size };
    } else {
      const layer = layerAt(p);
      select(layer ? layer.id : null);
      if (layer) drag = { mode: 'move', layer, dx: p.x - layer.x, dy: p.y - layer.y };
    }
    if (drag) canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = toDesign(e);
    if (!drag) {
      // Show the right mouse pointer for what a drag would do.
      const h = handleAt(p);
      canvas.style.cursor = h ? (h === 'nw' || h === 'se' ? 'nwse-resize' : 'nesw-resize') : layerAt(p) ? 'move' : 'default';
      return;
    }
    const l = drag.layer;
    if (drag.mode === 'move') {
      l.x = Math.round(p.x - drag.dx);
      l.y = Math.round(p.y - drag.dy);
    } else {
      // Scale by however far the mouse is from the fixed opposite corner,
      // using the larger of the two directions so proportions stay locked.
      const s = drag.start;
      const scale = Math.max(Math.abs(p.x - drag.anchor.x) / s.w, Math.abs(p.y - drag.anchor.y) / s.h, MIN_SIZE / Math.min(s.w, s.h));
      const w = s.w * scale;
      const h = s.h * scale;
      // New top-left, keeping the opposite corner where it was.
      const x = drag.handle.includes('w') ? drag.anchor.x - w : drag.anchor.x;
      const y = drag.handle.includes('n') ? drag.anchor.y - h : drag.anchor.y;
      if (l.type === 'text') {
        l.size = Math.round(drag.size * scale);
      } else {
        l.w = Math.round(w);
        l.h = Math.round(h);
      }
      l.x = Math.round(x);
      l.y = Math.round(y);
    }
    changed({ live: true });
  });

  function endDrag(e) {
    if (!drag) return;
    drag = null;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    changed({ live: false });
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
}

// Draw the selection box and its four corner handles on top of the preview.
// (Only on screen; never in exports.)
export function drawSelection(canvas, layer) {
  if (!layer) return;
  const ctx = canvas.getContext('2d');
  const scale = canvas.width / YOUTUBE.width;
  const dpr = canvas.width / canvas.getBoundingClientRect().width || 1;
  const b = layerBounds(layer);
  ctx.save();
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 2 * dpr;
  ctx.strokeRect(b.x * scale, b.y * scale, b.w * scale, b.h * scale);
  if (!layer.fill) {
    const size = HANDLE_PX * dpr;
    ctx.fillStyle = '#ffffff';
    for (const c of Object.values(corners(b))) {
      ctx.fillRect(c.x * scale - size / 2, c.y * scale - size / 2, size, size);
      ctx.strokeRect(c.x * scale - size / 2, c.y * scale - size / 2, size, size);
    }
  }
  ctx.restore();
}
