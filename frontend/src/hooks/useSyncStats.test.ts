import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, beforeEach, afterEach, vi } from 'vitest';
import { useSyncStats } from './useSyncStats';

/**
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-032
 *   test_refs:
 *     - TEST-web-dashboard-2
 *     - TEST-web-dashboard-4
 */

describe('useSyncStats', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches stats and refreshes on interval', async () => {
    const payload = { collection: 'demo', vectorCount: 42, status: 'ready' };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payload,
      headers: new Headers({ 'content-type': 'application/json' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSyncStats({ autoRefreshMs: 2000 }));

    await waitFor(() => expect(result.current.data?.vectorCount).toBe(42));

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
