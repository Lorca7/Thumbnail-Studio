// Thumbnail Studio: the main process.
//
// This is the part of the app that starts first. It:
//   1. opens the app window (which shows the files in app/public),
//   2. sets up the menu bar,
//   3. reads and saves files when the window asks it to (see app/files.js).
// Everything stays on your Mac; the app never goes online.

'use strict';

const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, shell } = require('electron');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { pathToFileURL } = require('url');
const files = require('./files');

const PUBLIC_DIR = path.join(__dirname, 'public');
const EXAMPLES_DIR = path.join(__dirname, '..', 'examples');

// The window's pages are loaded from a private "studio://" address that
// only serves files from app/public.
protocol.registerSchemesAsPrivileged([
  { scheme: 'studio', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function serveAppFiles() {
  protocol.handle('studio', (request) => {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const filePath = path.join(PUBLIC_DIR, rel);
    // Never serve anything outside app/public.
    if (!filePath.startsWith(PUBLIC_DIR + path.sep)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

// --- Requests from the window -------------------------------------------
// Each one is a small, specific job. app/files.js checks every path.

ipcMain.handle('studio:info', () => ({ dataDir: files.dataDir(), version: app.getVersion(), platform: process.platform }));
ipcMain.handle('studio:read-json', (_e, rel) => files.readJson(rel));
ipcMain.handle('studio:write-json', (_e, rel, data) => files.writeJson(rel, data));
ipcMain.on('studio:write-json-sync', (e, rel, data) => {
  try { e.returnValue = files.writeJsonSync(rel, data); } catch (err) { e.returnValue = false; }
});
ipcMain.handle('studio:read-file', (_e, rel) => files.readFile(rel));
ipcMain.handle('studio:list', (_e, rel) => files.list(rel));
ipcMain.handle('studio:import-file', (_e, dir, name, bytes) => files.importFile(dir, name, bytes));
ipcMain.handle('studio:save-export', (_e, design, fileName, bytes) => files.saveExport(design, fileName, bytes));
ipcMain.handle('studio:rename-design', (_e, from, to) => files.renameDesign(from, to));
ipcMain.handle('studio:list-designs', () => files.listDesigns());

// Move something to the Trash (so a mistake can be undone in Finder).
ipcMain.handle('studio:trash', async (_e, rel) => {
  if (!files.isDeletable(rel)) throw new Error('Not allowed to delete this');
  const full = files.resolveRel(rel);
  try {
    await shell.trashItem(full);
  } catch {
    // No Trash available (rare): move it into "Deleted items" inside your files instead.
    const dir = files.fallbackTrashDir();
    await fsp.mkdir(dir, { recursive: true });
    await fsp.rename(full, path.join(dir, `${Date.now()}-${path.basename(full)}`));
  }
  return true;
});

// Show a "choose files" window for pictures or fonts; hand back their bytes.
ipcMain.handle('studio:choose-files', async (event, kind) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const filters = kind === 'font'
    ? [{ name: 'Fonts (TTF, OTF, WOFF2)', extensions: ['ttf', 'otf', 'woff', 'woff2'] }]
    : [{ name: 'Images (PNG, JPG)', extensions: ['png', 'jpg', 'jpeg'] }];
  const result = await dialog.showOpenDialog(win, {
    title: kind === 'font' ? 'Add fonts' : 'Choose images',
    properties: ['openFile', 'multiSelections'],
    filters,
  });
  if (result.canceled) return [];
  return Promise.all(result.filePaths.map(async (p) => ({ name: path.basename(p), bytes: await fsp.readFile(p) })));
});

// Open a folder inside your files in Finder.
ipcMain.handle('studio:reveal', async (_e, rel) => {
  const full = rel ? files.resolveRel(rel) : files.dataDir();
  await fsp.mkdir(full, { recursive: true });
  const error = await shell.openPath(full);
  if (error) throw new Error(error);
  return true;
});

// --- Window and menu ----------------------------------------------------

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1000,
    minHeight: 640,
    title: 'Thumbnail Studio',
    backgroundColor: '#18181b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  // Keep the window on the app: no navigating away, no pop-ups.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadURL('studio://app/index.html');
  return win;
}

// Menu items that the window carries out (it knows the current design).
function send(channel) {
  return (_item, win) => (win || BrowserWindow.getAllWindows()[0])?.webContents.send(channel);
}

function buildMenu() {
  const template = [
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        { id: 'new', label: 'New Thumbnail…', accelerator: 'CmdOrCtrl+N', click: send('menu:new') },
        { id: 'import', label: 'Import Image…', accelerator: 'CmdOrCtrl+I', click: send('menu:import') },
        { id: 'export', label: 'Export for YouTube', accelerator: 'CmdOrCtrl+E', click: send('menu:export') },
        { type: 'separator' },
        { label: 'Show My Files in Finder', click: () => shell.openPath(files.dataDir()) },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { id: 'undo', label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: send('menu:undo') },
        { id: 'redo', label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', click: send('menu:redo') },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'reload' }, { role: 'toggleDevTools' },
      ],
    },
    { role: 'windowMenu' },
  ];
  // appMenu only exists on macOS; drop it elsewhere (used for testing on Linux).
  if (process.platform !== 'darwin') template.shift();
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// --- Start --------------------------------------------------------------

app.setName('Thumbnail Studio');

app.whenReady().then(() => {
  files.ensureDataFolders();
  if (fs.existsSync(EXAMPLES_DIR)) files.seedIfFirstRun(EXAMPLES_DIR);
  serveAppFiles();
  buildMenu();
  createWindow();

  // macOS: clicking the Dock icon with no windows open reopens one.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Closing the last window quits the app (simpler than the usual Mac
// behaviour of staying open in the Dock).
app.on('window-all-closed', () => app.quit());
