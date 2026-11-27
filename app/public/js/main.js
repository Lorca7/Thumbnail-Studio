// Start-up: load your brand kit, settings and templates, set up each
// screen, and reopen the design you were last working on.

import { $ } from './util.js';
import { state, on, undo, redo, loadBrandAndSettings, loadTemplates, openDesign, flushAllSync } from './store.js';
import { loadBuiltInFonts } from './assets.js';
import { initEditor, refresh as refreshEditor, exportDesign } from './views/editor-view.js';
import { initHome, renderHome } from './views/home.js';
import { initBrand, renderBrand } from './views/brand.js';
import { initTemplates, renderTemplates } from './views/templates.js';
import { initLab, renderLab } from './views/lab.js';
import { setSaveState } from './ui.js';

const VIEWS = ['home', 'editor', 'brand', 'templates', 'lab'];
let current = 'home';

// Switch screens (the tabs at the top).
export function showView(name) {
  current = name;
  for (const v of VIEWS) $(`view-${v}`).hidden = v !== name;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.view === name));
  if (name === 'home') renderHome();
  if (name === 'editor') refreshEditor();
  if (name === 'brand') renderBrand();
  if (name === 'templates') renderTemplates();
  if (name === 'lab') renderLab();
}

// Let the automated test look at the app's state (harmless otherwise).
window.__studio = { state, showView };

async function start() {
  await loadBuiltInFonts().catch(() => {});
  const failedFonts = await loadBrandAndSettings();
  await loadTemplates();
  const info = await window.studio.info();
  $('data-dir').textContent = info.dataDir;

  initEditor();
  initHome(showView);
  initBrand();
  initTemplates(showView);
  initLab(() => current === 'lab');

  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (b) showView(b.dataset.view);
  });

  // Menu bar: Undo/Redo act on text boxes while typing, otherwise on the design.
  const typing = () => ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
  window.studio.onMenu('undo', () => (typing() ? document.execCommand('undo') : undo()));
  window.studio.onMenu('redo', () => (typing() ? document.execCommand('redo') : redo()));
  window.studio.onMenu('export', () => { if (state.kind === 'design') exportDesign(); });

  // "Saving… / Saved" in the top bar.
  on('saving', () => setSaveState('Saving…'));
  on('saved', (r) => setSaveState(r.ok ? 'All changes saved' : `Couldn't save: ${r.error}`));
  on('change', () => { if (current === 'lab') renderLab(); });

  // Never lose the last few changes when the window closes.
  window.addEventListener('beforeunload', flushAllSync);

  // Dropping a file outside the canvas does nothing (instead of opening it).
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  if (failedFonts.length) setSaveState(`Some fonts couldn't be loaded: ${failedFonts.join(', ')}`);

  // Reopen the last design, if it still exists.
  if (state.settings.lastDesign) {
    try {
      await openDesign(state.settings.lastDesign);
      showView('editor');
      return;
    } catch { /* it was deleted or renamed outside the app */ }
  }
  showView('home');
}

start();
