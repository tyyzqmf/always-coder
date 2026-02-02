# @always-coder/cli

Remote AI coding agent control - access Claude, Codex, and other AI assistants from anywhere via secure WebSocket connections.

## Installation

```bash
npm install -g @always-coder/cli
```

## Quick Start

```bash
# Login to your server
always login --server https://your-server.example.com

# Start a Claude session
always claude

# Run in background (daemon mode)
always claude --daemon

# List all sessions
always sessions
```

## Commands

| Command | Description |
|---------|-------------|
| `always [command]` | Run a command (default: claude) |
| `always login` | Login with your account |
| `always logout` | Logout from your account |
| `always whoami` | Show current logged-in user |
| `always sessions` | List active sessions |
| `always sessions --remote` | List sessions from all instances |
| `always stop <session-id>` | Stop a daemon session |
| `always logs <session-id>` | View session logs |
| `always config list` | Show current configuration |

## Options

- `-d, --daemon` - Run in background mode
- `-s, --server <url>` - WebSocket server URL

## Configuration

Configuration is stored in `~/.always-coder/config.json`.

```bash
# Manual configuration
always init <websocket-url> <web-url>

# Or set individual values
always config set server wss://api.example.com
always config set webUrl https://app.example.com
```

## Requirements

- Node.js >= 20.0.0
- For Claude: `claude` CLI must be installed

## License

MIT
