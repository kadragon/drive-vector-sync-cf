/**
 * Tests for Error Handling utilities
 *
 * Trace:
 *   spec_id: SPEC-error-handling-1
 *   task_id: TASK-010
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SyncError,
  DriveError,
  EmbeddingError,
  QdrantError,
  StateError,
  withRetry,
  logError,
  ErrorCollector,
  toError,
} from './index';

describe('Custom Error Classes', () => {
  it('should create SyncError with code and context', () => {
    const error = new SyncError('Test error', 'TEST_CODE', { fileId: '123' });

    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.context).toEqual({ fileId: '123' });
    expect(error.name).toBe('SyncError');
  });

  it('should create DriveError', () => {
    const error = new DriveError('Drive failed', { fileId: '456' });

    expect(error.message).toBe('Drive failed');
    expect(error.code).toBe('DRIVE_ERROR');
    expect(error.name).toBe('DriveError');
  });

  it('should create EmbeddingError', () => {
    const error = new EmbeddingError('Embedding failed');

    expect(error.message).toBe('Embedding failed');
    expect(error.code).toBe('EMBEDDING_ERROR');
  });

  it('should create QdrantError', () => {
    const error = new QdrantError('Qdrant failed');

    expect(error.code).toBe('QDRANT_ERROR');
  });

  it('should create StateError', () => {
    const error = new StateError('State failed');

    expect(error.code).toBe('STATE_ERROR');
  });
});

describe('TEST-error-handling-1: Retry logic with exponential backoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should succeed on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await withRetry(fn, { maxRetries: 3, delayMs: 1000 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry up to 3 times and succeed', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValue('success');

    const promise = withRetry(fn, {
      maxRetries: 3,
      delayMs: 1000,
      exponentialBackoff: true,
    });

    // Fast-forward through delays
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw error after max retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Always fails'));

    const promise = withRetry(fn, { maxRetries: 3, delayMs: 100 });

    // Handle the promise rejection first, then run timers
    const expectation = expect(promise).rejects.toThrow('Always fails');
    await vi.runAllTimersAsync();
    await expectation;

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should use exponential backoff', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Fail'));

    const promise = withRetry(fn, {
      maxRetries: 3,
      delayMs: 1000,
      exponentialBackoff: true,
    });

    // Track delays (1000, 2000, don't retry on 3rd failure)
    const expectation = expect(promise).rejects.toThrow();
    await vi.runAllTimersAsync();
    await expectation;
  });

  it('should use constant delay when exponentialBackoff is false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Fail'));

    const promise = withRetry(fn, {
      maxRetries: 3,
      delayMs: 500,
      exponentialBackoff: false,
    });

    const expectation = expect(promise).rejects.toThrow();
    await vi.runAllTimersAsync();
    await expectation;
  });
});

describe('TEST-error-handling-5: Log structured error data with context', () => {
  it('should log error with context', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const error = new Error('Test error');
    logError(error, { fileId: '123', operation: 'test' });

    expect(consoleErrorSpy).toHaveBeenCalled();
    const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][1]);

    expect(loggedData.message).toBe('Test error');
    expect(loggedData.fileId).toBe('123');
    expect(loggedData.operation).toBe('test');
    expect(loggedData.timestamp).toBeDefined();

    consoleErrorSpy.mockRestore();
  });

  it('should log SyncError with code and context', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const error = new DriveError('Drive error', { fileId: '456' });
    logError(error);

    expect(consoleErrorSpy).toHaveBeenCalled();
    const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][1]);

    expect(loggedData.code).toBe('DRIVE_ERROR');
    expect(loggedData.context).toEqual({ fileId: '456' });

    consoleErrorSpy.mockRestore();
  });
});

describe('ErrorCollector', () => {
  let collector: ErrorCollector;

  beforeEach(() => {
    collector = new ErrorCollector();
  });

  it('should collect errors', () => {
    const error1 = new Error('Error 1');
    const error2 = new Error('Error 2');

    collector.addError(error1);
    collector.addError(error2, { context: 'test' });

    const summary = collector.getSummary();
    expect(summary.totalErrors).toBe(2);
    expect(summary.errors).toHaveLength(2);
    expect(summary.errors[0].message).toBe('Error 1');
    expect(summary.errors[1].message).toBe('Error 2');
    expect(summary.errors[1].context).toEqual({ context: 'test' });
  });

  it('should check if has errors', () => {
    expect(collector.hasErrors()).toBe(false);

    collector.addError(new Error('Test'));

    expect(collector.hasErrors()).toBe(true);
  });

  it('should clear errors', () => {
    collector.addError(new Error('Error 1'));
    collector.addError(new Error('Error 2'));

    expect(collector.hasErrors()).toBe(true);

    collector.clear();

    expect(collector.hasErrors()).toBe(false);
    expect(collector.getSummary().totalErrors).toBe(0);
  });
});

describe('toError utility', () => {
  it('should return Error as-is', () => {
    const error = new Error('Test error');
    const result = toError(error);

    expect(result).toBe(error);
    expect(result.message).toBe('Test error');
  });

  it('should convert string to Error', () => {
    const result = toError('String error');

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('String error');
  });

  it('should convert error-like object to Error', () => {
    const errorLike = { message: 'Error-like message', code: 500 };
    const result = toError(errorLike);

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('Error-like message');
  });

  it('should handle null/undefined', () => {
    const result1 = toError(null);
    const result2 = toError(undefined);

    expect(result1).toBeInstanceOf(Error);
    expect(result1.message).toContain('Unknown error');

    expect(result2).toBeInstanceOf(Error);
    expect(result2.message).toContain('Unknown error');
  });

  it('should handle numbers', () => {
    const result = toError(404);

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toContain('Unknown error');
    expect(result.message).toContain('404');
  });

  it('should handle objects without message', () => {
    const result = toError({ foo: 'bar' });

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toContain('Unknown error');
  });
});
