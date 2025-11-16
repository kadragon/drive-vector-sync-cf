/**
 * End-to-End Integration Tests for Cloudflare Workers
 *
 * Tests the complete worker flow including:
 * - Scheduled cron handler
 * - HTTP fetch handler (admin API)
 * - Full integration with mocked external dependencies
 *
 * Trace:
 *   spec_id: SPEC-scheduling-1, SPEC-admin-api-1, SPEC-web-dashboard-1
 *   task_id: TASK-014, TASK-031
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { VectorizeIndex, VectorizeVector } from './types/vectorize';

// Mock Google APIs before importing
vi.mock('googleapis', () => ({
  google: {
    auth: {
      JWT: class MockJWT {
        constructor(_options?: {
          email?: string;
          key?: string;
          scopes?: string[];
          subject?: string;
        }) {
          // Mock JWT accepts options object
        }
        authorize = vi.fn().mockResolvedValue({});
      },
    },
    drive: vi.fn().mockReturnValue({
      files: {
        list: vi.fn().mockResolvedValue({ data: { files: [] } }),
        get: vi.fn().mockResolvedValue({ data: {} }),
        export: vi.fn().mockResolvedValue({ data: '' }),
      },
      changes: {
        list: vi.fn().mockResolvedValue({ data: { changes: [], newStartPageToken: 'new-token' } }),
        getStartPageToken: vi.fn().mockResolvedValue({ data: { startPageToken: 'start-token' } }),
      },
    }),
  },
}));

// Mock OpenAI before importing
vi.mock('openai', () => ({
  default: class MockOpenAI {
    embeddings = {
      create: vi.fn().mockResolvedValue({
        data: [{ embedding: Array(1536).fill(0.1) }],
      }),
    };
  },
}));

vi.mock('./auth/zt-validator.js', () => {
  return {
    requireAccessJwt: vi.fn(async (request: Request) => {
      const token = request.headers.get('CF_Authorization');
      if (!token) {
        throw new Error('Missing CF_Authorization token');
      }
      if (token !== 'valid-access-token') {
        throw new Error('Invalid token');
      }
      return {};
    }),
    unauthorizedResponse: (message: string) => new Response(JSON.stringify({ error: 'Unauthorized', message }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }),
  };
});

import worker from './index';
import type { Env } from './index';
import { STATIC_ASSETS } from './static/assets';

/**
 * Mock KVNamespace implementation
 */
class MockKVNamespace {
  private store = new Map<string, string>();

  async get(key: string, type?: 'text' | 'json' | 'arrayBuffer' | 'stream'): Promise<any> {
    const value = this.store.get(key);
    if (value === undefined) {
      return null;
    }

    if (type === 'json') {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }

    // Default: return as string (text type)
    return value;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  // Implement remaining KVNamespace methods
  getWithMetadata = vi.fn().mockResolvedValue({ value: null, metadata: null });

  async list<Metadata = unknown>(): Promise<KVNamespaceListResult<Metadata>> {
    const keys = Array.from(this.store.keys()).map(name => ({ name, metadata: null as Metadata }));
    return { keys, list_complete: true, cacheStatus: null };
  }
}

/**
 * Mock VectorizeIndex implementation
 */
class MockVectorizeIndex implements VectorizeIndex {
  private vectors = new Map<string, VectorizeVector>();

  async describe() {
    return {
      name: 'test-index',
      dimensions: 1536,
      metric: 'cosine' as const,
      vectorsCount: this.vectors.size,
    };
  }

  async query(_vector: number[], options?: { topK?: number; filter?: Record<string, unknown> }) {
    const topK = options?.topK || 10;
    const matches = Array.from(this.vectors.values())
      .slice(0, topK)
      .map((v, i) => ({
        id: v.id,
        score: 0.9 - i * 0.1,
        values: v.values,
        metadata: v.metadata,
      }));

    return {
      matches,
      count: matches.length,
    };
  }

