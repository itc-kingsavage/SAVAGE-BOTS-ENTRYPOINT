/**
 * 🦅 SAVAGE BOTS SCANNER - Main Server File
 * Multi-bot WhatsApp scanner with hacker theme
 * Fixed Express router & middleware config issue
 */

const { Client } = require('@adiwajshing/baileys');
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
const constants = require('./config/constants');

const {
    SCANNER_IDENTITY,
    WHATSAPP_CONFIG,
    SERVER_CONFIG,
    MESSAGES,
    DEPLOYMENT
} = constants;

class SavageBotsScanner {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        
        // ✅ Safe socket.io setup
        this.io = socketIo(this.server, {
            cors: {
                origin: Array.isArray(SERVER_CONFIG?.CORS?.origin)
                    ? SERVER_CONFIG.CORS.origin
                    : '*',
                methods: Array.isArray(SERVER_CONFIG?.CORS?.methods)
                    ? SERVER_CONFIG.CORS.methods
                    : ['GET', 'POST']
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

    async initializeScanner() {
        try {
            console.log('🦅 ============================================================');
            console.log('🦅 SAVAGE BOTS SCANNER - INITIALIZING');
            console.log('🦅 ============================================================');
            console.log(`🦅 Version: ${SCANNER_IDENTITY.VERSION}`);
            console.log(`🦅 Platform: ${DEPLOYMENT.getCurrentPlatform().NAME}`);
            console.log(`🦅 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log('🦅 ============================================================');

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

    async initializeDatabase() {
        try {
            console.log('🗄️ [SCANNER] Connecting to MongoDB Atlas...');
            if (typeof savageDatabase.connect === 'function') {
                await savageDatabase.connect();
                console.log('✅ [SCANNER] MongoDB connected successfully');
            } else {
                throw new Error('Invalid database module export');
            }
        } catch (error) {
            console.error('❌ [SCANNER] Database connection failed:', error.message);
            console.warn('⚠️ [SCANNER] Running in limited mode without database');
        }
    }

    async setupExpress() {
        try {
            this.app.use(express.json());
            this.app.use(express.urlencoded({ extended: true }));
            this.app.use(
                express.static(path.join(__dirname, 'public'), {
                    maxAge: SERVER_CONFIG?.STATIC?.MAX_AGE || 0
                })
            );

            this.setupBasicRoutes();
            console.log('✅ [SCANNER] Express server setup completed');
        } catch (error) {
            console.error('❌ [SCANNER] Express setup failed:', error);
            throw error;
        }
    }

    setupBasicRoutes() {
        this.app.get('/', (_, res) => res.redirect('/password'));
        this.app.get('/password', (_, res) =>
            res.sendFile(path.join(__dirname, 'public', 'password.html'))
        );
        this.app.get('/scanner', (_, res) =>
            res.sendFile(path.join(__dirname, 'public', 'scanner.html'))
        );

        this.app.post('/verify-password', async (req, res) => {
            try {
                const { password } = req.body;
                const clientIP = req.ip || req.connection.remoteAddress;
                if (typeof savagePasswordAuth.validatePassword !== 'function') {
                    throw new Error('Invalid password auth export');
                }
                const result = await savagePasswordAuth.validatePassword(password, clientIP);
                res.json(result);
            } catch (error) {
                res.json({ success: false, error: error.message });
            }
        });

        this.app.get('/qr-code', (_, res) => {
            res.json(
                this.currentQR
                    ? { qrCode: this.currentQR }
                    : { error: 'QR code not available' }
            );
        });

        this.app.get('/health', (_, res) => {
            res.json({
                status: 'operational',
                version: SCANNER_IDENTITY.VERSION,
                platform: DEPLOYMENT.getCurrentPlatform().NAME,
                timestamp: new Date()
            });
        });
    }

    async initializeWhatsApp() {
        try {
            console.log('📱 [SCANNER] Initializing WhatsApp connection...');
            this.client = new Client({
                printQRInTerminal: false,
                auth: null,
                browser: WHATSAPP_CONFIG.BAILEYS.BROWSER,
                markOnlineOnConnect: WHATSAPP_CONFIG.BAILEYS.MARK_ONLINE_ON_CONNECT,
                syncFullHistory: WHATSAPP_CONFIG.BAILEYS.SYNC_FULL_HISTORY,
                logger: { level: 'fatal' }
            });
            this.setupWhatsAppEvents();
            await this.client.initialize();
            console.log('✅ [SCANNER] WhatsApp client initialized');
        } catch (error) {
            console.error('❌ [SCANNER] WhatsApp initialization failed:', error);
            throw error;
        }
    }

    setupWhatsAppEvents() {
        this.client.on('qr', async (qr) => {
            console.log('📱 [SCANNER] QR Code received');
            try {
                const qrImage = await qrcode.toDataURL(qr);
                this.currentQR = qrImage;
                this.currentPairingCode = generatePairingCode();
                this.io.emit('qr_data', {
                    qrImage,
                    qrRaw: qr,
                    pairingCode: this.currentPairingCode,
                    timestamp: Date.now()
                });
                console.log(`🔢 [SCANNER] Pairing code: ${this.currentPairingCode}`);
            } catch (err) {
                console.error('❌ [SCANNER] QR code generation failed:', err);
            }
        });

        this.client.on('authenticated', async (session) => {
            console.log('✅ [SCANNER] WhatsApp authenticated successfully');
            try {
                await savageSessionManager.createSession(session, {
                    phoneNumber: this.client.info?.wid?.user,
                    platform: DEPLOYMENT.getCurrentPlatform().NAME
                });
                this.isAuthenticated = true;
                this.currentQR = null;
                this.io.emit('auth_success', {
                    message: 'WhatsApp authentication successful',
                    timestamp: new Date()
                });
            } catch (err) {
                console.error('❌ [SCANNER] Session save failed:', err);
            }
        });

        this.client.on('ready', async () => {
            console.log('🚀 [SCANNER] WhatsApp client is READY!');
            this.sessionId = generateSessionId();
            await this.sendIntroMessages();
            this.io.emit('ready', {
                status: 'connected',
                sessionId: this.sessionId,
                phoneNumber: this.client.info.wid.user,
                message: 'SAVAGE BOTS SCANNER is now active!',
                timestamp: new Date()
            });
            console.log(`🆔 [SCANNER] Session ID: ${this.sessionId}`);
        });
    }

    async sendIntroMessages() {
        try {
            const introMessages = MESSAGES.INTRODUCTION;
            const chats = await this.client.getChats();
            if (chats.length) {
                for (const message of introMessages) {
                    await chats[0].sendMessage(message);
                    await new Promise((r) => setTimeout(r, 1000));
                }
                console.log('✅ [SCANNER] Introduction messages sent');
            }
        } catch (err) {
            console.warn('⚠️ [SCANNER] Failed to send intro messages:', err.message);
        }
    }

    setupWebSocket() {
        this.io.on('connection', (socket) => {
            console.log(`🤖 [SCANNER] New client connected: ${socket.id}`);
            if (this.currentQR) {
                socket.emit('qr_data', {
                    qrImage: this.currentQR,
                    pairingCode: this.currentPairingCode,
                    timestamp: Date.now()
                });
            }
            if (this.client?.info) {
                socket.emit('ready', {
                    status: 'connected',
                    sessionId: this.sessionId,
                    phoneNumber: this.client.info.wid.user,
                    message: 'Scanner is active'
                });
            }

            socket.on('bot_register', (data) => {
                const { botName, sessionId } = data;
                if (sessionId === this.sessionId) {
                    this.connectedBots.add(botName);
                    console.log(`✅ [SCANNER] Bot connected: ${botName}`);
                    this.io.emit('bot_status', {
                        botName,
                        status: 'online',
                        lastSeen: new Date()
                    });
                }
            });
        });
        console.log('✅ [SCANNER] WebSocket server setup completed');
    }

    startServer() {
        const port = SERVER_CONFIG?.PORT || 10000;
        const host = SERVER_CONFIG?.HOST || '0.0.0.0';
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
}

const savageScanner = new SavageBotsScanner();
global.savageScanner = savageScanner;

process.on('SIGINT', () => savageScanner.shutdown?.());
process.on('SIGTERM', () => savageScanner.shutdown?.());

module.exports = SavageBotsScanner;
