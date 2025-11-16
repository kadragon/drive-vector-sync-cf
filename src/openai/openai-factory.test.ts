/**
 * Tests for OpenAI client factory
 *
 * Trace:
 *   spec_id: SPEC-embedding-pipeline-1
 *   task_id: TASK-034
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOpenAIClient } from './openai-factory.js';

// Mock OpenAI class
vi.mock('openai', () => {
  class MockOpenAI {
    public _config: unknown;
    public embeddings: { create: ReturnType<typeof vi.fn> };

    constructor(config: unknown) {
      this._config = config;
      this.embeddings = {
        create: vi.fn(),
      };
    }
  }

  return {
    default: MockOpenAI,
  };
});

describe('OpenAI Factory', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('createOpenAIClient', () => {
    it('should create client with direct OpenAI API when no gateway config provided', () => {
      const client = createOpenAIClient({
        apiKey: 'sk-test-key',
      }) as unknown as { _config: { apiKey: string; baseURL?: string } };

      expect(client).toBeDefined();
      expect(client._config).toEqual({
        apiKey: 'sk-test-key',
      });
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Using OpenAI API directly (no AI Gateway configured)'
      );
    });

    it('should create client with direct OpenAI API when only account ID is provided', () => {
      const client = createOpenAIClient({
        apiKey: 'sk-test-key',
        cfAccountId: '6ed03d41ee9287a3e0e5bde9a6772812',
      }) as unknown as { _config: { apiKey: string; baseURL?: string } };

      expect(client).toBeDefined();
      expect(client._config).toEqual({
        apiKey: 'sk-test-key',
      });
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Using OpenAI API directly (no AI Gateway configured)'
      );
    });

    it('should create client with direct OpenAI API when only gateway name is provided', () => {
      const client = createOpenAIClient({
        apiKey: 'sk-test-key',
        cfGatewayName: 'worknote-ai-gateway',
      }) as unknown as { _config: { apiKey: string; baseURL?: string } };

      expect(client).toBeDefined();
      expect(client._config).toEqual({
        apiKey: 'sk-test-key',
      });
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Using OpenAI API directly (no AI Gateway configured)'
      );
    });

    it('should create client with AI Gateway when both account ID and gateway name are provided', () => {
      const client = createOpenAIClient({
        apiKey: 'sk-test-key',
        cfAccountId: '6ed03d41ee9287a3e0e5bde9a6772812',
        cfGatewayName: 'worknote-ai-gateway',
      }) as unknown as { _config: { apiKey: string; baseURL?: string } };

      expect(client).toBeDefined();
      expect(client._config).toEqual({
        apiKey: 'sk-test-key',
        baseURL:
          'https://gateway.ai.cloudflare.com/v1/6ed03d41ee9287a3e0e5bde9a6772812/worknote-ai-gateway/openai',
      });
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Using Cloudflare AI Gateway')
      );
    });

    it('should build correct AI Gateway URL format', () => {
      const client = createOpenAIClient({
        apiKey: 'sk-test-key',
        cfAccountId: 'test-account-123',
        cfGatewayName: 'my-gateway',
      }) as unknown as { _config: { apiKey: string; baseURL?: string } };

      expect(client._config).toEqual({
        apiKey: 'sk-test-key',
        baseURL: 'https://gateway.ai.cloudflare.com/v1/test-account-123/my-gateway/openai',
      });
    });

    it('should handle special characters in gateway name', () => {
      const client = createOpenAIClient({
        apiKey: 'sk-test-key',
        cfAccountId: 'account-123',
        cfGatewayName: 'my-gateway-v2',
      }) as unknown as { _config: { apiKey: string; baseURL?: string } };

      expect(client._config).toEqual({
        apiKey: 'sk-test-key',
        baseURL: 'https://gateway.ai.cloudflare.com/v1/account-123/my-gateway-v2/openai',
      });
    });

    it('should preserve API key in both modes', () => {
      const apiKey = 'sk-super-secret-key-12345';

      // Direct mode
      const directClient = createOpenAIClient({
        apiKey,
      }) as unknown as { _config: { apiKey: string; baseURL?: string } };
      expect(directClient._config).toEqual({ apiKey });

      // Gateway mode
      const gatewayClient = createOpenAIClient({
        apiKey,
        cfAccountId: 'account',
        cfGatewayName: 'gateway',
      }) as unknown as { _config: { apiKey: string; baseURL?: string } };
      expect(gatewayClient._config.apiKey).toBe(apiKey);
      expect(gatewayClient._config.baseURL).toBeDefined();
    });
  });

  describe('AI Gateway Authentication', () => {
    it('should add cf-aig-authorization header when token is provided', () => {
      const client = createOpenAIClient({
        apiKey: 'sk-test-key',
        cfAccountId: 'account-123',
        cfGatewayName: 'my-gateway',
        cfGatewayToken: 'test-gateway-token',
      }) as unknown as {
        _config: {
          apiKey: string;
          baseURL?: string;
          defaultHeaders?: Record<string, string>;
        };
      };

      expect(client._config.defaultHeaders).toBeDefined();
      expect(client._config.defaultHeaders?.['cf-aig-authorization']).toBe(
        'Bearer test-gateway-token'
      );
      expect(consoleLogSpy).toHaveBeenCalledWith('AI Gateway authentication enabled');
    });

    it('should NOT add cf-aig-authorization header when token is not provided', () => {
      const client = createOpenAIClient({
        apiKey: 'sk-test-key',
        cfAccountId: 'account-123',
        cfGatewayName: 'my-gateway',
      }) as unknown as {
        _config: {
          apiKey: string;
          baseURL?: string;
          defaultHeaders?: Record<string, string>;
        };
      };

      expect(client._config.defaultHeaders).toBeUndefined();
      expect(consoleLogSpy).not.toHaveBeenCalledWith('AI Gateway authentication enabled');
    });

    it('should NOT add authentication header when using direct OpenAI API', () => {
      const client = createOpenAIClient({
        apiKey: 'sk-test-key',
        cfGatewayToken: 'test-token',
      }) as unknown as {
        _config: {
          apiKey: string;
          baseURL?: string;
          defaultHeaders?: Record<string, string>;
        };
      };

      expect(client._config.defaultHeaders).toBeUndefined();
      expect(client._config.baseURL).toBeUndefined();
    });

    it('should format token with Bearer prefix correctly', () => {
      const token = 'my-secure-token-12345';
      const client = createOpenAIClient({
        apiKey: 'sk-test-key',
        cfAccountId: 'account-123',
        cfGatewayName: 'gateway',
        cfGatewayToken: token,
      }) as unknown as {
        _config: { defaultHeaders?: Record<string, string> };
      };

      expect(client._config.defaultHeaders?.['cf-aig-authorization']).toBe(`Bearer ${token}`);
    });
  });
});
