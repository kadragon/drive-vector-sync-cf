/**
 * KV State Manager for persisting sync state
 *
 * Trace:
 *   spec_id: SPEC-state-management-1
 *   task_id: TASK-008, TASK-028
 */

export interface SyncState {
  startPageToken: string | null;
  lastSyncTime: string | null;
  filesProcessed: number;
  errorCount: number;
  lastSyncDuration?: number; // Duration in milliseconds
}

/**
 * Sync history entry for dashboard charting
 */
export interface SyncHistoryEntry {
  timestamp: string;
  filesProcessed: number;
  vectorsUpserted: number;
  vectorsDeleted: number;
  duration: number;
  errors: string[];
}

const STATE_KEY = 'drive_start_page_token';
const SYNC_LOCK_KEY = 'sync_lock';
const SYNC_HISTORY_PREFIX = 'sync_history_';
const LOCK_DURATION_MS = 1000 * 60 * 30; // 30 minutes
const MAX_HISTORY_ENTRIES = 30; // Rolling window size

/**
 * Manages sync state persistence using Cloudflare KV
 */
export class KVStateManager {
  constructor(private kv: KVNamespace) {}

  /**
   * Get current sync state
   */
  async getState(): Promise<SyncState> {
    const stateJson = await this.kv.get(STATE_KEY, 'json');

    if (!stateJson) {
      return {
        startPageToken: null,
        lastSyncTime: null,
        filesProcessed: 0,
        errorCount: 0,
      };
    }

    return stateJson as SyncState;
  }

  /**
   * Save sync state
   */
  async setState(state: SyncState): Promise<void> {
    await this.kv.put(STATE_KEY, JSON.stringify(state));
  }

  /**
   * Update only the startPageToken
   */
  async updateStartPageToken(token: string): Promise<void> {
    const currentState = await this.getState();
    currentState.startPageToken = token;
    currentState.lastSyncTime = new Date().toISOString();
    await this.setState(currentState);
  }

  /**
   * Clear all state (for full resync)
   */
  async clearState(): Promise<void> {
    await this.kv.delete(STATE_KEY);
  }

  /**
   * Acquire lock to prevent concurrent syncs
   * Returns true if lock acquired, false if already locked
   */
  async acquireLock(): Promise<boolean> {
    const existingLock = await this.kv.get(SYNC_LOCK_KEY);

    if (existingLock) {
      const lockTime = parseInt(existingLock, 10);
      const now = Date.now();

      // Check if lock is still valid
      if (now - lockTime < LOCK_DURATION_MS) {
        return false;
      }
    }

    // Acquire lock
    await this.kv.put(SYNC_LOCK_KEY, Date.now().toString(), {
      expirationTtl: Math.floor(LOCK_DURATION_MS / 1000),
    });

    return true;
  }

  /**
   * Release sync lock
   */
  async releaseLock(): Promise<void> {
    await this.kv.delete(SYNC_LOCK_KEY);
  }

  /**
   * Update sync statistics
   */
  async updateStats(filesProcessed: number, errorCount: number): Promise<void> {
    const currentState = await this.getState();
    currentState.filesProcessed += filesProcessed;
    currentState.errorCount += errorCount;
    await this.setState(currentState);
  }

  /**
   * Check if sync is currently locked (in progress)
   */
  async isLocked(): Promise<boolean> {
    const existingLock = await this.kv.get(SYNC_LOCK_KEY);

    if (!existingLock) {
      return false;
    }

    const lockTime = parseInt(existingLock, 10);
    const now = Date.now();

    // Check if lock is still valid
    return now - lockTime < LOCK_DURATION_MS;
  }

  /**
   * Update last sync duration
   */
  async updateSyncDuration(duration: number): Promise<void> {
    const currentState = await this.getState();
    currentState.lastSyncDuration = duration;
    await this.setState(currentState);
  }

  /**
   * Save sync history entry
   * Maintains a rolling window of MAX_HISTORY_ENTRIES
   */
  async saveSyncHistory(entry: SyncHistoryEntry): Promise<void> {
    const timestamp = new Date(entry.timestamp).getTime();
    const key = `${SYNC_HISTORY_PREFIX}${timestamp}`;

    // Save the new entry
    await this.kv.put(key, JSON.stringify(entry));

    // Get ALL history keys directly from KV
    const list = await this.kv.list({ prefix: SYNC_HISTORY_PREFIX });

    if (list.keys.length > MAX_HISTORY_ENTRIES) {
      // Sort by timestamp (extract from key name: sync_history_{timestamp})
      const sortedKeys = list.keys
        .map(k => ({
          name: k.name,
          timestamp: parseInt(k.name.replace(SYNC_HISTORY_PREFIX, ''), 10),
        }))
        .sort((a, b) => b.timestamp - a.timestamp); // Newest first

      // Delete oldest entries (beyond MAX_HISTORY_ENTRIES)
      const keysToDelete = sortedKeys.slice(MAX_HISTORY_ENTRIES);
      for (const key of keysToDelete) {
        await this.kv.delete(key.name);
      }
    }
  }

  /**
   * Get sync history entries
   * @param limit Maximum number of entries to return (default: 30)
   * @returns Array of sync history entries, sorted by timestamp (newest first)
   */
  async getSyncHistory(limit: number = 30): Promise<SyncHistoryEntry[]> {
    const entries: SyncHistoryEntry[] = [];

    // List all keys with the sync_history prefix
    const list = await this.kv.list({ prefix: SYNC_HISTORY_PREFIX });

    // Fetch all history entries
    for (const key of list.keys) {
      const entryJson = await this.kv.get(key.name, 'json');
      if (entryJson) {
        entries.push(entryJson as SyncHistoryEntry);
      }
    }

    // Sort by timestamp (newest first) and limit
    return entries
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }
}
