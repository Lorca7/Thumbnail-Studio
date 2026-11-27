// The Editor: canvas, layers, the selected layer's settings, variants (A/B/C)
// and export. Works on a design, or on a template (then images are empty
// "slots" to be filled in later, and there's no export).

import { $, escapeHtml, uid, clone, formatBytes, toArrayBuffer, isPngOrJpg } from '../util.js';
import {
  state, on, emit, variant, layers, selected, commit, undo, redo, canUndo, canRedo,
  pictureFor, designPath, defaultTextLayer, STYLE_FIELDS, DEFAULT_LOCKS, applyCornerMark, addLayer,
  syncTemplateList, saveBrand, saveNow,
} from '../store.js';
import { renderVariant, renderThumb, layerBounds, outerBounds, overlaps, containRect, TIMESTAMP_ZONE, W, H } from '../render.js';
import { attachEditor, drawSelection } from '../editor.js';
import { exportAll } from '../export.js';
import { allFonts, putBitmap, bitmap } from '../assets.js';
import { YOUTUBE } from '../youtube-rules.js';
import { ask, colorField, confirmBox } from '../ui.js';

const canvas = $('preview');
let editor;
let bgField;
let propsKey; // which layer the settings panel was built for
let bindings = []; // settings-panel fields and how they read/write the layer
let colorFields = [];

const isDesign = () => state.kind === 'design';
const isFill = (l) => l.type === 'image' && l.fill;

// Make a change permanent: undo step + autosave (+ keep the template list current).
function save() {
  commit();
  syncTemplateList();
}

// The options the renderer needs to find pictures.
const renderOpts = () => ({ picture: (l) => pictureFor(l) });

// --- Drawing ---------------------------------------------------------------------

function fitCanvas() {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(320, Math.round(r.width * dpr));
  if (canvas.width !== w) {
    canvas.width = w;
    canvas.height = Math.round((w * H) / W);
  }
}

// Show where YouTube's video-length badge sits (on screen only).
function drawTimestampZone() {
  const ctx = canvas.getContext('2d');
  const s = canvas.width / W;
  const z = TIMESTAMP_ZONE;
  ctx.save();
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.9)';
  ctx.lineWidth = 6;
  ctx.setLineDash([30, 20]);
  ctx.strokeRect(z.x, z.y, z.w, z.h);
  ctx.setLineDash([]);
  // A badge like YouTube's, for scale.
  const bw = 330, bh = 150;
  const bx = W - bw - 50, by = H - bh - 50;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 24);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 100px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('12:34', bx + bw / 2, by + bh / 2 + 4);
  ctx.restore();
}

function redraw() {
  if (!state.doc || $('view-editor').hidden) return;
  if ($('compare-toggle').checked && isDesign()) return drawCompare();
  fitCanvas();
  renderVariant(canvas, variant(), renderOpts());
  if ($('zone-toggle').checked) drawTimestampZone();
  drawSelection(canvas, selected(), editor.guides());
  $('drop-hint').classList.toggle('show', layers().length === 0);
}

// All variants next to each other; click one to edit it.
function drawCompare() {
  const grid = $('compare-grid');
  grid.innerHTML = '';
  state.doc.variants.forEach((v, i) => {
    const cell = document.createElement('button');
    cell.className = `compare-cell${i === state.variantIndex ? ' on' : ''}`;
    const c = document.createElement('canvas');
    c.width = 960; c.height = 540;
    renderThumb(c, v, renderOpts());
    cell.append(c, Object.assign(document.createElement('span'), { textContent: `Variant ${v.id}` }));
    cell.addEventListener('click', () => {
      state.variantIndex = i;
      state.selectedId = null;
      $('compare-toggle').checked = false;
      refresh();
    });
    grid.append(cell);
  });
}

// --- Whole-panel refresh -----------------------------------------------------------

