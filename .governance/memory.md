# Governance Memory

## Project Overview

**Project Name:** Google Drive → Qdrant Vector Sync System
**Platform:** Cloudflare Workers
**Purpose:** Automated RAG data pipeline that syncs Google Drive Markdown files to Qdrant Cloud

## Architecture Decisions

### Core Components
1. **Cloudflare Workers** - Serverless execution environment
2. **Google Drive API** - Source document repository
3. **OpenAI Embedding API** - text-embedding-3-large model (3072 dimensions)
4. **Qdrant Cloud** - Vector database storage (cosine distance, HNSW indexing)
5. **Cloudflare KV** - State persistence (startPageToken, sync metadata)

### Key Design Decisions
- **Incremental Updates**: Use Google Drive `changes` API with startPageToken
- **Embedding Strategy**: Full document if under token limit, else chunk at 2000 tokens
- **Vector ID Format**: `{file_id}_{chunk_index}`
- **Scheduling**: Daily cron at KST 01:00 (17:00 UTC)
- **Error Handling**: Exponential backoff retry (3 attempts), toError() for safe type conversion
- **Concurrency Control**: Lock mechanism in KV to prevent parallel sync executions

## Performance Constraints
- Total corpus: ~2000 files × 50KB = ~100MB
- Daily changes: ~10 files (lightweight)
- Batch embedding: 16-32 chunks per request
- Parallel processing: Max concurrency of 4

## Security Notes
- All credentials in Cloudflare Secrets
- OAuth2 tokens for Google Drive (refresh token flow)
- Qdrant API keys in Secrets
- Admin API protected with Bearer token authentication
- KV for state persistence only

## Known Patterns
- Use Promise.allSettled with toError() for safe error handling
- Batch OpenAI embedding calls for efficiency
- Maintain idempotency with vector ID schema
- Generate vector IDs using lastIndexOf('_') to handle file IDs with underscores

## Implemented Modules (Session 2)

### State Management (`src/state/`)
- KVStateManager with get/set/clear operations
- Lock mechanism (30min TTL) for concurrent execution prevention
- Stats tracking (filesProcessed, errorCount)
- **Tests:** 11 passing

### Error Handling (`src/errors/`)
- Custom error classes: SyncError, DriveError, EmbeddingError, QdrantError, StateError
- withRetry() with exponential backoff
- toError() utility for safe unknown → Error conversion
- ErrorCollector for aggregating errors during sync
- **Tests:** 21 passing

### Drive Integration (`src/drive/`)
- OAuth2Client with refresh token flow
- Recursive folder scanning with pagination
- Changes API for incremental sync
- File content download
- **Tests:** Unit tests completed (mocked in other modules)

### Embedding Pipeline (`src/embedding/`)
- tiktoken-based token counting (cl100k_base)
- Text chunking at 2000 token boundaries
- OpenAI text-embedding-3-large integration
- Batch processing with configurable batch size
- **Tests:** 17 passing (chunking)

### Qdrant Integration (`src/qdrant/`)
- Collection initialization (3072 dims, cosine, HNSW m=16 ef_construct=200)
- Batch vector upsert with wait=true
- Delete vectors by file_id filter
- Vector ID generation/parsing with underscore handling
- **Tests:** 17 passing

### Sync Orchestrator (`src/sync/`)
- Full sync: scan all files and embed
- Incremental sync: process only changes since last sync
- Parallel processing with concurrency control
- Error collection and reporting
- **Tests:** Integration tests pending

### Admin API (`src/api/`)
- POST /admin/resync - Full resync trigger
- GET /admin/status - Sync state and statistics
- GET /admin/stats - Collection info and vector count
- Bearer token authentication
- **Tests:** Unit tests via mocked modules

### Main Entry Point (`src/index.ts`)
- Scheduled cron handler (incremental sync)
- HTTP fetch handler (admin API + health check)
- Service initialization and wiring

## Development Infrastructure

### Testing
- **Framework:** Vitest
- **Coverage:** 66 unit tests passing
- **Test Types:** Unit tests for all core modules
- **Pending:** E2E integration tests with mocked services

### Code Quality
- **TypeScript:** Strict mode, all type checks passing
- **ESLint:** Configured with Cloudflare Workers globals, 0 errors/warnings
- **Prettier:** Auto-formatting on commit
- **Pre-commit Hooks:** Husky + lint-staged
  - Type check (tsc --noEmit)
  - ESLint auto-fix
  - Prettier format
  - Related tests execution

### Dependencies
```json
{
  "core": [
    "googleapis@144.0.0",
    "@qdrant/js-client-rest@1.12.0",
    "openai@4.76.1",
    "tiktoken@1.0.18"
  ],
  "dev": [
    "@cloudflare/workers-types@4.20241127.0",
    "typescript@5.7.2",
    "vitest@2.1.5",
    "wrangler@3.87.0",
    "husky@9.1.7",
    "lint-staged@16.2.6"
  ]
}
```

## Session History

### Session 1: 2025-11-13 00:00-02:00 - Initial Project Setup ✅

