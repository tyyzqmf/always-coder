# Always Coder - Deployment Guide

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [AWS Account Setup](#aws-account-setup)
3. [Local Environment Setup](#local-environment-setup)
4. [Infrastructure Deployment](#infrastructure-deployment)
5. [Web Application Deployment](#web-application-deployment)
6. [CLI Installation](#cli-installation)
7. [Configuration](#configuration)
8. [Verification](#verification)
9. [Maintenance](#maintenance)
10. [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Tools

| Tool | Version | Installation |
|------|---------|--------------|
| **Node.js** | 20+ | [nodejs.org](https://nodejs.org/) |
| **pnpm** | 8.14+ | `npm install -g pnpm` |
| **AWS CLI** | 2.x | [AWS CLI Install](https://aws.amazon.com/cli/) |
| **AWS CDK** | 2.124+ | `npm install -g aws-cdk` |
| **Git** | 2.x | [git-scm.com](https://git-scm.com/) |

### AWS Account Requirements

- Active AWS account
- IAM user with programmatic access
- Sufficient permissions (see [IAM Permissions](#iam-permissions))

### Estimated Costs

| Service | Free Tier | Light Usage | Heavy Usage |
|---------|-----------|-------------|-------------|
| API Gateway | 1M requests/month | $0.25-1/month | $10-50/month |
| Lambda | 1M requests/month | $0-1/month | $5-20/month |
| DynamoDB | 25GB storage | $0-5/month | $10-50/month |
| CloudFront | 50GB transfer | $0-1/month | $5-20/month |
| S3 | 5GB storage | $0.01-0.10/month | $1-5/month |
| Cognito | 50K MAU free | $0/month | $0-50/month |
| **Total** | | **~$1-10/month** | **~$30-200/month** |

## AWS Account Setup

### 1. Create IAM User

```bash
# Create user with programmatic access
aws iam create-user --user-name always-coder-deploy

# Attach administrator policy (for testing)
aws iam attach-user-policy \
  --user-name always-coder-deploy \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess

# Create access key
aws iam create-access-key --user-name always-coder-deploy
```

### 2. Configure AWS CLI

```bash
# Configure credentials
aws configure --profile always-coder

# Enter:
# - AWS Access Key ID: [from previous step]
# - AWS Secret Access Key: [from previous step]
# - Default region: us-east-1 (or your preferred region)
# - Default output format: json

# Verify configuration
aws sts get-caller-identity --profile always-coder
```

### IAM Permissions

For production, create a custom policy with minimum required permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "apigateway:*",
        "lambda:*",
        "dynamodb:*",
        "s3:*",
        "cloudfront:*",
        "cognito-idp:*",
        "iam:*",
        "cloudformation:*",
        "logs:*",
        "cloudwatch:*"
      ],
      "Resource": "*"
    }
  ]
}
```

## Local Environment Setup

### 1. Clone Repository

```bash
# Clone the repository
git clone https://github.com/tyyzqmf/always-coder.git
cd always-coder

# Checkout specific version (optional)
git checkout v1.0.0
```

### 2. Install Dependencies

```bash
# Install all dependencies
pnpm install

# Build all packages
pnpm build

# Run tests to verify
pnpm test
```

### 3. Environment Variables

Create `.env` file in the root:

```bash
# AWS Configuration
AWS_PROFILE=always-coder
CDK_DEFAULT_ACCOUNT=123456789012
CDK_DEFAULT_REGION=us-east-1

# Optional: Cognito Configuration
COGNITO_DOMAIN_PREFIX=always-coder-auth
```

## Infrastructure Deployment

### 1. CDK Bootstrap

First-time setup for CDK in your AWS account:

```bash
cd infra

# Bootstrap CDK (one-time per account/region)
pnpm cdk bootstrap

# Or with specific account/region
pnpm cdk bootstrap aws://123456789012/us-east-1
```

### 2. Deploy Stacks

```bash
# Preview changes
pnpm cdk diff

# Deploy all stacks
pnpm cdk deploy --all

# Or deploy individually
pnpm cdk deploy AlwaysCoderApiStack
pnpm cdk deploy AlwaysCoderWebStack
```

### 3. Stack Outputs

After successful deployment, note these outputs:

```
Outputs:
AlwaysCoderApiStack.WebSocketUrl = wss://abc123xyz.execute-api.us-east-1.amazonaws.com/prod
AlwaysCoderApiStack.UserPoolId = us-east-1_XXXXXXXXX
AlwaysCoderApiStack.UserPoolClientId = 1abc2def3ghi4jkl5mno6pqr
AlwaysCoderApiStack.ConnectionsTableName = AlwaysCoderApiStack-ConnectionsXXX
AlwaysCoderApiStack.SessionsTableName = AlwaysCoderApiStack-SessionsXXX

AlwaysCoderWebStack.WebUrl = https://d1234567890abc.cloudfront.net
AlwaysCoderWebStack.WebBucketName = alwayscoderwebstack-webbucketXXX
AlwaysCoderWebStack.DistributionId = E1234567890ABC
```

Save these values - you'll need them for configuration.

## Web Application Deployment

### 1. Build Web Application

```bash
# From repository root
cd packages/web

# Create production build
pnpm build

# Output will be in 'out' directory
ls -la out/
```

### 2. Deploy to S3

```bash
# Get bucket name from CDK outputs
BUCKET_NAME="alwayscoderwebstack-webbucketXXX"

# Sync files to S3
aws s3 sync out/ s3://$BUCKET_NAME \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "*.html" \
  --profile always-coder

# Upload HTML files with different cache settings
aws s3 sync out/ s3://$BUCKET_NAME \
  --exclude "*" \
  --include "*.html" \
  --cache-control "public, max-age=0, must-revalidate" \
  --profile always-coder
```

### 3. Invalidate CloudFront Cache

```bash
# Get distribution ID from CDK outputs
DISTRIBUTION_ID="E1234567890ABC"

# Create invalidation
aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/*" \
  --profile always-coder

# Check invalidation status
aws cloudfront get-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --id <InvalidationId> \
  --profile always-coder
```

## CLI Installation

### Option 1: Install Script (Recommended)

```bash
# From repository root
./install.sh <WebSocketUrl> <WebUrl>

# Example:
./install.sh \
  wss://abc123xyz.execute-api.us-east-1.amazonaws.com/prod \
  https://d1234567890abc.cloudfront.net

# Reload shell
source ~/.bashrc
```

### Option 2: Manual Installation

```bash
# Build CLI
cd packages/cli
pnpm build

# Create local bin directory
mkdir -p ~/.local/bin

# Copy built files
cp -r dist ~/.local/share/always-coder
chmod +x ~/.local/share/always-coder/index.js

# Create symlink
ln -sf ~/.local/share/always-coder/index.js ~/.local/bin/always

# Add to PATH (add to ~/.bashrc)
export PATH="$HOME/.local/bin:$PATH"

# Initialize configuration
always init \
  wss://abc123xyz.execute-api.us-east-1.amazonaws.com/prod \
  https://d1234567890abc.cloudfront.net
```

### Option 3: Global NPM Installation

```bash
# From packages/cli directory
cd packages/cli
npm link

# Or publish to npm registry
npm publish --access public

# Then install globally
npm install -g @always-coder/cli
```

## Configuration

### 1. CLI Configuration

```bash
# View current configuration
always config list

# Set individual values
always config set server wss://your-api.execute-api.region.amazonaws.com/prod
always config set web https://your-distribution.cloudfront.net

# Set Cognito configuration (if using authentication)
always config set cognitoUserPoolId us-east-1_XXXXXXXXX
always config set cognitoClientId 1abc2def3ghi4jkl5mno6pqr
always config set cognitoRegion us-east-1
```

### 2. Environment Variables

Alternatively, use environment variables:

```bash
# Add to ~/.bashrc or ~/.zshrc
export ALWAYS_CODER_SERVER="wss://your-api.execute-api.region.amazonaws.com/prod"
export ALWAYS_CODER_WEB_URL="https://your-distribution.cloudfront.net"
export ALWAYS_CODER_COGNITO_USER_POOL_ID="us-east-1_XXXXXXXXX"
export ALWAYS_CODER_COGNITO_CLIENT_ID="1abc2def3ghi4jkl5mno6pqr"
```

### 3. Configuration File

Configuration is stored in `~/.always-coder/config.json`:

```json
{
  "server": "wss://your-api.execute-api.region.amazonaws.com/prod",
  "web": "https://your-distribution.cloudfront.net",
  "cognitoUserPoolId": "us-east-1_XXXXXXXXX",
  "cognitoClientId": "1abc2def3ghi4jkl5mno6pqr",
  "cognitoRegion": "us-east-1",
  "userId": "user-uuid",
  "authToken": "jwt-token",
  "refreshToken": "refresh-token"
}
```

## Verification

### 1. Test WebSocket Connection

```bash
# Test WebSocket endpoint
wscat -c wss://your-api.execute-api.region.amazonaws.com/prod

# Send test message
{"type":"ping"}

# You should receive a pong response
```

### 2. Test Web Application

```bash
# Open in browser
open https://your-distribution.cloudfront.net

# Or use curl
curl -I https://your-distribution.cloudfront.net
```

### 3. Test CLI

```bash
# Start a test session
always claude

# You should see:
# - QR code displayed
# - Session ID
# - Web URL

# Scan QR code or visit URL
# Terminal should connect
```

### 4. Test Authentication (if enabled)

```bash
# Login
always login

# Enter credentials
# Should see "Login successful"

# Verify
always whoami
```

## Maintenance

### Updating the Application

```bash
# Pull latest changes
git pull origin main

# Rebuild
pnpm install
pnpm build

# Redeploy infrastructure
cd infra
pnpm cdk deploy --all

# Update web application
cd ../packages/web
pnpm build
aws s3 sync out/ s3://$BUCKET_NAME --delete

# Invalidate CloudFront
aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/*"
```

### Monitoring

```bash
# View Lambda logs
aws logs tail /aws/lambda/AlwaysCoderApiStack-MessageHandler \
  --follow \
  --profile always-coder

# View API Gateway metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApiGateway \
  --metric-name Count \
  --dimensions Name=ApiName,Value=AlwaysCoderWebSocket \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-02T00:00:00Z \
  --period 3600 \
  --statistics Sum \
  --profile always-coder

# View DynamoDB metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ConsumedReadCapacityUnits \
  --dimensions Name=TableName,Value=AlwaysCoderApiStack-Sessions \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-02T00:00:00Z \
  --period 3600 \
  --statistics Sum \
  --profile always-coder
```

### Backup

```bash
# Backup DynamoDB tables
aws dynamodb create-backup \
  --table-name AlwaysCoderApiStack-Sessions \
  --backup-name sessions-backup-$(date +%Y%m%d) \
  --profile always-coder

# List backups
aws dynamodb list-backups \
  --table-name AlwaysCoderApiStack-Sessions \
  --profile always-coder
```

## Troubleshooting

### CDK Deployment Issues

**"Stack is in UPDATE_ROLLBACK_FAILED state"**
```bash
# Delete the stack and redeploy
pnpm cdk destroy AlwaysCoderApiStack
pnpm cdk deploy AlwaysCoderApiStack
```

**"Resource already exists"**
```bash
# Use different stack names
pnpm cdk deploy --all --context stackPrefix=prod
```

**"Bootstrap stack version mismatch"**
```bash
# Re-bootstrap with latest version
pnpm cdk bootstrap --force
```

### WebSocket Connection Issues

**"Connection refused"**
- Verify WebSocket URL is correct
- Check API Gateway is deployed
- Ensure Lambda functions are not throttled

**"403 Forbidden"**
- Check Cognito authentication if enabled
- Verify CORS settings
- Check API Gateway authorizer

### Lambda Function Issues

**"Task timed out"**
- Increase timeout in CDK stack (default 30s)
- Check Lambda memory allocation
- Review CloudWatch logs for bottlenecks

**"Out of memory"**
- Increase Lambda memory in CDK stack
- Default is 256MB, try 512MB or 1024MB

### DynamoDB Issues

**"Throughput exceeded"**
- Tables use on-demand billing by default
- Check for hot partition keys
- Consider enabling auto-scaling

### CloudFront Issues

**"Access Denied"**
- Check S3 bucket policy
- Verify Origin Access Identity
- Check Lambda@Edge function logs

**"Content not updating"**
- Create CloudFront invalidation
- Check cache headers
- Verify S3 sync completed

### CLI Issues

**"Command not found: always"**
- Add ~/.local/bin to PATH
- Reload shell: `source ~/.bashrc`
- Verify installation: `ls -la ~/.local/bin/always`

**"WebSocket connection failed"**
- Check server URL: `always config get server`
- Verify network connectivity
- Check firewall/proxy settings

## Security Hardening

### 1. Enable WAF

```bash
# Create WAF web ACL
aws wafv2 create-web-acl \
  --name AlwaysCoderWAF \
  --scope CLOUDFRONT \
  --default-action Allow={} \
  --rules file://waf-rules.json \
  --region us-east-1 \
  --profile always-coder
```

### 2. Enable API Gateway Throttling

```bash
# Set throttle limits
aws apigateway update-stage \
  --rest-api-id <api-id> \
  --stage-name prod \
  --patch-operations \
    op=replace,path=/throttle/rateLimit,value=100 \
    op=replace,path=/throttle/burstLimit,value=200 \
  --profile always-coder
```

### 3. Enable CloudTrail

```bash
# Create trail for audit logging
aws cloudtrail create-trail \
  --name always-coder-trail \
  --s3-bucket-name always-coder-logs \
  --profile always-coder
```

### 4. Set Up Alarms

```bash
# High error rate alarm
aws cloudwatch put-metric-alarm \
  --alarm-name always-coder-high-errors \
  --alarm-description "Alert on high error rate" \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --profile always-coder
```

## Cleanup

To remove all deployed resources:

```bash
# Destroy CDK stacks
cd infra
pnpm cdk destroy --all

# Remove S3 buckets (if not deleted by CDK)
aws s3 rb s3://bucket-name --force

# Delete CloudWatch logs
aws logs delete-log-group \
  --log-group-name /aws/lambda/function-name

# Remove local CLI
rm -rf ~/.local/bin/always
rm -rf ~/.local/share/always-coder
rm -rf ~/.always-coder
```

## Next Steps

- [Configure authentication](SECURITY.md#authentication)
- [Set up monitoring](ARCHITECTURE.md#monitoring--observability)
- [Review security best practices](SECURITY.md)
- [Start development](DEVELOPMENT.md)