# Web Dashboard Implementation Plan

## Overview

Implement a web-based dashboard for monitoring Google Drive → Vectorize sync status, with future extensibility for RAG system and worknote features.

**Trace:**
- spec_id: SPEC-web-dashboard-1
- tasks: TASK-028 ~ TASK-032

---

## Architecture Summary

### Technology Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| **Deployment** | Worker-embedded | Single endpoint, no additional infrastructure |
| **Framework** | React + TypeScript | Rich ecosystem, type safety |
| **UI Library** | DaisyUI (Tailwind CSS) | Fast prototyping, themeable |
| **Charts** | Recharts | React-native, declarative API |
| **Build Tool** | Vite | Fast builds, modern tooling |
| **Bundling** | Static assets in Worker | Self-contained deployment |

### Project Structure

```
drive-vector-sync-cf/
├── frontend/                    # New React app
│   ├── src/
│   │   ├── components/         # React components
│   │   │   ├── Dashboard.tsx
│   │   │   ├── StatsCard.tsx
│   │   │   ├── SyncStatus.tsx
│   │   │   ├── SyncHistoryChart.tsx
│   │   │   └── VectorCountChart.tsx
│   │   ├── hooks/              # Custom hooks
│   │   │   ├── useSyncStatus.ts
│   │   │   ├── useSyncStats.ts
│   │   │   ├── useSyncHistory.ts
│   │   │   └── useNextSyncTime.ts
│   │   ├── types/              # TypeScript types
│   │   ├── utils/              # Helper functions
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── tsconfig.json
├── src/                         # Existing Worker code
│   ├── api/
│   │   └── admin-handler.ts    # Enhanced with new endpoints
│   ├── state/
│   │   └── kv-state-manager.ts # Add history tracking
│   └── index.ts                # Add static file serving
└── .spec/web-dashboard/
    ├── spec.yaml
    └── IMPLEMENTATION_PLAN.md  # This file
```

---

## Implementation Phases

### Phase 1: Enhanced Backend API (TASK-028)
**Estimated: 2 hours**

#### 1.1 Extend `/admin/status` Endpoint

**Current Response:**
```json
{
  "status": "ok",
  "lastSyncTime": "2025-11-15T01:00:00Z",
  "filesProcessed": 150,
  "errorCount": 0,
  "hasStartPageToken": true
}
```

**Enhanced Response:**
```json
{
  "status": "ok",
  "lastSyncTime": "2025-11-15T01:00:00Z",
  "filesProcessed": 150,
  "errorCount": 0,
  "hasStartPageToken": true,
  "isLocked": false,                        // NEW: Sync in progress
  "nextScheduledSync": "2025-11-16T17:00:00Z",  // NEW: Next cron time
  "lastSyncDuration": 45000                 // NEW: Duration in ms
}
```

**Implementation:**
- Add `isLocked` check via `stateManager.kv.get(SYNC_LOCK_KEY)`
- Calculate `nextScheduledSync` from cron schedule ("0 17 * * *")
- Store `lastSyncDuration` in SyncState during sync

#### 1.2 Create `/admin/history` Endpoint

**New Endpoint:**
```http
GET /admin/history?limit=30
```

**Response:**
```json
{
  "history": [
    {
      "timestamp": "2025-11-15T17:00:00Z",
      "filesProcessed": 10,
      "vectorsUpserted": 15,
      "vectorsDeleted": 0,
      "duration": 45000,
      "errors": []
    },
    ...
  ]
}
```

**Implementation:**
- Store sync results in KV with key pattern: `sync_history_{timestamp}`
- Maintain rolling window of last 30 entries
- Query KV with list() and parse timestamps
- Return sorted array (newest first)

**Files to Modify:**
- `src/api/admin-handler.ts` - Add `handleHistory()` method
- `src/state/kv-state-manager.ts` - Add `saveSyncResult(result: SyncResult)`
- `src/sync/sync-orchestrator.ts` - Call `saveSyncResult()` after sync
- `src/types/index.ts` - Extend `SyncState` interface

**Tests:**
- Unit test for history endpoint with mock KV data
- Test rolling window behavior (31st entry removes oldest)
- Test limit parameter

---

### Phase 2: Frontend Setup (TASK-029)
**Estimated: 3 hours**

#### 2.1 Initialize Vite Project

