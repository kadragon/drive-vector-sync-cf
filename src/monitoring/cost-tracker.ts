/**
 * Cost tracking for API usage
 *
 * Trace:
 *   task_id: TASK-023
 */

/**
 * OpenAI pricing (as of 2025)
 * text-embedding-3-small: $0.00002 per 1K tokens
 */
const OPENAI_EMBEDDING_COST_PER_1K_TOKENS = 0.00002;

/**
 * Google Drive API quota limits
 * Queries per day: 1,000,000,000
 * Queries per 100 seconds per user: 1,000
 */
const DRIVE_QUERIES_PER_100_SEC_LIMIT = 1000;

export interface CostMetrics {
  openai: {
    totalTokens: number;
    totalCost: number;
    embeddingCalls: number;
  };
  drive: {
    totalQueries: number;
    queriesLast100Sec: number;
  };
  vectorIndex: {
    totalOperations: number;
  };
}

/**
 * Cost tracker for API usage
 */
export class CostTracker {
  private metrics: CostMetrics;
  private driveQueryTimestamps: number[] = [];

  constructor() {
    this.metrics = {
      openai: {
        totalTokens: 0,
        totalCost: 0,
        embeddingCalls: 0,
      },
      drive: {
        totalQueries: 0,
        queriesLast100Sec: 0,
      },
      vectorIndex: {
        totalOperations: 0,
      },
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics = {
      openai: {
        totalTokens: 0,
        totalCost: 0,
        embeddingCalls: 0,
      },
      drive: {
        totalQueries: 0,
        queriesLast100Sec: 0,
      },
      vectorIndex: {
        totalOperations: 0,
      },
    };
    this.driveQueryTimestamps = [];
  }

  /**
   * Record OpenAI embedding usage
   */
  recordEmbeddingUsage(tokens: number): void {
    this.metrics.openai.totalTokens += tokens;
    this.metrics.openai.totalCost += (tokens / 1000) * OPENAI_EMBEDDING_COST_PER_1K_TOKENS;
    this.metrics.openai.embeddingCalls++;
  }

  /**
   * Record Drive API query
   */
  recordDriveQuery(): void {
    const now = Date.now();
    this.metrics.drive.totalQueries++;
    this.driveQueryTimestamps.push(now);

    // Clean up old timestamps (older than 100 seconds)
    const cutoffTime = now - 100 * 1000;
    this.driveQueryTimestamps = this.driveQueryTimestamps.filter(t => t > cutoffTime);

    this.metrics.drive.queriesLast100Sec = this.driveQueryTimestamps.length;
  }

  /**
   * Record vector index operation
   */
  recordVectorIndexOperation(): void {
    this.metrics.vectorIndex.totalOperations++;
  }

  /**
   * Get current cost metrics
   */
  getMetrics(): CostMetrics {
    return { ...this.metrics };
  }

  /**
   * Check if Drive API rate limit is approaching
   */
  isDriveRateLimitApproaching(): boolean {
    return this.metrics.drive.queriesLast100Sec > DRIVE_QUERIES_PER_100_SEC_LIMIT * 0.8;
  }

  /**
   * Get estimated delay to avoid rate limit
   */
  getDriveRateLimitDelay(): number {
    if (this.driveQueryTimestamps.length < DRIVE_QUERIES_PER_100_SEC_LIMIT) {
      return 0;
    }

    const oldestTimestamp = this.driveQueryTimestamps[0];
    const timeSinceOldest = Date.now() - oldestTimestamp;
    const waitTime = 100 * 1000 - timeSinceOldest;

    return Math.max(0, waitTime);
  }

  /**
   * Get a summary string for logging
   */
  getSummary(): string {
    return [
      `OpenAI: ${this.metrics.openai.totalTokens.toLocaleString()} tokens, $${this.metrics.openai.totalCost.toFixed(4)}`,
      `Drive: ${this.metrics.drive.totalQueries} queries (${this.metrics.drive.queriesLast100Sec} in last 100s)`,
      `Vectorize: ${this.metrics.vectorIndex.totalOperations} operations`,
    ].join(' | ');
  }

  /**
   * Get detailed cost breakdown
   */
  getCostBreakdown(): {
    openai: { tokens: number; cost: number; calls: number };
    drive: { queries: number; queriesLast100Sec: number };
    vectorIndex: { operations: number };
    total: { openaiCost: number };
  } {
    return {
      openai: {
        tokens: this.metrics.openai.totalTokens,
        cost: this.metrics.openai.totalCost,
        calls: this.metrics.openai.embeddingCalls,
      },
      drive: {
        queries: this.metrics.drive.totalQueries,
        queriesLast100Sec: this.metrics.drive.queriesLast100Sec,
      },
      vectorIndex: {
        operations: this.metrics.vectorIndex.totalOperations,
      },
      total: {
        // Note: Currently only tracks OpenAI costs (Drive and Vectorize are usage-based)
        openaiCost: this.metrics.openai.totalCost,
      },
    };
  }
}
