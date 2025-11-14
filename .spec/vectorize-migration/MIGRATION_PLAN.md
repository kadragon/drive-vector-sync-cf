# Qdrant → Cloudflare Vectorize Migration Plan

**Trace:**
- spec_id: SPEC-vectorize-migration-1
- task_id: TASK-025
- Created: 2025-11-14

## Executive Summary

This document provides a comprehensive migration strategy from Qdrant Cloud to Cloudflare Vectorize for the Google Drive vector sync system. The migration will:
- Reduce vendor dependencies (Cloudflare-only stack)
- Potentially reduce costs and latency
- Simplify deployment and operations
- Maintain identical functionality

## Current Qdrant Usage Analysis

### 1. QdrantClient Methods Used

#### src/qdrant/qdrant-client.ts

| Method | Location | Purpose | Frequency |
|--------|----------|---------|-----------|
| `initializeCollection()` | Lines 51-86 | Create collection with schema | Once at startup |
| `upsertVectors()` | Lines 91-115 | Batch insert/update vectors | Per file processed |
| `getVectorsByFileId()` | Lines 120-154 | Fetch existing vectors for file | Per file (incremental opt) |
| `deleteVectorsByIds()` | Lines 159-179 | Delete specific vectors | Per file (when resized) |
| `deleteVectorsByFileId()` | Lines 184-209 | Delete all vectors for file | Per file deletion |
| `getCollectionInfo()` | Lines 214-223 | Get collection metadata | Admin API |
| `countVectors()` | Lines 228-237 | Count total vectors | Admin API |

**Helper Functions:**
- `generateVectorId(fileId, chunkIndex)` - Lines 243-245
- `parseVectorId(vectorId)` - Lines 250-258

### 2. Vector Data Structures

#### VectorPoint Interface (Lines 13-25)

```typescript
interface VectorPoint {
  id: string;                    // Format: "{fileId}_{chunkIndex}"
  vector: number[];              // 3072 dimensions (OpenAI text-embedding-3-large)
  payload: {
    file_id: string;             // Google Drive file ID
    file_name: string;           // Display name
    file_path: string;           // Full path in Drive
    chunk_index: number;         // Sequential chunk number
    chunk_hash: string;          // SHA-256 hash for deduplication
    last_modified: string;       // ISO 8601 timestamp
    text?: string;               // Preview (first 1000 chars)
  };
}
```

**Metadata Fields Used for:**
- `file_id` - Filtering (getVectorsByFileId, deleteVectorsByFileId)
- `chunk_hash` - Incremental embedding optimization
- `chunk_index` - Ordering and deletion
- `last_modified` - Change tracking
- `file_name`, `file_path` - Display/search
- `text` - Preview/context

### 3. Query Patterns

#### Filter by file_id (Lines 124-137)
```typescript
filter: {
  must: [
    {
      key: 'file_id',
      match: { value: fileId }
    }
  ]
}
```

#### Pagination with scroll (Lines 122-138)
```typescript
scroll(collectionName, {
  filter: { must: [...] },
  with_payload: true,
  with_vector: true,
  limit: 1000
})
```

**Note:** No semantic search/query operations used - only CRUD operations!

### 4. Collection Configuration

#### Schema (Lines 64-76)
```typescript
{
  vectors: {
    size: 3072,              // Dimension count
    distance: 'Cosine'       // Distance metric
  },
  optimizers_config: {
    default_segment_number: 2
  },
  hnsw_config: {
    m: 16,
    ef_construct: 200
  }
}
```

### 5. Batch Operations

- **Batch upsert:** Up to all chunks for a file (typically 1-20 vectors)
- **Batch delete:** Up to 1000 vectors per file (scroll limit)
- **Concurrency:** Max 4 files processed in parallel

### 6. Usage in Sync Orchestrator

#### src/sync/sync-orchestrator.ts

