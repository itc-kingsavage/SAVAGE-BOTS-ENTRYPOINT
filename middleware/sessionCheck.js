/**
 * 🦅 SAVAGE BOTS SCANNER - Session Validation Middleware
 * Advanced session management with WebSocket integration and bot session validation
 * Real-time session monitoring and health checks
 */

const savageSessionManager = require('../auth/sessionManager');
const savageDatabase = require('../config/database');
const { BOT_CONFIG, MESSAGES, DEPLOYMENT } = require('../config/constants');

/**
 * 🔍 Session validation middleware for HTTP routes
 * Validates session existence and integrity for protected routes
 */
const validateSession = (options = {}) => {
    const {
        requireActive = true,
        checkIntegrity = true,
        allowExpired = false,
        botSpecific = false
    } = options;

    return async (req, res, next) => {
        const sessionId = extractSessionId(req);
        const clientIP = getClientIP(req);

        try {
            console.log(`🔍 [SESSION-CHECK] Validating session: ${sessionId?.substring(0, 20)}...`);

            // Check if session ID is provided
            if (!sessionId) {
                return sendSessionError(res, 400, 'Session ID is required', 'MISSING_SESSION_ID', {
                    clientIP,
                    path: req.path
                });
            }

            // Validate session ID format
            if (!isValidSessionIdFormat(sessionId)) {
                logSessionEvent('INVALID_FORMAT', clientIP, `Invalid session ID format: ${sessionId}`, {
                    sessionId: sessionId,
                    path: req.path
                });
                
                return sendSessionError(res, 400, 'Invalid session ID format', 'INVALID_SESSION_FORMAT', {
                    clientIP,
                    sessionId: sessionId
                });
            }

            // Retrieve session from manager
            const session = await savageSessionManager.getSession(sessionId, {
                decrypt: false,
                updateAccess: true
            });

            // Check if session exists
            if (!session) {
                logSessionEvent('NOT_FOUND', clientIP, `Session not found: ${sessionId}`, {
                    sessionId: sessionId,
                    path: req.path
                });
                
                return sendSessionError(res, 404, 'Session not found or expired', 'SESSION_NOT_FOUND', {
                    clientIP,
                    sessionId: sessionId
                });
            }

            // Check if session is active
            if (requireActive && !session.isActive) {
                logSessionEvent('INACTIVE', clientIP, `Inactive session accessed: ${sessionId}`, {
                    sessionId: sessionId,
                    botName: session.botName
                });
                
                return sendSessionError(res, 403, 'Session is inactive', 'SESSION_INACTIVE', {
                    clientIP,
                    sessionId: sessionId,
                    botName: session.botName
                });
            }

            // Check session integrity
            if (checkIntegrity) {
                const integrityCheck = await checkSessionIntegrity(session);
                if (!integrityCheck.valid) {
                    logSessionEvent('INTEGRITY_FAILED', clientIP, `Session integrity check failed: ${integrityCheck.reason}`, {
                        sessionId: sessionId,
                        botName: session.botName,
                        reason: integrityCheck.reason
                    });
                    
                    return sendSessionError(res, 500, 'Session integrity check failed', 'SESSION_CORRUPTED', {
                        clientIP,
                        sessionId: sessionId,
                        reason: integrityCheck.reason
                    });
                }
            }

            // Bot-specific validation
            if (botSpecific && session.botName) {
                const botValidation = validateBotSessionFunction(session);
                if (!botValidation.valid) {
                    logSessionEvent('BOT_VALIDATION_FAILED', clientIP, `Bot session validation failed: ${botValidation.reason}`, {
                        sessionId: sessionId,
                        botName: session.botName,
                        reason: botValidation.reason
                    });
                    
                    return sendSessionError(res, 403, botValidation.reason, 'BOT_SESSION_INVALID', {
                        clientIP,
                        sessionId: sessionId,
                        botName: session.botName
                    });
                }
            }

            // Session is valid - attach to request
            req.session = session;
            req.sessionId = sessionId;
            req.clientIP = clientIP;

            logSessionEvent('VALIDATED', clientIP, `Session validated successfully: ${session.botName || 'SCANNER'}`, {
                sessionId: sessionId,
                botName: session.botName,
                platform: session.platform
            });

            next();

        } catch (error) {
            console.error('❌ [SESSION-CHECK] Validation error:', error);
            logSessionEvent('VALIDATION_ERROR', clientIP, `Session validation error: ${error.message}`, {
                sessionId: sessionId,
                error: error.message
            });
            
            return sendSessionError(res, 500, 'Session validation system error', 'VALIDATION_SYSTEM_ERROR', {
                clientIP,
                sessionId: sessionId
            });
        }
    };
};

