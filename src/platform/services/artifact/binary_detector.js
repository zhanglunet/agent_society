import { createNoopModuleLogger } from "../../utils/logger/logger.js";
import { createHash } from "crypto";
import { fileTypeFromBuffer } from "file-type";

/**
 * MIME type classification maps for binary detection
 */
const MIME_CLASSIFICATIONS = {
  // Definitive binary types - patterns that start with these prefixes
  BINARY_PREFIXES: new Set([
    'image/',
    'video/', 
    'audio/',
    'font/'
  ]),
  
  // Definitive binary types - exact matches
  BINARY_TYPES: new Set([
    'application/pdf',
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    'application/x-tar',
    'application/gzip',
    'application/x-bzip2',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]),
  
  // Definitive text types - patterns that start with these prefixes
  TEXT_PREFIXES: new Set([
    'text/'
  ]),
  
  // Definitive text types - exact matches
  TEXT_TYPES: new Set([
    'application/json',
    'application/xml',
    'application/javascript',
    'application/typescript',
    'application/x-javascript',
    'application/x-typescript',
    'text/javascript',
    'text/typescript',
    'application/x-yaml',
    'text/yaml',
    'text/x-yaml',
    'application/yaml'
  ]),
  
  // Ambiguous types requiring content analysis
  AMBIGUOUS_TYPES: new Set([
    'application/octet-stream',
    'application/unknown',
    'application/x-unknown',
    ''
  ])
};

/**
 * Enhanced extension classification maps for binary detection
 */
const EXTENSION_CLASSIFICATIONS = {
  BINARY_EXTENSIONS: new Set([
    // Images
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif', '.ico', '.svg',
    '.tiff', '.tif', '.raw', '.cr2', '.nef', '.arw', '.dng', '.heic', '.heif',
    
    // Documents
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.odt', '.ods', '.odp', '.rtf', '.pages', '.numbers', '.key',
    
    // Archives
    '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.lz4',
    '.cab', '.iso', '.dmg', '.pkg', '.deb', '.rpm', '.msi',
    
    // Media
    '.mp3', '.mp4', '.wav', '.avi', '.mov', '.webm', '.mkv',
    '.flac', '.ogg', '.m4a', '.aac', '.wma', '.wmv', '.flv',
    '.m4v', '.3gp', '.3g2', '.asf', '.rm', '.rmvb',
    
    // Executables
    '.exe', '.dll', '.so', '.dylib', '.app', '.bin', '.run',
    '.com', '.scr', '.msi', '.dmg', '.pkg', '.deb', '.rpm',
    
    // Fonts
    '.woff', '.woff2', '.ttf', '.otf', '.eot', '.pfb', '.pfm',
    
    // Database files
    '.db', '.sqlite', '.sqlite3', '.mdb', '.accdb', '.dbf',
    
    // Other binary formats
    '.dat', '.cache', '.tmp', '.swp', '.bak', '.class', '.pyc',
    '.o', '.obj', '.lib', '.a', '.jar', '.war', '.ear'
  ]),
  
  TEXT_EXTENSIONS: new Set([
    // Code files
    '.js', '.mjs', '.ts', '.tsx', '.jsx', '.py', '.java', '.c', '.cpp',
    '.h', '.hpp', '.cs', '.php', '.rb', '.go', '.rs', '.swift',
    '.kt', '.scala', '.clj', '.hs', '.ml', '.fs', '.vb', '.pl',
    '.lua', '.r', '.m', '.mm', '.f', '.f90', '.pas', '.ada',
    
    // Markup and data
    '.html', '.htm', '.xml', '.json', '.yaml', '.yml', '.toml',
    '.csv', '.tsv', '.ini', '.cfg', '.conf', '.properties',
    
    // Documentation
    '.md', '.txt', '.rst', '.adoc', '.tex', '.latex', '.org',
    '.wiki', '.textile', '.creole',
    
    // Scripts and config
    '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
    '.dockerfile', '.makefile', '.gitignore', '.gitattributes',
    '.editorconfig', '.eslintrc', '.prettierrc', '.babelrc',
    
    // Web assets
    '.css', '.scss', '.sass', '.less', '.styl', '.stylus',
    
    // Logs and data
    '.log', '.out', '.err', '.trace', '.debug', '.info',
    
    // Configuration files
    '.env', '.envrc', '.profile', '.bashrc', '.zshrc', '.vimrc',
    '.tmux', '.screenrc', '.inputrc', '.xinitrc', '.xsession',
    
    // License and documentation
    '.license', '.licence', '.copyright', '.authors', '.contributors',
    '.changelog', '.changes', '.news', '.readme', '.todo',
    
    // Version control
    '.patch', '.diff', '.rej'
  ])
};
export class BinaryDetector {
  /**
   * @param {Object} options - Configuration options
   * @param {Object} [options.logger] - Logger instance
   * @param {number} [options.maxCacheSize=1000] - Maximum cache size
   * @param {number} [options.timeoutMs=10000] - Detection timeout in milliseconds
   */
  constructor(options = {}) {
    this.log = options.logger ?? createNoopModuleLogger();
    this.cache = new Map(); // Simple in-memory cache for detection results
    this.maxCacheSize = options.maxCacheSize || 1000;
    this.timeoutMs = options.timeoutMs || 10000;
    this.stats = {
      totalDetections: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageDetectionTime: 0,
      timeouts: 0
    };
  }

