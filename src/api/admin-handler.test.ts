/**
 * Tests for Admin API Handler
 *
 * Trace:
 *   spec_id: SPEC-admin-api-1
 *   task_id: TASK-011
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdminHandler } from './admin-handler';
import { SyncOrchestrator, SyncResult } from '../sync/sync-orchestrator';
import { KVStateManager, SyncState } from '../state/kv-state-manager';
import { VectorStoreClient } from '../types/vector-store';

// Define response types for better type safety
interface AdminStatusResponse {
  status: string;
  lastSyncTime: string | null;
  filesProcessed: number;
  errorCount: number;
  hasStartPageToken: boolean;
}

interface AdminStatsResponse {
  collection: string;
  vectorCount: number;
  status: string;
}

interface AdminResyncResponse {
  success: boolean;
  message: string;
  result: SyncResult;
}

interface AdminErrorResponse {
  error: string;
  message?: string;
  path?: string;
}

// Mock implementations
class MockSyncOrchestrator {
  private fullSyncResult: SyncResult = {
    filesProcessed: 10,
    vectorsUpserted: 50,
    vectorsDeleted: 0,
    errors: 0,
    duration: 5000,
  };

  setFullSyncResult(result: SyncResult) {
    this.fullSyncResult = result;
  }

  async runFullSync(_rootFolderId: string): Promise<SyncResult> {
    return this.fullSyncResult;
  }

  async runIncrementalSync(_rootFolderId: string): Promise<SyncResult> {
    return {
      filesProcessed: 2,
      vectorsUpserted: 10,
      vectorsDeleted: 1,
      errors: 0,
      duration: 1000,
    };
  }
}

class MockKVStateManager {
  private state: SyncState = {
    startPageToken: 'token-123',
    lastSyncTime: '2025-11-14T00:00:00Z',
    filesProcessed: 100,
    errorCount: 5,
  };
  private locked = false;

  setState(state: SyncState) {
    this.state = { ...state };
  }

  async getState(): Promise<SyncState> {
    return { ...this.state };
  }

  async clearState(): Promise<void> {
    this.state = {
      startPageToken: null,
      lastSyncTime: null,
      filesProcessed: 0,
      errorCount: 0,
    };
  }

  async acquireLock(): Promise<boolean> {
    if (this.locked) return false;
    this.locked = true;
    return true;
  }

  async releaseLock(): Promise<void> {
    this.locked = false;
  }

  async isLocked(): Promise<boolean> {
    return this.locked;
  }

  async updateSyncDuration(duration: number): Promise<void> {
    this.state.lastSyncDuration = duration;
  }

  async saveSyncHistory(_entry: any): Promise<void> {
    // Mock implementation - no-op for tests
  }

  async getSyncHistory(_limit?: number): Promise<any[]> {
    // Mock implementation - return empty array
    return [];
  }
}

class MockVectorClient {
  private collectionInfo = {
    name: 'worknote-store',
    status: 'green',
  };
  private vectorCount = 500;

  setCollectionInfo(info: any) {
    this.collectionInfo = info;
  }

  setVectorCount(count: number) {
    this.vectorCount = count;
  }

  async getCollectionInfo(): Promise<unknown> {
    return this.collectionInfo;
  }

  async countVectors(): Promise<number> {
    return this.vectorCount;
  }
}

describe('AdminHandler', () => {
  let handler: AdminHandler;
  let orchestrator: MockSyncOrchestrator;
  let stateManager: MockKVStateManager;
  let vectorClient: MockVectorClient;
  const rootFolderId = 'root-folder-123';

  beforeEach(() => {
    orchestrator = new MockSyncOrchestrator();
    stateManager = new MockKVStateManager();
    vectorClient = new MockVectorClient();

    handler = new AdminHandler(
      orchestrator as unknown as SyncOrchestrator,
      stateManager as unknown as KVStateManager,
      vectorClient as unknown as VectorStoreClient,
      rootFolderId
    );
  });

  describe('Endpoint Routing', () => {
    it('should route POST /admin/resync correctly', async () => {
      const request = new Request('http://localhost/admin/resync', {
        method: 'POST',
      });

      const response = await handler.handleRequest(request);
      const data = (await response.json()) as AdminResyncResponse;

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain('resync');
    });

    it('should route GET /admin/status correctly', async () => {
      const request = new Request('http://localhost/admin/status', {
        method: 'GET',
      });

      const response = await handler.handleRequest(request);
      const data = (await response.json()) as AdminStatusResponse;

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
    });

    it('should route GET /admin/stats correctly', async () => {
      const request = new Request('http://localhost/admin/stats', {
        method: 'GET',
      });

      const response = await handler.handleRequest(request);
      const data = (await response.json()) as AdminStatsResponse;

      expect(response.status).toBe(200);
      expect(data.collection).toBeDefined();
      expect(data.vectorCount).toBeDefined();
    });

    it('should return 404 for unknown paths', async () => {
      const request = new Request('http://localhost/admin/unknown', {
        method: 'GET',
      });

      const response = await handler.handleRequest(request);
      const data = (await response.json()) as AdminErrorResponse;

      expect(response.status).toBe(404);
      expect(data.error).toBe('Not found');
      expect(data.path).toBe('/admin/unknown');
    });

    it('should enforce correct HTTP methods', async () => {
      const request = new Request('http://localhost/admin/resync', {
        method: 'GET', // Wrong method
      });

      const response = await handler.handleRequest(request);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /admin/resync', () => {
    it('should acquire lock before running resync', async () => {
      const request = new Request('http://localhost/admin/resync', {
        method: 'POST',
      });

      const response = await handler.handleRequest(request);

      expect(response.status).toBe(200);
      expect(await stateManager.isLocked()).toBe(false); // Should be released after
    });

    it('should return 409 if sync already running', async () => {
      // Acquire lock first
      await stateManager.acquireLock();

      const request = new Request('http://localhost/admin/resync', {
        method: 'POST',
      });

      const response = await handler.handleRequest(request);
      const data = (await response.json()) as AdminErrorResponse;

      expect(response.status).toBe(409);
      expect(data.error).toBe('Conflict');
      expect(data.message).toContain('already running');
    });

    it('should clear state before full sync', async () => {
      stateManager.setState({
        startPageToken: 'old-token',
        lastSyncTime: '2025-11-13T00:00:00Z',
        filesProcessed: 100,
        errorCount: 5,
      });

      const request = new Request('http://localhost/admin/resync', {
        method: 'POST',
      });

      await handler.handleRequest(request);

      const state = await stateManager.getState();
      expect(state.startPageToken).toBeNull();
      expect(state.filesProcessed).toBe(0);
      expect(state.errorCount).toBe(0);
    });

    it('should return success response with result', async () => {
      orchestrator.setFullSyncResult({
        filesProcessed: 25,
        vectorsUpserted: 100,
        vectorsDeleted: 5,
        errors: 2,
        duration: 10000,
      });

      const request = new Request('http://localhost/admin/resync', {
        method: 'POST',
      });

      const response = await handler.handleRequest(request);
      const data = (await response.json()) as AdminResyncResponse;

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.result).toBeDefined();
      expect(data.result.filesProcessed).toBe(25);
      expect(data.result.vectorsUpserted).toBe(100);
    });

    it('should release lock even if sync fails', async () => {
      // Mock orchestrator to throw error
      orchestrator.runFullSync = vi.fn().mockRejectedValue(new Error('Sync failed'));

      const request = new Request('http://localhost/admin/resync', {
        method: 'POST',
      });

      await handler.handleRequest(request);

      // Lock should be released
      expect(await stateManager.isLocked()).toBe(false);
    });
  });

  describe('GET /admin/status', () => {
    it('should return current sync state', async () => {
      stateManager.setState({
        startPageToken: 'current-token',
        lastSyncTime: '2025-11-14T12:00:00Z',
        filesProcessed: 150,
        errorCount: 3,
      });

      const request = new Request('http://localhost/admin/status', {
        method: 'GET',
      });

      const response = await handler.handleRequest(request);
      const data = (await response.json()) as AdminStatusResponse;

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.lastSyncTime).toBe('2025-11-14T12:00:00Z');
      expect(data.filesProcessed).toBe(150);
      expect(data.errorCount).toBe(3);
    });

    it('should indicate if startPageToken exists', async () => {
      stateManager.setState({
        startPageToken: 'exists',
        lastSyncTime: '2025-11-14T12:00:00Z',
        filesProcessed: 100,
        errorCount: 0,
      });

      const request = new Request('http://localhost/admin/status', {
        method: 'GET',
      });

      const response = await handler.handleRequest(request);
      const data = (await response.json()) as AdminStatusResponse;

      expect(data.hasStartPageToken).toBe(true);
    });

    it('should indicate when no startPageToken exists', async () => {
      stateManager.setState({
        startPageToken: null,
        lastSyncTime: null,
        filesProcessed: 0,
        errorCount: 0,
      });

      const request = new Request('http://localhost/admin/status', {
        method: 'GET',
      });

      const response = await handler.handleRequest(request);
      const data = (await response.json()) as AdminStatusResponse;

      expect(data.hasStartPageToken).toBe(false);
    });

    it('should return sync statistics', async () => {
      stateManager.setState({
        startPageToken: 'token',
        lastSyncTime: '2025-11-14T12:00:00Z',
        filesProcessed: 250,
        errorCount: 7,
      });

      const request = new Request('http://localhost/admin/status', {
        method: 'GET',
      });

      const response = await handler.handleRequest(request);
      const data = (await response.json()) as AdminStatusResponse;

      expect(data.filesProcessed).toBe(250);
      expect(data.errorCount).toBe(7);
    });
  });

  describe('GET /admin/stats', () => {
    it('should return collection name and vector count', async () => {
      vectorClient.setCollectionInfo({
        name: 'custom_collection',
        status: 'green',
      });
      vectorClient.setVectorCount(1000);

      const request = new Request('http://localhost/admin/stats', {
        method: 'GET',
      });

      const response = await handler.handleRequest(request);
      const data = (await response.json()) as AdminStatsResponse;

      expect(response.status).toBe(200);
      expect(data.collection).toBe('custom_collection');
      expect(data.vectorCount).toBe(1000);
    });

    it('should return collection status', async () => {
      vectorClient.setCollectionInfo({
        name: 'project_docs',
        status: 'yellow',
      });

      const request = new Request('http://localhost/admin/stats', {
        method: 'GET',
      });

      const response = await handler.handleRequest(request);
      const data = (await response.json()) as AdminStatsResponse;

      expect(data.status).toBe('yellow');
    });

    it('should handle empty collection', async () => {
      vectorClient.setVectorCount(0);

      const request = new Request('http://localhost/admin/stats', {
        method: 'GET',
      });

      const response = await handler.handleRequest(request);
      const data = (await response.json()) as AdminStatsResponse;

      expect(data.vectorCount).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should return 500 with error message on exceptions', async () => {
      // Mock stateManager to throw error
      stateManager.getState = vi.fn().mockRejectedValue(new Error('KV error'));

      const request = new Request('http://localhost/admin/status', {
        method: 'GET',
      });

      const response = await handler.handleRequest(request);
      const data = (await response.json()) as AdminErrorResponse;

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal server error');
      expect(data.message).toContain('KV error');
    });

    it('should handle state manager failures', async () => {
      stateManager.acquireLock = vi.fn().mockRejectedValue(new Error('Lock acquisition failed'));

      const request = new Request('http://localhost/admin/resync', {
        method: 'POST',
      });

      const response = await handler.handleRequest(request);

      expect(response.status).toBe(500);
    });

    it('should handle vector client failures', async () => {
      vectorClient.getCollectionInfo = vi.fn().mockRejectedValue(new Error('Vector index error'));

      const request = new Request('http://localhost/admin/stats', {
        method: 'GET',
      });

      const response = await handler.handleRequest(request);
      const data = (await response.json()) as AdminErrorResponse;

      expect(response.status).toBe(500);
      expect(data.message).toContain('Vector index error');
    });

    it('should handle orchestrator failures during resync', async () => {
      orchestrator.runFullSync = vi.fn().mockRejectedValue(new Error('Sync error'));

      const request = new Request('http://localhost/admin/resync', {
        method: 'POST',
      });

      const response = await handler.handleRequest(request);
      const data = (await response.json()) as AdminErrorResponse;

      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal server error');
    });
  });

  describe('Response Format', () => {
    it('should return properly formatted JSON responses', async () => {
      const request = new Request('http://localhost/admin/status', {
        method: 'GET',
      });

      const response = await handler.handleRequest(request);

      expect(response.headers.get('Content-Type')).toBe('application/json');

      const data = (await response.json()) as AdminStatusResponse;
      expect(data).toBeDefined();
    });

    it('should pretty-print JSON responses', async () => {
      const request = new Request('http://localhost/admin/status', {
        method: 'GET',
      });

      const response = await handler.handleRequest(request);
      const text = await response.text();

      // Pretty-printed JSON should contain newlines and indentation
      expect(text).toContain('\n');
    });
  });
});