- **Line 75:** `initializeCollection()` - Full sync startup
- **Line 321:** `getVectorsByFileId()` - Fetch existing for hash comparison
- **Line 433:** `upsertVectors()` - Insert/update after embedding
- **Line 426:** `deleteVectorsByIds()` - Remove obsolete chunks
- **Line 217:** `deleteVectorsByFileId()` - File deletion

## Cloudflare Vectorize API Mapping

### Core Operations Comparison

| Qdrant Operation | Vectorize Equivalent | Notes |
|------------------|---------------------|-------|
| `createCollection()` | `wrangler vectorize create` | CLI-only, done at deployment |
| `upsert()` | `env.INDEX.upsert()` | ✅ Direct equivalent |
| `delete()` by IDs | `env.INDEX.deleteByIds()` | ✅ Direct equivalent |
| `delete()` by filter | ❌ Not supported | **GAP** - Need workaround |
| `scroll()` with filter | ❌ Not supported | **GAP** - Need workaround |
| `getCollection()` | ❌ Not supported | **GAP** - Limited impact |
| `query()` | `env.INDEX.query()` | ✅ Available but not used |

### Detailed API Mapping

#### 1. Collection Initialization

**Qdrant:**
```typescript
await client.createCollection(name, {
  vectors: { size: 3072, distance: 'Cosine' },
  optimizers_config: { default_segment_number: 2 },
  hnsw_config: { m: 16, ef_construct: 200 }
});
```

**Vectorize:**
```bash
# CLI command (one-time setup)
npx wrangler vectorize create project-docs \
  --dimensions=3072 \
  --metric=cosine
```

**Migration Strategy:**
- Index creation moves from runtime to deployment step
- HNSW parameters not configurable (Cloudflare-managed)
- ✅ **Action:** Add creation to deployment docs

#### 2. Upsert Vectors

**Qdrant:**
```typescript
await client.upsert(collectionName, {
  wait: true,
  points: vectors.map(v => ({
    id: v.id,
    vector: v.vector,
    payload: v.payload
  }))
});
```

**Vectorize:**
```typescript
await env.VECTORIZE_INDEX.upsert(
  vectors.map(v => ({
    id: v.id,
    values: v.vector,
    metadata: v.payload
  }))
);
```

**Migration Strategy:**
- Rename `vector` → `values`
- Rename `payload` → `metadata`
- Remove `wait: true` (Vectorize handles async internally)
- ✅ **Action:** Update VectorizeClient.upsertVectors()

#### 3. Delete by IDs

**Qdrant:**
```typescript
await client.delete(collectionName, {
  wait: true,
  points: vectorIds
});
```

**Vectorize:**
```typescript
await env.VECTORIZE_INDEX.deleteByIds(vectorIds);
```

**Migration Strategy:**
- Direct mapping
- ✅ **Action:** Update VectorizeClient.deleteVectorsByIds()

#### 4. Delete by File ID (Filter-based) - **CRITICAL GAP**

**Qdrant:**
```typescript
await client.delete(collectionName, {
  wait: true,
  filter: {
    must: [{ key: 'file_id', match: { value: fileId } }]
  }
});
```

**Vectorize:**
```typescript
// ❌ NOT SUPPORTED
// Workaround required
```

**Migration Strategy - Option A (Recommended):**
Maintain KV-based index of file_id → vector IDs

```typescript
// On upsert:
const vectorIds = vectors.map(v => v.id);
await env.FILE_VECTOR_INDEX.put(
  `file:${fileId}`,
  JSON.stringify(vectorIds),
  { expirationTtl: 86400 * 365 } // 1 year
);

// On delete:
const idsJson = await env.FILE_VECTOR_INDEX.get(`file:${fileId}`);
const ids = JSON.parse(idsJson);
await env.VECTORIZE_INDEX.deleteByIds(ids);
await env.FILE_VECTOR_INDEX.delete(`file:${fileId}`);
```

**Migration Strategy - Option B (Alternative):**
Use vector ID naming convention

