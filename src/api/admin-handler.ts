/**
 * Admin API endpoints handler
 *
 * Trace:
 *   spec_id: SPEC-admin-api-1
 *   task_id: TASK-011, TASK-028
 */

import { SyncOrchestrator } from '../sync/sync-orchestrator.js';
import { KVStateManager } from '../state/kv-state-manager.js';
import { VectorStoreClient } from '../types/vector-store.js';
import { getNextCronExecution, getCronSchedule } from '../utils/cron.js';
import { buildCorsHeaders } from '../utils/cors.js';

/**
 * Admin API request handler
 */
export class AdminHandler {
  constructor(
    private orchestrator: SyncOrchestrator,
    private stateManager: KVStateManager,
    private vectorClient: VectorStoreClient,
    private rootFolderId: string,
    private request: Request
  ) {}

  /**
   * Handle admin API requests
   */
  async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // POST /admin/resync - Trigger full resync
      if (path === '/admin/resync' && request.method === 'POST') {
        return await this.handleResync();
      }

      // GET /admin/status - Get sync status
      if (path === '/admin/status' && request.method === 'GET') {
        return await this.handleStatus();
      }

      // GET /admin/stats - Get collection statistics
      if (path === '/admin/stats' && request.method === 'GET') {
        return await this.handleStats();
      }

      // GET /admin/history - Get sync history
      if (path === '/admin/history' && request.method === 'GET') {
        return await this.handleHistory(request);
      }

      return this.jsonResponse({ error: 'Not found', path }, 404);
    } catch (error) {
      console.error('Admin API error:', error);
      return this.jsonResponse(
        {
          error: 'Internal server error',
          message: (error as Error).message,
        },
        500
      );
    }
  }

  /**
   * Handle POST /admin/resync
   */
  private async handleResync(): Promise<Response> {
    // Check if sync is already running
    const lockAcquired = await this.stateManager.acquireLock();

    if (!lockAcquired) {
      return this.jsonResponse(
        {
          error: 'Conflict',
          message: 'Sync is already running',
        },
        409
      );
    }

    try {
      // Clear state to force full resync
      await this.stateManager.clearState();

      // Run full sync
      const result = await this.orchestrator.runFullSync(this.rootFolderId);

      return this.jsonResponse({
        success: true,
        message: 'Full resync completed',
        result,
      });
    } finally {
      await this.stateManager.releaseLock();
    }
  }

  /**
   * Handle GET /admin/status
   */
  private async handleStatus(): Promise<Response> {
    const state = await this.stateManager.getState();
    const isLocked = await this.stateManager.isLocked();
    const nextScheduledSync = getNextCronExecution(getCronSchedule());

    return this.jsonResponse({
      status: 'ok',
      lastSyncTime: state.lastSyncTime,
      filesProcessed: state.filesProcessed,
      errorCount: state.errorCount,
      hasStartPageToken: !!state.startPageToken,
      isLocked,
      nextScheduledSync,
      lastSyncDuration: state.lastSyncDuration || null,
    });
  }

  /**
   * Handle GET /admin/stats
   */
  private async handleStats(): Promise<Response> {
    const collectionInfo = (await this.vectorClient.getCollectionInfo()) as {
      name?: string;
      status?: string;
    };
    const vectorCount = await this.vectorClient.countVectors();

    return this.jsonResponse({
      collection: collectionInfo.name,
      vectorCount,
      status: collectionInfo.status,
    });
  }

  /**
   * Handle GET /admin/history
   */
  private async handleHistory(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 30;

    // Validate limit
    if (isNaN(limit) || limit < 1 || limit > 100) {
      return this.jsonResponse({ error: 'Invalid limit parameter (1-100)' }, 400);
    }

    const history = await this.stateManager.getSyncHistory(limit);

    return this.jsonResponse({
      history,
      count: history.length,
    });
  }

  /**
   * Create JSON response with CORS headers
   */
  private jsonResponse(data: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(data, null, 2), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...buildCorsHeaders(this.request),
      },
    });
  }
}
