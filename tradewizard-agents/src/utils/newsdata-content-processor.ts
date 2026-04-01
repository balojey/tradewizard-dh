/**
 * NewsData.io Content Processing and Sanitization
 * 
 * Provides advanced content processing capabilities for news articles including
 * text sanitization, normalization, sentiment score validation, and duplicate
 * article filtering with sophisticated similarity detection.
 * 
 * Features:
 * - Advanced text sanitization and normalization
 * - HTML tag removal and entity decoding
 * - Content quality scoring
 * - Sentiment score validation for paid plan features
 * - Sophisticated duplicate detection with multiple algorithms
 * - Content fingerprinting for fast duplicate detection
 * - Text similarity analysis using multiple metrics
 */

import type { AdvancedObservabilityLogger } from './audit-logger.js';
import type { NewsDataArticle } from './newsdata-client.js';

// ============================================================================
// Content Processing Types and Interfaces
// ============================================================================

export interface ContentProcessingConfig {
  // Text sanitization
  sanitization: {
    removeHtml: boolean;
    decodeHtmlEntities: boolean;
    normalizeWhitespace: boolean;
    removeControlCharacters: boolean;
    removeEmojis: boolean;
    trimContent: boolean;
    maxLineLength?: number;
  };
  
  // Content normalization
  normalization: {
    lowercaseForComparison: boolean;
    removePunctuation: boolean;
    removeStopWords: boolean;
    stemWords: boolean;
    normalizeUnicode: boolean;
  };
  
  // Quality scoring
  quality: {
    enabled: boolean;
    minTitleLength: number;
    minDescriptionLength: number;
    minContentLength: number;
    maxDuplicateWords: number;
    penalizeAllCaps: boolean;
    penalizeExcessivePunctuation: boolean;
  };
  
  // Sentiment validation
  sentiment: {
    validateScores: boolean;
    allowedSentiments: string[];
    scoreRange: { min: number; max: number };
    scoreTolerance: number; // Tolerance for floating point comparison
    requireScoreSum: boolean; // Whether sentiment scores should sum to 1.0
  };
  
  // Duplicate detection
  duplicates: {
    enabled: boolean;
    algorithms: ('exact' | 'fuzzy' | 'semantic' | 'fingerprint')[];
    thresholds: {
      exact: number;
      fuzzy: number;
      semantic: number;
      fingerprint: number;
    };
    compareFields: string[];
    fingerprintLength: number;
    useContentFingerprints: boolean;
  };
}

export interface ContentQualityScore {
  overall: number; // 0-1
  factors: {
    titleQuality: number;
    descriptionQuality: number;
    contentQuality: number;
    languageQuality: number;
    structureQuality: number;
  };
  issues: string[];
}

export interface DuplicateAnalysis {
  isDuplicate: boolean;
  confidence: number; // 0-1
  duplicateOf?: string;
  algorithm: string;
  similarity: number;
  matchedFields: string[];
  fingerprint?: string;
}

export interface ProcessedContent {
  original: string;
  sanitized: string;
  normalized: string;
  fingerprint: string;
  wordCount: number;
  characterCount: number;
  qualityScore: ContentQualityScore;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_CONTENT_PROCESSING_CONFIG: ContentProcessingConfig = {
  sanitization: {
    removeHtml: true,
    decodeHtmlEntities: true,
    normalizeWhitespace: true,
    removeControlCharacters: true,
    removeEmojis: false,
    trimContent: true,
    maxLineLength: 1000,
  },
  
  normalization: {
    lowercaseForComparison: true,
    removePunctuation: false,
    removeStopWords: false,
    stemWords: false,
    normalizeUnicode: true,
  },
  
  quality: {
    enabled: true,
    minTitleLength: 10,
    minDescriptionLength: 20,
    minContentLength: 50,
    maxDuplicateWords: 0.7, // 70% duplicate words threshold
    penalizeAllCaps: true,
    penalizeExcessivePunctuation: true,
  },
  
  sentiment: {
    validateScores: true,
    allowedSentiments: ['positive', 'negative', 'neutral'],
    scoreRange: { min: 0, max: 1 },
    scoreTolerance: 0.01,
    requireScoreSum: true,
  },
  
  duplicates: {
    enabled: true,
    algorithms: ['exact', 'fuzzy', 'fingerprint'],
    thresholds: {
      exact: 0.95,
      fuzzy: 0.85,
      semantic: 0.80,
      fingerprint: 0.90,
    },
    compareFields: ['title', 'description', 'content'],
    fingerprintLength: 64,
    useContentFingerprints: true,
  },
};

// ============================================================================
// Content Processor Class
// ============================================================================

export class NewsDataContentProcessor {
  private config: ContentProcessingConfig;
  private logger?: AdvancedObservabilityLogger;
  private contentCache: Map<string, {
    title: ProcessedContent;
    description?: ProcessedContent;
    content?: ProcessedContent;
  }> = new Map();
  private fingerprintIndex: Map<string, string[]> = new Map(); // fingerprint -> article_ids
  
