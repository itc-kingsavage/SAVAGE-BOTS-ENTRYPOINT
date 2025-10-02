/**
 * 🦅 SAVAGE BOTS SCANNER - Password Authentication Middleware
 * Express middleware for route protection and session validation
 * Hacker-themed security with brute-force protection
 */

const savagePasswordAuth = require('../auth/passwordAuth');
const { MESSAGES, SECURITY_CONFIG } = require('../config/constants');

/**
 * 🔐 Main password authentication middleware
 * Protects routes requiring password authentication
 */
const requirePasswordAuth = (req, res, next) => {
    const clientIP = getClientIP(req);
    const sessionToken = extractSessionToken(req);
    
    console.log(`🔐 [AUTH-MIDDLEWARE] Authentication check for IP: ${clientIP}`);

    // Check if IP is locked
    const lockCheck = checkIPLock(clientIP);
    if (!lockCheck.allowed) {
        return sendAuthError(res, 423, lockCheck.reason, 'IP_LOCKED', {
            retryAfter: lockCheck.retryAfter,
            locked: true
        });
    }

    // Check session token
    if (!sessionToken) {
        logSecurityEvent('MISSING_TOKEN', clientIP, 'No session token provided', {
            path: req.path,
            method: req.method
        });
        
        return sendAuthError(res, 401, 'Authentication token required', 'MISSING_TOKEN');
    }

    // Validate session token
    const tokenValidation = savagePasswordAuth.validateSessionToken(sessionToken, clientIP);
    if (!tokenValidation.valid) {
        logSecurityEvent('INVALID_TOKEN', clientIP, `Token validation failed: ${tokenValidation.error}`, {
            path: req.path,
            method: req.method
        });
        
        return sendAuthError(res, 401, tokenValidation.error || 'Invalid session token', 'INVALID_TOKEN');
    }

    // Authentication successful
    req.auth = {
        authenticated: true,
        session: tokenValidation.session,
        clientIP: clientIP,
        sessionToken: sessionToken
    };

    logSecurityEvent('ACCESS_GRANTED', clientIP, `Access granted to ${req.path}`, {
        path: req.path,
        method: req.method,
        userAgent: req.get('User-Agent')
    });

    next();
};

/**
 * 🚫 Optional authentication middleware
 * Adds auth info to request if available, but doesn't block access
 */
const optionalPasswordAuth = (req, res, next) => {
    const clientIP = getClientIP(req);
    const sessionToken = extractSessionToken(req);

    if (sessionToken) {
        const tokenValidation = savagePasswordAuth.validateSessionToken(sessionToken, clientIP);
        
        if (tokenValidation.valid) {
            req.auth = {
                authenticated: true,
                session: tokenValidation.session,
                clientIP: clientIP,
                sessionToken: sessionToken
            };
        } else {
            req.auth = {
                authenticated: false,
                clientIP: clientIP
            };
        }
    } else {
        req.auth = {
            authenticated: false,
            clientIP: clientIP
        };
    }

    next();
};

/**
 * 👑 Admin-only middleware
 * Requires authentication and additional admin privileges
 */
const requireAdminAuth = (req, res, next) => {
    const clientIP = getClientIP(req);
    
    // First check basic authentication
    requirePasswordAuth(req, res, (err) => {
        if (err) return next(err);
        
        // Check admin privileges (you can extend this with role-based auth)
        const isAdmin = checkAdminPrivileges(req.auth);
        
        if (!isAdmin) {
            logSecurityEvent('ADMIN_DENIED', clientIP, 'Non-admin attempt to access admin route', {
                path: req.path,
                method: req.method
            });
            
            return sendAuthError(res, 403, 'Administrator privileges required', 'ADMIN_REQUIRED');
        }

        logSecurityEvent('ADMIN_ACCESS', clientIP, `Admin access granted to ${req.path}`);
        next();
    });
};

/**
 * ⚡ Rate limiting middleware with IP-based tracking
 */
