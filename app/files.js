// Reading and writing your files in the "Thumbnail Studio" folder.
//
// Everything you add or make is stored as plain files here:
//   ~/Documents/Thumbnail Studio/
//     settings.json      app settings (e.g. the title length warning)
//     brand/             brand.json (colors, text styles, corner mark) plus
//       logos/ fonts/ icon/   the logo, font and channel icon files you add
//     templates/         one .json file per template
//     designs/<name>/    design.json, images/ (copies of what you import), exports/
//     lab/               comparison screenshots for the Lab's feed preview
//
// This file only deals with folders and files; it knows nothing about windows.
// Every path coming from the window is checked before use, so the window can
// only touch files inside this folder, and only the kinds it should.

'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

// Where your files live. Tests (or you) can point it elsewhere with
// the THUMBNAIL_STUDIO_DATA environment variable.
function dataDir() {
  return path.resolve(process.env.THUMBNAIL_STUDIO_DATA || path.join(os.homedir(), 'Documents', 'Thumbnail Studio'));
}

// --- Name and path rules ----------------------------------------------------

// Design folders and template files use simple names: "my-video-1".
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const isSlug = (s) => typeof s === 'string' && SLUG.test(s);

// Older name check kept for exports (letters, numbers, spaces, - and _).
function isSafeName(name) {
  return typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9 _-]{0,79}$/.test(name);
}

// Export file names: letters, numbers, dashes, underscores, one extension.
function isSafeFileName(name) {
  return typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9 _-]{0,120}\.(png|jpg)$/.test(name);
}

// A path inside the data folder, like "brand/logos/cat.png". No "..", no
// hidden files, no absolute paths. Returns the full path on disk.
function resolveRel(rel) {
  if (typeof rel !== 'string' || rel.length === 0 || rel.length > 300) throw new Error('Invalid path');
  const parts = rel.split('/');
  for (const p of parts) {
    if (!p || p.startsWith('.') || !/^[A-Za-z0-9 _.()-]+$/.test(p)) throw new Error('Invalid path');
  }
  const full = path.join(dataDir(), ...parts);
  if (!full.startsWith(dataDir() + path.sep)) throw new Error('Invalid path');
  return full;
}

// Which JSON files the window may write.
function isWritableJson(rel) {
  if (rel === 'brand/brand.json' || rel === 'settings.json') return true;
  let m = rel.match(/^templates\/([^/]+)\.json$/);
  if (m) return isSlug(m[1]);
  m = rel.match(/^designs\/([^/]+)\/design\.json$/);
  if (m) return isSlug(m[1]);
  return false;
}

// Which folders files may be imported into, and what kind each accepts.
function importKind(dir) {
  if (dir === 'brand/logos' || dir === 'brand/icon' || dir === 'lab') return 'image';
  if (dir === 'brand/fonts') return 'font';
  const m = dir.match(/^designs\/([^/]+)\/images$/);
  if (m && isSlug(m[1])) return 'image';
  return null;
}

// Which things may be moved to the Trash.
function isDeletable(rel) {
  return (
    /^templates\/[a-z0-9][a-z0-9-]*\.json$/.test(rel) ||
    /^brand\/(logos|fonts|icon)\/[^/]+$/.test(rel) ||
    /^lab\/[^/]+$/.test(rel) ||
    /^designs\/[a-z0-9][a-z0-9-]*$/.test(rel)
  );
}

// --- File types (checked from the file's first bytes, not its name) --------

function imageType(buf) {
  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47) return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  return null;
}

function fontType(buf) {
  if (buf.length < 4) return null;
  const tag = buf.toString('latin1', 0, 4);
  if (tag === 'wOF2') return 'woff2';
  if (tag === 'wOFF') return 'woff';
  if (tag === 'OTTO') return 'otf';
  if (buf.readUInt32BE(0) === 0x00010000 || tag === 'true') return 'ttf';
  return null;
}

// "My Cat (final).PNG" → "my-cat-final"
function cleanBaseName(original) {
  const base = path.basename(String(original || '')).replace(/\.[^.]*$/, '');
  return base.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'file';
}

// --- Folders ------------------------------------------------------------------

function ensureDataFolders() {
  for (const sub of ['brand/logos', 'brand/fonts', 'brand/icon', 'templates', 'designs', 'lab']) {
    fs.mkdirSync(path.join(dataDir(), sub), { recursive: true });
  }
}

// The first time the app runs, add the neutral examples (a sample logo and
// two plain starter templates) so there's something to start from.
// They're ordinary files you can delete. Runs only if brand.json is missing.
function seedIfFirstRun(examplesDir) {
  const brandFile = path.join(dataDir(), 'brand', 'brand.json');
  if (fs.existsSync(brandFile)) return false;
  const logo = fs.readFileSync(path.join(examplesDir, 'brand', 'sample-logo.png'));
  fs.writeFileSync(path.join(dataDir(), 'brand', 'logos', 'sample-logo.png'), logo);
  const brand = {
    version: 1,
    logos: [{ id: 'sample-logo', name: 'Sample logo (example)', file: 'brand/logos/sample-logo.png' }],
    colors: [],
    fonts: [],
    textStyles: [],
    cornerMark: { enabled: false, logoId: 'sample-logo', corner: 'tl', size: 300, margin: 60 },
    channelIcon: null,
  };
  const tplDir = path.join(examplesDir, 'templates');
  for (const name of fs.readdirSync(tplDir)) {
    if (!name.endsWith('.json')) continue;
    const target = path.join(dataDir(), 'templates', name);
    if (!fs.existsSync(target)) fs.writeFileSync(target, fs.readFileSync(path.join(tplDir, name)));
  }
  const settings = path.join(dataDir(), 'settings.json');
  if (!fs.existsSync(settings)) fs.writeFileSync(settings, JSON.stringify({ titleLimit: 60, lastDesign: null }, null, 2));
  fs.writeFileSync(brandFile, JSON.stringify(brand, null, 2));
  return true;
}

