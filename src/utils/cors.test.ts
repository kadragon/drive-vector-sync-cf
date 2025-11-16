/**
 * Tests for CORS utilities
 *
 * Trace:
 *   spec_id: SPEC-admin-api-1
 *   task_id: TASK-036
 */

import { describe, it, expect } from 'vitest';
import { buildCorsHeaders } from './cors';

describe('buildCorsHeaders', () => {
  it('should include origin and credentials for cross-origin requests', () => {
    const request = new Request('http://localhost', {
      headers: {
        Origin: 'https://example.com',
      },
    });

    const headers = buildCorsHeaders(request);

    expect(headers['Access-Control-Allow-Origin']).toBe('https://example.com');
    expect(headers['Access-Control-Allow-Credentials']).toBe('true');
    expect(headers['Access-Control-Allow-Methods']).toBe('GET, POST, OPTIONS');
    expect(headers['Access-Control-Allow-Headers']).toContain('CF-Authorization');
  });

  it('should omit origin and credentials for same-origin requests', () => {
    const request = new Request('http://localhost');

    const headers = buildCorsHeaders(request);

    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(headers['Access-Control-Allow-Credentials']).toBeUndefined();
    expect(headers['Access-Control-Allow-Methods']).toBe('GET, POST, OPTIONS');
    expect(headers['Access-Control-Allow-Headers']).toContain('CF-Authorization');
  });

  it('should reflect any origin without validation', () => {
    const origins = [
      'https://malicious.com',
      'http://localhost:3000',
      'https://app.example.com',
    ];

    origins.forEach(origin => {
      const request = new Request('http://localhost', {
        headers: { Origin: origin },
      });

      const headers = buildCorsHeaders(request);

      expect(headers['Access-Control-Allow-Origin']).toBe(origin);
    });
  });
});
