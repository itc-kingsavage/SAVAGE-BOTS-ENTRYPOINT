/**
 * 🦅 SAVAGE BOTS SCANNER - Constants & Configuration
 * Centralized configuration for SAVAGE BOTS ecosystem
 * UPDATED: Manual-Only 8-digit Pairing Codes + QR Auto-regeneration
 */

const path = require('path');

// =============================================================================
// 🦅 SCANNER IDENTITY & BRANDING
// =============================================================================
const SCANNER_IDENTITY = {
    NAME: 'SAVAGE BOTS SCANNER',
    VERSION: '2.1.0', // ✅ UPDATED: Manual-only pairing codes
    CODE_NAME: 'PROJECT-XMD',
    DEVELOPER: 'SAVAGE BOTS TECHNOLOGY',
    MOTTO: 'When ordinary isn\'t an option',
    
    // Bot identities
    BOTS: {
        'SAVAGE-X': {
            name: 'SAVAGE-X',
            color: '#00FF00', // Green
            prefix: '!savage',
            description: 'Primary attack bot with advanced features'
        },
        'DE-UKNOWN-BOT': {
            name: 'DE-UKNOWN-BOT', 
            color: '#0000FF', // Blue
            prefix: '!deunknown',
            description: 'Mystery bot with hidden capabilities'
        },
        'QUEEN-RIXIE': {
            name: 'QUEEN RIXIE',
            color: '#FF00FF', // Pink
            prefix: '!queen',
            description: 'Royal command bot with elite features'
        }
    }
};

// =============================================================================
// 🔐 SECURITY & ENCRYPTION
// =============================================================================
const SECURITY_CONFIG = {
    // Password requirements
    PASSWORD: {
        MIN_LENGTH: 12,
        REQUIRE_UPPERCASE: true,
        REQUIRE_LOWERCASE: true,
        REQUIRE_NUMBERS: true,
        REQUIRE_SYMBOLS: true,
        MAX_ATTEMPTS: 5,
        LOCKOUT_TIME: 15 * 60 * 1000 // 15 minutes
    },
    
    // Session encryption
    ENCRYPTION: {
        ALGORITHM: 'aes-256-gcm',
        KEY_LENGTH: 32, // 32 bytes = 256 bits
        IV_LENGTH: 16,  // 16 bytes for AES-GCM
        SALT: 'SAVAGE_BOTS_XMD_2024',
        ITERATIONS: 10000
    },
    
    // WebSocket security
    WEBSOCKET: {
        PING_INTERVAL: 30000,    // 30 seconds
        PONG_TIMEOUT: 10000,     // 10 seconds
        MAX_PAYLOAD: 10 * 1024 * 1024, // 10MB
        ORIGIN_WHITELIST: [
            'https://savage-bots-scanner.onrender.com',
            'https://*.onrender.com',
            'http://localhost:3000',
            'http://127.0.0.1:3000'
        ]
    }
};

