# Always Coder - Troubleshooting Guide

## Quick Diagnostics

Run this diagnostic script to check your setup:

```bash
#!/bin/bash
echo "Always Coder Diagnostics"
echo "========================"
echo "Node.js: $(node --version)"
echo "pnpm: $(pnpm --version 2>/dev/null || echo 'Not installed')"
echo "AWS CLI: $(aws --version 2>/dev/null || echo 'Not installed')"
echo "CDK: $(cdk --version 2>/dev/null || echo 'Not installed')"
echo ""
echo "CLI Installation:"
which always || echo "CLI not found in PATH"
echo ""
echo "Configuration:"
always config list 2>/dev/null || echo "Configuration not accessible"
echo ""
echo "Network:"
ping -c 1 google.com >/dev/null 2>&1 && echo "Internet: OK" || echo "Internet: Failed"
```

## Common Issues and Solutions

### Installation Issues

#### "command not found: pnpm"

**Problem**: pnpm is not installed.

**Solution**:
```bash
npm install -g pnpm
```

#### "command not found: always"

**Problem**: CLI is not in PATH or not installed.

**Solutions**:

1. Add to PATH:
```bash
export PATH="$HOME/.local/bin:$PATH"
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

2. Verify installation:
```bash
ls -la ~/.local/bin/always
# Should show the symlink
```

3. Reinstall:
```bash
curl -fsSL https://raw.githubusercontent.com/tyyzqmf/always-coder/main/install.sh | bash -s -- <server-url> <web-url>
```

#### "Node.js version 20 or higher required"

**Problem**: Old Node.js version.

**Solution**:
```bash
# Using nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
nvm alias default 20
```

#### "Permission denied" during installation

**Problem**: Insufficient permissions.

**Solution**:
```bash
# Fix permissions
chmod +x install.sh
mkdir -p ~/.local/bin
chmod 755 ~/.local/bin

# Or install to different location
PREFIX=/opt/always-coder ./install.sh <server> <web>
```

### Connection Issues

#### "WebSocket connection failed"

**Problem**: Cannot connect to WebSocket server.

**Diagnostics**:
```bash
# Test WebSocket endpoint
wscat -c wss://your-api.execute-api.region.amazonaws.com/prod

# Check configuration
always config get server

# Test with curl
curl -I https://your-api.execute-api.region.amazonaws.com/prod
```

**Solutions**:

1. Verify server URL:
```bash
always config set server wss://correct-url.execute-api.region.amazonaws.com/prod
```

2. Check network/firewall:
```bash
# Test WebSocket connectivity
npx wscat -c wss://echo.websocket.org
```

3. Behind proxy:
```bash
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=http://proxy.company.com:8080
export NO_PROXY=localhost,127.0.0.1
```

#### "403 Forbidden" from API Gateway

**Problem**: Authentication required or incorrect.

**Solutions**:

1. Login if authentication is enabled:
```bash
always login
```

2. Refresh expired token:
```bash
always logout
always login
```

3. Check Cognito configuration:
```bash
always config get cognitoUserPoolId
always config get cognitoClientId
```

#### "Session not found"

**Problem**: Session doesn't exist or has expired.

**Solutions**:

1. List available sessions:
```bash
always sessions
```

2. Create new session:
```bash
always claude
```

3. Sessions expire after 24 hours - this is normal.

#### "Connection timeout"

**Problem**: Network latency or server issues.

**Solutions**:

1. Check AWS service status:
```bash
# Check API Gateway metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApiGateway \
  --metric-name 4XXError \
  --dimensions Name=ApiName,Value=AlwaysCoderWebSocket \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

2. Increase timeout (for development):
```bash
export ALWAYS_CODER_TIMEOUT=60000
```

### Terminal Issues

#### "Error: Unable to start PTY process"

**Problem**: node-pty cannot spawn process.

**Solutions**:

1. Rebuild node-pty:
```bash
cd ~/.local/share/always-coder
npm rebuild node-pty
```

2. Check command exists:
```bash
which claude  # Or your command
```

3. On macOS, grant terminal permissions:
   - System Preferences → Security & Privacy → Privacy → Full Disk Access
   - Add Terminal.app

#### "Terminal output is garbled"

**Problem**: Terminal encoding mismatch.

**Solutions**:

1. Set UTF-8 locale:
```bash
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
```

2. Check terminal emulator settings:
   - Ensure UTF-8 encoding
   - Try different terminal (iTerm2, Windows Terminal)

#### "Resize not working"

**Problem**: Terminal size not syncing.

**Solutions**:

1. Refresh browser window
2. Send manual resize:
   - Press Ctrl+L in web terminal
3. Check browser console for errors

### Authentication Issues

#### "Invalid username or password"

**Problem**: Incorrect Cognito credentials.

**Solutions**:

