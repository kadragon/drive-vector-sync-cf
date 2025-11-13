/**
 * Core type definitions for the sync system
 */

/**
 * Google Drive file metadata
 */
export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  parents?: string[];
  path?: string;
}

/**
 * Change type from Drive changes API
 */
export enum ChangeType {
  Added = 'added',
  Modified = 'modified',
  Deleted = 'deleted',
}

/**
 * Drive file change event
 */
export interface DriveChange {
  fileId: string;
  changeType: ChangeType;
  file?: DriveFileMetadata;
}

/**
 * Text chunk with metadata
 */
export interface TextChunk {
  text: string;
  index: number;
  tokenCount: number;
}

/**
 * Embedding result
 */
export interface EmbeddingResult {
  fileId: string;
  chunkIndex: number;
  vector: number[];
  metadata: VectorMetadata;
}

/**
 * Vector metadata stored in Qdrant
 */
export interface VectorMetadata {
  file_id: string;
  path: string;
  chunk_index: number;
  last_modified: string;
  file_name: string;
}

/**
 * Sync state stored in KV
 */
export interface SyncState {
  startPageToken: string | null;
  lastRunAt: string | null;
  filesProcessed: number;
  errors: string[];
}

/**
 * Sync result summary
 */
export interface SyncResult {
  success: boolean;
  filesProcessed: number;
  vectorsUpserted: number;
  vectorsDeleted: number;
  errors: string[];
  duration: number;
}
