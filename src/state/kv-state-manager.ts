/**
 * KV State Manager for persisting sync state
 *
 * Trace:
 *   spec_id: SPEC-state-management-1
 *   task_id: TASK-008
 */

export interface SyncState {
  startPageToken: string | null;
  lastSyncTime: string | null;
  filesProcessed: number;
  errorCount: number;
}

const STATE_KEY = 'drive_start_page_token';
const SYNC_LOCK_KEY = 'sync_lock';
const LOCK_DURATION_MS = 1000 * 60 * 30; // 30 minutes

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
}
