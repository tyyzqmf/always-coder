#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$ROOT_DIR/dist-release"

# Detect platform
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$ARCH" in
  x86_64) ARCH="x64" ;;
  aarch64|arm64) ARCH="arm64" ;;
esac

PLATFORM="${OS}-${ARCH}"
VERSION=$(node -p "require('$ROOT_DIR/packages/cli/package.json').version")

echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}    Building Always Coder CLI v${VERSION} for ${PLATFORM}       ${CYAN}║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check Bun
if ! command -v bun &> /dev/null; then
  echo -e "${RED}Error: Bun is required but not installed${NC}"
  echo "Install with: curl -fsSL https://bun.sh/install | bash"
  exit 1
fi
echo -e "${GREEN}✓${NC} Bun $(bun --version) found"

# Clean and create build directory
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

BUNDLE_DIR="$BUILD_DIR/always-coder-${PLATFORM}"
mkdir -p "$BUNDLE_DIR"

# Step 1: Build TypeScript packages
echo ""
echo -e "${CYAN}[1/5]${NC} Building TypeScript packages..."
cd "$ROOT_DIR"
pnpm --filter @always-coder/shared build
pnpm --filter @always-coder/cli build
echo -e "${GREEN}✓${NC} TypeScript build complete"

# Step 2: Bundle with Bun (keeping native modules external)
echo ""
echo -e "${CYAN}[2/5]${NC} Bundling with Bun..."
bun build packages/cli/dist/index.js \
  --outfile="$BUNDLE_DIR/cli.js" \
  --target=node \
  --format=esm \
  --external node-pty \
  --external ws \
  --minify

# Fix shebang (Bun adds #!/usr/bin/env bun, we want node for portability)
sed -i '1s|#!/usr/bin/env bun|#!/usr/bin/env node|' "$BUNDLE_DIR/cli.js"
chmod +x "$BUNDLE_DIR/cli.js"
echo -e "${GREEN}✓${NC} Bundle created ($(du -h "$BUNDLE_DIR/cli.js" | cut -f1))"

# Step 3: Copy external modules (node-pty, ws)
echo ""
echo -e "${CYAN}[3/5]${NC} Copying external modules..."

# Function to find package in pnpm structure
find_package() {
  local pkg_name=$1
  # First try to find in .pnpm with version pattern (most reliable)
  local pkg_dir=$(find "$ROOT_DIR/node_modules/.pnpm" -path "*/${pkg_name}@*/node_modules/${pkg_name}" -type d | head -1)
  # Fallback to regular node_modules
  if [ -z "$pkg_dir" ]; then
    pkg_dir=$(find "$ROOT_DIR/node_modules" -path "*/$pkg_name" -type d ! -path "*/.pnpm/*" ! -path "*/@types/*" | head -1)
  fi
  echo "$pkg_dir"
}

# Copy node-pty
NODE_PTY_DIR=$(find_package "node-pty")
if [ -z "$NODE_PTY_DIR" ] || [ ! -d "$NODE_PTY_DIR" ]; then
  echo -e "${RED}Error: node-pty not found in node_modules${NC}"
  exit 1
fi
echo -e "${GREEN}✓${NC} Found node-pty at: $NODE_PTY_DIR"

mkdir -p "$BUNDLE_DIR/node_modules/node-pty"
cp "$NODE_PTY_DIR/package.json" "$BUNDLE_DIR/node_modules/node-pty/"
cp -r "$NODE_PTY_DIR/lib" "$BUNDLE_DIR/node_modules/node-pty/"

# Copy prebuilds for target platform
PREBUILD_DIR="$NODE_PTY_DIR/prebuilds/$PLATFORM"
if [ -d "$PREBUILD_DIR" ]; then
  mkdir -p "$BUNDLE_DIR/node_modules/node-pty/prebuilds/$PLATFORM"
  cp -r "$PREBUILD_DIR/"* "$BUNDLE_DIR/node_modules/node-pty/prebuilds/$PLATFORM/"
  echo -e "${GREEN}✓${NC} node-pty prebuilds copied for $PLATFORM"