export function refresh() {
  const has = !!state.doc;
  $('editor-empty').hidden = has;
  $('editor-main').hidden = !has;
  $('stage').classList.toggle('disabled', !has);
  if (!has) { $('doc-title').textContent = ''; return; }

  $('doc-title').textContent = isDesign() ? `Design: ${state.doc.name}` : `Template: ${state.doc.name}`;
  $('template-head').hidden = isDesign();
  if (!isDesign() && document.activeElement !== $('template-name')) $('template-name').value = state.doc.name;
  bgField.set(variant().background.color);
  bgField.refreshSwatches();

  const cm = state.brand.cornerMark;
  $('corner-mark-toggle').checked = !!state.doc.cornerMark;
  $('corner-mark-note').textContent = cm.enabled ? '' : '(set it up in Brand kit)';
  $('add-image-btn').textContent = isDesign() ? 'Image…' : 'Slot';

  // Variants (designs only)
  $('variant-bar').classList.toggle('template-mode', !isDesign());
  if (isDesign()) {
    $('variant-tabs').innerHTML = state.doc.variants.map((v, i) =>
      `<button data-i="${i}" class="${i === state.variantIndex ? 'on' : ''}">${v.id}</button>`).join('');
    $('dup-variant-btn').disabled = state.doc.variants.length >= YOUTUBE.maxVariants;
    $('del-variant-btn').disabled = state.doc.variants.length <= 1;
  }
  const comparing = $('compare-toggle').checked && isDesign();
  $('canvas-wrap').hidden = comparing;
  $('compare-grid').hidden = !comparing;
  $('undo-btn').disabled = !canUndo();
  $('redo-btn').disabled = !canRedo();
  $('export-bar').hidden = !isDesign();

  renderLayerList();
  renderProps();
  renderWarnings();
  redraw();
}

// --- Layer list ----------------------------------------------------------------------

function layerName(l) {
  if (l.slot) return l.slot;
  if (l.type === 'text') return (l.text || '(empty text)').split('\n')[0];
  if (l.type === 'logo') return state.brand.logos.find((x) => x.id === l.logoId)?.name || 'Logo';
  return l.name || 'Image';
}

function layerIcon(l) {
  return { text: 'T', logo: '◎', image: l.fill ? '▤' : '▣' }[l.type] || '?';
}

function renderLayerList() {
  const items = [...layers()].reverse(); // front-most first
  $('layer-list').innerHTML = items.length
    ? items.map((l) => {
      const locked = l.locks && (l.locks.position || l.locks.size || l.locks.style);
      return `<li data-id="${l.id}" class="${l.id === state.selectedId ? 'selected' : ''}${l.hidden ? ' is-hidden' : ''}">
        <button class="eye" data-eye="${l.id}" title="${l.hidden ? 'Show' : 'Hide'}">${l.hidden ? '◌' : '●'}</button>
        <span class="kind">${layerIcon(l)}</span><span class="name">${escapeHtml(layerName(l))}</span>
        ${locked ? '<span class="lock" title="Has locks">🔒</span>' : ''}
        ${l.type === 'image' && !l.file ? '<span class="tag">empty</span>' : ''}
      </li>`;
    }).join('')
    : '<li class="empty">No layers yet: add an image, text or logo.</li>';
  const sel = selected();
  const i = sel ? layers().indexOf(sel) : -1;
  const floor = layers().filter(isFill).length; // backgrounds stay at the back
  $('forward-btn').disabled = !sel || isFill(sel) || i >= layers().length - 1;
  $('back-btn').disabled = !sel || isFill(sel) || i <= floor;
  $('delete-btn').disabled = !sel;
}

function select(id) {
  state.selectedId = id;
  refresh();
}

// --- Settings for the selected layer -----------------------------------------------

function numberField(id, label, attrs = '') {
  return `<label class="inline">${label} <input id="${id}" type="number" ${attrs}></label>`;
}

function renderProps() {
  const l = selected();
  const key = l ? `${l.id}:${l.type}:${state.kind}` : null;
  if (key !== propsKey) buildProps(l);
  propsKey = key;
  updateProps();
}

