"""Tests for configuration validation."""

import pytest
import os
from config import (
    PolymarketConfig,
    LLMConfig,
    AgentConfig,
    DatabaseConfig,
    ConsensusConfig,
    MemorySystemConfig,
    LangGraphConfig,
    NewsDataConfig,
    AutonomousAgentConfig,
    OpikConfig,
    EngineConfig,
    ConfigurationError,
    load_config,
)


def test_polymarket_config_validation():
    """Test Polymarket configuration validation."""
    # Valid configuration
    config = PolymarketConfig(
        gamma_api_url="https://gamma-api.polymarket.com",
        clob_api_url="https://clob.polymarket.com",
    )
    assert config.validate() == []
    
    # Invalid URL
    config = PolymarketConfig(
        gamma_api_url="not-a-url",
        clob_api_url="https://clob.polymarket.com",
    )
    errors = config.validate()
    assert len(errors) > 0
    assert any("valid URL" in error for error in errors)


def test_llm_config_validation():
    """Test LLM configuration validation."""
    # Valid configuration with single model
    config = LLMConfig(
        model_names=["llama-3.3-70b-instruct"],
        temperature=0.7,
        max_tokens=2000,
        timeout_ms=30000,
        api_key="test-key",
    )
    assert config.validate() == []
    
    # Valid configuration with multiple models
    config = LLMConfig(
        model_names=["llama-3.3-70b-instruct", "llama3-8b-instruct"],
        temperature=0.7,
        max_tokens=2000,
        timeout_ms=30000,
        api_key="test-key",
    )
    assert config.validate() == []
    
    # Test backward compatibility property
    assert config.model_name == "llama-3.3-70b-instruct"
    
    # Missing API key
    config = LLMConfig(
        model_names=["llama-3.3-70b-instruct"],
        temperature=0.7,
        max_tokens=2000,
        timeout_ms=30000,
        api_key="",
    )
    errors = config.validate()
    assert len(errors) > 0
    assert any("DIGITALOCEAN_INFERENCE_KEY" in error for error in errors)
    
    # Empty model names list
    config = LLMConfig(
        model_names=[],
        temperature=0.7,
        max_tokens=2000,
        timeout_ms=30000,
        api_key="test-key",
    )
    errors = config.validate()
    assert len(errors) > 0
    assert any("LLM_MODEL_NAME is required" in error for error in errors)
    
    # Empty string in model names
    config = LLMConfig(
        model_names=["llama-3.3-70b-instruct", ""],
        temperature=0.7,
        max_tokens=2000,
        timeout_ms=30000,
        api_key="test-key",
    )
    errors = config.validate()
    assert len(errors) > 0
    assert any("entry" in error and "empty" in error for error in errors)
    
    # Invalid temperature
    config = LLMConfig(
        model_names=["llama-3.3-70b-instruct"],
        temperature=3.0,
        max_tokens=2000,
        timeout_ms=30000,
        api_key="test-key",
    )
    errors = config.validate()
    assert len(errors) > 0
    assert any("temperature" in error.lower() for error in errors)


def test_agent_config_validation():
    """Test agent configuration validation."""
    # Valid configuration
    config = AgentConfig(
        timeout_ms=45000,
        max_retries=3,
        enable_mvp_agents=True,
        enable_event_intelligence=True,
        enable_polling_statistical=True,
        enable_sentiment_narrative=True,
        enable_price_action=True,
        enable_event_scenario=True,
    )
    assert config.validate() == []
    
    # MVP agents disabled
    config = AgentConfig(
        timeout_ms=45000,
        max_retries=3,
        enable_mvp_agents=False,
        enable_event_intelligence=True,
        enable_polling_statistical=True,
        enable_sentiment_narrative=True,
        enable_price_action=True,
        enable_event_scenario=True,
    )
    errors = config.validate()
    assert len(errors) > 0
    assert any("MVP agents" in error for error in errors)


def test_database_config_validation():
    """Test database configuration validation."""
    # Valid configuration with Supabase
    config = DatabaseConfig(
        supabase_url="https://example.supabase.co",
        supabase_key="test-key",
        postgres_connection_string=None,
        enable_persistence=True,
    )
    assert config.validate() == []
    
    # Valid configuration with PostgreSQL
    config = DatabaseConfig(
        supabase_url=None,
        supabase_key=None,
        postgres_connection_string="postgresql://user:pass@localhost:5432/db",
        enable_persistence=True,
    )
    assert config.validate() == []
    
    # Persistence enabled but no connection
    config = DatabaseConfig(
        supabase_url=None,
        supabase_key=None,
        postgres_connection_string=None,
        enable_persistence=True,
    )
    errors = config.validate()
    assert len(errors) > 0
    assert any("no connection configured" in error for error in errors)
    
    # Persistence disabled - no errors
    config = DatabaseConfig(
        supabase_url=None,
        supabase_key=None,
        postgres_connection_string=None,
        enable_persistence=False,
    )
    assert config.validate() == []


