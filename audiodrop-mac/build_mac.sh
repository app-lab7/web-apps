#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
BUILD="$ROOT/build"
APP="$BUILD/AudioDrop.app"
rm -rf "$BUILD"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/bin"

swiftc "$ROOT/Sources/main.swift" -o "$APP/Contents/MacOS/AudioDrop" -framework Cocoa
cp "$ROOT/Info.plist" "$APP/Contents/Info.plist"

curl -L --fail --retry 3 https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos -o "$APP/Contents/Resources/bin/yt-dlp"
chmod +x "$APP/Contents/Resources/bin/yt-dlp"

TMP="$BUILD/ffmpeg.zip"
curl -L --fail --retry 3 https://evermeet.cx/ffmpeg/getrelease/zip -o "$TMP"
unzip -q "$TMP" -d "$APP/Contents/Resources/bin"
chmod +x "$APP/Contents/Resources/bin/ffmpeg"

TMP2="$BUILD/ffprobe.zip"
if curl -L --fail --retry 3 https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip -o "$TMP2"; then
  unzip -q "$TMP2" -d "$APP/Contents/Resources/bin" || true
  chmod +x "$APP/Contents/Resources/bin/ffprobe" 2>/dev/null || true
fi

codesign --force --deep --sign - "$APP"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$BUILD/AudioDrop-macOS.zip"
echo "Created: $BUILD/AudioDrop-macOS.zip"
