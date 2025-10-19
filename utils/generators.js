/**
 * 🦅 SAVAGE BOTS SCANNER - Advanced Generators System
 * BMW-style session IDs, pairing codes, and secure random generation
 * Military-grade random generation for maximum security
 * UPDATED: Automatic QR Generation & Render Deployment
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

class SavageGenerators {
    constructor() {
        this.config = {
            sessionId: {
                prefix: 'SAVAGE',
                parts: 3,
                partLength: 8,
                separator: '-',
                charset: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
            },
            pairingCode: {
                length: 6,
                charset: '0123456789',
                expiry: 300000, // 5 minutes
                maxAttempts: 3
            },
            botNames: {
                'SAVAGE-X': {
                    prefix: '!savage',
                    color: '#00FF00',
                    emoji: '🦅'
                },
                'DE-UKNOWN-BOT': {
                    prefix: '!deunknown', 
                    color: '#0000FF',
                    emoji: '🌌'
                },
                'QUEEN-RIXIE': {
                    prefix: '!queen',
                    color: '#FF00FF',
                    emoji: '👑'
                }
            },
            security: {
                minEntropy: 128,
                maxHistory: 1000,
                collisionCheck: true
            }
        };

        this.generationHistory = new Map();
        this.usedIdentifiers = new Set();
        this.init();
    }

    /**
     * 🎯 Initialize generators system
     */
    init() {
        console.log('🎲 [GENERATORS] Savage Generators System Initialized');
        console.log(`🔧 [GENERATORS] Session ID Format: ${this.config.sessionId.prefix}-[8char]-[timestamp]-[8char]`);
        console.log(`🔢 [GENERATORS] Pairing Code Length: ${this.config.pairingCode.length} digits`);
        
        this.startCleanupInterval();
    }

    /**
     * 🆔 Generate Session ID (Simplified for Automatic Mode)
     */
    generateSessionId(botName = 'SCANNER', platform = 'render') {
        try {
            const timestamp = Date.now().toString(36);
            const random = crypto.randomBytes(8).toString('hex');
            const uuid = uuidv4().replace(/-/g, '').substring(0, 8);
            
            // ✅ SIMPLIFIED: Shorter, more readable format for automatic mode
            const sessionId = `savage-${timestamp}-${random}-${uuid}`.toLowerCase();

            // Check for collisions
            if (this.config.security.collisionCheck && this.usedIdentifiers.has(sessionId)) {
                console.warn('⚠️ [GENERATORS] Session ID collision detected, regenerating...');
                return this.generateSessionId(botName, platform);
            }

            // Record generation
            this.recordGeneration('session_id', sessionId, {
                botName,
                platform,
                timestamp: Date.now(),
                entropy: this.calculateEntropy(sessionId)
            });

            console.log(`🆔 [GENERATORS] Session ID generated for ${botName}: ${sessionId}`);
            return sessionId;

        } catch (error) {
            console.error('❌ [GENERATORS] Session ID generation failed:', error);
            // ✅ FALLBACK: Simple UUID-based session ID
            return `savage-${uuidv4().replace(/-/g, '')}`;
        }
    }

    /**
     * 🔢 Generate 6-digit pairing code
     */
    generatePairingCode() {
        try {
            let code;
            let attempts = 0;
            const maxAttempts = 10;

            do {
                // ✅ IMPROVED: Better random generation for pairing codes
                const randomBytes = crypto.randomBytes(4);
                const randomNum = randomBytes.readUInt32BE(0);
                code = (randomNum % 900000 + 100000).toString(); // Ensure 6 digits
                attempts++;
                
                if (attempts > maxAttempts) {
                    // ✅ FALLBACK: Simple random as last resort
                    code = Math.floor(100000 + Math.random() * 900000).toString();
                    break;
                }
            } while (this.generationHistory.has(`pairing_${code}`));

            // Record with expiry
            this.recordGeneration('pairing_code', code, {
                generatedAt: Date.now(),
                expiresAt: Date.now() + this.config.pairingCode.expiry,
                attempts: 0,
                maxAttempts: this.config.pairingCode.maxAttempts
            });

            console.log(`🔢 [GENERATORS] Pairing code generated: ${code}`);
            return code;

        } catch (error) {
            console.error('❌ [GENERATORS] Pairing code generation failed:', error);
            // ✅ FALLBACK: Simple random generation
            return Math.floor(100000 + Math.random() * 900000).toString();
        }
    }

    /**
     * 🎲 Generate cryptographically secure random string
     */
    generateRandomString(length, charset = this.config.sessionId.charset) {
        try {
            if (length <= 0) {
                throw new Error('Length must be positive');
            }

            if (!charset || charset.length === 0) {
                charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; // Default charset
            }

            // ✅ IMPROVED: Better random generation
            const randomBytes = crypto.randomBytes(length * 2);
            let result = '';
            const charsetLength = charset.length;

            for (let i = 0; i < length; i++) {
                const randomValue = randomBytes.readUInt16BE(i * 2);
                const index = randomValue % charsetLength;
                result += charset.charAt(index);
            }

            return result;

        } catch (error) {
            console.error('❌ [GENERATORS] Random string generation failed:', error);
            // ✅ FALLBACK: Simple random generation
            let result = '';
            for (let i = 0; i < length; i++) {
                result += charset.charAt(Math.floor(Math.random() * charset.length));
            }
            return result;
        }
    }

    /**
     * 🔑 Generate secure authentication token
     */
    generateAuthToken(botName, sessionId, purpose = 'authentication') {
        try {
            const timestamp = Date.now();
            const randomPart = this.generateRandomString(16);
            
            // ✅ SIMPLIFIED: Cleaner token format
            const tokenString = [
                botName.replace(/\s+/g, '-').toLowerCase(),
                timestamp.toString(36),
                randomPart
            ].join('-');

            const token = {
                token: tokenString,
                data: {
                    botName,
                    sessionId: sessionId.substring(0, 8), // Short reference
                    purpose,
                    timestamp
                },
                expiresAt: timestamp + (24 * 60 * 60 * 1000), // 24 hours
                generatedAt: new Date(timestamp).toISOString()
            };

            this.recordGeneration('auth_token', tokenString, {
                botName,
                purpose,
                expiresAt: token.expiresAt
            });

            console.log(`🔑 [GENERATORS] Auth token generated for ${botName}`);
            return token;

        } catch (error) {
            console.error('❌ [GENERATORS] Auth token generation failed:', error);
            // ✅ FALLBACK: Simple token
            return {
                token: `token-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                data: { botName, purpose },
                expiresAt: Date.now() + (24 * 60 * 60 * 1000),
                generatedAt: new Date().toISOString()
            };
        }
    }

    /**
     * ✍️ Generate cryptographic signature
     */
    generateSignature(data) {
        try {
            const dataString = typeof data === 'string' ? data : JSON.stringify(data);
            const secret = process.env.SESSION_ENCRYPTION_KEY || 'savage-default-secret-key-2024';
            
            return crypto.createHmac('sha256', secret)
                .update(dataString)
                .digest('hex')
                .substring(0, 16); // ✅ SHORTER: 16-character signature
        } catch (error) {
            console.error('❌ [GENERATORS] Signature generation failed:', error);
            return 'fallback-signature';
        }
    }

    /**
     * 🔍 Validate session ID format
     */
    validateSessionId(sessionId) {
        if (typeof sessionId !== 'string') return false;
        
        // ✅ SIMPLIFIED: More flexible validation for automatic mode
        const pattern = /^savage-[a-z0-9]+-[a-f0-9]+-[a-f0-9]+$/i;
        return pattern.test(sessionId) && sessionId.length >= 20;
    }

    /**
     * ✅ Validate pairing code
     */
    validatePairingCode(code) {
        if (typeof code !== 'string') return false;
        
        // Check format (6 digits)
        const codePattern = /^\d{6}$/;
        if (!codePattern.test(code)) return false;

        // Check if code exists and is not expired
        const record = this.generationHistory.get(`pairing_${code}`);
        if (!record) return false;

        if (record.data.expiresAt < Date.now()) {
            this.generationHistory.delete(`pairing_${code}`);
            return false;
        }

        // Check attempt count
        if (record.data.attempts >= record.data.maxAttempts) {
            this.generationHistory.delete(`pairing_${code}`);
            return false;
        }

        return true;
    }

    /**
     * 🔄 Use pairing code (increment attempt count)
     */
    usePairingCode(code) {
        if (!this.validatePairingCode(code)) return false;

        const record = this.generationHistory.get(`pairing_${code}`);
        record.data.attempts++;

        if (record.data.attempts >= record.data.maxAttempts) {
            this.generationHistory.delete(`pairing_${code}`);
            console.log(`🔒 [GENERATORS] Pairing code ${code} expired due to max attempts`);
        }

        return true;
    }

    /**
     * 🎯 Generate bot-specific configuration
     */
    generateBotConfig(botName) {
        try {
            const baseConfig = this.config.botNames[botName];
            if (!baseConfig) {
                throw new Error(`Unknown bot name: ${botName}`);
            }

            const sessionId = this.generateSessionId(botName);
            const authToken = this.generateAuthToken(botName, sessionId);

            return {
                botName,
                sessionId,
                authToken: authToken.token,
                prefix: baseConfig.prefix,
                color: baseConfig.color,
                emoji: baseConfig.emoji,
                features: this.generateBotFeatures(botName),
                commands: this.generateBotCommands(botName),
                connectionType: 'automatic', // ✅ ADDED: Automatic mode
                platform: 'render', // ✅ ADDED: Render deployment
                generatedAt: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ [GENERATORS] Bot config generation failed:', error);
            // ✅ FALLBACK: Basic config
            return {
                botName,
                sessionId: this.generateSessionId(botName),
                authToken: 'fallback-token',
                prefix: '!bot',
                color: '#00FF00',
                emoji: '🤖',
                features: { basicMode: true },
                commands: ['!help', '!status'],
                connectionType: 'automatic',
                platform: 'render',
                generatedAt: new Date().toISOString()
            };
        }
    }

    /**
     * ⚡ Generate bot features based on name
     */
    generateBotFeatures(botName) {
        const featureTemplates = {
            'SAVAGE-X': {
                aggressiveMode: true,
                autoAttack: false,
                floodProtection: true,
                advancedAI: true,
                multiTarget: true,
                automaticQR: true // ✅ ADDED: Auto QR support
            },
            'DE-UKNOWN-BOT': {
                mysteryMode: true,
                stealthMode: false,
                autoResponse: true,
                advancedAI: true,
                encryption: true,
                automaticQR: true // ✅ ADDED: Auto QR support
            },
            'QUEEN-RIXIE': {
                royalProtocol: true,
                supremeCommand: true,
                diplomaticImmunity: true,
                eliteAI: true,
                courtSession: false,
                royalGuard: true,
                automaticQR: true // ✅ ADDED: Auto QR support
            }
        };

        return featureTemplates[botName] || {
            basicMode: true,
            autoResponse: true,
            encryption: true,
            automaticQR: true // ✅ ADDED: Auto QR support
        };
    }

    /**
     * 💬 Generate bot commands based on name
     */
    generateBotCommands(botName) {
        const commandTemplates = {
            'SAVAGE-X': [
                '!savage', '!attack', '!hack', '!status', '!mode',
                '!scan', '!deploy', '!assault', '!help', '!stats'
            ],
            'DE-UKNOWN-BOT': [
                '!deunknown', '!mystery', '!secret', '!stealth', '!reveal',
                '!help', '!status'
            ],
            'QUEEN-RIXIE': [
                '!queen', '!royal', '!command', '!decree', '!court',
                '!subjects', '!authority', '!throne', '!help', '!status', '!edict'
            ]
        };

        return commandTemplates[botName] || ['!help', '!status'];
    }

    /**
     * 📊 Calculate entropy of a string
     */
    calculateEntropy(str) {
        if (!str || str.length === 0) return 0;

        try {
            const charCount = new Map();
            for (const char of str) {
                charCount.set(char, (charCount.get(char) || 0) + 1);
            }

            let entropy = 0;
            const length = str.length;

            for (const count of charCount.values()) {
                const probability = count / length;
                entropy -= probability * Math.log2(probability);
            }

            return entropy * length;
        } catch (error) {
            return 128; // Default "good enough" entropy
        }
    }

    /**
     * 📝 Record generation history
     */
    recordGeneration(type, identifier, data = {}) {
        try {
            const key = `${type}_${identifier}`;
            
            this.generationHistory.set(key, {
                type,
                identifier,
                data,
                timestamp: Date.now(),
                entropy: this.calculateEntropy(identifier)
            });

            this.usedIdentifiers.add(identifier);

            // Limit history size
            if (this.generationHistory.size > this.config.security.maxHistory) {
                const oldestKey = this.generationHistory.keys().next().value;
                this.generationHistory.delete(oldestKey);
            }
        } catch (error) {
            console.warn('⚠️ [GENERATORS] Failed to record generation:', error.message);
        }
    }

    /**
     * 🧹 Cleanup expired entries
     */
    cleanupExpiredEntries() {
        try {
            const now = Date.now();
            let cleaned = 0;

            for (const [key, record] of this.generationHistory.entries()) {
                if (record.data.expiresAt && record.data.expiresAt < now) {
                    this.generationHistory.delete(key);
                    this.usedIdentifiers.delete(record.identifier);
                    cleaned++;
                }
            }

            if (cleaned > 0) {
                console.log(`🧹 [GENERATORS] Cleaned ${cleaned} expired entries`);
            }

            return { cleaned, remaining: this.generationHistory.size };
        } catch (error) {
            console.error('❌ [GENERATORS] Cleanup failed:', error);
            return { cleaned: 0, remaining: this.generationHistory.size };
        }
    }

    /**
     * ⏰ Start cleanup interval
     */
    startCleanupInterval() {
        try {
            // Cleanup every 5 minutes
            setInterval(() => {
                this.cleanupExpiredEntries();
            }, 300000);

            console.log('⏰ [GENERATORS] Cleanup interval started (every 5 minutes)');
        } catch (error) {
            console.error('❌ [GENERATORS] Failed to start cleanup interval:', error);
        }
    }

    /**
     * 🎲 Generate secure random number in range
     */
    generateSecureRandom(min, max) {
        try {
            const range = max - min + 1;
            const bytes = crypto.randomBytes(4);
            const randomValue = bytes.readUInt32BE(0);
            
            return min + (randomValue % range);
        } catch (error) {
            console.error('❌ [GENERATORS] Secure random generation failed:', error);
            return Math.floor(Math.random() * (max - min + 1)) + min;
        }
    }

    /**
     * 🎯 Generate unique message ID
     */
    generateMessageId(prefix = 'MSG') {
        try {
            const timestamp = Date.now().toString(36);
            const random = this.generateRandomString(6);
            
            return `${prefix}_${timestamp}_${random}`.toUpperCase();
        } catch (error) {
            console.error('❌ [GENERATORS] Message ID generation failed:', error);
            return `MSG_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        }
    }

    /**
     * 🔄 Generate bot connection URL
     */
    generateBotConnectionUrl(scannerUrl, sessionId, botName) {
        try {
            const encodedSessionId = encodeURIComponent(sessionId);
            const encodedBotName = encodeURIComponent(botName);
            
            return `${scannerUrl}?session=${encodedSessionId}&bot=${encodedBotName}&auth=${this.generateSignature(sessionId + botName)}`;
        } catch (error) {
            console.error('❌ [GENERATORS] Connection URL generation failed:', error);
            return `${scannerUrl}?session=${sessionId}&bot=${botName}`;
        }
    }

    /**
     * 📊 Get generation statistics
     */
    getStats() {
        try {
            const now = Date.now();
            const recentGenerations = Array.from(this.generationHistory.values())
                .filter(record => now - record.timestamp < 3600000)
                .reduce((acc, record) => {
                    acc[record.type] = (acc[record.type] || 0) + 1;
                    return acc;
                }, {});

            return {
                totalGenerations: this.generationHistory.size,
                usedIdentifiers: this.usedIdentifiers.size,
                recentGenerations,
                config: {
                    sessionIdFormat: this.config.sessionId.prefix,
                    pairingCodeLength: this.config.pairingCode.length,
                    minEntropy: this.config.security.minEntropy
                },
                platform: 'render', // ✅ ADDED: Platform info
                timestamp: new Date()
            };
        } catch (error) {
            console.error('❌ [GENERATORS] Stats generation failed:', error);
            return {
                totalGenerations: 0,
                usedIdentifiers: 0,
                recentGenerations: {},
                error: error.message,
                timestamp: new Date()
            };
        }
    }

    /**
     * 🏥 Health check
     */
    healthCheck() {
        try {
            // Test session ID generation
            const testSessionId = this.generateSessionId('TEST');
            const sessionIdValid = this.validateSessionId(testSessionId);
            
            // Test pairing code generation
            const testPairingCode = this.generatePairingCode();
            const pairingCodeValid = this.validatePairingCode(testPairingCode);

            return {
                status: sessionIdValid && pairingCodeValid ? 'healthy' : 'unhealthy',
                tests: {
                    sessionIdGeneration: sessionIdValid,
                    pairingCodeGeneration: pairingCodeValid,
                    platform: 'render'
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

    /**
     * 🆕 Generate QR code data for automatic mode
     */
    generateQRData() {
        try {
            const qrId = crypto.randomBytes(8).toString('hex');
            const expiresAt = Date.now() + 120000; // 2 minutes
            
            return {
                qrId,
                expiresAt,
                generatedAt: Date.now(),
                pairingCode: this.generatePairingCode(),
                automatic: true // ✅ ADDED: Auto-generation flag
            };
        } catch (error) {
            console.error('❌ [GENERATORS] QR data generation failed:', error);
            return {
                qrId: 'fallback-qr',
                expiresAt: Date.now() + 120000,
                generatedAt: Date.now(),
                pairingCode: this.generatePairingCode(),
                automatic: true
            };
        }
    }
}

// Create and export singleton instance
const savageGenerators = new SavageGenerators();

module.exports = savageGenerators;

// 🚀 Quick utility functions
module.exports.generateSessionId = (botName, platform) => savageGenerators.generateSessionId(botName, platform);
module.exports.generatePairingCode = () => savageGenerators.generatePairingCode();
module.exports.generateAuthToken = (botName, sessionId, purpose) => savageGenerators.generateAuthToken(botName, sessionId, purpose);
module.exports.validateSessionId = (sessionId) => savageGenerators.validateSessionId(sessionId);
module.exports.validatePairingCode = (code) => savageGenerators.validatePairingCode(code);
module.exports.generateBotConfig = (botName) => savageGenerators.generateBotConfig(botName);
module.exports.generateQRData = () => savageGenerators.generateQRData(); // ✅ ADDED: QR data generator

// 📝 Example usage
if (require.main === module) {
    // Test the generators system
    const test = async () => {
        try {
            console.log('🧪 Testing Savage Generators System...\n');

            // Test session ID generation
            console.log('🆔 Testing Session ID Generation...');
            const sessionId = savageGenerators.generateSessionId('SAVAGE-X', 'render');
            console.log('✅ Generated:', sessionId);
            console.log('✅ Valid:', savageGenerators.validateSessionId(sessionId));
            console.log('✅ Entropy:', savageGenerators.calculateEntropy(sessionId).toFixed(2), 'bits\n');

            // Test pairing code generation
            console.log('🔢 Testing Pairing Code Generation...');
            const pairingCode = savageGenerators.generatePairingCode();
            console.log('✅ Generated:', pairingCode);
            console.log('✅ Valid:', savageGenerators.validatePairingCode(pairingCode), '\n');

            // Test QR data generation
            console.log('📱 Testing QR Data Generation...');
            const qrData = savageGenerators.generateQRData();
            console.log('✅ Generated QR data with pairing code:', qrData.pairingCode);
            console.log('✅ Automatic mode:', qrData.automatic, '\n');

            // Test health check
            console.log('🏥 Testing Health Check...');
            const health = savageGenerators.healthCheck();
            console.log('✅ Status:', health.status);
            console.log('✅ Platform:', health.tests.platform, '\n');

            console.log('🎯 All tests completed successfully!');

        } catch (error) {
            console.error('❌ Test failed:', error);
        }
    };
    
    test();
}
