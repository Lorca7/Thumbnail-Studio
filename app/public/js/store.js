// The app's memory: your brand kit, settings, templates, and the document
// being edited (a design or a template), plus undo/redo and autosave.
//
// Every change goes through commit(): it records an undo step and saves
// the document to disk a moment later. Nothing needs a "Save" button.

import { clone, debounce, slugify, uid } from './util.js';
import { loadBitmap, bitmap, loadUserFonts } from './assets.js';
import { W, H } from './render.js';
import { YOUTUBE } from './youtube-rules.js';

export const state = {
  brand: null, // brand/brand.json
  settings: null, // settings.json
  templates: [], // every templates/*.json
  doc: null, // the design or template being edited
  kind: null, // 'design' | 'template'
  variantIndex: 0, // which variant (A, B, C) is being edited
  selectedId: null, // selected layer
};

// --- Events: views listen for 'doc' (another document opened),
// 'change' (the document changed), 'brand', 'saved' ---------------------------
const listeners = {};
export function on(evt, fn) { (listeners[evt] ||= []).push(fn); }
export function emit(evt, data) { for (const fn of listeners[evt] || []) fn(data); }

// --- Defaults ----------------------------------------------------------------------

export const DEFAULT_LOCKS = () => ({ position: false, size: false, style: false });

export function defaultTextLayer(extra = {}) {
  return {
    id: uid('L'), type: 'text', text: 'YOUR TEXT', font: 'Anton', size: 260, color: '#ffffff',
    outline: { width: 0, color: '#000000' }, shadow: { blur: 0, x: 0, y: 0, color: '#000000' },
    allCaps: false, letterSpacing: 0, align: 'left', x: 200, y: 200, rotation: 0, hidden: false,
    locks: DEFAULT_LOCKS(), ...extra,
  };
}

// The text style fields a saved style controls.
export const STYLE_FIELDS = ['font', 'size', 'color', 'outline', 'shadow', 'allCaps', 'letterSpacing'];

// --- What's being edited ------------------------------------------------------------

// The variant being edited. A template is edited as if it were a single variant.
export function variant() {
  if (!state.doc) return null;
  return state.kind === 'template' ? state.doc : state.doc.variants[state.variantIndex];
}
export const layers = () => variant()?.layers || [];
export const selected = () => layers().find((l) => l.id === state.selectedId) || null;

// The path of a design's file, relative to your files folder.
export const designPath = (slug, file) => `designs/${slug}/${file}`;

function docFile() {
  return state.kind === 'design' ? designPath(state.doc.slug, 'design.json') : `templates/${state.doc.id}.json`;
}

// The decoded picture for an image or logo layer, if loaded.
// `slug` = the design the picture belongs to (defaults to the open one).
export function pictureFor(layer, slug = state.kind === 'design' ? state.doc?.slug : null) {
  if (layer.type === 'image') return layer.file && slug ? bitmap(designPath(slug, layer.file)) : null;
  if (layer.type === 'logo') {
    const logo = state.brand?.logos.find((l) => l.id === layer.logoId);
    return logo ? bitmap(logo.file) : null;
  }
  return null;
}

// Load every picture a document needs (design images and brand logos).
export async function loadPictures(doc, kind, slug = doc.slug) {
  const all = kind === 'design' ? doc.variants.flatMap((v) => v.layers) : doc.layers;
  const jobs = [];
  for (const l of all) {
    if (l.type === 'image' && l.file && kind === 'design') jobs.push(loadBitmap(designPath(slug, l.file)).catch(() => null));
    if (l.type === 'logo') {
      const logo = state.brand.logos.find((x) => x.id === l.logoId);
      if (logo) jobs.push(loadBitmap(logo.file).catch(() => null));
    }
  }
  await Promise.all(jobs);
}

// --- Undo / redo ------------------------------------------------------------------
// We keep snapshots of the document as text. ("updatedAt" is left out so
// saving doesn't count as a change.)

let undoStack = [];
let redoStack = [];
let lastSnap = null;
const snapshot = () => JSON.stringify({ ...state.doc, updatedAt: undefined });

export function resetHistory() {
  undoStack = [];
  redoStack = [];
  lastSnap = state.doc ? snapshot() : null;
}