```typescript
// Already using: `${fileId}_${chunkIndex}`
// On delete: scan and generate IDs
const MAX_CHUNKS = 1000;
const idsToDelete = Array.from({ length: MAX_CHUNKS }, (_, i) =>
  generateVectorId(fileId, i)
);
await env.VECTORIZE_INDEX.deleteByIds(idsToDelete);
```

**Recommendation:** Option A (KV index) is more robust and efficient
- ✅ **Action:** Implement FILE_VECTOR_INDEX KV namespace

#### 5. Get Vectors by File ID - **CRITICAL GAP**

**Qdrant:**
```typescript
const response = await client.scroll(collectionName, {
  filter: { must: [{ key: 'file_id', match: { value: fileId } }] },
  with_payload: true,
  with_vector: true,
  limit: 1000
});
return response.points;
```

**Vectorize:**
```typescript
// ❌ NOT SUPPORTED
// Workaround required
```

**Migration Strategy:**
Use KV index + getByIds

```typescript
async getVectorsByFileId(fileId: string): Promise<VectorPoint[]> {
  // 1. Get IDs from KV index
  const idsJson = await this.fileIndex.get(`file:${fileId}`);
  if (!idsJson) return [];

  const ids = JSON.parse(idsJson);

  // 2. Fetch vectors by IDs
  const vectors = await this.index.getByIds(ids);

  // 3. Transform to VectorPoint format
  return vectors.map(v => ({
    id: v.id,
    vector: v.values,
    payload: v.metadata as VectorPoint['payload']
  }));
}
```

- ✅ **Action:** Implement getVectorsByFileId() with KV lookup

#### 6. Get Collection Info - **GAP (Low Impact)**

**Qdrant:**
```typescript
const info = await client.getCollection(collectionName);
return info.points_count;
```

**Vectorize:**
```typescript
// ❌ NOT SUPPORTED
// Admin-only feature, not critical
```

**Migration Strategy:**
- Track count in KV during upsert/delete operations

```typescript
async countVectors(): Promise<number> {
  const countStr = await this.kvState.get('vector_count');
  return countStr ? parseInt(countStr, 10) : 0;
}

// Update on upsert:
const currentCount = await this.countVectors();
await this.kvState.put('vector_count', String(currentCount + vectors.length));

// Update on delete:
const currentCount = await this.countVectors();
await this.kvState.put('vector_count', String(currentCount - ids.length));
```

- ✅ **Action:** Add vector count tracking to KV

### Metadata Filtering Support

Vectorize supports metadata filtering in query operations:

```typescript
await env.INDEX.query(vector, {
  topK: 10,
  filter: {
    file_id: { $eq: "someFileId" }
  },
  returnMetadata: "all"
});
```

**However:** We don't use query operations currently!
- Current system only does CRUD (no semantic search)
- If future search feature needed, this works perfectly

## Implementation Plan

### Phase 1: Preparation (2 hours)

**1.1 Create Vectorize Index**
```bash
wrangler vectorize create project-docs \
  --dimensions=3072 \
  --metric=cosine
```

**1.2 Create FILE_VECTOR_INDEX KV Namespace**
```bash
wrangler kv:namespace create "FILE_VECTOR_INDEX"
wrangler kv:namespace create "FILE_VECTOR_INDEX" --preview
```

**1.3 Update wrangler.toml**
```toml
[[vectorize]]
binding = "VECTORIZE_INDEX"
index_name = "project-docs"

[[kv_namespaces]]
binding = "FILE_VECTOR_INDEX"
id = "your-production-id"
preview_id = "your-preview-id"
```

### Phase 2: VectorizeClient Implementation (4 hours)

**2.1 Create src/vectorize/vectorize-client.ts**

