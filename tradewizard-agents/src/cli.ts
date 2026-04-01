#!/usr/bin/env node
/**
 * CLI Interface for Market Intelligence Engine
 *
 * This CLI provides a command-line interface for analyzing prediction markets,
 * displaying trade recommendations, and inspecting Opik traces.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { analyzeMarket, getCheckpointer } from './workflow.js';
import { loadConfig, createConfig, type EngineConfig } from './config/index.js';
import { PolymarketClient } from './utils/polymarket-client.js';
import { createSupabaseClientManager } from './database/supabase-client.js';
import type { TradeRecommendation } from './models/types.js';
import type { GraphStateType } from './models/state.js';

const program = new Command();

// ============================================================================
// CLI Configuration
// ============================================================================

program
  .name('tradewizard-cli')
  .description('Market Intelligence Engine CLI - Analyze prediction markets with AI agents\n\n' +
    'Supported LLM Providers: OpenAI, Anthropic, Google, Amazon Nova (AWS Bedrock)')
  .version('1.0.0');

// ============================================================================
// Analyze Command
// ============================================================================

program
  .command('analyze')
  .description('Analyze a prediction market by condition ID')
  .argument('<conditionId>', 'Polymarket condition ID to analyze')
  .option('-d, --debug', 'Show debug information and graph state')
  .option('-v, --visualize', 'Generate LangGraph workflow visualization (Mermaid)')
  .option('--opik-trace', 'Open Opik trace in browser after analysis')
  .option('--single-provider <provider>', 'Use single LLM provider (openai|anthropic|google|nova)')
  .option('--model <model>', 'Override default model for single-provider mode')
  .option('--project <name>', 'Override Opik project name')
  .option('--show-costs', 'Display LLM cost tracking from Opik')
  // Nova-specific options
  .option('--nova-model <model>', 'Nova model variant (micro|lite|pro)')
  .option('--nova-region <region>', 'AWS region for Nova (e.g., us-east-1)')
  .option('--nova-temperature <temp>', 'Temperature for Nova models (0.0-1.0)', parseFloat)
  .option('--nova-max-tokens <tokens>', 'Max tokens for Nova models', parseInt)
  .option('--replay', 'Replay from checkpoint (if available)')
  // Advanced Agent Configuration
  .option('--enable-event-intelligence', 'Enable Event Intelligence agents (Breaking News, Event Impact)')
  .option('--enable-polling', 'Enable Polling & Statistical agents')
  .option('--enable-sentiment', 'Enable Sentiment & Narrative agents')
  .option('--enable-price-action', 'Enable Price Action agents (Momentum, Mean Reversion)')
  .option('--enable-event-scenario', 'Enable Event Scenario agents (Catalyst, Tail Risk)')
  .option('--enable-risk-philosophy', 'Enable Risk Philosophy agents (Aggressive, Conservative, Neutral)')
  .option('--enable-all-agents', 'Enable all advanced agent groups')
  .option('--cost-budget <amount>', 'Set maximum cost per analysis in USD (default: 2.0)', parseFloat)
  .option('--show-agent-selection', 'Display which agents were selected and why')
  .option('--show-signal-fusion', 'Display signal fusion details (weights, conflicts, alignment)')
  .option('--show-risk-perspectives', 'Display risk philosophy perspectives in recommendation')
  .option('--show-performance', 'Display agent performance metrics')
  .action(async (conditionId: string, options) => {
    const spinner = ora('Initializing Market Intelligence Engine...').start();

    try {
      // Build configuration with overrides
      const configOverrides: Partial<EngineConfig> = {};

      if (options.singleProvider) {
        const provider = options.singleProvider as 'openai' | 'anthropic' | 'google' | 'nova';
        configOverrides.llm = {
          singleProvider: provider,
        };

        // Add provider-specific config if model is specified
        if (options.model) {
          if (provider === 'openai') {
            configOverrides.llm.openai = {
              apiKey: process.env.OPENAI_API_KEY || '',
              defaultModel: options.model,
            };
          } else if (provider === 'anthropic') {
            configOverrides.llm.anthropic = {
              apiKey: process.env.ANTHROPIC_API_KEY || '',
              defaultModel: options.model,
            };
          } else if (provider === 'google') {
            configOverrides.llm.google = {
              apiKey: process.env.GOOGLE_API_KEY || '',
              defaultModel: options.model,
            };
          } else if (provider === 'nova') {
            // Nova configuration from CLI options
            const novaModelMap: Record<string, string> = {
              'micro': 'amazon.nova-micro-v1:0',
              'lite': 'amazon.nova-lite-v1:0',
              'pro': 'amazon.nova-pro-v1:0',
            };
            
            const modelName = options.novaModel 
              ? novaModelMap[options.novaModel] || options.novaModel
              : options.model || 'amazon.nova-lite-v1:0';

            configOverrides.llm.nova = {
              awsRegion: options.novaRegion || process.env.AWS_REGION || 'us-east-1',
              modelName: modelName,
              temperature: options.novaTemperature,
              maxTokens: options.novaMaxTokens,
            };
          }
        }
      }

      if (options.project) {
        configOverrides.opik = {
          projectName: options.project,
          tags: [],
          trackCosts: true,
        };
      }

      // Advanced Agent Configuration
      if (options.enableAllAgents) {
        configOverrides.advancedAgents = {
          eventIntelligence: { enabled: true, breakingNews: true, eventImpact: true },
          pollingStatistical: { enabled: true, pollingIntelligence: true, historicalPattern: true },
          sentimentNarrative: { enabled: true, mediaSentiment: true, socialSentiment: true, narrativeVelocity: true },
          priceAction: { enabled: true, momentum: true, meanReversion: true, minVolumeThreshold: 1000 },
          eventScenario: { enabled: true, catalyst: true, tailRisk: true },
          riskPhilosophy: { enabled: true, aggressive: true, conservative: true, neutral: true },
        };
      } else {
        // Individual agent group overrides
        if (options.enableEventIntelligence || options.enablePolling || options.enableSentiment || 
            options.enablePriceAction || options.enableEventScenario || options.enableRiskPhilosophy) {
          configOverrides.advancedAgents = {
            eventIntelligence: options.enableEventIntelligence 
              ? { enabled: true, breakingNews: true, eventImpact: true }
              : undefined,
            pollingStatistical: options.enablePolling
              ? { enabled: true, pollingIntelligence: true, historicalPattern: true }
              : undefined,
            sentimentNarrative: options.enableSentiment
              ? { enabled: true, mediaSentiment: true, socialSentiment: true, narrativeVelocity: true }
              : undefined,
            priceAction: options.enablePriceAction
              ? { enabled: true, momentum: true, meanReversion: true, minVolumeThreshold: 1000 }
              : undefined,
            eventScenario: options.enableEventScenario
              ? { enabled: true, catalyst: true, tailRisk: true }
              : undefined,
            riskPhilosophy: options.enableRiskPhilosophy
              ? { enabled: true, aggressive: true, conservative: true, neutral: true }
              : undefined,
          } as any;
        }
      }

      // Cost budget override
      if (options.costBudget) {
        configOverrides.costOptimization = {
          maxCostPerAnalysis: options.costBudget,
          skipLowImpactAgents: false,
          batchLLMRequests: true,
        };
      }

      const config = Object.keys(configOverrides).length > 0
        ? createConfig(configOverrides)
        : loadConfig();

      // Display configuration
      spinner.text = 'Configuration loaded';
      if (options.debug) {
        console.log(chalk.dim('\nConfiguration:'));
        console.log(chalk.dim(`  LLM Mode: ${config.llm.singleProvider ? 'Single-Provider (' + config.llm.singleProvider + ')' : 'Multi-Provider'}`));
        
        // Display Nova-specific configuration if using Nova
        if (config.llm.singleProvider === 'nova' && config.llm.nova) {
          console.log(chalk.dim(`  Nova Model: ${config.llm.nova.modelName}`));
          console.log(chalk.dim(`  Nova Region: ${config.llm.nova.awsRegion}`));
          if (config.llm.nova.temperature !== undefined) {
            console.log(chalk.dim(`  Nova Temperature: ${config.llm.nova.temperature}`));
          }
          if (config.llm.nova.maxTokens !== undefined) {
            console.log(chalk.dim(`  Nova Max Tokens: ${config.llm.nova.maxTokens}`));
          }
        }
        
        console.log(chalk.dim(`  Opik Project: ${config.opik.projectName}`));
        console.log(chalk.dim(`  Min Agents: ${config.agents.minAgentsRequired}`));
        console.log(chalk.dim(`  Edge Threshold: ${(config.consensus.minEdgeThreshold * 100).toFixed(1)}%`));
        console.log(chalk.dim(`  Max Cost: $${config.costOptimization.maxCostPerAnalysis.toFixed(2)}`));
        
        // Display advanced agent configuration
        const enabledGroups: string[] = [];
        if (config.advancedAgents.eventIntelligence.enabled) enabledGroups.push('Event Intelligence');
        if (config.advancedAgents.pollingStatistical.enabled) enabledGroups.push('Polling & Statistical');
        if (config.advancedAgents.sentimentNarrative.enabled) enabledGroups.push('Sentiment & Narrative');
        if (config.advancedAgents.priceAction.enabled) enabledGroups.push('Price Action');
        if (config.advancedAgents.eventScenario.enabled) enabledGroups.push('Event Scenario');
        if (config.advancedAgents.riskPhilosophy.enabled) enabledGroups.push('Risk Philosophy');
        
        if (enabledGroups.length > 0) {
          console.log(chalk.dim(`  Advanced Agents: ${enabledGroups.join(', ')}`));
        } else {
          console.log(chalk.dim('  Advanced Agents: MVP Only'));
        }
      }

      // Initialize Polymarket client
      spinner.text = 'Connecting to Polymarket...';
      const polymarketClient = new PolymarketClient(config.polymarket);

      // Initialize Supabase client manager for PostgreSQL checkpointing
      spinner.text = 'Initializing database connection...';
      const supabaseManager = createSupabaseClientManager();
      await supabaseManager.connect();

      // Analyze market
      spinner.text = `Analyzing market ${conditionId}...`;
      const analysisResult = await analyzeMarket(conditionId, config, polymarketClient, supabaseManager);

      spinner.succeed(chalk.green('Analysis complete!'));

      // Display recommendation
      if (analysisResult.recommendation) {
        displayRecommendation(analysisResult.recommendation);
        
        // Display agent signals if available
        if (analysisResult.agentSignals.length > 0) {
          console.log(chalk.bold('\nAgent Signals:'));
          analysisResult.agentSignals.forEach((signal) => {
            console.log(chalk.dim(`  - ${signal.agentName}: ${signal.direction} (confidence: ${(signal.confidence * 100).toFixed(1)}%, fair prob: ${(signal.fairProbability * 100).toFixed(1)}%)`));
          });
        }
      } else {
        console.log(chalk.yellow('\n⚠️  No recommendation generated'));
      }

      // Show agent selection if requested
      if (options.showAgentSelection) {
        await displayAgentSelection(conditionId, config);
      }

      // Show signal fusion if requested
      if (options.showSignalFusion) {
        await displaySignalFusion(conditionId, config);
      }

      // Show risk perspectives if requested
      if (options.showRiskPerspectives) {
        await displayRiskPerspectives(conditionId, config);
      }

      // Show performance metrics if requested
      if (options.showPerformance) {
        await displayPerformanceMetrics(conditionId, config);
      }

      // Show debug information if requested
      if (options.debug) {
        await displayDebugInfo(conditionId, config);
      }

      // Show visualization if requested
      if (options.visualize) {
        displayVisualization();
      }

      // Show costs if requested
      if (options.showCosts) {
        displayCostInfo(config);
      }

      // Open Opik trace if requested
      if (options.opikTrace) {
        openOpikTrace(conditionId, config);
      }

    } catch (error) {
      spinner.fail(chalk.red('Analysis failed'));
      console.error(chalk.red('\n❌ Error:'), error instanceof Error ? error.message : String(error));
      if (options.debug && error instanceof Error) {
        console.error(chalk.dim('\nStack trace:'));
        console.error(chalk.dim(error.stack));
      }
      process.exit(1);
    }
  });

// ============================================================================
// History Command
// ============================================================================

program
  .command('history')
  .description('Query historical traces from Opik by market ID')
  .argument('<conditionId>', 'Polymarket condition ID to query')
  .option('--project <name>', 'Override Opik project name')
  .action(async (conditionId: string, options) => {
    const spinner = ora('Querying Opik traces...').start();

    try {
      const configOverrides: Partial<EngineConfig> = {};
      if (options.project) {
        configOverrides.opik = {
          projectName: options.project,
          tags: [],
          trackCosts: true,
        };
      }

      const config = Object.keys(configOverrides).length > 0
        ? createConfig(configOverrides)
        : loadConfig();

      spinner.succeed(chalk.green('Query complete!'));

      console.log(chalk.cyan('\n📊 Historical Traces'));
      console.log(chalk.dim('─'.repeat(60)));
      console.log(chalk.yellow('\nNote: To view detailed traces, use the Opik web UI:'));
      console.log(chalk.dim(`  Project: ${config.opik.projectName}`));
      console.log(chalk.dim(`  Thread ID: ${conditionId}`));
      
      if (config.opik.baseUrl) {
        console.log(chalk.dim(`  URL: ${config.opik.baseUrl}/projects/${config.opik.projectName}/traces?thread_id=${conditionId}`));
      } else {
        console.log(chalk.dim(`  URL: https://www.comet.com/opik/projects/${config.opik.projectName}/traces?thread_id=${conditionId}`));
      }

    } catch (error) {
      spinner.fail(chalk.red('Query failed'));
      console.error(chalk.red('\n❌ Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// ============================================================================
// Checkpoint Command
// ============================================================================

program
  .command('checkpoint')
  .description('Inspect checkpoint state for a market analysis')
  .argument('<conditionId>', 'Polymarket condition ID to inspect')
  .option('--project <name>', 'Override Opik project name')
  .action(async (conditionId: string, options) => {
    const spinner = ora('Loading checkpoint...').start();

    try {
      const configOverrides: Partial<EngineConfig> = {};
      if (options.project) {
        configOverrides.opik = {
          projectName: options.project,
          tags: [],
          trackCosts: true,
        };
      }

      const config = Object.keys(configOverrides).length > 0
        ? createConfig(configOverrides)
        : loadConfig();

      const checkpointer = await getCheckpointer(config);

      // Try to get checkpoint state
      const checkpoint = await checkpointer.get({
        configurable: { thread_id: conditionId },
      });

      spinner.succeed(chalk.green('Checkpoint loaded!'));

      if (checkpoint) {
        console.log(chalk.cyan('\n📦 Checkpoint State'));
        console.log(chalk.dim('─'.repeat(60)));
        
        const state = checkpoint.channel_values as GraphStateType;
        
        console.log(chalk.bold('\nMarket:'), state.conditionId || 'N/A');
        console.log(chalk.bold('MBD:'), state.mbd ? '✓ Present' : '✗ Missing');
        console.log(chalk.bold('Agent Signals:'), state.agentSignals?.length || 0);
        console.log(chalk.bold('Bull Thesis:'), state.bullThesis ? '✓ Present' : '✗ Missing');
        console.log(chalk.bold('Bear Thesis:'), state.bearThesis ? '✓ Present' : '✗ Missing');
        console.log(chalk.bold('Debate Record:'), state.debateRecord ? '✓ Present' : '✗ Missing');
        console.log(chalk.bold('Consensus:'), state.consensus ? '✓ Present' : '✗ Missing');
        console.log(chalk.bold('Recommendation:'), state.recommendation ? '✓ Present' : '✗ Missing');
        console.log(chalk.bold('Audit Log Entries:'), state.auditLog?.length || 0);
        
        if (state.ingestionError) {
          console.log(chalk.red('\n⚠️  Ingestion Error:'), state.ingestionError.type);
        }
        
        if (state.agentErrors && state.agentErrors.length > 0) {
          console.log(chalk.yellow(`\n⚠️  Agent Errors: ${state.agentErrors.length}`));
        }
        
        if (state.consensusError) {
          console.log(chalk.red('\n⚠️  Consensus Error:'), state.consensusError.type);
        }
      } else {
        console.log(chalk.yellow('\n⚠️  No checkpoint found for this market'));
      }

    } catch (error) {
      spinner.fail(chalk.red('Failed to load checkpoint'));
      console.error(chalk.red('\n❌ Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// ============================================================================
// Nova Status Command
// ============================================================================

program
  .command('nova-status')
  .description('Check Nova configuration and display available models with pricing')
  .option('--show-usage', 'Show Nova usage statistics from recent analyses')
  .action(async (options) => {
    const spinner = ora('Checking Nova configuration...').start();

    try {
      // Import required modules
      const { LLMConfigManager } = await import('./config/llm-config.js');
      const { BedrockClient } = await import('./utils/bedrock-client.js');

      // Check if Nova is configured
      const isConfigured = LLMConfigManager.isNovaConfigured();

      if (!isConfigured) {
        spinner.warn(chalk.yellow('Nova is not configured'));
        
        console.log(chalk.cyan('\n🔧 Nova Configuration'));
        console.log(chalk.dim('─'.repeat(60)));
        console.log(chalk.yellow('\nNova is not currently configured.'));
        console.log(chalk.dim('\nRequired environment variables:'));
        
        const missing = LLMConfigManager.getMissingNovaVariables();
        missing.forEach(varName => {
          console.log(chalk.dim(`  - ${varName}`));
        });
        
        console.log(chalk.dim('\nTo configure Nova, set these environment variables:'));
        console.log(chalk.dim('  export AWS_REGION=us-east-1'));
        console.log(chalk.dim('  export AWS_ACCESS_KEY_ID=your_access_key'));
        console.log(chalk.dim('  export AWS_SECRET_ACCESS_KEY=your_secret_key'));
        console.log(chalk.dim('  export NOVA_MODEL_NAME=amazon.nova-lite-v1:0  # optional'));
      } else {
        spinner.succeed(chalk.green('Nova is configured!'));
        
        // Display current configuration
        console.log(chalk.cyan('\n🔧 Nova Configuration'));
        console.log(chalk.dim('─'.repeat(60)));
        
        const env = process.env;
        console.log(chalk.bold('\nAWS Region:'), env.AWS_REGION || 'Not set');
        console.log(chalk.bold('Model:'), env.NOVA_MODEL_NAME || 'amazon.nova-lite-v1:0 (default)');
        
        if (env.NOVA_TEMPERATURE) {
          console.log(chalk.bold('Temperature:'), env.NOVA_TEMPERATURE);
        }
        if (env.NOVA_MAX_TOKENS) {
          console.log(chalk.bold('Max Tokens:'), env.NOVA_MAX_TOKENS);
        }
        if (env.NOVA_TOP_P) {
          console.log(chalk.bold('Top P:'), env.NOVA_TOP_P);
        }
        
        console.log(chalk.bold('Credentials:'), env.AWS_ACCESS_KEY_ID ? '✓ Configured' : '✗ Using default credential chain');
      }

      // Display available models and pricing
      console.log(chalk.cyan('\n💰 Available Nova Models'));
      console.log(chalk.dim('─'.repeat(60)));
      
      const models = BedrockClient.getAvailableModels();
      
      console.log(chalk.bold('\nModel Variants:\n'));
      
      models.forEach(model => {
        const isCurrentModel = process.env.NOVA_MODEL_NAME === model.modelId;
        const marker = isCurrentModel ? chalk.green('→ ') : '  ';
        
        console.log(marker + chalk.bold(model.name));
        console.log(`  Model ID: ${chalk.dim(model.modelId)}`);
        console.log(`  Input:  ${chalk.green('$' + model.inputCostPer1kTokens.toFixed(6))} per 1K tokens`);
        console.log(`  Output: ${chalk.green('$' + model.outputCostPer1kTokens.toFixed(6))} per 1K tokens`);
        console.log(`  Max Tokens: ${chalk.dim(model.maxTokens.toLocaleString())}`);
        
        // Calculate example costs
        const exampleInputTokens = 1000;
        const exampleOutputTokens = 500;
        const exampleCost = (exampleInputTokens / 1000 * model.inputCostPer1kTokens) + 
                           (exampleOutputTokens / 1000 * model.outputCostPer1kTokens);
        console.log(`  Example: ${chalk.dim(`1K input + 500 output = $${exampleCost.toFixed(4)}`)}`);
        console.log('');
      });

      // Display usage statistics if requested
      if (options.showUsage) {
        console.log(chalk.cyan('\n📊 Nova Usage Statistics'));
        console.log(chalk.dim('─'.repeat(60)));
        console.log(chalk.yellow('\nNote: Usage statistics are tracked in Opik.'));
        console.log(chalk.dim('To view detailed Nova usage:'));
        console.log(chalk.dim('  1. Open the Opik web UI'));
        console.log(chalk.dim('  2. Filter traces by provider tag: "nova"'));
        console.log(chalk.dim('  3. View token usage and costs in trace metadata'));
        
        if (process.env.OPIK_PROJECT_NAME) {
          console.log(chalk.dim(`\nOpik Project: ${process.env.OPIK_PROJECT_NAME}`));
        }
      }

      // Display CLI usage examples
      console.log(chalk.cyan('\n📖 Usage Examples'));
      console.log(chalk.dim('─'.repeat(60)));
      console.log(chalk.dim('\nAnalyze a market with Nova:'));
      console.log(chalk.dim('  npm run cli -- analyze <conditionId> --single-provider nova'));
      console.log(chalk.dim('\nUse specific Nova model:'));
      console.log(chalk.dim('  npm run cli -- analyze <conditionId> --single-provider nova --nova-model pro'));
      console.log(chalk.dim('\nSet Nova parameters:'));
      console.log(chalk.dim('  npm run cli -- analyze <conditionId> --single-provider nova \\'));
      console.log(chalk.dim('    --nova-temperature 0.5 --nova-max-tokens 2048'));

    } catch (error) {
      spinner.fail(chalk.red('Failed to check Nova status'));
      console.error(chalk.red('\n❌ Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Display formatted trade recommendation
 */
