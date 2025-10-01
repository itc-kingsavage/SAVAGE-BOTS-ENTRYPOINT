/**
 * 🦅 SAVAGE BOTS SCANNER - Utility Helpers System
 * Common utilities, validators, formatters, and helper functions
 * Core utility belt for the entire SAVAGE ecosystem
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;

class SavageHelpers {
    constructor() {
        this.config = {
            validation: {
                phoneNumber: {
                    minLength: 10,
                    maxLength: 15,
                    countryCodes: ['1', '44', '91', '86', '81', '49', '33', '39', '34', '7']
                },
                sessionId: {
                    pattern: /^SAVAGE-XMD-BOT-SESSION-[A-Z0-9]{12}-\d{10}-[A-Z0-9]{12}$/
                },
                password: {
                    minLength: 12,
                    requireUppercase: true,
                    requireLowercase: true,
                    requireNumbers: true,
                    requireSymbols: true
                }
            },
            formatting: {
                timestamp: {
                    display: 'YYYY-MM-DD HH:mm:ss',
                    file: 'YYYY-MM-DD_HH-mm-ss',
                    iso: true
                },
                phone: {
                    international: true,
                    countryCode: '+1'
                }
            },
            security: {
                rateLimit: {
                    windowMs: 900000, // 15 minutes
                    maxRequests: 100
                },
                sanitization: {
                    maxLength: 1000,
                    allowedTags: [],
                    allowedAttributes: {}
                }
            }
        };

        this.cache = new Map();
        this.rateLimits = new Map();
        this.init();
    }

    /**
     * 🎯 Initialize helpers system
     */
    init() {
        console.log('🔧 [HELPERS] Savage Helpers System Initialized');
        console.log('📋 [HELPERS] Validators, formatters, and utilities ready');
        
        this.startCleanupInterval();
    }

    /**
     * 🔍 VALIDATORS - Input validation and sanitization
     */

    /**
     * ✅ Validate phone number format
     */
    validatePhoneNumber(phone) {
        if (!phone || typeof phone !== 'string') return false;

        // Remove all non-digit characters
        const cleanPhone = phone.replace(/\D/g, '');
        
        // Check length
        if (cleanPhone.length < this.config.validation.phoneNumber.minLength || 
            cleanPhone.length > this.config.validation.phoneNumber.maxLength) {
            return false;
        }

        // Check country code (optional)
        const countryCode = cleanPhone.substring(0, 2);
        if (!this.config.validation.phoneNumber.countryCodes.includes(countryCode) &&
            !this.config.validation.phoneNumber.countryCodes.includes(countryCode.substring(0, 1))) {
            console.warn('⚠️ [HELPERS] Unknown country code:', countryCode);
            // Don't fail validation for unknown country codes
        }

        return true;
    }

    /**
     * ✅ Validate session ID format
     */
    validateSessionId(sessionId) {
        if (!sessionId || typeof sessionId !== 'string') return false;
        return this.config.validation.sessionId.pattern.test(sessionId);
    }

    /**
     * ✅ Validate password strength
     */
    validatePassword(password) {
        if (!password || typeof password !== 'string') return false;

        const requirements = this.config.validation.password;
        
        if (password.length < requirements.minLength) return false;
        if (requirements.requireUppercase && !/(?=.*[A-Z])/.test(password)) return false;
        if (requirements.requireLowercase && !/(?=.*[a-z])/.test(password)) return false;
        if (requirements.requireNumbers && !/(?=.*[0-9])/.test(password)) return false;
        if (requirements.requireSymbols && !/(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/.test(password)) return false;

        return true;
    }

    /**
     * ✅ Validate email format
     */
    validateEmail(email) {
        if (!email || typeof email !== 'string') return false;
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email) && email.length <= 254;
    }

    /**
     * ✅ Validate bot name
     */
    validateBotName(botName) {
        if (!botName || typeof botName !== 'string') return false;
        
        const validBots = ['SAVAGE-X', 'DE-UKNOWN-BOT', 'QUEEN RIXIE', 'SCANNER'];
        return validBots.includes(botName.toUpperCase().replace(/-/g, ' '));
    }

    /**
     * ✅ Validate platform name
     */
    validatePlatform(platform) {
        const validPlatforms = ['render', 'heroku', 'local', 'development'];
        return validPlatforms.includes(platform.toLowerCase());
    }

    /**
     * 🎨 FORMATTERS - Data formatting and presentation
     */

    /**
     * 📅 Format timestamp
     */
    formatTimestamp(date = new Date(), format = 'display') {
        const timestamp = date instanceof Date ? date : new Date(date);
        
        if (isNaN(timestamp.getTime())) {
            return 'Invalid Date';
        }

        switch (format) {
            case 'iso':
                return timestamp.toISOString();
                
            case 'file':
                return timestamp.toISOString()
                    .replace(/:/g, '-')
                    .replace(/\..+/, '')
                    .replace('T', '_');
                
            case 'display':
            default:
                return timestamp.toLocaleString('en-US', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                }).replace(',', '');
        }
    }

    /**
     * 📞 Format phone number
     */
    formatPhoneNumber(phone, format = 'international') {
        if (!this.validatePhoneNumber(phone)) return phone;

        const cleanPhone = phone.replace(/\D/g, '');
        
        switch (format) {
            case 'international':
                return `+${cleanPhone}`;
                
            case 'local':
                return cleanPhone.length > 10 ? cleanPhone.substring(cleanPhone.length - 10) : cleanPhone;
                
            case 'pretty':
                if (cleanPhone.length === 10) {
                    return `(${cleanPhone.substring(0, 3)}) ${cleanPhone.substring(3, 6)}-${cleanPhone.substring(6)}`;
                } else if (cleanPhone.length === 11) {
                    return `+${cleanPhone.substring(0, 1)} (${cleanPhone.substring(1, 4)}) ${cleanPhone.substring(4, 7)}-${cleanPhone.substring(7)}`;
                }
                // fallthrough
                
            default:
                return cleanPhone;
        }
    }

    /**
     * 💬 Format message for display
     */
    formatMessage(message, maxLength = 200) {
        if (!message || typeof message !== 'string') return '';
        
        // Trim and limit length
        let formatted = message.trim();
        if (formatted.length > maxLength) {
            formatted = formatted.substring(0, maxLength - 3) + '...';
        }
        
        // Basic sanitization
        formatted = formatted
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/'/g, '&#39;')
            .replace(/"/g, '&#34;');
            
        return formatted;
    }

    /**
     * 📊 Format file size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * ⏱️ Format duration
     */
    formatDuration(ms) {
        if (ms < 1000) return `${ms}ms`;
        
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) return `${days}d ${hours % 24}h`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        
        return `${seconds}s`;
    }

    /**
     * 🔧 UTILITIES - Common utility functions
     */

    /**
     * 🎲 Generate random number in range
     */
    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * 🔄 Deep clone object
     */
    deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (obj instanceof Array) return obj.map(item => this.deepClone(item));
        if (obj instanceof Object) {
            const clonedObj = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    clonedObj[key] = this.deepClone(obj[key]);
                }
            }
            return clonedObj;
        }
    }

    /**
     * 🔍 Get nested property safely
     */
    get(obj, path, defaultValue = null) {
        if (!obj || typeof obj !== 'object') return defaultValue;
        
        const keys = path.split('.');
        let result = obj;
        
        for (const key of keys) {
            if (result && typeof result === 'object' && key in result) {
                result = result[key];
            } else {
                return defaultValue;
            }
        }
        
        return result !== undefined ? result : defaultValue;
    }

    /**
     * ⏰ Sleep/delay function
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 🔄 Retry function with exponential backoff
     */
    async retry(fn, maxAttempts = 3, delay = 1000) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                console.warn(`⚠️ [HELPERS] Attempt ${attempt}/${maxAttempts} failed:`, error.message);
                
                if (attempt < maxAttempts) {
                    const waitTime = delay * Math.pow(2, attempt - 1);
                    console.log(`⏳ [HELPERS] Retrying in ${waitTime}ms...`);
                    await this.sleep(waitTime);
                }
            }
        }
        
        throw lastError;
    }

    /**
     * 📝 Generate unique ID
     */
    generateId(prefix = 'id', length = 8) {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substr(2, length);
        return `${prefix}_${timestamp}_${random}`;
    }

    /**
     * 🛡️ SECURITY - Security-related utilities
     */

    /**
     * 🚦 Rate limiting check
     */
    checkRateLimit(identifier, maxRequests = null, windowMs = null) {
        const now = Date.now();
        const limitKey = `rate_${identifier}`;
        const max = maxRequests || this.config.security.rateLimit.maxRequests;
        const window = windowMs || this.config.security.rateLimit.windowMs;
        
        let limitData = this.rateLimits.get(limitKey);
        
        if (!limitData || now - limitData.startTime > window) {
            limitData = {
                count: 0,
                startTime: now
            };
        }
        
        limitData.count++;
        this.rateLimits.set(limitKey, limitData);
        
        const remaining = Math.max(0, max - limitData.count);
        const resetTime = limitData.startTime + window;
        
        return {
            allowed: limitData.count <= max,
            remaining,
            resetTime,
            current: limitData.count,
            max
        };
    }

    /**
     * 🧼 Sanitize input
     */
    sanitizeInput(input, options = {}) {
        if (input === null || input === undefined) return '';
        
        const sanitized = String(input)
            .substring(0, options.maxLength || this.config.security.sanitization.maxLength)
            .trim();
            
        // Remove potentially dangerous characters
        return sanitized
            .replace(/[<>]/g, '') // Remove < and >
            .replace(/javascript:/gi, '') // Remove javascript: protocol
            .replace(/on\w+=/gi, ''); // Remove event handlers
    }

    /**
     * 🔐 Hash data (non-cryptographic, for caching)
     */
    hashData(data) {
        const dataString = typeof data === 'string' ? data : JSON.stringify(data);
        return crypto.createHash('md5').update(dataString).digest('hex');
    }

    /**
     * 💾 CACHE - Simple in-memory cache
     */

    /**
     * 🗃️ Set cache value
     */
    setCache(key, value, ttl = 300000) { // 5 minutes default
        this.cache.set(key, {
            value,
            expires: Date.now() + ttl,
            created: Date.now()
        });
        
        return true;
    }

    /**
     * 🗃️ Get cache value
     */
    getCache(key) {
        const item = this.cache.get(key);
        
        if (!item) return null;
        
        if (Date.now() > item.expires) {
            this.cache.delete(key);
            return null;
        }
        
        return item.value;
    }

    /**
     * 🗃️ Delete cache value
     */
    deleteCache(key) {
        return this.cache.delete(key);
    }

    /**
     * 🧹 Clean expired cache entries
     */
    cleanExpiredCache() {
        const now = Date.now();
        let cleaned = 0;
        
        for (const [key, item] of this.cache.entries()) {
            if (now > item.expires) {
                this.cache.delete(key);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(`🧹 [HELPERS] Cleaned ${cleaned} expired cache entries`);
        }
        
        return cleaned;
    }

    /**
     * 📊 LOGGING - Enhanced logging utilities
     */

    /**
     * 📝 Log with timestamp and level
     */
    log(level, message, data = null) {
        const timestamp = this.formatTimestamp(new Date(), 'display');
        const levelEmoji = {
            info: 'ℹ️',
            warn: '⚠️',
            error: '❌',
            success: '✅',
            debug: '🐛'
        }[level] || '📝';
        
        const logMessage = `${levelEmoji} [${timestamp}] ${message}`;
        
        switch (level) {
            case 'error':
                console.error(logMessage, data || '');
                break;
            case 'warn':
                console.warn(logMessage, data || '');
                break;
            case 'debug':
                if (process.env.NODE_ENV === 'development') {
                    console.debug(logMessage, data || '');
                }
                break;
            default:
                console.log(logMessage, data || '');
        }
        
        // Return formatted message for potential storage
        return {
            level,
            timestamp,
            message,
            data,
            formatted: logMessage
        };
    }

    /**
     * ✅ Success log
     */
    success(message, data = null) {
        return this.log('success', message, data);
    }

    /**
     * ℹ️ Info log
     */
    info(message, data = null) {
        return this.log('info', message, data);
    }

    /**
     * ⚠️ Warning log
     */
    warn(message, data = null) {
        return this.log('warn', message, data);
    }

    /**
     * ❌ Error log
     */
    error(message, data = null) {
        return this.log('error', message, data);
    }

    /**
     * 🐛 Debug log
     */
    debug(message, data = null) {
        return this.log('debug', message, data);
    }

    /**
     * 🧹 MAINTENANCE - System maintenance utilities
     */

    /**
     * ⏰ Start cleanup interval
     */
    startCleanupInterval() {
        // Clean cache every minute
        setInterval(() => {
            this.cleanExpiredCache();
            this.cleanExpiredRateLimits();
        }, 60000);

        console.log('⏰ [HELPERS] Cleanup interval started (every minute)');
    }

    /**
     * 🧹 Clean expired rate limits
     */
    cleanExpiredRateLimits() {
        const now = Date.now();
        const windowMs = this.config.security.rateLimit.windowMs;
        let cleaned = 0;
        
        for (const [key, data] of this.rateLimits.entries()) {
            if (now - data.startTime > windowMs) {
                this.rateLimits.delete(key);
                cleaned++;
            }
        }
        
        return cleaned;
    }

    /**
     * 📊 Get system statistics
     */
    getStats() {
        return {
            cache: {
                size: this.cache.size,
                keys: Array.from(this.cache.keys())
            },
            rateLimits: {
                size: this.rateLimits.size,
                active: Array.from(this.rateLimits.entries()).length
            },
            memory: {
                used: process.memoryUsage().heapUsed,
                total: process.memoryUsage().heapTotal
            },
            uptime: process.uptime(),
            timestamp: new Date()
        };
    }

    /**
     * 🏥 Health check
     */
    healthCheck() {
        try {
            // Test validators
            const testPhone = this.validatePhoneNumber('+1234567890');
            const testSessionId = this.validateSessionId('SAVAGE-XMD-BOT-SESSION-ABC123DEF456-1234567890-GHI789JKL012');
            const testPassword = this.validatePassword('SecurePass123!');
            
            // Test formatters
            const testTimestamp = this.formatTimestamp(new Date());
            const testDuration = this.formatDuration(3661000); // 1 hour 1 minute 1 second
            
            // Test utilities
            const testClone = this.deepClone({ test: 'data' });
            const testGet = this.get({ a: { b: { c: 'value' } } }, 'a.b.c');
            
            const allTestsPassed = testPhone && testSessionId && testTimestamp && 
                                 testDuration && testClone && testGet === 'value';

            return {
                status: allTestsPassed ? 'healthy' : 'unhealthy',
                tests: {
                    validators: { phone: testPhone, sessionId: testSessionId, password: testPassword },
                    formatters: { timestamp: !!testTimestamp, duration: !!testDuration },
                    utilities: { deepClone: !!testClone, nestedGet: testGet === 'value' }
                },
                stats: this.getStats(),
                timestamp: new Date()
            };

        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date()
            };
        }
    }
}

