/**
 * Serper API Client with Multi-Key Rotation
 * 
 * Provides unified interface for Serper search and scrape endpoints with
 * automatic API key rotation on rate limits and blocking errors.
 * 
 * Follows the same pattern as NewsData API client for consistency.
 */

// Key State Management
export interface KeyState {
  key: string;                    // Full API key
  keyId: string;                  // First 8 chars for logging
  isRateLimited: boolean;         // Currently rate-limited?
  rateLimitExpiry: Date | null;   // When rate limit expires
  totalRequests: number;          // Lifetime request count
  lastUsed: Date | null;          // Last request timestamp
}

// Configuration
export interface SerperConfig {
  apiKey: string;                 // Comma-separated keys
  searchUrl?: string;             // Default: https://google.serper.dev/search
  scrapeUrl?: string;             // Default: https://scrape.serper.dev
  timeout?: number;               // Default: 30000ms
  retryAttempts?: number;         // Default: 3
  retryDelay?: number;            // Default: 1000ms
}

// Search Parameters
export interface SerperSearchParams {
  q: string;                      // Search query (required)
  num?: number;                   // Number of results (default: 10, max: 20)
  tbs?: string;                   // Time range filter (qdr:h, qdr:d, qdr:w, qdr:m, qdr:y)
  gl?: string;                    // Country code (e.g., "us")
  hl?: string;                    // Language code (e.g., "en")
}

// Search Response
export interface SerperSearchResult {
  title: string;
  link: string;
  snippet: string;
  date?: string;
  position: number;
}

export interface SerperSearchResponse {
  searchParameters: {
    q: string;
    gl?: string;
    hl?: string;
    num?: number;
    type?: string;
  };
  organic: SerperSearchResult[];
  answerBox?: any;
  knowledgeGraph?: any;
}

// Scrape Parameters
export interface SerperScrapeParams {
  url: string;                    // URL to scrape (required)
}

// Scrape Response
export interface SerperScrapeResponse {
  url: string;
  title?: string;
  text?: string;                  // Full webpage text content
  metadata?: {
    description?: string;
    keywords?: string;
    author?: string;
    publishedDate?: string;
  };
}

// Key Rotation Stats
export interface KeyRotationStats {
  totalKeys: number;
  availableKeys: number;
  rateLimitedKeys: number;
  keyStats: Array<{
    keyId: string;
    isRateLimited: boolean;
    rateLimitExpiry: Date | null;
    totalRequests: number;
    lastUsed: Date | null;
  }>;
}

/**
 * Serper API Client with multi-key rotation support
 * 
 * Automatically rotates API keys when rate limits or blocking errors are detected.
 * Follows LRU (Least Recently Used) strategy for key selection.
 */
export class SerperClient {
  private config: SerperConfig;
  private apiKeys: string[];
  private keyStates: Map<string, KeyState>;
  private currentKeyIndex: number;
  
  constructor(config: SerperConfig) {
    this.config = {
      searchUrl: 'https://google.serper.dev/search',
      scrapeUrl: 'https://scrape.serper.dev',
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      ...config,
    };
    
    // Parse comma-separated API keys
    this.apiKeys = config.apiKey
      .split(',')
      .map(key => key.trim())
      .filter(key => key.length > 0);
    
    if (this.apiKeys.length === 0) {
      throw new Error('At least one API key is required');
    }
    
    // Initialize key states
    this.keyStates = new Map();
    for (const key of this.apiKeys) {
      const keyId = this.getKeyId(key);
      this.keyStates.set(keyId, {
        key,
        keyId,
        isRateLimited: false,
        rateLimitExpiry: null,
        totalRequests: 0,
        lastUsed: null,
      });
    }
    
    this.currentKeyIndex = 0;
  }
  
  /**
   * Execute web search
   */
  async search(params: SerperSearchParams): Promise<SerperSearchResponse> {
    const url = this.config.searchUrl!;
    const body = {
      q: params.q,
      num: params.num || 10,
      ...(params.tbs && { tbs: params.tbs }),
      ...(params.gl && { gl: params.gl }),
      ...(params.hl && { hl: params.hl }),
    };
    
    return this.executeRequest<SerperSearchResponse>(url, body, 'search');
  }
  
  /**
   * Scrape webpage content
   */
  async scrape(params: SerperScrapeParams): Promise<SerperScrapeResponse> {
    const url = this.config.scrapeUrl!;
    const body = { url: params.url };
    
    return this.executeRequest<SerperScrapeResponse>(url, body, 'scrape');
  }
  
  /**
   * Execute API request with retry and key rotation
   */
  private async executeRequest<T>(
    url: string,
    body: any,
    endpoint: 'search' | 'scrape'
  ): Promise<T> {
    let lastError: Error | null = null;
    let attempt = 0;
    
    while (attempt < this.config.retryAttempts!) {
      try {
        // Get current API key
        const currentKey = this.getCurrentKey();
        if (!currentKey) {
          // All keys exhausted
          console.warn('[SerperClient] All API keys exhausted or rate-limited');
          return this.getGracefulDegradationResponse<T>(endpoint);
        }
        
        // Make request
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': currentKey.key,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        // Check for blocking errors (trigger rotation without counting as retry)
        if (this.isBlockingError(response)) {
          const retryAfter = this.extractRetryAfter(response);
          const newKey = this.rotateApiKey(retryAfter, {
            endpoint,
            statusCode: response.status,
            params: body,
          });
          
          if (!newKey) {
            // All keys exhausted
            return this.getGracefulDegradationResponse<T>(endpoint);
          }
          
          // Retry with new key (doesn't count as retry attempt)
          continue;
        }
        
        // Check for success
        if (response.ok) {
          // Update key state
          this.updateKeyStateOnSuccess(currentKey.keyId);
          
          // Parse and return response
          const data = await response.json();
          return data as T;
        }
        
        // Other errors - retry with backoff
        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
        attempt++;
        
        if (attempt < this.config.retryAttempts!) {
          await this.delay(this.config.retryDelay! * Math.pow(2, attempt - 1));
        }
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        attempt++;
        
        if (attempt < this.config.retryAttempts!) {
          await this.delay(this.config.retryDelay! * Math.pow(2, attempt - 1));
        }
      }
    }
    
    // All retries exhausted
    console.error('[SerperClient] All retry attempts exhausted:', lastError);
    return this.getGracefulDegradationResponse<T>(endpoint);
  }
  
