// Designs: every thumbnail you've made, plus "New thumbnail…".

import { $, escapeHtml, toArrayBuffer } from '../util.js';
import { state, createDesign, openDesign, closeDoc, freeDesignSlug, saveNow, saveSettings } from '../store.js';
import { forgetBitmaps } from '../assets.js';
import { ask, confirmBox } from '../ui.js';

let showView = () => {};
const blobUrls = [];

// Pop-up for a new thumbnail: name + template.
export async function newDesignFlow() {
  const answer = await ask('New thumbnail', [
    { name: 'name', label: 'Name (used for the folder and file names)', value: '', required: true },
    {
      name: 'template', label: 'Start from', type: 'select', value: state.templates[0]?.id || '',
      options: [...state.templates.map((t) => ({ value: t.id, label: t.name })), { value: '', label: 'Blank 16:9' }],
    },
  ], 'Create');
  if (!answer || !answer.name.trim()) return;
  await createDesign(answer.name, answer.template || null);
  showView('editor');
}

export async function renderHome() {
  const list = $('design-list');
  const designs = await window.studio.listDesigns();
  blobUrls.splice(0).forEach((u) => URL.revokeObjectURL(u));
  if (!designs.length) {
    list.innerHTML = '<p class="muted">No designs yet. Click <b>New thumbnail…</b> to start one.</p>';
    return;
  }
  const tplName = (id) => state.templates.find((t) => t.id === id)?.name || (id ? 'Deleted template' : 'Blank');
  list.innerHTML = designs.map((d) => `
    <div class="card" data-slug="${d.slug}">
      <div class="card-thumb" data-thumb="${d.slug}">${d.exports.length ? '' : '<span class="muted small">Not exported yet</span>'}</div>
      <div class="card-body">
        <b>${escapeHtml(d.name)}</b>
        <span class="muted small">${escapeHtml(tplName(d.templateId))} · ${d.updatedAt ? new Date(d.updatedAt).toLocaleString() : ''}</span>
        <div class="button-row">
          <button data-open="${d.slug}" class="primary">Open</button>
          <button data-rename="${d.slug}">Rename</button>
          <button data-delete="${d.slug}">Delete</button>
        </div>
      </div>
    </div>`).join('');
  // Show the latest exported JPG as the card picture.
  for (const d of designs) {
    if (!d.exports.length) continue;
    // Newest export first, variant A before B and C.
    const date = (f) => f.match(/_(\d{4}-\d{2}-\d{2})\.jpg$/)?.[1] || '';
    const latest = [...d.exports].sort((a, b) => date(b).localeCompare(date(a)) || a.localeCompare(b))[0];
    window.studio.readFile(`designs/${d.slug}/exports/${latest}`).then((bytes) => {
      const url = URL.createObjectURL(new Blob([toArrayBuffer(bytes)], { type: 'image/jpeg' }));
      blobUrls.push(url);
      const box = list.querySelector(`[data-thumb="${d.slug}"]`);
      if (box) box.innerHTML = `<img src="${url}" alt="">`;
    }).catch(() => {});
  }
}

async function renameDesign(slug) {
  const current = (await window.studio.readJson(`designs/${slug}/design.json`)) || {};
  const answer = await ask('Rename design', [{ name: 'name', label: 'New name', value: current.name || slug, required: true }], 'Rename');
  if (!answer || !answer.name.trim()) return;
  const isOpen = state.kind === 'design' && state.doc?.slug === slug;
  if (isOpen) await saveNow();
  const newSlug = await freeDesignSlug(answer.name, slug);
  if (newSlug !== slug) await window.studio.renameDesign(slug, newSlug);
  const doc = await window.studio.readJson(`designs/${newSlug}/design.json`);
  doc.name = answer.name.trim();
  await window.studio.writeJson(`designs/${newSlug}/design.json`, doc);
  forgetBitmaps(`designs/${slug}/`);
  if (isOpen) await openDesign(newSlug);
  if (state.settings.lastDesign === slug) { state.settings.lastDesign = newSlug; saveSettings(); }
  renderHome();
}

async function deleteDesign(slug) {
  if (!(await confirmBox('Delete design', `Move “${slug}” (with its images and exports) to the Trash?`, 'Move to Trash'))) return;
  if (state.kind === 'design' && state.doc?.slug === slug) await closeDoc();
  await window.studio.trash(`designs/${slug}`);
  if (state.settings.lastDesign === slug) { state.settings.lastDesign = null; saveSettings(); }
  renderHome();
}

export function initHome(show) {
  showView = show;
  $('new-design-btn').addEventListener('click', newDesignFlow);
  $('reveal-data').addEventListener('click', (e) => { e.preventDefault(); window.studio.reveal(''); });
  $('design-list').addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.open) { await openDesign(t.dataset.open); showView('editor'); }
    if (t.dataset.rename) await renameDesign(t.dataset.rename);
    if (t.dataset.delete) await deleteDesign(t.dataset.delete);
  });
  window.studio.onMenu('new', newDesignFlow);
}
