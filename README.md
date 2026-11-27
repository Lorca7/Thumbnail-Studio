# Thumbnail Studio

A Mac app for turning your artwork into finished YouTube thumbnails:
assemble, brand, check, make A/B variants and export files ready to upload.
You keep drawing in Procreate; this is for everything after.

It's a regular app in your Applications folder with its own window. It runs
entirely on your Mac, works with no internet connection, and never uploads
anything. Nothing of anyone's brand is built in: you add your own logos,
colors, fonts and templates inside the app.

> **Status: Phase 1 complete.** Brand kit, templates, editor, A/B variants,
> the Lab and export are all in. Everything saves automatically.

---

## Set up on my Mac

No installers, no Terminal. Written for macOS Sonoma 14.6. The app works on
both Apple silicon and Intel Macs, and works offline.

### 1. Download the app

1. Open **<https://github.com/Lorca7/Thumbnail-Studio/actions/workflows/build-mac-app.yml>**
   (sign in to GitHub if asked; the repository is private).
2. Click the top run in the list (the newest one with a green ✓).
3. Scroll down to **Artifacts** and click **Thumbnail-Studio-Mac-app**. It's about 220 MB.
4. In your **Downloads** folder, double-click the zip. If you get another zip
   (**Thumbnail Studio.zip**), double-click that too, until you see the
   **Thumbnail Studio** app icon.

### 2. Put it in Applications

