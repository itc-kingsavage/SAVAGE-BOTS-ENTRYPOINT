/**
 * 🦅 SAVAGE BOTS SCANNER - Authentication Routes
 * Password protection, session management, and security endpoints
 * Hacker-themed authentication with brute-force protection
 */

const express = require('express');
const router = express.Router();
const savagePasswordAuth = require('../auth/passwordAuth');
const savageHelpers = require('../utils/helpers');
const savageEncryption = require('../utils/encryption');

// 🛡️ Middleware for request logging
router.use((req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    savageHelpers.log('info', `AUTH ${req.method} ${req.path}`, {
        ip: clientIP,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
    });
    next();
});

// 🛡️ Rate limiting middleware for authentication endpoints
const authRateLimit = (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    const rateLimit = savagePasswordAuth.checkRateLimit(clientIP);
    
    if (!rateLimit.allowed) {
        savageHelpers.log('warn', `Rate limit exceeded for IP: ${clientIP}`, {
            attempts: rateLimit.current,
            max: rateLimit.max,
            resetIn: rateLimit.resetTime - Date.now()
        });
        
        return res.status(429).json({
            success: false,
            error: 'Too many authentication attempts',
            retryAfter: Math.ceil((rateLimit.resetTime - Date.now()) / 1000),
            message: 'Please wait before trying again'
        });
    }
    
    res.set({
        'X-RateLimit-Limit': rateLimit.max,
        'X-RateLimit-Remaining': rateLimit.remaining,
        'X-RateLimit-Reset': new Date(rateLimit.resetTime).toISOString()
    });
    
    next();
};

/**
 * 🔐 POST /auth/verify-password
 * Verify master password and create session
 */
router.post('/verify-password', authRateLimit, async (req, res) => {
    try {
        const { password } = req.body;
        const clientIP = req.ip || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent');

        savageHelpers.log('info', `Password verification attempt from ${clientIP}`);

        // Validate input
        if (!password || typeof password !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Password is required',
                field: 'password'
            });
        }

        // Sanitize input
        const sanitizedPassword = savageHelpers.sanitizeInput(password);

        // Verify password
        const authResult = await savagePasswordAuth.validatePassword(sanitizedPassword, clientIP);

        if (authResult.success) {
            // Password correct - create session
            savageHelpers.log('success', `Successful authentication from ${clientIP}`);

            res.json({
                success: true,
                message: 'Authentication successful',
                sessionToken: authResult.sessionToken,
                redirect: authResult.redirect,
                user: {
                    ip: clientIP,
                    authenticatedAt: new Date().toISOString(),
                    sessionId: savageEncryption.generateSessionId()
                }
            });

        } else {
            // Password incorrect
            savageHelpers.log('warn', `Failed authentication attempt from ${clientIP}`, {
                remainingAttempts: authResult.remainingAttempts,
                locked: authResult.locked
            });

            res.status(401).json({
                success: false,
                error: authResult.error,
                remainingAttempts: authResult.remainingAttempts,
                locked: authResult.locked,
                retryAfter: authResult.retryAfter
            });
        }

    } catch (error) {
        savageHelpers.log('error', 'Password verification error', {
            error: error.message,
            ip: req.ip,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });

        res.status(500).json({
            success: false,
            error: 'Authentication system error',
            message: 'Please try again later'
        });
    }
});

/**
 * 🔑 POST /auth/validate-session
 * Validate existing session token
 */
router.post('/validate-session', (req, res) => {
    try {
        const { sessionToken } = req.body;
        const clientIP = req.ip || req.connection.remoteAddress;

        savageHelpers.log('info', `Session validation attempt from ${clientIP}`);

        if (!sessionToken || typeof sessionToken !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Session token is required',
                field: 'sessionToken'
            });
        }

        // Validate session token
        const validationResult = savagePasswordAuth.validateSessionToken(sessionToken, clientIP);

        if (validationResult.valid) {
            savageHelpers.log('success', `Session validated for ${clientIP}`);

            res.json({
                success: true,
                valid: true,
                session: validationResult.session,
                user: {
                    ip: clientIP,
                    validatedAt: new Date().toISOString()
                }
            });

        } else {
            savageHelpers.log('warn', `Invalid session token from ${clientIP}`, {
                error: validationResult.error
            });

            res.status(401).json({
                success: false,
                valid: false,
                error: validationResult.error,
                message: 'Session expired or invalid'
            });
        }

    } catch (error) {
        savageHelpers.log('error', 'Session validation error', {
            error: error.message,
            ip: req.ip
        });

        res.status(500).json({
            success: false,
            error: 'Session validation system error'
        });
    }
});

/**
 * 🚪 POST /auth/logout
 * Invalidate session token
 */
