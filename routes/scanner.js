/**
 * 🦅 SAVAGE BOTS SCANNER - Scanner Routes
 * WhatsApp QR codes, pairing codes, session management, and bot coordination
 * Core scanner functionality with real-time WebSocket support
 */

const express = require('express');
const router = express.Router();
const savageHelpers = require('../utils/helpers');
const savageGenerators = require('../utils/generators');
const savageEncryption = require('../utils/encryption');
const savageDatabase = require('../config/database');
const savageSessionManager = require('../auth/sessionManager');

// WebSocket connections map (in production, use Redis)
const activeConnections = new Map();
const botConnections = new Map();

// Scanner state
let scannerState = {
    status: 'disconnected',
    qrCode: null,
    pairingCode: null,
    sessionId: null,
    phoneNumber: null,
    lastActivity: null,
    bots: {
        'SAVAGE-X': { status: 'offline', lastSeen: null },
        'DE-UKNOWN-BOT': { status: 'offline', lastSeen: null },
        'QUEEN RIXIE': { status: 'offline', lastSeen: null }
    }
};

/**
 * 🛡️ Authentication middleware for scanner routes
 */
const requireAuth = (req, res, next) => {
    const sessionToken = req.headers['x-session-token'] || req.query.sessionToken;
    const clientIP = req.ip || req.connection.remoteAddress;

    if (!sessionToken) {
        savageHelpers.log('warn', 'Missing session token for scanner route', {
            ip: clientIP,
            path: req.path
        });
        return res.status(401).json({
            success: false,
            error: 'Session token required',
            message: 'Please authenticate first'
        });
    }

    // In a real implementation, validate the session token
    // For now, we'll use a simple check
    const isValid = typeof sessionToken === 'string' && sessionToken.startsWith('savage_');
    
    if (!isValid) {
        savageHelpers.log('warn', 'Invalid session token', {
            ip: clientIP,
            token: sessionToken.substring(0, 10) + '...'
        });
        return res.status(401).json({
            success: false,
            error: 'Invalid session token',
            message: 'Please re-authenticate'
        });
    }

    savageHelpers.log('debug', 'Scanner route authenticated', {
        ip: clientIP,
        path: req.path
    });
    next();
};

/**
 * 🛡️ WebSocket authentication middleware
 */
const authenticateWebSocket = (socket, next) => {
    const sessionToken = socket.handshake.auth.sessionToken;
    const clientIP = socket.handshake.address;

    if (!sessionToken) {
        savageHelpers.log('warn', 'WebSocket connection missing session token', { ip: clientIP });
        return next(new Error('Authentication required'));
    }

    // Validate session token (simplified)
    const isValid = typeof sessionToken === 'string' && sessionToken.startsWith('savage_');
    
    if (!isValid) {
        savageHelpers.log('warn', 'WebSocket connection invalid token', {
            ip: clientIP,
            token: sessionToken.substring(0, 10) + '...'
        });
        return next(new Error('Invalid session token'));
    }

    socket.sessionToken = sessionToken;
    socket.clientIP = clientIP;
    next();
};

/**
 * 🛡️ Bot authentication middleware for WebSocket
 */
const authenticateBot = (socket, next) => {
    const { botName, sessionId, authToken } = socket.handshake.auth;
    const clientIP = socket.handshake.address;

    if (!botName || !sessionId || !authToken) {
        savageHelpers.log('warn', 'Bot WebSocket missing credentials', {
            ip: clientIP,
            botName,
            hasSessionId: !!sessionId,
            hasAuthToken: !!authToken
        });
        return next(new Error('Bot authentication required'));
    }

    // Validate bot name
    if (!savageHelpers.validateBotName(botName)) {
        savageHelpers.log('warn', 'Invalid bot name', { ip: clientIP, botName });
        return next(new Error('Invalid bot name'));
    }

    // Validate session ID format
    if (!savageHelpers.validateSessionId(sessionId)) {
        savageHelpers.log('warn', 'Invalid session ID format', {
            ip: clientIP,
            botName,
            sessionId: sessionId.substring(0, 20) + '...'
        });
        return next(new Error('Invalid session ID'));
    }

    socket.botName = botName;
    socket.sessionId = sessionId;
    socket.authToken = authToken;
    socket.clientIP = clientIP;

    savageHelpers.log('info', `Bot authentication attempt: ${botName}`, { ip: clientIP });
    next();
};