function displayRecommendation(rec: TradeRecommendation): void {
  console.log(chalk.cyan('\n📈 Trade Recommendation'));
  console.log(chalk.dim('─'.repeat(60)));

  // Action
  const actionColor = rec.action === 'LONG_YES' ? chalk.green : rec.action === 'LONG_NO' ? chalk.red : chalk.yellow;
  console.log(chalk.bold('\nAction:'), actionColor(rec.action));

  // Expected Value
  const evColor = rec.expectedValue > 0 ? chalk.green : chalk.red;
  console.log(chalk.bold('Expected Value:'), evColor(`$${rec.expectedValue.toFixed(2)} per $100`));

  // Win Probability
  console.log(chalk.bold('Win Probability:'), `${(rec.winProbability * 100).toFixed(1)}%`);

  // Entry Zone
  console.log(chalk.bold('Entry Zone:'), `${rec.entryZone[0].toFixed(2)}¢ - ${rec.entryZone[1].toFixed(2)}¢`);

  // Target Zone
  console.log(chalk.bold('Target Zone:'), `${rec.targetZone[0].toFixed(2)}¢ - ${rec.targetZone[1].toFixed(2)}¢`);

  // Liquidity Risk
  const riskColor = rec.liquidityRisk === 'low' ? chalk.green : rec.liquidityRisk === 'medium' ? chalk.yellow : chalk.red;
  console.log(chalk.bold('Liquidity Risk:'), riskColor(rec.liquidityRisk.toUpperCase()));

  // Explanation
  console.log(chalk.cyan('\n💡 Explanation'));
  console.log(chalk.dim('─'.repeat(60)));
  console.log(chalk.bold('\nSummary:'));
  console.log(rec.explanation.summary);

  console.log(chalk.bold('\nCore Thesis:'));
  console.log(rec.explanation.coreThesis);

  if (rec.explanation.keyCatalysts.length > 0) {
    console.log(chalk.bold('\nKey Catalysts:'));
    rec.explanation.keyCatalysts.forEach((catalyst, i) => {
      console.log(`  ${i + 1}. ${catalyst}`);
    });
  }

  if (rec.explanation.failureScenarios.length > 0) {
    console.log(chalk.bold('\nFailure Scenarios:'));
    rec.explanation.failureScenarios.forEach((scenario, i) => {
      console.log(`  ${i + 1}. ${scenario}`);
    });
  }

  if (rec.explanation.uncertaintyNote) {
    console.log(chalk.yellow('\n⚠️  Uncertainty Note:'));
    console.log(rec.explanation.uncertaintyNote);
  }

  // Metadata
  console.log(chalk.cyan('\n📊 Metadata'));
  console.log(chalk.dim('─'.repeat(60)));
  console.log(chalk.bold('Market Probability:'), `${(rec.metadata.marketProbability * 100).toFixed(1)}%`);
  console.log(chalk.bold('Consensus Probability:'), `${(rec.metadata.consensusProbability * 100).toFixed(1)}%`);
  console.log(chalk.bold('Edge:'), `${(rec.metadata.edge * 100).toFixed(1)}%`);
  console.log(chalk.bold('Confidence Band:'), `${(rec.metadata.confidenceBand[0] * 100).toFixed(1)}% - ${(rec.metadata.confidenceBand[1] * 100).toFixed(1)}%`);
}

