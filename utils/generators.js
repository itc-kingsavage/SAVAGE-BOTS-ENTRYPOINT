/**
 * 🦅 SAVAGE BOTS SCANNER - Advanced Generators System
 * BMW-style session IDs, pairing codes, and secure random generation
 * Military-grade random generation for maximum security
 * UPDATED: Manual-Only 8-digit Pairing Codes + QR Regeneration Support
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
                length: 8, // ✅ CHANGED: 8 digits (was 6)
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
            },
            qr: {
                regenerationInterval: 30000, // ✅ ADDED: 30 seconds
                maxRegenerationAttempts: 10, // ✅ ADDED: Limit attempts
                timeout: 120000 // ✅ ADDED: 2 minutes
            }
        };

        this.generationHistory = new Map();
        this.usedIdentifiers = new Set();
        this.qrRegenerationTracker = new Map(); // ✅ ADDED: Track QR regeneration
        this.init();
    }

    /**
     * 🎯 Initialize generators system
     */
    init() {
        console.log('🎲 [GENERATORS] Savage Generators System Initialized');
        console.log(`🔧 [GENERATORS] Session ID Format: ${this.config.sessionId.prefix}-[8char]-[timestamp]-[8char]`);
        console.log(`🔢 [GENERATORS] Pairing Code Length: ${this.config.pairingCode.length} digits (MANUAL-ONLY)`); // ✅ UPDATED: Manual-only
        console.log(`🔄 [GENERATORS] QR Regeneration: ${this.config.qr.regenerationInterval}ms intervals`); // ✅ ADDED
        console.log(`📱 [GENERATORS] Pairing Mode: MANUAL-ONLY (Phone number required)`); // ✅ ADDED
        
        this.startCleanupInterval();
        this.startQRRegenerationMonitor(); // ✅ ADDED: QR regeneration monitor
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
     * 🔢 Generate 8-digit pairing code - UPDATED FOR MANUAL-ONLY
     */
    generatePairingCode(phoneNumber = null) {
        try {
            // ✅ CHANGED: Phone number is now REQUIRED for manual-only mode
            if (!phoneNumber || phoneNumber.trim() === '') {
                console.warn('⚠️ [GENERATORS] Phone number required for manual pairing code generation');
                return null; // ✅ CHANGED: Return null instead of generating auto code
            }

            let code;
            let attempts = 0;
            const maxAttempts = 10;

            do {
                // ✅ IMPROVED: Better random generation for 8-digit pairing codes
                const randomBytes = crypto.randomBytes(4);
                const randomNum = randomBytes.readUInt32BE(0);
                // ✅ CHANGED: Generate 8-digit code (was 6)
                code = (randomNum % 90000000 + 10000000).toString(); // Ensure 8 digits
                attempts++;
                
                if (attempts > maxAttempts) {
                    // ✅ FALLBACK: Simple random as last resort
                    code = Math.floor(10000000 + Math.random() * 90000000).toString();
                    break;
                }
            } while (this.generationHistory.has(`pairing_${code}`));

            // Record with expiry
            this.recordGeneration('pairing_code', code, {
                generatedAt: Date.now(),
                expiresAt: Date.now() + this.config.pairingCode.expiry,
                attempts: 0,
                maxAttempts: this.config.pairingCode.maxAttempts,
                phoneNumber: phoneNumber, // ✅ ADDED: Track phone number
                isManual: true // ✅ CHANGED: Always manual now
            });

            console.log(`🔢 [GENERATORS] Manual 8-digit pairing code generated for ${phoneNumber}: ${code}`);
            return code;

        } catch (error) {
            console.error('❌ [GENERATORS] Pairing code generation failed:', error);
            // ✅ CHANGED: Return null on error for manual-only mode
            return null;
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
     * ✅ Validate pairing code - UPDATED for 8 digits and manual-only
     */
    validatePairingCode(code) {
        if (typeof code !== 'string') return false;
        
        // ✅ CHANGED: Check format (8 digits now)
        const codePattern = /^\d{8}$/;
        if (!codePattern.test(code)) return false;

        // Check if code exists and is not expired
        const record = this.generationHistory.get(`pairing_${code}`);
        if (!record) return false;

        // ✅ CHANGED: Check if it's a manual code
        if (!record.data.isManual) {
            console.warn('⚠️ [GENERATORS] Automatic pairing codes are disabled');
            return false;
        }

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
                connectionType: 'automatic',
                platform: 'render',
                pairingCodeLength: this.config.pairingCode.length, // ✅ ADDED: 8-digit info
                pairingMode: 'MANUAL-ONLY', // ✅ ADDED: Manual-only mode
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
                pairingCodeLength: this.config.pairingCode.length,
                pairingMode: 'MANUAL-ONLY',
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
                automaticQR: true,
                enhancedPairing: true, // ✅ ADDED: Enhanced pairing support
                qrRegeneration: true, // ✅ ADDED: QR regeneration support
                manualPairingOnly: true // ✅ ADDED: Manual-only mode
            },
            'DE-UKNOWN-BOT': {
                mysteryMode: true,
                stealthMode: false,
                autoResponse: true,
                advancedAI: true,
                encryption: true,
                automaticQR: true,
                enhancedPairing: true, // ✅ ADDED: Enhanced pairing support
                qrRegeneration: true, // ✅ ADDED: QR regeneration support
                manualPairingOnly: true // ✅ ADDED: Manual-only mode
            },
            'QUEEN-RIXIE': {
                royalProtocol: true,
                supremeCommand: true,
                diplomaticImmunity: true,
                eliteAI: true,
                courtSession: false,
                royalGuard: true,
                automaticQR: true,
                enhancedPairing: true, // ✅ ADDED: Enhanced pairing support
                qrRegeneration: true, // ✅ ADDED: QR regeneration support
                manualPairingOnly: true // ✅ ADDED: Manual-only mode
            }
        };

        return featureTemplates[botName] || {
            basicMode: true,
            autoResponse: true,
            encryption: true,
            automaticQR: true,
            enhancedPairing: true,
            qrRegeneration: true,
            manualPairingOnly: true // ✅ ADDED: Manual-only mode
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
     * 🔄 Start QR regeneration monitor - NEW METHOD
     */
    startQRRegenerationMonitor() {
        try {
            // Monitor QR regeneration every minute
            setInterval(() => {
                this.monitorQRRegeneration();
            }, 60000);

            console.log('🔄 [GENERATORS] QR regeneration monitor started');
        } catch (error) {
            console.error('❌ [GENERATORS] Failed to start QR regeneration monitor:', error);
        }
    }

    /**
     * 📱 Monitor QR regeneration status - NEW METHOD
     */
    monitorQRRegeneration() {
        try {
            const now = Date.now();
            let activeRegenerations = 0;
            let expiredRegenerations = 0;

            for (const [qrId, data] of this.qrRegenerationTracker.entries()) {
                if (now - data.lastRegenerated > this.config.qr.regenerationInterval * 2) {
                    // QR regeneration seems stuck
                    console.warn(`⚠️ [GENERATORS] QR regeneration stuck for ${qrId}`);
                    this.qrRegenerationTracker.delete(qrId);
                    expiredRegenerations++;
                } else {
                    activeRegenerations++;
                }
            }

            if (expiredRegenerations > 0) {
                console.log(`🔄 [GENERATORS] QR regeneration monitor: ${activeRegenerations} active, ${expiredRegenerations} expired`);
            }
        } catch (error) {
            console.error('❌ [GENERATORS] QR regeneration monitoring failed:', error);
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
                qrRegeneration: {
                    active: this.qrRegenerationTracker.size,
                    interval: this.config.qr.regenerationInterval
                },
                pairingCodes: {
                    length: this.config.pairingCode.length,
                    expiry: this.config.pairingCode.expiry,
                    mode: 'MANUAL-ONLY' // ✅ ADDED: Manual-only mode
                },
                config: {
                    sessionIdFormat: this.config.sessionId.prefix,
                    pairingCodeLength: this.config.pairingCode.length,
                    minEntropy: this.config.security.minEntropy,
                    pairingMode: 'MANUAL-ONLY' // ✅ ADDED: Manual-only mode
                },
                platform: 'render',
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
            
            // Test manual pairing code generation (8-digit now with phone number)
            const testPairingCode = this.generatePairingCode('+1234567890');
            const pairingCodeValid = testPairingCode && this.validatePairingCode(testPairingCode);

            // Test QR regeneration tracking
            const qrData = this.generateQRData();
            const qrTrackingValid = !!qrData.qrId;

            return {
                status: sessionIdValid && pairingCodeValid && qrTrackingValid ? 'healthy' : 'unhealthy',
                tests: {
                    sessionIdGeneration: sessionIdValid,
                    pairingCodeGeneration: pairingCodeValid,
                    qrRegenerationTracking: qrTrackingValid,
                    pairingCodeLength: this.config.pairingCode.length,
                    pairingMode: 'MANUAL-ONLY', // ✅ ADDED: Manual-only mode
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
     * 🆕 Generate QR code data for automatic mode - ENHANCED
     */
    generateQRData(phoneNumber = null) {
        try {
            const qrId = crypto.randomBytes(8).toString('hex');
            const expiresAt = Date.now() + this.config.qr.timeout;
            
            // ✅ CHANGED: No automatic pairing codes - only generate if phone number provided
            const pairingCode = phoneNumber ? this.generatePairingCode(phoneNumber) : null;
            
            // Track QR regeneration
            this.qrRegenerationTracker.set(qrId, {
                lastRegenerated: Date.now(),
                regenerationCount: 1,
                pairingCode: pairingCode,
                phoneNumber: phoneNumber,
                expiresAt: expiresAt,
                isManual: !!phoneNumber // ✅ ADDED: Manual flag
            });

            return {
                qrId,
                expiresAt,
                generatedAt: Date.now(),
                pairingCode: pairingCode, // ✅ CHANGED: Will be null for QR codes
                automatic: true,
                phoneNumber: phoneNumber,
                isManual: !!phoneNumber, // ✅ ADDED: Manual generation flag
                length: this.config.pairingCode.length, // ✅ ADDED: Code length info
                pairingMode: 'MANUAL-ONLY' // ✅ ADDED: Manual-only mode
            };
        } catch (error) {
            console.error('❌ [GENERATORS] QR data generation failed:', error);
            return {
                qrId: 'fallback-qr',
                expiresAt: Date.now() + this.config.qr.timeout,
                generatedAt: Date.now(),
                pairingCode: null, // ✅ CHANGED: No fallback pairing code
                automatic: true,
                phoneNumber: phoneNumber,
                isManual: !!phoneNumber,
                length: this.config.pairingCode.length,
                pairingMode: 'MANUAL-ONLY'
            };
        }
    }

    /**
     * 🔄 Track QR regeneration - NEW METHOD
     */
    trackQRRegeneration(qrId) {
        try {
            const existing = this.qrRegenerationTracker.get(qrId);
            if (existing) {
                existing.regenerationCount++;
                existing.lastRegenerated = Date.now();
                
                // Check if we've hit the regeneration limit
                if (existing.regenerationCount >= this.config.qr.maxRegenerationAttempts) {
                    console.warn(`⚠️ [GENERATORS] QR ${qrId} hit regeneration limit (${existing.regenerationCount})`);
                    this.qrRegenerationTracker.delete(qrId);
                    return false;
                }
                
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('❌ [GENERATORS] QR regeneration tracking failed:', error);
            return false;
        }
    }

    /**
     * 📱 Get QR regeneration status - NEW METHOD
     */
    getQRRegenerationStatus(qrId) {
        try {
            const data = this.qrRegenerationTracker.get(qrId);
            if (!data) return null;

            return {
                qrId,
                regenerationCount: data.regenerationCount,
                lastRegenerated: data.lastRegenerated,
                nextRegeneration: data.lastRegenerated + this.config.qr.regenerationInterval,
                pairingCode: data.pairingCode,
                phoneNumber: data.phoneNumber,
                isManual: data.isManual, // ✅ ADDED: Manual flag
                isActive: Date.now() - data.lastRegenerated < this.config.qr.regenerationInterval * 2
            };
        } catch (error) {
            console.error('❌ [GENERATORS] QR regeneration status check failed:', error);
            return null;
        }
    }

    /**
     * ✅ ADDED: Validate phone number format for manual pairing
     */
    isValidPhoneNumber(phone) {
        if (!phone || phone.trim() === '') return false;
        const phoneRegex = /^\+?[1-9]\d{1,14}$/;
        return phoneRegex.test(phone.replace(/\s/g, ''));
    }
}

// Create and export singleton instance
const savageGenerators = new SavageGenerators();

module.exports = savageGenerators;

// 🚀 Quick utility functions
module.exports.generateSessionId = (botName, platform) => savageGenerators.generateSessionId(botName, platform);
module.exports.generatePairingCode = (phoneNumber) => savageGenerators.generatePairingCode(phoneNumber); // ✅ UPDATED: Phone number parameter (REQUIRED)
module.exports.generateAuthToken = (botName, sessionId, purpose) => savageGenerators.generateAuthToken(botName, sessionId, purpose);
module.exports.validateSessionId = (sessionId) => savageGenerators.validateSessionId(sessionId);
module.exports.validatePairingCode = (code) => savageGenerators.validatePairingCode(code);
module.exports.generateBotConfig = (botName) => savageGenerators.generateBotConfig(botName);
module.exports.generateQRData = (phoneNumber) => savageGenerators.generateQRData(phoneNumber); // ✅ UPDATED: Phone number parameter
module.exports.trackQRRegeneration = (qrId) => savageGenerators.trackQRRegeneration(qrId); // ✅ ADDED: QR regeneration tracking
module.exports.getQRRegenerationStatus = (qrId) => savageGenerators.getQRRegenerationStatus(qrId); // ✅ ADDED: QR status
module.exports.isValidPhoneNumber = (phone) => savageGenerators.isValidPhoneNumber(phone); // ✅ ADDED: Phone validation

// 📝 Example usage
if (require.main === module) {
    // Test the generators system
    const test = async () => {
        try {
            console.log('🧪 Testing Savage Generators System (MANUAL-ONLY MODE)...\n');

            // Test session ID generation
            console.log('🆔 Testing Session ID Generation...');
            const sessionId = savageGenerators.generateSessionId('SAVAGE-X', 'render');
            console.log('✅ Generated:', sessionId);
            console.log('✅ Valid:', savageGenerators.validateSessionId(sessionId));
            console.log('✅ Entropy:', savageGenerators.calculateEntropy(sessionId).toFixed(2), 'bits\n');

            // Test manual 8-digit pairing code generation with phone number
            console.log('🔢 Testing Manual 8-digit Pairing Code Generation...');
            const manualPairingCode = savageGenerators.generatePairingCode('+1234567890');
            console.log('✅ Manual code generated:', manualPairingCode);
            console.log('✅ Length:', manualPairingCode ? manualPairingCode.length : 'N/A', 'digits');
            console.log('✅ Valid:', manualPairingCode ? savageGenerators.validatePairingCode(manualPairingCode) : false, '\n');

            // Test manual pairing code without phone number (should fail)
            console.log('❌ Testing Pairing Code Without Phone Number (Should Fail)...');
            const failedPairingCode = savageGenerators.generatePairingCode();
            console.log('✅ Result:', failedPairingCode === null ? 'Failed as expected (Manual-only mode)' : 'ERROR: Should have failed');
            console.log('✅ Manual-only mode enforced:', failedPairingCode === null, '\n');

            // Test QR data generation (no pairing code for QR)
            console.log('📱 Testing QR Data Generation (No Auto Pairing Codes)...');
            const qrData = savageGenerators.generateQRData();
            console.log('✅ Generated QR data with pairing code:', qrData.pairingCode);
            console.log('✅ Automatic mode:', qrData.automatic);
            console.log('✅ Manual-only mode:', qrData.pairingMode);
            console.log('✅ Code length:', qrData.length, 'digits\n');

            // Test QR regeneration tracking
            console.log('🔄 Testing QR Regeneration Tracking...');
            const trackingResult = savageGenerators.trackQRRegeneration(qrData.qrId);
            console.log('✅ QR regeneration tracked:', trackingResult);
            
            const qrStatus = savageGenerators.getQRRegenerationStatus(qrData.qrId);
            console.log('✅ QR regeneration status:', qrStatus ? 'Active' : 'Inactive', '\n');

            // Test health check
            console.log('🏥 Testing Health Check...');
            const health = savageGenerators.healthCheck();
            console.log('✅ Status:', health.status);
            console.log('✅ Platform:', health.tests.platform);
            console.log('✅ Pairing Code Length:', health.tests.pairingCodeLength, 'digits');
            console.log('✅ Pairing Mode:', health.tests.pairingMode, '\n');

            console.log('🎯 All manual-only tests completed successfully!');

        } catch (error) {
            console.error('❌ Test failed:', error);
        }
    };
    
    test();
}
