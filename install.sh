#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}Always Coder - CLI Installation${NC}"
echo ""

# Check arguments
if [ $# -lt 2 ]; then
  echo -e "${RED}Usage: $0 <server-url> <web-url>${NC}"
  echo ""
  echo "Example:"
  echo "  curl -fsSL https://raw.githubusercontent.com/tyyzqmf/always-coder/main/install.sh | bash -s -- wss://your-server.amazonaws.com/prod https://your-web.cloudfront.net"
  exit 1
fi

SERVER_URL=$1
WEB_URL=$2

# Check for pnpm
if ! command -v pnpm &> /dev/null; then
  echo -e "${RED}pnpm not found. Installing...${NC}"
  npm install -g pnpm
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo -e "${RED}Node.js 20+ required. Current: $(node -v)${NC}"
  echo "Install with: nvm install 20 && nvm use 20"
  exit 1
fi

# Clone or update
INSTALL_DIR="$HOME/always-coder"
if [ -d "$INSTALL_DIR" ]; then
  echo "Updating existing installation..."
  cd "$INSTALL_DIR"
  git pull
else
  echo "Cloning repository..."
  git clone https://github.com/tyyzqmf/always-coder.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# Install and build
echo "Installing dependencies..."
pnpm install --silent

echo "Building CLI..."
pnpm --filter @always-coder/shared build --silent
pnpm --filter @always-coder/cli build --silent

# Configure
echo "Configuring..."
node packages/cli/dist/index.js init "$SERVER_URL" "$WEB_URL"

# Add alias suggestion
echo ""
echo -e "${GREEN}✓ Installation complete!${NC}"
echo ""
echo "Run with:"
echo -e "  ${CYAN}cd ~/always-coder && pnpm always claude${NC}"
echo ""
echo "Or add alias to ~/.bashrc:"
echo -e "  ${CYAN}echo 'alias always=\"cd ~/always-coder && pnpm always\"' >> ~/.bashrc${NC}"
echo -e "  ${CYAN}source ~/.bashrc${NC}"
echo -e "  ${CYAN}always claude${NC}"
