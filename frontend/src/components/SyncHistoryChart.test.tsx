import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, vi } from 'vitest';
import { SyncHistoryChart } from './SyncHistoryChart';

/**
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-032
 *   test_refs:
 *     - TEST-web-dashboard-5
 */

vi.mock('recharts', () => {
  return {
    ResponsiveContainer: ({ children }: { children: ReactNode }) => (
      <div data-testid="responsive">{children}</div>
    ),
    LineChart: ({ data, children }: { data: unknown; children: ReactNode }) => (
      <div data-testid="line-chart" data-points={JSON.stringify(data)}>
        {children}
      </div>
    ),
    Line: () => <div data-testid="chart-line" />,
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
  };
});

describe('SyncHistoryChart', () => {
  const baseEntry = {
    vectorsUpserted: 0,
    vectorsDeleted: 0,
    duration: 0,
    errors: [],
  };

  it('shows loading placeholder when fetching data', () => {
    render(<SyncHistoryChart data={[]} isLoading />);

    expect(screen.getByText('Sync History')).toBeTruthy();
    expect(document.querySelector('.skeleton')).not.toBeNull();
  });

  it('shows empty state when there is no history', () => {
    render(<SyncHistoryChart data={[]} isLoading={false} />);

    expect(screen.getByText('No sync history yet.')).toBeTruthy();
  });

  it('sorts history entries and forwards formatted labels to chart', () => {
    render(
      <SyncHistoryChart
        isLoading={false}
        data={[
          {
            ...baseEntry,
            timestamp: '2025-11-15T07:30:00Z',
            filesProcessed: 12,
          },
          {
            ...baseEntry,
            timestamp: '2025-11-14T07:30:00Z',
            filesProcessed: 5,
          },
        ]}
      />
    );

    const chartNode = screen.getByTestId('line-chart');
    const points = JSON.parse(chartNode.getAttribute('data-points') ?? '[]');
    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({ label: 'Nov 14', filesProcessed: 5 });
    expect(points[1]).toMatchObject({ label: 'Nov 15', filesProcessed: 12 });
  });
});
