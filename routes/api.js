/**
 * 🦅 SAVAGE BOTS SCANNER - API Routes
 * RESTful API endpoints for scanner management, bot connections, and session handling
 * Secure API with authentication and rate limiting
 */

const express = require('express');
const router = express.Router();
const savagePasswordAuth = require('../auth/passwordAuth');
const savageSessionManager = require('../auth/sessionManager');
const savageDatabase = require('../config/database');
const { SECURITY_CONFIG, MESSAGES, DEPLOYMENT } = require('../config/constants');

// Rate limiting middleware
const rateLimit = require('express-rate-limit');
const apiLimiter = rateLimit({
    windowMs: SECURITY_CONFIG.PASSWORD.LOCKOUT_TIME,
    max: 100, // Limit each IP to 100 requests per window
    message: {
        error: 'Too many API requests, please try again later.',
        retryAfter: SECURITY_CONFIG.PASSWORD.LOCKOUT_TIME / 1000
    }
});

// Apply rate limiting to all API routes
router.use(apiLimiter);

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    const clientIP = req.ip || req.connection.remoteAddress;

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Authentication token required',
            code: 'MISSING_TOKEN'
        });
    }

    const validation = savagePasswordAuth.validateSessionToken(token, clientIP);
    
    if (!validation.valid) {
        return res.status(401).json({
            success: false,
            error: validation.error || 'Invalid or expired token',
            code: 'INVALID_TOKEN'
        });
    }

    req.session = validation.session;
    req.clientIP = clientIP;
    next();
};

// =============================================================================
// 🔐 AUTHENTICATION ENDPOINTS
// =============================================================================

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user with password
 * @access  Public
 */
router.post('/auth/login', async (req, res) => {
    try {
        const { password } = req.body;
        const clientIP = req.ip || req.connection.remoteAddress;

        if (!password) {
            return res.status(400).json({
                success: false,
                error: 'Password is required',
                code: 'MISSING_PASSWORD'
            });
        }

        const result = await savagePasswordAuth.validatePassword(password, clientIP);

        if (result.success) {
            res.json({
                success: true,
                message: result.message,
                sessionToken: result.sessionToken,
                redirect: result.redirect,
                expiresIn: '24h'
            });
        } else {
            res.status(401).json({
                success: false,
                error: result.error,
                locked: result.locked,
                remainingAttempts: result.remainingAttempts,
                retryAfter: result.retryAfter,
                code: 'AUTH_FAILED'
            });
        }

    } catch (error) {
        console.error('❌ [API] Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Authentication system error',
            code: 'SERVER_ERROR'
        });
    }
});

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user and invalidate session
 * @access  Private
 */
router.post('/auth/logout', authenticateToken, (req, res) => {
    try {
        const token = req.headers['authorization']?.replace('Bearer ', '');
        const result = savagePasswordAuth.logout(token, req.clientIP);

        res.json({
            success: true,
            message: result.message,
            timestamp: new Date()
        });

    } catch (error) {
        console.error('❌ [API] Logout error:', error);
        res.status(500).json({
            success: false,
            error: 'Logout failed',
            code: 'LOGOUT_ERROR'
        });
    }
});

/**
 * @route   GET /api/auth/status
 * @desc    Check authentication status
 * @access  Private
 */
router.get('/auth/status', authenticateToken, (req, res) => {
    res.json({
        success: true,
        authenticated: true,
        session: req.session,
        timestamp: new Date()
    });
});

// =============================================================================
// 📱 SCANNER MANAGEMENT ENDPOINTS
// =============================================================================

/**
 * @route   GET /api/scanner/status
 * @desc    Get scanner status and connection info
 * @access  Private
 */
router.get('/scanner/status', authenticateToken, (req, res) => {
    try {
        // This would typically come from the main scanner instance
        const scannerStatus = {
            status: 'ready', // connected, disconnected, scanning, etc.
            platform: DEPLOYMENT.getCurrentPlatform().NAME,
            version: '1.0.0',
            uptime: process.uptime(),
            whatsappStatus: 'disconnected', // Will be updated by scanner
            lastHeartbeat: new Date(),
            sessionCount: 0 // Will be updated by session manager
        };

        res.json({
            success: true,
            scanner: scannerStatus,
            timestamp: new Date()
        });

    } catch (error) {
        console.error('❌ [API] Scanner status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get scanner status',
            code: 'STATUS_ERROR'
        });
    }
});

