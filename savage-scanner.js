/**
 * 🦅 SAVAGE BOTS SCANNER - Main Scanner Engine
 * Advanced Multi-Bot WhatsApp Scanner with Baileys Anti-Ban Technology
 * Hacker-themed real-time scanner with WebSocket support
 * "When ordinary isn't an option"
 */

// =============================================================================
// 📦 CORE IMPORTS & CONFIGURATION
// =============================================================================
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@adiwajshing/baileys');
const express = require('express');
const socketIo = require('socket.io');
const http = require('http');
const path = require('path');
const qrcode = require('qrcode');
const fs = require('fs').promises;
const crypto = require('crypto');

// Custom modules
const savageDatabase = require('./config/database');
const savageSessionManager = require('./auth/sessionManager');
const savagePasswordAuth = require('./auth/passwordAuth');
const { 
    SCANNER_IDENTITY, 
    SECURITY_CONFIG, 
    WHATSAPP_CONFIG, 
    SERVER_CONFIG, 
    BOT_CONFIG, 
    MESSAGES,
    DEPLOYMENT,
    generateSessionId 
} = require('./config/constants');

// Middleware
const { requirePasswordAuth, securityHeaders, requestLogger } = require('./middleware/passwordAuth');
const { validateWebSocketSession } = require('./middleware/sessionCheck');

// =============================================================================
// 🦅 SAVAGE BOTS SCANNER CLASS
// =============================================================================

