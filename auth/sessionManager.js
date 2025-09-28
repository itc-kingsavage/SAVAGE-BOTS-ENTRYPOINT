/**
 * 🦅 SAVAGE BOTS SCANNER - Session Manager
 * Encrypted session management with dual backup system
 * Supports: MongoDB + Render Disk backup with auto-recovery
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
        
        this.initializeEncryption();
    }

    /**
     * 🔑 Initialize encryption system
     */
    initializeEncryption() {
        try {
            const envKey = process.env.SESSION_ENCRYPTION_KEY;
            
            if (!envKey) {
                throw new Error('SESSION_ENCRYPTION_KEY environment variable is required');
            }

            if (envKey.length !== SECURITY_CONFIG.ENCRYPTION.KEY_LENGTH * 2) {
                throw new Error(`Encryption key must be ${SECURITY_CONFIG.ENCRYPTION.KEY_LENGTH * 2} characters (${SECURITY_CONFIG.ENCRYPTION.KEY_LENGTH} bytes)`);
            }

            this.encryptionKey = Buffer.from(envKey, 'hex');
            console.log('✅ [SESSION-MGR] Encryption system initialized');

        } catch (error) {
            console.error('❌ [SESSION-MGR] Encryption initialization failed:', error.message);
            throw error;
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
     * 💾 Create new WhatsApp session with dual backup
     */
    async createSession(whatsappData, options = {}) {
        try {
            const {
                phoneNumber,
                platform = DEPLOYMENT.getCurrentPlatform().NAME,
                botName = 'SCANNER',
                metadata = {}
            } = options;

            // Generate BMW-style session ID
            const sessionId = generateSessionId();
            
            console.log(`🦅 [SESSION-MGR] Creating new session: ${sessionId}`);
            console.log(`📱 [SESSION-MGR] Phone: ${phoneNumber}, Bot: ${botName}, Platform: ${platform}`);

            // Encrypt the WhatsApp session data
            const encryptedData = this.encryptSessionData(whatsappData);
            const encryptedString = JSON.stringify(encryptedData);

            // Prepare session document
            const sessionDoc = {
                sessionId,
                phoneNumber: phoneNumber || 'unknown',
                encryptedData: encryptedString,
                botName,
                platform,
                sessionType: 'primary',
                isActive: true,
                metadata: {
                    ...metadata,
                    version: '1.0.0',
                    createdBy: 'SAVAGE-BOTS-SCANNER',
                    encryption: SECURITY_CONFIG.ENCRYPTION.ALGORITHM,
                    backupHash: this.generateDataHash(encryptedString)
                }
            };

            // Save to both storage systems
            const saveResult = await savageDatabase.saveSession(sessionDoc);

            if (saveResult.success) {
                // Cache in memory for fast access
                this.activeSessions.set(sessionId, {
                    ...sessionDoc,
                    decryptedData: whatsappData, // Keep decrypted version in memory
                    lastAccessed: new Date()
                });

                console.log(`✅ [SESSION-MGR] Session created successfully: ${sessionId}`);
                console.log(`💾 [SESSION-MGR] Storage: MongoDB: ${saveResult.mongo}, Disk: ${saveResult.disk}`);

                return {
                    success: true,
                    sessionId,
                    phoneNumber,
                    botName,
                    platform,
                    storage: {
                        mongo: saveResult.mongo,
                        disk: saveResult.disk
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
     * 🔄 Get session with auto-recovery
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

            // Get from database with auto-recovery
            const sessionDoc = await savageDatabase.getSession(sessionId);

            if (!sessionDoc) {
                console.log(`❌ [SESSION-MGR] Session not found: ${sessionId}`);
                return null;
            }

            // Update access time
            if (updateAccess) {
                await savageDatabase.saveSession({
                    ...sessionDoc,
                    lastAccessed: new Date()
                });
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
     * 🛡️ Attempt session recovery from backups
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
     * 💾 Get session from disk backup
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
     * 🗑️ Delete session from all storage systems
     */
    async deleteSession(sessionId) {
        try {
            console.log(`🗑️ [SESSION-MGR] Deleting session: ${sessionId}`);

            // Remove from memory cache
            this.activeSessions.delete(sessionId);

            // Delete from storage systems
            const deleteResult = await savageDatabase.deleteSession(sessionId);

            console.log(`✅ [SESSION-MGR] Session deleted: ${sessionId}`);
            return deleteResult;

        } catch (error) {
            console.error(`❌ [SESSION-MGR] Delete session failed: ${sessionId}`, error);
            throw error;
        }
    }

    /**
     * 🔄 Update existing session
     */
    async updateSession(sessionId, newData, options = {}) {
        try {
            const { merge = true } = options;

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
                lastAccessed: new Date(),
                metadata: {
                    ...existing.metadata,
                    backupHash: this.generateDataHash(encryptedString),
                    lastUpdated: new Date().toISOString()
                }
            };

            const saveResult = await savageDatabase.saveSession(updateDoc);

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
                storage: saveResult
            };

        } catch (error) {
            console.error(`❌ [SESSION-MGR] Update session failed: ${sessionId}`, error);
            throw error;
        }
    }

    /**
     * 📊 Get session statistics
     */
    async getSessionStats() {
        try {
            const dbStats = await savageDatabase.getStats();
            const memoryStats = {
                activeSessions: this.activeSessions.size,
                sessionIds: Array.from(this.activeSessions.keys()),
                recoveryMode: this.recoveryMode
            };

            return {
                memory: memoryStats,
                database: dbStats,
                timestamp: new Date()
            };

        } catch (error) {
            console.error('❌ [SESSION-MGR] Get stats failed:', error);
            return { error: error.message };
        }
    }

    /**
     * 🧹 Cleanup expired sessions
     */
    async cleanupExpiredSessions() {
        try {
            console.log('🧹 [SESSION-MGR] Cleaning up expired sessions...');
            
            // Get all sessions from database
            const dbStats = await savageDatabase.getStats();
            
            // In a real implementation, you would:
            // 1. Query for sessions older than TTL
            // 2. Delete them from all storage systems
            // 3. Remove from memory cache
            
            console.log('✅ [SESSION-MGR] Cleanup completed');
            return { cleaned: 0, total: dbStats.totalSessions || 0 }; // Placeholder

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
     * 🏥 Health check
     */
    async healthCheck() {
        try {
            const dbHealth = await savageDatabase.healthCheck();
            const sessionHealth = {
                encryption: !!this.encryptionKey,
                memoryCache: this.activeSessions.size,
                recoveryMode: this.recoveryMode,
                backupDir: this.backupDir
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
     * 🔄 Restore from backup (manual recovery)
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

            // Save to database
            const saveResult = await savageDatabase.saveSession(backupData);

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
}

// Create and export singleton instance
const savageSessionManager = new SavageSessionManager();

module.exports = savageSessionManager;
