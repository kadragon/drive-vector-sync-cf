import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { SyncHistoryEntry } from '../types/api';
import { formatShortDate } from '../utils/format';

/**
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-030
 */

interface SyncHistoryChartProps {
  data: SyncHistoryEntry[];
  isLoading: boolean;
}

export function SyncHistoryChart({ data, isLoading }: SyncHistoryChartProps) {
  const sortedData = [...data]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map(item => ({
      ...item,
      label: formatShortDate(item.timestamp),
    }));

  return (
    <div className="card bg-base-100 shadow-xl p-4" data-testid="sync-history-chart">
      <h3 className="text-lg font-semibold mb-2">Sync History</h3>
      {isLoading ? (
        <div className="skeleton h-48 w-full" />
      ) : sortedData.length === 0 ? (
        <p className="text-sm text-base-content/70">No sync history yet.</p>
      ) : (
        <div className="w-full" style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sortedData} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
              <XAxis dataKey="label" stroke="currentColor" fontSize={12} />
              <YAxis stroke="currentColor" fontSize={12} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', border: 'none' }}
                labelFormatter={label => `Run on ${label}`}
              />
              <Line type="monotone" dataKey="filesProcessed" stroke="#2563eb" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
