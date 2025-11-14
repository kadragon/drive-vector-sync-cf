# Qdrant → Cloudflare Vectorize Migration Analysis

Trace:
  spec_id: SPEC-vectorize-migration-1
  task_id: TASK-025

## Repository Touchpoints Snapshot

| Area | Responsibility | References |
| --- | --- | --- |
| Client wrapper | Encapsulates Qdrant operations with retry + typed payloads | `src/qdrant/qdrant-client.ts:13-258`
| Sync pipeline | Calls Qdrant methods for initialization, delta handling, dedup, and deletions | `src/sync/sync-orchestrator.ts:72-435`
| Admin API | Exposes `/admin/stats` built on collection info + vector counts | `src/api/admin-handler.ts:43-124`
| Runtime wiring | Injects Qdrant config via Worker env + Wrangler vars | `src/index.ts:21-102`, `wrangler.toml:16-40`
| Monitoring | Tracks Qdrant call counts/costs and configurable rate limits | `src/monitoring/metrics.ts:8-188`, `src/monitoring/cost-tracker.ts:21-180`, `src/monitoring/rate-limiter.ts:85-120`
| Governance | Captures Qdrant schema defaults in env memory | `.governance/env.yaml:33-57`

## 1. QdrantClient Methods → Cloudflare Vectorize Mapping

| Qdrant operation | Current behavior | Vectorize equivalent | Gaps & migration strategy |
| --- | --- | --- | --- |
| `initializeCollection()` | Checks existence via `getCollections`, then creates `project_docs` (3072 dims, cosine, custom `optimizers_config` + HNSW `m=16`, `ef_construct=200`) with retry logging | Vectorize indexes are provisioned outside the Worker (`wrangler vectorize create` or API), and bound via `[[vectorize]]` → `env.VECTORIZE_INDEX`. Use `describe()` to confirm shape (`node_modules/@cloudflare/workers-types/oldest/index.d.ts:9899-9935`, `9979-10019`). | Remove runtime create logic; add infra step to create the index (dimensions 3072, metric `cosine`). Document lack of per-index optimizer knobs (Vectorize manages ANN settings). Keep a lightweight startup check that calls `await env.VECTORIZE_INDEX.describe()` and alerts on mismatch rather than creating collections. |
| `upsertVectors(points)` | Batches `VectorPoint[]`, enforces `wait:true`, retries on failure, logs counts (`src/qdrant/qdrant-client.ts:88-115`). Called after reuse/new embeddings and chunk-pruning (`src/sync/sync-orchestrator.ts:349-435`). | `env.VECTORIZE_INDEX.upsert()` accepts `VectorizeVector[]` with `id`, `values`, `metadata` (`node_modules/...:9927-9935`, `10025-10062`). | Vectorize mutations are async (returns `mutationId`), so there is no `wait:true`. Need to persist mutation IDs (e.g., log + KV) and optionally poll `describe().processedUpToMutation` until it includes the ID before updating state. Convert payload to `{ id, values: Float32Array, metadata }`. |
| `getVectorsByFileId(fileId)` | Uses `scroll` with `filter.file_id == value`, returns up to 1000 vectors with vectors + payloads for incremental dedup (`src/qdrant/qdrant-client.ts:117-154`, `src/sync/sync-orchestrator.ts:316-347`). | Vectorize does **not** expose a `scroll`/filter-only read. Available options are `query(vector, { filter })`, `queryById(id, ...)`, or `getByIds(ids)` (`node_modules/...:9875-9880`, `10025-10074`). | Because dedup needs all chunks for a file, introduce a manifest keyed by `file_id` in KV (store chunk indices + hashes + last mutationId). Use that manifest (or deterministic ranges) with `getByIds()` to fetch only required IDs. As a fallback, store per-file metadata in R2/D1 if manifests grow large. |
| `deleteVectorsByIds(ids)` | Exact deletion for missing chunks before re-upsert (`src/qdrant/qdrant-client.ts:156-179`, `src/sync/sync-orchestrator.ts:416-427`). | `env.VECTORIZE_INDEX.deleteByIds(ids)` removes matching vectors (`node_modules/...:10064-10068`). | Same semantics. Maintain existing retry + metrics wrappers, but ensure batches stay within Vectorize payload limits (currently 1 MiB per mutation). Consider chunking deletions if files can exceed ~500 vectors. |
| `deleteVectorsByFileId(fileId)` | Filter delete for Drive deletions (`src/qdrant/qdrant-client.ts:181-208`, `src/sync/sync-orchestrator.ts:211-229`). | No metadata/bulk delete API. Must compute IDs (e.g., read manifest, derive deterministic `fileId_chunkIndex` range, or track namespaces) and invoke `deleteByIds`. | Action items: (1) persist vector count per file in KV when upserting, (2) on deletion, read manifest → call `deleteByIds`, (3) prune manifest entry. |
| `getCollectionInfo()` / `countVectors()` | Used by `/admin/stats` to report collection name/status + total vectors (`src/qdrant/qdrant-client.ts:211-237`, `src/api/admin-handler.ts:112-124`). | `env.VECTORIZE_INDEX.describe()` returns `dimensions`, `vectorCount`, `processedUpTo...` (`node_modules/...:10025-10037`). | Replace stats endpoint to surface Vectorize metadata (vectorCount, dimension, processedUpToMutation). No status field yet; expose `mutationLag = now - processedUpToDatetime` for monitoring. |

