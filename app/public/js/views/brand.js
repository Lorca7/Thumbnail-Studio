// Brand kit: your logos, colors, fonts, text styles and corner mark.
// Everything is saved to brand/brand.json (and the files next to it) as you go.

import { $, escapeHtml, uid, normalizeHex, clone } from '../util.js';
import { state, saveBrand, cornerMarkBox } from '../store.js';
import { allFonts, BUILT_IN_FONTS, loadBitmap, bitmap, loadUserFonts, userFontFamily } from '../assets.js';
import { renderVariant, overlaps, TIMESTAMP_ZONE, W, H } from '../render.js';
import { ask, colorField, confirmBox } from '../ui.js';

const baseName = (file) => file.replace(/\.[^.]*$/, '').replace(/[-_]+/g, ' ').trim() || 'Untitled';

// --- Logos ---------------------------------------------------------------------------

// Draw a picture centered in a small canvas, over a checkerboard so transparency shows.
function drawContained(canvas, img) {
  const ctx = canvas.getContext('2d');
  const s = 16;
  for (let y = 0; y < canvas.height; y += s) for (let x = 0; x < canvas.width; x += s) {
    ctx.fillStyle = ((x + y) / s) % 2 ? '#d4d4d8' : '#f4f4f5';
    ctx.fillRect(x, y, s, s);
  }
  if (!img) return;
  const k = Math.min(canvas.width / img.width, canvas.height / img.height) * 0.9;
  ctx.drawImage(img, (canvas.width - img.width * k) / 2, (canvas.height - img.height * k) / 2, img.width * k, img.height * k);
}

function renderLogos() {
  const box = $('logo-list');
  const logos = state.brand.logos;
  box.innerHTML = logos.length ? logos.map((l) => `
    <div class="card" data-logo="${l.id}">
      <canvas width="320" height="200" class="checker"></canvas>
      <div class="card-body">
        <input type="text" value="${escapeHtml(l.name)}" data-logo-name="${l.id}" aria-label="Logo name">
        <button data-logo-delete="${l.id}">Delete</button>
      </div>
    </div>`).join('') : '<p class="muted">No logos yet. PNG with transparency works best.</p>';
  for (const l of logos) drawContained(box.querySelector(`[data-logo="${l.id}"] canvas`), bitmap(l.file));
}

async function addLogos() {
  const files = await window.studio.chooseFiles('image');
  for (const f of files) {
    try {
      const saved = await window.studio.importFile('brand/logos', f.name, f.bytes);
      await loadBitmap(saved.path);
      if (!state.brand.logos.some((l) => l.file === saved.path)) {
        state.brand.logos.push({ id: uid('logo'), name: baseName(f.name), file: saved.path });
      }
    } catch (err) {
      alertError(`${f.name}: ${err.message}`);
    }
  }
  if (!state.brand.cornerMark.logoId && state.brand.logos[0]) state.brand.cornerMark.logoId = state.brand.logos[0].id;
  saveBrand();
  renderBrand();
}

async function deleteLogo(id) {
  const logo = state.brand.logos.find((l) => l.id === id);
  if (!logo || !(await confirmBox('Delete logo', `Move “${logo.name}” to the Trash? Designs using it will show an empty spot.`, 'Move to Trash'))) return;
  state.brand.logos = state.brand.logos.filter((l) => l.id !== id);
  if (state.brand.cornerMark.logoId === id) state.brand.cornerMark.logoId = state.brand.logos[0]?.id || null;
  await window.studio.trash(logo.file).catch(() => {});
  saveBrand();
  renderBrand();
}

// --- Colors ----------------------------------------------------------------------------

function renderColors() {
  $('color-list').innerHTML = state.brand.colors.length ? state.brand.colors.map((c) => `
    <div class="swatch-row" data-color="${c.id}">
      <input type="color" value="${c.hex}" data-color-pick="${c.id}">
      <input type="text" value="${escapeHtml(c.name)}" data-color-name="${c.id}" aria-label="Color name">
      <code>${c.hex}</code>
      <button data-color-delete="${c.id}">Delete</button>
    </div>`).join('') : '<p class="muted">No colors yet. They appear as quick swatches next to every color picker.</p>';
}

