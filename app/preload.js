// The bridge between the app window and your Mac's files.
//
// The window itself is not allowed to touch files (that keeps it safe).
// Instead it can call these few functions, and the main process
// (app/main.js + app/files.js) checks each request and does the work.
// Paths are always inside your Thumbnail Studio folder, e.g. "brand/brand.json".

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('studio', {
  info: () => invoke('studio:info'),
  readJson: (rel) => invoke('studio:read-json', rel),
  writeJson: (rel, data) => invoke('studio:write-json', rel, data),
  // Blocking save, used only while the window is closing.
  writeJsonSync: (rel, data) => ipcRenderer.sendSync('studio:write-json-sync', rel, data),
  readFile: (rel) => invoke('studio:read-file', rel),
  list: (rel) => invoke('studio:list', rel),
  importFile: (dir, name, bytes) => invoke('studio:import-file', dir, name, bytes),
  saveExport: (design, fileName, bytes) => invoke('studio:save-export', design, fileName, bytes),
  renameDesign: (from, to) => invoke('studio:rename-design', from, to),
  listDesigns: () => invoke('studio:list-designs'),
  trash: (rel) => invoke('studio:trash', rel),
  chooseFiles: (kind) => invoke('studio:choose-files', kind),
  reveal: (rel) => invoke('studio:reveal', rel),
  // Menu bar items (File → Import Image…, Edit → Undo, …).
  onMenu: (name, callback) => ipcRenderer.on(`menu:${name}`, () => callback()),
});