// Create and export singleton instance
const savageHelpers = new SavageHelpers();

module.exports = savageHelpers;

// 🚀 Quick utility functions
module.exports.validatePhoneNumber = (phone) => savageHelpers.validatePhoneNumber(phone);
module.exports.validateSessionId = (sessionId) => savageHelpers.validateSessionId(sessionId);
module.exports.formatTimestamp = (date, format) => savageHelpers.formatTimestamp(date, format);
module.exports.formatDuration = (ms) => savageHelpers.formatDuration(ms);
module.exports.deepClone = (obj) => savageHelpers.deepClone(obj);
module.exports.get = (obj, path, defaultValue) => savageHelpers.get(obj, path, defaultValue);
module.exports.sleep = (ms) => savageHelpers.sleep(ms);
module.exports.retry = (fn, maxAttempts, delay) => savageHelpers.retry(fn, maxAttempts, delay);
module.exports.log = (level, message, data) => savageHelpers.log(level, message, data);

// 📝 Example usage
if (require.main === module) {
    // Test the helpers system
    const test = async () => {
        try {
            console.log('🧪 Testing Savage Helpers System...\n');

            // Test validators
            console.log('✅ Testing Validators...');
            console.log('Phone Valid:', savageHelpers.validatePhoneNumber('+1234567890'));
            console.log('Session ID Valid:', savageHelpers.validateSessionId('SAVAGE-XMD-BOT-SESSION-ABC123DEF456-1234567890-GHI789JKL012'));
            console.log('Password Valid:', savageHelpers.validatePassword('SecurePass123!'), '\n');

            // Test formatters
            console.log('🎨 Testing Formatters...');
            console.log('Timestamp:', savageHelpers.formatTimestamp(new Date()));
            console.log('Phone Formatted:', savageHelpers.formatPhoneNumber('1234567890', 'pretty'));
            console.log('Duration:', savageHelpers.formatDuration(3661000), '\n');

            // Test utilities
            console.log('🔧 Testing Utilities...');
            const original = { a: 1, b: { c: 2 } };
            const cloned = savageHelpers.deepClone(original);
            console.log('Deep Clone:', JSON.stringify(original) === JSON.stringify(cloned));
            console.log('Nested Get:', savageHelpers.get({ a: { b: { c: 'value' } } }, 'a.b.c'));
            console.log('Random Int:', savageHelpers.randomInt(1, 100), '\n');

            // Test security
            console.log('🛡️ Testing Security...');
            const rateLimit = savageHelpers.checkRateLimit('test_user');
            console.log('Rate Limit:', rateLimit);
            console.log('Sanitized Input:', savageHelpers.sanitizeInput('<script>alert("xss")</script>'), '\n');

            // Test caching
            console.log('💾 Testing Cache...');
            savageHelpers.setCache('test_key', 'test_value', 5000);
            console.log('Cache Get:', savageHelpers.getCache('test_key'));
            console.log('Cache Miss:', savageHelpers.getCache('nonexistent'), '\n');

            // Test logging
            console.log('📝 Testing Logging...');
            savageHelpers.success('Test success message');
            savageHelpers.info('Test info message');
            savageHelpers.warn('Test warning message');
            savageHelpers.error('Test error message', { details: 'some error details' });
            console.log('');

            // Test health check
            console.log('🏥 Testing Health Check...');
            const health = savageHelpers.healthCheck();
            console.log('Health Status:', health.status);
            console.log('Tests Passed:', Object.values(health.tests).flatMap(t => Object.values(t)).filter(Boolean).length, '/ 7');

        } catch (error) {
            console.error('❌ Test failed:', error);
        }
    };
    
    test();
}
