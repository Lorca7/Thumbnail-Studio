# Thumbnail Studio

A small app on your Mac for turning your artwork into finished YouTube
thumbnails: assemble, brand, check, make A/B variants and export files ready
to upload. You keep drawing in Procreate; this is for everything after.

It runs entirely on your computer. It opens in your web browser, but nothing
is uploaded anywhere and it works offline.

> **Status: Step 1 of 5.** The app opens, shows a 16:9 canvas with a
> background color, and exports YouTube-ready files. Brand kit, templates and
> editor, variants and the Lab come in the next steps.

---

## Set up on my Mac

You do this once. Written for macOS Sonoma 14.6.

### 1. Install Node.js (the engine the app runs on)

1. Go to **<https://nodejs.org/en/download>**.
2. Choose the version marked **LTS** and download the **macOS Installer (.pkg)**.
3. Open the downloaded file and click through the installer (Continue → Agree → Install).
   It asks for your Mac password, which is normal.

That's the only thing to install. The app uses nothing beyond Node.js itself.

### 2. Install GitHub Desktop and get the app onto your Mac

1. Download **GitHub Desktop** from **<https://desktop.github.com/>**, open the
   zip, and drag **GitHub Desktop** into your **Applications** folder. Open it
   and sign in with your GitHub account.
2. Choose **File → Clone Repository…**, pick **thumbnail-studio** from the list,
   and choose where to put it (for example your **Documents** folder). Click **Clone**.
3. In GitHub Desktop, choose **Repository → Show in Finder**. You'll see a folder
   called **thumbnail-studio**.

### 3. Start the app

Double-click **`Start Thumbnail Studio.command`** in the thumbnail-studio folder.

A Terminal window opens and the studio opens in your browser at
<http://localhost:4317>. **Leave the Terminal window open while you work.**
Close it (or press Control-C in it) to stop the studio.

Tip: drag the launcher into your Dock (on the right side, next to the Trash)
so it's one click away.

### If macOS blocks the launcher the first time

macOS is careful with files that can run programs. If you see a message like
*"cannot be opened because Apple cannot check it for malicious software"* or
*"unidentified developer"*:

1. Click **Done** (or **OK**) on the message.
2. **Right-click** (or Control-click) `Start Thumbnail Studio.command` and choose **Open**.
3. Click **Open** in the dialog. macOS remembers this, so you only do it once.

If there's no **Open** button: open **System Settings → Privacy & Security**,
scroll down to the message about `Start Thumbnail Studio.command` and click
**Open Anyway**, then double-click the launcher again.

If Terminal asks whether it may access files in your **Documents** folder,
click **Allow**. The app needs this to save your files.

If double-clicking opens the file in a text editor instead, or Terminal
says **"permission denied"**: open the **Terminal** app (in
Applications → Utilities), type `chmod +x ` (with a space at the end), drag the
launcher file into the Terminal window, and press Return. Then double-click it again.

If a window says **Node.js is not installed**, go back to step 1. If it says
**port 4317 is already in use**, another copy of the studio (or another
program) is running. Close the other Terminal window and try again.

### Getting updates

When a new version is ready: open GitHub Desktop, click **Fetch origin**,
then **Pull origin**. Your own files are never touched by updates.

---

## Where your files live

Everything you add is stored as plain files in the **`user-data`** folder
inside thumbnail-studio. The app creates it the first time it starts.

```
thumbnail-studio/
  app/                    the program (code)
  examples/               neutral starter examples (you can delete them)
  user-data/              YOUR files. Never uploaded, not part of the repository.
    brand/                your logos, fonts and brand.json (colors, text styles)
    templates/            one .json file per template
    designs/<name>/       one folder per thumbnail:
      design.json           the design itself
      exports/              finished files, ready to upload
  Start Thumbnail Studio.command
  README.md
```

`user-data/` is listed in `.gitignore`, which tells git (and GitHub Desktop)
to ignore it. It never shows up as a change and is never sent to GitHub.

**Back up** by copying the `user-data` folder somewhere safe (Time Machine
covers it automatically if it backs up your Documents).

---

## How to use it

### Export (available now)

1. Type a **Design name**. It becomes the folder and file name, cleaned up:
   "My Video #1" turns into `my-video-1`.
2. Pick a **Background color** with the color picker, or type a hex code such as `#e11d48`.
3. Click **Export for YouTube**. For each variant you get two files in
   `user-data/designs/<name>/exports/`:
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
they're all in one file: `app/public/js/youtube-rules.js`.

### Coming in the next steps

- **Step 2, brand kit:** your logos, colors, fonts, text styles, corner mark,
  bottom-right warning.
- **Step 3, templates and editor:** layers, images (with pixel-art mode), text, undo/redo, autosave.
- **Step 4, variants:** up to 3 per design, side by side, export all at once.
- **Step 5, Lab:** feed preview, squint test, title cutoffs, pairing check,
  series wall, icon check.

---

## How it works under the hood

There are two parts:

1. **A small local server** (`app/server.js`). When you double-click the
   launcher, it starts a Node.js program that only listens on your own Mac
   (address `127.0.0.1`, port 4317). It does two jobs: it hands the app's
   web pages to your browser, and it reads and writes files in `user-data/`.
   It refuses requests from anywhere except your own computer.
2. **The web interface** (`app/public/`). This is what you see in the browser:
   plain HTML, CSS and JavaScript, with no build step and no downloads from
   the internet. The thumbnail is drawn on an HTML **canvas**. The same
   drawing code makes the small preview and the full 3840 × 2160 export, so
   what you see is what you get.

When you export, the browser draws the full-size picture, turns it into PNG
and JPG files, and sends the file bytes to the local server, which saves them
in the design's `exports/` folder.

Main files:

| File | What it does |
|---|---|
| `Start Thumbnail Studio.command` | Launcher: checks for Node.js, starts the server, opens the browser. |
| `app/server.js` | The local server: serves the app and saves files in `user-data/`. |
| `app/public/index.html` | The page layout. |
| `app/public/style.css` | The look (light and dark mode follow your Mac's setting). |
| `app/public/js/main.js` | Connects buttons and fields to the design. |
| `app/public/js/render.js` | Draws a thumbnail onto a canvas. |
| `app/public/js/export.js` | Makes the PNG and the under-2 MB JPG, names the files, saves them. |
| `app/public/js/youtube-rules.js` | YouTube's size and format limits, in one place. |
| `tests/e2e.js` | Automated test (for development; you don't need it). |

### Settings for the curious

- **Different port:** if 4317 clashes with something, start from Terminal with
  `THUMBNAIL_STUDIO_PORT=4318 node app/server.js --open`.
- **Keep your files elsewhere** (for example in iCloud Drive): set
  `THUMBNAIL_STUDIO_DATA=/path/to/folder` the same way.

### For developers

`node tests/e2e.js [screenshot-folder]` starts the server with a throwaway
data folder, opens the app in headless Chromium (needs Playwright), exports a
thumbnail and checks the files: names, 3840 × 2160 size, JPG under 2 MB even
for a worst-case noisy image, and that unsafe file names and non-local
requests are refused.
