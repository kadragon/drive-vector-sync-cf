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
import { computeChunkHash } from '../embedding/hash.js';
import { VectorStoreClient, VectorPoint } from '../types/vector-store.js';
import { generateVectorId } from '../vectorize/vector-id.js';
import { KVStateManager, SyncHistoryEntry } from '../state/kv-state-manager.js';
import { ErrorCollector, logError, toError } from '../errors/index.js';
import { MetricsCollector } from '../monitoring/metrics.js';
import { AlertingService, AlertConfig } from '../monitoring/alerting.js';
import { CostTracker } from '../monitoring/cost-tracker.js';

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
  private metricsCollector: MetricsCollector;
  private alertingService: AlertingService;
  private costTracker: CostTracker;

  constructor(
    private driveClient: DriveClient,
    private embeddingClient: EmbeddingClient,
    private vectorClient: VectorStoreClient,
    private stateManager: KVStateManager,
    private config: SyncConfig,
    alertConfig?: AlertConfig
  ) {
    this.metricsCollector = new MetricsCollector();
    this.alertingService = new AlertingService(alertConfig || {});
    this.costTracker = new CostTracker();
  }

  /**
   * Run full sync (initial scan)
   */
  async runFullSync(rootFolderId: string): Promise<SyncResult> {
    const startTime = Date.now();
    const errorCollector = new ErrorCollector();
    let filesProcessed = 0;
    let vectorsUpserted = 0;

    console.log('Starting full sync...');

    // Start metrics and cost tracking
    this.metricsCollector.start();
    this.costTracker.reset();

    try {
      // 1. Initialize vector store collection
      this.metricsCollector.recordVectorIndexCall();
      this.costTracker.recordVectorIndexOperation();
      await this.vectorClient.initializeCollection();

      // 2. List all markdown files
      this.metricsCollector.recordDriveApiCall();
      this.costTracker.recordDriveQuery();
      const files = await this.driveClient.listMarkdownFiles(rootFolderId);
      console.log(`Found ${files.length} markdown files`);

      // 3. Process files with concurrency control
      for (let i = 0; i < files.length; i += this.config.maxConcurrency) {
        const batch = files.slice(i, i + this.config.maxConcurrency);
        const results = await Promise.allSettled(batch.map(file => this.processFile(file)));

        for (const result of results) {
          if (result.status === 'fulfilled') {
            filesProcessed++;
            vectorsUpserted += result.value;
            this.metricsCollector.recordFileProcessed('added');
            this.metricsCollector.recordVectorsUpserted(result.value);
          } else {
            const error = toError(result.reason);
            errorCollector.addError(error);
            this.metricsCollector.recordError(error);
            logError(error);
          }
        }
      }

      // 4. Get and save new start page token
      this.metricsCollector.recordDriveApiCall();
      this.costTracker.recordDriveQuery();
      const startPageToken = await this.driveClient.getStartPageToken();
      await this.stateManager.updateStartPageToken(startPageToken);

      // 5. Update stats
      await this.stateManager.updateStats(filesProcessed, errorCollector.getSummary().totalErrors);

      const duration = Date.now() - startTime;
      console.log(`Full sync completed in ${duration}ms`);

      // End metrics and send alerts
      this.metricsCollector.end(true);
      const metrics = this.metricsCollector.getMetrics();
      const perfMetrics = this.metricsCollector.getPerformanceMetrics();

      console.log(this.metricsCollector.getSummary());
      console.log('Cost tracking:', this.costTracker.getSummary());

      // Send success notification
      await this.alertingService.sendSyncCompleted(metrics, perfMetrics);

      // Check for performance issues
      await this.alertingService.sendPerformanceAlert(metrics, perfMetrics);

      // Save sync duration and history
      await this.stateManager.updateSyncDuration(duration);
      const historyEntry: SyncHistoryEntry = {
        timestamp: new Date().toISOString(),
        filesProcessed,
        vectorsUpserted,
        vectorsDeleted: 0,
        duration,
        errors: errorCollector.getSummary().errors.map(e => e.message),
      };
      await this.stateManager.saveSyncHistory(historyEntry);

      return {
        filesProcessed,
        vectorsUpserted,
        vectorsDeleted: 0,
        errors: errorCollector.getSummary().totalErrors,
        duration,
      };
    } catch (error) {
      const err = error as Error;

      // End metrics and send failure alert
      this.metricsCollector.end(false);
      this.metricsCollector.recordError(err);
      const metrics = this.metricsCollector.getMetrics();

      console.log(this.metricsCollector.getSummary());

      await this.alertingService.sendSyncFailed(metrics, err);

      logError(err);
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

    // Start metrics and cost tracking
    this.metricsCollector.start();
    this.costTracker.reset();

    try {
      // 1. Get current state
      const state = await this.stateManager.getState();

      if (!state.startPageToken) {
        console.log('No start page token found, running full sync instead');
        return await this.runFullSync(rootFolderId);
      }

      // 2. Fetch changes
      this.metricsCollector.recordDriveApiCall();
      this.costTracker.recordDriveQuery();
      const { changes, newStartPageToken } = await this.driveClient.fetchChanges(
        state.startPageToken,
        rootFolderId
      );

      console.log(`Found ${changes.length} changes`);

      if (changes.length === 0) {
        // Update token even if no changes
        await this.stateManager.updateStartPageToken(newStartPageToken);

        this.metricsCollector.end(true);
        const metrics = this.metricsCollector.getMetrics();
        const perfMetrics = this.metricsCollector.getPerformanceMetrics();

        console.log(this.metricsCollector.getSummary());
        console.log('Cost tracking:', this.costTracker.getSummary());

        // Send notification for successful sync with no changes
        await this.alertingService.sendSyncCompleted(metrics, perfMetrics);

        const duration = Date.now() - startTime;

        // Save sync duration and history
        await this.stateManager.updateSyncDuration(duration);
        const historyEntry: SyncHistoryEntry = {
          timestamp: new Date().toISOString(),
          filesProcessed: 0,
          vectorsUpserted: 0,
          vectorsDeleted: 0,
          duration,
          errors: [],
        };
        await this.stateManager.saveSyncHistory(historyEntry);

        return {
          filesProcessed: 0,
          vectorsUpserted: 0,
          vectorsDeleted: 0,
          errors: 0,
          duration,
        };
      }

      // 3. Process changes
      for (const change of changes) {
        try {
          if (change.type === 'deleted') {
            this.metricsCollector.recordVectorIndexCall();
            this.costTracker.recordVectorIndexOperation();
            await this.vectorClient.deleteVectorsByFileId(change.fileId);
            this.metricsCollector.recordFileProcessed('deleted');
            this.metricsCollector.recordVectorsDeleted(1);
            vectorsDeleted++;
          } else if (change.type === 'modified' && change.file) {
            // Process updated file with incremental optimization
            // (processFile will handle hash comparison and selective re-embedding)
            const count = await this.processFile(change.file);
            this.metricsCollector.recordFileProcessed('modified');
            this.metricsCollector.recordVectorsUpserted(count);
            vectorsUpserted += count;
            filesProcessed++;
          }
        } catch (error) {
          const err = error as Error;
          errorCollector.addError(err, {
            fileId: change.fileId,
            changeType: change.type,
          });
          this.metricsCollector.recordError(err, {
            fileId: change.fileId,
            changeType: change.type,
          });
          logError(err, { fileId: change.fileId });
        }
      }

      // 4. Save new start page token
      await this.stateManager.updateStartPageToken(newStartPageToken);

      // 5. Update stats
      await this.stateManager.updateStats(filesProcessed, errorCollector.getSummary().totalErrors);

      const duration = Date.now() - startTime;
      console.log(`Incremental sync completed in ${duration}ms`);

      // End metrics and send alerts
      this.metricsCollector.end(true);
      const metrics = this.metricsCollector.getMetrics();
      const perfMetrics = this.metricsCollector.getPerformanceMetrics();

      console.log(this.metricsCollector.getSummary());
      console.log('Cost tracking:', this.costTracker.getSummary());

      // Send success notification
      await this.alertingService.sendSyncCompleted(metrics, perfMetrics);

      // Check for performance issues
      await this.alertingService.sendPerformanceAlert(metrics, perfMetrics);

      // Save sync duration and history
      await this.stateManager.updateSyncDuration(duration);
      const historyEntry: SyncHistoryEntry = {
        timestamp: new Date().toISOString(),
        filesProcessed,
        vectorsUpserted,
        vectorsDeleted,
        duration,
        errors: errorCollector.getSummary().errors.map(e => e.message),
      };
      await this.stateManager.saveSyncHistory(historyEntry);

      return {
        filesProcessed,
        vectorsUpserted,
        vectorsDeleted,
        errors: errorCollector.getSummary().totalErrors,
        duration,
      };
    } catch (error) {
      const err = error as Error;

      // End metrics and send failure alert
      this.metricsCollector.end(false);
      this.metricsCollector.recordError(err);
      const metrics = this.metricsCollector.getMetrics();

      console.log(this.metricsCollector.getSummary());

      await this.alertingService.sendSyncFailed(metrics, err);

      logError(err);
      throw error;
    }
  }

  /**
   * Process a single file: download, chunk, embed, upsert
   * Uses incremental optimization to avoid re-embedding unchanged chunks
   */
  private async processFile(file: DriveFileMetadata): Promise<number> {
    console.log(`Processing file: ${file.name} (${file.id})`);

    // 1. Download file content
    this.metricsCollector.recordDriveApiCall();
    this.costTracker.recordDriveQuery();
    const content = await this.driveClient.downloadFileContent(file.id, file.mimeType);

    if (!content || content.trim().length === 0) {
      console.log(`Skipping empty file: ${file.name}`);
      return 0;
    }

    // 2. Chunk text
    const chunks = chunkText(content, this.config.chunkSize);
    this.metricsCollector.recordChunksProcessed(chunks.length);
    console.log(`File chunked into ${chunks.length} parts`);

    // 3. Compute hashes for all chunks
    const chunkHashes = await Promise.all(chunks.map(chunk => computeChunkHash(chunk.text)));

    // 4. Fetch existing vectors for this file (for incremental optimization)
    let existingVectors: VectorPoint[] = [];
    try {
      this.metricsCollector.recordVectorIndexCall();
      this.costTracker.recordVectorIndexOperation();
      existingVectors = await this.vectorClient.getVectorsByFileId(file.id);
      console.log(`Found ${existingVectors.length} existing vectors for file`);
    } catch (error) {
      const err = error as Error;

      // Only log as error if it's not a "collection doesn't exist" case
      if (err.message?.includes('collection') || err.message?.includes('not found')) {
        console.log(
          'No existing vectors found (collection may not exist yet), will embed all chunks'
        );
      } else {
        // Unexpected error - log it for investigation
        logError(err, {
          fileId: file.id,
          context: 'Failed to fetch existing vectors, proceeding with full embedding',
        });
      }
    }

    // 5. Build a map of existing chunk hashes to vectors
    const existingHashMap = new Map<string, VectorPoint>();
    for (const vector of existingVectors) {
      const hash = vector.payload.chunk_hash;
      if (hash) {
        existingHashMap.set(hash, vector);
      }
    }

    // 6. Determine which chunks need re-embedding
    const chunksToEmbed: Array<{ chunk: (typeof chunks)[0]; hash: string }> = [];
    const vectorsToUpsert: VectorPoint[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const hash = chunkHashes[i];
      const existingVector = existingHashMap.get(hash);

      if (existingVector) {
        // Chunk hasn't changed, reuse existing embedding
        console.log(`Reusing embedding for chunk ${i} (hash: ${hash.substring(0, 8)}...)`);

        // Update metadata but keep the same vector
        vectorsToUpsert.push({
          id: generateVectorId(file.id, chunk.index),
          vector: existingVector.vector,
          payload: {
            file_id: file.id,
            file_name: file.name,
            file_path: file.path,
            chunk_index: chunk.index,
            chunk_hash: hash,
            last_modified: file.modifiedTime,
            text: chunk.text.substring(0, 1000),
          },
        });
      } else {
        // Chunk is new or changed, needs embedding
        chunksToEmbed.push({ chunk, hash });
      }
    }

    console.log(`Need to embed ${chunksToEmbed.length}/${chunks.length} chunks`);

    // 7. Generate embeddings only for changed/new chunks
    if (chunksToEmbed.length > 0) {
      const textsToEmbed = chunksToEmbed.map(item => item.chunk.text);
      const totalTokens = chunksToEmbed.reduce((sum, item) => sum + item.chunk.tokenCount, 0);

      this.metricsCollector.recordEmbeddingApiCall();
      this.costTracker.recordEmbeddingUsage(totalTokens);

      const embeddings = await this.embeddingClient.embedWithBatching(
        textsToEmbed,
        this.config.maxBatchSize
      );

      // Add newly embedded chunks to upsert list
      for (let i = 0; i < chunksToEmbed.length; i++) {
        const { chunk, hash } = chunksToEmbed[i];
        vectorsToUpsert.push({
          id: generateVectorId(file.id, chunk.index),
          vector: embeddings[i],
          payload: {
            file_id: file.id,
            file_name: file.name,
            file_path: file.path,
            chunk_index: chunk.index,
            chunk_hash: hash,
            last_modified: file.modifiedTime,
            text: chunk.text.substring(0, 1000),
          },
        });
      }
    }

    // 8. Delete vectors for chunks that no longer exist (file got shorter or restructured)
    const newChunkIndices = new Set(chunks.map(c => c.index));
    const vectorsToDelete = existingVectors.filter(
      v => !newChunkIndices.has(v.payload.chunk_index)
    );

    if (vectorsToDelete.length > 0) {
      const idsToDelete = vectorsToDelete.map(v => v.id);
      this.metricsCollector.recordVectorIndexCall();
      this.costTracker.recordVectorIndexOperation();
      await this.vectorClient.deleteVectorsByIds(idsToDelete);
    }

    // 9. Upsert all vectors (both reused and newly embedded)
    if (vectorsToUpsert.length > 0) {
      this.metricsCollector.recordVectorIndexCall();
      this.costTracker.recordVectorIndexOperation();
      await this.vectorClient.upsertVectors(vectorsToUpsert);
      console.log(`Upserted ${vectorsToUpsert.length} vectors for file: ${file.name}`);
    }

    return vectorsToUpsert.length;
  }
}
