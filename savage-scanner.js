/**
 * 🦅 SAVAGE BOTS SCANNER - Main Server File
 * Multi-bot WhatsApp scanner with hacker theme
 * COMPATIBLE with Baileys v6+
 * UPDATED: Manual-Only Pairing Codes + QR Regeneration + LIVE FUNCTIONS
 * ✅ FIXED: Added missing initializeWhatsApp() method for Baileys connection
 */

const express = require('express');
const socketIo = require('socket.io');
const http = require('http');
const path = require('path');
const qrcode = require('qrcode');
const axios = require('axios');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } = require('@whiskeysockets/baileys'); // ✅ ADDED: Baileys

// ... (All your existing require statements remain exactly the same)
const savageDatabase = require('./config/database');
const savageSessionManager = require('./auth/sessionManager');
const savagePasswordAuth = require('./auth/passwordAuth');
const { generateSessionId, generatePairingCode } = require('./utils/generators');
const { SCANNER_IDENTITY, WHATSAPP_CONFIG, SERVER_CONFIG, MESSAGES, DEPLOYMENT } = require('./config/constants');

// ... (LIVE_FUNCTIONS_CONFIG remains the same)
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
        // ... (Your existing constructor code remains exactly the same until the end)
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

        // ✅ ADDED: Baileys connection state
        this.authState = null;
        this.whatsappSocket = null;
        this.isConnecting = false;
        this.shouldReconnect = true;
        this.connectionStatus = 'disconnected';

        this.initializeScanner();
    }

    // ✅✅✅ CRITICAL FIX: ADD THE MISSING METHOD
    /**
     * 🔗 Initialize WhatsApp Web connection using Baileys
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
            // 1. Setup Authentication State
            const { state, saveCreds } = await useMultiFileAuthState('./auth/sessions/scanner');
            this.authState = state;

            // 2. Create the WhatsApp Socket
            this.whatsappSocket = makeWASocket({
                auth: this.authState,
                printQRInTerminal: false, // We'll handle QR ourselves
                browser: Browsers.appropriate('chrome'),
                logger: { level: 'silent' }, // Reduce noise
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                markOnlineOnConnect: false, // Stealth mode
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
                    this.io.emit('connection_update', { status: 'qr_waiting', qrReceived: true });
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
                    this.io.emit('phone_number_linked', { phoneNumber });
                }
            });

            // 5. Handle pairing code events (for manual linking)
            this.whatsappSocket.ev.on('pairing.code', (code) => {
                console.log(`🔢 [WHATSAPP] Received pairing code from WhatsApp: ${code}`);
                // You can handle automatic pairing code display here if needed
                // For manual-only mode, we ignore this and use our own generation
            });

            // Set client reference
            this.client = this.whatsappSocket;
            this.whatsappAvailable = true;

            console.log('✅ [WHATSAPP] Initialization complete, waiting for QR/connection...');

        } catch (error) {
            console.error('💥 [WHATSAPP] Initialization failed:', error);
            this.connectionStatus = 'failed';
            this.whatsappAvailable = false;
            this.io.emit('connection_update', {
                status: 'failed',
                error: error.message
            });
        } finally {
            this.isConnecting = false;
        }
    }

    /**
     * ✅ Handle QR code generation and broadcasting
     */
    async handleQRGeneration(qrCode) {
        try {
            // Generate QR image data
            const qrImageData = await qrcode.toDataURL(qrCode);
            this.currentQR = qrImageData;

            console.log('🔄 [WHATSAPP] QR code generated and broadcast');

            // Broadcast to all WebSocket clients
            this.io.emit('qr_data', {
                qrImage: qrImageData,
                pairingCode: null,
                timestamp: Date.now(),
                pairingCodeLength: WHATSAPP_CONFIG.PAIRING.LENGTH,
                pairingMode: 'MANUAL-ONLY',
                message: 'Scan this QR code with WhatsApp'
            });

            // Set QR expiry timeout (30 seconds default)
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

        // Generate session ID
        this.sessionId = generateSessionId();
        console.log(`✅ [WHATSAPP] Authenticated. Session ID: ${this.sessionId}`);

        // Clear QR timeouts since we're connected
        this.clearQRTimeouts();
        this.currentQR = null;

        // Notify all clients
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

        // Notify clients
        this.io.emit('connection_update', {
            status: 'disconnected',
            reason: statusCode ? `Error ${statusCode}` : 'Unknown',
            shouldReconnect: this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts
        });

        // Handle different close reasons
        if (logoutRequest) {
            console.log('🚪 [WHATSAPP] Logged out from phone');
            this.io.emit('logged_out', { message: 'Logged out from WhatsApp' });
            this.shouldReconnect = false;
            return;
        }

        // Attempt reconnection for non-logout disconnects
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
     * 🔄 Manually refresh QR code
     */
    async refreshQRCode() {
        console.log('🔄 [WHATSAPP] Manually refreshing QR code...');

        // Clean up old connection
        if (this.whatsappSocket) {
            try {
                await this.whatsappSocket.logout();
            } catch (error) {
                // Ignore logout errors
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

        // Notify clients
        this.io.emit('connection_update', {
            status: 'refreshing',
            message: 'Refreshing QR code...'
        });

        // Start new connection
        setTimeout(() => {
            this.initializeWhatsApp().catch(console.error);
        }, 1000);
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
            console.log(`🦅 Functions: LIVE @ ${LIVE_FUNCTIONS_CONFIG.BASE_URL}`);
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

    // ... (ALL YOUR OTHER EXISTING METHODS REMAIN EXACTLY THE SAME BELOW THIS POINT)
    // The testLiveFunctionsConnection(), setupExpress(), setupWebSocket(), startServer()
    // and all other helper methods from your original file remain unchanged.

    // ... (Keep all your existing route handlers, WebSocket events, and utility methods)

    // ✅ Make sure your shutdown method properly cleans up WhatsApp connection
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

// ... (Your existing graceful shutdown handlers remain the same)

// Start the scanner
const savageScanner = new SavageBotsScanner();
global.savageScanner = savageScanner;

module.exports = SavageBotsScanner;
