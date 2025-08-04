#!/bin/bash

echo "🔍 Starting Multiplayer Debug Feedback Loop"
echo "=========================================="

# Create test results directory
mkdir -p tests/e2e/test-results

# Run the debug test with production config
cd tests/e2e

echo "Running debug test against production..."
npx playwright test production-smoke/debug-multiplayer-feedback.spec.ts \
  --config=playwright.production.config.ts \
  --project=chromium-production \
  --headed \
  --timeout=120000 \
  --reporter=list

echo ""
echo "📊 Debug artifacts saved to: tests/e2e/test-results/"
echo "- Screenshots: debug-*.png"
echo "- Trace file: trace-multiplayer-debug.zip"
echo ""
echo "To view trace: cd tests/e2e && npx playwright show-trace test-results/trace-multiplayer-debug.zip"