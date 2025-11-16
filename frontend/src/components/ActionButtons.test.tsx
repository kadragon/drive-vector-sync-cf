import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, vi, beforeEach } from 'vitest';
import { ActionButtons } from './ActionButtons';
import { ADMIN_TOKEN_STORAGE_KEY } from '../config/constants';

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
    sessionStorage.clear();
  });

  it('shows modal and triggers manual sync when token is entered', async () => {
    const user = userEvent.setup();
    const refreshSpy = vi.fn();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<ActionButtons onRefresh={refreshSpy} isSyncing={false} />);

    // Click trigger button to open modal
    await user.click(screen.getByRole('button', { name: /Trigger Manual Sync/i }));

    // Wait for modal to appear
    await waitFor(() => {
      expect(screen.getByText(/Admin Token Required/i)).toBeTruthy();
    });

    // Enter token in the password input
    const tokenInput = screen.getByPlaceholderText(/Admin token/i);
    await user.type(tokenInput, 'secret-token');

    // Submit the form
    await user.click(screen.getByRole('button', { name: /Submit/i }));

    // Wait for fetch to be called
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenCalledWith(
      '/admin/resync',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer secret-token' }),
      })
    );

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

  it('reuses cached admin token without showing modal', async () => {
    sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, 'cached-token');
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

    // Modal should not appear
    expect(screen.queryByText(/Admin Token Required/i)).toBeNull();

    expect(fetchMock).toHaveBeenCalledWith(
      '/admin/resync',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer cached-token' }),
      })
    );
  });

  it('handles 401 Unauthorized by clearing cached token', async () => {
    sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, 'expired-token');
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

    expect(sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)).toBeNull();
    expect(screen.getByText(/Authentication failed/i)).toBeTruthy();
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it('cancels manual sync when modal is closed without input', async () => {
    const user = userEvent.setup();
    const refreshSpy = vi.fn();
    const fetchMock = vi.fn();

    vi.stubGlobal('fetch', fetchMock);

    render(<ActionButtons onRefresh={refreshSpy} isSyncing={false} />);

    // Open modal
    await user.click(screen.getByRole('button', { name: /Trigger Manual Sync/i }));

    await waitFor(() => {
      expect(screen.getByText(/Admin Token Required/i)).toBeTruthy();
    });

    // Click cancel button
    await user.click(screen.getByRole('button', { name: /Cancel/i }));

    // Fetch should not be called
    expect(fetchMock).not.toHaveBeenCalled();
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it('shows cancel message when submitting empty token', async () => {
    const user = userEvent.setup();
    const refreshSpy = vi.fn();
    const fetchMock = vi.fn();

    vi.stubGlobal('fetch', fetchMock);

    render(<ActionButtons onRefresh={refreshSpy} isSyncing={false} />);

    // Open modal
    await user.click(screen.getByRole('button', { name: /Trigger Manual Sync/i }));

    await waitFor(() => {
      expect(screen.getByText(/Admin Token Required/i)).toBeTruthy();
    });

    // Submit without entering token
    await user.click(screen.getByRole('button', { name: /Submit/i }));

    // Should show cancelled message
    await waitFor(() => {
      expect(screen.getByText(/cancelled/i)).toBeTruthy();
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
