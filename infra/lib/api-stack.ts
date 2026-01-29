import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'path';

export interface ApiStackProps extends cdk.StackProps {
  stageName: string;
  connectionsTable: dynamodb.Table;
  sessionsTable: dynamodb.Table;
  messagesTable: dynamodb.Table;
}

export class ApiStack extends cdk.Stack {
  public readonly webSocketApi: apigatewayv2.WebSocketApi;
  public readonly webSocketStage: apigatewayv2.WebSocketStage;
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly userPoolDomain: cognito.UserPoolDomain;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { stageName, connectionsTable, sessionsTable, messagesTable } = props;

    // ==================== Cognito User Pool ====================
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `always-coder-${stageName}-users`,
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Add Cognito Hosted UI Domain
    this.userPoolDomain = this.userPool.addDomain('CognitoDomain', {
      cognitoDomain: {
        domainPrefix: `always-coder-${stageName}-${this.account}`,
      },
    });

    this.userPoolClient = this.userPool.addClient('WebClient', {
      userPoolClientName: `always-coder-${stageName}-web`,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false, // Lambda@Edge doesn't support secrets well
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [
          'http://localhost:3000/api/auth/callback/cognito',
          'http://localhost:3000/auth/callback',
        ],
        logoutUrls: [
          'http://localhost:3000',
        ],
      },
      preventUserExistenceErrors: true,
    });

    // ==================== Common Lambda Environment ====================
    const commonEnv = {
      CONNECTIONS_TABLE: connectionsTable.tableName,
      SESSIONS_TABLE: sessionsTable.tableName,
      MESSAGES_TABLE: messagesTable.tableName,
      NODE_OPTIONS: '--enable-source-maps',
    };

    const lambdaDir = path.join(__dirname, '../../packages/server/src/handlers');

    // ==================== Lambda Functions ====================

    // Connect handler
    const connectHandler = new nodejs.NodejsFunction(this, 'ConnectHandler', {
      functionName: `always-coder-${stageName}-connect`,
      entry: path.join(lambdaDir, 'connect.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: commonEnv,
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: [],
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    // Disconnect handler
    const disconnectHandler = new nodejs.NodejsFunction(this, 'DisconnectHandler', {
      functionName: `always-coder-${stageName}-disconnect`,
      entry: path.join(lambdaDir, 'disconnect.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: commonEnv,
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: [],
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    // Message handler
    const messageHandler = new nodejs.NodejsFunction(this, 'MessageHandler', {
      functionName: `always-coder-${stageName}-message`,
      entry: path.join(lambdaDir, 'message.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      environment: commonEnv,
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: [],
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    // ==================== DynamoDB Permissions ====================
    connectionsTable.grantReadWriteData(connectHandler);
    connectionsTable.grantReadWriteData(disconnectHandler);
    connectionsTable.grantReadWriteData(messageHandler);

    sessionsTable.grantReadWriteData(connectHandler);
    sessionsTable.grantReadWriteData(disconnectHandler);
    sessionsTable.grantReadWriteData(messageHandler);

    messagesTable.grantReadWriteData(messageHandler);

    // ==================== WebSocket API ====================
    this.webSocketApi = new apigatewayv2.WebSocketApi(this, 'WebSocketApi', {
      apiName: `always-coder-${stageName}-ws`,
      description: 'Always Coder WebSocket API for real-time terminal communication',
      connectRouteOptions: {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration(
          'ConnectIntegration',
          connectHandler
        ),
      },
      disconnectRouteOptions: {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration(
          'DisconnectIntegration',
          disconnectHandler
        ),
      },
      defaultRouteOptions: {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration(
          'MessageIntegration',
          messageHandler
        ),
      },
    });

    // WebSocket Stage
    this.webSocketStage = new apigatewayv2.WebSocketStage(this, 'WebSocketStage', {
      webSocketApi: this.webSocketApi,
      stageName: 'prod',
      autoDeploy: true,
    });

    // ==================== API Gateway Management Permissions ====================
    // Allow Lambda functions to send messages to WebSocket connections
    const apiGatewayManagementPolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['execute-api:ManageConnections'],
      resources: [
        `arn:aws:execute-api:${this.region}:${this.account}:${this.webSocketApi.apiId}/${this.webSocketStage.stageName}/*`,
      ],
    });

    disconnectHandler.addToRolePolicy(apiGatewayManagementPolicy);
    messageHandler.addToRolePolicy(apiGatewayManagementPolicy);

    // ==================== Outputs ====================
    new cdk.CfnOutput(this, 'WebSocketUrl', {
      value: this.webSocketStage.url,
      description: 'WebSocket API URL',
      exportName: `always-coder-${stageName}-ws-url`,
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: `always-coder-${stageName}-user-pool-id`,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: `always-coder-${stageName}-user-pool-client-id`,
    });

    new cdk.CfnOutput(this, 'UserPoolDomainName', {
      value: this.userPoolDomain.domainName,
      description: 'Cognito User Pool Domain',
      exportName: `always-coder-${stageName}-user-pool-domain`,
    });

    new cdk.CfnOutput(this, 'CognitoHostedUIUrl', {
      value: `https://${this.userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com`,
      description: 'Cognito Hosted UI URL',
    });
  }
}
