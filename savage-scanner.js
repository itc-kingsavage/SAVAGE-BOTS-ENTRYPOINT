/**
 * 🦅 SAVAGE BOTS SCANNER - Main Server File
 * Multi-bot WhatsApp scanner with hacker theme
 * Fixed Baileys v5+ compatibility
 */

const express = require('express');
const socketIo = require('socket.io');
const http = require('http');
const path = require('path');
const qrcode = require('qrcode');
const fs = require('fs').promises;

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
            await this.initializeWhatsApp();
            await this.setupWebSocket();
            
            this.startServer();
            
        } catch (error) {
            console.error('💥 [SCANNER] Initialization failed:', error);
            process.exit(1);
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
            // Continue without database - sessions won't persist
            console.warn('⚠️ [SCANNER] Running in limited mode without database');
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

        // QR code endpoint
        this.app.get('/qr-code', async (req, res) => {
            if (this.currentQR) {
                res.json({ qrCode: this.currentQR });
            } else {
                res.json({ error: 'QR code not available' });
            }
        });

        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'operational',
                version: SCANNER_IDENTITY.VERSION,
                platform: DEPLOYMENT.getCurrentPlatform().NAME,
                timestamp: new Date()
            });
        });
    }

    /**
     * 📱 Initialize WhatsApp connection (Baileys v5+)
     */
    async initializeWhatsApp() {
        try {
            console.log('📱 [SCANNER] Initializing WhatsApp connection...');
            
            // ✅ CORRECT Baileys v5+ import
            const { default: makeWASocket, useSingleFileAuthState, DisconnectReason } = require('@adiwajshing/baileys');
            
            // Use file-based auth state
            const { state, saveState } = useSingleFileAuthState('./auth_info.json');
            
            this.client = makeWASocket({
                // Baileys configuration for anti-ban
                printQRInTerminal: false,
                auth: state,
                browser: WHATSAPP_CONFIG.BAILEYS.BROWSER,
                markOnlineOnConnect: WHATSAPP_CONFIG.BAILEYS.MARK_ONLINE_ON_CONNECT,
                syncFullHistory: WHATSAPP_CONFIG.BAILEYS.SYNC_FULL_HISTORY,
                logger: { level: 'fatal' }, // Reduce logging
                version: WHATSAPP_CONFIG.BAILEYS.VERSION
            });

        // Save auth state updates
        this.client.ev.on('creds.update', saveState);

        this.setupWhatsAppEvents();
        
        console.log('✅ [SCANNER] WhatsApp client initialized');
    } catch (error) {
        console.error('❌ [SCANNER] WhatsApp initialization failed:', error);
        throw error;
    }
}

    /**
     * 📨 Setup WhatsApp event handlers (Baileys v5+)
     */
    setupWhatsAppEvents() {
        const { DisconnectReason } = require('@adiwajshing/baileys');

        // Connection updates
        this.client.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            // Handle QR code
            if (qr) {
                console.log('📱 [SCANNER] QR Code received');
                this.handleQRCode(qr);
            }
            
            // Handle connection status
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log(`🔌 [SCANNER] Connection closed due to ${lastDisconnect?.error?.output?.statusCode}, reconnecting: ${shouldReconnect}`);
                
                this.io.emit('status_update', {
                    status: 'disconnected',
                    message: 'WhatsApp connection lost'
                });
                
                if (shouldReconnect) {
                    this.initializeWhatsApp();
                }
            } else if (connection === 'open') {
                console.log('🔗 [SCANNER] WhatsApp connection opened');
                this.isAuthenticated = true;
                
                this.io.emit('status_update', {
                    status: 'connected', 
                    message: 'WhatsApp connection established'
                });
                
                // Generate session ID and send ready event
                this.handleReady();
            }
        });

        // Message Handling
        this.client.ev.on('messages.upsert', async (m) => {
            const message = m.messages[0];
            if (!message || !message.message || message.key.remoteJid === 'status@broadcast') return;
            
            // Broadcast message to all connected bots
            this.io.emit('whatsapp_message', {
                from: message.key.remoteJid,
                body: message.message.conversation || 
                      message.message.extendedTextMessage?.text || 
                      message.message.imageMessage?.caption ||
                      '[Media Message]',
                timestamp: message.messageTimestamp,
                type: this.getMessageType(message),
                messageId: message.key.id
            });
        });

        // Credentials update
        this.client.ev.on('creds.update', () => {
            console.log('🔐 [SCANNER] Credentials updated');
        });
    }

    /**
     * 🔢 Handle QR code generation
     */
    async handleQRCode(qr) {
        try {
            // Generate QR code image
            const qrImage = await qrcode.toDataURL(qr);
            this.currentQR = qrImage;
            this.currentPairingCode = generatePairingCode();
            
            // Broadcast to all connected clients
            this.io.emit('qr_data', {
                qrImage: qrImage,
                qrRaw: qr,
                pairingCode: this.currentPairingCode,
                timestamp: Date.now()
            });
            
            console.log(`🔢 [SCANNER] Pairing code: ${this.currentPairingCode}`);
        } catch (error) {
            console.error('❌ [SCANNER] QR code generation failed:', error);
        }
    }

    /**
     * 🚀 Handle ready state
     */
    async handleReady() {
        console.log('🚀 [SCANNER] WhatsApp client is READY!');
        
        // Generate session ID for bots
        this.sessionId = generateSessionId();
        
        // Send introduction messages
        await this.sendIntroMessages();
        
        // Broadcast ready state
        this.io.emit('ready', {
            status: 'connected',
            sessionId: this.sessionId,
            phoneNumber: this.client.user?.id.split(':')[0] || 'unknown',
            message: 'SAVAGE BOTS SCANNER is now active!',
            timestamp: new Date()
        });
        
        console.log(`🆔 [SCANNER] Session ID: ${this.sessionId}`);
    }

    /**
     * 📧 Get message type
     */
    getMessageType(message) {
        if (message.message.conversation) return 'text';
        if (message.message.extendedTextMessage) return 'text';
        if (message.message.imageMessage) return 'image';
        if (message.message.videoMessage) return 'video';
        if (message.message.audioMessage) return 'audio';
        if (message.message.documentMessage) return 'document';
        return 'unknown';
    }

    /**
     * 💬 Send introduction messages after connection
     */
    async sendIntroMessages() {
        try {
            const introMessages = MESSAGES.INTRODUCTION;
            
            // Get all chats and send to the first available chat
            const chats = await this.client.getChats();
            if (chats.length > 0) {
                for (const message of introMessages) {
                    await this.client.sendMessage(chats[0].id, { text: message });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                console.log('✅ [SCANNER] Introduction messages sent');
            }
        } catch (error) {
            console.warn('⚠️ [SCANNER] Failed to send intro messages:', error.message);
        }
    }

    /**
     * 🔌 Setup WebSocket communication
     */
    setupWebSocket() {
        this.io.on('connection', (socket) => {
            console.log(`🤖 [SCANNER] New client connected: ${socket.id}`);
            
            // Send current QR if available
            if (this.currentQR) {
                socket.emit('qr_data', {
                    qrImage: this.currentQR,
                    pairingCode: this.currentPairingCode,
                    timestamp: Date.now()
                });
            }
            
            // Send current status
            if (this.isAuthenticated && this.sessionId) {
                socket.emit('ready', {
                    status: 'connected',
                    sessionId: this.sessionId,
                    phoneNumber: this.client.user?.id.split(':')[0] || 'unknown',
                    message: 'Scanner is active'
                });
            }

            // Handle bot registration
            socket.on('bot_register', (data) => {
                const { botName, sessionId } = data;
                
                if (sessionId === this.sessionId) {
                    this.connectedBots.add(botName);
                    console.log(`✅ [SCANNER] Bot connected: ${botName}`);
                    
                    // Broadcast bot status
                    this.io.emit('bot_status', {
                        botName: botName,
                        status: 'online',
                        lastSeen: new Date()
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
                    }
                } catch (error) {
                    console.error('❌ [SCANNER] Message send failed:', error);
                    socket.emit('error', { message: 'Failed to send message' });
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

            // Handle disconnect
            socket.on('disconnect', () => {
                console.log(`🔌 [SCANNER] Client disconnected: ${socket.id}`);
            });
        });

        console.log('✅ [SCANNER] WebSocket server setup completed');
    }

    /**
     * 🚀 Start the server
     */
    startServer() {
        const port = SERVER_CONFIG.PORT;
        const host = SERVER_CONFIG.HOST;
        
        this.server.listen(port, host, () => {
            console.log('🦅 ============================================================');
            console.log('🦅 SAVAGE BOTS SCANNER - OPERATIONAL');
            console.log('🦅 ============================================================');
            console.log(`📍 Server running on: http://${host}:${port}`);
            console.log('🔐 Password protected access');
            console.log('📱 WhatsApp scanner: WAITING FOR QR');
            console.log('🤖 Bots supported: SAVAGE-X, DE-UKNOWN-BOT, QUEEN-RIXIE');
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
            await this.client.logout();
            await this.client.end(new Error('Shutdown'));
        }
        
        if (this.server) {
            this.server.close();
        }
        
        process.exit(0);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    const scanner = global.savageScanner;
    if (scanner) scanner.shutdown();
});

process.on('SIGTERM', () => {
    const scanner = global.savageScanner;
    if (scanner) scanner.shutdown();
});

// Start the scanner
const savageScanner = new SavageBotsScanner();
global.savageScanner = savageScanner;

module.exports = SavageBotsScanner;