/**
 * Display debug information and graph state
 */
async function displayDebugInfo(conditionId: string, config: EngineConfig): Promise<void> {
  console.log(chalk.cyan('\n🔍 Debug Information'));
  console.log(chalk.dim('─'.repeat(60)));

  try {
    const checkpointer = await getCheckpointer(config);
    const checkpoint = await checkpointer.get({
      configurable: { thread_id: conditionId },
    });

    if (checkpoint) {
      const state = checkpoint.channel_values as GraphStateType;

      // Display audit log
      if (state.auditLog && state.auditLog.length > 0) {
        console.log(chalk.bold('\nAudit Log:'));
        state.auditLog.forEach((entry, i) => {
          const timestamp = new Date(entry.timestamp).toISOString();
          console.log(chalk.dim(`  ${i + 1}. [${timestamp}] ${entry.stage}`));
        });
      }

      // Display agent signals
      if (state.agentSignals && state.agentSignals.length > 0) {
        console.log(chalk.bold('\nAgent Signals:'));
        state.agentSignals.forEach((signal) => {
          console.log(chalk.dim(`  - ${signal.agentName}: ${signal.direction} (confidence: ${(signal.confidence * 100).toFixed(1)}%, fair prob: ${(signal.fairProbability * 100).toFixed(1)}%)`));
        });
      }

      // Display errors
      if (state.agentErrors && state.agentErrors.length > 0) {
        console.log(chalk.yellow('\nAgent Errors:'));
        state.agentErrors.forEach((error) => {
          console.log(chalk.dim(`  - ${error.agentName}: ${error.type}`));
        });
      }

      // Display debate record
      if (state.debateRecord) {
        console.log(chalk.bold('\nDebate Scores:'));
        console.log(chalk.dim(`  Bull: ${state.debateRecord.bullScore.toFixed(2)}`));
        console.log(chalk.dim(`  Bear: ${state.debateRecord.bearScore.toFixed(2)}`));
      }

      // Display consensus
      if (state.consensus) {
        console.log(chalk.bold('\nConsensus:'));
        console.log(chalk.dim(`  Probability: ${(state.consensus.consensusProbability * 100).toFixed(1)}%`));
        console.log(chalk.dim(`  Regime: ${state.consensus.regime}`));
        console.log(chalk.dim(`  Disagreement: ${(state.consensus.disagreementIndex * 100).toFixed(1)}%`));
      }
    } else {
      console.log(chalk.yellow('\n⚠️  No checkpoint data available'));
    }
  } catch (error) {
    console.log(chalk.red('\n❌ Failed to load debug information'));
    console.error(chalk.dim(error instanceof Error ? error.message : String(error)));
  }
}

