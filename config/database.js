/**
 * 🦅 SAVAGE BOTS SCANNER - Database Configuration
 * MongoDB Atlas connection with dual session backup system
 * Supports: Render + Heroku deployment
 */

const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class SavageDatabase {
    constructor() {
        this.isConnected = false;
        this.connectionAttempts = 0;
        this.maxRetries = 5;
        this.backupDir = '/tmp/savage-session-backups'; // Render persistent storage
        
        // Session schema for MongoDB
        this.sessionSchema = new mongoose.Schema({
            sessionId: { 
                type: String, 
                unique: true,
                index: true,
                required: true 
            },
            phoneNumber: {
                type: String,
                required: true,
                index: true
            },
            encryptedData: {
                type: String,
                required: true
            },
            botName: {
                type: String,
                enum: ['SAVAGE-X', 'DE-UKNOWN-BOT', 'QUEEN-RIXIE', 'SCANNER'],
                default: 'SCANNER'
            },
            platform: {
                type: String,
                enum: ['render', 'heroku', 'local'],
                default: 'render'
            },
            sessionType: {
                type: String,
                enum: ['primary', 'backup', 'restored'],
                default: 'primary'
            },
            createdAt: {
                type: Date,
                default: Date.now,
                expires: 86400 * 30 // Auto-delete after 30 days
            },
            lastAccessed: {
                type: Date,
                default: Date.now
            },
            isActive: {
                type: Boolean,
                default: true
            },
            metadata: {
                version: String,
                userAgent: String,
                device: String,
                backupHash: String
            }
        });

        this.Session = mongoose.model('SavageSession', this.sessionSchema);
    }

    /**
     * 🔌 Connect to MongoDB with retry logic
     */
    async connect() {
        try {
            const mongoURI = process.env.MONGODB_URI;
            
            if (!mongoURI) {
                throw new Error('❌ MONGODB_URI not found in environment variables');
            }

            console.log('🦅 [SAVAGE-DB] Connecting to MongoDB Atlas...');
            
            const connectionOptions = {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                retryWrites: true,
                w: 'majority',
                serverSelectionTimeoutMS: 30000,
                socketTimeoutMS: 45000,
                maxPoolSize: 10,
                minPoolSize: 2,
                maxIdleTimeMS: 30000
            };

            await mongoose.connect(mongoURI, connectionOptions);
            
            this.isConnected = true;
            this.connectionAttempts = 0;
            
            console.log('✅ [SAVAGE-DB] MongoDB Atlas connected successfully');
            console.log(`📊 [SAVAGE-DB] Database: ${mongoose.connection.db.databaseName}`);
            console.log(`🖥️ [SAVAGE-DB] Platform: ${process.platform}`);
            console.log(`🌐 [SAVAGE-DB] Environment: ${process.env.NODE_ENV || 'development'}`);

            // Initialize backup directory
            await this.initializeBackupDir();

            return true;

        } catch (error) {
            this.connectionAttempts++;
            console.error(`❌ [SAVAGE-DB] Connection attempt ${this.connectionAttempts} failed:`, error.message);
            
            if (this.connectionAttempts < this.maxRetries) {
                console.log(`🔄 [SAVAGE-DB] Retrying in 5 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
                return this.connect();
            } else {
                console.error('💥 [SAVAGE-DB] Maximum connection attempts reached');
                throw error;
            }
        }
    }

    /**
     * 📁 Initialize backup directory on Render disk
     */
    async initializeBackupDir() {
        try {
            await fs.mkdir(this.backupDir, { recursive: true });
            console.log(`✅ [SAVAGE-DB] Backup directory initialized: ${this.backupDir}`);
            
            // Set proper permissions
            await fs.chmod(this.backupDir, 0o755);
            
        } catch (error) {
            console.warn('⚠️ [SAVAGE-DB] Could not initialize backup directory:', error.message);
            // Continue without backup directory
        }
    }

    /**
     * 💾 Save session with dual backup (MongoDB + Render Disk)
     */
    async saveSession(sessionData) {
        try {
            const { sessionId, phoneNumber, encryptedData, botName = 'SCANNER', platform = 'render' } = sessionData;
            
            if (!sessionId || !encryptedData) {
                throw new Error('Missing required session data');
            }

            const sessionDoc = {
                sessionId,
                phoneNumber,
                encryptedData,
                botName,
                platform,
                lastAccessed: new Date(),
                metadata: {
                    version: '1.0.0',
                    userAgent: 'SAVAGE-BOTS-SCANNER',
                    device: 'Baileys-WhatsApp',
                    backupHash: this.generateBackupHash(encryptedData)
                }
            };

            // Save to MongoDB (Primary)
            let mongoResult = null;
            if (this.isConnected) {
                mongoResult = await this.Session.findOneAndUpdate(
                    { sessionId },
                    sessionDoc,
                    { upsert: true, new: true }
                );
                console.log(`✅ [SAVAGE-DB] Session saved to MongoDB: ${sessionId}`);
            }

            // Save to Render Disk (Backup)
            let diskResult = null;
            try {
                diskResult = await this.saveToDisk(sessionId, sessionDoc);
                console.log(`✅ [SAVAGE-DB] Session backed up to disk: ${sessionId}`);
            } catch (diskError) {
                console.warn('⚠️ [SAVAGE-DB] Disk backup failed:', diskError.message);
            }

            return {
                success: true,
                mongo: mongoResult !== null,
                disk: diskResult !== null,
                sessionId,
                timestamp: new Date()
            };

        } catch (error) {
            console.error('❌ [SAVAGE-DB] Save session failed:', error);
            throw error;
        }
    }

    /**
     * 💾 Save session to Render persistent disk
     */
    async saveToDisk(sessionId, sessionData) {
        try {
            const backupPath = path.join(this.backupDir, `${sessionId}.json`);
            const backupData = {
                ...sessionData,
                backupTimestamp: new Date(),
                backupType: 'disk_backup'
            };
            
            await fs.writeFile(backupPath, JSON.stringify(backupData, null, 2));
            return true;
        } catch (error) {
            throw new Error(`Disk backup failed: ${error.message}`);
        }
    }

    /**
     * 🔄 Get session with auto-recovery
     */
    async getSession(sessionId) {
        try {
            let session = null;

            // Try MongoDB first
            if (this.isConnected) {
                session = await this.Session.findOne({ sessionId, isActive: true });
                if (session) {
                    console.log(`✅ [SAVAGE-DB] Session loaded from MongoDB: ${sessionId}`);
                    return session;
                }
            }

            // Try disk backup if MongoDB fails
            try {
                session = await this.getFromDisk(sessionId);
                if (session) {
                    console.log(`🔄 [SAVAGE-DB] Session restored from disk backup: ${sessionId}`);
                    
                    // Auto-recover to MongoDB
                    if (this.isConnected) {
                        await this.saveSession(session);
                        console.log(`♻️ [SAVAGE-DB] Session auto-recovered to MongoDB`);
                    }
                    
                    return session;
                }
            } catch (diskError) {
                console.warn('⚠️ [SAVAGE-DB] Disk restore failed:', diskError.message);
            }

            console.log(`❌ [SAVAGE-DB] Session not found: ${sessionId}`);
            return null;

        } catch (error) {
            console.error('❌ [SAVAGE-DB] Get session failed:', error);
            return null;
        }
    }

    /**
     * 🔄 Restore session from disk backup
     */
    async getFromDisk(sessionId) {
        try {
            const backupPath = path.join(this.backupDir, `${sessionId}.json`);
            const data = await fs.readFile(backupPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            throw new Error(`Disk restore failed: ${error.message}`);
        }
    }

    /**
     * 🗑️ Delete session from both storage locations
     */
    async deleteSession(sessionId) {
        try {
            let results = { mongo: false, disk: false };

            // Delete from MongoDB
            if (this.isConnected) {
                await this.Session.deleteOne({ sessionId });
                results.mongo = true;
            }

            // Delete from disk
            try {
                const backupPath = path.join(this.backupDir, `${sessionId}.json`);
                await fs.unlink(backupPath);
                results.disk = true;
            } catch (diskError) {
                console.warn('⚠️ [SAVAGE-DB] Disk delete failed:', diskError.message);
            }

            console.log(`🗑️ [SAVAGE-DB] Session deleted: ${sessionId}`);
            return results;

        } catch (error) {
            console.error('❌ [SAVAGE-DB] Delete session failed:', error);
            throw error;
        }
    }

    /**
     * 📊 Get database statistics
     */
    async getStats() {
        try {
            if (!this.isConnected) {
                return { error: 'Database not connected' };
            }

            const totalSessions = await this.Session.countDocuments();
            const activeSessions = await this.Session.countDocuments({ isActive: true });
            const byBot = await this.Session.aggregate([
                { $group: { _id: '$botName', count: { $sum: 1 } } }
            ]);
            const byPlatform = await this.Session.aggregate([
                { $group: { _id: '$platform', count: { $sum: 1 } } }
            ]);

            // Get disk backup stats
            let diskStats = { total: 0, size: 0 };
            try {
                const files = await fs.readdir(this.backupDir);
                diskStats.total = files.filter(f => f.endsWith('.json')).length;
                
                for (const file of files) {
                    if (file.endsWith('.json')) {
                        const stats = await fs.stat(path.join(this.backupDir, file));
                        diskStats.size += stats.size;
                    }
                }
                diskStats.size = (diskStats.size / 1024 / 1024).toFixed(2) + ' MB';
            } catch (error) {
                diskStats.error = error.message;
            }

            return {
                connected: this.isConnected,
                database: mongoose.connection.db.databaseName,
                totalSessions,
                activeSessions,
                byBot,
                byPlatform,
                diskBackups: diskStats,
                timestamp: new Date()
            };

        } catch (error) {
            console.error('❌ [SAVAGE-DB] Get stats failed:', error);
            return { error: error.message };
        }
    }

    /**
     * 🔧 Health check
     */
    async healthCheck() {
        try {
            if (!this.isConnected) {
                return { status: 'disconnected', healthy: false };
            }

            // Test database connection
            await this.Session.findOne().limit(1);
            
            // Test disk access
            let diskHealthy = false;
            try {
                await fs.access(this.backupDir);
                diskHealthy = true;
            } catch (error) {
                diskHealthy = false;
            }

            return {
                status: 'connected',
                healthy: true,
                mongo: true,
                disk: diskHealthy,
                timestamp: new Date()
            };

        } catch (error) {
            return {
                status: 'error',
                healthy: false,
                error: error.message,
                timestamp: new Date()
            };
        }
    }

    /**
     * 🔑 Generate backup hash for verification
     */
    generateBackupHash(data) {
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * 🔌 Disconnect from database
     */
    async disconnect() {
        try {
            if (this.isConnected) {
                await mongoose.connection.close();
                this.isConnected = false;
                console.log('✅ [SAVAGE-DB] MongoDB disconnected');
            }
        } catch (error) {
            console.error('❌ [SAVAGE-DB] Disconnect failed:', error);
        }
    }
}

// Create and export singleton instance
const savageDatabase = new SavageDatabase();

module.exports = savageDatabase;
