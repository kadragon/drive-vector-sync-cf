/**
 * Main entry point for Google Drive → Qdrant Vector Sync Worker
 *
 * Handles:
 * - Scheduled cron triggers (daily sync)
 * - HTTP requests (admin API)
 *
 * Trace:
 *   spec_id: SPEC-scheduling-1, SPEC-admin-api-1
 *   task_id: TASK-009, TASK-011
 */

import { DriveClient } from './drive/drive-client.js';
import { EmbeddingClient } from './embedding/embedding-client.js';
import { QdrantClient } from './qdrant/qdrant-client.js';
import { KVStateManager } from './state/kv-state-manager.js';
import { SyncOrchestrator } from './sync/sync-orchestrator.js';
import { AdminHandler, validateAdminToken } from './api/admin-handler.js';
import { logError } from './errors/index.js';

export interface Env {
  // KV Namespace
  SYNC_STATE: KVNamespace;

  // Secrets
  // Service Account JSON string from Google Cloud Console
  GOOGLE_SERVICE_ACCOUNT_JSON: string;
  // Optional: User email for domain-wide delegation
  GOOGLE_IMPERSONATION_EMAIL?: string;
  GOOGLE_ROOT_FOLDER_ID: string;
  OPENAI_API_KEY: string;
  QDRANT_URL: string;
  QDRANT_API_KEY: string;
  ADMIN_TOKEN: string;

  // Environment variables
  CHUNK_SIZE: string;
  MAX_BATCH_SIZE: string;
  MAX_CONCURRENCY: string;
  MAX_RETRIES: string;
  QDRANT_COLLECTION_NAME: string;

  // Monitoring and alerting (optional)
  WEBHOOK_URL?: string;
  WEBHOOK_TYPE?: 'slack' | 'discord';
  PERFORMANCE_THRESHOLD?: string;
}

/**
 * Initialize all clients and orchestrator
 */
function initializeServices(env: Env) {
  // Initialize Drive client with Service Account
  const driveClient = DriveClient.fromJSON(
    env.GOOGLE_SERVICE_ACCOUNT_JSON,
    env.GOOGLE_IMPERSONATION_EMAIL
  );

  const embeddingClient = new EmbeddingClient({
    apiKey: env.OPENAI_API_KEY,
  });

  const qdrantClient = new QdrantClient({
    url: env.QDRANT_URL,
    apiKey: env.QDRANT_API_KEY,
    collectionName: env.QDRANT_COLLECTION_NAME,
  });

  const stateManager = new KVStateManager(env.SYNC_STATE);

  const orchestrator = new SyncOrchestrator(
    driveClient,
    embeddingClient,
    qdrantClient,
    stateManager,
    {
      chunkSize: parseInt(env.CHUNK_SIZE || '2000', 10),
      maxBatchSize: parseInt(env.MAX_BATCH_SIZE || '32', 10),
      maxConcurrency: parseInt(env.MAX_CONCURRENCY || '4', 10),
    },
    {
      webhookUrl: env.WEBHOOK_URL,
      webhookType: env.WEBHOOK_TYPE,
      performanceThreshold: env.PERFORMANCE_THRESHOLD ? parseFloat(env.PERFORMANCE_THRESHOLD) : 0.5,
    }
  );

  const adminHandler = new AdminHandler(
    orchestrator,
    stateManager,
    qdrantClient,
    env.GOOGLE_ROOT_FOLDER_ID
  );

  return {
    driveClient,
    embeddingClient,
    qdrantClient,
    stateManager,
    orchestrator,
    adminHandler,
  };
}

export default {
  /**
   * Scheduled cron trigger handler
   */
  async scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    console.log('Scheduled sync triggered at:', new Date(event.scheduledTime).toISOString());

    const { orchestrator, stateManager } = initializeServices(env);

    try {
      // 1. Check for concurrent execution
      const lockAcquired = await stateManager.acquireLock();

      if (!lockAcquired) {
        console.log('Sync already running, skipping this execution');
        return;
      }

      try {
        // 2. Run incremental sync
        const result = await orchestrator.runIncrementalSync(env.GOOGLE_ROOT_FOLDER_ID);

        console.log('Scheduled sync completed:', result);
      } finally {
        // 3. Release lock
        await stateManager.releaseLock();
      }
    } catch (error) {
      console.error('Scheduled sync failed:', error);
      logError(error as Error);
    }
  },

  /**
   * HTTP request handler (admin API)
   */
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Admin endpoints require authentication
    if (url.pathname.startsWith('/admin')) {
      if (!validateAdminToken(request, env.ADMIN_TOKEN)) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Handle admin API requests
      const { adminHandler } = initializeServices(env);
      return await adminHandler.handleRequest(request);
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