/**
 * Display LangGraph workflow visualization
 */
function displayVisualization(): void {
  console.log(chalk.cyan('\n🎨 LangGraph Workflow Visualization'));
  console.log(chalk.dim('─'.repeat(60)));
  console.log(chalk.dim('\nMermaid Diagram:'));
  console.log(chalk.dim(`
graph TD
    START[START] --> MI[Market Ingestion]
    MI -->|Success| MMA[Market Microstructure Agent]
    MI -->|Success| PBA[Probability Baseline Agent]
    MI -->|Success| RAA[Risk Assessment Agent]
    MI -->|Error| END[END]
    MMA --> TC[Thesis Construction]
    PBA --> TC
    RAA --> TC
    TC --> CE[Cross Examination]
    CE --> CON[Consensus Engine]
    CON --> RG[Recommendation Generation]
    RG --> END
  `));
  console.log(chalk.yellow('\nNote: Copy the Mermaid diagram above to visualize at https://mermaid.live'));
}

/**
 * Display cost information from Opik
 */
function displayCostInfo(config: EngineConfig): void {
  console.log(chalk.cyan('\n💰 Cost Tracking'));
  console.log(chalk.dim('─'.repeat(60)));
  console.log(chalk.yellow('\nNote: Detailed cost tracking is available in the Opik web UI'));
  console.log(chalk.dim(`  Project: ${config.opik.projectName}`));
  console.log(chalk.dim('  Opik automatically tracks token usage and costs for all LLM calls'));
}

