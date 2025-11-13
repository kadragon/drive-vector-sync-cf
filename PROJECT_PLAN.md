# Google Drive → Qdrant Vector Sync System - Project Plan

## Executive Summary

This project implements an automated RAG data pipeline that syncs Google Drive Markdown files to Qdrant Cloud using Cloudflare Workers. The system runs daily at KST 01:00, using Google Drive's `changes` API for efficient incremental updates.

**Key Deliverables:**
- Serverless sync pipeline on Cloudflare Workers
- Google Drive integration with OAuth2
- OpenAI text-embedding-3-large integration
- Qdrant Cloud vector storage
- Admin API for manual operations

**Timeline:** 4-6 weeks
**Total Estimated Effort:** 40-50 hours

---

## Development Philosophy

This project follows **Spec-Driven Development (SDD) × Test-Driven Development (TDD)** principles:

1. **Specifications First** (`.spec/`) - Define functional requirements
2. **Test-Driven** - Write tests before implementation (RED → GREEN → REFACTOR)
3. **Task Management** (`.tasks/`) - Track progress systematically
4. **Knowledge Persistence** (`.governance/`) - Maintain context between sessions

---

## Phase 1: Foundation (Week 1-2)

### Priority 1: Core Infrastructure

#### TASK-013: Project Infrastructure Setup
**Estimated:** 2 hours
**Status:** ✅ COMPLETED

- [x] Initialize Cloudflare Workers project
- [x] Configure TypeScript with strict mode
- [x] Set up Vitest testing framework
- [x] Create wrangler.toml with KV and secrets configuration
- [x] Establish project structure (`.spec/`, `.tasks/`, `.governance/`)

#### TASK-008: KV State Management
**Estimated:** 2 hours
**Dependencies:** TASK-013
**Spec:** `SPEC-state-management-1`

**Implementation Goals:**
- Create state manager interface for KV operations
- Implement `get/set` for startPageToken persistence
- Handle first-run scenario (no existing state)
- Add error handling for KV unavailability

**Test Coverage:**
- Load state on first run (null token)
- Save startPageToken after successful sync
- Load startPageToken on subsequent runs
- Handle missing KV namespace gracefully

**Files to Create:**
- `src/services/state-manager.ts`
- `src/services/state-manager.test.ts`

---

#### TASK-006: Qdrant Collection Initialization
**Estimated:** 2 hours
**Dependencies:** TASK-013
**Spec:** `SPEC-qdrant-sync-1`

**Implementation Goals:**
- Create Qdrant client with API authentication
- Implement collection initialization with schema:
  - Vector size: 3072 (text-embedding-3-large)
  - Distance: cosine
  - HNSW config: m=16, ef_construct=200
- Handle "collection already exists" scenario

**Test Coverage:**
- Create new collection successfully
- Verify collection schema
- Handle existing collection gracefully

**Files to Create:**
- `src/clients/qdrant-client.ts`
- `src/clients/qdrant-client.test.ts`

---

### Priority 2: Google Drive Integration

#### TASK-001: OAuth2 Authentication
**Estimated:** 3 hours
**Dependencies:** TASK-013
**Spec:** `SPEC-drive-integration-1`

**Implementation Goals:**
- Create Google Drive OAuth2 client
- Implement token refresh logic using refresh token
- Store credentials from Cloudflare Secrets
- Handle token expiration gracefully

**Test Coverage:**
- Successfully authenticate with valid credentials
- Refresh expired access token
- Handle invalid credentials error

**Files to Create:**
- `src/clients/drive-client.ts`
- `src/clients/drive-client.test.ts`

---

#### TASK-002: Recursive Folder Scanning
**Estimated:** 4 hours
**Dependencies:** TASK-001
**Spec:** `SPEC-drive-integration-1`

**Implementation Goals:**
- Implement recursive folder traversal
- Filter for `.md` files only
- Handle pagination (pageToken)
- Extract metadata: id, name, path, modifiedTime
- Build full path from parent chain

**Test Coverage:**
- List all .md files from root folder recursively
- Handle pagination for large folders (>100 files)
- Construct correct file paths
- Filter non-Markdown files

