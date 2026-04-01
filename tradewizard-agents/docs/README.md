# TradeWizard Monitor Documentation

This directory contains comprehensive documentation for deploying and operating the TradeWizard Automated Market Monitor in production.

## Quick Start

1. **New to production deployment?** Start with [Production Readiness Checklist](./PRODUCTION_READINESS.md)
2. **Ready to deploy?** Follow the [Production Deployment Guide](./PRODUCTION_DEPLOYMENT.md)
3. **Need to operate the service?** Use the [Runbook](./RUNBOOK.md)
4. **Handling an incident?** Follow the [Incident Response Plan](./INCIDENT_RESPONSE.md)

## Documentation Index

### Deployment

- **[Production Deployment Guide](./PRODUCTION_DEPLOYMENT.md)** - Complete guide for production deployment
  - Supabase setup and configuration
  - Environment variable configuration
  - Deployment checklist
  - Post-deployment verification

- **[Production Readiness Checklist](./PRODUCTION_READINESS.md)** - Comprehensive readiness checklist
  - Pre-deployment checklist
  - Deployment checklist
  - Post-deployment checklist
  - Go/no-go criteria

### Operations

- **[Runbook](./RUNBOOK.md)** - Day-to-day operational procedures
  - Service management (start, stop, restart)
  - Health checks
  - Common issues and resolutions
  - Maintenance tasks
  - Emergency procedures

- **[Incident Response Plan](./INCIDENT_RESPONSE.md)** - Handling production incidents
  - Incident severity levels
  - Response procedures
  - Incident types and resolutions
  - Communication plan
  - Post-incident review

- **[Rollback Procedure](./ROLLBACK_PROCEDURE.md)** - Rolling back deployments
  - When to rollback
  - Rollback procedures (Docker, systemd, PM2)
  - Database rollback
  - Post-rollback verification

### Monitoring

- **[Monitoring and Alerts](./MONITORING_ALERTS.md)** - Monitoring and alerting setup
  - Health check monitoring
  - Application monitoring (Opik)
  - Database monitoring (Supabase)
  - Cost monitoring
  - Alert configuration and routing

- **[Log Aggregation](./LOG_AGGREGATION.md)** - Log aggregation configuration
  - Loki + Grafana setup
  - ELK Stack setup
  - CloudWatch setup
  - Log retention policies
  - Log analysis queries

### Additional Documentation

- **[Workflow Service Logging](./WORKFLOW_SERVICE_LOGGING.md)** - Logging documentation for DOA workflow routing
  - Log message formats
  - Error message formats
  - Health check response format
  - Troubleshooting guides
- **[E2E Deployment Checklist](./E2E_DEPLOYMENT_CHECKLIST.md)** - End-to-end deployment checklist
- **[E2E Quick Start](./E2E_QUICK_START.md)** - Quick start for end-to-end testing
- **[E2E Testing Guide](./E2E_TESTING_GUIDE.md)** - End-to-end testing procedures
- **[Performance Testing](./PERFORMANCE_TESTING.md)** - Performance testing guide
- **[Opik Guide](./OPIK_GUIDE.md)** - Opik observability setup
- **[LLM Providers](./LLM_PROVIDERS.md)** - LLM provider configuration
- **[External Data Sources](./EXTERNAL_DATA_SOURCES.md)** - External data source setup

## Common Tasks

### Deploying to Production

```bash
# 1. Review production readiness checklist
cat docs/PRODUCTION_READINESS.md

# 2. Follow production deployment guide
cat docs/PRODUCTION_DEPLOYMENT.md

# 3. Configure environment
cp .env.production.example .env.production
nano .env.production

# 4. Deploy service
npm run build
npm ci --only=production
sudo systemctl start tradewizard-monitor

# 5. Verify deployment
curl http://localhost:3000/health
```

### Daily Operations

```bash
# Check service status
npm run monitor:status

# View logs
sudo journalctl -u tradewizard-monitor -f

# Check health
npm run monitor:health

# Trigger manual analysis
npm run monitor:trigger <conditionId>
```

### Handling Incidents

```bash
# 1. Acknowledge incident
# 2. Follow incident response plan
cat docs/INCIDENT_RESPONSE.md

# 3. Check runbook for common issues
cat docs/RUNBOOK.md

# 4. If needed, rollback deployment
cat docs/ROLLBACK_PROCEDURE.md
```