const createRateLimit = (options = {}) => {
    const {
        windowMs = 15 * 60 * 1000, // 15 minutes
        maxAttempts = 100,
        skipSuccessfulRequests = false,
        message = 'Too many requests, please try again later.'
    } = options;

    const attempts = new Map();

    return (req, res, next) => {
        const clientIP = getClientIP(req);
        const now = Date.now();
        const windowStart = now - windowMs;

        // Clean old entries
        cleanupOldEntries(attempts, windowStart);

        // Get or create attempt record for this IP
        let ipAttempts = attempts.get(clientIP) || {
            count: 0,
            firstAttempt: now,
            lastAttempt: now
        };

        // Check if rate limit exceeded
        if (ipAttempts.count >= maxAttempts) {
            logSecurityEvent('RATE_LIMITED', clientIP, `Rate limit exceeded: ${ipAttempts.count}/${maxAttempts}`, {
                path: req.path,
                method: req.method
            });

            return res.status(429).json({
                success: false,
                error: message,
                code: 'RATE_LIMITED',
                retryAfter: Math.ceil((ipAttempts.firstAttempt + windowMs - now) / 1000),
                timestamp: new Date()
            });
        }

        // Increment attempt count
        ipAttempts.count++;
        ipAttempts.lastAttempt = now;
        attempts.set(clientIP, ipAttempts);

        // Add rate limit headers to response
        res.set({
            'X-RateLimit-Limit': maxAttempts,
            'X-RateLimit-Remaining': Math.max(0, maxAttempts - ipAttempts.count),
            'X-RateLimit-Reset': Math.ceil((ipAttempts.firstAttempt + windowMs) / 1000)
        });

        // Skip counting successful requests if configured
        if (skipSuccessfulRequests) {
            const originalSend = res.send;
            res.send = function(data) {
                if (res.statusCode < 400) {
                    ipAttempts.count = Math.max(0, ipAttempts.count - 1);
                    attempts.set(clientIP, ipAttempts);
                }
                originalSend.call(this, data);
            };
        }

        next();
    };
};

/**
 * 🌐 CORS middleware with security headers
 */
const securityHeaders = (req, res, next) => {
    // Basic security headers
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';",
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
    });

    // Custom header for SAVAGE BOTS
    res.set('X-Powered-By', 'SAVAGE BOTS TECHNOLOGY - When ordinary isn\'t an option');

    next();
};

/**
 * 📊 Request logging middleware
 */
const requestLogger = (req, res, next) => {
    const clientIP = getClientIP(req);
    const startTime = Date.now();
    
    // Log request start
    console.log(`📥 [REQUEST] ${req.method} ${req.path} - IP: ${clientIP} - User-Agent: ${req.get('User-Agent')?.substring(0, 50)}...`);

    // Capture response finish
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const logLevel = res.statusCode >= 400 ? '❌' : '✅';
        
        console.log(`${logLevel} [RESPONSE] ${req.method} ${req.path} - Status: ${res.statusCode} - Duration: ${duration}ms - IP: ${clientIP}`);
        
        // Log security events for certain status codes
        if (res.statusCode === 401) {
            logSecurityEvent('UNAUTHORIZED', clientIP, `Unauthorized access attempt to ${req.path}`);
        } else if (res.statusCode === 403) {
            logSecurityEvent('FORBIDDEN', clientIP, `Forbidden access to ${req.path}`);
        } else if (res.statusCode === 429) {
            logSecurityEvent('RATE_LIMIT_APPLIED', clientIP, `Rate limit applied to ${req.path}`);
        }
    });

    next();
};

/**
 * 🛡️ CSRF protection middleware
 */
const csrfProtection = (req, res, next) => {
    // Skip CSRF for GET, HEAD, OPTIONS
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    // Check CSRF token for state-changing requests
    const csrfToken = req.headers['x-csrf-token'] || req.body._csrf;
    const sessionToken = extractSessionToken(req);

    if (!csrfToken) {
        return sendAuthError(res, 403, 'CSRF token required', 'CSRF_TOKEN_REQUIRED');
    }

    // In a real implementation, you would validate the CSRF token against the session
    // For now, we'll do a basic validation
    if (!validateCsrfToken(csrfToken, sessionToken)) {
        logSecurityEvent('CSRF_FAILED', getClientIP(req), 'CSRF token validation failed', {
            path: req.path,
            method: req.method
        });
        
        return sendAuthError(res, 403, 'Invalid CSRF token', 'CSRF_TOKEN_INVALID');
    }

    next();
};

// =============================================================================
// 🛠️ HELPER FUNCTIONS
// =============================================================================

/**
 * 🔍 Extract client IP address from request
 */
function getClientIP(req) {
    return req.ip || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
           'unknown';
}

/**
 * 🎫 Extract session token from request
 */
function extractSessionToken(req) {
    return req.headers['authorization']?.replace('Bearer ', '') ||
           req.headers['x-auth-token'] ||
           req.query.token ||
           req.cookies?.savage_session;
}

/**
 * 🔒 Check if IP is locked
 */
function checkIPLock(clientIP) {
    // This would integrate with savagePasswordAuth IP locking system
    // For now, return mock response
    return { allowed: true };
    
    // Real implementation would be:
    // return savagePasswordAuth.checkIPLock(clientIP);
}

/**
 * 👑 Check admin privileges
 */
function checkAdminPrivileges(auth) {
    // Implement your admin checking logic here
    // This could be based on user roles, specific tokens, etc.
    
    // For now, allow all authenticated users as admin
    // In production, implement proper role-based access control
    return auth && auth.authenticated;
}

/**
 * 🧹 Cleanup old rate limit entries
 */
function cleanupOldEntries(attemptsMap, windowStart) {
    for (const [ip, data] of attemptsMap.entries()) {
        if (data.lastAttempt < windowStart) {
            attemptsMap.delete(ip);
        }
    }
}

/**
 * 📝 Log security event
 */
function logSecurityEvent(type, ip, message, details = {}) {
    const emoji = getSecurityEventEmoji(type);
    console.log(`${emoji} [SECURITY] ${type} - IP: ${ip} - ${message}`, details);
}

/**
 * 🎯 Get emoji for security event type
 */
function getSecurityEventEmoji(eventType) {
    const emojis = {
        'MISSING_TOKEN': '🔍',
        'INVALID_TOKEN': '❌',
        'ACCESS_GRANTED': '✅',
        'IP_LOCKED': '🔒',
        'RATE_LIMITED': '⚡',
        'UNAUTHORIZED': '🚫',
        'FORBIDDEN': '🚷',
        'ADMIN_DENIED': '👑',
        'ADMIN_ACCESS': '👑',
        'CSRF_FAILED': '🛡️',
        'RATE_LIMIT_APPLIED': '⏰'
    };
    
    return emojis[eventType] || '📝';
}

/**
 * ❌ Send authentication error response
 */
function sendAuthError(res, statusCode, message, code, additionalData = {}) {
    return res.status(statusCode).json({
        success: false,
        error: message,
        code: code,
        timestamp: new Date(),
        ...additionalData
    });
}

/**
 * 🛡️ Validate CSRF token
 */
function validateCsrfToken(csrfToken, sessionToken) {
    // In a real implementation, you would:
    // 1. Store CSRF tokens in session
    // 2. Validate that the provided token matches the session token
    // 3. Use a library like csurf for production
    
    // For now, basic validation
    return csrfToken && csrfToken.length > 10;
}

/**
 * 🔄 Session refresh middleware
 * Automatically refreshes session on successful requests
 */
const autoRefreshSession = (req, res, next) => {
    if (req.auth && req.auth.authenticated) {
        // Refresh the session token (extend expiration)
        const newToken = savagePasswordAuth.refreshSessionToken(req.auth.sessionToken);
        
        if (newToken) {
            // Set new token in response header
            res.set('X-New-Session-Token', newToken);
            req.auth.sessionToken = newToken;
        }
    }
    
    next();
};

/**
 * 🕵️ Request validation middleware
 * Validates request body, params, and queries
 */
const validateRequest = (validationRules) => {
    return (req, res, next) => {
        const errors = [];
        
        // Check body
        if (validationRules.body) {
            for (const [field, rule] of Object.entries(validationRules.body)) {
                const value = req.body[field];
                if (rule.required && !value) {
                    errors.push(`${field} is required`);
                } else if (value && rule.type && typeof value !== rule.type) {
                    errors.push(`${field} must be ${rule.type}`);
                } else if (value && rule.minLength && value.length < rule.minLength) {
                    errors.push(`${field} must be at least ${rule.minLength} characters`);
                } else if (value && rule.maxLength && value.length > rule.maxLength) {
                    errors.push(`${field} must be at most ${rule.maxLength} characters`);
                }
            }
        }
        
        // Check params
        if (validationRules.params) {
            for (const [field, rule] of Object.entries(validationRules.params)) {
                const value = req.params[field];
                if (rule.required && !value) {
                    errors.push(`Parameter ${field} is required`);
                }
            }
        }
        
        // Check query
        if (validationRules.query) {
            for (const [field, rule] of Object.entries(validationRules.query)) {
                const value = req.query[field];
                if (rule.required && !value) {
                    errors.push(`Query parameter ${field} is required`);
                }
            }
        }
        
        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                code: 'VALIDATION_ERROR',
                details: errors,
                timestamp: new Date()
            });
        }
        
        next();
    };
};

// =============================================================================
// 🚀 EXPORT ALL MIDDLEWARE
// =============================================================================

module.exports = {
    // Core authentication middleware
    requirePasswordAuth,
    optionalPasswordAuth,
    requireAdminAuth,
    
    // Security middleware
    createRateLimit,
    securityHeaders,
    csrfProtection,
    
    // Utility middleware
    requestLogger,
    autoRefreshSession,
    validateRequest,
    
    // Helper functions (for testing and advanced usage)
    _helpers: {
        getClientIP,
        extractSessionToken,
        checkIPLock,
        logSecurityEvent,
        sendAuthError
    }
};
