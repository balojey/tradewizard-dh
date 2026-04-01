import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SupabaseClientManager, SupabaseConfig, loadSupabaseConfig } from './supabase-client.js';
import { createClient } from '@supabase/supabase-js';

// Mock the Supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

describe('SupabaseClientManager', () => {
  const mockConfig: SupabaseConfig = {
    url: 'https://test.supabase.co',
    anonKey: 'test-anon-key',
    serviceRoleKey: 'test-service-role-key',
  };

  const mockRetryConfig = {
    maxRetries: 2,
    baseDelayMs: 100,
    maxDelayMs: 1000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Connection Management', () => {
    it('should successfully connect to Supabase', async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      };

      vi.mocked(createClient).mockReturnValue(mockClient as any);

      const manager = new SupabaseClientManager(mockConfig, mockRetryConfig);
      await manager.connect();

      expect(manager.isClientConnected()).toBe(true);
      expect(createClient).toHaveBeenCalledWith(
        mockConfig.url,
        mockConfig.serviceRoleKey,
        expect.any(Object)
      );
    });

    it('should use anon key if service role key is not provided', async () => {
      const configWithoutServiceRole: SupabaseConfig = {
        url: 'https://test.supabase.co',
        anonKey: 'test-anon-key',
      };

      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      };

      vi.mocked(createClient).mockReturnValue(mockClient as any);

      const manager = new SupabaseClientManager(configWithoutServiceRole, mockRetryConfig);
      await manager.connect();

      expect(createClient).toHaveBeenCalledWith(
        configWithoutServiceRole.url,
        configWithoutServiceRole.anonKey,
        expect.any(Object)
      );
    });

    it('should disconnect successfully', async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      };

      vi.mocked(createClient).mockReturnValue(mockClient as any);

      const manager = new SupabaseClientManager(mockConfig, mockRetryConfig);
      await manager.connect();
      expect(manager.isClientConnected()).toBe(true);

      await manager.disconnect();
      expect(manager.isClientConnected()).toBe(false);
    });

    it('should throw error when getting client before connecting', () => {
      const manager = new SupabaseClientManager(mockConfig, mockRetryConfig);

      expect(() => manager.getClient()).toThrow(
        '[Supabase] Client not connected. Call connect() first.'
      );
    });
  });

  describe('Connection Retry Logic', () => {
    it('should retry connection on failure', async () => {
      let callCount = 0;
      const mockClient = {
        from: vi.fn().mockImplementation(() => ({
          select: vi.fn().mockImplementation(() => ({
            limit: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount < 3) {
                return Promise.reject(new Error('Connection failed'));
              }
              return Promise.resolve({ data: [], error: null });
            }),
          })),
        })),
      };

      vi.mocked(createClient).mockReturnValue(mockClient as any);

      const manager = new SupabaseClientManager(mockConfig, mockRetryConfig);
      await manager.connect();

      expect(manager.isClientConnected()).toBe(true);
      // Should have been called 3 times (initial + 2 retries)
      expect(callCount).toBe(3);
    });

    it('should throw error after max retries exceeded', async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockRejectedValue(new Error('Connection failed')),
          }),
        }),
      };

      vi.mocked(createClient).mockReturnValue(mockClient as any);

      const manager = new SupabaseClientManager(mockConfig, mockRetryConfig);

      await expect(manager.connect()).rejects.toThrow(
        /Failed to connect after \d+ attempts/
      );
    });

    it('should apply exponential backoff with jitter', async () => {
      let callCount = 0;
      const mockClient = {
        from: vi.fn().mockImplementation(() => ({
          select: vi.fn().mockImplementation(() => ({
            limit: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount < 2) {
                return Promise.reject(new Error('Connection failed'));
              }
              return Promise.resolve({ data: [], error: null });
            }),
          })),
        })),
      };

      vi.mocked(createClient).mockReturnValue(mockClient as any);

      const manager = new SupabaseClientManager(mockConfig, mockRetryConfig);
      const startTime = Date.now();
      await manager.connect();
      const duration = Date.now() - startTime;

      // Should have waited at least baseDelayMs (100ms)
      expect(duration).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Health Check', () => {
    it('should return true for successful health check', async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      };

      vi.mocked(createClient).mockReturnValue(mockClient as any);

      const manager = new SupabaseClientManager(mockConfig, mockRetryConfig);
      await manager.connect();

      const isHealthy = await manager.healthCheck();
      expect(isHealthy).toBe(true);
    });

    it('should return true when table does not exist (PGRST116)', async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116', message: 'relation does not exist' },
            }),
          }),
        }),
      };

      vi.mocked(createClient).mockReturnValue(mockClient as any);

      const manager = new SupabaseClientManager(mockConfig, mockRetryConfig);
      await manager.connect();

      const isHealthy = await manager.healthCheck();
      expect(isHealthy).toBe(true);
    });

    it('should return false for failed health check', async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST000', message: 'Connection error' },
            }),
          }),
        }),
      };

      vi.mocked(createClient).mockReturnValue(mockClient as any);

      const manager = new SupabaseClientManager(mockConfig, mockRetryConfig);
      await manager.connect();

      const isHealthy = await manager.healthCheck();
      expect(isHealthy).toBe(false);
    });

    it('should return false when client is not connected', async () => {
      const manager = new SupabaseClientManager(mockConfig, mockRetryConfig);
      const isHealthy = await manager.healthCheck();
      expect(isHealthy).toBe(false);
    });
  });

  describe('Retry Wrapper', () => {
    it('should execute function successfully on first try', async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      };

      vi.mocked(createClient).mockReturnValue(mockClient as any);

      const manager = new SupabaseClientManager(mockConfig, mockRetryConfig);
      await manager.connect();

      const mockFn = vi.fn().mockResolvedValue('success');
      const result = await manager.withRetry(mockFn, 'test operation');

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry function on failure', async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      };

      vi.mocked(createClient).mockReturnValue(mockClient as any);

      const manager = new SupabaseClientManager(mockConfig, mockRetryConfig);
      await manager.connect();

      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValue('success');

      const result = await manager.withRetry(mockFn, 'test operation');

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should throw error after max retries in withRetry', async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      };

      vi.mocked(createClient).mockReturnValue(mockClient as any);

      const manager = new SupabaseClientManager(mockConfig, mockRetryConfig);
      await manager.connect();

      const mockFn = vi.fn().mockRejectedValue(new Error('Persistent failure'));

      await expect(manager.withRetry(mockFn, 'test operation')).rejects.toThrow(
        /test operation failed after \d+ attempts/
      );
    });
  });

  describe('Configuration Loading', () => {
    it('should load configuration from environment variables', () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        SUPABASE_URL: 'https://env-test.supabase.co',
        SUPABASE_KEY: 'env-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'env-service-role-key',
      };

      const config = loadSupabaseConfig();

      expect(config).toEqual({
        url: 'https://env-test.supabase.co',
        anonKey: 'env-anon-key',
        serviceRoleKey: 'env-service-role-key',
      });

      process.env = originalEnv;
    });

    it('should throw error when SUPABASE_URL is missing', () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        SUPABASE_URL: undefined,
        SUPABASE_KEY: 'test-key',
      };

      expect(() => loadSupabaseConfig()).toThrow(
        '[Supabase] SUPABASE_URL environment variable is required'
      );

      process.env = originalEnv;
    });

    it('should throw error when SUPABASE_KEY is missing', () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_KEY: undefined,
        SUPABASE_ANON_KEY: undefined,
      };

      expect(() => loadSupabaseConfig()).toThrow(
        '[Supabase] SUPABASE_KEY or SUPABASE_ANON_KEY environment variable is required'
      );

      process.env = originalEnv;
    });

    it('should accept SUPABASE_ANON_KEY as alternative to SUPABASE_KEY', () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_KEY: undefined,
        SUPABASE_ANON_KEY: 'anon-key-alternative',
      };

      const config = loadSupabaseConfig();

      expect(config.anonKey).toBe('anon-key-alternative');

      process.env = originalEnv;
    });
  });
});