// =============================================================================
// 📱 WHATSAPP BAILEYS CONFIGURATION (v6.4.0 COMPATIBLE)
// =============================================================================
const WHATSAPP_CONFIG = {
    // Baileys connection settings - UPDATED for v6.4.0
    BAILEYS: {
        VERSION: [2, 2413, 1], // ✅ Compatible with Baileys 6.4.0
        BROWSER: ["SAVAGE BOTS SCANNER", "Chrome", "121.0.0.0"],
        MARK_ONLINE_ON_CONNECT: false, // ✅ Anti-ban
        SYNC_FULL_HISTORY: false, // ✅ Performance
        GENERATE_HIGH_QUALITY_LINK: true, // ✅ Better QR codes
        FIRE_INIT_QUERIES: true,
        AUTH_PATH: './savage_auth',
        MAX_QR_RETRIES: 3,
        CONNECTION_TIMEOUT: 30000,
        
        // ✅ FIXED: Proper logger configuration for Baileys v6.4.0
        LOGGER: {
            level: 'silent',
            timestamp: () => `[${new Date().toISOString()}]`
        },

        // ✅ ADDED: Connection settings for stability
        CONNECTION: {
            retryRequestDelayMs: 3000,
            maxRetries: 5,
            connectTimeoutMs: 30000,
            keepAliveIntervalMs: 30000,
            printQRInTerminal: false
        },
        
        // Anti-ban settings
        ANTI_BAN: {
            MAX_MESSAGES_PER_MINUTE: 30,
            MIN_MESSAGE_INTERVAL: 2000, // 2 seconds
            AVOID_BROADCAST: true,
            LIMIT_GROUP_MESSAGES: true,
            RANDOM_DELAYS: true
        }
    },
    
    // QR Code settings - ✅ UPDATED: Auto-regeneration
    QR: {
        WIDTH: 400, // ✅ INCREASED: Better visibility
        HEIGHT: 400,
        MARGIN: 2,
        COLOR: {
            DARK: '#00FF00', // Matrix green
            LIGHT: '#000000' // Black
        },
        TIMEOUT: 120000, // ✅ REDUCED: 2 minutes for better UX
        REGENERATION_INTERVAL: 30000, // ✅ ADDED: 30 seconds auto-refresh
        MAX_REGENERATION_ATTEMPTS: 10, // ✅ ADDED: Limit regeneration
        NOTIFY_ON_REFRESH: true // ✅ ADDED: Show notifications
    },
    
    // Scanner connection management
    SCANNER: {
        AUTO_RECONNECT: true,
        MAX_RECONNECT_ATTEMPTS: 5,
        RECONNECT_DELAY: 5000,
        QR_TIMEOUT: 120000, // 2 minutes
        CONNECTION_TIMEOUT: 30000
    },
    
    // Pairing code settings - ✅ UPDATED: Manual-only 8-digit codes
    PAIRING: {
        LENGTH: 8, // ✅ CHANGED: 8-digit codes (was 6)
        CHARSET: '0123456789',
        TIMEOUT: 300000, // 5 minutes
        MAX_ATTEMPTS: 3,
        ALLOW_MANUAL_GENERATION: true, // ✅ ADDED: Manual generation
        REQUIRE_PHONE_NUMBER: true, // ✅ CHANGED: Phone number REQUIRED (was false)
        AUTO_GENERATE_WITH_QR: false, // ✅ CHANGED: No auto-generation with QR (was true)
        MODE: 'MANUAL-ONLY' // ✅ ADDED: Manual-only mode
    }
};

// =============================================================================
// 🗄️ DATABASE & STORAGE
// =============================================================================
const DATABASE_CONFIG = {
    // MongoDB settings
    MONGO: {
        OPTIONS: {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            retryWrites: true,
            w: 'majority',
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 45000,
            maxPoolSize: 10,
            minPoolSize: 2,
            maxIdleTimeMS: 30000
        },
        
        COLLECTIONS: {
            SESSIONS: 'savage_sessions',
            USERS: 'savage_users',
            LOGS: 'savage_logs',
            STATS: 'savage_stats',
            PAIRING_CODES: 'savage_pairing_codes' // ✅ ADDED: Pairing code storage
        }
    },
    
    // Session backup settings
    BACKUP: {
        // Render persistent storage path
        DISK_PATH: '/tmp/savage-session-backups',
        
        // Backup rotation
        MAX_BACKUP_FILES: 10,
        BACKUP_INTERVAL: 3600000, // 1 hour
        AUTO_RECOVERY: true,
        
        // Session expiration
        SESSION_TTL: 30 * 24 * 60 * 60 * 1000, // 30 days
        CLEANUP_INTERVAL: 24 * 60 * 60 * 1000 // 24 hours
    }
};

// =============================================================================
// 🌐 WEB SERVER & API
// =============================================================================
const SERVER_CONFIG = {
    // Server settings
    PORT: process.env.PORT || 3000,
    HOST: '0.0.0.0', // Bind to all interfaces
    TRUST_PROXY: true,
    
    // Rate limiting
    RATE_LIMIT: {
        WINDOW_MS: 15 * 60 * 1000, // 15 minutes
        MAX_REQUESTS: 100, // Limit each IP to 100 requests per windowMs
        MESSAGE: 'Too many requests from this IP, please try again later.'
    },
    
    // CORS settings
    CORS: {
        origin: [
            'https://savage-bots-scanner.onrender.com',
            'https://*.onrender.com',
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'http://localhost:8080',
            'http://127.0.0.1:8080'
        ],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    },
    
    // Static files
    STATIC: {
        MAX_AGE: 86400000, // 1 day in milliseconds
        DOTFILES: 'ignore',
        ETAG: true,
        EXTENSIONS: ['html', 'css', 'js', 'png', 'jpg', 'jpeg', 'gif', 'ico']
    }
};