/**
 * Open Opik trace in browser
 */
function openOpikTrace(conditionId: string, config: EngineConfig): void {
  const baseUrl = config.opik.baseUrl || 'https://www.comet.com/opik';
  const url = `${baseUrl}/projects/${config.opik.projectName}/traces?thread_id=${conditionId}`;

  console.log(chalk.cyan('\n🔗 Opik Trace'));
  console.log(chalk.dim('─'.repeat(60)));
  console.log(chalk.bold('\nTrace URL:'));
  console.log(chalk.blue(url));
  console.log(chalk.dim('\nOpen this URL in your browser to view the detailed trace'));
}

/**
 * Display agent selection decisions
 */
async function displayAgentSelection(conditionId: string, config: EngineConfig): Promise<void> {
  console.log(chalk.cyan('\n🤖 Agent Selection'));
  console.log(chalk.dim('─'.repeat(60)));

  try {
    const checkpointer = await getCheckpointer(config);
    const checkpoint = await checkpointer.get({
      configurable: { thread_id: conditionId },
    });

    if (checkpoint) {
      const state = checkpoint.channel_values as GraphStateType;

      if (state.activeAgents && state.activeAgents.length > 0) {
        console.log(chalk.bold('\nActive Agents:'));
        state.activeAgents.forEach((agent) => {
          console.log(chalk.green(`  ✓ ${agent}`));
        });

        // Display selection reasoning from audit log
        const selectionEntry = state.auditLog?.find(entry => entry.stage === 'agent_selection');
        if (selectionEntry && selectionEntry.data) {
          const data = selectionEntry.data as any;
          console.log(chalk.bold('\nSelection Reasoning:'));
          console.log(chalk.dim(`  Market Type: ${data.marketType || 'unknown'}`));
          
          if (data.selectedAgents && Array.isArray(data.selectedAgents)) {
            console.log(chalk.dim(`  Total Selected: ${data.selectedAgents.length}`));
          }
        }
      } else {
        console.log(chalk.yellow('\n⚠️  No agent selection data available'));
      }
    } else {
      console.log(chalk.yellow('\n⚠️  No checkpoint data available'));
    }
  } catch (error) {
    console.log(chalk.red('\n❌ Failed to load agent selection data'));
    console.error(chalk.dim(error instanceof Error ? error.message : String(error)));
  }
}

