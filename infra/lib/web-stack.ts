import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import * as path from 'path';
import * as fs from 'fs';

export interface WebStackProps extends cdk.StackProps {
  stageName: string;
  wsEndpoint: string;
  userPoolId: string;
  userPoolClientId: string;
  // Auth configuration for Lambda@Edge (moved from AuthStack to avoid cross-stack export issues)
  cognitoRegion?: string;
  cognitoDomain?: string;
  enableAuth?: boolean;
}

export class WebStack extends cdk.Stack {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);

    const { stageName, enableAuth = true, cognitoRegion, cognitoDomain } = props;

    // ==================== Lambda@Edge Functions (inline to avoid cross-stack export issues) ====================
    let authEdgeFunction: cloudfront.experimental.EdgeFunction | undefined;
    let callbackEdgeFunction: cloudfront.experimental.EdgeFunction | undefined;

    if (enableAuth && cognitoRegion && cognitoDomain) {
      const edgeDir = path.join(__dirname, '../../packages/server/dist/edge');

      // Build the auth function code with injected configuration
      const authCode = this.buildEdgeFunctionCode(
        path.join(edgeDir, 'auth.js'),
        {
          __COGNITO_REGION__: cognitoRegion,
          __USER_POOL_ID__: props.userPoolId,
          __CLIENT_ID__: props.userPoolClientId,
          __CLIENT_SECRET__: '',
          __COGNITO_DOMAIN__: cognitoDomain,
        }
      );

      // Build the callback function code with injected configuration
      const callbackCode = this.buildEdgeFunctionCode(
        path.join(edgeDir, 'callback.js'),
        {
          __COGNITO_REGION__: cognitoRegion,
          __USER_POOL_ID__: props.userPoolId,
          __CLIENT_ID__: props.userPoolClientId,
          __CLIENT_SECRET__: '',
          __COGNITO_DOMAIN__: cognitoDomain,
        }
      );

      // Create the auth Lambda@Edge function
      // Note: Using '-v2' suffix to avoid conflict with existing replicated Lambda@Edge functions
      authEdgeFunction = new cloudfront.experimental.EdgeFunction(this, 'AuthEdgeFunction', {
        functionName: `always-coder-${stageName}-auth-edge-v2`,
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline(authCode),
        memorySize: 128,
        timeout: cdk.Duration.seconds(5),
        logRetention: logs.RetentionDays.ONE_WEEK,
        description: 'Lambda@Edge function for Cognito JWT authentication',
      });

      // Create the callback Lambda@Edge function
      // Note: Using '-v2' suffix to avoid conflict with existing replicated Lambda@Edge functions
      callbackEdgeFunction = new cloudfront.experimental.EdgeFunction(this, 'CallbackEdgeFunction', {
        functionName: `always-coder-${stageName}-callback-edge-v2`,
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline(callbackCode),
        memorySize: 128,
        timeout: cdk.Duration.seconds(5),
        logRetention: logs.RetentionDays.ONE_WEEK,
        description: 'Lambda@Edge function for OAuth callback handling',
      });
    }

    // ==================== S3 Bucket for Static Assets ====================
    this.bucket = new s3.Bucket(this, 'WebBucket', {
      bucketName: `always-coder-${stageName}-web-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // ==================== CloudFront Origin Access Identity ====================
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OAI', {
      comment: `OAI for always-coder-${stageName}`,
    });

    this.bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [this.bucket.arnForObjects('*')],
        principals: [
          new iam.CanonicalUserPrincipal(
            originAccessIdentity.cloudFrontOriginAccessIdentityS3CanonicalUserId
          ),
        ],
      })
    );

    // ==================== CloudFront Response Headers Policy ====================
    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        frameOptions: {
          frameOption: cloudfront.HeadersFrameOption.DENY,
          override: true,
        },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.days(365),
          includeSubdomains: true,
          override: true,
        },
        xssProtection: {
          protection: true,
          modeBlock: true,
          override: true,
        },
      },
    });

    // ==================== Lambda@Edge Configuration ====================
    const edgeLambdas: cloudfront.EdgeLambda[] = [];

    if (authEdgeFunction) {
      edgeLambdas.push({
        functionVersion: authEdgeFunction.currentVersion,
        eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
      });
    }

    // ==================== CloudFront Distribution ====================
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `Always Coder ${stageName} Web Distribution`,
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: new origins.S3Origin(this.bucket, {
          originAccessIdentity,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        compress: true,
        edgeLambdas: edgeLambdas.length > 0 ? edgeLambdas : undefined,
      },
      // Additional behavior for auth callback
      additionalBehaviors: callbackEdgeFunction
        ? {
            '/auth/callback': {
              origin: new origins.S3Origin(this.bucket, {
                originAccessIdentity,
              }),
              viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
              cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
              allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
              edgeLambdas: [
                {
                  functionVersion: callbackEdgeFunction.currentVersion,
                  eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
                },
              ],
            },
          }
        : undefined,
      // Handle SPA routing - return index.html for 404s
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
    });

    // ==================== Outputs ====================
    new cdk.CfnOutput(this, 'WebBucketName', {
      value: this.bucket.bucketName,
      description: 'S3 bucket for web assets',
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront distribution ID',
    });

    new cdk.CfnOutput(this, 'WebUrl', {
      value: `https://${this.distribution.distributionDomainName}`,
      description: 'Web application URL',
      exportName: `always-coder-${stageName}-web-url`,
    });

    // ==================== Update Cognito Client with CloudFront URL ====================
    // Use a custom resource to add CloudFront callback URL to Cognito client
    // This avoids circular dependency between ApiStack and WebStack
    const updateCognitoClient = new cr.AwsCustomResource(this, 'UpdateCognitoClient', {
      onCreate: {
        service: 'CognitoIdentityServiceProvider',
        action: 'updateUserPoolClient',
        parameters: {
          UserPoolId: props.userPoolId,
          ClientId: props.userPoolClientId,
          // Preserve auth flows set in ApiStack - required for CLI and Web login
          ExplicitAuthFlows: [
            'ALLOW_USER_SRP_AUTH',
            'ALLOW_USER_PASSWORD_AUTH',
            'ALLOW_REFRESH_TOKEN_AUTH',
          ],
          CallbackURLs: [
            'http://localhost:3000/api/auth/callback/cognito',
            'http://localhost:3000/auth/callback',
            `https://${this.distribution.distributionDomainName}/auth/callback`,
          ],
          LogoutURLs: [
            'http://localhost:3000',
            `https://${this.distribution.distributionDomainName}`,
          ],
          AllowedOAuthFlows: ['code'],
          AllowedOAuthScopes: ['email', 'openid', 'profile'],
          AllowedOAuthFlowsUserPoolClient: true,
          SupportedIdentityProviders: ['COGNITO'],
        },
        physicalResourceId: cr.PhysicalResourceId.of(`${props.userPoolClientId}-callback-urls`),
      },
      onUpdate: {
        service: 'CognitoIdentityServiceProvider',
        action: 'updateUserPoolClient',
        parameters: {
          UserPoolId: props.userPoolId,
          ClientId: props.userPoolClientId,
          // Preserve auth flows set in ApiStack - required for CLI and Web login
          ExplicitAuthFlows: [
            'ALLOW_USER_SRP_AUTH',
            'ALLOW_USER_PASSWORD_AUTH',
            'ALLOW_REFRESH_TOKEN_AUTH',
          ],
          CallbackURLs: [
            'http://localhost:3000/api/auth/callback/cognito',
            'http://localhost:3000/auth/callback',
            `https://${this.distribution.distributionDomainName}/auth/callback`,
          ],
          LogoutURLs: [
            'http://localhost:3000',
            `https://${this.distribution.distributionDomainName}`,
          ],
          AllowedOAuthFlows: ['code'],
          AllowedOAuthScopes: ['email', 'openid', 'profile'],
          AllowedOAuthFlowsUserPoolClient: true,
          SupportedIdentityProviders: ['COGNITO'],
        },
        physicalResourceId: cr.PhysicalResourceId.of(`${props.userPoolClientId}-callback-urls`),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['cognito-idp:UpdateUserPoolClient'],
          resources: [
            `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/${props.userPoolId}`,
          ],
        }),
      ]),
      installLatestAwsSdk: false,
    });

    // Output for verification
    new cdk.CfnOutput(this, 'CognitoCallbackUrl', {
      value: `https://${this.distribution.distributionDomainName}/auth/callback`,
      description: 'Cognito OAuth callback URL',
    });

    // Lambda@Edge outputs
    if (authEdgeFunction) {
      new cdk.CfnOutput(this, 'AuthEdgeFunctionArn', {
        value: authEdgeFunction.functionArn,
        description: 'Auth Lambda@Edge function ARN',
      });
    }

    if (callbackEdgeFunction) {
      new cdk.CfnOutput(this, 'CallbackEdgeFunctionArn', {
        value: callbackEdgeFunction.functionArn,
        description: 'Callback Lambda@Edge function ARN',
      });
    }
  }

  /**
   * Build edge function code by reading the compiled JS and injecting configuration
   * Lambda@Edge doesn't support environment variables, so we inject config at build time
   */
  private buildEdgeFunctionCode(
    filePath: string,
    replacements: Record<string, string>
  ): string {
    // Check if the compiled file exists
    if (!fs.existsSync(filePath)) {
      // Return a placeholder that will fail at runtime with a helpful message
      // This allows cdk synth to work even before building
      console.warn(`Warning: ${filePath} not found. Run 'pnpm build' in packages/server first.`);
      return `
exports.handler = async (event) => {
  console.error('Edge function code not built. Run pnpm build in packages/server.');
  return {
    status: '500',
    statusDescription: 'Internal Server Error',
    body: 'Edge function not built properly',
  };
};
      `.trim();
    }

    let code = fs.readFileSync(filePath, 'utf-8');

    // Replace configuration placeholders
    for (const [key, value] of Object.entries(replacements)) {
      code = code.replace(new RegExp(key, 'g'), value);
    }

    // Wrap the code to export as CommonJS (Lambda@Edge requirement)
    // The compiled code uses ESM exports, we need to adapt it
    return `
// Lambda@Edge function with injected configuration
${code}
    `.trim();
  }
}