## 2. Vector Data Structures & Metadata Schemas

- `VectorPoint` wraps embeddings plus payload fields `file_id`, `file_name`, `file_path`, `chunk_index`, `chunk_hash`, `last_modified`, optional `text` snippet (`src/qdrant/qdrant-client.ts:13-24`). `SyncOrchestrator.processFile` reuses these keys for both reused and re-embedded chunks, truncating `text` to 1 000 chars and ensuring deterministic IDs via `generateVectorId(fileId, chunkIndex)` (`src/sync/sync-orchestrator.ts:349-435`).
- Cloudflare metadata only accepts primitives / string arrays (`node_modules/@cloudflare/workers-types/oldest/index.d.ts:9815-9858`). All existing payload fields conform, but long `text` bodies should be marked non-indexed (store for display only). Recommendation: split metadata into (a) indexed filter fields (`file_id`, `chunk_index`, `chunk_hash`, `last_modified`) and (b) stored-only blob fields (prefix with `raw_` or move text to KV/R2) to stay under Vectorize metadata truncation limits.
- Consider setting `namespace = file_id` when inserting vectors (`node_modules/...:9927-9935`) so similarity queries can be scoped per file when needed, even though deletes still require ID lists.
- Maintain hash manifest (KV) keyed by `file_id` storing `chunk_index → chunk_hash` and `mutationId`. This replaces the current dependency on `scroll` for dedup and gives you a single source of truth for Vectorize deletes/updates.

## 3. Query Patterns & Filters

1. **Incremental dedup** – `getVectorsByFileId` + hash map enables selective embedding reuse (`src/sync/sync-orchestrator.ts:316-383`). In Vectorize, replicate behavior via KV manifest + `getByIds` for only the chunk IDs you expect. If you need metadata validation, call `await env.VECTORIZE_INDEX.getByIds(manifest.ids)`.
2. **Deletion handling** – Drive delete events call `deleteVectorsByFileId` to filter by `file_id` (`src/sync/sync-orchestrator.ts:211-221`). Replace with manifest-driven ID delete. Optionally, keep a fallback script that issues account-level `vectorize delete --where file_id='...'` via DevOps tooling if a manifest ever corrupts.
3. **Admin stats** – Current `/admin/stats` invokes `getCollectionInfo` and `countVectors` (`src/api/admin-handler.ts:112-124`). Switch to `describe()` output: expose `vectorCount`, `dimensions`, `processedUpToMutation`, maybe the new index name bound in Wrangler.
4. **Future similarity queries** – Vectorize `query` supports metadata filters and `returnMetadata` controls (`node_modules/...:9875-9880`, `10025-10046`). When you later build retrieval APIs, align payload field names with Vectorize filter syntax (`$eq`, `$in`, etc.) so you can filter by `file_id`/`file_path` without extra storage.

## 4. Batch Operations, Concurrency & Performance Patterns

