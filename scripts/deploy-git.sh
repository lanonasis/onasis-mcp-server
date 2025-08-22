#!/bin/bash

##
# Lanonasis MCP Server - Git-based VPS Deployment Script
# Deploys from GitHub repository with automatic updates
# Server: srv896342.hstgr.cloud (168.231.74.29)
##

set -e

# Configuration
VPS_HOST="root@168.231.74.29"
VPS_PORT="2222"
DEPLOY_PATH="/opt/mcp-servers/lanonasis-standalone"
SERVICE_NAME="lanonasis-mcp-server"
GIT_REPO="https://github.com/lanonasis/onasis-mcp-server.git"
GIT_BRANCH="main"
BACKUP_RETAIN=5

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
    exit 1
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if we're in the right directory
    if [ ! -f "package.json" ] || [ ! -d "src" ]; then
        error "Please run this script from the lanonasis-mcp root directory"
    fi
    
    # Check if git is available and repo is clean
    if ! git status --porcelain 2>/dev/null; then
        error "Not a git repository or git not available"
    fi
    
    # Check SSH connection
    if ! ssh -p $VPS_PORT -o ConnectTimeout=10 -o BatchMode=yes $VPS_HOST exit 2>/dev/null; then
        error "Cannot connect to VPS. Please check SSH configuration."
    fi
    
    success "Prerequisites check passed"
}

# Push local changes to git
push_to_git() {
    log "Pushing changes to git repository..."
    
    # Check if there are uncommitted changes
    if [ -n "$(git status --porcelain)" ]; then
        warning "You have uncommitted changes. Commit them first:"
        git status --short
        error "Please commit your changes before deploying"
    fi
    
    # Push to remote
    git push origin $GIT_BRANCH
    
    success "Changes pushed to git repository"
}

