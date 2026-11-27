// The Lab: checks before publishing.
//   Feed preview  – each variant with your title at YouTube-like sizes, light and dark
//   Title cutoffs – where each surface cuts the title off
//   Squint test   – blurred, tiny and grayscale versions
//   Pairing check – words that appear in both the title and the thumbnail
//   Series wall   – your exported thumbnails side by side
//   Icon check    – your channel icon in a circle at 48 and 24 px

import { $, escapeHtml, toArrayBuffer } from '../util.js';
import { state, on, commit, pictureFor, saveSettings, saveBrand } from '../store.js';
import { renderFullSize, displayText } from '../render.js';

// Approximate YouTube layout sizes (CSS pixels). YouTube changes these now
// and then; adjust here if they drift.
export const SURFACES = [
  { id: 'desktop', name: 'Desktop home feed', thumbW: 360, titleFont: 16, lineHeight: 22, titleWidth: 300, lines: 2 },
  { id: 'phone', name: 'Phone feed', thumbW: 390, titleFont: 15, lineHeight: 21, titleWidth: 318, lines: 2 },
  { id: 'sidebar', name: 'Sidebar (up next)', thumbW: 168, titleFont: 14, lineHeight: 20, titleWidth: 210, lines: 2 },
];
const TITLE_FONT = (px) => `500 ${px}px Roboto, Arial, sans-serif`;

let mode = 'light';
let urls = []; // blob URLs to release when re-rendering
let fullCache = new Map(); // variant id → full-size canvas (for this Lab visit)

const keep = (url) => { urls.push(url); return url; };

// --- Title wrapping (shared by the feed tiles and the cutoff table) -------------------

const measure = document.createElement('canvas').getContext('2d');

// Wrap `title` into lines of `width` px; if it needs more than `maxLines`,
// cut it and add "…" like YouTube does. Returns { lines, shown, cut }.
export function wrapTitle(title, surface) {
  measure.font = TITLE_FONT(surface.titleFont);
  const fits = (s) => measure.measureText(s).width <= surface.titleWidth;
  const words = title.trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const tryLine = line ? `${line} ${word}` : word;
    if (fits(tryLine)) { line = tryLine; continue; }
    if (line) lines.push(line);
    line = word;
    while (!fits(line)) { // a single word wider than the line: break it
      let i = line.length - 1;
      while (i > 1 && !fits(line.slice(0, i))) i--;
      lines.push(line.slice(0, i));
      line = line.slice(i);
    }
  }
  if (line) lines.push(line);
  if (lines.length <= surface.lines) return { lines, shown: title.trim().length, cut: false };
  const visible = lines.slice(0, surface.lines);
  let last = visible[surface.lines - 1];
  while (last.length && !fits(`${last}…`)) last = last.slice(0, -1);
  visible[surface.lines - 1] = `${last.trimEnd()}…`;
  const shown = lines.slice(0, surface.lines - 1).join(' ').length + (surface.lines > 1 ? 1 : 0) + last.trimEnd().length;
  return { lines: visible, shown, cut: true };
}

// --- Pictures of each variant ----------------------------------------------------------

function fullCanvas(v) {
  if (!fullCache.has(v.id)) fullCache.set(v.id, renderFullSize(v, { picture: (l) => pictureFor(l) }));
  return fullCache.get(v.id);
}

