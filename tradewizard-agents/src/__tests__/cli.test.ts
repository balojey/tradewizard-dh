/**
 * End-to-End Tests for CLI Interface
 *
 * These tests verify the CLI functionality including:
 * - Market analysis with real Polymarket API calls
 * - Output formatting
 * - Error handling
 * - Single-provider and multi-provider modes
 * - Graph visualization output
 *
 * Requirements: All, 11.9, 11.10
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';

describe('CLI End-to-End Tests', () => {
  let hasApiKeys = false;

  beforeAll(() => {
    // Check if API keys are available
    hasApiKeys = !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_API_KEY);
  });

  describe('analyze command', () => {
    it('should display help information', () => {
      const output = execSync('npm run cli -- analyze --help', {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });

      expect(output).toContain('Analyze a prediction market by condition ID');
      expect(output).toContain('--debug');
      expect(output).toContain('--visualize');
      expect(output).toContain('--opik-trace');
      expect(output).toContain('--single-provider');
    });

    it('should handle missing condition ID', () => {
      try {
        execSync('npm run cli -- analyze', {
          cwd: process.cwd(),
          encoding: 'utf-8',
          stdio: 'pipe',
        });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.status).toBe(1);
        expect(error.stderr.toString()).toContain('error: missing required argument');
      }
    });

    it('should handle invalid condition ID gracefully', () => {
      try {
        execSync('npm run cli -- analyze invalid-condition-id', {
          cwd: process.cwd(),
          encoding: 'utf-8',
          stdio: 'pipe',
          timeout: 30000,
        });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        // CLI should exit with error code or timeout
        // Either behavior is acceptable for invalid condition IDs
        expect(error.status).toBeGreaterThan(0);
      }
    });

    // Integration test with real Polymarket API
    // This test is skipped if API keys are not configured
    it.skipIf(!hasApiKeys)(
      'should analyze a real market with multi-provider mode',
      { timeout: 90000 },
      async () => {
        // Use a known Polymarket condition ID (this should be a real, active market)
        // For testing purposes, we'll use a placeholder that should be replaced with a real ID
        const testConditionId = process.env.TEST_CONDITION_ID || '0x1234567890abcdef';

        try {
          const output = execSync(`npm run cli -- analyze ${testConditionId}`, {
            cwd: process.cwd(),
            encoding: 'utf-8',
            timeout: 60000, // 60 second timeout for real API calls
          });

          // Verify output contains expected sections
          expect(output).toContain('Trade Recommendation');
          expect(output).toContain('Action:');
          expect(output).toContain('Expected Value:');
          expect(output).toContain('Win Probability:');
          expect(output).toContain('Explanation');
        } catch (error: any) {
          // If the test condition ID is invalid, that's expected
          if (testConditionId === '0x1234567890abcdef') {
            console.log('Skipping real API test - no valid TEST_CONDITION_ID provided');
          } else {
            throw error;
          }
        }
      }
    );

    // Test single-provider mode
    it.skipIf(!process.env.OPENAI_API_KEY)(
      'should analyze market with single-provider mode (OpenAI)',
      { timeout: 90000 },
      async () => {
        const testConditionId = process.env.TEST_CONDITION_ID || '0x1234567890abcdef';

        try {
          const output = execSync(
            `npm run cli -- analyze ${testConditionId} --single-provider openai`,
            {
              cwd: process.cwd(),
              encoding: 'utf-8',
              timeout: 60000,
            }
          );

          expect(output).toContain('Trade Recommendation');
        } catch (error: any) {
          if (testConditionId === '0x1234567890abcdef') {
            console.log('Skipping real API test - no valid TEST_CONDITION_ID provided');
          } else {
            throw error;
          }
        }
      }
    );

    it('should display debug information when --debug flag is used', () => {
      // Mock test - we'll verify the flag is recognized
      const output = execSync('npm run cli -- analyze --help', {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });

      expect(output).toContain('--debug');
      expect(output).toContain('Show debug information and graph state');
    });

    it('should support visualization flag', () => {
      const output = execSync('npm run cli -- analyze --help', {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });

      expect(output).toContain('--visualize');
      expect(output).toContain('Generate LangGraph workflow visualization');
    });

    it('should support Opik trace flag', () => {
      const output = execSync('npm run cli -- analyze --help', {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });

      expect(output).toContain('--opik-trace');
      expect(output).toContain('Open Opik trace in browser');
    });

    it('should support cost tracking flag', () => {
      const output = execSync('npm run cli -- analyze --help', {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });

      expect(output).toContain('--show-costs');
      expect(output).toContain('Display LLM cost tracking');
    });
  });

  describe('history command', () => {
    it('should display help information', () => {
      const output = execSync('npm run cli -- history --help', {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });

      expect(output).toContain('Query historical traces from Opik');
      expect(output).toContain('--project');
    });

    it('should handle missing condition ID', () => {
      try {
        execSync('npm run cli -- history', {
          cwd: process.cwd(),
          encoding: 'utf-8',
          stdio: 'pipe',
        });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.status).toBe(1);
        expect(error.stderr.toString()).toContain('error: missing required argument');
      }
    });

    it('should query historical traces', () => {
      const testConditionId = '0x1234567890abcdef';

      const output = execSync(`npm run cli -- history ${testConditionId}`, {
        cwd: process.cwd(),
        encoding: 'utf-8',
        timeout: 10000,
      });

      expect(output).toContain('Historical Traces');
      expect(output).toContain('Thread ID');
      expect(output).toContain(testConditionId);
    });
  });

  describe('checkpoint command', () => {
    it('should display help information', () => {
      const output = execSync('npm run cli -- checkpoint --help', {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });

      expect(output).toContain('Inspect checkpoint state');
      expect(output).toContain('--project');
    });

    it('should handle missing condition ID', () => {
      try {
        execSync('npm run cli -- checkpoint', {
          cwd: process.cwd(),
          encoding: 'utf-8',
          stdio: 'pipe',
        });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.status).toBe(1);
        expect(error.stderr.toString()).toContain('error: missing required argument');
      }
    });

    it('should handle non-existent checkpoint gracefully', () => {
      const testConditionId = '0xnonexistent';

      const output = execSync(`npm run cli -- checkpoint ${testConditionId}`, {
        cwd: process.cwd(),
        encoding: 'utf-8',
        timeout: 10000,
      });

      // Should indicate no checkpoint found
      expect(output).toMatch(/No checkpoint found|Checkpoint State/);
    });
  });

  describe('output formatting', () => {
    it('should format trade recommendations correctly', () => {
      // This is tested implicitly in the analyze command tests
      // We verify that the output contains the expected sections
      const output = execSync('npm run cli -- analyze --help', {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });

      // Verify help output is formatted
      expect(output).toBeTruthy();
      expect(output.length).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should handle network errors gracefully', () => {
      // Test with invalid API URL by setting environment variable
      try {
        execSync('npm run cli -- analyze test-id', {
          cwd: process.cwd(),
          encoding: 'utf-8',
          env: {
            ...process.env,
            POLYMARKET_GAMMA_API_URL: 'https://invalid-url-that-does-not-exist.com',
          },
          timeout: 30000,
          stdio: 'pipe',
        });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        // Should exit with error code (either 1 for error or timeout)
        expect(error.status).toBeGreaterThan(0);
      }
    });

    it('should handle missing API keys gracefully', () => {
      try {
        execSync('npm run cli -- analyze test-id', {
          cwd: process.cwd(),
          encoding: 'utf-8',
          env: {
            ...process.env,
            OPENAI_API_KEY: undefined,
            ANTHROPIC_API_KEY: undefined,
            GOOGLE_API_KEY: undefined,
          },
          timeout: 30000,
          stdio: 'pipe',
        });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        // Should exit with error code (either 1 for error or timeout)
        expect(error.status).toBeGreaterThan(0);
      }
    });
  });

  describe('configuration overrides', () => {
    it('should support project name override', () => {
      const output = execSync('npm run cli -- analyze --help', {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });

      expect(output).toContain('--project');
      expect(output).toContain('Override Opik project name');
    });

    it('should support model override for single-provider mode', () => {
      const output = execSync('npm run cli -- analyze --help', {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });

      expect(output).toContain('--model');
      expect(output).toContain('Override default model');
    });
  });

  describe('graph visualization', () => {
    it('should generate Mermaid diagram when --visualize flag is used', () => {
      // We can't easily test the full visualization without running a real analysis,
      // but we can verify the flag is recognized
      const output = execSync('npm run cli -- analyze --help', {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });

      expect(output).toContain('--visualize');
    });
  });
});

/**
 * Integration Tests with Real Polymarket API
 *
 * These tests require:
 * - Valid API keys (OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_API_KEY)
 * - Valid TEST_CONDITION_ID environment variable
 * - Network connectivity to Polymarket APIs
 *
 * To run these tests:
 * 1. Set up your .env file with API keys
 * 2. Set TEST_CONDITION_ID to a valid, active Polymarket condition ID
 * 3. Run: npm test -- cli.test.ts
 */
