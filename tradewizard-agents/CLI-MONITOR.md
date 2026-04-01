# Monitor CLI Commands

This document describes the CLI commands for managing the Automated Market Monitor service.

## Available Commands

### Start Monitor

Start the Automated Market Monitor service.

```bash
npm run monitor:start
```

The command will:
- **Validate environment variables** (see [Environment Validation](docs/ENVIRONMENT_VALIDATION.md))
- Check if the monitor is already running
- Attempt to start via PM2 if available (recommended)
- Fall back to background process if PM2 is not installed
- Verify the monitor started successfully

**Note**: For production deployments, install PM2 globally for better process management:
```bash
npm install -g pm2
```

**Environment Validation**: The start command automatically validates all required environment variables before starting the monitor. If validation fails, the monitor will not start and you'll see clear error messages about what's missing or invalid.

### Stop Monitor

Stop the Automated Market Monitor service gracefully.

```bash
npm run monitor:stop
```

The command will:
- Send SIGTERM signal for graceful shutdown
- Wait for current analysis to complete
- Clean up process resources
- Verify the monitor stopped successfully

### Check Status

Check the current status of the monitor service.

```bash
npm run monitor:status
```

The command displays:
- Running status (running/not running)
- Process management method (PM2/PID)
- Service uptime
- Database connection status
- Scheduler status
- Last analysis timestamp
- Next scheduled run
- API quota usage per source

### Health Check

Get the raw health check JSON response.

```bash
npm run monitor:health
```

Returns JSON with:
- `status`: Service health status (healthy/degraded/unhealthy)
- `uptime`: Service uptime in seconds
- `database`: Database connection status
- `scheduler`: Scheduler running status
- `lastAnalysis`: Timestamp of last analysis
- `nextScheduledRun`: Timestamp of next scheduled run
- `quotaStatus`: API quota usage per source

This command is useful for:
- Automated health monitoring
- Integration with monitoring tools
- CI/CD health checks

### Validate Environment

Validate environment variables without starting the monitor.

```bash
npm run validate:env
```

The command will:
- Check all required environment variables are present
- Validate URL formats and numeric values
- Check LLM provider configuration
- Display warnings for optional but recommended variables
- Exit with error code 1 if validation fails

This command is useful for:
- Checking configuration before deployment
- CI/CD pipeline validation
- Troubleshooting configuration issues
- Verifying .env file setup

See [Environment Validation Documentation](docs/ENVIRONMENT_VALIDATION.md) for detailed information about required variables and validation rules.

### Trigger Manual Analysis

Manually trigger analysis for a specific market.

```bash
npm run monitor:trigger <conditionId>
```

Example:
```bash
npm run monitor:trigger 0x1234567890abcdef1234567890abcdef12345678
```

The command will:
- Validate the condition ID
- Trigger immediate analysis
- Wait for analysis to complete
- Display the trade recommendation

**Requirements**:
- Monitor must be running
- Manual triggers must be enabled (`ENABLE_MANUAL_TRIGGERS=true`)

## Usage Examples

### Starting the Monitor

```bash
# Start the monitor
npm run monitor:start

# Check it's running
npm run monitor:status

# View health information
npm run monitor:health
```

### Monitoring Operations

```bash
# Check status periodically
watch -n 30 'npm run monitor:status'

# Get health check for monitoring tools
curl http://localhost:3000/health
```

### Manual Analysis

```bash
# Trigger analysis for a specific market
npm run monitor:trigger 0xabc123...

# The output will show:
# - Direction (LONG_YES, LONG_NO, NO_TRADE)
# - Confidence level
# - Fair probability
# - Market edge
# - Entry and target zones
```

### Stopping the Monitor

```bash
# Stop gracefully
npm run monitor:stop

# Verify it stopped
npm run monitor:status
```

## Process Management

### Using PM2 (Recommended)

If PM2 is installed, the monitor will automatically use it for process management:

```bash
# Start via PM2
npm run monitor:start

# View logs
pm2 logs tradewizard-monitor

# Monitor resources
pm2 monit

# Restart
pm2 restart tradewizard-monitor

# Stop
npm run monitor:stop
# or
pm2 stop tradewizard-monitor
```

### Without PM2

If PM2 is not installed, the monitor runs as a background process:

```bash
# Start as background process
npm run monitor:start

# The PID is stored in .monitor.pid
# Logs are written to stdout/stderr

# Stop via CLI
npm run monitor:stop
```

## Environment Variables

The CLI respects these environment variables:

- `HEALTH_CHECK_PORT`: Port for health check endpoint (default: 3000)
- `ENABLE_MANUAL_TRIGGERS`: Enable manual trigger endpoint (default: false)

## Troubleshooting

### Monitor Won't Start

1. Check if it's already running:
   ```bash
   npm run monitor:status
   ```

2. Check if the build is up to date:
   ```bash
   npm run build
   ```

3. Check environment variables:
   ```bash
   cat .env
   ```

### Health Check Fails

1. Verify the monitor is running:
   ```bash
   npm run monitor:status
   ```

2. Check the health check port:
   ```bash
   echo $HEALTH_CHECK_PORT
   ```

3. Test the endpoint directly:
   ```bash
   curl http://localhost:3000/health
   ```

### Manual Trigger Fails

1. Verify manual triggers are enabled:
   ```bash
   grep ENABLE_MANUAL_TRIGGERS .env
   ```

2. Check the condition ID format:
   - Must be a valid Polymarket condition ID
   - Usually a 40-character hex string

3. Verify the monitor is running:
   ```bash
   npm run monitor:status
   ```

## Integration with Monitoring Tools

### Prometheus

```yaml
scrape_configs:
  - job_name: 'tradewizard-monitor'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/health'
```

### Nagios/Icinga

```bash
#!/bin/bash
# check_tradewizard_monitor.sh
response=$(curl -s http://localhost:3000/health)
status=$(echo $response | jq -r '.status')

if [ "$status" = "healthy" ]; then
  echo "OK - Monitor is healthy"
  exit 0
else
  echo "CRITICAL - Monitor is $status"
  exit 2
fi
```

### Uptime Kuma

Add HTTP(s) monitor:
- URL: `http://localhost:3000/health`
- Expected Status Code: 200
- Expected Response: `"status":"healthy"`

## See Also

- [Deployment Guide](DEPLOYMENT.md) - Full deployment instructions
- [README](README.md) - Project overview
- [Monitor Service](src/utils/monitor-service.ts) - Service implementation
