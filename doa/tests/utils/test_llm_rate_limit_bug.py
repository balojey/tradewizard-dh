"""
Bug condition exploration test for LLM rate limit rotation issue.

This test demonstrates Bug 3: LLM Rate Limit Causes Premature Termination
IMPORTANT: This test is expected to FAIL on unfixed code - failure confirms the bug exists.

Bug Condition (from design.md):
    WHEN an LLM provider returns a rate limit error (HTTP 429 or rate limit exception)
    THEN the system terminates the entire analysis workflow prematurely
    AND fails to produce any recommendation despite having alternative LLM models available

Expected Behavior (after fix):
    WHEN an LLM provider returns a rate limit error and alternative models are available
    THEN the system SHALL automatically rotate to the next available LLM model
    AND retry the request, allowing the workflow to continue without termination

**Validates: Requirements 2.5**
"""

import pytest
from hypothesis import given, strategies as st, settings
from unittest.mock import AsyncMock, patch, MagicMock
from langchain_core.messages import HumanMessage
from openai import RateLimitError
from utils.llm_factory import create_llm_instance
from config import LLMConfig


# ============================================================================
# Bug Condition: LLM Rate Limit Terminates Workflow (Current Behavior)
# ============================================================================

@pytest.mark.asyncio
async def test_llm_rate_limit_terminates_instead_of_rotating():
    """
    Test that LLM invocation with rate limit error rotates to next model instead of terminating.
    
    This test demonstrates the bug by showing that when the first LLM model returns a rate
    limit error (HTTP 429), the system should rotate to the next available model instead
    of terminating the workflow.
    
    EXPECTED OUTCOME ON UNFIXED CODE: Test FAILS (RateLimitError raised, workflow terminates)
    EXPECTED OUTCOME ON FIXED CODE: Test PASSES (rotates to next model, workflow continues)
    
    Counterexample: LLM rate limit raises exception instead of rotating to llama3-8b-instruct
    """
    # Configure multiple models (primary + fallback)
    config = LLMConfig(
        model_names=["llama-3.3-70b-instruct", "llama3-8b-instruct"],  # Multiple models
        temperature=0.7,
        max_tokens=2000,
        timeout_ms=30000,
        api_key="test_api_key"
    )
    
    # Create LLM instance
    llm = create_llm_instance(config=config)
    
    # Mock the underlying ChatOpenAI to simulate rate limit on first call
    with patch('langchain_openai.ChatOpenAI.ainvoke') as mock_ainvoke:
        # First call: Rate limit error (simulating llama-3.3-70b-instruct rate limited)
        rate_limit_error = RateLimitError(
            message="Rate limit exceeded",
            response=MagicMock(status_code=429),
            body={"error": {"message": "Rate limit exceeded", "type": "rate_limit_error"}}
        )
        
        # Second call: Success (simulating llama3-8b-instruct succeeds)
        success_response = MagicMock()
        success_response.content = "Test response from fallback model"
        
        # Configure mock to raise error first, then succeed
        mock_ainvoke.side_effect = [rate_limit_error, success_response]
        
        # Attempt to invoke LLM
        messages = [HumanMessage(content="Test message")]
        
        # ON UNFIXED CODE: This will raise RateLimitError and terminate
        # ON FIXED CODE: This will catch the error, rotate to next model, and succeed
        try:
            response = await llm.ainvoke(messages)
            
            # If we get here, the fix is working (rotation occurred)
            assert response.content == "Test response from fallback model"
            assert mock_ainvoke.call_count == 2, "Should have called LLM twice (first failed, second succeeded)"
            
        except RateLimitError:
            # This is the BUG: Rate limit error terminates workflow instead of rotating
            pytest.fail(
                "BUG CONFIRMED: LLM rate limit error terminated workflow instead of rotating to next model. "
                "Expected: Automatic rotation to llama3-8b-instruct. "
                "Actual: RateLimitError raised, workflow terminated."
            )


@pytest.mark.asyncio
async def test_llm_rate_limit_single_model_graceful_degradation():
    """
    Test that with a single model configured, rate limit error is handled gracefully.
    
    This test verifies that when only one model is configured and it gets rate limited,
    the system handles it gracefully (either by raising a clear error or returning
    a low-confidence signal).
    
    EXPECTED OUTCOME ON UNFIXED CODE: Test FAILS (unhandled exception)
    EXPECTED OUTCOME ON FIXED CODE: Test PASSES (graceful error handling)
    """
    # Configure single model
    config = LLMConfig(
        model_names=["llama-3.3-70b-instruct"],  # Single model only
        temperature=0.7,
        max_tokens=2000,
        timeout_ms=30000,
        api_key="test_api_key"
    )
    
    llm = create_llm_instance(config=config)
    
    with patch('langchain_openai.ChatOpenAI.ainvoke') as mock_ainvoke:
        # Simulate rate limit error
        rate_limit_error = RateLimitError(
            message="Rate limit exceeded",
            response=MagicMock(status_code=429),
            body={"error": {"message": "Rate limit exceeded", "type": "rate_limit_error"}}
        )
        mock_ainvoke.side_effect = rate_limit_error
        
        messages = [HumanMessage(content="Test message")]
        
        # Should raise RateLimitError (no alternative models available)
        with pytest.raises(RateLimitError):
            await llm.ainvoke(messages)


