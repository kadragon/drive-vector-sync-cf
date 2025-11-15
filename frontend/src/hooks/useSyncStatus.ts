import { useApiQuery } from './useApiQuery';
import type { SyncStatus } from '../types/api';

/**
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-030
 */

interface UseSyncStatusOptions {
  autoRefreshMs?: number;
}

export function useSyncStatus(options: UseSyncStatusOptions = {}) {
  const { autoRefreshMs = 30000 } = options;
  return useApiQuery<SyncStatus>('/admin/status', { autoRefreshMs });
}
