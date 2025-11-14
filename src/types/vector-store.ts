/**
 * Common interface for vector store clients
 * Implemented by both QdrantClient and VectorizeClient
 *
 * Trace:
 *   spec_id: SPEC-vectorize-migration-1
 *   task_id: TASK-025
 */

/**
 * Vector point structure shared between implementations
 */
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

/**
 * Common vector store client interface
 *
 * Both Qdrant and Vectorize clients implement this interface
 * to allow for drop-in replacement during migration
 */
export interface VectorStoreClient {
  /**
   * Initialize collection/index with proper schema
   */
  initializeCollection(vectorSize?: number): Promise<void>;

  /**
   * Upsert vectors in batch
   */
  upsertVectors(vectors: VectorPoint[]): Promise<void>;

  /**
   * Get all vectors for a specific file
   */
  getVectorsByFileId(fileId: string): Promise<VectorPoint[]>;

  /**
   * Delete specific vectors by their IDs
   */
  deleteVectorsByIds(vectorIds: string[]): Promise<void>;

  /**
   * Delete all vectors for a file
   */
  deleteVectorsByFileId(fileId: string): Promise<void>;

  /**
   * Get collection/index info
   */
  getCollectionInfo(): Promise<unknown>;

  /**
   * Count total vectors in collection/index
   */
  countVectors(): Promise<number>;
}