// A blob URL of the variant at `width` px wide (sharp on Retina).
async function variantUrl(v, width) {
  const c = document.createElement('canvas');
  c.width = width * 2;
  c.height = Math.round((c.width * 9) / 16);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(fullCanvas(v), 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
  return keep(URL.createObjectURL(blob));
}

async function fileUrl(rel, type = 'image/jpeg') {
  const bytes = await window.studio.readFile(rel);
  return keep(URL.createObjectURL(new Blob([toArrayBuffer(bytes)], { type })));
}

// --- Feed preview ----------------------------------------------------------------------

function titleHtml(title, surface) {
  if (!title.trim()) return '<span class="yt-placeholder-text">Type a title above</span>';
  return wrapTitle(title, surface).lines.map(escapeHtml).join('<br>');
}

function tile(surface, { img, title, avatar, placeholder }) {
  const thumb = img ? `<img src="${img}" alt="">` : '';
  const titleBlock = placeholder
    ? '<div class="yt-bar"></div><div class="yt-bar short"></div>'
    : `<div class="yt-title" style="font:${TITLE_FONT(surface.titleFont)};line-height:${surface.lineHeight}px;width:${surface.titleWidth}px">${titleHtml(title, surface)}</div>
       <div class="yt-sub">Your channel · 12K views · 2 days ago</div>`;
  const av = surface.id === 'sidebar' ? '' : `<div class="yt-avatar">${avatar && !placeholder ? `<img src="${avatar}" alt="">` : ''}</div>`;
  return `<div class="yt-tile ${surface.id}${placeholder ? ' placeholder' : ''}" style="--thumb-w:${surface.thumbW}px">
    <div class="yt-thumb">${thumb}<span class="yt-time">12:34</span></div>
    <div class="yt-meta">${av}<div class="yt-text">${titleBlock}</div></div>
  </div>`;
}

async function renderFeed() {
  const doc = state.doc;
  const shots = (await window.studio.list('lab')).filter((e) => /\.(png|jpg)$/i.test(e.name));
  const shotUrls = await Promise.all(shots.map((s) => fileUrl(`lab/${s.name}`, s.name.endsWith('.png') ? 'image/png' : 'image/jpeg')));
  const avatar = state.brand.channelIcon ? await fileUrl(state.brand.channelIcon).catch(() => null) : null;
  let shotIndex = 0;
  const other = (surface) => tile(surface, { img: shotUrls.length ? shotUrls[shotIndex++ % shotUrls.length] : null, placeholder: true });
  const [desktop, phone, sidebar] = SURFACES;
  const blocks = [];
  for (const v of doc.variants) {
    const img = await variantUrl(v, 390);
    const mine = (surface) => tile(surface, { img, title: doc.title || '', avatar });
    blocks.push(`
      <div class="feed-variant">
        <h4>Variant ${v.id}</h4>
        <div class="feed-surface"><span class="surface-label">${desktop.name}</span><div class="feed-row">${other(desktop)}${mine(desktop)}${other(desktop)}</div></div>
        <div class="feed-split">
          <div class="feed-surface"><span class="surface-label">${phone.name}</span><div class="phone-col">${mine(phone)}${other(phone)}</div></div>
          <div class="feed-surface"><span class="surface-label">${sidebar.name}</span><div class="sidebar-col">${other(sidebar)}${mine(sidebar)}${other(sidebar)}</div></div>
        </div>
      </div>`);
  }
  $('lab-feed').className = `feed yt-${mode}`;
  $('lab-feed').innerHTML = blocks.join('');
}

// --- Title: count, cutoffs, pairing --------------------------------------------------------

const STOPWORDS = new Set('a an the and or but of to in on at for with by from is are was were be this that it its i you we my your our how why what when who vs'.split(' '));
const wordsOf = (s) => new Set((s.toLowerCase().match(/[\p{L}\p{N}']+/gu) || []).map((w) => w.replace(/'s$/, '')).filter((w) => w.length > 1 && !STOPWORDS.has(w)));

function renderTitleChecks() {
  const title = state.doc.title || '';
  const limit = state.settings.titleLimit || 60;
  $('lab-title-count').textContent = `${title.length} characters`;
  $('lab-title-warn').textContent = title.length > limit ? `⚠ Longer than ${limit} characters: the end may be cut off in many places.` : '';

  // Cutoffs per surface.
  $('lab-cutoffs').innerHTML = title.trim() ? `<table class="cutoffs"><tr><th>Where</th><th>What viewers see</th><th>Shown</th></tr>${SURFACES.map((s) => {
    const r = wrapTitle(title, s);
    const t = title.trim();
    const shownText = escapeHtml(t.slice(0, r.shown));
    const cutText = escapeHtml(t.slice(r.shown));
    return `<tr><td>${s.name}<br><span class="muted small">${s.lines} lines max</span></td>
      <td>${shownText}${r.cut ? `<span class="cut">${cutText}</span>` : ''}</td>
      <td>${r.cut ? `<span class="warn">${r.shown} of ${t.length}</span>` : '<span class="ok">All</span>'}</td></tr>`;
  }).join('')}</table>` : '<p class="muted">Type a title to see where it gets cut off.</p>';

  // Pairing: the thumbnail should add to the title, not repeat it.
  const titleWords = wordsOf(title);
  const rows = state.doc.variants.map((v) => {
    const thumbWords = wordsOf(v.layers.filter((l) => l.type === 'text' && !l.hidden).map(displayText).join(' '));
    const both = [...titleWords].filter((w) => thumbWords.has(w));
    return both.length
      ? `<div class="warn">⚠ Variant ${v.id}: “${both.map(escapeHtml).join('”, “')}” appear in both the title and the thumbnail.</div>`
      : `<div class="ok">✓ Variant ${v.id}: no words repeated between title and thumbnail.</div>`;
  });
  $('lab-pairing').innerHTML = title.trim() ? `<h4>Pairing check</h4>${rows.join('')}` : '';
}

// --- Squint test -------------------------------------------------------------------------

function renderSquint() {
  const box = $('lab-squint');
  box.innerHTML = '';
  for (const v of state.doc.variants) {
    const row = document.createElement('div');
    row.className = 'squint-row';
    row.innerHTML = `<span class="squint-label">${v.id}</span>`;
    const make = (w, filter, label) => {
      const c = document.createElement('canvas');
      c.width = w * 2; c.height = Math.round((c.width * 9) / 16);
      c.style.width = `${w}px`;
      const ctx = c.getContext('2d');
      ctx.filter = filter;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(fullCanvas(v), 0, 0, c.width, c.height);
      const fig = document.createElement('figure');
      fig.append(c, Object.assign(document.createElement('figcaption'), { textContent: label }));
      row.append(fig);
    };
    make(320, 'blur(10px)', 'Blurred');
    make(120, 'none', 'Tiny (120 px)');
    make(320, 'grayscale(1)', 'Grayscale');
    box.append(row);
  }
}

// --- Series wall ---------------------------------------------------------------------------

async function renderWall() {
  const filter = $('wall-filter');
  const chosen = filter.value;
  filter.innerHTML = `<option value="">All templates</option>${state.templates.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('')}`;
  filter.value = state.templates.some((t) => t.id === chosen) ? chosen : '';
  const designs = (await window.studio.listDesigns()).filter((d) => !filter.value || d.templateId === filter.value);
  const items = [];
  for (const d of designs) {
    // Latest export per variant: files are named <design>_<variant>_<date>.jpg
    const latest = new Map();
    for (const f of d.exports) {
      const m = f.match(/_([A-Z])_(\d{4}-\d{2}-\d{2})\.jpg$/);
      if (m && (!latest.has(m[1]) || latest.get(m[1]) < f)) latest.set(m[1], f);
    }
    for (const [vid, f] of [...latest.entries()].sort()) items.push({ d, vid, rel: `designs/${d.slug}/exports/${f}` });
  }
  if (!items.length) { $('lab-wall').innerHTML = '<p class="muted">Nothing exported yet for this filter.</p>'; return; }
  const cells = await Promise.all(items.map(async (it) => `<figure><img src="${await fileUrl(it.rel)}" alt=""><figcaption>${escapeHtml(it.d.name)} · ${it.vid}</figcaption></figure>`));
  $('lab-wall').innerHTML = cells.join('');
}

// --- Channel icon -----------------------------------------------------------------------------

async function renderIcon() {
  const rel = state.brand.channelIcon;
  if (!rel) { $('lab-icon').innerHTML = '<p class="muted">Choose your channel icon to see it as a small circle, like YouTube shows it.</p>'; return; }
  const url = await fileUrl(rel).catch(() => null);
  if (!url) { $('lab-icon').innerHTML = '<p class="warn">Channel icon file is missing.</p>'; return; }
  const cell = (bg, size) => `<div class="icon-cell" style="background:${bg}"><img src="${url}" style="width:${size}px;height:${size}px" alt=""><span>${size} px</span></div>`;
  $('lab-icon').innerHTML = `<div class="icon-grid">
    ${cell('#ffffff', 48)}${cell('#ffffff', 24)}${cell('#0f0f0f', 48)}${cell('#0f0f0f', 24)}</div>`;
}

async function chooseIcon() {
  const files = await window.studio.chooseFiles('image');
  if (!files.length) return;
  const saved = await window.studio.importFile('brand/icon', files[0].name, files[0].bytes);
  state.brand.channelIcon = saved.path;
  saveBrand();
  renderLab();
}

async function addShots() {
  const files = await window.studio.chooseFiles('image');
  for (const f of files) await window.studio.importFile('lab', f.name, f.bytes).catch(() => null);
  renderLab();
}

async function clearShots() {
  for (const e of await window.studio.list('lab')) await window.studio.trash(`lab/${e.name}`).catch(() => null);
  renderLab();
}

// --- Page -------------------------------------------------------------------------------------

let renderId = 0;
export async function renderLab() {
  const id = ++renderId;
  const isDesign = state.kind === 'design' && state.doc;
  $('lab-empty').hidden = !!isDesign;
  $('lab-main').hidden = !isDesign;
  if (!isDesign) return;
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls = [];
  fullCache = new Map();
  $('lab-design-name').textContent = state.doc.name;
  if (document.activeElement !== $('lab-title')) $('lab-title').value = state.doc.title || '';
  $('lab-title-limit').value = state.settings.titleLimit || 60;
  renderTitleChecks();
  renderSquint();
  await renderFeed();
  if (id !== renderId) return;
  await renderWall();
  await renderIcon();
}

export function initLab(isVisible) {
  $('lab-title').addEventListener('input', (e) => {
    state.doc.title = e.target.value;
    renderTitleChecks();
  });
  $('lab-title').addEventListener('change', () => { commit(); renderFeed(); });
  $('lab-title-limit').addEventListener('change', (e) => {
    const v = Number(e.target.value);
    if (v >= 20 && v <= 100) { state.settings.titleLimit = v; saveSettings(); renderTitleChecks(); }
  });
  $('lab-mode').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    mode = b.dataset.mode;
    $('lab-mode').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    $('lab-feed').className = `feed yt-${mode}`;
  });
  $('wall-filter').addEventListener('change', renderWall);
  $('lab-icon-btn').addEventListener('click', chooseIcon);
  $('lab-add-shots').addEventListener('click', addShots);
  $('lab-clear-shots').addEventListener('click', clearShots);
  on('exported', () => { if (isVisible()) renderWall(); });
}