function buildProps(l) {
  const box = $('layer-props');
  bindings = [];
  colorFields = [];
  if (!l) { box.innerHTML = '<p class="muted small">Select a layer to change it.</p>'; return; }

  let h = '';
  h += `<label class="field"><span>Slot name ${isDesign() ? '<small class="muted">(optional)</small>' : ''}</span><input id="p-slot" type="text" placeholder="e.g. Main image, Title" autocomplete="off"></label>`;
  h += `<div class="locks"><span>Lock</span>
    <label><input type="checkbox" id="p-lock-position"> Position</label>
    <label><input type="checkbox" id="p-lock-size"> Size</label>
    <label><input type="checkbox" id="p-lock-style"> Style</label></div>`;
  h += `<div class="row">${numberField('p-rot', 'Rotation °', 'step="1" min="-180" max="180"')}</div>`;

  if (l.type === 'image') {
    h += `<div class="row">
      ${isDesign() ? `<button id="p-choose">${l.file ? 'Replace picture…' : 'Choose picture…'}</button>` : '<p class="muted small">In a design, drop a picture onto this slot.</p>'}
    </div>
    <label class="check"><input id="p-fill" type="checkbox"> Fill background <small class="muted">(covers the frame, cropped to fit)</small></label>
    <label class="check"><input id="p-pixel" type="checkbox"> Pixel-art mode <small class="muted" id="p-pixel-note"></small></label>`;
  }
  if (l.type === 'logo') {
    h += `<label class="field"><span>Logo</span><select id="p-logo">${state.brand.logos.map((g) => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('')}</select></label>`;
    if (l.role === 'cornerMark') h += '<p class="muted small">This is your corner mark. While position and size are locked, it follows the Brand kit settings.</p>';
  }
  if (l.type === 'text') {
    const fonts = allFonts(state.brand);
    h += `<label class="field"><span>Text <small class="muted">(Return for a new line)</small></span><textarea id="p-text" rows="2"></textarea></label>
      <div class="row">
        <label class="inline grow">Style <select id="p-style"><option value="">Custom</option>${state.brand.textStyles.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('')}</select></label>
        <button id="p-save-style" title="Save these settings as a text style in your Brand kit">Save style…</button>
      </div>
      <label class="field"><span>Font</span><select id="p-font" class="style-field">${fonts.map((f) => `<option value="${escapeHtml(f.family)}">${escapeHtml(f.name)}</option>`).join('')}</select></label>
      <div class="row">${numberField('p-size', 'Size', 'min="10" max="3000" step="10" class="style-field"')}
        <label class="inline">Align <select id="p-align" class="style-field"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label></div>
      <div class="field"><span>Color</span><span id="p-color"></span></div>
      <div class="field"><span>Outline</span><div class="row">${numberField('p-outline-w', 'Width', 'min="0" max="200" step="1" class="style-field"')}<span id="p-outline-c"></span></div></div>
      <div class="field"><span>Shadow</span><div class="row">${numberField('p-shadow-b', 'Blur', 'min="0" max="300" step="1" class="style-field"')}
        ${numberField('p-shadow-x', 'X', 'min="-300" max="300" step="1" class="style-field"')}${numberField('p-shadow-y', 'Y', 'min="-300" max="300" step="1" class="style-field"')}</div><span id="p-shadow-c"></span></div>
      <div class="row"><label class="check"><input id="p-caps" type="checkbox" class="style-field"> All caps</label>
        ${numberField('p-ls', 'Letter spacing', 'min="-100" max="400" step="1" class="style-field"')}</div>`;
  }
  box.innerHTML = h;

  // How each field reads from / writes to the layer.
  const lockBind = (k) => bind(`p-lock-${k}`, 'check', (x) => !!x.locks?.[k], (x, v) => { x.locks = { ...DEFAULT_LOCKS(), ...x.locks, [k]: v }; });
  bind('p-slot', 'text', (x) => x.slot || '', (x, v) => { x.slot = v.trim() || undefined; });
  ['position', 'size', 'style'].forEach(lockBind);
  bind('p-rot', 'number', (x) => x.rotation || 0, (x, v) => { x.rotation = Math.max(-180, Math.min(180, v)); }, { shape: true });

  if (l.type === 'image') {
    bind('p-fill', 'check', (x) => !!x.fill, (x, v) => setFill(x, v), { shape: true });
    bind('p-pixel', 'check', (x) => !!x.pixelArt, (x, v) => setPixelArt(x, v), { style: true });
    $('p-choose')?.addEventListener('click', async () => {
      const files = await window.studio.chooseFiles('image');
      if (files.length) await importFiles(files.slice(0, 1), { target: selected() });
    });
  }
  if (l.type === 'logo') {
    bind('p-logo', 'select', (x) => x.logoId, (x, v) => {
      x.logoId = v;
      const img = bitmap(state.brand.logos.find((g) => g.id === v)?.file);
      if (img) x.h = Math.round((x.w * img.height) / img.width);
    }, { style: true });
  }
  if (l.type === 'text') {
    bind('p-text', 'text', (x) => x.text, (x, v) => { x.text = v; });
    bind('p-style', 'select', (x) => x.styleId || '', (x, v) => applyStyle(x, v), { style: true, keepStyle: true });
    bind('p-font', 'select', (x) => x.font, (x, v) => { x.font = v; }, { style: true });
    bind('p-size', 'number', (x) => x.size, (x, v) => { if (v >= 10) x.size = v; }, { style: true });
    bind('p-align', 'select', (x) => x.align || 'left', (x, v) => { x.align = v; }, { style: true });
    bind('p-outline-w', 'number', (x) => x.outline?.width || 0, (x, v) => { x.outline = { ...x.outline, width: Math.max(0, v) }; }, { style: true });
    bind('p-shadow-b', 'number', (x) => x.shadow?.blur || 0, (x, v) => { x.shadow = { ...x.shadow, blur: Math.max(0, v) }; }, { style: true });
    bind('p-shadow-x', 'number', (x) => x.shadow?.x || 0, (x, v) => { x.shadow = { ...x.shadow, x: v }; }, { style: true });
    bind('p-shadow-y', 'number', (x) => x.shadow?.y || 0, (x, v) => { x.shadow = { ...x.shadow, y: v }; }, { style: true });
    bind('p-caps', 'check', (x) => !!x.allCaps, (x, v) => { x.allCaps = v; }, { style: true });
    bind('p-ls', 'number', (x) => x.letterSpacing || 0, (x, v) => { x.letterSpacing = v; }, { style: true });
    colorBind('p-color', (x) => x.color, (x, v) => { x.color = v; });
    colorBind('p-outline-c', (x) => x.outline?.color || '#000000', (x, v) => { x.outline = { ...x.outline, color: v }; });
    colorBind('p-shadow-c', (x) => x.shadow?.color || '#000000', (x, v) => { x.shadow = { ...x.shadow, color: v }; });
    $('p-save-style').addEventListener('click', saveStyleFromLayer);
  }
}

