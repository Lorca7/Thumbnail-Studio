// The bridge between the app window and your Mac's files.
//
// The window itself is not allowed to touch files (that keeps it safe).
// Instead it can call these few functions, and the main process
// (app/main.js) does the actual saving and opening.

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studio', {
  // Where your files live, e.g. /Users/you/Documents/Thumbnail Studio
  info: () => ipcRenderer.invoke('studio:info'),
  // Save one exported image (bytes = ArrayBuffer) into the design's exports folder.
  saveExport: (design, fileName, bytes) => ipcRenderer.invoke('studio:save-export', design, fileName, bytes),
  // Copy an imported picture into the design's images folder.
  saveImage: (design, originalName, bytes) => ipcRenderer.invoke('studio:save-image', design, originalName, bytes),
  // Show the "Import images" file picker; resolves to [{ name, bytes }].
  chooseImages: () => ipcRenderer.invoke('studio:choose-images'),
  // Show the design's exports folder in Finder.
  revealExports: (design) => ipcRenderer.invoke('studio:reveal-exports', design),
  // Run `callback` when File → Import Image… is chosen in the menu bar.
  onMenuImport: (callback) => ipcRenderer.on('menu:import', () => callback()),
});