router.post('/logout', (req, res) => {
    try {
        const { sessionToken } = req.body;
        const clientIP = req.ip || req.connection.remoteAddress;

        savageHelpers.log('info', `Logout request from ${clientIP}`);

        if (!sessionToken) {
            return res.status(400).json({
                success: false,
                error: 'Session token is required'
            });
        }

        // Invalidate session
        const logoutResult = savagePasswordAuth.logout(sessionToken, clientIP);

        if (logoutResult.success) {
            savageHelpers.log('success', `User logged out from ${clientIP}`);

            res.json({
                success: true,
                message: logoutResult.message,
                loggedOut: true,
                timestamp: new Date().toISOString()
            });

        } else {
            savageHelpers.log('warn', `Logout failed for ${clientIP}`, {
                error: logoutResult.error
            });

            res.status(400).json({
                success: false,
                error: logoutResult.error,
                loggedOut: false
            });
        }

    } catch (error) {
        savageHelpers.log('error', 'Logout error', {
            error: error.message,
            ip: req.ip
        });

        res.status(500).json({
            success: false,
            error: 'Logout system error'
        });
    }
});

/**
 * 📊 GET /auth/stats
 * Get authentication statistics (Admin only)
 */
router.get('/stats', (req, res) => {
    try {
        const clientIP = req.ip || req.connection.remoteAddress;
        
        // Basic IP-based admin check (in production, use proper admin authentication)
        const adminIPs = process.env.ADMIN_IPS ? process.env.ADMIN_IPS.split(',') : ['127.0.0.1', '::1'];
        
        if (!adminIPs.includes(clientIP) && process.env.NODE_ENV === 'production') {
            savageHelpers.log('warn', `Unauthorized stats access attempt from ${clientIP}`);
            return res.status(403).json({
                success: false,
                error: 'Access denied',
                message: 'Admin access required'
            });
        }

        savageHelpers.log('info', `Auth stats accessed by ${clientIP}`);

        const stats = savagePasswordAuth.getAuthStats();
        const helpersStats = savageHelpers.getStats();
        const encryptionStats = savageEncryption.getStats();

        res.json({
            success: true,
            authentication: stats,
            helpers: helpersStats,
            encryption: encryptionStats,
            system: {
                uptime: process.uptime(),
                timestamp: new Date().toISOString(),
                nodeVersion: process.version,
                environment: process.env.NODE_ENV || 'development'
            }
        });

    } catch (error) {
        savageHelpers.log('error', 'Auth stats error', {
            error: error.message,
            ip: req.ip
        });

        res.status(500).json({
            success: false,
            error: 'Statistics system error'
        });
    }
});

/**
 * 🔒 GET /auth/security-events
 * Get security audit log (Admin only)
 */
