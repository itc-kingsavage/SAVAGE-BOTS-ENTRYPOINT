/**
 * 🦅 SAVAGE BOTS SCANNER - Main Server File
 * Multi-bot WhatsApp scanner with hacker theme
 * COMPATIBLE with Baileys v6+
 * UPDATED: Manual-Only Pairing Codes + QR Regeneration + LIVE FUNCTIONS
 */

const express = require('express');
const socketIo = require('socket.io');
const http = require('http');
const path = require('path');
const qrcode = require('qrcode');
const axios = require('axios'); // ✅ ADDED: For live functions

// Core systems
const savageDatabase = require('./config/database');
const savageSessionManager = require('./auth/sessionManager');
const savagePasswordAuth = require('./auth/passwordAuth');
const { generateSessionId, generatePairingCode } = require('./utils/generators');
const { SCANNER_IDENTITY, WHATSAPP_CONFIG, SERVER_CONFIG, MESSAGES, DEPLOYMENT } = require('./config/constants');

// ✅ ADDED: Live Functions Configuration
const LIVE_FUNCTIONS_CONFIG = {
    BASE_URL: 'https://savage-bots-functions.onrender.com',
    ENDPOINTS: {
        SAVAGE_X: '/savage-x',
        DE_UNKNOWN: '/de-unknown', 
        QUEEN_RIXIE: '/queen-rixie'
    },
    TIMEOUT: 10000
};

