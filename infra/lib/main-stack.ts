import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DatabaseStack } from './database-stack';
import { ApiStack } from './api-stack';
import { WebStack } from './web-stack';

export interface MainStackProps extends cdk.StackProps {
  stageName?: string;
  enableAuth?: boolean;
}

export class AlwaysCoderInfrastructure extends Construct {
  public readonly databaseStack: DatabaseStack;
  public readonly apiStack: ApiStack;
  public readonly webStack: WebStack;

  constructor(scope: Construct, id: string, props: MainStackProps = {}) {
    super(scope, id);

    const stageName = props.stageName || 'dev';
    const enableAuth = props.enableAuth ?? true;
    const env = props.env;

    // Create Database Stack
    this.databaseStack = new DatabaseStack(scope, `AlwaysCoder-${stageName}-Database`, {
      stageName,
      env,
      description: `Always Coder ${stageName} - DynamoDB Tables`,
    });

    // Create API Stack
    this.apiStack = new ApiStack(scope, `AlwaysCoder-${stageName}-Api`, {
      stageName,
      env,
      description: `Always Coder ${stageName} - WebSocket API and Lambda`,
      connectionsTable: this.databaseStack.connectionsTable,
      sessionsTable: this.databaseStack.sessionsTable,
      messagesTable: this.databaseStack.messagesTable,
    });

    // Add dependency
    this.apiStack.addDependency(this.databaseStack);

    // Create Web Stack (Lambda@Edge is now created inline to avoid cross-stack export issues)
    this.webStack = new WebStack(scope, `AlwaysCoder-${stageName}-Web`, {
      stageName,
      env,
      description: `Always Coder ${stageName} - Web Hosting (S3 + CloudFront + Lambda@Edge)`,
      wsEndpoint: this.apiStack.webSocketStage.url,
      userPoolId: this.apiStack.userPool.userPoolId,
      userPoolClientId: this.apiStack.userPoolClient.userPoolClientId,
      // Auth configuration for Lambda@Edge (now created inline in WebStack)
      enableAuth,
      cognitoRegion: env?.region || 'us-east-1',
      cognitoDomain: `always-coder-${stageName}-${env?.account || 'unknown'}.auth.${env?.region || 'us-east-1'}.amazoncognito.com`,
    });

    // Add dependency
    this.webStack.addDependency(this.apiStack);
  }
}
