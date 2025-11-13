/**
 * Tests for Qdrant client
 *
 * Trace:
 *   spec_id: SPEC-qdrant-sync-1
 *   task_id: TASK-006, TASK-007
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QdrantClient, generateVectorId, parseVectorId } from './qdrant-client';
import type { VectorPoint } from './qdrant-client';

// Mock QdrantClient from SDK
vi.mock('@qdrant/js-client-rest', () => {
  return {
    QdrantClient: vi.fn().mockImplementation(() => ({
      getCollections: vi.fn().mockResolvedValue({ collections: [] }),
      createCollection: vi.fn().mockResolvedValue({}),
      upsert: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      getCollection: vi.fn().mockResolvedValue({
        name: 'test_collection',
        points_count: 100,
        status: 'green',
      }),
    })),
  };
});

describe('Qdrant Client', () => {
  let client: QdrantClient;
  let mockQdrantClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

    client = new QdrantClient({
      url: 'http://localhost:6333',
      apiKey: 'test-key',
      collectionName: 'test_collection',
    });

    // Get reference to mocked client
    mockQdrantClient = (client as any).client;
  });

  describe('TEST-qdrant-sync-1: Initialize Qdrant collection with correct schema', () => {
    it('should create collection if it does not exist', async () => {
      mockQdrantClient.getCollections.mockResolvedValue({ collections: [] });

      await client.initializeCollection(3072);

      expect(mockQdrantClient.createCollection).toHaveBeenCalledWith(
        'test_collection',
        expect.objectContaining({
          vectors: {
            size: 3072,
            distance: 'Cosine',
          },
        })
      );
    });

    it('should not create collection if it already exists', async () => {
      mockQdrantClient.getCollections.mockResolvedValue({
        collections: [{ name: 'test_collection' }],
      });

      await client.initializeCollection(3072);

      expect(mockQdrantClient.createCollection).not.toHaveBeenCalled();
    });

    it('should use correct HNSW config', async () => {
      mockQdrantClient.getCollections.mockResolvedValue({ collections: [] });

      await client.initializeCollection(3072);

      expect(mockQdrantClient.createCollection).toHaveBeenCalledWith(
        'test_collection',
        expect.objectContaining({
          hnsw_config: {
            m: 16,
            ef_construct: 200,
          },
        })
      );
    });
  });

  describe('TEST-qdrant-sync-2: Upsert single-chunk file vector with metadata', () => {
    it('should upsert single vector with metadata', async () => {
      const vector: VectorPoint = {
        id: 'file123_0',
        vector: new Array(3072).fill(0.1),
        payload: {
          file_id: 'file123',
          file_name: 'test.md',
          file_path: 'docs/test.md',
          chunk_index: 0,
          last_modified: '2025-11-13T00:00:00Z',
          text: 'Test content',
        },
      };

      await client.upsertVectors([vector]);

      expect(mockQdrantClient.upsert).toHaveBeenCalledWith('test_collection', {
        wait: true,
        points: [
          {
            id: 'file123_0',
            vector: expect.any(Array),
            payload: expect.objectContaining({
              file_id: 'file123',
              file_name: 'test.md',
              chunk_index: 0,
            }),
          },
        ],
      });
    });
  });

  describe('TEST-qdrant-sync-3: Upsert multi-chunk file vectors', () => {
    it('should upsert multiple vectors with sequential indices', async () => {
      const vectors: VectorPoint[] = [
        {
          id: 'file456_0',
          vector: new Array(3072).fill(0.1),
          payload: {
            file_id: 'file456',
            file_name: 'long.md',
            file_path: 'docs/long.md',
            chunk_index: 0,
            last_modified: '2025-11-13T00:00:00Z',
          },
        },
        {
          id: 'file456_1',
          vector: new Array(3072).fill(0.2),
          payload: {
            file_id: 'file456',
            file_name: 'long.md',
            file_path: 'docs/long.md',
            chunk_index: 1,
            last_modified: '2025-11-13T00:00:00Z',
          },
        },
        {
          id: 'file456_2',
          vector: new Array(3072).fill(0.3),
          payload: {
            file_id: 'file456',
            file_name: 'long.md',
            file_path: 'docs/long.md',
            chunk_index: 2,
            last_modified: '2025-11-13T00:00:00Z',
          },
        },
      ];

      await client.upsertVectors(vectors);

      expect(mockQdrantClient.upsert).toHaveBeenCalledWith('test_collection', {
        wait: true,
        points: expect.arrayContaining([
          expect.objectContaining({ id: 'file456_0' }),
          expect.objectContaining({ id: 'file456_1' }),
          expect.objectContaining({ id: 'file456_2' }),
        ]),
      });
    });
  });

  describe('TEST-qdrant-sync-4: Delete all vectors for a given file_id', () => {
    it('should delete vectors by file_id filter', async () => {
      await client.deleteVectorsByFileId('file789');

      expect(mockQdrantClient.delete).toHaveBeenCalledWith('test_collection', {
        wait: true,
        filter: {
          must: [
            {
              key: 'file_id',
              match: {
                value: 'file789',
              },
            },
          ],
        },
      });
    });
  });

  describe('TEST-qdrant-sync-5: Batch upsert multiple vectors efficiently', () => {
    it('should handle large batch of vectors', async () => {
      const vectors: VectorPoint[] = Array.from({ length: 100 }, (_, i) => ({
        id: `file_${i}`,
        vector: new Array(3072).fill(Math.random()),
        payload: {
          file_id: `file_${i}`,
          file_name: `test_${i}.md`,
          file_path: `docs/test_${i}.md`,
          chunk_index: 0,
          last_modified: '2025-11-13T00:00:00Z',
        },
      }));

      await client.upsertVectors(vectors);

      expect(mockQdrantClient.upsert).toHaveBeenCalledWith(
        'test_collection',
        expect.objectContaining({
          points: expect.arrayContaining([expect.any(Object)]),
        })
      );

      const call = mockQdrantClient.upsert.mock.calls[0];
      expect(call[1].points).toHaveLength(100);
    });

    it('should handle empty vector array', async () => {
      await client.upsertVectors([]);

      expect(mockQdrantClient.upsert).not.toHaveBeenCalled();
    });
  });

  describe('Collection info and stats', () => {
    it('should get collection info', async () => {
      const info = await client.getCollectionInfo();

      expect(info).toBeDefined();
      expect(info.name).toBe('test_collection');
      expect(mockQdrantClient.getCollection).toHaveBeenCalledWith('test_collection');
    });

    it('should count vectors', async () => {
      const count = await client.countVectors();

      expect(count).toBe(100);
    });
  });
});

describe('TEST-qdrant-sync-6: Vector ID generation', () => {
  describe('generateVectorId', () => {
    it('should generate correct vector ID format', () => {
      const id = generateVectorId('file123', 0);
      expect(id).toBe('file123_0');
    });

    it('should handle multi-chunk indices', () => {
      const id1 = generateVectorId('file456', 5);
      const id2 = generateVectorId('file456', 99);

      expect(id1).toBe('file456_5');
      expect(id2).toBe('file456_99');
    });

    it('should handle file IDs with special characters', () => {
      const id = generateVectorId('file-abc_123', 2);
      expect(id).toBe('file-abc_123_2');
    });
  });

  describe('parseVectorId', () => {
    it('should parse vector ID correctly', () => {
      const parsed = parseVectorId('file123_0');

      expect(parsed.fileId).toBe('file123');
      expect(parsed.chunkIndex).toBe(0);
    });

    it('should parse multi-chunk indices', () => {
      const parsed = parseVectorId('file456_42');

      expect(parsed.fileId).toBe('file456');
      expect(parsed.chunkIndex).toBe(42);
    });

    it('should handle file IDs with underscores', () => {
      const parsed = parseVectorId('file_abc_123_5');

      // Will split on first underscore from the end
      expect(parsed.fileId).toBe('file_abc_123');
      expect(parsed.chunkIndex).toBe(5);
    });
  });

  describe('Round-trip', () => {
    it('should maintain ID through generate and parse', () => {
      const fileId = 'test-file-123';
      const chunkIndex = 7;

      const vectorId = generateVectorId(fileId, chunkIndex);
      const parsed = parseVectorId(vectorId);

      expect(parsed.fileId).toBe(fileId);
      expect(parsed.chunkIndex).toBe(chunkIndex);
    });
  });
});
