#!/bin/bash
# Double-click this file in Finder to build Thumbnail Studio and put it in
# your Applications folder. Run it once to install, and again after each update.
# It needs the internet only while it runs; the app itself works offline.

cd "$(dirname "$0")" || exit 1

# Show a message box, then quit this script.
fail() {
  echo ""
  echo "Something went wrong: $1"
  osascript -e "display dialog \"Installing Thumbnail Studio didn't finish:\n\n$1\n\nThe Terminal window shows the details.\" buttons {\"OK\"} with icon stop" >/dev/null 2>&1
  exit 1
}

# Finder doesn't always pass on the usual search path, so add the places
# the official Node.js installer (and Homebrew) put the `node` program.
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

# 1. Is Node.js installed? (Only needed for installing, not for using the app.)
if ! command -v node >/dev/null 2>&1; then
  answer=$(osascript -e 'button returned of (display dialog "Installing Thumbnail Studio needs Node.js, which is not installed yet.\n\nDownload the LTS macOS installer from nodejs.org, install it, then double-click this file again." buttons {"Cancel", "Open nodejs.org"} default button 2 with icon caution)' 2>/dev/null)
  [ "$answer" = "Open nodejs.org" ] && open "https://nodejs.org/en/download"
  exit 1
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 20 ] || fail "Your Node.js ($(node -v)) is too old. Install the LTS version from nodejs.org."

echo ""
echo "Installing Thumbnail Studio. This takes a few minutes the first time."
echo ""
echo "Step 1 of 3: downloading the building blocks…"
npm ci --no-audit --no-fund || fail "Downloading the building blocks failed. Check your internet connection and try again."

echo ""
echo "Step 2 of 3: building the app…"
node scripts/build-mac.js || fail "Building the app failed."
APP="dist/Thumbnail Studio-darwin-$(node -p process.arch)/Thumbnail Studio.app"
[ -d "$APP" ] || fail "The built app wasn't found."

echo ""
echo "Step 3 of 3: copying it to your Applications folder…"
osascript -e 'tell application "Thumbnail Studio" to quit' >/dev/null 2>&1
DEST="/Applications"
if [ ! -w "$DEST" ]; then DEST="$HOME/Applications"; mkdir -p "$DEST"; fi
rm -rf "$DEST/Thumbnail Studio.app"
ditto "$APP" "$DEST/Thumbnail Studio.app" || fail "Copying to $DEST failed."
rm -rf dist   # the copy in Applications is the one you use

echo ""
echo "Done! Thumbnail Studio is in $DEST. Opening it now…"
open "$DEST/Thumbnail Studio.app"
echo "You can close this window."
