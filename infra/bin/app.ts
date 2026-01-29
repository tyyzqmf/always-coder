#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AlwaysCoderInfrastructure } from '../lib/main-stack';

const app = new cdk.App();

// Get stage name from context or default to 'dev'
const stageName = app.node.tryGetContext('stage') || 'dev';

// Get AWS account and region from environment or context
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT || app.node.tryGetContext('account'),
  region: process.env.CDK_DEFAULT_REGION || app.node.tryGetContext('region') || 'us-east-1',
};

// Create the infrastructure
new AlwaysCoderInfrastructure(app, `AlwaysCoder-${stageName}`, {
  stageName,
  env,
});

// Add tags to all resources
cdk.Tags.of(app).add('Project', 'AlwaysCoder');
cdk.Tags.of(app).add('Stage', stageName);
cdk.Tags.of(app).add('ManagedBy', 'CDK');
