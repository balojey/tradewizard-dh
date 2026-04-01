"""Configuration management for TradeWizard DOA replication."""

import os
from dataclasses import dataclass
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


class ConfigurationError(Exception):
    """Raised when configuration validation fails."""
    pass


@dataclass
class PolymarketConfig:
    """Polymarket API configuration."""
    gamma_api_url: str
    clob_api_url: str
    api_key: Optional[str] = None
    
    def validate(self) -> List[str]:
        """Validate Polymarket configuration."""
        errors = []
        
        if not self.gamma_api_url:
            errors.append("POLYMARKET_GAMMA_API_URL is required")
        elif not self.gamma_api_url.startswith(("http://", "https://")):
            errors.append("POLYMARKET_GAMMA_API_URL must be a valid URL")
            
        if not self.clob_api_url:
            errors.append("POLYMARKET_CLOB_API_URL is required")
        elif not self.clob_api_url.startswith(("http://", "https://")):
            errors.append("POLYMARKET_CLOB_API_URL must be a valid URL")
            
        return errors


@dataclass
class NewsDataConfig:
    """NewsData API configuration."""
    api_key: str
    base_url: str = "https://newsdata.io/api/1"
    timeout: int = 30
    is_free_tier: bool = False
    
    def validate(self) -> List[str]:
        """Validate NewsData configuration."""
        errors = []
        
        if not self.api_key:
            errors.append("NEWSDATA_API_KEY is required")
            
        if not self.base_url.startswith(("http://", "https://")):
            errors.append("NEWSDATA_BASE_URL must be a valid URL")
            
        if self.timeout <= 0:
            errors.append("NewsData timeout must be positive")
            
        return errors


@dataclass
class AutonomousAgentConfig:
    """Autonomous agent configuration."""
    max_tool_calls: int
    timeout_ms: int
    cache_enabled: bool
    
    def validate(self) -> List[str]:
        """Validate autonomous agent configuration."""
        errors = []
        
        if self.max_tool_calls <= 0:
            errors.append("MAX_TOOL_CALLS must be positive")
            
        if self.timeout_ms <= 0:
            errors.append("AGENT_TIMEOUT_MS must be positive")
            
        return errors


@dataclass
class LLMConfig:
    """Gradient AI LLM configuration."""
    model_names: List[str]  # List of model names for rotation support
    temperature: float
    max_tokens: int
    timeout_ms: int
    api_key: str
    
    @property
    def model_name(self) -> str:
        """Get primary model name for backward compatibility."""
        return self.model_names[0] if self.model_names else ""
    
    def validate(self) -> List[str]:
        """Validate LLM configuration."""
        errors = []
        
        if not self.api_key:
            errors.append("DIGITALOCEAN_INFERENCE_KEY is required for Gradient AI LLM access")
            
        if not self.model_names or len(self.model_names) == 0:
            errors.append("LLM_MODEL_NAME is required")
        
        # Validate each model name is non-empty
        for i, model in enumerate(self.model_names):
            if not model or not model.strip():
                errors.append(f"LLM_MODEL_NAME entry {i+1} is empty")
            
        if not 0.0 <= self.temperature <= 2.0:
            errors.append("LLM_TEMPERATURE must be between 0.0 and 2.0")
            
        if self.max_tokens <= 0:
            errors.append("LLM_MAX_TOKENS must be positive")
            
        if self.timeout_ms <= 0:
            errors.append("LLM_TIMEOUT_MS must be positive")
            
        return errors


@dataclass
class AgentConfig:
    """Agent execution configuration."""
    timeout_ms: int
    max_retries: int
    enable_mvp_agents: bool
    enable_event_intelligence: bool
    enable_polling_statistical: bool
    enable_sentiment_narrative: bool
    enable_price_action: bool
    enable_event_scenario: bool
    
    def validate(self) -> List[str]:
        """Validate agent configuration."""
        errors = []
        
        if self.timeout_ms <= 0:
            errors.append("AGENT_TIMEOUT_MS must be positive")
            
        if self.max_retries < 0:
            errors.append("AGENT_MAX_RETRIES must be non-negative")
            
        # At least MVP agents should be enabled
        if not self.enable_mvp_agents:
            errors.append("MVP agents (ENABLE_MVP_AGENTS) must be enabled for basic functionality")
            
        return errors