class SavageBotsScanner {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: SERVER_CONFIG.CORS.origin,
                methods: SERVER_CONFIG.CORS.methods,
                credentials: SERVER_CONFIG.CORS.credentials
            },
            maxHttpBufferSize: BOT_CONFIG.WEBSOCKET.MAX_PAYLOAD,
            pingInterval: BOT_CONFIG.WEBSOCKET.PING_INTERVAL,
            pingTimeout: BOT_CONFIG.WEBSOCKET.PONG_TIMEOUT
        });

        // Scanner state
        this.client = null;
        this.authState = null;
        this.isAuthenticated = false;
        this.isReady = false;
        this.connectionRetries = 0;
        this.maxRetries = 5;

        // QR and pairing
        this.currentQR = null;
        this.currentPairingCode = null;
        this.qrGeneratedAt = null;
        this.qrTimeout = null;

        // Bot connections
        this.connectedBots = new Map();
        this.botStatus = {
            'SAVAGE-X': { status: 'offline', lastSeen: null, connection: null },
            'DE-UKNOWN-BOT': { status: 'offline', lastSeen: null, connection: null },
            'QUEEN-RIXIE': { status: 'offline', lastSeen: null, connection: null }
        };

        // Session management
        this.scannerSessionId = null;
        this.phoneNumber = null;

        this.initializeScanner();
    }

    /**
     * 🎯 INITIALIZE THE SCANNER
     */
    async initializeScanner() {
        try {
            console.log('🦅 ' + '='.repeat(60));
            console.log('🦅 SAVAGE BOTS SCANNER - INITIALIZING');
            console.log('🦅 ' + '='.repeat(60));
            console.log(`🦅 Version: ${SCANNER_IDENTITY.VERSION}`);
            console.log(`🦅 Platform: ${DEPLOYMENT.getCurrentPlatform().NAME}`);
            console.log(`🦅 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log('🦅 ' + '='.repeat(60));

            // Validate environment
            DEPLOYMENT.validateEnvironment();

            // Initialize database
            await this.initializeDatabase();

            // Setup Express server
            await this.setupExpress();

            // Setup WebSocket server
            await this.setupWebSocket();

            // Initialize WhatsApp client
            await this.initializeWhatsApp();

            // Start background tasks
            this.startBackgroundTasks();

            console.log('✅ [SCANNER] Initialization complete - Scanner is READY!');

        } catch (error) {
            console.error('💥 [SCANNER] Initialization failed:', error);
            process.exit(1);
        }
    }

    /**
     * 🗄️ INITIALIZE DATABASE CONNECTION
     */
    async initializeDatabase() {
        try {
            console.log('🗄️ [SCANNER] Connecting to MongoDB Atlas...');
            await savageDatabase.connect();
            
            const dbHealth = await savageDatabase.healthCheck();
            if (dbHealth.healthy) {
                console.log('✅ [SCANNER] MongoDB connected successfully');
            } else {
                throw new Error('Database health check failed');
            }

        } catch (error) {
            console.error('❌ [SCANNER] Database connection failed:', error);
            throw error;
        }
    }

    /**
     * 🌐 SETUP EXPRESS SERVER
     */
    async setupExpress() {
        try {
            // Security middleware
            this.app.use(securityHeaders);
            this.app.use(requestLogger);
            
            // Body parsing
            this.app.use(express.json({ limit: '10mb' }));
            this.app.use(express.urlencoded({ extended: true }));

            // Static files - Hacker-themed UI
            this.app.use(express.static(path.join(__dirname, 'public'), {
                maxAge: SERVER_CONFIG.STATIC.MAX_AGE,
                etag: SERVER_CONFIG.STATIC.ETAG
            }));

            // API routes
            const apiRoutes = require('./routes/api');
            const authRoutes = require('./routes/auth');
            const scannerRoutes = require('./routes/scanner');
            
            this.app.use('/api', apiRoutes);
            this.app.use('/api/auth', authRoutes);
            this.app.use('/api/scanner', requirePasswordAuth, scannerRoutes);

            // Root route - redirect to password portal
            this.app.get('/', (req, res) => {
                res.redirect('/password.html');
            });

            // Health check endpoint
            this.app.get('/health', async (req, res) => {
                const health = await this.getHealthStatus();
                res.json(health);
            });

            // Scanner status endpoint
            this.app.get('/status', (req, res) => {
                res.json(this.getScannerStatus());
            });

            // 404 handler
            this.app.use('*', (req, res) => {
                res.status(404).json({
                    success: false,
                    error: 'Endpoint not found',
                    code: 'NOT_FOUND'
                });
            });

            console.log('✅ [SCANNER] Express server configured');

        } catch (error) {
            console.error('❌ [SCANNER] Express setup failed:', error);
            throw error;
        }
    }

    /**
     * 🔌 SETUP WEB SOCKET SERVER
     */
    async setupWebSocket() {
        try {
            // WebSocket authentication middleware
            this.io.use(validateWebSocketSession);

            // WebSocket connection handler
            this.io.on('connection', (socket) => {
                console.log(`🔌 [WS] Bot connected: ${socket.botName || 'Unknown'} - Session: ${socket.sessionId}`);

                // Store bot connection
                if (socket.botName) {
                    this.connectedBots.set(socket.sessionId, {
                        socket: socket,
                        botName: socket.botName,
                        connectedAt: new Date(),
                        session: socket.session
                    });

                    this.updateBotStatus(socket.botName, 'online', socket.sessionId);
                }

                // Handle bot messages
                socket.on('bot_message', (data) => {
                    this.handleBotMessage(socket, data);
                });

                // Handle status updates
                socket.on('status_update', (data) => {
                    this.handleBotStatusUpdate(socket, data);
                });

                // Handle disconnect
                socket.on('disconnect', (reason) => {
                    this.handleBotDisconnect(socket, reason);
                });

                // Send current scanner status to newly connected bot
                socket.emit('scanner_status', this.getScannerStatus());

                // Send QR code if available
                if (this.currentQR) {
                    socket.emit('qr_data', {
                        qrImage: this.currentQR,
                        pairingCode: this.currentPairingCode,
                        timestamp: this.qrGeneratedAt
                    });
                }
            });

            console.log('✅ [SCANNER] WebSocket server configured');

        } catch (error) {
            console.error('❌ [SCANNER] WebSocket setup failed:', error);
            throw error;
        }
    }

    /**
     * 📱 INITIALIZE WHATSAPP CLIENT
     */
    async initializeWhatsApp() {
        try {
            console.log('📱 [SCANNER] Initializing WhatsApp Baileys client...');

            // Try to restore existing session first
            const restored = await this.restoreExistingSession();
            
            if (!restored) {
                console.log('🔍 [SCANNER] No existing session found, generating new QR...');
                await this.createNewSession();
            }

        } catch (error) {
            console.error('❌ [SCANNER] WhatsApp initialization failed:', error);
            throw error;
        }
    }

    /**
     * 🔄 RESTORE EXISTING SESSION
     */
    async restoreExistingSession() {
        try {
            // Try to get the scanner session
            const sessionId = 'SAVAGE-SCANNER-MAIN';
            const session = await savageSessionManager.getSession(sessionId);

            if (session && session.isActive) {
                console.log('🔄 [SCANNER] Restoring existing WhatsApp session...');
                
                this.authState = await useMultiFileAuthState('./savage-session');
                await this.createWhatsAppClient();

                // Verify session is still valid
                if (this.client.user) {
                    this.isAuthenticated = true;
                    this.phoneNumber = this.client.user.id;
                    this.scannerSessionId = sessionId;
                    
                    console.log(`✅ [SCANNER] Session restored successfully for: ${this.phoneNumber}`);
                    this.emitReadyState();
                    return true;
                }
            }

            return false;

        } catch (error) {
            console.error('❌ [SCANNER] Session restoration failed:', error);
            return false;
        }
    }

    /**
     * 🆕 CREATE NEW SESSION
     */
    async createNewSession() {
        try {
            this.authState = await useMultiFileAuthState('./savage-session');
            await this.createWhatsAppClient();
            this.setupWhatsAppEvents();

        } catch (error) {
            console.error('❌ [SCANNER] New session creation failed:', error);
            throw error;
        }
    }

    /**
     * 🔧 CREATE WHATSAPP CLIENT
     */
    async createWhatsAppClient() {
        const { state, saveCreds } = this.authState;

        this.client = makeWASocket({
            auth: state,
            printQRInTerminal: false, // We'll handle QR display ourselves
            logger: { level: 'silent' }, // Reduce logging for anti-ban
            browser: Browsers.ubuntu('Chrome'),
            markOnlineOnConnect: WHATSAPP_CONFIG.BAILEYS.MARK_ONLINE_ON_CONNECT,
            syncFullHistory: WHATSAPP_CONFIG.BAILEYS.SYNC_FULL_HISTORY,
            linkPreviewImageThumbnailWidth: WHATSAPP_CONFIG.BAILEYS.LINK_PREVIEW_IMAGE_THUMBNAIL_WIDTH,
            generateHighQualityLinkPreview: true,
            getMessage: async (key) => {
                return {
                    conversation: 'SAVAGE BOTS SCANNER MESSAGE'
                };
            }
        });

        // Handle credential updates
        this.client.ev.on('creds.update', saveCreds);

        this.setupWhatsAppEvents();
    }

    /**
     * 🎛️ SETUP WHATSAPP EVENT HANDLERS
     */
    setupWhatsAppEvents() {
        // QR Code Generation
        this.client.ev.on('qr', (qr) => {
            this.handleQRCode(qr);
        });

        // Connection Updates
        this.client.ev.on('connection.update', (update) => {
            this.handleConnectionUpdate(update);
        });

        // Credentials Update
        this.client.ev.on('creds.update', this.authState.saveCreds);

        // Message Handling
        this.client.ev.on('messages.upsert', (data) => {
            this.handleIncomingMessage(data);
        });

        // Group Updates
        this.client.ev.on('groups.update', (updates) => {
            this.handleGroupUpdates(updates);
        });
    }

    /**
     * 📱 HANDLE QR CODE GENERATION
     */
    async handleQRCode(qr) {
        try {
            console.log('📱 [SCANNER] New QR code generated');

            // Generate QR code image
            this.currentQR = await qrcode.toDataURL(qr);
            this.currentPairingCode = this.generatePairingCode();
            this.qrGeneratedAt = new Date();

            // Clear previous timeout
            if (this.qrTimeout) {
                clearTimeout(this.qrTimeout);
            }

            // Set QR timeout (5 minutes)
            this.qrTimeout = setTimeout(() => {
                console.log('⏰ [SCANNER] QR code expired, regenerating...');
                this.currentQR = null;
                this.currentPairingCode = null;
                this.emitToBots('qr_expired', { message: 'QR code expired' });
            }, WHATSAPP_CONFIG.QR.TIMEOUT);

            // Emit QR data to all connected bots and web clients
            this.emitToAll('qr_data', {
                qrImage: this.currentQR,
                qrRaw: qr,
                pairingCode: this.currentPairingCode,
                timestamp: this.qrGeneratedAt,
                expiresIn: WHATSAPP_CONFIG.QR.TIMEOUT
            });

            console.log(`✅ [SCANNER] QR code ready - Pairing Code: ${this.currentPairingCode}`);

        } catch (error) {
            console.error('❌ [SCANNER] QR code handling failed:', error);
        }
    }

    /**
     * 🔌 HANDLE CONNECTION UPDATES
     */
    async handleConnectionUpdate(update) {
        const { connection, lastDisconnect, qr } = update;

        console.log(`🔌 [SCANNER] Connection update: ${connection}`);

        if (qr) {
            // QR code is handled separately
            return;
        }

        switch (connection) {
            case 'close':
                const shouldReconnect = await this.handleConnectionClose(lastDisconnect);
                if (shouldReconnect) {
                    setTimeout(() => this.initializeWhatsApp(), 5000);
                }
                break;

            case 'connecting':
                this.emitToAll('status_update', {
                    status: 'connecting',
                    message: 'Connecting to WhatsApp...'
                });
                break;

            case 'open':
                await this.handleConnectionOpen();
                break;
        }
    }

    /**
     * 🔄 HANDLE CONNECTION CLOSE
     */
    async handleConnectionClose(lastDisconnect) {
        const statusCode = lastDisconnect?.error?.output?.statusCode;

        console.log(`🔌 [SCANNER] Connection closed - Status: ${statusCode}`);

        if (statusCode === DisconnectReason.loggedOut) {
            console.log('🚪 [SCANNER] Logged out from WhatsApp, clearing session...');
            
            // Clear session data
            await savageSessionManager.deleteSession(this.scannerSessionId);
            this.isAuthenticated = false;
            this.isReady = false;
            
            this.emitToAll('status_update', {
                status: 'logged_out',
                message: 'Logged out from WhatsApp'
            });

            // Generate new QR after logout
            setTimeout(() => this.createNewSession(), 3000);
            return true;

        } else if (this.connectionRetries < this.maxRetries) {
            this.connectionRetries++;
            console.log(`🔄 [SCANNER] Reconnecting... (Attempt ${this.connectionRetries}/${this.maxRetries})`);
            
            this.emitToAll('status_update', {
                status: 'reconnecting',
                message: `Reconnecting... Attempt ${this.connectionRetries}`
            });

            return true;
        } else {
            console.error('💥 [SCANNER] Max reconnection attempts reached');
            
            this.emitToAll('status_update', {
                status: 'disconnected',
                message: 'Failed to reconnect to WhatsApp'
            });

            return false;
        }
    }

    /**
     * ✅ HANDLE CONNECTION OPEN
     */
    async handleConnectionOpen() {
        try {
            console.log('✅ [SCANNER] WhatsApp connected successfully!');
            
            this.isAuthenticated = true;
            this.isReady = true;
            this.connectionRetries = 0;
            this.phoneNumber = this.client.user.id;

            // Generate scanner session ID
            this.scannerSessionId = generateSessionId();

            // Save session to database
            await this.saveScannerSession();

            // Clear QR code
            this.currentQR = null;
            this.currentPairingCode = null;
            if (this.qrTimeout) {
                clearTimeout(this.qrTimeout);
                this.qrTimeout = null;
            }

            // Send introduction messages
            await this.sendIntroductionMessages();

            // Emit ready state
            this.emitReadyState();

            console.log(`🎉 [SCANNER] READY! Phone: ${this.phoneNumber} - Session: ${this.scannerSessionId}`);

        } catch (error) {
            console.error('❌ [SCANNER] Connection open handling failed:', error);
        }
    }

    /**
     * 💾 SAVE SCANNER SESSION
     */
    async saveScannerSession() {
        try {
            const sessionData = {
                phoneNumber: this.phoneNumber,
                user: this.client.user,
                platform: DEPLOYMENT.getCurrentPlatform().NAME,
                connectedAt: new Date()
            };

            await savageSessionManager.createSession(sessionData, {
                sessionId: this.scannerSessionId,
                phoneNumber: this.phoneNumber,
                botName: 'SCANNER',
                platform: DEPLOYMENT.getCurrentPlatform().NAME
            });

            console.log('💾 [SCANNER] Session saved to database');

        } catch (error) {
            console.error('❌ [SCANNER] Session save failed:', error);
        }
    }

    /**
     * 📨 SEND INTRODUCTION MESSAGES
     */
    async sendIntroductionMessages() {
        try {
            console.log('📨 [SCANNER] Sending introduction messages...');

            const chats = await this.client.getChats();
            if (chats.length > 0) {
                const myChat = chats.find(chat => chat.id === this.client.user.id) || chats[0];

                for (const [index, message] of MESSAGES.INTRODUCTION.entries()) {
                    const formattedMessage = message.replace('[AUTO-GENERATED]', this.scannerSessionId);
                    
                    await this.client.sendMessage(myChat.id, { 
                        text: formattedMessage 
                    });

                    console.log(`✅ [SCANNER] Intro message ${index + 1} sent`);

                    // Delay between messages
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }

            console.log('✅ [SCANNER] All introduction messages sent');

        } catch (error) {
            console.error('❌ [SCANNER] Failed to send introduction messages:', error);
        }
    }

    /**
     * 🚀 EMIT READY STATE
     */
    emitReadyState() {
        this.emitToAll('ready', {
            status: 'connected',
            sessionId: this.scannerSessionId,
            phoneNumber: this.phoneNumber,
            message: 'SAVAGE BOTS SCANNER is now active and ready!',
            bots: Object.keys(this.botStatus),
            timestamp: new Date()
        });

        // Update all bots to online status
        Object.keys(this.botStatus).forEach(botName => {
            this.updateBotStatus(botName, 'online');
        });
    }

    /**
     * 📩 HANDLE INCOMING MESSAGES
     */
    async handleIncomingMessage(data) {
        try {
            const { messages } = data;
            
            for (const message of messages) {
                if (!message.message || message.key.fromMe) {
                    continue; // Ignore empty messages and our own messages
                }

                console.log(`📩 [SCANNER] Message from ${message.key.remoteJid}: ${message.message.conversation || 'Media/System'}`);

                // Broadcast message to all connected bots
                this.emitToBots('whatsapp_message', {
                    from: message.key.remoteJid,
                    body: message.message.conversation,
                    timestamp: message.messageTimestamp,
                    type: 'text',
                    messageId: message.key.id,
                    sender: message.pushName
                });

                // Auto-reply to specific commands
                await this.handleAutoReply(message);
            }

        } catch (error) {
            console.error('❌ [SCANNER] Message handling failed:', error);
        }
    }

    /**
     * 🤖 HANDLE AUTO-REPLY
     */
    async handleAutoReply(message) {
        try {
            const text = message.message.conversation?.toLowerCase() || '';
            const chatId = message.key.remoteJid;

            if (text.includes('!status') || text.includes('!scanner')) {
                const status = this.getScannerStatus();
                await this.client.sendMessage(chatId, {
                    text: `🦅 SAVAGE BOTS SCANNER STATUS\n\n` +
                          `📱 Phone: ${status.phoneNumber}\n` +
                          `🔄 Status: ${status.status}\n` +
                          `🤖 Bots Online: ${status.onlineBots}\n` +
                          `🔗 Session: ${status.sessionId}\n` +
                          `⏰ Uptime: ${Math.floor(status.uptime / 60)} minutes`
                });
            }

            if (text.includes('!help') || text.includes('!commands')) {
                await this.client.sendMessage(chatId, {
                    text: `🦅 SAVAGE BOTS COMMANDS\n\n` +
                          `!status - Scanner status\n` +
                          `!bots - Bot information\n` +
                          `!session - Session details\n` +
                          `!help - This message\n\n` +
                          `Powered by SAVAGE BOTS TECHNOLOGY`
                });
            }

        } catch (error) {
            console.error('❌ [SCANNER] Auto-reply failed:', error);
        }
    }

    /**
     * 🔄 HANDLE BOT MESSAGES
     */
    async handleBotMessage(socket, data) {
        try {
            const { to, message, type = 'text' } = data;

            if (!to || !message) {
                socket.emit('error', { message: 'Missing recipient or message' });
                return;
            }

            console.log(`🤖 [BOT] ${socket.botName} sending message to ${to}`);

            // Send message via WhatsApp
            await this.client.sendMessage(to, { text: message });

            // Confirm delivery to bot
            socket.emit('message_sent', {
                to: to,
                messageId: Date.now().toString(),
                timestamp: new Date()
            });

        } catch (error) {
            console.error(`❌ [BOT] Message from ${socket.botName} failed:`, error);
            socket.emit('error', { message: 'Failed to send message', error: error.message });
        }
    }

    /**
     * 📊 HANDLE BOT STATUS UPDATES
     */
    handleBotStatusUpdate(socket, data) {
        const { status, details } = data;
        
        console.log(`🤖 [BOT] ${socket.botName} status: ${status}`);
        
        this.updateBotStatus(socket.botName, status, socket.sessionId, details);
        
        // Broadcast status to all clients
        this.emitToAll('bot_status', {
            botName: socket.botName,
            status: status,
            lastSeen: new Date(),
            details: details
        });
    }

    /**
     * 🔌 HANDLE BOT DISCONNECT
     */
    handleBotDisconnect(socket, reason) {
        console.log(`🔌 [BOT] ${socket.botName} disconnected: ${reason}`);

        // Remove from connected bots
        this.connectedBots.delete(socket.sessionId);

        // Update bot status
        this.updateBotStatus(socket.botName, 'offline', socket.sessionId);

        // Notify all clients
        this.emitToAll('bot_disconnected', {
            botName: socket.botName,
            reason: reason,
            timestamp: new Date()
        });
    }

    /**
     * 🔄 UPDATE BOT STATUS
     */
    updateBotStatus(botName, status, sessionId = null, details = null) {
        if (this.botStatus[botName]) {
            this.botStatus[botName].status = status;
            this.botStatus[botName].lastSeen = new Date();
            this.botStatus[botName].sessionId = sessionId;
            this.botStatus[botName].details = details;

            console.log(`🤖 [BOT-STATUS] ${botName} -> ${status}`);
        }
    }

    /**
     * 🔄 START BACKGROUND TASKS
     */
    startBackgroundTasks() {
        // Session cleanup every hour
        setInterval(async () => {
            try {
                await savageSessionManager.cleanupExpiredSessions();
            } catch (error) {
                console.error('❌ [BACKGROUND] Session cleanup failed:', error);
            }
        }, 60 * 60 * 1000);

        // Health monitoring every 5 minutes
        setInterval(async () => {
            try {
                await this.monitorHealth();
            } catch (error) {
                console.error('❌ [BACKGROUND] Health monitoring failed:', error);
            }
        }, 5 * 60 * 1000);

        // Bot status check every 30 seconds
        setInterval(() => {
            this.checkBotConnections();
        }, 30 * 1000);

        console.log('✅ [SCANNER] Background tasks started');
    }

    /**
     * 🏥 MONITOR HEALTH
     */
    async monitorHealth() {
        const health = await this.getHealthStatus();
        
        if (!health.healthy) {
            console.warn('⚠️ [HEALTH] Scanner health issues detected:', health.issues);
        }

        // Emit health status to admin clients
        this.emitToBots('health_status', health);
    }

    /**
     * 🔍 CHECK BOT CONNECTIONS
     */
    checkBotConnections() {
        const now = Date.now();
        
        this.connectedBots.forEach((bot, sessionId) => {
            const lastSeen = new Date(bot.connectedAt).getTime();
            const inactiveTime = now - lastSeen;

            // Mark as inactive if no activity for 2 minutes
            if (inactiveTime > 2 * 60 * 1000) {
                this.updateBotStatus(bot.botName, 'inactive', sessionId);
            }
        });
    }

    /**
     * 🏥 GET HEALTH STATUS
     */
    async getHealthStatus() {
        const dbHealth = await savageDatabase.healthCheck();
        const sessionHealth = await savageSessionManager.healthCheck();
        const authHealth = savagePasswordAuth.healthCheck();

        const issues = [];

        if (!dbHealth.healthy) issues.push('Database connection issues');
        if (sessionHealth.status !== 'healthy') issues.push('Session manager issues');
        if (!this.isReady) issues.push('WhatsApp not connected');
        if (this.connectionRetries > 0) issues.push('Connection instability');

        return {
            healthy: issues.length === 0,
            issues: issues,
            timestamp: new Date(),
            components: {
                database: dbHealth,
                sessionManager: sessionHealth,
                authentication: authHealth,
                whatsapp: {
                    connected: this.isReady,
                    phoneNumber: this.phoneNumber,
                    retries: this.connectionRetries
                },
                bots: {
                    total: Object.keys(this.botStatus).length,
                    online: Object.values(this.botStatus).filter(b => b.status === 'online').length,
                    status: this.botStatus
                }
            }
        };
    }

    /**
     * 📊 GET SCANNER STATUS
     */
    getScannerStatus() {
        const onlineBots = Object.values(this.botStatus).filter(bot => 
            ['online', 'connected'].includes(bot.status)
        ).length;

        return {
            status: this.isReady ? 'connected' : 'disconnected',
            phoneNumber: this.phoneNumber,
            sessionId: this.scannerSessionId,
            isAuthenticated: this.isAuthenticated,
            qrAvailable: !!this.currentQR,
            pairingCode: this.currentPairingCode,
            connectedBots: this.connectedBots.size,
            onlineBots: onlineBots,
            totalBots: Object.keys(this.botStatus).length,
            uptime: process.uptime(),
            timestamp: new Date()
        };
    }

    /**
     * 📢 EMIT TO ALL CONNECTED CLIENTS
     */
    emitToAll(event, data) {
        this.io.emit(event, data);
    }

    /**
     * 🤖 EMIT TO ALL BOTS
     */
    emitToBots(event, data) {
        this.connectedBots.forEach((bot) => {
            bot.socket.emit(event, data);
        });
    }

    /**
     * 🔢 GENERATE PAIRING CODE
     */
    generatePairingCode() {
        const chars = WHATSAPP_CONFIG.PAIRING.CHARSET;
        let code = '';
        
        for (let i = 0; i < WHATSAPP_CONFIG.PAIRING.LENGTH; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        
        return code;
    }

    /**
     * 🚀 START THE SCANNER
     */
    start(port = SERVER_CONFIG.PORT) {
        this.server.listen(port, SERVER_CONFIG.HOST, () => {
            console.log('🦅 ' + '='.repeat(60));
            console.log('🦅 SAVAGE BOTS SCANNER - OPERATIONAL');
            console.log('🦅 ' + '='.repeat(60));
            console.log(`📍 Server running on: http://${SERVER_CONFIG.HOST}:${port}`);
            console.log(`🔐 Password protected access`);
            console.log(`📱 WhatsApp scanner: ${this.isReady ? 'READY' : 'WAITING FOR QR'}`);
            console.log(`🤖 Bots supported: ${Object.keys(this.botStatus).join(', ')}`);
            console.log(`🦅 ${SCANNER_IDENTITY.MOTTO}`);
            console.log('🦅 ' + '='.repeat(60));
        });

        // Graceful shutdown
        process.on('SIGINT', () => this.shutdown());
        process.on('SIGTERM', () => this.shutdown());
    }

    /**
     * 🛑 GRACEFUL SHUTDOWN
     */
    async shutdown() {
        console.log('🛑 [SCANNER] Shutting down gracefully...');

        // Close WebSocket connections
        this.connectedBots.forEach((bot) => {
            bot.socket.disconnect(true);
        });

        // Close WhatsApp connection
        if (this.client) {
            this.client.end('Scanner shutdown');
        }

        // Close database connection
        await savageDatabase.disconnect();

        // Close HTTP server
        this.server.close(() => {
            console.log('✅ [SCANNER] Shutdown complete');
            process.exit(0);
        });

        // Force exit after 10 seconds
        setTimeout(() => {
            console.log('💥 [SCANNER] Forced shutdown');
            process.exit(1);
        }, 10000);
    }
}

// =============================================================================
// 🚀 APPLICATION STARTUP
// =============================================================================

// Create and start the scanner
const savageScanner = new SavageBotsScanner();

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('💥 [UNCAUGHT EXCEPTION]:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 [UNHANDLED REJECTION] at:', promise, 'reason:', reason);
    process.exit(1);
});

// Start the scanner
savageScanner.start(process.env.PORT || SERVER_CONFIG.PORT);

module.exports = SavageBotsScanner;
