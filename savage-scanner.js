/**
 * 🦅 SAVAGE BOTS SCANNER - Main Server File
 * Multi-bot WhatsApp scanner with hacker theme
 * COMPATIBLE with Baileys v6+
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
        this.currentPairingCode = null;
        this.sessionId = null;
        this.connectedBots = new Set();
        this.whatsappAvailable = false;
        this.currentPhoneNumber = null; // ✅ ADDED: Phone number storage
        
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
                timestamp: new Date()
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
                currentPhoneNumber: this.currentPhoneNumber, // ✅ ADDED: Include phone number in status
                timestamp: new Date()
            });
        });
    }

    /**
     * 📱 Initialize WhatsApp connection (COMPATIBLE with Baileys v6+)
     */
    async initializeWhatsApp() {
        try {
            console.log('📱 [SCANNER] Initializing WhatsApp connection...');
            
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
                connectTimeoutMs: 30000
            });

            // Save auth state updates
            this.client.ev.on('creds.update', saveCreds);

            this.setupWhatsAppEvents();
            
            this.whatsappAvailable = true;
            console.log('✅ [SCANNER] WhatsApp client initialized successfully');
            
        } catch (error) {
            console.error('❌ [SCANNER] WhatsApp initialization failed:', error.message);
            this.whatsappAvailable = false;
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
            const { connection, lastDisconnect, qr } = update;
            
            console.log(`📡 [WHATSAPP] Connection update: ${connection}`);
            
            // Handle QR code
            if (qr) {
                console.log('📱 [SCANNER] QR Code received');
                this.handleQRCode(qr);
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
                
                if (shouldReconnect) {
                    setTimeout(() => {
                        console.log('🔄 [SCANNER] Attempting reconnect...');
                        this.initializeWhatsApp().catch(console.error);
                    }, 5000);
                }
            } else if (connection === 'open') {
                console.log('🔗 [SCANNER] WhatsApp connection opened');
                this.isAuthenticated = true;
                this.whatsappAvailable = true;
                
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
     * 🔢 Handle QR code generation - UPDATED WITH BETTER ERROR HANDLING
     */
    async handleQRCode(qr) {
        try {
            console.log('📱 [SCANNER] Generating QR code...');
            
            // Generate QR code as base64 with better error handling
            const qrImage = await qrcode.toDataURL(qr);
            this.currentQR = qrImage;
            this.currentPairingCode = generatePairingCode();
            
            // ✅ IMPROVED: Better QR data structure
            const qrData = {
                qrImage: qrImage,
                qrRaw: qr,
                pairingCode: this.currentPairingCode,
                phoneNumber: this.currentPhoneNumber, // ✅ ADDED: Include phone number
                timestamp: Date.now()
            };
            
            // Broadcast to all connected clients
            this.io.emit('qr_data', qrData);
            
            console.log(`🔢 [SCANNER] QR Code generated - Pairing code: ${this.currentPairingCode}`);
            
            // Also update status
            this.io.emit('status_update', {
                status: 'qr_ready',
                message: 'Scan QR code to connect WhatsApp',
                phoneNumber: this.currentPhoneNumber // ✅ ADDED: Include phone number in status
            });
            
        } catch (error) {
            console.error('❌ [SCANNER] QR code generation failed:', error);
            
            // ✅ IMPROVED: Fallback - send raw QR data for frontend generation
            this.io.emit('qr_data', {
                qrImage: null,
                qrRaw: qr,
                pairingCode: this.currentPairingCode,
                phoneNumber: this.currentPhoneNumber,
                error: 'QR image generation failed, using raw data',
                timestamp: Date.now()
            });
        }
    }

    /**
     * 🚀 Handle ready state
     */
    async handleReady() {
        try {
            console.log('🚀 [SCANNER] WhatsApp client is READY!');
            
            // Clear QR data
            this.currentQR = null;
            this.currentPairingCode = null;
            
            // Generate session ID for bots
            this.sessionId = generateSessionId();
            
            // Send introduction messages
            await this.sendIntroMessages();
            
            // ✅ ADDED: Get actual phone number from WhatsApp connection
            const actualPhoneNumber = this.client.user?.id?.replace(/:\d+$/, '') || 'unknown';
            
            // Broadcast ready state
            this.io.emit('ready', {
                status: 'connected',
                sessionId: this.sessionId,
                phoneNumber: actualPhoneNumber,
                message: 'SAVAGE BOTS SCANNER is now active!',
                timestamp: new Date()
            });
            
            console.log(`🆔 [SCANNER] Session ID generated: ${this.sessionId}`);
            console.log(`📱 [SCANNER] Connected as: ${actualPhoneNumber}`);
            
        } catch (error) {
            console.error('❌ [SCANNER] Ready state handling failed:', error);
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
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
                console.log('✅ [SCANNER] Introduction messages sent');
            }
        } catch (error) {
            console.warn('⚠️ [SCANNER] Failed to send intro messages:', error.message);
        }
    }

    /**
     * 📱 Handle phone number from client - ✅ NEW METHOD
     */
    handlePhoneNumber(phoneNumber) {
        console.log(`📱 [SCANNER] Phone number set: ${phoneNumber}`);
        this.currentPhoneNumber = phoneNumber;
        
        // Broadcast to all connected clients
        this.io.emit('phone_number_updated', { 
            phoneNumber: phoneNumber,
            timestamp: new Date().toISOString()
        });
        
        // If we have QR data, update it with the phone number
        if (this.currentQR) {
            this.io.emit('qr_data', {
                qrImage: this.currentQR,
                qrRaw: this.currentQR, // Reuse existing QR
                pairingCode: this.currentPairingCode,
                phoneNumber: phoneNumber,
                timestamp: Date.now()
            });
        }
    }

    /**
     * 🔌 Setup WebSocket communication - UPDATED WITH PHONE NUMBER HANDLING
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
                currentPhoneNumber: this.currentPhoneNumber // ✅ ADDED: Include phone number
            };
            
            socket.emit('scanner_status', status);

            if (this.isAuthenticated && this.sessionId) {
                socket.emit('ready', {
                    status: 'connected',
                    sessionId: this.sessionId,
                    phoneNumber: this.client.user?.id?.replace(/:\d+$/, '') || 'unknown',
                    message: 'Scanner is active and ready'
                });
            } else if (this.currentQR) {
                // Send QR code if available
                socket.emit('qr_data', {
                    qrImage: this.currentQR,
                    pairingCode: this.currentPairingCode,
                    phoneNumber: this.currentPhoneNumber, // ✅ ADDED: Include phone number
                    timestamp: Date.now()
                });
            }

            // ✅ ADDED: Handle phone number from client
            socket.on('set_phone_number', (data) => {
                this.handlePhoneNumber(data.phoneNumber);
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
                    currentPhoneNumber: this.currentPhoneNumber, // ✅ ADDED: Include phone number
                    timestamp: new Date()
                };
                socket.emit('status', status);
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
            console.log(`🦅 ${SCANNER_IDENTITY.MOTTO}`);
            console.log('🦅 ============================================================');
        });
    }

    /**
     * 🛑 Graceful shutdown
     */
    async shutdown() {
        console.log('🛑 [SCANNER] Shutting down gracefully...');
        
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