def test_consensus_config_validation():
    """Test consensus configuration validation."""
    # Valid configuration
    config = ConsensusConfig(
        min_agents_required=3,
        disagreement_threshold=0.15,
        confidence_band_multiplier=1.96,
        min_edge_threshold=0.05,
    )
    assert config.validate() == []
    
    # Invalid min_agents
    config = ConsensusConfig(
        min_agents_required=0,
        disagreement_threshold=0.15,
        confidence_band_multiplier=1.96,
        min_edge_threshold=0.05,
    )
    errors = config.validate()
    assert len(errors) > 0
    assert any("CONSENSUS_MIN_AGENTS" in error for error in errors)


def test_langgraph_config_validation():
    """Test LangGraph configuration validation."""
    # Valid memory checkpointer
    config = LangGraphConfig(
        checkpointer_type="memory",
        sqlite_path=None,
    )
    assert config.validate() == []
    
    # Valid sqlite checkpointer
    config = LangGraphConfig(
        checkpointer_type="sqlite",
        sqlite_path="./checkpoints.db",
    )
    assert config.validate() == []
    
    # Invalid checkpointer type
    config = LangGraphConfig(
        checkpointer_type="invalid",
        sqlite_path=None,
    )
    errors = config.validate()
    assert len(errors) > 0
    assert any("LANGGRAPH_CHECKPOINTER" in error for error in errors)
    
    # SQLite without path
    config = LangGraphConfig(
        checkpointer_type="sqlite",
        sqlite_path=None,
    )
    errors = config.validate()
    assert len(errors) > 0
    assert any("LANGGRAPH_SQLITE_PATH" in error for error in errors)


def test_engine_config_validation():
    """Test full engine configuration validation."""
    # Create valid configuration
    config = EngineConfig(
        polymarket=PolymarketConfig(
            gamma_api_url="https://gamma-api.polymarket.com",
            clob_api_url="https://clob.polymarket.com",
        ),
        langgraph=LangGraphConfig(
            checkpointer_type="memory",
            sqlite_path=None,
        ),
        llm=LLMConfig(
            model_names=["llama-3.3-70b-instruct"],
            temperature=0.7,
            max_tokens=2000,
            timeout_ms=30000,
            api_key="test-key",
        ),
        agents=AgentConfig(
            timeout_ms=45000,
            max_retries=3,
            enable_mvp_agents=True,
            enable_event_intelligence=True,
            enable_polling_statistical=True,
            enable_sentiment_narrative=True,
            enable_price_action=True,
            enable_event_scenario=True,
        ),
        consensus=ConsensusConfig(
            min_agents_required=3,
            disagreement_threshold=0.15,
            confidence_band_multiplier=1.96,
            min_edge_threshold=0.05,
        ),
        database=DatabaseConfig(
            supabase_url=None,
            supabase_key=None,
            postgres_connection_string=None,
            enable_persistence=False,
        ),
        memory_system=MemorySystemConfig(
            enable_memory=True,
            max_historical_signals=3,
            memory_timeout_ms=5000,
        ),
        newsdata=NewsDataConfig(
            api_key="test-key",
            base_url="https://newsdata.io/api/1",
            timeout=30,
        ),
        autonomous_agents=AutonomousAgentConfig(
            max_tool_calls=10,
            timeout_ms=30000,
            cache_enabled=True,
        ),
        opik=OpikConfig(
            api_key=None,
            project_name="test-project",
            workspace=None,
            base_url=None,
            track_costs=True,
        ),
    )
    
    # Should not raise
    config.validate()


