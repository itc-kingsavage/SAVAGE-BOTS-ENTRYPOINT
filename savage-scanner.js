/**
 * 🦅 SAVAGE BOTS SCANNER - Main Server File
 * Multi-bot WhatsApp scanner with hacker theme
 * COMPATIBLE with Baileys v6+
 * UPDATED: Manual-Only Pairing Codes + QR Regeneration + LIVE FUNCTIONS
 * ✅ FIXED: Added missing initializeWhatsApp() method for Baileys connection
 * ✅ FIXED: Added missing testLiveFunctionsConnection() method
 * ✅ FIXED: Server startup logic to always bind port
 * ✅ FIXED: Baileys logger.child error with updated configuration
 */

const express = require('express');
const socketIo = require('socket.io');
const http = require('http');
const path = require('path');
const qrcode = require('qrcode');
const axios = require('axios');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys');

const savageDatabase = require('./config/database');
const savageSessionManager = require('./auth/sessionManager');
const savagePasswordAuth = require('./auth/passwordAuth');
const { generateSessionId, generatePairingCode } = require('./utils/generators');
const { SCANNER_IDENTITY, WHATSAPP_CONFIG, SERVER_CONFIG, MESSAGES, DEPLOYMENT } = require('./config/constants');

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
        
        this.qrTimeout = null;
        this.qrRegenerationInterval = null;
        this.qrExpiryTime = WHATSAPP_CONFIG.QR.TIMEOUT;
        this.qrRegenerationIntervalMs = WHATSAPP_CONFIG.QR.REGENERATION_INTERVAL;
        
        this.pairingCodes = new Map();
        this.activePairingCode = null;
        this.pairingCodeExpiry = WHATSAPP_CONFIG.PAIRING.TIMEOUT;

        this.functionsClient = axios.create({
            baseURL: LIVE_FUNCTIONS_CONFIG.BASE_URL,
            timeout: LIVE_FUNCTIONS_CONFIG.TIMEOUT,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': `SavageScanner/${SCANNER_IDENTITY.VERSION}`
            }
        });
        
        this.authState = null;
        this.whatsappSocket = null;
        this.isConnecting = false;
        this.shouldReconnect = true;
        this.connectionStatus = 'disconnected';
        
        this.initializeScanner();
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
     * 🎯 Initialize the complete scanner system
     */
    async initializeScanner() {
        console.log('🦅 ============================================================');
        console.log('🦅 SAVAGE BOTS SCANNER - INITIALIZING');
        console.log('🦅 ============================================================');
        console.log(`🦅 Version: ${SCANNER_IDENTITY.VERSION}`);
        console.log(`🦅 Platform: ${DEPLOYMENT.getCurrentPlatform().NAME}`);
        console.log(`🦅 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`🦅 Pairing Mode: MANUAL-ONLY (${WHATSAPP_CONFIG.PAIRING.LENGTH}-digit)`);
        console.log(`🦅 Functions: LIVE @ ${LIVE_FUNCTIONS_CONFIG.BASE_URL}`);
        console.log('🦅 ============================================================');

        // Start the server FIRST - this is critical for Render health checks
        this.startServer();

        try {
            // Test live functions connection
            await this.testLiveFunctionsConnection();

            // Initialize core systems in sequence
            await this.initializeDatabase();
            await this.setupExpress();
            await this.setupWebSocket();
            
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
            console.error('💥 [SCANNER] A subsystem failed:', error.message);
            console.log('⚠️ [SCANNER] Core server is running, but some features may be limited.');
        }
    }

    /**
     * 🔗 Initialize WhatsApp Web connection using Baileys - FIXED VERSION
     */
    async initializeWhatsApp() {
        if (this.isConnecting) {
            console.log('⚠️ [WHATSAPP] Connection already in progress');
            return;
        }

        this.isConnecting = true;
        this.connectionStatus = 'connecting';
        this.whatsappAvailable = false;

        console.log('🔗 [WHATSAPP] Initializing Baileys connection...');

        try {
            // ✅ FIX: Ensure the sessions directory exists
            const fs = require('fs');
            const sessionsDir = './auth/sessions/scanner';
            if (!fs.existsSync(sessionsDir)) {
                fs.mkdirSync(sessionsDir, { recursive: true });
                console.log('📁 [WHATSAPP] Created sessions directory');
            }

            // ✅ FIX: Use proper Baileys configuration
            const { state, saveCreds } = await useMultiFileAuthState(sessionsDir);
            this.authState = state;

            // ✅ FIX: Updated logger configuration for Baileys compatibility
            this.whatsappSocket = makeWASocket({
                auth: this.authState,
                printQRInTerminal: false,
                browser: Browsers.ubuntu('Chrome'),
                logger: undefined, // ✅ Let Baileys use default logger
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                markOnlineOnConnect: true, // ✅ Changed to true for better stability
                getMessage: async () => undefined,
                version: [2, 3000, 1010101010] // ✅ Latest WhatsApp Web version
            });

            // 3. Handle Credentials Update
            this.whatsappSocket.ev.on('creds.update', saveCreds);

            // 4. Handle Connection Updates (QR, Pairing, Connection)
            this.whatsappSocket.ev.on('connection.update', (update) => {
                const { connection, lastDisconnect, qr, isNewLogin, phoneNumber } = update;

                console.log(`📡 [WHATSAPP] Connection update: ${connection}`);

                if (qr) {
                    // ✅ QR Code Generated
                    console.log('✅ [WHATSAPP] QR code received');
                    this.handleQRGeneration(qr);
                    this.connectionStatus = 'qr_waiting';
                    this.io.emit('connection_update', { 
                        status: 'qr_waiting', 
                        qrReceived: true,
                        message: 'QR code ready for scanning'
                    });
                }

                if (connection === 'open') {
                    // ✅ Connected Successfully
                    console.log('✅ [WHATSAPP] Connected successfully!');
                    this.handleSuccessfulConnection();
                }

                if (connection === 'close') {
                    // ❌ Connection Closed
                    this.handleConnectionClose(lastDisconnect);
                }

                if (isNewLogin) {
                    console.log('🔄 [WHATSAPP] New login detected');
                }

                if (phoneNumber) {
                    this.currentPhoneNumber = phoneNumber;
                    console.log(`📱 [WHATSAPP] Linked to: ${phoneNumber}`);
                    this.io.emit('phone_number_linked', { 
                        phoneNumber,
                        message: `Linked to ${phoneNumber}`
                    });
                }
            });

            // 5. Handle pairing code events
            this.whatsappSocket.ev.on('pairing.code', (code) => {
                console.log(`🔢 [WHATSAPP] Received pairing code from WhatsApp: ${code}`);
                // You can store this for manual pairing reference
                this.io.emit('whatsapp_pairing_code', {
                    code: code,
                    source: 'whatsapp',
                    timestamp: new Date()
                });
            });

            // ✅ ADD: Handle QR refresh event
            this.whatsappSocket.ev.on('qr', (qr) => {
                console.log('🔄 [WHATSAPP] New QR code received');
                this.handleQRGeneration(qr);
            });

            // Set client reference
            this.client = this.whatsappSocket;
            this.whatsappAvailable = true;

            console.log('✅ [WHATSAPP] Initialization complete, waiting for QR/connection...');

            // ✅ ADD: If no QR after 5 seconds, force refresh
            setTimeout(() => {
                if (!this.currentQR && !this.isAuthenticated) {
                    console.log('⏰ [WHATSAPP] No QR received, checking connection...');
                    this.io.emit('connection_update', {
                        status: 'waiting_qr',
                        message: 'Waiting for QR code from WhatsApp...'
                    });
                }
            }, 5000);

        } catch (error) {
            console.error('💥 [WHATSAPP] Initialization failed:', error);
            console.error('💥 [WHATSAPP] Stack:', error.stack);
            
            this.connectionStatus = 'failed';
            this.whatsappAvailable = false;
            
            this.io.emit('connection_update', {
                status: 'failed',
                error: error.message,
                details: 'Check Baileys version and configuration'
            });
        } finally {
            this.isConnecting = false;
        }
    }

    /**
     * ✅ Handle QR code generation and broadcasting - ENHANCED
     */
    async handleQRGeneration(qrCode) {
        try {
            // ✅ Ensure qrCode is a string
            const qrString = typeof qrCode === 'string' ? qrCode : String(qrCode);
            
            // ✅ Generate QR image data
            const qrImageData = await qrcode.toDataURL(qrString);
            this.currentQR = qrImageData;

            console.log('🔄 [WHATSAPP] QR code generated and broadcast');

            // ✅ Broadcast to all WebSocket clients
            this.io.emit('qr_data', {
                qrImage: qrImageData,
                pairingCode: null,
                timestamp: Date.now(),
                pairingCodeLength: WHATSAPP_CONFIG.PAIRING.LENGTH,
                pairingMode: 'MANUAL-ONLY',
                message: 'Scan this QR code with WhatsApp',
                rawQR: qrString.substring(0, 50) + '...' // For debugging
            });

            // Set QR expiry timeout
            this.clearQRTimeouts();
            this.qrTimeout = setTimeout(() => {
                console.log('⏰ [WHATSAPP] QR code expired');
                this.currentQR = null;
                this.io.emit('qr_expired', {
                    message: 'QR code expired. Refreshing...',
                    timestamp: new Date()
                });
                this.refreshQRCode();
            }, this.qrExpiryTime);

            // Auto-regenerate QR every 30 seconds if not scanned
            this.qrRegenerationInterval = setInterval(() => {
                if (!this.isAuthenticated && this.whatsappSocket) {
                    console.log('🔄 [WHATSAPP] Auto-regenerating QR code');
                    this.refreshQRCode();
                }
            }, this.qrRegenerationIntervalMs);

        } catch (error) {
            console.error('❌ [WHATSAPP] QR generation failed:', error);
            
            // ✅ Fallback: Send raw QR code as text
            this.io.emit('qr_data', {
                qrImage: null,
                qrText: typeof qrCode === 'string' ? qrCode.substring(0, 100) : 'Invalid QR',
                pairingCode: null,
                timestamp: Date.now(),
                error: 'QR image generation failed',
                message: 'Try refreshing the page'
            });
        }
    }

    /**
     * ✅ Handle successful WhatsApp connection
     */
    handleSuccessfulConnection() {
        this.isAuthenticated = true;
        this.connectionStatus = 'connected';
        this.reconnectAttempts = 0;
        this.whatsappAvailable = true;

        this.sessionId = generateSessionId();
        console.log(`✅ [WHATSAPP] Authenticated. Session ID: ${this.sessionId}`);

        this.clearQRTimeouts();
        this.currentQR = null;

        this.io.emit('connection_update', {
            status: 'connected',
            sessionId: this.sessionId,
            message: 'WhatsApp connected successfully',
            timestamp: new Date()
        });

        this.io.emit('ready', {
            status: 'connected',
            sessionId: this.sessionId,
            phoneNumber: this.currentPhoneNumber,
            message: 'Scanner is active and ready',
            pairingCodeLength: WHATSAPP_CONFIG.PAIRING.LENGTH,
            pairingMode: 'MANUAL-ONLY',
            functions: LIVE_FUNCTIONS_CONFIG.BASE_URL
        });
    }

    /**
     * ✅ Handle connection close and attempt reconnection
     */
    handleConnectionClose(lastDisconnect) {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const logoutRequest = lastDisconnect?.error?.output?.payload?.logoutRequest;

        console.log(`🔌 [WHATSAPP] Connection closed. Status: ${statusCode}, Logout: ${logoutRequest}`);

        this.connectionStatus = 'disconnected';
        this.isAuthenticated = false;
        this.whatsappAvailable = false;

        this.io.emit('connection_update', {
            status: 'disconnected',
            reason: statusCode ? `Error ${statusCode}` : 'Unknown',
            shouldReconnect: this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts
        });

        if (logoutRequest) {
            console.log('🚪 [WHATSAPP] Logged out from phone');
            this.io.emit('logged_out', { message: 'Logged out from WhatsApp' });
            this.shouldReconnect = false;
            return;
        }

        if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(5000 * this.reconnectAttempts, 30000);

            console.log(`🔄 [WHATSAPP] Reconnecting in ${delay}ms (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

            setTimeout(() => {
                if (this.shouldReconnect) {
                    this.initializeWhatsApp().catch(console.error);
                }
            }, delay);
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('❌ [WHATSAPP] Max reconnection attempts reached');
            this.io.emit('connection_update', {
                status: 'failed',
                error: 'Max reconnection attempts reached. Please refresh QR.'
            });
        }
    }

    /**
     * 🔄 Manually refresh QR code - ENHANCED
     */
    async refreshQRCode() {
        console.log('🔄 [WHATSAPP] Manually refreshing QR code...');
        
        // Notify clients
        this.io.emit('connection_update', {
            status: 'refreshing',
            message: 'Refreshing QR code...'
        });

        // Clean up old connection
        if (this.whatsappSocket) {
            try {
                await this.whatsappSocket.logout();
                console.log('✅ [WHATSAPP] Old connection cleaned up');
            } catch (error) {
                console.log('⚠️ [WHATSAPP] Cleanup had issues:', error.message);
            }
            this.whatsappSocket = null;
        }

        // Reset state
        this.isAuthenticated = false;
        this.sessionId = null;
        this.currentPhoneNumber = null;
        this.currentQR = null;
        this.connectionStatus = 'disconnected';
        this.reconnectAttempts = 0;
        this.shouldReconnect = true;

        // Clear timeouts
        this.clearQRTimeouts();

        // Start new connection with delay
        setTimeout(() => {
            console.log('🔄 [WHATSAPP] Starting new connection...');
            this.initializeWhatsApp().catch(error => {
                console.error('💥 [WHATSAPP] Re-initialization failed:', error.message);
                this.io.emit('connection_update', {
                    status: 'failed',
                    error: 'Failed to reconnect: ' + error.message
                });
            });
        }, 2000); // 2 second delay
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
            this.app.use(express.json());
            this.app.use(express.urlencoded({ extended: true }));
            this.app.use(express.static(path.join(__dirname, 'public'), {
                maxAge: SERVER_CONFIG.STATIC.MAX_AGE
            }));

            this.setupBasicRoutes();
            
            console.log('✅ [SCANNER] Express server setup completed');
        } catch (error) {
            console.error('❌ [SCANNER] Express setup failed:', error);
            throw error;
        }
    }

    /**
     * 🛣️ Setup basic routes
     */
    setupBasicRoutes() {
        this.app.get('/', (req, res) => {
            res.redirect('/password');
        });

        this.app.get('/password', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'password.html'));
        });

        this.app.get('/scanner', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'scanner.html'));
        });

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

        this.app.post('/logout', (req, res) => {
            try {
                this.isAuthenticated = false;
                this.sessionId = null;
                this.currentPhoneNumber = null;
                this.currentQR = null;
                this.currentPairingCode = null;
                this.activePairingCode = null;
                
                this.pairingCodes.clear();
                
                if (this.client) {
                    this.client.logout();
                    this.client = null;
                }
                
                this.clearQRTimeouts();
                this.reconnectAttempts = 0;
                
                this.io.emit('logout', { message: 'Logged out successfully' });
                
                setTimeout(() => {
                    this.initializeWhatsApp().catch(console.error);
                }, 2000);
                
                res.json({ success: true, message: 'Logged out successfully' });
            } catch (error) {
                console.error('❌ [SCANNER] Logout failed:', error);
                res.json({ success: false, error: 'Logout failed' });
            }
        });

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

        this.app.get('/health', (req, res) => {
            res.json({
                status: 'operational',
                version: SCANNER_IDENTITY.VERSION,
                platform: DEPLOYMENT.getCurrentPlatform().NAME,
                whatsapp: this.whatsappAvailable,
                authenticated: this.isAuthenticated,
                functions: LIVE_FUNCTIONS_CONFIG.BASE_URL,
                timestamp: new Date(),
                pairingCodes: {
                    active: this.pairingCodes.size,
                    length: WHATSAPP_CONFIG.PAIRING.LENGTH,
                    mode: 'MANUAL-ONLY'
                }
            });
        });

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
                functions: LIVE_FUNCTIONS_CONFIG.BASE_URL,
                timestamp: new Date()
            });
        });

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
                
                this.clearQRTimeouts();
                
                setTimeout(() => {
                    this.initializeWhatsApp().catch(console.error);
                }, 1000);
                
                res.json({ success: true, message: 'QR code refresh initiated' });
            } catch (error) {
                res.json({ success: false, error: 'Failed to refresh QR' });
            }
        });

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

                const pairingCode = this.generateEightDigitPairingCode();
                
                this.pairingCodes.set(pairingCode, {
                    phoneNumber: phoneNumber,
                    generatedAt: Date.now(),
                    expiresAt: Date.now() + WHATSAPP_CONFIG.PAIRING.TIMEOUT,
                    used: false,
                    isManual: true
                });

                this.currentPairingCode = pairingCode;
                this.activePairingCode = pairingCode;

                console.log(`🔢 [SCANNER] Manual 8-digit pairing code generated for ${phoneNumber}: ${pairingCode}`);

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
     * ✅ Call live functions
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
            
            return this.getFallbackResponse(botType, command, args);
        }
    }

    /**
     * ✅ Fallback responses when functions are down
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

    /**
     * 🔌 Setup WebSocket communication
     */
    setupWebSocket() {
        this.io.on('connection', (socket) => {
            console.log(`🤖 [SCANNER] New client connected: ${socket.id}`);
            
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
                functions: LIVE_FUNCTIONS_CONFIG.BASE_URL
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
                    functions: LIVE_FUNCTIONS_CONFIG.BASE_URL
                });
            } else if (this.currentQR) {
                socket.emit('qr_data', {
                    qrImage: this.currentQR,
                    pairingCode: null,
                    timestamp: Date.now(),
                    pairingCodeLength: WHATSAPP_CONFIG.PAIRING.LENGTH,
                    pairingMode: 'MANUAL-ONLY'
                });
            }

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
                
                this.clearQRTimeouts();
                
                setTimeout(() => {
                    this.initializeWhatsApp().catch(console.error);
                }, 1000);
                
                socket.emit('qr_refreshed', {
                    success: true,
                    message: 'QR code refresh initiated'
                });
            });

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

                    const pairingCode = this.generateEightDigitPairingCode();
                    
                    this.pairingCodes.set(pairingCode, {
                        phoneNumber: phoneNumber,
                        generatedAt: Date.now(),
                        expiresAt: Date.now() + WHATSAPP_CONFIG.PAIRING.TIMEOUT,
                        used: false,
                        isManual: true
                    });

                    this.currentPairingCode = pairingCode;
                    this.activePairingCode = pairingCode;

                    console.log(`🔢 [SCANNER] Manual 8-digit pairing code generated for ${phoneNumber}: ${pairingCode}`);

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

            socket.on('logout_request', async () => {
                try {
                    console.log(`🚪 [SCANNER] Logout requested by: ${socket.id}`);
                    
                    this.isAuthenticated = false;
                    this.sessionId = null;
                    this.currentPhoneNumber = null;
                    this.currentQR = null;
                    this.currentPairingCode = null;
                    this.activePairingCode = null;
                    this.connectedBots.clear();
                    this.reconnectAttempts = 0;
                    
                    this.clearQRTimeouts();
                    this.pairingCodes.clear();
                    
                    if (this.client) {
                        await this.client.logout();
                        this.client = null;
                    }
                    
                    this.whatsappAvailable = false;
                    
                    socket.emit('logout_success', {
                        success: true,
                        message: 'Successfully logged out'
                    });
                    
                    this.io.emit('logout', {
                        message: 'Scanner has been logged out'
                    });
                    
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

            socket.on('authenticate', async (data) => {
                const result = await savagePasswordAuth.validatePassword(
                    data.password, 
                    socket.handshake.address
                );
                socket.emit('auth_result', result);
            });

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
                    functions: LIVE_FUNCTIONS_CONFIG.BASE_URL,
                    timestamp: new Date()
                };
                socket.emit('scanner_status', status);
            });

            socket.on('disconnect', (reason) => {
                console.log(`🔌 [SCANNER] Client disconnected: ${socket.id} (Reason: ${reason})`);
            });
        });

        console.log('✅ [SCANNER] WebSocket server setup completed');
    }

    /**
     * 🚀 Start the server - CRITICAL FIX: Always bind to port
     */
    startServer() {
        const port = process.env.PORT || SERVER_CONFIG.PORT;
        
        // Must use 0.0.0.0 for Render compatibility
        this.server.listen(port, '0.0.0.0', () => {
            console.log('🦅 ============================================================');
            console.log('🦅 SAVAGE BOTS SCANNER - OPERATIONAL');
            console.log('🦅 ============================================================');
            console.log(`📍 Server running on: http://0.0.0.0:${port}`);
            console.log(`🔐 Password protected: http://0.0.0.0:${port}/password`);
            console.log(`📱 Scanner interface: http://0.0.0.0:${port}/scanner`);
            console.log(`🤖 Bots supported: SAVAGE-X, DE-UKNOWN-BOT, QUEEN-RIXIE`);
            console.log(`🌐 Live functions: ${LIVE_FUNCTIONS_CONFIG.BASE_URL}`);
            console.log(`🔢 Pairing codes: ${WHATSAPP_CONFIG.PAIRING.LENGTH}-digit MANUAL-ONLY system`);
            console.log(`📱 QR codes: Auto-regeneration every ${this.qrRegenerationIntervalMs}ms`);
            console.log(`🔄 Manual pairing: Phone number REQUIRED for pairing codes`);
            console.log(`🦅 ${SCANNER_IDENTITY.MOTTO}`);
            console.log('🦅 ============================================================');
        });

        // Handle server errors gracefully
        this.server.on('error', (error) => {
            console.error('💥 [SERVER] Failed to start:', error);
        });
    }

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

    shutdown() {
        console.log('🛑 [SCANNER] Shutting down...');
        this.shouldReconnect = false;
        this.clearQRTimeouts();

        if (this.whatsappSocket) {
            this.whatsappSocket.logout();
            this.whatsappSocket = null;
        }

        if (this.server) {
            this.server.close();
        }

        process.exit(0);
    }
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
