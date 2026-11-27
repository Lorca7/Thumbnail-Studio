// Mouse handling on the canvas:
//   click a layer to select it, drag to move it (snaps to the center and
//   edges of the frame; hold Option to move freely), drag a corner handle
//   to resize it (proportions always kept), drag the round handle above it
//   to rotate (snaps to straight angles; hold Shift for 15° steps).
// Locked layers can't be moved / resized.
//
// The editor doesn't own the design; it's given functions to read the
// current layers and to report changes back (see views/editor-view.js).

import { W, H, layerBounds } from './render.js';

const HANDLE_PX = 12; // corner handle size on screen, in CSS pixels
const ROTATE_PX = 36; // distance of the rotate handle above the layer
const SNAP_PX = 8; // how close (on screen) before snapping kicks in
const MIN_SIZE = 30; // smallest a layer can be resized to, in 3840×2160 units

const SIGNS = { nw: [-1, -1], ne: [1, -1], sw: [-1, 1], se: [1, 1] };

const rad = (deg) => (deg * Math.PI) / 180;
function rotate(p, deg) {
  const a = rad(deg);
  return { x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) };
}

const canMove = (l) => !l.locks?.position && !(l.type === 'image' && l.fill);
const canResize = (l) => !l.locks?.size && !(l.type === 'image' && l.fill);

export function attachEditor(canvas, api) {
  // api: { getLayers, getSelectedId, select, changed({ live }), naturalSize(layer) }
  let drag = null; // what the current mouse drag is doing
  let guides = []; // snap guide lines to draw: [{ x } | { y }]

  // Screen position → 3840×2160 design position.
  function toDesign(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }
  // How many design units one screen pixel covers right now.
  const unitsPerPx = () => W / canvas.getBoundingClientRect().width;

  const selectedLayer = () => api.getLayers().find((l) => l.id === api.getSelectedId()) || null;

  // A point in the layer's own (unrotated) frame, relative to its center.
  function toLocal(layer, p) {
    const b = layerBounds(layer);
    const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    return { local: rotate({ x: p.x - c.x, y: p.y - c.y }, -(layer.rotation || 0)), b, c };
  }

  // Which handle of the selected layer is under the mouse: 'nw'…'se', 'rotate' or null.
  function handleAt(p) {
    const layer = selectedLayer();
    if (!layer || !canResize(layer)) return null;
    const { local, b } = toLocal(layer, p);
    const grab = (HANDLE_PX / 2 + 5) * unitsPerPx();
    // On small layers the handles would cover everything, so inside the
    // layer they only reach a quarter of the way in (the rest drags/moves).
    const inner = Math.min(grab, b.w / 4, b.h / 4);
    for (const [name, [sx, sy]] of Object.entries(SIGNS)) {
      const dx = local.x - (sx * b.w) / 2;
      const dy = local.y - (sy * b.h) / 2;
      const reachX = dx * sx >= 0 ? grab : inner; // outside the edge: full reach; inside: limited
      const reachY = dy * sy >= 0 ? grab : inner;
      if (Math.abs(dx) <= reachX && Math.abs(dy) <= reachY) return name;
    }
    if (!layer.locks?.position) {
      const ry = -b.h / 2 - ROTATE_PX * unitsPerPx();
      if (Math.hypot(local.x, local.y - ry) <= grab + 2 * unitsPerPx()) return 'rotate';
    }
    return null;
  }

  function inside(layer, p) {
    const { local, b } = toLocal(layer, p);
    return Math.abs(local.x) <= b.w / 2 && Math.abs(local.y) <= b.h / 2;
  }

  // Front-most layer under the mouse. Hidden layers are skipped. A
  // "fill background" image is only picked if nothing else is there.
  function layerAt(p) {
    const layers = api.getLayers();
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      if (l.hidden || (l.type === 'image' && l.fill)) continue;
      if (inside(l, p)) return l;
    }
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      if (!l.hidden && l.type === 'image' && l.fill) return l;
    }
    return null;
  }

  // Snap a moving box to the frame's edges and center lines.
  function snap(b) {
    const t = SNAP_PX * unitsPerPx();
    let best = { dx: null, dy: null };
    guides = [];
    for (const target of [0, W / 2, W]) {
      for (const edge of [b.x, b.x + b.w / 2, b.x + b.w]) {
        const d = target - edge;
        if (Math.abs(d) <= t && (best.dx === null || Math.abs(d) < Math.abs(best.dx))) best = { ...best, dx: d, gx: target };
      }
    }
    for (const target of [0, H / 2, H]) {
      for (const edge of [b.y, b.y + b.h / 2, b.y + b.h]) {
        const d = target - edge;
        if (Math.abs(d) <= t && (best.dy === null || Math.abs(d) < Math.abs(best.dy))) best = { ...best, dy: d, gy: target };
      }
    }
    if (best.dx !== null) guides.push({ x: best.gx });
    if (best.dy !== null) guides.push({ y: best.gy });
    return { dx: best.dx || 0, dy: best.dy || 0 };
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const p = toDesign(e);
    const handle = handleAt(p);
    const layer = handle ? selectedLayer() : layerAt(p);
    if (!handle) api.select(layer ? layer.id : null);
    if (!layer) return;
    const b = layerBounds(layer);
    const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    if (handle === 'rotate') {
      drag = { mode: 'rotate', layer, c };
    } else if (handle) {
      drag = { mode: 'resize', layer, handle, b, c, size: layer.size, rotation: layer.rotation || 0 };
    } else if (canMove(layer)) {
      drag = { mode: 'move', layer, dx: p.x - layer.x, dy: p.y - layer.y };
    }
    if (drag) canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = toDesign(e);
    if (!drag) {
      // Show the right mouse pointer for what a drag would do.
      const h = handleAt(p);
      const over = layerAt(p);
      canvas.style.cursor = h === 'rotate' ? 'grab' : h ? 'crosshair' : over && canMove(over) ? 'move' : 'default';
      return;
    }
    const l = drag.layer;
    if (drag.mode === 'move') {
      l.x = p.x - drag.dx;
      l.y = p.y - drag.dy;
      if (!e.altKey) {
        const s = snap(layerBounds(l));
        l.x += s.dx;
        l.y += s.dy;
      } else {
        guides = [];
      }
      l.x = Math.round(l.x);
      l.y = Math.round(l.y);
    } else if (drag.mode === 'rotate') {
      let deg = (Math.atan2(p.y - drag.c.y, p.x - drag.c.x) * 180) / Math.PI + 90;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      else {
        const straight = Math.round(deg / 90) * 90;
        if (Math.abs(deg - straight) < 4) deg = straight; // snap to straight angles
      }
      deg = ((deg + 540) % 360) - 180; // keep between -180 and 180
      l.rotation = Math.round(deg * 10) / 10;
    } else {
      resize(drag, p);
    }
    api.changed({ live: true });
  });

  // Resize around the opposite corner, keeping proportions (works for rotated layers too).
  function resize(d, p) {
    const l = d.layer;
    const { b, c } = d;
    const [sx, sy] = SIGNS[d.handle];
    const q = rotate({ x: p.x - c.x, y: p.y - c.y }, -d.rotation); // pointer in the layer's own frame
    const a = { x: (-sx * b.w) / 2, y: (-sy * b.h) / 2 }; // the corner that stays put
    let s = Math.max(Math.abs(q.x - a.x) / b.w, Math.abs(q.y - a.y) / b.h, MIN_SIZE / Math.min(b.w, b.h));
    // Pixel-art mode: only whole-number scale factors (1×, 2×, 3×…) of the original pixels.
    const nat = l.type === 'image' && l.pixelArt ? api.naturalSize(l) : null;
    if (nat) s = (Math.max(1, Math.round((b.w * s) / nat.w)) * nat.w) / b.w;
    const w = b.w * s;
    const h = b.h * s;
    const centerLocal = { x: a.x + (sx * w) / 2, y: a.y + (sy * h) / 2 };
    const center = rotate(centerLocal, d.rotation);
    const cx = c.x + center.x;
    const cy = c.y + center.y;
    if (l.type === 'text') {
      l.size = Math.max(10, Math.round(d.size * s));
      const nb = layerBounds({ ...l, x: 0, y: 0 });
      l.x = Math.round(cx - nb.w / 2);
      l.y = Math.round(cy - nb.h / 2);
    } else {
      l.w = Math.round(w);
      l.h = Math.round(h);
      l.x = Math.round(cx - w / 2);
      l.y = Math.round(cy - h / 2);
    }
  }

  function endDrag(e) {
    if (!drag) return;
    drag = null;
    guides = [];
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    api.changed({ live: false });
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  return { guides: () => guides };
}

