// Templates: create, duplicate, rename, edit and delete your layouts.
// Each template is one file: templates/<id>.json.

import { $, escapeHtml, slugify, clone, uid } from '../util.js';
import { state, loadTemplates, openTemplate, closeDoc, pictureFor, applyCornerMark } from '../store.js';
import { renderVariant } from '../render.js';
import { ask, confirmBox } from '../ui.js';

let showView = () => {};

function freeTemplateId(name) {
  const taken = new Set(state.templates.map((t) => t.id));
  const base = slugify(name, 'template');
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

export async function renderTemplates() {
  await loadTemplates();
  const box = $('template-list');
  if (!state.templates.length) {
    box.innerHTML = '<p class="muted">No templates yet. Click <b>New template</b> to make one, for example one per series.</p>';
    return;
  }
  box.innerHTML = state.templates.map((t) => `
    <div class="card" data-template="${t.id}">
      <canvas width="640" height="360" class="card-canvas"></canvas>
      <div class="card-body">
        <b>${escapeHtml(t.name)}</b>
        <span class="muted small">${t.layers.length} slot${t.layers.length === 1 ? '' : 's'}${t.cornerMark ? ' · corner mark' : ''}</span>
        <div class="button-row">
          <button data-edit="${t.id}" class="primary">Edit</button>
          <button data-dup="${t.id}">Duplicate</button>
          <button data-rename="${t.id}">Rename</button>
          <button data-delete="${t.id}">Delete</button>
        </div>
      </div>
    </div>`).join('');
  for (const t of state.templates) {
    const preview = clone(t);
    applyCornerMark(preview, 'template');
    renderVariant(box.querySelector(`[data-template="${t.id}"] canvas`), preview, { picture: (l) => pictureFor(l, null) });
  }
}

async function saveTemplate(t) {
  await window.studio.writeJson(`templates/${t.id}.json`, t);
}

async function newTemplate() {
  const answer = await ask('New template', [{ name: 'name', label: 'Template name (e.g. your series name)', value: '', required: true }], 'Create');
  if (!answer || !answer.name.trim()) return;
  const t = { version: 1, id: freeTemplateId(answer.name), name: answer.name.trim(), background: { color: '#1f2937' }, cornerMark: true, layers: [] };
  await saveTemplate(t);
  await loadTemplates();
  await openTemplate(t.id);
  showView('editor');
}

async function duplicateTemplate(id) {
  const src = state.templates.find((t) => t.id === id);
  const name = `${src.name} copy`;
  const t = { ...clone(src), id: freeTemplateId(name), name };
  t.layers = t.layers.map((l) => ({ ...l, id: uid('L') }));
  await saveTemplate(t);
  renderTemplates();
}

async function renameTemplate(id) {
  const t = state.templates.find((x) => x.id === id);
  const answer = await ask('Rename template', [{ name: 'name', label: 'New name', value: t.name, required: true }], 'Rename');
  if (!answer || !answer.name.trim()) return;
  // The file name stays the same, so designs made from it keep their link.
  if (state.kind === 'template' && state.doc?.id === id) state.doc.name = answer.name.trim();
  t.name = answer.name.trim();
  await saveTemplate(t);
  renderTemplates();
}

async function deleteTemplate(id) {
  const t = state.templates.find((x) => x.id === id);
  if (!(await confirmBox('Delete template', `Move “${t.name}” to the Trash? Designs already made from it are not affected.`, 'Move to Trash'))) return;
  if (state.kind === 'template' && state.doc?.id === id) await closeDoc();
  await window.studio.trash(`templates/${id}.json`);
  renderTemplates();
}

export function initTemplates(show) {
  showView = show;
  $('new-template-btn').addEventListener('click', newTemplate);
  $('template-list').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.edit) { await openTemplate(b.dataset.edit); showView('editor'); }
    if (b.dataset.dup) await duplicateTemplate(b.dataset.dup);
    if (b.dataset.rename) await renameTemplate(b.dataset.rename);
    if (b.dataset.delete) await deleteTemplate(b.dataset.delete);
  });
  $('template-done').addEventListener('click', async () => { await closeDoc(); showView('templates'); });
}
