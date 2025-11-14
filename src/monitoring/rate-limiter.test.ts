/**
 * Tests for rate limiting
 *
 * Trace:
 *   task_id: TASK-023
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiter, RateLimiterFactory } from './rate-limiter.js';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  describe('basic rate limiting', () => {
    it('should allow requests under the limit', async () => {
      const limiter = new RateLimiter({
        maxRequestsPerWindow: 5,
        windowMs: 1000,
      });

      await limiter.waitIfNeeded();
      await limiter.waitIfNeeded();
      await limiter.waitIfNeeded();

      expect(limiter.getRemainingRequests()).toBe(2);
    });

    it('should track usage percentage', async () => {
      const limiter = new RateLimiter({
        maxRequestsPerWindow: 10,
        windowMs: 1000,
      });

      await limiter.waitIfNeeded();
      await limiter.waitIfNeeded();

      expect(limiter.getUsagePercentage()).toBe(20);
    });

    it('should report remaining requests', async () => {
      const limiter = new RateLimiter({
        maxRequestsPerWindow: 5,
        windowMs: 1000,
      });

      await limiter.waitIfNeeded();
      expect(limiter.getRemainingRequests()).toBe(4);

      await limiter.waitIfNeeded();
      expect(limiter.getRemainingRequests()).toBe(3);
    });

    it('should reset properly', async () => {
      const limiter = new RateLimiter({
        maxRequestsPerWindow: 5,
        windowMs: 1000,
      });

      await limiter.waitIfNeeded();
      await limiter.waitIfNeeded();
      expect(limiter.getRemainingRequests()).toBe(3);

      limiter.reset();
      expect(limiter.getRemainingRequests()).toBe(5);
    });
  });

  describe('window sliding', () => {
    it('should allow requests after window expires', async () => {
      const limiter = new RateLimiter({
        maxRequestsPerWindow: 2,
        windowMs: 1000,
      });

      await limiter.waitIfNeeded();
      await limiter.waitIfNeeded();

      expect(limiter.getRemainingRequests()).toBe(0);

      // Advance time by 1100ms
      vi.advanceTimersByTime(1100);

      expect(limiter.getRemainingRequests()).toBe(2);
    });

    it('should clean up old timestamps', async () => {
      const limiter = new RateLimiter({
        maxRequestsPerWindow: 3,
        windowMs: 1000,
      });

      await limiter.waitIfNeeded();
      expect(limiter.getRemainingRequests()).toBe(2);

      vi.advanceTimersByTime(1100);

      await limiter.waitIfNeeded();
      expect(limiter.getRemainingRequests()).toBe(2);
    });
  });
});

describe('RateLimiterFactory', () => {
  it('should create OpenAI rate limiter', () => {
    const limiter = RateLimiterFactory.createOpenAILimiter();

    expect(limiter).toBeInstanceOf(RateLimiter);
    expect(limiter.getRemainingRequests()).toBe(5000);
  });

  it('should create Drive rate limiter', () => {
    const limiter = RateLimiterFactory.createDriveLimiter();

    expect(limiter).toBeInstanceOf(RateLimiter);
    expect(limiter.getRemainingRequests()).toBe(900);
  });

  it('should create Qdrant rate limiter with custom limit', () => {
    const limiter = RateLimiterFactory.createQdrantLimiter(500);

    expect(limiter).toBeInstanceOf(RateLimiter);
    expect(limiter.getRemainingRequests()).toBe(500);
  });

  it('should create Qdrant rate limiter with default limit', () => {
    const limiter = RateLimiterFactory.createQdrantLimiter();

    expect(limiter).toBeInstanceOf(RateLimiter);
    expect(limiter.getRemainingRequests()).toBe(1000);
  });
});
