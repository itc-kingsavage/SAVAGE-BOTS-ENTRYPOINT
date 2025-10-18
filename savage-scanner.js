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
        this.currentPhoneNumber = null;
        this.ownerPhoneNumber = null; // ✅ ADDED: Store owner's number separately
        
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

        // Logout endpoint - ✅ ADDED: Proper logout
        this.app.post('/logout', (req, res) => {
            try {
                // Clear server-side authentication
                this.isAuthenticated = false;
                this.sessionId = null;
                this.currentPhoneNumber = null;
                this.ownerPhoneNumber = null;
                
                // Clear WhatsApp connection
                if (this.client) {
                    this.client.logout();
                    this.client = null;
                }
                
                // Notify all clients
                this.io.emit('logout', { message: 'Logged out successfully' });
                
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
                currentPhoneNumber: this.currentPhoneNumber,
                ownerPhoneNumber: this.ownerPhoneNumber, // ✅ ADDED
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
            
            // ✅ FIXED: Auto-generate QR code when available
            if (qr) {
                console.log('📱 [SCANNER] QR Code received - Auto-generating...');
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
        if (msg.videoMessage) return '[Video Video]';
        if (msg.audioMessage) return '[Audio Message]';
        if (msg.documentMessage) return '[Document Message]';
        if (msg.stickerMessage) return '[Sticker Message]';
        
        return '[Unsupported Message Type]';
    }

    /**
     * 🔢 Handle QR code generation - ✅ FIXED: Auto-generate QR codes
     */
    async handleQRCode(qr) {
        try {
            console.log('📱 [SCANNER] Generating QR code...');
            
            // ✅ FIXED: Better QR generation with error handling
            let qrImage = null;
            try {
                qrImage = await qrcode.toDataURL(qr);
            } catch (qrError) {
                console.warn('⚠️ [SCANNER] QR image generation failed, using raw data:', qrError.message);
            }
            
            this.currentQR = qrImage;
            this.currentPairingCode = generatePairingCode();
            
            // ✅ IMPROVED: Always send QR data even if image fails
            const qrData = {
                qrImage: qrImage,
                qrRaw: qr,
                pairingCode: this.currentPairingCode,
                phoneNumber: this.currentPhoneNumber,
                ownerPhoneNumber: this.ownerPhoneNumber,
                timestamp: Date.now(),
                autoGenerated: true // ✅ ADDED: Indicate this was auto-generated
            };
            
            // Broadcast to all connected clients
            this.io.emit('qr_data', qrData);
            
            console.log(`🔢 [SCANNER] QR Code generated - Pairing code: ${this.currentPairingCode}`);
            
            // Update status
            this.io.emit('status_update', {
                status: 'qr_ready',
                message: 'QR code automatically generated - Ready for scanning',
                phoneNumber: this.currentPhoneNumber
            });
            
        } catch (error) {
            console.error('❌ [SCANNER] QR code handling failed:', error);
            
            // ✅ FIXED: Emergency fallback
            this.io.emit('qr_data', {
                qrImage: null,
                qrRaw: qr,
                pairingCode: this.currentPairingCode,
                phoneNumber: this.currentPhoneNumber,
                error: 'QR generation failed - Use manual pairing',
                timestamp: Date.now()
            });
        }
    }

    /**
     * 🆕 GENERATE PAIRING CODE FOR SPECIFIC NUMBER
     */
    async generatePairingForNumber(phoneNumber) {
        try {
            console.log(`📱 [SCANNER] Generating pairing for: ${phoneNumber}`);
            
            // Store as owner's number
            this.ownerPhoneNumber = phoneNumber;
            this.currentPhoneNumber = phoneNumber;
            
            // Generate new pairing code
            this.currentPairingCode = generatePairingCode();
            
            // If we have an active QR, update it
            if (this.currentQR) {
                this.io.emit('qr_data', {
                    qrImage: this.currentQR,
                    qrRaw: this.currentQR,
                    pairingCode: this.currentPairingCode,
                    phoneNumber: phoneNumber,
                    ownerPhoneNumber: phoneNumber,
                    timestamp: Date.now(),
                    manualRequest: true // ✅ ADDED: Indicate manual generation
                });
            }
            
            // Broadcast updates
            this.io.emit('phone_number_updated', { 
                phoneNumber: phoneNumber,
                ownerPhoneNumber: phoneNumber,
                pairingCode: this.currentPairingCode,
                timestamp: new Date().toISOString()
            });
            
            this.io.emit('status_update', {
                status: 'pairing_ready',
                message: `Pairing code generated for ${phoneNumber}`,
                phoneNumber: phoneNumber
            });
            
            return {
                success: true,
                pairingCode: this.currentPairingCode,
                phoneNumber: phoneNumber,
                message: 'Pairing code ready for ' + phoneNumber
            };
            
        } catch (error) {
            console.error('❌ [SCANNER] Pairing generation failed:', error);
            return {
                success: false,
                error: 'Failed to generate pairing code'
            };
        }
    }

    /**
     * 🚀 Handle ready state - ✅ UPDATED: Send session to owner + syncing
     */
    async handleReady() {
        try {
            console.log('🚀 [SCANNER] WhatsApp client is READY!');
            
            // ✅ ADDED: Syncing phase
            this.io.emit('status_update', {
                status: 'syncing',
                message: 'Syncing with WhatsApp...',
                phoneNumber: this.currentPhoneNumber
            });
            
            // Get actual phone number from WhatsApp connection
            const actualPhoneNumber = this.client.user?.id?.replace(/:\d+$/, '') || 'unknown';
            
            // Generate session ID for bots
            this.sessionId = generateSessionId();
            
            // ✅ ADDED: Send session ID to owner's WhatsApp
            await this.sendSessionToOwner(actualPhoneNumber);
            
            // Send introduction messages
            await this.sendIntroMessages();
            
            // ✅ ADDED: Syncing confirmation
            await this.sendSyncingConfirmation();
            
            // Clear QR data
            this.currentQR = null;
            this.currentPairingCode = null;
            
            // Broadcast ready state
            this.io.emit('ready', {
                status: 'connected',
                sessionId: this.sessionId,
                phoneNumber: actualPhoneNumber,
                ownerPhoneNumber: this.ownerPhoneNumber,
                message: '✅ SAVAGE BOTS SCANNER is now active and synced!',
                timestamp: new Date()
            });
            
            console.log(`🆔 [SCANNER] Session ID generated: ${this.sessionId}`);
            console.log(`📱 [SCANNER] Connected as: ${actualPhoneNumber}`);
            console.log(`👑 [SCANNER] Owner notified: ${this.ownerPhoneNumber}`);
            
        } catch (error) {
            console.error('❌ [SCANNER] Ready state handling failed:', error);
        }
    }

    /**
     * 🆕 SEND SESSION ID TO OWNER'S WHATSAPP
     */
    async sendSessionToOwner(connectedNumber) {
        try {
            if (!this.ownerPhoneNumber) {
                console.warn('⚠️ [SCANNER] No owner phone number set for session notification');
                return;
            }

            const sessionMessage = `
🦅 *SAVAGE BOTS SCANNER - SESSION ACTIVATED*

✅ *Connection Successful!*
📱 Connected Number: ${connectedNumber}
👑 Owner Number: ${this.ownerPhoneNumber}
🆔 Session ID: ${this.sessionId}
⏰ Activated: ${new Date().toLocaleString()}

🔒 *Security Note:* Keep this session ID secure. It's used for bot connections.

⚡ *Next Steps:* Your bots can now connect using this session ID.

🦅 *SAVAGE BOTS TECHNOLOGY*
"When ordinary isn't an option"
            `.trim();

            // Send to owner's number
            await this.client.sendMessage(this.ownerPhoneNumber + '@s.whatsapp.net', { 
                text: sessionMessage 
            });
            
            console.log(`✅ [SCANNER] Session ID sent to owner: ${this.ownerPhoneNumber}`);
            
        } catch (error) {
            console.error('❌ [SCANNER] Failed to send session to owner:', error.message);
        }
    }

    /**
     * 🆕 SEND SYNCING CONFIRMATION
     */
    async sendSyncingConfirmation() {
        try {
            const syncMessage = `
🔄 *SAVAGE BOTS SCANNER - SYNCING COMPLETE*

✅ All systems are now synchronized
📱 WhatsApp: Connected and Ready
🤖 Bots: Ready for Connection  
🔧 Scanner: Operational
🦅 Status: FULLY OPERATIONAL

⚡ You can now connect your bots using the session ID.

🦅 *SAVAGE BOTS TECHNOLOGY*
            `.trim();

            // Send to connected number
            const userJid = this.client.user?.id;
            if (userJid) {
                await this.client.sendMessage(userJid, { text: syncMessage });
                console.log('✅ [SCANNER] Syncing confirmation sent');
            }
            
        } catch (error) {
            console.warn('⚠️ [SCANNER] Failed to send syncing confirmation:', error.message);
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
     * 📱 Handle phone number from client
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
                qrRaw: this.currentQR,
                pairingCode: this.currentPairingCode,
                phoneNumber: phoneNumber,
                timestamp: Date.now()
            });
        }
    }

    /**
     * 🔌 Setup WebSocket communication - ✅ UPDATED: Added pairing generation & logout
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
                ownerPhoneNumber: this.ownerPhoneNumber
            };
            
            socket.emit('scanner_status', status);

            if (this.isAuthenticated && this.sessionId) {
                socket.emit('ready', {
                    status: 'connected',
                    sessionId: this.sessionId,
                    phoneNumber: this.client.user?.id?.replace(/:\d+$/, '') || 'unknown',
                    ownerPhoneNumber: this.ownerPhoneNumber,
                    message: 'Scanner is active and ready'
                });
            } else if (this.currentQR) {
                // Send QR code if available
                socket.emit('qr_data', {
                    qrImage: this.currentQR,
                    pairingCode: this.currentPairingCode,
                    phoneNumber: this.currentPhoneNumber,
                    ownerPhoneNumber: this.ownerPhoneNumber,
                    timestamp: Date.now()
                });
            }

            // Handle phone number from client
            socket.on('set_phone_number', (data) => {
                this.handlePhoneNumber(data.phoneNumber);
            });

            // ✅ ADDED: Generate pairing code for specific number
            socket.on('generate_pairing_code', async (data) => {
                try {
                    const { phoneNumber } = data;
                    if (!phoneNumber) {
                        socket.emit('pairing_generated', {
                            success: false,
                            error: 'Phone number is required'
                        });
                        return;
                    }

                    const result = await this.generatePairingForNumber(phoneNumber);
                    socket.emit('pairing_generated', result);
                    
                } catch (error) {
                    console.error('❌ [SCANNER] Pairing generation error:', error);
                    socket.emit('pairing_generated', {
                        success: false,
                        error: 'Failed to generate pairing code'
                    });
                }
            });

            // ✅ ADDED: Handle logout request
            socket.on('logout_request', async () => {
                try {
                    console.log(`🚪 [SCANNER] Logout requested by: ${socket.id}`);
                    
                    // Clear server state
                    this.isAuthenticated = false;
                    this.sessionId = null;
                    this.currentPhoneNumber = null;
                    this.ownerPhoneNumber = null;
                    this.currentQR = null;
                    this.currentPairingCode = null;
                    this.connectedBots.clear();
                    
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
                    ownerPhoneNumber: this.ownerPhoneNumber,
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
