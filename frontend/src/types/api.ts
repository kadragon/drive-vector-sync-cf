// API response types for the Drive Vector Sync Worker

export interface SyncStatus {
  lastSyncTime: string | null;
  filesProcessed: number;
  errorCount: number;
  isLocked: boolean;
  nextScheduledSync: string | null;
  lastSyncDuration: number | null;
}

export interface SyncStats {
  vectorCount: number;
  collectionInfo: {
    name: string;
    dimensions: number;
  };
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
  timestamp: string;
}

export interface ErrorResponse {
  error: string;
}