def test_engine_config_validation_with_errors():
    """Test engine configuration validation catches errors."""
    # Create configuration with multiple errors
    config = EngineConfig(
        polymarket=PolymarketConfig(
            gamma_api_url="not-a-url",
            clob_api_url="https://clob.polymarket.com",
        ),
        langgraph=LangGraphConfig(
            checkpointer_type="invalid",
            sqlite_path=None,
        ),
        llm=LLMConfig(
            model_names=["llama-3.3-70b-instruct"],
            temperature=3.0,  # Invalid
            max_tokens=2000,
            timeout_ms=30000,
            api_key="",  # Missing
        ),
        agents=AgentConfig(
            timeout_ms=45000,
            max_retries=3,
            enable_mvp_agents=False,  # Invalid
            enable_event_intelligence=True,
            enable_polling_statistical=True,
            enable_sentiment_narrative=True,
            enable_price_action=True,
            enable_event_scenario=True,
        ),
        consensus=ConsensusConfig(
            min_agents_required=3,
            disagreement_threshold=0.15,
            confidence_band_multiplier=1.96,
            min_edge_threshold=0.05,
        ),
        database=DatabaseConfig(
            supabase_url=None,
            supabase_key=None,
            postgres_connection_string=None,
            enable_persistence=False,
        ),
        memory_system=MemorySystemConfig(
            enable_memory=True,
            max_historical_signals=3,
            memory_timeout_ms=5000,
        ),
        newsdata=NewsDataConfig(
            api_key="test-key",
            base_url="https://newsdata.io/api/1",
            timeout=30,
        ),
        autonomous_agents=AutonomousAgentConfig(
            max_tool_calls=10,
            timeout_ms=30000,
            cache_enabled=True,
        ),
        opik=OpikConfig(
            api_key=None,
            project_name="test-project",
            workspace=None,
            base_url=None,
            track_costs=True,
        ),
    )
    
    # Should raise ConfigurationError
    with pytest.raises(ConfigurationError) as exc_info:
        config.validate()
    
    error_message = str(exc_info.value)
    assert "Configuration validation failed" in error_message
    assert "valid URL" in error_message
    assert "LANGGRAPH_CHECKPOINTER" in error_message
    assert "temperature" in error_message.lower()
    assert "MVP agents" in error_message


def test_engine_config_to_dict():
    """Test configuration serialization to dictionary."""
    config = EngineConfig(
        polymarket=PolymarketConfig(
            gamma_api_url="https://gamma-api.polymarket.com",
            clob_api_url="https://clob.polymarket.com",
            api_key="secret-key",
        ),
        langgraph=LangGraphConfig(
            checkpointer_type="memory",
            sqlite_path=None,
        ),
        llm=LLMConfig(
            model_names=["llama-3.3-70b-instruct", "llama3-8b-instruct"],
            temperature=0.7,
            max_tokens=2000,
            timeout_ms=30000,
            api_key="test-key",
        ),
        agents=AgentConfig(
            timeout_ms=45000,
            max_retries=3,
            enable_mvp_agents=True,
            enable_event_intelligence=True,
            enable_polling_statistical=True,
            enable_sentiment_narrative=True,
            enable_price_action=True,
            enable_event_scenario=True,
        ),
        consensus=ConsensusConfig(
            min_agents_required=3,
            disagreement_threshold=0.15,
            confidence_band_multiplier=1.96,
            min_edge_threshold=0.05,
        ),
        database=DatabaseConfig(
            supabase_url="https://example.supabase.co",
            supabase_key="secret-key",
            postgres_connection_string=None,
            enable_persistence=True,
        ),
        memory_system=MemorySystemConfig(
            enable_memory=True,
            max_historical_signals=3,
            memory_timeout_ms=5000,
        ),
        newsdata=NewsDataConfig(
            api_key="test-key",
            base_url="https://newsdata.io/api/1",
            timeout=30,
        ),
        autonomous_agents=AutonomousAgentConfig(
            max_tool_calls=10,
            timeout_ms=30000,
            cache_enabled=True,
        ),
        opik=OpikConfig(
            api_key="test-opik-key",
            project_name="test-project",
            workspace="test-workspace",
            base_url=None,
            track_costs=True,
        ),
    )
    
    config_dict = config.to_dict()
    
    # Check structure
    assert "polymarket" in config_dict
    assert "llm" in config_dict
    assert "agents" in config_dict
    assert "database" in config_dict
    
    # Check sensitive data is masked
    assert config_dict["polymarket"]["api_key_configured"] is True
    assert "secret-key" not in str(config_dict)
    
    # Check values are present
    assert config_dict["llm"]["model_names"] == ["llama-3.3-70b-instruct", "llama3-8b-instruct"]
    assert config_dict["llm"]["primary_model"] == "llama-3.3-70b-instruct"
    assert config_dict["agents"]["timeout_ms"] == 45000
    assert config_dict["database"]["enable_persistence"] is True