/**
 * 🤖 Bot session validation middleware
 * Specialized validation for bot-specific sessions
 */
const validateBotSessionMiddleware = (botName) => {
    return async (req, res, next) => {
        const sessionId = extractSessionId(req);
        const clientIP = getClientIP(req);

        try {
            // First validate basic session
            await validateSession({
                requireActive: true,
                checkIntegrity: true,
                botSpecific: true
            })(req, res, (err) => {
                if (err) return next(err);

                // Additional bot-specific checks
                const session = req.session;
                
                // Check if session belongs to the specified bot
                if (botName && session.botName !== botName) {
                    logSessionEvent('BOT_MISMATCH', clientIP, `Session bot mismatch: expected ${botName}, got ${session.botName}`, {
                        sessionId: sessionId,
                        expectedBot: botName,
                        actualBot: session.botName
                    });
                    
                    return sendSessionError(res, 403, `Session does not belong to ${botName}`, 'BOT_MISMATCH', {
                        clientIP,
                        sessionId: sessionId,
                        expectedBot: botName,
                        actualBot: session.botName
                    });
                }

                // Check bot session health
                const botHealth = checkBotSessionHealth(session);
                if (!botHealth.healthy) {
                    logSessionEvent('BOT_UNHEALTHY', clientIP, `Bot session unhealthy: ${botHealth.reason}`, {
                        sessionId: sessionId,
                        botName: session.botName,
                        reason: botHealth.reason
                    });
                    
                    return sendSessionError(res, 503, `Bot session is unhealthy: ${botHealth.reason}`, 'BOT_UNHEALTHY', {
                        clientIP,
                        sessionId: sessionId,
                        botName: session.botName,
                        reason: botHealth.reason
                    });
                }

                logSessionEvent('BOT_VALIDATED', clientIP, `Bot session validated: ${session.botName}`, {
                    sessionId: sessionId,
                    botName: session.botName,
                    platform: session.platform
                });

                next();
            });

        } catch (error) {
            console.error('❌ [SESSION-CHECK] Bot validation error:', error);
            return sendSessionError(res, 500, 'Bot session validation error', 'BOT_VALIDATION_ERROR', {
                clientIP,
                sessionId: sessionId,
                botName: botName
            });
        }
    };
};

/**
 * 🌐 WebSocket session validation middleware
 * Specialized validation for WebSocket connections
 */
const validateWebSocketSession = (socket, next) => {
    const sessionId = socket.handshake.auth.sessionId || socket.handshake.query.sessionId;
    const clientIP = socket.handshake.address;
    const botName = socket.handshake.auth.botName;

    console.log(`🔌 [WS-SESSION] Validating WebSocket connection: ${sessionId?.substring(0, 20)}...`);

    if (!sessionId) {
        logSessionEvent('WS_MISSING_SESSION', clientIP, 'WebSocket connection missing session ID', {
            botName: botName
        });
        
        return next(new Error('Session ID is required for WebSocket connection'));
    }

    // Validate session asynchronously
    savageSessionManager.getSession(sessionId, { decrypt: false, updateAccess: true })
        .then(session => {
            if (!session) {
                logSessionEvent('WS_SESSION_NOT_FOUND', clientIP, `WebSocket session not found: ${sessionId}`, {
                    sessionId: sessionId,
                    botName: botName
                });
                
                return next(new Error('Invalid or expired session'));
            }

            if (!session.isActive) {
                logSessionEvent('WS_SESSION_INACTIVE', clientIP, `WebSocket session inactive: ${sessionId}`, {
                    sessionId: sessionId,
                    botName: session.botName
                });
                
                return next(new Error('Session is inactive'));
            }

            // Bot-specific validation for WebSocket
            if (botName && session.botName !== botName) {
                logSessionEvent('WS_BOT_MISMATCH', clientIP, `WebSocket bot mismatch: expected ${botName}, got ${session.botName}`, {
                    sessionId: sessionId,
                    expectedBot: botName,
                    actualBot: session.botName
                });
                
                return next(new Error(`Session does not belong to ${botName}`));
            }

            // Attach session to socket
            socket.session = session;
            socket.sessionId = sessionId;
            socket.botName = session.botName || botName;

            logSessionEvent('WS_VALIDATED', clientIP, `WebSocket session validated: ${socket.botName}`, {
                sessionId: sessionId,
                botName: socket.botName,
                platform: session.platform
            });

            next();
        })
        .catch(error => {
            console.error('❌ [WS-SESSION] Validation error:', error);
            logSessionEvent('WS_VALIDATION_ERROR', clientIP, `WebSocket validation error: ${error.message}`, {
                sessionId: sessionId,
                botName: botName,
                error: error.message
            });
            
            next(new Error('Session validation failed'));
        });
};