// Draw the selection box, handles and snap guides on top of the preview.
// (Only on screen; never in exports.)
export function drawSelection(canvas, layer, guides = []) {
  const ctx = canvas.getContext('2d');
  const scale = canvas.width / W;
  const dpr = canvas.width / (canvas.getBoundingClientRect().width || canvas.width);
  ctx.save();
  // Snap guides: thin magenta lines across the frame.
  ctx.strokeStyle = '#ec4899';
  ctx.lineWidth = 1.5 * dpr;
  for (const g of guides) {
    ctx.beginPath();
    if (g.x !== undefined) { ctx.moveTo(g.x * scale, 0); ctx.lineTo(g.x * scale, canvas.height); }
    else { ctx.moveTo(0, g.y * scale); ctx.lineTo(canvas.width, g.y * scale); }
    ctx.stroke();
  }
  if (layer) {
    const b = layerBounds(layer);
    const cx = (b.x + b.w / 2) * scale;
    const cy = (b.y + b.h / 2) * scale;
    const w = b.w * scale;
    const h = b.h * scale;
    ctx.translate(cx, cy);
    ctx.rotate(rad(layer.rotation || 0));
    const locked = layer.locks?.position && layer.locks?.size;
    ctx.strokeStyle = locked ? '#f59e0b' : '#3b82f6';
    ctx.lineWidth = 2 * dpr;
    ctx.setLineDash(locked ? [6 * dpr, 4 * dpr] : []);
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.setLineDash([]);
    if (canResize(layer)) {
      const size = HANDLE_PX * dpr;
      ctx.fillStyle = '#ffffff';
      for (const [sx, sy] of Object.values(SIGNS)) {
        ctx.fillRect((sx * w) / 2 - size / 2, (sy * h) / 2 - size / 2, size, size);
        ctx.strokeRect((sx * w) / 2 - size / 2, (sy * h) / 2 - size / 2, size, size);
      }
      if (!layer.locks?.position) {
        const ry = -h / 2 - ROTATE_PX * dpr;
        ctx.beginPath();
        ctx.moveTo(0, -h / 2);
        ctx.lineTo(0, ry);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, ry, (HANDLE_PX / 2 + 1) * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}
