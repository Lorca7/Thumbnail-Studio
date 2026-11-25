// Main page script: connects the buttons and fields to the design data.

import { renderVariant } from './render.js';
import { cleanDesignName, exportAll } from './export.js';

const $ = (id) => document.getElementById(id);

// The design being edited. Later steps load and autosave this as
// user-data/designs/<name>/design.json; in step 1 it lives in memory.
const design = {
  name: 'my first thumbnail',
  variants: [{ id: 'A', background: { color: '#1e293b' }, layers: [] }],
};

function currentSlug() {
  return cleanDesignName(design.name);
}

function redraw() {
  renderVariant($('preview'), design.variants[0]);
  $('design-slug').textContent = currentSlug();
}

function setStatus(html) {
  $('status').innerHTML = html;
}

function formatBytes(n) {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)} MB` : `${Math.round(n / 1000)} KB`;
}

// --- Design name ---
$('design-name').addEventListener('input', (e) => {
  design.name = e.target.value;
  redraw();
});

// --- Background color (picker and hex box stay in sync) ---
function setBackground(hex) {
  design.variants[0].background.color = hex;
  $('bg-color').value = hex;
  $('bg-hex').value = hex;
  redraw();
}
$('bg-color').addEventListener('input', (e) => setBackground(e.target.value));
$('bg-hex').addEventListener('change', (e) => {
  let hex = e.target.value.trim();
  if (!hex.startsWith('#')) hex = `#${hex}`;
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) setBackground(hex.toLowerCase());
  else e.target.value = design.variants[0].background.color; // undo a typo
});

// --- Export ---
$('export-btn').addEventListener('click', async () => {
  const btn = $('export-btn');
  btn.disabled = true;
  setStatus('Exporting…');
  try {
    const results = await exportAll(currentSlug(), design.variants);
    const items = results.flatMap((r) => [
      `<li><code>${r.png.name}</code> — ${r.png.width}×${r.png.height}, ${formatBytes(r.png.bytes)}</li>`,
      `<li><code>${r.jpg.name}</code> — ${r.jpg.width}×${r.jpg.height}, ${formatBytes(r.jpg.bytes)}</li>`,
    ]);
    setStatus(`<span class="ok">Saved to designs/${currentSlug()}/exports/</span><ul>${items.join('')}</ul>`);
  } catch (err) {
    setStatus(`<span class="error">Export failed: ${err.message}</span>`);
  } finally {
    btn.disabled = false;
  }
});

// --- Open the exports folder in Finder ---
$('reveal-btn').addEventListener('click', async () => {
  const res = await fetch(`/api/reveal?design=${encodeURIComponent(currentSlug())}`, { method: 'POST' });
  if (!res.ok) setStatus('<span class="error">Could not open the folder.</span>');
});

redraw();
