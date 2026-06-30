#!/bin/bash
# Download container2wasm demo images
# Source: https://ktock.github.io/container2wasm-demo/
set -e

OUTDIR="${1:-./images}"
mkdir -p "$OUTDIR"

DEMOS=(
  "https://ktock.github.io/container2wasm-demo/debian.wasm"
  "https://ktock.github.io/container2wasm-demo/python.wasm"
  "https://ktock.github.io/container2wasm-demo/node.wasm"
  "https://ktock.github.io/container2wasm-demo/vim.wasm"
  "https://ktock.github.io/container2wasm-demo/debian-curl.wasm"
)

echo "Downloading container2wasm demo images to $OUTDIR..."
for url in "${DEMOS[@]}"; do
  filename=$(basename "$url")
  if [ -f "$OUTDIR/$filename" ]; then
    echo "  ✓ $filename (cached)"
  else
    echo "  ↓ $filename..."
    curl -sL "$url" -o "$OUTDIR/$filename"
    size=$(du -h "$OUTDIR/$filename" | cut -f1)
    echo "    done ($size)"
  fi
done

echo ""
echo "All images downloaded. Total:"
du -sh "$OUTDIR"
