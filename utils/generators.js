/**
 * 🦅 SAVAGE BOTS SCANNER - Advanced Generators System
 * BMW-style session IDs, pairing codes, and secure random generation
 * Military-grade random generation for maximum security
 */

const crypto = require('crypto');
const savageEncryption = require('./encryption');

class SavageGenerators {
    constructor() {
        this.config = {
            sessionId: {
                prefix: 'SAVAGE-XMD-BOT-SESSION',
                parts: 4,
                partLength: 12,
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
                'QUEEN RIXIE': {
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
        console.log(`🔧 [GENERATORS] Session ID Format: ${this.config.sessionId.prefix}-[12char]-[timestamp]-[12char]`);
        console.log(`🔢 [GENERATORS] Pairing Code Length: ${this.config.pairingCode.length} digits`);
        
        this.startCleanupInterval();
    }

    /**
     * 🆔 Generate BMW-style Session ID (48+ characters)
     */
    generateSessionId(botName = 'SCANNER', platform = 'render') {
        try {
            const timestamp = Math.floor(Date.now() / 1000);
            
            // Generate random parts
            const randomPart1 = this.generateRandomString(
                this.config.sessionId.partLength,
                this.config.sessionId.charset
            );
            
            const randomPart2 = this.generateRandomString(
                this.config.sessionId.partLength, 
                this.config.sessionId.charset
            );

            // Construct session ID
            const sessionId = [
                this.config.sessionId.prefix,
                randomPart1,
                timestamp.toString(),
                randomPart2
            ].join(this.config.sessionId.separator);

            // Validate format
            if (!this.validateSessionId(sessionId)) {
                throw new Error('Generated session ID failed validation');
            }

            // Check for collisions
            if (this.config.security.collisionCheck && this.usedIdentifiers.has(sessionId)) {
                console.warn('⚠️ [GENERATORS] Session ID collision detected, regenerating...');
                return this.generateSessionId(botName, platform);
            }

            // Record generation
            this.recordGeneration('session_id', sessionId, {
                botName,
                platform,
                timestamp,
                entropy: this.calculateEntropy(sessionId)
            });

            console.log(`🆔 [GENERATORS] Session ID generated for ${botName}: ${sessionId}`);
            return sessionId;

        } catch (error) {
            console.error('❌ [GENERATORS] Session ID generation failed:', error);
            throw error;
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
                code = this.generateRandomString(
                    this.config.pairingCode.length,
                    this.config.pairingCode.charset
                );
                attempts++;
                
                if (attempts > maxAttempts) {
                    throw new Error('Failed to generate unique pairing code after maximum attempts');
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
            throw error;
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
                throw new Error('Charset cannot be empty');
            }

            const randomBytes = crypto.randomBytes(length * 2); // Generate extra for safety
            let result = '';
            const charsetLength = charset.length;

            for (let i = 0; i < length; i++) {
                const randomValue = randomBytes.readUInt16BE(i * 2);
                const index = randomValue % charsetLength;
                result += charset.charAt(index);
            }

            // Verify entropy
            const entropy = this.calculateEntropy(result);
            if (entropy < this.config.security.minEntropy) {
                console.warn('⚠️ [GENERATORS] Low entropy detected, regenerating...');
                return this.generateRandomString(length, charset);
            }

            return result;

        } catch (error) {
            console.error('❌ [GENERATORS] Random string generation failed:', error);
            throw error;
        }
    }

    /**
     * 🔑 Generate secure authentication token
     */
    generateAuthToken(botName, sessionId, purpose = 'authentication') {
        try {
            const timestamp = Date.now();
            const randomPart = this.generateRandomString(32, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789');
            
            const tokenData = {
                botName,
                sessionId,
                purpose,
                timestamp,
                random: randomPart,
                version: '1.0.0'
            };

            // Create token string
            const tokenString = [
                botName.replace(/\s+/g, '_').toUpperCase(),
                sessionId.substring(sessionId.length - 8), // Last 8 chars
                timestamp.toString(36),
                randomPart.substring(0, 16)
            ].join('_');

            // Generate signature
            const signature = this.generateSignature(tokenData);

            const token = {
                token: tokenString,
                signature,
                data: tokenData,
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
            throw error;
        }
    }

    /**
     * ✍️ Generate cryptographic signature
     */
    generateSignature(data) {
        const dataString = typeof data === 'string' ? data : JSON.stringify(data);
        return crypto.createHmac('sha256', process.env.SESSION_ENCRYPTION_KEY || 'default-secret')
            .update(dataString)
            .digest('hex')
            .substring(0, 32); // 32-character signature
    }

    /**
     * 🔍 Validate session ID format
     */
    validateSessionId(sessionId) {
        if (typeof sessionId !== 'string') return false;

        const pattern = new RegExp(
            `^${this.config.sessionId.prefix}` +
            `\\${this.config.sessionId.separator}` +
            `[${this.config.sessionId.charset}]{${this.config.sessionId.partLength}}` +
            `\\${this.config.sessionId.separator}` +
            `\\d+` + // timestamp
            `\\${this.config.sessionId.separator}` +
            `[${this.config.sessionId.charset}]{${this.config.sessionId.partLength}}$`
        );

        return pattern.test(sessionId);
    }

    /**
     * ✅ Validate pairing code
     */
    validatePairingCode(code) {
        if (typeof code !== 'string') return false;
        
        // Check format
        const codePattern = new RegExp(`^[${this.config.pairingCode.charset}]{${this.config.pairingCode.length}}$`);
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
            generatedAt: new Date().toISOString()
        };
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
                stealthKill: false
            },
            'DE-UKNOWN-BOT': {
                mysteryMode: true,
                stealthMode: false,
                autoResponse: true,
                advancedAI: true,
                encryption: true
            },
            'QUEEN RIXIE': {
                royalProtocol: true,
                supremeCommand: true,
                diplomaticImmunity: true,
                eliteAI: true,
                courtSession: false,
                royalGuard: true
            }
        };

        return featureTemplates[botName] || {
            basicMode: true,
            autoResponse: true,
            encryption: true
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
            'QUEEN RIXIE': [
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

        return entropy * length; // Total entropy in bits
    }

    /**
     * 📝 Record generation history
     */
    recordGeneration(type, identifier, data = {}) {
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
    }

    /**
     * 🧹 Cleanup expired entries
     */
    cleanupExpiredEntries() {
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
    }

    /**
     * ⏰ Start cleanup interval
     */
    startCleanupInterval() {
        // Cleanup every 5 minutes
        setInterval(() => {
            this.cleanupExpiredEntries();
        }, 300000);

        console.log('⏰ [GENERATORS] Cleanup interval started (every 5 minutes)');
    }

    /**
     * 🎲 Generate secure random number in range
     */
    generateSecureRandom(min, max) {
        const range = max - min + 1;
        const bytes = crypto.randomBytes(4);
        const randomValue = bytes.readUInt32BE(0);
        
        return min + (randomValue % range);
    }

    /**
     * 🎯 Generate unique message ID
     */
    generateMessageId(prefix = 'MSG') {
        const timestamp = Date.now().toString(36);
        const random = this.generateRandomString(8, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
        
        return `${prefix}_${timestamp}_${random}`.toUpperCase();
    }

    /**
     * 🔄 Generate bot connection URL
     */
    generateBotConnectionUrl(scannerUrl, sessionId, botName) {
        const encodedSessionId = encodeURIComponent(sessionId);
        const encodedBotName = encodeURIComponent(botName);
        
        return `${scannerUrl}?session=${encodedSessionId}&bot=${encodedBotName}&auth=${this.generateSignature(sessionId + botName)}`;
    }

    /**
     * 📊 Get generation statistics
     */
    getStats() {
        const now = Date.now();
        const recentGenerations = Array.from(this.generationHistory.values())
            .filter(record => now - record.timestamp < 3600000) // Last hour
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
            timestamp: new Date()
        };
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
            
            // Test entropy
            const testEntropy = this.calculateEntropy(testSessionId);
            const entropySufficient = testEntropy >= this.config.security.minEntropy;

            return {
                status: sessionIdValid && pairingCodeValid && entropySufficient ? 'healthy' : 'unhealthy',
                tests: {
                    sessionIdGeneration: sessionIdValid,
                    pairingCodeGeneration: pairingCodeValid,
                    entropySufficient: entropySufficient,
                    testEntropy: testEntropy
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
const savageGenerators = new SavageGenerators();

module.exports = savageGenerators;

// 🚀 Quick utility functions
module.exports.generateSessionId = (botName, platform) => savageGenerators.generateSessionId(botName, platform);
module.exports.generatePairingCode = () => savageGenerators.generatePairingCode();
module.exports.generateAuthToken = (botName, sessionId, purpose) => savageGenerators.generateAuthToken(botName, sessionId, purpose);
module.exports.validateSessionId = (sessionId) => savageGenerators.validateSessionId(sessionId);
module.exports.validatePairingCode = (code) => savageGenerators.validatePairingCode(code);
module.exports.generateBotConfig = (botName) => savageGenerators.generateBotConfig(botName);

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

            // Test auth token generation
            console.log('🔑 Testing Auth Token Generation...');
            const authToken = savageGenerators.generateAuthToken('SAVAGE-X', sessionId);
            console.log('✅ Generated:', authToken.token.substring(0, 20) + '...\n');

            // Test bot config generation
            console.log('🤖 Testing Bot Config Generation...');
            const botConfig = savageGenerators.generateBotConfig('SAVAGE-X');
            console.log('✅ Generated config for:', botConfig.botName);
            console.log('✅ Features:', Object.keys(botConfig.features).join(', '));
            console.log('✅ Commands:', botConfig.commands.join(', '), '\n');

            // Test health check
            console.log('🏥 Testing Health Check...');
            const health = savageGenerators.healthCheck();
            console.log('✅ Status:', health.status);
            console.log('✅ Tests passed:', Object.values(health.tests).filter(Boolean).length, '/', Object.keys(health.tests).length, '\n');

            // Show statistics
            console.log('📊 Generator Statistics:');
            const stats = savageGenerators.getStats();
            console.log('✅ Total generations:', stats.totalGenerations);
            console.log('✅ Recent activity:', stats.recentGenerations);

        } catch (error) {
            console.error('❌ Test failed:', error);
        }
    };
    
    test();
}
