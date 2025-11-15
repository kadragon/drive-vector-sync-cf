/**
 * Cron schedule utilities
 *
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-028
 */

/**
 * Calculate next execution time for a cron schedule
 * Currently supports simple daily schedule format: "0 17 * * *"
 *
 * @param cronSchedule Cron schedule string (minute hour day month weekday)
 * @param from Starting time (default: now)
 * @returns ISO timestamp of next execution
 */
export function getNextCronExecution(cronSchedule: string, from: Date = new Date()): string {
  // Parse cron schedule
  const parts = cronSchedule.trim().split(/\s+/);

  if (parts.length !== 5) {
    throw new Error(`Invalid cron schedule: ${cronSchedule}`);
  }

  const [minutePart, hourPart] = parts;

  // Parse minute and hour
  const minute = parseInt(minutePart, 10);
  const hour = parseInt(hourPart, 10);

  if (isNaN(minute) || isNaN(hour)) {
    throw new Error(`Invalid cron schedule: ${cronSchedule}`);
  }

  // Calculate next execution time
  const next = new Date(from);
  next.setUTCHours(hour, minute, 0, 0);

  // If the calculated time is in the past, add 1 day
  if (next.getTime() <= from.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  return next.toISOString();
}

/**
 * Get the cron schedule from environment
 * Default: "0 17 * * *" (daily at 17:00 UTC / 01:00 KST)
 */
export function getCronSchedule(): string {
  return '0 17 * * *';
}