function addColor() {
  const hex = normalizeHex($('new-color-hex').value) || $('new-color').value;
  const name = $('new-color-name').value.trim() || hex;
  state.brand.colors.push({ id: uid('color'), name, hex });
  $('new-color-name').value = '';
  saveBrand();
  renderColors();
}

// --- Fonts ------------------------------------------------------------------------------

function renderFonts() {
  const builtIn = BUILT_IN_FONTS.map((f) => `
    <div class="font-row"><span class="font-sample" style="font-family:${f.system ? 'system-ui' : `'${f.family}'`};${f.system ? 'font-weight:700' : ''}">${escapeHtml(f.name)}: Big Bold Words 123</span>
    <span class="muted small">Built in</span></div>`).join('');
  const mine = state.brand.fonts.map((f) => `
    <div class="font-row" data-font="${f.id}"><span class="font-sample" style="font-family:'${userFontFamily(f)}'">${escapeHtml(f.name)}: Big Bold Words 123</span>
    <input type="text" value="${escapeHtml(f.name)}" data-font-name="${f.id}" aria-label="Font name">
    <button data-font-delete="${f.id}">Delete</button></div>`).join('');
  $('font-list').innerHTML = builtIn + (mine || '<p class="muted small">Add your own .ttf, .otf or .woff2 files.</p>');
}

async function addFonts() {
  const files = await window.studio.chooseFiles('font');
  for (const f of files) {
    try {
      const saved = await window.studio.importFile('brand/fonts', f.name, f.bytes);
      if (!state.brand.fonts.some((x) => x.file === saved.path)) {
        state.brand.fonts.push({ id: uid('font'), name: baseName(f.name), file: saved.path });
      }
    } catch (err) {
      alertError(`${f.name}: ${err.message}`);
    }
  }
  const failed = await loadUserFonts(state.brand);
  if (failed.length) alertError(`These fonts couldn't be read: ${failed.join(', ')}`);
  saveBrand();
  renderBrand();
}

async function deleteFont(id) {
  const font = state.brand.fonts.find((f) => f.id === id);
  if (!font || !(await confirmBox('Delete font', `Move “${font.name}” to the Trash? Text using it falls back to the system font.`, 'Move to Trash'))) return;
  state.brand.fonts = state.brand.fonts.filter((f) => f.id !== id);
  await window.studio.trash(font.file).catch(() => {});
  saveBrand();
  renderBrand();
}

// --- Text styles --------------------------------------------------------------------------

function newStyle() {
  state.brand.textStyles.push({
    id: uid('style'), name: `Style ${state.brand.textStyles.length + 1}`, font: 'Anton', size: 260, color: '#ffffff',
    outline: { width: 12, color: '#000000' }, shadow: { blur: 0, x: 10, y: 10, color: '#000000' }, allCaps: true, letterSpacing: 0,
  });
  saveBrand();
  renderStyles();
}

function drawStylePreview(canvas, st) {
  const v = { background: { color: '#3f3f46' }, layers: [{ type: 'text', text: 'Sample Text', ...clone(st), x: 120, y: 0, rotation: 0 }] };
  // Center it vertically in the preview frame.
  const lineH = st.size * 1.12 + (st.outline?.width || 0) * 2;
  v.layers[0].y = Math.max(0, (H - lineH) / 2);
  renderVariant(canvas, v, {});
}

