import { useApiQuery } from './useApiQuery';
import type { SyncStats } from '../types/api';

/**
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-030
 */

interface UseSyncStatsOptions {
  autoRefreshMs?: number;
}

export function useSyncStats(options: UseSyncStatsOptions = {}) {
  const { autoRefreshMs = 60000 } = options;
  return useApiQuery<SyncStats>('/admin/stats', { autoRefreshMs });
}
