#!/bin/bash

# Load environment variables from .env.test
if [ -f .env.test ]; then
  export $(grep -v '^#' .env.test | xargs)
else
  echo "Warning: .env.test file not found"
fi

# Run smoke tests with production configuration
echo "Running smoke tests against: $PRODUCTION_URL"
echo "Using test user: $TEST_USERNAME"

npm test -- --config=playwright.production.config.ts --project=chromium-production smoke-test.spec.ts --reporter=list