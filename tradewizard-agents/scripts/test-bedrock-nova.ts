#!/usr/bin/env tsx
/**
 * AWS Bedrock Nova Model Test Script
 * 
 * Tests AWS Bedrock access and Nova model invocation to diagnose issues.
 * Run with: npx tsx scripts/test-bedrock-nova.ts
 */

import { config } from 'dotenv';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { BedrockClient, ListFoundationModelsCommand } from '@aws-sdk/client-bedrock';

// Load environment variables from .env file
config();

// ANSI color codes for better output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title: string) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
}

async function testAWSCredentials() {
  section('1. Testing AWS Credentials');
  
  try {
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
    log(`Region: ${region}`, 'blue');
    
    // Check environment variables
    const hasAccessKey = !!process.env.AWS_ACCESS_KEY_ID;
    const hasSecretKey = !!process.env.AWS_SECRET_ACCESS_KEY;
    const hasSessionToken = !!process.env.AWS_SESSION_TOKEN;
    
    log(`AWS_ACCESS_KEY_ID: ${hasAccessKey ? '✓ Set' : '✗ Not set'}`, hasAccessKey ? 'green' : 'red');
    log(`AWS_SECRET_ACCESS_KEY: ${hasSecretKey ? '✓ Set' : '✗ Not set'}`, hasSecretKey ? 'green' : 'red');
    log(`AWS_SESSION_TOKEN: ${hasSessionToken ? '✓ Set (temporary credentials)' : '○ Not set (permanent credentials)'}`, 'blue');
    
    if (!hasAccessKey || !hasSecretKey) {
      log('ERROR: AWS credentials not configured!', 'red');
      log('Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables', 'yellow');
      return false;
    }
    
    log('✓ Credentials configured', 'green');
    return true;
  } catch (error) {
    log(`✗ Error checking credentials: ${error}`, 'red');
    return false;
  }
}

async function testBedrockAccess() {
  section('2. Testing Bedrock Service Access');
  
  try {
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
    const client = new BedrockClient({ region });
    
    log('Attempting to list foundation models...', 'blue');
    const command = new ListFoundationModelsCommand({});
    const response = await client.send(command);
    
    log(`✓ Successfully connected to Bedrock`, 'green');
    log(`Found ${response.modelSummaries?.length || 0} models`, 'blue');
    
    // Check for Nova models
    const novaModels = response.modelSummaries?.filter(m => 
      m.modelId?.includes('nova')
    ) || [];
    
    if (novaModels.length > 0) {
      log(`\n✓ Found ${novaModels.length} Nova models:`, 'green');
      novaModels.forEach(model => {
        log(`  - ${model.modelId}`, 'blue');
      });
    } else {
      log('⚠ No Nova models found in available models', 'yellow');
      log('This might indicate insufficient permissions or region issues', 'yellow');
    }
    
    return true;
  } catch (error: any) {
    log(`✗ Failed to access Bedrock service`, 'red');
    log(`Error: ${error.message}`, 'red');
    
    if (error.name === 'UnrecognizedClientException') {
      log('\nPossible causes:', 'yellow');
      log('- Invalid AWS credentials', 'yellow');
      log('- Credentials expired (if using temporary credentials)', 'yellow');
    } else if (error.name === 'AccessDeniedException') {
      log('\nPossible causes:', 'yellow');
      log('- IAM user/role lacks bedrock:ListFoundationModels permission', 'yellow');
      log('- Service not enabled in this region', 'yellow');
    }
    
    return false;
  }
}

