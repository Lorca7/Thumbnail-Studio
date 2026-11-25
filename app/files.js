// Reading and writing your files in the "Thumbnail Studio" folder.
//
// Everything you add or make is stored as plain files here:
//   ~/Documents/Thumbnail Studio/
//     brand/            your logos, fonts and brand.json
//     templates/        one .json file per template
//     designs/<name>/   design.json, imported images, exports/
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

module.exports = { dataDir, ensureDataFolders, isSafeName, isSafeFileName, exportsDir, saveExport };
