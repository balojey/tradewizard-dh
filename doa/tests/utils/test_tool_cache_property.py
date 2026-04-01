"""Property-based tests for ToolCache class.

These tests validate universal correctness properties across all valid inputs.
"""

import pytest
from hypothesis import given, strategies as st, assume
from utils.tool_cache import ToolCache


# Strategy for generating valid tool names
tool_names = st.text(min_size=1, max_size=100)

# Strategy for generating valid parameters
# Support primitives, lists, and dictionaries
param_values = st.recursive(
    st.one_of(
        st.none(),
        st.booleans(),
        st.integers(),
        st.floats(allow_nan=False, allow_infinity=False),
        st.text()
    ),
    lambda children: st.one_of(
        st.lists(children, max_size=10),
        st.dictionaries(st.text(min_size=1, max_size=50), children, max_size=10)
    ),
    max_leaves=20
)


# Feature: autonomous-news-polling-agents, Property 9: Cache Key Determinism
@given(
    tool_name=tool_names,
    params=param_values
)
def test_cache_key_determinism(tool_name, params):
    """For any tool name and parameters, cache keys should be deterministic.
    
    Property 9: For any tool name and parameter combination, generating a cache 
    key multiple times SHALL produce identical keys, ensuring consistent cache behavior.
    """
    cache = ToolCache("test_session")
    
    # Generate key twice with same inputs
    key1 = cache._generate_cache_key(tool_name, params)
    key2 = cache._generate_cache_key(tool_name, params)
    
    # Keys must be identical
    assert key1 == key2
    assert isinstance(key1, str)
    assert len(key1) == 64  # SHA-256 produces 64 hex characters


# Feature: autonomous-news-polling-agents, Property 9: Cache Key Determinism (Parameter Order)
@given(
    tool_name=tool_names,
    params=st.dictionaries(
        st.text(min_size=1, max_size=50),
        st.one_of(st.text(), st.integers(), st.booleans()),
        min_size=2,
        max_size=10
    )
)
def test_cache_key_parameter_order_independence(tool_name, params):
    """Cache keys should be independent of parameter order.
    
    Property 9: Cache keys are generated from sorted parameters, so parameter
    order should not affect the resulting key.
    """
    cache = ToolCache("test_session")
    
    # Create a reversed version of the parameters
    reversed_params = dict(reversed(list(params.items())))
    
    key1 = cache._generate_cache_key(tool_name, params)
    key2 = cache._generate_cache_key(tool_name, reversed_params)
    
    # Keys must be identical regardless of parameter order
    assert key1 == key2


# Feature: autonomous-news-polling-agents, Property 10: Cache Statistics Accuracy
@given(
    session_id=st.text(min_size=1, max_size=100),
    operations=st.lists(
        st.tuples(
            st.sampled_from(['get', 'set']),
            tool_names,
            param_values
        ),
        min_size=1,
        max_size=50
    )
)
def test_cache_statistics_accuracy(session_id, operations):
    """Cache statistics should accurately reflect hits and misses.
    
    Property 10: For any sequence of cache operations (hits and misses), the cache 
    statistics SHALL accurately reflect the number of hits, misses, and the calculated hit rate.
    """
    cache = ToolCache(session_id)
    expected_hits = 0
    expected_misses = 0
    
    for op_type, tool_name, params in operations:
        if op_type == 'set':
            cache.set(tool_name, params, {"result": "data"})
        else:  # get
            result = cache.get(tool_name, params)
            if result is None:
                expected_misses += 1
            else:
                expected_hits += 1
    
    stats = cache.get_stats()
    
    assert stats["hits"] == expected_hits
    assert stats["misses"] == expected_misses
    
    total = expected_hits + expected_misses
    if total > 0:
        expected_hit_rate = expected_hits / total
        assert abs(stats["hit_rate"] - expected_hit_rate) < 0.0001


# Feature: autonomous-news-polling-agents, Property 11: Cache Clearing
@given(
    session_id=st.text(min_size=1, max_size=100),
    entries=st.lists(
        st.tuples(tool_names, param_values, st.text()),
        min_size=1,
        max_size=20
    )
)
def test_cache_clearing(session_id, entries):
    """Cache clearing should remove all entries and reset statistics.
    
    Property 11: For any cache with stored entries, calling clear() SHALL remove 
    all entries and reset statistics to zero.
    """
    cache = ToolCache(session_id)
    
    # Store entries
    for tool_name, params, result in entries:
        cache.set(tool_name, params, result)
    
    # Generate some hits and misses
    if entries:
        tool_name, params, _ = entries[0]
        cache.get(tool_name, params)  # Hit
        cache.get("nonexistent_tool", {"param": "value"})  # Miss
    
    # Verify cache has data
    assert len(cache._cache) > 0
    
    # Clear cache
    cache.clear()
    
    # Verify everything is cleared
    assert len(cache._cache) == 0
    assert cache._hits == 0
    assert cache._misses == 0
    
    stats = cache.get_stats()
    assert stats["hits"] == 0
    assert stats["misses"] == 0
    assert stats["hit_rate"] == 0.0
    assert stats["size"] == 0
    
    # Session ID should be preserved
    assert cache.session_id == session_id


