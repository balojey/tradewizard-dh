/**
 * Nova Opik Integration Usage Examples
 * 
 * This file demonstrates how to use the Nova-specific Opik tracking utilities
 * in agent nodes and workflow code.
 */

import { trackNovaInvocation, createNovaOpikTags, formatNovaMetadataForOpik } from './opik-integration.js';
import type { EngineConfig } from '../config/index.js';
import { BedrockClient } from './bedrock-client.js';

/**
 * Example 1: Basic Nova invocation tracking in an agent node
 */
export async function exampleAgentWithNovaTracking(config: EngineConfig) {
  // Create Nova model
  const bedrockClient = new BedrockClient({
    modelId: 'amazon.nova-lite-v1:0',
    region: 'us-east-1',
    temperature: 0.7,
  });
  
  const model = bedrockClient.createChatModel();
  
  // Track invocation timing
  const startTime = Date.now();
  
  try {
    // Invoke the model
    const result = await model.invoke('Analyze this market...');
    
    const latency = Date.now() - startTime;
    
    // Track with Opik
    await trackNovaInvocation({
      agentName: 'market_microstructure',
      modelId: 'amazon.nova-lite-v1:0',
      inputTokens: result.usage?.inputTokens || 0,
      outputTokens: result.usage?.outputTokens || 0,
      latencyMs: latency,
      config,
      success: true,
      temperature: 0.7,
    });
    
    return result;
  } catch (error) {
    const latency = Date.now() - startTime;
    
    // Track failed invocation
    await trackNovaInvocation({
      agentName: 'market_microstructure',
      modelId: 'amazon.nova-lite-v1:0',
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: latency,
      config,
      success: false,
      errorCode: error.code || 'UNKNOWN_ERROR',
      errorMessage: error.message,
    });
    
    throw error;
  }
}

/**
 * Example 2: Using Nova-specific Opik tags for filtering
 */
export function exampleCreateNovaOpikTags() {
  // Create tags for a Nova Lite invocation
  const tags = createNovaOpikTags('lite', 'sentiment_agent', 0.0005);
  
  // Tags will be: ['provider:nova', 'model:lite', 'agent:sentiment_agent', 'cost:low']
  console.log('Opik tags:', tags);
  
  // These tags enable filtering in Opik dashboard:
  // - Filter by provider:nova to see all Nova invocations
  // - Filter by model:lite to see only Nova Lite usage
  // - Filter by agent:sentiment_agent to see specific agent usage
  // - Filter by cost:low to see low-cost invocations
}

/**
 * Example 3: Creating OpikCallbackHandler for Nova operations
 */
export function exampleCreateNovaOpikHandler(config: EngineConfig) {
  const { OpikMonitorIntegration } = require('./opik-integration.js');
  
  const opikIntegration = new OpikMonitorIntegration(config);
  
  // Create handler for Nova operations
  // Note: Tags are added via metadata in tracked operations, not in constructor
  const handler = opikIntegration.createNovaOpikHandler();
  
  // Use this handler when invoking Nova models
  // Metadata will be automatically tracked by OpikCallbackHandler
  return handler;
}

/**
 * Example 4: Recording Nova invocation in monitor cycle
 */
export function exampleRecordNovaInMonitorCycle(config: EngineConfig) {
  const { OpikMonitorIntegration } = require('./opik-integration.js');
  
  const opikIntegration = new OpikMonitorIntegration(config);
  
  // Start a monitoring cycle
  opikIntegration.startCycle();
  
  // Record a Nova invocation
  opikIntegration.recordNovaInvocation({
    provider: 'nova',
    modelVariant: 'lite',
    modelId: 'amazon.nova-lite-v1:0',
    agentName: 'market_microstructure',
    inputTokens: 1500,
    outputTokens: 500,
    latencyMs: 2500,
    inputCost: 0.00009,
    outputCost: 0.00012,
    totalCost: 0.00021,
    temperature: 0.7,
    timestamp: Date.now(),
    success: true,
  });
  
  // End cycle and get metrics
  const metrics = opikIntegration.endCycle();
  
  // Metrics will include Nova-specific data:
  // - Model variant
  // - Token counts
  // - Cost breakdown
  console.log('Cycle metrics:', metrics);
}

/**
 * Example 5: Calculating Nova costs
 */
export function exampleCalculateNovaCosts() {
  const { OpikMonitorIntegration } = require('./opik-integration.js');
  
  // Calculate cost for Nova Lite with 1000 input and 500 output tokens
  const cost = OpikMonitorIntegration.calculateNovaCost('lite', 1000, 500);
  
  console.log('Cost breakdown:', {
    inputCost: `$${cost.inputCost.toFixed(6)}`,
    outputCost: `$${cost.outputCost.toFixed(6)}`,
    totalCost: `$${cost.totalCost.toFixed(6)}`,
  });
  
  // Compare costs across variants
  const microCost = OpikMonitorIntegration.calculateNovaCost('micro', 1000, 500);
  const liteCost = OpikMonitorIntegration.calculateNovaCost('lite', 1000, 500);
  const proCost = OpikMonitorIntegration.calculateNovaCost('pro', 1000, 500);
  
  console.log('Cost comparison:', {
    micro: `$${microCost.totalCost.toFixed(6)}`,
    lite: `$${liteCost.totalCost.toFixed(6)}`,
    pro: `$${proCost.totalCost.toFixed(6)}`,
  });
}

/**
 * Example 6: Formatting Nova metadata for Opik dashboard
 */
export function exampleFormatNovaMetadata() {
  const metadata = {
    provider: 'nova' as const,
    modelVariant: 'lite' as const,
    modelId: 'amazon.nova-lite-v1:0',
    agentName: 'market_microstructure',
    inputTokens: 1500,
    outputTokens: 500,
    latencyMs: 2500,
    inputCost: 0.00009,
    outputCost: 0.00012,
    totalCost: 0.00021,
    temperature: 0.7,
    timestamp: Date.now(),
    success: true,
  };
  
  const formatted = formatNovaMetadataForOpik(metadata);
  
  // Formatted metadata is optimized for Opik dashboard display
  console.log('Formatted metadata:', formatted);
}

/**
 * Example 7: Integration with existing workflow
 */
export async function exampleWorkflowIntegration(config: EngineConfig) {
  const { createWorkflow } = require('../workflow.js');
  const { createPolymarketClient } = require('./polymarket-client.js');
  
  // Create workflow with Nova configuration
  const polymarketClient = createPolymarketClient(config);
  const { app, opikHandler } = await createWorkflow(config, polymarketClient);
  
  // The OpikCallbackHandler automatically tracks all LLM invocations
  // including Nova models. The trackNovaInvocation helper provides
  // additional structured logging and metrics.
  
  // Execute workflow
  const result = await app.invoke(
    { conditionId: 'test-market-123' },
    {
      configurable: { thread_id: 'test-market-123' },
      callbacks: [opikHandler],
    }
  );
  
  // Flush Opik traces
  await opikHandler.flushAsync();
  
  return result;
}
