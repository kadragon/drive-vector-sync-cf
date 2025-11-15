import { formatDuration } from '../utils/format';

/**
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-030
 */

interface SyncStatusPanelProps {
  isLocked: boolean;
  statusError: string | null;
  nextSyncUtcLabel: string;
  nextSyncCountdown: string;
  nextSyncKstLabel: string;
  lastSyncDuration: number | null | undefined;
}

export function SyncStatusPanel({
  isLocked,
  statusError,
  nextSyncUtcLabel,
  nextSyncCountdown,
  nextSyncKstLabel,
  lastSyncDuration,
}: SyncStatusPanelProps) {
  const badgeClass = statusError
    ? 'badge badge-error badge-lg'
    : isLocked
      ? 'badge badge-warning badge-lg'
      : 'badge badge-success badge-lg';

  const badgeLabel = statusError ? 'Error' : isLocked ? 'Sync In Progress' : 'Idle';

  return (
    <div className="card bg-base-100 shadow-xl p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Sync Status</h2>
        <span className={badgeClass}>{badgeLabel}</span>
      </div>
      {statusError && <div className="alert alert-error text-sm">{statusError}</div>}
      <div>
        <p className="text-sm text-base-content/70">Next Sync</p>
        <p className="text-lg font-semibold">{nextSyncUtcLabel}</p>
        <p data-testid="next-sync-kst" className="text-sm text-base-content/60">
          {nextSyncKstLabel}
        </p>
        <p className="text-sm text-base-content/60">{nextSyncCountdown}</p>
      </div>
      <div className="text-sm text-base-content/70">
        Last Sync Duration: <span className="font-semibold">{formatDuration(lastSyncDuration)}</span>
      </div>
      {isLocked && <progress className="progress progress-primary" value={70} max={100}></progress>}
    </div>
  );
}
