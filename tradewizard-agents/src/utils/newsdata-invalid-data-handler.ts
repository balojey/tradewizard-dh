/**
 * NewsData.io Invalid Data Handler
 * 
 * Provides comprehensive handling for invalid and malformed news data including
 * detailed logging, exclusion logic, data recovery attempts, and reporting
 * capabilities for monitoring data quality issues.
 * 
 * Features:
 * - Invalid article detection and categorization
 * - Detailed logging with structured error information
 * - Data recovery and repair attempts
 * - Quality metrics and reporting
 * - Configurable exclusion policies
 * - Integration with observability systems
 */

import type { AdvancedObservabilityLogger } from './audit-logger.js';
import type { NewsDataArticle } from './newsdata-client.js';
import type { ValidationResult, ValidationError, ValidationWarning } from './newsdata-validator.js';

// ============================================================================
// Invalid Data Handling Types and Interfaces
// ============================================================================

export interface InvalidDataConfig {
  // Logging configuration
  logging: {
    enabled: boolean;
    logLevel: 'error' | 'warn' | 'info' | 'debug';
    includeArticleContent: boolean;
    maxContentLength: number;
    structuredLogging: boolean;
  };
  
  // Exclusion policies
  exclusion: {
    strictMode: boolean; // Exclude articles with any validation errors
    excludeOnCriticalErrors: boolean;
    excludeOnHighErrors: boolean;
    excludeOnMediumErrors: boolean;
    excludeOnLowErrors: boolean;
    maxErrorsPerArticle: number;
    maxWarningsPerArticle: number;
  };
  
  // Data recovery
  recovery: {
    enabled: boolean;
    attemptFieldRepair: boolean;
    useDefaultValues: boolean;
    repairStrategies: ('trim' | 'sanitize' | 'reconstruct' | 'fallback')[];
  };
  
  // Quality tracking
  quality: {
    trackMetrics: boolean;
    reportingInterval: number; // milliseconds
    alertThresholds: {
      invalidArticleRate: number; // 0-1
      criticalErrorRate: number; // 0-1
      dataQualityScore: number; // 0-1
    };
  };
  
  // Categorization
  categorization: {
    enabled: boolean;
    categories: {
      malformed: string[];
      incomplete: string[];
      corrupted: string[];
      suspicious: string[];
    };
  };
}

export interface InvalidDataReport {
  timestamp: number;
  articleId: string;
  invalidityReason: InvalidityReason;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'malformed' | 'incomplete' | 'corrupted' | 'suspicious' | 'unknown';
  errors: ValidationError[];
  warnings: ValidationWarning[];
  recoveryAttempted: boolean;
  recoverySuccessful: boolean;
  originalArticle?: Partial<NewsDataArticle>;
  repairedArticle?: NewsDataArticle;
  exclusionReason?: string;
}

export interface InvalidityReason {
  code: string;
  message: string;
  field?: string;
  expectedType?: string;
  actualType?: string;
  expectedFormat?: string;
  actualValue?: any;
}

export interface DataQualityMetrics {
  totalArticlesProcessed: number;
  validArticles: number;
  invalidArticles: number;
  invalidityRate: number;
  errorsByCategory: Record<string, number>;
  errorsBySeverity: Record<string, number>;
  recoveryAttempts: number;
  recoverySuccesses: number;
  recoveryRate: number;
  averageErrorsPerArticle: number;
  averageWarningsPerArticle: number;
  qualityScore: number; // 0-1
  lastUpdated: number;
}

