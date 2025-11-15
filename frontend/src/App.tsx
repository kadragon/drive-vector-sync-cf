import { useCallback } from 'react';
import { ActionButtons } from './components/ActionButtons';
import { StatsCard } from './components/StatsCard';
import { SyncHistoryChart } from './components/SyncHistoryChart';
import { SyncStatusPanel } from './components/SyncStatusPanel';
import { VectorCountChart } from './components/VectorCountChart';
import { useNextSyncTime } from './hooks/useNextSyncTime';
import { useSyncHistory } from './hooks/useSyncHistory';
import { useSyncStats } from './hooks/useSyncStats';
import { useSyncStatus } from './hooks/useSyncStatus';
import { formatNumber, formatRelativeTime, formatUtcDateTime } from './utils/format';
import './App.css';

/**
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-030
 *   test_refs:
 *     - TEST-web-dashboard-2
 *     - TEST-web-dashboard-3
 *     - TEST-web-dashboard-5
 *     - TEST-web-dashboard-6
 */

function App() {
  const {
    data: statusData,
    error: statusError,
    isFetching: isStatusFetching,
    isLoading: isStatusLoading,
    refresh: refreshStatus,
  } = useSyncStatus();
  const {
    data: statsData,
    error: statsError,
    isLoading: isStatsLoading,
    refresh: refreshStats,
  } = useSyncStats();
  const {
    history,
    error: historyError,
    isLoading: isHistoryLoading,
    refresh: refreshHistory,
  } = useSyncHistory(14);

  const nextSync = useNextSyncTime(statusData?.nextScheduledSync ?? null);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshStatus(), refreshStats(), refreshHistory()]);
  }, [refreshHistory, refreshStats, refreshStatus]);

  const lastSyncRelative = formatRelativeTime(statusData?.lastSyncTime);
  const lastSyncExact = formatUtcDateTime(statusData?.lastSyncTime);
  const filesProcessed = formatNumber(statusData?.filesProcessed ?? 0);
  const vectorCount = formatNumber(statsData?.vectorCount ?? 0);
  const errorCount = formatNumber(statusData?.errorCount ?? 0);

  const isSyncing = statusData?.isLocked ?? false;

  const showGlobalError = statusError || statsError || historyError;

  return (
    <div className="min-h-screen bg-base-200">
      <div className="navbar bg-base-100 shadow-lg">
        <div className="flex-1">
          <span className="btn btn-ghost text-xl">Drive Vector Sync Dashboard</span>
        </div>
        <div className="flex-none">
          <label className="swap swap-rotate btn btn-ghost btn-circle" title="Toggle theme">
            <input type="checkbox" className="theme-controller" value="dark" />
            <svg className="swap-off fill-current w-6 h-6" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="M5.64,17l-.71.71a1,1,0,0,0,0,1.41,1,1,0,0,0,1.41,0l.71-.71A1,1,0,0,0,5.64,17ZM5,12a1,1,0,0,0-1-1H3a1,1,0,0,0,0,2H4A1,1,0,0,0,5,12Zm7-7a1,1,0,0,0,1-1V3a1,1,0,0,0-2,0V4A1,1,0,0,0,12,5ZM5.64,7.05a1,1,0,0,0,.7.29,1,1,0,0,0,.71-.29,1,1,0,0,0,0-1.41l-.71-.71A1,1,0,0,0,4.93,6.34Zm12,.29a1,1,0,0,0,.7-.29l.71-.71a1,1,0,1,0-1.41-1.41L17,5.64a1,1,0,0,0,0,1.41A1,1,0,0,0,17.66,7.34ZM21,11H20a1,1,0,0,0,0,2h1a1,1,0,0,0,0-2Zm-9,8a1,1,0,0,0-1,1v1a1,1,0,0,0,2,0V20A1,1,0,0,0,12,19ZM18.36,17A1,1,0,0,0,17,18.36l.71.71a1,1,0,0,0,1.41,0,1,1,0,0,0,0-1.41ZM12,6.5A5.5,5.5,0,1,0,17.5,12,5.51,5.51,0,0,0,12,6.5Zm0,9A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z" />
            </svg>
            <svg className="swap-on fill-current w-6 h-6" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="M21.64,13a1,1,0,0,0-1.05-.14,8.05,8.05,0,0,1-3.37.73A8.15,8.15,0,0,1,9.08,5.49a8.59,8.59,0,0,1,.25-2A1,1,0,0,0,8,2.36,10.14,10.14,0,1,0,22,14.05,1,1,0,0,0,21.64,13Zm-9.5,6.69A8.14,8.14,0,0,1,7.08,5.22v.27A10.15,10.15,0,0,0,17.22,15.63a9.79,9.79,0,0,0,2.1-.22A8.11,8.11,0,0,1,12.14,19.73Z" />
            </svg>
          </label>
        </div>
      </div>

      <main className="container mx-auto p-6 space-y-6">
        {showGlobalError && (
          <div className="alert alert-error">
            <span>{showGlobalError}</span>
          </div>
        )}

        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="dashboard-stats">
          <StatsCard title="Last Sync" value={isStatusLoading ? '--' : lastSyncRelative} description={lastSyncExact} tone="primary" />
          <StatsCard title="Files Processed" value={isStatusLoading ? '--' : filesProcessed} description="From last sync" tone="secondary" />
          <StatsCard title="Vector Count" value={isStatsLoading ? '--' : vectorCount} description={statsData?.collection ?? 'Vectorize index'} tone="info" />
          <StatsCard title="Errors" value={isStatusLoading ? '--' : errorCount} description="Last 24h" tone="error" />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <SyncStatusPanel
              isLocked={isSyncing || isStatusFetching}
              statusError={statusError}
              nextSyncUtcLabel={nextSync.utcLabel}
              nextSyncCountdown={nextSync.countdown}
              nextSyncKstLabel={nextSync.kstLabel}
              lastSyncDuration={statusData?.lastSyncDuration}
            />
          </div>
          <ActionButtons onRefresh={refreshAll} isSyncing={isSyncing || isStatusFetching} />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SyncHistoryChart data={history} isLoading={isHistoryLoading} />
          <VectorCountChart data={history} isLoading={isHistoryLoading} />
        </section>
      </main>
    </div>
  );
}

export default App;