/**
 * 📊 Session health check middleware
 * Performs comprehensive health checks on sessions
 */
const sessionHealthCheck = async (req, res, next) => {
    const sessionId = extractSessionId(req);
    const clientIP = getClientIP(req);

    try {
        if (!sessionId) {
            return next(); // No session to check
        }

        const health = await savageSessionManager.healthCheck();
        const session = await savageSessionManager.getSession(sessionId, { decrypt: false });

        if (session) {
            // Perform additional session-specific health checks
            const sessionHealth = {
                exists: true,
                isActive: session.isActive,
                lastAccessed: session.lastAccessed,
                age: Date.now() - new Date(session.lastAccessed).getTime(),
                storage: {
                    mongo: health.database?.mongo || false,
                    disk: health.database?.disk || false
                },
                encryption: health.sessionManager?.encryption || false
            };

            req.sessionHealth = sessionHealth;

            // Log health issues
            if (!sessionHealth.isActive) {
                logSessionEvent('HEALTH_INACTIVE', clientIP, `Session health check: inactive session`, {
                    sessionId: sessionId,
                    botName: session.botName
                });
            }

            if (sessionHealth.age > 24 * 60 * 60 * 1000) { // 24 hours
                logSessionEvent('HEALTH_OLD', clientIP, `Session health check: old session (${Math.round(sessionHealth.age / 3600000)}h)`, {
                    sessionId: sessionId,
                    botName: session.botName,
                    ageHours: Math.round(sessionHealth.age / 3600000)
                });
            }
        }

        next();
    } catch (error) {
        console.error('❌ [SESSION-HEALTH] Health check error:', error);
        // Don't block request on health check failure
        next();
    }
};

/**
 * 🔄 Session auto-refresh middleware
 * Automatically refreshes session activity and updates access time
 */
const autoRefreshSession = (req, res, next) => {
    const sessionId = extractSessionId(req);
    const clientIP = getClientIP(req);

    if (sessionId && req.session) {
        // Update session access time asynchronously
        savageSessionManager.updateSession(sessionId, {}, { merge: true })
            .then(() => {
                logSessionEvent('AUTO_REFRESHED', clientIP, `Session auto-refreshed`, {
                    sessionId: sessionId,
                    botName: req.session.botName
                });
            })
            .catch(error => {
                console.error('❌ [SESSION-REFRESH] Auto-refresh error:', error);
                logSessionEvent('REFRESH_FAILED', clientIP, `Session auto-refresh failed: ${error.message}`, {
                    sessionId: sessionId,
                    botName: req.session.botName,
                    error: error.message
                });
            });
    }

    next();
};

/**
 * 🎯 Session usage analytics middleware
 * Tracks session usage patterns and metrics
 */
const sessionAnalytics = (req, res, next) => {
    const startTime = Date.now();
    const sessionId = extractSessionId(req);
    const clientIP = getClientIP(req);

    // Capture response finish for analytics
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const analyticsData = {
            timestamp: new Date(),
            sessionId: sessionId,
            clientIP: clientIP,
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration: duration,
            userAgent: req.get('User-Agent')?.substring(0, 100),
            botName: req.session?.botName
        };

        // Log analytics for monitoring
        if (sessionId) {
            logSessionEvent('ANALYTICS', clientIP, `Session usage: ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`, {
                sessionId: sessionId,
                botName: req.session?.botName,
                duration: duration,
                statusCode: res.statusCode
            });
        }

        // Here you could send analytics to a monitoring service
        // sendToAnalyticsService(analyticsData);
    });

    next();
};

// =============================================================================
// 🛠️ HELPER FUNCTIONS
// =============================================================================

/**
 * 🔍 Extract session ID from request
 */
function extractSessionId(req) {
    return req.headers['x-session-id'] ||
           req.headers['authorization']?.replace('Bearer ', '') ||
           req.query.sessionId ||
           req.body.sessionId;
}

/**
 * 🌐 Get client IP address
 */
function getClientIP(req) {
    return req.ip || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
           'unknown';
}

