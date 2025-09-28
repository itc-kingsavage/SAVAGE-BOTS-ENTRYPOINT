/**
 * 🦅 SAVAGE BOTS SCANNER - Password Authentication
 * Secure password protection with brute-force prevention
 * Hacker-themed authentication system
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { SECURITY_CONFIG, UI_CONFIG, MESSAGES } = require('../config/constants');

class SavagePasswordAuth {
    constructor() {
        this.attempts = new Map(); // Track login attempts by IP
        this.lockedIPs = new Map(); // Track locked IP addresses
        this.sessionTokens = new Map(); // Active session tokens
        this.auditLog = []; // Security audit trail
        
        this.initializeSecurity();
    }

    /**
     * 🔐 Initialize security systems
     */
    initializeSecurity() {
        // Load or set master password
        this.masterPassword = process.env.SCANNER_PASSWORD;
        
        if (!this.masterPassword) {
            console.warn('⚠️ [AUTH] SCANNER_PASSWORD not set in environment');
            // For development only - remove in production
            this.masterPassword = '$S.Bots_2022@_';
            console.warn('⚠️ [AUTH] Using default password - UNSECURE FOR PRODUCTION');
        }

        console.log('✅ [AUTH] Password authentication system initialized');
        console.log(`🔐 [AUTH] Password length: ${this.masterPassword.length} characters`);
        
        // Start cleanup interval
        this.startCleanupInterval();
    }

    /**
     * 🔑 Validate password with security checks
     */
    async validatePassword(password, clientIP = 'unknown') {
        try {
            // Security checks
            const securityCheck = await this.performSecurityChecks(clientIP);
            if (!securityCheck.allowed) {
                return {
                    success: false,
                    error: securityCheck.reason,
                    locked: securityCheck.locked,
                    retryAfter: securityCheck.retryAfter
                };
            }

            // Validate password
            const isValid = password === this.masterPassword;
            
            if (isValid) {
                // Successful login
                await this.handleSuccessfulLogin(clientIP);
                
                const sessionToken = this.generateSessionToken();
                this.sessionTokens.set(sessionToken, {
                    ip: clientIP,
                    createdAt: new Date(),
                    lastAccess: new Date()
                });

                // Log successful attempt
                this.logSecurityEvent('SUCCESS', clientIP, 'Password accepted');

                return {
                    success: true,
                    sessionToken,
                    message: 'Authentication successful',
                    redirect: '/scanner'
                };

            } else {
                // Failed login
                await this.handleFailedLogin(clientIP);
                
                // Log failed attempt
                this.logSecurityEvent('FAILED', clientIP, 'Invalid password');

                const attempts = this.attempts.get(clientIP) || { count: 0 };
                const remainingAttempts = SECURITY_CONFIG.PASSWORD.MAX_ATTEMPTS - attempts.count;

                return {
                    success: false,
                    error: MESSAGES.ERRORS.AUTH_FAILED,
                    remainingAttempts,
                    locked: remainingAttempts <= 0
                };
            }

        } catch (error) {
            console.error('❌ [AUTH] Password validation error:', error);
            this.logSecurityEvent('ERROR', clientIP, `Validation error: ${error.message}`);
            
            return {
                success: false,
                error: 'Authentication system error'
            };
        }
    }

    /**
     * 🛡️ Perform security checks before authentication
     */
    async performSecurityChecks(clientIP) {
        // Check if IP is locked
        const lockInfo = this.lockedIPs.get(clientIP);
        if (lockInfo && lockInfo.expires > Date.now()) {
            const retryAfter = Math.ceil((lockInfo.expires - Date.now()) / 1000);
            return {
                allowed: false,
                locked: true,
                reason: `IP temporarily locked. Try again in ${retryAfter} seconds.`,
                retryAfter
            };
        }

        // Check attempt count
        const attempts = this.attempts.get(clientIP) || { count: 0, firstAttempt: Date.now() };
        if (attempts.count >= SECURITY_CONFIG.PASSWORD.MAX_ATTEMPTS) {
            // Lock the IP
            const lockDuration = SECURITY_CONFIG.PASSWORD.LOCKOUT_TIME;
            this.lockedIPs.set(clientIP, {
                expires: Date.now() + lockDuration,
                reason: 'Max attempts exceeded'
            });

            this.logSecurityEvent('LOCKED', clientIP, `IP locked for ${lockDuration/1000} seconds`);

            return {
                allowed: false,
                locked: true,
                reason: `Too many failed attempts. IP locked for ${lockDuration/1000/60} minutes.`,
                retryAfter: lockDuration / 1000
            };
        }

        return { allowed: true };
    }

    /**
     * ✅ Handle successful login
     */
    async handleSuccessfulLogin(clientIP) {
        // Clear failed attempts for this IP
        this.attempts.delete(clientIP);
        this.lockedIPs.delete(clientIP);
        
        // Log the successful login
        this.logSecurityEvent('LOGIN', clientIP, 'User authenticated successfully');
    }

    /**
     * ❌ Handle failed login
     */
    async handleFailedLogin(clientIP) {
        const now = Date.now();
        let attempts = this.attempts.get(clientIP);

        if (!attempts) {
            attempts = {
                count: 0,
                firstAttempt: now,
                lastAttempt: now
            };
        }

        attempts.count++;
        attempts.lastAttempt = now;

        // Reset counter if first attempt was long ago
        if (now - attempts.firstAttempt > SECURITY_CONFIG.PASSWORD.LOCKOUT_TIME) {
            attempts.count = 1;
            attempts.firstAttempt = now;
        }

        this.attempts.set(clientIP, attempts);

        console.log(`⚠️ [AUTH] Failed login attempt from ${clientIP}. Attempt ${attempts.count}/${SECURITY_CONFIG.PASSWORD.MAX_ATTEMPTS}`);
    }

    /**
     * 🎫 Validate session token
     */
    validateSessionToken(token, clientIP = 'unknown') {
        try {
            const session = this.sessionTokens.get(token);
            
            if (!session) {
                return {
                    valid: false,
                    error: 'Invalid session token'
                };
            }

            // Check if session is expired (24 hours)
            const sessionAge = Date.now() - session.createdAt.getTime();
            const maxSessionAge = 24 * 60 * 60 * 1000; // 24 hours

            if (sessionAge > maxSessionAge) {
                this.sessionTokens.delete(token);
                this.logSecurityEvent('EXPIRED', clientIP, 'Session token expired');
                
                return {
                    valid: false,
                    error: 'Session expired'
                };
            }

            // Optional: Check IP match (can be disabled for proxy setups)
            if (session.ip !== clientIP && clientIP !== 'unknown') {
                console.warn(`⚠️ [AUTH] Session token used from different IP: ${session.ip} -> ${clientIP}`);
                this.logSecurityEvent('IP_MISMATCH', clientIP, `Token from ${session.ip} used by ${clientIP}`);
            }

            // Update last access
            session.lastAccess = new Date();
            this.sessionTokens.set(token, session);

            return {
                valid: true,
                session: {
                    ip: session.ip,
                    createdAt: session.createdAt,
                    lastAccess: session.lastAccess
                }
            };

        } catch (error) {
            console.error('❌ [AUTH] Session validation error:', error);
            return {
                valid: false,
                error: 'Session validation error'
            };
        }
    }

    /**
     * 🚪 Logout - invalidate session
     */
    logout(token, clientIP = 'unknown') {
        if (this.sessionTokens.has(token)) {
            this.sessionTokens.delete(token);
            this.logSecurityEvent('LOGOUT', clientIP, 'User logged out');
            
            return {
                success: true,
                message: 'Logged out successfully'
            };
        }

        return {
            success: false,
            error: 'No active session found'
        };
    }

    /**
     * 🔧 Generate secure session token
     */
    generateSessionToken() {
        const token = crypto.randomBytes(32).toString('hex');
        const timestamp = Date.now();
        
        // Add some entropy
        return `savage_${token}_${timestamp}`;
    }

    /**
     * 📊 Get authentication statistics
     */
    getAuthStats() {
        const now = Date.now();
        const activeSessions = this.sessionTokens.size;
        const lockedIPs = Array.from(this.lockedIPs.entries()).filter(([_, lock]) => lock.expires > now).length;
        const recentAttempts = Array.from(this.attempts.entries()).filter(([_, attempt]) => 
            now - attempt.lastAttempt < 3600000 // Last hour
        ).length;

        return {
            activeSessions,
            lockedIPs,
            recentAttempts,
            totalAuditEvents: this.auditLog.length,
            timestamp: new Date()
        };
    }

    /**
     * 🧹 Cleanup expired data
     */
    cleanupExpiredData() {
        const now = Date.now();
        let cleaned = 0;

        // Clean expired session tokens (older than 24 hours)
        for (const [token, session] of this.sessionTokens.entries()) {
            if (now - session.createdAt.getTime() > 24 * 60 * 60 * 1000) {
                this.sessionTokens.delete(token);
                cleaned++;
            }
        }

        // Clean expired IP locks
        for (const [ip, lock] of this.lockedIPs.entries()) {
            if (lock.expires <= now) {
                this.lockedIPs.delete(ip);
                cleaned++;
            }
        }

        // Clean old attempts (older than lockout time)
        for (const [ip, attempt] of this.attempts.entries()) {
            if (now - attempt.firstAttempt > SECURITY_CONFIG.PASSWORD.LOCKOUT_TIME) {
                this.attempts.delete(ip);
                cleaned++;
            }
        }

        // Keep only last 1000 audit events
        if (this.auditLog.length > 1000) {
            this.auditLog = this.auditLog.slice(-1000);
        }

        console.log(`🧹 [AUTH] Cleanup completed: ${cleaned} expired entries removed`);
        return { cleaned, timestamp: new Date() };
    }

    /**
     * 📝 Log security event
     */
    logSecurityEvent(type, ip, message, details = {}) {
        const event = {
            type,
            ip,
            message,
            timestamp: new Date(),
            userAgent: details.userAgent || 'unknown',
            ...details
        };

        this.auditLog.push(event);

        // Log to console based on event type
        const emoji = this.getEventEmoji(type);
        console.log(`${emoji} [AUTH-AUDIT] ${type} - IP: ${ip} - ${message}`);

        // Save to file in production
        if (process.env.NODE_ENV === 'production') {
            this.saveAuditToFile(event).catch(console.error);
        }
    }

    /**
     * 💾 Save audit event to file
     */
    async saveAuditToFile(event) {
        try {
            const logDir = '/tmp/savage-auth-logs';
            await fs.mkdir(logDir, { recursive: true });
            
            const logFile = path.join(logDir, `auth-${new Date().toISOString().split('T')[0]}.log`);
            const logEntry = `${event.timestamp.toISOString()} | ${event.type} | ${event.ip} | ${event.message}\n`;
            
            await fs.appendFile(logFile, logEntry, 'utf8');
        } catch (error) {
            console.error('❌ [AUTH] Failed to save audit log:', error);
        }
    }

    /**
     * 🎯 Get emoji for event type
     */
    getEventEmoji(eventType) {
        const emojis = {
            'SUCCESS': '✅',
            'FAILED': '❌',
            'LOCKED': '🔒',
            'LOGIN': '🔑',
            'LOGOUT': '🚪',
            'EXPIRED': '⏰',
            'IP_MISMATCH': '⚠️',
            'ERROR': '💥'
        };
        
        return emojis[eventType] || '📝';
    }

    /**
     * ⏰ Start cleanup interval
     */
    startCleanupInterval() {
        // Cleanup every hour
        setInterval(() => {
            this.cleanupExpiredData();
        }, 60 * 60 * 1000);

        console.log('✅ [AUTH] Cleanup interval started (every hour)');
    }

    /**
     * 🏥 Health check
     */
    healthCheck() {
        const stats = this.getAuthStats();
        
        return {
            status: 'healthy',
            masterPasswordSet: !!this.masterPassword,
            activeSessions: stats.activeSessions,
            lockedIPs: stats.lockedIPs,
            auditEvents: stats.totalAuditEvents,
            timestamp: new Date()
        };
    }

    /**
     * 🔍 Get audit log (for admin purposes)
     */
    getAuditLog(limit = 50, filter = {}) {
        let logs = [...this.auditLog].reverse(); // Most recent first

        // Apply filters
        if (filter.type) {
            logs = logs.filter(log => log.type === filter.type);
        }
        if (filter.ip) {
            logs = logs.filter(log => log.ip === filter.ip);
        }
        if (filter.startDate) {
            const start = new Date(filter.startDate);
            logs = logs.filter(log => new Date(log.timestamp) >= start);
        }
        if (filter.endDate) {
            const end = new Date(filter.endDate);
            logs = logs.filter(log => new Date(log.timestamp) <= end);
        }

        return logs.slice(0, limit);
    }

    /**
     * 🚨 Emergency lock IP
     */
    emergencyLockIP(ip, reason = 'Manual lock', duration = SECURITY_CONFIG.PASSWORD.LOCKOUT_TIME) {
        this.lockedIPs.set(ip, {
            expires: Date.now() + duration,
            reason,
            manual: true
        });

        this.logSecurityEvent('MANUAL_LOCK', ip, `Emergency lock: ${reason}`);
        
        return {
            success: true,
            ip,
            expires: new Date(Date.now() + duration),
            reason
        };
    }

    /**
     * 🔓 Manual unlock IP
     */
    manualUnlockIP(ip) {
        const wasLocked = this.lockedIPs.has(ip);
        this.lockedIPs.delete(ip);
        this.attempts.delete(ip); // Also clear attempts

        if (wasLocked) {
            this.logSecurityEvent('MANUAL_UNLOCK', ip, 'IP manually unlocked');
        }

        return {
            success: true,
            ip,
            wasLocked
        };
    }
}

// Create and export singleton instance
const savagePasswordAuth = new SavagePasswordAuth();

module.exports = savagePasswordAuth;
