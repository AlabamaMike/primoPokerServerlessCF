---
name: Bug report
about: Report a bug for Claude to investigate and fix
title: '[BUG] '
labels: 'bug, claude-code'
assignees: ''
---

## Bug Description

<!-- Clear, concise description of the bug -->

## Steps to Reproduce

<!-- Exact steps to reproduce the issue -->

1.
2.
3.

## Expected Behavior

<!-- What should happen? -->

## Actual Behavior

<!-- What actually happens? -->

## Error Messages

<!-- Include any error messages, stack traces, or logs -->

```
Paste error messages here
```

## Root Cause Analysis Request

<!-- Ask Claude to investigate specific aspects -->

- [ ] Identify root cause
- [ ] Check for related issues
- [ ] Assess impact on other components
- [ ] Suggest fix approach

## Environment

<!-- System and version information -->

- **Node version:**
- **Wrangler version:**
- **OS:**
- **Browser (if applicable):**

## Code Context

<!-- Relevant code snippets or configurations -->

### Agent Configuration (if applicable):

```json
{
  "skillLevel": "",
  "personality": "",
  "enableLLM": false
}
```

### Game State (if applicable):

```json
{
  "hand": [],
  "communityCards": [],
  "pot": 0,
  "toCall": 0
}
```

## Affected Files

<!-- List files Claude should examine -->

- `src/...`
- `tests/...`

## Severity Assessment

- [ ] Critical - System down/data loss
- [ ] High - Major feature broken
- [ ] Medium - Feature partially working
- [ ] Low - Minor issue

## Suggested Fix Approach

<!-- Optional: Your thoughts on how to fix -->

## Additional Context

<!-- Any other relevant information -->

## Definition of Done

- [ ] Bug reproduced and understood
- [ ] Root cause identified
- [ ] Fix implemented
- [ ] Tests added to prevent regression
- [ ] Documentation updated if needed
- [ ] PR created with fix
