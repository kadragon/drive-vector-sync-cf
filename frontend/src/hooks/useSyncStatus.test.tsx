import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, vi, beforeEach, afterEach } from 'vitest';
import { useSyncStatus } from './useSyncStatus';

/**
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-030
 *   test_refs:
 *     - TEST-web-dashboard-2
 *     - TEST-web-dashboard-4
 */

describe('useSyncStatus', () => {
  const mockStatus = {
    status: 'ok',
    lastSyncTime: '2025-11-15T07:30:00Z',
    filesProcessed: 42,
    errorCount: 1,
    hasStartPageToken: true,
    isLocked: false,
    nextScheduledSync: '2025-11-15T17:00:00Z',
    lastSyncDuration: 45000,
  } as const;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches sync status immediately and refreshes every 30 seconds', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockStatus,
    });

    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSyncStatus({ autoRefreshMs: 30000 }));

    await waitFor(() => expect(result.current.data?.filesProcessed).toBe(42));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(30000);
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(result.current.error).toBeNull();
  });

  it('captures errors when API fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Error',
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'boom' }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSyncStatus({ autoRefreshMs: 0 }));

    await waitFor(() => expect(result.current.error).toContain('Server error'));
    expect(result.current.data).toBeNull();
  });
});