**Files to Create:**
- `src/services/drive-scanner.ts`
- `src/services/drive-scanner.test.ts`

---

#### TASK-003: Changes API Integration
**Estimated:** 4 hours
**Dependencies:** TASK-001, TASK-008
**Spec:** `SPEC-drive-integration-1`

**Implementation Goals:**
- Implement `changes.list` API calls with startPageToken
- Detect change types: added, modified, deleted
- Handle pagination for large changesets
- Implement retry logic (3 attempts, exponential backoff)

**Test Coverage:**
- Fetch changes since last startPageToken
- Identify added files correctly
- Identify modified files correctly
- Identify deleted files correctly
- Handle API rate limits with retry

**Files to Create:**
- `src/services/drive-changes.ts`
- `src/services/drive-changes.test.ts`

---

## Phase 2: Embedding Pipeline (Week 2-3)

### Priority 1: Text Processing

#### TASK-004: Text Chunking with Token Counting
**Estimated:** 3 hours
**Dependencies:** TASK-013
**Spec:** `SPEC-embedding-pipeline-1`

**Implementation Goals:**
- Integrate `tiktoken` for accurate token counting
- Implement chunking at 2000 token boundaries
- Preserve chunk metadata (index, token count)
- Handle edge cases (empty files, very small files)

**Test Coverage:**
- Generate single chunk for small file (<2000 tokens)
- Split large file at 2000 token boundaries
- Track chunk indices correctly (0, 1, 2, ...)
- Calculate accurate token counts

**Files to Create:**
- `src/utils/text-chunker.ts`
- `src/utils/text-chunker.test.ts`

---

#### TASK-005: OpenAI Embedding Integration
**Estimated:** 3 hours
**Dependencies:** TASK-004
**Spec:** `SPEC-embedding-pipeline-1`

**Implementation Goals:**
- Create OpenAI client with API key from Secrets
- Implement batch embedding (16-32 chunks per request)
- Validate vector dimensions (3072)
- Handle API errors gracefully (skip file, log error)

**Test Coverage:**
- Generate embedding for single chunk
- Batch embed multiple chunks (16-32)
- Validate embedding dimensions
- Handle API errors without crashing

**Files to Create:**
- `src/clients/openai-client.ts`
- `src/clients/openai-client.test.ts`
- `src/services/embedding-service.ts`
- `src/services/embedding-service.test.ts`

---

### Priority 2: Qdrant Synchronization

#### TASK-007: Vector Upsert and Delete Operations
**Estimated:** 4 hours
**Dependencies:** TASK-006
**Spec:** `SPEC-qdrant-sync-1`

**Implementation Goals:**
- Implement batch vector upsert with metadata
- Generate vector IDs: `{file_id}_{chunk_index}`
- Implement delete by file_id filter
- Handle upsert failures with retry

**Metadata Schema:**
```typescript
{
  file_id: string;
  path: string;
  chunk_index: number;
  last_modified: string;
  file_name: string;
}
```

**Test Coverage:**
- Upsert single-chunk file vector
- Upsert multi-chunk file vectors
- Delete all vectors for a given file_id
- Batch upsert multiple vectors efficiently
- Generate correct vector IDs

**Files to Create:**
- `src/services/qdrant-service.ts`
- `src/services/qdrant-service.test.ts`

---

## Phase 3: Orchestration (Week 3-4)

### Priority 1: Error Handling

#### TASK-010: Comprehensive Error Handling
**Estimated:** 4 hours
**Dependencies:** None (cross-cutting concern)
**Spec:** `SPEC-error-handling-1`

**Implementation Goals:**
- Create custom error classes for domain errors
- Implement retry logic with exponential backoff
- Add structured logging (JSON format)
- Build error summary reporting
- Handle OAuth token refresh on expiration

**Error Categories:**
- `DriveAPIError` - Google Drive API failures
- `EmbeddingError` - OpenAI API failures
- `QdrantError` - Qdrant operations failures
- `StateError` - KV state management failures

**Test Coverage:**
- Retry failed operations 3 times
- Skip failed files and continue pipeline
- Log errors with context
- Refresh OAuth token on expiration
- Generate error summary