/**
 * 🎯 GET /scanner/status
 * Get current scanner status and system information
 */
router.get('/status', requireAuth, (req, res) => {
    try {
        const clientIP = req.ip || req.connection.remoteAddress;

        savageHelpers.log('info', `Scanner status requested by ${clientIP}`);

        const status = {
            success: true,
            scanner: {
                status: scannerState.status,
                phoneNumber: scannerState.phoneNumber,
                sessionId: scannerState.sessionId,
                lastActivity: scannerState.lastActivity,
                uptime: process.uptime()
            },
            bots: scannerState.bots,
            connections: {
                web: activeConnections.size,
                bots: botConnections.size,
                total: activeConnections.size + botConnections.size
            },
            system: {
                timestamp: new Date().toISOString(),
                memory: process.memoryUsage(),
                nodeVersion: process.version,
                environment: process.env.NODE_ENV || 'development'
            }
        };

        res.json(status);

    } catch (error) {
        savageHelpers.log('error', 'Scanner status error', {
            error: error.message,
            ip: req.ip
        });

        res.status(500).json({
            success: false,
            error: 'Scanner status system error',
            message: 'Please try again later'
        });
    }
});

/**
 * 📱 GET /scanner/qr
 * Generate new QR code for WhatsApp linking
 */
router.get('/qr', requireAuth, (req, res) => {
    try {
        const clientIP = req.ip || req.connection.remoteAddress;

        savageHelpers.log('info', `QR code generation requested by ${clientIP}`);

        // Generate new pairing code
        const pairingCode = savageGenerators.generatePairingCode();
        
        // In a real implementation, this would generate an actual QR code
        // For now, we'll simulate it
        const qrData = {
            qrImage: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=WHATSAPP:${pairingCode}`,
            qrRaw: pairingCode,
            pairingCode: pairingCode,
            timestamp: new Date().toISOString(),
            expiresIn: 300000 // 5 minutes
        };

        // Update scanner state
        scannerState.qrCode = qrData.qrImage;
        scannerState.pairingCode = pairingCode;
        scannerState.lastActivity = new Date();

        savageHelpers.log('success', `QR code generated: ${pairingCode}`, { ip: clientIP });

        res.json({
            success: true,
            ...qrData,
            message: 'QR code generated successfully'
        });

    } catch (error) {
        savageHelpers.log('error', 'QR code generation error', {
            error: error.message,
            ip: req.ip
        });

        res.status(500).json({
            success: false,
            error: 'QR code generation failed',
            message: 'Please try again later'
        });
    }
});

/**
 * 🔄 POST /scanner/refresh-qr
 * Refresh/regenerate QR code
 */
router.post('/refresh-qr', requireAuth, (req, res) => {
    try {
        const clientIP = req.ip || req.connection.remoteAddress;

        savageHelpers.log('info', `QR code refresh requested by ${clientIP}`);

        // Generate new pairing code
        const pairingCode = savageGenerators.generatePairingCode();
        
        const qrData = {
            qrImage: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=WHATSAPP:${pairingCode}`,
            qrRaw: pairingCode,
            pairingCode: pairingCode,
            timestamp: new Date().toISOString(),
            expiresIn: 300000
        };

        // Update scanner state
        scannerState.qrCode = qrData.qrImage;
        scannerState.pairingCode = pairingCode;
        scannerState.lastActivity = new Date();

        savageHelpers.log('success', `QR code refreshed: ${pairingCode}`, { ip: clientIP });

        // Broadcast to all connected clients
        broadcastToClients('qr_data', qrData);

        res.json({
            success: true,
            ...qrData,
            message: 'QR code refreshed successfully'
        });

    } catch (error) {
        savageHelpers.log('error', 'QR code refresh error', {
            error: error.message,
            ip: req.ip
        });

        res.status(500).json({
            success: false,
            error: 'QR code refresh failed',
            message: 'Please try again later'
        });
    }
});

/**
 * 🔢 GET /scanner/pairing-code
 * Get current pairing code
 */
