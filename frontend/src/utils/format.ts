/**
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-030
 */

const numberFormatter = new Intl.NumberFormat('en-US');
const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});
const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function formatNumber(value?: number | null): string {
  if (value === null || value === undefined) {
    return '--';
  }

  return numberFormatter.format(value);
}

export function formatUtcDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return 'No syncs yet';
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 'Invalid date';
  }

  const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const day = date.toLocaleString('en-US', { day: '2-digit', timeZone: 'UTC' });
  const year = date.getUTCFullYear();
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');

  return `${month} ${day}, ${year} ${hours}:${minutes} UTC`;
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) {
    return 'Never';
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 'Never';
  }

  const diffMs = date.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (absMs >= dayMs) {
    const days = Math.round(diffMs / dayMs);
    return relativeTimeFormatter.format(days, 'day');
  }

  if (absMs >= hourMs) {
    const hours = Math.round(diffMs / hourMs);
    return relativeTimeFormatter.format(hours, 'hour');
  }

  const minutes = Math.max(1, Math.round(diffMs / minuteMs));
  return relativeTimeFormatter.format(minutes, 'minute');
}

export function formatCountdown(
  targetIso: string | null | undefined,
  now: Date = new Date()
): string {
  if (!targetIso) {
    return 'Unknown';
  }

  const target = new Date(targetIso);
  if (Number.isNaN(target.getTime())) {
    return 'Unknown';
  }

  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) {
    return 'due now';
  }

  const totalMinutes = Math.floor(diffMs / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `in ${hours}h ${minutes}m`;
}

export function formatDuration(durationMs: number | null | undefined): string {
  if (!durationMs) {
    return 'N/A';
  }

  const seconds = Math.round(durationMs / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}

export function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return shortDateFormatter.format(date);
}

/**
 * Per SPEC-web-dashboard-1 the user messaging always maps cron 17:00 UTC to 01:00 KST.
 */
export function getKstReminder(): string {
  return '(01:00 KST)';
}
