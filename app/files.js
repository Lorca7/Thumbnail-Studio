// Reading and writing your files in the "Thumbnail Studio" folder.
//
// Everything you add or make is stored as plain files here:
//   ~/Documents/Thumbnail Studio/
//     brand/            your logos, fonts and brand.json
//     templates/        one .json file per template
//     designs/<name>/   design.json, images/ (copies of what you import), exports/
//
// This file only deals with folders and files; it knows nothing about windows.

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

// Make sure the folder and its sub-folders exist.
function ensureDataFolders() {
  for (const sub of ['brand', 'templates', 'designs']) {
    fs.mkdirSync(path.join(dataDir(), sub), { recursive: true });
  }
}

// Design names become folder names, so only allow safe characters.
// (The window already cleans names up; this is a second safety check.)
function isSafeName(name) {
  return typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9 _-]{0,79}$/.test(name);
}

// Export file names: letters, numbers, dashes, underscores, one extension.
function isSafeFileName(name) {
  return typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9 _-]{0,120}\.(png|jpg)$/.test(name);
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

// What kind of image is this? Checked from the file's first bytes, not its
// name, so a renamed file can't fool it. Returns 'png', 'jpg' or null.
function imageType(buf) {
  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47) return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  return null;
}

// "My Cat (final).PNG" → "my-cat-final"
function cleanBaseName(original) {
  const base = path.basename(String(original || '')).replace(/\.[^.]*$/, '');
  return base.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'image';
}

// Copy an imported image into designs/<design>/images/, so the design keeps
// working even if you move or delete the original. The bytes are copied
// exactly, so PNG transparency is kept. If a file with the same name but
// different content is already there, a number is added (cat-2.png).
// Returns the path relative to the design folder, e.g. "images/cat.png".
async function saveImage(design, originalName, bytes) {
  if (!isSafeName(design)) throw new Error('Invalid design name');
  const buf = Buffer.from(bytes);
  const type = imageType(buf);
  if (!type) throw new Error('Only PNG and JPG images can be imported');
  const dir = path.join(dataDir(), 'designs', design, 'images');
  await fsp.mkdir(dir, { recursive: true });
  const base = cleanBaseName(originalName);
  for (let n = 1; n < 1000; n++) {
    const fileName = `${n === 1 ? base : `${base}-${n}`}.${type}`;
    const target = path.join(dir, fileName);
    let existing = null;
    try { existing = await fsp.readFile(target); } catch {}
    if (existing && !existing.equals(buf)) continue; // name taken by a different picture
    if (!existing) await fsp.writeFile(target, buf);
    return { file: `images/${fileName}` };
  }
  throw new Error('Too many images with the same name');
}

module.exports = { dataDir, ensureDataFolders, isSafeName, isSafeFileName, exportsDir, saveExport, saveImage, imageType };
