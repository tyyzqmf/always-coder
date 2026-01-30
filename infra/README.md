# Always Coder - AWS Infrastructure

This directory contains AWS CDK infrastructure code for deploying the Always Coder backend services.

## AWS Services Overview

| Service | Purpose |
|---------|---------|
| **API Gateway WebSocket** | Real-time bidirectional communication between CLI and Web clients |
| **Lambda Functions** | Handle WebSocket events ($connect, $disconnect, $default) and message routing |
| **DynamoDB** | Store connection state, sessions, and encrypted message cache |
| **CloudFront** | CDN for static web hosting |
| **S3** | Static web assets storage |
| **Cognito** | Optional user authentication |
| **Lambda@Edge** | CloudFront authentication with Cognito |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      AWS Cloud                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  CloudFront (CDN) --> S3 (Static Web)                  │ │
│  │  Lambda@Edge (Auth)                                     │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  API Gateway WebSocket API                              │ │
│  │  wss://xxx.execute-api.region.amazonaws.com/prod        │ │
│  │                                                          │ │
│  │  Routes:                                                 │ │
│  │  ├── $connect    --> Lambda (connect handler)           │ │
│  │  ├── $disconnect --> Lambda (disconnect handler)        │ │
│  │  └── $default    --> Lambda (message handler)           │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  DynamoDB Tables                                        │ │
│  │  ├── connections (GSI: sessionId)                       │ │
│  │  ├── sessions (GSI: userId)                             │ │
│  │  └── messages                                           │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Cognito User Pool (Optional Auth)                      │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

## Prerequisites

### 1. AWS CLI

Install and configure AWS CLI:

```bash
# Install AWS CLI (macOS)
brew install awscli

# Install AWS CLI (Linux)
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configure credentials
aws configure
# Enter: AWS Access Key ID, Secret Access Key, Region (e.g., us-east-1)
```

### 2. AWS CDK CLI

```bash
npm install -g aws-cdk

# Verify installation
cdk --version
```

### 3. Required IAM Permissions

Your AWS credentials need permissions for:
- API Gateway (Full Access)
- Lambda (Full Access)
- DynamoDB (Full Access)
- CloudFront (Full Access)
- S3 (Full Access)
- Cognito (Full Access)
- IAM (Create/Manage Roles)
- CloudFormation (Full Access)

For testing, you can use the `AdministratorAccess` policy. For production, create a custom policy with minimum required permissions.

## Deployment Steps

### Step 1: Install Dependencies

From the repository root:

```bash
pnpm install
```

### Step 2: Bootstrap CDK (First Time Only)

CDK bootstrap creates resources needed for CDK deployments:

```bash
cd infra
pnpm cdk bootstrap

# Or specify account/region explicitly:
pnpm cdk bootstrap aws://123456789012/us-east-1
```

### Step 3: Build All Packages

```bash
# From repository root
cd ..
pnpm build
```

### Step 4: Deploy Infrastructure

```bash
cd infra

# Preview changes
pnpm cdk diff

# Deploy all stacks
pnpm cdk deploy --all

# Or deploy stacks individually:
pnpm cdk deploy AlwaysCoderApiStack
pnpm cdk deploy AlwaysCoderWebStack
```

### Step 5: Note the Outputs

After deployment, CDK will output important values:

```
Outputs:
AlwaysCoderApiStack.WebSocketUrl = wss://abc123xyz.execute-api.us-east-1.amazonaws.com/prod
AlwaysCoderApiStack.UserPoolId = us-east-1_AbCdEfGhI
AlwaysCoderApiStack.UserPoolClientId = 1abc2def3ghi4jkl5mno6pqr
AlwaysCoderWebStack.WebUrl = https://d1234567890abc.cloudfront.net
AlwaysCoderWebStack.WebBucketName = always-coder-web-abc123
```

Save these values - you'll need them for CLI installation.

## Deployment Outputs

| Output | Description | Example |
|--------|-------------|---------|
| `WebSocketUrl` | WebSocket API endpoint | `wss://abc123.execute-api.us-east-1.amazonaws.com/prod` |
| `WebUrl` | Web application URL | `https://d123abc.cloudfront.net` |
| `UserPoolId` | Cognito User Pool ID | `us-east-1_AbCdEfGhI` |
| `UserPoolClientId` | Cognito App Client ID | `1abc2def3ghi4jkl5mno` |
| `WebBucketName` | S3 bucket for web assets | `always-coder-web-abc123` |

## Common Commands

```bash
# List all stacks
pnpm cdk list

# Show diff before deployment
pnpm cdk diff

# Deploy all stacks
pnpm cdk deploy --all

# Deploy specific stack
pnpm cdk deploy AlwaysCoderApiStack

# Destroy all stacks (CAUTION: deletes everything)
pnpm cdk destroy --all

# Synthesize CloudFormation templates
pnpm cdk synth
```

## Troubleshooting

### "CDK bootstrap has not been run"

```bash
cd infra
pnpm cdk bootstrap
```

### "Resource already exists"

The stack may have been partially deployed. Try:
```bash
pnpm cdk deploy --all --force
```

Or delete the existing resources manually and redeploy.

### "Access Denied" Errors

1. Verify AWS credentials are configured:
   ```bash
   aws sts get-caller-identity
   ```

2. Ensure your IAM user/role has required permissions

3. Check if you're in the correct AWS region:
   ```bash
   aws configure get region
   ```

### "Lambda function timeout"

The default timeout is 30 seconds. If operations take longer, update the timeout in `lib/api-stack.ts`.

### "DynamoDB throughput exceeded"

The tables use on-demand billing by default. If you see throttling, check CloudWatch metrics and consider enabling auto-scaling.

### CloudFront Distribution Not Updating

CloudFront distributions can take 15-20 minutes to propagate. To invalidate cache:

```bash
aws cloudfront create-invalidation \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --paths "/*"
```

## Stack Details

### AlwaysCoderApiStack

- WebSocket API Gateway with $connect, $disconnect, $default routes
- Lambda functions for WebSocket handling
- DynamoDB tables for connections, sessions, messages
- Cognito User Pool for authentication

### AlwaysCoderWebStack

- S3 bucket for static web assets
- CloudFront distribution for CDN
- Lambda@Edge for Cognito authentication
- Origin Access Identity for secure S3 access

## Environment Variables

Lambda functions use these environment variables (set automatically by CDK):

| Variable | Description |
|----------|-------------|
| `CONNECTIONS_TABLE` | DynamoDB connections table name |
| `SESSIONS_TABLE` | DynamoDB sessions table name |
| `MESSAGES_TABLE` | DynamoDB messages table name |
| `COGNITO_USER_POOL_ID` | Cognito User Pool ID |

## Cost Estimation

With minimal usage, expect approximately:
- **API Gateway**: $0.25-1.00/month (WebSocket connections)
- **Lambda**: $0.00 (usually within free tier)
- **DynamoDB**: $0.00-5.00/month (on-demand, depends on usage)
- **CloudFront**: $0.00-1.00/month (depends on traffic)
- **S3**: $0.01-0.10/month (static assets)

Total: ~$1-10/month for light usage.

## Security Considerations

1. **IAM Roles**: Lambda functions have minimal required permissions
2. **DynamoDB TTL**: Connections and sessions auto-expire after 24 hours
3. **WebSocket Auth**: Optional Cognito authorizer for authenticated access
4. **CloudFront**: HTTPS-only, no direct S3 access
5. **E2E Encryption**: Server handles only encrypted payloads
