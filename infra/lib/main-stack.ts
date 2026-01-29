import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DatabaseStack } from './database-stack';
import { ApiStack } from './api-stack';
import { WebStack } from './web-stack';

export interface MainStackProps extends cdk.StackProps {
  stageName?: string;
}

export class AlwaysCoderInfrastructure extends Construct {
  public readonly databaseStack: DatabaseStack;
  public readonly apiStack: ApiStack;
  public readonly webStack: WebStack;

  constructor(scope: Construct, id: string, props: MainStackProps = {}) {
    super(scope, id);

    const stageName = props.stageName || 'dev';
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

    // Create Web Stack
    this.webStack = new WebStack(scope, `AlwaysCoder-${stageName}-Web`, {
      stageName,
      env,
      description: `Always Coder ${stageName} - Web Hosting (S3 + CloudFront)`,
      wsEndpoint: this.apiStack.webSocketStage.url,
      userPoolId: this.apiStack.userPool.userPoolId,
      userPoolClientId: this.apiStack.userPoolClient.userPoolClientId,
    });

    // Add dependency
    this.webStack.addDependency(this.apiStack);
  }
}
