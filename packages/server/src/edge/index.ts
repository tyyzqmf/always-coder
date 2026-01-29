/**
 * Lambda@Edge functions for CloudFront authentication
 *
 * These functions are deployed to CloudFront edge locations and handle:
 * - JWT authentication validation
 * - OAuth callback processing
 *
 * Note: Lambda@Edge has specific constraints:
 * - No environment variables (config is injected at build time)
 * - Must be deployed in us-east-1
 * - Limited execution time (5s for viewer request)
 * - Limited package size (1MB for viewer request)
 */

export { handler as authHandler } from './auth.js';
export { handler as callbackHandler } from './callback.js';