router.get('/pairing-code', requireAuth, (req, res) => {
    try {
        const clientIP = req.ip || req.connection.remoteAddress;

        if (!scannerState.pairingCode) {
            return res.status(404).json({
                success: false,
                error: 'No active pairing code',
                message: 'Generate a QR code first'
            });
        }

        const isValid = savageGenerators.validatePairingCode(scannerState.pairingCode);
        
        if (!isValid) {
            return res.status(410).json({
                success: false,
                error: 'Pairing code expired',
                message: 'Generate a new QR code'
            });
        }

        savageHelpers.log('info', `Pairing code requested by ${clientIP}`);

        res.json({
            success: true,
            pairingCode: scannerState.pairingCode,
            timestamp: scannerState.lastActivity,
            expiresIn: 300000 - (Date.now() - new Date(scannerState.lastActivity).getTime())
        });

    } catch (error) {
        savageHelpers.log('error', 'Pairing code retrieval error', {
            error: error.message,
            ip: req.ip
        });

        res.status(500).json({
            success: false,
            error: 'Pairing code retrieval failed'
        });
    }
});

/**
 * 🤖 POST /scanner/bot/connect
 * Bot connection endpoint (for HTTP-based bots)
 */
router.post('/bot/connect', requireAuth, async (req, res) => {
    try {
        const { botName, sessionId, capabilities } = req.body;
        const clientIP = req.ip || req.connection.remoteAddress;

        savageHelpers.log('info', `Bot connection attempt: ${botName}`, { ip: clientIP });

        // Validate inputs
        if (!savageHelpers.validateBotName(botName)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid bot name',
                validBots: ['SAVAGE-X', 'DE-UKNOWN-BOT', 'QUEEN RIXIE']
            });
        }

        if (!savageHelpers.validateSessionId(sessionId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid session ID format'
            });
        }

        // Update bot status
        scannerState.bots[botName] = {
            status: 'connecting',
            lastSeen: new Date(),
            capabilities: capabilities || {},
            ip: clientIP
        };

        savageHelpers.log('success', `Bot connection initiated: ${botName}`, {
            ip: clientIP,
            sessionId: sessionId.substring(0, 20) + '...'
        });

        // Simulate connection process
        await savageHelpers.sleep(1000);

        scannerState.bots[botName].status = 'online';

        res.json({
            success: true,
            message: `${botName} connected successfully`,
            bot: scannerState.bots[botName],
            session: {
                id: sessionId,
                scannerStatus: scannerState.status,
                connectedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        savageHelpers.log('error', 'Bot connection error', {
            error: error.message,
            ip: req.ip,
            botName: req.body.botName
        });

        res.status(500).json({
            success: false,
            error: 'Bot connection failed',
            message: 'Please check bot configuration'
        });
    }
});

/**
 * 📊 GET /scanner/bots/status
 * Get status of all bots
 */
