// Exporting thumbnails ready for YouTube.
//
// For each variant we make two files in user-data/designs/<name>/exports/:
//   <design-name>_<variant>_<date>.png   full-size master, 3840×2160
//   <design-name>_<variant>_<date>.jpg   same picture, kept under 2 MB so it
//                                        also uploads from the YouTube phone app
// Exporting the same design and variant again on the same day replaces
// that day's files, so the folder always holds the latest version.

import { YOUTUBE } from './youtube-rules.js';
import { renderFullSize } from './render.js';

// Turn whatever the user typed into a safe file/folder name.
// "My Video #1!" → "my-video-1"
export function cleanDesignName(text) {
  const name = String(text || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '') // é → e
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return name || 'untitled';
}

// Today's date as YYYY-MM-DD in your local time zone.
export function todayStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function exportFileName(designName, variantId, ext, date = new Date()) {
  return `${designName}_${variantId}_${todayStamp(date)}.${ext}`;
}

// canvas.toBlob as a Promise.
function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(`Could not create ${type}`))), type, quality);
  });
}

// Make a JPG under the phone upload limit. Start at high quality and step
// down until it fits. If even low quality is too big (very rare), shrink the
// picture to 1920×1080, which is still well above YouTube's minimum width.
export async function makeJpgUnderLimit(canvas, maxBytes = YOUTUBE.mobileMaxBytes) {
  for (const quality of [0.95, 0.92, 0.88, 0.84, 0.8, 0.75, 0.7, 0.65, 0.6]) {
    const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
    if (blob.size <= maxBytes) return { blob, quality, width: canvas.width, height: canvas.height };
  }
  const small = document.createElement('canvas');
  small.width = 1920;
  small.height = 1080;
  const ctx = small.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, small.width, small.height);
  for (const quality of [0.92, 0.85, 0.75, 0.65, 0.5]) {
    const blob = await canvasToBlob(small, 'image/jpeg', quality);
    if (blob.size <= maxBytes) return { blob, quality, width: small.width, height: small.height };
  }
  throw new Error('Could not get the JPG under the size limit');
}

// Send one finished file to the local server, which saves it to disk.
async function saveExport(designName, fileName, blob) {
  const params = new URLSearchParams({ design: designName, file: fileName });
  const res = await fetch(`/api/export?${params}`, { method: 'POST', body: blob });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Saving failed');
  return data;
}

// Export one variant: master PNG + phone-safe JPG. Returns a summary.
export async function exportVariant(designName, variant, date = new Date()) {
  const canvas = renderFullSize(variant);

  const png = await canvasToBlob(canvas, 'image/png');
  const pngName = exportFileName(designName, variant.id, 'png', date);
  await saveExport(designName, pngName, png);

  const jpg = await makeJpgUnderLimit(canvas);
  const jpgName = exportFileName(designName, variant.id, 'jpg', date);
  await saveExport(designName, jpgName, jpg.blob);

  return {
    variant: variant.id,
    png: { name: pngName, bytes: png.size, width: canvas.width, height: canvas.height },
    jpg: { name: jpgName, bytes: jpg.blob.size, width: jpg.width, height: jpg.height, quality: jpg.quality },
  };
}

// Export every variant of a design, one after the other.
export async function exportAll(designName, variants) {
  const date = new Date(); // same date stamp for the whole batch
  const results = [];
  for (const variant of variants) results.push(await exportVariant(designName, variant, date));
  return results;
}
