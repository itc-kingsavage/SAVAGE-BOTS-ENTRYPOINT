/**
 * 🦅 SAVAGE BOTS SCANNER - Main Server File
 * Multi-bot WhatsApp scanner with hacker theme
 * COMPATIBLE with Baileys v6+
 * UPDATED: Manual-Only Pairing Codes + QR Regeneration + LIVE FUNCTIONS + BOT SELECTION
 * ✅ FIXED: Bot selection system with separate sessions
 * ✅ ADDED: Session folder per bot
 * ✅ FIXED: WebSocket bot selection events
 */

const express = require('express');
const socketIo = require('socket.io');
const http = require('http');
const path = require('path');
const qrcode = require('qrcode');
const axios = require('axios');
const fs = require('fs');
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

        // NEW: Bot selection tracking
        this.selectedBot = null;
        this.botSessions = new Map(); // Stores session per bot
        
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
        console.log(`🦅 Bot Selection: TAP-TO-CONNECT system active`);
        console.log('🦅 ============================================================');

        // Start the server FIRST
        this.startServer();

        try {
            await this.testLiveFunctionsConnection();
            await this.initializeDatabase();
            await this.setupExpress();
            await this.setupWebSocket();
            
            console.log('✅ [SCANNER] Core systems initialized - Waiting for bot selection');
            
            this.io.emit('status_update', {
                status: 'ready_for_bot',
                message: 'Scanner ready - Tap a bot to connect'
            });
            
        } catch (error) {
            console.error('💥 [SCANNER] A subsystem failed:', error.message);
            console.log('⚠️ [SCANNER] Core server is running, but some features may be limited.');
        }
    }

    /**
     * 🤖 NEW: Handle bot selection from frontend
     */
    async handleBotSelection(botName, socket) {
        console.log(`🤖 [SCANNER] Bot selected: ${botName}`);
        
        // Validate bot name
        const validBots = ['SAVAGE-X', 'DE-UKNOWN-BOT', 'QUEEN-RIXIE'];
        if (!validBots.includes(botName)) {
            socket.emit('bot_selected', {
                success: false,
                error: 'Invalid bot name'
            });
            return;
        }
        
        this.selectedBot = botName;
        
        // Create session directory for this bot
        const botSessionDir = path.join(__dirname, 'sessions', botName.toLowerCase().replace('-', '_'));
        if (!fs.existsSync(botSessionDir)) {
            fs.mkdirSync(botSessionDir, { recursive: true });
            console.log(`📁 [SCANNER] Created session directory for ${botName}`);
        }
        
        // Store session info
        this.botSessions.set(botName, {
            sessionDir: botSessionDir,
            selectedAt: new Date(),
            status: 'selected'
        });
        
        // Notify all clients
        this.io.emit('bot_status', {
            botName: botName,
            status: 'selected',
            message: `${botName} selected - Generating QR...`
        });
        
        socket.emit('bot_selected', {
            success: true,
            botName: botName,
            message: `${botName} session prepared`,
            timestamp: new Date()
        });
        
        // Initialize WhatsApp for this bot
        this.initializeWhatsAppForBot(botName, botSessionDir);
    }

    /**
     * 🔗 NEW: Initialize WhatsApp for specific bot
     */
    async initializeWhatsAppForBot(botName, sessionDir) {
        if (this.isConnecting) {
            console.log('⚠️ [WHATSAPP] Connection already in progress');
            return;
        }

        this.isConnecting = true;
        this.connectionStatus = 'connecting';
        this.whatsappAvailable = false;

        console.log(`🔗 [WHATSAPP] Initializing connection for ${botName}...`);

        try {
            // Create bot-specific session directory
            if (!fs.existsSync(sessionDir)) {
                fs.mkdirSync(sessionDir, { recursive: true });
            }

            // Use bot-specific auth state
            const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
            this.authState = state;

            this.whatsappSocket = makeWASocket({
                auth: this.authState,
                printQRInTerminal: false,
                browser: Browsers.ubuntu('Chrome'),
                logger: undefined,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                markOnlineOnConnect: true,
                getMessage: async () => undefined,
                version: [2, 3000, 1010101010]
            });

            // Handle credentials update
            this.whatsappSocket.ev.on('creds.update', saveCreds);

            // Handle connection updates
            this.whatsappSocket.ev.on('connection.update', (update) => {
                const { connection, lastDisconnect, qr, isNewLogin, phoneNumber } = update;

                console.log(`📡 [WHATSAPP-${botName}] Connection update: ${connection}`);

                if (qr) {
                    console.log(`✅ [WHATSAPP-${botName}] QR code received`);
                    this.handleQRGenerationForBot(qr, botName);
                    this.connectionStatus = 'qr_waiting';
                    
                    this.io.emit('connection_update', { 
                        status: 'qr_waiting', 
                        qrReceived: true,
                        botName: botName,
                        message: `QR code ready for ${botName}`
                    });
                }

                if (connection === 'open') {
                    console.log(`✅ [WHATSAPP-${botName}] Connected successfully!`);
                    this.handleSuccessfulConnectionForBot(botName);
                }

                if (connection === 'close') {
                    this.handleConnectionClose(lastDisconnect, botName);
                }

                if (phoneNumber) {
                    this.currentPhoneNumber = phoneNumber;
                    console.log(`📱 [WHATSAPP-${botName}] Linked to: ${phoneNumber}`);
                    
                    this.io.emit('phone_number_linked', { 
                        phoneNumber,
                        botName: botName,
                        message: `${botName} linked to ${phoneNumber}`
                    });
                }
            });

            // Handle pairing code events
            this.whatsappSocket.ev.on('pairing.code', (code) => {
                console.log(`🔢 [WHATSAPP-${botName}] Pairing code: ${code}`);
                
                this.io.emit('whatsapp_pairing_code', {
                    code: code,
                    botName: botName,
                    source: 'whatsapp',
                    timestamp: new Date()
                });
            });

            // Handle QR refresh
            this.whatsappSocket.ev.on('qr', (qr) => {
                console.log(`🔄 [WHATSAPP-${botName}] New QR code received`);
                this.handleQRGenerationForBot(qr, botName);
            });

            this.client = this.whatsappSocket;
            this.whatsappAvailable = true;

            console.log(`✅ [WHATSAPP-${botName}] Initialization complete, waiting for QR...`);

            setTimeout(() => {
                if (!this.currentQR && !this.isAuthenticated) {
                    console.log(`⏰ [WHATSAPP-${botName}] No QR received yet`);
                }
            }, 5000);

        } catch (error) {
            console.error(`💥 [WHATSAPP-${botName}] Initialization failed:`, error);
            
            this.connectionStatus = 'failed';
            this.whatsappAvailable = false;
            
            this.io.emit('connection_update', {
                status: 'failed',
                botName: botName,
                error: error.message
            });
        } finally {
            this.isConnecting = false;
        }
    }

    /**
     * 📱 NEW: Handle QR generation for specific bot
     */
    async handleQRGenerationForBot(qrCode, botName) {
        try {
            const qrString = typeof qrCode === 'string' ? qrCode : String(qrCode);
            const qrImageData = await qrcode.toDataURL(qrString);
            this.currentQR = qrImageData;

            console.log(`🔄 [WHATSAPP-${botName}] QR code generated`);

            this.io.emit('qr_data', {
                qrImage: qrImageData,
                pairingCode: null,
                timestamp: Date.now(),
                botName: botName,
                pairingCodeLength: WHATSAPP_CONFIG.PAIRING.LENGTH,
                pairingMode: 'MANUAL-ONLY',
                message: `Scan QR for ${botName}`
            });

            this.clearQRTimeouts();
            this.qrTimeout = setTimeout(() => {
                console.log(`⏰ [WHATSAPP-${botName}] QR code expired`);
                this.currentQR = null;
                this.io.emit('qr_expired', {
                    message: `QR expired for ${botName}`,
                    botName: botName,
                    timestamp: new Date()
                });
                this.refreshQRCodeForBot(botName);
            }, this.qrExpiryTime);

            this.qrRegenerationInterval = setInterval(() => {
                if (!this.isAuthenticated && this.whatsappSocket) {
                    console.log(`🔄 [WHATSAPP-${botName}] Auto-regenerating QR`);
                    this.refreshQRCodeForBot(botName);
                }
            }, this.qrRegenerationIntervalMs);

        } catch (error) {
            console.error(`❌ [WHATSAPP-${botName}] QR generation failed:`, error);
        }
    }

    /**
     * ✅ NEW: Handle successful connection for bot
     */
    handleSuccessfulConnectionForBot(botName) {
        this.isAuthenticated = true;
        this.connectionStatus = 'connected';
        this.reconnectAttempts = 0;
        this.whatsappAvailable = true;

        this.sessionId = generateSessionId();
        console.log(`✅ [WHATSAPP-${botName}] Authenticated. Session ID: ${this.sessionId}`);

        this.clearQRTimeouts();
        this.currentQR = null;

        // Update bot session info
        if (this.botSessions.has(botName)) {
            const session = this.botSessions.get(botName);
            session.status = 'connected';
            session.connectedAt = new Date();
            session.sessionId = this.sessionId;
        }

        this.io.emit('connection_update', {
            status: 'connected',
            sessionId: this.sessionId,
            botName: botName,
            message: `${botName} connected successfully`
        });

        this.io.emit('ready', {
            status: 'connected',
            sessionId: this.sessionId,
            botName: botName,
            phoneNumber: this.currentPhoneNumber,
            message: `${botName} is active and ready`,
            pairingCodeLength: WHATSAPP_CONFIG.PAIRING.LENGTH,
            pairingMode: 'MANUAL-ONLY',
            functions: LIVE_FUNCTIONS_CONFIG.BASE_URL
        });
    }

    /**
     * 🔄 NEW: Refresh QR for specific bot
     */
    async refreshQRCodeForBot(botName) {
        console.log(`🔄 [WHATSAPP] Refreshing QR for ${botName}...`);
        
        this.io.emit('connection_update', {
            status: 'refreshing',
            botName: botName,
            message: `Refreshing QR for ${botName}...`
        });

        if (this.whatsappSocket) {
            try {
                await this.whatsappSocket.logout();
                console.log(`✅ [WHATSAPP-${botName}] Old connection cleaned up`);
            } catch (error) {
                console.log(`⚠️ [WHATSAPP-${botName}] Cleanup issues:`, error.message);
            }
            this.whatsappSocket = null;
        }

        this.isAuthenticated = false;
        this.sessionId = null;
        this.currentPhoneNumber = null;
        this.currentQR = null;
        this.connectionStatus = 'disconnected';
        this.reconnectAttempts = 0;
        this.shouldReconnect = true;

        this.clearQRTimeouts();

        setTimeout(() => {
            const sessionDir = this.botSessions.get(botName)?.sessionDir;
            if (sessionDir) {
                this.initializeWhatsAppForBot(botName, sessionDir).catch(error => {
                    console.error(`💥 [WHATSAPP-${botName}] Re-initialization failed:`, error.message);
                });
            }
        }, 2000);
    }

    /**
     * 🔌 Handle connection close for bot
     */
    handleConnectionClose(lastDisconnect, botName) {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const logoutRequest = lastDisconnect?.error?.output?.payload?.logoutRequest;

        console.log(`🔌 [WHATSAPP-${botName}] Connection closed. Status: ${statusCode}`);

        this.connectionStatus = 'disconnected';
        this.isAuthenticated = false;
        this.whatsappAvailable = false;

        this.io.emit('connection_update', {
            status: 'disconnected',
            botName: botName,
            reason: statusCode ? `Error ${statusCode}` : 'Unknown'
        });

        if (logoutRequest) {
            console.log(`🚪 [WHATSAPP-${botName}] Logged out from phone`);
            this.io.emit('logged_out', { 
                message: `${botName} logged out`,
                botName: botName
            });
            this.shouldReconnect = false;
            return;
        }

        if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(5000 * this.reconnectAttempts, 30000);

            console.log(`🔄 [WHATSAPP-${botName}] Reconnecting in ${delay}ms`);

            setTimeout(() => {
                if (this.shouldReconnect) {
                    const sessionDir = this.botSessions.get(botName)?.sessionDir;
                    if (sessionDir) {
                        this.initializeWhatsAppForBot(botName, sessionDir).catch(console.error);
                    }
                }
            }, delay);
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
     * 🌐 Setup Express server
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
     * 🛣️ Setup basic routes - UPDATED with bot info
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
                this.selectedBot = null;
                
                this.pairingCodes.clear();
                this.botSessions.clear();
                
                if (this.client) {
                    this.client.logout();
                    this.client = null;
                }
                
                this.clearQRTimeouts();
                this.reconnectAttempts = 0;
                
                this.io.emit('logout', { message: 'Logged out successfully' });
                
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
                selectedBot: this.selectedBot,
                botSessions: Array.from(this.botSessions.entries()).map(([name, data]) => ({
                    name,
                    status: data.status,
                    selectedAt: data.selectedAt
                })),
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
                selectedBot: this.selectedBot,
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
                const { botName } = req.body;
                
                if (!botName && !this.selectedBot) {
                    return res.json({ 
                        success: false, 
                        error: 'No bot selected or specified' 
                    });
                }
                
                const targetBot = botName || this.selectedBot;
                
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
                    const sessionDir = this.botSessions.get(targetBot)?.sessionDir;
                    if (sessionDir) {
                        this.initializeWhatsAppForBot(targetBot, sessionDir).catch(console.error);
                    }
                }, 1000);
                
                res.json({ 
                    success: true, 
                    message: `QR refresh initiated for ${targetBot}` 
                });
            } catch (error) {
                res.json({ success: false, error: 'Failed to refresh QR' });
            }
        });

        this.app.post('/generate-pairing-code', (req, res) => {
            try {
                const { phoneNumber, botName } = req.body;
                
                if (!phoneNumber || phoneNumber.trim() === '') {
                    return res.json({ 
                        success: false, 
                        error: 'Phone number is required' 
                    });
                }

                if (!this.isValidPhoneNumber(phoneNumber)) {
                    return res.json({ 
                        success: false, 
                        error: 'Invalid phone number format' 
                    });
                }

                const targetBot = botName || this.selectedBot;
                if (!targetBot) {
                    return res.json({ 
                        success: false, 
                        error: 'Select a bot first' 
                    });
                }

                const pairingCode = this.generateEightDigitPairingCode();
                
                this.pairingCodes.set(pairingCode, {
                    phoneNumber: phoneNumber,
                    botName: targetBot,
                    generatedAt: Date.now(),
                    expiresAt: Date.now() + WHATSAPP_CONFIG.PAIRING.TIMEOUT,
                    used: false,
                    isManual: true
                });

                this.currentPairingCode = pairingCode;
                this.activePairingCode = pairingCode;

                console.log(`🔢 [SCANNER] Pairing code for ${targetBot}: ${pairingCode}`);

                this.io.emit('pairing_code_generated', {
                    success: true,
                    pairingCode: pairingCode,
                    phoneNumber: phoneNumber,
                    botName: targetBot,
                    message: `Pairing code for ${targetBot}`,
                    timestamp: new Date(),
                    isManual: true,
                    length: WHATSAPP_CONFIG.PAIRING.LENGTH
                });

                res.json({
                    success: true,
                    pairingCode: pairingCode,
                    phoneNumber: phoneNumber,
                    botName: targetBot,
                    message: `Pairing code generated for ${targetBot}`,
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
                botName: data.botName,
                generatedAt: new Date(data.generatedAt).toISOString(),
                expiresAt: new Date(data.expiresAt).toISOString(),
                used: data.used,
                isManual: data.isManual
            }));

            res.json({
                activeCodes: activeCodes,
                totalActive: this.pairingCodes.size,
                currentPairingCode: this.currentPairingCode,
                selectedBot: this.selectedBot,
                config: {
                    length: WHATSAPP_CONFIG.PAIRING.LENGTH,
                    timeout: WHATSAPP_CONFIG.PAIRING.TIMEOUT,
                    mode: 'MANUAL-ONLY'
                }
            });
        });

        this.app.get('/bot-sessions', (req, res) => {
            const sessions = Array.from(this.botSessions.entries()).map(([name, data]) => ({
                botName: name,
                status: data.status,
                sessionDir: data.sessionDir,
                selectedAt: data.selectedAt,
                connectedAt: data.connectedAt,
                sessionId: data.sessionId
            }));

            res.json({
                selectedBot: this.selectedBot,
                sessions: sessions,
                totalSessions: this.botSessions.size
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
        const response = botFallback[command] || `❌ Command not available in fallback mode: ${command}`;

        return {
            success: true,
            response: response,
            fallback: true,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * 🔌 Setup WebSocket communication - UPDATED with bot selection
     */
    setupWebSocket() {
        this.io.on('connection', (socket) => {
            console.log(`🤖 [SCANNER] New client connected: ${socket.id}`);
            
            const status = {
                scanner: 'running',
                whatsapp: this.whatsappAvailable,
                authenticated: this.isAuthenticated,
                selectedBot: this.selectedBot,
                hasQr: !!this.currentQR,
                sessionId: this.sessionId,
                currentPhoneNumber: this.currentPhoneNumber,
                currentPairingCode: this.currentPairingCode,
                pairingCodesActive: this.pairingCodes.size,
                pairingCodeLength: WHATSAPP_CONFIG.PAIRING.LENGTH,
                pairingMode: 'MANUAL-ONLY',
                functions: LIVE_FUNCTIONS_CONFIG.BASE_URL,
                botSessions: Array.from(this.botSessions.entries()).map(([name, data]) => ({
                    name,
                    status: data.status
                }))
            };
            
            socket.emit('scanner_status', status);

            if (this.isAuthenticated && this.sessionId && this.selectedBot) {
                socket.emit('ready', {
                    status: 'connected',
                    sessionId: this.sessionId,
                    botName: this.selectedBot,
                    phoneNumber: this.currentPhoneNumber,
                    message: `${this.selectedBot} is active and ready`,
                    pairingCodeLength: WHATSAPP_CONFIG.PAIRING.LENGTH,
                    pairingMode: 'MANUAL-ONLY',
                    functions: LIVE_FUNCTIONS_CONFIG.BASE_URL
                });
            } else if (this.currentQR && this.selectedBot) {
                socket.emit('qr_data', {
                    qrImage: this.currentQR,
                    pairingCode: null,
                    timestamp: Date.now(),
                    botName: this.selectedBot,
                    pairingCodeLength: WHATSAPP_CONFIG.PAIRING.LENGTH,
                    pairingMode: 'MANUAL-ONLY'
                });
            }

            // NEW: Bot selection event
            socket.on('select_bot', (data) => {
                const { botName } = data;
                this.handleBotSelection(botName, socket);
            });

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
                if (!this.selectedBot) {
                    socket.emit('qr_refreshed', {
                        success: false,
                        error: 'No bot selected'
                    });
                    return;
                }

                console.log(`🔄 [SCANNER] QR refresh requested for ${this.selectedBot}`);
                
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
                    const sessionDir = this.botSessions.get(this.selectedBot)?.sessionDir;
                    if (sessionDir) {
                        this.initializeWhatsAppForBot(this.selectedBot, sessionDir).catch(console.error);
                    }
                }, 1000);
                
                socket.emit('qr_refreshed', {
                    success: true,
                    message: `QR refresh initiated for ${this.selectedBot}`
                });
            });

            socket.on('generate_pairing_code', (data) => {
                try {
                    const { phoneNumber, botName } = data;
                    const targetBot = botName || this.selectedBot;
                    
                    if (!targetBot) {
                        socket.emit('pairing_code_error', {
                            error: 'Select a bot first'
                        });
                        return;
                    }

                    if (!phoneNumber || phoneNumber.trim() === '') {
                        socket.emit('pairing_code_error', {
                            error: 'Phone number is required'
                        });
                        return;
                    }

                    if (!this.isValidPhoneNumber(phoneNumber)) {
                        socket.emit('pairing_code_error', {
                            error: 'Invalid phone number format'
                        });
                        return;
                    }

                    const pairingCode = this.generateEightDigitPairingCode();
                    
                    this.pairingCodes.set(pairingCode, {
                        phoneNumber: phoneNumber,
                        botName: targetBot,
                        generatedAt: Date.now(),
                        expiresAt: Date.now() + WHATSAPP_CONFIG.PAIRING.TIMEOUT,
                        used: false,
                        isManual: true
                    });

                    this.currentPairingCode = pairingCode;
                    this.activePairingCode = pairingCode;

                    console.log(`🔢 [SCANNER] Pairing code for ${targetBot}: ${pairingCode}`);

                    this.io.emit('pairing_code_generated', {
                        success: true,
                        pairingCode: pairingCode,
                        phoneNumber: phoneNumber,
                        botName: targetBot,
                        message: `Pairing code for ${targetBot}`,
                        timestamp: new Date(),
                        isManual: true,
                        length: WHATSAPP_CONFIG.PAIRING.LENGTH
                    });

                    socket.emit('pairing_code_generated', {
                        success: true,
                        pairingCode: pairingCode,
                        phoneNumber: phoneNumber,
                        botName: targetBot,
                        message: `Pairing code generated for ${targetBot}`
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
                    this.selectedBot = null;
                    this.connectedBots.clear();
                    this.reconnectAttempts = 0;
                    
                    this.clearQRTimeouts();
                    this.pairingCodes.clear();
                    this.botSessions.clear();
                    
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
                    selectedBot: this.selectedBot,
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
     * 🚀 Start the server
     */
    startServer() {
        const port = process.env.PORT || SERVER_CONFIG.PORT;
        
        // Ensure sessions directory exists
        const sessionsDir = path.join(__dirname, 'sessions');
        if (!fs.existsSync(sessionsDir)) {
            fs.mkdirSync(sessionsDir, { recursive: true });
            console.log('📁 [SCANNER] Created sessions directory');
        }
        
        this.server.listen(port, '0.0.0.0', () => {
            console.log('🦅 ============================================================');
            console.log('🦅 SAVAGE BOTS SCANNER - OPERATIONAL');
            console.log('🦅 ============================================================');
            console.log(`📍 Server running on: http://0.0.0.0:${port}`);
            console.log(`🔐 Password protected: http://0.0.0.0:${port}/password`);
            console.log(`📱 Scanner interface: http://0.0.0.0:${port}/scanner`);
            console.log(`🤖 Bots supported: SAVAGE-X, DE-UKNOWN-BOT, QUEEN-RIXIE`);
            console.log(`🎯 Bot Selection: TAP-TO-CONNECT system active`);
            console.log(`📁 Sessions: Separate folder per bot`);
            console.log(`🌐 Live functions: ${LIVE_FUNCTIONS_CONFIG.BASE_URL}`);
            console.log(`🔢 Pairing codes: ${WHATSAPP_CONFIG.PAIRING.LENGTH}-digit MANUAL-ONLY`);
            console.log(`🦅 ${SCANNER_IDENTITY.MOTTO}`);
            console.log('🦅 ============================================================');
        });

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
