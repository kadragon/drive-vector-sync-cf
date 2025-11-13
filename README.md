# Google Drive → Qdrant Vector Sync System

Automated RAG data pipeline that syncs Google Drive Markdown files to Qdrant Cloud using Cloudflare Workers.

## Architecture

This system implements a **Spec-Driven Development (SDD) × Test-Driven Development (TDD)** approach with three core directories:

- **`.spec/`** - Functional specifications (WHAT should exist)
- **`.tasks/`** - Operational task management (WHEN/WHAT NEXT)
- **`.governance/`** - Knowledge persistence (HOW/WHY)

## Features

- **Automated Daily Sync**: Runs at KST 01:00 via Cloudflare Cron
- **Incremental Updates**: Uses Google Drive `changes` API for efficient syncing
- **Intelligent Chunking**: Splits large documents at 2000 token boundaries
- **Batch Embedding**: Processes 16-32 chunks per OpenAI API call
- **Vector Storage**: Syncs to Qdrant Cloud with rich metadata
- **Admin API**: Manual resync and status endpoints

## Project Structure

```
.
├── .governance/        # Knowledge persistence
│   ├── memory.md       # Session history and learnings
│   ├── coding-style.md # Code conventions
│   ├── patterns.md     # Reusable patterns
│   └── env.yaml        # Environment configuration
├── .spec/              # Feature specifications
│   ├── drive-integration/
│   ├── embedding-pipeline/
│   ├── qdrant-sync/
│   ├── state-management/
│   ├── scheduling/
│   ├── error-handling/
│   └── admin-api/
├── .tasks/             # Task management
│   ├── backlog.yaml    # Pending tasks
│   ├── current.yaml    # Active task
│   └── done.yaml       # Completed tasks
├── src/
│   ├── clients/        # External API clients
│   ├── services/       # Business logic
│   ├── types/          # TypeScript types
│   ├── utils/          # Helper functions
│   └── index.ts        # Worker entry point
└── wrangler.toml       # Cloudflare configuration
```

## Setup

### Prerequisites

- Node.js 18+
- Cloudflare account with Workers enabled
- Google Cloud project with Drive API enabled
- OpenAI API key
- Qdrant Cloud instance

### Installation

```bash
npm install
```

### Configuration

1. **Create KV Namespace:**
   ```bash
   wrangler kv:namespace create "SYNC_STATE"
   wrangler kv:namespace create "SYNC_STATE" --preview
   ```
   Update the `id` and `preview_id` in `wrangler.toml`.

2. **Set Secrets:**
   ```bash
   wrangler secret put GOOGLE_CLIENT_ID
   wrangler secret put GOOGLE_CLIENT_SECRET
   wrangler secret put GOOGLE_REFRESH_TOKEN
   wrangler secret put GOOGLE_ROOT_FOLDER_ID
   wrangler secret put OPENAI_API_KEY
   wrangler secret put QDRANT_URL
   wrangler secret put QDRANT_API_KEY
   wrangler secret put ADMIN_TOKEN
   ```

### Development

```bash
# Run locally
npm run dev

# Run tests
npm test

# Type checking
npm run type-check

# Deploy
npm run deploy
```

## API Endpoints

### Health Check
```
GET /health
```

### Admin Endpoints (require Bearer token)

**Trigger Full Resync:**
```bash
curl -X POST https://your-worker.workers.dev/admin/resync \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

**Get Sync Status:**
```bash
curl https://your-worker.workers.dev/admin/status \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

## Development Workflow

This project follows the SDD × TDD loop:

1. **Read Spec** (`.spec/`)
2. **Create Tests** (RED)
3. **Implement Code** (GREEN)
4. **Refactor**
5. **Update Tasks** (`.tasks/`)
6. **Record Learnings** (`.governance/memory.md`)

### Next Steps

Check `.tasks/current.yaml` for the active task, or see `.tasks/backlog.yaml` for pending work.

## Performance

- **Corpus Size**: ~2000 files × 50KB = ~100MB
- **Daily Changes**: ~10 files (lightweight updates)
- **Batch Size**: 16-32 chunks per embedding request
- **Concurrency**: Max 4 parallel operations

## Security

- All credentials stored in Cloudflare Secrets
- OAuth2 with refresh tokens for Google Drive
- Admin API protected with bearer token authentication
- No sensitive data in logs

## License

MIT
