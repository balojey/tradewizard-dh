/**
 * NewsData.io Article Validation System
 * 
 * Provides comprehensive validation for news articles received from NewsData.io API
 * including required field validation, date format validation, URL validation,
 * and content quality checks.
 * 
 * Features:
 * - Required field validation
 * - Date format and timestamp validation
 * - URL format validation
 * - Content sanitization and normalization
 * - Sentiment score validation
 * - Duplicate article detection
 * - Invalid data handling and logging
 */

import type { AdvancedObservabilityLogger } from './audit-logger.js';
import type { NewsDataArticle } from './newsdata-client.js';

// ============================================================================
// Validation Types and Interfaces
// ============================================================================

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  sanitizedArticle?: NewsDataArticle;
}

export interface ValidationError {
  field: string;
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  code: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  code: string;
}

export interface ValidationConfig {
  // Required field validation
  requiredFields: {
    strict: string[]; // Must be present and non-empty
    optional: string[]; // Should be present but can be empty
  };
  
  // Content validation
  content: {
    maxTitleLength: number;
    maxDescriptionLength: number;
    maxContentLength: number;
    allowEmptyDescription: boolean;
    allowEmptyContent: boolean;
  };
  
  // URL validation
  urls: {
    validateFormat: boolean;
    allowedProtocols: string[];
    checkAccessibility: boolean; // Whether to actually test URL accessibility
  };
  
  // Date validation
  dates: {
    allowFutureDates: boolean;
    maxDaysInFuture: number;
    maxDaysInPast: number;
  };
  
  // Sentiment validation (for paid plans)
  sentiment: {
    validateScores: boolean;
    allowedSentiments: string[];
    scoreRange: { min: number; max: number };
  };
  
  // Duplicate detection
  duplicates: {
    enabled: boolean;
    compareFields: string[];
    similarityThreshold: number; // 0-1, how similar articles need to be to be considered duplicates
  };
  
  // Content sanitization
  sanitization: {
    enabled: boolean;
    removeHtml: boolean;
    normalizeWhitespace: boolean;
    trimContent: boolean;
    removeControlCharacters: boolean;
  };
}

export interface DuplicateDetectionResult {
  isDuplicate: boolean;
  duplicateOf?: string; // article_id of the original
  similarity: number; // 0-1
  matchedFields: string[];
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  requiredFields: {
    strict: ['article_id', 'title', 'link', 'source_id', 'source_name', 'pubDate', 'language'],
    optional: ['description', 'content', 'keywords', 'creator', 'category', 'country'],
  },
  
  content: {
    maxTitleLength: 500,
    maxDescriptionLength: 2000,
    maxContentLength: 50000,
    allowEmptyDescription: true,
    allowEmptyContent: true,
  },
  
  urls: {
    validateFormat: true,
    allowedProtocols: ['http', 'https'],
    checkAccessibility: false, // Too expensive for real-time validation
  },
  
  dates: {
    allowFutureDates: false,
    maxDaysInFuture: 1, // Allow up to 1 day in future for timezone differences
    maxDaysInPast: 365 * 2, // Allow up to 2 years old
  },
  
  sentiment: {
    validateScores: true,
    allowedSentiments: ['positive', 'negative', 'neutral'],
    scoreRange: { min: 0, max: 1 },
  },
  
  duplicates: {
    enabled: true,
    compareFields: ['title', 'link', 'description'],
    similarityThreshold: 0.85,
  },
  
  sanitization: {
    enabled: true,
    removeHtml: true,
    normalizeWhitespace: true,
    trimContent: true,
    removeControlCharacters: true,
  },
};

// ============================================================================
// NewsData Article Validator Class
// ============================================================================

export class NewsDataValidator {
  private config: ValidationConfig;
  private logger?: AdvancedObservabilityLogger;
  private articleCache: Map<string, NewsDataArticle> = new Map(); // For duplicate detection
  