router.get('/security-events', (req, res) => {
    try {
        const clientIP = req.ip || req.connection.remoteAddress;
        const { limit = 50, type, ip, startDate, endDate } = req.query;

        // Admin check
        const adminIPs = process.env.ADMIN_IPS ? process.env.ADMIN_IPS.split(',') : ['127.0.0.1', '::1'];
        
        if (!adminIPs.includes(clientIP) && process.env.NODE_ENV === 'production') {
            savageHelpers.log('warn', `Unauthorized security events access from ${clientIP}`);
            return res.status(403).json({
                success: false,
                error: 'Access denied',
                message: 'Admin access required'
            });
        }

        savageHelpers.log('info', `Security events accessed by ${clientIP}`);

        const filter = {
            type,
            ip,
            startDate,
            endDate
        };

        const events = savagePasswordAuth.getAuditLog(parseInt(limit), filter);

        res.json({
            success: true,
            events,
            total: events.length,
            filters: filter,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        savageHelpers.log('error', 'Security events error', {
            error: error.message,
            ip: req.ip
        });

        res.status(500).json({
            success: false,
            error: 'Security events system error'
        });
    }
});

/**
 * 🚨 POST /auth/emergency/lock-ip
 * Manually lock an IP address (Admin only)
 */
router.post('/emergency/lock-ip', (req, res) => {
    try {
        const clientIP = req.ip || req.connection.remoteAddress;
        const { ip, reason = 'Manual lock', duration = 900000 } = req.body; // 15 minutes default

        // Admin check
        const adminIPs = process.env.ADMIN_IPS ? process.env.ADMIN_IPS.split(',') : ['127.0.0.1', '::1'];
        
        if (!adminIPs.includes(clientIP) && process.env.NODE_ENV === 'production') {
            savageHelpers.log('warn', `Unauthorized emergency lock attempt from ${clientIP}`);
            return res.status(403).json({
                success: false,
                error: 'Access denied',
                message: 'Admin access required'
            });
        }

        if (!ip) {
            return res.status(400).json({
                success: false,
                error: 'IP address is required',
                field: 'ip'
            });
        }

        savageHelpers.log('warn', `Manual IP lock initiated by ${clientIP}`, {
            targetIP: ip,
            reason,
            duration
        });

        const lockResult = savagePasswordAuth.emergencyLockIP(ip, reason, duration);

        res.json({
            success: true,
            ...lockResult,
            initiatedBy: clientIP,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        savageHelpers.log('error', 'Emergency lock error', {
            error: error.message,
            ip: req.ip
        });

        res.status(500).json({
            success: false,
            error: 'Emergency lock system error'
        });
    }
});

/**
 * 🔓 POST /auth/emergency/unlock-ip
 * Manually unlock an IP address (Admin only)
 */
router.post('/emergency/unlock-ip', (req, res) => {
    try {
        const clientIP = req.ip || req.connection.remoteAddress;
        const { ip } = req.body;

        // Admin check
        const adminIPs = process.env.ADMIN_IPS ? process.env.ADMIN_IPS.split(',') : ['127.0.0.1', '::1'];
        
        if (!adminIPs.includes(clientIP) && process.env.NODE_ENV === 'production') {
            savageHelpers.log('warn', `Unauthorized emergency unlock attempt from ${clientIP}`);
            return res.status(403).json({
                success: false,
                error: 'Access denied',
                message: 'Admin access required'
            });
        }

        if (!ip) {
            return res.status(400).json({
                success: false,
                error: 'IP address is required',
                field: 'ip'
            });
        }

        savageHelpers.log('info', `Manual IP unlock initiated by ${clientIP}`, {
            targetIP: ip
        });

        const unlockResult = savagePasswordAuth.manualUnlockIP(ip);

        res.json({
            success: true,
            ...unlockResult,
            initiatedBy: clientIP,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        savageHelpers.log('error', 'Emergency unlock error', {
            error: error.message,
            ip: req.ip
        });

        res.status(500).json({
            success: false,
            error: 'Emergency unlock system error'
        });
    }
});

/**
 * 🏥 GET /auth/health
 * Authentication system health check
 */
router.get('/health', (req, res) => {
    try {
        const authHealth = savagePasswordAuth.healthCheck();
        const helpersHealth = savageHelpers.healthCheck();
        const encryptionHealth = savageEncryption.healthCheck();

        const overallHealth = 
            authHealth.status === 'healthy' && 
            helpersHealth.status === 'healthy' && 
            encryptionHealth.status === 'healthy';

        res.json({
            success: true,
            status: overallHealth ? 'healthy' : 'degraded',
            systems: {
                authentication: authHealth,
                helpers: helpersHealth,
                encryption: encryptionHealth
            },
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        });

    } catch (error) {
        savageHelpers.log('error', 'Health check error', {
            error: error.message
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
 * 🔧 GET /auth/config
 * Get authentication configuration (Admin only)
 */
router.get('/config', (req, res) => {
    try {
        const clientIP = req.ip || req.connection.remoteAddress;

        // Admin check
        const adminIPs = process.env.ADMIN_IPS ? process.env.ADMIN_IPS.split(',') : ['127.0.0.1', '::1'];
        
        if (!adminIPs.includes(clientIP) && process.env.NODE_ENV === 'production') {
            savageHelpers.log('warn', `Unauthorized config access from ${clientIP}`);
            return res.status(403).json({
                success: false,
                error: 'Access denied',
                message: 'Admin access required'
            });
        }

        res.json({
            success: true,
            config: {
                password: {
                    minLength: 12,
                    requireUppercase: true,
                    requireLowercase: true,
                    requireNumbers: true,
                    requireSymbols: true,
                    maxAttempts: 5,
                    lockoutTime: 900000 // 15 minutes
                },
                session: {
                    maxAge: 86400000, // 24 hours
                    cleanupInterval: 3600000 // 1 hour
                },
                rateLimit: {
                    windowMs: 900000, // 15 minutes
                    maxRequests: 100
                }
            },
            environment: {
                nodeEnv: process.env.NODE_ENV,
                hasEncryptionKey: !!process.env.SESSION_ENCRYPTION_KEY,
                hasScannerPassword: !!process.env.SCANNER_PASSWORD,
                adminIPs: adminIPs
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        savageHelpers.log('error', 'Config access error', {
            error: error.message,
            ip: req.ip
        });

        res.status(500).json({
            success: false,
            error: 'Configuration system error'
        });
    }
});

/**
 * 🚫 404 handler for auth routes
 */
router.use('*', (req, res) => {
    savageHelpers.log('warn', `Auth route not found: ${req.method} ${req.originalUrl}`, {
        ip: req.ip
    });

    res.status(404).json({
        success: false,
        error: 'Authentication endpoint not found',
        message: 'Check the API documentation for available endpoints'
    });
});

/**
 * 🚫 Global error handler for auth routes
 */
router.use((error, req, res, next) => {
    savageHelpers.log('error', 'Auth route error handler', {
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        ip: req.ip,
        url: req.originalUrl
    });

    res.status(500).json({
        success: false,
        error: 'Internal authentication server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
    });
});

module.exports = router;
