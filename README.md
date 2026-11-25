# Thumbnail Studio

A Mac app for turning your artwork into finished YouTube thumbnails:
assemble, brand, check, make A/B variants and export files ready to upload.
You keep drawing in Procreate; this is for everything after.

It's a regular app in your Applications folder with its own window. It runs
entirely on your Mac, works with no internet connection, and never uploads
anything.

> **Status: Step 1 of 5.** The app opens, shows a 16:9 canvas with a
> background color, and exports YouTube-ready files. Brand kit, templates and
> editor, variants and the Lab come in the next steps.

---

## Set up on my Mac

You do this once. Written for macOS Sonoma 14.6. It needs the internet while
installing; after that the app works offline.

### 1. Install Node.js (needed only for installing and updating)

1. Go to **<https://nodejs.org/en/download>**.
2. Choose the version marked **LTS** and download the **macOS Installer (.pkg)**.
3. Open the downloaded file and click through the installer (Continue → Agree → Install).
   It asks for your Mac password, which is normal.

### 2. Get the Thumbnail Studio folder onto your Mac

With **GitHub Desktop** (recommended, because updates are then two clicks):

1. Download **GitHub Desktop** from **<https://desktop.github.com/>**, open the
   zip, and drag **GitHub Desktop** into your **Applications** folder. Open it
   and sign in with your GitHub account.
2. Choose **File → Clone Repository…**, pick **thumbnail-studio** from the list,
   and choose where to put it (for example your **Documents/GitHub** folder). Click **Clone**.
3. Choose **Repository → Show in Finder**. You'll see a folder called **thumbnail-studio**.

Or, from a **zip file**: unzip it and move the **thumbnail-studio** folder
somewhere handy, such as Documents.

### 3. Install the app

In the thumbnail-studio folder, double-click **`Install Thumbnail Studio.command`**.

A Terminal window opens and works for a few minutes. It downloads the
building blocks (about 100 MB), builds the app for your Mac, and puts
**Thumbnail Studio** in your **Applications** folder. Then it opens the app.
When it says **Done!**, you can close the Terminal window.

From then on, open **Thumbnail Studio** like any other app: from
Applications, Launchpad or Spotlight. Right-click its Dock icon →
**Options → Keep in Dock** to keep it handy.

The first time the app saves something, macOS may ask whether
**Thumbnail Studio may access files in your Documents folder**. Click **Allow**.
That's where it keeps your files.

### If macOS blocks the Install file

If you see *"cannot be opened because Apple cannot check it for malicious
software"* or *"unidentified developer"* (most likely if you used the zip):

1. Click **Done** (or **OK**).
2. **Right-click** (or Control-click) `Install Thumbnail Studio.command` and choose **Open**.
3. Click **Open** in the dialog. macOS remembers this, so you only do it once.

If there's no **Open** button: open **System Settings → Privacy & Security**,
scroll down to the message about the file, click **Open Anyway**, then
double-click it again.

If double-clicking opens the file in a text editor, or Terminal says
**"permission denied"**: open **Terminal** (Applications → Utilities), type
`chmod +x ` (with a space at the end), drag the Install file into the Terminal
window, and press Return. Then double-click it again.

If a window says **Node.js is not installed**, go back to step 1.

The app you install is built on your own Mac, so macOS opens it without
these warnings.

### Getting updates

When a new version is ready:

1. In GitHub Desktop, click **Fetch origin**, then **Pull origin**. (Or unzip the new zip.)
2. Double-click **`Install Thumbnail Studio.command`** again. It replaces the
   app in Applications with the new version.

Your own files are never touched by updates.

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
    design.json           the design itself
    exports/              finished files, ready to upload
```

This folder is separate from the app and from the code, so reinstalling or
updating never touches it, and it is never uploaded to GitHub.

**Back up** by copying that folder somewhere safe. Time Machine covers it
automatically. If you've turned on iCloud's "Desktop & Documents Folders",
macOS syncs it to iCloud like everything else in Documents.

---

## How to use it

### Export (available now)

1. Type a **Design name**. It becomes the folder and file name, cleaned up:
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

**Why Node.js is needed to install:** the Install file uses Node.js and its
package tool (npm) to download Electron and assemble the app on your Mac.
Building it on your Mac means macOS trusts it without warnings. The finished
app contains everything it needs and doesn't use Node.js or the internet.

Main files:

| File | What it does |
|---|---|
| `Install Thumbnail Studio.command` | Builds the app and puts it in Applications. |
| `scripts/build-mac.js` | The build recipe used by the Install file. |
| `app/main.js` | Main process: window, menu, saving files. |
| `app/files.js` | Where your files live, and safe saving. |
| `app/preload.js` | The short list of things the window may ask for. |
| `app/public/index.html` | The window's layout. |
| `app/public/style.css` | The look (light and dark mode follow your Mac's setting). |
| `app/public/js/main.js` | Connects buttons and fields to the design. |
| `app/public/js/render.js` | Draws a thumbnail onto a canvas. |
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