def test_load_config_missing_required():
    """Test that load_config raises error when required env vars are missing."""
    # Save current env
    original_key = os.environ.get("DIGITALOCEAN_INFERENCE_KEY")
    
    # Remove required key
    if "DIGITALOCEAN_INFERENCE_KEY" in os.environ:
        del os.environ["DIGITALOCEAN_INFERENCE_KEY"]
    
    try:
        with pytest.raises(ConfigurationError) as exc_info:
            load_config()
        
        error_message = str(exc_info.value)
        assert "DIGITALOCEAN_INFERENCE_KEY" in error_message
    finally:
        # Restore env
        if original_key:
            os.environ["DIGITALOCEAN_INFERENCE_KEY"] = original_key


def test_load_config_with_valid_env():
    """Test that load_config works with valid environment variables."""
    # Set required environment variables
    os.environ["DIGITALOCEAN_INFERENCE_KEY"] = "test-key"
    os.environ["POLYMARKET_GAMMA_API_URL"] = "https://gamma-api.polymarket.com"
    os.environ["POLYMARKET_CLOB_API_URL"] = "https://clob.polymarket.com"
    os.environ["ENABLE_PERSISTENCE"] = "false"  # Disable to avoid DB requirement
    
    try:
        config = load_config()
        
        # Verify configuration loaded
        assert config.llm.api_key == "test-key"
        assert config.polymarket.gamma_api_url == "https://gamma-api.polymarket.com"
        assert config.database.enable_persistence is False
    finally:
        # Clean up
        pass


def test_load_config_with_multiple_models():
    """Test that load_config parses comma-separated model names."""
    # Set required environment variables
    os.environ["DIGITALOCEAN_INFERENCE_KEY"] = "test-key"
    os.environ["LLM_MODEL_NAME"] = "llama-3.3-70b-instruct,llama3-8b-instruct,llama-3.1-8b-instruct"
    os.environ["POLYMARKET_GAMMA_API_URL"] = "https://gamma-api.polymarket.com"
    os.environ["POLYMARKET_CLOB_API_URL"] = "https://clob.polymarket.com"
    os.environ["ENABLE_PERSISTENCE"] = "false"
    
    try:
        config = load_config()
        
        # Verify multiple models parsed correctly
        assert len(config.llm.model_names) == 3
        assert config.llm.model_names[0] == "llama-3.3-70b-instruct"
        assert config.llm.model_names[1] == "llama3-8b-instruct"
        assert config.llm.model_names[2] == "llama-3.1-8b-instruct"
        
        # Verify backward compatibility property
        assert config.llm.model_name == "llama-3.3-70b-instruct"
    finally:
        # Clean up
        if "LLM_MODEL_NAME" in os.environ:
            del os.environ["LLM_MODEL_NAME"]


def test_load_config_with_single_model():
    """Test that load_config works with single model (backward compatibility)."""
    # Set required environment variables
    os.environ["DIGITALOCEAN_INFERENCE_KEY"] = "test-key"
    os.environ["LLM_MODEL_NAME"] = "llama-3.3-70b-instruct"
    os.environ["POLYMARKET_GAMMA_API_URL"] = "https://gamma-api.polymarket.com"
    os.environ["POLYMARKET_CLOB_API_URL"] = "https://clob.polymarket.com"
    os.environ["ENABLE_PERSISTENCE"] = "false"
    
    try:
        config = load_config()
        
        # Verify single model parsed correctly
        assert len(config.llm.model_names) == 1
        assert config.llm.model_names[0] == "llama-3.3-70b-instruct"
        assert config.llm.model_name == "llama-3.3-70b-instruct"
    finally:
        # Clean up
        if "LLM_MODEL_NAME" in os.environ:
            del os.environ["LLM_MODEL_NAME"]


def test_load_config_with_whitespace_in_models():
    """Test that load_config handles whitespace in comma-separated models."""
    # Set required environment variables
    os.environ["DIGITALOCEAN_INFERENCE_KEY"] = "test-key"
    os.environ["LLM_MODEL_NAME"] = " llama-3.3-70b-instruct , llama3-8b-instruct , llama-3.1-8b-instruct "
    os.environ["POLYMARKET_GAMMA_API_URL"] = "https://gamma-api.polymarket.com"
    os.environ["POLYMARKET_CLOB_API_URL"] = "https://clob.polymarket.com"
    os.environ["ENABLE_PERSISTENCE"] = "false"
    
    try:
        config = load_config()
        
        # Verify whitespace is stripped
        assert len(config.llm.model_names) == 3
        assert config.llm.model_names[0] == "llama-3.3-70b-instruct"
        assert config.llm.model_names[1] == "llama3-8b-instruct"
        assert config.llm.model_names[2] == "llama-3.1-8b-instruct"
    finally:
        # Clean up
        if "LLM_MODEL_NAME" in os.environ:
            del os.environ["LLM_MODEL_NAME"]
