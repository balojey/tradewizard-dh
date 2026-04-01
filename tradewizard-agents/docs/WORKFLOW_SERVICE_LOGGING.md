# Workflow Service Logging Documentation

This document describes the log messages, error formats, and health check responses for the DOA (Digital Ocean Agent) workflow routing feature.

## Overview

The workflow service routing feature logs all operations to help operators monitor system behavior, troubleshoot issues, and track workflow execution. All log messages use a consistent format with prefixes to identify the component.

## Log Message Prefixes

- `[Workflow]` - Workflow routing decisions
- `[WorkflowService]` - HTTP client operations

## Startup and Configuration Logging

### Using Workflow Service (Remote Execution)

**When:** System starts with `WORKFLOW_SERVICE_URL` configured

**Log Message:**
```
[Workflow] Using workflow service at https://your-workflow-service.com/analyze
```

**Log Level:** INFO

**Purpose:** Confirms the system will route all analysis requests to the remote workflow service

**Requirements:** 9.1

---

### Using Local Workflow Execution

**When:** System starts without `WORKFLOW_SERVICE_URL` configured

**Log Message:**
```
[Workflow] Using local workflow execution
```

**Log Level:** INFO

**Purpose:** Confirms the system will execute workflows locally using LangGraph

**Requirements:** 9.2

---

### Missing Authentication Token Warning

**When:** `WORKFLOW_SERVICE_URL` is configured but `DIGITALOCEAN_API_TOKEN` is not set

**Log Message:**
```
[WorkflowService] DIGITALOCEAN_API_TOKEN not set, requests may fail
```

**Log Level:** WARN

**Purpose:** Alerts operators that authentication is not configured, which will cause requests to fail

**Requirements:** 6.2

---

## Request Logging

### Sending Analysis Request

**When:** Workflow service client sends an HTTP request

**Log Message:**
```
[WorkflowService] Sending analysis request for 0x1234567890abcdef...
```

**Log Level:** INFO

**Purpose:** Records the condition ID being analyzed for audit trail

**Requirements:** 9.3

---

### Analysis Completed Successfully

**When:** Workflow service returns a successful response (2xx status code)

**Log Message:**
```
[WorkflowService] Analysis completed successfully in 45123ms
```

**Log Level:** INFO

**Purpose:** Records successful completion and response time for performance monitoring

**Requirements:** 9.4

---

## Error Logging

### Request Failed with Status Code

**When:** Workflow service returns a non-2xx status code

**Log Message:**
```
[WorkflowService] Request failed with status ${status}
```

**Log Object:**
```json
{
  "status": 500,
  "statusText": "Internal Server Error",
  "body": "Error details from service",
  "duration": 5432,
  "conditionId": "0x1234567890abcdef..."
}
```

**Log Level:** ERROR

**Purpose:** Records detailed error information for troubleshooting

**Requirements:** 5.2, 9.5

---

### Authentication Failed (401/403)

**When:** Workflow service returns 401 Unauthorized or 403 Forbidden

**Error Message:**
```
Authentication failed: Unauthorized. Check DIGITALOCEAN_API_TOKEN is valid and has proper permissions.
```

**Log Message:**
```
[WorkflowService] Request failed with status 401
```

**Log Level:** ERROR

**Purpose:** Indicates authentication token is invalid or missing proper permissions

**Requirements:** 5.3, 6.2

---

### Service Error (5xx)

**When:** Workflow service returns a 5xx status code

**Error Message:**
```
Workflow service error (500): Internal Server Error. Service may be experiencing issues. Details: <error body>
```

**Log Level:** ERROR

**Purpose:** Indicates the workflow service is experiencing internal issues

**Requirements:** 5.2

---

### Bad Request (400)

**When:** Workflow service returns 400 Bad Request

**Error Message:**
```
Bad request (400): <error body>. Check that conditionId is valid.
```

**Log Level:** ERROR

**Purpose:** Indicates the request payload is invalid

---

### Endpoint Not Found (404)

**When:** Workflow service returns 404 Not Found

**Error Message:**
```
Workflow service endpoint not found (404): https://your-service.com/analyze. Check WORKFLOW_SERVICE_URL configuration.
```

**Log Level:** ERROR

**Purpose:** Indicates the configured URL is incorrect

---

### Rate Limit Exceeded (429)

**When:** Workflow service returns 429 Too Many Requests

**Error Message:**
```
Rate limit exceeded (429): <error body>. Too many requests to workflow service.
```

**Log Level:** ERROR

**Purpose:** Indicates the system is sending too many requests

---

### Request Timeout

**When:** Request exceeds configured timeout duration

**Log Message:**
```
[WorkflowService] Workflow service request timed out after 120000ms
```

