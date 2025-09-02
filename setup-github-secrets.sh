#!/bin/bash

# 🔐 Setup Missing GitHub Secrets from .env.netlify
# This script extracts secrets from your .env.netlify file and sets them in GitHub

set -e

echo "🔐 Setting up missing GitHub secrets from .env.netlify..."

# Check if required tools are available
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) not found. Please install it first:"
    echo "   brew install gh"
    echo "   gh auth login"
    exit 1
fi

# Configuration
REPO="lanonasis/onasis-mcp-server"
ENV_FILE="/Users/seyederick/DevOps/_project_folders/lan-onasis-monorepo/apps/mcp-lanonasis/.env.netlify"

echo "📋 Repository: $REPO"
echo "📁 Environment file: $ENV_FILE"
echo ""

# Check if env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Environment file not found: $ENV_FILE"
    exit 1
fi

# Function to set secret
set_secret() {
    local secret_name=$1
    local secret_value=$2
    
    echo "🔐 Setting $secret_name..."
    echo "$secret_value" | gh secret set "$secret_name" --repo "$REPO"
    echo "✅ $secret_name set successfully"
    echo ""
}

# Function to extract value from env file
extract_env_value() {
    local key=$1
    local value=$(grep "^$key=" "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
    echo "$value"
}

# 1. SUPABASE_URL
echo "🌐 Setting SUPABASE_URL..."
SUPABASE_URL=$(extract_env_value "SUPABASE_URL")
if [ -n "$SUPABASE_URL" ]; then
    set_secret "SUPABASE_URL" "$SUPABASE_URL"
else
    echo "❌ SUPABASE_URL not found in env file"
    exit 1
fi

# 2. JWT_SECRET
echo "🔑 Setting JWT_SECRET..."
JWT_SECRET=$(extract_env_value "JWT_SECRET")
if [ -n "$JWT_SECRET" ]; then
    set_secret "JWT_SECRET" "$JWT_SECRET"
else
    echo "❌ JWT_SECRET not found in env file"
    exit 1
fi

# 3. EMERGENCY_BOOTSTRAP_TOKEN (generate a secure one)
echo "🚨 Generating EMERGENCY_BOOTSTRAP_TOKEN..."
EMERGENCY_TOKEN=$(openssl rand -base64 24)
set_secret "EMERGENCY_BOOTSTRAP_TOKEN" "$EMERGENCY_TOKEN"

echo "🎉 All missing secrets have been set!"
echo ""
echo "📋 Summary of secrets set:"
echo "   ✅ SUPABASE_URL: $SUPABASE_URL"
echo "   ✅ JWT_SECRET: [Set from .env.netlify]"
echo "   ✅ EMERGENCY_BOOTSTRAP_TOKEN: [Generated securely]"
echo ""
echo "🚀 Your workflows should now run successfully!"
echo ""
echo "💡 Note: The EMERGENCY_BOOTSTRAP_TOKEN was generated fresh for security."
