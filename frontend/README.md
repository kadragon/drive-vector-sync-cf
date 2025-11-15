# Drive Vector Sync - Frontend Dashboard

React-based web dashboard for monitoring Google Drive to Vectorize sync status.

## Tech Stack

- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite 7
- **UI Library**: DaisyUI (Tailwind CSS)
- **Charts**: Recharts

## Project Structure

```
frontend/
├── src/
│   ├── components/     # React components
│   ├── hooks/          # Custom React hooks
│   ├── types/          # TypeScript type definitions
│   ├── utils/          # Utility functions
│   ├── App.tsx         # Main application component
│   └── main.tsx        # Entry point
├── dist/               # Build output (embedded in Worker)
└── vite.config.ts      # Vite configuration
```

## Development

### Prerequisites

- Node.js 18+
- Worker running on `localhost:8787` (for API proxy)

### Install Dependencies

```bash
npm install
```

### Start Development Server

```bash
npm run dev
```

The dev server will start on `http://localhost:5173` with API proxy configured to forward `/admin/*` and `/health` requests to the Worker at `localhost:8787`.

### Build for Production

```bash
npm run build
```

Build output will be generated in `dist/` directory, ready to be embedded in the Cloudflare Worker.

## API Proxy Configuration

During development, Vite proxies the following routes to the Worker:

- `/admin/*` → `http://localhost:8787/admin/*`
- `/health` → `http://localhost:8787/health`

This allows the frontend to communicate with the Worker API without CORS issues.

## Features

- Real-time sync status monitoring
- Statistics dashboard (files processed, vector count, errors)
- Sync history visualization with charts
- Dark mode support
- Responsive design (mobile + desktop)
- Auto-refresh every 30 seconds

## Next Steps

See `TASK-030` in `.tasks/backlog.yaml` for planned dashboard UI components:

- Stats cards with live data
- Sync status indicators
- History charts (Recharts)
- Manual sync trigger
- Custom hooks for API fetching

## Integration with Worker

The built static assets (`dist/`) will be embedded in the Cloudflare Worker and served at the root path (`GET /`). See `TASK-031` for Worker integration details.
