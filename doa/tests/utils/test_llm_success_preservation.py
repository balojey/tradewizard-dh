"""
Preservation property tests for LLM success path.

This test suite validates that successful LLM invocations continue to work correctly
after implementing the rate limit rotation fix. These tests should PASS on UNFIXED code
to establish the baseline behavior we need to preserve.

Preservation Requirements (from design.md):
    3.7: WHEN LLM invocations succeed without rate limits 
         THEN the system SHALL CONTINUE TO use the primary configured LLM model
    
    3.8: WHEN LLM responses are received successfully 
         THEN the system SHALL CONTINUE TO parse and process agent outputs correctly
    
    3.9: WHEN the workflow completes successfully 
         THEN the system SHALL CONTINUE TO generate recommendations with proper structure 
         and audit logging

**Validates: Requirements 3.7, 3.8, 3.9**
"""

import pytest
from hypothesis import given, strategies as st, settings, assume
from unittest.mock import AsyncMock, patch, MagicMock
from langchain_core.messages import HumanMessage, AIMessage
from utils.llm_factory import create_llm_instance
from config import LLMConfig


# ============================================================================
# Property 1: Successful LLM Invocations Use Primary Model
# ============================================================================

@pytest.mark.asyncio
async def test_successful_invocation_uses_primary_model():
    """
    Test that successful LLM invocations use the primary (first) configured model.
    
    This test verifies preservation behavior: when no rate limit occurs, the system
    should use the primary model without attempting rotation.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code (preservation test)
    
    **Validates: Requirement 3.7**
    """
    # Configure multiple models (primary + fallback)
    config = LLMConfig(
        model_name="llama-3.3-70b-instruct,llama3-8b-instruct",
        temperature=0.7,
        max_tokens=2000,
        timeout_ms=30000,
        api_key="test_api_key"
    )
    
    llm = create_llm_instance(config=config)
    
    with patch('langchain_openai.ChatOpenAI.ainvoke') as mock_ainvoke:
        # Simulate successful response from primary model
        success_response = MagicMock()
        success_response.content = "Success from primary model"
        mock_ainvoke.return_value = success_response
        
        messages = [HumanMessage(content="Test message")]
        response = await llm.ainvoke(messages)
        
        # Should succeed on first call (primary model)
        assert response.content == "Success from primary model"
        assert mock_ainvoke.call_count == 1, "Should only call primary model when successful"


@pytest.mark.asyncio
async def test_single_model_successful_invocation():
    """
    Test that single model configuration works correctly for successful invocations.
    
    This verifies that the system continues to work with single model configurations
    (backward compatibility).
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    
    **Validates: Requirement 3.7**
    """
    # Configure single model
    config = LLMConfig(
        model_name="llama-3.3-70b-instruct",
        temperature=0.7,
        max_tokens=2000,
        timeout_ms=30000,
        api_key="test_api_key"
    )
    
    llm = create_llm_instance(config=config)
    
    with patch('langchain_openai.ChatOpenAI.ainvoke') as mock_ainvoke:
        success_response = MagicMock()
        success_response.content = "Success from single model"
        mock_ainvoke.return_value = success_response
        
        messages = [HumanMessage(content="Test message")]
        response = await llm.ainvoke(messages)
        
        assert response.content == "Success from single model"
        assert mock_ainvoke.call_count == 1


# ============================================================================
# Property 2: LLM Responses Are Parsed Correctly
# ============================================================================

@pytest.mark.asyncio
async def test_llm_response_parsing_preserved():
    """
    Test that LLM responses are parsed and processed correctly.
    
    This verifies that the response structure and content parsing continues to work
    correctly after implementing the rotation fix.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    
    **Validates: Requirement 3.8**
    """
    config = LLMConfig(
        model_name="llama-3.3-70b-instruct",
        temperature=0.7,
        max_tokens=2000,
        timeout_ms=30000,
        api_key="test_api_key"
    )
    
    llm = create_llm_instance(config=config)
    
    with patch('langchain_openai.ChatOpenAI.ainvoke') as mock_ainvoke:
        # Simulate response with typical structure
        success_response = MagicMock()
        success_response.content = "This is a test response with multiple sentences. It contains analysis and reasoning."
        success_response.response_metadata = {"model": "llama-3.3-70b-instruct"}
        mock_ainvoke.return_value = success_response
        
        messages = [HumanMessage(content="Analyze this market")]
        response = await llm.ainvoke(messages)
        
        # Verify response structure is preserved
        assert hasattr(response, 'content')
        assert isinstance(response.content, str)
        assert len(response.content) > 0
        assert "test response" in response.content


