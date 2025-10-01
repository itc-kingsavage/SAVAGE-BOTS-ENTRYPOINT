/**
 * 🦅 SAVAGE BOTS SCANNER - Advanced Encryption System
 * AES-256-GCM encryption with key derivation and secure session management
 * Military-grade encryption for WhatsApp session protection
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class SavageEncryption {
    constructor() {
        this.algorithm = 'aes-256-gcm';
        this.keyLength = 32; // 256 bits
        this.ivLength = 16;  // 128 bits
        this.authTagLength = 16;
        this.saltLength = 32;
        this.iterations = 100000;
        
        this.masterKey = null;
        this.derivedKeys = new Map();
        this.keyVersion = 'v1.0.0';
        
        this.initialize();
    }

    /**
     * 🎯 Initialize encryption system
     */
    initialize() {
        try {
            this.loadMasterKey();
            console.log('✅ [ENCRYPTION] Savage Encryption System Initialized');
            console.log(`🔐 [ENCRYPTION] Algorithm: ${this.algorithm}`);
            console.log(`🔑 [ENCRYPTION] Key Version: ${this.keyVersion}`);
        } catch (error) {
            console.error('❌ [ENCRYPTION] Initialization failed:', error);
            throw error;
        }
    }

    /**
     * 🔑 Load or generate master encryption key
     */
    loadMasterKey() {
        const envKey = process.env.SESSION_ENCRYPTION_KEY;
        
        if (!envKey) {
            throw new Error('SESSION_ENCRYPTION_KEY environment variable is required');
        }

        if (envKey.length !== this.keyLength * 2) {
            throw new Error(`Encryption key must be ${this.keyLength * 2} characters (${this.keyLength} bytes)`);
        }

        this.masterKey = Buffer.from(envKey, 'hex');
        console.log('🔑 [ENCRYPTION] Master key loaded from environment');
    }

    /**
     * 🔄 Derive key for specific purpose
     */
    deriveKey(purpose, salt = null) {
        const cacheKey = `${purpose}:${salt}`;
        
        if (this.derivedKeys.has(cacheKey)) {
            return this.derivedKeys.get(cacheKey);
        }

        const derivedSalt = salt || crypto.randomBytes(this.saltLength);
        const key = crypto.pbkdf2Sync(
            this.masterKey,
            derivedSalt,
            this.iterations,
            this.keyLength,
            'sha256'
        );

        this.derivedKeys.set(cacheKey, {
            key,
            salt: derivedSalt,
            purpose,
            derivedAt: new Date()
        });

        console.log(`🔑 [ENCRYPTION] Key derived for: ${purpose}`);
        return { key, salt: derivedSalt };
    }

    /**
     * 🔒 Encrypt data with AES-256-GCM
     */
    encrypt(data, purpose = 'session', additionalData = 'SAVAGE-BOTS') {
        try {
            if (!data) {
                throw new Error('No data provided for encryption');
            }

            const { key, salt } = this.deriveKey(purpose);
            const iv = crypto.randomBytes(this.ivLength);
            
            const cipher = crypto.createCipheriv(this.algorithm, key, iv);
            
            // Add additional authenticated data
            if (additionalData) {
                cipher.setAAD(Buffer.from(additionalData));
            }

            let encrypted = cipher.update(typeof data === 'string' ? data : JSON.stringify(data), 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            const authTag = cipher.getAuthTag();

            const result = {
                version: this.keyVersion,
                algorithm: this.algorithm,
                purpose: purpose,
                iv: iv.toString('hex'),
                salt: salt.toString('hex'),
                data: encrypted,
                authTag: authTag.toString('hex'),
                additionalData: additionalData,
                timestamp: new Date().toISOString(),
                size: Buffer.byteLength(encrypted, 'hex')
            };

            // Generate integrity hash
            result.integrityHash = this.generateIntegrityHash(result);

            console.log(`🔒 [ENCRYPTION] Data encrypted (${purpose}): ${result.size} bytes`);
            return result;

        } catch (error) {
            console.error('❌ [ENCRYPTION] Encryption failed:', error);
            throw new Error(`Encryption failed: ${error.message}`);
        }
    }

    /**
     * 🔓 Decrypt data with AES-256-GCM
     */
    decrypt(encryptedData, purpose = 'session') {
        try {
            if (!encryptedData || typeof encryptedData !== 'object') {
                throw new Error('Invalid encrypted data format');
            }

            // Validate required fields
            const requiredFields = ['version', 'algorithm', 'iv', 'salt', 'data', 'authTag'];
            for (const field of requiredFields) {
                if (!encryptedData[field]) {
                    throw new Error(`Missing required field: ${field}`);
                }
            }

            // Verify integrity hash
            if (!this.verifyIntegrityHash(encryptedData)) {
                throw new Error('Data integrity check failed - possible tampering detected');
            }

            const { key } = this.deriveKey(purpose, Buffer.from(encryptedData.salt, 'hex'));
            const iv = Buffer.from(encryptedData.iv, 'hex');
            const authTag = Buffer.from(encryptedData.authTag, 'hex');

            const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
            
            // Set additional authenticated data
            if (encryptedData.additionalData) {
                decipher.setAAD(Buffer.from(encryptedData.additionalData));
            }
            
            decipher.setAuthTag(authTag);

            let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            // Try to parse as JSON, otherwise return as string
            try {
                return JSON.parse(decrypted);
            } catch {
                return decrypted;
            }

        } catch (error) {
            console.error('❌ [ENCRYPTION] Decryption failed:', error);
            
            // Security: Don't reveal specific decryption errors
            if (error.message.includes('bad decrypt') || error.message.includes('auth tag')) {
                throw new Error('Decryption failed - invalid key or corrupted data');
            }
            
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }

    /**
     * 🔍 Generate integrity hash for encrypted data
     */
    generateIntegrityHash(encryptedData) {
        const dataToHash = [
            encryptedData.version,
            encryptedData.algorithm,
            encryptedData.iv,
            encryptedData.salt,
            encryptedData.data,
            encryptedData.authTag,
            encryptedData.timestamp
        ].join('|');

        return crypto.createHash('sha256').update(dataToHash).digest('hex');
    }

    /**
     * 🔍 Verify integrity hash
     */
    verifyIntegrityHash(encryptedData) {
        if (!encryptedData.integrityHash) {
            console.warn('⚠️ [ENCRYPTION] No integrity hash found');
            return false;
        }

        const calculatedHash = this.generateIntegrityHash(encryptedData);
        return calculatedHash === encryptedData.integrityHash;
    }

    /**
     * 🎫 Encrypt session data (specialized for WhatsApp sessions)
     */
    encryptSession(sessionData, phoneNumber = 'unknown', botName = 'SCANNER') {
        try {
            const sessionInfo = {
                sessionData,
                metadata: {
                    phoneNumber,
                    botName,
                    encryptedAt: new Date().toISOString(),
                    version: this.keyVersion,
                    userAgent: 'SAVAGE-BOTS-SCANNER'
                }
            };

            const encrypted = this.encrypt(sessionInfo, 'whatsapp_session', `SESSION:${phoneNumber}`);
            
            // Add session-specific metadata
            encrypted.sessionId = this.generateSessionId();
            encrypted.phoneNumber = phoneNumber;
            encrypted.botName = botName;
            encrypted.encryptedAt = new Date().toISOString();

            console.log(`🔒 [ENCRYPTION] Session encrypted for: ${phoneNumber} (${botName})`);
            return encrypted;

        } catch (error) {
            console.error('❌ [ENCRYPTION] Session encryption failed:', error);
            throw error;
        }
    }

    /**
     * 🎫 Decrypt session data
     */
    decryptSession(encryptedSession) {
        try {
            const decrypted = this.decrypt(encryptedSession, 'whatsapp_session');
            
            // Validate session structure
            if (!decrypted.sessionData || !decrypted.metadata) {
                throw new Error('Invalid session data structure');
            }

            console.log(`🔓 [ENCRYPTION] Session decrypted for: ${decrypted.metadata.phoneNumber}`);
            return decrypted.sessionData;

        } catch (error) {
            console.error('❌ [ENCRYPTION] Session decryption failed:', error);
            throw error;
        }
    }

    /**
     * 🆔 Generate unique session ID
     */
    generateSessionId() {
        const timestamp = Date.now().toString(36);
        const random = crypto.randomBytes(12).toString('hex');
        return `SAVAGE-${timestamp}-${random}`.toUpperCase();
    }

    /**
     * 💾 Encrypt and save to file
     */
    async encryptToFile(data, filePath, purpose = 'file_storage') {
        try {
            const encrypted = this.encrypt(data, purpose);
            const fileData = JSON.stringify(encrypted, null, 2);
            
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, fileData, 'utf8');
            
            console.log(`💾 [ENCRYPTION] Data encrypted and saved to: ${filePath}`);
            return encrypted;

        } catch (error) {
            console.error('❌ [ENCRYPTION] File encryption failed:', error);
            throw error;
        }
    }

    /**
     * 📁 Decrypt from file
     */
    async decryptFromFile(filePath, purpose = 'file_storage') {
        try {
            const fileData = await fs.readFile(filePath, 'utf8');
            const encrypted = JSON.parse(fileData);
            
            const decrypted = this.decrypt(encrypted, purpose);
            
            console.log(`📁 [ENCRYPTION] Data decrypted from: ${filePath}`);
            return decrypted;

        } catch (error) {
            console.error('❌ [ENCRYPTION] File decryption failed:', error);
            throw error;
        }
    }

    /**
     * 🔄 Rotate encryption keys
     */
    async rotateKeys(newMasterKey = null) {
        try {
            console.log('🔄 [ENCRYPTION] Starting key rotation...');
            
            const oldKey = this.masterKey;
            
            if (newMasterKey) {
                if (newMasterKey.length !== this.keyLength * 2) {
                    throw new Error(`New key must be ${this.keyLength * 2} characters`);
                }
                this.masterKey = Buffer.from(newMasterKey, 'hex');
            } else {
                // Generate new random key
                this.masterKey = crypto.randomBytes(this.keyLength);
            }
            
            // Clear derived keys cache
            this.derivedKeys.clear();
            
            // Update key version
            this.keyVersion = `v1.0.${Date.now()}`;
            
            console.log('✅ [ENCRYPTION] Key rotation completed');
            console.log(`🔑 [ENCRYPTION] New key version: ${this.keyVersion}`);
            
            return {
                success: true,
                keyVersion: this.keyVersion,
                timestamp: new Date()
            };

        } catch (error) {
            console.error('❌ [ENCRYPTION] Key rotation failed:', error);
            
            // Revert to old key on failure
            if (oldKey) {
                this.masterKey = oldKey;
            }
            
            throw error;
        }
    }

    /**
     * 📊 Get encryption statistics
     */
    getStats() {
        return {
            algorithm: this.algorithm,
            keyVersion: this.keyVersion,
            keyLength: this.keyLength,
            ivLength: this.ivLength,
            derivedKeysCount: this.derivedKeys.size,
            keyPurposes: Array.from(this.derivedKeys.keys()),
            masterKeySet: !!this.masterKey,
            timestamp: new Date()
        };
    }

    /**
     * 🏥 Health check
     */
    healthCheck() {
        try {
            // Test encryption/decryption cycle
            const testData = { test: 'savage_encryption_health_check', timestamp: Date.now() };
            const encrypted = this.encrypt(testData, 'health_check');
            const decrypted = this.decrypt(encrypted, 'health_check');
            
            const healthy = JSON.stringify(decrypted) === JSON.stringify(testData);
            
            return {
                status: healthy ? 'healthy' : 'unhealthy',
                algorithm: this.algorithm,
                keyVersion: this.keyVersion,
                testPassed: healthy,
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
     * 🔐 Generate secure random bytes
     */
    generateRandomBytes(length) {
        return crypto.randomBytes(length);
    }

    /**
     * 🎯 Generate cryptographically secure random string
     */
    generateRandomString(length, charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
        let result = '';
        const charsetLength = charset.length;
        
        for (let i = 0; i < length; i++) {
            result += charset.charAt(Math.floor(crypto.randomBytes(1)[0] / 255 * charsetLength));
        }
        
        return result;
    }

    /**
     * 🔄 Create key derivation function
     */
    createKDF(salt = null) {
        const actualSalt = salt || crypto.randomBytes(this.saltLength);
        
        return (password, keyLength = this.keyLength) => {
            return crypto.pbkdf2Sync(
                password,
                actualSalt,
                this.iterations,
                keyLength,
                'sha256'
            );
        };
    }

    /**
     * 🧹 Cleanup expired derived keys
     */
    cleanupExpiredKeys(maxAge = 3600000) { // 1 hour
        const now = Date.now();
        let cleaned = 0;
        
        for (const [key, keyData] of this.derivedKeys.entries()) {
            if (now - keyData.derivedAt.getTime() > maxAge) {
                this.derivedKeys.delete(key);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(`🧹 [ENCRYPTION] Cleaned ${cleaned} expired derived keys`);
        }
        
        return { cleaned, totalRemaining: this.derivedKeys.size };
    }

    /**
     * 🚫 Securely wipe sensitive data from memory
     */
    secureWipe(buffer) {
        if (buffer && buffer.fill) {
            buffer.fill(0);
        }
        return null;
    }

    /**
     * 🔒 Create encrypted backup of master key (for emergency recovery)
     */
    async createKeyBackup(backupPassword, backupPath) {
        try {
            if (!backupPassword || backupPassword.length < 12) {
                throw new Error('Backup password must be at least 12 characters');
            }

            const backupData = {
                masterKey: this.masterKey.toString('hex'),
                keyVersion: this.keyVersion,
                algorithm: this.algorithm,
                backedUpAt: new Date().toISOString(),
                system: 'SAVAGE-BOTS-SCANNER'
            };

            // Encrypt backup with backup password
            const backupKey = crypto.pbkdf2Sync(
                backupPassword,
                'SAVAGE-BACKUP-SALT',
                100000,
                this.keyLength,
                'sha256'
            );

            const iv = crypto.randomBytes(this.ivLength);
            const cipher = crypto.createCipheriv(this.algorithm, backupKey, iv);
            
            let encrypted = cipher.update(JSON.stringify(backupData), 'utf8', 'hex');
            encrypted += cipher.final('hex');
            const authTag = cipher.getAuthTag();

            const backup = {
                encrypted: encrypted,
                iv: iv.toString('hex'),
                authTag: authTag.toString('hex'),
                algorithm: this.algorithm,
                timestamp: new Date().toISOString()
            };

            await fs.writeFile(backupPath, JSON.stringify(backup, null, 2));
            
            console.log(`💾 [ENCRYPTION] Master key backup created: ${backupPath}`);
            return { success: true, backupPath };

        } catch (error) {
            console.error('❌ [ENCRYPTION] Key backup failed:', error);
            throw error;
        }
    }
}

// Create and export singleton instance
const savageEncryption = new SavageEncryption();

module.exports = savageEncryption;

// 🚀 Quick utility functions
module.exports.encryptData = (data, purpose) => savageEncryption.encrypt(data, purpose);
module.exports.decryptData = (encryptedData, purpose) => savageEncryption.decrypt(encryptedData, purpose);
module.exports.generateSessionId = () => savageEncryption.generateSessionId();
module.exports.healthCheck = () => savageEncryption.healthCheck();

// 📝 Example usage
if (require.main === module) {
    // Test the encryption system
    const test = async () => {
        try {
            console.log('🧪 Testing Savage Encryption System...');
            
            // Set test key (in production, use environment variable)
            process.env.SESSION_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
            
            const stats = savageEncryption.getStats();
            console.log('📊 Encryption Stats:', stats);
            
            // Test encryption/decryption
            const testData = {
                message: 'Hello Savage Bots!',
                timestamp: new Date(),
                secret: 'TopSecret123'
            };
            
            console.log('🔒 Encrypting test data...');
            const encrypted = savageEncryption.encrypt(testData, 'test');
            console.log('✅ Encrypted:', encrypted.version);
            
            console.log('🔓 Decrypting test data...');
            const decrypted = savageEncryption.decrypt(encrypted, 'test');
            console.log('✅ Decrypted matches original:', JSON.stringify(decrypted) === JSON.stringify(testData));
            
            // Test health check
            const health = savageEncryption.healthCheck();
            console.log('🏥 Health Check:', health);
            
        } catch (error) {
            console.error('❌ Test failed:', error);
        }
    };
    
    test();
}
