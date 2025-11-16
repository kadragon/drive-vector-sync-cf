import { render, screen } from '@testing-library/react';
import { describe, it } from 'vitest';
import { StatsCard } from './StatsCard';

/**
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-032
 *   test_refs:
 *     - TEST-web-dashboard-2
 */

describe('StatsCard', () => {
  it('renders title, value, description, and icon with tone styles', () => {
    render(
      <StatsCard
        title="Vectors"
        value="1,200"
        description="Total vectors in collection"
        tone="success"
        icon={<span data-testid="stat-icon">★</span>}
      />
    );

    expect(screen.getByText('Vectors')).toBeTruthy();
    const valueElement = screen.getByText('1,200');
    expect(valueElement.className.includes('text-success')).toBe(true);
    expect(screen.getByText('Total vectors in collection')).toBeTruthy();
    expect(screen.getByTestId('stat-icon')).toBeTruthy();
  });

  it('skips description block when not provided', () => {
    render(<StatsCard title="Errors" value="0" tone="info" />);

    expect(document.querySelector('.stat-desc')).toBeNull();
  });
});
