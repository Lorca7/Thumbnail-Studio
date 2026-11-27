// Main page script: connects the panel, the canvas and the design data.

import { renderVariant, layerBounds } from './render.js';
import { attachEditor, drawSelection } from './editor.js';
import { cleanDesignName, exportAll } from './export.js';
import { YOUTUBE } from './youtube-rules.js';

const $ = (id) => document.getElementById(id);
const canvas = $('preview');

// --- The design being edited ---------------------------------------------
// Later steps save this as designs/<name>/design.json; for now it lives in
// memory while the app is open. Imported pictures are copied to disk right
// away (designs/<name>/images/).
const design = {
  name: 'my first thumbnail',
  variants: [{ id: 'A', background: { color: '#1e293b' }, layers: [] }],
};
const images = new Map(); // layer id → decoded picture, for drawing
const originals = new Map(); // layer id → { name, bytes, savedFor }, to re-copy if the design is renamed
let selectedId = null;
let nextId = 1;

const variant = () => design.variants[0];
const layers = () => variant().layers;
const selected = () => layers().find((l) => l.id === selectedId) || null;
const slug = () => cleanDesignName(design.name);

// Let the automated test look at the design (harmless otherwise).
window.__studio = { design, images, selected };

// --- Drawing ---------------------------------------------------------------

// Keep the canvas's pixel size matched to its on-screen size (sharp on Retina).
function fitCanvas() {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(320, Math.round(r.width * dpr));
  if (canvas.width !== w) {
    canvas.width = w;
    canvas.height = Math.round((w * YOUTUBE.height) / YOUTUBE.width);
  }
}

function redraw() {
  fitCanvas();
  renderVariant(canvas, variant(), images);
  drawSelection(canvas, selected());
  $('drop-hint').classList.toggle('show', layers().length === 0); // hint on an empty canvas
}

// Refresh everything: canvas, layer list, and the selected layer's settings.
function refresh() {
  $('design-slug').textContent = slug();
  redraw();
  renderLayerList();
  renderProps();
}

new ResizeObserver(redraw).observe(canvas);

// --- Layer list --------------------------------------------------------------

