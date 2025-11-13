/**
 * Main sync orchestrator
 * Coordinates the entire sync pipeline
 *
 * Trace:
 *   spec_id: Multiple
 *   task_id: TASK-012
 */

import { DriveClient, DriveFileMetadata } from '../drive/drive-client.js';
import { EmbeddingClient } from '../embedding/embedding-client.js';
import { chunkText } from '../embedding/chunking.js';
import { QdrantClient, VectorPoint, generateVectorId } from '../qdrant/qdrant-client.js';
import { KVStateManager } from '../state/kv-state-manager.js';
import { ErrorCollector, logError, toError } from '../errors/index.js';

export interface SyncConfig {
  chunkSize: number;
  maxBatchSize: number;
  maxConcurrency: number;
}

export interface SyncResult {
  filesProcessed: number;
  vectorsUpserted: number;
  vectorsDeleted: number;
  errors: number;
  duration: number;
}

/**
 * Main sync orchestrator
 */
export class SyncOrchestrator {
  constructor(
    private driveClient: DriveClient,
    private embeddingClient: EmbeddingClient,
    private qdrantClient: QdrantClient,
    private stateManager: KVStateManager,
    private config: SyncConfig
  ) {}

  /**
   * Run full sync (initial scan)
   */
  async runFullSync(rootFolderId: string): Promise<SyncResult> {
    const startTime = Date.now();
    const errorCollector = new ErrorCollector();
    let filesProcessed = 0;
    let vectorsUpserted = 0;

    console.log('Starting full sync...');

    try {
      // 1. Initialize Qdrant collection
      await this.qdrantClient.initializeCollection();

      // 2. List all markdown files
      const files = await this.driveClient.listMarkdownFiles(rootFolderId);
      console.log(`Found ${files.length} markdown files`);

      // 3. Process files with concurrency control
      for (
        let i = 0;
        i < files.length;
        i += this.config.maxConcurrency
      ) {
        const batch = files.slice(i, i + this.config.maxConcurrency);
        const results = await Promise.allSettled(
          batch.map((file) => this.processFile(file))
        );

        for (const result of results) {
          if (result.status === 'fulfilled') {
            filesProcessed++;
            vectorsUpserted += result.value;
          } else {
            const error = toError(result.reason);
            errorCollector.addError(error);
            logError(error);
          }
        }
      }

      // 4. Get and save new start page token
      const startPageToken = await this.driveClient.getStartPageToken();
      await this.stateManager.updateStartPageToken(startPageToken);

      // 5. Update stats
      await this.stateManager.updateStats(
        filesProcessed,
        errorCollector.getSummary().totalErrors
      );

      const duration = Date.now() - startTime;
      console.log(`Full sync completed in ${duration}ms`);

      return {
        filesProcessed,
        vectorsUpserted,
        vectorsDeleted: 0,
        errors: errorCollector.getSummary().totalErrors,
        duration,
      };
    } catch (error) {
      logError(error as Error);
      throw error;
    }
  }

  /**
   * Run incremental sync (using changes API)
   */
  async runIncrementalSync(rootFolderId: string): Promise<SyncResult> {
    const startTime = Date.now();
    const errorCollector = new ErrorCollector();
    let filesProcessed = 0;
    let vectorsUpserted = 0;
    let vectorsDeleted = 0;

    console.log('Starting incremental sync...');

    try {
      // 1. Get current state
      const state = await this.stateManager.getState();

      if (!state.startPageToken) {
        console.log('No start page token found, running full sync instead');
        return await this.runFullSync(rootFolderId);
      }

      // 2. Fetch changes
      const { changes, newStartPageToken } = await this.driveClient.fetchChanges(
        state.startPageToken,
        rootFolderId
      );

      console.log(`Found ${changes.length} changes`);

      if (changes.length === 0) {
        // Update token even if no changes
        await this.stateManager.updateStartPageToken(newStartPageToken);
        return {
          filesProcessed: 0,
          vectorsUpserted: 0,
          vectorsDeleted: 0,
          errors: 0,
          duration: Date.now() - startTime,
        };
      }

      // 3. Process changes
      for (const change of changes) {
        try {
          if (change.type === 'deleted') {
            await this.qdrantClient.deleteVectorsByFileId(change.fileId);
            vectorsDeleted++;
          } else if (change.type === 'modified' && change.file) {
            // Delete old vectors first
            await this.qdrantClient.deleteVectorsByFileId(change.fileId);
            // Process updated file
            const count = await this.processFile(change.file);
            vectorsUpserted += count;
            filesProcessed++;
          }
        } catch (error) {
          errorCollector.addError(error as Error, {
            fileId: change.fileId,
            changeType: change.type,
          });
          logError(error as Error, { fileId: change.fileId });
        }
      }

      // 4. Save new start page token
      await this.stateManager.updateStartPageToken(newStartPageToken);

      // 5. Update stats
      await this.stateManager.updateStats(
        filesProcessed,
        errorCollector.getSummary().totalErrors
      );

      const duration = Date.now() - startTime;
      console.log(`Incremental sync completed in ${duration}ms`);

      return {
        filesProcessed,
        vectorsUpserted,
        vectorsDeleted,
        errors: errorCollector.getSummary().totalErrors,
        duration,
      };
    } catch (error) {
      logError(error as Error);
      throw error;
    }
  }

  /**
   * Process a single file: download, chunk, embed, upsert
   */
  private async processFile(file: DriveFileMetadata): Promise<number> {
    console.log(`Processing file: ${file.name} (${file.id})`);

    // 1. Download file content
    const content = await this.driveClient.downloadFileContent(file.id);

    if (!content || content.trim().length === 0) {
      console.log(`Skipping empty file: ${file.name}`);
      return 0;
    }

    // 2. Chunk text
    const chunks = chunkText(content, this.config.chunkSize);
    console.log(`File chunked into ${chunks.length} parts`);

    // 3. Generate embeddings
    const texts = chunks.map((chunk) => chunk.text);
    const embeddings = await this.embeddingClient.embedWithBatching(
      texts,
      this.config.maxBatchSize
    );

    // 4. Build vector points
    const vectors: VectorPoint[] = chunks.map((chunk, index) => ({
      id: generateVectorId(file.id, chunk.index),
      vector: embeddings[index],
      payload: {
        file_id: file.id,
        file_name: file.name,
        file_path: file.path,
        chunk_index: chunk.index,
        last_modified: file.modifiedTime,
        text: chunk.text.substring(0, 1000), // Store first 1000 chars for reference
      },
    }));

    // 5. Upsert to Qdrant
    await this.qdrantClient.upsertVectors(vectors);

    console.log(`Upserted ${vectors.length} vectors for file: ${file.name}`);

    return vectors.length;
  }
}