// =============================================================================
// 🤖 BOT CONNECTION & WEB SOCKETS
// =============================================================================
const BOT_CONFIG = {
    // WebSocket server
    WEBSOCKET: {
        PORT: 8080,
        PATH: '/savage-ws',
        PING_INTERVAL: 30000,
        PONG_TIMEOUT: 10000,
        MAX_CONNECTIONS: 10
    },
    
    // Bot authentication
    AUTH: {
        SESSION_ID_PREFIX: 'SAVAGE-XMD-BOT-SESSION',
        SESSION_ID_LENGTH: 48, // BMW-style long IDs
        TOKEN_EXPIRY: 7 * 24 * 60 * 60 * 1000, // 7 days
        RENEWAL_THRESHOLD: 24 * 60 * 60 * 1000 // 24 hours
    },
    
    // Message routing
    MESSAGES: {
        TYPES: {
            COMMAND: 'command',
            RESPONSE: 'response',
            BROADCAST: 'broadcast',
            STATUS: 'status',
            ERROR: 'error',
            PAIRING_CODE: 'pairing_code' // ✅ ADDED: Pairing code messages
        },
        
        PRIORITIES: {
            HIGH: 1,
            NORMAL: 2,
            LOW: 3
        }
    }
};

// =============================================================================
// 🎨 UI & THEMING
// =============================================================================
const UI_CONFIG = {
    // Hacker theme colors
    COLORS: {
        PRIMARY: '#00FF00',    // Matrix Green
        SECONDARY: '#FF0000',  // Red
        ACCENT: '#0000FF',     // Blue
        BACKGROUND: '#000000', // Black
        TEXT: '#00FF00',       // Green
        WARNING: '#FFFF00',    // Yellow
        ERROR: '#FF0000',      // Red
        SUCCESS: '#00FF00',    // Green
        PAIRING_CODE: '#00FFFF', // ✅ ADDED: Pairing code color
        MANUAL_MODE: '#FFA500' // ✅ ADDED: Manual mode indicator
    },
    
    // Hacker theme elements
    THEME: {
        FONT_FAMILY: '"Courier New", monospace',
        BACKGROUND_IMAGE: '/assets/images/hacker-bg.jpg',
        LOGO: '/assets/images/savage-logo.png',
        BURNING_CARDS: '/assets/images/burning-cards.png',
        
        // Matrix animation
        MATRIX: {
            CHARACTERS: '01',
            SPEED: 50,
            DENSITY: 0.02,
            FADE_SPEED: 0.05
        }
    },
    
    // Scanner interface - ✅ UPDATED: Manual-only pairing section
    SCANNER: {
        QR_SIZE: 400, // ✅ INCREASED: Better visibility
        STATUS_REFRESH: 5000, // 5 seconds
        AUTO_RECONNECT: true,
        CONNECTION_TIMEOUT: 300000, // 5 minutes
        
        // ✅ ADDED: Connection status indicators
        STATUS_COLORS: {
            CONNECTED: '#00FF00',
            DISCONNECTED: '#FF0000',
            CONNECTING: '#FFFF00',
            QR_READY: '#00FFFF',
            SYNCING: '#FF00FF',
            PAIRING_READY: '#00FFFF', // ✅ ADDED: Pairing ready color
            MANUAL_MODE: '#FFA500' // ✅ ADDED: Manual mode indicator
        },
        
        // ✅ UPDATED: Manual-only pairing section styling
        PAIRING_SECTION: {
            BACKGROUND: 'rgba(255, 165, 0, 0.1)', // ✅ CHANGED: Orange for manual mode
            BORDER: '2px solid #FFA500', // ✅ CHANGED: Orange border
            HEADER_COLOR: '#FFA500', // ✅ CHANGED: Orange header
            CODE_FONT_SIZE: '24px',
            CODE_COLOR: '#FFA500', // ✅ CHANGED: Orange code
            REQUIRED_FIELD: '#FF0000', // ✅ ADDED: Required field styling
            MANUAL_INDICATOR: 'MANUAL-ONLY' // ✅ ADDED: Manual mode text
        }
    }
};

