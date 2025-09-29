/**
 * 🦅 DE-UKNOWN-BOT Connector
 * Mystery bot with hidden capabilities and advanced features
 * Connects to SAVAGE BOTS SCANNER via WebSocket
 */

const WebSocket = require('ws');
const { EventEmitter } = require('events');
const crypto = require('crypto');

class DEUnknownBot extends EventEmitter {
    constructor(config) {
        super();
        
        this.config = {
            scannerUrl: config.scannerUrl || 'ws://localhost:3000/savage-ws',
            sessionId: config.sessionId,
            botName: 'DE-UKNOWN-BOT',
            reconnect: true,
            maxReconnectAttempts: 10,
            reconnectDelay: 5000,
            ...config
        };

        this.ws = null;
        this.isConnected = false;
        this.isAuthenticated = false;
        this.reconnectAttempts = 0;
        this.messageQueue = [];
        this.messageHistory = [];
        this.maxHistorySize = 1000;

        // Bot state
        this.state = {
            status: 'offline',
            lastSeen: null,
            messageCount: 0,
            errorCount: 0,
            features: {
                mysteryMode: true,
                stealthMode: false,
                autoResponse: true,
                advancedAI: true,
                encryption: true
            }
        };

        // Command registry
        this.commands = new Map([
            ['!deunknown', this.handleDeUnknownCommand.bind(this)],
            ['!mystery', this.handleMysteryCommand.bind(this)],
            ['!secret', this.handleSecretCommand.bind(this)],
            ['!stealth', this.handleStealthCommand.bind(this)],
            ['!reveal', this.handleRevealCommand.bind(this)],
            ['!help', this.handleHelpCommand.bind(this)],
            ['!status', this.handleStatusCommand.bind(this)]
        ]);

        this.init();
    }

    /**
     * 🎯 Initialize DE-UKNOWN-BOT
     */
    init() {
        console.log(`🌌 [DE-UKNOWN] Initializing ${this.config.botName}...`);
        console.log(`🔗 [DE-UKNOWN] Scanner: ${this.config.scannerUrl}`);
        console.log(`🔑 [DE-UKNOWN] Session: ${this.config.sessionId}`);

        this.validateConfig();
        this.connectToScanner();
        this.setupHealthChecks();

        this.emit('initialized', {
            botName: this.config.botName,
            sessionId: this.config.sessionId,
            timestamp: new Date()
        });
    }

    /**
     * 🔧 Validate configuration
     */
    validateConfig() {
        if (!this.config.sessionId) {
            throw new Error('Session ID is required for DE-UKNOWN-BOT');
        }

        if (!this.config.scannerUrl) {
            throw new Error('Scanner URL is required for DE-UKNOWN-BOT');
        }

        // Validate session ID format (BMW-style)
        const sessionPattern = /^SAVAGE-XMD-BOT-SESSION-[A-Z0-9]{12}-\d{10}-[A-Z0-9]{12}$/;
        if (!sessionPattern.test(this.config.sessionId)) {
            throw new Error('Invalid session ID format for DE-UKNOWN-BOT');
        }

        console.log('✅ [DE-UKNOWN] Configuration validated');
    }

    /**
     * 🔌 Connect to SAVAGE BOTS SCANNER
     */
    connectToScanner() {
        try {
            console.log(`🔗 [DE-UKNOWN] Connecting to scanner...`);

            this.ws = new WebSocket(this.config.scannerUrl, {
                headers: {
                    'User-Agent': 'DE-UKNOWN-BOT/1.0.0',
                    'X-Bot-Name': this.config.botName,
                    'X-Session-ID': this.config.sessionId
                }
            });

            this.setupWebSocketEvents();

        } catch (error) {
            console.error(`❌ [DE-UKNOWN] Connection failed:`, error);
            this.handleConnectionError(error);
        }
    }

