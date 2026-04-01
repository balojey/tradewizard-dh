/**
 * Performance API Route Tests
 * 
 * Tests for the performance dashboard API endpoint
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

// Mock Supabase client
const mockSupabaseClient = {
  from: vi.fn(() => mockSupabaseClient),
  select: vi.fn(() => mockSupabaseClient),
  not: vi.fn(() => mockSupabaseClient),
  order: vi.fn(() => mockSupabaseClient),
  gte: vi.fn(() => mockSupabaseClient),
  eq: vi.fn(() => mockSupabaseClient),
  limit: vi.fn(() => mockSupabaseClient),
  single: vi.fn(() => mockSupabaseClient),
};

// Mock the supabase client creation
vi.mock('@/lib/supabase', () => ({
  createClient: () => mockSupabaseClient,
}));

describe('Performance API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return performance data with default parameters', async () => {
    // Mock successful responses
    mockSupabaseClient.from.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.select.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.not.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.order.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.limit.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.single.mockReturnValue(mockSupabaseClient);

    // Mock the final promise resolution for different queries
    let callCount = 0;
    const mockPromise = vi.fn().mockImplementation(() => {
      callCount++;
      switch (callCount) {
        case 1: // closed markets query
          return Promise.resolve({ 
            data: [
              {
                market_id: 'test-market-1',
                question: 'Test Market Question',
                recommendation_was_correct: true,
                roi_realized: 15.5,
                edge_captured: 0.12,
              }
            ], 
            error: null 
          });
        case 2: // performance summary
          return Promise.resolve({ 
            data: {
              total_resolved_recommendations: 100,
              correct_recommendations: 65,
              win_rate_pct: 65.0,
              avg_roi: 8.5,
            }, 
            error: null 
          });
        default:
          return Promise.resolve({ data: [], error: null });
      }
    });

    // Apply the mock to all chainable methods
    Object.keys(mockSupabaseClient).forEach(key => {
      if (typeof mockSupabaseClient[key] === 'function') {
        mockSupabaseClient[key].mockReturnValue({
          ...mockSupabaseClient,
          then: mockPromise,
          catch: vi.fn(),
        });
      }
    });

    const request = new NextRequest('http://localhost:3000/api/tradewizard/performance');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty('closedMarkets');
    expect(data).toHaveProperty('summary');
    expect(data).toHaveProperty('filters');
    expect(data.filters.timeframe).toBe('all');
    expect(data.filters.category).toBe('all');
    expect(data.filters.confidence).toBe('all');
    expect(data.filters.limit).toBe(50);
  });

  it('should handle query parameters correctly', async () => {
    mockSupabaseClient.from.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.select.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.not.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.order.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.gte.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.eq.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.limit.mockReturnValue(mockSupabaseClient);

    const mockPromise = vi.fn().mockResolvedValue({ data: [], error: null });
    Object.keys(mockSupabaseClient).forEach(key => {
      if (typeof mockSupabaseClient[key] === 'function') {
        mockSupabaseClient[key].mockReturnValue({
          ...mockSupabaseClient,
          then: mockPromise,
          catch: vi.fn(),
        });
      }
    });

    const request = new NextRequest(
      'http://localhost:3000/api/tradewizard/performance?timeframe=30d&category=politics&confidence=high&limit=25'
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.filters.timeframe).toBe('30d');
    expect(data.filters.category).toBe('politics');
    expect(data.filters.confidence).toBe('high');
    expect(data.filters.limit).toBe(25);

    // Verify that filters were applied to the query
    expect(mockSupabaseClient.gte).toHaveBeenCalled(); // timeframe filter
    expect(mockSupabaseClient.eq).toHaveBeenCalledWith('event_type', 'politics');
    expect(mockSupabaseClient.eq).toHaveBeenCalledWith('confidence', 'high');
    expect(mockSupabaseClient.limit).toHaveBeenCalledWith(25);
  });

  it('should handle database errors gracefully', async () => {
    mockSupabaseClient.from.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.select.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.not.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.order.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.limit.mockReturnValue(mockSupabaseClient);

    const mockPromise = vi.fn().mockResolvedValue({ 
      data: null, 
      error: { message: 'Database connection failed' } 
    });

    Object.keys(mockSupabaseClient).forEach(key => {
      if (typeof mockSupabaseClient[key] === 'function') {
        mockSupabaseClient[key].mockReturnValue({
          ...mockSupabaseClient,
          then: mockPromise,
          catch: vi.fn(),
        });
      }
    });

    const request = new NextRequest('http://localhost:3000/api/tradewizard/performance');
    const response = await GET(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toHaveProperty('error');
  });

  it('should calculate performance metrics correctly', async () => {
    const mockClosedMarkets = [
      {
        market_id: '1',
        recommendation_was_correct: true,
        roi_realized: 20.0,
        days_to_resolution: 5.5,
        event_type: 'politics',
      },
      {
        market_id: '2',
        recommendation_was_correct: false,
        roi_realized: -100.0,
        days_to_resolution: 3.2,
        event_type: 'politics',
      },
      {
        market_id: '3',
        recommendation_was_correct: true,
        roi_realized: 15.0,
        days_to_resolution: 7.1,
        event_type: 'sports',
      },
    ];

    // Import the calculation function to test it directly
    const { calculatePerformanceMetrics } = await import('./route');
    const metrics = calculatePerformanceMetrics(mockClosedMarkets);

    expect(metrics.totalMarkets).toBe(3);
    expect(metrics.winRate).toBe(66.67); // 2/3 * 100, rounded
    expect(metrics.avgROI).toBe(-21.67); // (20 + (-100) + 15) / 3, rounded
    expect(metrics.totalProfit).toBe(-65); // 20 + (-100) + 15
    expect(metrics.avgDaysToResolution).toBe(5.3); // (5.5 + 3.2 + 7.1) / 3, rounded

    expect(metrics.categoryBreakdown).toHaveLength(2);
    expect(metrics.categoryBreakdown[0].category).toBe('politics');
    expect(metrics.categoryBreakdown[0].winRate).toBe(50); // 1/2 * 100
    expect(metrics.categoryBreakdown[1].category).toBe('sports');
    expect(metrics.categoryBreakdown[1].winRate).toBe(100); // 1/1 * 100
  });

  it('should handle empty data gracefully', async () => {
    mockSupabaseClient.from.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.select.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.not.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.order.mockReturnValue(mockSupabaseClient);
    mockSupabaseClient.limit.mockReturnValue(mockSupabaseClient);

    const mockPromise = vi.fn().mockResolvedValue({ data: [], error: null });
    Object.keys(mockSupabaseClient).forEach(key => {
      if (typeof mockSupabaseClient[key] === 'function') {
        mockSupabaseClient[key].mockReturnValue({
          ...mockSupabaseClient,
          then: mockPromise,
          catch: vi.fn(),
        });
      }
    });

    const request = new NextRequest('http://localhost:3000/api/tradewizard/performance');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.closedMarkets).toEqual([]);
    expect(data.calculatedMetrics.totalMarkets).toBe(0);
    expect(data.calculatedMetrics.winRate).toBe(0);
  });
});