/**
 * @route   POST /api/scanner/generate-qr
 * @desc    Generate new QR code for WhatsApp linking
 * @access  Private
 */
router.post('/scanner/generate-qr', authenticateToken, (req, res) => {
    try {
        // This would trigger QR generation in the main scanner
        // For now, return mock response
        res.json({
            success: true,
            message: 'QR code generation requested',
            timestamp: new Date(),
            qrId: `qr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        });

    } catch (error) {
        console.error('❌ [API] QR generation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate QR code',
            code: 'QR_GENERATION_ERROR'
        });
    }
});

/**
 * @route   GET /api/scanner/session-info
 * @desc    Get current session information
 * @access  Private
 */
router.get('/scanner/session-info', authenticateToken, async (req, res) => {
    try {
        const sessionStats = await savageSessionManager.getSessionStats();
        
        res.json({
            success: true,
            sessionInfo: {
                sessionId: 'SAVAGE-XMD-BOT-SESSION-' + Math.random().toString(36).substr(2, 16).toUpperCase(),
                platform: DEPLOYMENT.getCurrentPlatform().NAME,
                phoneNumber: null, // Will be populated after WhatsApp connection
                connectionTime: new Date(),
                botConnections: sessionStats.memory?.activeSessions || 0
            },
            stats: sessionStats,
            timestamp: new Date()
        });

    } catch (error) {
        console.error('❌ [API] Session info error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get session information',
            code: 'SESSION_INFO_ERROR'
        });
    }
});

// =============================================================================
// 🤖 BOT MANAGEMENT ENDPOINTS
// =============================================================================

/**
 * @route   GET /api/bots
 * @desc    Get all bot status and information
 * @access  Private
 */
router.get('/bots', authenticateToken, (req, res) => {
    try {
        const bots = {
            'SAVAGE-X': {
                name: 'SAVAGE-X',
                status: 'offline', // online, offline, connecting, error
                lastSeen: null,
                commands: ['!savage', '!hack', '!status'],
                description: 'Primary attack bot with advanced features',
                color: '#00FF00'
            },
            'DE-UKNOWN-BOT': {
                name: 'DE-UKNOWN-BOT',
                status: 'offline',
                lastSeen: null,
                commands: ['!deunknown', '!mystery', '!secret'],
                description: 'Mystery bot with hidden capabilities',
                color: '#0000FF'
            },
            'QUEEN-RIXIE': {
                name: 'QUEEN RIXIE',
                status: 'offline',
                lastSeen: null,
                commands: ['!queen', '!royal', '!command'],
                description: 'Royal command bot with elite features',
                color: '#FF00FF'
            }
        };

        res.json({
            success: true,
            bots: bots,
            totalBots: Object.keys(bots).length,
            onlineBots: Object.values(bots).filter(bot => bot.status === 'online').length,
            timestamp: new Date()
        });

    } catch (error) {
        console.error('❌ [API] Bots status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get bot information',
            code: 'BOTS_INFO_ERROR'
        });
    }
});

/**
 * @route   POST /api/bots/:botName/connect
 * @desc    Connect a specific bot to the scanner
 * @access  Private
 */
router.post('/bots/:botName/connect', authenticateToken, async (req, res) => {
    try {
        const { botName } = req.params;
        const { sessionId } = req.body;

        const validBots = ['SAVAGE-X', 'DE-UKNOWN-BOT', 'QUEEN-RIXIE'];
        
        if (!validBots.includes(botName)) {
            return res.status(400).json({
                success: false,
                error: `Invalid bot name. Valid options: ${validBots.join(', ')}`,
                code: 'INVALID_BOT'
            });
        }

        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: 'Session ID is required for bot connection',
                code: 'MISSING_SESSION_ID'
            });
        }

        // In real implementation, this would initiate bot connection via WebSocket
        res.json({
            success: true,
            message: `Connection request sent to ${botName}`,
            botName: botName,
            sessionId: sessionId,
            timestamp: new Date()
        });

    } catch (error) {
        console.error('❌ [API] Bot connect error:', error);
        res.status(500).json({
            success: false,
            error: `Failed to connect ${req.params.botName}`,
            code: 'BOT_CONNECT_ERROR'
        });
    }
});

/**
 * @route   POST /api/bots/:botName/disconnect
 * @desc    Disconnect a specific bot from the scanner
 * @access  Private
 */
router.post('/bots/:botName/disconnect', authenticateToken, (req, res) => {
    try {
        const { botName } = req.params;

        res.json({
            success: true,
            message: `Disconnection request sent to ${botName}`,
            botName: botName,
            timestamp: new Date()
        });

    } catch (error) {
        console.error('❌ [API] Bot disconnect error:', error);
        res.status(500).json({
            success: false,
            error: `Failed to disconnect ${req.params.botName}`,
            code: 'BOT_DISCONNECT_ERROR'
        });
    }
});

// =============================================================================
// 💾 SESSION MANAGEMENT ENDPOINTS
// =============================================================================

/**
 * @route   GET /api/sessions
 * @desc    Get all active sessions
 * @access  Private
 */
router.get('/sessions', authenticateToken, async (req, res) => {
    try {
        const sessionStats = await savageSessionManager.getSessionStats();
        
        res.json({
            success: true,
            sessions: sessionStats,
            timestamp: new Date()
        });

    } catch (error) {
        console.error('❌ [API] Sessions error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get session information',
            code: 'SESSIONS_ERROR'
        });
    }
});

/**
 * @route   DELETE /api/sessions/:sessionId
 * @desc    Delete a specific session
 * @access  Private
 */
router.delete('/sessions/:sessionId', authenticateToken, async (req, res) => {
    try {
        const { sessionId } = req.params;

        const result = await savageSessionManager.deleteSession(sessionId);

        res.json({
            success: true,
            message: `Session ${sessionId} deleted successfully`,
            deletionResult: result,
            timestamp: new Date()
        });

    } catch (error) {
        console.error('❌ [API] Session deletion error:', error);
        res.status(500).json({
            success: false,
            error: `Failed to delete session ${req.params.sessionId}`,
            code: 'SESSION_DELETION_ERROR'
        });
    }
});

// =============================================================================
// 🗄️ DATABASE MANAGEMENT ENDPOINTS
// =============================================================================

/**
 * @route   GET /api/database/health
 * @desc    Check database health and connection status
 * @access  Private
 */
router.get('/database/health', authenticateToken, async (req, res) => {
    try {
        const dbHealth = await savageDatabase.healthCheck();
        const sessionHealth = await savageSessionManager.healthCheck();

        res.json({
            success: true,
            database: dbHealth,
            sessionManager: sessionHealth,
            timestamp: new Date()
        });

    } catch (error) {
        console.error('❌ [API] Database health error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check database health',
            code: 'DB_HEALTH_ERROR'
        });
    }
});

/**
 * @route   GET /api/database/stats
 * @desc    Get database statistics
 * @access  Private
 */
router.get('/database/stats', authenticateToken, async (req, res) => {
    try {
        const stats = await savageDatabase.getStats();

        res.json({
            success: true,
            stats: stats,
            timestamp: new Date()
        });

    } catch (error) {
        console.error('❌ [API] Database stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get database statistics',
            code: 'DB_STATS_ERROR'
        });
    }
});

// =============================================================================
// 🔧 SYSTEM MANAGEMENT ENDPOINTS
// =============================================================================

/**
 * @route   GET /api/system/info
 * @desc    Get system information and platform details
 * @access  Private
 */
router.get('/system/info', authenticateToken, (req, res) => {
    try {
        const platform = DEPLOYMENT.getCurrentPlatform();
        
        const systemInfo = {
            platform: platform.NAME,
            nodeVersion: process.version,
            environment: process.env.NODE_ENV || 'development',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            pid: process.pid,
            arch: process.arch,
            versions: process.versions
        };

        res.json({
            success: true,
            system: systemInfo,
            timestamp: new Date()
        });

    } catch (error) {
        console.error('❌ [API] System info error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get system information',
            code: 'SYSTEM_INFO_ERROR'
        });
    }
});

/**
 * @route   GET /api/system/health
 * @desc    Complete system health check
 * @access  Private
 */
router.get('/system/health', authenticateToken, async (req, res) => {
    try {
        const [dbHealth, sessionHealth, authHealth] = await Promise.all([
            savageDatabase.healthCheck(),
            savageSessionManager.healthCheck(),
            savagePasswordAuth.healthCheck()
        ]);

        const overallHealth = 
            dbHealth.healthy && 
            sessionHealth.status === 'healthy' && 
            authHealth.status === 'healthy';

        res.json({
            success: true,
            healthy: overallHealth,
            components: {
                database: dbHealth,
                sessionManager: sessionHealth,
                authentication: authHealth
            },
            timestamp: new Date()
        });

    } catch (error) {
        console.error('❌ [API] System health error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check system health',
            code: 'SYSTEM_HEALTH_ERROR'
        });
    }
});

// =============================================================================
// 🛡️ SECURITY ENDPOINTS (Admin Only)
// =============================================================================

/**
 * @route   GET /api/security/audit
 * @desc    Get security audit logs
 * @access  Private
 */
router.get('/security/audit', authenticateToken, (req, res) => {
    try {
        const { limit = 50, type, ip, startDate, endDate } = req.query;
        
        const auditLog = savagePasswordAuth.getAuditLog(parseInt(limit), {
            type, ip, startDate, endDate
        });

        res.json({
            success: true,
            auditLog: auditLog,
            totalEvents: auditLog.length,
            timestamp: new Date()
        });

    } catch (error) {
        console.error('❌ [API] Security audit error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get security audit logs',
            code: 'AUDIT_ERROR'
        });
    }
});

/**
 * @route   POST /api/security/lock-ip
 * @desc    Manually lock an IP address
 * @access  Private
 */
router.post('/security/lock-ip', authenticateToken, (req, res) => {
    try {
        const { ip, reason, duration } = req.body;

        if (!ip) {
            return res.status(400).json({
                success: false,
                error: 'IP address is required',
                code: 'MISSING_IP'
            });
        }

        const result = savagePasswordAuth.emergencyLockIP(
            ip, 
            reason || 'Manual lock by administrator',
            duration || SECURITY_CONFIG.PASSWORD.LOCKOUT_TIME
        );

        res.json({
            success: true,
            message: `IP ${ip} locked successfully`,
            lockInfo: result,
            timestamp: new Date()
        });

    } catch (error) {
        console.error('❌ [API] IP lock error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to lock IP address',
            code: 'IP_LOCK_ERROR'
        });
    }
});

/**
 * @route   POST /api/security/unlock-ip
 * @desc    Manually unlock an IP address
 * @access  Private
 */
router.post('/security/unlock-ip', authenticateToken, (req, res) => {
    try {
        const { ip } = req.body;

        if (!ip) {
            return res.status(400).json({
                success: false,
                error: 'IP address is required',
                code: 'MISSING_IP'
            });
        }

        const result = savagePasswordAuth.manualUnlockIP(ip);

        res.json({
            success: true,
            message: `IP ${ip} unlocked successfully`,
            unlockInfo: result,
            timestamp: new Date()
        });

    } catch (error) {
        console.error('❌ [API] IP unlock error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to unlock IP address',
            code: 'IP_UNLOCK_ERROR'
        });
    }
});

// =============================================================================
// ❌ ERROR HANDLING MIDDLEWARE
// =============================================================================

// 404 handler for API routes
router.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: `API endpoint ${req.originalUrl} not found`,
        code: 'ENDPOINT_NOT_FOUND'
    });
});

// Global error handler
router.use((error, req, res, next) => {
    console.error('💥 [API] Unhandled error:', error);
    
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        timestamp: new Date()
    });
});

module.exports = router;