  /**
   * Determines if content is binary using multi-layered detection
   * @param {Buffer} buffer - File content buffer
   * @param {Object} options - Detection options
   * @param {string} [options.mimeType] - MIME type if available
   * @param {string} [options.filename] - Original filename
   * @param {string} [options.extension] - File extension
   * @returns {Promise<DetectionResult>}
   */
  async detectBinary(buffer, options = {}) {
    const startTime = Date.now();
    this.stats.totalDetections++;
    
    try {
      // Add timeout protection
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          this.stats.timeouts++;
          reject(new Error(`Detection timeout after ${this.timeoutMs}ms`));
        }, this.timeoutMs);
      });

      const detectionPromise = this._performDetection(buffer, options, startTime);
      
      // Race between detection and timeout
      const result = await Promise.race([detectionPromise, timeoutPromise]);
      
      // Update average detection time
      const detectionTime = Date.now() - startTime;
      this.stats.averageDetectionTime = 
        (this.stats.averageDetectionTime * (this.stats.totalDetections - 1) + detectionTime) / 
        this.stats.totalDetections;

      return result;

    } catch (error) {
      const detectionTime = Date.now() - startTime;
      
      void this.log.error("Binary detection failed, defaulting to binary", {
        error: error.message,
        timeMs: detectionTime,
        mimeType: options.mimeType || null,
        filename: options.filename || null
      });

      // Safe default on error
      return {
        isBinary: true,
        method: 'error-default',
        confidence: 0.3,
        metadata: {
          reason: `Detection failed: ${error.message}`,
          error: error.message,
          detectionTimeMs: detectionTime,
          originalMimeType: options.mimeType !== undefined ? options.mimeType : null
        }
      };
    }
  }

  /**
   * Internal method to perform the actual detection logic
   * @param {Buffer} buffer - File content buffer
   * @param {Object} options - Detection options
   * @param {number} startTime - Start time for performance tracking
   * @returns {Promise<DetectionResult>}
   * @private
   */
  async _performDetection(buffer, options, startTime) {
    // Generate cache key based on buffer content and options
    const cacheKey = this._generateCacheKey(buffer, options);
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      this.stats.cacheHits++;
      const cached = this.cache.get(cacheKey);
      void this.log.debug("Binary detection cache hit", { 
        cacheKey: cacheKey.substring(0, 16) + "...",
        result: cached.isBinary,
        method: cached.method
      });
      return cached;
    }

    this.stats.cacheMisses++;

    let result;
    
    // Step 1: MIME type analysis (primary)
    if (options.mimeType) {
      const mimeResult = this.analyzeMimeType(options.mimeType);
      if (mimeResult.classification !== 'ambiguous') {
        result = {
          isBinary: mimeResult.classification === 'binary',
          method: 'mime-type',
          confidence: mimeResult.confidence,
          detectedMimeType: options.mimeType,
          metadata: {
            reason: mimeResult.reason,
            originalMimeType: options.mimeType
          }
        };
      }
    }

    // Step 2: Content analysis (secondary) - if MIME type was ambiguous or unavailable
    if (!result) {
      const contentResult = await this.analyzeContent(buffer);
      if (contentResult.classification !== 'ambiguous') {
        result = {
          isBinary: contentResult.classification === 'binary',
          method: 'content-analysis',
          confidence: contentResult.confidence,
          metadata: {
            reason: contentResult.reason,
            originalMimeType: options.mimeType !== undefined ? options.mimeType : null
          }
        };
      }
    }

    // Step 3: Extension analysis (fallback)
    if (!result && (options.extension || options.filename)) {
      const extension = options.extension || this._extractExtension(options.filename);
      if (extension) {
        const extResult = this.analyzeExtension(extension);
        if (extResult.classification !== 'ambiguous') {
          result = {
            isBinary: extResult.classification === 'binary',
            method: 'extension',
            confidence: extResult.confidence,
            metadata: {
              reason: extResult.reason,
              extension: extension,
              originalMimeType: options.mimeType !== undefined ? options.mimeType : null
            }
          };
        }
      }
    }

    // Step 4: Safe default (final)
    if (!result) {
      result = {
        isBinary: true, // Default to binary for safety
        method: 'default',
        confidence: 0.5,
        metadata: {
          reason: 'Unknown file type, defaulting to binary for safety',
          originalMimeType: options.mimeType !== undefined ? options.mimeType : null
        }
      };
    }

    // Add timing information
    const detectionTime = Date.now() - startTime;
    result.metadata.detectionTimeMs = detectionTime;

    // Cache the result with size limit
    this._setCacheWithLimit(cacheKey, result);

    // Log the detection
    void this.log.debug("Binary detection completed", {
      isBinary: result.isBinary,
      method: result.method,
      confidence: result.confidence,
      timeMs: detectionTime,
      mimeType: options.mimeType || null,
      filename: options.filename || null
    });

    return result;
  }

  /**
   * Analyzes MIME type for binary classification
   * @param {string} mimeType - MIME type to analyze
   * @returns {BinaryClassification}
   */
  analyzeMimeType(mimeType) {
    if (!mimeType || typeof mimeType !== 'string') {
      return {
        classification: 'ambiguous',
        confidence: 0,
        reason: 'No MIME type provided'
      };
    }

    const normalizedMime = mimeType.toLowerCase().trim();

    // Check for ambiguous types first
    if (MIME_CLASSIFICATIONS.AMBIGUOUS_TYPES.has(normalizedMime)) {
      return {
        classification: 'ambiguous',
        confidence: 0.2,
        reason: `Ambiguous MIME type: ${mimeType}`
      };
    }

    // Check binary prefixes
    for (const prefix of MIME_CLASSIFICATIONS.BINARY_PREFIXES) {
      if (normalizedMime.startsWith(prefix)) {
        return {
          classification: 'binary',
          confidence: 0.9,
          reason: `Binary MIME type prefix: ${prefix}`
        };
      }
    }

    // Check exact binary types
    if (MIME_CLASSIFICATIONS.BINARY_TYPES.has(normalizedMime)) {
      return {
        classification: 'binary',
        confidence: 0.95,
        reason: `Known binary MIME type: ${mimeType}`
      };
    }

    // Check text prefixes
    for (const prefix of MIME_CLASSIFICATIONS.TEXT_PREFIXES) {
      if (normalizedMime.startsWith(prefix)) {
        return {
          classification: 'text',
          confidence: 0.9,
          reason: `Text MIME type prefix: ${prefix}`
        };
      }
    }

    // Check exact text types
    if (MIME_CLASSIFICATIONS.TEXT_TYPES.has(normalizedMime)) {
      return {
        classification: 'text',
        confidence: 0.95,
        reason: `Known text MIME type: ${mimeType}`
      };
    }

    // Unknown MIME type
    return {
      classification: 'ambiguous',
      confidence: 0.3,
      reason: `Unknown MIME type: ${mimeType}`
    };
  }

  /**
   * Performs content-based binary detection
   * @param {Buffer} buffer - Content to analyze
   * @returns {Promise<BinaryClassification>}
   */
  async analyzeContent(buffer) {
    if (!buffer || buffer.length === 0) {
      return {
        classification: 'ambiguous',
        confidence: 0.1,
        reason: 'Empty or null buffer'
      };
    }

    try {
      // Step 1: Try magic byte detection using file-type library
      try {
        const fileType = await fileTypeFromBuffer(buffer);
        if (fileType) {
          // file-type library detected a known binary format
          return {
            classification: 'binary',
            confidence: 0.95,
            reason: `Magic bytes detected: ${fileType.ext} (${fileType.mime})`
          };
        }
      } catch (error) {
        // file-type detection failed, continue with other methods
        void this.log.debug("Magic byte detection failed", { error: error.message });
      }

      // Step 2: Check for null bytes (strong indicator of binary content)
      const hasNullBytes = buffer.indexOf(0) !== -1;
      if (hasNullBytes) {
        return {
          classification: 'binary',
          confidence: 0.95,
          reason: 'Contains null bytes'
        };
      }

      // Step 3: Sample the first part of the file for analysis (performance optimization)
      const sampleSize = Math.min(buffer.length, 8192); // 8KB sample
      const sample = buffer.subarray(0, sampleSize);

      // Step 4: Count non-printable characters
      let nonPrintableCount = 0;
      let totalChars = sample.length;

      for (let i = 0; i < sample.length; i++) {
        const byte = sample[i];
        // Consider bytes outside printable ASCII range (except common whitespace)
        if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
          nonPrintableCount++;
        } else if (byte > 126) {
          // High bytes might be valid UTF-8, so we're more lenient
          nonPrintableCount += 0.5;
        }
      }

      const nonPrintableRatio = nonPrintableCount / totalChars;

      // Step 5: If more than 30% non-printable characters, likely binary
      if (nonPrintableRatio > 0.3) {
        return {
          classification: 'binary',
          confidence: Math.min(0.9, 0.5 + nonPrintableRatio),
          reason: `High non-printable character ratio: ${(nonPrintableRatio * 100).toFixed(1)}%`
        };
      }

      // Step 6: Try to validate as UTF-8
      try {
        const text = sample.toString('utf8');
        // If we can decode it as UTF-8 and it doesn't contain replacement characters
        if (!text.includes('\uFFFD')) {
          // Additional check: ensure it's mostly printable characters
          const printableChars = text.match(/[\x20-\x7E\t\n\r]/g);
          const printableRatio = printableChars ? printableChars.length / text.length : 0;
          
          if (printableRatio > 0.7) {
            return {
              classification: 'text',
              confidence: Math.max(0.7, printableRatio),
              reason: `Valid UTF-8 text content (${(printableRatio * 100).toFixed(1)}% printable)`
            };
          }
        }
      } catch (error) {
        // UTF-8 decoding failed
        void this.log.debug("UTF-8 validation failed", { error: error.message });
      }

      // Step 7: Check for common text patterns
      const textPatterns = [
        /^[\x20-\x7E\t\n\r]+$/, // Pure ASCII
        /^[\x00-\xFF]*$/,       // Extended ASCII
      ];

      for (const pattern of textPatterns) {
        if (pattern.test(sample.toString('binary'))) {
          const asciiRatio = (sample.toString('binary').match(/[\x20-\x7E\t\n\r]/g) || []).length / sample.length;
          if (asciiRatio > 0.8) {
            return {
              classification: 'text',
              confidence: 0.8,
              reason: `High ASCII character ratio: ${(asciiRatio * 100).toFixed(1)}%`
            };
          }
        }
      }

      // Step 8: If we have some non-printable characters but not too many, it's ambiguous
      if (nonPrintableRatio > 0.1) {
        return {
          classification: 'ambiguous',
          confidence: 0.4,
          reason: `Moderate non-printable character ratio: ${(nonPrintableRatio * 100).toFixed(1)}%`
        };
      }

      // Step 9: Mostly printable characters, likely text
      return {
        classification: 'text',
        confidence: 0.8,
        reason: 'Mostly printable ASCII characters'
      };

    } catch (error) {
      void this.log.error("Content analysis failed", { error: error.message });
      return {
        classification: 'ambiguous',
        confidence: 0.2,
        reason: `Content analysis failed: ${error.message}`
      };
    }
  }

  /**
   * Enhanced extension-based detection
   * @param {string} extension - File extension
   * @returns {BinaryClassification}
   */
  analyzeExtension(extension) {
    if (!extension || typeof extension !== 'string') {
      return {
        classification: 'ambiguous',
        confidence: 0.1,
        reason: 'No extension provided'
      };
    }

    const normalizedExt = extension.toLowerCase().trim();
    
    // Ensure extension starts with a dot
    const ext = normalizedExt.startsWith('.') ? normalizedExt : '.' + normalizedExt;

    // Check binary extensions
    if (EXTENSION_CLASSIFICATIONS.BINARY_EXTENSIONS.has(ext)) {
      return {
        classification: 'binary',
        confidence: 0.85,
        reason: `Known binary extension: ${ext}`
      };
    }

    // Check text extensions
    if (EXTENSION_CLASSIFICATIONS.TEXT_EXTENSIONS.has(ext)) {
      return {
        classification: 'text',
        confidence: 0.85,
        reason: `Known text extension: ${ext}`
      };
    }

    // Unknown extension - default to ambiguous (will trigger safe binary default)
    return {
      classification: 'ambiguous',
      confidence: 0.3,
      reason: `Unknown extension: ${ext}`
    };
  }

  /**
   * Generates a cache key for detection results
   * @param {Buffer} buffer - File content buffer
   * @param {Object} options - Detection options
   * @returns {string} Cache key
   * @private
   */
  _generateCacheKey(buffer, options) {
    // Create a simple hash of the buffer content and options
    const hash = createHash('sha256');
    hash.update(buffer);
    hash.update(JSON.stringify({
      mimeType: options.mimeType || '',
      extension: options.extension || '',
      filename: options.filename || ''
    }));
    return hash.digest('hex');
  }

  /**
   * Extracts file extension from filename
   * @param {string} filename - Filename to extract extension from
   * @returns {string|null} File extension with dot, or null if none
   * @private
   */
  _extractExtension(filename) {
    if (!filename || typeof filename !== 'string') {
      return null;
    }
    
    const lastDot = filename.lastIndexOf('.');
    if (lastDot > 0 && lastDot < filename.length - 1) {
      return filename.substring(lastDot).toLowerCase();
    }
    
    return null;
  }

  /**
   * Sets cache with size limit using LRU eviction
   * @param {string} key - Cache key
   * @param {any} value - Cache value
   * @private
   */
  _setCacheWithLimit(key, value) {
    // If cache is at max size, remove oldest entry (LRU)
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      void this.log.debug("Cache evicted oldest entry", { evictedKey: firstKey.substring(0, 16) + "..." });
    }
    
    this.cache.set(key, value);
  }

  /**
   * Clears the detection cache
   */
  clearCache() {
    this.cache.clear();
    void this.log.debug("Binary detection cache cleared");
  }

  /**
   * Gets cache and performance statistics
   * @returns {Object} Cache and performance statistics
   */
  getCacheStats() {
    return {
      cacheSize: this.cache.size,
      maxCacheSize: this.maxCacheSize,
      totalDetections: this.stats.totalDetections,
      cacheHits: this.stats.cacheHits,
      cacheMisses: this.stats.cacheMisses,
      cacheHitRate: this.stats.totalDetections > 0 ? 
        (this.stats.cacheHits / this.stats.totalDetections * 100).toFixed(2) + '%' : '0%',
      averageDetectionTime: Math.round(this.stats.averageDetectionTime * 100) / 100,
      timeouts: this.stats.timeouts
    };
  }

  /**
   * Resets performance statistics
   */
  resetStats() {
    this.stats = {
      totalDetections: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageDetectionTime: 0,
      timeouts: 0
    };
    void this.log.debug("Performance statistics reset");
  }
}

/**
 * @typedef {Object} DetectionResult
 * @property {boolean} isBinary - Whether content is binary
 * @property {string} method - Detection method used ('mime-type', 'content-analysis', 'extension', 'default', 'error-default')
 * @property {number} confidence - Confidence level (0-1)
 * @property {string} [detectedMimeType] - MIME type detected from content
 * @property {Object} metadata - Additional detection metadata
 */

/**
 * @typedef {Object} BinaryClassification
 * @property {'binary'|'text'|'ambiguous'} classification - Classification result
 * @property {number} confidence - Confidence level (0-1)
 * @property {string} reason - Reason for classification
 */