**Completed:**
- Established complete SDD × TDD structure (.governance, .spec, .tasks)
- Created 7 feature specifications with GWT and acceptance tests
- Defined 15 tasks with dependencies and effort estimates
- Initialized Cloudflare Workers project (TypeScript, Vitest, Wrangler)
- Documented comprehensive project plan (40-50 hours)
- Set up coding standards, patterns, and environment configuration

**Key Decisions:**
- Use Spec-Driven Development × Test-Driven Development approach
- Phase-based implementation: Foundation → Pipeline → Orchestration → Admin → Testing
- All documentation and code in English, user questions in Korean

### Session 2: 2025-11-13 06:00-08:00 - Core Implementation ✅

**Completed Tasks:**
- TASK-013: Project infrastructure setup
- TASK-008: KV state management (11 tests)
- TASK-010: Error handling utilities (21 tests)
- TASK-001: Google Drive OAuth2 authentication
- TASK-002: Recursive Drive folder scanning
- TASK-003: Drive changes API integration
- TASK-004: Text chunking with tiktoken (17 tests)
- TASK-005: OpenAI embedding batch processing
- TASK-006: Qdrant collection initialization
- TASK-007: Qdrant vector operations (17 tests)
- TASK-012: Main sync orchestrator
- TASK-011: Admin API endpoints
- TASK-014 (partial): Unit test suite (66 tests)
- INFRA-001: Pre-commit hooks setup

**Key Achievements:**
- ✅ All 66 unit tests passing
- ✅ Type-check: 0 errors
- ✅ ESLint: 0 errors, 0 warnings
- ✅ Pre-commit automation working
- ✅ All core modules implemented

**Technical Improvements:**
- Fixed parseVectorId to handle file IDs with underscores (lastIndexOf)
- Added toError() utility for safe Promise.allSettled error handling
- Replaced `any` types with `unknown` for better type safety
- Added OAuth2Client type for Drive authentication

**Bug Fixes:**
- Vector ID parsing with underscores
- Async error handling in retry tests
- MockKVNamespace type compatibility

## Current Status

### Implementation Progress: ~85% Complete ✅

**Completed Modules:**
- ✅ State Management (src/state/)
- ✅ Error Handling (src/errors/)
- ✅ Drive Integration (src/drive/)
- ✅ Embedding Pipeline (src/embedding/)
- ✅ Qdrant Client (src/qdrant/)
- ✅ Sync Orchestrator (src/sync/)
- ✅ Admin API (src/api/)
- ✅ Main Entry Point (src/index.ts)

**Testing:**
- ✅ Unit tests: 66/66 passing
- 🔄 E2E integration tests: Pending
- 🔄 Production validation: Pending

**Code Quality:**
- ✅ TypeScript strict mode
- ✅ ESLint configured
- ✅ Prettier configured
- ✅ Pre-commit hooks

### Pending Tasks (High Priority)

1. **TASK-014: E2E Integration Tests** (4 hours)
   - Mock external APIs
   - Test complete sync pipeline
   - Verify error handling in full flow

2. **TASK-015: Deployment Documentation** (2 hours)
   - Setup instructions
   - Secrets configuration guide
   - Troubleshooting guide

3. **TASK-021: Production Deployment** (3 hours)
   - Deploy to Cloudflare Workers
   - Configure production secrets
   - Create KV namespace
   - Test with real Google Drive

### Known TODOs in Code

1. `src/drive/drive-client.ts:293` - buildFilePath() needs full path reconstruction
2. `src/drive/drive-client.ts:269` - isFileInFolder() needs recursive parent checking

### Future Enhancements (Lower Priority)

- TASK-016: Drive path building
- TASK-017: Improved file filtering
- TASK-018: Monitoring and alerting
- TASK-019: Additional file type support
- TASK-020: Chunking with overlap
- TASK-022: Incremental embedding optimization
- TASK-023: Rate limiting and cost tracking

## Next Session Priorities

1. **Write E2E Integration Tests** (TASK-014)
   - Create test fixtures and mocks
   - Test full sync flow
   - Test incremental sync flow
   - Verify error recovery

2. **Document Deployment** (TASK-015)
   - README with setup instructions
   - Secret configuration steps
   - KV namespace setup
   - First-run checklist

3. **Production Deployment** (TASK-021)
   - Deploy to Cloudflare Workers
   - Configure all secrets
   - Run first sync
   - Monitor and validate

## External Services Required (User Action)

⚠️ **Before production deployment, user must configure:**

1. **Google Cloud Platform**
   - Create OAuth2 credentials
   - Enable Google Drive API
   - Generate refresh token

2. **Qdrant Cloud**
   - Create account and cluster
   - Get API key and URL

3. **OpenAI**
   - Get API key for text-embedding-3-large

4. **Cloudflare**
   - Create KV namespace
   - Configure secrets via `wrangler secret put`

## Project Statistics

- **Total Lines of Code:** ~2000+ LOC
- **Test Coverage:** 66 unit tests
- **Modules:** 8 core modules
- **Dependencies:** 8 production, 11 dev
- **Time Invested:** ~15 hours
- **Remaining Work:** ~10 hours