Drag **Thumbnail Studio** into your **Applications** folder (in Finder's sidebar).

### 3. Open it the first time

Because the app isn't from the App Store, macOS asks you to confirm once:

1. In **Applications**, **right-click** (or Control-click) **Thumbnail Studio** and choose **Open**.
2. Click **Open** in the dialog.

If there's no **Open** button: open **System Settings → Privacy & Security**,
scroll down to the message about Thumbnail Studio, click **Open Anyway**, and
open the app again.

After that, open it like any other app: from Applications, Launchpad or
Spotlight. While it's open, right-click its Dock icon → **Options → Keep in Dock**.

The first time the app saves something, macOS may ask whether
**Thumbnail Studio may access files in your Documents folder**. Click **Allow**.
That's where it keeps your files.

### Getting updates

Every time the code changes, GitHub builds a fresh copy of the app. To update,
quit Thumbnail Studio, repeat steps 1 to 3 and choose **Replace** when Finder asks.
Your own files are never touched by updates.

### Other way: build it on your Mac

If you'd rather build the app yourself: install Node.js (the **LTS**
**macOS Installer** from <https://nodejs.org/en/download>), get this folder
onto your Mac (GitHub Desktop or a zip), and double-click
**`Install Thumbnail Studio.command`**. It builds the app and puts it in
Applications. If macOS blocks that file, right-click it and choose **Open**.

---

## Your first thumbnail (about 10 minutes)

1. **Brand kit** tab:
   1. Click **Add logos…** and pick your logo (a PNG with transparency works best).
   2. Under **Colors**, pick a color, give it a name and click **Add color**. Repeat for your other colors.
   3. Click **Add fonts…** and pick your font files (.ttf, .otf or .woff2).
   4. Under **Text styles**, click **New text style**. Choose your font, size, color, outline and shadow.
   5. Under **Corner mark**, tick **Use a corner mark**, then choose your logo and a corner.
2. **Templates** tab:
   1. Click **New template** and name it after your series.
   2. In the editor, click **Slot** to add an image slot. Drag it into place and name it (e.g. "Main image").
   3. Click **Text** and pick your style. Tick **Lock: Style** so every episode looks the same.
   4. Click **← Back to templates**.
3. **Designs** tab:
   1. Click **New thumbnail…**, type the video name and pick your template.
   2. Drag your Procreate export onto the image slot.
   3. Select the text and type your three words.
4. Click **Duplicate variant** twice, so you have **A**, **B** and **C**. Change something in B and C.
5. **Lab** tab: type the video title. Check the feed preview, the squint test,
   the title cutoffs and the pairing check.
6. Back in **Editor**, click **Export all variants for YouTube**, then **Open exports folder**.

---

## Where your files live

Everything you add or make is stored as plain files in
**Documents → Thumbnail Studio**. The app creates the folder the first time
it starts. **File → Show My Files in Finder** opens it.

```
Documents/Thumbnail Studio/
  settings.json         app settings (e.g. the title-length warning)
  brand/
    brand.json          your colors, text styles, corner mark and the list of logos/fonts
    logos/              your logo files
    fonts/              your font files
    icon/               your channel icon (for the Lab's icon check)
  templates/            one .json file per template
  designs/<name>/       one folder per thumbnail:
    design.json           the design: variants, layers, title
    images/               copies of the pictures you put in (originals can be moved)
    exports/              finished files, ready to upload
  lab/                  comparison screenshots for the feed preview (private)
```

- This folder is separate from the app, so updating or reinstalling never
  touches it, and it is never uploaded anywhere.
- **Back up** by copying the folder. Time Machine covers it automatically.
- The first time the app runs, it adds a neutral **sample logo** and two
  **example templates**. Delete them whenever you like.
- When you delete something in the app, it goes to the Mac's **Trash**, so you
  can get it back from there.

---

## How to use it

The tabs along the top are **Designs**, **Editor**, **Brand kit**,
**Templates** and **Lab**. The top-right corner shows "All changes saved".
There's no Save button: everything saves itself within half a second.

### Designs

All your thumbnails, newest first, each with its latest export as a picture.

- **New thumbnail…** (⌘N): pick a name and a template (or "Blank 16:9").
  The name becomes the folder and file names: "My Video #1" becomes `my-video-1`.
- **Open**, **Rename**, **Delete**. Renaming moves the design's folder. Deleting moves it to the Trash.
- The app reopens the design you last worked on when it starts.

### Editor

**Layers.** The list on the left shows the front-most layer at the top. Click
a layer in the list or on the canvas to select it.

- **Image…** (⌘I), or drag PNG/JPG files from Finder onto the canvas. PNG
  transparency is kept. A copy goes into the design's `images/` folder.
- **Text** adds a text layer. **Logo** adds one of your logos.
- **Moving and resizing:**
  - **Drag** to move. Layers snap to the frame's center lines and edges, and
    pink guide lines show when they snap. Hold **⌥ Option** to move freely.
  - The **arrow keys** nudge a layer; hold **⇧ Shift** for bigger steps.
  - **Corner handles** resize, always keeping proportions.
  - The **round handle** above a layer rotates it. It clicks into straight
    angles; hold **⇧ Shift** for 15° steps. You can also type a **Rotation**.
- **Order and visibility:**
  - **Forward / Back** change the stacking order.
  - The **●** dot in the list hides or shows a layer. Hidden layers aren't exported.
  - **Delete** (or **⌫**) removes the selected layer.
- **Undo / Redo:** ⌘Z and ⇧⌘Z, or the buttons. This covers every change to the design.

**Settings for the selected layer** appear under the list:

- **Slot name:** what the layer is called in the list and in templates.
- **Lock Position / Size / Style:**
  - A position-locked layer can't be moved.
  - A size-locked layer can't be resized or rotated.
  - A style-locked text layer keeps its font, size, color, outline and
    shadow, but you can still change the words.
  - Locked layers show a dashed orange outline and a 🔒 in the list.
- **Images:**
  - **Fill background** makes the picture cover the whole frame, cropped to
    fit, and keeps it at the back.
  - **Pixel-art mode** keeps pixel art sharp: hard pixel edges with no blur,
    and sizes snap to whole-number scales (1×, 2×, 3×…) of the original pixels.
  - **Choose / Replace picture…** puts a different picture in this layer.
- **Text:**
  - Type in the box; press Return for a second line.
  - Pick a saved **Style**, or set the font, size, alignment, color,
    **outline** (width and color), **shadow** (blur, X/Y offset, color),
    **All caps** and **Letter spacing** yourself.
  - **Save style…** stores the current look in your Brand kit.
  - Every color picker also shows your brand colors as round swatches.

**Corner mark.** If **Corner mark** is ticked, your brand logo sits in your
chosen corner, locked. While its position and size are locked, it follows
the Brand kit settings. Unlock it to move it by hand in one design.

**The video-length corner.** YouTube puts the video length (e.g. "12:34") in
the bottom-right corner of every thumbnail. The yellow dashed area shows that
spot, and a warning appears under the canvas when something visible is in it.
Untick **Show the video-length corner** to hide the overlay.

### Variants (A/B test)

YouTube's "Test & compare" tries up to **3 thumbnails** per video.

- **Duplicate variant** copies the current one (A → B → C). Then change it.
- The **A / B / C** buttons switch between variants. **Delete variant** removes the current one.
- **Side by side** shows all variants next to each other. Click one to edit it.

### Export

**Export all variants for YouTube** (⌘E) writes two files per variant into
the design's `exports/` folder:

- `<design>_<variant>_<date>.png`: full-size master, 3840 × 2160.
- `<design>_<variant>_<date>.jpg`: the same picture **under 2 MB**, so it also
  uploads from the YouTube phone app. The quality steps down until it fits.
  For extremely detailed pictures it is shrunk to 1920 × 1080, which is still
  well above YouTube's 640-pixel minimum.

Exports show exactly what's on screen, minus the editing aids (selection
boxes, empty-slot outlines and the video-length overlay). Exporting again on
the same day replaces that day's files.

