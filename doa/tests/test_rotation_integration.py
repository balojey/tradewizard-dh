"""
Integration test to verify LLM rotation manager is properly integrated into agent factories.

This test validates that:
1. Config correctly parses comma-separated model names
2. Agent factories create rotation manager when multiple models configured
3. LLM factory uses rotation wrapper when rotation manager provided
"""

import os
import pytest
from unittest.mock import Mock, patch, MagicMock
from config import load_config, LLMConfig
from agents.autonomous_agent_factory import create_autonomous_agent_node
from agents.agent_factory import create_agent_node
from utils.llm_factory import create_llm_instance, create_agent_llm
from utils.llm_rotation_manager import LLMRotationManager, LLMWithRotation


def test_config_parses_multiple_models():
    """Test that config correctly parses comma-separated model names."""
    # Test single model
    with patch.dict(os.environ, {"LLM_MODEL_NAME": "llama-3.3-70b-instruct"}):
        config = LLMConfig(
            model_names=["llama-3.3-70b-instruct"],
            temperature=0.7,
            max_tokens=2000,
            timeout_ms=30000,
            api_key="test-key"
        )
        assert len(config.model_names) == 1
        assert config.model_names[0] == "llama-3.3-70b-instruct"
        assert config.model_name == "llama-3.3-70b-instruct"  # Backward compatibility
    
    # Test multiple models
    model_str = "llama-3.3-70b-instruct,llama3-8b-instruct,llama-3.1-70b-instruct"
    model_names = [name.strip() for name in model_str.split(",") if name.strip()]
    
    config = LLMConfig(
        model_names=model_names,
        temperature=0.7,
        max_tokens=2000,
        timeout_ms=30000,
        api_key="test-key"
    )
    
    assert len(config.model_names) == 3
    assert config.model_names[0] == "llama-3.3-70b-instruct"
    assert config.model_names[1] == "llama3-8b-instruct"
    assert config.model_names[2] == "llama-3.1-70b-instruct"
    assert config.model_name == "llama-3.3-70b-instruct"  # Primary model


def test_llm_factory_uses_rotation_when_provided():
    """Test that create_llm_instance uses LLMWithRotation when rotation_manager provided."""
    config = LLMConfig(
        model_names=["model1", "model2"],
        temperature=0.7,
        max_tokens=2000,
        timeout_ms=30000,
        api_key="test-key"
    )
    
    rotation_manager = LLMRotationManager("model1,model2")
    
    # Create LLM with rotation
    llm = create_llm_instance(config, rotation_manager=rotation_manager)
    
    # Should be LLMWithRotation wrapper
    assert isinstance(llm, LLMWithRotation)
    assert llm.rotation_manager == rotation_manager


def test_llm_factory_no_rotation_single_model():
    """Test that create_llm_instance doesn't use rotation for single model."""
    from langchain_openai import ChatOpenAI
    
    config = LLMConfig(
        model_names=["model1"],
        temperature=0.7,
        max_tokens=2000,
        timeout_ms=30000,
        api_key="test-key"
    )
    
    # Create LLM without rotation (single model)
    llm = create_llm_instance(config, rotation_manager=None)
    
    # Should be standard ChatOpenAI
    assert isinstance(llm, ChatOpenAI)
    assert not isinstance(llm, LLMWithRotation)


def test_autonomous_agent_factory_creates_rotation_manager():
    """Test that create_autonomous_agent_node creates rotation manager for multiple models."""
    # Mock config with multiple models
    mock_config = Mock()
    mock_config.llm = LLMConfig(
        model_names=["model1", "model2"],
        temperature=0.7,
        max_tokens=2000,
        timeout_ms=30000,
        api_key="test-key"
    )
    mock_config.agents = Mock()
    mock_config.agents.timeout_ms = 45000
    mock_config.autonomous_agents = Mock()
    mock_config.autonomous_agents.max_tool_calls = 5
    
    # Mock tools
    mock_tools = []
    
    # Mock tool context
    tool_context = {"cache": Mock(), "audit_log": []}
    
    # Create agent node (this should create rotation manager internally)
    with patch('utils.llm_factory.create_llm_instance') as mock_create_llm:
        mock_llm = Mock()
        mock_create_llm.return_value = mock_llm
        
        node = create_autonomous_agent_node(
            agent_name="test_agent",
            system_prompt="Test prompt",
            tools=mock_tools,
            config=mock_config,
            tool_context=tool_context
        )
        
        # Verify create_llm_instance was called with rotation_manager
        assert mock_create_llm.called
        call_args = mock_create_llm.call_args
        
        # Check that rotation_manager was passed
        assert 'rotation_manager' in call_args.kwargs
        rotation_manager = call_args.kwargs['rotation_manager']
        
        # Should have created rotation manager for multiple models
        assert rotation_manager is not None
        assert isinstance(rotation_manager, LLMRotationManager)


def test_agent_factory_creates_rotation_manager():
    """Test that create_agent_llm creates rotation manager for multiple models."""
    # Mock config with multiple models
    mock_config = Mock()
    mock_config.llm = LLMConfig(
        model_names=["model1", "model2"],
        temperature=0.7,
        max_tokens=2000,
        timeout_ms=30000,
        api_key="test-key"
    )
    
    # Create agent LLM (this should create rotation manager internally)
    with patch('utils.llm_factory.create_llm_instance') as mock_create_llm:
        mock_llm = Mock()
        mock_create_llm.return_value = mock_llm
        
        from models.types import AgentSignal
        
        llm = create_agent_llm(
            config=mock_config,
            agent_name="test_agent",
            output_model=AgentSignal
        )
        
        # Verify create_llm_instance was called with rotation_manager
        assert mock_create_llm.called
        call_args = mock_create_llm.call_args
        
        # Check that rotation_manager was passed
        assert 'rotation_manager' in call_args.kwargs
        rotation_manager = call_args.kwargs['rotation_manager']
        
        # Should have created rotation manager for multiple models
        assert rotation_manager is not None
        assert isinstance(rotation_manager, LLMRotationManager)


def test_single_model_no_rotation_manager():
    """Test that factories don't create rotation manager for single model."""
    # Mock config with single model
    mock_config = Mock()
    mock_config.llm = LLMConfig(
        model_names=["model1"],
        temperature=0.7,
        max_tokens=2000,
        timeout_ms=30000,
        api_key="test-key"
    )
    
    # Test agent_factory
    with patch('utils.llm_factory.create_llm_instance') as mock_create_llm:
        mock_llm = Mock()
        mock_create_llm.return_value = mock_llm
        
        from models.types import AgentSignal
        
        llm = create_agent_llm(
            config=mock_config,
            agent_name="test_agent",
            output_model=AgentSignal
        )
        
        # Verify create_llm_instance was called without rotation_manager
        assert mock_create_llm.called
        call_args = mock_create_llm.call_args
        
        # Check that rotation_manager is None for single model
        assert 'rotation_manager' in call_args.kwargs
        rotation_manager = call_args.kwargs['rotation_manager']
        assert rotation_manager is None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
