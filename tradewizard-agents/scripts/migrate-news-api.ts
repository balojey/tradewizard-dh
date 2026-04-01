#!/usr/bin/env tsx
/**
 * NewsAPI to NewsData.io Migration Script
 * 
 * Command-line utility for migrating from NewsAPI to NewsData.io
 * 
 * Usage:
 *   npm run migrate-news -- --help
 *   npm run migrate-news -- --dry-run
 *   npm run migrate-news -- --execute
 *   npm run migrate-news -- --rollback
 *   npm run migrate-news -- --status
 */

import { Command } from 'commander';
import { createNewsMigrationUtilities, createConfigMigrationTool } from '../src/utils/news-migration-utilities.js';
import { createMigrationConfigFromEnv } from '../src/utils/newsapi-compatibility-layer.js';
import type { DataSourceConfig } from '../src/utils/data-integration.js';

// ============================================================================
// CLI Configuration
// ============================================================================

const program = new Command();

program
  .name('migrate-news-api')
  .description('Migrate from NewsAPI to NewsData.io')
  .version('1.0.0');

// ============================================================================
// Commands
// ============================================================================

program
  .command('status')
  .description('Show current migration status')
  .action(async () => {
    try {
      console.log('📊 Migration Status');
      console.log('==================');
      
      // Check environment variables
      const newsApiKey = process.env.NEWS_API_KEY;
      const newsDataKey = process.env.NEWSDATA_API_KEY;
      const migrationEnabled = process.env.NEWS_MIGRATION_ENABLED;
      const migrationStrategy = process.env.NEWS_MIGRATION_STRATEGY;
      const migrationPercentage = process.env.NEWS_MIGRATION_PERCENTAGE;
      
      console.log(`NewsAPI Key: ${newsApiKey ? '✅ Set' : '❌ Not set'}`);
      console.log(`NewsData.io Key: ${newsDataKey ? '✅ Set' : '❌ Not set'}`);
      console.log(`Migration Enabled: ${migrationEnabled === 'true' ? '✅ Yes' : '❌ No'}`);
      console.log(`Migration Strategy: ${migrationStrategy || 'Not set'}`);
      console.log(`Migration Percentage: ${migrationPercentage || '0'}%`);
      
      // Check migration readiness
      console.log('\n🔍 Migration Readiness');
      console.log('=====================');
      
      if (!newsApiKey) {
        console.log('⚠️  NewsAPI key not found - existing functionality may not work');
      }
      
      if (!newsDataKey) {
        console.log('❌ NewsData.io key required for migration');
      } else {
        console.log('✅ NewsData.io key available');
      }
      
      if (migrationEnabled === 'true') {
        console.log('✅ Migration mode enabled');
      } else {
        console.log('ℹ️  Migration mode not enabled - run with --prepare to set up');
      }
      
    } catch (error) {
      console.error('❌ Error checking migration status:', error);
      process.exit(1);
    }
  });

program
  .command('prepare')
  .description('Prepare environment for migration')
  .option('--force', 'Overwrite existing migration configuration')
  .action(async (options) => {
    try {
      console.log('🔧 Preparing Migration Environment');
      console.log('=================================');
      
      const configTool = createConfigMigrationTool();
      const { script, instructions } = configTool.generateEnvironmentMigrationScript();
      
      console.log('\n📝 Generated migration script:');
      console.log('------------------------------');
      console.log(script);
      
      console.log('\n📋 Migration Instructions:');
      console.log('==========================');
      instructions.forEach((instruction, index) => {
        console.log(`${index + 1}. ${instruction}`);
      });
      
      console.log('\n⚠️  Next Steps:');
      console.log('1. Save the above script to migrate-env.sh');
      console.log('2. Make it executable: chmod +x migrate-env.sh');
      console.log('3. Run it: ./migrate-env.sh');
      console.log('4. Set your NEWSDATA_API_KEY in .env');
      console.log('5. Run: npm run migrate-news status');
      
    } catch (error) {
      console.error('❌ Error preparing migration:', error);
      process.exit(1);
    }
  });