/**
 * ✅ Validate session ID format
 */
function isValidSessionIdFormat(sessionId) {
    const pattern = /^SAVAGE-XMD-BOT-SESSION-[A-Z0-9]{12}-\d{10}-[A-Z0-9]{12}$/;
    return pattern.test(sessionId);
}

/**
 * 🛡️ Check session integrity
 */
async function checkSessionIntegrity(session) {
    try {
        // Check if encrypted data can be decrypted
        if (session.encryptedData) {
            await savageSessionManager.getSession(session.sessionId, { decrypt: true });
        }

        // Verify backup hash if present
        if (session.metadata?.backupHash) {
            const currentHash = savageSessionManager.generateDataHash(session.encryptedData);
            if (session.metadata.backupHash !== currentHash) {
                return { valid: false, reason: 'Data integrity check failed' };
            }
        }

        return { valid: true };
    } catch (error) {
        return { valid: false, reason: `Decryption failed: ${error.message}` };
    }
}

/**
 * 🤖 Validate bot session (HELPER FUNCTION - renamed to avoid conflict)
 */
function validateBotSessionFunction(session) {
    const validBots = ['SAVAGE-X', 'DE-UKNOWN-BOT', 'QUEEN-RIXIE', 'SCANNER'];
    
    if (!session.botName) {
        return { valid: false, reason: 'Session has no bot association' };
    }

    if (!validBots.includes(session.botName)) {
        return { valid: false, reason: `Invalid bot name: ${session.botName}` };
    }

    return { valid: true };
}

/**
 * 💚 Check bot session health
 */
function checkBotSessionHealth(session) {
    const now = Date.now();
    const lastAccessed = new Date(session.lastAccessed).getTime();
    const sessionAge = now - lastAccessed;

    // Session is considered unhealthy if not accessed in 1 hour
    if (sessionAge > 60 * 60 * 1000) {
        return { 
            healthy: false, 
            reason: `Session inactive for ${Math.round(sessionAge / 60000)} minutes` 
        };
    }

    return { healthy: true };
}

/**
 * 📝 Log session event
 */
function logSessionEvent(type, ip, message, details = {}) {
    const emoji = getSessionEventEmoji(type);
    console.log(`${emoji} [SESSION] ${type} - IP: ${ip} - ${message}`, details);
}

/**
 * 🎯 Get emoji for session event type
 */
function getSessionEventEmoji(eventType) {
    const emojis = {
        'VALIDATED': '✅',
        'INVALID_FORMAT': '❌',
        'NOT_FOUND': '🔍',
        'INACTIVE': '💤',
        'INTEGRITY_FAILED': '🚫',
        'BOT_VALIDATION_FAILED': '🤖',
        'BOT_MISMATCH': '⚡',
        'BOT_UNHEALTHY': '🩺',
        'VALIDATION_ERROR': '💥',
        'WS_VALIDATED': '🔌',
        'WS_MISSING_SESSION': '🔌',
        'WS_SESSION_NOT_FOUND': '🔌',
        'WS_SESSION_INACTIVE': '🔌',
        'WS_BOT_MISMATCH': '🔌',
        'WS_VALIDATION_ERROR': '🔌',
        'HEALTH_INACTIVE': '🩺',
        'HEALTH_OLD': '🕐',
        'AUTO_REFRESHED': '🔄',
        'REFRESH_FAILED': '🔄',
        'ANALYTICS': '📊'
    };
    
    return emojis[eventType] || '📝';
}

/**
 * ❌ Send session error response
 */
function sendSessionError(res, statusCode, message, code, additionalData = {}) {
    return res.status(statusCode).json({
        success: false,
        error: message,
        code: code,
        timestamp: new Date(),
        ...additionalData
    });
}

// =============================================================================
// 🚀 EXPORT ALL MIDDLEWARE
// =============================================================================

module.exports = {
    // Core session validation
    validateSession,
    validateBotSession: validateBotSessionMiddleware, // Fixed: renamed to avoid conflict
    validateWebSocketSession,
    
    // Session management utilities
    sessionHealthCheck,
    autoRefreshSession,
    sessionAnalytics,
    
    // Helper functions (for testing and advanced usage)
    _helpers: {
        extractSessionId,
        getClientIP,
        isValidSessionIdFormat,
        checkSessionIntegrity,
        validateBotSession: validateBotSessionFunction, // Fixed: renamed to avoid conflict
        checkBotSessionHealth,
        logSessionEvent,
        sendSessionError
    }
};
