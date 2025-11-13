# Governance Memory

## Project Overview

**Project Name:** Google Drive → Qdrant Vector Sync System
**Platform:** Cloudflare Workers
**Purpose:** Automated RAG data pipeline that syncs Google Drive Markdown files to Qdrant Cloud

## Architecture Decisions

### Core Components
1. **Cloudflare Workers** - Serverless execution environment
2. **Google Drive API** - Source document repository
3. **OpenAI Embedding API** - text-embedding-large model
4. **Qdrant Cloud** - Vector database storage
5. **Cloudflare KV** - State persistence (startPageToken)

### Key Design Decisions
- **Incremental Updates**: Use Google Drive `changes` API with startPageToken
- **Embedding Strategy**: Full document if under token limit, else chunk at 2000 tokens
- **Vector ID Format**: `{file_id}_{chunk_index}`
- **Scheduling**: Daily cron at KST 01:00
- **Error Handling**: 3 retries for Drive API, skip failed embeddings with logging

## Performance Constraints
- Total corpus: ~2000 files × 50KB = ~100MB
- Daily changes: ~10 files (lightweight)
- Batch embedding: 16-32 chunks per request
- Parallel processing: Max concurrency of 4

## Security Notes
- All credentials in Cloudflare Secrets
- OAuth2 tokens for Google Drive
- Qdrant API keys in Secrets
- KV for state persistence only

## Known Patterns
- Use Promise.all with concurrency limits for parallel operations
- Batch OpenAI embedding calls for efficiency
- Maintain idempotency with vector ID schema

## Session History

### Session 1: 2025-11-13 - Initial Project Setup ✅

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
- Start with TASK-008 (KV State Management) for first implementation
- All documentation and code in English, user questions in Korean

**Artifacts Created:**
- 7 specification files (.spec/)
- 15 task definitions (.tasks/backlog.yaml)
- PROJECT_PLAN.md with 5-phase timeline
- Basic Cloudflare Workers structure (src/, wrangler.toml, package.json)
- Governance documents (memory, coding-style, patterns, env)

## Next Session Priorities

1. **Install Dependencies**
   - Run `npm install` to get all packages
   - Verify TypeScript and Vitest configurations

2. **External Services Setup** (User must complete)
   - Google Cloud OAuth2 credentials
   - Qdrant Cloud instance creation
   - OpenAI API key acquisition
   - Cloudflare KV namespace creation

3. **Begin Implementation: TASK-008**
   - Create state manager for KV operations
   - Write tests first (RED phase)
   - Implement KV get/set with JSON serialization
   - Handle first-run scenario

4. **Follow TDD Cycle**
   - Read spec: SPEC-state-management-1
   - Write tests: state-manager.test.ts
   - Implement: state-manager.ts
   - Refactor and optimize