// =============================================================================
// 📧 MESSAGES & CONTENT - ✅ UPDATED: Manual-only pairing messages
// =============================================================================
const MESSAGES = {
    // Connection flow messages
    CONNECTION: {
        INITIALIZING: '🦅 SAVAGE BOTS SCANNER - Initializing (Manual-Only Mode)...',
        WAITING_QR: '📱 Waiting for QR code generation...',
        QR_READY: '✅ QR code ready - Scan with your phone',
        CONNECTING: '🔗 Connecting to WhatsApp...',
        SYNCING: '🔄 Syncing with WhatsApp...',
        SUCCESS: '✅ Connection established successfully!',
        FAILED: '❌ Connection failed. Please try again.',
        TIMEOUT: '⏰ Connection timeout. Regenerating QR code...',
        DISCONNECTED: '🔌 WhatsApp connection lost. Reconnecting...',
        QR_REFRESHING: '🔄 Auto-refreshing QR code...' // ✅ ADDED: QR refresh message
    },
    
    // Pairing code messages - ✅ UPDATED: Manual-only pairing messages
    PAIRING: {
        GENERATING: '🔢 Generating 8-digit pairing code...',
        READY: '✅ 8-digit pairing code ready!',
        MANUAL_GENERATED: '🔢 Manual pairing code generated',
        WITH_PHONE: '📱 Pairing code generated for specific number',
        COPIED: '📋 Pairing code copied to clipboard',
        EXPIRED: '⏰ Pairing code expired',
        INVALID_PHONE: '❌ Invalid phone number format',
        GENERATION_FAILED: '❌ Failed to generate pairing code',
        PHONE_REQUIRED: '📱 Phone number REQUIRED for pairing codes', // ✅ ADDED: Required message
        MANUAL_ONLY: '🔒 Pairing codes: MANUAL-ONLY mode', // ✅ ADDED: Manual-only indicator
        NO_AUTO_CODES: '⚠️ No automatic pairing codes - Manual generation only' // ✅ ADDED: No auto codes
    },
    
    // Introduction messages (sent after successful connection)
    INTRODUCTION: [
        `🦅 *SAVAGE BOTS SCANNER ACTIVATED*\n` +
        `Multi-Bot WhatsApp System Ready!\n` +
        `Version: ${SCANNER_IDENTITY.VERSION}\n` +
        `Code Name: ${SCANNER_IDENTITY.CODE_NAME}\n` +
        `Pairing Mode: MANUAL-ONLY 8-digit codes`, // ✅ ADDED: Manual mode info
        
        `🔐 *SESSION SECURE*\n` +
        `Encrypted connection established\n` +
        `Session ID: [AUTO-GENERATED]\n` +
        `Bots can now connect using session credentials\n` +
        `Manual pairing codes enabled for specific numbers`, // ✅ ADDED: Manual pairing info
        
        `🎯 *ENJOY THE SAVAGE EXPERIENCE!*\n` +
        `Powered by ${SCANNER_IDENTITY.DEVELOPER}\n` +
        `"${SCANNER_IDENTITY.MOTTO}"`
    ],
    
    // Error messages
    ERRORS: {
        AUTH_FAILED: '🔐 Authentication failed. Invalid password.',
        SESSION_EXPIRED: '📱 Session expired. Please scan QR code again.',
        DATABASE_ERROR: '🗄️ Database connection error. Please try again.',
        RATE_LIMITED: '⚡ Rate limit exceeded. Please wait before trying again.',
        BOT_CONNECTION_FAILED: '🤖 Bot connection failed. Check session ID and try again.',
        WHATSAPP_INIT_FAILED: '❌ WhatsApp initialization failed. Running in limited mode.',
        QR_GENERATION_FAILED: '❌ QR code generation failed. Please refresh.',
        PAIRING_GENERATION_FAILED: '❌ Pairing code generation failed', // ✅ ADDED
        PHONE_NUMBER_REQUIRED: '❌ Phone number is REQUIRED for pairing codes' // ✅ ADDED: Required error
    },
    
    // Status messages for frontend
    STATUS: {
        SCANNER_READY: '🦅 Scanner is ready and waiting for connection',
        WHATSAPP_CONNECTED: '✅ WhatsApp connected and ready',
        WHATSAPP_DISCONNECTED: '🔌 WhatsApp disconnected',
        BOTS_CONNECTED: '🤖 Bots connected and operational',
        LIMITED_MODE: '⚠️ Running in limited mode - WhatsApp unavailable',
        QR_AUTO_REFRESH: '🔄 QR auto-refresh active (30s)', // ✅ ADDED
        PAIRING_CODE_READY: '🔢 8-digit pairing code ready', // ✅ ADDED
        MANUAL_PAIRING_MODE: '🔒 MANUAL-ONLY pairing codes active', // ✅ ADDED: Manual mode
        PHONE_REQUIRED: '📱 Phone number required for pairing' // ✅ ADDED: Phone requirement
    }
};

