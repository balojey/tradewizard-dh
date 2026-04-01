#!/usr/bin/env node
/**
 * Mock Workflow Service for Testing
 * 
 * This script creates a simple HTTP server that mimics the workflow service
 * for testing CLI integration with workflow service URL configuration.
 * 
 * Usage:
 *   node scripts/mock-workflow-service.js [port]
 * 
 * Default port: 3000
 */

import http from 'http';

const PORT = process.env.PORT || process.argv[2] || 3000;

// Mock recommendation response
const createMockResponse = (conditionId) => ({
  recommendation: {
    marketId: conditionId,
    action: 'LONG_YES',
    entryZone: [0.45, 0.50],
    targetZone: [0.60, 0.70],
    expectedValue: 25.5,
    winProbability: 0.65,
    liquidityRisk: 'medium',
    explanation: {
      summary: 'Mock recommendation from test workflow service',
      coreThesis: 'This is a test response to verify CLI integration',
      keyCatalysts: ['Test catalyst 1', 'Test catalyst 2'],
      failureScenarios: ['Test failure scenario']
    },
    metadata: {
      consensusProbability: 0.65,
      marketProbability: 0.48,
      edge: 0.17,
      confidenceBand: [0.60, 0.70]
    }
  },
  agentSignals: [
    {
      agentName: 'test_agent',
      timestamp: Date.now(),
      confidence: 0.85,
      direction: 'YES',
      fairProbability: 0.67,
      keyDrivers: ['Test driver 1', 'Test driver 2'],
      riskFactors: ['Test risk factor'],
      metadata: {}
    }
  ],
  cost: 0.10
});

const server = http.createServer((req, res) => {
  console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));

  if (req.method === 'POST' && req.url === '/analyze') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const requestData = JSON.parse(body);
        console.log('Request body:', JSON.stringify(requestData, null, 2));
        
        // Verify authorization header
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          console.log('❌ Missing or invalid Authorization header');
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized: Missing or invalid Bearer token' }));
          return;
        }
        
        console.log('✅ Authorization header present');
        
        // Verify condition ID
        if (!requestData.conditionId) {
          console.log('❌ Missing conditionId in request');
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Bad Request: Missing conditionId' }));
          return;
        }
        
        console.log(`✅ Processing analysis for condition: ${requestData.conditionId}`);
        
        // Return mock response
        const response = createMockResponse(requestData.conditionId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
        
        console.log('✅ Response sent successfully');
      } catch (error) {
        console.log('❌ Error parsing request:', error.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad Request: Invalid JSON' }));
      }
    });
  } else {
    console.log('❌ Not found');
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }
});

server.listen(PORT, () => {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         Mock Workflow Service for Testing                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n🚀 Server listening on http://localhost:${PORT}`);
  console.log(`\n📝 To test with CLI, run:`);
  console.log(`   export WORKFLOW_SERVICE_URL="http://localhost:${PORT}/analyze"`);
  console.log(`   export DIGITALOCEAN_API_TOKEN="test-token-123"`);
  console.log(`   npm run cli -- analyze 0x1234567890abcdef\n`);
  console.log('Press Ctrl+C to stop\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down mock workflow service...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