**Error Message:**
```
Workflow service request timed out after 120000ms
```

**Log Level:** ERROR

**Purpose:** Indicates the workflow service is not responding within the timeout period

**Requirements:** 5.4, 9.5

---

### Connection Refused

**When:** Cannot connect to workflow service (ECONNREFUSED)

**Log Message:**
```
[WorkflowService] Workflow service is unreachable: connection refused at https://your-service.com/analyze
```

**Error Message:**
```
Workflow service is unreachable: connection refused at https://your-service.com/analyze
```

**Log Level:** ERROR

**Purpose:** Indicates the workflow service is not running or not accessible

**Requirements:** 5.1

---

### DNS Lookup Failed

**When:** Cannot resolve workflow service hostname (ENOTFOUND)

**Log Message:**
```
[WorkflowService] Workflow service is unreachable: DNS lookup failed for https://your-service.com/analyze
```

**Error Message:**
```
Workflow service is unreachable: DNS lookup failed for https://your-service.com/analyze
```

**Log Level:** ERROR

**Purpose:** Indicates the workflow service hostname cannot be resolved

**Requirements:** 5.1

---

### Connection Error

**When:** Network connection error occurs (ETIMEDOUT, ECONNRESET)

**Log Message:**
```
[WorkflowService] Workflow service connection error: ETIMEDOUT
```

**Error Message:**
```
Workflow service connection error: ETIMEDOUT
```

**Log Level:** ERROR

**Purpose:** Indicates a network-level connection issue

**Requirements:** 5.1

---

### Generic Request Failure

**When:** Request fails for any other reason

**Log Message:**
```
[WorkflowService] Request failed after 5432ms
```

**Log Object:**
```json
{
  "message": "Error message (sanitized)",
  "name": "Error"
}
```

**Log Level:** ERROR

**Purpose:** Records unexpected errors with sanitized messages (tokens removed)

**Requirements:** 6.4, 9.5

---

### Response Validation Error

**When:** Workflow service response is missing required fields or has incorrect types

**Error Messages:**
```
Invalid response: response must be an object
Invalid response: missing required field "recommendation"
Invalid response: recommendation must be an object or null
Invalid response: missing required field "agentSignals"
Invalid response: agentSignals must be an array
Invalid response: cost must be a number
```

**Log Level:** ERROR

**Purpose:** Indicates the workflow service returned an invalid response structure

**Requirements:** 7.4, 7.5

---

## Security Considerations

### Token Sanitization

**Requirement:** Authentication tokens must NEVER appear in log messages or error messages

**Implementation:** All error messages are sanitized to replace token values with `[REDACTED]`

**Example:**
```javascript
// Original error message
"Failed to authenticate with token sk-abc123xyz"

// Sanitized log message
"Failed to authenticate with token [REDACTED]"
```

**Requirements:** 6.4

---

## Health Check Response Format

### Monitor Service Health Check

**When:** Monitor service health check endpoint is queried

**Response Format:**
```json
{
  "status": "healthy",
  "workflowService": {
    "enabled": true,
    "url": "https://workflow.example.com/analyze",
    "lastSuccess": "2024-01-01T12:00:00Z",
    "consecutiveFailures": 0
  },
  "lastAnalysisTime": "2024-01-01T12:00:00Z",
  "uptime": 86400,
  "version": "1.0.0"
}
```

**Fields:**
- `status` - Overall health status: "healthy", "degraded", or "unhealthy"
- `workflowService.enabled` - Whether workflow service URL is configured
- `workflowService.url` - Configured workflow service URL (if enabled)
- `workflowService.lastSuccess` - Timestamp of last successful workflow request
- `workflowService.consecutiveFailures` - Number of consecutive failed requests
- `lastAnalysisTime` - Timestamp of last completed analysis
- `uptime` - Service uptime in seconds
- `version` - Application version

**Requirements:** 4.5, 9.6

---

### Health Check with Local Execution

**When:** No workflow service URL is configured

**Response Format:**
```json
{
  "status": "healthy",
  "workflowService": {
    "enabled": false
  },
  "lastAnalysisTime": "2024-01-01T12:00:00Z",
  "uptime": 86400,
  "version": "1.0.0"
}
```

---

### Health Check with Workflow Service Failures

**When:** Workflow service has consecutive failures

**Response Format:**
```json
{
  "status": "degraded",
  "workflowService": {
    "enabled": true,
    "url": "https://workflow.example.com/analyze",
    "lastSuccess": "2024-01-01T11:00:00Z",
    "consecutiveFailures": 3,
    "lastError": "Workflow service request timed out after 120000ms"
  },
  "lastAnalysisTime": "2024-01-01T11:00:00Z",
  "uptime": 86400,
  "version": "1.0.0"
}
```