### Brand kit

- **Logos:** add as many as you like and name them. They're used by the Logo
  button and the corner mark.
- **Colors:** name them. They appear as swatches next to every color picker.
- **Fonts:**
  - Four open-license fonts are built in: Anton, Bebas Neue, Inter Black and Inter Regular.
  - The Mac system font is also available.
  - Add your own .ttf, .otf, .woff or .woff2 files.
- **Text styles:** a name plus font, size, color, outline, shadow, all caps
  and letter spacing, with a live preview. Editing a style later doesn't
  change text that already used it.
- **Corner mark:** which logo, which corner, its width (in pixels of the
  3840-wide frame) and the margin from the edges. It warns you if you pick the
  bottom-right corner.

### Templates

A template is a 16:9 layout with named **slots**: image slots, text, logos
and the corner mark. It also sets the background color.

- **New template**, then add **Slot** (an empty image area), **Text** and
  **Logo** layers. Name them, position them and lock what should stay the same.
- **Edit**, **Duplicate**, **Rename** and **Delete** are on each template card.
- A new thumbnail made from a template starts with a copy of its layers.
  Drop a picture onto an empty slot to fill it; the picture is fitted inside
  the slot. Changing a template later doesn't change designs already made from it.

### Lab

Checks before publishing, for the design that's open.

- **Title:**
  - Type the video's title. It's saved with the design.
  - You get a warning above **60 characters**. You can change that number right there.
- **Pairing check:** lists words that appear both in the title and in the
  thumbnail's text, per variant. The thumbnail usually works best when it
  adds something instead of repeating the title.
- **Feed preview:**
  - Each variant with your title, at YouTube-like sizes: desktop home feed,
    phone feed and sidebar ("up next"). There's a **Light** / **Dark** switch.
  - Gray tiles stand in for other videos. **Add comparison screenshots…**
    to use real thumbnails instead; they're kept privately in `lab/`.
  - Each tile also shows a "12:34" video-length badge.
- **Title cutoffs:** what each surface shows of the title. The part that gets
  cut off is struck through in red.
- **Squint test:** each variant blurred, tiny (120 px) and in grayscale.
- **Series wall:** all your exported thumbnails side by side. You can filter
  by template to check that a series looks consistent.
- **Channel icon check:** choose your channel icon to see it as a circle at
  48 px and 24 px, on light and dark backgrounds.

### Keyboard shortcuts

| Keys | Does |
|---|---|
| ⌘N | New thumbnail |
| ⌘I | Import image |
| ⌘E | Export all variants |
| ⌘Z / ⇧⌘Z | Undo / Redo |
| ⌫ | Delete selected layer |
| Arrow keys (⇧ for bigger steps) | Nudge selected layer |
| Esc | Deselect |
| ⌥ while dragging | Move without snapping |
| ⇧ while rotating | 15° steps |

### YouTube's rules the app follows

