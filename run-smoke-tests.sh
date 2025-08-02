#!/bin/bash

# Load environment variables
if [ -f .env.test ]; then
  export $(cat .env.test | grep -v '^#' | xargs)
fi

echo "Running Primo Poker Production Smoke Tests"
echo "========================================="
echo "Production URL: ${PRODUCTION_URL:-https://primo-poker.com}"
echo "Test User: ${TEST_USERNAME:-not set}"
echo ""

# Run the smoke tests
npx playwright test --config=tests/e2e/playwright.production.config.ts --project=chromium-production

# Show the report if tests complete
if [ $? -eq 0 ]; then
  echo ""
  echo "Tests completed. Opening report..."
  npx playwright show-report playwright-report-production
else
  echo ""
  echo "Tests failed. Check the report for details:"
  echo "npx playwright show-report playwright-report-production"
fi