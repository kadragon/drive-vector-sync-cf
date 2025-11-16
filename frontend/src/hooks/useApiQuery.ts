import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJson } from '../utils/api-client';
import { z } from 'zod';

/**
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-030
 */

interface UseApiQueryOptions<T> {
  autoRefreshMs?: number;
  immediate?: boolean;
  schema?: z.Schema<T>;
}

interface ApiQueryState<T> {
  data: T | null;
  error: string | null;
  isFetching: boolean;
}

export function useApiQuery<T>(url: string, options: UseApiQueryOptions<T> = {}) {
  const { autoRefreshMs = 0, immediate = true, schema } = options;
  const controllerRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<ApiQueryState<T>>({
    data: null,
    error: null,
    isFetching: false,
  });

  const fetchData = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setState(prev => ({ ...prev, isFetching: true }));

    try {
      const data = await fetchJson<T>(url, { signal: controller.signal }, schema);
      setState({ data, error: null, isFetching: false });
    } catch (error) {
      // Skip abort errors - they are intentional
      if ((error as Error).name === 'AbortError' || (error as { code?: string }).code === 'ABORTED') {
        return;
      }

      setState(prev => ({ ...prev, error: (error as Error).message, isFetching: false }));
    }
  }, [url, schema]);

  useEffect(() => {
    if (immediate) {
      fetchData();
    }

    if (autoRefreshMs <= 0) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      fetchData();
    }, autoRefreshMs);

    return () => window.clearInterval(intervalId);
  }, [autoRefreshMs, fetchData, immediate]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return {
    ...state,
    isLoading: !state.data && !state.error,
    refresh: fetchData,
  };
}