@dataclass
class DatabaseConfig:
    """Supabase/PostgreSQL configuration."""
    supabase_url: Optional[str]
    supabase_key: Optional[str]
    postgres_connection_string: Optional[str]
    enable_persistence: bool
    
    def validate(self) -> List[str]:
        """Validate database configuration."""
        errors = []
        
        if self.enable_persistence:
            # At least one database connection method must be configured
            has_supabase = self.supabase_url and self.supabase_key
            has_postgres = self.postgres_connection_string
            
            if not has_supabase and not has_postgres:
                errors.append(
                    "Database persistence is enabled but no connection configured. "
                    "Provide either SUPABASE_URL + SUPABASE_KEY or POSTGRES_CONNECTION_STRING"
                )
            
            # Validate Supabase URL format if provided
            if self.supabase_url and not self.supabase_url.startswith(("http://", "https://")):
                errors.append("SUPABASE_URL must be a valid URL")
                
        return errors


@dataclass
class ConsensusConfig:
    """Consensus engine configuration."""
    min_agents_required: int
    disagreement_threshold: float
    confidence_band_multiplier: float
    min_edge_threshold: float
    
    def validate(self) -> List[str]:
        """Validate consensus configuration."""
        errors = []
        
        if self.min_agents_required < 1:
            errors.append("CONSENSUS_MIN_AGENTS must be at least 1")
            
        if not 0.0 <= self.disagreement_threshold <= 1.0:
            errors.append("CONSENSUS_DISAGREEMENT_THRESHOLD must be between 0.0 and 1.0")
            
        if self.confidence_band_multiplier <= 0:
            errors.append("CONSENSUS_CONFIDENCE_BAND_MULTIPLIER must be positive")
            
        if not 0.0 <= self.min_edge_threshold <= 1.0:
            errors.append("MIN_EDGE_THRESHOLD must be between 0.0 and 1.0")
            
        return errors


@dataclass
class MemorySystemConfig:
    """Memory retrieval configuration."""
    enable_memory: bool
    max_historical_signals: int
    memory_timeout_ms: int
    
    def validate(self) -> List[str]:
        """Validate memory system configuration."""
        errors = []
        
        if self.max_historical_signals < 0:
            errors.append("MAX_HISTORICAL_SIGNALS must be non-negative")
            
        if self.memory_timeout_ms <= 0:
            errors.append("MEMORY_TIMEOUT_MS must be positive")
            
        return errors


@dataclass
class SerperConfig:
    """Serper API configuration."""
    api_key: str
    search_url: str = "https://google.serper.dev/search"
    scrape_url: str = "https://scrape.serper.dev"
    timeout: int = 30
    retry_attempts: int = 3
    retry_delay: float = 1.0
    
    def validate(self) -> List[str]:
        """Validate Serper configuration."""
        errors = []
        
        if not self.api_key:
            errors.append("SERPER_API_KEY is required for web research")
        
        if not self.search_url.startswith(("http://", "https://")):
            errors.append("SERPER_SEARCH_URL must be a valid URL")
        
        if not self.scrape_url.startswith(("http://", "https://")):
            errors.append("SERPER_SCRAPE_URL must be a valid URL")
        
        if self.timeout <= 0:
            errors.append("SERPER_TIMEOUT must be positive")
        
        if self.retry_attempts < 0:
            errors.append("SERPER_RETRY_ATTEMPTS must be non-negative")
        
        if self.retry_delay < 0:
            errors.append("SERPER_RETRY_DELAY must be non-negative")
        
        return errors


