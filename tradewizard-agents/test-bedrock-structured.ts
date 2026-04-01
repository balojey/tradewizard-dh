/**
 * Test script to debug ChatBedrockConverse structured output
 */

import { ChatBedrockConverse } from '@langchain/aws';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// Simple test schema
const TestSchema = z.object({
  confidence: z.number().min(0).max(1),
  direction: z.enum(['YES', 'NO', 'NEUTRAL']),
  reasoning: z.string(),
});

async function testStructuredOutput() {
  console.log('Testing ChatBedrockConverse with structured output...\n');

  // Get config from environment
  const modelId = process.env.NOVA_MODEL_NAME || 'amazon.nova-lite-v1:0';
  const region = process.env.AWS_REGION || 'us-east-1';

  console.log(`Model: ${modelId}`);
  console.log(`Region: ${region}\n`);

  // Create ChatBedrockConverse instance
  const llm = new ChatBedrockConverse({
    model: modelId,
    region: region,
    temperature: 0.7,
    credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
  });

  console.log('LLM instance created successfully\n');

  // Test 1: Basic invoke (no structured output)
  console.log('=== Test 1: Basic invoke ===');
  try {
    const basicResponse = await llm.invoke([
      { role: 'user', content: 'Say hello in one word' }
    ]);
    console.log('Basic response:', basicResponse.content);
    console.log('✅ Basic invoke works\n');
  } catch (error) {
    console.error('❌ Basic invoke failed:', error);
    return;
  }

  // Test 2: Structured output WITHOUT includeRaw
  console.log('=== Test 2: Structured output (no includeRaw) ===');
  try {
    const structuredLLM = llm.withStructuredOutput(TestSchema);
    const response = await structuredLLM.invoke([
      { 
        role: 'user', 
        content: 'Analyze this statement: "It will rain tomorrow". Provide confidence (0-1), direction (YES/NO/NEUTRAL), and reasoning.' 
      }
    ]);
    console.log('Response:', JSON.stringify(response, null, 2));
    
    if (response === null) {
      console.log('⚠️  Response is null\n');
    } else {
      console.log('✅ Structured output works\n');
    }
  } catch (error) {
    console.error('❌ Structured output failed:', error);
  }

  // Test 3: Structured output WITH includeRaw
  console.log('=== Test 3: Structured output (with includeRaw) ===');
  try {
    const structuredLLM = llm.withStructuredOutput(TestSchema, { includeRaw: true });
    const response = await structuredLLM.invoke([
      { 
        role: 'user', 
        content: 'Analyze this statement: "It will rain tomorrow". Provide confidence (0-1), direction (YES/NO/NEUTRAL), and reasoning.' 
      }
    ]);
    console.log('Response:', JSON.stringify(response, null, 2));
    
    if (response && 'parsed' in response) {
      if (response.parsed === null) {
        console.log('⚠️  Parsed output is null');
        console.log('Raw response:', JSON.stringify(response.raw, null, 2));
      } else {
        console.log('✅ Structured output with includeRaw works');
      }
    }
  } catch (error) {
    console.error('❌ Structured output with includeRaw failed:', error);
  }
}

testStructuredOutput().catch(console.error);