class SavageBotsScanner {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: SERVER_CONFIG.CORS.origin,
                methods: SERVER_CONFIG.CORS.methods
            }
        });
        
        this.client = null;
        this.isAuthenticated = false;
        this.currentQR = null;
        this.currentPairingCode = null;
        this.sessionId = null;
        this.connectedBots = new Set();
        this.whatsappAvailable = false;
        this.currentPhoneNumber = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        
        // QR Code Persistence & Regeneration
        this.qrTimeout = null;
        this.qrRegenerationInterval = null;
        this.qrExpiryTime = WHATSAPP_CONFIG.QR.TIMEOUT;
        this.qrRegenerationIntervalMs = WHATSAPP_CONFIG.QR.REGENERATION_INTERVAL;
        
        // Manual-Only Pairing Code System
        this.pairingCodes = new Map();
        this.activePairingCode = null;
        this.pairingCodeExpiry = WHATSAPP_CONFIG.PAIRING.TIMEOUT;

        // ✅ ADDED: Live Functions Client
        this.functionsClient = axios.create({
            baseURL: LIVE_FUNCTIONS_CONFIG.BASE_URL,
            timeout: LIVE_FUNCTIONS_CONFIG.TIMEOUT,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': `SavageScanner/${SCANNER_IDENTITY.VERSION}`
            }
        });
        
        this.initializeScanner();
    }

    /**
     * 🎯 Initialize the complete scanner system
     */
    async initializeScanner() {
        try {
            console.log('🦅 ============================================================');
            console.log('🦅 SAVAGE BOTS SCANNER - INITIALIZING');
            console.log('🦅 ============================================================');
            console.log(`🦅 Version: ${SCANNER_IDENTITY.VERSION}`);
            console.log(`🦅 Platform: ${DEPLOYMENT.getCurrentPlatform().NAME}`);
            console.log(`🦅 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`🦅 Pairing Mode: MANUAL-ONLY (${WHATSAPP_CONFIG.PAIRING.LENGTH}-digit)`);
            console.log(`🦅 Functions: LIVE @ ${LIVE_FUNCTIONS_CONFIG.BASE_URL}`); // ✅ ADDED
            console.log('🦅 ============================================================');

            // Test live functions connection
            await this.testLiveFunctionsConnection();

            // Initialize core systems in sequence
            await this.initializeDatabase();
            await this.setupExpress();
            await this.setupWebSocket();
            
            // Start server FIRST
            this.startServer();
            
            // Then initialize WhatsApp (non-blocking)
            this.initializeWhatsApp().catch(error => {
                console.error('❌ [SCANNER] WhatsApp initialization failed, running in limited mode:', error.message);
                this.whatsappAvailable = false;
                
                this.io.emit('status_update', {
                    status: 'whatsapp_unavailable',
                    message: 'WhatsApp connection failed - Scanner running in limited mode'
                });
            });
            
        } catch (error) {
            console.error('💥 [SCANNER] Initialization failed:', error);
            console.log('⚠️ [SCANNER] Running in limited mode - Core systems available');
        }
    }

    /**
     * ✅ ADDED: Test live functions connection
     */
    async testLiveFunctionsConnection() {
        try {
            console.log('🌐 [SCANNER] Testing live functions connection...');
            const response = await this.functionsClient.get('/');
            console.log('✅ [SCANNER] Live functions connected successfully');
            console.log(`📡 [SCANNER] Functions status: ${response.data?.status || 'Connected'}`);
            return true;
        } catch (error) {
            console.error('❌ [SCANNER] Live functions connection failed:', error.message);
            console.warn('⚠️ [SCANNER] Bot commands will use fallback responses');
            return false;
        }
    }

    /**
     * 🗄️ Initialize database connection
     */
    async initializeDatabase() {
        try {
            console.log('🗄️ [SCANNER] Connecting to MongoDB Atlas...');
            await savageDatabase.connect();
            console.log('✅ [SCANNER] MongoDB connected successfully');
        } catch (error) {
            console.error('❌ [SCANNER] Database connection failed:', error.message);
            console.warn('⚠️ [SCANNER] Running without database persistence');
        }
    }

    /**
     * 🌐 Setup Express server with static files
     */
    async setupExpress() {
        try {
            // Middleware
            this.app.use(express.json());
            this.app.use(express.urlencoded({ extended: true }));
            this.app.use(express.static(path.join(__dirname, 'public'), {
                maxAge: SERVER_CONFIG.STATIC.MAX_AGE
            }));

            // Basic routes
            this.setupBasicRoutes();
            
            console.log('✅ [SCANNER] Express server setup completed');
        } catch (error) {
            console.error('❌ [SCANNER] Express setup failed:', error);
            throw error;
        }
    }

    /**
     * 🛣️ Setup basic routes - ✅ UPDATED: Added functions endpoints
     */
    setupBasicRoutes() {
        // Password portal
        this.app.get('/', (req, res) => {
            res.redirect('/password');
        });

        this.app.get('/password', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'password.html'));
        });

        // Scanner interface
        this.app.get('/scanner', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'scanner.html'));
        });

        // ✅ ADDED: Functions proxy endpoints
        this.app.post('/api/functions/:botType', async (req, res) => {
            try {
                const { botType } = req.params;
                const { command, args, message } = req.body;

                console.log(`🤖 [FUNCTIONS] ${botType} command: ${command}`);

                const result = await this.callLiveFunction(botType, command, args, message);
                res.json(result);
            } catch (error) {
                console.error('❌ [FUNCTIONS] API call failed:', error);
                res.json({
                    success: false,
                    error: 'Functions service unavailable',
                    fallback: true
                });
            }
        });

        // ✅ ADDED: Functions health check
        this.app.get('/api/functions-health', async (req, res) => {
            try {
                const response = await this.functionsClient.get('/');
                res.json({
                    status: 'connected',
                    url: LIVE_FUNCTIONS_CONFIG.BASE_URL,
                    response: response.data,
                    timestamp: new Date()
                });
            } catch (error) {
                res.json({
                    status: 'disconnected',
                    error: error.message,
                    timestamp: new Date()
                });
            }
        });

        // Logout endpoint
        this.app.post('/logout', (req, res) => {
            try {
                // Clear server-side authentication
                this.isAuthenticated = false;
                this.sessionId = null;
                this.currentPhoneNumber = null;
                this.currentQR = null;
                this.currentPairingCode = null;
                this.activePairingCode = null;
                
                // Clear pairing codes
                this.pairingCodes.clear();
                
                // Clear WhatsApp connection
                if (this.client) {
                    this.client.logout();
                    this.client = null;
                }
                
                // Clear QR timeouts
                this.clearQRTimeouts();
                
                // Reset reconnect attempts
                this.reconnectAttempts = 0;
                
                // Notify all clients
                this.io.emit('logout', { message: 'Logged out successfully' });
                
                // Restart WhatsApp connection for new QR
                setTimeout(() => {
                    this.initializeWhatsApp().catch(console.error);
                }, 2000);
                
                res.json({ success: true, message: 'Logged out successfully' });
            } catch (error) {
                console.error('❌ [SCANNER] Logout failed:', error);
                res.json({ success: false, error: 'Logout failed' });
            }
        });

        // API endpoints
        this.app.post('/verify-password', async (req, res) => {
            try {
                const { password } = req.body;
                const clientIP = req.ip || req.connection.remoteAddress;
                
                const result = await savagePasswordAuth.validatePassword(password, clientIP);
                res.json(result);
            } catch (error) {
                res.json({ 
                    success: false, 
                    error: 'Authentication system error' 
                });
            }
        });

        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'operational',
                version: SCANNER_IDENTITY.VERSION,
                platform: DEPLOYMENT.getCurrentPlatform().NAME,
                whatsapp: this.whatsappAvailable,
                authenticated: this.isAuthenticated,
                functions: LIVE_FUNCTIONS_CONFIG.BASE_URL, // ✅ ADDED
                timestamp: new Date(),
                pairingCodes: {
                    active: this.pairingCodes.size,
                    length: WHATSAPP_CONFIG.PAIRING.LENGTH,
                    mode: 'MANUAL-ONLY'
                }
            });
        });

        // Status endpoint
        this.app.get('/status', (req, res) => {
            res.json({
                scanner: 'running',
                whatsapp: this.whatsappAvailable,
                authenticated: this.isAuthenticated,
                sessionId: this.sessionId,
                connectedBots: Array.from(this.connectedBots),
                currentPhoneNumber: this.currentPhoneNumber,
                hasQr: !!this.currentQR,
                currentPairingCode: this.currentPairingCode,
                pairingCodesActive: this.pairingCodes.size,
                pairingMode: 'MANUAL-ONLY',
                functions: LIVE_FUNCTIONS_CONFIG.BASE_URL, // ✅ ADDED
                timestamp: new Date()
            });
        });

        // Force QR regeneration
        this.app.post('/refresh-qr', (req, res) => {
            try {
                if (this.client) {
                    this.client.logout();
                    this.client = null;
                }
                
                this.isAuthenticated = false;
                this.sessionId = null;
                this.currentPhoneNumber = null;
                this.currentQR = null;
                this.currentPairingCode = null;
                this.activePairingCode = null;
                this.reconnectAttempts = 0;
                
                // Clear existing timeouts
                this.clearQRTimeouts();
                
                // Restart WhatsApp connection
                setTimeout(() => {
                    this.initializeWhatsApp().catch(console.error);
                }, 1000);
                
                res.json({ success: true, message: 'QR code refresh initiated' });
            } catch (error) {
                res.json({ success: false, error: 'Failed to refresh QR' });
            }
        });

        // Generate 8-digit pairing code ONLY with phone number
        this.app.post('/generate-pairing-code', (req, res) => {
            try {
                const { phoneNumber } = req.body;
                
                if (!phoneNumber || phoneNumber.trim() === '') {
                    return res.json({ 
                        success: false, 
                        error: 'Phone number is required to generate pairing code' 
                    });
                }

                if (!this.isValidPhoneNumber(phoneNumber)) {
                    return res.json({ 
                        success: false, 
                        error: 'Invalid phone number format. Use international format: +1234567890' 
                    });
                }

                // Generate 8-digit pairing code
                const pairingCode = this.generateEightDigitPairingCode();
                
                // Store pairing code with metadata
                this.pairingCodes.set(pairingCode, {
                    phoneNumber: phoneNumber,
                    generatedAt: Date.now(),
                    expiresAt: Date.now() + WHATSAPP_CONFIG.PAIRING.TIMEOUT,
                    used: false,
                    isManual: true
                });

                // Set as current pairing code
                this.currentPairingCode = pairingCode;
                this.activePairingCode = pairingCode;

                console.log(`🔢 [SCANNER] Manual 8-digit pairing code generated for ${phoneNumber}: ${pairingCode}`);

                // Broadcast to all clients
                this.io.emit('pairing_code_generated', {
                    success: true,
                    pairingCode: pairingCode,
                    phoneNumber: phoneNumber,
                    message: `8-digit pairing code generated for ${phoneNumber}`,
                    timestamp: new Date(),
                    isManual: true,
                    length: WHATSAPP_CONFIG.PAIRING.LENGTH
                });

                res.json({
                    success: true,
                    pairingCode: pairingCode,
                    phoneNumber: phoneNumber,
                    message: `8-digit pairing code generated for ${phoneNumber}`,
                    length: WHATSAPP_CONFIG.PAIRING.LENGTH
                });

            } catch (error) {
                console.error('❌ [SCANNER] Pairing code generation failed:', error);
                res.json({ success: false, error: 'Failed to generate pairing code' });
            }
        });

        // Get pairing code status
        this.app.get('/pairing-status', (req, res) => {
            const activeCodes = Array.from(this.pairingCodes.entries()).map(([code, data]) => ({
                code,
                phoneNumber: data.phoneNumber,
                generatedAt: new Date(data.generatedAt).toISOString(),
                expiresAt: new Date(data.expiresAt).toISOString(),
                used: data.used,
                isManual: data.isManual
            }));

            res.json({
                activeCodes: activeCodes,
                totalActive: this.pairingCodes.size,
                currentPairingCode: this.currentPairingCode,
                config: {
                    length: WHATSAPP_CONFIG.PAIRING.LENGTH,
                    timeout: WHATSAPP_CONFIG.PAIRING.TIMEOUT,
                    mode: 'MANUAL-ONLY'
                }
            });
        });
    }

    /**
     * ✅ ADDED: Call live functions
     */
    async callLiveFunction(botType, command, args, message) {
        try {
            const endpoint = LIVE_FUNCTIONS_CONFIG.ENDPOINTS[botType.toUpperCase()];
            if (!endpoint) {
                throw new Error(`Unknown bot type: ${botType}`);
            }

            const response = await this.functionsClient.post(endpoint, {
                command,
                args,
                message,
                timestamp: new Date().toISOString()
            });

            return response.data;
        } catch (error) {
            console.error(`❌ [FUNCTIONS] ${botType} command failed:`, error.message);
            
            // Fallback responses when functions are unavailable
            return this.getFallbackResponse(botType, command, args);
        }
    }

    /**
     * ✅ ADDED: Fallback responses when functions are down
     */
    getFallbackResponse(botType, command, args) {
        const fallbacks = {
            'savage-x': {
                'menu': `🦅 SAVAGE-X BOT (Fallback Mode)\n\n📱 GENERAL: weather, currency, calc\n🤖 AI: chatgpt, imageai\n🎮 FUN: truth, dare, joke\n⚙️ BOT: stats, autoreply\n\n🔧 Functions service temporarily unavailable`,
                'ping': `🏓 Pong! Savage-X Active (Fallback)\n⏰ ${new Date().toLocaleString()}`,
                'stats': `📊 BOT STATS (Fallback):\n• Status: Online (Limited)\n• Functions: Unavailable\n• Mode: Fallback Responses`
            },
            'de-unknown': {
                'menu': `🔮 DE-UNKNOWN (Fallback Mode)\n\n🕵️ MYSTERY: mystery, discover\n🧩 PUZZLES: puzzle, riddle\n🔮 FORTUNE: predict, fortune\n\n🔧 Functions service temporarily unavailable`,
                'mystery': `🔍 Exploring mysteries... (Fallback Mode)`
            },
            'queen-rixie': {
                'menu': `👑 QUEEN RIXIE (Fallback Mode)\n\n🎭 ROYALTY: royal, bow, rank\n🏛️ COURT: court, favor\n🎪 EVENTS: banquet, ball\n\n🔧 Functions service temporarily unavailable`,
                'royal': `📜 Royal decree processing... (Fallback Mode)`
            }
        };

        const botFallback = fallbacks[botType] || {};
        const response = botFallback[command] || `❌ Command not available in fallback mode: $${command}`;

        return {
            success: true,
            response: response,
            fallback: true,
            timestamp: new Date().toISOString()
        };
    }

    // ... (KEEP ALL YOUR EXISTING METHODS EXACTLY AS THEY ARE)
    // Only the new methods above were added, everything else remains unchanged

    /**
     * 🔌 Setup WebSocket communication - ✅ UPDATED: Added functions handling
     */
    setupWebSocket() {
        this.io.on('connection', (socket) => {
            console.log(`🤖 [SCANNER] New client connected: ${socket.id}`);
            
            // Send current status immediately
            const status = {
                scanner: 'running',
                whatsapp: this.whatsappAvailable,
                authenticated: this.isAuthenticated,
                hasQr: !!this.currentQR,
                sessionId: this.sessionId,
                currentPhoneNumber: this.currentPhoneNumber,
                currentPairingCode: this.currentPairingCode,
                pairingCodesActive: this.pairingCodes.size,
                pairingCodeLength: WHATSAPP_CONFIG.PAIRING.LENGTH,
                pairingMode: 'MANUAL-ONLY',
                functions: LIVE_FUNCTIONS_CONFIG.BASE_URL // ✅ ADDED
            };
            
            socket.emit('scanner_status', status);

            if (this.isAuthenticated && this.sessionId) {
                socket.emit('ready', {
                    status: 'connected',
                    sessionId: this.sessionId,
                    phoneNumber: this.currentPhoneNumber,
                    message: 'Scanner is active and ready',
                    pairingCodeLength: WHATSAPP_CONFIG.PAIRING.LENGTH,
                    pairingMode: 'MANUAL-ONLY',
                    functions: LIVE_FUNCTIONS_CONFIG.BASE_URL // ✅ ADDED
                });
            } else if (this.currentQR) {
                // Send QR code if available
                socket.emit('qr_data', {
                    qrImage: this.currentQR,
                    pairingCode: null,
                    timestamp: Date.now(),
                    pairingCodeLength: WHATSAPP_CONFIG.PAIRING.LENGTH,
                    pairingMode: 'MANUAL-ONLY'
                });
            }

            // ✅ ADDED: Handle bot command execution via live functions
            socket.on('execute_command', async (data) => {
                try {
                    const { botType, command, args, message } = data;
                    console.log(`🤖 [WS-FUNCTIONS] ${botType} command: ${command}`);

                    const result = await this.callLiveFunction(botType, command, args, message);
                    socket.emit('command_result', result);
                } catch (error) {
                    console.error('❌ [WS-FUNCTIONS] Command execution failed:', error);
                    socket.emit('command_result', {
                        success: false,
                        error: 'Command execution failed',
                        fallback: true
                    });
                }
            });

            // Refresh QR code request
            socket.on('refresh_qr', () => {
                console.log(`🔄 [SCANNER] QR refresh requested by: ${socket.id}`);
                
                if (this.client) {
                    this.client.logout();
                    this.client = null;
                }
                
                this.isAuthenticated = false;
                this.sessionId = null;
                this.currentPhoneNumber = null;
                this.currentQR = null;
                this.currentPairingCode = null;
                this.activePairingCode = null;
                this.reconnectAttempts = 0;
                
                // Clear QR timeouts
                this.clearQRTimeouts();
                
                // Restart WhatsApp connection
                setTimeout(() => {
                    this.initializeWhatsApp().catch(console.error);
                }, 1000);
                
                socket.emit('qr_refreshed', {
                    success: true,
                    message: 'QR code refresh initiated'
                });
            });

            // Generate 8-digit pairing code ONLY when phone number provided
            socket.on('generate_pairing_code', (data) => {
                try {
                    const { phoneNumber } = data;
                    
                    if (!phoneNumber || phoneNumber.trim() === '') {
                        socket.emit('pairing_code_error', {
                            error: 'Phone number is required to generate pairing code'
                        });
                        return;
                    }

                    if (!this.isValidPhoneNumber(phoneNumber)) {
                        socket.emit('pairing_code_error', {
                            error: 'Invalid phone number format. Use international format: +1234567890'
                        });
                        return;
                    }

                    // Generate 8-digit pairing code
                    const pairingCode = this.generateEightDigitPairingCode();
                    
                    // Store pairing code with metadata
                    this.pairingCodes.set(pairingCode, {
                        phoneNumber: phoneNumber,
                        generatedAt: Date.now(),
                        expiresAt: Date.now() + WHATSAPP_CONFIG.PAIRING.TIMEOUT,
                        used: false,
                        isManual: true
                    });

                    // Set as current pairing code
                    this.currentPairingCode = pairingCode;
                    this.activePairingCode = pairingCode;

                    console.log(`🔢 [SCANNER] Manual 8-digit pairing code generated for ${phoneNumber}: ${pairingCode}`);

                    // Broadcast to all clients
                    this.io.emit('pairing_code_generated', {
                        success: true,
                        pairingCode: pairingCode,
                        phoneNumber: phoneNumber,
                        message: `8-digit pairing code generated for ${phoneNumber}`,
                        timestamp: new Date(),
                        isManual: true,
                        length: WHATSAPP_CONFIG.PAIRING.LENGTH
                    });

                    socket.emit('pairing_code_generated', {
                        success: true,
                        pairingCode: pairingCode,
                        phoneNumber: phoneNumber,
                        message: `8-digit pairing code generated for ${phoneNumber}`
                    });

                } catch (error) {
                    console.error('❌ [SCANNER] Pairing code generation failed:', error);
                    socket.emit('pairing_code_error', {
                        error: 'Failed to generate pairing code'
                    });
                }
            });

            // Handle logout request
            socket.on('logout_request', async () => {
                try {
                    console.log(`🚪 [SCANNER] Logout requested by: ${socket.id}`);
                    
                    // Clear server state
                    this.isAuthenticated = false;
                    this.sessionId = null;
                    this.currentPhoneNumber = null;
                    this.currentQR = null;
                    this.currentPairingCode = null;
                    this.activePairingCode = null;
                    this.connectedBots.clear();
                    this.reconnectAttempts = 0;
                    
                    // Clear QR timeouts and pairing codes
                    this.clearQRTimeouts();
                    this.pairingCodes.clear();
                    
                    // Logout from WhatsApp
                    if (this.client) {
                        await this.client.logout();
                        this.client = null;
                    }
                    
                    this.whatsappAvailable = false;
                    
                    // Notify client
                    socket.emit('logout_success', {
                        success: true,
                        message: 'Successfully logged out'
                    });
                    
                    // Broadcast to all clients
                    this.io.emit('logout', {
                        message: 'Scanner has been logged out'
                    });
                    
                    // Restart WhatsApp for new QR
                    setTimeout(() => {
                        this.initializeWhatsApp().catch(console.error);
                    }, 3000);
                    
                    console.log('✅ [SCANNER] Logout completed successfully');
                    
                } catch (error) {
                    console.error('❌ [SCANNER] Logout failed:', error);
                    socket.emit('logout_success', {
                        success: false,
                        error: 'Logout failed'
                    });
                }
            });

            // Handle bot registration
            socket.on('bot_register', (data) => {
                const { botName, sessionId } = data;
                
                if (sessionId === this.sessionId) {
                    this.connectedBots.add(botName);
                    console.log(`✅ [SCANNER] Bot connected: ${botName}`);
                    
                    this.io.emit('bot_status', {
                        botName: botName,
                        status: 'online',
                        lastSeen: new Date()
                    });
                    
                    socket.emit('bot_registered', {
                        success: true,
                        message: `Bot ${botName} registered successfully`
                    });
                } else {
                    socket.emit('bot_registered', {
                        success: false,
                        error: 'Invalid session ID'
                    });
                }
            });

            // Handle messages from bots to send via WhatsApp
            socket.on('send_message', async (data) => {
                try {
                    const { chatId, message, botName } = data;
                    
                    if (this.client && this.isAuthenticated) {
                        await this.client.sendMessage(chatId, { text: message });
                        console.log(`📤 [SCANNER] Message sent by ${botName} to ${chatId}`);
                        
                        socket.emit('message_sent', {
                            success: true,
                            messageId: Date.now().toString()
                        });
                    } else {
                        socket.emit('message_sent', {
                            success: false,
                            error: 'WhatsApp not connected'
                        });
                    }
                } catch (error) {
                    console.error('❌ [SCANNER] Message send failed:', error);
                    socket.emit('message_sent', {
                        success: false,
                        error: 'Failed to send message'
                    });
                }
            });

            // Handle authentication requests
            socket.on('authenticate', async (data) => {
                const result = await savagePasswordAuth.validatePassword(
                    data.password, 
                    socket.handshake.address
                );
                socket.emit('auth_result', result);
            });

            // Handle status requests
            socket.on('get_status', () => {
                const status = {
                    scanner: 'running',
                    whatsapp: this.whatsappAvailable,
                    authenticated: this.isAuthenticated,
                    sessionId: this.sessionId,
                    connectedBots: Array.from(this.connectedBots),
                    currentPhoneNumber: this.currentPhoneNumber,
                    hasQr: !!this.currentQR,
                    currentPairingCode: this.currentPairingCode,
                    pairingCodesActive: this.pairingCodes.size,
                    pairingCodeLength: WHATSAPP_CONFIG.PAIRING.LENGTH,
                    pairingMode: 'MANUAL-ONLY',
                    functions: LIVE_FUNCTIONS_CONFIG.BASE_URL, // ✅ ADDED
                    timestamp: new Date()
                };
                socket.emit('scanner_status', status);
            });

            // Handle disconnect
            socket.on('disconnect', (reason) => {
                console.log(`🔌 [SCANNER] Client disconnected: ${socket.id} (Reason: ${reason})`);
            });
        });

        console.log('✅ [SCANNER] WebSocket server setup completed');
    }

    /**
     * 🚀 Start the server - ✅ UPDATED: Show functions info
     */
    startServer() {
        const port = process.env.PORT || SERVER_CONFIG.PORT;
        const host = SERVER_CONFIG.HOST;
        
        this.server.listen(port, host, () => {
            console.log('🦅 ============================================================');
            console.log('🦅 SAVAGE BOTS SCANNER - OPERATIONAL');
            console.log('🦅 ============================================================');
            console.log(`📍 Server running on: http://${host}:${port}`);
            console.log(`🔐 Password protected: http://${host}:${port}/password`);
            console.log(`📱 Scanner interface: http://${host}:${port}/scanner`);
            console.log(`🤖 Bots supported: SAVAGE-X, DE-UKNOWN-BOT, QUEEN-RIXIE`);
            console.log(`🌐 Live functions: ${LIVE_FUNCTIONS_CONFIG.BASE_URL}`); // ✅ ADDED
            console.log(`🔢 Pairing codes: ${WHATSAPP_CONFIG.PAIRING.LENGTH}-digit MANUAL-ONLY system`);
            console.log(`📱 QR codes: Auto-regeneration every ${this.qrRegenerationIntervalMs}ms`);
            console.log(`🔄 Manual pairing: Phone number REQUIRED for pairing codes`);
            console.log(`🦅 ${SCANNER_IDENTITY.MOTTO}`);
            console.log('🦅 ============================================================');
        });
    }

    // ... (ALL YOUR EXISTING METHODS REMAIN EXACTLY THE SAME)
    // Only the new integration methods were added above

    isValidPhoneNumber(phone) {
        if (!phone || phone.trim() === '') return false;
        const phoneRegex = /^\+?[1-9]\d{1,14}$/;
        return phoneRegex.test(phone.replace(/\s/g, ''));
    }

    generateEightDigitPairingCode() {
        const crypto = require('crypto');
        const randomBytes = crypto.randomBytes(4);
        const randomNum = randomBytes.readUInt32BE(0);
        return (randomNum % 90000000 + 10000000).toString();
    }

    clearQRTimeouts() {
        if (this.qrTimeout) {
            clearTimeout(this.qrTimeout);
            this.qrTimeout = null;
        }
        if (this.qrRegenerationInterval) {
            clearInterval(this.qrRegenerationInterval);
            this.qrRegenerationInterval = null;
        }
    }

    // ... (ALL OTHER EXISTING METHODS REMAIN UNCHANGED)
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT - Shutting down...');
    const scanner = global.savageScanner;
    if (scanner) scanner.shutdown();
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM - Shutting down...');
    const scanner = global.savageScanner;
    if (scanner) scanner.shutdown();
});

// Start the scanner
const savageScanner = new SavageBotsScanner();
global.savageScanner = savageScanner;

module.exports = SavageBotsScanner;