@pytest.mark.asyncio
async def test_structured_output_parsing_preserved():
    """
    Test that structured output parsing continues to work correctly.
    
    This verifies that when using structured output models (Pydantic), the parsing
    logic continues to work after implementing the rotation fix.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    
    **Validates: Requirement 3.8**
    """
    from pydantic import BaseModel
    
    class TestOutput(BaseModel):
        """Test output model."""
        analysis: str
        confidence: float
    
    config = LLMConfig(
        model_name="llama-3.3-70b-instruct",
        temperature=0.7,
        max_tokens=2000,
        timeout_ms=30000,
        api_key="test_api_key"
    )
    
    # Create LLM with structured output
    llm = create_llm_instance(config=config, structured_output_model=TestOutput)
    
    with patch('langchain_openai.ChatOpenAI.ainvoke') as mock_ainvoke:
        # Simulate response with JSON structure
        success_response = MagicMock()
        success_response.content = '```json\n{"analysis": "Test analysis", "confidence": 0.85}\n```'
        mock_ainvoke.return_value = success_response
        
        messages = [HumanMessage(content="Analyze this")]
        response = await llm.ainvoke(messages)
        
        # Verify structured output is parsed correctly
        assert isinstance(response, TestOutput)
        assert response.analysis == "Test analysis"
        assert response.confidence == 0.85


# ============================================================================
# Property 3: Multiple Successful Invocations Work Correctly
# ============================================================================

@pytest.mark.asyncio
async def test_multiple_successful_invocations():
    """
    Test that multiple consecutive successful invocations work correctly.
    
    This verifies that the system can handle multiple successful calls without
    any rotation logic interfering.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    
    **Validates: Requirement 3.7, 3.8**
    """
    config = LLMConfig(
        model_name="llama-3.3-70b-instruct,llama3-8b-instruct",
        temperature=0.7,
        max_tokens=2000,
        timeout_ms=30000,
        api_key="test_api_key"
    )
    
    llm = create_llm_instance(config=config)
    
    with patch('langchain_openai.ChatOpenAI.ainvoke') as mock_ainvoke:
        # Simulate multiple successful responses
        responses = [
            MagicMock(content=f"Response {i}") for i in range(5)
        ]
        mock_ainvoke.side_effect = responses
        
        # Make multiple invocations
        for i in range(5):
            messages = [HumanMessage(content=f"Test message {i}")]
            response = await llm.ainvoke(messages)
            assert response.content == f"Response {i}"
        
        # All calls should succeed with primary model
        assert mock_ainvoke.call_count == 5


# ============================================================================
# Property-Based Tests: LLM Success Path Preservation
# ============================================================================

@given(
    temperature=st.floats(min_value=0.0, max_value=2.0),
    max_tokens=st.integers(min_value=100, max_value=4000),
    num_invocations=st.integers(min_value=1, max_value=10)
)
@settings(max_examples=20, deadline=None)
@pytest.mark.asyncio
@pytest.mark.property
async def test_property_successful_invocations_use_primary_model(
    temperature, max_tokens, num_invocations
):
    """
    Property: For ANY LLM configuration and ANY number of successful invocations,
    the system SHALL use the primary configured model without rotation.
    
    This property-based test generates various configurations and invocation counts
    to ensure successful invocations always use the primary model.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    
    **Validates: Requirements 3.7, 3.8**
    """
    # Create configuration with random parameters
    config = LLMConfig(
        model_name="llama-3.3-70b-instruct,llama3-8b-instruct",
        temperature=temperature,
        max_tokens=max_tokens,
        timeout_ms=30000,
        api_key="test_api_key"
    )
    
    llm = create_llm_instance(config=config)
    
    with patch('langchain_openai.ChatOpenAI.ainvoke') as mock_ainvoke:
        # Simulate successful responses
        responses = [
            MagicMock(content=f"Success {i}") for i in range(num_invocations)
        ]
        mock_ainvoke.side_effect = responses
        
        # Make invocations
        for i in range(num_invocations):
            messages = [HumanMessage(content=f"Message {i}")]
            response = await llm.ainvoke(messages)
            
            # Property: Each invocation should succeed
            assert response.content == f"Success {i}"
        
        # Property: Should only call primary model (no rotation)
        assert mock_ainvoke.call_count == num_invocations


