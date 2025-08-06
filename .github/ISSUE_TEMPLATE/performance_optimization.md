---
name: Performance Optimization
about: Request performance analysis and optimization
title: '[PERF] '
labels: 'performance, optimization, claude-code'
assignees: ''
---

## Performance Issue

<!-- Describe the performance problem -->

## Current Metrics

<!-- Provide current performance measurements -->

- **Response time:**
- **Throughput:**
- **Memory usage:**
- **CPU usage:**
- **Error rate:**

## Target Metrics

<!-- What performance goals do we need to achieve? -->

- **Response time:**
- **Throughput:**
- **Memory usage:**
- **CPU usage:**
- **Error rate:**

## Affected Components

<!-- Which parts of the system are slow? -->

- `src/...`

## Performance Testing Done

<!-- What testing/profiling has been done? -->

- Tools used:
- Test scenarios:
- Bottlenecks identified:

## Suspected Causes

<!-- What might be causing the performance issues? -->

- [ ] Inefficient algorithms
- [ ] Database queries
- [ ] Network latency
- [ ] Memory leaks
- [ ] Unnecessary computations
- [ ] Missing caching
- [ ] Synchronous operations
- [ ] Large payloads

## Optimization Strategies to Consider

<!-- Potential optimization approaches -->

- [ ] Algorithm optimization
- [ ] Caching implementation
- [ ] Database query optimization
- [ ] Code parallelization
- [ ] Lazy loading
- [ ] Pagination
- [ ] Compression
- [ ] CDN usage
- [ ] Worker threads
- [ ] Memory pooling

## Constraints

<!-- Any limitations to consider -->

- [ ] Cannot change API contracts
- [ ] Must maintain backward compatibility
- [ ] Resource limits (CPU/Memory)
- [ ] Budget constraints
- [ ] Timeline constraints

## Testing Requirements

<!-- How will we verify improvements? -->

- Benchmark tests needed:
- Load testing scenarios:
- Performance regression tests:

## Success Criteria

- [ ] Meets target performance metrics
- [ ] No functionality regression
- [ ] Tests verify improvements
- [ ] Documentation updated
- [ ] Monitoring in place

## Priority

- [ ] Critical - System unusable
- [ ] High - User experience impacted
- [ ] Medium - Noticeable but acceptable
- [ ] Low - Minor improvement

## Risk Assessment

<!-- Risks of optimization -->

- Code complexity increase:
- Potential bugs:
- Maintenance burden:
