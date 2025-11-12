/**
 * Memory Dashboard React Component
 * Production-ready dashboard for visualizing memory records
 */

import React, { useState, useEffect, useCallback } from 'react';

interface MemoryEntry {
  id: string;
  title: string;
  content: string;
  memory_type: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
}

interface DashboardOverview {
  memories: {
    total: number;
    withEmbeddings: number;
    withoutEmbeddings: number;
    byType: Record<string, number>;
    recentCount: number;
  };
  queue: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    averageTime: number;
  };
}

interface RecentMemoriesResponse {
  memories: MemoryEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface TagData {
  tag: string;
  count: number;
}

interface MemoryDashboardProps {
  apiBaseUrl: string;
  userId?: string;
  refreshInterval?: number;
}

export const MemoryDashboard: React.FC<MemoryDashboardProps> = ({
  apiBaseUrl,
  userId,
  refreshInterval = 30000,
}) => {
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [recentMemories, setRecentMemories] = useState<MemoryEntry[]>([]);
  const [tags, setTags] = useState<TagData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const fetchData = useCallback(async () => {
    try {
      const headers = {
        'Content-Type': 'application/json',
      };

      // Fetch overview
      const overviewRes = await fetch(`${apiBaseUrl}/dashboard/overview`, { headers });
      if (!overviewRes.ok) throw new Error('Failed to fetch overview');
      const overviewData = await overviewRes.json();
      setOverview(overviewData);

      // Fetch recent memories
      const recentUrl = userId
        ? `${apiBaseUrl}/dashboard/recent?userId=${userId}&limit=10`
        : `${apiBaseUrl}/dashboard/recent?limit=10`;
      const recentRes = await fetch(recentUrl, { headers });
      if (!recentRes.ok) throw new Error('Failed to fetch recent memories');
      const recentData: RecentMemoriesResponse = await recentRes.json();
      setRecentMemories(recentData.memories);

      // Fetch tags
      const tagsUrl = userId
        ? `${apiBaseUrl}/dashboard/tags?userId=${userId}`
        : `${apiBaseUrl}/dashboard/tags`;
      const tagsRes = await fetch(tagsUrl, { headers });
      if (!tagsRes.ok) throw new Error('Failed to fetch tags');
      const tagsData = await tagsRes.json();
      setTags(tagsData.tags);

      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
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
          {/* Overview Stats */}
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

          {/* Memory Types Distribution */}
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
                      <div
                        className="progress-fill"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Queue Status */}
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
              {overview.queue.averageTime > 0 && (
                <div className="queue-item">
                  <span className="queue-label">⏱️ Avg Time:</span>
                  <span className="queue-value">{overview.queue.averageTime}ms</span>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Recent Memories */}
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

      {/* Tag Cloud */}
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
                  style={{ fontSize: `${size}em` }}
                  title={`${tagData.count} memories`}
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

// CSS Styles as string export for easy inclusion
export const dashboardStyles = `
.memory-dashboard {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --primary-color: #4f46e5;
  --background-color: #f9fafb;
  --card-background: #ffffff;
  --text-color: #111827;
  --border-color: #e5e7eb;
  --success-color: #10b981;
  --warning-color: #f59e0b;
  --error-color: #ef4444;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 2px solid var(--border-color);
}

.dashboard-header h1 {
  font-size: 2rem;
  color: var(--text-color);
  margin: 0;
}

.last-updated {
  color: #6b7280;
  font-size: 0.875rem;
}

.dashboard-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.stat-card {
  background: var(--card-background);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 20px;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.stat-value {
  font-size: 2.5rem;
  font-weight: bold;
  color: var(--primary-color);
  margin-bottom: 8px;
}

.stat-label {
  font-size: 0.875rem;
  color: #6b7280;
}

.dashboard-section {
  background: var(--card-background);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.dashboard-section h2 {
  margin: 0 0 20px 0;
  font-size: 1.5rem;
  color: var(--text-color);
}

.memory-types {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.type-bar {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.type-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-color);
}

.progress-bar {
  height: 24px;
  background: var(--background-color);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--primary-color), #6366f1);
  transition: width 0.3s ease;
}

.queue-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 15px;
}

.queue-item {
  display: flex;
  justify-content: space-between;
  padding: 10px;
  background: var(--background-color);
  border-radius: 6px;
}

.queue-label {
  font-size: 0.875rem;
  color: #6b7280;
}

.queue-value {
  font-weight: 600;
  color: var(--text-color);
}

.memories-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.memory-card {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 15px;
  background: var(--background-color);
  transition: box-shadow 0.2s;
}

.memory-card:hover {
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.memory-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.memory-title {
  margin: 0;
  font-size: 1.125rem;
  color: var(--text-color);
}

.memory-type {
  font-size: 0.75rem;
  color: #6b7280;
  background: #e5e7eb;
  padding: 2px 8px;
  border-radius: 4px;
}

.memory-content {
  color: #4b5563;
  font-size: 0.875rem;
  line-height: 1.5;
  margin-bottom: 10px;
}

.memory-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.memory-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.tag {
  font-size: 0.75rem;
  color: var(--primary-color);
  background: #eef2ff;
  padding: 2px 8px;
  border-radius: 4px;
}

.memory-status {
  font-size: 0.75rem;
  color: var(--success-color);
}

.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.cloud-tag {
  color: var(--primary-color);
  cursor: pointer;
  transition: all 0.2s;
  padding: 5px 10px;
}

.cloud-tag:hover {
  color: #6366f1;
  transform: scale(1.1);
}

.dashboard-loading,
.dashboard-error {
  text-align: center;
  padding: 40px;
  background: var(--card-background);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.dashboard-error h3 {
  color: var(--error-color);
  margin-bottom: 10px;
}

.dashboard-error button {
  margin-top: 15px;
  padding: 10px 20px;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1rem;
}

.dashboard-error button:hover {
  background: #4338ca;
}
`;
