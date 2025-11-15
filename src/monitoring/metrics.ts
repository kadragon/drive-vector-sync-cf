/**
 * Metrics collection and tracking module
 *
 * Trace:
 *   task_id: TASK-018
 */

export interface SyncMetrics {
  startTime: number;
  endTime?: number;
  duration?: number;
  filesProcessed: number;
  filesAdded: number;
  filesModified: number;
  filesDeleted: number;
  vectorsUpserted: number;
  vectorsDeleted: number;
  chunksProcessed: number;
  embeddingApiCalls: number;
  driveApiCalls: number;
  vectorIndexCalls: number;
  errors: ErrorMetric[];
  success: boolean;
}

export interface ErrorMetric {
  timestamp: number;
  errorType: string;
  errorMessage: string;
  context?: Record<string, any>;
  stack?: string;
}

export interface PerformanceMetrics {
  avgFileProcessingTime: number;
  avgChunkProcessingTime: number;
  avgEmbeddingTime: number;
  filesPerSecond: number;
  chunksPerSecond: number;
}

/**
 * Metrics collector for sync operations
 */
export class MetricsCollector {
  private metrics: SyncMetrics;

  constructor() {
    this.metrics = this.createEmptyMetrics();
  }

  private createEmptyMetrics(): SyncMetrics {
    return {
      startTime: Date.now(),
      filesProcessed: 0,
      filesAdded: 0,
      filesModified: 0,
      filesDeleted: 0,
      vectorsUpserted: 0,
      vectorsDeleted: 0,
      chunksProcessed: 0,
      embeddingApiCalls: 0,
      driveApiCalls: 0,
      vectorIndexCalls: 0,
      errors: [],
      success: false,
    };
  }

  /**
   * Start a new metrics collection session
   */
  start(): void {
    this.metrics = this.createEmptyMetrics();
  }

  /**
   * Mark the end of metrics collection
   */
  end(success: boolean): void {
    this.metrics.endTime = Date.now();
    this.metrics.duration = this.metrics.endTime - this.metrics.startTime;
    this.metrics.success = success;
  }

  /**
   * Record file processing metrics
   */
  recordFileProcessed(changeType: 'added' | 'modified' | 'deleted'): void {
    this.metrics.filesProcessed++;
    if (changeType === 'added') {
      this.metrics.filesAdded++;
    } else if (changeType === 'modified') {
      this.metrics.filesModified++;
    } else if (changeType === 'deleted') {
      this.metrics.filesDeleted++;
    }
  }

  /**
   * Record vector operations
   */
  recordVectorsUpserted(count: number): void {
    this.metrics.vectorsUpserted += count;
  }

  recordVectorsDeleted(count: number): void {
    this.metrics.vectorsDeleted += count;
  }

  /**
   * Record chunk processing
   */
  recordChunksProcessed(count: number): void {
    this.metrics.chunksProcessed += count;
  }

  /**
   * Record API calls
   */
  recordEmbeddingApiCall(): void {
    this.metrics.embeddingApiCalls++;
  }

  recordDriveApiCall(): void {
    this.metrics.driveApiCalls++;
  }

  recordVectorIndexCall(): void {
    this.metrics.vectorIndexCalls++;
  }

  /**
   * Record an error
   */
  recordError(error: Error, context?: Record<string, any>): void {
    this.metrics.errors.push({
      timestamp: Date.now(),
      errorType: error.constructor.name,
      errorMessage: error.message,
      context,
      stack: error.stack,
    });
  }

  /**
   * Get current metrics
   */
  getMetrics(): SyncMetrics {
    return { ...this.metrics };
  }

  /**
   * Calculate performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    const duration = this.metrics.duration || Date.now() - this.metrics.startTime;
    const durationSeconds = duration / 1000;

    return {
      avgFileProcessingTime:
        this.metrics.filesProcessed > 0 ? duration / this.metrics.filesProcessed : 0,
      avgChunkProcessingTime:
        this.metrics.chunksProcessed > 0 ? duration / this.metrics.chunksProcessed : 0,
      avgEmbeddingTime:
        this.metrics.embeddingApiCalls > 0 ? duration / this.metrics.embeddingApiCalls : 0,
      filesPerSecond: durationSeconds > 0 ? this.metrics.filesProcessed / durationSeconds : 0,
      chunksPerSecond: durationSeconds > 0 ? this.metrics.chunksProcessed / durationSeconds : 0,
    };
  }

  /**
   * Get a summary string for logging
   */
  getSummary(): string {
    const perf = this.getPerformanceMetrics();
    return [
      `Sync ${this.metrics.success ? 'succeeded' : 'failed'}`,
      `Duration: ${this.metrics.duration}ms`,
      `Files: ${this.metrics.filesProcessed} (${this.metrics.filesAdded} added, ${this.metrics.filesModified} modified, ${this.metrics.filesDeleted} deleted)`,
      `Vectors: ${this.metrics.vectorsUpserted} upserted, ${this.metrics.vectorsDeleted} deleted`,
      `Chunks: ${this.metrics.chunksProcessed}`,
      `API calls: ${this.metrics.embeddingApiCalls} embedding, ${this.metrics.driveApiCalls} drive, ${this.metrics.vectorIndexCalls} vectorize`,
      `Performance: ${perf.filesPerSecond.toFixed(2)} files/s, ${perf.chunksPerSecond.toFixed(2)} chunks/s`,
      `Errors: ${this.metrics.errors.length}`,
    ].join(' | ');
  }
}
