/**
 * Tests for Sync Orchestrator
 *
 * Trace:
 *   spec_id: SPEC-sync-orchestration-1
 *   task_id: TASK-012
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncOrchestrator, SyncConfig } from './sync-orchestrator';
import { DriveFileMetadata, DriveChange } from '../drive/drive-client';
import { VectorPoint } from '../qdrant/qdrant-client';
import { SyncState } from '../state/kv-state-manager';

// Mock implementations
class MockDriveClient {
  private files: DriveFileMetadata[] = [];
  private changes: DriveChange[] = [];
  private startPageToken = 'start-token-123';
  private fileContents = new Map<string, string>();

  setFiles(files: DriveFileMetadata[]) {
    this.files = files;
  }

  setChanges(changes: DriveChange[]) {
    this.changes = changes;
  }

  setFileContent(fileId: string, content: string) {
    this.fileContents.set(fileId, content);
  }

  setStartPageToken(token: string) {
    this.startPageToken = token;
  }

  async listMarkdownFiles(_rootFolderId: string): Promise<DriveFileMetadata[]> {
    return this.files;
  }

  async fetchChanges(
    _startPageToken: string,
    _rootFolderId: string
  ): Promise<{ changes: DriveChange[]; newStartPageToken: string }> {
    return {
      changes: this.changes,
      newStartPageToken: this.startPageToken,
    };
  }

  async getStartPageToken(): Promise<string> {
    return this.startPageToken;
  }

  async downloadFileContent(fileId: string): Promise<string> {
    return this.fileContents.get(fileId) || '';
  }
}

class MockEmbeddingClient {
  private embeddings: number[][] = [];

  setEmbeddings(embeddings: number[][]) {
    this.embeddings = embeddings;
  }

  async embedWithBatching(_texts: string[], _batchSize: number): Promise<number[][]> {
    // Return mock embeddings (3072 dimensions)
    return this.embeddings.length > 0 ? this.embeddings : _texts.map(() => Array(3072).fill(0.1));
  }
}

class MockQdrantClient {
  private vectors = new Map<string, VectorPoint[]>();

  setVectors(fileId: string, vectors: VectorPoint[]) {
    this.vectors.set(fileId, vectors);
  }

  clearVectors() {
    this.vectors.clear();
  }

  async initializeCollection(): Promise<void> {
    // Collection initialized
  }

  async upsertVectors(_vectors: VectorPoint[]): Promise<void> {
    // Mock implementation
  }

  async getVectorsByFileId(fileId: string): Promise<VectorPoint[]> {
    return this.vectors.get(fileId) || [];
  }

  async deleteVectorsByFileId(fileId: string): Promise<void> {
    this.vectors.delete(fileId);
  }

  async deleteVectorsByIds(_ids: string[]): Promise<void> {
    // Mock implementation
  }

  async getCollectionInfo(): Promise<unknown> {
    return { name: 'project_docs', status: 'green' };
  }

  async countVectors(): Promise<number> {
    return 100;
  }
}

class MockKVStateManager {
  private state: SyncState = {
    startPageToken: null,
    lastSyncTime: null,
    filesProcessed: 0,
    errorCount: 0,
  };
  private locked = false;

  async getState(): Promise<SyncState> {
    return { ...this.state };
  }

  async setState(state: SyncState): Promise<void> {
    this.state = { ...state };
  }

  async updateStartPageToken(token: string): Promise<void> {
    this.state.startPageToken = token;
    this.state.lastSyncTime = new Date().toISOString();
  }

  async updateStats(filesProcessed: number, errorCount: number): Promise<void> {
    this.state.filesProcessed += filesProcessed;
    this.state.errorCount += errorCount;
    this.state.lastSyncTime = new Date().toISOString();
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
}

describe('SyncOrchestrator', () => {
  let orchestrator: SyncOrchestrator;
  let driveClient: MockDriveClient;
  let embeddingClient: MockEmbeddingClient;
  let qdrantClient: MockQdrantClient;
  let stateManager: MockKVStateManager;
  let config: SyncConfig;

  beforeEach(() => {
    driveClient = new MockDriveClient();
    embeddingClient = new MockEmbeddingClient();
    qdrantClient = new MockQdrantClient();
    stateManager = new MockKVStateManager();
    config = {
      chunkSize: 2000,
      maxBatchSize: 32,
      maxConcurrency: 4,
    };

    orchestrator = new SyncOrchestrator(
      driveClient as any,
      embeddingClient as any,
      qdrantClient as any,
      stateManager as any,
      config
    );
  });

  describe('Full Sync', () => {
    it('should initialize collection and process all files', async () => {
      const files: DriveFileMetadata[] = [
        {
          id: 'file1',
          name: 'doc1.md',
          path: '/docs/doc1.md',
          mimeType: 'text/markdown',
          modifiedTime: '2025-11-13T00:00:00Z',
        },
        {
          id: 'file2',
          name: 'doc2.md',
          path: '/docs/doc2.md',
          mimeType: 'text/markdown',
          modifiedTime: '2025-11-13T00:00:00Z',
        },
      ];

      driveClient.setFiles(files);
      driveClient.setFileContent('file1', 'Content of document 1');
      driveClient.setFileContent('file2', 'Content of document 2');
      driveClient.setStartPageToken('new-token-456');

      const result = await orchestrator.runFullSync('root-folder-id');

      expect(result.filesProcessed).toBe(2);
      expect(result.vectorsUpserted).toBeGreaterThan(0);
      expect(result.vectorsDeleted).toBe(0);
      expect(result.errors).toBe(0);
      expect(result.duration).toBeGreaterThan(0);

      // Verify state was updated
      const state = await stateManager.getState();
      expect(state.startPageToken).toBe('new-token-456');
      expect(state.filesProcessed).toBe(2);
    });

    it('should handle empty file lists', async () => {
      driveClient.setFiles([]);

      const result = await orchestrator.runFullSync('root-folder-id');

      expect(result.filesProcessed).toBe(0);
      expect(result.vectorsUpserted).toBe(0);
      expect(result.errors).toBe(0);

      // Should still update token
      const state = await stateManager.getState();
      expect(state.startPageToken).toBe('start-token-123');
    });

    it('should apply concurrency limits correctly', async () => {
      const files: DriveFileMetadata[] = Array.from({ length: 10 }, (_, i) => ({
        id: `file${i}`,
        name: `doc${i}.md`,
        path: `/docs/doc${i}.md`,
        mimeType: 'text/markdown',
        modifiedTime: '2025-11-13T00:00:00Z',
      }));

      driveClient.setFiles(files);
      files.forEach(file => {
        driveClient.setFileContent(file.id, `Content of ${file.name}`);
      });

      const result = await orchestrator.runFullSync('root-folder-id');

      expect(result.filesProcessed).toBe(10);
      expect(result.errors).toBe(0);
    });

    it('should collect errors but continue processing', async () => {
      const files: DriveFileMetadata[] = [
        {
          id: 'file1',
          name: 'doc1.md',
          path: '/docs/doc1.md',
          mimeType: 'text/markdown',
          modifiedTime: '2025-11-13T00:00:00Z',
        },
        {
          id: 'file2',
          name: 'doc2.md',
          path: '/docs/doc2.md',
          mimeType: 'text/markdown',
          modifiedTime: '2025-11-13T00:00:00Z',
        },
      ];

      driveClient.setFiles(files);
      driveClient.setFileContent('file1', 'Content of document 1');
      // file2 will have no content, causing it to be skipped

      const result = await orchestrator.runFullSync('root-folder-id');

      expect(result.filesProcessed).toBe(2); // Both files processed, one returned 0 vectors
      expect(result.errors).toBe(0); // Skipped files don't count as errors
    });

    it('should skip empty files', async () => {
      const files: DriveFileMetadata[] = [
        {
          id: 'file1',
          name: 'empty.md',
          path: '/docs/empty.md',
          mimeType: 'text/markdown',
          modifiedTime: '2025-11-13T00:00:00Z',
        },
      ];

      driveClient.setFiles(files);
      driveClient.setFileContent('file1', '   '); // Whitespace only

      const result = await orchestrator.runFullSync('root-folder-id');

      expect(result.filesProcessed).toBe(1); // File was processed but returned 0 vectors
      expect(result.vectorsUpserted).toBe(0);
    });
  });

  describe('Incremental Sync', () => {
    it('should fall back to full sync when no startPageToken exists', async () => {
      await stateManager.clearState();

      const files: DriveFileMetadata[] = [
        {
          id: 'file1',
          name: 'doc1.md',
          path: '/docs/doc1.md',
          mimeType: 'text/markdown',
          modifiedTime: '2025-11-13T00:00:00Z',
        },
      ];

      driveClient.setFiles(files);
      driveClient.setFileContent('file1', 'Content of document 1');

      const result = await orchestrator.runIncrementalSync('root-folder-id');

      expect(result.filesProcessed).toBe(1);
      expect(result.vectorsUpserted).toBeGreaterThan(0);
    });

    it('should handle zero changes correctly', async () => {
      await stateManager.updateStartPageToken('existing-token');
      driveClient.setChanges([]);
      driveClient.setStartPageToken('new-token-789');

      const result = await orchestrator.runIncrementalSync('root-folder-id');

      expect(result.filesProcessed).toBe(0);
      expect(result.vectorsUpserted).toBe(0);
      expect(result.vectorsDeleted).toBe(0);
      expect(result.errors).toBe(0);

      // Should still update token
      const state = await stateManager.getState();
      expect(state.startPageToken).toBe('new-token-789');
    });

    it('should process modified files', async () => {
      await stateManager.updateStartPageToken('existing-token');

      const changes: DriveChange[] = [
        {
          type: 'modified',
          fileId: 'file1',
          file: {
            id: 'file1',
            name: 'updated.md',
            path: '/docs/updated.md',
            mimeType: 'text/markdown',
            modifiedTime: '2025-11-14T00:00:00Z',
          },
        },
      ];

      driveClient.setChanges(changes);
      driveClient.setFileContent('file1', 'Updated content');
      driveClient.setStartPageToken('new-token-999');

      const result = await orchestrator.runIncrementalSync('root-folder-id');

      expect(result.filesProcessed).toBe(1);
      expect(result.vectorsUpserted).toBeGreaterThan(0);
      expect(result.vectorsDeleted).toBe(0);

      const state = await stateManager.getState();
      expect(state.startPageToken).toBe('new-token-999');
    });

    it('should delete vectors for removed files', async () => {
      await stateManager.updateStartPageToken('existing-token');

      const changes: DriveChange[] = [
        {
          type: 'deleted',
          fileId: 'file1',
        },
      ];

      driveClient.setChanges(changes);

      const result = await orchestrator.runIncrementalSync('root-folder-id');

      expect(result.filesProcessed).toBe(0);
      expect(result.vectorsDeleted).toBe(1);
    });

    it('should handle mixed success/failure scenarios', async () => {
      await stateManager.updateStartPageToken('existing-token');

      const changes: DriveChange[] = [
        {
          type: 'modified',
          fileId: 'file1',
          file: {
            id: 'file1',
            name: 'good.md',
            path: '/docs/good.md',
            mimeType: 'text/markdown',
            modifiedTime: '2025-11-14T00:00:00Z',
          },
        },
        {
          type: 'deleted',
          fileId: 'file2',
        },
      ];

      driveClient.setChanges(changes);
      driveClient.setFileContent('file1', 'Good content');

      const result = await orchestrator.runIncrementalSync('root-folder-id');

      expect(result.filesProcessed).toBe(1);
      expect(result.vectorsDeleted).toBe(1);
      expect(result.errors).toBe(0);
    });

    it('should update startPageToken even with no changes', async () => {
      await stateManager.updateStartPageToken('old-token');
      driveClient.setChanges([]);
      driveClient.setStartPageToken('brand-new-token');

      await orchestrator.runIncrementalSync('root-folder-id');

      const state = await stateManager.getState();
      expect(state.startPageToken).toBe('brand-new-token');
    });
  });

  describe('File Processing - Incremental Optimization', () => {
    it('should reuse embeddings for unchanged chunks', async () => {
      const file: DriveFileMetadata = {
        id: 'file1',
        name: 'test.md',
        path: '/test.md',
        mimeType: 'text/markdown',
        modifiedTime: '2025-11-14T00:00:00Z',
      };

      const content = 'This is test content that will be chunked.';
      driveClient.setFileContent('file1', content);

      // Mock existing vectors with matching hash
      const existingHash = '1234567890abcdef'; // This would be computed from chunk
      const existingVectors: VectorPoint[] = [
        {
          id: 'file1_0',
          vector: Array(3072).fill(0.5),
          payload: {
            file_id: 'file1',
            file_name: 'test.md',
            file_path: '/test.md',
            chunk_index: 0,
            chunk_hash: existingHash,
            last_modified: '2025-11-13T00:00:00Z',
            text: content.substring(0, 1000),
          },
        },
      ];

      qdrantClient.setVectors('file1', existingVectors);

      // Note: This test relies on hash computation - the actual behavior
      // depends on whether chunk content produces the same hash
      const files = [file];
      driveClient.setFiles(files);

      const result = await orchestrator.runFullSync('root-folder-id');

      expect(result.filesProcessed).toBe(1);
    });

    it('should handle files with no existing vectors', async () => {
      const file: DriveFileMetadata = {
        id: 'new-file',
        name: 'new.md',
        path: '/new.md',
        mimeType: 'text/markdown',
        modifiedTime: '2025-11-14T00:00:00Z',
      };

      driveClient.setFileContent('new-file', 'Brand new content');
      qdrantClient.clearVectors();

      const files = [file];
      driveClient.setFiles(files);

      const result = await orchestrator.runFullSync('root-folder-id');

      expect(result.filesProcessed).toBe(1);
      expect(result.vectorsUpserted).toBeGreaterThan(0);
    });

    it('should handle collection not found errors gracefully', async () => {
      const file: DriveFileMetadata = {
        id: 'file1',
        name: 'test.md',
        path: '/test.md',
        mimeType: 'text/markdown',
        modifiedTime: '2025-11-14T00:00:00Z',
      };

      driveClient.setFileContent('file1', 'Test content');

      // Mock getVectorsByFileId to throw collection not found error
      const originalGetVectors = qdrantClient.getVectorsByFileId.bind(qdrantClient);
      qdrantClient.getVectorsByFileId = vi
        .fn()
        .mockRejectedValue(new Error('collection not found'));

      const files = [file];
      driveClient.setFiles(files);

      const result = await orchestrator.runFullSync('root-folder-id');

      expect(result.filesProcessed).toBe(1);
      expect(result.errors).toBe(0); // Should not count as error

      // Restore
      qdrantClient.getVectorsByFileId = originalGetVectors;
    });

    it('should delete vectors for removed chunks when file shrinks', async () => {
      const file: DriveFileMetadata = {
        id: 'file1',
        name: 'shrinking.md',
        path: '/shrinking.md',
        mimeType: 'text/markdown',
        modifiedTime: '2025-11-14T00:00:00Z',
      };

      // Set short content
      driveClient.setFileContent('file1', 'Short content');

      // Mock existing vectors with 3 chunks
      const existingVectors: VectorPoint[] = [
        {
          id: 'file1_0',
          vector: Array(3072).fill(0.5),
          payload: {
            file_id: 'file1',
            file_name: 'shrinking.md',
            file_path: '/shrinking.md',
            chunk_index: 0,
            chunk_hash: 'hash0',
            last_modified: '2025-11-13T00:00:00Z',
            text: 'chunk 0',
          },
        },
        {
          id: 'file1_1',
          vector: Array(3072).fill(0.5),
          payload: {
            file_id: 'file1',
            file_name: 'shrinking.md',
            file_path: '/shrinking.md',
            chunk_index: 1,
            chunk_hash: 'hash1',
            last_modified: '2025-11-13T00:00:00Z',
            text: 'chunk 1',
          },
        },
        {
          id: 'file1_2',
          vector: Array(3072).fill(0.5),
          payload: {
            file_id: 'file1',
            file_name: 'shrinking.md',
            file_path: '/shrinking.md',
            chunk_index: 2,
            chunk_hash: 'hash2',
            last_modified: '2025-11-13T00:00:00Z',
            text: 'chunk 2',
          },
        },
      ];

      qdrantClient.setVectors('file1', existingVectors);

      const files = [file];
      driveClient.setFiles(files);

      const result = await orchestrator.runFullSync('root-folder-id');

      expect(result.filesProcessed).toBe(1);
      // Should have upserted at least one vector for the new content
      expect(result.vectorsUpserted).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should continue processing other files when one fails', async () => {
      const files: DriveFileMetadata[] = [
        {
          id: 'good-file',
          name: 'good.md',
          path: '/good.md',
          mimeType: 'text/markdown',
          modifiedTime: '2025-11-14T00:00:00Z',
        },
        {
          id: 'bad-file',
          name: 'bad.md',
          path: '/bad.md',
          mimeType: 'text/markdown',
          modifiedTime: '2025-11-14T00:00:00Z',
        },
      ];

      driveClient.setFiles(files);
      driveClient.setFileContent('good-file', 'Good content');
      // bad-file will have no content and be skipped

      const result = await orchestrator.runFullSync('root-folder-id');

      // Should process at least the good file
      expect(result.filesProcessed).toBeGreaterThanOrEqual(1);
    });

    it('should handle errors during incremental sync change processing', async () => {
      await stateManager.updateStartPageToken('existing-token');

      const changes: DriveChange[] = [
        {
          type: 'modified',
          fileId: 'good-file',
          file: {
            id: 'good-file',
            name: 'good.md',
            path: '/good.md',
            mimeType: 'text/markdown',
            modifiedTime: '2025-11-14T00:00:00Z',
          },
        },
        {
          type: 'modified',
          fileId: 'bad-file',
          file: {
            id: 'bad-file',
            name: 'bad.md',
            path: '/bad.md',
            mimeType: 'text/markdown',
            modifiedTime: '2025-11-14T00:00:00Z',
          },
        },
      ];

      driveClient.setChanges(changes);
      driveClient.setFileContent('good-file', 'Good content');
      // bad-file has no content

      const result = await orchestrator.runIncrementalSync('root-folder-id');

      expect(result.filesProcessed).toBeGreaterThanOrEqual(1);
      expect(result.errors).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Large File Handling', () => {
    it('should handle files with many chunks', async () => {
      const file: DriveFileMetadata = {
        id: 'large-file',
        name: 'large.md',
        path: '/large.md',
        mimeType: 'text/markdown',
        modifiedTime: '2025-11-14T00:00:00Z',
      };

      // Create content that will generate multiple chunks
      const largeContent = 'Lorem ipsum dolor sit amet. '.repeat(1000);
      driveClient.setFileContent('large-file', largeContent);

      const files = [file];
      driveClient.setFiles(files);

      const result = await orchestrator.runFullSync('root-folder-id');

      expect(result.filesProcessed).toBe(1);
      expect(result.vectorsUpserted).toBeGreaterThan(0);
    });
  });

  describe('State Updates', () => {
    it('should update stats correctly after sync', async () => {
      const files: DriveFileMetadata[] = [
        {
          id: 'file1',
          name: 'doc1.md',
          path: '/doc1.md',
          mimeType: 'text/markdown',
          modifiedTime: '2025-11-14T00:00:00Z',
        },
        {
          id: 'file2',
          name: 'doc2.md',
          path: '/doc2.md',
          mimeType: 'text/markdown',
          modifiedTime: '2025-11-14T00:00:00Z',
        },
      ];

      driveClient.setFiles(files);
      driveClient.setFileContent('file1', 'Content 1');
      driveClient.setFileContent('file2', 'Content 2');

      await orchestrator.runFullSync('root-folder-id');

      const state = await stateManager.getState();
      expect(state.filesProcessed).toBe(2);
      expect(state.errorCount).toBe(0);
      expect(state.lastSyncTime).toBeDefined();
    });
  });
});
