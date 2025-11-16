// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, it, vi, beforeEach, afterEach } from 'vitest';
import App from './App';

/**
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-030
 *   test_refs:
 *     - TEST-web-dashboard-2
 *     - TEST-web-dashboard-3
 *     - TEST-web-dashboard-5
 */

describe('Dashboard App', () => {
  const mockStatus = {
    status: 'ok',
    lastSyncTime: '2025-11-15T07:30:00Z',
    filesProcessed: 1234,
    errorCount: 2,
    hasStartPageToken: true,
    isLocked: false,
    nextScheduledSync: '2025-11-15T17:00:00Z',
    lastSyncDuration: 60000,
    totalFilesInDrive: 2500,
  };

  const mockStats = {
    collection: 'vector-sync-prod',
    vectorCount: 987654,
    status: 'ready',
  };

  const mockHistory = {
    history: [
      {
        timestamp: '2025-11-15T07:30:00Z',
        filesProcessed: 12,
        vectorsUpserted: 120,
        vectorsDeleted: 0,
        duration: 48000,
        errors: [],
      },
      {
        timestamp: '2025-11-14T07:30:00Z',
        filesProcessed: 5,
        vectorsUpserted: 50,
        vectorsDeleted: 2,
        duration: 32000,
        errors: ['Timeout'],
      },
    ],
    count: 2,
  };

  const mockJsonResponse = (data: unknown) => ({
    ok: true,
    json: async () => data,
  });

  const installFetchMock = () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.url;

      if (url.includes('/admin/status')) {
        return Promise.resolve(mockJsonResponse(mockStatus));
      }

      if (url.includes('/admin/stats')) {
        return Promise.resolve(mockJsonResponse(mockStats));
      }

      if (url.includes('/admin/history')) {
        return Promise.resolve(mockJsonResponse(mockHistory));
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2025-11-15T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders dashboard stats, charts, and next sync schedule info', async () => {
    const fetchMock = installFetchMock();
    render(<App />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const statsGrid = screen.getByTestId('dashboard-stats');
    expect(within(statsGrid).getByText('Files Processed')).toBeTruthy();
    expect(within(statsGrid).getByText('1,234')).toBeTruthy();
    expect(within(statsGrid).getByText('Vector Count')).toBeTruthy();
    expect(within(statsGrid).getByText('987,654')).toBeTruthy();

    const lastSync = within(statsGrid).getByText(/Nov 15, 2025/);
    expect(lastSync.textContent).toContain('07:30 UTC');

    expect(screen.getByText(/Next Sync/)).toBeTruthy();
    expect(screen.getByText(/Nov 15, 2025 17:00 UTC/)).toBeTruthy();
    expect(screen.getByTestId('next-sync-kst').textContent).toContain('(01:00 KST)');
    expect(screen.getByText(/in 7h/)).toBeTruthy();

    expect(screen.getByTestId('sync-history-chart')).toBeTruthy();
    expect(screen.getByTestId('vector-count-chart')).toBeTruthy();
  });
});
