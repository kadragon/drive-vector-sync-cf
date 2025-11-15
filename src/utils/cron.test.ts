/**
 * Tests for cron utilities
 *
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-028
 */

import { describe, it, expect } from 'vitest';
import { getNextCronExecution, getCronSchedule } from './cron';

describe('cron utilities', () => {
  describe('getNextCronExecution', () => {
    it('should calculate next execution for daily schedule', () => {
      // Test at 10:00 UTC, next execution should be 17:00 same day
      const from = new Date('2025-11-15T10:00:00Z');
      const next = getNextCronExecution('0 17 * * *', from);

      expect(next).toBe('2025-11-15T17:00:00.000Z');
    });

    it('should calculate next execution when current time is past schedule', () => {
      // Test at 18:00 UTC, next execution should be 17:00 next day
      const from = new Date('2025-11-15T18:00:00Z');
      const next = getNextCronExecution('0 17 * * *', from);

      expect(next).toBe('2025-11-16T17:00:00.000Z');
    });

    it('should handle exact match time by going to next day', () => {
      // Test exactly at 17:00 UTC, should go to next day
      const from = new Date('2025-11-15T17:00:00Z');
      const next = getNextCronExecution('0 17 * * *', from);

      expect(next).toBe('2025-11-16T17:00:00.000Z');
    });

    it('should handle different hour and minute combinations', () => {
      const from = new Date('2025-11-15T08:00:00Z');
      const next = getNextCronExecution('30 14 * * *', from);

      expect(next).toBe('2025-11-15T14:30:00.000Z');
    });

    it('should throw error for invalid cron schedule', () => {
      expect(() => getNextCronExecution('invalid')).toThrow('Invalid cron schedule');
    });

    it('should throw error for non-numeric hour/minute', () => {
      expect(() => getNextCronExecution('x y * * *')).toThrow('Invalid cron schedule');
    });

    it('should use current time as default if no from date provided', () => {
      const before = Date.now();
      const next = getNextCronExecution('0 17 * * *');
      const after = Date.now();

      // Verify it returned a valid ISO string
      expect(next).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

      // Verify the calculation happened within reasonable time
      const nextTime = new Date(next).getTime();
      expect(nextTime).toBeGreaterThan(before);
      expect(nextTime).toBeLessThan(after + 24 * 60 * 60 * 1000); // Within next 24 hours
    });
  });

  describe('getCronSchedule', () => {
    it('should return default cron schedule', () => {
      expect(getCronSchedule()).toBe('0 17 * * *');
    });
  });
});
