import { useMemo } from 'react';
import { formatCountdown, formatUtcDateTime, getKstReminder } from '../utils/format';

/**
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-030
 */

export function useNextSyncTime(nextSyncIso: string | null | undefined) {
  return useMemo(
    () => ({
      utcLabel: formatUtcDateTime(nextSyncIso),
      countdown: formatCountdown(nextSyncIso),
      kstLabel: getKstReminder(),
    }),
    [nextSyncIso]
  );
}