export interface RecoveryResult {
  successful: boolean;
  repairedArticle?: NewsDataArticle;
  appliedStrategies: string[];
  remainingErrors: ValidationError[];
  recoveryNotes: string[];
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_INVALID_DATA_CONFIG: InvalidDataConfig = {
  logging: {
    enabled: true,
    logLevel: 'warn',
    includeArticleContent: false,
    maxContentLength: 500,
    structuredLogging: true,
  },
  
  exclusion: {
    strictMode: false,
    excludeOnCriticalErrors: true,
    excludeOnHighErrors: true,
    excludeOnMediumErrors: false,
    excludeOnLowErrors: false,
    maxErrorsPerArticle: 5,
    maxWarningsPerArticle: 10,
  },
  
  recovery: {
    enabled: true,
    attemptFieldRepair: true,
    useDefaultValues: false,
    repairStrategies: ['trim', 'sanitize', 'fallback'],
  },
  
  quality: {
    trackMetrics: true,
    reportingInterval: 300000, // 5 minutes
    alertThresholds: {
      invalidArticleRate: 0.1, // 10%
      criticalErrorRate: 0.05, // 5%
      dataQualityScore: 0.8, // 80%
    },
  },
  
  categorization: {
    enabled: true,
    categories: {
      malformed: ['INVALID_JSON', 'MISSING_REQUIRED_FIELD', 'INVALID_DATE_FORMAT', 'INVALID_URL_FORMAT'],
      incomplete: ['EMPTY_REQUIRED_FIELD', 'MISSING_DESCRIPTION', 'MISSING_CONTENT'],
      corrupted: ['INVALID_ENCODING', 'TRUNCATED_CONTENT', 'GARBLED_TEXT'],
      suspicious: ['DUPLICATE_CONTENT', 'SPAM_INDICATORS', 'FAKE_NEWS_MARKERS'],
    },
  },
};

// ============================================================================
// Invalid Data Handler Class
// ============================================================================

export class NewsDataInvalidDataHandler {
  private config: InvalidDataConfig;
  private logger?: AdvancedObservabilityLogger;
  private metrics: DataQualityMetrics;
  private invalidDataReports: InvalidDataReport[] = [];
  private metricsReportingTimer?: NodeJS.Timeout;
  
  constructor(
    config: Partial<InvalidDataConfig> = {},
    logger?: AdvancedObservabilityLogger
  ) {
    this.config = this.mergeConfig(DEFAULT_INVALID_DATA_CONFIG, config);
    this.logger = logger;
    
    // Initialize metrics
    this.metrics = {
      totalArticlesProcessed: 0,
      validArticles: 0,
      invalidArticles: 0,
      invalidityRate: 0,
      errorsByCategory: {},
      errorsBySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      recoveryAttempts: 0,
      recoverySuccesses: 0,
      recoveryRate: 0,
      averageErrorsPerArticle: 0,
      averageWarningsPerArticle: 0,
      qualityScore: 1.0,
      lastUpdated: Date.now(),
    };
    
    // Start metrics reporting if enabled
    if (this.config.quality.trackMetrics && this.config.quality.reportingInterval > 0) {
      this.startMetricsReporting();
    }
  }
  
  /**
   * Deep merge configuration objects
   */
  private mergeConfig(
    defaultConfig: InvalidDataConfig,
    userConfig: Partial<InvalidDataConfig>
  ): InvalidDataConfig {
    return {
      logging: { ...defaultConfig.logging, ...userConfig.logging },
      exclusion: { ...defaultConfig.exclusion, ...userConfig.exclusion },
      recovery: { ...defaultConfig.recovery, ...userConfig.recovery },
      quality: {
        ...defaultConfig.quality,
        ...userConfig.quality,
        alertThresholds: { ...defaultConfig.quality.alertThresholds, ...userConfig.quality?.alertThresholds },
      },
      categorization: {
        ...defaultConfig.categorization,
        ...userConfig.categorization,
        categories: {
          ...defaultConfig.categorization.categories,
          ...userConfig.categorization?.categories,
        },
      },
    };
  }
  
