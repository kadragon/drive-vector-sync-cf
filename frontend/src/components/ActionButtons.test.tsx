import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, vi, beforeEach } from 'vitest';
import { ActionButtons } from './ActionButtons';

/**
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-030
 *   test_refs:
 *     - TEST-web-dashboard-4
 *     - TEST-web-dashboard-6
 */

describe('ActionButtons', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('prompts for admin token and triggers manual sync', async () => {
    const user = userEvent.setup();
    const refreshSpy = vi.fn();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('secret-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<ActionButtons onRefresh={refreshSpy} isSyncing={false} />);

    await user.click(screen.getByRole('button', { name: /Trigger Manual Sync/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenCalledWith(
      '/admin/resync',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer secret-token' }),
      })
    );

    expect(promptSpy).toHaveBeenCalledTimes(1);
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
});