// Record the current document as a new undo step (if it changed) and save it soon.
export function commit() {
  if (!state.doc) return;
  const snap = snapshot();
  if (snap === lastSnap) return;
  undoStack.push(lastSnap);
  if (undoStack.length > 200) undoStack.shift();
  redoStack = [];
  lastSnap = snap;
  scheduleSave();
  emit('change');
}

export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;

function restore(snap) {
  const updatedAt = state.doc.updatedAt;
  state.doc = { ...JSON.parse(snap), updatedAt };
  lastSnap = snap;
  if (state.kind === 'design') state.variantIndex = Math.min(state.variantIndex, state.doc.variants.length - 1);
  if (!selected()) state.selectedId = null;
  scheduleSave();
  emit('change');
}

export function undo() {
  if (!undoStack.length) return;
  redoStack.push(lastSnap);
  restore(undoStack.pop());
}

export function redo() {
  if (!redoStack.length) return;
  undoStack.push(lastSnap);
  restore(redoStack.pop());
}

// --- Saving ------------------------------------------------------------------------

async function saveDocNow() {
  if (!state.doc) return;
  state.doc.updatedAt = new Date().toISOString();
  try {
    await window.studio.writeJson(docFile(), state.doc);
    emit('saved', { ok: true });
  } catch (err) {
    emit('saved', { ok: false, error: err.message });
  }
}
const saveDocSoon = debounce(saveDocNow, 400);
export function scheduleSave() {
  emit('saving');
  saveDocSoon();
}
// Finish any save that's waiting (used before export and before switching documents).
export async function saveNow() {
  if (saveDocSoon.pending()) {
    saveDocSoon.cancel();
    await saveDocNow();
  }
}

const saveBrandSoon = debounce(() => window.studio.writeJson('brand/brand.json', state.brand), 300);
export function saveBrand() {
  saveBrandSoon();
  emit('brand');
}

const saveSettingsSoon = debounce(() => window.studio.writeJson('settings.json', state.settings), 300);
export function saveSettings() { saveSettingsSoon(); }

// When the window closes, write anything still waiting (blocking, so it can't be lost).
export function flushAllSync() {
  if (saveDocSoon.pending() && state.doc) {
    state.doc.updatedAt = new Date().toISOString();
    window.studio.writeJsonSync(docFile(), state.doc);
  }
  if (saveBrandSoon.pending()) window.studio.writeJsonSync('brand/brand.json', state.brand);
  if (saveSettingsSoon.pending()) window.studio.writeJsonSync('settings.json', state.settings);
}

// --- Loading -----------------------------------------------------------------------

export async function loadBrandAndSettings() {
  state.brand = (await window.studio.readJson('brand/brand.json')) || {};
  const b = state.brand;
  b.logos ||= []; b.colors ||= []; b.fonts ||= []; b.textStyles ||= [];
  b.cornerMark ||= { enabled: false, logoId: null, corner: 'tl', size: 300, margin: 60 };
  state.settings = { titleLimit: 60, lastDesign: null, ...((await window.studio.readJson('settings.json')) || {}) };
  await Promise.all(b.logos.map((l) => loadBitmap(l.file).catch(() => null)));
  return loadUserFonts(b);
}

