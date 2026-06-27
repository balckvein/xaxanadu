#!/usr/bin/env bash
# Copies the web game into the Android app's assets so the APK bundles it offline.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
dst="$root/android/app/src/main/assets/www"

rm -rf "$dst"
mkdir -p "$dst"
cp "$root/index.html" "$dst/"
cp -r "$root/css" "$dst/"
cp -r "$root/js" "$dst/"
cp -r "$root/assets" "$dst/"

echo "Synced web game -> $dst"
