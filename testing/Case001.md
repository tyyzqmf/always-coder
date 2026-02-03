# Case001: Session Reconnection Test

## Test Objective
Verify that CLI sessions remain running after web client disconnection and support reconnection.

## Environment Information

| Configuration | Value |
|---------------|-------|
| Web URL | `<YOUR_WEB_URL>` |
| WebSocket | `<YOUR_WEBSOCKET_URL>` |
| Cognito Region | `<YOUR_REGION>` |
| CLI Version | >= 1.1.1 |

> Note: After deployment, you can get the actual addresses from `cd infra && pnpm cdk deploy --all` output

## Prerequisites
1. Test user created in Cognito
2. Node.js >= 20.0.0

## Test Steps

### Step 1: Install Latest CLI
```bash
npm install -g @always-coder/cli@latest
always --version
```
**Expected Result**: Version >= `1.1.1` is displayed

### Step 2: Login to Server
```bash
always login --server <YOUR_WEBSOCKET_URL>
```
**Expected Result**: Prompted for username and password, "Login successful" displayed after login

### Step 3: Start Claude in Daemon Mode
```bash
always claude -d
```
**Expected Result**:
- Session ID and connection info displayed
- QR code displayed
- Web connection URL displayed

### Step 4: Access Web Client via Browser
1. Open browser and navigate to `<YOUR_WEB_URL>`
2. Login with Cognito account

**Expected Result**: Login successful, session list displayed

### Step 5: Connect to Session
Click on the session from Step 3 or scan the QR code

**Expected Result**:
- Successfully connected to terminal
- Claude interface displayed

### Step 6: Complete a Conversation
Enter a test prompt in the web terminal and wait for Claude's response

**Expected Result**: Claude responds normally

### Step 7: Test Ctrl+C Signal Filtering
Press `Ctrl+C` in the web terminal

**Expected Result**:
- CLI displays "Blocked control signals from web: SIGINT"
- Session remains running without termination
- Can continue typing

### Step 8: Close Browser Tab
Close the browser tab directly or refresh the page

**Expected Result**:
- CLI session remains running
- Session still exists when checking with `always list`

### Step 9: Reconnect to Session
1. Reopen browser and navigate to `<YOUR_WEB_URL>`
2. Find the previous session in the session list
3. Click to connect

**Expected Result**:
- Successfully reconnected to the same session
- Previous conversation history visible (depending on terminal buffer)

### Step 10: Continue Conversation
Enter another prompt in the reconnected session

**Expected Result**: Claude responds normally, session fully functional

### Step 11: Stop Session
```bash
always stop --all
```
**Expected Result**: All daemon sessions stopped

### Step 12: Delete Test User
Delete the Cognito test user via AWS Console or CLI:
```bash
aws cognito-idp admin-delete-user \
  --user-pool-id <YOUR_USER_POOL_ID> \
  --username <TEST_USERNAME>
```
**Expected Result**: Test user deleted from Cognito User Pool

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
| Step 12 |  |  |

## Related PRs
- #28: feat: add InputFilter to prevent web clients from terminating CLI sessions
- #30: fix: read CLI version from package.json instead of hardcoding