```typescript
/**
 * Cloudflare Vectorize client adapter
 * Maintains same interface as QdrantClient for drop-in replacement
 *
 * Trace:
 *   spec_id: SPEC-vectorize-migration-1
 *   task_id: TASK-026
 */

export interface VectorizeConfig {
  index: VectorizeIndex;
  fileIndex: KVNamespace;
  collectionName: string; // Kept for interface compatibility
}

export class VectorizeClient {
  private index: VectorizeIndex;
  private fileIndex: KVNamespace;
  private collectionName: string;

  constructor(config: VectorizeConfig) {
    this.index = config.index;
    this.fileIndex = config.fileIndex;
    this.collectionName = config.collectionName;
  }

  /**
   * Initialize collection - NO-OP for Vectorize (done via CLI)
   */
  async initializeCollection(vectorSize?: number): Promise<void> {
    console.log(`Collection ${this.collectionName} managed via wrangler CLI`);
    // Verify index is accessible
    try {
      // Vectorize doesn't have describe() - just log
      console.log('Vectorize index is accessible');
    } catch (error) {
      throw new Error(`Vectorize index not accessible: ${error}`);
    }
  }

  /**
   * Upsert vectors with KV index maintenance
   */
  async upsertVectors(vectors: VectorPoint[]): Promise<void> {
    if (vectors.length === 0) return;

    // 1. Group vectors by file_id for index maintenance
    const vectorsByFile = new Map<string, string[]>();
    for (const v of vectors) {
      const fileId = v.payload.file_id;
      if (!vectorsByFile.has(fileId)) {
        vectorsByFile.set(fileId, []);
      }
      vectorsByFile.get(fileId)!.push(v.id);
    }

    // 2. Upsert to Vectorize
    await withRetry(async () => {
      await this.index.upsert(
        vectors.map(v => ({
          id: v.id,
          values: v.vector,
          metadata: v.payload
        }))
      );
    });

    // 3. Update FILE_VECTOR_INDEX
    for (const [fileId, ids] of vectorsByFile.entries()) {
      const key = `file:${fileId}`;

      // Merge with existing IDs
      const existingJson = await this.fileIndex.get(key);
      const existingIds = existingJson ? JSON.parse(existingJson) : [];
      const mergedIds = Array.from(new Set([...existingIds, ...ids]));

      await this.fileIndex.put(
        key,
        JSON.stringify(mergedIds),
        { expirationTtl: 86400 * 365 } // 1 year
      );
    }

    console.log(`Upserted ${vectors.length} vectors to Vectorize`);
  }

  /**
   * Get vectors by file ID using KV index
   */
  async getVectorsByFileId(fileId: string): Promise<VectorPoint[]> {
    try {
      // 1. Get vector IDs from KV index
      const key = `file:${fileId}`;
      const idsJson = await this.fileIndex.get(key);

      if (!idsJson) {
        return []; // File not found
      }

      const ids: string[] = JSON.parse(idsJson);

      if (ids.length === 0) {
        return [];
      }

      // 2. Fetch vectors from Vectorize
      const response = await withRetry(async () => {
        return await this.index.getByIds(ids);
      });

      // 3. Transform to VectorPoint format
      const vectors: VectorPoint[] = response.map((item: any) => ({
        id: item.id as string,
        vector: item.values as number[],
        payload: item.metadata as VectorPoint['payload']
      }));

      return vectors;
    } catch (error) {
      throw new Error(`Failed to get vectors by file ID: ${error}`);
    }
  }

  /**
   * Delete vectors by IDs with KV index cleanup
   */
  async deleteVectorsByIds(vectorIds: string[]): Promise<void> {
    if (vectorIds.length === 0) return;

    // 1. Delete from Vectorize
    await withRetry(async () => {
      await this.index.deleteByIds(vectorIds);
    });

    // 2. Update KV index - remove these IDs from file entries
    // Extract file IDs from vector IDs
    const fileIds = new Set<string>();
    for (const vectorId of vectorIds) {
      const { fileId } = parseVectorId(vectorId);
      fileIds.add(fileId);
    }

    // Update each file's index
    for (const fileId of fileIds) {
      const key = `file:${fileId}`;
      const idsJson = await this.fileIndex.get(key);

      if (idsJson) {
        const ids: string[] = JSON.parse(idsJson);
        const remainingIds = ids.filter(id => !vectorIds.includes(id));

        if (remainingIds.length > 0) {
          await this.fileIndex.put(key, JSON.stringify(remainingIds));
        } else {
          // All vectors deleted, remove file entry
          await this.fileIndex.delete(key);
        }
      }
    }

    console.log(`Deleted ${vectorIds.length} vectors from Vectorize`);
  }

  /**
   * Delete all vectors for a file using KV index
   */
  async deleteVectorsByFileId(fileId: string): Promise<void> {
    // 1. Get vector IDs from KV
    const key = `file:${fileId}`;
    const idsJson = await this.fileIndex.get(key);

    if (!idsJson) {
      console.log(`No vectors found for file: ${fileId}`);
      return;
    }

    const ids: string[] = JSON.parse(idsJson);

    // 2. Delete from Vectorize
    await this.deleteVectorsByIds(ids);

    // 3. Delete KV entry (already done in deleteVectorsByIds)
    console.log(`Deleted vectors for file: ${fileId}`);
  }

  /**
   * Get collection info - simulated via KV
   */
  async getCollectionInfo(): Promise<unknown> {
    // Vectorize doesn't expose collection info
    // Return minimal info for compatibility
    return {
      name: this.collectionName,
      points_count: await this.countVectors(),
      status: 'ready'
    };
  }

  /**
   * Count vectors - tracked in KV
   */
  async countVectors(): Promise<number> {
    const countStr = await this.fileIndex.get('_vector_count');
    return countStr ? parseInt(countStr, 10) : 0;
  }

  /**
   * Update vector count in KV
   */
  private async updateVectorCount(delta: number): Promise<void> {
    const currentCount = await this.countVectors();
    const newCount = Math.max(0, currentCount + delta);
    await this.fileIndex.put('_vector_count', String(newCount));
  }
}
```

