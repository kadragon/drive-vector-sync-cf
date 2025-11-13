/**
 * Qdrant client for vector operations
 *
 * Trace:
 *   spec_id: SPEC-qdrant-sync-1
 *   task_id: TASK-006, TASK-007
 */

import { QdrantClient as QdrantRestClient } from '@qdrant/js-client-rest';
import { QdrantError } from '../errors/index.js';
import { withRetry } from '../errors/index.js';

export interface VectorPoint {
  id: string;
  vector: number[];
  payload: {
    file_id: string;
    file_name: string;
    file_path: string;
    chunk_index: number;
    chunk_hash: string;
    last_modified: string;
    text?: string;
  };
}

export interface QdrantConfig {
  url: string;
  apiKey: string;
  collectionName: string;
}

/**
 * Qdrant client wrapper with error handling
 */
export class QdrantClient {
  private client: QdrantRestClient;
  private collectionName: string;

  constructor(config: QdrantConfig) {
    this.client = new QdrantRestClient({
      url: config.url,
      apiKey: config.apiKey,
    });
    this.collectionName = config.collectionName;
  }

  /**
   * Initialize collection with proper schema
   */
  async initializeCollection(vectorSize: number = 3072): Promise<void> {
    try {
      // Check if collection exists
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(c => c.name === this.collectionName);

      if (exists) {
        console.log(`Collection ${this.collectionName} already exists`);
        return;
      }

      // Create collection
      await withRetry(async () => {
        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: vectorSize,
            distance: 'Cosine',
          },
          optimizers_config: {
            default_segment_number: 2,
          },
          hnsw_config: {
            m: 16,
            ef_construct: 200,
          },
        });
      });

      console.log(`Collection ${this.collectionName} created successfully`);
    } catch (error) {
      throw new QdrantError('Failed to initialize collection', {
        collectionName: this.collectionName,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Upsert vectors in batch
   */
  async upsertVectors(vectors: VectorPoint[]): Promise<void> {
    if (vectors.length === 0) {
      return;
    }

    try {
      await withRetry(async () => {
        await this.client.upsert(this.collectionName, {
          wait: true,
          points: vectors.map(v => ({
            id: v.id,
            vector: v.vector,
            payload: v.payload,
          })),
        });
      });

      console.log(`Upserted ${vectors.length} vectors to Qdrant`);
    } catch (error) {
      throw new QdrantError('Failed to upsert vectors', {
        vectorCount: vectors.length,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get all vectors for a specific file
   */
  async getVectorsByFileId(fileId: string): Promise<VectorPoint[]> {
    try {
      const response = await withRetry(async () => {
        return await this.client.scroll(this.collectionName, {
          filter: {
            must: [
              {
                key: 'file_id',
                match: {
                  value: fileId,
                },
              },
            ],
          },
          with_payload: true,
          with_vector: true,
          limit: 1000, // Max chunks per file (should be sufficient)
        });
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vectors: VectorPoint[] = response.points.map((point: any) => ({
        id: point.id as string,
        vector: point.vector as number[],
        payload: point.payload as VectorPoint['payload'],
      }));

      return vectors;
    } catch (error) {
      throw new QdrantError('Failed to get vectors by file ID', {
        fileId,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Delete all vectors for a file
   */
  async deleteVectorsByFileId(fileId: string): Promise<void> {
    try {
      await withRetry(async () => {
        await this.client.delete(this.collectionName, {
          wait: true,
          filter: {
            must: [
              {
                key: 'file_id',
                match: {
                  value: fileId,
                },
              },
            ],
          },
        });
      });

      console.log(`Deleted vectors for file: ${fileId}`);
    } catch (error) {
      throw new QdrantError('Failed to delete vectors', {
        fileId,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get collection info
   */
  async getCollectionInfo(): Promise<unknown> {
    try {
      return await this.client.getCollection(this.collectionName);
    } catch (error) {
      throw new QdrantError('Failed to get collection info', {
        collectionName: this.collectionName,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Count vectors in collection
   */
  async countVectors(): Promise<number> {
    try {
      const info = await this.getCollectionInfo();
      return (info as { points_count?: number }).points_count || 0;
    } catch (error) {
      throw new QdrantError('Failed to count vectors', {
        error: (error as Error).message,
      });
    }
  }
}

/**
 * Generate vector ID from file ID and chunk index
 */
export function generateVectorId(fileId: string, chunkIndex: number): string {
  return `${fileId}_${chunkIndex}`;
}

/**
 * Parse vector ID to extract file ID and chunk index
 */
export function parseVectorId(vectorId: string): { fileId: string; chunkIndex: number } {
  const lastUnderscoreIndex = vectorId.lastIndexOf('_');
  const fileId = vectorId.substring(0, lastUnderscoreIndex);
  const chunkIndexStr = vectorId.substring(lastUnderscoreIndex + 1);
  return {
    fileId,
    chunkIndex: parseInt(chunkIndexStr, 10),
  };
}
