/**
 * Admin API endpoints handler
 *
 * Trace:
 *   spec_id: SPEC-admin-api-1
 *   task_id: TASK-011
 */

import { SyncOrchestrator } from '../sync/sync-orchestrator.js';
import { KVStateManager } from '../state/kv-state-manager.js';
import { QdrantClient } from '../qdrant/qdrant-client.js';

/**
 * Admin API request handler
 */
export class AdminHandler {
  constructor(
    private orchestrator: SyncOrchestrator,
    private stateManager: KVStateManager,
    private qdrantClient: QdrantClient,
    private rootFolderId: string
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

      return this.jsonResponse(
        { error: 'Not found', path },
        404
      );
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

    return this.jsonResponse({
      status: 'ok',
      lastSyncTime: state.lastSyncTime,
      filesProcessed: state.filesProcessed,
      errorCount: state.errorCount,
      hasStartPageToken: !!state.startPageToken,
    });
  }

  /**
   * Handle GET /admin/stats
   */
  private async handleStats(): Promise<Response> {
    const collectionInfo = await this.qdrantClient.getCollectionInfo();
    const vectorCount = await this.qdrantClient.countVectors();

    return this.jsonResponse({
      collection: collectionInfo.name,
      vectorCount,
      status: collectionInfo.status,
    });
  }

  /**
   * Create JSON response
   */
  private jsonResponse(data: any, status: number = 200): Response {
    return new Response(JSON.stringify(data, null, 2), {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}

/**
 * Validate admin token from request
 */
export function validateAdminToken(
  request: Request,
  adminToken: string
): boolean {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  return token === adminToken;
}