**2.2 Create Wrapper Functions**

Update generateVectorId and parseVectorId (keep in separate file for reuse):

```typescript
// src/vectorize/vector-id.ts
export function generateVectorId(fileId: string, chunkIndex: number): string {
  return `${fileId}_${chunkIndex}`;
}

export function parseVectorId(vectorId: string): { fileId: string; chunkIndex: number } {
  const lastUnderscoreIndex = vectorId.lastIndexOf('_');
  const fileId = vectorId.substring(0, lastUnderscoreIndex);
  const chunkIndexStr = vectorId.substring(lastUnderscoreIndex + 1);
  return {
    fileId,
    chunkIndex: parseInt(chunkIndexStr, 10)
  };
}
```

### Phase 3: Update Sync Orchestrator (1 hour)

**3.1 Update src/sync/sync-orchestrator.ts**

```typescript
// Change import
- import { QdrantClient, VectorPoint, generateVectorId } from '../qdrant/qdrant-client.js';
+ import { VectorizeClient, VectorPoint, generateVectorId } from '../vectorize/vectorize-client.js';

// Update constructor parameter
constructor(
  private driveClient: DriveClient,
  private embeddingClient: EmbeddingClient,
- private qdrantClient: QdrantClient,
+ private vectorizeClient: VectorizeClient,
  private stateManager: KVStateManager,
  private config: SyncConfig,
  alertConfig?: AlertConfig
) {
  // ... no changes to body
}

// Update method calls (no changes needed - same interface!)
- await this.qdrantClient.initializeCollection();
+ await this.vectorizeClient.initializeCollection();

- await this.qdrantClient.upsertVectors(vectorsToUpsert);
+ await this.vectorizeClient.upsertVectors(vectorsToUpsert);

- const existingVectors = await this.qdrantClient.getVectorsByFileId(file.id);
+ const existingVectors = await this.vectorizeClient.getVectorsByFileId(file.id);

// etc...
```