/**
 * Display signal fusion details
 */
async function displaySignalFusion(conditionId: string, config: EngineConfig): Promise<void> {
  console.log(chalk.cyan('\n🔀 Signal Fusion'));
  console.log(chalk.dim('─'.repeat(60)));

  try {
    const checkpointer = await getCheckpointer(config);
    const checkpoint = await checkpointer.get({
      configurable: { thread_id: conditionId },
    });

    if (checkpoint) {
      const state = checkpoint.channel_values as GraphStateType;

      if (state.fusedSignal) {
        console.log(chalk.bold('\nFused Signal:'));
        console.log(chalk.dim(`  Fair Probability: ${(state.fusedSignal.fairProbability * 100).toFixed(1)}%`));
        console.log(chalk.dim(`  Confidence: ${(state.fusedSignal.confidence * 100).toFixed(1)}%`));

        if (state.fusedSignal.weights) {
          console.log(chalk.bold('\nAgent Weights:'));
          Object.entries(state.fusedSignal.weights).forEach(([agent, weight]) => {
            console.log(chalk.dim(`  ${agent}: ${(weight as number).toFixed(2)}`));
          });
        }

        if (state.fusedSignal.conflictingSignals && state.fusedSignal.conflictingSignals.length > 0) {
          console.log(chalk.bold('\nSignal Conflicts:'));
          state.fusedSignal.conflictingSignals.forEach((conflict) => {
            console.log(chalk.yellow(`  ⚠️  ${conflict.agent1} vs ${conflict.agent2}: ${conflict.disagreement.toFixed(2)}`));
          });
        }

        if (state.fusedSignal.signalAlignment !== undefined) {
          console.log(chalk.bold('\nSignal Alignment:'));
          console.log(chalk.dim(`  Alignment Score: ${(state.fusedSignal.signalAlignment * 100).toFixed(1)}%`));
        }

        if (state.fusedSignal.confidence !== undefined) {
          console.log(chalk.bold('\nFusion Confidence:'));
          console.log(chalk.dim(`  Overall Confidence: ${(state.fusedSignal.confidence * 100).toFixed(1)}%`));
        }
      } else {
        console.log(chalk.yellow('\n⚠️  No signal fusion data available (using raw agent signals)'));
      }
    } else {
      console.log(chalk.yellow('\n⚠️  No checkpoint data available'));
    }
  } catch (error) {
    console.log(chalk.red('\n❌ Failed to load signal fusion data'));
    console.error(chalk.dim(error instanceof Error ? error.message : String(error)));
  }
}

