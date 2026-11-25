#!/bin/bash
# Double-click this file in Finder to start Thumbnail Studio.
# It starts the small local server and opens the studio in your browser.
# Keep the Terminal window that appears open while you work; close it to stop.

cd "$(dirname "$0")" || exit 1

PORT="${THUMBNAIL_STUDIO_PORT:-4317}"
URL="http://localhost:$PORT"

# Finder doesn't always pass on the usual search path, so add the places
# the official Node.js installer (and Homebrew) put the `node` program.
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

# 1. Is Node.js installed?
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed yet. See 'Set up on my Mac' in README.md."
  answer=$(osascript -e 'button returned of (display dialog "Thumbnail Studio needs Node.js, which is not installed yet.\n\nDownload the LTS macOS installer from nodejs.org, install it, then double-click this launcher again." buttons {"Cancel", "Open nodejs.org"} default button 2 with icon caution)' 2>/dev/null)
  [ "$answer" = "Open nodejs.org" ] && open "https://nodejs.org/en/download"
  exit 1
fi

# 2. Is it new enough? (version 18 or later)
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Your Node.js is version $(node -v). Please install the current LTS version from https://nodejs.org"
  exit 1
fi

# 3. Already running? Then just open the browser.
if curl -s --max-time 1 "$URL/api/info" | grep -q thumbnail-studio; then
  echo "Thumbnail Studio is already running. Opening $URL"
  open "$URL"
  exit 0
fi

# 4. Start the server; it opens the browser once it's ready.
node app/server.js --open
