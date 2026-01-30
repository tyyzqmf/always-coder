#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Progress indicator
progress() {
  echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $1"
}

success() {
  echo -e "${GREEN}✓${NC} $1"
}

error() {
  echo -e "${RED}✗${NC} $1"
}

warn() {
  echo -e "${YELLOW}!${NC} $1"
}

# Show help
show_help() {
  cat << EOF
${BOLD}Always Coder - CLI Installation${NC}

${BOLD}USAGE:${NC}
  install.sh [OPTIONS] <server-url> <web-url>
  install.sh --local
  install.sh --help

${BOLD}OPTIONS:${NC}
  --help, -h      Show this help message
  --local, -l     Install for local development (no backend required)
  --update        Update existing installation without reconfiguring

${BOLD}ARGUMENTS:${NC}
  server-url      WebSocket server URL (e.g., wss://xxx.execute-api.us-east-1.amazonaws.com/prod)
  web-url         Web application URL (e.g., https://xxx.cloudfront.net)

${BOLD}EXAMPLES:${NC}
  # Install with deployed backend
  curl -fsSL https://raw.githubusercontent.com/tyyzqmf/always-coder/main/install.sh | \\
    bash -s -- wss://your-server.amazonaws.com/prod https://your-web.cloudfront.net

  # Install for local development
  curl -fsSL https://raw.githubusercontent.com/tyyzqmf/always-coder/main/install.sh | \\
    bash -s -- --local

  # Update existing installation
  curl -fsSL https://raw.githubusercontent.com/tyyzqmf/always-coder/main/install.sh | \\
    bash -s -- --update

${BOLD}HOW TO GET SERVER-URL AND WEB-URL:${NC}
  If you're deploying your own backend:
    1. Clone: git clone https://github.com/tyyzqmf/always-coder.git
    2. Deploy: cd always-coder/infra && pnpm cdk deploy --all
    3. Note the outputs: WebSocketUrl and WebUrl

  If someone else deployed for you:
    - Ask them for the server-url and web-url values

${BOLD}REQUIREMENTS:${NC}
  - Node.js 20+
  - npm or pnpm

For more information, see: https://github.com/tyyzqmf/always-coder
EOF
}

# Parse arguments
LOCAL_MODE=false
UPDATE_MODE=false
SERVER_URL=""
WEB_URL=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --help|-h)
      show_help
      exit 0
      ;;
    --local|-l)
      LOCAL_MODE=true
      shift
      ;;
    --update)
      UPDATE_MODE=true
      shift
      ;;
    -*)
      error "Unknown option: $1"
      echo ""
      echo "Run 'install.sh --help' for usage information."
      exit 1
      ;;
    *)
      if [ -z "$SERVER_URL" ]; then
        SERVER_URL=$1
      elif [ -z "$WEB_URL" ]; then
        WEB_URL=$1
      else
        error "Too many arguments"
        echo ""
        echo "Run 'install.sh --help' for usage information."
        exit 1
      fi
      shift
      ;;
  esac
done

# Header
echo ""
echo -e "${CYAN}╔════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}     ${BOLD}Always Coder - CLI Installation${NC}        ${CYAN}║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════╝${NC}"
echo ""

# Validate arguments
if [ "$LOCAL_MODE" = false ] && [ "$UPDATE_MODE" = false ]; then
  if [ -z "$SERVER_URL" ] || [ -z "$WEB_URL" ]; then
    error "Missing required arguments: server-url and web-url"
    echo ""
    echo -e "${BOLD}Usage:${NC}"
    echo "  install.sh <server-url> <web-url>"
    echo "  install.sh --local"
    echo "  install.sh --help"
    echo ""
    echo -e "${BOLD}Example:${NC}"
    echo "  curl -fsSL https://raw.githubusercontent.com/tyyzqmf/always-coder/main/install.sh | \\"
    echo "    bash -s -- wss://your-server.amazonaws.com/prod https://your-web.cloudfront.net"
    echo ""
    echo -e "${BOLD}Don't have server-url and web-url?${NC}"
    echo "  Option 1: Deploy your own backend"
    echo "    - Clone the repo and run: cd infra && pnpm cdk deploy --all"
    echo "    - Use the WebSocketUrl and WebUrl from the deployment output"
    echo ""
    echo "  Option 2: Use local development mode"
    echo "    - Run: install.sh --local"
    echo "    - This sets up the CLI without backend connectivity"
    echo ""
    echo "  Option 3: Ask your team/organization"
    echo "    - If someone else deployed Always Coder, ask them for the URLs"
    echo ""
    echo "Run 'install.sh --help' for more information."
    exit 1
  fi
fi

# Set default URLs for local mode
if [ "$LOCAL_MODE" = true ]; then
  SERVER_URL="ws://localhost:3001"
  WEB_URL="http://localhost:3000"
  warn "Local development mode - using localhost URLs"