/**
 * Display risk philosophy perspectives
 */
async function displayRiskPerspectives(conditionId: string, config: EngineConfig): Promise<void> {
  console.log(chalk.cyan('\n⚖️  Risk Philosophy Perspectives'));
  console.log(chalk.dim('─'.repeat(60)));

  try {
    const checkpointer = await getCheckpointer(config);
    const checkpoint = await checkpointer.get({
      configurable: { thread_id: conditionId },
    });

    if (checkpoint) {
      const state = checkpoint.channel_values as GraphStateType;

      if (state.riskPhilosophySignals) {
        const signals = state.riskPhilosophySignals;
        const philosophies = ['aggressive', 'conservative', 'neutral'] as const;
        let hasSignals = false;

        philosophies.forEach((philosophy) => {
          const signal = signals[philosophy];
          if (signal) {
            hasSignals = true;
            const philosophyName = philosophy.charAt(0).toUpperCase() + philosophy.slice(1);
            console.log(chalk.bold(`\n${philosophyName}:`));
            console.log(chalk.dim(`  Direction: ${signal.direction}`));
            console.log(chalk.dim(`  Fair Probability: ${(signal.fairProbability * 100).toFixed(1)}%`));
            console.log(chalk.dim(`  Confidence: ${(signal.confidence * 100).toFixed(1)}%`));

            if (signal.metadata) {
              const metadata = signal.metadata as any;
              
              if (metadata.recommendedPositionSize !== undefined) {
                console.log(chalk.dim(`  Position Size: ${(metadata.recommendedPositionSize * 100).toFixed(1)}% of bankroll`));
              }
              
              if (metadata.kellyCriterion !== undefined) {
                console.log(chalk.dim(`  Kelly Criterion: ${(metadata.kellyCriterion * 100).toFixed(1)}%`));
              }
              
              if (metadata.hedgingStrategy) {
                console.log(chalk.dim(`  Hedging: ${metadata.hedgingStrategy}`));
              }
              
              if (metadata.maxDrawdownTolerance !== undefined) {
                console.log(chalk.dim(`  Max Drawdown: ${(metadata.maxDrawdownTolerance * 100).toFixed(1)}%`));
              }
              
              if (metadata.convictionLevel) {
                console.log(chalk.dim(`  Conviction: ${metadata.convictionLevel}`));
              }
            }

            if (signal.keyDrivers && signal.keyDrivers.length > 0) {
              console.log(chalk.dim(`  Key Drivers: ${signal.keyDrivers.slice(0, 2).join(', ')}`));
            }
          }
        });

        if (!hasSignals) {
          console.log(chalk.yellow('\n⚠️  No risk philosophy signals available'));
          console.log(chalk.dim('  Enable risk philosophy agents with --enable-risk-philosophy'));
        }
      } else {
        console.log(chalk.yellow('\n⚠️  No risk philosophy signals available'));
        console.log(chalk.dim('  Enable risk philosophy agents with --enable-risk-philosophy'));
      }
    } else {
      console.log(chalk.yellow('\n⚠️  No checkpoint data available'));
    }
  } catch (error) {
    console.log(chalk.red('\n❌ Failed to load risk philosophy data'));
    console.error(chalk.dim(error instanceof Error ? error.message : String(error)));
  }
}

/**
 * Display agent performance metrics
 */