  /**
   * Handle invalid article data
   */
  async handleInvalidArticle(
    article: NewsDataArticle,
    validationResult: ValidationResult
  ): Promise<{
    shouldExclude: boolean;
    exclusionReason?: string;
    repairedArticle?: NewsDataArticle;
    report: InvalidDataReport;
  }> {
    const startTime = Date.now();
    
    try {
      // Update metrics
      this.updateMetrics(validationResult);
      
      // Determine invalidity reason and category
      const invalidityReason = this.determineInvalidityReason(validationResult);
      const category = this.categorizeInvalidity(validationResult.errors);
      const severity = this.determineSeverity(validationResult.errors);
      
      // Attempt data recovery if enabled
      let recoveryResult: RecoveryResult | null = null;
      if (this.config.recovery.enabled) {
        recoveryResult = await this.attemptDataRecovery(article, validationResult);
      }
      
      // Determine if article should be excluded
      const exclusionDecision = this.shouldExcludeArticle(validationResult, recoveryResult);
      
      // Create invalid data report
      const report: InvalidDataReport = {
        timestamp: Date.now(),
        articleId: article.article_id,
        invalidityReason,
        severity,
        category,
        errors: validationResult.errors,
        warnings: validationResult.warnings,
        recoveryAttempted: this.config.recovery.enabled,
        recoverySuccessful: recoveryResult?.successful || false,
        originalArticle: this.config.logging.includeArticleContent 
          ? this.sanitizeArticleForLogging(article)
          : undefined,
        repairedArticle: recoveryResult?.repairedArticle,
        exclusionReason: exclusionDecision.shouldExclude ? exclusionDecision.reason : undefined,
      };
      
      // Log the invalid data
      await this.logInvalidData(report);
      
      // Store report for metrics and analysis
      this.invalidDataReports.push(report);
      
      // Trim old reports to prevent memory leaks
      if (this.invalidDataReports.length > 1000) {
        this.invalidDataReports = this.invalidDataReports.slice(-500);
      }
      
      // Check alert thresholds
      this.checkAlertThresholds();
      
      const duration = Date.now() - startTime;
      if (this.logger) {
        console.debug('[InvalidDataHandler]', {
          timestamp: Date.now(),
          operation: 'invalid_data_handling',
          duration,
          context: { articleId: article.article_id, category, severity },
        });
      }
      
      return {
        shouldExclude: exclusionDecision.shouldExclude,
        exclusionReason: exclusionDecision.reason,
        repairedArticle: recoveryResult?.repairedArticle,
        report,
      };
      
    } catch (error) {
      if (this.logger) {
        console.error('[InvalidDataHandler]', {
          timestamp: Date.now(),
          error: (error as Error).message,
          context: { 
            articleId: article.article_id, 
            operation: 'invalid_data_handling',
            stack: (error as Error).stack,
          },
        });
      }
      
      // Return safe defaults on error
      return {
        shouldExclude: true,
        exclusionReason: `Error during invalid data handling: ${(error as Error).message}`,
        report: {
          timestamp: Date.now(),
          articleId: article.article_id,
          invalidityReason: {
            code: 'HANDLER_ERROR',
            message: (error as Error).message,
          },
          severity: 'critical',
          category: 'unknown',
          errors: validationResult.errors,
          warnings: validationResult.warnings,
          recoveryAttempted: false,
          recoverySuccessful: false,
          exclusionReason: `Handler error: ${(error as Error).message}`,
        },
      };
    }
  }
  
  /**
   * Update quality metrics
   */
  private updateMetrics(validationResult: ValidationResult): void {
    this.metrics.totalArticlesProcessed++;
    
    if (validationResult.isValid) {
      this.metrics.validArticles++;
    } else {
      this.metrics.invalidArticles++;
    }
    
    // Update error counts by severity
    validationResult.errors.forEach(error => {
      this.metrics.errorsBySeverity[error.severity]++;
      
      // Update error counts by category
      if (!this.metrics.errorsByCategory[error.code]) {
        this.metrics.errorsByCategory[error.code] = 0;
      }
      this.metrics.errorsByCategory[error.code]++;
    });
    
    // Recalculate derived metrics
    this.metrics.invalidityRate = this.metrics.invalidArticles / this.metrics.totalArticlesProcessed;
    
    const totalErrors = Object.values(this.metrics.errorsBySeverity).reduce((sum, count) => sum + count, 0);
    this.metrics.averageErrorsPerArticle = totalErrors / this.metrics.totalArticlesProcessed;
    
    // Calculate quality score (1.0 - weighted error rate)
    const criticalWeight = 1.0;
    const highWeight = 0.7;
    const mediumWeight = 0.4;
    const lowWeight = 0.1;
    
    const weightedErrors = 
      this.metrics.errorsBySeverity.critical * criticalWeight +
      this.metrics.errorsBySeverity.high * highWeight +
      this.metrics.errorsBySeverity.medium * mediumWeight +
      this.metrics.errorsBySeverity.low * lowWeight;
    
    const maxPossibleErrors = this.metrics.totalArticlesProcessed * criticalWeight;
    this.metrics.qualityScore = Math.max(0, 1 - (weightedErrors / maxPossibleErrors));
    
    this.metrics.lastUpdated = Date.now();
  }
  