From the build brief (as of November 2026): recommended 3840 × 2160, minimum
width 640 px, 16:9, JPG or PNG, max 2 MB from the phone app and 50 MB from a
computer, and up to 3 thumbnails in "Test & compare". **Check YouTube Help
("Add video thumbnails") before relying on these numbers.** If they change,
they're all in one file: `app/public/js/youtube-rules.js`. The Lab's feed
sizes are approximations, and they're at the top of `app/public/js/views/lab.js`.

---

## How it works under the hood

Thumbnail Studio is built with **Electron**, the same toolkit behind desktop
apps like VS Code and Slack. An Electron app has two parts:

1. **The main process** (`app/main.js`) starts first. It opens the window,
   sets up the menu bar, and is the only part allowed to touch files on your
   Mac. `app/files.js` does the actual reading and writing. It checks every
   request: paths must stay inside your Thumbnail Studio folder, only
   pictures and fonts can be imported, and the file type is checked from the
   file's contents, not its name.
2. **The window** (`app/public/`) is what you see and click: plain HTML, CSS
   and JavaScript. It can't touch files itself; it can only ask the main
   process for the few things listed in `app/preload.js`.

**Drawing.** A thumbnail is plain data: a background color plus a list of
layers (image, text, logo) with positions in a fixed 3840 × 2160 space. One
function, `renderVariant` in `render.js`, draws that data onto a canvas. It
makes both the on-screen preview and the full-size export, so what you see is
what you get.

**Saving.** Every change goes through one place (`store.js`). It records an
undo step and writes `design.json` (or the template's file) half a second
later. Closing the window writes anything still pending first.

**Building the app.** Every time the code changes on GitHub, a GitHub Mac
builds the app (`.github/workflows/build-mac-app.yml`). It runs the full
automated test on the built app and keeps the app as a private download.

| File | What it does |
|---|---|
| `app/main.js` | Main process: window, menu, handling requests from the window. |
| `app/files.js` | Your files folder: safe reading, writing, importing, first-run examples. |
| `app/preload.js` | The short list of things the window may ask for. |
| `app/public/index.html`, `style.css` | Layout and look of all five tabs (light and dark). |
| `app/public/js/main.js` | Start-up and switching tabs. |
| `app/public/js/store.js` | The open document, undo/redo, autosave, corner mark, templates. |
| `app/public/js/render.js` | Draws a thumbnail (background, images, text, logos). |
| `app/public/js/editor.js` | Mouse on the canvas: select, move with snapping, resize, rotate. |
| `app/public/js/assets.js` | Loading pictures and fonts (built-in and yours). |
| `app/public/js/export.js` | PNG master + JPG under 2 MB, file names. |
| `app/public/js/youtube-rules.js` | YouTube's limits, in one place. |
| `app/public/js/views/*.js` | One file per tab: home, editor, brand, templates, lab. |
| `app/public/fonts/` | The built-in open-license fonts and their licenses. |
| `examples/` | The neutral sample logo and starter templates. |
| `scripts/build-mac.js` | Packs the code into `Thumbnail Studio.app`. |
| `tests/e2e.js` | The full automated test (see below). |

**Ready for later.** Each design records its format (`"16:9"`), so vertical
Shorts thumbnails can be added as another format. Templates and designs are
plain JSON, so saved workflow "recipes" and batch generation can be built on
top without changing how your files are stored.

### For developers

- `npm install`, then `npm start` runs the app straight from the code.
- `npm run build-mac` builds `dist/Thumbnail Studio-darwin-<chip>/Thumbnail Studio.app`.
- `node tests/e2e.js [screenshot-folder]` runs the acceptance test (needs
  Playwright; on Linux run it under `xvfb-run`). It works through the brief's
  "done when" scenario against a throwaway files folder:
  - set up the brand kit
  - make a template
  - start a thumbnail from it, add an image and three words
  - make three variants
  - check the Lab
  - export, then check the exported PNGs pixel by pixel
  - close and reopen the app and check that everything is still there

  It also covers locks, snapping, rotation, pixel-art mode, hide/show,
  undo/redo, the video-length warning, rename, delete, and refusing unsafe
  paths. Set `PACKAGED_APP=<path to app binary>` to test a built app.
- `THUMBNAIL_STUDIO_DATA=/some/folder` makes the app use a different files folder.