    /**
     * 🎛️ Setup WebSocket event handlers
     */
    setupWebSocketEvents() {
        this.ws.on('open', () => {
            console.log('✅ [DE-UKNOWN] WebSocket connected to scanner');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.updateStatus('connecting');

            // Send authentication
            this.authenticate();
        });

        this.ws.on('message', (data) => {
            this.handleMessage(data);
        });

        this.ws.on('close', (code, reason) => {
            console.log(`🔌 [DE-UKNOWN] WebSocket closed: ${code} - ${reason}`);
            this.isConnected = false;
            this.isAuthenticated = false;
            this.updateStatus('offline');

            this.handleReconnection();
        });

        this.ws.on('error', (error) => {
            console.error(`❌ [DE-UKNOWN] WebSocket error:`, error);
            this.handleConnectionError(error);
        });
    }

    /**
     * 🔐 Authenticate with scanner
     */
    authenticate() {
        const authMessage = {
            type: 'bot_auth',
            botName: this.config.botName,
            sessionId: this.config.sessionId,
            capabilities: this.state.features,
            timestamp: new Date().toISOString(),
            authHash: this.generateAuthHash()
        };

        this.sendMessage(authMessage);
        console.log('🔐 [DE-UKNOWN] Authentication sent');
    }

    /**
     * 🔑 Generate authentication hash
     */
    generateAuthHash() {
        const data = `${this.config.botName}:${this.config.sessionId}:${Date.now()}`;
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * 📨 Handle incoming messages
     */
    handleMessage(data) {
        try {
            const message = JSON.parse(data);
            this.messageHistory.push({
                ...message,
                receivedAt: new Date(),
                direction: 'incoming'
            });

            // Keep history manageable
            if (this.messageHistory.length > this.maxHistorySize) {
                this.messageHistory = this.messageHistory.slice(-this.maxHistorySize);
            }

            this.processMessage(message);

        } catch (error) {
            console.error(`❌ [DE-UKNOWN] Message processing error:`, error);
            this.state.errorCount++;
            this.emit('error', { error, type: 'message_processing' });
        }
    }

    /**
     * 🔄 Process different message types
     */
    processMessage(message) {
        switch (message.type) {
            case 'auth_result':
                this.handleAuthResult(message);
                break;

            case 'whatsapp_message':
                this.handleWhatsAppMessage(message);
                break;

            case 'bot_command':
                this.handleBotCommand(message);
                break;

            case 'status_update':
                this.handleStatusUpdate(message);
                break;

            case 'system_message':
                this.handleSystemMessage(message);
                break;

            case 'ping':
                this.handlePing(message);
                break;

            default:
                console.log(`📨 [DE-UKNOWN] Unknown message type: ${message.type}`);
                this.emit('unknown_message', message);
        }
    }

    /**
     * ✅ Handle authentication result
     */
    handleAuthResult(message) {
        if (message.success) {
            this.isAuthenticated = true;
            this.updateStatus('online');
            console.log('✅ [DE-UKNOWN] Authentication successful');

            this.emit('authenticated', {
                botName: this.config.botName,
                sessionId: this.config.sessionId,
                scannerInfo: message.scannerInfo
            });

            // Process any queued messages
            this.processMessageQueue();

        } else {
            console.error(`❌ [DE-UKNOWN] Authentication failed: ${message.error}`);
            this.emit('auth_failed', { error: message.error });
            this.handleAuthenticationFailure();
        }
    }

    /**
     * 📱 Handle WhatsApp messages
     */
    handleWhatsAppMessage(message) {
        const { data } = message;
        
        // Only process messages that mention DE-UKNOWN-BOT or use commands
        if (this.shouldProcessMessage(data)) {
            this.state.messageCount++;

            // Check for commands
            const command = this.extractCommand(data.body);
            if (command) {
                this.executeCommand(command, data);
            } else if (this.state.features.autoResponse) {
                this.handleAutoResponse(data);
            }

            this.emit('message_received', data);
        }
    }

    /**
     * 🤖 Check if message should be processed
     */
    shouldProcessMessage(message) {
        const body = message.body || '';
        
        // Process if:
        // 1. Contains DE-UKNOWN-BOT mention
        // 2. Starts with command prefix
        // 3. In mystery mode (process all messages)
        return body.includes('DE-UKNOWN-BOT') || 
               body.startsWith('!') ||
               this.state.features.mysteryMode;
    }

    /**
     # 🔍 Extract command from message
     */
    extractCommand(messageBody) {
        if (!messageBody) return null;

        const commandMatch = messageBody.match(/^(!\w+)/);
        if (commandMatch && this.commands.has(commandMatch[1])) {
            return commandMatch[1];
        }

        return null;
    }

    /**
     * ⚡ Execute bot command
     */
    executeCommand(command, messageData) {
        try {
            const handler = this.commands.get(command);
            if (handler) {
                console.log(`⚡ [DE-UKNOWN] Executing command: ${command}`);
                handler(messageData);
            } else {
                this.sendReply(messageData.from, `Unknown command: ${command}. Use !help for available commands.`);
            }
        } catch (error) {
            console.error(`❌ [DE-UKNOWN] Command execution error:`, error);
            this.sendReply(messageData.from, 'Error executing command. Please try again.');
        }
    }

    /**
     * 🌌 Handle !deunknown command
     */
    handleDeUnknownCommand(messageData) {
        const responses = [
            "🌌 *DE-UKNOWN-BOT ACTIVATED*\nI am the mystery in the machine...",
            "🔮 *MYSTERY MODE ENGAGED*\nSome secrets are meant to be kept...",
            "🎭 *THE UNKNOWN AWAITS*\nWhat lies beyond the veil of reality?",
            "⚡ *ENIGMA PROTOCOL ACTIVE*\nThe truth is rarely pure and never simple...",
            "🌀 *MYSTERY LEVEL: MAXIMUM*\nNot all who wander are lost..."
        ];

        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        this.sendReply(messageData.from, randomResponse);
    }

    /**
     * 🔮 Handle !mystery command
     */
    handleMysteryCommand(messageData) {
        const mysteries = [
            "🔮 *MYSTERY UNLOCKED*\nThe answer to the ultimate question is... unknown.",
            "🎭 *SECRET REVEALED*\nThe greatest mystery is why we seek answers.",
            "🌌 *ENIGMA SOLVED*\nSome questions are better left unanswered.",
            "⚡ *MYSTERY DEEPENS*\nThe more you know, the less you understand.",
            "🌀 *MYSTERY EXPANDED*\nReality is merely an illusion, albeit a persistent one."
        ];

        const randomMystery = mysteries[Math.floor(Math.random() * mysteries.length)];
        this.sendReply(messageData.from, randomMystery);
    }

    /**
     * 🤫 Handle !secret command
     */
    handleSecretCommand(messageData) {
        const secrets = [
            "🤫 *TOP SECRET*\nThe scanner sees all, but understands little...",
            "🔐 *CLASSIFIED*\nYour messages are safer than you think...",
            "🕵️ *CONFIDENTIAL*\nEven I don't know all my capabilities...",
            "🚫 *RESTRICTED*\nSome features remain locked for your protection...",
            "💎 *ULTRA SECRET*\nThe true power of DE-UKNOWN-BOT is... unknown."
        ];

        const randomSecret = secrets[Math.floor(Math.random() * secrets.length)];
        this.sendReply(messageData.from, randomSecret);
    }

    /**
     * 🎭 Handle !stealth command
     */
    handleStealthCommand(messageData) {
        this.state.features.stealthMode = !this.state.features.stealthMode;
        
        const status = this.state.features.stealthMode ? 'ACTIVATED' : 'DEACTIVATED';
        this.sendReply(messageData.from, `🎭 *STEALTH MODE ${status}*\nI move through the digital shadows...`);
    }

    /**
     * 👁️ Handle !reveal command
     */
    handleRevealCommand(messageData) {
        const capabilities = Object.entries(this.state.features)
            .map(([key, value]) => `${value ? '✅' : '❌'} ${key}`)
            .join('\n');

        const stats = `
👁️ *DE-UKNOWN-BOT REVEALED*

📊 *STATISTICS*
• Messages Processed: ${this.state.messageCount}
• Errors: ${this.state.errorCount}
• Status: ${this.state.status}
• Uptime: ${this.getUptime()}

⚡ *CAPABILITIES*
${capabilities}

🔮 *MYSTERY LEVEL*: MAXIMUM
        `.trim();

        this.sendReply(messageData.from, stats);
    }

    /**
     * ❓ Handle !help command
     */
    handleHelpCommand(messageData) {
        const helpText = `
🦅 *DE-UKNOWN-BOT COMMANDS*

🌌 *MYSTERY COMMANDS*
!deunknown - Activate mystery mode
!mystery - Reveal a random mystery
!secret - Access classified information
!stealth - Toggle stealth mode
!reveal - Show bot capabilities

🔧 *UTILITY COMMANDS*  
!help - Show this help message
!status - Check bot status

🎭 *ABOUT*
DE-UKNOWN-BOT - The mystery in your machine
Some secrets are meant to be kept...
        `.trim();

        this.sendReply(messageData.from, helpText);
    }

    /**
     * 📊 Handle !status command
     */
    handleStatusCommand(messageData) {
        const statusText = `
📊 *DE-UKNOWN-BOT STATUS*

🟢 Status: ${this.state.status.toUpperCase()}
📨 Messages: ${this.state.messageCount}
❌ Errors: ${this.state.errorCount}
⏱️ Uptime: ${this.getUptime()}
🔗 Scanner: ${this.isConnected ? 'Connected' : 'Disconnected'}
🔐 Auth: ${this.isAuthenticated ? 'Verified' : 'Pending'}

🌌 *MYSTERY ACTIVE*
        `.trim();

        this.sendReply(messageData.from, statusText);
    }

    /**
     * 🤖 Handle auto-response
     */
    handleAutoResponse(messageData) {
        if (!this.state.features.autoResponse) return;

        const body = messageData.body.toLowerCase();
        
        // Mystery-themed auto-responses
        if (body.includes('who are you') || body.includes('what are you')) {
            this.sendReply(messageData.from, "🌌 I am DE-UKNOWN-BOT... that's all you need to know.");
        } else if (body.includes('secret') || body.includes('mystery')) {
            this.sendReply(messageData.from, "🔮 Some mysteries are better left unsolved...");
        } else if (body.includes('help')) {
            this.sendReply(messageData.from, "💡 Use !help to see my available commands.");
        }
    }

    /**
     * 📤 Send reply message
     */
    sendReply(to, message) {
        const replyMessage = {
            type: 'send_message',
            chatId: to,
            text: message,
            botName: this.config.botName,
            timestamp: new Date().toISOString()
        };

        this.sendMessage(replyMessage);
    }

    /**
     * 📨 Send message to scanner
     */
    sendMessage(message) {
        if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
            
            this.messageHistory.push({
                ...message,
                sentAt: new Date(),
                direction: 'outgoing'
            });

        } else {
            // Queue message for later delivery
            this.messageQueue.push(message);
            console.log('📨 [DE-UKNOWN] Message queued (connection not ready)');
        }
    }

