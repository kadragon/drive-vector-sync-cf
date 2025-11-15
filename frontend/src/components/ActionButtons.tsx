import { useState } from 'react';

/**
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-030
 */

interface ActionButtonsProps {
  onRefresh: () => Promise<void> | void;
  isSyncing: boolean;
}

const TOKEN_KEY = 'dashboard_admin_token';

export function ActionButtons({ onRefresh, isSyncing }: ActionButtonsProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const triggerManualSync = async () => {
    if (isSyncing || isSubmitting) {
      return;
    }

    let token = localStorage.getItem(TOKEN_KEY);

    if (!token) {
      token = window.prompt('Enter admin token to trigger a manual sync')?.trim() ?? '';

      if (!token) {
        setMessage('Manual sync cancelled');
        return;
      }

      localStorage.setItem(TOKEN_KEY, token);
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch('/admin/resync', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        localStorage.removeItem(TOKEN_KEY);
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || payload.error || `Manual sync failed (${response.status})`);
      }

      setMessage('Sync triggered successfully. Refreshing status...');
      await onRefresh();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const refreshNow = async () => {
    await onRefresh();
    setMessage('Status refreshed');
  };

  return (
    <div className="card bg-base-100 shadow-xl p-4 space-y-3">
      <h3 className="text-lg font-semibold">Actions</h3>
      <p className="text-sm text-base-content/70">Trigger a manual sync or refresh dashboard data.</p>
      <div className="flex flex-wrap gap-3">
        <button
          className={`btn btn-primary ${isSubmitting ? 'loading' : ''}`}
          onClick={triggerManualSync}
          disabled={isSyncing || isSubmitting}
        >
          Trigger Manual Sync
        </button>
        <button className="btn btn-outline" onClick={refreshNow} disabled={isSubmitting}>
          Refresh Now
        </button>
      </div>
      {isSyncing && <div className="text-warning text-sm">Sync currently in progress...</div>}
      {message && (
        <div role="status" className="alert alert-info text-sm">
          {message}
        </div>
      )}
    </div>
  );
}
