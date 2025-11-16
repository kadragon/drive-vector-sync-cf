import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useApiQuery } from './useApiQuery';
import { z } from 'zod';

/**
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-030
 */

describe('useApiQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('handles network timeout errors gracefully', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Network timeout'));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useApiQuery('/test'));

    await waitFor(() => {
      expect(result.current.error).toContain('Network error');
    });
  });

  it.skip('validates response with schema and catches errors', async () => {
    const schema = z.object({ value: z.number() });
    const invalidData = { value: 'not-a-number' };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => invalidData,
    });

    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useApiQuery('/test', { schema }));

    await waitFor(() => {
      expect(result.current.error).toContain('Invalid API response format');
    });
  });

  it('handles empty or null responses gracefully', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => null,
    });

    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useApiQuery('/test'));

    await waitFor(() => {
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });
});
