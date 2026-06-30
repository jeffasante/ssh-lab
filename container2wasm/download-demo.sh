#!/bin/bash
# Download container2wasm demo images (split into chunks on GitHub Pages)
set -e

OUTDIR="${1:-./images}"
BASEURL="https://ktock.github.io/container2wasm-demo/containers"

IMAGES=(
  "riscv64-debian-wasi"
)

mkdir -p "$OUTDIR"

for img in "${IMAGES[@]}"; do
  echo "Downloading $img..."

  # Download all chunks
  chunks=0
  for i in $(seq -f "%02g" 0 99); do
    url="$BASEURL/${img}-container$i.wasm"
    code=$(curl -sL -o /dev/null -w "%{http_code}" "$url")
    if [ "$code" != "200" ]; then
      break
    fi
    echo "  chunk $i (HTTP $code)"
    curl -sL "$url" -o "$OUTDIR/${img}-chunk-$i.wasm" &
    chunks=$((chunks + 1))
  done
  wait

  # Merge chunks
  if [ $chunks -gt 0 ]; then
    echo "Merging $chunks chunks..."
    > "$OUTDIR/$img.wasm"
    for i in $(seq -f "%02g" 0 $((chunks - 1))); do
      cat "$OUTDIR/${img}-chunk-$i.wasm" >> "$OUTDIR/$img.wasm"
      rm "$OUTDIR/${img}-chunk-$i.wasm"
    done
    size=$(du -h "$OUTDIR/$img.wasm" | cut -f1)
    echo "  done ($size)"
  else
    echo "  no chunks found at $BASEURL"
  fi
done

echo ""
echo "Images in $OUTDIR:"
ls -lh "$OUTDIR"/*.wasm 2>/dev/null || echo "(none)"