  /**
   * Determine the primary reason for invalidity
   */
  private determineInvalidityReason(validationResult: ValidationResult): InvalidityReason {
    if (validationResult.errors.length === 0) {
      return {
        code: 'NO_ERRORS',
        message: 'Article is valid',
      };
    }
    
    // Find the most severe error
    const criticalErrors = validationResult.errors.filter(e => e.severity === 'critical');
    const highErrors = validationResult.errors.filter(e => e.severity === 'high');
    const mediumErrors = validationResult.errors.filter(e => e.severity === 'medium');
    const lowErrors = validationResult.errors.filter(e => e.severity === 'low');
    
    const primaryError = criticalErrors[0] || highErrors[0] || mediumErrors[0] || lowErrors[0];
    
    return {
      code: primaryError.code,
      message: primaryError.message,
      field: primaryError.field,
    };
  }
  
  /**
   * Categorize the type of invalidity
   */
  private categorizeInvalidity(errors: ValidationError[]): 'malformed' | 'incomplete' | 'corrupted' | 'suspicious' | 'unknown' {
    if (!this.config.categorization.enabled) {
      return 'unknown';
    }
    
    const errorCodes = errors.map(e => e.code);
    
    // Check each category
    for (const [category, codes] of Object.entries(this.config.categorization.categories)) {
      if (errorCodes.some(code => codes.includes(code))) {
        return category as 'malformed' | 'incomplete' | 'corrupted' | 'suspicious';
      }
    }
    
    return 'unknown';
  }
  
  /**
   * Determine overall severity from errors
   */
  private determineSeverity(errors: ValidationError[]): 'critical' | 'high' | 'medium' | 'low' {
    if (errors.some(e => e.severity === 'critical')) return 'critical';
    if (errors.some(e => e.severity === 'high')) return 'high';
    if (errors.some(e => e.severity === 'medium')) return 'medium';
    return 'low';
  }
  
  /**
   * Attempt to recover/repair invalid data
   */
  private async attemptDataRecovery(
    article: NewsDataArticle,
    validationResult: ValidationResult
  ): Promise<RecoveryResult> {
    this.metrics.recoveryAttempts++;
    
    const appliedStrategies: string[] = [];
    const recoveryNotes: string[] = [];
    let repairedArticle = { ...article };
    let remainingErrors = [...validationResult.errors];
    
    try {
      // Apply recovery strategies in order
      for (const strategy of this.config.recovery.repairStrategies) {
        const strategyResult = await this.applyRecoveryStrategy(
          repairedArticle,
          remainingErrors,
          strategy
        );
        
        if (strategyResult.applied) {
          appliedStrategies.push(strategy);
          repairedArticle = strategyResult.repairedArticle;
          remainingErrors = strategyResult.remainingErrors;
          recoveryNotes.push(...strategyResult.notes);
        }
      }
      
      const successful = remainingErrors.filter(e => e.severity === 'critical' || e.severity === 'high').length === 0;
      
      if (successful) {
        this.metrics.recoverySuccesses++;
        this.metrics.recoveryRate = this.metrics.recoverySuccesses / this.metrics.recoveryAttempts;
      }
      
      return {
        successful,
        repairedArticle: successful ? repairedArticle : undefined,
        appliedStrategies,
        remainingErrors,
        recoveryNotes,
      };
      
    } catch (error) {
      recoveryNotes.push(`Recovery failed: ${(error as Error).message}`);
      
      return {
        successful: false,
        appliedStrategies,
        remainingErrors,
        recoveryNotes,
      };
    }
  }
  
