/**
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-030
 */

/**
 * Auto-refresh polling interval for dashboard data (in milliseconds)
 * Default: 30 seconds
 */
export const POLLING_INTERVAL_MS = 30_000;

/**
 * Default number of days of sync history to display in charts
 */
export const HISTORY_DEFAULT_DAYS = 14;

/**
 * Session storage key for admin token
 */
export const ADMIN_TOKEN_STORAGE_KEY = 'dashboard_admin_token';