fi

# Step 1: Check Node.js
progress "Checking Node.js..."
if ! command -v node &> /dev/null; then
  error "Node.js not found"
  echo ""
  echo "Please install Node.js 20+ first:"
  echo "  - Using nvm (recommended): nvm install 20 && nvm use 20"
  echo "  - Using brew (macOS): brew install node@20"
  echo "  - Download from: https://nodejs.org/"
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  error "Node.js 20+ required. Current version: $(node -v)"
  echo ""
  echo "Please upgrade Node.js:"
  echo "  - Using nvm: nvm install 20 && nvm use 20"
  echo "  - Using brew: brew upgrade node"
  exit 1
fi
success "Node.js $(node -v) found"

# Step 2: Check/install pnpm
progress "Checking pnpm..."
if ! command -v pnpm &> /dev/null; then
  warn "pnpm not found, installing..."
  npm install -g pnpm
  success "pnpm installed"
else
  success "pnpm $(pnpm --version) found"
fi

# Step 3: Clone or update repository
INSTALL_DIR="$HOME/.always-coder"
progress "Setting up installation directory..."

if [ -d "$INSTALL_DIR/.git" ]; then
  progress "Updating existing installation..."
  cd "$INSTALL_DIR"
  git fetch origin
  git reset --hard origin/main
  success "Repository updated"
elif [ -d "$INSTALL_DIR" ]; then
  warn "Removing invalid installation at $INSTALL_DIR..."
  rm -rf "$INSTALL_DIR"
  progress "Cloning repository..."
  git clone https://github.com/tyyzqmf/always-coder.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
  success "Repository cloned"
else
  progress "Cloning repository..."
  git clone https://github.com/tyyzqmf/always-coder.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
  success "Repository cloned"
fi

# Step 4: Install dependencies
progress "Installing dependencies..."
pnpm install
success "Dependencies installed"

# Step 5: Build packages
progress "Building shared package..."
pnpm --filter @always-coder/shared build
success "Shared package built"

progress "Building CLI package..."
pnpm --filter @always-coder/cli build
success "CLI package built"

# Step 6: Configure (skip if update mode)
if [ "$UPDATE_MODE" = false ]; then
  progress "Configuring CLI..."
  node packages/cli/dist/index.js init "$SERVER_URL" "$WEB_URL"
  success "CLI configured"
else
  success "Skipped configuration (update mode)"
fi

# Step 7: Create global command
progress "Creating global command..."
mkdir -p "$HOME/.local/bin"

cat > "$HOME/.local/bin/always" << 'EOF'
#!/bin/bash
node "$HOME/.always-coder/packages/cli/dist/index.js" "$@"
EOF

chmod +x "$HOME/.local/bin/always"
success "Global command created"

# Step 8: Add to PATH if needed
PATH_UPDATED=false
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
  # Detect shell and update appropriate rc file
  SHELL_RC=""
  if [ -n "$ZSH_VERSION" ] || [ "$SHELL" = "/bin/zsh" ]; then
    SHELL_RC="$HOME/.zshrc"
  elif [ -n "$BASH_VERSION" ] || [ "$SHELL" = "/bin/bash" ]; then
    SHELL_RC="$HOME/.bashrc"
  fi

  if [ -n "$SHELL_RC" ] && [ -f "$SHELL_RC" ]; then
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SHELL_RC"
    export PATH="$HOME/.local/bin:$PATH"
    PATH_UPDATED=true
    success "PATH updated in $SHELL_RC"
  fi
fi

# Summary
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║${NC}        ${BOLD}Installation Complete!${NC}              ${GREEN}║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════╝${NC}"
echo ""

if [ "$LOCAL_MODE" = true ]; then
  echo -e "${BOLD}Local Development Mode${NC}"
  echo ""
  echo "To start developing:"
  echo "  1. Start the backend: pnpm --filter @always-coder/server dev"
  echo "  2. Start the web app: pnpm --filter @always-coder/web dev"
  echo "  3. Run the CLI: always claude"
  echo ""
else
  echo -e "${BOLD}Configuration:${NC}"
  echo "  Server: $SERVER_URL"
  echo "  Web:    $WEB_URL"
  echo ""
fi

echo -e "${BOLD}Quick Start:${NC}"
echo -e "  Run: ${CYAN}always claude${NC}"
echo ""

if [ "$PATH_UPDATED" = true ]; then
  echo -e "${YELLOW}Note:${NC} Run the following to use 'always' in this terminal:"
  echo -e "  ${CYAN}source $SHELL_RC${NC}"
  echo ""
fi

echo -e "${BOLD}Other Commands:${NC}"
echo "  always --help      Show all commands"
echo "  always sessions    List active sessions"
echo "  always config list Show configuration"
echo ""
