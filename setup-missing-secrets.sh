#!/bin/bash

# 🔐 Setup Missing GitHub Secrets Script
# This script helps fetch missing secrets and set them in GitHub

set -e

echo "🔐 Setting up missing GitHub secrets..."

# Check if required tools are available
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) not found. Please install it first:"
    echo "   brew install gh"
    echo "   gh auth login"
    exit 1
fi

if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Please install it first:"
    echo "   brew install supabase/tap/supabase"
    echo "   supabase login"
    exit 1
fi

# Configuration
REPO="lanonasis/onasis-mcp-server"
SUPABASE_PROJECT_ID=""  # You'll need to set this

echo "📋 Repository: $REPO"
echo ""

# Function to set secret
set_secret() {
    local secret_name=$1
    local secret_value=$2
    
    echo "🔐 Setting $secret_name..."
    echo "$secret_value" | gh secret set "$secret_name" --repo "$REPO"
    echo "✅ $secret_name set successfully"
    echo ""
}

# 1. SUPABASE_URL
echo "🌐 Fetching SUPABASE_URL..."
if [ -n "$SUPABASE_PROJECT_ID" ]; then
    SUPABASE_URL="https://$SUPABASE_PROJECT_ID.supabase.co"
    echo "   Using project ID: $SUPABASE_PROJECT_ID"
else
    echo "   Please enter your Supabase project ID:"
    read -p "   Project ID: " SUPABASE_PROJECT_ID
    SUPABASE_URL="https://$SUPABASE_PROJECT_ID.supabase.co"
fi
echo "   SUPABASE_URL: $SUPABASE_URL"
set_secret "SUPABASE_URL" "$SUPABASE_URL"

# 2. JWT_SECRET
echo "🔑 Generating JWT_SECRET..."
JWT_SECRET=$(openssl rand -base64 32)
echo "   Generated secure JWT secret"
set_secret "JWT_SECRET" "$JWT_SECRET"

# 3. EMERGENCY_BOOTSTRAP_TOKEN
echo "�� Generating EMERGENCY_BOOTSTRAP_TOKEN..."
EMERGENCY_TOKEN=$(openssl rand -base64 24)
echo "   Generated emergency bootstrap token"
set_secret "EMERGENCY_BOOTSTRAP_TOKEN" "$EMERGENCY_TOKEN"

echo "🎉 All missing secrets have been set!"
echo ""
echo "📋 Summary of secrets set:"
echo "   ✅ SUPABASE_URL: $SUPABASE_URL"
echo "   ✅ JWT_SECRET: [Generated securely]"
echo "   ✅ EMERGENCY_BOOTSTRAP_TOKEN: [Generated securely]"
echo ""
echo "🚀 Your workflows should now run successfully!"
