import type { ReactNode } from 'react';

/**
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-030
 */

interface StatsCardProps {
  title: string;
  value: ReactNode;
  description?: ReactNode;
  tone?: 'primary' | 'secondary' | 'info' | 'warning' | 'error' | 'success';
  icon?: ReactNode;
}

const toneClassMap: Record<NonNullable<StatsCardProps['tone']>, string> = {
  primary: 'text-primary',
  secondary: 'text-secondary',
  info: 'text-info',
  warning: 'text-warning',
  error: 'text-error',
  success: 'text-success',
};

export function StatsCard({ title, value, description, tone = 'primary', icon }: StatsCardProps) {
  const valueClass = toneClassMap[tone];

  return (
    <div className="stat bg-base-100 shadow-xl rounded-box p-4 space-y-2">
      <div className="flex items-center gap-2">
        {icon}
        <div className="stat-title text-sm text-base-content/70">{title}</div>
      </div>
      <div className={`stat-value ${valueClass}`}>{value}</div>
      {description && <div className="stat-desc text-sm text-base-content/60">{description}</div>}
    </div>
  );
}
