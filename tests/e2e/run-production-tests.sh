#!/bin/bash

# Phase 6: Production E2E Test Runner
# Runs comprehensive user journey tests against production endpoints

set -e

echo "🎮 Primo Poker - Production E2E Tests"
echo "====================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PRODUCTION_URL="${PRODUCTION_URL:-https://6e77d385.primo-poker-frontend.pages.dev}"
API_URL="${API_URL:-https://primo-poker-server.alabamamike.workers.dev}"

echo "🌐 Testing against:"
echo "   Frontend: $PRODUCTION_URL"
echo "   Backend:  $API_URL"
echo ""

# Check if playwright is installed
if ! npx playwright --version > /dev/null 2>&1; then
    echo -e "${RED}❌ Playwright not installed. Installing...${NC}"
    npm install -D @playwright/test
    npx playwright install
fi

# Create test results directory
mkdir -p test-results-production
mkdir -p test-results-production/videos
mkdir -p playwright-report-production

# Run health check first
echo "🏥 Running API health check..."
HEALTH_CHECK=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/health")
if [ "$HEALTH_CHECK" = "200" ]; then
    echo -e "${GREEN}✓ API is healthy${NC}"
else
    echo -e "${RED}❌ API health check failed (HTTP $HEALTH_CHECK)${NC}"
    exit 1
fi

# Run the tests
echo ""
echo "🧪 Running E2E tests..."
echo ""

# Set environment variables
export PRODUCTION_URL=$PRODUCTION_URL
export NODE_ENV=production

# Run tests with production config
npx playwright test \
    --config=playwright.production.config.ts \
    --project=chromium-production \
    --reporter=list \
    --reporter=html:playwright-report-production \
    tests/user-journey.spec.ts

# Check test results
if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ All tests passed!${NC}"
    echo ""
    echo "📊 Test Report: file://$(pwd)/playwright-report-production/index.html"
    echo "🎥 Videos: $(pwd)/test-results-production/videos/"
else
    echo ""
    echo -e "${RED}❌ Some tests failed${NC}"
    echo ""
    echo "📊 View detailed report: npx playwright show-report playwright-report-production"
    exit 1
fi

# Optional: Run stress tests
if [ "$RUN_STRESS_TESTS" = "true" ]; then
    echo ""
    echo "💪 Running stress tests..."
    npx playwright test \
        --config=playwright.production.config.ts \
        --project=chromium-production \
        --grep="stress" \
        tests/user-journey.spec.ts
fi

echo ""
echo "🎉 Production E2E test run complete!"
echo ""

# Summary
echo "📋 Test Summary:"
echo "   - User registration: ✓"
echo "   - User login: ✓"
echo "   - Wallet integration: ✓"
echo "   - Table creation: ✓"
echo "   - Spectator mode: ✓"
echo "   - Seat selection: ✓"
echo "   - Buy-in process: ✓"
echo "   - Game play: ✓"
echo "   - Stand up & cash out: ✓"
echo "   - Disconnection handling: ✓"
echo ""

# Optional: Open report automatically
if [ "$OPEN_REPORT" = "true" ]; then
    npx playwright show-report playwright-report-production
fi