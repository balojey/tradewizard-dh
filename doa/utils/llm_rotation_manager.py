"""LLM model rotation manager for handling rate limits across multiple models."""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from langchain_openai import ChatOpenAI
from langchain_core.runnables import RunnableSerializable

# Configure logger
logger = logging.getLogger(__name__)


# ============================================================================
# Model State Management
# ============================================================================

@dataclass
class ModelState:
    """State tracking for a single LLM model."""
    model_name: str
    model_id: str  # First 20 characters for logging
    is_rate_limited: bool
    rate_limit_expiry: Optional[datetime]
    total_requests: int
    last_used: Optional[datetime]


# ============================================================================
# LLM Rotation Manager
# ============================================================================

class LLMRotationManager:
    """
    Manages rotation across multiple LLM models to handle rate limits.
    
    Follows the same pattern as NewsData API key rotation:
    - Tracks state for each configured model
    - Automatically rotates to next available model on rate limit
    - Uses LRU (Least Recently Used) strategy for model selection
    - Auto-expires rate limits when expiry time passes
    
    Example:
        >>> manager = LLMRotationManager("llama-3.3-70b-instruct,llama3-8b-instruct")
        >>> current_model = manager.get_current_model()
        >>> # On rate limit error:
        >>> next_model = manager.rotate_model(retry_after_seconds=900)
    """
    
    def __init__(self, model_names: str):
        """
        Initialize LLM rotation manager with comma-separated model names.
        
        Args:
            model_names: Comma-separated list of model names (e.g., "model1,model2")
            
        Raises:
            ValueError: If no valid model names are provided
        """
        # Parse comma-separated model names
        self.model_names: List[str] = [
            name.strip() 
            for name in model_names.split(',') 
            if name.strip()
        ]
        
        if not self.model_names:
            raise ValueError("At least one model name must be provided")
        
        # Initialize model state management
        self.model_states: Dict[str, ModelState] = {}
        for model_name in self.model_names:
            self.model_states[self._get_model_id(model_name)] = ModelState(
                model_name=model_name,
                model_id=self._get_model_id(model_name),
                is_rate_limited=False,
                rate_limit_expiry=None,
                total_requests=0,
                last_used=None
            )
        
        self.current_model_index: int = 0
        
        logger.info(
            f"Initialized LLM rotation manager with {len(self.model_names)} model(s): "
            f"{', '.join(self._get_model_id(m) for m in self.model_names)}"
        )
    
    def _get_model_id(self, model_name: str) -> str:
        """Get model identifier (first 20 characters) for logging."""
        return model_name[:20] if len(model_name) >= 20 else model_name
    
    def _is_rate_limit_error(self, exception: Exception) -> bool:
        """
        Check if exception indicates rate limit error.
        
        Detects HTTP 429 errors or rate limit exceptions from LLM providers.
        
        Args:
            exception: Exception from LLM invocation
            
        Returns:
            True if exception indicates rate limit, False otherwise
        """
        # Check exception message for rate limit indicators
        error_message = str(exception).lower()
        
        # Common rate limit indicators
        rate_limit_indicators = [
            'rate limit',
            'rate_limit',
            'ratelimit',
            'too many requests',
            '429',
            'quota exceeded',
            'throttled'
        ]
        
        return any(indicator in error_message for indicator in rate_limit_indicators)
    
    def _extract_retry_after(self, exception: Exception) -> int:
        """
        Extract retry-after duration from exception.
        
        Attempts to parse retry duration from exception message.
        Defaults to 900 seconds (15 minutes) if not found.
        
        Args:
            exception: Exception from LLM invocation
            
        Returns:
            Number of seconds to wait before retrying (default: 900)
        """
        import re
        
        error_message = str(exception)
        
        # Try to extract retry-after value from error message
        # Look for patterns like "retry after 60 seconds" or "retry_after: 60"
        patterns = [
            r'retry[_\s]after[:\s]+(\d+)',
            r'wait[:\s]+(\d+)[:\s]+seconds',
            r'available[:\s]+in[:\s]+(\d+)'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, error_message, re.IGNORECASE)
            if match:
                try:
                    return int(match.group(1))
                except ValueError:
                    pass
        
        # Default: 15 minutes (900 seconds)
        return 900
    
    def _get_available_models(self) -> List[str]:
        """
        Get list of available model IDs, sorted by least recently used.
        
        Auto-expires rate-limited models when their expiry time has passed.
        
        Returns:
            List of available model IDs sorted by last_used timestamp (LRU first)
        """
        now = datetime.now()
        available = []
        
        for model_id, state in self.model_states.items():
            # Auto-expire if time has passed
            if state.is_rate_limited and state.rate_limit_expiry:
                if now >= state.rate_limit_expiry:
                    state.is_rate_limited = False
                    state.rate_limit_expiry = None
                    # Log INFO when rate-limited model becomes available
                    logger.info(f"Model {model_id} rate limit expired, now available")
            
            if not state.is_rate_limited:
                available.append(model_id)
        
        # Sort by last used (None sorts first, then oldest first)
        available.sort(key=lambda mid: self.model_states[mid].last_used or datetime.min)
        
        return available
    
    def get_current_model(self) -> str:
        """
        Get the current active model name.
        
        Returns:
            Current model name
        """
        return self.model_names[self.current_model_index]
    
    def record_request(self) -> None:
        """
        Record a request for the current model.
        
        Updates usage statistics for observability.
        """
        current_model = self.model_names[self.current_model_index]
        current_model_id = self._get_model_id(current_model)
        
        self.model_states[current_model_id].total_requests += 1
        self.model_states[current_model_id].last_used = datetime.now()
    
    def rotate_model(
        self, 
        retry_after_seconds: int,
        context: Optional[str] = None
    ) -> Optional[str]:
        """
        Rotate to next available LLM model.
        
        Marks the current model as rate-limited with an expiry timestamp,
        then selects the next available model using LRU strategy.
        
        Args:
            retry_after_seconds: How long current model should be marked unavailable
            context: Optional context string for logging (e.g., "agent=breaking_news")
            
        Returns:
            Next available model name, or None if all models exhausted
        """
        current_model = self.model_names[self.current_model_index]
        current_model_id = self._get_model_id(current_model)
        
        # Mark current model as rate-limited
        expiry_time = datetime.now() + timedelta(seconds=retry_after_seconds)
        self.model_states[current_model_id].is_rate_limited = True
        self.model_states[current_model_id].rate_limit_expiry = expiry_time
        
        # Build context string for logging
        context_str = f" ({context})" if context else ""
        
        # Log WARNING when rate limit detected
        logger.warning(
            f"Rate limit detected for model {current_model_id}, "
            f"marked unavailable until {expiry_time.isoformat()}{context_str}"
        )
        
        # Find next available model
        available_models = self._get_available_models()
        
        if not available_models:
            # All models exhausted - Log ERROR
            earliest_expiry = min(
                state.rate_limit_expiry 
                for state in self.model_states.values() 
                if state.rate_limit_expiry
            )
            logger.error(
                f"All LLM models exhausted. Next available: {earliest_expiry.isoformat()}{context_str}"
            )
            return None
        
        # Select least recently used model
        next_model_id = available_models[0]
        next_model = self.model_states[next_model_id].model_name
        
        # Update index
        self.current_model_index = self.model_names.index(next_model)
        
        # Log rotation (only if multiple models) - Log INFO
        if len(self.model_names) > 1:
            logger.info(
                f"Rotated LLM model: {current_model_id} -> {next_model_id}{context_str}"
            )
        
        return next_model
    
    def get_model_rotation_stats(self) -> Dict[str, Any]:
        """
        Get statistics about LLM model usage and rotation.
        
        Provides metrics for observability and monitoring integration.
        Can be used with audit logger or Opik for tracking model rotation events.
        
        Returns:
            Dictionary containing:
                - total_models: Number of configured LLM models
                - available_models: Number of currently available models
                - rate_limited_models: Number of currently rate-limited models
                - model_stats: Per-model statistics (requests, last_used, rate_limit_status)
                - earliest_expiry: Earliest rate limit expiry time (if any models rate-limited)
        """
        available_count = 0
        rate_limited_count = 0
        model_stats = []
        earliest_expiry = None
        
        for model_id, state in self.model_states.items():
            model_stats.append({
                'model_id': model_id,
                'model_name': state.model_name,
                'total_requests': state.total_requests,
                'last_used': state.last_used.isoformat() if state.last_used else None,
                'is_rate_limited': state.is_rate_limited,
                'rate_limit_expiry': state.rate_limit_expiry.isoformat() if state.rate_limit_expiry else None
            })
            
            if state.is_rate_limited:
                rate_limited_count += 1
                if state.rate_limit_expiry:
                    if earliest_expiry is None or state.rate_limit_expiry < earliest_expiry:
                        earliest_expiry = state.rate_limit_expiry
            else:
                available_count += 1
        
        return {
            'total_models': len(self.model_names),
            'available_models': available_count,
            'rate_limited_models': rate_limited_count,
            'model_stats': model_stats,
            'earliest_expiry': earliest_expiry.isoformat() if earliest_expiry else None
        }


# ============================================================================
# LLM With Rotation Wrapper
# ============================================================================

class LLMWithRotation(RunnableSerializable[Any, Any]):
    """
    Wrapper that adds automatic model rotation to LLM on rate limit errors.
    
    Follows the same pattern as StructuredOutputLLM wrapper in llm_factory.py.
    Automatically handles rate limit errors by rotating to the next available model.
    Inherits from RunnableSerializable to be compatible with LangChain's piping operations.
    
    Example:
        >>> from config import LLMConfig
        >>> rotation_manager = LLMRotationManager("model1,model2")
        >>> config = LLMConfig(api_key="...", model_name="model1", ...)
        >>> llm = LLMWithRotation(rotation_manager, config)
        >>> response = await llm.ainvoke(messages)
    """
    
    rotation_manager: Any
    config: Any
    current_llm: Any
    
    def __init__(self, rotation_manager: LLMRotationManager, config: Any, **kwargs):
        """
        Initialize LLM with rotation capability.
        
        Args:
            rotation_manager: LLMRotationManager instance for handling model rotation
            config: LLMConfig object with api_key, temperature, max_tokens, timeout_ms
        """
        current_llm = self._create_llm_static(rotation_manager, config)
        super().__init__(
            rotation_manager=rotation_manager,
            config=config,
            current_llm=current_llm,
            **kwargs
        )
        
        logger.info(
            f"Initialized LLMWithRotation with {len(rotation_manager.model_names)} model(s)"
        )
    
    @staticmethod
    def _create_llm_static(rotation_manager: LLMRotationManager, config: Any) -> ChatOpenAI:
        """
        Static method to create ChatOpenAI instance for specific model.
        
        Args:
            rotation_manager: LLMRotationManager instance
            config: LLMConfig object
            
        Returns:
            Configured ChatOpenAI instance
        """
        model_name = rotation_manager.get_current_model()
        return ChatOpenAI(
            base_url="https://inference.do-ai.run/v1/",
            api_key=config.api_key,
            model=model_name,
            temperature=config.temperature,
            max_tokens=config.max_tokens,
            timeout=config.timeout_ms / 1000  # Convert ms to seconds
        )
    
    def _create_llm(self, model_name: str) -> ChatOpenAI:
        """
        Create ChatOpenAI instance for specific model.
        
        Args:
            model_name: Name of the LLM model to create
            
        Returns:
            Configured ChatOpenAI instance
        """
        return ChatOpenAI(
            base_url="https://inference.do-ai.run/v1/",
            api_key=self.config.api_key,
            model=model_name,
            temperature=self.config.temperature,
            max_tokens=self.config.max_tokens,
            timeout=self.config.timeout_ms / 1000  # Convert ms to seconds
        )
    
    async def ainvoke(self, input, config=None, **kwargs):
        """
        Async invoke with automatic model rotation on rate limit.
        
        Attempts to invoke the LLM with the current model. If a rate limit error
        is detected, automatically rotates to the next available model and retries.
        Continues until successful or all models are exhausted.
        
        Args:
            input: Input to send to the LLM (messages or other input format)
            config: Optional configuration dict
            **kwargs: Additional arguments to pass to LLM invocation
            
        Returns:
            LLM response
            
        Raises:
            RuntimeError: If all LLM models are rate limited
            Exception: If a non-rate-limit error occurs
        """
        max_retries = len(self.rotation_manager.model_names)
        
        for attempt in range(max_retries):
            try:
                # Record request for usage statistics
                self.rotation_manager.record_request()
                
                # Log attempt (only if multiple models and not first attempt)
                if len(self.rotation_manager.model_names) > 1 and attempt > 0:
                    current_model = self.rotation_manager.get_current_model()
                    model_id = self.rotation_manager._get_model_id(current_model)
                    logger.info(
                        f"Attempting LLM invocation with model {model_id} "
                        f"(attempt {attempt + 1}/{max_retries})"
                    )
                
                # Invoke LLM with proper signature
                response = await self.current_llm.ainvoke(input, config=config, **kwargs)
                return response
                
            except Exception as e:
                # Check if this is a rate limit error
                if self.rotation_manager._is_rate_limit_error(e):
                    # Extract retry-after duration
                    retry_after = self.rotation_manager._extract_retry_after(e)
                    
                    # Rotate to next model
                    next_model = self.rotation_manager.rotate_model(retry_after)
                    
                    if next_model is None:
                        # All models exhausted
                        logger.error("All LLM models exhausted due to rate limits")
                        raise RuntimeError(
                            "All configured LLM models are rate limited. "
                            "Please try again later or configure additional models."
                        )
                    
                    # Create new LLM instance with rotated model
                    self.current_llm = self._create_llm(next_model)
                    
                    # Continue to next attempt
                    continue
                else:
                    # Non-rate-limit error, re-raise immediately
                    logger.error(f"LLM invocation failed with non-rate-limit error: {e}")
                    raise
        
        # Exhausted all retries (should not reach here due to RuntimeError above)
        raise RuntimeError("All LLM models rate limited")
    def invoke(self, input, config=None, **kwargs):
        """
        Synchronous invoke method required by RunnableSerializable.

        Args:
            input: Input to send to the LLM
            config: Optional configuration
            **kwargs: Additional arguments

        Returns:
            LLM response
        """
        # Delegate to underlying LLM's invoke method
        return self.current_llm.invoke(input, config=config, **kwargs)

    
    def bind(self, **kwargs):
        """
        Pass through bind to underlying LLM.
        
        Allows binding tools or other configurations to the LLM instance.
        
        Args:
            **kwargs: Arguments to pass to LLM bind method
            
        Returns:
            Self for method chaining
        """
        self.current_llm = self.current_llm.bind(**kwargs)
        return self
    def bind_tools(self, tools, **kwargs):
        """
        Bind tools to the underlying LLM for tool-calling agents.

        This is required by LangChain's create_react_agent function.

        Args:
            tools: List of tools to bind to the LLM
            **kwargs: Additional arguments to pass to bind_tools

        Returns:
            Self for method chaining
        """
        self.current_llm = self.current_llm.bind_tools(tools, **kwargs)
        return self