async function displayPerformanceMetrics(conditionId: string, config: EngineConfig): Promise<void> {
  console.log(chalk.cyan('\n📊 Agent Performance Metrics'));
  console.log(chalk.dim('─'.repeat(60)));

  try {
    const checkpointer = await getCheckpointer(config);
    const checkpoint = await checkpointer.get({
      configurable: { thread_id: conditionId },
    });

    if (checkpoint) {
      const state = checkpoint.channel_values as GraphStateType;

      if (state.agentPerformance && Object.keys(state.agentPerformance).length > 0) {
        console.log(chalk.bold('\nAgent Performance:'));
        
        // Sort agents by accuracy
        const sortedAgents = Object.entries(state.agentPerformance)
          .sort(([, a], [, b]) => (b as any).accuracy - (a as any).accuracy);

        sortedAgents.forEach(([agentName, metrics]) => {
          const m = metrics as any;
          const agentDisplayName = agentName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          
          console.log(chalk.bold(`\n  ${agentDisplayName}:`));
          console.log(chalk.dim(`    Accuracy: ${(m.accuracy * 100).toFixed(1)}%`));
          console.log(chalk.dim(`    Total Predictions: ${m.totalPredictions || 0}`));
          console.log(chalk.dim(`    Correct: ${m.correctPredictions || 0}`));
          
          if (m.averageConfidence !== undefined) {
            console.log(chalk.dim(`    Avg Confidence: ${(m.averageConfidence * 100).toFixed(1)}%`));
          }
          
          if (m.calibrationScore !== undefined) {
            console.log(chalk.dim(`    Calibration: ${(m.calibrationScore * 100).toFixed(1)}%`));
          }
        });

        console.log(chalk.dim('\n  Note: Performance metrics are updated when markets resolve'));
      } else {
        console.log(chalk.yellow('\n⚠️  No performance metrics available'));
        console.log(chalk.dim('  Performance tracking must be enabled in configuration'));
        console.log(chalk.dim('  Metrics are calculated after markets resolve'));
      }
    } else {
      console.log(chalk.yellow('\n⚠️  No checkpoint data available'));
    }
  } catch (error) {
    console.log(chalk.red('\n❌ Failed to load performance metrics'));
    console.error(chalk.dim(error instanceof Error ? error.message : String(error)));
  }
}

// ============================================================================
// Memory Metrics Command
// ============================================================================

program
  .command('memory-metrics')
  .description('Display memory system metrics and performance statistics')
  .option('--reset', 'Reset all metrics after displaying')
  .option('--check-alerts', 'Check alert thresholds and display warnings')
  .option('--audit-log', 'Display complete audit log')
  .option('--audit-operation <type>', 'Filter audit log by operation type (retrieval|evolution_tracking|context_formatting|validation)')
  .option('--audit-market <marketId>', 'Filter audit log by market ID')
  .option('--audit-agent <agentName>', 'Filter audit log by agent name')
  .action(async (options) => {
    console.log(chalk.cyan('\n📊 Memory System Metrics'));
    console.log(chalk.dim('═'.repeat(80)));

    try {
      const { getMemoryMetricsCollector } = await import('./utils/memory-metrics.js');
      const metricsCollector = getMemoryMetricsCollector();

      // Display metrics summary
      metricsCollector.printMetricsSummary();

      // Check alert thresholds if requested
      if (options.checkAlerts) {
        console.log(chalk.cyan('\n🚨 Alert Threshold Check'));
        console.log(chalk.dim('─'.repeat(80)));

        const alertCheck = metricsCollector.checkAlertThresholds();

        if (alertCheck.healthy) {
          console.log(chalk.green('✓ All metrics within healthy thresholds'));
        } else {
          console.log(chalk.red(`✗ ${alertCheck.alerts.length} alert(s) detected:\n`));

          alertCheck.alerts.forEach((alert) => {
            const icon = alert.severity === 'critical' ? '🔴' : '⚠️';
            const color = alert.severity === 'critical' ? chalk.red : chalk.yellow;
            console.log(color(`  ${icon} [${alert.severity.toUpperCase()}] ${alert.message}`));
          });
        }
      }

      // Display audit log if requested
      if (options.auditLog) {
        console.log(chalk.cyan('\n📋 Audit Log'));
        console.log(chalk.dim('─'.repeat(80)));

        let auditLog = metricsCollector.getAuditLog();

        // Apply filters
        if (options.auditOperation) {
          auditLog = metricsCollector.getAuditLogByOperation(options.auditOperation);
        }
        if (options.auditMarket) {
          auditLog = metricsCollector.getAuditLogByMarket(options.auditMarket);
        }
        if (options.auditAgent) {
          auditLog = metricsCollector.getAuditLogByAgent(options.auditAgent);
        }

        if (auditLog.length === 0) {
          console.log(chalk.yellow('No audit log entries found'));
        } else {
          console.log(chalk.dim(`Showing ${auditLog.length} entries:\n`));

          auditLog.slice(-20).forEach((entry) => {
            const timestamp = new Date(entry.timestamp).toISOString();
            const status = entry.success ? chalk.green('✓') : chalk.red('✗');
            const operation = entry.operation.padEnd(20);

            console.log(`${status} ${chalk.dim(timestamp)} ${operation} ${entry.duration}ms`);

            if (entry.marketId) {
              console.log(chalk.dim(`   Market: ${entry.marketId}`));
            }
            if (entry.agentName) {
              console.log(chalk.dim(`   Agent: ${entry.agentName}`));
            }
            if (entry.signalCount !== undefined) {
              console.log(chalk.dim(`   Signals: ${entry.signalCount}`));
            }
            if (entry.error) {
              console.log(chalk.red(`   Error: ${entry.error.message}`));
            }
            console.log('');
          });

          if (auditLog.length > 20) {
            console.log(chalk.dim(`... and ${auditLog.length - 20} more entries`));
          }
        }
      }

      // Reset metrics if requested
      if (options.reset) {
        console.log(chalk.yellow('\n🔄 Resetting all metrics...'));
        const { resetMemoryMetricsCollector } = await import('./utils/memory-metrics.js');
        resetMemoryMetricsCollector();
        console.log(chalk.green('✓ Metrics reset successfully'));
      }

      console.log('');
    } catch (error) {
      console.log(chalk.red('\n❌ Failed to retrieve memory metrics'));
      console.error(chalk.dim(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

// ============================================================================
// Parse and Execute
// ============================================================================

program.parse();
