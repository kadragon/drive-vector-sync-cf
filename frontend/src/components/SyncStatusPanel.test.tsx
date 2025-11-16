import { render, screen } from '@testing-library/react';
import { describe, it } from 'vitest';
import { SyncStatusPanel } from './SyncStatusPanel';

/**
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-032
 *   test_refs:
 *     - TEST-web-dashboard-2
 *     - TEST-web-dashboard-3
 */

describe('SyncStatusPanel', () => {
  const baseProps = {
    nextSyncUtcLabel: 'Nov 15, 2025 17:00 UTC',
    nextSyncCountdown: 'in 7h 0m',
    nextSyncKstLabel: '(01:00 KST)',
    lastSyncDuration: 90000,
  } as const;

  it('shows idle status with countdown and duration', () => {
    render(
      <SyncStatusPanel
        {...baseProps}
        isLocked={false}
        statusError={null}
      />
    );

    expect(screen.getByText('Sync Status')).toBeTruthy();
    expect(screen.getByText('Idle')).toBeTruthy();
    expect(screen.getByText(baseProps.nextSyncUtcLabel)).toBeTruthy();
    expect(screen.getByTestId('next-sync-kst').textContent).toContain('(01:00 KST)');
    expect(screen.getByText(/1m 30s/)).toBeTruthy();
  });

  it('renders progress indicator when sync is running', () => {
    render(
      <SyncStatusPanel
        {...baseProps}
        isLocked
        statusError={null}
      />
    );

    expect(screen.getByText('Sync In Progress')).toBeTruthy();
    expect(document.querySelector('progress')).not.toBeNull();
  });

  it('surfaces error badge and alert message', () => {
    render(
      <SyncStatusPanel
        {...baseProps}
        isLocked={false}
        statusError="Failed to reach admin API"
      />
    );

    expect(screen.getByText('Error')).toBeTruthy();
    expect(screen.getByText('Failed to reach admin API')).toBeTruthy();
  });
});
