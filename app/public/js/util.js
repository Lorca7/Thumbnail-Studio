// Small helpers used all over the app.

export const $ = (id) => document.getElementById(id);

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// A short random id, e.g. "L-k3x9q2".
export function uid(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

// Turn whatever was typed into a safe file/folder name: "My Video #1!" → "my-video-1"
export function slugify(text, fallback = 'untitled') {
  const s = String(text || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '') // é → e
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return s || fallback;
}

export function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// Run `fn` once things have been quiet for `ms` milliseconds.
export function debounce(fn, ms) {
  let t = null;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => { t = null; fn(...args); }, ms);
  };
  wrapped.flush = (...args) => { if (t) { clearTimeout(t); t = null; fn(...args); } };
  wrapped.pending = () => t !== null;
  wrapped.cancel = () => { clearTimeout(t); t = null; };
  return wrapped;
}

export function formatBytes(n) {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)} MB` : `${Math.round(n / 1000)} KB`;
}

// Bytes from the main process arrive as a Uint8Array; some APIs want an ArrayBuffer.
export function toArrayBuffer(bytes) {
  if (bytes instanceof ArrayBuffer) return bytes;
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

// Is this file a PNG or JPG? Checked from its first bytes.
export function isPngOrJpg(bytes) {
  const b = new Uint8Array(toArrayBuffer(bytes), 0, 4);
  return (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) || (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff);
}

// Build an element from an HTML string.
export function html(str) {
  const t = document.createElement('template');
  t.innerHTML = str.trim();
  return t.content.firstElementChild;
}

// A valid "#rrggbb" color, or null.
export function normalizeHex(text) {
  let hex = String(text || '').trim();
  if (!hex.startsWith('#')) hex = `#${hex}`;
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toLowerCase() : null;
}