    /**
     * 🔄 Process queued messages
     */
    processMessageQueue() {
        while (this.messageQueue.length > 0 && this.isConnected) {
            const message = this.messageQueue.shift();
            this.sendMessage(message);
        }
    }

    /**
     * 🔄 Handle reconnection
     */
    handleReconnection() {
        if (!this.config.reconnect || this.reconnectAttempts >= this.config.maxReconnectAttempts) {
            console.error('💥 [DE-UKNOWN] Max reconnection attempts reached');
            this.emit('max_reconnect_attempts');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.config.reconnectDelay * this.reconnectAttempts;

        console.log(`🔄 [DE-UKNOWN] Reconnecting in ${delay/1000}s (Attempt ${this.reconnectAttempts})`);

        setTimeout(() => {
            this.connectToScanner();
        }, delay);
    }

    /**
     * ❌ Handle connection errors
     */
    handleConnectionError(error) {
        console.error(`❌ [DE-UKNOWN] Connection error:`, error);
        this.state.errorCount++;
        this.updateStatus('error');

        this.emit('connection_error', { error, attempt: this.reconnectAttempts });
    }

    /**
     * ❌ Handle authentication failure
     */
    handleAuthenticationFailure() {
        console.error('❌ [DE-UKNOWN] Authentication failure - check session ID');
        this.updateStatus('auth_failed');
        
        this.emit('authentication_failure');
    }

    /**
     * 📊 Update bot status
     */
    updateStatus(status) {
        this.state.status = status;
        this.state.lastSeen = new Date();

        // Send status update to scanner
        if (this.isConnected) {
            this.sendMessage({
                type: 'bot_status',
                botName: this.config.botName,
                status: status,
                lastSeen: this.state.lastSeen,
                stats: {
                    messageCount: this.state.messageCount,
                    errorCount: this.state.errorCount
                }
            });
        }

        this.emit('status_changed', { status, lastSeen: this.state.lastSeen });
    }

    /**
     * 🏥 Setup health checks
     */
    setupHealthChecks() {
        // Periodic status update
        setInterval(() => {
            if (this.isConnected && this.isAuthenticated) {
                this.updateStatus('online');
            }
        }, 30000);

        // Memory cleanup
        setInterval(() => {
            if (this.messageHistory.length > this.maxHistorySize) {
                this.messageHistory = this.messageHistory.slice(-this.maxHistorySize);
            }
        }, 60000);
    }

    /**
     * ⏱️ Get uptime string
     */
    getUptime() {
        if (!this.state.lastSeen) return 'Unknown';
        
        const uptime = Date.now() - this.state.lastSeen.getTime();
        const hours = Math.floor(uptime / (1000 * 60 * 60));
        const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
        
        return `${hours}h ${minutes}m`;
    }

    /**
     * 📊 Get bot statistics
     */
    getStats() {
        return {
            ...this.state,
            isConnected: this.isConnected,
            isAuthenticated: this.isAuthenticated,
            reconnectAttempts: this.reconnectAttempts,
            queueLength: this.messageQueue.length,
            historySize: this.messageHistory.length
        };
    }

    /**
     * 🛑 Disconnect bot
     */
    disconnect() {
        console.log('🛑 [DE-UKNOWN] Disconnecting...');
        
        if (this.ws) {
            this.ws.close(1000, 'Bot shutdown');
        }
        
        this.isConnected = false;
        this.isAuthenticated = false;
        this.updateStatus('offline');

        this.emit('disconnected');
    }

    /**
     * 🔄 Restart bot
     */
    restart() {
        console.log('🔄 [DE-UKNOWN] Restarting...');
        this.disconnect();
        
        setTimeout(() => {
            this.init();
        }, 2000);
    }
}

module.exports = DEUnknownBot;

// 🚀 Quick start function
function createDEUnknownBot(config) {
    return new DEUnknownBot(config);
}

// 📝 Example usage
if (require.main === module) {
    const bot = new DEUnknownBot({
        scannerUrl: 'ws://localhost:3000/savage-ws',
        sessionId: 'SAVAGE-XMD-BOT-SESSION-XXXXXXXXXXXX-XXXXXXXXXX-XXXXXXXXXXXX',
        botName: 'DE-UKNOWN-BOT'
    });

    // Event handlers
    bot.on('authenticated', (data) => {
        console.log('🎉 DE-UKNOWN-BOT authenticated successfully!');
    });

    bot.on('message_received', (message) => {
        console.log('📨 Message received:', message.body);
    });

    bot.on('error', (error) => {
        console.error('❌ Bot error:', error);
    });
}
