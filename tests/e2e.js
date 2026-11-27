// End-to-end test: opens the real app (Electron) with a throwaway files
// folder, imports a transparent PNG and a JPG, moves and resizes them, adds
// text, exports, and checks the exported files pixel by pixel.
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

// Is pixel [r,g,b] close to the expected color? (JPG compression shifts colors slightly.)
function near(px, rgb, tol = 40) {
  return Math.abs(px[0] - rgb[0]) <= tol && Math.abs(px[1] - rgb[1]) <= tol && Math.abs(px[2] - rgb[2]) <= tol;
}

const BLUE = [37, 99, 235]; // the test photo (JPG)
const RED = [220, 38, 38]; // the square in the middle of the transparent PNG
const YELLOW = [255, 255, 0]; // the text

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-data-'));
  const inputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-input-'));
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
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.waitForFunction(() => document.getElementById('data-dir').textContent.length > 0);
    const layers = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__studio.design.variants[0].layers)));

    // The app created its folders and shows where they are.
    for (const sub of ['brand', 'templates', 'designs']) assert.ok(fs.existsSync(path.join(dataDir, sub)), `${sub}/ missing`);
    assert.strictEqual(await page.textContent('#data-dir'), dataDir);
    await page.screenshot({ path: path.join(SHOTS, '1-app-opened.png') });
    assert.ok(!(await page.isVisible('#text-props')) && !(await page.isVisible('#image-props')), 'layer settings hidden when nothing is selected');

    // Safety: unsafe names and non-images are refused, and files outside app/public aren't served.
    const refused = await page.evaluate(async () => {
      const bad = (p) => p.then(() => false, () => true);
      return {
        exportName: await bad(window.studio.saveExport('../evil', 'x.png', new Uint8Array([1]).buffer)),
        imageName: await bad(window.studio.saveImage('../evil', 'x.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0]).buffer)),
        notImage: await bad(window.studio.saveImage('ok', 'fake.png', new TextEncoder().encode('not a picture at all').buffer)),
      };
    });
    assert.deepStrictEqual(refused, { exportName: true, imageName: true, notImage: true }, 'unsafe input must be refused');
    const outside = await page.evaluate(() => fetch('studio://app/..%2fmain.js').then((r) => r.status, () => 'blocked'));
    assert.notStrictEqual(outside, 200, 'files outside app/public must not be served');

    // --- Make two test pictures: a transparent PNG and a JPG -------------------
    const made = await page.evaluate(() => {
      const png = document.createElement('canvas');
      png.width = 400; png.height = 400; // fully transparent…
      const p = png.getContext('2d');
      p.fillStyle = '#dc2626';
      p.fillRect(100, 100, 200, 200); // …except a red square in the middle
      const jpg = document.createElement('canvas');
      jpg.width = 1200; jpg.height = 800;
      const j = jpg.getContext('2d');
      j.fillStyle = '#2563eb';
      j.fillRect(0, 0, 1200, 800);
      return { png: png.toDataURL('image/png').split(',')[1], jpg: jpg.toDataURL('image/jpeg', 0.95).split(',')[1] };
    });
    const pngPath = path.join(inputDir, 'Sticker (transparent).png');
    const jpgPath = path.join(inputDir, 'photo.jpg');
    fs.writeFileSync(pngPath, Buffer.from(made.png, 'base64'));
    fs.writeFileSync(jpgPath, Buffer.from(made.jpg, 'base64'));
    const pngOriginal = fs.readFileSync(pngPath);
    const jpgOriginal = fs.readFileSync(jpgPath);

    await page.fill('#design-name', 'Test Video #1');
    await page.fill('#bg-hex', '#222222');
    await page.press('#bg-hex', 'Enter');

    // --- Import the JPG with File → Import Image… (the file picker is stubbed) --
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, jpgPath);
    await app.evaluate(({ Menu, BrowserWindow }) => {
      Menu.getApplicationMenu().getMenuItemById('import').click(undefined, BrowserWindow.getAllWindows()[0]);
    });
    await page.waitForFunction(() => window.__studio.design.variants[0].layers.length === 1);
    await page.check('#fill-bg'); // make the photo the full background

    // --- Drag and drop the transparent PNG onto the canvas ----------------------
    await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'Sticker (transparent).png', { type: 'image/png' }));
      const stage = document.getElementById('stage');
      stage.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
      stage.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, made.png);
    await page.waitForFunction(() => window.__studio.design.variants[0].layers.length === 2);
    let [photo, sticker] = await layers();
    assert.ok(photo.fill && photo.type === 'image', 'photo fills the background');
    assert.deepStrictEqual([sticker.x, sticker.y, sticker.w, sticker.h], [1720, 880, 400, 400], 'PNG starts centered at its own size');
    assert.ok(await page.isVisible('#image-props') && !(await page.isVisible('#text-props')), 'image settings shown for an image');
    await page.screenshot({ path: path.join(SHOTS, '2-images-imported.png') });

    // Screen position of a point in 3840×2160 design space.
    const rect = await page.evaluate(() => { const r = document.getElementById('preview').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width }; });
    const k = rect.w / 3840;
    const scr = (x, y) => [rect.x + x * k, rect.y + y * k];
    async function drag(from, to) {
      await page.mouse.move(...scr(...from));
      await page.mouse.down();
      await page.mouse.move(...scr(...to), { steps: 8 });
      await page.mouse.up();
    }
    const tol = 12; // one screen pixel ≈ 4 design units, so allow a few

    // --- Move the sticker: drag its center to (900, 700) ------------------------
    await drag([1920, 1080], [900, 700]);
    [, sticker] = await layers();
    assert.ok(Math.abs(sticker.x - 700) <= tol && Math.abs(sticker.y - 500) <= tol, `moved to ${sticker.x},${sticker.y}`);

    // --- Resize it: drag the bottom-right handle out so it's twice as big ------
    await drag([sticker.x + sticker.w, sticker.y + sticker.h], [sticker.x + 800, sticker.y + 760]);
    [, sticker] = await layers();
    assert.ok(Math.abs(sticker.w - 800) <= tol, `resized to width ${sticker.w}`);
    assert.strictEqual(sticker.w, sticker.h, 'proportions kept (square stays square)');

    // --- Add text, style it, drag it into place ---------------------------------
    await page.click('#add-text-btn');
    await page.fill('#text-value', 'HELLO');
    await page.fill('#text-size', '300');
    await page.evaluate(() => { const c = document.getElementById('text-color'); c.value = '#ffff00'; c.dispatchEvent(new Event('input', { bubbles: true })); });
    let text = (await layers())[2];
    assert.deepStrictEqual([text.type, text.text, text.size, text.color], ['text', 'HELLO', 300, '#ffff00']);
    await drag([text.x + 60, text.y + 150], [2600 + 60, 1500 + 150]); // grab near its left edge
    text = (await layers())[2];
    assert.ok(Math.abs(text.x - 2600) <= tol && Math.abs(text.y - 1500) <= tol, `text placed at ${text.x},${text.y}`);
    await page.screenshot({ path: path.join(SHOTS, '3-moved-resized-text.png') });

    // --- Move the originals away, then export -----------------------------------
    fs.rmSync(inputDir, { recursive: true, force: true }); // the design must not need them
    await page.click('#export-btn');
    await page.waitForSelector('#status .ok', { timeout: 60000 });
    await page.screenshot({ path: path.join(SHOTS, '4-exported.png') });

    const designDir = path.join(dataDir, 'designs', 'test-video-1');
    // Imported pictures were copied, byte for byte (so PNG transparency is kept).
    const copied = fs.readdirSync(path.join(designDir, 'images')).sort();
    assert.deepStrictEqual(copied, ['photo.jpg', 'sticker-transparent.png']);
    assert.ok(fs.readFileSync(path.join(designDir, 'images', 'sticker-transparent.png')).equals(pngOriginal), 'PNG copied exactly');
    assert.ok(fs.readFileSync(path.join(designDir, 'images', 'photo.jpg')).equals(jpgOriginal), 'JPG copied exactly');

    // Export files: names, sizes.
    const exportsDir = path.join(designDir, 'exports');
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
    fs.copyFileSync(path.join(exportsDir, jpg), path.join(SHOTS, '5-exported-thumbnail.jpg'));

    // --- Check the exported PNG pixel by pixel -----------------------------------
    const s = sticker;
    const points = {
      frameCorner: [20, 20], // photo fills the frame
      stickerCenter: [s.x + s.w / 2, s.y + s.h / 2], // red square
      stickerClearCorner: [s.x + s.w * 0.1, s.y + s.h * 0.1], // transparent part: photo shows through
      oldStickerSpot: [1920, 1080], // nothing left behind where it started
    };
    const result = await page.evaluate(async ({ b64, points, box }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const at = {};
      for (const [k, [x, y]] of Object.entries(points)) at[k] = [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data];
      // Count yellow pixels inside the text's box and in an equal-sized box elsewhere.
      const count = (x, y) => {
        const d = ctx.getImageData(x, y, box.w, box.h).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] > 220 && d[i + 1] > 220 && d[i + 2] < 60) n++;
        return n;
      };
      return { at, yellowInText: count(box.x, box.y), yellowElsewhere: count(100, 100) };
    }, { b64: pngBuf.toString('base64'), points, box: { x: text.x, y: text.y, w: 900, h: 360 } });
    console.log('Pixels:', result);
    assert.ok(near(result.at.frameCorner, BLUE), 'photo fills the frame');
    assert.ok(near(result.at.stickerCenter, RED), 'sticker is where it was moved to');
    assert.ok(near(result.at.stickerClearCorner, BLUE), 'PNG transparency kept: photo shows through');
    assert.ok(near(result.at.oldStickerSpot, BLUE), 'nothing left at the old spot');
    assert.ok(result.yellowInText > 5000, 'text is drawn where it was placed');
    assert.strictEqual(result.yellowElsewhere, 0, 'no text elsewhere');

    // --- Reorder and delete -------------------------------------------------------
    await page.click('#layer-list li:has-text("HELLO")');
    await page.click('#back-btn');
    assert.deepStrictEqual((await layers()).map((l) => l.type + (l.fill ? '-fill' : '')), ['image-fill', 'text', 'image'], 'sent back');
    assert.ok(await page.isDisabled('#back-btn'), "can't go below the background");
    await page.click('#forward-btn');
    assert.deepStrictEqual((await layers()).map((l) => l.type), ['image', 'image', 'text'], 'brought forward');
    await page.keyboard.press('Backspace');
    assert.deepStrictEqual((await layers()).map((l) => l.type), ['image', 'image'], 'deleted with the keyboard');
    assert.ok(!(await page.isDisabled('#add-text-btn')), 'text can be added again');

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
    fs.rmSync(inputDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