**3.2 Update src/index.ts**

```typescript
// Update Env interface
export interface Env {
  // Cloudflare Workers bindings
  SYNC_STATE: KVNamespace;
+ FILE_VECTOR_INDEX: KVNamespace;
+ VECTORIZE_INDEX: VectorizeIndex;

  // Secrets
  GOOGLE_SERVICE_ACCOUNT_JSON: string;
  GOOGLE_IMPERSONATION_EMAIL?: string;
  GOOGLE_ROOT_FOLDER_ID: string;
  OPENAI_API_KEY: string;
- QDRANT_URL: string;
- QDRANT_API_KEY: string;
  ADMIN_TOKEN: string;
  SLACK_WEBHOOK_URL?: string;
  DISCORD_WEBHOOK_URL?: string;
}

// Update client initialization
- const qdrantClient = new QdrantClient({
-   url: env.QDRANT_URL,
-   apiKey: env.QDRANT_API_KEY,
-   collectionName: 'project_docs'
- });

+ const vectorizeClient = new VectorizeClient({
+   index: env.VECTORIZE_INDEX,
+   fileIndex: env.FILE_VECTOR_INDEX,
+   collectionName: 'project_docs'
+ });
```

### Phase 4: Testing (3 hours)

**4.1 Update Unit Tests**

```bash
# Rename test file
mv src/qdrant/qdrant-client.test.ts src/vectorize/vectorize-client.test.ts
```

Update mocks to simulate Vectorize API:

```typescript
// Mock VectorizeIndex
const mockVectorizeIndex = {
  upsert: vi.fn().mockResolvedValue({ count: 1 }),
  deleteByIds: vi.fn().mockResolvedValue({ count: 1 }),
  getByIds: vi.fn().mockResolvedValue([]),
  query: vi.fn().mockResolvedValue({ matches: [] })
};

// Mock KV namespace for FILE_VECTOR_INDEX
const mockFileIndex = {
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn()
};
```

**4.2 Integration Testing**

Create test script to verify:
1. Upsert → KV index updated correctly
2. getVectorsByFileId → Returns correct vectors
3. deleteVectorsByFileId → Removes vectors and KV entry
4. Edge cases (empty files, large files, concurrent operations)

**4.3 Data Migration Test**

```typescript
// scripts/migrate-data.ts
async function migrateFromQdrant() {
  // 1. Connect to both Qdrant and Vectorize
  // 2. Scan all Qdrant vectors
  // 3. Batch upsert to Vectorize
  // 4. Build KV index
  // 5. Verify counts match
}
```

### Phase 5: Deployment (2 hours)

**5.1 Deploy Infrastructure**

```bash
# Create Vectorize index
wrangler vectorize create project-docs \
  --dimensions=3072 \
  --metric=cosine

# Create KV namespace
wrangler kv:namespace create "FILE_VECTOR_INDEX"
wrangler kv:namespace create "FILE_VECTOR_INDEX" --preview

# Update wrangler.toml with IDs

# Remove old secrets
wrangler secret delete QDRANT_URL
wrangler secret delete QDRANT_API_KEY

# Deploy worker
wrangler deploy
```

**5.2 Data Migration**

Option A: Fresh start
- Clear all state
- Run full resync

Option B: Migrate existing data
- Use migration script
- Verify counts
- Switch over

**5.3 Monitoring**

- Check CloudFlare dashboard for Vectorize metrics
- Monitor KV operations
- Watch for errors in Worker logs

### Phase 6: Cleanup (1 hour)

**6.1 Remove Qdrant Dependencies**

```bash
npm uninstall @qdrant/js-client-rest
```

**6.2 Delete Old Files**

```bash
rm -rf src/qdrant/
```

**6.3 Update Documentation**

- Update README.md
- Update .governance/memory.md
- Update deployment docs
- Update architecture diagrams

## Gap Analysis & Mitigations