**Files to Create:**
- `src/utils/errors.ts`
- `src/utils/retry.ts`
- `src/utils/retry.test.ts`
- `src/utils/logger.ts`

---

### Priority 2: Main Sync Pipeline

#### TASK-012: Sync Orchestrator
**Estimated:** 5 hours
**Dependencies:** TASK-003, TASK-005, TASK-007, TASK-008, TASK-010
**Spec:** None (integration task)

**Implementation Goals:**
- Create main sync pipeline that orchestrates:
  1. Load state (startPageToken from KV)
  2. Fetch Drive changes (or full scan if first run)
  3. Download file contents
  4. Process files: chunk → embed → upsert to Qdrant
  5. Handle deletions: remove vectors from Qdrant
  6. Save new state (startPageToken to KV)
- Implement parallel processing with concurrency control (max 4)
- Add progress logging
- Generate sync result summary

**Processing Flow:**
```
Load State
    ↓
Fetch Changes (or Full Scan)
    ↓
For Each Changed File:
  - Download content
  - Chunk text (if needed)
  - Batch embed chunks
  - Upsert vectors to Qdrant
    ↓
For Each Deleted File:
  - Delete vectors from Qdrant
    ↓
Save New State
    ↓
Return Sync Result
```

**Test Coverage:**
- Execute full sync on first run
- Execute incremental sync with changes
- Handle file additions correctly
- Handle file modifications correctly
- Handle file deletions correctly
- Respect concurrency limits
- Generate accurate sync result

**Files to Create:**
- `src/services/sync-orchestrator.ts`
- `src/services/sync-orchestrator.test.ts`

---

## Phase 4: Scheduling & Admin (Week 4-5)

### Priority 1: Cron Scheduling

#### TASK-009: Cron Trigger Handler
**Estimated:** 2 hours
**Dependencies:** TASK-012
**Spec:** `SPEC-scheduling-1`

**Implementation Goals:**
- Configure cron trigger in `wrangler.toml` (17:00 UTC = 01:00 KST)
- Implement scheduled event handler in `src/index.ts`
- Add concurrency check (prevent parallel runs)
- Handle no-op case (no changes) efficiently

**Test Coverage:**
- Handle scheduled event correctly
- Prevent concurrent sync executions
- Complete no-op sync quickly

**Files to Modify:**
- `src/index.ts` (scheduled handler)

---

### Priority 2: Admin API

#### TASK-011: Admin API Endpoints
**Estimated:** 3 hours
**Dependencies:** TASK-012
**Spec:** `SPEC-admin-api-1`

**Implementation Goals:**
- Implement Bearer token authentication middleware
- Create endpoints:
  - `POST /admin/resync` - Trigger full resync (clear state)
  - `GET /admin/status` - Get last sync status
  - `GET /admin/stats` - Get collection statistics
- Return proper HTTP status codes and JSON responses
- Prevent concurrent manual syncs

**API Specifications:**

**POST /admin/resync**
```
Request:
  Authorization: Bearer {ADMIN_TOKEN}

Response 200:
{
  "success": true,
  "message": "Full resync initiated"
}

Response 409:
{
  "error": "Sync already in progress"
}
```

**GET /admin/status**
```
Request:
  Authorization: Bearer {ADMIN_TOKEN}

Response 200:
{
  "lastRunAt": "2025-11-13T17:00:00Z",
  "filesProcessed": 150,
  "vectorsUpserted": 250,
  "vectorsDeleted": 10,
  "errors": [],
  "duration": 45000
}
```

**Test Coverage:**
- Trigger full resync successfully
- Fetch sync status correctly
- Reject unauthorized requests (401)
- Prevent concurrent syncs (409)

**Files to Modify:**
- `src/index.ts` (fetch handler)

**Files to Create:**
- `src/services/admin-service.ts`
- `src/services/admin-service.test.ts`

---

## Phase 5: Testing & Documentation (Week 5-6)

### Priority 1: Integration Testing

#### TASK-014: End-to-End Integration Tests
**Estimated:** 4 hours
**Dependencies:** TASK-012
**Spec:** None

