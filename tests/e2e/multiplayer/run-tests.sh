#!/bin/bash

# Multiplayer Poker Engine Test Runner

echo "🃏 Primo Poker Multiplayer Test Suite"
echo "===================================="
echo ""

# Check if npm packages are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Parse command line arguments
TEST_TYPE=${1:-"all"}
LOG_LEVEL=${2:-"normal"}

# Set environment variables
export TEST_LOG_LEVEL=$LOG_LEVEL
export TEST_ENV="production"

case $TEST_TYPE in
    "all")
        echo "🎯 Running all multiplayer tests..."
        npm test
        ;;
    "full-table")
        echo "🎯 Running full table tests..."
        npm run test:full-table
        ;;
    "button")
        echo "🎯 Running button rotation tests..."
        npm run test:button
        ;;
    "detailed")
        echo "🎯 Running tests with detailed logging..."
        export SAVE_HAND_HISTORIES=true
        export TEST_LOG_LEVEL="detailed"
        npm test
        ;;
    "debug")
        echo "🎯 Running tests in debug mode..."
        export TEST_LOG_LEVEL="debug"
        export LOG_WS_MESSAGES=true
        npm run test:debug
        ;;
    *)
        echo "Usage: ./run-tests.sh [test-type] [log-level]"
        echo ""
        echo "Test types:"
        echo "  all        - Run all tests (default)"
        echo "  full-table - Run full table scenarios"
        echo "  button     - Run button rotation tests"
        echo "  detailed   - Run with detailed logging and hand histories"
        echo "  debug      - Run in debug mode with all logging"
        echo ""
        echo "Log levels: minimal, normal, detailed, debug"
        exit 1
        ;;
esac

# Show test report if available
if [ -f "playwright-report/index.html" ]; then
    echo ""
    echo "📊 Test report available. Run 'npm run test:report' to view."
fi