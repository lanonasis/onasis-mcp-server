#!/bin/bash

# fix-mcp-core-connection.sh
# Automated fix for PM2 mcp-core connection issue
# Ensures .env file exists and PM2 is configured correctly

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
REPO_DIR="/home/runner/work/onasis-mcp-server/onasis-mcp-server"
ENV_FILE="$REPO_DIR/.env"
ENV_EXAMPLE="$REPO_DIR/.env.example"
ENV_PRODUCTION="$REPO_DIR/.env.production"
PM2_CONFIG="$REPO_DIR/ecosystem.config.cjs"

# Functions
print_header() {
    echo ""
    echo "========================================="
    echo "  MCP Core Connection Fix Script"
    echo "========================================="
    echo ""
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}!${NC} $1"
}

print_info() {
    echo "  $1"
}

check_env_file() {
    echo "Checking .env file..."
    
    if [ -f "$ENV_FILE" ]; then
        print_success ".env file exists"
        
        # Check if it has required variables
        if grep -q "SUPABASE_URL" "$ENV_FILE" && grep -q "SUPABASE_SERVICE_KEY" "$ENV_FILE"; then
            print_success "Required variables found"
            return 0
        else
            print_warning "Required variables missing"
            return 1
        fi
    else
        print_error ".env file not found"
        return 1
    fi
}

create_env_file() {
    echo ""
    echo "Creating .env file..."
    
    # Try production backup first
    if [ -f "$ENV_PRODUCTION" ]; then
        print_info "Copying from .env.production..."
        cp "$ENV_PRODUCTION" "$ENV_FILE"
        print_success ".env file created from production backup"
        return 0
    fi
    
    # Try example file
    if [ -f "$ENV_EXAMPLE" ]; then
        print_info "Copying from .env.example..."
        cp "$ENV_EXAMPLE" "$ENV_FILE"
        print_warning ".env file created from example (you need to fill in values)"
        return 1
    fi
    
    # Create minimal .env
    print_info "Creating minimal .env file..."
    cat > "$ENV_FILE" <<EOF
# Supabase Configuration
SUPABASE_URL=https://db.mxtsdgkwzjzlttpotole.supabase.co
SUPABASE_SERVICE_KEY=your-service-key-here
SUPABASE_ANON_KEY=your-anon-key-here

# JWT Configuration
JWT_SECRET=your-jwt-secret-here

# API Key Encryption
API_KEY_ENCRYPTION_KEY=your-encryption-key-here

# Server Configuration
NODE_ENV=production
PORT=3001
LOG_LEVEL=info

# Please update the above values with your actual credentials
EOF
    print_warning ".env file created (you MUST fill in actual credentials)"
    return 1
}

check_pm2_config() {
    echo ""
    echo "Checking PM2 configuration..."
    
    if [ ! -f "$PM2_CONFIG" ]; then
        print_error "PM2 config not found at $PM2_CONFIG"
        return 1
    fi
    
    if grep -q "env_file" "$PM2_CONFIG"; then
        print_success "PM2 config already has env_file"
        return 0
    else
        print_warning "PM2 config missing env_file"
        return 1
    fi
}

update_pm2_config() {
    echo ""
    echo "Updating PM2 configuration..."
    
    # Backup original
    cp "$PM2_CONFIG" "$PM2_CONFIG.backup"
    print_info "Backed up to ecosystem.config.cjs.backup"
    
    # Check if env_file line exists
    if grep -q "env_file" "$PM2_CONFIG"; then
        print_success "env_file already configured"
    else
        # Try to add env_file after script line
        if grep -q "script:" "$PM2_CONFIG"; then
            # This is a basic approach - may need manual adjustment for complex configs
            print_warning "Please manually add 'env_file: \"./.env\"' to ecosystem.config.cjs"
            print_info "After the 'script:' line in each app configuration"
        fi
    fi
}

reload_pm2() {
    echo ""
    echo "Reloading PM2 services..."
    
    # Check if PM2 is installed
    if ! command -v pm2 &> /dev/null; then
        print_error "PM2 not found. Please install PM2 first: npm install -g pm2"
        return 1
    fi
    
    # Change to repo directory
    cd "$REPO_DIR"
    
    # Reload PM2 with updated environment
    print_info "Running: pm2 reload ecosystem.config.cjs --update-env"
    if pm2 reload ecosystem.config.cjs --update-env; then
        print_success "PM2 services reloaded"
        return 0
    else
        print_error "Failed to reload PM2"
        return 1
    fi
}

test_connection() {
    echo ""
    echo "Testing connection..."
    
    # Wait a moment for service to start
    sleep 2
    
    # Try to curl health endpoint
    if curl -s http://localhost:3001/health > /dev/null; then
        print_success "Health endpoint responding"
        return 0
    else
        print_warning "Health endpoint not responding (service may still be starting)"
        return 1
    fi
}

show_status() {
    echo ""
    echo "PM2 Status:"
    echo "==========================================="
    pm2 status
    echo ""
    echo "Recent Logs:"
    echo "==========================================="
    pm2 logs --lines 20 --nostream
}

main() {
    print_header
    
    # Step 1: Check/create .env file
    if ! check_env_file; then
        if ! create_env_file; then
            echo ""
            print_error "MANUAL ACTION REQUIRED:"
            print_info "Edit $ENV_FILE and fill in your actual credentials"
            print_info "Then run this script again"
            exit 1
        fi
    fi
    
    # Step 2: Check/update PM2 config
    if ! check_pm2_config; then
        update_pm2_config
    fi
    
    # Step 3: Reload PM2
    if reload_pm2; then
        # Step 4: Test connection
        test_connection
        
        # Step 5: Show status
        show_status
        
        echo ""
        print_success "Fix complete!"
        echo ""
        print_info "Next steps:"
        print_info "1. Check PM2 logs: pm2 logs mcp-core"
        print_info "2. Test health: curl http://localhost:3001/health"
        print_info "3. Monitor for 5 minutes to ensure stability"
        echo ""
    else
        print_error "Fix failed during PM2 reload"
        echo ""
        print_info "Try manual fix:"
        print_info "1. Edit .env file: nano $ENV_FILE"
        print_info "2. Add env_file to ecosystem.config.cjs"
        print_info "3. Reload PM2: pm2 reload ecosystem.config.cjs --update-env"
        echo ""
        exit 1
    fi
}

# Run main function
main