function renderStyles() {
  const fonts = allFonts(state.brand);
  const box = $('style-list');
  if (!state.brand.textStyles.length) { box.innerHTML = '<p class="muted">No text styles yet. Make one here, or select text in the Editor and click “Save style…”.</p>'; return; }
  box.innerHTML = state.brand.textStyles.map((s) => `
    <div class="style-card" data-style="${s.id}">
      <canvas width="480" height="270" class="mini-canvas"></canvas>
      <div class="form-grid">
        <label>Name <input type="text" data-f="name" value="${escapeHtml(s.name)}"></label>
        <label>Font <select data-f="font">${fonts.map((f) => `<option value="${escapeHtml(f.family)}" ${f.family === s.font ? 'selected' : ''}>${escapeHtml(f.name)}</option>`).join('')}</select></label>
        <label>Size <input type="number" data-f="size" min="10" max="3000" value="${s.size}"></label>
        <label>Letter spacing <input type="number" data-f="letterSpacing" value="${s.letterSpacing || 0}"></label>
        <div class="field"><span>Color</span><span data-color-field="color"></span></div>
        <label>Outline width <input type="number" data-f="outline.width" min="0" value="${s.outline?.width || 0}"></label>
        <div class="field"><span>Outline color</span><span data-color-field="outline.color"></span></div>
        <label>Shadow blur <input type="number" data-f="shadow.blur" min="0" value="${s.shadow?.blur || 0}"></label>
        <label>Shadow X <input type="number" data-f="shadow.x" value="${s.shadow?.x || 0}"></label>
        <label>Shadow Y <input type="number" data-f="shadow.y" value="${s.shadow?.y || 0}"></label>
        <div class="field"><span>Shadow color</span><span data-color-field="shadow.color"></span></div>
        <label class="check"><input type="checkbox" data-f="allCaps" ${s.allCaps ? 'checked' : ''}> All caps</label>
        <button data-style-delete="${s.id}">Delete style</button>
      </div>
    </div>`).join('');
  for (const s of state.brand.textStyles) {
    const card = box.querySelector(`[data-style="${s.id}"]`);
    const preview = card.querySelector('canvas');
    drawStylePreview(preview, s);
    card.querySelectorAll('[data-color-field]').forEach((el) => {
      const path = el.dataset.colorField;
      const f = colorField(el, (hex, final) => { setPath(s, path, hex); drawStylePreview(preview, s); if (final) saveBrand(); });
      f.set(getPath(s, path) || '#000000');
    });
    card.addEventListener('input', (e) => {
      const path = e.target.dataset.f;
      if (!path) return;
      const v = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? Number(e.target.value) : e.target.value;
      setPath(s, path, v);
      drawStylePreview(preview, s);
    });
    card.addEventListener('change', (e) => { if (e.target.dataset.f) saveBrand(); });
  }
}

const getPath = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);
function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = (o[k] ||= {});
  o[keys[keys.length - 1]] = value;
}

// --- Corner mark ----------------------------------------------------------------------------

function renderCornerMark() {
  const cm = state.brand.cornerMark;
  $('cm-enabled').checked = !!cm.enabled;
  $('cm-logo').innerHTML = state.brand.logos.map((l) => `<option value="${l.id}" ${l.id === cm.logoId ? 'selected' : ''}>${escapeHtml(l.name)}</option>`).join('') || '<option value="">(add a logo first)</option>';
  $('cm-corner').value = cm.corner;
  if (document.activeElement !== $('cm-size')) $('cm-size').value = cm.size;
  if (document.activeElement !== $('cm-margin')) $('cm-margin').value = cm.margin;
  drawCornerPreview();
}

function drawCornerPreview() {
  const cm = state.brand.cornerMark;
  const canvas = $('cm-preview');
  const layers = [];
  if (cm.enabled && cm.logoId) layers.push({ type: 'logo', logoId: cm.logoId, ...cornerMarkBox(cm.logoId), rotation: 0 });
  renderVariant(canvas, { background: { color: '#52525b' }, layers }, { picture: (l) => bitmap(state.brand.logos.find((g) => g.id === l.logoId)?.file) });
  // The video-length corner, for reference.
  const ctx = canvas.getContext('2d');
  const s = canvas.width / W;
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.9)';
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(TIMESTAMP_ZONE.x * s, TIMESTAMP_ZONE.y * s, TIMESTAMP_ZONE.w * s, TIMESTAMP_ZONE.h * s);
  const warn = cm.enabled && cm.logoId && overlaps(cornerMarkBox(cm.logoId), TIMESTAMP_ZONE);
  $('cm-warning').textContent = warn ? '⚠ This overlaps the bottom-right corner, where YouTube shows the video length.' : '';
}