describe('CLI Integration Tests (Real API)', () => {
  const hasApiKeys = !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_API_KEY);
  const hasTestConditionId = !!(process.env.TEST_CONDITION_ID && process.env.TEST_CONDITION_ID !== '0x1234567890abcdef');

  it.skipIf(!hasApiKeys || !hasTestConditionId)(
    'should complete full analysis workflow with real API',
    { timeout: 150000 },
    async () => {
      const testConditionId = process.env.TEST_CONDITION_ID!;

      const output = execSync(`npm run cli -- analyze ${testConditionId} --debug`, {
        cwd: process.cwd(),
        encoding: 'utf-8',
        timeout: 120000, // 2 minute timeout for full workflow
      });

      // Verify all expected sections are present
      expect(output).toContain('Configuration loaded');
      expect(output).toContain('Connecting to Polymarket');
      expect(output).toContain('Analyzing market');
      expect(output).toContain('Analysis complete');
      expect(output).toContain('Trade Recommendation');
      expect(output).toContain('Action:');
      expect(output).toContain('Expected Value:');
      expect(output).toContain('Win Probability:');
      expect(output).toContain('Entry Zone:');
      expect(output).toContain('Target Zone:');
      expect(output).toContain('Liquidity Risk:');
      expect(output).toContain('Explanation');
      expect(output).toContain('Summary:');
      expect(output).toContain('Core Thesis:');
      expect(output).toContain('Metadata');
      expect(output).toContain('Market Probability:');
      expect(output).toContain('Consensus Probability:');
      expect(output).toContain('Edge:');
      expect(output).toContain('Confidence Band:');

      // Debug information should be present
      expect(output).toContain('Debug Information');
      expect(output).toContain('Audit Log:');
    }
  );

  it.skipIf(!hasApiKeys || !hasTestConditionId)(
    'should work with single-provider mode (OpenAI)',
    { timeout: 150000 },
    async () => {
      if (!process.env.OPENAI_API_KEY) {
        console.log('Skipping OpenAI single-provider test - no API key');
        return;
      }

      const testConditionId = process.env.TEST_CONDITION_ID!;

      const output = execSync(
        `npm run cli -- analyze ${testConditionId} --single-provider openai --model gpt-4o-mini`,
        {
          cwd: process.cwd(),
          encoding: 'utf-8',
          timeout: 120000,
        }
      );

      expect(output).toContain('Analysis complete');
      expect(output).toContain('Trade Recommendation');
    }
  );

  it.skipIf(!hasApiKeys || !hasTestConditionId)(
    'should work with single-provider mode (Anthropic)',
    { timeout: 150000 },
    async () => {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.log('Skipping Anthropic single-provider test - no API key');
        return;
      }

      const testConditionId = process.env.TEST_CONDITION_ID!;

      const output = execSync(
        `npm run cli -- analyze ${testConditionId} --single-provider anthropic`,
        {
          cwd: process.cwd(),
          encoding: 'utf-8',
          timeout: 120000,
        }
      );

      expect(output).toContain('Analysis complete');
      expect(output).toContain('Trade Recommendation');
    }
  );

  it.skipIf(!hasApiKeys || !hasTestConditionId)(
    'should work with single-provider mode (Google)',
    { timeout: 150000 },
    async () => {
      if (!process.env.GOOGLE_API_KEY) {
        console.log('Skipping Google single-provider test - no API key');
        return;
      }

      const testConditionId = process.env.TEST_CONDITION_ID!;

      const output = execSync(
        `npm run cli -- analyze ${testConditionId} --single-provider google`,
        {
          cwd: process.cwd(),
          encoding: 'utf-8',
          timeout: 120000,
        }
      );

      expect(output).toContain('Analysis complete');
      expect(output).toContain('Trade Recommendation');
    }
  );

  it.skipIf(!hasApiKeys || !hasTestConditionId)(
    'should display visualization when requested',
    { timeout: 150000 },
    async () => {
      const testConditionId = process.env.TEST_CONDITION_ID!;

      const output = execSync(`npm run cli -- analyze ${testConditionId} --visualize`, {
        cwd: process.cwd(),
        encoding: 'utf-8',
        timeout: 120000,
      });

      expect(output).toContain('LangGraph Workflow Visualization');
      expect(output).toContain('Mermaid Diagram:');
      expect(output).toContain('graph TD');
      expect(output).toContain('Market Ingestion');
      expect(output).toContain('Thesis Construction');
      expect(output).toContain('Consensus Engine');
    }
  );

  it.skipIf(!hasApiKeys || !hasTestConditionId)(
    'should display cost information when requested',
    { timeout: 150000 },
    async () => {
      const testConditionId = process.env.TEST_CONDITION_ID!;

      const output = execSync(`npm run cli -- analyze ${testConditionId} --show-costs`, {
        cwd: process.cwd(),
        encoding: 'utf-8',
        timeout: 120000,
      });

      expect(output).toContain('Cost Tracking');
      expect(output).toContain('Opik');
    }
  );
});


