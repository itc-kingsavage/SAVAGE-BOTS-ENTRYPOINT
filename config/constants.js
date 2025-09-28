/**
 * 🦅 SAVAGE BOTS SCANNER - Constants & Configuration
 * Centralized configuration for SAVAGE BOTS ecosystem
 */

const path = require('path');

// =============================================================================
// 🦅 SCANNER IDENTITY & BRANDING
// =============================================================================
const SCANNER_IDENTITY = {
    NAME: 'SAVAGE BOTS SCANNER',
    VERSION: '1.0.0',
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
// 📱 WHATSAPP BAILEYS CONFIGURATION
// =============================================================================
const WHATSAPP_CONFIG = {
    // Baileys connection settings
    BAILEYS: {
        VERSION: '2.2412.54',
        BROWSER: ['Ubuntu', 'Chrome', '110.0.5481.100'],
        SYNC_FULL_HISTORY: false,
        MARK_ONLINE_ON_CONNECT: false,
        LINK_PREVIEW_IMAGE_THUMBNAIL_WIDTH: 192,
        TRANSACTION_STATUS: {
            PENDING: 'PENDING',
            SUCCESS: 'SUCCESS',
            FAILED: 'FAILED'
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
    
    // QR Code settings
    QR: {
        WIDTH: 300,
        MARGIN: 2,
        COLOR: {
            DARK: '#00FF00', // Matrix green
            LIGHT: '#000000' // Black
        },
        TIMEOUT: 300000, // 5 minutes
        REGENERATE_INTERVAL: 60000 // 1 minute
    },
    
    // Pairing code settings
    PAIRING: {
        LENGTH: 6,
        CHARSET: '0123456789',
        TIMEOUT: 300000, // 5 minutes
        MAX_ATTEMPTS: 3
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
            STATS: 'savage_stats'
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
            'http://127.0.0.1:3000'
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
            ERROR: 'error'
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
        SUCCESS: '#00FF00'     // Green
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
    
    // Scanner interface
    SCANNER: {
        QR_SIZE: 300,
        STATUS_REFRESH: 5000, // 5 seconds
        AUTO_RECONNECT: true,
        CONNECTION_TIMEOUT: 300000 // 5 minutes
    }
};

// =============================================================================
// 📧 MESSAGES & CONTENT
// =============================================================================
const MESSAGES = {
    // Connection flow messages
    CONNECTION: {
        SYNCING: '🦅 SAVAGE BOTS SCANNER - Syncing with WhatsApp...',
        SUCCESS: '✅ Connection established successfully!',
        FAILED: '❌ Connection failed. Please try again.',
        TIMEOUT: '⏰ Connection timeout. Regenerating QR code...'
    },
    
    // Introduction messages (sent after successful connection)
    INTRODUCTION: [
        `🦅 *SAVAGE BOTS SCANNER ACTIVATED*\n` +
        `Multi-Bot WhatsApp System Ready!\n` +
        `Version: ${SCANNER_IDENTITY.VERSION}\n` +
        `Code Name: ${SCANNER_IDENTITY.CODE_NAME}`,
        
        `🔐 *SESSION SECURE*\n` +
        `Encrypted connection established\n` +
        `Session ID: [AUTO-GENERATED]\n` +
        `Bots can now connect using session credentials`,
        
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
        BOT_CONNECTION_FAILED: '🤖 Bot connection failed. Check session ID and try again.'
    }
};

// =============================================================================
// 🚀 DEPLOYMENT & ENVIRONMENT
// =============================================================================
const DEPLOYMENT = {
    // Supported platforms
    PLATFORMS: {
        RENDER: {
            NAME: 'render',
            ENV_VARS: ['SCANNER_PASSWORD', 'MONGODB_URI', 'SESSION_ENCRYPTION_KEY'],
            PORT: 10000,
            DISK_PATH: '/tmp'
        },
        HEROKU: {
            NAME: 'heroku', 
            ENV_VARS: ['SCANNER_PASSWORD', 'MONGODB_URI', 'SESSION_ENCRYPTION_KEY'],
            PORT: process.env.PORT || 3000,
            DISK_PATH: '/tmp'
        },
        LOCAL: {
            NAME: 'local',
            ENV_VARS: ['SCANNER_PASSWORD', 'MONGODB_URI', 'SESSION_ENCRYPTION_KEY'],
            PORT: 3000,
            DISK_PATH: './sessions'
        }
    },
    
    // Environment detection
    getCurrentPlatform() {
        if (process.env.RENDER) return DEPLOYMENT.PLATFORMS.RENDER;
        if (process.env.HEROKU) return DEPLOYMENT.PLATFORMS.HEROKU;
        return DEPLOYMENT.PLATFORMS.LOCAL;
    },
    
    // Check if all required environment variables are set
    validateEnvironment() {
        const platform = this.getCurrentPlatform();
        const missingVars = platform.ENV_VARS.filter(varName => !process.env[varName]);
        
        if (missingVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
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
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const timestamp = Math.floor(Date.now() / 1000);
        
        let randomPart1 = '';
        let randomPart2 = '';
        
        for (let i = 0; i < 12; i++) {
            randomPart1 += chars.charAt(Math.floor(Math.random() * chars.length));
            randomPart2 += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        
        return `${BOT_CONFIG.AUTH.SESSION_ID_PREFIX}-${randomPart1}-${timestamp}-${randomPart2}`;
    },
    
    // Get bot configuration by name
    getBotConfig(botName) {
        return SCANNER_IDENTITY.BOTS[botName] || null;
    },
    
    // Validate session ID format
    isValidSessionId(sessionId) {
        const pattern = /^SAVAGE-XMD-BOT-SESSION-[A-Z0-9]{12}-\d{10}-[A-Z0-9]{12}$/;
        return pattern.test(sessionId);
    },
    
    // Get current platform configuration
    getPlatformConfig() {
        return DEPLOYMENT.getCurrentPlatform();
    }
};
