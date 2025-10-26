/**
 * 🦅 SAVAGE BOTS SCANNER - Main Server File
 * Multi-bot WhatsApp scanner with hacker theme
 * COMPATIBLE with Baileys v6+
 * UPDATED: Manual-Only Pairing Codes + QR Regeneration
 */

const express = require('express');
const socketIo = require('socket.io');
const http = require('http');
const path = require('path');
const qrcode = require('qrcode');

// Core systems
const savageDatabase = require('./config/database');
const savageSessionManager = require('./auth/sessionManager');
const savagePasswordAuth = require('./auth/passwordAuth');
const { generateSessionId, generatePairingCode } = require('./utils/generators');
const { SCANNER_IDENTITY, WHATSAPP_CONFIG, SERVER_CONFIG, MESSAGES, DEPLOYMENT } = require('./config/constants');

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
        this.currentPairingCode = null; // ✅ CHANGED: Starts as null (no auto-generation)
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
        
        // ✅ CHANGED: Manual-Only Pairing Code System
        this.pairingCodes = new Map(); // Store manual pairing codes only
        this.activePairingCode = null;
        this.pairingCodeExpiry = WHATSAPP_CONFIG.PAIRING.TIMEOUT;
        
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
            console.log('🦅 ============================================================');

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
                
                // Still broadcast status so frontend knows
                this.io.emit('status_update', {
                    status: 'whatsapp_unavailable',
                    message: 'WhatsApp connection failed - Scanner running in limited mode'
                });
            });
            
        } catch (error) {
            console.error('💥 [SCANNER] Initialization failed:', error);
            // Don't exit - allow scanner to run without WhatsApp
            console.log('⚠️ [SCANNER] Running in limited mode - Core systems available');
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
     * 🛣️ Setup basic routes directly
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

        // Logout endpoint
        this.app.post('/logout', (req, res) => {
            try {
                // Clear server-side authentication
                this.isAuthenticated = false;
                this.sessionId = null;
                this.currentPhoneNumber = null;
                this.currentQR = null;
                this.currentPairingCode = null; // ✅ CHANGED: Already null
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
                currentPairingCode: this.currentPairingCode, // ✅ CHANGED: Will be null
                pairingCodesActive: this.pairingCodes.size,
                pairingMode: 'MANUAL-ONLY',
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
                this.currentPairingCode = null; // ✅ CHANGED: Clear pairing code
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

        // ✅ CHANGED: Generate 8-digit pairing code ONLY with phone number
        this.app.post('/generate-pairing-code', (req, res) => {
            try {
                const { phoneNumber } = req.body;
                
                // ✅ CHANGED: Phone number is REQUIRED
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
                    isManual: true // ✅ CHANGED: Always manual now
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
     * ✅ ADDED: Validate phone number format
     */
    isValidPhoneNumber(phone) {
        if (!phone || phone.trim() === '') return false; // ✅ CHANGED: No longer allow empty
        const phoneRegex = /^\+?[1-9]\d{1,14}$/;
        return phoneRegex.test(phone.replace(/\s/g, ''));
    }

    /**
     * 📱 Initialize WhatsApp connection (COMPATIBLE with Baileys v6+)
     */
    async initializeWhatsApp() {
        try {
            console.log('📱 [SCANNER] Initializing WhatsApp connection...');
            
            // Reset connection state
            this.isAuthenticated = false;
            this.sessionId = null;
            this.currentPhoneNumber = null;
            this.whatsappAvailable = false;
            this.currentPairingCode = null; // ✅ CHANGED: Starts as null
            this.activePairingCode = null;
            
            // Clear previous QR timeouts
            this.clearQRTimeouts();
            
            // ✅ COMPATIBLE Baileys v6+ import with proper logger
            const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
            
            // Use multi-file auth state
            const { state, saveCreds } = await useMultiFileAuthState('./savage_auth');
            
            // ✅ FIXED: Proper logger configuration for Baileys v6+
            const logger = {
                level: 'silent', // Reduce logging for anti-ban
                trace: () => {},
                debug: () => {},
                info: () => {},
                warn: () => {},
                error: () => {},
                fatal: () => {},
                child: () => logger // ✅ FIX: Add child method that returns logger
            };

            this.client = makeWASocket({
                // Baileys configuration
                auth: state,
                logger: logger, // ✅ Use our fixed logger
                printQRInTerminal: false,
                browser: WHATSAPP_CONFIG.BAILEYS.BROWSER,
                markOnlineOnConnect: WHATSAPP_CONFIG.BAILEYS.MARK_ONLINE_ON_CONNECT,
                syncFullHistory: WHATSAPP_CONFIG.BAILEYS.SYNC_FULL_HISTORY,
                version: WHATSAPP_CONFIG.BAILEYS.VERSION,
                // Additional settings
                retryRequestDelayMs: 3000,
                maxRetries: 5,
                connectTimeoutMs: 30000,
                generateHighQualityLink: true, // ✅ ADDED: Better QR quality
                fireInitQueries: true,
                shouldIgnoreJid: (jid) => false
            });

            // Save auth state updates
            this.client.ev.on('creds.update', saveCreds);

            this.setupWhatsAppEvents();
            
            this.whatsappAvailable = true;
            console.log('✅ [SCANNER] WhatsApp client initialized successfully');
            
            // Notify frontend that we're ready for QR
            this.io.emit('status_update', {
                status: 'waiting_qr',
                message: 'Waiting for QR code generation - Manual pairing codes ready'
            });
            
        } catch (error) {
            console.error('❌ [SCANNER] WhatsApp initialization failed:', error.message);
            this.whatsappAvailable = false;
            
            this.io.emit('status_update', {
                status: 'whatsapp_failed',
                message: 'WhatsApp connection failed: ' + error.message
            });
            
            throw error;
        }
    }

    /**
     * 📨 Setup WhatsApp event handlers
     */
    setupWhatsAppEvents() {
        const { DisconnectReason } = require('@whiskeysockets/baileys');

        // Connection updates
        this.client.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr, isNewLogin, isOnline } = update;
            
            console.log(`📡 [WHATSAPP] Connection update: ${connection}`);
            
            // Auto-generate QR code when available (like web.whatsapp.com)
            if (qr) {
                console.log('📱 [SCANNER] QR Code received - Auto-generating...');
                this.reconnectAttempts = 0; // Reset on new QR
                
                // Clear previous QR timeouts before generating new QR
                this.clearQRTimeouts();
                
                this.handleQRCode(qr).catch(console.error);
            }
            
            // Handle connection status
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                
                console.log(`🔌 [SCANNER] Connection closed (Status: ${statusCode}), reconnecting: ${shouldReconnect}`);
                
                this.io.emit('status_update', {
                    status: 'disconnected',
                    message: 'WhatsApp connection lost'
                });
                
                if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    const delay = Math.min(5000 * this.reconnectAttempts, 30000); // Max 30s delay
                    
                    console.log(`🔄 [SCANNER] Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
                    
                    setTimeout(() => {
                        this.initializeWhatsApp().catch(console.error);
                    }, delay);
                } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                    console.log('🛑 [SCANNER] Max reconnection attempts reached');
                    this.io.emit('status_update', {
                        status: 'connection_failed',
                        message: 'WhatsApp connection failed after multiple attempts. Please refresh.'
                    });
                }
            } else if (connection === 'open') {
                console.log('🔗 [SCANNER] WhatsApp connection opened');
                this.reconnectAttempts = 0; // Reset on successful connection
                this.isAuthenticated = true;
                this.whatsappAvailable = true;
                
                // Clear QR timeouts when connected
                this.clearQRTimeouts();
                
                this.io.emit('status_update', {
                    status: 'connected', 
                    message: 'WhatsApp connection established'
                });
                
                // Generate session ID and send ready event
                this.handleReady();
            } else if (connection === 'connecting') {
                console.log('⏳ [SCANNER] Connecting to WhatsApp...');
                this.io.emit('status_update', {
                    status: 'connecting',
                    message: 'Connecting to WhatsApp...'
                });
            }
        });

        // Message Handling
        this.client.ev.on('messages.upsert', async (m) => {
            try {
                const message = m.messages[0];
                if (!message || !message.message || message.key.remoteJid === 'status@broadcast') return;
                
                // Extract message content
                const messageContent = this.extractMessageContent(message);
                
                if (messageContent) {
                    // Broadcast message to all connected bots
                    this.io.emit('whatsapp_message', {
                        from: message.key.remoteJid,
                        body: messageContent,
                        timestamp: message.messageTimestamp,
                        type: this.getMessageType(message),
                        messageId: message.key.id,
                        isGroup: message.key.remoteJid.includes('@g.us')
                    });
                    
                    console.log(`📥 [SCANNER] Message received from ${message.key.remoteJid}`);
                }
            } catch (error) {
                console.error('❌ [SCANNER] Message processing error:', error);
            }
        });

        // Credentials update
        this.client.ev.on('creds.update', () => {
            console.log('🔐 [SCANNER] Credentials updated');
        });
    }

    /**
     * 📝 Extract message content from different message types
     */
    extractMessageContent(message) {
        const msg = message.message;
        
        if (msg.conversation) return msg.conversation;
        if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
        if (msg.imageMessage?.caption) return msg.imageMessage.caption;
        if (msg.videoMessage?.caption) return msg.videoMessage.caption;
        if (msg.documentMessage?.caption) return msg.documentMessage.caption;
        
        // Handle media messages
        if (msg.imageMessage) return '[Image Message]';
        if (msg.videoMessage) return '[Video Message]';
        if (msg.audioMessage) return '[Audio Message]';
        if (msg.documentMessage) return '[Document Message]';
        if (msg.stickerMessage) return '[Sticker Message]';
        
        return '[Unsupported Message Type]';
    }

    /**
     * 🔢 Handle QR code generation - ✅ CHANGED: No automatic pairing codes
     */
    async handleQRCode(qr) {
        try {
            console.log('📱 [SCANNER] Generating QR code...');
            
            // Clear previous authentication state
            this.isAuthenticated = false;
            this.sessionId = null;
            this.currentPhoneNumber = null;
            
            // QR generation with high quality
            let qrImage = null;
            try {
                qrImage = await qrcode.toDataURL(qr, {
                    width: WHATSAPP_CONFIG.QR.WIDTH,
                    height: WHATSAPP_CONFIG.QR.HEIGHT,
                    margin: WHATSAPP_CONFIG.QR.MARGIN,
                    color: WHATSAPP_CONFIG.QR.COLOR
                });
            } catch (qrError) {
                console.warn('⚠️ [SCANNER] QR image generation failed, using raw data:', qrError.message);
                qrImage = await qrcode.toDataURL(qr);
            }
            
            this.currentQR = qrImage;
            // ✅ CHANGED: No automatic pairing code generation
            this.currentPairingCode = null;
            this.activePairingCode = null;
            
            // QR data without pairing code
            const qrData = {
                qrImage: qrImage,
                qrRaw: qr,
                pairingCode: null, // ✅ CHANGED: No pairing code
                timestamp: Date.now(),
                autoGenerated: true,
                message: 'Scan this QR code with your phone to connect',
                expiresAt: Date.now() + this.qrExpiryTime,
                pairingCodeLength: WHATSAPP_CONFIG.PAIRING.LENGTH,
                pairingMode: 'MANUAL-ONLY'
            };
            
            // ✅ CHANGED: No pairing code storage for QR
            
            // Broadcast to all connected clients
            this.io.emit('qr_data', qrData);
            
            console.log(`📱 [SCANNER] QR Code generated - Manual pairing codes only`);
            
            // Update status
            this.io.emit('status_update', {
                status: 'qr_ready',
                message: 'QR code ready for scanning - Pairing codes available manually',
                hasQr: true,
                pairingCode: null // ✅ CHANGED: No pairing code
            });

            // QR Code Auto-Regeneration
            this.setupQRAutoRegeneration();

        } catch (error) {
            console.error('❌ [SCANNER] QR code handling failed:', error);
            
            // Emergency fallback
            this.io.emit('qr_data', {
                qrImage: null,
                qrRaw: qr,
                pairingCode: null, // ✅ CHANGED: No pairing code
                error: 'QR generation failed - Use manual QR scanning',
                timestamp: Date.now()
            });
        }
    }

    /**
     * ✅ Setup QR Code Auto-Regeneration
     */
    setupQRAutoRegeneration() {
        // Clear any existing timeouts
        this.clearQRTimeouts();

        // Set timeout for QR regeneration notification
        this.qrTimeout = setTimeout(() => {
            console.log('🔄 [SCANNER] QR code expired - Regenerating...');
            
            // Notify clients about QR regeneration
            this.io.emit('status_update', {
                status: 'waiting_qr',
                message: 'QR code expired - Generating new QR code...'
            });

            this.io.emit('qr_refreshed', {
                message: 'QR code auto-refreshing...',
                timestamp: new Date(),
                reason: 'timeout'
            });

            // Force QR regeneration by reinitializing WhatsApp
            if (this.client) {
                this.client.logout();
                this.client = null;
            }
            
            setTimeout(() => {
                this.initializeWhatsApp().catch(console.error);
            }, 2000);

        }, this.qrExpiryTime);

        // Set interval to check QR status (every 30 seconds)
        this.qrRegenerationInterval = setInterval(() => {
            if (this.currentQR && !this.isAuthenticated) {
                const timeLeft = this.qrExpiryTime - (Date.now() - (this.currentQR.timestamp || Date.now()));
                if (timeLeft < 30000) { // 30 seconds left
                    this.io.emit('qr_warning', {
                        message: `QR code expires in ${Math.ceil(timeLeft / 1000)} seconds`,
                        secondsLeft: Math.ceil(timeLeft / 1000),
                        autoRefresh: true
                    });
                }
                
                // Send regeneration status update
                this.io.emit('qr_regeneration_status', {
                    active: true,
                    interval: this.qrRegenerationIntervalMs,
                    nextRefresh: Date.now() + this.qrRegenerationIntervalMs
                });
            }
        }, this.qrRegenerationIntervalMs);
    }

    /**
     * ✅ Clear QR Timeouts
     */
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

    /**
     * ✅ Generate 8-digit Pairing Code
     */
    generateEightDigitPairingCode() {
        const crypto = require('crypto');
        const randomBytes = crypto.randomBytes(4);
        const randomNum = randomBytes.readUInt32BE(0);
        return (randomNum % 90000000 + 10000000).toString(); // Ensure 8 digits
    }

    /**
     * 🚀 Handle ready state - ✅ CHANGED: No pairing code cleanup needed
     */
    async handleReady() {
        try {
            console.log('🚀 [SCANNER] WhatsApp client is READY!');
            
            // Get actual phone number from WhatsApp connection
            const actualPhoneNumber = this.client.user?.id?.replace(/:\d+$/, '') || 'unknown';
            this.currentPhoneNumber = actualPhoneNumber;
            
            // Syncing phase
            this.io.emit('status_update', {
                status: 'syncing',
                message: 'Syncing with WhatsApp...',
                phoneNumber: actualPhoneNumber
            });
            
            // Generate session ID for bots
            this.sessionId = generateSessionId();
            
            // Send introduction messages
            await this.sendIntroMessages();
            
            // Clear QR data and timeouts
            this.currentQR = null;
            this.currentPairingCode = null; // ✅ CHANGED: Already null
            this.activePairingCode = null;
            this.clearQRTimeouts();
            
            // Clean up expired pairing codes
            this.cleanupExpiredPairingCodes();
            
            // Broadcast ready state
            this.io.emit('ready', {
                status: 'connected',
                sessionId: this.sessionId,
                phoneNumber: actualPhoneNumber,
                message: '✅ SAVAGE BOTS SCANNER is now active and synced!',
                timestamp: new Date(),
                pairingCodeLength: WHATSAPP_CONFIG.PAIRING.LENGTH,
                pairingMode: 'MANUAL-ONLY'
            });
            
            console.log(`🆔 [SCANNER] Session ID generated: ${this.sessionId}`);
            console.log(`📱 [SCANNER] Connected as: ${actualPhoneNumber}`);
            console.log(`🔢 [SCANNER] Manual 8-digit pairing codes system: ACTIVE`);
            
        } catch (error) {
            console.error('❌ [SCANNER] Ready state handling failed:', error);
        }
    }

    /**
     * ✅ ADDED: Cleanup expired pairing codes
     */
    cleanupExpiredPairingCodes() {
        const now = Date.now();
        let cleaned = 0;
        
        for (const [code, data] of this.pairingCodes.entries()) {
            if (data.expiresAt < now) {
                this.pairingCodes.delete(code);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(`🧹 [SCANNER] Cleaned ${cleaned} expired pairing codes`);
        }
    }

    /**
     * 📧 Get message type
     */
    getMessageType(message) {
        const msg = message.message;
        
        if (msg.conversation) return 'text';
        if (msg.extendedTextMessage) return 'text';
        if (msg.imageMessage) return 'image';
        if (msg.videoMessage) return 'video';
        if (msg.audioMessage) return 'audio';
        if (msg.documentMessage) return 'document';
        if (msg.stickerMessage) return 'sticker';
        if (msg.contactMessage) return 'contact';
        if (msg.locationMessage) return 'location';
        
        return 'unknown';
    }

    /**
     * 💬 Send introduction messages after connection
     */
    async sendIntroMessages() {
        try {
            const introMessages = MESSAGES.INTRODUCTION;
            
            // Get user's info to send to their own chat
            const userJid = this.client.user?.id;
            if (userJid) {
                for (const message of introMessages) {
                    await this.client.sendMessage(userJid, { text: message });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                console.log('✅ [SCANNER] Introduction messages sent');
            }
        } catch (error) {
            console.warn('⚠️ [SCANNER] Failed to send intro messages:', error.message);
        }
    }

    /**
     * 🔌 Setup WebSocket communication - ✅ CHANGED: Manual-only pairing codes
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
                currentPairingCode: this.currentPairingCode, // ✅ CHANGED: Will be null
                pairingCodesActive: this.pairingCodes.size,
                pairingCodeLength: WHATSAPP_CONFIG.PAIRING.LENGTH,
                pairingMode: 'MANUAL-ONLY'
            };
            
            socket.emit('scanner_status', status);

            if (this.isAuthenticated && this.sessionId) {
                socket.emit('ready', {
                    status: 'connected',
                    sessionId: this.sessionId,
                    phoneNumber: this.currentPhoneNumber,
                    message: 'Scanner is active and ready',
                    pairingCodeLength: WHATSAPP_CONFIG.PAIRING.LENGTH,
                    pairingMode: 'MANUAL-ONLY'
                });
            } else if (this.currentQR) {
                // Send QR code if available
                socket.emit('qr_data', {
                    qrImage: this.currentQR,
                    pairingCode: null, // ✅ CHANGED: No pairing code
                    timestamp: Date.now(),
                    pairingCodeLength: WHATSAPP_CONFIG.PAIRING.LENGTH,
                    pairingMode: 'MANUAL-ONLY'
                });
            }

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
                this.currentPairingCode = null; // ✅ CHANGED: Clear pairing code
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

            // ✅ CHANGED: Generate 8-digit pairing code ONLY when phone number provided
            socket.on('generate_pairing_code', (data) => {
                try {
                    const { phoneNumber } = data;
                    
                    // ✅ CHANGED: Phone number is REQUIRED
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
                        isManual: true // ✅ CHANGED: Always manual now
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
                    currentPairingCode: this.currentPairingCode, // ✅ CHANGED: Manual only
                    pairingCodesActive: this.pairingCodes.size,
                    pairingCodeLength: WHATSAPP_CONFIG.PAIRING.LENGTH,
                    pairingMode: 'MANUAL-ONLY',
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
     * 🚀 Start the server
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
            console.log(`🔢 Pairing codes: ${WHATSAPP_CONFIG.PAIRING.LENGTH}-digit MANUAL-ONLY system`);
            console.log(`📱 QR codes: Auto-regeneration every ${this.qrRegenerationIntervalMs}ms`);
            console.log(`🔄 Manual pairing: Phone number REQUIRED for pairing codes`);
            console.log(`🦅 ${SCANNER_IDENTITY.MOTTO}`);
            console.log('🦅 ============================================================');
        });
    }

    /**
     * 🛑 Graceful shutdown
     */
    async shutdown() {
        console.log('🛑 [SCANNER] Shutting down gracefully...');
        
        // Clear timeouts and pairing codes
        this.clearQRTimeouts();
        this.pairingCodes.clear();
        
        if (this.client) {
            try {
                await this.client.logout();
                await this.client.end(new Error('Shutdown'));
                console.log('✅ [SCANNER] WhatsApp client disconnected');
            } catch (error) {
                console.warn('⚠️ [SCANNER] Error during WhatsApp shutdown:', error.message);
            }
        }
        
        if (this.server) {
            this.server.close(() => {
                console.log('✅ [SCANNER] HTTP server closed');
                process.exit(0);
            });
        } else {
            process.exit(0);
        }
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