// Connect one settings field to the selected layer.
function bind(id, type, get, set, opts = {}) {
  const el = $(id);
  if (!el) return;
  bindings.push({ el, type, get, opts });
  const read = () => (type === 'check' ? el.checked : type === 'number' ? Number(el.value) : el.value);
  const apply = () => {
    const l = selected();
    if (!l) return;
    if (type === 'number' && !Number.isFinite(read())) return;
    set(l, read());
    if (opts.style && !opts.keepStyle) l.styleId = null; // edited by hand: no longer a saved style
  };
  if (type === 'check' || type === 'select') {
    el.addEventListener('change', () => { apply(); save(); });
  } else {
    el.addEventListener('input', () => { apply(); redraw(); renderLayerList(); renderWarnings(); });
    el.addEventListener('change', () => save());
  }
}

function colorBind(id, get, set) {
  const field = colorField($(id), (hex, final) => {
    const l = selected();
    if (!l) return;
    set(l, hex);
    l.styleId = null;
    if (final) save(); else redraw();
  });
  colorFields.push({ field, get });
}

// Put the layer's current values into the fields (skipping the one being typed in),
// and grey out what's locked.
function updateProps() {
  const l = selected();
  if (!l) return;
  const styleLocked = !!l.locks?.style;
  for (const b of bindings) {
    if (b.el !== document.activeElement) {
      if (b.type === 'check') b.el.checked = b.get(l);
      else b.el.value = b.get(l);
    }
    if (b.opts.style) b.el.disabled = styleLocked;
    if (b.opts.shape) b.el.disabled = (b.el.id === 'p-rot' && (l.locks?.position || l.locks?.size)) || (b.el.id === 'p-fill' && !!l.locks?.size);
  }
  for (const c of colorFields) { c.field.set(c.get(l)); c.field.refreshSwatches(); c.field.setDisabled(styleLocked); }
  const pixelNote = $('p-pixel-note');
  if (pixelNote) {
    const img = pictureFor(l);
    pixelNote.textContent = l.pixelArt && img ? `(${Math.round(l.w / img.width)}× scale, sharp pixels)` : '(sharp pixels, whole-number scaling)';
  }
}

function setFill(l, on) {
  l.fill = on;
  if (on) {
    // Backgrounds go to the back, and only one image fills the frame.
    for (const other of layers()) if (other !== l && isFill(other)) other.fill = false;
    layers().splice(layers().indexOf(l), 1);
    layers().unshift(l);
  }
}