export async function loadTemplates() {
  const out = [];
  for (const e of await window.studio.list('templates')) {
    if (!e.name.endsWith('.json')) continue;
    const t = await window.studio.readJson(`templates/${e.name}`).catch(() => null);
    if (t && Array.isArray(t.layers)) {
      t.id = e.name.replace(/\.json$/, '');
      out.push(t);
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  state.templates = out;
  return out;
}

// --- Corner mark --------------------------------------------------------------------
// If a document has its corner mark switched on (and the brand kit has one
// set up), a locked logo layer is kept in place according to the brand
// kit's settings. Unlock it to move it by hand.

export function cornerMarkBox(logoId) {
  const cm = state.brand.cornerMark;
  const logo = state.brand.logos.find((l) => l.id === logoId);
  const img = logo && bitmap(logo.file);
  const w = cm.size;
  const h = img ? Math.round((w * img.height) / img.width) : w;
  const m = cm.margin;
  return {
    x: cm.corner.endsWith('l') ? m : W - m - w,
    y: cm.corner.startsWith('t') ? m : H - m - h,
    w, h,
  };
}

function applyCornerMarkTo(layerList, wanted) {
  const cm = state.brand.cornerMark;
  const logo = state.brand.logos.find((l) => l.id === cm.logoId);
  let layer = layerList.find((l) => l.role === 'cornerMark');
  const followsBrand = (l) => l.locks?.position && l.locks?.size;
  if (!wanted || !cm.enabled || !logo) {
    if (layer && followsBrand(layer)) layerList.splice(layerList.indexOf(layer), 1);
    return;
  }
  if (!layer) {
    layer = { id: uid('L'), type: 'logo', role: 'cornerMark', slot: 'Corner mark', logoId: logo.id, x: 0, y: 0, w: 1, h: 1, rotation: 0, hidden: false, locks: { position: true, size: true, style: true } };
    layerList.push(layer);
  }
  if (followsBrand(layer)) {
    layer.logoId = logo.id;
    layer.rotation = 0;
    Object.assign(layer, cornerMarkBox(logo.id));
    // Keep it in front of everything else.
    layerList.splice(layerList.indexOf(layer), 1);
    layerList.push(layer);
  }
}

// Add a new layer at the front, but behind the corner mark.
export function addLayer(layer) {
  const list = layers();
  const cm = list.findIndex((l) => l.role === 'cornerMark' && l.locks?.position && l.locks?.size);
  if (cm >= 0) list.splice(cm, 0, layer); else list.push(layer);
  state.selectedId = layer.id;
}

export function applyCornerMark(doc, kind) {
  if (!state.brand) return;
  const lists = kind === 'design' ? doc.variants.map((v) => v.layers) : [doc.layers];
  for (const list of lists) applyCornerMarkTo(list, !!doc.cornerMark);
}

// --- Opening and creating ----------------------------------------------------------

export async function openDesign(slug) {
  const doc = await window.studio.readJson(designPath(slug, 'design.json'));
  if (!doc) throw new Error('Design not found');
  doc.slug = slug;
  doc.variants ||= [{ id: 'A', background: { color: '#1e293b' }, layers: [] }];
  await saveNow();
  state.doc = doc;
  state.kind = 'design';
  state.variantIndex = 0;
  state.selectedId = null;
  await loadPictures(doc, 'design');
  applyCornerMark(doc, 'design');
  resetHistory();
  state.settings.lastDesign = slug;
  saveSettings();
  emit('doc');
}

export async function openTemplate(id) {
  const tpl = state.templates.find((t) => t.id === id);
  if (!tpl) throw new Error('Template not found');
  await saveNow();
  state.doc = clone(tpl);
  state.kind = 'template';
  state.variantIndex = 0;
  state.selectedId = null;
  await loadPictures(state.doc, 'template');
  applyCornerMark(state.doc, 'template');
  resetHistory();
  emit('doc');
}

export async function closeDoc() {
  await saveNow();
  state.doc = null;
  state.kind = null;
  state.selectedId = null;
  resetHistory();
  emit('doc');
}

// A design name that isn't taken yet: "my-video", "my-video-2", …
export async function freeDesignSlug(name, except = null) {
  const taken = new Set((await window.studio.list('designs')).map((e) => e.name));
  taken.delete(except);
  const base = slugify(name);
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

// Start a new thumbnail, optionally from a template.
export async function createDesign(name, templateId) {
  const tpl = state.templates.find((t) => t.id === templateId) || null;
  const slug = await freeDesignSlug(name);
  const now = new Date().toISOString();
  const doc = {
    version: 1,
    format: '16:9', // room for vertical Shorts thumbnails later
    name: name.trim() || slug,
    templateId: tpl?.id || null,
    cornerMark: tpl ? !!tpl.cornerMark : false,
    title: '',
    variants: [{
      id: 'A',
      background: clone(tpl?.background || { color: '#1e293b' }),
      layers: clone(tpl?.layers || []).map((l) => ({ ...l, id: uid('L'), locks: { ...DEFAULT_LOCKS(), ...(l.locks || {}) } })),
    }],
    createdAt: now,
    updatedAt: now,
  };
  await window.studio.writeJson(designPath(slug, 'design.json'), doc);
  await openDesign(slug);
  return slug;
}

// Save the template being edited back into the templates list.
export function syncTemplateList() {
  if (state.kind !== 'template') return;
  const i = state.templates.findIndex((t) => t.id === state.doc.id);
  if (i >= 0) state.templates[i] = clone(state.doc);
}

export { YOUTUBE };
