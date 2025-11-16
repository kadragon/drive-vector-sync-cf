import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, vi } from 'vitest';
import { VectorCountChart } from './VectorCountChart';

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
    BarChart: ({ data, children }: { data: unknown; children: ReactNode }) => (
      <div data-testid="bar-chart" data-points={JSON.stringify(data)}>
        {children}
      </div>
    ),
    Bar: () => <div data-testid="bar" />,
    CartesianGrid: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    Legend: () => null,
  };
});

describe('VectorCountChart', () => {
  const baseEntry = {
    filesProcessed: 0,
    duration: 0,
    errors: [],
  };

  it('shows skeleton while loading vector metrics', () => {
    render(<VectorCountChart data={[]} isLoading />);
    expect(document.querySelector('.skeleton')).not.toBeNull();
  });

  it('renders empty state message when no metrics', () => {
    render(<VectorCountChart data={[]} isLoading={false} />);
    expect(screen.getByText('No vector metrics recorded yet.')).toBeTruthy();
  });

  it('sorts history and maps upserted/deleted counts to chart series', () => {
    render(
      <VectorCountChart
        isLoading={false}
        data={[
          { ...baseEntry, timestamp: '2025-11-15T07:30:00Z', vectorsUpserted: 10, vectorsDeleted: 1 },
          { ...baseEntry, timestamp: '2025-11-14T07:30:00Z', vectorsUpserted: 2, vectorsDeleted: 0 },
        ]}
      />
    );

    const chartNode = screen.getByTestId('bar-chart');
    const points = JSON.parse(chartNode.getAttribute('data-points') ?? '[]');
    expect(points[0]).toMatchObject({ label: 'Nov 14', upserted: 2, deleted: 0 });
    expect(points[1]).toMatchObject({ label: 'Nov 15', upserted: 10, deleted: 1 });
  });
});