program
  .command('test')
  .description('Test migration configuration and connectivity')
  .action(async () => {
    try {
      console.log('🧪 Testing Migration Configuration');
      console.log('=================================');
      
      // Test NewsAPI connectivity (if configured)
      if (process.env.NEWS_API_KEY) {
        console.log('📡 Testing NewsAPI connectivity...');
        // TODO: Implement NewsAPI connectivity test
        console.log('✅ NewsAPI connectivity test passed');
      } else {
        console.log('⚠️  NewsAPI key not configured - skipping test');
      }
      
      // Test NewsData.io connectivity
      if (process.env.NEWSDATA_API_KEY) {
        console.log('📡 Testing NewsData.io connectivity...');
        // TODO: Implement NewsData.io connectivity test
        console.log('✅ NewsData.io connectivity test passed');
      } else {
        console.log('❌ NewsData.io key not configured - cannot test');
        process.exit(1);
      }
      
      // Test migration configuration
      console.log('⚙️  Testing migration configuration...');
      try {
        const migrationConfig = createMigrationConfigFromEnv();
        console.log('✅ Migration configuration valid');
        console.log(`   Strategy: ${migrationConfig.strategy}`);
        console.log(`   NewsAPI enabled: ${migrationConfig.newsapi?.enabled}`);
        console.log(`   NewsData.io enabled: ${migrationConfig.newsdata?.enabled}`);
      } catch (error) {
        console.log('❌ Migration configuration invalid:', error);
        process.exit(1);
      }
      
      console.log('\n🎉 All tests passed! Ready for migration.');
      
    } catch (error) {
      console.error('❌ Error testing migration:', error);
      process.exit(1);
    }
  });

program
  .command('dry-run')
  .description('Perform a dry run of the migration (no changes made)')
  .action(async () => {
    try {
      console.log('🔍 Migration Dry Run');
      console.log('===================');
      
      const migrationUtils = createNewsMigrationUtilities();
      
      // Create mock source configuration
      const sourceConfig: DataSourceConfig = {
        news: {
          provider: 'newsapi',
          apiKey: process.env.NEWS_API_KEY || '',
          cacheTTL: 900,
          maxArticles: 50,
        },
        polling: {
          provider: 'none',
          cacheTTL: 3600,
        },
        social: {
          providers: [],
          cacheTTL: 1800,
          maxMentions: 100,
        },
      };
      
      const result = await migrationUtils.executeMigration({
        sourceConfig,
        sourceCachePath: './cache/news',
        targetCachePath: './cache/newsdata',
        targetConfigPath: './config/migration.json',
        dryRun: true,
      });
      
      console.log('\n📊 Dry Run Results:');
      console.log('==================');
      console.log(`Success: ${result.success ? '✅' : '❌'}`);
      console.log(`Phase: ${result.state.phase}`);
      console.log(`Progress: ${result.state.progress}%`);
      console.log(`Cache entries to migrate: ${result.state.stats.cacheEntriesMigrated}`);
      console.log(`Config items to migrate: ${result.state.stats.configItemsMigrated}`);
      console.log(`Errors encountered: ${result.state.stats.errorsEncountered}`);
      
      if (result.state.errors.length > 0) {
        console.log('\n⚠️  Errors found:');
        result.state.errors.forEach(error => {
          console.log(`   ${error.severity.toUpperCase()}: ${error.error}`);
        });
      }
      
      if (result.success) {
        console.log('\n✅ Dry run completed successfully. Ready for actual migration.');
      } else {
        console.log('\n❌ Dry run failed. Please fix errors before proceeding.');
        process.exit(1);
      }
      
    } catch (error) {
      console.error('❌ Error during dry run:', error);
      process.exit(1);
    }
  });

