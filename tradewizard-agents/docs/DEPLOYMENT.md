# Deployment Guide

This guide covers deploying the Market Intelligence Engine to various Node.js environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Deployment Options](#deployment-options)
  - [Local Development](#local-development)
  - [Production Server](#production-server)
  - [Docker](#docker)
  - [Cloud Platforms](#cloud-platforms)
- [Database Setup](#database-setup)
- [Monitoring and Observability](#monitoring-and-observability)
- [Security Best Practices](#security-best-practices)
- [Scaling Considerations](#scaling-considerations)

## Prerequisites

### System Requirements

- **Node.js**: 18.x or higher
- **npm**: 9.x or higher (or yarn 1.22+)
- **Memory**: Minimum 512MB RAM, recommended 2GB+
- **Storage**: Minimum 1GB for application and logs
- **Network**: Outbound HTTPS access to:
  - Polymarket APIs (gamma-api.polymarket.com, clob.polymarket.com)
  - LLM Provider APIs (OpenAI, Anthropic, Google)
  - Opik (optional, www.comet.com or self-hosted)

### Required API Keys

At minimum, you need API keys for:

1. **One LLM Provider** (for single-provider mode):
   - OpenAI API key, OR
   - Anthropic API key, OR
   - Google API key

2. **Three LLM Providers** (for multi-provider mode):
   - OpenAI API key
   - Anthropic API key
   - Google API key

3. **Opik** (optional but recommended):
   - Opik API key (for cloud)
   - Or self-hosted Opik instance

## Environment Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

### Required Variables

```bash
# At least one LLM provider
OPENAI_API_KEY=sk-...
# OR
ANTHROPIC_API_KEY=sk-ant-...
# OR
GOOGLE_API_KEY=...
```

### Recommended Variables

```bash
# Opik for observability
OPIK_API_KEY=...
OPIK_PROJECT_NAME=market-intelligence-engine

# Logging
LOG_LEVEL=info
AUDIT_TRAIL_RETENTION_DAYS=30

# LangGraph
LANGGRAPH_CHECKPOINTER=sqlite
```

### Production Variables

```bash
# Production-specific settings
NODE_ENV=production
LOG_LEVEL=info
LANGGRAPH_CHECKPOINTER=sqlite
AUDIT_TRAIL_RETENTION_DAYS=90
OPIK_TRACK_COSTS=true

# Performance tuning
AGENT_TIMEOUT_MS=15000
MIN_AGENTS_REQUIRED=2
```

## Deployment Options

### Local Development

For local development and testing:

1. **Install dependencies:**

```bash
npm install
```

2. **Configure environment:**

```bash
cp .env.example .env
# Edit .env with your API keys
```

3. **Run in development mode:**

```bash
npm run dev
```

This uses `tsx watch` for hot-reload during development.

### Production Server

For production deployment on a server:

#### 1. Build the Application

```bash
npm ci --only=production
npm run build
```

This creates optimized JavaScript in the `dist/` directory.

#### 2. Set Environment Variables

**Option A: Using .env file**

```bash
# Create production .env
cp .env.example .env.production
# Edit .env.production with production values
```

**Option B: System environment variables**

```bash
export NODE_ENV=production
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
export GOOGLE_API_KEY=...
export OPIK_API_KEY=...
# ... other variables
```

#### 3. Run the Application

**Direct execution:**

```bash
node dist/index.js
```

**Using PM2 (recommended):**

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start dist/index.js --name market-intelligence-engine

# Configure auto-restart
pm2 startup
pm2 save

# Monitor
pm2 monit

# View logs
pm2 logs market-intelligence-engine
```

**PM2 Ecosystem File:**

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'market-intelligence-engine',
    script: './dist/index.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'info'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    max_memory_restart: '1G',
    autorestart: true,
    watch: false
  }]
};
```

Start with:

```bash
pm2 start ecosystem.config.js
```

### Docker

Deploy using Docker containers:

#### 1. Create Dockerfile

```dockerfile
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Build TypeScript
RUN npm run build

# Expose port (if needed)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('healthy')" || exit 1

# Run application
CMD ["node", "dist/index.js"]
```

#### 2. Create .dockerignore

```
node_modules
dist
.env
.env.*
*.log
.git
.gitignore
README.md
docs
```

#### 3. Build and Run

```bash
# Build image
docker build -t market-intelligence-engine:latest .

# Run container
docker run -d \
  --name market-intelligence-engine \
  --env-file .env.production \
  --restart unless-stopped \
  -v $(pwd)/data:/app/data \
  market-intelligence-engine:latest

# View logs
docker logs -f market-intelligence-engine

# Stop container
docker stop market-intelligence-engine
```

#### 4. Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  market-intelligence-engine:
    build: .
    container_name: market-intelligence-engine
    restart: unless-stopped
    env_file:
      - .env.production
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
    healthcheck:
      test: ["CMD", "node", "-e", "console.log('healthy')"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 5s
```

Run with:

```bash
docker-compose up -d
docker-compose logs -f
```

### Cloud Platforms

#### AWS (EC2)

1. **Launch EC2 instance:**
   - AMI: Amazon Linux 2 or Ubuntu 20.04+
   - Instance type: t3.medium or larger
   - Security group: Allow outbound HTTPS

2. **Install Node.js:**

```bash
# Amazon Linux 2
curl -sL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Ubuntu
curl -sL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

3. **Deploy application:**

```bash
# Clone repository
git clone <your-repo>
cd tradewizard-agents

# Install dependencies
npm ci --only=production

# Build
npm run build

# Configure environment
sudo nano /etc/environment
# Add your environment variables

# Install PM2
sudo npm install -g pm2

# Start application
pm2 start dist/index.js --name market-intelligence-engine
pm2 startup
pm2 save
```

4. **Configure auto-start:**

```bash
sudo systemctl enable pm2-<user>
```

#### AWS (ECS/Fargate)

1. **Push Docker image to ECR:**

```bash
# Authenticate
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Build and tag
docker build -t market-intelligence-engine .
docker tag market-intelligence-engine:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/market-intelligence-engine:latest

# Push
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/market-intelligence-engine:latest
```

2. **Create ECS task definition:**

```json
{
  "family": "market-intelligence-engine",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "containerDefinitions": [{
    "name": "market-intelligence-engine",
    "image": "<account-id>.dkr.ecr.us-east-1.amazonaws.com/market-intelligence-engine:latest",
    "environment": [
      {"name": "NODE_ENV", "value": "production"},
      {"name": "LOG_LEVEL", "value": "info"}
    ],
    "secrets": [
      {"name": "OPENAI_API_KEY", "valueFrom": "arn:aws:secretsmanager:..."},
      {"name": "ANTHROPIC_API_KEY", "valueFrom": "arn:aws:secretsmanager:..."}
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/market-intelligence-engine",
        "awslogs-region": "us-east-1",
        "awslogs-stream-prefix": "ecs"
      }
    }
  }]
}
```

3. **Create ECS service:**

```bash
aws ecs create-service \
  --cluster my-cluster \
  --service-name market-intelligence-engine \
  --task-definition market-intelligence-engine \
  --desired-count 1 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}"
```

#### Google Cloud Platform (Cloud Run)

1. **Build and push to Container Registry:**

```bash
# Build
gcloud builds submit --tag gcr.io/<project-id>/market-intelligence-engine

# Or use Docker
docker build -t gcr.io/<project-id>/market-intelligence-engine .
docker push gcr.io/<project-id>/market-intelligence-engine
```

2. **Deploy to Cloud Run:**

```bash
gcloud run deploy market-intelligence-engine \
  --image gcr.io/<project-id>/market-intelligence-engine \
  --platform managed \
  --region us-central1 \
  --memory 1Gi \
  --cpu 1 \
  --set-env-vars NODE_ENV=production,LOG_LEVEL=info \
  --set-secrets OPENAI_API_KEY=openai-key:latest,ANTHROPIC_API_KEY=anthropic-key:latest
```

#### Azure (Container Instances)

1. **Push to Azure Container Registry:**

```bash
# Login
az acr login --name <registry-name>

# Build and push
docker build -t <registry-name>.azurecr.io/market-intelligence-engine .
docker push <registry-name>.azurecr.io/market-intelligence-engine
```

2. **Deploy to Container Instances:**

```bash
az container create \
  --resource-group myResourceGroup \
  --name market-intelligence-engine \
  --image <registry-name>.azurecr.io/market-intelligence-engine \
  --cpu 1 \
  --memory 1 \
  --environment-variables NODE_ENV=production LOG_LEVEL=info \
  --secure-environment-variables OPENAI_API_KEY=<key> ANTHROPIC_API_KEY=<key>
```

## Database Setup

### SQLite (Recommended for Production)

For persistent checkpointing:

1. **Configure in .env:**

```bash
LANGGRAPH_CHECKPOINTER=sqlite
```

2. **Create data directory:**

```bash
mkdir -p data
chmod 700 data
```

3. **SQLite file location:**

The SQLite database will be created at `data/langgraph.db`.

4. **Backup strategy:**

```bash
# Backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
cp data/langgraph.db backups/langgraph_$DATE.db
```

### PostgreSQL (Enterprise)

For high-availability deployments:

1. **Install PostgreSQL:**

```bash
# Ubuntu
sudo apt-get install postgresql postgresql-contrib

# Or use managed service (AWS RDS, Google Cloud SQL, etc.)
```

2. **Create database:**

```sql
CREATE DATABASE market_intelligence;
CREATE USER market_intel WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE market_intelligence TO market_intel;
```

3. **Configure in .env:**

```bash
LANGGRAPH_CHECKPOINTER=postgres
POSTGRES_CONNECTION_STRING=postgresql://market_intel:secure_password@localhost:5432/market_intelligence
```

4. **Connection pooling:**

Consider using PgBouncer for connection pooling in high-traffic scenarios.

## Monitoring and Observability

### Opik Setup

#### Cloud Opik

1. **Sign up:**
   - Visit https://www.comet.com/opik
   - Create account and project

2. **Get API key:**
   - Navigate to Settings → API Keys
   - Generate new API key

3. **Configure:**

```bash
# .env
OPIK_API_KEY=<your-api-key>
OPIK_PROJECT_NAME=market-intelligence-engine
OPIK_WORKSPACE=default
OPIK_TRACK_COSTS=true
```

#### Self-Hosted Opik

1. **Install Opik:**

```bash
# Using Docker
docker run -d \
  --name opik \
  -p 5000:5000 \
  -v opik-data:/data \
  comet-ml/opik:latest
```

2. **Configure:**

```bash
# .env
OPIK_BASE_URL=http://localhost:5000
OPIK_PROJECT_NAME=market-intelligence-engine
OPIK_TRACK_COSTS=true
```

### Application Monitoring

#### Health Checks

Implement health check endpoint:

```typescript
// src/health.ts
export function healthCheck() {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage()
  };
}
```

#### Logging

Configure structured logging:

```bash
# .env
LOG_LEVEL=info  # debug, info, warn, error
```

Logs are written to stdout/stderr. Configure log aggregation:

- **CloudWatch Logs** (AWS)
- **Stackdriver Logging** (GCP)
- **Azure Monitor** (Azure)
- **ELK Stack** (self-hosted)

#### Metrics

Track key metrics:
- Request rate
- Error rate
- Response time
- LLM API latency
- Cost per analysis

Use Opik dashboard or integrate with:
- Prometheus + Grafana
- Datadog
- New Relic

## Security Best Practices

### API Key Management

**Never commit API keys to version control:**

```bash
# .gitignore
.env
.env.*
!.env.example
```

**Use secrets management:**

- **AWS Secrets Manager**
- **Google Secret Manager**
- **Azure Key Vault**
- **HashiCorp Vault**

**Rotate keys regularly:**

Set up automated key rotation (quarterly recommended).

### Network Security

**Firewall rules:**

- Allow outbound HTTPS (443) to required APIs
- Restrict inbound access (if exposing HTTP endpoints)
- Use VPC/private networks when possible

**TLS/SSL:**

- Use HTTPS for all external communications
- Verify SSL certificates

### Application Security

**Environment isolation:**

```bash
# Separate environments
.env.development
.env.staging
.env.production
```

**Least privilege:**

- Run application as non-root user
- Limit file system permissions
- Use read-only file systems where possible

**Input validation:**

All external inputs are validated using Zod schemas.

**Dependency security:**

```bash
# Regular security audits
npm audit
npm audit fix

# Use Snyk or Dependabot for automated scanning
```

## Scaling Considerations

### Horizontal Scaling

The Market Intelligence Engine is stateless (except for checkpointing) and can be horizontally scaled:

1. **Load balancer:**

Deploy multiple instances behind a load balancer:

```
Load Balancer
    ↓
┌───────┬───────┬───────┐
│ App 1 │ App 2 │ App 3 │
└───────┴───────┴───────┘
```

2. **Shared checkpointer:**

Use PostgreSQL for shared state across instances:

```bash
LANGGRAPH_CHECKPOINTER=postgres
POSTGRES_CONNECTION_STRING=postgresql://...
```

3. **Rate limiting:**

Implement rate limiting to prevent API quota exhaustion:

```typescript
// Per-instance rate limiting
const rateLimiter = new RateLimiter({
  tokensPerInterval: 10,
  interval: 'minute'
});
```

### Vertical Scaling

For single-instance deployments:

**Memory:**
- Minimum: 512MB
- Recommended: 2GB
- High-traffic: 4GB+

**CPU:**
- Minimum: 1 vCPU
- Recommended: 2 vCPU
- High-traffic: 4+ vCPU

### Caching

Implement caching for frequently accessed markets:

```typescript
// Redis cache example
const cache = new Redis({
  host: 'localhost',
  port: 6379,
  ttl: 300 // 5 minutes
});
```

### Queue-Based Processing

For high-volume scenarios, use a queue:

```
API → Queue → Workers → Database
```

Options:
- **AWS SQS** + Lambda
- **Google Cloud Tasks**
- **RabbitMQ**
- **Bull** (Redis-based)

## Troubleshooting

### Deployment Issues

**Build failures:**

```bash
# Clear cache and rebuild
rm -rf node_modules dist
npm install
npm run build
```

**Permission errors:**

```bash
# Fix file permissions
chmod -R 755 dist
chmod 600 .env
```

**Port conflicts:**

```bash
# Check port usage
lsof -i :3000
# Kill process if needed
kill -9 <PID>
```

### Runtime Issues

**Out of memory:**

```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" node dist/index.js
```

**API rate limits:**

- Implement exponential backoff
- Use multiple API keys (if allowed)
- Reduce request rate

**Database connection issues:**

```bash
# Check database connectivity
psql -h localhost -U market_intel -d market_intelligence

# Check connection pool
# Increase pool size if needed
```

## Support

For deployment issues:
- Check [Troubleshooting Guide](../README.md#troubleshooting)
- Review application logs
- Check Opik traces for errors
- Consult LangGraph documentation

---

**Last Updated:** January 2026


## Advanced Agent League Deployment

### Additional Prerequisites

For Advanced Agent League deployment, you need:

**External Data API Keys** (optional but recommended):
- News API key (NewsAPI, Perplexity, or custom)
- Polling API access (FiveThirtyEight, RealClearPolitics, or custom)
- Social Media API keys (Twitter, Reddit, or custom)

### Environment Variables for Advanced Agents

Add to your `.env` file:

```bash
# Advanced Agent Configuration
ADVANCED_AGENTS_ENABLED=true

# External Data Sources
NEWS_API_PROVIDER=newsapi
NEWS_API_KEY=your_key_here
NEWS_API_CACHE_TTL=900
NEWS_API_MAX_ARTICLES=50

POLLING_API_PROVIDER=538
POLLING_API_CACHE_TTL=3600

SOCIAL_API_PROVIDERS=twitter,reddit
TWITTER_API_KEY=your_key_here
TWITTER_BEARER_TOKEN=your_token_here
REDDIT_CLIENT_ID=your_id_here
REDDIT_CLIENT_SECRET=your_secret_here
SOCIAL_API_CACHE_TTL=300
SOCIAL_API_MAX_MENTIONS=100

# Cost Optimization
MAX_COST_PER_ANALYSIS=1.00
SKIP_LOW_IMPACT_AGENTS=true
BATCH_LLM_REQUESTS=true

# Performance Tracking
PERFORMANCE_TRACKING_ENABLED=true
EVALUATE_ON_RESOLUTION=true
MIN_SAMPLE_SIZE=10
```

### Caching Infrastructure

For production deployments with Advanced Agent League, consider using Redis for caching:

#### Redis Setup

**Local Redis**:

```bash
# Install Redis
sudo apt-get install redis-server

# Start Redis
sudo systemctl start redis
sudo systemctl enable redis

# Configure in .env
REDIS_URL=redis://localhost:6379
CACHE_PROVIDER=redis
```

**Cloud Redis**:

- **AWS ElastiCache**: Managed Redis service
- **Google Cloud Memorystore**: Managed Redis service
- **Azure Cache for Redis**: Managed Redis service

```bash
# Configure cloud Redis
REDIS_URL=redis://your-redis-instance:6379
REDIS_PASSWORD=your_password
CACHE_PROVIDER=redis
```


### Configuration Profiles

Create configuration profiles for different deployment scenarios:

**Budget-Conscious Profile** (`config/budget.json`):

```json
{
  "advancedAgents": {
    "eventIntelligence": { "enabled": true, "breakingNews": true, "eventImpact": false },
    "pollingStatistical": { "enabled": true, "pollingIntelligence": true, "historicalPattern": false },
    "sentimentNarrative": { "enabled": false },
    "priceAction": { "enabled": false },
    "eventScenario": { "enabled": true, "catalyst": true, "tailRisk": false },
    "riskPhilosophy": { "enabled": true, "aggressive": true, "conservative": true, "neutral": false }
  },
  "costOptimization": {
    "maxCostPerAnalysis": 0.50,
    "skipLowImpactAgents": true,
    "batchLLMRequests": true
  }
}
```

**Premium Profile** (`config/premium.json`):

```json
{
  "advancedAgents": {
    "eventIntelligence": { "enabled": true, "breakingNews": true, "eventImpact": true },
    "pollingStatistical": { "enabled": true, "pollingIntelligence": true, "historicalPattern": true },
    "sentimentNarrative": { "enabled": true, "mediaSentiment": true, "socialSentiment": true, "narrativeVelocity": true },
    "priceAction": { "enabled": true, "momentum": true, "meanReversion": true, "minVolumeThreshold": 1000 },
    "eventScenario": { "enabled": true, "catalyst": true, "tailRisk": true },
    "riskPhilosophy": { "enabled": true, "aggressive": true, "conservative": true, "neutral": true }
  },
  "costOptimization": {
    "maxCostPerAnalysis": 2.00,
    "skipLowImpactAgents": false,
    "batchLLMRequests": true
  }
}
```

### Monitoring Advanced Agents

#### Opik Configuration

Ensure Opik is configured to track advanced agent metrics:

```bash
# .env
OPIK_API_KEY=your_key_here
OPIK_PROJECT_NAME=market-intelligence-advanced
OPIK_TRACK_COSTS=true
OPIK_TRACK_AGENT_PERFORMANCE=true
```

#### Custom Metrics

Track additional metrics for advanced agents:

- Agent activation rate
- External data fetch success rate
- Cache hit rate
- Signal fusion conflicts
- Cost per agent
- Agent accuracy over time


### Scaling Considerations for Advanced Agents

#### Horizontal Scaling

When scaling horizontally with advanced agents:

1. **Shared Cache**: Use Redis for shared caching across instances
2. **Rate Limit Coordination**: Implement distributed rate limiting
3. **Performance Tracking**: Use shared database for agent performance metrics
4. **Cost Tracking**: Aggregate costs across all instances

**Redis Configuration for Horizontal Scaling**:

```bash
# Shared Redis instance
REDIS_URL=redis://shared-redis:6379
CACHE_PROVIDER=redis

# Distributed rate limiting
RATE_LIMIT_PROVIDER=redis
RATE_LIMIT_KEY_PREFIX=tradewizard:ratelimit:
```

#### Resource Requirements

Advanced Agent League requires more resources than MVP:

**Memory**:
- Budget-Conscious: 1GB minimum, 2GB recommended
- Balanced: 2GB minimum, 4GB recommended
- Premium: 4GB minimum, 8GB recommended

**CPU**:
- Budget-Conscious: 1 vCPU minimum, 2 vCPU recommended
- Balanced: 2 vCPU minimum, 4 vCPU recommended
- Premium: 4 vCPU minimum, 8 vCPU recommended

**Storage**:
- Cache storage: 1-5GB depending on cache TTLs
- Performance metrics: 100MB-1GB depending on volume

### Security Considerations

#### API Key Management

Store external data API keys securely:

**AWS Secrets Manager**:

```bash
# Store secrets
aws secretsmanager create-secret \
  --name tradewizard/news-api-key \
  --secret-string "your_key_here"

# Reference in ECS task definition
{
  "secrets": [
    {
      "name": "NEWS_API_KEY",
      "valueFrom": "arn:aws:secretsmanager:region:account:secret:tradewizard/news-api-key"
    }
  ]
}
```

**Google Secret Manager**:

```bash
# Store secret
gcloud secrets create news-api-key --data-file=-
echo -n "your_key_here" | gcloud secrets versions add news-api-key --data-file=-

# Reference in Cloud Run
gcloud run deploy market-intelligence-engine \
  --set-secrets NEWS_API_KEY=news-api-key:latest
```

#### Network Security

Configure firewall rules for external data sources:

- Allow outbound HTTPS to news APIs
- Allow outbound HTTPS to polling APIs
- Allow outbound HTTPS to social media APIs
- Restrict inbound access as needed

### Cost Management

#### Budget Alerts

Set up budget alerts for API costs:

**AWS Cost Explorer**:
- Create budget for external API costs
- Set alerts at 50%, 80%, 100% of budget
- Monitor daily spending trends

**Opik Cost Tracking**:
- Monitor LLM costs per agent
- Track total analysis costs
- Set cost thresholds per analysis

#### Cost Optimization Strategies

1. **Aggressive Caching**: Increase cache TTLs to reduce API calls
2. **Agent Selection**: Disable low-value agents for your use case
3. **Cost Thresholds**: Set strict cost limits per analysis
4. **Performance-Based**: Reduce weight of underperforming agents
5. **Batch Processing**: Batch multiple analyses to amortize costs

### Troubleshooting Advanced Agents

#### External Data Issues

**Check data source connectivity**:

```bash
# Test news API
curl -H "Authorization: Bearer $NEWS_API_KEY" \
  https://newsapi.org/v2/everything?q=test

# Test Twitter API
curl -H "Authorization: Bearer $TWITTER_BEARER_TOKEN" \
  https://api.twitter.com/2/tweets/search/recent?query=test
```

**Check cache status**:

```bash
# Redis cache
redis-cli
> KEYS tradewizard:cache:*
> TTL tradewizard:cache:news:*
```

#### Agent Performance Issues

**Check agent execution times**:

Review Opik traces for slow agents and optimize:
- Reduce external data fetch size
- Increase cache TTLs
- Set agent timeouts
- Optimize agent prompts

**Check agent accuracy**:

Query performance metrics:

```bash
npm run cli -- performance --all
npm run cli -- performance --underperforming
```

---

**Advanced Agent League Deployment Checklist**:

- [ ] Configure external data API keys
- [ ] Set up Redis for caching (production)
- [ ] Configure cost thresholds
- [ ] Enable performance tracking
- [ ] Set up Opik for monitoring
- [ ] Configure budget alerts
- [ ] Test data source connectivity
- [ ] Review agent configuration profile
- [ ] Set up distributed rate limiting (if scaling)
- [ ] Configure secrets management
- [ ] Test end-to-end with sample market
- [ ] Monitor costs for first week
- [ ] Tune configuration based on results

