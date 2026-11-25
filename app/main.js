// Thumbnail Studio: the main process.
//
// This is the part of the app that starts first. It:
//   1. opens the app window (which shows the files in app/public),
//   2. sets up the menu bar,
//   3. saves files and opens folders when the window asks it to.
// Everything stays on your Mac; the app never goes online.

'use strict';

const { app, BrowserWindow, Menu, ipcMain, net, protocol, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const files = require('./files');

const PUBLIC_DIR = path.join(__dirname, 'public');

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

ipcMain.handle('studio:info', () => ({ dataDir: files.dataDir(), version: app.getVersion() }));

ipcMain.handle('studio:save-export', (_event, design, fileName, bytes) => files.saveExport(design, fileName, bytes));

ipcMain.handle('studio:reveal-exports', async (_event, design) => {
  const dir = files.exportsDir(design);
  await require('fs/promises').mkdir(dir, { recursive: true });
  const error = await shell.openPath(dir);
  if (error) throw new Error(error);
  return true;
});

// --- Window and menu ----------------------------------------------------

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
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

function buildMenu() {
  const template = [
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        { label: 'Show My Files in Finder', click: () => shell.openPath(files.dataDir()) },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    { role: 'editMenu' },
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