// =============================================================================
// 🚀 DEPLOYMENT & ENVIRONMENT
// =============================================================================
const DEPLOYMENT = {
    // Supported platforms
    PLATFORMS: {
        RENDER: {
            NAME: 'Render',
            ENV_VARS: ['SCANNER_PASSWORD', 'MONGODB_URI', 'SESSION_ENCRYPTION_KEY'],
            PORT: process.env.PORT || 3000,
            DISK_PATH: '/tmp',
            HOST: '0.0.0.0'
        },
        HEROKU: {
            NAME: 'Heroku', 
            ENV_VARS: ['SCANNER_PASSWORD', 'MONGODB_URI', 'SESSION_ENCRYPTION_KEY'],
            PORT: process.env.PORT || 3000,
            DISK_PATH: '/tmp',
            HOST: '0.0.0.0'
        },
        LOCAL: {
            NAME: 'Local Development',
            ENV_VARS: ['SCANNER_PASSWORD', 'MONGODB_URI', 'SESSION_ENCRYPTION_KEY'],
            PORT: 3000,
            DISK_PATH: './savage_auth',
            HOST: 'localhost'
        }
    },
    
    // Environment detection
    getCurrentPlatform() {
        if (process.env.RENDER) return this.PLATFORMS.RENDER;
        if (process.env.HEROKU) return this.PLATFORMS.HEROKU;
        return this.PLATFORMS.LOCAL;
    },
    
    // Check if all required environment variables are set
    validateEnvironment() {
        const platform = this.getCurrentPlatform();
        const missingVars = platform.ENV_VARS.filter(varName => !process.env[varName]);
        
        if (missingVars.length > 0) {
            console.warn(`⚠️ Missing environment variables: ${missingVars.join(', ')}`);
            return false;
        }
        
        return true;
    }
};

// =============================================================================
// 📊 LOGGING & MONITORING
// =============================================================================
const LOGGING = {
    LEVELS: {
        ERROR: 0,
        WARN: 1,
        INFO: 2,
        DEBUG: 3
    },
    
    // Log formats
    FORMATS: {
        CONSOLE: '🦅 [SAVAGE] {timestamp} {level}: {message}',
        FILE: '{timestamp} | {level} | {message}'
    },
    
    // Log files
    FILES: {
        ERROR: '/tmp/savage-error.log',
        COMBINED: '/tmp/savage-combined.log',
        ACCESS: '/tmp/savage-access.log'
    }
};