- Batching happens in two places: (a) chunk-level reuse vs. re-embed to minimize embedding/API calls, (b) concurrency window (`maxConcurrency`) in `runFullSync` and incremental change loop (`src/sync/sync-orchestrator.ts:83-235`).
- Each Qdrant mutation is wrapped in `withRetry` and instrumented via `MetricsCollector.recordQdrantApiCall` and `CostTracker.recordQdrantOperation` (`src/qdrant/qdrant-client.ts:63-199`, `src/monitoring/metrics.ts:68-188`, `src/monitoring/cost-tracker.ts:60-180`). Keep the same abstractions but rename metrics/cost keys to `vectorize` to avoid confusion.
- Rate limiting: `RateLimiterFactory.createQdrantLimiter(maxRequestsPerMinute)` provides token-bucket helpers for Qdrant-specific quotas (`src/monitoring/rate-limiter.ts:85-120`). Update this factory to produce `createVectorizeLimiter` with plan-specific throughput (Vectorize currently throttles at ~2 000 ops/minute per account; confirm with Cloudflare).
- **Vectorize-specific considerations**:
  - Mutations return `mutationId` asynchronously (`node_modules/...:10025-10074`), so you may need a lightweight queue that polls `describe()` until `processedUpToMutation >= mutationId` before mutating manifests/state.
  - Payload size limit is 1 MiB per insert/upsert/delete request. Keep the existing batching logic, but add a guard that splits `vectorsToUpsert` into ~200 chunks when `text` metadata is large.
  - Because `getVectorsByFileId` is no longer available, manifest updates and KV transactions become part of the “batch operation.” Wrap them in the same retry/error-collector workflow used for Qdrant.

## 5. Collection Initialization & Configuration

- Runtime configuration currently lives in Worker env + Wrangler vars/secrets: `QDRANT_URL`, `QDRANT_API_KEY`, `QDRANT_COLLECTION_NAME` (`src/index.ts:21-86`, `wrangler.toml:16-40`). `.governance/env.yaml` locks in `vector_size: 3072`, `distance: cosine`, and HNSW parameters for Qdrant.
- Vectorize setup shifts responsibilities:
  1. **Provisioning** – Create an index once via `wrangler vectorize create project_docs --dimensions 3072 --metric cosine` (or dashboard). Since runtime creation disappears, update `initializeCollection` to perform a describe + schema assertion and emit alert if mismatched.
  2. **Bindings** – Add `[[vectorize]] binding = "PROJECT_DOCS" index_name = "project_docs"` to `wrangler.toml`, and update `Env` to expose `PROJECT_DOCS: Vectorize` instead of the Qdrant URL/key trio.
  3. **Secrets cleanup** – Remove `QDRANT_URL` and `QDRANT_API_KEY`; Cloudflare handles auth via bindings. Document new command sequence in `.governance/env.yaml` + README.
  4. **Parameters** – Vectorize hides low-level ANN tuning; highlight in docs that `optimizers_config` and `hnsw_config` are no longer user-settable. If similar control is required, track open feature request with Cloudflare.

## 6. Error Handling & Observability Patterns

- `QdrantError` extends the shared `SyncError` hierarchy and every client method wraps failures with context plus exponential retry (`src/errors/index.ts:9-133`, `src/qdrant/qdrant-client.ts:48-209`). Errors propagate into `ErrorCollector` and alerting pipelines (`src/sync/sync-orchestrator.ts:65-288`).
- Migration actions:
  - Introduce `VectorizeError` to keep error taxonomy consistent. Wrap `Vectorize` SDK errors (or `FetchError` if using REST) with the mutationId, namespace, and manifest IDs for debuggability.
  - Because Vectorize mutations are async, treat `mutationId` absence/timeout as an error condition. Extend `ErrorCollector` context to include `mutationId`, `vectorCount`, and `operation` for easier tracing.
  - Update metrics/cost trackers to rename counters (`qdrantApiCalls` → `vectorIndexCalls`, etc.) but preserve structure so alerting stays intact.

## 7. Recommended Migration Plan

1. **Infra preparation** – Create Vectorize index (3072 dims, cosine), bind it in Wrangler, remove Qdrant secrets, and update deployment docs.
2. **Client abstraction** – Build `VectorizeClient` mirroring the old `QdrantClient` API surface so the orchestrator remains stable. Methods should internally call `env.PROJECT_DOCS` (exposed via dependency injection for testability).
3. **State rework for dedup/deletes** – Implement KV manifest per file_id capturing `chunk_index`, `chunk_hash`, `vector_id`, last `mutationId`. Migrate orchestrator logic to rely on manifests instead of `scroll`/filter deletes. Backfill manifests by scanning Qdrant once prior to cutover.
4. **Async mutation tracking** – Extend state manager to persist last successful Vectorize `mutationId` and add a watcher that compares `processedUpToMutation` (from `describe()`) before marking sync finished.
5. **Monitoring refresh** – Rename cost/metric labels, add mutation lag measurement, and tune rate limiter defaults for Vectorize service limits.
6. **Cleanup** – Remove `@qdrant/js-client-rest` dependency (`package.json:41-47`), drop `initializeCollection` creation logic, and update specs/tests (especially `src/qdrant/qdrant-client.test.ts`) to target the new client and manifest-driven flows.