```bash
# In project root
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

#### 2.2 Install Dependencies

```bash
npm install -D tailwindcss postcss autoprefixer
npm install daisyui
npm install recharts
npm install date-fns  # For date formatting
```

#### 2.3 Configure Tailwind + DaisyUI

**`frontend/tailwind.config.js`:**
```js
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  plugins: [require('daisyui')],
  daisyui: {
    themes: ['light', 'dark'],
  },
};
```

**`frontend/src/index.css`:**
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

#### 2.4 Configure Vite Build

**`frontend/vite.config.ts`:**
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    minify: 'terser',
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: {
      '/admin': 'http://localhost:8787',  // Proxy to Worker dev server
      '/health': 'http://localhost:8787',
    },
  },
});
```

#### 2.5 Project Structure

Create folder structure:
```bash
frontend/src/
├── components/
├── hooks/
├── types/
├── utils/
├── App.tsx
└── main.tsx
```

**Build Script:**
Add to `package.json` (root):
```json
{
  "scripts": {
    "build:frontend": "cd frontend && npm run build",
    "dev:frontend": "cd frontend && npm run dev",
    "dev:worker": "wrangler dev",
    "dev": "concurrently \"npm:dev:worker\" \"npm:dev:frontend\""
  }
}
```

---

### Phase 3: Dashboard UI Components (TASK-030)
**Estimated: 5 hours**

#### 3.1 Type Definitions

**`frontend/src/types/api.ts`:**
```ts
export interface SyncStatus {
  status: 'ok' | 'error';
  lastSyncTime: string | null;
  filesProcessed: number;
  errorCount: number;
  hasStartPageToken: boolean;
  isLocked: boolean;
  nextScheduledSync: string;
  lastSyncDuration: number;
}

export interface SyncStats {
  collection: string;
  vectorCount: number;
  status: string;
}

export interface SyncHistoryEntry {
  timestamp: string;
  filesProcessed: number;
  vectorsUpserted: number;
  vectorsDeleted: number;
  duration: number;
  errors: string[];
}

export interface SyncHistory {
  history: SyncHistoryEntry[];
}
```

#### 3.2 Custom Hooks

**`frontend/src/hooks/useSyncStatus.ts`:**
```ts
import { useState, useEffect } from 'react';
import type { SyncStatus } from '../types/api';

export function useSyncStatus(refreshInterval = 30000) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch('/admin/status', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('adminToken')}`,
          },
        });
        if (!response.ok) throw new Error('Failed to fetch status');
        const data = await response.json();
        setStatus(data);
        setError(null);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  return { status, loading, error };
}
```

Similar hooks for:
- `useSyncStats.ts`
- `useSyncHistory.ts`
- `useNextSyncTime.ts` (calculates countdown from nextScheduledSync)

#### 3.3 Components

**`frontend/src/components/Dashboard.tsx`:**
```tsx
import { StatsCard } from './StatsCard';
import { SyncStatus } from './SyncStatus';
import { SyncHistoryChart } from './SyncHistoryChart';
import { VectorCountChart } from './VectorCountChart';
import { useSyncStatus, useSyncStats, useSyncHistory } from '../hooks';

export function Dashboard() {
  const { status, loading: statusLoading } = useSyncStatus();
  const { stats, loading: statsLoading } = useSyncStats();
  const { history, loading: historyLoading } = useSyncHistory();

  if (statusLoading || statsLoading) {
    return <div className="loading loading-spinner loading-lg"></div>;
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">
        Drive Vector Sync Dashboard
      </h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatsCard
          title="Last Sync"
          value={formatTimeAgo(status?.lastSyncTime)}
          icon="🕒"
        />
        <StatsCard
          title="Files Processed"
          value={status?.filesProcessed || 0}
          icon="📄"
        />
        <StatsCard
          title="Vector Count"
          value={stats?.vectorCount || 0}
          icon="🔢"
        />
        <StatsCard
          title="Errors"
          value={status?.errorCount || 0}
          icon="⚠️"
          alert={status?.errorCount > 0}
        />
      </div>

      {/* Sync Status */}
      <SyncStatus
        isLocked={status?.isLocked}
        nextSync={status?.nextScheduledSync}
        duration={status?.lastSyncDuration}
      />

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <SyncHistoryChart history={history} />
        <VectorCountChart history={history} />
      </div>

      {/* Actions */}
      <div className="flex gap-4 mt-6">
        <button className="btn btn-primary" onClick={handleTriggerSync}>
          Trigger Manual Sync
        </button>
        <button className="btn btn-outline" onClick={handleRefresh}>
          Refresh Now
        </button>
      </div>
    </div>
  );
}
```

**`frontend/src/components/SyncHistoryChart.tsx`:**
```tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { SyncHistory } from '../types/api';

