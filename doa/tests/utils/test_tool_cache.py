"""Unit tests for ToolCache class."""

import pytest
from utils.tool_cache import ToolCache


class TestToolCacheInit:
    """Tests for ToolCache initialization."""
    
    def test_init_with_session_id(self):
        """Test cache initialization with session ID."""
        cache = ToolCache("test_session_123")
        assert cache.session_id == "test_session_123"
        assert cache._cache == {}
        assert cache._hits == 0
        assert cache._misses == 0


class TestToolCacheGenerateCacheKey:
    """Tests for cache key generation."""
    
    def test_generate_cache_key_deterministic(self):
        """Test that cache keys are deterministic for same inputs."""
        cache = ToolCache("test_session")
        tool_name = "fetch_news"
        params = {"query": "election", "size": 10}
        
        key1 = cache._generate_cache_key(tool_name, params)
        key2 = cache._generate_cache_key(tool_name, params)
        
        assert key1 == key2
    
    def test_generate_cache_key_parameter_order_independence(self):
        """Test that parameter order doesn't affect cache key."""
        cache = ToolCache("test_session")
        tool_name = "fetch_news"
        
        params1 = {"query": "election", "size": 10, "language": "en"}
        params2 = {"size": 10, "language": "en", "query": "election"}
        
        key1 = cache._generate_cache_key(tool_name, params1)
        key2 = cache._generate_cache_key(tool_name, params2)
        
        assert key1 == key2
    
    def test_generate_cache_key_different_tool_names(self):
        """Test that different tool names produce different keys."""
        cache = ToolCache("test_session")
        params = {"query": "election"}
        
        key1 = cache._generate_cache_key("fetch_news", params)
        key2 = cache._generate_cache_key("fetch_archive", params)
        
        assert key1 != key2
    
    def test_generate_cache_key_different_params(self):
        """Test that different parameters produce different keys."""
        cache = ToolCache("test_session")
        tool_name = "fetch_news"
        
        key1 = cache._generate_cache_key(tool_name, {"query": "election"})
        key2 = cache._generate_cache_key(tool_name, {"query": "politics"})
        
        assert key1 != key2
    
    def test_generate_cache_key_with_nested_params(self):
        """Test cache key generation with nested parameters."""
        cache = ToolCache("test_session")
        tool_name = "fetch_news"
        params = {
            "query": "election",
            "filters": {"country": ["us", "uk"], "category": "politics"}
        }
        
        key1 = cache._generate_cache_key(tool_name, params)
        key2 = cache._generate_cache_key(tool_name, params)
        
        assert key1 == key2
    
    def test_generate_cache_key_with_list_params(self):
        """Test cache key generation with list parameters."""
        cache = ToolCache("test_session")
        tool_name = "fetch_news"
        params = {"countries": ["us", "uk", "ca"]}
        
        key = cache._generate_cache_key(tool_name, params)
        assert isinstance(key, str)
        assert len(key) == 64  # SHA-256 produces 64 hex characters


class TestToolCacheGet:
    """Tests for cache retrieval."""
    
    def test_get_cache_miss(self):
        """Test cache miss returns None and increments miss counter."""
        cache = ToolCache("test_session")
        result = cache.get("fetch_news", {"query": "election"})
        
        assert result is None
        assert cache._misses == 1
        assert cache._hits == 0
    
    def test_get_cache_hit(self):
        """Test cache hit returns cached value and increments hit counter."""
        cache = ToolCache("test_session")
        tool_name = "fetch_news"
        params = {"query": "election"}
        expected_result = {"articles": [{"title": "Election News"}]}
        
        # Store in cache
        cache.set(tool_name, params, expected_result)
        
        # Retrieve from cache
        result = cache.get(tool_name, params)
        
        assert result == expected_result
        assert cache._hits == 1
        assert cache._misses == 0
    
    def test_get_multiple_misses(self):
        """Test multiple cache misses increment counter correctly."""
        cache = ToolCache("test_session")
        
        cache.get("fetch_news", {"query": "election"})
        cache.get("fetch_news", {"query": "politics"})
        cache.get("fetch_archive", {"query": "economy"})
        
        assert cache._misses == 3
        assert cache._hits == 0
    
    def test_get_multiple_hits(self):
        """Test multiple cache hits increment counter correctly."""
        cache = ToolCache("test_session")
        tool_name = "fetch_news"
        params = {"query": "election"}
        result = {"articles": []}
        
        cache.set(tool_name, params, result)
        
        cache.get(tool_name, params)
        cache.get(tool_name, params)
        cache.get(tool_name, params)
        
        assert cache._hits == 3
        assert cache._misses == 0


