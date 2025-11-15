import { useApiQuery } from './useApiQuery';
import type { SyncHistoryEntry } from '../types/api';

/**
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-030
 */

interface UseSyncHistoryOptions {
  autoRefreshMs?: number;
}

interface SyncHistoryResponse {
  history: SyncHistoryEntry[];
}

export function useSyncHistory(limit = 30, options: UseSyncHistoryOptions = {}) {
  const { autoRefreshMs = 60000 } = options;
  const query = useApiQuery<SyncHistoryResponse>(`/admin/history?limit=${limit}`, {
    autoRefreshMs,
  });

  return {
    history: query.data?.history ?? [],
    error: query.error,
    isFetching: query.isFetching,
    isLoading: query.isLoading,
    refresh: query.refresh,
  };
}