# Deploy from git repository to VPS
deploy_from_git() {
    log "Deploying from git repository to VPS..."
    
    ssh -p $VPS_PORT $VPS_HOST << ENDSSH
    set -e
    
    # Configuration
    DEPLOY_PATH="$DEPLOY_PATH"
    SERVICE_NAME="$SERVICE_NAME"
    GIT_REPO="$GIT_REPO"
    GIT_BRANCH="$GIT_BRANCH"
    
    echo "🚀 Starting git-based Lanonasis MCP Server deployment..."
    
    # Create deployment directory structure
    mkdir -p /opt/mcp-servers
    mkdir -p /var/log/pm2
    mkdir -p /var/log/lanonasis-mcp
    mkdir -p /opt/certs
    
    # Navigate to deployment path
    mkdir -p \$DEPLOY_PATH
    cd \$DEPLOY_PATH
    
    # Backup existing deployment
    if [ -d "current" ]; then
        echo "📦 Backing up current deployment..."
        mv current backup-\$(date +%Y%m%d-%H%M%S)
        
        # Keep only last $BACKUP_RETAIN backups
        ls -dt backup-* 2>/dev/null | tail -n +\$((\$BACKUP_RETAIN + 1)) | xargs rm -rf 2>/dev/null || true
    fi
    
    # Clone or pull from git repository
    echo "📥 Fetching latest code from git..."
    if [ -d ".git" ]; then
        git fetch origin
        git reset --hard origin/\$GIT_BRANCH
        git clean -fd
    else
        git clone --depth 1 --branch \$GIT_BRANCH \$GIT_REPO current
        cd current
    fi
    
    # Ensure we're in the current directory
    cd \$DEPLOY_PATH/current
    
    # Install dependencies
    echo "📦 Installing dependencies..."
    npm ci --silent --production
    
    # Build TypeScript
    echo "🔨 Building TypeScript..."
    npm run build
    
    # Setup environment variables
    echo "⚙️  Configuring environment..."
    if [ ! -f .env.production ]; then
        echo "❌ .env.production not found in repository"
        echo "Creating basic .env.production file..."
        cat > .env.production << 'EOF'
NODE_ENV=production
PORT=3001
MCP_WS_PORT=3002
MCP_SSE_PORT=3003
ENABLE_HTTP=true
ENABLE_WEBSOCKET=true
ENABLE_SSE=true
ENABLE_STDIO=false

# Add your Supabase and OpenAI credentials here
# SUPABASE_URL=your_supabase_url
# SUPABASE_ANON_KEY=your_supabase_key
# OPENAI_API_KEY=your_openai_key
EOF
        echo "⚠️  Please update .env.production with your actual credentials"
    fi
    
    # Copy SSL certificate if exists
    echo "🔒 Setting up SSL certificate..."
    if [ -f "src/config/prod-ca-2021.crt" ]; then
        cp src/config/prod-ca-2021.crt /opt/certs/
        chmod 600 /opt/certs/prod-ca-2021.crt
        chown root:root /opt/certs/prod-ca-2021.crt
        echo "✅ SSL certificate configured"
    else
        echo "⚠️  SSL certificate not found, using system defaults"
    fi
    
    # Setup PM2 ecosystem
    if [ -f ecosystem.config.js ]; then
        echo "🔄 Configuring PM2 ecosystem..."
        
        # Stop existing service if running
        pm2 stop \$SERVICE_NAME 2>/dev/null || true
        pm2 delete \$SERVICE_NAME 2>/dev/null || true
        
        # Start new service
        pm2 start ecosystem.config.js --env production
        pm2 save
        
        # Ensure PM2 starts on boot
        pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
        
        echo "✅ PM2 service configured and started"
    else
        echo "❌ ecosystem.config.js not found"
        exit 1
    fi
    
    # Wait for service to start
    echo "⏳ Waiting for service to start..."
    sleep 5
    
    # Check service status
    if pm2 list | grep -q "\$SERVICE_NAME.*online"; then
        echo "✅ Lanonasis MCP Server is running"
    else
        echo "❌ Failed to start service"
        pm2 logs \$SERVICE_NAME --lines 10
        exit 1
    fi
    
    # Test health endpoint
    sleep 2
    if curl -s -f http://localhost:3001/health >/dev/null 2>&1; then
        echo "✅ Health check passed"
    else
        echo "⚠️  Health check failed, but service is running"
    fi
    
    # Display service information
    echo ""
    echo "🎉 Lanonasis MCP Server deployed successfully from git!"
    echo "📍 Service: \$SERVICE_NAME"
    echo "🔌 Port: 3001 (http), 3002 (ws), 3003 (sse)"
    echo "📊 Status: \$(pm2 jlist | jq -r '.[] | select(.name=="\$SERVICE_NAME") | .pm2_env.status' 2>/dev/null || echo 'running')"
    echo "💾 Memory: \$(pm2 jlist | jq -r '.[] | select(.name=="\$SERVICE_NAME") | .monit.memory' 2>/dev/null | numfmt --to=iec 2>/dev/null || echo 'N/A')"
    echo "🕒 Uptime: \$(pm2 jlist | jq -r '.[] | select(.name=="\$SERVICE_NAME") | .pm2_env.pm_uptime' 2>/dev/null || echo 'N/A')"
    echo "📦 Git Commit: \$(git rev-parse --short HEAD 2>/dev/null || echo 'N/A')"
    
    echo ""
    echo "📋 Next Steps:"
    echo "1. Update .env.production with your API credentials"
    echo "2. Configure nginx reverse proxy for mcp.lanonasis.com"
    echo "3. Set up SSL certificate with certbot"
    echo "4. Test MCP connection from Claude"
    
ENDSSH
    
    success "Git-based deployment completed successfully!"
}

