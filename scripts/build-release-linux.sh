#!/bin/bash
# Aireader Release Build Script for Linux (Ubuntu/Debian)
# Usage: ./scripts/build-release-linux.sh [--skip-npm]
# Output: src-tauri/target/release/bundle/appimage/*.AppImage
#         src-tauri/target/release/bundle/deb/*.deb

set -e

SKIP_NPM=false

for arg in "$@"; do
    case $arg in
        --skip-npm) SKIP_NPM=true ;;
        *) echo "Unknown option: $arg"; exit 1 ;;
    esac
done

# Ensure cargo and node are in PATH
[ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

echo ""
echo "========================================"
echo "  Aireader Linux Release Build"
echo "========================================"
echo ""

# 1. Read version from package.json
VERSION=$(node -e "console.log(require('./package.json').version)")
echo "[1/7] Version: $VERSION"

# 2. Check system dependencies
echo "[2/7] Checking system dependencies..."

MISSING_DEPS=()
dpkg -s libwebkit2gtk-4.1-dev &>/dev/null || MISSING_DEPS+=("libwebkit2gtk-4.1-dev")
dpkg -s libappindicator3-dev &>/dev/null  || MISSING_DEPS+=("libappindicator3-dev")
dpkg -s librsvg2-dev &>/dev/null          || MISSING_DEPS+=("librsvg2-dev")
command -v patchelf &>/dev/null            || MISSING_DEPS+=("patchelf")

if [ ${#MISSING_DEPS[@]} -gt 0 ]; then
    echo "  Missing system packages: ${MISSING_DEPS[*]}"
    echo "  Install with: sudo apt-get install -y ${MISSING_DEPS[*]}"
    read -p "  Install now? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo apt-get update
        sudo apt-get install -y "${MISSING_DEPS[@]}"
    else
        echo "  Aborting. Please install dependencies first."
        exit 1
    fi
fi
echo "  All system dependencies OK"

# 3. Verify required files
echo "[3/7] Checking required files..."

REQUIRED=(
    "src-tauri/resources/dictionaries"
    "src-tauri/resources/samples"
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

# Check for Linux runtime (optional — app can download at first launch)
LINUX_RUNTIME=$(find src-tauri/resources/llm/runtime -name "*ubuntu*" -o -name "*linux*" 2>/dev/null | head -1)
if [ -n "$LINUX_RUNTIME" ]; then
    SIZE=$(du -h "$LINUX_RUNTIME" | cut -f1)
    echo "  OK: Linux runtime ($LINUX_RUNTIME, $SIZE)"
else
    echo "  INFO: No bundled Linux runtime found — app will download on first launch"
fi

# 4. Install frontend dependencies
if [ "$SKIP_NPM" = false ]; then
    echo "[4/7] Installing frontend dependencies..."
    npm install --production=false
else
    echo "[4/7] Skipping npm install (flag set)"
fi

# 5. TypeScript check
echo "[5/7] TypeScript type check..."
npx tsc --noEmit --skipLibCheck

# 6. Rust check
echo "[6/7] Rust check..."
(cd src-tauri && cargo check)

# 7. Build
echo "[7/7] Building release..."
npm run tauri build

# Done
echo ""
echo "========================================"
echo "  Build Complete!"
echo "========================================"

# Find and display output files
APPIMAGE_FILES=$(find src-tauri/target -name "*.AppImage" -newer src-tauri/Cargo.toml 2>/dev/null)
DEB_FILES=$(find src-tauri/target -name "*.deb" -newer src-tauri/Cargo.toml 2>/dev/null)

if [ -n "$APPIMAGE_FILES" ]; then
    echo "  AppImage(s):"
    for f in $APPIMAGE_FILES; do
        SIZE=$(du -h "$f" | cut -f1)
        echo "    $f ($SIZE)"
    done
fi

if [ -n "$DEB_FILES" ]; then
    echo "  Deb package(s):"
    for f in $DEB_FILES; do
        SIZE=$(du -h "$f" | cut -f1)
        echo "    $f ($SIZE)"
    done
fi

echo ""