router.get('/bots/status', requireAuth, (req, res) => {
    try {
        const clientIP = req.ip || req.connection.remoteAddress;

        savageHelpers.log('debug', `Bot status requested by ${clientIP}`);

        const botStatus = {};
        let onlineCount = 0;

        for (const [botName, botData] of Object.entries(scannerState.bots)) {
            botStatus[botName] = {
                status: botData.status,
                lastSeen: botData.lastSeen,
                uptime: botData.lastSeen ? Date.now() - new Date(botData.lastSeen).getTime() : null,
                capabilities: botData.capabilities || {}
            };

            if (botData.status === 'online') onlineCount++;
        }

        res.json({
            success: true,
            bots: botStatus,
            summary: {
                total: Object.keys(scannerState.bots).length,
                online: onlineCount,
                offline: Object.keys(scannerState.bots).length - onlineCount
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        savageHelpers.log('error', 'Bot status retrieval error', {
            error: error.message,
            ip: req.ip
        });

        res.status(500).json({
            success: false,
            error: 'Bot status retrieval failed'
        });
    }
});

/**
 * 💾 GET /scanner/session
 * Get current session information
 */
router.get('/session', requireAuth, (req, res) => {
    try {
        const clientIP = req.ip || req.connection.remoteAddress;

        savageHelpers.log('info', `Session info requested by ${clientIP}`);

        if (!scannerState.sessionId) {
            return res.status(404).json({
                success: false,
                error: 'No active session',
                message: 'Connect WhatsApp first'
            });
        }

        const sessionInfo = {
            success: true,
            sessionId: scannerState.sessionId,
            phoneNumber: scannerState.phoneNumber,
            status: scannerState.status,
            connectedAt: scannerState.lastActivity,
            bots: Object.keys(scannerState.bots).filter(bot => 
                scannerState.bots[bot].status === 'online'
            ),
            system: {
                uptime: process.uptime(),
                timestamp: new Date().toISOString()
            }
        };

        res.json(sessionInfo);

    } catch (error) {
        savageHelpers.log('error', 'Session info retrieval error', {
            error: error.message,
            ip: req.ip
        });

        res.status(500).json({
            success: false,
            error: 'Session information retrieval failed'
        });
    }
});

/**
 * 🚀 POST /scanner/connect
 * Simulate WhatsApp connection (for testing)
 */
router.post('/connect', requireAuth, async (req, res) => {
    try {
        const { phoneNumber = '+1234567890' } = req.body;
        const clientIP = req.ip || req.connection.remoteAddress;

        savageHelpers.log('info', `Manual connection initiated by ${clientIP}`, { phoneNumber });

        // Validate phone number
        if (!savageHelpers.validatePhoneNumber(phoneNumber)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid phone number format'
            });
        }

        // Generate session ID
        const sessionId = savageGenerators.generateSessionId('SCANNER', 'manual');

        // Update scanner state
        scannerState.status = 'connected';
        scannerState.phoneNumber = phoneNumber;
        scannerState.sessionId = sessionId;
        scannerState.lastActivity = new Date();

        // Clear QR code since we're connected
        scannerState.qrCode = null;
        scannerState.pairingCode = null;

        savageHelpers.log('success', `Scanner connected: ${phoneNumber}`, {
            sessionId: sessionId.substring(0, 20) + '...'
        });

        // Broadcast connection status
        broadcastToClients('ready', {
            status: 'connected',
            sessionId: sessionId,
            phoneNumber: phoneNumber,
            message: 'WhatsApp connected successfully'
        });

        // Update all bots to online
        for (const botName of Object.keys(scannerState.bots)) {
            scannerState.bots[botName].status = 'online';
            scannerState.bots[botName].lastSeen = new Date();
        }

        res.json({
            success: true,
            message: 'WhatsApp connected successfully',
            session: {
                id: sessionId,
                phoneNumber: phoneNumber,
                connectedAt: new Date().toISOString()
            },
            bots: scannerState.bots
        });

    } catch (error) {
        savageHelpers.log('error', 'Manual connection error', {
            error: error.message,
            ip: req.ip
        });

        res.status(500).json({
            success: false,
            error: 'Connection failed',
            message: 'Please try again later'
        });
    }
});

/**
 * 🚫 POST /scanner/disconnect
 * Disconnect WhatsApp session
 */
router.post('/disconnect', requireAuth, (req, res) => {
    try {
        const clientIP = req.ip || req.connection.remoteAddress;

        savageHelpers.log('info', `Manual disconnect initiated by ${clientIP}`);

        // Update scanner state
        const previousState = { ...scannerState };
        
        scannerState.status = 'disconnected';
        scannerState.phoneNumber = null;
        scannerState.sessionId = null;
        scannerState.lastActivity = new Date();

        // Update all bots to offline
        for (const botName of Object.keys(scannerState.bots)) {
            scannerState.bots[botName].status = 'offline';
        }

        savageHelpers.log('success', 'Scanner disconnected', { ip: clientIP });

        // Broadcast disconnection
        broadcastToClients('status_update', {
            status: 'disconnected',
            message: 'WhatsApp disconnected'
        });

        res.json({
            success: true,
            message: 'WhatsApp disconnected successfully',
            previousState: {
                phoneNumber: previousState.phoneNumber,
                sessionId: previousState.sessionId,
                connectedDuration: previousState.lastActivity ? 
                    Date.now() - new Date(previousState.lastActivity).getTime() : null
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        savageHelpers.log('error', 'Disconnection error', {
            error: error.message,
            ip: req.ip
        });

        res.status(500).json({
            success: false,
            error: 'Disconnection failed'
        });
    }
});

/**
 * 🏥 GET /scanner/health
 * Comprehensive scanner health check
 */
router.get('/health', requireAuth, async (req, res) => {
    try {
        const clientIP = req.ip || req.connection.remoteAddress;

        savageHelpers.log('info', `Health check requested by ${clientIP}`);

        // Check all systems
        const databaseHealth = await savageDatabase.healthCheck();
        const helpersHealth = savageHelpers.healthCheck();
        const generatorsHealth = savageGenerators.healthCheck();
        const encryptionHealth = savageEncryption.healthCheck();

        const allHealthy = 
            databaseHealth.healthy &&
            helpersHealth.status === 'healthy' &&
            generatorsHealth.status === 'healthy' &&
            encryptionHealth.status === 'healthy';

        const healthStatus = {
            success: true,
            status: allHealthy ? 'healthy' : 'degraded',
            systems: {
                database: databaseHealth,
                helpers: helpersHealth,
                generators: generatorsHealth,
                encryption: encryptionHealth
            },
            scanner: {
                status: scannerState.status,
                hasSession: !!scannerState.sessionId,
                hasQrCode: !!scannerState.qrCode,
                activeBots: Object.values(scannerState.bots).filter(bot => bot.status === 'online').length,
                connections: {
                    web: activeConnections.size,
                    bots: botConnections.size
                }
            },
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        };

        res.json(healthStatus);

    } catch (error) {
        savageHelpers.log('error', 'Health check error', {
            error: error.message,
            ip: req.ip
        });

        res.status(500).json({
            success: false,
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * 📈 GET /scanner/stats
 * Get scanner statistics and metrics
 */
router.get('/stats', requireAuth, async (req, res) => {
    try {
        const clientIP = req.ip || req.connection.remoteAddress;

        savageHelpers.log('info', `Statistics requested by ${clientIP}`);

        const dbStats = await savageDatabase.getStats();
        const helpersStats = savageHelpers.getStats();
        const generatorsStats = savageGenerators.getStats();

        const stats = {
            success: true,
            scanner: {
                status: scannerState.status,
                uptime: process.uptime(),
                sessionDuration: scannerState.lastActivity ? 
                    Date.now() - new Date(scannerState.lastActivity).getTime() : null,
                qrCodesGenerated: generatorsStats.recentGenerations?.pairing_code || 0,
                sessionIdsGenerated: generatorsStats.recentGenerations?.session_id || 0
            },
            connections: {
                webClients: activeConnections.size,
                bots: botConnections.size,
                byBot: Array.from(botConnections.values()).reduce((acc, bot) => {
                    acc[bot.botName] = (acc[bot.botName] || 0) + 1;
                    return acc;
                }, {})
            },
            bots: {
                total: Object.keys(scannerState.bots).length,
                online: Object.values(scannerState.bots).filter(bot => bot.status === 'online').length,
                status: scannerState.bots
            },
            system: {
                database: dbStats,
                helpers: helpersStats,
                generators: generatorsStats,
                memory: process.memoryUsage(),
                timestamp: new Date().toISOString()
            }
        };

        res.json(stats);

    } catch (error) {
        savageHelpers.log('error', 'Statistics retrieval error', {
            error: error.message,
            ip: req.ip
        });

        res.status(500).json({
            success: false,
            error: 'Statistics retrieval failed'
        });
    }
});

/**
 * 🔄 Utility function: Broadcast to all connected clients
 */
function broadcastToClients(event, data) {
    const message = JSON.stringify({ type: event, ...data });
    
    activeConnections.forEach((socket, id) => {
        if (socket.readyState === 1) { // WebSocket.OPEN
            socket.send(message);
        }
    });

    savageHelpers.log('debug', `Broadcasted ${event} to ${activeConnections.size} clients`);
}

/**
 * 🔄 Utility function: Broadcast to specific bot type
 */
function broadcastToBots(botName, event, data) {
    const message = JSON.stringify({ type: event, ...data });
    let sentCount = 0;

    botConnections.forEach((socket, id) => {
        if (socket.botName === botName && socket.readyState === 1) {
            socket.send(message);
            sentCount++;
        }
    });

    if (sentCount > 0) {
        savageHelpers.log('debug', `Broadcasted ${event} to ${sentCount} ${botName} bots`);
    }
}

/**
 * 🚫 404 handler for scanner routes
 */
router.use('*', requireAuth, (req, res) => {
    savageHelpers.log('warn', `Scanner route not found: ${req.method} ${req.originalUrl}`, {
        ip: req.ip
    });

    res.status(404).json({
        success: false,
        error: 'Scanner endpoint not found',
        message: 'Check the API documentation for available endpoints'
    });
});

/**
 * 🚫 Global error handler for scanner routes
 */
router.use((error, req, res, next) => {
    savageHelpers.log('error', 'Scanner route error handler', {
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        ip: req.ip,
        url: req.originalUrl
    });

    res.status(500).json({
        success: false,
        error: 'Internal scanner server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
    });
});

// Export router and utility functions for use in main server
module.exports = {
    router,
    authenticateWebSocket,
    authenticateBot,
    activeConnections,
    botConnections,
    scannerState,
    broadcastToClients,
    broadcastToBots
};
