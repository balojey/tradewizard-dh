# Test Directory

All test files for the doa (Digital Ocean Agents) Python backend are centralized here, organized to mirror the source code structure.

## Directory Structure

```
tests/
├── agents/         # Agent implementation tests
├── database/       # Database layer tests
├── nodes/          # LangGraph workflow node tests
├── tools/          # External integration tests
├── utils/          # Utility function tests
└── test_*.py       # Root-level tests (config, imports, integration)
```

## Test Organization

Tests are organized to match the source structure:

- `agents/agent_factory.py` → `tests/agents/test_agent_factory.py`
- `database/persistence.py` → `tests/database/test_persistence.py`
- `nodes/dynamic_agent_selection.py` → `tests/nodes/test_dynamic_agent_selection.py`
- `tools/polymarket_client.py` → `tests/tools/test_polymarket_client.py`

This centralized approach keeps business logic files clean while maintaining clear test-to-source relationships.

## Test Types

### Unit Tests (`test_*.py`)
Standard unit tests for individual functions and modules.

### Property Tests (`test_*_property.py`)
Property-based tests using Hypothesis for comprehensive edge case coverage.

### Integration Tests (`test_*_integration.py`)
Tests that verify integration between multiple components or external services.

### Preservation Tests (`test_*_preservation.py`)
Tests that ensure specific behaviors or bug fixes remain intact across changes.

### Bug Tests (`test_*_bug.py`)
Tests that reproduce and verify fixes for specific bugs.

## Running Tests

```bash
# Run all tests
pytest

# Run tests excluding property-based tests
pytest -m "not property"

# Run only property-based tests
pytest -m property

# Run specific test file
pytest tests/nodes/test_dynamic_agent_selection.py

# Run tests matching pattern
pytest -k "agent"

# Run with coverage
pytest --cov=. --cov-report=html

# Run with verbose output
pytest -v

# Run with output capture disabled (see print statements)
pytest -s
```

## Test Configuration

Test configuration is managed in `pytest.ini` or `pyproject.toml` at the project root:

- Async test support with pytest-asyncio
- Hypothesis for property-based testing
- Coverage reporting with pytest-cov
- Test markers for categorization

## Writing New Tests

When adding new tests:

1. Place them in the appropriate subdirectory matching the source location
2. Use descriptive test names that explain what's being tested
3. Follow the naming convention: `test_[module_name].py`
4. Use pytest fixtures for common setup/teardown
5. Mock external API calls to ensure tests are deterministic
6. Add appropriate markers (`@pytest.mark.property`, `@pytest.mark.asyncio`, etc.)

## Test Markers

Common pytest markers used in this project:

- `@pytest.mark.property` - Property-based tests (may take longer)
- `@pytest.mark.asyncio` - Async tests
- `@pytest.mark.integration` - Integration tests requiring external services
- `@pytest.mark.slow` - Tests that take significant time to run

## Environment Variables

Tests may require environment variables for external services:

- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_KEY` - Supabase API key
- `NEWSDATA_API_KEY` - NewsData.io API key
- `SERPER_API_KEY` - Serper API key

Use `.env.testing` for test-specific configuration.
