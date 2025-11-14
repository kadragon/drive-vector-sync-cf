/**
 * Cloudflare Vectorize client adapter
 * Maintains same interface as QdrantClient for drop-in replacement
 *
 * Key differences from Qdrant:
 * - Uses KV-based file-to-vector-ID index for filter operations
 * - Collection creation handled via wrangler CLI (not runtime)
 * - No HNSW parameter tuning (Cloudflare-managed)
 *
 * Trace:
 *   spec_id: SPEC-vectorize-migration-1
 *   task_id: TASK-025
 */

import { withRetry } from '../errors/index.js';
import { parseVectorId } from './vector-id.js';
import { VectorStoreClient, VectorPoint } from '../types/vector-store.js';

/**
 * Vectorize client configuration
 */
export interface VectorizeConfig {
  index: VectorizeIndex;
  fileIndex: KVNamespace;
  collectionName: string; // Kept for interface compatibility
}

/**
 * Cloudflare Vectorize index interface
 * (Provided by Workers runtime)
 */
export interface VectorizeIndex {
  upsert(vectors: VectorizeVector[]): Promise<VectorizeUpsertResult>;
  deleteByIds(ids: string[]): Promise<VectorizeDeleteResult>;
  getByIds(ids: string[]): Promise<VectorizeMatch[]>;
  query(vector: number[], options?: VectorizeQueryOptions): Promise<VectorizeQueryResult>;
}

export interface VectorizeVector {
  id: string;
  values: number[];
  metadata?: Record<string, string | number | boolean>;
}

export interface VectorizeMatch {
  id: string;
  values?: number[];
  metadata?: Record<string, unknown>;
  score?: number;
}

export interface VectorizeUpsertResult {
  count: number;
  ids?: string[];
}

export interface VectorizeDeleteResult {
  count: number;
  ids?: string[];
}

export interface VectorizeQueryOptions {
  topK?: number;
  returnValues?: boolean;
  returnMetadata?: boolean | 'indexed' | 'all';
  filter?: Record<string, unknown>;
}

export interface VectorizeQueryResult {
  matches: VectorizeMatch[];
  count: number;
}

/**
 * Vectorize client wrapper with Qdrant-compatible interface
 *
 * Uses KV-based indexing to support filter operations:
 * - file:<fileId> → ["vectorId1", "vectorId2", ...]
 * - _vector_count → "12345"
 *
 * Implements VectorStoreClient for drop-in replacement of QdrantClient
 */
export class VectorizeClient implements VectorStoreClient {
  private index: VectorizeIndex;
  private fileIndex: KVNamespace;
  private collectionName: string;

  constructor(config: VectorizeConfig) {
    this.index = config.index;
    this.fileIndex = config.fileIndex;
    this.collectionName = config.collectionName;
  }

  /**
   * Initialize collection - NO-OP for Vectorize (done via CLI)
   *
   * Collection must be created before deployment:
   * wrangler vectorize create project-docs --dimensions=3072 --metric=cosine
   */
  async initializeCollection(vectorSize: number = 3072): Promise<void> {
    console.log(
      `Vectorize index '${this.collectionName}' managed via wrangler CLI (${vectorSize} dims)`
    );

    // Verify index is accessible by attempting a query
    try {
      await this.index.query([0], { topK: 1 });
      console.log(`Vectorize index '${this.collectionName}' is accessible`);
    } catch (error) {
      // Empty index will throw, but that's ok for initialization
      if ((error as Error).message?.includes('not found')) {
        console.warn(`Vectorize index '${this.collectionName}' may not exist yet`);
        console.warn(
          'Create it with: wrangler vectorize create project-docs --dimensions=3072 --metric=cosine'
        );
      }
    }
  }

  /**
   * Upsert vectors in batch with KV index maintenance
   */
  async upsertVectors(vectors: VectorPoint[]): Promise<void> {
    if (vectors.length === 0) {
      return;
    }

    // 1. Group vectors by file_id for KV index maintenance
    const vectorsByFile = new Map<string, string[]>();
    for (const v of vectors) {
      const fileId = v.payload.file_id;
      if (!vectorsByFile.has(fileId)) {
        vectorsByFile.set(fileId, []);
      }
      vectorsByFile.get(fileId)!.push(v.id);
    }

    // 2. Upsert to Vectorize
    try {
      await withRetry(async () => {
        await this.index.upsert(
          vectors.map(v => ({
            id: v.id,
            values: v.vector,
            metadata: {
              file_id: v.payload.file_id,
              file_name: v.payload.file_name,
              file_path: v.payload.file_path,
              chunk_index: v.payload.chunk_index,
              chunk_hash: v.payload.chunk_hash,
              last_modified: v.payload.last_modified,
              text: v.payload.text || '',
            },
          }))
        );
      });

      console.log(`Upserted ${vectors.length} vectors to Vectorize`);
    } catch (error) {
      throw new Error(`Failed to upsert vectors: ${(error as Error).message}`);
    }

    // 3. Update FILE_VECTOR_INDEX and track newly added IDs
    let totalNewVectors = 0;

    for (const [fileId, newIds] of vectorsByFile.entries()) {
      try {
        const key = `file:${fileId}`;

        // Merge with existing IDs (in case of partial updates)
        const existingJson = await this.fileIndex.get(key);
        const existingIds: string[] = existingJson ? JSON.parse(existingJson) : [];
        const mergedIds = Array.from(new Set([...existingIds, ...newIds]));

        // Calculate net-new vectors for this file
        const addedCount = mergedIds.length - existingIds.length;
        totalNewVectors += addedCount;

        await this.fileIndex.put(key, JSON.stringify(mergedIds), {
          expirationTtl: 86400 * 365, // 1 year
        });
      } catch (error) {
        console.error(`Failed to update KV index for file ${fileId}:`, error);
        // Continue processing other files even if one fails
      }
    }

    // 4. Update vector count with only net-new vectors
    await this.updateVectorCount(totalNewVectors);
  }

