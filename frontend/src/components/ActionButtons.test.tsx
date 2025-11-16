// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, vi, beforeEach } from 'vitest';
import { ActionButtons } from './ActionButtons';

/**
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-030, TASK-032
 *   test_refs:
 *     - TEST-web-dashboard-4
 *     - TEST-web-dashboard-6
 */

describe('ActionButtons', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('triggers manual sync without prompting for token', async () => {
    const user = userEvent.setup();
    const refreshSpy = vi.fn();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<ActionButtons onRefresh={refreshSpy} isSyncing={false} />);

    await user.click(screen.getByRole('button', { name: /Trigger Manual Sync/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenCalledWith('/admin/resync', expect.objectContaining({ method: 'POST' }));
    expect(refreshSpy).toHaveBeenCalled();
    expect(screen.getByText(/Sync triggered/i)).toBeTruthy();
  });

  it('calls refresh handler when pressing Refresh Now', async () => {
    const user = userEvent.setup();
    const refreshSpy = vi.fn();

    render(<ActionButtons onRefresh={refreshSpy} isSyncing={false} />);

    await user.click(screen.getByRole('button', { name: /Refresh Now/i }));

    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });


  it('handles 401 Unauthorized by showing auth error', async () => {
    const user = userEvent.setup();
    const refreshSpy = vi.fn();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<ActionButtons onRefresh={refreshSpy} isSyncing={false} />);

    await user.click(screen.getByRole('button', { name: /Trigger Manual Sync/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(screen.getByText(/Authentication failed/i)).toBeTruthy();
    expect(refreshSpy).not.toHaveBeenCalled();
  });
});
