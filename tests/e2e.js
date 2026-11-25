// End-to-end test: starts the studio with a throwaway data folder, opens it
// in a headless browser, exports a thumbnail and checks the files on disk.
//
// For development only — you don't need this to use the studio.
// Needs Playwright (`npm install playwright` then `npx playwright install chromium`).
//
//   node tests/e2e.js [screenshot-folder]

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PORT = 4399;
const URL = `http://localhost:${PORT}`;
const SHOTS = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'thumbnail-studio-shots'));

// Read width/height from a PNG file header.
function pngSize(buf) {
  assert.strictEqual(buf.toString('ascii', 1, 4), 'PNG', 'not a PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// Read width/height from a JPG by finding its "start of frame" marker.
function jpgSize(buf) {
  assert.ok(buf[0] === 0xff && buf[1] === 0xd8, 'not a JPG');
  let i = 2;
  while (i < buf.length) {
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  throw new Error('JPG size not found');
}

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${URL}/api/info`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Server did not start');
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-data-'));
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = spawn(process.execPath, ['app/server.js'], {
    cwd: ROOT,
    env: { ...process.env, THUMBNAIL_STUDIO_DATA: dataDir, THUMBNAIL_STUDIO_PORT: String(PORT) },
    stdio: 'inherit',
  });
  let browser;
  try {
    await waitForServer();

    // Server checks: data folders created, unsafe names refused.
    for (const sub of ['brand', 'templates', 'designs']) assert.ok(fs.existsSync(path.join(dataDir, sub)), `${sub}/ missing`);
    const bad = await fetch(`${URL}/api/export?design=../evil&file=x.png`, { method: 'POST', body: 'x' });
    assert.strictEqual(bad.status, 400, 'path tricks must be refused');
    const outside = await fetch(`${URL}/../server.js`);
    assert.notStrictEqual(outside.status, 200, 'files outside app/public must not be served');
    const foreign = await new Promise((resolve, reject) => {
      require('http').get({ host: '127.0.0.1', port: PORT, path: '/api/info', headers: { Host: 'evil.example' } },
        (res) => { res.resume(); resolve(res.statusCode); }).on('error', reject);
    });
    assert.strictEqual(foreign, 403, 'requests for other host names must be refused');

    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 2 });
    page.on('pageerror', (err) => { throw err; });
    await page.goto(URL);
    await page.screenshot({ path: path.join(SHOTS, '1-app-opened.png') });

    // Name the design and pick a background color.
    await page.fill('#design-name', 'Test Video #1');
    await page.fill('#bg-hex', '#e11d48');
    await page.press('#bg-hex', 'Enter');
    assert.strictEqual(await page.textContent('#design-slug'), 'test-video-1');
    await page.screenshot({ path: path.join(SHOTS, '2-color-picked.png') });

    // Export and wait for the confirmation.
    await page.click('#export-btn');
    await page.waitForSelector('#status .ok', { timeout: 30000 });
    await page.screenshot({ path: path.join(SHOTS, '3-exported.png') });

    // Check the files on disk.
    const exportsDir = path.join(dataDir, 'designs', 'test-video-1', 'exports');
    const files = fs.readdirSync(exportsDir).sort();
    console.log('Exported:', files);
    const png = files.find((f) => f.endsWith('.png'));
    const jpg = files.find((f) => f.endsWith('.jpg'));
    assert.match(png, /^test-video-1_A_\d{4}-\d{2}-\d{2}\.png$/);
    assert.match(jpg, /^test-video-1_A_\d{4}-\d{2}-\d{2}\.jpg$/);
    const pngBuf = fs.readFileSync(path.join(exportsDir, png));
    const jpgBuf = fs.readFileSync(path.join(exportsDir, jpg));
    assert.deepStrictEqual(pngSize(pngBuf), { width: 3840, height: 2160 });
    assert.deepStrictEqual(jpgSize(jpgBuf), { width: 3840, height: 2160 });
    assert.ok(jpgBuf.length <= 2_000_000, 'JPG must be under 2 MB');
    fs.copyFileSync(path.join(exportsDir, jpg), path.join(SHOTS, '4-exported-file.jpg'));

    // Worst case: pure random noise compresses terribly. The JPG must
    // still come out under 2 MB.
    const noise = await page.evaluate(async () => {
      const { makeJpgUnderLimit } = await import('/js/export.js');
      const c = document.createElement('canvas');
      c.width = 3840; c.height = 2160;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(c.width, c.height);
      for (let i = 0; i < img.data.length; i++) img.data[i] = (i % 4 === 3) ? 255 : Math.random() * 256;
      ctx.putImageData(img, 0, 0);
      const r = await makeJpgUnderLimit(c);
      return { bytes: r.blob.size, width: r.width, quality: r.quality };
    });
    console.log('Noise JPG:', noise);
    assert.ok(noise.bytes <= 2_000_000 && noise.width >= 640);

    console.log(`\nAll checks passed. Screenshots in ${SHOTS}`);
  } finally {
    if (browser) await browser.close();
    server.kill();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
