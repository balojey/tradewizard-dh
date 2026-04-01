/**
 * Unit tests for PostgreSQL checkpointer
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPostgresCheckpointer, createPostgresCheckpointerWithConfig } from './postgres-checkpointer.js';
import { SupabaseClientManager } from './supabase-client.js';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

// Mock the PostgresSaver
vi.mock('@langchain/langgraph-checkpoint-postgres', () => ({
  PostgresSaver: {
    fromConnString: vi.fn(),
  },
}));

describe('PostgreSQL Checkpointer', () => {
  let mockSupabaseManager: SupabaseClientManager;
  let mockCheckpointer: any;

  beforeEach(() => {
    // Create mock Supabase manager
    mockSupabaseManager = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      getClient: vi.fn(),
      isClientConnected: vi.fn().mockReturnValue(true),
      healthCheck: vi.fn().mockResolvedValue(true),
      withRetry: vi.fn(),
    } as any;

    // Create mock checkpointer
    mockCheckpointer = {
      setup: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      list: vi.fn().mockResolvedValue([]),
    };

    // Mock PostgresSaver.fromConnString
    vi.mocked(PostgresSaver.fromConnString).mockReturnValue(mockCheckpointer);

    // Set environment variables
    process.env.SUPABASE_URL = 'https://test-project.supabase.co';
    process.env.SUPABASE_DB_PASSWORD = 'test-password';
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_DB_PASSWORD;
  });

  describe('createPostgresCheckpointer', () => {
    it('should create a PostgreSQL checkpointer with Supabase connection', async () => {
      const checkpointer = await createPostgresCheckpointer(mockSupabaseManager);

      expect(PostgresSaver.fromConnString).toHaveBeenCalledWith(
        'postgresql://postgres:test-password@db.test-project.supabase.co:5432/postgres'
      );
      expect(mockCheckpointer.setup).toHaveBeenCalled();
      expect(checkpointer).toBe(mockCheckpointer);
    });

    it('should throw error if SUPABASE_URL is missing', async () => {
      delete process.env.SUPABASE_URL;

      await expect(createPostgresCheckpointer(mockSupabaseManager)).rejects.toThrow(
        'SUPABASE_URL environment variable is required'
      );
    });

    it('should throw error if SUPABASE_URL format is invalid', async () => {
      process.env.SUPABASE_URL = 'https://invalid-url.com';

      await expect(createPostgresCheckpointer(mockSupabaseManager)).rejects.toThrow(
        'Invalid SUPABASE_URL format'
      );
    });

    it('should throw error if database password is missing', async () => {
      delete process.env.SUPABASE_DB_PASSWORD;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      await expect(createPostgresCheckpointer(mockSupabaseManager)).rejects.toThrow(
        'SUPABASE_DB_PASSWORD or SUPABASE_SERVICE_ROLE_KEY environment variable is required'
      );
    });

    it('should use SUPABASE_SERVICE_ROLE_KEY as fallback for password', async () => {
      delete process.env.SUPABASE_DB_PASSWORD;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

      await createPostgresCheckpointer(mockSupabaseManager);

      expect(PostgresSaver.fromConnString).toHaveBeenCalledWith(
        'postgresql://postgres:service-role-key@db.test-project.supabase.co:5432/postgres'
      );
    });

    it('should call setup on the checkpointer', async () => {
      await createPostgresCheckpointer(mockSupabaseManager);

      expect(mockCheckpointer.setup).toHaveBeenCalledTimes(1);
    });

    it('should handle setup errors', async () => {
      const setupError = new Error('Setup failed');
      mockCheckpointer.setup.mockRejectedValue(setupError);

      await expect(createPostgresCheckpointer(mockSupabaseManager)).rejects.toThrow('Setup failed');
    });
  });

  describe('createPostgresCheckpointerWithConfig', () => {
    it('should create a PostgreSQL checkpointer with custom config', async () => {
      const config = {
        connectionString: 'postgresql://user:pass@localhost:5432/db',
      };

      const checkpointer = await createPostgresCheckpointerWithConfig(config);

      expect(PostgresSaver.fromConnString).toHaveBeenCalledWith(config.connectionString);
      expect(mockCheckpointer.setup).toHaveBeenCalled();
      expect(checkpointer).toBe(mockCheckpointer);
    });

    it('should throw error if connectionString is missing', async () => {
      const config = {} as any;

      await expect(createPostgresCheckpointerWithConfig(config)).rejects.toThrow(
        'connectionString is required'
      );
    });

    it('should call setup on the checkpointer', async () => {
      const config = {
        connectionString: 'postgresql://user:pass@localhost:5432/db',
      };

      await createPostgresCheckpointerWithConfig(config);

      expect(mockCheckpointer.setup).toHaveBeenCalledTimes(1);
    });
  });
});