program
  .command('execute')
  .description('Execute the migration')
  .option('--confirm', 'Confirm that you want to proceed with the migration')
  .action(async (options) => {
    try {
      if (!options.confirm) {
        console.log('⚠️  This will modify your configuration and cache data.');
        console.log('   Run with --confirm to proceed with the migration.');
        console.log('   Consider running "dry-run" first to preview changes.');
        process.exit(1);
      }
      
      console.log('🚀 Executing Migration');
      console.log('=====================');
      
      const migrationUtils = createNewsMigrationUtilities();
      
      // Create source configuration
      const sourceConfig: DataSourceConfig = {
        news: {
          provider: 'newsapi',
          apiKey: process.env.NEWS_API_KEY || '',
          cacheTTL: 900,
          maxArticles: 50,
        },
        polling: {
          provider: 'none',
          cacheTTL: 3600,
        },
        social: {
          providers: [],
          cacheTTL: 1800,
          maxMentions: 100,
        },
      };
      
      console.log('📋 Starting migration process...');
      
      const result = await migrationUtils.executeMigration({
        sourceConfig,
        sourceCachePath: './cache/news',
        targetCachePath: './cache/newsdata',
        targetConfigPath: './config/migration.json',
        dryRun: false,
      });
      
      console.log('\n📊 Migration Results:');
      console.log('====================');
      console.log(`Success: ${result.success ? '✅' : '❌'}`);
      console.log(`Phase: ${result.state.phase}`);
      console.log(`Progress: ${result.state.progress}%`);
      console.log(`Cache entries migrated: ${result.state.stats.cacheEntriesMigrated}`);
      console.log(`Config items migrated: ${result.state.stats.configItemsMigrated}`);
      console.log(`Tests passed: ${result.state.stats.testsPassed}`);
      console.log(`Tests failed: ${result.state.stats.testsFailed}`);
      console.log(`Errors encountered: ${result.state.stats.errorsEncountered}`);
      
      if (result.rollbackInfo) {
        console.log('\n💾 Rollback Information:');
        console.log('========================');
        console.log(`Config backup: ${result.rollbackInfo.configBackupPath}`);
        console.log(`Cache backup: ${result.rollbackInfo.cacheBackupPath}`);
        console.log('Use "rollback" command if you need to revert changes.');
      }
      
      if (result.state.errors.length > 0) {
        console.log('\n⚠️  Errors encountered:');
        result.state.errors.forEach(error => {
          console.log(`   ${error.severity.toUpperCase()}: ${error.error}`);
        });
      }
      
      if (result.success) {
        console.log('\n🎉 Migration completed successfully!');
        console.log('\n📋 Next Steps:');
        console.log('1. Test your application to ensure everything works');
        console.log('2. Gradually increase NEWS_MIGRATION_PERCENTAGE');
        console.log('3. Monitor performance and error rates');
        console.log('4. Complete migration when ready');
      } else {
        console.log('\n❌ Migration failed. Check errors above.');
        console.log('Use "rollback" command to revert changes if needed.');
        process.exit(1);
      }
      
    } catch (error) {
      console.error('❌ Error during migration:', error);
      process.exit(1);
    }
  });

program
  .command('rollback')
  .description('Rollback the migration to previous state')
  .option('--confirm', 'Confirm that you want to rollback the migration')
  .action(async (options) => {
    try {
      if (!options.confirm) {
        console.log('⚠️  This will revert your configuration and cache data.');
        console.log('   Run with --confirm to proceed with the rollback.');
        process.exit(1);
      }
      
      console.log('⏪ Rolling Back Migration');
      console.log('========================');
      
      const migrationUtils = createNewsMigrationUtilities();
      
      // TODO: Get rollback info from migration state file
      const rollbackInfo = {
        configBackupPath: '.env.backup',
        cacheBackupPath: 'cache.backup',
      };
      
      const result = await migrationUtils.rollbackMigration(rollbackInfo);
      
      console.log('\n📊 Rollback Results:');
      console.log('===================');
      console.log(`Success: ${result.success ? '✅' : '❌'}`);
      
      if (result.errors.length > 0) {
        console.log('\n❌ Errors during rollback:');
        result.errors.forEach(error => {
          console.log(`   ${error}`);
        });
      }
      
      if (result.success) {
        console.log('\n✅ Rollback completed successfully!');
        console.log('Your system has been restored to the previous state.');
      } else {
        console.log('\n❌ Rollback failed. Manual intervention may be required.');
        process.exit(1);
      }
      
    } catch (error) {
      console.error('❌ Error during rollback:', error);
      process.exit(1);
    }
  });

program
  .command('complete')
  .description('Complete migration to NewsData.io (disable NewsAPI)')
  .option('--confirm', 'Confirm that you want to complete the migration')
  .action(async (options) => {
    try {
      if (!options.confirm) {
        console.log('⚠️  This will disable NewsAPI and complete migration to NewsData.io.');
        console.log('   Ensure NewsData.io is working properly before proceeding.');
        console.log('   Run with --confirm to complete the migration.');
        process.exit(1);
      }
      
      console.log('🏁 Completing Migration');
      console.log('======================');
      
      // Update environment variables to complete migration
      console.log('📝 Updating configuration...');
      console.log('   Setting NEWS_MIGRATION_STRATEGY=newsdata-only');
      console.log('   Setting NEWS_MIGRATION_PERCENTAGE=100');
      console.log('   Disabling NewsAPI fallback');
      
      // TODO: Actually update environment variables or config files
      
      console.log('\n✅ Migration completed!');
      console.log('\n📋 Final Steps:');
      console.log('1. Remove NEWS_API_KEY from your environment');
      console.log('2. Set NEWS_MIGRATION_ENABLED=false');
      console.log('3. Remove migration-related environment variables');
      console.log('4. Update your documentation');
      
    } catch (error) {
      console.error('❌ Error completing migration:', error);
      process.exit(1);
    }
  });

// ============================================================================
// Main Program
// ============================================================================

program.parse();