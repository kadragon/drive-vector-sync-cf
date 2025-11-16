/**
 * OpenAI client factory with Cloudflare AI Gateway support
 *
 * Provides centralized OpenAI client initialization that routes all API calls
 * through Cloudflare's AI Gateway for improved caching, rate limiting, and analytics.
 *
 * Trace:
 *   spec_id: SPEC-embedding-pipeline-1
 *   task_id: TASK-034
 */

import OpenAI from 'openai';

export interface OpenAIFactoryConfig {
  apiKey: string;
  /**
   * Cloudflare account ID for AI Gateway
   * Required when using AI Gateway
   */
  cfAccountId?: string;
  /**
   * AI Gateway name (configured in Cloudflare dashboard)
   * Required when using AI Gateway
   */
  cfGatewayName?: string;
  /**
   * AI Gateway authentication token
   * Optional: Only required if authentication is enabled on the gateway
   * Format: Bearer token (the 'Bearer ' prefix is added automatically)
   */
  cfGatewayToken?: string;
}

/**
 * Build the AI Gateway base URL
 * Format: https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_name}/openai
 */
function buildAIGatewayURL(accountId: string, gatewayName: string): string {
  return `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayName}/openai`;
}

/**
 * Create an OpenAI client with optional Cloudflare AI Gateway routing
 *
 * If both cfAccountId and cfGatewayName are provided, routes all API calls
 * through Cloudflare AI Gateway. Otherwise, uses OpenAI API directly.
 *
 * @param config - Factory configuration
 * @returns Configured OpenAI client instance
 *
 * @example
 * // Direct OpenAI API
 * const client = createOpenAIClient({ apiKey: 'sk-...' });
 *
 * @example
 * // Through Cloudflare AI Gateway (no authentication)
 * const client = createOpenAIClient({
 *   apiKey: 'sk-...',
 *   cfAccountId: '6ed03d41ee9287a3e0e5bde9a6772812',
 *   cfGatewayName: 'worknote-ai-gateway'
 * });
 *
 * @example
 * // Through Cloudflare AI Gateway (with authentication)
 * const client = createOpenAIClient({
 *   apiKey: 'sk-...',
 *   cfAccountId: '6ed03d41ee9287a3e0e5bde9a6772812',
 *   cfGatewayName: 'worknote-ai-gateway',
 *   cfGatewayToken: 'your-gateway-token'
 * });
 */
export function createOpenAIClient(config: OpenAIFactoryConfig): OpenAI {
  const { apiKey, cfAccountId, cfGatewayName, cfGatewayToken } = config;

  // If both AI Gateway parameters are provided, route through gateway
  if (cfAccountId && cfGatewayName) {
    const baseURL = buildAIGatewayURL(cfAccountId, cfGatewayName);
    console.log(`Using Cloudflare AI Gateway: ${baseURL}`);

    // Build client config with optional authentication
    const clientConfig: ConstructorParameters<typeof OpenAI>[0] = {
      apiKey,
      baseURL,
    };

    // Add authentication header if token is provided
    if (cfGatewayToken) {
      clientConfig.defaultHeaders = {
        'cf-aig-authorization': `Bearer ${cfGatewayToken}`,
      };
      console.log('AI Gateway authentication enabled');
    }

    return new OpenAI(clientConfig);
  }

  // Otherwise, use OpenAI API directly
  console.log('Using OpenAI API directly (no AI Gateway configured)');
  return new OpenAI({
    apiKey,
  });
}
