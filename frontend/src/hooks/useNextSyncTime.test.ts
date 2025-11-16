// @vitest-environment jsdom
import { describe, it, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useNextSyncTime } from './useNextSyncTime';

/**
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-032
 *   test_refs:
 *     - TEST-web-dashboard-3
 */

describe('useNextSyncTime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats UTC label, countdown, and static KST reminder', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-11-15T10:00:00Z'));

    const { result } = renderHook(() => useNextSyncTime('2025-11-15T17:00:00Z'));

    expect(result.current.utcLabel).toBe('Nov 15, 2025 17:00 UTC');
    expect(result.current.countdown).toBe('in 7h 0m');
    expect(result.current.kstLabel).toBe('(01:00 KST)');
  });

  it('returns fallback labels when next sync is unavailable', () => {
    const { result } = renderHook(() => useNextSyncTime(null));

    expect(result.current.utcLabel).toBe('No syncs yet');
    expect(result.current.countdown).toBe('Unknown');
  });
});
