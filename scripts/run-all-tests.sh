#!/bin/bash

# Script to run all tests and generate comprehensive coverage report
set -e

echo "🧪 Running Comprehensive Test Suite for Phase 1"
echo "=============================================="

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to run tests and check results
run_test_suite() {
    local suite_name=$1
    local test_command=$2
    
    echo -e "\n${YELLOW}Running ${suite_name}...${NC}"
    
    if $test_command; then
        echo -e "${GREEN}✓ ${suite_name} passed${NC}"
        return 0
    else
        echo -e "${RED}✗ ${suite_name} failed${NC}"
        return 1
    fi
}

# Track overall success
OVERALL_SUCCESS=true

# 1. Run Unit Tests
echo -e "\n${YELLOW}1. UNIT TESTS${NC}"
echo "=================="

# Create a temporary jest config without html reporter
cat > jest.config.temp.js << 'EOF'
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: [
    '**/tests/unit/**/*.test.ts',
    '**/tests/unit/**/*.test.js'
  ],
  moduleNameMapper: {
    '^@primo-poker/shared$': '<rootDir>/packages/shared/src',
    '^@primo-poker/core$': '<rootDir>/packages/core/src',
    '^@primo-poker/security$': '<rootDir>/packages/security/src',
    '^@primo-poker/persistence$': '<rootDir>/packages/persistence/src',
    '^@primo-poker/api$': '<rootDir>/packages/api/src'
  },
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.ts'],
  collectCoverage: true,
  collectCoverageFrom: [
    'packages/*/src/**/*.{ts,tsx}',
    '!packages/*/src/**/*.d.ts',
    '!packages/*/src/**/*.test.{ts,tsx}',
    '!packages/*/src/**/index.ts'
  ],
  coverageDirectory: 'coverage/unit',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85
    }
  },
  testTimeout: 30000,
  clearMocks: true,
  verbose: true
};
EOF

run_test_suite "Core Unit Tests" "npx jest --config jest.config.temp.js tests/unit/poker-game*.test.ts tests/unit/hand-evaluator*.test.ts tests/unit/betting-engine*.test.ts" || OVERALL_SUCCESS=false

# 2. Run Integration Tests
echo -e "\n${YELLOW}2. INTEGRATION TESTS${NC}"
echo "======================"

# Create integration test config
cat > jest.config.integration.js << 'EOF'
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: [
    '**/tests/integration/**/*.test.ts'
  ],
  moduleNameMapper: {
    '^@primo-poker/shared$': '<rootDir>/packages/shared/src',
    '^@primo-poker/core$': '<rootDir>/packages/core/src',
    '^@primo-poker/security$': '<rootDir>/packages/security/src',
    '^@primo-poker/persistence$': '<rootDir>/packages/persistence/src',
    '^@primo-poker/api$': '<rootDir>/packages/api/src'
  },
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.ts'],
  collectCoverage: true,
  coverageDirectory: 'coverage/integration',
  testTimeout: 60000
};
EOF

run_test_suite "WebSocket Integration Tests" "npx jest --config jest.config.integration.js tests/integration/websocket*.test.ts" || OVERALL_SUCCESS=false
run_test_suite "Security Tests" "npx jest --config jest.config.integration.js tests/integration/security*.test.ts" || OVERALL_SUCCESS=false

# 3. Run E2E Tests (if Playwright is set up)
echo -e "\n${YELLOW}3. END-TO-END TESTS${NC}"
echo "===================="

if [ -f "tests/e2e/playwright.config.ts" ]; then
    run_test_suite "Multiplayer E2E Tests" "cd tests/e2e && npx playwright test multiplayer/" || OVERALL_SUCCESS=false
else
    echo -e "${YELLOW}⚠ E2E tests skipped (Playwright not configured)${NC}"
fi

# 4. Run Performance Tests
echo -e "\n${YELLOW}4. PERFORMANCE TESTS${NC}"
echo "====================="

# Create performance test config
cat > jest.config.performance.js << 'EOF'
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: [
    '**/tests/performance/**/*.test.ts'
  ],
  moduleNameMapper: {
    '^@primo-poker/shared$': '<rootDir>/packages/shared/src',
    '^@primo-poker/core$': '<rootDir>/packages/core/src',
    '^@primo-poker/security$': '<rootDir>/packages/security/src',
    '^@primo-poker/persistence$': '<rootDir>/packages/persistence/src',
    '^@primo-poker/api$': '<rootDir>/packages/api/src'
  },
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.ts'],
  testTimeout: 120000
};
EOF

run_test_suite "Performance Tests" "npx jest --config jest.config.performance.js tests/performance/" || OVERALL_SUCCESS=false

# 5. Generate Combined Coverage Report
echo -e "\n${YELLOW}5. COVERAGE REPORT${NC}"
echo "==================="

# Merge coverage reports if nyc is available
if command -v nyc &> /dev/null; then
    echo "Merging coverage reports..."
    mkdir -p coverage/combined
    
    # Copy all coverage files
    find coverage -name "coverage-*.json" -o -name "lcov.info" | xargs -I {} cp {} coverage/combined/
    
    # Generate combined report
    nyc report --reporter=text --reporter=html --reporter=lcov --report-dir=coverage/combined
    
    echo -e "\n${GREEN}Combined coverage report generated in coverage/combined/${NC}"
else
    echo -e "${YELLOW}⚠ NYC not installed, skipping combined coverage${NC}"
fi

# 6. Display Coverage Summary
echo -e "\n${YELLOW}6. COVERAGE SUMMARY${NC}"
echo "===================="

# Check if coverage meets targets
if [ -f "coverage/unit/coverage-summary.json" ]; then
    echo -e "\n${GREEN}Unit Test Coverage:${NC}"
    cat coverage/unit/coverage-summary.json | jq '.total'
fi

if [ -f "coverage/integration/coverage-summary.json" ]; then
    echo -e "\n${GREEN}Integration Test Coverage:${NC}"
    cat coverage/integration/coverage-summary.json | jq '.total'
fi

# 7. Test Results Summary
echo -e "\n${YELLOW}7. TEST RESULTS SUMMARY${NC}"
echo "========================"

# Count test files
UNIT_TESTS=$(find tests/unit -name "*.test.ts" | wc -l)
INTEGRATION_TESTS=$(find tests/integration -name "*.test.ts" | wc -l)
E2E_TESTS=$(find tests/e2e -name "*.spec.ts" 2>/dev/null | wc -l || echo "0")
PERF_TESTS=$(find tests/performance -name "*.test.ts" | wc -l)

echo -e "Unit Test Files: ${UNIT_TESTS}"
echo -e "Integration Test Files: ${INTEGRATION_TESTS}"
echo -e "E2E Test Files: ${E2E_TESTS}"
echo -e "Performance Test Files: ${PERF_TESTS}"
echo -e "Total Test Files: $((UNIT_TESTS + INTEGRATION_TESTS + E2E_TESTS + PERF_TESTS))"

# Clean up temporary files
rm -f jest.config.temp.js jest.config.integration.js jest.config.performance.js

# Final status
echo -e "\n=============================================="
if [ "$OVERALL_SUCCESS" = true ]; then
    echo -e "${GREEN}✓ ALL TESTS PASSED!${NC}"
    echo -e "Phase 1 testing is complete and ready for production."
    exit 0
else
    echo -e "${RED}✗ SOME TESTS FAILED${NC}"
    echo -e "Please review the failures above and fix them before deployment."
    exit 1
fi