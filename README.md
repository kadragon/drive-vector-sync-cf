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
- Admin access to target Google Drive folder

### Installation

```bash
npm install
```

### Step 1: Google Service Account Setup

This system uses Google Service Account authentication for secure, serverless access to Google Drive.

#### 1.1 Create Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services > Library**
4. Search for "Google Drive API" and click **Enable**
5. Go to **APIs & Services > Credentials**
6. Click **Create Credentials > Service Account**
7. Fill in the details:
   - **Service account name**: `drive-vector-sync`
   - **Service account ID**: (auto-generated)
   - **Description**: `Service account for automated Drive sync`
8. Click **Create and Continue**
9. Skip the optional role assignment (not needed for shared folder access)
10. Click **Done**

#### 1.2 Download Service Account Key

1. In the Service Accounts list, click on the newly created account
2. Go to the **Keys** tab
3. Click **Add Key > Create new key**
4. Select **JSON** format
5. Click **Create** - the JSON file will be downloaded automatically
6. **IMPORTANT**: Keep this file secure. It contains private credentials.

The downloaded JSON file will look like this:
```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "drive-vector-sync@your-project.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  ...
}
```

#### 1.3 Share Google Drive Folder

The Service Account needs explicit access to your target folder:

1. Open [Google Drive](https://drive.google.com/)
2. Navigate to the folder you want to sync
3. Right-click the folder and select **Share**
4. Add the Service Account email (from the JSON file's `client_email` field)
   - Example: `drive-vector-sync@your-project.iam.gserviceaccount.com`
5. Set permission to **Viewer** (read-only access)
6. Click **Share**

#### 1.4 Get Folder ID

The folder ID is in the URL when viewing the folder in Google Drive:
```
https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz
                                      └─────────────┬─────────────┘
                                              This is the Folder ID
```

Save this ID - you'll need it for the secrets configuration.

### Step 2: Cloudflare Infrastructure Setup

#### 2.1 Create Vectorize Index

Create the vector index for storing embeddings:

```bash
wrangler vectorize create worknote-store \
  --dimensions=3072 \
  --metric=cosine
```

Expected output:
```
✅ Successfully created index 'worknote-store'
📋 Dimensions: 3072
📏 Metric: cosine
```

Verify the index exists:
```bash
wrangler vectorize list
```

The index is already bound in `wrangler.toml`:
```toml
[[vectorize]]
binding = "VECTORIZE"
index_name = "worknote-store"
```

#### 2.2 Create KV Namespaces

Create two KV namespaces for state management:

```bash
# Sync state storage (startPageToken, metadata)
wrangler kv:namespace create "WORKNOTE_SYNC_STATE"
wrangler kv:namespace create "WORKNOTE_SYNC_STATE" --preview

# File-to-vector ID mapping
wrangler kv:namespace create "WORKNOTE_FILE_VECTOR_INDEX"
wrangler kv:namespace create "WORKNOTE_FILE_VECTOR_INDEX" --preview
```

Update `wrangler.toml` with the generated IDs:

```toml
[[kv_namespaces]]
binding = "WORKNOTE_SYNC_STATE"
id = "YOUR_SYNC_STATE_ID"           # ← Replace with actual ID
preview_id = "YOUR_PREVIEW_ID"      # ← Replace with actual preview ID

[[kv_namespaces]]
binding = "WORKNOTE_FILE_VECTOR_INDEX"
id = "YOUR_FILE_INDEX_ID"           # ← Replace with actual ID
preview_id = "YOUR_PREVIEW_INDEX_ID" # ← Replace with actual preview ID
```

### Step 3: Configure Secrets

Set all required secrets using `wrangler secret put`:

#### 3.1 Google Service Account (Required)

```bash
# Paste the entire contents of the downloaded JSON file
wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
```

**Tip**: Use `cat` to copy the file contents:
```bash
cat path/to/service-account-key.json | wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
```

#### 3.2 Google Drive Folder ID (Required)

```bash
wrangler secret put GOOGLE_ROOT_FOLDER_ID
# Enter the folder ID from Step 1.4
```

#### 3.3 OpenAI API Key (Required)

```bash
wrangler secret put OPENAI_API_KEY
# Enter your OpenAI API key (starts with sk-)
```

Get your API key from [OpenAI Platform](https://platform.openai.com/api-keys).

#### 3.4 Admin Token (Required)

```bash
wrangler secret put ADMIN_TOKEN
# Enter a secure random token for admin API authentication
```

Generate a secure token:
```bash
# On macOS/Linux:
openssl rand -hex 32

# Or use any password manager
```

#### 3.5 Optional: Domain-Wide Delegation

If you need to impersonate a specific user (for enterprise use cases):

```bash
wrangler secret put GOOGLE_IMPERSONATION_EMAIL
# Enter the email address to impersonate
```

**Note**: This requires [domain-wide delegation](https://developers.google.com/identity/protocols/oauth2/service-account#delegatingauthority) to be enabled for your Service Account.

#### 3.6 Optional: Webhook Alerts

For Slack or Discord notifications:

```bash
# Webhook URL
wrangler secret put WEBHOOK_URL
# Enter your Slack or Discord webhook URL

# Webhook type
wrangler secret put WEBHOOK_TYPE
# Enter: slack or discord

# Performance threshold (files/sec)
wrangler secret put PERFORMANCE_THRESHOLD
# Enter: 0.5 (default) or your preferred threshold
```

#### 3.7 Verify Secrets

List all configured secrets:
```bash
wrangler secret list
```

Expected output:
```
GOOGLE_SERVICE_ACCOUNT_JSON
GOOGLE_ROOT_FOLDER_ID
OPENAI_API_KEY
ADMIN_TOKEN
```

### Step 4: Deploy to Production

Deploy your worker to Cloudflare:

```bash
npm run deploy
```

Or using wrangler directly:
```bash
wrangler deploy
```

Expected output:
```
Total Upload: XX.XX KiB / gzip: XX.XX KiB
Uploaded worknote-maker-cf (X.XX sec)
Published worknote-maker-cf (X.XX sec)
  https://worknote-maker-cf.your-subdomain.workers.dev
Current Deployment ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### Step 5: Verify Deployment

Test the health check endpoint:
```bash
curl https://your-worker.workers.dev/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-11-15T12:00:00.000Z"
}
```

Check sync status (requires admin token):
```bash
curl https://your-worker.workers.dev/admin/status \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Step 6: Trigger First Sync

The worker runs automatically at 01:00 KST (17:00 UTC) daily. For immediate testing:

```bash
curl -X POST https://your-worker.workers.dev/admin/resync \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

Monitor the logs:
```bash
wrangler tail
```

---

## Development

### Local Development

```bash
# Install dependencies
npm install

# Run locally with hot reload
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Type checking
npm run type-check

# Lint code
npm run lint

# Format code
npm run format
```

### Testing Locally

Use the `.dev.vars` file for local secrets (not tracked in git):

```bash
# .dev.vars (create this file)
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
GOOGLE_ROOT_FOLDER_ID=your-folder-id
OPENAI_API_KEY=sk-your-key
ADMIN_TOKEN=your-local-token
```

**Note**: Never commit `.dev.vars` to version control.

---

## API Reference

### Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-15T12:00:00.000Z"
}
```

### Admin Endpoints

All admin endpoints require Bearer token authentication:
```
Authorization: Bearer YOUR_ADMIN_TOKEN
```

#### Trigger Full Resync

```http
POST /admin/resync
```

Clears sync state and re-processes all files in the Drive folder.

**Response 200:**
```json
{
  "success": true,
  "message": "Full resync completed",
  "result": {
    "filesProcessed": 150,
    "vectorsUpserted": 250,
    "vectorsDeleted": 0,
    "duration": 45000,
    "errors": []
  }
}
```

**Response 409 (Conflict):**
```json
{
  "error": "Sync already in progress. Please wait for current sync to complete."
}
```

#### Get Sync Status

```http
GET /admin/status
```

Returns the state of the last sync operation.

**Response 200:**
```json
{
  "syncState": {
    "startPageToken": "123456",
    "lastRunAt": "2025-11-15T01:00:00Z",
    "lastRunDuration": 45000,
    "filesProcessed": 150,
    "errorCount": 0
  },
  "isLocked": false
}
```

#### Get Collection Statistics

```http
GET /admin/stats
```

Returns vector index statistics.

**Response 200:**
```json
{
  "indexName": "worknote-store",
  "vectorCount": 250,
  "dimensions": 3072
}
```

### Example Usage

**Bash:**
```bash
# Set your admin token
export ADMIN_TOKEN="your-admin-token-here"
export WORKER_URL="https://your-worker.workers.dev"

# Check status
curl "$WORKER_URL/admin/status" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Trigger resync
curl -X POST "$WORKER_URL/admin/resync" \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Get stats
curl "$WORKER_URL/admin/stats" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

**JavaScript:**
```javascript
const ADMIN_TOKEN = 'your-admin-token';
const WORKER_URL = 'https://your-worker.workers.dev';

async function triggerResync() {
  const response = await fetch(`${WORKER_URL}/admin/resync`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ADMIN_TOKEN}`
    }
  });
  return response.json();
}
```

---

## Monitoring and Alerting

### Webhook Notifications

The system supports Slack and Discord webhooks for automated alerts.

#### Slack Setup

1. Create a Slack app and add an Incoming Webhook
2. Get the webhook URL (e.g., `https://hooks.slack.com/services/T00/B00/XXX`)
3. Configure secrets:
   ```bash
   wrangler secret put WEBHOOK_URL
   # Enter your Slack webhook URL

   wrangler secret put WEBHOOK_TYPE
   # Enter: slack
   ```

**Alert Messages:**
- Sync completion with metrics (files processed, duration, throughput)
- Sync failures with error details
- Performance degradation warnings

#### Discord Setup

1. Create a webhook in your Discord channel settings
2. Get the webhook URL (e.g., `https://discord.com/api/webhooks/XXX/YYY`)
3. Configure secrets:
   ```bash
   wrangler secret put WEBHOOK_URL
   # Enter your Discord webhook URL

   wrangler secret put WEBHOOK_TYPE
   # Enter: discord
   ```

#### Performance Threshold

Set a custom threshold for performance alerts:
```bash
wrangler secret put PERFORMANCE_THRESHOLD
# Enter files/sec threshold (e.g., 0.5)
```

When processing speed falls below this threshold, you'll receive an alert.

### Cloudflare Dashboard Monitoring

Monitor your worker in the Cloudflare dashboard:

1. Go to **Workers & Pages**
2. Click on your worker (`worknote-maker-cf`)
3. View metrics:
   - Request count
   - Error rate
   - CPU time
   - Duration (P50, P99)

### Log Streaming

Stream real-time logs:
```bash
# Stream all logs
wrangler tail

# Filter by status
wrangler tail --status error

# Search logs
wrangler tail --search "sync"
```

### Cost Tracking

The system logs API costs to console:
- **OpenAI**: $0.00013 per 1K tokens (text-embedding-3-large)
- **Drive API**: Quota usage tracking
- **Vectorize**: Included with Workers plan

Check logs after sync for cost summary:
```
💰 Cost Summary:
  OpenAI: $0.45 (3,500 tokens)
  Drive API: 45 calls
  Vectorize: 250 operations
```

---

## Troubleshooting

### Common Issues

#### 1. "Service Account authentication failed"

**Symptoms:**
- Error: `invalid_grant` or `unauthorized_client`

**Solutions:**
- Verify the Service Account JSON is correctly formatted
- Check that the Service Account email has access to the target folder
- Ensure Drive API is enabled in Google Cloud Console
- Re-download the Service Account key if necessary

```bash
# Test locally with .dev.vars
npm run dev

# Check logs
wrangler tail --status error
```

#### 2. "Vectorize index not found"

**Symptoms:**
- Error: `Vectorize index 'worknote-store' may not exist yet`

**Solutions:**
- Create the index:
  ```bash
  wrangler vectorize create worknote-store \
    --dimensions=3072 \
    --metric=cosine
  ```
- Verify binding in `wrangler.toml`:
  ```toml
  [[vectorize]]
  binding = "VECTORIZE"
  index_name = "worknote-store"
  ```
- Redeploy after creating index:
  ```bash
  wrangler deploy
  ```

#### 3. "KV namespace not bound"

**Symptoms:**
- Error: `KV namespace binding not found`

**Solutions:**
- Create KV namespaces:
  ```bash
  wrangler kv:namespace create "WORKNOTE_SYNC_STATE"
  wrangler kv:namespace create "WORKNOTE_FILE_VECTOR_INDEX"
  ```
- Update `wrangler.toml` with correct IDs
- Redeploy

#### 4. "OpenAI rate limit exceeded"

**Symptoms:**
- Error: `429 Too Many Requests`

**Solutions:**
- The system has built-in rate limiting (5000 requests/min)
- Reduce `MAX_CONCURRENCY` in `wrangler.toml`:
  ```toml
  [vars]
  MAX_CONCURRENCY = "2"  # Default is 4
  ```
- Check your OpenAI account usage limits

#### 5. "Sync takes too long / times out"

**Symptoms:**
- Worker timeout errors
- Incomplete syncs

**Solutions:**
- Reduce batch size:
  ```toml
  [vars]
  MAX_BATCH_SIZE = "16"  # Default is 32
  ```
- Reduce concurrency:
  ```toml
  [vars]
  MAX_CONCURRENCY = "2"  # Default is 4
  ```
- Split large folders into smaller subfolders

#### 6. "Drive folder not accessible"

**Symptoms:**
- Error: `File not found` or `Insufficient permissions`

**Solutions:**
- Verify Service Account email is shared with the folder
- Check folder ID is correct (from URL)
- Ensure Drive API is enabled
- Test folder access:
  ```bash
  # Use Drive API Explorer
  https://developers.google.com/drive/api/v3/reference/files/get
  ```

#### 7. "Admin API returns 401 Unauthorized"

**Symptoms:**
- `{"error": "Unauthorized"}`

**Solutions:**
- Verify admin token is correctly set:
  ```bash
  wrangler secret list
  ```
- Use correct Authorization header:
  ```bash
  curl -H "Authorization: Bearer YOUR_TOKEN" ...
  ```
- Regenerate token if necessary:
  ```bash
  openssl rand -hex 32 | wrangler secret put ADMIN_TOKEN
  ```

### Debug Mode

Enable verbose logging:
```bash
# Local development
LOG_LEVEL=debug npm run dev

# Production (via wrangler tail)
wrangler tail --format pretty
```

### Getting Help

If issues persist:

1. Check logs: `wrangler tail --status error`
2. Verify all secrets: `wrangler secret list`
3. Test locally: `npm run dev` with `.dev.vars`
4. Check Cloudflare status: https://www.cloudflarestatus.com/
5. Open an issue with:
   - Error message
   - Relevant logs
   - Configuration (sanitized, no secrets)

---

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