function layerLabel(l) {
  if (l.type === 'text') return `<span class="kind">T</span>${escapeHtml(l.text || '(empty)')}`;
  return `<span class="kind">▣</span>${escapeHtml(l.name)}${l.fill ? ' (background)' : ''}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function renderLayerList() {
  const list = $('layer-list');
  const items = [...layers()].reverse(); // front-most first
  list.innerHTML = items.length
    ? items.map((l) => `<li data-id="${l.id}" class="${l.id === selectedId ? 'selected' : ''}">${layerLabel(l)}</li>`).join('')
    : '<li class="empty">No layers yet: import an image or add text.</li>';
  const sel = selected();
  const i = sel ? layers().indexOf(sel) : -1;
  const floor = layers()[0]?.fill ? 1 : 0; // nothing goes below a background fill
  $('forward-btn').disabled = !sel || sel.fill || i >= layers().length - 1;
  $('back-btn').disabled = !sel || sel.fill || i <= floor;
  $('delete-btn').disabled = !sel;
  $('add-text-btn').disabled = layers().some((l) => l.type === 'text'); // one text layer for now
}

$('layer-list').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-id]');
  if (li) select(li.dataset.id);
});

function select(id) {
  selectedId = id;
  refresh();
}

// --- Selected layer settings -------------------------------------------------

function renderProps() {
  const l = selected();
  $('image-props').hidden = !(l && l.type === 'image');
  $('text-props').hidden = !(l && l.type === 'text');
  if (l?.type === 'image') $('fill-bg').checked = !!l.fill;
  if (l?.type === 'text') {
    if (document.activeElement !== $('text-value')) $('text-value').value = l.text;
    if (document.activeElement !== $('text-size')) $('text-size').value = l.size;
    $('text-color').value = l.color;
  }
}

// "Fill background": the image covers the whole frame and sits at the back.
$('fill-bg').addEventListener('change', (e) => {
  const l = selected();
  if (!l || l.type !== 'image') return;
  for (const other of layers()) if (other.type === 'image') other.fill = false; // only one background
  l.fill = e.target.checked;
  if (l.fill) {
    layers().splice(layers().indexOf(l), 1);
    layers().unshift(l);
  }
  refresh();
});

$('text-value').addEventListener('input', (e) => { const l = selected(); if (l) { l.text = e.target.value; refresh(); } });
$('text-size').addEventListener('input', (e) => {
  const l = selected();
  const size = Number(e.target.value);
  if (l && size >= 20 && size <= 2000) { l.size = size; refresh(); }
});
$('text-color').addEventListener('input', (e) => { const l = selected(); if (l) { l.color = e.target.value; refresh(); } });

// --- Adding layers -------------------------------------------------------------

// Is this file a PNG or JPG? Checked from its first bytes.
function isPngOrJpg(bytes) {
  const b = new Uint8Array(bytes, 0, 4);
  return (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) || (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff);
}

// Turn picked or dropped files ({ name, bytes }) into image layers.
async function importFiles(files) {
  const skipped = [];
  for (const { name, bytes } of files) {
    const buf = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    if (!isPngOrJpg(buf)) { skipped.push(name); continue; }
    try {
      const picture = await createImageBitmap(new Blob([buf]));
      const { file } = await window.studio.saveImage(slug(), name, buf); // copy into the design folder
      const id = `L${nextId++}`;
      // Start at the picture's own size, shrunk if needed to fit 80% of the frame, centered.
      const fit = Math.min(1, (YOUTUBE.width * 0.8) / picture.width, (YOUTUBE.height * 0.8) / picture.height);
      const w = Math.round(picture.width * fit);
      const h = Math.round(picture.height * fit);
      const layer = { id, type: 'image', name, file, x: Math.round((YOUTUBE.width - w) / 2), y: Math.round((YOUTUBE.height - h) / 2), w, h, fill: false };
      images.set(id, picture);
      originals.set(id, { name, bytes: buf, savedFor: slug() });
      layers().push(layer);
      selectedId = id;
    } catch (err) {
      skipped.push(`${name} (${err.message})`);
    }
  }
  refresh();
  setStatus(skipped.length ? `<span class="error">Not imported: ${escapeHtml(skipped.join(', '))}. Only PNG and JPG files work.</span>` : '');
}

async function importViaPicker() {
  const files = await window.studio.chooseImages();
  if (files.length) await importFiles(files);
}
$('import-btn').addEventListener('click', importViaPicker);
window.studio.onMenuImport(importViaPicker);

// Drag and drop onto the canvas area.
const stage = $('stage');
stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('dragging'); });
stage.addEventListener('dragleave', (e) => { if (!stage.contains(e.relatedTarget)) stage.classList.remove('dragging'); });
stage.addEventListener('drop', async (e) => {
  e.preventDefault();
  stage.classList.remove('dragging');
  const files = await Promise.all([...e.dataTransfer.files].map(async (f) => ({ name: f.name, bytes: await f.arrayBuffer() })));
  await importFiles(files);
});
// Dropping a file anywhere else does nothing (instead of opening it).
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

$('add-text-btn').addEventListener('click', () => {
  const layer = { id: `L${nextId++}`, type: 'text', text: 'YOUR TEXT', size: 240, color: '#ffffff', x: 0, y: 0 };
  const b = layerBounds(layer);
  layer.x = Math.round((YOUTUBE.width - b.w) / 2);
  layer.y = Math.round((YOUTUBE.height - b.h) / 2);
  layers().push(layer);
  select(layer.id);
  $('text-value').focus();
  $('text-value').select();
});

// --- Arranging and deleting -------------------------------------------------

function move(step) {
  const l = selected();
  if (!l) return;
  const i = layers().indexOf(l);
  const floor = layers()[0]?.fill ? 1 : 0;
  const j = i + step;
  if (l.fill || j < floor || j >= layers().length) return;
  [layers()[i], layers()[j]] = [layers()[j], layers()[i]];
  refresh();
}
$('forward-btn').addEventListener('click', () => move(+1));
$('back-btn').addEventListener('click', () => move(-1));

function deleteSelected() {
  const l = selected();
  if (!l) return;
  layers().splice(layers().indexOf(l), 1);
  images.delete(l.id);
  originals.delete(l.id);
  selectedId = null;
  refresh();
}
$('delete-btn').addEventListener('click', deleteSelected);

document.addEventListener('keydown', (e) => {
  const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
  if (typing) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelected(); }
  if (e.key === 'Escape') select(null);
});

// --- Mouse on the canvas ----------------------------------------------------

attachEditor(canvas, {
  getLayers: layers,
  getSelectedId: () => selectedId,
  select,
  changed: ({ live }) => (live ? redraw() : refresh()),
});

// --- Design name and background --------------------------------------------

$('design-name').addEventListener('input', (e) => {
  design.name = e.target.value;
  $('design-slug').textContent = slug();
});

function setBackground(hex) {
  variant().background.color = hex;
  $('bg-color').value = hex;
  $('bg-hex').value = hex;
  redraw();
}
$('bg-color').addEventListener('input', (e) => setBackground(e.target.value));
$('bg-hex').addEventListener('change', (e) => {
  let hex = e.target.value.trim();
  if (!hex.startsWith('#')) hex = `#${hex}`;
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) setBackground(hex.toLowerCase());
  else e.target.value = variant().background.color; // undo a typo
});

// --- Export -----------------------------------------------------------------

function setStatus(html) {
  $('status').innerHTML = html;
}

function formatBytes(n) {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)} MB` : `${Math.round(n / 1000)} KB`;
}

// If the design was renamed after importing, copy its pictures into the
// new design folder too, so images/ always sits next to exports/.
async function ensureImagesSaved() {
  for (const [id, o] of originals) {
    if (o.savedFor === slug()) continue;
    const { file } = await window.studio.saveImage(slug(), o.name, o.bytes);
    const layer = layers().find((l) => l.id === id);
    if (layer) layer.file = file;
    o.savedFor = slug();
  }
}

$('export-btn').addEventListener('click', async () => {
  const btn = $('export-btn');
  btn.disabled = true;
  setStatus('Exporting…');
  try {
    await ensureImagesSaved();
    const results = await exportAll(slug(), design.variants, images);
    const items = results.flatMap((r) => [
      `<li><code>${r.png.name}</code> (${r.png.width}×${r.png.height}, ${formatBytes(r.png.bytes)})</li>`,
      `<li><code>${r.jpg.name}</code> (${r.jpg.width}×${r.jpg.height}, ${formatBytes(r.jpg.bytes)})</li>`,
    ]);
    setStatus(`<span class="ok">Saved to designs/${slug()}/exports/</span><ul>${items.join('')}</ul>`);
  } catch (err) {
    setStatus(`<span class="error">Export failed: ${escapeHtml(err.message)}</span>`);
  } finally {
    btn.disabled = false;
  }
});

$('reveal-btn').addEventListener('click', async () => {
  try {
    await window.studio.revealExports(slug());
  } catch {
    setStatus('<span class="error">Could not open the folder.</span>');
  }
});

window.studio.info().then((info) => {
  $('data-dir').textContent = info.dataDir;
});

refresh();