  constructor(
    config: Partial<ValidationConfig> = {},
    logger?: AdvancedObservabilityLogger
  ) {
    this.config = {
      ...DEFAULT_VALIDATION_CONFIG,
      ...config,
      requiredFields: {
        ...DEFAULT_VALIDATION_CONFIG.requiredFields,
        ...config.requiredFields,
      },
      content: {
        ...DEFAULT_VALIDATION_CONFIG.content,
        ...config.content,
      },
      urls: {
        ...DEFAULT_VALIDATION_CONFIG.urls,
        ...config.urls,
      },
      dates: {
        ...DEFAULT_VALIDATION_CONFIG.dates,
        ...config.dates,
      },
      sentiment: {
        ...DEFAULT_VALIDATION_CONFIG.sentiment,
        ...config.sentiment,
      },
      duplicates: {
        ...DEFAULT_VALIDATION_CONFIG.duplicates,
        ...config.duplicates,
      },
      sanitization: {
        ...DEFAULT_VALIDATION_CONFIG.sanitization,
        ...config.sanitization,
      },
    };
    
    this.logger = logger;
  }
  
  /**
   * Validate a single news article
   */
  async validateArticle(article: NewsDataArticle): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    
    try {
      // 1. Required field validation
      this.validateRequiredFields(article, errors);
      
      // 2. Date format and timestamp validation
      this.validateDates(article, errors, warnings);
      
      // 3. URL format validation
      await this.validateUrls(article, errors, warnings);
      
      // 4. Content validation
      this.validateContent(article, errors, warnings);
      
      // 5. Sentiment validation (if applicable)
      this.validateSentiment(article, errors, warnings);
      
      // 6. Sanitize content if enabled
      const sanitizedArticle = this.config.sanitization.enabled 
        ? this.sanitizeArticle(article) 
        : article;
      
      const isValid = errors.length === 0;
      
      // Log validation result
      if (this.logger) {
        console.info('[NewsDataValidator]', {
          timestamp: Date.now(),
          articleId: article?.article_id || 'unknown',
          isValid,
          errorCount: errors.length,
          warningCount: warnings.length,
          errors: errors.map(e => ({ field: e.field, code: e.code, message: e.message })),
        });
      }
      
      return {
        isValid,
        errors,
        warnings,
        sanitizedArticle: isValid ? sanitizedArticle : undefined,
      };
      
    } catch (error) {
      const validationError: ValidationError = {
        field: 'general',
        message: `Validation failed: ${(error as Error).message}`,
        severity: 'critical',
        code: 'VALIDATION_EXCEPTION',
      };
      
      return {
        isValid: false,
        errors: [validationError],
        warnings,
      };
    }
  }
  
  /**
   * Validate multiple articles and filter out invalid ones
   */
  async validateArticles(articles: NewsDataArticle[]): Promise<{
    validArticles: NewsDataArticle[];
    invalidArticles: { article: NewsDataArticle; result: ValidationResult }[];
    duplicates: { article: NewsDataArticle; duplicateOf: string }[];
  }> {
    const validArticles: NewsDataArticle[] = [];
    const invalidArticles: { article: NewsDataArticle; result: ValidationResult }[] = [];
    const duplicates: { article: NewsDataArticle; duplicateOf: string }[] = [];
    
    for (const article of articles) {
      // Check for duplicates first
      if (this.config.duplicates.enabled) {
        const duplicateResult = this.detectDuplicate(article);
        if (duplicateResult.isDuplicate && duplicateResult.duplicateOf) {
          duplicates.push({ article, duplicateOf: duplicateResult.duplicateOf });
          continue;
        }
      }
      
      // Validate article
      const result = await this.validateArticle(article);
      
      if (result.isValid && result.sanitizedArticle) {
        validArticles.push(result.sanitizedArticle);
        
        // Add to cache for duplicate detection
        if (this.config.duplicates.enabled) {
          this.articleCache.set(article.article_id, result.sanitizedArticle);
        }
      } else {
        invalidArticles.push({ article, result });
      }
    }
    
    return { validArticles, invalidArticles, duplicates };
  }
  
  /**
   * Validate required fields
   */
  private validateRequiredFields(article: NewsDataArticle, errors: ValidationError[]): void {
    // Check strict required fields
    for (const field of this.config.requiredFields.strict) {
      const value = (article as any)[field];
      
      if (value === undefined || value === null) {
        errors.push({
          field,
          message: `Required field '${field}' is missing`,
          severity: 'critical',
          code: 'MISSING_REQUIRED_FIELD',
        });
      } else if (typeof value === 'string' && value.trim() === '') {
        errors.push({
          field,
          message: `Required field '${field}' is empty`,
          severity: 'critical',
          code: 'EMPTY_REQUIRED_FIELD',
        });
      }
    }
    
    // Check optional fields (warn if missing)
    for (const field of this.config.requiredFields.optional) {
      const value = (article as any)[field];
      
      if (value === undefined || value === null) {
        // Optional fields missing is not an error, but we might want to track it
        continue;
      }
    }
  }
  
  /**
   * Validate date formats and timestamps
   */
  private validateDates(article: NewsDataArticle, errors: ValidationError[], warnings: ValidationWarning[]): void {
    const now = new Date();
    const maxFutureMs = this.config.dates.maxDaysInFuture * 24 * 60 * 60 * 1000;
    const maxPastMs = this.config.dates.maxDaysInPast * 24 * 60 * 60 * 1000;
    
    // Validate pubDate
    if (article.pubDate) {
      const pubDate = this.parseDate(article.pubDate);
      
      if (!pubDate) {
        errors.push({
          field: 'pubDate',
          message: `Invalid date format: ${article.pubDate}`,
          severity: 'high',
          code: 'INVALID_DATE_FORMAT',
        });
      } else {
        const timeDiff = pubDate.getTime() - now.getTime();
        
        // Check if date is too far in the future
        if (!this.config.dates.allowFutureDates && timeDiff > maxFutureMs) {
          errors.push({
            field: 'pubDate',
            message: `Publication date is too far in the future: ${article.pubDate}`,
            severity: 'medium',
            code: 'FUTURE_DATE_TOO_FAR',
          });
        }
        
        // Check if date is too far in the past
        if (timeDiff < -maxPastMs) {
          warnings.push({
            field: 'pubDate',
            message: `Publication date is very old: ${article.pubDate}`,
            code: 'OLD_PUBLICATION_DATE',
          });
        }
      }
    }
    
    // Validate pubDateTZ if present
    if (article.pubDateTZ) {
      const pubDateTZ = this.parseDate(article.pubDateTZ);
      
      if (!pubDateTZ) {
        warnings.push({
          field: 'pubDateTZ',
          message: `Invalid timezone date format: ${article.pubDateTZ}`,
          code: 'INVALID_TIMEZONE_DATE',
        });
      }
    }
  }
  
  /**
   * Parse date string into Date object
   */
  private parseDate(dateString: string): Date | null {
    try {
      // Try parsing as ISO string first
      const date = new Date(dateString);
      
      // Check if the date is valid
      if (isNaN(date.getTime())) {
        return null;
      }
      
      return date;
    } catch {
      return null;
    }
  }
  
  /**
   * Validate URL formats
   */
  private async validateUrls(article: NewsDataArticle, errors: ValidationError[], warnings: ValidationWarning[]): Promise<void> {
    if (!this.config.urls.validateFormat) {
      return;
    }
    
    // Validate main article link
    if (article.link) {
      const linkValidation = this.validateUrl(article.link);
      if (!linkValidation.isValid) {
        errors.push({
          field: 'link',
          message: `Invalid article URL: ${linkValidation.error}`,
          severity: 'high',
          code: 'INVALID_ARTICLE_URL',
        });
      }
    }
    
    // Validate source URL
    if (article.source_url) {
      const sourceValidation = this.validateUrl(article.source_url);
      if (!sourceValidation.isValid) {
        warnings.push({
          field: 'source_url',
          message: `Invalid source URL: ${sourceValidation.error}`,
          code: 'INVALID_SOURCE_URL',
        });
      }
    }
    
    // Validate image URL
    if (article.image_url) {
      const imageValidation = this.validateUrl(article.image_url);
      if (!imageValidation.isValid) {
        warnings.push({
          field: 'image_url',
          message: `Invalid image URL: ${imageValidation.error}`,
          code: 'INVALID_IMAGE_URL',
        });
      }
    }
    
    // Validate video URL
    if (article.video_url) {
      const videoValidation = this.validateUrl(article.video_url);
      if (!videoValidation.isValid) {
        warnings.push({
          field: 'video_url',
          message: `Invalid video URL: ${videoValidation.error}`,
          code: 'INVALID_VIDEO_URL',
        });
      }
    }
    
    // Validate source icon URL
    if (article.source_icon) {
      const iconValidation = this.validateUrl(article.source_icon);
      if (!iconValidation.isValid) {
        warnings.push({
          field: 'source_icon',
          message: `Invalid source icon URL: ${iconValidation.error}`,
          code: 'INVALID_SOURCE_ICON_URL',
        });
      }
    }
  }
  
  /**
   * Validate a single URL
   */
  private validateUrl(url: string): { isValid: boolean; error?: string } {
    try {
      const urlObj = new URL(url);
      
      // Check protocol
      if (!this.config.urls.allowedProtocols.includes(urlObj.protocol.slice(0, -1))) {
        return {
          isValid: false,
          error: `Protocol '${urlObj.protocol}' not allowed. Allowed: ${this.config.urls.allowedProtocols.join(', ')}`,
        };
      }
      
      // Check for valid hostname
      if (!urlObj.hostname || urlObj.hostname.length === 0) {
        return {
          isValid: false,
          error: 'URL must have a valid hostname',
        };
      }
      
      return { isValid: true };
      
    } catch (error) {
      return {
        isValid: false,
        error: `Invalid URL format: ${(error as Error).message}`,
      };
    }
  }
  
  /**
   * Validate content fields
   */
  private validateContent(article: NewsDataArticle, errors: ValidationError[], warnings: ValidationWarning[]): void {
    // Validate title length
    if (article.title && article.title.length > this.config.content.maxTitleLength) {
      errors.push({
        field: 'title',
        message: `Title exceeds maximum length of ${this.config.content.maxTitleLength} characters`,
        severity: 'medium',
        code: 'TITLE_TOO_LONG',
      });
    }
    
    // Validate description length
    if (article.description) {
      if (article.description.length > this.config.content.maxDescriptionLength) {
        errors.push({
          field: 'description',
          message: `Description exceeds maximum length of ${this.config.content.maxDescriptionLength} characters`,
          severity: 'low',
          code: 'DESCRIPTION_TOO_LONG',
        });
      }
    } else if (!this.config.content.allowEmptyDescription) {
      warnings.push({
        field: 'description',
        message: 'Article has no description',
        code: 'MISSING_DESCRIPTION',
      });
    }
    
    // Validate content length
    if (article.content) {
      if (article.content.length > this.config.content.maxContentLength) {
        warnings.push({
          field: 'content',
          message: `Content exceeds maximum length of ${this.config.content.maxContentLength} characters`,
          code: 'CONTENT_TOO_LONG',
        });
      }
    } else if (!this.config.content.allowEmptyContent) {
      warnings.push({
        field: 'content',
        message: 'Article has no full content',
        code: 'MISSING_CONTENT',
      });
    }
    
    // Validate title is not just whitespace
    if (article.title && article.title.trim().length === 0) {
      errors.push({
        field: 'title',
        message: 'Title cannot be only whitespace',
        severity: 'high',
        code: 'TITLE_ONLY_WHITESPACE',
      });
    }
  }
  
  /**
   * Validate sentiment data (for paid plans)
   */
  private validateSentiment(article: NewsDataArticle, _errors: ValidationError[], warnings: ValidationWarning[]): void {
    if (!this.config.sentiment.validateScores) {
      return;
    }
    
    // Validate sentiment value
    if (article.sentiment && !this.config.sentiment.allowedSentiments.includes(article.sentiment)) {
      warnings.push({
        field: 'sentiment',
        message: `Invalid sentiment value: ${article.sentiment}. Allowed: ${this.config.sentiment.allowedSentiments.join(', ')}`,
        code: 'INVALID_SENTIMENT_VALUE',
      });
    }
    
    // Validate sentiment stats
    if (article.sentiment_stats) {
      const { positive, negative, neutral } = article.sentiment_stats;
      const { min, max } = this.config.sentiment.scoreRange;
      
      // Check if scores are in valid range
      if (positive < min || positive > max) {
        warnings.push({
          field: 'sentiment_stats.positive',
          message: `Positive sentiment score ${positive} is outside valid range [${min}, ${max}]`,
          code: 'INVALID_SENTIMENT_SCORE',
        });
      }
      
      if (negative < min || negative > max) {
        warnings.push({
          field: 'sentiment_stats.negative',
          message: `Negative sentiment score ${negative} is outside valid range [${min}, ${max}]`,
          code: 'INVALID_SENTIMENT_SCORE',
        });
      }
      
      if (neutral < min || neutral > max) {
        warnings.push({
          field: 'sentiment_stats.neutral',
          message: `Neutral sentiment score ${neutral} is outside valid range [${min}, ${max}]`,
          code: 'INVALID_SENTIMENT_SCORE',
        });
      }
      
      // Check if scores sum to approximately 1.0 (allowing for floating point precision)
      const sum = positive + negative + neutral;
      if (Math.abs(sum - 1.0) > 0.01) {
        warnings.push({
          field: 'sentiment_stats',
          message: `Sentiment scores sum to ${sum}, expected approximately 1.0`,
          code: 'SENTIMENT_SCORES_INVALID_SUM',
        });
      }
    }
  }
  
  /**
   * Detect duplicate articles
   */
  detectDuplicate(article: NewsDataArticle): DuplicateDetectionResult {
    if (!this.config.duplicates.enabled || this.articleCache.size === 0) {
      return { isDuplicate: false, similarity: 0, matchedFields: [] };
    }
    
    let highestSimilarity = 0;
    let duplicateOf: string | undefined;
    let matchedFields: string[] = [];
    
    for (const [cachedId, cachedArticle] of this.articleCache) {
      const similarity = this.calculateSimilarity(article, cachedArticle);
      
      if (similarity > highestSimilarity) {
        highestSimilarity = similarity;
        duplicateOf = cachedId;
        matchedFields = this.getMatchedFields(article, cachedArticle);
      }
    }
    
    const isDuplicate = highestSimilarity >= this.config.duplicates.similarityThreshold;
    
    return {
      isDuplicate,
      duplicateOf,
      similarity: highestSimilarity,
      matchedFields,
    };
  }
  
  /**
   * Calculate similarity between two articles
   */
  private calculateSimilarity(article1: NewsDataArticle, article2: NewsDataArticle): number {
    const compareFields = this.config.duplicates.compareFields;
    let totalSimilarity = 0;
    let validComparisons = 0;
    
    for (const field of compareFields) {
      const value1 = (article1 as any)[field];
      const value2 = (article2 as any)[field];
      
      if (value1 && value2) {
        const similarity = this.calculateStringSimilarity(
          String(value1).toLowerCase(),
          String(value2).toLowerCase()
        );
        totalSimilarity += similarity;
        validComparisons++;
      }
    }
    
    return validComparisons > 0 ? totalSimilarity / validComparisons : 0;
  }
  
  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;
    
    const matrix: number[][] = [];
    
    // Initialize matrix
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    // Fill matrix
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }
    
    const maxLength = Math.max(str1.length, str2.length);
    const distance = matrix[str2.length][str1.length];
    
    return 1 - (distance / maxLength);
  }
  
  /**
   * Get fields that matched between two articles
   */
  private getMatchedFields(article1: NewsDataArticle, article2: NewsDataArticle): string[] {
    const matchedFields: string[] = [];
    const compareFields = this.config.duplicates.compareFields;
    
    for (const field of compareFields) {
      const value1 = (article1 as any)[field];
      const value2 = (article2 as any)[field];
      
      if (value1 && value2) {
        const similarity = this.calculateStringSimilarity(
          String(value1).toLowerCase(),
          String(value2).toLowerCase()
        );
        
        if (similarity >= this.config.duplicates.similarityThreshold) {
          matchedFields.push(field);
        }
      }
    }
    
    return matchedFields;
  }
  
  /**
   * Sanitize article content
   */
  private sanitizeArticle(article: NewsDataArticle): NewsDataArticle {
    const sanitized = { ...article };
    
    if (this.config.sanitization.removeHtml) {
      if (sanitized.title) sanitized.title = this.removeHtml(sanitized.title);
      if (sanitized.description) sanitized.description = this.removeHtml(sanitized.description);
      if (sanitized.content) sanitized.content = this.removeHtml(sanitized.content);
    }
    
    if (this.config.sanitization.normalizeWhitespace) {
      if (sanitized.title) sanitized.title = this.normalizeWhitespace(sanitized.title);
      if (sanitized.description) sanitized.description = this.normalizeWhitespace(sanitized.description);
      if (sanitized.content) sanitized.content = this.normalizeWhitespace(sanitized.content);
    }
    
    if (this.config.sanitization.trimContent) {
      if (sanitized.title) sanitized.title = sanitized.title.trim();
      if (sanitized.description) sanitized.description = sanitized.description.trim();
      if (sanitized.content) sanitized.content = sanitized.content.trim();
    }
    
    if (this.config.sanitization.removeControlCharacters) {
      if (sanitized.title) sanitized.title = this.removeControlCharacters(sanitized.title);
      if (sanitized.description) sanitized.description = this.removeControlCharacters(sanitized.description);
      if (sanitized.content) sanitized.content = this.removeControlCharacters(sanitized.content);
    }
    
    return sanitized;
  }
  
  /**
   * Remove HTML tags from text
   */
  private removeHtml(text: string): string {
    return text.replace(/<[^>]*>/g, '');
  }
  
  /**
   * Normalize whitespace (collapse multiple spaces, tabs, newlines)
   */
  private normalizeWhitespace(text: string): string {
    return text.replace(/\s+/g, ' ');
  }
  
  /**
   * Remove control characters
   */
  private removeControlCharacters(text: string): string {
    // Remove control characters except tab, newline, and carriage return
    return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  }
  
  /**
   * Clear the article cache (useful for testing or memory management)
   */
  clearCache(): void {
    this.articleCache.clear();
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; articles: string[] } {
    return {
      size: this.articleCache.size,
      articles: Array.from(this.articleCache.keys()),
    };
  }
  
  /**
   * Update validation configuration
   */
  updateConfig(updates: Partial<ValidationConfig>): void {
    this.config = {
      ...this.config,
      ...updates,
      requiredFields: {
        ...this.config.requiredFields,
        ...updates.requiredFields,
      },
      content: {
        ...this.config.content,
        ...updates.content,
      },
      urls: {
        ...this.config.urls,
        ...updates.urls,
      },
      dates: {
        ...this.config.dates,
        ...updates.dates,
      },
      sentiment: {
        ...this.config.sentiment,
        ...updates.sentiment,
      },
      duplicates: {
        ...this.config.duplicates,
        ...updates.duplicates,
      },
      sanitization: {
        ...this.config.sanitization,
        ...updates.sanitization,
      },
    };
  }
  
  /**
   * Get current validation configuration
   */
  getConfig(): ValidationConfig {
    return { ...this.config };
  }
}

/**
 * Create a NewsData validator instance
 */
export function createNewsDataValidator(
  config: Partial<ValidationConfig> = {},
  logger?: AdvancedObservabilityLogger
): NewsDataValidator {
  return new NewsDataValidator(config, logger);
}

/**
 * Validate a single article (convenience function)
 */
export async function validateNewsArticle(
  article: NewsDataArticle,
  config: Partial<ValidationConfig> = {}
): Promise<ValidationResult> {
  const validator = createNewsDataValidator(config);
  return await validator.validateArticle(article);
}

/**
 * Validate multiple articles (convenience function)
 */
export async function validateNewsArticles(
  articles: NewsDataArticle[],
  config: Partial<ValidationConfig> = {}
): Promise<{
  validArticles: NewsDataArticle[];
  invalidArticles: { article: NewsDataArticle; result: ValidationResult }[];
  duplicates: { article: NewsDataArticle; duplicateOf: string }[];
}> {
  const validator = createNewsDataValidator(config);
  return await validator.validateArticles(articles);
}