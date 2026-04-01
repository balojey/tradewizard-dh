"""Audit logger for workflow stages."""

import time
from typing import Any, Dict, Literal

from models.types import AuditEntry


def create_audit_entry(
    stage: str,
    status: Literal["started", "completed", "failed"],
    details: Dict[str, Any] | None = None
) -> AuditEntry:
    """
    Create an audit log entry for a workflow stage.
    
    Args:
        stage: Name of the workflow stage (e.g., "market_ingestion", "agent_execution")
        status: Status of the stage (started, completed, failed)
        details: Optional dictionary with additional context
        
    Returns:
        AuditEntry object ready to be added to state
        
    Example:
        >>> entry = create_audit_entry(
        ...     stage="market_ingestion",
        ...     status="completed",
        ...     details={"condition_id": "0x123", "market_id": "abc"}
        ... )
    """
    return AuditEntry(
        stage=stage,
        timestamp=int(time.time() * 1000),  # Milliseconds since epoch
        status=status,
        details=details or {}
    )


def log_stage_start(stage: str, **kwargs: Any) -> AuditEntry:
    """
    Create audit entry for stage start.
    
    Args:
        stage: Name of the workflow stage
        **kwargs: Additional details to include in the audit entry
        
    Returns:
        AuditEntry with status "started"
        
    Example:
        >>> entry = log_stage_start("memory_retrieval", condition_id="0x123")
    """
    return create_audit_entry(stage, "started", details=kwargs)


def log_stage_complete(stage: str, **kwargs: Any) -> AuditEntry:
    """
    Create audit entry for stage completion.
    
    Args:
        stage: Name of the workflow stage
        **kwargs: Additional details to include in the audit entry
        
    Returns:
        AuditEntry with status "completed"
        
    Example:
        >>> entry = log_stage_complete(
        ...     "agent_execution",
        ...     agent_name="market_microstructure",
        ...     signal_count=1
        ... )
    """
    return create_audit_entry(stage, "completed", details=kwargs)


def log_stage_failure(stage: str, error: str, **kwargs: Any) -> AuditEntry:
    """
    Create audit entry for stage failure.
    
    Args:
        stage: Name of the workflow stage
        error: Error message or description
        **kwargs: Additional details to include in the audit entry
        
    Returns:
        AuditEntry with status "failed"
        
    Example:
        >>> entry = log_stage_failure(
        ...     "market_ingestion",
        ...     error="API rate limit exceeded",
        ...     retry_after=60
        ... )
    """
    details = {"error": error, **kwargs}
    return create_audit_entry(stage, "failed", details=details)


def format_audit_log(audit_log: list[AuditEntry]) -> str:
    """
    Format audit log entries as human-readable text.
    
    Args:
        audit_log: List of audit entries from workflow execution
        
    Returns:
        Formatted string representation of the audit log
        
    Example:
        >>> log = [
        ...     log_stage_start("market_ingestion"),
        ...     log_stage_complete("market_ingestion", market_id="abc")
        ... ]
        >>> print(format_audit_log(log))
    """
    if not audit_log:
        return "No audit entries"
    
    lines = ["Workflow Audit Log:", "=" * 50]
    
    for entry in audit_log:
        timestamp_sec = entry.timestamp / 1000
        time_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(timestamp_sec))
        
        status_symbol = {
            "started": "▶",
            "completed": "✓",
            "failed": "✗"
        }.get(entry.status, "•")
        
        line = f"{status_symbol} [{time_str}] {entry.stage} - {entry.status.upper()}"
        lines.append(line)
        
        if entry.details:
            for key, value in entry.details.items():
                lines.append(f"    {key}: {value}")
    
    return "\n".join(lines)
