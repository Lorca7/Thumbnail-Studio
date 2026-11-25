// Thumbnail Studio — small local server.
//
// What it does:
//   1. Serves the web interface (the files in app/public) to your browser.
//   2. Reads and writes your files in the user-data folder (brand kit,
//      templates, designs, exports). Nothing ever leaves your computer.
//
// It uses only what comes with Node.js — no extra packages to install.
// It only listens on your own computer (127.0.0.1), never on the network.

'use strict';

const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(__dirname, 'public');
// Your own files live here. Can be moved by setting THUMBNAIL_STUDIO_DATA.
const DATA_DIR = path.resolve(process.env.THUMBNAIL_STUDIO_DATA || path.join(ROOT_DIR, 'user-data'));
const PORT = Number(process.env.THUMBNAIL_STUDIO_PORT || 4317);
const HOST = '127.0.0.1';
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB, plenty for a 4K PNG
const OPEN_BROWSER = process.argv.includes('--open');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

// Make sure the user-data folder and its sub-folders exist.
function ensureDataFolders() {
  for (const sub of ['brand', 'templates', 'designs']) {
    fs.mkdirSync(path.join(DATA_DIR, sub), { recursive: true });
  }
}

// Design names become folder names, so only allow safe characters.
// (The browser already cleans names up; this is a second safety check.)
function isSafeName(name) {
  return typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9 _-]{0,79}$/.test(name);
}

// Export file names: letters, numbers, dashes, underscores, one extension.
function isSafeFileName(name) {
  return typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9 _-]{0,120}\.(png|jpg)$/.test(name);
}

function designDir(name) {
  return path.join(DATA_DIR, 'designs', name);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function sendJson(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

// Read the whole request body into a Buffer (with a size limit).
function readBody(req, limit = MAX_UPLOAD_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('File is too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Open a folder in Finder (macOS only; does nothing elsewhere).
function revealInFinder(folder) {
  if (process.platform === 'darwin') execFile('open', [folder]);
}

// Only accept requests addressed to this computer. This blocks other
// websites from talking to the studio through tricks like DNS rebinding.
function isLocalRequest(req) {
  const host = (req.headers.host || '').replace(/:\d+$/, '');
  if (!['localhost', '127.0.0.1'].includes(host)) return false;
  const origin = req.headers.origin;
  if (origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// API routes  (everything under /api/)
// ---------------------------------------------------------------------------

async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;

  // Basic info, also used by the launcher to see if the studio is running.
  if (route === 'GET /api/info') {
    return sendJson(res, 200, { app: 'thumbnail-studio', dataDir: DATA_DIR, platform: process.platform });
  }

  // Save one exported image into user-data/designs/<design>/exports/.
  // The browser draws the image and sends the finished file bytes.
  if (route === 'POST /api/export') {
    const design = url.searchParams.get('design');
    const file = url.searchParams.get('file');
    if (!isSafeName(design)) return sendError(res, 400, 'Invalid design name');
    if (!isSafeFileName(file)) return sendError(res, 400, 'Invalid file name');
    const body = await readBody(req);
    if (body.length === 0) return sendError(res, 400, 'Empty file');
    const dir = path.join(designDir(design), 'exports');
    await fsp.mkdir(dir, { recursive: true });
    const target = path.join(dir, file);
    await fsp.writeFile(target, body);
    return sendJson(res, 200, { saved: path.relative(DATA_DIR, target), bytes: body.length });
  }

  // Open a design's exports folder in Finder.
  if (route === 'POST /api/reveal') {
    const design = url.searchParams.get('design');
    if (!isSafeName(design)) return sendError(res, 400, 'Invalid design name');
    const dir = path.join(designDir(design), 'exports');
    await fsp.mkdir(dir, { recursive: true });
    revealInFinder(dir);
    return sendJson(res, 200, { opened: path.relative(DATA_DIR, dir) });
  }

  return sendError(res, 404, 'Unknown API route');
}

// ---------------------------------------------------------------------------
// Static files (the web interface)
// ---------------------------------------------------------------------------

async function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const filePath = path.join(PUBLIC_DIR, rel);
  // Never serve anything outside app/public.
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) return sendError(res, 403, 'Forbidden');
  try {
    const data = await fsp.readFile(filePath);
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    sendError(res, 404, 'Not found');
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  try {
    if (!isLocalRequest(req)) return sendError(res, 403, 'Only local requests are allowed');
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendError(res, 405, 'Method not allowed');
    return await serveStatic(req, res, url);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendError(res, err.status || 500, err.message || 'Server error');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPort ${PORT} is already in use by another program.`);
    console.error('Close that program, or start the studio on another port, e.g.:');
    console.error(`  THUMBNAIL_STUDIO_PORT=4318 node app/server.js --open\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

ensureDataFolders();
server.listen(PORT, HOST, () => {
  const url = `http://localhost:${PORT}`;
  console.log('');
  console.log('  Thumbnail Studio is running.');
  console.log(`  Open:        ${url}`);
  console.log(`  Your files:  ${DATA_DIR}`);
  console.log('  To stop it, close this window (or press Control-C).');
  console.log('');
  if (OPEN_BROWSER && process.platform === 'darwin') execFile('open', [url]);
});