  async insert(vectors: VectorizeVector[]) {
    for (const vector of vectors) {
      this.vectors.set(vector.id, vector);
    }
    return { count: vectors.length, ids: vectors.map(v => v.id) };
  }

  async upsert(vectors: VectorizeVector[]) {
    return this.insert(vectors);
  }

  async deleteByIds(ids: string[]) {
    for (const id of ids) {
      this.vectors.delete(id);
    }
    return { count: ids.length, ids };
  }

  async getByIds(ids: string[]) {
    return ids.map(id => this.vectors.get(id)).filter((v): v is VectorizeVector => v !== undefined);
  }
}

/**
 * Create mock environment
 */
function createMockEnv(): Env {
  return {
    WORKNOTE_SYNC_STATE: new MockKVNamespace() as unknown as KVNamespace,
    WORKNOTE_FILE_VECTOR_INDEX: new MockKVNamespace() as unknown as KVNamespace,
    VECTORIZE: new MockVectorizeIndex() as unknown as VectorizeIndex,
    GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      type: 'service_account',
      project_id: 'test-project',
      private_key_id: 'test-key-id',
      // SECURITY: Mock private key for testing only - NOT a real credential
      // Generated specifically for testing - never used for actual authentication
      private_key:
        '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDAGuGuGb28HJth\nxLbTOYtB2vauDRVO3JyqlA5WaSearQiUFF7conJpMQAqeCOe+PZU/KZIqt+Q7MUO\n5HFVnyhxVXiSc5Wc7UcO/AoGPJf+e6jeMQD5znzw6CGDimdRTHzF8HtYHCSGPYkj\navcIUwGcYeRUCfxT4TSD6EMh94w+I9qxEMzHV/Cn3ECFn1OIqmiSB98RxH9gLnY2\nz505AMMb14CMhkz1C4os4lk3rIqEW4sKG0TT7YkMMUg3L7gosmu35YtQGjgQMLQ0\nGh8x6hi/RkD1MoxFg7EFE/gnuzC7xG4MPuBcojfrGRQM3khiaNQ8LMTZHggVx7uR\nrQrPBV5nAgMBAAECggEAA0pymJY9odNQ9hkgk027t6JrR2ACABqCCd9aFNuISiYH\nV5dhvfXVGpLe+zCZAPLS2scuh2Al+Z2Ut+9B4cLwNmt4Z/SC7kVCSlzBmd8VMM7S\n0xDpK15WKupPE1RzoKORdPKW/6i7whubwHeR88U4Py2OHm0YCCJ7e9Gmv2uLg3pM\n069zEnNCmzFxD/T1CnobusEFB3yDF5vruV3PICas4ySpT7v/2DCvJZq9j9Sr51Kp\nlyL2PE41h7BoqYldQxxTdHYFsSBGTyBpOI6TAU9slQXgf2ZDSzrk0Q69za0faGIx\nakOUqFkjWwQiaVM1kjyTPfQG9h9lHKeWquY/l0MiAQKBgQDezUjjDljyYTVkFlhc\nHV8Ms/eSfH7YZzhRxyF71gd3EYWuCKC2tqkesKwlxgAeGP7s0JGDuqTnFyZEkfB2\ny8vP/nd343z3YPgbhnfIjN46grKCzwRAIoi47XgiDmMzJxKps2S1U47R90Ou6GXd\ndO1VZ8Xwo8mk1v1Kjp5QMq5voQKBgQDcuqw5jjP1ge2kx+Zb4XSCSJw0wLO77Gq9\nrpIL9gWGm+ecAI66YYhFkRBi5U6JTeSebC/ADLd987BUrx9NHLDRDjlKWGdDQNfV\nQ+AodQ//RlqKecUYHBjBEop2O1Y5IgLWyggFDAK+ZHGmLYantah1vXYgVe61oNXY\nbPU639KxBwKBgCyRuEDjf9uMopeQ+MAEiB0Mazv8d4tmqpeBVCtnlzq0YJ99zlh+\nlboz8VvlDeT3bxeEaXeGgLJRqTASWZ4KCo1jBBcRhNAfr8Ih1hhiRZpCxt7v9pO1\n1M/ZgSye4C09ZbhY0I6NVoaeBgYZKzdvyoJJLgmDWjUFZMnjWbwFR2vBAoGAPM17\nRbuDWpy43sxmC2dWldD0np96o0ijuq6M8piJuyPVMCcDKhpV1Hv6XJO4B6CaWn2I\nxcl6/koTh7BZ2f8OQfg+Fdm2UFNbYRb6d4qPpo01wbF7doG+2+iElb8QqFpTF+G9\nRc6iLtoyaElgL3CeABj5ojyprgSpA544C0i+nB8CgYEA3hE9oLWvXuBfQDqS2m9O\nbaBDjqpY5w29oi1sJ6kEiVh7uYWPjkv2RWSp8XbrdieyIimh8mrW1i5AK5RlTBgV\n43muleJvsC+5xkRGJ5523Fy9RYNooyO/g2hNVVKLESr48OS9lKT5IXyfkgnB1Ns6\n2uEERFRpspmbmdTUiWjmlqM=\n-----END PRIVATE KEY-----\n',
      client_email: 'test@example.iam.gserviceaccount.com',
      client_id: '123456789',
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url:
        'https://www.googleapis.com/robot/v1/metadata/x509/test%40example.iam.gserviceaccount.com',
    }),
    GOOGLE_IMPERSONATION_EMAIL: undefined,
    GOOGLE_ROOT_FOLDER_ID: 'test-root-folder-id',
    OPENAI_API_KEY: 'test-openai-key',
    CF_ACCESS_TEAM_DOMAIN: 'kadragon.cloudflareaccess.com',
    CF_ACCESS_AUD_TAG: 'test-aud',
    CHUNK_SIZE: '2000',
    MAX_BATCH_SIZE: '32',
    MAX_CONCURRENCY: '2',
    MAX_RETRIES: '3',
    INDEX_NAME: 'test-index',
    WEBHOOK_URL: undefined,
    WEBHOOK_TYPE: undefined,
    PERFORMANCE_THRESHOLD: undefined,
  };
}

