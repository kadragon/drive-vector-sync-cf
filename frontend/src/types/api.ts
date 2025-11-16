// API response types for the Drive Vector Sync Worker
import { z } from 'zod';

// Zod schemas for runtime validation
export const SyncStatusSchema = z.object({
  status: z.literal('ok'),
  lastSyncTime: z.string().nullable(),
  filesProcessed: z.number(),
  errorCount: z.number(),
  hasStartPageToken: z.boolean(),
  isLocked: z.boolean(),
  nextScheduledSync: z.string().nullable(),
  lastSyncDuration: z.number().nullable(),
});

export const SyncStatsSchema = z.object({
  collection: z.string().optional(),
  vectorCount: z.number(),
  status: z.string().optional(),
});

export const SyncHistoryEntrySchema = z.object({
  timestamp: z.string(),
  filesProcessed: z.number(),
  vectorsUpserted: z.number(),
  vectorsDeleted: z.number(),
  duration: z.number(),
  errors: z.array(z.string()),
});

export const HealthCheckSchema = z.object({
  status: z.literal('ok'),
});

export const ErrorResponseSchema = z.object({
  error: z.string(),
});

export const SyncHistoryResponseSchema = z.object({
  history: z.array(SyncHistoryEntrySchema),
  count: z.number().optional(),
});

// TypeScript types inferred from schemas
export type SyncStatus = z.infer<typeof SyncStatusSchema>;
export type SyncStats = z.infer<typeof SyncStatsSchema>;
export type SyncHistoryEntry = z.infer<typeof SyncHistoryEntrySchema>;
export type HealthCheck = z.infer<typeof HealthCheckSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type SyncHistoryResponse = z.infer<typeof SyncHistoryResponseSchema>;