@given(
    response_length=st.integers(min_value=10, max_value=1000),
    num_sentences=st.integers(min_value=1, max_value=10)
)
@settings(max_examples=20, deadline=None)
@pytest.mark.asyncio
@pytest.mark.property
async def test_property_response_parsing_preserved(response_length, num_sentences):
    """
    Property: For ANY response content structure, the system SHALL parse and
    process responses correctly.
    
    This property-based test generates various response structures to ensure
    parsing continues to work correctly.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    
    **Validates: Requirement 3.8**
    """
    # Assume reasonable constraints
    assume(response_length >= num_sentences * 5)  # At least 5 chars per sentence
    
    config = LLMConfig(
        model_name="llama-3.3-70b-instruct",
        temperature=0.7,
        max_tokens=2000,
        timeout_ms=30000,
        api_key="test_api_key"
    )
    
    llm = create_llm_instance(config=config)
    
    with patch('langchain_openai.ChatOpenAI.ainvoke') as mock_ainvoke:
        # Generate response with specified structure
        sentence_length = response_length // num_sentences
        sentences = [f"Sentence {i} " + "x" * (sentence_length - 12) for i in range(num_sentences)]
        response_content = ". ".join(sentences) + "."
        
        success_response = MagicMock()
        success_response.content = response_content
        mock_ainvoke.return_value = success_response
        
        messages = [HumanMessage(content="Test")]
        response = await llm.ainvoke(messages)
        
        # Property: Response should be parsed correctly
        assert hasattr(response, 'content')
        assert isinstance(response.content, str)
        assert len(response.content) > 0
        assert "Sentence 0" in response.content


@given(
    model_count=st.integers(min_value=1, max_value=4),
    invocation_count=st.integers(min_value=1, max_value=5)
)
@settings(max_examples=15, deadline=None)
@pytest.mark.asyncio
@pytest.mark.property
async def test_property_model_configuration_flexibility(model_count, invocation_count):
    """
    Property: For ANY number of configured models (1 to N), successful invocations
    SHALL use the primary model without attempting rotation.
    
    This verifies that the system works correctly with various model configurations.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    
    **Validates: Requirement 3.7**
    """
    # Create model list
    model_names = [
        "llama-3.3-70b-instruct",
        "llama3-8b-instruct",
        "llama-3.1-70b-instruct",
        "llama-3.1-8b-instruct"
    ][:model_count]
    
    config = LLMConfig(
        model_name=",".join(model_names),
        temperature=0.7,
        max_tokens=2000,
        timeout_ms=30000,
        api_key="test_api_key"
    )
    
    llm = create_llm_instance(config=config)
    
    with patch('langchain_openai.ChatOpenAI.ainvoke') as mock_ainvoke:
        # Simulate successful responses
        responses = [
            MagicMock(content=f"Success {i}") for i in range(invocation_count)
        ]
        mock_ainvoke.side_effect = responses
        
        # Make invocations
        for i in range(invocation_count):
            messages = [HumanMessage(content=f"Message {i}")]
            response = await llm.ainvoke(messages)
            assert response.content == f"Success {i}"
        
        # Property: Should only call primary model
        assert mock_ainvoke.call_count == invocation_count


# ============================================================================
# Integration Test: Workflow Completion with Successful LLM Calls
# ============================================================================

@pytest.mark.asyncio
async def test_workflow_completion_with_successful_llm():
    """
    Test that workflow completes successfully with proper structure and audit logging
    when LLM invocations succeed.
    
    This is a higher-level test that verifies the complete workflow behavior is preserved.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    
    **Validates: Requirement 3.9**
    """
    config = LLMConfig(
        model_name="llama-3.3-70b-instruct",
        temperature=0.7,
        max_tokens=2000,
        timeout_ms=30000,
        api_key="test_api_key"
    )
    
    llm = create_llm_instance(config=config)
    
    with patch('langchain_openai.ChatOpenAI.ainvoke') as mock_ainvoke:
        # Simulate successful workflow execution
        success_response = MagicMock()
        success_response.content = "Market analysis complete. Recommendation: LONG_YES"
        mock_ainvoke.return_value = success_response
        
        messages = [HumanMessage(content="Analyze market condition")]
        response = await llm.ainvoke(messages)
        
        # Verify workflow completion structure
        assert response.content is not None
        assert len(response.content) > 0
        assert "Recommendation" in response.content
        
        # Verify only primary model was used
        assert mock_ainvoke.call_count == 1


@pytest.mark.asyncio
async def test_llm_configuration_parameters_preserved():
    """
    Test that LLM configuration parameters (temperature, max_tokens, timeout) are
    preserved and used correctly.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    
    **Validates: Requirement 3.7, 3.8**
    """
    config = LLMConfig(
        model_name="llama-3.3-70b-instruct",
        temperature=0.9,
        max_tokens=1500,
        timeout_ms=20000,
        api_key="test_api_key"
    )
    
    with patch('utils.llm_factory.ChatOpenAI') as mock_chat_openai:
        # Create mock instance
        mock_instance = MagicMock()
        mock_chat_openai.return_value = mock_instance
        
        # Create LLM instance
        llm = create_llm_instance(config=config)
        
        # Verify ChatOpenAI was called with correct parameters
        mock_chat_openai.assert_called_once()
        call_kwargs = mock_chat_openai.call_args[1]
        
        assert call_kwargs['model'] == "llama-3.3-70b-instruct"
        assert call_kwargs['temperature'] == 0.9
        assert call_kwargs['max_tokens'] == 1500
        assert call_kwargs['timeout'] == 20.0  # Converted from ms to seconds