  /**
   * Apply a specific recovery strategy
   */
  private async applyRecoveryStrategy(
    article: NewsDataArticle,
    errors: ValidationError[],
    strategy: string
  ): Promise<{
    applied: boolean;
    repairedArticle: NewsDataArticle;
    remainingErrors: ValidationError[];
    notes: string[];
  }> {
    const notes: string[] = [];
    let repairedArticle = { ...article };
    let remainingErrors = [...errors];
    let applied = false;
    
    switch (strategy) {
      case 'trim':
        // Trim whitespace from string fields
        if (repairedArticle.title) {
          const trimmed = repairedArticle.title.trim();
          if (trimmed !== repairedArticle.title) {
            repairedArticle.title = trimmed;
            applied = true;
            notes.push('Trimmed title whitespace');
          }
        }
        
        if (repairedArticle.description) {
          const trimmed = repairedArticle.description.trim();
          if (trimmed !== repairedArticle.description) {
            repairedArticle.description = trimmed;
            applied = true;
            notes.push('Trimmed description whitespace');
          }
        }
        
        // Remove errors that were fixed by trimming
        remainingErrors = remainingErrors.filter(error => 
          !(error.code === 'TITLE_ONLY_WHITESPACE' && repairedArticle.title.trim().length > 0)
        );
        break;
        
      case 'sanitize':
        // Basic text sanitization
        if (repairedArticle.title) {
          const sanitized = this.sanitizeText(repairedArticle.title);
          if (sanitized !== repairedArticle.title) {
            repairedArticle.title = sanitized;
            applied = true;
            notes.push('Sanitized title text');
          }
        }
        
        if (repairedArticle.description) {
          const sanitized = this.sanitizeText(repairedArticle.description);
          if (sanitized !== repairedArticle.description) {
            repairedArticle.description = sanitized;
            applied = true;
            notes.push('Sanitized description text');
          }
        }
        break;
        
      case 'fallback':
        // Use fallback values for missing required fields
        if (this.config.recovery.useDefaultValues) {
          if (!repairedArticle.description || repairedArticle.description.trim() === '') {
            repairedArticle.description = 'No description available';
            applied = true;
            notes.push('Added fallback description');
            
            // Remove related errors
            remainingErrors = remainingErrors.filter(error => 
              error.code !== 'MISSING_DESCRIPTION'
            );
          }
        }
        break;
        
      case 'reconstruct':
        // Attempt to reconstruct missing data from available fields
        if (!repairedArticle.description && repairedArticle.content) {
          // Use first sentence of content as description
          const firstSentence = repairedArticle.content.split('.')[0] + '.';
          if (firstSentence.length > 10 && firstSentence.length < 200) {
            repairedArticle.description = firstSentence;
            applied = true;
            notes.push('Reconstructed description from content');
          }
        }
        break;
    }
    
    return {
      applied,
      repairedArticle,
      remainingErrors,
      notes,
    };
  }
  
  /**
   * Basic text sanitization
   */
  private sanitizeText(text: string): string {
    return text
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }
  
  /**
   * Determine if article should be excluded
   */
  private shouldExcludeArticle(
    validationResult: ValidationResult,
    recoveryResult: RecoveryResult | null
  ): { shouldExclude: boolean; reason?: string } {
    // If recovery was successful, don't exclude
    if (recoveryResult?.successful) {
      return { shouldExclude: false };
    }
    
    const errors = recoveryResult?.remainingErrors || validationResult.errors;
    const warnings = validationResult.warnings;
    
    // Strict mode: exclude any article with errors
    if (this.config.exclusion.strictMode && errors.length > 0) {
      return { shouldExclude: true, reason: 'Strict mode: article has validation errors' };
    }
    
    // Check error count limits
    if (errors.length > this.config.exclusion.maxErrorsPerArticle) {
      return { 
        shouldExclude: true, 
        reason: `Too many errors: ${errors.length} > ${this.config.exclusion.maxErrorsPerArticle}` 
      };
    }
    
    if (warnings.length > this.config.exclusion.maxWarningsPerArticle) {
      return { 
        shouldExclude: true, 
        reason: `Too many warnings: ${warnings.length} > ${this.config.exclusion.maxWarningsPerArticle}` 
      };
    }
    
    // Check severity-based exclusion
    const hasCritical = errors.some(e => e.severity === 'critical');
    const hasHigh = errors.some(e => e.severity === 'high');
    const hasMedium = errors.some(e => e.severity === 'medium');
    const hasLow = errors.some(e => e.severity === 'low');
    
    if (hasCritical && this.config.exclusion.excludeOnCriticalErrors) {
      return { shouldExclude: true, reason: 'Article has critical validation errors' };
    }
    
    if (hasHigh && this.config.exclusion.excludeOnHighErrors) {
      return { shouldExclude: true, reason: 'Article has high severity validation errors' };
    }
    
    if (hasMedium && this.config.exclusion.excludeOnMediumErrors) {
      return { shouldExclude: true, reason: 'Article has medium severity validation errors' };
    }
    
    if (hasLow && this.config.exclusion.excludeOnLowErrors) {
      return { shouldExclude: true, reason: 'Article has low severity validation errors' };
    }
    
    return { shouldExclude: false };
  }
  