function setPixelArt(l, on) {
  l.pixelArt = on;
  const img = pictureFor(l);
  if (on && img && !l.fill) {
    // Snap to a whole-number multiple of the picture's real pixels, keeping the center.
    const k = Math.max(1, Math.round(l.w / img.width));
    const cx = l.x + l.w / 2;
    const cy = l.y + l.h / 2;
    l.w = img.width * k;
    l.h = img.height * k;
    l.x = Math.round(cx - l.w / 2);
    l.y = Math.round(cy - l.h / 2);
  }
}

function applyStyle(l, styleId) {
  l.styleId = styleId || null;
  const st = state.brand.textStyles.find((s) => s.id === styleId);
  if (st) for (const f of STYLE_FIELDS) if (st[f] !== undefined) l[f] = clone(st[f]);
}

async function saveStyleFromLayer() {
  const l = selected();
  const answer = await ask('Save text style', [{ name: 'name', label: 'Style name', value: 'My style', required: true }], 'Save');
  if (!answer) return;
  const style = { id: uid('style'), name: answer.name.trim() || 'Style' };
  for (const f of STYLE_FIELDS) style[f] = clone(l[f]);
  state.brand.textStyles.push(style);
  saveBrand();
  l.styleId = style.id;
  propsKey = undefined; // rebuild so the new style shows in the list
  save();
}

// --- Warnings under the canvas ----------------------------------------------------

function renderWarnings() {
  const out = [];
  for (const l of layers()) {
    if (l.hidden || isFill(l) || (l.type === 'image' && !l.file && isDesign())) continue;
    if (overlaps(outerBounds(l), TIMESTAMP_ZONE)) {
      out.push(`⚠ “${escapeHtml(layerName(l))}” is in the bottom-right corner, where YouTube shows the video length.`);
    }
  }
  if (isDesign()) {
    for (const l of layers()) {
      if (l.type === 'image' && !l.file && !l.hidden) out.push(`Empty slot “${escapeHtml(layerName(l))}”: drop a picture on it (empty slots are left out of exports).`);
      if ((l.type === 'image' && l.file) && !pictureFor(l)) out.push(`Picture missing: ${escapeHtml(l.file)}`);
    }
  }
  $('warnings').innerHTML = out.map((t) => `<div class="${t.startsWith('⚠') ? 'warn' : 'muted'}">${t}</div>`).join('');
}

// --- Adding layers -----------------------------------------------------------------

// The empty image slot under a point, if any.
function emptySlotAt(p) {
  for (const l of [...layers()].reverse()) {
    if (l.type !== 'image' || l.file || l.hidden) continue;
    const b = layerBounds(l);
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return l;
  }
  return null;
}

// Turn picked or dropped files ({ name, bytes }) into image layers, or fill
// an empty slot. opts.target = layer to fill; opts.point = where they were dropped.
async function importFiles(files, opts = {}) {
  if (!isDesign()) { setStatus('<span class="error">Pictures go into designs. In a template, add an image slot instead.</span>'); return; }
  const skipped = [];
  let target = opts.target || (opts.point ? emptySlotAt(opts.point) : null) || (selected()?.type === 'image' && !selected().file ? selected() : null);
  for (const { name, bytes } of files) {
    const buf = toArrayBuffer(bytes);
    if (!isPngOrJpg(buf)) { skipped.push(name); continue; }
    try {
      const saved = await window.studio.importFile(designPath(state.doc.slug, 'images'), name, buf);
      const img = await putBitmap(saved.path, buf);
      const file = saved.path.replace(`designs/${state.doc.slug}/`, '');
      if (target) {
        // Fill the slot: fit the picture inside the slot's box, centered.
        target.file = file;
        target.name = name;
        if (!target.fill) {
          const box = target.box || { x: target.x, y: target.y, w: target.w, h: target.h };
          target.box = box;
          Object.assign(target, roundBox(containRect(img.width, img.height, box)));
        }
        state.selectedId = target.id;
        target = null; // further files become new layers
      } else {
        // New layer at the picture's own size, shrunk to fit 80% of the frame,
        // centered where it was dropped (or in the middle).
        const fit = Math.min(1, (W * 0.8) / img.width, (H * 0.8) / img.height);
        const w = Math.round(img.width * fit);
        const h = Math.round(img.height * fit);
        const c = opts.point || { x: W / 2, y: H / 2 };
        const x = Math.round(Math.min(Math.max(c.x - w / 2, 0), W - w));
        const y = Math.round(Math.min(Math.max(c.y - h / 2, 0), H - h));
        addLayer({ id: uid('L'), type: 'image', name, file, x, y, w, h, rotation: 0, fill: false, pixelArt: false, hidden: false, locks: DEFAULT_LOCKS() });
      }
    } catch (err) {
      skipped.push(`${name} (${err.message})`);
    }
  }
  save();
  refresh();
  setStatus(skipped.length ? `<span class="error">Not imported: ${escapeHtml(skipped.join(', '))}. Only PNG and JPG files work.</span>` : '');
}

