/**
 * Instance identification utilities
 *
 * Provides functions to identify the current machine/instance,
 * supporting EC2 instances (via metadata service) and falling back
 * to hostname for non-EC2 environments.
 */

import { hostname } from 'os';
import { loadConfig } from '../config/index.js';

/**
 * Instance information
 */
export interface InstanceInfo {
  instanceId: string;
  hostname: string;
  label?: string;
}

/**
 * EC2 Instance Metadata Service (IMDS) endpoints
 */
const EC2_METADATA_TOKEN_URL = 'http://169.254.169.254/latest/api/token';
const EC2_METADATA_INSTANCE_ID_URL = 'http://169.254.169.254/latest/meta-data/instance-id';

/**
 * Fetch a URL with timeout
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 1000
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Get EC2 instance ID using IMDSv2
 *
 * @returns EC2 instance ID or null if not on EC2
 */
async function getEC2InstanceId(): Promise<string | null> {
  try {
    // Get IMDSv2 token
    const tokenResponse = await fetchWithTimeout(
      EC2_METADATA_TOKEN_URL,
      {
        method: 'PUT',
        headers: {
          'X-aws-ec2-metadata-token-ttl-seconds': '21600',
        },
      },
      1000
    );

    if (!tokenResponse.ok) {
      return null;
    }

    const token = await tokenResponse.text();

    // Get instance ID using the token
    const instanceIdResponse = await fetchWithTimeout(
      EC2_METADATA_INSTANCE_ID_URL,
      {
        headers: {
          'X-aws-ec2-metadata-token': token,
        },
      },
      1000
    );

    if (!instanceIdResponse.ok) {
      return null;
    }

    return await instanceIdResponse.text();
  } catch {
    // Not on EC2 or metadata service unavailable
    return null;
  }
}

/**
 * Get current instance information
 *
 * Tries to get EC2 instance ID first, falls back to hostname
 */
export async function getInstanceInfo(): Promise<InstanceInfo> {
  const config = loadConfig();
  const hostnameStr = hostname();

  // Try to get EC2 instance ID
  const ec2InstanceId = await getEC2InstanceId();

  return {
    instanceId: ec2InstanceId || hostnameStr,
    hostname: hostnameStr,
    label: config.instanceLabel,
  };
}

/**
 * Get instance display name
 *
 * Returns the label if set, otherwise returns hostname or instance ID
 */
export function getInstanceDisplayName(info: InstanceInfo): string {
  if (info.label) {
    return info.label;
  }

  // If we have an EC2 instance ID, show it with hostname
  if (info.instanceId !== info.hostname) {
    return `${info.hostname} (${info.instanceId})`;
  }

  return info.hostname;
}
