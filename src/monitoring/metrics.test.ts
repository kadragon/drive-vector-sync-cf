/**
 * Tests for metrics collection
 *
 * Trace:
 *   task_id: TASK-018
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsCollector } from './metrics.js';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  describe('initialization', () => {
    it('should initialize with empty metrics', () => {
      const metrics = collector.getMetrics();

      expect(metrics.filesProcessed).toBe(0);
      expect(metrics.filesAdded).toBe(0);
      expect(metrics.filesModified).toBe(0);
      expect(metrics.filesDeleted).toBe(0);
      expect(metrics.vectorsUpserted).toBe(0);
      expect(metrics.vectorsDeleted).toBe(0);
      expect(metrics.chunksProcessed).toBe(0);
      expect(metrics.embeddingApiCalls).toBe(0);
      expect(metrics.driveApiCalls).toBe(0);
      expect(metrics.vectorIndexCalls).toBe(0);
      expect(metrics.errors).toHaveLength(0);
      expect(metrics.success).toBe(false);
      expect(metrics.startTime).toBeGreaterThan(0);
      expect(metrics.endTime).toBeUndefined();
      expect(metrics.duration).toBeUndefined();
    });
  });

  describe('file processing', () => {
    it('should record added files', () => {
      collector.recordFileProcessed('added');
      collector.recordFileProcessed('added');

      const metrics = collector.getMetrics();
      expect(metrics.filesProcessed).toBe(2);
      expect(metrics.filesAdded).toBe(2);
      expect(metrics.filesModified).toBe(0);
      expect(metrics.filesDeleted).toBe(0);
    });

    it('should record modified files', () => {
      collector.recordFileProcessed('modified');
      collector.recordFileProcessed('modified');
      collector.recordFileProcessed('modified');

      const metrics = collector.getMetrics();
      expect(metrics.filesProcessed).toBe(3);
      expect(metrics.filesAdded).toBe(0);
      expect(metrics.filesModified).toBe(3);
      expect(metrics.filesDeleted).toBe(0);
    });

    it('should record deleted files', () => {
      collector.recordFileProcessed('deleted');

      const metrics = collector.getMetrics();
      expect(metrics.filesProcessed).toBe(1);
      expect(metrics.filesAdded).toBe(0);
      expect(metrics.filesModified).toBe(0);
      expect(metrics.filesDeleted).toBe(1);
    });

    it('should record mixed file operations', () => {
      collector.recordFileProcessed('added');
      collector.recordFileProcessed('modified');
      collector.recordFileProcessed('deleted');
      collector.recordFileProcessed('added');

      const metrics = collector.getMetrics();
      expect(metrics.filesProcessed).toBe(4);
      expect(metrics.filesAdded).toBe(2);
      expect(metrics.filesModified).toBe(1);
      expect(metrics.filesDeleted).toBe(1);
    });
  });

  describe('vector operations', () => {
    it('should record vectors upserted', () => {
      collector.recordVectorsUpserted(5);
      collector.recordVectorsUpserted(10);

      const metrics = collector.getMetrics();
      expect(metrics.vectorsUpserted).toBe(15);
    });

    it('should record vectors deleted', () => {
      collector.recordVectorsDeleted(3);
      collector.recordVectorsDeleted(7);

      const metrics = collector.getMetrics();
      expect(metrics.vectorsDeleted).toBe(10);
    });
  });

  describe('chunk processing', () => {
    it('should record chunks processed', () => {
      collector.recordChunksProcessed(20);
      collector.recordChunksProcessed(30);

      const metrics = collector.getMetrics();
      expect(metrics.chunksProcessed).toBe(50);
    });
  });

  describe('API calls', () => {
    it('should record embedding API calls', () => {
      collector.recordEmbeddingApiCall();
      collector.recordEmbeddingApiCall();
      collector.recordEmbeddingApiCall();

      const metrics = collector.getMetrics();
      expect(metrics.embeddingApiCalls).toBe(3);
    });

    it('should record Drive API calls', () => {
      collector.recordDriveApiCall();
      collector.recordDriveApiCall();

      const metrics = collector.getMetrics();
      expect(metrics.driveApiCalls).toBe(2);
    });

    it('should record Qdrant API calls', () => {
      collector.recordVectorIndexCall();

      const metrics = collector.getMetrics();
      expect(metrics.vectorIndexCalls).toBe(1);
    });
  });

  describe('error tracking', () => {
    it('should record errors', () => {
      const error1 = new Error('Test error 1');
      const error2 = new TypeError('Test error 2');

      collector.recordError(error1, { fileId: 'file123' });
      collector.recordError(error2);

      const metrics = collector.getMetrics();
      expect(metrics.errors).toHaveLength(2);
      expect(metrics.errors[0].errorType).toBe('Error');
      expect(metrics.errors[0].errorMessage).toBe('Test error 1');
      expect(metrics.errors[0].context).toEqual({ fileId: 'file123' });
      expect(metrics.errors[1].errorType).toBe('TypeError');
      expect(metrics.errors[1].errorMessage).toBe('Test error 2');
    });
  });

  describe('session management', () => {
    it('should mark end of session', () => {
      collector.recordFileProcessed('added');
      collector.end(true);

      const metrics = collector.getMetrics();
      expect(metrics.success).toBe(true);
      expect(metrics.endTime).toBeGreaterThan(0);
      expect(metrics.duration).toBeGreaterThanOrEqual(0);
    });

    it('should restart session', () => {
      collector.recordFileProcessed('added');
      collector.recordVectorsUpserted(5);
      collector.end(true);

      collector.start();

      const metrics = collector.getMetrics();
      expect(metrics.filesProcessed).toBe(0);
      expect(metrics.vectorsUpserted).toBe(0);
      expect(metrics.success).toBe(false);
      expect(metrics.endTime).toBeUndefined();
    });
  });

  describe('performance metrics', () => {
    it('should calculate performance metrics', () => {
      collector.recordFileProcessed('added');
      collector.recordFileProcessed('modified');
      collector.recordChunksProcessed(10);
      collector.recordEmbeddingApiCall();
      collector.end(true);

      const perfMetrics = collector.getPerformanceMetrics();

      expect(perfMetrics.avgFileProcessingTime).toBeGreaterThanOrEqual(0);
      expect(perfMetrics.avgChunkProcessingTime).toBeGreaterThanOrEqual(0);
      expect(perfMetrics.avgEmbeddingTime).toBeGreaterThanOrEqual(0);
      expect(perfMetrics.filesPerSecond).toBeGreaterThanOrEqual(0);
      expect(perfMetrics.chunksPerSecond).toBeGreaterThanOrEqual(0);
    });

    it('should handle zero values in performance metrics', () => {
      collector.end(true);

      const perfMetrics = collector.getPerformanceMetrics();

      expect(perfMetrics.avgFileProcessingTime).toBe(0);
      expect(perfMetrics.avgChunkProcessingTime).toBe(0);
      expect(perfMetrics.avgEmbeddingTime).toBe(0);
      expect(perfMetrics.filesPerSecond).toBe(0);
      expect(perfMetrics.chunksPerSecond).toBe(0);
    });
  });

  describe('summary', () => {
    it('should generate summary string', () => {
      collector.recordFileProcessed('added');
      collector.recordFileProcessed('modified');
      collector.recordVectorsUpserted(5);
      collector.recordChunksProcessed(10);
      collector.recordEmbeddingApiCall();
      collector.recordDriveApiCall();
      collector.recordVectorIndexCall();
      collector.end(true);

      const summary = collector.getSummary();

      expect(summary).toContain('succeeded');
      expect(summary).toContain('Files: 2');
      expect(summary).toContain('Vectors: 5 upserted');
      expect(summary).toContain('Chunks: 10');
      expect(summary).toContain('API calls:');
    });

    it('should show failed status in summary', () => {
      collector.recordError(new Error('Test error'));
      collector.end(false);

      const summary = collector.getSummary();

      expect(summary).toContain('failed');
      expect(summary).toContain('Errors: 1');
    });
  });
});