const roundBox = (r) => ({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) });

async function addImage() {
  if (!state.doc) return;
  if (isDesign()) {
    const files = await window.studio.chooseFiles('image');
    if (files.length) await importFiles(files);
    return;
  }
  addLayer({ id: uid('L'), type: 'image', slot: 'Image', file: null, x: 960, y: 540, w: 1920, h: 1080, rotation: 0, fill: false, pixelArt: false, hidden: false, locks: DEFAULT_LOCKS() });
  save();
}

function addText() {
  if (!state.doc) return;
  const layer = defaultTextLayer(isDesign() ? {} : { slot: 'Text' });
  const b = layerBounds(layer);
  layer.x = Math.round((W - b.w) / 2);
  layer.y = Math.round((H - b.h) / 2);
  addLayer(layer);
  save();
  $('p-text')?.focus();
  $('p-text')?.select();
}

function addLogo() {
  if (!state.doc) return;
  const logo = state.brand.logos[0];
  if (!logo) { setStatus('<span class="error">Add a logo in the Brand kit first.</span>'); return; }
  const img = bitmap(logo.file);
  const w = 600;
  const h = img ? Math.round((w * img.height) / img.width) : w;
  addLayer({ id: uid('L'), type: 'logo', logoId: logo.id, x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h, rotation: 0, hidden: false, locks: DEFAULT_LOCKS() });
  save();
}

// --- Arranging and deleting ---------------------------------------------------------

