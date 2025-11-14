/**
 * Tests for cost tracking
 *
 * Trace:
 *   task_id: TASK-023
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CostTracker } from './cost-tracker.js';

describe('CostTracker', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker();
  });

  describe('initialization', () => {
    it('should initialize with zero metrics', () => {
      const metrics = tracker.getMetrics();

      expect(metrics.openai.totalTokens).toBe(0);
      expect(metrics.openai.totalCost).toBe(0);
      expect(metrics.openai.embeddingCalls).toBe(0);
      expect(metrics.drive.totalQueries).toBe(0);
      expect(metrics.drive.queriesLast100Sec).toBe(0);
      expect(metrics.qdrant.totalOperations).toBe(0);
    });
  });

  describe('OpenAI cost tracking', () => {
    it('should record embedding usage', () => {
      tracker.recordEmbeddingUsage(1000); // 1K tokens

      const metrics = tracker.getMetrics();
      expect(metrics.openai.totalTokens).toBe(1000);
      expect(metrics.openai.embeddingCalls).toBe(1);
      expect(metrics.openai.totalCost).toBeCloseTo(0.00013, 6);
    });

    it('should accumulate multiple embedding calls', () => {
      tracker.recordEmbeddingUsage(1000);
      tracker.recordEmbeddingUsage(2000);
      tracker.recordEmbeddingUsage(500);

      const metrics = tracker.getMetrics();
      expect(metrics.openai.totalTokens).toBe(3500);
      expect(metrics.openai.embeddingCalls).toBe(3);
      expect(metrics.openai.totalCost).toBeCloseTo(0.000455, 6);
    });

    it('should calculate cost correctly for large token counts', () => {
      tracker.recordEmbeddingUsage(100000); // 100K tokens

      const metrics = tracker.getMetrics();
      expect(metrics.openai.totalCost).toBeCloseTo(0.013, 4);
    });
  });

  describe('Drive API tracking', () => {
    it('should record Drive queries', () => {
      tracker.recordDriveQuery();
      tracker.recordDriveQuery();
      tracker.recordDriveQuery();

      const metrics = tracker.getMetrics();
      expect(metrics.drive.totalQueries).toBe(3);
      expect(metrics.drive.queriesLast100Sec).toBe(3);
    });

    it('should not approach rate limit with few queries', () => {
      tracker.recordDriveQuery();
      tracker.recordDriveQuery();

      expect(tracker.isDriveRateLimitApproaching()).toBe(false);
    });

    it('should return zero delay when under limit', () => {
      tracker.recordDriveQuery();

      expect(tracker.getDriveRateLimitDelay()).toBe(0);
    });
  });

  describe('Qdrant tracking', () => {
    it('should record Qdrant operations', () => {
      tracker.recordQdrantOperation();
      tracker.recordQdrantOperation();

      const metrics = tracker.getMetrics();
      expect(metrics.qdrant.totalOperations).toBe(2);
    });
  });

  describe('reset', () => {
    it('should reset all metrics', () => {
      tracker.recordEmbeddingUsage(1000);
      tracker.recordDriveQuery();
      tracker.recordQdrantOperation();

      tracker.reset();

      const metrics = tracker.getMetrics();
      expect(metrics.openai.totalTokens).toBe(0);
      expect(metrics.openai.totalCost).toBe(0);
      expect(metrics.drive.totalQueries).toBe(0);
      expect(metrics.qdrant.totalOperations).toBe(0);
    });
  });

  describe('summary', () => {
    it('should generate summary string', () => {
      tracker.recordEmbeddingUsage(10000);
      tracker.recordDriveQuery();
      tracker.recordQdrantOperation();

      const summary = tracker.getSummary();

      expect(summary).toContain('10,000 tokens');
      expect(summary).toContain('$0.0013');
      expect(summary).toContain('1 queries');
      expect(summary).toContain('1 operations');
    });
  });

  describe('cost breakdown', () => {
    it('should provide detailed cost breakdown', () => {
      tracker.recordEmbeddingUsage(5000);
      tracker.recordDriveQuery();
      tracker.recordQdrantOperation();

      const breakdown = tracker.getCostBreakdown();

      expect(breakdown.openai.tokens).toBe(5000);
      expect(breakdown.openai.calls).toBe(1);
      expect(breakdown.openai.cost).toBeCloseTo(0.00065, 6);
      expect(breakdown.drive.queries).toBe(1);
      expect(breakdown.qdrant.operations).toBe(1);
      expect(breakdown.total.cost).toBeCloseTo(0.00065, 6);
    });
  });
});