1. Reset password via AWS Console:
   - Go to Cognito User Pool
   - Select user
   - Reset password

2. Check username format:
   - May require email format
   - Case sensitive

#### "Token expired"

**Problem**: JWT token has expired.

**Solution**:
```bash
# Automatic refresh
always logout
always login

# Or clear all credentials
rm -f ~/.always-coder/config.json
always login
```

#### "MFA code invalid"

**Problem**: Time sync issue with TOTP.

**Solutions**:

1. Sync device time:
```bash
# Linux
sudo ntpdate -s time.nist.gov

# macOS
sudo sntp -sS time.apple.com
```

2. Regenerate MFA device in Cognito console

### Deployment Issues

#### "CDK bootstrap required"

**Problem**: CDK not initialized for account/region.

**Solution**:
```bash
cd infra
pnpm cdk bootstrap aws://ACCOUNT_ID/REGION

# Example:
pnpm cdk bootstrap aws://123456789012/us-east-1
```

#### "Stack is in UPDATE_ROLLBACK_FAILED state"

**Problem**: CloudFormation stack in bad state.

**Solutions**:

1. Continue rollback:
```bash
aws cloudformation continue-update-rollback \
  --stack-name AlwaysCoderApiStack
```

2. Delete and recreate:
```bash
pnpm cdk destroy AlwaysCoderApiStack
pnpm cdk deploy AlwaysCoderApiStack
```

#### "Resource already exists"

**Problem**: Resource name conflict.

**Solutions**:

1. Use different stack names:
```bash
pnpm cdk deploy --all --context stackSuffix=dev
```

2. Delete existing resources manually in AWS Console

#### "Lambda function timeout"

**Problem**: Function exceeding 30s timeout.

**Solutions**:

1. Increase timeout in CDK:
```typescript
// infra/lib/api-stack.ts
const messageHandler = new NodejsFunction(this, 'MessageHandler', {
  timeout: Duration.seconds(60), // Increase from 30
  memorySize: 512, // Increase memory
  // ...
});
```

2. Optimize function code

#### "DynamoDB throttling"

**Problem**: Exceeding provisioned capacity.

**Solutions**:

1. Tables use on-demand by default - check for hot keys:
```bash
aws dynamodb describe-table --table-name AlwaysCoderSessions
```

2. Enable contributor insights:
```bash
aws dynamodb update-contributor-insights \
  --table-name AlwaysCoderSessions \
  --contributor-insights-action ENABLE
```

### Web Application Issues

#### "Page not loading"

**Problem**: CloudFront or S3 issues.

**Diagnostics**:
```bash
# Check CloudFront distribution
aws cloudfront get-distribution --id E1234567890ABC

# Check S3 bucket
aws s3 ls s3://bucket-name/
```

**Solutions**:

1. Invalidate CloudFront cache:
```bash
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths "/*"
```

2. Verify S3 upload:
```bash
aws s3 sync out/ s3://bucket-name/ --delete
```

#### "QR code scanner not working"

**Problem**: Camera permissions or HTTPS required.

**Solutions**:

1. Grant camera permissions in browser
2. Ensure using HTTPS (not HTTP)
3. Try different browser
4. Use manual session ID entry

#### "Terminal not displaying"

**Problem**: xterm.js initialization failure.

**Solutions**:

1. Check browser console for errors
2. Clear browser cache
3. Try incognito/private mode
4. Update browser to latest version

### Performance Issues

#### High latency

**Diagnostics**:
```bash
# Measure WebSocket latency
time echo '{"type":"ping"}' | wscat -c wss://your-api.amazonaws.com/prod

# Check Lambda cold starts
aws logs tail /aws/lambda/AlwaysCoderMessageHandler --follow
```

**Solutions**:

1. Use closer AWS region
2. Enable Lambda provisioned concurrency:
```typescript
const messageHandler = new NodejsFunction(this, 'MessageHandler', {
  provisionedConcurrentExecutions: 1,
  // ...
});
```

3. Optimize message size

#### Memory issues

**Problem**: Lambda running out of memory.

**Solution**:
```typescript
// Increase Lambda memory
const handler = new NodejsFunction(this, 'Handler', {
  memorySize: 1024, // Increase from 256
  // ...
});
```

### Security Issues

#### "Encryption failed"

**Problem**: Key exchange failure.

**Solutions**:

1. Regenerate session:
```bash
always clean
always claude
```

2. Clear browser cache and retry
3. Check for clock skew between CLI and browser

#### "Untrusted certificate"

**Problem**: TLS certificate issues.

**Solutions**:

1. Verify certificate:
```bash
openssl s_client -connect your-api.amazonaws.com:443 -servername your-api.amazonaws.com
```

2. Update system certificates:
```bash
# Ubuntu/Debian
sudo apt-get update && sudo apt-get install ca-certificates

# macOS
brew install ca-certificates
```

