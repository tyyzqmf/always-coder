import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface DatabaseStackProps extends cdk.StackProps {
  stageName: string;
}

export class DatabaseStack extends cdk.Stack {
  public readonly connectionsTable: dynamodb.Table;
  public readonly sessionsTable: dynamodb.Table;
  public readonly messagesTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    const { stageName } = props;

    // Connections table - stores WebSocket connection info
    this.connectionsTable = new dynamodb.Table(this, 'ConnectionsTable', {
      tableName: `always-coder-${stageName}-connections`,
      partitionKey: {
        name: 'connectionId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For dev/test. Change to RETAIN for prod
      pointInTimeRecovery: true,
    });

    // GSI for querying connections by session
    this.connectionsTable.addGlobalSecondaryIndex({
      indexName: 'sessionId-index',
      partitionKey: {
        name: 'sessionId',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Sessions table - stores session info
    this.sessionsTable = new dynamodb.Table(this, 'SessionsTable', {
      tableName: `always-coder-${stageName}-sessions`,
      partitionKey: {
        name: 'sessionId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
    });

    // GSI for querying sessions by user (for authenticated sessions)
    this.sessionsTable.addGlobalSecondaryIndex({
      indexName: 'userId-index',
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.NUMBER,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Messages table - caches recent terminal output for late-joining clients
    this.messagesTable = new dynamodb.Table(this, 'MessagesTable', {
      tableName: `always-coder-${stageName}-messages`,
      partitionKey: {
        name: 'sessionId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'seq',
        type: dynamodb.AttributeType.NUMBER,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Outputs
    new cdk.CfnOutput(this, 'ConnectionsTableName', {
      value: this.connectionsTable.tableName,
      description: 'Connections table name',
    });

    new cdk.CfnOutput(this, 'SessionsTableName', {
      value: this.sessionsTable.tableName,
      description: 'Sessions table name',
    });

    new cdk.CfnOutput(this, 'MessagesTableName', {
      value: this.messagesTable.tableName,
      description: 'Messages table name',
    });
  }
}
