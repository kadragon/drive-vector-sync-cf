import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJson } from '../utils/api-client';

/**
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-030
 */

interface UseApiQueryOptions {
  autoRefreshMs?: number;
  immediate?: boolean;
}

interface ApiQueryState<T> {
  data: T | null;
  error: string | null;
  isFetching: boolean;
}

export function useApiQuery<T>(url: string, options: UseApiQueryOptions = {}) {
  const { autoRefreshMs = 0, immediate = true } = options;
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
      const data = await fetchJson<T>(url, { signal: controller.signal });
      setState({ data, error: null, isFetching: false });
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return;
      }

      setState(prev => ({ ...prev, error: (error as Error).message, isFetching: false }));
    }
  }, [url]);

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