@dataclass
class WebResearchConfig:
    """Web Research Agent configuration."""
    enabled: bool
    max_tool_calls: int
    timeout: int
    
    def validate(self) -> List[str]:
        """Validate Web Research configuration."""
        errors = []
        
        if self.max_tool_calls <= 0:
            errors.append("WEB_RESEARCH_MAX_TOOL_CALLS must be positive")
        
        if self.timeout <= 0:
            errors.append("WEB_RESEARCH_TIMEOUT must be positive")
        
        return errors


@dataclass
class OpikConfig:
    """Opik observability configuration."""
    api_key: Optional[str]
    project_name: str
    workspace: Optional[str]
    base_url: Optional[str]
    track_costs: bool
    
    def validate(self) -> List[str]:
        """Validate Opik configuration."""
        errors = []
        
        if self.api_key and not self.api_key.strip():
            errors.append("OPIK_API_KEY must be non-empty if provided")
        
        if not self.project_name or not self.project_name.strip():
            errors.append("OPIK_PROJECT_NAME is required")
        
        if self.base_url and not self.base_url.startswith(("http://", "https://")):
            errors.append("OPIK_BASE_URL must be a valid URL")
        
        return errors
    
    def is_enabled(self) -> bool:
        """Check if Opik tracking is enabled."""
        return bool(self.api_key and self.api_key.strip())


@dataclass
class LangGraphConfig:
    """LangGraph workflow configuration."""
    checkpointer_type: str  # "memory", "sqlite", "postgres"
    sqlite_path: Optional[str]
    recursion_limit: int  # Maximum number of workflow steps before raising recursion error
    
    def validate(self) -> List[str]:
        """Validate LangGraph configuration."""
        errors = []
        
        valid_checkpointers = ["memory", "sqlite", "postgres"]
        if self.checkpointer_type not in valid_checkpointers:
            errors.append(
                f"LANGGRAPH_CHECKPOINTER must be one of: {', '.join(valid_checkpointers)}"
            )
            
        if self.checkpointer_type == "sqlite" and not self.sqlite_path:
            errors.append("LANGGRAPH_SQLITE_PATH is required when using sqlite checkpointer")
        
        if self.recursion_limit < 1:
            errors.append("LANGGRAPH_RECURSION_LIMIT must be at least 1")
            
        return errors