else
  echo -e "${YELLOW}!${NC} No prebuild for $PLATFORM, copying build artifacts..."
  if [ -d "$NODE_PTY_DIR/build/Release" ]; then
    mkdir -p "$BUNDLE_DIR/node_modules/node-pty/build/Release"
    cp "$NODE_PTY_DIR/build/Release/"*.node "$BUNDLE_DIR/node_modules/node-pty/build/Release/" 2>/dev/null || true
    echo -e "${GREEN}✓${NC} node-pty build artifacts copied"
  fi
fi

# Copy ws module
WS_DIR=$(find_package "ws")
if [ -z "$WS_DIR" ] || [ ! -d "$WS_DIR" ]; then
  echo -e "${RED}Error: ws not found in node_modules${NC}"
  exit 1
fi
echo -e "${GREEN}✓${NC} Found ws at: $WS_DIR"

mkdir -p "$BUNDLE_DIR/node_modules/ws"
cp "$WS_DIR/package.json" "$BUNDLE_DIR/node_modules/ws/"
cp -r "$WS_DIR/lib" "$BUNDLE_DIR/node_modules/ws/"
cp "$WS_DIR/index.js" "$BUNDLE_DIR/node_modules/ws/" 2>/dev/null || true
cp "$WS_DIR/wrapper.mjs" "$BUNDLE_DIR/node_modules/ws/" 2>/dev/null || true
cp "$WS_DIR/browser.js" "$BUNDLE_DIR/node_modules/ws/" 2>/dev/null || true
echo -e "${GREEN}✓${NC} ws module copied"

# Step 4: Create launcher script
echo ""
echo -e "${CYAN}[4/5]${NC} Creating launcher..."

cat > "$BUNDLE_DIR/always" << 'LAUNCHER'
#!/usr/bin/env bash
# Always Coder CLI Launcher
set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Set NODE_PATH to include bundled node_modules
export NODE_PATH="$SCRIPT_DIR/node_modules:$NODE_PATH"

# Prefer bun if available, fallback to node
if command -v bun &> /dev/null; then
  exec bun "$SCRIPT_DIR/cli.js" "$@"
else
  exec node "$SCRIPT_DIR/cli.js" "$@"
fi
LAUNCHER

chmod +x "$BUNDLE_DIR/always"

# Create README
cat > "$BUNDLE_DIR/README.md" << 'README'
# Always Coder CLI

Remote AI coding agent control - access Claude, Codex, and other AI assistants from anywhere.

## Quick Start

1. Configure your server endpoints:
   ```bash
   ./always init <server-url> <web-url>
   ```

2. Start a session:
   ```bash
   ./always claude
   ```

## Installation (optional)

Add to your PATH for global access:
```bash
# Option 1: Symlink
sudo ln -s $(pwd)/always /usr/local/bin/always

# Option 2: Copy
sudo cp always cli.js /usr/local/bin/
sudo cp -r node_modules /usr/local/lib/always-coder/
```

## Commands

```bash
always claude              # Start Claude session
always claude --daemon     # Start in background
always sessions            # List active sessions
always stop <id>           # Stop a session
always config list         # Show configuration
always --help              # Show all commands
```

## Requirements

- Node.js 20+ or Bun 1.0+
README

echo -e "${GREEN}✓${NC} Launcher and README created"

# Step 5: Create archive
echo ""
echo -e "${CYAN}[5/5]${NC} Creating archive..."
cd "$BUILD_DIR"
ARCHIVE_NAME="always-coder-${VERSION}-${PLATFORM}.tar.gz"
tar -czf "$ARCHIVE_NAME" "always-coder-${PLATFORM}"

# Calculate sizes
ARCHIVE_SIZE=$(du -h "$ARCHIVE_NAME" | cut -f1)
DIR_SIZE=$(du -sh "always-coder-${PLATFORM}" | cut -f1)

echo -e "${GREEN}✓${NC} Archive created"

# Summary
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}                    Build Complete!                        ${GREEN}║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Output:"
echo "  Directory:    $BUNDLE_DIR ($DIR_SIZE)"
echo "  Archive:      $BUILD_DIR/$ARCHIVE_NAME ($ARCHIVE_SIZE)"
echo ""
echo "Test locally:"
echo "  cd $BUNDLE_DIR"
echo "  ./always --help"
echo ""
echo "Installation:"
echo "  tar -xzf $ARCHIVE_NAME"
echo "  cd always-coder-${PLATFORM}"
echo "  ./always init <server-url> <web-url>"
echo "  ./always claude"
