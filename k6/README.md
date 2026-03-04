# K6 Load Tests

## Prerequisites

Install K6: https://k6.io/docs/get-started/installation/

## Running Tests

```bash
# Search performance test (target: <500ms p95)
k6 run k6/scripts/search-test.js

# Auth flow test (target: <200ms p95)
k6 run k6/scripts/auth-test.js

# Profile CRUD test (target: <200ms p95)
k6 run k6/scripts/profiles-test.js

# With custom API URL
k6 run -e API_URL=http://staging.example.com/api/v1 k6/scripts/search-test.js
```

## Thresholds

| Test | Metric | Target |
|------|--------|--------|
| Search (FTS) | p95 latency | < 500ms |
| Search (Semantic) | p95 latency | < 500ms |
| Auth | p95 latency | < 200ms |
| Profiles | p95 latency | < 200ms |
| Health | p95 latency | < 50ms |
