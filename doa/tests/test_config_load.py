#!/usr/bin/env python3
"""Test configuration loading."""

import sys
from config import load_config

try:
    config = load_config()
    print("✓ Configuration loaded successfully")
    print(f"  LLM Model: {config.llm.model_name}")
    print(f"  Temperature: {config.llm.temperature}")
    print(f"  Agents enabled:")
    print(f"    MVP: {config.agents.enable_mvp_agents}")
    print(f"    Event Intelligence: {config.agents.enable_event_intelligence}")
    print(f"    Polling/Statistical: {config.agents.enable_polling_statistical}")
    print(f"  Database persistence: {config.database.enable_persistence}")
    print(f"  Checkpointer: {config.langgraph.checkpointer_type}")
    sys.exit(0)
except Exception as e:
    print(f"✗ Configuration failed: {e}")
    sys.exit(1)
