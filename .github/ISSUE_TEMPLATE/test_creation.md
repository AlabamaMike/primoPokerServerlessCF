---
name: Test Creation Request
about: Request creation of tests for existing code
title: '[TEST] '
labels: 'testing, claude-code'
assignees: ''
---

## Testing Target

<!-- What code needs tests? -->

**Files/Components to test:**

- `src/...`

## Current Test Coverage

<!-- What's the current coverage? -->

- Current coverage: \_\_%
- Target coverage: \_\_%

## Test Types Needed

<!-- What kinds of tests should be written? -->

- [ ] Unit tests
- [ ] Integration tests
- [ ] End-to-end tests
- [ ] Performance tests
- [ ] Security tests
- [ ] Regression tests

## Test Scenarios

<!-- List specific scenarios that must be tested -->

### Happy Path

1.
2.

### Edge Cases

1.
2.

### Error Cases

1.
2.

## Test Data Requirements

<!-- What test data or mocks are needed? -->

- Mock data needed:
- External services to mock:
- Test fixtures required:

## Assertions to Verify

<!-- What specific assertions should the tests make? -->

- [ ] Correct return values
- [ ] Proper error handling
- [ ] State changes
- [ ] Side effects
- [ ] Performance metrics
- [ ] Security constraints

## Testing Framework

<!-- Confirm testing tools and patterns -->

- Framework: Vitest
- Assertion library: Vitest built-in
- Mocking approach:
- Custom matchers needed:

## Dependencies

<!-- Any setup or dependencies needed for tests -->

- [ ] Database setup
- [ ] API mocks
- [ ] Test utilities
- [ ] Environment variables

## Success Criteria

- [ ] All test scenarios covered
- [ ] Tests are independent and isolated
- [ ] Tests run quickly (< 1s for unit tests)
- [ ] Clear test descriptions
- [ ] No flaky tests
- [ ] Coverage target met

## Priority

- [ ] Critical - Untested critical path
- [ ] High - Core functionality
- [ ] Medium - Standard coverage
- [ ] Low - Nice to have
