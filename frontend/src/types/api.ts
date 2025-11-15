// API response types for the Drive Vector Sync Worker

export interface SyncStatus {
  status: 'ok';
  lastSyncTime: string | null;
  filesProcessed: number;
  errorCount: number;
  hasStartPageToken: boolean;
  isLocked: boolean;
  nextScheduledSync: string | null;
  lastSyncDuration: number | null;
}

export interface SyncStats {
  collection?: string;
  vectorCount: number;
  status?: string;
}

export interface SyncHistoryEntry {
  timestamp: string;
  filesProcessed: number;
  vectorsUpserted: number;
  vectorsDeleted: number;
  duration: number;
  errors: string[];
}

export interface HealthCheck {
  status: 'ok';
}

export interface ErrorResponse {
  error: string;
}
