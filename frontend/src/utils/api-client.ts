/**
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-030
 */

export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const mergedInit: RequestInit = {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers || {}),
    },
  };

  const response = await fetch(input, mergedInit);
  const contentType =
    typeof response.headers?.get === 'function' ? response.headers.get('content-type') : null;
  const isJson = contentType?.includes('application/json');
  let payload: unknown = null;

  if (isJson || typeof response.json === 'function') {
    payload = await response.json();
  } else if (typeof response.text === 'function') {
    payload = await response.text();
  }

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null
        ? (payload as { error?: string; message?: string }).message ||
          (payload as { error?: string }).error
        : typeof payload === 'string'
          ? payload
          : response.statusText;

    throw new Error(message || `Request failed (${response.status})`);
  }

  return payload as T;
}