**Implementation Goals:**
- Create integration test suite with mocked external APIs
- Test complete sync pipeline end-to-end
- Mock Google Drive API responses
- Mock OpenAI API responses
- Mock Qdrant API responses
- Use in-memory KV for state

**Test Scenarios:**
- Full sync on first run (no state)
- Incremental sync with 5 added files
- Incremental sync with 3 modified files
- Incremental sync with 2 deleted files
- Mixed changes (add + modify + delete)
- Error recovery scenarios

**Files to Create:**
- `tests/integration/full-sync.test.ts`
- `tests/integration/incremental-sync.test.ts`
- `tests/mocks/drive-api-mock.ts`
- `tests/mocks/openai-api-mock.ts`
- `tests/mocks/qdrant-api-mock.ts`

---

### Priority 2: Documentation

#### TASK-015: Deployment Documentation
**Estimated:** 2 hours
**Dependencies:** TASK-014
**Spec:** None

**Documentation Goals:**
- Complete setup instructions
- Secrets configuration guide
- Google OAuth2 setup walkthrough
- Qdrant Cloud setup guide
- Manual resync procedures
- Troubleshooting guide
- Performance tuning recommendations

**Files to Create/Update:**
- `DEPLOYMENT.md` - Step-by-step deployment guide
- `TROUBLESHOOTING.md` - Common issues and solutions
- `ARCHITECTURE.md` - System architecture documentation
- `README.md` - Update with final deployment info

---

## Timeline Overview

| Phase | Duration | Tasks | Status |
|-------|----------|-------|--------|
| **Phase 1: Foundation** | Week 1-2 | TASK-013, TASK-008, TASK-006, TASK-001, TASK-002, TASK-003 | ⏳ In Progress |
| **Phase 2: Embedding** | Week 2-3 | TASK-004, TASK-005, TASK-007 | 📋 Planned |
| **Phase 3: Orchestration** | Week 3-4 | TASK-010, TASK-012 | 📋 Planned |
| **Phase 4: Scheduling** | Week 4-5 | TASK-009, TASK-011 | 📋 Planned |
| **Phase 5: Testing** | Week 5-6 | TASK-014, TASK-015 | 📋 Planned |

---

## Risk Assessment

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Cloudflare Workers CPU limits | High | Implement concurrency control, batch operations |
| Google Drive API rate limits | Medium | Exponential backoff, respect quotas |
| OpenAI API cost overruns | Medium | Batch embeddings, monitor usage |
| Qdrant connection failures | High | Retry logic, circuit breaker pattern |
| OAuth token expiration | Medium | Automatic refresh, error handling |

### Operational Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Large initial sync timeout | Medium | Implement resumable sync, process in batches |
| Concurrent cron executions | High | Lock mechanism via KV or Durable Objects |
| Data inconsistency | High | Transactional updates, validation checks |
| Silent failures | Medium | Comprehensive logging, monitoring webhooks |

---

## Success Criteria

### Functional Requirements ✅
- [ ] Authenticate with Google Drive via OAuth2
- [ ] Scan root folder recursively for .md files
- [ ] Detect file changes using Drive changes API
- [ ] Chunk text at 2000 token boundaries
- [ ] Generate embeddings via OpenAI API
- [ ] Store vectors in Qdrant with metadata
- [ ] Run daily sync at KST 01:00
- [ ] Provide admin API for manual operations

### Non-Functional Requirements ✅
- [ ] Process 2000 files within Workers timeout limits
- [ ] Handle API errors gracefully without data loss
- [ ] Maintain state persistence across runs
- [ ] Achieve 80%+ code coverage
- [ ] Document all public APIs
- [ ] Provide deployment guide

### Performance Targets ✅
- [ ] Initial sync: <10 minutes for 2000 files
- [ ] Incremental sync: <1 minute for 10 files
- [ ] API response time: <2 seconds for admin endpoints
- [ ] Zero data loss on errors

---

## Monitoring & Observability

### Key Metrics to Track
- Sync execution time
- Files processed per run
- Vectors upserted/deleted per run
- Error count and types
- API call latency (Drive, OpenAI, Qdrant)
- KV read/write operations