  /**
   * Get all vectors for a specific file using KV index
   */
  async getVectorsByFileId(fileId: string): Promise<VectorPoint[]> {
    try {
      // 1. Get vector IDs from KV index
      const key = `file:${fileId}`;
      const idsJson = await this.fileIndex.get(key);

      if (!idsJson) {
        // File not found in index
        return [];
      }

      const ids: string[] = JSON.parse(idsJson);

      if (ids.length === 0) {
        return [];
      }

      // 2. Fetch vectors from Vectorize
      const response = await withRetry(async () => {
        return await this.index.getByIds(ids);
      });

      // 3. Transform to VectorPoint format
      const vectors: VectorPoint[] = response.map((item: VectorizeMatch) => {
        const metadata = item.metadata as Record<string, string | number>;

        return {
          id: item.id,
          vector: item.values || [],
          payload: {
            file_id: (metadata.file_id as string) || '',
            file_name: (metadata.file_name as string) || '',
            file_path: (metadata.file_path as string) || '',
            chunk_index: (metadata.chunk_index as number) || 0,
            chunk_hash: (metadata.chunk_hash as string) || '',
            last_modified: (metadata.last_modified as string) || '',
            text: (metadata.text as string) || undefined,
          },
        };
      });

      return vectors;
    } catch (error) {
      throw new Error(`Failed to get vectors by file ID: ${(error as Error).message}`);
    }
  }

  /**
   * Delete specific vectors by their IDs with KV index cleanup
   */
  async deleteVectorsByIds(vectorIds: string[]): Promise<void> {
    if (vectorIds.length === 0) {
      return;
    }

    try {
      // 1. Delete from Vectorize
      await withRetry(async () => {
        await this.index.deleteByIds(vectorIds);
      });

      console.log(`Deleted ${vectorIds.length} vectors from Vectorize`);
    } catch (error) {
      throw new Error(`Failed to delete vectors by IDs: ${(error as Error).message}`);
    }

    // 2. Update KV index - remove these IDs from file entries
    // Extract file IDs from vector IDs
    const fileIds = new Set<string>();
    for (const vectorId of vectorIds) {
      try {
        const { fileId } = parseVectorId(vectorId);
        fileIds.add(fileId);
      } catch (error) {
        console.warn(`Failed to parse vector ID ${vectorId}:`, error);
      }
    }

    // 3. Update each file's KV index entry
    for (const fileId of fileIds) {
      try {
        const key = `file:${fileId}`;
        const idsJson = await this.fileIndex.get(key);

        if (idsJson) {
          const ids: string[] = JSON.parse(idsJson);
          const remainingIds = ids.filter(id => !vectorIds.includes(id));

          if (remainingIds.length > 0) {
            // Update with remaining IDs
            await this.fileIndex.put(key, JSON.stringify(remainingIds));
          } else {
            // All vectors deleted, remove file entry
            await this.fileIndex.delete(key);
          }
        }
      } catch (error) {
        console.error(`Failed to update KV index for file ${fileId}:`, error);
        // Continue processing other files
      }
    }

    // 4. Update vector count
    await this.updateVectorCount(-vectorIds.length);
  }

  /**
   * Delete all vectors for a file using KV index
   */
  async deleteVectorsByFileId(fileId: string): Promise<void> {
    try {
      // 1. Get vector IDs from KV
      const key = `file:${fileId}`;
      const idsJson = await this.fileIndex.get(key);

      if (!idsJson) {
        console.log(`No vectors found for file: ${fileId}`);
        return;
      }

      const ids: string[] = JSON.parse(idsJson);

      if (ids.length === 0) {
        // Empty entry, just delete it
        await this.fileIndex.delete(key);
        return;
      }

      // 2. Delete vectors from Vectorize
      await this.deleteVectorsByIds(ids);

      // Note: KV entry already deleted in deleteVectorsByIds
      console.log(`Deleted ${ids.length} vectors for file: ${fileId}`);
    } catch (error) {
      throw new Error(`Failed to delete vectors by file ID: ${(error as Error).message}`);
    }
  }

  /**
   * Get collection info - simulated via KV
   * (Vectorize doesn't expose collection metadata)
   */
  async getCollectionInfo(): Promise<unknown> {
    return {
      name: this.collectionName,
      points_count: await this.countVectors(),
      status: 'ready',
      vectors: {
        size: 3072,
        distance: 'Cosine',
      },
    };
  }

  /**
   * Count vectors - tracked in KV
   */
  async countVectors(): Promise<number> {
    try {
      const countStr = await this.fileIndex.get('_vector_count');
      return countStr ? parseInt(countStr, 10) : 0;
    } catch (error) {
      console.error('Failed to get vector count:', error);
      return 0;
    }
  }

  /**
   * Update vector count in KV
   * @private
   */
  private async updateVectorCount(delta: number): Promise<void> {
    try {
      const currentCount = await this.countVectors();
      const newCount = Math.max(0, currentCount + delta);
      await this.fileIndex.put('_vector_count', String(newCount));
    } catch (error) {
      console.error('Failed to update vector count:', error);
      // Non-critical, don't throw
    }
  }
}

/**
 * Re-export helper functions for convenience
 */
export { generateVectorId, parseVectorId } from './vector-id.js';