// --- Reading and writing --------------------------------------------------------

async function readJson(rel) {
  try {
    return JSON.parse(await fsp.readFile(resolveRel(rel), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

// Write JSON safely: write a temporary file, then swap it in, so a crash
// can never leave a half-written file.
async function writeJson(rel, data) {
  if (!isWritableJson(rel)) throw new Error('Not allowed to write this file');
  const full = resolveRel(rel);
  await fsp.mkdir(path.dirname(full), { recursive: true });
  const tmp = `${full}.saving`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2));
  await fsp.rename(tmp, full);
  return true;
}

// Same, but blocking: used when the window is closing.
function writeJsonSync(rel, data) {
  if (!isWritableJson(rel)) throw new Error('Not allowed to write this file');
  const full = resolveRel(rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(`${full}.saving`, JSON.stringify(data, null, 2));
  fs.renameSync(`${full}.saving`, full);
  return true;
}

async function readFile(rel) {
  return fsp.readFile(resolveRel(rel));
}

async function list(relDir) {
  try {
    const entries = await fsp.readdir(resolveRel(relDir), { withFileTypes: true });
    return entries.filter((e) => !e.name.startsWith('.')).map((e) => ({ name: e.name, isDir: e.isDirectory() }));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

// Copy an imported file (picture or font) into one of the allowed folders.
// The bytes are copied exactly, so PNG transparency is kept. If a file with
// the same name but different content is already there, a number is added
// (cat-2.png). Returns its path inside the data folder, e.g. "brand/logos/cat.png".
async function importFile(dir, originalName, bytes) {
  const kind = importKind(dir);
  if (!kind) throw new Error('Not allowed to import into this folder');
  const buf = Buffer.from(bytes);
  const ext = kind === 'image' ? imageType(buf) : fontType(buf);
  if (!ext) throw new Error(kind === 'image' ? 'Only PNG and JPG images can be imported' : 'Only .ttf, .otf, .woff and .woff2 fonts can be added');
  const full = resolveRel(dir);
  await fsp.mkdir(full, { recursive: true });
  const base = cleanBaseName(originalName);
  for (let n = 1; n < 1000; n++) {
    const fileName = `${n === 1 ? base : `${base}-${n}`}.${ext}`;
    const target = path.join(full, fileName);
    let existing = null;
    try { existing = await fsp.readFile(target); } catch {}
    if (existing && !existing.equals(buf)) continue; // name taken by a different file
    if (!existing) await fsp.writeFile(target, buf);
    return { path: `${dir}/${fileName}`, type: ext };
  }
  throw new Error('Too many files with the same name');
}

function exportsDir(design) {
  if (!isSafeName(design)) throw new Error('Invalid design name');
  return path.join(dataDir(), 'designs', design, 'exports');
}

// Save one exported image into designs/<design>/exports/.
async function saveExport(design, fileName, bytes) {
  if (!isSafeFileName(fileName)) throw new Error('Invalid file name');
  const buf = Buffer.from(bytes);
  if (buf.length === 0) throw new Error('Empty file');
  const dir = exportsDir(design);
  await fsp.mkdir(dir, { recursive: true });
  const target = path.join(dir, fileName);
  await fsp.writeFile(target, buf);
  return { saved: path.relative(dataDir(), target), bytes: buf.length };
}

// Rename a design's folder (its images and exports move with it).
async function renameDesign(from, to) {
  if (!isSlug(from) || !isSlug(to)) throw new Error('Invalid design name');
  const src = path.join(dataDir(), 'designs', from);
  const dst = path.join(dataDir(), 'designs', to);
  if (fs.existsSync(dst)) throw new Error('A design with that name already exists');
  await fsp.rename(src, dst);
  return true;
}

// Every design with its basic info and exported JPGs (for Home and the
// Lab's series wall).
async function listDesigns() {
  const out = [];
  for (const entry of await list('designs')) {
    if (!entry.isDir || !isSlug(entry.name)) continue;
    const design = await readJson(`designs/${entry.name}/design.json`).catch(() => null);
    if (!design) continue;
    const exportFiles = (await list(`designs/${entry.name}/exports`)).map((e) => e.name).filter((n) => n.endsWith('.jpg')).sort();
    out.push({
      slug: entry.name,
      name: design.name || entry.name,
      templateId: design.templateId || null,
      updatedAt: design.updatedAt || null,
      exports: exportFiles,
    });
  }
  out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return out;
}

// Where something goes when "deleted": a folder inside your files, so
// nothing is ever lost for good by accident (used if the Mac Trash isn't available).
function fallbackTrashDir() {
  return path.join(dataDir(), 'Deleted items');
}

module.exports = {
  dataDir, ensureDataFolders, seedIfFirstRun,
  isSlug, isSafeName, isSafeFileName, resolveRel, isDeletable, fallbackTrashDir,
  imageType, fontType,
  readJson, writeJson, writeJsonSync, readFile, list, importFile,
  exportsDir, saveExport, renameDesign, listDesigns,
};
