# Test Directory

All test files for the tradewizard-agents backend are centralized here, organized to mirror the source code structure.

## Directory Structure

```
__tests__/
├── config/         # Configuration tests
├── database/       # Database layer tests
├── models/         # Data model and schema tests
├── nodes/          # LangGraph workflow node tests
├── tools/          # LangChain tool tests
├── utils/          # Utility function tests
└── *.test.ts       # Root-level tests (workflow, CLI, monitor)
```

## Test Types

### Unit Tests (`*.test.ts`)
Standard unit tests for individual functions and modules.

### Property Tests (`*.property.test.ts`)
Property-based tests using fast-check for comprehensive edge case coverage.

### Integration Tests (`*.integration.test.ts`)
Tests that verify integration between multiple components or external services.

### E2E Tests (`*.e2e.test.ts`)
End-to-end tests that verify complete workflows.

### Performance Tests (`*.performance.test.ts`)
Tests focused on performance benchmarks and optimization validation.

### Smoke Tests (`*.smoke.test.ts`)
Quick sanity checks for critical functionality.

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test __tests__/nodes/market-ingestion.test.ts

# Run tests matching pattern
npm test market

# Run with coverage
npm test -- --coverage
```

## Test Organization

Tests are organized to match the source structure:

- `src/nodes/market-ingestion.ts` → `__tests__/nodes/market-ingestion.test.ts`
- `src/utils/polymarket-client.ts` → `__tests__/utils/polymarket-client.test.ts`
- `src/models/state.ts` → `__tests__/models/state.test.ts`

This centralized approach keeps business logic files clean while maintaining clear test-to-source relationships.

## Writing New Tests

When adding new tests:

1. Place them in the appropriate subdirectory matching the source location
2. Use descriptive test names that explain what's being tested
3. Follow the naming convention: `[source-file].[test-type].test.ts`
4. Include proper setup/teardown for external dependencies
5. Mock external API calls to ensure tests are deterministic

## Test Configuration

Test configuration is managed in `vitest.config.ts` at the project root:

- 30-second timeout for LLM API calls
- Node environment
- Coverage reporting with v8 provider
- Automatic test discovery in `__tests__` directories
