// End-to-end test: opens the real app (Electron) with a throwaway files
// folder, exports a thumbnail and checks the files on disk.
//
// For development only — you don't need this to use the studio.
// Needs Playwright (`npm install playwright`). On Linux without a screen,
// run it under xvfb-run.
//
//   node tests/e2e.js [screenshot-folder]

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { _electron: electron } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
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

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-data-'));
  fs.mkdirSync(SHOTS, { recursive: true });
  // Test the code in this folder, or a packaged app if PACKAGED_APP is set.
  const packaged = process.env.PACKAGED_APP;
  const app = await electron.launch({
    executablePath: packaged || require(path.join(ROOT, 'node_modules', 'electron')),
    args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), ...(packaged ? [] : [ROOT])],
    env: { ...process.env, THUMBNAIL_STUDIO_DATA: dataDir },
  });
  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', (err) => errors.push(err));
    await page.setViewportSize({ width: 1280, height: 760 });
    await page.waitForFunction(() => document.getElementById('data-dir').textContent.length > 0);

    // The app created its folders and shows where they are.
    for (const sub of ['brand', 'templates', 'designs']) assert.ok(fs.existsSync(path.join(dataDir, sub)), `${sub}/ missing`);
    assert.strictEqual(await page.textContent('#data-dir'), dataDir);
    await page.screenshot({ path: path.join(SHOTS, '1-app-opened.png') });

    // Safety: unsafe names are refused, and files outside app/public aren't served.
    const refused = await page.evaluate(() =>
      window.studio.saveExport('../evil', 'x.png', new Uint8Array([1]).buffer).then(() => false, () => true));
    assert.ok(refused, 'unsafe design names must be refused');
    const outside = await page.evaluate(() => fetch('studio://app/..%2fmain.js').then((r) => r.status, () => 'blocked'));
    assert.notStrictEqual(outside, 200, 'files outside app/public must not be served');

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

    // Worst case: pure random noise compresses terribly. The JPG must
    // still come out under 2 MB.
    const noise = await page.evaluate(async () => {
      const { makeJpgUnderLimit } = await import('./js/export.js');
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

    assert.deepStrictEqual(errors, [], 'no errors in the window');
    console.log(`\nAll checks passed. Screenshots in ${SHOTS}`);
  } finally {
    await app.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
