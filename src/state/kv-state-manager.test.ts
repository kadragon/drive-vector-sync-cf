/**
 * Tests for KV State Manager
 *
 * Trace:
 *   spec_id: SPEC-state-management-1
 *   task_id: TASK-008
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KVStateManager, SyncState } from './kv-state-manager';

// Mock KVNamespace
class MockKVNamespace implements KVNamespace {
  private store = new Map<string, string>();

  async get(key: string, type?: 'text' | 'json'): Promise<any> {
    const value = this.store.get(key);
    if (!value) return null;
    if (type === 'json') return JSON.parse(value);
    return value;
  }

  async put(key: string, value: string, options?: any): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(): Promise<any> {
    return { keys: [] };
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
});