@pytest.mark.asyncio
async def test_llm_rate_limit_all_models_exhausted():
    """
    Test behavior when all configured models are rate limited.
    
    This test verifies that when all models in the rotation are rate limited,
    the system handles it gracefully with a clear error message.
    
    EXPECTED OUTCOME ON UNFIXED CODE: Test FAILS (first rate limit terminates)
    EXPECTED OUTCOME ON FIXED CODE: Test PASSES (tries all models, then fails gracefully)
    """
    # Configure multiple models
    config = LLMConfig(
        model_names=["llama-3.3-70b-instruct", "llama3-8b-instruct"],
        temperature=0.7,
        max_tokens=2000,
        timeout_ms=30000,
        api_key="test_api_key"
    )
    
    llm = create_llm_instance(config=config)
    
    with patch('langchain_openai.ChatOpenAI.ainvoke') as mock_ainvoke:
        # Both models return rate limit errors
        rate_limit_error = RateLimitError(
            message="Rate limit exceeded",
            response=MagicMock(status_code=429),
            body={"error": {"message": "Rate limit exceeded", "type": "rate_limit_error"}}
        )
        mock_ainvoke.side_effect = [rate_limit_error, rate_limit_error]
        
        messages = [HumanMessage(content="Test message")]
        
        # Should raise error after exhausting all models
        with pytest.raises((RateLimitError, RuntimeError)) as exc_info:
            await llm.ainvoke(messages)
        
        # Verify both models were tried
        assert mock_ainvoke.call_count == 2, "Should have tried both models before failing"


# ============================================================================
# Property-Based Test: LLM Rate Limit Rotation
# ============================================================================

@given(
    num_models=st.integers(min_value=2, max_value=4),
    rate_limit_index=st.integers(min_value=0, max_value=3)
)
@settings(max_examples=10, deadline=None)
@pytest.mark.asyncio
@pytest.mark.property
async def test_property_llm_rotates_on_rate_limit(num_models, rate_limit_index):
    """
    Property: For ANY LLM configuration with multiple models, when a rate limit error
    occurs on model N, the system SHALL rotate to model N+1 and continue execution.
    
    This property-based test generates various configurations of model counts and
    rate limit positions to ensure rotation works correctly across all scenarios.
    
    EXPECTED OUTCOME ON UNFIXED CODE: Test FAILS (rate limit terminates workflow)
    EXPECTED OUTCOME ON FIXED CODE: Test PASSES (rotation occurs successfully)
    
    **Validates: Requirements 2.5, 2.6**
    """
    # Only test if rate_limit_index is within bounds
    if rate_limit_index >= num_models:
        return
    
    # Create model list
    model_names = [
        "llama-3.3-70b-instruct",
        "llama3-8b-instruct",
        "llama-3.1-70b-instruct",
        "llama-3.1-8b-instruct"
    ][:num_models]
    
    config = LLMConfig(
        model_names=model_names,
        temperature=0.7,
        max_tokens=2000,
        timeout_ms=30000,
        api_key="test_api_key"
    )
    
    llm = create_llm_instance(config=config)
    
    with patch('langchain_openai.ChatOpenAI.ainvoke') as mock_ainvoke:
        # Create side effects: rate limit at rate_limit_index, success after
        rate_limit_error = RateLimitError(
            message="Rate limit exceeded",
            response=MagicMock(status_code=429),
            body={"error": {"message": "Rate limit exceeded", "type": "rate_limit_error"}}
        )
        
        success_response = MagicMock()
        success_response.content = f"Success from model {rate_limit_index + 1}"
        
        # Build side effects: errors up to rate_limit_index, then success
        side_effects = [rate_limit_error] * (rate_limit_index + 1) + [success_response]
        mock_ainvoke.side_effect = side_effects
        
        messages = [HumanMessage(content="Test message")]
        
        try:
            response = await llm.ainvoke(messages)
            
            # Property: Should succeed after rotation
            assert response.content == f"Success from model {rate_limit_index + 1}"
            assert mock_ainvoke.call_count == rate_limit_index + 2, \
                f"Should have tried {rate_limit_index + 1} rate-limited models + 1 successful model"
            
        except RateLimitError:
            pytest.fail(
                f"Property violated: Rate limit on model {rate_limit_index} should rotate to next model, "
                f"but workflow terminated instead. Models configured: {num_models}"
            )


@pytest.mark.asyncio
async def test_llm_successful_invocation_uses_primary_model():
    """
    Test that successful LLM invocations use the primary (first) configured model.
    
    This test verifies preservation behavior: when no rate limit occurs, the system
    should use the primary model without attempting rotation.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code (preservation test)
    """
    config = LLMConfig(
        model_names=["llama-3.3-70b-instruct", "llama3-8b-instruct"],
        temperature=0.7,
        max_tokens=2000,
        timeout_ms=30000,
        api_key="test_api_key"
    )
    
    llm = create_llm_instance(config=config)
    
    with patch('langchain_openai.ChatOpenAI.ainvoke') as mock_ainvoke:
        # Simulate successful response
        success_response = MagicMock()
        success_response.content = "Success from primary model"
        mock_ainvoke.return_value = success_response
        
        messages = [HumanMessage(content="Test message")]
        response = await llm.ainvoke(messages)
        
        # Should succeed on first call (primary model)
        assert response.content == "Success from primary model"
        assert mock_ainvoke.call_count == 1, "Should only call primary model when successful"