### Logging Strategy
- Structured JSON logs
- Include trace IDs for request correlation
- Log levels: ERROR, WARN, INFO, DEBUG
- Context: timestamp, task_id, spec_id

### Alerting (Optional Future Enhancement)
- Sync failures (>3 consecutive failures)
- API quota exhaustion
- Abnormal execution time (>10 minutes)
- Error rate spike (>10% of files)

---

## Next Steps

### Immediate Actions (Start Now)

1. **Review this plan** and confirm approach
2. **Set up Cloudflare account** and create Workers project
3. **Configure Google Cloud** project and OAuth2 credentials
4. **Set up Qdrant Cloud** instance and get API keys
5. **Begin TASK-008** (KV State Management) - First implementation task

### Development Workflow

For each task:
1. Read specification from `.spec/`
2. Write tests (RED)
3. Implement code (GREEN)
4. Refactor and optimize
5. Update `.tasks/current.yaml` with progress
6. Move to `.tasks/done.yaml` when complete
7. Record learnings in `.governance/memory.md`

---

## Questions for Clarification

이 계획을 검토하신 후 다음 질문들에 답변해 주세요:

1. **Google Drive 설정**
   - 이미 OAuth2 클라이언트를 생성하셨나요?
   - Root folder ID를 알고 계신가요?
   - 접근 권한이 올바르게 설정되어 있나요?

2. **Qdrant Cloud 설정**
   - Qdrant Cloud 인스턴스가 이미 존재하나요?
   - 어떤 클러스터 사이즈를 사용하실 예정인가요?
   - 예상되는 총 벡터 개수는 몇 개인가요?

3. **우선순위 조정**
   - 위의 개발 순서에 동의하시나요?
   - 특정 기능을 먼저 구현하고 싶으신가요?
   - 시간 제약이 있으신가요?

4. **배포 환경**
   - 개발/스테이징/프로덕션 환경을 분리하실 예정인가요?
   - CI/CD 파이프라인이 필요하신가요?

---

## Appendix: File Structure Summary

```
drive-vector-sync-cf/
├── .governance/
│   ├── memory.md (session history)
│   ├── coding-style.md (conventions)
│   ├── patterns.md (reusable patterns)
│   └── env.yaml (environment config)
├── .spec/
│   ├── drive-integration/spec.yaml
│   ├── embedding-pipeline/spec.yaml
│   ├── qdrant-sync/spec.yaml
│   ├── state-management/spec.yaml
│   ├── scheduling/spec.yaml
│   ├── error-handling/spec.yaml
│   └── admin-api/spec.yaml
├── .tasks/
│   ├── backlog.yaml (15 tasks)
│   ├── current.yaml (active task)
│   └── done.yaml (completed tasks)
├── src/
│   ├── clients/
│   │   ├── drive-client.ts (TASK-001)
│   │   ├── openai-client.ts (TASK-005)
│   │   └── qdrant-client.ts (TASK-006)
│   ├── services/
│   │   ├── state-manager.ts (TASK-008)
│   │   ├── drive-scanner.ts (TASK-002)
│   │   ├── drive-changes.ts (TASK-003)
│   │   ├── embedding-service.ts (TASK-005)
│   │   ├── qdrant-service.ts (TASK-007)
│   │   ├── sync-orchestrator.ts (TASK-012)
│   │   └── admin-service.ts (TASK-011)
│   ├── utils/
│   │   ├── text-chunker.ts (TASK-004)
│   │   ├── retry.ts (TASK-010)
│   │   ├── errors.ts (TASK-010)
│   │   └── logger.ts (TASK-010)
│   ├── types/
│   │   └── index.ts (type definitions)
│   └── index.ts (Worker entry point)
├── tests/
│   ├── integration/
│   └── mocks/
├── package.json
├── tsconfig.json
├── wrangler.toml
├── vitest.config.ts
├── README.md
└── PROJECT_PLAN.md (this file)
```

---

**Plan Version:** 1.0
**Last Updated:** 2025-11-13
**Status:** ✅ Ready for Implementation