**Status Levels:**
- `healthy` - All systems operational
- `degraded` - Some failures but service still operational
- `unhealthy` - Critical failures, service not operational

---

## Log Analysis Examples

### Monitoring Workflow Service Usage

**Query:** Find all workflow service requests
```bash
grep "\[WorkflowService\]" application.log
```

**Query:** Find failed requests
```bash
grep "\[WorkflowService\] Request failed" application.log
```

**Query:** Calculate average response time
```bash
grep "Analysis completed successfully" application.log | \
  grep -oP '\d+ms' | \
  grep -oP '\d+' | \
  awk '{sum+=$1; count++} END {print sum/count "ms"}'
```

---

### Troubleshooting Authentication Issues

**Query:** Find authentication errors
```bash
grep "Authentication failed" application.log
```

**Expected Output:**
```
[WorkflowService] Request failed with status 401 {...}
Error: Authentication failed: Unauthorized. Check DIGITALOCEAN_API_TOKEN is valid and has proper permissions.
```

**Resolution:**
1. Verify `DIGITALOCEAN_API_TOKEN` is set in environment
2. Check token has not expired
3. Verify token has proper permissions for workflow service

---

### Troubleshooting Timeout Issues

**Query:** Find timeout errors
```bash
grep "timed out after" application.log
```

**Expected Output:**
```
[WorkflowService] Workflow service request timed out after 120000ms
```

**Resolution:**
1. Check workflow service is responding
2. Increase `WORKFLOW_SERVICE_TIMEOUT_MS` if workflows take longer
3. Investigate workflow service performance issues

---

### Troubleshooting Connection Issues

**Query:** Find connection errors
```bash
grep "unreachable\|connection refused\|DNS lookup failed" application.log
```

**Expected Output:**
```
[WorkflowService] Workflow service is unreachable: connection refused at https://...
```

**Resolution:**
1. Verify workflow service is running
2. Check network connectivity
3. Verify `WORKFLOW_SERVICE_URL` is correct
4. Check firewall rules allow outbound connections

---

## Monitoring Best Practices

### Key Metrics to Track

1. **Request Success Rate**
   - Track ratio of successful to failed requests
   - Alert if success rate drops below 95%

2. **Response Time**
   - Track p50, p95, p99 response times
   - Alert if p95 exceeds 2 minutes

3. **Error Rate by Type**
   - Track authentication errors (401/403)
   - Track service errors (5xx)
   - Track timeout errors
   - Track connection errors

4. **Consecutive Failures**
   - Track consecutive failed requests
   - Alert if consecutive failures exceed 3

### Alerting Recommendations

**Critical Alerts:**
- Workflow service unreachable for > 5 minutes
- Authentication failures (indicates token issue)
- Consecutive failures > 5

**Warning Alerts:**
- Response time p95 > 90 seconds
- Success rate < 98%
- Consecutive failures > 2

**Info Alerts:**
- Configuration changes (workflow URL changed)
- First successful request after failures

---

## Log Retention

**Recommendation:** Retain workflow service logs for at least 30 days for:
- Troubleshooting historical issues
- Performance trend analysis
- Cost tracking and optimization
- Audit trail compliance

**Log Rotation:** Configure log rotation to prevent disk space issues:
```bash
# Example logrotate configuration
/var/log/tradewizard-agents/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 tradewizard tradewizard
    sharedscripts
    postrotate
        systemctl reload tradewizard-monitor
    endscript
}
```

---

## Related Documentation

- [Workflow Service Deployment Guide](./DEPLOYMENT.md)
- [Runbook](./RUNBOOK.md) - Operational procedures
- [Monitoring and Alerts](./MONITORING_ALERTS.md) - Monitoring setup
- [Incident Response Plan](./INCIDENT_RESPONSE.md) - Handling incidents

---

## Requirements Traceability

This documentation satisfies the following requirements from the DOA Workflow Routing specification:

- **Requirement 9.1:** Log "Using workflow service at {url}" at startup
- **Requirement 9.2:** Log "Using local workflow execution" at startup
- **Requirement 9.3:** Log condition ID when sending request
- **Requirement 9.4:** Log response time and success status
- **Requirement 9.5:** Log error type, status code, and error message
- **Requirement 9.6:** Include workflow service status in health check
- **Requirement 6.4:** Never log authentication token
- **Requirement 5.1:** Log descriptive error for unreachable service
- **Requirement 5.2:** Log error details including status code
- **Requirement 5.3:** Log authentication failure with token check suggestion
- **Requirement 5.4:** Log timeout error with duration
