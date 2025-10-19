/**
 * 🦅 SAVAGE BOTS SCANNER - Session Manager
 * Encrypted session management with dual backup system
 * Supports: MongoDB + Render Disk backup with auto-recovery
 * UPDATED: Automatic QR Generation & Render Deployment
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const savageDatabase = require('../config/database');
const { 
    SECURITY_CONFIG, 
    DATABASE_CONFIG, 
    BOT_CONFIG,
    DEPLOYMENT,
    generateSessionId,
    isValidSessionId 
} = require('../config/constants');

class SavageSessionManager {
    constructor() {
        this.encryptionKey = null;
        this.backupDir = DATABASE_CONFIG.BACKUP.DISK_PATH;
        this.activeSessions = new Map();
        this.recoveryMode = false;
        
        // ✅ ADDED: Auto-create backup directory for Render
        this.initializeBackupDirectory();
        this.initializeEncryption();
    }

    /**
     * 📁 Initialize backup directory for Render
     */
    async initializeBackupDirectory() {
        try {
            // Use Render's persistent storage path
            this.backupDir = DEPLOYMENT.getCurrentPlatform().DISK_PATH + '/savage_sessions';
            
            await fs.mkdir(this.backupDir, { recursive: true });
            console.log(`✅ [SESSION-MGR] Backup directory initialized: ${this.backupDir}`);
        } catch (error) {
            console.warn(`⚠️ [SESSION-MGR] Backup directory creation failed: ${error.message}`);
            // Fallback to /tmp
            this.backupDir = '/tmp/savage_sessions';
        }
    }

    /**
     * 🔑 Initialize encryption system
     */
    initializeEncryption() {
        try {
            const envKey = process.env.SESSION_ENCRYPTION_KEY;
            
            if (!envKey) {
                console.warn('⚠️ [SESSION-MGR] No SESSION_ENCRYPTION_KEY - Using temporary key (NOT FOR PRODUCTION)');
                // Generate temporary key for development
                this.encryptionKey = crypto.randomBytes(SECURITY_CONFIG.ENCRYPTION.KEY_LENGTH);
                return;
            }

            if (envKey.length !== SECURITY_CONFIG.ENCRYPTION.KEY_LENGTH * 2) {
                throw new Error(`Encryption key must be ${SECURITY_CONFIG.ENCRYPTION.KEY_LENGTH * 2} characters (${SECURITY_CONFIG.ENCRYPTION.KEY_LENGTH} bytes)`);
            }

            this.encryptionKey = Buffer.from(envKey, 'hex');
            console.log('✅ [SESSION-MGR] Encryption system initialized');

        } catch (error) {
            console.error('❌ [SESSION-MGR] Encryption initialization failed:', error.message);
            // Use temporary key as fallback
            this.encryptionKey = crypto.randomBytes(SECURITY_CONFIG.ENCRYPTION.KEY_LENGTH);
        }
    }

    /**
     * 🔒 Encrypt session data
     */
    encryptSessionData(sessionData) {
        try {
            const iv = crypto.randomBytes(SECURITY_CONFIG.ENCRYPTION.IV_LENGTH);
            const cipher = crypto.createCipheriv(
                SECURITY_CONFIG.ENCRYPTION.ALGORITHM, 
                this.encryptionKey, 
                iv
            );

            // Add authentication data
            cipher.setAAD(Buffer.from('SAVAGE-BOTS-SESSION'));

            let encrypted = cipher.update(JSON.stringify(sessionData), 'utf8', 'hex');
            encrypted += cipher.final('hex');
            const authTag = cipher.getAuthTag();

            return {
                iv: iv.toString('hex'),
                data: encrypted,
                authTag: authTag.toString('hex'),
                algorithm: SECURITY_CONFIG.ENCRYPTION.ALGORITHM,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ [SESSION-MGR] Session encryption failed:', error);
            throw new Error('Failed to encrypt session data');
        }
    }

    /**
     * 🔓 Decrypt session data
     */
    decryptSessionData(encryptedData) {
        try {
            const decipher = crypto.createDecipheriv(
                encryptedData.algorithm,
                this.encryptionKey,
                Buffer.from(encryptedData.iv, 'hex')
            );

            decipher.setAAD(Buffer.from('SAVAGE-BOTS-SESSION'));
            decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

            let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return JSON.parse(decrypted);

        } catch (error) {
            console.error('❌ [SESSION-MGR] Session decryption failed:', error);
            throw new Error('Failed to decrypt session data - possible corruption or wrong key');
        }
    }

    /**
     * 💾 Create new WhatsApp session with dual backup - UPDATED for automatic mode
     */
    async createSession(whatsappData, options = {}) {
        try {
            const {
                phoneNumber = 'auto-detected', // ✅ CHANGED: Auto-detection
                platform = DEPLOYMENT.getCurrentPlatform().NAME,
                botName = 'SCANNER',
                metadata = {},
                connectionType = 'automatic' // ✅ ADDED: Automatic QR mode
            } = options;

            // Generate BMW-style session ID
            const sessionId = generateSessionId();
            
            console.log(`🦅 [SESSION-MGR] Creating new session: ${sessionId}`);
            console.log(`📱 [SESSION-MGR] Phone: ${phoneNumber}, Connection: ${connectionType}, Platform: ${platform}`);

            // Encrypt the WhatsApp session data
            const encryptedData = this.encryptSessionData(whatsappData);
            const encryptedString = JSON.stringify(encryptedData);

            // Prepare session document
            const sessionDoc = {
                sessionId,
                phoneNumber,
                encryptedData: encryptedString,
                botName,
                platform,
                connectionType, // ✅ ADDED: Track connection type
                sessionType: 'primary',
                isActive: true,
                metadata: {
                    ...metadata,
                    version: '2.0.0', // ✅ UPDATED: Version
                    createdBy: 'SAVAGE-BOTS-SCANNER',
                    encryption: SECURITY_CONFIG.ENCRYPTION.ALGORITHM,
                    backupHash: this.generateDataHash(encryptedString),
                    automaticMode: connectionType === 'automatic' // ✅ ADDED: Auto-mode flag
                },
                createdAt: new Date(),
                lastAccessed: new Date()
            };

            // ✅ ADDED: Save to disk backup for Render persistence
            await this.saveToDiskBackup(sessionId, sessionDoc);

            // Save to MongoDB
            const saveResult = await savageDatabase.saveSession(sessionDoc);

            if (saveResult.success) {
                // Cache in memory for fast access
                this.activeSessions.set(sessionId, {
                    ...sessionDoc,
                    decryptedData: whatsappData, // Keep decrypted version in memory
                    lastAccessed: new Date()
                });

                console.log(`✅ [SESSION-MGR] Session created successfully: ${sessionId}`);
                console.log(`💾 [SESSION-MGR] Storage: MongoDB: ${saveResult.mongo}, Disk: true`);

                return {
                    success: true,
                    sessionId,
                    phoneNumber,
                    botName,
                    platform,
                    connectionType,
                    storage: {
                        mongo: saveResult.mongo,
                        disk: true
                    },
                    timestamp: new Date()
                };
            } else {
                throw new Error('Failed to save session to storage systems');
            }

        } catch (error) {
            console.error('❌ [SESSION-MGR] Session creation failed:', error);
            throw error;
        }
    }

    /**
     * 💾 Save session to disk backup - NEW METHOD for Render
     */
    async saveToDiskBackup(sessionId, sessionDoc) {
        try {
            const backupPath = path.join(this.backupDir, `${sessionId}.json`);
            await fs.writeFile(backupPath, JSON.stringify(sessionDoc, null, 2));
            return true;
        } catch (error) {
            console.warn(`⚠️ [SESSION-MGR] Disk backup failed for ${sessionId}:`, error.message);
            return false;
        }
    }

    /**
     * 🔄 Get session with auto-recovery - UPDATED for Render
     */
    async getSession(sessionId, options = {}) {
        try {
            const { decrypt = true, updateAccess = true } = options;

            // Check memory cache first
            if (this.activeSessions.has(sessionId)) {
                const cached = this.activeSessions.get(sessionId);
                if (updateAccess) {
                    cached.lastAccessed = new Date();
                }
                console.log(`⚡ [SESSION-MGR] Session loaded from cache: ${sessionId}`);
                return decrypt ? cached.decryptedData : cached;
            }

            console.log(`🔍 [SESSION-MGR] Loading session: ${sessionId}`);

            // Try MongoDB first
            let sessionDoc = await savageDatabase.getSession(sessionId);

            // ✅ ADDED: If MongoDB fails, try disk backup (for Render cold starts)
            if (!sessionDoc) {
                console.log(`🔄 [SESSION-MGR] MongoDB miss, checking disk backup: ${sessionId}`);
                sessionDoc = await this.getDiskBackup(sessionId);
                
                if (sessionDoc) {
                    console.log(`✅ [SESSION-MGR] Session restored from disk: ${sessionId}`);
                    // Restore to MongoDB
                    await savageDatabase.saveSession(sessionDoc);
                }
            }

            if (!sessionDoc) {
                console.log(`❌ [SESSION-MGR] Session not found: ${sessionId}`);
                return null;
            }

            // Update access time
            if (updateAccess) {
                sessionDoc.lastAccessed = new Date();
                await savageDatabase.saveSession(sessionDoc);
            }

            let decryptedData = null;
            if (decrypt) {
                try {
                    const encryptedData = JSON.parse(sessionDoc.encryptedData);
                    decryptedData = this.decryptSessionData(encryptedData);
                } catch (decryptError) {
                    console.error(`❌ [SESSION-MGR] Session decryption failed: ${sessionId}`, decryptError);
                    
                    // Try to recover from backup if available
                    if (sessionDoc.metadata?.backupHash) {
                        console.log(`🔄 [SESSION-MGR] Attempting recovery for: ${sessionId}`);
                        const recovered = await this.attemptSessionRecovery(sessionId);
                        if (recovered) {
                            return recovered;
                        }
                    }
                    
                    throw new Error('Session data corrupted and recovery failed');
                }
            }

            // Cache in memory
            const sessionData = {
                ...sessionDoc,
                decryptedData,
                lastAccessed: new Date()
            };

            this.activeSessions.set(sessionId, sessionData);

            console.log(`✅ [SESSION-MGR] Session loaded successfully: ${sessionId}`);
            return decrypt ? decryptedData : sessionData;

        } catch (error) {
            console.error(`❌ [SESSION-MGR] Get session failed: ${sessionId}`, error);
            throw error;
        }
    }

    /**
     * 🛡️ Attempt session recovery from backups - UPDATED for Render
     */
    async attemptSessionRecovery(sessionId) {
        try {
            console.log(`🛡️ [SESSION-MGR] Starting recovery for: ${sessionId}`);
            
            // Check if we have disk backup
            const diskBackup = await this.getDiskBackup(sessionId);
            if (diskBackup) {
                console.log(`✅ [SESSION-MGR] Recovery successful from disk: ${sessionId}`);
                
                // Restore to database
                await savageDatabase.saveSession(diskBackup);
                
                // Cache in memory
                this.activeSessions.set(sessionId, {
                    ...diskBackup,
                    lastAccessed: new Date()
                });

                return diskBackup.decryptedData || 
                       this.decryptSessionData(JSON.parse(diskBackup.encryptedData));
            }

            console.log(`❌ [SESSION-MGR] Recovery failed - no backups found: ${sessionId}`);
            return null;

        } catch (error) {
            console.error(`❌ [SESSION-MGR] Recovery attempt failed: ${sessionId}`, error);
            return null;
        }
    }

    /**
     * 💾 Get session from disk backup - UPDATED for Render
     */
    async getDiskBackup(sessionId) {
        try {
            const backupPath = path.join(this.backupDir, `${sessionId}.json`);
            const data = await fs.readFile(backupPath, 'utf8');
            const backup = JSON.parse(data);
            
            // Verify backup integrity
            if (backup.metadata?.backupHash !== this.generateDataHash(backup.encryptedData)) {
                throw new Error('Backup integrity check failed');
            }
            
            return backup;

        } catch (error) {
            console.warn(`⚠️ [SESSION-MGR] Disk backup not available: ${sessionId}`, error.message);
            return null;
        }
    }

    /**
     * 🗑️ Delete session from all storage systems - UPDATED for Render
     */
    async deleteSession(sessionId) {
        try {
            console.log(`🗑️ [SESSION-MGR] Deleting session: ${sessionId}`);

            // Remove from memory cache
            this.activeSessions.delete(sessionId);

            // Delete from MongoDB
            const deleteResult = await savageDatabase.deleteSession(sessionId);

            // Delete from disk backup
            try {
                const backupPath = path.join(this.backupDir, `${sessionId}.json`);
                await fs.unlink(backupPath);
                console.log(`✅ [SESSION-MGR] Disk backup deleted: ${sessionId}`);
            } catch (diskError) {
                console.warn(`⚠️ [SESSION-MGR] Disk backup deletion failed: ${sessionId}`, diskError.message);
            }

            console.log(`✅ [SESSION-MGR] Session deleted: ${sessionId}`);
            return deleteResult;

        } catch (error) {
            console.error(`❌ [SESSION-MGR] Delete session failed: ${sessionId}`, error);
            throw error;
        }
    }

    /**
     * 🔄 Update existing session - UPDATED for automatic mode
     */
    async updateSession(sessionId, newData, options = {}) {
        try {
            const { merge = true, connectionType = 'automatic' } = options;

            console.log(`🔄 [SESSION-MGR] Updating session: ${sessionId}`);

            // Get existing session
            const existing = await this.getSession(sessionId, { decrypt: false, updateAccess: false });
            
            if (!existing) {
                throw new Error(`Session not found: ${sessionId}`);
            }

            let updatedData;
            if (merge) {
                // Merge with existing data
                const currentDecrypted = this.decryptSessionData(JSON.parse(existing.encryptedData));
                updatedData = { ...currentDecrypted, ...newData };
            } else {
                // Replace completely
                updatedData = newData;
            }

            // Re-encrypt and save
            const encryptedData = this.encryptSessionData(updatedData);
            const encryptedString = JSON.stringify(encryptedData);

            const updateDoc = {
                ...existing,
                encryptedData: encryptedString,
                connectionType, // ✅ ADDED: Track connection type
                lastAccessed: new Date(),
                metadata: {
                    ...existing.metadata,
                    backupHash: this.generateDataHash(encryptedString),
                    lastUpdated: new Date().toISOString(),
                    automaticMode: connectionType === 'automatic'
                }
            };

            const saveResult = await savageDatabase.saveSession(updateDoc);

            // Update disk backup
            await this.saveToDiskBackup(sessionId, updateDoc);

            // Update memory cache
            if (this.activeSessions.has(sessionId)) {
                this.activeSessions.set(sessionId, {
                    ...updateDoc,
                    decryptedData: updatedData
                });
            }

            console.log(`✅ [SESSION-MGR] Session updated: ${sessionId}`);
            return {
                success: true,
                sessionId,
                connectionType,
                storage: saveResult
            };

        } catch (error) {
            console.error(`❌ [SESSION-MGR] Update session failed: ${sessionId}`, error);
            throw error;
        }
    }

    /**
     * 📊 Get session statistics - UPDATED for automatic mode
     */
    async getSessionStats() {
        try {
            const dbStats = await savageDatabase.getStats();
            const memoryStats = {
                activeSessions: this.activeSessions.size,
                sessionIds: Array.from(this.activeSessions.keys()),
                recoveryMode: this.recoveryMode,
                automaticSessions: Array.from(this.activeSessions.values()).filter(s => 
                    s.connectionType === 'automatic'
                ).length
            };

            return {
                memory: memoryStats,
                database: dbStats,
                platform: DEPLOYMENT.getCurrentPlatform().NAME,
                backupDir: this.backupDir,
                timestamp: new Date()
            };

        } catch (error) {
            console.error('❌ [SESSION-MGR] Get stats failed:', error);
            return { error: error.message };
        }
    }

    /**
     * 🧹 Cleanup expired sessions - UPDATED for Render
     */
    async cleanupExpiredSessions() {
        try {
            console.log('🧹 [SESSION-MGR] Cleaning up expired sessions...');
            
            const cutoffTime = new Date(Date.now() - DATABASE_CONFIG.BACKUP.SESSION_TTL);
            let cleanedCount = 0;

            // Get all active sessions
            const allSessions = await savageDatabase.getAllSessions();
            
            for (const session of allSessions) {
                if (new Date(session.lastAccessed) < cutoffTime) {
                    await this.deleteSession(session.sessionId);
                    cleanedCount++;
                }
            }

            // Clean memory cache
            for (const [sessionId, session] of this.activeSessions) {
                if (new Date(session.lastAccessed) < cutoffTime) {
                    this.activeSessions.delete(sessionId);
                }
            }

            console.log(`✅ [SESSION-MGR] Cleanup completed: ${cleanedCount} sessions removed`);
            return { 
                cleaned: cleanedCount, 
                total: allSessions.length,
                cutoff: cutoffTime 
            };

        } catch (error) {
            console.error('❌ [SESSION-MGR] Cleanup failed:', error);
            return { error: error.message };
        }
    }

    /**
     * 🔑 Generate data hash for integrity verification
     */
    generateDataHash(data) {
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * 🏥 Health check - UPDATED for Render
     */
    async healthCheck() {
        try {
            const dbHealth = await savageDatabase.healthCheck();
            
            // Check disk backup directory
            let diskHealth = 'healthy';
            try {
                await fs.access(this.backupDir);
                const files = await fs.readdir(this.backupDir);
                diskHealth = `healthy (${files.length} backups)`;
            } catch (error) {
                diskHealth = 'unhealthy: ' + error.message;
            }

            const sessionHealth = {
                encryption: !!this.encryptionKey,
                memoryCache: this.activeSessions.size,
                recoveryMode: this.recoveryMode,
                backupDir: this.backupDir,
                diskHealth: diskHealth,
                platform: DEPLOYMENT.getCurrentPlatform().NAME
            };

            return {
                status: 'healthy',
                database: dbHealth,
                sessionManager: sessionHealth,
                timestamp: new Date()
            };

        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date()
            };
        }
    }

    /**
     * 🔄 Restore from backup (manual recovery) - UPDATED for Render
     */
    async restoreFromBackup(sessionId, backupData) {
        try {
            console.log(`🔄 [SESSION-MGR] Manual restore for: ${sessionId}`);

            // Validate backup data
            if (!backupData.encryptedData || !backupData.sessionId) {
                throw new Error('Invalid backup data format');
            }

            // Test decryption
            try {
                const encryptedData = JSON.parse(backupData.encryptedData);
                this.decryptSessionData(encryptedData);
            } catch (decryptError) {
                throw new Error('Backup data cannot be decrypted - wrong key or corrupted');
            }

            // Save to database and disk
            const saveResult = await savageDatabase.saveSession(backupData);
            await this.saveToDiskBackup(sessionId, backupData);

            // Update memory cache
            this.activeSessions.delete(sessionId); // Clear cache

            console.log(`✅ [SESSION-MGR] Manual restore successful: ${sessionId}`);
            return {
                success: true,
                sessionId,
                storage: saveResult
            };

        } catch (error) {
            console.error(`❌ [SESSION-MGR] Manual restore failed: ${sessionId}`, error);
            throw error;
        }
    }

    /**
     * 🔍 Get all active sessions - NEW METHOD
     */
    async getAllActiveSessions() {
        try {
            const sessions = Array.from(this.activeSessions.values());
            return {
                count: sessions.length,
                sessions: sessions.map(s => ({
                    sessionId: s.sessionId,
                    phoneNumber: s.phoneNumber,
                    connectionType: s.connectionType,
                    platform: s.platform,
                    lastAccessed: s.lastAccessed,
                    isActive: s.isActive
                })),
                timestamp: new Date()
            };
        } catch (error) {
            console.error('❌ [SESSION-MGR] Get active sessions failed:', error);
            return { error: error.message };
        }
    }
}

// Create and export singleton instance
const savageSessionManager = new SavageSessionManager();

module.exports = savageSessionManager;
