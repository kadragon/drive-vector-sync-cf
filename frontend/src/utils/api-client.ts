/**
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-030
 */

import { z } from 'zod';

export class ApiError extends Error {
  status?: number;
  code?: string;

  constructor(
    message: string,
    status?: number,
    code?: string
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function fetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  schema?: z.Schema<T>
): Promise<T> {
  const mergedInit: RequestInit = {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers || {}),
    },
  };

  try {
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

      // Provide user-friendly error messages for common status codes
      let errorMessage = message || `Request failed (${response.status})`;

      if (response.status === 401) {
        errorMessage = 'Authentication required. Please check your credentials.';
      } else if (response.status === 403) {
        errorMessage = 'Access forbidden. You do not have permission.';
      } else if (response.status === 404) {
        errorMessage = 'Resource not found.';
      } else if (response.status === 429) {
        errorMessage = 'Too many requests. Please try again later.';
      } else if (response.status >= 500) {
        errorMessage = 'Server error. Please try again later.';
      }

      throw new ApiError(errorMessage, response.status, 'HTTP_ERROR');
    }

    // Validate response with Zod schema if provided
    if (schema) {
      try {
        return schema.parse(payload);
      } catch (err) {
        if (err instanceof z.ZodError) {
          const zodErr = err as z.ZodError;
          console.error('API response validation failed:', zodErr.issues);
          throw new ApiError(
            `Invalid API response format: ${zodErr.issues.map((e: z.ZodIssue) => e.message).join(', ')}`,
            undefined,
            'VALIDATION_ERROR'
          );
        }
        throw err;
      }
    }

    return payload as T;
  } catch (err) {
    // Handle network errors
    if (err instanceof TypeError) {
      throw new ApiError('Network error. Please check your connection.', undefined, 'NETWORK_ERROR');
    }

    // Handle abort errors
    if ((err as Error).name === 'AbortError') {
      throw new ApiError('Request was cancelled.', undefined, 'ABORTED');
    }

    // Re-throw ApiError instances
    if (err instanceof ApiError) {
      throw err;
    }

    // Handle unknown errors
    throw new ApiError((err as Error).message || 'An unexpected error occurred', undefined, 'UNKNOWN_ERROR');
  }
}