  /**
   * Get key identifier (first 8 characters)
   */
  private getKeyId(key: string): string {
    return key.length >= 8 ? key.substring(0, 8) : key;
  }
  
  /**
   * Check if response indicates rate limit
   */
  private isRateLimitError(response: Response): boolean {
    return response.status === 429;
  }
  
  /**
   * Check if response indicates blocking error
   */
  private isBlockingError(response: Response): boolean {
    return [401, 403, 402, 429].includes(response.status);
  }
  
  /**
   * Extract retry-after duration from response
   */
  private extractRetryAfter(response: Response): number {
    const retryAfter = response.headers.get('Retry-After') || 
                       response.headers.get('X-RateLimit-Reset');
    
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) {
        return seconds;
      }
    }
    
    // Default to 15 minutes (900 seconds)
    return 900;
  }
  
  /**
   * Get list of available keys (LRU sorted, auto-expire rate limits)
   */
  private getAvailableKeys(): string[] {
    const now = new Date();
    const available: Array<{ keyId: string; lastUsed: Date | null }> = [];
    
    for (const [keyId, state] of this.keyStates.entries()) {
      // Auto-expire rate limits
      if (state.isRateLimited && state.rateLimitExpiry && state.rateLimitExpiry <= now) {
        state.isRateLimited = false;
        state.rateLimitExpiry = null;
      }
      
      // Add to available if not rate-limited
      if (!state.isRateLimited) {
        available.push({ keyId, lastUsed: state.lastUsed });
      }
    }
    
    // Sort by LRU (oldest lastUsed first, null lastUsed first)
    available.sort((a, b) => {
      if (a.lastUsed === null && b.lastUsed === null) return 0;
      if (a.lastUsed === null) return -1;
      if (b.lastUsed === null) return 1;
      return a.lastUsed.getTime() - b.lastUsed.getTime();
    });
    
    return available.map(item => item.keyId);
  }
  
  /**
   * Rotate to next available API key
   */
  private rotateApiKey(
    retryAfterSeconds: number,
    context?: any
  ): KeyState | null {
    // Mark current key as rate-limited
    const currentKey = this.getCurrentKey();
    if (currentKey) {
      const state = this.keyStates.get(currentKey.keyId);
      if (state) {
        state.isRateLimited = true;
        state.rateLimitExpiry = new Date(Date.now() + retryAfterSeconds * 1000);
        
        console.warn(
          `[SerperClient] Key ${currentKey.keyId} rate-limited, expires at ${state.rateLimitExpiry.toISOString()}`,
          context
        );
      }
    }
    
    // Get available keys
    const availableKeyIds = this.getAvailableKeys();
    
    if (availableKeyIds.length === 0) {
      console.error('[SerperClient] All API keys exhausted or rate-limited');
      return null;
    }
    
    // Select LRU key
    const nextKeyId = availableKeyIds[0];
    const nextKey = this.keyStates.get(nextKeyId);
    
    if (nextKey) {
      console.log(`[SerperClient] Rotated to key ${nextKeyId}`);
      return nextKey;
    }
    
    return null;
  }
  
  /**
   * Get current API key
   */
  private getCurrentKey(): KeyState | null {
    const availableKeyIds = this.getAvailableKeys();
    
    if (availableKeyIds.length === 0) {
      return null;
    }
    
    // Return LRU key
    const keyId = availableKeyIds[0];
    return this.keyStates.get(keyId) || null;
  }
  
  /**
   * Update key state after successful request
   */
  private updateKeyStateOnSuccess(keyId: string): void {
    const state = this.keyStates.get(keyId);
    if (state) {
      state.lastUsed = new Date();
      state.totalRequests++;
    }
  }
  
  /**
   * Get key rotation statistics
   */
  getKeyRotationStats(): KeyRotationStats {
    const stats: KeyRotationStats = {
      totalKeys: this.apiKeys.length,
      availableKeys: 0,
      rateLimitedKeys: 0,
      keyStats: [],
    };
    
    for (const [keyId, state] of this.keyStates.entries()) {
      if (state.isRateLimited) {
        stats.rateLimitedKeys++;
      } else {
        stats.availableKeys++;
      }
      
      stats.keyStats.push({
        keyId: state.keyId,
        isRateLimited: state.isRateLimited,
        rateLimitExpiry: state.rateLimitExpiry,
        totalRequests: state.totalRequests,
        lastUsed: state.lastUsed,
      });
    }
    
    return stats;
  }
  
  /**
   * Get graceful degradation response
   */
  private getGracefulDegradationResponse<T>(endpoint: 'search' | 'scrape'): T {
    if (endpoint === 'search') {
      return {
        searchParameters: { q: '' },
        organic: [],
      } as T;
    } else {
      return {
        url: '',
        title: '',
        text: '',
      } as T;
    }
  }
  
  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