# Feature: autonomous-news-polling-agents, Property 6: Cache Hit Correctness
@given(
    session_id=st.text(min_size=1, max_size=100),
    tool_name=tool_names,
    params=param_values,
    result=st.text()
)
def test_cache_hit_correctness(session_id, tool_name, params, result):
    """Cached results should be returned without making new calls.
    
    Property 6: For any tool invocation where a cached result exists for the same 
    tool name and parameters, the system SHALL return the cached result.
    """
    cache = ToolCache(session_id)
    
    # Store result in cache
    cache.set(tool_name, params, result)
    
    # Reset statistics to verify cache hit
    initial_hits = cache._hits
    
    # Retrieve from cache
    cached_result = cache.get(tool_name, params)
    
    # Verify correct result returned
    assert cached_result == result
    
    # Verify hit counter incremented
    assert cache._hits == initial_hits + 1


# Feature: autonomous-news-polling-agents, Property 7: Cache Miss and Storage
@given(
    session_id=st.text(min_size=1, max_size=100),
    tool_name=tool_names,
    params=param_values,
    result=st.text()
)
def test_cache_miss_and_storage(session_id, tool_name, params, result):
    """Cache misses should be tracked and results should be storable.
    
    Property 7: For any tool invocation where no cached result exists, the system 
    SHALL track the miss and allow storing the result with a deterministic key.
    """
    cache = ToolCache(session_id)
    
    # First access should be a miss
    initial_misses = cache._misses
    cached_result = cache.get(tool_name, params)
    
    assert cached_result is None
    assert cache._misses == initial_misses + 1
    
    # Store result
    cache.set(tool_name, params, result)
    
    # Second access should be a hit
    initial_hits = cache._hits
    cached_result = cache.get(tool_name, params)
    
    assert cached_result == result
    assert cache._hits == initial_hits + 1


# Feature: autonomous-news-polling-agents, Property 9: Cache Key Uniqueness
@given(
    tool_name1=tool_names,
    tool_name2=tool_names,
    params1=param_values,
    params2=param_values
)
def test_cache_key_uniqueness(tool_name1, tool_name2, params1, params2):
    """Different inputs should produce different cache keys (with high probability).
    
    Property 9: Cache keys should be unique for different tool names or parameters
    to prevent collisions.
    """
    # Skip if inputs are identical
    assume(tool_name1 != tool_name2 or params1 != params2)
    
    cache = ToolCache("test_session")
    
    key1 = cache._generate_cache_key(tool_name1, params1)
    key2 = cache._generate_cache_key(tool_name2, params2)
    
    # Different inputs should produce different keys
    # (SHA-256 collision probability is negligible)
    assert key1 != key2


# Feature: autonomous-news-polling-agents, Property 10: Hit Rate Calculation
@given(
    session_id=st.text(min_size=1, max_size=100),
    num_hits=st.integers(min_value=0, max_value=100),
    num_misses=st.integers(min_value=0, max_value=100)
)
def test_hit_rate_calculation(session_id, num_hits, num_misses):
    """Hit rate should be correctly calculated from hits and misses.
    
    Property 10: Hit rate should equal hits / (hits + misses), or 0.0 if no operations.
    """
    assume(num_hits > 0 or num_misses > 0)  # At least one operation
    
    cache = ToolCache(session_id)
    
    # Simulate hits
    cache.set("tool", {"param": "value"}, "result")
    for _ in range(num_hits):
        cache.get("tool", {"param": "value"})
    
    # Simulate misses
    for i in range(num_misses):
        cache.get("tool", {"param": f"value_{i}"})
    
    stats = cache.get_stats()
    
    total = num_hits + num_misses
    expected_hit_rate = num_hits / total if total > 0 else 0.0
    
    assert stats["hits"] == num_hits
    assert stats["misses"] == num_misses
    assert abs(stats["hit_rate"] - expected_hit_rate) < 0.0001


# Feature: autonomous-news-polling-agents, Property 7: Cache Storage Correctness
@given(
    session_id=st.text(min_size=1, max_size=100),
    entries=st.lists(
        st.tuples(tool_names, param_values, st.text()),
        min_size=1,
        max_size=20,
        unique_by=lambda x: (x[0], str(x[1]))  # Unique by tool_name and params
    )
)
def test_cache_storage_correctness(session_id, entries):
    """All stored entries should be retrievable with correct values.
    
    Property 7: For any stored result, it should be retrievable with the same
    tool name and parameters.
    """
    cache = ToolCache(session_id)
    
    # Store all entries
    for tool_name, params, result in entries:
        cache.set(tool_name, params, result)
    
    # Verify all entries are retrievable
    for tool_name, params, expected_result in entries:
        cached_result = cache.get(tool_name, params)
        assert cached_result == expected_result
    
    # Verify cache size
    stats = cache.get_stats()
    assert stats["size"] == len(entries)