# Configure automatic updates
setup_auto_deploy() {
    if [ "$1" = "--auto-deploy" ]; then
        log "Setting up automatic deployment webhook..."
        
        ssh -p $VPS_PORT $VPS_HOST << 'ENDSSH'
        
        # Create webhook handler script
        cat > /opt/mcp-servers/webhook-deploy.sh << 'EOF'
#!/bin/bash
set -e

DEPLOY_PATH="/opt/mcp-servers/lanonasis-standalone"
SERVICE_NAME="lanonasis-mcp-server"

echo "🔄 Auto-deployment triggered at $(date)"

cd $DEPLOY_PATH/current

# Pull latest changes
git fetch origin
git reset --hard origin/main
git clean -fd

# Install dependencies and build
npm ci --silent --production
npm run build

# Restart service
pm2 restart $SERVICE_NAME

echo "✅ Auto-deployment completed at $(date)"
EOF

        chmod +x /opt/mcp-servers/webhook-deploy.sh
        
        # Create simple webhook server
        cat > /opt/mcp-servers/webhook-server.js << 'EOF'
const http = require('http');
const { exec } = require('child_process');

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/deploy') {
    console.log('Deployment webhook triggered');
    
    exec('/opt/mcp-servers/webhook-deploy.sh', (error, stdout, stderr) => {
      if (error) {
        console.error('Deployment failed:', error);
        res.writeHead(500);
        res.end('Deployment failed');
      } else {
        console.log('Deployment successful');
        res.writeHead(200);
        res.end('Deployment successful');
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(3004, () => {
  console.log('Webhook server listening on port 3004');
});
EOF

        # Start webhook server with PM2
        pm2 start /opt/mcp-servers/webhook-server.js --name lanonasis-webhook
        pm2 save
        
        echo "🎯 Auto-deployment webhook configured on port 3004"
        echo "POST to http://mcp.lanonasis.com:3004/deploy to trigger updates"
        
ENDSSH
        
        success "Auto-deployment webhook configured"
    fi
}

# Configure Nginx for git deployment
configure_nginx() {
    if [ "$1" = "--configure-nginx" ] || [ "$2" = "--configure-nginx" ]; then
        log "Configuring Nginx reverse proxy..."
        
        ssh -p $VPS_PORT $VPS_HOST << 'ENDSSH'
        
        # Create nginx configuration for MCP server
        cat > /etc/nginx/sites-available/mcp.lanonasis.com << 'EOF'
server {
    listen 80;
    server_name mcp.lanonasis.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name mcp.lanonasis.com;
    
    # SSL configuration (to be configured with certbot)
    ssl_certificate /etc/letsencrypt/live/mcp.lanonasis.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mcp.lanonasis.com/privkey.pem;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header X-XSS-Protection "1; mode=block";
    
    # MCP HTTP endpoint
    location /mcp {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # MCP-specific timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # Server-Sent Events
    location /sse {
        proxy_pass http://127.0.0.1:3003;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # SSE-specific configuration
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        chunked_transfer_encoding off;
    }
    
    # Health check
    location /health {
        proxy_pass http://127.0.0.1:3001/health;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        
        # Add health check headers
        add_header X-Service "Lanonasis MCP Server" always;
        add_header X-Version "1.0.0" always;
    }
    
    # WebSocket endpoint
    location /ws {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # Webhook endpoint (optional, for auto-deployment)
    location /deploy {
        proxy_pass http://127.0.0.1:3004/deploy;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        allow 192.30.252.0/22;  # GitHub webhook IPs
        allow 185.199.108.0/22; # GitHub webhook IPs
        allow 140.82.112.0/20;  # GitHub webhook IPs
        allow 143.55.64.0/20;   # GitHub webhook IPs
        deny all;
    }
}
EOF

        # Enable the site
        ln -sf /etc/nginx/sites-available/mcp.lanonasis.com /etc/nginx/sites-enabled/
        
        # Test nginx configuration
        if nginx -t; then
            echo "✅ Nginx configuration is valid"
            systemctl reload nginx
            echo "🔄 Nginx reloaded"
        else
            echo "❌ Nginx configuration error"
            rm -f /etc/nginx/sites-enabled/mcp.lanonasis.com
        fi
        
        echo ""
        echo "📋 SSL Setup Required:"
        echo "Run: certbot --nginx -d mcp.lanonasis.com"
        
ENDSSH
        
        success "Nginx configuration completed"
    fi
}

# Main execution
main() {
    log "🚀 Starting git-based Lanonasis MCP Server deployment"
    log "Target: $VPS_HOST:$VPS_PORT"
    log "Repository: $GIT_REPO"
    log "Branch: $GIT_BRANCH"
    
    check_prerequisites
    push_to_git
    deploy_from_git
    setup_auto_deploy "$@"
    configure_nginx "$@"
    
    success "🎉 Git-based deployment completed successfully!"
    
    log ""
    log "📋 Summary:"
    log "• Service: $SERVICE_NAME"
    log "• Repository: $GIT_REPO"
    log "• Branch: $GIT_BRANCH"
    log "• Ports: 3001 (HTTP), 3002 (WS), 3003 (SSE), 3004 (webhook)"
    log "• Health: https://mcp.lanonasis.com/health"
    log "• Logs: pm2 logs $SERVICE_NAME"
    log "• Control: pm2 restart $SERVICE_NAME"
    log ""
    log "🔄 Future deployments:"
    log "1. Commit and push changes to git"
    log "2. Run this script again, or"
    log "3. Use webhook: POST to https://mcp.lanonasis.com/deploy"
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "Lanonasis MCP Server Git-based Deployment Script"
        echo ""
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  --auto-deploy        Set up automatic deployment webhook"
        echo "  --configure-nginx    Configure nginx reverse proxy"
        echo "  --help, -h          Show this help message"
        echo ""
        echo "Examples:"
        echo "  $0                              # Deploy from git"
        echo "  $0 --configure-nginx            # Deploy and configure nginx"
        echo "  $0 --auto-deploy               # Deploy with auto-deployment webhook"
        echo "  $0 --configure-nginx --auto-deploy  # Deploy with nginx and webhook"
        echo ""
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac