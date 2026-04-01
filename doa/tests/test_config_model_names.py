"""Test config.py model_names parsing for task 9.3."""

import os
import pytest
from config import load_config, LLMConfig


def test_single_model_name():
    """Test backward compatibility with single model name."""
    os.environ["LLM_MODEL_NAME"] = "llama-3.3-70b-instruct"
    os.environ["DIGITALOCEAN_INFERENCE_KEY"] = "test-key"
    
    config = load_config()
    
    # Should parse as list with one element
    assert isinstance(config.llm.model_names, list)
    assert len(config.llm.model_names) == 1
    assert config.llm.model_names[0] == "llama-3.3-70b-instruct"
    
    # Backward compatibility property should work
    assert config.llm.model_name == "llama-3.3-70b-instruct"


def test_multiple_model_names():
    """Test parsing comma-separated list of model names."""
    os.environ["LLM_MODEL_NAME"] = "llama-3.3-70b-instruct,llama3-8b-instruct"
    os.environ["DIGITALOCEAN_INFERENCE_KEY"] = "test-key"
    
    config = load_config()
    
    # Should parse as list with two elements
    assert isinstance(config.llm.model_names, list)
    assert len(config.llm.model_names) == 2
    assert config.llm.model_names[0] == "llama-3.3-70b-instruct"
    assert config.llm.model_names[1] == "llama3-8b-instruct"
    
    # Backward compatibility property should return first model
    assert config.llm.model_name == "llama-3.3-70b-instruct"


def test_multiple_model_names_with_spaces():
    """Test parsing handles whitespace correctly."""
    os.environ["LLM_MODEL_NAME"] = "llama-3.3-70b-instruct , llama3-8b-instruct , gemini-1.5-flash"
    os.environ["DIGITALOCEAN_INFERENCE_KEY"] = "test-key"
    
    config = load_config()
    
    # Should strip whitespace from each model name
    assert len(config.llm.model_names) == 3
    assert config.llm.model_names[0] == "llama-3.3-70b-instruct"
    assert config.llm.model_names[1] == "llama3-8b-instruct"
    assert config.llm.model_names[2] == "gemini-1.5-flash"


def test_to_dict_includes_model_names():
    """Test that to_dict includes both model_names and primary_model."""
    os.environ["LLM_MODEL_NAME"] = "llama-3.3-70b-instruct,llama3-8b-instruct"
    os.environ["DIGITALOCEAN_INFERENCE_KEY"] = "test-key"
    
    config = load_config()
    config_dict = config.to_dict()
    
    # Should include both model_names list and primary_model for backward compatibility
    assert "model_names" in config_dict["llm"]
    assert "primary_model" in config_dict["llm"]
    assert config_dict["llm"]["model_names"] == ["llama-3.3-70b-instruct", "llama3-8b-instruct"]
    assert config_dict["llm"]["primary_model"] == "llama-3.3-70b-instruct"


def test_llm_config_validation():
    """Test LLMConfig validation with model_names."""
    # Valid config with multiple models
    config = LLMConfig(
        model_names=["llama-3.3-70b-instruct", "llama3-8b-instruct"],
        temperature=0.7,
        max_tokens=2000,
        timeout_ms=30000,
        api_key="test-key"
    )
    errors = config.validate()
    assert len(errors) == 0
    
    # Invalid config with empty model_names
    config_empty = LLMConfig(
        model_names=[],
        temperature=0.7,
        max_tokens=2000,
        timeout_ms=30000,
        api_key="test-key"
    )
    errors = config_empty.validate()
    assert any("LLM_MODEL_NAME is required" in error for error in errors)
    
    # Invalid config with empty string in model_names
    config_empty_string = LLMConfig(
        model_names=["llama-3.3-70b-instruct", "  ", "llama3-8b-instruct"],
        temperature=0.7,
        max_tokens=2000,
        timeout_ms=30000,
        api_key="test-key"
    )
    errors = config_empty_string.validate()
    assert any("entry 2 is empty" in error for error in errors)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