  /**
   * Log invalid data with appropriate level and structure
   */
  private async logInvalidData(report: InvalidDataReport): Promise<void> {
    if (!this.config.logging.enabled || !this.logger) {
      return;
    }
    
    const logData = {
      timestamp: report.timestamp,
      articleId: report.articleId,
      category: report.category,
      severity: report.severity,
      invalidityReason: report.invalidityReason,
      errorCount: report.errors.length,
      warningCount: report.warnings.length,
      recoveryAttempted: report.recoveryAttempted,
      recoverySuccessful: report.recoverySuccessful,
      excluded: !!report.exclusionReason,
      exclusionReason: report.exclusionReason,
    };
    
    // Add detailed error information if structured logging is enabled
    if (this.config.logging.structuredLogging) {
      (logData as any).errors = report.errors.map(e => ({
        field: e.field,
        code: e.code,
        message: e.message,
        severity: e.severity,
      }));
      
      (logData as any).warnings = report.warnings.map(w => ({
        field: w.field,
        code: w.code,
        message: w.message,
      }));
    }
    
    // Add article content if enabled (truncated)
    if (this.config.logging.includeArticleContent && report.originalArticle) {
      (logData as any).originalArticle = report.originalArticle;
    }
    
    // Log at appropriate level
    switch (this.config.logging.logLevel) {
      case 'error':
        if (report.severity === 'critical' || report.severity === 'high') {
          console.error('[InvalidDataHandler]', {
            timestamp: Date.now(),
            error: `Invalid article data: ${report.invalidityReason.message}`,
            context: logData,
          });
        }
        break;
        
      case 'warn':
        if (report.severity === 'critical' || report.severity === 'high' || report.severity === 'medium') {
          console.warn('[InvalidDataHandler]', {
            timestamp: Date.now(),
            message: `Invalid article data: ${report.invalidityReason.message}`,
            context: logData,
          });
        }
        break;
        
      case 'info':
        console.info('[InvalidDataHandler]', {
          timestamp: Date.now(),
          message: `Invalid article data: ${report.invalidityReason.message}`,
          context: logData,
        });
        break;
        
      case 'debug':
        console.debug('[InvalidDataHandler]', {
          timestamp: Date.now(),
          message: `Invalid article data: ${report.invalidityReason.message}`,
          context: logData,
        });
        break;
    }
  }
  
  /**
   * Sanitize article for logging (remove sensitive data, truncate content)
   */
  private sanitizeArticleForLogging(article: NewsDataArticle): Partial<NewsDataArticle> {
    const sanitized: Partial<NewsDataArticle> = {
      article_id: article.article_id,
      title: article.title,
      source_id: article.source_id,
      source_name: article.source_name,
      pubDate: article.pubDate,
      language: article.language,
    };
    
    // Truncate description and content
    if (article.description) {
      sanitized.description = article.description.length > this.config.logging.maxContentLength
        ? article.description.substring(0, this.config.logging.maxContentLength) + '...'
        : article.description;
    }
    
    if (article.content) {
      sanitized.content = article.content.length > this.config.logging.maxContentLength
        ? article.content.substring(0, this.config.logging.maxContentLength) + '...'
        : article.content;
    }
    
    return sanitized;
  }
  