function move(step) {
  const l = selected();
  if (!l || isFill(l)) return;
  const list = layers();
  const i = list.indexOf(l);
  const j = i + step;
  if (j < list.filter(isFill).length || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  save();
}

function deleteSelected() {
  const l = selected();
  if (!l) return;
  layers().splice(layers().indexOf(l), 1);
  state.selectedId = null;
  save();
}

function nudge(dx, dy) {
  const l = selected();
  if (!l || l.locks?.position || isFill(l)) return;
  l.x += dx;
  l.y += dy;
  save();
}

// --- Variants ------------------------------------------------------------------------

function duplicateVariant() {
  const used = state.doc.variants.map((v) => v.id);
  const id = ['A', 'B', 'C', 'D', 'E'].find((x) => !used.includes(x));
  if (state.doc.variants.length >= YOUTUBE.maxVariants || !id) return;
  const copy = clone(variant());
  copy.id = id;
  state.doc.variants.push(copy);
  state.variantIndex = state.doc.variants.length - 1;
  save();
}

async function deleteVariant() {
  if (state.doc.variants.length <= 1) return;
  if (!(await confirmBox('Delete variant', `Delete variant ${variant().id}? (Undo brings it back.)`, 'Delete'))) return;
  state.doc.variants.splice(state.variantIndex, 1);
  state.variantIndex = Math.max(0, state.variantIndex - 1);
  state.selectedId = null;
  save();
}

// --- Export -------------------------------------------------------------------------

function setStatus(htmlText) {
  $('status').innerHTML = htmlText;
}

export async function exportDesign() {
  if (!isDesign()) return;
  const btn = $('export-btn');
  btn.disabled = true;
  setStatus('Exporting…');
  try {
    await saveNow();
    const results = await exportAll(state.doc.slug, state.doc.variants, renderOpts());
    const items = results.flatMap((r) => [
      `<li><code>${r.png.name}</code> (${r.png.width}×${r.png.height}, ${formatBytes(r.png.bytes)})</li>`,
      `<li><code>${r.jpg.name}</code> (${r.jpg.width}×${r.jpg.height}, ${formatBytes(r.jpg.bytes)})</li>`,
    ]);
    setStatus(`<span class="ok">Saved ${results.length} variant${results.length > 1 ? 's' : ''} to designs/${state.doc.slug}/exports/</span><ul>${items.join('')}</ul>`);
    emit('exported');
  } catch (err) {
    setStatus(`<span class="error">Export failed: ${escapeHtml(err.message)}</span>`);
  } finally {
    btn.disabled = false;
  }
}

// --- Setup ---------------------------------------------------------------------------

export function initEditor() {
  editor = attachEditor(canvas, {
    getLayers: layers,
    getSelectedId: () => state.selectedId,
    select,
    changed: ({ live }) => {
      if (live) { redraw(); updateProps(); renderWarnings(); } else save();
    },
    naturalSize: (l) => { const img = pictureFor(l); return img ? { w: img.width, h: img.height } : null; },
  });
  new ResizeObserver(() => redraw()).observe(canvas);

  bgField = colorField($('bg-color-row'), (hex, final) => {
    variant().background.color = hex;
    if (final) save(); else redraw();
  });

  $('template-name').addEventListener('input', (e) => { state.doc.name = e.target.value; $('doc-title').textContent = `Template: ${state.doc.name}`; });
  $('template-name').addEventListener('change', () => save());

  $('corner-mark-toggle').addEventListener('change', (e) => {
    state.doc.cornerMark = e.target.checked;
    applyCornerMark(state.doc, state.kind);
    save();
  });
  $('zone-toggle').addEventListener('change', redraw);

  $('add-image-btn').addEventListener('click', addImage);
  $('add-text-btn').addEventListener('click', addText);
  $('add-logo-btn').addEventListener('click', addLogo);
  $('forward-btn').addEventListener('click', () => move(+1));
  $('back-btn').addEventListener('click', () => move(-1));
  $('delete-btn').addEventListener('click', deleteSelected);

  $('layer-list').addEventListener('click', (e) => {
    const eye = e.target.closest('[data-eye]');
    if (eye) {
      const l = layers().find((x) => x.id === eye.dataset.eye);
      if (l) { l.hidden = !l.hidden; save(); }
      return;
    }
    const li = e.target.closest('li[data-id]');
    if (li) select(li.dataset.id);
  });

  $('variant-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    state.variantIndex = Number(b.dataset.i);
    state.selectedId = null;
    refresh();
  });
  $('dup-variant-btn').addEventListener('click', duplicateVariant);
  $('del-variant-btn').addEventListener('click', deleteVariant);
  $('compare-toggle').addEventListener('change', refresh);
  $('undo-btn').addEventListener('click', undo);
  $('redo-btn').addEventListener('click', redo);
  $('export-btn').addEventListener('click', exportDesign);
  $('reveal-btn').addEventListener('click', () => window.studio.reveal(designPath(state.doc.slug, 'exports')).catch(() => {}));

  // Drag and drop pictures onto the canvas (onto an empty slot fills it).
  const stage = $('stage');
  stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('dragging'); });
  stage.addEventListener('dragleave', (e) => { if (!stage.contains(e.relatedTarget)) stage.classList.remove('dragging'); });
  stage.addEventListener('drop', async (e) => {
    e.preventDefault();
    stage.classList.remove('dragging');
    if (!state.doc) return;
    const r = canvas.getBoundingClientRect();
    const point = { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
    const files = await Promise.all([...e.dataTransfer.files].map(async (f) => ({ name: f.name, bytes: await f.arrayBuffer() })));
    await importFiles(files, { point });
  });

  // Keyboard: delete, nudge with arrows, Escape to deselect.
  document.addEventListener('keydown', (e) => {
    if ($('view-editor').hidden || !state.doc) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || $('dialog').open) return;
    const step = e.shiftKey ? 40 : 4;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
    else if (e.key === 'Escape') select(null);
    else if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-step, 0); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); nudge(step, 0); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); nudge(0, -step); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); nudge(0, step); }
  });

  window.studio.onMenu('import', addImage);

  on('doc', () => { propsKey = undefined; refresh(); });
  on('change', refresh);
  on('brand', () => {
    if (state.doc) { applyCornerMark(state.doc, state.kind); commit(); }
    propsKey = undefined;
    refresh();
  });
}

export { redraw as redrawEditor };