class TestToolCacheSet:
    """Tests for cache storage."""
    
    def test_set_stores_result(self):
        """Test that set stores result in cache."""
        cache = ToolCache("test_session")
        tool_name = "fetch_news"
        params = {"query": "election"}
        result = {"articles": [{"title": "News"}]}
        
        cache.set(tool_name, params, result)
        
        # Verify it's stored
        cached_result = cache.get(tool_name, params)
        assert cached_result == result
    
    def test_set_overwrites_existing(self):
        """Test that set overwrites existing cached value."""
        cache = ToolCache("test_session")
        tool_name = "fetch_news"
        params = {"query": "election"}
        
        cache.set(tool_name, params, {"old": "data"})
        cache.set(tool_name, params, {"new": "data"})
        
        result = cache.get(tool_name, params)
        assert result == {"new": "data"}
    
    def test_set_with_different_params(self):
        """Test that different parameters create separate cache entries."""
        cache = ToolCache("test_session")
        tool_name = "fetch_news"
        
        cache.set(tool_name, {"query": "election"}, {"result": "A"})
        cache.set(tool_name, {"query": "politics"}, {"result": "B"})
        
        result_a = cache.get(tool_name, {"query": "election"})
        result_b = cache.get(tool_name, {"query": "politics"})
        
        assert result_a == {"result": "A"}
        assert result_b == {"result": "B"}
    
    def test_set_with_complex_result(self):
        """Test storing complex nested result structures."""
        cache = ToolCache("test_session")
        tool_name = "fetch_news"
        params = {"query": "election"}
        result = {
            "articles": [
                {"title": "News 1", "content": "Content 1"},
                {"title": "News 2", "content": "Content 2"}
            ],
            "metadata": {"count": 2, "source": "newsdata"}
        }
        
        cache.set(tool_name, params, result)
        cached_result = cache.get(tool_name, params)
        
        assert cached_result == result


class TestToolCacheClear:
    """Tests for cache clearing."""
    
    def test_clear_removes_all_entries(self):
        """Test that clear removes all cached entries."""
        cache = ToolCache("test_session")
        
        cache.set("fetch_news", {"query": "election"}, {"result": "A"})
        cache.set("fetch_news", {"query": "politics"}, {"result": "B"})
        cache.set("fetch_archive", {"query": "economy"}, {"result": "C"})
        
        cache.clear()
        
        assert len(cache._cache) == 0
        assert cache.get("fetch_news", {"query": "election"}) is None
    
    def test_clear_resets_statistics(self):
        """Test that clear resets hit and miss counters."""
        cache = ToolCache("test_session")
        
        # Generate some hits and misses
        cache.set("fetch_news", {"query": "election"}, {"result": "A"})
        cache.get("fetch_news", {"query": "election"})  # Hit
        cache.get("fetch_news", {"query": "politics"})  # Miss
        
        assert cache._hits > 0
        assert cache._misses > 0
        
        cache.clear()
        
        assert cache._hits == 0
        assert cache._misses == 0
    
    def test_clear_preserves_session_id(self):
        """Test that clear preserves session ID."""
        cache = ToolCache("test_session_123")
        cache.set("fetch_news", {"query": "election"}, {"result": "A"})
        
        cache.clear()
        
        assert cache.session_id == "test_session_123"


class TestToolCacheGetStats:
    """Tests for cache statistics."""
    
    def test_get_stats_empty_cache(self):
        """Test statistics for empty cache."""
        cache = ToolCache("test_session")
        stats = cache.get_stats()
        
        assert stats["hits"] == 0
        assert stats["misses"] == 0
        assert stats["hit_rate"] == 0.0
        assert stats["size"] == 0
    
    def test_get_stats_with_hits_and_misses(self):
        """Test statistics with hits and misses."""
        cache = ToolCache("test_session")
        
        # Create 2 hits and 3 misses
        cache.set("fetch_news", {"query": "election"}, {"result": "A"})
        cache.get("fetch_news", {"query": "election"})  # Hit
        cache.get("fetch_news", {"query": "election"})  # Hit
        cache.get("fetch_news", {"query": "politics"})  # Miss
        cache.get("fetch_news", {"query": "economy"})   # Miss
        cache.get("fetch_archive", {"query": "test"})   # Miss
        
        stats = cache.get_stats()
        
        assert stats["hits"] == 2
        assert stats["misses"] == 3
        assert stats["hit_rate"] == 0.4  # 2/5
        assert stats["size"] == 1
    
    def test_get_stats_hit_rate_calculation(self):
        """Test hit rate calculation accuracy."""
        cache = ToolCache("test_session")
        
        # Create 3 cache entries
        cache.set("tool1", {"p": 1}, "result1")
        cache.set("tool2", {"p": 2}, "result2")
        cache.set("tool3", {"p": 3}, "result3")
        
        # Generate 6 hits and 4 misses
        cache.get("tool1", {"p": 1})  # Hit
        cache.get("tool1", {"p": 1})  # Hit
        cache.get("tool2", {"p": 2})  # Hit
        cache.get("tool2", {"p": 2})  # Hit
        cache.get("tool3", {"p": 3})  # Hit
        cache.get("tool3", {"p": 3})  # Hit
        cache.get("tool4", {"p": 4})  # Miss
        cache.get("tool5", {"p": 5})  # Miss
        cache.get("tool6", {"p": 6})  # Miss
        cache.get("tool7", {"p": 7})  # Miss
        
        stats = cache.get_stats()
        
        assert stats["hits"] == 6
        assert stats["misses"] == 4
        assert stats["hit_rate"] == 0.6  # 6/10
        assert stats["size"] == 3
    
    def test_get_stats_after_clear(self):
        """Test statistics after clearing cache."""
        cache = ToolCache("test_session")
        
        cache.set("fetch_news", {"query": "election"}, {"result": "A"})
        cache.get("fetch_news", {"query": "election"})
        cache.get("fetch_news", {"query": "politics"})
        
        cache.clear()
        stats = cache.get_stats()
        
        assert stats["hits"] == 0
        assert stats["misses"] == 0
        assert stats["hit_rate"] == 0.0
        assert stats["size"] == 0
