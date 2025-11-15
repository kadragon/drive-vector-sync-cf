/**
 * Tests for KV State Manager
 *
 * Trace:
 *   spec_id: SPEC-state-management-1
 *   task_id: TASK-008
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { KVStateManager, SyncState } from './kv-state-manager';

// Mock KVNamespace
class MockKVNamespace {
  private store = new Map<string, string>();

  async get(key: string, type?: 'text' | 'json'): Promise<any> {
    const value = this.store.get(key);
    if (!value) return null;
    if (type === 'json') return JSON.parse(value);
    return value;
  }

  async put(key: string, value: string, _options?: any): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(options?: { prefix?: string }): Promise<any> {
    const keys = Array.from(this.store.keys())
      .filter(key => !options?.prefix || key.startsWith(options.prefix))
      .map(name => ({ name }));
    return { keys };
  }

  async getWithMetadata(): Promise<any> {
    return { value: null, metadata: null };
  }

  clear(): void {
    this.store.clear();
  }
}

describe('KVStateManager', () => {
  let kvNamespace: MockKVNamespace;
  let stateManager: KVStateManager;

  beforeEach(() => {
    kvNamespace = new MockKVNamespace();
    stateManager = new KVStateManager(kvNamespace as any);
  });

  describe('TEST-state-management-1: Initialize state on first run', () => {
    it('should return default state when no state exists', async () => {
      const state = await stateManager.getState();

      expect(state).toEqual({
        startPageToken: null,
        lastSyncTime: null,
        filesProcessed: 0,
        errorCount: 0,
      });
    });
  });

  describe('TEST-state-management-2: Save startPageToken after successful sync', () => {
    it('should save complete state', async () => {
      const newState: SyncState = {
        startPageToken: 'token123',
        lastSyncTime: '2025-11-13T00:00:00Z',
        filesProcessed: 10,
        errorCount: 2,
      };

      await stateManager.setState(newState);
      const retrievedState = await stateManager.getState();

      expect(retrievedState).toEqual(newState);
    });

    it('should update only startPageToken', async () => {
      // Set initial state
      await stateManager.setState({
        startPageToken: 'old-token',
        lastSyncTime: '2025-11-12T00:00:00Z',
        filesProcessed: 5,
        errorCount: 1,
      });

      // Update token
      await stateManager.updateStartPageToken('new-token');

      const state = await stateManager.getState();
      expect(state.startPageToken).toBe('new-token');
      expect(state.filesProcessed).toBe(5);
      expect(state.errorCount).toBe(1);
      expect(state.lastSyncTime).toBeDefined();
    });
  });

  describe('TEST-state-management-3: Load startPageToken on subsequent runs', () => {
    it('should load previously saved state', async () => {
      // Save state
      await stateManager.setState({
        startPageToken: 'token456',
        lastSyncTime: '2025-11-13T01:00:00Z',
        filesProcessed: 20,
        errorCount: 0,
      });

      // Create new manager instance (simulating restart)
      const newManager = new KVStateManager(kvNamespace as any);
      const state = await newManager.getState();

      expect(state.startPageToken).toBe('token456');
      expect(state.filesProcessed).toBe(20);
    });
  });

  describe('TEST-state-management-4: Handle missing KV namespace gracefully', () => {
    it('should handle get operation when KV returns null', async () => {
      const state = await stateManager.getState();
      expect(state).toBeDefined();
      expect(state.startPageToken).toBeNull();
    });
  });

  describe('Clear state on admin resync request', () => {
    it('should clear all state', async () => {
      // Set state
      await stateManager.setState({
        startPageToken: 'token789',
        lastSyncTime: '2025-11-13T02:00:00Z',
        filesProcessed: 15,
        errorCount: 3,
      });

      // Clear state
      await stateManager.clearState();

      // Verify state is reset
      const state = await stateManager.getState();
      expect(state.startPageToken).toBeNull();
      expect(state.lastSyncTime).toBeNull();
      expect(state.filesProcessed).toBe(0);
      expect(state.errorCount).toBe(0);
    });
  });

  describe('Lock management', () => {
    it('should acquire lock when not locked', async () => {
      const acquired = await stateManager.acquireLock();
      expect(acquired).toBe(true);
    });

    it('should not acquire lock when already locked', async () => {
      await stateManager.acquireLock();
      const acquired = await stateManager.acquireLock();
      expect(acquired).toBe(false);
    });

    it('should release lock', async () => {
      await stateManager.acquireLock();
      await stateManager.releaseLock();
      const acquired = await stateManager.acquireLock();
      expect(acquired).toBe(true);
    });

    it('should acquire lock after expiration time', async () => {
      // Mock old lock time (more than 30 minutes ago)
      const oldTime = Date.now() - 31 * 60 * 1000;
      await kvNamespace.put('sync_lock', oldTime.toString());

      const acquired = await stateManager.acquireLock();
      expect(acquired).toBe(true);
    });
  });

  describe('Update stats', () => {
    it('should increment filesProcessed and errorCount', async () => {
      await stateManager.setState({
        startPageToken: 'token',
        lastSyncTime: '2025-11-13T00:00:00Z',
        filesProcessed: 10,
        errorCount: 2,
      });

      await stateManager.updateStats(5, 1);

      const state = await stateManager.getState();
      expect(state.filesProcessed).toBe(15);
      expect(state.errorCount).toBe(3);
    });
  });

  describe('isLocked (TASK-028)', () => {
    it('should return false when no lock exists', async () => {
      const locked = await stateManager.isLocked();
      expect(locked).toBe(false);
    });

    it('should return true when lock is active', async () => {
      await stateManager.acquireLock();
      const locked = await stateManager.isLocked();
      expect(locked).toBe(true);
    });

    it('should return false when lock is expired', async () => {
      // Set expired lock (31 minutes ago)
      const oldTime = Date.now() - 31 * 60 * 1000;
      await kvNamespace.put('sync_lock', oldTime.toString());

      const locked = await stateManager.isLocked();
      expect(locked).toBe(false);
    });
  });

  describe('updateSyncDuration (TASK-028)', () => {
    it('should update lastSyncDuration in state', async () => {
      await stateManager.setState({
        startPageToken: 'token',
        lastSyncTime: '2025-11-15T00:00:00Z',
        filesProcessed: 10,
        errorCount: 0,
      });

      await stateManager.updateSyncDuration(45000);

      const state = await stateManager.getState();
      expect(state.lastSyncDuration).toBe(45000);
    });
  });

  describe('saveSyncHistory and getSyncHistory (TASK-028)', () => {
    it('should save and retrieve sync history', async () => {
      const entry = {
        timestamp: '2025-11-15T01:00:00Z',
        filesProcessed: 10,
        vectorsUpserted: 15,
        vectorsDeleted: 0,
        duration: 45000,
        errors: [],
      };

      await stateManager.saveSyncHistory(entry);
      const history = await stateManager.getSyncHistory();

      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(entry);
    });

    it('should sort history by timestamp (newest first)', async () => {
      const entry1 = {
        timestamp: '2025-11-15T01:00:00Z',
        filesProcessed: 10,
        vectorsUpserted: 15,
        vectorsDeleted: 0,
        duration: 45000,
        errors: [],
      };

      const entry2 = {
        timestamp: '2025-11-15T02:00:00Z',
        filesProcessed: 5,
        vectorsUpserted: 8,
        vectorsDeleted: 1,
        duration: 30000,
        errors: [],
      };

      await stateManager.saveSyncHistory(entry1);
      await stateManager.saveSyncHistory(entry2);

      const history = await stateManager.getSyncHistory();

      expect(history).toHaveLength(2);
      expect(history[0].timestamp).toBe('2025-11-15T02:00:00Z');
      expect(history[1].timestamp).toBe('2025-11-15T01:00:00Z');
    });

    it('should limit history results', async () => {
      // Add 5 entries
      for (let i = 0; i < 5; i++) {
        await stateManager.saveSyncHistory({
          timestamp: new Date(2025, 10, 15, i).toISOString(),
          filesProcessed: i,
          vectorsUpserted: i * 2,
          vectorsDeleted: 0,
          duration: 30000,
          errors: [],
        });
      }

      const history = await stateManager.getSyncHistory(3);
      expect(history).toHaveLength(3);
    });

    it('should maintain rolling window of max 30 entries', async () => {
      // Add 35 entries
      for (let i = 0; i < 35; i++) {
        await stateManager.saveSyncHistory({
          timestamp: new Date(2025, 10, 15, 0, i).toISOString(),
          filesProcessed: i,
          vectorsUpserted: i * 2,
          vectorsDeleted: 0,
          duration: 30000,
          errors: [],
        });
      }

      const history = await stateManager.getSyncHistory(100);

      // Should have exactly 30 entries (not more)
      expect(history.length).toBe(30);

      // Should keep the newest 30 entries (filesProcessed 5-34)
      // Sorted newest first, so first entry should be filesProcessed=34
      expect(history[0].filesProcessed).toBe(34);
      expect(history[29].filesProcessed).toBe(5);

      // Oldest entries (0-4) should be deleted
      const oldestExist = history.some(h => h.filesProcessed < 5);
      expect(oldestExist).toBe(false);
    });
  });
});
