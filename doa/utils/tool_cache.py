"""Tool cache utility for storing tool results within a session.

This module provides session-scoped caching for tool results to avoid
redundant API calls and reduce costs.
"""

import hashlib
import json
from typing import Any, Optional, Dict


class ToolCache:
    """Session-scoped cache for tool results.
    
    The cache stores tool results using deterministic keys based on tool name
    and parameters. It tracks cache hits and misses for monitoring and optimization.
    
    Attributes:
        session_id: Unique identifier for the session
        _cache: Internal dictionary storing cached results
        _hits: Number of cache hits
        _misses: Number of cache misses
    """
    
    def __init__(self, session_id: str):
        """Initialize cache for a session.
        
        Args:
            session_id: Unique identifier for the session (e.g., condition_id)
        """
        self.session_id = session_id
        self._cache: Dict[str, Any] = {}
        self._hits = 0
        self._misses = 0
    
    def _generate_cache_key(self, tool_name: str, params: Any) -> str:
        """Generate deterministic cache key from tool name and parameters.
        
        The cache key is a SHA-256 hash of the tool name and sorted parameters.
        Parameters are JSON-serialized with sorted keys to ensure deterministic
        hashing regardless of parameter order.
        
        Args:
            tool_name: Name of the tool
            params: Tool parameters (dict, list, or primitive)
            
        Returns:
            SHA-256 hash as hexadecimal string
        """
        # Sort parameters for consistent keys
        sorted_params = json.dumps(params, sort_keys=True)
        key_str = f"{tool_name}:{sorted_params}"
        return hashlib.sha256(key_str.encode()).hexdigest()
    
    def get(self, tool_name: str, params: Any) -> Optional[Any]:
        """Retrieve cached result if available.
        
        Args:
            tool_name: Name of the tool
            params: Tool parameters used to generate cache key
            
        Returns:
            Cached result if available, None otherwise
        """
        key = self._generate_cache_key(tool_name, params)
        if key in self._cache:
            self._hits += 1
            return self._cache[key]
        self._misses += 1
        return None
    
    def set(self, tool_name: str, params: Any, result: Any) -> None:
        """Store result in cache.
        
        Args:
            tool_name: Name of the tool
            params: Tool parameters used to generate cache key
            result: Result to cache
        """
        key = self._generate_cache_key(tool_name, params)
        self._cache[key] = result
    
    def clear(self) -> None:
        """Clear all cached entries and reset statistics."""
        self._cache.clear()
        self._hits = 0
        self._misses = 0
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics.
        
        Returns:
            Dictionary containing:
                - hits: Number of cache hits
                - misses: Number of cache misses
                - hit_rate: Ratio of hits to total requests (0.0-1.0)
                - size: Number of cached entries
        """
        total = self._hits + self._misses
        hit_rate = self._hits / total if total > 0 else 0.0
        return {
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": hit_rate,
            "size": len(self._cache)
        }