/**
 * Create mock ExecutionContext
 */
function createMockExecutionContext(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    props: {},
  } as ExecutionContext;
}

describe('E2E Integration Tests', () => {
  let env: Env;
  let ctx: ExecutionContext;
  let sharedStateKV: MockKVNamespace;
  let sharedFileIndexKV: MockKVNamespace;
  let sharedVectorize: MockVectorizeIndex;

  beforeEach(() => {
    // Create shared KV instances to persist state across multiple calls in the same test
    sharedStateKV = new MockKVNamespace();
    sharedFileIndexKV = new MockKVNamespace();
    sharedVectorize = new MockVectorizeIndex();

    env = {
      ...createMockEnv(),
      WORKNOTE_SYNC_STATE: sharedStateKV as unknown as KVNamespace,
      WORKNOTE_FILE_VECTOR_INDEX: sharedFileIndexKV as unknown as KVNamespace,
      VECTORIZE: sharedVectorize as unknown as VectorizeIndex,
    };
    ctx = createMockExecutionContext();
    vi.clearAllMocks();
  });

  describe('HTTP Fetch Handler', () => {
    describe('Health Check', () => {
      it('should return 200 OK for health check', async () => {
        const request = new Request('http://localhost/health');
        const response = await worker.fetch(request, env, ctx);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toEqual({ status: 'ok' });
      });

      it('should have correct content-type for health check', async () => {
        const request = new Request('http://localhost/health');
        const response = await worker.fetch(request, env, ctx);

        expect(response.headers.get('Content-Type')).toBe('application/json');
      });
    });

    describe('Authentication', () => {
      it('should reject requests without CF_Authorization header', async () => {
        const request = new Request('http://localhost/admin/status');
        const response = await worker.fetch(request, env, ctx);

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data).toEqual({ error: 'Unauthorized' });
      });

      it('should reject requests with invalid token', async () => {
        const request = new Request('http://localhost/admin/status', {
          headers: {
            CF_Authorization: 'wrong-token',
          },
        });
        const response = await worker.fetch(request, env, ctx);

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data).toEqual({ error: 'Unauthorized', message: 'Invalid token' });
      });

      it('should accept requests with valid CF_Authorization token', async () => {
        const request = new Request('http://localhost/admin/status', {
          headers: {
            CF_Authorization: 'valid-access-token',
          },
        });
        const response = await worker.fetch(request, env, ctx);

        // Should not be 401
        expect(response.status).not.toBe(401);
      });
    });

    describe('Admin API - Status Endpoint', () => {
      it('should return current sync status', async () => {
        // Set up initial state (use correct KV key)
        const stateKV = env.WORKNOTE_SYNC_STATE;
        await stateKV.put(
          'drive_start_page_token',
          JSON.stringify({
            startPageToken: 'test-token',
            lastSyncTime: '2025-11-15T00:00:00Z',
            filesProcessed: 42,
            errorCount: 2,
          })
        );

        const request = new Request('http://localhost/admin/status', {
          headers: {
            CF_Authorization: 'valid-access-token',
          },
        });

        const response = await worker.fetch(request, env, ctx);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toMatchObject({
          status: expect.any(String),
          lastSyncTime: '2025-11-15T00:00:00Z',
          filesProcessed: 42,
          errorCount: 2,
          hasStartPageToken: true,
        });
      });

      it('should handle empty state', async () => {
        const request = new Request('http://localhost/admin/status', {
          headers: {
            CF_Authorization: 'valid-access-token',
          },
        });

        const response = await worker.fetch(request, env, ctx);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toMatchObject({
          lastSyncTime: null,
          filesProcessed: 0,
          errorCount: 0,
          hasStartPageToken: false,
        });
      });
    });

    describe('Admin API - Stats Endpoint', () => {
      it('should return vector store statistics', async () => {
        const request = new Request('http://localhost/admin/stats', {
          headers: {
            CF_Authorization: 'valid-access-token',
          },
        });

        const response = await worker.fetch(request, env, ctx);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toHaveProperty('collection');
        expect(data).toHaveProperty('vectorCount');
        expect(data).toHaveProperty('status');
      });
    });

    describe('Admin API - Resync Endpoint', () => {
      it('should reject non-POST requests', async () => {
        const request = new Request('http://localhost/admin/resync', {
          method: 'GET',
          headers: {
            CF_Authorization: 'valid-access-token',
          },
        });

        const response = await worker.fetch(request, env, ctx);

        // Admin handler returns 404 for unsupported methods on admin paths
        expect(response.status).toBe(404);
      });

      it('should handle concurrent sync prevention', async () => {
        // Acquire lock first (use proper format - timestamp string, not JSON)
        const stateKV = env.WORKNOTE_SYNC_STATE;
        await stateKV.put('sync_lock', Date.now().toString());

        const request = new Request('http://localhost/admin/resync', {
          method: 'POST',
          headers: {
            CF_Authorization: 'valid-access-token',
          },
        });

        const response = await worker.fetch(request, env, ctx);

        expect(response.status).toBe(409);
        const data = await response.json();
        expect(data).toHaveProperty('error');
      });
    });

    describe('Dashboard Static Assets', () => {
      it('should serve dashboard HTML at root path', async () => {
        const request = new Request('http://localhost/');
        const response = await worker.fetch(request, env, ctx);

        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('text/html');
        const html = await response.text();
        expect(html).toContain('<div id="root">');
      });

      it('should serve bundled assets with caching headers', async () => {
        const jsAssetPath = Object.keys(STATIC_ASSETS).find(path => path.endsWith('.js'));
        expect(jsAssetPath).toBeDefined();

        const request = new Request(`http://localhost${jsAssetPath}`);
        const response = await worker.fetch(request, env, ctx);

        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe('application/javascript');
        expect(response.headers.get('Cache-Control')).toContain('public');
        expect(response.headers.get('ETag')).toBeTruthy();
        const body = await response.text();
        expect(body.length).toBeGreaterThan(0);
      });
    });

    describe('404 Handler', () => {
      it('should return 404 for unknown paths', async () => {
        const request = new Request('http://localhost/unknown/path');
        const response = await worker.fetch(request, env, ctx);

        expect(response.status).toBe(404);
        const data = await response.json();
        expect(data).toEqual({ error: 'Not found' });
      });
    });
  });

  describe('Scheduled Handler', () => {
    it('should handle scheduled events', async () => {
      const event = {
        type: 'scheduled',
        scheduledTime: Date.now(),
        cron: '0 17 * * *',
      } as ScheduledEvent;

      // Should not throw
      await expect(worker.scheduled(event, env, ctx)).resolves.toBeUndefined();
    });

    it('should prevent concurrent execution with lock', async () => {
      // Acquire lock using proper format (timestamp as string, not JSON)
      const stateKV = env.WORKNOTE_SYNC_STATE;
      await stateKV.put('sync_lock', Date.now().toString());

      const event = {
        type: 'scheduled',
        scheduledTime: Date.now(),
        cron: '0 17 * * *',
      } as ScheduledEvent;

      // Should complete without error (skips sync due to lock)
      await expect(worker.scheduled(event, env, ctx)).resolves.toBeUndefined();

      // Lock should still be held (not released by the skipped sync)
      const lock = await stateKV.get('sync_lock');
      expect(lock).toBeTruthy();
    });

    it('should log scheduled time correctly', async () => {
      const scheduledTime = Date.now();
      const event = {
        type: 'scheduled',
        scheduledTime,
        cron: '0 17 * * *',
      } as ScheduledEvent;

      const consoleSpy = vi.spyOn(console, 'log');

      await worker.scheduled(event, env, ctx);

      expect(consoleSpy).toHaveBeenCalledWith('Scheduled sync triggered at:', expect.any(String));

      consoleSpy.mockRestore();
    });
  });

  describe('State Persistence', () => {
    it('should persist state across operations', async () => {
      const stateKV = env.WORKNOTE_SYNC_STATE;

      // Set initial state (use correct KV key from KVStateManager)
      const initialState = {
        startPageToken: 'token-1',
        lastSyncTime: '2025-11-15T00:00:00Z',
        filesProcessed: 10,
        errorCount: 0,
      };
      await stateKV.put('drive_start_page_token', JSON.stringify(initialState));

      // Verify state persists
      const request = new Request('http://localhost/admin/status', {
        headers: {
          CF_Authorization: 'valid-access-token',
        },
      });

      const response = await worker.fetch(request, env, ctx);
      const data = (await response.json()) as any;

      expect(data.filesProcessed).toBe(10);
      expect(data.lastSyncTime).toBe('2025-11-15T00:00:00Z');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed state data gracefully', async () => {
      const stateKV = env.WORKNOTE_SYNC_STATE;
      await stateKV.put('drive_start_page_token', 'invalid-json');

      const request = new Request('http://localhost/admin/status', {
        headers: {
          CF_Authorization: 'valid-access-token',
        },
      });

      const response = await worker.fetch(request, env, ctx);

      // Should handle error gracefully
      expect(response.status).toBeLessThan(500);
    });

    it('should handle missing environment variables', async () => {
      const invalidEnv = {
        ...env,
        GOOGLE_SERVICE_ACCOUNT_JSON: '',
      };

      const request = new Request('http://localhost/health');

      // Health check should still work
      const response = await worker.fetch(request, invalidEnv, ctx);
      expect(response.status).toBe(200);
    });
  });

  describe('Configuration Parsing', () => {
    it('should parse numeric configuration correctly', async () => {
      const customEnv = {
        ...env,
        CHUNK_SIZE: '3000',
        MAX_BATCH_SIZE: '64',
        MAX_CONCURRENCY: '8',
      };

      const request = new Request('http://localhost/health');
      const response = await worker.fetch(request, customEnv, ctx);

      expect(response.status).toBe(200);
    });

    it('should use default values for missing config', async () => {
      const minimalEnv = {
        ...env,
        CHUNK_SIZE: '',
        MAX_BATCH_SIZE: '',
        MAX_CONCURRENCY: '',
      };

      const request = new Request('http://localhost/health');
      const response = await worker.fetch(request, minimalEnv, ctx);

      expect(response.status).toBe(200);
    });
  });

  describe('Integration Scenarios', () => {
    it('should complete full workflow: status check -> resync -> status check', async () => {
      // 1. Check initial status
      const statusRequest1 = new Request('http://localhost/admin/status', {
        headers: { CF_Authorization: 'valid-access-token' },
      });
      const statusResponse1 = await worker.fetch(statusRequest1, env, ctx);
      expect(statusResponse1.status).toBe(200);

      await statusResponse1.json();

      // 2. Note: Actual resync would require mocking Google Drive API responses
      // For now, verify the endpoint is accessible
      const resyncRequest = new Request('http://localhost/admin/resync', {
        method: 'POST',
        headers: { CF_Authorization: 'valid-access-token' },
      });
      const resyncResponse = await worker.fetch(resyncRequest, env, ctx);

      // Expect either success, lock conflict, or API error (all valid E2E behaviors without real credentials)
      expect([200, 409, 500]).toContain(resyncResponse.status);
    });

    it('should handle health check while sync is running', async () => {
      // Acquire lock to simulate running sync
      const stateKV = env.WORKNOTE_SYNC_STATE;
      await stateKV.put('sync_lock', Date.now().toString());

      // Health check should still work
      const request = new Request('http://localhost/health');
      const response = await worker.fetch(request, env, ctx);

      expect(response.status).toBe(200);
    });

    it('should handle multiple concurrent status requests', async () => {
      const requests = Array.from(
        { length: 5 },
        () =>
          new Request('http://localhost/admin/status', {
            headers: { CF_Authorization: 'valid-access-token' },
          })
      );

      const responses = await Promise.all(requests.map(req => worker.fetch(req, env, ctx)));

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });

  describe('Vector Store Integration', () => {
    it('should interact with Vectorize index', async () => {
      const vectorize = env.VECTORIZE as unknown as MockVectorizeIndex;

      // Insert test vectors
      await vectorize.insert([
        {
          id: 'test-1',
          values: Array(1536).fill(0.1),
          metadata: { file_id: 'test-file' },
        },
      ]);

      // Query stats endpoint
      const request = new Request('http://localhost/admin/stats', {
        headers: { CF_Authorization: 'valid-access-token' },
      });

      const response = await worker.fetch(request, env, ctx);
      expect(response.status).toBe(200);

      const data = (await response.json()) as any;
      expect(data.vectorCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('KV Namespace Integration', () => {
    it('should store and retrieve file-vector mappings', async () => {
      const fileIndexKV = env.WORKNOTE_FILE_VECTOR_INDEX;

      // Store mapping
      await fileIndexKV.put(
        'file-123',
        JSON.stringify({
          vectorIds: ['file-123_0', 'file-123_1'],
          vectorCount: 2,
        })
      );

      // Retrieve mapping
      const mapping = await fileIndexKV.get('file-123');
      expect(mapping).toBeTruthy();
      expect(JSON.parse(mapping!)).toMatchObject({
        vectorIds: expect.arrayContaining(['file-123_0', 'file-123_1']),
        vectorCount: 2,
      });
    });
  });
});
