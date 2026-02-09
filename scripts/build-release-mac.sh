#!/bin/bash
# Aireader Release Build Script for macOS
# Usage: ./scripts/build-release-mac.sh [--skip-npm] [--arm64] [--universal]
# Output: src-tauri/target/release/bundle/dmg/Aireader_<version>_<arch>.dmg

set -e

SKIP_NPM=false
BUILD_ARM64=false
BUILD_UNIVERSAL=false

for arg in "$@"; do
    case $arg in
        --skip-npm) SKIP_NPM=true ;;
        --arm64) BUILD_ARM64=true ;;
        --universal) BUILD_UNIVERSAL=true ;;
        *) echo "Unknown option: $arg"; exit 1 ;;
    esac
done

# Ensure cargo and node are in PATH
[ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"
eval "$(/usr/local/bin/brew shellenv zsh 2>/dev/null || /opt/homebrew/bin/brew shellenv zsh 2>/dev/null)" 2>/dev/null || true

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo ""
echo "========================================"
echo "  Aireader macOS Release Build"
echo "========================================"
echo ""

# 1. Read version from package.json
VERSION=$(node -e "console.log(require('./package.json').version)")
echo "[1/6] Version: $VERSION"

# 2. Verify required files
echo "[2/6] Checking required files..."

REQUIRED=(
    "src-tauri/resources/dictionaries"
    "src-tauri/resources/samples"
    "src-tauri/icons/icon.icns"
    "src-tauri/icons/icon.png"
    "LICENSE"
)

for f in "${REQUIRED[@]}"; do
    if [ ! -e "$f" ]; then
        echo "  MISSING: $f"
        exit 1
    fi
    echo "  OK: $f"
done

# Check for macOS runtime (optional — app can download at first launch)
MAC_RUNTIME=$(find src-tauri/resources/llm/runtime -name "*macos*" -o -name "*darwin*" 2>/dev/null | head -1)
if [ -n "$MAC_RUNTIME" ]; then
    SIZE=$(du -h "$MAC_RUNTIME" | cut -f1)
    echo "  OK: macOS runtime ($MAC_RUNTIME, $SIZE)"
else
    echo "  INFO: No bundled macOS runtime found — app will download on first launch"
fi

# 3. Install frontend dependencies
if [ "$SKIP_NPM" = false ]; then
    echo "[3/6] Installing frontend dependencies..."
    npm install --production=false
else
    echo "[3/6] Skipping npm install (flag set)"
fi

# 4. TypeScript check
echo "[4/6] TypeScript type check..."
npx tsc --noEmit --skipLibCheck

# 5. Rust check
echo "[5/6] Rust check..."
(cd src-tauri && cargo check)

# 6. Build
echo "[6/6] Building release..."

if [ "$BUILD_UNIVERSAL" = true ]; then
    echo "  Building universal binary (x86_64 + arm64)..."
    rustup target add aarch64-apple-darwin 2>/dev/null || true
    rustup target add x86_64-apple-darwin 2>/dev/null || true
    npm run tauri build -- --target universal-apple-darwin
elif [ "$BUILD_ARM64" = true ]; then
    echo "  Building for arm64 (Apple Silicon)..."
    rustup target add aarch64-apple-darwin 2>/dev/null || true
    npm run tauri build -- --target aarch64-apple-darwin
else
    echo "  Building for current architecture ($(uname -m))..."
    npm run tauri build
fi

# Done
echo ""
echo "========================================"
echo "  Build Complete!"
echo "========================================"

# Find and display output files
DMG_FILES=$(find src-tauri/target -name "*.dmg" -newer src-tauri/Cargo.toml 2>/dev/null)
APP_FILES=$(find src-tauri/target -name "*.app" -maxdepth 5 -newer src-tauri/Cargo.toml 2>/dev/null)

if [ -n "$DMG_FILES" ]; then
    echo "  DMG installer(s):"
    for f in $DMG_FILES; do
        SIZE=$(du -h "$f" | cut -f1)
        echo "    $f ($SIZE)"
    done
fi

if [ -n "$APP_FILES" ]; then
    echo "  App bundle(s):"
    for f in $APP_FILES; do
        echo "    $f"
    done
fi

echo ""