async function testNovaModelInvocation(modelId: string) {
  section(`3. Testing Nova Model Invocation: ${modelId}`);
  
  try {
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
    const client = new BedrockRuntimeClient({ region });
    
    log('Preparing test prompt...', 'blue');
    
    // Try using the Converse API (newer, unified API)
    const { ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime');
    
    const command = new ConverseCommand({
      modelId,
      messages: [
        {
          role: 'user',
          content: [
            {
              text: 'Say "Hello from AWS Bedrock Nova!" and nothing else.'
            }
          ]
        }
      ],
      inferenceConfig: {
        maxTokens: 50,
        temperature: 0.1,
        topP: 0.9
      }
    });
    
    log('Invoking model with Converse API...', 'blue');
    const startTime = Date.now();
    const response = await client.send(command);
    const duration = Date.now() - startTime;
    
    log(`✓ Model invocation successful!`, 'green');
    log(`Duration: ${duration}ms`, 'blue');
    log(`\nResponse:`, 'cyan');
    console.log(JSON.stringify(response, null, 2));
    
    // Extract and display the actual text response
    if (response.output?.message?.content?.[0]?.text) {
      log(`\nModel output: "${response.output.message.content[0].text}"`, 'green');
    }
    
    return true;
  } catch (error: any) {
    log(`✗ Model invocation failed`, 'red');
    log(`Error: ${error.message}`, 'red');
    
    if (error.name === 'AccessDeniedException') {
      log('\nPossible causes:', 'yellow');
      log('- IAM user/role lacks bedrock:InvokeModel permission', 'yellow');
      log('- Model access not granted in Bedrock console', 'yellow');
      log('- Model not available in this region', 'yellow');
      log('\nTo fix:', 'cyan');
      log('1. Go to AWS Bedrock console', 'cyan');
      log('2. Navigate to "Model access" in the left sidebar', 'cyan');
      log('3. Click "Manage model access"', 'cyan');
      log('4. Enable access for Nova models', 'cyan');
      log('5. Ensure your IAM policy includes bedrock:InvokeModel', 'cyan');
    } else if (error.name === 'ValidationException') {
      log('\nPossible causes:', 'yellow');
      log('- Invalid request format for this model', 'yellow');
      log('- Model ID incorrect or not available', 'yellow');
      log('- Model may not support the Converse API', 'yellow');
    } else if (error.name === 'ThrottlingException') {
      log('\nPossible causes:', 'yellow');
      log('- Rate limit exceeded', 'yellow');
      log('- Too many concurrent requests', 'yellow');
    }
    
    log(`\nFull error details:`, 'yellow');
    console.error(error);
    
    return false;
  }
}

async function testModelAccessPermissions() {
  section('4. Testing Model Access Permissions');
  
  try {
    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
    const client = new BedrockClient({ region });
    
    log('Checking model access status...', 'blue');
    
    // Try to get model details - this requires model access permissions
    const command = new ListFoundationModelsCommand({
      byProvider: 'Amazon',
    });
    
    const response = await client.send(command);
    const novaModels = response.modelSummaries?.filter(m => 
      m.modelId?.includes('nova')
    ) || [];
    
    if (novaModels.length > 0) {
      log('✓ Can query Nova models', 'green');
      log('\nAvailable Nova models:', 'cyan');
      novaModels.forEach(model => {
        log(`  - ${model.modelId}`, 'blue');
        log(`    Name: ${model.modelName}`, 'blue');
        log(`    Status: ${model.modelLifecycle?.status || 'ACTIVE'}`, 'blue');
      });
    } else {
      log('⚠ No Nova models found', 'yellow');
    }
    
    return novaModels.length > 0;
  } catch (error: any) {
    log(`✗ Failed to check model access`, 'red');
    log(`Error: ${error.message}`, 'red');
    return false;
  }
}

async function main() {
  log('\n🔍 AWS Bedrock Nova Model Diagnostic Tool', 'cyan');
  log('This script will test your AWS Bedrock setup and Nova model access\n', 'blue');
  
  // Test 1: Credentials
  const hasCredentials = await testAWSCredentials();
  if (!hasCredentials) {
    log('\n❌ Cannot proceed without valid AWS credentials', 'red');
    process.exit(1);
  }
  
  // Test 2: Bedrock Access
  const hasBedrockAccess = await testBedrockAccess();
  if (!hasBedrockAccess) {
    log('\n❌ Cannot access Bedrock service', 'red');
    process.exit(1);
  }
  
  // Test 3: Model Access Permissions
  const hasModelAccess = await testModelAccessPermissions();
  
  // Test 4: Nova Model Invocation
  const novaModelsToTest = [
    'amazon.nova-micro-v1:0',
    'amazon.nova-lite-v1:0',
    'amazon.nova-pro-v1:0',
    'amazon.nova-2-lite-v1:0',
  ];
  
  let successCount = 0;
  for (const modelId of novaModelsToTest) {
    const success = await testNovaModelInvocation(modelId);
    if (success) successCount++;
  }
  
  // Summary
  section('Test Summary');
  log(`✓ Credentials: Configured`, 'green');
  log(`${hasBedrockAccess ? '✓' : '✗'} Bedrock Access: ${hasBedrockAccess ? 'Working' : 'Failed'}`, hasBedrockAccess ? 'green' : 'red');
  log(`${hasModelAccess ? '✓' : '✗'} Model Access: ${hasModelAccess ? 'Granted' : 'Limited'}`, hasModelAccess ? 'green' : 'yellow');
  log(`${successCount > 0 ? '✓' : '✗'} Model Invocation: ${successCount}/${novaModelsToTest.length} models working`, successCount > 0 ? 'green' : 'red');
  
  if (successCount === novaModelsToTest.length) {
    log('\n🎉 All tests passed! Your Bedrock Nova setup is working correctly.', 'green');
    process.exit(0);
  } else if (successCount > 0) {
    log('\n⚠ Partial success. Some models are working but others are not.', 'yellow');
    process.exit(1);
  } else {
    log('\n❌ All model invocations failed. Please review the errors above.', 'red');
    log('\nQuick troubleshooting checklist:', 'cyan');
    log('1. Verify AWS credentials are correct and not expired', 'blue');
    log('2. Check IAM permissions include bedrock:InvokeModel', 'blue');
    log('3. Enable model access in Bedrock console (Model access page)', 'blue');
    log('4. Verify you are in a supported region (us-east-1, us-west-2)', 'blue');
    log('5. Check AWS service health dashboard', 'blue');
    process.exit(1);
  }
}

// Run the diagnostic
main().catch(error => {
  log('\n💥 Unexpected error:', 'red');
  console.error(error);
  process.exit(1);
});
