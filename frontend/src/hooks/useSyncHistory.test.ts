import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, beforeEach, afterEach, vi } from 'vitest';
import { useSyncHistory } from './useSyncHistory';

/**
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-032
 *   test_refs:
 *     - TEST-web-dashboard-5
 */

describe('useSyncHistory', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('requests history with limit and exposes parsed entries', async () => {
    const historyPayload = [
      {
        timestamp: '2025-11-15T07:30:00Z',
        filesProcessed: 12,
        vectorsUpserted: 120,
        vectorsDeleted: 0,
        duration: 48000,
        errors: [],
      },
    ];

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: historyPayload }),
      headers: new Headers({ 'content-type': 'application/json' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSyncHistory(5, { autoRefreshMs: 0 }));

    await waitFor(() => expect(result.current.history).toHaveLength(1));
    expect(result.current.history[0].filesProcessed).toBe(12);
    expect(fetchMock).toHaveBeenCalledWith('/admin/history?limit=5', expect.any(Object));
  });

  it('auto-refreshes history and falls back to empty array when missing data', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ history: undefined }),
        headers: new Headers({ 'content-type': 'application/json' }),
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ history: [] }),
        headers: new Headers({ 'content-type': 'application/json' }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSyncHistory(10, { autoRefreshMs: 1000 }));
    await waitFor(() => expect(result.current.history).toEqual([]));

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
