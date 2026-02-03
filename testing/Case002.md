# Case002: CLI Reconnection Race Condition Test

## Test Objective
Verify that when CLI temporarily disconnects and reconnects, the Web client handles the race condition gracefully without showing error pages. This tests the fix for the issue where `CONNECTION_FAILED` errors would show a fatal error page even when CLI was in the process of reconnecting.

## Background

When CLI disconnects and reconnects quickly, a race condition can occur:
1. Web sends a message (terminal input)
2. CLI disconnects at the same moment
3. Server returns `CONNECTION_FAILED` error because CLI is not connected
4. CLI reconnects shortly after

**Before fix**: Web would show a fatal error page on `CONNECTION_FAILED`
**After fix**: Web stays in "connecting" state and waits for CLI to reconnect

## Environment Information

| Configuration | Value |
|---------------|-------|
| Web URL | `<YOUR_WEB_URL>` |
| WebSocket | `<YOUR_WEBSOCKET_URL>` |
| Cognito Region | `<YOUR_REGION>` |
| CLI Version | >= 1.1.3 |

## Prerequisites
1. Test user created in Cognito
2. Node.js >= 20.0.0
3. Two terminal windows (one for CLI, one for network control)

## Test Steps

### Step 1: Install Latest CLI
```bash
npm install -g @always-coder/cli@latest
always --version
```
**Expected Result**: Version >= `1.1.3` is displayed

### Step 2: Login to Server
```bash
always login --server <YOUR_WEBSOCKET_URL>
```
**Expected Result**: Login successful

### Step 3: Start CLI Session in Daemon Mode
```bash
always claude -d
```
**Expected Result**: Session started, QR code displayed

### Step 4: Connect Web Client
1. Open browser and navigate to `<YOUR_WEB_URL>`
2. Login with Cognito account
3. Connect to the session from Step 3
4. Open browser DevTools (F12) → Network tab → Filter by "WS" to monitor WebSocket

**Expected Result**: Terminal connected and working

### Step 5: Verify Normal Operation
Type a test message in the web terminal

**Expected Result**: CLI receives input and responds

### Step 6: Simulate CLI Network Interruption

**Method A - Network Interface (requires sudo)**:
```bash
# In another terminal, temporarily disable network for CLI
# Replace eth0 with your network interface name
sudo iptables -A OUTPUT -p tcp --dport 443 -j DROP
sleep 3
sudo iptables -D OUTPUT -p tcp --dport 443 -j DROP
```

**Method B - Kill and Restart CLI Process**:
```bash
# Find CLI process
ps aux | grep "always claude"

# In another terminal, kill the CLI WebSocket connection
# The daemon will automatically reconnect
kill -SIGUSR1 <CLI_PID>  # If supported, or just wait for natural reconnection
```

**Method C - Use Browser DevTools to Simulate**:
1. While CLI is connected, rapidly type multiple characters in the web terminal
2. Simultaneously, in another terminal, restart the CLI:
   ```bash
   always stop --all
   always claude -d
   ```

**Expected Result during interruption**:
- Web terminal shows "Connecting..." or similar waiting state
- **NO error page should appear**

### Step 7: Monitor WebSocket Messages During Reconnection

In browser DevTools Network tab, observe the WebSocket messages:

**Expected Messages** (in order):
1. `{"type":"cli:disconnected"}` - CLI disconnected notification
2. Possibly `{"type":"error","code":"CONNECTION_FAILED",...}` - Message relay failed (this is OK)
3. `{"type":"cli:reconnected","cliPublicKey":"..."}` - CLI reconnected

**Critical Check**:
- Even if `CONNECTION_FAILED` error is received, the web UI should **NOT** show an error page
- Web UI should remain in "connecting" state until CLI reconnects

### Step 8: Verify Automatic Recovery
After CLI reconnects:

**Expected Result**:
- Web terminal automatically resumes connected state
- No manual action required
- Can continue typing and interacting with CLI
- **NO error page was shown during the entire process**

### Step 9: Verify Continued Functionality
Type another test message in the web terminal

**Expected Result**: CLI receives input and responds normally

### Step 10: Review Console Logs
Check browser DevTools Console for any errors

**Expected Result**:
- Log message: `CLI temporarily disconnected, waiting for reconnection...`
- Log message: `CLI reconnected, re-establishing encryption`
- **NO** uncaught errors or exceptions

### Step 11: Cleanup
```bash
always stop --all
```

## Test Results

| Step | Result | Notes |
|------|--------|-------|
| Step 1 |  |  |
| Step 2 |  |  |
| Step 3 |  |  |
| Step 4 |  |  |
| Step 5 |  |  |
| Step 6 |  |  |
| Step 7 |  |  |
| Step 8 |  |  |
| Step 9 |  |  |
| Step 10 |  |  |
| Step 11 |  |  |

## Key Verification Points

1. **No Error Page**: During CLI reconnection, web UI should NEVER show the "Connection Error" page with 😕 emoji
2. **Graceful Waiting**: Web UI should show "Connecting..." state while waiting for CLI
3. **Automatic Recovery**: Once CLI reconnects, web UI should automatically resume without user action
4. **Console Logs**: Should see "waiting for reconnection" log, not error stack traces

## Failure Indicators

The test **FAILS** if any of these occur:
- Error page with "Connection Error" and "CLI is not connected" message appears
- Web UI requires manual refresh to reconnect after CLI reconnects
- Uncaught exceptions in browser console
- Web UI stays stuck in error state after CLI reconnects

## Related Code

- `packages/web/src/hooks/useSession.ts` - `cliDisconnectedRef` flag and `handleServerError` logic
- `packages/web/src/app/session/page.tsx` - Error state rendering
- `packages/server/src/handlers/message.ts` - `handleEncryptedMessage` and `CONNECTION_FAILED` error

## Related Issues/PRs
- Fix: Handle CONNECTION_FAILED gracefully during CLI reconnection
