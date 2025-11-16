/**
 * CORS utilities for handling cross-origin requests
 *
 * Trace:
 *   spec_id: SPEC-admin-api-1
 *   task_id: TASK-036
 */

/**
 * Build CORS headers that support credentials
 *
 * When credentials are enabled, Access-Control-Allow-Origin cannot be '*'.
 * Instead, we reflect the actual request origin or omit the header for same-origin requests.
 */
export function buildCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin');

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, CF-Authorization, Cf-Authorization',
  };

  // Only include CORS headers for cross-origin requests
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  return headers;
}
