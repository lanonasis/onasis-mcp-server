# Lanonasis Memory Visualization System Guide

Complete guide for the memory records visualization system including API endpoints, UI components, and IDE integration.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [REST API Endpoints](#rest-api-endpoints)
4. [React Dashboard Component](#react-dashboard-component)
5. [IDE Extension](#ide-extension)
6. [Integration Examples](#integration-examples)
7. [Configuration](#configuration)
8. [Performance Optimization](#performance-optimization)
9. [Troubleshooting](#troubleshooting)

## Overview

The visualization system provides three integration points:

1. **REST API** - Backend endpoints exposing memory stats, queue metrics, and analytics
2. **React Dashboard** - Web component for browser-based visualization
3. **IDE Extension** - VSCode/Cursor/Windsurf sidebar integration

All components share the same API backend for consistency.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Client Applications                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │    React     │  │     IDE      │  │   Custom     │  │
│  │  Dashboard   │  │  Extension   │  │     Apps     │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
└─────────┼──────────────────┼──────────────────┼─────────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │
                    ┌────────▼─────────┐
                    │  Dashboard API   │
                    │   (Express)      │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  Memory Service  │
                    │   (Onasis-Core)  │
                    └──────────────────┘
```

## REST API Endpoints

### Base URL
```
http://localhost:3000/api/dashboard
```

### 1. GET /overview

Get comprehensive dashboard overview with memory stats and queue metrics.

**Response:**
```json
{
  "memories": {
    "total": 1543,
    "withEmbeddings": 1420,
    "withoutEmbeddings": 123,
    "byType": {
      "knowledge": 850,
      "conversation": 450,
      "context": 243
    },
    "recentCount": 67
  },
  "queue": {
    "pending": 5,
    "processing": 3,
    "completed": 1420,
    "failed": 12,
    "averageTime": 234
  }
}
```

### 2. GET /recent

Get recent memories with pagination.

**Query Parameters:**
- `page` (optional, default: 1) - Page number
- `limit` (optional, default: 20) - Items per page
- `userId` (optional) - Filter by user ID

**Response:**
```json
{
  "memories": [
    {
      "id": "uuid",
      "title": "Understanding Neural Networks",
      "content": "Neural networks are...",
      "memory_type": "knowledge",
      "tags": ["ai", "ml", "neural-networks"],
      "created_at": "2025-01-15T10:30:00Z",
      "updated_at": "2025-01-15T10:30:00Z"
    }
  ],
  "total": 1543,
  "page": 1,
  "limit": 20,
  "totalPages": 78
}
```

### 3. GET /search-analytics

Get search analytics and trends.

**Response:**
```json
{
  "totalSearches": 15420,
  "averageSimilarity": 0.85,
  "topQueries": [
    { "query": "neural networks", "count": 234 },
    { "query": "api design", "count": 189 }
  ],
  "searchModes": {
    "semantic": 8500,
    "keyword": 4200,
    "hybrid": 2720
  }
}
```

### 4. GET /queue/jobs

Get queue job history.

**Response:**
```json
{
  "jobs": [
    {
      "id": "job-uuid",
      "type": "embedding_generation",
      "status": "completed",
      "duration": 234,
      "created_at": "2025-01-15T10:30:00Z",
      "completed_at": "2025-01-15T10:30:02Z"
    }
  ],
  "total": 1420
}
```

### 5. GET /tags

Get tag cloud data with frequencies.

**Query Parameters:**
- `userId` (optional) - Filter by user ID

**Response:**
```json
{
  "tags": [
    { "tag": "ai", "count": 450 },
    { "tag": "ml", "count": 380 },
    { "tag": "api", "count": 320 }
  ]
}
```

## React Dashboard Component

### Installation

The component is included in the repository at `src/ui/MemoryDashboard.tsx`.

### Basic Usage

```tsx
import { MemoryDashboard, dashboardStyles } from './src/ui/MemoryDashboard';

function App() {
  return (
    <>
      <style>{dashboardStyles}</style>
      <MemoryDashboard
        apiBaseUrl="http://localhost:3000/api"
        refreshInterval={30000}
      />
    </>
  );
}
```

### Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `apiBaseUrl` | string | Yes | - | Base URL for dashboard API |
| `userId` | string | No | undefined | Filter memories by user |
| `refreshInterval` | number | No | 30000 | Auto-refresh interval (ms) |

### Features

- ✅ Real-time stats with auto-refresh
- ✅ Memory type distribution charts
- ✅ Recent memories list
- ✅ Tag cloud visualization
- ✅ Queue metrics display
- ✅ Error handling with retry
- ✅ Loading states
- ✅ Responsive design

### Customization

Override CSS variables:

```css
.memory-dashboard {
  --primary-color: #4f46e5;
  --background-color: #f9fafb;
  --card-background: #ffffff;
  --text-color: #111827;
  --border-color: #e5e7eb;
}
```

## IDE Extension

### Installation

```bash
cd src/ui/ide-extension
npm install
npm run compile
npm run package
code --install-extension lanonasis-memory-1.0.0.vsix
```

### Configuration

Add to VS Code `settings.json`:

```json
{
  "lanonasis.apiBaseUrl": "http://localhost:3000/api",
  "lanonasis.userId": "your-user-id",
  "lanonasis.refreshInterval": 30000
}
```

### Features

- ✅ Activity Bar sidebar panel
- ✅ Quick stats display
- ✅ Recent memories list
- ✅ Search/filter functionality
- ✅ Native IDE theming
- ✅ Auto-refresh
- ✅ Click to open memories

### Commands

- **Lanonasis: Refresh Memories** - Manual refresh
- **Lanonasis: Open Settings** - Open configuration

### Development

```bash
# Watch mode for development
npm run watch

# Compile for production
npm run compile

# Package extension
npm run package
```

## Integration Examples

### Express.js Integration

```typescript
import express from 'express';
import { dashboardRouter } from './src/api/dashboard';

const app = express();

app.use('/api/dashboard', dashboardRouter);

app.listen(3000, () => {
  console.log('Dashboard API running on http://localhost:3000');
});
```

### Next.js Integration

```tsx
// pages/dashboard.tsx
import { MemoryDashboard, dashboardStyles } from '../src/ui/MemoryDashboard';

export default function DashboardPage() {
  return (
    <>
      <style>{dashboardStyles}</style>
      <MemoryDashboard apiBaseUrl="/api" />
    </>
  );
}

// pages/api/dashboard/[...slug].ts
import { dashboardRouter } from '../../../src/api/dashboard';

export default function handler(req, res) {
  return dashboardRouter(req, res);
}
```

### Standalone Server

See `src/examples/dashboard-server.ts` for a complete example:

```bash
npm run examples:dashboard
```

Then open:
- Dashboard UI: http://localhost:3000/dashboard
- API: http://localhost:3000/api/dashboard/overview

## Configuration

### Environment Variables

```bash
# API Configuration
API_BASE_URL=http://localhost:3000/api
DASHBOARD_PORT=3000

# Memory Service
LANONASIS_MAAS_URL=https://lanonasis-maas.netlify.app/.netlify/functions/api

# Optional
NODE_ENV=production
LOG_LEVEL=info
```

### API Authentication

If your API requires authentication, pass the API key in headers:

```typescript
// Custom fetch wrapper
const fetchWithAuth = (url: string, options = {}) => {
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${apiKey}`,
    },
  });
};
```

## Performance Optimization

### Caching

Implement caching for frequently accessed data:

```typescript
// Cache overview data for 30 seconds
const cache = new Map();

app.get('/api/dashboard/overview', async (req, res) => {
  const cached = cache.get('overview');
  if (cached && Date.now() - cached.time < 30000) {
    return res.json(cached.data);
  }

  const data = await fetchOverview();
  cache.set('overview', { data, time: Date.now() });
  res.json(data);
});
```

### Pagination

Always use pagination for large datasets:

```typescript
<MemoryDashboard 
  apiBaseUrl="/api"
  // Component handles pagination internally
/>
```

### Debouncing

Search inputs are automatically debounced to reduce API calls.

### WebSocket/SSE for Real-Time Updates

For truly real-time updates, consider implementing WebSocket or Server-Sent Events:

```typescript
// SSE endpoint
app.get('/api/dashboard/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendUpdate = () => {
    const data = { /* dashboard data */ };
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const interval = setInterval(sendUpdate, 5000);

  req.on('close', () => {
    clearInterval(interval);
  });
});
```

## Troubleshooting

### Common Issues

#### 1. API Not Responding

**Problem:** Dashboard shows "Failed to fetch overview"

**Solutions:**
- Check API server is running: `curl http://localhost:3000/api/dashboard/overview`
- Verify `apiBaseUrl` prop is correct
- Check CORS configuration
- Review server logs for errors

#### 2. No Data Displayed

**Problem:** Dashboard loads but shows empty state

**Solutions:**
- Verify memory service has data: `GET /api/v1/memory`
- Check API key is valid (if required)
- Review network tab in browser dev tools
- Check for filtering issues (userId, tags, etc.)

#### 3. IDE Extension Not Loading

**Problem:** Extension installed but not visible

**Solutions:**
- Verify installation: `code --list-extensions | grep lanonasis`
- Check extension is enabled in VS Code
- Reload VS Code window: `Cmd/Ctrl + Shift + P` → "Reload Window"
- Check extension output panel for errors

#### 4. Slow Performance

**Problem:** Dashboard is slow or unresponsive

**Solutions:**
- Implement caching (see Performance Optimization)
- Reduce refresh interval
- Use pagination for large datasets
- Optimize database queries
- Add indexes to database tables

#### 5. Authentication Errors

**Problem:** 401 Unauthorized responses

**Solutions:**
- Verify API key is configured
- Check Authorization header format
- Ensure API key has correct permissions
- Review authentication middleware

### Debug Mode

Enable debug logging:

```typescript
// In dashboard component
useEffect(() => {
  console.log('Dashboard state:', { overview, recentMemories, tags });
}, [overview, recentMemories, tags]);
```

### Health Check

Test API health:

```bash
# Check API is responding
curl http://localhost:3000/health

# Check specific endpoint
curl http://localhost:3000/api/dashboard/overview

# With authentication
curl -H "Authorization: Bearer your-api-key" \
  http://localhost:3000/api/dashboard/overview
```

## Best Practices

1. **Error Handling:** Always implement proper error handling and user feedback
2. **Loading States:** Show loading indicators during data fetches
3. **Caching:** Cache data appropriately to reduce API load
4. **Pagination:** Use pagination for large datasets
5. **Security:** Validate and sanitize all user inputs
6. **Performance:** Monitor and optimize API response times
7. **Testing:** Test with various data volumes and edge cases
8. **Documentation:** Keep API documentation up to date

## Support

For issues or questions:
- GitHub Issues: https://github.com/lanonasis/onasis-mcp-server/issues
- Documentation: https://mcp.lanonasis.com
- Email: support@lanonasis.com

## License

MIT License - See LICENSE file for details
