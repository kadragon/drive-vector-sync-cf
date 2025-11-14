/**
 * Shared Cloudflare Vectorize type definitions
 * Used across index.ts and vectorize-client.ts
 *
 * Trace:
 *   spec_id: SPEC-vectorize-migration-1
 *   task_id: TASK-027
 */

/**
 * Cloudflare Vectorize Index interface
 * (Provided by Workers runtime binding)
 */
export interface VectorizeIndex {
  upsert(vectors: VectorizeVector[]): Promise<VectorizeUpsertResult>;
  deleteByIds(ids: string[]): Promise<VectorizeDeleteResult>;
  getByIds(ids: string[]): Promise<VectorizeMatch[]>;
  query(vector: number[], options?: VectorizeQueryOptions): Promise<VectorizeQueryResult>;
}

/**
 * Vector data structure for upserting to Vectorize
 */
export interface VectorizeVector {
  id: string;
  values: number[];
  metadata?: Record<string, string | number | boolean>;
}

/**
 * Vector match result from Vectorize queries or getByIds
 */
export interface VectorizeMatch {
  id: string;
  values?: number[];
  metadata?: Record<string, unknown>;
  score?: number;
}

/**
 * Result from Vectorize upsert operation
 */
export interface VectorizeUpsertResult {
  count: number;
  ids?: string[];
}

/**
 * Result from Vectorize delete operation
 */
export interface VectorizeDeleteResult {
  count: number;
  ids?: string[];
}

/**
 * Options for Vectorize query operations
 */
export interface VectorizeQueryOptions {
  topK?: number;
  returnValues?: boolean;
  returnMetadata?: boolean | 'indexed' | 'all';
  filter?: Record<string, unknown>;
}

/**
 * Result from Vectorize query operation
 */
export interface VectorizeQueryResult {
  matches: VectorizeMatch[];
  count: number;
}