## Debug Mode

### Enable Debug Logging

#### CLI Debug Mode

```bash
# Enable all debug output
DEBUG=always-coder:* always claude

# Specific modules
DEBUG=always-coder:websocket always claude
DEBUG=always-coder:crypto always claude
DEBUG=always-coder:session always claude

# Multiple modules
DEBUG=always-coder:websocket,always-coder:crypto always claude
```

#### Browser Debug Mode

```javascript
// In browser console
localStorage.debug = 'always-coder:*';
location.reload();

// Disable debug
delete localStorage.debug;
```

#### Server-side Debugging

```bash
# View Lambda logs
aws logs tail /aws/lambda/AlwaysCoderMessageHandler --follow

# Filter for errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/AlwaysCoderMessageHandler \
  --filter-pattern "ERROR"

# View API Gateway logs
aws logs tail /aws/apigateway/AlwaysCoderWebSocket --follow
```

### Diagnostic Commands

```bash
# System information
always --version
always doctor  # Full diagnostic

# Connection test
always test-connection

# Session information
always sessions --verbose
always session-info <session-id>

# Configuration dump
always config list --json

# Clear all data
always clean --all
rm -rf ~/.always-coder
```

## Log Locations

### CLI Logs

```bash
# Default log location
~/.always-coder/logs/

# Daemon logs
~/.always-coder/daemon/

# View recent logs
tail -f ~/.always-coder/logs/always-coder.log

# Search for errors
grep ERROR ~/.always-coder/logs/*.log
```

### Server Logs

```bash
# CloudWatch log groups
/aws/lambda/AlwaysCoderConnect
/aws/lambda/AlwaysCoderDisconnect
/aws/lambda/AlwaysCoderMessage
/aws/lambda/AlwaysCoderAuthorizer
/aws/lambda/AlwaysCoderEdgeAuth

# Export logs
aws logs create-export-task \
  --log-group-name /aws/lambda/AlwaysCoderMessage \
  --from $(date -d '1 day ago' +%s)000 \
  --to $(date +%s)000 \
  --destination bucket-name \
  --destination-prefix logs/
```

## Getting Help

### Before Asking for Help

1. **Run diagnostics**:
```bash
always doctor > diagnostic.log 2>&1
```

2. **Collect information**:
   - Node.js version: `node --version`
   - OS and version: `uname -a`
   - Error messages (full output)
   - Configuration: `always config list`
   - Recent logs

3. **Try common fixes**:
```bash
# Reinstall
pnpm install
pnpm build

# Clear cache
rm -rf node_modules
rm -rf ~/.always-coder/cache
pnpm install

# Reset configuration
rm ~/.always-coder/config.json
always init <server> <web>
```

### Where to Get Help

1. **GitHub Issues**: [Report bugs](https://github.com/tyyzqmf/always-coder/issues)
2. **Discussions**: [Ask questions](https://github.com/tyyzqmf/always-coder/discussions)
3. **Stack Overflow**: Tag with `always-coder`
4. **Discord**: [Join community](https://discord.gg/always-coder)

### Reporting Bugs

Include this information:

```markdown
## Environment
- OS: [e.g., Ubuntu 22.04]
- Node.js: [e.g., 20.11.0]
- Always Coder: [e.g., 1.0.0]
- Browser: [e.g., Chrome 120]

## Steps to Reproduce
1. Run command: `always claude`
2. Scan QR code
3. Error appears

## Expected Behavior
Terminal should connect

## Actual Behavior
Connection timeout error

## Logs
```
[Paste relevant logs]
```

## Additional Context
[Any other relevant information]
```

## Emergency Recovery

### Complete Reset

```bash
#!/bin/bash
# WARNING: This will delete all Always Coder data

echo "Removing Always Coder installation..."

# Stop all sessions
always clean 2>/dev/null || true

# Remove CLI
rm -rf ~/.local/bin/always
rm -rf ~/.local/share/always-coder

# Remove configuration
rm -rf ~/.always-coder

# Remove from PATH
sed -i '/always-coder/d' ~/.bashrc
sed -i '/always-coder/d' ~/.zshrc

echo "Always Coder removed. Reinstall with:"
echo "curl -fsSL https://raw.githubusercontent.com/tyyzqmf/always-coder/main/install.sh | bash"
```

### AWS Resource Cleanup

```bash
# Delete CDK stacks
cd infra
pnpm cdk destroy --all

# Manual cleanup if needed
aws cloudformation delete-stack --stack-name AlwaysCoderApiStack
aws cloudformation delete-stack --stack-name AlwaysCoderWebStack

# Delete S3 buckets
aws s3 rb s3://bucket-name --force

# Delete log groups
aws logs delete-log-group --log-group-name /aws/lambda/AlwaysCoderMessage
```