interface Props {
  history: SyncHistory | null;
}

export function SyncHistoryChart({ history }: Props) {
  const data = history?.history.map(entry => ({
    time: new Date(entry.timestamp).toLocaleTimeString(),
    files: entry.filesProcessed,
    upserted: entry.vectorsUpserted,
  })) || [];

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body">
        <h2 className="card-title">Sync History</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="files" stroke="#8884d8" name="Files Processed" />
            <Line type="monotone" dataKey="upserted" stroke="#82ca9d" name="Vectors Upserted" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

Similar component for `VectorCountChart.tsx` (bar chart).

#### 3.4 Features Checklist

- [ ] Stats cards with icons
- [ ] Sync status badge (Idle/In Progress/Error)
- [ ] Next sync countdown timer
- [ ] Line chart for sync history
- [ ] Bar chart for vector counts
- [ ] Manual sync trigger button
- [ ] Refresh button
- [ ] Auto-refresh every 30s
- [ ] Dark mode toggle
- [ ] Loading states
- [ ] Error handling
- [ ] Responsive design

---

### Phase 4: Worker Integration (TASK-031)
**Estimated: 3 hours**

#### 4.1 Build Frontend

```bash
cd frontend
npm run build
# Output: frontend/dist/
```

#### 4.2 Import Static Assets in Worker

**`src/index.ts`:**
```ts
import indexHtml from '../frontend/dist/index.html?raw';  // Using Vite raw import

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Serve index.html at root
    if (url.pathname === '/') {
      return new Response(indexHtml, {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    // Serve static assets
    if (url.pathname.startsWith('/assets/')) {
      return handleAsset(url.pathname);
    }

    // Health check
    if (url.pathname === '/health') {
      return handleHealthCheck();
    }

    // Admin API (existing)
    if (url.pathname.startsWith('/admin/')) {
      if (!validateAdminToken(request, env.ADMIN_TOKEN)) {
        return new Response('Unauthorized', { status: 401 });
      }
      return adminHandler.handleRequest(request);
    }

    return new Response('Not Found', { status: 404 });
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // Existing cron logic
  },
};

function handleAsset(pathname: string): Response {
  // Import all assets from frontend/dist/assets/
  // Use dynamic imports or bundler plugins
  const asset = getAssetContent(pathname);  // Custom loader
  if (!asset) {
    return new Response('Not Found', { status: 404 });
  }

  const contentType = getContentType(pathname);
  return new Response(asset, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000',  // 1 year for hashed assets
    },
  });
}

function getContentType(pathname: string): string {
  if (pathname.endsWith('.js')) return 'application/javascript';
  if (pathname.endsWith('.css')) return 'text/css';
  return 'application/octet-stream';
}
```

#### 4.3 Asset Bundling Strategy

**Option A: Vite Plugin (Recommended)**
Create a Vite plugin to generate asset map with Base64 encoding for binary assets:

**`frontend/vite-plugin-asset-map.ts`:**
```ts
export function assetMapPlugin() {
  return {
    name: 'asset-map',
    generateBundle(options, bundle) {
      const assetMap = {};
      for (const [fileName, asset] of Object.entries(bundle)) {
        if (asset.type === 'asset') {
          // Handle both string and binary (Uint8Array) assets
          let encodedSource: string;
          let isBinary = false;

          if (typeof asset.source === 'string') {
            encodedSource = asset.source;
          } else {
            // Binary asset (Uint8Array) - encode as Base64
            encodedSource = Buffer.from(asset.source).toString('base64');
            isBinary = true;
          }

          assetMap[`/assets/${fileName}`] = {
            content: encodedSource,
            isBinary,
          };
        }
      }
      // Write asset map to JSON file
      this.emitFile({
        type: 'asset',
        fileName: 'asset-map.json',
        source: JSON.stringify(assetMap),
      });
    },
  };
}
```

Import in Worker:
```ts
import assetMap from '../frontend/dist/asset-map.json';

function getAssetContent(pathname: string): string | Uint8Array | null {
  const asset = assetMap[pathname];
  if (!asset) return null;

  // Decode Base64 for binary assets
  if (asset.isBinary) {
    const binaryString = atob(asset.content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  return asset.content;
}
```

**Option B: Esbuild Plugin**
Use esbuild to bundle frontend assets as Worker modules.

#### 4.4 Development Workflow

**Development:**
```bash
# Terminal 1: Run Vite dev server
npm run dev:frontend

# Terminal 2: Run Worker dev server
npm run dev:worker
```

**Production:**
```bash
# Build frontend first
npm run build:frontend

# Deploy worker (includes frontend assets)
npm run deploy
```

#### 4.5 Update `wrangler.toml`

```toml
[build]
command = "npm run build:frontend"

[build.upload]
format = "modules"
```

---

### Phase 5: Testing & Documentation (TASK-032)
**Estimated: 2 hours**

#### 5.1 Unit Tests (Vitest + React Testing Library)

**`frontend/src/components/Dashboard.test.tsx`:**
```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { Dashboard } from './Dashboard';
import { vi } from 'vitest';

vi.mock('../hooks/useSyncStatus', () => ({
  useSyncStatus: () => ({
    status: {
      lastSyncTime: '2025-11-15T01:00:00Z',
      filesProcessed: 150,
      errorCount: 0,
      isLocked: false,
    },
    loading: false,
    error: null,
  }),
}));

test('renders dashboard with stats', async () => {
  render(<Dashboard />);

  await waitFor(() => {
    expect(screen.getByText(/150/)).toBeInTheDocument();
    expect(screen.getByText(/Files Processed/)).toBeInTheDocument();
  });
});
```

#### 5.2 Integration Tests

Test auto-refresh behavior, API error handling, manual sync trigger.

#### 5.3 E2E Tests (Optional)

Use Playwright for full flow testing if needed.

#### 5.4 Documentation

Update `README.md`:

```markdown
## Web Dashboard

Access the sync monitoring dashboard at your worker URL:

https://your-worker.workers.dev/

### Features

- **Real-time Sync Status**: View last sync time, files processed, vector count
- **Sync History Charts**: Visualize sync trends over time
- **Manual Sync Trigger**: Force a manual sync (requires admin token)
- **Auto-refresh**: Dashboard updates every 30 seconds
- **Dark Mode**: Toggle between light and dark themes

### Local Development

Run frontend and worker simultaneously:

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Worker API: http://localhost:8787

### Build and Deploy

```bash
# Build frontend
npm run build:frontend

# Deploy worker (includes frontend)
npm run deploy
```

### Screenshots

[Add screenshots of dashboard]
```

---

## Effort Summary

| Task | Description | Effort |
|------|-------------|--------|
| TASK-028 | Enhanced admin API | 2 hours |
| TASK-029 | Frontend setup | 3 hours |
| TASK-030 | Dashboard UI | 5 hours |
| TASK-031 | Worker integration | 3 hours |
| TASK-032 | Testing & docs | 2 hours |
| **Total** | | **15 hours** |

---

## Future Extensions

### RAG System Integration
- `/query` route for search interface
- `/api/search` endpoint for vector similarity search
- Query input component
- Search results list

### Worknote Editor
- `/notes` route for note management
- `/api/notes` CRUD endpoints
- Rich text editor component
- Sync to Google Drive

---

## Risk Mitigation

### Bundle Size
- **Risk**: Worker bundle exceeds size limits
- **Mitigation**:
  - Use tree-shaking and minification
  - Consider Cloudflare R2 for large assets
  - Monitor bundle size during build

### CORS Issues
- **Risk**: Frontend can't access API in production
- **Mitigation**: Same-origin deployment in Worker

### Auto-refresh Performance
- **Risk**: Too many API calls
- **Mitigation**:
  - 30s interval (120 calls/hour)
  - Cache responses when data unchanged
  - Exponential backoff on errors

---

## Acceptance Criteria

- ✅ Dashboard loads at GET /
- ✅ Displays sync stats (last sync, files, vectors, errors)
- ✅ Shows next scheduled sync time
- ✅ Auto-refreshes every 30 seconds
- ✅ Charts render sync history
- ✅ Manual sync trigger works
- ✅ Dark mode toggle functional
- ✅ Responsive on mobile and desktop
- ✅ All tests passing
- ✅ Documentation complete

---

**End of Implementation Plan**