  // Common English stop words for content analysis
  private readonly stopWords = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
    'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
    'to', 'was', 'will', 'with', 'would', 'have', 'had', 'been', 'this',
    'these', 'they', 'were', 'said', 'each', 'which', 'their', 'time',
    'but', 'not', 'can', 'could', 'should', 'would', 'may', 'might'
  ]);
  
  // HTML entities mapping
  private readonly htmlEntities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™',
    '&hellip;': '...',
    '&mdash;': '—',
    '&ndash;': '–',
    '&lsquo;': '\u2018',
    '&rsquo;': '\u2019',
    '&ldquo;': '"',
    '&rdquo;': '"',
  };
  
  constructor(
    config: Partial<ContentProcessingConfig> = {},
    logger?: AdvancedObservabilityLogger
  ) {
    this.config = this.mergeConfig(DEFAULT_CONTENT_PROCESSING_CONFIG, config);
    this.logger = logger;
  }
  
  /**
   * Deep merge configuration objects
   */
  private mergeConfig(
    defaultConfig: ContentProcessingConfig,
    userConfig: Partial<ContentProcessingConfig>
  ): ContentProcessingConfig {
    return {
      sanitization: { ...defaultConfig.sanitization, ...userConfig.sanitization },
      normalization: { ...defaultConfig.normalization, ...userConfig.normalization },
      quality: { ...defaultConfig.quality, ...userConfig.quality },
      sentiment: { ...defaultConfig.sentiment, ...userConfig.sentiment },
      duplicates: {
        ...defaultConfig.duplicates,
        ...userConfig.duplicates,
        thresholds: { ...defaultConfig.duplicates.thresholds, ...userConfig.duplicates?.thresholds },
      },
    };
  }
  
  /**
   * Process a single news article
   */
  async processArticle(article: NewsDataArticle): Promise<{
    processedArticle: NewsDataArticle;
    qualityScore: ContentQualityScore;
    duplicateAnalysis: DuplicateAnalysis;
    contentProcessing: {
      title: ProcessedContent;
      description?: ProcessedContent;
      content?: ProcessedContent;
    };
  }> {
    const startTime = Date.now();
    
    try {
      // Process content fields
      const titleProcessing = this.processContent(article.title, 'title');
      const descriptionProcessing = article.description 
        ? this.processContent(article.description, 'description')
        : undefined;
      const contentProcessing = article.content 
        ? this.processContent(article.content, 'content')
        : undefined;
      
      // Create processed article with sanitized content
      const processedArticle: NewsDataArticle = {
        ...article,
        title: titleProcessing.sanitized,
        description: descriptionProcessing?.sanitized || article.description,
        content: contentProcessing?.sanitized || article.content,
      };
      
      // Validate sentiment scores
      this.validateSentimentScores(processedArticle);
      
      // Calculate overall quality score
      const qualityScore = this.calculateQualityScore(
        titleProcessing,
        descriptionProcessing,
        contentProcessing
      );
      
      // Perform duplicate analysis
      const duplicateAnalysis = await this.analyzeDuplicates(processedArticle);
      
      // Cache processed content for future duplicate detection
      if (!duplicateAnalysis.isDuplicate) {
        this.cacheProcessedContent(article.article_id, {
          title: titleProcessing,
          description: descriptionProcessing,
          content: contentProcessing,
        });
      }
      
      // Log processing result
      const duration = Date.now() - startTime;
      if (this.logger) {
        console.info('[ContentProcessing]', {
          timestamp: Date.now(),
          articleId: article.article_id,
          duration,
          qualityScore: qualityScore.overall,
          isDuplicate: duplicateAnalysis.isDuplicate,
          processingSteps: ['sanitization', 'normalization', 'quality_scoring', 'duplicate_detection'],
        });
      }
      
      return {
        processedArticle,
        qualityScore,
        duplicateAnalysis,
        contentProcessing: {
          title: titleProcessing,
          description: descriptionProcessing,
          content: contentProcessing,
        },
      };
      
    } catch (error) {
      if (this.logger) {
        console.error('[ContentProcessing]', {
          timestamp: Date.now(),
          error: (error as Error).message,
          context: { articleId: article.article_id, operation: 'content_processing' },
        });
      }
      
      throw error;
    }
  }
  
  /**
   * Process multiple articles and filter duplicates
   */
  async processArticles(articles: NewsDataArticle[]): Promise<{
    processedArticles: NewsDataArticle[];
    duplicates: { article: NewsDataArticle; duplicateOf: string; confidence: number }[];
    qualityScores: Map<string, ContentQualityScore>;
    lowQualityArticles: { article: NewsDataArticle; score: number; issues: string[] }[];
  }> {
    const processedArticles: NewsDataArticle[] = [];
    const duplicates: { article: NewsDataArticle; duplicateOf: string; confidence: number }[] = [];
    const qualityScores = new Map<string, ContentQualityScore>();
    const lowQualityArticles: { article: NewsDataArticle; score: number; issues: string[] }[] = [];
    
    for (const article of articles) {
      const result = await this.processArticle(article);
      
      if (result.duplicateAnalysis.isDuplicate && result.duplicateAnalysis.duplicateOf) {
        duplicates.push({
          article,
          duplicateOf: result.duplicateAnalysis.duplicateOf,
          confidence: result.duplicateAnalysis.confidence,
        });
      } else {
        processedArticles.push(result.processedArticle);
        qualityScores.set(article.article_id, result.qualityScore);
        
        // Track low quality articles
        if (result.qualityScore.overall < 0.5) {
          lowQualityArticles.push({
            article: result.processedArticle,
            score: result.qualityScore.overall,
            issues: result.qualityScore.issues,
          });
        }
      }
    }
    
    return {
      processedArticles,
      duplicates,
      qualityScores,
      lowQualityArticles,
    };
  }
  
  /**
   * Process content text (sanitize, normalize, analyze)
   */
  private processContent(text: string, type: 'title' | 'description' | 'content'): ProcessedContent {
    const original = text;
    
    // Step 1: Sanitization
    let sanitized = this.sanitizeText(text);
    
    // Step 2: Normalization
    const normalized = this.normalizeText(sanitized);
    
    // Step 3: Generate fingerprint
    const fingerprint = this.generateFingerprint(normalized);
    
    // Step 4: Calculate metrics
    const wordCount = this.countWords(sanitized);
    const characterCount = sanitized.length;
    
    // Step 5: Calculate quality score
    const qualityScore = this.calculateContentQuality(sanitized, type);
    
    return {
      original,
      sanitized,
      normalized,
      fingerprint,
      wordCount,
      characterCount,
      qualityScore,
    };
  }
  
  /**
   * Sanitize text content
   */
  private sanitizeText(text: string): string {
    let sanitized = text;
    
    // Remove HTML tags
    if (this.config.sanitization.removeHtml) {
      sanitized = sanitized.replace(/<[^>]*>/g, '');
    }
    
    // Decode HTML entities
    if (this.config.sanitization.decodeHtmlEntities) {
      for (const [entity, replacement] of Object.entries(this.htmlEntities)) {
        sanitized = sanitized.replace(new RegExp(entity, 'g'), replacement);
      }
      // Handle numeric entities
      sanitized = sanitized.replace(/&#(\d+);/g, (_, num) => {
        return String.fromCharCode(parseInt(num, 10));
      });
      sanitized = sanitized.replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
        return String.fromCharCode(parseInt(hex, 16));
      });
    }
    
    // Remove control characters
    if (this.config.sanitization.removeControlCharacters) {
      sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    }
    
    // Remove emojis
    if (this.config.sanitization.removeEmojis) {
      sanitized = sanitized.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '');
    }
    
    // Normalize whitespace
    if (this.config.sanitization.normalizeWhitespace) {
      sanitized = sanitized.replace(/\s+/g, ' ');
    }
    
    // Trim content
    if (this.config.sanitization.trimContent) {
      sanitized = sanitized.trim();
    }
    
    // Limit line length
    if (this.config.sanitization.maxLineLength) {
      const lines = sanitized.split('\n');
      sanitized = lines
        .map(line => line.length > this.config.sanitization.maxLineLength! 
          ? line.substring(0, this.config.sanitization.maxLineLength!) + '...'
          : line
        )
        .join('\n');
    }
    
    return sanitized;
  }
  
  /**
   * Normalize text for comparison
   */
  private normalizeText(text: string): string {
    let normalized = text;
    
    // Convert to lowercase
    if (this.config.normalization.lowercaseForComparison) {
      normalized = normalized.toLowerCase();
    }
    
    // Normalize Unicode
    if (this.config.normalization.normalizeUnicode) {
      normalized = normalized.normalize('NFKC');
    }
    
    // Remove punctuation
    if (this.config.normalization.removePunctuation) {
      normalized = normalized.replace(/[^\w\s]/g, '');
    }
    
    // Remove stop words
    if (this.config.normalization.removeStopWords) {
      const words = normalized.split(/\s+/);
      const filteredWords = words.filter(word => !this.stopWords.has(word.toLowerCase()));
      normalized = filteredWords.join(' ');
    }
    
    // Basic stemming (remove common suffixes)
    if (this.config.normalization.stemWords) {
      normalized = this.applyStemming(normalized);
    }
    
    return normalized;
  }
  
  /**
   * Apply basic stemming to text
   */
  private applyStemming(text: string): string {
    const words = text.split(/\s+/);
    const stemmedWords = words.map(word => {
      // Basic English stemming rules
      if (word.endsWith('ing') && word.length > 6) {
        return word.slice(0, -3);
      }
      if (word.endsWith('ed') && word.length > 5) {
        return word.slice(0, -2);
      }
      if (word.endsWith('ly') && word.length > 5) {
        return word.slice(0, -2);
      }
      if (word.endsWith('s') && word.length > 3 && !word.endsWith('ss')) {
        return word.slice(0, -1);
      }
      return word;
    });
    
    return stemmedWords.join(' ');
  }
  
  /**
   * Generate content fingerprint for fast duplicate detection
   */
  private generateFingerprint(text: string): string {
    // Use a simple hash-based fingerprint
    const words = text.split(/\s+/).filter(word => word.length > 2);
    const significantWords = words.slice(0, this.config.duplicates.fingerprintLength);
    
    // Create a hash from significant words
    let hash = 0;
    const combined = significantWords.join(' ');
    
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return Math.abs(hash).toString(16);
  }
  
  /**
   * Count words in text
   */
  private countWords(text: string): number {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }
  
  /**
   * Calculate content quality score
   */
  private calculateContentQuality(text: string, type: 'title' | 'description' | 'content'): ContentQualityScore {
    const issues: string[] = [];
    let score = 1.0;
    
    // Length checks
    const minLengths = {
      title: this.config.quality.minTitleLength,
      description: this.config.quality.minDescriptionLength,
      content: this.config.quality.minContentLength,
    };
    
    if (text.length < minLengths[type]) {
      issues.push(`${type} too short (${text.length} < ${minLengths[type]})`);
      score -= 0.3;
    }
    
    // All caps penalty
    if (this.config.quality.penalizeAllCaps) {
      const uppercaseRatio = (text.match(/[A-Z]/g) || []).length / text.length;
      if (uppercaseRatio > 0.5) {
        issues.push('Excessive uppercase text');
        score -= 0.2;
      }
    }
    
    // Excessive punctuation penalty
    let punctuationRatio = 0;
    if (this.config.quality.penalizeExcessivePunctuation) {
      punctuationRatio = (text.match(/[!?.,;:]/g) || []).length / text.length;
      if (punctuationRatio > 0.1) {
        issues.push('Excessive punctuation');
        score -= 0.1;
      }
    }
    
    // Duplicate words check
    const words = text.toLowerCase().split(/\s+/);
    const uniqueWords = new Set(words);
    const duplicateRatio = 1 - (uniqueWords.size / words.length);
    
    if (duplicateRatio > this.config.quality.maxDuplicateWords) {
      issues.push(`High word repetition (${Math.round(duplicateRatio * 100)}%)`);
      score -= 0.2;
    }
    
    // Ensure score is between 0 and 1
    score = Math.max(0, Math.min(1, score));
    
    return {
      overall: score,
      factors: {
        titleQuality: type === 'title' ? score : 1,
        descriptionQuality: type === 'description' ? score : 1,
        contentQuality: type === 'content' ? score : 1,
        languageQuality: 1 - (punctuationRatio || 0),
        structureQuality: 1 - duplicateRatio,
      },
      issues,
    };
  }
  
  /**
   * Calculate overall quality score from individual content scores
   */
  private calculateQualityScore(
    title: ProcessedContent,
    description?: ProcessedContent,
    content?: ProcessedContent
  ): ContentQualityScore {
    const scores = [title.qualityScore];
    if (description) scores.push(description.qualityScore);
    if (content) scores.push(content.qualityScore);
    
    const overall = scores.reduce((sum, score) => sum + score.overall, 0) / scores.length;
    const allIssues = scores.flatMap(score => score.issues);
    
    return {
      overall,
      factors: {
        titleQuality: title.qualityScore.overall,
        descriptionQuality: description?.qualityScore.overall || 1,
        contentQuality: content?.qualityScore.overall || 1,
        languageQuality: scores.reduce((sum, score) => sum + score.factors.languageQuality, 0) / scores.length,
        structureQuality: scores.reduce((sum, score) => sum + score.factors.structureQuality, 0) / scores.length,
      },
      issues: allIssues,
    };
  }
  
  /**
   * Validate sentiment scores for paid plan features
   */
  private validateSentimentScores(article: NewsDataArticle): void {
    if (!this.config.sentiment.validateScores) {
      return;
    }
    
    // Validate sentiment value
    if (article.sentiment && !this.config.sentiment.allowedSentiments.includes(article.sentiment)) {
      if (this.logger) {
        console.warn('[ContentProcessing]', {
          timestamp: Date.now(),
          message: `Invalid sentiment value: ${article.sentiment}`,
          context: { articleId: article.article_id },
        });
      }
    }
    
    // Validate sentiment stats
    if (article.sentiment_stats) {
      const { positive, negative, neutral } = article.sentiment_stats;
      const { min, max } = this.config.sentiment.scoreRange;
      
      // Check score ranges
      [
        { name: 'positive', value: positive },
        { name: 'negative', value: negative },
        { name: 'neutral', value: neutral },
      ].forEach(({ name, value }) => {
        if (value < min || value > max) {
          if (this.logger) {
            console.warn('[ContentProcessing]', {
              timestamp: Date.now(),
              message: `${name} sentiment score ${value} outside valid range [${min}, ${max}]`,
              context: { articleId: article.article_id },
            });
          }
        }
      });
      
      // Check if scores sum to approximately 1.0
      if (this.config.sentiment.requireScoreSum) {
        const sum = positive + negative + neutral;
        if (Math.abs(sum - 1.0) > this.config.sentiment.scoreTolerance) {
          if (this.logger) {
            console.warn('[ContentProcessing]', {
              timestamp: Date.now(),
              message: `Sentiment scores sum to ${sum}, expected approximately 1.0`,
              context: { articleId: article.article_id },
            });
          }
        }
      }
    }
  }
  
  /**
   * Analyze article for duplicates
   */
  private async analyzeDuplicates(article: NewsDataArticle): Promise<DuplicateAnalysis> {
    if (!this.config.duplicates.enabled || this.contentCache.size === 0) {
      return {
        isDuplicate: false,
        confidence: 0,
        algorithm: 'none',
        similarity: 0,
        matchedFields: [],
      };
    }
    
    const algorithms = this.config.duplicates.algorithms;
    let bestMatch: DuplicateAnalysis = {
      isDuplicate: false,
      confidence: 0,
      algorithm: 'none',
      similarity: 0,
      matchedFields: [],
    };
    
    // Try each algorithm
    for (const algorithm of algorithms) {
      let analysis: DuplicateAnalysis;
      
      switch (algorithm) {
        case 'exact':
          analysis = this.exactDuplicateDetection(article);
          break;
        case 'fuzzy':
          analysis = this.fuzzyDuplicateDetection(article);
          break;
        case 'fingerprint':
          analysis = this.fingerprintDuplicateDetection(article);
          break;
        case 'semantic':
          analysis = this.semanticDuplicateDetection(article);
          break;
        default:
          continue;
      }
      
      if (analysis.confidence > bestMatch.confidence) {
        bestMatch = analysis;
      }
    }
    
    return bestMatch;
  }
  
  /**
   * Exact duplicate detection (exact text matches)
   */
  private exactDuplicateDetection(article: NewsDataArticle): DuplicateAnalysis {
    const threshold = this.config.duplicates.thresholds.exact;
    
    for (const [cachedId, cachedContent] of this.contentCache) {
      const titleMatch = article.title === cachedContent.title?.original;
      const descriptionMatch = article.description === cachedContent.description?.original;
      const contentMatch = article.content === cachedContent.content?.original;
      
      const matches = [titleMatch, descriptionMatch, contentMatch].filter(Boolean).length;
      const total = [article.title, article.description, article.content].filter(Boolean).length;
      const similarity = matches / total;
      
      if (similarity >= threshold) {
        return {
          isDuplicate: true,
          confidence: similarity,
          duplicateOf: cachedId,
          algorithm: 'exact',
          similarity,
          matchedFields: this.getMatchedFields(article, cachedContent),
        };
      }
    }
    
    return {
      isDuplicate: false,
      confidence: 0,
      algorithm: 'exact',
      similarity: 0,
      matchedFields: [],
    };
  }
  
  /**
   * Fuzzy duplicate detection (similarity-based)
   */
  private fuzzyDuplicateDetection(article: NewsDataArticle): DuplicateAnalysis {
    const threshold = this.config.duplicates.thresholds.fuzzy;
    let bestMatch: DuplicateAnalysis = {
      isDuplicate: false,
      confidence: 0,
      algorithm: 'fuzzy',
      similarity: 0,
      matchedFields: [],
    };
    
    for (const [cachedId, cachedContent] of this.contentCache) {
      const similarities: number[] = [];
      const matchedFields: string[] = [];
      
      // Compare title
      if (article.title && cachedContent.title) {
        const titleSim = this.calculateStringSimilarity(
          article.title.toLowerCase(),
          cachedContent.title.original.toLowerCase()
        );
        similarities.push(titleSim);
        if (titleSim >= threshold) matchedFields.push('title');
      }
      
      // Compare description
      if (article.description && cachedContent.description) {
        const descSim = this.calculateStringSimilarity(
          article.description.toLowerCase(),
          cachedContent.description.original.toLowerCase()
        );
        similarities.push(descSim);
        if (descSim >= threshold) matchedFields.push('description');
      }
      
      // Compare content
      if (article.content && cachedContent.content) {
        const contentSim = this.calculateStringSimilarity(
          article.content.toLowerCase(),
          cachedContent.content.original.toLowerCase()
        );
        similarities.push(contentSim);
        if (contentSim >= threshold) matchedFields.push('content');
      }
      
      if (similarities.length > 0) {
        const avgSimilarity = similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length;
        
        if (avgSimilarity >= threshold && avgSimilarity > bestMatch.confidence) {
          bestMatch = {
            isDuplicate: true,
            confidence: avgSimilarity,
            duplicateOf: cachedId,
            algorithm: 'fuzzy',
            similarity: avgSimilarity,
            matchedFields,
          };
        }
      }
    }
    
    return bestMatch;
  }
  
  /**
   * Fingerprint-based duplicate detection
   */
  private fingerprintDuplicateDetection(article: NewsDataArticle): DuplicateAnalysis {
    const threshold = this.config.duplicates.thresholds.fingerprint;
    
    // Generate fingerprints for article content
    const titleFingerprint = this.generateFingerprint(article.title.toLowerCase());
    const descFingerprint = article.description 
      ? this.generateFingerprint(article.description.toLowerCase())
      : null;
    const contentFingerprint = article.content 
      ? this.generateFingerprint(article.content.toLowerCase())
      : null;
    
    for (const [cachedId, cachedContent] of this.contentCache) {
      let matches = 0;
      let total = 0;
      const matchedFields: string[] = [];
      
      // Compare title fingerprints
      if (cachedContent.title) {
        total++;
        if (titleFingerprint === cachedContent.title.fingerprint) {
          matches++;
          matchedFields.push('title');
        }
      }
      
      // Compare description fingerprints
      if (descFingerprint && cachedContent.description) {
        total++;
        if (descFingerprint === cachedContent.description.fingerprint) {
          matches++;
          matchedFields.push('description');
        }
      }
      
      // Compare content fingerprints
      if (contentFingerprint && cachedContent.content) {
        total++;
        if (contentFingerprint === cachedContent.content.fingerprint) {
          matches++;
          matchedFields.push('content');
        }
      }
      
      if (total > 0) {
        const similarity = matches / total;
        
        if (similarity >= threshold) {
          return {
            isDuplicate: true,
            confidence: similarity,
            duplicateOf: cachedId,
            algorithm: 'fingerprint',
            similarity,
            matchedFields,
            fingerprint: titleFingerprint,
          };
        }
      }
    }
    
    return {
      isDuplicate: false,
      confidence: 0,
      algorithm: 'fingerprint',
      similarity: 0,
      matchedFields: [],
      fingerprint: titleFingerprint,
    };
  }
  
  /**
   * Semantic duplicate detection (placeholder for future implementation)
   */
  private semanticDuplicateDetection(_article: NewsDataArticle): DuplicateAnalysis {
    // This would require NLP libraries or AI models for semantic similarity
    // For now, return a basic implementation
    return {
      isDuplicate: false,
      confidence: 0,
      algorithm: 'semantic',
      similarity: 0,
      matchedFields: [],
    };
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
   * Get matched fields between article and cached content
   */
  private getMatchedFields(article: NewsDataArticle, cachedContent: any): string[] {
    const matchedFields: string[] = [];
    
    if (article.title === cachedContent.title?.original) {
      matchedFields.push('title');
    }
    
    if (article.description === cachedContent.description?.original) {
      matchedFields.push('description');
    }
    
    if (article.content === cachedContent.content?.original) {
      matchedFields.push('content');
    }
    
    return matchedFields;
  }
  
  /**
   * Cache processed content for duplicate detection
   */
  private cacheProcessedContent(
    articleId: string,
    content: {
      title: ProcessedContent;
      description?: ProcessedContent;
      content?: ProcessedContent;
    }
  ): void {
    this.contentCache.set(articleId, content);
    
    // Update fingerprint index
    if (this.config.duplicates.useContentFingerprints) {
      const fingerprints = [
        content.title.fingerprint,
        content.description?.fingerprint,
        content.content?.fingerprint,
      ].filter(Boolean) as string[];
      
      fingerprints.forEach(fingerprint => {
        if (!this.fingerprintIndex.has(fingerprint)) {
          this.fingerprintIndex.set(fingerprint, []);
        }
        this.fingerprintIndex.get(fingerprint)!.push(articleId);
      });
    }
  }
  
  /**
   * Clear content cache
   */
  clearCache(): void {
    this.contentCache.clear();
    this.fingerprintIndex.clear();
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats(): {
    contentCacheSize: number;
    fingerprintIndexSize: number;
    articles: string[];
  } {
    return {
      contentCacheSize: this.contentCache.size,
      fingerprintIndexSize: this.fingerprintIndex.size,
      articles: Array.from(this.contentCache.keys()),
    };
  }
  
  /**
   * Update configuration
   */
  updateConfig(updates: Partial<ContentProcessingConfig>): void {
    this.config = this.mergeConfig(this.config, updates);
  }
  
  /**
   * Get current configuration
   */
  getConfig(): ContentProcessingConfig {
    return { ...this.config };
  }
}

/**
 * Create a content processor instance
 */
export function createNewsDataContentProcessor(
  config: Partial<ContentProcessingConfig> = {},
  logger?: AdvancedObservabilityLogger
): NewsDataContentProcessor {
  return new NewsDataContentProcessor(config, logger);
}