/**
 * Tests for Vectorize client
 *
 * Trace:
 *   spec_id: SPEC-vectorize-migration-1
 *   task_id: TASK-026
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VectorizeClient } from './vectorize-client';
import type { VectorPoint } from '../types/vector-store';

describe('VectorizeClient', () => {
  let client: VectorizeClient;
  let mockIndex: any;
  let mockKV: any;
  let kvStore: Map<string, string>; // In-memory KV store for testing

  beforeEach(() => {
    vi.clearAllMocks();

    // In-memory KV store to simulate real KV behavior
    kvStore = new Map<string, string>();

    // Mock Vectorize index
    mockIndex = {
      upsert: vi.fn().mockResolvedValue({ count: 0, ids: [] }),
      deleteByIds: vi.fn().mockResolvedValue({ count: 0, ids: [] }),
      getByIds: vi.fn().mockResolvedValue([]),
      query: vi.fn().mockResolvedValue({ matches: [], count: 0 }),
    };

    // Mock KV namespace with in-memory store
    mockKV = {
      get: vi.fn().mockImplementation(async (key: string) => {
        return kvStore.get(key) || null;
      }),
      put: vi.fn().mockImplementation(async (key: string, value: string) => {
        kvStore.set(key, value);
      }),
      delete: vi.fn().mockImplementation(async (key: string) => {
        kvStore.delete(key);
      }),
    };

    client = new VectorizeClient({
      index: mockIndex,
      fileIndex: mockKV,
      collectionName: 'test-index',
    });
  });

  describe('TEST-vectorize-count-1: Vector count should only increment for net-new IDs', () => {
    it('should increment count by full batch size on first upsert', async () => {
      // Arrange: Empty KV (no existing vectors) - kvStore is already empty from beforeEach

      const vectors: VectorPoint[] = [
        {
          id: 'file1_0',
          vector: new Array(1536).fill(0.1),
          payload: {
            file_id: 'file1',
            file_name: 'test.txt',
            file_path: '/test.txt',
            chunk_index: 0,
            chunk_hash: 'hash1',
            last_modified: '2025-01-01T00:00:00Z',
          },
        },
        {
          id: 'file1_1',
          vector: new Array(1536).fill(0.2),
          payload: {
            file_id: 'file1',
            file_name: 'test.txt',
            file_path: '/test.txt',
            chunk_index: 1,
            chunk_hash: 'hash2',
            last_modified: '2025-01-01T00:00:00Z',
          },
        },
      ];

      // Act: First upsert
      await client.upsertVectors(vectors);

      // Assert: Count should be 2 (both vectors are new)
      const finalCount = await client.countVectors();
      expect(finalCount).toBe(2);

      // Verify KV put was called with "2"
      expect(mockKV.put).toHaveBeenCalledWith('_vector_count', '2');
    });

    it('should NOT increment count on re-upsert of same IDs', async () => {
      // Arrange: Simulate existing vectors in KV
      const existingIds = ['file1_0', 'file1_1'];
      kvStore.set('file:file1', JSON.stringify(existingIds));
      kvStore.set('_vector_count', '2');

      const vectors: VectorPoint[] = [
        {
          id: 'file1_0',
          vector: new Array(1536).fill(0.1),
          payload: {
            file_id: 'file1',
            file_name: 'test.txt',
            file_path: '/test.txt',
            chunk_index: 0,
            chunk_hash: 'hash1',
            last_modified: '2025-01-01T00:00:00Z',
          },
        },
        {
          id: 'file1_1',
          vector: new Array(1536).fill(0.2),
          payload: {
            file_id: 'file1',
            file_name: 'test.txt',
            file_path: '/test.txt',
            chunk_index: 1,
            chunk_hash: 'hash2',
            last_modified: '2025-01-01T00:00:00Z',
          },
        },
      ];

      // Act: Re-upsert same vectors
      await client.upsertVectors(vectors);

      // Assert: Count should remain 2 (no new vectors)
      const finalCount = await client.countVectors();
      expect(finalCount).toBe(2);

      // Verify KV put was called with "2" (not "4")
      const vectorCountPutCalls = (mockKV.put as any).mock.calls.filter(
        (call: any[]) => call[0] === '_vector_count'
      );
      const lastCountUpdate = vectorCountPutCalls[vectorCountPutCalls.length - 1];
      expect(lastCountUpdate[1]).toBe('2');
    });

    it('should increment count only for newly added IDs in partial update', async () => {
      // Arrange: Existing vectors
      const existingIds = ['file1_0', 'file1_1'];
      kvStore.set('file:file1', JSON.stringify(existingIds));
      kvStore.set('_vector_count', '2');

      const vectors: VectorPoint[] = [
        // Existing vector (should not increment)
        {
          id: 'file1_0',
          vector: new Array(1536).fill(0.1),
          payload: {
            file_id: 'file1',
            file_name: 'test.txt',
            file_path: '/test.txt',
            chunk_index: 0,
            chunk_hash: 'hash1',
            last_modified: '2025-01-01T00:00:00Z',
          },
        },
        // Existing vector (should not increment)
        {
          id: 'file1_1',
          vector: new Array(1536).fill(0.2),
          payload: {
            file_id: 'file1',
            file_name: 'test.txt',
            file_path: '/test.txt',
            chunk_index: 1,
            chunk_hash: 'hash2',
            last_modified: '2025-01-01T00:00:00Z',
          },
        },
        // New vector (should increment by 1)
        {
          id: 'file1_2',
          vector: new Array(1536).fill(0.3),
          payload: {
            file_id: 'file1',
            file_name: 'test.txt',
            file_path: '/test.txt',
            chunk_index: 2,
            chunk_hash: 'hash3',
            last_modified: '2025-01-01T00:00:00Z',
          },
        },
      ];

      // Act: Partial update (2 existing + 1 new)
      await client.upsertVectors(vectors);

      // Assert: Count should be 3 (2 + 1 new)
      const finalCount = await client.countVectors();
      expect(finalCount).toBe(3);

      // Verify final count update
      const vectorCountPutCalls = (mockKV.put as any).mock.calls.filter(
        (call: any[]) => call[0] === '_vector_count'
      );
      const lastCountUpdate = vectorCountPutCalls[vectorCountPutCalls.length - 1];
      expect(lastCountUpdate[1]).toBe('3');
    });

    it('should handle multiple files with mixed new/existing vectors', async () => {
      // Arrange: file1 has 2 existing vectors, file2 is new
      kvStore.set('file:file1', JSON.stringify(['file1_0', 'file1_1']));
      kvStore.set('_vector_count', '2');
      // file2 is new (not in kvStore)

      const vectors: VectorPoint[] = [
        // file1: existing vector
        {
          id: 'file1_0',
          vector: new Array(1536).fill(0.1),
          payload: {
            file_id: 'file1',
            file_name: 'test1.txt',
            file_path: '/test1.txt',
            chunk_index: 0,
            chunk_hash: 'hash1',
            last_modified: '2025-01-01T00:00:00Z',
          },
        },
        // file1: new vector
        {
          id: 'file1_2',
          vector: new Array(1536).fill(0.3),
          payload: {
            file_id: 'file1',
            file_name: 'test1.txt',
            file_path: '/test1.txt',
            chunk_index: 2,
            chunk_hash: 'hash3',
            last_modified: '2025-01-01T00:00:00Z',
          },
        },
        // file2: new vectors
        {
          id: 'file2_0',
          vector: new Array(1536).fill(0.4),
          payload: {
            file_id: 'file2',
            file_name: 'test2.txt',
            file_path: '/test2.txt',
            chunk_index: 0,
            chunk_hash: 'hash4',
            last_modified: '2025-01-01T00:00:00Z',
          },
        },
        {
          id: 'file2_1',
          vector: new Array(1536).fill(0.5),
          payload: {
            file_id: 'file2',
            file_name: 'test2.txt',
            file_path: '/test2.txt',
            chunk_index: 1,
            chunk_hash: 'hash5',
            last_modified: '2025-01-01T00:00:00Z',
          },
        },
      ];

      // Act: Upsert 4 vectors (1 existing + 1 new for file1, 2 new for file2)
      await client.upsertVectors(vectors);

      // Assert: Count should be 5 (2 existing + 3 new)
      const finalCount = await client.countVectors();
      expect(finalCount).toBe(5);

      // Verify final count update
      const vectorCountPutCalls = (mockKV.put as any).mock.calls.filter(
        (call: any[]) => call[0] === '_vector_count'
      );
      const lastCountUpdate = vectorCountPutCalls[vectorCountPutCalls.length - 1];
      expect(lastCountUpdate[1]).toBe('5');
    });
  });

  describe('Vector deletion tracking', () => {
    it('should decrement count when deleting vectors', async () => {
      // Arrange
      kvStore.set('file:file1', JSON.stringify(['file1_0', 'file1_1']));
      kvStore.set('_vector_count', '2');

      // Act: Delete 2 vectors
      await client.deleteVectorsByIds(['file1_0', 'file1_1']);

      // Assert: Count should be 0
      const finalCount = await client.countVectors();
      expect(finalCount).toBe(0);
    });
  });
});