@dataclass
class EngineConfig:
    """Main engine configuration."""
    polymarket: PolymarketConfig
    langgraph: LangGraphConfig
    llm: LLMConfig
    agents: AgentConfig
    consensus: ConsensusConfig
    database: DatabaseConfig
    memory_system: MemorySystemConfig
    newsdata: NewsDataConfig
    autonomous_agents: AutonomousAgentConfig
    opik: OpikConfig
    serper: Optional[SerperConfig]
    web_research: WebResearchConfig

    def validate(self) -> None:
        """
        Validate all configuration sections.

        Raises:
            ConfigurationError: If any validation errors are found
        """
        all_errors = []

        # Validate each configuration section
        all_errors.extend(self.polymarket.validate())
        all_errors.extend(self.langgraph.validate())
        all_errors.extend(self.llm.validate())
        all_errors.extend(self.agents.validate())
        all_errors.extend(self.consensus.validate())
        all_errors.extend(self.database.validate())
        all_errors.extend(self.memory_system.validate())
        all_errors.extend(self.newsdata.validate())
        all_errors.extend(self.autonomous_agents.validate())
        all_errors.extend(self.opik.validate())
        
        # Validate Serper if configured
        if self.serper:
            all_errors.extend(self.serper.validate())
        
        # Validate Web Research
        all_errors.extend(self.web_research.validate())

        if all_errors:
            error_message = "Configuration validation failed:\n" + "\n".join(
                f"  - {error}" for error in all_errors
            )
            raise ConfigurationError(error_message)

    def to_dict(self) -> Dict[str, Any]:
        """Convert configuration to dictionary for logging/debugging."""
        return {
            "polymarket": {
                "gamma_api_url": self.polymarket.gamma_api_url,
                "clob_api_url": self.polymarket.clob_api_url,
                "api_key_configured": bool(self.polymarket.api_key),
            },
            "langgraph": {
                "checkpointer_type": self.langgraph.checkpointer_type,
                "sqlite_path": self.langgraph.sqlite_path,
                "recursion_limit": self.langgraph.recursion_limit,
            },
            "llm": {
                "model_names": self.llm.model_names,
                "primary_model": self.llm.model_name,  # For backward compatibility
                "temperature": self.llm.temperature,
                "max_tokens": self.llm.max_tokens,
                "timeout_ms": self.llm.timeout_ms,
                "api_key_configured": bool(self.llm.api_key),
            },
            "agents": {
                "timeout_ms": self.agents.timeout_ms,
                "max_retries": self.agents.max_retries,
                "enabled_agent_groups": {
                    "mvp": self.agents.enable_mvp_agents,
                    "event_intelligence": self.agents.enable_event_intelligence,
                    "polling_statistical": self.agents.enable_polling_statistical,
                    "sentiment_narrative": self.agents.enable_sentiment_narrative,
                    "price_action": self.agents.enable_price_action,
                    "event_scenario": self.agents.enable_event_scenario,
                },
            },
            "consensus": {
                "min_agents_required": self.consensus.min_agents_required,
                "disagreement_threshold": self.consensus.disagreement_threshold,
                "confidence_band_multiplier": self.consensus.confidence_band_multiplier,
                "min_edge_threshold": self.consensus.min_edge_threshold,
            },
            "database": {
                "enable_persistence": self.database.enable_persistence,
                "supabase_configured": bool(self.database.supabase_url and self.database.supabase_key),
                "postgres_configured": bool(self.database.postgres_connection_string),
            },
            "memory_system": {
                "enable_memory": self.memory_system.enable_memory,
                "max_historical_signals": self.memory_system.max_historical_signals,
                "memory_timeout_ms": self.memory_system.memory_timeout_ms,
            },
            "newsdata": {
                "api_key_configured": bool(self.newsdata.api_key),
                "base_url": self.newsdata.base_url,
                "timeout": self.newsdata.timeout,
                "is_free_tier": self.newsdata.is_free_tier,
            },
            "autonomous_agents": {
                "max_tool_calls": self.autonomous_agents.max_tool_calls,
                "timeout_ms": self.autonomous_agents.timeout_ms,
                "cache_enabled": self.autonomous_agents.cache_enabled,
            },
            "opik": {
                "enabled": self.opik.is_enabled(),
                "project_name": self.opik.project_name,
                "workspace": self.opik.workspace,
                "base_url": self.opik.base_url,
                "track_costs": self.opik.track_costs,
                "api_key_configured": bool(self.opik.api_key),
            },
            "serper": {
                "api_key_configured": bool(self.serper and self.serper.api_key),
                "search_url": self.serper.search_url if self.serper else None,
                "scrape_url": self.serper.scrape_url if self.serper else None,
                "timeout": self.serper.timeout if self.serper else None,
            } if self.serper else None,
            "web_research": {
                "enabled": self.web_research.enabled,
                "max_tool_calls": self.web_research.max_tool_calls,
                "timeout": self.web_research.timeout,
            },
        }