// =============================================================================
// 🎯 EXPORT ALL CONFIGURATIONS
// =============================================================================
module.exports = {
    SCANNER_IDENTITY,
    SECURITY_CONFIG,
    WHATSAPP_CONFIG,
    DATABASE_CONFIG,
    SERVER_CONFIG,
    BOT_CONFIG,
    UI_CONFIG,
    MESSAGES,
    DEPLOYMENT,
    LOGGING,
    
    // Utility functions
    generateSessionId() {
        const crypto = require('crypto');
        const timestamp = Date.now().toString(36);
        const random = crypto.randomBytes(8).toString('hex');
        const uuid = require('uuid').v4().replace(/-/g, '').substring(0, 16);
        
        return `savage-${timestamp}-${random}-${uuid}`.toLowerCase();
    },
    
    // ✅ UPDATED: Generate 8-digit pairing code (manual-only)
    generatePairingCode(phoneNumber = null) {
        // ✅ CHANGED: Phone number is now required for manual-only mode
        if (!phoneNumber || phoneNumber.trim() === '') {
            return null; // Return null if no phone number
        }
        
        const crypto = require('crypto');
        const numbers = '0123456789';
        let code = '';
        
        for (let i = 0; i < WHATSAPP_CONFIG.PAIRING.LENGTH; i++) {
            const randomIndex = crypto.randomInt(0, numbers.length);
            code += numbers[randomIndex];
        }
        
        return code;
    },
    
    // ✅ UPDATED: Validate phone number for pairing (required)
    isValidPhoneNumber(phone) {
        if (!phone || phone.trim() === '') return false; // ✅ CHANGED: No longer allow empty
        const phoneRegex = /^\+?[1-9]\d{1,14}$/;
        return phoneRegex.test(phone.replace(/\s/g, ''));
    },
    
    // Get bot configuration by name
    getBotConfig(botName) {
        return SCANNER_IDENTITY.BOTS[botName] || null;
    },
    
    // Validate session ID format
    isValidSessionId(sessionId) {
        return sessionId && sessionId.startsWith('savage-') && sessionId.length > 20;
    },
    
    // Get current platform configuration
    getPlatformConfig() {
        return DEPLOYMENT.getCurrentPlatform();
    },
    
    // ✅ ADDED: Check if WhatsApp is properly configured
    isWhatsAppConfigured() {
        return WHATSAPP_CONFIG && WHATSAPP_CONFIG.BAILEYS && WHATSAPP_CONFIG.BAILEYS.VERSION;
    },
    
    // ✅ ADDED: Get connection timeout settings
    getConnectionTimeout() {
        return WHATSAPP_CONFIG.SCANNER.CONNECTION_TIMEOUT;
    },
    
    // ✅ ADDED: Get reconnection settings
    getReconnectionSettings() {
        return {
            maxAttempts: WHATSAPP_CONFIG.SCANNER.MAX_RECONNECT_ATTEMPTS,
            delay: WHATSAPP_CONFIG.SCANNER.RECONNECT_DELAY,
            autoReconnect: WHATSAPP_CONFIG.SCANNER.AUTO_RECONNECT
        };
    },
    
    // ✅ ADDED: Get QR regeneration settings
    getQRRegenerationSettings() {
        return {
            interval: WHATSAPP_CONFIG.QR.REGENERATION_INTERVAL,
            maxAttempts: WHATSAPP_CONFIG.QR.MAX_REGENERATION_ATTEMPTS,
            notify: WHATSAPP_CONFIG.QR.NOTIFY_ON_REFRESH
        };
    },
    
    // ✅ UPDATED: Get pairing code settings (manual-only)
    getPairingCodeSettings() {
        return {
            length: WHATSAPP_CONFIG.PAIRING.LENGTH,
            timeout: WHATSAPP_CONFIG.PAIRING.TIMEOUT,
            allowManual: WHATSAPP_CONFIG.PAIRING.ALLOW_MANUAL_GENERATION,
            requirePhone: WHATSAPP_CONFIG.PAIRING.REQUIRE_PHONE_NUMBER, // ✅ CHANGED: Now true
            autoGenerate: WHATSAPP_CONFIG.PAIRING.AUTO_GENERATE_WITH_QR, // ✅ CHANGED: Now false
            mode: WHATSAPP_CONFIG.PAIRING.MODE // ✅ ADDED: Manual-only mode
        };
    },
    
    // ✅ ADDED: Check if manual-only pairing mode is enabled
    isManualPairingMode() {
        return WHATSAPP_CONFIG.PAIRING.MODE === 'MANUAL-ONLY';
    },
    
    // ✅ ADDED: Get manual pairing mode configuration
    getManualPairingConfig() {
        return {
            enabled: WHATSAPP_CONFIG.PAIRING.MODE === 'MANUAL-ONLY',
            phoneRequired: WHATSAPP_CONFIG.PAIRING.REQUIRE_PHONE_NUMBER,
            codeLength: WHATSAPP_CONFIG.PAIRING.LENGTH,
            noAutoCodes: !WHATSAPP_CONFIG.PAIRING.AUTO_GENERATE_WITH_QR
        };
    }
};