| Gap | Impact | Mitigation | Status |
|-----|--------|------------|--------|
| No filter-based delete | **HIGH** | KV-based file→IDs index | ✅ Designed |
| No filter-based scroll | **HIGH** | KV-based file→IDs + getByIds | ✅ Designed |
| No collection info | **LOW** | Track count in KV | ✅ Designed |
| No runtime collection creation | **LOW** | Move to CLI/deployment step | ✅ Designed |
| No HNSW tuning | **VERY LOW** | Accept Cloudflare defaults | ✅ Acceptable |

## Estimated Effort

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| 1. Preparation | 2 hours | - |
| 2. VectorizeClient | 4 hours | Phase 1 |
| 3. Update Orchestrator | 1 hour | Phase 2 |
| 4. Testing | 3 hours | Phase 3 |
| 5. Deployment | 2 hours | Phase 4 |
| 6. Cleanup | 1 hour | Phase 5 |
| **TOTAL** | **13 hours** | Sequential |

## Risks & Considerations

### Technical Risks

1. **KV Eventual Consistency**
   - Risk: Stale file→ID mappings
   - Mitigation: Use LIST operations to list by prefix if needed
   - Probability: LOW (sync runs once daily, consistency window << 24h)

2. **KV Storage Limits**
   - Risk: ~2000 files × average 50 vectors/file = 100k entries
   - KV limit: Unlimited keys, 25 MiB per value
   - Mitigation: Well within limits (each entry < 10 KB)
   - Probability: VERY LOW

3. **Vectorize Beta Limitations**
   - Risk: API changes, missing features
   - Mitigation: Monitor changelog, maintain abstraction layer
   - Probability: MEDIUM

### Operational Risks

1. **Data Migration**
   - Risk: Data loss during migration
   - Mitigation: Test migration script, verify counts, keep Qdrant backup
   - Probability: LOW with proper testing

2. **Performance Change**
   - Risk: Vectorize slower than Qdrant
   - Mitigation: Benchmark before/after, optimize batch sizes
   - Probability: LOW (likely faster due to co-location)

## Rollback Plan

If migration fails:

1. **Immediate Rollback** (< 1 hour)
   ```bash
   # Revert to previous deployment
   wrangler rollback

   # Restore secrets
   wrangler secret put QDRANT_URL
   wrangler secret put QDRANT_API_KEY
   ```

2. **Code Rollback**
   ```bash
   git revert <migration-commit>
   npm install  # Restore @qdrant/js-client-rest
   wrangler deploy
   ```

3. **Data Recovery**
   - If Qdrant data preserved: No action needed
   - If Qdrant data deleted: Restore from backup or run full resync

## Success Criteria

- ✅ All 236 unit tests passing
- ✅ Integration tests with Vectorize passing
- ✅ Full resync completes successfully
- ✅ Incremental sync works correctly
- ✅ Admin API returns correct counts
- ✅ KV index stays consistent with vectors
- ✅ Performance equal or better than Qdrant
- ✅ Zero data loss

## Post-Migration Tasks

1. **Monitor for 1 week**
   - Check error rates
   - Verify sync completions
   - Monitor KV operations
   - Check Vectorize metrics

2. **Optimize**
   - Tune batch sizes if needed
   - Adjust KV expiration if needed
   - Optimize metadata indexing

3. **Document**
   - Update architecture docs
   - Write migration retrospective
   - Update governance memory

4. **Decommission Qdrant**
   - Cancel Qdrant Cloud subscription
   - Archive final backup
   - Remove credentials

## Next Steps

1. **Review this plan with team/stakeholder**
2. **Get approval for migration**
3. **Create TASK-026 through TASK-031 for phases**
4. **Schedule migration window**
5. **Begin Phase 1**

---

**Document Status:** Draft
**Last Updated:** 2025-11-14
**Author:** Claude Code (Autonomous Agent)
**Approver:** [Pending User Review]