def load_config() -> EngineConfig:
    """
    Load configuration from environment variables.
    
    Returns:
        EngineConfig with all settings loaded and validated
        
    Raises:
        ConfigurationError: If required configuration is missing or invalid
    """
    # Check for critical required environment variables first
    api_key = os.getenv("DIGITALOCEAN_INFERENCE_KEY")
    if not api_key:
        raise ConfigurationError(
            "Missing required configuration: DIGITALOCEAN_INFERENCE_KEY\n"
            "  This is required for Gradient AI LLM access.\n"
            "  Please set it in your .env file or environment variables."
        )
    
    # Polymarket configuration
    polymarket = PolymarketConfig(
        gamma_api_url=os.getenv("POLYMARKET_GAMMA_API_URL", "https://gamma-api.polymarket.com"),
        clob_api_url=os.getenv("POLYMARKET_CLOB_API_URL", "https://clob.polymarket.com"),
        api_key=os.getenv("POLYMARKET_API_KEY")
    )
    
    # LangGraph configuration
    langgraph = LangGraphConfig(
        checkpointer_type=os.getenv("LANGGRAPH_CHECKPOINTER", "memory"),
        sqlite_path=os.getenv("LANGGRAPH_SQLITE_PATH", "./checkpoints.db"),
        recursion_limit=int(os.getenv("LANGGRAPH_RECURSION_LIMIT", "100"))
    )
    
    # LLM configuration
    try:
        temperature = float(os.getenv("LLM_TEMPERATURE", "0.7"))
        max_tokens = int(os.getenv("LLM_MAX_TOKENS", "2000"))
        timeout_ms = int(os.getenv("LLM_TIMEOUT_MS", "30000"))
    except ValueError as e:
        raise ConfigurationError(
            f"Invalid numeric configuration value: {e}\n"
            "  Please check LLM_TEMPERATURE, LLM_MAX_TOKENS, and LLM_TIMEOUT_MS"
        )
    
    # Parse model names - support comma-separated list for rotation
    model_name_str = os.getenv("LLM_MODEL_NAME", "llama-3.3-70b-instruct")
    model_names = [name.strip() for name in model_name_str.split(",") if name.strip()]
    
    llm = LLMConfig(
        model_names=model_names,
        temperature=temperature,
        max_tokens=max_tokens,
        timeout_ms=timeout_ms,
        api_key=api_key
    )
    
    # Agent configuration
    try:
        agent_timeout = int(os.getenv("AGENT_TIMEOUT_MS", "45000"))
        max_retries = int(os.getenv("AGENT_MAX_RETRIES", "3"))
    except ValueError as e:
        raise ConfigurationError(
            f"Invalid numeric configuration value: {e}\n"
            "  Please check AGENT_TIMEOUT_MS and AGENT_MAX_RETRIES"
        )
    
    agents = AgentConfig(
        timeout_ms=agent_timeout,
        max_retries=max_retries,
        enable_mvp_agents=os.getenv("ENABLE_MVP_AGENTS", "true").lower() == "true",
        enable_event_intelligence=os.getenv("ENABLE_EVENT_INTELLIGENCE", "true").lower() == "true",
        enable_polling_statistical=os.getenv("ENABLE_POLLING_STATISTICAL", "true").lower() == "true",
        enable_sentiment_narrative=os.getenv("ENABLE_SENTIMENT_NARRATIVE", "true").lower() == "true",
        enable_price_action=os.getenv("ENABLE_PRICE_ACTION", "true").lower() == "true",
        enable_event_scenario=os.getenv("ENABLE_EVENT_SCENARIO", "true").lower() == "true"
    )
    
    # Consensus configuration
    try:
        min_agents = int(os.getenv("CONSENSUS_MIN_AGENTS", "3"))
        disagreement_threshold = float(os.getenv("CONSENSUS_DISAGREEMENT_THRESHOLD", "0.15"))
        confidence_band_multiplier = float(os.getenv("CONSENSUS_CONFIDENCE_BAND_MULTIPLIER", "1.96"))
        min_edge_threshold = float(os.getenv("MIN_EDGE_THRESHOLD", "0.05"))
    except ValueError as e:
        raise ConfigurationError(
            f"Invalid numeric configuration value: {e}\n"
            "  Please check consensus configuration values"
        )
    
    consensus = ConsensusConfig(
        min_agents_required=min_agents,
        disagreement_threshold=disagreement_threshold,
        confidence_band_multiplier=confidence_band_multiplier,
        min_edge_threshold=min_edge_threshold
    )
    
    # Database configuration
    database = DatabaseConfig(
        supabase_url=os.getenv("SUPABASE_URL"),
        supabase_key=os.getenv("SUPABASE_KEY"),
        postgres_connection_string=os.getenv("POSTGRES_CONNECTION_STRING"),
        enable_persistence=os.getenv("ENABLE_PERSISTENCE", "true").lower() == "true"
    )
    
    # Memory system configuration
    try:
        max_historical = int(os.getenv("MAX_HISTORICAL_SIGNALS", "3"))
        memory_timeout = int(os.getenv("MEMORY_TIMEOUT_MS", "5000"))
    except ValueError as e:
        raise ConfigurationError(
            f"Invalid numeric configuration value: {e}\n"
            "  Please check MAX_HISTORICAL_SIGNALS and MEMORY_TIMEOUT_MS"
        )
    
    memory_system = MemorySystemConfig(
        enable_memory=os.getenv("ENABLE_MEMORY", "true").lower() == "true",
        max_historical_signals=max_historical,
        memory_timeout_ms=memory_timeout
    )
    
    # NewsData configuration
    newsdata = NewsDataConfig(
        api_key=os.getenv("NEWSDATA_API_KEY", ""),
        base_url=os.getenv("NEWSDATA_BASE_URL", "https://newsdata.io/api/1"),
        timeout=int(os.getenv("NEWSDATA_TIMEOUT", "30")),
        is_free_tier=os.getenv("NEWSDATA_FREE_TIER", "false").lower() == "true"
    )
    
    # Autonomous agent configuration
    try:
        max_tool_calls = int(os.getenv("MAX_TOOL_CALLS", "5"))
        autonomous_timeout = int(os.getenv("AUTONOMOUS_AGENT_TIMEOUT_MS", str(agent_timeout)))
        cache_enabled = os.getenv("TOOL_CACHE_ENABLED", "true").lower() == "true"
    except ValueError as e:
        raise ConfigurationError(
            f"Invalid numeric configuration value: {e}\n"
            "  Please check MAX_TOOL_CALLS and AUTONOMOUS_AGENT_TIMEOUT_MS"
        )
    
    autonomous_agents = AutonomousAgentConfig(
        max_tool_calls=max_tool_calls,
        timeout_ms=autonomous_timeout,
        cache_enabled=cache_enabled
    )
    
    # Opik configuration
    opik = OpikConfig(
        api_key=os.getenv("OPIK_API_KEY"),
        project_name=os.getenv("OPIK_PROJECT_NAME", "doa-market-analysis"),
        workspace=os.getenv("OPIK_WORKSPACE"),
        base_url=os.getenv("OPIK_URL_OVERRIDE"),
        track_costs=os.getenv("OPIK_TRACK_COSTS", "true").lower() == "true"
    )
    
    # Serper configuration (optional)
    serper = None
    if os.getenv("SERPER_API_KEY"):
        serper = SerperConfig(
            api_key=os.getenv("SERPER_API_KEY"),
            search_url=os.getenv("SERPER_SEARCH_URL", "https://google.serper.dev/search"),
            scrape_url=os.getenv("SERPER_SCRAPE_URL", "https://scrape.serper.dev"),
            timeout=int(os.getenv("SERPER_TIMEOUT", "30"))
        )
    
    # Web Research configuration
    web_research = WebResearchConfig(
        enabled=os.getenv("WEB_RESEARCH_ENABLED", "true").lower() == "true",
        max_tool_calls=int(os.getenv("WEB_RESEARCH_MAX_TOOL_CALLS", "8")),
        timeout=int(os.getenv("WEB_RESEARCH_TIMEOUT", "60"))
    )
    
    # Create and validate configuration
    config = EngineConfig(
        polymarket=polymarket,
        langgraph=langgraph,
        llm=llm,
        agents=agents,
        consensus=consensus,
        database=database,
        memory_system=memory_system,
        newsdata=newsdata,
        autonomous_agents=autonomous_agents,
        opik=opik,
        serper=serper,
        web_research=web_research
    )
    
    # Validate all configuration
    config.validate()
    
    return config
