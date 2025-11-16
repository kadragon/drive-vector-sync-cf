/**
 * Main entry point for Google Drive → Cloudflare Vectorize Sync Worker
 *
 * Handles:
 * - Scheduled cron triggers (daily sync)
 * - HTTP requests (admin API)
 *
 * Trace:
 *   spec_id: SPEC-scheduling-1, SPEC-admin-api-1, SPEC-web-dashboard-1
 *   task_id: TASK-009, TASK-011, TASK-027, TASK-031
 */

import { DriveClient } from './drive/drive-client.js';
import { EmbeddingClient } from './embedding/embedding-client.js';
import { VectorizeClient } from './vectorize/vectorize-client.js';
import { KVStateManager } from './state/kv-state-manager.js';
import { SyncOrchestrator } from './sync/sync-orchestrator.js';
import { AdminHandler } from './api/admin-handler.js';
import { requireAccessJwt, unauthorizedResponse } from './auth/zt-validator.js';
import { logError } from './errors/index.js';
import { resolveAssetPath, serveStaticAsset } from './static/server.js';
import { createOpenAIClient } from './openai/openai-factory.js';
import type { VectorizeIndex } from './types/vectorize.js';

export interface Env {
  // Cloudflare Workers bindings
  WORKNOTE_SYNC_STATE: KVNamespace;
  WORKNOTE_FILE_VECTOR_INDEX: KVNamespace;
  VECTORIZE: VectorizeIndex;

  // Secrets
  // Service Account JSON string from Google Cloud Console
  GOOGLE_SERVICE_ACCOUNT_JSON: string;
  // Optional: User email for domain-wide delegation
  GOOGLE_IMPERSONATION_EMAIL?: string;
  GOOGLE_ROOT_FOLDER_ID: string;
  OPENAI_API_KEY: string;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD_TAG: string;
  // Optional: Cloudflare AI Gateway configuration
  CF_ACCOUNT_ID?: string;
  CF_AI_GATEWAY_NAME?: string;
  CF_AI_GATEWAY_TOKEN?: string;

  // Environment variables
  CHUNK_SIZE: string;
  MAX_BATCH_SIZE: string;
  MAX_CONCURRENCY: string;
  MAX_RETRIES: string;
  INDEX_NAME: string;

  // Monitoring and alerting (optional)
  WEBHOOK_URL?: string;
  WEBHOOK_TYPE?: 'slack' | 'discord';
  PERFORMANCE_THRESHOLD?: string;
}

// Re-export Vectorize types for external use
export type { VectorizeIndex };

/**
 * Initialize all clients and orchestrator
 */
function initializeServices(env: Env) {
  // Initialize Drive client with Service Account
  const driveClient = DriveClient.fromJSON(
    env.GOOGLE_SERVICE_ACCOUNT_JSON,
    env.GOOGLE_IMPERSONATION_EMAIL
  );

  // Create OpenAI client with optional AI Gateway routing
  const openaiClient = createOpenAIClient({
    apiKey: env.OPENAI_API_KEY,
    cfAccountId: env.CF_ACCOUNT_ID,
    cfGatewayName: env.CF_AI_GATEWAY_NAME,
    cfGatewayToken: env.CF_AI_GATEWAY_TOKEN,
  });

  const embeddingClient = new EmbeddingClient({
    client: openaiClient,
  });

  // Vector store client - Cloudflare Vectorize
  console.log('Using Cloudflare Vectorize for vector storage');
  const vectorClient = new VectorizeClient({
    index: env.VECTORIZE as VectorizeIndex,
    fileIndex: env.WORKNOTE_FILE_VECTOR_INDEX,
    collectionName: env.INDEX_NAME,
  });

  const stateManager = new KVStateManager(env.WORKNOTE_SYNC_STATE);

  const orchestrator = new SyncOrchestrator(
    driveClient,
    embeddingClient,
    vectorClient,
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
    vectorClient,
    env.GOOGLE_ROOT_FOLDER_ID
  );

  return {
    driveClient,
    embeddingClient,
    vectorClient,
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

    // Static dashboard assets (root HTML + bundled files)
    const assetPath = resolveAssetPath(url.pathname);
    if (assetPath) {
      return serveStaticAsset(request, assetPath);
    }

    // Admin endpoints require Cloudflare Zero Trust authentication
    if (url.pathname.startsWith('/admin')) {
      try {
        await requireAccessJwt(request, env);
      } catch (error) {
        return unauthorizedResponse((error as Error).message);
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
