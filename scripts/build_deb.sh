#!/usr/bin/env bash
# ==============================================================================
# ViliCom - One-Click Debian Package Build & Release Generator
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==> Building ViliCom .deb package via Tauri v2..."
cd "$ROOT_DIR"
cargo tauri build --bundles deb

echo "==> Copying package to release directory..."
mkdir -p "$ROOT_DIR/release"
cp -f "$ROOT_DIR"/src-tauri/target/release/bundle/deb/*.deb "$ROOT_DIR/release/"

echo "==> Generating SHA256 checksums..."
cd "$ROOT_DIR/release"
sha256sum *.deb > SHA256SUMS.txt

echo "==> Build complete! Output located at:"
ls -lh "$ROOT_DIR"/release/*.deb
cat "$ROOT_DIR/release/SHA256SUMS.txt"
