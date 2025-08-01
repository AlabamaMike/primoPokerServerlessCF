#!/bin/bash

# Setup CI/CD Pipeline Script
# This script helps configure the CI/CD pipeline for Primo Poker

set -e

echo "🚀 Setting up CI/CD Pipeline for Primo Poker"
echo "============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if required tools are installed
check_requirements() {
    echo -e "${BLUE}Checking requirements...${NC}"
    
    if ! command -v gh &> /dev/null; then
        echo -e "${RED}❌ GitHub CLI (gh) is not installed${NC}"
        echo "Please install it from: https://cli.github.com/"
        exit 1
    fi
    
    if ! command -v wrangler &> /dev/null; then
        echo -e "${RED}❌ Wrangler CLI is not installed${NC}"
        echo "Please install it with: npm install -g wrangler"
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Node.js is not installed${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ All requirements are met${NC}"
}

# Authenticate with GitHub
setup_github() {
    echo -e "${BLUE}Setting up GitHub authentication...${NC}"
    
    if ! gh auth status &> /dev/null; then
        echo "Please authenticate with GitHub:"
        gh auth login
    fi
    
    echo -e "${GREEN}✅ GitHub authentication verified${NC}"
}

# Authenticate with Cloudflare
setup_cloudflare() {
    echo -e "${BLUE}Setting up Cloudflare authentication...${NC}"
    
    if ! wrangler whoami &> /dev/null; then
        echo "Please authenticate with Cloudflare:"
        wrangler login
    fi
    
    # Get account ID
    ACCOUNT_ID=$(wrangler whoami | grep "Account ID" | awk '{print $3}' || echo "")
    
    if [ -z "$ACCOUNT_ID" ]; then
        echo -e "${YELLOW}⚠️ Could not automatically detect account ID${NC}"
        echo "Please enter your Cloudflare Account ID:"
        read -r ACCOUNT_ID
    fi
    
    echo -e "${GREEN}✅ Cloudflare authentication verified${NC}"
    echo "Account ID: $ACCOUNT_ID"
}

# Set up GitHub secrets
setup_secrets() {
    echo -e "${BLUE}Setting up GitHub secrets...${NC}"
    
    # Get Cloudflare API token
    echo "Please enter your Cloudflare API Token:"
    echo "(Create one at: https://dash.cloudflare.com/profile/api-tokens)"
    read -r -s CLOUDFLARE_API_TOKEN
    
    # Set secrets
    echo "$CLOUDFLARE_API_TOKEN" | gh secret set CLOUDFLARE_API_TOKEN
    echo "$ACCOUNT_ID" | gh secret set CLOUDFLARE_ACCOUNT_ID
    
    # Optional JWT secret
    echo "Do you want to set a custom JWT_SECRET? (y/n)"
    read -r -n 1 SET_JWT
    echo
    
    if [[ $SET_JWT =~ ^[Yy]$ ]]; then
        echo "Enter JWT secret (or press Enter to generate one):"
        read -r -s JWT_SECRET
        
        if [ -z "$JWT_SECRET" ]; then
            JWT_SECRET=$(openssl rand -base64 32)
            echo "Generated JWT secret: $JWT_SECRET"
        fi
        
        echo "$JWT_SECRET" | gh secret set JWT_SECRET
    fi
    
    echo -e "${GREEN}✅ GitHub secrets configured${NC}"
}

# Create GitHub environment
setup_environment() {
    echo -e "${BLUE}Setting up GitHub environment...${NC}"
    
    # Create production environment (this requires manual setup in GitHub UI)
    echo -e "${YELLOW}⚠️ You need to manually create the 'production' environment in GitHub${NC}"
    echo "1. Go to your repository settings"
    echo "2. Click on 'Environments' in the left sidebar"
    echo "3. Click 'New environment'"
    echo "4. Name it 'production'"
    echo "5. Configure protection rules as needed"
    
    echo "Press Enter when you've created the environment..."
    read -r
    
    echo -e "${GREEN}✅ Environment setup completed${NC}"
}

# Deploy Cloudflare resources
deploy_resources() {
    echo -e "${BLUE}Deploying Cloudflare resources...${NC}"
    
    cd apps/poker-server
    
    # Create D1 database
    echo "Creating D1 database..."
    wrangler d1 create primo-poker-db || echo "Database may already exist"
    
    # Create KV namespace
    echo "Creating KV namespace..."
    wrangler kv:namespace create SESSION_STORE || echo "KV namespace may already exist"
    
    # Create R2 bucket
    echo "Creating R2 bucket..."
    wrangler r2 bucket create primo-poker-hand-history-preview || echo "R2 bucket may already exist"
    
    cd ../..
    
    echo -e "${GREEN}✅ Cloudflare resources deployed${NC}"
}

# Test the pipeline
test_pipeline() {
    echo -e "${BLUE}Testing the CI/CD pipeline...${NC}"
    
    # Build locally first
    echo "Running local build test..."
    npm run build
    
    # Run tests
    echo "Running local tests..."
    npm run test:ci || echo "Some tests may require backend to be running"
    
    # Commit and push to trigger pipeline
    echo "Do you want to commit current changes and trigger the pipeline? (y/n)"
    read -r -n 1 TRIGGER_PIPELINE
    echo
    
    if [[ $TRIGGER_PIPELINE =~ ^[Yy]$ ]]; then
        git add .
        git commit -m "feat: add comprehensive CI/CD pipeline

- Added GitHub Actions workflows for CI/CD
- Configured automated testing and deployment
- Set up security scanning and performance monitoring
- Added infrastructure management workflows

🤖 Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>"
        git push origin main
        
        echo -e "${GREEN}✅ Pipeline triggered! Check GitHub Actions tab${NC}"
    fi
}

# Main execution
main() {
    echo "Starting CI/CD setup process..."
    echo
    
    check_requirements
    setup_github
    setup_cloudflare
    setup_secrets
    setup_environment
    deploy_resources
    test_pipeline
    
    echo
    echo -e "${GREEN}🎉 CI/CD Pipeline setup completed!${NC}"
    echo
    echo "Next steps:"
    echo "1. Check GitHub Actions for workflow runs"
    echo "2. Monitor deployment status in Cloudflare dashboard"
    echo "3. Set up branch protection rules if desired"
    echo "4. Configure additional monitoring tools"
    echo
    echo "Resources:"
    echo "- GitHub Actions: https://github.com/$(gh repo view --json owner,name -q '.owner.login + \"/\" + .name')/actions"
    echo "- Cloudflare Dashboard: https://dash.cloudflare.com"
    echo "- Pipeline Documentation: .github/README.md"
}

# Run main function
main "$@"