### Monitoring and Alerts

```bash
# Check Opik dashboard
# Visit: https://www.comet.com/opik

# Check Supabase dashboard
# Visit: https://app.supabase.com

# Check logs
# Loki: http://localhost:3001
# Kibana: http://localhost:5601
# CloudWatch: AWS Console
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTOMATED MARKET MONITOR                      │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                    Scheduler                            │    │
│  │  - Cron-based scheduling (24h interval)                │    │
│  │  - Triggers market discovery and analysis              │    │
│  └────────────────────┬───────────────────────────────────┘    │
│                       │                                          │
│                       ▼                                          │
│  ┌────────────────────────────────────────────────────────┐    │
│  │              Market Discovery Engine                    │    │
│  │  - Fetch markets from Polymarket                       │    │
│  │  - Filter and rank by trending score                   │    │
│  │  - Select top N markets                                │    │
│  └────────────────────┬───────────────────────────────────┘    │
│                       │                                          │
│                       ▼                                          │
│  ┌────────────────────────────────────────────────────────┐    │
│  │              API Quota Manager                          │    │
│  │  - Track API usage per source                          │    │
│  │  - Enforce daily quota limits                          │    │
│  └────────────────────┬───────────────────────────────────┘    │
│                       │                                          │
│                       ▼                                          │
│  ┌────────────────────────────────────────────────────────┐    │
│  │           Market Intelligence Engine                    │    │
│  │  - Run full analysis workflow                          │    │
│  │  - Generate trade recommendations                      │    │
│  └────────────────────┬───────────────────────────────────┘    │
│                       │                                          │
│                       ▼                                          │
│  ┌────────────────────────────────────────────────────────┐    │
│  │              Database Persistence Layer                 │    │
│  │  - Store markets, recommendations, signals             │    │
│  │  - Track analysis history                              │    │
│  └────────────────────┬───────────────────────────────────┘    │
│                       │                                          │
└───────────────────────┼──────────────────────────────────────────┘
                        │
                        ▼
                ┌───────────────┐
                │   Supabase    │
                │  PostgreSQL   │
                └───────────────┘
```

## Key Features

- **Automated Market Discovery**: Discovers trending political markets from Polymarket
- **Scheduled Analysis**: Runs analysis on configurable schedule (default: 24 hours)
- **Cost Management**: Respects API quota limits to stay within budget
- **Persistent Storage**: Stores all data in Supabase PostgreSQL
- **LangGraph Checkpointing**: Workflow state persisted for recovery
- **Health Monitoring**: Exposes health check endpoint for monitoring
- **Graceful Shutdown**: Completes current analysis before stopping
- **Comprehensive Logging**: Structured JSON logging for analysis
- **Cost Tracking**: Tracks costs per analysis via Opik

## Configuration

Key environment variables:

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# LLM Provider
LLM_SINGLE_PROVIDER=openai
OPENAI_API_KEY=sk-your_key_here
OPENAI_DEFAULT_MODEL=gpt-4o-mini

# Scheduling
ANALYSIS_INTERVAL_HOURS=24
MAX_MARKETS_PER_CYCLE=3

# API Quotas
NEWS_API_DAILY_QUOTA=100
TWITTER_API_DAILY_QUOTA=500
REDDIT_API_DAILY_QUOTA=60

# Service
HEALTH_CHECK_PORT=3000
ENABLE_MANUAL_TRIGGERS=true
```

See [.env.production.example](../.env.production.example) for complete configuration.

## Support

### Documentation

- All documentation is in this directory
- Start with [Production Readiness Checklist](./PRODUCTION_READINESS.md)
- Use [Runbook](./RUNBOOK.md) for common operations
- Follow [Incident Response Plan](./INCIDENT_RESPONSE.md) for incidents

### External Resources

- [Supabase Documentation](https://supabase.com/docs)
- [OpenAI Documentation](https://platform.openai.com/docs)
- [Opik Documentation](https://www.comet.com/docs/opik/)
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)

### Contact

- **On-Call Engineer**: [Phone] - [Email]
- **Team Lead**: [Phone] - [Email]
- **DevOps Lead**: [Phone] - [Email]

## Contributing

When updating documentation:

1. Keep documentation up-to-date with code changes
2. Update this README when adding new documentation
3. Follow existing documentation structure and style
4. Include code examples where helpful
5. Test all procedures before documenting

## License

[Your License Here]
