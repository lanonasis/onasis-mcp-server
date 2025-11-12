# Lanonasis Memory Dashboard UI Components

This directory contains the user interface components for visualizing and managing Lanonasis memory records.

## Components

### 1. MemoryDashboard.tsx - React Web Component

A production-ready React component for web applications.

**Features:**
- Real-time memory statistics
- Memory type distribution visualization
- Recent memories list with pagination
- Tag cloud
- Queue metrics
- Auto-refresh capability

**Usage:**

```typescript
import { MemoryDashboard, dashboardStyles } from './ui/MemoryDashboard';

function App() {
  return (
    <>
      <style>{dashboardStyles}</style>
      <MemoryDashboard
        apiBaseUrl="http://localhost:3000/api"
        userId="optional-user-id"
        refreshInterval={30000}
      />
    </>
  );
}
```

**Props:**
- `apiBaseUrl` (required): Base URL for the dashboard API
- `userId` (optional): Filter memories by user ID
- `refreshInterval` (optional): Auto-refresh interval in ms (default: 30000)

**Customization:**

```css
.memory-dashboard {
  --primary-color: #your-color;
  --background-color: #your-bg;
  --card-background: #your-card-bg;
}
```

### 2. IDE Extension - VSCode/Cursor/Windsurf

A complete IDE extension for viewing memory data in the sidebar.

**Location:** `ide-extension/`

**Features:**
- Sidebar panel in Activity Bar
- Quick stats display
- Recent memories list
- Search/filter capabilities
- Native IDE theming
- Auto-refresh

**Installation:**

```bash
cd src/ui/ide-extension
npm install
npm run compile
npm run package
code --install-extension lanonasis-memory-1.0.0.vsix
```

**Configuration:**

Add to VS Code settings (`settings.json`):

```json
{
  "lanonasis.apiBaseUrl": "http://localhost:3000/api",
  "lanonasis.userId": "your-user-id",
  "lanonasis.refreshInterval": 30000
}
```

**Commands:**
- `Lanonasis: Refresh Memories` - Manually refresh data
- `Lanonasis: Open Settings` - Open extension settings

## Quick Start

### For Web Applications:

1. Start the API server:
```bash
npm run dev
# or
npm start
```

2. Import the component:
```typescript
import { MemoryDashboard, dashboardStyles } from './src/ui/MemoryDashboard';
```

3. Use in your app:
```tsx
<MemoryDashboard apiBaseUrl="http://localhost:3000/api" />
```

### For IDE:

1. Build extension:
```bash
cd src/ui/ide-extension
npm install
npm run compile
npm run package
```

2. Install in your IDE:
```bash
code --install-extension lanonasis-memory-1.0.0.vsix
```

3. Configure settings and click the Lanonasis icon in Activity Bar

## API Requirements

Both components require the dashboard API to be running. See `src/api/dashboard.ts` for API endpoints.

Required endpoints:
- `GET /api/dashboard/overview` - Overview statistics
- `GET /api/dashboard/recent` - Recent memories
- `GET /api/dashboard/tags` - Tag cloud data

## Development

### Building Components:

```bash
# TypeScript compilation
npm run build

# Watch mode for development
npm run dev
```

### Testing:

```bash
# Start example server
npm run examples:dashboard

# Open browser
open http://localhost:3000/dashboard
```

## Examples

See `src/examples/dashboard-server.ts` for a complete working example with:
- Express server setup
- Dashboard API integration
- React UI serving
- Environment configuration

## Troubleshooting

### Component won't load:
- Ensure API server is running
- Check API base URL configuration
- Verify CORS settings
- Check browser console for errors

### IDE extension not working:
- Verify extension is installed: `code --list-extensions`
- Check extension output panel for errors
- Ensure API base URL is configured correctly
- Try reloading VS Code window

### No data showing:
- Verify API key is valid (if required)
- Check network requests in browser/IDE dev tools
- Ensure memory service is properly configured
- Check API endpoint responses

## Contributing

When modifying UI components:
1. Keep components framework-agnostic where possible
2. Maintain TypeScript type safety
3. Follow existing styling patterns
4. Test in multiple browsers/IDEs
5. Update this README with changes

## License

MIT License - See LICENSE file for details
