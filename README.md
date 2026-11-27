# Thumbnail Studio

A Mac app for turning your artwork into finished YouTube thumbnails:
assemble, brand, check, make A/B variants and export files ready to upload.
You keep drawing in Procreate; this is for everything after.

It's a regular app in your Applications folder with its own window. It runs
entirely on your Mac, works with no internet connection, and never uploads
anything.

> **Status: Step 1.5.** Import your images (drag and drop or File → Import),
> move, resize and layer them, add one line of text, and export YouTube-ready
> files. Your designs aren't saved between sessions yet (autosave comes in Step 3),
> but imported images are copied into the design's folder straight away.

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
repeat steps 1 to 3 and choose **Replace** when Finder asks. Your own files are
never touched by updates.

### Other way: build it on your Mac

If you'd rather build the app yourself: install Node.js (the **LTS**
**macOS Installer** from <https://nodejs.org/en/download>), get this folder
onto your Mac (GitHub Desktop or a zip), and double-click
**`Install Thumbnail Studio.command`**. It builds the app and puts it in
Applications. If macOS blocks that file, right-click it and choose **Open**.

---

## Where your files live

Everything you add or make is stored as plain files in
**Documents → Thumbnail Studio**. The app creates the folder the first time
it starts. You can also open it from the menu bar: **File → Show My Files in Finder**.

```
Documents/Thumbnail Studio/
  brand/                your logos, fonts and brand.json (colors, text styles)
  templates/            one .json file per template
  designs/<name>/       one folder per thumbnail:
    images/               copies of the pictures you import (originals can be moved)
    design.json           the design itself (from Step 3)
    exports/              finished files, ready to upload
```

This folder is separate from the app and from the code, so reinstalling or
updating never touches it, and it is never uploaded to GitHub.

**Back up** by copying that folder somewhere safe. Time Machine covers it
automatically. If you've turned on iCloud's "Desktop & Documents Folders",
macOS syncs it to iCloud like everything else in Documents.

---

## How to use it

### Images and layers

1. **Bring in pictures:** drag PNG or JPG files from Finder onto the canvas,
   or choose **File → Import Image…** (⌘I), or click **Import image…**. Each
   picture becomes a layer. PNG transparency is kept. A copy goes into the
   design's `images/` folder, so moving or deleting the original is fine.
2. **Select** a layer by clicking it on the canvas or in the **Layers** list
   (front-most at the top). A blue box with four corner handles appears.
3. **Move:** drag the layer. **Resize:** drag a corner handle (the shape keeps
   its proportions).
4. **Forward / Back** change which layer is in front. **Delete** (or the ⌫ key) removes it.
5. **Fill background:** with an image selected, tick **Fill background**. The
   image then covers the whole 16:9 frame (edges may be cropped to fit) and
   stays at the back. Only one image can be the background.
6. **Text:** click **Add text**, type your words, pick a **Size** and color,
   then drag the text into place (or resize it with its corners). It uses the
   Mac's system font for now; your own fonts come with the brand kit.

The selection box and handles only show on screen. They never appear in exports.

### Export

