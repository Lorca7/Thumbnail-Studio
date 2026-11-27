// Shared bits of interface: the question pop-up and the color field.

import { $, escapeHtml, normalizeHex } from './util.js';
import { state } from './store.js';

// Ask a question in a pop-up. fields: [{ name, label, type: 'text'|'select', value, options: [{value,label}] }]
// Resolves to { name: value, … }, or null if cancelled.
export function ask(title, fields, okLabel = 'OK') {
  const dialog = $('dialog');
  $('dialog-title').textContent = title;
  $('dialog-ok').textContent = okLabel;
  $('dialog-fields').innerHTML = fields.map((f) => {
    if (f.type === 'select') {
      return `<label class="field"><span>${escapeHtml(f.label)}</span><select name="${f.name}">${f.options
        .map((o) => `<option value="${escapeHtml(o.value)}" ${o.value === f.value ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}</select></label>`;
    }
    if (f.type === 'note') return `<p class="muted small">${escapeHtml(f.label)}</p>`;
    return `<label class="field"><span>${escapeHtml(f.label)}</span><input name="${f.name}" type="text" value="${escapeHtml(f.value || '')}" autocomplete="off" ${f.required ? 'required' : ''}></label>`;
  }).join('');
  return new Promise((resolve) => {
    dialog.onclose = () => {
      if (dialog.returnValue !== 'ok') return resolve(null);
      const out = {};
      for (const f of fields) if (f.name) out[f.name] = $('dialog-fields').querySelector(`[name="${f.name}"]`).value;
      resolve(out);
    };
    dialog.returnValue = '';
    dialog.showModal();
    $('dialog-fields').querySelector('input, select')?.focus();
  });
}

export async function confirmBox(title, message, okLabel = 'OK') {
  return (await ask(title, [{ type: 'note', label: message }], okLabel)) !== null;
}

// A color picker + hex box + your brand colors as clickable swatches.
// onChange(hex, final): final = false while dragging in the picker.
export function colorField(container, onChange) {
  container.innerHTML = '';
  container.classList.add('color-field');
  const picker = Object.assign(document.createElement('input'), { type: 'color' });
  const hex = Object.assign(document.createElement('input'), { type: 'text', maxLength: 7, spellcheck: false, className: 'hex' });
  const swatches = document.createElement('span');
  swatches.className = 'swatches';
  container.append(picker, hex, swatches);

  let value = '#000000';
  const set = (v) => { value = v; picker.value = v; hex.value = v; };
  picker.addEventListener('input', () => { value = picker.value; hex.value = value; onChange(value, false); });
  picker.addEventListener('change', () => { value = picker.value; hex.value = value; onChange(value, true); });
  hex.addEventListener('change', () => {
    const v = normalizeHex(hex.value);
    if (v) { set(v); onChange(v, true); } else hex.value = value;
  });
  swatches.addEventListener('click', (e) => {
    const b = e.target.closest('[data-hex]');
    if (b) { set(b.dataset.hex); onChange(b.dataset.hex, true); }
  });

  function refreshSwatches() {
    swatches.innerHTML = (state.brand?.colors || []).map((c) =>
      `<button type="button" class="swatch" data-hex="${c.hex}" title="${escapeHtml(c.name)} ${c.hex}" style="background:${c.hex}"></button>`).join('');
  }
  refreshSwatches();
  return {
    set,
    refreshSwatches,
    setDisabled(d) { picker.disabled = d; hex.disabled = d; swatches.querySelectorAll('button').forEach((b) => { b.disabled = d; }); },
  };
}

// Short status text in the top bar.
export function setSaveState(text) {
  $('save-state').textContent = text;
}
