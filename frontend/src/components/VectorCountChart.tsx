import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { SyncHistoryEntry } from '../types/api';
import { formatShortDate } from '../utils/format';

/**
 * Trace:
 *   spec_id: SPEC-web-dashboard-1
 *   task_id: TASK-030
 */

interface VectorCountChartProps {
  data: SyncHistoryEntry[];
  isLoading: boolean;
}

export function VectorCountChart({ data, isLoading }: VectorCountChartProps) {
  const chartData = [...data]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map(item => ({
      label: formatShortDate(item.timestamp),
      upserted: item.vectorsUpserted,
      deleted: item.vectorsDeleted,
    }));

  return (
    <div className="card bg-base-100 shadow-xl p-4" data-testid="vector-count-chart">
      <h3 className="text-lg font-semibold mb-2">Vector Counts</h3>
      {isLoading ? (
        <div className="skeleton h-48 w-full" />
      ) : chartData.length === 0 ? (
        <p className="text-sm text-base-content/70">No vector metrics recorded yet.</p>
      ) : (
        <div className="w-full" style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
              <XAxis dataKey="label" stroke="currentColor" fontSize={12} />
              <YAxis stroke="currentColor" fontSize={12} allowDecimals={false} />
              <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none' }} />
              <Legend />
              <Bar dataKey="upserted" fill="#22c55e" name="Upserted" />
              <Bar dataKey="deleted" fill="#ef4444" name="Deleted" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