  /**
   * Check alert thresholds and trigger alerts if necessary
   */
  private checkAlertThresholds(): void {
    const thresholds = this.config.quality.alertThresholds;
    
    // Check invalid article rate
    if (this.metrics.invalidityRate > thresholds.invalidArticleRate) {
      if (this.logger) {
        console.warn('[InvalidDataHandler]', {
          timestamp: Date.now(),
          level: 'warning',
          message: `High invalid article rate: ${(this.metrics.invalidityRate * 100).toFixed(1)}%`,
          context: {
            threshold: thresholds.invalidArticleRate,
            actual: this.metrics.invalidityRate,
            totalProcessed: this.metrics.totalArticlesProcessed,
            invalidCount: this.metrics.invalidArticles,
          },
        });
      }
    }
    
    // Check critical error rate
    const criticalErrorRate = this.metrics.errorsBySeverity.critical / this.metrics.totalArticlesProcessed;
    if (criticalErrorRate > thresholds.criticalErrorRate) {
      if (this.logger) {
        console.error('[InvalidDataHandler]', {
          timestamp: Date.now(),
          level: 'error',
          message: `High critical error rate: ${(criticalErrorRate * 100).toFixed(1)}%`,
          context: {
            threshold: thresholds.criticalErrorRate,
            actual: criticalErrorRate,
            criticalErrors: this.metrics.errorsBySeverity.critical,
            totalProcessed: this.metrics.totalArticlesProcessed,
          },
        });
      }
    }
    
    // Check data quality score
    if (this.metrics.qualityScore < thresholds.dataQualityScore) {
      if (this.logger) {
        console.warn('[InvalidDataHandler]', {
          timestamp: Date.now(),
          level: 'warning',
          message: `Low data quality score: ${(this.metrics.qualityScore * 100).toFixed(1)}%`,
          context: {
            threshold: thresholds.dataQualityScore,
            actual: this.metrics.qualityScore,
            metrics: this.metrics,
          },
        });
      }
    }
  }
  
  /**
   * Start periodic metrics reporting
   */
  private startMetricsReporting(): void {
    this.metricsReportingTimer = setInterval(() => {
      this.reportMetrics();
    }, this.config.quality.reportingInterval);
  }
  
  /**
   * Report current metrics
   */
  private reportMetrics(): void {
    if (!this.logger) return;
    
    console.info('[InvalidDataHandler]', {
      timestamp: Date.now(),
      metrics: {
        dataQuality: this.metrics,
        recentReports: this.invalidDataReports.slice(-10).map(r => ({
          timestamp: r.timestamp,
          articleId: r.articleId,
          category: r.category,
          severity: r.severity,
          recoverySuccessful: r.recoverySuccessful,
        })),
      },
    });
  }
  
  /**
   * Get current data quality metrics
   */
  getMetrics(): DataQualityMetrics {
    return { ...this.metrics };
  }
  
  /**
   * Get recent invalid data reports
   */
  getRecentReports(limit: number = 50): InvalidDataReport[] {
    return this.invalidDataReports.slice(-limit);
  }
  
  /**
   * Clear metrics and reports (useful for testing)
   */
  clearMetrics(): void {
    this.metrics = {
      totalArticlesProcessed: 0,
      validArticles: 0,
      invalidArticles: 0,
      invalidityRate: 0,
      errorsByCategory: {},
      errorsBySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      recoveryAttempts: 0,
      recoverySuccesses: 0,
      recoveryRate: 0,
      averageErrorsPerArticle: 0,
      averageWarningsPerArticle: 0,
      qualityScore: 1.0,
      lastUpdated: Date.now(),
    };
    
    this.invalidDataReports = [];
  }
  
  /**
   * Update configuration
   */
  updateConfig(updates: Partial<InvalidDataConfig>): void {
    this.config = this.mergeConfig(this.config, updates);
    
    // Restart metrics reporting if interval changed
    if (updates.quality?.reportingInterval && this.metricsReportingTimer) {
      clearInterval(this.metricsReportingTimer);
      this.startMetricsReporting();
    }
  }
  
  /**
   * Get current configuration
   */
  getConfig(): InvalidDataConfig {
    return { ...this.config };
  }
  
  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.metricsReportingTimer) {
      clearInterval(this.metricsReportingTimer);
      this.metricsReportingTimer = undefined;
    }
  }
}

/**
 * Create an invalid data handler instance
 */
export function createNewsDataInvalidDataHandler(
  config: Partial<InvalidDataConfig> = {},
  logger?: AdvancedObservabilityLogger
): NewsDataInvalidDataHandler {
  return new NewsDataInvalidDataHandler(config, logger);
}