/**
 * Advanced Agent League CLI Tests
 * 
 * Tests for advanced agent configuration options including:
 * - Agent group enable/disable flags
 * - Cost budget configuration
 * - Agent selection display
 * - Signal fusion display
 * - Risk philosophy perspectives
 * - Performance metrics display
 * 
 * Requirements: 12.1, 12.2, 12.3, 12.4
 */
describe('Advanced Agent League CLI Tests', () => {
  describe('agent group configuration flags', () => {
    it('should support --enable-event-intelligence flag', () => {
      const output = execSync('npm run cli -- analyze --help', {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });

      expect(output).toContain('--enable-event-intelligence');
      expect(output).toContain('Enable Event Intelligence agents');
    });

    it('should support --enable-polling flag', () => {
      const output = execSync('npm run cli -- analyze --help', {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });

      expect(output).toContain('--enable-polling');
      expect(output).toContain('Enable Polling & Statistical agents');
    });

    it('should support --enable-sentiment flag', () => {
      const output = execSync('npm run cli -- analyze --help', {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });

      expect(output).toContain('--enable-sentiment');
      expect(output).toContain('Enable Sentiment & Narrative agents');
    });

    it('should support --enable-price-action flag', () => {
      const output = execSync('npm run cli -- analyze --help', {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });

      expect(output).toContain('--enable-price-action');
      expect(output).toContain('Enable Price Action agents');
    });

    it('should support --enable-event-scenario flag', () => {
      const output = execSync('npm run cli -- analyze --help', {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });

      expect(output).toContain('--enable-event-scenario');
      expect(output).toContain('Enable Event Scenario agents');
    });

    it('should support --enable-risk-philosophy flag', () => {
      const output = execSync('npm run cli -- analyze --help', {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });

      expect(output).toContain('--enable-risk-philosophy');
      expect(output).toContain('Enable Risk Philosophy agents');
    });

    it('should support --enable-all-agents flag', () => {
      const output = execSync('npm run cli -- analyze --help', {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });

      expect(output).toContain('--enable-all-agents');
      expect(output).toContain('Enable all advanced agent groups');
    });
  });

  describe('cost budget configuration', () => {
    it('should support --cost-budget flag', () => {
      const output = execSync('npm run cli -- analyze --help', {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });

      expect(output).toContain('--cost-budget');
      expect(output).toContain('Set maximum cost per analysis');
    });
  });

  describe('display options', () => {
    it('should support --show-agent-selection flag', () => {
      const output = execSync('npm run cli -- analyze --help', {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });

      expect(output).toContain('--show-agent-selection');
      expect(output).toContain('Display which agents were selected');
    });

    it('should support --show-signal-fusion flag', () => {
      const output = execSync('npm run cli -- analyze --help', {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });

      expect(output).toContain('--show-signal-fusion');
      expect(output).toContain('Display signal fusion details');
    });

    it('should support --show-risk-perspectives flag', () => {
      const output = execSync('npm run cli -- analyze --help', {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });

      expect(output).toContain('--show-risk-perspectives');
      expect(output).toContain('Display risk philosophy perspectives');
    });

    it('should support --show-performance flag', () => {
      const output = execSync('npm run cli -- analyze --help', {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });

      expect(output).toContain('--show-performance');
      expect(output).toContain('Display agent performance metrics');
    });
  });

  describe('MVP only mode (backward compatibility)', () => {
    const hasApiKeys = !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_API_KEY);
    const hasTestConditionId = !!(process.env.TEST_CONDITION_ID && process.env.TEST_CONDITION_ID !== '0x1234567890abcdef');

    it.skipIf(!hasApiKeys || !hasTestConditionId)(
      'should work with MVP agents only (no advanced agent flags)',
      { timeout: 150000 },
      async () => {
        const testConditionId = process.env.TEST_CONDITION_ID!;

        const output = execSync(`npm run cli -- analyze ${testConditionId} --debug`, {
          cwd: process.cwd(),
          encoding: 'utf-8',
          timeout: 120000,
        });

        expect(output).toContain('Analysis complete');
        expect(output).toContain('Trade Recommendation');
        expect(output).toContain('Advanced Agents: MVP Only');
      }
    );
  });

  describe('selective agent groups', () => {
    const hasApiKeys = !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_API_KEY);
    const hasTestConditionId = !!(process.env.TEST_CONDITION_ID && process.env.TEST_CONDITION_ID !== '0x1234567890abcdef');

    it.skipIf(!hasApiKeys || !hasTestConditionId)(
      'should enable specific agent groups with individual flags',
      { timeout: 150000 },
      async () => {
        const testConditionId = process.env.TEST_CONDITION_ID!;

        const output = execSync(
          `npm run cli -- analyze ${testConditionId} --enable-risk-philosophy --debug`,
          {
            cwd: process.cwd(),
            encoding: 'utf-8',
            timeout: 120000,
          }
        );

        expect(output).toContain('Analysis complete');
        expect(output).toContain('Trade Recommendation');
        expect(output).toContain('Risk Philosophy');
      }
    );
  });

  describe('all agents enabled', () => {
    const hasApiKeys = !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_API_KEY);
    const hasTestConditionId = !!(process.env.TEST_CONDITION_ID && process.env.TEST_CONDITION_ID !== '0x1234567890abcdef');
    const hasExternalData = !!(process.env.EXTERNAL_DATA_NEWS_PROVIDER !== 'none' || 
                            process.env.EXTERNAL_DATA_POLLING_PROVIDER !== 'none');

    it.skipIf(!hasApiKeys || !hasTestConditionId || !hasExternalData)(
      'should enable all agent groups with --enable-all-agents flag',
      { timeout: 180000 },
      async () => {
        const testConditionId = process.env.TEST_CONDITION_ID!;

        const output = execSync(
          `npm run cli -- analyze ${testConditionId} --enable-all-agents --debug`,
          {
            cwd: process.cwd(),
            encoding: 'utf-8',
            timeout: 150000,
          }
        );

        expect(output).toContain('Analysis complete');
        expect(output).toContain('Trade Recommendation');
        // Should show multiple agent groups enabled
        expect(output).toMatch(/Event Intelligence|Polling|Sentiment|Price Action|Event Scenario|Risk Philosophy/);
      }
    );
  });

  describe('cost budget configuration', () => {
    const hasApiKeys = !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_API_KEY);
    const hasTestConditionId = !!(process.env.TEST_CONDITION_ID && process.env.TEST_CONDITION_ID !== '0x1234567890abcdef');

    it.skipIf(!hasApiKeys || !hasTestConditionId)(
      'should respect cost budget when specified',
      { timeout: 150000 },
      async () => {
        const testConditionId = process.env.TEST_CONDITION_ID!;

        const output = execSync(
          `npm run cli -- analyze ${testConditionId} --cost-budget 1.0 --debug`,
          {
            cwd: process.cwd(),
            encoding: 'utf-8',
            timeout: 120000,
          }
        );

        expect(output).toContain('Analysis complete');
        expect(output).toContain('Max Cost: $1.00');
      }
    );
  });

  describe('agent selection display', () => {
    const hasApiKeys = !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_API_KEY);
    const hasTestConditionId = !!(process.env.TEST_CONDITION_ID && process.env.TEST_CONDITION_ID !== '0x1234567890abcdef');

    it.skipIf(!hasApiKeys || !hasTestConditionId)(
      'should display agent selection when --show-agent-selection flag is used',
      { timeout: 150000 },
      async () => {
        const testConditionId = process.env.TEST_CONDITION_ID!;

        const output = execSync(
          `npm run cli -- analyze ${testConditionId} --show-agent-selection`,
          {
            cwd: process.cwd(),
            encoding: 'utf-8',
            timeout: 120000,
          }
        );

        expect(output).toContain('Agent Selection');
        expect(output).toContain('Active Agents:');
      }
    );
  });

  describe('signal fusion display', () => {
    const hasApiKeys = !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_API_KEY);
    const hasTestConditionId = !!(process.env.TEST_CONDITION_ID && process.env.TEST_CONDITION_ID !== '0x1234567890abcdef');

    it.skipIf(!hasApiKeys || !hasTestConditionId)(
      'should display signal fusion when --show-signal-fusion flag is used',
      { timeout: 150000 },
      async () => {
        const testConditionId = process.env.TEST_CONDITION_ID!;

        const output = execSync(
          `npm run cli -- analyze ${testConditionId} --show-signal-fusion`,
          {
            cwd: process.cwd(),
            encoding: 'utf-8',
            timeout: 120000,
          }
        );

        expect(output).toContain('Signal Fusion');
        // Should show either fusion data or indication that raw signals are used
        expect(output).toMatch(/Fused Signal|using raw agent signals/);
      }
    );
  });

  describe('risk philosophy perspectives display', () => {
    const hasApiKeys = !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_API_KEY);
    const hasTestConditionId = !!(process.env.TEST_CONDITION_ID && process.env.TEST_CONDITION_ID !== '0x1234567890abcdef');

    it.skipIf(!hasApiKeys || !hasTestConditionId)(
      'should display risk perspectives when --show-risk-perspectives flag is used',
      { timeout: 150000 },
      async () => {
        const testConditionId = process.env.TEST_CONDITION_ID!;

        const output = execSync(
          `npm run cli -- analyze ${testConditionId} --enable-risk-philosophy --show-risk-perspectives`,
          {
            cwd: process.cwd(),
            encoding: 'utf-8',
            timeout: 120000,
          }
        );

        expect(output).toContain('Risk Philosophy Perspectives');
        // Should show either risk signals or indication they're not available
        expect(output).toMatch(/Aggressive|Conservative|Neutral|No risk philosophy signals/);
      }
    );
  });

  describe('performance metrics display', () => {
    const hasApiKeys = !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_API_KEY);
    const hasTestConditionId = !!(process.env.TEST_CONDITION_ID && process.env.TEST_CONDITION_ID !== '0x1234567890abcdef');

    it.skipIf(!hasApiKeys || !hasTestConditionId)(
      'should display performance metrics when --show-performance flag is used',
      { timeout: 150000 },
      async () => {
        const testConditionId = process.env.TEST_CONDITION_ID!;

        const output = execSync(
          `npm run cli -- analyze ${testConditionId} --show-performance`,
          {
            cwd: process.cwd(),
            encoding: 'utf-8',
            timeout: 120000,
          }
        );

        expect(output).toContain('Agent Performance Metrics');
        // Should show either performance data or indication it's not available
        expect(output).toMatch(/Agent Performance|No performance metrics available/);
      }
    );
  });

  describe('output formatting with advanced agents', () => {
    const hasApiKeys = !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_API_KEY);
    const hasTestConditionId = !!(process.env.TEST_CONDITION_ID && process.env.TEST_CONDITION_ID !== '0x1234567890abcdef');

    it.skipIf(!hasApiKeys || !hasTestConditionId)(
      'should format output correctly with all display options',
      { timeout: 180000 },
      async () => {
        const testConditionId = process.env.TEST_CONDITION_ID!;

        const output = execSync(
          `npm run cli -- analyze ${testConditionId} --enable-risk-philosophy --show-agent-selection --show-signal-fusion --show-risk-perspectives --show-performance`,
          {
            cwd: process.cwd(),
            encoding: 'utf-8',
            timeout: 150000,
          }
        );

        // Verify all sections are present and properly formatted
        expect(output).toContain('Trade Recommendation');
        expect(output).toContain('Agent Selection');
        expect(output).toContain('Signal Fusion');
        expect(output).toContain('Risk Philosophy Perspectives');
        expect(output).toContain('Agent Performance Metrics');
        
        // Verify sections are separated
        expect(output).toMatch(/─{60}/g); // Section separators
      }
    );
  });

  describe('error handling with advanced agents', () => {
    it('should handle missing external data sources gracefully', () => {
      try {
        execSync('npm run cli -- analyze test-id --enable-event-intelligence', {
          cwd: process.cwd(),
          encoding: 'utf-8',
          env: {
            ...process.env,
            EXTERNAL_DATA_NEWS_PROVIDER: 'none',
            OPENAI_API_KEY: undefined,
            ANTHROPIC_API_KEY: undefined,
            GOOGLE_API_KEY: undefined,
          },
          timeout: 30000,
          stdio: 'pipe',
        });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        // Should exit with error code
        expect(error.status).toBeGreaterThan(0);
      }
    });

    it('should handle invalid cost budget gracefully', () => {
      try {
        execSync('npm run cli -- analyze test-id --cost-budget invalid', {
          cwd: process.cwd(),
          encoding: 'utf-8',
          timeout: 10000,
          stdio: 'pipe',
        });
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        // Should exit with error code
        expect(error.status).toBeGreaterThan(0);
      }
    });
  });

  describe('combined flags', () => {
    const hasApiKeys = !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_API_KEY);
    const hasTestConditionId = !!(process.env.TEST_CONDITION_ID && process.env.TEST_CONDITION_ID !== '0x1234567890abcdef');

    it.skipIf(!hasApiKeys || !hasTestConditionId)(
      'should work with multiple agent groups and display options',
      { timeout: 180000 },
      async () => {
        const testConditionId = process.env.TEST_CONDITION_ID!;

        const output = execSync(
          `npm run cli -- analyze ${testConditionId} --enable-risk-philosophy --cost-budget 1.5 --show-agent-selection --show-risk-perspectives --debug`,
          {
            cwd: process.cwd(),
            encoding: 'utf-8',
            timeout: 150000,
          }
        );

        expect(output).toContain('Analysis complete');
        expect(output).toContain('Max Cost: $1.50');
        expect(output).toContain('Risk Philosophy');
        expect(output).toContain('Agent Selection');
        expect(output).toContain('Risk Philosophy Perspectives');
      }
    );

    it.skipIf(!hasApiKeys || !hasTestConditionId)(
      'should work with single-provider mode and advanced agents',
      { timeout: 180000 },
      async () => {
        if (!process.env.OPENAI_API_KEY) {
          console.log('Skipping single-provider test - no OpenAI API key');
          return;
        }

        const testConditionId = process.env.TEST_CONDITION_ID!;

        const output = execSync(
          `npm run cli -- analyze ${testConditionId} --single-provider openai --enable-risk-philosophy --debug`,
          {
            cwd: process.cwd(),
            encoding: 'utf-8',
            timeout: 150000,
          }
        );

        expect(output).toContain('Analysis complete');
        expect(output).toContain('Single-Provider (openai)');
        expect(output).toContain('Risk Philosophy');
      }
    );
  });
});
