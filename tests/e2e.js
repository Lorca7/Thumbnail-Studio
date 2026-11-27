// End-to-end test of the whole app, following the brief's "done when" list:
// add a logo, colors and a font → make a template → start a thumbnail from
// it → add an image and three words → make three variants → check them in
// the Lab (feed preview, squint test, …) → export upload-ready files →
// close and reopen the app and check everything is still there.
// Along the way it checks layers, locks, snapping, rotation, pixel-art mode,
// hide/show, undo/redo and the bottom-right warning, and it checks the
// exported PNGs pixel by pixel.
//
// For development only — you don't need this to use the studio.
// Needs Playwright (`npm install playwright`). On Linux run it under xvfb-run.
//
//   node tests/e2e.js [screenshot-folder]
//   PACKAGED_APP=<path to built app binary> node tests/e2e.js   (test a built app)

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { _electron: electron } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'thumbnail-studio-shots'));
const W = 3840;
const H = 2160;

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

const GREEN = [34, 197, 94]; // the test logo
const BLUE = [37, 99, 235]; // the test photo
const RED = [255, 59, 48]; // the brand color

async function launch(dataDir) {
  const packaged = process.env.PACKAGED_APP;
  const app = await electron.launch({
    executablePath: packaged || require(path.join(ROOT, 'node_modules', 'electron')),
    args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), ...(packaged ? [] : [ROOT])],
    env: { ...process.env, THUMBNAIL_STUDIO_DATA: dataDir },
  });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (err) => errors.push(err));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForFunction(() => window.__studio && document.getElementById('data-dir').textContent.length > 0);
  return { app, page, errors };
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-data-'));
  const inputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-input-'));
  fs.mkdirSync(SHOTS, { recursive: true });
  const started = Date.now();
  let { app, page, errors } = await launch(dataDir);
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  const S = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__studio.state)));
  const layersNow = async () => { const s = await S(); return s.kind === 'template' ? s.doc.layers : s.doc.variants[s.variantIndex].layers; };
  // The file picker is replaced by one that "picks" the given files.
  const pickFiles = (files) => app.evaluate(({ dialog }, f) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: f }); }, files);
  const answer = async (values) => {
    await page.waitForSelector('#dialog[open]');
    for (const [name, v] of Object.entries(values)) {
      const el = page.locator(`#dialog-fields [name="${name}"]`);
      if ((await el.evaluate((e) => e.tagName)) === 'SELECT') await el.selectOption(v); else await el.fill(v);
    }
    await page.click('#dialog-ok');
  };
  const tab = (v) => page.click(`#tabs [data-view="${v}"]`);
  const setField = async (sel, value) => { await page.fill(sel, String(value)); await page.dispatchEvent(sel, 'change'); };

  try {
    // ---------------------------------------------------------------- first run
    for (const sub of ['brand/logos', 'brand/fonts', 'templates', 'designs', 'lab']) assert.ok(fs.existsSync(path.join(dataDir, sub)), `${sub}/ missing`);
    assert.ok(fs.existsSync(path.join(dataDir, 'brand', 'logos', 'sample-logo.png')), 'sample logo seeded');
    assert.strictEqual(fs.readdirSync(path.join(dataDir, 'templates')).length, 2, 'two starter templates seeded');
    await shot('01-first-run');

    // Safety: unsafe paths are refused.
    const refused = await page.evaluate(async () => {
      const bad = (p) => p.then(() => false, () => true);
      return [
        await bad(window.studio.readFile('../secret.txt')),
        await bad(window.studio.writeJson('brand/../../evil.json', {})),
        await bad(window.studio.writeJson('app.json', {})),
        await bad(window.studio.importFile('brand/logos', 'x.png', new TextEncoder().encode('not a picture').buffer)),
        await bad(window.studio.importFile('../outside', 'x.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0]).buffer)),
        await bad(window.studio.trash('settings.json')),
      ];
    });
    assert.deepStrictEqual(refused, [true, true, true, true, true, true], 'unsafe requests must be refused');

    // ---------------------------------------------------------------- test files
    const made = await page.evaluate(() => {
      const make = (w, h, draw, type) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')); return c.toDataURL(type).split(',')[1]; };
      return {
        logo: make(400, 200, (x) => { x.fillStyle = '#22c55e'; x.fillRect(0, 0, 400, 200); }, 'image/png'),
        photo: make(800, 600, (x) => { x.fillStyle = '#2563eb'; x.fillRect(0, 0, 800, 600); }, 'image/jpeg'),
        pixel: make(16, 16, (x) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) { x.fillStyle = (i + j) % 2 ? '#000' : '#fff'; x.fillRect(i, j, 1, 1); } }, 'image/png'),
        icon: make(256, 256, (x) => { x.fillStyle = '#a855f7'; x.fillRect(0, 0, 256, 256); }, 'image/png'),
      };
    });
    const file = (name, b64) => { const p = path.join(inputDir, name); fs.writeFileSync(p, Buffer.from(b64, 'base64')); return p; };
    const logoPath = file('My Logo.png', made.logo);
    const iconPath = file('channel icon.png', made.icon);
    const fontPath = path.join(inputDir, 'My Brand Font.woff2');
    fs.copyFileSync(path.join(ROOT, 'app', 'public', 'fonts', 'bebas-neue.woff2'), fontPath);

    // ---------------------------------------------------------------- brand kit
    await tab('brand');
    await pickFiles([logoPath]);
    await page.click('#add-logos-btn');
    await page.waitForFunction(() => window.__studio.state.brand.logos.length === 2);
    await page.fill('#new-color-hex', '#ff3b30');
    await page.dispatchEvent('#new-color-hex', 'change');
    await page.fill('#new-color-name', 'Brand red');
    await page.click('#add-color-btn');
    await pickFiles([fontPath]);
    await page.click('#add-fonts-btn');
    await page.waitForFunction(() => window.__studio.state.brand.fonts.length === 1);
    let s = await S();
    const myLogo = s.brand.logos.find((l) => l.name === 'My Logo');
    const myFont = s.brand.fonts[0];
    assert.ok(myLogo && myFont.name === 'My Brand Font');
    assert.ok(await page.evaluate((fam) => document.fonts.check(`40px "${fam}"`), `ts-${myFont.id}`), 'my font is loaded');

    // A text style that uses my font.
    await page.click('#add-style-btn');
    const card = '#style-list .style-card';
    await page.fill(`${card} [data-f="name"]`, 'Headline');
    await page.selectOption(`${card} [data-f="font"]`, `ts-${myFont.id}`);
    await page.fill(`${card} [data-f="size"]`, '320');
    await page.evaluate(() => { const c = document.querySelector('#style-list .style-card [data-color-field="color"] input[type=color]'); c.value = '#ffcc00'; c.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.dispatchEvent(`${card} [data-f="size"]`, 'change');

    // Corner mark: my logo, top right, 400 px wide.
    await page.check('#cm-enabled');
    await page.selectOption('#cm-logo', myLogo.id);
    await page.selectOption('#cm-corner', 'tr');
    await setField('#cm-size', 400);
    await page.waitForTimeout(400); // brand.json is saved a moment after changes
    s = await S();
    assert.deepStrictEqual(s.brand.cornerMark, { enabled: true, logoId: myLogo.id, corner: 'tr', size: 400, margin: 60 });
    assert.strictEqual(s.brand.textStyles[0].font, `ts-${myFont.id}`);
    assert.strictEqual(s.brand.textStyles[0].color, '#ffcc00');
    await shot('02-brand-kit');

    // ---------------------------------------------------------------- template
    await tab('templates');
    await page.click('#new-template-btn');
    await answer({ name: 'My Series' });
    await page.waitForFunction(() => window.__studio.state.kind === 'template');
    // Image slot named "Hero", locked in place.
    await page.click('#add-image-btn');
    await setField('#p-slot', 'Hero');
    await page.check('#p-lock-position');
    await page.check('#p-lock-size');
    // Text slot using my "Headline" style, style locked.
    await page.click('#add-text-btn');
    await setField('#p-slot', 'Words');
    await page.selectOption('#p-style', s.brand.textStyles[0].id);
    await page.check('#p-lock-style');

    // Screen ↔ design coordinates for mouse drags.
    const rect = await page.evaluate(() => { const r = document.getElementById('preview').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width }; });
    const k = rect.w / W;
    const scr = (x, y) => [rect.x + x * k, rect.y + y * k];
    async function drag(from, to, opts = {}) {
      await page.mouse.move(...scr(...from));
      await page.mouse.down();
      await page.mouse.move(...scr(...to), { steps: 10 });
      if (opts.shot) await shot(opts.shot);
      await page.mouse.up();
    }
    const bounds = (layer) => page.evaluate(async (l) => (await import('./js/render.js')).layerBounds(l), layer);

    // Drag the text up near the top, slightly off center: it should snap to the exact center line.
    let text = (await layersNow()).find((l) => l.type === 'text');
    let b = await bounds(text);
    await drag([b.x + b.w / 2, b.y + b.h / 2], [W / 2 + 14, 330], { shot: '03-snapping' });
    text = (await layersNow()).find((l) => l.type === 'text');
    b = await bounds(text);
    assert.ok(Math.abs(b.x + b.w / 2 - W / 2) < 1, `text snapped to center (center at ${b.x + b.w / 2})`);
    s = await S();
    assert.ok(s.doc.cornerMark, 'templates use the corner mark by default');
    const cmLayer = s.doc.layers.find((l) => l.role === 'cornerMark');
    assert.deepStrictEqual([cmLayer.x, cmLayer.y, cmLayer.w, cmLayer.h], [3840 - 60 - 400, 60, 400, 200], 'corner mark placed top right');
    await shot('04-template-editor');
    await page.click('#template-done');
    await page.waitForFunction(() => document.querySelectorAll('#template-list .card').length === 3);
    const tplId = (await S()).templates.find((t) => t.name === 'My Series').id;
    assert.ok(fs.existsSync(path.join(dataDir, 'templates', `${tplId}.json`)), 'template saved as a file');

    // ---------------------------------------------------------------- new thumbnail from it
    await tab('home');
    await page.click('#new-design-btn');
    await answer({ name: 'Episode 1', template: tplId });
    await page.waitForFunction(() => window.__studio.state.kind === 'design');
    s = await S();
    assert.strictEqual(s.doc.slug, 'episode-1');
    let hero = s.doc.variants[0].layers.find((l) => l.slot === 'Hero');
    assert.strictEqual(hero.file, null, 'slot starts empty');

    // Drop a photo onto the Hero slot.
    const dropAt = (b64, name, type, x, y) => page.evaluate(async ({ b64, name, type, x, y }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], name, { type }));
      const r = document.getElementById('preview').getBoundingClientRect();
      const opts = { dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.left + (x / 3840) * r.width, clientY: r.top + (y / 2160) * r.height };
      const stage = document.getElementById('stage');
      stage.dispatchEvent(new DragEvent('dragover', opts));
      stage.dispatchEvent(new DragEvent('drop', opts));
    }, { b64, name, type, x, y });
    await dropAt(made.photo, 'photo.jpg', 'image/jpeg', hero.x + 100, hero.y + 100);
    await page.waitForFunction(() => window.__studio.state.doc.variants[0].layers.some((l) => l.slot === 'Hero' && l.file));
    hero = (await layersNow()).find((l) => l.slot === 'Hero');
    // 800×600 photo fitted inside the 1920×1080 slot at (960, 540): 1440×1080, centered.
    assert.deepStrictEqual([hero.x, hero.y, hero.w, hero.h], [1200, 540, 1440, 1080], 'photo fitted into the slot');

    // Locked slot can't be dragged.
    await drag([hero.x + 200, hero.y + 200], [hero.x + 900, hero.y + 500]);
    const heroAfter = (await layersNow()).find((l) => l.slot === 'Hero');
    assert.deepStrictEqual([heroAfter.x, heroAfter.y], [hero.x, hero.y], 'locked position stays put');

    // Three words.
    await page.click('#layer-list li:has-text("Words")');
    await page.fill('#p-text', 'THREE BIG WORDS');
    await page.dispatchEvent('#p-text', 'change');
    assert.ok(await page.isDisabled('#p-font'), 'style is locked: font can’t be changed');

    // Pixel art: drop a tiny sprite away from the slot, switch on pixel-art mode, resize it.
    await dropAt(made.pixel, 'sprite.png', 'image/png', 600, 1700);
    await page.waitForFunction(() => window.__studio.state.doc.variants[0].layers.some((l) => l.name === 'sprite.png'));
    await page.check('#p-pixel');
    let sprite = (await layersNow()).find((l) => l.name === 'sprite.png');
    assert.ok(sprite.pixelArt && sprite.w % 16 === 0, `pixel-art width is a whole multiple of 16 (${sprite.w})`);
    assert.ok(Math.abs(sprite.x + sprite.w / 2 - 600) < 8 && Math.abs(sprite.y + sprite.h / 2 - 1700) < 8, 'placed where it was dropped (within a screen pixel)');
    assert.strictEqual((await layersNow()).at(-1).role, 'cornerMark', 'corner mark stays in front');
    await drag([sprite.x + sprite.w, sprite.y + sprite.h], [sprite.x + sprite.w + 77, sprite.y + sprite.h + 77]);
    sprite = (await layersNow()).find((l) => l.name === 'sprite.png');
    assert.ok(sprite.w % 16 === 0 && sprite.w === sprite.h && sprite.w > 16, `still whole-number scale after resizing (${sprite.w})`);

    // Bottom-right warning: drag the sprite into the corner…
    await drag([sprite.x + sprite.w / 2, sprite.y + sprite.h / 2], [3600, 2000]);
    assert.match(await page.textContent('#warnings'), /bottom-right corner/, 'warns about the video-length corner');
    await shot('05-bottom-right-warning');
    // …then hide it; hiding clears the warning. Undo brings it back, redo hides again.
    await page.click(`#layer-list li[data-id="${sprite.id}"] .eye`);
    assert.doesNotMatch(await page.textContent('#warnings'), /bottom-right corner/);
    await page.click('#undo-btn');
    assert.strictEqual((await layersNow()).find((l) => l.id === sprite.id).hidden, false, 'undo');
    await page.click('#redo-btn');
    assert.strictEqual((await layersNow()).find((l) => l.id === sprite.id).hidden, true, 'redo');

    // ---------------------------------------------------------------- three variants
    await page.click('#dup-variant-btn');
    await page.click('#dup-variant-btn');
    s = await S();
    assert.deepStrictEqual(s.doc.variants.map((v) => v.id), ['A', 'B', 'C']);
    assert.ok(await page.isDisabled('#dup-variant-btn'), 'no more than 3 variants');
    // B: brand red background (picked from the brand swatches).
    await page.click('#variant-tabs [data-i="1"]');
    await page.click('#bg-color-row .swatch[data-hex="#ff3b30"]');
    // C: different words, tilted a little.
    await page.click('#variant-tabs [data-i="2"]');
    await page.click('#layer-list li:has-text("Words")');
    await page.fill('#p-text', 'OTHER WORDS');
    await page.dispatchEvent('#p-text', 'change');
    await setField('#p-rot', -6);
    s = await S();
    assert.strictEqual(s.doc.variants[1].background.color, '#ff3b30');
    assert.strictEqual(s.doc.variants[2].layers.find((l) => l.slot === 'Words').rotation, -6);
    await page.click('#variant-tabs [data-i="0"]');
    await shot('06-editor-variant-A');
    await page.check('#compare-toggle');
    await shot('07-variants-side-by-side');
    await page.uncheck('#compare-toggle');

    // ---------------------------------------------------------------- Lab
    await pickFiles([iconPath]);
    await tab('lab');
    await page.fill('#lab-title', 'Three big words that change how you draw pixel art forever and ever');
    await page.dispatchEvent('#lab-title', 'change');
    await page.waitForFunction(() => document.querySelectorAll('#lab-feed .yt-tile').length === 24);
    await page.click('#lab-icon-btn');
    await page.waitForSelector('#lab-icon .icon-cell');
    assert.strictEqual(await page.locator('#lab-squint canvas').count(), 9, 'squint test: 3 versions × 3 variants');
    assert.strictEqual(await page.locator('#lab-cutoffs tr').count(), 4, 'cutoffs for 3 surfaces');
    assert.match(await page.textContent('#lab-title-warn'), /Longer than 60/);
    const pairing = await page.textContent('#lab-pairing');
    assert.match(pairing, /Variant A: “three”, “big”, “words”/, 'pairing check flags repeated words');
    assert.match(pairing, /Variant C: “words”/);
    assert.strictEqual(await page.locator('#lab-icon .icon-cell').count(), 4, 'icon at 48 and 24 px, light and dark');
    await shot('08-lab-feed-light');
    await page.click('#lab-mode [data-mode="dark"]');
    await page.locator('#lab-feed .feed-variant').first().screenshot({ path: path.join(SHOTS, '09-lab-feed-dark.png') });
    await page.locator('#lab-cutoffs').screenshot({ path: path.join(SHOTS, '10-lab-title-cutoffs.png') });
    await page.locator('#lab-squint').screenshot({ path: path.join(SHOTS, '11-lab-squint.png') });

    // ---------------------------------------------------------------- export
    await tab('editor');
    await page.click('#export-btn');
    await page.waitForSelector('#status .ok', { timeout: 120000 });
    const exportsDir = path.join(dataDir, 'designs', 'episode-1', 'exports');
    const files = fs.readdirSync(exportsDir).sort();
    console.log('Exported:', files);
    assert.strictEqual(files.length, 6, 'PNG + JPG for each of 3 variants');
    for (const f of files) {
      assert.match(f, /^episode-1_[ABC]_\d{4}-\d{2}-\d{2}\.(png|jpg)$/);
      const buf = fs.readFileSync(path.join(exportsDir, f));
      assert.deepStrictEqual(f.endsWith('.png') ? pngSize(buf) : jpgSize(buf), { width: W, height: H }, `${f} is 3840×2160`);
      if (f.endsWith('.jpg')) assert.ok(buf.length <= 2_000_000, `${f} under 2 MB`);
    }
    fs.copyFileSync(path.join(exportsDir, files.find((f) => f.includes('_A_') && f.endsWith('.jpg'))), path.join(SHOTS, '12-exported-A.jpg'));
    fs.copyFileSync(path.join(exportsDir, files.find((f) => f.includes('_C_') && f.endsWith('.jpg'))), path.join(SHOTS, '13-exported-C.jpg'));
    const elapsed = Math.round((Date.now() - started) / 1000);

    // Check the exported PNGs pixel by pixel.
    s = await S();
    const wordsA = s.doc.variants[0].layers.find((l) => l.slot === 'Words');
    const wb = await bounds(wordsA);
    const pixels = async (variantId, points, box) => page.evaluate(async ({ b64, points, box }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const at = {};
      for (const [k, [x, y]] of Object.entries(points)) at[k] = [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data];
      let yellow = 0;
      if (box) {
        const d = ctx.getImageData(box.x, box.y, box.w, box.h).data;
        for (let i = 0; i < d.length; i += 4) if (d[i] > 220 && d[i + 1] > 170 && d[i + 1] < 235 && d[i + 2] < 60) yellow++;
      }
      return { at, yellow };
    }, { b64: fs.readFileSync(path.join(exportsDir, files.find((f) => f.includes(`_${variantId}_`) && f.endsWith('.png')))).toString('base64'), points, box });
    const A = await pixels('A', { corner: [3580, 160], hero: [1300, 650], bottomLeft: [100, 2100], spriteSpot: [3600, 2000] }, { x: Math.round(wb.x), y: Math.round(wb.y), w: Math.round(wb.w), h: Math.round(wb.h) });
    const B = await pixels('B', { bottomLeft: [100, 2100] });
    console.log('Pixels A:', A, 'B:', B.at);
    assert.ok(near(A.at.corner, GREEN), 'corner mark logo in the top-right corner');
    assert.ok(near(A.at.hero, BLUE), 'photo in the Hero slot');
    assert.ok(near(A.at.bottomLeft, [31, 41, 55]), 'template background color');
    assert.ok(!near(A.at.spriteSpot, [255, 255, 255], 10) && !near(A.at.spriteSpot, [0, 0, 0], 10), 'hidden sprite left out of the export');
    assert.ok(A.yellow > 5000, `text drawn in the style color (${A.yellow} yellow pixels)`);
    assert.ok(near(B.at.bottomLeft, RED), 'variant B has the brand red background');

    // Series wall now shows the three exports.
    await tab('lab');
    await page.waitForFunction(() => document.querySelectorAll('#lab-wall img').length === 3);
    await page.locator('#lab-wall').screenshot({ path: path.join(SHOTS, '14-series-wall.png') });

    assert.deepStrictEqual(errors, [], 'no errors in the window');
    console.log(`Scenario done in ${elapsed}s of automated clicking (brief's goal: under 10 minutes by hand).`);

    // ---------------------------------------------------------------- reopen
    await app.close();
    ({ app, page, errors } = await launch(dataDir));
    await page.waitForFunction(() => window.__studio.state.kind === 'design');
    s = await S();
    assert.strictEqual(s.doc.slug, 'episode-1', 'reopens the last design');
    assert.deepStrictEqual(s.doc.variants.map((v) => v.id), ['A', 'B', 'C']);
    assert.strictEqual(s.doc.variants[0].layers.find((l) => l.slot === 'Words').text, 'THREE BIG WORDS');
    assert.strictEqual(s.doc.variants[2].layers.find((l) => l.slot === 'Words').text, 'OTHER WORDS');
    assert.ok(s.doc.title.startsWith('Three big words'));
    assert.ok(s.brand.logos.some((l) => l.name === 'My Logo') && s.brand.colors[0].hex === '#ff3b30' && s.brand.fonts[0].name === 'My Brand Font');
    assert.ok(s.templates.some((t) => t.name === 'My Series'));
    assert.ok(await page.evaluate((fam) => document.fonts.check(`40px "${fam}"`), `ts-${myFont.id}`), 'my font loads again');
    await page.waitForTimeout(300);
    const painted = await page.evaluate(() => {
      const c = document.getElementById('preview');
      const d = c.getContext('2d').getImageData(Math.round(c.width * 0.34), Math.round(c.height * 0.3), 1, 1).data;
      return [...d];
    });
    assert.ok(near(painted, BLUE), `photo is back on the canvas (${painted})`);
    await shot('15-reopened');

    // Rename the design: its folder (images and exports) moves along.
    await tab('home');
    await page.click('[data-rename="episode-1"]');
    await answer({ name: 'Episode One' });
    await page.waitForFunction(() => window.__studio.state.doc?.slug === 'episode-one');
    assert.ok(fs.existsSync(path.join(dataDir, 'designs', 'episode-one', 'exports')) && !fs.existsSync(path.join(dataDir, 'designs', 'episode-1')), 'design folder renamed');
    assert.ok(near(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 384; c.height = 216; return import('./js/render.js').then((r) => { r.renderVariant(c, window.__studio.state.doc.variants[0], {}); return [...c.getContext('2d').getImageData(10, 200, 1, 1).data]; }); }), [31, 41, 55]), 'renamed design still draws');
    await page.waitForSelector('#design-list [data-thumb="episode-one"] img');
    await shot('16-designs');

    // Duplicate a template, then delete the copy.
    await tab('templates');
    await page.click(`[data-dup="${tplId}"]`);
    await page.waitForFunction(() => document.querySelectorAll('#template-list .card').length === 4);
    const copyId = (await S()).templates.find((t) => t.name === 'My Series copy').id;
    await page.click(`[data-delete="${copyId}"]`);
    await page.click('#dialog-ok');
    await page.waitForFunction(() => document.querySelectorAll('#template-list .card').length === 3);
    assert.ok(!fs.existsSync(path.join(dataDir, 'templates', `${copyId}.json`)), 'template copy deleted');
    assert.deepStrictEqual(errors, [], 'no errors after reopening');

    // Worst case: pure random noise compresses terribly. The JPG must still be under 2 MB.
    const noise = await page.evaluate(async () => {
      const { makeJpgUnderLimit } = await import('./js/export.js');
      const c = document.createElement('canvas');
      c.width = 3840; c.height = 2160;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(c.width, c.height);
      for (let i = 0; i < img.data.length; i++) img.data[i] = (i % 4 === 3) ? 255 : Math.random() * 256;
      ctx.putImageData(img, 0, 0);
      const r = await makeJpgUnderLimit(c);
      return { bytes: r.blob.size, width: r.width };
    });
    assert.ok(noise.bytes <= 2_000_000 && noise.width >= 640, 'noise JPG under 2 MB');

    console.log(`\nAll checks passed. Screenshots in ${SHOTS}`);
  } finally {
    await app.close().catch(() => {});
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(inputDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
