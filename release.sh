#!/bin/bash
set -e

VERSION=$(grep '"version"' manifest.json | sed 's/.*": "//;s/".*//')
OUTFILE="yt-focus-v${VERSION}.zip"

mkdir -p build
rm -f "build/$OUTFILE"
zip -r "build/$OUTFILE" manifest.json content.js popup.html popup.js icons/

echo "Created build/$OUTFILE"
