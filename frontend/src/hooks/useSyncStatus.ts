import { useApiQuery } from './useApiQuery';
import type { SyncStatus } from '../types/api';
import { SyncStatusSchema } from '../types/api';
import { POLLING_INTERVAL_MS } from '../config/constants';

/**
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-030
 */

interface UseSyncStatusOptions {
  autoRefreshMs?: number;
}

export function useSyncStatus(options: UseSyncStatusOptions = {}) {
  const { autoRefreshMs = POLLING_INTERVAL_MS } = options;
  return useApiQuery<SyncStatus>('/admin/status', { autoRefreshMs, schema: SyncStatusSchema });
}
