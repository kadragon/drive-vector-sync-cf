import { useState } from 'react';
import { ADMIN_TOKEN_STORAGE_KEY } from '../config/constants';

/**
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-030
 */

interface ActionButtonsProps {
  onRefresh: () => Promise<void> | void;
  isSyncing: boolean;
}

export function ActionButtons({ onRefresh, isSyncing }: ActionButtonsProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenInput, setTokenInput] = useState('');

  const openTokenModal = () => {
    setTokenInput('');
    setShowTokenModal(true);
  };

  const closeTokenModal = () => {
    setShowTokenModal(false);
    setTokenInput('');
  };

  const handleTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = tokenInput.trim();

    if (!token) {
      setMessage('Manual sync cancelled');
      closeTokenModal();
      return;
    }

    sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
    closeTokenModal();
    await executeManualSync(token);
  };

  const executeManualSync = async (token: string) => {
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
        sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
        throw new Error('Authentication failed. Token has been cleared. Please try again.');
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

  const triggerManualSync = async () => {
    if (isSyncing || isSubmitting) {
      return;
    }

    const token = sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);

    if (!token) {
      openTokenModal();
      return;
    }

    await executeManualSync(token);
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

      {/* Token Input Modal */}
      {showTokenModal && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg mb-4">Admin Token Required</h3>
            <form onSubmit={handleTokenSubmit}>
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Enter your admin token to trigger a manual sync</span>
                </label>
                <input
                  type="password"
                  className="input input-bordered w-full"
                  placeholder="Admin token"
                  value={tokenInput}
                  onChange={e => setTokenInput(e.target.value)}
                  autoFocus
                  data-testid="token-input"
                />
              </div>
              <div className="modal-action">
                <button type="button" className="btn btn-ghost" onClick={closeTokenModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Submit
                </button>
              </div>
            </form>
          </div>
          <div className="modal-backdrop" onClick={closeTokenModal} />
        </div>
      )}
    </div>
  );
}
