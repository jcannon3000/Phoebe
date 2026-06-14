#!/usr/bin/env bash
#
# cobreathe-sync.sh — one command to add breathing photos and ship them.
#
# What it does, in order:
#   1. (optional) Resize any image paths you pass in → src/assets/cobreathe/
#      at 1200px long-edge / quality 65 (small, but plenty under the wash).
#   2. Build the web app, build the native shell, compose www/.
#   3. cap sync ios  (with the LANG fix CocoaPods needs locally).
#   4. Commit the new photos + push to phoebe-mobile (Railway auto-deploys).
#
# Usage:
#   ./scripts/cobreathe-sync.sh ~/Downloads/foo.jpg ~/Downloads/bar.jpg
#   ./scripts/cobreathe-sync.sh ~/Downloads/*.jpg          # globs are fine
#   ./scripts/cobreathe-sync.sh                            # no photos: just rebuild+sync+push
#
# After it finishes, hit ▶ Run (Cmd-R) in Xcode to reinstall on the device.
#
set -euo pipefail

# Resolve repo paths from this script's location (works from any cwd).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO="$(cd "$MOBILE/../.." && pwd)"
COBREATHE="$REPO/artifacts/mymonastery/src/assets/cobreathe"

# Tuned for a full-screen phone photo sitting under a heavy dark-green wash.
MAX_EDGE=1200
QUALITY=65

added=0
for src in "$@"; do
  [ -e "$src" ] || { echo "skip (not found): $src"; continue; }
  base="$(basename "$src")"
  # Normalise extension to .jpg so the glob in cobreathe.tsx picks it up.
  name="${base%.*}.jpg"
  dest="$COBREATHE/$name"
  if [ -e "$dest" ]; then echo "skip (already in library): $name"; continue; fi
  if sips -Z "$MAX_EDGE" -s format jpeg -s formatOptions "$QUALITY" "$src" --out "$dest" >/dev/null 2>&1; then
    echo "added: $name ($(du -h "$dest" | cut -f1))"
    added=$((added+1))
  else
    echo "FAILED to resize: $src"
  fi
done

total=$(ls "$COBREATHE"/*.jpg 2>/dev/null | wc -l | tr -d ' ')
avif=$(ls "$COBREATHE"/*.avif 2>/dev/null | wc -l | tr -d ' ')
libtotal=$((total + avif))
echo "--- library: $libtotal photos ($total jpg + $avif avif), $(du -sh "$COBREATHE" | cut -f1) ---"

echo "==> building web"
( cd "$MOBILE" && pnpm run build:web )
echo "==> building shell + composing www"
( cd "$MOBILE" && pnpm run build:shell && pnpm run build:compose )
echo "==> cap sync ios"
( cd "$MOBILE" && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx cap sync ios )

echo "==> commit + push"
cd "$REPO"
git add "artifacts/mymonastery/src/assets/cobreathe"
if git diff --cached --quiet; then
  echo "no photo changes to commit"
else
  if [ "$added" -gt 0 ]; then
    git commit -q -m "Cobreathe: add $added more photo(s) to the breathing library ($libtotal total)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  else
    git commit -q -m "Cobreathe: update breathing library ($libtotal total)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  fi
  git push origin phoebe-mobile
fi

echo "✅ done — now hit ▶ Run (Cmd-R) in Xcode to reinstall."