1. Type a **Design name** (best before importing, so pictures land in the right folder;
   if you rename later, they're copied to the new folder when you export). It becomes the folder and file name, cleaned up:
   "My Video #1" turns into `my-video-1`.
2. Pick a **Background color** with the color picker, or type a hex code such as `#e11d48`.
3. Click **Export for YouTube**. For each variant you get two files in
   `designs/<name>/exports/`:
   - `<name>_A_<date>.png`: the full-size **master**, 3840 × 2160.
   - `<name>_A_<date>.jpg`: the same picture as a JPG **under 2 MB**, so it
     uploads from the YouTube phone app too. The app lowers the JPG quality a
     step at a time until the file fits. If the picture is so detailed that it
     still doesn't fit, the app shrinks it to 1920 × 1080, which is still
     well above YouTube's minimum.
4. Click **Open exports folder** to see them in Finder.

Exporting the same design again on the same day replaces that day's files,
so the folder always holds your latest version. Files from earlier days stay.

### YouTube's rules the app follows

From the build brief (as of November 2026): recommended 3840 × 2160, minimum
width 640 px, 16:9, JPG or PNG, max 2 MB from the phone app and 50 MB from a
computer, and up to 3 thumbnails in "Test & compare". **Check YouTube Help
("Add video thumbnails") before relying on these numbers.** If they change,
they're all in one file: `app/public/js/youtube-rules.js`. Edit it, then run
the Install file again.

### Coming in the next steps

- **Step 2, brand kit:** your logos, colors, fonts, text styles, corner mark,
  bottom-right warning.
- **Step 3, templates and editor:** layers, images (with pixel-art mode), text, undo/redo, autosave.
- **Step 4, variants:** up to 3 per design, side by side, export all at once.
- **Step 5, Lab:** feed preview, squint test, title cutoffs, pairing check,
  series wall, icon check.

---

## How it works under the hood

Thumbnail Studio is built with **Electron**, the same toolkit behind desktop
apps like VS Code, Slack and Figma's desktop app. An Electron app has two parts:

1. **The main process** (`app/main.js`) starts first. It opens the window,
   sets up the menu bar, and is the only part allowed to read and write files
   on your Mac. The code that handles your files is in `app/files.js`.
2. **The window** (`app/public/`) is what you see and click. Its screens are
   written in HTML, CSS and JavaScript. The thumbnail is drawn on a
   **canvas**, and the same drawing code makes the small preview and the full
   3840 × 2160 export, so what you see is what you get.

The window can't touch your files directly, which keeps things safe. It can
only ask the main process to do a few specific things, like "save this
export" or "show this folder". That short list lives in `app/preload.js`.

When you export, the window draws the full-size picture and turns it into
PNG and JPG files. The main process then saves them in the design's
`exports/` folder.

**How the app gets built:** every time the code changes, GitHub builds the
app on one of its Macs (`.github/workflows/build-mac-app.yml`). It runs the
automated test on the finished app and keeps it as a private download in this
repository. The app contains everything it needs and doesn't use the internet.

Main files:

| File | What it does |
|---|---|
| `.github/workflows/build-mac-app.yml` | GitHub builds, tests and stores the Mac app. |
| `Install Thumbnail Studio.command` | Alternative: builds the app on your Mac and puts it in Applications. |
| `scripts/build-mac.js` | The build recipe used by the Install file. |
| `app/main.js` | Main process: window, menu, saving files. |
| `app/files.js` | Where your files live, and safe saving. |
| `app/preload.js` | The short list of things the window may ask for. |
| `app/public/index.html` | The window's layout. |
| `app/public/style.css` | The look (light and dark mode follow your Mac's setting). |
| `app/public/js/main.js` | Connects the panel, layers, import and export to the design. |
| `app/public/js/render.js` | Draws a thumbnail (background, images, text) onto a canvas. |
| `app/public/js/editor.js` | Mouse on the canvas: select, move, resize, selection handles. |
| `app/public/js/export.js` | Makes the PNG and the under-2 MB JPG, names the files, saves them. |
| `app/public/js/youtube-rules.js` | YouTube's size and format limits, in one place. |
| `tests/e2e.js` | Automated test (for development; you don't need it). |

### For developers

- `npm install`, then `npm start` runs the app straight from the code without installing it.
- `npm run build-mac` builds `dist/Thumbnail Studio-darwin-<chip>/Thumbnail Studio.app`.
- `node tests/e2e.js [screenshot-folder]` opens the app with a throwaway files
  folder (needs Playwright; on Linux run it under `xvfb-run`). It exports a
  thumbnail and checks the files: names, 3840 × 2160 size, JPG under 2 MB even
  for a worst-case noisy image, and that unsafe names and paths are refused.
  Set `PACKAGED_APP=<path to app binary>` to test a built app instead.
- `THUMBNAIL_STUDIO_DATA=/some/folder` makes the app use a different files folder.
