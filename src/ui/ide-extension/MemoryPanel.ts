/**
 * Memory Dashboard Webview Panel for IDE
 */

import * as vscode from 'vscode';

export class MemoryPanel implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage((data) => {
      switch (data.type) {
        case 'openMemory':
          vscode.window.showInformationMessage(`Opening memory: ${data.id}`);
          break;
        case 'error':
          vscode.window.showErrorMessage(data.message);
          break;
      }
    });
  }

  public refresh() {
    if (this._view) {
      this._view.webview.postMessage({ type: 'refresh' });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const config = vscode.workspace.getConfiguration('lanonasis');
    const apiBaseUrl = config.get<string>('apiBaseUrl', 'http://localhost:3000/api');
    const userId = config.get<string>('userId', '');
    const refreshInterval = config.get<number>('refreshInterval', 30000);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lanonasis Memory Dashboard</title>
  <style>
    body {
      padding: 10px;
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      font-size: var(--vscode-font-size);
    }
    
    .header {
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    
    h2 {
      margin: 0 0 10px 0;
      font-size: 1.2em;
    }
    
    .search-box {
      width: 100%;
      padding: 8px;
      margin-bottom: 15px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
    }
    
    .stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 15px;
    }
    
    .stat-card {
      padding: 10px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 4px;
      text-align: center;
    }
    
    .stat-value {
      font-size: 1.5em;
      font-weight: bold;
      color: var(--vscode-textLink-foreground);
    }
    
    .stat-label {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
    }
    
    .section {
      margin-bottom: 15px;
    }
    
    .section-title {
      font-size: 0.95em;
      font-weight: bold;
      margin-bottom: 8px;
      color: var(--vscode-foreground);
    }
    
    .queue-status {
      display: flex;
      justify-content: space-between;
      font-size: 0.85em;
      padding: 8px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 4px;
    }
    
    .memories-list {
      max-height: 400px;
      overflow-y: auto;
    }
    
    .memory-item {
      padding: 10px;
      margin-bottom: 8px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 4px;
      cursor: pointer;
      border-left: 3px solid var(--vscode-textLink-foreground);
    }
    
    .memory-item:hover {
      background: var(--vscode-list-hoverBackground);
    }
    
    .memory-title {
      font-weight: bold;
      margin-bottom: 4px;
      font-size: 0.9em;
    }
    
    .memory-tags {
      font-size: 0.75em;
      color: var(--vscode-descriptionForeground);
    }
    
    .memory-status {
      font-size: 0.75em;
      margin-top: 4px;
    }
    
    .loading {
      text-align: center;
      padding: 20px;
      color: var(--vscode-descriptionForeground);
    }
    
    .error {
      padding: 10px;
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      border-radius: 4px;
      color: var(--vscode-errorForeground);
    }
  </style>
</head>
<body>
  <div class="header">
    <h2>📚 Memory Dashboard</h2>
  </div>
  
  <input type="text" class="search-box" id="searchBox" placeholder="Search memories...">
  
  <div class="stats">
    <div class="stat-card">
      <div class="stat-value" id="totalMemories">-</div>
      <div class="stat-label">Total</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" id="readyMemories">-</div>
      <div class="stat-label">Ready</div>
    </div>
  </div>
  
  <div class="section">
    <div class="section-title">Queue Status</div>
    <div class="queue-status">
      <span id="queuePending">0 Pending</span>
      <span id="queueCompleted">0 Done</span>
    </div>
  </div>
  
  <div class="section">
    <div class="section-title">Recent Memories</div>
    <div id="memoriesList" class="memories-list">
      <div class="loading">Loading...</div>
    </div>
  </div>
  
  <script>
    const vscode = acquireVsCodeApi();
    const apiBaseUrl = '${apiBaseUrl}';
    const userId = '${userId}';
    const refreshInterval = ${refreshInterval};
    
    let searchTerm = '';
    
    async function fetchData() {
      try {
        // Fetch overview
        const overviewRes = await fetch(\`\${apiBaseUrl}/dashboard/overview\`);
        if (!overviewRes.ok) throw new Error('Failed to fetch overview');
        const overview = await overviewRes.json();
        
        document.getElementById('totalMemories').textContent = overview.memories.total.toLocaleString();
        document.getElementById('readyMemories').textContent = overview.memories.withEmbeddings.toLocaleString();
        document.getElementById('queuePending').textContent = \`\${overview.queue.pending} Pending\`;
        document.getElementById('queueCompleted').textContent = \`\${overview.queue.completed} Done\`;
        
        // Fetch recent memories
        const recentUrl = userId 
          ? \`\${apiBaseUrl}/dashboard/recent?userId=\${userId}&limit=20\`
          : \`\${apiBaseUrl}/dashboard/recent?limit=20\`;
        const recentRes = await fetch(recentUrl);
        if (!recentRes.ok) throw new Error('Failed to fetch memories');
        const recentData = await recentRes.json();
        
        renderMemories(recentData.memories);
      } catch (error) {
        document.getElementById('memoriesList').innerHTML = 
          \`<div class="error">Error: \${error.message}</div>\`;
        vscode.postMessage({ type: 'error', message: error.message });
      }
    }
    
    function renderMemories(memories) {
      const filtered = memories.filter(m => 
        searchTerm === '' || 
        m.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      
      const html = filtered.map(memory => \`
        <div class="memory-item" onclick="openMemory('\${memory.id}')">
          <div class="memory-title">▸ \${memory.title}</div>
          <div class="memory-tags">\${memory.tags.map(t => '#' + t).join(' ')}</div>
          <div class="memory-status">🧠 Ready</div>
        </div>
      \`).join('');
      
      document.getElementById('memoriesList').innerHTML = html || '<div class="loading">No memories found</div>';
    }
    
    function openMemory(id) {
      vscode.postMessage({ type: 'openMemory', id });
    }
    
    document.getElementById('searchBox').addEventListener('input', (e) => {
      searchTerm = e.target.value;
      // Re-render with current data
      fetchData();
    });
    
    // Listen for refresh messages
    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'refresh') {
        fetchData();
      }
    });
    
    // Initial load
    fetchData();
    
    // Auto-refresh
    setInterval(fetchData, refreshInterval);
  </script>
</body>
</html>`;
  }
}
