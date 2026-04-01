# TradeWizard Monitor Runbook

This runbook provides step-by-step procedures for common operational tasks and troubleshooting scenarios.

## Table of Contents

- [Service Management](#service-management)
- [Health Checks](#health-checks)
- [Common Issues](#common-issues)
- [Maintenance Tasks](#maintenance-tasks)
- [Performance Tuning](#performance-tuning)
- [Emergency Procedures](#emergency-procedures)

## Service Management

### Starting the Service

#### Docker

```bash
# Start container
docker start tradewizard-monitor

# Verify it's running
docker ps | grep tradewizard-monitor

# Check logs
docker logs -f tradewizard-monitor --tail 50
```

#### Systemd

```bash
# Start service
sudo systemctl start tradewizard-monitor

# Verify status
sudo systemctl status tradewizard-monitor

# Check logs
sudo journalctl -u tradewizard-monitor -f -n 50
```

#### PM2

```bash
# Start service
pm2 start tradewizard-monitor

# Verify status
pm2 status

# Check logs
pm2 logs tradewizard-monitor --lines 50
```

### Stopping the Service

#### Docker

```bash
# Stop gracefully (allows current analysis to complete)
docker stop tradewizard-monitor

# Force stop (if graceful stop hangs)
docker kill tradewizard-monitor
```

#### Systemd

```bash
# Stop gracefully
sudo systemctl stop tradewizard-monitor

# Check if stopped
sudo systemctl status tradewizard-monitor
```

#### PM2

```bash
# Stop gracefully
pm2 stop tradewizard-monitor

# Verify stopped
pm2 status
```

### Restarting the Service

#### Docker

```bash
# Restart
docker restart tradewizard-monitor

# Verify health
curl http://localhost:3000/health
```

#### Systemd

```bash
# Restart
sudo systemctl restart tradewizard-monitor

# Verify health
curl http://localhost:3000/health
```

#### PM2

```bash
# Restart
pm2 restart tradewizard-monitor

# Verify health
curl http://localhost:3000/health
```

### Viewing Logs

#### Docker

```bash
# Follow logs
docker logs -f tradewizard-monitor

# Last 100 lines
docker logs tradewizard-monitor --tail 100

# Logs since timestamp
docker logs tradewizard-monitor --since 2024-01-15T10:00:00

# Save logs to file
docker logs tradewizard-monitor > monitor-logs.txt
```

#### Systemd

```bash
# Follow logs
sudo journalctl -u tradewizard-monitor -f

# Last 100 lines
sudo journalctl -u tradewizard-monitor -n 100

# Logs since timestamp
sudo journalctl -u tradewizard-monitor --since "2024-01-15 10:00:00"

# Save logs to file
sudo journalctl -u tradewizard-monitor > monitor-logs.txt
```

#### PM2

```bash
# Follow logs
pm2 logs tradewizard-monitor

# Last 100 lines
pm2 logs tradewizard-monitor --lines 100

# Error logs only
pm2 logs tradewizard-monitor --err

# Save logs to file
pm2 logs tradewizard-monitor --lines 1000 --nostream > monitor-logs.txt
```

## Health Checks

### Basic Health Check

```bash
# Check health endpoint
curl http://localhost:3000/health

# Expected response:
# {
#   "status": "healthy",
#   "uptime": 3600,
#   "database": true,
#   "scheduler": true,
#   "lastAnalysis": "2024-01-15T10:00:00Z",
#   "nextScheduledRun": "2024-01-16T10:00:00Z",
#   "quotaStatus": {
#     "newsapi": { "used": 10, "limit": 100 },
#     "twitter": { "used": 30, "limit": 500 },
#     "reddit": { "used": 6, "limit": 60 }
#   }
# }
```

### Database Health

```bash
# Test Supabase connection
curl -H "apikey: $SUPABASE_KEY" \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
     "$SUPABASE_URL/rest/v1/markets?select=count&limit=1"

# Expected: {"count": <number>}
```

### Scheduler Health

```bash
# Check if scheduler is running
curl http://localhost:3000/health | jq '.scheduler'

# Expected: true
```

### API Quota Health

```bash
# Check quota usage
curl http://localhost:3000/health | jq '.quotaStatus'

# Alert if any source > 80%
curl http://localhost:3000/health | jq '.quotaStatus | to_entries[] | select(.value.used / .value.limit > 0.8)'
```

## Common Issues

### Issue: Service Won't Start

**Symptoms**:
- Service fails to start
- Immediate crash after start
- Error in logs: "Configuration validation failed"

**Diagnosis**:

```bash
# Check environment variables
cat .env | grep -v "^#" | grep -v "^$"

# Validate required variables
./scripts/validate-env.sh

# Check for port conflicts
sudo lsof -i :3000

# Check disk space
df -h

# Check memory
free -h
```

**Resolution**:

```bash
# Fix missing environment variables
nano .env
# Add missing variables

# Kill process using port 3000
sudo kill -9 $(sudo lsof -t -i:3000)

# Free up disk space
sudo apt-get clean
sudo journalctl --vacuum-time=7d

# Restart service
sudo systemctl restart tradewizard-monitor
```

### Issue: Database Connection Failed

**Symptoms**:
- Error in logs: "Failed to connect to Supabase"
- Health check shows `"database": false`
- Analysis fails immediately

**Diagnosis**:

```bash
# Test Supabase connectivity
curl -I $SUPABASE_URL

# Test DNS resolution
nslookup $(echo $SUPABASE_URL | sed 's|https://||')

# Test database connection
psql "$SUPABASE_URL" -c "SELECT 1"

# Check firewall rules
sudo iptables -L -n | grep 443
```

**Resolution**:

```bash
# Verify SUPABASE_URL is correct
echo $SUPABASE_URL

# Verify SUPABASE_SERVICE_ROLE_KEY is correct
echo $SUPABASE_SERVICE_ROLE_KEY | wc -c
# Should be ~200+ characters

# Check Supabase project status
# Visit: https://app.supabase.com

# Restart service
sudo systemctl restart tradewizard-monitor
```

### Issue: Analysis Fails

**Symptoms**:
- Error in logs: "Market analysis failed"
- No recommendations stored
- Opik shows failed traces

**Diagnosis**:

```bash
# Check recent logs
sudo journalctl -u tradewizard-monitor -n 200 | grep -i error

# Check LLM API keys
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# Check Polymarket API
curl https://gamma-api.polymarket.com/markets

# Check quota usage
curl http://localhost:3000/health | jq '.quotaStatus'
```

**Resolution**:

```bash
# Verify LLM API key is valid
# Visit: https://platform.openai.com/api-keys

# Check API credits
# Visit: https://platform.openai.com/usage

# Reduce market count if quota exceeded
nano .env
# Set MAX_MARKETS_PER_CYCLE=1

# Restart service
sudo systemctl restart tradewizard-monitor

# Trigger manual analysis to test
curl -X POST http://localhost:3000/trigger \
  -H "Content-Type: application/json" \
  -d '{"conditionId": "test-market-id"}'
```

### Issue: High Memory Usage

**Symptoms**:
- Memory usage > 2GB
- Service becomes slow
- OOM killer terminates process

**Diagnosis**:

```bash
# Check memory usage
docker stats tradewizard-monitor
# or
pm2 monit
# or
ps aux | grep monitor

# Check for memory leaks
node --inspect dist/monitor.js
# Connect Chrome DevTools to inspect heap
```

**Resolution**:

```bash
# Reduce market count
nano .env
# Set MAX_MARKETS_PER_CYCLE=1

# Increase analysis interval
nano .env
# Set ANALYSIS_INTERVAL_HOURS=48

# Restart service
sudo systemctl restart tradewizard-monitor

# Monitor memory over time
watch -n 10 'docker stats tradewizard-monitor --no-stream'
```

### Issue: Quota Exceeded

**Symptoms**:
- Error in logs: "API quota exceeded"
- Analysis skips external data
- Health check shows quota > 100%

**Diagnosis**:

```bash
# Check quota usage
curl http://localhost:3000/health | jq '.quotaStatus'

# Check analysis history
curl -H "apikey: $SUPABASE_KEY" \
     "$SUPABASE_URL/rest/v1/analysis_history?select=*&order=created_at.desc&limit=10"
```

**Resolution**:

```bash
# Wait for quota reset (daily at midnight UTC)
# Or reduce market count
nano .env
# Set MAX_MARKETS_PER_CYCLE=1

# Increase quota limits (if you have paid plans)
nano .env
# Set NEWS_API_DAILY_QUOTA=500
# Set TWITTER_API_DAILY_QUOTA=2000

# Restart service
sudo systemctl restart tradewizard-monitor
```

### Issue: Service Crashes Repeatedly

**Symptoms**:
- Service restarts every few minutes
- Error in logs: "Unhandled exception"
- Systemd shows "failed" status

**Diagnosis**:

```bash
# Check crash logs
sudo journalctl -u tradewizard-monitor -n 500 | grep -i "error\|exception\|crash"

# Check system resources
df -h
free -h
uptime

# Check for core dumps
ls -lh /var/crash/
```

**Resolution**:

```bash
# Increase restart delay
sudo nano /etc/systemd/system/tradewizard-monitor.service
# Add: RestartSec=30

# Reload systemd
sudo systemctl daemon-reload

# Restart service
sudo systemctl restart tradewizard-monitor

# If issue persists, check application logs for root cause
sudo journalctl -u tradewizard-monitor -f
```

## Maintenance Tasks

### Daily Tasks

#### Check Service Health

```bash
#!/bin/bash
# daily-health-check.sh

echo "=== Daily Health Check ==="
echo "Date: $(date)"
echo ""

# Service status
echo "Service Status:"
systemctl is-active tradewizard-monitor

# Health endpoint
echo ""
echo "Health Endpoint:"
curl -s http://localhost:3000/health | jq '.'

# Database size
echo ""
echo "Database Size:"
curl -s -H "apikey: $SUPABASE_KEY" \
  "$SUPABASE_URL/rest/v1/markets?select=count"

# Recent errors
echo ""
echo "Recent Errors (last 24h):"
sudo journalctl -u tradewizard-monitor --since "24 hours ago" | grep -i error | wc -l

echo ""
echo "=== Health Check Complete ==="
```

Schedule with cron:
```bash
# Run at 9 AM daily
0 9 * * * /opt/scripts/daily-health-check.sh | mail -s "TradeWizard Daily Health" admin@example.com
```

#### Review Costs

```bash
# Check Opik for daily costs
# Visit: https://www.comet.com/opik

# Query analysis costs from database
curl -H "apikey: $SUPABASE_KEY" \
  "$SUPABASE_URL/rest/v1/analysis_history?select=cost_usd,created_at&gte=created_at.$(date -d '1 day ago' -I)&order=created_at.desc"
```

### Weekly Tasks

#### Review Performance

```bash
#!/bin/bash
# weekly-performance-review.sh

echo "=== Weekly Performance Review ==="
echo "Week ending: $(date)"
echo ""

# Analysis count
echo "Analyses completed:"
curl -s -H "apikey: $SUPABASE_KEY" \
  "$SUPABASE_URL/rest/v1/analysis_history?select=count&gte=created_at.$(date -d '7 days ago' -I)"

# Success rate
echo ""
echo "Success rate:"
curl -s -H "apikey: $SUPABASE_KEY" \
  "$SUPABASE_URL/rest/v1/analysis_history?select=status&gte=created_at.$(date -d '7 days ago' -I)" | \
  jq '[.[] | select(.status == "success")] | length'

# Average duration
echo ""
echo "Average duration (ms):"
curl -s -H "apikey: $SUPABASE_KEY" \
  "$SUPABASE_URL/rest/v1/analysis_history?select=duration_ms&gte=created_at.$(date -d '7 days ago' -I)" | \
  jq '[.[].duration_ms] | add / length'

# Total cost
echo ""
echo "Total cost ($):"
curl -s -H "apikey: $SUPABASE_KEY" \
  "$SUPABASE_URL/rest/v1/analysis_history?select=cost_usd&gte=created_at.$(date -d '7 days ago' -I)" | \
  jq '[.[].cost_usd] | add'

echo ""
echo "=== Review Complete ==="
```

#### Database Maintenance

```bash
# Vacuum and analyze tables
psql "$SUPABASE_URL" <<EOF
VACUUM ANALYZE markets;
VACUUM ANALYZE recommendations;
VACUUM ANALYZE agent_signals;
VACUUM ANALYZE analysis_history;
VACUUM ANALYZE langgraph_checkpoints;
EOF

# Check table sizes
psql "$SUPABASE_URL" -c "
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
"

# Check index usage
psql "$SUPABASE_URL" -c "
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC
LIMIT 10;
"
```

### Monthly Tasks

#### Rotate API Keys

```bash
# 1. Generate new API keys
# OpenAI: https://platform.openai.com/api-keys
# Anthropic: https://console.anthropic.com/settings/keys
# Supabase: https://app.supabase.com/project/_/settings/api

# 2. Update .env with new keys
nano .env

# 3. Restart service
sudo systemctl restart tradewizard-monitor

# 4. Verify service is healthy
curl http://localhost:3000/health

# 5. Revoke old keys
```

#### Review and Archive Logs

```bash
# Archive old logs
sudo journalctl --vacuum-time=30d

# Backup logs to S3
sudo journalctl -u tradewizard-monitor --since "30 days ago" > \
  /tmp/monitor-logs-$(date +%Y%m).txt

aws s3 cp /tmp/monitor-logs-$(date +%Y%m).txt \
  s3://tradewizard-logs/monitor/

rm /tmp/monitor-logs-$(date +%Y%m).txt
```

#### Database Backup

```bash
# Run backup script
/opt/scripts/backup-production.sh

# Verify backup was created
ls -lh /backups/tradewizard-prod/

# Test restore (on staging)
PGPASSWORD=$DB_PASSWORD pg_restore \
  -h db.staging-project.supabase.co \
  -U postgres \
  -d postgres \
  -c \
  /backups/tradewizard-prod/backup_latest.dump
```

## Performance Tuning

### Optimize Database Queries

```sql
-- Find slow queries
SELECT
  query,
  calls,
  total_time,
  mean_time,
  max_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;

-- Add missing indexes
CREATE INDEX CONCURRENTLY idx_markets_status_trending
  ON markets(status, trending_score DESC)
  WHERE status = 'active';

-- Update statistics
ANALYZE markets;
ANALYZE recommendations;
```

### Optimize Memory Usage

```bash
# Set Node.js memory limit
nano /etc/systemd/system/tradewizard-monitor.service

# Add to [Service] section:
Environment="NODE_OPTIONS=--max-old-space-size=2048"

# Reload and restart
sudo systemctl daemon-reload
sudo systemctl restart tradewizard-monitor
```

### Optimize Analysis Interval

```bash
# Reduce frequency if costs are high
nano .env
# Set ANALYSIS_INTERVAL_HOURS=48

# Reduce market count
# Set MAX_MARKETS_PER_CYCLE=2

# Restart service
sudo systemctl restart tradewizard-monitor
```

## Emergency Procedures

### Service Down

```bash
# 1. Check if service is running
systemctl status tradewizard-monitor

# 2. Check recent logs
sudo journalctl -u tradewizard-monitor -n 100

# 3. Restart service
sudo systemctl restart tradewizard-monitor

# 4. Verify health
curl http://localhost:3000/health

# 5. If still down, check database
curl -I $SUPABASE_URL

# 6. If database is down, wait for Supabase recovery
# Check: https://status.supabase.com

# 7. If issue persists, follow incident response plan
```

### Database Connection Lost

```bash
# 1. Check Supabase status
curl -I $SUPABASE_URL

# 2. Check network connectivity
ping db.your-project.supabase.co

# 3. Service will automatically reconnect when database is available
# Monitor logs:
sudo journalctl -u tradewizard-monitor -f

# 4. If connection doesn't restore, restart service
sudo systemctl restart tradewizard-monitor
```

### High Cost Alert

```bash
# 1. Check current costs
# Visit: https://www.comet.com/opik

# 2. Stop service immediately
sudo systemctl stop tradewizard-monitor

# 3. Review recent analyses
curl -H "apikey: $SUPABASE_KEY" \
  "$SUPABASE_URL/rest/v1/analysis_history?select=*&order=created_at.desc&limit=20"

# 4. Reduce market count
nano .env
# Set MAX_MARKETS_PER_CYCLE=1

# 5. Increase analysis interval
# Set ANALYSIS_INTERVAL_HOURS=48

# 6. Restart service
sudo systemctl start tradewizard-monitor

# 7. Monitor costs closely
```

### Data Corruption

```bash
# 1. Stop service
sudo systemctl stop tradewizard-monitor

# 2. Backup current database
/opt/scripts/backup-production.sh

# 3. Identify corrupted data
psql "$SUPABASE_URL" -c "SELECT * FROM markets WHERE updated_at IS NULL;"

# 4. Restore from backup if needed
PGPASSWORD=$DB_PASSWORD pg_restore \
  -h db.your-project.supabase.co \
  -U postgres \
  -d postgres \
  -c \
  /backups/tradewizard-prod/backup_latest.dump

# 5. Restart service
sudo systemctl start tradewizard-monitor

# 6. Verify data integrity
curl -H "apikey: $SUPABASE_KEY" \
  "$SUPABASE_URL/rest/v1/markets?select=count"
```

## Contact Information

### On-Call Rotation

- **Primary**: [Name] - [Phone] - [Email]
- **Secondary**: [Name] - [Phone] - [Email]
- **Escalation**: [Team Lead] - [Phone] - [Email]

### External Support

- **Supabase Support**: https://supabase.com/support
- **OpenAI Support**: https://help.openai.com
- **Opik Support**: https://www.comet.com/support

## Additional Resources

- [Production Deployment Guide](./PRODUCTION_DEPLOYMENT.md)
- [Incident Response Plan](./INCIDENT_RESPONSE.md)
- [Rollback Procedure](./ROLLBACK_PROCEDURE.md)
- [Monitoring and Alerts](./MONITORING_ALERTS.md)
