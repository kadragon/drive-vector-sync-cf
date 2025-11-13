/**
 * Custom error classes and error handling utilities
 *
 * Trace:
 *   spec_id: SPEC-error-handling-1
 *   task_id: TASK-010
 */

/**
 * Base error class for domain errors
 */
export class SyncError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SyncError';
  }
}

/**
 * Drive API related errors
 */
export class DriveError extends SyncError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'DRIVE_ERROR', context);
    this.name = 'DriveError';
  }
}

/**
 * Embedding/OpenAI related errors
 */
export class EmbeddingError extends SyncError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'EMBEDDING_ERROR', context);
    this.name = 'EmbeddingError';
  }
}

/**
 * Qdrant related errors
 */
export class QdrantError extends SyncError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'QDRANT_ERROR', context);
    this.name = 'QdrantError';
  }
}

/**
 * State management errors
 */
export class StateError extends SyncError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'STATE_ERROR', context);
    this.name = 'StateError';
  }
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number;
  delayMs: number;
  exponentialBackoff?: boolean;
}

/**
 * Retry a function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = { maxRetries: 3, delayMs: 1000, exponentialBackoff: true }
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on last attempt
      if (attempt === config.maxRetries - 1) {
        break;
      }

      // Calculate delay
      const delay = config.exponentialBackoff
        ? config.delayMs * Math.pow(2, attempt)
        : config.delayMs;

      console.warn(
        `Attempt ${attempt + 1}/${config.maxRetries} failed. Retrying in ${delay}ms...`,
        {
          error: lastError.message,
        }
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

/**
 * Log structured error
 */
export function logError(error: Error, context?: Record<string, unknown>): void {
  const errorData: Record<string, unknown> = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
    ...context,
  };

  if (error instanceof SyncError) {
    errorData.code = error.code;
    errorData.context = error.context;
  }

  console.error('Error occurred:', JSON.stringify(errorData, null, 2));
}

/**
 * Error summary for reporting
 */
export interface ErrorSummary {
  totalErrors: number;
  errors: Array<{
    type: string;
    message: string;
    timestamp: string;
    context?: Record<string, unknown>;
  }>;
}

/**
 * Error collector for aggregating errors during sync
 */
export class ErrorCollector {
  private errors: ErrorSummary['errors'] = [];

  addError(error: Error, context?: Record<string, unknown>): void {
    this.errors.push({
      type: error.name,
      message: error.message,
      timestamp: new Date().toISOString(),
      context,
    });
  }

  getSummary(): ErrorSummary {
    return {
      totalErrors: this.errors.length,
      errors: this.errors,
    };
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }

  clear(): void {
    this.errors = [];
  }
}
