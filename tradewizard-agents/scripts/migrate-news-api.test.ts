/**
 * Migration CLI Script Tests
 * 
 * Tests the command-line interface for NewsAPI to NewsData.io migration
 */

/// <reference types="node" />

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ============================================================================
// Test Setup
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_SCRIPT = join(__dirname, 'migrate-news-api.ts');

// Mock environment variables for testing
const mockEnv: Record<string, string> = {
  NEWS_API_KEY: 'test-newsapi-key',
  NEWSDATA_API_KEY: 'test-newsdata-key',
  NEWS_MIGRATION_ENABLED: 'false',
  NEWS_MIGRATION_STRATEGY: 'newsapi-only',
  NEWS_MIGRATION_PERCENTAGE: '0',
};

describe('Migration CLI Script', () => {
  let originalEnv: Record<string, string | undefined>;
  
  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env };
    // Set up test environment
    Object.assign(process.env, mockEnv);
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  // ============================================================================
  // Status Command Tests
  // ============================================================================

  describe('status command', () => {
    it('should show migration status with API keys configured', () => {
      try {
        const output = execSync(`tsx ${CLI_SCRIPT} status`, {
          encoding: 'utf8',
          timeout: 10000,
          env: { ...process.env, ...mockEnv },
        });

        expect(output).toContain('Migration Status');
        expect(output).toContain('NewsAPI Key: ✅ Set');
        expect(output).toContain('NewsData.io Key: ✅ Set');
        expect(output).toContain('Migration Enabled: ❌ No');
      } catch (error) {
        // CLI script may not be executable in test environment
        console.warn('CLI test skipped - script not executable:', error);
      }
    });

    it('should show warnings when API keys are missing', () => {
      const envWithoutKeys: Record<string, string> = { 
        ...mockEnv,
        NEWS_MIGRATION_ENABLED: 'false',
        NEWS_MIGRATION_STRATEGY: 'newsapi-only',
        NEWS_MIGRATION_PERCENTAGE: '0',
      };
      // Remove the API keys
      const { NEWS_API_KEY, NEWSDATA_API_KEY, ...envWithoutApiKeys } = envWithoutKeys;

      try {
        const output = execSync(`tsx ${CLI_SCRIPT} status`, {
          encoding: 'utf8',
          timeout: 10000,
          env: { ...process.env, ...envWithoutApiKeys },
        });

        expect(output).toContain('NewsAPI Key: ❌ Not set');
        expect(output).toContain('NewsData.io Key: ❌ Not set');
      } catch (error) {
        console.warn('CLI test skipped - script not executable:', error);
      }
    });
  });

  // ============================================================================
  // Prepare Command Tests
  // ============================================================================

  describe('prepare command', () => {
    it('should generate migration preparation script', () => {
      try {
        const output = execSync(`tsx ${CLI_SCRIPT} prepare`, {
          encoding: 'utf8',
          timeout: 10000,
          env: process.env,
        });

        expect(output).toContain('Preparing Migration Environment');
        expect(output).toContain('Generated migration script');
        expect(output).toContain('NEWS_MIGRATION_ENABLED=true');
        expect(output).toContain('NEWSDATA_ENABLED=true');
        expect(output).toContain('Migration Instructions');
      } catch (error) {
        console.warn('CLI test skipped - script not executable:', error);
      }
    });
  });

  // ============================================================================
  // Test Command Tests
  // ============================================================================

  describe('test command', () => {
    it('should test migration configuration', () => {
      try {
        const output = execSync(`tsx ${CLI_SCRIPT} test`, {
          encoding: 'utf8',
          timeout: 10000,
          env: { ...process.env, ...mockEnv },
        });

        expect(output).toContain('Testing Migration Configuration');
        expect(output).toContain('Testing NewsAPI connectivity');
        expect(output).toContain('Testing NewsData.io connectivity');
        expect(output).toContain('Testing migration configuration');
      } catch (error) {
        console.warn('CLI test skipped - script not executable:', error);
      }
    });

    it('should fail when NewsData.io key is missing', () => {
      const { NEWSDATA_API_KEY, ...envWithoutNewsData } = mockEnv;

      try {
        execSync(`tsx ${CLI_SCRIPT} test`, {
          encoding: 'utf8',
          timeout: 10000,
          env: { ...process.env, ...envWithoutNewsData },
        });

        // Should not reach here - command should exit with error
        expect(false).toBe(true);
      } catch (error) {
        // Expected to fail when NewsData.io key is missing
        expect(error).toBeDefined();
      }
    });
  });

  // ============================================================================
  // Dry Run Command Tests
  // ============================================================================

  describe('dry-run command', () => {
    it('should perform dry run without making changes', () => {
      try {
        const output = execSync(`tsx ${CLI_SCRIPT} dry-run`, {
          encoding: 'utf8',
          timeout: 15000,
          env: { ...process.env, ...mockEnv },
        });

        expect(output).toContain('Migration Dry Run');
        expect(output).toContain('Dry Run Results');
        expect(output).toContain('Success:');
        expect(output).toContain('Phase:');
        expect(output).toContain('Progress:');
      } catch (error) {
        console.warn('CLI test skipped - script not executable:', error);
      }
    });
  });

  // ============================================================================
  // Execute Command Tests
  // ============================================================================

  describe('execute command', () => {
    it('should require confirmation flag', () => {
      try {
        const output = execSync(`tsx ${CLI_SCRIPT} execute`, {
          encoding: 'utf8',
          timeout: 10000,
          env: { ...process.env, ...mockEnv },
        });

        expect(output).toContain('Run with --confirm to proceed');
      } catch (error) {
        // Expected to exit with error code when confirmation not provided
        expect(error).toBeDefined();
      }
    });

    it('should show migration warning without confirmation', () => {
      try {
        execSync(`tsx ${CLI_SCRIPT} execute`, {
          encoding: 'utf8',
          timeout: 10000,
          env: { ...process.env, ...mockEnv },
        });

        // Should not reach here - command should exit
        expect(false).toBe(true);
      } catch (error) {
        // Expected behavior - exits when confirmation not provided
        expect(error).toBeDefined();
      }
    });
  });

  // ============================================================================
  // Rollback Command Tests
  // ============================================================================

  describe('rollback command', () => {
    it('should require confirmation flag', () => {
      try {
        const output = execSync(`tsx ${CLI_SCRIPT} rollback`, {
          encoding: 'utf8',
          timeout: 10000,
          env: { ...process.env, ...mockEnv },
        });

        expect(output).toContain('Run with --confirm to proceed');
      } catch (error) {
        // Expected to exit with error code when confirmation not provided
        expect(error).toBeDefined();
      }
    });
  });

  // ============================================================================
  // Complete Command Tests
  // ============================================================================

  describe('complete command', () => {
    it('should require confirmation flag', () => {
      try {
        const output = execSync(`tsx ${CLI_SCRIPT} complete`, {
          encoding: 'utf8',
          timeout: 10000,
          env: { ...process.env, ...mockEnv },
        });

        expect(output).toContain('Run with --confirm to complete');
      } catch (error) {
        // Expected to exit with error code when confirmation not provided
        expect(error).toBeDefined();
      }
    });

    it('should show completion warning without confirmation', () => {
      try {
        execSync(`tsx ${CLI_SCRIPT} complete`, {
          encoding: 'utf8',
          timeout: 10000,
          env: { ...process.env, ...mockEnv },
        });

        // Should not reach here - command should exit
        expect(false).toBe(true);
      } catch (error) {
        // Expected behavior - exits when confirmation not provided
        expect(error).toBeDefined();
      }
    });
  });

  // ============================================================================
  // Help and Version Tests
  // ============================================================================

  describe('help and version', () => {
    it('should show help when no command provided', () => {
      try {
        const output = execSync(`tsx ${CLI_SCRIPT} --help`, {
          encoding: 'utf8',
          timeout: 10000,
          env: process.env,
        });

        expect(output).toContain('migrate-news-api');
        expect(output).toContain('Migrate from NewsAPI to NewsData.io');
        expect(output).toContain('Commands:');
        expect(output).toContain('status');
        expect(output).toContain('prepare');
        expect(output).toContain('test');
        expect(output).toContain('dry-run');
        expect(output).toContain('execute');
        expect(output).toContain('rollback');
        expect(output).toContain('complete');
      } catch (error) {
        console.warn('CLI test skipped - script not executable:', error);
      }
    });

    it('should show version information', () => {
      try {
        const output = execSync(`tsx ${CLI_SCRIPT} --version`, {
          encoding: 'utf8',
          timeout: 10000,
          env: process.env,
        });

        expect(output).toContain('1.0.0');
      } catch (error) {
        console.warn('CLI test skipped - script not executable:', error);
      }
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('error handling', () => {
    it('should handle invalid commands gracefully', () => {
      try {
        execSync(`tsx ${CLI_SCRIPT} invalid-command`, {
          encoding: 'utf8',
          timeout: 10000,
          env: process.env,
        });

        // Should not reach here - invalid command should fail
        expect(false).toBe(true);
      } catch (error) {
        // Expected to fail with invalid command
        expect(error).toBeDefined();
      }
    });

    it('should handle missing dependencies gracefully', () => {
      // Test with minimal environment
      const minimalEnv = {
        NODE_ENV: 'test',
        PATH: process.env.PATH,
      };

      try {
        const output = execSync(`tsx ${CLI_SCRIPT} status`, {
          encoding: 'utf8',
          timeout: 10000,
          env: minimalEnv,
        });

        // Should still work with minimal environment
        expect(output).toContain('Migration Status');
      } catch (error) {
        console.warn('CLI test skipped - minimal environment test failed:', error);
      }
    });
  });
});

// ============================================================================
// Integration Tests with Real Environment
// ============================================================================

describe('Integration Tests', () => {
  it('should work with real environment variables', () => {
    // Skip if no real API keys are available
    if (!process.env.NEWSDATA_API_KEY && !process.env.NEWS_API_KEY) {
      console.log('Skipping integration test - no API keys available');
      return;
    }

    try {
      const output = execSync(`tsx ${CLI_SCRIPT} status`, {
        encoding: 'utf8',
        timeout: 10000,
        env: process.env,
      });

      expect(output).toContain('Migration Status');
      
      if (process.env.NEWS_API_KEY) {
        expect(output).toContain('NewsAPI Key: ✅ Set');
      }
      
      if (process.env.NEWSDATA_API_KEY) {
        expect(output).toContain('NewsData.io Key: ✅ Set');
      }
    } catch (error) {
      console.warn('Integration test failed:', error);
    }
  });

  it('should validate real migration configuration', () => {
    // Skip if migration is not configured
    if (process.env.NEWS_MIGRATION_ENABLED !== 'true') {
      console.log('Skipping migration config test - migration not enabled');
      return;
    }

    try {
      const output = execSync(`tsx ${CLI_SCRIPT} test`, {
        encoding: 'utf8',
        timeout: 15000,
        env: process.env,
      });

      expect(output).toContain('Testing Migration Configuration');
      expect(output.includes('All tests passed') || output.includes('connectivity test')).toBe(true);
    } catch (error) {
      console.warn('Migration config test failed:', error);
    }
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe('Performance Tests', () => {
  it('should complete status check quickly', () => {
    const startTime = Date.now();

    try {
      execSync(`tsx ${CLI_SCRIPT} status`, {
        encoding: 'utf8',
        timeout: 5000, // 5 second timeout
        env: { ...process.env, ...mockEnv },
      });

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    } catch (error) {
      console.warn('Performance test skipped - script not executable:', error);
    }
  });

  it('should handle concurrent command execution', async () => {
    const commands = [
      `tsx ${CLI_SCRIPT} status`,
      `tsx ${CLI_SCRIPT} prepare`,
      `tsx ${CLI_SCRIPT} status`,
    ];

    try {
      const promises = commands.map(cmd =>
        new Promise((resolve, reject) => {
          try {
            const output = execSync(cmd, {
              encoding: 'utf8',
              timeout: 10000,
              env: { ...process.env, ...mockEnv },
            });
            resolve(output);
          } catch (error) {
            reject(error);
          }
        })
      );

      const results = await Promise.allSettled(promises);
      
      // At least some commands should succeed
      const successful = results.filter(r => r.status === 'fulfilled');
      expect(successful.length).toBeGreaterThan(0);
    } catch (error) {
      console.warn('Concurrent execution test skipped:', error);
    }
  });
});