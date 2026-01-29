import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as path from 'path';
import * as fs from 'fs';

export interface AuthStackProps extends cdk.StackProps {
  stageName: string;
  cognitoRegion: string;
  userPoolId: string;
  userPoolClientId: string;
  userPoolClientSecret?: string;
  cognitoDomain: string;
}

export class AuthStack extends cdk.Stack {
  public readonly authEdgeFunction: cloudfront.experimental.EdgeFunction;
  public readonly callbackEdgeFunction: cloudfront.experimental.EdgeFunction;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const {
      stageName,
      cognitoRegion,
      userPoolId,
      userPoolClientId,
      userPoolClientSecret,
      cognitoDomain,
    } = props;

    // Lambda@Edge functions must be in us-east-1
    // The EdgeFunction construct handles cross-region deployment automatically

    const edgeDir = path.join(__dirname, '../../packages/server/dist/edge');

    // Build the auth function code with injected configuration
    const authCode = this.buildEdgeFunctionCode(
      path.join(edgeDir, 'auth.js'),
      {
        __COGNITO_REGION__: cognitoRegion,
        __USER_POOL_ID__: userPoolId,
        __CLIENT_ID__: userPoolClientId,
        __CLIENT_SECRET__: userPoolClientSecret || '',
        __COGNITO_DOMAIN__: cognitoDomain,
      }
    );

    // Build the callback function code with injected configuration
    const callbackCode = this.buildEdgeFunctionCode(
      path.join(edgeDir, 'callback.js'),
      {
        __COGNITO_REGION__: cognitoRegion,
        __USER_POOL_ID__: userPoolId,
        __CLIENT_ID__: userPoolClientId,
        __CLIENT_SECRET__: userPoolClientSecret || '',
        __COGNITO_DOMAIN__: cognitoDomain,
      }
    );

    // Create the auth Lambda@Edge function
    this.authEdgeFunction = new cloudfront.experimental.EdgeFunction(this, 'AuthEdgeFunction', {
      functionName: `always-coder-${stageName}-auth-edge`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(authCode),
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),
      logRetention: logs.RetentionDays.ONE_WEEK,
      description: 'Lambda@Edge function for Cognito JWT authentication',
    });

    // Create the callback Lambda@Edge function
    this.callbackEdgeFunction = new cloudfront.experimental.EdgeFunction(this, 'CallbackEdgeFunction', {
      functionName: `always-coder-${stageName}-callback-edge`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(callbackCode),
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),
      logRetention: logs.RetentionDays.ONE_WEEK,
      description: 'Lambda@Edge function for OAuth callback handling',
    });

    // Outputs
    new cdk.CfnOutput(this, 'AuthEdgeFunctionArn', {
      value: this.authEdgeFunction.functionArn,
      description: 'Auth Lambda@Edge function ARN',
    });

    new cdk.CfnOutput(this, 'CallbackEdgeFunctionArn', {
      value: this.callbackEdgeFunction.functionArn,
      description: 'Callback Lambda@Edge function ARN',
    });
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