function bindCornerMark() {
  const cm = () => state.brand.cornerMark;
  $('cm-enabled').addEventListener('change', (e) => { cm().enabled = e.target.checked; if (!cm().logoId) cm().logoId = state.brand.logos[0]?.id || null; saveBrand(); renderCornerMark(); });
  $('cm-logo').addEventListener('change', (e) => { cm().logoId = e.target.value; saveBrand(); drawCornerPreview(); });
  $('cm-corner').addEventListener('change', (e) => { cm().corner = e.target.value; saveBrand(); drawCornerPreview(); });
  for (const [id, key] of [['cm-size', 'size'], ['cm-margin', 'margin']]) {
    $(id).addEventListener('input', (e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0) { cm()[key] = v; drawCornerPreview(); } });
    $(id).addEventListener('change', () => saveBrand());
  }
}

// --- Page ------------------------------------------------------------------------------------

function alertError(text) {
  ask('Something went wrong', [{ type: 'note', label: text }]);
}

export function renderBrand() {
  renderLogos();
  renderColors();
  renderFonts();
  renderStyles();
  renderCornerMark();
}

export function initBrand() {
  $('add-logos-btn').addEventListener('click', addLogos);
  $('add-fonts-btn').addEventListener('click', addFonts);
  $('add-style-btn').addEventListener('click', newStyle);
  $('add-color-btn').addEventListener('click', addColor);
  $('new-color').addEventListener('input', (e) => { $('new-color-hex').value = e.target.value; });
  $('new-color-hex').addEventListener('change', (e) => { const v = normalizeHex(e.target.value); if (v) $('new-color').value = v; });

  // One listener per list handles renames, color edits and deletes.
  $('logo-list').addEventListener('change', (e) => {
    const id = e.target.dataset.logoName;
    if (id) { state.brand.logos.find((l) => l.id === id).name = e.target.value.trim() || 'Logo'; saveBrand(); renderCornerMark(); }
  });
  $('logo-list').addEventListener('click', (e) => { const id = e.target.dataset.logoDelete; if (id) deleteLogo(id); });

  $('color-list').addEventListener('input', (e) => {
    const id = e.target.dataset.colorPick;
    if (id) { const c = state.brand.colors.find((x) => x.id === id); c.hex = e.target.value; e.target.parentElement.querySelector('code').textContent = c.hex; }
  });
  $('color-list').addEventListener('change', (e) => {
    const nameId = e.target.dataset.colorName;
    if (nameId) state.brand.colors.find((x) => x.id === nameId).name = e.target.value.trim() || 'Color';
    if (nameId || e.target.dataset.colorPick) saveBrand();
  });
  $('color-list').addEventListener('click', (e) => {
    const id = e.target.dataset.colorDelete;
    if (id) { state.brand.colors = state.brand.colors.filter((c) => c.id !== id); saveBrand(); renderColors(); }
  });

  $('font-list').addEventListener('change', (e) => {
    const id = e.target.dataset.fontName;
    if (id) { state.brand.fonts.find((f) => f.id === id).name = e.target.value.trim() || 'Font'; saveBrand(); }
  });
  $('font-list').addEventListener('click', (e) => { const id = e.target.dataset.fontDelete; if (id) deleteFont(id); });

  $('style-list').addEventListener('click', async (e) => {
    const id = e.target.dataset.styleDelete;
    if (!id) return;
    const st = state.brand.textStyles.find((s) => s.id === id);
    if (!(await confirmBox('Delete text style', `Delete “${st.name}”? Text already using it keeps its look.`, 'Delete'))) return;
    state.brand.textStyles = state.brand.textStyles.filter((s) => s.id !== id);
    saveBrand();
    renderStyles();
  });

  bindCornerMark();
}

