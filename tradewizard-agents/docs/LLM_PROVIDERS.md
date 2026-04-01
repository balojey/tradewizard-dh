# LLM Provider Setup Guide

This guide covers setting up API access for all supported LLM providers: OpenAI, Anthropic, Google Gemini, and Amazon Nova.

## Table of Contents

- [Overview](#overview)
- [OpenAI Setup](#openai-setup)
- [Anthropic Setup](#anthropic-setup)
- [Google Gemini Setup](#google-gemini-setup)
- [Amazon Nova Setup](#amazon-nova-setup)
- [Configuration Modes](#configuration-modes)
- [Cost Optimization](#cost-optimization)
- [Troubleshooting](#troubleshooting)

## Overview

The Market Intelligence Engine supports four LLM providers, each with different strengths:

| Provider | Best For | Cost | Speed | Quality |
|----------|----------|------|-------|---------|
| **OpenAI** | General reasoning, structured output | $$$ | Fast | Excellent |
| **Anthropic** | Long context, safety, nuanced analysis | $$$ | Medium | Excellent |
| **Google Gemini** | Cost-effective, fast inference | $ | Very Fast | Good |
| **Amazon Nova** | AWS integration, ultra-low cost | $ | Fast | Good |

### Recommended Configuration

**Multi-Provider Mode (Optimal Quality):**
- Market Microstructure Agent → OpenAI GPT-4-turbo
- Probability Baseline Agent → Google Gemini-1.5-flash
- Risk Assessment Agent → Anthropic Claude-3-sonnet

**Multi-Provider Mode (Cost-Optimized with Nova):**
- Market Microstructure Agent → Amazon Nova Pro
- Probability Baseline Agent → Amazon Nova Lite
- Risk Assessment Agent → Amazon Nova Lite

**Single-Provider Mode (Budget-Friendly):**
- All agents → Amazon Nova Micro (ultra-low cost)
- All agents → Amazon Nova Lite (best balance)
- All agents → OpenAI GPT-4o-mini (good quality)
- All agents → Google Gemini-1.5-flash (fast + cheap)

## OpenAI Setup

### 1. Create OpenAI Account

1. Visit [https://platform.openai.com/signup](https://platform.openai.com/signup)
2. Sign up with email or Google/Microsoft account
3. Verify your email address

### 2. Add Payment Method

1. Navigate to [Billing](https://platform.openai.com/account/billing)
2. Click "Add payment method"
3. Enter credit card information
4. Set up billing limits (recommended: $50-100/month for testing)

### 3. Generate API Key

1. Go to [API Keys](https://platform.openai.com/api-keys)
2. Click "Create new secret key"
3. Name your key (e.g., "market-intelligence-engine")
4. Copy the key immediately (you won't see it again)
5. Store securely in your `.env` file

### 4. Configure Environment

```bash
# .env
OPENAI_API_KEY=sk-proj-...
OPENAI_DEFAULT_MODEL=gpt-4-turbo
```

### Available Models

| Model | Cost (per 1M tokens) | Best For |
|-------|---------------------|----------|
| **gpt-4-turbo** | $10 input / $30 output | Complex reasoning, structured output |
| **gpt-4o** | $5 input / $15 output | Balanced performance and cost |
| **gpt-4o-mini** | $0.15 input / $0.60 output | Budget-friendly, fast inference |
| **gpt-3.5-turbo** | $0.50 input / $1.50 output | Simple tasks, very fast |

**Recommended for Market Intelligence Engine:**
- **Production:** `gpt-4-turbo` or `gpt-4o`
- **Development:** `gpt-4o-mini`
- **Budget:** `gpt-4o-mini`

### 5. Test Connection

```bash
npm run cli -- analyze <condition-id> --single-provider openai --model gpt-4o-mini
```

### Rate Limits

**Free Tier:**
- 3 requests per minute (RPM)
- 200 requests per day (RPD)

**Tier 1 ($5+ spent):**
- 500 RPM
- 10,000 RPD

**Tier 2 ($50+ spent):**
- 5,000 RPM
- 100,000 RPD

See [OpenAI Rate Limits](https://platform.openai.com/docs/guides/rate-limits) for details.

### Cost Estimation

**Single Analysis (Multi-Provider Mode):**
- Market Microstructure Agent: ~2,000 tokens
- Cost: ~$0.05 per analysis

**Single Analysis (Single-Provider Mode with gpt-4o-mini):**
- All agents: ~6,000 tokens total
- Cost: ~$0.01 per analysis

## Anthropic Setup

### 1. Create Anthropic Account

1. Visit [https://console.anthropic.com/](https://console.anthropic.com/)
2. Sign up with email
3. Verify your email address

### 2. Add Payment Method

1. Navigate to [Billing](https://console.anthropic.com/settings/billing)
2. Click "Add payment method"
3. Enter credit card information
4. Set up usage limits (recommended: $50-100/month)

### 3. Generate API Key

1. Go to [API Keys](https://console.anthropic.com/settings/keys)
2. Click "Create Key"
3. Name your key (e.g., "market-intelligence-engine")
4. Copy the key immediately
5. Store securely in your `.env` file

### 4. Configure Environment

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_DEFAULT_MODEL=claude-3-sonnet-20240229
```

### Available Models

| Model | Cost (per 1M tokens) | Best For |
|-------|---------------------|----------|
| **claude-3-opus** | $15 input / $75 output | Highest quality, complex reasoning |
| **claude-3-sonnet** | $3 input / $15 output | Balanced performance and cost |
| **claude-3-haiku** | $0.25 input / $1.25 output | Fast, cost-effective |
| **claude-3.5-sonnet** | $3 input / $15 output | Latest, improved reasoning |

**Recommended for Market Intelligence Engine:**
- **Production:** `claude-3-sonnet-20240229` or `claude-3.5-sonnet-20240620`
- **Development:** `claude-3-haiku-20240307`
- **Budget:** `claude-3-haiku-20240307`

### 5. Test Connection

```bash
npm run cli -- analyze <condition-id> --single-provider anthropic --model claude-3-haiku-20240307
```

### Rate Limits

**Free Tier:**
- 5 requests per minute (RPM)
- 1,000 requests per day (RPD)

**Tier 1 ($5+ spent):**
- 50 RPM
- 5,000 RPD

**Tier 2 ($40+ spent):**
- 1,000 RPM
- 40,000 RPD

See [Anthropic Rate Limits](https://docs.anthropic.com/claude/reference/rate-limits) for details.

### Cost Estimation

**Single Analysis (Multi-Provider Mode):**
- Risk Assessment Agent: ~2,000 tokens
- Cost: ~$0.03 per analysis

**Single Analysis (Single-Provider Mode with claude-3-haiku):**
- All agents: ~6,000 tokens total
- Cost: ~$0.01 per analysis

## Google Gemini Setup

### 1. Create Google Cloud Account

1. Visit [https://console.cloud.google.com/](https://console.cloud.google.com/)
2. Sign in with Google account
3. Accept terms of service

### 2. Enable Gemini API

1. Navigate to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Click "Get API Key"
3. Select or create a project
4. Enable the Generative Language API

### 3. Generate API Key

1. In Google AI Studio, click "Create API Key"
2. Select your project
3. Copy the API key
4. Store securely in your `.env` file

**Alternative: Using Google Cloud Console**

1. Go to [APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
2. Click "Create Credentials" → "API Key"
3. Restrict the key to "Generative Language API"
4. Copy and store the key

### 4. Configure Environment

```bash
# .env
GOOGLE_API_KEY=AIza...
GOOGLE_DEFAULT_MODEL=gemini-1.5-flash
```

### Available Models

| Model | Cost (per 1M tokens) | Best For |
|-------|---------------------|----------|
| **gemini-1.5-pro** | $3.50 input / $10.50 output | High quality, long context |
| **gemini-1.5-flash** | $0.35 input / $1.05 output | Fast, cost-effective |
| **gemini-1.0-pro** | $0.50 input / $1.50 output | Balanced performance |

**Recommended for Market Intelligence Engine:**
- **Production:** `gemini-1.5-flash` or `gemini-1.5-pro`
- **Development:** `gemini-1.5-flash`
- **Budget:** `gemini-1.5-flash` (best value)

### 5. Test Connection

```bash
npm run cli -- analyze <condition-id> --single-provider google --model gemini-1.5-flash
```

### Rate Limits

**Free Tier:**
- 15 requests per minute (RPM)
- 1,500 requests per day (RPD)

**Paid Tier:**
- 360 RPM
- No daily limit

See [Gemini Rate Limits](https://ai.google.dev/pricing) for details.

### Cost Estimation

**Single Analysis (Multi-Provider Mode):**
- Probability Baseline Agent: ~2,000 tokens
- Cost: ~$0.002 per analysis

**Single Analysis (Single-Provider Mode with gemini-1.5-flash):**
- All agents: ~6,000 tokens total
- Cost: ~$0.006 per analysis

## Amazon Nova Setup

### 1. Create AWS Account

1. Visit [https://aws.amazon.com/](https://aws.amazon.com/)
2. Click "Create an AWS Account"
3. Enter email, password, and AWS account name
4. Provide payment information (required even for free tier)
5. Verify identity via phone
6. Select support plan (Basic/Free is sufficient)

### 2. Enable Amazon Bedrock

1. Sign in to [AWS Console](https://console.aws.amazon.com/)
2. Navigate to [Amazon Bedrock](https://console.aws.amazon.com/bedrock/)
3. Select your preferred region (us-east-1 recommended)
4. Click "Get Started" if prompted
5. Request model access:
   - Go to "Model access" in left sidebar
   - Click "Manage model access"
   - Select "Amazon" provider
   - Check boxes for Nova Micro, Nova Lite, and Nova Pro
   - Click "Request model access"
   - Wait for approval (usually instant)

### 3. Create IAM User for API Access

1. Navigate to [IAM Console](https://console.aws.amazon.com/iam/)
2. Click "Users" → "Create user"
3. Enter username (e.g., "tradewizard-bedrock")
4. Click "Next"
5. Select "Attach policies directly"
6. Search for and attach `AmazonBedrockFullAccess` policy
   - **For production, use least-privilege policy:**
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "bedrock:InvokeModel",
           "bedrock:InvokeModelWithResponseStream"
         ],
         "Resource": "arn:aws:bedrock:*::foundation-model/amazon.nova-*"
       }
     ]
   }
   ```
7. Click "Next" → "Create user"

### 4. Generate Access Keys

1. Click on the newly created user
2. Go to "Security credentials" tab
3. Scroll to "Access keys" section
4. Click "Create access key"
5. Select "Application running outside AWS"
6. Click "Next" → "Create access key"
7. **Copy both Access Key ID and Secret Access Key immediately**
8. Store securely in your `.env` file

### 5. Configure Environment

```bash
# .env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
NOVA_MODEL_NAME=amazon.nova-lite-v1:0
```

**Alternative: Using AWS CLI Credentials**

If you have AWS CLI configured, TradeWizard can use your default credentials:

```bash
# Configure AWS CLI (one-time setup)
aws configure

# .env - Only region and model name needed
AWS_REGION=us-east-1
NOVA_MODEL_NAME=amazon.nova-lite-v1:0
```

### Available Models

| Model | Cost (per 1M tokens) | Best For | Max Tokens |
|-------|---------------------|----------|------------|
| **amazon.nova-micro-v1:0** | $0.035 input / $0.14 output | Ultra-low cost, simple tasks | 128K |
| **amazon.nova-lite-v1:0** | $0.06 input / $0.24 output | Balanced performance and cost | 300K |
| **amazon.nova-pro-v1:0** | $0.80 input / $3.20 output | Complex reasoning, high quality | 300K |
| **global.amazon.nova-2-lite-v1:0** | $0.30 input / $2.50 output | Fast reasoning, 1M context, extended thinking | 1M |
| **global.amazon.nova-2-pro-v1:0** | $0.80 input / $3.20 output (est.) | Most intelligent, 1M context (Preview) | 1M |

**Recommended for Market Intelligence Engine:**
- **Production:** `global.amazon.nova-2-lite-v1:0` or `amazon.nova-lite-v1:0`
- **Development:** `amazon.nova-lite-v1:0` or `global.amazon.nova-2-lite-v1:0`
- **Budget:** `amazon.nova-micro-v1:0` (lowest cost available)
- **Advanced Reasoning:** `global.amazon.nova-2-lite-v1:0` (extended thinking capabilities)

**Nova 2 vs Nova v1:**
- Nova 2 models offer **1M token context** (vs 128K-300K for v1)
- Nova 2 Lite includes **extended reasoning** capabilities with step-by-step thinking
- Nova 2 models support **multimodal inputs** (text, images, video, documents)
- Nova 2 Lite is **5-10x more expensive** than Nova Lite v1 but offers superior intelligence
- Nova 2 Pro is in **preview** and requires Nova Forge access

**Pricing Comparison:**
- Nova Micro v1 is **4-10x cheaper** than other budget models
- Nova Lite v1 is **2-6x cheaper** than mid-tier models
- Nova 2 Lite is **competitive** with Claude Haiku and GPT-4o Mini
- Nova Pro v1/v2 is competitive with premium models but AWS-native

### 6. Test Connection

```bash
# Test with Nova v1 Lite
npm run cli -- analyze <condition-id> --single-provider nova --model amazon.nova-lite-v1:0

# Test with Nova 2 Lite (latest)
npm run cli -- analyze <condition-id> --single-provider nova --model global.amazon.nova-2-lite-v1:0
```

### Rate Limits

**Default Limits (per region):**
- Nova Micro: 200 requests per minute (RPM)
- Nova Lite: 200 RPM
- Nova Pro: 100 RPM

**Throughput Limits:**
- Nova Micro: 200,000 tokens per minute (TPM)
- Nova Lite: 300,000 TPM
- Nova Pro: 300,000 TPM

**Request Quota Increases:**
- Available through AWS Service Quotas
- Can request higher limits for production workloads
- See [Bedrock Quotas](https://docs.aws.amazon.com/bedrock/latest/userguide/quotas.html)

### Cost Estimation

**Single Analysis (Multi-Provider Mode with Nova):**
- Market Microstructure Agent (Nova Pro v1): ~2,000 tokens
- Cost: ~$0.008 per analysis

**Single Analysis (Single-Provider Mode with Nova Lite v1):**
- All agents: ~6,000 tokens total
- Cost: ~$0.002 per analysis

**Single Analysis (Single-Provider Mode with Nova Micro v1):**
- All agents: ~6,000 tokens total
- Cost: ~$0.001 per analysis (cheapest option)

**Single Analysis (Single-Provider Mode with Nova 2 Lite):**
- All agents: ~6,000 tokens total
- Cost: ~$0.018 per analysis (with extended reasoning capabilities)

### Regional Availability

Nova models are available in the following AWS regions:

**Nova v1 Models:**
- **us-east-1** (US East - N. Virginia) - Recommended
- **us-west-2** (US West - Oregon)
- **eu-west-1** (Europe - Ireland)
- **ap-southeast-1** (Asia Pacific - Singapore)

**Nova 2 Models:**
- Available via **global cross-region inference** in multiple locations
- Automatically routes to optimal region for performance
- Supported regions: US East, US West, Europe, Asia Pacific

Check [AWS Bedrock Regions](https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-regions.html) for latest availability.

### IAM Permissions

**Minimum Required Permissions:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel"
      ],
      "Resource": [
        "arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-micro-v1:0",
        "arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-lite-v1:0",
        "arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-pro-v1:0",
        "arn:aws:bedrock:*::foundation-model/global.amazon.nova-2-lite-v1:0",
        "arn:aws:bedrock:*::foundation-model/global.amazon.nova-2-pro-v1:0"
      ]
    }
  ]
}
```

**For Development (Full Access):**

Use the managed policy: `AmazonBedrockFullAccess`

### AWS Credentials Best Practices

1. **Never hardcode credentials in code**
2. **Use IAM roles for EC2/ECS deployments**
3. **Use AWS Secrets Manager for production**
4. **Rotate access keys every 90 days**
5. **Enable MFA for IAM users**
6. **Use least-privilege IAM policies**

## Configuration Modes

### Multi-Provider Mode (Default)

Uses different LLMs for different agents to maximize quality and diversity.

**Configuration:**

```bash
# .env
# Leave LLM_SINGLE_PROVIDER unset or commented out

# Configure all providers
OPENAI_API_KEY=sk-...
OPENAI_DEFAULT_MODEL=gpt-4-turbo

ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_DEFAULT_MODEL=claude-3-sonnet-20240229

GOOGLE_API_KEY=AIza...
GOOGLE_DEFAULT_MODEL=gemini-1.5-flash

# Optional: Add Nova for cost-optimized agents
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
NOVA_MODEL_NAME=amazon.nova-lite-v1:0
```

**Agent-LLM Mapping (Premium):**
- Market Microstructure Agent → OpenAI GPT-4-turbo
- Probability Baseline Agent → Google Gemini-1.5-flash
- Risk Assessment Agent → Anthropic Claude-3-sonnet

**Agent-LLM Mapping (Cost-Optimized with Nova):**
- Market Microstructure Agent → Amazon Nova Pro
- Probability Baseline Agent → Amazon Nova Lite
- Risk Assessment Agent → Amazon Nova Lite

**Pros:**
- ✅ Diverse perspectives reduce model-specific biases
- ✅ Each agent uses optimal LLM for its task
- ✅ Better quality recommendations

**Cons:**
- ❌ Higher cost (~$0.08 per analysis)
- ❌ Requires API keys for all three providers
- ❌ More complex setup

**Cost per 100 analyses:** ~$8.00

### Single-Provider Mode

Uses one LLM for all agents with different system prompts.

**Configuration:**

```bash
# .env
LLM_SINGLE_PROVIDER=openai  # or anthropic, google, nova

# Configure only the selected provider
OPENAI_API_KEY=sk-...
OPENAI_DEFAULT_MODEL=gpt-4o-mini
```

**CLI Usage:**

```bash
npm run cli -- analyze <condition-id> --single-provider openai
npm run cli -- analyze <condition-id> --single-provider anthropic
npm run cli -- analyze <condition-id> --single-provider google
npm run cli -- analyze <condition-id> --single-provider nova
```

**Pros:**
- ✅ Lower cost (~$0.01-0.03 per analysis)
- ✅ Simpler API key management
- ✅ Still maintains agent specialization through prompts

**Cons:**
- ❌ Less diverse perspectives
- ❌ Potential for model-specific biases
- ❌ Single point of failure

**Cost per 100 analyses:**
- OpenAI (gpt-4o-mini): ~$1.00
- Anthropic (claude-3-haiku): ~$1.00
- Google (gemini-1.5-flash): ~$0.60
- Amazon Nova (nova-lite): ~$0.20
- Amazon Nova (nova-micro): ~$0.10

### Recommended Configurations

**For Production (Quality First):**

```bash
# Multi-provider mode with premium models
OPENAI_API_KEY=sk-...
OPENAI_DEFAULT_MODEL=gpt-4-turbo

ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_DEFAULT_MODEL=claude-3.5-sonnet-20240620

GOOGLE_API_KEY=AIza...
GOOGLE_DEFAULT_MODEL=gemini-1.5-pro
```

**For Production (Cost-Optimized):**

```bash
# Multi-provider mode with balanced models
OPENAI_API_KEY=sk-...
OPENAI_DEFAULT_MODEL=gpt-4o

ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_DEFAULT_MODEL=claude-3-sonnet-20240229

GOOGLE_API_KEY=AIza...
GOOGLE_DEFAULT_MODEL=gemini-1.5-flash
```

**For Production (Cost-Optimized with Nova 2):**

```bash
# Single-provider mode with Nova 2 Lite for advanced reasoning
LLM_SINGLE_PROVIDER=nova
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
NOVA_MODEL_NAME=global.amazon.nova-2-lite-v1:0

# Optional: Mix with other providers for specific agents
OPENAI_API_KEY=sk-...
OPENAI_DEFAULT_MODEL=gpt-4o
```

**For Production (Cost-Optimized with Nova v1):**

```bash
# Multi-provider mode with Nova v1 for maximum cost savings
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
NOVA_MODEL_NAME=amazon.nova-lite-v1:0

# Optional: Mix with other providers for specific agents
OPENAI_API_KEY=sk-...
OPENAI_DEFAULT_MODEL=gpt-4o
```

**For Development:**

```bash
# Single-provider mode with budget model
LLM_SINGLE_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_DEFAULT_MODEL=gpt-4o-mini
```

**For Maximum Budget Savings:**

```bash
# Single-provider mode with Nova Micro v1 (cheapest option)
LLM_SINGLE_PROVIDER=nova
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
NOVA_MODEL_NAME=amazon.nova-micro-v1:0
```

**For Advanced Reasoning:**

```bash
# Single-provider mode with Nova 2 Lite (extended thinking)
LLM_SINGLE_PROVIDER=nova
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
NOVA_MODEL_NAME=global.amazon.nova-2-lite-v1:0
```

## Cost Optimization

### 1. Choose the Right Mode

- **Development/Testing:** Single-provider mode with budget models
- **Production (High Volume):** Single-provider mode with balanced models
- **Production (High Quality):** Multi-provider mode with premium models

### 2. Model Selection

**Ultra-Budget Models (Nova v1):**
- Amazon Nova Micro v1: `amazon.nova-micro-v1:0` ($0.035/$0.14 per 1M tokens)
- Amazon Nova Lite v1: `amazon.nova-lite-v1:0` ($0.06/$0.24 per 1M tokens)

**Budget Models:**
- OpenAI: `gpt-4o-mini` ($0.15/$0.60 per 1M tokens)
- Anthropic: `claude-3-haiku` ($0.25/$1.25 per 1M tokens)
- Google: `gemini-1.5-flash` ($0.35/$1.05 per 1M tokens)

**Balanced Models:**
- Amazon Nova 2 Lite: `global.amazon.nova-2-lite-v1:0` ($0.30/$2.50 per 1M tokens, 1M context)
- Amazon Nova Pro v1: `amazon.nova-pro-v1:0` ($0.80/$3.20 per 1M tokens)
- OpenAI: `gpt-4o` ($5/$15 per 1M tokens)
- Anthropic: `claude-3-sonnet` ($3/$15 per 1M tokens)
- Google: `gemini-1.5-flash` ($0.35/$1.05 per 1M tokens)

### 3. Caching

Implement caching for frequently analyzed markets:

```typescript
// Cache results for 5 minutes
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
```

### 4. Rate Limiting

Implement rate limiting to avoid quota exhaustion:

```bash
# .env
POLYMARKET_RATE_LIMIT_BUFFER=80  # Use 80% of rate limit
```

### 5. Batch Processing

For high-volume scenarios, batch multiple analyses:

```typescript
// Process multiple markets in parallel
const results = await Promise.all(
  marketIds.map(id => analyzeMarket(id))
);
```

### 6. Monitor Costs

Use Opik to track costs:

```bash
# .env
OPIK_TRACK_COSTS=true
```

View cost breakdown in Opik dashboard:
- Per-agent costs
- Per-analysis costs
- Daily/monthly totals

### Cost Comparison

**100 Market Analyses:**

| Configuration | Cost | Quality | Speed |
|---------------|------|---------|-------|
| Multi-provider (premium) | $10-15 | Excellent | Medium |
| Multi-provider (balanced) | $5-8 | Very Good | Medium |
| Multi-provider (Nova-optimized) | $0.80-2 | Good | Fast |
| Single-provider (OpenAI gpt-4o-mini) | $1-2 | Good | Fast |
| Single-provider (Gemini flash) | $0.60-1 | Good | Very Fast |
| Single-provider (Nova 2 Lite) | $1.50-2 | Very Good | Fast |
| Single-provider (Nova Lite v1) | $0.20-0.40 | Good | Fast |
| Single-provider (Nova Micro v1) | $0.10-0.20 | Good | Fast |

## Troubleshooting

### OpenAI Issues

**"Invalid API key"**
- Verify key starts with `sk-proj-` or `sk-`
- Check key hasn't been revoked
- Ensure no extra spaces in `.env`

**"Rate limit exceeded"**
- Wait for rate limit window to reset
- Upgrade to higher tier ($5+ spent)
- Implement exponential backoff

**"Insufficient quota"**
- Add payment method
- Increase billing limits
- Check current usage in dashboard

### Anthropic Issues

**"Authentication failed"**
- Verify key starts with `sk-ant-`
- Check key is active in console
- Ensure correct API version

**"Rate limit exceeded"**
- Wait for rate limit window to reset
- Upgrade to higher tier ($5+ spent)
- Reduce request rate

**"Model not found"**
- Verify model name is correct
- Check model availability in your region
- Use latest model version

### Google Gemini Issues

**"API key not valid"**
- Verify key starts with `AIza`
- Check Generative Language API is enabled
- Ensure key restrictions allow API access

**"Quota exceeded"**
- Wait for quota reset (daily limit)
- Upgrade to paid tier
- Enable billing in Google Cloud Console

**"Model not found"**
- Verify model name is correct
- Check model is available in your region
- Use `gemini-1.5-flash` or `gemini-1.5-pro`

### Amazon Nova Issues

**"Authentication failed" / "Invalid AWS credentials"**
- Verify AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set correctly
- Check credentials haven't expired or been revoked
- Ensure no extra spaces in `.env` file
- Test credentials with: `aws sts get-caller-identity`

**"Access Denied" / "UnauthorizedException"**
- Verify IAM user has `bedrock:InvokeModel` permission
- Check IAM policy includes Nova model ARNs
- Ensure Bedrock service is enabled in your account
- Review IAM policy in AWS Console

**"Model not found" / "ResourceNotFoundException"**
- Verify model name is correct (e.g., `amazon.nova-lite-v1:0`)
- Check you've requested model access in Bedrock console
- Go to Bedrock → Model access → Request access for Nova models
- Wait for approval (usually instant)

**"Region not supported"**
- Verify AWS_REGION is set to a supported region
- Use `us-east-1`, `us-west-2`, `eu-west-1`, or `ap-southeast-1`
- Check [Bedrock Regions](https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-regions.html)

**"Throttling" / "Rate limit exceeded"**
- Wait for rate limit window to reset
- Implement exponential backoff (handled automatically)
- Request quota increase via AWS Service Quotas
- Consider using multiple regions for higher throughput

**"Connection timeout"**
- Check network connectivity to AWS
- Verify security groups allow outbound HTTPS (443)
- Increase timeout in Bedrock client configuration
- Check AWS service health dashboard

**High latency**
- Use region closest to your deployment
- Consider using Nova Lite instead of Nova Pro
- Check network latency to AWS region
- Monitor CloudWatch metrics for Bedrock

### General Issues

**"No API keys configured"**
- Ensure at least one provider is configured
- Check `.env` file exists and is loaded
- Verify environment variables are set

**"Configuration invalid"**
- Check single-provider matches configured provider
- Verify model names are correct
- Ensure no typos in environment variables

**High costs**
- Switch to single-provider mode with Nova
- Use ultra-budget models (Nova Micro, Nova Lite)
- Implement caching
- Monitor usage in Opik

## Best Practices

### Security

1. **Never commit API keys to version control**
2. **Use environment variables or secrets management**
3. **Rotate keys regularly (quarterly)**
4. **Set up billing alerts**
5. **Restrict API keys to specific IPs (if possible)**

### Performance

1. **Use appropriate models for each task**
2. **Implement caching for repeated analyses**
3. **Monitor rate limits and implement backoff**
4. **Use streaming for real-time responses (if needed)**

### Cost Management

1. **Start with single-provider mode for testing**
2. **Monitor costs daily using Opik**
3. **Set up billing alerts at $10, $50, $100**
4. **Use ultra-budget models for development (Nova Micro)**
5. **Implement request quotas per user/market**
6. **Consider Nova for high-volume production workloads**

## Support

For provider-specific issues:
- **OpenAI:** [https://help.openai.com/](https://help.openai.com/)
- **Anthropic:** [https://support.anthropic.com/](https://support.anthropic.com/)
- **Google:** [https://support.google.com/cloud/](https://support.google.com/cloud/)
- **Amazon (Bedrock):** [https://aws.amazon.com/support/](https://aws.amazon.com/support/)

For application issues:
- Check [Troubleshooting Guide](../README.md#troubleshooting)
- Review Opik traces
- Check application logs

---

**Last Updated:** January 2026
