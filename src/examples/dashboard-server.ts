/**
 * Example Dashboard Server
 * Complete Express server showing integration of dashboard API and UI
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { dashboardRouter } from '@/api/dashboard';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load dashboard styles
const dashboardStyles = `/* Dashboard styles will be loaded at runtime */`;

dotenv.config();

const app = express();
const PORT = process.env.DASHBOARD_PORT || 3000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for React dev
}));
app.use(cors());
app.use(express.json());

// API routes
app.use('/api/dashboard', dashboardRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'lanonasis-dashboard'
  });
});

// Serve dashboard UI
app.get('/dashboard', (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lanonasis Memory Dashboard</title>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>${dashboardStyles}</style>
</head>
<body>
  <div id="root"></div>
  
  <script type="text/babel">
    const { useState, useEffect, useCallback } = React;
    
    const MemoryDashboard = ({ apiBaseUrl, userId, refreshInterval = 30000 }) => {
      const [overview, setOverview] = useState(null);
      const [recentMemories, setRecentMemories] = useState([]);
      const [tags, setTags] = useState([]);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState(null);
      const [lastUpdate, setLastUpdate] = useState(new Date());

      const fetchData = useCallback(async () => {
        try {
          const headers = { 'Content-Type': 'application/json' };

          const overviewRes = await fetch(\`\${apiBaseUrl}/dashboard/overview\`, { headers });
          if (!overviewRes.ok) throw new Error('Failed to fetch overview');
          const overviewData = await overviewRes.json();
          setOverview(overviewData);

          const recentUrl = userId
            ? \`\${apiBaseUrl}/dashboard/recent?userId=\${userId}&limit=10\`
            : \`\${apiBaseUrl}/dashboard/recent?limit=10\`;
          const recentRes = await fetch(recentUrl, { headers });
          if (!recentRes.ok) throw new Error('Failed to fetch recent memories');
          const recentData = await recentRes.json();
          setRecentMemories(recentData.memories);

          const tagsUrl = userId
            ? \`\${apiBaseUrl}/dashboard/tags?userId=\${userId}\`
            : \`\${apiBaseUrl}/dashboard/tags\`;
          const tagsRes = await fetch(tagsUrl, { headers });
          if (!tagsRes.ok) throw new Error('Failed to fetch tags');
          const tagsData = await tagsRes.json();
          setTags(tagsData.tags);

          setLastUpdate(new Date());
          setError(null);
        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      }, [apiBaseUrl, userId]);

      useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, refreshInterval);
        return () => clearInterval(interval);
      }, [fetchData, refreshInterval]);

      if (loading) {
        return (
          <div className="memory-dashboard">
            <div className="dashboard-loading">Loading dashboard...</div>
          </div>
        );
      }

      if (error) {
        return (
          <div className="memory-dashboard">
            <div className="dashboard-error">
              <h3>Error Loading Dashboard</h3>
              <p>{error}</p>
              <button onClick={fetchData}>Retry</button>
            </div>
          </div>
        );
      }

      return (
        <div className="memory-dashboard">
          <div className="dashboard-header">
            <h1>Memory Dashboard</h1>
            <div className="last-updated">
              Last updated: {lastUpdate.toLocaleTimeString()}
            </div>
          </div>

          {overview && (
            <>
              <div className="dashboard-stats">
                <div className="stat-card">
                  <div className="stat-value">{overview.memories.total.toLocaleString()}</div>
                  <div className="stat-label">📚 Total Memories</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{overview.memories.withEmbeddings.toLocaleString()}</div>
                  <div className="stat-label">🧠 Ready (with Embeddings)</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{overview.queue.processing}</div>
                  <div className="stat-label">⚡ Processing</div>
                </div>
              </div>

              <div className="dashboard-section">
                <h2>Memory Types Distribution</h2>
                <div className="memory-types">
                  {Object.entries(overview.memories.byType).map(([type, count]) => {
                    const percentage = (count / overview.memories.total) * 100;
                    return (
                      <div key={type} className="type-bar">
                        <div className="type-label">
                          {type.charAt(0).toUpperCase() + type.slice(1)} ({count})
                        </div>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: \`\${percentage}%\` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="dashboard-section">
                <h2>Queue Status</h2>
                <div className="queue-stats">
                  <div className="queue-item">
                    <span className="queue-label">⏳ Pending:</span>
                    <span className="queue-value">{overview.queue.pending}</span>
                  </div>
                  <div className="queue-item">
                    <span className="queue-label">⚙️ Processing:</span>
                    <span className="queue-value">{overview.queue.processing}</span>
                  </div>
                  <div className="queue-item">
                    <span className="queue-label">✅ Completed:</span>
                    <span className="queue-value">{overview.queue.completed}</span>
                  </div>
                  <div className="queue-item">
                    <span className="queue-label">❌ Failed:</span>
                    <span className="queue-value">{overview.queue.failed}</span>
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="dashboard-section">
            <h2>Recent Memories</h2>
            <div className="memories-list">
              {recentMemories.map((memory) => (
                <div key={memory.id} className="memory-card">
                  <div className="memory-header">
                    <h3 className="memory-title">{memory.title}</h3>
                    <span className="memory-type">[{memory.memory_type}]</span>
                  </div>
                  <div className="memory-content">
                    {memory.content.substring(0, 150)}
                    {memory.content.length > 150 ? '...' : ''}
                  </div>
                  <div className="memory-footer">
                    <div className="memory-tags">
                      {memory.tags?.map((tag, idx) => (
                        <span key={idx} className="tag">#{tag}</span>
                      ))}
                    </div>
                    <div className="memory-status">🧠 Ready</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {tags.length > 0 && (
            <div className="dashboard-section">
              <h2>Popular Tags</h2>
              <div className="tag-cloud">
                {tags.slice(0, 20).map((tagData) => {
                  const maxCount = Math.max(...tags.map(t => t.count));
                  const size = 0.8 + (tagData.count / maxCount) * 1.2;
                  return (
                    <span
                      key={tagData.tag}
                      className="cloud-tag"
                      style={{ fontSize: \`\${size}em\` }}
                      title={\`\${tagData.count} memories\`}
                    >
                      {tagData.tag}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );
    };

    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(<MemoryDashboard apiBaseUrl="${process.env.API_BASE_URL || '/api'}" />);
  </script>
</body>
</html>
  `;
  
  res.send(html);
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Lanonasis Dashboard Server',
    version: '1.0.0',
    endpoints: {
      dashboard: '/dashboard',
      api: '/api/dashboard/*',
      health: '/health'
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Dashboard server running on http://localhost:${PORT}`);
  console.log(`📊 Dashboard UI: http://localhost:${PORT}/dashboard`);
  console.log(`🔌 API: http://localhost:${PORT}/api/dashboard/overview`);
  console.log(`\nEnvironment:`);
  console.log(`  - API_BASE_URL: ${process.env.API_BASE_URL || '/api'}`);
  console.log(`  - NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
