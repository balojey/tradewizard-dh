"""Pydantic data models for TradeWizard DOA replication."""

from typing import Any, Dict, List, Literal, Optional, Tuple
from pydantic import BaseModel, Field


# ============================================================================
# Supporting Types
# ============================================================================

class EventContext(BaseModel):
    """Context about the event containing the market."""
    event_id: str
    event_title: str
    event_description: str
    related_markets: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)


class StreamlinedEventMetadata(BaseModel):
    """Streamlined metadata for market events."""
    market_id: str
    condition_id: str
    created_at: int  # Unix timestamp
    last_updated: int  # Unix timestamp
    source: str = "polymarket"
    version: str = "1.0"


class TradeExplanation(BaseModel):
    """Explanation for a trade recommendation."""
    summary: str
    core_thesis: str
    key_catalysts: List[str]
    failure_scenarios: List[str]


class TradeMetadata(BaseModel):
    """Metadata for a trade recommendation."""
    consensus_probability: float
    market_probability: float
    edge: float
    confidence_band: Tuple[float, float]
    disagreement_index: float
    regime: Literal["high-confidence", "moderate-confidence", "high-uncertainty"]
    analysis_timestamp: int  # Unix timestamp
    agent_count: int


# ============================================================================
# Core Data Models
# ============================================================================

class MarketBriefingDocument(BaseModel):
    """Primary input to all intelligence agents."""
    market_id: str
    condition_id: str
    event_type: Literal["election", "policy", "court", "geopolitical", "economic", "other"]
    question: str
    resolution_criteria: str
    expiry_timestamp: int
    current_probability: float = Field(ge=0.0, le=1.0)
    liquidity_score: float = Field(ge=0.0, le=10.0)
    bid_ask_spread: float  # in cents
    volatility_regime: Literal["low", "medium", "high"]
    volume_24h: float
    
    # Event context (optional)
    event_context: Optional[EventContext] = None
    
    # Keywords
    keywords: Optional[List[str]] = None
    
    # Metadata
    metadata: StreamlinedEventMetadata


class AgentSignal(BaseModel):
    """Output from an intelligence agent."""
    agent_name: str
    timestamp: int
    confidence: float = Field(ge=0.0, le=1.0)
    direction: Literal["YES", "NO", "NEUTRAL"]
    fair_probability: float = Field(ge=0.0, le=1.0)
    key_drivers: List[str]  # Top 3-5 factors
    risk_factors: List[str]  # Identified risks
    metadata: Dict[str, Any] = Field(default_factory=dict)


class Thesis(BaseModel):
    """Structured argument for or against an outcome."""
    direction: Literal["YES", "NO"]
    fair_probability: float = Field(ge=0.0, le=1.0)
    market_probability: float = Field(ge=0.0, le=1.0)
    edge: float  # |fair - market|
    core_argument: str
    catalysts: List[str]
    failure_conditions: List[str]
    supporting_signals: List[str]  # Agent names


class DebateTest(BaseModel):
    """Individual debate test result."""
    test_type: Literal["evidence", "causality", "timing", "liquidity", "tail-risk"]
    claim: str
    challenge: str
    outcome: Literal["survived", "weakened", "refuted"]
    score: float = Field(ge=-1.0, le=1.0)


class DebateRecord(BaseModel):
    """Result of cross-examination."""
    tests: List[DebateTest]
    bull_score: float
    bear_score: float
    key_disagreements: List[str]


class ConsensusProbability(BaseModel):
    """Final probability estimate with uncertainty."""
    consensus_probability: float = Field(ge=0.0, le=1.0)
    confidence_band: Tuple[float, float]  # [lower, upper]
    disagreement_index: float = Field(ge=0.0, le=1.0)
    regime: Literal["high-confidence", "moderate-confidence", "high-uncertainty"]
    contributing_signals: List[str]  # Agent names


class TradeRecommendation(BaseModel):
    """Final actionable output."""
    market_id: str
    condition_id: str
    action: Literal["LONG_YES", "LONG_NO", "NO_TRADE"]
    entry_zone: Tuple[float, float]  # [min, max] price
    target_zone: Tuple[float, float]
    stop_loss: float  # Stop-loss price below entry zone for risk management
    expected_value: float  # Dollars per $100 invested
    win_probability: float = Field(ge=0.0, le=1.0)
    liquidity_risk: Literal["low", "medium", "high"]
    explanation: TradeExplanation
    metadata: TradeMetadata


# ============================================================================
# Error Types
# ============================================================================

class IngestionError(BaseModel):
    """Error during market data ingestion."""
    type: Literal[
        "API_UNAVAILABLE",
        "RATE_LIMIT_EXCEEDED",
        "INVALID_MARKET_ID",
        "INVALID_EVENT_ID",
        "VALIDATION_FAILED"
    ]
    message: str
    retry_after: Optional[int] = None  # Seconds to wait before retry
    details: Dict[str, Any] = Field(default_factory=dict)


class AgentError(BaseModel):
    """Error during agent execution."""
    type: Literal["TIMEOUT", "EXECUTION_FAILED"]
    agent_name: str
    message: str
    timeout_ms: Optional[int] = None
    details: Dict[str, Any] = Field(default_factory=dict)


class RecommendationError(BaseModel):
    """Error during recommendation generation."""
    type: Literal["INSUFFICIENT_DATA", "CONSENSUS_FAILED", "NO_EDGE"]
    message: str
    details: Dict[str, Any] = Field(default_factory=dict)


# ============================================================================
# Additional Supporting Types
# ============================================================================

class AgentMemoryContext(BaseModel):
    """Historical context for an agent."""
    agent_name: str
    historical_signals: List[AgentSignal]
    market_id: str
    condition_id: str


class FusedSignal(BaseModel):
    """Aggregated signal from multiple agents."""
    weighted_probability: float = Field(ge=0.0, le=1.0)
    signal_alignment: float = Field(ge=0.0, le=1.0)  # How aligned agents are
    conflicts: List[str] = Field(default_factory=list)  # Conflicting signals
    contributing_agents: List[str]


class AuditEntry(BaseModel):
    """Audit log entry for workflow stages."""
    stage: str
    timestamp: int
    status: Literal["started", "completed", "failed"]
    details: Dict[str, Any] = Field(default_factory=dict)


class AnalysisResult(BaseModel):
    """Complete analysis result."""
    recommendation: Optional[TradeRecommendation]
    agent_signals: List[AgentSignal]
    agent_errors: List[AgentError]
    consensus: Optional[ConsensusProbability]
    debate_record: Optional[DebateRecord]
    audit_log: List[AuditEntry]
    analysis_timestamp: int


# ============================================================================
# Web Research Agent Types
# ============================================================================

class SerperSearchResult(BaseModel):
    """Individual search result from Serper API."""
    title: str
    link: str
    snippet: str
    date: Optional[str] = None
    position: int


class SerperScrapeResult(BaseModel):
    """Scraped webpage content from Serper API."""
    url: str
    title: Optional[str] = None
    text: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class WebResearchConfig(BaseModel):
    """Web Research Agent configuration."""
    enabled: bool = True
    max_tool_calls: int = 8
    timeout: int = 60


class SerperConfig(BaseModel):
    """Serper API configuration."""
    api_key: str
    search_url: str = "https://google.serper.dev/search"
    scrape_url: str = "https://scrape.serper.dev"
    timeout: int = 30
